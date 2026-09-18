import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/lib/db";
import {
  accounts as dbAccounts,
  families,
  familyInvitations,
  familyMemberships,
} from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { hashToken, randomToken } from "~/lib/crypto";
import { audit } from "~/modules/audit/service";
import type { Membership } from "~/modules/auth/policy";

export async function createFamily(
  account: Account,
  input: { name: string; description?: string | null },
) {
  return await db.transaction(async (tx) => {
    const [family] = await tx
      .insert(families)
      .values({ name: input.name, description: input.description ?? null })
      .returning();
    const [membership] = await tx
      .insert(familyMemberships)
      .values({
        familyId: family.id,
        accountId: account.id,
        role: "CREATOR",
      })
      .returning();
    await audit(tx, {
      actorAccountId: account.id,
      familyId: family.id,
      action: "FAMILY_CREATED",
      targetType: "Family",
      targetId: family.id,
      summary: { name: family.name },
    });
    return { family, membership: mapMembership(membership) };
  });
}

export async function listFamilies(account: Account) {
  const rows = await db
    .select({
      membership: familyMemberships,
      family: families,
    })
    .from(familyMemberships)
    .innerJoin(families, eq(familyMemberships.familyId, families.id))
    .where(and(eq(familyMemberships.accountId, account.id), isNull(familyMemberships.removedAt)));
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
  input: { name?: string; description?: string | null },
) {
  const row = await getMembership(familyId, account.id);
  if (!row || row.role !== "CREATOR") throw Errors.FORBIDDEN();
  const [updated] = await db
    .update(families)
    .set({
      name: input.name,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(eq(families.id, familyId))
    .returning();
  return updated;
}

export async function deleteFamily(account: Account, familyId: string, confirmation: string) {
  const row = await getMembership(familyId, account.id);
  if (!row || row.role !== "CREATOR") throw Errors.FORBIDDEN();
  const family = await getFamily(familyId);
  if (confirmation !== `delete-${family.id}`) {
    throw Errors.VALIDATION("Confirmation token does not match.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(families)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(families.id, familyId));
    await tx
      .update(familyMemberships)
      .set({ removedAt: new Date() })
      .where(eq(familyMemberships.familyId, familyId));
    await audit(tx, {
      actorAccountId: account.id,
      familyId,
      action: "FAMILY_DELETED",
      targetType: "Family",
      targetId: familyId,
      summary: { name: family.name },
    });
  });
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
  if (!target) throw Errors.NOT_FOUND();
  if (target.role === "CREATOR") throw Errors.FORBIDDEN("Cannot change the Creator role.");
  const [updated] = await db
    .update(familyMemberships)
    .set({ role })
    .where(eq(familyMemberships.id, membershipId))
    .returning();
  return mapMembership(updated);
}

export async function removeMembership(actor: Account, familyId: string, membershipId: string) {
  const actorMembership = await getMembership(familyId, actor.id);
  if (!actorMembership || actorMembership.role !== "CREATOR") throw Errors.FORBIDDEN();
  const target = await db.query.familyMemberships.findFirst({
    where: and(eq(familyMemberships.id, membershipId), eq(familyMemberships.familyId, familyId)),
  });
  if (!target) throw Errors.NOT_FOUND();
  if (target.role === "CREATOR") throw Errors.FORBIDDEN("Cannot remove the Creator.");
  await db
    .update(familyMemberships)
    .set({ removedAt: new Date() })
    .where(eq(familyMemberships.id, membershipId));
  return { removed: true };
}

export async function transferOwnership(
  actor: Account,
  familyId: string,
  newCreatorMembershipId: string,
) {
  return await db.transaction(async (tx) => {
    const current = await tx.query.familyMemberships.findFirst({
      where: and(
        eq(familyMemberships.familyId, familyId),
        eq(familyMemberships.accountId, actor.id),
        isNull(familyMemberships.removedAt),
      ),
    });
    if (!current || current.role !== "CREATOR") throw Errors.FORBIDDEN();
    const target = await tx.query.familyMemberships.findFirst({
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
    await tx
      .update(familyMemberships)
      .set({ role: "CREATOR" })
      .where(eq(familyMemberships.id, newCreatorMembershipId));
    await tx
      .update(familyMemberships)
      .set({ role: "EDITOR" })
      .where(eq(familyMemberships.id, current.id));
    await audit(tx, {
      actorAccountId: actor.id,
      familyId,
      action: "OWNERSHIP_TRANSFERRED",
      targetType: "FamilyMembership",
      targetId: newCreatorMembershipId,
      summary: { fromMembershipId: current.id, toMembershipId: newCreatorMembershipId },
    });
    return { transferred: true };
  });
}

export async function createInvitation(
  actor: Account,
  familyId: string,
  input: { email?: string; role: "EDITOR" | "VIEWER" },
) {
  const actorMembership = await getMembership(familyId, actor.id);
  if (!actorMembership || actorMembership.role !== "CREATOR") throw Errors.FORBIDDEN();
  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invitation] = await db
    .insert(familyInvitations)
    .values({
      familyId,
      createdByAccountId: actor.id,
      invitedEmail: input.email ?? null,
      role: input.role,
      tokenHash,
      expiresAt,
    })
    .returning();
  return { invitation, token };
}

export async function acceptInvitation(account: Account, token: string) {
  const tokenHash = hashToken(token);
  const invitation = await db.query.familyInvitations.findFirst({
    where: and(eq(familyInvitations.tokenHash, tokenHash), isNull(familyInvitations.revokedAt)),
  });
  if (!invitation) throw Errors.NOT_FOUND("Invitation not found.");
  if (invitation.expiresAt < new Date()) throw Errors.INVITATION_EXPIRED();

  return await db.transaction(async (tx) => {
    const existing = await tx.query.familyMemberships.findFirst({
      where: and(
        eq(familyMemberships.familyId, invitation.familyId),
        eq(familyMemberships.accountId, account.id),
        isNull(familyMemberships.removedAt),
      ),
    });
    if (existing) {
      if (invitation.acceptedAt === null) {
        await tx
          .update(familyInvitations)
          .set({ acceptedAt: new Date(), acceptedByAccountId: account.id })
          .where(eq(familyInvitations.id, invitation.id));
      }
      return { membership: mapMembership(existing), alreadyMember: true };
    }
    if (invitation.acceptedAt !== null)
      throw Errors.INVITATION_USED("Invitation has already been used.");
    const [membership] = await tx
      .insert(familyMemberships)
      .values({
        familyId: invitation.familyId,
        accountId: account.id,
        role: invitation.role,
      })
      .returning();
    await tx
      .update(familyInvitations)
      .set({ acceptedAt: new Date(), acceptedByAccountId: account.id })
      .where(eq(familyInvitations.id, invitation.id));
    await audit(tx, {
      actorAccountId: account.id,
      familyId: invitation.familyId,
      action: "INVITATION_ACCEPTED",
      targetType: "FamilyInvitation",
      targetId: invitation.id,
      summary: { role: invitation.role },
    });
    return { membership: mapMembership(membership), alreadyMember: false };
  });
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
