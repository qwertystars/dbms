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

interface ProviderSettings {
  issuer: string;
  audience?: string;
  jwksUri?: string;
  authorizedParties?: string[];
}

// Keys registered by the development sign-in (src/lib/dev-auth.ts).
let devKeys: KeyLike[] | undefined;
let resolver: KeyResolver | undefined;

export function setCachedJWKs(keys: KeyLike[]) {
  devKeys = keys;
}

// A Clerk publishable key is "pk_test_" or "pk_live_" followed by the base64 of
// the instance's Frontend API host and a trailing "$".
export function clerkFrontendApi(publishableKey: string): string {
  const match = /^pk_(test|live)_(.+)$/.exec(publishableKey.trim());
  if (!match) throw new Error("CLERK_PUBLISHABLE_KEY is not a Clerk publishable key.");
  const host = atob(match[2]).replace(/\$$/, "");
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("CLERK_PUBLISHABLE_KEY is malformed.");
  return host;
}

function providerSettings(): ProviderSettings {
  const parties = env.AUTH_AUTHORIZED_PARTIES?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (env.AUTH_PROVIDER === "clerk") {
    if (!env.CLERK_PUBLISHABLE_KEY) throw new Error("CLERK_PUBLISHABLE_KEY is required.");
    const issuer = `https://${clerkFrontendApi(env.CLERK_PUBLISHABLE_KEY)}`;
    return {
      issuer,
      jwksUri: `${issuer}/.well-known/jwks.json`,
      // Clerk session tokens carry no audience; Clerk's guidance is to check
      // the azp claim against the app's own origins instead.
      authorizedParties: parties?.length ? parties : [new URL(env.APP_BASE_URL).origin],
    };
  }
  return {
    issuer: env.AUTH_ISSUER,
    audience: env.AUTH_AUDIENCE,
    jwksUri: env.AUTH_JWKS_URI || process.env.AUTH_JWKS_URI,
    authorizedParties: parties?.length ? parties : undefined,
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

export function checkClaims(payload: JWTPayload, authorizedParties?: string[]) {
  if (!payload.sub) throw new Error("Missing subject");
  // Clerk marks sessions that still have tasks to finish (for example choosing
  // an organization) as pending; they are not signed in yet.
  if (payload.sts === "pending") throw new Error("Session is pending");
  if (authorizedParties && typeof payload.azp === "string") {
    if (!authorizedParties.includes(payload.azp)) throw new Error("Unexpected authorized party");
  }
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
  checkClaims(payload, settings.authorizedParties);
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

interface ClerkUser {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
}

export function displayNameFromClerkUser(user: ClerkUser): string | undefined {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.username) return user.username;
  const emails = user.email_addresses ?? [];
  const email =
    emails.find((e) => e.id === user.primary_email_address_id)?.email_address ??
    emails[0]?.email_address;
  return email?.includes("@") ? email.split("@")[0] : undefined;
}

// Clerk session tokens carry only the user id, so the first time an account is
// provisioned we ask Clerk's Backend API for the person's name. Any failure
// falls back to the token claims; people can rename themselves later.
export async function initialDisplayName(payload: JWTPayload): Promise<string> {
  const secret = env.CLERK_SECRET_KEY;
  if (env.AUTH_PROVIDER === "clerk" && secret && payload.sub) {
    try {
      const response = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(payload.sub)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
      if (response.ok) {
        const name = displayNameFromClerkUser((await response.json()) as ClerkUser);
        if (name) return name;
      }
    } catch {
      // fall through to the claims
    }
  }
  return displayNameFromClaims(payload);
}
