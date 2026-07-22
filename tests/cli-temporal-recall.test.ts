/**
 * T6 CLI/API integration: deterministic file fallback, configured store
 * capability gating, snapshot disclosure, and no post-selection fallback.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  recallAsOf,
  runTemporalRecall,
  TEMPORAL_RECALL_SCHEMA,
  type TemporalRecallOptions,
} from "../src/temporal-recall.js";
import type { GraphStore, GraphStoreConfig } from "../src/storage/types.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-recall-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeGraph(): string {
  const path = join(tempDir(), "graph.json");
  writeFileSync(
    path,
    JSON.stringify({
      graph: {
        provenance: { source_owner: "fixture", source_hash: "abc123" },
      },
      topology_signature: "n=2;e=1;a,b|a\\tb\\tactive",
      nodes: [
        { id: "future", label: "Future", t: 200, t_end: 200 },
        { id: "active", label: "Active", node_type: "Session", t: 50, t_src: "startedAt" },
      ],
      links: [
        { source: "active", target: "future", relation: "active", t: 50 },
      ],
    }),
  );
  return path;
}

interface FakeStoreOptions {
  capable?: boolean;
  query?: GraphStore["queryWindow"];
  close?: () => Promise<void>;
}

function fakeStore(options: FakeStoreOptions = {}): GraphStore {
  const capable = options.capable !== false;
  return {
    id: "fake-time",
    capabilities: {
      push: true,
      query: false,
      clear: false,
      snapshotMeta: true,
      ...(capable ? { queryWindow: true as const } : {}),
    },
    async verifyConnection() {},
    async pushGraph() {
      return { nodes: 0, edges: 0, warnings: [], durationMs: 0 };
    },
    async readSnapshotMeta() {
      return {
        topologySignature: "n=2;e=1;store",
        pushedAt: "2026-07-22T00:00:00.000Z",
        toolVersion: "0.17.2",
      };
    },
    ...(capable
      ? {
          queryWindow:
            options.query ??
            (async () => ({
              nodes: [],
              edges: [],
            })),
        }
      : {}),
    close: options.close ?? (async () => {}),
  };
}

describe("temporal recall file CLI", () => {
  it("lets an explicit --graph force file recall and keeps --json machine-pure", async () => {
    const graph = writeGraph();
    const lines: string[] = [];
    const resolveStore = vi.fn(async () => fakeStore());
    const result = await runTemporalRecall(
      { asOf: "100", graph, json: true },
      {
        env: { GRAPHIFY_STORE: "postgres" } as NodeJS.ProcessEnv,
        resolveStore,
        log: (line) => lines.push(line),
      },
    );

    expect(resolveStore).not.toHaveBeenCalled();
    expect(result.source).toMatchObject({
      kind: "file",
      path: graph,
      topologySignatureSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      provenance: { source_owner: "fixture", source_hash: "abc123" },
      freshness: "unverified",
    });
    expect(result.nodes.map((node) => node.id)).toEqual(["active"]);
    expect(result.edges.map((edge) => edge.relation)).toEqual(["active"]);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(result);
    expect(lines[0]).not.toContain("Temporal graph recall at");
  });

  it("renders a non-claiming human summary", async () => {
    const lines: string[] = [];
    await runTemporalRecall(
      { asOf: 100, graph: writeGraph() },
      { env: {} as NodeJS.ProcessEnv, log: (line) => lines.push(line) },
    );
    expect(lines.join("\n")).toMatch(/Temporal graph recall at/);
    expect(lines.join("\n")).toMatch(/Freshness\/provenance: unverified/);
    expect(lines.join("\n")).toMatch(/result is unpaged/);
    expect(lines.join("\n")).not.toMatch(/authored memory|semantic recall|persona recall/i);
  });

  it("rejects two explicit sources", async () => {
    await expect(
      recallAsOf(
        { asOf: 100, graph: writeGraph(), store: "postgres" },
        { env: {} as NodeJS.ProcessEnv },
      ),
    ).rejects.toThrow(/mutually exclusive/);
  });
});

describe("temporal recall configured store", () => {
  it("delegates an equal-bound point window, sorts results, and discloses the snapshot", async () => {
    const queryWindow = vi.fn(async () => ({
      nodes: [
        { id: "b", label: "B", t: 100, t_end: 100 },
        { id: "a", label: "A", t: 50 },
      ],
      edges: [
        { source: "b", target: "a", relation: "z", t: 100, t_end: 100 },
        { source: "a", target: "b", relation: "a", t: 50 },
      ],
    }));
    const close = vi.fn(async () => {});
    const resolveStore = vi.fn(async (_id: string, _config: GraphStoreConfig) =>
      fakeStore({ query: queryWindow, close }),
    );

    const result = await recallAsOf(
      { asOf: "1970-01-01T00:00:00.100Z", store: "fake-time" },
      {
        env: {} as NodeJS.ProcessEnv,
        resolveStore,
        readGraph: () => {
          throw new Error("file fallback must not run");
        },
      },
    );

    expect(result.schema).toBe(TEMPORAL_RECALL_SCHEMA);
    expect(result.asOfMs).toBe(100);
    expect(result.asOfIso).toBe("1970-01-01T00:00:00.100Z");
    expect(queryWindow).toHaveBeenCalledWith(100, 100);
    expect(result.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(result.edges.map((edge) => edge.relation)).toEqual(["a", "z"]);
    expect(result.source).toMatchObject({
      kind: "store",
      storeId: "fake-time",
      snapshot: {
        topologySignatureSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        toolVersion: "0.17.2",
      },
      freshness: "unverified",
    });
    expect(result.unpaged).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses only the store's configured namespace and accepts no caller override", async () => {
    const root = tempDir();
    const config = join(root, "graphify.yaml");
    writeFileSync(
      config,
      [
        "version: 1",
        "profile:",
        "  path: graphify/profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: postgres",
        "      namespace: tenant_a",
        "",
      ].join("\n"),
    );
    const queryWindow = vi.fn(async () => ({ nodes: [], edges: [] }));
    const resolveStore = vi.fn(async (id: string, storeConfig: GraphStoreConfig) => {
      expect(id).toBe("postgres");
      expect(storeConfig.namespace).toBe("tenant_a");
      return fakeStore({ query: queryWindow });
    });
    const withUntrustedExtra = {
      asOf: 100,
      config,
      namespace: "tenant_b",
    } as TemporalRecallOptions;

    const result = await recallAsOf(withUntrustedExtra, {
      env: {} as NodeJS.ProcessEnv,
      resolveStore,
    });
    expect(queryWindow).toHaveBeenCalledWith(100, 100);
    expect(result.source).toMatchObject({
      kind: "store",
      namespace: "tenant_a",
    });
  });

  it("returns an empty configured-store result without reading graph.json", async () => {
    const readGraph = vi.fn(() => {
      throw new Error("must not fall back");
    });
    const result = await recallAsOf(
      { asOf: 100, store: "fake-time" },
      {
        env: {} as NodeJS.ProcessEnv,
        resolveStore: async () => fakeStore(),
        readGraph,
      },
    );
    expect(result.source.kind).toBe("store");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(readGraph).not.toHaveBeenCalled();
  });

  it("surfaces capability misses and query failures without file fallback", async () => {
    const readGraph = vi.fn(() => {
      throw new Error("must not fall back");
    });
    const closeMissing = vi.fn(async () => {});
    await expect(
      recallAsOf(
        { asOf: 100, store: "file" },
        {
          env: {} as NodeJS.ProcessEnv,
          resolveStore: async () => fakeStore({ capable: false, close: closeMissing }),
          readGraph,
        },
      ),
    ).rejects.toThrow(/does not support temporal recall/);
    expect(closeMissing).toHaveBeenCalledOnce();

    const closeFailed = vi.fn(async () => {});
    await expect(
      recallAsOf(
        { asOf: 100, store: "fake-time" },
        {
          env: {} as NodeJS.ProcessEnv,
          resolveStore: async () =>
            fakeStore({
              query: async () => {
                throw new Error("store unavailable");
              },
              close: closeFailed,
            }),
          readGraph,
        },
      ),
    ).rejects.toThrow(/store unavailable/);
    expect(closeFailed).toHaveBeenCalledOnce();
    expect(readGraph).not.toHaveBeenCalled();
  });
});
