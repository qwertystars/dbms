import { env } from "~/lib/env";

// The canonical APP_BASE_URL origin plus any extra hostnames serving the same app.
export function allowedOrigins() {
  return [
    new URL(env.APP_BASE_URL).origin,
    ...(env.APP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new URL(value).origin),
  ];
}
// The origin this request arrived on when it is allowed, else the canonical one.
export function appOrigin(c: any) {
  const origin = new URL(c.req.url).origin;
  return allowedOrigins().includes(origin) ? origin : new URL(env.APP_BASE_URL).origin;
}
export function sameOrigin(c: any) {
  const origin = c.req.header("origin");
  return (
    (!origin ||
      allowedOrigins().includes(origin) ||
      (env.AUTH_DEV_MODE === "true" && origin === "http://localhost:5173")) &&
    c.req.header("sec-fetch-site") !== "cross-site"
  );
}
