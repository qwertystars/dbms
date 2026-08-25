# KINSHIP MODULE

Pure domain module (no I/O, no Workers APIs): classifies the kinship relation of person A to person B from a family-tree graph and resolves per-language kinship terms. Earned its file: distinct domain, own barrel, consumed by server routes and 50-test suite.

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Compute relation key (e.g. `fa_br_yo`) | classify.ts `classify(graph, fromId, toId)` |
| Build edge lists from persons/couples/child_of | graph.ts `buildAdjacency` |
| Gender / age comparisons on graph | graph.ts `genderOf`, `olderThan` |
| Term tables en/hi/ta/bn | terms.ts `TERMS`, `KIN_TERM_ROWS` (seed rows), `resolveTerms` |
| Graph shapes | types.ts (`KinshipGraph`, `EdgeKind`: 'up' \| 'sp' \| 'down') |

## CONVENTIONS
- Relation keys are underscore-joined path steps from the source person upward/across/downward (`fa_br_yo`); ~33 keys per language.
- Classification is deterministic pure-BFS over up/sp/down edges; gender 'o' (other) allowed alongside m/f; age ties default to younger.
- Terms module doubles as migration seed data (`KIN_TERM_ROWS` mirrors the kin_term rows in migrations/0002_seed.sql).
- All exports flow through index.ts (`classify`, `resolveTerms`, `TERMS`, `KIN_TERM_ROWS`, types); graph.ts/types.ts are internal-only.

## ANTI-PATTERNS
- Never import server/storage code here - keep this module dependency-free so tests run it in isolation.
- Do not add language-specific branching outside `TERMS`; add entries to the table instead.

## COMMANDS
```bash
pnpm exec vitest run test/kinship.test.ts   # 50-case classifier table suite
```
