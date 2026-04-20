import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  exportImageDataprepBatchRequests,
  importImageDataprepBatchResults,
} from "../src/image-dataprep-batch.js";
import type { ImageDataprepManifest } from "../src/image-dataprep.js";

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
});
