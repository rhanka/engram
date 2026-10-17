/**
 * MCP-L0 Reference Topology, Voluntary cluster-mesh Inheritance, D10 Separation,
 * Legacy Migration Dispositions, Package/CLI Boundaries, and Unverified
 * Cross-Team Items.
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
  provider_app_id: 'engram-memory',
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
 * and tenant session under the voluntary `cluster-mesh/memory` contract.
 */
export function evaluateClusterMeshMemoryInheritanceV1(
  config: PersistedMemoryActivationConfigV1,
): MemoryActivationEvaluationV1 {
  if (!config.host_memory_mcp_enabled || !config.tenant_memory_mcp_enabled) {
    return {
      enabled: false,
      refusal_code: 'memory_mcp_disabled_by_default',
    };
  }
  if (!config.host_config_persisted || !config.tenant_policy_persisted) {
    return {
      enabled: false,
      refusal_code: 'unpersisted_activation_config',
    };
  }
  if (!config.cluster_mesh_memory_module_available) {
    return {
      enabled: false,
      refusal_code: 'cluster_mesh_module_unavailable',
    };
  }
  return { enabled: true };
}

export const D10_CODE_GRAPH_SEPARATION_CONTRACT_V1 = {
  decision_id: 'D10',
  amended_on: '2026-10-17',
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

export const LEGACY_MIGRATION_DISPOSITIONS_V1 = {
  cluster_mesh_shadow_protocol_retired: {
    retired_operations: [
      'engram_write_shadow',
      'engram_query_shadow',
      'engram_promote_fact',
      'engram_ack_promotion',
    ] as const,
    retired_symbols: [
      'MemoryFact',
      'EngramAdapter',
      'EngramAdapterError',
      'EngramErrorCode',
    ] as const,
    retired_files: [
      'packages/cluster-mesh/src/engram-types.ts',
      'packages/cluster-mesh/src/engram-adapter.ts',
    ] as const,
  },
  h2a_legacy_memory_files_retired: [
    'src/memory/engram.ts',
    'src/memory/admission-gate.ts',
    'src/memory/decay-worker.ts',
    'src/memory/fact-lifecycle.ts',
    'src/memory/integrity.ts',
    'src/memory/query-sanitizer.ts',
    'src/memory/session-index.ts',
    'src/memory/skill-crystallizer.ts',
  ] as const,
  d11_two_leg_review_reanchoring: {
    decision_id: 'D11',
    retired_from: 'src/memory/admission-gate.ts',
    reanchored_in: [
      'Host AdmissionPolicy',
      'Host EvidenceVerifierPort',
    ] as const,
    forbidden_in_neutral_engram_memory_package: true,
  },
  cluster_mesh_pin_migration: {
    previous_pin: '0.13.3',
    requires_upgrade_for_memory_subpath: true,
    missing_subpath_refusal_code: 'cluster_mesh_module_unavailable',
  },
} as const;

export const PACKAGE_BOUNDARY_AND_CLI_CONTRACT_V1 = {
  engram_code_published_package_name: 'engram-code',
  engram_memory_published_package_name: '@engram/memory',
  mcp_sdk_runtime_dependency: '@modelcontextprotocol/sdk',
  native_storage_drivers_peer_optional: ['better-sqlite3', 'pg'] as const,
  default_engram_cli_excludes_memory_mcp_and_sqlite: true,
  dedicated_memory_mcp_entrypoint: 'engram-memory-mcp',
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
        'Closed input and output JSON Schemas with additionalProperties: false and no null for optional fields.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-02',
      summary:
        'Additive neutral RedactedMemoryRecordV2, RecallRecordPacketV3, RecallPacketV3, MemoryRecallPortV3, and MemoryReadPortV1.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-03',
      summary:
        'Host-owned retention policy defaulting to make-ineligible, finite expiration ceiling, and explicit allowance required for retain.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-04',
      summary:
        'Host-owned reconciliation strategy/conflict_key and consent-subset verification for reconciliation_hint.family_refs.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-05',
      summary:
        'Out-of-band MCP elicitation or host confirmation token (300s TTL) bound to memory_id, reason_code, digest/status, principal, and scope for withdraw/forget.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-06',
      summary:
        'Target-existence and lifecycle-state disclosure normalization to NOT_FOUND before target authorization.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-07',
      summary:
        'Total error mapping table covering all 27 neutral MemoryErrorCode values plus RESULT_TOO_LARGE, RATE_LIMITED, MUTATION_OUTCOME_UNKNOWN, and gate_failed.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-08',
      summary:
        'Durable idempotent operation store keyed by (scope_ref, principal_id, tool_name, idempotency_key) with retry-stable retention/timestamps.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-09',
      summary:
        'Authenticated pagination cursor bound to scope_ref, query_digest, status_filter, memory_kinds, ordering, snapshot_watermark, and 300s TTL.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-10',
      summary:
        'Dual-channel MCP response carrying identical ToolResultV1 in structuredContent and content[0].text with <= 64 KiB cap.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-11',
      summary:
        'Trusted broker ScopeRefV1 and PrincipalRefV1 required on every call; fabricated defaults refused with isError: true.',
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
        'Voluntary cluster-mesh/memory inheritance disabled by default, requiring persisted host and tenant opt-in and refusing missing subpath with cluster_mesh_module_unavailable.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-14',
      summary:
        'Owner amendment D10 (2026-10-17): graph.json remains strictly the code graph; memory uses dedicated authorized interfaces.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-15',
      summary:
        'Retirement of cluster-mesh shadow protocol and 8 h2a legacy memory files; D11 two-leg review re-anchored in host AdmissionPolicy and EvidenceVerifierPort.',
      frozen_in_lot: 'MCP-L0',
    },
    {
      id: 'A-16',
      summary:
        '@modelcontextprotocol/sdk declared as runtime dependency when MCP server is bundled; native SQLite/PG drivers peer/optional; default engram CLI excludes memory MCP.',
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

/**
 * Explicit `unverified` cross-team items from SPEC-memory-mcp-v2.md §18 to be
 * resolved with the Sentropic, cluster-mesh, and h2a teams in downstream lots.
 */
export const UNVERIFIED_CROSS_TEAM_ITEMS_V1: readonly UnverifiedCrossTeamItemV1[] =
  [
    {
      id: 'UV-01',
      status: 'unverified',
      target_teams: ['sentropic'],
      question:
        'Exact mechanism by which Sentropic AppMcpToolProvider / ToolBroker injects trusted ScopeRefV1, PrincipalRefV1, capability token, and confirmation grant into tool handlers (request _meta vs side-channel context argument).',
    },
    {
      id: 'UV-02',
      status: 'unverified',
      target_teams: ['sentropic', 'h2a'],
      question:
        'Whether Sentropic ToolBroker and h2a McpServer natively support MCP elicitation for requiresUserConfirmation: true or require a host-signed confirmation token handshake.',
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
        'Exact @sentropic/cluster-mesh target version that will publish the ./memory subpath and replace the 0.13.3 git/tarball pin in h2a.',
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
        'Whether any external operational scripts or tests outside src/memory/ still read legacy h2a shadow/fact files and require a one-shot migration or archive script before file deletion in MCP-L4.',
    },
    {
      id: 'UV-07',
      status: 'unverified',
      target_teams: ['sentropic'],
      question:
        'Exact error code casing convention in Sentropic McpServer / ToolBroker when a pre-execution gate fails (lowercase gate_failed vs uppercase GATE_FAILED).',
    },
  ] as const;
