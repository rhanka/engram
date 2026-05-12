import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import Graph from "graphology";
import { godNodes } from "./analyze.js";
import { type NumericMapLike, toNumericMap } from "./collections.js";
import { validateWikiDescriptionSidecar, WIKI_DESCRIPTION_PROMPT_VERSION, WIKI_DESCRIPTION_SCHEMA, buildWikiDescriptionCacheKey, createInsufficientEvidenceRecord, type WikiDescriptionGenerator, type WikiDescriptionSidecar, type WikiDescriptionSidecarIndex, type WikiDescriptionTargetKind } from "./wiki-descriptions.js";
import type { LlmExecutionMode, TextJsonGenerationClient } from "./llm-execution.js";

const DEFAULT_NODE_TARGET_LIMIT = 10;
const DEFAULT_COMMUNITY_TARGET_LIMIT = 12;
const DEFAULT_NODE_NEIGHBOR_LIMIT = 12;

interface RawNode {
  target_id: string;
  target_kind: "node";
  label: string;
  node_type: string | null;
  degree: number;
  source_refs: string[];
  community_id: number | null;
  community_label: string | null;
  neighbors: WikiDescriptionNeighbor[];
}

interface RawCommunity {
  target_id: string;
  target_kind: "community";
  community_id: number;
  label: string;
  member_count: number;
  top_members: Array<{ id: string; label: string; degree: number }>;
  source_refs: string[];
}

export type WikiDescriptionTargetContext = RawNode | RawCommunity;

export interface WikiDescriptionNeighbor {
  relation: string;
  target_id: string;
  target_label: string;
  source_file?: string;
}

export interface CollectWikiDescriptionTargetsOptions {
  communities?: NumericMapLike<string[]>;
  communityLabels?: NumericMapLike<string>;
  includeNodeTargets?: boolean;
  includeCommunityTargets?: boolean;
  nodeIds?: string[];
  maxNodeTargets?: number;
  maxCommunityTargets?: number;
  maxNodeNeighbors?: number;
}

export interface WikiDescriptionTargetCollection {
  nodes: RawNode[];
  communities: RawCommunity[];
}

export interface BuildWikiDescriptionPromptOptions {
  graphHash: string;
  promptVersion?: string;
  maxNeighbors?: number;
}

export interface GenerateWikiDescriptionSidecarsClients {
  assistant?: TextJsonGenerationClient;
  direct?: TextJsonGenerationClient;
  batch?: TextJsonGenerationClient;
  mesh?: TextJsonGenerationClient;
}

export interface GenerateWikiDescriptionSidecarsOptions extends CollectWikiDescriptionTargetsOptions {
  graphHash: string;
  mode?: LlmExecutionMode;
  clients?: GenerateWikiDescriptionSidecarsClients;
  promptVersion?: string;
  outputDir?: string;
  createdAt?: string;
  maxNeighbors?: number;
}

export type WikiDescriptionGenerationTargetStatus =
  | "instructions_written"
  | "completed"
  | "not_implemented"
  | "invalid_output";

export type WikiDescriptionGenerationStatus =
  | "instructions_written"
  | "completed"
  | "not_implemented"
  | "failed";

export interface WikiDescriptionGenerationTargetResult {
  target_id: string;
  target_kind: WikiDescriptionTargetKind;
  status: WikiDescriptionGenerationTargetStatus;
  prompt: string;
  sidecar: WikiDescriptionSidecar;
  outputPath?: string;
  instructionPath?: string;
  reason?: string;
}

export interface WikiDescriptionGenerationResult {
  status: WikiDescriptionGenerationStatus;
  mode: LlmExecutionMode;
  graph_hash: string;
  prompt_version: string;
  index: WikiDescriptionSidecarIndex;
  indexPath?: string;
  targets: WikiDescriptionGenerationTargetResult[];
}

export const WIKI_DESCRIPTION_UNIMPLEMENTED_MODE_MESSAGE = "Wiki description generation mode is not implemented in this first slice. Pass an injected compatible client or use assistant mode to emit instructions.";

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(Array.from(values).map((value) => value.trim()).filter(Boolean))].sort();
}

function sortByLabelAndId(a: string, b: string): number {
  return a.localeCompare(b);
}

function safeTargetId(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "target";
}

function parseNodeCommunity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectSourceRefs(attrs: Record<string, unknown>): string[] {
  return uniqueSorted([
    ...(safeString(attrs.source_file) ? [String(attrs.source_file)] : []),
    ...(Array.isArray(attrs.evidence_refs)
      ? attrs.evidence_refs.flatMap((item) => safeString(item) ?? [])
      : []),
  ]);
}

function collectNodeNeighbors(graph: Graph, targetId: string, limit: number): WikiDescriptionNeighbor[] {
  const buckets = new Map<string, WikiDescriptionNeighbor[]>();
  graph.forEachEdge((_edge, attributes, source, target) => {
    if (source !== targetId && target !== targetId) return;
    const relation = safeString(attributes.relation) ?? "related";
    const neighborId = source === targetId ? target : source;
    const attrs = graph.getNodeAttributes(neighborId) as Record<string, unknown>;
    const neighborLabel = safeString(attrs.label) ?? neighborId;
    const sourceFile = safeString(attrs.source_file) ?? undefined;
    const entry: WikiDescriptionNeighbor = {
      relation,
      target_id: neighborId,
      target_label: neighborLabel,
      ...(sourceFile ? { source_file: sourceFile } : {}),
    };
    buckets.set(relation, [...(buckets.get(relation) ?? []), entry]);
  });

  const neighbors: WikiDescriptionNeighbor[] = [];
  for (const [relation, entries] of [...buckets.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const sorted = [...entries].sort((left, right) => {
      const byLabel = sortByLabelAndId(left.target_label, right.target_label);
      return byLabel !== 0 ? byLabel : sortByLabelAndId(left.target_id, right.target_id);
    });
    neighbors.push(...sorted);
    if (neighbors.length >= limit) break;
  }
  return neighbors.slice(0, limit);
}

function collectNodeTargetContext(
  graph: Graph,
  targetId: string,
  communityLabels: Map<number, string>,
  maxNodeNeighbors: number,
): RawNode {
  const attrs = graph.getNodeAttributes(targetId) as Record<string, unknown>;
  const label = safeString(attrs.label) ?? targetId;
  const nodeType = safeString(attrs.node_type);
  const communityId = parseNodeCommunity(attrs.community);
  const sourceRefs = collectSourceRefs(attrs);
  const neighbors = collectNodeNeighbors(graph, targetId, maxNodeNeighbors);

  return {
    target_id: targetId,
    target_kind: "node",
    label,
    node_type: nodeType,
    degree: graph.degree(targetId),
    source_refs: sourceRefs,
    community_id: communityId,
    community_label: communityId === null ? null : (communityLabels.get(communityId) ?? `Community ${communityId}`),
    neighbors,
  };
}

function collectCommunityTargetContext(
  graph: Graph,
  communityId: number,
  members: string[],
  communityLabels: Map<number, string>,
): RawCommunity {
  const sortedMembers = [...members].filter(graph.hasNode.bind(graph))
    .sort((a, b) => {
      const degreeDelta = graph.degree(b) - graph.degree(a);
      return degreeDelta !== 0 ? degreeDelta : sortByLabelAndId(a, b);
    });

  const topMembers = sortedMembers.slice(0, 8).map((memberId) => {
    const attrs = graph.getNodeAttributes(memberId) as Record<string, unknown>;
    return {
      id: memberId,
      label: safeString(attrs.label) ?? memberId,
      degree: graph.degree(memberId),
    };
  });

  const sourceRefs = uniqueSorted(
    sortedMembers
      .flatMap((memberId) => collectSourceRefs(graph.getNodeAttributes(memberId) as Record<string, unknown>)),
  );

  return {
    target_id: `community:${communityId}`,
    target_kind: "community",
    community_id: communityId,
    label: communityLabels.get(communityId) ?? `Community ${communityId}`,
    member_count: sortedMembers.length,
    top_members: topMembers,
    source_refs: sourceRefs,
  };
}

export function collectWikiDescriptionTargets(
  graph: Graph,
  options: CollectWikiDescriptionTargetsOptions = {},
): WikiDescriptionTargetCollection {
  const {
    communities: communityInput,
    communityLabels: communityLabelInput,
    includeNodeTargets = true,
    includeCommunityTargets = false,
    nodeIds,
    maxNodeTargets = DEFAULT_NODE_TARGET_LIMIT,
    maxCommunityTargets = DEFAULT_COMMUNITY_TARGET_LIMIT,
    maxNodeNeighbors = DEFAULT_NODE_NEIGHBOR_LIMIT,
  } = options;

  const communityMap = communityInput
    ? toNumericMap(communityInput)
    : collectInferredCommunityMap(graph);
  const communityLabels = toNumericMap(communityLabelInput);

  const nodes: RawNode[] = [];
  if (includeNodeTargets) {
    const ids = nodeIds && nodeIds.length > 0
      ? uniqueSorted(nodeIds.filter((id) => graph.hasNode(id)))
      : godNodes(graph, Math.max(1, maxNodeTargets)).map((entry) => entry.id);

    const selectedIds = ids
      .filter((id) => graph.hasNode(id))
      .slice(0, maxNodeTargets > 0 ? maxNodeTargets : Number.MAX_SAFE_INTEGER);

    const ranked = selectedIds
      .map((id) => collectNodeTargetContext(graph, id, communityLabels, maxNodeNeighbors))
      .sort((left, right) => {
        const byDegree = right.degree - left.degree;
        if (byDegree !== 0) return byDegree;
        return sortByLabelAndId(left.target_id, right.target_id);
      });
    nodes.push(...ranked);
  }

  const communities: RawCommunity[] = [];
  if (includeCommunityTargets) {
    const sortedCommunityIds = [...communityMap.keys()].sort((left, right) => left - right);
    for (const communityId of sortedCommunityIds.slice(0, maxCommunityTargets > 0 ? maxCommunityTargets : Number.MAX_SAFE_INTEGER)) {
      communities.push(collectCommunityTargetContext(graph, communityId, communityMap.get(communityId) ?? [], communityLabels));
    }
  }

  return { nodes, communities };
}

function collectInferredCommunityMap(graph: Graph): Map<number, string[]> {
  const result = new Map<number, string[]>();
  graph.forEachNode((nodeId) => {
    const attrs = graph.getNodeAttributes(nodeId) as Record<string, unknown>;
    const communityId = parseNodeCommunity(attrs.community);
    if (communityId === null) return;
    const members = result.get(communityId);
    if (!members) {
      result.set(communityId, [nodeId]);
      return;
    }
    members.push(nodeId);
  });

  for (const members of result.values()) {
    members.sort((left, right) => left.localeCompare(right));
  }
  return result;
}

export function buildWikiDescriptionPrompt(
  target: WikiDescriptionTargetContext,
  options: BuildWikiDescriptionPromptOptions,
): string {
  const promptVersion = options.promptVersion ?? WIKI_DESCRIPTION_PROMPT_VERSION;
  const maxNeighbors = options.maxNeighbors ?? DEFAULT_NODE_NEIGHBOR_LIMIT;
  const header = [
    "You are graphify. Generate a short source-grounded wiki description.",
    "",
    "Constraints:",
    "- 3 to 6 sentences.",
    "- No speculation.",
    "- No marketing language.",
    "- Only use the context below.",
    "",
    `target_kind: ${target.target_kind}`,
    `target_id: ${target.target_id}`,
    `graph_hash: ${options.graphHash}`,
    `prompt_version: ${promptVersion}`,
    "",
  ];

  if (target.target_kind === "node") {
    const lines = [
      ...header,
      `label: ${target.label}`,
      `degree: ${target.degree}`,
      `node_type: ${target.node_type ?? "unknown"}`,
      target.community_id === null ? "community: none" : `community: ${target.community_id} (${target.community_label ?? `Community ${target.community_id}`})`,
      `evidence_refs: ${target.source_refs.length === 0 ? "none" : target.source_refs.join(", ")}`,
      "",
      `neighbors (up to ${maxNeighbors}):`,
    ];

    const visibleNeighbors = target.neighbors.slice(0, maxNeighbors);
    if (visibleNeighbors.length === 0) {
      lines.push("- none");
    } else {
      for (const neighbor of visibleNeighbors) {
        const source = neighbor.source_file ? ` [${neighbor.source_file}]` : "";
        lines.push(`- [${neighbor.relation}] ${neighbor.target_label} (${neighbor.target_id})${source}`);
      }
    }

    return [
      ...lines,
      "",
      "Output:",
      `Return JSON fields that Graphify will wrap into ${WIKI_DESCRIPTION_SCHEMA}:`,
      `{
  \"status\": \"generated\",
  \"description\": \"...\", 
  \"evidence_refs\": [\"src/file.ts\"],
  \"confidence\": 0.79
}`,
      "",
      "If confident context is insufficient, use status \"insufficient_evidence\",",
      `with description: null, evidence_refs: [] and confidence: null.`,
    ].join("\n");
  }

  const lines = [
    ...header,
    `label: ${target.label}`,
    `member_count: ${target.member_count}`,
    `evidence_refs: ${target.source_refs.length === 0 ? "none" : target.source_refs.join(", ")}`,
    "",
    "top_members:",
  ];

  if (target.top_members.length === 0) {
    lines.push("- none");
  } else {
    for (const member of target.top_members) {
      lines.push(`- ${member.label} (${member.id}) degree=${member.degree}`);
    }
  }

  return [
    ...lines,
    "",
    "Output:",
    `Return JSON fields that Graphify will wrap into ${WIKI_DESCRIPTION_SCHEMA}:`,
    `{
  \"status\": \"generated\",
  \"description\": \"...\", 
  \"evidence_refs\": [\"src/file.ts\"],
  \"confidence\": 0.79
}`,
    "",
    "If confident context is insufficient, use status \"insufficient_evidence\",",
    `with description: null, evidence_refs: [] and confidence: null.`,
  ].join("\n");
}

function describeMissingModeClient(mode: Exclude<LlmExecutionMode, "assistant">): string {
  return `No injected client for wiki description mode "${mode}". This slice supports assistant first and does not directly execute ${mode} mode without an injected client.`;
}

function resolveClient(
  mode: LlmExecutionMode,
  clients?: GenerateWikiDescriptionSidecarsClients,
): TextJsonGenerationClient | null {
  switch (mode) {
    case "assistant":
      return clients?.assistant ?? null;
    case "direct":
      return clients?.direct ?? null;
    case "batch":
      return clients?.batch ?? null;
    case "mesh":
      return clients?.mesh ?? null;
    default:
      return null;
  }
}

function targetIndexKey(targetId: string): string {
  return targetId.replace(/^community:/, "");
}

function targetOutputPath(outputDir: string | undefined, targetId: string): string | undefined {
  return outputDir ? join(outputDir, `${safeTargetId(targetId)}.json`) : undefined;
}

function indexOutputPath(outputDir: string | undefined): string | undefined {
  return outputDir ? `${outputDir.replace(/[\\/]$/u, "")}.json` : undefined;
}

function writeSidecar(path: string | undefined, sidecar: WikiDescriptionSidecar): void {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sidecar, null, 2) + "\n", "utf-8");
}

function writeIndex(path: string | undefined, index: WikiDescriptionSidecarIndex): void {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

function ensureSidecarGenerator(
  sidecar: WikiDescriptionSidecar,
  mode: LlmExecutionMode,
  provider: string,
  model: string | null,
  graphHash: string,
  promptVersion: string,
): WikiDescriptionSidecar {
  const cache_key = buildWikiDescriptionCacheKey({
    target_id: sidecar.target_id,
    target_kind: sidecar.target_kind,
    graph_hash: graphHash,
    prompt_version: promptVersion,
    mode,
    provider,
    model,
  });

  return {
    ...sidecar,
    graph_hash: graphHash,
    cache_key,
    generator: {
      mode,
      provider,
      model,
      prompt_version: promptVersion,
    } satisfies WikiDescriptionGenerator,
  };
}

function buildFallbackSidecar(
  target: WikiDescriptionTargetContext,
  options: {
    graph_hash: string;
    prompt_version: string;
    mode: LlmExecutionMode;
    provider: string;
    model?: string | null;
    createdAt?: string;
  },
): WikiDescriptionSidecar {
  return createInsufficientEvidenceRecord({
    target_id: target.target_id,
    target_kind: target.target_kind,
    graph_hash: options.graph_hash,
    mode: options.mode,
    prompt_version: options.prompt_version,
    provider: options.provider,
    model: options.model ?? null,
    created_at: options.createdAt,
  });
}

function tryReadGeneratedSidecar(
  path: string | undefined,
  target: WikiDescriptionTargetContext,
  metadata: {
    mode: LlmExecutionMode;
    provider: string;
    model: string | null;
    graph_hash: string;
    prompt_version: string;
    createdAt?: string;
  },
): WikiDescriptionSidecar | null {
  if (!path || !existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const candidate = raw as WikiDescriptionSidecar;
    if (validateWikiDescriptionSidecar(candidate).length === 0) {
      if (candidate.target_id !== target.target_id || candidate.target_kind !== target.target_kind) return null;
      return ensureSidecarGenerator(
        candidate,
        metadata.mode,
        metadata.provider,
        metadata.model,
        metadata.graph_hash,
        metadata.prompt_version,
      );
    }

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const partial = raw as Record<string, unknown>;
    if (partial.status === "insufficient_evidence") {
      return buildFallbackSidecar(target, metadata);
    }
    if (partial.status !== "generated") return null;

    const description = safeString(partial.description);
    const evidenceRefs = uniqueSorted(
      Array.isArray(partial.evidence_refs)
        ? partial.evidence_refs.filter((item): item is string => typeof item === "string")
        : [],
    );
    const confidence = partial.confidence;
    if (!description || evidenceRefs.length === 0 || typeof confidence !== "number" || !Number.isFinite(confidence)) {
      return null;
    }

    const sidecar: WikiDescriptionSidecar = {
      schema: WIKI_DESCRIPTION_SCHEMA,
      target_id: target.target_id,
      target_kind: target.target_kind,
      graph_hash: metadata.graph_hash,
      status: "generated",
      description,
      evidence_refs: evidenceRefs as [string, ...string[]],
      confidence,
      cache_key: buildWikiDescriptionCacheKey({
        target_id: target.target_id,
        target_kind: target.target_kind,
        graph_hash: metadata.graph_hash,
        prompt_version: metadata.prompt_version,
        mode: metadata.mode,
        provider: metadata.provider,
        model: metadata.model,
      }),
      generator: {
        mode: metadata.mode,
        provider: metadata.provider,
        model: metadata.model,
        prompt_version: metadata.prompt_version,
      },
      ...(metadata.createdAt ? { created_at: metadata.createdAt } : {}),
    };
    return validateWikiDescriptionSidecar(sidecar).length === 0 ? sidecar : null;
  } catch {
    return null;
  }
}

export async function generateWikiDescriptionSidecars(
  graph: Graph,
  options: GenerateWikiDescriptionSidecarsOptions,
): Promise<WikiDescriptionGenerationResult> {
  const {
    graphHash,
    mode = "assistant",
    clients,
    promptVersion = WIKI_DESCRIPTION_PROMPT_VERSION,
    outputDir,
    createdAt,
    maxNeighbors = DEFAULT_NODE_NEIGHBOR_LIMIT,
  } = options;

  const targetCollection = collectWikiDescriptionTargets(graph, options);
  const allTargets: WikiDescriptionTargetContext[] = [...targetCollection.nodes, ...targetCollection.communities];
  const index: WikiDescriptionSidecarIndex = {
    schema: "graphify_wiki_description_index_v1",
    graph_hash: graphHash,
    prompt_version: promptVersion,
    nodes: {},
    communities: targetCollection.communities.length > 0 ? {} : undefined,
  };
  const indexPath = indexOutputPath(outputDir);

  const client = resolveClient(mode, clients);
  const targetResults: WikiDescriptionGenerationTargetResult[] = [];
  const modeUnavailableReason = mode === "assistant"
    ? "No injected assistant client was provided."
    : describeMissingModeClient(mode);

  if (!client) {
    for (const target of allTargets) {
      const outputPath = targetOutputPath(outputDir, target.target_id);
      const sidecar = buildFallbackSidecar(target, {
        graph_hash: graphHash,
        prompt_version: promptVersion,
        mode,
        provider: mode,
        model: null,
        createdAt,
      });
      if (target.target_kind === "node") {
        index.nodes[target.target_id] = sidecar as never;
      } else {
        index.communities ??= {};
        index.communities[targetIndexKey(target.target_id)] = sidecar as never;
      }
      writeSidecar(outputPath, sidecar);

      targetResults.push({
        target_id: target.target_id,
        target_kind: target.target_kind,
        status: "not_implemented",
        prompt: buildWikiDescriptionPrompt(target, { graphHash, promptVersion, maxNeighbors }),
        sidecar,
        outputPath,
        reason: modeUnavailableReason,
      });
    }
    writeIndex(indexPath, index);

    return {
      status: "not_implemented",
      mode,
      graph_hash: graphHash,
      prompt_version: promptVersion,
      index,
      ...(indexPath ? { indexPath } : {}),
      targets: targetResults,
    };
  }

  for (const target of allTargets) {
    const prompt = buildWikiDescriptionPrompt(target, {
      graphHash,
      promptVersion,
      maxNeighbors,
    });
    const outputPath = targetOutputPath(outputDir, target.target_id);
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
    }

    const execution = await client.generateJson({
      schema: WIKI_DESCRIPTION_SCHEMA,
      prompt,
      outputPath,
    });

    const generatorMetadata = {
      graph_hash: graphHash,
      prompt_version: promptVersion,
      mode,
      provider: client.provider,
      model: client.model ?? null,
      createdAt,
    };

    let sidecar: WikiDescriptionSidecar = buildFallbackSidecar(target, generatorMetadata);
    let status: WikiDescriptionGenerationTargetStatus = execution.status;
    const parsed = execution.status === "completed"
      ? tryReadGeneratedSidecar(execution.outputPath, target, {
        ...generatorMetadata,
        provider: client.provider,
        model: client.model ?? null,
      })
      : null;
    if (parsed) {
      sidecar = parsed;
      status = "completed";
    } else if (execution.status === "completed") {
      status = "invalid_output";
    }
    writeSidecar(execution.outputPath, sidecar);

    if (target.target_kind === "node") {
      index.nodes[target.target_id] = sidecar as never;
    } else {
      index.communities ??= {};
      index.communities[targetIndexKey(target.target_id)] = sidecar as never;
    }

    targetResults.push({
      target_id: target.target_id,
      target_kind: target.target_kind,
      status,
      prompt,
      sidecar,
      outputPath: execution.outputPath,
      ...(execution.instructionPath ? { instructionPath: execution.instructionPath } : {}),
      ...(status === "invalid_output" ? { reason: "Output path missing expected sidecar JSON." } : {}),
    });
  }

  const finalStatus = targetResults.length === 0
    ? "completed"
    : targetResults.every((item) => item.status === "not_implemented")
      ? "not_implemented"
      : targetResults.every((item) => item.status === "completed")
        ? "completed"
        : mode === "assistant" || targetResults.some((item) => item.status === "instructions_written")
          ? "instructions_written"
          : "failed";
  writeIndex(indexPath, index);

  return {
    status: finalStatus,
    mode,
    graph_hash: graphHash,
    prompt_version: promptVersion,
    index,
    ...(indexPath ? { indexPath } : {}),
    targets: targetResults,
  };
}
