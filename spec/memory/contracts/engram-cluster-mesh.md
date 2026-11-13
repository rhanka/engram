# Contract: `engram` ↔ `sentropic/cluster-mesh` (Transactional Graph Sync, MCP Registry, and Storage)

- **Status:** `proposed, pending owner review`
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-cluster-mesh.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`, `@sentropic/engram-live`): Canonical graph memory authority (`D28=engram`), transactional graph coordinator (`D24`), and provider of the six frozen `engram_memory_*` tools plus the seventh memory tool (proposed name `engram_memory_context`, `D20=seventh`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:4,10]`.
  - **`sentropic/cluster-mesh` & `sentropic/mcp-platform`** (`sentropic repository: packages/cluster-mesh`, `packages/mcp-platform`, `api/src/services/mcp`): Host persistence adapter for the local store (`embedded-local`, SQLite) and remote store (`external-host`, Postgres backend, multi-node per D-A; the backend is host configuration), transactional database-cluster replication transport (`D17`, `D24`), generic module storage port (`L3a`), and canonical MCP provider registry (`R12`) `[FACT: spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:36-41; sentropic repository: packages/cluster-mesh/src/engram-memory/binding.ts:1-40; packages/mcp-platform/src/registry.ts:100-143; memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `sentropic/cluster-mesh`
1. **Deterministic Graph Transaction Units (`D24`):** Atomic, serializable graph transaction envelopes covering session turns, contextual graph nodes/edges, Scion-like worktree nodes (`D21`), role/activity ontology subgraphs (`D16`), decision records (`D3`, `D27`, `D31`), and dreaming resynthesis commits (`D19`, `D25`) ready for local ACID commit and remote DB-cluster replication (`« De plus j ai demande un partage de graphe entre local et remote. Integral. Engram doit gere ca comme des transaction et synchro de cluster de db via cluster mesh. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:10]`).
2. **PII Armor, Pseudonymization, and Confidentiality Filtering (`D7`, `D8`, `D33`):** Pre-egress pseudonymization (`D33=pseudonymize`), confidentiality blacklist enforcement (`D7`), and deterministic metadata + bounded extract shaping (`D8=bounded`) before any graph transaction crosses a workspace or tenant boundary or reaches an external model or the study `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:13,15]`.
3. **MCP Provider Manifest (`D20=seventh`):** The portable `AppMcpProviderManifest` registering `engram_memory_search`, `engram_memory_get`, `engram_memory_capture`, `engram_memory_request_admission`, `engram_memory_withdraw`, `engram_memory_forget`, and the `proposed` seventh memory tool (`engram_memory_context`) `[FACT: spec/SPEC_MEMORY_MCP_V2.md:47-76,536-580; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`.
4. **Canonical Schema & Cutover Descriptors (`SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`):** Schema definitions (`§4`, `:145-252`) and typed error / cutover descriptors (`§5.1`, `:253-290`) consumed by `cluster-mesh` SQLite and Postgres adapters `[FACT: spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:145-290]`.

### 1.2 `sentropic/cluster-mesh` Provides to `engram` (and `h2a`)
1. **Integral Local ↔ Remote DB-Cluster Graph Synchronization (`D24`, `D17`, `D10`):** Workspace-by-workspace bidirectional transactional graph replication between the local store (`embedded-local`, SQLite) and remote store (`external-host`, Postgres backend, multi-node per D-A); the backend is host configuration, with automatic `degraded` local WAL/outbox queueing when offline (`D17=degraded`), while context logs and context summaries stay local unless the mandate's transfer policy allows them within the owner's per-repository policy (`D10=mandate`) `[FACT: spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:36-41; memory-dossier/owner-r15/comments-2026-11-08.md:10; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/kit/src/memory-content-r11.json:292,2643-2646]`.
2. **Canonical Storage Adapters (`CanonicalMemoryStorePort` & `L3a`):** The neutral module-storage handle for module `engram-memory` (contract `memory-binding-v1`; `packages/cluster-mesh/src/engram-memory/{contract,neutral-handle,binding,sqlite,postgres}.ts`). Engram's `openModuleStorageCanonicalMemoryStoreV1` implements `CanonicalMemoryStorePort` over it (`CHANGELOG.md:74`). Durable backend qualification is `unverified` (sentropic #704, `CHANGELOG.md:76`), alongside transactional cutover/rollback ports (`packages/cluster-mesh/src/persistence/ports.ts:80-101`) and the generic `L3a` module storage port (`spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:12-16`) `[FACT: CHANGELOG.md:74-76; sentropic repository: packages/cluster-mesh/src/engram-memory/neutral-handle.ts:1-2; packages/cluster-mesh/src/engram-memory/binding.ts:1-40; packages/cluster-mesh/src/persistence/ports.ts:80-101; spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:12-16]`.
3. **Unified MCP Platform Registry & Dispatch (`R12`, `D20`):** Registry and dispatch in `packages/mcp-platform/src/registry.ts` and `api/src/services/mcp/registry-dispatch.ts` (which today wires `sentropic.artifacts` at `:22,34`) `[FACT: sentropic repository: packages/mcp-platform/src/registry.ts:100-143; api/src/services/mcp/registry-dispatch.ts:22,34]`, plus `proposed` capability discovery, auth/mandate verification, and tool dispatch for all `engram_memory_*` (6 frozen + 1 `proposed` seventh tool) and `h2a`/`track_*` MCP tools (`MCP-L4` to `MCP-L8`) `[FACT: plan/08-BRANCH_MEMORY_FINALIZATION.md:216-220; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.
4. **External HMI and GitHub Input (`D30`):** The existing GitHub PR sync (`engram-live` P1, `SPEC_LIVE_GIT_INDEXING.md` §5; `h2a` `gateway-host/live-github.ts`) extends to issues, reviews and boards (`proposed`), delivered through `cluster-mesh` (`R12`) `[FACT: spec/SPEC_LIVE_GIT_INDEXING.md:118-129; h2a repository: packages/h2a-runtime/src/gateway-host/live-github.ts:1-5; memory-dossier/owner-r15/comments-2026-11-08.md:13]`.

---

## 2. Interfaces

### 2.1 Existing Interfaces (Implemented in `sentropic` & `engram`)
- `CanonicalMemoryStorePort` (`spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:145-252`) implemented by Engram's `openModuleStorageCanonicalMemoryStoreV1` over the neutral module-storage handle for module `engram-memory` (contract `memory-binding-v1`; `sentropic repository: packages/cluster-mesh/src/engram-memory/{contract,neutral-handle,binding,sqlite,postgres}.ts`, `CHANGELOG.md:74`). Durable backend qualification is `unverified` (sentropic #704, `CHANGELOG.md:76`) `[FACT: CHANGELOG.md:74-76; spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:145-252; sentropic repository: packages/cluster-mesh/src/engram-memory/neutral-handle.ts:1-2; packages/cluster-mesh/src/engram-memory/binding.ts:1-40]`.
- `RegistryDefinition`, `CompileRegistryInput`, `CompileRegistryResult`, `ProviderCatalogEntry`, and `CompiledProvider` (`sentropic repository: packages/mcp-platform/src/registry.ts:100-143`), `AppMcpProviderManifest` (`spec/SPEC_MEMORY_MCP_V2.md:536-580`, manifest at `:553`), and the existing manifest wrapper `createEngramMemoryWireManifest` (`sentropic repository: packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts:4`) `[FACT: sentropic repository: packages/mcp-platform/src/registry.ts:100-143; packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts:4; spec/SPEC_MEMORY_MCP_V2.md:553]`.
- `ClusterMeshCutoverStore`, `ClusterMeshBackfillPort`, `ClusterMeshRollbackVerificationPort`, and `ClusterMeshPersistencePorts` (`sentropic repository: packages/cluster-mesh/src/persistence/ports.ts:80-101`) `[FACT: sentropic repository: packages/cluster-mesh/src/persistence/ports.ts:80-101]`.

### 2.2 Legacy Interfaces Retired by MCP-L7 (`plan/08-BRANCH_MEMORY_FINALIZATION.md:219`)
- `H2aGraphifyMemoryPort` (`sentropic repository: packages/cluster-mesh/src/memory.ts:24-42`): Pre-R15 shadow-query stub retired in `MCP-L7` once `MCP-L4`–`MCP-L6` are in place `[FACT: plan/08-BRANCH_MEMORY_FINALIZATION.md:219; sentropic repository: packages/cluster-mesh/src/memory.ts:24-42]`.
- `CapabilityGatedError('memory_replication')` throw in `MemoryReplicationPort` (`sentropic repository: packages/cluster-mesh/src/memory.ts:5-16`, « Future W-C cache seam »): Replaced by the transactional DB-cluster sync implementation below `[FACT: sentropic repository: packages/cluster-mesh/src/memory.ts:5-16]`.

### 2.3 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

```ts
// status: proposed — Integral Local <-> Remote Transactional Graph Cluster Sync (D24, D17, D10)
export interface EngramGraphTransaction {
  txId: string;                    // Monotonic HLC / UUIDv7 transaction identifier
  parentTxId: string | null;       // Causal predecessor transaction in workspace graph
  tenantId: string;
  workspaceId: string;
  worktreeScionId: string | null;  // D21 Scion-like worktree node ID
  mandateEnvelope: {               // D4 / D10 formal h2a mandate authorizing the transaction
    mandateId: string;
    signature: string;
  };
  repoPolicyRef: string | null;    // D10: per-repository owner policy for context logs and summaries
  crossesBoundary: 'workspace' | 'tenant' | 'external-model' | 'study' | null;
  piiArmorStamp: {                 // Required only when crossesBoundary is set (D7, D8, D33); same-(tenant, workspace) sync is integral and unmasked (D24)
    pseudonymized: true;
    blacklistVersion: string;
  } | null;
  operations: Array<{
    op: 'upsert_node' | 'upsert_edge' | 'tombstone_node' | 'append_turn_text';
    entityKind:                    // covers every kind engram records (integral sync, D24)
      | 'session_turn'
      | 'tool_result'
      | 'project_decision'
      | 'project_event'
      | 'decision_dossier'
      | 'gh_input_event'
      | 'extraction_proposal'
      | 'harness_decision'
      | 'harness_overlay'
      | 'role_ontology'
      | 'worktree_scion'
      | 'dream_synthesis'
      | 'memory_note';
    entityId: string;
    payloadBytes: Uint8Array;
    schemaVersion: string;
  }>;
  committedAtIso: string;
}

export interface ClusterMeshGraphClusterSyncPort {
  /**
   * Commits a graph transaction locally and replicates it integrally to the
   * subscribed remote cluster-mesh DB peer, or queues it in the local transactional
   * outbox when operating in D17=degraded mode.
   */
  commitAndReplicateTransaction(tx: EngramGraphTransaction): Promise<{
    localCommitted: true;
    replicationState: 'replicated' | 'queued-degraded' | 'local-only-workspace';
    remoteWatermarkTxId: string | null;
  }>;

  /**
   * Pulls and applies remote graph transactions in causal order for a subscribed
   * workspace, reconciling any D17 degraded local outbox transactions ACID-ly.
   */
  syncWorkspaceGraphCluster(input: {
    tenantId: string;
    workspaceId: string;
    localWatermarkTxId: string | null;
    mandateId: string;
  }): Promise<{
    appliedRemoteTxCount: number;
    flushedLocalOutboxTxCount: number;
    newWatermarkTxId: string | null;
    mode: 'synchronized' | 'degraded';
  }>;
}

// status: proposed — Unified MCP Platform Registration for Engram (6 frozen + 1 proposed 7th tool) & h2a
export interface ClusterMeshMcpCatalogRegistration {
  registerEngramMemoryProvider(manifest: {
    providerId: 'engram-memory';
    tools: [
      'engram_memory_search',
      'engram_memory_get',
      'engram_memory_capture',
      'engram_memory_request_admission',
      'engram_memory_withdraw',
      'engram_memory_forget',
      'engram_memory_context',     // proposed 7th tool (D20)
    ];
  }): void;

  registerH2aProvider(manifest: {
    providerId: 'sentropic.h2a';
    tools: string[];               // h2a_loop_* and read/control analyst tools
  }): void;
}
```

---

## 3. Architectural Invariants

1. **Integral Graph Sharing as Database Transactions (`D24`):** Local store (`embedded-local`, SQLite) and remote store (`external-host`, Postgres backend, multi-node per D-A; the backend is host configuration) `engram` graphs are not synchronized via lossy command summaries or `Track` event relays; `engram` and `cluster-mesh` synchronize the full graph integrally as ACID database transactions and DB-cluster replication (`« De plus j ai demande un partage de graphe entre local et remote. Integral. Engram doit gere ca comme des transaction et synchro de cluster de db via cluster mesh. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:10; spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:36-41]`).
2. **Workspace-Scoped Subscription with Default Cluster-Mesh Sync (`R12`, `D10`, `D17`):** Workspace graph sync is on by default (`kit:292`). Within it, context logs and context summaries stay local unless the mandate's transfer policy allows them, within the owner's per-repository policy (`D10`; `kit:2643-2646`; `owner-r8 comments:9`). When unreachable (`D17=degraded`), `cluster-mesh` preserves full transactional integrity in the local store (`embedded-local`, SQLite) and replays the outbox log without data loss when connectivity permits `[FACT: memory-dossier/kit/src/memory-content-r11.json:292,2643-2646; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:9]`.
3. **Mandatory MCP Registry Mediation (`R12`):** Every MCP tool call to `engram` (all 6 frozen tools plus the `proposed` seventh tool `engram_memory_context`) or `h2a` MUST be registered in and dispatched through `packages/mcp-platform` in `cluster-mesh` (`« repose bien sur le mcp registry de cluster mesh »` `[FACT: memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`).
4. **Boundary Privacy Enforcement (`D6`, `D7`, `D8`, `D24`, `D33`):** No transaction crosses a cross-workspace or cross-tenant boundary, and nothing reaches an external model or the study, without D33 pseudonymization, the D7 blacklist and D8 bounded extracts. The local↔remote replication of the same (tenant, workspace) is integral and unmasked (D24) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:10; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:13,15]`.
5. **Clean Separation from `L3a` Domain Module Storage:** Domain consumers such as `radar-immobilier` use the generic `L3a` module storage port (`SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md`) and never read or mutate `engram` graph tables directly `[FACT: spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:12-16]`.

---

## 4. Out of Scope

- Semantics of `h2a` roles, mandates, and harness overlays (governed by `spec/memory/contracts/engram-h2a.md`) `[JUDGMENT]`.
- Project decision and project event analysis in `Track` (governed by `spec/memory/contracts/engram-track.md`) `[JUDGMENT]`.
- Application-specific backup schedules and retention policies for `radar-immobilier` (owned by `radar-immobilier` per `spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:118-128`) `[FACT: spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md:118-128]`.
