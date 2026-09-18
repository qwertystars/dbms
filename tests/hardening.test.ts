import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { signDevToken } from "~/lib/dev-auth";
import { server } from "~/server/app";
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

async function addPerson(token: string, familyId: string, name: string, extra: object = {}) {
  const { body } = await apiRequest(
    "POST",
    `/api/v1/families/${familyId}/people`,
    { name, gender: "other", ...extra },
    token,
  );
  return body.person.id as string;
}

async function inviteAndAccept(
  creatorToken: string,
  familyId: string,
  subject: string,
  role: "EDITOR" | "VIEWER",
  displayName = "Test User",
) {
  const { body } = await apiRequest(
    "POST",
    `/api/v1/families/${familyId}/invitations`,
    { role },
    creatorToken,
  );
  const targetToken = await getTestToken(subject, displayName);
  await apiRequest("POST", `/api/v1/invitations/${body.token}/accept`, {}, targetToken);
  return { invitationToken: body.token as string, targetToken };
}

describe("Development sign-in gate", () => {
  it("does not expose /api/auth/login when AUTH_DEV_MODE is off", async () => {
    const response = await server.fetch(
      new Request("http://localhost:3000/api/auth/login", { method: "POST" }),
      {} as never,
      {} as never,
    );
    expect(response.status).toBe(404);
  });

  it("refuses to mint a development token when disabled", async () => {
    await expect(signDevToken("someone", "Someone")).rejects.toThrow(/disabled/i);
  });
});

describe("Invitation single-use", () => {
  it("accepts exactly one account per invitation token", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const invite = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { role: "VIEWER" },
      creatorToken,
    );
    const token = invite.body.token as string;

    const firstToken = await getTestToken("first");
    const first = await apiRequest("POST", `/api/v1/invitations/${token}/accept`, {}, firstToken);
    expect(first.status).toBe(200);

    const secondToken = await getTestToken("second");
    const second = await apiRequest("POST", `/api/v1/invitations/${token}/accept`, {}, secondToken);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("INVITATION_USED");
  });

  it("keeps the guarantee when two accounts accept concurrently", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    const invite = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { role: "VIEWER" },
      creatorToken,
    );
    const token = invite.body.token as string;

    const firstToken = await getTestToken("first");
    const secondToken = await getTestToken("second");
    const [first, second] = await Promise.all([
      apiRequest("POST", `/api/v1/invitations/${token}/accept`, {}, firstToken),
      apiRequest("POST", `/api/v1/invitations/${token}/accept`, {}, secondToken),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const memberships = await db
      .select()
      .from(schema.familyMemberships)
      .where(eq(schema.familyMemberships.familyId, familyId));
    // Creator plus exactly one invited account.
    expect(memberships).toHaveLength(2);
  });
});

describe("Person deletion", () => {
  it("soft-deletes a person and detaches their relationships", async () => {
    const token = await getTestToken("creator");
    const familyId = await createFamily(token);
    const parent = await addPerson(token, familyId, "Parent");
    const child = await addPerson(token, familyId, "Child");
    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: parent, childPersonId: child },
      token,
    );

    const deleted = await apiRequest(
      "DELETE",
      `/api/v1/families/${familyId}/people/${child}`,
      {},
      token,
    );
    expect(deleted.status).toBe(200);

    const tree = await apiRequest("GET", `/api/v1/families/${familyId}/tree`, undefined, token);
    expect(tree.body.people.map((p: any) => p.id)).not.toContain(child);
    expect(tree.body.edges).toHaveLength(0);

    // The row is retained for history and audit; only `deletedAt` is set.
    const row = await db.query.people.findFirst({ where: eq(schema.people.id, child) });
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});

describe("Ownership and audits", () => {
  it("transfers ownership to an editor and records an audit event", async () => {
    const creatorToken = await getTestToken("creator", "Creator");
    const familyId = await createFamily(creatorToken);
    const { targetToken: editorToken } = await inviteAndAccept(
      creatorToken,
      familyId,
      "editor",
      "EDITOR",
      "Editor",
    );

    const members = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/members`,
      undefined,
      creatorToken,
    );
    const editorMembership = members.body.members.find((m: any) => m.role === "EDITOR");

    const transfer = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/transfer-ownership`,
      { newCreatorMembershipId: editorMembership.id },
      creatorToken,
    );
    expect(transfer.status).toBe(200);

    const after = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/members`,
      undefined,
      editorToken,
    );
    const roles = new Map(after.body.members.map((m: any) => [m.account.displayName, m.role]));
    expect(roles.get("Editor")).toBe("CREATOR");
    expect(roles.get("Creator")).toBe("EDITOR");

    const audits = await db.select().from(schema.auditEvents);
    expect(audits.some((a) => a.action === "OWNERSHIP_TRANSFERRED")).toBe(true);
  });

  it("audits membership role changes", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);
    await inviteAndAccept(creatorToken, familyId, "editor", "EDITOR");

    const members = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/members`,
      undefined,
      creatorToken,
    );
    const editorMembership = members.body.members.find((m: any) => m.role === "EDITOR");
    const updated = await apiRequest(
      "PATCH",
      `/api/v1/families/${familyId}/members/${editorMembership.id}`,
      { role: "VIEWER" },
      creatorToken,
    );
    expect(updated.status).toBe(200);

    const audits = await db.select().from(schema.auditEvents);
    expect(audits.some((a) => a.action === "MEMBERSHIP_ROLE_UPDATED")).toBe(true);
    expect(audits.some((a) => a.action === "INVITATION_CREATED")).toBe(true);
  });

  it("audits family exports", async () => {
    const creatorToken = await getTestToken("creator");
    const familyId = await createFamily(creatorToken);

    const exported = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/export?format=json`,
      undefined,
      creatorToken,
    );
    expect(exported.status).toBe(200);

    const audits = await db.select().from(schema.auditEvents);
    expect(audits.some((a) => a.action === "FAMILY_EXPORTED")).toBe(true);
  });
});
