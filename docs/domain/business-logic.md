# Business Logic

## Family ownership and membership

### RULE-FAMILY-01

Creating a family makes the creating account its `CREATOR`.

### RULE-FAMILY-02

A family has exactly one active Creator.

Creator ownership may be transferred, but the old creator must become another role or leave only after the transfer succeeds.

### RULE-FAMILY-03

An account may belong to multiple families.

### RULE-FAMILY-04

Within one family, an account has exactly one active membership.

## Permission matrix

| Action                                   | Creator | Editor | Viewer |
| ---------------------------------------- | ------: | -----: | -----: |
| View family                              |     Yes |    Yes |    Yes |
| View tree                                |     Yes |    Yes |    Yes |
| Export visible family data               |     Yes |    Yes |    Yes |
| Create person                            |     Yes |    Yes |     No |
| Edit person                              |     Yes |    Yes |     No |
| Delete person                            |     Yes |     No |     No |
| Add parent/child relationship            |     Yes |    Yes |     No |
| Correct/remove parent/child relationship |     Yes |    Yes |     No |
| Add/remove partner relationship          |     Yes |    Yes |     No |
| Request own person link                  |     Yes |    Yes |    Yes |
| Decide person claims                     |     Yes |     No |     No |
| Cancel own pending claim / unlink self   |     Yes |    Yes |    Yes |
| Create family event / RSVP               |     Yes |    Yes |    Yes |
| Edit own event or memory                 |     Yes |    Yes |    Yes |
| Delete own event or memory               |     Yes |    Yes |    Yes |
| Delete another member's event or memory  |     Yes |     No |     No |
| Invite member                            |     Yes |     No |     No |
| Change member role                       |     Yes |     No |     No |
| Remove member                            |     Yes |     No |     No |
| Transfer ownership                       |     Yes |     No |     No |
| Delete family                            |     Yes |     No |     No |
| Create family post                       |     Yes |    Yes |    Yes |
| Comment/react                            |     Yes |    Yes |    Yes |
| Upload a person's profile photo          |     Yes |    Yes |     No |
| Upload a post attachment                 |     Yes |    Yes |    Yes |
| See the family's photos and attachments  |     Yes |    Yes |    Yes |

The sketch gives Editor "add + edit". Removing an incorrect relationship is treated as tree editing, but deleting a person record remains Creator-only.

## Person profiles

### RULE-PERSON-01

A Person belongs to exactly one Family.

### RULE-PERSON-02

`name` and `gender` are required in v1.

### RULE-PERSON-03

If both dates exist:

`date_of_death >= date_of_birth`

### RULE-PERSON-04

A deceased person is represented with a Person record and optional `date_of_death`; no Account is required.

### RULE-PERSON-05

Linking a Person to an Account does not transfer ownership of that Person record. Family permissions still control editing.

### RULE-PERSON-06

Email and phone fields on Person are profile data. They are not authentication identifiers.

## Family graph

### RULE-TREE-01

A parent and child must belong to the same family.

### RULE-TREE-02

A person cannot be their own parent or descendant.

### RULE-TREE-03

Adding an edge `parent -> child` must be rejected if `child` already reaches `parent`.

### RULE-TREE-04

The same parent/child edge may exist only once.

### RULE-TREE-05

Deleting a Person requires handling all incident relationship edges in the same transaction.

### RULE-TREE-06

Generation numbers are computed for a requested visualization. They are not identity and must not be used as permanent keys.

### RULE-TREE-07 — Partners are distinct from ancestry

Creators and Editors may add/remove symmetric partner links between distinct live
people in the same family. Canonical ID ordering makes a reversed pair a duplicate.
Partner links do not imply parentage, enforce monogamy, or create a union/marriage
entity. Additions and removals are audited. Tree projections return partners
separately from parent/child edges; rooted projections add the root's direct partners
without traversing ancestry through them.

## Account-to-person claims

### RULE-CLAIM-01 — Request and visibility

Any active member, including Creator, may request an unlinked live Person in the
same family if their membership is unlinked and has no pending claim. One pending
request per membership is allowed; rival requests for one Person are allowed.
Creators list all pending family requests; other members list only their own
requests, including resolved history.

### RULE-CLAIM-02 — Creator decision

Only the family's active Creator may approve/reject a pending request, including
their own. Request creation never auto-approves. Approval rechecks active requesting
membership, absence of its existing link, a live same-family target and absence of
another active link to that Person. Approval sets the membership's `personId`
without changing roles, profiles or graph edges. Rejection does not link.
Request, approval and rejection are audited.

### RULE-CLAIM-03 — Cancel and unlink

Only the requester may cancel their pending request. Any active member may unlink
their own membership; already-unlinked is a no-op. Unlinking is audited and leaves
the Person and relationships intact. Cancellation records `CLAIM_CANCELLED`.
Person deletion cancels pending claims, clears membership links, and removes
incident parent/child links, partner links and memory tags in the deletion batch.

## Invitations

### RULE-INVITE-01

Only the Creator may issue family invitations in v1.

### RULE-INVITE-02

Invitation roles may be only `EDITOR` or `VIEWER`.

### RULE-INVITE-03

An invitation must have:

- a cryptographically random token
- only a token hash stored server-side
- expiry
- single-use semantics

### RULE-INVITE-04

Accepting an invitation for an account that is already a family member is idempotent and must not create a duplicate membership.

## Social content

### RULE-POST-01

A post belongs to exactly one family and one authoring account.

### RULE-POST-02

The author must have active membership in the post's family at creation time.

### RULE-POST-03

All active family roles may post, comment, and react.

### RULE-POST-04

Users may edit/delete their own posts and comments.

The Creator may delete another member's posts/comments, but may not edit them.
Every operation still requires active membership.

### RULE-POST-05

Removing a membership prevents future access to family posts but does not automatically erase that account's historical contributions.

### RULE-POST-06 — Memory tags

"Memory" is the UI name for a family-private post, not a separate entity. Any
member may create one and tag live family people with optional `personIds` (max 20
submitted IDs, deduplicated in the service). Only the author may edit body/tags.
Omission preserves tags on update, `[]` clears them, and a supplied list replaces
them. Responses expose `taggedPeople` IDs/names. The `personId` list filter finds
memories tagged with that Person without widening family access.

## User-created events and RSVP

### RULE-EVENT-01 — Event ownership

Any active family member may create/list gatherings. Only the author may edit;
the author or family Creator may soft-delete. Editor status alone gives no
moderation rights. Deletion is audited. Birthdays and memorial anniversaries
remain derived from Person dates, separate from stored gatherings.

### RULE-EVENT-02 — Responses

Any active member may set/replace/clear only their own RSVP to a live family
event. One current response per event/account is `GOING`, `MAYBE` or `NOT_GOING`.
Lists return counts and the caller's response, not an attendee roster.
Dates are calendar dates; optional times use 24-hour `HH:MM`, without a stored
timezone. Listing defaults to events from today's UTC date onward.

## Friendship

### RULE-FRIEND-01

Friend requests are account-to-account, not Person-to-Person.

### RULE-FRIEND-02

An account cannot friend itself.

### RULE-FRIEND-03

There can be at most one pending friend request between the same two accounts in either direction.

### RULE-FRIEND-04

Accepted friendship is symmetric.

### RULE-FRIEND-05

Friendship never grants family membership or access to family-private data.

## Media

### RULE-MEDIA-01

A media asset has exactly one owning account and an application-level purpose.

### RULE-MEDIA-02

A client must not directly choose permanent object-storage keys.

### RULE-MEDIA-04

Family-owned media is family data. Creating it requires the membership shown in the permission
matrix, and reading it requires an active membership of that family. Friendship never grants
media access. Account avatars carry no family and are visible to any signed-in account.

### RULE-MEDIA-03

The server validates metadata before accepting an upload completion:

- allowed MIME type
- maximum size
- expected ownership/purpose

## Deletion

### RULE-DELETE-01

Person deletion is Creator-only because it can change family history.

### RULE-DELETE-02

Family deletion is Creator-only and requires an explicit confirmation step.

### RULE-DELETE-03

Family deletion must remove or tombstone all family-owned application records and schedule deletion of family-owned media.

## Audit

### RULE-AUDIT-01

Audit events record actor, action, target, family, timestamp, and request/correlation ID.

### RULE-AUDIT-02

Audit logs should record changed field names or summaries rather than copying sensitive profile values unless specifically required.

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
