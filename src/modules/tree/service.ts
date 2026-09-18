import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import { familyMemberships, parentChildRelationships, people } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { audit } from "~/modules/audit/service";

export async function addParentChildEdge(
  account: Account,
  familyId: string,
  parentPersonId: string,
  childPersonId: string,
) {
  if (parentPersonId === childPersonId) throw Errors.TREE_SELF_EDGE();

  const membership = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!membership || (membership.role !== "CREATOR" && membership.role !== "EDITOR")) {
    throw Errors.FORBIDDEN();
  }

  await verifyPeopleInFamily(familyId, [parentPersonId, childPersonId]);

  return await db.transaction(async (tx) => {
    // Reject duplicate edge.
    const existing = await tx.query.parentChildRelationships.findFirst({
      where: and(
        eq(parentChildRelationships.familyId, familyId),
        eq(parentChildRelationships.parentPersonId, parentPersonId),
        eq(parentChildRelationships.childPersonId, childPersonId),
      ),
    });
    if (existing) throw Errors.TREE_DUPLICATE_EDGE();

    // Cycle detection: child must not already reach parent.
    const reaches = await tx.all(sql`
      WITH RECURSIVE descendants AS (
        SELECT child_person_id AS id FROM parent_child_relationships
        WHERE family_id = ${familyId} AND parent_person_id = ${childPersonId}
        UNION
        SELECT pcr.child_person_id
        FROM parent_child_relationships pcr
        JOIN descendants d ON pcr.parent_person_id = d.id
        WHERE pcr.family_id = ${familyId}
      )
      SELECT 1 AS found FROM descendants WHERE id = ${parentPersonId} LIMIT 1
    `);
    if (reaches.length > 0) {
      throw Errors.TREE_CYCLE();
    }

    const [edge] = await tx
      .insert(parentChildRelationships)
      .values({
        familyId,
        parentPersonId,
        childPersonId,
        createdByAccountId: account.id,
      })
      .returning();

    await audit(tx, {
      actorAccountId: account.id,
      familyId,
      action: "PARENT_CHILD_EDGE_ADDED",
      targetType: "ParentChildRelationship",
      targetId: edge.id,
      summary: { parentPersonId, childPersonId },
    });

    return edge;
  });
}

export async function removeParentChildEdge(
  account: Account,
  familyId: string,
  relationshipId: string,
) {
  const membership = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!membership || (membership.role !== "CREATOR" && membership.role !== "EDITOR")) {
    throw Errors.FORBIDDEN();
  }

  return await db.transaction(async (tx) => {
    const edge = await tx.query.parentChildRelationships.findFirst({
      where: and(
        eq(parentChildRelationships.id, relationshipId),
        eq(parentChildRelationships.familyId, familyId),
      ),
    });
    if (!edge) throw Errors.NOT_FOUND();
    await tx
      .delete(parentChildRelationships)
      .where(eq(parentChildRelationships.id, relationshipId));
    await audit(tx, {
      actorAccountId: account.id,
      familyId,
      action: "PARENT_CHILD_EDGE_REMOVED",
      targetType: "ParentChildRelationship",
      targetId: relationshipId,
      summary: { parentPersonId: edge.parentPersonId, childPersonId: edge.childPersonId },
    });
    return { removed: true };
  });
}

export async function getTree(
  familyId: string,
  rootPersonId?: string,
  direction: "ancestors" | "descendants" | "both" = "both",
  depth = 100,
) {
  const edges = await db.query.parentChildRelationships.findMany({
    where: eq(parentChildRelationships.familyId, familyId),
  });

  // Without a root, return the whole family: every live person (including
  // people with no relationships yet) and every edge between live people.
  if (!rootPersonId) {
    const allPeople = await db.query.people.findMany({
      where: and(eq(people.familyId, familyId), isNull(people.deletedAt)),
    });
    return { people: allPeople, edges: edgesBetween(allPeople, edges) };
  }

  const root = await db.query.people.findFirst({
    where: and(
      eq(people.id, rootPersonId),
      eq(people.familyId, familyId),
      isNull(people.deletedAt),
    ),
  });
  if (!root) throw Errors.NOT_FOUND();

  const maxDepth = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 100;
  const personIds = new Set<string>([rootPersonId]);

  if (direction === "both" || direction === "ancestors") {
    const rows = await db.all(sql`
      WITH RECURSIVE ancestors(id, depth) AS (
        SELECT parent_person_id, 1 FROM parent_child_relationships
        WHERE family_id = ${familyId} AND child_person_id = ${rootPersonId}
        UNION
        SELECT pcr.parent_person_id, a.depth + 1
        FROM parent_child_relationships pcr
        JOIN ancestors a ON pcr.child_person_id = a.id
        WHERE pcr.family_id = ${familyId} AND a.depth < ${maxDepth}
      )
      SELECT DISTINCT id FROM ancestors
    `);
    for (const row of rows) {
      personIds.add((row as { id: string }).id);
    }
  }

  if (direction === "both" || direction === "descendants") {
    const rows = await db.all(sql`
      WITH RECURSIVE descendants(id, depth) AS (
        SELECT child_person_id, 1 FROM parent_child_relationships
        WHERE family_id = ${familyId} AND parent_person_id = ${rootPersonId}
        UNION
        SELECT pcr.child_person_id, d.depth + 1
        FROM parent_child_relationships pcr
        JOIN descendants d ON pcr.parent_person_id = d.id
        WHERE pcr.family_id = ${familyId} AND d.depth < ${maxDepth}
      )
      SELECT DISTINCT id FROM descendants
    `);
    for (const row of rows) {
      personIds.add((row as { id: string }).id);
    }
  }

  const treePeople = await db.query.people.findMany({
    where: and(
      eq(people.familyId, familyId),
      inArray(people.id, Array.from(personIds)),
      isNull(people.deletedAt),
    ),
  });

  return { people: treePeople, edges: edgesBetween(treePeople, edges) };
}

function edgesBetween<T extends { parentPersonId: string; childPersonId: string }>(
  visiblePeople: { id: string }[],
  edges: T[],
): T[] {
  const ids = new Set(visiblePeople.map((p) => p.id));
  return edges.filter((e) => ids.has(e.parentPersonId) && ids.has(e.childPersonId));
}

async function verifyPeopleInFamily(familyId: string, personIds: string[]) {
  const rows = await db.query.people.findMany({
    where: and(
      inArray(people.id, personIds),
      eq(people.familyId, familyId),
      isNull(people.deletedAt),
    ),
  });
  if (rows.length !== personIds.length) {
    throw Errors.PERSON_NOT_IN_FAMILY();
  }
}
