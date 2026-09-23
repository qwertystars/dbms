import { and, eq, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import { accounts, friendRequests, friendships } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";

export async function sendFriendRequest(account: Account, receiverAccountId: string) {
  if (account.id === receiverAccountId) throw Errors.FRIEND_SELF();
  const receiver = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, receiverAccountId))
    .limit(1);
  if (receiver.length === 0) throw Errors.NOT_FOUND("No account exists with that ID.");

  const existingAccepted = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(
          eq(friendships.accountLowId, account.id),
          eq(friendships.accountHighId, receiverAccountId),
        ),
        and(
          eq(friendships.accountLowId, receiverAccountId),
          eq(friendships.accountHighId, account.id),
        ),
      ),
    )
    .limit(1);
  if (existingAccepted.length > 0) throw Errors.FRIEND_DUPLICATE("You are already friends.");

  const existingPending = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.senderAccountId, account.id),
        eq(friendRequests.receiverAccountId, receiverAccountId),
        eq(friendRequests.status, "PENDING"),
      ),
    )
    .limit(1);
  if (existingPending.length > 0)
    throw Errors.FRIEND_DUPLICATE("A pending friend request already exists.");

  const reverse = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.senderAccountId, receiverAccountId),
        eq(friendRequests.receiverAccountId, account.id),
        eq(friendRequests.status, "PENDING"),
      ),
    )
    .limit(1);
  if (reverse.length > 0) {
    // They already asked us, so sending a request back accepts theirs.
    return { ...(await acceptFriendRequest(account, reverse[0].id)), accepted: true };
  }

  const request = {
    id: nanoid(),
    senderAccountId: account.id,
    receiverAccountId,
    status: "PENDING" as const,
    createdAt: new Date(),
    resolvedAt: null,
  };
  await db.insert(friendRequests).values(request);
  return { request, accepted: false };
}

export async function listFriendRequests(account: Account) {
  const rows = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        or(
          eq(friendRequests.senderAccountId, account.id),
          eq(friendRequests.receiverAccountId, account.id),
        ),
        eq(friendRequests.status, "PENDING"),
      ),
    )
    .orderBy(friendRequests.createdAt);
  const summaries = await accountSummaries(
    rows.flatMap((r) => [r.senderAccountId, r.receiverAccountId]),
  );
  return rows.map((r) => ({
    ...r,
    sender: summaries.get(r.senderAccountId) ?? unknownAccount(r.senderAccountId),
    receiver: summaries.get(r.receiverAccountId) ?? unknownAccount(r.receiverAccountId),
  }));
}

export async function acceptFriendRequest(account: Account, requestId: string) {
  const requestRows = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING")))
    .limit(1);
  if (requestRows.length === 0) throw Errors.NOT_FOUND();
  const request = requestRows[0];
  if (request.receiverAccountId !== account.id) throw Errors.FORBIDDEN();

  const low = request.senderAccountId < account.id ? request.senderAccountId : account.id;
  const high = request.senderAccountId < account.id ? account.id : request.senderAccountId;
  const now = new Date();

  // Atomic: create the friendship first, mark the request accepted, then undo
  // the friendship if the guarded update lost a race.
  await db.batch([
    db
      .insert(friendships)
      .values({ accountLowId: low, accountHighId: high, createdAt: now })
      .onConflictDoNothing(),
    db
      .update(friendRequests)
      .set({ status: "ACCEPTED", resolvedAt: now })
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING"))),
    db
      .delete(friendships)
      .where(
        and(
          eq(friendships.accountLowId, low),
          eq(friendships.accountHighId, high),
          sql`NOT EXISTS (SELECT 1 FROM ${friendRequests} WHERE ${friendRequests.id} = ${requestId} AND ${friendRequests.status} = 'ACCEPTED')`,
        ),
      ),
  ]);

  const updated = await db
    .select()
    .from(friendRequests)
    .where(eq(friendRequests.id, requestId))
    .limit(1);
  if (updated.length === 0 || updated[0].status !== "ACCEPTED") {
    throw Errors.NOT_FOUND("Friend request is no longer pending.");
  }
  return { request: updated[0], friendship: { accountLowId: low, accountHighId: high } };
}

export async function rejectFriendRequest(account: Account, requestId: string) {
  const requestRows = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING")))
    .limit(1);
  if (requestRows.length === 0) throw Errors.NOT_FOUND();
  const request = requestRows[0];
  if (request.receiverAccountId !== account.id) throw Errors.FORBIDDEN();
  const [updated] = await db
    .update(friendRequests)
    .set({ status: "REJECTED", resolvedAt: new Date() })
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING")))
    .returning();
  if (!updated) throw Errors.NOT_FOUND("Friend request is no longer pending.");
  return { request: updated };
}

export async function cancelFriendRequest(account: Account, requestId: string) {
  const requestRows = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING")))
    .limit(1);
  if (requestRows.length === 0) throw Errors.NOT_FOUND();
  const request = requestRows[0];
  if (request.senderAccountId !== account.id) throw Errors.FORBIDDEN();
  const [updated] = await db
    .update(friendRequests)
    .set({ status: "CANCELLED", resolvedAt: new Date() })
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING")))
    .returning();
  if (!updated) throw Errors.NOT_FOUND("Friend request is no longer pending.");
  return { request: updated };
}

export async function listFriends(account: Account) {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.accountLowId, account.id), eq(friendships.accountHighId, account.id)))
    .orderBy(friendships.createdAt);
  const otherId = (f: (typeof rows)[number]) =>
    f.accountLowId === account.id ? f.accountHighId : f.accountLowId;
  const summaries = await accountSummaries(rows.map(otherId));
  return rows.map((f) => ({
    ...f,
    friend: summaries.get(otherId(f)) ?? unknownAccount(otherId(f)),
  }));
}

interface AccountSummary {
  id: string;
  displayName: string;
}

async function accountSummaries(ids: string[]): Promise<Map<string, AccountSummary>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: accounts.id, displayName: accounts.displayName })
    .from(accounts)
    .where(inArray(accounts.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

function unknownAccount(id: string): AccountSummary {
  return { id, displayName: "Unknown account" };
}

export async function unfriend(account: Account, friendAccountId: string) {
  const low = account.id < friendAccountId ? account.id : friendAccountId;
  const high = account.id < friendAccountId ? friendAccountId : account.id;
  await db
    .delete(friendships)
    .where(and(eq(friendships.accountLowId, low), eq(friendships.accountHighId, high)));
  return { unfriended: true };
}
