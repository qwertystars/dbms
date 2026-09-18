# Backend Architecture

## Architecture style

Use a **modular monolith** for v1.

This project does not need microservices. Family trees, authorization, social content, and friendships share transactional data and are easier to keep correct in one application boundary.

Target stack:

- TypeScript
- Vite + React single-page application (client)
- Hono HTTP API (Node.js server locally, Cloudflare Workers in deployment)
- SQLite locally (libsql) / Cloudflare D1 in deployment
- Drizzle ORM/migrations
- Zod schemas for request/response validation
- generated OpenAPI from the API contract layer where practical
- S3-compatible object storage or Cloudflare R2 for media
- OIDC/OAuth-capable authentication integration

Exact hosting vendor is intentionally not part of domain semantics.

## Major modules

### Auth

Responsibilities:

- authentication session integration
- map external identity to internal Account
- expose authenticated account context

Does not decide family permissions by itself.

### Families

Responsibilities:

- create family
- membership
- roles
- invitations
- ownership transfer
- family deletion

Owns:

- families
- family_memberships
- family_invitations

### People

Responsibilities:

- person profile CRUD
- account-to-person claim/link
- profile field validation

Owns:

- people

### Tree

Responsibilities:

- parent/child edges
- cycle detection
- ancestor/descendant queries
- tree projection for UI

Owns:

- parent_child_relationships

### Social

Responsibilities:

- family posts
- comments
- reactions
- moderation rules

Owns:

- posts
- comments
- reactions

### Friends

Responsibilities:

- friend request lifecycle
- accepted friendships

Owns:

- friend_requests
- friendships

### Media

Responsibilities:

- upload authorization
- object-key generation
- upload completion
- media metadata
- deletion scheduling

Owns:

- media_assets

### Audit

Responsibilities:

- append audit events for sensitive successful mutations

Owns:

- audit_events

## Request flow

Typical family mutation:

1. HTTP request enters route handler.
2. Request schema is validated.
3. Authentication resolves internal Account.
4. Family authorization policy loads active membership.
5. Application service executes domain rules.
6. Repository writes inside a transaction when required.
7. Audit event is appended inside or immediately after the successful transaction according to consistency need.
8. Response is serialized through a contract schema.

Routes must not contain business logic beyond request adaptation.

## Authorization model

Authorization is family-scoped.

A reusable policy API should expose capabilities such as:

- `canViewFamily(accountId, familyId)`
- `canEditTree(accountId, familyId)`
- `canDeletePerson(accountId, familyId)`
- `canManageMembers(accountId, familyId)`

Do not scatter role string comparisons across route handlers.

## Tree queries

Family ancestry is stored as adjacency-list edges.

Use recursive PostgreSQL CTEs for:

- ancestors of one person
- descendants of one person
- cycle check before insertion
- subtree projection

For whole-family tree rendering, load only the selected family.

## Cycle-safe edge insertion

Edge creation must occur in a transaction:

1. lock or otherwise serialize the relevant relationship mutation scope sufficiently to avoid two concurrent edges creating a cycle
2. verify both people belong to the family
3. reject self-edge
4. query whether child already reaches parent
5. insert unique edge
6. append audit event
7. commit

Concurrency handling must be covered by integration tests. Application-only prechecks without transactional protection are insufficient.

## Transactions

Use transactions for:

- family creation + creator membership
- ownership transfer
- invitation acceptance
- person deletion + relationship cleanup
- ancestry edge mutation
- friendship acceptance
- family deletion/tombstoning

## Media flow

1. Client requests upload intent.
2. Server validates authenticated actor, purpose, MIME type, and size.
3. Server creates a pending MediaAsset with server-generated object key.
4. Server returns a short-lived presigned upload URL.
5. Client uploads directly to object storage.
6. Client calls completion endpoint.
7. Server verifies expected object metadata when supported.
8. Asset becomes attachable.

## Caching

Do not cache authorization decisions across users.

V1 may use normal HTTP/application caching for immutable media and low-risk derived responses.

Avoid introducing Redis until measured traffic or workload justifies it.

## Background processing

No queue is required for v1 core behavior.

Potential future queued jobs:

- large family exports
- object-storage cleanup
- email invitations
- media processing

If a queue is introduced, jobs must be idempotent.

## Error model

Return structured errors:

```json
{
  "error": {
    "code": "TREE_CYCLE",
    "message": "This relationship would create an ancestry cycle.",
    "requestId": "..."
  }
}
```

Do not leak:

- SQL errors
- object-storage credentials
- authorization internals
- invitation token hashes

## Rate limiting

Apply stricter limits to:

- authentication-sensitive routes
- invitation creation
- friend requests
- media upload intents
- export endpoints

Rate limiting is supplementary. It never replaces authorization.

## Secrets

Secrets are environment-provided and never committed.

Expected categories:

- database URL
- auth/OIDC secrets
- object-storage credentials
- application base URL
- optional email provider credentials

## Repository structure

Suggested structure:

```text
src/
  app/
  modules/
    auth/
    families/
    people/
    tree/
    social/
    friends/
    media/
    audit/
  shared/
    errors/
    validation/
    observability/
db/
  migrations/
  schema/
tests/
  unit/
  integration/
  e2e/
docs/
```

Each module should expose its application interface and hide persistence details.

## Failure containment

- A failed social post must not affect tree data.
- A failed media upload must leave at most a cleanup-eligible pending media row.
- Failed invitation notification must not create unauthorized membership.
- Failed tree mutation must roll back both relation change and corresponding transactional audit record where those are coupled.
