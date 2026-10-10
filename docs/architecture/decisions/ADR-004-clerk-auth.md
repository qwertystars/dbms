> Superseded by ADR-005-google-oauth.md. Historical decision.

# ADR-004 — Clerk for production sign-in

Status: Accepted

## Context

The app verifies RS256 JWTs against a JWKS but had no production sign-in of its own: the
development cookie sign-in is disabled outside development, and no identity provider was
configured. The Banyan spec asks for email and phone one-time-code sign-in and a sign-up path
for relatives who arrive through invite links. The app runs as a Cloudflare Worker serving a
Vite SPA.

Cloudflare Access was tried first and dropped in favour of Clerk, which the owner chose. Clerk
offers phone and email codes, Google and other social logins, and hosted sign-in and sign-up
components, without putting a gate in front of the whole site.

## Decision

Use Clerk. The browser loads Clerk with the publishable key it gets from
`GET /api/auth/config` (so the key lives only in `wrangler.jsonc`, not in the build), renders
Clerk's `<SignIn>` and `<SignUp>` on `/sign-in` and `/sign-up`, and sends a fresh session token
as `Authorization: Bearer` on every API call. Clerk also keeps the token in the same-origin
`__session` cookie, which authenticates `<img>` requests for family photos.

The Worker verifies every token itself with `jose`:

- issuer `https://<frontend API>`, and JWKS `https://<frontend API>/.well-known/jwks.json`,
  both derived from `CLERK_PUBLISHABLE_KEY`; the JWKS is cached and refetched on an unknown
  `kid`, so key rotation needs no redeploy
- `azp` must be one of `AUTH_AUTHORIZED_PARTIES` (default: the origin of `APP_BASE_URL`)
- sessions with `sts: "pending"` are treated as signed out

Clerk session tokens carry only the user id. When an account is first provisioned, the Worker
looks up the user's name through Clerk's Backend API with `CLERK_SECRET_KEY` (a Worker secret),
falling back to the email's local part. People can rename themselves with `PATCH /me`.

Clerk identifies people; family access is still decided only by memberships.

## Consequences

- Sign-in, sign-up, verification codes, social logins and session management are Clerk's job.
- The Clerk JavaScript loads from Clerk's Frontend API at runtime.
- A Clerk development instance (`pk_test_`) works on `*.workers.dev` but shows a development
  banner and has development limits. A production instance (`pk_live_`) needs a domain the
  owner controls, with Clerk's DNS records, so production means moving off `workers.dev`.
- Signing out happens in the browser through Clerk's `signOut()`.
- Local development keeps the development cookie sign-in; `AUTH_DEV_MODE=true` takes priority
  over Clerk in the sign-in page.

## Rejected alternatives

- Cloudflare Access: no sign-up flow of its own, no phone codes, and it gates the whole
  hostname, including the landing page.
- Building one-time codes in the app: needs an email and SMS sender, code storage, rate limits
  and session management.
- `@clerk/backend`'s `authenticateRequest`: adds a dependency for checks the existing `jose`
  verifier already performs (signature, issuer, expiry, azp).
