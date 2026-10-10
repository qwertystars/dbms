import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { server } from "~/server/app";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { accounts, accountSessions } from "~/db/schema";
import { setup } from "./setup";

beforeAll(setup);
beforeEach(async () => {
  for (const table of [
    schema.postMedia,
    schema.reactions,
    schema.comments,
    schema.posts,
    schema.parentChildRelationships,
    schema.people,
    schema.familyInvitations,
    schema.familyMemberships,
    schema.auditEvents,
    schema.friendships,
    schema.friendRequests,
    schema.mediaAssets,
    schema.families,
    schema.accounts,
  ]) {
    await db.run(sql`DELETE FROM ${table}`);
  }
});

async function request(path: string, body?: unknown, cookie?: string, origin?: string) {
  return server.fetch(new Request(`http://localhost:3000${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": crypto.randomUUID(), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
const credentials = { username: "family_user", password: "correct-password" };
function cookie(response: Response) { return response.headers.get("set-cookie")!.split(";")[0]; }

describe("Username and password sign-in", () => {
  it("creates an account, logs in without a provider, and revokes logout sessions", async () => {
    const registered = await request("/api/auth/register", credentials);
    expect(registered.status).toBe(201);
    expect(registered.headers.get("set-cookie")).toContain("HttpOnly");
    expect(registered.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect((await request("/api/v1/me", undefined, cookie(registered))).status).toBe(200);
    const loggedIn = await request("/api/auth/login", { ...credentials, username: "FAMILY_USER" });
    expect(loggedIn.status).toBe(200);
    const session = cookie(loggedIn);
    const logout = await request("/api/auth/logout", {}, session);
    expect(logout.status).toBe(302);
    expect(logout.headers.get("location")).toBe("/sign-in");
    expect((await request("/api/v1/me", undefined, session)).status).toBe(401);
  });

  it("rejects wrong passwords, unknown users, and duplicate usernames", async () => {
    await request("/api/auth/register", credentials);
    expect((await request("/api/auth/register", { ...credentials, username: "FAMILY_USER" })).status).toBe(409);
    for (const input of [{ ...credentials, password: "incorrect-password" }, { ...credentials, username: "unknown" }]) {
      const response = await request("/api/auth/login", input);
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect((await response.json() as any).error.message).toBe("Invalid username or password.");
    }
  });

  it("does not create accounts from external headers or accept forged or expired sessions", async () => {
    const registered = await request("/api/auth/register", credentials);
    const session = cookie(registered);
    await db.update(accountSessions).set({ expiresAt: new Date(0) }).where(eq(accountSessions.accountId, (await db.select().from(accounts))[0].id));
    expect((await request("/api/v1/me", undefined, session)).status).toBe(401);
    expect((await request("/api/v1/me", undefined, "auth_token=forged")).status).toBe(401);
    const external = await server.fetch(new Request("http://localhost:3000/api/v1/me", { headers: { Authorization: "Bearer fake", "Cf-Access-Jwt-Assertion": "fake" } }));
    expect(external.status).toBe(401);
    expect(await db.select().from(accounts)).toHaveLength(1);
  });

  it("validates credentials and rejects cross-origin login", async () => {
    expect((await request("/api/auth/register", { username: "x", password: "short" })).status).toBe(400);
    expect((await request("/api/auth/login", credentials, undefined, "https://other.example")).status).toBe(403);
  });

  it("sets Secure on HTTPS cookies and applies the edge limiter to login", async () => {
    const secure = await server.fetch(new Request("https://example.com/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": crypto.randomUUID() }, body: JSON.stringify(credentials) }));
    expect(secure.status).toBe(201);
    expect(secure.headers.get("set-cookie")).toContain("Secure");
    const limited = await server.fetch(new Request("http://localhost:3000/api/auth/login", { method: "POST", body: JSON.stringify(credentials) }), { RATE_LIMITER: { limit: async () => ({ success: false }) } });
    expect(limited.status).toBe(429);
  });
});
