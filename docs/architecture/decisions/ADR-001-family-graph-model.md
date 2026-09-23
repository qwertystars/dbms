# ADR-001 — Model the family hierarchy as a relational graph

Status: **Accepted**

## Context

The sketch describes a "Hierarchical Data Base" and a multi-generation family tree.

A real family structure is not reliably representable as one nested parent-owned tree:

- a child can have multiple parents
- branches can merge through shared descendants
- records need independent editing and identity
- destructive nested updates are difficult to audit
- relational integrity matters

## Decision

Persist people as rows and parent/child relationships as explicit directed edges:

`ParentChildRelationship(parent_person_id, child_person_id)`

The graph must remain acyclic within a family.

PostgreSQL recursive CTEs provide ancestor/descendant traversal.

## Consequences

Positive:

- normalized data
- explicit referential integrity
- supports multiple parents
- easier independent profile editing
- easier auditing
- cycle detection can be tested

Cost:

- tree rendering requires graph projection
- cycle prevention is a domain rule, not a simple foreign key

## Rejected alternatives

### Nested JSON family tree

Rejected because updating one person can rewrite large nested documents and makes shared descendants awkward.

### Materialized path as the only model

Rejected because a person can have multiple ancestry paths.
