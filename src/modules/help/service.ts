import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import { accounts, auditEvents, helpRequests, helpResponses } from "~/db/schema";
import type { Audience, HelpCategory, HelpKind, HelpStatus } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";
import {
  canSeeAudience,
  closeAccountIds,
  loadViewerContext,
  type ViewerContext,
} from "~/modules/kinship/service";
import { assertAudienceAllowed } from "~/modules/social/service";

export interface HelpInput {
  kind: HelpKind;
  category: HelpCategory;
  title: string;
  body?: string | null;
  audience?: Audience;
}

export interface HelpUpdate {
  title?: string;
  body?: string | null;
  category?: HelpCategory;
  status?: HelpStatus;
}

/**
 * The family help board: members ask for help ("REQUEST") or offer it
 * ("OFFER"), and others reply. Like posts, an item may be shared with close
 * family only.
 */
export async function createHelpRequest(account: Account, familyId: string, input: HelpInput) {
  const ctx = await loadViewerContext(account.id, familyId);
  assertAudienceAllowed(ctx, input.audience);
  const now = new Date();
  const item = {
    id: nanoid(),
    familyId,
    authorAccountId: account.id,
    kind: input.kind,
    category: input.category,
    title: input.title,
    body: input.body ?? null,
    audience: input.audience ?? ("FAMILY" as const),
    status: "OPEN" as const,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    deletedAt: null,
  };
  await db.insert(helpRequests).values(item);
  return (await present(ctx, [item]))[0];
}

export async function listHelpRequests(
  account: Account,
  familyId: string,
  filter: { status?: HelpStatus; kind?: HelpKind } = {},
) {
  const ctx = await loadViewerContext(account.id, familyId);
  const rows = await db
    .select()
    .from(helpRequests)
    .where(
      and(
        eq(helpRequests.familyId, familyId),
        isNull(helpRequests.deletedAt),
        or(
          eq(helpRequests.audience, "FAMILY"),
          inArray(helpRequests.authorAccountId, closeAccountIds(ctx)),
        ),
        filter.status ? eq(helpRequests.status, filter.status) : undefined,
        filter.kind ? eq(helpRequests.kind, filter.kind) : undefined,
      ),
    )
    .orderBy(desc(helpRequests.createdAt), desc(helpRequests.id))
    .limit(200);
  return await present(ctx, rows);
}

export async function updateHelpRequest(
  account: Account,
  familyId: string,
  helpId: string,
  input: HelpUpdate,
) {
  const ctx = await loadViewerContext(account.id, familyId);
  const item = await getVisible(ctx, helpId);
  if (item.authorAccountId !== account.id) {
    throw Errors.FORBIDDEN("You can only change your own requests and offers.");
  }
  const now = new Date();
  const status = input.status ?? item.status;
  const values = {
    title: input.title ?? item.title,
    body: input.body === undefined ? item.body : input.body,
    category: input.category ?? item.category,
    status,
    resolvedAt: status === "OPEN" ? null : item.resolvedAt ?? now,
    updatedAt: now,
  };
  await db.update(helpRequests).set(values).where(eq(helpRequests.id, helpId));
  return (await present(ctx, [{ ...item, ...values }]))[0];
}

export async function deleteHelpRequest(account: Account, familyId: string, helpId: string) {
  const ctx = await loadViewerContext(account.id, familyId);
  const item = await getVisible(ctx, helpId);
  if (item.authorAccountId !== account.id && ctx.role !== "CREATOR") {
    throw Errors.FORBIDDEN("You can only delete your own items or moderate as Creator.");
  }
  const now = new Date();
  await db.batch([
    db
      .update(helpRequests)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(helpRequests.id, helpId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "HELP_REQUEST_DELETED",
        targetType: "HelpRequest",
        targetId: helpId,
        summary: { kind: item.kind, moderated: item.authorAccountId !== account.id },
      }),
    ),
  ]);
  return { deleted: true };
}

export async function respondToHelpRequest(
  account: Account,
  familyId: string,
  helpId: string,
  body: string,
) {
  const ctx = await loadViewerContext(account.id, familyId);
  const item = await getVisible(ctx, helpId);
  if (item.status !== "OPEN") throw Errors.CONFLICT("This item is no longer open.");
  const response = {
    id: nanoid(),
    helpRequestId: helpId,
    authorAccountId: account.id,
    body,
    createdAt: new Date(),
    deletedAt: null,
  };
  await db.insert(helpResponses).values(response);
  return { ...response, author: { id: account.id, displayName: account.displayName } };
}

export async function deleteHelpResponse(
  account: Account,
  familyId: string,
  helpId: string,
  responseId: string,
) {
  const ctx = await loadViewerContext(account.id, familyId);
  await getVisible(ctx, helpId);
  const response = await db.query.helpResponses.findFirst({
    where: and(
      eq(helpResponses.id, responseId),
      eq(helpResponses.helpRequestId, helpId),
      isNull(helpResponses.deletedAt),
    ),
  });
  if (!response) throw Errors.NOT_FOUND();
  if (response.authorAccountId !== account.id && ctx.role !== "CREATOR") {
    throw Errors.FORBIDDEN("You can only delete your own replies or moderate as Creator.");
  }
  await db
    .update(helpResponses)
    .set({ deletedAt: new Date() })
    .where(eq(helpResponses.id, responseId));
  return { deleted: true };
}

async function getVisible(ctx: ViewerContext, helpId: string) {
  const item = await db.query.helpRequests.findFirst({
    where: and(
      eq(helpRequests.id, helpId),
      eq(helpRequests.familyId, ctx.familyId),
      isNull(helpRequests.deletedAt),
    ),
  });
  if (!item || !canSeeAudience(ctx, item.audience, item.authorAccountId)) {
    throw Errors.NOT_FOUND();
  }
  return item;
}

async function present(ctx: ViewerContext, items: (typeof helpRequests.$inferSelect)[]) {
  if (items.length === 0) return [];
  const responses = await db
    .select({
      response: helpResponses,
      author: { id: accounts.id, displayName: accounts.displayName },
    })
    .from(helpResponses)
    .innerJoin(accounts, eq(helpResponses.authorAccountId, accounts.id))
    .where(
      and(
        inArray(
          helpResponses.helpRequestId,
          items.map((i) => i.id),
        ),
        isNull(helpResponses.deletedAt),
      ),
    )
    .orderBy(helpResponses.createdAt);
  const authorIds = Array.from(new Set(items.map((i) => i.authorAccountId)));
  const authors = await db
    .select({ id: accounts.id, displayName: accounts.displayName })
    .from(accounts)
    .where(inArray(accounts.id, authorIds));
  const names = new Map(authors.map((a) => [a.id, a.displayName]));

  return items.map((item) => {
    const authorPersonId = ctx.memberPersons.get(item.authorAccountId) ?? null;
    return {
      ...item,
      author: {
        id: item.authorAccountId,
        displayName: names.get(item.authorAccountId) ?? "Former member",
        personId: authorPersonId,
        kinship:
          authorPersonId && item.authorAccountId !== ctx.accountId
            ? ctx.relatives.get(authorPersonId)?.label ?? null
            : null,
      },
      responses: responses
        .filter((r) => r.response.helpRequestId === item.id)
        .map((r) => ({ ...r.response, author: r.author })),
    };
  });
}
