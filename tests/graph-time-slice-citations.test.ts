/**
 * (C) — a time slice co-emits a SLICED citations.json sidecar.
 *
 * The sliced graph.json drops out-of-window nodes; its Level-2 citation store
 * (`ontology/citations.json`) must be cut to match — otherwise a consumer of
 * the slice reads inline (K-trimmed) citations but the exhaustive Level-2 tail
 * for those nodes is either absent (today) or stale (points at dropped nodes).
 *
 * Contract:
 *   - a sliced sidecar is written next to --out at `ontology/citations.json`;
 *   - its `nodes` map is exactly the source sidecar RESTRICTED to retained ids;
 *   - `graph_signature` is RECOMPUTED against the sliced graph (never the source
 *     signature — the node set changed);
 *   - schema is carried verbatim;
 *   - when the source has NO sidecar, none is emitted (no empty littering);
 *   - the source sidecar is never mutated.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runGraphTimeSlice } from "../src/graph-time-slice.js";
import { CITATIONS_SIDECAR_RELPATH, CITATIONS_SIDECAR_SCHEMA } from "../src/citations.js";

const T0 = 1_750_000_000_000;
const HOUR = 3_600_000;

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-slice-cites-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Graph with a,b in window and `later` out; each carries an inline citation. */
function writeGraph(dir: string): string {
  const path = join(dir, "graph.json");
  const cite = (src: string) => [{ source_file: src, page: 1, section: "", paragraph_id: "" }];
  writeFileSync(
    path,
    JSON.stringify({
      directed: true,
      multigraph: false,
      graph: { community_labels: {} },
      topology_signature: "n=3;e=1;",
      nodes: [
        { id: "a", label: "A", t: T0, citation_count: 1, citations: cite("a.md") },
        { id: "b", label: "B", t: T0, citation_count: 1, citations: cite("b.md") },
        {
          id: "later",
          label: "Later",
          t: T0 + 10 * HOUR,
          t_end: T0 + 10 * HOUR,
          citation_count: 1,
          citations: cite("later.md"),
        },
      ],
      links: [{ source: "a", target: "b", relation: "worked-in", t: T0 }],
      hyperedges: [],
    }),
    "utf-8",
  );
  return path;
}

/** A Level-2 store next to the source graph, one full entry per node. */
function writeSourceSidecar(dir: string): string {
  const target = join(dir, CITATIONS_SIDECAR_RELPATH);
  mkdirSync(dirname(target), { recursive: true });
  const entry = (src: string) => ({
    count: 1,
    citations: [{ source_file: src, page: 1, section: "", paragraph_id: "" }],
  });
  writeFileSync(
    target,
    JSON.stringify({
      schema: CITATIONS_SIDECAR_SCHEMA,
      graph_signature: "0".repeat(64),
      nodes: { a: entry("a.md"), b: entry("b.md"), later: entry("later.md") },
    }),
    "utf-8",
  );
  return target;
}

type Sidecar = {
  schema: string;
  graph_signature: string;
  nodes: Record<string, { count: number; citations: unknown[] }>;
};

describe("time-slice co-emits a sliced citations sidecar", () => {
  it("restricts the sidecar to retained node ids and recomputes the signature", () => {
    const dir = tempDir();
    const source = writeGraph(dir);
    writeSourceSidecar(dir);
    const outDir = tempDir();
    const out = join(outDir, "sliced.json");

    const run = runGraphTimeSlice({ graph: source, since: T0, until: T0 + HOUR, out }, { log: () => {} });
    expect(run.written).toBe(true);

    const slicedSidecarPath = join(outDir, CITATIONS_SIDECAR_RELPATH);
    expect(existsSync(slicedSidecarPath)).toBe(true);

    const sidecar = JSON.parse(readFileSync(slicedSidecarPath, "utf-8")) as Sidecar;
    expect(sidecar.schema).toBe(CITATIONS_SIDECAR_SCHEMA);
    // `later` left the window, so its citation entry must be gone.
    expect(Object.keys(sidecar.nodes).sort()).toEqual(["a", "b"]);
    // The node set changed, so the stale source signature must not survive.
    expect(sidecar.graph_signature).not.toBe("0".repeat(64));
    expect(sidecar.graph_signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not mutate the source sidecar", () => {
    const dir = tempDir();
    const source = writeGraph(dir);
    const sourceSidecar = writeSourceSidecar(dir);
    const before = readFileSync(sourceSidecar, "utf-8");
    const out = join(tempDir(), "sliced.json");

    runGraphTimeSlice({ graph: source, since: T0, until: T0 + HOUR, out }, { log: () => {} });

    expect(readFileSync(sourceSidecar, "utf-8")).toBe(before);
  });

  it("emits no sidecar when the source has none", () => {
    const dir = tempDir();
    const source = writeGraph(dir); // no writeSourceSidecar
    const outDir = tempDir();
    const out = join(outDir, "sliced.json");

    runGraphTimeSlice({ graph: source, since: T0, until: T0 + HOUR, out }, { log: () => {} });

    expect(existsSync(join(outDir, CITATIONS_SIDECAR_RELPATH))).toBe(false);
  });
});
