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

Supports `?search=...` (case-insensitive name matching). The route does not expose
pagination parameters; the service defaults to at most 100 results. Directory
search, filters and grid/list layout operate client-side on the full tree projection.

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

Role: any active family member. Response contains normalized `people[]`,
parent/child `edges[]`, and distinct symmetric `partners[]`.

- Without `rootPersonId`: every non-deleted person in the family, including people with no relationships, and every edge between them. `direction` and `depth` are ignored.
- With `rootPersonId`: the root plus its ancestors and/or descendants up to `depth` generations, plus the root's direct partners regardless of direction. Only relationships between returned live people are included. Partners do not extend ancestry traversal. Unknown or deleted root is `404`.

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

### API-TREE-04 — Add partner link

`POST /families/{familyId}/relationships/partners`

Role: Creator/Editor. Body: `{ personAId, personBId }`.
Returns `201 { partner }`. Both people must be live and in this family. The service
sorts the IDs before insertion; reversing a pair is a duplicate. Partnership does
not create parentage, a marriage record, or a union entity.

Domain conflicts (`409`): `PARTNER_SELF`, `PARTNER_DUPLICATE`,
`PERSON_NOT_IN_FAMILY`. Successful additions write `PARTNER_ADDED`.

### API-TREE-05 — Remove partner link

`DELETE /families/{familyId}/relationships/partners/{relationshipId}`

Role: Creator/Editor. Returns `{ removed: true }`; unknown family-scoped link: `404`.
Successful removal writes `PARTNER_REMOVED`.

## Account-to-person claims

All operations require active membership in the addressed family. These link an
account's membership to a Person, never change the family graph or grant a role.
Machine-validatable decision input: `claimDecisionSchema` in `src/lib/schemas.ts`.

| Method and family-relative route            | Authorization                                                                     | Body / response                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| POST `/people/{personId}/claim-requests`    | Any member with no person link or pending request                                 | No body; `201 { request }`, status `PENDING`                                                                   |
| GET `/claim-requests`                       | Creator: all family pending requests; other members: own requests in every status | `{ requests }`, newest first, with `person: { id, name, profileMediaId }` and `requester: { id, displayName }` |
| POST `/claim-requests/{requestId}/decision` | Creator only, including for their own request                                     | `{ decision: "APPROVED" \| "REJECTED" }`; `{ request }`                                                        |
| DELETE `/claim-requests/{requestId}`        | Requesting membership only, while pending                                         | `{ request }`, status `CANCELLED`                                                                              |
| DELETE `/me/person-link`                    | Own membership only                                                               | `{ unlinked: true }`, or `{ unlinked: false }` if already unlinked                                             |

Prefix each route above with `/families/{familyId}`. Approval rechecks that the
requesting membership is active and unlinked and the target Person is live,
same-family and not linked to another active membership. Multiple members may
request the same Person; approval does not automatically reject rival requests.
Creators must explicitly approve their own requests; creation never auto-links.
Approval/rejection records the deciding account and time. Cancellation records
the time but not a deciding account. Unlinking leaves the Person and graph intact.

Conflicts (`409`): `CLAIM_PENDING`, `CLAIM_ALREADY_LINKED`, `CLAIM_CONFLICT`,
`CLAIM_NOT_PENDING` (also used if the requester has left at approval time).
Unknown request or non-live target: `404`; unauthorized action: `403`.
Audits: `CLAIM_REQUESTED`, `CLAIM_APPROVED`, `CLAIM_REJECTED`,
`CLAIM_CANCELLED`, `PERSON_LINK_REMOVED`. Decisions and cancellations conditionally
consume `PENDING` inside an atomic batch; unsuccessful transitions leave no audit.

## Export

### API-EXPORT-01

`GET /families/{familyId}/export?format=json`

or

`format=csv`

Role: any family member in v1.

Export includes only data visible to the requesting account.

## Family memories (posts API)

The UI calls posts "Memories"; API paths remain `/posts`.
Create and update schemas require `body` (1-5000 characters) and accept optional
`personIds` (at most 20 submitted IDs, each an opaque 1-64-character identifier).
Duplicates are deduplicated by the service. Every tag must identify a live Person
in this family, otherwise `409 PERSON_NOT_IN_FAMILY`.
Create/update/list responses include `taggedPeople: [{ id, name }]`.

### API-POST-01

`POST /families/{familyId}/posts`

Role: any family member.

### API-POST-02

`GET /families/{familyId}/posts?cursor=...&limit=...&personId=...`

Role: any family member.

Cursor pagination required. `limit` defaults to 20 (max 50). The cursor combines the post
timestamp and id, so posts created within the same second are not skipped. Each post
includes `author` (id and displayName), `reactionCounts`, `commentCount`, and the
requesting account's `myReaction`.
Optional `personId` restricts results to memories tagged with that Person; the
query remains family-scoped. An unmatched ID returns an empty list.

### API-POST-03

`PATCH /families/{familyId}/posts/{postId}`

Active member and post author only; Creator cannot edit another author's post.
Omitting `personIds` preserves tags; `[]` clears them; a supplied list replaces them.
Current implementation writes the body before validating/replacing tags, so an
invalid tag update can return a conflict after the body has changed.

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

### User-created family events and RSVP

These are separate from the derived birthday/memorial endpoint. All routes below
require active membership, including author edits/deletes and Creator moderation.
Prefix with `/families/{familyId}`.

| Method and route                | Authorization                           | Response                                                                    |
| ------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| GET `/events?from=YYYY-MM-DD`   | Any member                              | `{ events }`; live events with `startsOn >= from`, sorted by date then time |
| POST `/events`                  | Any member, including Viewer            | `201 { event }`                                                             |
| PATCH `/events/{eventId}`       | Event author only, not Creator override | `{ event }`                                                                 |
| DELETE `/events/{eventId}`      | Event author or family Creator          | `{ deleted: true }` (soft delete, audited)                                  |
| PUT `/events/{eventId}/rsvp`    | Any member, own response only           | `{ eventId, response }`                                                     |
| DELETE `/events/{eventId}/rsvp` | Any member, own response only           | `{ removed: true }`                                                         |

`from` defaults to today's UTC date. List rows include
`creator: { id, displayName }`, `rsvpCounts: { GOING, MAYBE, NOT_GOING }`
(zero-filled counts), and `myRsvp` (response or `null`).

`familyEventCreateSchema` requires trimmed `title` (1-200 characters) and
`startsOn` (valid `YYYY-MM-DD`). Optional nullable fields: `description` (max 2000),
`startTime` (`HH:MM`, 24-hour), `location` (max 300). Update uses the partial
schema. No timezone or recurrence field is stored. `rsvpSchema` accepts
`{ response: "GOING" | "MAYBE" | "NOT_GOING" }`; repeated PUT replaces the
account's existing response. DELETE clears it. Invalid input: `400`;
non-member or prohibited ownership action: `403`; missing/deleted event: `404`.
Deletion writes `FAMILY_EVENT_DELETED`; creation, editing and RSVP changes do not
currently write dedicated audits.

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

- `GET /api/auth/config` returns
  `{ provider: "oidc" | "google", devSignIn: boolean, googleSignIn: boolean }`.
- `GET /api/auth/google?returnTo=...` starts Google authorization with PKCE,
  state and nonce; sets a 10-minute HttpOnly OAuth cookie. Unconfigured: 503.
- `GET /api/auth/google/callback` consumes the attempt once, verifies Google's
  RS256 ID token (issuer, audience, expiry, nonce, subject, verified email),
  and creates a seven-day opaque session. Invalid state: 400; provider failure:
  redirect to `/sign-in?error=google`. Only local return paths are allowed.
- `POST /api/auth/logout` revokes the D1 session and clears cookies; cross-site
  requests: 403. Successful logout redirects to `/sign-in`.

Production APIs authenticate the HttpOnly `banyan_session` cookie against its
hashed D1 record and expiry. Generic OIDC/dev JWT support remains for existing
local tests; Google mode does not accept arbitrary bearer JWTs. Google proves
identity only; the family authorization matrix above still applies.

## Password authentication and credential settings

Machine-validatable contracts: `passwordLoginSchema`, `passwordRegisterSchema`,
`credentialsSchema`, `usernameSchema`, `passwordSchema` in `src/lib/schemas.ts`.

| Method and route                 | Authorization                                                                                               | Body / response                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST /api/auth/password/register | Anonymous, same origin; D1 attempt limits                                                                   | `{ username, password, displayName }`; 201 `{ ok: true }`, session cookie                                     |
| POST /api/auth/password/login    | Anonymous, same origin; D1 attempt limits                                                                   | `{ username, password }`; 200 `{ ok: true }`, session cookie                                                  |
| GET /api/v1/me/credentials       | Signed-in account                                                                                           | 200 `{ username: string or null, hasPassword: boolean }`                                                      |
| PUT /api/v1/me/credentials       | Signed-in account, same origin; initial setup: Google sign-in within 10 minutes; existing: current password | `{ username, password, currentPassword? }`; 200 `{ username, hasPassword: true }`, replacement session cookie |

Validation failures: 400. Invalid login: 401 `INVALID_CREDENTIALS` (generic).
Unauthenticated settings: 401. Wrong current password: 403 `INVALID_PASSWORD`.
Initial setup without recent Google authentication: 403 `REAUTHENTICATION_REQUIRED`.
Cross-site writes: 403. Username collision: 409 `USERNAME_UNAVAILABLE`.
Concurrent modification: 409 `CREDENTIALS_CHANGED`. Throttle: 429 `RATE_LIMITED`.
The password account uses a stable `local:` subject. Google credentials reuse
the existing `google:` subject and account ID; all family permissions are unchanged.
