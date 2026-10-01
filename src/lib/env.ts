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
  // "clerk": Clerk signs people in; the issuer and JWKS come from CLERK_PUBLISHABLE_KEY.
  AUTH_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["oidc", "clerk"]).default("oidc")),
  // Comma-separated origins accepted in a token's azp claim. For Clerk it
  // defaults to the origin of APP_BASE_URL.
  AUTH_AUTHORIZED_PARTIES: z.preprocess(emptyToUndefined, z.string().optional()),
  // Public; the browser loads Clerk with it (served by GET /api/auth/config).
  CLERK_PUBLISHABLE_KEY: z.preprocess(emptyToUndefined, z.string().startsWith("pk_").optional()),
  // Secret; used only to look up a new account's name through Clerk's Backend API.
  CLERK_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().startsWith("sk_").optional()),
  // Development-only cookie sign-in. Must never be "true" in production.
  AUTH_DEV_MODE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
