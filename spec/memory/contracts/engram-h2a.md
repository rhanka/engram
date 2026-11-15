# Contract: `engram` ↔ `h2a` (Harness Master, Overlays, Role Ontology, Context Query, and MCP)

- **Status:** `decided 2026-11-14` (`docs/memory-r15-sediment`; amended per [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md), §2.2 interfaces `proposed`)
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-h2a.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`): Primary session ingestion front, canonical graph memory authority (`D28=engram` — authoritative over recorded memory facts and the live registry, **not** authority over `Track` or `h2a` ontology templates), master of the shared ontology metamodel and lineage registry (`Spec 0`: grammar, versions, digests, derivation and composition rules; `engram` validates template well-formedness, may propose role changes, and never authors or modifies `h2a` or `Track` templates), contextual graph query engine (`D19`, `D20`, `D22`, `D23`), and Git/PR serialization producer (`D34=engram`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:11-12,24]`.
  - **`h2a`** (`h2a repository: packages/h2a`): Master and sole author of the role/activity, harness-skill, and master-harness templates (`D16`, `D31` — registered as the `h2a` profile lineage in `engram`'s registry, sibling to and distinct from the `Track` domain template lineage authored solely by `Track`), formal mandate authority (`D3`, `D4`, `D10`), CLI host plugin runtime across 8 hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`), and interactive/async decision review tool owner (`D27`) `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:85-152; packages/h2a/src/runtime/drive/index.ts:331-337; memory-dossier/owner-r15/comments-2026-11-08.md:2,12,14; spec/memory/OWNER-DECISIONS-2026-11-14.md:24]`.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `h2a`
1. **Primary Session Ingestion Front (`D19`, `D24`, `D32`):** First-rank ingestion of every session datum emitted by `h2a` CLI host hooks (`tour de parole` speech turns, tool results, owner decisions, harness rules, and mandate bindings) before `Track` or any other analyst executes `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15,19]`.
2. **Shared Ontology Metamodel, Multi-Lineage Registry, and Derivable Graph Substrate (`Spec 0`, `D4`, `D16`, Point 4B):** Published, versioned metamodel grammar, multi-lineage registry (hosting `archi@1` unchanged alongside the sibling `h2a` and `Track` lineages), version-pinned cross-lineage composition rules, metamodel well-formedness validation (accepting with digest or refusing with diagnostics, never authoring or mutating templates), and graph storage hosting the `h2a` role, scope, typical-activity, and harness-skill templates `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2; memory-dossier/owner-r8/comments-2026-11-07.md:17; spec/memory/OWNER-DECISIONS-2026-11-14.md:12,24]`.
3. **Derived Worktree Graph Modelling (`D21`):** First-class graph entities representing derived git worktrees (derived copies retaining their parent origin link, branch/worktree state, and attached session logs) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:5]`.
4. **Durationless Contextual Graph Query Engine (`D19`, `D20`, `D22`, `D23`, Point 2B):** The seventh memory tool (proposed name `engram_memory_context` — built now disabled by default, going live only after the `engram` + `sentropic` co-signature and `MCP-L5` production qualification, followed by host-by-host switchover with a fixed end date) and underlying query engine that replaces linear session transcripts at every prompt step with a Mandate+Role-fingerprint graph query, returning active mission focus, significant tool results, owner decisions, applicable master+overlay harness rules, and on-demand queryable session text history. The seventh tool contract fixes only the envelope (template reference and digest), never a closed list of `Track` or domain types `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:3-4,6-8; spec/memory/OWNER-DECISIONS-2026-11-14.md:22]`.
5. **Dormant Dreaming Resynthesis (`D19`, `D25`, `D26`, Point 3C):** Background session resynthesis running on default cadences nightly (the owner's « daily »), weekly and monthly, and event triggers mid-day and context saturation (nightly, mid-day, and saturation locally; weekly, monthly, and cross-repository master harness audit remotely after graph sync), surfacing long-term permanent facts forgotten in short-term execution `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:3,7,11; spec/memory/OWNER-DECISIONS-2026-11-14.md:23]`.
6. **Harness Overlay Serialization to Git (`D31`, `D34`, Point 4B):** Deterministic serialization of per-developer, per-workspace, and per-repository harness overlays (`surcouches`, `proposed` `.h2a/` path) into Git-committed files alongside `engram` specs and `Track` slices; a `.h2a/` overlay never modifies a `Track` template or bypasses `Track` control `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:14; spec/memory/OWNER-DECISIONS-2026-11-14.md:11,24]`.

### 1.2 `h2a` Provides to `engram`
1. **Live Session & Turn Stream (`D11`, `D12`, `D13`, `D14`, `D19`, `proposed`):** `proposed` structured turn boundaries (`tour de parole`), significant tool execution results, session lifecycle window signals (`D14=window`), and send-time promotion sweeps (`D12=turn`) across the 8 CLI hosts—with speech-turn capture (`recordSpeechTurn` / `recordSessionEvent`) fed either by the host's native prompt hook or, as a fallback for hosts without a synchronous user-prompt hook (`agy`, `muse`, `vibe`), by the `h2a` envelope, `post_agent`, or an MCP call; today `packages/h2a/src/hosts/plugin.ts` renders workspace-scope guard, stop (`drumbeat record`), drive receive, and drumbeat poll hooks `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:22-46,85-152,182-210; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; memory-dossier/owner-r8/comments-2026-11-07.md:7]`.
2. **Formal Signed h2a Mandates (`D3`, `D4`, `D10`, `D22`):** Signed `MANDATE` artifacts, issued only by roles listed in `H2A_AUTHORITY_MATRIX.MANDATE` (`packages/h2a/src/runtime/drive/index.ts:331-337`) `[FACT]`. The envelope fields `D22` uses (actor, role, scope, workspace) are `proposed` `[JUDGMENT]`; used as a primary component of the `D22` session graph fingerprint and required for `D3`/`D4`/`D10` admission, disposition, and federation `[FACT: h2a repository: packages/h2a/src/runtime/drive/index.ts:331-337; memory-dossier/owner-r15/comments-2026-11-08.md:6]`.
3. **Master Harness & Role/Activity/Skill Ontology Templates (`D16`, `D31`, Point 4B):** As sole author and master of its templates, `h2a` provides the canonical `h2a` master harness templates and the `h2a` profile template of standard roles (agent and human), typical activities (`activité types`), and harness skills (referencing any `Track` domain objects strictly by version-pinned metamodel composition without redefining `Track` types), plus proactive role/rule analysis proposals whenever an active session lacks an assigned role (`« Quand il n y a pas de role, h2a devrait etre proactif en analyse et proposition. »`; `engram` may propose role changes, never write them) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2,14,25; spec/memory/OWNER-DECISIONS-2026-11-14.md:24]`.
4. **Decision Dossier & Non-Blocking Review Captures (`D27`):** Structured outputs from interactive or asynchronous swipe/dossier review sessions (`decision-only` quality exchanges yielding contextualized facts and associated project or harness decisions) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:12; memory-dossier/owner-r8/comments-2026-11-07.md:54]`.

---

## 2. Interfaces

All communication between `h2a` and `engram` transits through `@sentropic/cluster-mesh` and the `packages/mcp-platform` registry (`R12`, `D24`) `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.

### 2.1 Existing Interfaces (in `@sentropic/engram` 0.26.0 / `SPEC_MEMORY_MCP_V2.md`)
- `engram_memory_search`, `engram_memory_get`, `engram_memory_capture`, `engram_memory_request_admission`, `engram_memory_withdraw`, `engram_memory_forget` (`spec/SPEC_MEMORY_MCP_V2.md:49-58`). `@sentropic/engram` 0.26.0 ships them as six in-process tools (`src/memory-tools/`, export `./memory-tools`), disabled by default (`plan/08-BRANCH_MEMORY_FINALIZATION.md:202`). Since 0.22.0 an optional MCP adapter, the MCP-L4 candidate (`./mcp-memory`, `./registry/*`; `src/mcp-memory/provider.ts`), ships disabled by default and pending MCP-L5 qualification (`CHANGELOG.md:42-44`). h2a reaches the in-process `MemoryPortV2` through `packages/h2a/src/runtime/memory/port-v2-adapter.ts` over the vendored V2 types (`graphify-contracts-v2.vendored.ts`), not through these tools `[FACT: package.json:3,22,35,39,43; CHANGELOG.md:42-44; spec/SPEC_MEMORY_MCP_V2.md:49-58; plan/08-BRANCH_MEMORY_FINALIZATION.md:202; h2a repository: packages/h2a/src/runtime/memory/port-v2-adapter.ts:1-12]`.

### 2.2 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

```ts
export type Sha256Digest = `sha256:${string}`; // 64 hex lowercase over RFC 8785 (JCS) UTF-8 bytes

// status: proposed — Neutral metamodel template-reference and digest envelope (Spec 0, Point 2B, Point 4B)
export interface OntologyTemplateEnvelopeRef {
  lineage: 'archi' | 'h2a' | 'track' | 'engram'; // LineageId (Spec 0 :147, Spec 6A §0.3 / §5.1)
  templateId: string;
  templateVersion: string;
  templateDigestSha256: Sha256Digest;
}

// status: proposed — Primary session event recorder & post-recording extraction port (D19, D24, D32)
export interface EngramSessionIngestFrontPort {
  /**
   * First-rank raw session event recording: engram records the raw speech turn,
   * tool results, and file/artifact references before any extraction or analysis runs.
   */
  recordSessionEvent(input: {
    tenantId: string;
    workspaceId: string;
    derivedWorktreeId: string;       // D21 derived Git worktree node ID
    sessionId: string;
    turnIndex: number;
    mandateRef: string | null;     // D4/D22 formal h2a mandate reference (null if unassigned -> triggers D16 proactive analysis)
    roleId: string | null;         // D16 h2a role graph node ID
    speechTurn: {                  // "tour de parole"
      actorKind: 'owner' | 'human' | 'agent' | 'system';
      actorPseudoId: string;       // D33 pseudonymized actor ID
      contentRef: string;          // Stored in queryable text history graph (D23); cites session-db EntryRecord as (session_id, entry_id, ordinal, content_digest) (+ branchEpoch / parentEntryId on forks)
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
   * extracted entity, decision, and rule proposals back into engram. Project-domain
   * proposals cite their Track template envelope and stay 'proposed' until the Track
   * application's authoritative control verdict (Point 5B).
   */
  recordExtraction(input: {
    tenantId: string;
    workspaceId: string;
    eventNodeId: string;           // Reference to the recorded raw event in engram
    extractorKind: 'light-permanent-llm' | 'session-llm' | 'specialized-model';
    proposals: Array<{
      domain: 'project' | 'harness'; // D3/D31: routed to Track vs Harness overlay
      templateEnvelopeRef: OntologyTemplateEnvelopeRef | null; // Cited Track or h2a template reference + digest
      candidateEntityTypeId: string | null; // Open template-defined type; never a closed list in engram
      statement: string;
      contextFactRefs: string[];     // D27 contextualized facts
      extractorReviewHint: boolean;  // Advisory hint only; D1/D2 review gate is decided by Track or harness control
    }>;
  }): Promise<{ proposalNodeIds: string[] }>;
}

// status: proposed — 7th MCP tool: proposed name engram_memory_context (D19, D20, D22, D23)
export interface EngramMemoryContextToolInput {
  tenantId: string;
  workspaceId: string;
  derivedWorktreeId: string;         // D21
  mandateEnvelope: {               // D22 primary component of fingerprint query (H2AEnvelope<H2AMandate>; null when unassigned per D16/D18)
    mandateId: string;
    instance: string;
    role: 'PRINCIPAL' | 'EXECUTIF' | 'CONDUCTOR' | 'AGENTS' | 'CONTROL' | 'MANDATAIRE' | null;
    scope: string;
    rights: readonly string[];
    envelopeDigest: Sha256Digest;
    signatures: ReadonlyArray<{ by: string; alg: string; value: string }>;
  } | null;
  previousStepResult: {            // D23 reprocessed previous result
    stepId: string;
    reprocessedSummary: string;
    significantToolRefs: string[];
  } | null;
  queryText: string | null;        // Optional on-demand text history query (D23)
}

// Point 2B: The 7th tool contract fixes only the envelope (template reference and digest),
// never a closed list of Track or h2a domain types.
export interface EngramMemoryContextToolOutput {
  fingerprintQueryId: string;
  roleConsciousnessSlice: {        // D16 + D22 role & activity ontology slice (h2a template lineage)
    roleTemplateEnvelope: OntologyTemplateEnvelopeRef;
    activeRoleId: string | null;
    proactiveRoleProposal: { proposedRoleId: string; rationale: string } | null; // D16 when no role (proposal only; engram never writes roles)
    allowedActivities: string[];
    multiActorRelations: Array<{ targetRoleId: string; relation: string }>;
  };
  harnessEffectiveRules: {         // D31 master + workspace/repo overlay (h2a harness template lineage)
    harnessTemplateEnvelope: OntologyTemplateEnvelopeRef;
    masterHarnessVersion: string;
    workspaceOverlayRef: string;
    activeRules: string[];
  };
  missionFocusContext: {           // D23 attention on significant elements + D15 envelope-only domain slices
    ownerDecisions: Array<{ id: string; statement: string }>;
    domainTypedEnvelopes: Array<{  // Envelope-only carrier for Track or h2a typed items (reference + digest, never a closed type list)
      templateEnvelope: OntologyTemplateEnvelopeRef;
      entityTypeId: string;
      entityId: string;
      controlVerdictAuthority: 'track' | 'engram' | null;
      payload: Record<string, unknown>;
    }>;
    significantToolResults: Array<{ id: string; summary: string }>;
    dreamingRecalledFacts: Array<{
      id: string;
      summary: string;
      trigger: 'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation';
    }>;
  };
  sessionHistoryQueryMatches: Array<{ turnNodeId: string; excerpt: string }> | null; // D8 bounded + PII-armored
}

// status: proposed — Role/Activity/Skill Template Lineage + Harness Overlay Port (Spec 0, D16, D31, D34, Point 4B)
export interface EngramHarnessAndOntologyPort {
  upsertRoleOntologyGraph(input: {
    writerMandateId: string;       // Sole author/writer of the 'h2a' lineage: the h2a mandate-and-role manager (D4, Point 4B)
    metamodelVersion: string;      // Shared engram metamodel version (Spec 0)
    templateEnvelope: OntologyTemplateEnvelopeRef; // lineage: 'h2a', version + digest
    composedLineagePins: OntologyTemplateEnvelopeRef[]; // Version-pinned references to archi@1 and (when skills cite Track) to 'track' lineage
    roles: Array<{
      roleId: string;
      actorClass: 'h2a-standard' | 'human-classic';
      scopes: readonly string[];
      allowedArtifactKinds: readonly string[];
      mandateRights?: readonly string[];
      typicalActivities: string[];
      harnessSkillGraphIds?: string[];
      multiActorEdges: Array<{ relation: string; targetRoleId: string }>;
      derivationModelRef: string;
    }>;
  }): Promise<
    | { status: 'accepted'; graphCommitId: string; templateEnvelope: OntologyTemplateEnvelopeRef }
    | { status: 'refused-metamodel-invalid'; diagnostics: string[] } // Engram validates metamodel well-formedness only; never writes or repairs templates
  >;

  recordHarnessDecisionAndSerializeOverlay(input: {
    tenantId: string;
    workspaceId: string;
    repositoryId: string;
    developerId: string;           // D33 pseudonymized
    mandateId: string;             // D4
    harnessTemplateEnvelope: OntologyTemplateEnvelopeRef; // h2a master harness template reference + digest
    masterHarnessRef: string;      // h2a master harness baseline
    overlayDelta: Record<string, unknown>; // Harness-only delta; any modification to a Track template is refused (Point 4B)
  }): Promise<{
    decisionNodeId: string;
    serializedOverlayPath: string; // Committed to Git (proposed .h2a/ path) per D31/D34
  }>;
}
```

---

## 3. Architectural Invariants

1. **Engram-First Ordering (`D24`, `D32`):** `h2a` host integrations MUST record raw session turns, tool results, and file references in `engram` first (`recordSessionEvent` / `recordSpeechTurn`, fed either by the host's native prompt hook or, as a fallback on hosts without a synchronous prompt hook—`agy`, `muse`, `vibe`—by the `h2a` envelope, `post_agent`, or an MCP call), before live extraction (`recordExtraction`), `Track`, or any harness analyst reads or acts on them `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:108-149; memory-dossier/owner-r15/comments-2026-11-08.md:15,19]`.
2. **Zero Linear Context Accumulation, Staged Rollout & Envelope-Only 7th Tool (`D19`, `D20`, `D22`, `D23`, Point 2B):** The seventh memory tool (proposed name `engram_memory_context`) is built now disabled by default and goes live only after the `engram` + `sentropic` co-signature and `MCP-L5` production qualification, after which CLI hosts switch one by one to a fixed end date. Once switched, `h2a` MUST NOT accumulate multi-turn raw conversation transcripts in LLM prompts or execute session rollover handoffs: every prompt step is durationless and independent, constructed from `engram_memory_context` (using the signed `h2a` mandate as primary fingerprint component) + the query result + the reprocessed output of the immediately preceding step. The seventh tool contract fixes only the envelope (template reference and digest), never a closed list of `Track` or domain types `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:6-8; spec/memory/OWNER-DECISIONS-2026-11-14.md:22]`.
3. **Metamodel vs Template Mastery & Sibling Lineages (`Spec 0`, `D16`, Point 4B):** `engram` is master of the shared ontology metamodel and lineage registry; its « canonical graph memory authority » (`D28=engram`) governs recorded memory facts and the live registry, and is **not** authority over `Track` or `h2a` templates. Two sibling lineages sit under `engram`'s metamodel alongside `archi@1` (whose eleven kinds and fifteen relations stay unchanged): `h2a` is master and sole author of the role, activity, and harness-skill profile templates (`engram` may propose role changes—and when a session has no role, `h2a` runs proactive analysis over `engram` and proposes a role and scope—but `engram` never writes role templates), while `Track` is sole author of the `Track` domain ontology templates. Cross-references go strictly by composition with version pinning, never redefining `Track` types `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2; spec/memory/OWNER-DECISIONS-2026-11-14.md:11-12,24]`.
4. **Master Harness Templates + Git-Serialized Workspace Overlays (`D31`, `D34`, Point 4B):** `h2a` is master of the master harness templates; `engram` records all harness decisions in first rank and serializes each developer/workspace/repository harness overlay (`surcouche`, `proposed` `.h2a/` path) into a Git-committed artifact. A `.h2a/` harness overlay never modifies a `Track` template or bypasses `Track` application control `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:14; spec/memory/OWNER-DECISIONS-2026-11-14.md:11,24]`.
5. **Formal Mandate Gate & Same-Role Recall (`D3`, `D4`, `D5`, `D10`, `D18`):** Mutations (admission, disposition, promotion, overlay serialization, cross-workspace federation) require a valid signed `h2a` mandate (`D4`). A session without a memory identity receives only the non-memory slices, read-only, under a recorded policy (`D18`). Successive sessions of the same `h2a` role, in the same `(tenantId, workspaceId)` space, read the non-admitted bodies before admission (`D5`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:17,21]`.
6. **Cluster-Mesh & MCP Registry Exclusivity (`R12`):** `h2a` MUST NOT instantiate direct SQLite/file memory stores or standalone MCP servers outside `@sentropic/cluster-mesh` and the `packages/mcp-platform` registry `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.
7. **Multi-repo harness audit and harness graphs (owner, 2026-11-08; Point 3C, Point 4B):** the `h2a` master harness is reviewed by the dreaming agent in a remote multi-repo audit after graph sync (`Point 3C`); each repository's harness overlay evolves in that repository. `h2a` harness skills and `h2a` roles are `engram` graphs in the `h2a` template lineage (`proposed`; no such graph exists today), referencing `Track` domain objects only by version-pinned composition `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:24-25; spec/memory/OWNER-DECISIONS-2026-11-14.md:23-24]`.

---

## 4. Out of Scope

- `Track` domain ontology templates (mastered by `Track`), `Track` application control verdicts and pre-merge acceptance, project event timeline projections, and per-PR `.track/` projection formatting (governed by `spec/memory/contracts/engram-track.md`; only version-pinned cross-lineage references from `h2a` templates sit in this contract) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:11-13,21,24-25]`.
- Low-level SQLite/Postgres storage drivers and transactional DB-cluster replication wire protocols (governed by `spec/memory/contracts/engram-cluster-mesh.md`) `[JUDGMENT]`.
- Direct GitHub/board UI rendering (GitHub and boards are an external HMI/input layer per `D30`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.
