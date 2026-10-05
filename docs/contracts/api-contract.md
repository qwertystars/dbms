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

### API-PERSON-02

`GET /families/{familyId}/people`

Role: any family member.

Supports search/pagination.

### API-PERSON-03

`GET /families/{familyId}/people/{personId}`

Role: any family member.

### API-PERSON-04

`PATCH /families/{familyId}/people/{personId}`

Role: Creator/Editor.

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
checked against the configured JWKS and issuer, and against the audience when one is
configured (`AUTH_AUDIENCE` is optional with Cloudflare Access).

Authentication failures are distinguishable:

- `401 UNAUTHENTICATED`: no token was presented.
- `401 INVALID_TOKEN`: a token was presented but rejected. The message names the `jose` error
  code and, for claim failures, the claim (for example `ERR_JWT_CLAIM_VALIDATION_FAILED: iss`).
- `503 ACCOUNT_UNAVAILABLE`: the token is valid but the account could not be loaded or
  provisioned (for example, migrations have not been applied). The cause is logged, not
  returned.

The web client sends the browser back through sign-in only on `UNAUTHENTICATED`. Any other
failure is shown on the sign-in page with the request id, because retrying through Cloudflare
Access would loop.

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
