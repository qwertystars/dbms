import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { and, eq, gt, lte } from "drizzle-orm";
import { authSessions, oauthAttempts } from "~/db/schema";
import { createDb, type DB } from "~/lib/db";
import { env } from "~/lib/env";
import { getCredentialVersion } from "~/modules/accounts/credentials";
import { getOrCreateAccount } from "~/modules/accounts/service";
import { hashToken, randomToken } from "~/lib/crypto";
import { appOrigin, sameOrigin } from "~/lib/request-security";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const now = () => Math.floor(Date.now() / 1000);
export function safeReturnTo(path: string | undefined): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    Array.from(path).some((char) => char.charCodeAt(0) <= 32)
  )
    return "/app";
  return path;
}
export function validateGoogleClaims(payload: JWTPayload, nonce: string) {
  if (!payload.sub || payload.nonce !== nonce || payload.email_verified !== true) {
    throw new Error("Invalid Google identity");
  }
}
export async function readSession(cookies: string, db: DB) {
  const token = cookies.match(/(?:^|;\s*)banyan_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return undefined;
  const [session] = await db
    .select()
    .from(authSessions)
    .where(
      and(eq(authSessions.tokenHash, await hashToken(token)), gt(authSessions.expiresAt, now())),
    );
  if (!session) return undefined;
  if (session.credentialVersion !== (await getCredentialVersion(db, session.subject)))
    return undefined;
  return session;
}
export const googleAuth = new Hono();
export async function requestDb(c: any) {
  const input = c.env?.DB ?? env.DATABASE_URL;
  if (!input) throw new Error("Database not configured");
  return createDb(input);
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: new URL(env.APP_BASE_URL).protocol === "https:",
  sameSite: "Lax" as const,
  path: "/",
});
function configured() {
  return (
    env.AUTH_PROVIDER === "google" && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  );
}

googleAuth.get("/api/auth/google", async (c) => {
  if (!configured()) return c.json({ error: "Google sign-in is not configured" }, 503);
  const db = await requestDb(c);
  const state = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await db.batch([
    db.delete(oauthAttempts).where(lte(oauthAttempts.expiresAt, now())),
    db.delete(authSessions).where(lte(authSessions.expiresAt, now())),
    db.insert(oauthAttempts).values({
      stateHash: await hashToken(state),
      nonce,
      verifier,
      returnTo: safeReturnTo(c.req.query("returnTo")),
      expiresAt: now() + 600,
    }),
  ]);
  setCookie(c, "banyan_oauth", state, { ...cookieOptions(), maxAge: 600 });
  c.header("Cache-Control", "no-store");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${appOrigin(c)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return c.redirect(url.toString());
});

googleAuth.get("/api/auth/google/callback", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  const state = c.req.query("state"),
    cookie = getCookie(c, "banyan_oauth");
  deleteCookie(c, "banyan_oauth", cookieOptions());
  if (!configured() || !state || state !== cookie)
    return c.json({ error: "Invalid OAuth state" }, 400);
  const db = await requestDb(c);
  // DELETE RETURNING atomically consumes the attempt, including across isolates.
  const [attempt] = await db
    .delete(oauthAttempts)
    .where(
      and(eq(oauthAttempts.stateHash, await hashToken(state)), gt(oauthAttempts.expiresAt, now())),
    )
    .returning();
  if (!attempt || !c.req.query("code") || c.req.query("error"))
    return c.redirect("/sign-in?error=google");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: c.req.query("code")!,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appOrigin(c)}/api/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: attempt.verifier,
      }),
    });
    if (!response.ok) throw new Error("Google token exchange failed");
    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) throw new Error("Missing ID token");
    const { payload } = await jwtVerify(tokens.id_token, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub"],
    });
    validateGoogleClaims(payload, attempt.nonce);
    const account = await getOrCreateAccount(
      `google:${payload.sub}`,
      typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Member",
      db,
    );
    const credentialVersion = await getCredentialVersion(db, account.authSubject);
    const token = randomToken();
    const oldToken = getCookie(c, "banyan_session");
    if (oldToken)
      await db.delete(authSessions).where(eq(authSessions.tokenHash, await hashToken(oldToken)));
    await db.insert(authSessions).values({
      tokenHash: await hashToken(token),
      subject: account.authSubject,
      credentialVersion,
      createdAt: now(),
      displayName:
        typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Member",
      expiresAt: now() + 7 * 86400,
    });
    setCookie(c, "banyan_session", token, { ...cookieOptions(), maxAge: 7 * 86400 });
    return c.redirect(attempt.returnTo);
  } catch {
    return c.redirect("/sign-in?error=google");
  }
});

googleAuth.post("/api/auth/logout", async (c) => {
  if (!sameOrigin(c)) return c.json({ error: "Cross-site logout rejected" }, 403);
  const token = getCookie(c, "banyan_session");
  if (token) {
    const db = await requestDb(c);
    await db.delete(authSessions).where(eq(authSessions.tokenHash, await hashToken(token)));
  }
  deleteCookie(c, "banyan_session", cookieOptions());
  deleteCookie(c, "auth_token", { path: "/" });
  return c.redirect("/sign-in");
});
