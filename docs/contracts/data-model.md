# Data Model Contract

PostgreSQL is the canonical transactional data store.

All primary identifiers are opaque UUIDs unless an external authentication subject is explicitly referenced.

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

## Migration policy

Schema changes are made only through versioned migrations.

Destructive migrations require:

- compatibility assessment
- backup/rollback plan
- deployment sequencing notes

## Local login persistence

`account_credentials`: account_id (primary key, Accounts FK, cascade delete), username (unique lowercase), password_hash (PBKDF2-SHA-256), salt (random).

`account_sessions`: token_hash (SHA-256, primary key), account_id (Accounts FK, cascade delete), expires_at (Unix seconds, seven-day lifetime).

These tables are introduced by migration 0001. The existing auth_subject remains a unique internal legacy identifier; local registration generates an opaque local subject and does not match usernames to legacy accounts.
