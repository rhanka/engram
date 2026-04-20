const VALID_DENSITY = new Set(["low", "medium", "high"]);
const VALID_ROUTING_SIGNAL = new Set(["skip", "primary", "deep"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateImageCaption(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["caption must be an object"];
  if (value.schema !== "generic_image_caption_v1") issues.push("schema must be generic_image_caption_v1");
  if (typeof value.artifact_id !== "string" || value.artifact_id.trim().length === 0) {
    issues.push("artifact_id is required");
  }
  if (typeof value.summary !== "string" || value.summary.trim().length === 0) {
    issues.push("summary is required");
  }
  if (!isStringArray(value.visible_text)) issues.push("visible_text must be a string array");
  if (typeof value.visual_content_type !== "string" || value.visual_content_type.trim().length === 0) {
    issues.push("visual_content_type is required");
  }
  if (!VALID_DENSITY.has(String(value.semantic_density))) {
    issues.push("semantic_density must be one of low, medium, high");
  }
  if (!Array.isArray(value.entity_candidates)) issues.push("entity_candidates must be an array");
  if (!Array.isArray(value.relationship_candidates)) issues.push("relationship_candidates must be an array");
  if (!isStringArray(value.uncertainties)) issues.push("uncertainties must be a string array");
  if (!isRecord(value.provenance)) {
    issues.push("provenance is required");
  } else {
    if (typeof value.provenance.source_file !== "string" || value.provenance.source_file.trim().length === 0) {
      issues.push("provenance.source_file is required");
    }
    if (typeof value.provenance.image_path !== "string" || value.provenance.image_path.trim().length === 0) {
      issues.push("provenance.image_path is required");
    }
  }
  return issues;
}

export function validateImageRouting(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["routing must be an object"];
  if (value.schema !== "generic_image_routing_v1") issues.push("schema must be generic_image_routing_v1");
  if (typeof value.artifact_id !== "string" || value.artifact_id.trim().length === 0) {
    issues.push("artifact_id is required");
  }
  if (typeof value.visual_content_type !== "string" || value.visual_content_type.trim().length === 0) {
    issues.push("visual_content_type is required");
  }
  if (!VALID_ROUTING_SIGNAL.has(String(value.routing_signal))) {
    issues.push("routing_signal must be one of skip, primary, deep");
  }
  if (!isStringArray(value.reasons)) issues.push("reasons must be a string array");
  if (typeof value.requires_deep_reasoning !== "boolean") {
    issues.push("requires_deep_reasoning must be a boolean");
  }
  return issues;
}
