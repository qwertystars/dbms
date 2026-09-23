# ADR-002 — Separate Account from Person

Status: **Accepted**

## Context

A family tree contains people who may be:

- deceased
- children
- historical ancestors
- relatives who never create an application login

Using one table for both login identity and family-tree identity would force invalid authentication assumptions.

## Decision

Use separate entities:

- `Account` — an authenticated application identity
- `Person` — a person represented inside one Family

A FamilyMembership may optionally link its Account to one Person in that family.

## Consequences

- A Person can exist without an Account.
- One Account can participate in multiple families.
- Authentication email is not the same as Person profile email.
- Claiming/linking a Person requires explicit family-aware logic.
