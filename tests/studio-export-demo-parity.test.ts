/**
 * WP4 — the capabilities `scripts/build-studio-demo.mjs` used to hold alone.
 *
 * The demo script forked from the exporter and then kept writing artifacts
 * itself, so demo bundles silently missed everything the exporter had learned to
 * emit since (search-index, the citations store, studio.html and — the reason
 * this was rewritten — sources/ + provenance). Folding the script back onto
 * `buildStaticStudio` required moving three capabilities the other way:
 * registry seeds, hierarchy labels, and the content-derived layout default.
 *
 * These tests pin all three, plus the two invariants that make the fold safe:
 * an export WITHOUT them is byte-identical to before, and the layout default is
 * unchanged unless `"auto"` is asked for.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildStaticStudio } from "../src/studio-export.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeSpaDir(): string {
  const spaDir = mkdtempSync(join(tmpdir(), "graphify-spa-"));
  dirs.push(spaDir);
  writeFileSync(join(spaDir, "index.html"), "<!doctype html><html><body></body></html>");
  mkdirSync(join(spaDir, "assets"), { recursive: true });
  writeFileSync(join(spaDir, "assets", "index.js"), "/* app */\n");
  return spaDir;
}

interface ProjectOptions {
  /** Emit `<state>/ontology/hierarchies.json` so the bundle declares a forest. */
  hierarchies?: boolean;
}

function makeProject(options: ProjectOptions = {}): { root: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "graphify-demo-parity-"));
  dirs.push(root);
  const stateDir = join(root, ".graphify");
  mkdirSync(join(stateDir, "ontology"), { recursive: true });
  writeFileSync(
    join(stateDir, "graph.json"),
    JSON.stringify({
      nodes: [
        // Self-labelled: its label IS its raw id, so it renders as a bare code
        // until the registry's own display label repairs it.
        { id: "AM0104", label: "AM0104", node_type: "Process", registry_record_id: "AM0104" },
        { id: "AM0105", label: "A real extraction label", node_type: "Process", registry_record_id: "AM0105" },
      ],
      edges: [],
    }),
  );
  if (options.hierarchies) {
    // hierarchies.json is a FLAT array of profile-declared arcs.
    writeFileSync(
      join(stateDir, "ontology", "hierarchies.json"),
      JSON.stringify([
        {
          hierarchy_id: "processes",
          parent_id: "AM0104",
          child_id: "AM0105",
          level: 0,
          type: "part_of",
          source: "profile",
          status: "reference",
        },
      ]),
    );
  }
  return { root, stateDir };
}

function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-demo-parity-out-"));
  dirs.push(dir);
  return dir;
}

describe("seedNodes", () => {
  it("appends registry seeds and re-serializes graph.json to match", () => {
    const { stateDir } = makeProject();
    const out = outDir();
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      seedNodes: [
        { id: "AM0106", label: "Seeded row", node_type: "Process", registry_record_id: "AM0106" },
      ],
    });
    expect(result.seedNodeCount).toBe(1);
    expect(result.nodeCount).toBe(3);
    // The three bundle artifacts must still describe the SAME entity set — the
    // coherence invariant the demo script gates the build on.
    expect(result.sceneNodeCount).toBe(3);
    expect(result.entityCount).toBe(3);

    const graph = JSON.parse(readFileSync(join(out, "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string }>;
    };
    expect(graph.nodes.map((n) => n.id)).toContain("AM0106");
    // The manifest stamps the measured counts, so a consumer sees the invariant
    // without re-reading three multi-MB artifacts.
    const manifest = JSON.parse(readFileSync(join(out, "workspace-manifest.json"), "utf-8")) as {
      counts?: { graph_nodes: number; scene_nodes: number; entities: number; coherent: boolean };
    };
    expect(manifest.counts).toMatchObject({ graph_nodes: 3, scene_nodes: 3, entities: 3, coherent: true });
  });

  it("keeps graph.json a BYTE-IDENTICAL copy when no seed is supplied", () => {
    const { stateDir } = makeProject();
    const out = outDir();
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
    });
    expect(result.seedNodeCount).toBe(0);
    expect(readFileSync(join(out, "graph.json"), "utf-8")).toBe(
      readFileSync(join(stateDir, "graph.json"), "utf-8"),
    );
  });
});

describe("hierarchyLabels", () => {
  it("repairs a self-labelled row and never overwrites a real label", () => {
    const { stateDir } = makeProject({ hierarchies: true });
    const out = outDir();
    buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      hierarchyLabels: new Map([
        ["AM0104", "Manage the airworthiness file"],
        ["AM0105", "Registry label that must LOSE"],
      ]),
    });
    const sidecar = JSON.parse(readFileSync(join(out, "scene-hierarchies.json"), "utf-8")) as {
      hierarchies: Record<string, { nodes_by_id: Record<string, { label?: string }> }>;
    };
    const byId = sidecar.hierarchies.processes!.nodes_by_id;
    // Self-labelled (label === raw id) -> repaired from the registry.
    expect(byId.AM0104!.label).toBe("Manage the airworthiness file");
    // A real extraction label outranks the registry's.
    expect(byId.AM0105!.label).toBe("A real extraction label");
  });
});

describe("layoutId", () => {
  it("defaults to force, unchanged, when nothing is requested", () => {
    const { stateDir } = makeProject({ hierarchies: true });
    const result = buildStaticStudio({
      stateDir,
      outDir: outDir(),
      spaDir: makeSpaDir(),
      singleFile: false,
    });
    // Declared hierarchies are present, yet the historical default holds: an
    // existing export cannot change shape just by upgrading.
    expect(result.layoutId).toBe("force");
  });

  it("`auto` picks hierarchy-aware when the bundle declares hierarchies", () => {
    const { stateDir } = makeProject({ hierarchies: true });
    const result = buildStaticStudio({
      stateDir,
      outDir: outDir(),
      spaDir: makeSpaDir(),
      singleFile: false,
      layoutId: "auto",
    });
    expect(result.layoutId).toBe("hierarchy-aware");
  });

  it("`auto` falls back to force without hierarchies", () => {
    const { stateDir } = makeProject();
    const result = buildStaticStudio({
      stateDir,
      outDir: outDir(),
      spaDir: makeSpaDir(),
      singleFile: false,
      layoutId: "auto",
    });
    expect(result.layoutId).toBe("force");
  });

  it("takes an explicit id as given", () => {
    const { stateDir } = makeProject({ hierarchies: true });
    const result = buildStaticStudio({
      stateDir,
      outDir: outDir(),
      spaDir: makeSpaDir(),
      singleFile: false,
      layoutId: "typed-layer",
    });
    expect(result.layoutId).toBe("typed-layer");
    const scene = JSON.parse(readFileSync(join(result.outDir, "scene.json"), "utf-8")) as {
      layout_id?: string;
    };
    expect(scene.layout_id).toBe("typed-layer");
  });

  it("bakes positions AFTER the hierarchy sidecar, so hierarchy-aware has its input", () => {
    const { stateDir } = makeProject({ hierarchies: true });
    const result = buildStaticStudio({
      stateDir,
      outDir: outDir(),
      spaDir: makeSpaDir(),
      singleFile: false,
      layoutId: "hierarchy-aware",
    });
    const scene = JSON.parse(readFileSync(join(result.outDir, "scene.json"), "utf-8")) as {
      layout_id?: string;
      nodes: Array<{ x?: number; y?: number; fx?: number; fy?: number }>;
    };
    expect(scene.layout_id).toBe("hierarchy-aware");
    // A hierarchy-aware bake that ran before the sidecar existed would have
    // silently degenerated; real pinned positions are the proof it did not.
    for (const node of scene.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
    // The two nodes must not be stacked on one another.
    expect(new Set(scene.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(2);
  });
});
