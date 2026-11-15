# Design note — view projection boundary between engram and the design system (2026-11-14)

Trigger: the same defect class appeared in two review rounds of `spec/SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md`.
- DS round 1, finding 1: engram pre-projected the view document (stripped folded descendants, pre-lifted endpoints).
- DS round 2, change 1: a static `FoldValidationMask.projectedHiddenRelationOccurrences` is still precomputed under `folded_edge_policy: hide`.
Under the conductor rules, a design note comes before the next fix round.

## Rule
engram never computes anything the DS derives from folding, layout or rendering. It serves:
1. **declarations** — the view declaration (selection, fold rules, overlays, axes, layout hint by DS pin, status), as validated against the metamodel;
2. **semantic data** — the selected subgraph (nodes, relations, attributes, evidence references), pinned to a commit and digest.

## Rendering state engram never serves
engram never serves any of the following, as data or as a mask:
- hidden or visible occurrence sets;
- lifted endpoints;
- summary candidates;
- fold states;
- geometry;
- layout caches;
- any rendering-derived count.

The DS computes all of them through diagram-core (`validateView`, `projectView`, `summaryCandidates`).

## Where a DS schema requires a field engram cannot know
For example, `EntityOccurrence.geometry`. engram emits a neutral, explicitly marked placeholder that the DS overwrites, never a guessed value. The placeholder's shape is fixed by the DS schema and referenced by pin.

## Validation split
- **engram validates:** declaration well-formedness against the metamodel, and referential integrity of the semantic data.
- **The DS validates:** projection, fold and layout outcomes.

A rule that can only be checked after folding belongs to the DS validator, not to an engram mask.

## Consequence for the round-3 fix
Remove `FoldValidationMask.projectedHiddenRelationOccurrences` and any other precomputed fold or projection result. Keep a mask only where it is a pure function of declarations and semantic data, never of DS fold outcomes. State this rule once in the spec's ownership section and reference it from each affected place.
