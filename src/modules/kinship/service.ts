import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/lib/db";
import { families, familyMemberships, parentChildRelationships, people } from "~/db/schema";
import type { Audience, FamilyRole } from "~/db/schema";
import { Errors } from "~/lib/errors";
import { KinshipGraph, type Kinship } from "~/modules/kinship/kinship";

/**
 * How a family member relates to a person, as far as privacy is concerned.
 *
 * - `SELF`: the person the viewer's membership is linked to
 * - `CLOSE`: within the family's close-family degree of the viewer's person
 * - `FAR`: related, but further than the close-family degree
 * - `UNKNOWN`: no path in the tree, or the viewer is not linked to a person
 */
export type Circle = "SELF" | "CLOSE" | "FAR" | "UNKNOWN";

export interface ViewerContext {
  familyId: string;
  accountId: string;
  role: FamilyRole;
  membershipId: string;
  /** The person the viewer's membership is linked to, if any. */
  personId: string | null;
  closeFamilyDegree: number;
  /** Creators and Editors maintain the tree and see every profile field. */
  isMaintainer: boolean;
  relatives: Map<string, Kinship>;
  /** Active members' linked people, keyed by account id. */
  memberPersons: Map<string, string | null>;
}

export interface KinshipView {
  label: string | null;
  degree: number | null;
  byMarriage: boolean;
  circle: Circle;
}

/**
 * Loads everything needed to answer "how close is this viewer to that person"
 * for one family. Throws FORBIDDEN when the account is not an active member.
 */
export async function loadViewerContext(
  accountId: string,
  familyId: string,
): Promise<ViewerContext> {
  const [family, memberships] = await Promise.all([
    db.query.families.findFirst({
      where: and(eq(families.id, familyId), isNull(families.deletedAt)),
    }),
    db.query.familyMemberships.findMany({
      where: and(eq(familyMemberships.familyId, familyId), isNull(familyMemberships.removedAt)),
    }),
  ]);
  const membership = memberships.find((m) => m.accountId === accountId);
  if (!family || !membership) throw Errors.FORBIDDEN("You are not a member of this family.");

  const relatives = membership.personId
    ? (await loadGraph(familyId)).relativesOf(membership.personId)
    : new Map<string, Kinship>();

  return {
    familyId,
    accountId,
    role: membership.role,
    membershipId: membership.id,
    personId: membership.personId,
    closeFamilyDegree: family.closeFamilyDegree,
    isMaintainer: membership.role === "CREATOR" || membership.role === "EDITOR",
    relatives,
    memberPersons: new Map(memberships.map((m) => [m.accountId, m.personId])),
  };
}

export async function loadGraph(familyId: string): Promise<KinshipGraph> {
  const [livePeople, edges] = await Promise.all([
    db
      .select({ id: people.id, gender: people.gender })
      .from(people)
      .where(and(eq(people.familyId, familyId), isNull(people.deletedAt))),
    db
      .select({
        parentPersonId: parentChildRelationships.parentPersonId,
        childPersonId: parentChildRelationships.childPersonId,
      })
      .from(parentChildRelationships)
      .where(eq(parentChildRelationships.familyId, familyId)),
  ]);
  return new KinshipGraph(livePeople, edges);
}

export function circleOf(ctx: ViewerContext, personId: string | null | undefined): Circle {
  if (!personId || !ctx.personId) return "UNKNOWN";
  if (personId === ctx.personId) return "SELF";
  const kinship = ctx.relatives.get(personId);
  if (!kinship) return "UNKNOWN";
  return kinship.degree <= ctx.closeFamilyDegree ? "CLOSE" : "FAR";
}

export function kinshipView(ctx: ViewerContext, personId: string): KinshipView {
  const kinship = ctx.relatives.get(personId);
  return {
    label: kinship?.label ?? null,
    degree: kinship?.degree ?? null,
    byMarriage: kinship?.byMarriage ?? false,
    circle: circleOf(ctx, personId),
  };
}

/** Whether the account's linked person is the viewer or in the viewer's close family. */
export function isCloseAccount(ctx: ViewerContext, accountId: string): boolean {
  if (accountId === ctx.accountId) return true;
  const circle = circleOf(ctx, ctx.memberPersons.get(accountId));
  return circle === "SELF" || circle === "CLOSE";
}

/** Accounts whose close-family content the viewer may see (always includes the viewer). */
export function closeAccountIds(ctx: ViewerContext): string[] {
  return Array.from(ctx.memberPersons.keys()).filter((id) => isCloseAccount(ctx, id));
}

/**
 * Close-family content is visible to its author and to members whose linked
 * person is within the close-family degree of the author's linked person.
 * Kinship degree is symmetric, so this is evaluated from the viewer's side.
 */
export function canSeeAudience(
  ctx: ViewerContext,
  audience: Audience,
  authorAccountId: string,
): boolean {
  return audience === "FAMILY" || isCloseAccount(ctx, authorAccountId);
}
