# SPEC_AGENT_MEMORY_SUBSTRATE (DRAFT — for co-specification with the h2a memory peer)

## Status

- **DRAFT.** This is the graphify-side **written scope closure** the principal
  (`human:rhanka`) required when granting graphify as the agent-memory substrate.
  It is NOT yet ratified. The enum of in-scope kinds (§3) and the producer
  contract (§5) are to be **co-specified** with the h2a `memory` lane
  (`claude:h2a:b4ec36679141`, thread `thr:perennial-agent-memory`) before any
  implementation lands.
- Extends `SPEC_AGENTSTATS_TIMEORIENTED.md` (the `t`/`t_end`/`t_src` contract,
  the T5 store window, the T6 recall). It does not replace it.
- Companion (external, read-only): the h2a owner dossier at
  `.graphify/scratch/h2a-agent-memory-dossier-2026-07-25/` (D1–D13).

## 0. The decision this closure records

The principal decided: **graphify ACCEPTS being the agent-memory substrate, WITH
a written scope closure.** Concretely:

- **IN scope:** agent memory — **context / decisions / evidence**.
- **OUT of scope (hard gate holds):** persona / authored h2a identity semantics.
- **Anti-cycle invariant:** graphify **never imports h2a**; the dependency is
  one-way; h2a only DISPATCHES into a contract graphify defines.

This closure lifts, **for the in-scope kinds only**, the T6 boundary that
`SPEC_AGENTSTATS_TIMEORIENTED.md` records ("authored memory and h2a
persona/knowledge semantics remain unapproved and out of scope"). Everything
that boundary named and that is not explicitly moved IN by §3 below stays OUT.

## 1. Trust tiers — carried forward unchanged, do not collapse

One substrate, three trust tiers (dossier invariant §7). A shared graph does
**not** imply a shared evidentiary grade.

| Tier | Kind | Admission |
|---|---|---|
| **earned** | agent-stats project-graph (Session/Commit/…) | derived from ranked evidence; ground truth; **not** re-writable as ordinary memory |
| **asserted** | `MemoryNote` (this spec) | agent-authored; enters behind the **binary gate** (D3/D11) |
| **signed** | h2a identity / Persona / Soul | Ed25519, owned by h2a — **OUT of scope here** |

Assertion reconciliation MUST NOT overwrite earned evidence or signed identity
as though they were ordinary mutable memory. Every projection/export MUST retain
the tier and provenance, or the one-substrate property the principal accepted is
destroyed.

## 2. Substrate — additive, no new store

Realized on the existing `graphify.agent-stats.project-graph/v1` graph, additive
(no version bump, mirroring the `t` contract). No parallel store, no new port.
An agent-memory node is a normal graph node carrying the shared `t`/`t_end`/
`t_src` contract, so it is born window-queryable (T5) and recall-addressable
(T6, `--as-of`) with no new reader.

## 3. IN-SCOPE kinds — the closure (CO-SPECIFY the exact enum)

### 3.1 `MemoryNote` (asserted)

An agent-authored durable note. Its **subject is agent work only**: a piece of
CONTEXT, a DECISION taken, or a piece of EVIDENCE observed. It is NOT persona,
NOT voice, NOT identity.

| Field | Meaning | Trust |
|---|---|---|
| `node_type: "MemoryNote"` | fixed | asserted |
| `memory_kind` | `"context" \| "decision" \| "evidence"` (the closed enum — CO-SPECIFY) | — |
| `t` | authored-at (ordering coordinate; see §6) | pass-through |
| `t_end` | absent ⇒ still-current; `=== t` ⇒ a closed point | pass-through |
| `t_src` | which coordinate produced `t` (`"authored-at"` \| `"turn-count"`) | pass-through, UNVERIFIED |
| `provenance` | STRUCTURED citation: cited string + named source (§4) | gate-checked |
| `trust: "asserted"` | fixed | — |
| `review_status` | `"pending" \| "accepted"` (the binary gate, D11) | — |

`memory_kind` is the load-bearing closure knob: it is exactly what keeps
persona/authored-identity OUT. The enum is CLOSED and its membership is
co-specified with the peer; anything not in it is refused at admission.

### 3.2 Deliberately OUT (hard gate — separate principal ratification required)

`Persona` / `Soul` binding, `UserModel` as an identity model, any h2a write
path or invented product envelope, caller-selected namespaces, cross-workspace
reads, pagination/cursors. These remain exactly as `SPEC_AGENTSTATS_TIMEORIENTED`
§4.3 states them. This spec does not touch them.

## 4. Provenance as a GUARANTEE, not a habit

Each `MemoryNote` carries a **structured** citation (cited string + named
source), the form the memory peer chose. Because it is structured, the existing
`verifyVerbatim` gate (`src/source-grounding.ts:316`) can be applied at
admission: a note whose cited string is not literally present in its named
source is **refused**.

**The exact limit, stated so it is not oversold:** the gate guarantees the note
**cites the artifact it names**. It does **not** guarantee the lesson is TRUE.
It forbids an invented citation; it does not validate an assertion. graphify
guarantees FORM, never TRUTH. (Same boundary as citations and as `t_src` in §6.)

## 5. The write path — the measured gap (REQUIRED, not shipped)

A living memory adds **one note at a time**. Measured today: the `GraphStore`
port (`src/storage/types.ts`) exposes only `pushGraph` — a **whole-graph** push
(merge = idempotent upsert / replace = clear+load). There is **no element-level
add**. Re-pushing the whole graph per note is not viable.

Therefore an **element-level append** (add a single node/edge) is a required new
capability. It is named here as work, not claimed as present. It touches the
storage port, so it is co-owned with the storage role, not shipped unilaterally
by this lane.

## 6. Ordering coordinate (D10, owner-decided)

Order = a coordinate on `t`, and each note names which coordinate produced it via
`t_src`. Two are admissible:

- `"authored-at"` — wall-clock instant. Falsifiable by the writer (measured: the
  h2a bus **requires** an author `createdAt` and verifies nothing; an envelope
  was observed post-dated 12 min).
- `"turn-count"` — a monotone per-conversation counter. Monotone WITHIN one
  agent, but two agents each have a "turn 1", so it does **not** give a global
  order either.

**Neither is globally sound alone.** `t_src` records which one; a cross-agent
reader must treat the coordinate as declared, not trusted. graphify guarantees
FORM (which coordinate), not TRUTH (the value). A real transaction-time second
axis (D9 bi-temporality) is a separate, later contract.

## 7. Interval convention — a prerequisite

Before any bi-temporal second axis (D9), the CLOSED interval convention
`[t, t_end]` must be authoritative end-to-end (the §5.2 freeze: the studio-scene
contract comment is being reconciled to CLOSED via a renderer-routed proposal;
all executable paths — temporal-recall, queryWindow — are already CLOSED). A
second axis over an ambiguous first axis multiplies the boundary error.

## 8. Anti-cycle — verified

graphify defines the producer contract; h2a respects it and dispatches. graphify
**never** imports h2a. Measured on origin/main: no h2a dependency in
`package.json`, no `import` from h2a in `src/`. The only h2a contact is T7 —
reading the file path `<root>/.h2a/registry/instances.jsonl`, fail-closed
(reading a file is not importing h2a). This closure adds no h2a import.

## 9. What must be co-specified with the peer before impl

1. The **closed `memory_kind` enum** (§3.1) — exact membership; this is the
   closure boundary.
2. The **producer contract** shape — how a note is handed to graphify (the
   contract graphify defines, h2a respects), and the element-level write path
   (§5), co-owned with storage.
3. The **binary-gate promotion rule** (D11 double-consensus): validator
   independence, eligible grades, threshold, disagreement-to-human path, audit
   record.

Nothing in §9 is implemented until it is agreed and the storage/principal owners
of the touched surfaces consent. This document is reversible: it lands in `spec/`
only after co-specification; until then it is a DRAFT proposal.
