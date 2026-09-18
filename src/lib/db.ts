import type { D1Database } from "@cloudflare/workers-types";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import { env } from "~/lib/env";
import { getContext } from "~/lib/context";

export type DB = BaseSQLiteDatabase<any, any, typeof schema>;

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
