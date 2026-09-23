import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { setup } from "./setup";
import { apiRequest, getTestToken } from "./helpers";

beforeAll(setup);

beforeEach(async () => {
  for (const table of [
    schema.postMedia,
    schema.reactions,
    schema.comments,
    schema.posts,
    schema.parentChildRelationships,
    schema.people,
    schema.familyInvitations,
    schema.familyMemberships,
    schema.auditEvents,
    schema.friendships,
    schema.friendRequests,
    schema.mediaAssets,
    schema.families,
    schema.accounts,
  ]) {
    await db.run(sql`DELETE FROM ${table}`);
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

    await apiRequest("GET", "/api/v1/me", undefined, aToken);
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

describe("Viewer social permissions", () => {
  it("Viewer can post to the family feed and export family data", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const { targetToken: viewerToken } = await inviteAndAccept(
      creatorToken,
      familyId,
      "viewer",
      "VIEWER",
    );

    const post = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/posts`,
      { body: "Hello from a viewer" },
      viewerToken,
    );
    expect(post.status).toBe(201);

    const exported = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/export?format=json`,
      undefined,
      viewerToken,
    );
    expect(exported.status).toBe(200);
  });
});

describe("Tree projection", () => {
  async function addPerson(token: string, familyId: string, name: string) {
    const { body } = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name, gender: "other" },
      token,
    );
    return body.person.id as string;
  }

  async function link(token: string, familyId: string, parent: string, child: string) {
    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: parent, childPersonId: child },
      token,
    );
  }

  it("includes people without relationships and honours depth", async () => {
    const token = await getTestToken("creator");
    const familyId = await createFamily(token);
    const grandparent = await addPerson(token, familyId, "Grandparent");
    const parent = await addPerson(token, familyId, "Parent");
    const child = await addPerson(token, familyId, "Child");
    const loner = await addPerson(token, familyId, "Unconnected");
    await link(token, familyId, grandparent, parent);
    await link(token, familyId, parent, child);

    const whole = await apiRequest("GET", `/api/v1/families/${familyId}/tree`, undefined, token);
    expect(whole.status).toBe(200);
    expect(whole.body.people.map((p: any) => p.id).sort()).toEqual(
      [grandparent, parent, child, loner].sort(),
    );
    expect(whole.body.edges).toHaveLength(2);

    const near = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/tree?rootPersonId=${child}&direction=ancestors&depth=1`,
      undefined,
      token,
    );
    expect(near.status).toBe(200);
    expect(near.body.people.map((p: any) => p.id).sort()).toEqual([parent, child].sort());
    expect(near.body.edges).toHaveLength(1);
  });

  it("rejects an invalid direction", async () => {
    const token = await getTestToken("creator");
    const familyId = await createFamily(token);
    const { status } = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/tree?direction=sideways`,
      undefined,
      token,
    );
    expect(status).toBe(400);
  });
});

describe("Friends", () => {
  it("rejects a request to an account that does not exist", async () => {
    const aToken = await getTestToken("a");
    await apiRequest("GET", "/api/v1/me", undefined, aToken);
    const { status, body } = await apiRequest(
      "POST",
      "/api/v1/friends/requests",
      { accountId: "does-not-exist" },
      aToken,
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns display names and accepts mutual requests", async () => {
    const aToken = await getTestToken("a", "Alice");
    const bToken = await getTestToken("b", "Bob");
    const { body: aMe } = await apiRequest("GET", "/api/v1/me", undefined, aToken);
    const { body: bMe } = await apiRequest("GET", "/api/v1/me", undefined, bToken);

    await apiRequest("POST", "/api/v1/friends/requests", { accountId: bMe.id }, aToken);
    const pending = await apiRequest("GET", "/api/v1/friends/requests", undefined, bToken);
    expect(pending.body.requests[0].sender).toEqual({ id: aMe.id, displayName: "Alice" });
    expect(pending.body.requests[0].receiver).toEqual({ id: bMe.id, displayName: "Bob" });

    // Bob "sends" a request back, which accepts Alice's pending one.
    const mutual = await apiRequest(
      "POST",
      "/api/v1/friends/requests",
      { accountId: aMe.id },
      bToken,
    );
    expect(mutual.status).toBe(201);
    expect(mutual.body.accepted).toBe(true);

    const friends = await apiRequest("GET", "/api/v1/friends", undefined, aToken);
    expect(friends.body.friends).toHaveLength(1);
    expect(friends.body.friends[0].friend).toEqual({ id: bMe.id, displayName: "Bob" });
  });
});
