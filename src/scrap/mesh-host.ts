import {
  CANONICAL_TARGET_ROUTE_MAPPINGS,
  ClaudeCodeRuntimeClient, CloudCodeRuntimeClient, CodexRuntimeClient, MistralRuntimeClient, MuseRuntimeClient,
  RoutePlanError, createDefaultProviderAdapters, isRetiredRoutingModelId, modelProfiles, normalizeExactModelId,
  type AnthropicAdapterClient, type ClaudeCodeCliCapabilities, type ClaudeCodeCliRunner,
  type DefaultProviderAdapterClients, type GenerateRequest, type ProviderAdapter, type ProviderId, type ReasoningEffort,
} from "@sentropic/llm-mesh";
import { createLlmMeshFacade, type KeyringAdapter, type LlmMeshFacade } from "@sentropic/llm-mesh/facade";
import {
  EncryptedFileKeyring, createClaudeSeatAnthropicClient, probeClaudeCodeCliCapabilities,
} from "@sentropic/llm-mesh/node";
import { createGraphifyMesh, meshTextJsonClient, type GraphifyMesh } from "../llm-mesh-bridge.js";
import type { ExtractClient } from "./extract.js";

export interface ScrapMeshDeps {
  facade?: Pick<LlmMeshFacade, "createRoutePlanner">;
  adapterClients?: DefaultProviderAdapterClients;
  ownerScopes?: string[];
  keyring?: KeyringAdapter;
  principalRef?: string;
  probeClaudeCli?: () => Promise<ClaudeCodeCliCapabilities>;
  createClaudeRunner?: (opts: { effort?: ReasoningEffort }) => ClaudeCodeCliRunner;
  normalizeModelId?: (alias: string) => string;
}
export interface ScrapMeshClient {
  client: ExtractClient;
  provider: ProviderId;
  model: string;
  ownerScope: string;
  effort?: ReasoningEffort;
}
// Runner-less seats are always wired; anthropic joins SEAT_WIRED only after the local claude CLI probe passes.
export const SEAT_WIRED = new Set<ProviderId>(["gemini", "openai", "muse", "mistral"]);
const ALIAS_FAMILY: Record<string, ProviderId> = {
  claude: "anthropic", gpt: "openai", o1: "openai", o3: "openai", o4: "openai",
  gemini: "gemini", muse: "muse", mistral: "mistral", magistral: "mistral",
  ministral: "mistral", codestral: "mistral", command: "cohere", cohere: "cohere",
};
let probeCache = new WeakMap<() => Promise<ClaudeCodeCliCapabilities>, Promise<ClaudeCodeCliCapabilities>>();
const defaultClaudeProbe = (): Promise<ClaudeCodeCliCapabilities> =>
  probeClaudeCodeCliCapabilities({ source: "engram-scrap-mesh-host", qualificationRef: "engram-scrap-extract-v1" });
export function resetClaudeCliProbe(): void { probeCache = new WeakMap(); SEAT_WIRED.delete("anthropic"); }
function crossFamilyError(alias: string, requested: ProviderId, resolved: string): Error {
  return new Error(`scrap extract: mesh alias "mesh:${alias}" (provider "${requested}") resolves to another provider family (${resolved}); refusing cross-family alias routing`);
}
function noSeatError(provider: ProviderId, alias: string, extra?: string): Error {
  return new Error(`scrap extract: no seat executor for mesh provider "${provider}" (alias "mesh:${alias}"); ${extra ?? `wired seats: ${[...SEAT_WIRED].join(", ")}`}`);
}
function parseMeshAlias(alias: string, normalize = normalizeExactModelId): { provider: ProviderId; model: string; effort?: ReasoningEffort } {
  const trimmed = alias.trim();
  const suffix = /-(low|medium|high|xhigh|max)$/.exec(trimmed)?.[1] as ReasoningEffort | undefined;
  const requestedFamily = ALIAS_FAMILY[trimmed.toLowerCase().split(/[-/:]/, 1)[0] ?? ""];
  const normalized = normalize(trimmed);
  const profile = modelProfiles.find((p) => p.modelId === normalized);
  if (normalized && profile && !isRetiredRoutingModelId(normalized)) {
    if (requestedFamily && profile.providerId !== requestedFamily) throw crossFamilyError(trimmed, requestedFamily, `${profile.providerId}/${profile.modelId}`);
    return { provider: profile.providerId, model: normalized, ...(suffix && normalized !== trimmed ? { effort: suffix } : {}) };
  }
  // Non-catalog gateway aliases (dist/routing-targets.js:368-424): refuse if any route target leaves requestedFamily.
  const mapped = CANONICAL_TARGET_ROUTE_MAPPINGS[trimmed] ?? CANONICAL_TARGET_ROUTE_MAPPINGS[normalized];
  const cross = requestedFamily ? mapped?.filter((t) => t.providerId !== requestedFamily) : undefined;
  if (requestedFamily && cross?.length) {
    throw crossFamilyError(trimmed, requestedFamily, [...new Set(cross.map((t) => `${t.providerId}/${t.model}`))].join(", "));
  }
  throw new Error(`scrap extract: unknown mesh alias "mesh:${alias}" (no mesh catalog profile; use mesh:<catalog-model-id> such as mesh:gemini-4-hydrogen-high)`);
}
// In-process seats via @sentropic/llm-mesh 0.38.6: dist/service/facade.d.ts:98,129,133, dist/service/local-account-transport-service.js:84,89,
// dist/node/claude-code-cli-runner.d.ts:16,48,54 & .js:194,532,576 (NodeClaudeCodeCliRunner, probe, seat client); no gateway, no port.
export function resolveMeshAlias(alias: string, opts?: { normalize?: (id: string) => string }): { provider: ProviderId; model: string; effort?: ReasoningEffort } {
  const resolved = parseMeshAlias(alias, opts?.normalize);
  if (!SEAT_WIRED.has(resolved.provider)) throw noSeatError(resolved.provider, alias);
  return resolved;
}
async function probeClaudeOnce(alias: string, probeFn: () => Promise<ClaudeCodeCliCapabilities>): Promise<ClaudeCodeCliCapabilities> {
  let pending = probeCache.get(probeFn);
  if (!pending) { pending = probeFn(); pending.catch(() => {}); probeCache.set(probeFn, pending); }
  try {
    const caps = await pending;
    if (probeFn === defaultClaudeProbe) SEAT_WIRED.add("anthropic");
    return caps;
  } catch (err) {
    if (probeFn === defaultClaudeProbe) SEAT_WIRED.delete("anthropic");
    throw noSeatError("anthropic", alias.trim(), `claude CLI probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
export async function preflightMeshAlias(
  alias: string, deps: Pick<ScrapMeshDeps, "probeClaudeCli" | "normalizeModelId"> = {},
): Promise<{ provider: ProviderId; model: string; effort?: ReasoningEffort; claudeCaps?: ClaudeCodeCliCapabilities }> {
  const resolved = parseMeshAlias(alias, deps.normalizeModelId);
  if (resolved.provider === "anthropic") return { ...resolved, claudeCaps: await probeClaudeOnce(alias, deps.probeClaudeCli ?? defaultClaudeProbe) };
  if (!SEAT_WIRED.has(resolved.provider)) throw noSeatError(resolved.provider, alias);
  return resolved;
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
  const { provider, model, effort, claudeCaps } = await preflightMeshAlias(rawAlias, deps);
  const principalRef = deps.principalRef ?? "engram-scrap-cli";
  const envScope = process.env.ENGRAM_MESH_OWNER_SCOPE?.trim();
  const keyring = deps.keyring ?? ((!deps.facade || (!deps.ownerScopes && !envScope)) ? new EncryptedFileKeyring() : undefined);
  const facade = deps.facade ?? createLlmMeshFacade({ mode: "cli", ...(keyring ? { keyring } : {}), configResolver: { resolveConfig: async () => ({}) } });
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
      if (!(error instanceof RoutePlanError || (error as { name?: unknown } | null)?.name === "RoutePlanError")) throw error;
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
      ? new ClaudeCodeRuntimeClient({ runner: deps.createClaudeRunner({ ...(effort ? { effort } : {}) }), capabilities: claudeCaps })
      : createClaudeSeatAnthropicClient({ capabilities: claudeCaps, ...(effort ? { effort } : {}) }))
    : undefined;
  const clients: DefaultProviderAdapterClients = {
    ...(deps.adapterClients ?? {
      gemini: new CloudCodeRuntimeClient(),
      openai: new CodexRuntimeClient(),
      muse: new MuseRuntimeClient(),
      mistral: new MistralRuntimeClient(),
    }),
    ...(anthropicClient ? { anthropic: anthropicClient } : {}),
  };
  const adapters: Partial<Record<ProviderId, ProviderAdapter>> = {};
  for (const adapter of createDefaultProviderAdapters(clients)) adapters[adapter.provider.providerId] = adapter;
  const mesh: GraphifyMesh = createGraphifyMesh({
    routingSubject: { principalRef, ownerScopeRef: ownerScope },
    createRoutePlanner: (runtime) => facade.createRoutePlanner(runtime),
    adapters,
  });
  return { client: meshTextJsonClient(mesh, { provider, model, ...(effort ? { effort } : {}) }), provider, model, ownerScope, ...(effort ? { effort } : {}) };
}
