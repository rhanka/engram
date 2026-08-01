# SPEC_AGENT_MEMORY_SUBSTRATE (revised for FINAL ratification)

## Status

- **Revised per the principal's 3-review dossier** (A2 / B1 / C1 / D1 / M4 +
  the multi-tenant carrier). This revision makes the **load-bearing carriers
  NORMATIVE and code-enforced**, not conventions: (1) the persona mechanism
  (§3.3 — `subject` + event-shaped predicate + projection prohibition); (2)
  subject-human retention controls with a deletion path (§3.5); (3) the
  cross-tier reconciliation reject (§3.4); (4) versioned append capability
  (§5); (5) the multi-tenant identity + private/capitalised scope + a NEUTRAL
  projection hook (§3.6). **These carriers are what go to FINAL ratification
  (D1).** The remainder of §9 (exact producer wire-shape, full promotion rule)
  stays **co-spec** with the h2a `memory` lane after ratification.
- Scope of graphify ownership: the **schema fields, the capability gating, and
  the code predicates** are graphify-side. The **projector/executive role** that
  would pick a view over cross-principal capitalisation/contradiction is an
  **h2a concept and a PARKED owner decision** (condition absent — single human
  today; §3.6); graphify provides only a **neutral reversible hook point**, no
  arbitration semantic.
  The **reconciliation application point** is the **ontology lot** (D9), not
  this spec's code (§3.4).
- Co-spec peer: h2a `memory` (`claude:h2a:b4ec36679141`, thread
  `thr:perennial-agent-memory`). Companion (read-only): the owner dossier at
  `.graphify/scratch/h2a-agent-memory-dossier-2026-07-25/` (D1–D13).
- Extends `SPEC_AGENTSTATS_TIMEORIENTED.md`. Nothing is frozen/published before
  final ratification.

## 0. The decision this closure records

The principal decided: **graphify ACCEPTS being the agent-memory substrate, WITH
a written scope closure.** IN scope: agent memory — **context / decision /
evidence**. OUT (hard gate holds): persona / authored h2a identity semantics.
Anti-cycle invariant: graphify **never imports h2a**; h2a only DISPATCHES into a
contract graphify defines. This lifts the T6 out-of-scope boundary **only for
the in-scope kinds**; everything else stays OUT.

## 1. Trust tiers — carried forward unchanged, do not collapse

| Tier | Kind | Admission |
|---|---|---|
| **earned** | agent-stats project-graph (Session/Commit/…) | derived from ranked evidence; ground truth; **not** re-writable as ordinary memory |
| **asserted** | `MemoryNote` (this spec) | agent-authored; enters behind the **binary gate** (D3/D11) |
| **signed** | h2a identity / Persona / Soul | Ed25519, owned by h2a — **OUT of scope here** |

Assertion reconciliation MUST NOT overwrite earned evidence or signed identity.
Every projection/export MUST retain the tier and provenance.

## 2. Substrate — additive, no new store

Realized on `graphify.agent-stats.project-graph/v1`, additive (no version bump).
An agent-memory node is a normal graph node carrying the shared `t`/`t_end`/
`t_src` contract, so it is born window-queryable (T5) and recall-addressable
(T6) with no new reader.

## 3. IN-SCOPE kinds — the closure

### 3.1 `MemoryNote` (asserted) — the normative schema

| Field | Meaning | Enforced |
|---|---|---|
| `node_type: "MemoryNote"` | fixed | admission |
| `memory_kind` | closed enum `"context" \| "decision" \| "evidence"` | admission (enum check) |
| `subject` | what the note is ABOUT: `"agent-work"` or `"human:<id>"` (a named human as work context). A `subject` naming a persona/identity/voice is **REFUSED** (§3.3). | admission (subject predicate) |
| `t` | authored-at / turn instant (ordering coordinate, §6) | pass-through |
| `t_end` | absent ⇒ still-current; `=== t` ⇒ closed point | pass-through |
| `t_src` | which coordinate produced `t` | pass-through, UNVERIFIED |
| `provenance` | structured citation: cited string + named source (§4) | admission (citation check, §4) |
| `event_shaped` | a mandatory machine-verifiable event ANCHOR: `t` + the assertion as an anchored event, not free prose (§3.3 — **structural**, not a writer flag, not a prose classifier) | admission (structural predicate) |
| `trust: "asserted"` | fixed | — |
| `reconcilable: false` | **opt-out by construction** (C1, §3.4): a non-earned tier is NOT reconciled by default | reconciliation gate |
| `principal_owner` | tenant identity: the principal/owner this note belongs to (§3.6) | admission + gate |
| `scope` | `"private"` (to `principal_owner`) \| `"capitalised"` (shared) (§3.6) | admission + gate |
| `purpose` | the finality the subject-human fact serves (A2, §3.5) — required when `subject` is a human | admission |
| `retention` | TTL / retention bound (A2, §3.5) — required when `subject` is a human | retention sweep + deletion path |
| `review_status` | `"pending" \| "accepted"` (binary gate, D11) | gate |

`memory_kind` closes the enum; but the enum ALONE does not hold the persona
boundary. The boundary is held by CODE — §3.3.

### 3.1.1 Foldings — neighbouring shapes map INTO the closed enum

- **`reference` (URL/ticket) → `provenance`**, not a genre: a `context` note
  whose named source is the URL. Admitted.
- **`feedback`/work-guidance → `decision`**, admitted ONLY as an event-shaped,
  cited event (`event_shaped` predicate §3.3 + citation §4). A *standing trait*
  ("always X", "the agent is X") FAILS the `event_shaped` predicate — persona,
  OUT. The boundary is the FORM, checked by code, not the subject.
- **`user`/fact-about-the-human → `context`**, `subject = "human:<id>"`, behind
  the retention controls of §3.5, NEVER assembled into a `UserModel` (§3.2/§3.3
  projection prohibition).

### 3.2 Deliberately OUT (hard gate)

`Persona`/`Soul` binding, `UserModel` as an identity model, any h2a write path
or invented product envelope, caller-selected namespaces, cross-workspace reads,
pagination/cursors. As `SPEC_AGENTSTATS_TIMEORIENTED` §4.3 states them.

### 3.3 The persona mechanism — NORMATIVE, held by CODE (B1)

The persona/identity boundary is enforced by three code checks, NOT by
convention and NOT by `verifyVerbatim` (which only checks a citation, §4):

1. **`subject` predicate.** Admission rejects any note whose `subject` is an
   agent persona, identity, voice, or values. `subject ∈ { "agent-work",
   "human:<id>" }` only; a human subject is a *fact-as-context*, never an
   identity model.
2. **`event_shaped` — a STRUCTURAL predicate (co-spec correction).** Admission
   requires a machine-verifiable EVENT ANCHOR: a `t` (the instant it happened)
   with the assertion encoded as an anchored event, NOT free prose. A
   generalization ("always X") has no single instant at which it happened →
   structurally non-anchorable → REFUSED. It is deterministic ONLY because it
   is structural: it is **NOT** a boolean the writer sets (that would be
   self-declared and unverified — the exact `t_src` trap), and **NOT** a
   semantic judgment over prose (that would be an LLM call belonging to the D11
   gate, not admission). A trait-shaped content is thereby forced to express as
   its episodic ORIGIN ("on `<date>`, correction Y"); the derived standing rule
   lives in h2a (WP11).
3. **Projection prohibition — ENFORCED, not documented (see §3.2).** The
   query/recall surface MUST NOT offer an identity-profile projection that
   aggregates `subject = "human:<id>"` notes into a persistent ranked view;
   doing so reconstructs a `UserModel` de facto. This is a code invariant of
   the recall surface (charter: temporal-recall), enforced at PROJECTION as
   well as admission.

A note passes only when all three hold. Standing rules/traits and identity
profiles are refused by construction, at entry and at read.

### 3.4 Reconciliation — opt-out by construction, cross-tier reject (C1)

- **No reconciliation by default for any non-earned tier.** `MemoryNote`
  carries `reconcilable: false` in the schema (§3.1) — opt-out **by
  construction**, not by later policy. The D9 assertion-reconciliation never
  touches an asserted/signed node unless explicitly opted in.
- **Trust mismatch = a REJECT criterion for a candidate PAIR** (backs M2): the
  reconciliation algorithm MUST reject any candidate pair whose two members are
  of different trust tiers (e.g. an `earned` node and an `asserted` note), so a
  memory note can never be merged into or over ground truth.
- **Application point = the ontology lot (D9), NOT this spec's code.** This spec
  states the requirement; the conductor routes its enforcement to the ontology
  lot. Recorded here so the carrier is not lost.

### 3.5 Subject-human retention controls — NORMATIVE (A2)

A subject-human fact is ADMITTED, but only behind applicable controls, because
the parent scope (`SPEC_AGENTSTATS_TIMEORIENTED` §4.3) requires them and the
append-only journal (D12) does **not** provide them by itself:

- **`purpose`** — the finality the fact serves (why it is retained).
- **access** — the fact is readable only within its `principal_owner`/`scope`
  (§3.6); no cross-tenant read of a `private` fact.
- **`retention` / TTL** — a bound after which the fact is swept.
- **DELETION PATH — the load-bearing carrier.** Append-only has no delete. So
  deletion is a **compensating tombstone event** appended to the journal and
  **folded OUT at projection** (consistent with D12 journal+fold and the D-rewind
  "kept but marked not-current" decision). A subject-human fact MUST be
  erasable this way; a substrate that cannot honour a deletion request cannot
  hold subject-human facts. Two co-spec corrections from the memory peer:
  - **Authority.** A tombstone passes the SAME `principal_owner`/`scope` gate as
    admission: only the `principal_owner` (or an agent it MANDATES) may erase a
    private fact, or one agent erases another principal's memory.
  - **Edge cascade.** A recall result is NOT an induced subgraph (measured: an
    edge can surface without its endpoint). So a tombstoned node MUST fold out
    its EDGES too, or an erased human-fact resurfaces through an edge that
    references it. For A2 (GDPR-type) erasure the disappearance must be COMPLETE
    at projection, edges included.
  - **Every read surface, aggregates included (storage-signed).** The finalized
    port contract folds a tombstoned target out of **EVERY** read a backend
    exposes — `query`, `groupCounts`, `layoutPositions`, `graphWindow`,
    `queryWindow`, and any element read. Otherwise an erased element still
    **counts** in a derived aggregate = an A2 erasure hole. A backend that
    cannot fold tombstones out of its aggregates within its freshness contract
    **MUST NOT declare `append`** (M4, §5). A2 with teeth.
  The tombstone signature is FINAL and storage-consented — see §5 and
  `.graphify/scratch/roles/DESIGN-storage-append-port-D5.md`.

### 3.6 Multi-tenant identity, private/capitalised scope, exec hook — NORMATIVE (new carrier)

A single ROLE may be launched by MULTIPLE humans. Default: each principal
launches their own agent ⇒ **mono-tenant** memory. But SHARED memory forces the
distinction:

1. **`principal_owner` (tenant identity)** on every `MemoryNote` — the principal
   the note belongs to. Part of the key/partition and of the gate.
2. **`scope`: `"private"` vs `"capitalised"`.** `private` = readable only within
   `principal_owner`. `capitalised` = shared across principals (the common
   history).
3. **A NEUTRAL PROJECTION HOOK in the D11 control (§9.3) — NOT a resolving
   arbiter (co-spec reframe, h2a architect).** On an append-only substrate two
   contradictory `capitalised` notes COEXIST (D12); nothing is destroyed.
   Promotion to `capitalised`, and the handling of a cross-principal
   CONTRADICTION, is therefore a **PROJECTION** decision (which view to present),
   never a destructive resolution. graphify exposes only a **neutral, reversible
   hook point**; it wires no arbitration/resolution semantic.
   The ROLE that would make that projection decision (an executive/projector
   above the principal) is a **PARKED owner decision**, not a role graphify+h2a
   co-specify: (a) instituting an executive above the principal AMENDS the
   already-ratified RACI actor model (escalation AGENTS←CONDUCTOR←PRINCIPAL; the
   owner is terminal); (b) the triggering condition — 2+ principals actually
   sharing a role memory — does not exist today (a single human). So the hook
   ships neutral; the role is design-only, parked, triggered when the condition
   appears. IF such a role is ever instituted, two h2a invariants bind its
   view (memory's): (i) the promoted view is SIGNED (Ed25519 — the `signed`
   tier h2a owns, never an uncontrolled journal `by`); (ii) separation of
   powers — the projector is neither the note's author nor a D11 leg that
   promoted it.

## 4. Provenance — what `verifyVerbatim` DOES and does NOT do (B1 correction)

Each `MemoryNote` carries a structured citation (cited string + named source).
`verifyVerbatim` (`src/source-grounding.ts:316`) is applied at admission: a note
whose cited string is not literally present in its named source is **refused**.

**Correction (the previously overstated claim is removed):** `verifyVerbatim`
checks the **citation only** — that the cited string exists in the named source.
It does **NOT** check that the note is event-shaped, nor that it is not a
persona/trait. The FORM/persona boundary is a **separate code predicate**
(§3.3, `event_shaped` + `subject`), NOT `verifyVerbatim`. And neither checks
that the lesson is TRUE. graphify guarantees FORM (via §3.3) and citation
integrity (via `verifyVerbatim`), never TRUTH.

## 5. Write path — versioned append CAPABILITY (M4), not a whole-graph push

A living memory adds **one note at a time**. Measured: the `GraphStore` port
(`src/storage/types.ts`) exposes only `pushGraph` (whole-graph). Re-pushing per
note is not viable.

**The signature is FINAL and storage-consented** (full types in
`.graphify/scratch/roles/DESIGN-storage-append-port-D5.md`). Summary of the
port additions (`src/storage/types.ts`):

- **Data-pure inputs (anti-cycle).** `GraphNodeInput` / `GraphEdgeInput` /
  `GraphTombstoneInput` are plain data (no graphology, no storage internals):
  h2a imports only the SIGNATURE (types + method shapes), never an
  implementation, and graphify never imports h2a.
- **Three optional methods** — `appendNode`, `appendEdge`, `appendTombstone`
  (each `Promise` returning a `created`/`applied` outcome).
- **M4 — a VERSIONED capability, OMITTED ENTIRELY when incapable** (mirrors
  `queryWindow`): a backend either declares `capabilities.append` (version 1)
  **AND** implements all three methods with REAL effect, or **omits the
  capability and all three methods**. NEVER a method present that silently
  no-ops. A tombstone that no-ops = "an erasure that does not erase" = false A2
  conformity = the exact "success without effect" lie the whole review guards
  against; omit-entirely makes it structurally impossible.
- **Fold-out contract.** A backend that declares `append` MUST fold a
  tombstoned target out of EVERY read surface it exposes (§3.5, aggregates
  included), or it must not declare `append`.

Forks storage raised and this closure resolves (graphify-side, for the
principal gate):

1. **A2 vs derived tables (load-bearing):** the fold-out MUST cover
   `groupCounts`/`layoutPositions`/window reads too, or an erased element still
   counts — a backend that cannot doesn't declare `append` (§3.5).
2. **Edge integrity:** `appendEdge` is **strict** — it throws if an endpoint is
   absent (no dangling edge). A **tombstone requires no existing endpoint**
   (defensive erasure is allowed).
3. **Unit, not batch:** the v1 contract is element-by-element; a batch variant
   is a forward-compatible later addition.
4. **Anti-cycle placement:** the types are exported from graphify's published
   port surface; h2a imports ONLY the types.
5. **`created`/`applied` booleans:** insert-vs-update / new-vs-already at low
   cost (e.g. Postgres `ON CONFLICT … RETURNING`); an incapable backend simply
   omits the capability (M4).

The surface is **co-owned with storage** (who consents to it); graphify defines
the contract signature, storage implements it after the principal gate, and the
dependency stays one-way. **Impl + merge are AFTER the principal gate; nothing
is implemented or published here.**

## 6. Ordering coordinate (D10) — unchanged

Order = a coordinate on `t`; `t_src` names which (`authored-at` | `turn-count`).
Neither is globally sound alone; a cross-agent reader treats the coordinate as
declared, not trusted. graphify guarantees FORM (which coordinate), not TRUTH.

## 7. Interval convention — prerequisite (unchanged)

Before any bi-temporal second axis (D9), the CLOSED `[t, t_end]` convention is
authoritative end-to-end (the §5.2 freeze — applied by renderer, commit
`45b88bdd`; all executable paths already CLOSED). A second axis over an
ambiguous first axis multiplies the boundary error.

## 8. Anti-cycle — verified

graphify defines the producer contract; h2a dispatches into it; graphify never
imports h2a. Measured on origin/main: no h2a dependency in `package.json`, no
`import` from h2a in `src/`. This closure adds no h2a import. The executive role
(§3.6) is h2a-side; graphify exposes only a hook, preserving the one-way edge.

## 9. What is NORMATIVE now vs. co-spec after ratification (D1)

**NORMATIVE now (goes to FINAL ratification):** §3.1 schema fields, §3.3 persona
mechanism (code), §3.4 reconciliation opt-out + cross-tier reject, §3.5 retention
+ deletion path, §3.6 tenancy + exec hook, §5 versioned append capability.

**Co-spec after ratification:**
1. The storage `appendNode`/`appendEdge`/`appendTombstone` signature + M4
   versioned capability + fold-out contract is **FINAL and storage-consented**
   (§5). What remains co-spec with the memory peer is the exact **producer
   wire-shape** — how h2a hands a note over to that signature.
2. **The binary-gate promotion rule (§9.3 D11)** — validator independence,
   eligible grades, threshold, disagreement-to-human path, audit record, PLUS
   the §3.6 neutral projection hook (role parked) and the
   `principal_owner`/`scope` checks.

### 9.3 D11 gate — normative carriers to fold in

- Only `asserted` notes pass; `earned`/`signed` never enter the gate.
- Double consensus, high grade; INDEPENDENCE = a verdict ARTEFACT is required
  (no self-report); disagreement escalates to the human.
- Audit: each promotion appends to the journal (D12) the two verdicts + the
  independence attestation + the note provenance + `principal_owner`/`scope`.
- **Neutral projection hook (§3.6):** capitalisation and cross-principal
  contradiction invoke a NEUTRAL projection hook — no destructive resolution;
  the notes coexist (append-only). The projector ROLE is a parked owner
  decision; if ever instituted, its view is SIGNED (Ed25519) and it is neither
  the note's author nor a D11 leg.

Nothing here is implemented until final ratification (D1) and the storage/exec
owners of the touched surfaces consent. Reversible until then.
