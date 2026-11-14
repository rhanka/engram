# Multi-relation graph compatibility

`engram-graph/2` stores each effective directed `(source, target, relation)` tuple
independently. Repeating that assertion unions its verbatim evidence observations.
Incoming traversal labels use `<--`; trees retain one child slot per neighbour.

Upgrade the runtime, the Git-resolved merge driver and all installed skill copies
together on every branch that merges graph files. An older executable can read v2
and silently collapse its links when rewriting. Unknown format versions support
explicit read-only inspection; writers and temporal slices refuse them before
replacing output. Non-finite observation values are refused before mutation.

Displayed `degree` counts distinct neighbours. `edgeCount` counts incident links,
including a self-loop once. QA's `min_degree_by_type`, `max_degree_by_type` and
derivation-specific thresholds retain **endpoint incidence / legacy degree**:
each link increments both endpoints and a self-loop counts twice. Persisted
PostgreSQL layout degrees adopt neighbour counts on the next replace-mode push.

Fresh emissions normalize their locators before capture, using the same root on
direct and batch routes. Already captured observations retain their exact paths,
including absolute paths. Portable inspection uses a separate projection; stored
evidence and its derived locator remain unchanged. Legacy rows without confidence
retain that absence until an actual observation votes.

SQLite and PostgreSQL append capability version 2 advertises `evidenceUnion: true`.
Same-key appends and merge pushes union observations transactionally. Replace
pushes retain snapshot semantics. Tombstones retain their exact triple addressing,
including the storage port's omitted-relation default `RELATES_TO`.

Neo4j and Spanner persist derived scalars only. Every push that discards an
observation set, including a singleton, reports the backend, affected edge count
and “observations not persisted” through warnings. Studio folded views are display
projections and carry no provenance preservation guarantee.
