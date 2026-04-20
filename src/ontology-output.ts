import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Extraction, GraphEdge, GraphNode, NormalizedOntologyProfile } from "./types.js";

export interface OntologyOutputConfig {
  enabled: boolean;
  canonical_node_types?: string[];
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
}

export interface CompileOntologyOutputsResult {
  enabled: boolean;
  nodeCount: number;
  relationCount: number;
  wikiPageCount: number;
  validationIssues: string[];
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

function nodeType(node: GraphNode): string | null {
  return typeof node.type === "string" && node.type.trim().length > 0 ? node.type : null;
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
): { nodes: CompiledNode[]; aliasIssues: string[] } {
  const allowedTypes = new Set(config.canonical_node_types ?? Object.keys(profile.node_types));
  const nodes = extraction.nodes
    .filter((node) => {
      const type = nodeType(node);
      return type !== null && allowedTypes.has(type);
    })
    .map((node): CompiledNode => {
      const aliases = stringArray(node.aliases);
      const terms = [node.label, ...aliases].map(normalizedTerm).filter(Boolean);
      const status = typeof node.status === "string" ? node.status : profile.hardening.default_status;
      return {
        id: node.id,
        type: nodeType(node)!,
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

  const aliasIssues: string[] = [];
  for (const [alias, ids] of aliases.entries()) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length > 1) {
      aliasIssues.push(`alias "${alias}" ambiguously attaches to ${uniqueIds.join(", ")}`);
      for (const node of nodes) {
        if (uniqueIds.includes(node.id)) node.status = "needs_review";
      }
    }
  }

  return { nodes, aliasIssues };
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

function writeWiki(outputDir: string, nodes: CompiledNode[], relations: CompiledRelation[], config: OntologyOutputConfig): number {
  if (!config.wiki?.enabled) return 0;
  const pageTypes = new Set(config.wiki.page_node_types ?? nodes.map((node) => node.type));
  const wikiDir = join(outputDir, "wiki");
  const entityDir = join(wikiDir, "entities");
  mkdirSync(entityDir, { recursive: true });
  let count = 0;
  for (const node of nodes.filter((item) => pageTypes.has(item.type))) {
    const outgoing = relations.filter((relation) => relation.source_id === node.id);
    const lines = [
      `# ${node.label}`,
      "",
      `Type: ${node.type}`,
      `Status: ${node.status}`,
      "",
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
    return { enabled: false, nodeCount: 0, relationCount: 0, wikiPageCount: 0, validationIssues: [] };
  }

  const { nodes, aliasIssues } = compileNodes(options.extraction, options.profile, options.config);
  const relations = compileRelations(options.extraction, nodes, options.config);
  const validationIssues = [...aliasIssues];
  const wikiPageCount = writeWiki(options.outputDir, nodes, relations, options.config);
  const manifest = {
    schema: "graphify_ontology_outputs_v1",
    graph_hash: sha256(JSON.stringify(options.extraction)),
    profile_hash: options.profile.profile_hash,
    generated_at: new Date().toISOString(),
    node_count: nodes.length,
    relation_count: relations.length,
    wiki_page_count: wikiPageCount,
    source_graph: ".graphify/graph.json",
  };

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
  writeJson(join(options.outputDir, "occurrences.json"), []);
  writeJson(join(options.outputDir, "validation.json"), { issues: validationIssues });
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

  return { enabled: true, nodeCount: nodes.length, relationCount: relations.length, wikiPageCount, validationIssues };
}
