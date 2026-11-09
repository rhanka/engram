# Contract: `engram` ↔ `h2a` (Harness Master, Overlays, Role Ontology, Context Query, and MCP)

- **Status:** `proposed, pending owner review`
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-h2a.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`): Primary session ingestion front, canonical graph memory authority (`D28=engram`), contextual graph query engine (`D19`, `D20`, `D22`, `D23`), and Git/PR serialization producer (`D34=engram`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`.
  - **`h2a`** (`h2a repository: packages/h2a`): Master harness owner (`D31`), formal mandate authority (`D3`, `D4`, `D10`), role and activity ontology manager (`D16`), CLI host plugin runtime across 8 hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`), and interactive/async decision review tool owner (`D27`) `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:85-152; packages/h2a/src/runtime/drive/index.ts:331-337; memory-dossier/owner-r15/comments-2026-11-08.md:2,12,14]`.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `h2a`
1. **Primary Session Ingestion Front (`D19`, `D24`, `D32`):** First-rank ingestion of every session datum emitted by `h2a` CLI host hooks (`tour de parole` speech turns, tool results, owner decisions, harness rules, and mandate bindings) before `Track` or any other analyst executes `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15,19]`.
2. **Derivable Graph Substrate for Roles, Scopes, and Activity Ontologies (`D4`, `D16`):** Graph storage, composition rules, and derivation primitives hosting the `h2a` role registry (both standard `h2a` agent roles and classic human roles), their multi-actor relations, scopes, and typical activity ontologies `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2; memory-dossier/owner-r8/comments-2026-11-07.md:17]`.
3. **Scion-Like Worktree Graph Modelling (`D21`):** First-class graph entities representing derived git worktrees (`Scion`-like copies retaining their parent origin link, branch/worktree state, and attached session logs) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:5]`.
4. **Durationless Contextual Graph Query Engine (`D19`, `D20`, `D22`, `D23`):** The seventh memory tool (proposed name `engram_memory_context`) and underlying query engine that replaces linear session transcripts at every prompt step with a Mandate+Role-fingerprint graph query, returning active mission focus, significant tool results, owner decisions, applicable master+overlay harness rules, and on-demand queryable session text history `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:3-4,6-8]`.
5. **Dormant Dreaming Resynthesis (`D19`, `D25`, `D26`):** Background session resynthesis running on default cadences nightly (the owner's « daily »), weekly and monthly; event triggers mid-day and context saturation, surfacing long-term permanent facts forgotten in short-term execution `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:3,7,11]`.
6. **Harness Overlay Serialization to Git (`D31`, `D34`):** Deterministic serialization of per-developer, per-workspace, and per-repository harness overlays (`surcouches`, `proposed` `.h2a/` path) into Git-committed files alongside `engram` specs and `Track` slices `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:14]`.

### 1.2 `h2a` Provides to `engram`
1. **Live Session & Turn Stream (`D11`, `D12`, `D13`, `D14`, `D19`, `proposed`):** `proposed` structured turn boundaries (`tour de parole`), significant tool execution results, session lifecycle window signals (`D14=window`), and send-time promotion sweeps (`D12=turn`) across the 8 CLI hosts; today `packages/h2a/src/hosts/plugin.ts` renders workspace-scope guard, stop (`drumbeat record`), drive receive, and drumbeat poll hooks `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:22-46,85-152,182-210; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; memory-dossier/owner-r8/comments-2026-11-07.md:7]`.
2. **Formal Signed h2a Mandates (`D3`, `D4`, `D10`, `D22`):** Signed `MANDATE` artifacts, issued only by roles listed in `H2A_AUTHORITY_MATRIX.MANDATE` (`packages/h2a/src/runtime/drive/index.ts:331-337`) `[FACT]`. The envelope fields `D22` uses (actor, role, scope, workspace) are `proposed` `[JUDGMENT]`; used as a primary component of the `D22` session graph fingerprint and required for `D3`/`D4`/`D10` admission, disposition, and federation `[FACT: h2a repository: packages/h2a/src/runtime/drive/index.ts:331-337; memory-dossier/owner-r15/comments-2026-11-08.md:6]`.
3. **Master Harness & Role/Activity Ontology Definitions (`D16`, `D31`):** The canonical `h2a` master harness rules and the `h2a` ontology of standard roles (agent and human) and typical activities (`activité types`), plus proactive role/rule analysis proposals whenever an active session lacks an assigned role (`« Quand il n y a pas de role, h2a devrait etre proactif en analyse et proposition. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2,14]`).
4. **Decision Dossier & Non-Blocking Review Captures (`D27`):** Structured outputs from interactive or asynchronous swipe/dossier review sessions (`decision-only` quality exchanges yielding contextualized facts and associated project or harness decisions) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:12; memory-dossier/owner-r8/comments-2026-11-07.md:54]`.

---

## 2. Interfaces

All communication between `h2a` and `engram` transits through `@sentropic/cluster-mesh` and the `packages/mcp-platform` registry (`R12`, `D24`) `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.

### 2.1 Existing Interfaces (in `@sentropic/engram` 0.26.0 / `SPEC_MEMORY_MCP_V2.md`)
- `engram_memory_search`, `engram_memory_get`, `engram_memory_capture`, `engram_memory_request_admission`, `engram_memory_withdraw`, `engram_memory_forget` (`spec/SPEC_MEMORY_MCP_V2.md:49-58`). `@sentropic/engram` 0.26.0 ships them as six in-process tools (`src/memory-tools/`, export `./memory-tools`), disabled by default (`plan/08-BRANCH_MEMORY_FINALIZATION.md:202`). Since 0.22.0 an optional MCP adapter, the MCP-L4 candidate (`./mcp-memory`, `./registry/*`; `src/mcp-memory/provider.ts`), ships disabled by default and pending MCP-L5 qualification (`CHANGELOG.md:42-44`). h2a reaches the in-process `MemoryPortV2` through `packages/h2a/src/runtime/memory/port-v2-adapter.ts` over the vendored V2 types (`graphify-contracts-v2.vendored.ts`), not through these tools `[FACT: package.json:3,22,35,39,43; CHANGELOG.md:42-44; spec/SPEC_MEMORY_MCP_V2.md:49-58; plan/08-BRANCH_MEMORY_FINALIZATION.md:202; h2a repository: packages/h2a/src/runtime/memory/port-v2-adapter.ts:1-12]`.

### 2.2 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

```ts
// status: proposed — Primary session event recorder & post-recording extraction port (D19, D24, D32)
export interface EngramSessionIngestFrontPort {
  /**
   * First-rank raw session event recording: engram records the raw speech turn,
   * tool results, and file/artifact references before any extraction or analysis runs.
   */
  recordSessionEvent(input: {
    tenantId: string;
    workspaceId: string;
    worktreeScionId: string;       // D21 Scion-like worktree node ID
    sessionId: string;
    turnIndex: number;
    mandateRef: string | null;     // D4/D22 formal h2a mandate reference (null if unassigned -> triggers D16 proactive analysis)
    roleId: string | null;         // D16 h2a role graph node ID
    speechTurn: {                  // "tour de parole"
      actorKind: 'owner' | 'human' | 'agent' | 'system';
      actorPseudoId: string;       // D33 pseudonymized actor ID
      contentRef: string;          // Stored in queryable text history graph (D23)
    };
    toolResults: Array<{
      toolName: string;
      significance: 'high' | 'normal' | 'diagnostic';
      summary: string;
      payloadRef: string;
    }>;
    refs: string[];                // File paths and fingerprints (D6)
  }): Promise<{ eventNodeId: string; saturationTriggered: boolean }>;

  /**
   * Post-recording extraction: reads the recorded raw event from engram and writes
   * extracted entity, decision, and rule proposals back into engram.
   */
  recordExtraction(input: {
    tenantId: string;
    workspaceId: string;
    eventNodeId: string;           // Reference to the recorded raw event in engram
    extractorKind: 'light-permanent-llm' | 'session-llm' | 'specialized-model';
    proposals: Array<{
      domain: 'project' | 'harness'; // D3/D31: routed to Track vs Harness overlay
      statement: string;
      contextFactRefs: string[];     // D27 contextualized facts
      requiresReview: boolean;       // D1=borne-review, D2=review
    }>;
  }): Promise<{ proposalNodeIds: string[] }>;
}

// status: proposed — 7th MCP tool: proposed name engram_memory_context (D19, D20, D22, D23)
export interface EngramMemoryContextToolInput {
  tenantId: string;
  workspaceId: string;
  worktreeScionId: string;         // D21
  mandateEnvelope: {               // D22 primary component of fingerprint query
    mandateId: string;
    roleId: string | null;
    missionScope: string;
    signature: string;
  };
  previousStepResult: {            // D23 reprocessed previous result
    stepId: string;
    reprocessedSummary: string;
    significantToolRefs: string[];
  } | null;
  queryText: string | null;        // Optional on-demand text history query (D23)
}

export interface EngramMemoryContextToolOutput {
  fingerprintQueryId: string;
  roleConsciousnessSlice: {        // D16 + D22 role & activity ontology slice
    activeRoleId: string | null;
    proactiveRoleProposal: { proposedRoleId: string; rationale: string } | null; // D16 when no role
    allowedActivities: string[];
    multiActorRelations: Array<{ targetRoleId: string; relation: string }>;
  };
  harnessEffectiveRules: {         // D31 master + workspace/repo overlay
    masterHarnessVersion: string;
    workspaceOverlayRef: string;
    activeRules: string[];
  };
  missionFocusContext: {           // D23 attention on significant elements
    ownerDecisions: Array<{ id: string; statement: string }>;
    significantToolResults: Array<{ id: string; summary: string }>;
    dreamingRecalledFacts: Array<{
      id: string;
      summary: string;
      trigger: 'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation';
    }>;
  };
  sessionHistoryQueryMatches: Array<{ turnNodeId: string; excerpt: string }> | null; // D8 bounded + PII-armored
}

// status: proposed — Role & Activity Ontology + Harness Overlay Port (D16, D31, D34)
export interface EngramHarnessAndOntologyPort {
  upsertRoleOntologyGraph(input: {
    writerMandateId: string;       // single writer: the h2a mandate-and-role manager (owner-r8 comments:18)
    ontologyVersion: string;
    roles: Array<{
      roleId: string;
      actorClass: 'h2a-standard' | 'human-classic';
      scope: string;
      typicalActivities: string[];
      multiActorEdges: Array<{ relation: string; targetRoleId: string }>;
      derivationModelRef: string;
    }>;
  }): Promise<{ graphCommitId: string }>;

  recordHarnessDecisionAndSerializeOverlay(input: {
    tenantId: string;
    workspaceId: string;
    repositoryId: string;
    developerId: string;           // D33 pseudonymized
    mandateId: string;             // D4
    masterHarnessRef: string;      // h2a master harness baseline
    overlayDelta: Record<string, unknown>;
  }): Promise<{
    decisionNodeId: string;
    serializedOverlayPath: string; // Committed to Git (proposed .h2a/ path) per D31/D34
  }>;
}
```

---

## 3. Architectural Invariants

1. **Engram-First Ordering (`D24`, `D32`):** `h2a` host hooks MUST record raw session turns, tool results, and file references in `engram` first (`recordSessionEvent`), before live extraction (`recordExtraction`), `Track`, or any harness analyst reads or acts on them `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15,19]`.
2. **Zero Linear Context Accumulation / Zero Rollover (`D19`, `D22`, `D23`):** `h2a` MUST NOT accumulate multi-turn raw conversation transcripts in LLM prompts or execute session rollover handoffs. Every prompt sent to the LLM is durationless and independent, constructed from the seventh memory tool (proposed name `engram_memory_context`, using the `h2a` mandate as primary fingerprint component) + the query result + the reprocessed output of the immediately preceding step `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:6-8]`.
3. **Role Ontology & Proactive Proposal (`D16`):** Every role (standard `h2a` agent role or classic human role) and its typical activities are represented as an `engram` subgraph governed by the `h2a` ontology and derivable via `engram` graph composition rules. When a session starts or runs without an assigned role, `h2a` MUST run proactive analysis over the `engram` session graph and propose a role and scope `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2]`.
4. **Master Harness + Git-Serialized Workspace Overlays (`D31`, `D34`):** `h2a` owns the master harness definition; `engram` records all harness decisions in first rank and serializes each developer/workspace/repository harness overlay (`surcouche`, `proposed` `.h2a/` path) into a Git-committed artifact `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:14]`.
5. **Formal Mandate Gate & Same-Role Recall (`D3`, `D4`, `D5`, `D10`, `D18`):** Mutations (admission, disposition, promotion, overlay serialization, cross-workspace federation) require a valid signed `h2a` mandate (`D4`). A session without a memory identity receives only the non-memory slices, read-only, under a recorded policy (`D18`). Successive sessions of the same `h2a` role, in the same `(tenantId, workspaceId)` space, read the non-admitted bodies before admission (`D5`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:17,21]`.
6. **Cluster-Mesh & MCP Registry Exclusivity (`R12`):** `h2a` MUST NOT instantiate direct SQLite/file memory stores or standalone MCP servers outside `@sentropic/cluster-mesh` and the `packages/mcp-platform` registry `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.
7. **Multi-repo harness audit and harness graphs (owner, 2026-11-08):** the h2a master harness is reviewed by the dreaming agent in a multi-repo audit reading engram; each repository's harness overlay evolves in that repository. h2a harness skills and h2a roles are engram graphs in the h2a ontology (`proposed`; no such graph exists today) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:24-25]`.

---

## 4. Out of Scope

- Project event timeline projections and per-PR `.track/` slice formatting (governed by `spec/memory/contracts/engram-track.md`) `[JUDGMENT]`.
- Low-level SQLite/Postgres storage drivers and transactional DB-cluster replication wire protocols (governed by `spec/memory/contracts/engram-cluster-mesh.md`) `[JUDGMENT]`.
- Direct GitHub/board UI rendering (GitHub and boards are an external HMI/input layer per `D30`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.
