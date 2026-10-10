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

let devKeys: KeyLike[] | undefined;
let resolver: KeyResolver | undefined;
export function setCachedJWKs(keys: KeyLike[]) {
  devKeys = keys;
}
function providerSettings() {
  return {
    issuer: env.AUTH_ISSUER,
    audience: env.AUTH_AUDIENCE,
    jwksUri: env.AUTH_JWKS_URI || process.env.AUTH_JWKS_URI,
  };
}

// A remote JWKS is cached by jose and refetched when a token carries an unknown
// `kid` or the cache ages out, so provider key rotation does not need a restart.
function getResolver(jwksUri: string | undefined): KeyResolver | undefined {
  if (resolver) return resolver;
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

export function checkClaims(payload: JWTPayload) {
  if (!payload.sub) throw new Error("Missing subject");
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  if (devKeys) {
    const devOptions = {
      issuer: env.AUTH_ISSUER,
      audience: env.AUTH_AUDIENCE,
      algorithms: ["RS256"],
    };
    for (const key of devKeys) {
      try {
        const { payload } = await jwtVerify(token, key, devOptions);
        checkClaims(payload);
        return payload;
      } catch {
        // try the next key, then the configured provider
      }
    }
  }

  const settings = providerSettings();
  const keys = getResolver(settings.jwksUri);
  if (!keys) throw new Error("No JWKS configured");
  const { payload } = await jwtVerify(token, keys, {
    issuer: settings.issuer,
    audience: settings.audience,
    algorithms: ["RS256"],
    clockTolerance: 5,
  });
  checkClaims(payload);
  return payload;
}

// Display name from token claims. Never uses a full email address, which other
// family members would otherwise see.
export function displayNameFromClaims(payload: JWTPayload): string {
  if (typeof payload.name === "string" && payload.name.trim() !== "") return payload.name.trim();
  if (typeof payload.email === "string" && payload.email.includes("@")) {
    return payload.email.split("@")[0];
  }
  return payload.sub ?? "Member";
}

export async function initialDisplayName(payload: JWTPayload): Promise<string> {
  return displayNameFromClaims(payload);
}
