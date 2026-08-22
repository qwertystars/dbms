/**
 * Minimal D1-over-better-sqlite3 shim so the Hono app can be exercised in
 * vitest with the exact SQL it will run against real D1. Implements the
 * subset of the D1 API the server uses: prepare/bind/all/first/run, batch,
 * exec. Foreign keys are enforced like D1 does.
 */
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type StmtResult = {
  success: boolean;
  meta: { last_row_id: number | bigint; changes: number };
};

export class D1Shim {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma("foreign_keys = ON");
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    const make = (args: unknown[]) => ({
      bind: (...b: unknown[]) => make([...args, ...b]),
      all: async () => ({ results: stmt.all(...args) }),
      first: async <T = Record<string, unknown>>() =>
        (stmt.get(...args) as T | undefined) ?? null,
      run: async (): Promise<StmtResult> => {
        const info = stmt.run(...(args as never[]));
        return {
          success: true,
          meta: { last_row_id: info.lastInsertRowid, changes: info.changes },
        };
      },
    });
    return make([]);
  }

  async batch(stmts: Array<{ run: () => Promise<StmtResult> }>): Promise<Array<StmtResult>> {
    // Sequential execution mirrors D1 batch semantics for our usage
    // (better-sqlite3 runs synchronously under the async shape).
    const out: StmtResult[] = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

/** Fresh in-memory DB with every migration applied, wrapped in the shim. */
export function migratedDb(): D1Shim {
  const db = new Database(":memory:");
  const migrations = readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const m of migrations) {
    db.exec(readFileSync(join("migrations", m), "utf8"));
  }
  return new D1Shim(db);
}
