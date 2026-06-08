import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { contractFixture, describeGraphStoreContract } from "./helpers/graph-store-contract.js";
import { createFileGraphStore } from "../src/storage/file.js";
import {
  listGraphStoreIds,
  registerGraphStoreFactory,
  resolveGraphStore,
} from "../src/storage/registry.js";
import type { GraphStore, GraphStoreConfig, StoreTestDeps } from "../src/storage/types.js";

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-storage-file-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function fakeStore(id: string): GraphStore {
  return {
    id,
    capabilities: { push: true, query: false, clear: false, snapshotMeta: false },
    async verifyConnection() {},
    async pushGraph(G) {
      return { nodes: G.order, edges: G.size, warnings: [], durationMs: 0 };
    },
    async readSnapshotMeta() {
      return undefined;
    },
    async close() {},
  };
}

describeGraphStoreContract("FileGraphStore", () =>
  createFileGraphStore({ target: join(tempDir(), "graph.json") }));

describe("FileGraphStore specifics", () => {
  it("requires config.target", () => {
    expect(() => createFileGraphStore({})).toThrow(/target/);
  });

  it("writes the canonical graph.json serialization and reads its signature", async () => {
    const target = join(tempDir(), "graph.json");
    const store = createFileGraphStore({ target });
    const { G, communities } = contractFixture();

    await store.pushGraph(G, communities);

    const persisted = JSON.parse(readFileSync(target, "utf-8")) as {
      topology_signature?: string;
      nodes?: unknown[];
      links?: unknown[];
    };
    expect(persisted.nodes).toHaveLength(G.order);
    expect(persisted.links).toHaveLength(G.size);
    expect(typeof persisted.topology_signature).toBe("string");

    const meta = await store.readSnapshotMeta();
    expect(meta?.topologySignature).toBe(persisted.topology_signature);
    await store.close();
  });

  it("treats merge and replace as the same file write", async () => {
    const target = join(tempDir(), "graph.json");
    const store = createFileGraphStore({ target });
    const { G, communities } = contractFixture();

    await store.pushGraph(G, communities, { mode: "merge" });
    const merged = readFileSync(target, "utf-8");
    await store.pushGraph(G, communities, { mode: "replace" });
    const replaced = readFileSync(target, "utf-8");

    expect(replaced).toBe(merged);
    await store.close();
  });

  it("refuses clear without force and keeps the mirror file", async () => {
    const target = join(tempDir(), "graph.json");
    const store = createFileGraphStore({ target });
    const { G, communities } = contractFixture();

    await store.pushGraph(G, communities);
    await expect(store.clear()).rejects.toThrow(/force/i);
    expect(existsSync(target)).toBe(true);

    await store.clear({ force: true });
    expect(existsSync(target)).toBe(false);
    await store.close();
  });

  it("verifyConnection accepts a fresh path and rejects a directory target", async () => {
    const dir = tempDir();
    const store = createFileGraphStore({ target: join(dir, "graph.json") });
    await expect(store.verifyConnection()).resolves.toBeUndefined();
    await store.close();

    const directoryStore = createFileGraphStore({ target: dir });
    await expect(directoryStore.verifyConnection()).rejects.toThrow(/directory/);
    await directoryStore.close();
  });
});

describe("graph store registry", () => {
  it("lists only the file store in PR2", () => {
    expect(listGraphStoreIds()).toEqual(["file"]);
  });

  it("fails with an actionable message for an unknown store id", async () => {
    await expect(resolveGraphStore("nope", {})).rejects.toThrow(
      "unknown store 'nope'. Available: file",
    );
  });

  it("resolves the file store", async () => {
    const target = join(tempDir(), "graph.json");
    const store = await resolveGraphStore("file", { target });
    const { G, communities } = contractFixture();

    expect(store.id).toBe("file");
    const result = await store.pushGraph(G, communities);
    expect(result.nodes).toBe(G.order);
    expect(existsSync(target)).toBe(true);
    await store.close();
  });

  it("fails with an actionable install message when the driver package is missing", async () => {
    registerGraphStoreFactory({
      id: "fake-neo4j",
      requiredPackage: "graphify-test-missing-driver",
      async create() {
        return fakeStore("fake-neo4j");
      },
    });

    await expect(resolveGraphStore("fake-neo4j", {})).rejects.toThrow(
      "store 'fake-neo4j' requires graphify-test-missing-driver. " +
        "Run: npm install graphify-test-missing-driver",
    );
  });

  it("skips the driver import when tests inject a driver module", async () => {
    const injected = { driver: () => "fake" };
    let received: StoreTestDeps | undefined;
    registerGraphStoreFactory({
      id: "fake-injected",
      requiredPackage: "graphify-test-missing-driver",
      async create(_config: GraphStoreConfig, deps?: StoreTestDeps) {
        received = deps;
        return fakeStore("fake-injected");
      },
    });

    const store = await resolveGraphStore("fake-injected", {}, { driverModule: injected });
    expect(store.id).toBe("fake-injected");
    expect(received?.driverModule).toBe(injected);
    await store.close();
  });
});
