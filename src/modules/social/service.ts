import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import { comments, familyMemberships, posts, reactions } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { audit } from "~/modules/audit/service";

export interface PostInput {
  body: string;
}

export async function createPost(account: Account, familyId: string, input: PostInput) {
  const membership = await requireActiveMembership(account.id, familyId);
  const [post] = await db
    .insert(posts)
    .values({
      familyId,
      authorAccountId: account.id,
      body: input.body,
    })
    .returning();
  return post;
}

export async function listPosts(account: Account, familyId: string, cursor?: string, limit = 20) {
  await requireActiveMembership(account.id, familyId);
  const conditions = and(eq(posts.familyId, familyId), isNull(posts.deletedAt));
  const base = db
    .select()
    .from(posts)
    .where(cursor ? and(conditions, lt(posts.createdAt, new Date(cursor))) : conditions)
    .orderBy(desc(posts.createdAt))
    .limit(limit + 1);
  const rows = await base;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : undefined;
  return { posts: items, nextCursor };
}

export async function getPost(account: Account, familyId: string, postId: string) {
  await requireActiveMembership(account.id, familyId);
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.familyId, familyId), isNull(posts.deletedAt)),
  });
  if (!post) throw Errors.NOT_FOUND();
  return post;
}

export async function updatePost(
  account: Account,
  familyId: string,
  postId: string,
  input: PostInput,
) {
  const post = await getPost(account, familyId, postId);
  if (post.authorAccountId !== account.id)
    throw Errors.FORBIDDEN("You can only edit your own posts.");
  const [updated] = await db
    .update(posts)
    .set({ body: input.body, updatedAt: new Date() })
    .where(eq(posts.id, postId))
    .returning();
  return updated;
}

export async function deletePost(account: Account, familyId: string, postId: string) {
  const membership = await requireActiveMembership(account.id, familyId);
  const post = await getPost(account, familyId, postId);
  if (post.authorAccountId !== account.id && membership.role !== "CREATOR") {
    throw Errors.FORBIDDEN("You can only delete your own posts or moderate as Creator.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(posts.id, postId));
    await audit(tx, {
      actorAccountId: account.id,
      familyId,
      action: "POST_DELETED",
      targetType: "Post",
      targetId: postId,
      summary: { moderated: post.authorAccountId !== account.id },
    });
  });
  return { deleted: true };
}

export interface CommentInput {
  body: string;
}

export async function createComment(
  account: Account,
  familyId: string,
  postId: string,
  input: CommentInput,
) {
  await requireActiveMembership(account.id, familyId);
  const post = await getPost(account, familyId, postId);
  const [comment] = await db
    .insert(comments)
    .values({
      postId,
      authorAccountId: account.id,
      body: input.body,
    })
    .returning();
  return comment;
}

export async function listComments(account: Account, familyId: string, postId: string) {
  await requireActiveMembership(account.id, familyId);
  const post = await getPost(account, familyId, postId);
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)))
    .orderBy(comments.createdAt);
  return rows;
}

export async function updateComment(
  account: Account,
  familyId: string,
  commentId: string,
  input: CommentInput,
) {
  await requireActiveMembership(account.id, familyId);
  const comment = await db.query.comments.findFirst({
    where: and(
      eq(comments.id, commentId),
      eq(comments.authorAccountId, account.id),
      isNull(comments.deletedAt),
    ),
  });
  if (!comment) throw Errors.NOT_FOUND();
  const [updated] = await db
    .update(comments)
    .set({ body: input.body, updatedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning();
  return updated;
}

export async function deleteComment(account: Account, familyId: string, commentId: string) {
  const membership = await requireActiveMembership(account.id, familyId);
  const comment = await db.query.comments.findFirst({
    where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
  });
  if (!comment) throw Errors.NOT_FOUND();
  const post = await getPost(account, familyId, comment.postId);
  if (comment.authorAccountId !== account.id && membership.role !== "CREATOR") {
    throw Errors.FORBIDDEN("You can only delete your own comments or moderate as Creator.");
  }
  await db
    .update(comments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(comments.id, commentId));
  return { deleted: true };
}

export async function setReaction(
  account: Account,
  familyId: string,
  postId: string,
  type: "LIKE" | "LOVE" | "LAUGH" | "SAD",
) {
  await requireActiveMembership(account.id, familyId);
  await getPost(account, familyId, postId);
  await db
    .insert(reactions)
    .values({ postId, accountId: account.id, type })
    .onConflictDoUpdate({
      target: [reactions.postId, reactions.accountId],
      set: { type },
    });
  return { reacted: true };
}

export async function removeReaction(account: Account, familyId: string, postId: string) {
  await requireActiveMembership(account.id, familyId);
  await getPost(account, familyId, postId);
  await db
    .delete(reactions)
    .where(and(eq(reactions.postId, postId), eq(reactions.accountId, account.id)));
  return { removed: true };
}

async function requireActiveMembership(accountId: string, familyId: string) {
  const membership = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, accountId),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!membership) throw Errors.FORBIDDEN("You are not a member of this family.");
  return membership;
}
