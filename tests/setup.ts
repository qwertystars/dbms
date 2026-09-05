import { generateKeyPair, exportJWK } from "jose";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "~/lib/db";

let initialized = false;

export async function setup() {
  if (initialized) return;

  if (!(globalThis as any).__testPrivateKey) {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwkPublic = await exportJWK(publicKey);
    jwkPublic.kid = "test-key";
    jwkPublic.alg = "RS256";
    const jwks = JSON.stringify({ keys: [jwkPublic] });
    process.env.AUTH_JWKS = jwks;
    (globalThis as any).__testPrivateKey = privateKey;
  }

  await migrate(db, { migrationsFolder: "./db/migrations" });
  initialized = true;
}
