# dbms-family QA evidence index

Success-criteria map. All commands run from repo root.

| SC | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| SC1 | Live happy path signup→login→create tree→seed Narayanan lineage→GET generations G1..G3 | `qa/transcripts/01..05,10-generations.txt`, `qa/live-qa.sh` (asserts band names/count) | PASS |
| SC2 | Kinship endpoint fa_br_yo → uncle/chacha/chittappa/kaka | `qa/transcripts/11-kinship-fa-br-yo.txt`, sanity `12-kinship-brother-el.json`; unit suite test/kinship.test.ts (50 tests) | PASS |
| SC3 | RBAC adversarial matrix | `20-rbac-viewer-put.txt`=403, `21-rbac-editor-put.txt`=200, `22-rbac-outsider-put.txt`=403, `23-rbac-creator-delete-tree.txt`=200 (+editor DELETE 403 inline in script log) | PASS |
| SC4 | Playwright UI flow: login→couples→small box→mother name→big modal all fields+kinship badge | `qa/ui/01-login.png`…`05-big-modal.png`, DOM assertions `qa/ui-qa.mjs`, badge cross-checked vs API (`paatti`, grandmo_pat) | PASS |
| SC5 | Schema integrity + mutation-proof | test/schema.test.ts (10 tests; role-CHECK weakening flipped suite RED then restored GREEN during build) | PASS |
| SC6 | B2 SigV4 adapter | test/b2.test.ts exact request shape vs stubbed fetch; live upload INCONCLUSIVE-BLOCKED-BY-CREDS (see SC6-verdict.md); live 503 b2_not_configured shape in `30-photo-unconfigured.txt` | PASS (unit) / INCONCLUSIVE (live) |

## Reproduce

```
pnpm exec vitest run          # 78 tests across schema/b2/kinship/api suites
pnpm typecheck
pnpm exec wrangler d1 migrations apply dbms --local --persist-to <dir>
pnpm exec wrangler dev --port 8788 --persist-to <dir>   # tmux recommended
bash qa/live-qa.sh            # needs server up; writes qa/transcripts/*
bash qa/ui-seed.sh && node qa/ui-qa.mjs                  # port 8790 instance
```

## Cleanup

See qa/CLEANUP.md — both tmux wrangler sessions killed, ports verified closed,
session jars and temp photo removed, local D1 persist dirs deleted.
