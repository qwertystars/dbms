# Testing Strategy

## Principles

Test the rules that would be expensive or dangerous to rediscover:

- authorization
- family isolation
- ancestry correctness
- deletion behavior
- transactional invariants

Prefer real PostgreSQL integration tests for database-dependent behavior.

## Client tests

`tests/client/` runs in jsdom (`environmentMatchGlobs` in `vitest.config.ts`) with small
browser-API shims in `tests/client/dom.ts`. They cover the family map: graph indexing,
expansion and collapse by reachability, shared descendants, deterministic non-overlapping
layout, camera maths, keyboard navigation, touch versus mouse preview, reduced motion, error
recovery, stale-response isolation and role-dependent controls. The API is mocked at `fetch`.

## Unit tests

Use for:

- profile validation
- role capability mapping
- friendship pair canonicalization
- invitation expiry logic
- error mapping
- pure tree helpers

## Database integration tests

Use a disposable real PostgreSQL database.

Required coverage:

### TEST-FAMILY-01

Family creation produces one Creator membership atomically.

### TEST-AUTHZ-01

A non-member cannot read another family's people/tree/posts.

### TEST-AUTHZ-02

Friendship does not grant family access.

### TEST-ROLE-01

Viewer cannot mutate tree/profile.

### TEST-ROLE-02

Editor cannot delete Person or manage members.

### TEST-TREE-01

Self-parent edge rejected.

### TEST-TREE-02

Duplicate edge rejected.

### TEST-TREE-03

Direct cycle rejected.

### TEST-TREE-04

Multi-hop cycle rejected.

### TEST-TREE-05

Cross-family edge rejected.

### TEST-TREE-06

Concurrent edge mutations cannot commit a cycle.

### TEST-PERSON-01

DOD before DOB rejected.

### TEST-INVITE-01

Expired invitation rejected.

### TEST-INVITE-02

Accepted invitation cannot create duplicate membership.

### TEST-FRIEND-01

Same account cannot friend itself.

### TEST-FRIEND-02

Accepted friendship is stored as one canonical pair.

## API contract tests

For every operation verify:

- request schema
- success response schema
- error envelope
- auth requirement
- role requirement

OpenAPI generation, if used, must be checked for drift in CI.

## End-to-end flows

### E2E-01 — Build a family

1. user signs in
2. creates family
3. adds two people
4. adds parent/child relationship
5. tree renders
6. creates an Editor invitation
7. Editor edits a profile
8. Viewer sees but cannot edit

### E2E-02 — Social

1. family member posts
2. another member comments/reacts
3. author edits post
4. non-member cannot fetch it

### E2E-03 — Friendship isolation

1. A and B become friends
2. A belongs to Family X
3. B does not
4. B cannot access Family X

## Property/fuzz testing

Useful for ancestry:

Generate random acyclic graphs, attempt random edge additions, and assert committed graph remains acyclic.

## Performance tests

Before release test:

- family with 1,000 people
- dense realistic parent/child relationships
- tree endpoint
- ancestor/descendant query
- family feed pagination

The target is predictable response time without loading unrelated families.

## Security tests

Include:

- IDOR/cross-family resource IDs
- role escalation attempts
- invitation token replay
- upload metadata tampering
- XSS payloads in text fields
- oversized payloads
