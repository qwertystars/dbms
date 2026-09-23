import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
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
  return targetToken;
}

/** A valid YYYY-MM-DD date that falls `days` from today, in the given (past) year. */
function isoDateInDays(days: number, year: number): string {
  const target = new Date(Date.now() + days * 86_400_000);
  const month = target.getUTCMonth() + 1;
  // Keep Feb 29 valid for every year.
  const day = month === 2 && target.getUTCDate() === 29 ? 28 : target.getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

describe("Feed engagement", () => {
  it("returns authors, reaction counts and comment counts", async () => {
    const creatorToken = await getTestToken("creator", "Creator");
    const familyId = await createFamily(creatorToken);
    const viewerToken = await inviteAndAccept(creatorToken, familyId, "viewer", "VIEWER", "Viewer");

    const post = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/posts`,
      { body: "Hello family" },
      creatorToken,
    );
    const postId = post.body.post.id as string;

    const reaction = await apiRequest(
      "PUT",
      `/api/v1/families/${familyId}/posts/${postId}/reaction`,
      { type: "LOVE" },
      viewerToken,
    );
    expect(reaction.status).toBe(200);
    await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/posts/${postId}/comments`,
      { body: "Lovely!" },
      creatorToken,
    );

    const feed = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/posts`,
      undefined,
      viewerToken,
    );
    const item = feed.body.posts[0];
    expect(item.author.displayName).toBe("Creator");
    expect(item.reactionCounts.LOVE).toBe(1);
    expect(item.myReaction).toBe("LOVE");
    expect(item.commentCount).toBe(1);

    const comments = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/posts/${postId}/comments`,
      undefined,
      viewerToken,
    );
    expect(comments.body.comments).toHaveLength(1);
    expect(comments.body.comments[0].author.displayName).toBe("Creator");
  });

  it("toggles a reaction off again", async () => {
    const creatorToken = await getTestToken("creator", "Creator");
    const familyId = await createFamily(creatorToken);
    const post = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/posts`,
      { body: "React to me" },
      creatorToken,
    );
    const postId = post.body.post.id as string;

    await apiRequest(
      "PUT",
      `/api/v1/families/${familyId}/posts/${postId}/reaction`,
      { type: "LIKE" },
      creatorToken,
    );
    const removed = await apiRequest(
      "DELETE",
      `/api/v1/families/${familyId}/posts/${postId}/reaction`,
      {},
      creatorToken,
    );
    expect(removed.status).toBe(200);

    const feed = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/posts`,
      undefined,
      creatorToken,
    );
    const item = feed.body.posts[0];
    expect(item.myReaction).toBeNull();
    expect(item.reactionCounts.LIKE).toBe(0);
  });

  it("paginates posts created in the same second without skipping any", async () => {
    const creatorToken = await getTestToken("creator", "Creator");
    const familyId = await createFamily(creatorToken);
    const ids = new Set<string>();
    for (let i = 1; i <= 3; i++) {
      const post = await apiRequest(
        "POST",
        `/api/v1/families/${familyId}/posts`,
        { body: `Post ${i}` },
        creatorToken,
      );
      ids.add(post.body.post.id);
    }

    const first = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/posts?limit=2`,
      undefined,
      creatorToken,
    );
    expect(first.body.posts).toHaveLength(2);
    expect(first.body.nextCursor).toBeDefined();

    const second = await apiRequest(
      "GET",
      `/api/v1/families/${familyId}/posts?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      undefined,
      creatorToken,
    );
    expect(second.body.posts).toHaveLength(1);

    const seen = new Set([
      ...first.body.posts.map((p: any) => p.id),
      ...second.body.posts.map((p: any) => p.id),
    ]);
    expect(seen.size).toBe(3);
    expect([...seen].sort()).toEqual([...ids].sort());
  });
});

describe("Upcoming events", () => {
  it("returns birthdays and memorials across the account's families", async () => {
    const creatorToken = await getTestToken("creator", "Creator");
    const familyId = await createFamily(creatorToken);
    await addPerson(creatorToken, familyId, "Birthday Kid", {
      dateOfBirth: isoDateInDays(5, 1990),
    });
    await addPerson(creatorToken, familyId, "Remembered", {
      dateOfDeath: isoDateInDays(10, 2020),
    });
    await addPerson(creatorToken, familyId, "No Dates");

    const res = await apiRequest("GET", "/api/v1/events/upcoming?days=30", undefined, creatorToken);
    expect(res.status).toBe(200);
    const events = res.body.events as any[];
    const names = events.map((e) => e.personName);
    expect(names).toContain("Birthday Kid");
    expect(names).toContain("Remembered");
    expect(names).not.toContain("No Dates");

    const birthday = events.find((e) => e.personName === "Birthday Kid");
    expect(birthday.type).toBe("birthday");
    expect(birthday.age).toBeGreaterThan(0);
    expect(birthday.familyName).toBe("A Family");
    expect(birthday.daysUntil).toBe(5);

    const memorial = events.find((e) => e.personName === "Remembered");
    expect(memorial.type).toBe("memorial");
    expect(memorial.daysUntil).toBe(10);

    // Events outside the window are excluded.
    const narrow = await apiRequest(
      "GET",
      "/api/v1/events/upcoming?days=3",
      undefined,
      creatorToken,
    );
    expect(narrow.body.events).toHaveLength(0);
  });
});
