# SPEC — Studio group-by UX (per-item + tri-state bulk buttons) — APPROVED

User-approved design (double-consensus 4.8 on the bulk-button best-practice). This is the contract.

## 1. State model (single source of truth)
The state = **the set of checked items** (ontology class keys + community keys), i.e. `groupBy.grouped`. Checking an item groups (collapses) it. Bulk buttons are **shortcuts/toggles over that set**. The tree checkboxes are the truth; buttons are verbs.

## 2. Per-item checkboxes
A **bare checkbox on the LEFT** (no text label; hover = the only "group by" signal via `title` tooltip + a hover-only visual hint) on EVERY groupable row:
- Ontology: **Domain**, **Sub-domain**, AND **Type** rows (the Type checkbox is ADDED next to the existing Type FILTER select — group ≠ filter, keep them separate).
- Communities: each community row (already correct).
Checking groups that item; **multi-select**; ontology + community checks group together (union).

### Bugs to FIX (currently broken)
- 🐛 **Ontology per-item grouping does NOT actually group** — only communities work. Checking a Domain/Sub-domain/Type must collapse that class's nodes into the class group node. FIND THE ROOT CAUSE (the ontology collapse path: injectOntologyClassNodes / buildClassParentIndex / collapseTargets in App.svelte `groupedGraph`) and fix it. Write a failing→passing test driving the real App grouping chain (group by a Domain → node count drops, members folded under the class node).
- 🐛 **"Type" level grouping does NOT work** — grouping at the Type (leaf) level must collapse nodes into their type. Fix + test.

## 3. Nesting (ontology levels are hierarchical)
A node collapses to its **nearest checked ancestor class** (Domain supersedes Sub-domain supersedes Type if multiple ancestors checked). A class **absorbed by a grouped ancestor** renders **disabled + tooltip** ("grouped by parent <Domain>") so the user sees it's covered. "ALL at level X" means: all classes whose **effective** grouping resolves to X (excluding absorbed ones) — the count denominators must exclude absorbed classes.

## 4. Bulk buttons — Ontology section (TRI-STATE toggles)
Buttons: **`Group all to: Domain | Sub-domain | Type`** + **`Ungroup all`**. The DS Button has only `primary`/`secondary` variants (no third) + native `disabled`. Tri-state = 2 variants + a count Badge.

Per `Group all to: <level>` button, by that level's state:
| State | DS variant | aria | Visible | Click action |
|---|---|---|---|---|
| **NONE** of the level grouped | `secondary` | `aria-pressed="false"` | "Group all to <level>" | group every (non-absorbed) class at that level |
| **ALL** (effective) grouped | **`primary`** | `aria-pressed="true"` | "Group all to <level>" | **toggle OFF** — ungroup that level |
| **PARTIAL** | `secondary` + Badge `tone="neutral"` `"3/6"` | `aria-pressed="false"` | "Group all to <level>" (acc. name "(3 of 6 grouped)") | **complete to ALL** (group the rest) |

Cycle: `none → all → none`; `partial → all`. Never two clicks to finish; never `aria-checked="mixed"` (that's checkbox-only — these are toggle buttons → `aria-pressed`).

**`Ungroup all`** (ontology): `secondary`, native **`disabled`** when zero ontology classes are grouped. Clears all ontology grouped keys (ontology scope only).

## 5. Bulk buttons — Communities section (FLAT, 2-state)
No levels, no partial, no count. Buttons: **`Group all`** + **`Ungroup all`**.
- `Group all`: `secondary` → **`primary`** (`aria-pressed="true"`) when ALL communities grouped; click toggles (group all / ungroup all).
- `Ungroup all`: `secondary`, native `disabled` when zero communities grouped. Clears community grouped keys (community scope only).

## 6. Keep intact (no regression)
Checkbox-left placement (done), Types→Ontology rename, count badges + reactive x/N, model-switch preservation, A5 tone, community namespacing, the community grouping fix (GROUPED∩LIVE), Ontology/Communities open by default, the Ontology FILTER facet (onToggleType) separate from the group-by checkboxes.

## 7. Acceptance (UAT, on mystery studio)
- Every ontology Domain/Sub-domain/Type row + every community row shows a bare LEFT checkbox, no "group" text.
- Checking a Domain/Sub-domain/Type **regroups the graph** (the bug is fixed); checking a community regroups; mixing works.
- "Group all to: Domain" → all domains grouped + the button goes `primary`; click again → ungroups (toggle). Partial → shows `(n/m)` + completes on click.
- "Type" works. Absorbed classes render disabled with the parent tooltip.
- "Ungroup all" present + **disabled** when nothing grouped in that section; enabled + clears when something is.
- Communities section: 2-state Group all / Ungroup all, no count.
- Full studio suite green + new failing→passing tests for: ontology per-item grouping, Type grouping, the tri-state button state mapping, the disabled ungroup-all, nesting absorption.
