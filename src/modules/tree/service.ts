import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import {
  auditEvents,
  familyMemberships,
  parentChildRelationships,
  partnerRelationships,
  people,
} from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";

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
  await assertNoDuplicateEdge(familyId, parentPersonId, childPersonId);
  await assertNoCycle(familyId, parentPersonId, childPersonId);

  const edge = {
    id: nanoid(),
    familyId,
    parentPersonId,
    childPersonId,
    createdByAccountId: account.id,
    createdAt: new Date(),
  };
  const auditor = auditValues({
    actorAccountId: account.id,
    familyId,
    action: "PARENT_CHILD_EDGE_ADDED",
    targetType: "ParentChildRelationship",
    targetId: edge.id,
    summary: { parentPersonId, childPersonId },
  });

  await db.batch([
    db.insert(parentChildRelationships).values(edge).onConflictDoNothing(),
    db.insert(auditEvents).values(auditor),
    // If the insert lost a race (duplicate edge), remove the audit event too.
    db
      .delete(auditEvents)
      .where(
        and(
          eq(auditEvents.id, auditor.id),
          sql`NOT EXISTS (SELECT 1 FROM ${parentChildRelationships} WHERE ${parentChildRelationships.id} = ${edge.id})`,
        ),
      ),
  ]);

  const created = await db.query.parentChildRelationships.findFirst({
    where: eq(parentChildRelationships.id, edge.id),
  });
  if (!created) {
    // Re-run the checks so callers get the accurate conflict code.
    await assertNoDuplicateEdge(familyId, parentPersonId, childPersonId);
    throw Errors.TREE_CYCLE();
  }
  return created;
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

  const edge = await db.query.parentChildRelationships.findFirst({
    where: and(
      eq(parentChildRelationships.id, relationshipId),
      eq(parentChildRelationships.familyId, familyId),
    ),
  });
  if (!edge) throw Errors.NOT_FOUND();

  await db.batch([
    db.delete(parentChildRelationships).where(eq(parentChildRelationships.id, relationshipId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "PARENT_CHILD_EDGE_REMOVED",
        targetType: "ParentChildRelationship",
        targetId: relationshipId,
        summary: { parentPersonId: edge.parentPersonId, childPersonId: edge.childPersonId },
      }),
    ),
  ]);
  return { removed: true };
}

export async function getTree(
  familyId: string,
  rootPersonId?: string,
  direction: "ancestors" | "descendants" | "both" = "both",
  depth = 100,
) {
  const [edges, partnerRows] = await Promise.all([
    db.query.parentChildRelationships.findMany({
      where: eq(parentChildRelationships.familyId, familyId),
    }),
    db.query.partnerRelationships.findMany({
      where: eq(partnerRelationships.familyId, familyId),
    }),
  ]);

  // Without a root, return the whole family: every live person (including
  // people with no relationships yet) and every edge between live people.
  if (!rootPersonId) {
    const allPeople = await db.query.people.findMany({
      where: and(eq(people.familyId, familyId), isNull(people.deletedAt)),
    });
    return {
      people: allPeople,
      edges: edgesBetween(allPeople, edges),
      partners: partnersBetween(allPeople, partnerRows),
    };
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

  for (const row of partnerRows) {
    if (row.personAId === rootPersonId) personIds.add(row.personBId);
    if (row.personBId === rootPersonId) personIds.add(row.personAId);
  }

  const treePeople = await db.query.people.findMany({
    where: and(
      eq(people.familyId, familyId),
      inArray(people.id, Array.from(personIds)),
      isNull(people.deletedAt),
    ),
  });

  return {
    people: treePeople,
    edges: edgesBetween(treePeople, edges),
    partners: partnersBetween(treePeople, partnerRows),
  };
}

function partnersBetween<T extends { personAId: string; personBId: string }>(
  visiblePeople: { id: string }[],
  rows: T[],
): T[] {
  const ids = new Set(visiblePeople.map((p) => p.id));
  return rows.filter((r) => ids.has(r.personAId) && ids.has(r.personBId));
}

async function requireTreeEditor(account: Account, familyId: string) {
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
  return membership;
}

/** Records two people as partners. Partnership is symmetric and never implies parentage. */
export async function addPartner(
  account: Account,
  familyId: string,
  firstPersonId: string,
  secondPersonId: string,
) {
  if (firstPersonId === secondPersonId) throw Errors.PARTNER_SELF();
  await requireTreeEditor(account, familyId);
  await verifyPeopleInFamily(familyId, [firstPersonId, secondPersonId]);

  const [personAId, personBId] = [firstPersonId, secondPersonId].sort();
  const existing = await db.query.partnerRelationships.findFirst({
    where: and(
      eq(partnerRelationships.familyId, familyId),
      eq(partnerRelationships.personAId, personAId),
      eq(partnerRelationships.personBId, personBId),
    ),
  });
  if (existing) throw Errors.PARTNER_DUPLICATE();

  const partner = {
    id: nanoid(),
    familyId,
    personAId,
    personBId,
    createdByAccountId: account.id,
    createdAt: new Date(),
  };
  const auditor = auditValues({
    actorAccountId: account.id,
    familyId,
    action: "PARTNER_ADDED",
    targetType: "PartnerRelationship",
    targetId: partner.id,
    summary: { personAId, personBId },
  });
  await db.batch([
    db.insert(partnerRelationships).values(partner).onConflictDoNothing(),
    db.insert(auditEvents).values(auditor),
    db
      .delete(auditEvents)
      .where(
        and(
          eq(auditEvents.id, auditor.id),
          sql`NOT EXISTS (SELECT 1 FROM ${partnerRelationships} WHERE ${partnerRelationships.id} = ${partner.id})`,
        ),
      ),
  ]);
  const created = await db.query.partnerRelationships.findFirst({
    where: eq(partnerRelationships.id, partner.id),
  });
  if (!created) throw Errors.PARTNER_DUPLICATE();
  return created;
}

export async function removePartner(account: Account, familyId: string, relationshipId: string) {
  await requireTreeEditor(account, familyId);
  const row = await db.query.partnerRelationships.findFirst({
    where: and(
      eq(partnerRelationships.id, relationshipId),
      eq(partnerRelationships.familyId, familyId),
    ),
  });
  if (!row) throw Errors.NOT_FOUND();
  await db.batch([
    db.delete(partnerRelationships).where(eq(partnerRelationships.id, relationshipId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "PARTNER_REMOVED",
        targetType: "PartnerRelationship",
        targetId: relationshipId,
        summary: { personAId: row.personAId, personBId: row.personBId },
      }),
    ),
  ]);
  return { removed: true };
}

function edgesBetween<T extends { parentPersonId: string; childPersonId: string }>(
  visiblePeople: { id: string }[],
  edges: T[],
): T[] {
  const ids = new Set(visiblePeople.map((p) => p.id));
  return edges.filter((e) => ids.has(e.parentPersonId) && ids.has(e.childPersonId));
}

async function assertNoDuplicateEdge(
  familyId: string,
  parentPersonId: string,
  childPersonId: string,
): Promise<void> {
  const existing = await db.query.parentChildRelationships.findFirst({
    where: and(
      eq(parentChildRelationships.familyId, familyId),
      eq(parentChildRelationships.parentPersonId, parentPersonId),
      eq(parentChildRelationships.childPersonId, childPersonId),
    ),
  });
  if (existing) throw Errors.TREE_DUPLICATE_EDGE();
}

async function assertNoCycle(
  familyId: string,
  parentPersonId: string,
  childPersonId: string,
): Promise<void> {
  const reaches = await db.all(sql`
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
  if (reaches.length > 0) throw Errors.TREE_CYCLE();
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
