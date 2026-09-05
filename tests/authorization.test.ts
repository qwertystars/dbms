import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { setup } from "./setup";
import { apiRequest, getTestToken } from "./helpers";

beforeAll(setup);

beforeEach(async () => {
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

async function createFamily(token: string, name = "A Family") {
  const { body } = await apiRequest("POST", "/api/v1/families", { name }, token);
  return body.family.id as string;
}

async function inviteAndAccept(
  creatorToken: string,
  familyId: string,
  targetSubject: string,
  role: "EDITOR" | "VIEWER",
) {
  const { body } = await apiRequest(
    "POST",
    `/api/v1/families/${familyId}/invitations`,
    { role },
    creatorToken,
  );
  const targetToken = await getTestToken(targetSubject);
  await apiRequest("POST", `/api/v1/invitations/${body.token}/accept`, {}, targetToken);
  return { invitationToken: body.token, targetToken };
}

describe("Authorization matrix", () => {
  it("Viewer cannot create a person", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const { targetToken: viewerToken } = await inviteAndAccept(
      creatorToken,
      familyId,
      "viewer",
      "VIEWER",
    );

    const { status } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "New", gender: "other" },
      viewerToken,
    );
    expect(status).toBe(403);
  });

  it("Editor cannot delete a person", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const { targetToken: editorToken } = await inviteAndAccept(
      creatorToken,
      familyId,
      "editor",
      "EDITOR",
    );

    const { body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "ToDelete", gender: "other" },
      creatorToken,
    );
    const personId = body.person.id;

    const { status } = await apiRequest(
      "DELETE",
      `/api/v1/families/${familyId}/people/${personId}`,
      {},
      editorToken,
    );
    expect(status).toBe(403);
  });

  it("Editor cannot manage members", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const { targetToken: editorToken } = await inviteAndAccept(
      creatorToken,
      familyId,
      "editor",
      "EDITOR",
    );

    const { body } = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/members`,
      undefined,
      creatorToken,
    );
    const membershipId = body.members[0].id;

    const { status } = await apiRequest(
      "PATCH",
      `/api/v1/families/${familyId}/members/${membershipId}`,
      { role: "VIEWER" },
      editorToken,
    );
    expect(status).toBe(403);
  });

  it("Creator can delete a person", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);

    const { body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "ToDelete", gender: "other" },
      creatorToken,
    );
    const personId = body.person.id;

    const { status } = await apiRequest(
      "DELETE",
      `/api/v1/families/${familyId}/people/${personId}`,
      {},
      creatorToken,
    );
    expect(status).toBe(200);
  });
});

describe("Cross-family isolation", () => {
  it("rejects a non-member reading another family", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);

    const otherToken = await getTestToken("stranger");
    const { status, body } = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}`,
      undefined,
      otherToken,
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects using a person from another family in a relationship", async () => {
    const creatorToken = await getTestToken("creator");
    const familyA = await createFamily(creatorToken, "Family A");
    const familyB = await createFamily(creatorToken, "Family B");

    const { body: personABody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyA}/people`,
      { name: "A", gender: "other" },
      creatorToken,
    );
    const { body: personBBody } = await apiRequest(
      "POST",
      `/api/v1/families/${familyB}/people`,
      { name: "B", gender: "other" },
      creatorToken,
    );

    const { status, body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyA}/relationships/parent-child`,
      { parentPersonId: personABody.person.id, childPersonId: personBBody.person.id },
      creatorToken,
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("PERSON_NOT_IN_FAMILY");
  });

  it("friendship does not grant family access", async () => {
    const aToken = await getTestToken("a");
    const bToken = await getTestToken("b");

    const { body: aMe } = await apiRequest("GET", "/api/v1/me", undefined, aToken);
    const { body: bMe } = await apiRequest("GET", "/api/v1/me", undefined, bToken);

    const { body } = await apiRequest(
      "POST",
      "/api/v1/friends/requests",
      { accountId: bMe.id },
      aToken,
    );
    await apiRequest("POST", `/api/v1/friends/requests/${body.request.id}/accept`, {}, bToken);

    const aFamily = await createFamily(aToken, "A Family");
    const { status } = await apiRequest("GET", `/api/v1/families/${aFamily}`, undefined, bToken);
    expect(status).toBe(403);
  });
});

describe("Invitations", () => {
  it("rejects an expired invitation", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const { body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { role: "VIEWER" },
      creatorToken,
    );

    // Tamper with DB to expire the invitation.
    await db
      .update(schema.familyInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.familyInvitations.id, body.invitation.id));

    const targetToken = await getTestToken("late");
    const { status } = await apiRequest(
      "POST",
      `/api/v1/invitations/${body.token}/accept`,
      {},
      targetToken,
    );
    expect(status).toBe(400);
  });

  it("accepting an invitation for an existing member is idempotent", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const { invitationToken, targetToken } = await inviteAndAccept(
      creatorToken,
      familyId,
      "member",
      "VIEWER",
    );

    const { status: status2, body } = await apiRequest(
      "POST",
      `/api/v1/invitations/${invitationToken}/accept`,
      {},
      targetToken,
    );
    if (status2 !== 200) console.error("second accept failed", status2, JSON.stringify(body));
    expect(status2).toBe(200);
    expect(body.alreadyMember).toBe(true);
  });
});
