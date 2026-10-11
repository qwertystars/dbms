# Deployment

Banyan runs on Cloudflare Workers with D1, R2 and the rate limiter binding.
Direct Google OAuth replaces Clerk and Cloudflare Access.

## Google setup

Create a Google OAuth client of type **Web application**. Configure the consent
screen and, while the app is in testing, add permitted test users. Register this
exact authorized redirect URI:

`https://banyan.srijan-guchhait.workers.dev/api/auth/google/callback`

Set `GOOGLE_CLIENT_ID` in `wrangler.jsonc` and store `GOOGLE_CLIENT_SECRET` using
`pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET`. Do not commit the secret.
`AUTH_PROVIDER` must be `google`; `APP_BASE_URL` must match the live origin.
For Node/local Google testing, put the same variables in `.env` and register the
local callback origin too. The development sign-in remains opt-in.

## Rollout

1. Install dependencies and run checks.
2. Apply **both** migrations with `pnpm db:apply:cloudflare`. On October 10,
   the live `banyan-db` had no application tables, so the initial migration is required.
3. Validate with `pnpm build:cloudflare`, then deploy with `pnpm deploy:cloudflare`.
4. Remove the old Cloudflare Access application gate for the Banyan hostname
   when ready to switch. Otherwise Access intercepts users before Google sign-in.
5. Verify Google sign-in, family reads, rejected unauthorized family access,
   logout and rejection of the revoked session.

The repository config now selects account `ee4c08f37c3a62fedc87fbd1b8b96ff4`
and Worker `banyan`. Deployment does not apply migrations automatically.
No existing Clerk or Access account is linked by email; Google subjects use the
`google:` prefix. Existing account migration needs an explicit verified linking
process if data is imported later.

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

## Build toolchain

Use pnpm 10.11.1 (pinned in package.json). The workspace lists the root package
and uses pnpm 10’s `onlyBuiltDependencies` for required install scripts.
Cloudflare installs with `pnpm install --frozen-lockfile`. An `allowBuilds`-only
workspace without `packages` fails on this pnpm version.

## Password-auth rollout and historical demo

Apply `0002_first_madame_masque.sql` with `pnpm db:apply:cloudflare` before the
new Worker deploys. It is additive and keeps existing Google sessions compatible.
Push main for the Cloudflare bot, then verify registration, login, a password
change and rejection of the old session. No new authentication secret is required.

Create the optional private demo through authenticated application APIs:

```bash
BANYAN_BASE_URL=https://banyan.srijan-guchhait.workers.dev node tools/seed-darwin-demo.mjs
```

The script generates credentials once in `.banyan-demo-credentials.json` (ignored
by Git, mode 0600), creates the demo account, and idempotently adds 21 historical
profiles and 31 parent-child relationships. Never print or commit the password.
The file contains the tree URL. `BANYAN_DEMO_CREDENTIALS_FILE` can select a scratch
file for local testing. Family mutations go through server authorization and
normal audit/cycle checks. The demo is private to its own account.
