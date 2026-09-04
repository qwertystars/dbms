# AGENTS.md

## Repository purpose

This repository defines and implements a private family-oriented social network with family trees, family-member profiles, role-based family access, social posts, and friend connections.

## Project mode

**GREENFIELD**

Current descriptive truth lives in:

- `docs/execution/current-state.md`

Normative product truth lives primarily in:

- `docs/product/product-spec.md`
- `docs/domain/business-logic.md`
- `docs/domain/invariants.md`
- accepted ADRs under `docs/architecture/decisions/`
- contracts under `docs/contracts/`

## Authority order

For desired behavior:

1. explicit current user requirements
2. `docs/product/product-spec.md`
3. `docs/domain/business-logic.md`
4. `docs/domain/invariants.md`
5. accepted ADRs
6. contracts
7. implementation plan
8. implementation

Current-state documentation must describe what exists even when it violates desired behavior.

## Mandatory engineering rules

- Do not collapse application accounts and family-tree people into the same entity.
- Do not model a family as a nested JSON tree. Use explicit relationship records.
- Parent/child relationships must never create cycles.
- Family data is private by default.
- Friendship never grants family access.
- Every family-scoped mutation must perform authorization on the server.
- Client-side permission checks are UX only, never security boundaries.
- Sensitive family mutations must be auditable.
- Database schema changes require migrations.
- API schemas must be machine-validatable.
- Do not invent implementation status. Update `current-state.md` after material work.

## Repository dependency direction

Target dependency direction:

`UI -> application/domain services -> repositories -> database/integrations`

Domain rules must not depend on UI code.

Cross-module access must occur through public module interfaces rather than direct access to another module's persistence internals.

## Verification

For every material change run, as applicable:

- formatter
- lint
- type-check
- unit tests
- integration tests
- database migration validation
- API contract tests
- targeted end-to-end tests

Security-sensitive authorization changes require negative tests.

## Documentation update rules

When changing:

- product behavior -> update product spec/business rules
- an invariant -> update `invariants.md` and tests
- database schema -> update data model + migration + current state
- API -> update API contract + tests
- architecture -> add/update ADR + architecture doc
- deployment/config -> update deployment docs
- implemented capability -> update current state
- permissions -> update business logic, invariants, API authorization matrix, and tests
