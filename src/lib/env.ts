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
  // Development-only cookie sign-in. Must never be "true" in production.
  AUTH_DEV_MODE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),
  OBJECT_STORAGE_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OBJECT_STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().optional()),
  OBJECT_STORAGE_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OBJECT_STORAGE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OBJECT_STORAGE_REGION: z.preprocess(emptyToUndefined, z.string().optional()),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
