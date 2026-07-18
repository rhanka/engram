import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  Extraction,
  GraphEdge,
  GraphNode,
  LinkValidationIssue,
  NormalizedOntologyProfile,
  RegistryRecord,
  TypedEntityOccurrenceV1,
} from "./types.js";
import type { WikiDescriptionSidecarIndex } from "./wiki-descriptions.js";
import { buildHierarchyIndex, compileHierarchies } from "./ontology-hierarchies.js";

export interface OntologyOutputConfig {
  enabled: boolean;
  canonical_node_types?: string[];
  occurrence_node_types?: string[];
  relation_exports?: string[];
  wiki?: {
    enabled?: boolean;
    page_node_types?: string[];
  };
}

export interface CompileOntologyOutputsOptions {
  outputDir: string;
  extraction: Extraction;
  profile: NormalizedOntologyProfile;
  config: OntologyOutputConfig;
  /**
   * Optional sidecar index loaded from `.graphify/wiki-descriptions.json`.
   * When provided, ontology entity wiki pages render the validated
   * `generated` description for the canonical entity id. Stale or
   * `insufficient_evidence` sidecars are silently skipped, matching the
   * behaviour of `graphify export wiki --descriptions`. Look-up keys on
   * the canonical `node.id` (not the source graph node ids).
   */
  descriptions?: WikiDescriptionSidecarIndex;
  /**
   * Optional registry records keyed by registry id.  When provided and the
   * profile declares hierarchies, `compileOntologyOutputs` will generate
   * `hierarchies.json` and `hierarchy-index.json` in `outputDir`.
   */
  registries?: Record<string, RegistryRecord[]>;
  /**
   * Mention-level typed entity occurrences produced by an explicit linking
   * pass. Omitted inputs preserve the historical empty-array artifact.
   */
  occurrences?: TypedEntityOccurrenceV1[];
}

export interface CompileOntologyOutputsResult {
  enabled: boolean;
  nodeCount: number;
  relationCount: number;
  wikiPageCount: number;
  validationIssues: LinkValidationIssue[];
  /** Number of hierarchy arcs written to hierarchies.json (0 when no hierarchies declared). */
  hierarchyArcCount: number;
}

interface CompiledNode {
  id: string;
  type: string;
  label: string;
  aliases: string[];
  normalized_terms: string[];
  status: string;
  confidence: number | null;
  source_refs: string[];
  registry_refs: string[];
  graph_node_ids: string[];
}

interface CompiledRelation {
  id: string;
  type: string;
  source_id: string;
  target_id: string;
  confidence: number | null;
  evidence_refs: string[];
  graph_edge_ids: string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedTerm(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ontologyNodeType(node: GraphNode): string | null {
  return stringValue(node.node_type) ?? stringValue(node.type);
}

function confidenceScore(value: GraphNode | GraphEdge): number | null {
  return typeof value.confidence_score === "number" ? value.confidence_score : null;
}

function sourceRef(file: string | undefined, location: string | undefined): string[] {
  if (!file) return [];
  return [location ? `${file}#${location}` : file];
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "entity";
}

function compileNodes(
  extraction: Extraction,
  profile: NormalizedOntologyProfile,
  config: OntologyOutputConfig,
): { nodes: CompiledNode[]; aliasIssues: LinkValidationIssue[] } {
  const allowedTypes = new Set(config.canonical_node_types ?? Object.keys(profile.node_types));
  const nodes = extraction.nodes
    .filter((node) => {
      const type = ontologyNodeType(node);
      return type !== null && allowedTypes.has(type);
    })
    .map((node): CompiledNode => {
      const type = ontologyNodeType(node)!;
      const aliases = stringArray(node.aliases);
      const terms = [node.label, ...aliases].map(normalizedTerm).filter(Boolean);
      const status = typeof node.status === "string" ? node.status : profile.hardening.default_status;
      return {
        id: node.id,
        type,
        label: node.label,
        aliases,
        normalized_terms: Array.from(new Set(terms)),
        status,
        confidence: confidenceScore(node),
        source_refs: sourceRef(node.source_file, node.source_location),
        registry_refs: stringArray(node.registry_refs),
        graph_node_ids: [node.id],
      };
    });

  const aliases = new Map<string, string[]>();
  for (const node of nodes) {
    for (const alias of node.aliases.map(normalizedTerm)) {
      if (!alias) continue;
      aliases.set(alias, [...(aliases.get(alias) ?? []), node.id]);
    }
  }

  const aliasIssues: LinkValidationIssue[] = [];
  for (const [alias, ids] of aliases.entries()) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length > 1) {
      const affectedNodes = nodes.filter((node) => uniqueIds.includes(node.id));
      const nodeTypes = Array.from(new Set(affectedNodes.map((node) => node.type)));
      aliasIssues.push({
        code: "ALIAS_AMBIGUOUS",
        severity: "warning",
        node_type: nodeTypes.length === 1 ? nodeTypes[0]! : null,
        message: `alias "${alias}" ambiguously attaches to ${uniqueIds.join(", ")}`,
        refs: uniqueIds.map((id) => `record:${id}`),
      });
      for (const node of affectedNodes) {
        node.status = "needs_review";
      }
    }
  }

  return { nodes, aliasIssues };
}

function occurrenceRefs(occurrence: TypedEntityOccurrenceV1): string[] {
  const refs: string[] = [];
  if (occurrence.id) refs.push(`occurrence:${occurrence.id}`);
  if (occurrence.source_file) refs.push(`source:${occurrence.source_file}`);
  if (occurrence.registry_record_id !== undefined) refs.push(`record:${occurrence.registry_record_id}`);
  return refs;
}

function validateOccurrence(occurrence: TypedEntityOccurrenceV1): LinkValidationIssue[] {
  const refs = occurrenceRefs(occurrence);
  const issues: LinkValidationIssue[] = [];

  if (occurrence.raw_span.length === 0) {
    issues.push({
      code: "OCCURRENCE_EMPTY_RAW_SPAN",
      severity: "error",
      node_type: occurrence.node_type,
      message: "occurrence raw_span must not be empty",
      refs,
    });
  }

  const { start, end } = occurrence.offsets;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end) {
    issues.push({
      code: "OCCURRENCE_INVALID_OFFSETS",
      severity: "error",
      node_type: occurrence.node_type,
      message: "occurrence offsets must be non-negative integers with start < end",
      refs,
    });
  }

  if (occurrence.resolution === "linked" && (!occurrence.registry_record_id || !occurrence.registry_record_id.trim())) {
    issues.push({
      code: "OCCURRENCE_LINKED_MISSING_REGISTRY_RECORD_ID",
      severity: "error",
      node_type: occurrence.node_type,
      message: "linked occurrence must include exactly one registry_record_id",
      refs,
    });
  }

  if (
    (occurrence.resolution === "unlinked" || occurrence.resolution === "ambiguous")
    && occurrence.registry_record_id !== undefined
  ) {
    issues.push({
      code: "OCCURRENCE_UNRESOLVED_HAS_REGISTRY_RECORD_ID",
      severity: "error",
      node_type: occurrence.node_type,
      message: `${occurrence.resolution} occurrence must not include registry_record_id`,
      refs,
    });
  }

  return issues;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareOccurrences(left: TypedEntityOccurrenceV1, right: TypedEntityOccurrenceV1): number {
  const sourceComparison = compareText(left.source_file, right.source_file);
  if (sourceComparison !== 0) return sourceComparison;
  if (left.offsets.start !== right.offsets.start) return left.offsets.start - right.offsets.start;
  if (left.offsets.end !== right.offsets.end) return left.offsets.end - right.offsets.end;

  const nodeTypeComparison = compareText(left.node_type, right.node_type);
  if (nodeTypeComparison !== 0) return nodeTypeComparison;
  return compareText(left.id, right.id);
}

function compileOccurrences(
  occurrences: TypedEntityOccurrenceV1[] | undefined,
  config: OntologyOutputConfig,
): { occurrences: TypedEntityOccurrenceV1[]; validationIssues: LinkValidationIssue[] } {
  if (occurrences === undefined) return { occurrences: [], validationIssues: [] };

  const allowedTypes = new Set(config.occurrence_node_types ?? []);
  const validationIssues: LinkValidationIssue[] = [];
  const validOccurrences: TypedEntityOccurrenceV1[] = [];

  for (const occurrence of occurrences) {
    const issues = validateOccurrence(occurrence);
    validationIssues.push(...issues);
    if (issues.length === 0 && allowedTypes.has(occurrence.node_type)) {
      validOccurrences.push(occurrence);
    }
  }

  return { occurrences: validOccurrences.sort(compareOccurrences), validationIssues };
}

function compileRelations(extraction: Extraction, nodes: CompiledNode[], config: OntologyOutputConfig): CompiledRelation[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const allowedRelations = new Set(config.relation_exports ?? extraction.edges.map((edge) => edge.relation));
  return extraction.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && allowedRelations.has(edge.relation))
    .map((edge) => ({
      id: sha256(`${edge.source}|${edge.relation}|${edge.target}`).slice(0, 24),
      type: edge.relation,
      source_id: edge.source,
      target_id: edge.target,
      confidence: confidenceScore(edge),
      evidence_refs: sourceRef(edge.source_file, edge.source_location),
      graph_edge_ids: [`${edge.source}->${edge.relation}->${edge.target}`],
    }));
}

function writeWiki(
  outputDir: string,
  nodes: CompiledNode[],
  relations: CompiledRelation[],
  config: OntologyOutputConfig,
  descriptions?: WikiDescriptionSidecarIndex,
): number {
  if (!config.wiki?.enabled) return 0;
  const pageTypes = new Set(config.wiki.page_node_types ?? nodes.map((node) => node.type));
  const wikiDir = join(outputDir, "wiki");
  const entityDir = join(wikiDir, "entities");
  mkdirSync(entityDir, { recursive: true });
  let count = 0;
  for (const node of nodes.filter((item) => pageTypes.has(item.type))) {
    const outgoing = relations.filter((relation) => relation.source_id === node.id);
    const sidecar = descriptions?.nodes[node.id];
    const descriptionBlock: string[] = [];
    if (sidecar && sidecar.status === "generated" && sidecar.description.trim().length > 0) {
      descriptionBlock.push("## Description", "", sidecar.description.trim(), "");
    }
    const lines = [
      `# ${node.label}`,
      "",
      `Type: ${node.type}`,
      `Status: ${node.status}`,
      "",
      ...descriptionBlock,
      "## Aliases",
      "",
      ...(node.aliases.length > 0 ? node.aliases.map((alias) => `- ${alias}`) : ["- none"]),
      "",
      "## Relations",
      "",
      ...(outgoing.length > 0 ? outgoing.map((relation) => `- ${relation.type} -> ${relation.target_id}`) : ["- none"]),
      "",
      "## Evidence",
      "",
      ...(node.source_refs.length > 0 ? node.source_refs.map((ref) => `- ${ref}`) : ["- none"]),
    ];
    writeFileSync(join(entityDir, `${safeFilename(node.id)}.md`), lines.join("\n") + "\n", "utf-8");
    count++;
  }
  writeJson(join(wikiDir, "index.json"), { entries: nodes.map((node) => ({ id: node.id, label: node.label, type: node.type })) });
  writeFileSync(join(wikiDir, "index.md"), nodes.map((node) => `- [${node.label}](entities/${safeFilename(node.id)}.md)`).join("\n") + "\n", "utf-8");
  return count;
}

export function compileOntologyOutputs(options: CompileOntologyOutputsOptions): CompileOntologyOutputsResult {
  if (!options.config.enabled) {
    return { enabled: false, nodeCount: 0, relationCount: 0, wikiPageCount: 0, validationIssues: [], hierarchyArcCount: 0 };
  }

  const { nodes, aliasIssues } = compileNodes(options.extraction, options.profile, options.config);
  const compiledOccurrences = compileOccurrences(options.occurrences, options.config);
  const relations = compileRelations(options.extraction, nodes, options.config);
  const validationIssues = [...aliasIssues, ...compiledOccurrences.validationIssues];
  const wikiPageCount = writeWiki(options.outputDir, nodes, relations, options.config, options.descriptions);

  // ---- Hierarchy artefacts (increment A — additive, no-op when no hierarchies) ----
  let hierarchyArcCount = 0;
  const hasHierarchies = Object.keys(options.profile.hierarchies ?? {}).length > 0;
  const hierarchiesPath = join(options.outputDir, "hierarchies.json");
  const hierarchyIndexPath = join(options.outputDir, "hierarchy-index.json");

  if (hasHierarchies) {
    const arcs = compileHierarchies({
      hierarchies: options.profile.hierarchies,
      registries: options.registries ?? {},
    });
    const index = buildHierarchyIndex(arcs);
    writeJson(hierarchiesPath, arcs);
    writeJson(hierarchyIndexPath, index);
    hierarchyArcCount = arcs.length;
  }
  // ---- End hierarchy artefacts ----

  const manifest: Record<string, unknown> = {
    schema: "graphify_ontology_outputs_v1",
    graph_hash: sha256(JSON.stringify(options.extraction)),
    profile_hash: options.profile.profile_hash,
    generated_at: new Date().toISOString(),
    node_count: nodes.length,
    relation_count: relations.length,
    wiki_page_count: wikiPageCount,
    source_graph: ".graphify/graph.json",
  };

  if (hasHierarchies) {
    manifest.hierarchies_path = hierarchiesPath;
    manifest.hierarchy_index_path = hierarchyIndexPath;
  }

  writeJson(join(options.outputDir, "manifest.json"), manifest);
  writeJson(join(options.outputDir, "nodes.json"), nodes);
  writeJson(join(options.outputDir, "aliases.json"), nodes.flatMap((node) =>
    node.aliases.map((alias) => ({
      term: alias,
      normalized: normalizedTerm(alias),
      node_id: node.id,
      source: "extraction",
      confidence: node.confidence,
    })),
  ));
  writeJson(join(options.outputDir, "relations.json"), relations);
  writeJson(join(options.outputDir, "sources.json"), nodes.flatMap((node) => node.source_refs.map((ref) => ({ id: ref, source_file: ref }))));
  writeJson(join(options.outputDir, "occurrences.json"), compiledOccurrences.occurrences);
  writeJson(join(options.outputDir, "validation.json"), {
    schema: "graphify_ontology_validation_v1",
    issues: validationIssues,
  });
  writeJson(join(options.outputDir, "index.json"), {
    schema: "graphify_ontology_index_v1",
    entries: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      aliases: node.aliases,
      wiki_path: options.config.wiki?.enabled ? `.graphify/ontology/wiki/entities/${safeFilename(node.id)}.md` : null,
      source_refs: node.source_refs,
      relation_ids: relations.filter((relation) => relation.source_id === node.id || relation.target_id === node.id).map((relation) => relation.id),
    })),
  });

  return { enabled: true, nodeCount: nodes.length, relationCount: relations.length, wikiPageCount, validationIssues, hierarchyArcCount };
}
