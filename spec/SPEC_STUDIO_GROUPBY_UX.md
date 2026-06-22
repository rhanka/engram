# SPEC — Studio group-by UX (per-item) — user-dictated, verbatim

Source: user requirements, transcribed exactly. This is the contract; implement it faithfully.

## The interaction (the approved mockup)
```
Ontology ▾
  ☐ People            ← bare checkbox, ON THE LEFT, NO text next to it
  ☐ Detective
  ☑ Suspect           ← checked = grouped (collapsed) by this class
Communities ▾
  ☑ Community 8        ← bare checkbox on the LEFT = grouped by this community
  ☐ Community 14
```

## Hard requirements (each is a MUST)
1. **Checkbox ON THE LEFT** of every groupable item — each Ontology class row (Domain + Sub-domain) AND each Community row. The checkbox is the FIRST thing on the row (left edge), before the label. (Currently it is wrongly in the `trailing()` snippet = right side — MOVE it to `leading()`/left.)
2. **NO text** next to the checkbox at rest. Remove the `<span class="rail-group-hint">group</span>` entirely. At rest the affordance is ONLY a bare checkbox.
3. **Hover is the ONLY signal** that the checkbox means "group by". On hover of the row, signal it (a `title`/tooltip "Group by <name>" is acceptable, and/or a subtle visual hint that appears on hover). NEVER a persistent text label.
4. **Multi-select**: several checked items group simultaneously (Ontology classes + communities mixed).
5. **Community grouping MUST actually WORK** — checking a Community checkbox MUST collapse/regroup the graph so that the community's member nodes fold into the community group node (same as the ontology axis does for classes). This is currently BROKEN (the checkbox is wired but the graph does not regroup). Find and fix the runtime path (`mintCommunityNodeIds` → `injectCommunityNodes` → `buildCommunityParentIndex.collapseTargetByKey` → `applyGroupCollapse`).
6. Keep separate: the group-by checkbox (`onToggleGroupOntology`/`onToggleGroupCommunity`) is NOT the row's filter/select (`onToggleType`/`onToggleCommunity`). Grouping ≠ selecting.
7. Keep intact: Types→Ontology rename, count badges + reactive x/N, model-switch preservation, A5 tone, Ontology/Communities open by default.

## Acceptance criteria (UAT)
- **Visual**: on the mystery studio, each Ontology class row and each Community row shows a bare checkbox at its LEFT edge, with NO "group" text. Hover reveals the "Group by …" signal only.
- **Functional — community**: check a community's checkbox → the graph visibly REGROUPS: that community's member nodes collapse into a single community group node (and uncheck restores). Proven by a unit/integration test on the App `groupedGraph` derivation: grouping by a live community key yields a collapsed graph where the community's members are folded under the community node (node count drops / community node present). The test must FAIL on the current code and PASS after the fix.
- **Functional — multi**: checking 2 communities + 1 ontology class collapses all three at once.
