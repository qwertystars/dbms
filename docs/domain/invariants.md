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

## INV-FRIEND-01 — No self-friendship

**Statement:** An Account cannot have a friendship or friend request with itself.

## INV-FRIEND-02 — Unique symmetric friendship

**Statement:** There is at most one accepted friendship for an unordered pair of accounts.

**Enforced by:** canonical account pair ordering + UNIQUE constraint.

## INV-POST-01 — Post author was authorized at creation

**Statement:** A post can be created only by an active member of its family.

## INV-MEDIA-01 — Media ownership is explicit

**Statement:** Every application media object must have a database metadata record tying it to an owner and purpose before it becomes referenced by visible content.

## INV-AUDIT-01 — Sensitive structural changes are traceable

**Statement:** Role, ownership, destructive person/tree, and family-deletion operations must produce an audit event on success.

## Current compliance

Project is greenfield and unimplemented. Therefore all implementation-dependent invariants are currently **NOT YET ENFORCED**, not "violated by an existing system".
