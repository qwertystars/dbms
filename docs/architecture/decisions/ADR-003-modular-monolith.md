# ADR-003 — Use a modular monolith for v1

Status: **Accepted**

## Context

The system has several domains but modest scale assumptions. Many operations require strong consistency across family membership, tree edits, and auditing.

## Decision

Implement one deployable web application with internally separated modules.

Use one PostgreSQL database.

Media bytes live in external object storage.

## Consequences

Positive:

- simple deployment
- normal ACID transactions
- easier local development
- fewer distributed failure modes
- sufficient scale for the product

Modules must still respect ownership boundaries so they can be separated later if evidence justifies it.

## Rejected alternative

Microservices are rejected for v1 because they add distributed transactions, service discovery, operational overhead, and contract management without a demonstrated need.
