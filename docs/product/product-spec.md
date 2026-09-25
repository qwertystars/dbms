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

### CAP-CIRCLE-01 — Close and far family

Each member account can be linked to the Person who represents them in the tree ("this is me"). Only the Creator links members, because the link decides who counts as close family.

From the tree the product computes every person's relationship to the viewer (mother, first cousin once removed, sister-in-law, uncle by marriage) and a kinship degree (parent 1, sibling 2, aunt 3, first cousin 4). Two people who share a child are treated as partners.

Relatives within the family's close-family degree (default 3; the Creator can choose 1 to 6) are **close family**. Everyone else in the family is **extended (far) family**. A viewer who is not linked sees everyone as extended family.

### CAP-PRIVACY-01 — Field-group visibility

Profile fields are grouped, and each group of each person has a visibility:

| Group           | Fields                                       | Default                |
| --------------- | -------------------------------------------- | ---------------------- |
| Work & skills   | occupation, education, city, "can help with" | Everyone in the family |
| Biography       | biography                                    | Everyone in the family |
| Birthday        | full date of birth (the year always shows)   | Everyone in the family |
| Contact         | email, phone                                 | Close family           |
| Address         | address                                      | Close family           |
| Height & weight | height, weight                               | Close family           |

Levels: `FAMILY` (every member), `CLOSE` (close family), `MAINTAINERS` (only the person and the family's Creator and Editors). Name, gender, photo, life years and tree position are always visible to members. Hidden values are removed on the server before any response, export or search.

The account linked to a person may edit that person's contact, work, biography and privacy fields itself, even as a Viewer.

### CAP-DIRECTORY-01 — Who's who

A family directory lists everyone grouped into You, Close family, Extended family and Not connected, with their relationship to the viewer, occupation, education, city and what they can help with. Search matches only the fields the viewer can see.

### CAP-SOCIAL-03 — Close-family sharing

Posts and help-board items may be shared with the whole family or with close family only. Close-family content is visible to its author and to members within the close-family degree of the author. It is indistinguishable from missing content to everyone else, including the Creator.

### CAP-HELP-01 — Help board

Members ask for help (requests) or offer it (offers) in a category (advice, career, studies, health, housing, travel, care, other), and other members reply. The author marks an item sorted, closes or reopens it. The Creator may remove items and replies.

### CAP-DNA-01 — DNA matches (beta)

An account records a DNA match with another account by copying the summary a testing service shows (provider, shared centimorgans, optionally segments and a note). The other account must confirm it. Both see an estimated relationship from typical shared-cM ranges. Raw genetic data is never collected. Either side can delete the match, which erases it. A DNA match never grants family access.

## Explicit non-goals for v1

- public family trees
- public post discovery
- algorithmic feed ranking
- direct messaging
- voice/video calls
- stories/reels
- ads
- monetization
- direct integrations with DNA testing services or uploads of raw DNA files (only consented match summaries, CAP-DNA-01)
- importing external genealogy formats
- automatic person matching
- AI-generated ancestry claims

## Privacy model

Family spaces are private by default.

An account may read family data only when it has an active membership in that family or when a narrowly scoped invitation-acceptance flow requires minimal metadata.

Friendship is not authorization. Neither is a DNA match.

Inside a family, far family see less than close family (CAP-CIRCLE-01, CAP-PRIVACY-01). Creators and Editors see every field because they maintain the tree.

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
