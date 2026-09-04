# Evidence — login/signup 500 fix (2026-08-25)

Root cause: local D1 was never migrated -> `no such table: users` -> every auth
handler threw -> miniflare text/plain 500.

## RED (before fix)
- qa/evidence/auth-500-red/signup-500.txt  (POST /api/signup -> 500 text/plain)
- qa/evidence/auth-500-red/login-500.txt   (POST /api/login  -> 500 text/plain)
- qa/evidence/auth-500-red/wrangler-stack.txt (D1_ERROR: no such table: users)
- qa/evidence/auth-500-red/d1-empty-schema.txt (sqlite TABLES: [])

## GREEN (after fix: migrate + onError + app.js message + auto-migrate)
- qa/evidence/auth-500-green/signup-201.txt  (201 + Set-Cookie + user JSON)
- qa/evidence/auth-500-green/login-200.txt   (200 + Set-Cookie)
- qa/evidence/auth-500-green/me-200.txt      (200 user.email matches)
- qa/evidence/auth-500-green/dup-409.txt     (409 {message})
- qa/evidence/auth-500-green/badpw-401.txt   (401 {message})
- qa/evidence/auth-500-green/fresh-persist-signup-201.txt (auto-migrate: fresh DB -> 201)
- qa/evidence/auth-500-green/signup-final-201.txt / login-final-200.txt / me-final-200.txt (live re-verify)

## Browser (Playwright, real page on tailnet)
- qa/evidence/auth-500-green/browser/action-log.txt (AUTH QA PASSED)
- qa/evidence/auth-500-green/browser/01..08-*.png (login page, signup tab+form,
  after-signup trees, after-logout, login filled, after-login trees,
  wrong-password banner showing "invalid credentials")

## Tests
- 86 passed (was 84; +2 FK regression). typecheck clean.
