export interface ApiResult {
  status: number;
  body: any;
}

export async function api(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    // Network failure: report it like an API error so pages show a message
    // instead of hanging on their loading state.
    return {
      status: 0,
      body: { error: { message: "Could not reach the server. Check your connection." } },
    };
  }
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

export function errorMessage(result: ApiResult, fallback: string): string {
  return result.body?.error?.message || fallback;
}
