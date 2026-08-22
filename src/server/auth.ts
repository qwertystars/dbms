/**
 * Auth primitives for Workers: PBKDF2-SHA256 password hashing and
 * HMAC-signed stateless session cookies (no KV, sessions live in the cookie).
 * All crypto via WebCrypto so the same code runs on Workers and in Node 24.
 */

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 30 * 24 * 3600;

export const DEV_SESSION_SECRET = "dev-secret-change-me";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1]!, 10);
  if (!Number.isFinite(iterations)) return false;
  const salt = fromHex(parts[2]!);
  const expected = parts[3]!;
  const actual = await deriveBits(password, salt, iterations);
  // constant-time compare
  const a = toHex(actual);
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return toHex(new Uint8Array(sig));
}

/** Token format: base64url(user_id).expiry_unix.sig */
export async function makeSessionToken(
  secret: string,
  userId: string,
  now = Date.now(),
): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${encodeURIComponent(userId)}.${exp}`;
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

export async function readSessionToken(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, expStr, sig] = parts as [string, string, string];
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(now / 1000)) return null;
  const expected = await hmacSign(secret, `${uid}.${expStr}`);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;
  return decodeURIComponent(uid);
}

/** Parse the `session=` cookie out of a raw Cookie header value. */
export function sessionCookieValue(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const m = /(?:^|;\s*)session=([^;]+)/.exec(cookieHeader);
  return m?.[1] ?? null;
}

export function sessionSetCookie(token: string): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export interface PublicUser {
  user_id: string;
  email: string;
  name: string;
  lang: string;
  person_id: string | null;
}

export function publicUser(row: {
  user_id: string;
  email: string;
  name: string;
  lang: string;
  person_id: string | null;
}): PublicUser {
  return {
    user_id: row.user_id,
    email: row.email,
    name: row.name,
    lang: row.lang,
    person_id: row.person_id,
  };
}
