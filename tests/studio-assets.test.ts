/**
 * Track G studio-svelte — server-side plumbing for the client Svelte SPA.
 *
 * Covers the two load-bearing helpers added to serve the SPA + its per-entity
 * data: the static-asset traversal guard and the entity sidecar assembly
 * (wiki description + occurrences) read from a `.graphify` state dir.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildEntitySidecar, serveStudioAsset } from "../src/studio-assets.js";

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

describe("buildEntitySidecar", () => {
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
