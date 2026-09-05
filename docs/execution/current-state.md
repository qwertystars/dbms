# Current State

## Project status

**Implementation complete (v1.0).**

All planned backend services, web UI, database migrations, CI, and hardening are in place and verified.

## Evidence currently available

- user description: social media app for families
- handwritten product sketch
- this specification set
- repository with TypeScript, Next.js, Hono, Drizzle ORM, PostgreSQL, and working integration tests

## Implemented capabilities

- Repository scaffold with TypeScript, Next.js 14, pnpm, Prettier, ESLint, Vitest, GitHub Actions CI.
- PostgreSQL development and test environments via Docker Compose.
- Drizzle ORM schema and generated migration covering accounts, families, memberships, invitations, people, parent-child relationships, posts, comments, reactions, media, friends, friend requests, and audit events.
- Environment validation with `dotenv`, including empty-string-to-undefined handling for optional values.
- Hono-based REST API under `/api/v1/[[...path]]` with request context, structured logging, security headers, and rate limiting.
- Account provisioning via OIDC/OAuth subject, plus a development-only sign-in flow that issues an `auth_token` cookie.
- Cookie and Bearer token authentication for both browser UI and API clients.
- Family CRUD, member role management (CREATOR/EDITOR/VIEWER), invitations, ownership transfer, and soft delete.
- Person profile CRUD with validation, life dates, contact/occupation/biography fields, and profile photo references.
- Family tree graph with explicit parent-child edges, cycle detection, self-edge rejection, and tree projection.
- Family social feed: posts, comments, reactions (LIKE/LOVE/LAUGH/SAD), soft-delete, and cursor pagination.
- Friend requests, accept/reject/cancel, friendships, and unfriending.
- Media asset records, upload intent/complete, and presigned upload URLs.
- JSON and CSV family export with audit logging.
- Web UI pages: `/sign-in`, `/app` dashboard, family list, family detail, person detail, tree view, feed view, friends, and invitation acceptance.
- Hardening: request logging, 100 req/minute per-account/IP rate limiting, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` headers.
- Audit logging for sensitive family mutations.

## Partially implemented capabilities

None; all phases in `docs/execution/implementation-plan.md` are implemented. Deferred features (DMs, public feed, spouse relationship, per-field privacy, PDF export, external import, AI) remain intentionally out of scope per the plan.

## Database

- PostgreSQL schema defined in `src/db/schema.ts`.
- Migrations in `db/migrations/`.
- Partial unique indexes and CHECK constraints enforced in migration SQL.

## API

- `src/routes/v1.ts` exposes the v1 REST routes.
- Hono app mounted under `/api/v1` in `src/lib/hono.ts`.
- Next.js catch-all route in `src/app/api/v1/[[...path]]/route.ts`.

## Frontend

- Next.js app router pages under `src/app/`: sign-in, dashboard, family list/detail, tree, feed, person, friends, invitation acceptance.
- Server actions for family, person, post, tree edge, invitation, and friend interactions.
- `src/lib/server-api.ts` used by server components and server actions to call the Hono API with the current request cookie.

## Authentication

- `src/lib/auth.ts` verifies RS256 JWTs against JWKS.
- `src/lib/dev-auth.ts` generates a dev RSA key pair and signs tokens for the `/sign-in` development flow.
- `src/lib/hono.ts` extracts tokens from `Authorization` header and the `auth_token` cookie.

## Infrastructure and deployment

- `docker-compose.yml` (dev) and `docker-compose.test.yml` (test) with distinct container names and volumes.
- `.github/workflows/ci.yml` runs format, lint, type-check, migration generation, migration application, build, and tests.
- `.env.example` and `.env` (git-ignored) provided.

## Tests

- `tests/setup.ts`, `tests/helpers.ts`, `tests/family.test.ts`, `tests/authorization.test.ts`.
- Covers family lifecycle, invitations, role authorization, cross-family isolation, tree cycles/self-edges, expired/duplicate invitations, and friendship-without-family-access.

## Current compatibility obligations

None known.

## Current technical debt

- `db/migrations/0000_elite_wilson_fisk.sql` was hand-edited after `drizzle-kit generate` to add partial `WHERE` clauses and CHECK constraints. Future schema changes should be verified and reconciled.
- Rate limiting is in-memory and per-process, which is sufficient for a single-node deployment but not a multi-instance cluster.
- The development sign-in flow is not a production OIDC/OAuth provider; replacing `AUTH_JWKS_URI` with a real provider disables the dev key generation.
- No e2e browser tests yet.

## Next required implementation step

None required for v1.0. Optional follow-ups:

- Replace dev sign-in with real OIDC/OAuth provider.
- Add client-side interactivity, loading states, and styling.
- Add e2e tests (Playwright/Cypress).
- Move rate limiting to Redis or external store for multi-instance deployments.

After any implementation work, update this file with factual status.
