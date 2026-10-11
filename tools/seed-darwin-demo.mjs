import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Opt-in operational script: creates only the demo account's own private family
// through the same authenticated API routes as the UI. Never resets user data.
const base = process.env.BANYAN_BASE_URL;
if (!base) throw new Error("Set BANYAN_BASE_URL to the target app origin.");
const credentialPath =
  process.env.BANYAN_DEMO_CREDENTIALS_FILE ??
  fileURLToPath(new URL("../.banyan-demo-credentials.json", import.meta.url));
let credentials;
let isNew = false;
try {
  credentials = JSON.parse(await readFile(credentialPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  isNew = true;
  credentials = {
    username: "darwin_demo",
    password: randomBytes(24).toString("base64url"),
    displayName: "Banyan Historical Demo",
    origin: base,
  };
  await writeFile(credentialPath, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600 });
}
if (credentials.origin !== base) throw new Error("Demo credentials belong to another origin.");
await chmod(credentialPath, 0o600);
let cookie = "";
async function api(method, path, body) {
  // curl avoids the local runtime's Python/Node user agent being blocked by the
  // deployment's Cloudflare browser rules. Credentials go over stdin, not argv.
  const args = [
    "--silent",
    "--show-error",
    "--fail-with-body",
    "--dump-header",
    "-",
    "--request",
    method,
    "--header",
    "Content-Type: application/json",
    "--header",
    `Origin: ${base}`,
  ];
  if (cookie) args.push("--header", `Cookie: ${cookie}`);
  if (body !== undefined) args.push("--data-binary", "@-");
  args.push(base + path);
  let text;
  try {
    text = execFileSync("curl", args, {
      input: body === undefined ? undefined : JSON.stringify(body),
      encoding: "utf8",
    });
  } catch (e) {
    throw new Error(`${method} ${path} failed: ${e.stdout?.toString().slice(-400)}`);
  }
  const parts = text.split(/\r?\n\r?\n/),
    head = parts.shift(),
    data = JSON.parse(parts.join("\n\n") || "{}");
  const session = head.match(/set-cookie: (banyan_session=[a-f0-9]+)/i)?.[1];
  if (session) cookie = session;
  return data;
}
if (isNew) {
  await api("POST", "/api/auth/password/register", credentials);
} else {
  await api("POST", "/api/auth/password/login", {
    username: credentials.username,
    password: credentials.password,
  });
}

const dataset = JSON.parse(
  await readFile(new URL("./demo/darwin-family.json", import.meta.url), "utf8"),
);
const families = await api("GET", "/api/v1/families");
let family = families.families?.find((f) => (f.family ?? f).name === dataset.name);
family = family?.family ?? family;
if (!family)
  family = (
    await api("POST", "/api/v1/families", { name: dataset.name, description: dataset.description })
  ).family;
const existing = await api("GET", `/api/v1/families/${family.id}/tree`);
const ids = new Map((existing.people ?? []).map((p) => [p.name, p.id]));
for (const { key, source, ...person } of dataset.people) {
  let id = ids.get(person.name);
  if (!id) {
    const result = await api("POST", `/api/v1/families/${family.id}/people`, {
      ...person,
      biography: `${person.biography}\n\nSource: ${dataset.sources[source]}`,
    });
    id = result.person.id;
    ids.set(person.name, id);
  }
  ids.set(key, id);
}
const edgeSet = new Set(
  (existing.edges ?? []).map((e) => `${e.parentPersonId}:${e.childPersonId}`),
);
for (const [parent, child] of dataset.edges) {
  const parentPersonId = ids.get(parent),
    childPersonId = ids.get(child);
  if (!edgeSet.has(`${parentPersonId}:${childPersonId}`))
    await api("POST", `/api/v1/families/${family.id}/relationships/parent-child`, {
      parentPersonId,
      childPersonId,
    });
}
if (!credentials.familyId) {
  await api("POST", `/api/v1/families/${family.id}/posts`, {
    body: "Welcome to a family of ideas. Explore five generations of the Darwin–Wedgwood family, from Erasmus Darwin and the potter Josiah Wedgwood to Charles and Emma's children and grandson Bernard. This is a selected historical demo; dates and relationships are included only where sourced. Profiles are historical people, separate from this demo account.",
  });
}
const tree = await api("GET", `/api/v1/families/${family.id}/tree`);
if (tree.people.length !== dataset.people.length || tree.edges.length !== dataset.edges.length)
  throw new Error("Demo tree counts do not match the dataset.");
credentials.familyId = family.id;
credentials.treeUrl = `${base}/app/families/${family.id}/tree`;
await writeFile(credentialPath, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600 });
console.log(
  JSON.stringify({
    username: credentials.username,
    treeUrl: credentials.treeUrl,
    people: tree.people.length,
    relationships: tree.edges.length,
    credentialsFile: credentialPath,
  }),
);
