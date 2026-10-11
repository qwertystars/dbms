# ADR-006 — Password credentials alongside Google OAuth

Status: Accepted (explicit owner requirement, October 11, 2026).

Store optional password credentials separately from the application account.
A Google account can add a username/password without changing its stable subject
or memberships. No automatic linking by email. Local sign-up gets its own random
`local:` subject. The account and family-tree people remain separate entities.

Use native node:crypto scrypt with OWASP's N=2^14, r=8, p=5 parameter set, a random
32-byte salt and constant-time verification. The Workers nodejs_compat runtime
supports this API; do not substitute a low-iteration WebCrypto PBKDF2 hash.

Persistent D1 limits guard all password KDF routes. Initial Google credential
setup requires a recent session; existing credentials require the current
password. Password mutation, revocation and auditing share an atomic D1 batch,
with optimistic version checks. Session versions prevent raced logins from
restoring a revoked session. A replacement cookie keeps the initiating browser
signed in. No password reset or email recovery flow is introduced here.
