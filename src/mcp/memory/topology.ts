/**
 * MCP-L0 Reference Topology, Voluntary cluster-mesh Inheritance, D10 Separation,
 * Legacy Migration Dispositions (M8), Package/CLI Boundaries (M9), and
 * Cross-Team Verification Items.
 *
 * Normative alignment with SPEC-memory-mcp-v2.md (M8, M9, M10, M11, M12, M13).
 */

export const ENGRAM_MEMORY_RELEASE_CADENCE_V1 = {
  engram_release_version: '0.20.0',
  tools_default_enabled: false,
  sentropic_follows_in_own_release: true,
  agent_host_follows_in_own_release: true,
} as const;

export const ENGRAM_MEMORY_REFERENCE_TOPOLOGY_V1 = {
  release_target: '0.20.0',
  h2a_reference_chain: [
    'agent',
    'h2a McpServer',
    '@sentropic/cluster-mesh/memory',
    'local Sentropic memory broker',
    'in-process engram-memory SQLite',
  ] as const,
  sentropic_own_instance:
    'separate embedded-local engram-memory instance for Sentropic own agents',
  cross_host_memory_calls_in_0_20_0: false,
  wc_arch_06_blocks_embedded_local_0_20_0: false,
  wc_arch_06_blocks_only_remote_daemon_topology: true,
} as const;

export const CLUSTER_MESH_MEMORY_INHERITANCE_CONTRACT_V1 = {
  subpath: '@sentropic/cluster-mesh/memory',
  app_id: 'engram',
  provider_id: 'sentropic.engram.memory',
  connector_id: 'engram-memory',
  voluntary_host_inheritance_only: true,
  default_enabled: false,
  auto_registered_in_default_bootstrap: false,
  missing_module_refusal_code: 'cluster_mesh_module_unavailable',
  silent_fallback_allowed: false,
  requires_persisted_host_opt_in: true,
  requires_persisted_tenant_policy_opt_in: true,
} as const;

export interface PersistedMemoryActivationConfigV1 {
  readonly host_config_persisted: boolean;
  readonly host_memory_mcp_enabled: boolean;
  readonly tenant_policy_persisted: boolean;
  readonly tenant_memory_mcp_enabled: boolean;
  readonly cluster_mesh_memory_module_available: boolean;
}

export type MemoryActivationEvaluationV1 =
  | { readonly enabled: true }
  | {
      readonly enabled: false;
      readonly refusal_code:
        | 'memory_mcp_disabled_by_default'
        | 'unpersisted_activation_config'
        | 'cluster_mesh_module_unavailable';
    };

/**
 * Evaluates whether the Engram memory MCP surface may be activated for a host
 * and tenant session under the voluntary `cluster-mesh/memory` contract (M10),
 * enforcing M4 closed-world literal-`true` (`=== true`) semantics.
 */
export function evaluateClusterMeshMemoryInheritanceV1(
  config: PersistedMemoryActivationConfigV1,
): MemoryActivationEvaluationV1 {
  const raw = config as unknown as Record<string, unknown>;
  if (
    raw.host_memory_mcp_enabled !== true ||
    raw.tenant_memory_mcp_enabled !== true
  ) {
    return {
      enabled: false,
      refusal_code: 'memory_mcp_disabled_by_default',
    };
  }
  if (
    raw.host_config_persisted !== true ||
    raw.tenant_policy_persisted !== true
  ) {
    return {
      enabled: false,
      refusal_code: 'unpersisted_activation_config',
    };
  }
  if (raw.cluster_mesh_memory_module_available !== true) {
    return {
      enabled: false,
      refusal_code: 'cluster_mesh_module_unavailable',
    };
  }
  return { enabled: true };
}

export const D10_CODE_GRAPH_SEPARATION_CONTRACT_V1 = {
  decision_id: 'D10',
  amended_on: '2026-04-16',
  graph_json_role: 'code-graph-only',
  forbid_memory_nodes_in_graph_json: true,
  forbid_memory_edges_in_graph_json: true,
  authorized_memory_surfaces: [
    'engram_memory_search',
    'engram_memory_get',
    'engram_memory_capture',
    'engram_memory_request_admission',
    'engram_memory_withdraw',
    'engram_memory_forget',
    'BoundedCurrentProjectionV1',
    'ExportBundleV1',
  ] as const,
} as const;

/**
 * M8 Legacy Migration Dispositions:
 * - Retires `H2aGraphifyMemoryPort` and `createGraphifyMemoryAdapter` in
 *   `packages/cluster-mesh/src/memory.ts` (`src/index.ts`) and the 4 shadow
 *   operations (`engram_write_shadow`, `engram_query_shadow`,
 *   `engram_promote_fact`, `engram_ack_promotion`).
 * - Retires the 8 legacy memory files under `packages/h2a/src/runtime/memory/`.
 * - Re-anchors D11 two-leg review in host `AdmissionPolicy` and
 *   `EvidenceVerifierPort` on `engram_memory_request_admission`, replacing
 *   `engram_ack_promotion`.
 * - Migrates both `packages/h2a/package.json` and
 *   `packages/h2a-runtime/package.json` (plus lockfiles) from `0.13.3`.
 */
export const LEGACY_MIGRATION_DISPOSITIONS_V1 = {
  cluster_mesh_shadow_protocol_retired: {
    retired_operations: [
      'engram_write_shadow',
      'engram_query_shadow',
      'engram_promote_fact',
      'engram_ack_promotion',
    ] as const,
    retired_symbols: [
      'H2aGraphifyMemoryPort',
      'createGraphifyMemoryAdapter',
    ] as const,
    retired_files: [
      'packages/cluster-mesh/src/memory.ts',
      'packages/cluster-mesh/src/index.ts',
    ] as const,
  },
  h2a_legacy_memory_files_retired: [
    'packages/h2a/src/runtime/memory/admit-client.ts',
    'packages/h2a/src/runtime/memory/recall-client.ts',
    'packages/h2a/src/runtime/memory/promote-client.ts',
    'packages/h2a/src/runtime/memory/port-v1.ts',
    'packages/h2a/src/runtime/memory/port-v2-adapter.ts',
    'packages/h2a/src/runtime/memory/port-v2-compat.ts',
    'packages/h2a/src/runtime/memory/graphify-contracts-v2.vendored.ts',
    'packages/h2a/src/runtime/memory/d11-ceremony.ts',
  ] as const,
  d11_two_leg_review_reanchoring: {
    decision_id: 'D11',
    retired_from: 'packages/h2a/src/runtime/memory/d11-ceremony.ts',
    replaces_legacy_operation: 'engram_ack_promotion',
    reanchored_on_operation: 'engram_memory_request_admission',
    reanchored_in: [
      'AdmissionPolicy',
      'EvidenceVerifierPort',
    ] as const,
    forbidden_in_neutral_engram_memory_package: true,
  },
  cluster_mesh_pin_migration: {
    previous_pin: '0.13.3',
    target_manifests: [
      'packages/h2a/package.json',
      'packages/h2a-runtime/package.json',
    ] as const,
    updates_lockfiles: true,
    requires_upgrade_for_memory_subpath: true,
    missing_subpath_refusal_code: 'cluster_mesh_module_unavailable',
  },
} as const;

/**
 * M9 Package Boundary & CLI Surface Contract:
 * - Root package `@sentropic/engram` (`0.20.0`) with optional subpath
 *   `@sentropic/engram/mcp-memory`.
 * - Neutral `engram-memory` remains private (`"private": true`).
 * - Explicit backend provisioning for `better-sqlite3` and `fs-ext`.
 * - `@modelcontextprotocol/sdk >= 1.31.0` and published `@sentropic/mcp-broker`.
 * - `engram serve` and default code-graph CLI commands do not load memory MCP
 *   or SQLite native addons.
 */
export const PACKAGE_BOUNDARY_AND_CLI_CONTRACT_V1 = {
  root_published_package_name: '@sentropic/engram',
  root_published_version: '0.20.0',
  optional_mcp_memory_export_subpath: '@sentropic/engram/mcp-memory',
  neutral_memory_package_name: 'engram-memory',
  neutral_memory_package_private: true,
  explicit_native_backend_dependencies: [
    'better-sqlite3',
    'fs-ext',
  ] as const,
  mcp_sdk_dependency: '@modelcontextprotocol/sdk',
  mcp_sdk_min_version: '>=1.31.0',
  published_broker_dependency: '@sentropic/mcp-broker',
  default_engram_cli_excludes_memory_mcp_and_sqlite: true,
  engram_serve_excludes_memory_mcp: true,
} as const;

export interface OpusAmendmentDispositionV1 {
  readonly id:
    | 'A-01'
    | 'A-02'
    | 'A-03'
    | 'A-04'
    | 'A-05'
    | 'A-06'
    | 'A-07'
    | 'A-08'
    | 'A-09'
    | 'A-10'
    | 'A-11'
    | 'A-12'
    | 'A-13'
    | 'A-14'
    | 'A-15'
    | 'A-16';
  readonly summary: string;
  readonly frozen_in_lot: 'MCP-L0';
}

export const OPUS_REVIEW_AMENDMENT_DISPOSITIONS_V1: readonly OpusAmendmentDispositionV1[] =
  [
    {
      id: 'A-01',
      summary:
        'Closed M2 input schemas and Sentropic AppResultEnvelope output schemas with additionalProperties: false and no null for optional fields.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-02',
      summary:
        'Additive neutral RedactedMemoryRecordV2, RecallRecordPacketV3, RecallPacketV3, MemoryRecallPortV3 (v3), and MemoryReadPortV1 (v1).',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-03',
      summary:
        'Host-owned RetentionV1 defaulting to derivative_rule make-ineligible, rejecting expiration > host ceiling, and rejecting retain unless host policy explicitly permits it.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-04',
      summary:
        'Host-owned ReconciliationConsentV1 defaulting omitted/empty consent to { family_refs: [] } and rejecting unconsented family_refs.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-05',
      summary:
        'Host-validated, resumed MCP elicitation confirmation (<= 300s TTL) bound to elicitation_ref, capability, mcp_client_id, session_id, principal_id, tenant_id, scope_ref, target_ref, and operation_digest.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-06',
      summary:
        'Pre-authorization target-existence normalization to NOT_FOUND across all four target-bearing tools (get, request_admission, withdraw, forget).',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-07',
      summary:
        'Total error mapping table covering all 27 neutral MemoryErrorCode values plus RESULT_TOO_LARGE, RATE_LIMITED, MUTATION_OUTCOME_UNKNOWN, and gate_failed with constant messages and stripped details.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-08',
      summary:
        'Durable idempotent operation reservation keyed by the M5 9-tuple + normalized_input_digest + source_order / event_id / event_anchor with DIGEST_CONFLICT on mismatch and fresh re-authorization on replay.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-09',
      summary:
        'Host-managed random pagination handle state (engram owns no signing secret) binding principal, tenant, store, connector, scope, purpose, query, limits, capability_policy, profile, dual-as-of, epochs, and record expiry (STALE_PAGE).',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-10',
      summary:
        'Dual-channel MCP response carrying identical AppResultEnvelope in structuredContent and content[0].text with max_packet_bytes (default 64 KiB, max 1 MiB) and 2 MiB combined ceiling.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-11',
      summary:
        'Trusted host/broker principal, tenant, store, connector, scope_ref, and AuthorizationContextV1 required on every call; fabricated defaults refused.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-12',
      summary:
        '0.20.0 reference topology uses embedded-local SQLite for h2a and a separate embedded-local instance for Sentropic with zero cross-host memory calls.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-13',
      summary:
        'Voluntary @sentropic/cluster-mesh/memory inheritance disabled by default, requiring persisted host and tenant opt-in and refusing missing subpath with cluster_mesh_module_unavailable.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-14',
      summary:
        'Owner amendment D10 (2026-04-16): graph.json remains strictly the code graph; memory uses dedicated authorized interfaces.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-15',
      summary:
        'Retirement of H2aGraphifyMemoryPort / createGraphifyMemoryAdapter in packages/cluster-mesh/src/memory.ts and 8 files in packages/h2a/src/runtime/memory/; D11 re-anchored in AdmissionPolicy and EvidenceVerifierPort.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-16',
      summary:
        '@sentropic/engram (0.20.0) optional @sentropic/engram/mcp-memory subpath, private engram-memory, explicit better-sqlite3 and fs-ext provisioning, @modelcontextprotocol/sdk >= 1.31.0, and engram serve exclusion.',
      frozen_in_lot: 'MCP-L0',
    },
  ] as const;

export interface UnverifiedCrossTeamItemV1 {
  readonly id:
    | 'UV-01'
    | 'UV-02'
    | 'UV-03'
    | 'UV-04'
    | 'UV-05'
    | 'UV-06'
    | 'UV-07';
  readonly status: 'unverified';
  readonly target_teams: readonly ('sentropic' | 'cluster-mesh' | 'h2a')[];
  readonly question: string;
}

export const UNVERIFIED_CROSS_TEAM_ITEMS_V1: readonly UnverifiedCrossTeamItemV1[] =
  [
    {
      id: 'UV-01',
      status: 'unverified',
      target_teams: ['sentropic'],
      question:
        'Exact mechanism by which Sentropic AppMcpToolProvider / ToolBroker injects trusted scope_ref, principal_id, AuthorizationContextV1, and elicitation confirmation into tool handlers.',
    },
    {
      id: 'UV-02',
      status: 'unverified',
      target_teams: ['sentropic', 'h2a'],
      question:
        'Exact wire handshake between Sentropic ToolBroker and h2a McpServer when resuming a validated confirm elicitation for engram_memory_withdraw and engram_memory_forget.',
    },
    {
      id: 'UV-03',
      status: 'unverified',
      target_teams: ['sentropic', 'h2a'],
      question:
        'Minimum MCP client/broker protocol version across all deployed Sentropic and h2a runtimes for structuredContent consumption alongside content[0].text.',
    },
    {
      id: 'UV-04',
      status: 'unverified',
      target_teams: ['cluster-mesh', 'h2a'],
      question:
        'Exact @sentropic/cluster-mesh target version that will publish the ./memory subpath and replace the 0.13.3 pin in packages/h2a/package.json and packages/h2a-runtime/package.json.',
    },
    {
      id: 'UV-05',
      status: 'unverified',
      target_teams: ['h2a'],
      question:
        'Exact filesystem location, SQLite WAL/encryption configuration, and backup lifecycle for the h2a embedded-local engram-memory database.',
    },
    {
      id: 'UV-06',
      status: 'unverified',
      target_teams: ['h2a'],
      question:
        'Whether any external operational scripts outside packages/h2a/src/runtime/memory/ still reference legacy shadow/promotion clients before file deletion in MCP-L4.',
    },
    {
      id: 'UV-07',
      status: 'unverified',
      target_teams: ['sentropic'],
      question:
        'Published version of @sentropic/mcp-broker consumed by @sentropic/engram/mcp-memory in MCP-L2.',
    },
  ] as const;
