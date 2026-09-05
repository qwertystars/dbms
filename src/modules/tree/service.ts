import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
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
    // Lock the family edges to prevent concurrent cycles.
    await tx
      .select()
      .from(parentChildRelationships)
      .where(eq(parentChildRelationships.familyId, familyId))
      .for("update");

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
    const reaches = await tx.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT child_person_id AS id FROM parent_child_relationships
        WHERE family_id = ${familyId} AND parent_person_id = ${childPersonId}
        UNION
        SELECT pcr.child_person_id
        FROM parent_child_relationships pcr
        JOIN descendants d ON pcr.parent_person_id = d.id
        WHERE pcr.family_id = ${familyId}
      )
      SELECT 1 FROM descendants WHERE id = ${parentPersonId} LIMIT 1
    `);
    if (reaches.rows.length > 0) {
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
  if (rootPersonId) {
    const root = await db.query.people.findFirst({
      where: and(
        eq(people.id, rootPersonId),
        eq(people.familyId, familyId),
        isNull(people.deletedAt),
      ),
    });
    if (!root) throw Errors.NOT_FOUND();
  }

  const edges = await db.query.parentChildRelationships.findMany({
    where: eq(parentChildRelationships.familyId, familyId),
  });

  let personIds = new Set<string>();
  if (rootPersonId) personIds.add(rootPersonId);

  if (direction === "both" || direction === "ancestors") {
    const rows = await db.execute(sql`
      WITH RECURSIVE ancestors AS (
        SELECT parent_person_id AS id FROM parent_child_relationships
        WHERE family_id = ${familyId} AND child_person_id = ${rootPersonId ?? null}::uuid
        UNION
        SELECT pcr.parent_person_id
        FROM parent_child_relationships pcr
        JOIN ancestors a ON pcr.child_person_id = a.id
        WHERE pcr.family_id = ${familyId}
      )
      SELECT id FROM ancestors
    `);
    for (const row of rows.rows) {
      personIds.add((row as { id: string }).id);
    }
  }

  if (direction === "both" || direction === "descendants") {
    const rows = await db.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT child_person_id AS id FROM parent_child_relationships
        WHERE family_id = ${familyId} AND parent_person_id = ${rootPersonId ?? null}::uuid
        UNION
        SELECT pcr.child_person_id
        FROM parent_child_relationships pcr
        JOIN descendants d ON pcr.parent_person_id = d.id
        WHERE pcr.family_id = ${familyId}
      )
      SELECT id FROM descendants
    `);
    for (const row of rows.rows) {
      personIds.add((row as { id: string }).id);
    }
  }

  // For "both" without root, return entire family graph.
  if (direction === "both" && !rootPersonId) {
    const allEdges = edges;
    personIds = new Set(allEdges.flatMap((e) => [e.parentPersonId, e.childPersonId]));
  }

  if (personIds.size === 0) {
    const allPeople = await db.query.people.findMany({
      where: and(eq(people.familyId, familyId), isNull(people.deletedAt)),
    });
    return { people: allPeople, edges };
  }

  const allPeople = await db.query.people.findMany({
    where: and(
      eq(people.familyId, familyId),
      inArray(people.id, Array.from(personIds)),
      isNull(people.deletedAt),
    ),
  });

  const edgePersonIds = new Set(allPeople.map((p) => p.id));
  const visibleEdges = edges.filter(
    (e) => edgePersonIds.has(e.parentPersonId) && edgePersonIds.has(e.childPersonId),
  );

  return { people: allPeople, edges: visibleEdges };
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
