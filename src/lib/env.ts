import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const envSchema = z.object({
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  APP_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_JWKS_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
  AUTH_JWKS: z.preprocess(emptyToUndefined, z.string().optional()),
  AUTH_ISSUER: z.string().min(1).default("http://localhost:3000"),
  AUTH_AUDIENCE: z.string().min(1).default("family-social-network"),
  // "cloudflare-access": Cloudflare Access sits in front of the app, signs users in
  // (email one-time PIN) and forwards a signed token on every request.
  AUTH_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["oidc", "cloudflare-access"]).default("oidc"),
  ),
  // Development-only cookie sign-in. Must never be "true" in production.
  AUTH_DEV_MODE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
