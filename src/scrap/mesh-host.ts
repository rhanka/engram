import {
  CloudCodeRuntimeClient, CodexRuntimeClient, MistralRuntimeClient, MuseRuntimeClient,
  RoutePlanError, createDefaultProviderAdapters, isRetiredRoutingModelId, modelProfiles, normalizeExactModelId,
  type DefaultProviderAdapterClients, type ReasoningEffort, type ProviderAdapter, type ProviderId,
} from "@sentropic/llm-mesh";
import { createLlmMeshFacade, type KeyringAdapter, type LlmMeshFacade } from "@sentropic/llm-mesh/facade";
import { EncryptedFileKeyring } from "@sentropic/llm-mesh/node";
import { createGraphifyMesh, meshTextJsonClient, type GraphifyMesh } from "../llm-mesh-bridge.js";
import type { ExtractClient } from "./extract.js";

export interface ScrapMeshDeps {
  facade?: Pick<LlmMeshFacade, "createRoutePlanner">;
  adapterClients?: DefaultProviderAdapterClients;
  ownerScopes?: string[];
  keyring?: KeyringAdapter;
  principalRef?: string;
}
export interface ScrapMeshClient {
  client: ExtractClient;
  provider: ProviderId;
  model: string;
  ownerScope: string;
  effort?: ReasoningEffort;
}
// Runner-less seat executors only; claude-code needs a qualified CLI runner.
const SEAT_WIRED: ReadonlySet<ProviderId> = new Set(["gemini", "openai", "muse", "mistral"]);
// In-process seats via @sentropic/llm-mesh 0.38.6: dist/service/facade.d.ts (createLlmMeshFacade)
// and dist/service/local-account-transport-service.js (seat acquisition); no gateway, no port.
export function resolveMeshAlias(alias: string): { provider: ProviderId; model: string; effort?: ReasoningEffort } {
  const suffix = /-(low|medium|high|xhigh|max)$/.exec(alias.trim())?.[1] as ReasoningEffort | undefined;
  const normalized = normalizeExactModelId(alias.trim());
  const profile = modelProfiles.find((p) => p.modelId === normalized);
  if (!normalized || !profile || isRetiredRoutingModelId(normalized)) {
    throw new Error(`scrap extract: unknown mesh alias "mesh:${alias}" (no mesh catalog profile; use mesh:<catalog-model-id> such as mesh:gemini-4-hydrogen-high)`);
  }
  if (!SEAT_WIRED.has(profile.providerId)) {
    throw new Error(`scrap extract: no seat executor for mesh provider "${profile.providerId}" (alias "mesh:${alias}"); wired seats: gemini, openai, muse, mistral`);
  }
  return { provider: profile.providerId, model: normalized, ...(suffix && normalized !== alias.trim() ? { effort: suffix } : {}) };
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
  const { provider, model, effort } = resolveMeshAlias(rawAlias);
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
  let ownerScope: string | undefined;
  const reasons = new Set<string>();
  for (const scope of scopes) {
    try {
      const plan = await probe.plan({ principalRef, ownerScopeRef: scope }, { requestedModel: model });
      if (plan.candidateRefs.length > 0) { ownerScope = scope; break; }
    } catch (error) {
      if (!(error instanceof RoutePlanError || (error as { name?: unknown } | null)?.name === "RoutePlanError")) throw error;
      // Surface why the seat is unusable (e.g. reauth-required), never a credential.
      const e = error as { code?: unknown; diagnostics?: readonly { code?: unknown; transportProviderId?: unknown }[] };
      for (const d of e.diagnostics ?? []) reasons.add(`${String(d.transportProviderId)}: ${String(d.code)}`);
      if (!e.diagnostics?.length && e.code) reasons.add(String(e.code));
    }
  }
  if (!ownerScope) {
    throw new Error(`scrap extract: no usable mesh seat for "mesh:${model}" (tried owner scopes: ${scopes.join(", ")}${reasons.size ? `; reasons: ${[...reasons].join(", ")}` : ""})`);
  }
  const clients = deps.adapterClients ?? {
    gemini: new CloudCodeRuntimeClient(),
    openai: new CodexRuntimeClient(),
    muse: new MuseRuntimeClient(),
    mistral: new MistralRuntimeClient(),
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
