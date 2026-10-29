import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { env } from "~/lib/env";
import { server } from "~/server/app";
import { setup } from "./setup";

beforeAll(setup);
const original = { ...env };
afterEach(() => {
  Object.assign(env, original);
});
function useCustomDomain() {
  env.APP_ALLOWED_ORIGINS = "https://banyan.example.test, https://other.example.test";
  env.AUTH_PROVIDER = "google";
  env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = "test-secret";
}
function register(origin: string) {
  return server.fetch(
    new Request("https://banyan.example.test/api/auth/password/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        username: `custom_domain_${Date.now()}`,
        password: "Correct horse battery staple",
        displayName: "Domain User",
      }),
    }),
  );
}
async function googleRedirectUri(url: string) {
  const res = await server.fetch(new Request(url));
  expect(res.status).toBe(302);
  return new URL(res.headers.get("location")!).searchParams.get("redirect_uri");
}
describe("Additional allowed origins", () => {
  it("accepts mutations from an allowed custom domain", async () => {
    useCustomDomain();
    expect((await register("https://banyan.example.test")).status).toBe(201);
  });
  it("still rejects mutations from origins outside the allowed list", async () => {
    useCustomDomain();
    expect((await register("https://evil.test")).status).toBe(403);
    env.APP_ALLOWED_ORIGINS = undefined;
    expect((await register("https://banyan.example.test")).status).toBe(403);
  });
  it("returns Google sign-in to the allowed domain the user started on", async () => {
    useCustomDomain();
    expect(await googleRedirectUri("https://banyan.example.test/api/auth/google")).toBe(
      "https://banyan.example.test/api/auth/google/callback",
    );
    expect(await googleRedirectUri("http://localhost:3000/api/auth/google")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });
  it("falls back to APP_BASE_URL for Google sign-in on unknown hosts", async () => {
    useCustomDomain();
    expect(await googleRedirectUri("https://evil.test/api/auth/google")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });
});
