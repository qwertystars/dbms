# SERVER (Hono API)

All HTTP surface lives here: auth/session, trees, members/access (RBAC), persons (+photo upload), couples/children, generations (recursive CTE), kinship query. Earned its file: entry-point chain (src/index.ts -> app.ts), largest hotspot (~560 lines), every route touches D1.

## STRUCTURE
- `app.ts` - flat Hono route table under `/api/*`; exports default `app`
- `auth.ts` - PBKDF2-SHA256 hashing (100k iters), HMAC-signed stateless session cookies (30d TTL), WebCrypto only

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add endpoint | app.ts - follow existing handler shape |
| Role gating | `requireAccess(c, treeId, minRole)`; ranks viewer(1)<editor(2)<creator(3) |
| Session read/write | auth.ts; cookie helpers `sessionCookieValue`/`sessionSetCookie` |
| Bindings/env | `Bindings` interface in app.ts (DB, SESSION_SECRET, B2_*) |
| Untyped seams | `bad`/`currentUser`/`requireAccess` take `c: any`; `as never` casts at D1 boundaries |

## CONVENTIONS
- Client errors return `bad(c, status, message)` JSON - uniform `{message, ...extra}` shape; don't throw for expected failures.
- Middleware `/api/*` resolves `currentUser` into `c.get("user")` before handlers.
- Person mutable fields enumerated once in `PERSON_FIELDS`; extend there, not per-route.
- Generations uses recursive CTE capped at lvl 20.

## ANTI-PATTERNS
- No Node built-ins (fs, node:crypto) - Workers runtime + Node test parity relies on WebCrypto only.
- Don't duplicate role checks; always gate through `requireAccess`.
- Creator-only operations (role grants via POST /trees/:id/access) must not be relaxed to editor.
- Users self-joining a tree always land as viewer - keep that coercion.
