/**
 * Track G studio-svelte — server-side plumbing for the client Svelte SPA.
 *
 * Covers the load-bearing helpers added to serve the SPA + its per-entity
 * data: the static-asset traversal guard and the entity sidecar assembly
 * (node description + occurrences) read from a `.graphify` state dir, including
 * the WP11 precedence where each graph.json node's own `description` wins over
 * the opt-in wiki sidecar.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildEntitySidecar,
  serveStudioAsset,
  __resetGraphDescriptionCache,
} from "../src/studio-assets.js";

function makeStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-studio-assets-"));
  mkdirSync(join(dir, "wiki"), { recursive: true });
  mkdirSync(join(dir, "ontology"), { recursive: true });
  writeFileSync(
    join(dir, "wiki", "descriptions.json"),
    JSON.stringify({
      schema: "graphify_wiki_description_index_v1",
      nodes: {
        work_a: { status: "generated", description: "A landmark **novel**." },
        place_b: { status: "insufficient_evidence", description: null },
      },
    }),
  );
  writeFileSync(
    join(dir, "ontology", "occurrences.json"),
    JSON.stringify({ nodes: { work_a: { total: 7, documents: { "doc.txt": 7 } } } }),
  );
  return dir;
}

/** Write a graph.json carrying WP11 per-node `description` fields. */
function writeGraph(dir: string, nodes: Array<Record<string, unknown>>): void {
  writeFileSync(join(dir, "graph.json"), JSON.stringify({ nodes, edges: [] }));
}

afterEach(() => {
  __resetGraphDescriptionCache();
});

describe("buildEntitySidecar", () => {
  it("surfaces the graph.json node.description as the generated description (WP11)", () => {
    const dir = makeStateDir();
    writeGraph(dir, [
      { id: "sym_a", description: "Entry point that wires the asset routes." },
    ]);
    const res = buildEntitySidecar(dir, "sym_a");
    expect(res.description).toEqual({
      status: "generated",
      description: "Entry point that wires the asset routes.",
    });
  });

  it("prefers node.description over the wiki sidecar for the same id", () => {
    const dir = makeStateDir();
    // work_a also exists in the wiki sidecar ("A landmark **novel**."); the
    // node's own description must win.
    writeGraph(dir, [{ id: "work_a", description: "Node-level one-liner." }]);
    const res = buildEntitySidecar(dir, "work_a");
    expect(res.description).toEqual({ status: "generated", description: "Node-level one-liner." });
  });

  it("falls back to the wiki sidecar when the node has no description", () => {
    const dir = makeStateDir();
    // graph.json present but work_a carries no description -> wiki fallback.
    writeGraph(dir, [{ id: "work_a" }]);
    const res = buildEntitySidecar(dir, "work_a");
    expect(res.description).toEqual({ status: "generated", description: "A landmark **novel**." });
  });

  it("ignores blank/non-string node descriptions and falls back", () => {
    const dir = makeStateDir();
    writeGraph(dir, [{ id: "place_b", description: "   " }]);
    const res = buildEntitySidecar(dir, "place_b");
    // Blank node description -> wiki sidecar (insufficient_evidence) takes over.
    expect(res.description).toEqual({ status: "insufficient_evidence", description: null });
  });

  it("returns the generated wiki description for a node", () => {
    const dir = makeStateDir();
    const res = buildEntitySidecar(dir, "work_a");
    expect(res.id).toBe("work_a");
    expect(res.description).toEqual({ status: "generated", description: "A landmark **novel**." });
    expect(res.occurrences).toEqual({ total: 7, documents: { "doc.txt": 7 } });
  });

  it("normalises insufficient-evidence entries", () => {
    const dir = makeStateDir();
    const res = buildEntitySidecar(dir, "place_b");
    expect(res.description).toEqual({ status: "insufficient_evidence", description: null });
  });

  it("yields nulls for an unknown node id (panel degrades gracefully)", () => {
    const dir = makeStateDir();
    const res = buildEntitySidecar(dir, "ghost");
    expect(res.description).toBeNull();
    expect(res.occurrences).toBeNull();
  });

  it("tolerates a missing state dir", () => {
    const res = buildEntitySidecar(join(tmpdir(), "does-not-exist-xyz"), "work_a");
    expect(res).toEqual({ id: "work_a", description: null, occurrences: null });
  });
});

describe("serveStudioAsset", () => {
  it("rejects path traversal outside the app dir", () => {
    // Regardless of whether the SPA is built, traversal must never escape.
    const res = serveStudioAsset("/../../../../etc/passwd");
    expect(res).not.toBeNull();
    // Either 403 (app built, guard tripped) or 404 (app not built); never 200.
    expect(res!.status).not.toBe(200);
  });
});
