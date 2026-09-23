# ADR-004 — Cloudflare Access for production sign-in

Status: Accepted

## Context

The app verifies RS256 JWTs against a JWKS but had no production sign-in of its own: the
development cookie sign-in is disabled outside development, and no OIDC provider was
configured. The Banyan spec asks for email (and later phone) one-time-code sign-in. The app
is deployed as a Cloudflare Worker, and the owner's Cloudflare account already has a Zero
Trust organization (`qwertystars.cloudflareaccess.com`) with the one-time PIN and Google
identity providers.

## Decision

Put a Cloudflare Access self-hosted application in front of
`banyan.srijan-guchhait.workers.dev` with an allow-everyone policy, the one-time PIN and Google
identity providers, and a 30-day session. Access proves an email address; the app's own
memberships still decide what each account may see.

The Worker verifies the `Cf-Access-Jwt-Assertion` token itself (signature via the team JWKS,
issuer `https://qwertystars.cloudflareaccess.com`, audience = the application's AUD tag). The
JWKS is cached by `jose` and refetched when a token has an unknown `kid`, so Access key
rotation needs no redeploy. The account subject is the Access `sub`; the initial display name
is the email's local part, and people can rename themselves (`PATCH /me`).

`AUTH_PROVIDER=cloudflare-access` switches the sign-in page to a "Continue with email" flow and
sends sign-out through `/cdn-cgi/access/logout`. Version preview URLs are disabled because
Access does not cover them.

## Consequences

- No passwords or OTP delivery code in the app, and nothing to operate beyond Access.
- Access's free plan covers 50 users; larger families need a paid Zero Trust plan or a
  different provider.
- Phone OTP (spec §2) is not available through Access; it needs a separate provider later.
- The landing page is behind Access, so there is no public marketing page on this hostname.
- Changing the Access application recreates its AUD tag, which must then be updated in
  `wrangler.jsonc`.

## Rejected alternatives

- Building email OTP in the app: needs an email sender, code storage, rate limits and session
  management, which Access already provides.
- A third-party OIDC provider (Auth0, Clerk): another vendor and account for the same result.
- Trusting Access headers without verifying them: any path that bypasses Access (a new
  hostname, a preview URL) would then allow impersonation.
