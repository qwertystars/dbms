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

Uploads use short-lived scoped URLs. Permanent credentials never reach the browser.

### Authentication provider -> application

Authenticated subject claims are mapped to an internal Account.

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
- signed reads or authenticated media proxy for private family assets
- do not trust file extensions
- add image re-encoding/scanning if deployment risk warrants it

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
