# Architecture Diagram Rules (`archi@1`)

These five binding rules govern every canonical `.mmd` diagram under `spec/memory/` (`architecture-target.mmd`, `architecture-current.mmd`) and every Mermaid mirror in `PLAN_SPEC_ENGRAM_FRONT.md`.

1. **No bypass (R12).** No relation may cross between the engram system and any other system (`@sentropic/h2a` and Track, the GitHub/board interface layer, Git repositories) except through `cluster-mesh`. This invariant holds in every view and every fold state: the default view, all containers expanded, all containers collapsed, and each single container toggle (`SPEC_EVOL_ARCHI_CARDS.md:387`; `owner-r9/r12-correction-2026-11-07.md:9`; `kit/src/memory-content-r11.json:287`). Collapsing a container must never turn a mediated path into a direct cross-system edge, nor may cross-system access be hidden by nesting an external store or interface inside `h2a` or `engram`.
2. **One call, one edge.** A call and its answer travel on the same `consumesApi` relation (`SPEC_EVOL_ARCHI_CARDS.md:90`). Never draw a separate return edge from the provider or store back to the caller.
3. **Separate layers (D30).** `@sentropic/engram`, `@sentropic/h2a` + Track, the GitHub and board interface layer, and the Git repositories and PR artifacts are four distinct top-level `system` containers (plus `@sentropic/cluster-mesh` as the mediating system), never nested inside one another (`R15-SEDIMENT.md` D30).
4. **Only `archi@1` tuples and required attributes.** Use only endpoint tuples permitted by the `archi@1` 55-tuple relation matrix (`SPEC_EVOL_ARCHI_CARDS.md:52-96`):
   - `invokes` is allowed `runtime → runtime` only and requires a `trigger` attribute (`:86`).
   - `dependsOn` is allowed `package → package` only (`:88`).
   - Any call from a `runtime` or `service` to a `service` goes through `consumesApi` targeting an `api` entity provided (`providesApi`) by that service, labelled with the `calls` verb (`:308`).
   - Every `store` entity carries a required `writerPolicy` attribute (`single-writer` or `multi-writer`, `:64`).
5. **Mirrors are generated.** Every Mermaid flowchart mirror in `PLAN_SPEC_ENGRAM_FRONT.md` (§1 and §2) is regenerated directly from its canonical `.mmd` file and matches its drawn containers, leaf entities, and arrow-encoded relations one for one (with footer relations `runsOn`, `operatedBy`, `managedIn`, and `ownedBy` omitted from the flowchart).
