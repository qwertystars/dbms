import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { env } from "~/lib/env";
import { db } from "~/lib/db";
import { authSessions, oauthAttempts } from "~/db/schema";
import { server } from "~/server/app";
import { hashToken } from "~/lib/crypto";
import { setup } from "./setup";
vi.mock("jose", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jose")>()),
  jwtVerify: vi.fn(),
}));
beforeAll(setup);
const original = { ...env };
afterEach(() => {
  Object.assign(env, original);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function start() {
  env.AUTH_PROVIDER = "google";
  env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = "test-secret";
  const res = await server.fetch(
    new Request("http://localhost:3000/api/auth/google?returnTo=%2Fapp%2Ffamilies"),
  );
  expect(res.status).toBe(302);
  const url = new URL(res.headers.get("location")!);
  const state = url.searchParams.get("state")!;
  const [attempt] = await db
    .select()
    .from(oauthAttempts)
    .where(eq(oauthAttempts.stateHash, await hashToken(state)));
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  return { state, attempt };
}
function callback(state: string) {
  return server.fetch(
    new Request(`http://localhost:3000/api/auth/google/callback?code=code&state=${state}`, {
      headers: { Cookie: `banyan_oauth=${state}` },
    }),
  );
}
describe("Google authorization flow", () => {
  it("exchanges the code, checks identity, establishes a session and rejects replay", async () => {
    const { state, attempt } = await start();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id_token: "id-token" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "123", nonce: attempt.nonce, email_verified: true, name: "Jane" },
      protectedHeader: { alg: "RS256" },
    } as any);
    const res = await callback(state);
    expect(res.headers.get("location")).toBe("/app/families");
    const cookie = res.headers.get("set-cookie")!;
    const token = cookie.match(/banyan_session=([a-f0-9]+)/)![1];
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, await hashToken(token)));
    expect(session.subject).toBe("google:123");
    expect(session.tokenHash).not.toBe(token);
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("code_verifier")).toBe(attempt.verifier);
    expect(body.get("client_secret")).toBe("test-secret");
    expect(vi.mocked(jwtVerify).mock.calls[0][2]).toMatchObject({
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ["RS256"],
    });
    expect((await callback(state)).headers.get("location")).toBe("/sign-in?error=google");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not establish a session after an invalid identity", async () => {
    const { state } = await start();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id_token: "bad" }), { status: 200 })),
    );
    vi.mocked(jwtVerify).mockRejectedValue(new Error("Wrong signature or audience"));
    const res = await callback(state);
    expect(res.headers.get("location")).toBe("/sign-in?error=google");
    expect(res.headers.get("set-cookie")).not.toContain("banyan_session=");
  });
  it("returns a clear setup error without Google credentials", async () => {
    env.AUTH_PROVIDER = "google";
    env.GOOGLE_CLIENT_ID = undefined;
    env.GOOGLE_CLIENT_SECRET = undefined;
    expect((await server.fetch(new Request("http://localhost:3000/api/auth/google"))).status).toBe(
      503,
    );
  });
});
