# Owner request R16 — the memory modelling layer (recorded 2026-11-08)

**Status:** owner request, recorded as stated. It is not yet specified. It follows the R15 sedimentation: the r15 dossier (the r14 dossier updated, in the design-system diagram model) and its text sources `R15-SEDIMENT.md`, `PLAN_SPEC_ENGRAM_FRONT.md`, `architecture-target.mmd`, and `architecture-current.mmd`.

**Delivery form required by the owner:** the R16 decision dossier is built on the design-system diagram model (the archi@1 / archi-cards@1 cards and folds). A plain Mermaid page does not qualify. Per the owner's sedimentation rule, the dossier states its positions and asks no questions.

## Owner words (verbatim, 2026-11-08)

> « Alors non r15 sans notre modele de diagramme design system c est non. Refais e tu mettencette synthese au sein du r14 qui devient le r15 »
>
> « In fine il m y a aucune modeliaariln fine de l i teracrion dans une session
> Ni aucun cadrage des techno de query graph
> Ni aucune couche de modelisation des entites mises en graphe (faits demandes spec decisions avancement de jalon semantkqje d archi zone physique projet composant etc) et les macro ontologies minimales toujours en contexte (mandat/roles spec archi harnajs). Ni ce qui va permettee l extraction des nouvelles entite donc je veux u r16 avec ces modelisation avec des ontologies articulees et des diagrammes d etat de session avant apres illustres avec exemple conxret. Si c une etape apres ok ru me dia et u commite deja ca en tant que demande clairement exprimee
> Ou de mecanisme de proposition de fait / »

## What R16 must model

1. **Fine-grained interaction within a session.** A session is a sequence of interactions: owner speech turns, agent turns, tool calls and their results, owner decisions, rule triggers. Each one is an event typed against an ontology and recorded by engram first (R15 engram-first principle). The context of the next turn is a memory-graph query plus its result. No linear transcript is carried forward (R15, D23).
2. **The graph query technology.** Frame the query languages and engines for the contextual query: the expressiveness needed (paths, neighbourhoods, temporal and attention weighting on significant elements, mission focus), latency budgets per turn, and how the query is built from the mandate and the current interaction.
3. **The entity modelling layer.** The entities put in the graph, with their identities, attributes and relations. They include at least:
   - facts and requests;
   - specs and decisions;
   - milestone progress;
   - architecture semantics: the archi@1 kinds, physical zone, project, component, and so on.
4. **The minimal macro-ontologies, always in context.** Mandate and roles, spec, architecture and harness. They stay small and stable, so that every contextual query composes from them. Roles and activity types are an engram graph in an h2a ontology (R15, D16), and so are the h2a harness skills (owner, 2026-11-08: « une skill de harnais h2a pourrait être un graph » + « de meme pour les rôles h2a »).
5. **Articulated ontologies.** How the macro-ontologies, the domain ontologies (archi@1, profiles) and the per-workspace overlays compose, through the engram derivation models.
6. **Extraction of new entities.** What turns raw session events into new graph entities. Three paths exist: the light permanent extraction LLM, the session LLM, and later specialized models (R15 engram-first principle). The rules decide which entity types each extractor may emit.
7. **The fact proposal mechanism.** How an extracted or inferred fact becomes a proposal, and how it is admitted, refused or merged:
   - the link to D1, D2, D4 and D12 as settled in R15;
   - control from engram and Track, by a rules/decision engine, a fast LLM or an agent (R15, D32);
   - dreaming as the periodic resynthesis: nightly, weekly and monthly by default (R15, D25).

## Required illustrations

- **Session state before and after a turn.** A diagram of the graph state, the contextual query and its result before an owner turn, and the same after the turn: the new events, the extracted entities and the fact proposals.
- **One concrete worked example** taken from a real conductor session: an owner correction that becomes a decision, a fact and a spec amendment. Every node and edge is named.
- **The ontology articulation diagram:** the macro-ontologies, the domain ontologies and the overlays.

All diagrams use the design-system diagram model.

## Sequencing

R16 comes after the R15 sedimentation is merged and the owner has reviewed `PLAN_SPEC_ENGRAM_FRONT.md`. It extends Specs 1 to 5 of that plan: points 1 and 6 extend Spec 1, points 2 and 3 Spec 2, points 4 and 5 Spec 4, and point 7 Specs 3 and 5.
