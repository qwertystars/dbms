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
- `direction=ancestors|descendants|both`
- `depth`

Response contains normalized `people[]` and `edges[]`.

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

`GET /families/{familyId}/posts?cursor=...`

Role: any family member.

Cursor pagination required.

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

## Friends

### API-FRIEND-01

`POST /friends/requests`

Body:

```json
{
  "accountId": "..."
}
```

### API-FRIEND-02

`GET /friends/requests`

### API-FRIEND-03

`POST /friends/requests/{requestId}/accept`

### API-FRIEND-04

`POST /friends/requests/{requestId}/reject`

### API-FRIEND-05

`POST /friends/requests/{requestId}/cancel`

### API-FRIEND-06

`GET /friends`

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

Returns short-lived upload instructions.

### API-MEDIA-02

`POST /media/{mediaId}/complete`

Marks validated upload as ready.

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
