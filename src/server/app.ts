import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { apiErrorHandler, apiNotFoundHandler, app as api } from "~/lib/hono";
import { signDevToken } from "~/lib/dev-auth";
import { env } from "~/lib/env";
import "~/routes/v1";

export const server = new Hono();

// Mount the v1 API. The sub-app already carries the "/api/v1" base path
// and its own middleware stack (context, auth, rate limiting, logging).
server.route("/", api);

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
    const returnTo =
      typeof form.returnTo === "string" &&
      form.returnTo.startsWith("/") &&
      !form.returnTo.startsWith("//")
        ? form.returnTo
        : "/app";
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

server.post("/api/auth/logout", (c) => {
  deleteCookie(c, "auth_token", { path: "/" });
  return c.redirect("/sign-in");
});

server.onError(apiErrorHandler);
server.notFound(apiNotFoundHandler);
