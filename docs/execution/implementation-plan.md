# Implementation Plan

The plan is ordered to establish data integrity and authorization before social features.

## Phase 0 — Repository and quality scaffold

Deliver:

- TypeScript application scaffold
- PostgreSQL development environment
- Drizzle migration setup
- Zod contract layer
- formatter/lint/type-check
- unit/integration test harness
- CI pipeline
- environment schema
- structured request logging

Exit criteria:

- clean clone can install, migrate, start, and test
- CI runs all baseline checks
- no secrets committed

## Phase 1 — Authentication and accounts

Implement:

- auth provider integration
- internal Account creation/link
- authenticated request context
- `/api/v1/me`

Tests:

- unauthenticated rejection
- valid subject mapping
- duplicate subject handling

## Phase 2 — Families, memberships, roles, invitations

Implement:

- Family
- FamilyMembership
- FamilyInvitation
- Creator creation invariant
- invitation acceptance
- role policy layer
- ownership transfer

Required tests:

- family creation atomicity
- exactly one Creator
- Viewer/Editor/Creator permission matrix
- invitation expiry
- single-use invitation
- duplicate acceptance idempotency
- cross-family denial

## Phase 3 — Person profiles

Implement:

- Person schema
- create/read/update/delete
- field validation
- date rules
- profile photo reference support
- optional membership-to-person linking

Required tests:

- required fields
- DOB/DOD rule
- Editor cannot delete Person
- Viewer cannot edit
- cross-family person isolation

## Phase 4 — Family tree

Implement:

- parent/child edge schema
- add/remove edge APIs
- recursive ancestor/descendant queries
- cycle detection
- tree projection endpoint
- basic tree UI

Required tests:

- self-edge rejection
- duplicate rejection
- 2-hop and deeper cycle rejection
- concurrent cycle attempt
- same-family enforcement
- multi-parent rendering

## Phase 5 — Media

Implement:

- media metadata
- upload intent
- presigned upload
- completion
- private access
- profile photo integration

Required tests:

- MIME/size validation
- ownership
- invalid purpose
- incomplete upload
- foreign-family media reference rejection

## Phase 6 — Family social feed

Implement:

- posts
- comments
- reactions
- cursor pagination
- family feed UI
- Creator moderation

Required tests:

- only members can read/write
- former member cannot access
- author edit/delete
- Creator moderation
- reaction idempotency

## Phase 7 — Friends panel

Implement:

- account discovery limited to necessary profile data
- friend request
- accept/reject/cancel
- friendship list
- unfriend

Required tests:

- no self requests
- no duplicate pending pair
- symmetric accepted friendship
- friendship does not grant family access

## Phase 8 — Export

Implement:

- JSON family export
- CSV family export
- explicit audit entry
- download UI

Required tests:

- role access
- isolation
- correct people/relationship representation
- deleted/tombstoned content policy

## Phase 9 — Hardening and release readiness

Implement/verify:

- rate limits
- security headers
- CSRF/session configuration
- backup procedure
- restore drill
- observability dashboards/alerts
- accessibility pass
- performance test for large family tree
- dependency/security scan

## Deferred feature gate

Do not add these unless requirements change:

- DMs
- public feed
- spouse relationship type
- per-field privacy beyond the field groups of CAP-PRIVACY-01
- visual PDF export
- external genealogy import
- AI features

## Definition of done for every phase

A phase is complete only when:

1. behavior is implemented
2. migrations are versioned
3. relevant automated tests pass
4. API/data contracts are synchronized
5. observability exists for failure-prone paths
6. `current-state.md` is updated
7. any architectural deviation is captured in an ADR
