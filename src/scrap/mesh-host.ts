import type {
  AnthropicAdapterClient, ClaudeCodeCliCapabilities, ClaudeCodeCliRunner,
  DefaultProviderAdapterClients, GenerateRequest, ProviderAdapter, ProviderId, ReasoningEffort,
} from "@sentropic/llm-mesh";
import type { KeyringAdapter, LlmMeshFacade } from "@sentropic/llm-mesh/facade";
import {
  createGraphifyMeshCore,
  type GraphifyMesh,
  type GraphifyMeshCore,
  type GraphifyMeshRuntimePrimitives,
} from "../llm-mesh-core.js";
import type { ExtractClient } from "./extract.js";

export interface ScrapMeshRuntimeModules {
  mesh: typeof import("@sentropic/llm-mesh");
  facade: typeof import("@sentropic/llm-mesh/facade");
  node: typeof import("@sentropic/llm-mesh/node");
}
export interface ScrapMeshDeps {
  facade?: Pick<LlmMeshFacade, "createRoutePlanner">;
  adapterClients?: DefaultProviderAdapterClients;
  ownerScopes?: string[];
  keyring?: KeyringAdapter;
  principalRef?: string;
  probeClaudeCli?: () => Promise<ClaudeCodeCliCapabilities>;
  createClaudeRunner?: (opts: { effort?: ReasoningEffort }) => ClaudeCodeCliRunner;
  normalizeModelId?: (alias: string) => string;
  loadMeshRuntime?: () => Promise<ScrapMeshRuntimeModules>;
  createMeshCore?: (
    primitives: GraphifyMeshRuntimePrimitives,
  ) => Pick<GraphifyMeshCore, "createGraphifyMesh" | "meshTextJsonClient">;
}
export interface ScrapMeshClient {
  client: ExtractClient;
  provider: ProviderId;
  model: string;
  ownerScope: string;
  effort?: ReasoningEffort;
}
const MISSING_MESH_PACKAGE = "@sentropic/llm-mesh";
const MISSING_MESH_TARGET_RE = /(?:Cannot find (?:package|module)|Failed to (?:resolve import|load url))\s+(['"]?)@sentropic\/llm-mesh(?:\/[^\s'"(),;]+)?\1(?=$|[\s.,;:)])/i;
const NOT_FOUND_CLAUSE_RE = /Cannot find (?:package|module)|Failed to (?:resolve import|load url)/i;
const QUOTED_MESH_SPECIFIER_RE = /(['"])@sentropic\/llm-mesh(?:\/[^'"]*)?\1/;

export function missingMeshPeerError(alias?: string, cause?: unknown): Error {
  const subject = alias?.trim() ? `"mesh:${alias.trim()}"` : '"mesh:..."';
  const msg = `scrap extract: ${subject} requires the optional peer package "${MISSING_MESH_PACKAGE}" (not installed; install ${MISSING_MESH_PACKAGE} to use mesh seats)`;
  return cause !== undefined ? new Error(msg, { cause }) : new Error(msg);
}
function isMissingMeshPackageError(err: unknown): boolean {
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  if (MISSING_MESH_TARGET_RE.test(msg)) return true;
  const isNotFoundCode = code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
  return isNotFoundCode && !NOT_FOUND_CLAUSE_RE.test(msg) && QUOTED_MESH_SPECIFIER_RE.test(msg);
}
let cachedRuntime: ScrapMeshRuntimeModules | null = null;
let preloadError: unknown = null;
async function defaultLoadMeshRuntime(): Promise<ScrapMeshRuntimeModules> {
  if (cachedRuntime) return cachedRuntime;
  const [mesh, facade, node] = await Promise.all([
    import("@sentropic/llm-mesh"),
    import("@sentropic/llm-mesh/facade"),
    import("@sentropic/llm-mesh/node"),
  ]);
  cachedRuntime = { mesh, facade, node };
  preloadError = null;
  return cachedRuntime;
}
// Preload once when this lazily-imported module is evaluated: keeps sync resolveMeshAlias
// working when @sentropic/llm-mesh is installed, while deferring cleanly when absent.
try {
  await defaultLoadMeshRuntime();
} catch (err) {
  preloadError = err;
}
async function resolveRuntime(
  alias: string | undefined,
  loader?: () => Promise<ScrapMeshRuntimeModules>,
): Promise<ScrapMeshRuntimeModules> {
  try {
    return loader ? await loader() : await defaultLoadMeshRuntime();
  } catch (err) {
    if (isMissingMeshPackageError(err)) throw missingMeshPeerError(alias, err);
    throw err;
  }
}
function requireMeshSync(alias: string): ScrapMeshRuntimeModules["mesh"] {
  if (cachedRuntime) return cachedRuntime.mesh;
  if (preloadError !== null) {
    if (isMissingMeshPackageError(preloadError)) throw missingMeshPeerError(alias, preloadError);
    throw preloadError;
  }
  throw missingMeshPeerError(alias);
}

// Runner-less seats are always wired; anthropic joins SEAT_WIRED only after the local claude CLI probe passes.
export const SEAT_WIRED = new Set<ProviderId>(["gemini", "openai", "muse", "mistral"]);
const ALIAS_FAMILY: Record<string, ProviderId> = {
  claude: "anthropic", gpt: "openai", o1: "openai", o3: "openai", o4: "openai",
  gemini: "gemini", muse: "muse", mistral: "mistral", magistral: "mistral",
  ministral: "mistral", codestral: "mistral", command: "cohere", cohere: "cohere",
};
const CLAUDE_PROBE_OPTIONS = { source: "engram-scrap-mesh-host", qualificationRef: "engram-scrap-extract-v1" } as const;
let probeCache = new WeakMap<object, Promise<ClaudeCodeCliCapabilities>>();
const defaultClaudeProbe = (node: ScrapMeshRuntimeModules["node"]): Promise<ClaudeCodeCliCapabilities> =>
  node.probeClaudeCodeCliCapabilities(CLAUDE_PROBE_OPTIONS);
export function resetClaudeCliProbe(): void { probeCache = new WeakMap(); SEAT_WIRED.delete("anthropic"); }
function crossFamilyError(alias: string, requested: ProviderId, resolved: string): Error {
  return new Error(`scrap extract: mesh alias "mesh:${alias}" (provider "${requested}") resolves to another provider family (${resolved}); refusing cross-family alias routing`);
}
function noSeatError(provider: ProviderId, alias: string, extra?: string): Error {
  return new Error(`scrap extract: no seat executor for mesh provider "${provider}" (alias "mesh:${alias}"); ${extra ?? `wired seats: ${[...SEAT_WIRED].join(", ")}`}`);
}
function parseMeshAlias(
  alias: string,
  mesh: ScrapMeshRuntimeModules["mesh"],
  normalize = mesh.normalizeExactModelId,
): { provider: ProviderId; model: string; effort?: ReasoningEffort } {
  const trimmed = alias.trim();
  const suffix = /-(low|medium|high|xhigh|max)$/.exec(trimmed)?.[1] as ReasoningEffort | undefined;
  const requestedFamily = ALIAS_FAMILY[trimmed.toLowerCase().split(/[-/:]/, 1)[0] ?? ""];
  const normalized = normalize(trimmed);
  const profile = mesh.modelProfiles.find((p) => p.modelId === normalized);
  if (normalized && profile && !mesh.isRetiredRoutingModelId(normalized)) {
    if (requestedFamily && profile.providerId !== requestedFamily) throw crossFamilyError(trimmed, requestedFamily, `${profile.providerId}/${profile.modelId}`);
    return { provider: profile.providerId, model: normalized, ...(suffix && normalized !== trimmed ? { effort: suffix } : {}) };
  }
  // Non-catalog gateway aliases (dist/routing-targets.js:368-424): refuse if any route target leaves requestedFamily.
  const mapped = mesh.CANONICAL_TARGET_ROUTE_MAPPINGS[trimmed] ?? mesh.CANONICAL_TARGET_ROUTE_MAPPINGS[normalized];
  const cross = requestedFamily ? mapped?.filter((t) => t.providerId !== requestedFamily) : undefined;
  if (requestedFamily && cross?.length) {
    throw crossFamilyError(trimmed, requestedFamily, [...new Set(cross.map((t) => `${t.providerId}/${t.model}`))].join(", "));
  }
  throw new Error(`scrap extract: unknown mesh alias "mesh:${alias}" (no mesh catalog profile; use mesh:<catalog-model-id> such as mesh:gemini-4-hydrogen-high)`);
}
// In-process seats via @sentropic/llm-mesh 0.38.6: dist/service/facade.d.ts:98,129,133, dist/service/local-account-transport-service.js:84,89,
// dist/node/claude-code-cli-runner.d.ts:16,48,54 & .js:194,532,576 (NodeClaudeCodeCliRunner, probe, seat client); no gateway, no port.
export function resolveMeshAlias(alias: string, opts?: { normalize?: (id: string) => string }): { provider: ProviderId; model: string; effort?: ReasoningEffort } {
  const resolved = parseMeshAlias(alias, requireMeshSync(alias), opts?.normalize);
  if (!SEAT_WIRED.has(resolved.provider)) throw noSeatError(resolved.provider, alias);
  return resolved;
}
async function probeClaudeOnce(
  alias: string,
  cacheKey: object,
  probeFn: () => Promise<ClaudeCodeCliCapabilities>,
  isDefaultProbe: boolean,
): Promise<ClaudeCodeCliCapabilities> {
  let pending = probeCache.get(cacheKey);
  if (!pending) { pending = probeFn(); pending.catch(() => {}); probeCache.set(cacheKey, pending); }
  try {
    const caps = await pending;
    if (isDefaultProbe) SEAT_WIRED.add("anthropic");
    return caps;
  } catch (err) {
    if (isDefaultProbe) SEAT_WIRED.delete("anthropic");
    throw noSeatError("anthropic", alias.trim(), `claude CLI probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function preflightWithRuntime(
  alias: string,
  runtimeMods: ScrapMeshRuntimeModules,
  deps: Pick<ScrapMeshDeps, "probeClaudeCli" | "normalizeModelId" | "loadMeshRuntime">,
): Promise<{ provider: ProviderId; model: string; effort?: ReasoningEffort; claudeCaps?: ClaudeCodeCliCapabilities }> {
  const resolved = parseMeshAlias(alias, runtimeMods.mesh, deps.normalizeModelId);
  if (resolved.provider === "anthropic") {
    const customProbe = deps.probeClaudeCli;
    const isDefaultProbe = !customProbe && !deps.loadMeshRuntime;
    const cacheKey: object = customProbe ?? deps.loadMeshRuntime ?? defaultClaudeProbe;
    const probeFn = customProbe ?? (() => defaultClaudeProbe(runtimeMods.node));
    return { ...resolved, claudeCaps: await probeClaudeOnce(alias, cacheKey, probeFn, isDefaultProbe) };
  }
  if (!SEAT_WIRED.has(resolved.provider)) throw noSeatError(resolved.provider, alias);
  return resolved;
}
export async function preflightMeshAlias(
  alias: string, deps: Pick<ScrapMeshDeps, "probeClaudeCli" | "normalizeModelId" | "loadMeshRuntime"> = {},
): Promise<{ provider: ProviderId; model: string; effort?: ReasoningEffort; claudeCaps?: ClaudeCodeCliCapabilities }> {
  const runtimeMods = await resolveRuntime(alias, deps.loadMeshRuntime);
  return preflightWithRuntime(alias, runtimeMods, deps);
}
// ClaudeCodeRuntimeClient (dist/transport/claude-code-runtime-client.js:118-140,196) rejects
// system messages, responseFormat!=text, maxOutputTokens and reasoning (effort is set on the runner).
function wrapClaudeSeatClient(inner: AnthropicAdapterClient): AnthropicAdapterClient {
  const project = (req: GenerateRequest): GenerateRequest => {
    const text = req.messages.map((m) => (typeof m.content === "string"
      ? m.content : m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n")).trim()).filter(Boolean).join("\n\n");
    return {
      providerId: req.providerId ?? "anthropic", modelId: req.modelId!, messages: [{ role: "user", content: text }],
      ...(req.signal ? { signal: req.signal } : {}), ...(req.auth !== undefined ? { auth: req.auth } : {}), ...(req.tools ? { tools: req.tools } : {}),
    };
  };
  return { generate: (req, ctx) => inner.generate(project(req), ctx), stream: (req, ctx) => inner.stream(project(req), ctx) };
}
// Owner scopes (non-secret routing identities) from keyring INDEX plus PUBLIC records
// only — never :envelope keys (seat credentials, read by the mesh transport at acquire).
async function discoverOwnerScopes(keyring: KeyringAdapter): Promise<string[]> {
  let ids: string[] = [];
  const index = await keyring.getSecret("sentropic-llm-mesh:accounts:index");
  if (index) {
    try {
      const parsed: unknown = JSON.parse(index);
      if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
    } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
  }
  const scopes = new Set<string>();
  for (const id of ids) {
    const pub = await keyring.getSecret(`sentropic-llm-mesh:${id}:public`);
    if (!pub) continue;
    try {
      const scope = (JSON.parse(pub) as { account?: { ownerScopeRef?: unknown } })?.account?.ownerScopeRef;
      if (typeof scope === "string" && scope.trim()) scopes.add(scope);
    } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
  }
  return [...scopes].sort();
}

export async function createScrapMeshClient(rawAlias: string, deps: ScrapMeshDeps = {}): Promise<ScrapMeshClient> {
  const runtimeMods = await resolveRuntime(rawAlias, deps.loadMeshRuntime);
  const { mesh, facade: facadeMod, node: nodeMod } = runtimeMods;
  const { provider, model, effort, claudeCaps } = await preflightWithRuntime(rawAlias, runtimeMods, deps);
  const principalRef = deps.principalRef ?? "engram-scrap-cli";
  const envScope = process.env.ENGRAM_MESH_OWNER_SCOPE?.trim();
  const keyring = deps.keyring ?? ((!deps.facade || (!deps.ownerScopes && !envScope)) ? new nodeMod.EncryptedFileKeyring() : undefined);
  const facade = deps.facade ?? facadeMod.createLlmMeshFacade({ mode: "cli", ...(keyring ? { keyring } : {}), configResolver: { resolveConfig: async () => ({}) } });
  const scopes = deps.ownerScopes ?? (envScope ? [envScope] : await discoverOwnerScopes(keyring!));
  if (scopes.length === 0) {
    throw new Error(`scrap extract: no usable mesh seat for "mesh:${model}" (no owner scopes found; enroll a seat or set ENGRAM_MESH_OWNER_SCOPE)`);
  }
  const probe = facade.createRoutePlanner({
    generate: async () => { throw new Error("scrap mesh: probe runtime cannot generate"); },
    stream: () => { throw new Error("scrap mesh: probe runtime cannot stream"); },
  });
  let ownerScope: string | undefined, crossFamily: string | undefined;
  const reasons = new Set<string>();
  for (const scope of scopes) {
    try {
      const plan = await probe.plan({ principalRef, ownerScopeRef: scope }, { requestedModel: model });
      if (plan.candidateRefs.length > 0) {
        const first = plan.diagnostics.find((d) => d.candidateRef === plan.candidateRefs[0]);
        if (first?.actualProviderId && first.actualProviderId !== provider) {
          crossFamily = `${first.actualProviderId}/${first.actualModelId}`;
          continue;
        }
        ownerScope = scope; break;
      }
    } catch (error) {
      if (!(error instanceof mesh.RoutePlanError || (error as { name?: unknown } | null)?.name === "RoutePlanError")) throw error;
      // Surface why the seat is unusable (e.g. reauth-required), never a credential.
      const e = error as { code?: unknown; diagnostics?: readonly { code?: unknown; transportProviderId?: unknown }[] };
      for (const d of e.diagnostics ?? []) reasons.add(`${String(d.transportProviderId)}: ${String(d.code)}`);
      if (!e.diagnostics?.length && e.code) reasons.add(String(e.code));
    }
  }
  if (!ownerScope && crossFamily) throw crossFamilyError(rawAlias.trim(), provider, crossFamily);
  if (!ownerScope) {
    throw new Error(`scrap extract: no usable mesh seat for "mesh:${model}" (tried owner scopes: ${scopes.join(", ")}${reasons.size ? `; reasons: ${[...reasons].join(", ")}` : ""})`);
  }
  const anthropicClient = claudeCaps && !deps.adapterClients?.anthropic
    ? wrapClaudeSeatClient(deps.createClaudeRunner
      ? new mesh.ClaudeCodeRuntimeClient({ runner: deps.createClaudeRunner({ ...(effort ? { effort } : {}) }), capabilities: claudeCaps })
      : nodeMod.createClaudeSeatAnthropicClient({ capabilities: claudeCaps, ...(effort ? { effort } : {}) }))
    : undefined;
  const clients: DefaultProviderAdapterClients = {
    ...(deps.adapterClients ?? {
      gemini: new mesh.CloudCodeRuntimeClient(),
      openai: new mesh.CodexRuntimeClient(),
      muse: new mesh.MuseRuntimeClient(),
      mistral: new mesh.MistralRuntimeClient(),
    }),
    ...(anthropicClient ? { anthropic: anthropicClient } : {}),
  };
  const adapters: Partial<Record<ProviderId, ProviderAdapter>> = {};
  for (const adapter of mesh.createDefaultProviderAdapters(clients)) adapters[adapter.provider.providerId] = adapter;
  const core = (deps.createMeshCore ?? createGraphifyMeshCore)({
    createDefaultProviderAdapters: mesh.createDefaultProviderAdapters,
    createLlmMesh: mesh.createLlmMesh,
    normalizeProviderError: mesh.normalizeProviderError,
    StaticProviderRegistry: mesh.StaticProviderRegistry,
  });
  const routedMesh: GraphifyMesh = core.createGraphifyMesh({
    routingSubject: { principalRef, ownerScopeRef: ownerScope },
    createRoutePlanner: (runtime) => facade.createRoutePlanner(runtime),
    adapters,
  });
  return {
    client: core.meshTextJsonClient(routedMesh, { provider, model, ...(effort ? { effort } : {}) }),
    provider,
    model,
    ownerScope,
    ...(effort ? { effort } : {}),
  };
}
