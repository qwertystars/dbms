# Invariants

These properties must remain true regardless of UI behavior.

## INV-FAMILY-01 — Exactly one creator

**Statement:** Every active Family has exactly one active Creator membership.

**Scope:** Family, FamilyMembership

**Enforced by:**

- transactional family creation/ownership transfer
- database uniqueness where feasible
- service-layer validation

**Verification:** integration tests for create, transfer, member removal.

## INV-AUTHZ-01 — Family isolation

**Statement:** An account must never read or mutate private data belonging to a family without an active membership, except narrowly scoped invitation flows.

**Enforced by:**

- server authorization policy
- family-scoped repository queries
- API integration tests

**Verification:** negative cross-family tests.

## INV-AUTHZ-02 — Friendship is not access

**Statement:** Friendship alone must never authorize access to another account's family-private data.

**Verification:** friend-without-membership API tests.

## INV-PERSON-01 — Person belongs to one family

**Statement:** Each Person belongs to exactly one Family.

**Verification:** foreign-key and service tests.

## INV-PERSON-02 — Valid life dates

**Statement:** If both dates are present, `date_of_death >= date_of_birth`.

**Enforced by:** database CHECK where feasible + validation.

## INV-TREE-01 — No self edges

**Statement:** `parent_person_id != child_person_id`.

**Enforced by:** database CHECK + service validation.

## INV-TREE-02 — No duplicate edges

**Statement:** A given `(family_id, parent_person_id, child_person_id)` edge is unique.

**Enforced by:** UNIQUE constraint.

## INV-TREE-03 — Acyclic ancestry

**Statement:** The parent/child graph inside one family must remain acyclic.

**Enforced by:** transactional cycle detection before edge insertion/update.

**Verification:**

- direct cycle
- multi-hop cycle
- concurrent insertion tests

## INV-TREE-04 — Same-family edges

**Statement:** Parent and child in an ancestry edge belong to the edge's Family.

**Enforced by:** service transaction and database design.

## INV-MEMBER-01 — One membership per family/account

**Statement:** An account has at most one active membership row per family.

**Enforced by:** UNIQUE `(family_id, account_id)`.

## INV-MEMBER-02 — Optional person link is one-to-one per family

**Statement:** At most one active family membership may be linked to a given Person.

**Reason:** A family-tree person should not be claimed by two application accounts.

**Enforced by:** partial unique index on active `(family_id, person_id)` and
approval-time service checks. The optional link is membership-scoped, not an
Account/Person identity merge.

## INV-PARTNER-01 — Unique symmetric same-family pair

**Statement:** A partner link joins two distinct live people in one family, is
stored in canonical ID order, and is unique regardless of input order.
It never implies ancestry or participates in ancestry cycle detection.

**Enforced by:** Creator/Editor service authorization, live same-family validation,
ID sorting, and unique `(family_id, person_a_id, person_b_id)`.
The schema and migration `0003_safe_deathstrike.sql` enforce the
`partner_ordered_pair` CHECK, rejecting self-pairs and noncanonical order.

## INV-CLAIM-01 — Explicit Creator approval

**Statement:** Requesting a link cannot assign `personId`. Only an active Creator's
approval of a pending request may link an active unlinked membership to a live,
same-family Person not linked to another active membership. This grants no role
and mutates no graph edges. Creator self-claims also require an explicit decision.

## INV-CLAIM-02 — Request scope and lifecycle

**Statement:** At most one pending claim exists per membership. Only pending
requests may be decided or cancelled. Only the requester may cancel; only the
Creator may decide. Creator lists are pending-only across the family; other
members see only their own history. Unlinking is self-only.

**Enforced by:** service membership/ownership checks, partial unique
pending-membership index, and conditional `PENDING` transitions inside atomic
batches. Approval links only while the request is pending and both targets are
still eligible; unsuccessful transitions cannot leave decision audits.

## INV-FRIEND-01 — No self-friendship

**Statement:** An Account cannot have a friendship or friend request with itself.

## INV-FRIEND-02 — Unique symmetric friendship

**Statement:** There is at most one accepted friendship for an unordered pair of accounts.

**Enforced by:** canonical account pair ordering + UNIQUE constraint.

## INV-POST-01 — Post author was authorized at creation

**Statement:** A post can be created only by an active member of its family.

## INV-POST-02 — Same-family memory tags

**Statement:** API create/update accepts at most 20 submitted `personIds`; stored
tags are unique per post/person and reference live people in that post's family.
Only authors may edit tags; a person filter never bypasses family membership.

**Enforced by:** Zod array limit, service deduplication/live-family validation,
composite primary key, and person-deletion cleanup. The limit and same-family
rule are application checks, not database CHECK constraints. Post body and tag
updates share an atomic batch after validation.

## INV-EVENT-01 — Event ownership and RSVP isolation

**Statement:** Only active members may read/create family events or respond.
Only the author may edit; author or Creator may soft-delete. Only the caller's
own RSVP may be replaced/cleared, with one response per event/account.

**Enforced by:** membership and ownership checks, live family-scoped event lookup,
Zod response enum, and composite RSVP primary key.

**Verification for partner, claim, event and tag rules:** API regression cases in
`tests/graph-features.test.ts`, including role/outsider denials, cross-family
partner/tag rejection, duplicate/conflicting claims and deletion cleanup.

## INV-MEDIA-01 — Media ownership is explicit

**Statement:** Every application media object must have a database metadata record tying it to an owner and purpose before it becomes referenced by visible content.

## INV-MEDIA-02 — Family media is never served outside the family

**Statement:** Media with a `familyId` is returned only to its owner or an active member of that family.

**Enforced by:** `getContent` in `src/modules/media/service.ts`; tests in `tests/production.test.ts` (non-member and friend both get `404`).

## INV-AUDIT-01 — Sensitive structural changes are traceable

**Statement:** Role, ownership, destructive person/tree, and family-deletion operations must produce an audit event on success.

## Current compliance

The application is implemented; enforcement is split between service checks,
schema constraints and migration SQL. Do not infer full compliance from a schema
declaration alone. This branch adds partner, claim, event/RSVP and memory-tag
coverage in `tests/graph-features.test.ts`; this documentation-only pass read those
tests but did not execute them. Known enforcement gaps are recorded in
`docs/execution/current-state.md`.

## Direct Google authentication (October 11, 2026)

Production sign-in uses Google's authorization-code OAuth flow with PKCE,
state and nonce, and verified ID tokens. Banyan stores hashed opaque sessions
in D1 and revokes them on logout. Accounts use stable `google:`-prefixed
subjects, distinct from family-tree people. Email never grants or links family
access. Sessions expire after seven days. New migrations add `oauth_attempts`
and `auth_sessions`. Google OAuth is deployed.

## Username/password accounts (October 11, 2026)

Google OAuth and username/password sign-in coexist. New accounts can register
with a display name, a unique case-insensitive username (3–32 ASCII characters,
starting with a letter, then letters/digits/underscores), and a password of
12–128 characters. Passwords are not trimmed. Family-tree profiles stay separate
from accounts, and registering never grants family access.

An authenticated Google account can add credentials to its existing account
within ten minutes of signing in with Google. This does not create a second
account or change family memberships. No account is linked by email or by a
username entered at sign-in. Existing credentials can be changed only after
verifying the current password; changes require a new password. Credential
mutations are audited without usernames or passwords in the audit summary.

Passwords use independently salted scrypt (N=16384, r=8, p=5, 32-byte output).
Password routes use same-origin JSON requests and persistent D1 attempt limits:
30 per IP and 15 per normalized username in 15 minutes. Failed logins use a
generic error and perform a real KDF for unknown usernames too. Credential
changes invalidate all earlier app sessions, including Google sessions, through
an incrementing version, and issue a replacement cookie for the current browser.
Raced logins with older credential versions cannot authenticate. Password hashes
are never returned by the API. Password recovery is not implemented in this slice.
