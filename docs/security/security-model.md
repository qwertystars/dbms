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

### Local credentials and sessions

Users create local accounts with a unique, lowercase username and password. Passwords are stored as salted PBKDF2-SHA-256 hashes (100,000 iterations), never plaintext. Sessions use random 256-bit tokens; only SHA-256 token hashes are persisted. Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, and expire after seven days. Logout deletes the session. Login and registration are rate-limited and reject cross-origin POSTs.

External identity headers and bearer tokens are not accepted. Family permissions continue to use the immutable internal Account ID, never username or display name. Existing provider accounts are preserved but have no local credentials; linking or migrating their credentials requires a separate verified administrative process. Creating a matching username cannot claim their private data.

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
