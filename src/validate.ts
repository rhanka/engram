/**
 * Validate extraction JSON against the graphify schema before graph assembly.
 */

export const VALID_FILE_TYPES = new Set(["code", "document", "paper", "image", "rationale"]);
export const VALID_CONFIDENCES = new Set(["EXTRACTED", "INFERRED", "AMBIGUOUS"]);
export const REQUIRED_NODE_FIELDS = ["id", "label", "file_type", "source_file"] as const;
export const REQUIRED_EDGE_FIELDS = ["source", "target", "relation", "confidence", "source_file"] as const;

/**
 * Validate an extraction JSON dict against the graphify schema.
 * Returns a list of error strings - empty list means valid.
 */
export function validateExtraction(data: unknown): string[] {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["Extraction must be a JSON object"];
  }

  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  // Nodes
  if (!("nodes" in d)) {
    errors.push("Missing required key 'nodes'");
  } else if (!Array.isArray(d.nodes)) {
    errors.push("'nodes' must be a list");
  } else {
    for (let i = 0; i < d.nodes.length; i++) {
      const node = d.nodes[i] as Record<string, unknown>;
      if (typeof node !== "object" || node === null || Array.isArray(node)) {
        errors.push(`Node ${i} must be an object`);
        continue;
      }
      for (const field of REQUIRED_NODE_FIELDS) {
        if (!(field in node)) {
          errors.push(
            `Node ${i} (id=${JSON.stringify(node.id ?? "?")}) missing required field '${field}'`,
          );
        }
      }
      if ("file_type" in node && !VALID_FILE_TYPES.has(node.file_type as string)) {
        errors.push(
          `Node ${i} (id=${JSON.stringify(node.id ?? "?")}) has invalid file_type ` +
            `'${node.file_type}' - must be one of ${JSON.stringify([...VALID_FILE_TYPES].sort())}`,
        );
      }
    }
  }

  // Edges
  if (!("edges" in d)) {
    errors.push("Missing required key 'edges'");
  } else if (!Array.isArray(d.edges)) {
    errors.push("'edges' must be a list");
  } else {
    const nodeIds = new Set<string>();
    if (Array.isArray(d.nodes)) {
      for (const n of d.nodes) {
        if (typeof n === "object" && n !== null && "id" in n) {
          nodeIds.add((n as Record<string, unknown>).id as string);
        }
      }
    }

    for (let i = 0; i < d.edges.length; i++) {
      const edge = d.edges[i] as Record<string, unknown>;
      if (typeof edge !== "object" || edge === null || Array.isArray(edge)) {
        errors.push(`Edge ${i} must be an object`);
        continue;
      }
      for (const field of REQUIRED_EDGE_FIELDS) {
        if (!(field in edge)) {
          errors.push(`Edge ${i} missing required field '${field}'`);
        }
      }
      if ("confidence" in edge && !VALID_CONFIDENCES.has(edge.confidence as string)) {
        errors.push(
          `Edge ${i} has invalid confidence '${edge.confidence}' ` +
            `- must be one of ${JSON.stringify([...VALID_CONFIDENCES].sort())}`,
        );
      }
      if ("source" in edge && nodeIds.size > 0 && !nodeIds.has(edge.source as string)) {
        errors.push(`Edge ${i} source '${edge.source}' does not match any node id`);
      }
      if ("target" in edge && nodeIds.size > 0 && !nodeIds.has(edge.target as string)) {
        errors.push(`Edge ${i} target '${edge.target}' does not match any node id`);
      }
    }
  }

  return errors;
}

/** Raise an error with all validation errors if extraction is invalid. */
export function assertValid(data: unknown): void {
  const errors = validateExtraction(data);
  if (errors.length > 0) {
    const msg =
      `Extraction JSON has ${errors.length} error(s):\n` +
      errors.map((e) => `  • ${e}`).join("\n");
    throw new Error(msg);
  }
}
