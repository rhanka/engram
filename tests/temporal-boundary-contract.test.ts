import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { sliceGraphByTime } from "../src/graph-time-slice.js";
import { createPostgresGraphStore } from "../src/storage/postgres.js";
import { createSqliteGraphStore } from "../src/storage/sqlite.js";
import { buildStudioScene } from "../src/studio-scene.js";
import { filterTemporalWindow, recallAsOf } from "../src/temporal-recall.js";
// @ts-expect-error — plain ESM JS module, no type declarations.
import { applyTimeFilter, sceneTimeRange } from "../studio/src/lib/graphAdapter.js";
import {
  TEMPORAL_CURSOR,
  TEMPORAL_VISIBLE_EDGE_RELATIONS,
  TEMPORAL_VISIBLE_NODE_IDS,
  temporalBoundaryFixture,
  temporalBoundaryGraph,
} from "./fixtures/temporal-boundary.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";
import { loadSqliteTestDriver } from "./fixtures/sqlite-host-driver.js";

function ids(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

function relations(items: ReadonlyArray<{ relation: string }>): string[] {
  return items.map((item) => item.relation);
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-temporal-boundary-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("closed temporal interval contract", () => {
  it("executes all 7 boundary cases identically across in-memory store, SQLite, recall, time slice, scene, and browser renderer", async () => {
    const fixture = temporalBoundaryFixture();
    const { G, communities } = temporalBoundaryGraph();

    // 1. Direct in-memory temporal window filter
    const recalled = filterTemporalWindow(fixture, TEMPORAL_CURSOR, TEMPORAL_CURSOR);
    expect(ids(recalled.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(recalled.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

    // 2. In-memory store through recallAsOf
    const fromInMemoryStore = await recallAsOf(
      { asOf: TEMPORAL_CURSOR, store: "temporal-fixture" },
      {
        resolveStore: async () => ({
          capabilities: { queryWindow: true },
          queryWindow: async (fromMs: number, toMs: number) =>
            filterTemporalWindow(fixture, fromMs, toMs),
          readSnapshotMeta: async () => ({
            topologySignature: "temporal-fixture",
            pushedAt: new Date(TEMPORAL_CURSOR).toISOString(),
            toolVersion: "test",
          }),
          close: async () => undefined,
        }) as never,
      },
    );
    expect(ids(fromInMemoryStore.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(fromInMemoryStore.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

    // 3. Real SQLite store (queryWindow + recallAsOf)
    const sqliteDir = makeTempDir();
    const sqliteFile = join(sqliteDir, "temporal.sqlite");
    const sqliteDriver = await loadSqliteTestDriver();
    const sqliteStore = await createSqliteGraphStore({
      citySlug: "temporal-boundary",
      target: sqliteFile,
    }, { driverModule: sqliteDriver });
    try {
      await sqliteStore.pushGraph(G, communities, { mode: "replace" });
      const sqliteWindow = await sqliteStore.queryWindow(TEMPORAL_CURSOR, TEMPORAL_CURSOR);
      expect(ids(sqliteWindow.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
      expect(relations(sqliteWindow.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

      const fromSqliteRecall = await recallAsOf(
        { asOf: TEMPORAL_CURSOR, store: "sqlite" },
        {
          resolveStore: async () =>
            createSqliteGraphStore({
              citySlug: "temporal-boundary",
              target: sqliteFile,
            }, { driverModule: sqliteDriver }),
        },
      );
      expect(ids(fromSqliteRecall.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
      expect(relations(fromSqliteRecall.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);
      expect(sqliteWindow.interval_convention).toBe("closed-v1");
      expect(fromSqliteRecall.interval_convention).toBe("closed-v1");
    } finally {
      await sqliteStore.close();
    }

    // 4. Time slice
    const sliced = sliceGraphByTime(fixture, {
      sinceMs: TEMPORAL_CURSOR,
      untilMs: TEMPORAL_CURSOR,
    });
    expect(ids(sliced.graph.nodes ?? [])).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations((sliced.graph.links ?? []) as Array<{ relation: string }>)).toEqual(
      TEMPORAL_VISIBLE_EDGE_RELATIONS,
    );

    // 5. Studio scene + browser renderer
    const scene = buildStudioScene(fixture);
    const rendered = applyTimeFilter(scene, TEMPORAL_CURSOR);
    expect(ids(rendered.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(rendered.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

    expect(recalled.interval_convention).toBe("closed-v1");
    expect(fromInMemoryStore.interval_convention).toBe("closed-v1");
    expect(sliced.window.interval_convention).toBe("closed-v1");
    expect(rendered.temporal.interval_convention).toBe("closed-v1");
  });

  it("active filter drops untimed elements and scene range spans all finite t and t_end bounds", () => {
    const scene = buildStudioScene(temporalBoundaryFixture());
    const active = applyTimeFilter(scene, TEMPORAL_CURSOR);

    expect(ids(active.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(active.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);
    expect(sceneTimeRange(scene)).toEqual({
      min: TEMPORAL_CURSOR - 2,
      max: TEMPORAL_CURSOR + 2,
    });
  });
});

const EXPLICIT_POSTGRES_URL = process.env.GRAPHIFY_TEST_POSTGRES_URL;
const pgLane =
  EXPLICIT_POSTGRES_URL !== undefined && EXPLICIT_POSTGRES_URL.length > 0
    ? ({ lane: "run" } as const)
    : postgresLaneDecision(["16"]);

if (pgLane.lane === "fail") {
  const cause = pgLane.cause;
  describe("closed temporal interval contract: live Postgres parity", () => {
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(cause);
    });
  });
} else {
  describe.skipIf(pgLane.lane !== "run")(
    "closed temporal interval contract: live Postgres parity",
    () => {
      let connectionString = EXPLICIT_POSTGRES_URL as string;
      let stopEphemeral: (() => void) | undefined;
      const citySlug = `temporal_boundary_${Date.now()}`;

      beforeAll(async () => {
        if (EXPLICIT_POSTGRES_URL !== undefined && EXPLICIT_POSTGRES_URL.length > 0) return;
        const postgres = await startEphemeralPostgres("16");
        stopEphemeral = postgres.stop;
        connectionString = postgres.connection;
      }, 120_000);

      afterAll(() => {
        stopEphemeral?.();
      });

      it("matches in-memory, SQLite, time slice, scene, and browser renderer on live Postgres", async () => {
        const { G, communities } = temporalBoundaryGraph();
        const dir = makeTempDir();
        const pgDriver = await import("pg");
        const pgStore = await createPostgresGraphStore({
          connectionString,
          citySlug,
          target: dir,
        }, { driverModule: pgDriver });
        try {
          await pgStore.pushGraph(G, communities, { mode: "replace" });
          const pgWindow = await pgStore.queryWindow(TEMPORAL_CURSOR, TEMPORAL_CURSOR);
          expect(pgWindow.interval_convention).toBe("closed-v1");
          expect(ids(pgWindow.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
          expect(relations(pgWindow.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

          const pgRecalled = await recallAsOf(
            { asOf: TEMPORAL_CURSOR, store: "postgres" },
            {
              resolveStore: async () =>
                createPostgresGraphStore({
                  connectionString,
                  citySlug,
                  target: dir,
                }, { driverModule: pgDriver }),
            },
          );
          expect(pgRecalled.interval_convention).toBe("closed-v1");
          expect(ids(pgRecalled.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
          expect(relations(pgRecalled.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);
        } finally {
          await pgStore.clear({ force: true });
          await pgStore.close();
        }
      });
    },
  );
}
