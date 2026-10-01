import { db } from "~/lib/db";
import { accounts } from "~/db/schema";
import { eq } from "drizzle-orm";
import type { Account } from "~/lib/context";

export async function getOrCreateAccount(
  authSubject: string,
  displayName: string,
): Promise<Account> {
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.authSubject, authSubject),
  });
  if (existing) {
    return mapAccount(existing);
  }
  // Two concurrent first requests for the same subject must not both insert.
  const inserted = await db
    .insert(accounts)
    .values({ authSubject, displayName })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return mapAccount(inserted[0]);
  const raced = await db.query.accounts.findFirst({
    where: eq(accounts.authSubject, authSubject),
  });
  if (!raced) throw new Error("Account provisioning failed.");
  return mapAccount(raced);
}

export async function findAccountBySubject(authSubject: string): Promise<Account | undefined> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.authSubject, authSubject),
  });
  return row ? mapAccount(row) : undefined;
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
  return row ? mapAccount(row) : undefined;
}

export async function updateAccount(
  account: Account,
  input: { displayName: string },
): Promise<Account> {
  const [row] = await db
    .update(accounts)
    .set({ displayName: input.displayName, updatedAt: new Date() })
    .where(eq(accounts.id, account.id))
    .returning();
  return mapAccount(row);
}

function mapAccount(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    authSubject: row.authSubject,
    displayName: row.displayName,
    avatarMediaId: row.avatarMediaId,
    createdAt: row.createdAt,
  };
}
