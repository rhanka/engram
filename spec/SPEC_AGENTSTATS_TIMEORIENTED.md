# SPEC_AGENTSTATS_TIMEORIENTED

## Status

- Product: Graphify TypeScript port
- Scope: a **time attribute contract** + temporal scene + time-window query for the
  agent-stats project/conversation graph (`graphify.agent-stats.project-graph/v1`),
  integrated with the planned agent-memory / `h2a knowledge` substrate.
- Spec state: **PARTIAL IMPLEMENTATION.** The additive `t` / `t_end` contract is
  already emitted by agent-stats (T0/T2). T5 defines the provider-neutral store
  port and its first Postgres implementation. T6 defines a read-only temporal
  graph recall contract; authored-memory and h2a persona/knowledge semantics
  remain unapproved and out of scope.
- State root: `.graphify/`
- Companion design: `.graphify/scratch/DESIGN_AGENTSTATS_TIMEORIENTED_KNOWLEDGE.md`
  (audit + layouts + lot sequence). This SPEC fixes only the durable, reusable
  contract; the design doc carries the rationale, file:line audit, and Track lots.
- Default behavior: unchanged and artifact-free. Time fields are **additive** to
  `project-graph/v1` (no version bump); the temporal scene + window query are opt-in.

This spec defines: (1) the normative `t` time attribute on graph nodes/edges, (2) the
`timeline` block emitted by a temporal scene builder, (3) the time-window query
extension to the GraphStore port, and (4) the read-only point-in-time graph recall
surface built on that port. It complements `SPEC_STORAGE_BACKENDS.md` (the GraphStore
port) and the agent-memory substrate design; it does not replace them.

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
| `t_end` | number (epoch ms) | optional | present ⇒ closed end of `[t, t_end]`; absent ⇒ open-ended |
| `t_iso` | string (ISO-8601) | optional | display mirror of `t` (derivable; for humans/audit) |
| `t_src` | string | optional | provenance of `t` (which field/derivation produced it) |

Rules:
- `t` is the **layout coordinate** and the **window-query key**; epoch-ms so bucketing,
  axis math, and a SQL/GQL `WHERE t BETWEEN ?` are O(1) with no parse cost.
- If `t_end` is present it MUST be ≥ `t`.
- A point MUST be encoded explicitly as `t_end === t`. A missing `t_end` means
  that the element is still open at query time. This matches the shipped
  agent-stats session projection and is not reinterpreted by store providers.
- Elements with no defensible temporal anchor (e.g. the Project node is a derived
  aggregate) MAY still carry a derived span; consumers MUST tolerate missing `t`.
- Fields are pass-through-safe: the studio scene builder already copies unknown node
  fields, so stamping `t` requires no scene-builder change to *carry* it.

### 1.1 Per-element derivation for agent-stats `project-graph/v1`

| Element | `t` | `t_end` | source |
|---|---|---|---|
| `Session` node | `startedAt` | `endedAt`; absent while open | already on node |
| `Commit` node | committer-date | same as `t` (point) | joined git evidence; undated commits remain untimed |
| `Agent` node | min child session `t` (first spawn) | max child `t_end` | derived |
| `Branch` node | first `touched-branch` instant | last touch | derived; refine to `checkout-b` time |
| `Repo` node | first in-alias session `t` | last | derived |
| `Project` node | global min | global max | derived |
| `MemoryNote` node (future) | authored-at | same as `t` (point) | write path |
| `Persona`/`Soul` binding (future) | bound-at | unbound-at | h2a binding event |
| edge `worked-in` / `conducted-by` / `produced` / `touched-branch` | owning session start | owning session end; absent while open | shipped session-owned stamp |
| edge `derived-from` (agent spawn) | child session start | child session end; absent while open | shipped child-session stamp |
| edge `rename-lineage` (future temporal stamp) | rename boundary | same as `t` (point) | incarnation boundary |

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
indexed columns/properties and MAY expose:

```ts
interface GraphStoreCapabilities { /* … */ queryWindow?: true; }

interface GraphTimeWindowNode {
  id: string;
  label: string;
  node_type?: string;
  community?: number;
  t: number;
  t_end?: number;
  [key: string]: unknown;
}

interface GraphTimeWindowEdge {
  source: string;
  target: string;
  relation: string;
  confidence?: string;
  t: number;
  t_end?: number;
  [key: string]: unknown;
}

interface GraphStore {
  /* … */
  queryWindow?(
    fromMs: number,
    toMs: number,
    opts?: { namespace?: string },
  ): Promise<{ nodes: GraphTimeWindowNode[]; edges: GraphTimeWindowEdge[] }>;
}
```

Semantics:

- Bounds MUST be finite numbers and `fromMs <= toMs`; an invalid window is
  rejected before backend I/O. Equal bounds are valid.
- Membership is inclusive overlap: `t <= toMs AND (t_end is absent OR
  t_end >= fromMs)`.
- Missing `t_end` means open-ended. A point has `t_end === t` and therefore
  matches a window containing that instant.
- Untimed records, non-numeric `t`, non-numeric present `t_end`, and inverted
  spans (`t_end < t`) are excluded without making the whole query fail.
- Nodes and edges are evaluated independently. A temporal edge MAY therefore
  be returned without both endpoint nodes; consumers must not interpret the
  result as an induced subgraph.
- Results are flat canonical graph records: provider storage fields such as
  `props` and `city_slug` are not exposed. Arbitrary pass-through attributes,
  including `t` / `t_end`, are preserved, while canonical identity fields come
  from the provider's typed columns.
- `namespace` is a parameterized provider scope. Lane filtering is deferred
  until lane semantics are ratified; no attribute name is accepted as SQL.
- The initial T5 query is unbounded. Pagination/cursors are a separate scale
  contract and MUST NOT be inferred from the existing bounded `graphWindow`.
- Capability-gated like `query?()`: a backend exposes both
  `capabilities.queryWindow === true` and `queryWindow`, or neither. T5 ships
  this pair on Postgres only; other providers remain neutral by omission.

This lets later studio and recall work read temporal slices without coupling
the port to Postgres JSONB, Neo4j properties, or a future memory provider.

---

## 4. Read-only temporal graph recall (normative T6 contract)

T6 exposes chronological graph retrieval only. It MUST be described as
**temporal graph recall**, not authored memory, semantic recall, knowledge
retrieval, persona recall, or a claim that returned provenance is truthful.
It adds no write path.

### 4.1 API and result

```ts
interface TemporalRecallOptions {
  asOf: string | number;
  graph?: string;
  config?: string;
  store?: string;
}

interface TemporalRecallSnapshot {
  topologySignatureSha256: string;
  pushedAt: string;
  toolVersion: string;
}

type TemporalRecallSource =
  | {
      kind: "file";
      path: string;
      topologySignatureSha256?: string;
      provenance?: unknown;
      freshness: "unverified";
    }
  | {
      kind: "store";
      storeId: string;
      namespace?: string;
      snapshot: TemporalRecallSnapshot | null;
      freshness: "unverified";
    };

interface TemporalRecallResult {
  schema: "graphify.temporal-recall/v1";
  asOfMs: number;
  asOfIso: string;
  source: TemporalRecallSource;
  unpaged: true;
  nodes: GraphTimeWindowNode[];
  edges: GraphTimeWindowEdge[];
}

function recallAsOf(options: TemporalRecallOptions): Promise<TemporalRecallResult>;
```

`asOf` accepts only a safe integer epoch-ms value (number or base-10 string),
or an ISO-8601 timestamp carrying an explicit `Z` or numeric UTC offset. It
rejects fractional/unsafe epoch values, non-finite values, date-only strings,
and local-time strings. The result always echoes canonical `asOfMs` and
`asOfIso`.

Source selection is deterministic:

1. An explicit `graph` selects that file source and cannot be combined with an
   explicit `store`.
2. Otherwise an explicit store, `GRAPHIFY_STORE`, or the first configured
   `storage.mirrors[]` backend selects the store source.
3. Only when no store is selected does recall read the config state-dir
   `graph.json`, or the default `.graphify/graph.json`.

A selected store MUST expose both `capabilities.queryWindow === true` and a
`queryWindow` function. Capability misses, connection/query failures, and empty
store results are surfaced as store outcomes; they MUST NOT trigger a file
fallback. Recall invokes `queryWindow(asOfMs, asOfMs)` without a caller-provided
namespace override. The adapter's configured namespace remains the data
partition; it is not authorization, and T6 exposes no namespace selector.

The file path applies the same T5 predicate and malformed-record exclusions to
raw `nodes` and `links`/`edges`. It evaluates edges independently, including an
edge whose endpoint is absent from the returned nodes. Node results sort by
`t`, then `id`; edge results sort by `t`, `source`, `target`, then `relation`,
using code-point comparisons for deterministic output.

Pass-through attributes, including `t_src` and provenance-shaped attributes,
remain present but unverified. File and store sources are discriminated and
carry the available provenance or snapshot metadata without implying freshness,
authorship, integrity, or trust. Potentially-large topology signatures are
disclosed as `sha256:` identities rather than repeated verbatim.

The result is intentionally unpaged and untruncated. Consumers MUST limit T6
to bounded snapshots they control; pagination/cursors remain a separate scale
contract.

### 4.2 CLI

```text
graphify recall --as-of <epoch-ms|ISO-8601> [--graph <path>]
                [--config <path>] [--store <id>] [--json]
```

The default output is a compact human rendering. `--json` emits only the
`graphify.temporal-recall/v1` object on stdout. The CLI is read-only and has no
MemoryNote, persona, knowledge-envelope, namespace-selection, or pagination
flags.

### 4.3 h2a boundary and human gates

h2a 0.85.21 exposes a generic `H2AEnvelope<TBody>` but no ratified, versioned
MemoryNote/persona/knowledge body or read/write command. The generic envelope is
not sufficient authority to invent one, so T6 adds no h2a product envelope.
h2a remains coordination evidence only for this lot.

Authored or personal memory requires owner/data-controller approval for access,
privacy, retention, deletion, authorship and persona semantics, plus h2a/product
owner ratification of a versioned body contract. Caller-selected namespaces or
cross-workspace results additionally require an authorization design and
consumer-owner approval.

---

## 5. Decision status

1. **D1 — schema placement (shipped).** `t` is additive on
   `project-graph/v1`; no sibling schema or version bump.
2. **D2 — primary type (shipped).** Epoch-ms is primary; `t_iso` is an optional
   display/audit mirror.
3. **D3 — lane default.** Default `laneKey` for L2 swimlanes: `agent` vs `branch` vs `repo`.
   *(Lean: `agent`.)*
4. **D4 — event explosion volume policy.** Micro-events (message/tool-use/decision/branch)
   default-off and per-session-on-demand vs precomputed. *(Lean: on-demand/lazy.)*
5. **D5 — `queryWindow` overlap semantics (T5).** Inclusive overlap, with
   missing `t_end` open-ended and explicit `t_end === t` points, as constrained
   by the shipped agent-stats projection.
6. **D6 — `recall --as-of` meaning (T6).** Read-only temporal graph projection
   at the point window `[t,t]`; no authored-memory/persona semantics, no caller
   namespace override, no fallback after a store has been selected, and no
   implicit pagination or truncation.

This SPEC is generic and additive; it introduces no real customer/proprietary data.
