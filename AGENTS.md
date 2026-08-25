# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-25
**Commit:** 362db7f
**Branch:** main

## OVERVIEW
Family-tree web app ("dbms-family"): Cloudflare Worker (Hono) + D1 SQLite + Backblaze B2 photo storage, vanilla-JS frontend. Kinship-term engine supports en/hi/ta/bn.

## STRUCTURE
```
./
├── src/index.ts      # entry: re-exports server app (wrangler main)
├── src/server/       # Hono routes + auth (has own AGENTS.md)
├── src/kinship/      # pure domain module, no I/O (has own AGENTS.md)
├── src/storage/b2.ts # B2 S3-compatible SigV4 upload adapter; fetch injectable via setB2Fetch
├── migrations/       # 0001 schema, 0002 seed (incl. kinship term rows)
├── test/             # vitest suites + d1.ts local-D1 helper (better-sqlite3)
├── web/              # static assets served via ASSETS binding (app.js is the SPA)
└── qa/               # live-QA scripts, transcripts, evidence index (EVIDENCE.md)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add/modify API endpoint | src/server/app.ts | see its AGENTS.md |
| Kinship relation logic | src/kinship/classify.ts | |
| Schema changes | migrations/ | new numbered file; update test/schema.test.ts |
| Photo upload | src/storage/b2.ts | 503 `b2_not_configured` when B2_* vars missing |
| UI behavior | web/app.js | plain DOM, no framework |
| QA reproduction | qa/EVIDENCE.md | SC1-SC6 map with exact commands |

## CONVENTIONS
- TypeScript strict + `noUncheckedIndexedAccess`; typecheck covers only `src` (tests/web are outside it).
- Config is wrangler.jsonc (not .toml); dev port is 8788.
- Tests use better-sqlite3 as a D1 shim (test/d1.ts), not vitest-pool-workers/miniflare; deterministic (fixed clock for B2 signing, fresh DB per suite).
- README.md is intentionally empty; qa/EVIDENCE.md is the real documentation index.
- All state in D1; sessions are signed cookies only (no KV/session table).
- Crypto strictly WebCrypto so code runs identically on Workers and Node.
- Error responses always JSON `{message}` via the shared `bad()` helper - never bare status codes.
- Tests hit the real Hono app against a local D1 (better-sqlite3 driver in test/d1.ts); no HTTP-layer mocks.

## ANTI-PATTERNS (THIS PROJECT)
- No Node built-in modules in src/ - breaks Workers runtime parity.
- Don't weaken role checks: role grants are creator-only (`POST /api/trees/:id/access`).
- Don't add per-route field lists for persons; use `PERSON_FIELDS`.
- Recursive CTE depth cap of 20 must stay.

## UNIQUE STYLES
- Relation keys are path strings like `fa_br_yo`; kinship terms are data (TERMS tables), not code branches.
- wrangler.jsonc uses a placeholder database_id until first remote `wrangler d1 create`.

## COMMANDS
```bash
pnpm dev                          # wrangler dev on :8788
pnpm exec vitest run              # 78 tests (schema/b2/kinship/api)
pnpm typecheck                    # tsc --noEmit
pnpm db:migrate                   # apply D1 migrations locally
bash qa/live-qa.sh                # live happy-path + RBAC matrix (needs dev server)
node qa/ui-qa.mjs                 # Playwright UI flow (:8790 instance)
```

## NOTES
- Untyped seams are deliberate but contained: `c: any` helpers in app.ts, `as never` casts at D1 boundaries - don't spread the pattern.
- Dev fallback secret `DEV_SESSION_SECRET` exists in auth.ts; set SESSION_SECRET outside tests/dev.
- B2 live upload was never verified end-to-end (credentials unavailable) - unit-tested request shape only (qa/SC6-verdict.md).
