import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const envSchema = z.object({
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  APP_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().default("http://localhost:3000")),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export function parseEnv(input: Record<string, unknown>) {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
export type Env = z.infer<typeof envSchema>;
