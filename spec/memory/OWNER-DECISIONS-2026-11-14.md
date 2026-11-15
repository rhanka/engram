# Owner decisions — memory architecture review points (2026-11-14)

Status: decided by the owner on 2026-11-14 in the engram conductor session. These decisions amend `PLAN_SPEC_ENGRAM_FRONT.md` §4 and the three `contracts/`. Settled choices D1–D34 in `R15-SEDIMENT.md` stay unchanged; D28 is explicitly kept.

## Owner verbatims
- On the first, short version of the questions: « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »
- Answer to the detailed questions: « Tout comme recommandé ».

## Ownership rule (T-M-C)
| Term | Master | Scope |
|---|---|---|
| Template | Track | Types, attributes, allowed states and file shapes of the Track domain objects. Track changes them alone, with no engram release. |
| Metamodel | engram | The shared grammar (type, attribute, relation, state, version, lineage, derivation and composition rules) and the lineage registry. engram accepts or refuses a template; it never writes one. |
| Control | the Track application | The verdict on what enters the Track domain: template conformance, bounded list (D1), mandate scope, pre-merge replay (D34). |

Ordering: a short « metamodel and lineage registry » specification chapter is written first, in parallel with Spec 6A.

## Decisions on the six review points
| Point | Decision | Amended statement (summary) |
|---|---|---|
| 1 Engram-first ingestion and per-PR `.track/` | **B** | engram produces the per-PR `.track/` serialization (event journal + state snapshot, D29) by applying the Track domain template version published by Track, cited with its digest. The Track application validates and replays it before merge; a non-conforming projection is refused, never repaired by engram. engram checks only that a template is well formed against its metamodel. **D28 is kept**: engram's live registry stays the reference. |
| 2 Seventh MCP tool and durationless prompt loop | **B** | Spec 2 is written and the seventh tool is built now, disabled by default. It goes live only after the engram + sentropic co-signature and production qualification. Hosts then switch one by one, with a fixed end date. The tool contract fixes only the envelope (template reference and digest), never the list of Track types. |
| 3 Dormant dreaming | **C** | Nightly, mid-day and saturation passes run locally; weekly, monthly and cross-repository audit run remotely after graph sync. Any dreamed proposal touching a Track template is a request to Track, which alone accepts it. Any typed write it proposes in the Track domain passes Track control. |
| 4 Role ontology and harness overlays | **B** | Two sibling lineages under engram's metamodel. The h2a role, activity and harness profile has h2a as sole author. The Track domain templates have Track as sole author. Cross-references go by composition with version pinning. engram may propose role changes, never write them. `archi@1` stays unchanged (D16). |
| 5 Joint control | **B** | For the Track domain, the Track application writes and executes its rules, and its verdict is authoritative; engram records it and never replaces it. engram checks template well-formedness and holds the confidentiality deny-list (D7). Without a verdict, a typed write stays proposed, while the raw record is already in engram. Control still originates from both sides (D32). |
| 6 Integral graph sync over cluster-mesh | **A** | One bidirectional mechanism, enabled workspace by workspace. Every typed object cites its template version, and template versions travel with the graph. cluster-mesh carries objects without knowing Track types. Sync never overwrites a Track-controlled record; concurrent template versions published offline are refused and Track decides. |

## Inputs of the round
`.graphify/scratch/design/memory-finalization/q6-round/`: Fable 5.2 draft, Carbon draft, h2a position, consolidation.
