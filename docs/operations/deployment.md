# Deployment

The `banyan` Cloudflare Worker serves the Hono API and Vite SPA, using the existing D1 `DB`, R2 `MEDIA_BUCKET`, assets and `RATE_LIMITER` bindings in `wrangler.jsonc`.

## Configuration

Only `APP_BASE_URL` is required as a production variable. Node development also uses `DATABASE_URL` and optional `PORT` from `.env`. There are no external authentication variables or provider secrets.

## Deploy the local login change

1. Install dependencies with `pnpm install`.
2. Run `pnpm build:cloudflare` and apply migration 0001 with `pnpm db:apply:cloudflare`.
3. Deploy with `pnpm deploy:cloudflare`.
4. Disable or remove the existing Banyan self-hosted application in Cloudflare Zero Trust → Access → Applications for `banyan.srijan-guchhait.workers.dev`. This is a separate infrastructure change: removing provider code does not disable the Access gate.
5. Open `/sign-in`, create an account, verify login and logout.

Existing provider accounts and family data are preserved, but are not automatically linked to new usernames. Existing users need a separately verified credential migration before they can access their old accounts. Password reset and account linking are not implemented.

## Local development

Copy `.env.example` to `.env`, run `pnpm db:migrate`, then `pnpm dev`. Open `http://localhost:5173` and create an account. Vite preserves the browser Host header when proxying `/api` so same-origin login checks work.

For Workers preview: `pnpm db:apply:local` then `pnpm preview:cloudflare`. Both runtimes use the same password login.

## Routine deployment

```bash
pnpm build:cloudflare
pnpm db:apply:cloudflare
pnpm deploy:cloudflare
```

A staging environment should use separate D1 and R2 resources; sessions are isolated by their database.
