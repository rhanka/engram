import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  ALL_KNOWN_STATE_DIRS,
  DEFAULT_ENGRAM_STATE_DIR,
  DEFAULT_GRAPHIFY_STATE_DIR,
  LEGACY_GRAPHIFY_STATE_DIR,
  NEXT_GRAPHIFY_STATE_DIR,
  clearPathWarningsForTests,
  defaultGraphPath,
  defaultManifestPath,
  defaultTranscriptsDir,
  graphifyCompatGraphPath,
  legacyGraphPath,
  resolveGraphInputPath,
  resolveGraphifyPaths,
} from "../src/paths.js";

describe("engram path contract", () => {
  it("uses .engram as the default state root", () => {
    const root = resolve("/tmp/engram-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(DEFAULT_ENGRAM_STATE_DIR).toBe(".engram");
    expect(DEFAULT_GRAPHIFY_STATE_DIR).toBe(".graphify");
    expect(LEGACY_GRAPHIFY_STATE_DIR).toBe("graphify-out");
    expect(NEXT_GRAPHIFY_STATE_DIR).toBe(".graphify");
    expect(ALL_KNOWN_STATE_DIRS).toEqual([".engram", ".graphify", "graphify-out"]);
    expect(paths.stateDir).toBe(join(root, ".engram"));
    expect(paths.graph).toBe(join(root, ".engram", "graph.json"));
    expect(paths.report).toBe(join(root, ".engram", "GRAPH_REPORT.md"));
    expect(paths.cacheDir).toBe(join(root, ".engram", "cache"));
    expect(paths.transcriptsDir).toBe(join(root, ".engram", "transcripts"));
  });

  it("groups skill/runtime scratch files under the state root", () => {
    const root = resolve("/tmp/engram-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.scratch.detect).toBe(join(root, ".engram", ".graphify_detect.json"));
    expect(paths.scratch.runtime).toBe(join(root, ".engram", ".graphify_runtime.json"));
    expect(paths.scratch.semanticNew).toBe(join(root, ".engram", ".graphify_semantic_new.json"));
    expect(paths.scratch.pdfOcr).toBe(join(root, ".engram", ".graphify_pdf_ocr.json"));
  });

  it("groups ontology dataprep profile artifacts under the state root", () => {
    const root = resolve("/tmp/engram-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.profile.dir).toBe(join(root, ".engram", "profile"));
    expect(paths.profile.projectConfig).toBe(join(root, ".engram", "profile", "project-config.normalized.json"));
    expect(paths.profile.ontologyProfile).toBe(join(root, ".engram", "profile", "ontology-profile.normalized.json"));
    expect(paths.profile.state).toBe(join(root, ".engram", "profile", "profile-state.json"));
    expect(paths.profile.registriesDir).toBe(join(root, ".engram", "profile", "registries"));
    expect(paths.profile.registryExtraction).toBe(join(root, ".engram", "profile", "registry-extraction.json"));
    expect(paths.profile.semanticDetection).toBe(join(root, ".engram", "profile", "semantic-detection.json"));
    expect(paths.profile.dataprepReport).toBe(join(root, ".engram", "profile", "dataprep-report.md"));
  });

  it("preserves legacy root scratch paths for the current standalone build behavior", () => {
    const root = resolve("/tmp/engram-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.legacyRootScratch.detect).toBe(join(root, ".graphify_detect.json"));
    expect(paths.legacyRootScratch.extract).toBe(join(root, ".graphify_extract.json"));
  });

  it("accepts a custom state root without changing callers", () => {
    const root = resolve("/tmp/engram-path-contract");
    const paths = resolveGraphifyPaths({ root, stateDir: "custom-graph-state" });

    expect(paths.stateDir).toBe(join(root, "custom-graph-state"));
    expect(paths.graph).toBe(join(root, "custom-graph-state", "graph.json"));
    expect(paths.scratch.detect).toBe(join(root, "custom-graph-state", ".graphify_detect.json"));
  });

  it("provides default path helpers", () => {
    const root = resolve("/tmp/engram-path-contract");

    expect(defaultGraphPath(root)).toBe(join(root, ".engram", "graph.json"));
    expect(graphifyCompatGraphPath(root)).toBe(join(root, ".graphify", "graph.json"));
    expect(legacyGraphPath(root)).toBe(join(root, "graphify-out", "graph.json"));
    expect(defaultManifestPath(root)).toBe(join(root, ".engram", "manifest.json"));
    expect(defaultTranscriptsDir(root)).toBe(join(root, ".engram", "transcripts"));
  });

  it("probes .engram, then .graphify, then graphify-out for implicit graph reads", () => {
    clearPathWarningsForTests();
    const root = mkdtempSync(join(tmpdir(), "engram-path-fallback-"));
    try {
      mkdirSync(join(root, "graphify-out"), { recursive: true });
      writeFileSync(join(root, "graphify-out", "graph.json"), "{}");
      expect(resolveGraphInputPath(undefined, root)).toBe(join(root, "graphify-out", "graph.json"));

      mkdirSync(join(root, ".graphify"), { recursive: true });
      writeFileSync(join(root, ".graphify", "graph.json"), "{}");
      expect(resolveGraphInputPath(undefined, root)).toBe(join(root, ".graphify", "graph.json"));

      mkdirSync(join(root, ".engram"), { recursive: true });
      writeFileSync(join(root, ".engram", "graph.json"), "{}");
      expect(resolveGraphInputPath(undefined, root)).toBe(join(root, ".engram", "graph.json"));

      expect(resolveGraphInputPath(join(root, "custom.json"), root)).toBe(join(root, "custom.json"));
      expect(existsSync(resolveGraphInputPath(join(root, "custom.json"), root))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
