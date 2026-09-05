import { and, eq, or } from "drizzle-orm";
import { db } from "~/lib/db";
import { friendRequests, friendships } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";

export async function sendFriendRequest(account: Account, receiverAccountId: string) {
  if (account.id === receiverAccountId) throw Errors.FRIEND_SELF();
  return await db.transaction(async (tx) => {
    const existingAccepted = await tx
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

    const existingPending = await tx
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

    const reverse = await tx
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
      return await acceptFriendRequestTx(tx, account, reverse[0].id);
    }

    const [request] = await tx
      .insert(friendRequests)
      .values({
        senderAccountId: account.id,
        receiverAccountId,
        status: "PENDING",
      })
      .returning();
    return { request, accepted: false };
  });
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
  return rows;
}

export async function acceptFriendRequest(account: Account, requestId: string) {
  return await db.transaction(async (tx) => {
    return await acceptFriendRequestTx(tx, account, requestId);
  });
}

async function acceptFriendRequestTx(tx: typeof db, account: Account, requestId: string) {
  const requestRows = await tx
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, "PENDING")))
    .limit(1);
  if (requestRows.length === 0) throw Errors.NOT_FOUND();
  const request = requestRows[0];
  if (request.receiverAccountId !== account.id) throw Errors.FORBIDDEN();

  const [updated] = await tx
    .update(friendRequests)
    .set({ status: "ACCEPTED", resolvedAt: new Date() })
    .where(eq(friendRequests.id, requestId))
    .returning();

  const low = request.senderAccountId < account.id ? request.senderAccountId : account.id;
  const high = request.senderAccountId < account.id ? account.id : request.senderAccountId;
  await tx
    .insert(friendships)
    .values({ accountLowId: low, accountHighId: high })
    .onConflictDoNothing({ target: [friendships.accountLowId, friendships.accountHighId] });

  return { request: updated, friendship: { accountLowId: low, accountHighId: high } };
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
    .where(eq(friendRequests.id, requestId))
    .returning();
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
    .where(eq(friendRequests.id, requestId))
    .returning();
  return { request: updated };
}

export async function listFriends(account: Account) {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.accountLowId, account.id), eq(friendships.accountHighId, account.id)))
    .orderBy(friendships.createdAt);
  return rows;
}

export async function unfriend(account: Account, friendAccountId: string) {
  const low = account.id < friendAccountId ? account.id : friendAccountId;
  const high = account.id < friendAccountId ? friendAccountId : account.id;
  await db
    .delete(friendships)
    .where(and(eq(friendships.accountLowId, low), eq(friendships.accountHighId, high)));
  return { unfriended: true };
}
