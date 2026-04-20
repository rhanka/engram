import type { NormalizedOntologyProfile, NormalizedProjectConfig } from "./types.js";
import type { ProfileValidationResult } from "./profile-validate.js";
import type { ProfileState } from "./configured-dataprep.js";
import type { RegistryRecord } from "./types.js";
import { relative } from "node:path";

export interface ProfileReportGraphData {
  nodes?: unknown[];
  links?: unknown[];
}

export interface ProfileReportPdfArtifact {
  filePath?: string;
  markdownPath?: string;
  ocrRequired?: boolean;
  shouldOcr?: boolean;
}

export interface ProfileReportContext {
  profileState: ProfileState;
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
  graph?: ProfileReportGraphData;
  registries?: Record<string, RegistryRecord[]>;
  validationResult?: ProfileValidationResult;
  pdfArtifacts?: ProfileReportPdfArtifact[];
}

function rel(config: NormalizedProjectConfig | undefined, path: string): string {
  if (!config) return path;
  const value = relative(config.configDir, path).replace(/\\/g, "/");
  return value || ".";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function graphNodes(context: ProfileReportContext): Array<Record<string, unknown>> {
  return Array.isArray(context.graph?.nodes)
    ? context.graph.nodes.filter((node): node is Record<string, unknown> =>
      typeof node === "object" && node !== null && !Array.isArray(node))
    : [];
}

function graphLinks(context: ProfileReportContext): Array<Record<string, unknown>> {
  return Array.isArray(context.graph?.links)
    ? context.graph.links.filter((link): link is Record<string, unknown> =>
      typeof link === "object" && link !== null && !Array.isArray(link))
    : [];
}

function projectConfigSection(context: ProfileReportContext): string[] {
  const config = context.projectConfig;
  if (!config) {
    return ["## Project Config Summary", "- Project config artifact unavailable."];
  }
  return [
    "## Project Config Summary",
    `- config: ${rel(config, config.sourcePath)}`,
    `- corpus: ${config.inputs.corpus.map((path) => rel(config, path)).join(", ") || "none"}`,
    `- generated: ${config.inputs.generated.map((path) => rel(config, path)).join(", ") || "none"}`,
    `- excluded: ${config.inputs.exclude.map((path) => rel(config, path)).join(", ") || "none"}`,
    `- state_dir: ${rel(config, config.outputs.state_dir)}`,
  ];
}

function registryCoverageSection(context: ProfileReportContext): string[] {
  const nodes = graphNodes(context);
  const lines = ["## Registry Coverage"];
  const orphanLines: string[] = [];
  for (const [registryId, count] of Object.entries(context.profileState.registry_counts)) {
    const records = context.registries?.[registryId] ?? [];
    const attachedIds = new Set(
      nodes
        .filter((node) => stringValue(node.registry_id) === registryId)
        .map((node) => stringValue(node.registry_record_id))
        .filter(Boolean),
    );
    const total = records.length || count;
    const attached = records.length > 0
      ? records.filter((record) => attachedIds.has(record.id)).length
      : attachedIds.size;
    lines.push(`- ${registryId}: ${attached}/${total} attached`);
    for (const record of records.filter((item) => !attachedIds.has(item.id)).slice(0, 10)) {
      orphanLines.push(`- ${record.label} (${registryId}:${record.id})`);
    }
  }
  return [
    ...lines,
    "",
    "### Orphan Registry Records",
    ...(orphanLines.length > 0 ? orphanLines : ["- None detected."]),
  ];
}

function unattachedEntitiesSection(context: ProfileReportContext): string[] {
  const nodes = graphNodes(context);
  const lines = nodes
    .filter((node) => {
      const nodeType = stringValue(node.node_type);
      return Boolean(nodeType && context.profile.node_types[nodeType]?.registry && !stringValue(node.registry_record_id));
    })
    .slice(0, 20)
    .map((node) => `- ${stringValue(node.label) || stringValue(node.id)} (${stringValue(node.node_type)})`);
  return [
    "## Extracted Entities Without Registry Attachment",
    ...(lines.length > 0 ? lines : ["- None detected."]),
  ];
}

function invalidRelationsSection(context: ProfileReportContext): string[] {
  const issueLines = (context.validationResult?.issues ?? [])
    .filter((issue) => issue.code.includes("relation"))
    .map((issue) => `- ${issue.severity} ${issue.code}: ${issue.message}`);
  const ambiguousLines = graphLinks(context)
    .filter((link) => stringValue(link.confidence) === "AMBIGUOUS")
    .map((link) =>
      `- AMBIGUOUS ${stringValue(link.relation)}: ${stringValue(link.source)} -> ${stringValue(link.target)}`);
  return [
    "## Invalid Or Ambiguous Relations",
    ...((issueLines.length > 0 || ambiguousLines.length > 0) ? [...issueLines, ...ambiguousLines] : ["- None detected."]),
  ];
}

function highDegreeSection(context: ProfileReportContext): string[] {
  const nodes = graphNodes(context);
  const labels = new Map(nodes.map((node) => [stringValue(node.id), stringValue(node.label) || stringValue(node.id)]));
  const degree = new Map<string, number>();
  for (const link of graphLinks(context)) {
    const source = stringValue(link.source);
    const target = stringValue(link.target);
    if (source) degree.set(source, (degree.get(source) ?? 0) + 1);
    if (target) degree.set(target, (degree.get(target) ?? 0) + 1);
  }
  const lines = [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, count]) => `- ${labels.get(nodeId) ?? nodeId}: ${count} links`);
  return ["## High-Degree Nodes", ...(lines.length > 0 ? lines : ["- None detected."])];
}

function lowEvidenceSection(context: ProfileReportContext): string[] {
  const counts = new Map<string, { inferred: number; ambiguous: number }>();
  for (const link of graphLinks(context)) {
    const relation = stringValue(link.relation) || "unknown";
    const entry = counts.get(relation) ?? { inferred: 0, ambiguous: 0 };
    if (stringValue(link.confidence) === "INFERRED") entry.inferred += 1;
    if (stringValue(link.confidence) === "AMBIGUOUS") entry.ambiguous += 1;
    counts.set(relation, entry);
  }
  const lines = [...counts.entries()]
    .filter(([, count]) => count.inferred > 0 || count.ambiguous > 0)
    .sort((a, b) => (b[1].inferred + b[1].ambiguous) - (a[1].inferred + a[1].ambiguous))
    .map(([relation, count]) => `- ${relation}: ${count.inferred} inferred, ${count.ambiguous} ambiguous`);
  return ["## Low-Evidence Relation Types", ...(lines.length > 0 ? lines : ["- None detected."])];
}

function humanReviewSection(context: ProfileReportContext): string[] {
  const lines = graphNodes(context)
    .filter((node) => ["candidate", "needs_review"].includes(stringValue(node.status)))
    .slice(0, 20)
    .map((node) => `- ${stringValue(node.label) || stringValue(node.id)} (${stringValue(node.status)})`);
  return ["## Human Review Candidates", ...(lines.length > 0 ? lines : ["- None detected."])];
}

function pdfOcrSection(context: ProfileReportContext): string[] {
  const artifacts = context.pdfArtifacts ?? [];
  if (artifacts.length === 0) return ["## PDF/OCR Sidecars", "- None recorded."];
  const lines = artifacts.map((artifact) => {
    const source = artifact.filePath ?? "unknown PDF";
    if (artifact.markdownPath) return `- ${source} -> ${artifact.markdownPath}`;
    if (artifact.ocrRequired || artifact.shouldOcr) return `- ${source} requires OCR`;
    return `- ${source}: no sidecar`;
  });
  return ["## PDF/OCR Sidecars", ...lines];
}

export function buildProfileReport(context: ProfileReportContext): string {
  const graphNodes = Array.isArray(context.graph?.nodes) ? context.graph.nodes.length : 0;
  const graphLinks = Array.isArray(context.graph?.links) ? context.graph.links.length : 0;

  return [
    "# Graphify Profile Report",
    "",
    ...projectConfigSection(context),
    "",
    "## Profile",
    `Profile: ${context.profile.id} ${context.profile.version}`,
    `Profile hash: ${context.profile.profile_hash}`,
    "",
    "## Dataprep State",
    `- Semantic files: ${context.profileState.semantic_file_count}`,
    `- Registry nodes: ${context.profileState.registry_node_count}`,
    `- Transcripts: ${context.profileState.transcript_count}`,
    `- PDF artifacts: ${context.profileState.pdf_artifact_count}`,
    "",
    ...registryCoverageSection(context),
    "",
    ...unattachedEntitiesSection(context),
    "",
    ...invalidRelationsSection(context),
    "",
    ...highDegreeSection(context),
    "",
    ...lowEvidenceSection(context),
    "",
    ...humanReviewSection(context),
    "",
    ...pdfOcrSection(context),
    "",
    "## Graph Snapshot",
    `- Nodes: ${graphNodes}`,
    `- Links: ${graphLinks}`,
    "",
    "## Compatibility",
    "- This report is additive and does not replace GRAPH_REPORT.md.",
    "- Profile mode remains generic and uses synthetic-safe ontology constraints only.",
    "",
  ].join("\n");
}
