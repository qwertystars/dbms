import { Hono } from "hono";
import type { RequestContext } from "~/lib/context";
import { getOrCreateAccount } from "~/modules/accounts/service";
import { displayNameFromClaims, verifyAccessToken } from "~/lib/auth";
import { localObjectStore, type ObjectStore } from "~/lib/object-store";
import { createDb } from "~/lib/db";
import { env } from "~/lib/env";
import type { D1Database } from "@cloudflare/workers-types";
import { AppError, Errors } from "~/lib/errors";
import { log } from "~/lib/logger";
import { getRequestId, runWithContext } from "~/lib/context";

// Cloudflare's Workers rate limiting binding (RATE_LIMITER in wrangler.jsonc).
// Its counters are shared across isolates in a location, unlike the in-memory
// fallback used by the Node server and tests.
interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitWindow>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;

declare module "hono" {
  interface ContextVariableMap {
    ctx: RequestContext;
  }
}

export const app = new Hono().basePath("/api/v1");

app.use(async (c, next) => {
  const requestId = crypto.randomUUID();
  const requestStart = performance.now();
  const d1 = (c.env as any)?.DB as D1Database | undefined;
  const connectionString = env.DATABASE_URL;
  const dbInput = d1 ?? connectionString;
  if (!dbInput) {
    return c.json(
      {
        error: {
          code: "DATABASE_NOT_CONFIGURED",
          message: "No database connection is configured.",
        },
      },
      500,
    );
  }
  const requestDb = await createDb(dbInput as any);
  const objects = ((c.env as any)?.MEDIA_BUCKET as ObjectStore | undefined) ?? localObjectStore;
  const ctx: RequestContext = { db: requestDb, requestId, requestStart, objects };
  c.set("ctx", ctx);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  await runWithContext(ctx, next);
});

// jose errors carry a stable code and, for claim failures, the claim name. Neither
// reveals anything about the keys, so both are safe to return to the caller.
function describeTokenError(e: unknown): string {
  const err = e as { code?: string; claim?: string; message?: string };
  if (err?.code) return err.claim ? `${err.code}: ${err.claim}` : err.code;
  return err?.message || "unknown error";
}

function extractToken(c: any): string | undefined {
  // Cloudflare Access puts its signed identity token on every request it lets through.
  const accessToken = c.req.header("cf-access-jwt-assertion");
  if (accessToken) return accessToken;
  const authHeader = c.req.header("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookieHeader = c.req.header("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return undefined;
}

app.use(async (c, next) => {
  const token = extractToken(c);
  if (token) {
    const ctx = c.get("ctx");
    let payload: Awaited<ReturnType<typeof verifyAccessToken>> | undefined;
    try {
      payload = await verifyAccessToken(token);
      if (!payload.sub) throw new Error("Missing subject");
    } catch (e) {
      // Route handlers enforce auth; record why so the 401 and the logs say so.
      payload = undefined;
      ctx.authError = describeTokenError(e);
      log({
        level: "warn",
        requestId: ctx.requestId,
        route: c.req.path,
        method: c.req.method,
        errorCode: "INVALID_TOKEN",
        message: `Token rejected: ${ctx.authError}`,
      });
    }
    if (payload) {
      try {
        ctx.account = await getOrCreateAccount(payload.sub!, displayNameFromClaims(payload));
      } catch (e) {
        // A valid token whose account cannot be loaded is a server fault (for example
        // migrations not applied), not a sign-in problem. Reporting it as 401 would
        // send the browser back to the sign-in page in a loop.
        log({
          level: "error",
          requestId: ctx.requestId,
          route: c.req.path,
          method: c.req.method,
          errorCode: "ACCOUNT_UNAVAILABLE",
          message: e instanceof Error ? e.message : String(e),
        });
        throw Errors.ACCOUNT_UNAVAILABLE();
      }
    }
  }
  await next();
});

app.use(async (c, next) => {
  const actor =
    c.get("ctx").account?.authSubject ||
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for") ||
    "anonymous";
  const limiter = (c.env as any)?.RATE_LIMITER as RateLimiterBinding | undefined;
  if (limiter) {
    const { success } = await limiter.limit({ key: actor });
    if (!success) {
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }, 429);
    }
    return next();
  }

  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const key = `${actor}:${windowStart}`;

  for (const [k, v] of Array.from(rateLimits.entries())) {
    if (v.resetAt <= now) rateLimits.delete(k);
  }

  const entry = rateLimits.get(key) || { count: 0, resetAt: windowStart + RATE_LIMIT_WINDOW_MS };
  if (entry.count >= RATE_LIMIT_MAX) {
    return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }, 429);
  }
  entry.count++;
  rateLimits.set(key, entry);
  await next();
});

app.use(async (c, next) => {
  await next();
  const ctx = c.get("ctx");
  const duration = Math.round(performance.now() - ctx.requestStart);
  log({
    level: "info",
    requestId: ctx.requestId,
    route: c.req.path,
    method: c.req.method,
    status: c.res.status,
    durationMs: duration,
    accountId: ctx.account?.id,
    message: "request complete",
  });
});

export function apiErrorHandler(err: Error, c: any) {
  const ctx = c.get("ctx");
  const requestId = ctx?.requestId ?? getRequestId();
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";
  const message = err instanceof AppError ? err.message : "Internal server error.";

  if (!(err instanceof AppError)) {
    log({
      level: "error",
      requestId,
      route: c.req.path,
      method: c.req.method,
      status,
      errorCode: code,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }

  return c.json({ error: { code, message, requestId } }, status as any);
}

export function apiNotFoundHandler(c: any) {
  const ctx = c.get("ctx");
  return c.json(
    {
      error: { code: "NOT_FOUND", message: "Route not found.", requestId: ctx?.requestId },
    },
    404,
  );
}

app.onError(apiErrorHandler);

app.notFound(apiNotFoundHandler);
