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
- Account provisioning via OIDC/OAuth subject.
- Development-only cookie sign-in mounted only when `AUTH_DEV_MODE=true` (`pnpm dev:api` sets it). The route is absent otherwise, so production Workers builds cannot mint trusted tokens.
- Cookie and Bearer token authentication for both browser UI and API clients.
- Family CRUD, member role management (CREATOR/EDITOR/VIEWER), invitations, ownership transfer, and soft delete.
- Person profile CRUD with validation, life dates, contact/occupation/biography fields, and profile photo references. Person deletion soft-deletes the row and detaches parent-child edges and membership links in one atomic batch.
- Family tree graph with explicit parent-child edges, cycle detection, self-edge rejection, and tree projection.
- Family social feed: posts, comments, reactions (LIKE/LOVE/LAUGH/SAD), soft-delete, and cursor pagination. `GET /families/:id/posts` includes each post's author display name, reaction counts by type, comment count, and the requesting account's reaction, and supports `limit` (1-50). Cursors combine timestamp and id so posts created in the same second are not skipped.
- Upcoming events: `GET /events/upcoming?days=45` returns birthdays and memorial anniversaries across every family the account belongs to, computed from existing `people.date_of_birth` / `people.date_of_death` values.
- Audit events for family create/update/delete, membership role changes and removals, invitation creation and acceptance, ownership transfer, person create/update/delete, relationship add/remove, post delete, comment delete, and family export.
- Friend requests, accept/reject/cancel, friendships, and unfriending. Concurrent single-use operations (invitation acceptance, friend acceptance, ownership transfer) are guarded by conditional SQL inside the batch so a lost race cannot create a membership without claiming the invitation.
- Media asset records, upload intent/complete, and a placeholder upload URL. Actual object storage uploads are not implemented yet.
- JSON and CSV family export with audit logging.
- Web UI (Vite + React SPA under `src/client/`, React Router): `/sign-in`, `/app` dashboard, family list, family detail, person detail, tree view, feed view, friends, and invitation acceptance. All data flows through the Hono API using the `auth_token` cookie.
- Feed UI: post composer, four emoji reactions with live counts, expandable comment threads with author names, edit/delete for own posts, and Creator moderation of posts and comments.
- Person profile UI: edit form (name, gender, life dates, occupation, contact details, height, weight, biography) for Creators and Editors, and Creator-only delete with confirmation. Deletion is a soft delete that also detaches family-tree links.
- Member management UI: Creators can change member roles between Editor and Viewer and remove members.
- Dashboard: family cards plus a "Coming up" card showing birthdays and remembrances in the next 60 days with relative dates.
- Hardening: request logging, 100 req/minute per-account/IP rate limiting, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` headers.
- Cloudflare deployment ready:
  - `vite build` produces the SPA in `dist/`; `wrangler deploy` bundles `src/worker.ts` directly (the `~/*` tsconfig alias is resolved by Wrangler's bundler)
  - D1 database binding (`DB`)
  - R2 media bucket binding (`MEDIA_BUCKET`)
  - `wrangler.jsonc` with `run_worker_first: ["/api/*"]`, `not_found_handling: "single-page-application"`, and staging/production environment overrides
  - `wrangler types` generated worker types

## Partially implemented capabilities

- Media uploads: the API creates asset rows and returns a placeholder upload URL; the file never reaches R2/S3 and there is no upload route yet.
- Production OIDC onboarding: tokens issued by an external provider are accepted when `AUTH_JWKS_URI` or `AUTH_JWKS` is configured, but the app has no interactive provider flow of its own.

Deferred features (DMs, public feed, spouse relationship, per-field privacy, PDF export, external import, AI) remain intentionally out of scope per the plan.

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
- `src/client/api.ts` is a small `fetch` wrapper; authentication rides on the same-origin `auth_token` cookie.
- `src/client/auth.tsx` provides an `AuthProvider` (`/api/v1/me`) and a `RequireAuth` guard that redirects to `/sign-in?returnTo=…`.
- Vite dev server proxies `/api` to the Hono server on `localhost:3000`.
- Visual design: a single dependency-free stylesheet, `src/client/styles.css`, defines design tokens (colors, radii, shadows, fonts) on `:root` with a dark-mode override via `prefers-color-scheme`, plus plain component classes (`.card`, `.btn`, `.input`, `.list`, `.tabs`, `.badge`, `.reaction`, `.comment`, `.event`, and so on). There is no CSS framework.
- Shared UI building blocks live in `src/client/components/ui.tsx` (`Loading`, `Alert`, `EmptyState`, `ErrorState`, `PageHeader`, `Card`, `Field`, `RoleBadge`, `Avatar`, `CopyField`, `useBusy`, `timeAgo`, `relativeDay`, `shortDate`, `formatDate`, `lifeSpan`, inline icons). `components/PostCard.tsx` owns the feed post card (reactions, comments, edit/delete). `FamilyHeader` (`components/FamilyNav.tsx`) renders the family name, role badge, and Overview/Tree/Feed tabs. `components/families.tsx` holds `FamilyCard` and `CreateFamilyForm`.
- Every page has loading, empty, and error states, and submit buttons show a pending state.
- Member lists and feed posts show account display names. The friends page shows display names, lets you remove friends and cancel sent requests, and shows your own account ID with a copy button, because friend requests are still sent by account ID.
- Role-aware UI follows the permission matrix: every member (including Viewers) can post and export; Creators and Editors can add people and relationships; only Creators can invite.
- `src/client/api.ts` turns network failures into an error result (`status: 0`) so pages show a message instead of loading forever.
- The tree page groups people into generations on the client (presentation only; see `layoutGenerations` in `TreePage.tsx`) and lists people with no relationships separately. Person pages show parents and children as links, loaded with `GET /tree?rootPersonId=…&depth=1`.
- `GET /families/:id/tree` returns every live person when no root is given (including people with no relationships), validates `direction`, and honours `depth`.
- Layout is responsive and verified at 390px and 360px widths with no horizontal scrolling.

## Authentication

- `src/lib/auth.ts` verifies RS256 JWTs against JWKS.
- `src/lib/dev-auth.ts` generates a dev RSA key pair and signs tokens. Both the login route and `signDevToken` refuse to run unless `AUTH_DEV_MODE=true`.
- `src/lib/hono.ts` extracts tokens from `Authorization` header and the `auth_token` cookie.

## Infrastructure and deployment

- `wrangler.jsonc` declares the D1 `DB` binding, `MEDIA_BUCKET` R2 binding, the static assets binding (`dist/`, SPA fallback, `run_worker_first` for `/api/*`), and environment-specific staging/production overrides.
- `.env.example` documents `DATABASE_URL`, `APP_BASE_URL`, `PORT`, auth settings including `AUTH_DEV_MODE`, and optional OIDC/S3-compatible storage variables.
- `.github/workflows/ci.yml` runs format, lint, type-check, migration generation, migration application to a local SQLite file, `vite build` + `wrangler deploy --dry-run`, and tests.

## Tests

- `tests/setup.ts`, `tests/helpers.ts`, `tests/family.test.ts`, `tests/authorization.test.ts`, `tests/hardening.test.ts`, `tests/engagement.test.ts`.
- 36 integration tests across 4 files.
- Covers family lifecycle, invitations, role authorization, cross-family isolation, tree cycles/self-edges, expired/duplicate invitations, and friendship-without-family-access.
- Also covers Viewer posting/export, whole-family and depth-limited tree projections, tree query validation, friend requests to unknown accounts, friend display names, and mutual friend requests.
- New hardening coverage: development sign-in is absent and cannot mint tokens when disabled, a single-use invitation accepts exactly one account (including two concurrent acceptances), person deletion soft-deletes and detaches relationships, ownership transfer swaps roles, exports are audited, and sensitive mutations write audit events.
- New engagement coverage: feed author names, reaction counts, comment counts and current-account reaction; reaction toggling; same-second cursor pagination; upcoming birthdays and memorials.

## Current compatibility obligations

- Cloudflare Workers `nodejs_compat` compatibility flag is enabled.
- D1 migrations must be applied with `wrangler d1 migrations apply` before deployment.

## Current technical debt

- Rate limiting is in-memory and per-process, which is sufficient for a single-node deployment but not a multi-instance cluster or per-isolate Workers traffic.
- The JWKS cache in `src/lib/auth.ts` never expires; signing-key rotation requires a cold start until a TTL/`kid` cache is added.
- The development sign-in flow is not a production OIDC/OAuth provider; replacing `AUTH_JWKS_URI` with a real provider is still required for production onboarding.
- Media upload completion still uses S3-compatible object storage configured via env vars, and the returned upload URL is a placeholder. The `MEDIA_BUCKET` R2 binding is declared in `wrangler.jsonc` but the media service has not been migrated to use the R2 binding directly.
- No e2e browser tests yet.
- Do not put `NODE_ENV` in `.env`: Vite reads it and `vite build` then bundles development React (about 514 kB instead of 254 kB). `.env.example` documents this.
- Dependencies (Hono 4.4.6, drizzle-orm 0.30.9, drizzle-kit 0.21.4, Vite 5) are behind current stable releases; upgrade with the test suite as a guard.

## Next required implementation step

None required for v1.0. Optional follow-ups:

- Replace dev sign-in with real OIDC/OAuth onboarding for production use.
- Add controls for existing API features not yet in the UI: removing relationships, ownership transfer, and family editing/deletion.
- Add e2e tests (Playwright/Cypress).
- Move rate limiting to Durable Objects or another shared store for multi-instance deployments.
- Implement media uploads against the `MEDIA_BUCKET` R2 binding and return real presigned URLs.
- Add coverage thresholds to CI (migration drift is already checked).
- Apply D1 migrations to the Cloudflare database and deploy with `pnpm deploy:cloudflare`.

After any implementation work, update this file with factual status.
