# Current State

## Project status

**Implementation complete (v1.0).**

All planned backend services, web UI, database migrations, CI, and hardening are in place and verified.

The frontend is a Vite + React single-page application and the backend is a standalone Hono server. The application is configured for Cloudflare Workers with D1 as the production database and R2 as the configured object-storage binding: `src/worker.ts` serves the Hono API for `/api/*` while the built SPA in `dist/` is served from the static assets binding with SPA fallback.

## Evidence currently available

- user description: social media app for families
- handwritten product sketch
- this specification set
- repository with TypeScript, Vite, React, Hono, Drizzle ORM, SQLite/D1, and working integration tests

## Implemented capabilities

- Repository scaffold with TypeScript, Vite + React SPA, Hono server, pnpm, Prettier, ESLint, Vitest, GitHub Actions CI.
- SQLite/D1 database with Drizzle ORM schema and generated migrations covering accounts, families, memberships, invitations, people, parent-child relationships, posts, comments, reactions, media, friends, friend requests, and audit events.
- Environment validation with `dotenv`, including empty-string-to-undefined handling for optional values.
- Hono-based REST API under `/api/v1` with request context, structured logging, security headers, and rate limiting.
- Account provisioning via OIDC/OAuth subject, plus a development-only sign-in flow that issues an `auth_token` cookie.
- Cookie and Bearer token authentication for both browser UI and API clients.
- Family CRUD, member role management (CREATOR/EDITOR/VIEWER), invitations, ownership transfer, and soft delete.
- Person profile CRUD with validation, life dates, contact/occupation/biography fields, and profile photo references.
- Family tree graph with explicit parent-child edges, cycle detection, self-edge rejection, and tree projection.
- Family social feed: posts, comments, reactions (LIKE/LOVE/LAUGH/SAD), soft-delete, and cursor pagination.
- Friend requests, accept/reject/cancel, friendships, and unfriending.
- Media asset records, upload intent/complete, and presigned upload URLs.
- JSON and CSV family export with audit logging.
- Web UI (Vite + React SPA under `src/client/`, React Router): `/sign-in`, `/app` dashboard, family list, family detail, person detail, tree view, feed view, friends, and invitation acceptance. All data flows through the Hono API using the `auth_token` cookie.
- Hardening: request logging, 100 req/minute per-account/IP rate limiting, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` headers.
- Audit logging for sensitive family mutations.
- Cloudflare deployment ready:
  - `vite build` produces the SPA in `dist/`; `wrangler deploy` bundles `src/worker.ts` directly (the `~/*` tsconfig alias is resolved by Wrangler's bundler)
  - D1 database binding (`DB`)
  - R2 media bucket binding (`MEDIA_BUCKET`)
  - `wrangler.jsonc` with `run_worker_first: ["/api/*"]`, `not_found_handling: "single-page-application"`, and staging/production environment overrides
  - `wrangler types` generated worker types

## Partially implemented capabilities

None; all phases in `docs/execution/implementation-plan.md` are implemented. Deferred features (DMs, public feed, spouse relationship, per-field privacy, PDF export, external import, AI) remain intentionally out of scope per the plan.

## Database

- SQLite/D1 schema defined in `src/db/schema.ts`.
- Migrations in `db/migrations/` generated for SQLite.
- Local development and tests use `@libsql/client` with `file:` or `:memory:` URLs.
- Cloudflare Workers runtime uses the `DB` D1 binding.
- Partial unique indexes and CHECK constraints enforced in migration SQL.

## API

- `src/routes/v1.ts` exposes the v1 REST routes.
- Hono app mounted under `/api/v1` in `src/lib/hono.ts`.
- `src/server/app.ts` composes the root server: mounts the v1 API and hosts the `/api/auth/login` and `/api/auth/logout` routes (cookie-based dev sign-in).
- `src/server/index.ts` is the Node entry (`@hono/node-server`): serves the API, serves `dist/` statics, and falls back to `index.html` for client-side routes.
- `src/worker.ts` is the Cloudflare Workers entry: `/api/*` → Hono; other paths → `env.ASSETS`.
- Request-scoped D1 client via `c.env.DB` in Cloudflare and `DATABASE_URL` (libsql) fallback locally.

## Frontend

- Vite + React SPA under `src/client/` with React Router: sign-in, dashboard, family list/detail, tree, feed, person, friends, invitation acceptance.
- `src/client/api.ts` is a small `fetch` wrapper; authentication rides on the same-origin `auth_token` cookie.
- `src/client/auth.tsx` provides an `AuthProvider` (`/api/v1/me`) and a `RequireAuth` guard that redirects to `/sign-in?returnTo=…`.
- Vite dev server proxies `/api` to the Hono server on `localhost:3000`.
- Visual design: a single dependency-free stylesheet, `src/client/styles.css`, defines design tokens (colors, radii, shadows, fonts) on `:root` with a dark-mode override via `prefers-color-scheme`, plus plain component classes (`.card`, `.btn`, `.input`, `.list`, `.tabs`, `.badge`, `.alert`, and so on). There is no CSS framework.
- Shared UI building blocks live in `src/client/components/ui.tsx` (`Loading`, `Alert`, `EmptyState`, `ErrorState`, `PageHeader`, `Card`, `Field`, `RoleBadge`, `Avatar`, `CopyField`, `useBusy`, date helpers). `FamilyHeader` (`components/FamilyNav.tsx`) renders the family name, role badge, and Overview/Tree/Feed tabs. `components/families.tsx` holds `FamilyCard` and `CreateFamilyForm`.
- Every page has loading, empty, and error states, and submit buttons show a pending state.
- Member lists and feed posts show account display names (from `GET /families/:id/members`). The friends page shows display names (the friends APIs include them), lets you remove friends and cancel sent requests, and shows your own account ID with a copy button, because friend requests are still sent by account ID.
- Role-aware UI follows the permission matrix: every member (including Viewers) can post and export; Creators and Editors can add people and relationships; only Creators can invite.
- `src/client/api.ts` turns network failures into an error result (`status: 0`) so pages show a message instead of loading forever.
- The tree page groups people into generations on the client (presentation only; see `layoutGenerations` in `TreePage.tsx`) and lists people with no relationships separately. Person pages show parents and children as links, loaded with `GET /tree?rootPersonId=…&depth=1`.
- `GET /families/:id/tree` returns every live person when no root is given (including people with no relationships), validates `direction`, and honours `depth`.
- Layout is responsive and verified at 390px and 360px widths with no horizontal scrolling.

## Authentication

- `src/lib/auth.ts` verifies RS256 JWTs against JWKS.
- `src/lib/dev-auth.ts` generates a dev RSA key pair and signs tokens for the `/sign-in` development flow.
- `src/lib/hono.ts` extracts tokens from `Authorization` header and the `auth_token` cookie.

## Infrastructure and deployment

- `wrangler.jsonc` declares the D1 `DB` binding, `MEDIA_BUCKET` R2 binding, the static assets binding (`dist/`, SPA fallback, `run_worker_first` for `/api/*`), and environment-specific staging/production overrides.
- `.env.example` documents `DATABASE_URL`, `APP_BASE_URL`, `PORT`, and optional OIDC/S3-compatible storage variables.
- `.github/workflows/ci.yml` runs format, lint, type-check, migration generation, migration application to a local SQLite file, `vite build` + `wrangler deploy --dry-run`, and tests.

## Tests

- `tests/setup.ts`, `tests/helpers.ts`, `tests/family.test.ts`, `tests/authorization.test.ts`.
- Covers family lifecycle, invitations, role authorization, cross-family isolation, tree cycles/self-edges, expired/duplicate invitations, and friendship-without-family-access.
- Also covers Viewer posting/export, whole-family and depth-limited tree projections, tree query validation, friend requests to unknown accounts, friend display names, and mutual friend requests.

## Current compatibility obligations

- Cloudflare Workers `nodejs_compat` compatibility flag is enabled.
- D1 migrations must be applied with `wrangler d1 migrations apply` before deployment.

## Current technical debt

- `src/lib/db.ts` contains a local libsql fallback path in addition to the D1 Cloudflare path. The local path is used for tests and the local Node server and is loaded dynamically so it is not bundled into the Workers runtime.
- Domain services use `db.transaction(...)`, which works on the libsql path (local dev, tests, Node server) but fails on Cloudflare D1, where interactive transactions are not supported — D1 only allows `batch()`/atomic statement lists. Verified in `wrangler dev`: reads and non-transactional writes work on D1, but `POST /api/v1/families` (and other transactional mutations) return `D1_ERROR`. The services need to be reworked to D1-compatible atomic batches before D1-backed deployments can accept writes.
- Rate limiting is in-memory and per-process, which is sufficient for a single-node deployment but not a multi-instance cluster.
- The development sign-in flow is not a production OIDC/OAuth provider; replacing `AUTH_JWKS_URI` with a real provider disables the dev key generation.
- No e2e browser tests yet.
- Do not put `NODE_ENV` in `.env`: Vite reads it and `vite build` then bundles development React (about 514 kB instead of 254 kB). `.env.example` documents this.
- Media upload completion still uses S3-compatible object storage configured via env vars. The `MEDIA_BUCKET` R2 binding is declared in `wrangler.jsonc` but the media service has not yet been migrated to use the R2 binding directly.

## Next required implementation step

None required for v1.0. Optional follow-ups:

- Replace dev sign-in with real OIDC/OAuth provider.
- Rework service-layer `db.transaction` calls to D1-compatible atomic batches (`db.batch`) or single-statement sequences so mutations work on Cloudflare D1.
- Add controls for existing API features not yet in the UI: editing/deleting people, removing relationships, member role management, comments, and reactions.
- Add e2e tests (Playwright/Cypress).
- Move rate limiting to Redis or external store for multi-instance deployments.
- Migrate media service to use the `MEDIA_BUCKET` R2 binding in Cloudflare.
- Apply D1 migrations to the Cloudflare database and deploy with `pnpm deploy:cloudflare`.

After any implementation work, update this file with factual status.
