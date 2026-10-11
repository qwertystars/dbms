import { env } from "~/lib/env";
export function sameOrigin(c: any) {
  const origin = c.req.header("origin");
  return (
    (!origin ||
      origin === new URL(env.APP_BASE_URL).origin ||
      (env.AUTH_DEV_MODE === "true" && origin === "http://localhost:5173")) &&
    c.req.header("sec-fetch-site") !== "cross-site"
  );
}
