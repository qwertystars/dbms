import { Hono } from "hono";
import type { RequestContext } from "~/lib/context";
import { getOrCreateAccount } from "~/modules/accounts/service";
import { verifyAccessToken } from "~/lib/auth";
import { db } from "~/lib/db";
import { AppError, Errors } from "~/lib/errors";
import { log } from "~/lib/logger";
import { getRequestId } from "~/lib/context";

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
  c.set("ctx", {
    db,
    requestId,
    requestStart,
  });
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  await next();
});

function extractToken(c: any): string | undefined {
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
    try {
      const payload = await verifyAccessToken(token);
      const subject = payload.sub;
      if (!subject) throw new Error("Missing subject");
      const name = typeof payload.name === "string" ? payload.name : subject;
      const account = await getOrCreateAccount(subject, name);
      c.get("ctx").account = account;
    } catch (e) {
      // intentionally ignored; route handlers enforce auth
    }
  }
  await next();
});

app.use(async (c, next) => {
  const now = Date.now();
  const actor = c.get("ctx").account?.authSubject || c.req.header("x-forwarded-for") || "anonymous";
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

app.onError((err, c) => {
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
});

app.notFound((c) => {
  const ctx = c.get("ctx");
  return c.json(
    {
      error: { code: "NOT_FOUND", message: "Route not found.", requestId: ctx?.requestId },
    },
    404,
  );
});
