/**
 * API integration tests: full Hono app over a D1-shaped better-sqlite3
 * database with real migrations. Proves SC1 (generations), SC2 (kinship
 * endpoint), SC3 (RBAC matrix) at unit speed before live curl evidence.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { migratedDb } from "./d1";
import app from "../src/index";

type Env = Record<string, unknown>;

function makeEnv(): Env {
  return {
    DB: migratedDb(),
    SESSION_SECRET: "test-secret",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_BUCKET: "dbms-family-photos",
    // deliberately no B2_KEY_ID / B2_APP_KEY
  };
}

let env: Env;

async function req(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; json: any; setCookie: string | null }> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await app.fetch(
    new Request(`https://test.local${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
  );
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return {
    status: res.status,
    json,
    setCookie: res.headers.get("set-cookie"),
  };
}

async function newUser(email: string): Promise<string> {
  const r = await req("/api/signup", {
    method: "POST",
    body: { email, name: email.split("@")[0], password: "hunter2secret" },
  });
  expect(r.status).toBe(201);
  const cookie = r.setCookie!.split(";")[0];
  return cookie;
}

/** creator + tree id; optionally add an editor and a viewer */
async function fixtureTree() {
  const creator = await newUser(`creator-${Math.random()}@t.local`);
  const r = await req("/api/trees", {
    method: "POST",
    cookie: creator,
    body: { name: "Fixture" },
  });
  expect(r.status).toBe(201);
  const treeId = r.json.tree.tree_id;
  return { creator, treeId };
}

async function joinAs(
  treeId: string,
  role: "editor" | "viewer",
): Promise<string> {
  const u = await req("/api/signup", {
    method: "POST",
    body: {
      email: `${role}-${Math.random()}@t.local`,
      name: role,
      password: "hunter2secret",
    },
  });
  const cookie = u.setCookie!.split(";")[0];
  const r = await req(`/api/trees/${treeId}/members`, {
    method: "POST",
    cookie,
    body: { role },
  });
  expect(r.status).toBe(201);
  return cookie;
}

beforeAll(() => {
  env = makeEnv();
});

describe("auth", () => {
  it("signup 201 then duplicate email 409", async () => {
    const body = { email: `dup-${Date.now()}@x.local`, name: "D", password: "pw123456789" };
    expect((await req("/api/signup", { method: "POST", body })).status).toBe(201);
    expect((await req("/api/signup", { method: "POST", body })).status).toBe(409);
  });

  it("login sets session cookie; bad password 401; me returns user", async () => {
    const email = `me-${Date.now()}@x.local`;
    await req("/api/signup", { method: "POST", body: { email, name: "Me", password: "pw123456789" } });
    const bad = await req("/api/login", { method: "POST", body: { email, password: "wrong" } });
    expect(bad.status).toBe(401);
    const ok = await req("/api/login", { method: "POST", body: { email, password: "pw123456789" } });
    expect(ok.status).toBe(200);
    expect(ok.json.user.email).toBe(email);
    expect(ok.setCookie).toContain("session=");
    const me = await req("/api/me", { cookie: ok.setCookie!.split(";")[0] });
    expect(me.status).toBe(200);
    expect(me.json.user.email).toBe(email);
    const anon = await req("/api/me");
    expect(anon.status).toBe(401);
  });
});

describe("trees + RBAC (SC3)", () => {
  it("create tree makes creator; list shows role", async () => {
    const c = await newUser(`c-${Date.now()}@t.local`);
    const r = await req("/api/trees", { method: "POST", cookie: c, body: { name: "Narayanan" } });
    expect(r.status).toBe(201);
    const list = await req("/api/trees", { cookie: c });
    expect(list.status).toBe(200);
    const mine = list.json.trees.find((t: any) => t.tree_id === r.json.tree.tree_id);
    expect(mine.role).toBe("creator");
  });

  it("viewer PUT person=403, editor PUT=200, non-member PUT=403, creator DELETE tree=200", async () => {
    const { creator, treeId } = await fixtureTree();
    const editor = await joinAs(treeId, "editor");
    const viewer = await joinAs(treeId, "viewer");

    // editor seeds one person
    const p = await req(`/api/trees/${treeId}/persons`, {
      method: "POST", cookie: editor,
      body: { name: "Ancestor", gender: "m", dob: "1940-01-01" },
    });
    expect(p.status).toBe(201);
    const pid = p.json.person.person_id;

    // viewer read ok
    expect((await req(`/api/persons/${pid}`, { cookie: viewer })).status).toBe(200);
    // SC3 adversarial matrix
    expect((await req(`/api/persons/${pid}`, { method: "PUT", cookie: viewer, body: { job: "x" } })).status).toBe(403);
    expect((await req(`/api/persons/${pid}`, { method: "PUT", cookie: editor, body: { job: "farmer" } })).status).toBe(200);
    const outsider = await newUser(`out-${Date.now()}@t.local`);
    expect((await req(`/api/persons/${pid}`, { method: "PUT", cookie: outsider, body: { job: "hack" } })).status).toBe(403);

    // only creator deletes the tree
    expect((await req(`/api/trees/${treeId}`, { method: "DELETE", cookie: editor })).status).toBe(403);
    expect((await req(`/api/trees/${treeId}`, { method: "DELETE", cookie: creator })).status).toBe(200);
    expect((await req(`/api/persons/${pid}`, { cookie: viewer })).status).toBe(404);
  });

  it("non-member cannot read generations or kinship", async () => {
    const { treeId } = await fixtureTree();
    const outsider = await newUser(`o2-${Date.now()}@t.local`);
    expect((await req(`/api/trees/${treeId}/generations`, { cookie: outsider })).status).toBe(403);
    expect((await req(`/api/kinship?tree=${treeId}&from=a&to=b`, { cookie: outsider })).status).toBe(403);
  });
});

describe("persons/couples/children CRUD", () => {
  it("editor adds couple + child links; viewer cannot create persons", async () => {
    const { creator, treeId } = await fixtureTree();
    void creator;
    const editor = await joinAs(treeId, "editor");
    const mk = (name: string, gender: string, dob: string) =>
      req(`/api/trees/${treeId}/persons`, { method: "POST", cookie: editor, body: { name, gender, dob } });
    const f = await mk("Murugan", "m", "1950-03-01");
    const m = await mk("Devi", "f", "1955-07-12");
    expect(f.status).toBe(201);
    expect(m.status).toBe(201);
    const fid = f.json.person.person_id;
    const mid = m.json.person.person_id;

    const cpl = await req(`/api/trees/${treeId}/couples`, {
      method: "POST", cookie: editor, body: { partner_a: fid, partner_b: mid, other_info: "arranged marriage" },
    });
    expect(cpl.status).toBe(201);
    const cid = cpl.json.couple.couple_id;

    const kid = await mk("Selvam", "m", "1978-11-02");
    const link = await req(`/api/couples/${cid}/children`, {
      method: "POST", cookie: editor, body: { child_person_id: kid.json.person.person_id },
    });
    expect(link.status).toBe(201);

    const viewer = await joinAs(treeId, "viewer");
    // viewer cannot create persons
    const vCreate = await req(`/api/trees/${treeId}/persons`, {
      method: "POST", cookie: viewer, body: { name: "Nope", gender: "f", dob: "1999-01-01" },
    });
    expect(vCreate.status).toBe(403);
  });
});

describe("SC1 generations (recursive CTE)", () => {
  it("returns G1..G3 bands for three linked couples", async () => {
    const { creator, treeId } = await fixtureTree();
    const editor = await joinAs(treeId, "editor");
    const mk = async (name: string, gender: string, dob: string) => {
      const r = await req(`/api/trees/${treeId}/persons`, {
        method: "POST", cookie: editor, body: { name, gender, dob },
      });
      return r.json.person.person_id as string;
    };
    const g1a = await mk("Ramanathan", "m", "1920-01-01");
    const g1b = await mk("Janaki", "f", "1925-01-01");
    const root = await req(`/api/trees/${treeId}/couples`, {
      method: "POST", cookie: editor, body: { partner_a: g1a, partner_b: g1b },
    });
    const son = await mk("Kalyanasundaram", "m", "1948-01-01");
    await req(`/api/couples/${root.json.couple.couple_id}/children`, {
      method: "POST", cookie: editor, body: { child_person_id: son },
    });
    const g2b = await mk("Sarada", "f", "1952-01-01");
    const c2 = await req(`/api/trees/${treeId}/couples`, {
      method: "POST", cookie: editor, body: { partner_a: son, partner_b: g2b },
    });
    const grandkid = await mk("Mohan", "m", "1975-01-01");
    await req(`/api/couples/${c2.json.couple.couple_id}/children`, {
      method: "POST", cookie: editor, body: { child_person_id: grandkid },
    });
    const g3b = await mk("Uma", "f", "1980-01-01");
    const c3 = await req(`/api/trees/${treeId}/couples`, {
      method: "POST", cookie: editor, body: { partner_a: grandkid, partner_b: g3b },
    });
    void c3;

    const g = await req(`/api/trees/${treeId}/generations`, { cookie: creator });
    expect(g.status).toBe(200);
    const bands = g.json.generations;
    expect(bands.length).toBe(3);
    expect(bands[0].gen).toBe(1);
    expect(bands[1].gen).toBe(2);
    expect(bands[2].gen).toBe(3);
    expect(bands[0].couples[0].partners.map((p: any) => p.name)).toEqual(["Ramanathan", "Janaki"]);
    expect(bands[1].couples[0].child_count).toBe(1);
    expect(bands[2].couples[0].partners.map((p: any) => p.name)).toEqual(["Mohan", "Uma"]);
  });
});

describe("SC2 kinship endpoint", () => {
  it("father's younger brother yields uncle/chacha/chittappa/kaka", async () => {
    const { creator, treeId } = await fixtureTree();
    const editor = await joinAs(treeId, "editor");
    const mk = async (name: string, gender: string, dob: string) => {
      const r = await req(`/api/trees/${treeId}/persons`, {
        method: "POST", cookie: editor, body: { name, gender, dob },
      });
      return r.json.person.person_id as string;
    };
    const gf = await mk("Annadurai", "m", "1930-01-01");
    const gm = await mk("Lakshmi", "f", "1935-01-01");
    const root = await req(`/api/trees/${treeId}/couples`, {
      method: "POST", cookie: editor, body: { partner_a: gf, partner_b: gm },
    });
    const fa = await mk("Selvam", "m", "1955-06-01");   // elder son
    const uncle = await mk("Rathan", "m", "1962-09-09"); // younger son
    for (const kid of [fa, uncle]) {
      await req(`/api/couples/${root.json.couple.couple_id}/children`, {
        method: "POST", cookie: editor, body: { child_person_id: kid },
      });
    }
    const nephew = await mk("Arjun", "m", "1985-02-02");
    const fam = await req(`/api/trees/${treeId}/couples`, {
      method: "POST", cookie: editor, body: { partner_a: fa, partner_b: null },
    });
    await req(`/api/couples/${fam.json.couple.couple_id}/children`, {
      method: "POST", cookie: editor, body: { child_person_id: nephew },
    });

    const k = await req(`/api/kinship?tree=${treeId}&from=${nephew}&to=${uncle}`, { cookie: creator });
    expect(k.status).toBe(200);
    expect(k.json.relation_key).toBe("fa_br_yo");
    expect(k.json.terms.en.term).toBe("uncle");
    expect(k.json.terms.hi.term).toBe("chacha");
    expect(k.json.terms.ta.term).toBe("chittappa");
    expect(k.json.terms.bn.term).toBe("kaka");
    expect(typeof k.json.gloss).toBe("string");
  });
});

describe("photo upload (B2)", () => {
  it("503 b2_not_configured when keys absent", async () => {
    const { creator, treeId } = await fixtureTree();
    void creator;
    const editor = await joinAs(treeId, "editor");
    const p = await req(`/api/trees/${treeId}/persons`, {
      method: "POST", cookie: editor, body: { name: "PhotoGuy", gender: "m" },
    });
    const pid = p.json.person.person_id;
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "p.png");
    const res = await app.fetch(
      new Request(`https://test.local/api/persons/${pid}/photo`, {
        method: "POST",
        headers: { cookie: editor },
        body: form,
      }),
      env,
    );
    expect(res.status).toBe(503);
    const j: any = await res.json();
    expect(j.error).toBe("b2_not_configured");
  });
});
