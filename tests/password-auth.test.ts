import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { server } from "~/server/app";
import { db } from "~/lib/db";
import { accountCredentials, authSessions, loginAttempts, auditEvents } from "~/db/schema";
import { getOrCreateAccount } from "~/modules/accounts/service";
import { issuePasswordSession } from "~/modules/accounts/credentials";
import { hashPassword, verifyPassword } from "~/modules/accounts/passwords";
import { randomToken, hashToken } from "~/lib/crypto";
import { setup } from "./setup";
import "~/routes/v1";
beforeAll(setup);
beforeEach(async () => {
  await db.delete(loginAttempts);
});
let sequence = 0;
function username() {
  return `password_test_${Date.now()}_${++sequence}`;
}
async function request(
  path: string,
  body?: unknown,
  cookie?: string,
  method = "POST",
  origin = "http://localhost:3000",
) {
  return server.fetch(
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
function cookie(res: Response) {
  return `banyan_session=${res.headers.get("set-cookie")?.match(/banyan_session=([a-f0-9]+)/)?.[1]}`;
}
async function register() {
  const user = username();
  const res = await request("/api/auth/password/register", {
    username: user,
    password: "Correct horse battery staple",
    displayName: "Test User",
  });
  expect(res.status).toBe(201);
  return { user, cookie: cookie(res) };
}
async function googleSession(recent = true) {
  const account = await getOrCreateAccount(`google:${randomToken()}`, "Google User");
  const token = randomToken();
  await db.insert(authSessions).values({
    tokenHash: await hashToken(token),
    subject: account.authSubject,
    displayName: account.displayName,
    createdAt: Math.floor(Date.now() / 1000) - (recent ? 0 : 3600),
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });
  return { account, cookie: `banyan_session=${token}` };
}
describe("Username and password authentication", () => {
  it("salts passwords, checks full Unicode input and rejects wrong passwords", async () => {
    const first = await hashPassword("very long secure password 🔐"),
      second = await hashPassword("very long secure password 🔐");
    expect(first).not.toBe(second);
    expect(first).not.toContain("very long");
    expect(await verifyPassword("very long secure password 🔐", first)).toBe(true);
    expect(await verifyPassword("wrong", first)).toBe(false);
  });
  it("registers and logs into the same account with normalized usernames", async () => {
    const registered = await register();
    const me = await request("/api/v1/me", undefined, registered.cookie, "GET");
    expect(me.status).toBe(200);
    const account = (await me.json()) as any;
    const login = await request("/api/auth/password/login", {
      username: registered.user.toUpperCase(),
      password: "Correct horse battery staple",
    });
    expect(login.status).toBe(200);
    expect(
      ((await (await request("/api/v1/me", undefined, cookie(login), "GET")).json()) as any).id,
    ).toBe(account.id);
  });
  it("uses the same generic error for unknown usernames and wrong passwords", async () => {
    const registered = await register();
    const wrong = await request("/api/auth/password/login", {
        username: registered.user,
        password: "wrong",
      }),
      unknown = await request("/api/auth/password/login", {
        username: username(),
        password: "wrong",
      });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIALS", message: "Incorrect username or password." },
    });
    expect(await unknown.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIALS", message: "Incorrect username or password." },
    });
  });
  it("rejects weak passwords and duplicate usernames", async () => {
    expect(
      (
        await request("/api/auth/password/register", {
          username: username(),
          password: "short",
          displayName: "Test",
        })
      ).status,
    ).toBe(400);
    const registered = await register();
    expect(
      (
        await request("/api/auth/password/register", {
          username: registered.user.toUpperCase(),
          password: "Long enough password",
          displayName: "Test",
        })
      ).status,
    ).toBe(409);
  });
  it("adds credentials to a Google account without creating another identity", async () => {
    const google = await googleSession(),
      user = username();
    const family = await request(
      "/api/v1/families",
      { name: "Google family before credentials" },
      google.cookie,
    );
    expect(family.status).toBe(201);
    const familyId = ((await family.json()) as any).family.id;
    const res = await request(
      "/api/v1/me/credentials",
      { username: user, password: "A new Google password!" },
      google.cookie,
      "PUT",
    );
    expect(res.status).toBe(200);
    expect((await request("/api/v1/me", undefined, google.cookie, "GET")).status).toBe(401);
    const login = await request("/api/auth/password/login", {
      username: user,
      password: "A new Google password!",
    });
    expect(login.status).toBe(200);
    const me = await request("/api/v1/me", undefined, cookie(login), "GET");
    expect(((await me.json()) as any).id).toBe(google.account.id);
    expect(
      (await request(`/api/v1/families/${familyId}`, undefined, cookie(login), "GET")).status,
    ).toBe(200);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorAccountId, google.account.id));
    expect(audit.some((a) => a.action === "PASSWORD_ADDED")).toBe(true);
  });
  it("requires sign-in and a recent Google session for initial setup", async () => {
    const input = { username: username(), password: "A strong test password" };
    expect((await request("/api/v1/me/credentials", input, undefined, "PUT")).status).toBe(401);
    const google = await googleSession(false);
    expect((await request("/api/v1/me/credentials", input, google.cookie, "PUT")).status).toBe(403);
  });
  it("requires the current password and revokes old sessions on change", async () => {
    const registered = await register(),
      input = { username: registered.user, password: "A changed strong password" };
    expect(
      (
        await request(
          "/api/v1/me/credentials",
          { ...input, currentPassword: "wrong" },
          registered.cookie,
          "PUT",
        )
      ).status,
    ).toBe(403);
    const changed = await request(
      "/api/v1/me/credentials",
      { ...input, currentPassword: "Correct horse battery staple" },
      registered.cookie,
      "PUT",
    );
    expect(changed.status).toBe(200);
    expect((await request("/api/v1/me", undefined, registered.cookie, "GET")).status).toBe(401);
    expect((await request("/api/v1/me", undefined, cookie(changed), "GET")).status).toBe(200);
    expect(
      (
        await request("/api/auth/password/login", {
          username: registered.user,
          password: "Correct horse battery staple",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/api/auth/password/login", {
          username: registered.user,
          password: input.password,
        })
      ).status,
    ).toBe(200);
  });
  it("rejects a raced login carrying an obsolete credential version", async () => {
    const google = await googleSession(),
      user = username();
    await request(
      "/api/v1/me/credentials",
      { username: user, password: "A secure linked password" },
      google.cookie,
      "PUT",
    );
    const staleToken = await issuePasswordSession(db, {
      subject: google.account.authSubject,
      displayName: "Google User",
      version: 0,
    });
    expect(
      (await request("/api/v1/me", undefined, `banyan_session=${staleToken}`, "GET")).status,
    ).toBe(401);
  });
  it("rejects cross-site register, login and credential writes", async () => {
    const input = { username: username(), password: "Long enough password", displayName: "Test" };
    for (const path of ["/api/auth/password/register", "/api/auth/password/login"])
      expect((await request(path, input, undefined, "POST", "https://evil.test")).status).toBe(403);
    const registered = await register();
    expect(
      (
        await request(
          "/api/v1/me/credentials",
          input,
          registered.cookie,
          "PUT",
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
  });
  it("rate limits repeated attempts across requests", async () => {
    const user = username();
    await db.insert(loginAttempts).values({
      key: await hashToken(`user:${user}`),
      count: 15,
      expiresAt: Math.floor(Date.now() / 1000) + 900,
    });
    expect(
      (await request("/api/auth/password/login", { username: user, password: "wrong" })).status,
    ).toBe(429);
  });
  it("does not expose password hashes through account settings", async () => {
    const registered = await register();
    const res = await request("/api/v1/me/credentials", undefined, registered.cookie, "GET");
    expect(await res.json()).toEqual({ username: registered.user, hasPassword: true });
    const [stored] = await db
      .select()
      .from(accountCredentials)
      .where(eq(accountCredentials.username, registered.user));
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
  });
  it("does not let another account claim an existing username", async () => {
    const registered = await register(),
      google = await googleSession();
    const result = await request(
      "/api/v1/me/credentials",
      { username: registered.user, password: "An attacker password!" },
      google.cookie,
      "PUT",
    );
    expect(result.status).toBe(409);
    const after = await request("/api/v1/me/credentials", undefined, google.cookie, "GET");
    expect(await after.json()).toEqual({ username: null, hasPassword: false });
  });
  it("commits exactly one of two concurrent password changes", async () => {
    const registered = await register();
    const attempts = await Promise.all(
      ["First replacement password", "Second replacement password"].map((password) =>
        request(
          "/api/v1/me/credentials",
          { username: registered.user, currentPassword: "Correct horse battery staple", password },
          registered.cookie,
          "PUT",
        ),
      ),
    );
    expect(attempts.filter((r) => r.status === 200)).toHaveLength(1);
    expect(attempts.every((r) => [200, 403, 409].includes(r.status))).toBe(true);
    const [row] = await db
      .select()
      .from(accountCredentials)
      .where(eq(accountCredentials.username, registered.user));
    expect(row.version).toBe(2);
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorAccountId, row.accountId));
    expect(events.filter((e) => e.action === "PASSWORD_CHANGED")).toHaveLength(1);
  });
});
