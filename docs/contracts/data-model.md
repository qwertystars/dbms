# Data Model Contract

The implemented transactional store is SQLite/D1 through Drizzle; local development
uses libsql. Identifiers are opaque text IDs generated with `nanoid`, not UUID-validated
values. API identifier schemas accept strings of 1-64 characters.

The record sketches below use logical types (`UUID` means opaque text identifier,
`TIMESTAMPTZ` means an integer timestamp mapped to a JavaScript Date, `DATE` means
ISO date text, and `JSONB` means JSON text). Enum labels describe application/schema
values, not native database enum types. Migration SQL is authoritative for physical
constraints; schema declarations alone do not establish database enforcement.

## Account

```text
accounts
- id UUID PK
- auth_subject TEXT UNIQUE NOT NULL
- display_name TEXT NOT NULL
- avatar_media_id UUID NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
```

`auth_subject` comes from the configured identity provider.

## Family

```text
families
- id UUID PK
- name TEXT NOT NULL
- description TEXT NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL
```

Ownership is represented through Creator membership, not duplicated as a conflicting owner field.

## FamilyMembership

```text
family_memberships
- id UUID PK
- family_id UUID FK families NOT NULL
- account_id UUID FK accounts NOT NULL
- person_id UUID FK people NULL
- role ENUM('CREATOR','EDITOR','VIEWER') NOT NULL
- joined_at TIMESTAMPTZ NOT NULL
- removed_at TIMESTAMPTZ NULL

UNIQUE active (family_id, account_id)
UNIQUE active (family_id, person_id) where person_id is not null
```

Exactly-one-Creator behavior requires transactional application logic plus the strongest feasible database constraint.

## FamilyInvitation

```text
family_invitations
- id UUID PK
- family_id UUID FK families NOT NULL
- created_by_account_id UUID FK accounts NOT NULL
- invited_email TEXT NULL
- role ENUM('EDITOR','VIEWER') NOT NULL
- token_hash TEXT UNIQUE NOT NULL
- expires_at TIMESTAMPTZ NOT NULL
- accepted_at TIMESTAMPTZ NULL
- accepted_by_account_id UUID FK accounts NULL
- revoked_at TIMESTAMPTZ NULL
- created_at TIMESTAMPTZ NOT NULL
```

Never store invitation token plaintext.

## Person

```text
people
- id UUID PK
- family_id UUID FK families NOT NULL
- name TEXT NOT NULL
- gender TEXT NOT NULL
- date_of_birth DATE NULL
- date_of_death DATE NULL
- height_cm NUMERIC NULL
- weight_kg NUMERIC NULL
- address TEXT NULL
- email TEXT NULL
- phone TEXT NULL
- occupation TEXT NULL
- biography TEXT NULL
- profile_media_id UUID FK media_assets NULL
- created_by_account_id UUID FK accounts NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL
```

Constraint:

`date_of_death IS NULL OR date_of_birth IS NULL OR date_of_death >= date_of_birth`

Height and weight units are canonicalized to metric in storage.

## ParentChildRelationship

```text
parent_child_relationships
- id UUID PK
- family_id UUID FK families NOT NULL
- parent_person_id UUID FK people NOT NULL
- child_person_id UUID FK people NOT NULL
- created_by_account_id UUID FK accounts NOT NULL
- created_at TIMESTAMPTZ NOT NULL

CHECK parent_person_id <> child_person_id
UNIQUE(family_id, parent_person_id, child_person_id)
```

Cross-row cycle prevention is enforced transactionally.

## PartnerRelationship

Added in migration `0003_safe_deathstrike`.

```text
partner_relationships
- id UUID PK
- family_id UUID FK families NOT NULL
- person_a_id UUID FK people NOT NULL
- person_b_id UUID FK people NOT NULL
- created_by_account_id UUID FK accounts NOT NULL
- created_at TIMESTAMPTZ NOT NULL

UNIQUE(family_id, person_a_id, person_b_id)  -- partner_family_pair_unique
```

A partner pair is stored once, unordered. The service sorts the two ids so `person_a_id < person_b_id`
before insert. Both `src/db/schema.ts` and migration 0003 enforce
`CHECK person_a_id < person_b_id` (`partner_ordered_pair`). Partnership is symmetric
and never implies parentage.

## PersonClaimRequest

Added in migration `0003_safe_deathstrike`.

```text
person_claim_requests
- id UUID PK
- family_id UUID FK families NOT NULL
- person_id UUID FK people NOT NULL
- membership_id UUID FK family_memberships NOT NULL
- requester_account_id UUID FK accounts NOT NULL
- status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING'
- decided_by_account_id UUID FK accounts NULL
- created_at TIMESTAMPTZ NOT NULL
- decided_at TIMESTAMPTZ NULL

UNIQUE(membership_id) WHERE status = 'PENDING'  -- person_claim_requests_membership_pending
INDEX(family_id, status)                         -- person_claim_requests_family_status
```

A member asks to be linked to a Person. Approval sets `family_memberships.person_id`; it never
changes parent/child or partner records. `decided_by_account_id` is set on approval and rejection.
Cancellation sets `decided_at` but leaves `decided_by_account_id` empty.
Only the active family Creator may approve/reject, including a self-claim.
The partial unique index limits pending requests per membership, not per Person;
competing requests can coexist. Approval rechecks active membership and the live
Person, and the active membership/person index prevents two accounts sharing a
Person link. Self-unlink clears only the membership reference. Person deletion
cancels pending requests while retaining claim history.

## FamilyEvent

Added in migration `0003_safe_deathstrike`.

```text
family_events
- id UUID PK
- family_id UUID FK families NOT NULL
- title TEXT NOT NULL
- description TEXT NULL
- starts_on TEXT NOT NULL           -- YYYY-MM-DD
- start_time TEXT NULL              -- HH:MM, 24-hour
- location TEXT NULL
- created_by_account_id UUID FK accounts NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL

INDEX(family_id, starts_on)  -- family_events_family_starts_on
```

User-created gatherings. Birthdays and remembrances are still derived from `people` and aren't
stored here. Deletion is a soft delete.

## EventRsvp

Added in migration `0003_safe_deathstrike`.

```text
event_rsvps
- event_id UUID FK family_events NOT NULL
- account_id UUID FK accounts NOT NULL
- response ENUM('GOING','MAYBE','NOT_GOING') NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
PRIMARY KEY(event_id, account_id)
```

One current response per account and event. Answering again replaces the response;
clearing removes the row. Active membership is checked by services, not by the
RSVP foreign keys. Soft-deleting an event retains RSVP rows but prevents further
responses and hides the event from lists.

## Post

```text
posts
- id UUID PK
- family_id UUID FK families NOT NULL
- author_account_id UUID FK accounts NOT NULL
- body TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL
```

V1 visibility is always family-private.

## PostMedia

```text
post_media
- post_id UUID FK posts NOT NULL
- media_asset_id UUID FK media_assets NOT NULL
- sort_order INT NOT NULL
PRIMARY KEY(post_id, media_asset_id)
```

## PostPersonTag

Added in migration `0003_safe_deathstrike`.

```text
post_person_tags
- post_id UUID FK posts NOT NULL
- person_id UUID FK people NOT NULL
PRIMARY KEY(post_id, person_id)
INDEX(person_id)  -- post_person_tags_person_id
```

Links a post (a "memory" in the UI) to the family people it mentions. A post may tag at most 20
people, and every tagged person must be a live person in the post's family. Deleting a person
deletes their tag rows.
The API limits the submitted `personIds` array to 20 before service deduplication;
this is not a database CHECK. The composite key prevents duplicate stored tags.
On update, omitted IDs preserve tags, `[]` clears tags, and supplied IDs replace
them. `GET /posts?personId=...` filters through this relation. Tag validation precedes
all writes; post bodies and tag creation/replacement commit together in one batch.

## Comment

```text
comments
- id UUID PK
- post_id UUID FK posts NOT NULL
- author_account_id UUID FK accounts NOT NULL
- body TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL
```

## Reaction

```text
reactions
- post_id UUID FK posts NOT NULL
- account_id UUID FK accounts NOT NULL
- type ENUM('LIKE','LOVE','LAUGH','SAD') NOT NULL
- created_at TIMESTAMPTZ NOT NULL
PRIMARY KEY(post_id, account_id)
```

One current reaction per account/post. Updating a reaction replaces the type.

## FriendRequest

```text
friend_requests
- id UUID PK
- sender_account_id UUID FK accounts NOT NULL
- receiver_account_id UUID FK accounts NOT NULL
- status ENUM('PENDING','ACCEPTED','REJECTED','CANCELLED') NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- resolved_at TIMESTAMPTZ NULL

CHECK sender_account_id <> receiver_account_id
```

Service logic prevents two pending requests for the same unordered pair.

## Friendship

```text
friendships
- account_low_id UUID FK accounts NOT NULL
- account_high_id UUID FK accounts NOT NULL
- created_at TIMESTAMPTZ NOT NULL
PRIMARY KEY(account_low_id, account_high_id)

CHECK account_low_id <> account_high_id
```

Application canonicalizes the pair before insert.

## MediaAsset

```text
media_assets
- id UUID PK
- owner_account_id UUID FK accounts NOT NULL
- family_id UUID FK families NULL
- purpose ENUM('ACCOUNT_AVATAR','PERSON_PROFILE','POST_ATTACHMENT') NOT NULL
- object_key TEXT UNIQUE NOT NULL
- mime_type TEXT NOT NULL
- byte_size BIGINT NOT NULL
- sha256 TEXT NULL
- status ENUM('PENDING','READY','DELETING','DELETED') NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- ready_at TIMESTAMPTZ NULL
```

## AuditEvent

```text
audit_events
- id UUID PK
- family_id UUID FK families NULL
- actor_account_id UUID FK accounts NULL
- action TEXT NOT NULL
- target_type TEXT NOT NULL
- target_id UUID NULL
- summary JSONB NOT NULL
- request_id TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL
```

Audit summaries must avoid unnecessary sensitive values.

## Indexing baseline

At minimum index:

- `family_memberships(account_id, removed_at)`
- `people(family_id, deleted_at)`
- `parent_child_relationships(parent_person_id)`
- `parent_child_relationships(child_person_id)`
- `posts(family_id, created_at DESC)`
- `comments(post_id, created_at)`
- `friend_requests(receiver_account_id, status)`
- `audit_events(family_id, created_at DESC)`
- `partner_relationships(family_id, person_a_id, person_b_id)` (unique)
- `person_claim_requests(membership_id)` where `status = 'PENDING'` (partial unique)
- `person_claim_requests(family_id, status)`
- `family_events(family_id, starts_on)`
- `post_person_tags(person_id)`

## Migration policy

Schema changes are made only through versioned migrations.

Destructive migrations require:

- compatibility assessment
- backup/rollback plan
- deployment sequencing notes

## Authentication persistence

`oauth_attempts`: state_hash (PK), nonce, verifier, return_to, expires_at (Unix
seconds). Single-use, 10-minute lifetime; DELETE RETURNING claims callbacks.
`auth_sessions`: token_hash (PK), subject, display_name, expires_at (Unix seconds).
Stores no raw browser session token or Google tokens; seven-day fixed lifetime.
Migration: `0001_busy_stepford_cuckoos.sql`.

## Password credentials and authentication throttles

Migration `0002_first_madame_masque.sql` adds `account_credentials` (one row per
account, cascade-delete FK; unique normalized username and auth subject; salted
password hash, credential version, Unix update time) and `login_attempts`
(hashed throttle key, count, Unix expiry). `auth_sessions` gains
`credential_version` (default 0) and `created_at` (Unix seconds, default 0).
Old Google sessions remain valid but must reauthenticate before initial password
setup. Credential changes atomically update the hash/version, revoke prior
session rows, and insert an audit record. A conditional non-null audit action
rolls back a failed optimistic credential update. Session-version checks also
reject a stale login that races with credential revocation.
