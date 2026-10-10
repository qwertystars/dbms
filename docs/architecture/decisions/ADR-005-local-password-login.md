# ADR-005 — Local username and password login

Status: Accepted

## Context

The user requested a simple username and password login without external authentication. This supersedes ADR-004.

## Decision

Use local registration and password login in both Node and Workers. Store credentials separately from Accounts and family-tree people. Resolve opaque, revocable cookie sessions to internal Accounts. Remove Cloudflare Access/OIDC/JWKS and unrestricted development sign-in. Retain server-side family authorization.

## Consequences

Migration 0001 adds account_credentials and account_sessions. Existing Accounts and family data stay intact, but existing provider users cannot log in until credentials are linked through a separately verified administrative process. New registration creates a new Account. Password reset and account linking are not implemented.

The deployed Cloudflare Access application must be disabled or removed independently of this code change to expose the new login page.
