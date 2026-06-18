# codex/quality-target-qa

## Objective

- [ ] Implement `SPEC_EVOL_TARGET_CONFIGURATION_QA`: persisted quality targets, resolved run manifest, deterministic `graphify qa`, and publication preflight gates.
- [ ] Preserve the validated distinction between exhaustive citation extraction and bounded inline `top_k` display.
- [ ] Reject the Opus incident class: scratch provenance, bounded/minimum citation producer, partial sidecar, zero reconciliation, stale QA report.

## Scope / Guardrails

- [ ] Allowed: `src/types.ts`, `src/project-config.ts`, `src/cli.ts`, `src/citations.ts`, `src/workspace-manifest*.ts`, new `src/quality-target*.ts`, new `src/qa*.ts`, focused tests under `tests/`, `spec/SPEC_EVOL_TARGET_CONFIGURATION_QA.md`.
- [ ] Forbidden: `Makefile`, `docker-compose*.yml`, `.cursor/rules/**`, unrelated studio UI redesign, Mystery pack data regeneration, provider/network extraction.
- [ ] Conditional BR-EX1: `src/ontology-studio*.ts` only if a local publication/preflight command already exists there and needs target gating.
- [ ] Conditional BR-EX2: `.track/**` only via `track branch import` bookkeeping, not staged in feature commits unless explicitly requested.

## Lot 0 - Spec And Branch Plan

- [x] Commit validated EVOL spec and this branch plan.
- [x] Verify spec has two-pass xhigh validation log and implementation status.
- [x] Gate: `git diff --cached --stat` contains only `BRANCH.md` and `spec/SPEC_EVOL_TARGET_CONFIGURATION_QA.md`.

## Lot 1 - Target Config And Contract Model

- [x] Add quality target types and target-only loader that can parse `quality.targets` without requiring `profile.path` or `inputs.corpus`.
- [x] Add structured citation extraction contract canonicalization and hash validation.
- [x] Add unit tests for target parsing, invalid target shape, contract hash mismatch, unknown/bounded citation mode, extraction-unit coverage.
- [x] Gate: targeted vitest for quality-target tests and `npm run lint`.

## Lot 2 - Manifest And QA Evaluators

- [x] Add resolved target manifest model with structured artifact provenance and extraction units.
- [x] Add pure QA evaluators for manifest, graph counts, citation sidecar coverage, reconciliation completeness, data-only chrome tree hashes.
- [x] Add fixture tests for scratch provenance rejection, sidecar partial/stale rejection, truncated reconciliation response rejection, stale QA report hash rejection.
- [x] Gate: targeted vitest for QA evaluator tests and `npm run lint`.

## Lot 3 - CLI Surface

- [x] Add `graphify qa --target <id> --bundle <path> [--config <path>] [--write-report] [--fail-on-error]`.
- [x] Emit deterministic JSON QA report and human-readable failure summary.
- [x] Add CLI tests for pass/fail exit behavior and report writing.
- [x] Gate: targeted vitest for CLI QA tests and `npm run lint`.

## Lot 4 - Publication Preflight And Final Review

- [x] Wire QA preflight into any existing targetable bundle/publication path that serves/copies/pushes a studio bundle.
- [x] Add final regression fixture representing the Opus incident failure class.
- [x] Run `npm test`, `npm run lint`, and `npm run build`.
- [x] Run double xhigh implementation review and resolve blocking findings.
- [x] Run `npx graphify hook-rebuild` after code edits.
- [x] Gate: PR opened only after tests, review, graph rebuild, and clean intended diff.

## Feedback Loop

- [x] BLOCKER: no existing publication command may exist; if so, implement `graphify qa` first and defer preflight wiring to the nearest existing command with explicit note.
- [ ] BLOCKER: deploy/merge requires GitHub permissions and CI green.
