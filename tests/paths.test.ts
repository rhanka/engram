import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_GRAPHIFY_STATE_DIR,
  LEGACY_GRAPHIFY_STATE_DIR,
  NEXT_GRAPHIFY_STATE_DIR,
  defaultGraphPath,
  defaultManifestPath,
  defaultTranscriptsDir,
  legacyGraphPath,
  resolveGraphInputPath,
  resolveGraphifyPaths,
} from "../src/paths.js";

describe("graphify path contract", () => {
  it("uses .graphify as the default state root", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(DEFAULT_GRAPHIFY_STATE_DIR).toBe(".graphify");
    expect(LEGACY_GRAPHIFY_STATE_DIR).toBe("graphify-out");
    expect(NEXT_GRAPHIFY_STATE_DIR).toBe(".graphify");
    expect(paths.stateDir).toBe(join(root, ".graphify"));
    expect(paths.graph).toBe(join(root, ".graphify", "graph.json"));
    expect(paths.report).toBe(join(root, ".graphify", "GRAPH_REPORT.md"));
    expect(paths.cacheDir).toBe(join(root, ".graphify", "cache"));
    expect(paths.transcriptsDir).toBe(join(root, ".graphify", "transcripts"));
  });

  it("groups skill/runtime scratch files under the state root", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.scratch.detect).toBe(join(root, ".graphify", ".graphify_detect.json"));
    expect(paths.scratch.runtime).toBe(join(root, ".graphify", ".graphify_runtime.json"));
    expect(paths.scratch.semanticNew).toBe(join(root, ".graphify", ".graphify_semantic_new.json"));
  });

  it("preserves legacy root scratch paths for the current standalone build behavior", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.legacyRootScratch.detect).toBe(join(root, ".graphify_detect.json"));
    expect(paths.legacyRootScratch.extract).toBe(join(root, ".graphify_extract.json"));
  });

  it("accepts a custom state root without changing callers", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root, stateDir: "custom-graph-state" });

    expect(paths.stateDir).toBe(join(root, "custom-graph-state"));
    expect(paths.graph).toBe(join(root, "custom-graph-state", "graph.json"));
    expect(paths.scratch.detect).toBe(join(root, "custom-graph-state", ".graphify_detect.json"));
  });

  it("provides default path helpers", () => {
    const root = resolve("/tmp/graphify-path-contract");

    expect(defaultGraphPath(root)).toBe(join(root, ".graphify", "graph.json"));
    expect(legacyGraphPath(root)).toBe(join(root, "graphify-out", "graph.json"));
    expect(defaultManifestPath(root)).toBe(join(root, ".graphify", "manifest.json"));
    expect(defaultTranscriptsDir(root)).toBe(join(root, ".graphify", "transcripts"));
  });

  it("falls back to legacy graphify-out only for implicit graph reads", () => {
    const root = mkdtempSync(join(tmpdir(), "graphify-path-fallback-"));
    try {
      mkdirSync(join(root, "graphify-out"), { recursive: true });
      writeFileSync(join(root, "graphify-out", "graph.json"), "{}");

      expect(resolveGraphInputPath(undefined, root)).toBe(join(root, "graphify-out", "graph.json"));

      mkdirSync(join(root, ".graphify"), { recursive: true });
      writeFileSync(join(root, ".graphify", "graph.json"), "{}");
      expect(resolveGraphInputPath(undefined, root)).toBe(join(root, ".graphify", "graph.json"));
      expect(resolveGraphInputPath(join(root, "custom.json"), root)).toBe(join(root, "custom.json"));
      expect(existsSync(resolveGraphInputPath(join(root, "custom.json"), root))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
