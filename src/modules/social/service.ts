import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import { accounts, auditEvents, comments, familyMemberships, posts, reactions } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";
import type { ReactionType } from "~/db/schema";

export interface PostInput {
  body: string;
}

export type ReactionSummary = Record<ReactionType, number>;

function emptyReactions(): ReactionSummary {
  return { LIKE: 0, LOVE: 0, LAUGH: 0, SAD: 0 };
}

export async function createPost(account: Account, familyId: string, input: PostInput) {
  // Any active member may post, including Viewers (see the permission matrix).
  await requireActiveMembership(account.id, familyId);
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

interface Cursor {
  at: Date;
  id: string | null;
}

function parseCursor(cursor?: string): Cursor | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("|");
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return { at, id: id || null };
}

export async function listPosts(account: Account, familyId: string, cursor?: string, limit = 20) {
  await requireActiveMembership(account.id, familyId);
  const base = and(eq(posts.familyId, familyId), isNull(posts.deletedAt));
  const parsed = parseCursor(cursor);
  // Timestamps have second precision, so the id is part of the cursor to keep
  // posts created within the same second from being skipped.
  const condition = parsed
    ? parsed.id
      ? and(
          base,
          or(
            lt(posts.createdAt, parsed.at),
            and(eq(posts.createdAt, parsed.at), lt(posts.id, parsed.id)),
          ),
        )
      : and(base, lt(posts.createdAt, parsed.at))
    : base;

  const rows = await db
    .select()
    .from(posts)
    .where(condition)
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? `${items[items.length - 1].createdAt.toISOString()}|${items[items.length - 1].id}`
    : undefined;
  if (items.length === 0) return { posts: [], nextCursor };

  const postIds = items.map((p) => p.id);
  const [reactionRows, commentRows, myReactionRows] = await Promise.all([
    db
      .select({
        postId: reactions.postId,
        type: reactions.type,
        count: sql<number>`count(*)`,
      })
      .from(reactions)
      .where(inArray(reactions.postId, postIds))
      .groupBy(reactions.postId, reactions.type),
    db
      .select({ postId: comments.postId, count: sql<number>`count(*)` })
      .from(comments)
      .where(and(inArray(comments.postId, postIds), isNull(comments.deletedAt)))
      .groupBy(comments.postId),
    db
      .select({ postId: reactions.postId, type: reactions.type })
      .from(reactions)
      .where(and(inArray(reactions.postId, postIds), eq(reactions.accountId, account.id))),
  ]);

  const reactionCounts = new Map<string, ReactionSummary>();
  for (const row of reactionRows) {
    const summary = reactionCounts.get(row.postId) ?? emptyReactions();
    summary[row.type] = Number(row.count);
    reactionCounts.set(row.postId, summary);
  }
  const commentCounts = new Map(commentRows.map((r) => [r.postId, Number(r.count)]));
  const myReactions = new Map(myReactionRows.map((r) => [r.postId, r.type]));

  const authorIds = Array.from(new Set(items.map((p) => p.authorAccountId)));
  const authors = await db
    .select({ id: accounts.id, displayName: accounts.displayName })
    .from(accounts)
    .where(inArray(accounts.id, authorIds));
  const authorNames = new Map(authors.map((a) => [a.id, a.displayName]));

  return {
    posts: items.map((post) => ({
      ...post,
      author: {
        id: post.authorAccountId,
        displayName: authorNames.get(post.authorAccountId) ?? "Former member",
      },
      reactionCounts: reactionCounts.get(post.id) ?? emptyReactions(),
      commentCount: commentCounts.get(post.id) ?? 0,
      myReaction: myReactions.get(post.id) ?? null,
    })),
    nextCursor,
  };
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
  const now = new Date();
  await db.batch([
    db.update(posts).set({ deletedAt: now, updatedAt: now }).where(eq(posts.id, postId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "POST_DELETED",
        targetType: "Post",
        targetId: postId,
        summary: { moderated: post.authorAccountId !== account.id },
      }),
    ),
  ]);
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
  await getPost(account, familyId, postId);
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
  await getPost(account, familyId, postId);
  const rows = await db
    .select({
      comment: comments,
      author: { id: accounts.id, displayName: accounts.displayName },
    })
    .from(comments)
    .innerJoin(accounts, eq(comments.authorAccountId, accounts.id))
    .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)))
    .orderBy(comments.createdAt);
  return rows.map((row) => ({ ...row.comment, author: row.author }));
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
  await getPost(account, familyId, comment.postId);
  if (comment.authorAccountId !== account.id && membership.role !== "CREATOR") {
    throw Errors.FORBIDDEN("You can only delete your own comments or moderate as Creator.");
  }
  const now = new Date();
  await db.batch([
    db.update(comments).set({ deletedAt: now, updatedAt: now }).where(eq(comments.id, commentId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "COMMENT_DELETED",
        targetType: "Comment",
        targetId: commentId,
        summary: { moderated: comment.authorAccountId !== account.id },
      }),
    ),
  ]);
  return { deleted: true };
}

export async function setReaction(
  account: Account,
  familyId: string,
  postId: string,
  type: ReactionType,
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
  return { reacted: true, type };
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
