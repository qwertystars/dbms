import { cookies } from "next/headers";
import { app } from "~/lib/hono";
import "~/routes/v1";

export async function serverApi(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) {
  const cookieStore = cookies();
  const token = cookieStore.get("auth_token")?.value;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const url = new URL(path, baseUrl).toString();
  const response = await app.fetch(
    new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  if (!response.ok) {
    console.error("serverApi error", method, path, response.status);
  }
  const responseBody = await response.json().catch(() => ({}));
  return { status: response.status, body: responseBody };
}
