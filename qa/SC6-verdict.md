# SC6 — Backblaze B2 adapter verdict

**Live upload: INCONCLUSIVE-BLOCKED-BY-CREDS**

- Environment at verification time (2026-08-22): `B2_KEY_ID` / `B2_APP_KEY`
  absent from env (checked via `env | grep -i B2_` → NO_B2_KEYS_IN_ENV).
- What IS proven:
  - Unit: test/b2.test.ts asserts the exact S3-SigV4 signed request shape
    (method PUT, url endpoint/bucket/key, x-amz-date, x-amz-content-sha256,
    Authorization UNSIGNED-PAYLOAD-derived signature) against a stubbed fetch — 8/8 green.
  - Live shape without keys: POST /api/persons/:id/photo on wrangler dev returns
    `HTTP/1.1 503` with body `{"error":"b2_not_configured",...}` — captured in
    qa/transcripts/30-photo-unconfigured.txt.
- To unblock live upload: export B2_KEY_ID and B2_APP_KEY (S3-compatible master/
  application key) plus B2_ENDPOINT/B2_BUCKET for the target bucket, then re-run
  the upload route.
