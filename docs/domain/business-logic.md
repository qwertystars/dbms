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
| Link a member to their person in tree    |     Yes |     No |     No |
| Set the close-family degree              |     Yes |     No |     No |
| See every profile field                  |     Yes |    Yes |    No¹ |
| Edit own linked profile (self-service)²  |     Yes |    Yes |    Yes |
| Change a person's field visibility       |     Yes |    Yes |    No² |
| Share a post/help item with close family |    Yes³ |   Yes³ |   Yes³ |
| Post, reply to, resolve own help items   |     Yes |    Yes |    Yes |
| Remove others' help items and replies    |     Yes |     No |     No |

¹ Viewers see a field group when its visibility allows it (RULE-PRIVACY-02).
² Only on the person their own membership is linked to, and only the self-service fields (RULE-PERSON-05).
³ Requires the author's membership to be linked to a person (RULE-CIRCLE-04).

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

Linking a Person to an Account does not transfer ownership of that Person record. Family permissions still control editing, with one exception: the linked account may change its own person's self-service fields (occupation, education, city, skills, email, phone, address, biography and field visibility) whatever its role. Name, gender, dates, body measurements and photo stay Editor-only.

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

## Close and far family

### RULE-CIRCLE-01

Only the Creator links a membership to a Person, or removes the link. The Person must be a live person of the same family and not linked to another active membership (INV-MEMBER-02). Linking is audited as `MEMBERSHIP_PERSON_LINKED`.

### RULE-CIRCLE-02

Kinship is computed, never stored. Blood relatives are found through the nearest common ancestor; the degree is the number of parent/child steps up plus down. Two people who share a child are partners (degree 1). A partner's blood relative, or a blood relative's partner, is a relative by marriage at the connecting blood relative's degree plus one. When several paths exist the shortest wins. Degree is symmetric.

### RULE-CIRCLE-03

A person is in the viewer's close family when the viewer's membership is linked to a person and the kinship degree between them is at most the family's `close_family_degree` (default 3, Creator sets 1 to 6). Without a link the viewer has no close family.

### RULE-CIRCLE-04

Content with audience `CLOSE` is visible only to its author and to members whose linked person is in the author's close family. Only an author linked to a person may choose `CLOSE`. Outside the audience, the content responds as not found, including to the Creator.

## Profile privacy

### RULE-PRIVACY-01

Profile fields are grouped as work, biography, birthday, contact, address and body. Each person stores optional overrides; missing groups use the defaults in CAP-PRIVACY-01.

### RULE-PRIVACY-02

A viewer sees a field group when any of these holds: the viewer is the Creator or an Editor; the viewer is linked to that person; the group is `FAMILY`; the group is `CLOSE` and the person is in the viewer's close family.

### RULE-PRIVACY-03

Visibility is applied by one server-side serializer used by person reads, the people list and its search, the tree, exports and birthday reminders. Hidden fields are sent as `null` and listed in `hiddenFields`; the birth year is always sent.

### RULE-PRIVACY-04

A privacy change is audited as `PERSON_PRIVACY_UPDATED` with the changed field names only.

## Help board

### RULE-HELP-01

Any active member may post a request or offer and reply to open items they can see. Replies are refused once an item is resolved or closed.

### RULE-HELP-02

Only the author edits an item or changes its status. The author or the Creator may delete it; deletion is a soft delete audited as `HELP_REQUEST_DELETED`.

## DNA matches (beta)

### RULE-DNA-01

A DNA match links two accounts, never families or people. At most one match exists per pair of accounts.

### RULE-DNA-02

Only the account that did not report a match can confirm it. Only the two accounts can see it; anyone else gets not found.

### RULE-DNA-03

Declining, cancelling and withdrawing all delete the row. Confirmation and deletion are audited without any genetic values.

### RULE-DNA-04

Only the match summary (provider, shared cM from 0 to 7,500, optional segment count and note) is stored. Raw genetic data is never accepted.

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

The Creator may moderate content inside the family.

### RULE-POST-05

Removing a membership prevents future access to family posts but does not automatically erase that account's historical contributions.

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
