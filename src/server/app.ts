import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { apiErrorHandler, apiNotFoundHandler, app as api } from "~/lib/hono";
import { signDevToken } from "~/lib/dev-auth";
import { env } from "~/lib/env";
import "~/routes/v1";
import { authConfigSchema } from "~/lib/schemas";
import { googleAuth, safeReturnTo } from "~/lib/google-auth";

export const server = new Hono();

// Mount the v1 API. The sub-app already carries the "/api/v1" base path
// and its own middleware stack (context, auth, rate limiting, logging).
server.route("/", api);
server.route("/", googleAuth);

// Development-only cookie sign-in. It is mounted only when AUTH_DEV_MODE is
// explicitly "true" (pnpm dev:api sets it), so production Workers builds never
// expose a route that can mint trusted tokens.
if (env.AUTH_DEV_MODE === "true") {
  server.post("/api/auth/login", async (c) => {
    const form = await c.req.parseBody();
    const subject = typeof form.subject === "string" ? form.subject.trim() : "";
    const displayName =
      typeof form.displayName === "string" && form.displayName.trim() !== ""
        ? form.displayName.trim()
        : subject;
    if (!subject) {
      return c.json({ error: "Subject is required" }, 400);
    }
    const returnTo = safeReturnTo(typeof form.returnTo === "string" ? form.returnTo : undefined);
    const token = await signDevToken(subject, displayName);
    setCookie(c, "auth_token", token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      maxAge: 7200,
      path: "/",
    });
    return c.redirect(returnTo);
  });
}

// Tells the sign-in page which flow to show.
server.get("/api/auth/config", (c) =>
  c.json(
    authConfigSchema.parse({
      provider: env.AUTH_PROVIDER,
      devSignIn: env.AUTH_DEV_MODE === "true",
      googleSignIn:
        env.AUTH_PROVIDER === "google" && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    }),
  ),
);

server.onError(apiErrorHandler);
server.notFound(apiNotFoundHandler);
