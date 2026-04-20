import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  calibrateImageRouting,
  loadImageRoutingLabels,
  loadImageRoutingRules,
  routeImageWithRules,
} from "../src/image-routing-calibration.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-routing-calibration-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("image routing calibration", () => {
  it("loads project-owned routing labels and rules", () => {
    const root = makeTempDir();
    const labelsPath = join(root, "labels.yaml");
    const rulesPath = join(root, "rules.yaml");
    writeFileSync(labelsPath, [
      "schema: graphify_image_routing_labels_v1",
      "labels:",
      "  - artifact_id: a",
      "    label: deep_required",
      "    rationale: relationship-heavy visual",
      "",
    ].join("\n"));
    writeFileSync(rulesPath, [
      "schema: graphify_image_routing_rules_v1",
      "decision: accept_matrix",
      "routes:",
      "  deep:",
      "    visual_content_types: [flow_diagram]",
      "  primary:",
      "    visual_content_types: [simple_view]",
      "  skip:",
      "    visual_content_types: [blank]",
      "",
    ].join("\n"));

    expect(loadImageRoutingLabels(labelsPath).labels[0]).toMatchObject({
      artifact_id: "a",
      label: "deep_required",
    });
    expect(loadImageRoutingRules(rulesPath).decision).toBe("accept_matrix");
  });

  it("routes with deterministic rules instead of model-selected routes", () => {
    const route = routeImageWithRules(
      {
        schema: "graphify_image_routing_rules_v1",
        decision: "accept_matrix",
        routes: {
          deep: { visual_content_types: ["flow_diagram"] },
          primary: { visual_content_types: ["simple_view"] },
          skip: { visual_content_types: ["blank"] },
        },
      },
      {
        artifact_id: "a",
        visual_content_type: "flow_diagram",
        entity_count: 1,
        relationship_count: 1,
      },
    );

    expect(route.route).toBe("deep");
    expect(route.reasons).toContain("visual_content_type=flow_diagram matched deep");
  });

  it("accepts a matrix only when false_primary is zero and every sample is labeled", () => {
    const result = calibrateImageRouting({
      labels: {
        schema: "graphify_image_routing_labels_v1",
        labels: [
          { artifact_id: "a", label: "deep_required", rationale: "deep relation extraction required" },
          { artifact_id: "b", label: "primary_sufficient", rationale: "simple view" },
        ],
      },
      rules: {
        schema: "graphify_image_routing_rules_v1",
        decision: "accept_matrix",
        routes: {
          deep: { visual_content_types: ["flow_diagram"] },
          primary: { visual_content_types: ["simple_view"] },
        },
      },
      samples: [
        { artifact_id: "a", visual_content_type: "flow_diagram", entity_count: 2, relationship_count: 3 },
        { artifact_id: "b", visual_content_type: "simple_view", entity_count: 1, relationship_count: 0 },
      ],
    });

    expect(result.decision).toBe("accept_matrix");
    expect(result.metrics.false_primary).toBe(0);
    expect(result.metrics.false_deep).toBe(0);
  });

  it("returns revise_matrix when a deep label is routed to primary", () => {
    const result = calibrateImageRouting({
      labels: {
        schema: "graphify_image_routing_labels_v1",
        labels: [{ artifact_id: "a", label: "deep_useful_for_wiki", rationale: "relationship value" }],
      },
      rules: {
        schema: "graphify_image_routing_rules_v1",
        decision: "accept_matrix",
        routes: {
          primary: { visual_content_types: ["flow_diagram"] },
        },
      },
      samples: [{ artifact_id: "a", visual_content_type: "flow_diagram", entity_count: 2, relationship_count: 3 }],
    });

    expect(result.decision).toBe("revise_matrix");
    expect(result.metrics.false_primary).toBe(1);
  });

  it("returns pending_labels for missing or ambiguous labels", () => {
    const missing = calibrateImageRouting({
      labels: { schema: "graphify_image_routing_labels_v1", labels: [] },
      rules: { schema: "graphify_image_routing_rules_v1", decision: "accept_matrix", routes: {} },
      samples: [{ artifact_id: "a", visual_content_type: "diagram", entity_count: 1, relationship_count: 1 }],
    });
    const ambiguous = calibrateImageRouting({
      labels: {
        schema: "graphify_image_routing_labels_v1",
        labels: [{ artifact_id: "a", label: "ambiguous", rationale: "not enough evidence" }],
      },
      rules: { schema: "graphify_image_routing_rules_v1", decision: "accept_matrix", routes: {} },
      samples: [{ artifact_id: "a", visual_content_type: "diagram", entity_count: 1, relationship_count: 1 }],
    });

    expect(missing.decision).toBe("pending_labels");
    expect(ambiguous.decision).toBe("pending_labels");
  });
});
