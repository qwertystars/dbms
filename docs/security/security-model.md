# Security Model

## Assets requiring protection

High-sensitivity application data includes:

- family relationships
- dates of birth/death
- address
- phone
- email
- profile photos
- family posts
- invitations
- membership/role information

## Trust boundaries

### Browser -> application server

Untrusted boundary.

All input must be validated.

All permissions must be checked server-side.

### Application server -> PostgreSQL

Trusted service boundary using least-privilege database credentials.

### Application server/browser -> object storage

The browser never talks to object storage. Uploads and reads go through the Worker
(`/api/v1/media/{id}/content`), which uses the private R2 binding; no storage credentials
exist outside Cloudflare.

### Authentication provider -> application

Authenticated subject claims are mapped to an internal Account.

Google ID tokens are verified against Google's JWKS, issuer, audience, expiry,
nonce and verified-email claim during the callback. Subsequent requests use
revocable app sessions stored as hashes in D1.

Do not trust mutable display information as identity.

## Authorization

Family access is membership-based.

Central policy checks are mandatory.

Resource lookup should be family-scoped where possible:

Good:

`loadPerson({ familyId, personId })`

Risky:

`loadPerson(personId)` followed by a forgotten family check.

## Privacy

Family data is private by default.

Friendship is not a privacy grant.

Profile data should not be indexed publicly.

## Invitation security

- random high-entropy token
- hash token at rest
- expiry
- single use
- revocation support
- rate-limit issuance and acceptance
- do not disclose whether an arbitrary email already belongs to an account

## Media security

- allowlist MIME types
- enforce size limits
- server-generated object keys
- private bucket by default
- authenticated media proxy for private family assets (implemented: `GET /media/{id}/content`
  checks family membership and answers `404` otherwise)
- do not trust file extensions (implemented: magic-byte check against the declared type)
- strip location and other metadata (implemented: the browser re-encodes photos through a
  canvas, and the server removes EXIF/XMP/text metadata without re-encoding, since Workers
  has no image codec)
- served with `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`

## CSRF and session protection

If cookie-based sessions are used:

- SameSite protection
- secure/httpOnly cookies
- CSRF defense for unsafe operations as required by the framework/session design

## XSS

Posts, biographies, and names are untrusted text.

V1 should store/render plain text or strictly sanitized rich text.

Do not render user HTML.

## Abuse controls

Rate-limit:

- friend requests
- invitations
- account lookup/search
- media uploads
- exports

## Audit

Audit authorization-sensitive mutations without copying sensitive profile values into logs.

## Deletion and recovery

Hard-delete operations require explicit confirmation and strong authorization.

Database backups are operational assets and must be access-controlled.

## Security verification

Required negative tests include:

- viewer attempting editor action
- editor attempting creator action
- non-member accessing family
- friend accessing family without membership
- person ID from another family used in relationship API
- forged invitation token
- expired invitation
- repeated invitation acceptance
- object-storage key tampering

## Direct Google authentication (October 11, 2026)

Production sign-in uses Google's authorization-code OAuth flow with PKCE,
state and nonce, and verified ID tokens. Banyan stores hashed opaque sessions
in D1 and revokes them on logout. Accounts use stable `google:`-prefixed
subjects, distinct from family-tree people. Email never grants or links family
access. Sessions expire after seven days. New migrations add `oauth_attempts`
and `auth_sessions`. Google OAuth is deployed.

## Username/password accounts (October 11, 2026)

Google OAuth and username/password sign-in coexist. New accounts can register
with a display name, a unique case-insensitive username (3–32 ASCII characters,
starting with a letter, then letters/digits/underscores), and a password of
12–128 characters. Passwords are not trimmed. Family-tree profiles stay separate
from accounts, and registering never grants family access.

An authenticated Google account can add credentials to its existing account
within ten minutes of signing in with Google. This does not create a second
account or change family memberships. No account is linked by email or by a
username entered at sign-in. Existing credentials can be changed only after
verifying the current password; changes require a new password. Credential
mutations are audited without usernames or passwords in the audit summary.

Passwords use independently salted scrypt (N=16384, r=8, p=5, 32-byte output).
Password routes use same-origin JSON requests and persistent D1 attempt limits:
30 per IP and 15 per normalized username in 15 minutes. Failed logins use a
generic error and perform a real KDF for unknown usernames too. Credential
changes invalidate all earlier app sessions, including Google sessions, through
an incrementing version, and issue a replacement cookie for the current browser.
Raced logins with older credential versions cannot authenticate. Password hashes
are never returned by the API. Password recovery is not implemented in this slice.
