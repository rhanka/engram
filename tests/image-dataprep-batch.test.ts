import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  exportImageDataprepBatchRequests,
  importImageDataprepBatchResults,
} from "../src/image-dataprep-batch.js";
import type { ImageDataprepManifest } from "../src/image-dataprep.js";
import type { ImageRoutingRulesFile } from "../src/image-routing-calibration.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-image-batch-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function manifest(root: string): ImageDataprepManifest {
  const image = join(root, "image.png");
  writeFileSync(image, "png", "utf-8");
  return {
    schema: "graphify_image_dataprep_manifest_v1",
    source_state_hash: "state",
    mode: "batch",
    artifact_count: 1,
    generated_at: "2026-04-20T00:00:00.000Z",
    artifacts: [{
      id: "artifact-a",
      path: image,
      source_file: join(root, "manual.pdf"),
      source_page: 1,
      source_sidecar: join(root, "manual.md"),
      source_kind: "ocr_crop",
      mime_type: "image/png",
      sha256: "image-sha",
    }],
  };
}

describe("image dataprep batch import/export", () => {
  it("exports provider-neutral JSONL caption requests", () => {
    const root = makeTempDir();
    const out = join(root, "batch", "primary.jsonl");

    const result = exportImageDataprepBatchRequests({
      manifest: manifest(root),
      outputPath: out,
      schema: "generic_image_caption_v1",
      prompt: "Return JSON only.",
    });

    expect(result.requestCount).toBe(1);
    const line = JSON.parse(readFileSync(out, "utf-8").trim()) as Record<string, unknown>;
    expect(line).toMatchObject({
      id: "artifact-a",
      schema: "generic_image_caption_v1",
      image_path: join(root, "image.png"),
      prompt: "Return JSON only.",
    });
  });

  it("imports valid caption and routing results into sidecars", () => {
    const root = makeTempDir();
    const input = join(root, "results.jsonl");
    const outputDir = join(root, "image-dataprep");
    writeFileSync(input, JSON.stringify({
      artifact_id: "artifact-a",
      caption: {
        schema: "generic_image_caption_v1",
        artifact_id: "artifact-a",
        summary: "A flow diagram.",
        visible_text: [],
        visual_content_type: "flow_diagram",
        semantic_density: "high",
        entity_candidates: [],
        relationship_candidates: [],
        uncertainties: [],
        provenance: { source_file: "manual.pdf", image_path: "image.png" },
      },
      routing: {
        schema: "generic_image_routing_v1",
        artifact_id: "artifact-a",
        visual_content_type: "flow_diagram",
        routing_signal: "deep",
        reasons: ["relationship-heavy"],
        requires_deep_reasoning: true,
        proposed_next_model: "config:deep_model",
      },
    }) + "\n", "utf-8");

    const result = importImageDataprepBatchResults({ inputPath: input, outputDir });

    expect(result.importedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(existsSync(join(outputDir, "captions", "artifact-a.caption.json"))).toBe(true);
    expect(existsSync(join(outputDir, "routing", "artifact-a.routing.json"))).toBe(true);
  });

  it("rejects invalid provider JSON before writing sidecars", () => {
    const root = makeTempDir();
    const input = join(root, "bad.jsonl");
    const outputDir = join(root, "image-dataprep");
    writeFileSync(input, JSON.stringify({
      artifact_id: "artifact-a",
      caption: { schema: "generic_image_caption_v1" },
      routing: { schema: "generic_image_routing_v1", artifact_id: "artifact-a", routing_signal: "expensive" },
    }) + "\n", "utf-8");

    const result = importImageDataprepBatchResults({ inputPath: input, outputDir });

    expect(result.importedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(existsSync(join(outputDir, "captions", "artifact-a.caption.json"))).toBe(false);
  });

  it("exports deep-pass requests only for accepted deterministic deep routes", () => {
    const root = makeTempDir();
    const outputDir = join(root, "image-dataprep");
    const captionsDir = join(outputDir, "captions");
    mkdirSync(captionsDir, { recursive: true });
    const dense = {
      schema: "generic_image_caption_v1",
      artifact_id: "artifact-a",
      summary: "A dense flow.",
      visible_text: [],
      visual_content_type: "flow_diagram",
      semantic_density: "high",
      entity_candidates: [{ label: "A" }, { label: "B" }],
      relationship_candidates: [{ source_label: "A", target_label: "B" }],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "image.png" },
    };
    const simple = {
      ...dense,
      artifact_id: "artifact-b",
      visual_content_type: "simple_view",
      relationship_candidates: [],
    };
    writeFileSync(join(captionsDir, "artifact-a.caption.json"), JSON.stringify(dense), "utf-8");
    writeFileSync(join(captionsDir, "artifact-b.caption.json"), JSON.stringify(simple), "utf-8");
    const graphifyManifest = manifest(root);
    graphifyManifest.artifacts.push({ ...graphifyManifest.artifacts[0]!, id: "artifact-b" });
    graphifyManifest.artifact_count = 2;
    const rules: ImageRoutingRulesFile = {
      schema: "graphify_image_routing_rules_v1",
      decision: "accept_matrix",
      routes: {
        deep: { visual_content_types: ["flow_diagram"] },
        primary: { visual_content_types: ["simple_view"] },
      },
    };

    const result = exportImageDataprepBatchRequests({
      manifest: graphifyManifest,
      outputPath: join(outputDir, "batch", "deep.jsonl"),
      schema: "generic_image_caption_v1",
      prompt: "Deep pass.",
      pass: "deep",
      captionsDir,
      rules,
    });

    expect(result.requestCount).toBe(1);
    const line = JSON.parse(readFileSync(join(outputDir, "batch", "deep.jsonl"), "utf-8").trim()) as { id: string };
    expect(line.id).toBe("artifact-a");
  });

  it("refuses deep-pass export when routing rules are not accepted", () => {
    const root = makeTempDir();
    const outputDir = join(root, "image-dataprep");

    expect(() => exportImageDataprepBatchRequests({
      manifest: manifest(root),
      outputPath: join(outputDir, "batch", "deep.jsonl"),
      schema: "generic_image_caption_v1",
      prompt: "Deep pass.",
      pass: "deep",
      captionsDir: join(outputDir, "captions"),
      rules: {
        schema: "graphify_image_routing_rules_v1",
        decision: "pending_labels",
        routes: {},
      },
    })).toThrow("accepted routing matrix");
  });

  it("does not overwrite valid prior sidecars unless force is set", () => {
    const root = makeTempDir();
    const input = join(root, "results.jsonl");
    const outputDir = join(root, "image-dataprep");
    const captionPath = join(outputDir, "captions", "artifact-a.caption.json");
    const routingPath = join(outputDir, "routing", "artifact-a.routing.json");
    mkdirSync(join(outputDir, "captions"), { recursive: true });
    mkdirSync(join(outputDir, "routing"), { recursive: true });
    writeFileSync(captionPath, JSON.stringify({
      schema: "generic_image_caption_v1",
      artifact_id: "artifact-a",
      summary: "Original.",
      visible_text: [],
      visual_content_type: "flow_diagram",
      semantic_density: "high",
      entity_candidates: [],
      relationship_candidates: [],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "image.png" },
    }), "utf-8");
    writeFileSync(routingPath, JSON.stringify({
      schema: "generic_image_routing_v1",
      artifact_id: "artifact-a",
      visual_content_type: "flow_diagram",
      routing_signal: "deep",
      reasons: ["existing"],
      requires_deep_reasoning: true,
      proposed_next_model: "config:deep_model",
    }), "utf-8");
    writeFileSync(input, JSON.stringify({
      artifact_id: "artifact-a",
      caption: {
        schema: "generic_image_caption_v1",
        artifact_id: "artifact-a",
        summary: "Replacement.",
        visible_text: [],
        visual_content_type: "flow_diagram",
        semantic_density: "high",
        entity_candidates: [],
        relationship_candidates: [],
        uncertainties: [],
        provenance: { source_file: "manual.pdf", image_path: "image.png" },
      },
      routing: {
        schema: "generic_image_routing_v1",
        artifact_id: "artifact-a",
        visual_content_type: "flow_diagram",
        routing_signal: "deep",
        reasons: ["replacement"],
        requires_deep_reasoning: true,
        proposed_next_model: "config:deep_model",
      },
    }) + "\n", "utf-8");

    const blocked = importImageDataprepBatchResults({ inputPath: input, outputDir });
    const forced = importImageDataprepBatchResults({ inputPath: input, outputDir, force: true });

    expect(blocked.importedCount).toBe(0);
    expect(blocked.failures[0]?.errors.join("\n")).toContain("already exists");
    expect(forced.importedCount).toBe(1);
    expect(readFileSync(captionPath, "utf-8")).toContain("Replacement.");
  });
});
