/**
 * Postgres temporal queryWindow tests (agent-stats time-oriented T5).
 *
 * The injected pg fake retains pushed JSONB props and evaluates the normative
 * overlap contract, giving a push -> queryWindow round trip without requiring
 * a local database. SQL-shape assertions separately lock down safe casts,
 * indexes, schema qualification, and parameterized namespace scope.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";
import type { PostgresGraphStore } from "../src/storage/postgres.js";

interface RecordedSql {
  via: "pool" | "client";
  text: string;
  params?: unknown[];
}

interface NodeRow {
  city_slug: string;
  id: string;
  label: string | null;
  type: string | null;
  community: number | null;
  props: Record<string, unknown>;
}

interface EdgeRow {
  city_slug: string;
  source_id: string;
  target_id: string;
  relation: string;
  confidence: string | null;
  props: Record<string, unknown>;
}

interface InMemoryPgState {
  queries: RecordedSql[];
  nodes: NodeRow[];
  edges: EdgeRow[];
}

const NODE_COLS = 6;
const EDGE_COLS = 6;

function freshState(): InMemoryPgState {
  return { queries: [], nodes: [], edges: [] };
}

function props(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  const parsed: unknown = JSON.parse(value);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function ingestNodes(state: InMemoryPgState, params: unknown[] | undefined): void {
  if (!params) return;
  for (let i = 0; i + NODE_COLS <= params.length; i += NODE_COLS) {
    const row: NodeRow = {
      city_slug: String(params[i]),
      id: String(params[i + 1]),
      label: params[i + 2] == null ? null : String(params[i + 2]),
      type: params[i + 3] == null ? null : String(params[i + 3]),
      community: params[i + 4] == null ? null : Number(params[i + 4]),
      props: props(params[i + 5]),
    };
    const index = state.nodes.findIndex(
      (candidate) => candidate.city_slug === row.city_slug && candidate.id === row.id,
    );
    if (index >= 0) state.nodes[index] = row;
    else state.nodes.push(row);
  }
}

function ingestEdges(state: InMemoryPgState, params: unknown[] | undefined): void {
  if (!params) return;
  for (let i = 0; i + EDGE_COLS <= params.length; i += EDGE_COLS) {
    const row: EdgeRow = {
      city_slug: String(params[i]),
      source_id: String(params[i + 1]),
      target_id: String(params[i + 2]),
      relation: String(params[i + 3]),
      confidence: params[i + 4] == null ? null : String(params[i + 4]),
      props: props(params[i + 5]),
    };
    const index = state.edges.findIndex(
      (candidate) =>
        candidate.city_slug === row.city_slug &&
        candidate.source_id === row.source_id &&
        candidate.target_id === row.target_id &&
        candidate.relation === row.relation,
    );
    if (index >= 0) state.edges[index] = row;
    else state.edges.push(row);
  }
}

function overlaps(record: { props: Record<string, unknown> }, fromMs: number, toMs: number) {
  const start = record.props.t;
  if (typeof start !== "number" || !Number.isFinite(start)) return false;
  if (start > toMs) return false;
  if (!Object.prototype.hasOwnProperty.call(record.props, "t_end")) return true;
  const end = record.props.t_end;
  return typeof end === "number" && Number.isFinite(end) && end >= start && end >= fromMs;
}

function answer(state: InMemoryPgState, text: string, params?: unknown[]) {
  const upper = text.toUpperCase();

  if (text.includes("DELETE FROM") && text.includes("graph_nodes")) {
    const namespace = String(params?.[0]);
    state.nodes = state.nodes.filter((row) => row.city_slug !== namespace);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("DELETE FROM") && text.includes("graph_edges")) {
    const namespace = String(params?.[0]);
    state.edges = state.edges.filter((row) => row.city_slug !== namespace);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("INSERT INTO") && text.includes("graph_nodes")) {
    ingestNodes(state, params);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("INSERT INTO") && text.includes("graph_edges")) {
    ingestEdges(state, params);
    return { rows: [], rowCount: 0 };
  }

  if (upper.includes("SELECT") && text.includes("FROM") && text.includes("graph_nodes") && text.includes("n.props")) {
    const namespace = String(params?.[0]);
    const fromMs = Number(params?.[1]);
    const toMs = Number(params?.[2]);
    const rows = state.nodes
      .filter((row) => row.city_slug === namespace && overlaps(row, fromMs, toMs))
      .sort((a, b) => Number(a.props.t) - Number(b.props.t) || a.id.localeCompare(b.id))
      .map((row) => ({ ...row }));
    return { rows, rowCount: rows.length };
  }
  if (upper.includes("SELECT") && text.includes("FROM") && text.includes("graph_edges") && text.includes("e.props")) {
    const namespace = String(params?.[0]);
    const fromMs = Number(params?.[1]);
    const toMs = Number(params?.[2]);
    const rows = state.edges
      .filter((row) => row.city_slug === namespace && overlaps(row, fromMs, toMs))
      .sort(
        (a, b) =>
          Number(a.props.t) - Number(b.props.t) ||
          a.source_id.localeCompare(b.source_id) ||
          a.target_id.localeCompare(b.target_id) ||
          a.relation.localeCompare(b.relation),
      )
      .map((row) => ({ ...row }));
    return { rows, rowCount: rows.length };
  }

  return { rows: [], rowCount: 0 };
}

function makeFakePgModule(state: InMemoryPgState) {
  class FakePool {
    constructor(_config?: Record<string, unknown>) {}
    query(text: string, params?: unknown[]) {
      state.queries.push({ via: "pool", text, params });
      return Promise.resolve(answer(state, text, params));
    }
    connect() {
      const client = {
        query: (text: string, params?: unknown[]) => {
          state.queries.push({ via: "client" as const, text, params });
          return Promise.resolve(answer(state, text, params));
        },
        release() {
          /* no-op */
        },
      };
      return Promise.resolve(client);
    }
    end() {
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

const tempDirs: string[] = [];

function artifactBase(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-pgtime-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function makeStore(
  state: InMemoryPgState,
  citySlug = "time_a",
  schema?: string,
): Promise<PostgresGraphStore> {
  const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
  const deps: StoreTestDeps = { driverModule: makeFakePgModule(state) };
  return createPostgresGraphStore(
    {
      connectionString: "postgres://user:pass@localhost:5432/testdb",
      citySlug,
      schema,
      target: artifactBase(),
    },
    deps,
  );
}

function temporalFixture(): { G: Graph; communities: Map<number, string[]> } {
  const G = new Graph();
  G.addNode("before", { label: "Before", node_type: "Session", t: 50, t_end: 99 });
  G.addNode("open", { label: "Open", node_type: "Session", t: 40, authored_by: "agent-a" });
  G.addNode("spanning", { label: "Spanning", node_type: "Session", t: 90, t_end: 210 });
  G.addNode("left", { label: "Left point", node_type: "Commit", t: 100, t_end: 100 });
  G.addNode("right", { label: "Right point", node_type: "Commit", t: 200, t_end: 200 });
  G.addNode("after", { label: "After", node_type: "Commit", t: 201, t_end: 201 });
  G.addNode("untimed", { label: "Untimed", node_type: "Project" });
  G.addNode("bad-t", { label: "Bad t", node_type: "Session", t: "100" });
  G.addNode("bad-end", { label: "Bad end", node_type: "Session", t: 120, t_end: "open" });
  G.addNode("inverted", { label: "Inverted", node_type: "Session", t: 160, t_end: 159 });
  G.addEdge("open", "untimed", {
    relation: "conducted-by",
    confidence: "DIRECT",
    t: 40,
    authored_by: "agent-a",
    source: "spoofed",
  });
  G.addEdge("untimed", "left", { relation: "produced", t: 100, t_end: 100 });
  G.addEdge("before", "after", { relation: "before", t: 50, t_end: 99 });
  G.addEdge("bad-end", "inverted", { relation: "invalid", t: 120, t_end: "later" });
  return {
    G,
    communities: new Map([[7, G.nodes()]]),
  };
}

describe("Postgres queryWindow capability and contract", () => {
  it("pairs the optional capability and method only on Postgres", async () => {
    const state = freshState();
    const postgres = await makeStore(state);
    expect(postgres.capabilities.queryWindow).toBe(true);
    expect(postgres.queryWindow).toBeTypeOf("function");
    expect(postgres.capabilities.window).toBeDefined();
    expect(postgres.graphWindow).toBeTypeOf("function");

    const { createFileGraphStore } = await import("../src/storage/file.js");
    const file: GraphStore = createFileGraphStore({ target: join(artifactBase(), "graph.json") });
    expect(file.capabilities.queryWindow).toBeUndefined();
    expect(file.queryWindow).toBeUndefined();
    await file.close();
    await postgres.close();
  });

  it("round-trips inclusive points, closed spans, and open intervals", async () => {
    const state = freshState();
    const store = await makeStore(state);
    const { G, communities } = temporalFixture();
    await store.pushGraph(G, communities, { mode: "replace" });

    const window = await store.queryWindow(100, 200);
    expect(window.nodes.map((node) => node.id)).toEqual(["open", "spanning", "left", "right"]);
    expect(window.edges.map((edge) => edge.relation)).toEqual(["conducted-by", "produced"]);

    // Flat provider-neutral records preserve arbitrary props but typed identity
    // wins, and the edge is valid even though its untimed endpoint is absent.
    expect(window.nodes[0]).toMatchObject({
      id: "open",
      label: "Open",
      node_type: "Session",
      community: 7,
      t: 40,
      authored_by: "agent-a",
    });
    expect(window.nodes[0]).not.toHaveProperty("props");
    expect(window.nodes[0]).not.toHaveProperty("city_slug");
    expect(window.edges[0]).toMatchObject({
      source: "open",
      target: "untimed",
      relation: "conducted-by",
      confidence: "DIRECT",
      t: 40,
      authored_by: "agent-a",
    });
    expect(window.edges[0].source).not.toBe("spoofed");
    await store.close();
  });

  it("excludes untimed, malformed, inverted, and non-overlapping records", async () => {
    const state = freshState();
    const store = await makeStore(state);
    const { G, communities } = temporalFixture();
    await store.pushGraph(G, communities);
    const window = await store.queryWindow(100, 200);

    expect(window.nodes.map((node) => node.id)).not.toEqual(
      expect.arrayContaining(["before", "after", "untimed", "bad-t", "bad-end", "inverted"]),
    );
    expect(window.edges.map((edge) => edge.relation)).not.toEqual(
      expect.arrayContaining(["before", "invalid"]),
    );
    await store.close();
  });

  it("accepts an equal-bound instant and rejects invalid bounds before SQL", async () => {
    const state = freshState();
    const store = await makeStore(state);
    await expect(store.queryWindow(Number.NaN, 1)).rejects.toThrow(/finite/);
    await expect(store.queryWindow(1, Number.POSITIVE_INFINITY)).rejects.toThrow(/finite/);
    await expect(store.queryWindow(2, 1)).rejects.toThrow(/fromMs <= toMs/);
    expect(state.queries).toHaveLength(0);

    const { G, communities } = temporalFixture();
    await store.pushGraph(G, communities);
    const instant = await store.queryWindow(100, 100);
    expect(instant.nodes.map((node) => node.id)).toEqual(["open", "spanning", "left"]);
    await store.close();
  });

  it("parameterizes namespace overrides and keeps namespaces isolated", async () => {
    const state = freshState();
    const first = await makeStore(state, "time_a");
    const second = await makeStore(state, "time_b");
    const { G, communities } = temporalFixture();
    await first.pushGraph(G, communities);

    const other = new Graph();
    other.addNode("other", { label: "Other", node_type: "MemoryNote", t: 150, t_end: 150 });
    await second.pushGraph(other, new Map([[1, ["other"]]]));

    expect((await first.queryWindow(100, 200)).nodes.map((node) => node.id)).not.toContain("other");
    expect(
      (await first.queryWindow(100, 200, { namespace: "time_b" })).nodes.map((node) => node.id),
    ).toEqual(["other"]);

    const select = state.queries.find(
      (query) => query.text.includes("FROM graph_nodes n") && query.params?.[0] === "time_b",
    );
    expect(select?.params).toEqual(["time_b", 100, 200]);
    expect(select?.text).not.toContain("time_b");
    await first.close();
    await second.close();
  });
});

describe("Postgres queryWindow SQL", () => {
  it("creates four type-guarded temporal indexes", async () => {
    const { postgresDdlStatements } = await import("../src/storage/postgres.js");
    const temporal = postgresDdlStatements().filter((statement) =>
      /graph_(nodes|edges)_city_t(_end)?_idx/.test(statement),
    );
    expect(temporal).toHaveLength(4);
    expect(temporal.join("\n")).toContain("jsonb_typeof(props->'t') = 'number'");
    expect(temporal.join("\n")).toContain("jsonb_typeof(props->'t_end') = 'number'");
    expect(temporal.join("\n")).toContain("THEN CASE WHEN abs(");
    expect(temporal.join("\n")).toContain("::numeric) <= 1.7976931348623155e308::numeric");
    expect(temporal.join("\n")).not.toContain("WHERE props ?");
  });

  it("uses safe numeric expressions and schema-qualified tables", async () => {
    const state = freshState();
    const store = await makeStore(state, "time_schema", "temporal");
    await store.queryWindow(10, 20);

    const nodeSelect = state.queries.find((query) => query.text.includes('FROM "temporal".graph_nodes n'));
    const edgeSelect = state.queries.find((query) => query.text.includes('FROM "temporal".graph_edges e'));
    expect(nodeSelect?.text).toContain("jsonb_typeof(n.props->'t') = 'number'");
    expect(nodeSelect?.text).toContain("jsonb_typeof(n.props->'t_end') = 'number'");
    expect(edgeSelect?.text).toContain("jsonb_typeof(e.props->'t') = 'number'");
    expect(edgeSelect?.text).toContain("jsonb_typeof(e.props->'t_end') = 'number'");
    expect(nodeSelect?.params).toEqual(["time_schema", 10, 20]);
    expect(edgeSelect?.params).toEqual(["time_schema", 10, 20]);
    await store.close();
  });
});

describe.skipIf(!process.env.GRAPHIFY_TEST_POSTGRES_URL)(
  "Postgres queryWindow: live malformed-row guard",
  () => {
    const connectionString = process.env.GRAPHIFY_TEST_POSTGRES_URL as string;
    const citySlug = `graphify_time_test_${Date.now()}`;

    it("excludes out-of-double-range JSONB numbers without aborting the query", async () => {
      const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
      const store = await createPostgresGraphStore({
        connectionString,
        citySlug,
        target: artifactBase(),
      });
      try {
        // The first read idempotently ensures tables/indexes, then raw inserts
        // exercise legacy JSONB shapes that JavaScript cannot push losslessly.
        await store.queryWindow(0, 1);
        await store.query!(
          "INSERT INTO graph_nodes (city_slug, id, label, type, community, props) " +
            "VALUES ($1, 'valid-open', 'Valid', 'Session', NULL, '{\"t\": 10}'::jsonb), " +
            "($1, 'huge', 'Huge', 'Session', NULL, '{\"t\": 1e400}'::jsonb), " +
            "($1, 'bad-end', 'Bad end', 'Session', NULL, '{\"t\": 10, \"t_end\": 1e400}'::jsonb), " +
            "($1, 'string-t', 'String t', 'Session', NULL, '{\"t\": \"bad\"}'::jsonb), " +
            "($1, 'null-t', 'Null t', 'Session', NULL, '{\"t\": null}'::jsonb), " +
            "($1, 'string-end', 'String end', 'Session', NULL, '{\"t\": 10, \"t_end\": \"bad\"}'::jsonb), " +
            "($1, 'null-end', 'Null end', 'Session', NULL, '{\"t\": 10, \"t_end\": null}'::jsonb) " +
            "ON CONFLICT (city_slug, id) DO UPDATE SET props = EXCLUDED.props",
          [citySlug],
        );

        const result = await store.queryWindow(20, 20);
        expect(result.nodes.map((node) => node.id)).toEqual(["valid-open"]);
      } finally {
        await store.clear({ force: true });
        await store.close();
      }
    });
  },
);
