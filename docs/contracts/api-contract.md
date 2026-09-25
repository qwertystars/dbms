# API Contract

Base path:

`/api/v1`

All private endpoints require an authenticated Account.

Canonical machine-readable schemas should be implemented with Zod and exposed as generated OpenAPI where practical.

## Error envelope

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "requestId": "req_..."
  }
}
```

## Families

### API-FAMILY-01 — Create family

`POST /families`

Body:

```json
{
  "name": "Guchhait Family",
  "description": "Optional"
}
```

Creates Family + Creator membership atomically.

### API-FAMILY-02 — List my families

`GET /families`

### API-FAMILY-03 — Get family

`GET /families/{familyId}`

Role: Creator/Editor/Viewer.

### API-FAMILY-04 — Update family

`PATCH /families/{familyId}`

Role: Creator.

Body fields are all optional: `name`, `description`, and `closeFamilyDegree` (integer 1–6, the kinship degree up to which relatives count as close family).

### API-FAMILY-05 — Delete family

`DELETE /families/{familyId}`

Role: Creator.

Requires explicit confirmation token/field to prevent accidental deletion.

## Memberships and invitations

### API-INVITE-01

`POST /families/{familyId}/invitations`

Role: Creator.

Body:

```json
{
  "email": "optional@example.com",
  "role": "EDITOR"
}
```

### API-INVITE-02

`POST /invitations/{token}/accept`

Authenticated account.

### API-MEMBER-01

`GET /families/{familyId}/members`

Role: any family member.

### API-MEMBER-02

`PATCH /families/{familyId}/members/{membershipId}`

Role: Creator.

Used for `EDITOR <-> VIEWER` changes.

Creator transfer uses a dedicated operation.

### API-MEMBER-03

`DELETE /families/{familyId}/members/{membershipId}`

Role: Creator.

### API-MEMBER-05 — Link a member to their person

`PUT /families/{familyId}/members/{membershipId}/person`

Role: Creator.

```json
{ "personId": "..." }
```

`personId: null` removes the link. `409 PERSON_NOT_IN_FAMILY` when the person is not a live person of this family; `409 CONFLICT` when another member is already linked to that person. Audited as `MEMBERSHIP_PERSON_LINKED`.

### API-MEMBER-04

`POST /families/{familyId}/transfer-ownership`

Role: Creator.

Body:

```json
{
  "newCreatorMembershipId": "..."
}
```

## People

### API-PERSON-01

`POST /families/{familyId}/people`

Role: Creator/Editor.

### Person representation

Every endpoint that returns people (person, people list, tree, export) serializes them for the requesting member (RULE-PRIVACY-03):

- fields in groups hidden from the viewer are `null`, and their names are listed in `hiddenFields`
- `birthYear` is always present when a birth date exists
- `kinship`: `{ label, degree, byMarriage, circle }` relative to the viewer, where `circle` is `SELF`, `CLOSE`, `FAR` or `UNKNOWN`
- `fieldVisibility`: the effective level per group (`work`, `biography`, `birthday`, `contact`, `address`, `body`), sent only to maintainers and to the account linked to that person

Person bodies accept `education`, `city` and `skills` in addition to the v1 fields, plus `fieldVisibility` (a partial map of group to `FAMILY` | `CLOSE` | `MAINTAINERS`; overrides merge).

### API-PERSON-02

`GET /families/{familyId}/people?search=...`

Role: any family member.

Each person also carries `member` (`{ accountId, displayName }` of the linked account, or `null`). `search` matches name, occupation, education, city and skills, but only values visible to the requester.

### API-PERSON-03

`GET /families/{familyId}/people/{personId}`

Role: any family member.

### API-PERSON-04

`PATCH /families/{familyId}/people/{personId}`

Role: Creator/Editor, or the account linked to this person for the self-service fields only (occupation, education, city, skills, email, phone, address, biography, fieldVisibility). Other fields from a self-service caller return `403`. A `fieldVisibility` change is audited as `PERSON_PRIVACY_UPDATED`.

### API-PERSON-05

`DELETE /families/{familyId}/people/{personId}`

Role: Creator only.

## Tree

### API-TREE-01 — Get family tree

`GET /families/{familyId}/tree`

Optional query:

- `rootPersonId`
- `direction=ancestors|descendants|both` (default `both`; any other value is `400`)
- `depth` integer 1-100 (default 100), the number of generations to walk from the root

Response contains normalized `people[]` and `edges[]`.

- Without `rootPersonId`: every non-deleted person in the family, including people with no relationships, and every edge between them. `direction` and `depth` are ignored.
- With `rootPersonId`: the root plus its ancestors and/or descendants up to `depth` generations, and the edges between the returned people. Unknown or deleted root is `404`.

### API-TREE-02 — Add parent/child edge

`POST /families/{familyId}/relationships/parent-child`

Role: Creator/Editor.

Body:

```json
{
  "parentPersonId": "...",
  "childPersonId": "..."
}
```

Possible domain errors:

- `PERSON_NOT_IN_FAMILY`
- `TREE_SELF_EDGE`
- `TREE_DUPLICATE_EDGE`
- `TREE_CYCLE`

### API-TREE-03 — Remove parent/child edge

`DELETE /families/{familyId}/relationships/parent-child/{relationshipId}`

Role: Creator/Editor.

## Export

### API-EXPORT-01

`GET /families/{familyId}/export?format=json`

or

`format=csv`

Role: any family member in v1.

Export includes only data visible to the requesting account.

## Family social feed

### API-POST-01

`POST /families/{familyId}/posts`

Role: any family member.

```json
{ "body": "...", "audience": "FAMILY" }
```

`audience` is `FAMILY` (default) or `CLOSE`. `CLOSE` requires the author to be linked to a person (`400 VALIDATION` otherwise). A `CLOSE` post, its comments and reactions answer `404` to members outside the author's close family (RULE-CIRCLE-04). `PATCH` accepts the same body.

### API-POST-02

`GET /families/{familyId}/posts?cursor=...&limit=...`

Role: any family member.

Cursor pagination required. `limit` defaults to 20 (max 50). The cursor combines the post
timestamp and id, so posts created within the same second are not skipped. Each post
includes `author` (id and displayName), `reactionCounts`, `commentCount`, and the
requesting account's `myReaction`.

### API-POST-03

`PATCH /families/{familyId}/posts/{postId}`

Author, or Creator for moderation where the operation is explicitly supported.

### API-POST-04

`DELETE /families/{familyId}/posts/{postId}`

Author or Creator.

### API-COMMENT-01

`POST /families/{familyId}/posts/{postId}/comments`

### API-COMMENT-02

`PATCH /families/{familyId}/comments/{commentId}`

Author.

### API-COMMENT-03

`DELETE /families/{familyId}/comments/{commentId}`

Author or Creator.

### API-REACT-01

`PUT /families/{familyId}/posts/{postId}/reaction`

Body:

```json
{
  "type": "LIKE"
}
```

### API-REACT-02

`DELETE /families/{familyId}/posts/{postId}/reaction`

## Events

### API-EVENT-01

`GET /events/upcoming?days=45`

Role: any authenticated account.

Returns birthdays and memorial anniversaries from every family the account belongs to,
within the next `days` days (1-365, default 45), sorted by `daysUntil`. Each event includes
`familyId`, `familyName`, `personId`, `personName`, `type` (`birthday` or `memorial`),
`date`, `daysUntil`, and `age` (turning age or years since passing, when known).

## Help board

### API-HELP-01

`GET /families/{familyId}/help?status=OPEN|RESOLVED|CLOSED&kind=REQUEST|OFFER`

Role: any family member. Returns `items`, newest first, each with `author` (`id`, `displayName`, `personId`, `kinship` label relative to the requester) and `responses`. Close-family items outside the requester's circle are omitted.

### API-HELP-02

`POST /families/{familyId}/help`

Role: any family member.

```json
{
  "kind": "REQUEST",
  "category": "ADVICE | CAREER | EDUCATION | HEALTH | HOUSING | TRAVEL | CARE | OTHER",
  "title": "...",
  "body": "...",
  "audience": "FAMILY"
}
```

### API-HELP-03

`PATCH /families/{familyId}/help/{helpId}`

Role: author. Optional `title`, `body`, `category`, `status` (`OPEN`, `RESOLVED`, `CLOSED`).

### API-HELP-04

`DELETE /families/{familyId}/help/{helpId}`

Role: author or Creator. Soft delete, audited as `HELP_REQUEST_DELETED`.

### API-HELP-05

`POST /families/{familyId}/help/{helpId}/responses` with `{ "body": "..." }`

Role: any member who can see the item. `409 CONFLICT` once the item is not open.

`DELETE /families/{familyId}/help/{helpId}/responses/{responseId}`: reply author or Creator.

## DNA matches (beta)

### API-DNA-01

`GET /dna/matches`

Returns the requester's matches: `otherAccount`, `direction` (`OUTGOING` or `INCOMING`), `status` (`PENDING` or `CONFIRMED`), `provider`, `sharedCm`, `sharedSegments`, `note`, and `estimate` (`likely` relationships and a `confidence`).

### API-DNA-02

`POST /dna/matches`

```json
{
  "accountId": "...",
  "provider": "ANCESTRY | TWENTY_THREE_AND_ME | MYHERITAGE | FTDNA | GEDMATCH | OTHER",
  "sharedCm": 870,
  "sharedSegments": 31,
  "note": "..."
}
```

`sharedCm` is 0–7,500. `400` for a self-match, `404` for an unknown account, `409` when the pair already has a match.

### API-DNA-03

`POST /dna/matches/{matchId}/confirm`: the non-reporting account only (`403` for the reporter, `404` for anyone else).

### API-DNA-04

`DELETE /dna/matches/{matchId}`: either account. Deletes the row (decline, cancel or withdraw consent).

## Friends

### API-FRIEND-01

`POST /friends/requests`

Body:

```json
{
  "accountId": "..."
}
```

Returns `201` with `{ request, accepted: false }`. If the receiver already has a pending request to the sender, that request is accepted instead and the response is `{ request, friendship, accepted: true }`. Unknown `accountId` is `404`; sending to yourself is `409 FRIEND_SELF`.

### API-FRIEND-02

`GET /friends/requests`

Pending requests sent or received by the caller. Each request also includes `sender` and `receiver` objects of the form `{ id, displayName }`.

### API-FRIEND-03

`POST /friends/requests/{requestId}/accept`

### API-FRIEND-04

`POST /friends/requests/{requestId}/reject`

### API-FRIEND-05

`POST /friends/requests/{requestId}/cancel`

### API-FRIEND-06

`GET /friends`

Each friendship row also includes `friend: { id, displayName }` for the other account.

### API-FRIEND-07

`DELETE /friends/{accountId}`

## Media

### API-MEDIA-01

`POST /media/upload-intents`

Body includes:

- purpose
- familyId when family-owned
- MIME type
- size

Authorization: `PERSON_PROFILE` requires Creator or Editor of `familyId`; `POST_ATTACHMENT`
requires any active membership of `familyId`; `ACCOUNT_AVATAR` must not carry a `familyId`.
Other callers receive `403`.

Returns `201` with `{ asset, uploadUrl }`. `uploadUrl` is `/api/v1/media/{mediaId}/content`.

### API-MEDIA-02

`PUT /media/{mediaId}/content`

Raw image bytes as the request body. Owner only (`404` for anyone else). The asset must be
`PENDING`. The server checks the file's magic bytes against the declared MIME type, removes
metadata (JPEG APP1/APPn/comments, PNG text/EXIF/time chunks, WebP EXIF/XMP), stores the
object in R2 (`MEDIA_BUCKET`), records the stored size and SHA-256, and marks the asset
`READY`. Returns `{ asset }`. `422 MEDIA_INVALID` for a type mismatch, damaged file, empty
file, oversized file (10 MB) or non-pending asset.

### API-MEDIA-03

`POST /media/{mediaId}/complete`

Owner only. Idempotent for an asset that is already `READY`. For a `PENDING` asset it succeeds
only if the object already exists in storage, otherwise `422`.

### API-MEDIA-04

`GET /media/{mediaId}/content`

Streams a `READY` asset. Readable by its owner, by active members of its family for
family-owned media, and by any signed-in account for account avatars. Every other caller gets
`404`, so ids reveal nothing. Friendship never grants access. Responses carry
`Cache-Control: private, max-age=3600`, a `sandbox` CSP and an `ETag` (the SHA-256);
`If-None-Match` returns `304`.

## Account

### API-ACCOUNT-01

`GET /me` returns the signed-in account.

### API-ACCOUNT-02

`PATCH /me` with `{ displayName }` (1–120 characters after trimming) renames the signed-in
account and returns it.

## Authentication routes (outside `/api/v1`)

- `GET /api/auth/config` returns `{ provider: "oidc" | "cloudflare-access", devSignIn }` for the
  sign-in page.
- `POST /api/auth/logout` clears the development cookie and redirects to `/sign-in`, or to
  `/cdn-cgi/access/logout` when `AUTH_PROVIDER=cloudflare-access` (and dev sign-in is off).
- `POST /api/auth/login` exists only when `AUTH_DEV_MODE=true`.

Tokens are accepted from the `Cf-Access-Jwt-Assertion` header (Cloudflare Access), an
`Authorization: Bearer` header, or the development `auth_token` cookie. All are RS256 JWTs
checked against the configured JWKS, issuer and audience.

## HTTP semantics

Use:

- `400` malformed input
- `401` unauthenticated
- `403` authenticated but unauthorized
- `404` absent resource or deliberately concealed cross-family resource
- `409` domain conflict such as duplicate membership or tree cycle
- `422` semantically invalid profile values when useful
- `429` rate-limited
- `5xx` server/integration failure

Cross-family resource probing should normally return `404` rather than revealing existence.
