import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import { accounts, auditEvents, familyMemberships, people, personClaimRequests } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";

// Account-to-person linking. A member asks to be recognised as a person record;
// only the family Creator can approve. Approval is the only way a membership
// gains a personId, and it never touches parent/child or partner records.

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed/i.test(`${error.message} ${error.cause ?? ""}`)
  );
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

async function livePerson(familyId: string, personId: string) {
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, personId), eq(people.familyId, familyId), isNull(people.deletedAt)),
  });
  if (!person) throw Errors.NOT_FOUND("Person not found.");
  return person;
}

async function linkedMembership(familyId: string, personId: string) {
  return db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.personId, personId),
      isNull(familyMemberships.removedAt),
    ),
  });
}

export async function requestClaim(account: Account, familyId: string, personId: string) {
  const membership = await activeMembership(account.id, familyId);
  if (membership.personId) throw Errors.CLAIM_ALREADY_LINKED();
  await livePerson(familyId, personId);
  if (await linkedMembership(familyId, personId)) throw Errors.CLAIM_CONFLICT();

  const pending = await db.query.personClaimRequests.findFirst({
    where: and(
      eq(personClaimRequests.membershipId, membership.id),
      eq(personClaimRequests.status, "PENDING"),
    ),
  });
  if (pending) throw Errors.CLAIM_PENDING();

  const request = {
    id: nanoid(),
    familyId,
    personId,
    membershipId: membership.id,
    requesterAccountId: account.id,
    status: "PENDING" as const,
    createdAt: new Date(),
  };
  try {
    await db.batch([
      db.insert(personClaimRequests).values(request),
      db.insert(auditEvents).values(
        auditValues({
          actorAccountId: account.id,
          familyId,
          action: "CLAIM_REQUESTED",
          targetType: "PersonClaimRequest",
          targetId: request.id,
          summary: { personId },
        }),
      ),
    ]);
  } catch (error) {
    // The partial unique index rejects a second concurrent pending request.
    if (isUniqueViolation(error)) throw Errors.CLAIM_PENDING();
    throw error;
  }
  return getRequest(familyId, request.id);
}

async function getRequest(familyId: string, requestId: string) {
  const row = await db.query.personClaimRequests.findFirst({
    where: and(eq(personClaimRequests.id, requestId), eq(personClaimRequests.familyId, familyId)),
  });
  if (!row) throw Errors.NOT_FOUND();
  return row;
}

/** Creators see every pending request; other members see only their own requests. */
export async function listClaims(account: Account, familyId: string) {
  const membership = await activeMembership(account.id, familyId);
  const scope =
    membership.role === "CREATOR"
      ? and(eq(personClaimRequests.familyId, familyId), eq(personClaimRequests.status, "PENDING"))
      : and(
          eq(personClaimRequests.familyId, familyId),
          eq(personClaimRequests.membershipId, membership.id),
        );
  const rows = await db
    .select({
      request: personClaimRequests,
      person: { id: people.id, name: people.name, profileMediaId: people.profileMediaId },
      requester: { id: accounts.id, displayName: accounts.displayName },
    })
    .from(personClaimRequests)
    .innerJoin(people, eq(personClaimRequests.personId, people.id))
    .innerJoin(accounts, eq(personClaimRequests.requesterAccountId, accounts.id))
    .where(scope)
    .orderBy(desc(personClaimRequests.createdAt));
  return rows.map((r) => ({ ...r.request, person: r.person, requester: r.requester }));
}

export async function decideClaim(
  account: Account,
  familyId: string,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
) {
  const actor = await activeMembership(account.id, familyId);
  if (actor.role !== "CREATOR")
    throw Errors.FORBIDDEN("Only the family Creator can verify claims.");
  const request = await getRequest(familyId, requestId);
  if (request.status !== "PENDING") throw Errors.CLAIM_NOT_PENDING();
  const now = new Date();
  const decided = db
    .update(personClaimRequests)
    .set({ status: decision, decidedByAccountId: account.id, decidedAt: now })
    .where(
      and(
        eq(personClaimRequests.id, requestId),
        eq(personClaimRequests.status, "PENDING"),
        decision === "APPROVED" ? sql`changes() = 1` : undefined,
      ),
    )
    .returning();
  const auditor = auditValues({
    actorAccountId: account.id,
    familyId,
    action: decision === "APPROVED" ? "CLAIM_APPROVED" : "CLAIM_REJECTED",
    targetType: "PersonClaimRequest",
    targetId: requestId,
    summary: { personId: request.personId, membershipId: request.membershipId },
  });
  const auditRow = db.insert(auditEvents).values(auditor);
  // Drizzle 0.30 has no insert-select builder. Insert first, then discard the
  // audit if the immediately preceding conditional transition changed no row.
  // All statements commit together, including on D1.
  const discardUnchangedAudit = db
    .delete(auditEvents)
    .where(and(eq(auditEvents.id, auditor.id), sql`changes() = 0`));

  if (decision === "REJECTED") {
    const [, changed] = await db.batch([auditRow, decided, discardUnchangedAudit]);
    if (changed.length === 0) throw Errors.CLAIM_NOT_PENDING();
    return getRequest(familyId, requestId);
  }

  // Re-check every precondition at approval time; state may have moved since the request.
  const target = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.id, request.membershipId),
      eq(familyMemberships.familyId, familyId),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!target) throw Errors.CLAIM_NOT_PENDING("The requesting member has left the family.");
  if (target.personId) throw Errors.CLAIM_ALREADY_LINKED("That member is already linked.");
  await livePerson(familyId, request.personId);
  if (await linkedMembership(familyId, request.personId)) throw Errors.CLAIM_CONFLICT();

  try {
    const [, , changed] = await db.batch([
      auditRow,
      db
        .update(familyMemberships)
        .set({ personId: request.personId })
        .where(
          and(
            eq(familyMemberships.id, target.id),
            isNull(familyMemberships.personId),
            isNull(familyMemberships.removedAt),
            sql`EXISTS (SELECT 1 FROM ${personClaimRequests} WHERE ${personClaimRequests.id} = ${requestId} AND ${personClaimRequests.status} = 'PENDING')`,
            sql`EXISTS (SELECT 1 FROM ${people} WHERE ${people.id} = ${request.personId} AND ${people.familyId} = ${familyId} AND ${people.deletedAt} IS NULL)`,
          ),
        ),
      decided,
      discardUnchangedAudit,
    ]);
    if (changed.length === 0) throw Errors.CLAIM_NOT_PENDING();
  } catch (error) {
    // The active (family, person) unique index lost a race with another approval.
    if (isUniqueViolation(error)) throw Errors.CLAIM_CONFLICT();
    throw error;
  }
  return getRequest(familyId, requestId);
}

export async function cancelClaim(account: Account, familyId: string, requestId: string) {
  const membership = await activeMembership(account.id, familyId);
  const request = await getRequest(familyId, requestId);
  if (request.membershipId !== membership.id) throw Errors.FORBIDDEN();
  if (request.status !== "PENDING") throw Errors.CLAIM_NOT_PENDING();
  const auditor = auditValues({
    actorAccountId: account.id,
    familyId,
    action: "CLAIM_CANCELLED",
    targetType: "PersonClaimRequest",
    targetId: requestId,
    summary: { personId: request.personId, membershipId: membership.id },
  });
  const [, changed] = await db.batch([
    db.insert(auditEvents).values(auditor),
    db
      .update(personClaimRequests)
      .set({ status: "CANCELLED", decidedAt: new Date() })
      .where(and(eq(personClaimRequests.id, requestId), eq(personClaimRequests.status, "PENDING")))
      .returning(),
    db.delete(auditEvents).where(and(eq(auditEvents.id, auditor.id), sql`changes() = 0`)),
  ]);
  if (changed.length === 0) throw Errors.CLAIM_NOT_PENDING();
  return getRequest(familyId, requestId);
}

export async function unlinkSelf(account: Account, familyId: string) {
  const membership = await activeMembership(account.id, familyId);
  if (!membership.personId) return { unlinked: false };
  await db.batch([
    db
      .update(familyMemberships)
      .set({ personId: null })
      .where(eq(familyMemberships.id, membership.id)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "PERSON_LINK_REMOVED",
        targetType: "FamilyMembership",
        targetId: membership.id,
        summary: { personId: membership.personId },
      }),
    ),
  ]);
  return { unlinked: true };
}
