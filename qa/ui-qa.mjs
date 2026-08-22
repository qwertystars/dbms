/**
 * SC4 UI verification: login -> tree renders couples -> click couple ->
 * small box (father/mother/other info) -> click mother name -> big modal
 * with all person fields incl. kinship badge. Screenshots + DOM assertions.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("qa/ui-seed.env", "utf8")
    .trim()
    .split("\n")
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const BASE = "http://127.0.0.1:8790";
const OUT = "qa/ui";
mkdirSync(OUT, { recursive: true });

let failures = 0;
const ok = (msg) => console.log("ok  " + msg);
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error("FAIL " + msg);
  } else ok(msg);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => {
  failures++;
  console.error("PAGE ERROR: " + e.message);
});

// ---- 1. login flow ----
await page.goto(BASE + "/#/login");
await page.waitForSelector("#f-login", { timeout: 15000 });
await page.screenshot({ path: `${OUT}/01-login.png` });
await page.fill("#f-login input[name=email]", "lakshmi-view@qa.local");
await page.fill("#f-login input[name=password]", "viewer-pass-1");
await page.click("#f-login button[type=submit]");
await page.waitForURL(/#\/trees/, { timeout: 15000 });
ok("login redirected to #/trees");

// ---- 2. trees list shows the family; open it ----
await page.waitForSelector(".tree-item", { timeout: 15000 });
assert(
  (await page.locator(".tree-item", { hasText: "Narayanan Family" }).count()) === 1,
  "tree list shows 'Narayanan Family' card",
);
await page.screenshot({ path: `${OUT}/02-trees.png` });
await page.click(".tree-item");

// ---- 3. board renders generation bands with couples ----
await page.waitForSelector("#board .band", { timeout: 15000 });
const bands = await page.locator("#board .band").count();
assert(bands === 3, `board shows 3 generation bands (got ${bands})`);
const cards = await page.locator(".couple-card").count();
assert(cards === 4, `board shows 4 couple cards (got ${cards})`);
const g1Text = await page.locator('.band[data-gen="1"]').innerText();
assert(g1Text.includes("Annadurai") && g1Text.includes("Lakshmi"), "G1 band names Annadurai + Lakshmi");
await page.screenshot({ path: `${OUT}/03-tree-board.png`, fullPage: true });

// ---- 4. click G1 couple -> small box with father/mother/other info ----
await page.click('.band[data-gen="1"] .couple-card');
await page.waitForSelector("#smallbox", { timeout: 10000 });
const sb = (await page.locator("#smallbox").innerText()).toUpperCase();
assert(sb.includes("FATHER NAME") && sb.includes("ANNADURAI"), "small box Father name = Annadurai");
assert(sb.includes("MOTHER NAME") && sb.includes("LAKSHMI"), "small box Mother name = Lakshmi");
assert(sb.includes("OTHER INFORMATION") && sb.toUpperCase().includes("ARRANGED MARRIAGE, 1952"), "small box other info shown");
await page.screenshot({ path: `${OUT}/04-smallbox.png` });

// ---- 5. click mother name -> big modal with ALL fields + kinship badge ----
await page.click('#smallbox .person-link[data-pid="' + env.LAKSHMI + '"]');
await page.waitForSelector(".modal", { timeout: 15000 });
// .modal appears with "Loading person…" first; wait until real fields arrive
await page.waitForSelector(".modal .fields", { timeout: 15000 });
const modalText = (await page.locator(".modal").innerText()).replace(/\s+/g, " ");
for (const [label, value] of [
  ["Name", "Lakshmi"],
  ["Gender", "f"],
  ["Date of birth", "1935-08-02"],
  ["Address", "1 Temple St, Mayiladuthurai"],
  ["Job", "Homemaker"],
  ["Other information", "Loved gardening"],
]) {
  const re = new RegExp(`${label.toUpperCase()}\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  assert(re.test(modalText), `modal field ${label} = ${value}`);
}
const badge = await page.locator(".kinship-badge").innerText().catch(() => "");
assert(badge.trim().length > 0, `kinship badge rendered ("${badge.trim()}")`);
// cross-check the expected Tamil term via the API itself
// curl netscape jar: fields are TAB-separated; session value is column 7
const jarLine = readFileSync("qa/jars/ui-view.txt", "utf8")
  .split("\n")
  .map((l) => l.split("\t"))
  .find((cols) => cols.length >= 7 && cols[5] === "session");
const kinRes = await fetch(
  `${BASE}/api/kinship?tree=${env.TREE}&from=${env.ARJUN}&to=${env.LAKSHMI}`,
  { headers: { cookie: `session=${jarLine[6]}` } },
);
const kin = await kinRes.json();
if (badge.trim()) {
  assert(
    badge.trim() === kin.terms.ta.term,
    `badge matches API ta term (${badge.trim()} === ${kin.terms.ta.term} for ${kin.relation_key})`,
  );
}
const gloss = await page.locator(".kinship-gloss").innerText().catch(() => "");
assert(gloss.trim().length > 0, "kinship gloss rendered");
await page.screenshot({ path: `${OUT}/05-big-modal.png` });

await browser.close();
console.log(failures === 0 ? "\nUI QA PASSED" : `\nUI QA FAILED: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
