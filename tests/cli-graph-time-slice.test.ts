/**
 * `graphify time-slice` runner: source selection, strict timestamp parsing,
 * write safety (never the source, no silent overwrite), dry-run default, and
 * JSON report purity.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  GRAPH_TIME_SLICE_SCHEMA,
  runGraphTimeSlice,
  type GraphTimeSliceReport,
} from "../src/graph-time-slice.js";

const T0 = 1_750_000_000_000;
const HOUR = 3_600_000;

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-time-slice-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeGraph(dir: string): string {
  const path = join(dir, "graph.json");
  writeFileSync(
    path,
    JSON.stringify({
      directed: true,
      multigraph: false,
      graph: { community_labels: {} },
      topology_signature: "n=3;e=1;",
      nodes: [
        { id: "a", label: "A", t: T0 },
        { id: "b", label: "B", t: T0 },
        { id: "later", label: "Later", t: T0 + 10 * HOUR, t_end: T0 + 10 * HOUR },
      ],
      links: [{ source: "a", target: "b", relation: "worked-in", t: T0 }],
      hyperedges: [],
    }),
    "utf-8",
  );
  return path;
}

function collect(): { lines: string[]; log: (line: string) => void } {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("runGraphTimeSlice", () => {
  it("is a dry run when --out is omitted", () => {
    const dir = tempDir();
    const source = writeGraph(dir);
    const sink = collect();

    const run = runGraphTimeSlice({ graph: source, since: T0, until: T0 + HOUR }, { log: sink.log });

    expect(run.written).toBe(false);
    expect(run.outPath).toBeNull();
    expect(run.result.counts.nodes.retained).toBe(2);
    expect(sink.lines.join("\n")).toContain("Dry run");
    expect(existsSync(join(dir, "sliced.json"))).toBe(false);
  });

  it("writes a sliced graph.json carrying graph.window", () => {
    const dir = tempDir();
    const source = writeGraph(dir);
    const out = join(dir, "sliced.json");

    const run = runGraphTimeSlice(
      { graph: source, since: T0, until: T0 + HOUR, out },
      { log: () => {} },
    );

    expect(run.written).toBe(true);
    const written = JSON.parse(readFileSync(out, "utf-8")) as {
      graph: { window: { since: number; until: number; predicate: string } };
      nodes: Array<{ id: string }>;
      links: Array<{ relation: string }>;
      topology_signature: string;
    };
    expect(written.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(written.links.map((link) => link.relation)).toEqual(["worked-in"]);
    expect(written.graph.window.since).toBe(T0);
    expect(written.graph.window.until).toBe(T0 + HOUR);
    expect(written.graph.window.predicate).toBe("inclusive-overlap");
    expect(written.topology_signature).not.toBe("n=3;e=1;");
  });

  it("refuses to overwrite the source graph", () => {
    const dir = tempDir();
    const source = writeGraph(dir);

    expect(() =>
      runGraphTimeSlice({ graph: source, since: T0, out: source }, { log: () => {} }),
    ).toThrow(/refusing to overwrite the source graph/);
  });

  it("refuses an existing destination unless --force is passed", () => {
    const dir = tempDir();
    const source = writeGraph(dir);
    const out = join(dir, "sliced.json");
    writeFileSync(out, "{}", "utf-8");

    expect(() =>
      runGraphTimeSlice({ graph: source, since: T0, out }, { log: () => {} }),
    ).toThrow(/already exists/);

    const forced = runGraphTimeSlice(
      { graph: source, since: T0, out, force: true },
      { log: () => {} },
    );
    expect(forced.written).toBe(true);
    expect(readFileSync(out, "utf-8")).not.toBe("{}");
  });

  it("requires at least one bound", () => {
    const dir = tempDir();
    const source = writeGraph(dir);

    expect(() => runGraphTimeSlice({ graph: source }, { log: () => {} })).toThrow(
      /at least one of --since\/--until/,
    );
  });

  it("accepts epoch-ms strings and zoned ISO-8601 but rejects date-only input", () => {
    const dir = tempDir();
    const source = writeGraph(dir);

    const iso = runGraphTimeSlice(
      { graph: source, since: new Date(T0).toISOString(), until: String(T0 + HOUR) },
      { log: () => {} },
    );
    expect(iso.result.window.since).toBe(T0);
    expect(iso.result.window.until).toBe(T0 + HOUR);

    expect(() =>
      runGraphTimeSlice({ graph: source, since: "2025-06-15" }, { log: () => {} }),
    ).toThrow(/explicit Z\/UTC offset/);
  });

  it("emits only the graphify.graph-time-slice/v1 report under --json", () => {
    const dir = tempDir();
    const source = writeGraph(dir);
    const sink = collect();

    runGraphTimeSlice(
      { graph: source, since: T0, until: T0 + HOUR, json: true },
      { log: sink.log },
    );

    expect(sink.lines).toHaveLength(1);
    const report = JSON.parse(sink.lines[0]) as GraphTimeSliceReport & { graph?: unknown };
    expect(report.schema).toBe(GRAPH_TIME_SLICE_SCHEMA);
    expect(report.graph).toBeUndefined();
    expect(report.written).toBe(false);
    expect(report.out).toBeNull();
    expect(report.source).toBe(source);
    expect(report.counts.nodes).toEqual({ total: 3, retained: 2 });
  });

  it("reports a missing source graph by path", () => {
    const dir = tempDir();

    expect(() =>
      runGraphTimeSlice({ graph: join(dir, "absent.json"), since: T0 }, { log: () => {} }),
    ).toThrow(/graph file not found/);
  });

  it("accepts an injected reader for embedders", () => {
    const sink = collect();
    const run = runGraphTimeSlice(
      { graph: "/virtual/graph.json", since: T0, until: T0 },
      {
        log: sink.log,
        readGraph: () => ({
          nodes: [{ id: "a", t: T0 }],
          links: [],
        }),
      },
    );

    expect(run.result.counts.nodes).toEqual({ total: 1, retained: 1 });
    expect(run.written).toBe(false);
  });
});
