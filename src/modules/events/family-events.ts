import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import { accounts, auditEvents, eventRsvps, familyEvents, familyMemberships } from "~/db/schema";
import type { RsvpResponse } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";

export interface FamilyEventInput {
  title: string;
  description?: string | null;
  startsOn: string;
  startTime?: string | null;
  location?: string | null;
}

async function activeMembership(accountId: string, familyId: string) {
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

async function liveEvent(familyId: string, eventId: string) {
  const event = await db.query.familyEvents.findFirst({
    where: and(
      eq(familyEvents.id, eventId),
      eq(familyEvents.familyId, familyId),
      isNull(familyEvents.deletedAt),
    ),
  });
  if (!event) throw Errors.NOT_FOUND("Event not found.");
  return event;
}

export async function createEvent(account: Account, familyId: string, input: FamilyEventInput) {
  await activeMembership(account.id, familyId);
  const [event] = await db
    .insert(familyEvents)
    .values({ ...input, familyId, createdByAccountId: account.id })
    .returning();
  return event;
}

export async function listEvents(account: Account, familyId: string, from: string) {
  await activeMembership(account.id, familyId);
  const rows = await db
    .select({
      event: familyEvents,
      creator: { id: accounts.id, displayName: accounts.displayName },
    })
    .from(familyEvents)
    .innerJoin(accounts, eq(familyEvents.createdByAccountId, accounts.id))
    .where(
      and(
        eq(familyEvents.familyId, familyId),
        isNull(familyEvents.deletedAt),
        gte(familyEvents.startsOn, from),
      ),
    )
    .orderBy(asc(familyEvents.startsOn), asc(familyEvents.startTime));
  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.event.id);
  const [counts, mine] = await Promise.all([
    db
      .select({
        eventId: eventRsvps.eventId,
        response: eventRsvps.response,
        count: sql<number>`count(*)`,
      })
      .from(eventRsvps)
      .where(inArray(eventRsvps.eventId, eventIds))
      .groupBy(eventRsvps.eventId, eventRsvps.response),
    db
      .select({ eventId: eventRsvps.eventId, response: eventRsvps.response })
      .from(eventRsvps)
      .where(and(inArray(eventRsvps.eventId, eventIds), eq(eventRsvps.accountId, account.id))),
  ]);
  const totals = new Map<string, Record<RsvpResponse, number>>();
  for (const row of counts) {
    const t = totals.get(row.eventId) ?? { GOING: 0, MAYBE: 0, NOT_GOING: 0 };
    t[row.response] = Number(row.count);
    totals.set(row.eventId, t);
  }
  const myResponses = new Map(mine.map((r) => [r.eventId, r.response]));
  return rows.map((r) => ({
    ...r.event,
    creator: r.creator,
    rsvpCounts: totals.get(r.event.id) ?? { GOING: 0, MAYBE: 0, NOT_GOING: 0 },
    myRsvp: myResponses.get(r.event.id) ?? null,
  }));
}

export async function updateEvent(
  account: Account,
  familyId: string,
  eventId: string,
  input: Partial<FamilyEventInput>,
) {
  await activeMembership(account.id, familyId);
  const event = await liveEvent(familyId, eventId);
  if (event.createdByAccountId !== account.id) {
    throw Errors.FORBIDDEN("You can only edit events you created.");
  }
  const [updated] = await db
    .update(familyEvents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(familyEvents.id, eventId))
    .returning();
  return updated;
}

export async function deleteEvent(account: Account, familyId: string, eventId: string) {
  const membership = await activeMembership(account.id, familyId);
  const event = await liveEvent(familyId, eventId);
  if (event.createdByAccountId !== account.id && membership.role !== "CREATOR") {
    throw Errors.FORBIDDEN("You can only delete your own events or moderate as Creator.");
  }
  const now = new Date();
  await db.batch([
    db
      .update(familyEvents)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(familyEvents.id, eventId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "FAMILY_EVENT_DELETED",
        targetType: "FamilyEvent",
        targetId: eventId,
        summary: { title: event.title, moderated: event.createdByAccountId !== account.id },
      }),
    ),
  ]);
  return { deleted: true };
}

export async function setRsvp(
  account: Account,
  familyId: string,
  eventId: string,
  response: RsvpResponse,
) {
  await activeMembership(account.id, familyId);
  await liveEvent(familyId, eventId);
  await db
    .insert(eventRsvps)
    .values({ eventId, accountId: account.id, response, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [eventRsvps.eventId, eventRsvps.accountId],
      set: { response, updatedAt: new Date() },
    });
  return { eventId, response };
}

export async function clearRsvp(account: Account, familyId: string, eventId: string) {
  await activeMembership(account.id, familyId);
  await liveEvent(familyId, eventId);
  await db
    .delete(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.accountId, account.id)));
  return { removed: true };
}
