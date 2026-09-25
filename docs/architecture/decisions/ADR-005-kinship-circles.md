# ADR-005 — Compute kinship circles at read time

Status: Accepted

## Context

Families asked to show far relatives less than close ones, and to see how everyone is related to them. That needs, per viewer and per person, a relationship label and a kinship degree. The tree already stores explicit parent/child edges (ADR-001) and memberships can point at a person (ADR-002).

## Decision

- Kinship is derived, never stored. `src/modules/kinship/kinship.ts` is a pure graph computation over a family's live people and edges: nearest common ancestor for blood relatives, shared children for partners, one extra step for relatives by marriage.
- Each family-scoped request that returns people or audience-limited content loads one `ViewerContext` (the viewer's role, linked person, the family's close-family degree and the viewer's relatives).
- Privacy is enforced by one serializer (`presentPerson`) and one audience check (`canSeeAudience`), so every read path, export and search applies the same rule.
- Close-family content is filtered in SQL by the set of author accounts in the viewer's circle, so cursor pagination stays correct.

## Consequences

- Tree edits change who is close immediately, with no background recomputation or stale cache.
- Each such request reads the family's people and edges. That is cheap at the v1 scale assumptions (hundreds of people per family). Much larger families would need a cached graph keyed by a tree version.
- A member who is not linked to a person has no close family, so the Creator's linking step matters. The UI prompts for it.

## Rejected alternatives

- Storing a relationship matrix or closure table: it must be rebuilt on every edge change, and it adds a new consistency invariant for no gain at this scale.
- Letting members pick their own "close family" list: it doesn't follow the tree, and it lets a member grant themselves access to a relative's contact details.
