# SPEC — Id-diff guard on republication

Status: **design, awaiting validation — no implementation**

Date: 2026-08-08

Baseline: `main` at `64708bee`

Origin: adopted from the pre-mortem of the node-id decision dossier. That lot
turned out to be a no-op (7 of 8 rows do not reproduce in TS), but the pre-mortem
it produced stands on its own and is what this spec answers.

## 1. The failure this prevents

Republication is automatic. If a change to extraction moves a node id, the new
graph is published over the old one and **nothing compares the two**. Consumers
that reference the old ids — deep links, cross-work reconciliation, anything that
stored an id — break silently, and the breakage surfaces long after the change
that caused it.

The danger is not that ids change. It is that they change **unobserved**.

## 2. What is guarded, and what is not

| Change | Legitimate? | Guard behaviour |
| --- | --- | --- |
| ids **added** | yes — the corpus grows | report, never block |
| ids **removed** | usually — content deleted | report, never block |
| ids **moved** (same entity, new id) | almost never | **this is the signal** |

Conflating the three is how this class of guard dies: a gate that fires on every
legitimate corpus growth gets disarmed within weeks. The guard is only worth
building if it can name the third case specifically.

**Detecting "moved" requires an identity anchor other than the id.** The id is
what changed, so it cannot be its own key. The workable anchor is the pair
`(label, source_file)` — stable across a canonicalization change, since those
change how an id is *derived*, not what the node *is*. A node whose
`(label, source_file)` is present in both graphs under two different ids is a
**move**. A node whose anchor appears only on one side is an add or a remove.

This anchor is a design assumption, not a proven invariant, and it is the first
thing to challenge in review.

## 3. Artifact

Alongside each published graph, a companion file:

```
ids.json   { "count": <n>, "sha256": "<hash of the sorted id list>",
             "anchors": { "<sha256(label|source_file)>": "<id>", ... } }
```

- `count` + `sha256` give an O(1) "did anything change at all" check.
- `anchors` is what makes move-detection possible. It is the only part with real
  size — one short entry per node.

It is **versioned with the graph**, not cached. An artifact that travels with the
thing it describes cannot go stale against it, and a fresh clone gets the
baseline for free.

## 4. Control point

In the **republication CI**, not the extraction runtime. The runtime must not
carry a notion of "already published" — that is a property of the publishing
pipeline, not of extraction.

Sequence: re-extract → compute `ids.json` → compare with the published one →
emit the delta → publish (and replace `ids.json`).

## 5. Output contract

```
id-diff vs published:  +14 added   -2 removed   3 MOVED
  moved:
    "recit_enquete"      ->  "recit_enquete_a_paris"    (Enquête à Paris | récit.md)
    ...
```

`added` and `removed` are informational. `moved` is non-zero → the run is
**flagged**. Whether flagged means *blocked* is §7.

## 6. Deliberately out of scope

- Edge diffing. Edges follow their endpoints; guarding ids first is the cheap
  90%, and edge churn without id churn is a different question.
- Attribute diffing (labels, descriptions, positions). Those change constantly
  and legitimately; folding them in would drown the signal.
- Any automatic remediation. The guard reports; a human decides.

## 7. Open question — the one this spec does not decide

**Does a non-zero `moved` count block republication, or only report it?**

Recommendation: **report first, harden later.** A hard gate placed on a signal
never yet observed in production tends to block a legitimate republication on its
first day and then get disarmed permanently. Ship it observing, learn what a
normal `moved` count looks like (the honest expectation is zero), and promote it
to blocking once there is evidence the signal is clean.

The counter-argument deserves recording: a reporting-only guard that nobody reads
is worth nothing, and the whole point is that republication is *automatic* —
there may be no human in the loop to read a report. If that is the case, blocking
is the only mode that means anything, and the right move is to ship it blocking
with a documented override.

This is an owner/conductor call, not an implementer's.

## 8. Cost

Small. One artifact writer, one comparator, one CI step. No change to extraction.
The expensive part is the anchor assumption in §2 — if it does not hold, the
guard degrades to add/remove counting, which is worth much less.
