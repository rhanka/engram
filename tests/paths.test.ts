import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import {
  DEFAULT_GRAPHIFY_STATE_DIR,
  NEXT_GRAPHIFY_STATE_DIR,
  defaultGraphPath,
  defaultManifestPath,
  defaultTranscriptsDir,
  resolveGraphifyPaths,
} from "../src/paths.js";

describe("graphify path contract", () => {
  it("keeps graphify-out as the current default state root", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(DEFAULT_GRAPHIFY_STATE_DIR).toBe("graphify-out");
    expect(NEXT_GRAPHIFY_STATE_DIR).toBe(".graphify");
    expect(paths.stateDir).toBe(join(root, "graphify-out"));
    expect(paths.graph).toBe(join(root, "graphify-out", "graph.json"));
    expect(paths.report).toBe(join(root, "graphify-out", "GRAPH_REPORT.md"));
    expect(paths.cacheDir).toBe(join(root, "graphify-out", "cache"));
    expect(paths.transcriptsDir).toBe(join(root, "graphify-out", "transcripts"));
  });

  it("groups skill/runtime scratch files under the state root", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.scratch.detect).toBe(join(root, "graphify-out", ".graphify_detect.json"));
    expect(paths.scratch.runtime).toBe(join(root, "graphify-out", ".graphify_runtime.json"));
    expect(paths.scratch.semanticNew).toBe(join(root, "graphify-out", ".graphify_semantic_new.json"));
  });

  it("preserves legacy root scratch paths for the current standalone build behavior", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root });

    expect(paths.legacyRootScratch.detect).toBe(join(root, ".graphify_detect.json"));
    expect(paths.legacyRootScratch.extract).toBe(join(root, ".graphify_extract.json"));
  });

  it("accepts a custom or future state root without changing callers", () => {
    const root = resolve("/tmp/graphify-path-contract");
    const paths = resolveGraphifyPaths({ root, stateDir: NEXT_GRAPHIFY_STATE_DIR });

    expect(paths.stateDir).toBe(join(root, ".graphify"));
    expect(paths.graph).toBe(join(root, ".graphify", "graph.json"));
    expect(paths.scratch.detect).toBe(join(root, ".graphify", ".graphify_detect.json"));
  });

  it("provides default path helpers", () => {
    const root = resolve("/tmp/graphify-path-contract");

    expect(defaultGraphPath(root)).toBe(join(root, "graphify-out", "graph.json"));
    expect(defaultManifestPath(root)).toBe(join(root, "graphify-out", "manifest.json"));
    expect(defaultTranscriptsDir(root)).toBe(join(root, "graphify-out", "transcripts"));
  });
});
