import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import {
  CITATION_EXTRACTION_CONTRACT_SCHEMA,
  canonicalJson,
  hashQualityTarget,
  sha256Prefixed,
  validateCitationExtractionContractForTarget,
  validateQualityTarget,
  type CitationExtractionContract,
  type NormalizedQualityTarget,
} from "./quality-target.js";

export const RESOLVED_TARGET_MANIFEST_SCHEMA = "graphify_resolved_target_v1";
export const QA_REPORT_SCHEMA = "graphify_qa_report_v1";
export const QA_REPORT_FILENAME = "quality-qa-report.json";

export interface ResolvedTargetArtifact {
  bundle_path: string;
  source_path: string;
  source_kind: string;
  sha256: string;
}

export interface ResolvedTargetManifest {
  schema: typeof RESOLVED_TARGET_MANIFEST_SCHEMA;
  target_id: string;
  target_hash?: string;
  graphify_version?: string;
  producer?: Record<string, unknown>;
  artifacts: Record<string, ResolvedTargetArtifact>;
  resolved_policy?: {
    corpus_type?: string;
    citations?: {
      extraction?: {
        mode?: string;
        contract_id?: string;
        contract_hash?: string;
        contract?: CitationExtractionContract;
        assembly?: {
          same_entity_merge?: string;
          dedupe_key?: string[];
        };
      };
      describeCap?: string | number;
      display?: string;
      inline?: Record<string, unknown>;
      sidecar?: Record<string, unknown>;
    };
  };
  inputs?: Record<string, unknown>;
  extraction_units?: Array<{
    id: string;
    source_path?: string;
    contract_id?: string;
    contract_hash?: string;
    citation_mode?: string;
  }>;
}

export interface QualityQaCheck {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface QualityQaReport {
  schema: typeof QA_REPORT_SCHEMA;
  target_id: string;
  target_hash: string | null;
  manifest_hash: string | null;
  bundle_path: string;
  artifact_hashes: Record<string, string>;
  chrome?: DataOnlyChromeHashes;
  status: "passed" | "failed";
  summary: { passed: number; failed: number; warned: number };
  checks: QualityQaCheck[];
}

export interface DataOnlyChromeHashes {
  data_only: true;
  data_allowlist_hash: string;
  bundle_non_data_tree_hash: string;
  chrome_reference_path: string;
  chrome_reference_tree_hash: string;
}

export interface EvaluateQualityBundleOptions {
  target: NormalizedQualityTarget;
  bundleDir: string;
  manifest?: ResolvedTargetManifest | null;
  targetHash?: string | null;
}

export function sha256File(path: string): string {
  return sha256Prefixed(readFileSync(path));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeSha(value: string): string {
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function sortedJsonHash(value: unknown): string {
  return sha256Prefixed(canonicalJson(value));
}

function relativePosix(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function listFiles(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isFile()) {
        out.push(relativePosix(root, path));
      }
    }
  };
  walk(root);
  return out.sort();
}

function fileSetHash(root: string, files: string[]): string {
  const entries = files.map((rel) => {
    const path = join(root, rel);
    return [rel, existsSync(path) && statSync(path).isFile() ? sha256File(path) : null] as const;
  });
  return sortedJsonHash(entries);
}

function treeHash(root: string, options: { exclude?: Set<string> } = {}): string {
  const exclude = options.exclude ?? new Set<string>();
  const files = listFiles(root).filter((rel) =>
    !exclude.has(rel) && rel !== QA_REPORT_FILENAME && rel !== "resolved-target.json"
  );
  return fileSetHash(root, files);
}

export function computeDataOnlyChromeHashes(
  bundleDir: string,
  chromeReferenceDir: string,
  dataAllowlist: string[],
): DataOnlyChromeHashes {
  const allowlist = [...dataAllowlist].sort();
  const exclude = new Set(allowlist);
  return {
    data_only: true,
    data_allowlist_hash: sortedJsonHash(allowlist),
    bundle_non_data_tree_hash: treeHash(bundleDir, { exclude }),
    chrome_reference_path: chromeReferenceDir,
    chrome_reference_tree_hash: treeHash(chromeReferenceDir, { exclude }),
  };
}

function add(
  checks: QualityQaCheck[],
  failed: boolean,
  id: string,
  message: string,
  details: Omit<QualityQaCheck, "id" | "message" | "severity"> = {},
): void {
  checks.push({
    id,
    severity: failed ? "error" : "info",
    message,
    ...details,
  });
}

function addWarning(
  checks: QualityQaCheck[],
  id: string,
  message: string,
  details: Omit<QualityQaCheck, "id" | "message" | "severity"> = {},
): void {
  checks.push({ id, severity: "warning", message, ...details });
}

function globDenyMatch(pattern: string, path: string): boolean {
  const normalizedPattern = pattern.split("\\").join("/");
  const normalizedPath = path.split("\\").join("/");
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  return normalizedPath === normalizedPattern || normalizedPath.includes(normalizedPattern);
}

function artifactPathFor(target: NormalizedQualityTarget): string[] {
  return [...target.publication.data_allowlist];
}

function loadBundleJson(bundleDir: string, rel: string): unknown | null {
  const path = join(bundleDir, rel);
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return readJson(path);
}

function graphNodes(graph: unknown): Array<Record<string, unknown>> {
  const nodes = asRecord(graph).nodes;
  return Array.isArray(nodes) ? nodes.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

function graphEdges(graph: unknown): unknown[] {
  const rec = asRecord(graph);
  const links = rec.links ?? rec.edges;
  return Array.isArray(links) ? links : [];
}

function edgeEndpoint(value: unknown): string | null {
  if (typeof value === "string") return value;
  const id = asRecord(value).id;
  return typeof id === "string" ? id : null;
}

function graphDegrees(nodes: Array<Record<string, unknown>>, edges: unknown[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of nodes) {
    if (typeof node.id === "string") degrees.set(node.id, 0);
  }
  for (const edge of edges) {
    const rec = asRecord(edge);
    const source = edgeEndpoint(rec.source);
    const target = edgeEndpoint(rec.target);
    if (source === null || target === null || !degrees.has(source) || !degrees.has(target)) continue;
    degrees.set(source, degrees.get(source)! + 1);
    degrees.set(target, degrees.get(target)! + 1);
  }
  return degrees;
}

function hasDerivationMethod(edge: Record<string, unknown>, derivationMethod: string): boolean {
  const value = edge.derivation_method ?? edge.derivation_methods;
  if (typeof value === "string") return value === derivationMethod;
  return Array.isArray(value) && value.includes(derivationMethod);
}

function graphDegreesByDerivation(nodes: Array<Record<string, unknown>>, edges: unknown[], derivationMethod: string): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of nodes) {
    if (typeof node.id === "string") degrees.set(node.id, 0);
  }
  for (const edge of edges) {
    const rec = asRecord(edge);
    if (!hasDerivationMethod(rec, derivationMethod)) continue;
    const source = edgeEndpoint(rec.source);
    const target = edgeEndpoint(rec.target);
    if (source === null || target === null || !degrees.has(source) || !degrees.has(target)) continue;
    degrees.set(source, degrees.get(source)! + 1);
    degrees.set(target, degrees.get(target)! + 1);
  }
  return degrees;
}

function graphNeighbors(nodes: Array<Record<string, unknown>>, edges: unknown[]): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (typeof node.id === "string") neighbors.set(node.id, new Set());
  }
  for (const edge of edges) {
    const rec = asRecord(edge);
    const source = edgeEndpoint(rec.source);
    const target = edgeEndpoint(rec.target);
    if (source === null || target === null || !neighbors.has(source) || !neighbors.has(target)) continue;
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
  }
  return neighbors;
}

function nodeType(node: Record<string, unknown>): string | null {
  const value = node.node_type ?? node.type;
  return typeof value === "string" && value.trim() ? value : null;
}

export function computeGraphCitationSignatureFromJson(graph: unknown): string {
  const projection: Record<string, unknown[]> = {};
  for (const node of graphNodes(graph)) {
    const id = typeof node.id === "string" ? node.id : null;
    const citations = node.citations;
    if (!id || !Array.isArray(citations) || citations.length === 0) continue;
    projection[id] = citations;
  }
  const canonical = Object.keys(projection).sort().map((id) => [id, projection[id]] as const);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function evaluateTargetShape(target: NormalizedQualityTarget, checks: QualityQaCheck[]): void {
  for (const issue of validateQualityTarget(target)) {
    add(checks, true, "target.validate", issue);
  }
}

function evaluateDataOnlyChromeTarget(
  target: NormalizedQualityTarget,
  bundleDir: string,
  checks: QualityQaCheck[],
): void {
  if (!target.publication.data_only_chrome) return;
  const referencePath = target.publication.resolvedChromeReferencePath;
  if (!referencePath) return;
  add(
    checks,
    resolve(bundleDir) === resolve(referencePath),
    "publication.chrome_reference_path",
    "chrome reference path must not resolve to the evaluated bundle path",
    { actual: referencePath },
  );
  add(
    checks,
    !existsSync(referencePath) || !statSync(referencePath).isDirectory(),
    "publication.chrome_reference_path.present",
    "chrome reference path must exist as a directory",
    { actual: referencePath },
  );
}

function evaluateManifest(
  target: NormalizedQualityTarget,
  bundleDir: string,
  manifest: ResolvedTargetManifest | null | undefined,
  targetHash: string,
  checks: QualityQaCheck[],
): string | null {
  if (!manifest) {
    add(
      checks,
      target.publication.require_resolved_manifest,
      "manifest.required",
      "resolved target manifest is required",
    );
    return null;
  }
  const manifestHash = sortedJsonHash(manifest);
  add(checks, manifest.schema !== RESOLVED_TARGET_MANIFEST_SCHEMA, "manifest.schema", "manifest schema must match", {
    expected: RESOLVED_TARGET_MANIFEST_SCHEMA,
    actual: manifest.schema,
  });
  add(checks, manifest.target_id !== target.id, "manifest.target_id", "manifest target_id must match selected target", {
    expected: target.id,
    actual: manifest.target_id,
  });
  add(
    checks,
    manifest.target_hash !== targetHash,
    "manifest.target_hash",
    "manifest target_hash must match current target config",
    { expected: targetHash, actual: manifest.target_hash ?? null },
  );

  const citationExtraction = manifest.resolved_policy?.citations?.extraction;
  const expectedExtraction = target.citations.extraction;
  add(
    checks,
    citationExtraction?.mode !== expectedExtraction.mode,
    "manifest.citations.extraction.mode",
    "manifest citation extraction mode must match target",
    { expected: expectedExtraction.mode, actual: citationExtraction?.mode ?? null },
  );

  if (expectedExtraction.require_producer_proof) {
    const contract = citationExtraction?.contract;
    if (!contract) {
      add(checks, true, "manifest.citations.contract", "structured citation extraction contract is required");
    } else {
      for (const issue of validateCitationExtractionContractForTarget(target, contract)) {
        add(checks, true, "manifest.citations.contract", issue);
      }
      const hash = sortedJsonHash(contract);
      add(
        checks,
        citationExtraction?.contract_hash !== hash,
        "manifest.citations.contract_hash",
        "manifest contract hash must match canonical contract",
        { expected: hash, actual: citationExtraction?.contract_hash ?? null },
      );
      add(
        checks,
        contract.schema !== CITATION_EXTRACTION_CONTRACT_SCHEMA,
        "manifest.citations.contract_schema",
        "manifest contract schema must be structured citation contract",
      );
    }
    add(
      checks,
      citationExtraction?.assembly?.same_entity_merge !== "union_by_citation_identity",
      "manifest.citations.assembly",
      "citation assembly must union same-entity citations",
      { expected: "union_by_citation_identity", actual: citationExtraction?.assembly?.same_entity_merge ?? null },
    );
  }

  const units = manifest.extraction_units ?? [];
  if (expectedExtraction.require_batch_coverage) {
    add(checks, units.length === 0, "manifest.extraction_units.present", "extraction units are required");
    for (const unit of units) {
      const badMode = unit.citation_mode !== expectedExtraction.mode;
      add(checks, badMode, `manifest.extraction_units.${unit.id}.mode`, "extraction unit citation mode must match target", {
        expected: expectedExtraction.mode,
        actual: unit.citation_mode ?? null,
      });
      const badHash = !unit.contract_hash || !expectedExtraction.allowed_contract_hashes.includes(unit.contract_hash);
      add(checks, badHash, `manifest.extraction_units.${unit.id}.contract_hash`, "extraction unit contract hash must be allowlisted", {
        actual: unit.contract_hash ?? null,
      });
    }
  }

  for (const rel of artifactPathFor(target)) {
    const artifact = manifest.artifacts?.[rel];
    if (!artifact) {
      add(checks, true, `manifest.artifacts.${rel}.present`, "required artifact provenance is missing");
      continue;
    }
    for (const field of ["bundle_path", "source_path", "source_kind", "sha256"] as const) {
      add(
        checks,
        typeof artifact[field] !== "string" || artifact[field].length === 0,
        `manifest.artifacts.${rel}.${field}`,
        `artifact ${field} is required`,
      );
    }
    const denied = target.publication.deny_source_path_patterns.some((pattern) =>
      globDenyMatch(pattern, artifact.source_path),
    );
    add(checks, denied, `manifest.artifacts.${rel}.source_path`, "artifact source path is denied", {
      actual: artifact.source_path,
    });
    const bundlePath = join(bundleDir, rel);
    if (existsSync(bundlePath) && statSync(bundlePath).isFile()) {
      const actualHash = sha256File(bundlePath);
      add(
        checks,
        normalizeSha(artifact.sha256) !== actualHash,
        `manifest.artifacts.${rel}.sha256`,
        "artifact hash must match bundle bytes",
        { expected: normalizeSha(artifact.sha256), actual: actualHash },
      );
    }
  }

  return manifestHash;
}

function evaluateGraph(target: NormalizedQualityTarget, graph: unknown | null, checks: QualityQaCheck[]): void {
  if (!graph) {
    add(checks, true, "graph.present", "graph.json is required");
    return;
  }
  const nodes = graphNodes(graph);
  const edges = graphEdges(graph);
  if (target.graph.min_nodes !== null) {
    add(checks, nodes.length < target.graph.min_nodes, "graph.min_nodes", "graph node count must meet target", {
      expected: `>= ${target.graph.min_nodes}`,
      actual: nodes.length,
    });
  }
  if (target.graph.min_edges !== null) {
    add(checks, edges.length < target.graph.min_edges, "graph.min_edges", "graph edge count must meet target", {
      expected: `>= ${target.graph.min_edges}`,
      actual: edges.length,
    });
  }
  const nodeIds = new Set(nodes.map((node) => typeof node.id === "string" ? node.id : null).filter((id): id is string => id !== null));
  const danglingEdges = edges
    .map((edge) => {
      const rec = asRecord(edge);
      return {
        source: edgeEndpoint(rec.source),
        target: edgeEndpoint(rec.target),
        relation: typeof rec.relation === "string" ? rec.relation : undefined,
      };
    })
    .filter((edge) => edge.source === null || edge.target === null || !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
  add(
    checks,
    danglingEdges.length > 0,
    "graph.edge_endpoints_present",
    "edge endpoints must resolve to graph nodes",
    { actual: { count: danglingEdges.length, examples: danglingEdges.slice(0, 20) } },
  );
  if (target.graph.max_missing_descriptions !== null) {
    const missing = nodes.filter((node) => typeof node.description !== "string" || !node.description.trim()).length;
    add(
      checks,
      missing > target.graph.max_missing_descriptions,
      "graph.max_missing_descriptions",
      "missing descriptions must be within target",
      { expected: `<= ${target.graph.max_missing_descriptions}`, actual: missing },
    );
  }
  if (target.graph.max_orphan_nodes !== null) {
    const degrees = graphDegrees(nodes, edges);
    const orphanIds = nodes
      .map((node) => typeof node.id === "string" ? node.id : null)
      .filter((id): id is string => id !== null && (degrees.get(id) ?? 0) === 0);
    add(
      checks,
      orphanIds.length > target.graph.max_orphan_nodes,
      "graph.max_orphan_nodes",
      "orphan node count must be within target",
      { expected: `<= ${target.graph.max_orphan_nodes}`, actual: { count: orphanIds.length, examples: orphanIds.slice(0, 20) } },
    );
  }
  if (target.graph.forbidden_node_id_patterns.length > 0) {
    const patterns = target.graph.forbidden_node_id_patterns.flatMap((pattern) => {
      try {
        return [new RegExp(pattern)];
      } catch {
        return [];
      }
    });
    const offenders = nodes
      .map((node) => typeof node.id === "string" ? node.id : null)
      .filter((id): id is string => id !== null && patterns.some((pattern) => pattern.test(id)));
    add(
      checks,
      offenders.length > 0,
      "graph.forbidden_node_id_patterns",
      "node ids must not match forbidden patterns",
      { expected: target.graph.forbidden_node_id_patterns, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
    );
  }
  if (target.graph.forbidden_source_path_patterns.length > 0) {
    const offenders = nodes
      .map((node) => ({
        id: typeof node.id === "string" ? node.id : null,
        source_file: typeof node.source_file === "string" ? node.source_file : null,
      }))
      .filter((entry) =>
        entry.id !== null &&
        entry.source_file !== null &&
        target.graph.forbidden_source_path_patterns.some((pattern) => globDenyMatch(pattern, entry.source_file!))
      );
    add(
      checks,
      offenders.length > 0,
      "graph.forbidden_source_path_patterns",
      "node source paths must not match forbidden patterns",
      { expected: target.graph.forbidden_source_path_patterns, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
    );
  }
  if (target.graph.allowed_node_types.length > 0) {
    const allowed = new Set(target.graph.allowed_node_types);
    const offenders = nodes
      .map((node) => ({
        id: typeof node.id === "string" ? node.id : null,
        type: nodeType(node),
      }))
      .filter((entry) => entry.id !== null && (entry.type === null || !allowed.has(entry.type)));
    add(
      checks,
      offenders.length > 0,
      "graph.allowed_node_types",
      "node types must be in the allowed target set",
      { expected: target.graph.allowed_node_types, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
    );
  }
  if (Object.keys(target.graph.min_degree_by_type).length > 0) {
    const degrees = graphDegrees(nodes, edges);
    for (const [type, minDegree] of Object.entries(target.graph.min_degree_by_type)) {
      const offenders = nodes
        .map((node) => ({
          id: typeof node.id === "string" ? node.id : null,
          label: typeof node.label === "string" ? node.label : undefined,
          degree: typeof node.id === "string" ? (degrees.get(node.id) ?? 0) : 0,
          type: nodeType(node),
        }))
        .filter((entry) => entry.id !== null && entry.type === type && entry.degree < minDegree);
      add(
        checks,
        offenders.length > 0,
        `graph.min_degree_by_type.${type}`,
        "node degree by type must meet target",
        { expected: `>= ${minDegree}`, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
      );
    }
  }
  if (Object.keys(target.graph.max_degree_by_type).length > 0) {
    const degrees = graphDegrees(nodes, edges);
    for (const [type, maxDegree] of Object.entries(target.graph.max_degree_by_type)) {
      const offenders = nodes
        .map((node) => ({
          id: typeof node.id === "string" ? node.id : null,
          label: typeof node.label === "string" ? node.label : undefined,
          degree: typeof node.id === "string" ? (degrees.get(node.id) ?? 0) : 0,
          type: nodeType(node),
        }))
        .filter((entry) => entry.id !== null && entry.type === type && entry.degree > maxDegree);
      add(
        checks,
        offenders.length > 0,
        `graph.max_degree_by_type.${type}`,
        "node degree by type must not exceed target",
        { expected: `<= ${maxDegree}`, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
      );
    }
  }
  if (Object.keys(target.graph.max_degree_by_type_and_derivation).length > 0) {
    for (const [type, derivationRules] of Object.entries(target.graph.max_degree_by_type_and_derivation)) {
      for (const [derivationMethod, maxDegree] of Object.entries(derivationRules)) {
        const degrees = graphDegreesByDerivation(nodes, edges, derivationMethod);
        const offenders = nodes
          .map((node) => ({
            id: typeof node.id === "string" ? node.id : null,
            label: typeof node.label === "string" ? node.label : undefined,
            degree: typeof node.id === "string" ? (degrees.get(node.id) ?? 0) : 0,
            type: nodeType(node),
          }))
          .filter((entry) => entry.id !== null && entry.type === type && entry.degree > maxDegree);
        add(
          checks,
          offenders.length > 0,
          `graph.max_degree_by_type_and_derivation.${type}.${derivationMethod}`,
          "node degree by type and derivation method must not exceed target",
          { expected: `<= ${maxDegree}`, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
        );
      }
    }
  }
  if (Object.keys(target.graph.required_neighbor_ids_by_node).length > 0) {
    const neighbors = graphNeighbors(nodes, edges);
    for (const [nodeId, requiredIds] of Object.entries(target.graph.required_neighbor_ids_by_node)) {
      const actualNeighbors = neighbors.get(nodeId) ?? new Set<string>();
      const missing = requiredIds.filter((requiredId) => !actualNeighbors.has(requiredId));
      add(
        checks,
        !neighbors.has(nodeId) || missing.length > 0,
        `graph.required_neighbor_ids_by_node.${nodeId}`,
        "node must be connected to required neighbor ids",
        {
          expected: requiredIds,
          actual: {
            node_present: neighbors.has(nodeId),
            missing,
          },
        },
      );
    }
  }
  if (target.graph.forbidden_edges.length > 0) {
    const offenders: Array<{ source: string; target: string; relation: string | null }> = [];
    for (const edge of edges) {
      const rec = asRecord(edge);
      const source = edgeEndpoint(rec.source);
      const targetId = edgeEndpoint(rec.target);
      const relation = typeof rec.relation === "string" ? rec.relation : null;
      if (source === null || targetId === null) continue;
      const matchesRule = target.graph.forbidden_edges.some((rule) => {
        const endpointsMatch =
          (source === rule.source && targetId === rule.target) ||
          (source === rule.target && targetId === rule.source);
        const relationMatches = rule.relation === null || relation === rule.relation;
        return endpointsMatch && relationMatches;
      });
      if (matchesRule) offenders.push({ source, target: targetId, relation });
    }
    add(
      checks,
      offenders.length > 0,
      "graph.forbidden_edges",
      "graph must not contain forbidden edges",
      { expected: target.graph.forbidden_edges, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
    );
  }
}

function evaluateScene(target: NormalizedQualityTarget, scene: unknown | null, checks: QualityQaCheck[]): void {
  const rules = target.scene.forbidden_shape_by_type;
  if (Object.keys(rules).length === 0) return;
  if (!scene) {
    add(checks, true, "scene.present", "scene.json is required when scene shape targets are configured");
    return;
  }
  const nodes = graphNodes(scene);
  for (const [type, forbiddenShapes] of Object.entries(rules)) {
    const forbidden = new Set(forbiddenShapes);
    const offenders = nodes
      .map((node) => ({
        id: typeof node.id === "string" ? node.id : null,
        label: typeof node.label === "string" ? node.label : undefined,
        type: nodeType(node),
        shape: typeof node.shape === "string" ? node.shape.trim().toLowerCase() : null,
      }))
      .filter((entry) => entry.id !== null && entry.type === type && entry.shape !== null && forbidden.has(entry.shape));
    add(
      checks,
      offenders.length > 0,
      `scene.forbidden_shape_by_type.${type}`,
      "scene node shapes must not use forbidden glyphs for this type",
      { expected: { forbidden: forbiddenShapes }, actual: { count: offenders.length, examples: offenders.slice(0, 20) } },
    );
  }
}

function evaluateCitations(
  target: NormalizedQualityTarget,
  graph: unknown | null,
  sidecar: unknown | null,
  checks: QualityQaCheck[],
): void {
  if (!graph) return;
  const nodes = graphNodes(graph);
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  for (const [nodeId, min] of Object.entries(target.citations.min_count_by_node)) {
    const node = nodeById.get(nodeId);
    const count = typeof node?.citation_count === "number" ? node.citation_count : null;
    add(checks, count === null || count < min, `citations.min_count_by_node.${nodeId}`, "citation count must meet target", {
      expected: `>= ${min}`,
      actual: count,
    });
  }

  for (const node of nodes) {
    const id = typeof node.id === "string" ? node.id : null;
    if (!id) continue;
    const inline = Array.isArray(node.citations) ? node.citations : [];
    const count = typeof node.citation_count === "number" ? node.citation_count : 0;
    add(
      checks,
      count < inline.length,
      `citations.count_gte_inline.${id}`,
      "citation_count must not be less than inline citations length",
      { actual: { count, inline: inline.length } },
    );
    if (target.citations.inline.mode === "top_k") {
      add(
        checks,
        inline.length > target.citations.inline.top_k,
        `citations.inline.top_k.${id}`,
        "inline citations must respect top_k",
        { expected: `<= ${target.citations.inline.top_k}`, actual: inline.length },
      );
    }
  }

  if (!(target.citations.display === "full" && target.citations.require_sidecar)) return;
  if (!sidecar) {
    add(checks, true, "citations.sidecar.present", "ontology/citations.json is required for full citation display");
    return;
  }
  const sidecarRecord = asRecord(sidecar);
  add(
    checks,
    sidecarRecord.schema !== "graphify_ontology_citations_v1",
    "citations.sidecar.schema",
    "citation sidecar schema must match",
    { expected: "graphify_ontology_citations_v1", actual: sidecarRecord.schema ?? null },
  );
  const expectedSignature = computeGraphCitationSignatureFromJson(graph);
  add(
    checks,
    sidecarRecord.graph_signature !== expectedSignature,
    "citations.sidecar.graph_signature",
    "citation sidecar graph_signature must match graph inline citations",
    { expected: expectedSignature, actual: sidecarRecord.graph_signature ?? null },
  );
  const sidecarNodes = asRecord(sidecarRecord.nodes);
  for (const node of nodes) {
    const id = typeof node.id === "string" ? node.id : null;
    const count = typeof node.citation_count === "number" ? node.citation_count : 0;
    if (!id || count <= 0) continue;
    const entry = asRecord(sidecarNodes[id]);
    const citations = entry.citations;
    const actualCount = typeof entry.count === "number" ? entry.count : null;
    const actualLength = Array.isArray(citations) ? citations.length : null;
    add(checks, !entry || actualCount !== count || actualLength !== count, `citations.sidecar.node.${id}`, "sidecar entry must match citation_count", {
      expected: count,
      actual: { count: actualCount, citations_length: actualLength },
    });
  }
}

function candidateArrayFromReconciliation(reconciliation: unknown, graph: unknown | null, checks: QualityQaCheck[]): Array<Record<string, unknown>> {
  const rec = asRecord(reconciliation);
  if (rec.schema === "graphify_ontology_reconciliation_candidates_v1") {
    const candidates = Array.isArray(rec.candidates) ? rec.candidates.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
    add(
      checks,
      typeof rec.candidate_count === "number" && rec.candidate_count !== candidates.length,
      "reconciliation.queue.count_consistency",
      "candidate_count must match candidates length",
      { expected: rec.candidate_count, actual: candidates.length },
    );
    return candidates;
  }
  if (rec.schema === "graphify_ontology_reconciliation_candidates_response_v1") {
    const items = Array.isArray(rec.items) ? rec.items.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
    const complete = rec.offset === 0 && rec.total === items.length && rec.stale === false;
    add(
      checks,
      !complete,
      "reconciliation.response.complete",
      "publication reconciliation response must be complete, unpaginated, and non-stale",
      { expected: { offset: 0, items_length: rec.total, stale: false }, actual: { offset: rec.offset, items_length: items.length, total: rec.total, stale: rec.stale } },
    );
    const graphHash = asRecord(graph).topology_signature;
    if (typeof graphHash === "string" && typeof rec.graph_hash === "string") {
      add(
        checks,
        rec.graph_hash !== graphHash,
        "reconciliation.response.graph_hash",
        "reconciliation response graph_hash must match graph",
        { expected: graphHash, actual: rec.graph_hash },
      );
    }
    return complete ? items : [];
  }
  add(checks, true, "reconciliation.schema", "reconciliation candidates schema is unsupported", {
    actual: rec.schema ?? null,
  });
  return [];
}

function evaluateReconciliation(
  target: NormalizedQualityTarget,
  graph: unknown | null,
  reconciliation: unknown | null,
  checks: QualityQaCheck[],
): void {
  if (!reconciliation) {
    if (target.reconciliation.min_candidates !== null && target.reconciliation.min_candidates > 0) {
      add(checks, true, "reconciliation.present", "reconciliation-candidates.json is required");
    }
    return;
  }
  const candidates = candidateArrayFromReconciliation(reconciliation, graph, checks);
  if (target.reconciliation.min_candidates !== null) {
    add(
      checks,
      candidates.length < target.reconciliation.min_candidates,
      "reconciliation.min_candidates",
      "reconciliation candidate count must meet target",
      { expected: `>= ${target.reconciliation.min_candidates}`, actual: candidates.length },
    );
  }
  if (!graph) return;
  const nodes = graphNodes(graph);
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  for (const candidate of candidates) {
    const id = typeof candidate.id === "string" ? candidate.id : "unknown";
    const candidateId = typeof candidate.candidate_id === "string" ? candidate.candidate_id : null;
    const canonicalId = typeof candidate.canonical_id === "string" ? candidate.canonical_id : null;
    const endpointsPresent = Boolean(candidateId && canonicalId && nodeById.has(candidateId) && nodeById.has(canonicalId));
    add(checks, !endpointsPresent, `reconciliation.candidate.${id}.endpoints`, "candidate endpoints must resolve in graph");
    if (target.reconciliation.require_groupable_by_type && endpointsPresent) {
      const leftType = nodeType(nodeById.get(candidateId!)!);
      const rightType = nodeType(nodeById.get(canonicalId!)!);
      add(
        checks,
        !leftType || !rightType,
        `reconciliation.candidate.${id}.types`,
        "candidate endpoints must be groupable by type",
        { actual: { candidate_type: leftType, canonical_type: rightType } },
      );
    }
  }
}

function artifactHashes(bundleDir: string, rels: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of [...rels].sort()) {
    const path = join(bundleDir, rel);
    if (existsSync(path) && statSync(path).isFile()) out[rel] = sha256File(path);
  }
  return out;
}

export function evaluateQualityBundle(options: EvaluateQualityBundleOptions): QualityQaReport {
  const checks: QualityQaCheck[] = [];
  const { target, bundleDir, manifest = null } = options;
  const targetHash = options.targetHash ?? hashQualityTarget(target);
  evaluateTargetShape(target, checks);
  evaluateDataOnlyChromeTarget(target, bundleDir, checks);
  const manifestHash = evaluateManifest(target, bundleDir, manifest, targetHash, checks);
  const graph = loadBundleJson(bundleDir, "graph.json");
  const scene = loadBundleJson(bundleDir, "scene.json");
  const sidecar = loadBundleJson(bundleDir, "ontology/citations.json");
  const reconciliation = loadBundleJson(bundleDir, "reconciliation-candidates.json");
  evaluateGraph(target, graph, checks);
  evaluateScene(target, scene, checks);
  evaluateCitations(target, graph, sidecar, checks);
  evaluateReconciliation(target, graph, reconciliation, checks);

  const chrome = target.publication.data_only_chrome && target.publication.resolvedChromeReferencePath
    ? computeDataOnlyChromeHashes(bundleDir, target.publication.resolvedChromeReferencePath, target.publication.data_allowlist)
    : undefined;
  const failed = checks.filter((check) => check.severity === "error").length;
  const warned = checks.filter((check) => check.severity === "warning").length;
  const passed = checks.filter((check) => check.severity === "info").length;
  return {
    schema: QA_REPORT_SCHEMA,
    target_id: target.id,
    target_hash: targetHash,
    manifest_hash: manifestHash,
    bundle_path: bundleDir,
    artifact_hashes: artifactHashes(bundleDir, target.publication.data_allowlist),
    ...(chrome ? { chrome } : {}),
    status: failed > 0 ? "failed" : "passed",
    summary: { passed, failed, warned },
    checks,
  };
}

export function validatePrecomputedQaReportBinding(
  report: QualityQaReport,
  options: EvaluateQualityBundleOptions,
): QualityQaCheck[] {
  const checks: QualityQaCheck[] = [];
  const current = evaluateQualityBundle(options);
  add(checks, report.target_hash !== current.target_hash, "qa_report.target_hash", "QA report target hash must match", {
    expected: current.target_hash,
    actual: report.target_hash,
  });
  add(checks, report.manifest_hash !== current.manifest_hash, "qa_report.manifest_hash", "QA report manifest hash must match", {
    expected: current.manifest_hash,
    actual: report.manifest_hash,
  });
  add(checks, resolve(report.bundle_path) !== resolve(current.bundle_path), "qa_report.bundle_path", "QA report bundle_path must match", {
    expected: current.bundle_path,
    actual: report.bundle_path,
  });
  add(checks, canonicalJson(report.artifact_hashes) !== canonicalJson(current.artifact_hashes), "qa_report.artifact_hashes", "QA report artifact hashes must match");
  if (current.chrome) {
    add(
      checks,
      canonicalJson(report.chrome ?? null) !== canonicalJson(current.chrome),
      "qa_report.chrome",
      "QA report chrome hashes must match staged bundle and current chrome reference",
      { expected: current.chrome, actual: report.chrome ?? null },
    );
  }
  return checks;
}
