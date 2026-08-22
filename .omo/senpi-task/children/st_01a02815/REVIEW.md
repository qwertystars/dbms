# Momus adversarial review — family-social-dbms (st_01a02815)

Date: 2026-08-22 · Reviewer: momus gate (HEAVY plan, review triggered per notepad)
Inputs: .omo/plans/family-social-dbms.md, full src/, migrations/, test/, qa/, web/,
live transcripts + screenshots, vitest run (78/78 PASS), tsc --noEmit (clean).

## Verdict: APPROVE-WITH-CONDITIONS

Engineering quality is high and all verification evidence is genuine. Three
plan-contract API items are missing and one substitution changes the security
posture; fix or ratify before calling the DAG closed.

## Success criteria audit

| SC | Claim | Evidence checked | Verdict |
|----|-------|------------------|---------|
| SC1 generations CTE matches lineage | live-qa.sh asserts 3 bands, exact partner names per band, G2 dual couples | qa/transcripts/10-generations.{txt,json} consistent with script output; api.test.ts re-proves at unit speed | PASS |
| SC2 fa_br_yo = uncle/chacha/chittappa/kaka | unit (kinship.test.ts CRITICAL) + live curl 11-kinship-fa-br-yo.txt | both assert all four languages + gloss | PASS |
| SC3 RBAC viewer403/editor200/nonmember403/creatorDELETE200 | transcripts 20/21/22/23 + hard `fail` greps in live-qa.sh | holds as tested, but see D1: "nonmember" is self-joinable | PASS with caveat |
| SC4 UI flow login→board→small box→modal+badge | ui-qa.mjs DOM assertions + API cross-check of badge term; 5 PNGs inspected | 05-big-modal.png authentic, data consistent with seed env | PASS |
| SC5 schema integrity + mutation proof | schema.test.ts: role CHECK, gender CHECK, FK orphan, kin_term PK, recursive band CTE on real migrations | verified | PASS |
| SC6 B2 SigV4 shape tests; live INCONCLUSIVE w/o creds (per plan) | b2.test.ts: URL/method, SignedHeaders list, deterministic dates, payload-hash sensitivity, sig format; live 503 b2_not_configured transcript | exactly the planned fallback | PASS |

## What is genuinely solid

- Schema matches the authoritative contract table-for-table, index-for-index.
- Kinship engine: identity-chain BFS (correct fix for ambiguous tokens),
  max-precision keys with per-language collapse; nephew/niece modeled as
  brother_son/brother_daughter/sister_son/sister_daughter (en→nephew/niece) —
  satisfies "en collapses" clause; elder/younger dob→birth_order→default-_yo is
  implemented AND documented in three places.
- Auth: PBKDF2-SHA256 100k (`pbkdf2$iter$salt$hash`), HMAC-SHA256 {uid,exp}
  token, constant-time compares, HttpOnly SameSite=Lax cookie. Contract-exact.
- SigV4 canonical request and key chain are correct; signed-header list sorted.
- Evidence authenticity: live-qa.sh/ui-qa.mjs fail hard on every assertion;
  transcripts and screenshots cross-check against each other.

## Contract deviations (plan vs code)

- **D1 (material).** Plan: `POST /api/trees/:id/access {email,role}` creator-only.
  Code: `POST /api/trees/:id/members` **self-join** — any authenticated user who
  learns a tree_id can grant themselves **editor**. Creator-invite-by-email does
  not exist anywhere (API or UI). Tree privacy reduces to UUID secrecy; the SC3
  nonmember-403 only holds for users who haven't exercised /members. Either
  implement creator-only grants or amend the plan to ratify open self-join.
- **D2.** `POST /api/logout 204` absent (no route, no UI button). Sessions die
  by 30-day expiry only.
- **D3.** Person DELETE absent entirely (plan: under /api/trees/:id/persons).
- **D4 (cosmetic).** Route drift: `/api/couples/:cid/children` vs planned
  `/api/trees/:id/couples/:cid/children`; PUT persons at `/api/persons/:pid`.
  RBAC still enforced via tree lookup — acceptable.
- **D5 (cosmetic).** Error envelope `{message}` vs contract `{error}`; the photo
  endpoint itself uses `{error}` — inconsistent between endpoints.
- **D6 (cosmetic).** Auth responses wrap in `{user:...}` vs flat contract;
  frontend adapted deliberately (commit 22c09ec).

## Latent defects

- **L1.** app.ts claims "UNION guarantees termination on accidental cycles" —
  false. A couple cycle (A founded by child of B, B founded by child of A) yields
  level-increasing rows; UNION never fixpoints; the generations query spins to
  the D1 timeout from then on. No API guard prevents inserting such data.
  Fix: cap recursion (`WHERE lvl < 64`) or reject back-edge couples.
- **L2.** Tree delete fails with FK error if any users.person_id references a
  person in that tree (batch is atomic → whole delete 500s, unrecoverable via
  API since person DELETE doesn't exist either). Clear/null users.person_id in
  the cascade first.
- **L3.** test/probe.test.ts is a committed debugging leftover ("TEMPORARY",
  asserts nothing, console.log noise). Delete it.
- **L4 (nit).** kin_term seed drifts from TS mirror in two cells (en grandson
  gloss, hi cousin term/gloss) despite "verbatim mirror" header. Reporting-only;
  harmless.

## Recommended conditions to close

1. Decide D1 explicitly: implement creator-only `/access` (small: email→user
   lookup + role insert behind requireAccess creator), or amend plan + document
   self-join as intended. Do not ship silently.
2. Add logout route (clear cookie, 204) + header button.
3. Add recursion cap to generations CTE (one line).
4. Null users.person_id in tree-delete cascade (or reject when linked).
5. Delete probe.test.ts.

Items 1–2 are product decisions; 3–5 are mechanical. Everything else stands as
verified.
