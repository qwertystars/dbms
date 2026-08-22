/** TEMPORARY probe: why does the API kinship fixture yield relation_key null? */
import { describe, it } from "vitest";
import { migratedDb } from "./d1";
import app from "../src/index";
import { classify } from "../src/kinship";

const env = { DB: migratedDb(), SESSION_SECRET: "s" };

async function req(path: string, init: any = {}) {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await app.fetch(new Request(`https://t.local${path}`, {
    method: init.method ?? "GET", headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }), env as never);
  return { status: res.status, json: await res.json().catch(() => null), setCookie: res.headers.get("set-cookie") };
}

describe("probe", () => {
  it("dumps the graph", async () => {
    const s = await req("/api/signup", { method: "POST", body: { email: "a@b.c", name: "A", password: "hunter2secret" } });
    const cookie = s.setCookie!.split(";")[0];
    const t = await req("/api/trees", { method: "POST", cookie, body: { name: "T" } });
    const tree = t.json.tree.tree_id;
    const mk = async (name: string, gender: string, dob: string) =>
      (await req(`/api/trees/${tree}/persons`, { method: "POST", cookie, body: { name, gender, dob } })).json.person.person_id;
    const gf = await mk("Annadurai", "m", "1930-01-01");
    const gm = await mk("Lakshmi", "f", "1935-01-01");
    const root = await req(`/api/trees/${tree}/couples`, { method: "POST", cookie, body: { partner_a: gf, partner_b: gm } });
    const fa = await mk("Selvam", "m", "1955-06-01");
    const uncle = await mk("Rathan", "m", "1962-09-09");
    for (const kid of [fa, uncle]) {
      await req(`/api/couples/${root.json.couple.couple_id}/children`, { method: "POST", cookie, body: { child_person_id: kid } });
    }
    const nephew = await mk("Arjun", "m", "1985-02-02");
    const fam = await req(`/api/trees/${tree}/couples`, { method: "POST", cookie, body: { partner_a: fa, partner_b: null } });
    console.log("fam status", fam.status, JSON.stringify(fam.json));
    await req(`/api/couples/${fam.json.couple.couple_id}/children`, { method: "POST", cookie, body: { child_person_id: nephew } });

    // raw graph straight from the shim
    const db = (env.DB as unknown as { prepare: (s: string) => { bind: (...a: unknown[]) => { all: () => Promise<{ results: unknown[] }> } } });
    const persons = (await db.prepare("SELECT person_id, gender, dob, birth_order FROM person WHERE tree_id = ?").bind(tree).all()).results;
    const couples = (await db.prepare("SELECT couple_id, partner_a, partner_b FROM couple WHERE tree_id = ?").bind(tree).all()).results;
    const ch = (await db.prepare("SELECT co.couple_id, co.child_person_id FROM child_of co JOIN couple cu ON cu.couple_id = co.couple_id WHERE cu.tree_id = ?").bind(tree).all()).results;
    console.log("GRAPH", JSON.stringify({ persons, couples, child_of: ch }, null, 1));
    console.log("CLASSIFY", JSON.stringify(classify({ persons: persons as never, couples: couples as never, child_of: ch as never }, nephew, uncle)));

    const k = await req(`/api/kinship?tree=${tree}&from=${nephew}&to=${uncle}`, { cookie });
    console.log("API KINSHIP", k.status, JSON.stringify(k.json));
  });
});
