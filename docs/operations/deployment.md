# Deployment

## Target topology

```text
Browser
  |
HTTPS
  |
Cloudflare Access (email one-time PIN or Google, team qwertystars)
  |
Cloudflare Worker "banyan" (Hono API + Vite SPA static assets)
  |
  |------------------|------------------|
Cloudflare D1      Cloudflare R2      Workers rate limiting
(banyan-db)        (banyan-media)     (RATE_LIMITER)
```

The Worker entry is `src/worker.ts`. It serves the Hono API for `/api/*` requests
(`run_worker_first` in `wrangler.jsonc`) and delegates every other path to the static assets
binding, which serves `dist/` with single-page-application fallback.

Production URL: `https://banyan.srijan-guchhait.workers.dev` on the Cloudflare account
"Srijan.guchhait@gmail.com's Account".

## Resources

| Resource           | Name / value                                          |
| ------------------ | ----------------------------------------------------- |
| Worker             | `banyan`                                              |
| D1 database        | `banyan-db` (`9f1b3386-bd11-493f-852d-9915821e71aa`)  |
| R2 bucket          | `banyan-media` (private; read only through the API)   |
| Rate limit binding | `RATE_LIMITER`, namespace `1001`, 100 requests / 60s  |
| Access application | "Banyan", domain `banyan.srijan-guchhait.workers.dev` |
| Access team        | `qwertystars.cloudflareaccess.com`                    |

## Configuration

All production settings are plain `vars` in `wrangler.jsonc`; there are no secrets.

| Variable        | Production value                                                |
| --------------- | --------------------------------------------------------------- |
| `AUTH_PROVIDER` | `cloudflare-access`                                             |
| `AUTH_ISSUER`   | `https://qwertystars.cloudflareaccess.com`                      |
| `AUTH_JWKS_URI` | `https://qwertystars.cloudflareaccess.com/cdn-cgi/access/certs` |
| `AUTH_AUDIENCE` | optional; the Access application's AUD tag (not set)            |
| `APP_BASE_URL`  | `https://banyan.srijan-guchhait.workers.dev`                    |

Never set `AUTH_DEV_MODE` in production. When it is not `"true"` the development
`/api/auth/login` route is not mounted, so only Access tokens are accepted.

## First-time setup

1. Create the D1 database and R2 bucket (done; IDs above).
2. Create the Access application (Zero Trust → Access → Applications → Add → Self-hosted):
   - domain `banyan.srijan-guchhait.workers.dev`
   - identity providers: One-time PIN and Google
   - session duration 30 days
   - one Allow policy that includes Everyone
3. Optional: copy the application's AUD tag into `AUTH_AUDIENCE` in `wrangler.jsonc`. Without
   it the API accepts a token from any Access application in the `qwertystars` team, so who
   can sign in is decided by the team's Access policies. Set it once the team has other
   Access applications whose users should not get into Banyan.
4. Sign wrangler in: `pnpm exec wrangler login`.
5. Apply migrations and deploy:

   ```bash
   pnpm db:apply:cloudflare
   pnpm deploy:cloudflare
   ```

## Routine deploys

```bash
pnpm build:cloudflare      # vite build + wrangler deploy --dry-run
pnpm db:apply:cloudflare   # only when db/migrations changed
pnpm deploy:cloudflare
```

## Staging

There is no staging environment yet. To add one, create `banyan-db-staging` and
`banyan-media-staging`, add an `env.staging` block to `wrangler.jsonc` with its own bindings,
a separate Access application for `banyan-staging.srijan-guchhait.workers.dev`, and set
`AUTH_AUDIENCE` in both environments so staging tokens are not accepted by production. Production must never share its database or bucket with staging.

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
   `DATABASE_URL` (for example `file:./dev.db`). Uploaded photos are kept in
   memory by the Node server and disappear when it restarts.

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
