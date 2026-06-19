import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLASS_HIERARCHIES_FILENAME,
  clearClassHierarchiesEmitterCache,
  emitClassHierarchies,
} from "../src/ontology-class-hierarchies-emitter.js";
import type { NormalizedClassHierarchySpec } from "../src/types.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-class-hier-emit-"));
  tempDirs.push(dir);
  return dir;
}

function tax(
  classes: Record<string, { parent?: string | null; member_node_types?: string[] }>,
): NormalizedClassHierarchySpec {
  return {
    relation_type: "subclass_of",
    membership_relation_type: "has_instance",
    classes: Object.fromEntries(
      Object.entries(classes).map(([name, k]) => [
        name,
        {
          parent: k.parent ?? null,
          label: null,
          member_node_types: k.member_node_types ?? [],
        },
      ]),
    ),
  };
}

beforeEach(() => {
  clearClassHierarchiesEmitterCache();
});

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("emitClassHierarchies — standalone class-hierarchies.json (EVOL 2.c)", () => {
  it("writes class-hierarchies.json into the ontology dir when a block is present", () => {
    const ontologyDir = join(makeTempDir(), "ontology");
    const result = emitClassHierarchies({
      classHierarchies: {
        tax: tax({ Thing: {}, Person: { parent: "Thing", member_node_types: ["Character"] } }),
      },
      graphNodes: [{ id: "n1", node_type: "Character" }],
      ontologyOutputDir: ontologyDir,
      graphHash: "feedface",
      profileHash: "p1",
    });

    expect(result.written).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.path).toBe(join(ontologyDir, CLASS_HIERARCHIES_FILENAME));
    expect(existsSync(result.path!)).toBe(true);

    const onDisk = JSON.parse(readFileSync(result.path!, "utf-8"));
    expect(onDisk).toEqual(result.artifact);
    expect(onDisk.schema).toBe("graphify_ontology_class_hierarchies_v1");
    expect(onDisk.graph_hash).toBe("feedface");
    expect(onDisk.profile_hash).toBe("p1");
    expect(onDisk.hierarchies.tax.classes_by_id["class:Person"].member_ids).toEqual([
      "n1",
    ]);
  });

  it("writes NO file (not null) when the class_hierarchies block is absent", () => {
    const ontologyDir = join(makeTempDir(), "ontology");
    const result = emitClassHierarchies({
      graphNodes: [{ id: "n1", node_type: "Character" }],
      ontologyOutputDir: ontologyDir,
    });
    expect(result).toEqual({ written: false, path: null, artifact: null, cached: false });
    expect(existsSync(join(ontologyDir, CLASS_HIERARCHIES_FILENAME))).toBe(false);
  });

  it("writes NO file when the class_hierarchies block is empty", () => {
    const ontologyDir = join(makeTempDir(), "ontology");
    const result = emitClassHierarchies({
      classHierarchies: {},
      graphNodes: [],
      ontologyOutputDir: ontologyDir,
    });
    expect(result.written).toBe(false);
    expect(result.path).toBeNull();
    expect(existsSync(join(ontologyDir, CLASS_HIERARCHIES_FILENAME))).toBe(false);
  });

  it("reuses the cache when inputs are unchanged", () => {
    const ontologyDir = join(makeTempDir(), "ontology");
    const opts = {
      classHierarchies: { tax: tax({ Thing: {} }) },
      graphNodes: [{ id: "n1", node_type: "Character" }],
      ontologyOutputDir: ontologyDir,
    };
    const first = emitClassHierarchies(opts);
    expect(first.written).toBe(true);

    const second = emitClassHierarchies(opts);
    expect(second.cached).toBe(true);
    expect(second.written).toBe(false); // file on disk, inputs unchanged
    expect(second.artifact).toBe(first.artifact); // same instance — no rebuild
  });

  it("invalidates the cache when the block changes", () => {
    const ontologyDir = join(makeTempDir(), "ontology");
    const first = emitClassHierarchies({
      classHierarchies: { tax: tax({ Thing: {} }) },
      graphNodes: [],
      ontologyOutputDir: ontologyDir,
    });
    expect(Object.keys(first.artifact!.hierarchies.tax!.classes_by_id)).toEqual([
      "class:Thing",
    ]);

    const second = emitClassHierarchies({
      classHierarchies: { tax: tax({ Thing: {}, Person: { parent: "Thing" } }) },
      graphNodes: [],
      ontologyOutputDir: ontologyDir,
    });
    expect(second.cached).toBe(false);
    expect(second.written).toBe(true);
    expect(Object.keys(second.artifact!.hierarchies.tax!.classes_by_id).sort()).toEqual([
      "class:Person",
      "class:Thing",
    ]);
    const onDisk = JSON.parse(readFileSync(second.path!, "utf-8"));
    expect(onDisk).toEqual(second.artifact);
  });

  it("rewrites a cached artifact when the target file vanished", () => {
    const ontologyDir = join(makeTempDir(), "ontology");
    const opts = {
      classHierarchies: { tax: tax({ Thing: {} }) },
      graphNodes: [],
      ontologyOutputDir: ontologyDir,
    };
    const first = emitClassHierarchies(opts);
    rmSync(first.path!);

    const again = emitClassHierarchies(opts);
    expect(again.cached).toBe(true); // builder skipped…
    expect(again.written).toBe(true); // …but the artifact is restored
    expect(existsSync(again.path!)).toBe(true);
  });
});
