/**
 * L0-A01/A07/A09 receipt contracts, not delivered publisher/host artifacts.
 * SPEC-memory-mcp-v3.1.md:900-908, 1432-1436, 1606, 1612, 1614;
 * registry-entry-contract-v9.md:124-206 (contract 1.1.4).
 * Deployment values and public versions remain unverified until their owning lot.
 */
import { createHash } from 'node:crypto';
import { validatePublishedJsonSchemaDraft202012 } from './schemas.js';

const sha256 = { type: 'string', pattern: '^[0-9a-f]{64}$', minLength: 64, maxLength: 64 } as const;
// Registry asset paths/receipt identifiers have no additional byte ceiling in M7.
const ref = { type: 'string', minLength: 1 } as const;
// Exact SemVer, including numeric prerelease rules and an absolute end anchor.
const version = { type: 'string', pattern: String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?![\s\S])` } as const;
function closed(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } as const;
}
const asset = closed({ role: ref, path: ref, mediaType: ref, sha256 });
const digestBinding = closed({ id: ref, version, sha256 });
const packageBinding = closed({ packageName: ref, packageVersion: version });

/** R 1.1.4 §3.2, M7:896-906. The entry contains no digest of itself. */
export interface MemoryRegistryEntryV1 {
  format: 'sentropic.registry-entry/v1';
  contractVersion: '1.1.4';
  kind: 'mcp';
  id: 'sentropic.engram.memory';
  name: string;
  description: string;
  entryVersion: string;
  publisher: { packageName: '@sentropic/engram'; packageVersion: string };
  compatibility: {
    entryContract: string;
    packages: { name: string; range: string }[];
    schemaProfiles: string[];
    requiredHostFeatures: string[];
    optionalHostFeatures: string[];
  };
  parameters: { schemaVersion: '1.0.0'; schema: Record<string, unknown>; defaults: { mode: 'embedded-local' } };
  bindings: { key: string; contract: string; required: boolean }[];
  assets: { role: string; path: string; mediaType: string; sha256: string }[];
  mcp: {
    manifestAsset: string;
    connectorIds: ['engram-memory'];
    transportProfiles: { id: string; mode: 'in-process' | 'stdio' | 'streamable-http' | 'binding'; bindingKey?: string; protocolVersions: string[]; requiredHostFeatures: string[] }[];
    protocolVersions: string[];
  };
}
export interface MemoryRegistryPackageV1 {
  format: 'sentropic.registry-package/v1';
  entries: MemoryRegistryEntryV1[];
}

/** A02:1607: versioned profile IDs plus exact-byte asset digests, supplied by the host. */
export interface MemoryHostProfileBindingsV1 {
  wireProfileId: 'sentropic.engram.memory-wire/v1';
  wireProfileSha256: string;
  toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1';
  toolSchemaProfileSha256: string;
  parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1';
  parameterSchemaVersion: '1.0.0';
  parameterProfileSha256: string;
}
export const MEMORY_HOST_PROFILE_BINDINGS_V1_SCHEMA = closed({
  wireProfileId: { const: 'sentropic.engram.memory-wire/v1' }, wireProfileSha256: sha256,
  toolSchemaProfileId: { const: 'sentropic.engram.memory-tools/2020-12-v1' }, toolSchemaProfileSha256: sha256,
  parameterProfileId: { const: 'sentropic.parameters/2020-12-bounded-v1' }, parameterSchemaVersion: { const: '1.0.0' }, parameterProfileSha256: sha256,
});
export function validateMemoryHostProfileBindingsV1(value: unknown): { ok: boolean } {
  return { ok: validatePublishedJsonSchemaDraft202012(MEMORY_HOST_PROFILE_BINDINGS_V1_SCHEMA, value).ok };
}

/** Raw exact-byte SHA-256 is separate from the external RFC 8785 entry hash. */
export interface MemoryPublisherAssetsV1 {
  schema_version: 1;
  publisher: { packageName: '@sentropic/engram'; packageVersion: string };
  entryVersion: string;
  manifestVersion: string;
  providerContractVersion: '1.0.0';
  assets: { role: string; path: string; mediaType: string; sha256: string }[];
  entryJcsSha256: string;
  tarballSha256: string;
  tarballIntegrity: string;
  baseManifestSha256: string;
  effectiveManifestSha256: string;
  schemas: { tool: string; inputAsset: string; outputAsset: string }[];
  wireProfile: { id: 'sentropic.engram.memory-wire/v1'; version: string; sha256: string };
  toolSchemaProfile: { id: 'sentropic.engram.memory-tools/2020-12-v1'; version: string; sha256: string };
  parameterProfile: { id: 'sentropic.parameters/2020-12-bounded-v1'; version: string; sha256: string };
  validator: { id: string; version: string; sha256: string };
  executableProvenance: { sourceHead: string; codeArchiveSha256: string; dependencyClosureSha256: string };
}

export const MEMORY_PUBLISHER_ASSETS_V1_SCHEMA = closed({
  schema_version: { const: 1 }, publisher: closed({ ...packageBinding.properties, packageName: { const: '@sentropic/engram' } }),
  entryVersion: version, manifestVersion: version, providerContractVersion: { const: '1.0.0' },
  assets: { type: 'array', minItems: 1, items: asset },
  entryJcsSha256: sha256, tarballSha256: sha256, tarballIntegrity: ref,
  baseManifestSha256: sha256, effectiveManifestSha256: sha256,
  schemas: { type: 'array', minItems: 6, maxItems: 6, items: closed({ tool: ref, inputAsset: ref, outputAsset: ref }) },
  wireProfile: closed({ ...digestBinding.properties, id: { const: 'sentropic.engram.memory-wire/v1' } }),
  toolSchemaProfile: closed({ ...digestBinding.properties, id: { const: 'sentropic.engram.memory-tools/2020-12-v1' } }),
  parameterProfile: closed({ ...digestBinding.properties, id: { const: 'sentropic.parameters/2020-12-bounded-v1' } }),
  validator: digestBinding,
  executableProvenance: closed({ sourceHead: ref, codeArchiveSha256: sha256, dependencyClosureSha256: sha256 }),
});

type Check = { ok: true } | { ok: false; reason: string };
const invalid = (reason: string): Check => ({ ok: false, reason });
const exactBytesSha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Packed bytes are supplied by the caller; this contract does no IO or loading. */
export function validateMemoryPublisherAssetsV1(value: unknown, packedAssets: ReadonlyMap<string, Uint8Array>): Check {
  if (!validatePublishedJsonSchemaDraft202012(MEMORY_PUBLISHER_ASSETS_V1_SCHEMA, value).ok) return invalid('Invalid publisher receipt');
  const r = value as MemoryPublisherAssetsV1;
  if (r.entryVersion !== r.manifestVersion) return invalid('Entry and manifest publication versions differ');
  const paths = new Set<string>();
  for (const a of r.assets) {
    if (a.path.startsWith('/') || a.path.includes('\\') || a.path.includes(':') || a.path.split('/').some(p => p === '' || p === '.' || p === '..') || paths.has(a.path)) return invalid('Asset path escapes or duplicates package closure');
    paths.add(a.path);
    const bytes = packedAssets.get(a.path);
    if (!bytes || exactBytesSha256(bytes) !== a.sha256) return invalid('Asset bytes do not match digest');
  }
  const names = ['engram_memory_search', 'engram_memory_get', 'engram_memory_capture', 'engram_memory_request_admission', 'engram_memory_withdraw', 'engram_memory_forget'];
  if (new Set(r.schemas.map(s => s.tool)).size !== 6 || names.some(n => !r.schemas.some(s => s.tool === n)) ||
      r.schemas.some(s => !paths.has(s.inputAsset) || !paths.has(s.outputAsset))) return invalid('Six schema pairs must resolve in the asset closure');
  for (const role of ['manifest', 'wire-profile', 'tool-schema-profile', 'parameter-schema', 'validator']) {
    if (!r.assets.some(a => a.role === role)) return invalid('Incomplete manifest/profile/validator asset closure');
  }
  for (const [role, digest] of [['manifest', r.baseManifestSha256], ['wire-profile', r.wireProfile.sha256], ['tool-schema-profile', r.toolSchemaProfile.sha256], ['parameter-schema', r.parameterProfile.sha256], ['validator', r.validator.sha256]]) {
    if (!r.assets.some(a => a.role === role && a.sha256 === digest)) return invalid('Profile or manifest digest does not match its asset');
  }
  return { ok: true };
}

/** Host receipts identify policy/custody capabilities, never keys or credentials. */
export interface MemoryHostStorageReceiptsV1 {
  schema_version: 1;
  host: 'sentropic' | 'h2a';
  store_id: string;
  backend: { id: string; version: string; receipt_sha256: string };
  fence: { id: string; version: string; receipt_sha256: string };
  custody: { id: string; version: string; receipt_sha256: string };
  admin: { id: string; version: string; receipt_sha256: string };
  retention: { id: string; version: string; receipt_sha256: string };
  maintenance: { id: string; version: string; receipt_sha256: string };
  pagination: { id: string; version: string; receipt_sha256: string };
  recall_port_version: 3;
  read_port_version: 1;
  independent_store: true;
  cross_host_memory_calls: false;
}
const capabilityReceipt = closed({ id: ref, version: ref, receipt_sha256: sha256 });
export const MEMORY_HOST_STORAGE_RECEIPTS_V1_SCHEMA = closed({
  schema_version: { const: 1 }, host: { enum: ['sentropic', 'h2a'] }, store_id: ref,
  backend: capabilityReceipt, fence: capabilityReceipt, custody: capabilityReceipt, admin: capabilityReceipt,
  retention: capabilityReceipt, maintenance: capabilityReceipt, pagination: capabilityReceipt,
  recall_port_version: { const: 3 }, read_port_version: { const: 1 }, independent_store: { const: true }, cross_host_memory_calls: { const: false },
});
export function validateMemoryHostStorageReceiptsV1(value: unknown): Check {
  return validatePublishedJsonSchemaDraft202012(MEMORY_HOST_STORAGE_RECEIPTS_V1_SCHEMA, value).ok ? { ok: true } : invalid('Invalid host storage/fence/custody receipt');
}

/** Exact candidate/published tuple (M7:809-815, M11:1432-1436). */
export interface MemoryCandidateTupleV1 {
  schema_version: 1;
  status: 'candidate' | 'published';
  source: { head: string; base: string; merge: string; checkout: string };
  ci: { run_id: string; attempt: number };
  artifacts: { packageName: string; packageVersion: string; tarballSha256: string; integrity: string }[];
  entrySha256: string;
  profileSha256: string;
  schemaSha256: string;
  manifestSha256: string;
  indexSha256: string;
  declaredLockSha256: string;
  actualLockSha256: string;
  installedExternalClosureSha256: string;
  l5ContractSha256: string;
  l5ExportsSha256: string;
  referenceImplementationRevision: string;
}
export const MEMORY_CANDIDATE_TUPLE_V1_SCHEMA = closed({
  schema_version: { const: 1 }, status: { enum: ['candidate', 'published'] },
  source: closed({ head: ref, base: ref, merge: ref, checkout: ref }),
  ci: closed({ run_id: ref, attempt: { type: 'integer', minimum: 1 } }),
  artifacts: { type: 'array', minItems: 1, items: closed({ ...packageBinding.properties, tarballSha256: sha256, integrity: ref }) },
  entrySha256: sha256, profileSha256: sha256, schemaSha256: sha256, manifestSha256: sha256, indexSha256: sha256,
  declaredLockSha256: sha256, actualLockSha256: sha256, installedExternalClosureSha256: sha256,
  l5ContractSha256: sha256, l5ExportsSha256: sha256, referenceImplementationRevision: ref,
});
export function validateMemoryCandidateTupleV1(value: unknown): Check {
  return validatePublishedJsonSchemaDraft202012(MEMORY_CANDIDATE_TUPLE_V1_SCHEMA, value).ok ? { ok: true } : invalid('Invalid qualification tuple');
}

export interface MemoryQualificationReceiptV1 {
  checkpoint: 'L5-MEMORY-V1';
  qualified: MemoryCandidateTupleV1;
  published?: MemoryCandidateTupleV1;
}

// JSON member order is not identity; array order and every value still are.
function sortedTupleJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}

/** No accepted checkpoint can be reused for changed bytes or dependency closure. */
export function validateMemoryQualifiedTupleV1(qualified: unknown, consumed: unknown): Check {
  if (!validateMemoryCandidateTupleV1(qualified).ok || !validateMemoryCandidateTupleV1(consumed).ok) return invalid('Missing qualified or consumed tuple');
  const a = qualified as MemoryCandidateTupleV1, b = consumed as MemoryCandidateTupleV1;
  // CI and source receipts are retained separately; qualification identity is the artifact closure.
  for (const key of ['source', 'artifacts', 'entrySha256', 'profileSha256', 'schemaSha256', 'manifestSha256', 'indexSha256', 'declaredLockSha256', 'actualLockSha256', 'installedExternalClosureSha256', 'l5ContractSha256', 'l5ExportsSha256', 'referenceImplementationRevision'] as const) {
    if (sortedTupleJson(a[key]) !== sortedTupleJson(b[key])) return invalid('Changed tuple requires requalification: ' + key);
  }
  return { ok: true };
}
