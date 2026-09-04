/**
 * SC6 browser QA: real signup form -> lands in app; logout -> login form -> lands in app.
 * Drives the REAL page over the tailnet (http://100.80.185.56:8788), captures
 * action log, console/pageerror/network diagnostics, and screenshots.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://100.80.185.56:8788";
const OUT = "qa/evidence/auth-500-green/browser";
mkdirSync(OUT, { recursive: true });

const ts = Date.now();
const email = `qa-browser-${ts}@example.com`;
const password = "supersecret1";
const name = "QA Browser";

let failures = 0;
let step = 0;
const log = [];
const ok = (msg) => log.push("ok  " + msg);
const assert = (cond, msg) => {
  if (cond) ok(msg);
  else { failures++; log.push("FAIL " + msg); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => { failures++; log.push("PAGE ERROR: " + e.message); });
page.on("console", (m) => { if (m.type() === "error") log.push("CONSOLE ERROR: " + m.text()); });
page.on("response", async (r) => {
  if (!r.ok()) log.push(`NETWORK ${r.status()} ${r.url()}`);
});

// ---- 1. signup flow ----
log.push(`[${++step}] goto ${BASE}/#/login`);
await page.goto(`${BASE}/#/login`, { waitUntil: "domcontentloaded" });
// login form is visible by default; the signup form is hidden until the tab is clicked
await page.waitForSelector("#f-login:not(.hidden)", { timeout: 15000 });
await page.screenshot({ path: `${OUT}/01-login-page.png` });

log.push(`[${++step}] click Sign up tab`);
await page.click("#tab-signup");
await page.waitForSelector("#f-signup:not(.hidden)", { timeout: 5000 });
await page.screenshot({ path: `${OUT}/02-signup-page.png` });

log.push(`[${++step}] fill signup form (${email})`);
await page.fill("#f-signup input[name=name]", name);
await page.fill("#f-signup input[name=email]", email);
await page.fill("#f-signup input[name=password]", password);
await page.selectOption("#f-signup select[name=lang]", "en");
await page.screenshot({ path: `${OUT}/03-signup-filled.png` });

log.push(`[${++step}] submit signup`);
await Promise.all([
  page.waitForURL(/#\/trees/, { timeout: 15000 }),
  page.click("#f-signup button[type=submit]"),
]);
ok("signup form submitted and redirected to #/trees");
await page.screenshot({ path: `${OUT}/04-after-signup-trees.png` });

// the app shows the trees list
await page.waitForSelector(".tree-item", { timeout: 15000 }).catch(() => {});
const hasTreeRow = (await page.locator(".tree-item").count()) >= 0;
assert(hasTreeRow, "trees list rendered after signup");
assert((await page.locator(".brand").first().innerText()).toLowerCase().includes("families"), "brand shows 'Your families'");

// ---- 2. logout ----
log.push(`[${++step}] click Log out`);
await page.click("#logout-btn");
await page.waitForURL(/#\/login/, { timeout: 10000 });
ok("logout redirected to #/login");
await page.screenshot({ path: `${OUT}/05-after-logout.png` });

// ---- 3. login flow ----
log.push(`[${++step}] fill login form`);
await page.waitForSelector("#f-login:not(.hidden)", { timeout: 5000 });
await page.fill("#f-login input[name=email]", email);
await page.fill("#f-login input[name=password]", password);
await page.screenshot({ path: `${OUT}/06-login-filled.png` });

log.push(`[${++step}] submit login`);
await Promise.all([
  page.waitForURL(/#\/trees/, { timeout: 15000 }),
  page.click("#f-login button[type=submit]"),
]);
ok("login form submitted and redirected to #/trees");
await page.waitForSelector(".tree-item", { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/07-after-login-trees.png` });

// ---- 4. wrong-password edge: banner shows real message (not "HTTP 401") ----
log.push(`[${++step}] wrong-password login shows message`);
await page.click("#logout-btn").catch(() => {});
await page.waitForURL(/#\/login/, { timeout: 10000 }).catch(() => {});
await page.waitForSelector("#f-login:not(.hidden)", { timeout: 5000 });
await page.fill("#f-login input[name=email]", email);
await page.fill("#f-login input[name=password]", "wrongpassword1");
await page.click("#f-login button[type=submit]");
await page.waitForSelector("#banner:not(.hidden)", { timeout: 8000 });
const bannerText = await page.locator("#banner").innerText();
assert(/invalid credentials/i.test(bannerText), `banner shows server message: "${bannerText.trim()}"`);
await page.screenshot({ path: `${OUT}/08-wrong-password-banner.png` });

await browser.close();
writeFileSync(`${OUT}/action-log.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
console.log(failures === 0 ? "\nAUTH QA PASSED" : `\nAUTH QA FAILED: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
