/**
 * The Hono application: auth, trees, persons, couples, generations
 * (recursive CTE), kinship terms, and photo upload. All state lives in D1;
 * sessions are signed cookies (see ./auth).
 */
import { Hono } from "hono";
import { classify } from "../kinship";
import { resolveTerms } from "../kinship/terms";
import { B2ConfigError, uploadPhoto } from "../storage/b2";
import {
  DEV_SESSION_SECRET,
  hashPassword,
  makeSessionToken,
  publicUser,
  readSessionToken,
  sessionCookieValue,
  sessionSetCookie,
  verifyPassword,
} from "./auth";

export interface Bindings {
  DB: D1Database;
  SESSION_SECRET?: string;
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_ENDPOINT?: string;
  B2_BUCKET?: string;
}

type Vars = { user: RowUser | null };
export type AppEnv = { Bindings: Bindings; Variables: Vars };

interface RowUser {
  user_id: string;
  email: string;
  name: string;
  password_hash: string;
  lang: "en" | "hi" | "ta" | "bn";
  person_id: string | null;
}

const ROLE_RANK: Record<string, number> = { viewer: 1, editor: 2, creator: 3 };
const PERSON_FIELDS = [
  "name", "gender", "dob", "dod", "height", "weight", "address", "mail",
  "phone", "job", "degree", "place", "other_info", "birth_order",
] as const;

function bad(c: any, status: number, message: string, extra?: Record<string, unknown>) {
  return c.json({ message, ...extra }, status as 400);
}

async function currentUser(c: any): Promise<RowUser | null> {
  const token = sessionCookieValue(c.req.header("cookie"));
  if (!token) return null;
  const uid = await readSessionToken(
    c.env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    token,
  );
  if (!uid) return null;
  return (await c.env.DB.prepare(
    "SELECT user_id,email,name,password_hash,lang,person_id FROM users WHERE user_id = ?",
  )
    .bind(uid)
    .first()) as RowUser | null;
}

/** Returns the access role or an error Response to bail with. */
async function requireAccess(
  c: any,
  treeId: string,
  minRole: keyof typeof ROLE_RANK,
): Promise<{ role: string } | Response> {
  const user = c.get("user");
  if (!user) return bad(c, 401, "authentication required");
  const row = (await c.env.DB.prepare(
    "SELECT role FROM tree_access WHERE tree_id = ? AND user_id = ?",
  )
    .bind(treeId, user.user_id)
    .first()) as { role: string } | null;
  if (!row || (ROLE_RANK[row.role] ?? 0) < ROLE_RANK[minRole]!) {
    return bad(c, 403, "forbidden");
  }
  return { role: row.role };
}

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  c.set("user", await currentUser(c));
  await next();
});

// ---------- auth ----------

app.post("/api/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.name || !body?.password) {
    return bad(c, 400, "email, name and password are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) {
    return bad(c, 400, "invalid email");
  }
  if (String(body.password).length < 8) {
    return bad(c, 400, "password must be at least 8 characters");
  }
  const lang = ["en", "hi", "ta", "bn"].includes(body.lang) ? body.lang : "en";
  const user_id = crypto.randomUUID();
  const person_id =
    typeof body.person_id === "string" && body.person_id ? body.person_id : null;
  try {
    await c.env.DB.prepare(
      "INSERT INTO users (user_id,email,name,password_hash,lang,person_id,created_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        user_id,
        String(body.email).toLowerCase(),
        String(body.name),
        await hashPassword(String(body.password)),
        lang,
        person_id,
        Math.floor(Date.now() / 1000),
      )
      .run();
  } catch (e: unknown) {
    if (String((e as Error)?.message ?? e).includes("UNIQUE")) {
      return bad(c, 409, "email already registered");
    }
    throw e;
  }
  const token = await makeSessionToken(
    c.env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    user_id,
  );
  c.header("set-cookie", sessionSetCookie(token));
  return c.json(
    { user: publicUser({ user_id, email: String(body.email).toLowerCase(), name: String(body.name), lang, person_id }) },
    201,
  );
});

app.post("/api/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return bad(c, 400, "email and password are required");
  }
  const row = await c.env.DB.prepare(
    "SELECT user_id,email,name,password_hash,lang,person_id FROM users WHERE email = ?",
  )
    .bind(String(body.email).toLowerCase())
    .first<RowUser>();
  if (!row || !(await verifyPassword(String(body.password), row.password_hash))) {
    return bad(c, 401, "invalid credentials");
  }
  const token = await makeSessionToken(
    c.env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    row.user_id,
  );
  c.header("set-cookie", sessionSetCookie(token));
  return c.json({ user: publicUser(row) });
});

app.get("/api/me", (c) => {
  const user = c.get("user");
  if (!user) return bad(c, 401, "not logged in");
  return c.json({ user: publicUser(user) });
});

app.post("/api/logout", (c) => {
  // Sessions are stateless HMAC tokens: this clears the cookie client-side
  // but cannot revoke a token that was already issued.
  c.header("set-cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return c.body(null, 204);
});

// ---------- trees ----------

app.get("/api/trees", async (c) => {
  const user = c.get("user");
  if (!user) return bad(c, 401, "authentication required");
  const { results } = await c.env.DB.prepare(
    "SELECT t.tree_id, t.name, ta.role FROM trees t JOIN tree_access ta ON ta.tree_id = t.tree_id WHERE ta.user_id = ? ORDER BY t.created_at DESC",
  )
    .bind(user.user_id)
    .all();
  return c.json({ trees: results });
});

app.post("/api/trees", async (c) => {
  const user = c.get("user");
  if (!user) return bad(c, 401, "authentication required");
  const body = await c.req.json().catch(() => null);
  if (!body?.name) return bad(c, 400, "name is required");
  const tree_id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO trees (tree_id,name,created_by,created_at) VALUES (?,?,?,?)").bind(
      tree_id, String(body.name), user.user_id, Math.floor(Date.now() / 1000),
    ),
    c.env.DB.prepare("INSERT INTO tree_access (tree_id,user_id,role) VALUES (?,?,'creator')").bind(
      tree_id, user.user_id,
    ),
  ]);
  return c.json({ tree: { tree_id, name: String(body.name), created_by: user.user_id } }, 201);
});

app.delete("/api/trees/:id", async (c) => {
  const treeId = c.req.param("id");
  const access = await requireAccess(c, treeId, "creator");
  if (access instanceof Response) return access;
  // manual cascade in FK-safe order; users.person_id must be released
  // BEFORE persons are deleted or the batch 500s on the FK
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET person_id = NULL WHERE person_id IN (SELECT person_id FROM person WHERE tree_id = ?)").bind(treeId),
    c.env.DB.prepare("DELETE FROM child_of WHERE couple_id IN (SELECT couple_id FROM couple WHERE tree_id = ?)").bind(treeId),
    c.env.DB.prepare("DELETE FROM couple WHERE tree_id = ?").bind(treeId),
    c.env.DB.prepare("DELETE FROM person WHERE tree_id = ?").bind(treeId),
    c.env.DB.prepare("DELETE FROM tree_access WHERE tree_id = ?").bind(treeId),
    c.env.DB.prepare("DELETE FROM trees WHERE tree_id = ?").bind(treeId),
  ]);
  return c.json({ ok: true });
});

// ---------- membership ----------
// Users may self-join a tree, but always as VIEWER. Elevated roles are
// granted only by the creator via /access.

app.post("/api/trees/:id/members", async (c) => {
  const treeId = c.req.param("id");
  const user = c.get("user");
  if (!user) return bad(c, 401, "authentication required");
  const tree = await c.env.DB.prepare("SELECT tree_id FROM trees WHERE tree_id = ?")
    .bind(treeId)
    .first();
  if (!tree) return bad(c, 404, "tree not found");
  const existing = await c.env.DB.prepare(
    "SELECT role FROM tree_access WHERE tree_id = ? AND user_id = ?",
  )
    .bind(treeId, user.user_id)
    .first<{ role: string }>();
  if (existing) return bad(c, 409, `already a member (${existing.role})`);
  await c.env.DB.prepare("INSERT INTO tree_access (tree_id,user_id,role) VALUES (?,?,'viewer')")
    .bind(treeId, user.user_id)
    .run();
  return c.json({ ok: true, role: "viewer" }, 201);
});

/** Creator-only grant: {email, role: 'editor'|'viewer'} */
app.post("/api/trees/:id/access", async (c) => {
  const treeId = c.req.param("id");
  const access = await requireAccess(c, treeId, "creator");
  if (access instanceof Response) return access;
  const body = await c.req.json().catch(() => null);
  const role = body?.role;
  if (!["editor", "viewer"].includes(role)) {
    return bad(c, 400, "role must be editor or viewer");
  }
  if (!body?.email) return bad(c, 400, "email is required");
  const target = (await c.env.DB.prepare("SELECT user_id FROM users WHERE email = ?")
    .bind(String(body.email).toLowerCase())
    .first()) as { user_id: string } | null;
  if (!target) return bad(c, 404, "no such user");
  await c.env.DB.prepare(
    "INSERT INTO tree_access (tree_id,user_id,role) VALUES (?,?,?) ON CONFLICT(tree_id,user_id) DO UPDATE SET role = excluded.role",
  )
    .bind(treeId, target.user_id, role)
    .run();
  return c.json({ ok: true, role }, 201);
});

// ---------- persons ----------

app.post("/api/trees/:id/persons", async (c) => {
  const treeId = c.req.param("id");
  const access = await requireAccess(c, treeId, "editor");
  if (access instanceof Response) return access;
  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.gender) return bad(c, 400, "name and gender are required");
  if (!["m", "f", "o"].includes(body.gender)) return bad(c, 400, "gender must be m/f/o");
  const person_id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO person (person_id,tree_id,name,gender,dob,dod,height,weight,address,mail,phone,job,degree,place,other_info,birth_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(
    person_id, treeId, String(body.name), String(body.gender),
    body.dob ?? null, body.dod ?? null, body.height ?? null, body.weight ?? null,
    body.address ?? null, body.mail ?? null, body.phone ?? null, body.job ?? null,
    body.degree ?? null, body.place ?? null, body.other_info ?? null,
    typeof body.birth_order === "number" ? body.birth_order : null,
  ).run();
  const row = await c.env.DB.prepare("SELECT * FROM person WHERE person_id = ?")
    .bind(person_id)
    .first();
  return c.json({ person: row }, 201);
});

app.get("/api/persons/:pid", async (c) => {
  const pid = c.req.param("pid");
  const row = await c.env.DB.prepare(
    "SELECT tree_id FROM person WHERE person_id = ?",
  ).bind(pid).first<{ tree_id: string }>();
  if (!row) return bad(c, 404, "person not found");
  const access = await requireAccess(c, row.tree_id, "viewer");
  if (access instanceof Response) return access;
  const person = await c.env.DB.prepare("SELECT * FROM person WHERE person_id = ?")
    .bind(pid)
    .first();
  return c.json(person);
});

app.put("/api/persons/:pid", async (c) => {
  const pid = c.req.param("pid");
  const row = await c.env.DB.prepare(
    "SELECT tree_id FROM person WHERE person_id = ?",
  ).bind(pid).first<{ tree_id: string }>();
  if (!row) return bad(c, 404, "person not found");
  const access = await requireAccess(c, row.tree_id, "editor");
  if (access instanceof Response) return access;
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad(c, 400, "body required");
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of PERSON_FIELDS) {
    if (f in body) {
      sets.push(`${f} = ?`);
      vals.push(body[f]);
    }
  }
  if (sets.length > 0) {
    vals.push(pid);
    await c.env.DB.prepare(`UPDATE person SET ${sets.join(", ")} WHERE person_id = ?`)
      .bind(...vals)
      .run();
  }
  const fresh = await c.env.DB.prepare("SELECT * FROM person WHERE person_id = ?")
    .bind(pid)
    .first();
  return c.json(fresh);
});

app.post("/api/persons/:pid/photo", async (c) => {
  const pid = c.req.param("pid");
  const row = await c.env.DB.prepare(
    "SELECT tree_id FROM person WHERE person_id = ?",
  ).bind(pid).first<{ tree_id: string }>();
  if (!row) return bad(c, 404, "person not found");
  const access = await requireAccess(c, row.tree_id, "editor");
  if (access instanceof Response) return access;
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad(c, 400, "multipart field 'file' required");
  const ext = (file.type.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "");
  const key = `photos/${row.tree_id}/${pid}.${ext}`;
  try {
    const { photo_url } = await uploadPhoto(
      {
        B2_KEY_ID: c.env.B2_KEY_ID,
        B2_APP_KEY: c.env.B2_APP_KEY,
        B2_ENDPOINT: c.env.B2_ENDPOINT ?? "",
        B2_BUCKET: c.env.B2_BUCKET ?? "",
      },
      key,
      new Uint8Array(await file.arrayBuffer()),
      file.type || "application/octet-stream",
    );
    await c.env.DB.prepare("UPDATE person SET photo_url = ? WHERE person_id = ?")
      .bind(photo_url, pid)
      .run();
    return c.json({ photo_url });
  } catch (e) {
    if (e instanceof B2ConfigError) {
      return c.json({ error: "b2_not_configured", message: e.message }, 503);
    }
    throw e;
  }
});

app.delete("/api/persons/:pid", async (c) => {
  const pid = c.req.param("pid");
  const row = (await c.env.DB.prepare(
    "SELECT tree_id FROM person WHERE person_id = ?",
  ).bind(pid).first()) as { tree_id: string } | null;
  if (!row) return bad(c, 404, "person not found");
  const access = await requireAccess(c, row.tree_id, "editor");
  if (access instanceof Response) return access;
  // release references first: child links, partner slots, then the row
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM child_of WHERE child_person_id = ?").bind(pid),
    c.env.DB.prepare("UPDATE couple SET partner_a = NULL WHERE partner_a = ?").bind(pid),
    c.env.DB.prepare("UPDATE couple SET partner_b = NULL WHERE partner_b = ?").bind(pid),
    c.env.DB.prepare("DELETE FROM person WHERE person_id = ?").bind(pid),
  ]);
  return c.json({ ok: true });
});

// ---------- couples ----------

app.post("/api/trees/:id/couples", async (c) => {
  const treeId = c.req.param("id");
  const access = await requireAccess(c, treeId, "editor");
  if (access instanceof Response) return access;
  const body = await c.req.json().catch(() => null);
  const { partner_a: a, partner_b: b } = body ?? {};
  if (!a && !b) return bad(c, 400, "at least one partner is required");
  for (const p of [a, b]) {
    if (!p) continue;
    const r = await c.env.DB.prepare(
      "SELECT person_id FROM person WHERE person_id = ? AND tree_id = ?",
    ).bind(p, treeId).first();
    if (!r) return bad(c, 400, `partner ${p} not in this tree`);
  }
  if (a && b && a === b) return bad(c, 400, "partners must differ");
  const couple_id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO couple (couple_id,tree_id,partner_a,partner_b,other_info) VALUES (?,?,?,?,?)",
  )
    .bind(couple_id, treeId, a ?? null, b ?? null, body.other_info ?? null)
    .run();
  return c.json({ couple: { couple_id, partner_a: a ?? null, partner_b: b ?? null, other_info: body.other_info ?? null } }, 201);
});

app.post("/api/couples/:cid/children", async (c) => {
  const cid = c.req.param("cid");
  const couple = await c.env.DB.prepare(
    "SELECT couple_id, tree_id FROM couple WHERE couple_id = ?",
  ).bind(cid).first<{ couple_id: string; tree_id: string }>();
  if (!couple) return bad(c, 404, "couple not found");
  const access = await requireAccess(c, couple.tree_id, "editor");
  if (access instanceof Response) return access;
  const body = await c.req.json().catch(() => null);
  const child = body?.child_person_id;
  if (!child) return bad(c, 400, "child_person_id is required");
  const kid = await c.env.DB.prepare(
    "SELECT person_id FROM person WHERE person_id = ? AND tree_id = ?",
  ).bind(child, couple.tree_id).first();
  if (!kid) return bad(c, 400, "child not in this tree");
  try {
    await c.env.DB.prepare(
      "INSERT INTO child_of (couple_id,child_person_id) VALUES (?,?)",
    ).bind(cid, child).run();
  } catch (e: unknown) {
    if (String((e as Error)?.message ?? e).includes("UNIQUE")) {
      return bad(c, 409, "child already linked to this couple");
    }
    throw e;
  }
  return c.json({ ok: true }, 201);
});

// ---------- generations (SC1: recursive CTE strips G1..Gn) ----------

app.get("/api/trees/:id/generations", async (c) => {
  const treeId = c.req.param("id");
  const access = await requireAccess(c, treeId, "viewer");
  if (access instanceof Response) return access;

  // Generation of a couple = 1 + generation of the couple whose child one of
  // its partners is. Root couples have no same-tree parent couple.
  // UNION dedups (couple_id,lvl) pairs and lvl is capped at 20: belt-and-braces
  // against accidental couple cycles (UNION alone still grows lvls unbounded).
  const levels = await c.env.DB.prepare(
    `WITH RECURSIVE gen(couple_id, lvl) AS (
       SELECT c.couple_id, 1
       FROM couple c
       WHERE c.tree_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM child_of co JOIN couple pc ON pc.couple_id = co.couple_id
           WHERE pc.tree_id = c.tree_id
             AND co.child_person_id IN (c.partner_a, c.partner_b)
         )
       UNION
       SELECT k.couple_id, g.lvl + 1
       FROM gen g
       JOIN child_of co ON co.couple_id = g.couple_id
       JOIN couple k ON k.tree_id = ?
         AND (k.partner_a = co.child_person_id OR k.partner_b = co.child_person_id)
       WHERE g.lvl < 20
     )
     SELECT couple_id, MAX(lvl) AS lvl FROM gen GROUP BY couple_id`,
  ).bind(treeId, treeId).all<{ couple_id: string; lvl: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT c.couple_id, c.other_info,
            pa.person_id AS a_id, pa.name AS a_name, pa.gender AS a_gender,
            pb.person_id AS b_id, pb.name AS b_name, pb.gender AS b_gender,
            (SELECT COUNT(*) FROM child_of ch WHERE ch.couple_id = c.couple_id) AS child_count
     FROM couple c
     LEFT JOIN person pa ON pa.person_id = c.partner_a
     LEFT JOIN person pb ON pb.person_id = c.partner_b
     WHERE c.tree_id = ?`,
  ).bind(treeId).all<any>();

  const lvlOf = new Map(levels.results.map((r) => [r.couple_id, r.lvl]));
  const maxLvl = Math.max(0, ...[...lvlOf.values()]);
  const bands = Array.from({ length: maxLvl }, (_, i) => ({
    gen: i + 1,
    couples: [] as Array<Record<string, unknown>>,
  }));
  for (const r of rows.results) {
    const lvl = lvlOf.get(r.couple_id);
    if (!lvl) continue; // unreachable/cyclic couple - excluded by design
    const partners = [
      r.a_id && { person_id: r.a_id, name: r.a_name, gender: r.a_gender },
      r.b_id && { person_id: r.b_id, name: r.b_name, gender: r.b_gender },
    ].filter(Boolean);
    bands[lvl - 1]!.couples.push({
      couple_id: r.couple_id,
      partners,
      child_count: r.child_count,
      other_info: r.other_info,
    });
  }
  return c.json({ generations: bands });
});

// ---------- kinship (SC2) ----------

app.get("/api/kinship", async (c) => {
  const treeId = c.req.query("tree");
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!treeId || !from || !to) {
    return bad(c, 400, "tree, from and to query params are required");
  }
  const access = await requireAccess(c, treeId, "viewer");
  if (access instanceof Response) return access;

  const [persons, couples, childOf] = await Promise.all([
    c.env.DB.prepare(
      "SELECT person_id AS id, gender, dob, birth_order FROM person WHERE tree_id = ?",
    ).bind(treeId).all(),
    c.env.DB.prepare("SELECT couple_id, partner_a, partner_b FROM couple WHERE tree_id = ?")
      .bind(treeId).all(),
    c.env.DB.prepare(
      "SELECT co.couple_id, co.child_person_id FROM child_of co JOIN couple cu ON cu.couple_id = co.couple_id WHERE cu.tree_id = ?",
    ).bind(treeId).all(),
  ]);

  const result = classify(
    {
      persons: persons.results as never,
      couples: couples.results as never,
      child_of: childOf.results as never,
    },
    from,
    to,
  );
  if (!result.relation_key) {
    return c.json({
      relation_key: null,
      path: result.path,
      terms: null,
      gloss: "no known relation within six links",
    });
  }
  const t = resolveTerms(result.relation_key);
  return c.json({
    relation_key: result.relation_key,
    path: result.path,
    terms: { en: t.en, hi: t.hi, ta: t.ta, bn: t.bn },
    gloss: t.gloss,
  });
});

export default app;
