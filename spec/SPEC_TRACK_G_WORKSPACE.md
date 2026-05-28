# Track G — Workspace Import Spec

**Status:** Draft, locked for Lot 1 implementation.
**Owner:** Track G.
**Source pattern:** `~/src/process-std-am/viewer/` (Svelte 5, internal client-org PROCESS_STD tool — production reference, not vendored).
**Target host:** Graphify TypeScript runtime + `src/ontology-studio.ts` write surface (Track B successor).
**Companion tracks:** Track A (descriptions sidecars) and Track C (HTML a11y / visual encoding). Track G inherits, never duplicates.

## Why this spec exists

Track B's first reconciliation studio reached "ergonomically inadequate for real UAT" status and was parked (PR #40, draft + `parked` label). The pattern process-std-am has converged on (workbench + central display + graph panel + accordion detail) is a more honest match for the "humans review evidence, accept/reject candidates, see graph context" job. This spec ports that pattern into Graphify primitives while keeping Graphify generic.

Three rules govern the import:

1. **Pattern, not corpus.** `Process`, `Org`, `Tool`, `ABPProcess`, `DigitalApplicationTool`, etc. are process-std-am domain concepts. They MUST NOT leak into Graphify core. Their generalisation in Graphify is: any ontology profile declares its own node types and they render through the same display surfaces.
2. **Evidence and Audit are core.** Reconciliation evidence (source ref + snippet + confidence) and patch audit logs are generic enough to live in Graphify core. Anything beyond that (process trees, hierarchies, taxonomy bubbles) is profile-driven view configuration.
3. **No regression.** Existing Graphify surfaces (`graph.html` export, wiki, `GRAPH_REPORT.md`, MCP, CLI/skill runtime) keep their contracts. The workspace is an additive opt-in studio surface, not the default product facade.

## Contract: generic viewer state

Source reference: `~/src/process-std-am/viewer/src/lib/viewerState.js`. The Graphify equivalent strips client-org-specific defaults (no `framework`, no `processes.activeTree="abp"`, no `Process` taxonomy bias) and exposes:

```ts
// src/workspace/viewer-state.ts (Lot 1 target)
export interface WorkspaceViewerState {
  /** Generic active view label. Profiles MAY add custom views via composition. */
  activeView: string;                    // default: "workspace"

  /** Active type filter — "all" or an ontology node type id from the profile. */
  activeType: string;                    // default: "all"

  /** Free-form facet state. Keys come from the profile, not hard-coded. */
  facetState: Record<string, string>;    // default: {}

  /** Selected types and entities tracked for the workbench memory. */
  selectedTypes: string[];               // default: []
  selectedEntities: string[];            // default: []

  /**
   * displayRef — what the central display panel renders.
   * Canonical scheme: "entity:<id>" | "type:<id>" | "taxonomy:<id>" | "overview" | null.
   * Profiles MAY define custom schemes (e.g. "candidate:<id>" for reconciliation)
   * but MUST register a resolver in resolveDisplayModel.
   */
  displayRef: string | null;             // default: null

  /** Multi-selection memory used by Workbench filter chips. */
  selectionState: {
    kind: "overview" | "type" | "members" | "candidate-queue" | string;
    ref: string;                         // default: "selection:all"
    entityIds: string[];                 // default: []
  };

  /** Single-entity focus for graph hops + detail drawer. */
  focusEntityId: string | null;
  drawerOpen: boolean;

  /** Graph panel sub-state — generic enough to apply to any node type. */
  viewState: {
    graph: {
      mode: "selection" | "focus" | "overview";
      showWeakLinks: boolean;            // default: false
      aggregation: "type" | "community" | "none"; // default: "type"
      focusHops: number;                 // default: 1
    };
    evidence: { mode: "focus" | "all" }; // default: "focus"
  };
}
```

**Generalisation rule:** any profile-specific sub-state (e.g. `processes.activeTree` in process-std-am) is allowed only as a profile-declared extension key under `viewState`. Graphify core does not know what `processes.activeTree` means; the workspace component reads it through a registered profile adapter or ignores it.

## Contract: display model resolver

Source reference: `~/src/process-std-am/viewer/src/lib/displayModel.js > resolveDisplayModel`.

Graphify equivalent:

```ts
// src/workspace/display-model.ts (Lot 1 target)
export interface DisplayModelInput {
  displayRef: string | null;
  activeEntity: GraphNode | OntologyEntity | ReconciliationCandidate | null;
  records: ReadonlyArray<unknown>;          // current filtered slice
  dataset: WorkspaceDataset;
  totalEntities: number;
}

export interface DisplayModel {
  title: string;
  description: string;                       // Markdown, source-grounded
  kind: "entity" | "type" | "taxonomy" | "candidate" | "overview" | string;
  /**
   * Description Track A integration: when `kind === "entity"` and the entity
   * has a wiki description sidecar entry (graphify_wiki_description_v1), the
   * sidecar markdown MUST be rendered as part of `description`. This is the
   * "description in central reading surface" rule.
   */
  trackADescription?: TrackADescriptionRef;
}
```

**Description integration rule (Track A native):** `resolveDisplayModel` reads the wiki descriptions sidecar (`.graphify/wiki/descriptions.json` schema `graphify_wiki_description_v1`) when present, and concatenates the entity description + registry facts in the same Markdown block. Track A descriptions are not a separate display mode; they are the body of the entity display.

## Contract: workspace shell layout

Source reference: `~/src/process-std-am/viewer/src/App.svelte` + `WorkspaceShell.svelte`.

Graphify shell (Lot 1):

```
+-------------------------------------------------------------+
|  ShellHeader: title, mode toggle, status (rebuild, conn)    |
+----+--------------------------------------------------+-----+
| L  |  Central display (DisplayModel.description       |  R  |
| e  |  rendered as Markdown; Track A description       |  i  |
| f  |  inline; entity/type/candidate context)          |  g  |
| t  |                                                  |  h  |
|    |  ----- divider -----                             |  t  |
| W  |                                                  |     |
| o  |  GraphPanel (focusHops, showWeakLinks toggle,    |  D  |
| r  |  legend inherited from Track C)                  |  r  |
| k  |                                                  |  a  |
| b  |                                                  |  w  |
| e  |                                                  |  e  |
| n  |                                                  |  r  |
| c  |                                                  |     |
| h  |                                                  |     |
+----+--------------------------------------------------+-----+
```

- **Left Workbench** = search + facets + selection memory + result groups. Mobile (`<= 768px`): collapses to a top sheet; tap to reopen.
- **Central display** = single column, Markdown render at top, graph panel below. The reconciliation candidate context (when active) replaces the description block with the candidate / canonical comparison; everything else stays put.
- **Right Drawer** = detail accordion: evidence list, relations, audit trail (deduped by patch id, sources cited).
- **Header** = read-only / write-enabled indicator, last-rebuild timestamp, current profile id.

A11y / Track C inheritance is mandatory: keyboard tab order, ARIA labels, focus management, live regions for status announcements, non-color-only encoding (file_type → shape, relation → edge style), legend panel.

## Lot 1 — implementation breakdown

| Lot | Outcome | Files (target) | Tests |
| --- | --- | --- | --- |
| **G1 Token adapter** | `@sentropic/design-system` consumed via narrow adapter; local fallback adapter so studio runs without the DS installed. | `src/workspace/tokens.ts`, `src/workspace/tokens-fallback.ts` | `tests/workspace-tokens.test.ts` (DS available → DS path; DS absent → fallback path emits valid CSS variables). |
| **G2 Workspace shell** | Layout primitives (Header / LeftWorkbench / CentralDisplay / GraphPanel / RightDrawer) as inert HTML scaffold first; Svelte studio later. Mobile breakpoint at 768 px. | `src/workspace/shell.ts` (static HTML for `graphify ontology studio`), `src/workspace/shell.css` | `tests/workspace-shell.test.ts` (render, breakpoint, no scroll horizontal at 390 px). |
| **G3 Viewer state model** | `WorkspaceViewerState` + reducer + URL serialisation (parity with process-std-am `viewerStateToQuery`). | `src/workspace/viewer-state.ts` | `tests/workspace-viewer-state.test.ts` (defaults, normalise partial, serialise round-trip). |
| **G4 Display model + Track A integration** | `resolveDisplayModel` with entity / type / taxonomy / candidate / overview branches; Track A sidecar inlined. | `src/workspace/display-model.ts` | `tests/workspace-display-model.test.ts` (overview, entity, candidate; Track A sidecar present vs absent; insufficient_evidence handled). |
| **G5 Reconciliation rebind** | Existing Track B endpoints (`ontology studio` queue, candidates, audit, patch validate/dry-run/apply) consumed through the new shell + state model, no behavioural regression. | `src/ontology-studio.ts` (refit to G2-G4) | `tests/ontology-studio-write.test.ts` re-run; new `tests/workspace-reconciliation.test.ts` covering: filter→pick candidate→render evidence/canonical/patch preview→audit trail dedup. |

**G1–G4 are independently testable without an LLM call.** G5 reuses the existing reconciliation queue / patch APIs (no new backend surface in Lot 1).

## Design system completion requests

These are the asks for `@sentropic/design-system`. They are blockers for G1 finishing as DS-backed (not blockers for G1 fallback path).

1. **Token contract export.** Stable, semver-versioned JSON or `.d.ts` export of:
   - colour roles: `surface`, `surface-2`, `border`, `text`, `text-muted`, `accent`, `danger`, `success`, `warning`;
   - typographic roles: `font-family-sans`, `font-family-mono`, `font-size-sm/md/lg`, `line-height-tight/normal`;
   - spacing scale `space-0..space-7`;
   - radius scale `radius-sm/md/lg`;
   - elevation: `shadow-card`, `shadow-popover`.
2. **Light + dark palette parity** for all colour roles. Track C contrast levels must be reachable in both themes (WCAG AA min for text, AAA for `text` on `surface`).
3. **`prefers-reduced-motion` neutral defaults.** Animations limited to focus rings and overlay transitions; never tied to content layout shifts.
4. **Focus-ring token** (`outline`, `outline-offset`, `outline-color`) independent of accent colour, contrast verified against `surface` and `surface-2`.
5. **Distribution form.** `@sentropic/design-system` MUST publish as ESM (`exports` map) with a stable subpath for tokens-only consumption (`@sentropic/design-system/tokens`) so the adapter does not pull in Svelte components when running in the Node CLI build of `graphify ontology studio`.

Until the DS ships these, the workspace runs on the local fallback adapter (`tokens-fallback.ts`), which emits a deterministic CSS-variable set covering the same roles with Graphify-only defaults (slate-neutral, no client-org / no PROCESS_STD look-and-feel).

## Non-regression checklist (gate before Lot 1 PR)

- [ ] `npm test` green (existing + new workspace tests).
- [ ] `npm run lint` clean.
- [ ] `npm run build` clean.
- [ ] `graphify export wiki` unchanged on the public-pack corpus (Track A descriptions still inlined).
- [ ] `graph.html` export unchanged on the repo's own `.graphify/` (Track C shapes / edges / legend untouched).
- [ ] `GRAPH_REPORT.md` content unchanged on the public-pack corpus.
- [ ] `graphify ontology studio --config ../public-domaine-mystery-sagas-pack/graphify.yaml` boots, the workbench shows the reconciliation queue from the public-pack, and at least one accept/reject/dry-run/apply path works end-to-end through the new shell.
- [ ] Mobile (390 × 844) renders without horizontal scroll, workbench reachable via top sheet.
- [ ] No hard-coded `Process` / `Org` / `Tool` / `ABPProcess` strings in `src/workspace/*`.

## What this spec is NOT

- It is **not** a process tree or organisation hierarchy view. Those are process-std-am specifics. If a profile wants them, it declares them and a profile adapter renders them — the spec only mandates a slot for profile-declared view extensions.
- It is **not** a Svelte studio in Lot 1. Lot 1 ships the static-HTML shell consumed by `graphify ontology studio` (server-rendered, no client framework). The Svelte studio package is a follow-up lot once the shell + state model + reconciliation rebind have proven the contract.
- It is **not** a Track A or Track C replacement. Both tracks are dependencies, not subsumed.

## Resolved decisions (2026-05-19)

1. **Profile view extensions slot** — locked at `outputs.workspace.view_state` in `ontology-profile.yaml`. Convention parity with the already-shipping `outputs.html.*` and `outputs.wiki.*` blocks. Profile declares its own sub-keys (e.g. `processes`, `evidence_modes`) and a profile adapter under `src/workspace/profile-adapters/` resolves them. Graphify core does not interpret these sub-keys; an unknown adapter falls through to the generic display.
2. **`displayRef` candidate scheme** — locked at `candidate:<id>` where `<id>` is the reconciliation candidate identifier from `graphify_ontology_reconciliation_candidates_v1`. Stale-fallback policy: when the referenced entity is absent from the current graph (refresh between candidate generation and display), the candidate stays visible with a `entity absente du graphe courant — rebuild requis` banner; queue navigation is not auto-skipped, so drift is loud, not hidden.
3. **Track A `insufficient_evidence` rendering** — hide the description block entirely, parity with the current wiki rendering (`SPEC_WIKI_ENTITY_DESCRIPTIONS.md > insufficient-evidence behavior`). The rest of the entity central view (graph context, evidence list, audit trail) stays rendered. No placeholder, no status badge: zero visual noise for profiles that have not generated descriptions yet.

All Lot 1 open questions are now closed. Implementation may proceed.

## Source pointers

- process-std-am viewer state: `/home/antoinefa/src/process-std-am/viewer/src/lib/viewerState.js`
- process-std-am display model: `/home/antoinefa/src/process-std-am/viewer/src/lib/displayModel.js`
- process-std-am shell: `/home/antoinefa/src/process-std-am/viewer/src/App.svelte`
- process-std-am components: `/home/antoinefa/src/process-std-am/viewer/src/components/`
- Track A sidecar schema: `spec/SPEC_WIKI_ENTITY_DESCRIPTIONS.md > graphify_wiki_description_v1`
- Track C visual encoding: `UPSTREAM_GAP.md > "CRG v2.3.3 Row-Level Audit"` and `spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md`
- Reconciliation queue schema: `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md > graphify_ontology_reconciliation_candidates_v1`
- Patch core: `src/ontology-patch.ts`, `src/ontology-reconciliation.ts`

## Studio UI target — process-std-AM alignment (recorded 2026-05-27, user UAT on the public pack)

Live references: process-std-am viewer (`cd ~/src/process-std-am/viewer && npm run dev`) ; Graphify studio (`graphify ontology studio --config <project>/graphify.yaml`).

### Architecture principle (binding)
The studio is the **single, full model**. `graph.html` (`graphify export html`) must become a **lighter sub-view of that same model**, not a separate export. Today the studio merely **iframes** `graph.html` (`src/workspace/graph-panel.ts > renderViewerSurface`) — that crude embedding is exactly what the unification must replace.

### Facets vs Type vs Communities vs Processes (clarified from the process-std-am source)
- **Type** — filter by entity *type* (Process/Org/Tool in process-std-am ; Character/Work/Case/… in the mystery pack). Ref: `TypeFilterBar.svelte`.
- **Facets** — filter by entity *attributes*. process-std-am: `framework, hasMedia, hasDocuments, reviewStatus, assertionBasis`. Generic: profile-declared filterable attributes (incl. reconciliation `review_status` / `assertion_basis`). Ref: `FacetPanel.svelte`.
- **Communities** — Graphify Louvain clustering. **Not an process-std-am concept** — a Graphify-specific addition.
- **Processes** — process-std-am domain taxonomy tree (`processes.activeTree`); generically a profile-declared view extension (e.g. Work→Chapter), not core.

### Target layout — 8 points (process-std-AM aligned)
1. **Graph canvas always light** — the dark theme is DS-incompatible for the graph; the canvas keeps a light background regardless of app theme. (`#graph` background must not follow the dark `--ws-surface`.)
2. **Box nodes = border + transparent fill** (hollow). Renderer already does this (`src/export.ts isOutlinedShape` → `rgba(0,0,0,0)`); the filled boxes seen on the pack were a **stale `graph.html`** (2026-05-22) — a re-export with ≥0.10.0 fixes it.
3. **Graph takes the full center section** in studio mode — no community list / node-info panel inside the canvas.
4. **Only the legend** (shapes + edges) stays bottom-right of the canvas.
5. **Left column = accordion, collapsed by default**: Type, Facets, Results (parity with process-std-am `LeftWorkbench`).
6. **Communities panel** in the left column **above Facets**, collapsed by default (Graphify-specific).
7. **Node selection → the real right column** (not inside the canvas, not dark): entity **wiki description** + **relations** (parity with `EntityPanel` + `EntityRelationsAccordion`).
8. Type vs Facets clarified above (the earlier confusion is resolved).

### Implementation lots (B→G)
- **G-studio-lot1** — graph rendering: #1 light canvas under dark theme + #2 hollow boxes (verify via re-export; renderer already correct).
- **G-studio-lot2** — center canvas full + legend-only (#3, #4).
- **G-studio-lot3** — left accordion Type/Facets/Results collapsed (#5) + Communities panel above Facets (#6).
- **G-studio-lot4** — right column node selection: wiki description + relations (#7).
- **G-studio-lot5** — unify: `graph.html` becomes a sub-view of the studio model (architecture principle), retiring the iframe embedding.

### Still-open content bugs surfaced during this UAT (separate from layout)
- **Classes without labels** — nodes emitted without a `label` (ontology extraction/labelling bug).
- **Too few entities** — the pack's semantic extraction yields too few entities (extraction/profile issue, in `graph.json`, not the renderer).
These are `graph.json` content defects (re-extraction / extraction fixes), not studio-shell layout — to be debugged separately.
