import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { nanoid } from "nanoid";
import { apiErrorHandler, apiNotFoundHandler, app as api } from "~/lib/hono";
import { accountCredentials, accounts } from "~/db/schema";
import { createDb } from "~/lib/db";
import { env } from "~/lib/env";
import { runWithContext } from "~/lib/context";
import { localObjectStore } from "~/lib/object-store";
import { createSession, login, passwordHash, revokeSession } from "~/lib/auth";
import { randomToken } from "~/lib/crypto";
import { AppError } from "~/lib/errors";
import "~/routes/v1";

export const server = new Hono();
const attempts = new Map<string, { count: number; expires: number }>();
server.route("/", api);

server.use("/api/auth/*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "Invalid origin." }, 403);
    }
  }
  if (c.req.path === "/api/auth/login" || c.req.path === "/api/auth/register") {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "anonymous";
    const key = `login:${ip}`;
    const limiter = (c.env as any)?.RATE_LIMITER;
    if (limiter) {
      if (!(await limiter.limit({ key })).success) {
        return c.json({ error: "Too many attempts. Try again later." }, 429);
      }
    } else {
      const now = Date.now();
      for (const [key, entry] of attempts) {
        if (entry.expires <= now) attempts.delete(key);
      }
      const entry = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
      attempts.set(key, entry);
      if (++entry.count > 20) {
        return c.json({ error: "Too many attempts. Try again later." }, 429);
      }
    }
  }
  const input = (c.env as any)?.DB ?? env.DATABASE_URL;
  if (!input) {
    throw new AppError("DATABASE_NOT_CONFIGURED", "No database connection is configured.", 500);
  }
  const ctx = {
    db: await createDb(input),
    requestId: crypto.randomUUID(),
    requestStart: performance.now(),
    objects: localObjectStore,
  };
  c.set("ctx", ctx);
  c.header("Cache-Control", "no-store");
  await runWithContext(ctx, next);
});

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(128),
});

for (const action of ["login", "register"] as const) {
  server.post(`/api/auth/${action}`, async (c) => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          error:
            "Use a username of 3–40 letters, numbers, underscores or hyphens and a password of 8–128 characters.",
        },
        400,
      );
    }
    const { username, password } = parsed.data;
    let token: string;
    if (action === "register") {
      const accountId = nanoid();
      const salt = randomToken();
      const hash = await passwordHash(password, salt);
      const db = c.get("ctx").db;
      try {
        await db.batch([
          db.insert(accounts).values({
            id: accountId,
            authSubject: `local:${nanoid()}`,
            displayName: username,
          }),
          db.insert(accountCredentials).values({
            accountId,
            username,
            passwordHash: hash,
            salt,
          }),
        ]);
      } catch (error) {
        if (String(error).includes("UNIQUE")) {
          return c.json({ error: "Username is already taken." }, 409);
        }
        throw error;
      }
      token = await createSession(accountId);
    } else {
      token = await login(username, password);
    }
    setCookie(c, "auth_token", token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      maxAge: 7 * 86400,
      path: "/",
    });
    return c.json({ ok: true }, action === "register" ? 201 : 200);
  });
}

server.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, "auth_token");
  if (token) await revokeSession(token);
  deleteCookie(c, "auth_token", { path: "/" });
  return c.redirect("/sign-in");
});
server.onError(apiErrorHandler);
server.notFound(apiNotFoundHandler);
