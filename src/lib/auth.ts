import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type KeyLike,
} from "jose";
import { env } from "~/lib/env";

export interface AuthContext {
  accountId: string;
  authSubject: string;
  displayName: string;
}

type KeyResolver = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

// Keys registered by the development sign-in (src/lib/dev-auth.ts).
let devKeys: KeyLike[] | undefined;
let resolver: KeyResolver | undefined;

export function setCachedJWKs(keys: KeyLike[]) {
  devKeys = keys;
}

// A remote JWKS (for example Cloudflare Access's /cdn-cgi/access/certs) is cached
// by jose and refetched when a token carries an unknown `kid` or the cache ages
// out, so provider key rotation does not need a restart.
function getResolver(): KeyResolver | undefined {
  if (resolver) return resolver;
  const jwksUri = env.AUTH_JWKS_URI || process.env.AUTH_JWKS_URI;
  if (jwksUri) {
    resolver = createRemoteJWKSet(new URL(jwksUri), { cacheMaxAge: 10 * 60_000 });
    return resolver;
  }
  const jwks = process.env.AUTH_JWKS || env.AUTH_JWKS;
  if (jwks) {
    resolver = createLocalJWKSet(JSON.parse(jwks) as JSONWebKeySet);
    return resolver;
  }
  return undefined;
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const options = {
    issuer: env.AUTH_ISSUER,
    audience: env.AUTH_AUDIENCE,
    algorithms: ["RS256"],
  };

  if (devKeys) {
    for (const key of devKeys) {
      try {
        const { payload } = await jwtVerify(token, key, options);
        return payload;
      } catch {
        // try the next key, then the configured provider
      }
    }
  }

  const keys = getResolver();
  if (!keys) throw new Error("No JWKS configured");
  const { payload } = await jwtVerify(token, keys, options);
  return payload;
}

// Display name for a newly provisioned account. Cloudflare Access tokens carry
// an email but no name, so fall back to the email's local part rather than
// showing a full address to other family members.
export function displayNameFromClaims(payload: JWTPayload): string {
  if (typeof payload.name === "string" && payload.name.trim() !== "") return payload.name.trim();
  if (typeof payload.email === "string" && payload.email.includes("@")) {
    return payload.email.split("@")[0];
  }
  return payload.sub ?? "Member";
}
