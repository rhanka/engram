import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { mergeGraphJsonFiles } from "../src/merge-driver.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-merge-driver-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("merge graph driver", () => {
  it("union-merges graph.json nodes, links, hyperedges, and labels", () => {
    const dir = tempDir();
    const ancestor = join(dir, "ancestor.json");
    const current = join(dir, "current.json");
    const other = join(dir, "other.json");

    writeFileSync(
      ancestor,
      JSON.stringify({
        directed: false,
        graph: {
          community_labels: {
            "0": "Core",
          },
          built_from_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/alpha.ts", file_type: "code", community: 0 },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );
    writeFileSync(
      current,
      JSON.stringify({
        directed: false,
        graph: {
          community_labels: {
            "0": "Core",
          },
          built_from_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/alpha.ts", file_type: "code", community: 0 },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
        ],
        hyperedges: [
          { id: "shared_flow", label: "Shared Flow", nodes: ["alpha", "beta"], relation: "participate_in", confidence: "EXTRACTED", source_file: "src/alpha.ts" },
        ],
      }, null, 2),
      "utf-8",
    );
    writeFileSync(
      other,
      JSON.stringify({
        directed: false,
        graph: {
          community_labels: {
            "1": "Docs",
          },
          built_from_commit: "cccccccccccccccccccccccccccccccccccccccc",
        },
        nodes: [
          { id: "beta", label: "Beta", source_file: "docs/beta.md", file_type: "document", community: 1 },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
        ],
        hyperedges: [
          { id: "shared_flow", label: "Shared Flow", nodes: ["alpha", "beta"], relation: "participate_in", confidence: "EXTRACTED", source_file: "docs/beta.md" },
        ],
      }, null, 2),
      "utf-8",
    );

    const result = mergeGraphJsonFiles(ancestor, current, other);
    const merged = JSON.parse(readFileSync(current, "utf-8")) as {
      graph?: { community_labels?: Record<string, string>; built_from_commit?: string | null };
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string; relation?: string }>;
      hyperedges?: Array<{ id?: string }>;
    };

    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(merged.nodes.map((node) => node.id)).toEqual(["alpha", "beta"]);
    expect(merged.links).toEqual([
      expect.objectContaining({ source: "alpha", target: "beta", relation: "uses" }),
    ]);
    expect(merged.hyperedges).toEqual([
      expect.objectContaining({ id: "shared_flow" }),
    ]);
    expect(merged.graph?.community_labels).toMatchObject({
      "0": "Core",
      "1": "Docs",
    });
    expect(merged.graph?.built_from_commit).toBeNull();
  });

  it("rejects graph inputs above the merge-driver node cap", () => {
    const dir = tempDir();
    const ancestor = join(dir, "ancestor.json");
    const current = join(dir, "current.json");
    const other = join(dir, "other.json");
    const tooManyNodes = Array.from({ length: 100_001 }, (_, index) => ({
      id: `node_${index}`,
      label: `Node ${index}`,
    }));

    writeFileSync(ancestor, JSON.stringify({ directed: false, graph: {}, nodes: [], links: [] }), "utf-8");
    writeFileSync(current, JSON.stringify({ directed: false, graph: {}, nodes: tooManyNodes, links: [] }), "utf-8");
    writeFileSync(other, JSON.stringify({ directed: false, graph: {}, nodes: [], links: [] }), "utf-8");

    expect(() => mergeGraphJsonFiles(ancestor, current, other)).toThrow("exceeds 100000-node cap");
  });

  // F5: the node merge picked one branch's K-set + one count (last-write-wins),
  // silently dropping the other branch's distinct citations. Union them by
  // identity and set citation_count = max(both counts, |union|).
  it("unions a node's citations across both branches and reconciles citation_count", () => {
    const dir = tempDir();
    const ancestor = join(dir, "ancestor.json");
    const current = join(dir, "current.json");
    const other = join(dir, "other.json");

    const baseNode = { id: "hub", label: "Hub", source_file: "doc.txt", file_type: "document" as const };

    writeFileSync(
      ancestor,
      JSON.stringify({ directed: false, graph: {}, nodes: [baseNode], links: [] }),
      "utf-8",
    );
    writeFileSync(
      current,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          {
            ...baseNode,
            citation_count: 5,
            citations: [
              { source_file: "a.txt", page: 1 },
              { source_file: "b.txt", page: 2 },
            ],
          },
        ],
        links: [],
      }),
      "utf-8",
    );
    writeFileSync(
      other,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          {
            ...baseNode,
            citation_count: 7,
            citations: [
              { source_file: "b.txt", page: 2 }, // overlap with current
              { source_file: "c.txt", page: 3 },
            ],
          },
        ],
        links: [],
      }),
      "utf-8",
    );

    mergeGraphJsonFiles(ancestor, current, other);
    const merged = JSON.parse(readFileSync(current, "utf-8")) as {
      nodes: Array<{ id: string; citations?: Array<{ source_file?: string; page?: number }>; citation_count?: number }>;
    };
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    // deduped union a:1, b:2, c:3 (3 distinct) — NOT one branch's 2.
    const keys = (hub.citations ?? []).map((c) => `${c.source_file}:${c.page}`).sort();
    expect(keys).toEqual(["a.txt:1", "b.txt:2", "c.txt:3"]);
    // count = max(5, 7, |union|=3) = 7 (never silently below either branch).
    expect(hub.citation_count).toBe(7);
  });
});
