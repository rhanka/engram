# Spec — engram session journal and session context query (`SPEC_ENGRAM_SESSION_JOURNAL_AND_CONTEXT_QUERY`)

- **Version:** `0.1.2` (`2026-11-19`). **Status:** `proposed`. Design only: it authorizes no merge, no release and no activation.
- **Author:** Claude Fable 5.2 (max), spec author. **Reviewer:** Gemini Carbon High.
- **`0.1.2`** applies review round 2 (`SJR2`: `N1`–`N5`, the residues of `B2`, `M1`, `M2` and `M6`, `m1`–`m3`) under the conductor's design note of that round: every contract that crosses a package has one owner, both transports, an explicit build order and its states before the first value (§2.4, §2.6, §10, §12). `0.1.1` applied round 1 (`SJR1`). The ledger has one line per finding, in its sections "R1 dispositions" and "R2 dispositions".
- **Repository of record:** `engram` (`@sentropic/engram`). Lots also land in `h2a` and `sentropic`.
- **Supersedes:** `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` (`v0.4.2`, frozen; `OLD2:3`). That file stays on disk as a record. Nothing below depends on it.
- **No 7th tool.** engram keeps its six memory tools (`src/mcp/memory/contracts.ts:149-156`).
- **Ledger:** [`spec/memory/reviews/SJ-R0-SOURCES.md`](memory/reviews/SJ-R0-SOURCES.md) lists every owner decision applied here, with its source line.

## 0. How to read this spec

Short names for sources. Paths are relative to this repository unless absolute. `SCR` stands for `/home/antoinefa/src/graphify/.graphify/scratch/design`.

| Short name | File | Short name | File |
|---|---|---|---|
| `ANS` | `spec/memory/dossiers/2026-11-15-contexte-court/ANSWERS-r7.owner.yaml` | `DOS` | `spec/memory/dossiers/2026-11-15-contexte-court/DOSSIER-r7.fr.md` |
| `OD` | `spec/memory/OWNER-DECISIONS-2026-11-14.md` | `R15` | `spec/memory/R15-SEDIMENT.md` |
| `EV15` | `spec/memory/evidence/2026-11-15/EVIDENCE-owner-comment-r5.md` | `S0` | `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md` |
| `S1` | `spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` (`v0.3.0`) | `S3` | `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md` (`v0.3.0`) |
| `S4` | `spec/SPEC_ENGRAM_H2A_ROLE_ONTOLOGY_AND_HARNESS_OVERLAYS.md` (`v0.3.0`) | `S6A` | `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md` (`v0.2.0`) |
| `OLD2` | the superseded Spec 2 named above | `PLAT` | `node_modules/@sentropic/mcp-platform/dist/memory/frozen-context.d.ts` (`@sentropic/mcp-platform@0.4.0`, as installed) |
| `AUD` | `SCR/septieme-outil/AUDIT-requete-session-dreaming.fr.md` | `BRF` | `SCR/septieme-outil/BRIEF-audit-requete-dreaming.md` |
| `BRIEF` | `SCR/memory-finalization/BRIEF-spec-session-journal.md` | `REV3` | `SCR/memory-finalization/reviews/engram-s2rw-opus-r3.md` |
| `SJR1` | `SCR/memory-finalization/reviews/SJ-R1-carbon.md` (review round 1) | `SJR2` | `SCR/memory-finalization/reviews/SJ-R2-carbon.md` (review round 2) |
| `BLD` | `SCR/live-git-indexing/BRIEF-plan-golive-amend.md` (the builder rule) | `ALV2` | `/home/antoinefa/src/sentropic/.tmp/agent-loop-v2/design.md` (`v9`, `2026-11-11`) |
| `MST` | `/home/antoinefa/src/sentropic/rules/MASTER.md`, the local tree | `H2A` | `/home/antoinefa/src/h2a`. The local tree is at `@sentropic/h2a@0.91.0`; `origin/main` is `947f7d325`, read by `SJR1` and `SJR2` |

- Status words: `proposed` is a proposal of this spec, not an owner decision; `new` does not exist in code today; `unverified` means nobody ran it, or this author could not re-read the line.
- Quotes: text between « » is the owner's, copied byte for byte. Text between "…" is a quote from a spec or a dossier.

Each contract symbol is defined once, in §12. Every other section cites it by name. Limits of the three authoring sessions: the shell was unavailable in all three. No `git`, no text search. Three consequences are marked where they matter. The `origin/main` pins of h2a and sentropic were read by the reviews (`SJR1`, `SJR2`), which had a shell, not by the author. The lines of the sibling specs cited in §8 were found by four read-only readers, one per spec, each reading every line. The worktree stash was not read.

## 1. What this is for

### 1.1 One screen

The owner, 15/11 (`OD:40`):

> « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »

What he gains in one working session:
1. **Nothing is lost.** While the tool works, engram notes each step: his prompt, the agent's reasoning, each tool call and its result. A compaction of the tool no longer erases them.
2. **Only the new is sent.** At each step the tool receives what this session does not hold yet. When nothing changed, nothing is sent.
3. **The past is searchable.** The agent looks up an old line instead of carrying it in its context.
4. **One query says what the session needs.** His current request, the decisions, the Track scope, the rules, the relevant facts. The shadow keeps it up to date. The agent can read it and ask to amend it.
5. **The session survives.** After a compaction, or when the same role moves to another CLI, work restarts from that same query. Nobody writes a handover.
6. **Dreaming puts back what was forgotten.** Permanent facts the session lost sight of come back in the next diff.

No new tool carries this. Two existing things do: the journal input of Spec 1, and the search tool engram already has.

```
CLI hook ── note(step + what the session holds) ──▶ cluster-mesh ──▶ engram journal
CLI hook ◀── receipt(only what is new, or nothing) ──┘
agent    ── engram_memory_search(query, session_context) ──▶ history · the query · an amendment to note
CLI hook ── note(that search call + its amendment) ──▶ engram journal ──▶ next version of the query
```

| Owner's term | What it is | Carried by | Stage (`D3 A`) |
|---|---|---|---|
| « noter » | The parallel journal. A hook notes each step. | Spec 1 `recordSessionEvent` on `/memory/v1/session-front/ingest` (`S1:461`, `S1:472`) | 1 |
| « rendre le diff » | The answer to a note: only what the session does not hold. The only thing re-sent. | The receipt of that same call (`S1:351-373`) | 2 |
| « chercher dans l'historique » | Search past turns, tool outputs and decisions. | `engram_memory_search` with `session_context: "history"` | 2 |
| Read the query, and « modifier la requête de session contextuelle » | See what the context is built from. Keep a subject, or drop it. | `engram_memory_search` with `session_context: "keep"` or `"drop"` asks; the journal note of that call commits (§2.4) | 2 |
| « la reprise post compaction » | Same session, emptied context: the full view again. | The journal call, with `reset: 'compaction'` | 2 |
| « le switch inter cli sur le meme rôle d'agent » | New session id, same role, same worktree: the query is inherited. | A query key without the session id (§2.5); `reset: 'restart'` | 2 |
| dreaming | Reads the journal. Returns recalls in the next diff. | Spec 3 passes; the `memory` slice | 1 feeds, 2 returns |

The first three terms are in the choice he exported for `D1` to `D3` (`ANS:25`, `DOS:43`). The next three are his 19/11 words (`BRF:7`).

### 1.2 Each function: who, when, example, and what happens without it

The example is the dossier's (`DOS:71`): the owner asks "Passe la limite de tentatives à 5"; the agent edits `src/retry.ts` and runs the tests; one test fails. It is a constructed example. No real run exists yet (`DOS:71`).

**« noter »**
- *Who calls it:* the h2a hook of the CLI, or our own loop. Never the model.
- *When:* at each prompt sent, each tool result, each end of an assistant turn. Also at session start and at compaction.
- *Example.* In: `{ kind: 'speech_turn', speakerRole: 'owner', hostId: 'claude', boundedTurnText: 'Passe la limite de tentatives à 5', triggerTurnSweep: true }` inside a `RawSessionEventEnvelope` (`S1:319-349`). Out: `{ status: 'recorded', eventRecordId: 'raw_…', cursor: '41', extractionSweepScheduled: true }` (`S1:351-373`).
- *Without it:* the step lives only in the tool's thread. Nothing below can work.

**« rendre le diff »**
- *Who calls it:* the same hook, in the same call. It adds what the session still holds.
- *When:* wherever the CLI lets a hook inject text: prompt sent, session start, after a compaction.
- *Example.* At the next prompt the hook adds `contextRequest: { held: { queryId: 'scq_7f…', queryVersion: 3, cursor: '41' } }`. Since cursor 41 the agent edited a file and a test failed. Both are steps of this session: the tool's thread already has them. Nothing came from outside. Out: no payload, `contextDelivery.byteLength: 0`. The hook prints nothing.
  One step later a decision recorded in another session of the same role enters the selection. Out: one line in `readySlicePayloads.memory`, about 200 bytes, and `contextDelivery.watermark: { queryVersion: 3, cursor: '52' }`.
- *Without it:* the session never learns what was decided elsewhere.

**« chercher dans l'historique »**
- *Who calls it:* the agent, through `engram_memory_search`.
- *When:* it needs an exact past line: an error, a command output, a decision.
- *Example.* In: `{ query: 'retry.test.ts attendu 3 reçu 5', purpose_ref: 'memory.recall.contextual/v1', session_context: 'history' }`. Out: one match, the output of the failed run, lines 14 to 19, with its `session-db` locator and its digest.
- *Without it:* the agent re-runs the tests or guesses. In our own CLI, which keeps no thread, the line would be gone.

**Read the query, and « modifier la requête de session contextuelle »**
- *Who calls it:* the agent, through the same tool. The shadow amends too, in the background (§2.3).
- *When:* the subject shifts. The agent wants a subject to stay in front of it, or to stop receiving one.
- *Example.* In: `{ query: 'retry policy and backoff', purpose_ref: 'memory.recall.contextual/v1', session_context: 'keep' }`. Out: the usual results; the query as it stands, at version 3; and `session_context_amendment`, with the verdict `accepted`. The search wrote nothing. The hook then notes that call, as it notes every tool call, and the note carries the amendment: engram commits version 4. The next diff brings what the selector selects.
- *Without it:* only the shadow decides what the session sees. The agent cannot say "keep this".

**« la reprise post compaction »**
- *Who calls it:* the hook.
- *When:* on the CLI's compaction signal, before the next request to the model.
- *Example.* Claude Code compacts. The hook notes it and sends `contextRequest: { reset: 'compaction' }`. Out: the full view. It holds the request "Passe la limite de tentatives à 5" word for word, the decisions, the failed check, the plan and pointers. The session id is the same.
- *Without it:* the tool's own summary decides what survives.

**« le switch inter cli sur le meme rôle d'agent »**
- *Who calls it:* the hook of the new CLI.
- *When:* at session start.
- *Example.* The owner closes Claude Code and opens Codex on the same worktree with the same h2a role. The session id is new. The hook sends `contextRequest: { reset: 'restart' }`. engram finds the query of that role on that worktree, at version 4, with the selector the agent kept. Out: the full view.
- *Limit:* text produced by the earlier session reaches an external model as references until the content authorization act (§6.5).
- *Without it:* a hand-written handover, which the owner refused (`R15:71`).

**Dreaming**
- *Who runs it:* the Spec 3 passes. Not the session.
- *When:* each night, each week, each month; at mid-day; and when the context of a session saturates (`S3:124-128`; `R15:67`, `R15:73`).
- *In:* the journal since the cursor of the pass, and the stored requests: what each session was given (§3.2).
- *Out:* recall marks on permanent accepted records. Each mark becomes one item of the `memory` slice in the next diff: `{ ref: 'rec_…', slice: 'memory', change: 'added', disclosure: 'reference', authoredBy: 'dreaming', sourceEventRecordIds: ['raw_…'] }`. It is a reference until the content authorization act (§6.5).
- *Example (illustration).* A permanent decision accepted three weeks ago concerns `src/retry.ts`. None of the last 8 deliveries of this session carried it. The nightly pass marks it. The first diff of the morning brings it.
- *Without it:* the session repeats what a settled decision already forbade.

## 2. The session context query

### 2.1 What it is

The owner, 15/11, on the first diagram of the dossier (`ANS:68`):

> « L'état devrait aussi être une requête formelle au graphe
> - contexte de sélection (droits, extraits spécifiques pertinents) + ontolgies applicables (track, archi, specs, harnais, ontologies spécifiques...)
> Le shadow devrait :
> - amender cette requête
> - update relatif aux ontologies pertinentes (faits, décisions / track, harnais, architecture, statut - étapes track, scope track des demaindes/epic/feature/user stories/plans). »

He had said it on 08/11 already: « L empreinte etant unenrequet graphe dans le quel le mandat eat un composant primaire. » (`R15:70`) and « un contexte de session devrait etre une requete contextuelle a la memoire + le resultat de la requete. » (`R15:71`).

So the state of a session is not a text. It is one object, `SessionContextQueryV1` (§12). It answers one question: what must this session have in front of it? engram evaluates it over the graph. The result is the **view**. The view is what a session receives in full after a reset, and in part, as a diff, the rest of the time.

### 2.2 What it contains, and who may change each part

| Part | Content | Written by | Who may amend it |
|---|---|---|---|
| Rights | tenant, workspace, worktree, the verified h2a mandate, the role | code, from the session binding (§2.6) | nobody |
| Pinned request | the owner's current request and his corrections, word for word | code | his word, or acceptance of the work in Track; never a model (`DOS:337`) |
| Applicable ontologies | references to the templates registered for the workspace | code, from the Spec 0 registry | nobody |
| Track scope | an open list of Track references, bound to the h2a objective loop | code, from the loop | the shadow may propose; a proposal stays `proposed` until Track control (`OD:26`) |
| Relevant extracts | selectors: a text re-run at each evaluation, or one exact reference | the shadow and the agent | the shadow (§2.3) and the agent (§2.4) |

Three rules follow from the owner's ownership rule (`OD:13-15`):
- engram holds no list of Track types and no list of h2a types. A Track reference carries open strings (`SessionTrackScopeRefV1`, §12).
- An ontology is named by `OntologyTemplateEnvelopeRef` (`S0:149-154`). `lineage` is the Spec 0 `LineageId` (`S0:147`), unchanged. The owner's words « specs » and « ontologies spécifiques » are templates registered under those lineages. Which registered template carries « specs » today is `unverified`. This spec adds no lineage.
- The Track scope comes from the objective loop, as the owner asked: « La notion de scope track doit aussi être rattachée a l'objective loop. » (`ANS:68`). A session with no loop has an empty Track scope.

### 2.3 How the shadow amends it

After each noted step the annotation service reads the new events (§6). It returns two things in its Spec 1 extraction batch (`recordExtraction`, `S1:462`):
1. Ontology updates: facts, proposed decisions, Track status. These are the existing extraction candidates (`S1:380-406`). Nothing changes there.
2. Amendments to the query: `SessionContextAmendmentV1` (§12), carried by the batch (delta `S1-f`, §8.1).

A gate without a model applies or refuses each amendment. It is one pure function, used for the shadow and for the agent:
- It touches selectors only. Rights, pinned requests, ontologies and Track scope are out of reach.
- A selector must stay inside the rights of the query.
- Each shadow amendment names its model and cites at least one existing event of the same space.
- The query holds at most `maxSelectors` selectors (§12). Beyond it, the oldest shadow selector goes first. An agent selector is never evicted by the shadow. When every selector is the agent's, one more `keep` is refused.
- The same subject is the same selector: `selectorId` is the digest of what the selector matches. A `keep` of a selector already kept, or a `drop` of one already gone, changes nothing. A `drop` names its selector by that id alone: it carries no text.
- An amendment names the version its author read (`basedOnVersion`; `0` when no version existed yet). A late one is not refused for being late: the gate runs it against the current version. `keep` and `drop` each act on one selector, so two late amendments on different selectors both apply. On the same selector, the later one in journal order wins.

The gate answers with a verdict (`SessionContextGateVerdictV1`, §12): `accepted`, `no_change`, or `refused` with a reason. An accepted amendment creates the next version of the query. A refused one is noted with its reason.

### 2.4 How the agent amends it: it asks through the search tool, and the journal commits

**Choice.** The agent reads the query, and asks to amend it, through `engram_memory_search`. The tool gains one optional input, `session_context`. It ships in a `v2` revision of the six-tool profile, off by default. The search writes nothing, in any mode. The journal commits the amendment when the session notes that call.

| `session_context` | What the call does | What it writes |
|---|---|---|
| absent | Today's behaviour: current memory only (`src/mcp/memory/contracts.ts:229-235`). | nothing |
| `"history"` | Also searches the journal of this session and of earlier sessions of the same h2a role in the same space (`R15:53`). | nothing |
| `"keep"` | As `"history"`. Asks that `query` stay in the session context query as a selector. | nothing |
| `"drop"` | Asks that one selector leave the query. `query` is its `selectorId`, or its text. The amendment returned names the id only. | nothing |

Every call with `session_context` also returns the query as it stands (`session_context_query`). That is how the agent reads it. A `keep` or a `drop` also returns the amendment to note (`session_context_amendment`) and what the gate of §2.3 says of it, evaluated without writing (`session_context_verdict`).

**The path of an amendment, on its two transports.**
1. *Ask — the MCP call.* The agent calls the search with `keep` or `drop`. Nothing is stored.
2. *Note — the journal call (`/ingest`).* The noter of the session — the h2a hook, or our loop — notes that tool call, as the journal notes every tool call (`tool_result`, `S1:259-269`). It copies `session_context_amendment` from the result of the tool into the note, unchanged (`contextAmendments`, delta `S1-d`). It converts nothing: the journal reads that wire form with the codec that wrote it (§12). Every delivery path builds that note with the same code: hook, poll, flush (`S1:472-474`).
3. *Commit.* The journal call runs the gate again and commits the next version of the query. Its receipt carries the verdict.

What crosses each transport. Both obey one `D6` rule, applied by one function (§6.5): no text from another session before the content act.

| | The MCP call, `engram_memory_search` | The journal call, `/ingest` |
|---|---|---|
| Who is calling | `session_binding` in the `v2` projection (§2.6) | the same binding, as the host argument of the call (§12) |
| `keep` | the amendment returned carries the caller's own `query`: a text of this session | the note carries that amendment back, unchanged |
| `drop` | the amendment returned carries a `selectorId` and no text | the same: a reader who may not read a selector can still drop it |
| The query | returned; a selector written in another session is shown `withheld`, with its `selectorId` | not returned: the receipt lists one verdict per amendment, by `selectorId` |
| What is found | a history match from another session is a reference | a delivered item from another session is a reference |

**Before the first value exists.** Each state has one answer, and a test that reaches it.

| State | What a call with `session_context` answers | Test |
|---|---|---|
| `v2` off | `INVALID_SCHEMA`: the input does not exist | `SJ-5a` t1 |
| no binding in the invocation; or a binding, and no journal facet in engram | `UNAUTHORIZED`; or `CAPABILITY_UNAVAILABLE` | `SJ-5b` t4 |
| journal off for the workspace | the memory results, as in `v1`; no history, no query, no amendment; on `keep` or `drop`, the verdict `refused`, `journal_off` | `SJ-6b` t5 |
| journal on, nothing noted yet for that key | history as found; no `session_context_query`; the amendment names `basedOnVersion: 0`; the verdict is the gate's over an empty query | `SJ-6b` t8 |
| a query at version 1 or more | the query, and for `keep` or `drop` the amendment and the verdict | `SJ-6b` t1 |

A binding exists whether or not the journal is on (§2.6). The journal facet of engram says whether the workspace opted in. With the journal off, the journal call itself answers `CAPABILITY_UNAVAILABLE` and records nothing (§3.6).

**Why this path.** `0.1.0` promised a search that writes nothing and an answer that already carries the raised version; both cannot hold (`SJR1` `B2`). Committing at the hop, as round 1 proposed, would make a tool published `mutability: 'read-only'` change state (`src/mcp/memory/gates.ts:192-195`; `src/mcp-memory/provider.ts:228-275`, `:799-808`). Committing on the note keeps `D11` by construction: capture can be revoked without cutting recall (`R15:59`, `S1:933-937`). It keeps one journal input (`BRIEF:38`), reuses the Spec 1 idempotency key (`S1:306-309`, `S1:474`) and works on the eight hosts (`S1:472-474`). The ledger gives the five reasons in full (R1 dispositions, 6.2). What it costs: the amendment is in force at the next noted step, not inside the answer of the search. A session that is not noted cannot amend: journal off, or capture revoked. A forged amendment can only keep or drop a selector inside the rights of the query: the gate lets nothing else through.

**Why the search tool, and not capture.** The owner named it on 19/11: « si mon outil de requête est embed au premier (recherche qui porterait une query), éventuellememnt ce pourrait être l'outil permettant de modifier la requête de session contextuelle que j'ai deja demandé d'intégré » (`BRF:7`). The tool already requires `query` (`src/mcp/memory/schemas.ts:222`), bounded to 1–8,192 bytes (`src/mcp/memory/contracts.ts:261-262`): a selector is a query, and no new field has to describe it. Spec 1 already gives search the recall purpose `memory.recall.contextual/v1` (`S1:936`). `D20` asks for a memory tool: « Je vois pas comment tu gere adapte sans outil memoire » (`R15:68`); the word "seventh" came from the answer kit, not from him (`AUD:54`). Capture is the door to durable memory: it submits "an encrypted pending candidate" (`src/mcp/memory/gates.ts:219-220`), requires components, citations and evidence (`src/mcp/memory/schemas.ts:263-325`), answers `committed_pending` (`src/mcp/memory/contracts.ts:371`), and the candidate then waits for admission (`R15:52`). A selector steers one session and must act at the next step. It is not a memory.

**The schema.** The `v1` schema is closed and digest-checked (`src/mcp/memory/schemas.ts:221`, `src/mcp-memory/provider.ts:276-285`). So the parameter lives in a `v2` profile. Off, the `v1` manifest is byte-identical. On requires the engram + sentropic co-signature that `D20` and the 14/11 decision already ask (`R15:68`, `OD:84`). The `v2` schemas obey the closed dialect of the tool schemas: no `null`, every object closed, `oneOf` for a choice (`src/mcp/memory/schemas.ts:3563-3580`, `:3709-3711`; §12).

**Two limits of a call with `session_context`.**
- It is one page. `page_cursor` is refused as invalid input, and no `next_page_cursor` is issued. So the page binding is untouched (`src/memory-tools/reads.ts:113-116`). To page through memory records, the agent calls without `session_context`.
- It needs the session binding (§2.6). Without one, it is refused.

**What the agent may amend:** selectors only. It may drop any selector, its own or the shadow's. It can never widen a right, unpin a request or change the Track scope.

### 2.5 Pinned, versioned, inherited

**Pinned.** A version of the query never changes. It has a digest. Every note and every delivery names the version it used. A past step can be replayed with the exact query it had.

**Versioned.** Version 1 is created by code when the first event of a key is noted — at session start, the `mandate_binding` note (§3.5) — with the rights of that call, the scope and the ontologies known then, no pinned request and no selector. The version then grows by one when an amendment is accepted, when the owner's request changes, when the mandate, the Track scope or the registered ontologies change. Before version 1 there is no query: a search omits it, and an amendment names `basedOnVersion: 0` (§2.4). All versions are kept.

**Inherited.** The query belongs to a role at work on a worktree. It does not belong to a session id. Its key is `(tenantId, workspaceId, derivedWorktreeId, roleRef)`. This is `D5`: « meme role h2a meme espace. mais ce n'est pas assez étoffé pour avoir une vraie décision » (`R15:53`). `roleRef` is the role of the verified mandate (`S6A:331`), an open string for engram.

| Case | Session id | What the session gets |
|---|---|---|
| Compaction or clear in the same session | same | the same query, latest version; the full view |
| The CLI restarts or resumes a stored session | same or new | the same query, latest version; the full view |
| Another CLI, same role, same worktree | new | the same query, latest version, amendments included; the full view |
| Another role, or another worktree | new | another query; nothing inherited |
| No h2a role (no `roleRef`) | any | a query keyed by the session id alone; nothing inherited |

What is inherited is the query. The watermark is not: a new session holds nothing, so its first delivery is the full view (§3).

Two limits:
- The query and the stored requests stay on the machine. They take the place of the old session summary, so its rule applies to them: local by default, and a transfer needs the transfer policy of the mandate (`D10`, `R15:58`, `DOS:492`).
- Two sessions of the same role at work on the same worktree at the same time share one query: each sees the other's selectors. One worktree per lane avoids it.

This closes the gap the audit found: the old Spec 2 keyed its requests by session id and left the inheritance of amended selectors implicit (`AUD:43`).

### 2.6 Who is calling: the session binding

A query has rights. They come from facts cluster-mesh verifies, never from what a model or a request body says (`src/mcp-memory/provider.ts:6-9`). Those facts are one object, `SessionContextBindingV1` (§12): one type, owned by one package, carried on two transports. cluster-mesh builds it at each call, from what it verifies on that call. It does not read the journal to do so: with the journal off a binding still exists, and the answer can say so (§2.4). None of the carriers below is a tool argument: a model cannot set them.

| Fact | Verified from | On the MCP call | On the journal call |
|---|---|---|---|
| tenant, workspace | the verified principal and its membership (`PLAT:37-48`) | the token | the token; the envelope must agree (`S1:323-324`) |
| the h2a mandate, its digest, its role | the seven checks of `verifyMandateEnvelopeForMemoryAccess` (`S6A:386-397`); the role is the mandate's (`S6A:331`) | `params._meta['sentropic.h2a.mandate']` (`S6A:383`) | `X-Sentropic-H2A-Mandate` (`S6A:384`) |
| worktree, session | the enrolled host attachment (`S6A:224`) | `params._meta['sentropic.h2a.session']` (`new`, `SessionCallerRefV1`) | the envelope (`S1:330`, `S1:333`) |
| the reader's model | the launch receipt: an h2a envelope signed by an enrolled instance key (`new`, `H2ASeatLaunchBodyV1`) | `params._meta['sentropic.h2a.launch']` | `X-Sentropic-H2A-Launch` |
| content authorization | the policy of that tenant and workspace, for the reader's provider (§6.5) | evaluated at the hop | evaluated at the hop |
| how the binding reaches engram | — | `session_binding` in the `v2` projection, which lot `6A-S0a` already extends for the mandate (`S6A:745`); the provider copies it into `MemoryReadInvocationV1` (`src/mcp-memory/provider.ts:810-826`) | the host argument of `noteSessionEvent` (§12) |

Five rules:
- `requiredClaims` of the search tool stays `['sub', 'tid']` (`src/mcp/memory/gates.ts:188`). The broker checks those claims when it selects the tool, before the input is validated (`src/mcp-memory/provider.ts:746-760`, then `:778-782`). A condition on `session_context` cannot live there. The condition is the binding.
- cluster-mesh builds a binding in two cases only. One: the mandate verifies and carries the right `memory:context:assemble` (`S6A:394`). Two: the caller has a memory identity and sends no mandate, the unassigned case of `D16` (`S1:282-283`, `S6A:397`). That second binding has no role: the session reads its own journal and its own query, and nothing else. No memory identity (`D18`): no binding; search stays refused (`S6A:221`), and what such a session still receives is in §3.6.
- No binding, no context, on both transports. A search with `session_context` is refused `UNAUTHORIZED`. A journal call that carries `contextRequest` or `contextAmendments` is refused `UNAUTHORIZED` and records nothing — with the read-only delivery of §3.6 when the `D18` policy verifies; the same note without them is treated as Spec 1 says.
- The session carrier is a lookup key, trusted for nothing else. When cluster-mesh has seen that session noted by another caller, it builds no binding: the caller must be the mandated instance (`S6A:392`), or the verified principal of an unassigned session (`S4:440`), that noted it.
- cluster-mesh cannot see which model a third-party CLI really calls. It accepts one proof, the launch receipt, and verifies it as it verifies a mandate signature: Ed25519 over the canonical envelope, against a key that is enrolled and not revoked (`S6A:379`, `S6A:390`), with the caller as the launched seat. Not a tool argument, not a member of the envelope, not a field of the request body. No receipt, or one that does not verify: the reader is external and not authorized (§6.5), and the call goes on.

### 2.7 From the query to the view

engram evaluates a query version at a journal cursor. Same version and same cursor give the same view, item for item, and for the same reader byte for byte (§6.5). Evaluation reads committed records only. It never waits for the shadow.

Order of the view, and what gives way first when the ceiling is reached:
1. The pinned request, word for word. Never cut.
2. Decisions in scope, newest first.
3. Track scope items and their status.
4. Rules: the role and the harness rules in force.
5. What the selectors select: facts, changes, checks, plan, dead ends, dreaming recalls.
6. Pointers to what did not fit.

Three rules keep it bounded and complete:
- The view never exceeds `viewMaxTokens`. In our loop and at level C, the prompt is rebuilt at each palier, when it reaches `rebuildAtTokens` (§12). This is `D6 B`: about 18,000 tokens (`ANS:42`; `DOS:335` for the whole prompt). Both numbers are settings: « réglable ! » (`ANS:98`). A workspace sets them; a host or a run may lower them, never raise them (`proposed`).
- Decisions are never dropped in silence. Those that do not fit are counted in one pointer line: "N more decisions in scope: search with `session_context: "history"`". For the proof gates, a decision is present when it is inline or counted by that line.
- If the pinned request alone exceeds the ceiling, engram does not cut it. It delivers it and reports the overflow to the host.

The view is delivered as text, grouped by the five slices Spec 1 already has: `track`, `git`, `architecture`, `rules`, `memory` (`S1:361`, `R15:63`). Each line starts with the reference of its item. `SessionContextDeliveryV1.items` (§12) lists the same items as data, for checks and for provenance. This is `D1 A`: nodes and links in the graph, no nested container on the wire.

### 2.8 The opinion the owner asked for

On the diagram of the state and its authors he wrote: « Les notions sont un peu décorrélées des ontologies principales track / engram, ca me semblerait bien d'avoir un avis » (`ANS:73`).

Opinion: he is right, and this spec follows it. The view has no ontology of its own. Each item is a node of an ontology that already exists: Track for the request, the decisions and the items; archi for components; h2a for the role and the rules; engram for facts, recalls and the journal steps. The nine headings of the dossier (`DOS:95-105`) are only a way to read the view. They are not types. Two things exist only in a session: the agent's short plan and its dead ends. They are journal events, linked to the Track item they serve. They become Track objects only if Track accepts them. The owner can overrule this in one word; no contract changes if he does.

## 3. The diff and its watermark

### 3.1 The watermark

The watermark says what the host session still holds: `SessionContextWatermarkV1` (§12), three values — the query, its version, a journal cursor. The host keeps it: the h2a hook in its own session state, or our loop. It sends it with each note, in `contextRequest` (delta `S1-d`).

### 3.2 The rule

```
delivered = view(query now, cursor now) − held
held      = view(watermark.queryVersion, watermark.cursor)
            ∪ items whose sources are all steps of this session since its last reset
```

- The second line of `held` is why a tool that keeps its thread is not sent its own steps again (`D2 A`, `ANS:22`).
- An old item that becomes relevant, because the query changed, is not in `held`. It is delivered. This answers the objection recorded with `D1 A`: "le diff doit comparer ce que la session a à ce qu'elle devrait avoir" (`DOS:594`).
- An item the session holds that stopped being valid — a decision replaced, a fact withdrawn or erased — is delivered as one `withdrawn` line. The session stops relying on it.
- engram stores each `contextRequest` with its event, and the watermark it answered with. A delivery is never stored as content. It can always be recomputed from the stored request and the query version: the same items, and for the same reader the same bytes. Replay and dreaming rely on this.
- An implementation may cache the last delivered set. The result must equal the rule above.

### 3.3 Zero bytes

When `delivered` is empty, the receipt carries no slice payload and `contextDelivery.byteLength` is `0`. The hook prints nothing. The check is mechanical: the bytes added to the prompt are counted, and the count is zero (`DOS:361`).

### 3.4 Resets: when a full view goes out

A full view goes out in three cases only, when the model's context was emptied: a **compaction**, a **clear**, a **restart**. Everything else is a diff. This is the owner's rule, « seul le diff est transmis » (`OD:40`), and his choice `D2 A`: engram injects only what is new (`ANS:22`).

The host names the case in `reset` (§12). It may add its own name for the signal in `hostSignal`, an open string.

| `reset` | What happened | Who sees it |
|---|---|---|
| `compaction` | The CLI compacted its thread. | the host's compaction hook |
| `clear` | The context was cleared: by the user, or at a palier in our loop and at level C (§4). | the host's clear signal; the loop |
| `restart` | The CLI process started: first start, restart, a resumed session, another CLI taking over the role. | the start hook |

There is no periodic full view. `0.1.0` re-sent the whole view every 20 turns on a host with no compaction signal. That put a whole view again into a thread that still held it. The audit lists that refresh as added without request (`AUD:47`). It is removed, with its setting.

What this costs, on a host with no compaction signal (§4.4): if the tool shrinks its thread without saying so, engram sends no full view until the next clear or restart. The agent can still read the query and search the history (§2.4).

Three safety rules:
- A watermark engram cannot read is not a reset: unknown query, unknown version, cursor ahead of the journal. engram answers from its own record: `held` is what it last delivered to that session since its last reset (§3.2). A session the journal has never seen is starting: it gets the full view.
- A delivery is all or nothing. If engram cannot evaluate within the hook's deadline, it delivers nothing and the watermark does not move. The note itself is still recorded. The next note retries.
- `held` and `reset` exclude each other. A request with both, or with neither, is refused as invalid.

The compaction hook is the owner's request of 15/11: « Donc : ok poue cet option mais j ai demandé un hook pour prendre la main sur le compactage. » (`EV15:6`, `OD:45`).

### 3.5 What rides on which event

No new event kind is needed. A request rides on an event the hook notes anyway:

| Moment | Spec 1 event that carries `contextRequest` |
|---|---|
| A prompt is sent | `speech_turn` (`S1:240-258`) |
| Compaction | `context_saturation` (`S1:294-299`) |
| Session start, resume, restart, CLI switch | `mandate_binding` (`S1:276-284`): the first event of a session; it creates version 1 of the query when none exists (§2.5) |
| A clear inside the session; a step of our loop | the `speech_turn` or `tool_result` that follows |

### 3.6 When the journal is off, engram is down, or the session has no memory identity

- Journal off (the default, `OD:83`): no note, no delivery. The tool behaves as it does today. A journal call made anyway answers `CAPABILITY_UNAVAILABLE` and records nothing; a search with `session_context` says `journal_off` (§2.4).
- engram unreachable: the session continues in signalled degraded mode, with a banner (`R15:65`, `S1:487-492`). Nothing is delivered. h2a creates no second store (`S6A:412`). After recovery the hook goes on with the watermark it kept.
- No memory identity (`D18`, `R15:66`; `hasMemoryIdentity === false`, `S6A:266`): the session is not noted and receives no memory content. It still receives the non-memory slices — `track`, `git`, `architecture`, `rules` — read-only, under a recorded policy that lists the allowed slices (`DOS:494`). The seventh tool was to carry them (`S6A:223`, `S6A:396`); there is none. The journal call carries them. cluster-mesh verifies the signed policy of Spec 4, `.h2a/policies/d18-readonly-slices.v1.json` (`verifyH2APolicyEnvelopeV1`, `S4:937`), takes the intersection Spec 4 defines (`S4:968`) and passes the result as a host fact of the call (`readOnlyPolicy`, §12). engram records nothing. The Spec 1 result of the call is the refusal of today, with its type and its code (`S1:481`). Beside it, the outcome of the call carries `readOnlyDelivery`, a `SessionReadOnlyDeliveryV1` (§12, delta `S1-k`): the diff of the allowed slices against the watermark the host sent, or all of them after a reset. The hook prints it and reports no error. No verified policy: nothing is returned. The query of such a session is computed, never stored: rights from the policy, no pinned request, no selector.

### 3.7 How far the shadow is

A delivery says through which step the shadow has read the journal: `annotatedThroughOrdinal` (§12), absent while it has read nothing. When the shadow is late, the view is still complete for what code writes. The owner check is `DOS:347`.

## 4. Keeping the same session: clear, re-feed, and the fallbacks (`D4 C`)

### 4.1 The rule

The owner amended option C in two comments.

> « Si on arrive a garder la session mais juste "clear" le contexte et le nourrir, ca me va, mais a voir si l'expérience utilisateur peut être maintenue (ne l'utilisateur lui doit pouvoir remonter. Sinon fallback possible B ou même A. » (`ANS:78`)

> « Vraiment, ce ne doit pas être une session "neuve" juste avec un contexte "vidé" (et complété par engram). si pas possible, l'UX sera affreuse, et le suivi des session meme en sécurité (trop de split pour suivre des pb). » (`ANS:83`)

So: h2a never closes, replaces or splits a session to shrink its context. One session keeps one id, one audit trail and one scrollback.

### 4.2 The levels

A level is a setting of one session, held by h2a. engram only sees whether `contextRequest` is present.

| Level | What happens | Source |
|---|---|---|
| note only | Steps are noted. Nothing is injected. | `D3 A` stage 1 (`ANS:25`) |
| diff (default) | The tool keeps its thread. engram injects the diff. After a reset, the diff is the full view. | `D2 A` (`ANS:22`, `DOS:44`) |
| A | As diff. At compaction the hook also dictates the tool's summary from the view. | `DOS:163` |
| B | As A, plus what the hooks allow without clearing: tool outputs summarized before they enter the thread, an earlier compaction threshold. | `DOS:164` |
| C | As B, plus: at each palier the model's context is cleared **inside the same session** and re-fed with the view. | `DOS:165` as amended by `ANS:78`, `ANS:83` |

Summarizing a tool output before it enters the thread is the owner's « rtk par engram » (`ANS:68`). The full output is noted first. The summary keeps every error line and a pointer to the full output. At level B this is done where the host has a hook that reworks a tool output: Claude Code and Mistral Vibe today (`DOS:141`, `DOS:147`). The other way he allowed, « quitte a proxifier les appels outils » (`ANS:68`), is not built for third-party tools by this spec: it has no lot. In our own loop the loop runs the tools itself, so it is that proxy (§5).

### 4.3 What opens level C on a host

Three facts, tested on that host, on the installed version:
1. The session id is the same before and after the clear.
2. The user can still scroll up to the turns that preceded the clear.
3. The prompt sent after the clear is under the ceiling.

If one fails, or was never run, the host stays at B, or at A. h2a shows a banner with the level in force. A level never opens before its replay gate (§9).

### 4.4 Per host

What each tool's hooks allow comes from the dossier's table (`DOS:139-148`). It was read in documentation. No hook was run: every row is `unverified` in operation (`DOS:137`, `DOS:550`).

| Host | Clear and re-feed in the same session? | Highest level today | Then falls back to |
|---|---|---|---|
| Claude Code | No hook clears the context. The tool compacts only from 100,000 tokens (`DOS:141`). | B | A, then diff |
| Codex | Maybe: the summary instruction and the threshold are set by configuration (`DOS:142`). A short threshold is `unverified` (`DOS:552`). | C if the three facts hold; else B | B, then A |
| OpenCode | Maybe: a plugin may change the messages before each request; the interface is marked "experimental" (`DOS:143`). Replacing the whole list is `unverified` (`DOS:553`). | C if the three facts hold; else B | B, then A |
| Gemini CLI | Maybe: the context can be cleared after each turn (`DOS:144`, `DOS:514`). The two analyses diverge (`DOS:157`). | C if the three facts hold; else B | B, then diff |
| Antigravity CLI | No: injection before each model call, no compaction event (`DOS:145`). | diff | note only |
| Hermes | Only through a Python module (`DOS:146`, `DOS:515`). The zero-Python rule excludes it (`DOS:338`). | diff | note only |
| Mistral Vibe | No: it can only rework a tool output (`DOS:147`). | B, limited to tool outputs | diff |
| Muse | `unverified` on every point (`DOS:148`, `DOS:551`). | note only | — |

Antigravity CLI and Mistral Vibe have no compaction signal (`DOS:145`, `DOS:147`): the limit of §3.4 applies to them. Whether the owner keeps Gemini CLI (`DOS:157`) changes nothing here: the tool stays at its level until he says otherwise.

### 4.5 A clear the user types himself

If the user clears the context with the tool's own command, that is his act. The hook re-feeds the view at the clear signal. If the tool gives the session a new id on that act (`unverified`), the query is inherited anyway (§2.5), and the hook notes the link from the old id to the new one. It is not a breach of §4.1.

## 5. Our own CLI loop (`D5 A`) — `proposed` until the agentic-loop dossier settles

The owner, on option A and on its diagram:

> « stp ne doit être qu'un pretexte, pas un vrai binaire. stp = h2a run stp par exemple
> Attention rejoint le dossier de boucle agentique - on souhaite se rapprocher d'une boucle davantage a la claude (stop-reason) qui serait probablemnt branchée sur l'objective loop. » (`ANS:88`)

> « stp attention je pensais que c,était abandonné
> chat-core attention ca migre sur le design system, mais y aura certainemetn une nouvelle lib pour la boucle agentique » (`ANS:93`)

What this spec fixes, and nothing more:
1. **The loop is the dossier's, not ours.** The burst loop, its budget rules and its receipt belong to the agentic-loop dossier (`ALV2:434-492`). This spec defines no loop, no receipt and no stop-reason type.
2. **engram is an adapter under it.** At each micro-step the loop notes the step with the same Spec 1 call and receives the diff. engram exports one pure function that assembles the context of the step: the mandate and the pinned request, the view, the trailing results since the last rebuild, and what triggers the step (`DOS:117-124`). The loop keeps no thread. This is the same protocol as a third-party hook.
3. **The receipt is `StepReceipt`, unchanged** (`ALV2:396-410`). engram's part for each `terminalReason` (`ALV2:399`):

| `terminalReason` | What engram does |
|---|---|
| any | The last step was noted before the receipt was issued. |
| `end_turn`, `max_steps`, `steered` | The next outer turn starts with `reset: 'clear'`: a fresh view (`ALV2:492`). |
| `budget_exhausted`, `blocked`, `policy_blocked_taint`, `in_doubt_effect` | Nothing more. Halting is the objective loop's decision; "refs win for closure" (`ALV2:415`). |
| `lost` | Nothing to note. The next start sends `reset: 'restart'`. |
| `context_erased` | The next view is rebuilt without the erased records (`ALV2:432`). |

4. **No `stp` binary, no chat-core, no loop engine in h2a.** `h2a run stp` starts the loop (`ANS:88`). h2a launches and bridges; it does not host the loop: option C of the dossier, "La boucle dans h2a" (`DOS:193`), is not the one he chose (`ANS:33-36`). The dossier still places its burst machine in chat-core (`ALV2:967`); the owner's later answer wins (`ANS:93`). The home of the loop library is the dossier's to settle.
5. **Track scope from the objective loop.** `trackScope` copies the loop's Track references (`H2ALoopTrackRef`, h2a `packages/h2a/src/runtime/loop/index.ts:49-64`, read at the pin by `SJR1`). A decision gate travels as an id and a digest. Its content stays h2a's (`H2ALoopDecisionGate`, same file `:87-103`); the dossier plans its shared mirror elsewhere (`ALV2:968`). The host states the loop in `contextRequest.loop` (§12).
6. **Failures** (`DOS:339`). Shadow down: the view is built without a model, and a banner says so. Local store down: the loop changes nothing more, keeps what is needed to replay, then stops. It never falls back to a second thread (`DOS:350`).
7. **Not the default runner** before the full proof of §9.3 (`ANS:60`).

## 6. The shadow and the annotation service

### 6.1 Three authors (`D7 A`)

`ANS:48`, `DOS:258`:

| Author | Writes | How |
|---|---|---|
| Code | the pinned request, settled decisions, file changes, check results, pointers | copies; no model |
| Shadow | the past: facts, proposed decisions, links; and amendments to the query | a small model, after each step, never blocking the tool (`DOS:83`) |
| Main model | its plan and the condition that ends the work | in its own turn: at each handover in a third-party tool, at each step in our CLI (`DOS:258`) |

- Every item written by a model names that model and cites the event it comes from (`DOS:91`).
- When two authors disagree, both items stay and the disagreement is shown. It is never settled in silence (`DOS:252`).
- The plan is a block of the model's turn with a fixed marker. Code copies it and cites it (`planCitation`, delta `S1-b`). No tool call and no second model are involved. The marker is fixed by lot `SJ-12`.

### 6.2 Configurable (`D7A`)

> « Réglable:
> shadow désactivable le cas échéant avec une heuristique le cas échéant ou un model finetuned/Gliner 2.5, ou  avec un  mécanisme d'apprentissage / RL » (`ANS:103`)

`AnnotationRoutePolicyV1.mode` (§12) has five values: `llm`, `heuristic`, `finetuned`, `rl`, `off`. Every mode goes through the same gate (§2.3). With `off`, no model is called between two steps and the view is still built (`DOS:346`).

A fine-tuned or learned model is a pinned artifact, checked by digest and run from Node. Nothing in our repositories or CI runs Python. How such an artifact was built upstream is `unverified`.

### 6.3 One service, two uses (`schema-10`)

The owner asked for it on 15/11: « Mais faut deja prevoir de base l annotation tierce. Celle ci sera aussi bien pour le mode dreaming que direct. Avec bascule auto llm mesh de model d annotation. » (`EV15:12`). He confirmed it: « oui ok ! la différence pour le dreaming, c'est qu'on utilisera potentiellement un modele plus frontière, peut être toujours non raisonnant » (`ANS:113`).

- `direct` annotates each step. It uses what Spec 1 has: `SessionExtractionStrategyPort` (`S1:519-523`).
- `dreaming` annotates a batch. It uses what Spec 3 has: the drafter port and its execution in cluster-mesh (`S3:771-772`).
- One host adapter in cluster-mesh serves both. It reads one policy, `AnnotationRoutePolicyV1` (§12), with one ordered list per use. The dreaming list may name a more frontier model.

### 6.4 The ordered list and the switch (`D8 A`)

- The list is the owner's, in his order. A model that fails is skipped and the next one takes over, with no human act (`ANS:54`, `DOS:359`). llm-mesh already has ordered candidates and sets a failed one aside (`DOS:276`).
- No untested model feeds a context (`ANS:54`). A model may annotate the journal before it is qualified. It feeds a view only after its replay gate (§9.2), when it is listed in `qualified`.
- If every model fails, the view is built without a model, with a banner. The main model is never used as a stand-in (`DOS:286`).
- One account only: « B en fall back quand l'utilisateur h2a (ou sentropic) n'a qu'un compte disponible. » (`ANS:108`). Option B is "Même fournisseur que l'outil d'abord" (`DOS:287`): the shadow starts with a small model of the provider of the session's tool. The policy names that model per provider (`singleAccountByProvider`, §12). It is used when one account only is ready, and it obeys the rule above like any model.
- **The order itself was never given.** The owner gave examples: « (genre modele ember low ou luna 6 low ou haiku 5.5 low ou gemini 3.8 flash low ou un autre low dans mistral) » (`EV15:10`). The dossier asked for "la liste et son ordre" (`DOS:297`; asked again at `DOS:419`). His answers hold none (`ANS:51-56`, `ANS:104-108`). This is open point `OP-1` (§11). Until he answers, the two lists and the per-provider map are empty: the service runs without a model, and tests use fixtures.

### 6.5 Who may receive text (`D6`)

`D6`: without content authorization, "only a path and its fingerprint may be sent to the external model" (`R15:54`). The authorization is a separate act, at commissioning (`DOS:273`).

| Reader | Content of the session itself | Content from other sessions, and dreaming recalls |
|---|---|---|
| The shadow and dreaming models | references only, until the act (`DOS:490`) | references only, until the act |
| The session's main model, external | text | references only, until the act covers its provider |
| A model that runs on the owner's machine | text | text |

- This is the ruling given for this spec: `D6` applies to the main model for content from other sessions; the session's own content stays inline. The old Spec 2 exempted the main model for everything, which review round 3 blocked (finding `X1`, `REV3:102`).
- Who the reader is comes from the session binding (§2.6): `reader_model_ref`, `reader_is_local`, `reader_content_authorized`. A reader engram cannot name is external and not authorized. One function in engram applies this table, on the journal call and on the search alike (lot `SJ-2c`).
- The act does not lift the two other screens. Text sent to an external model still passes the confidentiality deny-list (`D7`, `R15:55`) and the PII armor with bounded extracts (`D8`, `R15:56`, `DOS:491`), as Spec 1 defines them (`S1:884-894`).
- A reference is a path or a record id, and a fingerprint. The agent can open a file reference with its own tools.
- Before the act, a session resumed on another CLI gets the full structure of its view, and references for what earlier sessions said. It gets the text once the act covers that provider.
- Text that comes from another session is delivered as quoted data, clearly marked. It is never an instruction.
- The policy is `ModelContentAuthorizationPolicyV1` (§12). Its default is closed. cluster-mesh evaluates it at each call and puts the result in the binding (lot `SJ-7f`); engram never reads the policy itself.

## 7. Dreaming

Dreaming is kept. Its rules stay in Spec 3: the cadences, the local and remote placement (`S3:124-129`, `OD:24`), the two-tier lessons and their threshold (`S3:352-353`, `R15:74`). This spec needs five things from it, written as deltas in §8.2.

1. **What feeds it.** The journal of Spec 1, and the record of what each session was given (§3.2). Dreaming no longer reads a prose summary (`S3-i`).
2. **When it fires.** The mid-day and saturation triggers no longer wait for a session summary. They count journal activity (`S3-j`, `S3-k`).
3. **How it knows a fact was forgotten.** Today: absent from the last 8 "context packs" of a container that no longer exists (`S3:546`). After: absent from the last 8 deliveries of the session (`S3-e`).
4. **What it returns to the session.** A recall is a permanent, accepted record. It enters the `memory` slice of the next diff as one item, `authoredBy: 'dreaming'` (`S3-d`). This is `D23`: « Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. » (`R15:71`). A lesson drafted by a model reaches no session before its measured threshold (`S3:353`).
5. **Which model it uses.** The single annotation service of §6.3, with its own list (`S3-h`).

## 8. Cross-spec deltas

The sibling specs are not edited by this lot. Each row says what their author changes. These rows replace the deltas of the old Spec 2 (`OLD2:1592-1847`). In round 1 each sibling spec was read line by line for the names this spec withdraws; the lines found are in the rows, with those round 2 added (`SJR2` `m2`).

### 8.1 Spec 1 — session front

| # | Lines | Before | After |
|---|---|---|---|
| `S1-a` | `S1:196-198`; used at `:243`, `:261`, `:296` | `hostId: CliHostId`, a closed list of eight CLIs | `hostId: string`, checked against h2a's host registry at the cluster-mesh hop. `CliHostId` stays as the list of the eight known CLIs. Our own loop is one more caller. |
| `S1-b` | `S1:240-258` | a `speech_turn` carries `sessionCitation` and `boundedTurnText` | adds the four optional fields of `SpeechTurnJournalFieldsV1` (§12). The full text stays in `session-db` (`S1:152`); engram cites it. |
| `S1-c` | `S1:259-269` | a `tool_result` carries name, id, success, exit code, significance, citation, touched files | adds the two optional fields of `ToolResultJournalFieldsV1` (§12). With `S1-b`, this is the owner's point: « l'étape doit bien stocker le prompt, les étapes de réflexion, les appels outils et leur contexte complex » (`ANS:68`). |
| `S1-d` | `S1:319-349` | the envelope has no context member | adds the two optional members of `SessionJournalEnvelopeFieldsV1` (§12): `contextRequest` and `contextAmendments`. engram stores them with the event. `contextAmendments` is accepted only on the `tool_result` note of an `engram_memory_search` call; it holds what that call returned, in the tool's wire form. |
| `S1-e` | `S1:351-373`; comment at `:365` | `readySlices` and `readySlicePayloads` give the ready slices; the comment waits for "the 7th MCP tool" | when `contextRequest` is present, the payloads hold only what the session does not hold (§3). Adds the optional members of `SessionJournalReceiptFieldsV1` (§12). The words about a 7th tool go. |
| `S1-f` | `S1:408-429` | an extraction batch carries candidates | adds the optional member of `SessionExtractionBatchFieldsV1` (§12). The extraction receipt lists one verdict per amendment (`SessionExtractionReceiptFieldsV1`). |
| `S1-g` | `S1:476`, `S1:478`; lot `1-E1` at `S1:1663`; `OQ-S1-1` at `S1:1703`, `S1:1705` | a rolling `session_summary` at 24 turns or 65,536 bytes | removed from the rule, the lot and the resolved question. The view replaces it (`DOS:336`). The palier setting of §2.7 replaces the two thresholds. |
| `S1-h` | `S1:466-483` | no default-off rule | adds one rule: the journal is off until the workspace opts in (`OD:83`). Off, the journal call records nothing, delivers nothing and answers `CAPABILITY_UNAVAILABLE`. |
| `S1-i` | `S1:369` | `h2aProactiveRoleAnalysisQueued: boolean` | adds optional `pendingProactiveRoleProposalId` (`SessionJournalReceiptFieldsV1`, `proposed`): a hook fetches a role proposal when one is ready, without polling (`S4-e`). |
| `S1-j` | `S1:91`, `S1:170-171`, `S1:480`, `S1:936`, `S1:1367`, `S1:1439`; comment at `S1:222` | `engram_memory_context` and Spec 2 are named as the consumer of Spec 1 records and the reader of session history | this spec is the consumer. History is read through `engram_memory_search` with `session_context` (§2.4). Context reaches a session through the delivery (§3). |
| `S1-k` | `S1:481` | a session without a memory identity is refused and "receives only the allowed non-memory slices"; no transport is named | the refusal stays, with its type and its code, and records nothing. When the envelope carries `contextRequest` and cluster-mesh verified the recorded policy, the outcome of the journal wrapper (`S1-n`) carries `readOnlyDelivery` beside that unchanged result (§3.6). Nothing is attached to `MemoryErrorV1`. |
| `S1-m` | `S1:893` | `context_log` and `context_summary` stay local by default (`D10`) | the same rule covers the session context query and the stored requests, which replace the summary (§2.5). |
| `S1-n` | `S1:459-463`; lot `1-S1a` at `S1:1682` | the route calls `recordSessionEvent` of `EngramSessionIngestFrontPort` | the route calls `noteSessionEvent` of `EngramSessionJournalPortV1` (§12), the one wrapper around that port: the same envelope, the same key, the same single commit, and beside the envelope the host facts cluster-mesh verified. The port and its two signatures do not change: `Result<RawSessionEventReceipt>` and `MemoryErrorV1` stay as they are (`engram-memory/dist/contracts/index.d.ts:81-95`). Called alone, `recordSessionEvent(envelope)` is that call with no host fact. It is not a second journal input. |

Unchanged and reused as they are: the port and the route (`S1:459-463`, `S1:472`), the receipt's `cursor` (`S1:355`), the idempotency key (`S1:306-309`), the degraded modes (`S1:487-492`), the capture and recall purposes (`S1:933-937`). Delta `S1-l` of `0.1.1` is withdrawn: the reader's model no longer rides in a payload (§2.6).

### 8.2 Spec 3 — dreaming

| # | Lines | Before | After |
|---|---|---|---|
| `S3-a` | `S3:13` | depends on Spec 2 for the "`engram_memory_context` seventh MCP tool" | depends on this spec. Recalls reach a session through the diff (§3) and through `engram_memory_search` (§2.4). |
| `S3-b` | `S3:110` | "recall-boost index rows consumed by `engram_memory_context`" | consumed by the evaluation of the session context query (§2.7). |
| `S3-c` | `S3:131`, `S3:161`, `S3:524-529`, `S3:537-540` | the five trigger literals must match a Spec 2 wire field; `projectedContextTrigger` exists for that | the wire field is gone. `source_trigger_kind` is enough. `projectedContextTrigger` and its projection rule go. |
| `S3-d` | `S3:503-507` | dreaming fills only "the `mission_focus_context.dreaming_recalled_facts` slot of the seventh MCP tool" | a recall is one item of the `memory` slice of a delivery, `authoredBy: 'dreaming'` (§12). |
| `S3-e` | `S3:546` | forgotten = absent from "the delivered `mission_focus_context` across the trailing" 8 step context packs | forgotten = absent from the last 8 deliveries of the session, recomputed from the journal (§3.2). |
| `S3-f` | `S3:550-564`; lot `3-E3` at `S3:1022` | the exact wire shape of `dreaming_recalled_facts[]` and a class weight of `2.10` | removed with the container. Order inside the view follows §2.7. The weight is not carried over: the audit lists it as added without request (`AUD:85`). |
| `S3-g` | `S3:566-568` | no summary text without content authorization; no recall without memory identity; a withdrawn record invalidates open page handles of Spec 2 | the first two are kept: a recall is content from outside the session, a reference until the act (§6.5). For a withdrawn record, the session that held the recall gets one `withdrawn` line (§3.2). |
| `S3-h` | `S3:771-772`, `S3:785` | a dreaming-only model path; the content policy is anchored to "Spec 2 §4.2 :835-846" | the host adapter of §6.3 serves it and reads `AnnotationRoutePolicyV1.dreaming`. The policy anchor becomes §12 of this spec. |
| `S3-i` | `S3:12`, `S3:124-126`; `S3:660` | the passes read `session_summary`; Spec 1 is cited for its "`session_summary` compaction"; workstation-local `context_summary` and context logs stay excluded unless transferred (`D10`) | the passes read the journal and the stored requests (follows `S1-g`). The `D10` rule of `:660` covers the session context query and the stored requests (as `S1-m`). |
| `S3-j` | `S3:269` | `mid-day` fires when "at least one `session_summary`" (24 turns or 65,536 bytes) or one closed session was recorded since the last cursor | the same numbers, counted on the journal: 24 noted turns, or 65,536 bytes of noted turn text, or one closed session since that cursor. |
| `S3-k` | `S3:273` | `context-saturation` fires "immediately **after** Spec 1's synchronous `session_summary` compaction + extraction sweep" | it fires once the `context_saturation` event is recorded and the extraction sweep is scheduled (`S1:370-371`). Its hysteresis guard is unchanged (`S3:274`). |
| `S3-l` | `S3:288`, `S3:353` | catch-up never delays "interactive `engram_memory_context`"; nothing drafted reaches "`engram_memory_context`" before the threshold | catch-up never delays a delivery on the journal call (`D15`). Nothing drafted reaches a delivery or a search result before the threshold. |
| `S3-m` | `S3:27`, `S3:57`, `S3:70`, `S3:808-926` (rows quoted at `:837`, `:858`, `:901`, `:923`), `S3:1005`, `S3:1016`, `S3:1024`, `S3:1029-1030`, `S3:1049-1050`, `S3:1065`, `S3:1105` | lot `3-E5` folds its documentation after Spec 2 lot `2-E5`, and `:1105` grounds a `Before` state on it; its blocks quote rows `E6` and `R15-C` on a "default-disabled seventh MCP tool"; lots wait for Spec 2 lots `2-E3`, `2-H1`, `2-S1a`, `2-S1b` (`3-S1a` and `3-S1b` at `:1049-1050`, `3-H1` at `:1065`; `:57` names `2-S1a`/`2-S1b` as the source of `ModelContentAuthorizationPolicyV1`) | the Spec 2 lots no longer exist. `3-E5` rebases on the files as they are on disk; rows `E6` and `R15-C` name this spec and no seventh tool. A lot that waited for a Spec 2 lot waits for the lot of §10 that gives what it needs: deliveries recomputed from stored requests (`SJ-2a`), the disclosure rule (`SJ-2c`), the content policy and its evaluation (`SJ-7f`), the annotation service (`SJ-9`), the h2a hook (`SJ-4`). |

Unchanged: the cadences and the placement (`S3:124-129`), the two cursors (`S3:793-795`), the two tiers and their threshold (`S3:352-353`), the `Point 6A` guard (`S3:111`), the `D18` no-op of the trigger client (`S3:260`).

### 8.3 Spec 4 — h2a roles and harness overlays

Spec 4 froze four points on the old Spec 2 (`S4:32-35`). Each gets its answer.

| # | Lines | Before | After |
|---|---|---|---|
| `S4-a` | `S4:16-17`, `S4:25`, `S4:37` | the Spec 2 dependency is frozen, and the session-front transport waits for the dossier; "Hard Spec 2 Freeze Rule" | the freeze and the wait end. The dependency is this spec. `engram_memory_context` is withdrawn. |
| `S4-b` | `S4:32`; marked blocked at `S4:88`, `:135`, `:138`, `:140`, `:166`, `:297`, `:438-439`, `:447`, `:611` | full role and harness-rule snapshots at each turn through `engram_memory_context`, or diffs; every projection is "Blocked on the owner's dossier (Spec 2 frozen)" | diffs, and unblocked. The role, its allowed activities and the harness rules in force are items of the `rules` slice: full after a reset, the difference otherwise (§3). `roleConsciousnessSlice` and `harnessEffectiveRules` name what Spec 4 computes; they are not wire containers. |
| `S4-c` | `S4:33` | a flat window of 32 raw events, or a second session-graph logger | one journal. Role detection reads the same Spec 1 events. There is no second logger. |
| `S4-d` | `S4:34` | the full mandate envelope and full overlay snapshots across sessions, or a diff | the mandate is verified at the cluster-mesh hop. The query keeps its digest (`mandateDigest`, §12). Full snapshots stay for the Git-committed overlays only. |
| `S4-e` | `S4:35`; gated at `S4:48-49`, `:296`, `:318`, `:441`, `:715`, `:913`, `:915`, `:932`, `:936`, `:951` | pull polling on `GET /memory/v1/h2a/proactive-role-proposals`; the lots wait for the dossier (`F3`) | no polling, and the wait ends. The receipt says when a proposal is ready (`S1-i`). The hook then calls that route once. |
| `S4-f` | `S4:380`; used at `S4:312`, `:938` | an interim gate `MemoryModelContentAuthGateV1` with `contentAuthorized` and `policyDigestSha256` | it becomes `ModelContentAuthorizationPolicyV1` (§12), which keeps both field names. |
| `S4-g` | `S4:916`; named at `S4:47`, `:923` | lot `4-E4b` wires the two slices into `engram_memory_context`; blocked | lot `4-E4b` gives the items of the `rules` slice to the evaluation of the view (§2.7). It is unblocked and depends on `SJ-1c`. |
| `S4-h` | `S4:510`, `S4:579`, `S4:624`, `S4:952`, `S4:967-968` | the signed policy `.h2a/policies/d18-readonly-slices.v1.json` is checked; its runtime consumption by `engram_memory_context` is blocked | it is consumed by the read-only delivery on the journal call (§3.6, `S1-k`). The allowed slices stay the intersection defined at `S4:968`. |
| `S4-i` | `S4:535` | the `derivedWorktreeId` grammar waits for an alignment with Spec 2 | aligned: this spec uses Spec 1's identifier unchanged (`S1:326-330`). |

### 8.4 Spec 6A — cluster-mesh access and MCP wiring

| # | Lines | Before | After |
|---|---|---|---|
| `S6A-a` | `S6A:16`, `S6A:53`; also `S6A:63`, `:72`, `:79`, `:81`, `:119` | downstream is Spec 2, which owns the semantics of a seventh tool, built disabled, "then switched on per CLI host with a fixed end date" | downstream is this spec. No seventh tool. What is built now and disabled: the journal (`OD:83`) and the `session_context` parameter. No end date per host (`OD:82`). |
| `S6A-b` | `S6A:522-531`, `S6A:533-608`; announced at `S6A:96`, `:212` | §4 "The Seventh Tool": its name, its descriptor, its envelopes, `CONTEXT_MAX_PACK_BYTES` | all removed. In their place: a `v2` revision of the six-tool profile in which only the input and output schemas of `engram_memory_search` change (§2.4, §12). The outer result envelope is untouched (`src/mcp/memory/contracts.ts:437-456`). |
| `S6A-c` | `S6A:610-618`; claim injected at `S6A:394`, `:468`, `:480` | a descriptor for the seventh tool, with `requiredClaims: ['sub', 'tid', 'h2a_context_mandate']` | no descriptor. No tool requires that claim: `engram_memory_search` keeps `['sub', 'tid']` (`src/mcp/memory/gates.ts:188`). The claim keeps its meaning — the mandate verified with `memory:context:assemble` — and becomes one of the two cases in which cluster-mesh builds the session binding (§2.6). |
| `S6A-d` | `S6A:623-630` | eight guards assert six tools | unchanged. There are six tools in `v1` and in `v2`. |
| `S6A-e` | `S6A:634-638`; flag at `S6A:449-455`, `:137`, `:141`, `:146` | gate 1: the flag `contextToolsEnabled` hides a seventh tool; gate 2: co-signature for a 7-tool `v2`, its contract "in `Spec 2 §2.6`" | gate 1 is the `v2` profile switch, off by default; `tools/list` shows the same six tools in both; off, the `v1` manifest is byte-identical. Gate 2 is kept for that `v2`: engram + sentropic co-signature and `MCP-L5` (`R15:68`, `OD:84`). The receipt contract is the one stated at `S6A:638`; its home is now Spec 6A. |
| `S6A-f` | `S6A:639-656`, `S6A:788-790` | gate 3: `ContextToolHostSwitchoverPolicy` with a mandatory `switchoverEndDateUtc`; then "legacy linear-transcript fallback on switched hosts is retired" (`:656`) | the policy and its end date are removed (`OD:82`). Third-party tools keep their thread. Every host lists the same six tools; none is masked. The level of a host is a session setting (§4.2). One part of gate 3 stays: h2a's `validateBridgeLock` and `normalizeConfiguration` admit `sentropic.engram.memory-wire/v2` (`S6A:629`, `S6A:640`), without `contextToolSwitchover` (lot `SJ-7d`). |
| `S6A-g` | `S6A:737`; `S6A:223`, `S6A:396` | test 2 of lot `6A-E1`, the endpoint table and the `D18` rule name `engram_memory_context` as what serves the non-memory slices | the name and its table row go; the test stands for search and get. The non-memory slices of `D18` are served by the read-only delivery on the journal call (§3.6, `S1-k`). |
| `S6A-h` | `S6A:738`, `S6A:753`; waiting lots at `S6A:739`, `S6A:761` | lots `6A-E2` (envelope of the seventh tool) and `6A-S4` (its activation), each with its tests and its gate | replaced, and every test and gate is kept or retargeted. `6A-E2`: test 1 → `SJ-5a` t1 and `SJ-5c` t6; test 2, the co-signature at the provider preflight → `SJ-5a` t7 and `SJ-5c` t2; test 3, the envelope of the tool → withdrawn with the tool; its guard on the root export → `SJ-5c` t6. `6A-S4`: test 1 → `SJ-7b` t1–t3; test 2 and its gate `make memory-mcp-qualify`, the `MCP-L5` qualification → `SJ-7b` t4 and the gate of `SJ-7b`. A lot that waited for `6A-E2` waits for `SJ-5c` (`6A-E3`); one that waited for `6A-S4` waits for `SJ-7b` (`6A-H3`). |
| `S6A-i` | `S6A:745`; `S6A:616` | lot `6A-S0a`: the `v2` projection carries the verified claims and `h2a_mandate`; test 2: the seventh tool requires three claims and is omitted when disabled | the `v2` projection also carries optional `session_binding` (§12), a type the platform declares (lot `SJ-7a`). cluster-mesh builds it from the carriers it reads in `callContext.meta` and in the headers, beside the mandate carrier (lots `SJ-7c`, `SJ-7f`). Test 2 becomes: a call with `session_context` and no binding is refused; with `v2` off it is refused as invalid input. |
| `S6A-j` | `S6A:761` | test 2 of lot `6A-H3`: one "7-tool `v2` surface", masked per host | every host lists six tools; with `v2` on, `session_context` is accepted on every host. |
| `S6A-k` | `S6A:410` | a `degraded` field on the seventh tool's envelope | dropped. In degraded mode a `session_context` search answers from the local store, like any read. |
| `S6A-l` | `S6A:74`, `S6A:283`, `S6A:392` | `context_summary` is one of the metamodel classes that cross cluster-mesh; moving it to another machine needs the transfer grant of the mandate (`D10`) | the class stays in the Spec 0 list. What it carries is the session context query and the stored requests, which replace the summary (follows `S1-g`, `S1-m`; same rule as `S3:660`). The transfer rule of `:392` covers them. |

Not covered here: the matching edits to `spec/SPEC_MEMORY_MCP_V2.md`. They belong with the co-signature dossier (§11).

## 9. Proof gates

### 9.1 Three mechanical checks, with no tolerance

From the dossier (`DOS:308`):
1. The owner's current request and each of his noted decisions are in the view. A decision is in the view when it is inline or counted by the pointer line of §2.7.
2. No view and no prompt exceeds its ceiling.
3. Each item written by a model cites a raw event that exists.

### 9.2 Gate A — replay first (`D9 C`)

`ANS:60`, `DOS:318`: replay for the third-party option, full proof for our CLI.
- The journal of stage 1 records the owner's sessions. Measurement can start before any hook replaces a context (`DOS:307`).
- A replay cuts a recorded session at several points and builds the view at each. A model that sees only the view is asked for its next action, and for answers the journal knows: what was decided, changed, failed, what remains (`DOS:311`).
- Gate A opens one level on one host (§4), and qualifies one shadow model to feed a context (§6.4). It runs the three checks of §9.1 at every cut.
- The numeric thresholds are the owner's to set when the first measurements exist (`DOS:312`).
- Search in the journal is lexical. The paper relies on exact search: gate A tests it (`DOS:462`).

### 9.3 Gate B — full proof before our CLI is the default

Gate A, plus real tasks with an automatic verdict, plus a pilot (`DOS:318`). Until it passes, our loop is not the default runner.

### 9.4 What the owner will see

Each row of the dossier's table (`DOS:345-363`) has a named check.

| His words (`DOS` line) | How it is shown | Lot, test |
|---|---|---|
| « engram devienne le relai de ce type de strategie » (`:345`) | In our CLI each prompt is the request, the view and the last result. | `SJ-18` t1 |
| « remplacé mecaniquemenr » (`:346`) | Shadow off: the prompt is still built, with no model call between two steps. | `SJ-1b` t4, `SJ-10` t4 |
| « appui par llm shadow » (`:347`) | Each shadow item names its model and its raw fact; the delivery says how far the shadow is. | `SJ-10` t1, t3 |
| « la taille du contexte » (`:348`) | Step 500 has the ceiling of step 1. | `SJ-1c` t2, `SJ-12` t2 |
| « dans toutes les cli en ooption » (`:349`) | On each tool the option is set per session; off, nothing changes. | `SJ-4` t1, `SJ-8` t4 |
| « la notre uqi reposera exclusivement sur engeam pour le contexte » (`:350`) | Our CLI keeps no thread; engram stopped, it stops, with no second thread. | `SJ-18` t3 |
| « Il ne doit jamais y avkir de relve » (`:351`) | A new session, same role and space, resumes with no hand-written summary. | `SJ-8` t1 |
| « L envoi au llm ne devrait pas envoyer de vieux contexte » (`:352`) | In our CLI nothing older than the last rebuild is in the prompt. | `SJ-18` t1 |
| « on garde l historique de texte en query via le graph memoire » (`:353`) | A passage of a closed session is found by search. | `SJ-5b` t1 |
| « un hook pour prendre la main sur le compactage » (`:354`) | After a compaction the request and every noted decision are back in the tool's thread. | `SJ-1b` t3, `SJ-4` t3 |
| « un hook pour remplacer le contexte en option » (`:355`) | Option on, where the tool allows it: step 500 has the ceiling of step 1. Off: nothing changes. | `SJ-12` t2 |
| « resumé graph des faits marquants » (`:356`) | For a session he reads the view and sees the raw fact behind each item. | `SJ-11` t2 |
| « de base l annotation tierce » (`:357`) | From stage 1 each noted step gets its annotation, with the model's name. | `SJ-9` t4, `SJ-10` t1 |
| « aussi bien pour le mode dreaming que direct » (`:358`) | One service annotates a step and a dreaming batch. | `SJ-9` t4 |
| « bascule auto llm mesh » (`:359`) | The first model is cut; the shadow goes on with the next. | `SJ-9` t1 |
| « ce qu engram extrait en plus des faits » (`:360`) | The replay report shows, step by step, what was noted and what was extracted. | `SJ-1b` report |
| « seul le diff est transmis » (`:361`) | At a step where nothing changed for the session, zero bytes are added. No full view outside a compaction, a clear or a restart. | `SJ-1a` t2, `SJ-4` t2, `SJ-8` t3 |
| « copier mes decision en kit a la fin » (`:362`) | Done: his answers are in the repository (`ANS:1-113`). | — |
| « Si je comprends pas c est une merde » (`:363`) | He reads §1 and can say the functions back without opening the rest. | owner check |

## 10. Lots, test first

Rules for every lot:
- One owner repository, and in `sentropic` one package; a lot in a publishable package bumps that package's version (`S1:1655`). Tests are written first and fail first. At most 150 lines of non-test code: a lot that would exceed it is split before it starts. In `sentropic` the same limit holds for each commit (`MST:51`).
- Zero Python. Every gate ends with the repository's guard. h2a has it on `origin/main` (`scripts/check-no-python.mjs`, read at the pin by `SJR1`). engram and sentropic do not: lots `SJ-0e` and `SJ-0s` add it first. The guard fails on any `*.py`, `pyproject.toml` or `requirements*.txt`.
- **Builder** (`BLD:12`, `BLD:32`). `Neon` is agy Neon xhigh. `Muse 1.3` is Muse 1.3 xhigh and `Ember` is Muse ember max: both for a small simple lot only — one package, no security rule, no contract shared between repositories, no change to a host hook.
- **Gates.** Each lot runs the gate of its repository on its test file:
  - `E` (engram, `S1:1654`): `npx vitest run <file> && npm run lint && npm run build && node scripts/check-no-python.mjs`.
  - `S` (sentropic, `S1:1655`, `S1:1680`, `MST:30-34`): `make scope-check ENV=<env> && make test-<package> SCOPE="<file>" ENV=<env> && make typecheck-<package> ENV=<env> && make check-no-python ENV=<env>`, with `<env>` = `test-<package>`, always last. Make only: no `pnpm`, `vitest` or `tsc` on the host (`S6A:730`). `mcp-platform` type-checks with `make typecheck ENV=test-typecheck` (`S6A:745`).
  - `H` (h2a, `S1:1656`, `S3:1061`): `npm --workspace @sentropic/h2a run build && node --test packages/h2a/test/<file> && node scripts/check-no-python.mjs`, under the isolated `TMPDIR` of the repository's gates. The build comes first because the tests import `dist/`. Each new test file is registered in `scripts/test-inventory.json`.
- **Scope exceptions** on the root `Makefile` of sentropic, forbidden by default (`MST:32-33`; same form as `BRS1-EX1`, `S1:1672-1676`, and `BRS4-EX1`/`BRS4-EX2`, `S4:924-931`). **`BRSJ-EX1`**, lot `SJ-0s`: one new target, `check-no-python`, that runs the guard in the existing Node container. Reason: the zero-Python rule needs the same gate locally and in CI. Rollback: revert the lot. **`BRSJ-EX2`**, lots `SJ-3a` and `SJ-7b`: the `@sentropic/engram` version literal of `CLUSTER_MESH_PEER_TOOLS` (`Makefile:1282` at the pin, read by `SJR2`) moves to the version published with the engram lots that lot waits for, in lockstep with the peer range and the version of `packages/cluster-mesh/package.json`, with `ENGRAM_MEMORY_RANGE` in `src/modules/catalog.ts` (`S1:1673`) and with the lock and qualification pins those files drive (`S4:925`, `S4:929`). Reason: the cold container of gate `S` installs engram from that line (`S1:1674`); unmoved, it cannot resolve the contracts of §12. Rollback: revert the lot, pin and locks together. Impact of both: no existing target, recipe or image changes. No other lot touches the root `Makefile`.

The first deliverable is the pair `SJ-1a` then `SJ-1b`, each within the 150 lines. Its exit is an end-to-end proof on one third-party CLI, by replay: from the bytes Claude Code wrote for a real session to the bytes engram would inject. It proves « noter » and « rendre le diff ». The third function, « chercher dans l'historique », is proven on the same recording by `SJ-5b` t1. Replay comes first by `D9 C`. It is also the only proof that does not wait for the cluster-mesh route. Lot `SJ-4` then gives the same proof live.

| Lot | Repo, stage | Builder | Depends on | RED tests, written first | Gate |
|---|---|---|---|---|---|
| `SJ-0e` No-Python guard | `engram`, 1 | `Ember` | — | t1: a tree with one `*.py`, `pyproject.toml` or `requirements*.txt` fails, and names the path. t2: the repository as it is passes. | `E` `tests/check-no-python.test.ts` |
| `SJ-0s` No-Python guard | `sentropic` root, 1 | `Muse 1.3` | — | t1, t2 as `SJ-0e`, through `make check-no-python`. The root `Makefile` is touched under `BRSJ-EX1` only. | `make scope-check ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh` |
| `SJ-1a` Query, first view, diff | `engram`, 2 | `Neon` | Spec 1 lot `1-E1` (`S1:1663`), `SJ-0e` | t1: the first noted event of a key creates version 1, with its `schemaVersion`, no pinned request and no selector; the owner's first request gives version 2; a digest is stable; a version never changes. t2: nothing changed outside the session: no item, `byteLength` 0, `mode: 'diff'`. t3: a decision added from outside is delivered once, with a watermark that names the query, its version and the new cursor; the next request, holding that watermark, gets 0 bytes. t4: `reset` gives `mode: 'full'`: the request word for word and every decision in scope. t5: `held` and `reset` together, or neither: `INVALID_SCHEMA`. t6: a watermark engram cannot read is answered from its own record of that session, with no error and no full view; a session the journal never saw gets the full view. | `E` `tests/session-context-engine.test.ts` |
| `SJ-1b` End-to-end proof on Claude Code, by replay | `engram`, 1–2 | `Neon` | `SJ-1a` | A recorded Claude Code session of the §1.2 example is replayed through `recordSessionEvent`. t1: every prompt, assistant turn and tool result is in the journal; `promptCitation`, `reasoningCitations`, `authorModelRef`, `callCitation` and `durationMs` round-trip. t2: at a prompt where nothing changed outside, 0 bytes would be injected. t3: at the compaction boundary, `reset: 'compaction'` gives the full view; same `sessionPseudoId`. t4: the run makes no model call. Report: one command prints, per step, what was noted, what would be injected and its size in bytes. | `E` `tests/session-context-replay.test.ts` |
| `SJ-1c` The whole view | `engram`, 2 | `Neon` | `SJ-1a` | t1: the six tiers come in the order of §2.7, and give way in that order. t2: no view exceeds `viewMaxTokens`; with 500 more steps the view at step 500 is under the ceiling of step 1; a token is 3 bytes when the host gives no count. t3: decisions that do not fit are counted in the pointer line. t4: a pinned request over the ceiling is delivered whole, with `overflow`. t5: a replaced decision the session holds comes as one `withdrawn` item. t6: each item has its `ref`, `digest`, `slice`, `disclosure`, `authoredBy` and sources. | `E` `tests/session-context-view.test.ts` |
| `SJ-2a` The request and the delivery on the Spec 1 call | `engram`, 2 | `Neon` | `SJ-1a` | t1: `journalEnabled` false: the call answers `CAPABILITY_UNAVAILABLE`; nothing recorded, nothing delivered. t2: no `contextRequest`: recorded, no delivery. t3: with `contextRequest`: the payloads hold only the difference; the receipt names `watermark` and `queryDigest`, and `annotatedThroughOrdinal` once the shadow has read a step; called alone, `recordSessionEvent` renders for a reader that is external and not authorized: an item from another session is a reference. t4: the request and the answered watermark are stored with the event; the delivery is recomputed from them, item for item, and byte for byte for the same reader. t5: no turn text enters `.graphify/graph.json`. | `E` `tests/session-context-ingest.test.ts` |
| `SJ-2c` The journal wrapper and the one disclosure rule | `engram`, 2 | `Neon` | `SJ-2a`, published `SJ-7a` | t1: `noteSessionEvent(envelope, host)` records exactly what `recordSessionEvent(envelope)` records: one event, one commit, the same key; delivered twice: one event; `recorded` is the Spec 1 result, untouched. t2: one function decides `disclosure` for both transports: an item of this session is text; an item of another session, or a dreaming recall, is a reference unless the binding says `reader_is_local` or `reader_content_authorized`. t3: text for an authorized external reader still passes the deny-list and the PII armor; a hit is withheld. t4: no binding, or a binding with no reader fact: external, not authorized. t5: the envelope and the binding disagree on tenant, workspace, worktree, session or mandate digest: `UNAUTHORIZED`, nothing recorded. t6: `recordSessionEvent(envelope)` alone equals `noteSessionEvent(envelope, {})`. t7: engram's peer and dev pins admit the platform version published by `SJ-7a` (`package.json:186`, `:257`), and `engram-memory` still imports nothing from the platform (`tests/memory-neutrality.test.ts`). | `E` `tests/session-journal-wrapper.test.ts` |
| `SJ-2b` Read-only delivery (`D18`) | `engram`, 2 | `Neon` | `SJ-2c` | t1: no memory identity, and a verified policy passed as `readOnlyPolicy`: zero journal rows, zero `memory` item, the allowed slices as a diff against the watermark, in `readOnlyDelivery`, with `policyDigest`; `recorded` is the Spec 1 refusal, `UNAUTHORIZED`, unchanged. t2: no policy: the refusal alone. t3: `memory` in `allowedSlices`: `INVALID_SCHEMA`, nothing returned. t4: the computed query is never stored; the watermark of its delivery names version 1. | `E` `tests/session-context-readonly.test.ts` |
| `SJ-3a` The route | `sentropic` `cluster-mesh`, 2 | `Neon` | Spec 1 lot `1-S1a` (`S1:1682`), `SJ-7c`, published `SJ-2b` (engram pin moved under `BRSJ-EX2`) | t1: journal off: the route answers the refusal of `SJ-2a` t1 and records nothing. t2: the route calls `noteSessionEvent` with the binding of `SJ-7c`; with no reader fact, own-session items come as text and other-session items as references; no other text leaves. t3: an envelope member the contract does not know — a role, a reader, a policy result — is `INVALID_SCHEMA` as today (`S1:1663`): a body cannot carry a host fact. t4: local store down: `503`, no delivery, no second store. t5: a session without a memory identity, whose policy verifies (`verifyH2APolicyEnvelopeV1`, `S4:937`), gets the allowed slices in `readOnlyDelivery`, one more member of the refusal's JSON body; the refusal keeps its Spec 1 status; nothing is recorded. t6: `contextRequest` or `contextAmendments` from a caller with no binding and no verified policy: `UNAUTHORIZED`, nothing recorded; the same note without them is recorded as Spec 1 says. | `S` `cluster-mesh`, `tests/session-context-route.spec.ts` |
| `SJ-4` Live on Claude Code | `h2a`, 2 | `Neon` | Spec 1 lot `1-H1` (`S1:1692`), `SJ-3a`, the vector of `SJ-5a` | t1: option off: no call, and the tool's output is unchanged; option on and the workspace journal off: the refusal is silent, and nothing is printed. t2: nothing changed: the hook prints 0 bytes. t3: on the compaction signal the next call carries `reset: 'compaction'` and the tool's name for the signal in `hostSignal`; the printed view holds the pinned request and the decisions in scope. t4: process restart: `reset: 'restart'`. t5: `503`: no local file is written; a banner is shown. t6: the note of an `engram_memory_search` call carries `session_context_amendment` from its result, unchanged: the hook converts nothing (fixture: the vector of `SJ-5a` t5); the hook path and the poll path build the same bytes. t7: a `D18` refusal that carries `readOnlyDelivery`: the hook prints its payloads, stores its watermark and shows no error; without it the hook prints nothing. t8: the hook sends `contextRequest` only when its mandate carries `memory:context:assemble`, or when the session is unassigned. | `H` `session-context-claude.test.js` |
| `SJ-5a` The `v2` schemas and the wire codec | `engram`, 2 | `Neon` | `SJ-2c`, published `SJ-7a` | t1: `v2` off: the `v1` manifest and schema digests are byte-identical; `session_context` is `INVALID_SCHEMA`. t2: every `v2` schema passes `validateMemoryToolSchemaDialectV1`; every property name of the page is snake_case, at every depth, and `validateSearchOutputV2` refuses any other; a page for a session with no role, so no `role_ref` and no `mandate_digest`, validates; any `null` fails. t3: `match` validates with exactly one branch: `text`, `ref` or `withheld`; the amendment validates with exactly one: `keep` with a `text` or `ref` match, or `drop` with a `selector_id` and no match; none, or two, fail. t4: `session_context` with `page_cursor` is `INVALID_SCHEMA`; no `next_page_cursor` is issued. t5: the codec: journal form to wire form and back gives the same value; a key it does not know is refused; its golden vector is the fixture of `SJ-4` t6 and `SJ-8` t5. t6: the `v2` wire and tool-schema profile ids equal the platform's (`SJ-7a` t4); the dialect validator admits them for `v2` schemas only (`src/mcp/memory/schemas.ts:3665-3682`). t7: binding the `v2` profile set without a valid `CoSignatureReceiptV2` makes `createEngramMemoryProviderV1` throw `McpMemoryPreflightError`: true here because engram admits no `v2` set yet, and kept true by `SJ-5c` t2 once it does. | `E` `tests/memory-search-v2-schema.test.ts` |
| `SJ-5c` The `v2` profile in the provider: the preflight | `engram`, 2 | `Neon` | `SJ-5a`, published `SJ-7a` | t1: the host binds the `v1` profile set: the provider starts as today, and its four checks against the platform's `v1` constants pass (`src/mcp-memory/provider.ts:446-457`). t2: the host binds the `v2` set without a valid `CoSignatureReceiptV2` — two Ed25519 signatures, `owner:engram-l4` and `owner:mcp-platform` (`S6A:638`) — and `createEngramMemoryProviderV1` throws `McpMemoryPreflightError`. t3: with the receipt the `v2` set is admitted: its two profile ids and their digests, pinned beside the `v1` ones (`src/mcp-memory/profiles.ts:7-15`; `src/mcp/memory/receipts.ts:55-68`, `:87-89`, `:101-103`); any other set fails as an incompatible frozen profile (`provider.ts:426-430`). t4: with `v2` on, step 4 validates the search input with the `v2` schema (`provider.ts:391-394`, `:780`); with `v2` off, with the `v1` schema. t5: the provider copies `session_binding` from the projection into `MemoryReadInvocationV1`; none in the projection: none in the invocation. t6: six tools in both profiles; the root export still imports no MCP peer (`S6A:738`). | `E` `tests/mcp-memory-v2-preflight.test.ts` |
| `SJ-5b` Search the history | `engram`, 2 | `Neon` | `SJ-5c`, published `SJ-7a` | t1: `history` finds an exact line of a closed session of the same role and space, with `eventRecordId`, locator, lines and digest; it also finds one on the recording of `SJ-1b`. t2: another role, another workspace or another tenant: no match; a session with no role: its own journal only. t3: a match from another session, external reader, no authorization: reference only; an own-session match: text; the function is the one of `SJ-2c` t2. t4: no binding in the invocation: `UNAUTHORIZED`; a binding and no journal facet: `CAPABILITY_UNAVAILABLE`; the facet says the workspace has not opted in: no history, and the call succeeds. t5: the handler writes to no store. | `E` `tests/session-search-history.test.ts` |
| `SJ-6a` The gate, a pure function | `engram`, 2 | `Muse 1.3` | `SJ-1a` | t1: `keep` adds a selector and gives the next version; the same `keep` again: `no_change`. t2: `drop` removes a selector, the shadow's included, by its `selectorId`; unknown: `no_change`. t3: nothing can unpin a request, widen a right, or change the Track scope or the ontologies; a selector outside the rights of the query: `refused`, `outside_rights`. t4: beyond `maxSelectors` the oldest shadow selector goes; when all are the agent's: `refused`, `selector_ceiling`; the shadow never evicts an agent selector. t5: a late `basedOnVersion` is run against the current version, and `0` against version 1; two late amendments on different selectors both apply. t6: `selectorId` is `scs_` and the digest of the stored match; a `withheld` projection keeps it. | `E` `tests/session-context-gate.test.ts` |
| `SJ-6b` Ask through search, commit on the note | `engram`, 2 | `Neon` | `SJ-5b`, `SJ-6a` | t1: `keep` returns the query at its current version, the amendment and the verdict; no store changed; a `drop` whose `query` is a `selectorId`, or the text of a selector, returns an amendment that names the id and carries no text. t2: the note of that call, carrying the amendment, commits the next version; the committed selector cites that note in `sourceEventRecordIds`; the receipt lists the verdict with its `selectorId`; the next delivery holds what the selector selects. t3: the same note delivered twice: one version. t4: capture revoked: the note is refused (`AUTHORIZATION_REVOKED`, `S1:1664`), the version does not move, `history` still answers. t5: journal off for the workspace, and a binding: the search answers its memory results; verdict `refused`, reason `journal_off`; no query and no amendment in the page. t6: `contextAmendments` on any other event: `INVALID_SCHEMA`. t7: a selector written in another session reaches an external reader without authorization as `withheld`, with its digest and its `selectorId`; that reader drops it by the id, and the drop commits. t8: nothing noted yet for that key: no `session_context_query`; the amendment names `basedOnVersion: 0`; its note creates version 1, then commits version 2. t9: an amendment whose `match` is `withheld`, or a `drop` that carries a `match`, is `INVALID_SCHEMA` on both transports. | `E` `tests/session-context-amend.test.ts` |
| `SJ-7a` The binding in the `v2` projection | `sentropic` `mcp-platform`, 2 | `Neon` | Spec 6A lot `6A-S0a` (`S6A:745`), `SJ-0s` | t1: `MemoryInvocationBindingV1` and the `v2` projection carry optional `session_binding`, closed, with every field of `SessionContextBindingV1`; an unknown key in it is refused; the `v1` projection is unchanged, key for key (`PLAT:77-123`). t2: `callContext.meta` reaches the host whole (`S6A:616`); the platform reads none of the three h2a carriers and imports no engram or cluster-mesh module. t3: the `requiredClaims` of the six tools are unchanged. t4: the platform exports the `v2` wire and tool-schema profile ids beside the `v1` ones, whose constants do not move. t5: the package is published as a `0.4.x` version: `@sentropic/mcp-broker` takes it through its `^0.4.0` range and passes the projection on as it is (`node_modules/@sentropic/mcp-broker/package.json:18-20`, `dist/memory/context-projection.js:24-34`). | `S` `mcp-platform`, `memory-session-binding-v2` |
| `SJ-7c` The session binding at the hop | `sentropic` `cluster-mesh`, 2 | `Neon` | `SJ-7a`, Spec 6A lot `6A-S1b` (`S6A:748`) | t1: a mandate verified with `memory:context:assemble`: a binding with tenant, workspace, worktree, session, `role_ref` and `mandate_digest`. t2: a memory identity and no mandate: a binding with neither `role_ref` nor `mandate_digest`. t3: no memory identity, or a mandate that fails a check or lacks the right: no binding. t4: a session cluster-mesh saw noted by another caller: no binding. t5: the worktree and the session come from the session carrier on the MCP call and from the envelope on the journal call; a tool argument that names them is ignored. t6: one builder serves both transports; with the journal off it still builds; with no receipt the reader facts are the closed defaults. | `S` `cluster-mesh`, `tests/session-binding.spec.ts` |
| `SJ-7e` The launch receipt | `h2a`, 2 | `Neon` | Spec 6A lot `6A-H1` (`S6A:759`) | t1: `h2a run` signs, with a key of the instance it starts, an `event` envelope whose body is `H2ASeatLaunchBodyV1`; `validateH2AEnvelope` accepts it and `verifyEnvelopeSignature` verifies it (`H2A` `packages/h2a/src/envelope.ts:72-103`, `:109-163`). t2: the session-front client sends it as `X-Sentropic-H2A-Launch` on the journal call, and the attachment sets it in `params._meta['sentropic.h2a.launch']` on memory tool calls: the same signed envelope. t3: a seat started outside `h2a run` has no receipt and sends none. t4: the golden vector of the signed envelope is written for `SJ-7f`. | `H` `seat-launch-receipt.test.js` |
| `SJ-7f` Who reads: the launch receipt and the content act | `sentropic` `cluster-mesh`, 2 | `Neon` | `SJ-3a`, the vector of `SJ-7e` | t1: a receipt that verifies gives `reader_model_ref`; the vector of `SJ-7e` passes. t2: no receipt, a signature that fails, a key that is unknown or revoked, a receipt whose instance is not the caller, or a header and a `_meta` carrier that differ: no reader fact; the reader is external and not authorized; the call itself is not refused. t3: a model named in a tool argument, in the envelope or in the request body is ignored. t4: `reader_is_local` is true only for a provider llm-mesh lists as local. t5: `reader_content_authorized` is true only when the `ModelContentAuthorizationPolicyV1` of that tenant and workspace has `contentAuthorized` and lists the provider; the policy of another workspace does not apply; `content_policy_digest` is its `policyDigestSha256`; the decision is logged. t6: through the route of `SJ-3a`, an authorized external reader gets other-session text, screened as in `SJ-2c` t3. | `S` `cluster-mesh`, `tests/session-reader-facts.spec.ts` |
| `SJ-7b` The `v2` switch | `sentropic` `cluster-mesh`, 2 | `Neon` | `SJ-7f`, published `SJ-6b` (engram pin moved under `BRSJ-EX2`) | t1: without a valid engram + sentropic co-signature `v2` does not start and `v1` is served unchanged. t2: six tools are listed in `v1` and in `v2`. t3: with `v2` off a `session_context` call is `INVALID_SCHEMA`. t4: the digest of `pre-candidate-manifest.json` is re-pinned and the 22 `P09` suites pass, as test 2 of lot `6A-S4` asked (`S6A:753`). t5: with `v2` on, the binding of `SJ-7c` and `SJ-7f` rides in `session_binding` to the provider; a call with no session carrier has none. | `S` `cluster-mesh`, `tests/memory-search-v2-profile.spec.ts`; then `make memory-mcp-qualify E2_LOCK=/tmp/sentropic-docker.lock ENV=test-memory-mcp`, the `MCP-L5` gate of lot `6A-S4` (`S6A:753`) |
| `SJ-7d` h2a admits `v2` | `h2a`, 2 | `Neon` | `SJ-7b`, Spec 6A lot `6A-H1` (`S6A:759`) | t1: `validateBridgeLock` and `normalizeConfiguration` admit `sentropic.engram.memory-wire/v2` and still admit `v1`; a `contextToolSwitchover` key is refused. t2: the attachment sets `params._meta['sentropic.h2a.session']` on memory tool calls, with exactly the two fields of `SessionCallerRefV1`: the session and the worktree of the seat. t3: the four failure modes hardened by PR #455 stay refused (`S6A:632`). | `H` `registry-memory-v2.test.js` |
| `SJ-8` CLI switch, and hosts without a signal | `h2a`, 2 | `Neon` | `SJ-4`, `SJ-7d` | t1: new session id, same role, same worktree, on Codex: the first delivery is the full view at the inherited version, the agent's selector included; no hand-written note. t2: another role, or no role: nothing inherited. t3: a host with no compaction signal runs 60 turns: no `reset` is sent and no full view is delivered. t4: on each of the eight hosts, option off changes nothing. t5: on each of the eight hosts, the note of an `engram_memory_search` call carries the amendment found in its result, unchanged. | `H` `session-context-switch.test.js` |
| `SJ-9` One annotation service | `sentropic` `cluster-mesh`, 1–2 | `Neon` | Spec 1 lot `1-S2` (`S1:1684`), `SJ-0s` | t1: the first model of `direct` is cut; the next one continues, with no human act. t2: one ready account: the model `singleAccountByProvider` names for that provider comes first; it feeds a view only if listed in `qualified`. t3: all models down, or empty lists: no model call, the view is built by code, a banner is shown, and the main model is never called in their place. t4: `direct` and `dreaming` use one code path; `dreaming` reads its own list; each annotation names its model; each of the five `mode` values selects its backend. t5: without content authorization the prompt holds references only. | `S` `cluster-mesh`, `tests/annotation-service.spec.ts` |
| `SJ-10` The shadow's output in the journal | `engram`, 1–2 | `Muse 1.3` | `SJ-6a`, Spec 1 lot `1-E3` (`S1:1665`) | t1: a shadow item or selector without `authorModelRef` or without a cited event is refused; for an amendment the verdict is `refused`, `unattributed`. t2: a shadow amendment, carried in `contextAmendments` of the batch, goes through the gate of `SJ-6a`; the extraction receipt lists its verdict in `contextAmendmentVerdicts`. t3: a shadow late by k steps: `annotatedThroughOrdinal` says so. t4: mode `off`: no model call between two steps, and `annotatedThroughOrdinal` is absent. t5: shadow and main model disagree: both items stay, flagged, each with its `authoredBy`. | `E` `tests/session-shadow-output.test.ts` |
| `SJ-11` Replay gate and owner report | `h2a`, 2 | `Muse 1.3` | `SJ-4`, `SJ-9`, `SJ-10` | t1: one missing request or decision, one view over the ceiling, or one uncited model item fails the gate. t2: the report is in plain French and shows, for each item of the view, the raw fact behind it. t3: the report names the shadow models that passed; a model that is not in `qualified` cannot feed a context (`SJ-9` t2). | `H` `session-context-replay-gate.test.js` |
| `SJ-12` Levels A, B, C and the same-session test | `h2a`, 2 | `Neon` | `SJ-11` | t1: a clear that changes the session id or loses the scrollback fails the host test; the host falls to B or A, with a banner. t2: on a host that passes, option on: the prompt is rebuilt at `rebuildAtTokens` and step 500 is under the ceiling of step 1; option off: nothing changes. t3: a summarized tool output keeps every error line and a pointer to the full output. t4: the plan block is copied by code and cited in `planCitation`. t5: Hermes stays at the default: no Python module. | `H` `session-context-levels.test.js` |
| `SJ-13` Dreaming hand-off | `engram`, 2 | `Neon` | `SJ-2a`, Spec 3 lot `3-E3` (`S3:1022`) | t1: a permanent accepted record, absent from the last 8 deliveries and within reach of the session's files, is marked and arrives in the next diff as an item `authoredBy: 'dreaming'`. t2: a lesson drafted by a model before its threshold never arrives. t3: no memory identity: no recall. | `E` `tests/session-dreaming-recall.test.ts` |
| `SJ-14` Track scope from the objective loop | `h2a`, 2 | `Muse 1.3` | `SJ-4` | t1: each `H2ALoopTrackRef` becomes one `SessionTrackScopeRefV1`: `repoKey`, `workspace`, `aggregateId`, `role` and `baselineCommit` copied, `system` left out. t2: a decision gate travels as `decisionGateId` and `decisionGateDigest`; none of its text is copied. t3: an `aggregateKind` unknown today round-trips. t4: with a loop, the session-front client puts `loop` in the request; with none, `loop` is absent, never `null`. | `H` `session-context-loop-scope.test.js` |
| `SJ-15` Scope, ontologies and mandate in the query | `engram`, 2 | `Neon` | `SJ-2c`, the Spec 0 registry (`S0:149-154`) | t1: `loop` on a request sets `objectiveLoopId` and `trackScope` in the next version; the same loop again: no new version; no loop: an empty scope. t2: `ontologies` lists the templates the Spec 0 registry holds for the workspace; one more registered: the next version. t3: tier 3 of the view lists the Track items of the scope. t4: `roleRef` and `mandateDigest` come from the binding; a changed mandate: the next version; two sessions of one role on one worktree have one `queryId`; with no role, each session has its own. | `E` `tests/session-context-scope.test.ts` |
| `SJ-16e` Signal that a role proposal is ready | `engram`, 2 | `Ember` | `SJ-2a`, Spec 4 lot `4-E2` (`S4:913`) | t1: a proposal is ready for the session's workspace: the next receipt names its id in `pendingProactiveRoleProposalId`, once. t2: none ready: the field is absent, never `null`. | `E` `tests/session-proactive-role-signal.test.ts` |
| `SJ-16h` Fetch a role proposal without polling | `h2a`, 2 | `Neon` | `SJ-16e`, Spec 4 lot `4-H3` (`S4:951`) | t1: a receipt names an id: the hook calls `GET /memory/v1/h2a/proactive-role-proposals` once. t2: no id: no call and no timer. | `H` `session-proactive-role-fetch.test.js` |
| `SJ-17` `h2a run stp` and the loop bridge (`proposed`) | `h2a`, 3 | `Neon` | gate B (§9.3), the agentic-loop dossier, `SJ-14` | t1: `h2a run stp` starts the loop; there is no `stp` binary. t2: h2a imports neither chat-core nor a loop engine: it launches and bridges. t3: the Track references of the loop reach `contextRequest.loop`. t4: it is not the default runner without gate B. | `H` `session-context-stp.test.js` |
| `SJ-18` The step-context adapter (`proposed`) | `engram`, 3 | `Neon` | `SJ-1c`, the agentic-loop dossier | t1: each prompt is the pinned request, the view, the trailing results and the trigger; nothing older than the last rebuild. t2: for each `terminalReason` of `StepReceipt`, engram does what the table of §5 says. t3: local store down: no further change, a replay marker, then stop; no second thread. t4: a tool output is noted in full before its summary enters the prompt. | `E` `tests/session-step-context.test.ts` |

**Build order.** The table gives every dependency, those on lots of the sibling specs included. The same edges between lots of this spec, as a graph: `A → B` means `B` waits for `A` in the same repository; `A ⇒ B` means `B` waits for `A` in another repository — for its published package, or for the vector it wrote. Every field of §12 names the lot and the test that prove it.
- *engram:* `SJ-0e → SJ-1a → SJ-1b`, the replay proof, which waits for no other repository; `SJ-1a → SJ-1c → SJ-18`; `SJ-1a → SJ-6a → SJ-10`; `SJ-1a → SJ-2a`; `SJ-2a → SJ-13`; `SJ-2a → SJ-16e`; `SJ-2a → SJ-2c → SJ-2b`; `SJ-2c → SJ-15`; `SJ-2c → SJ-5a → SJ-5c → SJ-5b → SJ-6b`; `SJ-6a → SJ-6b`. `SJ-5c` is the `v2` preflight of `provider.ts`.
- *sentropic:* `SJ-0s → SJ-7a → SJ-7c → SJ-3a → SJ-7f → SJ-7b`; `SJ-0s → SJ-9`.
- *h2a:* `SJ-4 → SJ-8`; `SJ-4 → SJ-11 → SJ-12`; `SJ-4 → SJ-14 → SJ-17`; `SJ-7d → SJ-8`; `SJ-7e` waits for no lot of this spec.
- *Across repositories:* `SJ-7a ⇒ SJ-2c`, the platform package that declares the binding, so `SJ-5a`, `SJ-5c` and `SJ-5b` wait for `SJ-7a` too; `SJ-2b ⇒ SJ-3a` and `SJ-6b ⇒ SJ-7b`, each with its move of the engram pin in sentropic (`BRSJ-EX2`); `SJ-3a ⇒ SJ-4`; `SJ-5a ⇒ SJ-4`, the codec vector; `SJ-7e ⇒ SJ-7f`, the receipt vector; `SJ-7b ⇒ SJ-7d`; `SJ-9 ⇒ SJ-11`; `SJ-10 ⇒ SJ-11`; `SJ-16e ⇒ SJ-16h`. `SJ-17` and `SJ-18` come last: they also wait for the agentic-loop dossier.

## 11. Open points

**One point is open.**

| # | Point | Evidence that it is open | Until he answers |
|---|---|---|---|
| `OP-1` | The ordered list of shadow models: one list for `direct`, one for `dreaming`, and the small model per provider for the one-account case. | The dossier asked for "la liste et son ordre" (`DOS:297`; asked again at `DOS:419`). His answers give `D8 A` and one comment, and no list (`ANS:51-56`, `ANS:104-108`). His 15/11 sentence gives examples, with "genre" (`EV15:10`). | The lists and the map are empty. The service runs without a model. Tests use fixtures. |

**Not open.** The goal and the orientation are settled by the owner's decisions; on 19/11 he answered « quelles question j'ai deja TOUT validé » (relayed in this spec's authoring brief; no primary file). There is no 7th tool. `D6` applies as written in §6.5. Hermes stays without a Python module (`DOS:338`). There is no periodic full view (§3.4).

**Limits stated in this spec, which are not questions.** An amendment asked through search is in force at the next noted step (§2.4). A host with no compaction signal gets no full view between two clears or restarts (§3.4). Two sessions of the same role on the same worktree at the same time share one query (§2.5). The reader's model is known through h2a alone: a seat started outside `h2a run` has no launch receipt, and is read as external and not authorized (§2.6).

**Sequenced acts, already decided, that are not design questions.** The content authorization, at commissioning (`DOS:273`). The engram + sentropic co-signature of the `v2` profile, by a separate dossier (`DOS:589`). The numeric thresholds of the gates, when the first measurements exist (`DOS:312`).

**Coordination, not for the owner.** The agentic-loop dossier has its own open questions (`ALV2:831`); §5 depends on none of them. Spec 1, 3, 4 and 6A are edited by their authors from §8.

## 12. Contracts — each symbol defined once

**Where each type lives.** One package per type. The third column lists the only imports that exist, and cites the rule that fixes their direction. These types are `new`.

| Owner package | Its types | Who imports them, and the rule |
|---|---|---|
| engram, the product package (`@sentropic/engram`): `src/session-front-contracts.ts`, the file of the Spec 1 contract block (`S1:179`), published as `@sentropic/engram/session-front-contracts` (`S1:176`); and `src/mcp/memory/contracts.ts` | block A: all that the journal stores or returns, and the wire codec. Block B: the `v2` search types; the journal wrapper | cluster-mesh imports them through its peer and its catalog (`S1:176`, `S1:1673`). engram imports the Spec 0 types of its own product tree (`S1:180-185`, `S0:138-141`), L0 by its contracts (`S1:186-194`; `src/memory-tools/reads.ts:3-5`) and, type-only, the platform (`src/mcp-memory/provider.ts:25-37`; peer at `package.json:186`) |
| `engram-memory`, the L0 package | no type of this spec. Its `Result<T>` and `MemoryErrorV1` are used as they are | L0 imports nothing outside `engram-memory/` and holds no `h2a` or `@sentropic/` name (`tests/memory-neutrality.test.ts:255-257`, `:913-917`, `:1067-1077`): it could use neither the Spec 0 types block A needs nor the binding. Inside engram, product code hands the L0 engine neutral values only |
| sentropic `mcp-platform` (`@sentropic/mcp-platform/memory`) | block C: the binding | engram and cluster-mesh import it. The platform depends on neither (`node_modules/@sentropic/mcp-platform/package.json:109-119`) |
| sentropic `cluster-mesh` | block D: the two host policies | nobody: cluster-mesh evaluates them and puts the result in the binding |
| h2a (`@sentropic/h2a`) | block E: the two carriers h2a writes | nobody. h2a depends on no engram or sentropic package (`H2A` `packages/h2a/package.json:51-65`; guard of lot `1-H1`, `S1:1692`), and cluster-mesh takes no `@sentropic/h2a` dependency (`S4:937`). cluster-mesh reads the two carriers as JSON it validates; a golden vector written by the h2a lot pins the bytes, as for the mandate (`S6A:378`) |

TypeScript. Blocks A, D and E are camelCase, and so is the wrapper of block B. Block C and the `v2` search types are snake_case, like the projection and the tool they join. **On the MCP wire** a block A value is written in its *wire form*: the same fields and the same optionality, with every property name in snake_case at every depth (`selectorId` becomes `selector_id`); values do not change. One codec, in block A, writes and reads that form. The search handler writes with it; the journal reads the note's amendments with it; the h2a hook copies them and converts nothing (`SJ-5a` t5, `SJ-4` t6). The comment of each field ends with the lot and the test that prove it (§10).

```ts
// ── A. engram — `src/session-front-contracts.ts`. Uses, as the Spec 1 block does: Sha256Digest and OntologyTemplateEnvelopeRef (Spec 0 :144-154), Cursor (`engram-memory/contracts`), SessionDbCitationTuple and RawSessionEventReceipt (Spec 1 :158-165, :351-373).
/** What a selector matches. Stored: `text` or `ref`. `withheld` is output only: the D6 projection of a text written in another session. On the wire, a `oneOf` of three closed objects. */
export type SessionContextSelectorMatchV1 =
  | { readonly kind: 'text'; readonly text: string }                   // 1..8192 UTF-8 bytes; re-run at each evaluation · SJ-5a t3
  | { readonly kind: 'ref'; readonly ref: string }                     // one exact item: record id, event record id, or D6 path ref · SJ-5a t3
  | { readonly kind: 'withheld'; readonly textDigest: Sha256Digest };  // never stored, never accepted as input · SJ-6b t7, t9
export interface SessionContextSelectorV1 {            // one thing the session wants in front of it
  readonly selectorId: string;                         // `scs_` + 64 hex: SHA-256 of the JCS bytes of the stored match; a projection never changes it · SJ-6a t6
  readonly match: SessionContextSelectorMatchV1;       // SJ-5a t3
  readonly by: 'agent' | 'shadow'; readonly authorModelRef?: string;  // `provider:model`, required when by === 'shadow' · SJ-6a t4, SJ-10 t1
  readonly sourceEventRecordIds: readonly string[];    // the note that carried it, or the events the shadow read · SJ-6b t2
}
export interface SessionTrackScopeRefV1 {              // one Track reference of the objective loop; open strings: their owners decide the values
  readonly repoKey: string; readonly workspace: string; readonly aggregateId: string; readonly role: string;  // SJ-14 t1
  readonly aggregateKind: string; readonly baselineCommit?: string;  // the kind is open: no list of Track types here · SJ-14 t3, t1
  readonly decisionGateId?: string; readonly decisionGateDigest?: Sha256Digest;  // the gate's content stays with its owner · SJ-14 t2
}
export interface SessionContextQueryV1 {
  readonly schemaVersion: 'engram.session-context-query/v1';  // SJ-1a t1
  readonly queryId: string;                            // one per (tenantId, workspaceId, derivedWorktreeId, roleRef); per session without a role · SJ-15 t4
  readonly version: number;                            // 1, 2, 3…; the first noted event of the key creates version 1; a version never changes · SJ-1a t1
  readonly digest: Sha256Digest;                       // RFC 8785 JCS over every other field · SJ-1a t1
  readonly tenantId: string; readonly workspaceId: string; readonly derivedWorktreeId: string;  // rights: code only, from the binding (§2.6) · SJ-5b t2, SJ-15 t4
  readonly roleRef?: string; readonly mandateDigest?: Sha256Digest;  // rights too; absent: no role, no mandate; never null · SJ-15 t4, SJ-5a t2
  readonly objectiveLoopId?: string; readonly trackScope: readonly SessionTrackScopeRefV1[];  // code only · SJ-15 t1
  readonly ontologies: readonly OntologyTemplateEnvelopeRef[];  // code only · SJ-15 t2
  readonly pinnedEventRecordIds: readonly string[];    // the owner's current request and corrections: code only; empty until his first request · SJ-1a t1, t4
  readonly selectors: readonly SessionContextSelectorV1[];      // SJ-6a t1
}
export interface SessionContextAmendmentAuthorV1 {     // who asks, and what they had read
  readonly by: 'agent' | 'shadow'; readonly authorModelRef?: string;  // the model is required when by === 'shadow' · SJ-6a t1, SJ-10 t1
  readonly sourceEventRecordIds: readonly string[];    // empty for the agent, whose note becomes the source; at least one for the shadow · SJ-6b t2, SJ-10 t1
  readonly basedOnVersion: number;                     // the version the author read; 0: none existed yet; a late one runs against the current version · SJ-6a t5, SJ-6b t8
}
/** Exactly one branch: on the wire, a `oneOf` of two closed objects. A `drop` carries no text: a reader who may not read a selector can still drop it. */
export type SessionContextAmendmentV1 =
  | (SessionContextAmendmentAuthorV1 & { readonly op: 'keep'; readonly match: Exclude<SessionContextSelectorMatchV1, { readonly kind: 'withheld' }> })  // SJ-6a t1, SJ-6b t9
  | (SessionContextAmendmentAuthorV1 & { readonly op: 'drop'; readonly selectorId: string });  // SJ-6a t2, SJ-6b t1, t7
export interface SessionContextGateVerdictV1 {         // what the gate of §2.3 says of one amendment
  readonly selectorId: string; readonly verdict: 'accepted' | 'no_change' | 'refused';  // SJ-6b t2, SJ-6a t1, t4
  readonly reason?: string;                            // set when refused; open. Defined here: `outside_rights` (SJ-6a t3), `selector_ceiling` (SJ-6a t4), `unattributed` (SJ-10 t1), `journal_off` (SJ-6b t5)
}
export interface SessionContextWatermarkV1 { readonly queryId: string; readonly queryVersion: number; readonly cursor: Cursor }  // what the host session still holds; queryVersion is 1 or more · SJ-1a t3, t6
/** Optional member of the journal envelope. Exactly one of `held` and `reset` is set. Never null. */
export interface SessionContextRequestV1 {
  readonly held?: SessionContextWatermarkV1;           // what the session still holds: the answer is a diff · SJ-1a t2, t5
  readonly reset?: 'compaction' | 'clear' | 'restart'; // its context was emptied: the answer is the full view · SJ-1a t4, t5
  readonly hostSignal?: string;                        // the host's own name for that signal; open, 1..64 bytes · SJ-4 t3
  readonly loop?: { readonly objectiveLoopId: string; readonly trackScope: readonly SessionTrackScopeRefV1[] };  // SJ-14 t4, SJ-15 t1
}
export interface SessionContextItemRefV1 {
  readonly ref: string; readonly digest: Sha256Digest; // SJ-1c t6
  readonly slice: RawSessionEventReceipt['readySlices'][number];  // the five slices of Spec 1 :361 · SJ-1c t6
  readonly change: 'added' | 'withdrawn';              // SJ-1c t5
  readonly disclosure: 'text' | 'reference';           // D6, §6.5 · SJ-2c t2
  readonly authoredBy: 'code' | 'shadow' | 'main_model' | 'dreaming';  // SJ-10 t5, SJ-13 t1
  readonly authorModelRef?: string; readonly sourceEventRecordIds: readonly string[];  // the model when one wrote the item; at least one source unless authoredBy === 'code' · SJ-10 t1
}
/** Optional member of the journal receipt. The text travels in `readySlicePayloads`. */
export interface SessionContextDeliveryV1 {
  readonly mode: 'diff' | 'full';                      // SJ-1a t2, t4
  readonly watermark: SessionContextWatermarkV1; readonly queryDigest: Sha256Digest;  // the host stores the watermark once the payloads are applied · SJ-2a t3
  readonly byteLength: number;                         // UTF-8 bytes of all payloads; 0: nothing to inject · SJ-1a t2
  readonly items: readonly SessionContextItemRefV1[];  // SJ-1c t6
  readonly annotatedThroughOrdinal?: number;           // the shadow has read the journal up to this step; absent: it has read nothing yet, or it is off · SJ-10 t3, t4
  readonly overflow?: 'pinned_request_over_ceiling';   // SJ-1c t4
}
/** D18: what a session without a memory identity receives. Never recorded. Carried by the outcome of the journal call (block B, delta S1-k). */
export interface SessionReadOnlyDeliveryV1 {
  readonly policyDigest: Sha256Digest;                 // the verified policy that lists the allowed slices · SJ-2b t1
  readonly allowedSlices: readonly ('track' | 'git' | 'architecture' | 'rules')[];  // never 'memory' · SJ-2b t3
  readonly readySlicePayloads: Partial<Record<'track' | 'git' | 'architecture' | 'rules', string>>;  // SJ-2b t1
  readonly contextDelivery: SessionContextDeliveryV1;  // no item of the slice 'memory'; its watermark names the computed query, always at version 1 · SJ-2b t1, t4
}
export interface SessionHistoryMatchV1 {               // one match of a search in the journal (`session_context` set)
  readonly eventRecordId: string; readonly digest: Sha256Digest;  // SJ-5b t1
  readonly locator: string; readonly lineStart: number; readonly lineEnd: number;  // the `session-db` locator of Spec 1 :167 · SJ-5b t1
  readonly disclosure: 'text' | 'reference'; readonly text?: string;  // the text is absent when disclosure === 'reference' · SJ-5b t3
}
/** The wire form of T: every property name in snake_case, at every depth; values unchanged. One codec writes it and reads it; it refuses a key it does not know. */
type SnakeKey<S extends string> = S extends `${infer H}${infer T}` ? `${H extends Lowercase<H> ? H : `_${Lowercase<H>}`}${SnakeKey<T>}` : S;
export type SessionContextWire<T> = T extends readonly (infer U)[] ? readonly SessionContextWire<U>[] : T extends object ? { readonly [K in keyof T as SnakeKey<K & string>]: SessionContextWire<T[K]> } : T;
export declare function toSessionContextWire<T>(value: T): SessionContextWire<T>; export declare function fromSessionContextWire<T>(wire: SessionContextWire<T>): T;  // SJ-5a t5
/** Deltas S1-b, S1-c, S1-d, S1-e, S1-i and S1-f: the optional members this spec adds to Spec 1 shapes. */
export interface SpeechTurnJournalFieldsV1 {           // on `speech_turn`, Spec 1 :240-258
  readonly promptCitation?: SessionDbCitationTuple; readonly reasoningCitations?: readonly SessionDbCitationTuple[];  // SJ-1b t1
  readonly planCitation?: SessionDbCitationTuple;      // SJ-12 t4
  readonly authorModelRef?: string;                    // `provider:model`, on assistant turns; a statement of the hook, used for no right · SJ-1b t1
}
export interface ToolResultJournalFieldsV1 { readonly callCitation?: SessionDbCitationTuple; readonly durationMs?: number }  // on `tool_result`, Spec 1 :259-269: the call, its arguments and its context · SJ-1b t1
export interface SessionJournalEnvelopeFieldsV1 {      // on the envelope, Spec 1 :319-349
  readonly contextRequest?: SessionContextRequestV1;                  // SJ-2a t2, t3
  readonly contextAmendments?: readonly SessionContextWire<SessionContextAmendmentV1>[];  // what the search returned, unchanged; only on the note of a search call · SJ-6b t2, t6, SJ-4 t6
}
export interface SessionJournalReceiptFieldsV1 {       // on the receipt, Spec 1 :351-373
  readonly contextDelivery?: SessionContextDeliveryV1;                         // SJ-2a t3
  readonly contextAmendmentVerdicts?: readonly SessionContextGateVerdictV1[];  // SJ-6b t2
  readonly pendingProactiveRoleProposalId?: string;                            // SJ-16e t1, t2
}
export interface SessionExtractionBatchFieldsV1 { readonly contextAmendments?: readonly SessionContextAmendmentV1[] }  // on the extraction batch, Spec 1 :408-429; journal form: cluster-mesh builds the batch in process · SJ-10 t2
export interface SessionExtractionReceiptFieldsV1 { readonly contextAmendmentVerdicts?: readonly SessionContextGateVerdictV1[] }  // on its receipt · SJ-10 t2
export interface SessionContextPolicyV1 {              // workspace settings; a host or a run may lower the numbers, never raise them
  readonly journalEnabled: boolean; readonly maxSelectors: number;   // defaults false (OD:83) and 64 (proposed) · SJ-2a t1, SJ-6a t4
  readonly viewMaxTokens: number; readonly rebuildAtTokens: number;  // defaults 8_000 (proposed) and 18_000 (D6 B, ANS:42) · SJ-1c t2, SJ-12 t2
}
// ── B. engram — `src/mcp/memory/contracts.ts` (the `v2` search types) and `src/session-front-contracts.ts` (the journal wrapper). Uses block A, block C, Result (`engram-memory/contracts`), and the envelope and the port of Spec 1 (:319-349, :459-463).
export type SearchInputV2 = SearchInputV1 & { readonly session_context?: 'history' | 'keep' | 'drop' };  // SearchInputV1: src/mcp/memory/contracts.ts:311-318 · SJ-5a t1, t4
export type SearchPageV2 = SearchPageV1 & {            // SearchPageV1: :360-365. Every member below is in wire form, checked by `validateSearchOutputV2` · SJ-5a t2
  readonly history_matches?: readonly SessionContextWire<SessionHistoryMatchV1>[];     // SJ-5b t1
  readonly session_context_query?: SessionContextWire<SessionContextQueryV1>;          // as committed; absent before version 1 and with the journal off · SJ-6b t1, t5, t8
  readonly session_context_amendment?: SessionContextWire<SessionContextAmendmentV1>;  // keep, drop: what the note must carry · SJ-6b t1
  readonly session_context_verdict?: SessionContextWire<SessionContextGateVerdictV1>;  // the gate, evaluated without writing · SJ-6b t1, t5
};
/** Host-verified facts of one journal call. A separate argument: no request body can carry them. */
export interface SessionJournalHostFactsV1 {
  readonly binding?: SessionContextBindingV1;          // block C; absent: the reader is external and not authorized · SJ-2c t1, t4
  readonly readOnlyPolicy?: Pick<SessionReadOnlyDeliveryV1, 'policyDigest' | 'allowedSlices'>;  // the verified D18 policy, Spec 4 :968 · SJ-2b t1
}
export interface SessionJournalOutcomeV1 {
  readonly recorded: Result<RawSessionEventReceipt>;   // exactly the Spec 1 result, `MemoryErrorV1` included · SJ-2c t1
  readonly readOnlyDelivery?: SessionReadOnlyDeliveryV1;  // D18 only; `recorded` is then the refusal of Spec 1 :481 · SJ-2b t1
}
/** The one wrapper around the frozen Spec 1 port. It records what `recordSessionEvent(envelope)` records: one event, one commit, the same key. */
export interface EngramSessionJournalPortV1 {
  readonly version: 1; readonly ingest: EngramSessionIngestFrontPort;  // the port of Spec 1 :459-463, unchanged
  noteSessionEvent(envelope: RawSessionEventEnvelope, host: SessionJournalHostFactsV1): Promise<SessionJournalOutcomeV1>;  // SJ-2c t1, t6
}
// ── C. sentropic `mcp-platform` — `@sentropic/mcp-platform/memory`, beside the projection (`PLAT:77-123`). `Digest` is the platform's name for the same `sha256:` template (`PLAT:3`).
/** The verified facts about the caller of one call. Built by cluster-mesh at each call (§2.6). Never by a model. */
export interface SessionContextBindingV1 {
  readonly tenant_id: string; readonly workspace_id: string;  // SJ-7c t1
  readonly derived_worktree_id: string; readonly session_pseudo_id: string;  // Spec 1 :330, :333 · SJ-7c t1, t5
  readonly role_ref?: string; readonly mandate_digest?: Digest;  // the role of the verified mandate; absent: no role (D16) · SJ-7c t1, t2
  readonly reader_model_ref?: string;                  // `provider:model`, from a verified launch receipt; absent: external, not authorized · SJ-7f t1, t2
  readonly reader_is_local: boolean; readonly reader_content_authorized: boolean;  // the provider runs on the owner's machine; the content act covers it · SJ-7f t4, t5
  readonly content_policy_digest?: Digest;             // the policy that decided · SJ-7f t5
}
// ── D. sentropic `cluster-mesh` — host policies. engram never reads them: it receives their result in the binding.
export interface AnnotationRoutePolicyV1 {
  readonly mode: 'llm' | 'heuristic' | 'finetuned' | 'rl' | 'off';  // SJ-9 t4
  readonly direct: readonly string[]; readonly dreaming: readonly string[];  // ordered `provider:model`; the owner's lists (OP-1); `dreaming` may name a more frontier model · SJ-9 t1, t4
  readonly singleAccountByProvider?: Readonly<Record<string, string>>;  // provider → its small model, when one account only is ready · SJ-9 t2
  readonly qualified: readonly string[];               // passed gate A; only these may feed a view · SJ-9 t2, SJ-11 t3
}
export interface ModelContentAuthorizationPolicyV1 {
  readonly tenantId: string; readonly workspaceId: string; readonly policyDigestSha256?: Sha256Digest;  // SJ-7f t5
  readonly contentAuthorized: boolean; readonly authorizedProviderIds: readonly string[];  // default false; the external providers the owner's act covers · SJ-7f t5
}
// ── E. h2a — `@sentropic/h2a`. Written by h2a; cluster-mesh reads them as JSON it validates. Property names as written, like the mandate body (Spec 6A :327-337).
/** Carried in `params._meta['sentropic.h2a.session']`. A lookup key, trusted for nothing else. On the journal call the envelope carries the same two values. */
export interface SessionCallerRefV1 { readonly sessionPseudoId: string; readonly derivedWorktreeId: string }  // SJ-7d t2, SJ-7c t5
/** The launch receipt: the body of an `H2AEnvelope` of type `event`, signed with a key of the launched instance. Carried in `params._meta['sentropic.h2a.launch']` and in `X-Sentropic-H2A-Launch` (base64url JSON, at most 8 KiB, as the mandate header, Spec 6A :384). */
export interface H2ASeatLaunchBodyV1 {
  readonly kind: 'SEAT_LAUNCH'; readonly launchedAt: string;  // RFC 3339 UTC · SJ-7e t1
  readonly instance: string;                           // the launched seat: the envelope's actor, and the authenticated caller · SJ-7f t2
  readonly hostId: string; readonly derivedWorktreeId: string;  // the CLI started, open as in delta S1-a; its worktree · SJ-7e t1
  readonly mainModelRef: string;                       // `provider:model` the seat was started with · SJ-7f t1
}
```

Two seams inside engram carry the above. They are not wire contracts:
- `MemoryReadInvocationV1` (`src/memory-tools/reads.ts:11-27`) gains optional `session_binding: SessionContextBindingV1`, imported type-only from the platform. The provider copies it from the `v2` projection (`src/mcp-memory/provider.ts:810-826`). Lots `SJ-5c` t5, `SJ-5b` t4.
- `createMemoryReadToolsV1` (`src/memory-tools/reads.ts:79`) and the provider options (`src/mcp-memory/provider.ts:316-330`) gain one optional read-only facet for the journal and the query, beside `facets`: `MemoryReadFacetsV1` is an L0 type (`src/memory-tools/reads.ts:4`) and takes no type of this spec. The facet also says whether the workspace has opted in. Absent: a `session_context` call answers `CAPABILITY_UNAVAILABLE`, as for the two existing ports (`src/memory-tools/reads.ts:105`). Lot `SJ-5b` t4.

Rules that go with the contracts:
- Without `session_context`, input and output are exactly `v1`. `records` keeps its `v1` meaning in every case.
- No field is ever `null`. An absent value is an omitted property: the validator of the tool schemas refuses `null` (`src/mcp/memory/schemas.ts:933-935`, `:3518-3520`). The journal call follows the same rule.
- The whole page obeys the existing `max_packet_bytes` (`src/mcp/memory/contracts.ts:266-268`), and `response_digest` covers the whole `v2` page (`src/memory-tools/reads.ts:176`).
- In `session_context_query`, a selector whose text was written in another session is shown as `withheld` until the content authorization act covers the reader. Its `selectorId` stays: the agent drops it by that id. A `drop` reads a `query` of the form `scs_` + 64 hex as a `selectorId`, and any other `query` as a text.
- One function, in block B, decides `text` or `reference` from the binding, for the journal call and for the search alike (`SJ-2c` t2). `recordSessionEvent(envelope)` called alone has no binding: its reader is external and not authorized.
- Tokens are counted as 3 UTF-8 bytes each when the host gives no count (`proposed`; same ratio as `ALV2:481`). `H2ALoopTrackRef.system` is not copied into `SessionTrackScopeRefV1`: the list is Track-only by its name.
