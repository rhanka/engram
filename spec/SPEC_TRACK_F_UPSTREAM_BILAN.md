# SPEC_TRACK_F_UPSTREAM_BILAN

## Status

This document is the durable contract for **Track F: Upstream parity weekly**, the recurring rescan process that keeps the TypeScript fork honest about its delta against the live Python upstream lines.

- Created: 2026-05-15
- TypeScript fork at creation: `graphifyy@0.9.0` (`main`)
- Upstream source: `https://github.com/safishamsi/graphify`
- Companion specs: `spec/SPEC_UPSTREAM_TRACEABILITY.md`, `spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md`
- Companion artefacts: `UPSTREAM_GAP.md` (row-level matrices), `PLAN.md` (Track F lots)

## Purpose

The earlier upstream catch-up tracks (Tasks A through M in `PLAN.md`) were one-shot parity passes against a frozen upstream commit. Track F replaces that pattern with a **weekly drift-control process**: every week, plus before every TypeScript minor/major release, the fork re-fetches upstream Python Graphify, classifies the new commits, and produces a publish-or-defer decision.

Track F is **not** a continuous parity guarantee. It is a guarantee that the gap is *known and classified*, so each TypeScript release can document exactly what is in and what is out.

## Scope

In-scope:

- Re-fetching upstream `v7`, `v8`, `main` refs and recording the observed commits/tags.
- Producing a row-level audit per new upstream commit since the last bilan.
- Classifying every row into one of four buckets (see `Buckets`).
- Surfacing must-port lots into `PLAN.md` as `F-Pn` / `F-Mn` / `F-Opt` rows.
- Maintaining the **Version Alignment** section in `UPSTREAM_GAP.md` that maps `graphifyy X.Y.Z` to the closest upstream Python parity reference plus an explicit delta.
- Recording each bilan as a snapshot in `UPSTREAM_GAP.md` (date + observed commits + bucket counts).

Out-of-scope:

- Implementing must-port lots themselves (those land under their normal F-Pn lot files).
- Driving the npm version directly from upstream tags. Versioning rule from `SPEC_UPSTREAM_TRACEABILITY.md` still holds: Python Graphify is the only source that can drive parity version numbers, but a Python tag never forces an npm bump on its own.
- CRG (`tirth8205/code-review-graph`) drift, which stays under Track C.

## Buckets

Every upstream commit (or coherent commit cluster) observed during a bilan must land in exactly one of these buckets:

- `must-port`: an upstream behaviour or fix that the TypeScript fork should adopt before the next minor/major bump. Generates an `F-Pn` (priority) or `F-Mn` (mandatory for parity claim) lot.
- `already-covered`: the TypeScript fork already implements the user-facing contract, either through earlier catch-up work or independently. Must cite a test name, verification command, or existing TS file.
- `intentional-delta`: the TypeScript fork deliberately differs from upstream while preserving (or improving) the user contract. Must cite the rationale (Python-only dep, `.graphify/` contract, ontology lifecycle, etc.).
- `defer`: a valid upstream concept that is not in the current TypeScript implementation scope. Must cite the reason (no requester, missing parser strategy, breaks fork guardrail, etc.) and the conditions for reopening.

A fifth informal bucket `release-only` may be used for upstream commits that touch only Python release metadata (version bumps, changelogs, Python-specific badges) and have no TypeScript-side action.

## Cadence

- **Weekly bilan** (minimum): every Friday or at the start of the next week. Even when no must-port lands, a no-op bilan still produces a snapshot row in `UPSTREAM_GAP.md` so the gap stays visible.
- **Pre-release bilan**: before every TypeScript minor (`0.X.0`) or major (`X.0.0`) bump, regardless of how recent the last weekly bilan is. The release notes must cite the bilan snapshot used to clear the release gate.
- **Triggered bilan**: when upstream publishes a notable security fix, a v8/v9 branch movement, or a v1.x/v2.x re-tag, an unscheduled bilan can run ahead of the weekly cadence.

## Source Locks

Each bilan must record the observed commits using `git ls-remote` (authoritative) plus the matching local tracking commit:

```bash
git ls-remote --heads --tags https://github.com/safishamsi/graphify \
  refs/heads/v7 refs/heads/v8 refs/heads/main \
  'refs/tags/v0.7.*' 'refs/tags/v0.8.*' 'refs/tags/v1.*' 'refs/tags/v2.*'
```

The tag-clobber rule from `SPEC_UPSTREAM_TRACEABILITY.md` still applies: local tags are not trusted; only `git ls-remote` results and branch HEAD commits count as proof. The bilan must surface SHAs explicitly so reviewers can re-verify offline.

## Outputs Per Bilan

Each bilan must produce or update the following:

1. **Section in `UPSTREAM_GAP.md`** — a bilan-dated row-level table with at least:
   - bilan date,
   - observed commits per ref (`v7`, `v8`, `main`),
   - new tags since previous bilan,
   - one row per upstream commit (or coherent cluster) with the bucket and a one-line rationale.
2. **Section "Version Alignment" in `UPSTREAM_GAP.md`** — kept current; documents how `graphifyy X.Y.Z` maps to upstream Python parity references, including the explicit TS-only delta description. This section is the single source of truth for the version-mapping question.
3. **Lots in `PLAN.md` (Track F)** — for each `must-port` row, append or update an `F-Pn` / `F-Mn` / `F-Opt` lot under the Track F section, with target commits, estimated effort, and the lot files expected to change.
4. **`Open F decisions` section in `PLAN.md`** — for each `defer` row that needs explicit owner approval (typically v1.x/v2.x hypergraph or wiki rewrite), keep an open-decision item with the trade-off summary.

## Snapshot Bilan #1 (2026-05-15)

This snapshot was produced by the inaugural Track F drumbeat agent on 2026-05-15. It is included here for traceability; future bilans will append rows in `UPSTREAM_GAP.md` rather than rewriting this spec.

Observed upstream state:

- `v7` branch advanced from the previously locked `a9b0ddb` (Track D close at `0.7.19`) with **7 new commits** in the `0.7.x` line.
- `v8` branch tracked separately — **24 commits**, with remote tag `v0.8.5` as the current stable head.
- `main` / `v2` branch — **36 commits**, with `v1.0.0` published as a pre-release that introduces hypergraph generation and wiki export rewriting.

Top must-port candidates surfaced by the bilan #1 audit:

- **Windows / hook stability**: Windows skill temp-file pollution fix, antigravity Windows skill + uv/pipx Python detection, hook installer hardening. Maps to lot `F-P1`.
- **Graph correctness**: `.graphifyignore` parent-exclusion rule, deduplication false-merges on short labels, suppress cross-language `INFERRED` calls/uses edges in surprising connections. MCP hot-reload of `.graphify/graph.json`. Maps to lot `F-P2`.
- **Parser depth**: SQL FK/trigger extraction expansion, Groovy parser depth and edge fidelity. Maps to lot `F-M1` (decision-pending; only mandatory if parity claim is needed against `v8`/`0.8.5`).
- **v1.x hypergraph + wiki export rewrite**: deferred until upstream stabilises. Tracked under `F-Opt`.

Version-alignment finding:

- TypeScript `graphifyy@0.9.0` is numerically ahead of upstream stable `graphify@0.8.5` but functionally behind on the Windows/hook + graph-correctness fixes listed above.
- Recommendation: keep `0.9.0` (driven by Track E dependency cleanup + bloat opt-in + Track C visual encoding, which are TS-only deltas), document the mapping in `UPSTREAM_GAP.md > Version Alignment`, and explicitly defer v1.x/v2.x hypergraph + wiki rewrite until the upstream main line stabilises and a separate spec authorises adoption.

## Bilan Process

A weekly bilan must follow these steps:

1. **Fetch refs.** Run the `git ls-remote` command above and record the new commits per ref.
2. **Diff against previous bilan.** Compute the commit range per ref (`prev_commit..new_commit`) and list the new commits with `git log --oneline` (resolved against a local clone of upstream).
3. **Classify each commit.** For each commit (or coherent cluster), apply one of `must-port` / `already-covered` / `intentional-delta` / `defer` (or the informal `release-only`). Cite evidence inline: TS file path, test name, or rationale.
4. **Update `UPSTREAM_GAP.md`.** Append a new bilan section with the dated table. Update the "Version Alignment" section if the mapping changes.
5. **Update `PLAN.md`.** Append must-port rows under Track F. Move closed must-ports to `[x]`. Update the `Open F decisions` section when new `defer` rows need owner input.
6. **Smoke gate (only when must-port lots have already landed).** After each must-port lot port, run the standard release-gate commands plus a `graphify update` smoke on this repo and on `../public-domaine-mystery-sagas-pack` to confirm no regression.
7. **Surface the bilan.** Report the bilan in the next conversation/PR description using `Fait / À faire / Attendu` (per the project operating rules), with explicit decisions requested for any new `Open F decisions`.

## Version Alignment Policy

The TypeScript `graphifyy` package version is driven by the union of:

- the closest upstream Python parity reference (the highest upstream tag whose runtime-relevant rows are all `covered`, `intentional-delta`, `deferred`, `rejected`, or `n/a` in `UPSTREAM_GAP.md`),
- plus TS-only deltas that justify a minor or major bump (Track E dependency hygiene, Track C HTML a11y + visual encoding, ontology lifecycle, descriptions, reconciliation studio).

This policy explicitly allows `graphifyy X.Y.Z` to be numerically *ahead* of upstream Python Graphify when TS-only deltas warrant a bump, as long as the **Version Alignment** section in `UPSTREAM_GAP.md` documents the mapping clearly. It also allows the TS line to *lag* upstream Python on numerically-newer features (e.g. v1.x hypergraph) when those features are deferred by Track F.

The policy explicitly **forbids**:

- mechanically mirroring upstream Python version bumps without TS-side parity rows being closed;
- skipping the **Version Alignment** update during a release-gate clearance;
- claiming parity against `v8` / `v0.8.x` while `must-port` rows from that line remain open.

## Decision Rules

- A `must-port` row may not stay open longer than two consecutive weekly bilans without being either closed, downgraded to `defer` with an explicit rationale, or reclassified to `intentional-delta`. The goal is to avoid an ever-growing parity backlog.
- A `defer` row may stay open indefinitely but must be revisited at least once per quarter to confirm it is still deferred.
- A row reclassified from `must-port` to `defer` must update the `Open F decisions` section with the reason and the reopen conditions.
- A row reclassified from `defer` to `must-port` must explain what changed upstream (new dependency removed, behaviour stabilised, security issue surfaced) and create the corresponding `F-Pn` / `F-Mn` lot.

## Implementation Rules

- Track F never blocks Track A/B/C/D/E lanes from shipping. It only blocks a parity claim against a specific upstream tag.
- Track F lots (`F-Pn` / `F-Mn` / `F-Opt`) must follow the same lane-scoring grid as the other tracks: Spec / Plan / Infra / UI / UAT / Release. UI is `n/a` for upstream-drift lots; UAT is the smoke walk after each must-port port.
- A Track F lot must cite the bilan that surfaced it (date + commit SHAs).
- Bilan snapshots must not be deleted or rewritten — only appended. The historical drift trace is part of the product contract.
- This spec must be updated only when the bilan process itself changes (cadence, buckets, outputs, decision rules). New bilan snapshots are recorded in `UPSTREAM_GAP.md`, not in this spec.

## Open Questions

- Whether the bilan should also include CRG (`code-review-graph`) drift, or keep CRG strictly under Track C. Current default: keep CRG under Track C; Track F only covers Safi Python Graphify.
- Whether v1.x hypergraph adoption needs a dedicated spec before any `F-Opt` row can move to `must-port`. Current default: yes, a separate spec is required, because hypergraph touches the `.graphify/graph.json` contract.
- Whether the wiki export rewrite shipped on upstream `main` should be classified as `intentional-delta` (the TS fork already has its own wiki/Obsidian/canvas surface) or as `defer` (re-evaluate when stable). Current default: `defer`, pending a comparison pass against the TS wiki surface.
