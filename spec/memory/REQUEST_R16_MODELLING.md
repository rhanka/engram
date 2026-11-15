# Owner request R16 — the memory modelling layer (recorded 2026-11-08; updated with 2026-11-10, 2026-11-11, 2026-11-14, and 2026-11-15 owner verbatims)

**Status:** owner request, recorded as stated. It is not yet specified. It follows the R15 sedimentation: the dossier the owner actually commented (artifact `S8tzgFPqn8xXNfFpdLNqUq`), from which the rebuild starts (`memory-dossier/owner-r15/owner-rebuild-2026-11-10.md:3-10`, replacing the rejected `r14 → r15` derivative), and its text sources `R15-SEDIMENT.md`, `OWNER-DECISIONS-2026-11-14.md`, `PLAN_SPEC_ENGRAM_FRONT.md`, `architecture-target.mmd`, and `architecture-current.mmd`.

**Delivery form required by the owner:** the R16 decision dossier is built on the design-system diagram model (`archi@1` / `archi-cards@1` cards and folds), keeping the `cluster-mesh` fold and the agreed `c4` / `h-cond` box readability (`repo` and `components` inside containers), and **representing every ontology as an ERD-type schema (`ontology → class → field`)** that may sit inside an `engram` or `h2a` container (`owner-r15/owner-rebuild-2026-11-10.md:4-5`). A plain Mermaid page does not qualify. Per the owner's sedimentation rule, the dossier states its positions and asks no questions.

## Owner words (verbatim, 2026-11-08)

> « Alors non r15 sans notre modele de diagramme design system c est non. Refais e tu mettencette synthese au sein du r14 qui devient le r15 »
>
> « In fine il m y a aucune modeliaariln fine de l i teracrion dans une session
> Ni aucun cadrage des techno de query graph
> Ni aucune couche de modelisation des entites mises en graphe (faits demandes spec decisions avancement de jalon semantkqje d archi zone physique projet composant etc) et les macro ontologies minimales toujours en contexte (mandat/roles spec archi harnajs). Ni ce qui va permettee l extraction des nouvelles entite donc je veux u r16 avec ces modelisation avec des ontologies articulees et des diagrammes d etat de session avant apres illustres avec exemple conxret. Si c une etape apres ok ru me dia et u commite deja ca en tant que demande clairement exprimee
> Ou de mecanisme de proposition de fait / »

*(Editorial note on the first 2026-11-08 quote above: superseded as base lineage on `2026-11-10` below — rebuild starts directly from the dossier the owner actually commented, artifact `S8tzgFPqn8xXNfFpdLNqUq`, not a derived R14/R15 copy.)*

## Owner words (verbatim, 2026-11-10 and 2026-11-11 — `owner-r15/owner-rebuild-2026-11-10.md:3-10,24,32-33`)

> « sincerement ca va pas:
> - le r15 tu as enlever le repliage du cluster mesh, mais sinon ce schema j'en ai besoin
> - dans r16 j'ai demandé les ontologies, une ontologie c'est un schema type ERD qu'il faut (ontologie, champ), qui pourraie être dans un conteneur engram ou h2a etc.) mais tu as retliré la lisibilité d'usage des boites avec le repo, les composants etc selon le standard agréé avec ... toi meme (c4, h-cond) on a deja discuté de ce sujet et on avait soclé ca.
> - on ne doit jamais voir "[nom retiré à ta demande]" (c,est un équivalent [nom retiré à ta demande] mais c un produit spécifique autour des notion git qu'il faut)
>
> globalement, rebuild avec ce verbatim additionnel directement a partir de mes verbatim mots pour mot, mais en repartant du r13 directement (celui que j'ai vraiment commenté, R15 (artifact S8tzgFPqn8xXNfFpdLNqUq )) pas d'autres dérivé comme le r15 dérivé que tu m'as resservi mais n'es pas le commenté »

Earlier on `2026-11-10` (`owner-r15/owner-rebuild-2026-11-10.md:10`), settling which base is accepted:

> « le r13 !!!! »
>
> « non c bon le r15 ouvert est ok merci »

On `2026-11-11`, remarks on dossier presentation and diagram review (`owner-r15/owner-rebuild-2026-11-10.md:24,32-33`):

> « mais putain on peur rien lire la ... tu met un tableau avec deux colonnes, et puis tu mets des phrases avec des bullet points dans chque case »
>
> « trop long delayer, mets de mots en gras »
>
> « apres voila je veux pas me répéter mais j'ai les memes bugs deja mentionnées a h-cond (espace vertical trop grand, trop de zoom, pas de fit au 16:9. voit avec lui je reverrai quand le design system fournira les composant et l'autolayout et que tu les utilisera car les diagrammes sont illisibles la »

*(Note per `owner-r15/owner-rebuild-2026-11-10.md:28`: `[nom retiré à ta demande]` masks a third-party product name removed from the dossier at the owner's request, without altering any other word of the owner's verbatim.)*

## Owner words (verbatim, 2026-11-14 — status: `unverified — conductor relay, no primary file`; `.graphify/scratch/design/memory-finalization/q6-round/BRIEF.md:6-7`, `sha256:ff4b4e346b61065b7be8f7e587831bcb5d1ea4dca5f7e770048170d9c73162ab`, gitignored per `.gitignore:60`, holds two normalized fragments only)

> « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »

## Owner words and dossier decisions (`2026-11-15` — see `OWNER-DECISIONS-2026-11-14.md` § « Owner words and dossier decisions of 2026-11-15 »)

Owner words ([`spec/memory/evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md`](evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md)`:3-4`, `sha256:9994918754371fbcf6634d676d9a017544593f44ca84fff16a48f481b7df4302`; status: `unverified — conductor relay`, in-repository evidence file, verbatim; full `15/11` remarks and dossier comment [`spec/memory/evidence/2026-11-15/EVIDENCE-owner-comment-r5.md`](evidence/2026-11-15/EVIDENCE-owner-comment-r5.md)`:3-16` recorded in [`OWNER-DECISIONS-2026-11-14.md`](OWNER-DECISIONS-2026-11-14.md)):

> « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
>
> « https://arxiv.org/pdf/2611.05306 inspire toi de ca j aimerais vraiment qu engram devienne le relai de ce type de strategie pour remplacé mecaniquemenr + appui par llm shadow la taille du contexte) dans toutes les cli en ooption + la notre uqi reposera exclusivement sur engeam pour le contexte. Analyse fable5.2 + carbon »

Owner decisions on dossier « journal de session en graphe et outil mémoire » (`2026-11-15`). Exported answer kit, verbatim ([`spec/memory/evidence/2026-11-15/EVIDENCE-owner-answer-kit-r5.yaml`](evidence/2026-11-15/EVIDENCE-owner-answer-kit-r5.yaml)`:2-18`, `sha256:df7cd739e96c7bf90ba11a554b02988dcacbb70efc4118204d9c5e13316e1ba3`; status: `unverified — conductor relay`, in-repository evidence file, pasted by the owner in the `engram` session and relayed verbatim by the conductor):

```yaml
schemaVersion: 1
dossier: "engram-session-graphe"
revision: "r5"
title: "Décision mémoire engram — journal de session en graphe et outil mémoire"
status: "prepared"
recorded: false
responseLine: "D1 A · D2 A · D3 A"
choices:
  - decision: "D1"
    option: "A"
    choice: "Journal + diff : les trois fonctions, données en nœuds et en liens"
  - decision: "D2"
    option: "A"
    choice: "Journal en parallèle + diff injecté : l'outil garde son fil ; engram note chaque étape et n'injecte que le nouveau"
  - decision: "D3"
    option: "A"
    choice: "Le journal d'abord, en trois temps : (1) noter dans les outils tiers ; (2) rendre le diff et chercher dans l'historique ; (3) notre CLI, où engram est le journal principal"
```

*(A follow-up decision dossier requested by the owner on `2026-11-15` (scope: `OWNER-DECISIONS-2026-11-14.md` § « Pending follow-up decision dossier ») is pending; these documents specify no design for its open points until he answers.)*

## What R16 must model

1. **Fine-grained interaction within a session.** A session is a sequence of interactions: owner speech turns, agent turns, tool calls and their results, owner decisions, rule triggers. Each one is an event typed against an ontology and recorded by `engram` first (`R15` engram-first principle). The context of the next turn is a memory-graph query plus its result; no linear transcript is carried forward (`R15`, `D23`). R16's session model follows the owner's `2026-11-15` decisions (`D1 A · D2 A · D3 A` in [`OWNER-DECISIONS-2026-11-14.md`](OWNER-DECISIONS-2026-11-14.md)) and his answer to the pending `2026-11-15` follow-up dossier.
2. **The graph query technology.** Frame the query languages and engines for the contextual query: the expressiveness needed (paths, neighbourhoods, temporal and attention weighting on significant elements, mission focus), latency budgets per turn, and how the query is built from the mandate and the current interaction (following the owner's `2026-11-15` decisions `D1 A · D2 A · D3 A` and his answer to the pending follow-up dossier).
3. **The entity modelling layer (ERD-type schemas inside C4/archi containers).** Every ontology in R16 is represented as an **ERD-type schema (`ontology → class → field`)** inside its owning C4/archi container (`engram`, `h2a`, `Track`, etc.), preserving the agreed `c4` / `h-cond` box readability (`repo` and `components` inside containers) and the `cluster-mesh` fold (`owner-r15/owner-rebuild-2026-11-10.md:4-5`). Under the `2026-11-14` **`T-M-C` ownership rule** (`OWNER-DECISIONS-2026-11-14.md:10-15,25`), **`engram` owns only the shared metamodel (`M`)**, **`Track` is sole author of `Track` domain templates (`T`)**, and **`h2a` is sole author of `h2a` role/skill templates (`T`)**. Entities put in the graph include at least:
   - facts and requests;
   - specs and decisions (both `project/production` and `harness` scopes, blocking vs async posture per `owner-r8/comments-2026-11-07.md:19,54` and `D3`/`D27`);
   - milestone progress (`Track`-authored template under `T-M-C`);
   - architecture semantics: the `archi@1` kinds, physical zone, project, component, and so on.
4. **The minimal macro-ontologies, always in context.** Mandate and roles, spec, architecture and harness. They stay small and stable, so that every contextual query composes from them. Roles and activity types are an `engram` graph in an `h2a`-authored ontology (`R15`, `D16`; `Point 4B`, `OWNER-DECISIONS-2026-11-14.md:25`), and so are the `h2a` harness skills (owner, `2026-11-08`: « une skill de harnais h2a pourrait être un graph » + « de meme pour les rôles h2a »).
5. **Articulated ontologies (`T-M-C` sibling lineages).** How the macro-ontologies, the sibling domain ontology lineages (`Track` templates authored solely by `Track`, `h2a` role/skill templates authored solely by `h2a`, `archi@1` authored in `engram`, and domain profiles), and the per-workspace/repository overlays compose under `engram`'s metamodel (`OWNER-DECISIONS-2026-11-14.md:10-15,25`), drawn as articulated ERD schemas inside C4/archi containers (`owner-r15/owner-rebuild-2026-11-10.md:5`).
6. **Extraction of new entities.** What turns raw session events into new graph entities. Three paths exist: the light permanent extraction LLM, the session LLM, and later specialized models (`R15` engram-first principle). The rules decide which entity types each extractor may emit, without bypassing `Track` application control on `Track`-domain entities (`Point 5B`; third-party annotation with automatic `llm-mesh` fallback follows the pending `2026-11-15` follow-up dossier).
7. **The fact proposal mechanism.** How an extracted or inferred fact becomes a proposal, and how it is admitted, refused or merged:
   - the link to `D1`, `D2`, `D4` and `D12` as settled in `R15`;
   - joint control (`D32`, `Point 5B` in `OWNER-DECISIONS-2026-11-14.md:26`): for the `Track` domain, the `Track` application writes and executes its rules and its verdict is authoritative, while `engram` checks template grammar and holds the `D7` confidentiality blacklist, implemented by a rules/decision engine (`« api type jev/decison »`), a fast LLM or an agent;
   - dreaming as the periodic resynthesis: nightly locally and weekly/monthly remotely after sync (`R15`, `D25`; `Point 3C` in `OWNER-DECISIONS-2026-11-14.md:24`), where any proposal touching the `Track` domain passes `Track` control.

## Required illustrations

- **Session state before and after a turn.** A diagram of the graph state, the contextual query and its result before an owner turn, and the same after the turn: the new events, the extracted entities and the fact proposals. The form of this illustration follows the owner's `2026-11-15` decisions (`D1 A · D2 A · D3 A`) and his answer to the pending `2026-11-15` follow-up dossier (`OWNER-DECISIONS-2026-11-14.md`).
- **One concrete worked example** taken from a real conductor session: an owner correction that becomes a decision, a fact and a spec amendment. Every node and edge is named.
- **The ontology articulation diagram:** ERD-type schemas (`ontology → class → field`) for the macro-ontologies, sibling domain lineages (`Track`, `h2a`, `archi@1`), and overlays nested in their C4/archi containers with `repo` + `components` box readability and the `cluster-mesh` fold (`owner-r15/owner-rebuild-2026-11-10.md:4-5`).

All diagrams use the design-system diagram model (gated for owner diagram review on the Design System components and auto-layout per `owner-r15/owner-rebuild-2026-11-10.md:33-37`).

## Sequencing

R16 comes after the R15 sedimentation is merged, `PLAN_SPEC_ENGRAM_FRONT.md` is updated to the `2026-11-15` decisions (`D1 A · D2 A · D3 A` on dossier « journal de session en graphe et outil mémoire »), and the owner has answered the pending `2026-11-15` follow-up dossier. It spans **`Spec 0` through `Spec 6B`** of `PLAN_SPEC_ENGRAM_FRONT.md`: points 3–5 build on `Spec 0` (metamodel and lineage registry) and `Spec 4` (`h2a` role/skill ontology and overlays), points 1 and 6 extend `Spec 1` (session front and extraction), points 1–3 extend `Spec 2` (contextual graph and seventh memory tool), point 7 extends `Spec 3` (dreaming) and `Spec 5` (`Track` templates and authoritative control), and transport/access across local and remote graphs builds on `Spec 6A` and `Spec 6B` (`cluster-mesh` MCP registry and transactional graph sync).
