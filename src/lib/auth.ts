import { importJWK, jwtVerify, type JWK, type JWTPayload, type KeyLike } from "jose";
import { env } from "~/lib/env";

export interface AuthContext {
  accountId: string;
  authSubject: string;
  displayName: string;
}

let cachedJWKs: KeyLike[] | undefined;

export function setCachedJWKs(keys: KeyLike[]) {
  cachedJWKs = keys;
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  if (cachedJWKs) {
    for (const key of cachedJWKs) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: env.AUTH_ISSUER,
          audience: env.AUTH_AUDIENCE,
        });
        return payload;
      } catch (e) {
        // try next key
      }
    }
    throw new Error("No matching signing key");
  }

  const jwksUri = env.AUTH_JWKS_URI || process.env.AUTH_JWKS_URI;
  if (jwksUri) {
    const response = await fetch(jwksUri, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to fetch JWKS");
    const jwks = (await response.json()) as { keys: JWK[] };
    cachedJWKs = (await Promise.all(jwks.keys.map((jwk) => importJWK(jwk, "RS256")))) as KeyLike[];
    return verifyAccessToken(token);
  }

  const jwks = process.env.AUTH_JWKS || env.AUTH_JWKS;
  if (jwks) {
    const parsed = JSON.parse(jwks) as { keys: JWK[] };
    cachedJWKs = (await Promise.all(
      parsed.keys.map((jwk) => importJWK(jwk, "RS256")),
    )) as KeyLike[];
    return verifyAccessToken(token);
  }

  throw new Error("No JWKS configured");
}
