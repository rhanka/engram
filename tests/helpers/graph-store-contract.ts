/**
 * Shared GraphStore contract suite (SPEC_STORAGE_BACKENDS.md, Tests).
 * Every backend adapter must pass this suite at the port boundary so all
 * mirrors behave identically: idempotent push, coherent results, snapshot
 * meta round-trip, force-gated clear, idempotent close, write-free dryRun.
 */
import { describe, expect, it } from "vitest";
import Graph from "graphology";
import type { GraphStore } from "../../src/storage/types.js";

/**
 * Widened clear signature shared by implementations: destructive clears are
 * gated on an explicit force option (the port keeps `clear?(namespace?)`).
 */
type ContractGraphStore = GraphStore & {
  clear?(options?: string | { namespace?: string; force?: boolean }): Promise<void>;
};

export interface ContractFixture {
  G: Graph;
  communities: Map<number, string[]>;
}

/** Small deterministic graph: 3 nodes, 2 edges, 2 communities. */
export function contractFixture(): ContractFixture {
  const G = new Graph();
  G.addNode("alpha", { label: "Alpha", file_type: "code", source_file: "src/a.ts" });
  G.addNode("beta", { label: "Beta", file_type: "code", source_file: "src/b.ts" });
  G.addNode("gamma", { label: "Gamma", file_type: "doc", source_file: "docs/g.md" });
  G.addEdge("alpha", "beta", { relation: "imports", confidence: "EXTRACTED" });
  G.addEdge("beta", "gamma", { relation: "documents", confidence: "INFERRED" });
  return { G, communities: new Map([[0, ["alpha", "beta"]], [1, ["gamma"]]]) };
}

/** A different topology, used to prove dryRun never reaches the backend. */
function alternateFixture(): ContractFixture {
  const G = new Graph();
  G.addNode("delta", { label: "Delta", file_type: "code", source_file: "src/d.ts" });
  return { G, communities: new Map([[0, ["delta"]]]) };
}

export function describeGraphStoreContract(
  name: string,
  makeStore: () => Promise<GraphStore> | GraphStore,
): void {
  describe(`GraphStore contract: ${name}`, () => {
    it("pushes idempotently: same data twice yields the same counts without error", async () => {
      const store = await makeStore();
      const { G, communities } = contractFixture();
      try {
        const first = await store.pushGraph(G, communities);
        const second = await store.pushGraph(G, communities);
        expect(first.nodes).toBe(G.order);
        expect(first.edges).toBe(G.size);
        expect(second.nodes).toBe(first.nodes);
        expect(second.edges).toBe(first.edges);
      } finally {
        await store.close();
      }
    });

    it("returns a coherent push result", async () => {
      const store = await makeStore();
      const { G, communities } = contractFixture();
      try {
        const result = await store.pushGraph(G, communities);
        expect(result.nodes).toBe(G.order);
        expect(result.edges).toBe(G.size);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(typeof result.durationMs).toBe("number");
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      } finally {
        await store.close();
      }
    });

    it("round-trips snapshot meta: undefined before push, signature after", async () => {
      const store = await makeStore();
      const { G, communities } = contractFixture();
      try {
        if (!store.capabilities.snapshotMeta) return;
        expect(await store.readSnapshotMeta()).toBeUndefined();

        await store.pushGraph(G, communities);
        const meta = await store.readSnapshotMeta();
        expect(meta).toBeDefined();
        expect(typeof meta!.topologySignature).toBe("string");
        expect(meta!.topologySignature.length).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(meta!.pushedAt))).toBe(false);
        expect(typeof meta!.toolVersion).toBe("string");
        expect(meta!.toolVersion.length).toBeGreaterThan(0);

        // Same data re-pushed keeps the same snapshot signature.
        await store.pushGraph(G, communities);
        const again = await store.readSnapshotMeta();
        expect(again!.topologySignature).toBe(meta!.topologySignature);
      } finally {
        await store.close();
      }
    });

    it("rejects clear without force", async () => {
      const store = (await makeStore()) as ContractGraphStore;
      const { G, communities } = contractFixture();
      try {
        if (!store.capabilities.clear || !store.clear) return;
        await store.pushGraph(G, communities);
        await expect(store.clear()).rejects.toThrow(/force/i);
      } finally {
        await store.close();
      }
    });

    it("clears the backend with force", async () => {
      const store = (await makeStore()) as ContractGraphStore;
      const { G, communities } = contractFixture();
      try {
        if (!store.capabilities.clear || !store.clear) return;
        await store.pushGraph(G, communities);
        await store.clear({ force: true });
        if (store.capabilities.snapshotMeta) {
          expect(await store.readSnapshotMeta()).toBeUndefined();
        }
      } finally {
        await store.close();
      }
    });

    it("close is idempotent", async () => {
      const store = await makeStore();
      await store.close();
      await expect(store.close()).resolves.toBeUndefined();
    });

    it("dryRun reports counts without modifying the backend", async () => {
      const store = await makeStore();
      const { G, communities } = contractFixture();
      const alternate = alternateFixture();
      try {
        // dryRun on a fresh store leaves it untouched.
        const planned = await store.pushGraph(G, communities, { dryRun: true });
        expect(planned.nodes).toBe(G.order);
        expect(planned.edges).toBe(G.size);
        if (store.capabilities.snapshotMeta) {
          expect(await store.readSnapshotMeta()).toBeUndefined();
        }

        // dryRun after a real push leaves the previous snapshot intact even
        // when the planned graph differs.
        await store.pushGraph(G, communities);
        const before = await store.readSnapshotMeta();
        const replan = await store.pushGraph(alternate.G, alternate.communities, { dryRun: true });
        expect(replan.nodes).toBe(alternate.G.order);
        expect(replan.edges).toBe(alternate.G.size);
        if (store.capabilities.snapshotMeta) {
          const after = await store.readSnapshotMeta();
          expect(after?.topologySignature).toBe(before?.topologySignature);
        }
      } finally {
        await store.close();
      }
    });
  });
}
