import { beforeAll, describe, expect, it } from "vitest";
import { db } from "~/lib/db";
import { authSessions } from "~/db/schema";
import { hashToken, randomToken } from "~/lib/crypto";
import { readSession, safeReturnTo, validateGoogleClaims } from "~/lib/google-auth";
import { setup } from "./setup";
beforeAll(setup);
describe("Google OAuth security", () => {
  it("rejects external, backslash and control-character redirects", () => {
    for (const path of ["//evil.test", "/\\evil.test", "https://evil.test", "/\nevil"])
      expect(safeReturnTo(path)).toBe("/app");
    expect(safeReturnTo("/invitations/123?x=1")).toBe("/invitations/123?x=1");
  });
  it("requires the nonce, subject and verified email", () => {
    const claims = { sub: "123", nonce: "nonce", email_verified: true };
    expect(() => validateGoogleClaims(claims, "nonce")).not.toThrow();
    expect(() => validateGoogleClaims(claims, "wrong")).toThrow();
    expect(() => validateGoogleClaims({ ...claims, sub: undefined }, "nonce")).toThrow();
    expect(() => validateGoogleClaims({ ...claims, email_verified: false }, "nonce")).toThrow();
  });
  it("accepts only live opaque sessions and rejects forgery and expiry", async () => {
    const token = randomToken();
    await db.insert(authSessions).values({
      tokenHash: await hashToken(token),
      subject: "google:123",
      displayName: "Jane",
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    });
    expect((await readSession(`banyan_session=${token}`, db))?.subject).toBe("google:123");
    expect(await readSession(`banyan_session=${randomToken()}`, db)).toBeUndefined();
    const expired = randomToken();
    await db.insert(authSessions).values({
      tokenHash: await hashToken(expired),
      subject: "google:expired",
      displayName: "Jane",
      expiresAt: 1,
    });
    expect(await readSession(`banyan_session=${expired}`, db)).toBeUndefined();
  });
  it("rejects a callback without browser-bound state", async () => {
    const { server } = await import("~/server/app");
    const res = await server.fetch(
      new Request("http://localhost:3000/api/auth/google/callback?state=forged&code=bad"),
    );
    expect(res.status).toBe(400);
  });
  it("revokes the session on logout and rejects cross-site logout", async () => {
    const { server } = await import("~/server/app");
    const token = randomToken();
    await db.insert(authSessions).values({
      tokenHash: await hashToken(token),
      subject: "google:logout",
      displayName: "Jane",
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    });
    const headers = { Cookie: `banyan_session=${token}`, Origin: "https://evil.test" };
    expect(
      (
        await server.fetch(
          new Request("http://localhost:3000/api/auth/logout", { method: "POST", headers }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await server.fetch(
          new Request("http://localhost:3000/api/auth/logout", {
            method: "POST",
            headers: { Cookie: headers.Cookie, Origin: "http://localhost:3000" },
          }),
        )
      ).status,
    ).toBe(302);
    expect(await readSession(headers.Cookie, db)).toBeUndefined();
  });
});
