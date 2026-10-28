import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { db, getDb } from "~/lib/db";
import * as schema from "~/db/schema";
import { setup } from "./setup";
import { apiRequest, getTestToken } from "./helpers";

beforeAll(setup);

beforeEach(async () => {
  for (const table of [
    schema.eventRsvps,
    schema.familyEvents,
    schema.postPersonTags,
    schema.personClaimRequests,
    schema.partnerRelationships,
    schema.postMedia,
    schema.reactions,
    schema.comments,
    schema.posts,
    schema.parentChildRelationships,
    schema.familyInvitations,
    schema.familyMemberships,
    schema.people,
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

let fixtureId = 0;

async function familyWithMembers() {
  const id = ++fixtureId;
  const creator = await getTestToken(`graph-creator-${id}`, "Creator");
  const editor = await getTestToken(`graph-editor-${id}`, "Editor");
  const viewer = await getTestToken(`graph-viewer-${id}`, "Viewer");
  const outsider = await getTestToken(`graph-outsider-${id}`, "Outsider");
  const { body } = await apiRequest("POST", "/api/v1/families", { name: "Family" }, creator);
  const familyId: string = body.family.id;
  for (const [token, role] of [
    [editor, "EDITOR"],
    [viewer, "VIEWER"],
  ] as const) {
    const invite = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/invitations`,
      { role },
      creator,
    );
    await apiRequest("POST", `/api/v1/invitations/${invite.body.token}/accept`, undefined, token);
  }
  const person = async (name: string) =>
    (
      await apiRequest(
        "POST",
        `/api/v1/families/${familyId}/people`,
        { name, gender: "other" },
        creator,
      )
    ).body.person.id as string;
  return { familyId, creator, editor, viewer, outsider, person };
}

describe("Partner relationships", () => {
  it("lets editors record a partner pair once and returns it in the tree", async () => {
    const f = await familyWithMembers();
    const a = await f.person("Asha");
    const b = await f.person("Bala");
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/relationships/partners`,
      { personAId: b, personBId: a },
      f.editor,
    );
    expect(created.status).toBe(201);
    expect([created.body.partner.personAId, created.body.partner.personBId].sort()).toEqual(
      [a, b].sort(),
    );

    const duplicate = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/relationships/partners`,
      { personAId: a, personBId: b },
      f.creator,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("PARTNER_DUPLICATE");

    const tree = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/tree`,
      undefined,
      f.viewer,
    );
    expect(tree.body.partners).toHaveLength(1);
    expect(tree.body.edges).toHaveLength(0);

    const path = `/api/v1/families/${f.familyId}/relationships/partners/${created.body.partner.id}`;
    expect((await apiRequest("DELETE", path, undefined, f.viewer)).status).toBe(403);
    expect(await db.query.partnerRelationships.findMany()).toHaveLength(1);
    expect((await apiRequest("DELETE", path, undefined, f.editor)).status).toBe(200);
    expect(await db.query.partnerRelationships.findMany()).toHaveLength(0);
    const audits = await db.query.auditEvents.findMany({
      where: eq(schema.auditEvents.targetId, created.body.partner.id),
    });
    expect(audits.map((a) => a.action).sort()).toEqual(["PARTNER_ADDED", "PARTNER_REMOVED"]);
    const [low, high] = [a, b].sort();
    for (const [personAId, personBId] of [
      [high, low],
      [low, low],
    ]) {
      await expect(
        db.insert(schema.partnerRelationships).values({
          familyId: f.familyId,
          personAId,
          personBId,
          createdByAccountId: created.body.partner.createdByAccountId,
        }),
      ).rejects.toThrow(/partner_ordered_pair/);
    }
  });

  it("rejects self partners, viewers and outsiders", async () => {
    const f = await familyWithMembers();
    const a = await f.person("Asha");
    const b = await f.person("Bala");
    const self = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/relationships/partners`,
      { personAId: a, personBId: a },
      f.creator,
    );
    expect(self.body.error.code).toBe("PARTNER_SELF");
    for (const token of [f.viewer, f.outsider]) {
      const res = await apiRequest(
        "POST",
        `/api/v1/families/${f.familyId}/relationships/partners`,
        { personAId: a, personBId: b },
        token,
      );
      expect(res.status).toBe(403);
    }
  });

  it("rejects partners from another family", async () => {
    const f = await familyWithMembers();
    const a = await f.person("Asha");
    const other = await apiRequest("POST", "/api/v1/families", { name: "Other" }, f.creator);
    const stranger = await apiRequest(
      "POST",
      `/api/v1/families/${other.body.family.id}/people`,
      { name: "Stranger", gender: "other" },
      f.creator,
    );
    const res = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/relationships/partners`,
      { personAId: a, personBId: stranger.body.person.id },
      f.creator,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PERSON_NOT_IN_FAMILY");
  });
});

describe("Account-to-person claims", () => {
  it.each([
    ["APPROVED", "CANCELLED"],
    ["REJECTED", "CANCELLED"],
    ["CANCELLED", "APPROVED"],
    ["REJECTED", "APPROVED"],
    ["APPROVED", "APPROVED"],
    ["APPROVED", "REJECTED"],
    ["CANCELLED", "REJECTED"],
    ["APPROVED", "REMOVED"],
    ["APPROVED", "DELETED"],
  ] as const)("rejects stale %s after %s without extra audits or links", async (stale, winner) => {
    const f = await familyWithMembers();
    const p = await f.person("Claimed");
    const req = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    const request = req.body.request;
    const path = `/api/v1/families/${f.familyId}/claim-requests/${request.id}`;
    const transition = (status: "APPROVED" | "REJECTED" | "CANCELLED") =>
      status === "CANCELLED"
        ? apiRequest("DELETE", path, undefined, f.viewer)
        : apiRequest("POST", `${path}/decision`, { decision: status }, f.creator);
    const instance = getDb();
    const batch = instance.batch.bind(instance);
    let winnerStatus: number | undefined;
    // Run the winner after all stale reads, just before the losing atomic write.
    const hook = vi
      .spyOn(LibSQLDatabase.prototype, "batch")
      .mockImplementationOnce(async (queries) => {
        const result =
          winner === "REMOVED"
            ? await apiRequest(
                "DELETE",
                `/api/v1/families/${f.familyId}/members/${request.membershipId}`,
                undefined,
                f.creator,
              )
            : winner === "DELETED"
              ? await apiRequest(
                  "DELETE",
                  `/api/v1/families/${f.familyId}/people/${p}`,
                  undefined,
                  f.creator,
                )
              : await transition(winner);
        winnerStatus = result.status;
        return batch(queries);
      });
    try {
      const lost = await transition(stale);
      expect(winnerStatus).toBe(200);
      expect(lost.body.error.code).toBe("CLAIM_NOT_PENDING");
    } finally {
      hook.mockRestore();
    }
    const saved = await db.query.personClaimRequests.findFirst({
      where: eq(schema.personClaimRequests.id, request.id),
    });
    const membership = await db.query.familyMemberships.findFirst({
      where: eq(schema.familyMemberships.id, request.membershipId),
    });
    expect(saved?.status).toBe(
      winner === "APPROVED" || winner === "REJECTED" ? winner : "CANCELLED",
    );
    expect(membership?.personId).toBe(winner === "APPROVED" ? p : null);
    const audits = await db.query.auditEvents.findMany({
      where: eq(schema.auditEvents.targetId, request.id),
    });
    expect(audits.map((a) => a.action).sort()).toEqual(
      [
        "CLAIM_REQUESTED",
        ...(winner === "APPROVED"
          ? ["CLAIM_APPROVED"]
          : winner === "REJECTED"
            ? ["CLAIM_REJECTED"]
            : winner === "CANCELLED"
              ? ["CLAIM_CANCELLED"]
              : []),
      ].sort(),
    );
  });

  it("links a member to a person only after Creator approval", async () => {
    const f = await familyWithMembers();
    const p = await f.person("Viewer Person");
    const req = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    expect(req.status).toBe(201);
    expect(req.body.request.status).toBe("PENDING");

    let me = await apiRequest("GET", `/api/v1/families/${f.familyId}`, undefined, f.viewer);
    expect(me.body.membership.personId).toBeNull();

    const queue = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/claim-requests`,
      undefined,
      f.creator,
    );
    expect(queue.body.requests).toHaveLength(1);
    expect(queue.body.requests[0].person.name).toBe("Viewer Person");

    const approved = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/claim-requests/${req.body.request.id}/decision`,
      { decision: "APPROVED" },
      f.creator,
    );
    expect(approved.status).toBe(200);
    expect(approved.body.request.status).toBe("APPROVED");
    me = await apiRequest("GET", `/api/v1/families/${f.familyId}`, undefined, f.viewer);
    expect(me.body.membership.personId).toBe(p);

    const audit = await db.query.auditEvents.findMany();
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["CLAIM_REQUESTED", "CLAIM_APPROVED"]),
    );
  });

  it("forbids non-Creators from deciding and outsiders from requesting", async () => {
    const f = await familyWithMembers();
    const p = await f.person("Someone");
    const req = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    for (const token of [f.editor, f.viewer, f.outsider]) {
      const res = await apiRequest(
        "POST",
        `/api/v1/families/${f.familyId}/claim-requests/${req.body.request.id}/decision`,
        { decision: "APPROVED" },
        token,
      );
      expect(res.status).toBe(403);
    }
    const outsiderReq = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.outsider,
    );
    expect(outsiderReq.status).toBe(403);

    const viewerQueue = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/claim-requests`,
      undefined,
      f.editor,
    );
    expect(viewerQueue.body.requests).toHaveLength(0);
  });

  it("prevents double claims, duplicate pending requests and re-deciding", async () => {
    const f = await familyWithMembers();
    const p = await f.person("Contested");
    const first = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    const again = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    expect(again.body.error.code).toBe("CLAIM_PENDING");

    const rival = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.editor,
    );
    expect(rival.status).toBe(201);

    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/claim-requests/${first.body.request.id}/decision`,
      { decision: "APPROVED" },
      f.creator,
    );
    const rivalDecision = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/claim-requests/${rival.body.request.id}/decision`,
      { decision: "APPROVED" },
      f.creator,
    );
    expect(rivalDecision.body.error.code).toBe("CLAIM_CONFLICT");

    const redo = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/claim-requests/${first.body.request.id}/decision`,
      { decision: "REJECTED" },
      f.creator,
    );
    expect(redo.body.error.code).toBe("CLAIM_NOT_PENDING");

    const linkedAgain = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${await f.person("Other")}/claim-requests`,
      undefined,
      f.viewer,
    );
    expect(linkedAgain.body.error.code).toBe("CLAIM_ALREADY_LINKED");
  });

  it("lets a member cancel their own request and unlink themselves", async () => {
    const f = await familyWithMembers();
    const p = await f.person("Me");
    const req = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    const notMine = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/claim-requests/${req.body.request.id}`,
      undefined,
      f.editor,
    );
    expect(notMine.status).toBe(403);
    const cancelled = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/claim-requests/${req.body.request.id}`,
      undefined,
      f.viewer,
    );
    expect(cancelled.body.request.status).toBe("CANCELLED");
    expect(
      await db.query.auditEvents.findMany({
        where: eq(schema.auditEvents.targetId, req.body.request.id),
      }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ action: "CLAIM_CANCELLED" })]));

    const req2 = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${p}/claim-requests`,
      undefined,
      f.viewer,
    );
    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/claim-requests/${req2.body.request.id}/decision`,
      { decision: "APPROVED" },
      f.creator,
    );
    const unlink = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/me/person-link`,
      undefined,
      f.viewer,
    );
    expect(unlink.body.unlinked).toBe(true);
    const me = await apiRequest("GET", `/api/v1/families/${f.familyId}`, undefined, f.viewer);
    expect(me.body.membership.personId).toBeNull();
  });
});

describe("Family events and RSVPs", () => {
  it("lets any member create events and RSVP, and lists counts", async () => {
    const f = await familyWithMembers();
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/events`,
      { title: "Reunion", startsOn: "2099-01-15", startTime: "18:30", location: "Chennai" },
      f.viewer,
    );
    expect(created.status).toBe(201);
    const eventId = created.body.event.id;
    await apiRequest(
      "PUT",
      `/api/v1/families/${f.familyId}/events/${eventId}/rsvp`,
      { response: "GOING" },
      f.creator,
    );
    await apiRequest(
      "PUT",
      `/api/v1/families/${f.familyId}/events/${eventId}/rsvp`,
      { response: "MAYBE" },
      f.editor,
    );
    const list = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/events`,
      undefined,
      f.creator,
    );
    expect(list.body.events).toHaveLength(1);
    expect(list.body.events[0].rsvpCounts).toEqual({ GOING: 1, MAYBE: 1, NOT_GOING: 0 });
    expect(list.body.events[0].myRsvp).toBe("GOING");
  });

  it("restricts event edits and deletes, and hides events from outsiders", async () => {
    const f = await familyWithMembers();
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/events`,
      { title: "Picnic", startsOn: "2099-03-01" },
      f.viewer,
    );
    const eventId = created.body.event.id;
    const editByOther = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/events/${eventId}`,
      { title: "Hijacked" },
      f.editor,
    );
    expect(editByOther.status).toBe(403);
    const deleteByEditor = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/events/${eventId}`,
      undefined,
      f.editor,
    );
    expect(deleteByEditor.status).toBe(403);
    const outsiderList = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/events`,
      undefined,
      f.outsider,
    );
    expect(outsiderList.status).toBe(403);
    const outsiderRsvp = await apiRequest(
      "PUT",
      `/api/v1/families/${f.familyId}/events/${eventId}/rsvp`,
      { response: "GOING" },
      f.outsider,
    );
    expect(outsiderRsvp.status).toBe(403);
    const moderated = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/events/${eventId}`,
      undefined,
      f.creator,
    );
    expect(moderated.body.deleted).toBe(true);
  });

  it("validates dates and times", async () => {
    const f = await familyWithMembers();
    const res = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/events`,
      { title: "Bad", startsOn: "2099-02-30x", startTime: "25:00" },
      f.creator,
    );
    expect(res.status).toBe(400);
  });
});

describe("Tagging people in memories", () => {
  it.each(["POST", "PATCH"])(
    "rolls back body and tags when %s tag insertion fails",
    async (method) => {
      const f = await familyWithMembers();
      const a = await f.person("Asha");
      const b = await f.person("Bala");
      const path = `/api/v1/families/${f.familyId}/posts`;
      const initial = await apiRequest(
        "POST",
        path,
        { body: "Original", personIds: [a] },
        f.creator,
      );
      const posts = await db.query.posts.findMany();
      const tags = await db.query.postPersonTags.findMany();
      await db.run(sql`CREATE TRIGGER fail_tag BEFORE INSERT ON post_person_tags
      BEGIN SELECT RAISE(ABORT, 'tag insertion failed'); END`);
      try {
        const failed = await apiRequest(
          method,
          method === "POST" ? path : `${path}/${initial.body.post.id}`,
          { body: "Changed", personIds: [b] },
          f.creator,
        );
        expect(failed.status).toBe(500);
      } finally {
        await db.run(sql`DROP TRIGGER fail_tag`);
      }
      expect(await db.query.posts.findMany()).toEqual(posts);
      expect(await db.query.postPersonTags.findMany()).toEqual(tags);
    },
  );

  it("tags family people on posts and filters memories by person", async () => {
    const f = await familyWithMembers();
    const a = await f.person("Asha");
    const b = await f.person("Bala");
    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "With Asha", personIds: [a] },
      f.viewer,
    );
    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "With Bala", personIds: [b] },
      f.viewer,
    );
    const all = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/posts`,
      undefined,
      f.creator,
    );
    expect(all.body.posts).toHaveLength(2);
    const ashas = await apiRequest(
      "GET",
      `/api/v1/families/${f.familyId}/posts?personId=${a}`,
      undefined,
      f.creator,
    );
    expect(ashas.body.posts).toHaveLength(1);
    expect(ashas.body.posts[0].taggedPeople).toEqual([{ id: a, name: "Asha" }]);
  });

  it("rejects tagging someone from another family", async () => {
    const f = await familyWithMembers();
    const other = await apiRequest("POST", "/api/v1/families", { name: "Other" }, f.creator);
    const stranger = await apiRequest(
      "POST",
      `/api/v1/families/${other.body.family.id}/people`,
      { name: "Stranger", gender: "other" },
      f.creator,
    );
    const res = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "Leak", personIds: [stranger.body.person.id] },
      f.creator,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PERSON_NOT_IN_FAMILY");
    expect(await db.query.posts.findMany()).toHaveLength(0);
    const a = await f.person("Asha");
    const created = await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "Original", personIds: [a] },
      f.creator,
    );
    const before = await db.query.posts.findMany();
    const tags = await db.query.postPersonTags.findMany();
    const failed = await apiRequest(
      "PATCH",
      `/api/v1/families/${f.familyId}/posts/${created.body.post.id}`,
      { body: "Changed", personIds: [a, stranger.body.person.id] },
      f.creator,
    );
    expect(failed.body.error.code).toBe("PERSON_NOT_IN_FAMILY");
    expect(await db.query.posts.findMany()).toEqual(before);
    expect(await db.query.postPersonTags.findMany()).toEqual(tags);
  });

  it("removes partner links, tags and pending claims when a person is deleted", async () => {
    const f = await familyWithMembers();
    const a = await f.person("Asha");
    const b = await f.person("Bala");
    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/relationships/partners`,
      { personAId: a, personBId: b },
      f.creator,
    );
    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/posts`,
      { body: "Tagged", personIds: [a] },
      f.creator,
    );
    await apiRequest(
      "POST",
      `/api/v1/families/${f.familyId}/people/${a}/claim-requests`,
      undefined,
      f.viewer,
    );
    const del = await apiRequest(
      "DELETE",
      `/api/v1/families/${f.familyId}/people/${a}`,
      undefined,
      f.creator,
    );
    expect(del.status).toBe(200);
    expect(await db.query.partnerRelationships.findMany()).toHaveLength(0);
    expect(await db.query.postPersonTags.findMany()).toHaveLength(0);
    const claims = await db.query.personClaimRequests.findMany();
    expect(claims.map((c) => c.status)).toEqual(["CANCELLED"]);
  });
});
