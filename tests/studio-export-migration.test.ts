import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildStaticStudio, removeLegacyGraphViz } from "../src/studio-export.js";

describe("removeLegacyGraphViz (legacy graph.html migration cleanup)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("deletes a stale legacy graph viz and reports it, idempotently", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "graphify-migrate-"));
    dirs.push(stateDir);
    const legacy = join(stateDir, "graph" + ".html");
    writeFileSync(legacy, "<html>legacy vis-network</html>");
    expect(existsSync(legacy)).toBe(true);

    // First emit: the stale viz is erased and the cleanup is reported.
    expect(removeLegacyGraphViz(stateDir)).toBe(true);
    expect(existsSync(legacy)).toBe(false);

    // Second emit on an already-clean state dir: no-op, nothing to report.
    expect(removeLegacyGraphViz(stateDir)).toBe(false);
  });

  it("is a safe no-op when there is no legacy viz", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "graphify-migrate-"));
    dirs.push(stateDir);
    expect(removeLegacyGraphViz(stateDir)).toBe(false);
  });
});

describe("buildStaticStudio destructive-target guard", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function makeStateDir(): { stateDir: string; spaDir: string; graphRaw: string } {
    const stateDir = mkdtempSync(join(tmpdir(), "graphify-export-state-"));
    dirs.push(stateDir);
    const graphRaw = JSON.stringify({
      nodes: [{ id: "a", label: "A" }],
      links: [],
    });
    writeFileSync(join(stateDir, "graph.json"), graphRaw);
    // A source ontology artifact that the destructive cleanup would have wiped.
    mkdirSync(join(stateDir, "ontology"), { recursive: true });
    writeFileSync(join(stateDir, "ontology", "citations.json"), "{}");

    // Minimal fake prebuilt SPA so the SPA-not-built guard passes.
    const spaDir = mkdtempSync(join(tmpdir(), "graphify-export-spa-"));
    dirs.push(spaDir);
    writeFileSync(join(spaDir, "index.html"), "<html></html>");
    return { stateDir, spaDir, graphRaw };
  }

  it("rejects exporting into the state dir and leaves the source graph.json intact", () => {
    const { stateDir, spaDir, graphRaw } = makeStateDir();
    expect(() =>
      buildStaticStudio({ stateDir, outDir: stateDir, spaDir, onWarning: () => {} }),
    ).toThrow(/refusing to export into the state dir/i);

    // The source artifacts survive untouched.
    expect(existsSync(join(stateDir, "graph.json"))).toBe(true);
    expect(readFileSync(join(stateDir, "graph.json"), "utf-8")).toBe(graphRaw);
    expect(existsSync(join(stateDir, "ontology", "citations.json"))).toBe(true);
  });

  it("rejects exporting into an ancestor of the state dir and leaves graph.json intact", () => {
    const { stateDir, spaDir, graphRaw } = makeStateDir();
    // outDir is the PARENT of the state dir: cleaning it would erase stateDir.
    const outDir = join(stateDir, "..");
    expect(() =>
      buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} }),
    ).toThrow(/refusing to export into .* it contains the state dir/i);

    expect(existsSync(join(stateDir, "graph.json"))).toBe(true);
    expect(readFileSync(join(stateDir, "graph.json"), "utf-8")).toBe(graphRaw);
  });

  it("succeeds into a separate sibling out dir (graph.json + scene.json emitted)", () => {
    const { stateDir, spaDir } = makeStateDir();
    const outDir = join(stateDir, "studio");
    const result = buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} });
    expect(result.outDir).toBe(outDir);
    expect(existsSync(join(outDir, "graph.json"))).toBe(true);
    expect(existsSync(join(outDir, "scene.json"))).toBe(true);
    expect(existsSync(join(outDir, "index.html"))).toBe(true);
    // Source survives.
    expect(existsSync(join(stateDir, "graph.json"))).toBe(true);
  });

  it("removes a stale multi-model bundle (models.json + models/) on a single-model export", () => {
    const { stateDir, spaDir } = makeStateDir();
    const outDir = join(stateDir, "studio");
    mkdirSync(outDir, { recursive: true });
    // Simulate a previous multi-model export left in the out dir.
    writeFileSync(join(outDir, "models.json"), JSON.stringify({ models: ["old"] }));
    mkdirSync(join(outDir, "models", "old"), { recursive: true });
    writeFileSync(join(outDir, "models", "old", "scene.json"), "{}");

    buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} });

    expect(existsSync(join(outDir, "models.json"))).toBe(false);
    expect(existsSync(join(outDir, "models"))).toBe(false);
    // The fresh single-model artifacts are present.
    expect(existsSync(join(outDir, "scene.json"))).toBe(true);
    expect(existsSync(join(outDir, "graph.json"))).toBe(true);
  });
});
