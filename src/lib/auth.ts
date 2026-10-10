import { and, eq, gt } from "drizzle-orm";
import { db } from "~/lib/db";
import { accountCredentials, accountSessions } from "~/db/schema";
import { hashToken, randomToken } from "~/lib/crypto";
import { getAccountById } from "~/modules/accounts/service";
import { AppError } from "~/lib/errors";

const iterations = 100_000;

export async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function login(username: string, password: string) {
  const credentials = await db.query.accountCredentials.findFirst({
    where: eq(accountCredentials.username, username.toLowerCase()),
  });
  const candidate = await passwordHash(password, credentials?.salt ?? "missing-account");
  let difference = 0;
  const expected = credentials?.passwordHash ?? "0".repeat(64);
  for (let i = 0; i < expected.length; i++) {
    difference |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (!credentials || difference !== 0) {
    throw new AppError("UNAUTHORIZED", "Invalid username or password.", 401);
  }
  return createSession(credentials.accountId);
}

export async function createSession(accountId: string) {
  const token = randomToken();
  await db.insert(accountSessions).values({
    tokenHash: await hashToken(token),
    accountId,
    expiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  return token;
}

export async function accountFromSession(token: string) {
  const session = await db.query.accountSessions.findFirst({
    where: and(
      eq(accountSessions.tokenHash, await hashToken(token)),
      gt(accountSessions.expiresAt, new Date()),
    ),
  });
  return session ? getAccountById(session.accountId) : undefined;
}

export async function revokeSession(token: string) {
  await db.delete(accountSessions).where(eq(accountSessions.tokenHash, await hashToken(token)));
}
