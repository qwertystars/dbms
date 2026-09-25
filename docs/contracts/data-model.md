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
- close_family_degree INTEGER NOT NULL DEFAULT 3
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
- education TEXT NULL
- city TEXT NULL
- skills TEXT NULL -- "can help with"
- biography TEXT NULL
- field_visibility JSON NULL -- per field-group overrides, e.g. {"contact":"MAINTAINERS"}
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
- audience TEXT NOT NULL DEFAULT 'FAMILY' -- FAMILY | CLOSE
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL
```

Posts are always family-private. `CLOSE` narrows them further to the author's close family (RULE-CIRCLE-04).

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

## HelpRequest

```text
help_requests
- id UUID PK
- family_id UUID FK families NOT NULL
- author_account_id UUID FK accounts NOT NULL
- kind TEXT NOT NULL -- REQUEST | OFFER
- category TEXT NOT NULL
- title TEXT NOT NULL
- body TEXT NULL
- audience TEXT NOT NULL DEFAULT 'FAMILY'
- status TEXT NOT NULL DEFAULT 'OPEN' -- OPEN | RESOLVED | CLOSED
- created_at, updated_at TIMESTAMPTZ NOT NULL
- resolved_at, deleted_at TIMESTAMPTZ NULL
```

## HelpResponse

```text
help_responses
- id UUID PK
- help_request_id UUID FK help_requests NOT NULL
- author_account_id UUID FK accounts NOT NULL
- body TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- deleted_at TIMESTAMPTZ NULL
```

## DnaMatch

```text
dna_matches
- id UUID PK
- account_low_id UUID FK accounts NOT NULL
- account_high_id UUID FK accounts NOT NULL
- reporter_account_id UUID FK accounts NOT NULL
- provider TEXT NOT NULL
- shared_cm REAL NOT NULL
- shared_segments INTEGER NULL
- note TEXT NULL
- status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING | CONFIRMED
- created_at TIMESTAMPTZ NOT NULL
- confirmed_at TIMESTAMPTZ NULL

UNIQUE(account_low_id, account_high_id)
```

The pair is canonically ordered like `friendships`. No raw genetic data is stored.

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
- `help_requests(family_id, status)`
- `help_responses(help_request_id)`
- `dna_matches(account_high_id)`

## Migration policy

Schema changes are made only through versioned migrations.

Destructive migrations require:

- compatibility assessment
- backup/rollback plan
- deployment sequencing notes
