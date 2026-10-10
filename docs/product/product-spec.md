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
and `auth_sessions`. Deployment and Google credential setup remain pending;
this change has not yet been deployed.
