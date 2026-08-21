// Schema integrity tests for the D1 (SQLite) migrations.
//
// D1 is SQLite, so we apply migrations/0001_init.sql and migrations/0002_seed.sql
// verbatim to an in-memory better-sqlite3 database and assert on real behavior.
//
// Note on elder/younger kin terms (_el/_yo): the runtime decides via ISO-string
// dob compare with birth_order as fallback. When BOTH are unknown, the default
// is _yo (younger). That choice lives in src/; this table mirrors it only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..");

function loadMigration(name: string): string {
  // Strip TSQL-style comments if any, then hand the file to db.exec.
  const raw = readFileSync(join(REPO_ROOT, "migrations", name), "utf8");
  return raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

let db: Database.Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.exec(loadMigration("0001_init.sql"));
  db.exec(loadMigration("0002_seed.sql"));
});

describe("schema constraints", () => {
  it("rejects tree_access role outside ('creator','editor','viewer')", () => {
    const userId = "u-admin-test";
    db.prepare(
      `INSERT INTO users (user_id, email, name, password_hash, lang, person_id, created_at)
       VALUES (?, ?, ?, ?, 'en', NULL, 0)`
    ).run(userId, "admin-test@example.com", "Admin Test", "hash");
    expect(() =>
      db
        .prepare(
          `INSERT INTO tree_access (tree_id, user_id, role) VALUES ('t-narayanan', ?, 'admin')`
        )
        .run(userId)
    ).toThrow(/CHECK/i);
  });

  it("rejects person gender outside ('m','f','o')", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO person (person_id, tree_id, name, gender) VALUES ('p-gender-x', 't-narayanan', 'Bad Gender', 'x')`
        )
        .run()
    ).toThrow(/CHECK/i);
  });

  it("enforces child_of -> couple foreign key when PRAGMA foreign_keys=ON", () => {
    db.pragma("foreign_keys = ON");
    expect(() =>
      db
        .prepare(
          `INSERT INTO child_of (couple_id, child_person_id) VALUES ('c-does-not-exist', 'p-aadhira')`
        )
        .run()
    ).toThrow(/FOREIGN KEY/i);
  });

  it("rejects duplicate (lang, relation_key) in kin_term", () => {
    expect(() =>
      db.prepare(`INSERT INTO kin_term (lang, relation_key, term, gloss) VALUES ('en', 'fa', 'dup', 'dup')`).run()
    ).toThrow(/UNIQUE|PRIMARY KEY/i);
  });
});

describe("recursive generation-band CTE", () => {
  const BANDS_SQL = `
    WITH RECURSIVE bands AS (
      SELECT c.couple_id, c.tree_id, 1 AS gen
      FROM couple c
      WHERE c.tree_id = :tree
        AND NOT EXISTS (
          SELECT 1 FROM child_of co
          WHERE co.child_person_id = c.partner_a OR co.child_person_id = c.partner_b
        )
      UNION ALL
      SELECT kc.couple_id, b.tree_id, b.gen + 1
      FROM bands b
      JOIN child_of co ON co.couple_id = b.couple_id
      JOIN couple kc ON kc.partner_a = co.child_person_id OR kc.partner_b = co.child_person_id
    )`;

  it("returns bands 1..4 with exactly one couple per band for the Narayanan tree", () => {
    const rows = db
      .prepare(
        `${BANDS_SQL} SELECT gen, couple_id FROM bands WHERE tree_id = :tree ORDER BY gen`
      )
      .all({ tree: "t-narayanan" }) as Array<{ gen: number; couple_id: string }>;

    expect(rows.map((r) => r.gen)).toEqual([1, 2, 3, 4]);
    for (const gen of [1, 2, 3, 4]) {
      expect(rows.filter((r) => r.gen === gen)).toHaveLength(1);
    }
  });

  it("reports child_count 1 for the g4 couple of the Narayanan tree", () => {
    const row = db
      .prepare(
        `${BANDS_SQL}
         SELECT b.couple_id,
                (SELECT COUNT(*) FROM child_of co WHERE co.couple_id = b.couple_id) AS child_count
         FROM bands b
         WHERE b.tree_id = :tree AND b.gen = 4`
      )
      .get({ tree: "t-narayanan" }) as { couple_id: string; child_count: number };

    expect(row.child_count).toBe(1);
  });

  it("returns bands 1..2 for the Path tree", () => {
    const rows = db
      .prepare(`${BANDS_SQL} SELECT gen FROM bands WHERE tree_id = :tree ORDER BY gen`)
      .all({ tree: "t-path" }) as Array<{ gen: number }>;
    expect(rows.map((r) => r.gen)).toEqual([1, 2]);
  });
});

describe("seed data shape", () => {
  it("seeded the required indexes", () => {
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_person_tree','idx_couple_tree','idx_child_child')`)
      .all() as Array<{ name: string }>;
    expect(idx.map((i) => i.name).sort()).toEqual([
      "idx_child_child",
      "idx_couple_tree",
      "idx_person_tree",
    ]);
  });

  it("seeded all canonical relation keys per language (superset incl. in-law keys)", () => {
    const canonicalBase = [
      "self", "spouse", "fa", "mo", "son", "daughter",
      "brother_el", "brother_yo", "sister_el", "sister_yo",
      "grandfa_pat", "grandmo_pat", "grandfa_mat", "grandmo_mat",
      "grandson", "granddaughter",
      "fa_br_el", "fa_br_yo", "fa_si", "mo_br", "mo_si_el", "mo_si_yo",
      "fa_br_el_sp", "fa_br_yo_sp", "fa_si_sp", "mo_br_sp", "mo_si_sp",
      "brother_son", "brother_daughter", "sister_son", "sister_daughter",
      "cousin",
    ];
    const inLawExtras = ["son_sp", "da_sp"];
    // 'self' is in the canonical key set but has no authoritative kin_term row:
    // it resolves identity (not a term) in TypeScript at runtime, so the mirror
    // table legitimately omits it.
    for (const lang of ["en", "hi", "ta", "bn"]) {
      const keys = (
        db.prepare(`SELECT relation_key FROM kin_term WHERE lang = ?`).all(lang) as Array<{
          relation_key: string;
        }>
      ).map((r) => r.relation_key);
      for (const key of [...canonicalBase, ...inLawExtras]) {
        if (key === "self") continue;
        expect(keys, `${lang}/${key}`).toContain(key);
      }
    }
  });

  it("has Aadhira and Srijan present without a couple", () => {
    const aadhira = db
      .prepare(`SELECT partner_a, partner_b FROM couple WHERE partner_a = 'p-aadhira' OR partner_b = 'p-aadhira'`)
      .get();
    const srijan = db
      .prepare(`SELECT partner_a, partner_b FROM couple WHERE partner_a = 'p-srijan' OR partner_b = 'p-srijan'`)
      .get();
    expect(aadhira).toBeUndefined();
    expect(srijan).toBeUndefined();

    const aadhiraChild = db
      .prepare(`SELECT COUNT(*) AS n FROM child_of co JOIN couple c ON c.couple_id = co.couple_id WHERE co.child_person_id = 'p-aadhira'`)
      .get() as { n: number };
    expect(aadhiraChild.n).toBe(1);
  });
});
