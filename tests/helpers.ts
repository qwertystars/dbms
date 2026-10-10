import { app } from "~/lib/hono";
import { createSession } from "~/lib/auth";
import { getOrCreateAccount } from "~/modules/accounts/service";
import "~/routes/v1";

export async function getTestToken(authSubject: string, displayName = "Test User") {
  const account = await getOrCreateAccount(authSubject, displayName);
  return createSession(account.id);
}

export async function apiRequest(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Cookie"] = `auth_token=${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const url = `http://localhost:3000${path}`;
  const response = await app.fetch(
    new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const responseBody = (await response.json().catch(() => ({}))) as any;
  return { status: response.status, body: responseBody, headers: response.headers };
}
