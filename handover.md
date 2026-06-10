# Graphify conductor handover for Claude

Date: 2026-06-09
Repo: `/home/antoinefa/src/graphify`
Branch: `main`
Baseline HEAD before current working-tree patch: `25a5e31f6e115985aace6a34f011df171394e0d3`
Reason for this file: machine/session crash recovery; Claude is expected to resume the open conductor work from this file plus Track.

## Conductor intent

Goal: drive Graphify to 100% on GraphCanvas, process-std-AM ontology support, and Track F residuals, with maximum delegation and minimum user interruption.

Non-negotiables:
- No Python server in this npm project.
- Keep legacy graph viewer/reference available for visual comparison while GraphCanvas parity is not fully accepted.
- Do not duplicate process-std-AM implementation work: `claude:process-std-am` is reviewer/contract peer, not owner of graphify-side implementation.
- After code edits, run graph rebuild/update before completion.
- Do not reset or revert unowned work.

## Track locked state

Track was updated with actionable criteria for WP1, WP4, WP5, and WP6.

Validation:
- `track validate --commit HEAD`
- Result before this crash handover update: `OK: 126 events, integrity + desync clean`
- After editing this file, the conductor must add one final Track dossier event and rerun `track validate --commit HEAD`.

Known Track anomaly:
- `track report --commit HEAD --decisions --require-accepted` still reports several `done` items as `unknown`.
- WP6 has acceptance criteria and pass runs, but still appears `done · unknown`.
- This is a Track semantics/tool issue, not a blocker for GraphCanvas work.
- A bug-report was sent to the Track peer earlier; keep it as WP5/Track-tool follow-up.

## Live h2a owners

Use the live instance IDs from discovery, not guessed aliases.

| Role | Live instance | Responsibility |
| --- | --- | --- |
| Graphify implementation delegate | `claude:graphify_subagent:16e5618cd36f` | WP1 renderer parity, WP4 graphify-side ontology model, WP5 F residual implementation/bilan |
| process-std-AM reviewer | `claude:process-std-am:7da25b17aad4` | Review process-std-AM hierarchy/ontology contract and fixtures only |
| Track peer | `claude:track:238a89077319` | Investigate acceptance `unknown` anomaly and Track F semantics |
| Current Codex conductor | `codex:graphify:b7615bbd3189` | Integration gates, validation, commits, graph rebuild, Pages/mysterypack publication |

## Current working tree

Uncommitted GraphCanvas parity patch is present. Do not discard it.

Files changed:
- `.track/events.jsonl`
- `.track/head.json`
- `packages/graph/src/renderer.ts`
- `studio/src/components/GraphCanvas.svelte`
- `studio/src/lib/graphRendererPayload.js`
- `studio/src/tests/graphCanvasRenderer.test.js`
- `studio/src/tests/graphRendererPayload.test.js`
- `docs/studio/index.html`
- `docs/studio/assets/index-DuuRlwWm.js` added
- `docs/studio/assets/index-UNDgAy_n.js` deleted

## GraphCanvas patch already applied

WP1 regression context:
- User reported that after replacing legacy forcegraph with `@sentropic/graph`, node glyphs became too large.
- Edge hover was missing/weak.
- Hover felt less fluid than legacy.
- Legacy must remain available for comparison.

Implemented in working tree:
- `packages/graph/src/renderer.ts`
  - Reduced non-circle glyph scale for diamond, square, rounded square, triangle, hexagon, and star.
  - Removed area-preserving constants that made shapes visually larger than legacy.
- `studio/src/lib/graphRendererPayload.js`
  - Added `baseStyle`.
  - Added `buildConnectedDimStyle(payload, options)` for incremental hover dimming.
  - Node hover no longer needs full graph payload rebuild for style-only hover changes.
- `studio/src/components/GraphCanvas.svelte`
  - Uses `buildConnectedDimStyle` on node hover.
  - Keeps tooltip position fresh when hovering the same node.
  - Restores visible edge hover by widening/recoloring hovered edge.
  - Avoids extra edge-clear render before node hover.
- Tests added for incremental hover and edge hover markers.

Validation already passed:
- `npm --prefix studio test -- src/tests/graphCanvasRenderer.test.js src/tests/graphRendererPayload.test.js`
- `node --check studio/src/lib/graphRendererPayload.js`
- `npm --prefix packages/graph test`
- `npm --prefix packages/graph run build`
- `npm --prefix studio run build`
- `npm run lint`
- `npm run build`

Latest validation diagnostics before crash:
- Full `npm test` in sandbox fails on local server bind (`listen EPERM: operation not permitted 127.0.0.1`) in `tests/ontology-studio-write.test.ts`.
- Full `npm test` outside sandbox was restarted, but did not complete cleanly before handover. Do not claim it passed.
- Targeted reproduction:
  - `npm test -- tests/storage-import-guard.test.ts --reporter=verbose`
  - Result: first static import guard passes; runtime guard times out at 30s.
  - Root-cause hypothesis: positive-control call `api.pushToNeo4j(new Graph(), "bolt://localhost:7687", ...)` evaluates the mocked driver but can continue into connection/push work instead of rejecting quickly.
  - Next check: make the positive control prove dynamic import without waiting on a real connection path, or inject a minimal driver shape that fails fast after evaluation.
- Targeted reproduction:
  - `npm test -- tests/cli-runtime.test.ts -t "prefers exact path and explain matches over higher-degree substring matches" --reporter=verbose`
  - Result: test times out at 30s. Import/transform time is high in this environment; still inspect `runCli`/`path`/`explain` before treating it as only a timeout-budget issue.

Validation still required before commit/push:
- Resolve or explicitly classify the two timeout tests above.
- Run graph update/rebuild: prefer `npx graphify update --force .`, then `npx graphify check-update .`.
- Run `git diff --check`; if generated Vite bundle reports unavoidable minified-line whitespace, report it explicitly rather than hand-editing the hashed bundle.

## Workpackage status

| WP | Status | % | Owner | Fait | A faire | Attendus |
| --- | --- | ---: | --- | --- | --- | --- |
| WP0 Conductor baseline | in integration | 92 | Codex conductor | Main is current; Track criteria locked; h2a owners clarified; crash handover written | Commit/push current conductor state after validation | Single source of truth: Track + this handover |
| WP1 GraphCanvas rich parity | in progress | 85 | `claude:graphify_subagent` + Codex gate | Glyph scale, edge hover, incremental hover patch applied; focused tests/build/lint pass | Resolve/classify two timeout tests, graph rebuild, commit/push, public mysterypack republish, visual UAT vs legacy | GraphCanvas at 100% parity or better: shapes, dashed/bold/curved edges, transparency, hover, merge animations incl. links |
| WP2 DS header compliance | mostly done | 90 | DS peer / Codex gate | Earlier DS header work merged | Recheck after current bundle publication | Header conforms to Sent-Tech DS in studio/public |
| WP3 Storage backends | done-ish | 85 | Graphify delegate | Neo4j/storage prior work tracked | Confirm no new regression from current renderer work | Storage strategy documented/tested for neo4j/spanner-like adapters |
| WP4 process-std-AM ontology hierarchy lifecycle | in progress | 45 | `claude:graphify_subagent`; `claude:process-std-am` reviews | Track criteria added for parent-child hierarchy and ontology status lifecycle | Implement graphify-side hierarchy + inferred/proposed/validated/reference model; build fixture; ask process-std-AM for review only | process-std-AM-compatible ontology export/patch contract |
| WP5 Track F residuals | in progress | 35 | `claude:graphify_subagent` + Track peer | Criteria added for F-0820..F-0827 bilan and CI acceptance | Produce residual map marker -> commit/skipped/next; handle Track acceptance anomaly | No untriaged F-x residual; Track semantics clear |
| WP6 Public UAT / mysterypack | previously OK, needs republish for new patch | 90 | Codex conductor | Previous public `/studio/` UAT was OK and not legacy `graph.html` | After current commit, copy new `docs/studio` bundle to mysterypack, build/test/commit/push, verify public URL | `https://mystery-saga.sent-tech.ca/studio/` serves current GraphCanvas parity bundle |
| WP7 h2a coordination | active | 85 | Codex conductor | Live peers identified; responsibilities separated; handover prepared for live Claude peer | Send/reforward this handover to `claude:graphify_subagent`; keep process-std-AM as reviewer | Delegation without duplicate implementation |
| WP8 Harness migration | awaited/deferred | 50 | Track/Harness later | Tracked as direction | Do not spend conductor focus unless user asks | Migration path out of superpowers, not blocking WP1/WP4/WP5 |

## Immediate runbook

1. Send this handover to `claude:graphify_subagent:16e5618cd36f`.
2. Rerun full validation:
   - First resolve or classify `tests/storage-import-guard.test.ts` and the focused `tests/cli-runtime.test.ts` timeout.
   - Then rerun `npm test` outside sandbox if local server tests need it.
   - `npx graphify update --force .`
   - `npx graphify check-update .`
   - `git diff --check`
3. Commit graphify changes, likely message:
   - `fix(studio): restore GraphCanvas hover parity`
4. Push `main`.
5. Publish current studio bundle to mysterypack:
   - Copy `docs/studio/` content into the mysterypack public graphify studio location.
   - Keep older asset files if needed for cache safety.
   - Run mysterypack build/test.
   - Commit/push mysterypack.
   - Verify `https://mystery-saga.sent-tech.ca/studio/?v=<commit>` and current JS markers.
6. Continue WP4:
   - Implement graphify-side hierarchy and ontology lifecycle.
   - Produce an process-std-AM representative fixture.
   - Ask `claude:process-std-am:7da25b17aad4` for review only.
7. Continue WP5:
   - Produce F-0820..F-0827 residual bilan.
   - Tie each residual to commit/skipped/next.
   - Track acceptance anomaly remains a tool bug to clarify with `claude:track:238a89077319`.

## Acceptance criteria now in Track

WP1:
- Glyph scale/shape parity with legacy/reference.
- Edge hover relation visibility and emphasis.
- Hover fluidity without full graph rebuild on every pointer move.
- Legacy comparison artifact retained.

WP4:
- Parent-child/type hierarchy exported and stable.
- Ontology layer status model: inferred/proposed/candidate/validated/reference.
- process-std-AM representative fixture/contract reviewed by process-std-AM.

WP5:
- F-0820..F-0827 residual bilan complete.
- Acceptance only after local lint/build/test and green CI on main.

WP6:
- Public mysterypack studio published at `/studio/`, not legacy `/graph.html`.
- Index and JS assets load with expected GraphCanvas markers.

## Final caution

Do not call WP1 done until the current parity patch is committed, pushed, graph-updated, and republished to mysterypack. The previous public UAT was good for P0, but the new shape/hover/fluidity fixes are still local in this working tree.

Do not call the repository green until the two timeout diagnostics above are resolved or explicitly accepted as unrelated environmental/test-budget issues with evidence.
