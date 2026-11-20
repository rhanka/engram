# SJ-R0 — sources ledger for `SPEC_ENGRAM_SESSION_JOURNAL_AND_CONTEXT_QUERY` `v0.1.0`

- **Date:** `2026-11-19`. **Author:** Claude Fable 5.2 (max), spec author. **Reviewer:** Gemini Carbon High.
- **Purpose:** list every owner decision the spec applies, with its source `path:line`, and say what could not be verified.
- **Short names:** as in §0 of the spec (`ANS`, `DOS`, `OD`, `R15`, `EV15`, `S0`, `S1`, `S3`, `S4`, `S6A`, `OLD2`, `AUD`, `BRF`, `REV3`, `ALV2`, `H2A`). Paths are relative to this repository unless absolute.
- Text between « » is the owner's, copied byte for byte.

## 1. Owner decisions applied

| # | Decision, in his words or as he exported it | Source `path:line` | Kind of source | Applied in |
|---|---|---|---|---|
| 1 | « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. » | `OD:40`; `spec/memory/evidence/2026-11-15/EVIDENCE-owner-direction-15-11.md:3` | in-repo evidence, conductor relay | §1.1, §3 |
| 2 | « Et certainement pas de 7eme outil imbitable c est qu il et necessairement stupide et mal pensé. Une dystopie technique sans finalité » | `OD:36` | conductor relay, no primary file | header, §2.4, §8.4 |
| 3 | « Non mais ton dossier est delirant. On sait meme pas quels sont les foncrion que tu proposes c est delirant dans cet outil. » · « Si je comprends pas c est une merde » | `OD:34`, `OD:38` | conductor relay, no primary file | §1 (functions first, one screen) |
| 4 | « 7eme outil: specification INTERDITE tant que l'ORIENTATION et le BUT de ce putain d'OUTIL sont pas définis clairement » (18/11) | `/home/antoinefa/src/graphify/.graphify/scratch/design/septieme-outil/BRIEF-dossier-v2.md:10` | relay outside the repository; primary file: `missing source` | §1 comes before anything technical; lifted by rows 5 and 6 |
| 5 | « bon pour de vrai le "7eme outil" est une pure hallucination. si mon outil de requête est embed au premier (recherche qui porterait une query), éventuellememnt ce pourrait être l'outil permettant de modifier la requête de session contextuelle que j'ai deja demandé d'intégré. du coup je voudrais que tu m'assure que les éléments de brainstorm ont bien capté ce sujet de requête de session (qui pourrait être aussi réutilisée pour la reprise post compaction ou le switch inter cli sur le meme rôle d'agent) et qu'on couvre bien aussi les éléemnts de dreaming » (19/11) | `BRF:7` | relay outside the repository; primary file: `missing source` (`AUD:4`) | §1, §2.4, §2.5, §7 |
| 6 | « quelles question j'ai deja TOUT validé » (19/11) | the authoring brief of this spec, `2026-11-19` | conductor relay; `missing source` | §11: goal and orientation are not open |
| 7 | `D1 A` — "Journal + diff : les trois fonctions, données en nœuds et en liens" | `ANS:19`; `DOS:43` | owner answer kit, in-repo | §1.1, §2.6 |
| 8 | `D2 A` — "Journal en parallèle + diff injecté : l'outil garde son fil ; engram note chaque étape et n'injecte que le nouveau"; it retires the fixed end date of 14/11 | `ANS:22`; `DOS:44`, `DOS:47`; `OD:82` | owner answer kit, in-repo | §3.2, §4.2, `S6A-f` |
| 9 | `D3 A` — the journal first, in three stages; "built now, disabled" applies to the journal | `ANS:25`; `OD:83` | owner answer kit, in-repo | stages in §1.1 and §10; `S1-h`; `SessionContextPolicyV1.journalEnabled` |
| 10 | `D4 C`, amended: « Si on arrive a garder la session mais juste "clear" le contexte et le nourrir, ca me va, mais a voir si l'expérience utilisateur peut être maintenue (ne l'utilisateur lui doit pouvoir remonter. Sinon fallback possible B ou même A. » · « Vraiment, ce ne doit pas être une session "neuve" juste avec un contexte "vidé" (et complété par engram). si pas possible, l'UX sera affreuse, et le suivi des session meme en sécurité (trop de split pour suivre des pb). » | `ANS:27-32`, `ANS:78`, `ANS:83`; `DOS:163-165` | owner answer kit, in-repo | §4 |
| 11 | `D5 A`, amended: « stp ne doit être qu'un pretexte, pas un vrai binaire. stp = h2a run stp par exemple » · « chat-core attention ca migre sur le design system, mais y aura certainemetn une nouvelle lib pour la boucle agentique » | `ANS:33-38`, `ANS:88`, `ANS:93` | owner answer kit, in-repo | §5 |
| 12 | `D6 B` — short paliers, about 18,000 tokens; « réglable ! » | `ANS:39-44`, `ANS:98`; `DOS:335` | owner answer kit, in-repo | §2.6, `SessionContextPolicyV1` |
| 13 | `D7 A` — three authors; « shadow désactivable le cas échéant avec une heuristique le cas échéant ou un model finetuned/Gliner 2.5, ou  avec un  mécanisme d'apprentissage / RL » | `ANS:45-50`, `ANS:103`; `DOS:258`, `DOS:252`, `DOS:91` | owner answer kit, in-repo | §6.1, §6.2 |
| 14 | `D8 A` — his ordered list, with qualification; « B en fall back quand l'utilisateur h2a (ou sentropic) n'a qu'un compte disponible. » | `ANS:51-56`, `ANS:108`; `DOS:286`, `DOS:287` | owner answer kit, in-repo | §6.4; `OP-1` |
| 15 | `D9 C` — "Rejeu pour l'option, preuve complète pour notre CLI" | `ANS:57-62`; `DOS:307-318` | owner answer kit, in-repo | §9, lot `SJ-1`, lot `SJ-11` |
| 16 | `schema-1` — the state is also a formal graph query; the shadow amends it; the step stores prompt, reasoning, tool calls; « rtk par engram »; Track scope bound to the objective loop | `ANS:64-68` | owner answer kit, in-repo | §2, §4.2, `S1-b`, `S1-c`, `S1-f` |
| 17 | `schema-4` — « Les notions sont un peu décorrélées des ontologies principales track / engram, ca me semblerait bien d'avoir un avis » | `ANS:69-73` | owner answer kit, in-repo | §2.7 (opinion given) |
| 18 | `schema-10` — « oui ok ! la différence pour le dreaming, c'est qu'on utilisera potentiellement un modele plus frontière, peut être toujours non raisonnant » | `ANS:109-113` | owner answer kit, in-repo | §6.3, `AnnotationRoutePolicyV1.dreaming` |
| 19 | Comment on dossier r5: « Donc : ok poue cet option mais j ai demandé un hook pour prendre la main sur le compactage. » · « Mais faut deja prevoir de base l annotation tierce. Celle ci sera aussi bien pour le mode dreaming que direct. Avec bascule auto llm mesh de model d annotation. » · « (genre modele ember low ou luna 6 low ou haiku 5.5 low ou gemini 3.8 flash low ou un autre low dans mistral) » | `EV15:6`, `EV15:12`, `EV15:10`; `OD:45-51` | in-repo evidence, conductor relay | §3.4, §6.3, §6.4 |
| 20 | `D20` — « Je vois pas comment tu gere adapte sans outil memoire »: a memory tool, not a 7th tool; the frozen contract reopens with a co-signature | `R15:68`; `AUD:54` | settled ledger | §2.4, `S6A-e` |
| 21 | `D23` — « Il ne doit jamais y avkir de relve ou bie chaque prompt devrai etee independant ne dependre que de la memoire et du resultat precedeent reprocessé. » · « Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. » | `R15:71` | settled ledger | §1.2, §2.5, §7 |
| 22 | `D22` — « L empreinte etant unenrequet graphe dans le quel le mandat eat un composant primaire. » | `R15:70` | settled ledger | §2.1, `mandateDigest` |
| 23 | Same-role quarantine: `D4` (admission through the mandate), `D5` (« meme role h2a meme espace. mais ce n'est pas assez étoffé pour avoir une vraie décision »), `D6` (references only to an external model) | `R15:52`, `R15:53`, `R15:54` | settled ledger | §2.4 (why not capture), §2.5, §6.5 |
| 24 | `D15` slices; `D17` degraded mode; `D18` no memory identity; `D19`, `D25` dreaming cadences; `D26` two-tier lessons | `R15:63`, `R15:65`, `R15:66`, `R15:67`, `R15:73`, `R15:74` | settled ledger | §2.6, §3.6, §7 |
| 25 | 14/11 ownership rule: templates to Track, metamodel to engram, control to the Track application; no list of Track types in engram | `OD:13-15` | in-repo decision file | §2.2, `SessionTrackScopeRefV1` |
| 26 | 14/11 decisions kept: disabled by default, engram + sentropic co-signature, qualification (`Point 2B`); dreaming placement (`Point 3C`); `proposed` until Track control (`Point 5B`) | `OD:84`, `OD:24`, `OD:26` | in-repo decision file | `S6A-e`, §7, §2.2 |
| 27 | Points the dossier proposed without a question, and he did not contest: one state object, end of a pinned request, Hermes without Python, failures of engram in our CLI | `DOS:336`, `DOS:337`, `DOS:338`, `DOS:339`; no objection in `ANS:63-113` | dossier he called « top » (`ANS:3`) | `S1-g`, §2.2, §4.4, §5 |
| 28 | Zero Python, his standing rule | `DOS:503` | dossier, in-repo | §4.4 (Hermes), §6.2, §10 guard |
| 29 | Ruling given for this spec: `D6` applies to the main model for content from other sessions; the session's own content stays inline | the authoring brief of this spec; it settles `REV3:102` (finding `X1`, option 1 at `REV3:228`) | conductor ruling | §6.5 |

## 2. Lessons of the three review rounds, applied up front

| Rule (`spec/memory/reviews/S2-R2-DESIGN-NOTE.md:10-18`) | How this spec applies it |
|---|---|
| One normative definition per symbol | Every symbol is in §12 once. Deltas in §8 cite §12 and copy no field. |
| One meaning per symbol | No symbol is reused. The spec defines no receipt type at all. |
| The owner of record comes first | `note` is Spec 1 `recordSessionEvent` on `/memory/v1/session-front/ingest` (`S1:461`, `S1:472`); no second route. The result envelope is untouched (`src/mcp/memory/contracts.ts:437-456`). The loop receipt is `StepReceipt` (`ALV2:396-410`). A decision gate stays h2a's (`H2ALoopDecisionGate`). `lineage` is Spec 0 `LineageId` (`S0:147`). The five slices are Spec 1's (`S1:361`). |
| `D6` and the main model | Row 29 above. |
| Re-read every anchor | §3 below. Anchors that could not be read are in §4. |
| No closed list of Track or h2a types | `aggregateKind`, `role`, `roleRef` and `hostId` are open strings. |

## 3. Anchors re-read by the author, at their lines

- `ANS`: the whole file (`:1-113`).
- `DOS`: the whole file (`:1-644`).
- `OD`: the whole file (`:1-261`).
- `R15`: the whole file (`:1-121`).
- `EV15`: `:1-16`. `EVIDENCE-owner-direction-15-11.md`: `:1-4`.
- `S0`: `:136-180`.
- `S1`: `:1-40`, `:150-543`, `:868-940`, `:1640-1714`.
- `S3`: `:1-30`, `:84-133`, `:344-359`, `:500-571`, `:764-799`.
- `S4`: `:1-38`, `:374-383`.
- `S6A`: `:1-60`, `:404-412`, `:522-549`, `:604-657`, `:730-799`.
- `OLD2`: `:1-434`, `:1590-2009`. Its contract block `:434-1589` was not read: it is superseded and nothing is inherited from it.
- Code: `src/mcp/memory/contracts.ts:130-469`; `src/mcp/memory/schemas.ts:200-337`, `:680-759`, `:3655-3686`; `src/mcp/memory/gates.ts:150-319`; `src/mcp-memory/provider.ts:268-289`, `:448-463`.
- `ALV2`: `:1-12`, `:380-504`, `:826-833`, `:964-968`.
- `H2A`: `packages/h2a/src/runtime/loop/index.ts:1-125`; `packages/h2a/package.json:1-6`.
- Reviews: the three rounds and the design note, in full. `AUD`: in full. `BRF`: in full.

## 4. Not verified, and why

The shell was unavailable in this session: every command failed with `EROFS` on the harness temp directory. No `git`, no text search. Files were read one at a time.

| Item | Status |
|---|---|
| h2a at its `origin/main` pin | Round 1: read at the pin `947f7d325` by `SJR1` (its anchor 21 and its finding `m5`); the two line ranges hold. Round 0: `unverified`. `/home/antoinefa/src/h2a/.git/refs/remotes/origin/main:1` reads `947f7d325e846486787e34a079a76932dc3d6827`. The local tree is on `docs/org-raci-wp7-hinfra` at `@sentropic/h2a@0.91.0`. `git show origin/main:…` could not run. The lines cited for `H2ALoopTrackRef` and `H2ALoopDecisionGate` are those of the local tree. |
| The worktree stash `stash@{0}` (partial round-3 edits) | not read: `git stash show -p` could not run. Nothing in the spec comes from it. |
| Occurrences of `engram_memory_context`, `session_summary` and `CliHostId` outside the lines cited in §8 | `unverified`: no text search. |
| What each CLI's hooks do in operation | `unverified` (`DOS:137`, `DOS:550`): documentation was read by the dossier's authors; no hook was run. |
| Whether a CLI gives a session a new id on a user clear | `unverified` (§4.5 of the spec). |
| Which registered template carries « specs » | `unverified` (§2.2 of the spec). |
| The no-Python guard on each `origin/main` | Round 1: `SJR1` (`m5`) read `scripts/check-no-python.mjs` on h2a `origin/main`; engram `f75543a5` and sentropic `913e3bcbc` do not have it. Round 0: `unverified`. `scripts/check-no-python.mjs` is absent from this worktree and from the local h2a tree. |
| llm-mesh facts (ordered candidates, catalog) | taken from `DOS:276-278`; the code was not re-read. |
| The primary files of the 18/11 and 19/11 owner messages | `missing source`: only relays exist (rows 4, 5, 6). |

## 5. Checks before stopping

- **Banned word.** `rg -n -i` on the two files could not run (no shell, for the author and for a read-only sub-reader alike). The check was done by two full reads: the author's, and an independent read-only pass over both files. Result: 0 occurrences of the banned French word, of its unaccented form, and of its English form. The mechanical `rg` run is still to be done by whoever has a shell.
- **Owner quotes.** Each quote was copied from the line named in §1 and compared word for word, typos included.
- **Size.** The spec is 792 lines, under the 900-line limit. No folded appendix was needed.
- **Scope.** Two files written: the spec and this ledger. No other file edited. No commit. Zero Python.

## 6. R1 dispositions

- **Round 1.** Review `SJR1` (Gemini Carbon High, `2026-11-19`): `CHANGES-REQUESTED`, 2 blockers, 7 majors, 5 minors. The spec goes from `v0.1.0` to `v0.1.1` the same day, by the spec author (Claude Fable 5.2, max).
- Sections 1 to 5 above are the round-0 record. Where they differ from this section, this section holds.
- Short names: as in §0 of the spec `v0.1.1`. It adds `SJR1` (the review), `BRIEF` (the authoring brief), `BLD` (the builder rule), `PLAT` (the installed `@sentropic/mcp-platform` declarations) and `MST` (the local `sentropic/rules/MASTER.md`).

### 6.1 One line per finding

| Finding | Disposition | Where, in `v0.1.1` | Source that decides |
|---|---|---|---|
| `B1` — `null` fields; the `text`/`ref` choice broken by the `D6` omission | applied | §12: `roleRef` and `mandateDigest` are optional and never `null`; `held` is optional and excludes `reset`; a selector matches through `SessionContextSelectorMatchV1`, one of three closed branches, the third being `withheld`; rule "No field is ever `null`"; lot `SJ-5a` t2, t3 | `src/mcp/memory/schemas.ts:933-935`, `:3518-3520`, `:3709-3711` (`null` refused); `:3563-3580`, `:3384-3397` (`oneOf` allowed, exactly one branch) |
| `B2` — a search that writes nothing cannot answer with a raised version | applied, by another path than the one the review proposed | §2.4: the search asks; the journal note of that call commits. The search returns the query as it stands, the amendment to note, and the verdict of the gate evaluated without writing. Lots `SJ-6a`, `SJ-6b`, `SJ-4` t6 | 6.2 below |
| `B2`, sub-fix — bind `session_context` into the page binding | replaced | §2.4: a call with `session_context` is one page; `page_cursor` is refused and no `next_page_cursor` is issued; lot `SJ-5a` t4 | the input is validated (`src/memory-tools/reads.ts:122-123`) before the binding is computed (`:135`); the binding of `:113-116` stays as it is |
| `B2`, sub-fix — a named read facet | applied | §12, "Two seams inside engram"; lot `SJ-5b` t4 | `src/memory-tools/reads.ts:4`, `:105`; `src/mcp-memory/provider.ts:466-481` |
| `M1` (a) — a conditional claim cannot be a `requiredClaims` entry | applied | §2.6, first rule; delta `S6A-c` | `src/mcp/memory/gates.ts:188`; `src/mcp-memory/provider.ts:746-760`, then `:778-782` |
| `M1` (b) — role, worktree, session and reader model have no transport; `mainModelRef` is caller-supplied | applied | §2.6: `SessionContextBindingV1`, `SessionCallerRefV1`. `mainModelRef` left `SessionContextRequestV1`; it is now the h2a launch record noted with `mandate_binding` (delta `S1-l`). Delta `S6A-i`; lots `SJ-7a`, `SJ-7c` | `PLAT:77-123` (the closed projection); `S6A:303-305`, `S6A:383-384`, `S6A:616`, `S6A:745`; `src/mcp-memory/provider.ts:6-9`, `:810-826` |
| `M1` (c) — a session with no role cannot reach `session_context` | applied | §2.6, second rule: a binding is built in two cases; the second is a memory identity with a `null` mandate | `S1:282-283`, `S6A:397`, `S4:440` |
| `M1` (d) — the h2a admission of `memory-wire/v2` was dropped | applied | delta `S6A-f`; lot `SJ-7d` | `S6A:629`, `S6A:640` |
| `M1`, where the check runs | adjusted | the review placed it in `MemoryReadHostV1.authorize`. That port receives no tool input (`src/memory-tools/reads.ts:70`). So the host builds the binding or does not, and the handler refuses a `session_context` call that has no binding | `src/memory-tools/reads.ts:65-74` |
| `M2` — the `D18` non-memory slices lost their transport | applied | §3.6; `SessionReadOnlyDeliveryV1`; deltas `S1-k`, `S4-h`, `S6A-g`; lots `SJ-2b`, `SJ-3a` t5 | `R15:66`, `DOS:494`, `S1:481`, `S6A:223`, `S6A:396`, `S4:968` |
| `M3` — periodic full view | applied | §3.4; `periodicFullEveryTurns` removed from §12; lot `SJ-8` t3 | `OD:40`, `ANS:22`, `AUD:47` |
| `M3`, two consequences beyond the finding | applied | the `request` reason of `0.1.0` is removed too, and a watermark engram cannot read no longer yields a full view: the round-1 instruction says a full view goes out only on compaction, clear or restart | the objection recorded at `DOS:594` is answered by the rule of §3.2 |
| `M4` — fields with no lot and no RED test | applied | every field of §12 ends with its lot and its test; lots `SJ-14`, `SJ-15`, `SJ-16e`, `SJ-16h`; the members added to Spec 1 shapes are declared once in §12 (`SpeechTurnJournalFieldsV1`, `ToolResultJournalFieldsV1`, `MandateBindingJournalFieldsV1`, `SessionJournalEnvelopeFieldsV1`, `SessionJournalReceiptFieldsV1`) | `ANS:68`; h2a `packages/h2a/src/runtime/loop/index.ts:49-64`, `:87-103`; `S0:149-154`; `S4:35`, `S4:913`, `S4:951` |
| `M5` — no builder | applied | §10: the rule, and one builder per lot. Muse takes the lots the review named (`SJ-6a`, `SJ-10`, `SJ-11`, the two guard lots) and two small new ones (`SJ-14`, `SJ-16e`). `Neon` takes the rest, among them `SJ-6b` (the commit path), `SJ-15` (rights from the binding) and `SJ-16h` (it changes a host hook) | `BLD:12`, `BLD:32` |
| `M6` (1) — `SJ-7` over several packages; no `scope-check`; no exception for the `Makefile` | applied | `SJ-7a` (`mcp-platform`), `SJ-7b` and `SJ-7c` (`cluster-mesh`), `SJ-7d` (h2a); gate `S`; exception `BRSJ-EX1`; lot `SJ-0s` | `MST:30-34`, `MST:51`; `S1:1655`, `S1:1672-1676`, `S1:1680`; `S6A:730` |
| `M6` (2) — `SJ-1` too large, and claiming three functions | applied | `SJ-1a`, `SJ-1b`, `SJ-1c`. The first lot proves « noter » and « rendre le diff »; « chercher dans l'historique » is proven on the same recording by `SJ-5b` t1 | `BRIEF:67`; `ANS:25` for his three terms |
| `M6` (3) — h2a gates without build and inventory | applied | gate `H` | `S1:1656`, `S3:68`, `S3:1061` |
| `M6` (4) — the loop engine placed in h2a | applied | §5, item 4; `SJ-17` (h2a: `h2a run stp` and the bridge), `SJ-18` (engram: the step-context adapter) | `DOS:191-193`, `ANS:33-36`, `ANS:88`, `ANS:93` |
| `M7` — cross-spec deltas missing | applied | §8. Extended: `S1-g`, `S1-j`, `S3-a`, `S3-c`, `S3-f`, `S3-g`, `S3-i`, `S4-a`, `S4-b`, `S4-e`, `S4-f`, `S6A-a`, `S6A-b`, `S6A-c`, `S6A-e`, `S6A-f`, `S6A-g`, `S6A-i`. Added: `S1-k`, `S1-l`, `S1-m`, `S3-j`, `S3-k`, `S3-l`, `S3-m`, `S4-g`, `S4-h`, `S4-i` | 6.4 below |
| `m1` — `D7` and `D8` after the authorization act | applied | §6.5; lot `SJ-3a` t3 | `R15:55`, `R15:56`, `DOS:491`, `S1:884-894` |
| `m2` — the one-account fallback | applied | §6.4; `singleAccountByProvider`; lot `SJ-9` t2; `OP-1` | `ANS:108`, `DOS:287` |
| `m3` — a stale `basedOnVersion` | applied: a late amendment is run against the current version | §2.3; lot `SJ-6a` t5 | a design choice of this spec; no owner source |
| `m4` — `When` and `In → Out` on dreaming; `When` on post-compaction; the tool-proxy path | applied | §1.2; §4.2: the proxy path has no lot for third-party tools, and in our loop the loop is the proxy | `S3:124-128`, `ANS:68` |
| `m5` — `unverified` tags on h2a `origin/main` | applied | §5 item 5 and §10 cite the pin as read by `SJR1`; two rows of §4 above are updated | `SJR1:91-94`, `SJR1:135` |

### 6.2 `B2`: the path chosen, and why the review's fix was not taken as written

The review asked that cluster-mesh commit `keep` and `drop` through the journal port before it calls `readers.search`. That was not taken, for three reasons read in the code:

- `engram_memory_search` is published `mutability: 'read-only'`, `mutatesExternalSystem: false`, `idempotency: { required: false }` (`src/mcp/memory/gates.ts:192-195`). The provider refuses a manifest that drifts from those values (`src/mcp-memory/provider.ts:228-275`). A commit triggered by the call would make that description false for two of the three modes.
- The provider runs one ordered pipeline (`src/mcp-memory/provider.ts:19-23`): authentication, selection, validation of the closed input, confirmation (`:788-797`), first-effect guard (`:799-808`), then the facade. A write made by the host before `readers.search` sits either outside that pipeline, before the input is validated, or inside it as an effect of a read tool.
- `/mcp` holds no journal key (`SJR1`, `B2`, its third point). A new key would be a second idempotency scheme beside the one of `S1:306-309`.

Taken instead: the journal note of the tool call carries the amendment, and `recordSessionEvent` commits it. Sources: `S1:259-269` (the journal notes tool results), `S1:472-474` (on the eight hosts, under one key), `S1:933-937` (`D11`: capture has its own purpose), `BRIEF:38` (one journal input).

What the review asked and is kept: the gate is a pure function tested alone in engram (`SJ-6a`); the separation of capture and recall is tested (`SJ-6b` t4); a note delivered twice gives one version (`SJ-6b` t3). What it costs is written in the spec (§2.4, §11): the amendment is in force at the next noted step.

### 6.3 Owner decisions and rules applied in round 1 (rows added to §1 above)

| # | Decision or rule | Source `path:line` | Kind of source | Applied in |
|---|---|---|---|---|
| 30 | `D10` — local stays the rule for context logs and summaries | `R15:58`; `DOS:492` | settled ledger | §2.5; `S1-m` |
| 31 | `D11` — capture has its own purpose and can be revoked without cutting recall | `R15:59`; `S1:933-937` | settled ledger | §2.4; lot `SJ-6b` t4 |
| 32 | `D7`, `D8` — confidentiality deny-list; bounded extracts behind a PII armor | `R15:55`, `R15:56`; `DOS:491` | settled ledger | §6.5 |
| 33 | `D16` — a session with no role is recorded, and h2a proposes one | `R15:64`; `S1:282-283` | settled ledger | §2.6 |
| 34 | `D18` — the non-memory slices, read-only, under a recorded policy | `R15:66`; `DOS:494` | settled ledger | §3.6 |
| 35 | A full view goes out only on compaction, clear or restart | the round-1 instruction for this spec, which relays `OD:40` and `D2 A` (`ANS:22`) | conductor relay | §3.4 |
| 36 | Builders: agy Neon, or Muse 1.3 xhigh / Muse ember max for small simple lots | `BLD:12`, `BLD:32` | conductor relay, 19/11 | §10 |
| 37 | « On pourra ainsi aussi faire un rtk par engram (résumé des appels outils, quitte a proxifier les appels outils). » | `ANS:68` | owner answer kit, in-repo | §4.2 |

### 6.4 The sweep of the sibling specs (`M7`)

Each sibling spec was read in full, every line, by one read-only reader, for the names this spec withdraws or moves: `engram_memory_context`, `seventh`, `session_summary`, `Spec 2`, `mission_focus_context`, `contextToolsEnabled`, `switchoverEndDateUtc`, `h2a_context_mandate`, `CliHostId`, `roleConsciousnessSlice`, `harnessEffectiveRules`, `MemoryModelContentAuthGateV1`, `D18`, `proactive-role-proposals`, `memory-wire/v2`. Each reader copied the lines it found, with their numbers.

| Spec | Lines read | Normative lines found, and the delta that covers them |
|---|---|---|
| `S1` | `:1-1715` | `:91`, `:170-171`, `:222`, `:480`, `:936`, `:1367`, `:1439` → `S1-j`; `:196-198`, `:243`, `:261`, `:296` → `S1-a`; `:351-373` (comment at `:365`) → `S1-e`; `:369` → `S1-i`; `:476`, `:478`, `:1663`, `:1703`, `:1705` → `S1-g`; `:481` → `S1-k`; `:893` → `S1-m` |
| `S3` | `:1-1113` | `:13` → `S3-a`; `:110` → `S3-b`; `:131`, `:161`, `:524-529`, `:537-540` → `S3-c`; `:503-507` → `S3-d`; `:546` → `S3-e`; `:550-564`, `:1022` → `S3-f`; `:566-568` → `S3-g`; `:771-772`, `:785` → `S3-h`; `:12`, `:124-126` → `S3-i`; `:269` → `S3-j`; `:273` → `S3-k`; `:288`, `:353` → `S3-l`; `:27`, `:70`, `:808-926`, `:1005`, `:1016`, `:1024`, `:1029-1030` → `S3-m` |
| `S4` | `:1-994` | `:16-17`, `:25`, `:37` → `S4-a`; `:32`, `:88`, `:135`, `:138`, `:140`, `:166`, `:297`, `:438-439`, `:447`, `:611` → `S4-b`; `:33` → `S4-c`; `:34` → `S4-d`; `:35`, `:48-49`, `:296`, `:318`, `:441`, `:715`, `:913`, `:915`, `:932`, `:936`, `:951` → `S4-e`; `:312`, `:380`, `:938` → `S4-f`; `:47`, `:916`, `:923` → `S4-g`; `:510`, `:579`, `:624`, `:952`, `:967-968` → `S4-h`; `:535` → `S4-i` |
| `S6A` | `:1-800` | `:16`, `:53`, `:63`, `:72`, `:79`, `:81`, `:119` → `S6A-a`; `:96`, `:212`, `:522-531`, `:533-608` → `S6A-b`; `:394`, `:468`, `:480`, `:610-618` → `S6A-c`; `:623-630` → `S6A-d`; `:137`, `:141`, `:146`, `:449-455`, `:634-638` → `S6A-e`; `:639-656`, `:788-790` → `S6A-f` (which keeps `:629` and `:640`); `:223`, `:396`, `:737` → `S6A-g`; `:738`, `:753` → `S6A-h`; `:616`, `:745` → `S6A-i`; `:761` → `S6A-j`; `:410` → `S6A-k` |

Deltas `S1-b`, `S1-c`, `S1-d`, `S1-f`, `S1-h` and `S1-l` add members: they come from the design, not from the sweep. One line number of the Spec 1 reader was off by one (`:262` for `:261`); the author's own read of `S1:259-262` decides.

Lines found and left as they are, with the reason:

- Repository gate rules, unchanged (§10 reuses `S1:1654-1656` and `S3:1061`): `S3:68`, `S3:1062-1068`, `S4:941-951`.
- `D18` rules that stay: `S3:260`, `S4:340`, `S6A:221`, `S6A:266`.
- The policy envelope check of Spec 4, unchanged: `S4:694-696`, `S4:716`.
- The mandate carriers (`S6A:383-384`, reused in §2.6) and the rule that keeps the mandate out of the closed projection (`S6A:303-305`).
- Narrative lines: `S3:818-828`, `S4:983`, `S4:989-991`.

### 6.5 Anchors re-read in round 1

- By the author, at their lines: `SJR1` and `BRIEF` in full; `src/memory-tools/reads.ts:1-215`; `src/mcp/memory/schemas.ts:200-269`, `:900-959`, `:3340-3791`; `src/mcp/memory/gates.ts:150-248`; `src/mcp-memory/provider.ts:1-109`, `:225-294`, `:440-499`, `:640-869`; `src/mcp/memory/contracts.ts:225-274`, `:305-374`; `PLAT:1-124`; the installed `invocation-context.d.ts:1-20` and `@sentropic/mcp-broker` `dist/memory/compiled-dispatch.d.ts:1-81`; `R15:1-121`; `ANS:1-113`; `OD:10-89`; `DOS:130-199`, `:268-298`, `:341-363`, `:484-503`, `:584-594`; `AUD:36-54`; `S0:136-185`; `S1:236-373`, `:455-493`, `:868-938`; `S6A:196-230`, `:300-415`; `OLD2:636-695`; h2a local tree `packages/h2a/src/runtime/loop/index.ts:40-109` and root `package.json`; engram `package.json:1-140`; `MST:15-54`; `BLD` in full, and its sibling brief `BRIEF-validate-golive.md` in full.
- By the four readers: `S1`, `S3`, `S4` and `S6A`, every line, with a verbatim copy of each line found and of the ranges asked.
- At the pins, by the review only: h2a `947f7d325` (`packages/h2a/src/runtime/loop/index.ts:49-64`, `:87-103`; `scripts/check-no-python.mjs`) and sentropic `913e3bcbc` (`packages/mcp-broker/src/memory/compiled-dispatch.ts:190-195`, `packages/mcp-platform/src/memory/invocation-context.ts:88-105`, `rules/MASTER.md:27-33`, `:45`, `Makefile:2460`). The author read the installed declarations (`PLAT`) and the local `MST` instead; the line numbers of the local `MST` differ from the pin.

### 6.6 Not verified in round 1

| Item | Status |
|---|---|
| sentropic and h2a at their pins | `unverified` by the author: no `git`. Read by `SJR1`. The local sentropic tree has no `packages/mcp-platform/src/memory/invocation-context.ts`; the local h2a tree (`0.91.0`) has neither `scripts/test-inventory.mjs` nor `scripts/run-test-gates.mjs`. |
| The make targets `scope-check`, `check-no-python`, `test-mcp-platform`, `typecheck-cluster-mesh` | `unverified` in the local `Makefile`. Taken from `S1:1680`, `S6A:730`, `S6A:745` and `SJR1`. `check-no-python` does not exist yet: lot `SJ-0s`. |
| What the Spec 2 lots `2-E3`, `2-E5`, `2-H1`, `2-S1a`, `2-S1b` contained | not re-read. Delta `S3-m` re-points by need, not lot for lot. |
| The exact form of the co-signature receipt | not defined by this spec: `S6A:638`. |
| Whether the note of a tool call can read the result of the tool on every host | `unverified` in operation, as every hook fact (`DOS:137`). `S1:472-474` specifies the delivery paths. |
| The lot id `6A-S1b` of the Spec 6A mandate verifier | taken from `S4:694` and `S1:1682`; its row in `S6A` was not re-read by the author. |
| The lot id `4-E2` at `S4:913` | inferred from the order of the rows `S4:913-916`; the reader's copy of `:913` does not show the id. |
| The worktree stash | not read. |

### 6.7 Checks before stopping (round 1)

- **Banned word.** No shell in this session either, so no `rg`. A read-only reader read every line of both files for the French word, its unaccented form and its English forms: 0 occurrences in the spec, 0 in this ledger. The mechanical `rg -n -i` run stays to be done by whoever has a shell.
- **Owner quotes.** The same reader compared each text between « » of the spec and of this section with its source line, character by character: all exact, none missing, and no guillemets around a text that is not his. Seven quotes in straight quotes, from the dossier and from the settled ledger, were checked the same way: exact. The author also re-read the 19 quotes of §9.4 against `DOS:345-363`.
- **Internal references.** A second reader checked every lot and test named in §9.4 and in §12 against the table of §10, every delta id, every section reference, every table row, and the absence of `null` in §12. It found nine weak or wrong references. All were fixed: the test sentences now name the field they prove, and three one-line interfaces declare the members of deltas `S1-f` and `S1-k`. A third reader compared this section with the spec; its remarks were applied here.
- **Size.** The spec has 898 lines; the limit is 900. No folded appendix.
- **Scope.** Two files edited: the spec and this ledger. No commit. Zero Python. The sibling specs are untouched.
- **Not read again by a reader.** The fixes made after the three readers: some test sentences of §10, three contract lines of §12, and this ledger.

## 7. R2 dispositions

- **Round 2.** Review `SJR2` (Gemini Carbon High, `2026-11-19`; `SCR/memory-finalization/reviews/SJ-R2-carbon.md`): `CHANGES-REQUESTED`. One new blocker (`N1`), four new majors (`N2`–`N5`), three minors (`m1`–`m3`). Four round-1 findings stay `PARTIAL` — `B2`, `M1`, `M2`, `M6` — and their residues are `N1`–`N5`. The spec goes from `v0.1.1` to `v0.1.2` the same day, by the spec author (Claude Fable 5.2, max). The next review round is the last one allowed.
- The round ran under a design note of the conductor, which is binding. It names one class of defect, repeated in round 2 — contracts that cross a boundary inconsistently — and five rules. 7.1 maps each rule to the spec.
- Sections 1 to 6 above are the record of rounds 0 and 1. Where they differ from this section, this section holds.
- Short names: as in §0 of the spec `v0.1.2`. It adds `SJR2` and the prefix `SCR` (`/home/antoinefa/src/graphify/.graphify/scratch/design`).

### 7.1 The five rules of the design note, and where each is applied

| Rule | Where the spec applies it | What it rests on |
|---|---|---|
| 1. One owner package per type; import directions respect each repository's boundary rules, cited by file and line | §12, "Where each type lives": five rows, one per owner package, and five blocks `A`–`E` in the contract listing | 7.4 below |
| 2. Frozen signatures never change; extend through a new optional field or a wrapper defined once | delta `S1-n`; §12 block `B`: `EngramSessionJournalPortV1`, the one wrapper; `SessionJournalOutcomeV1` carries the Spec 1 result whole | `S1:459-463`; `engram-memory/dist/contracts/index.d.ts:81-95` |
| 3. Both transports; the same `D6` projection on each; `drop` needs no selector text | §2.4, table "What crosses each transport"; §2.6, one column per transport; §6.5; lot `SJ-2c` t2, one function for both; `SessionContextAmendmentV1`, whose `drop` branch carries a `selectorId` and nothing to read | `R15:54` |
| 4. An explicit lot dependency graph, with `SJ-5a`/`SJ-5b` → `SJ-7a`, the `provider.ts` `v2` preflight, and the Makefile and engram version move in sentropic; every replaced gate kept or retargeted | §10, "Build order": every edge between lots of the spec; lot `SJ-5c`, the preflight; `BRSJ-EX2` for `SJ-3a` and `SJ-7b`; delta `S6A-h`, which sends each test and each gate of `6A-E2` and `6A-S4` to a named test | `S6A:738`, `S6A:753`; `S1:1672-1676`; `S4:924-931` |
| 5. Pre-states defined; every refusal code reachable in a test | §2.4, table "Before the first value exists"; §2.5, version 1 and `basedOnVersion: 0`; 7.5 below lists every code and its test | `SJR2` `N3` |

### 7.2 One line per finding

| Finding | Disposition | Where, in `v0.1.2` | Source that decides |
|---|---|---|---|
| `B2` (round 1), `PARTIAL` | closed by the two rows `N2` and `N3` | — | `SJR2:14` |
| `M1` (round 1), `PARTIAL` | closed by the four rows `N1` | — | `SJR2:15` |
| `M2` (round 1), `PARTIAL` | closed by the rows `N4` | — | `SJR2:16` |
| `M6` (round 1), `PARTIAL` | closed by the rows `N5` | — | `SJR2:20` |
| `N1` (1) — the binding types placed at cluster-mesh only, though engram, the platform and h2a need them | applied, with one owner per type instead of the co-freeze the review proposed (7.3, point 1) | §12, owner table and blocks `A`–`E`: the journal contracts and the wrapper live in the engram product package; `SessionContextBindingV1` lives in `@sentropic/mcp-platform/memory`; `SessionCallerRefV1` and the launch receipt live in h2a; the two host policies live in cluster-mesh; `engram-memory` gains no type | 7.4 |
| `N1` (2) — `SJ-5b` did not wait for `SJ-7a`; engram's platform pins; the provider refuses any wire profile but `v1` | applied | §10: `SJ-7a ⇒ SJ-2c`, and `SJ-5a`, `SJ-5c`, `SJ-5b` list "published `SJ-7a`"; `SJ-2c` t7 moves the pins; `SJ-5a` t6 and lot `SJ-5c` admit the `v2` profile set | `package.json:186`, `:257`; `src/mcp-memory/provider.ts:426-457`; `src/mcp-memory/profiles.ts:7-15`; `src/mcp/memory/receipts.ts:55-68`, `:87-89`, `:101-103`; `src/mcp/memory/schemas.ts:3665-3682` |
| `N1` (3) — the binding carried no content authorization; the journal call had no carrier for it | applied; the carrier is an argument, not an envelope member (7.3, point 2) | block `C`: `reader_content_authorized`, `content_policy_digest`; block `B`: `SessionJournalHostFactsV1.binding`; §2.6, last table row; lots `SJ-2c`, `SJ-7f` | `R15:54`; `S1:319-349` |
| `N1` (4) — `mainModelRef` was an unsigned field of the request, against the spec's own rule | applied | the field, `MandateBindingJournalFieldsV1` and delta `S1-l` are withdrawn. The reader's model comes from a launch receipt signed by an enrolled h2a instance key: block `E` `H2ASeatLaunchBodyV1`; §2.6, fifth rule; lots `SJ-7e` (h2a signs and sends) and `SJ-7f` (cluster-mesh verifies) | `S6A:379`, `S6A:390`, `S6A:392`; h2a `packages/h2a/src/envelope.ts:72-103`, `:109-163` (local tree) |
| `N2` — `drop` required a whole selector: a `D6` leak on output, or a broken `selectorId` on input | applied | block `A`: `SessionContextAmendmentV1` is a union of two closed branches. `keep` carries a `text` or `ref` match; `drop` carries a `selectorId`. `withheld` is never stored and never accepted as input. Lots `SJ-5a` t3, `SJ-6b` t1, t7, t9 | `R15:54`; `src/mcp/memory/schemas.ts:3384-3397` (exactly one `oneOf` branch) |
| `N3` (a) — the verdict `journal_off` could not be reached: no noted `mandate_binding`, so no binding, so `UNAUTHORIZED` first | applied | §2.6: the binding is built at each call and does not read the journal; the journal facet of engram says whether the workspace opted in; lots `SJ-7c` t6, `SJ-5b` t4, `SJ-6b` t5 | `OD:83`; `src/memory-tools/reads.ts:105` |
| `N3` (b) — no query, and no `basedOnVersion`, before the first pinned request | applied, as the review proposed | §2.5: the first noted event of a key creates version 1, with no pinned request and no selector; before it, a search omits the query and an amendment names `basedOnVersion: 0`; lots `SJ-1a` t1, `SJ-6a` t5, `SJ-6b` t8 | `S1:276-284` |
| `N4` (a) — a member attached to the refusal breaks `Result<RawSessionEventReceipt>`, whose error is `MemoryErrorV1` | applied | `SessionJournalRefusalFieldsV1` is removed. `readOnlyDelivery` rides in `SessionJournalOutcomeV1`, beside the unchanged result. Delta `S1-k`; §3.6 | `engram-memory/dist/contracts/index.d.ts:81-95`; `S1:459-463` |
| `N4` (b) — no input for the verified `D18` policy | applied | block `B`: `SessionJournalHostFactsV1.readOnlyPolicy`; lots `SJ-2b` t1–t3, `SJ-3a` t5 | `S4:937`, `S4:968` |
| `N4` (c) — no h2a test that the hook applies the read-only delivery | applied | lot `SJ-4` t7 | `SJR2:54` |
| `N5` (a) — `BRSJ-EX1` forbade the engram pin move in `Makefile:1282` | applied | §10: `BRSJ-EX2`, lots `SJ-3a` and `SJ-7b`; `BRSJ-EX1` is now bound to lot `SJ-0s` alone | `MST:32-33`; `S1:1672-1676`; `S4:924-931` |
| `N5` (b) — `SJ-7b` dropped the `MCP-L5` gate of `6A-S4` | applied | lot `SJ-7b` t4 and its gate, `make memory-mcp-qualify`; delta `S6A-h` | `S6A:753` |
| `m1` — the co-signature guard at the provider preflight | applied as the review states, and once more where the preflight changes | lot `SJ-5a` t7; lot `SJ-5c` t2 | `S6A:638`, `S6A:738` |
| `m2` — residual lines of withdrawn names | applied as the review states | delta `S3-m`: `S3:57`, `:1049-1050`, `:1065`, `:1105` added; delta `S3-i`: `S3:660` added; new delta `S6A-l` for `S6A:74`, `:283`, `:392` | the lines themselves, re-read by the author in round 2 |
| `m3` — camelCase interfaces inside a snake_case page, with no codec | applied as the review states | §12: the wire form and its one codec (`SessionContextWire`, `toSessionContextWire`, `fromSessionContextWire`); `SearchPageV2` is in wire form, checked by `validateSearchOutputV2`; lots `SJ-5a` t2, t5; `SJ-4` t6 and `SJ-8` t5 reuse its vector | `src/memory-tools/reads.ts:175-178`; `src/mcp/memory/contracts.ts:311-318`, `:360-365` |

### 7.3 Where the fix differs from the one the review proposed, and why

1. **One owner, not a co-freeze** (`N1`). The review proposed to co-freeze `SessionCallerRefV1` and `SessionContextBindingV1` in the platform and in engram. Rule 1 of the design note wants each type in one package. Taken: the binding is declared once, in `@sentropic/mcp-platform/memory`, beside the projection that carries it. engram imports it type-only, over an edge that exists today (`src/mcp-memory/provider.ts:25-37`). `SessionCallerRefV1` is h2a's: h2a writes it and cluster-mesh reads it as JSON. The platform forwards `_meta` whole (`S6A:616`) and needs no type for it.
2. **An argument of a wrapper, not members of the envelope** (`N1` (3), `N4`). The review proposed two host-verified optional members on the envelope. Three reasons led to a second argument of one wrapper. First, a host fact placed in a request-body type has to be stripped at the route on every path; that is the class of defect `N1` (4) reports for `mainModelRef`. A separate argument cannot be sent by a client at all. Second, it holds whichever way Spec 1 settles where its shapes live (7.8): if they stay under `engram-memory/`, as `S1:176` says, an envelope member could not name the platform's binding at all, because L0 imports nothing outside its tree (`tests/memory-neutrality.test.ts:255-257`, `:1067-1070`); and a neutral copy of the binding there would be the two-package type that rule 1 excludes. Third, rule 2 names "a wrapper defined once" as an allowed extension.
3. **The outcome of the wrapper, not a new method or a new status** (`N4`). The review offered a new method on the port, or a receipt status `readonly_unrecorded`. Each changes a frozen shape: the port's set of methods, or the `status` union of the receipt (`S1:352`). Rule 2 excludes both.
4. **The launch receipt is `new`** (`N1` (4)). The review asked for "an enrolled `h2a` launch receipt". No such artifact was found in the h2a files read (7.7). The spec defines it: an `H2AEnvelope` of type `event`, which `validateH2AEnvelope` accepts today with any object body and no artifact kind (h2a `packages/h2a/src/types.ts:36-45`, `:79-102`; `src/envelope.ts:109-163`), signed with `signEnvelope` (`src/envelope.ts:72-81`). It adds no artifact kind and leaves `H2A_ARTIFACT_KINDS` (`types.ts:16-25`) as it is. cluster-mesh verifies it with the key resolution and the signature check it already has for mandates (`S6A:379`, `S6A:390`).
5. **`journal_off` comes from engram's facet** (`N3`). The review left a choice: a public `CAPABILITY_UNAVAILABLE`, or a state passed in the binding or in a facet. Taken: the facet for the search, because the workspace policy is engram's and cluster-mesh need not copy it; and `CAPABILITY_UNAVAILABLE` on the journal call, because the L0 code list is closed (`engram-memory/dist/contracts/index.d.ts:80`).
6. **The shape of the amendment** (`N2`). The review's `keep` branch carried a whole selector. Here `keep` carries the match only: the id is derived from it, and the author fields (`by`, `authorModelRef`, `sourceEventRecordIds`, `basedOnVersion`) are shared by both branches.
7. **Tests that moved.** `SJ-3a` t3 of `v0.1.1` (the `D7` and `D8` screens after the act; R1 `m1`) is now `SJ-2c` t3, the rule in engram, and `SJ-7f` t6, the same rule through the route. `SJ-7c` t5–t6 of `v0.1.1` are `SJ-7f` t1–t5. `SJ-7a` t1 of `v0.1.1` is `SJ-7a` t2 and `SJ-7c` t5: the platform forwards, cluster-mesh reads. Lot `SJ-3a` is renamed "The route".
8. **One rule the review did not ask for**, added for rule 3: "no binding, no context" holds on the journal call as on the search (§2.6; `SJ-3a` t6; `SJ-4` t8). `v0.1.1` gated the search on the binding and was silent on the journal call.

### 7.4 Where each type lives: the boundary rules read (rule 1)

| Owner package | Boundary rule, file and line | Read by |
|---|---|---|
| `engram-memory` L0 — no type of this spec | a source edge may not leave `engram-memory/` (`tests/memory-neutrality.test.ts:255-257`); no source file may hold the text `h2a` (`:913-917`); the packed files may hold neither `@sentropic/` nor `h2a` (`:1067-1077`). Block `A` needs `OntologyTemplateEnvelopeRef` and `Sha256Digest`, which Spec 0 declares in the product tree — its block imports `./ontology-guardian/types.js` and `./types.js` (`S0:138-144`, `:149-154`) — so block `A` cannot sit in L0 | the author, whole test file; `S0:128-187` |
| engram (product) — blocks `A` and `B` | the Spec 1 contract block names its file `src/session-front-contracts.ts` and imports Spec 0 from `./metamodel-contracts.js` and L0 from `engram-memory/contracts` (`S1:179-194`); the product imports L0 by relative path (`src/memory-tools/reads.ts:3-5`) and the platform by its `memory` subpath (`src/mcp-memory/provider.ts:25-37`); the platform is an optional peer (`package.json:186`, `:199-208`) and a dev dependency (`:257`) | the author |
| sentropic `mcp-platform` | its only dependency is the MCP SDK; `hono` is an optional peer (`node_modules/@sentropic/mcp-platform/package.json:109-119`, version `0.4.0`); at the pin the review read the same at `packages/mcp-platform/package.json:100-115` | the author (installed package); `SJR2` (pin) |
| sentropic `mcp-broker` | it depends on the platform alone (`node_modules/@sentropic/mcp-broker/package.json:18-20`) and passes the projection on by spreading it (`dist/memory/context-projection.js:24-34`): lot `SJ-7a` needs no broker change | the author (installed package) |
| sentropic `cluster-mesh` | it loads engram through its peer and its catalog (`S1:176`, `S1:1673`); it takes no `@sentropic/h2a` dependency (`S4:937`) | the author, through the sibling specs |
| h2a | `@sentropic/h2a` depends on `@hono/mcp`, `@hono/node-server`, the MCP SDK, `@sentropic/track` and `hono`, and on nothing of engram or sentropic (`packages/h2a/package.json:51-65`, local tree); a static guard refuses a direct engram import (`S1:1692`) | the author (local tree) |

### 7.5 Every refusal code and verdict reason, with the test that reaches it (rule 5)

| Code or reason | Case | Test |
|---|---|---|
| `INVALID_SCHEMA` | `session_context` sent with `v2` off | `SJ-5a` t1, `SJ-7b` t3 |
| `INVALID_SCHEMA` | `session_context` with `page_cursor` | `SJ-5a` t4 |
| `INVALID_SCHEMA` | `held` and `reset` together, or neither | `SJ-1a` t5 |
| `INVALID_SCHEMA` | `contextAmendments` on an event that is not the note of a search call | `SJ-6b` t6 |
| `INVALID_SCHEMA` | an amendment whose match is `withheld`; a `drop` that carries a match | `SJ-6b` t9 |
| `INVALID_SCHEMA` | `memory` among the allowed slices of a host fact | `SJ-2b` t3 |
| `INVALID_SCHEMA` | an envelope member the contract does not know | `SJ-3a` t3 |
| `UNAUTHORIZED` | a search with `session_context` and no binding | `SJ-5b` t4 |
| `UNAUTHORIZED` | a journal call with context members, no binding and no verified policy | `SJ-3a` t6 |
| `UNAUTHORIZED` | the envelope and the binding disagree | `SJ-2c` t5 |
| `UNAUTHORIZED` | no memory identity: the Spec 1 refusal, with or without a read-only delivery | `SJ-2b` t1, t2; `SJ-3a` t5; `SJ-4` t7 |
| `CAPABILITY_UNAVAILABLE` | a journal call while the journal is off | `SJ-2a` t1, `SJ-3a` t1, `SJ-4` t1 |
| `CAPABILITY_UNAVAILABLE` | a search with `session_context` and no journal facet | `SJ-5b` t4 |
| `AUTHORIZATION_REVOKED` | the capture purpose is revoked (Spec 1, `S1:1664`) | `SJ-6b` t4 |
| `McpMemoryPreflightError` | the `v2` profile set bound without a valid co-signature receipt | `SJ-5a` t7, `SJ-5c` t2 |
| `503` | the local store is down | `SJ-3a` t4, `SJ-4` t5 |
| verdict `refused`, `journal_off` | `keep` or `drop` while the journal is off | `SJ-6b` t5 |
| verdict `refused`, `outside_rights` | a selector outside the rights of the query | `SJ-6a` t3 |
| verdict `refused`, `selector_ceiling` | every selector is the agent's, and one more is asked | `SJ-6a` t4 |
| verdict `refused`, `unattributed` | a shadow amendment without its model or without a cited event | `SJ-10` t1 |
| verdict `no_change` | a `keep` already kept; a `drop` of an unknown id | `SJ-6a` t1, t2 |
| no binding built | no memory identity; a mandate that fails a check or lacks the right; a session noted by another caller | `SJ-7c` t3, t4 |
| no reader fact | no receipt, or one that does not verify: the reader is read as external and not authorized, and the call is not refused | `SJ-7f` t2 |

Version and verdict fields, before their first value: `version` is 1 from the first noted event of a key (`SJ-1a` t1); `basedOnVersion` is `0` when no version existed (`SJ-6a` t5, `SJ-6b` t8); `session_context_query` is omitted before version 1 and with the journal off (`SJ-6b` t5, t8); `session_context_verdict` is then the gate's over an empty query (`SJ-6b` t8); the `queryVersion` of a watermark is 1 or more, and always 1 for a `D18` delivery, whose query is computed and never stored (`SJ-2b` t4); `annotatedThroughOrdinal` is absent while the shadow has read nothing or is off (`SJ-10` t4); `pendingProactiveRoleProposalId` is absent when no proposal is ready (`SJ-16e` t2).

### 7.6 Rows added to §1 above (rules applied in round 2)

| # | Decision or rule | Source `path:line` | Kind of source | Applied in |
|---|---|---|---|---|
| 38 | The design note of round 2: one owner package per type; frozen signatures never change; both transports with the same `D6` projection; an explicit build order; pre-states defined | the round-2 instruction for this spec, `2026-11-19` | conductor ruling, binding; no primary file | §2.4, §2.6, §10, §12 |
| 39 | The minors of round 2 are applied as the review states | the same instruction | conductor ruling | lots `SJ-5a` t7 and `SJ-5c` t2; deltas `S3-i`, `S3-m`, `S6A-l`; the wire codec of §12 |
| 40 | `D6`, applied to a selector's text and to the reader's content authorization on both transports | `R15:54` | settled ledger | §2.4, §6.5, §12 blocks `A` and `C` |

### 7.7 Anchors re-read in round 2, and what stays not verified

- **Re-read by the author, at their lines.** `SJR2` in full. `src/mcp-memory/provider.ts:1-109`, `:220-509`, `:640-879`; `src/mcp-memory/profiles.ts:1-31`; `src/memory-tools/reads.ts:1-215`; `src/mcp/memory/receipts.ts:40-119`; `src/mcp/memory/contracts.ts:140-458`; `src/mcp/memory/schemas.ts:3655-3694`; `src/mcp/memory/gates.ts:176-225`; `package.json:1-266`; `tests/memory-neutrality.test.ts:1-1087`; `engram-memory/dist/contracts/index.d.ts:60-119`; `PLAT:1-124`; the installed `@sentropic/mcp-platform` `package.json:1-127` and `dist/memory/invocation-context.js:1-96`; the installed `@sentropic/mcp-broker` `package.json:1-21`, `dist/memory/context-projection.js:1-36`, `dist/memory/compiled-dispatch.d.ts:1-81`. `S0:128-187`; `S1:140-529`, `:1636-1714`; `S3:54-59`, `:656-663`, `:1044-1067`, `:1100-1112`; `S4:436-442`, `:900-974`; `S6A:60-89`, `:196-415`, `:600-799`. `MST:1-78` (local tree). h2a, local tree: `packages/h2a/package.json:1-66`, `packages/h2a/src/types.ts:1-110`, `packages/h2a/src/envelope.ts:50-169`. `BRF:5-7` and `R15:50-74`, for the two owner quotes that moved inside §2.4.
- **Lot ids confirmed in round 2.** `4-E2` is at `S4:913` and `6A-S1b` is at `S6A:748`: the two rows of 6.6 that marked them as inferred are now read.

| Item | Status |
|---|---|
| sentropic at its pin `913e3bcbc`: `Makefile:1282`, `:2460`; `packages/mcp-platform/package.json:100-115`; `packages/cluster-mesh/package.json:269`, `:294`; `src/modules/catalog.ts:18` | `unverified` by the author: no `git`. Read by `SJR2`, `S1:1673-1674` and `S4:925`. The local tree differs: its `packages/mcp-platform/package.json` is at `0.1.1` and its `packages/cluster-mesh/package.json` has 40 lines. |
| The platform version | the installed one is `0.4.0`; `S6A:777` gives `0.4.2` at the pin. Lot `SJ-7a` t5 asks for a `0.4.x` version, which both the broker's range and the engram range of lot `6A-E3` (`S6A:739`) admit. |
| h2a at its pin | `unverified` by the author. The three h2a files were read in the local tree (`0.91.0`). `S6A:388` and `S6A:390` cite the same primitives at the same lines of `envelope.ts`. |
| Whether h2a already holds a launch record | `unverified`: no text search, and none in the three files read. The receipt is specified as `new` (7.3, point 4). |
| Whether lot `6A-S0a` already exports `v2` profile ids from the platform | `unverified`. Lot `SJ-7a` t4 asserts it in either case. |
| Whether an engram packaging guard forbids a type-only platform import outside `src/mcp-memory/` | `unverified`: no text search over `tests/`. The edge exists in `src/mcp-memory/provider.ts:25-37`; `tests/memory-neutrality.test.ts` guards `engram-memory/` only. |
| The mapped type `SessionContextWire<T>` and `SnakeKey` | not compiled: no shell. Checked by hand on `selectorId`, `sourceEventRecordIds`, `basedOnVersion`, `templateDigestSha256` and on the two branches of the amendment. |
| The make target `memory-mcp-qualify` and its arguments | taken from `S6A:747`, `S6A:753` and `SJR2:61`; not read in a `Makefile`. |

### 7.8 An observation for the Spec 1 author — not a delta of this spec

Spec 1 says two things about where its contract shapes live. Its prose and its lot `1-E1` place them in `engram-memory/contracts/session-front.ts`, re-exported by the product (`S1:176`, `S1:1663`). Its contract block names the product file `src/session-front-contracts.ts` and imports the Spec 0 types from `./metamodel-contracts.js` (`S1:179-185`), which Spec 0 declares in the product tree (`S0:138-144`). Two facts weigh against the first reading. The neutrality guard lets no `engram-memory` source import outside its tree (`tests/memory-neutrality.test.ts:255-257`), so those shapes could not use `H2AMandateEnvelope` or `OntologyTemplateEnvelopeRef` there. And the guard refuses the text `h2a` in any `engram-memory` source file (`:913-917`) and in the packed files (`:1067-1077`), while the receipt names a field `h2aProactiveRoleAnalysisQueued` (`S1:369`) and the block carries comments with `h2a:` paths (`S1:198`). This spec follows the contract block: block `A` is in the product package, and `engram-memory` gains no type from it. How Spec 1 settles its own placement is its author's matter. Under either outcome the choices of this spec hold: the binding is an argument of the wrapper, not a member of the envelope (7.3, point 2), and the journal facet is an option of the product read tools, not a member of the L0 type `MemoryReadFacetsV1` (§12, second seam).

### 7.9 Checks before stopping (round 2)

- **Size.** The spec has 894 lines; the limit is 900. To make room for the two tables of §2.4, the owner table of §12 and four lots, the short-name table of §0 went to four columns, the reasons of §2.4 went to two paragraphs (the five reasons stay in 6.2 above), and some contract fields share a line. No folded appendix.
- **Owner quotes.** No quote was retyped. Two quotes moved inside §2.4, when four bullets became one paragraph (`BRF:7`, `R15:68`); both were compared with their source lines in this session: exact.
- **Scope.** Two files edited: the spec and this ledger. No commit. Zero Python. The sibling specs are untouched.
- **Banned word, and internal references.** No shell in this session either, so no `rg`. See the last line of this section for the read that replaced it.
