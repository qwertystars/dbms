import type { D1Database } from "@cloudflare/workers-types";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import * as schema from "~/db/schema";
import { env } from "~/lib/env";
import { getContext } from "~/lib/context";

/**
 * D1 does not support interactive transactions, so every service uses
 * `db.batch([...])`. The batch API is atomic on D1 and runs as a transaction
 * on the local libsql client, which keeps both environments on one code path.
 */
export type DB = BaseSQLiteDatabase<any, any, typeof schema> & {
  batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
    batch: T,
  ): Promise<BatchResponse<T>>;
};

let fallbackDb: DB | undefined;
const libsqlClients = new Map<string, any>();

export async function createDb(input: D1Database | string): Promise<DB> {
  if (typeof input === "string") {
    const [{ createClient }, { drizzle: drizzleLibsql }] = await Promise.all([
      import("@libsql/client"),
      import("drizzle-orm/libsql"),
    ]);
    if (!libsqlClients.has(input)) {
      const client = createClient({ url: input });
      // Match Cloudflare D1, which enforces foreign keys on every connection.
      // Plain SQLite (used by tests and `pnpm dev`) defaults to off.
      await client.execute("PRAGMA foreign_keys = ON");
      libsqlClients.set(input, client);
    }
    const client = libsqlClients.get(input);
    return drizzleLibsql(client, { schema }) as unknown as DB;
  }
  return drizzleD1(input, { schema }) as unknown as DB;
}

export async function initDb(): Promise<DB> {
  if (!fallbackDb) {
    const url = env.DATABASE_URL ?? ":memory:";
    fallbackDb = await createDb(url);
  }
  return fallbackDb;
}

export function getDb(): DB {
  const requestDb = getContext()?.db;
  if (requestDb) return requestDb;
  if (!fallbackDb) {
    throw new Error("Database not initialized. Call initDb() before using the global db proxy.");
  }
  return fallbackDb;
}

export const db = new Proxy({} as DB, {
  get(_, prop) {
    const instance = getDb();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
