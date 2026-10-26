/**
 * MCP-L4 registry closure generator + verifier (Node only).
 *
 * Wired into `npm run build` after bundling and before packing. Emits from
 * the spec's frozen types:
 * - `registry/entries.v1.json` (the registry-package envelope);
 * - the full per-tool schema assets, frozen wire/tool-schema profile assets,
 *   the parameter schema, elicitation schemas and base-manifest assets under
 *   `dist/registry/`;
 * - the complete `MemoryPublisherAssetsV1` receipt at
 *   `registry/publisher-assets.v1.json` (kept OUT of the packed files: it
 *   binds the packed closure to its tarball, so the tarball hash it carries
 *   is backfilled post-pack by `scripts/refresh-candidate-manifest.mjs`;
 *   every other field is final at build time).
 *
 * Verification (fails the build on drift):
 * - manifest tools deep-equal the frozen platform tools, field by field;
 * - every asset digest matches its exact packed bytes; no path is duplicated
 *   or escapes the package closure (receipt validator);
 * - the receipt validates end to end, including base/effective manifest
 *   receipts, the six schema pairs and executable/dependency provenance;
 * - protocol revisions equal the installed SDK-advertised list.
 *
 * No compatibility is advertised beyond what is pinned and evidenced:
 * package ranges stay at the declared peers/floor, schema profiles at the
 * frozen ids and protocol versions at the SDK-advertised list. Anything
 * else belongs in the candidate manifest `unverified` list, not here.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DIST_REGISTRY = join(ROOT, 'dist', 'registry');
const ENTRIES_PATH = join(ROOT, 'registry', 'entries.v1.json');
const RECEIPT_PATH = join(ROOT, 'registry', 'publisher-assets.v1.json');
const CANDIDATE_MANIFEST_PATH = join(ROOT, 'candidate-manifest.json');
const ZERO_SHA = '0'.repeat(64);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** RFC 8785 JSON canonicalization over strings/numbers/booleans/null/arrays/objects. */
function canonicalize(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number is not canonical JSON');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error(`unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalEntryDigest(entry) {
  return sha256(Buffer.from(canonicalize(entry), 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function previousTarballBinding() {
  try {
    if (!existsSync(CANDIDATE_MANIFEST_PATH)) return null;
    const manifest = JSON.parse(readFileSync(CANDIDATE_MANIFEST_PATH, 'utf8'));
    const sha = manifest?.tarball?.sha256;
    const integrity = manifest?.tarball?.integrity;
    if (typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha) && typeof integrity === 'string' && integrity.length > 0) {
      return { sha256: sha, integrity };
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateAssets() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const [{ MEMORY_PROVIDER_MANIFEST, ENGRAM_MEMORY_WIRE_PROFILE_V1, MEMORY_FROZEN_PROFILE_BINDINGS_V1, validateMemoryPublisherAssetsV1 }, platform] = await Promise.all([
    import('../dist/mcp-memory.js'),
    import('@sentropic/mcp-platform/memory'),
  ]);
  const tools = MEMORY_PROVIDER_MANIFEST.tools;
  if (!Array.isArray(tools) || tools.length !== 6) {
    throw new Error(`expected six manifest tools, saw ${tools?.length}`);
  }
  // Frozen drift gate: the manifest tools must equal the frozen platform
  // tools field by field. Any platform/profile drift fails the build here.
  for (const tool of tools) {
    const frozen = platform.findMemoryTool(tool.name);
    if (!frozen) throw new Error(`manifest tool ${tool.name} has no frozen platform tool`);
    for (const field of ['requiredScopes', 'requiredClaims', 'redactionClass', 'mutability', 'mutatesExternalSystem', 'idempotency', 'gates', 'description', 'inputSchema', 'outputSchema']) {
      if (JSON.stringify(tool[field]) !== JSON.stringify(frozen[field])) {
        throw new Error(`manifest tool ${tool.name} drifted from the frozen platform tool (field ${field})`);
      }
    }
  }
  if (MEMORY_PROVIDER_MANIFEST.providerId !== platform.MEMORY_PROVIDER_ID) {
    throw new Error('provider manifest identity drifted from the frozen platform contract');
  }
  if (ENGRAM_MEMORY_WIRE_PROFILE_V1.wireProfileId !== platform.MEMORY_WIRE_PROFILE_ID) {
    throw new Error('wire profile drifted from the frozen platform contract');
  }

  // Per-tool closed schema assets, emitted from the frozen platform tools.
  for (const tool of tools) {
    const frozen = platform.findMemoryTool(tool.name);
    writeJson(join(DIST_REGISTRY, 'schemas', `${tool.name}.input.json`), frozen.inputSchema);
    writeJson(join(DIST_REGISTRY, 'schemas', `${tool.name}.output.json`), frozen.outputSchema);
  }
  // Real frozen profile assets (full objects, never id-only stubs).
  writeJson(join(DIST_REGISTRY, 'wire-profile.json'), ENGRAM_MEMORY_WIRE_PROFILE_V1);
  const toolSchemaProfile = {
    id: platform.MEMORY_TOOLS_PROFILE_ID,
    dialect: ENGRAM_MEMORY_WIRE_PROFILE_V1.jsonSchemaDialect,
    assertionKeywords: [...ENGRAM_MEMORY_WIRE_PROFILE_V1.allowedAssertionKeywords],
    annotationKeywords: [...ENGRAM_MEMORY_WIRE_PROFILE_V1.allowedAnnotationKeywords],
    forbidRefAndRemoteResolution: ENGRAM_MEMORY_WIRE_PROFILE_V1.forbidRefAndRemoteResolution,
  };
  writeJson(join(DIST_REGISTRY, 'tool-schema-profile.json'), toolSchemaProfile);
  const elicitation = MEMORY_PROVIDER_MANIFEST.elicitation ?? [];
  const withdraw = elicitation.find((policy) => policy.capabilityRef === 'engram_memory_withdraw');
  const forget = elicitation.find((policy) => policy.capabilityRef === 'engram_memory_forget');
  if (!withdraw || !forget) throw new Error('elicitation policies for withdraw/forget are required');
  writeJson(join(DIST_REGISTRY, 'elicitation-request.json'), withdraw.requestSchema);
  writeJson(join(DIST_REGISTRY, 'elicitation-response.json'), withdraw.responseSchema);
  // Loadable provider manifest is distinct from the registry-package wrapper.
  writeFileSync(join(DIST_REGISTRY, 'provider-manifest.js'),
    'export const manifest = ' + JSON.stringify(MEMORY_PROVIDER_MANIFEST, null, 2) + ';\nexport default manifest;\n');
  // Base-manifest asset: the canonical provider manifest bytes.
  writeJson(join(DIST_REGISTRY, 'base-manifest.json'), MEMORY_PROVIDER_MANIFEST);

  const entries = JSON.parse(readFileSync(ENTRIES_PATH, 'utf8'));
  const entry = entries.entries[0];
  writeJson(join(DIST_REGISTRY, 'parameter-schema.json'), entry.parameters.schema);
  for (const [name, key] of [['wire-profile', 'wireProfileSha256'], ['tool-schema-profile', 'toolSchemaProfileSha256'], ['parameter-schema', 'parameterProfileSha256']]) {
    if (sha256(readFileSync(join(DIST_REGISTRY, name + '.json'))) !== MEMORY_FROZEN_PROFILE_BINDINGS_V1[key]) {
      throw new Error('frozen profile bytes drifted: ' + name);
    }
  }
  entry.mcp.manifestAsset = 'dist/registry/provider-manifest.js';

  if (entry.publisher.packageName !== '@sentropic/engram') {
    throw new Error('registry entry publisher drifted from @sentropic/engram');
  }
  entry.publisher.packageVersion = pkg.version;
  for (const required of ['sentropic.engram.memory-wire/v1', 'sentropic.engram.memory-tools/2020-12-v1']) {
    if (!entry.compatibility.schemaProfiles.includes(required)) {
      throw new Error(`registry entry compatibility drifted (missing ${required})`);
    }
  }

  const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');
  const protocolVersions = [...sdkTypes.SUPPORTED_PROTOCOL_VERSIONS];
  entry.mcp.protocolVersions = protocolVersions;
  entry.mcp.transportProfiles[0].protocolVersions = protocolVersions;

  // Each role has distinct executable bytes; the validator is an ESM asset.
  const assetPaths = [
    ['registry-package', 'dist/registry/manifest.js'],
    ['manifest', 'dist/registry/provider-manifest.js'],
    ['manifest', 'dist/registry/base-manifest.json'],
    ['definitions', 'dist/registry/definitions.js'],
    ['provider', 'dist/mcp-memory.js'],
    ['validator', 'dist/registry/validator.js'],
    ['wire-profile', 'dist/registry/wire-profile.json'],
    ['tool-schema-profile', 'dist/registry/tool-schema-profile.json'],
    ['parameter-schema', 'dist/registry/parameter-schema.json'],
    ...tools.flatMap((tool) => [
      [`schema-input-${tool.name}`, `dist/registry/schemas/${tool.name}.input.json`],
      [`schema-output-${tool.name}`, `dist/registry/schemas/${tool.name}.output.json`],
    ]),
    ['elicitation-request', 'dist/registry/elicitation-request.json'],
    ['elicitation-response', 'dist/registry/elicitation-response.json'],
  ];
  entry.assets = assetPaths.map(([role, path]) => ({
    role,
    path,
    mediaType: path.endsWith('.json') ? 'application/schema+json' : 'application/javascript',
    sha256: sha256(readFileSync(join(ROOT, path))),
  }));
  writeFileSync(ENTRIES_PATH, `${JSON.stringify(entries, null, 2)}\n`);
  const entryDigest = canonicalEntryDigest(entry);

  // Complete publisher receipt. The tarball/code-archive binding is a
  // placeholder until the post-pack refresh (a packed file cannot contain its
  // own pack's hash); every other field is final at build time.
  const previous = previousTarballBinding();
  const tarballSha256 = previous?.sha256 ?? ZERO_SHA;
  const tarballIntegrity = previous?.integrity ?? 'pending-pack-refresh';
  const assetByRole = (role) => entry.assets.find((a) => a.role === role);
  const assetByPath = (path) => entry.assets.find((a) => a.path === path);
  const receipt = {
    schema_version: 1,
    publisher: { packageName: '@sentropic/engram', packageVersion: pkg.version },
    entryVersion: entry.entryVersion,
    manifestVersion: entry.entryVersion,
    providerContractVersion: '1.0.0',
    assets: entry.assets.map((a) => ({ ...a })),
    entryJcsSha256: entryDigest,
    tarballSha256,
    tarballIntegrity,
    baseManifestSha256: assetByPath('dist/registry/base-manifest.json').sha256,
    effectiveManifestSha256: assetByPath('dist/registry/provider-manifest.js').sha256,
    schemas: tools.map((tool) => ({
      tool: tool.name,
      inputAsset: `dist/registry/schemas/${tool.name}.input.json`,
      outputAsset: `dist/registry/schemas/${tool.name}.output.json`,
    })),
    wireProfile: { id: 'sentropic.engram.memory-wire/v1', version: entry.entryVersion, sha256: assetByRole('wire-profile').sha256 },
    toolSchemaProfile: { id: 'sentropic.engram.memory-tools/2020-12-v1', version: entry.entryVersion, sha256: assetByRole('tool-schema-profile').sha256 },
    parameterProfile: { id: 'sentropic.parameters/2020-12-bounded-v1', version: '1.0.0', sha256: assetByRole('parameter-schema').sha256 },
    validator: { id: 'sentropic.engram.memory-publisher-validator/v1', version: entry.entryVersion, sha256: assetByRole('validator').sha256 },
    executableProvenance: {
      sourceHead: gitHead(),
      codeArchiveSha256: tarballSha256,
      dependencyClosureSha256: sha256(readFileSync(join(ROOT, 'package-lock.json'))),
    },
  };
  writeJson(RECEIPT_PATH, receipt);

  // End-to-end digest verification over the exact packed bytes. Any drift
  // fails the build.
  const packedAssets = new Map();
  for (const asset of receipt.assets) {
    packedAssets.set(asset.path, new Uint8Array(readFileSync(join(ROOT, asset.path))));
  }
  const receiptCheck = validateMemoryPublisherAssetsV1(receipt, packedAssets);
  if (!receiptCheck.ok) {
    throw new Error(`publisher receipt verification failed: ${receiptCheck.reason}`);
  }
  // The registry-package envelope module must serve exactly these entries.
  const { manifest } = await import('../dist/registry/manifest.js');
  if (JSON.stringify(manifest) !== JSON.stringify(entries)) {
    throw new Error('./registry/manifest envelope differs from registry/entries.v1.json');
  }
  return { entry, digest: entryDigest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAssets().then(
    ({ digest }) => console.log(`MCP-L4-ASSETS-OK entryDigest=${digest}`),
    (error) => { console.error(error); process.exit(1); },
  );
}
