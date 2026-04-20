import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  applyConfiguredExcludes,
  buildConfiguredDetectionInputs,
  runConfiguredDataprep,
} from "../src/configured-dataprep.js";
import { loadProjectConfig } from "../src/project-config.js";
import { resolveGraphifyPaths } from "../src/paths.js";
import type { DetectionResult, FileType } from "../src/types.js";
import type { SemanticPreparationOptions, SemanticPreparationResult } from "../src/semantic-prepare.js";

const cleanupDirs: string[] = [];
const fixtureRoot = resolve(process.cwd(), "tests", "fixtures", "profile-demo");

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-configured-dataprep-"));
  cleanupDirs.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  mkdirSync(join(root, "derived", "ocr"), { recursive: true });
  mkdirSync(join(root, "derived", "extracted-images"), { recursive: true });
  writeFileSync(join(root, "derived", "ocr", "ocr.md"), "# Demo OCR\n\nSynthetic derived text.", "utf-8");
  writeFileSync(join(root, "derived", "extracted-images", "diagram.png"), "synthetic image placeholder", "utf-8");
  return root;
}

function allFiles(detection: DetectionResult): string[] {
  return Object.values(detection.files).flat();
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("configured ontology dataprep", () => {
  it("builds configured detection inputs from project config", () => {
    const root = makeProject();
    const config = loadProjectConfig(join(root, "graphify.yaml"));

    const inputs = buildConfiguredDetectionInputs(config);

    expect(inputs.corpusRoots).toEqual([join(root, "raw", "manuals")]);
    expect(inputs.generatedRoots).toEqual([
      join(root, "derived", "ocr"),
      join(root, "derived", "extracted-images"),
    ]);
    expect(inputs.detectRoots).toEqual([
      join(root, "raw", "manuals"),
      join(root, "derived", "ocr"),
      join(root, "derived", "extracted-images"),
    ]);
    expect(inputs.excludeRoots).toEqual([
      join(root, "derived", "full-page-screenshots"),
      join(root, "tmp"),
    ]);
  });

  it("removes configured excluded roots from a detection result", () => {
    const root = makeProject();
    const config = loadProjectConfig(join(root, "graphify.yaml"));
    const detection: DetectionResult = {
      files: {
        code: [],
        document: [join(root, "raw", "manuals", "manual.md")],
        paper: [],
        image: [
          join(root, "derived", "full-page-screenshots", "page-001.png"),
          join(root, "derived", "extracted-images", "diagram.png"),
        ],
        video: [],
      } satisfies Record<FileType, string[]>,
      total_files: 3,
      total_words: 10,
      needs_graph: false,
      warning: null,
      skipped_sensitive: [],
      graphifyignore_patterns: 0,
    };

    const filtered = applyConfiguredExcludes(detection, config);

    expect(allFiles(filtered)).toContain(join(root, "raw", "manuals", "manual.md"));
    expect(allFiles(filtered)).toContain(join(root, "derived", "extracted-images", "diagram.png"));
    expect(allFiles(filtered)).not.toContain(join(root, "derived", "full-page-screenshots", "page-001.png"));
    expect(filtered.total_files).toBe(2);
  });

  it("runs dataprep through configured roots and writes profile artifacts", async () => {
    const root = makeProject();
    const paths = resolveGraphifyPaths({ root, stateDir: ".graphify" });
    const semanticCalls: SemanticPreparationOptions[] = [];

    const result = await runConfiguredDataprep(root, {
      configPath: join(root, "graphify.yaml"),
      semanticPrepare: async (detection, options): Promise<SemanticPreparationResult> => {
        semanticCalls.push(options);
        return {
          detection,
          transcriptPaths: [],
          pdfArtifacts: [],
          prompt: "synthetic prompt",
        };
      },
    });

    expect(semanticCalls).toHaveLength(1);
    expect(semanticCalls[0]).toMatchObject({
      transcriptOutputDir: paths.transcriptsDir,
      pdfOutputDir: join(paths.convertedDir, "pdf"),
      pdfOcrMode: "auto",
    });
    expect(allFiles(result.semanticDetection)).toContain(join(root, "raw", "manuals", "manual.md"));
    expect(allFiles(result.semanticDetection)).toContain(join(root, "derived", "ocr", "ocr.md"));
    expect(allFiles(result.semanticDetection)).toContain(join(root, "derived", "extracted-images", "diagram.png"));
    expect(allFiles(result.semanticDetection)).not.toContain(
      join(root, "derived", "full-page-screenshots", "page-001.png"),
    );
    expect(result.registryExtraction.nodes).toHaveLength(4);
    expect(existsSync(paths.profile.projectConfig)).toBe(true);
    expect(existsSync(paths.profile.ontologyProfile)).toBe(true);
    expect(existsSync(paths.profile.registryExtraction)).toBe(true);
    expect(existsSync(paths.profile.semanticDetection)).toBe(true);
    expect(existsSync(paths.profile.dataprepReport)).toBe(true);
    expect(existsSync(join(paths.profile.registriesDir, "components.json"))).toBe(true);

    const state = JSON.parse(readFileSync(paths.profile.state, "utf-8")) as Record<string, unknown>;
    expect(state.profile_id).toBe("equipment-maintenance-demo");
    expect(state.profile_hash).toBe(result.profile.profile_hash);
    expect(readFileSync(paths.profile.dataprepReport, "utf-8")).toContain("## Registry Extraction");
  });
});
