# Owner decisions — memory architecture review points (2026-11-14)

Status: decided by the owner on `2026-11-14` (`2026-11-14T21:41:51.388Z`) in the `engram` conductor session, strictly within the scope of the detailed message and structured question shown to the owner ([`spec/memory/evidence/2026-11-14/EVIDENCE-q6-message-shown-to-owner.md`](evidence/2026-11-14/EVIDENCE-q6-message-shown-to-owner.md) and [`spec/memory/evidence/2026-11-14/EVIDENCE-q6-owner-question-and-answer.json`](evidence/2026-11-14/EVIDENCE-q6-owner-question-and-answer.json); status: in-repository evidence files); sub-clauses added by review seats that were not in that message or question are marked **`proposed, not decided by the owner`** with their source seat (`Fable`, `Carbon`, `h2a`). On `2026-11-15`, the owner decided options **`D1 A · D2 A · D3 A`** on decision dossier « journal de session en graphe et outil mémoire » and asked for the dossier to be redone in full with his remarks, which is pending — see § « Owner words and dossier decisions of 2026-11-15 » below (in-repository evidence under `spec/memory/evidence/2026-11-15/`). Settled choices `D1`–`D34` in `R15-SEDIMENT.md` stay unchanged; **`D28` is explicitly kept**.

## Owner verbatims and evidence anchors
- On the first, short version of the questions (status: `unverified — conductor relay, no primary file`; raw chat spelling preserved as relayed; `.graphify/scratch/design/memory-finalization/q6-round/BRIEF.md:6-7`, `sha256:ff4b4e346b61065b7be8f7e587831bcb5d1ea4dca5f7e770048170d9c73162ab`, holds two spell-normalized fragments only, not the full message, and `.graphify/scratch/` is gitignored per `.gitignore:60`): « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »
- Detailed message shown to the owner (`2026-11-14T21:41:43.079Z`; status: in-repository evidence file, conductor chat message shown to the owner): [`spec/memory/evidence/2026-11-14/EVIDENCE-q6-message-shown-to-owner.md`](evidence/2026-11-14/EVIDENCE-q6-message-shown-to-owner.md)`:1-70` (`sha256:3d35c615c7da23e7838e47d86d560dba876a1c7a9f42e0fde0d55cda3d431444`).
- Structured question and owner's selected answer (`2026-11-14T21:41:51.388Z`; status: in-repository evidence file, structured question-tool capture and owner answer; [`spec/memory/evidence/2026-11-14/EVIDENCE-q6-owner-question-and-answer.json`](evidence/2026-11-14/EVIDENCE-q6-owner-question-and-answer.json)`:3-26`, `sha256:7d9e423c61b5ee85de91769dbfb8bff0d2e2db49b7ce742b65064186f1c3f5ea`): « Tout comme recommandé (Recommandé) » (option description: « Lecture de la règle confirmée ; 1B, 2B, 3C, 4B, 5B, 6A ; D28 gardé (registre engram de référence, verdict au contrôle Track). Je réécris les 3 contrats et je lance le chapitre métamodèle puis l'accès mémoire, avec Carbon pour la conception. »).

## Ownership rule (T-M-C)
| Term | Master | Decided on 14/11 (`EVIDENCE-q6-message-shown-to-owner.md:7-12`, `EVIDENCE-q6-owner-question-and-answer.json:6,12`) | `proposed, not decided by the owner` (seat extensions) |
|---|---|---|---|
| Template | Track | Domain objects of `Track`: types, allowed states, and `.track/` file shapes. `Track` decides and evolves them alone, with no `engram` release. | Typed attribute schemas inside `Track` templates (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`). |
| Metamodel | engram | The shared grammar (what a type, a relation, and a version is) and the registry. `engram` accepts or refuses a template; it never writes one. | Extended metamodel grammar clauses (`attribute`, `state`, `file-projection` descriptors, `lineage`, and cross-lineage `derivation and composition rules`) (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`). |
| Control | the Track application | The verdict on what enters the `Track` domain: template conformance, bounded list (`D1`), mandate, and pre-merge replay (`D34`). | — |

Editorial specification ordering (proposed by seat `Fable` in `q6-fable.fr.md:309` / `Q6-CONSOLIDE.fr.md:12`; presented in `EVIDENCE-q6-message-shown-to-owner.md:13` as « écrire **en premier** un court chapitre « métamodèle et registre de lignées », en parallèle de l'accès mémoire, puisque Track change ses ontologies en ce moment » and in the owner-selected option of `EVIDENCE-q6-owner-question-and-answer.json:12` as « je lance le chapitre métamodèle puis l'accès mémoire »; not an owner-originated verbatim rule): write a short « metamodel and lineage registry » specification chapter (`Spec 0`) first, alongside / ahead of memory access (`Spec 6A`).

## Decisions on the six review points
| Point | Decision | Decided on 14/11 (strictly in `EVIDENCE-q6-message-shown-to-owner.md` & `EVIDENCE-q6-owner-question-and-answer.json`) | `proposed, not decided by the owner` (not in question or message) |
|---|---|---|---|
| 1 Engram-first ingestion and per-PR `.track/` | **B** | `engram` is the first step (`D24`, `D32`), CLI hooks send each turn to `engram` via `cluster-mesh` *(for the `2026-11-15` session-journal decisions `D1 A · D2 A · D3 A` and the pending follow-up dossier, see § below)*, and no one writes `.track/` manually: `engram` generates the per-PR `.track/` copy (event journal + state snapshot, `D29`) by applying the `Track` template version published by `Track`, and `Track` control replays the copy before merge and blocks merge on discrepancy (`D34`, `message:18-26,70`, `question:6,12`). **Unblocks (`message:26`):** memory access via `cluster-mesh` (`Spec 6A`), then the session front (`Spec 1`, « l'accès mémoire via cluster-mesh, puis le front de session »). **`D28` is kept:** `engram`'s live registry stays the reference (`h2a`'s divergent option keeping `.track/events.jsonl` as authoritative `Track`-written journal was presented and rejected, `message:25`, `question:6,11-16`). | Citing the template SHA-256 `digest` (`templateDigestSha256`) in `.track/` serialization (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`); a non-conforming `.track/` projection being « never repaired by `engram` » (`proposed, not decided by the owner` — source seat: `h2a`). |
| 2 Seventh MCP tool and durationless prompt loop | **B** *(decided 14/11; amended 15/11 by `D1 A · D2 A · D3 A`; follow-up dossier pending)* | **Decided on 14/11 (`message:28-35`, `question:6,12`); amended on `2026-11-15` by `D1 A · D2 A · D3 A` (follow-up dossier pending — see § below):** On `14/11`, the owner approved option B: build the 7th MCP memory context tool now, disabled until `engram` + `sentropic` co-signature and qualification, then switch each `h2a` host in turn with a fixed end date so hosts stop sending conversation history and send a contextual graph query with the signed mandate; the tool fixes only the envelope (template reference and version), never the list of `Track` types. On `2026-11-15` (`r5` = `DOSSIER-CONTENU-r5.fr.md`), unchanged per the dossier he answered (`r5:160-161`): disabled-by-default build, `engram` + `sentropic` co-signature, qualification, and envelope-only template-version references; the owner amended the tool content (`D1 A`: journal + diff — note, return the diff, search history; data in nodes and edges), third-party CLI posture (`D2 A`: parallel journal + injected diff while the third-party tool keeps its thread, retiring fixed-end-date third-party transcript cutoff (`r5:77`)), and rollout order (`D3 A`: journal first in three stages, so that « built now, disabled » applies to the journal (`r5:103`)), with a follow-up dossier pending. *(Seat note: Carbon recommended qualifying the six tools first and opening the seventh afterwards, and warned that closed third-party CLIs keep their own transcript (`q6-carbon.fr.md:121-134`). h2a judged Point 2 compatible as written and asked to keep the gates: no rollover stop before MCP-L5, with a fallback until then (`h2a-position.md:15`).)* | Tool identifier `engram_memory_context` (`proposed, not decided by the owner` — source seats: conductor, `Fable`, `Carbon`); citing template `digest` (`templateDigestSha256`) in the tool envelope (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`). |
| 3 Dormant dreaming | **C** | A dormant agent in `engram` surfaces forgotten facts; LLM-drafted lessons stay in shadow mode until a measured threshold (`D26`); **nightly dreaming runs locally** and **weekly and monthly dreaming (cross-repository audit, after synchronization) run remotely**; every proposal touching the `Track` domain passes `Track` control, and the dormant agent never writes into `Track` itself (`message:36-43`, `question:6,12`). *(Seat note: `Carbon` recommended remote server execution for `nightly` in `q6-carbon.fr.md:169,182-195` and `h2a-position.md:16` took no placement stance, whereas `message:42` and `question:6` explicitly presented local `nightly` + remote `weekly`/`monthly` to the owner.)* | Local execution placement of `mid-day` and `context-saturation` event triggers (`proposed, not decided by the owner` — source seats: `Fable` local; `Carbon` reactive near-session with local offline fallback); routing dreamed proposals that touch a `Track` template as requests to `Track` alone (`proposed, not decided by the owner` — source seat: `Fable`). |
| 4 Role ontology and harness overlays | **B** | Two sibling lineages under `engram`'s metamodel: `h2a` roles have `h2a` as sole author; `Track` templates have `Track` as sole author; `engram` may propose role changes, never write them (`message:44-52`, `question:6,12`; `D16`, `D31`, `D34` unchanged per `message:3`). | Cross-lineage references via `composition with version pinning` (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`); `archi@1`'s eleven kinds and fifteen relations staying unchanged alongside the two sibling lineages (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`); `.h2a/` Git overlay directory layout — single `.h2a/` path vs `.h2a/repo/` + `.h2a/workspaces/<id>/` split vs `.h2a/overlays/{repo,workspaces,worktrees}` (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`, `h2a`); `.h2a/` overlays never modifying a `Track` template or bypassing `Track` control (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`). |
| 5 Joint control | **B** | For the `Track` domain, the `Track` application writes its rules, executes them, and its verdict is authoritative; `engram` checks template grammar and holds the confidentiality deny-list (`D7`). Without a verdict, a write stays `proposed`, and nothing is lost because the raw record is already in `engram` (`message:54-60`, `question:6,12`; `D32` dual origin unchanged per `message:3`). | `engram` recording `Track`'s verdict as a distinct `control_verdict` record and never replacing it (`proposed, not decided by the owner` — source seat: `Fable`). |
| 6 Integral graph sync over cluster-mesh | **A** | One bidirectional synchronization mechanism, enabled workspace by workspace; every typed object cites its template version, `cluster-mesh` transports objects without knowing `Track` types, and (per `h2a`, `message:64`) synchronization never overwrites a `Track`-controlled record (`message:61-69`, `question:6,12`). *(Seat note: `h2a-position.md:19` coupled that non-overwrite clause with `.track/events.jsonl` journal sync, whose `D28` reopening was rejected under Point 1.)* | Registered `template versions travel with the graph` (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`); citing template `digest` (`templateDigestSha256`) on synced objects (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`); `concurrent template versions published offline are refused on sync and Track decides` (`proposed, not decided by the owner` — source seat: `Fable`). |

## Owner words and dossier decisions of 2026-11-15

### Owner words of 2026-11-15
Sources and verification status of the `2026-11-15` owner words below (`r5` = gitignored `.graphify/scratch/design/memory-finalization/dossier-7e-outil/DOSSIER-CONTENU-r5.fr.md`, `sha256:6d2a330904f917271ea5d5dbadc16b3c42c7b163bb40b8cd98177949ee3d68d5`, per `.gitignore:60`): the initial direction and later direction of `2026-11-15` are recorded in-repository at [`spec/memory/evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md`](evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md)`:1-4` (`sha256:9994918754371fbcf6634d676d9a017544593f44ca84fff16a48f481b7df4302`; status: `unverified — conductor relay`, in-repository evidence file, verbatim chat messages in the `engram` session relayed by the conductor); the comment on dossier `r5` is recorded in-repository at [`spec/memory/evidence/2026-11-15/EVIDENCE-owner-comment-r5.md`](evidence/2026-11-15/EVIDENCE-owner-comment-r5.md)`:1-16` (`sha256:a9f9863dc36ad1120a4a7b058f0338fec9ae29c7e02715f5b4b3c933a7ef43fa`; status: `unverified — conductor relay`, in-repository evidence file, read verbatim by the conductor through the artifact comment API); the remarks on the previous dossiers (`r5:124`) and working rules (`r5:126`) have status `unverified — conductor relay, no primary file` (`DOSSIER-CONTENU-r5.fr.md:124,126,128`, `sha256:6d2a330904f917271ea5d5dbadc16b3c42c7b163bb40b8cd98177949ee3d68d5`).
- **Remarks on the previous dossiers and on the memory tool (`r5:124`, `DOSSIER-CONTENU-r5.fr.md:124`; status: `unverified — conductor relay, no primary file`):**
  - « Non mais ton dossier est delirant. On sait meme pas quels sont les foncrion que tu proposes c est delirant dans cet outil. »
  - « Le dossier doit etre orienté finalite donc c le dossier qui doit presenter . L explication ne permet pas de comprendre le niveau de delire qhi peut aboutir a une telle profondeur. »
  - « Et certainement pas de 7eme outil imbitable c est qu il et necessairement stupide et mal pensé. Une dystopie technique sans finalité »
  - « Donc tu presentes un dossier qui a du sens »
  - « Si je comprends pas c est une merde »
- **New direction ([`spec/memory/evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md`](evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md)`:3`, `sha256:9994918754371fbcf6634d676d9a017544593f44ca84fff16a48f481b7df4302`; status: `unverified — conductor relay`, in-repository evidence file, verbatim; also at `r5:125`):**
  - « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
- **Comment on the dossier he answered, anchored on option `D2 A` ([`spec/memory/evidence/2026-11-15/EVIDENCE-owner-comment-r5.md`](evidence/2026-11-15/EVIDENCE-owner-comment-r5.md)`:3-16`, `sha256:a9f9863dc36ad1120a4a7b058f0338fec9ae29c7e02715f5b4b3c933a7ef43fa`, thread `c963179f-e1bf-4768-ab6b-84baa1f56ebd`, `2026-11-15T16:09Z`; status: `unverified — conductor relay`, in-repository evidence file, read verbatim by the conductor through the artifact comment API; also relayed at `.graphify/scratch/design/memory-finalization/dossier-7e-outil/BRIEF-dossier-r6.md:19-31`, `sha256:1a779724402dc136d89ffa37d9c01b79ab0070d595766cb49617733082aa87ca`):**

  « Dans ce decision dossier tu a squizzé mes outils de commentaire. Donc je dois utiliser claude en annotation. Ce doasier est non condorme. J espere que je pourrai copier mes decision en kit a la fin sinon je perdea mon temps

  Donc : ok poue cet option mais j ai demandé un hook pour prendre la main sur le compactage.

  On pourrait quand meme a terme faire un hook pour remplacer le contexte en option j aimerais ca meme si c pas l option principale initialement.

  Les deux reposeraient sur une forme de resumé graph des faits marquants soit parce qu on demande a chaque etape au llm primcipal de les fournir. Soit parce qu on le fait faire par un llm tiers en permanence (genre modele ember low ou luna 6 low ou haiku 5.5 low ou gemini 3.8 flash low ou un autre low dans mistral).

  Ton mecanisme de presentation me presente pas ce qu engram extrait en plus des faits donc c difficile de se faire une tete. Mais faut deja prevoir de base l annotation tierce. Celle ci sera aussi bien pour le mode dreaming que direct. Avec bascule auto llm mesh de model d annotation.

  Reprend le doasier complet avec l ensemble de ces remarques

  Reprends bien toutes les validations que j ai deja faites en cliquant la stp »
- **Later direction, same day ([`spec/memory/evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md`](evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md)`:4`, `sha256:9994918754371fbcf6634d676d9a017544593f44ca84fff16a48f481b7df4302`; status: `unverified — conductor relay`, in-repository evidence file, verbatim; also relayed at `.graphify/scratch/design/memory-finalization/dossier-7e-outil/BRIEF-dossier-r7.md:11`, `sha256:31d0f53c5247ac3e772bf277522d23d6aa449c7988c5c1b6b9e320b3f7002364`):**
  - « https://arxiv.org/pdf/2611.05306 inspire toi de ca j aimerais vraiment qu engram devienne le relai de ce type de strategie pour remplacé mecaniquemenr + appui par llm shadow la taille du contexte) dans toutes les cli en ooption + la notre uqi reposera exclusivement sur engeam pour le contexte. Analyse fable5.2 + carbon »
- **Working rules on who writes and who reviews (`r5:126`, `DOSSIER-CONTENU-r5.fr.md:126`; status: `unverified — conductor relay, no primary file`):** Recorded verbatim where specification authoring and review process rules for this branch are kept, in [`spec/memory/Q6-APPLICATION-LOG.md`](Q6-APPLICATION-LOG.md) `§19.3`.

### Owner decisions of 2026-11-15 on dossier « journal de session en graphe et outil mémoire »
Decided by the owner on `2026-11-15` on decision dossier « journal de session en graphe et outil mémoire » (`r5` = `DOSSIER-CONTENU-r5.fr.md`, `sha256:6d2a330904f917271ea5d5dbadc16b3c42c7b163bb40b8cd98177949ee3d68d5`, artifact `XzQWUCFtmtBmNFPAufGivR`). Exported answer kit, verbatim ([`spec/memory/evidence/2026-11-15/EVIDENCE-owner-answer-kit-r5.yaml`](evidence/2026-11-15/EVIDENCE-owner-answer-kit-r5.yaml)`:2-18`, `sha256:df7cd739e96c7bf90ba11a554b02988dcacbb70efc4118204d9c5e13316e1ba3`; status: `unverified — conductor relay`, in-repository evidence file, pasted by the owner in the `engram` session and relayed verbatim by the conductor):
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
- **`D1 A` (`r5:43`):** the three functions **note**, **return the diff**, **search history** (`r5:21-25`); data in nodes and edges. Shown with the option: « Ta demande du 15/11 ; la question des niveaux disparaît. Inconvénient : spec du 7e outil à réécrire et à faire relire. »
- **`D2 A` (`r5:68`):** third-party tools keep their thread; `engram` notes each step and injects only what is new. Limit shown with the option: « Limite : le fil de l'outil grossit encore ; « pas de vieux contexte » n'est tenu que dans notre CLI. » Gap validated by his choice (`r5:77`): « A retire de la décision du 14/11 la bascule des outils tiers avec date butoir. » His remark on this option (comment above): « Donc : ok poue cet option mais j ai demandé un hook pour prendre la main sur le compactage. »
- **`D3 A` (`r5:94`):** the journal first, in three stages. Gap validated by his choice (`r5:103`): « avec A, « construit maintenant, désactivé » s'applique au journal. Le reste de la décision du 14/11 ne change pas (annexe 3). » Input asked and not given in the kit (`r5:104`): which program is « notre outil cli a nous » (`source-gap`).
- **Kept, as listed by the dossier (`r5:149-161`):** `D5`, `D6`, `D17`, `D18`, `D19`, `D20`, `D23`; the 14/11 `T-M-C` rule (the tool knows no list of `Track` types; each item cites its template version); and from 14/11 Point 2B: disabled by default, `engram` + `sentropic` co-signature, qualification. The dossier reopens no other choice of `D1`–`D34`.

### Pending follow-up decision dossier
With his comment above, the owner asked for the dossier to be redone in full with all his remarks, keeping the validations he had given. In these documents, « follow-up dossier » means that revised dossier. It is pending. His words above stand as stated. Until he answers, these documents specify no design for: « un hook pour prendre la main sur le compactage »; « un hook pour remplacer le contexte en option »; « une forme de resumé graph des faits marquants » and who produces it; « l annotation tierce » and its « bascule auto llm mesh de model d annotation »; the strategy of his later direction, « dans toutes les cli en ooption + la notre uqi reposera exclusivement sur engeam pour le contexte »; and which program is « notre outil cli a nous ».

## Inputs of the round
- `spec/memory/evidence/2026-11-14/` (in-repository evidence files; SHA-256 digests and statuses recorded in lines `7–8` above): [`EVIDENCE-q6-message-shown-to-owner.md`](evidence/2026-11-14/EVIDENCE-q6-message-shown-to-owner.md) (`sha256:3d35c615c7da23e7838e47d86d560dba876a1c7a9f42e0fde0d55cda3d431444`; conductor message shown to the owner) and [`EVIDENCE-q6-owner-question-and-answer.json`](evidence/2026-11-14/EVIDENCE-q6-owner-question-and-answer.json) (`sha256:7d9e423c61b5ee85de91769dbfb8bff0d2e2db49b7ce742b65064186f1c3f5ea`; structured question-tool capture and owner answer on `2026-11-14`).
- `spec/memory/evidence/2026-11-15/` (in-repository evidence files; status `unverified — conductor relay`, verbatim, recorded in § « Owner words and dossier decisions of 2026-11-15 » above): [`EVIDENCE-owner-direction-15-11.md`](evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md) (`sha256:9994918754371fbcf6634d676d9a017544593f44ca84fff16a48f481b7df4302`), [`EVIDENCE-owner-comment-r5.md`](evidence/2026-11-15/EVIDENCE-owner-comment-r5.md) (`sha256:a9f9863dc36ad1120a4a7b058f0338fec9ae29c7e02715f5b4b3c933a7ef43fa`), and [`EVIDENCE-owner-answer-kit-r5.yaml`](evidence/2026-11-15/EVIDENCE-owner-answer-kit-r5.yaml) (`sha256:df7cd739e96c7bf90ba11a554b02988dcacbb70efc4118204d9c5e13316e1ba3`).
- `.graphify/scratch/design/memory-finalization/q6-round/` (gitignored per `.gitignore:60`; seat drafts and round inputs, not owner evidence): `BRIEF.md` (two normalized fragments only), `q6-fable.fr.md` (Fable 5.2 draft), `q6-carbon.fr.md` (Carbon draft), `h2a-position.md` (`h2a` position), and `Q6-CONSOLIDE.fr.md` (`18`-line internal note listing bare option letters only; it overstated seat convergence across Points 2, 3, 4, and 6 and is superseded by `spec/memory/evidence/2026-11-14/EVIDENCE-q6-*` above).

## 2026-11-15 decisions

Decided by the owner on `2026-11-15` (local; `capturedAt: "2026-11-16T01:58:53.390Z"` in `focus decision kit`) on the revised follow-up decision dossier `engram-contexte-court` (`revision: "r7"`, artifact `https://claude.ai/artifact/XzQWUCFtmtBmNFPAufGivR`, version 3), resolving the « Pending follow-up decision dossier » recorded in lines `86–87` above and governing the rewrite of `Spec 2` ([`spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`](../SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md)).

### Evidence files (in-repository)
- Decision dossier `r7`: [`spec/memory/dossiers/2026-11-15-contexte-court/DOSSIER-r7.fr.md`](dossiers/2026-11-15-contexte-court/DOSSIER-r7.fr.md)`:1-643` (`sha256:38b4179345608d5a3fdea5c0e742e013ce1b5a53ae602d1b29cc46ed52d06f4a`; in-repository dossier file, committed as requested by the owner).
- Owner answers and comments (`r7`): [`spec/memory/dossiers/2026-11-15-contexte-court/ANSWERS-r7.owner.yaml`](dossiers/2026-11-15-contexte-court/ANSWERS-r7.owner.yaml)`:1-113` (`sha256:e6874f033cb25319d9b731d9b448e9fe8728e70896b9bfbc4c0cfb51ae7767b5`; in-repository owner answer kit exported from `focus decision kit` and pasted verbatim by the owner in the `engram` session on `2026-11-15` local).
- Owner message accompanying the pasted answer kit (`ANSWERS-r7.owner.yaml:3`, verbatim): « ce dossier était top faut vraiment le committer avec les réponse. »

### Exported answer kit (`ANSWERS-r7.owner.yaml:4-113`, verbatim)
```yaml
schemaVersion: 2
dossier: "engram-contexte-court"
revision: "r7"
title: "Décision mémoire engram — engram relais d'un contexte court, dans toutes les CLI en option et dans la nôtre"
status: "prepared"
recorded: false
capturedAt: "2026-11-16T01:58:53.390Z"
capturedFrom: "focus decision kit"
responseLine: "D1 A · D2 A · D3 A · D4 C · D5 A · D6 B · D7 A · D8 A · D9 C"
validated:
  on: "15/11"
  responseLine: "D1 A · D2 A · D3 A"
  decisions:
    - decision: "D1"
      option: "A"
      label: "D1 A — Journal + diff : les trois fonctions, données en nœuds et en liens"
    - decision: "D2"
      option: "A"
      label: "D2 A — Journal en parallèle + diff injecté : l'outil garde son fil ; engram note chaque étape et n'injecte que le nouveau"
    - decision: "D3"
      option: "A"
      label: "D3 A — Le journal d'abord, en trois temps : (1) noter dans les outils tiers ; (2) rendre le diff et chercher dans l'historique ; (3) notre CLI, où engram est le journal principal"
choices:
  - decision: "D4"
    question: "Dans les outils tiers, jusqu'où va l'option ?"
    option: "C"
    label: "D4 C — Contexte court partout, avec relance : B, plus une session neuve ouverte par h2a sur la vue d'engram là où les crochets plafonnent"
    recommended: "C"
    followsRecommendation: true
  - decision: "D5"
    question: "Notre CLI : quel programme ?"
    option: "A"
    label: "D5 A — Notre propre boucle : un programme à nous, sur les briques existantes, lancé par h2a"
    recommended: "A"
    followsRecommendation: true
  - decision: "D6"
    question: "À quel rythme le contexte est-il reconstruit ?"
    option: "B"
    label: "D6 B — Paliers courts : les derniers résultats s'ajoutent derrière un état stable, refait tous les 18 000 jetons environ"
    recommended: "B"
    followsRecommendation: true
  - decision: "D7"
    question: "L'état : qui l'écrit ?"
    option: "A"
    label: "D7 A — Trois auteurs : le code copie ; le shadow écrit le passé ; le modèle principal écrit son plan"
    recommended: "A"
    followsRecommendation: true
  - decision: "D8"
    question: "Quels modèles servent de shadow, et comment se fait la bascule ?"
    option: "A"
    label: "D8 A — Ta liste ordonnée, avec qualification : bascule au suivant en cas de panne ; aucun modèle non éprouvé dans le contexte ; sans modèle si tous tombent"
    recommended: "A"
    followsRecommendation: true
  - decision: "D9"
    question: "Que faut-il prouver avant qu'engram remplace un contexte ?"
    option: "C"
    label: "D9 C — Rejeu pour l'option, preuve complète pour notre CLI"
    recommended: "C"
    followsRecommendation: true
ownerComments:
  - anchor: "schema-1"
    kind: "diagram"
    label: "Schéma n° 1 — Avant / après"
    when: "2026-11-16T01:36:29.937Z"
    text: "L'état devrait aussi être une requête formelle au graphe\n- contexte de sélection (droits, extraits spécifiques pertinents) + ontolgies applicables (track, archi, specs, harnais, ontologies spécifiques...)\nLe shadow devrait :\n- amender cette requête\n- update relatif aux ontologies pertinentes (faits, décisions / track, harnais, architecture, statut - étapes track, scope track des demaindes/epic/feature/user stories/plans). \n\nPoint d'attention: l'étape doit bien stocker le prompt, les étapes de réflexion, les appels outils et leur contexte complex. On pourra ainsi aussi faire un rtk par engram (résumé des appels outils, quitte a proxifier les appels outils).\n\nLa notion de scope track doit aussi être rattachée a l'objective loop. \n\nLe schema devrait donc être complété : prompts/outils + ontologies et requête graphe."
  - anchor: "schema-4"
    kind: "diagram"
    label: "Schéma n° 4 — L'état et ses auteurs"
    when: "2026-11-16T01:28:10.155Z"
    text: "Les notions sont un peu décorrélées des ontologies principales track / engram, ca me semblerait bien d'avoir un avis"
  - anchor: "D4C"
    kind: "option"
    label: "D4 C — Contexte court partout, avec relance"
    when: "2026-11-16T01:32:25.790Z"
    text: "Si on arrive a garder la session mais juste \"clear\" le contexte et le nourrir, ca me va, mais a voir si l'expérience utilisateur peut être maintenue (ne l'utilisateur lui doit pouvoir remonter. Sinon fallback possible B ou même A."
  - anchor: "schema-6"
    kind: "diagram"
    label: "Schéma n° 6 — Le curseur, outil par outil"
    when: "2026-11-16T01:34:54.054Z"
    text: "Vraiment, ce ne doit pas être une session \"neuve\" juste avec un contexte \"vidé\" (et complété par engram). si pas possible, l'UX sera affreuse, et le suivi des session meme en sécurité (trop de split pour suivre des pb)."
  - anchor: "D5A"
    kind: "option"
    label: "D5 A — Notre propre boucle"
    when: "2026-11-16T01:36:03.206Z"
    text: "stp ne doit être qu'un pretexte, pas un vrai binaire. stp = h2a run stp par exemple\nAttention rejoint le dossier de boucle agentique - on souhaite se rapprocher d'une boucle davantage a la claude (stop-reason) qui serait probablemnt branchée sur l'objective loop."
  - anchor: "schema-7"
    kind: "diagram"
    label: "Schéma n° 7 — Notre CLI : la boucle d'une étape et ses briques"
    when: "2026-11-16T01:38:41.517Z"
    text: "stp attention je pensais que c,était abandonné\nchat-core attention ca migre sur le design system, mais y aura certainemetn une nouvelle lib pour la boucle agentique"
  - anchor: "D6B"
    kind: "option"
    label: "D6 B — Paliers courts"
    when: "2026-11-16T01:39:05.101Z"
    text: "réglable !"
  - anchor: "D7A"
    kind: "option"
    label: "D7 A — Trois auteurs"
    when: "2026-11-16T01:55:02.680Z"
    text: "Réglable:\nshadow désactivable le cas échéant avec une heuristique le cas échéant ou un model finetuned/Gliner 2.5, ou  avec un  mécanisme d'apprentissage / RL"
  - anchor: "D8A"
    kind: "option"
    label: "D8 A — Ta liste ordonnée, avec qualification"
    when: "2026-11-16T01:55:58.601Z"
    text: "B en fall back quand l'utilisateur h2a (ou sentropic) n'a qu'un compte disponible."
  - anchor: "schema-10"
    kind: "diagram"
    label: "Schéma n° 10 — Direct et dreaming, un seul service"
    when: "2026-11-16T01:58:53.390Z"
    text: "oui ok ! la différence pour le dreaming, c'est qu'on utilisera potentiellement un modele plus frontière, peut être toujours non raisonnant"
```

### Binding decisions and owner-comment amendments (`DOSSIER-r7.fr.md` & `ANSWERS-r7.owner.yaml`)
- **Decisions (`ANSWERS-r7.owner.yaml:12-62`, `DOSSIER-r7.fr.md:232-559`):** « D1 A · D2 A · D3 A · D4 C · D5 A · D6 B · D7 A · D8 A · D9 C » (`D1 A · D2 A · D3 A` carried forward from `r5` at `DOSSIER-r7.fr.md:232-243`; `D4 C` `:266-312`; `D5 A` `:348-385`; `D6 B` `:402-436`; `D7 A` `:453-487`; `D8 A` `:496-527`; `D9 C` `:534-559`). The nested `0..8` container is retired (`D1 A`: data are graph nodes and links).
- **Binding amendments from the ten `ownerComments` (`ANSWERS-r7.owner.yaml:63-113`):** Every comment in `ownerComments` above is binding and **amends** the chosen option where they overlap:
  1. **`schema-1` (`ANSWERS-r7.owner.yaml:64-68`, on `DOSSIER-r7.fr.md:45-64`):**
     > « L'état devrait aussi être une requête formelle au graphe
     > - contexte de sélection (droits, extraits spécifiques pertinents) + ontolgies applicables (track, archi, specs, harnais, ontologies spécifiques...)
     > Le shadow devrait :
     > - amender cette requête
     > - update relatif aux ontologies pertinentes (faits, décisions / track, harnais, architecture, statut - étapes track, scope track des demaindes/epic/feature/user stories/plans). 
     >
     > Point d'attention: l'étape doit bien stocker le prompt, les étapes de réflexion, les appels outils et leur contexte complex. On pourra ainsi aussi faire un rtk par engram (résumé des appels outils, quitte a proxifier les appels outils).
     >
     > La notion de scope track doit aussi être rattachée a l'objective loop. 
     >
     > Le schema devrait donc être complété : prompts/outils + ontologies et requête graphe. »
  2. **`schema-4` (`ANSWERS-r7.owner.yaml:69-73`, on `DOSSIER-r7.fr.md:107-134` — opinion requested, not decided by the owner):**
     > « Les notions sont un peu décorrélées des ontologies principales track / engram, ca me semblerait bien d'avoir un avis »
     *(Addressed as an explicit position with options in [`spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`](../SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md) `§11.1` (`:818-856`), without pre-deciding it.)*
  3. **`D4C` (`ANSWERS-r7.owner.yaml:74-78`, amending `D4 C` at `DOSSIER-r7.fr.md:278-281`) and `schema-6` (`ANSWERS-r7.owner.yaml:79-83`, on `DOSSIER-r7.fr.md:166-195`):**
     - `D4C`:
       > « Si on arrive a garder la session mais juste "clear" le contexte et le nourrir, ca me va, mais a voir si l'expérience utilisateur peut être maintenue (ne l'utilisateur lui doit pouvoir remonter. Sinon fallback possible B ou même A. »
     - `schema-6`:
       > « Vraiment, ce ne doit pas être une session "neuve" juste avec un contexte "vidé" (et complété par engram). si pas possible, l'UX sera affreuse, et le suivi des session meme en sécurité (trop de split pour suivre des pb). »
     *(Amends `D4 C`: the `r7` clause « une session neuve ouverte par h2a sur la vue d'engram là où les crochets plafonnent » is **replaced** by keeping the **same** session with in-session context clear-and-refeed while preserving user scrollback; wherever that is impossible or `unverified`, the host falls back to `B` or `A` — **never** a « new » session.)*
  4. **`D5A` (`ANSWERS-r7.owner.yaml:84-88`, amending `D5 A` at `DOSSIER-r7.fr.md:354-361`) and `schema-7` (`ANSWERS-r7.owner.yaml:89-93`, on `DOSSIER-r7.fr.md:197-225`):**
     - `D5A`:
       > « stp ne doit être qu'un pretexte, pas un vrai binaire. stp = h2a run stp par exemple
       > Attention rejoint le dossier de boucle agentique - on souhaite se rapprocher d'une boucle davantage a la claude (stop-reason) qui serait probablemnt branchée sur l'objective loop. »
     - `schema-7`:
       > « stp attention je pensais que c,était abandonné
       > chat-core attention ca migre sur le design system, mais y aura certainemetn une nouvelle lib pour la boucle agentique »
     *(Amends `D5 A`: `stp` is only a pretext such as `stp = h2a run stp`, not a standalone binary; do **not** build on `@sentropic/chat-core` as is because it is migrating to the design system; build on the expected dedicated agentic-loop library using a Claude-like `stop-reason` loop wired to `h2a`'s objective loop and `Track` scope.)*
  5. **`D6B` (`ANSWERS-r7.owner.yaml:94-98`, amending `D6 B` at `DOSSIER-r7.fr.md:413-416`):**
     > « réglable ! »
     *(The reconstruction rhythm / palier threshold is configurable.)*
  6. **`D7A` (`ANSWERS-r7.owner.yaml:99-103`, amending `D7 A` at `DOSSIER-r7.fr.md:459-462`):**
     > « Réglable:
     > shadow désactivable le cas échéant avec une heuristique le cas échéant ou un model finetuned/Gliner 2.5, ou  avec un  mécanisme d'apprentissage / RL »
     *(Author participation is configurable: the shadow can be disabled, replaced by a heuristic, by a fine-tuned model such as `GLiNER 2.5`, or by a learning / RL mechanism.)*
  7. **`D8A` (`ANSWERS-r7.owner.yaml:104-108`, amending `D8 A` at `DOSSIER-r7.fr.md:502-505`):**
     > « B en fall back quand l'utilisateur h2a (ou sentropic) n'a qu'un compte disponible. »
     *(`D8 B` — same provider as the active session tool first — is the automatic fallback when the `h2a` or `sentropic` user has only one account available.)*
  8. **`schema-10` (`ANSWERS-r7.owner.yaml:109-113`, on `DOSSIER-r7.fr.md:575-597`):**
     > « oui ok ! la différence pour le dreaming, c'est qu'on utilisera potentiellement un modele plus frontière, peut être toujours non raisonnant »
     *(Confirms a single annotation service shared by `direct` and `dreaming`, with `dreaming` allowed to select a more frontier model, potentially still non-reasoning.)*
