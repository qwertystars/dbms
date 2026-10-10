# ADR-005 — Direct Google OAuth

Status: Accepted (explicit owner requirement, October 11, 2026).

Use Google's authorization-code flow with PKCE and server-side code exchange.
Verify the ID token's RS256 signature, issuer, client-id audience, expiry,
nonce, subject and verified email. One-use D1 OAuth attempts bind the state to
an HttpOnly browser cookie and expire after ten minutes. Google access and
refresh tokens are not persisted.

Issue random opaque seven-day app sessions, storing only token hashes in D1.
Logout revokes the record. Cookie flags are HttpOnly, SameSite=Lax and Secure
on HTTPS. Expired rows are cleaned when another sign-in begins. The session
has a fixed expiry and no silent refresh; users sign in again after seven days.
Google subjects are prefixed `google:`. No email-based account linking.
Family permissions continue to be enforced by existing domain services.

This supersedes ADR-004; Clerk's SDK, provider configuration and browser token
bridge are removed. The old Access gate must be removed during deployment.
