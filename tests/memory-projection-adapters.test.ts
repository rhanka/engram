import { fork } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "tsup";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFileGraphProjectionAdapter,
  x2bAggregateCoverage,
  type X2bAdapterHooks,
  type X2bProjectionBatch,
  type X2bResult,
  type X2bTerminalResolver,
} from "../src/storage/memory-projection.js";
import {
  createPostgresExactProjectionAdapter,
  createPostgresExactVectorStore,
  createX2bMemorySqlRunner,
  X2B_SELECT_MANIFEST,
  X2B_SELECT_VECTORS,
  X2B_UPSERT_MANIFEST,
  type X2bSqlRunner,
} from "../src/storage/vector/postgres-exact.js";
import {
  partitionIntoBatches,
  x2bContribution,
  x2bCosine,
  x2bHistories,
  x2bOracle,
  x2bOwnedEdges,
  x2bOwnedNodes,
  x2bResumeCursors,
  x2bVector,
  X2B_HUB_NODE,
  X2B_ORDERS,
  X2B_PARTITIONS,
  type X2bBatch,
} from "./memory-x2b-fixture.js";

const DIMENSION = 8;
const NOW = "2026-08-16T12:34:56.789Z";
const DEADLINE = "2026-08-16T12:40:00.000Z";
const PAST_DEADLINE = "2026-08-16T12:30:00.000Z";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function workdir(): string {
  mkdirSync(join(process.cwd(), ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".tmp", "x2b-adapters-"));
  dirs.push(dir);
  return dir;
}

function toBatch(batch: X2bBatch): X2bProjectionBatch {
  return {
    from_cursor_exclusive: batch.from_cursor_exclusive,
    through_cursor_inclusive: batch.through_cursor_inclusive,
    records: batch.records.map((record) => ({ ...record })),
    removals: batch.removals.map((removal) => ({ ...removal })),
  };
}

function materialize(record: { record_id: string }) {
  return {
    nodes: [...x2bOwnedNodes(record.record_id), X2B_HUB_NODE],
    edges: x2bOwnedEdges(record.record_id),
    contribution: x2bContribution(record.record_id),
    vector: x2bVector(record.record_id, DIMENSION),
  };
}

type Order = (typeof X2B_ORDERS)[number];

interface TestAdapter {
  readonly projection_id: string;
  ingest(recordId: string): Promise<X2bResult<unknown>>;
  invalidate(batch: X2bProjectionBatch): Promise<X2bResult<{ cursor: string; digest: string }>>;
  coverage(): Promise<{ cursor: string; complete: boolean }>;
  prepareGeneration(input: {
    generation: string;
    headCursor: string;
    batches: X2bProjectionBatch[];
    deadlineAt: string;
    operationId: string;
  }): Promise<X2bResult<{ token: string; duplicate: boolean }>>;
  publishPublication(token: string): Promise<X2bResult<unknown>>;
  acknowledgePublication(token: string): Promise<X2bResult<unknown>>;
  loseFenceForTests(): void | Promise<void>;
  reacquireFenceForTests(): void | Promise<void>;
  tombstonedIds(): Promise<string[]>;
  liveIds(): Promise<string[]>;
  digest(): Promise<string>;
  readCurrentOk(): Promise<boolean>;
}

/** Test-controlled canonical truth: the resolver reflects the journal order, decided by the test. */
function terminalResolver(terminal: ReadonlySet<string>): X2bTerminalResolver {
  return (recordIds: readonly string[]) => new Set(recordIds.filter((id) => terminal.has(id)));
}

function readGraphFile(dir: string, namespace = "x2b"): { nodes: string[]; links: Array<[string, string]> } {
  const raw = JSON.parse(readFileSync(join(dir, "graph", `graph-${namespace}.json`), "utf-8")) as {
    nodes: Array<{ id: string }>;
    links: Array<{ source: string; target: string }>;
  };
  return {
    nodes: raw.nodes.map((node) => node.id).sort(),
    links: raw.links.map((link) => [link.source, link.target] as [string, string]),
  };
}

function openGraph(dir: string, order: Order = "adds-first", hooks?: X2bAdapterHooks, resolveTerminal: X2bTerminalResolver = terminalResolver(new Set())) {
  const adapter = createFileGraphProjectionAdapter({
    dir: join(dir, "graph"),
    namespace: "x2b",
    materialize,
    clock: () => NOW,
    applyOrder: order,
    hooks,
    resolveTerminal,
  });
  const harness: TestAdapter = {
    projection_id: adapter.projection_id,
    ingest: (id) => adapter.ingest(id),
    invalidate: (batch) => adapter.invalidate(batch) as Promise<X2bResult<{ cursor: string; digest: string }>>,
    coverage: () => adapter.coverage(),
    prepareGeneration: (input) => adapter.prepareGeneration(input),
    publishPublication: (token) => adapter.publishPublication(token),
    acknowledgePublication: (token) => adapter.acknowledgePublication(token),
    loseFenceForTests: () => adapter.loseFenceForTests(),
    reacquireFenceForTests: () => adapter.reacquireFenceForTests(),
    tombstonedIds: async () => {
      const current = await adapter.readCurrent();
      if (!current.ok) throw new Error("readCurrent failed");
      return current.value.tombstoned;
    },
    liveIds: async () => {
      const current = await adapter.readCurrent();
      if (!current.ok) throw new Error("readCurrent failed");
      return current.value.live;
    },
    digest: async () => {
      const current = await adapter.readCurrent();
      if (!current.ok) throw new Error("readCurrent failed");
      return current.value.digest;
    },
    readCurrentOk: async () => (await adapter.readCurrent()).ok,
  };
  return { adapter, harness };
}

async function openVector(
  runner: X2bSqlRunner,
  order: Order = "adds-first",
  hooks?: X2bAdapterHooks,
  resolveTerminal: X2bTerminalResolver = terminalResolver(new Set()),
) {
  const adapter = await createPostgresExactProjectionAdapter({
    namespace: "x2b",
    dimension: DIMENSION,
    sqlRunner: runner,
    embed: (record: { record_id: string }) => x2bVector(record.record_id, DIMENSION),
    contribute: (record: { record_id: string }) => x2bContribution(record.record_id),
    clock: () => NOW,
    applyOrder: order,
    hooks,
    resolveTerminal,
  });
  const harness: TestAdapter = {
    projection_id: adapter.projection_id,
    ingest: (id) => adapter.ingest(id),
    invalidate: (batch) => adapter.invalidate(batch) as Promise<X2bResult<{ cursor: string; digest: string }>>,
    coverage: () => adapter.coverage(),
    prepareGeneration: (input) => adapter.prepareGeneration(input),
    publishPublication: (token) => adapter.publishPublication(token),
    acknowledgePublication: (token) => adapter.acknowledgePublication(token),
    loseFenceForTests: () => adapter.loseFenceForTests(),
    reacquireFenceForTests: () => adapter.reacquireFenceForTests(),
    tombstonedIds: async () => {
      const current = await adapter.readCurrent();
      if (!current.ok) throw new Error("readCurrent failed");
      return current.value.tombstoned;
    },
    liveIds: async () => {
      const current = await adapter.readCurrent();
      if (!current.ok) throw new Error("readCurrent failed");
      return current.value.live;
    },
    digest: async () => {
      const current = await adapter.readCurrent();
      if (!current.ok) throw new Error("readCurrent failed");
      return current.value.digest;
    },
    readCurrentOk: async () => (await adapter.readCurrent()).ok,
  };
  return { adapter, harness };
}

describe("memory projection adapters", () => {
  it.each(["ingest", "publication"] as const)("mirror construction fails before any intent during %s", async (operation) => {
    const dir = workdir();
    const graph = createFileGraphProjectionAdapter({
      dir, clock: () => NOW, resolveTerminal: terminalResolver(new Set()),
      materialize: ({ record_id }) => ({
        // Simulate an invalid host node key: materialize returns, Graph.addNode throws.
        nodes: record_id === "B" ? [Object.create(null) as string] : [record_id],
        edges: [], contribution: 1, vector: [],
      }),
    });
    expect((await graph.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "A", record_digest: "A" }], removals: [] })).ok).toBe(true);
    let token = "";
    if (operation === "publication") {
      const prepared = await graph.prepareGeneration({ generation: "next", headCursor: "2",
        batches: [{ from_cursor_exclusive: "1", through_cursor_inclusive: "2",
          records: [{ record_id: "B", record_digest: "B" }], removals: [] }],
        deadlineAt: DEADLINE, operationId: "bad-graph" });
      if (!prepared.ok) throw new Error(prepared.error.message);
      token = prepared.value.token;
    }
    const manifestPath = join(dir, "manifest-x2b.json");
    const snapshotPath = join(dir, "graph-x2b.json");
    const manifest = readFileSync(manifestPath, "utf8");
    const snapshot = readFileSync(snapshotPath, "utf8");
    const result = operation === "ingest" ? await graph.ingest("B") : await graph.publishPublication(token);
    expect(result).toMatchObject({ ok: false, error: { code: "MATERIALIZATION_FAILED" } });
    expect(readFileSync(manifestPath, "utf8")).toBe(manifest);
    expect(JSON.parse(manifest).mirrorIntent).toBeNull();
    expect(readFileSync(snapshotPath, "utf8")).toBe(snapshot);
    expect(await graph.coverage()).toEqual({ cursor: "1", complete: true });
  });

  it.each(["lock", "manifest", "material", "snapshot"] as const)("recover returns a typed refusal on %s failure and remains retryable", async (failure) => {
    const dir = workdir();
    let interrupted = false;
    let brokenMaterial = false;
    const open = () => createFileGraphProjectionAdapter({
      dir, clock: () => NOW, resolveTerminal: terminalResolver(new Set()),
      materialize: ({ record_id }) => {
        if (brokenMaterial) throw new Error("material unavailable during recovery");
        return { nodes: [record_id], edges: [], contribution: 1, vector: [] };
      },
      hooks: { beforeManifestCommit: () => { if (interrupted) throw new Error("interrupt"); } },
    });
    const graph = open();
    expect((await graph.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "A", record_digest: "A" }], removals: [] })).ok).toBe(true);
    interrupted = true;
    expect((await graph.ingest("B")).ok).toBe(false);
    interrupted = false;
    const manifestPath = join(dir, "manifest-x2b.json");
    const snapshotPath = join(dir, "graph-x2b.json");
    const tickets = `${manifestPath}.writers`;
    const intent = readFileSync(manifestPath, "utf8");
    expect(JSON.parse(intent).mirrorIntent).not.toBeNull();
    if (failure === "lock") {
      rmSync(tickets, { recursive: true });
      writeFileSync(tickets, "unavailable lock directory");
    } else if (failure === "manifest") writeFileSync(manifestPath, "invalid JSON");
    else if (failure === "material") brokenMaterial = true;
    else {
      rmSync(snapshotPath);
      mkdirSync(snapshotPath);
    }
    const before = readFileSync(manifestPath, "utf8");
    const reopened = open();
    for (let retry = 0; retry < 2; retry++) {
      await expect(reopened.recover()).resolves.toMatchObject({ ok: false,
        error: { code: "STORE_UNAVAILABLE", retryable: true } });
      expect(readFileSync(manifestPath, "utf8")).toBe(before);
    }
    if (failure === "lock") rmSync(tickets);
    else if (failure === "manifest") writeFileSync(manifestPath, intent);
    else if (failure === "material") brokenMaterial = false;
    else rmSync(snapshotPath, { recursive: true });
    await expect(reopened.recover()).resolves.toEqual({ ok: true, value: null });
    expect(JSON.parse(readFileSync(manifestPath, "utf8")).mirrorIntent).toBeNull();
    expect(JSON.parse(readFileSync(snapshotPath, "utf8")).nodes.map((node: { id: string }) => node.id).sort())
      .toEqual(["A", "B"]);
  });

  it("file lock failures return STORE_UNAVAILABLE and dead writer tickets are removed", async () => {
    const dir = workdir();
    const graph = openGraph(dir).adapter;
    const tickets = join(dir, "graph", "manifest-x2b.json.writers");
    mkdirSync(join(dir, "graph"), { recursive: true });
    writeFileSync(tickets, "unavailable lock directory");
    expect(await graph.ingest("keep")).toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE" } });
    expect(await graph.prepareGeneration({ generation: "seed", headCursor: "0", batches: [],
      deadlineAt: DEADLINE, operationId: "locked" })).toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE" } });
    rmSync(tickets);
    mkdirSync(tickets);
    const deadTicket = join(tickets, "dead.json");
    writeFileSync(deadTicket, JSON.stringify({ pid: process.pid, birth: "previous-incarnation", choosing: true, number: 1 }));
    expect((await graph.ingest("keep")).ok).toBe(true);
    expect(existsSync(deadTicket)).toBe(false);
    expect(readGraphFile(dir).nodes).toEqual(expect.arrayContaining(x2bOwnedNodes("keep")));
  });

  it("rejects cursor gaps without certifying or changing persisted coverage", async () => {
    const dir = workdir();
    const runner = createX2bMemorySqlRunner();
    const graph = openGraph(dir).adapter;
    const vector = (await openVector(runner)).adapter;
    const empty = (from: string, through: string): X2bProjectionBatch => ({
      from_cursor_exclusive: from, through_cursor_inclusive: through, records: [], removals: [],
    });
    for (const surface of [graph, vector]) {
      expect((await surface.invalidate({ ...empty("0", "1"),
        records: [{ record_id: "keep", record_digest: "keep" }] })).ok).toBe(true);
      const before = await surface.readCurrent();
      const gap = await surface.invalidate(empty("5", "6"));
      expect(gap).toMatchObject({ ok: false, error: { code: "CURSOR_GAP" } });
      for (const [batches, headCursor] of [
        [[empty("1", "2"), empty("3", "6")], "6"],
        [[empty("1", "2")], "6"],
        [[], "6"],
        [[empty("1", "3"), empty("2", "6")], "6"],
      ] as Array<[X2bProjectionBatch[], string]>) {
        const prepared = await surface.prepareGeneration({ generation: "gap", headCursor, batches,
          deadlineAt: DEADLINE, operationId: `gap:${JSON.stringify(batches)}` });
        expect(prepared).toMatchObject({ ok: false, error: { code: "CURSOR_GAP" } });
      }
      expect(await surface.coverage()).toEqual({ cursor: "1", complete: true });
      expect(await surface.readCurrent()).toEqual(before);
      expect((await surface.invalidate(empty("1", "6"))).ok).toBe(true);
      expect(await surface.coverage()).toEqual({ cursor: "6", complete: true });
    }
    expect(readGraphFile(dir).nodes).toEqual(expect.arrayContaining(x2bOwnedNodes("keep")));
    expect(await vector.storedVectorIdsForTests()).toEqual(["keep"]);
  });

  it("concurrent vector ingestions of unrelated records all persist across instances", async () => {
    const runner = createX2bMemorySqlRunner();
    const a = (await openVector(runner)).adapter;
    const b = (await openVector(runner)).adapter;
    const ids = Array.from({ length: 6 }, (_, index) => `record-${index}`);
    const results = await Promise.all(ids.map((id, index) => (index % 2 ? a : b).ingest(id)));
    expect(results.every((result) => result.ok), JSON.stringify(results)).toBe(true);
    expect(await a.storedVectorIdsForTests()).toEqual(ids);
    const reopened = (await openVector(runner)).adapter;
    expect((await reopened.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [], removals: [] })).ok).toBe(true);
    const current = await reopened.readCurrent();
    expect(current.ok && current.value.live).toEqual(ids);
  });

  it("querySimilar refuses a canonical tombstone not yet projected before reading vectors", async () => {
    const base = createX2bMemorySqlRunner();
    let forbidVectorRead = false;
    const runner: X2bSqlRunner = {
      ...base,
      query: (sql, args) => {
        if (forbidVectorRead && sql === X2B_SELECT_VECTORS) throw new Error("ineligible row reached scoring input");
        return base.query(sql, args);
      },
    };
    const terminal = new Set<string>();
    const vector = (await openVector(runner, "adds-first", undefined, terminalResolver(terminal))).adapter;
    expect((await vector.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "doomed", record_digest: "doomed" }], removals: [] })).ok).toBe(true);
    expect(await vector.storedVectorIdsForTests()).toEqual(["doomed"]);
    terminal.add("doomed");
    forbidVectorRead = true;
    expect(await vector.querySimilar({ vector: x2bVector("doomed", DIMENSION), topK: 1 }))
      .toMatchObject({ ok: false, error: { code: "PROJECTION_STALE" } });
  });

  it("vector ingestion checks canonical terminality before any batch and again under the transaction", async () => {
    for (const terminalAt of [1, 2]) {
      const runner = createX2bMemorySqlRunner();
      let resolutions = 0;
      const vector = (await openVector(runner, "adds-first", undefined, (ids) => {
        resolutions += 1;
        return resolutions >= terminalAt ? new Set(ids) : new Set<string>();
      })).adapter;
      expect((await vector.ingest("doomed")).ok).toBe(true);
      expect(resolutions).toBe(terminalAt);
      expect(await vector.storedVectorIdsForTests()).toEqual([]);
      const manifest = await runner.query(X2B_SELECT_MANIFEST, ['memory-projection:"x2b"']);
      expect(manifest.rows.flatMap((row) => JSON.parse(row.manifest as string).live)).toEqual([]);
    }
  });

  it("T3-MAJOR: replay never deletes a living vector after dispute resolution or rewind", async () => {
    for (const history of x2bHistories().slice(0, 2)) {
      const events = history.slice(0, 7); // r2/r4 survives its reversible removal.
      const terminal = new Set([events[6]!.record_id]);
      for (const order of X2B_ORDERS) {
        const dir = workdir();
        const runner = createX2bMemorySqlRunner();
        const graph = openGraph(dir, order, undefined, terminalResolver(terminal)).adapter;
        const vector = (await openVector(runner, order, undefined, terminalResolver(terminal))).adapter;
        const batches = partitionIntoBatches(events, 1).map(toBatch);
        const expected = x2bOracle(events, "7", order);
        for (let replay = 0; replay < 3; replay++) {
          for (const batch of batches) {
            expect((await graph.invalidate(batch)).ok).toBe(true);
            expect((await vector.invalidate(batch)).ok).toBe(true);
            if (replay > 0) expect(await vector.storedVectorIdsForTests()).toEqual([...expected.live]);
          }
          expect(await vector.storedVectorIdsForTests()).toEqual([...expected.live]);
          const current = await graph.readCurrent();
          expect(current.ok && current.value.influence).toEqual(expected.influence);
          for (const id of expected.live) {
            expect(readGraphFile(dir).nodes).toEqual(expect.arrayContaining(x2bOwnedNodes(id)));
            const scored = await vector.querySimilar({ vector: x2bVector(id, DIMENSION), topK: 1 });
            expect(scored.ok && scored.value.matches.map((match) => match.record_id)).toEqual([id]);
          }
        }
        // One publication folding several batches must preserve the same final survivor.
        const prepared = await vector.prepareGeneration({
          generation: "multi", headCursor: "7", batches, deadlineAt: DEADLINE, operationId: "multi",
        });
        expect(prepared.ok).toBe(true);
        if (!prepared.ok) throw new Error("prepare refused");
        expect((await vector.publishPublication(prepared.value.token)).ok).toBe(true);
        expect(await vector.storedVectorIdsForTests()).toEqual([...expected.live]);
        const fresh = (await openVector(createX2bMemorySqlRunner(), order, undefined, terminalResolver(terminal))).adapter;
        const whole = await fresh.prepareGeneration({ generation: "whole", headCursor: "7", batches,
          deadlineAt: DEADLINE, operationId: "whole" });
        if (!whole.ok) throw new Error("prepare refused");
        expect((await fresh.publishPublication(whole.value.token)).ok).toBe(true);
        expect(await fresh.storedVectorIdsForTests()).toEqual([...expected.live]);
        const current = await fresh.readCurrent();
        expect(current.ok && current.value.influence).toEqual(expected.influence);
      }
    }
  });

  it("T3-M2: reads never repair or write an interrupted file intent", async () => {
    const dir = workdir();
    let armed = false;
    const graph = openGraph(dir, "adds-first", {
      beforeManifestCommit: () => { if (armed) throw new Error("interrupt"); },
    }, terminalResolver(new Set())).adapter;
    expect((await graph.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "A", record_digest: "A" }], removals: [] })).ok).toBe(true);
    armed = true;
    expect((await graph.ingest("B")).ok).toBe(false);
    const path = join(dir, "graph", "manifest-x2b.json");
    const before = readFileSync(path, "utf8");
    expect(JSON.parse(before).mirrorIntent).not.toBeNull();
    await graph.readCurrent();
    await graph.coverage();
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("preparation stays private and cannot delete or acknowledge published objects", async () => {
    const dir = workdir();
    const terminal = new Set<string>();
    const graph = openGraph(dir, "adds-first", undefined, terminalResolver(terminal)).adapter;
    const runner = createX2bMemorySqlRunner();
    const vector = (await openVector(runner, "adds-first", undefined, terminalResolver(terminal))).adapter;
    const add = { from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "probe", record_digest: "probe" }], removals: [] };
    expect((await graph.invalidate(add)).ok).toBe(true);
    expect((await vector.invalidate(add)).ok).toBe(true);
    const file = readFileSync(join(dir, "graph", "graph-x2b.json"), "utf8");
    terminal.add("probe");
    const removal = { from_cursor_exclusive: "1", through_cursor_inclusive: "2", records: [],
      removals: [{ record_id: "probe", reason_ref: "reason:tombstone" }] };
    for (const surface of [graph, vector]) {
      const prepared = await surface.prepareGeneration({ generation: "private", headCursor: "2", batches: [removal],
        deadlineAt: DEADLINE, operationId: "private" });
      if (!prepared.ok) throw new Error("prepare refused");
      expect((await surface.acknowledgePublication(prepared.value.token)).ok).toBe(false);
      expect((await surface.coverage()).cursor).toBe("1");
      expect(await vector.storedVectorIdsForTests()).toEqual(["probe"]);
      expect(readFileSync(join(dir, "graph", "graph-x2b.json"), "utf8")).toBe(file);
      expect(JSON.parse(readFileSync(join(dir, "graph", "manifest-x2b.json"), "utf8")).live).toEqual(["probe"]);
      const manifest = await runner.query(X2B_SELECT_MANIFEST, ['memory-projection:"x2b"']);
      expect(JSON.parse(manifest.rows[0]!.manifest as string).live).toEqual(["probe"]);
    }
  });

  it("T1-M5: materialization failure preserves every unrelated object and creates no fixture nodes", async () => {
    const dir = workdir();
    let fail = false;
    const graph = createFileGraphProjectionAdapter({
      dir, resolveTerminal: terminalResolver(new Set()), clock: () => NOW,
      materialize: ({ record_id }) => {
        if (fail && record_id === "A") throw new Error("material unavailable");
        return { nodes: [record_id], edges: [], contribution: 7, vector: [1] };
      },
    });
    expect((await graph.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "A", record_digest: "A" }], removals: [] })).ok).toBe(true);
    const path = join(dir, "graph-x2b.json");
    const before = readFileSync(path, "utf8");
    expect(JSON.parse(before).nodes.map((n: { id: string }) => n.id)).toEqual(["A"]);
    fail = true;
    expect((await graph.invalidate({ from_cursor_exclusive: "1", through_cursor_inclusive: "2",
      records: [{ record_id: "B", record_digest: "B" }], removals: [] })).ok).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(before);
    expect((await graph.readCurrent()).ok).toBe(false);
    fail = false;
    const current = await graph.readCurrent();
    expect(current.ok && current.value.live).toEqual(["A"]);
  });

  it("T1-M7: the public exact store contract cannot overwrite a memory projection namespace", async () => {
    const runner = createX2bMemorySqlRunner();
    const vector = (await openVector(runner)).adapter;
    const raw = await createPostgresExactVectorStore({ namespace: "x2b", dimension: DIMENSION }, { driverModule: runner });
    const v = (id: string) => ({ id, vector: x2bVector(id, DIMENSION) });
    expect((await vector.ingest("memory")).ok).toBe(true);
    expect((await raw.upsertVectors([v("raw")], { dryRun: true })).count).toBe(1);
    expect(await raw.query({ vector: v("raw").vector })).toEqual([]);
    await raw.upsertVectors([v("raw")]);
    await raw.upsertVectors([v("other")], { namespace: "other" });
    expect((await raw.query({ vector: v("raw").vector })).map((m) => m.id)).toEqual(["raw"]);
    await raw.upsertVectors([v("replace")], { mode: "replace" });
    expect((await raw.query({ vector: v("raw").vector })).map((m) => m.id)).toEqual(["replace"]);
    await raw.clear();
    expect(await raw.query({ vector: v("raw").vector })).toEqual([]);
    expect((await raw.query({ vector: v("raw").vector, namespace: "other" })).map((m) => m.id)).toEqual(["other"]);
    expect(await vector.storedVectorIdsForTests()).toEqual(["memory"]);
    await expect(raw.upsertVectors([{ id: "bad", vector: [1] }])).rejects.toThrow("dimension");
    await raw.close();
  });

  it("SQL reads never issue schema, mutation or writer-transaction statements", async () => {
    const base = createX2bMemorySqlRunner();
    let readOnly = false;
    const runner: X2bSqlRunner = {
      query: (sql, args) => {
        if (readOnly && !sql.startsWith("SELECT ")) throw new Error(`read attempted write: ${sql}`);
        return base.query(sql, args);
      },
      withTransaction: (work) => {
        if (readOnly) throw new Error("read attempted writer transaction");
        return base.withTransaction(work);
      },
      close: () => base.close(),
    };
    const vector = (await openVector(runner)).adapter;
    const raw = await createPostgresExactVectorStore({ dimension: DIMENSION }, { driverModule: runner });
    expect((await vector.ingest("probe")).ok).toBe(true);
    expect((await vector.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1", records: [], removals: [] })).ok).toBe(true);
    readOnly = true;
    expect((await vector.readCurrent()).ok).toBe(true);
    expect((await vector.querySimilar({ vector: x2bVector("probe", DIMENSION), topK: 1 })).ok).toBe(true);
    expect((await vector.coverage()).cursor).toBe("1");
    expect(await raw.query({ vector: x2bVector("probe", DIMENSION) })).toEqual([]);
    await vector.close(); await raw.close();
  });

  it("a physical vector purge requires the concerned record's canonical terminal tombstone", async () => {
    const runner = createX2bMemorySqlRunner();
    const terminal = new Set<string>();
    const vector = (await openVector(runner, "adds-first", undefined, terminalResolver(terminal))).adapter;
    expect((await vector.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "living", record_digest: "living" }, { record_id: "doomed", record_digest: "doomed" }], removals: [] })).ok).toBe(true);
    terminal.add("doomed");
    expect((await vector.invalidate({ from_cursor_exclusive: "1", through_cursor_inclusive: "2", records: [],
      removals: [{ record_id: "living", reason_ref: "memory:tombstoned" }, { record_id: "doomed", reason_ref: "reason:tombstone" }] })).ok).toBe(true);
    expect(await vector.storedVectorIdsForTests()).toEqual(["living"]);
    const current = await vector.readCurrent();
    expect(current.ok && current.value.tombstoned).toEqual(["doomed"]);
    // A reversible exclusion can hide a row from scoring, but cannot physically purge it.
    const scored = await vector.querySimilar({ vector: x2bVector("living", DIMENSION), topK: 10 });
    expect(scored.ok && scored.value.matches).toEqual([]);
    expect((await vector.invalidate({ from_cursor_exclusive: "2", through_cursor_inclusive: "3",
      records: [{ record_id: "living", record_digest: "living" }], removals: [] })).ok).toBe(true);
    expect(await vector.storedVectorIdsForTests()).toEqual(["living"]);
  });

  it("T3-M1b: the pg runner rolls back an effective DELETE when the manifest commit fails", async () => {
    const base = createX2bMemorySqlRunner();
    // Protocol transport only: exercise the delivered pg runner, including its dedicated
    // client and transaction commands. The same DELETE/rollback assertion runs on real PG in CI.
    class Pool {
      query = base.query;
      on() {}
      async end() {}
      async connect() {
        let tx: X2bSqlRunner | undefined;
        let finish: ((commit: boolean) => void) | undefined;
        let completed: Promise<unknown> | undefined;
        return {
          release() {},
          async query(sql: string, values?: unknown[]) {
            if (sql === "BEGIN") {
              let started!: () => void;
              const ready = new Promise<void>((done) => { started = done; });
              const decision = new Promise<boolean>((done) => { finish = done; });
              completed = base.withTransaction(async (executor) => {
                tx = executor; started();
                if (!(await decision)) throw new Error("rollback");
              }).catch(() => {});
              await ready;
              return { rows: [] };
            }
            if (sql === "COMMIT" || sql === "ROLLBACK") {
              finish?.(sql === "COMMIT");
              await completed;
              return { rows: [] };
            }
            return (tx ?? base).query(sql, values);
          },
        };
      }
    }
    let armed = false;
    const terminal = new Set<string>();
    const vector = await createPostgresExactProjectionAdapter({
      driverModule: { Pool }, connectionString: "unused", dimension: DIMENSION,
      resolveTerminal: terminalResolver(terminal), embed: (r) => x2bVector(r.record_id, DIMENSION),
      hooks: { beforeManifestCommit: () => { if (armed) throw new Error("interrupt-after-delete"); } },
    });
    try {
      expect((await vector.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1",
        records: [{ record_id: "probe", record_digest: "probe" }], removals: [] })).ok).toBe(true);
      terminal.add("probe"); armed = true;
      expect((await vector.invalidate({ from_cursor_exclusive: "1", through_cursor_inclusive: "2", records: [],
        removals: [{ record_id: "probe", reason_ref: "reason:tombstone" }] })).ok).toBe(false);
      expect(await vector.storedVectorIdsForTests()).toEqual(["probe"]);
      expect((await vector.coverage()).cursor).toBe("1");
      armed = false;
      expect((await vector.invalidate({ from_cursor_exclusive: "1", through_cursor_inclusive: "2", records: [],
        removals: [{ record_id: "probe", reason_ref: "reason:tombstone" }] })).ok).toBe(true);
      expect(await vector.storedVectorIdsForTests()).toEqual([]);
    } finally { await vector.close(); }
  });

  it("T1-M3/T2-M3: competing file instances and preparation preserve unrelated ingestions", async () => {
    const dir = workdir();
    const a = openGraph(dir).adapter;
    const b = openGraph(dir).adapter;
    const writes = Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).ingest(`record-${i}`));
    const prep = b.prepareGeneration({ generation: "seed", headCursor: "0", batches: [],
      deadlineAt: DEADLINE, operationId: "prepare-during-ingest" });
    expect((await Promise.all(writes)).every((result) => result.ok)).toBe(true);
    expect((await prep).ok).toBe(true);
    expect((await a.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1", records: [], removals: [] })).ok).toBe(true);
    const current = await a.readCurrent();
    const expected = Array.from({ length: 12 }, (_, i) => `record-${i}`).sort();
    expect(current.ok && current.value.live).toEqual(expected);
    for (const id of expected) expect(readGraphFile(dir).nodes).toEqual(expect.arrayContaining(x2bOwnedNodes(id)));
  });

  it("file writers in separate processes serialize and recover a killed writer without losing records", async () => {
    const dir = workdir();
    await build({ entry: { adapter: join(process.cwd(), "src/storage/memory-projection.ts") }, outDir: dir,
      config: false, bundle: true, format: ["esm"], platform: "node", silent: true, dts: false,
      outExtension: () => ({ js: ".mjs" }) });
    const worker = join(dir, "worker.mjs");
    writeFileSync(worker, `
      import { createFileGraphProjectionAdapter } from './adapter.mjs';
      const [dir, id, crash] = process.argv.slice(2);
      process.send('started');
      const graph = createFileGraphProjectionAdapter({ dir, resolveTerminal: () => new Set(),
        materialize: ({ record_id }) => ({ nodes: [record_id], edges: [], contribution: 1, vector: [] }),
        hooks: crash ? { beforeManifestCommit: () => {
          process.send('locked'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        } } : {} });
      for (const record of id.split(',')) {
        const result = await graph.ingest(record);
        if (!result.ok) throw new Error(JSON.stringify(result));
      }
      process.disconnect();
    `);
    const start = (id: string, crash = false) => {
      const child = fork(worker, [join(dir, "graph"), id, ...(crash ? ["crash"] : [])], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
      let error = "";
      child.stderr!.on("data", (data) => { error += String(data); });
      const exited = new Promise<number | null>((done, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => { if (code !== 0 && code !== null) reject(new Error(error)); else done(code); });
      });
      return { child, exited };
    };
    const killed = start("interrupted", true);
    try {
      await new Promise<void>((done) => { killed.child.on("message", (message) => { if (message === "locked") done(); }); });
      const waiting = start("after-crash");
      await new Promise<void>((done) => { waiting.child.once("message", () => done()); });
      let finished = false;
      void waiting.exited.then(() => { finished = true; });
      await new Promise((done) => setTimeout(done, 30));
      const blockedByWriter = !finished;
      killed.child.kill("SIGKILL");
      await killed.exited;
      expect(await waiting.exited).toBe(0);
      expect(blockedByWriter).toBe(true);
      const writers = [start("A,B,C"), start("D,E,F"), start("G,H,I")];
      expect(await Promise.all(writers.map((w) => w.exited))).toEqual([0, 0, 0]);
      const graph = createFileGraphProjectionAdapter({ dir: join(dir, "graph"), resolveTerminal: () => new Set(),
        materialize: ({ record_id }) => ({ nodes: [record_id], edges: [], contribution: 1, vector: [] }) });
      expect((await graph.invalidate({ from_cursor_exclusive: "0", through_cursor_inclusive: "1", records: [], removals: [] })).ok).toBe(true);
      const current = await graph.readCurrent();
      expect(current.ok && current.value.live).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "after-crash", "interrupted"]);
      const file = readGraphFile(dir);
      expect(file.nodes).toHaveLength(11);
    } finally {
      killed.child.kill("SIGKILL");
    }
  });

  for (const [sequence, original] of x2bHistories().entries()) {
    for (const order of X2B_ORDERS) {
      it(`class: sequence ${sequence} x ${order} x resumes x faults x replay on FileGraphStore`, async () => {
        // One restored record stays alive, one is terminal, and one never participates in
        // the history. Unlike the older all-terminal corpus this detects destructive replay.
        const events = original.slice(0, 7);
        const head = events.at(-1)!.cursor;
        const expected = x2bOracle(events, head, order);
        expected.live.add("unrelated");
        expected.influence.set("unrelated", x2bContribution("unrelated"));
        for (const pageSize of X2B_PARTITIONS) {
          for (const resume of x2bResumeCursors(events)) {
            for (const fault of ["prepare", "publish", "commit", "response", "deadline", "fence", "unknown-token"] as const) {
              const label = `${sequence}/${order}/${pageSize}/${resume}/${fault}`;
              const dir = workdir();
              const runner = createX2bMemorySqlRunner();
              const terminal = new Set<string>();
              const canonical = (through: string) => {
                for (const event of events) if (BigInt(event.cursor) <= BigInt(through) && event.reason_ref === "memory:tombstoned") terminal.add(event.record_id);
              };
              let armed = false;
              const hooks: X2bAdapterHooks = {
                beforePublish: () => { if (armed && fault === "publish") { armed = false; throw new Error(label); } },
                beforeManifestCommit: () => { if (armed && fault === "commit") { armed = false; throw new Error(label); } },
              };
              let graph = openGraph(dir, order, hooks, terminalResolver(terminal)).adapter;
              let vector = (await openVector(runner, order, hooks, terminalResolver(terminal))).adapter;
              expect((await graph.ingest("unrelated")).ok, label).toBe(true);
              expect((await vector.ingest("unrelated")).ok, label).toBe(true);
              const sibling = await createPostgresExactProjectionAdapter({ namespace: "sibling", sqlRunner: runner,
                dimension: DIMENSION, resolveTerminal: terminalResolver(new Set()), embed: (r) => x2bVector(r.record_id, DIMENSION) });
              expect((await sibling.ingest("unrelated")).ok, label).toBe(true);
              // Persist a real prefix; resume never starts from an empty replacement backend.
              for (const batch of partitionIntoBatches(events.filter((e) => BigInt(e.cursor) <= BigInt(resume)), pageSize)) {
                canonical(batch.through_cursor_inclusive);
                expect((await graph.invalidate(toBatch(batch))).ok, label).toBe(true);
                expect((await vector.invalidate(toBatch(batch))).ok, label).toBe(true);
              }
              canonical(head);
              const all = partitionIntoBatches(events, pageSize).map(toBatch);
              const probe = all.find((b) => BigInt(b.through_cursor_inclusive) > BigInt(resume)) ?? all[0]!;
              // Fail each surface independently while the other has already advanced.
              for (const surface of [graph, vector]) {
                const previous = (await surface.coverage()).cursor;
                armed = true;
                if (fault === "prepare") {
                  const prepared = await surface.prepareGeneration({ generation: "cut",
                    headCursor: BigInt(previous) > BigInt(probe.through_cursor_inclusive) ? previous : probe.through_cursor_inclusive, batches: [probe],
                    deadlineAt: DEADLINE, operationId: `cut:${label}` });
                  expect(prepared.ok, label).toBe(true);
                  if (!prepared.ok) throw new Error(label);
                  expect((await surface.acknowledgePublication(prepared.value.token)).ok, label).toBe(false);
                  expect((await surface.coverage()).cursor, label).toBe(previous);
                } else if (fault === "deadline") {
                  expect((await surface.prepareGeneration({ generation: "cut", headCursor: head, batches: [probe],
                    deadlineAt: PAST_DEADLINE, operationId: `cut:${label}` })).ok, label).toBe(false);
                  expect((await surface.coverage()).cursor, label).toBe(previous);
                } else if (fault === "fence") {
                  if (surface.projection_id === "graph") await graph.loseFenceForTests();
                  else await vector.loseFenceForTests();
                  expect((await surface.invalidate(probe)).ok, label).toBe(false);
                  expect((await surface.coverage()).cursor, label).toBe(previous);
                  if (surface.projection_id === "graph") await graph.reacquireFenceForTests();
                  else await vector.reacquireFenceForTests();
                } else if (fault === "unknown-token") {
                  expect((await surface.publishPublication("unknown-token")).ok, label).toBe(false);
                  expect((await surface.coverage()).cursor, label).toBe(previous);
                } else {
                  const result = await surface.invalidate(probe);
                  expect(result.ok, label).toBe(fault === "response");
                  if (fault !== "response") expect((await surface.coverage()).cursor, label).toBe(previous);
                  // response: publication succeeded, but its response is discarded by caller.
                }
                armed = false;
                const observable = await surface.readCurrent();
                if (observable.ok) {
                  expect(observable.value.live.filter((id) => terminal.has(id)), label).toEqual([]);
                  expect([...observable.value.influence.keys()].filter((id) => terminal.has(id)), label).toEqual([]);
                } else {
                  expect(["PROJECTION_STALE", "MATERIALIZATION_FAILED"], label).toContain(observable.error.code);
                }
              }
              // Recovery is an explicit writer operation. Reading an intent never repairs it.
              graph = openGraph(dir, order, undefined, terminalResolver(terminal)).adapter;
              await graph.recover();
              vector = (await openVector(runner, order, undefined, terminalResolver(terminal))).adapter;
              for (let replay = 0; replay < 2; replay++) {
                for (const batch of all) {
                  expect((await graph.invalidate(batch)).ok, label).toBe(true);
                  expect((await vector.invalidate(batch)).ok, label).toBe(true);
                  if (replay > 0) {
                    expect(await vector.storedVectorIdsForTests(), label).toEqual([...expected.live].sort());
                    expect(readGraphFile(dir).nodes, label).toEqual(expect.arrayContaining([...expected.live].flatMap(x2bOwnedNodes)));
                  }
                }
                const current = await graph.readCurrent();
                expect(current.ok, label).toBe(true);
                if (!current.ok) throw new Error(label);
                expect(new Set(current.value.live), label).toEqual(expected.live);
                expect(new Set(current.value.tombstoned), label).toEqual(expected.tombstoned);
                expect(current.value.influence, label).toEqual(expected.influence);
                const vectorCurrent = await vector.readCurrent();
                expect(vectorCurrent.ok && vectorCurrent.value.influence, label).toEqual(expected.influence);
                expect(await vector.storedVectorIdsForTests(), label).toEqual([...expected.live].sort());
                const file = readGraphFile(dir);
                const nodes = new Set([...expected.live].flatMap(x2bOwnedNodes));
                nodes.add(X2B_HUB_NODE);
                expect(new Set(file.nodes), label).toEqual(nodes);
                expect(new Set(file.links.map((e) => JSON.stringify(e))), label).toEqual(new Set([...expected.live].flatMap(x2bOwnedEdges).map((e) => JSON.stringify(e))));
                const matches = await vector.querySimilar({ vector: x2bVector("unrelated", DIMENSION), topK: 20 });
                expect(matches.ok && new Set(matches.value.matches.map((m) => m.record_id)), label).toEqual(expected.live);
                if (matches.ok) for (const match of matches.value.matches) {
                  expect(match.score, label).toBeCloseTo(x2bCosine(x2bVector("unrelated", DIMENSION), x2bVector(match.record_id, DIMENSION)), 10);
                }
                expect((await graph.coverage()).cursor, label).toBe(head);
                expect((await vector.coverage()).cursor, label).toBe(head);
                expect(await sibling.storedVectorIdsForTests(), label).toEqual(["unrelated"]);
              }
            }
          }
        }
      });
    }
  }

  it("removing a record deletes its graph objects and dependent influence while preserving unrelated records", async () => {
    const dir = workdir();
    const terminal = new Set<string>();
    const { adapter: graph } = openGraph(dir, "adds-first", undefined, terminalResolver(terminal));
    const runner = createX2bMemorySqlRunner();
    const { adapter: vector } = await openVector(runner, "adds-first", undefined, terminalResolver(terminal));
    const history = x2bHistories()[0]!;
    for (const batch of partitionIntoBatches(history.slice(0, 2), 8)) {
      expect((await graph.invalidate(toBatch(batch))).ok).toBe(true);
      expect((await vector.invalidate(toBatch(batch))).ok).toBe(true);
    }

    const removal: X2bBatch = {
      from_cursor_exclusive: "2",
      through_cursor_inclusive: "3",
      records: [],
      removals: [{ record_id: "x2b:r1", reason_ref: "reason:tombstone" }],
    };
    terminal.add("x2b:r1");
    expect((await graph.invalidate(toBatch(removal))).ok).toBe(true);
    expect((await vector.invalidate(toBatch(removal))).ok).toBe(true);

    const current = await graph.readCurrent();
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    // Owned nodes and the dependent hub edge of r1 are gone; the shared hub and r2 survive.
    for (const node of x2bOwnedNodes("x2b:r1")) expect(current.value.nodes).not.toContain(node);
    expect(current.value.edges).not.toContainEqual([`x2b:node:x2b:r1`, X2B_HUB_NODE]);
    for (const node of x2bOwnedNodes("x2b:r2")) expect(current.value.nodes).toContain(node);
    expect(current.value.nodes).toContain(X2B_HUB_NODE);
    // Derived influence of r1 is gone; r2 keeps its contribution.
    expect(current.value.influence.has("x2b:r1")).toBe(false);
    expect(current.value.influence.get("x2b:r2")).toBe(x2bContribution("x2b:r2"));

    // Idempotent removal: a repeated removal changes nothing and stays successful.
    const before = current.value.digest;
    expect((await graph.invalidate(toBatch(removal))).ok).toBe(true);
    const again = await graph.readCurrent();
    expect(again.ok && again.value.digest).toBe(before);

    // The real graph file agrees: r1 objects are gone, r2 objects and the hub survive.
    const removedFile = readGraphFile(dir);
    for (const node of x2bOwnedNodes("x2b:r1")) expect(removedFile.nodes).not.toContain(node);
    for (const edge of x2bOwnedEdges("x2b:r1")) expect(removedFile.links).not.toContainEqual(edge);
    for (const node of x2bOwnedNodes("x2b:r2")) expect(removedFile.nodes).toContain(node);
    expect(removedFile.nodes).toContain(X2B_HUB_NODE);

    // Vector lane: the removed id is gone before scoring; unrelated ids score normally.
    // The row is physically deleted (explicit ids), not merely filtered at query time.
    expect(await vector.storedVectorIdsForTests()).toEqual(["x2b:r2"]);
    const scored = await vector.querySimilar({ vector: x2bVector("x2b:r1", DIMENSION), topK: 10 });
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.matches.map((match) => match.record_id)).not.toContain("x2b:r1");
    expect(scored.value.matches.map((match) => match.record_id)).toContain("x2b:r2");
    for (const match of scored.value.matches) {
      expect(match.score).toBeCloseTo(
        x2bCosine(x2bVector("x2b:r1", DIMENSION), x2bVector(match.record_id, DIMENSION)),
        10,
      );
    }
  });

  it("terminal tombstones never reappear on the real adapters at any replay or recovery cut", async () => {
    for (const history of x2bHistories()) {
      for (const pageSize of X2B_PARTITIONS) {
        for (const order of X2B_ORDERS) {
          for (const resume of x2bResumeCursors(history)) {
            const dir = workdir();
            const runner = createX2bMemorySqlRunner();
            const batches = partitionIntoBatches(history, pageSize);
            // Canonical terminal truth, advanced with the applied prefix exactly like the
            // journal total order: only records tombstoned at or before the applied cursor
            // count as terminal. The batches keep their `memory:tombstoned` reasons, which
            // the adapters must never read.
            const canonicalTerminal = new Set<string>();
            const canonical = (through: string): void => {
              for (const event of history) {
                if (BigInt(event.cursor) > BigInt(through)) break;
                if (event.reason_ref === "memory:tombstoned") canonicalTerminal.add(event.record_id);
              }
            };
            const graph = openGraph(dir, order, undefined, terminalResolver(canonicalTerminal)).harness;
            const reopenVector = async () => (await openVector(runner, order === "adds-first" ? "removals-first" : "adds-first", undefined, terminalResolver(canonicalTerminal))).harness;
            const vector = (await openVector(runner, order, undefined, terminalResolver(canonicalTerminal))).harness;
            // Resume on a real persisted prefix, never on a fresh store with a cursor gap.
            for (const batch of partitionIntoBatches(history.filter((event) => BigInt(event.cursor) <= BigInt(resume)), pageSize)) {
              canonical(batch.through_cursor_inclusive);
              expect((await graph.invalidate(toBatch(batch))).ok).toBe(true);
              expect((await vector.invalidate(toBatch(batch))).ok).toBe(true);
            }
            // Replay every batch from the resume cursor (including zero after convergence).
            for (const batch of batches) {
              if (BigInt(batch.through_cursor_inclusive) <= BigInt(resume)) continue;
              canonical(batch.through_cursor_inclusive);
              expect((await graph.invalidate(toBatch(batch))).ok).toBe(true);
              expect((await vector.invalidate(toBatch(batch))).ok).toBe(true);
            }
            const terminal = [...new Set(history.filter((event) => event.reason_ref === "memory:tombstoned").map((event) => event.record_id))].sort();
            const head = history[history.length - 1]!.cursor;
            for (const surface of [graph, vector]) {
              const tombstoned = (await surface.tombstonedIds()).sort();
              const live = await surface.liveIds();
              // No terminal record ever reappears, at any resume cut.
              expect(live.filter((id) => terminal.includes(id))).toEqual([]);
              expect(live).toEqual([]);
              if (resume === "0") {
                // Full replay matches the independent sequential oracle exactly.
                const expected = x2bOracle(history, head, order);
                expect(tombstoned).toEqual([...expected.tombstoned].sort());
                expect(new Set(live)).toEqual(expected.live);
              }
            }
            // Recovery cut: reopened instances on the same backend serve the same digest.
            const reopenedGraph = openGraph(dir, order === "adds-first" ? "removals-first" : "adds-first", undefined, terminalResolver(canonicalTerminal)).harness;
            expect(await reopenedGraph.digest()).toBe(await graph.digest());
            expect(await reopenedGraph.tombstonedIds()).toEqual(await graph.tombstonedIds());
            const reopened = await reopenVector();
            expect(await reopened.digest()).toBe(await vector.digest());
            expect(await reopened.liveIds()).toEqual([]);
          }
        }
      }
    }
  });

  it("interrupted ADD REMOVE ADD replay preserves the published generation and the accepted survivor", async () => {
    for (const order of X2B_ORDERS) {
      const crashing = {
        beforePublish: (count: number) => {
          if (count === 1) throw new Error("inject:crash-before-publish");
        },
      };
      const dir = workdir();
      const runner = createX2bMemorySqlRunner();
      const surfaces: TestAdapter[] = [
        openGraph(dir, order, crashing, terminalResolver(new Set())).harness,
        (await openVector(runner, order, crashing, terminalResolver(new Set()))).harness,
      ];
      const addR1: X2bBatch = {
        from_cursor_exclusive: "0",
        through_cursor_inclusive: "1",
        records: [{ record_id: "x2b:r1", record_digest: "sha256:x2b-x2b:r1" }],
        removals: [],
      };
      const removeR1: X2bBatch = {
        from_cursor_exclusive: "1",
        through_cursor_inclusive: "2",
        records: [],
        removals: [{ record_id: "x2b:r1", reason_ref: "memory:dispute" }],
      };
      const readdR1: X2bBatch = {
        from_cursor_exclusive: "2",
        through_cursor_inclusive: "3",
        records: [{ record_id: "x2b:r1", record_digest: "sha256:x2b-x2b:r1" }],
        removals: [],
      };
      for (const surface of surfaces) {
        expect((await surface.invalidate(toBatch(addR1))).ok).toBe(true);
        // Crash before publication: the interruption surfaces, the prior publication survives.
        expect((await surface.invalidate(toBatch(removeR1))).ok).toBe(false);
        expect((await surface.coverage()).cursor).toBe("1");
      }
      // Replay converges on reopened instances sharing the same backends.
      const healthy: TestAdapter[] = [
        openGraph(dir, order, undefined, terminalResolver(new Set())).harness,
        (await openVector(runner, order, undefined, terminalResolver(new Set()))).harness,
      ];
      for (const surface of healthy) {
        expect((await surface.invalidate(toBatch(removeR1))).ok).toBe(true);
        expect((await surface.invalidate(toBatch(readdR1))).ok).toBe(true);
        expect(await surface.liveIds()).toContain("x2b:r1");
        expect((await surface.coverage()).cursor).toBe("3");
      }
    }
  });

  it("a stale head, lost fence, expired deadline or conflicting generation cannot publish or advance acknowledgement", async () => {
    for (const backend of ["graph", "vector"] as const) {
      const dir = workdir();
      const runner = createX2bMemorySqlRunner();
      const surface: TestAdapter = backend === "graph"
        ? openGraph(dir, "adds-first", undefined, terminalResolver(new Set())).harness
        : (await openVector(runner, "adds-first", undefined, terminalResolver(new Set()))).harness;
      const seed: X2bBatch = {
        from_cursor_exclusive: "0",
        through_cursor_inclusive: "5",
        records: [{ record_id: "x2b:r2", record_digest: "sha256:x2b-x2b:r2" }],
        removals: [],
      };
      const prepared = await surface.prepareGeneration({
        generation: "gen-1",
        headCursor: "5",
        batches: [toBatch(seed)],
        deadlineAt: DEADLINE,
        operationId: "op-seed",
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect((await surface.publishPublication(prepared.value.token)).ok).toBe(true);
      expect((await surface.acknowledgePublication(prepared.value.token)).ok).toBe(true);
      const coveredBefore = (await surface.coverage()).cursor;

      // Stale head: pinning an older head cannot publish.
      const stale = await surface.prepareGeneration({
        generation: "gen-stale",
        headCursor: "3",
        batches: [toBatch(seed)],
        deadlineAt: DEADLINE,
        operationId: "op-stale",
      });
      expect(stale.ok).toBe(false);
      if (stale.ok) return;
      expect(stale.error.code).toBe("PROJECTION_STALE");

      // Lost fence: preparation refuses until the fence is reacquired.
      await surface.loseFenceForTests();
      const fenced = await surface.prepareGeneration({
        generation: "gen-2",
        headCursor: "6",
        batches: [],
        deadlineAt: DEADLINE,
        operationId: "op-fenced",
      });
      expect(fenced.ok).toBe(false);
      await surface.reacquireFenceForTests();

      // Expired deadline: preparation refuses without touching the published generation.
      const expired = await surface.prepareGeneration({
        generation: "gen-2",
        headCursor: "6",
        batches: [],
        deadlineAt: PAST_DEADLINE,
        operationId: "op-expired",
      });
      expect(expired.ok).toBe(false);
      if (expired.ok) return;
      expect(expired.error.code).toBe("DEADLINE_EXCEEDED");

      // Conflicting generation: the same operation id with different content conflicts.
      const conflict = await surface.prepareGeneration({
        generation: "gen-2",
        headCursor: "5",
        batches: [],
        deadlineAt: DEADLINE,
        operationId: "op-seed",
      });
      expect(conflict.ok).toBe(false);
      if (conflict.ok) return;
      expect(conflict.error.code).toBe("DIGEST_CONFLICT");

      // Preparation alone cannot acknowledge: an unknown token never commits, and a
      // prepared-but-unpublished token never commits either.
      expect((await surface.acknowledgePublication("token:unknown")).ok).toBe(false);
      const unpub = await surface.prepareGeneration({
        generation: "gen-unpub",
        headCursor: "5",
        batches: [],
        deadlineAt: DEADLINE,
        operationId: "op-unpublished",
      });
      expect(unpub.ok).toBe(true);
      if (!unpub.ok) return;
      expect((await surface.acknowledgePublication(unpub.value.token)).ok).toBe(false);

      // No refusal advanced the acknowledgement or regressed coverage.
      expect((await surface.coverage()).cursor).toBe(coveredBefore);
      expect(await surface.liveIds()).toContain("x2b:r2");
    }
  });

  it("recreation rejects previous-incarnation receipts, competing writers conflict, lag never advances coverage", async () => {
    const dir = workdir();
    const runner = createX2bMemorySqlRunner();
    // x2b:r3 is canonically terminal from the start: the lagged tombstone batch applies
    // from the resolver answer, never from its reason label.
    const lagTerminal = terminalResolver(new Set(["x2b:r3"]));
    const { adapter: graph } = openGraph(dir, "adds-first", undefined, lagTerminal);
    const { adapter: vector } = await openVector(runner, "adds-first", undefined, lagTerminal);
    const seed: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "4",
      records: [{ record_id: "x2b:r2", record_digest: "sha256:x2b-x2b:r2" }],
      removals: [],
    };
    for (const surface of [graph, vector] as const) {
      expect((await surface.invalidate(toBatch(seed))).ok).toBe(true);
    }

    // Lag: prepare and publish two batches without acknowledging — readers converge
    // (the re-added record ends tombstoned), coverage stays at the last acknowledgement.
    const lagAdd: X2bBatch = {
      from_cursor_exclusive: "4",
      through_cursor_inclusive: "7",
      records: [{ record_id: "x2b:r3", record_digest: "sha256:x2b-x2b:r3" }],
      removals: [],
    };
    const lagTomb: X2bBatch = {
      from_cursor_exclusive: "7",
      through_cursor_inclusive: "8",
      records: [],
      removals: [{ record_id: "x2b:r3", reason_ref: "memory:tombstoned" }],
    };
    const lagging = await graph.prepareGeneration({
      generation: "gen-lag",
      headCursor: "8",
      batches: [toBatch(lagAdd), toBatch(lagTomb)],
      deadlineAt: DEADLINE,
      operationId: "op-lag",
    });
    expect(lagging.ok).toBe(true);
    if (!lagging.ok) return;
    expect((await graph.publishPublication(lagging.value.token)).ok).toBe(true);
    expect((await graph.coverage()).cursor).toBe("4");
    expect((await graph.coverage()).complete).toBe(false);
    const lagged = await graph.readCurrent();
    expect(lagged.ok).toBe(true);
    if (!lagged.ok) return;
    expect(lagged.value.live).not.toContain("x2b:r3");
    // Late acknowledgement advances coverage without replay.
    expect((await graph.acknowledgePublication(lagging.value.token)).ok).toBe(true);
    expect((await graph.coverage()).cursor).toBe("8");

    // Competing writers: a second instance advances the manifest; the first one's token conflicts.
    const writerA = openGraph(dir, "adds-first", undefined, lagTerminal);
    const preparedA = await writerA.adapter.prepareGeneration({
      generation: "gen-a",
      headCursor: "8",
      batches: [],
      deadlineAt: DEADLINE,
      operationId: "op-writer-a",
    });
    expect(preparedA.ok).toBe(true);
    if (!preparedA.ok) return;
    const writerB = openGraph(dir, "adds-first", undefined, lagTerminal);
    expect((await writerB.adapter.invalidate(toBatch(seed))).ok).toBe(true);
    const conflicted = await writerA.adapter.publishPublication(preparedA.value.token);
    expect(conflicted.ok).toBe(false);

    // Recreation: data and coverage survive, previous-incarnation tokens are rejected.
    const preparedOld = await graph.prepareGeneration({
      generation: "gen-old",
      headCursor: "8",
      batches: [],
      deadlineAt: DEADLINE,
      operationId: "op-old",
    });
    expect(preparedOld.ok).toBe(true);
    if (!preparedOld.ok) return;
    await graph.recreateForTests();
    expect((await graph.publishPublication(preparedOld.value.token)).ok).toBe(false);
    expect((await graph.coverage()).cursor).toBe("8");
    const current = await graph.readCurrent();
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.live).toContain("x2b:r2");
  });

  it("MAJEUR-1 (opus reproduction): a tombstone carried with the engine command reason never resurfaces through ingest", async () => {
    const dir = workdir();
    // Canonical truth evolves in journal order: nothing terminal during the add, then doomed.
    const terminal = new Set<string>();
    const { adapter: graph } = openGraph(dir, "adds-first", undefined, terminalResolver(terminal));
    const runner = createX2bMemorySqlRunner();
    const { adapter: vector } = await openVector(runner, "adds-first", undefined, terminalResolver(terminal));
    const add: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "1",
      records: [
        { record_id: "x2b:doomed", record_digest: "sha256:x2b-x2b:doomed" },
        { record_id: "x2b:keep", record_digest: "sha256:x2b-x2b:keep" },
      ],
      removals: [],
    };
    expect((await graph.invalidate(toBatch(add))).ok).toBe(true);
    expect((await vector.invalidate(toBatch(add))).ok).toBe(true);
    // The engine carries the lifecycle command reason, not the retroactive fold reason.
    terminal.add("x2b:doomed");
    const tombstone: X2bBatch = {
      from_cursor_exclusive: "1",
      through_cursor_inclusive: "2",
      records: [],
      removals: [{ record_id: "x2b:doomed", reason_ref: "reason:tombstone" }],
    };
    expect((await graph.invalidate(toBatch(tombstone))).ok).toBe(true);
    expect((await vector.invalidate(toBatch(tombstone))).ok).toBe(true);
    // A stale serving-path ingestion must not resurrect the tombstoned record.
    expect((await graph.ingest("x2b:doomed")).ok).toBe(true);
    expect((await vector.ingest("x2b:doomed")).ok).toBe(true);
    const current = await graph.readCurrent();
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.tombstoned).toContain("x2b:doomed");
    expect(current.value.live).toEqual(["x2b:keep"]);
    expect(await vector.storedVectorIdsForTests()).toEqual(["x2b:keep"]);
    // The real graph file carries no owned node or edge of the tombstoned record.
    const file = readGraphFile(dir);
    for (const node of x2bOwnedNodes("x2b:doomed")) expect(file.nodes).not.toContain(node);
    for (const edge of x2bOwnedEdges("x2b:doomed")) expect(file.links).not.toContainEqual(edge);
    for (const node of x2bOwnedNodes("x2b:keep")) expect(file.nodes).toContain(node);
    const scored = await vector.querySimilar({ vector: x2bVector("x2b:doomed", DIMENSION), topK: 10 });
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.matches.map((match) => match.record_id)).not.toContain("x2b:doomed");
  });

  it("MAJEUR-2: an interrupted manifest commit leaves no physical vector row behind", async () => {
    const base = createX2bMemorySqlRunner();
    let armed = true;
    const failOnce = async (text: string): Promise<void> => {
      if (armed && text === X2B_UPSERT_MANIFEST) {
        armed = false;
        throw new Error("inject:manifest-commit-fails");
      }
    };
    const wrap = (target: X2bSqlRunner): X2bSqlRunner => ({
      query: async (text: string, values?: unknown[]) => {
        await failOnce(text);
        return target.query(text, values);
      },
      withTransaction: <T>(work: (tx: X2bSqlRunner) => Promise<T>): Promise<T> =>
        target.withTransaction((tx) => work(wrap(tx))),
      close: () => target.close(),
    });
    // Canonical truth evolves: nothing terminal during the interrupted ingest, terminal
    // once the tombstone batch applies — the adapter never reads the reason label.
    const terminal = new Set<string>();
    const { adapter: vector } = await openVector(wrap(base), "adds-first", undefined, terminalResolver(terminal));
    // The serving-path ingestion fails at the manifest commit: the row must roll back.
    expect((await vector.ingest("x2b:orphan")).ok).toBe(false);
    expect(await vector.storedVectorIdsForTests()).toEqual([]);
    terminal.add("x2b:orphan");
    // The terminal tombstone of the interrupted record deletes every physical row.
    const tombstone: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "1",
      records: [],
      removals: [{ record_id: "x2b:orphan", reason_ref: "memory:tombstoned" }],
    };
    expect((await vector.invalidate(toBatch(tombstone))).ok).toBe(true);
    expect(await vector.storedVectorIdsForTests()).toEqual([]);
    const current = await vector.readCurrent();
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.tombstoned).toContain("x2b:orphan");
    const scored = await vector.querySimilar({ vector: x2bVector("x2b:orphan", DIMENSION), topK: 10 });
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.matches).toEqual([]);
  });

  it("without a canonical resolver both factories fail closed before any storage access", async () => {
    expect(() => createFileGraphProjectionAdapter({ dir: workdir() } as never)).toThrow("resolveTerminal");
    await expect(createPostgresExactProjectionAdapter({} as never)).rejects.toThrow("resolveTerminal");
  });

  it("tour-1 reproduction: engine-reason tombstone plus stale ingest stays forgotten", async () => {
    for (const backend of ["graph", "vector"] as const) {
      const dir = workdir();
      const runner = createX2bMemorySqlRunner();
      const terminal = new Set<string>();
      // The engine's reason label carries no terminal proof; the canonical answer does.
      const graph = createFileGraphProjectionAdapter({
        dir: join(dir, "graph"), namespace: "x2b", materialize, clock: () => NOW,
        resolveTerminal: terminalResolver(terminal),
      });
      const vector = await createPostgresExactProjectionAdapter({
        namespace: "x2b",
        dimension: DIMENSION,
        sqlRunner: runner,
        embed: (record: { record_id: string }) => x2bVector(record.record_id, DIMENSION),
        contribute: (record: { record_id: string }) => x2bContribution(record.record_id),
        clock: () => NOW,
        resolveTerminal: terminalResolver(terminal),
      });
      const add: X2bBatch = {
        from_cursor_exclusive: "0",
        through_cursor_inclusive: "1",
        records: [
          { record_id: "x2b:doomed", record_digest: "sha256:x2b-x2b:doomed" },
          { record_id: "x2b:keep", record_digest: "sha256:x2b-x2b:keep" },
        ],
        removals: [],
      };
      const tombstone: X2bBatch = {
        from_cursor_exclusive: "1",
        through_cursor_inclusive: "2",
        records: [],
        removals: [{ record_id: "x2b:doomed", reason_ref: "reason:tombstone" }],
      };
      const surface = backend === "graph" ? graph : vector;
      expect((await surface.invalidate(toBatch(add))).ok).toBe(true);
      terminal.add("x2b:doomed");
      expect((await surface.invalidate(toBatch(tombstone))).ok).toBe(true);
      const afterTombstone = backend === "graph"
        ? await graph.readCurrent()
        : await vector.readCurrent();
      expect(afterTombstone.ok).toBe(true);
      if (!afterTombstone.ok) return;
      expect(afterTombstone.value.live).toEqual(["x2b:keep"]);
      expect(afterTombstone.value.tombstoned).toEqual(["x2b:doomed"]);
      // A stale serving-path ingestion absorbs on the touched record: nothing resurrects.
      expect((await surface.ingest("x2b:doomed")).ok).toBe(true);
      const afterIngest = backend === "graph"
        ? await graph.readCurrent()
        : await vector.readCurrent();
      expect(afterIngest.ok).toBe(true);
      if (!afterIngest.ok) return;
      expect(afterIngest.value.live).toEqual(["x2b:keep"]);
      // Re-invalidation still converges and the physical artifacts stay clean.
      expect((await surface.invalidate(toBatch(tombstone))).ok).toBe(true);
      if (backend === "graph") {
        const file = readGraphFile(dir);
        for (const node of x2bOwnedNodes("x2b:doomed")) expect(file.nodes).not.toContain(node);
        for (const node of x2bOwnedNodes("x2b:keep")) expect(file.nodes).toContain(node);
      } else {
        expect(await vector.storedVectorIdsForTests()).toEqual(["x2b:keep"]);
        const scored = await vector.querySimilar({ vector: x2bVector("x2b:doomed", DIMENSION), topK: 10 });
        expect(scored.ok).toBe(true);
        if (!scored.ok) return;
        expect(scored.value.matches.map((match) => match.record_id)).toEqual(["x2b:keep"]);
      }
    }
  });

  it("a lying tombstone label never marks a record terminal without canonical truth", async () => {
    for (const backend of ["graph", "vector"] as const) {
      const dir = workdir();
      const runner = createX2bMemorySqlRunner();
      // The canonical answer stays empty: no record is terminal, whatever the labels claim.
      const surface: TestAdapter = backend === "graph"
        ? openGraph(dir, "adds-first", undefined, terminalResolver(new Set())).harness
        : (await openVector(runner, "adds-first", undefined, terminalResolver(new Set()))).harness;
      const add: X2bBatch = {
        from_cursor_exclusive: "0",
        through_cursor_inclusive: "1",
        records: [{ record_id: "x2b:r1", record_digest: "sha256:x2b-x2b:r1" }],
        removals: [],
      };
      // A removal carrying the retroactive fold reason for a canonically live record.
      const lying: X2bBatch = {
        from_cursor_exclusive: "1",
        through_cursor_inclusive: "2",
        records: [],
        removals: [{ record_id: "x2b:r1", reason_ref: "memory:tombstoned" }],
      };
      const readd: X2bBatch = {
        from_cursor_exclusive: "2",
        through_cursor_inclusive: "3",
        records: [{ record_id: "x2b:r1", record_digest: "sha256:x2b-x2b:r1" }],
        removals: [],
      };
      expect((await surface.invalidate(toBatch(add))).ok).toBe(true);
      expect((await surface.invalidate(toBatch(lying))).ok).toBe(true);
      // Removed from the live set, but never absorbed into the terminal set.
      expect(await surface.liveIds()).toEqual([]);
      expect(await surface.tombstonedIds()).toEqual([]);
      expect((await surface.ingest("x2b:r1")).ok).toBe(true);
      expect(await surface.liveIds()).toEqual([]);
      // A later batch re-adds it: no label ever made it terminal.
      expect((await surface.invalidate(toBatch(readd))).ok).toBe(true);
      expect(await surface.liveIds()).toEqual(["x2b:r1"]);
      expect(await surface.tombstonedIds()).toEqual([]);
    }
  });

  it("MAJEUR-3: a delayed serving-path ingest never clobbers an acknowledged tombstone", async () => {
    const dir = workdir();
    const runner = createX2bMemorySqlRunner();
    const terminal = new Set<string>();
    // The first two canonical resolutions of a distinct, untouched record park with an
    // already-frozen nonterminal answer. Every other resolution answers immediately,
    // so the tombstone invalidate commits while both ingests are still resolving.
    let parked = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let park = false;
    const gated: X2bTerminalResolver = async (recordIds: readonly string[]) => {
      const answer = new Set(recordIds.filter((id) => terminal.has(id)));
      if (park && recordIds.includes("x2b:late") && parked < 2) {
        parked += 1;
        await gate;
      }
      return answer;
    };
    const graph = createFileGraphProjectionAdapter({
      dir: join(dir, "graph"),
      namespace: "x2b",
      materialize,
      clock: () => NOW,
      resolveTerminal: gated,
    });
    const vector = await createPostgresExactProjectionAdapter({
      namespace: "x2b",
      dimension: DIMENSION,
      sqlRunner: runner,
      embed: (record: { record_id: string }) => x2bVector(record.record_id, DIMENSION),
      contribute: (record: { record_id: string }) => x2bContribution(record.record_id),
      clock: () => NOW,
      resolveTerminal: gated,
    });
    const add: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "1",
      records: [
        { record_id: "x2b:doomed", record_digest: "sha256:x2b-x2b:doomed" },
        { record_id: "x2b:keep", record_digest: "sha256:x2b-x2b:keep" },
      ],
      removals: [],
    };
    // Engine-shaped reason: terminality must come from the resolver, never this label.
    const tombstone: X2bBatch = {
      from_cursor_exclusive: "1",
      through_cursor_inclusive: "2",
      records: [],
      removals: [{ record_id: "x2b:doomed", reason_ref: "reason:tombstone" }],
    };
    expect((await graph.invalidate(toBatch(add))).ok).toBe(true);
    expect((await vector.invalidate(toBatch(add))).ok).toBe(true);
    park = true;
    const racingGraph = graph.ingest("x2b:late");
    const racingVector = vector.ingest("x2b:late");
    for (let tick = 0; tick < 1000 && parked < 2; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parked).toBe(2);
    terminal.add("x2b:doomed");
    // The file tombstone commits while its stale ingest is still resolving (the vector
    // ingest holds its transaction in the resolver, so its invalidate runs after release).
    expect((await graph.invalidate(toBatch(tombstone))).ok).toBe(true);
    release?.();
    // Fresh re-application keeps the new record, the tombstone and monotone acknowledgement.
    expect((await racingGraph).ok).toBe(true);
    expect((await racingVector).ok).toBe(true);
    expect((await vector.invalidate(toBatch(tombstone))).ok).toBe(true);
    const current = await graph.readCurrent();
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.live).toEqual(["x2b:keep", "x2b:late"]);
    expect(current.value.tombstoned).toContain("x2b:doomed");
    expect((await graph.coverage()).cursor).toBe("2");
    expect(await vector.storedVectorIdsForTests()).toEqual(["x2b:keep", "x2b:late"]);
    const scored = await vector.querySimilar({ vector: x2bVector("x2b:doomed", DIMENSION), topK: 10 });
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.matches.map((match) => match.record_id).sort()).toEqual(["x2b:keep", "x2b:late"]);
    const file = readGraphFile(dir);
    for (const node of x2bOwnedNodes("x2b:doomed")) expect(file.nodes).not.toContain(node);
    for (const node of x2bOwnedNodes("x2b:keep")) expect(file.nodes).toContain(node);
  });

  it("an interrupted commit heals on reopen before any read, then replay converges", async () => {
    const dir = workdir();
    const terminal = new Set<string>();
    let crashGraphAt = 1;
    let crashVectorAt = 1;
    const crashingGraph = openGraph(
      dir,
      "adds-first",
      { beforeManifestCommit: (prior) => { if (prior === crashGraphAt) { crashGraphAt = -1; throw new Error("inject:crash-before-commit"); } } },
      terminalResolver(terminal),
    ).adapter;
    const runner = createX2bMemorySqlRunner();
    const crashingVector = (await openVector(
      runner,
      "adds-first",
      { beforeManifestCommit: (prior) => { if (prior === crashVectorAt) { crashVectorAt = -1; throw new Error("inject:crash-before-commit"); } } },
      terminalResolver(terminal),
    )).adapter;
    const add: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "1",
      records: [
        { record_id: "x2b:doomed", record_digest: "sha256:x2b-x2b:doomed" },
        { record_id: "x2b:keep", record_digest: "sha256:x2b-x2b:keep" },
      ],
      removals: [],
    };
    expect((await crashingGraph.invalidate(toBatch(add))).ok).toBe(true);
    expect((await crashingVector.invalidate(toBatch(add))).ok).toBe(true);
    terminal.add("x2b:doomed");
    const tombstone: X2bBatch = {
      from_cursor_exclusive: "1",
      through_cursor_inclusive: "2",
      records: [],
      removals: [{ record_id: "x2b:doomed", reason_ref: "reason:tombstone" }],
    };
    // Both backends refuse the interrupted commit; nothing is certified.
    const crashedGraph = await crashingGraph.invalidate(toBatch(tombstone));
    expect(crashedGraph.ok).toBe(false);
    if (crashedGraph.ok) return;
    expect(crashedGraph.error.code).toBe("PROJECTION_STALE");
    const crashedVector = await crashingVector.invalidate(toBatch(tombstone));
    expect(crashedVector.ok).toBe(false);
    // Reopen on the same backends: recovery completes before any read.
    const graph = openGraph(dir, "removals-first", undefined, terminalResolver(terminal)).adapter;
    const vector = (await openVector(runner, "removals-first", undefined, terminalResolver(terminal))).adapter;
    await graph.recover();
    const recoveredGraph = await graph.readCurrent();
    expect(recoveredGraph.ok).toBe(true);
    if (!recoveredGraph.ok) return;
    // File lane: the manifest intent committed, the mirror healed to it.
    expect(recoveredGraph.value.tombstoned).toContain("x2b:doomed");
    expect(recoveredGraph.value.live).toEqual(["x2b:keep"]);
    const healedFile = readGraphFile(dir);
    for (const node of x2bOwnedNodes("x2b:doomed")) expect(healedFile.nodes).not.toContain(node);
    for (const node of x2bOwnedNodes("x2b:keep")) expect(healedFile.nodes).toContain(node);
    const recoveredVector = await vector.readCurrent();
    // The canonical tombstone prevents stale reads until the rollback is replayed.
    expect(recoveredVector.ok).toBe(false);
    expect(await vector.storedVectorIdsForTests()).toEqual(["x2b:doomed", "x2b:keep"]);
    // Replay converges every backend: the tombstone is terminal and physical.
    expect((await graph.invalidate(toBatch(tombstone))).ok).toBe(true);
    expect((await vector.invalidate(toBatch(tombstone))).ok).toBe(true);
    const convergedGraph = await graph.readCurrent();
    expect(convergedGraph.ok && convergedGraph.value.live).toEqual(["x2b:keep"]);
    expect(await vector.storedVectorIdsForTests()).toEqual(["x2b:keep"]);
    const convergedFile = readGraphFile(dir);
    for (const node of x2bOwnedNodes("x2b:doomed")) expect(convergedFile.nodes).not.toContain(node);
    const scored = await vector.querySimilar({ vector: x2bVector("x2b:doomed", DIMENSION), topK: 10 });
    expect(scored.ok && scored.value.matches.map((match) => match.record_id)).toEqual(["x2b:keep"]);
  });

  it("sequences x crash points x reopen converge to the oracle on the real backends", async () => {
    for (const history of x2bHistories()) {
      for (const order of X2B_ORDERS) {
        const batches = partitionIntoBatches(history, 2).map((batch) => ({
          ...toBatch(batch),
          // Engine-shaped reasons: terminality must come from the resolver, never the reason.
          removals: batch.removals.map((removal) => ({
            record_id: removal.record_id,
            reason_ref: removal.reason_ref === "memory:tombstoned" ? "reason:tombstone" : removal.reason_ref,
          })),
        }));
        for (let crashAt = -1; crashAt < batches.length; crashAt++) {
          const dir = workdir();
          const runner = createX2bMemorySqlRunner();
          const terminal = new Set<string>();
          const canonical = (through: string): void => {
            for (const event of history) {
              if (BigInt(event.cursor) > BigInt(through)) break;
              if (event.reason_ref === "memory:tombstoned") terminal.add(event.record_id);
            }
          };
          let armedGraph = true;
          let armedVector = true;
          let crashes = 0;
          const crashGraphOnce = (prior: number): void => {
            if (armedGraph && prior === crashAt) {
              armedGraph = false;
              crashes += 1;
              throw new Error("inject:crash-before-commit");
            }
          };
          const crashVectorOnce = (prior: number): void => {
            if (armedVector && prior === crashAt) {
              armedVector = false;
              crashes += 1;
              throw new Error("inject:crash-before-commit");
            }
          };
          let graph = openGraph(dir, order, { beforeManifestCommit: crashGraphOnce }, terminalResolver(terminal)).adapter;
          let vector = (await openVector(runner, order, { beforeManifestCommit: crashVectorOnce }, terminalResolver(terminal))).adapter;
          for (const batch of batches) {
            canonical(batch.through_cursor_inclusive);
            const failedGraph = await graph.invalidate(batch);
            const failedVector = await vector.invalidate(batch);
            if (!failedGraph.ok || !failedVector.ok) {
              // Interruption: reopen healthy instances on the same backends and replay.
              expect(crashAt).toBeGreaterThanOrEqual(0);
              graph = openGraph(dir, order === "adds-first" ? "removals-first" : "adds-first", undefined, terminalResolver(terminal)).adapter;
              vector = (await openVector(runner, order, undefined, terminalResolver(terminal))).adapter;
              expect((await graph.invalidate(batch)).ok).toBe(true);
              expect((await vector.invalidate(batch)).ok).toBe(true);
            }
          }
          const head = history[history.length - 1]!.cursor;
          const expected = x2bOracle(history, head, order);
          const currentGraph = await graph.readCurrent();
          expect(currentGraph.ok).toBe(true);
          if (!currentGraph.ok) continue;
          expect(new Set(currentGraph.value.live)).toEqual(expected.live);
          expect(new Set(currentGraph.value.tombstoned)).toEqual(expected.tombstoned);
          expect(new Set(Object.keys(Object.fromEntries(currentGraph.value.influence)))).toEqual(expected.live);
          const currentVector = await vector.readCurrent();
          expect(currentVector.ok).toBe(true);
          if (!currentVector.ok) continue;
          expect(new Set(currentVector.value.live)).toEqual(expected.live);
          // Physical artifacts agree with the oracle: rows, file, scores.
          expect(await vector.storedVectorIdsForTests()).toEqual([...expected.live].sort());
          const file = readGraphFile(dir);
          const expectedNodes = new Set<string>();
          for (const id of expected.live) for (const node of x2bOwnedNodes(id)) expectedNodes.add(node);
          if (expected.live.size > 0) expectedNodes.add(X2B_HUB_NODE);
          expect(new Set(file.nodes)).toEqual(expectedNodes);
          for (const id of expected.tombstoned) {
            const scored = await vector.querySimilar({ vector: x2bVector(id, DIMENSION), topK: 10 });
            expect(scored.ok).toBe(true);
            if (!scored.ok) continue;
            expect(scored.value.matches.map((match) => match.record_id)).toEqual([...expected.live].sort());
          }
          // Recovery cut: reopened instances serve the same digest.
          const reopenedGraph = openGraph(dir, order, undefined, terminalResolver(terminal)).adapter;
          const reopenedGraphCurrent = await reopenedGraph.readCurrent();
          expect(reopenedGraphCurrent.ok && reopenedGraphCurrent.value.digest).toBe(currentGraph.value.digest);
          // The interruption really fired on both backends (or never, when crashAt is -1).
          expect(crashes).toBe(crashAt === -1 ? 0 : 2);
        }
      }
    }
  });

  it("aggregate coverage is the minimum acknowledged cursor and complete needs every selected surface", () => {
    const covered = x2bAggregateCoverage([
      { cursor: "8", complete: true },
      { cursor: "5", complete: true },
    ]);
    expect(covered.cursor).toBe("5");
    expect(covered.complete).toBe(true);
    const gapped = x2bAggregateCoverage([
      { cursor: "8", complete: true },
      { cursor: "5", complete: false },
    ]);
    expect(gapped.complete).toBe(false);
    expect(gapped.cursor).toBe("5");
  });

  it("namespaces stay isolated and a namespace clear is not a record deletion", async () => {
    const dir = workdir();
    // Sibling namespaces share no terminal record: the canonical answer stays empty.
    const isolated = terminalResolver(new Set<string>());
    const left = createFileGraphProjectionAdapter({
      dir: join(dir, "graph"),
      namespace: "x2b-left",
      materialize,
      clock: () => NOW,
      resolveTerminal: isolated,
    });
    const right = createFileGraphProjectionAdapter({
      dir: join(dir, "graph"),
      namespace: "x2b-right",
      materialize,
      clock: () => NOW,
      resolveTerminal: isolated,
    });
    const batch: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "1",
      records: [{ record_id: "x2b:r1", record_digest: "sha256:x2b-x2b:r1" }],
      removals: [],
    };
    expect((await left.invalidate(toBatch(batch))).ok).toBe(true);
    expect((await right.invalidate(toBatch(batch))).ok).toBe(true);
    await left.clearNamespaceForTests();
    const leftCurrent = await left.readCurrent();
    expect(leftCurrent.ok).toBe(true);
    const rightCurrent = await right.readCurrent();
    expect(rightCurrent.ok).toBe(true);
    if (!rightCurrent.ok) return;
    // The cleared namespace lost its objects; the sibling namespace is intact.
    expect(rightCurrent.value.nodes).toContain("x2b:node:x2b:r1");
    // A namespace clear is not a terminal deletion: replaying the batch resurrects it there.
    expect((await left.invalidate(toBatch(batch))).ok).toBe(true);
    const leftAgain = await left.readCurrent();
    expect(leftAgain.ok && leftAgain.value.nodes).toContain("x2b:node:x2b:r1");

    // Terminal tombstones survive a namespace clear: replaying an add batch resurrects
    // never-tombstoned records but never a tombstoned one (retroactive fold, not last-touch:
    // the clear dropped last-touch cursors while keeping the terminal set).
    const dir2 = workdir();
    // x2b:r9 is canonically terminal: the clear keeps the terminal set while dropping the
    // live set, so replaying the add resurrects r1 but never r9 — decided by the resolver.
    const grave = createFileGraphProjectionAdapter({
      dir: join(dir2, "graph"),
      namespace: "x2b-grave",
      materialize,
      clock: () => NOW,
      resolveTerminal: terminalResolver(new Set(["x2b:r9"])),
    });
    const addBoth: X2bBatch = {
      from_cursor_exclusive: "0",
      through_cursor_inclusive: "1",
      records: [
        { record_id: "x2b:r1", record_digest: "sha256:x2b-x2b:r1" },
        { record_id: "x2b:r9", record_digest: "sha256:x2b-x2b:r9" },
      ],
      removals: [],
    };
    const tombstoneR9: X2bBatch = {
      from_cursor_exclusive: "1",
      through_cursor_inclusive: "2",
      records: [],
      removals: [{ record_id: "x2b:r9", reason_ref: "memory:tombstoned" }],
    };
    expect((await grave.invalidate(toBatch(addBoth))).ok).toBe(true);
    expect((await grave.invalidate(toBatch(tombstoneR9))).ok).toBe(true);
    await grave.clearNamespaceForTests();
    expect((await grave.invalidate(toBatch(addBoth))).ok).toBe(true);
    const afterClear = await grave.readCurrent();
    expect(afterClear.ok).toBe(true);
    if (!afterClear.ok) return;
    expect(afterClear.value.nodes).toContain("x2b:node:x2b:r1");
    expect(afterClear.value.nodes.join(",")).not.toContain("x2b:r9");
    expect(afterClear.value.tombstoned).toContain("x2b:r9");
  });
});
