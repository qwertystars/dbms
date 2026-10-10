import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb, initDb } from "~/lib/db";

let initialized = false;

export async function setup() {
  if (initialized) return;
  await initDb();
  await migrate(getDb() as any, { migrationsFolder: "./db/migrations" });
  initialized = true;
}
