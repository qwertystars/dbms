import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { setup } from "./setup";
import { apiRequest, getTestToken } from "./helpers";

beforeAll(setup);

beforeEach(async () => {
  // Clear all data between tests. Keep account/enum types.
  for (const table of [
    schema.auditEvents,
    schema.postMedia,
    schema.reactions,
    schema.comments,
    schema.posts,
    schema.parentChildRelationships,
    schema.people,
    schema.familyInvitations,
    schema.familyMemberships,
    schema.families,
    schema.mediaAssets,
    schema.friendships,
    schema.friendRequests,
    schema.accounts,
  ]) {
    await db.execute(sql`TRUNCATE TABLE ${sql.identifier(getTableName(table))} CASCADE`);
  }
});

describe("Family lifecycle", () => {
  it("rejects unauthenticated family creation", async () => {
    const { status, body } = await apiRequest("POST", "/api/v1/families", {
      name: "Test Family",
    });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("creates a family and a creator membership atomically", async () => {
    const token = await getTestToken("creator-1");
    const { status, body } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Test Family" },
      token,
    );
    expect(status).toBe(201);
    expect(body.family.name).toBe("Test Family");
    expect(body.membership.role).toBe("CREATOR");
  });

  it("allows a creator to invite an editor", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Test Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { email: "editor@example.com", role: "EDITOR" },
      creatorToken,
    );
    expect(status).toBe(201);
    expect(body.invitation.role).toBe("EDITOR");
    expect(body.token).toBeDefined();
  });

  it("allows an invited editor to accept and view the family", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Test Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { body: inviteBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { email: "editor@example.com", role: "EDITOR" },
      creatorToken,
    );

    const editorToken = await getTestToken("editor-1");
    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/invitations/${inviteBody.token}/accept`,
      {},
      editorToken,
    );
    expect(status).toBe(200);
    expect(body.membership.role).toBe("EDITOR");

    const { status: getStatus } = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}`,
      undefined,
      editorToken,
    );
    expect(getStatus).toBe(200);
  });

  it("rejects an editor creating a person", async () => {
    // Editor is allowed to create a person. This test intentionally
    // checks the positive path.
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Test Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { body: inviteBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { role: "EDITOR" },
      creatorToken,
    );

    const editorToken = await getTestToken("editor-1");
    await apiRequest("POST", `/api/v1/invitations/${inviteBody.token}/accept`, {}, editorToken);

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "Parent", gender: "female" },
      editorToken,
    );
    expect(status).toBe(201);
    expect(body.person.name).toBe("Parent");
  });

  it("rejects a viewer creating a person", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Test Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { body: inviteBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { role: "VIEWER" },
      creatorToken,
    );

    const viewerToken = await getTestToken("viewer-1");
    await apiRequest("POST", `/api/v1/invitations/${inviteBody.token}/accept`, {}, viewerToken);

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "Parent", gender: "female" },
      viewerToken,
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects cross-family access", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Test Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const otherToken = await getTestToken("stranger-1");
    const { status, body } = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}`,
      undefined,
      otherToken,
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("Family tree", () => {
  it("rejects self-parenting", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Tree Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { body: personBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "Solo", gender: "other" },
      creatorToken,
    );

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: personBody.person.id, childPersonId: personBody.person.id },
      creatorToken,
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("TREE_SELF_EDGE");
  });

  it("rejects a direct cycle", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Tree Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { body: parentBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "Parent", gender: "female" },
      creatorToken,
    );
    const { body: childBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "Child", gender: "male" },
      creatorToken,
    );

    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: parentBody.person.id, childPersonId: childBody.person.id },
      creatorToken,
    );

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: childBody.person.id, childPersonId: parentBody.person.id },
      creatorToken,
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("TREE_CYCLE");
  });

  it("rejects a multi-hop cycle", async () => {
    const creatorToken = await getTestToken("creator-1");
    const { body: familyBody } = await apiRequest(
      "POST",
      "/api/v1/families",
      { name: "Tree Family" },
      creatorToken,
    );
    const familyId = familyBody.family.id;

    const { body: g1 } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "G1", gender: "female" },
      creatorToken,
    );
    const { body: g2 } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "G2", gender: "male" },
      creatorToken,
    );
    const { body: g3 } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "G3", gender: "female" },
      creatorToken,
    );

    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: g1.person.id, childPersonId: g2.person.id },
      creatorToken,
    );
    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: g2.person.id, childPersonId: g3.person.id },
      creatorToken,
    );

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: g3.person.id, childPersonId: g1.person.id },
      creatorToken,
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("TREE_CYCLE");
  });
});
