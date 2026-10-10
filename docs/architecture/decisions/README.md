# Architecture Decision Records

Accepted decisions are normative below product/business rules and invariants.

Current ADRs:

- `ADR-001-family-graph-model.md` — relational adjacency graph instead of nested hierarchical records
- `ADR-002-account-person-separation.md` — login accounts and family-tree people are separate concepts
- `ADR-003-modular-monolith.md` — modular monolith for v1
- `ADR-004-clerk-auth.md` — Historical Clerk decision; superseded by ADR-005

## ADR template

```md
# ADR-NNN — Title

Status: Proposed | Accepted | Superseded

## Context

## Decision

## Consequences

## Rejected alternatives
```

- `ADR-005-google-oauth.md` — Direct Google OAuth and revocable D1 sessions (supersedes ADR-004)
