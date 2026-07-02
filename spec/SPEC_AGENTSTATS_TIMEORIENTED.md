# SPEC_AGENTSTATS_TIMEORIENTED

## Status

- Product: Graphify TypeScript port
- Scope: a **time attribute contract** + temporal scene + time-window query for the
  agent-stats project/conversation graph (`graphify.agent-stats.project-graph/v1`),
  integrated with the planned agent-memory / `h2a knowledge` substrate.
- Spec state: **DRAFT — design only, no decisions ratified, no code changed.**
- State root: `.graphify/`
- Companion design: `.graphify/scratch/DESIGN_AGENTSTATS_TIMEORIENTED_KNOWLEDGE.md`
  (audit + layouts + lot sequence). This SPEC fixes only the durable, reusable
  contract; the design doc carries the rationale, file:line audit, and Track lots.
- Default behavior: unchanged and artifact-free. Time fields are **additive** to
  `project-graph/v1` (no version bump); the temporal scene + window query are opt-in.

This spec defines: (1) the normative `t` time attribute on graph nodes/edges, (2) the
`timeline` block emitted by a temporal scene builder, and (3) the time-window query
extension to the GraphStore port. It complements `SPEC_STORAGE_BACKENDS.md` (the
GraphStore port) and the agent-memory substrate design; it does not replace them.

This spec must remain generic — no real customer/partner/proprietary examples.

---

## 1. The `t` time attribute (normative)

Any node or edge with a temporal anchor MAY carry these fields. The contract is
**shared** — any graphify graph (not only agent-stats) that stamps `t` becomes
renderable by the temporal layouts and sliceable by the window query. This is the
attribute the graph-display-variants "time-oriented" variant consumes.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `t` | number (epoch ms) | required for any time-anchored element | primary instant; for a span = its start |
| `t_end` | number (epoch ms) | optional | present ⇒ element is a SPAN `[t, t_end]`; absent ⇒ instantaneous |
| `t_iso` | string (ISO-8601) | optional | display mirror of `t` (derivable; for humans/audit) |
| `t_src` | string | optional | provenance of `t` (which field/derivation produced it) |

Rules:
- `t` is the **layout coordinate** and the **window-query key**; epoch-ms so bucketing,
  axis math, and a SQL/GQL `WHERE t BETWEEN ?` are O(1) with no parse cost.
- If `t_end` is present it MUST be ≥ `t`.
- Elements with no defensible temporal anchor (e.g. the Project node is a derived
  aggregate) MAY still carry a derived span; consumers MUST tolerate missing `t`.
- Fields are pass-through-safe: the studio scene builder already copies unknown node
  fields, so stamping `t` requires no scene-builder change to *carry* it.

### 1.1 Per-element derivation for agent-stats `project-graph/v1`

| Element | `t` | `t_end` | source |
|---|---|---|---|
| `Session` node | `startedAt` | `endedAt` | already on node |
| `Commit` node | committer-date | — | join from git evidence; fallback session `endedAt` |
| `Agent` node | min child session `t` (first spawn) | max child `t_end` | derived |
| `Branch` node | first `touched-branch` instant | last touch | derived; refine to `checkout-b` time |
| `Repo` node | first in-alias session `t` | last | derived |
| `Project` node | global min | global max | derived |
| `MemoryNote` node (future) | authored-at | — | write path |
| `Persona`/`Soul` binding (future) | bound-at | unbound-at | h2a binding event |
| edge `conducted-by` | session start | — | session |
| edge `produced` | commit committer-date | — | commit |
| edge `touched-branch` | first touch | — | session |
| edge `derived-from` (agent spawn) | child session start | — | the spawn event |
| edge `rename-lineage` | rename boundary | — | incarnation span boundary |

Future memory node types (`MemoryNote`/`UserModel`/`Persona`/`Skill`) MUST stamp `t`
by this same contract so the agent-memory substrate is born time-addressable and
`recall --as-of <t>` is a window over `t`.

---

## 2. The `timeline` scene block (normative)

A temporal scene builder (sibling to `buildStudioScene`) emits, alongside `nodes`/
`edges`/`communityColors`/`stats`, a `timeline` block. Nodes keep raw `t`/`t_end`
and a `lane` so the SPA projects time→x and lane→y at render (interactive scrub/zoom
without a rebuild), mirroring how force x/y is precomputed but pan/zoom is client-side.

```jsonc
"timeline": {
  "tMin": 1750000000000,
  "tMax": 1750600000000,
  "bucket": "day",                 // "hour" | "day" | "week", auto from span
  "laneKey": "agent",              // "agent" | "branch" | "repo"
  "lanes": [                       // ordered lanes for the swimlane layout
    { "key": "claude:graphify:17bd…", "label": "…", "order": 0 }
  ]
}
```

Per-node additions in temporal mode: `lane` (string, lane key value) and `bucket`
(number, index from `tMin` at the chosen granularity).

Renderer layout modes (toggle): `force` (default, today) | `swimlane` (lane=y,
time=x, spawn connectors, commit dots) | `playback` (force x/y + `t`-gated opacity
scrub). A single-session micro-timeline is a modal drill-down (event explosion is
opt-in/lazy).

---

## 3. Time-window query (normative extension to the GraphStore port)

Two levels, both opt-in:

**(a) Build-time window (file backend).** `--since`/`--until` slice the emitted
`graph.json` to elements whose `[t,t_end]` overlaps the window; the chosen window is
stamped on `graph.graph.window`.

**(b) Store-level window (SQL/GQL backends).** Backends persist `t`/`t_end` as
indexed columns/properties and expose:

```ts
interface GraphStoreCapabilities { /* … */ queryWindow: boolean; }

interface GraphStore {
  /* … */
  queryWindow?(
    fromMs: number,
    toMs: number,
    opts?: { laneKey?: string; namespace?: string },
  ): Promise<{ nodes: unknown[]; edges: unknown[] }>; // overlap of [t, t_end]
}
```

Semantics: return every node/edge whose `[t, t_end]` (instantaneous ⇒ `t==t_end`)
overlaps `[fromMs, toMs]`. Capability-gated like `query?()`; backends without it omit
the capability. This lets the studio scrub **page slices from the backend** rather
than load the whole graph — the scale path for multi-project graphs (>10k nodes),
and the concrete junction with the native-DB-backends work-stream.

---

## 4. Decisions the owner must resolve (none ratified)

1. **D1 — schema placement.** Stamp `t` on `project-graph/v1` in place (additive, lean)
   vs a sibling temporal schema. *(Same axis as memory-design fork F1; lean = in place.)*
2. **D2 — primary type.** `t` as epoch-ms (this spec) vs ISO-8601 primary. *(Lean: epoch-ms
   primary + `t_iso` mirror.)*
3. **D3 — lane default.** Default `laneKey` for L2 swimlanes: `agent` vs `branch` vs `repo`.
   *(Lean: `agent`.)*
4. **D4 — event explosion volume policy.** Micro-events (message/tool-use/decision/branch)
   default-off and per-session-on-demand vs precomputed. *(Lean: on-demand/lazy.)*
5. **D5 — `queryWindow` overlap semantics.** Overlap vs containment for spans. *(Lean: overlap.)*

This SPEC is generic and additive; it introduces no real customer/proprietary data.
