# Contract: `engram` ↔ `sentropic/cluster-mesh` (Transactional Graph Sync, MCP Registry, and Storage)

- **Status:** `decided 2026-11-14` (`docs/memory-r15-sediment`; amended per [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md): `decided` covers strictly what was in `EVIDENCE-q6-message-shown-to-owner.md` and `EVIDENCE-q6-owner-question-and-answer.json`; seat-originated sub-clauses not in that question or message are marked **`proposed, not decided by the owner`** with their source seat; §2.3 interfaces `proposed`; 7th-tool and session-journal clauses amended on `2026-11-15` by `D1 A · D2 A · D3 A` with follow-up dossier pending)
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-cluster-mesh.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram` `0.28.0` `[FACT: package.json:3]`, `@sentropic/engram-memory`, `@sentropic/engram-live`): Canonical graph memory authority (`D28=engram`, authoritative over recorded memory facts, not over `Track` or `h2a` templates), master of the shared ontology metamodel and lineage registry (`Spec 0`), transactional graph coordinator (`D24`), and provider of the six frozen `engram_memory_*` tools (`providerId: 'sentropic.engram.memory'`, `connectorId: 'engram-memory'` `[FACT: src/registry/definitions.ts:46-48]`) plus the seventh memory tool (`Point 2B`, `D20=seventh`, built disabled by default until co-signature and qualification, `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:33`; `MCP-L5` qualification gate per `plan/08-BRANCH_MEMORY_FINALIZATION.md:217` and `h2a-position.md:15`; tool identifier `engram_memory_context` `proposed, not decided by the owner` — source seats: conductor, `Fable`, `Carbon`; *amended `2026-11-15` by `D1 A · D2 A · D3 A`, follow-up dossier pending — see top note*) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:4,10; spec/memory/OWNER-DECISIONS-2026-11-14.md:14,23,27]`.
  - **`sentropic/cluster-mesh` & `sentropic/mcp-platform`** (`sentropic repository, origin/main 913e3bcbc: packages/cluster-mesh`, `packages/mcp-platform`, `api/src/services/mcp`): Host persistence adapter for the local store (`embedded-local`, SQLite) and remote store (`external-host`, Postgres backend, multi-node per D-A; the backend is host configuration), domain-blind bidirectional transactional database-cluster replication transport (`D17`, `D24`, Point 6A — carrying typed objects citing their template version without knowing `Track` types `[FACT: EVIDENCE-q6-message-shown-to-owner.md:63,66; EVIDENCE-q6-owner-question-and-answer.json:6,12]`; registered template versions travelling with the graph `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), generic module storage port (`L3a`), and canonical MCP provider registry (`R12`) `[FACT: spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:36-41; sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/engram-memory/binding.ts:1-40; packages/mcp-platform/src/registry.ts:100-143; memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:27]`.

> **Note on `2026-11-15` owner decisions (`D1 A · D2 A · D3 A`) and pending follow-up dossier ([`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md) § « Owner words and dossier decisions of 2026-11-15 »):** On `2026-11-15`, on decision dossier « journal de session en graphe et outil mémoire », the owner decided **`D1 A`** (journal + diff — the three functions: note, return the diff, search history; data in nodes and edges), **`D2 A`** (parallel journal + injected diff: third-party tools keep their thread while `engram` notes each step and injects only what is new), and **`D3 A`** (journal first, in three stages: `(1)` note in third-party tools; `(2)` return the diff and search history; `(3)` our CLI, where `engram` is the primary logger). A follow-up decision dossier requested by the owner on `2026-11-15` (scope: `OWNER-DECISIONS-2026-11-14.md` § « Pending follow-up decision dossier ») is pending; these documents specify no design for its open points until he answers. The `2026-11-14` contract text below has not yet been rewritten and is read with `D1 A · D2 A · D3 A` (`2026-11-15`) and the pending follow-up dossier.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `sentropic/cluster-mesh`
1. **Deterministic Graph Transaction Units (`D24`, Point 6A):** Atomic, serializable graph transaction envelopes covering session records, contextual graph nodes/edges, derived worktree nodes (`D21`), typed domain instances citing their template version (`decided 2026-11-14` `[FACT: EVIDENCE-q6-message-shown-to-owner.md:63; spec/memory/OWNER-DECISIONS-2026-11-14.md:27]`), template SHA-256 `digest` citation (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), registered ontology template versions (`Track`, `h2a`, and `archi@1` lineages, travelling with the graph: `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), authoritative control verdicts (`Point 5B`; distinct `control_verdict` record shape `proposed, not decided by the owner` — source seat: `Fable`), decision records (`D3`, `D27`, `D31`), and dreaming resynthesis commits (`D19`, `D25`) ready for local ACID commit and remote DB-cluster replication (`« De plus j ai demande un partage de graphe entre local et remote. Integral. Engram doit gere ca comme des transaction et synchro de cluster de db via cluster mesh. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:10; spec/memory/OWNER-DECISIONS-2026-11-14.md:27]`).
2. **PII Armor, Pseudonymization, and Confidentiality Filtering (`D7`, `D8`, `D33`):** Pre-egress pseudonymization (`D33=pseudonymize`), confidentiality blacklist enforcement (`D7`), and deterministic metadata + bounded extract shaping (`D8=bounded`) before any graph transaction crosses a workspace or tenant boundary or reaches an external model or the study `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:13,15]`.
3. **MCP Provider Manifest (`D20=seventh`, unchanged; Point 2B amended on `2026-11-15` by `D1 A · D2 A · D3 A` — see top note):** The portable `AppMcpProviderManifest` (`providerId: 'sentropic.engram.memory'`, `connectorId: 'engram-memory'` `[FACT: src/registry/definitions.ts:46-48]`) registering `engram_memory_search`, `engram_memory_get`, `engram_memory_capture`, `engram_memory_request_admission`, `engram_memory_withdraw`, `engram_memory_forget`, and — under the `14/11` `Point 2B` decision (`decided 2026-11-14`), amended `2026-11-15` by `D1 A · D2 A · D3 A` with follow-up dossier pending — the seventh memory tool (built disabled by default until `engram` + `sentropic` co-signature and qualification, with an envelope-only schema referencing template references and versions `[FACT: EVIDENCE-q6-message-shown-to-owner.md:30,33; spec/memory/OWNER-DECISIONS-2026-11-14.md:23]`; `MCP-L5` qualification gate per `plan/08-BRANCH_MEMORY_FINALIZATION.md:217` and `h2a-position.md:15`; tool name `engram_memory_context` `proposed, not decided by the owner` — source seats: conductor, `Fable`, `Carbon`; template `digest` citation `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) `[FACT: spec/SPEC_MEMORY_MCP_V2.md:47-76,536-580; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`.
4. **Canonical Metamodel Storage Schema & Cutover Descriptors (`Spec 0`, `SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, Point 6A):** Schema definitions (`§4`, `:145-252`) and typed error / cutover descriptors (`§5.1`, `:253-290`) consumed by `cluster-mesh` SQLite and Postgres adapters; the storage schema persists `engram` metamodel primitives (raw events, typed nodes/edges citing their template version `[FACT: EVIDENCE-q6-message-shown-to-owner.md:63]`, plus `proposed, not decided by the owner` template `digest` references, registered template versions, and `control_verdict` records — source seats: `Fable`, `Carbon`), never a closed list of `Track` domain types `[FACT: spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:145-290; spec/memory/OWNER-DECISIONS-2026-11-14.md:13-14,27]`, so a new or updated `Track` template is replicated as data with no SQL migration or `sentropic` release `[JUDGMENT: consequence of EVIDENCE-q6-message-shown-to-owner.md:9-11,63]`.

### 1.2 `sentropic/cluster-mesh` Provides to `engram` (and `h2a`)
1. **Integral Local ↔ Remote DB-Cluster Graph Synchronization (`D24`, `D17`, `D10`, Point 6A):** One bidirectional transactional graph replication mechanism, enabled workspace by workspace, between the local store (`embedded-local`, SQLite) and remote store (`external-host`, Postgres backend, multi-node per D-A; the backend is host configuration), with automatic `degraded` local WAL/outbox queueing when offline (`D17=degraded`), while context logs and context summaries stay local unless the mandate's transfer policy allows them within the owner's per-repository policy (`D10=mandate`). Every typed object cites its template version, `cluster-mesh` carries typed objects without knowing `Track` types, and synchronization never overwrites a `Track`-controlled record (`decided 2026-11-14` `[FACT: EVIDENCE-q6-message-shown-to-owner.md:63-66; EVIDENCE-q6-owner-question-and-answer.json:6,12; spec/memory/OWNER-DECISIONS-2026-11-14.md:27]`). Template versions travelling with the graph (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) and refusing concurrent template versions published offline on sync so `Track` decides (`proposed, not decided by the owner` — source seat: `Fable`) are candidate `Spec 6B` rules `[FACT: spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:36-41; memory-dossier/owner-r15/comments-2026-11-08.md:10; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/kit/src/memory-content-r11.json:292,2643-2646]`.
2. **Canonical Storage Adapters (`CanonicalMemoryStorePort` & `L3a`):** The neutral module-storage handle for module `engram-memory` (contract `memory-binding-v1`; `sentropic repository, origin/main 913e3bcbc: packages/cluster-mesh/src/engram-memory/{contract,neutral-handle,binding,sqlite,postgres}.ts`). Engram's `openModuleStorageCanonicalMemoryStoreV1` (`@sentropic/engram` `0.28.0` `[FACT: package.json:3]`) implements `CanonicalMemoryStorePort` over it (`CHANGELOG.md:96`). Durable backend qualification is `unverified` (sentropic #704, `CHANGELOG.md:98`), alongside transactional cutover/rollback ports (`packages/cluster-mesh/src/persistence/ports.ts:80-101`) and the generic `L3a` module storage port (`spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:12-16`) `[FACT: package.json:3; CHANGELOG.md:96-98; sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/engram-memory/neutral-handle.ts:1-2; packages/cluster-mesh/src/engram-memory/binding.ts:1-40; packages/cluster-mesh/src/persistence/ports.ts:80-101; spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:12-16]`.
3. **Unified MCP Platform Registry & Dispatch (`R12`, `D20`, Point 5B, unchanged; the seventh tool of Point 2B is amended on `2026-11-15` by `D1 A · D2 A · D3 A` — see top note):** Registry and dispatch in `packages/mcp-platform/src/registry.ts` and `api/src/services/mcp/registry-dispatch.ts` (which today wires `sentropic.artifacts` at `:22,34`) `[FACT: sentropic repository (origin/main 913e3bcbc): packages/mcp-platform/src/registry.ts:100-143; api/src/services/mcp/registry-dispatch.ts:22,34]`, plus `new` capability discovery, auth/mandate verification, and tool dispatch for `engram_memory_*` (6 frozen tools + under `14/11` `Point 2B`, amended `2026-11-15` by `D1 A · D2 A · D3 A` with follow-up dossier pending, 1 seventh tool whose identifier `engram_memory_context` is `proposed, not decided by the owner` — source seats: conductor, `Fable`, `Carbon`), `h2a` harness/role tools (`sentropic.h2a`, `new`), and distinctly attributed `Track` application template/control tools (`sentropic.track`, `new`, supporting `Point 5B` authoritative `Track` verdicts) (`MCP-L4` to `MCP-L8`) `[FACT: plan/08-BRANCH_MEMORY_FINALIZATION.md:216-220; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:23,26]`.
4. **External HMI and GitHub Input (`D30`):** The existing GitHub PR sync (`engram-live` P1, `SPEC_LIVE_GIT_INDEXING.md` §5; `h2a` `gateway-host/live-github.ts`) extends to issues, reviews and boards (`proposed`), delivered through `cluster-mesh` (`R12`) `[FACT: spec/SPEC_LIVE_GIT_INDEXING.md:118-129; h2a repository (origin/main 1f57127de): packages/h2a-runtime/src/gateway-host/live-github.ts:1-5; memory-dossier/owner-r15/comments-2026-11-08.md:13]`.

---

## 2. Interfaces

### 2.1 Existing Interfaces (Implemented in `sentropic` & `engram`)
- `CanonicalMemoryStorePort` (`spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:145-252`) implemented by Engram's `openModuleStorageCanonicalMemoryStoreV1` (`@sentropic/engram` `0.28.0` `[FACT: package.json:3]`) over the neutral module-storage handle for module `engram-memory` (contract `memory-binding-v1`; `sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/engram-memory/{contract,neutral-handle,binding,sqlite,postgres}.ts`, `CHANGELOG.md:96`). Durable backend qualification is `unverified` (sentropic #704, `CHANGELOG.md:98`) `[FACT: package.json:3; CHANGELOG.md:96-98; spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:145-252; sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/engram-memory/neutral-handle.ts:1-2; packages/cluster-mesh/src/engram-memory/binding.ts:1-40]`.
- `MemoryLazyDefinitionV1` (`providerId: 'sentropic.engram.memory'`, `connectorId: 'engram-memory'` `[FACT: src/registry/definitions.ts:46-48]`, superseding the draft `'engram-memory'` string in `spec/SPEC_MEMORY_MCP_V2.md:553-555`), `RegistryDefinition`, `CompileRegistryInput`, `CompileRegistryResult`, `ProviderCatalogEntry`, and `CompiledProvider` (`sentropic repository (origin/main 913e3bcbc): packages/mcp-platform/src/registry.ts:100-143`), `AppMcpProviderManifest` (`spec/SPEC_MEMORY_MCP_V2.md:536-580`), and the existing manifest wrapper `createEngramMemoryWireManifest` (`sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts:4`) `[FACT: src/registry/definitions.ts:46-48; sentropic repository (origin/main 913e3bcbc): packages/mcp-platform/src/registry.ts:100-143; packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts:4; spec/SPEC_MEMORY_MCP_V2.md:536-580]`.
- `ClusterMeshCutoverStore`, `ClusterMeshBackfillPort`, `ClusterMeshRollbackVerificationPort`, and `ClusterMeshPersistencePorts` (`sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/persistence/ports.ts:80-101`) `[FACT: sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/persistence/ports.ts:80-101]`.

### 2.2 Legacy Interfaces Retired by MCP-L7 (`plan/08-BRANCH_MEMORY_FINALIZATION.md:219`)
- `H2aGraphifyMemoryPort` (`sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/memory.ts:24-42`): Pre-R15 shadow-query stub retired in `MCP-L7` once `MCP-L4`–`MCP-L6` are in place `[FACT: plan/08-BRANCH_MEMORY_FINALIZATION.md:219; sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/memory.ts:24-42]`.
- `CapabilityGatedError('memory_replication')` throw in `MemoryReplicationPort` (`sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/memory.ts:5-16`, « Future W-C cache seam »): Replaced by the transactional DB-cluster sync implementation below `[FACT: sentropic repository (origin/main 913e3bcbc): packages/cluster-mesh/src/memory.ts:5-16]`.

### 2.3 Proposed Interfaces (`proposed` / `new` — to be built under R15 Spec Plan)

*(Note: `EngramGraphTransaction` and `ClusterMeshMcpCatalogRegistration` below retain their `2026-11-14` shapes without redesign; read with `2026-11-15` `D1 A · D2 A · D3 A` and the pending follow-up dossier — see top note.)*

```ts
export type Sha256Digest = `sha256:${string}`; // 64 hex lowercase over RFC 8785 (JCS) UTF-8 bytes

// status: proposed — Signed h2a mandate envelope verified at L0/boundary gates (Spec 0 :161-174;
// grounded on h2a@1f57127de:packages/h2a/src/types.ts:73-77,79-102,239-249 and packages/h2a/src/authority.ts:55-59,90-94;
// envelopeDigest projection for cross-repo transport is new, Spec 6A / Spec 6B)
export interface H2AMandateEnvelope {
  readonly mandateId: string;
  readonly instance: string;
  readonly role: 'PRINCIPAL' | 'EXECUTIF' | 'CONDUCTOR' | 'AGENTS' | 'CONTROL' | 'MANDATAIRE' | null;
  readonly scope: string;
  readonly rights: readonly string[];
  readonly expiresAt?: string;
  readonly envelopeDigest: Sha256Digest;
  readonly signatures: ReadonlyArray<{
    readonly by: string;
    readonly alg: string;
    readonly value: string;
  }>;
}

// status: proposed (new) — Integral Local <-> Remote Transactional Graph Cluster Sync (D24, D17, D10)
export interface EngramGraphTransaction {
  txId: string;                    // Monotonic HLC / UUIDv7 transaction identifier
  parentTxId: string | null;       // Causal predecessor transaction in workspace graph
  tenantId: string;
  workspaceId: string;
  derivedWorktreeId: string | null;  // D21 derived Git worktree node ID
  mandateEnvelope: H2AMandateEnvelope | null; // D4 / D10 formal signed h2a mandate authorizing the transaction (null only for unmandated raw ingress)
  repoPolicyRef: string | null;    // D10: per-repository owner policy for context logs and summaries
  crossesBoundary: 'workspace' | 'tenant' | 'external-model' | 'study' | null;
  piiArmorStamp: {                 // Required only when crossesBoundary is set (D7, D8, D33); same-(tenant, workspace) sync is integral and unmasked (D24)
    pseudonymized: true;
    blacklistVersion: string;
  } | null;
  metamodelVersion: string;        // Shared engram metamodel grammar version (Spec 0)
  referencedTemplates: Array<{     // Point 6A: templateVersion citation decided 2026-11-14; templateDigestSha256 proposed, not decided by the owner (Fable, Carbon)
    lineage: 'archi' | 'h2a' | 'track' | 'engram'; // LineageId (Spec 0 :147, Spec 6A §0.3 / §5.1)
    templateId: string;
    templateVersion: string;
    templateDigestSha256: Sha256Digest; // proposed, not decided by the owner (source seats: Fable, Carbon)
  }>;
  operations: Array<{
    op: 'upsert_node' | 'upsert_edge' | 'tombstone_node' | 'append_turn_text' | 'register_template_version';
    metamodelClass:                // Stable engram metamodel primitives — never a closed list of Track domain types (Point 6A)
      | 'raw_event'                // Session / external D30 GitHub/board inputs (session-journal framing amended 2026-11-15 by D1 A · D2 A · D3 A; follow-up dossier pending — see top note)
      | 'typed_node'               // Domain instances (Track, h2a, archi, derived D21 worktrees, dream syntheses, memory notes)
      | 'typed_edge'               // Domain and cross-lineage composition relations
      | 'turn_text'                // Queryable raw text history record (D23; session-journal framing amended 2026-11-15 by D1 A · D2 A · D3 A; follow-up dossier pending — see top note)
      | 'ontology_template'        // proposed, not decided by the owner (source seats: Fable, Carbon): registered template version travelling with the graph
      | 'control_verdict'          // proposed, not decided by the owner (source seat: Fable): distinct Track or engram control verdict record (Point 5B)
      | 'context_log'              // Local by default unless D10 policy permits
      | 'context_summary';         // Local by default unless D10 policy permits
    templateRef: {                 // Opaque to cluster-mesh; templateVersion citation decided 2026-11-14
      lineage: 'archi' | 'h2a' | 'track' | 'engram'; // LineageId (Spec 0 :147, Spec 6A §0.3 / §5.1)
      templateId: string;
      templateVersion: string;
      templateDigestSha256: Sha256Digest; // proposed, not decided by the owner (source seats: Fable, Carbon)
      entityTypeId: string | null; // Open template-defined type identifier (never enumerated in cluster-mesh)
    } | null;
    trackControlled: boolean;      // True when governed by an authoritative Track verdict; sync never overwrites a Track-controlled record (decided 2026-11-14)
    entityId: string;
    payloadBytes: Uint8Array;
    metamodelSchemaVersion: string;
  }>;
  committedAtIso: string;
}

export interface ClusterMeshGraphClusterSyncPort {
  /**
   * Commits a graph transaction locally and replicates it integrally via one
   * bidirectional workspace-by-workspace sync mechanism to the subscribed remote
   * cluster-mesh DB peer, or queues it in the local transactional outbox when
   * operating in D17=degraded mode.
   */
  commitAndReplicateTransaction(tx: EngramGraphTransaction): Promise<{
    localCommitted: true;
    replicationState: 'replicated' | 'queued-degraded' | 'local-only-workspace';
    remoteWatermarkTxId: string | null;
  }>;

  /**
   * Pulls and applies remote graph transactions in causal order for a subscribed
   * workspace, reconciling any D17 degraded local outbox transactions ACID-ly.
   * Sync never overwrites a Track-controlled record (decided 2026-11-14);
   * refusing concurrent template versions published offline so Track decides
   * (for 'track' lineage) is proposed, not decided by the owner (source seat: Fable).
   */
  syncWorkspaceGraphCluster(input: {
    tenantId: string;
    workspaceId: string;
    localWatermarkTxId: string | null;
    mandate: H2AMandateEnvelope;   // Signed formal h2a mandate carrying D10 transfer policy
  }): Promise<{
    appliedRemoteTxCount: number;
    flushedLocalOutboxTxCount: number;
    preservedTrackControlledIds: string[]; // Track-controlled records never overwritten by sync (decided 2026-11-14)
    refusedConcurrentTemplates: Array<{    // proposed, not decided by the owner (source seat: Fable): concurrent template versions published offline refused on sync
      lineage: 'track' | 'h2a';
      templateId: string;
      conflictingVersions: [string, string];
      resolutionAuthority: 'track' | 'h2a';
    }>;
    newWatermarkTxId: string | null;
    mode: 'synchronized' | 'degraded';
  }>;
}

// status: proposed (new) — Unified MCP Platform Registration for Engram, h2a, and Track
// Note: 'engram_memory_context' below is amended 2026-11-15 by D1 A · D2 A · D3 A (journal + diff: note, return the diff,
// search history), with follow-up dossier pending — see top note.
export interface ClusterMeshMcpCatalogRegistration {
  registerEngramMemoryProvider(manifest: {
    providerId: 'sentropic.engram.memory'; // connectorId: 'engram-memory' [FACT: src/registry/definitions.ts:46-48], sourceId: 'mcp:engram-memory' (Spec 6A §0.3, §3.1)
    tools: [
      'engram_memory_search',
      'engram_memory_get',
      'engram_memory_capture',
      'engram_memory_request_admission',
      'engram_memory_withdraw',
      'engram_memory_forget',
      'engram_memory_context',     // identifier proposed, not decided by the owner (conductor, Fable, Carbon); amended 2026-11-15 by D1 A · D2 A · D3 A, follow-up dossier pending — see top note
    ];
  }): void;

  registerH2aProvider(manifest: {
    providerId: 'sentropic.h2a';   // new
    tools: string[];               // h2a_loop_*, role/activity template and harness overlay tools
  }): void;

  registerTrackProvider(manifest: {
    providerId: 'sentropic.track'; // new
    tools: string[];               // Track template registration, analyst stream, authoritative control verdicts, pre-merge replay
  }): void;
}
```

---

## 3. Architectural Invariants

1. **Integral Graph Sharing as Database Transactions (`D24`, Point 6A):** Local store (`embedded-local`, SQLite) and remote store (`external-host`, Postgres backend, multi-node per D-A; the backend is host configuration) `engram` graphs synchronize the full graph integrally as ACID database transactions and DB-cluster replication over `cluster-mesh` via a single bidirectional mechanism enabled workspace by workspace (`« De plus j ai demande un partage de graphe entre local et remote. Integral. Engram doit gere ca comme des transaction et synchro de cluster de db via cluster mesh. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:10; spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:36-41; EVIDENCE-q6-message-shown-to-owner.md:66; EVIDENCE-q6-owner-question-and-answer.json:6,12]`). Every typed object in a transaction cites its template version (`decided 2026-11-14` `[FACT: EVIDENCE-q6-message-shown-to-owner.md:63; spec/memory/OWNER-DECISIONS-2026-11-14.md:27]`); citing the template SHA-256 `digest` and shipping registered template versions (`Track`, `h2a`, `archi@1`) inside the graph transaction stream are `proposed, not decided by the owner` (source seats: `Fable`, `Carbon`).
2. **Workspace-Scoped Subscription & Non-Overwrite of `Track` Records (`R12`, `D10`, `D17`, Point 6A):** Workspace graph sync is enabled workspace by workspace and on by default (`kit:292`). Within it, context logs and context summaries stay local unless the mandate's transfer policy (`mandate: H2AMandateEnvelope`) allows them, within the owner's per-repository policy (`D10`; `kit:2643-2646`; `owner-r8 comments:9`). When unreachable (`D17=degraded`), `cluster-mesh` preserves full transactional integrity in the local store (`embedded-local`, SQLite) and replays the outbox log in causal order without data loss when connectivity permits. Synchronization **never overwrites a `Track`-controlled record** (`decided 2026-11-14` `[FACT: EVIDENCE-q6-message-shown-to-owner.md:64; EVIDENCE-q6-owner-question-and-answer.json:6,12; spec/memory/OWNER-DECISIONS-2026-11-14.md:27]`); refusing **concurrent template versions published offline on sync so `Track` decides** (for the `track` lineage) is `proposed, not decided by the owner` (source seat: `Fable`) `[FACT: memory-dossier/kit/src/memory-content-r11.json:292,2643-2646; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:9; spec/memory/OWNER-DECISIONS-2026-11-14.md:26-27]`.
3. **Mandatory MCP Registry Mediation (`R12`, unchanged; the seventh tool of Point 2B is amended on `2026-11-15` by `D1 A · D2 A · D3 A` — see top note):** Every MCP tool call to `engram` (all 6 frozen tools plus, under `14/11` `Point 2B` amended `2026-11-15` by `D1 A · D2 A · D3 A` with follow-up dossier pending, the seventh tool whose identifier `engram_memory_context` is `proposed, not decided by the owner` — source seats: conductor, `Fable`, `Carbon`), `h2a`, or `Track` MUST be registered in and dispatched through `packages/mcp-platform` in `cluster-mesh` (`« repose bien sur le mcp registry de cluster mesh »` `[FACT: memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`).
4. **Boundary Privacy Enforcement (`D6`, `D7`, `D8`, `D24`, `D33`):** No transaction crosses a cross-workspace or cross-tenant boundary, and nothing reaches an external model or the study, without D33 pseudonymization, the D7 blacklist and D8 bounded extracts `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:13,15]`; published template versions carrying no instance data and passing the `D7` confidentiality deny-list on registration is `proposed, not decided by the owner` (source seats: `Fable`, `Carbon`). The local↔remote replication of the same (tenant, workspace) is integral and unmasked (D24) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:10; spec/memory/OWNER-DECISIONS-2026-11-14.md:26-27]`.
5. **Clean Separation from `L3a` Domain Module Storage:** Domain consumers such as `radar-immobilier` use the generic `L3a` module storage port (`SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md`) and never read or mutate `engram` graph tables directly `[FACT: spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:12-16]`.
6. **Domain-Blind Transport — No Closed List of `Track` Types (`T-M-C`, Point 6A):** `cluster-mesh` and `mcp-platform` carry, persist, and replicate typed objects through `engram` metamodel primitives without enumerating, interpreting, or migrating `Track` domain types `[FACT: EVIDENCE-q6-message-shown-to-owner.md:9-11,63; spec/memory/OWNER-DECISIONS-2026-11-14.md:13-14,27]`; as a consequence, evolving a `Track` template requires zero SQL migration and zero `sentropic/cluster-mesh` release `[JUDGMENT: consequence of EVIDENCE-q6-message-shown-to-owner.md:9-11,63]`.

---

## 4. Out of Scope

- Semantics and authoring of `h2a` role/activity/skill templates, mandates, and Git harness overlays (`proposed, not decided by the owner` `.h2a/` layout — source seats: `Fable`, `Carbon`, `h2a`; governed by `spec/memory/contracts/engram-h2a.md`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:25]`.
- `Track` domain ontology templates (mastered by `Track`), authoritative `Track` application control verdicts, offline template-version conflict resolution (`proposed, not decided by the owner` — source seat: `Fable`), and project decision/event analysis (governed by `spec/memory/contracts/engram-track.md`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:13-15,26-27]`.
- Application-specific backup schedules and retention policies for `radar-immobilier` (owned by `radar-immobilier` per `spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:118-128`) `[FACT: spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:118-128]`.
