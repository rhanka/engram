import type { NormalizedOntologyProfile, NormalizedProjectConfig } from "./types.js";
import type { ProfileState } from "./configured-dataprep.js";

export interface ProfileReportGraphData {
  nodes?: unknown[];
  links?: unknown[];
}

export interface ProfileReportContext {
  profileState: ProfileState;
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
  graph?: ProfileReportGraphData;
}

export function buildProfileReport(context: ProfileReportContext): string {
  const graphNodes = Array.isArray(context.graph?.nodes) ? context.graph.nodes.length : 0;
  const graphLinks = Array.isArray(context.graph?.links) ? context.graph.links.length : 0;
  const registryLines = Object.entries(context.profileState.registry_counts)
    .map(([registryId, count]) => `- ${registryId}: ${count} records`)
    .join("\n");

  return [
    "# Graphify Profile Report",
    "",
    `Profile: ${context.profile.id} ${context.profile.version}`,
    `Profile hash: ${context.profile.profile_hash}`,
    "",
    "## Dataprep State",
    `- Semantic files: ${context.profileState.semantic_file_count}`,
    `- Registry nodes: ${context.profileState.registry_node_count}`,
    `- Transcripts: ${context.profileState.transcript_count}`,
    `- PDF artifacts: ${context.profileState.pdf_artifact_count}`,
    "",
    "## Registries",
    registryLines || "- No registries",
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
