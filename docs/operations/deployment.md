# Deployment

## Target topology

V1:

```text
Browser
  |
HTTPS
  |
Cloudflare Workers (Hono API + Vite SPA static assets)
  |
  |-------------------|-------------------|
  |                   |                   |
Cloudflare D1    Cloudflare R2    Object storage (optional/S3-compatible)
```

The Worker entry is `src/worker.ts`. It serves the Hono API for `/api/*`
requests (`run_worker_first` in `wrangler.jsonc`) and delegates every other
path to the static assets binding, which serves the Vite build output in
`dist/` with single-page-application fallback (`not_found_handling`).

Authentication may use an external OIDC/OAuth provider.

No queue or cache service is required for initial deployment.

## Environments

Maintain:

- local
- staging
- production

Production must not share database credentials or storage buckets with local/staging.

## Required environment categories

```text
# Local / tests
DATABASE_URL=file:./dev.db

APP_BASE_URL
NODE_ENV

AUTH_JWKS_URI or AUTH_JWKS
AUTH_ISSUER
AUTH_AUDIENCE

# Optional S3-compatible media storage (legacy / on-prem)
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_REGION
OBJECT_STORAGE_FORCE_PATH_STYLE
```

Actual variable names must be centralized in a validated environment schema.

In the Cloudflare Workers runtime the `DB` D1 binding and `MEDIA_BUCKET` R2 binding are read from `wrangler.jsonc` and the request context.

## Cloudflare deployment steps

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create and configure D1 databases (one per environment) and update `wrangler.jsonc` with the `database_id` values.

   ```bash
   pnpm exec wrangler d1 create family-social-db
   pnpm exec wrangler d1 create family-social-db-staging
   pnpm exec wrangler d1 create family-social-db-prod
   ```

3. Apply migrations to each D1 database:

   ```bash
   pnpm exec wrangler d1 migrations apply family-social-db --local
   pnpm exec wrangler d1 migrations apply family-social-db-staging
   pnpm exec wrangler d1 migrations apply family-social-db-prod
   ```

   For production, run without `--local` and confirm.

4. Create R2 buckets for media and update `wrangler.jsonc` bucket names:

   ```bash
   pnpm exec wrangler r2 bucket create family-social-media
   pnpm exec wrangler r2 bucket create family-social-media-staging
   pnpm exec wrangler r2 bucket create family-social-media-prod
   ```

5. Set secrets (do not commit them):

   ```bash
   pnpm exec wrangler secret put AUTH_JWKS_URI
   pnpm exec wrangler secret put OBJECT_STORAGE_ACCESS_KEY
   pnpm exec wrangler secret put OBJECT_STORAGE_SECRET_KEY
   ```

   Never set `AUTH_DEV_MODE` in production. It is off unless explicitly set to
   `"true"`, and when off the development `/api/auth/login` route is not mounted
   at all, so only tokens from the configured OIDC provider are accepted.

6. Build and deploy:

   ```bash
   pnpm deploy:cloudflare
   ```

   This runs `vite build` (SPA into `dist/`) and then `wrangler deploy`,
   which bundles `src/worker.ts` directly. Use `--env staging` or
   `--env production` (for example `pnpm exec wrangler deploy --env staging`)
   to target the matching environment in `wrangler.jsonc`.

7. Verify the bundle with a dry-run before a real deploy:

   ```bash
   pnpm build:cloudflare
   ```

## Local development

1. Create `.env` from `.env.example`.

2. Run migrations against a local SQLite file:

   ```bash
   pnpm db:migrate
   ```

3. Start the development servers:

   ```bash
   pnpm dev
   ```

   This starts the Hono API server (`tsx watch src/server/index.ts`) on
   `http://localhost:3000` and the Vite dev server on
   `http://localhost:5173`, which proxies `/api/*` to the API server.
   `pnpm dev:api` sets `AUTH_DEV_MODE=true`, which enables the development
   cookie sign-in on `/api/auth/login`. Local data uses the libsql
   `DATABASE_URL` (for example `file:./dev.db`).

   For a production-faithful local run with real D1/R2 bindings, build the
   SPA and start the Workers runtime instead:

   ```bash
   pnpm db:apply:local
   pnpm preview:cloudflare   # vite build + wrangler dev (AUTH_DEV_MODE=true)
   ```

   The preview script passes `AUTH_DEV_MODE=true` so the development sign-in
   works. To run `wrangler dev` directly instead, pass the same variable:

   ```bash
   pnpm exec wrangler dev --var AUTH_DEV_MODE:true
   ```

4. To serve the production build on plain Node (no Cloudflare):

   ```bash
   pnpm build
   pnpm start                # serves dist/ and /api/* on PORT (default 3000)
   ```

5. Run tests:

   ```bash
   pnpm test
   ```

## Deployment order with migrations

For additive compatible changes:

1. backup/verify database health
2. apply backward-compatible migration
3. deploy application
4. verify health checks and smoke tests
5. remove obsolete compatibility paths only in a later deployment

For destructive changes:

- create a specific migration plan first
- never combine irreversible data deletion with an unverified application rollout

## Health endpoints

Provide:

- liveness
- readiness

Readiness should verify critical application dependencies without causing expensive load.

## Backup

Production D1 data should be exported regularly.

Minimum operational requirement:

- documented retention
- restore procedure tested before production reliance

Object storage should use provider durability/versioning options where justified.

## Rollback

Application rollback:

- deploy previous known-good artifact

Database rollback:

- prefer forward-fix migrations
- use restore only when necessary
- never assume an arbitrary migration is safely reversible

## Release smoke test

After deployment verify:

- sign in
- list families
- open family
- load tree
- create and delete a test post in staging
- authorization negative check
- media access
