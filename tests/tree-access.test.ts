import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { setup } from "./setup";
import { apiRequest, getTestToken } from "./helpers";

// Server-side guarantees the interactive family map relies on: the client
// hides controls for convenience only, so every rule here must hold even for
// requests the UI would never send.

beforeAll(setup);

beforeEach(async () => {
  for (const table of [
    schema.parentChildRelationships,
    schema.people,
    schema.familyInvitations,
    schema.familyMemberships,
    schema.auditEvents,
    schema.families,
    schema.accounts,
  ]) {
    await db.run(sql`DELETE FROM ${table}`);
  }
});

async function familyWithPeople(token: string, names: string[]) {
  const { body } = await apiRequest("POST", "/api/v1/families", { name: "Family" }, token);
  const familyId = body.family.id as string;
  const ids: string[] = [];
  for (const name of names) {
    const res = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name, gender: "other" },
      token,
    );
    ids.push(res.body.person.id);
  }
  return { familyId, ids };
}

async function link(token: string, familyId: string, parent: string, child: string) {
  return apiRequest(
    "POST",
    `/api/v1/families/${familyId}/relationships/parent-child`,
    { parentPersonId: parent, childPersonId: child },
    token,
  );
}

async function addMember(creator: string, familyId: string, subject: string, role: string) {
  const { body } = await apiRequest(
    "POST",
    `/api/v1/families/${familyId}/invitations`,
    { role },
    creator,
  );
  const token = await getTestToken(subject);
  await apiRequest("POST", `/api/v1/invitations/${body.token}/accept`, {}, token);
  return token;
}

describe("family tree access", () => {
  it("refuses the tree to someone outside the family", async () => {
    const owner = await getTestToken("owner");
    const { familyId } = await familyWithPeople(owner, ["A", "B"]);
    const outsider = await getTestToken("outsider");
    const res = await apiRequest("GET", `/api/v1/families/${familyId}/tree`, undefined, outsider);
    expect(res.status).toBe(403);
    expect(res.body.people).toBeUndefined();
  });

  it("never returns another family's people, even as a root", async () => {
    const owner = await getTestToken("owner");
    const mine = await familyWithPeople(owner, ["Mine"]);
    const theirsOwner = await getTestToken("other-owner");
    const theirs = await familyWithPeople(theirsOwner, ["Theirs parent", "Theirs child"]);
    await link(theirsOwner, theirs.familyId, theirs.ids[0], theirs.ids[1]);

    const viaRoot = await apiRequest(
      "GET",
      `/api/v1/families/${mine.familyId}/tree?rootPersonId=${theirs.ids[0]}&direction=descendants&depth=1`,
      undefined,
      owner,
    );
    expect(viaRoot.status).toBe(404);

    const whole = await apiRequest(
      "GET",
      `/api/v1/families/${mine.familyId}/tree`,
      undefined,
      owner,
    );
    expect(whole.body.people.map((p: any) => p.id)).toEqual([mine.ids[0]]);
    expect(whole.body.edges).toEqual([]);
  });

  it("lets a viewer read the tree but not change relationships", async () => {
    const owner = await getTestToken("owner");
    const { familyId, ids } = await familyWithPeople(owner, ["Parent", "Child", "Other"]);
    const created = await link(owner, familyId, ids[0], ids[1]);
    const viewer = await addMember(owner, familyId, "viewer", "VIEWER");

    const tree = await apiRequest("GET", `/api/v1/families/${familyId}/tree`, undefined, viewer);
    expect(tree.status).toBe(200);
    expect(tree.body.edges).toHaveLength(1);

    const add = await link(viewer, familyId, ids[1], ids[2]);
    expect(add.status).toBe(403);
    const remove = await apiRequest(
      "DELETE",
      `/api/v1/families/${familyId}/relationships/parent-child/${created.body.edge.id}`,
      undefined,
      viewer,
    );
    expect(remove.status).toBe(403);
    const edges = await db.query.parentChildRelationships.findMany({
      where: eq(schema.parentChildRelationships.familyId, familyId),
    });
    expect(edges).toHaveLength(1);
  });

  it("returns the created edge so the map can merge it, and audits it", async () => {
    const owner = await getTestToken("owner");
    const { familyId, ids } = await familyWithPeople(owner, ["Parent", "Child"]);
    const editor = await addMember(owner, familyId, "editor", "EDITOR");
    const res = await link(editor, familyId, ids[0], ids[1]);
    expect(res.status).toBe(201);
    expect(res.body.edge).toMatchObject({
      familyId,
      parentPersonId: ids[0],
      childPersonId: ids[1],
    });
    expect(typeof res.body.edge.id).toBe("string");
    const audit = await db.query.auditEvents.findFirst({
      where: and(
        eq(schema.auditEvents.familyId, familyId),
        eq(schema.auditEvents.action, "PARENT_CHILD_EDGE_ADDED"),
      ),
    });
    expect(audit?.targetId).toBe(res.body.edge.id);
  });

  it("keeps rejecting duplicates and cycles", async () => {
    const owner = await getTestToken("owner");
    const { familyId, ids } = await familyWithPeople(owner, ["A", "B", "C"]);
    await link(owner, familyId, ids[0], ids[1]);
    await link(owner, familyId, ids[1], ids[2]);
    const duplicate = await link(owner, familyId, ids[0], ids[1]);
    expect(duplicate.body.error.code).toBe("TREE_DUPLICATE_EDGE");
    const cycle = await link(owner, familyId, ids[2], ids[0]);
    expect(cycle.body.error.code).toBe("TREE_CYCLE");
  });

  it("returns a shared descendant once with every parent edge", async () => {
    const owner = await getTestToken("owner");
    const { familyId, ids } = await familyWithPeople(owner, ["Mum", "Dad", "Kid"]);
    await link(owner, familyId, ids[0], ids[2]);
    await link(owner, familyId, ids[1], ids[2]);
    const tree = await apiRequest("GET", `/api/v1/families/${familyId}/tree`, undefined, owner);
    expect(tree.body.people.filter((p: any) => p.id === ids[2])).toHaveLength(1);
    expect(tree.body.edges.filter((e: any) => e.childPersonId === ids[2])).toHaveLength(2);
  });
});
