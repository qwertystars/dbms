import { SignJWT, importJWK } from "jose";
import { app } from "~/lib/hono";
import "~/routes/v1";

export async function getTestToken(authSubject: string, displayName = "Test User") {
  const privateKey = (globalThis as any).__testPrivateKey;
  if (!privateKey) throw new Error("Test keys not initialized");
  return await new SignJWT({
    sub: authSubject,
    name: displayName,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("http://localhost:3000")
    .setAudience("family-social-network")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(privateKey);
}

export async function apiRequest(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const url = `http://localhost:3000${path}`;
  const response = await app.fetch(
    new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const responseBody = await response.json().catch(() => ({}));
  return { status: response.status, body: responseBody, headers: response.headers };
}
