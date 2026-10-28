# Current State

## Project status

**Implementation complete (v1.0), plus post-v1.0 hardening and an engagement slice.**

All planned backend services, web UI, database migrations, CI, and hardening are in place and verified. Recent work closed the D1 transaction gap, added a production guard for the development sign-in, made family writes D1-compatible, expanded auditing, and upgraded the feed with reactions, comments, and birthday/remembrance reminders.

The frontend is a Vite + React single-page application and the backend is a standalone Hono server. The application is configured for Cloudflare Workers with D1 as the production database and R2 as the configured object-storage binding: `src/worker.ts` serves the Hono API for `/api/*` while the built SPA in `dist/` is served from the static assets binding with SPA fallback.

## Evidence currently available

- user description: social media app for families
- handwritten product sketch
- this specification set
- repository with TypeScript, Vite, React, Hono, Drizzle ORM, SQLite/D1, and working integration tests
- live smoke run through `wrangler dev` against local D1: account, family, person, post, reaction, comment, event, and delete requests all succeeded

## Implemented capabilities

- Repository scaffold with TypeScript, Vite + React SPA, Hono server, pnpm, Prettier, ESLint, Vitest, GitHub Actions CI.
- SQLite/D1 database with Drizzle ORM schema and generated migrations covering accounts, families, memberships, invitations, people, parent-child relationships, posts, comments, reactions, media, friends, friend requests, and audit events.
- All service-layer writes run through `db.batch(...)` instead of interactive transactions. Batches are atomic on D1 and transactional on the local libsql client, so local development and production share one code path.
- Foreign-key enforcement is enabled on the local libsql client (`PRAGMA foreign_keys = ON`) to match D1, which enforces foreign keys on every query.
- Environment validation with `dotenv`, including empty-string-to-undefined handling for optional values.
- Hono-based REST API under `/api/v1` with request context, structured logging, security headers, and rate limiting.
- Development-only cookie sign-in mounted only when `AUTH_DEV_MODE=true` (`pnpm dev:api` sets it). The route is absent otherwise, so production Workers builds cannot mint trusted tokens.
- Cookie and Bearer token authentication for both browser UI and API clients.
- Family CRUD, member role management (CREATOR/EDITOR/VIEWER), invitations, ownership transfer, and soft delete.
- Person profile CRUD with validation, life dates, contact/occupation/biography fields, and profile photo references. Person deletion soft-deletes the row and detaches parent-child edges and membership links in one atomic batch.
- Family tree graph with explicit parent-child edges, cycle detection, self-edge rejection, and tree projection.
- Family social feed: posts, comments, reactions (LIKE/LOVE/LAUGH/SAD), soft-delete, and cursor pagination. `GET /families/:id/posts` includes each post's author display name, reaction counts by type, comment count, and the requesting account's reaction, and supports `limit` (1-50). Cursors combine timestamp and id so posts created in the same second are not skipped.
- Upcoming events: `GET /events/upcoming?days=45` returns birthdays and memorial anniversaries across every family the account belongs to, computed from existing `people.date_of_birth` / `people.date_of_death` values.
- Audit events for family create/update/delete, membership role changes and removals, invitation creation and acceptance, ownership transfer, person create/update/delete, relationship add/remove, post delete, comment delete, and family export.
- Friend requests, accept/reject/cancel, friendships, and unfriending. Concurrent single-use operations (invitation acceptance, friend acceptance, ownership transfer) are guarded by conditional SQL inside the batch so a lost race cannot create a membership without claiming the invitation.
- Media uploads to R2: `POST /media/upload-intents` (family membership checked; profile photos need Creator or Editor), `PUT /media/:id/content` (owner only; magic-byte type check; EXIF/XMP/text metadata stripped; stored in the `MEDIA_BUCKET` R2 binding, or an in-memory store on the Node server and in tests), `GET /media/:id/content` (family members only, `404` otherwise, private caching, ETag), and an idempotent `POST /media/:id/complete`.
- Profile photos in the UI: Creators and Editors can add, change and remove a person's photo on the person page. The browser redraws the photo through a canvas first (applies EXIF rotation, drops metadata, caps the long edge at 1600 px, JPEG). Photos show in person, family and tree lists, and people with a death date get a pencil ring around their avatar.
- JSON and CSV family export with audit logging.
- Web UI (Vite + React SPA under `src/client/`, React Router): `/sign-in`, `/app` dashboard, family list, family detail, person detail, tree view, feed view, friends, and invitation acceptance. All data flows through the Hono API using the `banyan_session` cookie (or `auth_token` for development).
- Feed UI: post composer, four emoji reactions with live counts, expandable comment threads with author names, edit/delete for own posts, and Creator moderation of posts and comments.
- Person profile UI: edit form (name, gender, life dates, occupation, contact details, height, weight, biography) for Creators and Editors, and Creator-only delete with confirmation. Deletion is a soft delete that also detaches family-tree links.
- Member management UI: Creators can change member roles between Editor and Viewer and remove members.
- Dashboard: family cards plus a "Coming up" card showing birthdays and remembrances in the next 60 days with relative dates.
- Hardening: request logging, 100 req/minute per-account/IP rate limiting (the Workers `RATE_LIMITER` binding on Cloudflare, shared across isolates; an in-memory fallback on Node), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` headers.
- Cloudflare bundle configured (Google credentials and rollout pending):
  - `vite build` produces the SPA in `dist/`; `wrangler deploy` bundles `src/worker.ts` directly (the `~/*` tsconfig alias is resolved by Wrangler's bundler)
  - D1 database binding (`DB`)
  - R2 media bucket binding (`MEDIA_BUCKET`)
  - `wrangler.jsonc` for the `banyan` Worker with real resource IDs, `run_worker_first: ["/api/*"]`, `not_found_handling: "single-page-application"`, `preview_urls: false`, and the `RATE_LIMITER` binding. There is no staging environment.
  - `pnpm preview:cloudflare` builds the SPA and runs the real Workers runtime (`wrangler dev`) with local D1/R2 bindings and the development sign-in enabled (`AUTH_DEV_MODE=true`)
  - `.dev.vars.example` documents optional local Worker variables; `.dev.vars` is gitignored
  - `wrangler types` generated worker types

## Specification status

`docs/product/banyan-spec.md` (Banyan brand kit and implementation spec, v0.1, 2026-09-23) was added as a newer product input. Apart from the branding slice above, none of it is implemented. It differs from the current implementation in storage (Postgres versus D1), web stack (Next.js, Tailwind, shadcn versus Vite and plain CSS), data model (unions and child links, placeholders, fuzzy dates, field visibility versus direct parent-child edges) and the permission matrix (for example, editors may invite viewers and only creators export JSON). These conflicts are not resolved yet; the older normative docs still describe the implemented behaviour.

## Partially implemented capabilities

- Post attachments and account avatars can be uploaded through the API, but the UI only uploads person profile photos.

Deferred features (DMs, public feed, typed marriage/union history, per-field privacy,
PDF export, external import, AI) remain out of scope. Simple symmetric partner
links are implemented in this branch.

## Database

- SQLite/D1 schema defined in `src/db/schema.ts`.
- Migrations in `db/migrations/` generated for SQLite.
- Local development and tests use `@libsql/client` with `file:` or `:memory:` URLs and foreign keys enabled.
- Cloudflare Workers runtime uses the `DB` D1 binding.
- Partial unique indexes and CHECK constraints enforced in migration SQL.
- Multi-statement writes are expressed as `db.batch([...])`; there are no `db.transaction(...)` call sites left in `src/`.

## API

- `src/routes/v1.ts` exposes the v1 REST routes.
- Hono app mounted under `/api/v1` in `src/lib/hono.ts`.
- `src/server/app.ts` composes the root server: mounts the v1 API and hosts `/api/auth/logout`, plus `/api/auth/login` only when `AUTH_DEV_MODE=true`.
- `src/server/index.ts` is the Node entry (`@hono/node-server`): serves the API, serves `dist/` statics, and falls back to `index.html` for client-side routes.
- `src/worker.ts` is the Cloudflare Workers entry: `/api/*` → Hono; other paths → `env.ASSETS`.
- Request-scoped D1 client via `c.env.DB` in Cloudflare and `DATABASE_URL` (libsql) fallback locally.

## Frontend

- Vite + React SPA under `src/client/` with React Router: sign-in, dashboard, family list/detail, tree, feed, person, friends, invitation acceptance.
- `src/client/api.ts` is a small `fetch` wrapper; authentication rides on the same-origin `banyan_session` cookie (or `auth_token` for development).
- `src/client/auth.tsx` provides an `AuthProvider` (`/api/v1/me`) and a `RequireAuth` guard that redirects to `/sign-in?returnTo=…`.
- Vite dev server proxies `/api` to the Hono server on `localhost:3000`.
- Visual design ("Living Archive", `docs/design/design-system.md`, October 2026): green-on-ivory light theme (`notebook`) and deep green dark theme (`slate`), OS default plus a stored user choice (`src/client/theme.tsx`); Inter, Newsreader and Noto Sans Indic fonts from Google Fonts; 44px default controls; a responsive app shell (desktop sidebar, tablet icon rail, mobile top bar plus bottom navigation); segmented family tabs; deterministic neutral initials avatars and a muted memorial ring; a dot-grid tree canvas with generation pills, curved connectors and 72px person nodes; a landing page with a decorative family-map illustration. The Banyan mark, wordmark, favicon and app icon from `public/brand/` are kept. This supersedes the colour and type sections of `docs/product/banyan-spec.md` §3 (Anek, Kavivanar, ink/red-pen/highlighter palette, no all-caps labels).
- Styling is a single dependency-free stylesheet, `src/client/styles.css`, with semantic tokens and plain component classes; there is no CSS framework. This branch delivers the interactive map, inspector, claims, Memories, directory and events described below. Text-size setting UI (the `--bn-text-scale` hook exists) and Playwright/axe in CI remain outstanding.
- Shared UI building blocks live in `src/client/components/ui.tsx` (`Loading`, `Alert`, `EmptyState`, `ErrorState`, `PageHeader`, `Card`, `Field`, `RoleBadge`, `Avatar`, `CopyField`, `useBusy`, `timeAgo`, `relativeDay`, `shortDate`, `formatDate`, `lifeSpan`, inline icons). `components/PostCard.tsx` owns the memory post card (reactions, comments, edit/delete). `FamilyHeader` (`components/FamilyNav.tsx`) renders the family name, role badge, and Overview/Tree/Memories/People/Events tabs. `components/families.tsx` holds `FamilyCard` and `CreateFamilyForm`.
- Every page has loading, empty, and error states, and submit buttons show a pending state.
- Member lists and feed posts show account display names. The friends page shows display names, lets you remove friends and cancel sent requests, and shows your own account ID with a copy button, because friend requests are still sent by account ID.
- Role-aware UI follows the permission matrix: every member (including Viewers) can post and export; Creators and Editors can add people and relationships; only Creators can invite.
- `src/client/api.ts` turns network failures into an error result (`status: 0`) so pages show a message instead of loading forever.
- The tree page delivers pan/zoom, focused one-hop expansion with `+N`, distinct partner connectors, desktop/mobile person inspectors, a generations fallback, and a Creator/Editor partner form. Layout remains presentation-only. Person pages load relationship context with `GET /tree?rootPersonId=…&depth=1`.
- `GET /families/:id/tree` returns every live person when no root is given (including people with no relationships), validates `direction`, and honours `depth`.
- Layout is responsive and verified at 390px and 360px widths with no horizontal scrolling.

## Authentication

- `src/lib/auth.ts` verifies RS256 JWTs against a remote JWKS (`jose` `createRemoteJWKSet`: cached for 10 minutes and refetched on an unknown `kid`, so key rotation needs no restart) or an inline `AUTH_JWKS`.
- `src/lib/dev-auth.ts` generates a dev RSA key pair and signs tokens. Both the login route and `signDevToken` refuse to run unless `AUTH_DEV_MODE=true`.
- `src/lib/hono.ts` resolves the opaque `banyan_session` cookie against D1. Generic OIDC and development modes also accept Bearer JWTs or the `auth_token` cookie.

## Infrastructure and deployment

- The Worker bundle does not depend on Node-only modules beyond the `nodejs_compat` polyfill: token hashing uses Web Crypto (`crypto.subtle`/`getRandomValues`), and `dotenv` is imported only by the Node entry (`src/server/index.ts`). `node:async_hooks` is provided by `nodejs_compat`.
- `.env.example` documents `DATABASE_URL`, `APP_BASE_URL`, `PORT`, and auth settings including `AUTH_PROVIDER` and `AUTH_DEV_MODE`. The unused S3 `OBJECT_STORAGE_*` settings were removed.
- `.github/workflows/ci.yml` runs format, lint, type-check, migration generation, migration drift check, migration application to a local SQLite file, `vite build` + `wrangler deploy --dry-run`, and tests.

## Tests

- `tests/setup.ts`, `tests/helpers.ts`, `tests/family.test.ts`, `tests/authorization.test.ts`, `tests/hardening.test.ts`, `tests/engagement.test.ts`, `tests/production.test.ts`.
- 94 tests across 10 files, including Google OAuth callback/session security,
  graph-feature authorization and transactional regressions, and map layout tests.
- Covers family lifecycle, invitations, role authorization, cross-family isolation, tree cycles/self-edges, expired/duplicate invitations, and friendship-without-family-access.
- Also covers Viewer posting/export, whole-family and depth-limited tree projections, tree query validation, friend requests to unknown accounts, friend display names, and mutual friend requests.
- New hardening coverage: development sign-in is absent and cannot mint tokens when disabled, a single-use invitation accepts exactly one account (including two concurrent acceptances), person deletion soft-deletes and detaches relationships, ownership transfer swaps roles, exports are audited, and sensitive mutations write audit events.
- New engagement coverage: feed author names, reaction counts, comment counts and current-account reaction; reaction toggling; same-second cursor pagination; upcoming birthdays and memorials.

## Current compatibility obligations

- Cloudflare Workers `nodejs_compat` compatibility flag is enabled.
- D1 migrations must be applied with `wrangler d1 migrations apply` before deployment.

## Current technical debt

- Cloudflare's rate limit binding is per location and eventually consistent, so limits are approximate. The Node server's fallback limiter is still per process.
- The Node server keeps uploaded media in memory, so local photos disappear on restart. `pnpm preview:cloudflare` uses a persistent local R2.
- Replaced or removed profile photos stay in R2; nothing deletes orphaned media yet.
- Images are not re-encoded on the server (Workers has no codec), so thumbnails and AVIF/WebP variants (spec §6.9) do not exist.
- No e2e browser tests yet.
- Do not put `NODE_ENV` in `.env`: Vite reads it and `vite build` then bundles development React (about 514 kB instead of 254 kB). `.env.example` documents this.
- Dependencies (Hono 4.4.6, drizzle-orm 0.30.9, drizzle-kit 0.21.4, Vite 5) are behind current stable releases; upgrade with the test suite as a guard.

## Next required implementation step

Google OAuth is deployed to production via Cloudflare Git integration. Optional follow-ups:

- Add controls for existing API features not yet in the UI: removing relationships, ownership transfer, and family editing/deletion.
- Add e2e tests (Playwright/Cypress).
- Clean up orphaned media and add post-attachment uploads to the feed UI.
- Add coverage thresholds to CI (migration drift is already checked).

After any implementation work, update this file with factual status.

## Family graph and engagement branch (October 23, 2026)

Delivered in this branch:

- Partner create/delete API for Creator/Editor with distinct live same-family
  people, canonical unordered pairs, duplicate/self rejection and add/remove
  audits. Tree responses contain `people`, ancestry `edges` and separate
  `partners`; rooted projections add only the root's direct partners, without
  traversing ancestry through partners.
- Claims request/list/Creator approval or rejection/requester cancel/self-unlink.
  Creator lists pending family requests; other members list their own history.
  Approval alone assigns membership `personId`, including for Creator
  self-claims; it never changes role or tree edges. Request/decision/unlink audits
  are present. Rival requests may coexist until approval-time conflict checks.
- User-created family events, distinct from derived birthdays/remembrances.
  Any active member can create/list/RSVP; only the author edits, and author or
  Creator deletes. RSVP supports Going/Maybe/Not going, replacement, clearing,
  counts and the caller's response. Deletion is soft and audited.
- Memory tagging with optional `personIds` (max 20 submitted IDs, deduplicated,
  live same-family targets), `taggedPeople` in responses, and a `personId` posts
  filter. Only authors edit memories; Creator moderation is deletion-only.
- Migration `0003_safe_deathstrike.sql`: partner relationships, claim requests,
  family events, RSVPs and post/person tags. Person deletion detaches both
  relationship types and tags, clears membership links and cancels pending claims.
- People directory with local case-insensitive name search, alphabetical results,
  grid/list layouts, and All/Linked accounts/Memorialized/Needs details/Unconnected
  filters with whole-family counts. Needs details means missing birth date, photo
  or biography; Unconnected includes absence of partner links as well as ancestry.
- Shared Overview/Tree/Memories/People/Events tabs, a desktop sidebar family
  switcher, and a compact switcher above page content on tablet and phone.
  Switching preserves recognized sections rather than person IDs. Memories lives
  at `/app/families/:familyId/memories`; `/feed` replace-redirects there while the
  API remains `/posts`. ClaimPanel lives on Overview; events UI creates, deletes
  and toggles RSVP alongside a derived dates section.
- Interactive map delivery in `TreePage`: pan/zoom, focused one-hop context,
  progressive `+N` expansion, visually distinct partners, desktop/mobile
  inspector, generations fallback and partner form. `FamilyMap` owns camera and
  inspector state; `map-layout.ts` computes presentation positions from explicit edges.

### Verification and remaining limitations

- Migration 0003 includes the ordered partner-pair CHECK. Claim transitions consume
  `PENDING` conditionally and link only eligible live targets in an atomic batch.
  Cancellation is audited. Memory body/tag writes are atomic after tag validation.
- `tests/graph-features.test.ts` covers partner authorization, canonical ordering,
  audit records, claims and deterministic competing transitions, event authorization,
  RSVP counts, memory filtering, rollback and deletion cleanup.
  `tests/map-layout.test.ts` covers one-generation visibility and co-parent alignment.
- Brave Origin visual QA covers 11 routes at 1440, 768, 390 and 320px in both themes,
  including top/bottom captures. No document overflow or browser runtime exceptions
  were observed. Map pan/zoom/expansion/inspectors, directory filters and deep links,
  claim approval, tagged memory composition/profile display, event creation and
  RSVP replacement/clearing were exercised through the real interface.
- Event creation/editing and RSVP changes have no dedicated audits; event deletion does.
  Event editing remains API-only. The `/people` endpoint defaults to 100 results;
  directory, claim choices and the memory composer use the full family tree instead.
- No production deployment or remote migration application is claimed for this slice.
- Local verification passed: Prettier, ESLint, `tsc --noEmit`, all 94 Vitest tests,
  Vite production build, migration application, and `db:generate` with no schema drift.

Earlier feed references mean Memories at the branch routes above. Albums, global
search, dedicated family settings and typed union history are not delivered by
this slice.

## Direct Google authentication (October 11, 2026)

Production sign-in uses Google's authorization-code OAuth flow with PKCE,
state and nonce, and verified ID tokens. Banyan stores hashed opaque sessions
in D1 and revokes them on logout. Accounts use stable `google:`-prefixed
subjects, distinct from family-tree people. Email never grants or links family
access. Sessions expire after seven days. New migrations add `oauth_attempts`
and `auth_sessions`. Both migrations were applied successfully to remote
`banyan-db` on October 11. The owner reports the old Access gate removed.
Deployment through the Cloudflare Git integration succeeded. The live auth
config reports `provider: google`, `devSignIn: false`, `googleSignIn: true`.

Verification for this change: 55 tests across seven files passed; TypeScript,
ESLint, frontend build and Wrangler deployment dry-run passed. No live Google
sign-in was tested during implementation. Google credentials are now configured:
the public client ID is in Wrangler and GOOGLE_CLIENT_SECRET is stored as a
Worker secret. The supplied web-client JSON lists the expected callback URI
and is excluded from Git. No application deployment or remote migration
application was performed in this credential-setup step.

The remote migration command applied `0000_calm_talon.sql` and
`0001_busy_stepford_cuckoos.sql` successfully. No direct Worker deployment was
performed; the owner uses Cloudflare Git integration for deployment.

Cloudflare bot build for commit 3726a00 failed before compilation: pnpm
10.11.1 rejected pnpm-workspace.yaml because it lacked `packages`. The
workspace now explicitly lists the root package and uses pnpm 10’s install
script allowlist. The package-manager version is pinned to match Cloudflare.

Verified the corrected workspace with the exact Cloudflare installer:
`CI=true corepack pnpm@10.11.1 install --frozen-lockfile` completed successfully.

Production deployment verified after pushing integrated main commit 3e3ce11:
active Worker version `4e52bfcb-679b-4b2a-ad4e-9b8e61bd496a`. Google sign-in
configuration is live; a complete interactive Google sign-in remains untested.
GitHub CI’s duplicate pnpm version setting was removed so action-setup reads
the pinned packageManager version from package.json.

## Password authentication (October 11, 2026)

Implemented username/password registration and login alongside Google OAuth,
account settings for adding credentials and changing passwords, persistent D1
throttling, salted native scrypt, optimistic credential versions, session
revocation and audit events. Migration 0002 adds credential/throttle persistence
and session version/creation fields. The actual local Workers/D1 runtime passed
registration, `/me`, password login and password change. Google linking tests
verify the account ID and existing family membership are preserved.

Prepared an opt-in historical demo seed: 21 profiles, 31 explicit parent-child
edges, five generations, source links and a welcome post. It is private to a
separate demo account. Sources are Cambridge's Darwin Correspondence Project
and English Heritage, recorded in `tools/demo/darwin-family.json`.
Production migration 0002 was applied successfully to banyan-db. Password authentication deployed successfully through Cloudflare Git integration
from main commit 2db99c5; GitHub CI also passed. Production demo creation is
complete.

Verification for the password slice: 68 tests across eight files, format, lint,
type-check, migration drift check, frontend build and Worker dry-run passed.
The complete demo seed passed through local Workers/D1 API routes with all
21 profiles and 31 relationships present.

Production verification: demo registration succeeded; password login, password
change and replacement-password login returned 200; the account ID and family
were unchanged. Old-session and anonymous-tree requests returned 401. Logout
returned 302 and its revoked session returned 401. Google sign-in remains
configured alongside passwords. Full interactive Google login remains untested
by the agent, though mocked callback and linking tests pass.

Created private demo username `darwin_demo`, with 21 historical profiles and
31 parent-child edges over five generations. Tree: `/app/families/UvWF9RoFtazdXiUnxzT8V/tree`.
Its generated password and full tree URL are stored only in the local ignored
`.banyan-demo-credentials.json` (mode 0600). No credentials were committed.
