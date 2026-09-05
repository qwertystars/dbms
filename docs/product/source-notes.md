# Source Notes and Requirement Interpretation

## Evidence available

### Explicit user statement

The product is a **social media app for families**.

### Handwritten concept sketch

The sketch clearly indicates:

- "Social Media"
- "Hierarchical Data Base"
- "Family Tree"
- a multi-generation tree labelled approximately G1, G2, G3
- family-member profile fields
- a profile-photo area
- a "Friends Panel"
- access roles named Creator, Editor, and Viewer
- Creator associated with stronger tree-management permissions
- Editor associated with adding/editing
- Viewer associated with viewing/downloading

Profile labels visible in the sketch include:

- Name \*
- Gender \*
- D.O.B
- D.O.D
- Height
- Weight
- Address
- Mail
- Phone No
- Job
- other information

Some handwriting is ambiguous. Ambiguous text is not elevated into a hard requirement.

## Interpretation decisions

### Family hierarchy

The sketch says "Hierarchical Data Base", but real family ancestry is not a strict single-parent hierarchy. A person can have multiple parents and descendants can share ancestors.

Therefore the target design represents hierarchy using explicit parent/child relationship rows in a relational database. The UI may render those relationships as a family tree.

See `ADR-001-family-graph-model.md`.

### Person versus application account

The family tree can contain ancestors and deceased people. Such people cannot be assumed to have login accounts.

Therefore `Account` and `Person` are separate entities.

See `ADR-002-account-person-separation.md`.

### Roles

The role labels in the sketch are treated as direct requirements:

- Creator
- Editor
- Viewer

Exact destructive permissions were partly ambiguous. The chosen permission model is defined normatively in `domain/business-logic.md`.

### Social-media scope

The user explicitly called the product a social-media app, and the sketch contains a friends panel. The target v1 therefore includes:

- family-scoped posts
- comments
- reactions
- friend requests and accepted friendships

Direct messaging, public feeds, follower systems, stories, video calls, and algorithmic recommendations are not inferred.

## Open product questions

These are not blockers for initial implementation, but should be resolved before a polished release.

1. Should `Gender` remain required as drawn in the sketch, or become optional?
2. Should viewers always be able to export family data, or should export be creator-configurable?
3. Which export formats are required beyond JSON and CSV?
4. Should spouse/marriage relationships be represented explicitly?
5. Should adopted/guardian/step-parent relationship types be distinguished?
6. Should a person profile have per-field privacy controls?
7. Should friendships eventually enable friend-visible posts outside shared families?
8. Is "other information" a free-text biography, structured metadata, or both?
