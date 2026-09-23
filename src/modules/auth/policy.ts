import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/lib/db";
import { familyMemberships } from "~/db/schema";
import type { Account } from "~/lib/context";
import { Errors } from "~/lib/errors";

export type FamilyRole = "CREATOR" | "EDITOR" | "VIEWER";

export interface Membership {
  id: string;
  familyId: string;
  accountId: string;
  personId: string | null;
  role: FamilyRole;
  joinedAt: Date;
}

export async function getActiveMembership(
  accountId: string,
  familyId: string,
): Promise<Membership | undefined> {
  const row = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, accountId),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!row) return undefined;
  return row as Membership;
}

export function requireMembership(membership: Membership | undefined): Membership {
  if (!membership) throw Errors.FORBIDDEN("You are not a member of this family.");
  return membership;
}

export function requireRole(membership: Membership, ...allowed: FamilyRole[]) {
  if (!allowed.includes(membership.role)) {
    throw Errors.FORBIDDEN(`This action requires one of: ${allowed.join(", ")}.`);
  }
}

export async function canViewFamily(accountId: string, familyId: string): Promise<boolean> {
  return (await getActiveMembership(accountId, familyId)) !== undefined;
}

export async function assertCanViewFamily(account: Account, familyId: string): Promise<Membership> {
  return requireMembership(await getActiveMembership(account.id, familyId));
}

export async function assertCanEditTree(account: Account, familyId: string): Promise<Membership> {
  const m = requireMembership(await getActiveMembership(account.id, familyId));
  requireRole(m, "CREATOR", "EDITOR");
  return m;
}

export async function assertCanDeletePerson(
  account: Account,
  familyId: string,
): Promise<Membership> {
  const m = requireMembership(await getActiveMembership(account.id, familyId));
  requireRole(m, "CREATOR");
  return m;
}

export async function assertCanManageMembers(
  account: Account,
  familyId: string,
): Promise<Membership> {
  const m = requireMembership(await getActiveMembership(account.id, familyId));
  requireRole(m, "CREATOR");
  return m;
}

export async function assertCanPost(account: Account, familyId: string): Promise<Membership> {
  return requireMembership(await getActiveMembership(account.id, familyId));
}
