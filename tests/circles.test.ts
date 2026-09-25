import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { setup } from "./setup";
import { apiRequest, getTestToken } from "./helpers";

beforeAll(setup);

beforeEach(async () => {
  for (const table of [
    schema.dnaMatches,
    schema.helpResponses,
    schema.helpRequests,
    schema.postMedia,
    schema.reactions,
    schema.comments,
    schema.posts,
    schema.parentChildRelationships,
    schema.familyMemberships,
    schema.people,
    schema.familyInvitations,
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

// The API rate-limits per account, so every fixture signs in fresh accounts.
let run = 0;

async function join(creator: string, familyId: string, subject: string, role: string) {
  const invite = await apiRequest(
    "POST",
    `/api/v1/families/${familyId}/invitations`,
    { role },
    creator,
  );
  const token = await getTestToken(`${subject}-${run}`, subject);
  const accepted = await apiRequest(
    "POST",
    `/api/v1/invitations/${invite.body.token}/accept`,
    {},
    token,
  );
  return { token, membershipId: accepted.body.membership.id as string };
}

/**
 * Grandpa + Grandma -> Dad, Aunt; Dad + Mum -> Me, Brother; Aunt -> Cousin.
 * Accounts: me (Creator, linked to Me), brother (Viewer, linked, degree 2),
 * cousin (Viewer, linked, degree 4), loner (Viewer, not linked), editor (unlinked).
 */
async function fixture() {
  run++;
  const me = await getTestToken(`me-${run}`, "Me");
  const family = await apiRequest("POST", "/api/v1/families", { name: "Family" }, me);
  const familyId = family.body.family.id as string;
  const creatorMembershipId = family.body.membership.id as string;

  const ids: Record<string, string> = {};
  const add = async (name: string, gender: string, extra: object = {}) => {
    const res = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name, gender, ...extra },
      me,
    );
    expect(res.status).toBe(201);
    ids[name] = res.body.person.id;
  };
  await add("Grandpa", "male");
  await add("Grandma", "female");
  await add("Dad", "male");
  await add("Mum", "female");
  await add("Aunt", "female");
  await add("Me", "female", {
    phone: "+44 7000 000000",
    occupation: "Engineer",
    city: "Leeds",
    dateOfBirth: "1990-01-01",
  });
  await add("Brother", "male");
  await add("Cousin", "female");
  for (const [parent, child] of [
    ["Grandpa", "Dad"],
    ["Grandma", "Dad"],
    ["Grandpa", "Aunt"],
    ["Grandma", "Aunt"],
    ["Dad", "Me"],
    ["Mum", "Me"],
    ["Dad", "Brother"],
    ["Mum", "Brother"],
    ["Aunt", "Cousin"],
  ]) {
    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/relationships/parent-child`,
      { parentPersonId: ids[parent], childPersonId: ids[child] },
      me,
    );
  }

  const brother = await join(me, familyId, "brother", "VIEWER");
  const cousin = await join(me, familyId, "cousin", "VIEWER");
  const loner = await join(me, familyId, "loner", "VIEWER");
  const editor = await join(me, familyId, "editor", "EDITOR");

  const link = (membershipId: string, personId: string) =>
    apiRequest(
      "PUT",
      `/api/v1/families/${familyId}/members/${membershipId}/person`,
      { personId },
      me,
    );
  expect((await link(creatorMembershipId, ids.Me)).status).toBe(200);
  expect((await link(brother.membershipId, ids.Brother)).status).toBe(200);
  expect((await link(cousin.membershipId, ids.Cousin)).status).toBe(200);

  return { familyId, ids, me, brother, cousin, loner, editor, link };
}

describe("Linking members to people", () => {
  it("is Creator-only, one-to-one, and audited", async () => {
    const f = await fixture();
    const byViewer = await apiRequest(
      "PUT",
      `/api/v1/families/${f.familyId}/members/${f.loner.membershipId}/person`,
      { personId: f.ids.Aunt },
      f.brother.token,
    );
    expect(byViewer.status).toBe(403);

    const taken = await f.link(f.loner.membershipId, f.ids.Brother);
    expect(taken.status).toBe(409);

    const unlink = await f.link(f.cousin.membershipId, null as unknown as string);
    expect(unlink.status).toBe(200);
    expect(unlink.body.membership.personId).toBeNull();

    const audit = await db.query.auditEvents.findMany({
      where: (a, { eq }) => eq(a.action, "MEMBERSHIP_PERSON_LINKED"),
    });
    expect(audit.length).toBe(4);
  });

  it("rejects people from another family", async () => {
    const f = await fixture();
    const other = await apiRequest("POST", "/api/v1/families", { name: "Other" }, f.me);
    const stranger = await apiRequest(
      "POST",
      `/api/v1/families/${other.body.family.id}/people`,
      { name: "Stranger", gender: "other" },
      f.me,
    );
    const res = await f.link(f.loner.membershipId, stranger.body.person.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PERSON_NOT_IN_FAMILY");
  });
});

describe("Close and far family visibility", () => {
  it("shows kinship to the viewer and hides close-only fields from far family", async () => {
    const f = await fixture();
    const path = `/api/v1/families/${f.familyId}/people/${f.ids.Me}`;

    const asBrother = await apiRequest("GET", path, undefined, f.brother.token);
    expect(asBrother.body.person.kinship).toMatchObject({
      label: "sister",
      degree: 2,
      circle: "CLOSE",
    });
    expect(asBrother.body.person.phone).toBe("+44 7000 000000");

    const asCousin = await apiRequest("GET", path, undefined, f.cousin.token);
    expect(asCousin.body.person.kinship).toMatchObject({
      label: "first cousin",
      circle: "FAR",
    });
    expect(asCousin.body.person.phone).toBeNull();
    expect(asCousin.body.person.hiddenFields).toContain("phone");
    // Work details are shared with the whole family by default.
    expect(asCousin.body.person.occupation).toBe("Engineer");
    expect(asCousin.body.person.fieldVisibility).toBeUndefined();

    const asLoner = await apiRequest("GET", path, undefined, f.loner.token);
    expect(asLoner.body.person.kinship.circle).toBe("UNKNOWN");
    expect(asLoner.body.person.phone).toBeNull();

    const asEditor = await apiRequest("GET", path, undefined, f.editor.token);
    expect(asEditor.body.person.phone).toBe("+44 7000 000000");
    expect(asEditor.body.person.fieldVisibility.contact).toBe("CLOSE");
  });

  it("filters the people list, the tree and exports the same way", async () => {
    const f = await fixture();
    const list = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/people`,
      undefined,
      f.cousin.token,
    );
    const meRow = list.body.people.find((p: any) => p.id === f.ids.Me);
    expect(meRow.phone).toBeNull();
    expect(meRow.member.displayName).toBe("Me");

    const tree = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/tree`,
      undefined,
      f.cousin.token,
    );
    expect(tree.body.people.find((p: any) => p.id === f.ids.Me).phone).toBeNull();

    const exported = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/export?format=json`,
      undefined,
      f.cousin.token,
    );
    expect(JSON.stringify(exported.body)).not.toContain("7000 000000");
  });

  it("widens close family when the Creator raises the degree", async () => {
    const f = await fixture();
    const byViewer = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}`,
      { closeFamilyDegree: 4 },
      f.brother.token,
    );
    expect(byViewer.status).toBe(403);

    const res = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}`,
      { closeFamilyDegree: 4 },
      f.me,
    );
    expect(res.status).toBe(200);
    expect(res.body.family.closeFamilyDegree).toBe(4);

    const asCousin = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/people/${f.ids.Me}`,
      undefined,
      f.cousin.token,
    );
    expect(asCousin.body.person.kinship.circle).toBe("CLOSE");
    expect(asCousin.body.person.phone).toBe("+44 7000 000000");
  });

  it("only searches fields the viewer can see", async () => {
    const f = await fixture();
    // The brother is a Viewer, but may update his own work details and privacy.
    const self = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/people/${f.ids.Brother}`,
      { skills: "Plumbing, bike repair", fieldVisibility: { work: "CLOSE" } },
      f.brother.token,
    );
    expect(self.status).toBe(200);
    expect(self.body.person.fieldVisibility.work).toBe("CLOSE");

    const search = (token: string) =>
      apiRequest("GET", `/api/v1/families/${f.familyId}/people?search=plumbing`, undefined, token);
    expect((await search(f.cousin.token)).body.people).toHaveLength(0);
    expect((await search(f.me)).body.people).toHaveLength(1);

    const audit = await db.query.auditEvents.findFirst({
      where: (a, { eq }) => eq(a.action, "PERSON_PRIVACY_UPDATED"),
    });
    expect(audit?.summary).toMatchObject({ selfService: true });
  });

  it("limits self-service edits to your own profile and fields", async () => {
    const f = await fixture();
    const rename = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/people/${f.ids.Brother}`,
      { name: "Bro" },
      f.brother.token,
    );
    expect(rename.status).toBe(403);

    const other = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/people/${f.ids.Me}`,
      { phone: "123" },
      f.brother.token,
    );
    expect(other.status).toBe(403);

    const unlinked = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/people/${f.ids.Aunt}`,
      { city: "York" },
      f.loner.token,
    );
    expect(unlinked.status).toBe(403);
  });

  it("hides birthdays from reminders when the birth date is private", async () => {
    const f = await fixture();
    await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/people/${f.ids.Me}`,
      { fieldVisibility: { birthday: "CLOSE" } },
      f.me,
    );
    const upcoming = async (token: string) =>
      (await apiRequest("GET", "/api/v1/events/upcoming?days=365", undefined, token)).body.events;
    expect((await upcoming(f.brother.token)).map((e: any) => e.personId)).toContain(f.ids.Me);
    expect((await upcoming(f.cousin.token)).map((e: any) => e.personId)).not.toContain(f.ids.Me);

    const asCousin = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/people/${f.ids.Me}`,
      undefined,
      f.cousin.token,
    );
    expect(asCousin.body.person.dateOfBirth).toBeNull();
    expect(asCousin.body.person.birthYear).toBe(1990);
  });
});

describe("Close-family posts", () => {
  it("are visible only within the author's close family", async () => {
    const f = await fixture();
    const post = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "Just for close family", audience: "CLOSE" },
      f.me,
    );
    expect(post.status).toBe(201);
    const postId = post.body.post.id;

    const feed = async (token: string) =>
      (await apiRequest("GET", `/api/v1/families/${f.familyId}/posts`, undefined, token)).body
        .posts;
    expect((await feed(f.brother.token)).map((p: any) => p.id)).toContain(postId);
    expect(await feed(f.cousin.token)).toHaveLength(0);
    expect(await feed(f.loner.token)).toHaveLength(0);
    expect(await feed(f.editor.token)).toHaveLength(0);

    const comments = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/posts/${postId}/comments`,
      undefined,
      f.cousin.token,
    );
    expect(comments.status).toBe(404);
    const react = await apiRequest(
      "PUT",
      `/api/v1/families/${f.familyId}/posts/${postId}/reaction`,
      { type: "LOVE" },
      f.cousin.token,
    );
    expect(react.status).toBe(404);
    const comment = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts/${postId}/comments`,
      { body: "hi" },
      f.brother.token,
    );
    expect(comment.status).toBe(201);
  });

  it("require the author to be linked to a person", async () => {
    const f = await fixture();
    const res = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "Close", audience: "CLOSE" },
      f.loner.token,
    );
    expect(res.status).toBe(400);
  });
});

describe("Help board", () => {
  it("lets members ask, respond and resolve", async () => {
    const f = await fixture();
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help`,
      { kind: "REQUEST", category: "CAREER", title: "Advice on engineering jobs?" },
      f.cousin.token,
    );
    expect(created.status).toBe(201);
    const helpId = created.body.item.id;

    const asMe = await apiRequest("GET", `/api/v1/families/${f.familyId}/help`, undefined, f.me);
    expect(asMe.body.items[0].author).toMatchObject({
      displayName: "cousin",
      kinship: "first cousin",
    });

    const reply = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help/${helpId}/responses`,
      { body: "Happy to help, call me." },
      f.me,
    );
    expect(reply.status).toBe(201);

    const hijack = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/help/${helpId}`,
      { status: "RESOLVED" },
      f.brother.token,
    );
    expect(hijack.status).toBe(403);

    const resolved = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/help/${helpId}`,
      { status: "RESOLVED" },
      f.cousin.token,
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.item.status).toBe("RESOLVED");
    expect(resolved.body.item.responses).toHaveLength(1);

    const late = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help/${helpId}/responses`,
      { body: "Too late" },
      f.brother.token,
    );
    expect(late.status).toBe(409);

    const open = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/help?status=OPEN`,
      undefined,
      f.me,
    );
    expect(open.body.items).toHaveLength(0);
  });

  it("keeps close-family items and the board itself private", async () => {
    const f = await fixture();
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help`,
      { kind: "OFFER", category: "HOUSING", title: "Spare room", audience: "CLOSE" },
      f.me,
    );
    const helpId = created.body.item.id;
    const list = async (token: string) =>
      (await apiRequest("GET", `/api/v1/families/${f.familyId}/help`, undefined, token)).body.items;
    expect(await list(f.brother.token)).toHaveLength(1);
    expect(await list(f.cousin.token)).toHaveLength(0);
    const respond = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help/${helpId}/responses`,
      { body: "Me please" },
      f.cousin.token,
    );
    expect(respond.status).toBe(404);

    // Outsiders and friends of members see nothing.
    const outsider = await getTestToken("outsider", "Outsider");
    const outsiderMe = await apiRequest("GET", "/api/v1/me", undefined, outsider);
    const request = await apiRequest(
      "POST",
      "/api/v1/friends/requests",
      { accountId: (await apiRequest("GET", "/api/v1/me", undefined, f.me)).body.id },
      outsider,
    );
    await apiRequest(
      "POST",
      `/api/v1/friends/requests/${request.body.request.id}/accept`,
      {},
      f.me,
    );
    expect(outsiderMe.status).toBe(200);
    const blocked = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/help`,
      undefined,
      outsider,
    );
    expect(blocked.status).toBe(403);
    const post = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help`,
      { kind: "REQUEST", category: "OTHER", title: "Let me in" },
      outsider,
    );
    expect(post.status).toBe(403);
  });

  it("lets the Creator moderate, with an audit event", async () => {
    const f = await fixture();
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/help`,
      { kind: "REQUEST", category: "OTHER", title: "Spam" },
      f.loner.token,
    );
    const byOther = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/help/${created.body.item.id}`,
      undefined,
      f.brother.token,
    );
    expect(byOther.status).toBe(403);
    const byCreator = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/help/${created.body.item.id}`,
      undefined,
      f.me,
    );
    expect(byCreator.status).toBe(200);
    const audit = await db.query.auditEvents.findFirst({
      where: (a, { eq }) => eq(a.action, "HELP_REQUEST_DELETED"),
    });
    expect(audit?.summary).toMatchObject({ moderated: true });
  });
});

describe("DNA matches", () => {
  async function accounts() {
    const a = await getTestToken("dna-a", "Asha");
    const b = await getTestToken("dna-b", "Bala");
    const c = await getTestToken("dna-c", "Chitra");
    const idOf = async (token: string) =>
      (await apiRequest("GET", "/api/v1/me", undefined, token)).body.id as string;
    return { a, b, c, aId: await idOf(a), bId: await idOf(b), cId: await idOf(c) };
  }

  it("needs the other account's confirmation", async () => {
    const { a, b, c, bId } = await accounts();
    const reported = await apiRequest(
      "POST",
      "/api/v1/dna/matches",
      { accountId: bId, provider: "ANCESTRY", sharedCm: 850 },
      a,
    );
    expect(reported.status).toBe(201);
    const matchId = reported.body.match.id;
    expect(reported.body.match).toMatchObject({ status: "PENDING", direction: "OUTGOING" });
    expect(reported.body.match.estimate.likely).toContain("First cousin");

    const incoming = await apiRequest("GET", "/api/v1/dna/matches", undefined, b);
    expect(incoming.body.matches[0]).toMatchObject({ direction: "INCOMING", sharedCm: 850 });

    expect((await apiRequest("GET", "/api/v1/dna/matches", undefined, c)).body.matches).toEqual([]);
    expect((await apiRequest("POST", `/api/v1/dna/matches/${matchId}/confirm`, {}, c)).status).toBe(
      404,
    );
    expect((await apiRequest("POST", `/api/v1/dna/matches/${matchId}/confirm`, {}, a)).status).toBe(
      403,
    );
    expect((await apiRequest("POST", `/api/v1/dna/matches/${matchId}/confirm`, {}, b)).status).toBe(
      200,
    );
    const confirmed = await apiRequest("GET", "/api/v1/dna/matches", undefined, a);
    expect(confirmed.body.matches[0].status).toBe("CONFIRMED");
  });

  it("rejects duplicates and self-matches, and erases on withdrawal", async () => {
    const { a, b, aId, bId } = await accounts();
    const first = await apiRequest(
      "POST",
      "/api/v1/dna/matches",
      { accountId: bId, provider: "OTHER", sharedCm: 100 },
      a,
    );
    const duplicate = await apiRequest(
      "POST",
      "/api/v1/dna/matches",
      { accountId: aId, provider: "OTHER", sharedCm: 100 },
      b,
    );
    expect(duplicate.status).toBe(409);
    const self = await apiRequest(
      "POST",
      "/api/v1/dna/matches",
      { accountId: aId, provider: "OTHER", sharedCm: 100 },
      a,
    );
    expect(self.status).toBe(400);
    const tooMuch = await apiRequest(
      "POST",
      "/api/v1/dna/matches",
      { accountId: bId, provider: "OTHER", sharedCm: 99999 },
      a,
    );
    expect(tooMuch.status).toBe(400);

    const withdrawn = await apiRequest(
      "DELETE",
      `/api/v1/dna/matches/${first.body.match.id}`,
      undefined,
      b,
    );
    expect(withdrawn.status).toBe(200);
    expect((await db.select().from(schema.dnaMatches)).length).toBe(0);
  });

  it("never grants family access", async () => {
    const { a, b, bId } = await accounts();
    const family = await apiRequest("POST", "/api/v1/families", { name: "A's" }, a);
    const match = await apiRequest(
      "POST",
      "/api/v1/dna/matches",
      { accountId: bId, provider: "MYHERITAGE", sharedCm: 3400 },
      a,
    );
    await apiRequest("POST", `/api/v1/dna/matches/${match.body.match.id}/confirm`, {}, b);
    const res = await apiRequest(
      "GET",
      `/api/v1/families/${family.body.family.id}/people`,
      undefined,
      b,
    );
    expect(res.status).toBe(403);
  });
});
