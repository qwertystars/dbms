import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import {
  accounts as dbAccounts,
  auditEvents,
  families,
  familyInvitations,
  familyMemberships,
} from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { hashToken, randomToken } from "~/lib/crypto";
import { auditValues } from "~/modules/audit/service";
import type { Membership } from "~/modules/auth/policy";
import { getPerson } from "~/modules/people/service";

export async function createFamily(
  account: Account,
  input: { name: string; description?: string | null },
) {
  const now = new Date();
  const family = {
    id: nanoid(),
    name: input.name,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const membership = {
    id: nanoid(),
    familyId: family.id,
    accountId: account.id,
    personId: null,
    role: "CREATOR" as const,
    joinedAt: now,
    removedAt: null,
  };

  await db.batch([
    db.insert(families).values(family),
    db.insert(familyMemberships).values(membership),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId: family.id,
        action: "FAMILY_CREATED",
        targetType: "Family",
        targetId: family.id,
        summary: { name: family.name },
      }),
    ),
  ]);

  return { family, membership: mapMembership(membership) };
}

export async function listFamilies(account: Account) {
  const rows = await db
    .select({
      membership: familyMemberships,
      family: families,
    })
    .from(familyMemberships)
    .innerJoin(families, eq(familyMemberships.familyId, families.id))
    .where(
      and(
        eq(familyMemberships.accountId, account.id),
        isNull(familyMemberships.removedAt),
        isNull(families.deletedAt),
      ),
    );
  return rows.map((r) => ({
    membership: mapMembership(r.membership),
    family: r.family,
  }));
}

export async function getFamily(familyId: string) {
  const family = await db.query.families.findFirst({
    where: and(eq(families.id, familyId), isNull(families.deletedAt)),
  });
  if (!family) throw Errors.NOT_FOUND();
  return family;
}

export async function updateFamily(
  account: Account,
  familyId: string,
  input: { name?: string; description?: string | null; closeFamilyDegree?: number },
) {
  const row = await getMembership(familyId, account.id);
  if (!row || row.role !== "CREATOR") throw Errors.FORBIDDEN();
  const family = await getFamily(familyId);
  const now = new Date();

  await db.batch([
    db
      .update(families)
      .set({
        name: input.name,
        description: input.description,
        closeFamilyDegree: input.closeFamilyDegree,
        updatedAt: now,
      })
      .where(eq(families.id, familyId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "FAMILY_UPDATED",
        targetType: "Family",
        targetId: familyId,
        summary: { fields: Object.keys(input) },
      }),
    ),
  ]);

  return {
    ...family,
    name: input.name ?? family.name,
    description: input.description === undefined ? family.description : input.description,
    closeFamilyDegree: input.closeFamilyDegree ?? family.closeFamilyDegree,
    updatedAt: now,
  };
}

export async function deleteFamily(account: Account, familyId: string, confirmation: string) {
  const row = await getMembership(familyId, account.id);
  if (!row || row.role !== "CREATOR") throw Errors.FORBIDDEN();
  const family = await getFamily(familyId);
  if (confirmation !== `delete-${family.id}`) {
    throw Errors.VALIDATION("Confirmation token does not match.");
  }
  const now = new Date();
  await db.batch([
    db.update(families).set({ deletedAt: now, updatedAt: now }).where(eq(families.id, familyId)),
    db
      .update(familyMemberships)
      .set({ removedAt: now })
      .where(eq(familyMemberships.familyId, familyId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "FAMILY_DELETED",
        targetType: "Family",
        targetId: familyId,
        summary: { name: family.name },
      }),
    ),
  ]);
  return { deleted: true };
}

export async function listMembers(familyId: string) {
  const rows = await db
    .select({
      membership: familyMemberships,
      account: { id: dbAccounts.id, displayName: dbAccounts.displayName },
    })
    .from(familyMemberships)
    .innerJoin(dbAccounts, eq(familyMemberships.accountId, dbAccounts.id))
    .where(and(eq(familyMemberships.familyId, familyId), isNull(familyMemberships.removedAt)));
  return rows.map((r) => ({
    ...mapMembership(r.membership),
    account: r.account,
  }));
}

export async function updateMembership(
  actor: Account,
  familyId: string,
  membershipId: string,
  role: "EDITOR" | "VIEWER",
) {
  const actorMembership = await getMembership(familyId, actor.id);
  if (!actorMembership || actorMembership.role !== "CREATOR") throw Errors.FORBIDDEN();
  const target = await db.query.familyMemberships.findFirst({
    where: and(eq(familyMemberships.id, membershipId), eq(familyMemberships.familyId, familyId)),
  });
  if (!target || target.removedAt) throw Errors.NOT_FOUND();
  if (target.role === "CREATOR") throw Errors.FORBIDDEN("Cannot change the Creator role.");

  await db.batch([
    db.update(familyMemberships).set({ role }).where(eq(familyMemberships.id, membershipId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: actor.id,
        familyId,
        action: "MEMBERSHIP_ROLE_UPDATED",
        targetType: "FamilyMembership",
        targetId: membershipId,
        summary: { from: target.role, to: role },
      }),
    ),
  ]);
  return mapMembership({ ...target, role });
}

/**
 * Links a member account to the person who represents them in the tree
 * ("this is me"), or unlinks it with `personId: null`. Creator-only, because
 * the link decides who counts as close family (INV-MEMBER-02 keeps it one-to-one).
 */
export async function linkMemberPerson(
  actor: Account,
  familyId: string,
  membershipId: string,
  personId: string | null,
) {
  const actorMembership = await getMembership(familyId, actor.id);
  if (!actorMembership || actorMembership.role !== "CREATOR") throw Errors.FORBIDDEN();
  const target = await db.query.familyMemberships.findFirst({
    where: and(eq(familyMemberships.id, membershipId), eq(familyMemberships.familyId, familyId)),
  });
  if (!target || target.removedAt) throw Errors.NOT_FOUND();

  if (personId) {
    await getPerson(familyId, personId).catch(() => {
      throw Errors.PERSON_NOT_IN_FAMILY();
    });
    const claimed = await db.query.familyMemberships.findFirst({
      where: and(
        eq(familyMemberships.familyId, familyId),
        eq(familyMemberships.personId, personId),
        isNull(familyMemberships.removedAt),
      ),
    });
    if (claimed && claimed.id !== membershipId) {
      throw Errors.CONFLICT("That person is already linked to another member.");
    }
  }

  try {
    await db.batch([
      db.update(familyMemberships).set({ personId }).where(eq(familyMemberships.id, membershipId)),
      db.insert(auditEvents).values(
        auditValues({
          actorAccountId: actor.id,
          familyId,
          action: "MEMBERSHIP_PERSON_LINKED",
          targetType: "FamilyMembership",
          targetId: membershipId,
          summary: { from: target.personId, to: personId },
        }),
      ),
    ]);
  } catch (error) {
    // The partial unique index settles a race between two links to one person.
    if (String((error as Error)?.message ?? error).includes("UNIQUE")) {
      throw Errors.CONFLICT("That person is already linked to another member.");
    }
    throw error;
  }
  return mapMembership({ ...target, personId });
}

export async function removeMembership(actor: Account, familyId: string, membershipId: string) {
  const actorMembership = await getMembership(familyId, actor.id);
  if (!actorMembership || actorMembership.role !== "CREATOR") throw Errors.FORBIDDEN();
  const target = await db.query.familyMemberships.findFirst({
    where: and(eq(familyMemberships.id, membershipId), eq(familyMemberships.familyId, familyId)),
  });
  if (!target || target.removedAt) throw Errors.NOT_FOUND();
  if (target.role === "CREATOR") throw Errors.FORBIDDEN("Cannot remove the Creator.");

  await db.batch([
    db
      .update(familyMemberships)
      .set({ removedAt: new Date() })
      .where(eq(familyMemberships.id, membershipId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: actor.id,
        familyId,
        action: "MEMBERSHIP_REMOVED",
        targetType: "FamilyMembership",
        targetId: membershipId,
        summary: { accountId: target.accountId, role: target.role },
      }),
    ),
  ]);
  return { removed: true };
}

export async function transferOwnership(
  actor: Account,
  familyId: string,
  newCreatorMembershipId: string,
) {
  const current = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, actor.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!current || current.role !== "CREATOR") throw Errors.FORBIDDEN();
  const target = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.id, newCreatorMembershipId),
      eq(familyMemberships.familyId, familyId),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!target) throw Errors.NOT_FOUND();
  if (target.role !== "EDITOR" && target.role !== "VIEWER") {
    throw Errors.VALIDATION("New creator must be an active Editor or Viewer.");
  }

  // Each update is guarded by the other row's state, so a concurrent transfer
  // cannot leave the family with two Creators or none. The batch is atomic.
  await db.batch([
    db
      .update(familyMemberships)
      .set({ role: "CREATOR" })
      .where(
        and(
          eq(familyMemberships.id, target.id),
          eq(familyMemberships.familyId, familyId),
          isNull(familyMemberships.removedAt),
          inArray(familyMemberships.role, ["EDITOR", "VIEWER"]),
          sql`EXISTS (SELECT 1 FROM ${familyMemberships} WHERE ${familyMemberships.id} = ${current.id} AND ${familyMemberships.role} = 'CREATOR' AND ${familyMemberships.removedAt} IS NULL)`,
        ),
      ),
    db
      .update(familyMemberships)
      .set({ role: "EDITOR" })
      .where(
        and(
          eq(familyMemberships.id, current.id),
          eq(familyMemberships.familyId, familyId),
          eq(familyMemberships.role, "CREATOR"),
          sql`EXISTS (SELECT 1 FROM ${familyMemberships} WHERE ${familyMemberships.id} = ${target.id} AND ${familyMemberships.role} = 'CREATOR' AND ${familyMemberships.removedAt} IS NULL)`,
        ),
      ),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: actor.id,
        familyId,
        action: "OWNERSHIP_TRANSFERRED",
        targetType: "FamilyMembership",
        targetId: newCreatorMembershipId,
        summary: { fromMembershipId: current.id, toMembershipId: newCreatorMembershipId },
      }),
    ),
  ]);

  const [updatedCurrent, updatedTarget] = await Promise.all([
    db.query.familyMemberships.findFirst({ where: eq(familyMemberships.id, current.id) }),
    db.query.familyMemberships.findFirst({ where: eq(familyMemberships.id, target.id) }),
  ]);
  if (updatedCurrent?.role !== "EDITOR" || updatedTarget?.role !== "CREATOR") {
    throw Errors.CONFLICT("Ownership changed concurrently. Refresh and try again.");
  }
  return { transferred: true };
}

export async function createInvitation(
  actor: Account,
  familyId: string,
  input: { email?: string; role: "EDITOR" | "VIEWER" },
) {
  const actorMembership = await getMembership(familyId, actor.id);
  if (!actorMembership || actorMembership.role !== "CREATOR") throw Errors.FORBIDDEN();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const invitation = {
    id: nanoid(),
    familyId,
    createdByAccountId: actor.id,
    invitedEmail: input.email ?? null,
    role: input.role,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    acceptedByAccountId: null,
    revokedAt: null,
    createdAt: new Date(),
  };

  await db.batch([
    db.insert(familyInvitations).values(invitation),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: actor.id,
        familyId,
        action: "INVITATION_CREATED",
        targetType: "FamilyInvitation",
        targetId: invitation.id,
        summary: { role: invitation.role },
      }),
    ),
  ]);

  return { invitation, token };
}

export async function acceptInvitation(account: Account, token: string) {
  const tokenHash = await hashToken(token);
  const invitation = await db.query.familyInvitations.findFirst({
    where: and(eq(familyInvitations.tokenHash, tokenHash), isNull(familyInvitations.revokedAt)),
  });
  if (!invitation) throw Errors.NOT_FOUND("Invitation not found.");
  if (invitation.expiresAt < new Date()) throw Errors.INVITATION_EXPIRED();

  const existing = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, invitation.familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  const now = new Date();

  if (existing) {
    if (invitation.acceptedAt === null) {
      await db.batch([
        db
          .update(familyInvitations)
          .set({ acceptedAt: now, acceptedByAccountId: account.id })
          .where(
            and(eq(familyInvitations.id, invitation.id), isNull(familyInvitations.acceptedAt)),
          ),
        db.insert(auditEvents).values(
          auditValues({
            actorAccountId: account.id,
            familyId: invitation.familyId,
            action: "INVITATION_ACCEPTED",
            targetType: "FamilyInvitation",
            targetId: invitation.id,
            summary: { role: invitation.role },
          }),
        ),
      ]);
    }
    return { membership: mapMembership(existing), alreadyMember: true };
  }

  if (invitation.acceptedAt !== null)
    throw Errors.INVITATION_USED("Invitation has already been used.");

  // Single-use guarantee without an interactive transaction:
  // 1. insert the membership,
  // 2. claim the invitation with a guarded update,
  // 3. drop the membership again if the claim was lost to a concurrent accept,
  // 4. write the audit event only while the membership exists.
  const membership = {
    id: nanoid(),
    familyId: invitation.familyId,
    accountId: account.id,
    personId: null,
    role: invitation.role,
    joinedAt: now,
    removedAt: null,
  };
  const auditor = auditValues({
    actorAccountId: account.id,
    familyId: invitation.familyId,
    action: "INVITATION_ACCEPTED",
    targetType: "FamilyInvitation",
    targetId: invitation.id,
    summary: { role: invitation.role },
  });

  await db.batch([
    db.insert(familyMemberships).values(membership).onConflictDoNothing(),
    db
      .update(familyInvitations)
      .set({ acceptedAt: now, acceptedByAccountId: account.id })
      .where(and(eq(familyInvitations.id, invitation.id), isNull(familyInvitations.acceptedAt))),
    db
      .delete(familyMemberships)
      .where(
        and(
          eq(familyMemberships.id, membership.id),
          sql`NOT EXISTS (SELECT 1 FROM ${familyInvitations} WHERE ${familyInvitations.id} = ${invitation.id} AND ${familyInvitations.acceptedByAccountId} = ${account.id})`,
        ),
      ),
    db.insert(auditEvents).values(auditor),
    db
      .delete(auditEvents)
      .where(
        and(
          eq(auditEvents.id, auditor.id),
          sql`NOT EXISTS (SELECT 1 FROM ${familyMemberships} WHERE ${familyMemberships.id} = ${membership.id})`,
        ),
      ),
  ]);

  const claimed = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, invitation.familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!claimed) throw Errors.INVITATION_USED("Invitation has already been used.");
  return { membership: mapMembership(claimed), alreadyMember: claimed.id !== membership.id };
}

export async function getMembership(
  familyId: string,
  accountId: string,
): Promise<Membership | undefined> {
  const row = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, accountId),
      isNull(familyMemberships.removedAt),
    ),
  });
  return row ? mapMembership(row) : undefined;
}

function mapMembership(row: typeof familyMemberships.$inferSelect): Membership {
  return {
    id: row.id,
    familyId: row.familyId,
    accountId: row.accountId,
    personId: row.personId,
    role: row.role,
    joinedAt: row.joinedAt,
  };
}

export type { Membership };
