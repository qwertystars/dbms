import { and, eq, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  accounts,
  accountCredentials,
  authSessions,
  auditEvents,
  loginAttempts,
} from "~/db/schema";
import type { DB } from "~/lib/db";
import type { Account } from "~/lib/context";
import { randomToken, hashToken } from "~/lib/crypto";
import { AppError } from "~/lib/errors";
import { auditValues } from "~/modules/audit/service";
import { hashPassword, verifyPassword, dummyPasswordHash } from "~/modules/accounts/passwords";

const now = () => Math.floor(Date.now() / 1000);
export async function limitPasswordAttempts(db: DB, ip: string, username: string) {
  // Shared D1 counters protect KDF endpoints across Worker isolates.
  await db.delete(loginAttempts).where(lte(loginAttempts.expiresAt, now()));
  for (const scope of [`ip:${ip}`, `user:${username}`]) {
    const key = await hashToken(scope),
      expiresAt = now() + 900;
    const [row] = await db
      .insert(loginAttempts)
      .values({ key, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: { count: sql`${loginAttempts.count}+1` },
      })
      .returning();
    if (row.count > (scope.startsWith("ip:") ? 30 : 15))
      throw new AppError(
        "RATE_LIMITED",
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
  }
}
export async function credentialsStatus(db: DB, account: Account) {
  const [row] = await db
    .select()
    .from(accountCredentials)
    .where(eq(accountCredentials.accountId, account.id));
  return { username: row?.username ?? null, hasPassword: Boolean(row) };
}
export async function createPasswordAccount(
  db: DB,
  input: { username: string; password: string; displayName: string },
) {
  const passwordHash = await hashPassword(input.password);
  const id = nanoid(),
    subject = `local:${randomToken()}`;
  try {
    await db.batch([
      db.insert(accounts).values({ id, authSubject: subject, displayName: input.displayName }),
      db.insert(accountCredentials).values({
        accountId: id,
        authSubject: subject,
        username: input.username,
        passwordHash,
        version: 1,
        updatedAt: now(),
      }),
      db.insert(auditEvents).values(
        auditValues({
          actorAccountId: id,
          action: "PASSWORD_ACCOUNT_CREATED",
          targetType: "Account",
          targetId: id,
          summary: {},
        }),
      ),
    ]);
  } catch (e) {
    const [taken] = await db
      .select()
      .from(accountCredentials)
      .where(eq(accountCredentials.username, input.username));
    if (taken) throw new AppError("USERNAME_UNAVAILABLE", "That username is unavailable.", 409);
    throw e;
  }
  return { subject, displayName: input.displayName, version: 1 };
}
export async function authenticatePassword(db: DB, username: string, password: string) {
  const [row] = await db
    .select()
    .from(accountCredentials)
    .where(eq(accountCredentials.username, username));
  const valid = await verifyPassword(password, row?.passwordHash ?? dummyPasswordHash);
  if (!row || !valid)
    throw new AppError("INVALID_CREDENTIALS", "Incorrect username or password.", 401);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, row.accountId));
  if (!account) throw new AppError("INVALID_CREDENTIALS", "Incorrect username or password.", 401);
  return { subject: account.authSubject, displayName: account.displayName, version: row.version };
}
export async function saveCredentials(
  db: DB,
  account: Account,
  input: { username: string; password: string; currentPassword?: string },
  recentGoogle: boolean,
) {
  const [existing] = await db
    .select()
    .from(accountCredentials)
    .where(eq(accountCredentials.accountId, account.id));
  if (existing) {
    if (
      !input.currentPassword ||
      !(await verifyPassword(input.currentPassword, existing.passwordHash))
    )
      throw new AppError("INVALID_PASSWORD", "Current password is incorrect.", 403);
  } else if (!recentGoogle) {
    throw new AppError(
      "REAUTHENTICATION_REQUIRED",
      "Sign in with Google again before adding a password.",
      403,
    );
  }
  const passwordHash = await hashPassword(input.password),
    version = (existing?.version ?? 0) + 1;
  try {
    // Optimistic compare prevents two concurrent password changes from overwriting each other.
    const mutation = existing
      ? db
          .update(accountCredentials)
          .set({ username: input.username, passwordHash, version, updatedAt: now() })
          .where(
            and(
              eq(accountCredentials.accountId, account.id),
              eq(accountCredentials.version, existing.version),
            ),
          )
          .returning()
      : db
          .insert(accountCredentials)
          .values({
            accountId: account.id,
            authSubject: account.authSubject,
            username: input.username,
            passwordHash,
            version,
            updatedAt: now(),
          })
          .returning();
    const event = auditValues({
      actorAccountId: account.id,
      action: existing ? "PASSWORD_CHANGED" : "PASSWORD_ADDED",
      targetType: "Account",
      targetId: account.id,
      summary: {},
    });
    const [changed] = await db.batch([
      mutation,
      db
        .delete(authSessions)
        .where(
          and(
            eq(authSessions.subject, account.authSubject),
            lte(authSessions.credentialVersion, version - 1),
          ),
        ),
      db.insert(auditEvents).values({
        ...event,
        // A failed optimistic update must roll back the entire batch. action is NOT NULL.
        action: sql`CASE WHEN EXISTS (SELECT 1 FROM account_credentials WHERE account_id = ${account.id} AND password_hash = ${passwordHash}) THEN ${event.action} ELSE NULL END`,
      }),
    ]);
    if (!changed.length)
      throw new AppError("CREDENTIALS_CHANGED", "Credentials changed. Sign in again.", 409);
  } catch (e) {
    const [taken] = await db
      .select()
      .from(accountCredentials)
      .where(eq(accountCredentials.username, input.username));
    if (taken && taken.accountId !== account.id)
      throw new AppError("USERNAME_UNAVAILABLE", "That username is unavailable.", 409);
    if (existing) {
      const currentVersion = await getCredentialVersion(db, account.authSubject);
      if (currentVersion !== existing.version)
        throw new AppError("CREDENTIALS_CHANGED", "Credentials changed. Sign in again.", 409);
    }
    throw e;
  }
  return { subject: account.authSubject, displayName: account.displayName, version };
}
export async function issuePasswordSession(
  db: DB,
  identity: { subject: string; displayName: string; version: number },
  oldToken?: string,
) {
  const token = randomToken();
  if (oldToken)
    await db.delete(authSessions).where(eq(authSessions.tokenHash, await hashToken(oldToken)));
  await db.insert(authSessions).values({
    tokenHash: await hashToken(token),
    subject: identity.subject,
    displayName: identity.displayName,
    credentialVersion: identity.version,
    createdAt: now(),
    expiresAt: now() + 7 * 86400,
  });
  return token;
}

export async function getCredentialVersion(db: DB, subject: string): Promise<number> {
  const [row] = await db
    .select({ version: accountCredentials.version })
    .from(accountCredentials)
    .where(eq(accountCredentials.authSubject, subject));
  return row?.version ?? 0;
}
