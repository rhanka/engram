/**
 * MCP-L4 registry asset generator + digest refresh (Node only).
 *
 * Reads the built `dist/registry/manifest.js` (the exact bytes packed in the
 * candidate tarball) and the P2 platform entry, emits one JSON asset per
 * published schema/profile surface under `dist/registry/`, then refreshes
 * `registry/entries.v1.json` so every asset is separately listed with its
 * exact-byte SHA-256 and the protocol revisions match the installed SDK.
 *
 * No compatibility is advertised beyond what is pinned and evidenced:
 * package ranges stay at the declared peers/floor, schema profiles at the
 * frozen ids and protocol versions at the SDK-advertised list. Anything
 * else belongs in the candidate manifest `unverified` list, not here.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DIST_REGISTRY = join(ROOT, 'dist', 'registry');
const ENTRIES_PATH = join(ROOT, 'registry', 'entries.v1.json');

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

export async function generateAssets() {
  const [{ manifest }, platform] = await Promise.all([
    import('../dist/registry/manifest.js'),
    import('@sentropic/mcp-platform/memory'),
  ]);
  const tools = manifest.tools;
  if (!Array.isArray(tools) || tools.length !== 6) {
    throw new Error(`expected six manifest tools, saw ${tools?.length}`);
  }
  for (const tool of tools) {
    writeJson(join(DIST_REGISTRY, 'schemas', `${tool.name}.input.json`), tool.inputSchema);
    writeJson(join(DIST_REGISTRY, 'schemas', `${tool.name}.output.json`), tool.outputSchema);
  }
  writeJson(join(DIST_REGISTRY, 'wire-profile.json'), { id: platform.MEMORY_WIRE_PROFILE_ID });
  writeJson(join(DIST_REGISTRY, 'tool-schema-profile.json'), { id: platform.MEMORY_TOOLS_PROFILE_ID });
  const elicitation = manifest.elicitation ?? [];
  const withdraw = elicitation.find((policy) => policy.capabilityRef === 'engram_memory_withdraw');
  const forget = elicitation.find((policy) => policy.capabilityRef === 'engram_memory_forget');
  if (!withdraw || !forget) throw new Error('elicitation policies for withdraw/forget are required');
  writeJson(join(DIST_REGISTRY, 'elicitation-request.json'), withdraw.requestSchema);
  writeJson(join(DIST_REGISTRY, 'elicitation-response.json'), withdraw.responseSchema);

  const entries = JSON.parse(readFileSync(ENTRIES_PATH, 'utf8'));
  const entry = entries.entries[0];
  writeJson(join(DIST_REGISTRY, 'parameter-schema.json'), entry.parameters.schema);

  const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');
  const protocolVersions = [...sdkTypes.SUPPORTED_PROTOCOL_VERSIONS];
  entry.mcp.protocolVersions = protocolVersions;
  entry.mcp.transportProfiles[0].protocolVersions = protocolVersions;

  const assetPaths = [
    ['manifest', 'dist/registry/manifest.js'],
    ['definitions', 'dist/registry/definitions.js'],
    ['provider', 'dist/mcp-memory.js'],
    ['validator', 'dist/mcp-memory.js'],
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
  return { entry, digest: canonicalEntryDigest(entry) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAssets().then(
    ({ digest }) => console.log(`MCP-L4-ASSETS-OK entryDigest=${digest}`),
    (error) => { console.error(error); process.exit(1); },
  );
}
