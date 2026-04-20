import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildImageDataprepManifest, runImageDataprep } from "../src/image-dataprep.js";
import { validateImageCaption, validateImageRouting } from "../src/image-caption-schema.js";
import { normalizeProjectConfig } from "../src/project-config.js";
import type { DetectionResult } from "../src/types.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-image-dataprep-"));
  cleanupDirs.push(dir);
  return dir;
}

function detection(root: string, images: string[]): DetectionResult {
  return {
    files: { code: [], document: [], paper: [], image: images, video: [] },
    total_files: images.length,
    total_words: 0,
    needs_graph: images.length > 0,
    warning: null,
    skipped_sensitive: [],
    graphifyignore_patterns: 0,
    root,
  };
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("image dataprep", () => {
  it("does not create image dataprep artifacts without explicit opt-in", () => {
    const root = makeTempDir();
    const image = join(root, "diagram.png");
    writeFileSync(image, "png", "utf-8");
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
      },
      join(root, "graphify.yaml"),
    );

    const result = runImageDataprep({
      config,
      detection: detection(root, [image]),
      pdfArtifacts: [],
    });

    expect(result.enabled).toBe(false);
    expect(result.manifestPath).toBeNull();
    expect(existsSync(join(root, ".graphify", "image-dataprep"))).toBe(false);
  });

  it("builds a provenance-preserving manifest for direct and OCR crop images", () => {
    const root = makeTempDir();
    const directImage = join(root, "diagram.png");
    const cropDir = join(root, ".graphify", "converted", "pdf", "manual_images");
    const cropImage = join(cropDir, "page-2.png");
    const markdown = join(root, ".graphify", "converted", "pdf", "manual.md");
    mkdirSync(cropDir, { recursive: true });
    writeFileSync(directImage, "png", "utf-8");
    writeFileSync(cropImage, "png", "utf-8");
    writeFileSync(markdown, "# Manual", "utf-8");

    const manifest = buildImageDataprepManifest({
      root,
      mode: "assistant",
      detection: detection(root, [directImage, cropImage]),
      pdfArtifacts: [{
        sourceFile: join(root, "manual.pdf"),
        markdownPath: markdown,
        imagePaths: [cropImage],
        provider: "mistral-ocr",
        mode: "auto",
        status: "converted",
        reason: "low_text_density",
        preflight: {
          filePath: join(root, "manual.pdf"),
          mode: "auto",
          sha256: "pdf-sha",
          pageCount: 2,
          wordCount: 0,
          charCount: 0,
          imageMarkerCount: 1,
          textLayerProvider: "none",
          shouldOcr: true,
          reason: "low_text_density",
        },
      }],
    });

    expect(manifest.artifact_count).toBe(2);
    expect(manifest.artifacts.map((artifact) => artifact.source_kind).sort()).toEqual(["direct_image", "ocr_crop"]);
    expect(manifest.artifacts.find((artifact) => artifact.path === cropImage)).toMatchObject({
      source_file: join(root, "manual.pdf"),
      source_page: 2,
      source_sidecar: markdown,
      source_kind: "ocr_crop",
      mime_type: "image/png",
    });
  });

  it("excludes full-page screenshot artifacts by default", () => {
    const root = makeTempDir();
    const screenshot = join(root, "derived", "full-page-screenshots", "page-1.png");
    mkdirSync(join(screenshot, ".."), { recursive: true });
    writeFileSync(screenshot, "png", "utf-8");

    const manifest = buildImageDataprepManifest({
      root,
      mode: "assistant",
      detection: detection(root, [screenshot]),
      pdfArtifacts: [],
      includeFullPageScreenshots: false,
    });

    expect(manifest.artifact_count).toBe(0);
  });

  it("writes manifest and assistant instructions when enabled", () => {
    const root = makeTempDir();
    const image = join(root, "diagram.png");
    writeFileSync(image, "png", "utf-8");
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
        dataprep: {
          image_analysis: { enabled: true, mode: "assistant" },
        },
      },
      join(root, "graphify.yaml"),
    );

    const result = runImageDataprep({
      config,
      detection: detection(root, [image]),
      pdfArtifacts: [],
    });

    expect(result.enabled).toBe(true);
    expect(result.manifestPath).toBe(join(root, ".graphify", "image-dataprep", "manifest.json"));
    expect(result.assistantInstructionsPath).toBe(join(root, ".graphify", "image-dataprep", "assistant-instructions.md"));
    expect(readFileSync(result.manifestPath!, "utf-8")).toContain("graphify_image_dataprep_manifest_v1");
    expect(readFileSync(result.assistantInstructionsPath!, "utf-8")).toContain("generic_image_caption_v1");
  });

  it("validates generic image caption and routing sidecars", () => {
    expect(validateImageCaption({
      schema: "generic_image_caption_v1",
      artifact_id: "a",
      summary: "A diagram.",
      visible_text: ["PUMP"],
      visual_content_type: "diagram",
      semantic_density: "medium",
      entity_candidates: [],
      relationship_candidates: [],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "image.png" },
    })).toEqual([]);

    expect(validateImageRouting({
      schema: "generic_image_routing_v1",
      artifact_id: "a",
      visual_content_type: "diagram",
      routing_signal: "deep",
      reasons: ["dense relationships"],
      requires_deep_reasoning: true,
      proposed_next_model: "config:deep_model",
    })).toEqual([]);

    expect(validateImageRouting({
      schema: "generic_image_routing_v1",
      artifact_id: "a",
      visual_content_type: "diagram",
      routing_signal: "expensive",
    })).toContain("routing_signal must be one of skip, primary, deep");
  });
});
