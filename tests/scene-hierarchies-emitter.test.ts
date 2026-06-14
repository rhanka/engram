import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SCENE_HIERARCHIES_FILENAME,
  clearSceneHierarchiesEmitterCache,
  emitSceneHierarchies,
} from "../src/scene-hierarchies-emitter.js";
import type { OntologyHierarchyArc } from "../src/types.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-scene-hier-emit-"));
  tempDirs.push(dir);
  return dir;
}

function arc(parentId: string, childId: string): OntologyHierarchyArc {
  return {
    hierarchy_id: "h",
    parent_id: parentId,
    child_id: childId,
    level: 0,
    type: "parent_of",
    source: "profile",
    status: "reference",
    confidence: 1.0,
  };
}

function writeHierarchies(ontologyDir: string, arcs: OntologyHierarchyArc[]): string {
  mkdirSync(ontologyDir, { recursive: true });
  const path = join(ontologyDir, "hierarchies.json");
  writeFileSync(path, JSON.stringify(arcs, null, 2) + "\n", "utf-8");
  return path;
}

beforeEach(() => {
  clearSceneHierarchiesEmitterCache();
});

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("emitSceneHierarchies — standalone scene-hierarchies.json (D1)", () => {
  it("writes scene-hierarchies.json next to scene.json when hierarchies.json exists", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology");
    const sceneDir = join(root, "export");
    writeHierarchies(ontologyDir, [arc("AM0104", "AM0104.01")]);
    mkdirSync(sceneDir, { recursive: true });

    const result = emitSceneHierarchies({
      ontologyOutputDir: ontologyDir,
      sceneDir,
      graphHash: "feedface",
    });

    expect(result.written).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.path).toBe(join(sceneDir, SCENE_HIERARCHIES_FILENAME));
    expect(existsSync(result.path!)).toBe(true);

    const onDisk = JSON.parse(readFileSync(result.path!, "utf-8"));
    expect(onDisk).toEqual(result.sidecar);
    expect(onDisk.schema).toBe("graphify_scene_hierarchies_v1");
    expect(onDisk.graph_hash).toBe("feedface");
    // Raw ids stay lossless join keys on disk.
    expect(onDisk.hierarchies.h.nodes_by_id["AM0104.01"]).toMatchObject({
      parent_id: "AM0104",
      registry_record_id: "AM0104.01",
    });
  });

  it("writes NO file (not null) when hierarchies.json is absent", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology"); // never created
    const sceneDir = join(root, "export");
    mkdirSync(sceneDir, { recursive: true });

    const result = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });

    expect(result).toEqual({ written: false, path: null, sidecar: null, cached: false });
    expect(existsSync(join(sceneDir, SCENE_HIERARCHIES_FILENAME))).toBe(false);
  });

  it("reuses the cache when hierarchies.json is unchanged (same mtime)", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology");
    const sceneDir = join(root, "export");
    writeHierarchies(ontologyDir, [arc("r", "a")]);

    const first = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    expect(first.written).toBe(true);

    const second = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    expect(second.cached).toBe(true);
    expect(second.written).toBe(false); // file already on disk, source unchanged
    expect(second.sidecar).toBe(first.sidecar); // same instance — no rebuild
  });

  it("invalidates the cache when hierarchies.json mtime changes", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology");
    const sceneDir = join(root, "export");
    const hierarchiesPath = writeHierarchies(ontologyDir, [arc("r", "a")]);

    const first = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    expect(Object.keys(first.sidecar!.hierarchies.h!.nodes_by_id).sort()).toEqual(["a", "r"]);

    // New content + explicitly bumped mtime (sub-ms writes could otherwise tie).
    writeFileSync(
      hierarchiesPath,
      JSON.stringify([arc("r", "a"), arc("a", "b")], null, 2) + "\n",
      "utf-8",
    );
    const future = new Date(Date.now() + 5_000);
    utimesSync(hierarchiesPath, future, future);

    const second = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    expect(second.cached).toBe(false);
    expect(second.written).toBe(true);
    expect(Object.keys(second.sidecar!.hierarchies.h!.nodes_by_id).sort()).toEqual([
      "a",
      "b",
      "r",
    ]);
    const onDisk = JSON.parse(readFileSync(second.path!, "utf-8"));
    expect(onDisk).toEqual(second.sidecar);
  });

  it("rewrites a cached sidecar when the target file vanished", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology");
    const sceneDir = join(root, "export");
    writeHierarchies(ontologyDir, [arc("r", "a")]);

    const first = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    rmSync(first.path!);

    const again = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    expect(again.cached).toBe(true); // builder skipped…
    expect(again.written).toBe(true); // …but the artifact is restored
    expect(existsSync(again.path!)).toBe(true);
  });

  it("defaults the node universe to the arc endpoints when sceneNodeIds is omitted (scene optional, F1)", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology");
    const sceneDir = join(root, "export");
    writeHierarchies(ontologyDir, [arc("r", "a"), arc("a", "b")]);

    const result = emitSceneHierarchies({ ontologyOutputDir: ontologyDir, sceneDir });
    const h = result.sidecar!.hierarchies.h!;
    expect(h.orphan_ids).toEqual([]);
    expect(h.dangling_arc_count).toBe(0);
    expect(h.root_ids).toEqual(["r"]);
  });

  it("applies sceneNodeIds when provided: missing parents become orphan promotions", () => {
    const root = makeTempDir();
    const ontologyDir = join(root, "ontology");
    const sceneDir = join(root, "export");
    writeHierarchies(ontologyDir, [arc("r", "a"), arc("a", "b")]);

    const result = emitSceneHierarchies({
      ontologyOutputDir: ontologyDir,
      sceneDir,
      sceneNodeIds: new Set(["a", "b"]), // "r" absent from the scene
    });
    const h = result.sidecar!.hierarchies.h!;
    expect(h.orphan_ids).toEqual(["a"]);
    expect(h.root_ids).toEqual(["a"]);
    expect(h.nodes_by_id["a"]).toMatchObject({ parent_id: null, level: 0 });
  });
});
