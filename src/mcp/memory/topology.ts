import { validateMemoryQualifiedTupleV1, validateMemoryHostProfileBindingsV1, type MemoryHostProfileBindingsV1, type MemoryCandidateTupleV1 } from './receipts.js';
/**
 * MCP-L0 Reference Topology, Voluntary cluster-mesh Inheritance, Restored D10 Filtered Projection,
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

export const D10_FILTERED_PROJECTION_CONTRACT_V1 = {
  decision_id: 'D10',
  restored_baseline: '7bc9baec',
  graph_json_role: 'bounded-current-projection',
  canonical_authority:
    'immutable record blobs plus append-only lifecycle journal',
  projection_may_contain: [
    'current accepted projection envelopes',
    'citation references',
    'projection metadata',
  ] as const,
  projection_never_contains: [
    'record bodies',
    'pending data',
    'journal events',
    'tombstone history',
    'rank receipts',
    'authorization receipts',
    'backup material',
    'vectors',
  ] as const,
  projected_state: 'accepted_current',
  requires_projection_eligible_true: true,
  removed_at_next_regeneration_or_reconciliation: [
    'accepted_disputed',
    'withdrawn',
    'historical',
    'expired',
    'trust_invalid',
    'tombstoned',
  ] as const,
  dedicated_memory_tools_remain_available_without_graph: true,
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
        'Restored D10 (baseline 7bc9baec): graph.json is a bounded current projection; only accepted_current records with projection_eligible === true are projected alongside code.',
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
        'Published version of @sentropic/mcp-broker consumed by @sentropic/engram/mcp-memory in MCP-L4.',
    },
  ] as const;

// ============================================================================
// L0-A01 — Publisher Identity & Publication Contract (M7 / R 1.1.4)
// ============================================================================

export interface MemoryPublisherEntryV1 {
  readonly registry_package_format: 'sentropic.registry-package/v1';
  readonly registry_entry_contract: 'sentropic.registry-entry/v1';
  readonly registry_schema_version: '1.1.4';
  readonly kind: 'mcp';
  readonly id: 'sentropic.engram.memory';
  readonly provider_id: 'sentropic.engram.memory';
  readonly connector_id: 'engram-memory';
  readonly app_id: 'engram';
  readonly entry_version: string;
  readonly manifest_version: string;
  readonly provider_behavioral_contract_version: '1.0.0';
  readonly structured_payload_schema_version: 1;
  readonly publisher_package_name: '@sentropic/engram';
  readonly selected_release_option: 'B';
  readonly adapter_delivering_version_in_0_20_0: null;
  readonly later_b_adapter_version_status: 'unverified';
  readonly entries_asset_path: 'registry/entries.v1.json';
  readonly manifest_export_subpath: './registry/manifest';
  readonly definitions_export_subpath: './registry/definitions';
  readonly mcp_memory_export_subpath: './mcp-memory';
  readonly wire_profile: 'sentropic.engram.memory-wire/v1';
  readonly tool_schema_profile: 'sentropic.engram.memory-tools/2020-12-v1';
  readonly parameter_schema_profile: 'sentropic.parameters/2020-12-bounded-v1';
  readonly parameter_schema_version: '1.0.0';
  readonly requires_new_entry_version_on_package_version_change: true;
  readonly publication_receipt_contract: 'MemoryPublisherAssetsV1';
}

export const ENGRAM_MEMORY_PUBLISHER_ENTRY_V1: MemoryPublisherEntryV1 =
  Object.freeze({
    registry_package_format: 'sentropic.registry-package/v1',
    registry_entry_contract: 'sentropic.registry-entry/v1',
    registry_schema_version: '1.1.4',
    kind: 'mcp',
    id: 'sentropic.engram.memory',
    provider_id: 'sentropic.engram.memory',
    connector_id: 'engram-memory',
    app_id: 'engram',
    entry_version: '1.0.0',
    manifest_version: '1.0.0',
    provider_behavioral_contract_version: '1.0.0',
    structured_payload_schema_version: 1,
    publisher_package_name: '@sentropic/engram',
    selected_release_option: 'B',
    adapter_delivering_version_in_0_20_0: null,
    later_b_adapter_version_status: 'unverified',
    entries_asset_path: 'registry/entries.v1.json',
    manifest_export_subpath: './registry/manifest',
    definitions_export_subpath: './registry/definitions',
    mcp_memory_export_subpath: './mcp-memory',
    wire_profile: 'sentropic.engram.memory-wire/v1',
    tool_schema_profile: 'sentropic.engram.memory-tools/2020-12-v1',
    parameter_schema_profile: 'sentropic.parameters/2020-12-bounded-v1',
    parameter_schema_version: '1.0.0',
    requires_new_entry_version_on_package_version_change: true,
    publication_receipt_contract: 'MemoryPublisherAssetsV1',
  });

export function validateMemoryPublisherEntryV1(
  entry: Partial<MemoryPublisherEntryV1>,
  versionStep?: {
    readonly previous_package_version?: string;
    readonly current_package_version?: string;
    readonly previous_entry_version?: string;
  },
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false, reason: 'Publisher entry must be a closed object' };
  const fields = Object.keys(ENGRAM_MEMORY_PUBLISHER_ENTRY_V1);
  if (Object.keys(entry).length !== fields.length || Object.keys(entry).some(k => !fields.includes(k))) return { ok: false, reason: 'Missing or unknown publisher contract field' };
  for (const key of fields) {
    if (key !== 'entry_version' && key !== 'manifest_version' && entry[key] !== ENGRAM_MEMORY_PUBLISHER_ENTRY_V1[key]) return { ok: false, reason: 'Incompatible publisher contract field: ' + key };
  }
  if (
    entry.id !== 'sentropic.engram.memory' ||
    entry.provider_id !== 'sentropic.engram.memory' ||
    entry.id !== entry.provider_id
  ) {
    return {
      ok: false,
      reason:
        "Publisher entry id and provider_id must both equal 'sentropic.engram.memory'",
    };
  }
  if (entry.connector_id !== 'engram-memory' || entry.app_id !== 'engram') {
    return {
      ok: false,
      reason: "connector_id must equal 'engram-memory' and app_id must equal 'engram'",
    };
  }
  if (entry.registry_schema_version !== '1.1.4') {
    return {
      ok: false,
      reason: "registry_schema_version must equal '1.1.4'",
    };
  }
  if (
    typeof entry.entry_version !== 'string' ||
    entry.entry_version.length === 0 ||
    entry.entry_version !== entry.manifest_version
  ) {
    return {
      ok: false,
      reason: 'manifest_version must equal entry_version (R §3.2)',
    };
  }
  if (entry.provider_behavioral_contract_version !== '1.0.0') {
    return {
      ok: false,
      reason: "provider_behavioral_contract_version must be tracked as '1.0.0'",
    };
  }
  if (
    entry.selected_release_option !== 'B' ||
    entry.adapter_delivering_version_in_0_20_0 !== null ||
    entry.later_b_adapter_version_status !== 'unverified'
  ) {
    return {
      ok: false,
      reason:
        'M14 selects Option B: 0.20.0 delivers no MCP adapter (null) and later adapter version remains unverified',
    };
  }
  if (
    versionStep?.previous_package_version !== undefined &&
    versionStep.current_package_version !== undefined &&
    versionStep.previous_package_version !== versionStep.current_package_version &&
    versionStep.previous_entry_version === entry.entry_version
  ) {
    return {
      ok: false,
      reason:
        'Changed publisher packageVersion requires a new immutable entryVersion and manifestVersion',
    };
  }
  return { ok: true };
}

// ============================================================================
// L0-A02 — Local Lazy Definition, Bounded Parameters & Host Binding Set
// ============================================================================

export type MemoryRequiredHostBindingPortNameV1 =
  | 'invocation'
  | 'authorization'
  | 'domainPolicy'
  | 'engine'
  | 'mutationRecovery'
  | 'confirmation'
  | 'audit'
  | 'pagination'
  | 'lifecycle';

export interface MemoryLocalDefinitionContractV1 {
  readonly definition_export_name: 'memoryDefinition';
  readonly definitions_subpath: './registry/definitions';
  readonly literal_loader_target: './mcp-memory';
  readonly local_definition_kinds: readonly ['LoadedDefinition', 'LazyDefinition'];
  readonly zero_unselected_load: true;
  readonly parameter_profile: 'sentropic.parameters/2020-12-bounded-v1';
  readonly parameter_schema_version: '1.0.0';
  readonly mode_const: 'embedded-local';
  readonly default_parameters: { readonly mode: 'embedded-local' };
  readonly host_binding_ref_has_default: false;
  readonly host_binding_ref_min_ascii: 1;
  readonly host_binding_ref_max_ascii: 128;
  readonly host_binding_ref_pattern: '^[a-z0-9][a-z0-9._-]*$';
  readonly required_binding_ports: readonly [
    'invocation',
    'authorization',
    'domainPolicy',
    'engine',
    'mutationRecovery',
    'confirmation',
    'audit',
    'pagination',
    'lifecycle',
  ];
  readonly optional_diagnostics_grant_authority: false;
  readonly remote_bound_required: false;
}

export const ENGRAM_MEMORY_LOCAL_DEFINITION_CONTRACT_V1: MemoryLocalDefinitionContractV1 =
  Object.freeze({
    definition_export_name: 'memoryDefinition',
    definitions_subpath: './registry/definitions',
    literal_loader_target: './mcp-memory',
    local_definition_kinds: Object.freeze([
      'LoadedDefinition',
      'LazyDefinition',
    ] as const),
    zero_unselected_load: true,
    parameter_profile: 'sentropic.parameters/2020-12-bounded-v1',
    parameter_schema_version: '1.0.0',
    mode_const: 'embedded-local',
    default_parameters: Object.freeze({ mode: 'embedded-local' as const }),
    host_binding_ref_has_default: false,
    host_binding_ref_min_ascii: 1,
    host_binding_ref_max_ascii: 128,
    host_binding_ref_pattern: '^[a-z0-9][a-z0-9._-]*$',
    required_binding_ports: Object.freeze([
      'invocation',
      'authorization',
      'domainPolicy',
      'engine',
      'mutationRecovery',
      'confirmation',
      'audit',
      'pagination',
      'lifecycle',
    ] as const),
    optional_diagnostics_grant_authority: false,
    remote_bound_required: false,
  });

export const MEMORY_BOUNDED_PARAMETER_SCHEMA_V1 = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://sentropic.dev/schemas/engram/memory/parameters-v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'hostBindingRef'] as const,
  properties: {
    mode: {
      type: 'string',
      const: 'embedded-local',
      default: 'embedded-local',
    },
    hostBindingRef: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      pattern: '^[a-z0-9][a-z0-9._-]*$',
    },
  },
} as const);

export interface MemoryHostBindingSetV1 {
  readonly profileBindings: MemoryHostProfileBindingsV1;
  readonly hostBindingRef: string;
  readonly invocation: { readonly contractVersion: '1.0.0' };
  readonly authorization: { readonly contractVersion: '1.0.0' };
  readonly domainPolicy: { readonly contractVersion: '1.0.0' };
  readonly engine: {
    readonly mutationPortVersion: 2;
    readonly recallPortVersion: 3;
    readonly readPortVersion: 1;
    readonly engineId: string;
    readonly canonicalStoreId: string;
    readonly fenceProvenanceId: string;
  };
  readonly mutationRecovery: {
    readonly contractVersion: '1.0.0';
    readonly digestProfile: 'sentropic.engram.memory-mutation/v1';
  };
  readonly confirmation: {
    readonly contractVersion: '1.0.0';
    readonly enrolledOidcDomain: 'sent-tech.ca';
  };
  readonly audit: { readonly contractVersion: '1.0.0' };
  readonly pagination: {
    readonly contractVersion: '1.0.0';
    readonly engramOwnsSigningSecret: false;
  };
  readonly lifecycle: { readonly contractVersion: '1.0.0' };
  readonly diagnostics?: { readonly grantsAuthority: false };
}

// Registry R 1.1.4 §3.3: the only admitted bounded-profile pattern.
const HOST_BINDING_REF_RE = /^[a-z0-9][a-z0-9._-]*$/;
function isHostBindingRef(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128 &&
    HOST_BINDING_REF_RE.exec(value)?.[0] === value;
}

export function validateMemoryLocalParametersV1(
  params: unknown,
):
  | {
      readonly ok: true;
      readonly value: {
        readonly mode: 'embedded-local';
        readonly hostBindingRef: string;
      };
    }
  | { readonly ok: false; readonly reason: string } {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return { ok: false, reason: 'Parameters must be a plain object' };
  }
  const obj = params as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'mode' && key !== 'hostBindingRef') {
      return {
        ok: false,
        reason: `Parameter '${key}' is forbidden by bounded parameter schema`,
      };
    }
  }
  if (obj.mode !== 'embedded-local') {
    return { ok: false, reason: "mode must equal 'embedded-local'" };
  }
  if (
    !isHostBindingRef(obj.hostBindingRef)
  ) {
    return {
      ok: false,
      reason:
        'hostBindingRef is required (no default) and must be 1..128 printable ASCII characters',
    };
  }
  return {
    ok: true,
    value: {
      mode: 'embedded-local',
      hostBindingRef: obj.hostBindingRef,
    },
  };
}

export function validateMemoryHostBindingSetV1(
  bindings: unknown,
):
  | { readonly ok: true; readonly value: MemoryHostBindingSetV1 }
  | { readonly ok: false; readonly reason: string } {
  if (
    typeof bindings !== 'object' ||
    bindings === null ||
    Array.isArray(bindings)
  ) {
    return { ok: false, reason: 'MemoryHostBindingSetV1 must be a plain object' };
  }
  const b = bindings as Record<string, unknown>;
  if (!validateMemoryHostProfileBindingsV1(b.profileBindings).ok) return { ok: false, reason: 'Missing or incompatible versioned host profile/digest bindings' };
  if (
    !isHostBindingRef(b.hostBindingRef)
  ) {
    return { ok: false, reason: 'Invalid or missing hostBindingRef' };
  }
  for (const portName of ENGRAM_MEMORY_LOCAL_DEFINITION_CONTRACT_V1.required_binding_ports) {
    const port = b[portName];
    if (typeof port !== 'object' || port === null || Array.isArray(port)) {
      return {
        ok: false,
        reason: `Missing required host binding port '${portName}'`,
      };
    }
    if (portName !== 'engine' && (port as Record<string, unknown>).contractVersion !== '1.0.0') {
      return { ok: false, reason: 'Incompatible host binding contract version: ' + portName };
    }
  }
  if ((b.mutationRecovery as Record<string, unknown>).digestProfile !== 'sentropic.engram.memory-mutation/v1' ||
      (b.confirmation as Record<string, unknown>).enrolledOidcDomain !== 'sent-tech.ca') {
    return { ok: false, reason: 'Incompatible mutation digest profile or confirmation domain' };
  }
  const engine = b.engine as Record<string, unknown>;
  if (
    engine.mutationPortVersion !== 2 ||
    engine.recallPortVersion !== 3 ||
    engine.readPortVersion !== 1 ||
    typeof engine.engineId !== 'string' ||
    engine.engineId.length === 0 ||
    typeof engine.canonicalStoreId !== 'string' ||
    engine.canonicalStoreId.length === 0 ||
    typeof engine.fenceProvenanceId !== 'string' ||
    engine.fenceProvenanceId.length === 0
  ) {
    return {
      ok: false,
      reason:
        'engine binding must expose V2 mutations, V3 recall, and V1 read sharing one engine, canonical store, and fence provenance',
    };
  }
  const pagination = b.pagination as Record<string, unknown>;
  if (pagination.engramOwnsSigningSecret !== false) {
    return {
      ok: false,
      reason: 'pagination binding must enforce engramOwnsSigningSecret: false',
    };
  }
  if (b.diagnostics !== undefined) {
    const diag = b.diagnostics as Record<string, unknown>;
    if (!diag || typeof diag !== 'object' || Array.isArray(diag) || diag.grantsAuthority !== false) {
      return {
        ok: false,
        reason: 'Optional diagnostics port must never grant authority',
      };
    }
  }
  return { ok: true, value: bindings as MemoryHostBindingSetV1 };
}

// ============================================================================
// L0-A07 — Selection, Permissions, Revocation & Host Storage Profiles
// ============================================================================

export interface MemoryCatalogCacheKeyV1 {
  readonly tenant_id: string;
  readonly principal_id: string;
  readonly agent_id: string;
  readonly policy_epoch: string;
  readonly provider_id: 'sentropic.engram.memory';
  readonly provider_version: string;
  readonly source_id: 'mcp:engram-memory';
  readonly plan_generation: string;
}

export interface MemorySelectionPolicyBindingV1 {
  readonly pipeline_phases: readonly ['register', 'select', 'configure', 'compile'];
  readonly default_selected: false;
  readonly registration_loads_provider_or_store: false;
  readonly local_mesh_namespace: '/memory';
  readonly disabled_namespace_helper: 'disabledNamespaceModule';
  readonly disabled_namespace_helper_namespaces: readonly [
    '/llm-mesh',
    '/gw',
    '/memory',
  ];
  readonly cluster_mesh_public_entries: readonly [
    '@sentropic/cluster-mesh/memory',
    '@sentropic/cluster-mesh/loaders/memory',
    '@sentropic/cluster-mesh/compose/memory',
  ];
  readonly catalog_cache_key_fields: readonly [
    'tenant_id',
    'principal_id',
    'agent_id',
    'policy_epoch',
    'provider_id',
    'provider_version',
    'source_id',
    'plan_generation',
  ];
}

export interface MemoryHostStorageProfileV1 {
  readonly required_receipt_contract: 'MemoryHostStorageReceiptsV1';
  readonly sentropic_host: {
    readonly concrete_backend_status: 'unverified';
    readonly independent_from_h2a: true;
    readonly calls_h2a_endpoint: false;
    readonly shares_store_with_h2a: false;
  };
  readonly h2a_host: {
    readonly concrete_backend: 'embedded-local-linux-sqlite';
    readonly single_mcp_server_key: 'h2a';
    readonly independent_from_sentropic: true;
    readonly shares_store_with_sentropic: false;
  };
}

export const ENGRAM_MEMORY_SELECTION_POLICY_BINDING_V1: MemorySelectionPolicyBindingV1 =
  Object.freeze({
    pipeline_phases: Object.freeze([
      'register',
      'select',
      'configure',
      'compile',
    ] as const),
    default_selected: false,
    registration_loads_provider_or_store: false,
    local_mesh_namespace: '/memory',
    disabled_namespace_helper: 'disabledNamespaceModule',
    disabled_namespace_helper_namespaces: Object.freeze([
      '/llm-mesh',
      '/gw',
      '/memory',
    ] as const),
    cluster_mesh_public_entries: Object.freeze([
      '@sentropic/cluster-mesh/memory',
      '@sentropic/cluster-mesh/loaders/memory',
      '@sentropic/cluster-mesh/compose/memory',
    ] as const),
    catalog_cache_key_fields: Object.freeze([
      'tenant_id',
      'principal_id',
      'agent_id',
      'policy_epoch',
      'provider_id',
      'provider_version',
      'source_id',
      'plan_generation',
    ] as const),
  });

export const ENGRAM_MEMORY_HOST_STORAGE_PROFILE_V1: MemoryHostStorageProfileV1 =
  Object.freeze({
    required_receipt_contract: 'MemoryHostStorageReceiptsV1',
    sentropic_host: Object.freeze({
      concrete_backend_status: 'unverified' as const,
      independent_from_h2a: true as const,
      calls_h2a_endpoint: false as const,
      shares_store_with_h2a: false as const,
    }),
    h2a_host: Object.freeze({
      concrete_backend: 'embedded-local-linux-sqlite' as const,
      single_mcp_server_key: 'h2a' as const,
      independent_from_sentropic: true as const,
      shares_store_with_sentropic: false as const,
    }),
  });

export function evaluateMemorySelectionAndRevocationV1(input: {
  readonly tenant_opted_in?: unknown;
  readonly agent_selected?: unknown;
  readonly tool_permitted?: unknown;
  readonly plan_compiled?: unknown;
  readonly has_collision?: unknown;
  readonly has_verified_call_context?: unknown;
  readonly disabled?: unknown;
  readonly call_generation: string;
  readonly active_generation: string;
  readonly cache_key?: Partial<MemoryCatalogCacheKeyV1>;
}):
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly refusal_code:
        | 'collision_refused'
        | 'context_free_search_refused'
        | 'tenant_or_agent_not_opted_in'
        | 'stale_or_revoked_generation_fenced'
        | 'invalid_cache_key';
    } {
  if (input.has_collision === true) {
    return { allowed: false, refusal_code: 'collision_refused' };
  }
  if (input.has_verified_call_context !== true) {
    return { allowed: false, refusal_code: 'context_free_search_refused' };
  }
  if (
    input.disabled === true ||
    input.call_generation !== input.active_generation
  ) {
    return {
      allowed: false,
      refusal_code: 'stale_or_revoked_generation_fenced',
    };
  }
  if (
    input.tenant_opted_in !== true ||
    input.agent_selected !== true ||
    input.tool_permitted !== true ||
    input.plan_compiled !== true
  ) {
    return { allowed: false, refusal_code: 'tenant_or_agent_not_opted_in' };
  }
  if (input.cache_key !== undefined) {
    for (const field of ENGRAM_MEMORY_SELECTION_POLICY_BINDING_V1.catalog_cache_key_fields) {
      const v = input.cache_key[field];
      if (typeof v !== 'string' || v.length === 0) {
        return { allowed: false, refusal_code: 'invalid_cache_key' };
      }
    }
    if (input.cache_key.plan_generation !== input.active_generation) {
      return {
        allowed: false,
        refusal_code: 'stale_or_revoked_generation_fenced',
      };
    }
  }
  return { allowed: true };
}

// ============================================================================
// L0-A08 & M14 — Release Gate Matrix (Option B Selected) & Legacy Migration
// ============================================================================

export interface MemoryReleaseGateMatrixV1 {
  readonly m14_owner_decision_date: '2026-10-17';
  readonly owner_selected_option: 'B';
  readonly option_a_pursued: false;
  readonly first_qualified_agent_use_waits_for_host_chain_under_both_options: true;
  readonly options: {
    readonly A: {
      readonly pursued: false;
      readonly engram_0_20_0_lots: readonly [
        'MCP-L0',
        'MCP-L1',
        'MCP-L2',
        'MCP-L3',
        'MCP-L4',
      ];
      readonly includes_l4_adapter_in_0_20_0: true;
      readonly requires_l5_memory_v1_checkpoint_before_0_20_0: true;
    };
    readonly B: {
      readonly pursued: true;
      readonly engram_0_20_0_lots: readonly [
        'MCP-L0',
        'MCP-L1',
        'MCP-L2',
        'MCP-L3',
      ];
      readonly includes_l4_adapter_in_0_20_0: false;
      readonly exposes_executable_mcp_provider_or_loader_in_0_20_0: false;
      readonly reference_durable_host_ports_in_0_20_0: readonly [
        'reservation',
        'audit_sink',
        'policy_version_store',
      ];
      readonly later_adapter_release_order: readonly [
        'L4_candidate',
        'L5_qualification_SqliteMemoryWorkflowStoreV1',
        'L5-MEMORY-V1',
        'L4_exit',
      ];
      readonly later_adapter_version_status: 'unverified';
    };
  };
}

export const ENGRAM_MEMORY_RELEASE_GATE_MATRIX_V1: MemoryReleaseGateMatrixV1 =
  Object.freeze({
    m14_owner_decision_date: '2026-10-17',
    owner_selected_option: 'B',
    option_a_pursued: false,
    first_qualified_agent_use_waits_for_host_chain_under_both_options: true,
    options: Object.freeze({
      A: Object.freeze({
        pursued: false as const,
        engram_0_20_0_lots: Object.freeze([
          'MCP-L0',
          'MCP-L1',
          'MCP-L2',
          'MCP-L3',
          'MCP-L4',
        ] as const),
        includes_l4_adapter_in_0_20_0: true as const,
        requires_l5_memory_v1_checkpoint_before_0_20_0: true as const,
      }),
      B: Object.freeze({
        pursued: true as const,
        engram_0_20_0_lots: Object.freeze([
          'MCP-L0',
          'MCP-L1',
          'MCP-L2',
          'MCP-L3',
        ] as const),
        includes_l4_adapter_in_0_20_0: false as const,
        exposes_executable_mcp_provider_or_loader_in_0_20_0: false as const,
        reference_durable_host_ports_in_0_20_0: Object.freeze([
          'reservation',
          'audit_sink',
          'policy_version_store',
        ] as const),
        later_adapter_release_order: Object.freeze([
          'L4_candidate',
          'L5_qualification_SqliteMemoryWorkflowStoreV1',
          'L5-MEMORY-V1',
          'L4_exit',
        ] as const),
        later_adapter_version_status: 'unverified' as const,
      }),
    }),
  });

export interface MemoryLegacyMigrationContractV1 {
  readonly l7_mesh_legacy_removal: {
    readonly retired_symbols: readonly [
      'H2aGraphifyMemoryPort',
      'createGraphifyMemoryAdapter',
    ];
    readonly requires_even_0_x_major: true;
    readonly requires_n_minus_1_conformance: true;
    readonly cannot_be_0_18_0_or_r2_additive_minor: true;
    readonly planning_candidate_if_0_x: '1.0.0';
    readonly exact_releasable_version_status: 'unverified';
    readonly claims_h2a_l8_already_migrated: false;
  };
  readonly l8_h2a_migration: {
    readonly retired_files: typeof LEGACY_MIGRATION_DISPOSITIONS_V1.h2a_legacy_memory_files_retired;
    readonly d11_reanchored_in: readonly [
      'AdmissionPolicy',
      'EvidenceVerifierPort',
    ];
    readonly updated_manifests: readonly [
      'packages/h2a/package.json',
      'packages/h2a-runtime/package.json',
    ];
    readonly planning_targets_do_not_preassign_memory_train: readonly [
      '0.98.7',
      '0.98.8',
    ];
    readonly chosen_memory_train_status: 'unverified';
  };
}

export const ENGRAM_MEMORY_LEGACY_MIGRATION_CONTRACT_V1: MemoryLegacyMigrationContractV1 =
  Object.freeze({
    l7_mesh_legacy_removal: Object.freeze({
      retired_symbols: Object.freeze([
        'H2aGraphifyMemoryPort',
        'createGraphifyMemoryAdapter',
      ] as const),
      requires_even_0_x_major: true as const,
      requires_n_minus_1_conformance: true as const,
      cannot_be_0_18_0_or_r2_additive_minor: true as const,
      planning_candidate_if_0_x: '1.0.0' as const,
      exact_releasable_version_status: 'unverified' as const,
      claims_h2a_l8_already_migrated: false as const,
    }),
    l8_h2a_migration: Object.freeze({
      retired_files:
        LEGACY_MIGRATION_DISPOSITIONS_V1.h2a_legacy_memory_files_retired,
      d11_reanchored_in: Object.freeze([
        'AdmissionPolicy',
        'EvidenceVerifierPort',
      ] as const),
      updated_manifests: Object.freeze([
        'packages/h2a/package.json',
        'packages/h2a-runtime/package.json',
      ] as const),
      planning_targets_do_not_preassign_memory_train: Object.freeze([
        '0.98.7',
        '0.98.8',
      ] as const),
      chosen_memory_train_status: 'unverified' as const,
    }),
  });

// ============================================================================
// L0-A09 — Candidate Qualification Matrix & Shared-File Writer Handoff
// ============================================================================

export interface MemoryCandidateEvidenceMatrixV1 {
  readonly required_tuple_contract: 'MemoryCandidateTupleV1';
  readonly l5_checkpoint_id: 'L5-MEMORY-V1';
  readonly l5_reference_workflow_store: 'SqliteMemoryWorkflowStoreV1';
  readonly l5_reference_subpath: '@sentropic/mcp-broker/memory-reference';
  readonly qualification_sequence: readonly [
    'L4_candidate',
    'L5_qualification_SqliteMemoryWorkflowStoreV1',
    'L5-MEMORY-V1',
    'L4_exit',
  ];
  readonly required_l5_proofs: readonly [
    'forged_call_refusal',
    'source_binding',
    'concurrent_subject_tenant',
    'workspace_not_equal_tenant',
    'missing_or_substituted_context_audit_verdicts',
    'session_assurance_confirmation_refusal',
    'close_reopen_process_restart_lost_ack',
  ];
  readonly mocks_accepted_as_qualification_evidence: false;
  readonly gwrc_ci_contract_id: 'GWRC-CI-V1';
  readonly gwrc_admitted_programs_today: readonly ['gateway', 'registry'];
  readonly program_memory_admitted_without_cofreeze: false;
  readonly feedback_loop_items: readonly [
    { readonly id: 'SM-01'; readonly source_status: 'attention' },
    { readonly id: 'SM-02'; readonly source_status: 'blocked' },
    { readonly id: 'SM-03'; readonly source_status: 'blocked' },
  ];
}

export interface MemoryWriterHandoffV1 {
  readonly writer_order: readonly [
    '#679',
    'gateway-PR1-#685',
    'R2',
    'R7a',
    'R3',
    'MCP-L5',
    'MCP-L6',
    'MCP-L7',
  ];
  readonly r2_r7a_r3_single_registry_feature: true;
  readonly one_branch_per_mcp_lot: true;
  readonly preserve_gateway_and_mesh_peer_widenings: true;
  readonly restore_legacy_peer_caps_forbidden: true;
}

export const ENGRAM_MEMORY_CANDIDATE_EVIDENCE_MATRIX_V1: MemoryCandidateEvidenceMatrixV1 =
  Object.freeze({
    required_tuple_contract: 'MemoryCandidateTupleV1',
    l5_checkpoint_id: 'L5-MEMORY-V1',
    l5_reference_workflow_store: 'SqliteMemoryWorkflowStoreV1',
    l5_reference_subpath: '@sentropic/mcp-broker/memory-reference',
    qualification_sequence: Object.freeze([
      'L4_candidate',
      'L5_qualification_SqliteMemoryWorkflowStoreV1',
      'L5-MEMORY-V1',
      'L4_exit',
    ] as const),
    required_l5_proofs: Object.freeze([
      'forged_call_refusal',
      'source_binding',
      'concurrent_subject_tenant',
      'workspace_not_equal_tenant',
      'missing_or_substituted_context_audit_verdicts',
      'session_assurance_confirmation_refusal',
      'close_reopen_process_restart_lost_ack',
    ] as const),
    mocks_accepted_as_qualification_evidence: false,
    gwrc_ci_contract_id: 'GWRC-CI-V1',
    gwrc_admitted_programs_today: Object.freeze(['gateway', 'registry'] as const),
    program_memory_admitted_without_cofreeze: false,
    feedback_loop_items: Object.freeze([
      Object.freeze({ id: 'SM-01' as const, source_status: 'attention' as const }),
      Object.freeze({ id: 'SM-02' as const, source_status: 'blocked' as const }),
      Object.freeze({ id: 'SM-03' as const, source_status: 'blocked' as const }),
    ] as const),
  });

export const ENGRAM_MEMORY_WRITER_HANDOFF_V1: MemoryWriterHandoffV1 =
  Object.freeze({
    writer_order: Object.freeze([
      '#679',
      'gateway-PR1-#685',
      'R2',
      'R7a',
      'R3',
      'MCP-L5',
      'MCP-L6',
      'MCP-L7',
    ] as const),
    r2_r7a_r3_single_registry_feature: true,
    one_branch_per_mcp_lot: true,
    preserve_gateway_and_mesh_peer_widenings: true,
    restore_legacy_peer_caps_forbidden: true,
  });

export function validateCandidateQualificationOrderV1(input: {
  readonly qualified_tuple?: MemoryCandidateTupleV1;
  readonly consumed_tuple?: MemoryCandidateTupleV1;
  readonly l4_candidate_prepared?: unknown;
  readonly l5_qualified_on_l4_candidate?: unknown;
  readonly workflow_store_impl?: string;
  readonly uses_in_memory_mock?: unknown;
  readonly forged_call_refusal_verified?: unknown;
  readonly source_binding_verified?: unknown;
  readonly l5_checkpoint_id?: string;
  readonly l4_exit_claimed?: unknown;
  readonly gwrc_program?: string;
  readonly gwrc_memory_extension_cofrozen?: unknown;
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (input.uses_in_memory_mock === true) {
    return {
      ok: false,
      reason: 'In-memory mocks are forbidden as L5 qualification evidence',
    };
  }
  if (
    input.workflow_store_impl !== undefined &&
    input.workflow_store_impl !== 'SqliteMemoryWorkflowStoreV1'
  ) {
    return {
      ok: false,
      reason:
        "L5 qualification must use real 'SqliteMemoryWorkflowStoreV1' (@sentropic/mcp-broker/memory-reference)",
    };
  }
  if (input.l4_exit_claimed === true) {
    const tuple = validateMemoryQualifiedTupleV1(input.qualified_tuple, input.consumed_tuple);
    if (!tuple.ok) return tuple;
    if (
      input.l4_candidate_prepared !== true ||
      input.l5_qualified_on_l4_candidate !== true ||
      input.workflow_store_impl !== 'SqliteMemoryWorkflowStoreV1' ||
      input.forged_call_refusal_verified !== true ||
      input.source_binding_verified !== true ||
      input.l5_checkpoint_id !== 'L5-MEMORY-V1'
    ) {
      return {
        ok: false,
        reason:
          'L4 exit requires L4_candidate -> L5 qualification on SqliteMemoryWorkflowStoreV1 with forged-call and source-binding proofs -> accepted L5-MEMORY-V1 checkpoint',
      };
    }
  }
  if (
    input.gwrc_program === 'memory' &&
    input.gwrc_memory_extension_cofrozen !== true
  ) {
    return {
      ok: false,
      reason:
        "GWRC-CI-V1 admits only 'gateway' | 'registry' until a joint co-freeze extends the schema",
    };
  }
  return { ok: true };
}
