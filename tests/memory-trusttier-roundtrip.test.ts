/**
 * Trust-tier PRESERVATION across the storage round-trip (WP3 storage, go-live mode 1).
 *
 * Context (g-arch review, 2026-08-08): the inter-tier reconciliation guard
 * `violatesTrustTier` is ALREADY tested in isolation (ontology-reconciliation-trust-tier),
 * and the LIVE round-trip already asserts an admitted note recalls with trust:'asserted'
 * (memory-operational-roundtrip:61). The remaining STORAGE gap is:
 *   (1) the `trust` tier survives BOTH write paths — `appendNode` (memory admission) AND
 *       `pushGraph` (agent-stats earned projection), not just the admission path;
 *   (2) an OFFLINE proof (driver-injected) that runs when GRAPHIFY_TEST_POSTGRES_URL is absent,
 *       the local authority per the branch contract.
 *
 * DIRECT-FIRST (g-arch): assert trust is carried by the WRITE, immune to any future
 * §3.4 `reconcilable` wiring — a behavioural-only test would rot silently green once
 * that ratified opt-out is consumed. The end-to-end behavioural proof (recall + the
 * asserted×earned pair is NOT emitted) rides the live-gated block below.
 *
 * NOTE: `violatesTrustTier` belongs to the ONTOLOGY lot and is NOT modified here — this
 * verifies storage preservation only (RACI, g-arch).
 */
import { describe, expect, it } from "vitest";

// --- Fake pg driver: records every write's params, returns canned reads. -----
interface RecordedSql {
  via: "pool" | "client";
  text: string;
  params?: unknown[];
}
interface InMemoryPgState {
  queries: RecordedSql[];
  connects: number;
  poolEnded: boolean;
}
function freshState(): InMemoryPgState {
  return { queries: [], connects: 0, poolEnded: false };
}
function makeFakePgModule(state: InMemoryPgState) {
  class FakePool {
    constructor(_config?: Record<string, unknown>) {}
    query(text: string, params?: unknown[]) {
      state.queries.push({ via: "pool", text, params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    connect() {
      state.connects += 1;
      const client = {
        query(text: string, params?: unknown[]) {
          state.queries.push({ via: "client", text, params });
          return Promise.resolve({ rows: [], rowCount: 0 });
        },
        release() {},
      };
      return Promise.resolve(client);
    }
    end() {
      state.poolEnded = true;
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

async function makeStore(state: InMemoryPgState) {
  const mod = await import("../src/storage/postgres.js");
  return mod.createPostgresGraphStore(
    { connectionString: "postgres://u:p@localhost:5432/testdb", citySlug: "test_city" },
    { driverModule: makeFakePgModule(state) } as never,
  );
}

/**
 * True iff some recorded write carried `trust:<tier>` in a param. The props bag is
 * persisted as a JSON STRING param (buildPropsBag), so we PARSE each string param and
 * check the `trust` field — immune to key ordering / whitespace, so a serialisation
 * change never produces a false RED (a raw substring match would, and a false red erodes
 * trust in the suite as surely as a false green — g-arch). A dropped tier leaves props
 * with no `trust`, so this returns false — green measures preservation, never vacuously.
 */
function writePreservesTrust(state: InMemoryPgState, tier: string): boolean {
  return state.queries.some((q) =>
    (q.params ?? []).some((p) => {
      if (typeof p !== "string") return false;
      try {
        return (JSON.parse(p) as Record<string, unknown>).trust === tier;
      } catch {
        return false;
      }
    }),
  );
}

describe("storage trust-tier WRITE-PATH preservation (offline, driver-injected)", () => {
  it("appendNode carries trust:'asserted' into the persisted props (memory admission path)", async () => {
    const state = freshState();
    const store = await makeStore(state);
    try {
      // A data-pure MemoryNote input as the memory port would append it: trust is a
      // non-schema attribute, so it must ride the props jsonb (buildPropsBag).
      await store.appendNode!({
        id: "note:1",
        label: "Sherlock Holmes",
        node_type: "MemoryNote",
        trust: "asserted",
        t: 1_700_000_000_000,
      } as never);
      // DIRECT assertion: the write serialised the tier. Immune to future §3.4
      // `reconcilable` wiring — this measures preservation, not pair-absence.
      expect(writePreservesTrust(state, "asserted")).toBe(true);
    } finally {
      await store.close();
    }
  });

  it("pushGraph carries trust:'earned' into the persisted props (agent-stats earned path)", async () => {
    const state = freshState();
    const store = await makeStore(state);
    try {
      const graphology = await import("graphology");
      const G = new graphology.default({ type: "directed", multi: true });
      // An EARNED node (Project) as the agent-stats projection stamps it.
      G.addNode("proj:1", {
        label: "graphify",
        node_type: "Project",
        trust: "earned",
        t: 1_700_000_000_000,
      });
      await store.pushGraph(G as never, new Map());
      expect(writePreservesTrust(state, "earned")).toBe(true);
    } finally {
      await store.close();
    }
  });

  // The READ half — that read-back reconstructs `trust` from the props bag — is the
  // end-to-end authority in the live-gated block below (loadNode). `nodeRecordFromRow`
  // spreads the parsed props over the record ({...props, id}), and the D5 fold-out
  // audit confirmed the read surfaces return `n.props` verbatim; a vacuous offline
  // guard on an unexported helper would only rot green, so it is deliberately omitted.
});

// --- End-to-end behavioural proof (real SQL): the pair is NOT emitted. --------
// Runs only with a live Postgres. Asserts trust survives BOTH write paths through
// a real round-trip, THEN that reconciliation refuses the asserted×earned pair.
describe.skipIf(!process.env.GRAPHIFY_TEST_POSTGRES_URL)(
  "storage trust-tier round-trip: live end-to-end (asserted × earned coexist → pair refused)",
  () => {
    it("preserves both tiers and the inter-tier guard bites on round-tripped nodes", async () => {
      const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
      const { generateOntologyReconciliationCandidates } = await import(
        "../src/ontology-reconciliation.js"
      );
      const connectionString = process.env.GRAPHIFY_TEST_POSTGRES_URL!;
      const store = await createPostgresGraphStore({ connectionString, citySlug: "trusttier_rt" });
      try {
        const graphology = await import("graphology");
        // Same node_type on BOTH sides — the type-guard requires it before the
        // trust guard is even consulted (two Projects of different tier).
        const G = new graphology.default({ type: "directed", multi: true });
        G.addNode("earned:proj", { label: "Acme", node_type: "Project", trust: "earned" });
        G.addNode("asserted:proj", { label: "Acme", node_type: "Project", trust: "asserted" });
        await store.pushGraph(G as never, new Map());

        // Read the two nodes back out of the SAME store.
        const backEarned = await store.loadNode!("earned:proj");
        const backAsserted = await store.loadNode!("asserted:proj");
        // DIRECT-FIRST: the tier survived the round-trip on BOTH write-back sides.
        expect(backEarned?.trust).toBe("earned");
        expect(backAsserted?.trust).toBe("asserted");

        // Behavioural, second: the inter-tier guard removes the pair — the emitted
        // candidate queue does NOT contain the asserted×earned pair (pair rejection,
        // not "earned wins").
        const nodes = [backEarned, backAsserted].map((n) => ({
          id: (n as Record<string, unknown>).id,
          label: (n as Record<string, unknown>).label,
          type: "Project",
          trust: (n as Record<string, unknown>).trust,
        }));
        const result = generateOntologyReconciliationCandidates(
          { nodes, relations: [] } as never,
          {} as never,
        );
        expect((result as { candidates: unknown[] }).candidates).toHaveLength(0);
      } finally {
        await store.clear({ force: true });
        await store.close();
      }
    });
  },
);
