# Family Social Network

Working title for a private social application centered on family trees, family-member profiles, family-scoped posts, and account-to-account friendships.

## Project status

Version 1.0 is implemented: a Vite + React single-page app (`src/client/`) and a Hono API (`src/server/`, `src/routes/`) on SQLite (libsql locally, Cloudflare D1 in production). See `docs/execution/current-state.md` for exactly what exists and the known gaps.

## Running locally

```bash
pnpm install
cp .env.example .env   # DATABASE_URL=file:./dev.db; do not add NODE_ENV
pnpm db:migrate        # creates dev.db
pnpm dev               # API on :3000, web app on http://localhost:5173
```

Open http://localhost:5173 and use the development sign-in (any user ID works). `pnpm dev` sets `AUTH_DEV_MODE=true`; without it the sign-in route is disabled, which is the default in production.

Checks: `pnpm format:check && pnpm lint && pnpm type-check && pnpm test`.

## Core product idea

A user can create a private family space and build a family tree containing living or deceased people. Not every person in a tree needs to have an application account.

Each family has role-based access:

- **Creator** — owns and administers the family space.
- **Editor** — can add and edit family-tree content.
- **Viewer** — can view and export family information.

The target application also includes:

- family-member profiles
- profile photos
- parent/child relationships
- a visual family tree
- private family posts, comments, and reactions
- a chronological feed with author names, reaction counts, and comment threads
- birthday and remembrance reminders built from existing family-tree dates
- account-to-account friend connections
- family invitations
- family-data export
- auditability for sensitive mutations

## Documentation entry points

Start with:

1. `AGENTS.md`
2. `docs/INDEX.md`
3. `docs/product/product-spec.md`
4. `docs/execution/current-state.md`

Agents must not treat intended behavior in the specification as implemented unless `current-state.md` says so.
