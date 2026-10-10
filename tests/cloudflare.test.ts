import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/lib/db";
import * as schema from "~/db/schema";
import { app } from "~/lib/hono";
import { sniffImageType, stripImageMetadata } from "~/modules/media/sanitize";
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

async function join(creatorToken: string, familyId: string, subject: string, role: string) {
  const { body } = await apiRequest(
    "POST",
    `/api/v1/families/${familyId}/invitations`,
    { role },
    creatorToken,
  );
  const token = await getTestToken(subject);
  await apiRequest("POST", `/api/v1/invitations/${body.token}/accept`, {}, token);
  return token;
}

// A minimal JPEG: SOI, an APP1 EXIF segment carrying fake GPS text, a comment,
// then start-of-scan and EOI. Enough structure for the sanitizer.
function jpegWithExif(): Uint8Array {
  const exif = new TextEncoder().encode("Exif\0\0GPS 12.97N 77.59E");
  const comment = new TextEncoder().encode("taken at home");
  const segment = (marker: number, payload: Uint8Array) => {
    const length = payload.length + 2;
    return [0xff, marker, length >> 8, length & 0xff, ...payload];
  };
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, new TextEncoder().encode("JFIF\0\x01\x01")),
    ...segment(0xe1, exif),
    ...segment(0xfe, comment),
    0xff,
    0xda,
    0x00,
    0x02,
    0x11,
    0x22,
    0xff,
    0xd9,
  ]);
}

function contains(bytes: Uint8Array, text: string) {
  return new TextDecoder("latin1").decode(bytes).includes(text);
}

async function rawRequest(method: string, path: string, token: string, body?: Uint8Array) {
  return app.fetch(
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: { Cookie: `auth_token=${token}`, "Content-Type": "image/jpeg" },
      body,
    }),
  );
}

async function uploadPersonPhoto(token: string, familyId: string) {
  const bytes = jpegWithExif();
  const intent = await apiRequest(
    "POST",
    "/api/v1/media/upload-intents",
    { purpose: "PERSON_PROFILE", familyId, mimeType: "image/jpeg", size: bytes.length },
    token,
  );
  expect(intent.status).toBe(201);
  const put = await rawRequest("PUT", intent.body.uploadUrl, token, bytes);
  expect(put.status).toBe(200);
  return intent.body.asset.id as string;
}

describe("Account name", () => {
  it("lets an account set its display name", async () => {
    const token = await getTestToken("renamer", "renamer");
    const res = await apiRequest("PATCH", "/api/v1/me", { displayName: "  Aadhira  " }, token);
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Aadhira");
    const me = await apiRequest("GET", "/api/v1/me", undefined, token);
    expect(me.body.displayName).toBe("Aadhira");
  });

  it("rejects an empty display name and requires sign-in", async () => {
    const token = await getTestToken("renamer");
    expect((await apiRequest("PATCH", "/api/v1/me", { displayName: " " }, token)).status).toBe(400);
    expect((await apiRequest("PATCH", "/api/v1/me", { displayName: "X" })).status).toBe(401);
  });
});

describe("Media uploads", () => {
  it("stores a profile photo without its EXIF data and shows it to family members", async () => {
    const creator = await getTestToken("creator");
    const familyId = await createFamily(creator);
    const viewer = await join(creator, familyId, "viewer", "VIEWER");
    const mediaId = await uploadPersonPhoto(creator, familyId);

    const person = await apiRequest(
      "POST",
      `/api/v1/families/${familyId}/people`,
      { name: "Annadurai", gender: "male", profileMediaId: mediaId },
      creator,
    );
    expect(person.status).toBe(201);
    expect(person.body.person.profileMediaId).toBe(mediaId);

    const res = await rawRequest("GET", `/api/v1/media/${mediaId}/content`, viewer);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("private");
    const stored = new Uint8Array(await res.arrayBuffer());
    expect(sniffImageType(stored)).toBe("image/jpeg");
    expect(contains(stored, "Exif")).toBe(false);
    expect(contains(stored, "GPS")).toBe(false);
    expect(contains(stored, "taken at home")).toBe(false);
    expect(contains(stored, "JFIF")).toBe(true);

    const etag = res.headers.get("etag")!;
    const cached = await app.fetch(
      new Request(`http://localhost:3000/api/v1/media/${mediaId}/content`, {
        headers: { Cookie: `auth_token=${viewer}`, "If-None-Match": etag },
      }),
    );
    expect(cached.status).toBe(304);
  });

  it("hides family media from non-members, including friends", async () => {
    const creator = await getTestToken("creator");
    const familyId = await createFamily(creator);
    const mediaId = await uploadPersonPhoto(creator, familyId);

    const outsider = await getTestToken("outsider");
    const friend = await getTestToken("friend");
    const me = await apiRequest("GET", "/api/v1/me", undefined, friend);
    const req = await apiRequest(
      "POST",
      "/api/v1/friends/requests",
      { accountId: me.body.id },
      creator,
    );
    await apiRequest("POST", `/api/v1/friends/requests/${req.body.request.id}/accept`, {}, friend);

    expect((await rawRequest("GET", `/api/v1/media/${mediaId}/content`, outsider)).status).toBe(
      404,
    );
    expect((await rawRequest("GET", `/api/v1/media/${mediaId}/content`, friend)).status).toBe(404);
  });

  it("refuses upload intents for families the account cannot edit", async () => {
    const creator = await getTestToken("creator");
    const familyId = await createFamily(creator);
    const viewer = await join(creator, familyId, "viewer", "VIEWER");
    const outsider = await getTestToken("outsider");
    const intent = { purpose: "PERSON_PROFILE", familyId, mimeType: "image/jpeg", size: 100 };

    expect(
      (await apiRequest("POST", "/api/v1/media/upload-intents", intent, outsider)).status,
    ).toBe(403);
    expect((await apiRequest("POST", "/api/v1/media/upload-intents", intent, viewer)).status).toBe(
      403,
    );
    const attachment = { ...intent, purpose: "POST_ATTACHMENT" };
    expect(
      (await apiRequest("POST", "/api/v1/media/upload-intents", attachment, outsider)).status,
    ).toBe(403);
    expect(
      (await apiRequest("POST", "/api/v1/media/upload-intents", attachment, viewer)).status,
    ).toBe(201);
  });

  it("only lets the owner upload the file, once, and checks its real type", async () => {
    const creator = await getTestToken("creator");
    const familyId = await createFamily(creator);
    const editor = await join(creator, familyId, "editor", "EDITOR");
    const intent = await apiRequest(
      "POST",
      "/api/v1/media/upload-intents",
      { purpose: "PERSON_PROFILE", familyId, mimeType: "image/jpeg", size: 50 },
      creator,
    );
    const url = intent.body.uploadUrl as string;

    expect((await rawRequest("PUT", url, editor, jpegWithExif())).status).toBe(404);
    const notJpeg = new TextEncoder().encode("<svg onload=alert(1)>");
    expect((await rawRequest("PUT", url, creator, notJpeg)).status).toBe(422);
    expect((await rawRequest("PUT", url, creator, jpegWithExif())).status).toBe(200);
    expect((await rawRequest("PUT", url, creator, jpegWithExif())).status).toBe(422);

    const done = await apiRequest(
      "POST",
      `/api/v1/media/${intent.body.asset.id}/complete`,
      {},
      creator,
    );
    expect(done.status).toBe(200);
    expect(done.body.asset.status).toBe("READY");
  });

  it("will not complete an upload whose file never arrived", async () => {
    const creator = await getTestToken("creator");
    const familyId = await createFamily(creator);
    const intent = await apiRequest(
      "POST",
      "/api/v1/media/upload-intents",
      { purpose: "PERSON_PROFILE", familyId, mimeType: "image/png", size: 50 },
      creator,
    );
    const res = await apiRequest(
      "POST",
      `/api/v1/media/${intent.body.asset.id}/complete`,
      {},
      creator,
    );
    expect(res.status).toBe(422);
  });
});

describe("Image metadata stripping", () => {
  function pngChunk(type: string, data: Uint8Array) {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    return out; // CRC left as zero; the sanitizer does not recompute it
  }

  it("drops PNG text and EXIF chunks and keeps image chunks", () => {
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const parts = [
      signature,
      pngChunk("IHDR", new Uint8Array(13)),
      pngChunk("tEXt", new TextEncoder().encode("Location\0Chennai")),
      pngChunk("eXIf", new TextEncoder().encode("GPS")),
      pngChunk("IDAT", new Uint8Array([1, 2, 3])),
      pngChunk("IEND", new Uint8Array()),
    ];
    const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      png.set(p, offset);
      offset += p.length;
    }
    expect(sniffImageType(png)).toBe("image/png");
    const clean = stripImageMetadata(png, "image/png");
    expect(contains(clean, "Chennai")).toBe(false);
    expect(contains(clean, "eXIf")).toBe(false);
    expect(contains(clean, "IHDR")).toBe(true);
    expect(contains(clean, "IDAT")).toBe(true);
    expect(clean.length).toBe(png.length - (12 + 16) - (12 + 3));
  });

  it("drops WebP EXIF chunks, clears the VP8X flag and fixes the RIFF size", () => {
    const enc = new TextEncoder();
    const chunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(8 + data.length + (data.length % 2));
      out.set(enc.encode(type), 0);
      new DataView(out.buffer).setUint32(4, data.length, true);
      out.set(data, 8);
      return out;
    };
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x08; // EXIF present
    const body = [
      chunk("VP8X", vp8x),
      chunk("VP8 ", new Uint8Array(4)),
      chunk("EXIF", enc.encode("GPS!")),
    ];
    const bodyLength = body.reduce((n, p) => n + p.length, 0);
    const webp = new Uint8Array(12 + bodyLength);
    webp.set(enc.encode("RIFF"), 0);
    new DataView(webp.buffer).setUint32(4, bodyLength + 4, true);
    webp.set(enc.encode("WEBP"), 8);
    let offset = 12;
    for (const p of body) {
      webp.set(p, offset);
      offset += p.length;
    }
    const clean = stripImageMetadata(webp, "image/webp");
    expect(contains(clean, "GPS!")).toBe(false);
    expect(new DataView(clean.buffer).getUint32(4, true)).toBe(clean.length - 8);
    expect(clean[12 + 8] & 0x08).toBe(0);
  });

  it("rejects malformed JPEG data instead of storing it", () => {
    expect(() =>
      stripImageMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "image/jpeg"),
    ).toThrow();
  });
});

describe("Edge rate limiting", () => {
  it("uses the RATE_LIMITER binding when Cloudflare provides one", async () => {
    const token = await getTestToken("busy");
    const keys: string[] = [];
    const env = {
      RATE_LIMITER: {
        async limit({ key }: { key: string }) {
          keys.push(key);
          return { success: false };
        },
      },
    };
    const res = await app.fetch(
      new Request("http://localhost:3000/api/v1/me", {
        headers: { Cookie: `auth_token=${token}` },
      }),
      env,
    );
    expect(res.status).toBe(429);
    expect(keys).toEqual(["busy"]);
  });
});
