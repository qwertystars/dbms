# Product Specification

## Product statement

The product is a private family-oriented social network. Its core object is a **Family Space** containing a family tree, profiles for people in that family, and family-scoped social content.

The product must support historical family records as well as active users. A family-tree person is therefore not equivalent to a login account.

## Actors

### Guest

An unauthenticated visitor.

Can:

- sign in
- accept an invitation after authentication

Cannot read private family data.

### Account holder

An authenticated application user.

Can:

- manage their own account
- receive family invitations
- belong to multiple family spaces
- send/receive friend requests
- act according to their family role

### Creator

The owner/administrator of one Family Space.

### Editor

A family member trusted to maintain family-tree content.

### Viewer

A read-oriented family member.

## Capabilities

### CAP-FAMILY-01 — Create a family space

An authenticated account can create a family space.

Creation must atomically create:

- the Family record
- the creator's FamilyMembership with role `CREATOR`

Exactly one creator exists per family.

### CAP-FAMILY-02 — Invite family collaborators

The creator can invite accounts to a family as `EDITOR` or `VIEWER`.

Invitations expire and are single-use.

### CAP-PERSON-01 — Maintain family-member profiles

A family can contain profiles for living or deceased people.

Profile fields:

- name — required
- gender — required for v1 because the sketch marks it required
- date of birth — optional
- date of death — optional
- height — optional
- weight — optional
- address — optional
- email — optional
- phone number — optional
- occupation/job — optional
- biography/other information — optional
- profile photo — optional

A person may exist without any login account.

### CAP-TREE-01 — Build and render a family tree

Authorized users can define parent/child relationships between people in the same family.

The system must:

- prevent self-parenting
- prevent cycles
- prevent duplicate parent/child edges
- derive the visual tree from stored relationships

### CAP-TREE-02 — Multi-generation navigation

Users can navigate ancestors and descendants across multiple generations.

Generation labels such as G1/G2/G3 are presentation results, not canonical stored ancestry.

### CAP-ACCESS-01 — Role-based family access

The application uses family-scoped roles:

- Creator
- Editor
- Viewer

Permission semantics are defined in `domain/business-logic.md`.

### CAP-EXPORT-01 — Export family information

Authorized family members can export data they are permitted to view.

Initial required formats:

- JSON
- CSV

A visual/print export can be added later.

### CAP-SOCIAL-01 — Family feed

Family members can create and interact with posts inside a family space according to role-independent social permissions.

V1 post visibility is family-private.

### CAP-SOCIAL-02 — Comments and reactions

Family members can:

- comment on family posts
- edit/delete their own comments
- react/unreact to family posts

### CAP-FRIEND-01 — Friend connections

Authenticated accounts can:

- send friend requests
- accept/reject/cancel requests
- unfriend

Friendship is symmetric after acceptance.

Friendship does not provide access to a friend's family spaces.

### CAP-MEDIA-01 — Profile and post media

The system supports image uploads for:

- person profile photos
- post attachments

Media bytes are stored in object storage. Metadata and ownership are stored in the database.

### CAP-AUDIT-01 — Audit sensitive changes

The system records security-relevant and family-structure mutations, including:

- role changes
- family ownership transfer
- person deletion
- parent/child relationship changes
- family deletion
- invitation acceptance

## Explicit non-goals for v1

- public family trees
- public post discovery
- algorithmic feed ranking
- direct messaging
- voice/video calls
- stories/reels
- ads
- monetization
- genealogy DNA integrations
- importing external genealogy formats
- automatic person matching
- AI-generated ancestry claims

## Privacy model

Family spaces are private by default.

An account may read family data only when it has an active membership in that family or when a narrowly scoped invitation-acceptance flow requires minimal metadata.

Friendship is not authorization.

## Family graph and engagement

- Partner connections are symmetric, same-family records between distinct people.
  Creators and Editors manage them; they never imply parenthood or family access.
- Members can request to link their account to a person in the family. Only the
  Creator can approve or reject, including their own request. Requests, decisions,
  cancellations and unlinking are audited. Linking grants no additional role.
- The tree supports focused one-generation expansion, pan/zoom, distinct partner
  connectors, a person inspector and a generations fallback. A searchable People
  directory offers linked, memorialized, incomplete and unconnected filters.
- Memories are family-private posts with up to 20 tagged people from that family.
  Profiles show tagged memories. The previous feed route redirects to Memories.
- Every active member can create family gatherings and RSVP Going, Maybe or Not
  going. Only the author edits; the author or Creator deletes. Birthdays and
  remembrances are derived separately from profile dates.
- The shell provides a family switcher and family-specific navigation without
  carrying person IDs into another family.

## Data retention baseline

- Normal family data remains until an authorized user deletes it.
- Soft deletion is preferred for user-generated social content when practical.
- Hard deletion of an entire family requires Creator authorization and an explicit confirmation flow.
- Audit records should not contain unnecessary sensitive field values.

## Scale assumptions for v1

Design for:

- tens to low hundreds of people per family
- low thousands as a supported upper bound
- many independent family spaces
- typical consumer-social read traffic
- no need for distributed graph infrastructure

The design must not load the complete application dataset to render one family tree.

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
