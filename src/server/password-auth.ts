import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { passwordLoginSchema, passwordRegisterSchema } from "~/lib/schemas";
import { sameOrigin } from "~/lib/request-security";
import { requestDb, cookieOptions } from "~/lib/google-auth";
import {
  createPasswordAccount,
  authenticatePassword,
  issuePasswordSession,
  limitPasswordAttempts,
} from "~/modules/accounts/credentials";

export const passwordAuth = new Hono();
passwordAuth.use("/api/auth/password/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!sameOrigin(c))
    return c.json({ error: { code: "FORBIDDEN", message: "Cross-site request rejected." } }, 403);
  await next();
});
passwordAuth.post(
  "/api/auth/password/register",
  zValidator("json", passwordRegisterSchema),
  async (c) => {
    const db = await requestDb(c),
      input = c.req.valid("json");
    await limitPasswordAttempts(db, c.req.header("cf-connecting-ip") ?? "local", input.username);
    const identity = await createPasswordAccount(db, input);
    const token = await issuePasswordSession(db, identity, getCookie(c, "banyan_session"));
    setCookie(c, "banyan_session", token, { ...cookieOptions(), maxAge: 7 * 86400 });
    return c.json({ ok: true }, 201);
  },
);
passwordAuth.post(
  "/api/auth/password/login",
  zValidator("json", passwordLoginSchema),
  async (c) => {
    const db = await requestDb(c),
      input = c.req.valid("json");
    await limitPasswordAttempts(db, c.req.header("cf-connecting-ip") ?? "local", input.username);
    const identity = await authenticatePassword(db, input.username, input.password);
    const token = await issuePasswordSession(db, identity, getCookie(c, "banyan_session"));
    setCookie(c, "banyan_session", token, { ...cookieOptions(), maxAge: 7 * 86400 });
    return c.json({ ok: true });
  },
);
