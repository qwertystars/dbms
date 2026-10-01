# Vendored anti-slop Oxlint plugin

Source: local skill bundle `install-anti-slop`, copied verbatim from
`~/.agents/skills/install-anti-slop/assets/anti-slop` via that skill's
`scripts/install.mjs` on 2026-09-27.

Upstream repository: unknown. The skill bundle does not record the upstream
project or commit it was taken from, and `~/.agents` is not under version
control, so no recoverable snapshot exists. The pristine copy remains at the
skill path above for diffing against future updates.

Installed here at `tools/oxlint/anti-slop/` and registered in `.oxlintrc.json`
as the `anti-slop` jsPlugin; the `effect/` sub-plugin is vendored but not
registered because this repository does not declare a direct `effect`
dependency.

Intentional deviations: none — files are byte-identical to the skill bundle.

Companion components:

- `vendor/eslint-stylistic/` carries its own `LICENSE` (MIT) and
  `UPSTREAM.md` (eslint-stylistic commit 435c3ea0fd26a5fef9042c4b36b6e165fbbf8d08)
  documenting its provenance and local adaptations.
- `tools/oxlint/anti-slop/` is listed in `ignorePatterns` so the vendored code
  is not linted as application source.

## Install notes (this repository)

- `oxlint`, `@oxlint/plugins`, and `@oxlint/binding-linux-x64-gnu` are pinned
  at exact version 1.85.0 in `package.json` `devDependencies`. The binding is
  pinned as a direct devDependency because the install environment's network
  repeatedly dropped the optional-dependency tarball; a direct pin keeps
  reinstalls deterministic on this glibc/x64 host.
- `.oxlintrc.json` registers `./tools/oxlint/anti-slop/index.ts` as the
  `anti-slop` jsPlugin and enables all generic rules at `error`. The `effect/`
  sub-plugin is vendored but not registered: no `effect` dependency is declared.
- Agent/tooling directories are excluded via `ignorePatterns` rather than
  linted as application source.
