import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertAcceptedImageRoutingRules,
  calibrateImageRouting,
  loadImageRoutingLabels,
  loadImageRoutingRules,
  routeImageWithRules,
  writeImageRoutingCalibrationSamples,
} from "../src/image-routing-calibration.js";
import type { ImageDataprepManifest } from "../src/image-dataprep.js";

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

  it("writes deterministic stratified calibration samples from caption sidecars", () => {
    const root = makeTempDir();
    const captionsDir = join(root, "captions");
    const outDir = join(root, ".graphify", "calibration");
    mkdirSync(captionsDir, { recursive: true });
    const manifest: ImageDataprepManifest = {
      schema: "graphify_image_dataprep_manifest_v1",
      source_state_hash: "state",
      mode: "assistant",
      artifact_count: 3,
      generated_at: "2026-04-20T00:00:00.000Z",
      artifacts: [
        {
          id: "artifact-a",
          path: join(root, "a.png"),
          source_file: join(root, "manual.pdf"),
          source_page: 1,
          source_sidecar: join(root, "manual.md"),
          source_kind: "ocr_crop",
          mime_type: "image/png",
          sha256: "a",
        },
        {
          id: "artifact-b",
          path: join(root, "b.png"),
          source_file: join(root, "manual.pdf"),
          source_page: 2,
          source_sidecar: join(root, "manual.md"),
          source_kind: "ocr_crop",
          mime_type: "image/png",
          sha256: "b",
        },
        {
          id: "artifact-c",
          path: join(root, "c.png"),
          source_file: join(root, "manual.pdf"),
          source_page: 3,
          source_sidecar: join(root, "manual.md"),
          source_kind: "ocr_crop",
          mime_type: "image/png",
          sha256: "c",
        },
      ],
    };
    writeFileSync(join(captionsDir, "artifact-a.caption.json"), JSON.stringify({
      schema: "generic_image_caption_v1",
      artifact_id: "artifact-a",
      summary: "A dense flow.",
      visible_text: [],
      visual_content_type: "flow_diagram",
      semantic_density: "high",
      entity_candidates: [{ label: "A" }, { label: "B" }],
      relationship_candidates: [{ source_label: "A", target_label: "B" }],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "a.png" },
    }), "utf-8");
    writeFileSync(join(captionsDir, "artifact-b.caption.json"), JSON.stringify({
      schema: "generic_image_caption_v1",
      artifact_id: "artifact-b",
      summary: "A simple table.",
      visible_text: [],
      visual_content_type: "table",
      semantic_density: "medium",
      entity_candidates: [{ label: "C" }],
      relationship_candidates: [],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "b.png" },
    }), "utf-8");
    writeFileSync(join(captionsDir, "artifact-c.caption.json"), JSON.stringify({
      schema: "generic_image_caption_v1",
      artifact_id: "artifact-c",
      summary: "Another table.",
      visible_text: [],
      visual_content_type: "table",
      semantic_density: "medium",
      entity_candidates: [{ label: "D" }],
      relationship_candidates: [],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "c.png" },
    }), "utf-8");

    const result = writeImageRoutingCalibrationSamples({
      manifest,
      captionsDir,
      outputDir: outDir,
      runId: "run-1",
      maxSamples: 2,
    });

    expect(result.sampleCount).toBe(2);
    expect(existsSync(result.samplesPath)).toBe(true);
    const samples = JSON.parse(readFileSync(result.samplesPath, "utf-8")) as { samples: Array<{ artifact_id: string }> };
    expect(samples.samples.map((sample) => sample.artifact_id)).toEqual(["artifact-a", "artifact-b"]);
  });

  it("blocks production cascade when rules are not accepted", () => {
    expect(() => assertAcceptedImageRoutingRules({
      schema: "graphify_image_routing_rules_v1",
      decision: "pending_labels",
      routes: {},
    })).toThrow("accepted routing matrix");
  });
});
