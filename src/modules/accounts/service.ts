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
  const inserted = await db.insert(accounts).values({ authSubject, displayName }).returning();
  return mapAccount(inserted[0]);
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
  return row ? mapAccount(row) : undefined;
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
