# Owner request R16 — the memory modelling layer (recorded 2026-11-08; updated with 2026-11-10, 2026-11-14, and 2026-11-15 owner verbatims)

**Status:** owner request, recorded as stated. It is not yet specified. It follows the R15 sedimentation: the commented R15 dossier (artifact `S8tzgFPqn8xXNfFpdLNqUq`, built directly from the commented R13 base in the design-system diagram model per `memory-dossier/owner-r15/owner-rebuild-2026-11-10.md:3-8`, replacing the rejected `r14 → r15` derivative) and its text sources `R15-SEDIMENT.md`, `OWNER-DECISIONS-2026-11-14.md`, `PLAN_SPEC_ENGRAM_FRONT.md`, `architecture-target.mmd`, and `architecture-current.mmd`.

**Delivery form required by the owner:** the R16 decision dossier is built on the design-system diagram model (`archi@1` / `archi-cards@1` cards and folds), keeping the `cluster-mesh` fold and the agreed `c4` / `h-cond` box readability (`repo` and `components` inside containers), and **representing every ontology as an ERD-type schema (`ontology → class → field`)** that may sit inside an `engram` or `h2a` container (`owner-r15/owner-rebuild-2026-11-10.md:4-5`). A plain Mermaid page does not qualify. Per the owner's sedimentation rule, the dossier states its positions and asks no questions.

## Owner words (verbatim, 2026-11-08)

> « Alors non r15 sans notre modele de diagramme design system c est non. Refais e tu mettencette synthese au sein du r14 qui devient le r15 » *(superseded as base lineage on `2026-11-10` below: rebuild directly from commented R13 / R15 artifact `S8tzgFPqn8xXNfFpdLNqUq`, not a derived R14/R15 copy)*
>
> « In fine il m y a aucune modeliaariln fine de l i teracrion dans une session
> Ni aucun cadrage des techno de query graph
> Ni aucune couche de modelisation des entites mises en graphe (faits demandes spec decisions avancement de jalon semantkqje d archi zone physique projet composant etc) et les macro ontologies minimales toujours en contexte (mandat/roles spec archi harnajs). Ni ce qui va permettee l extraction des nouvelles entite donc je veux u r16 avec ces modelisation avec des ontologies articulees et des diagrammes d etat de session avant apres illustres avec exemple conxret. Si c une etape apres ok ru me dia et u commite deja ca en tant que demande clairement exprimee
> Ou de mecanisme de proposition de fait / »

## Owner words (verbatim, 2026-11-10 — `owner-r15/owner-rebuild-2026-11-10.md:3-8`)

> « sincerement ca va pas:
> - le r15 tu as enlever le repliage du cluster mesh, mais sinon ce schema j'en ai besoin
> - dans r16 j'ai demandé les ontologies, une ontologie c'est un schema type ERD qu'il faut (ontologie, champ), qui pourraie être dans un conteneur engram ou h2a etc.) mais tu as retliré la lisibilité d'usage des boites avec le repo, les composants etc selon le standard agréé avec ... toi meme (c4, h-cond) on a deja discuté de ce sujet et on avait soclé ca.
> - on ne doit jamais voir "[nom retiré à ta demande]" (c,est un équivalent [nom retiré à ta demande] mais c un produit spécifique autour des notion git qu'il faut)
>
> globalement, rebuild avec ce verbatim additionnel directement a partir de mes verbatim mots pour mot, mais en repartant du r13 directement (celui que j'ai vraiment commenté, R15 (artifact S8tzgFPqn8xXNfFpdLNqUq )) pas d'autres dérivé comme le r15 dérivé que tu m'as resservi mais n'es pas le commenté »

*(Note per `owner-r15/owner-rebuild-2026-11-10.md:28`: `[nom retiré à ta demande]` masks a third-party product name removed from the dossier at the owner's request, without altering any other word of the owner's verbatim.)*

## Owner words (verbatim, 2026-11-14 — `OWNER-DECISIONS-2026-11-14.md:6`)

> « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »

## Owner words (verbatim, 2026-11-15)

> « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »

## What R16 must model

1. **Fine-grained interaction within a session.**
   > **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »

   *Historical 08/11 framing (`R15`, `D23`):* A session is a sequence of interactions: owner speech turns, agent turns, tool calls and their results, owner decisions, rule triggers. Each one is an event typed against an ontology and recorded by `engram` first (`R15` engram-first principle). The context of the next turn is a memory-graph query plus its result; no linear transcript is carried forward (`R15`, `D23`). *Pending the 15/11 decision dossier above, R16 must reflect the owner's 15/11 session-graph direction (`engram` as parallel `en //` session logger alongside external tools and primary logger in our own CLI, session logged as a graph, and only the diff transmitted each time).*
2. **The graph query technology.** Frame the query languages and engines for the contextual query: the expressiveness needed (paths, neighbourhoods, temporal and attention weighting on significant elements, mission focus), latency budgets per turn, and how the query is built from the mandate and the current interaction (aligned with the pending 15/11 session-graph diff dossier above).
3. **The entity modelling layer (ERD-type schemas inside C4/archi containers).** Every ontology in R16 is represented as an **ERD-type schema (`ontology → class → field`)** inside its owning C4/archi container (`engram`, `h2a`, `Track`, etc.), preserving the agreed `c4` / `h-cond` box readability (`repo` and `components` inside containers) and the `cluster-mesh` fold (`owner-r15/owner-rebuild-2026-11-10.md:4-5`). Under the `2026-11-14` **`T-M-C` ownership rule** (`OWNER-DECISIONS-2026-11-14.md:10-15,25`), **`engram` owns only the shared metamodel (`M`)**, **`Track` is sole author of `Track` domain templates (`T`)**, and **`h2a` is sole author of `h2a` role/skill templates (`T`)**. Entities put in the graph include at least:
   - facts and requests;
   - specs and decisions (both `project/production` and `harness` scopes, blocking vs async posture per `owner-r8/comments-2026-11-07.md:19,54` and `D3`/`D27`);
   - milestone progress (`Track`-authored template under `T-M-C`);
   - architecture semantics: the `archi@1` kinds, physical zone, project, component, and so on.
4. **The minimal macro-ontologies, always in context.** Mandate and roles, spec, architecture and harness. They stay small and stable, so that every contextual query composes from them. Roles and activity types are an `engram` graph in an `h2a`-authored ontology (`R15`, `D16`; `Point 4B`, `OWNER-DECISIONS-2026-11-14.md:25`), and so are the `h2a` harness skills (owner, `2026-11-08`: « une skill de harnais h2a pourrait être un graph » + « de meme pour les rôles h2a »).
5. **Articulated ontologies (`T-M-C` sibling lineages).** How the macro-ontologies, the sibling domain ontology lineages (`Track` templates authored solely by `Track`, `h2a` role/skill templates authored solely by `h2a`, `archi@1` authored in `engram`, and domain profiles), and the per-workspace/repository overlays compose under `engram`'s metamodel (`OWNER-DECISIONS-2026-11-14.md:10-15,25`), drawn as articulated ERD schemas inside C4/archi containers (`owner-r15/owner-rebuild-2026-11-10.md:5`).
6. **Extraction of new entities.** What turns session interactions into new graph entities. Three paths exist: the light permanent extraction LLM, the session LLM, and later specialized models (`R15` engram-first principle). The rules decide which entity types each extractor may emit, without bypassing `Track` application control on `Track`-domain entities (`Point 5B`).
7. **The fact proposal mechanism.** How an extracted or inferred fact becomes a proposal, and how it is admitted, refused or merged:
   - the link to `D1`, `D2`, `D4` and `D12` as settled in `R15`;
   - joint control (`D32`, `Point 5B` in `OWNER-DECISIONS-2026-11-14.md:26`): for the `Track` domain, the `Track` application writes and executes its rules and its verdict is authoritative, while `engram` checks template grammar and holds the `D7` confidentiality blacklist, implemented by a rules/decision engine (`« api type jev/decison »`), a fast LLM or an agent;
   - dreaming as the periodic resynthesis: nightly locally and weekly/monthly remotely after sync (`R15`, `D25`; `Point 3C` in `OWNER-DECISIONS-2026-11-14.md:24`), where any proposal touching the `Track` domain passes `Track` control.

## Required illustrations

- **Session state before and after a turn.** A diagram of the session-graph state before an owner turn and after the turn: the new events, extracted entities, fact proposals, and per-step graph diff transition (pending the owner's `2026-11-15` decision dossier `"journal de session en graphe et outil mémoire"`).
- **One concrete worked example** taken from a real conductor session: an owner correction that becomes a decision, a fact and a spec amendment. Every node and edge is named.
- **The ontology articulation diagram:** ERD-type schemas (`ontology → class → field`) for the macro-ontologies, sibling domain lineages (`Track`, `h2a`, `archi@1`), and overlays nested in their C4/archi containers with `repo` + `components` box readability and the `cluster-mesh` fold (`owner-r15/owner-rebuild-2026-11-10.md:4-5`).

All diagrams use the design-system diagram model (gated for owner diagram review on the Design System components and auto-layout per `owner-r15/owner-rebuild-2026-11-10.md:33-37`).

## Sequencing

R16 comes after the R15 sedimentation is merged and the owner has reviewed `PLAN_SPEC_ENGRAM_FRONT.md` and resolved the `2026-11-15` decision dossier `"journal de session en graphe et outil mémoire"`. It spans **`Spec 0` through `Spec 6B`** of `PLAN_SPEC_ENGRAM_FRONT.md`: points 3–5 build on `Spec 0` (metamodel and lineage registry) and `Spec 4` (`h2a` role/skill ontology and overlays), points 1 and 6 extend `Spec 1` (session front and extraction), points 1–3 extend `Spec 2` (contextual graph and session diff loop), point 7 extends `Spec 3` (dreaming) and `Spec 5` (`Track` templates and authoritative control), and transport/access across local and remote graphs builds on `Spec 6A` and `Spec 6B` (`cluster-mesh` MCP registry and transactional graph sync).
