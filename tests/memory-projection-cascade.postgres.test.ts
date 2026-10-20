import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  createMemoryPortV2,
  knowledgePayloadDigest,
  openPostgresCanonicalMemoryStoreV1,
  receiptDigest,
  type CanonicalMemoryStorePort,
  type Digest,
  type MemoryEngineDependenciesV2,
  type MemoryPortV2,
  type ProjectionBatchV1,
  type ProjectionInvalidationSurfaceV1,
} from "../engram-memory/index.js";
import {
  createFileGraphProjectionAdapter,
  type FileGraphProjectionAdapter,
  type X2bPersistedState,
  type X2bProjectionBatch,
  type X2bTerminalResolver,
} from "../src/storage/memory-projection.js";
import {
  createPostgresExactProjectionAdapter,
  createPostgresExactVectorStore,
  createX2bMemorySqlRunner,
  X2B_SELECT_MANIFEST_FOR_UPDATE,
  X2B_UPSERT_MANIFEST,
  type PostgresExactProjectionAdapter,
  type X2bSqlRunner,
} from "../src/storage/vector/postgres-exact.js";
import { captureRequest, lifecycleCommand } from "./memory-l3-fixture.js";
import { FULL_ALLOWLIST, recallRequest } from "./memory-l7-fixture.js";
import {
  x2bContribution,
  x2bOwnedEdges,
  x2bOwnedNodes,
  x2bVector,
  X2B_HUB_NODE,
  X2B_ORDERS,
} from "./memory-x2b-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";

const MATRIX = ["16", "17"] as const;
const DIMENSION = 8;
const NOW_X2B = "2026-08-16T12:34:56.789Z";
const DEADLINE_X2B = "2026-08-16T12:40:00.000Z";
const DIGEST_X2B = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Digest;

const stops: Array<() => void> = [];
const workspaces: string[] = [];
afterEach(() => {
  while (stops.length > 0) stops.pop()!();
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

function workdir(): string {
  mkdirSync(join(process.cwd(), ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".tmp", "x2b-pg-"));
  workspaces.push(dir);
  return dir;
}

/**
 * X2 terminal rule over the canonical journal total order — the same rule the cascade
 * applies at apply time: the last `to_state` per record wins and `tombstoned` is absorbing.
 * The delivered adapters consult it when a batch applies and on the serving-path ingest;
 * the batch's opaque reason never decides terminality.
 */
function canonicalTerminalResolver(store: CanonicalMemoryStorePort): X2bTerminalResolver {
  return async (recordIds: readonly string[]) => {
    const wanted = new Set(recordIds);
    const last = new Map<string, string>();
    let after = "0";
    for (;;) {
      const page = await store.readJournal({ after, limit: 2000 });
      if (!page.ok) throw new Error(`terminal resolution failed: ${page.error.code} ${page.error.message}`);
      if (page.value.length === 0) break;
      for (const event of page.value) {
        if (event.record_id !== undefined && wanted.has(event.record_id)) last.set(event.record_id, event.to_state);
        after = event.cursor;
      }
      if (page.value.length < 2000) break;
    }
    return new Set([...last].filter(([, state]) => state === "tombstoned").map(([id]) => id));
  };
}

/** Engine-facing vector surface: pure delegation to the delivered PostgresExact adapter. */
class RealVectorSurface implements ProjectionInvalidationSurfaceV1 {
  readonly projection_id = "vector";
  dropNextResponse = false;
  failRemovalOnce: string | undefined;
  beforeInvalidate: ((batch: ProjectionBatchV1) => void) | undefined;
  constructor(private readonly adapter: PostgresExactProjectionAdapter) {}
  async close(): Promise<void> {
    await this.adapter.close();
  }
  /** Serving-path ingestion: the host materializes the accepted record (batches carry removals). */
  async ingest(recordId: string): Promise<void> {
    const done = await this.adapter.ingest(recordId);
    if (!done.ok) throw new Error(`real vector ingest refused: ${done.error.code} ${done.error.message}`);
  }
  async invalidate(batch: ProjectionBatchV1) {
    this.beforeInvalidate?.(batch);
    if (this.failRemovalOnce !== undefined && batch.removals.some((r) => r.record_id === this.failRemovalOnce)) {
      this.failRemovalOnce = undefined;
      throw new Error("inject:tombstone-round");
    }
    const stripped = {
      from_cursor_exclusive: batch.from_cursor_exclusive,
      through_cursor_inclusive: batch.through_cursor_inclusive,
      records: batch.records.map((record) => ({ record_id: record.record_id, record_digest: record.record_digest })),
      removals: batch.removals.map((removal) => ({ record_id: removal.record_id, reason_ref: removal.reason_ref })),
    };
    const done = await this.adapter.invalidate(stripped);
    // A refusal is an uncertain outcome, never a certification: surface it untyped so the
    // engine maps it to PROJECTION_STALE (X2 tour 3, normative resume §5).
    if (!done.ok) throw new Error(`real vector surface refused: ${done.error.code} ${done.error.message}`);
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new Error("inject:lost-response");
    }
    return {
      ok: true as const,
      value: { projection_id: this.projection_id, cursor: done.value.cursor, digest: done.value.digest as Digest },
    };
  }
  async querySimilar(vector: number[], topK: number): Promise<Array<{ record_id: string; score: number }>> {
    const done = await this.adapter.querySimilar({ vector, topK });
    if (!done.ok) throw new Error(`real vector query refused: ${done.error.code} ${done.error.message}`);
    return [...done.value.matches];
  }
  /** Test-only: every stored vector id in this namespace, unfiltered (proves physical deletion). */
  async storedIds(): Promise<string[]> {
    return this.adapter.storedVectorIdsForTests();
  }
  async tombstoned(): Promise<string[]> {
    const current = await this.adapter.readCurrent();
    if (!current.ok) throw new Error(`real vector read refused: ${current.error.code}`);
    return [...current.value.tombstoned];
  }
}

/** Engine-facing graph surface: pure delegation to the delivered FileGraph adapter. */
class RealGraphSurface implements ProjectionInvalidationSurfaceV1 {
  readonly projection_id = "graph";
  dropNextResponse = false;
  failRemovalOnce: string | undefined;
  constructor(
    private readonly adapter: FileGraphProjectionAdapter,
    private readonly snapshotPath: string,
  ) {}
  async close(): Promise<void> {
    await this.adapter.close();
  }
  /** Serving-path ingestion: the host materializes the accepted record (batches carry removals). */
  async ingest(recordId: string): Promise<void> {
    const done = await this.adapter.ingest(recordId);
    if (!done.ok) throw new Error(`real graph ingest refused: ${done.error.code} ${done.error.message}`);
  }
  async invalidate(batch: ProjectionBatchV1) {
    if (this.failRemovalOnce !== undefined && batch.removals.some((r) => r.record_id === this.failRemovalOnce)) {
      this.failRemovalOnce = undefined;
      throw new Error("inject:tombstone-round");
    }
    const stripped = {
      from_cursor_exclusive: batch.from_cursor_exclusive,
      through_cursor_inclusive: batch.through_cursor_inclusive,
      records: batch.records.map((record) => ({ record_id: record.record_id, record_digest: record.record_digest })),
      removals: batch.removals.map((removal) => ({ record_id: removal.record_id, reason_ref: removal.reason_ref })),
    };
    const done = await this.adapter.invalidate(stripped);
    if (!done.ok) throw new Error(`real graph surface refused: ${done.error.code} ${done.error.message}`);
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new Error("inject:lost-response");
    }
    return {
      ok: true as const,
      value: { projection_id: this.projection_id, cursor: done.value.cursor, digest: done.value.digest as Digest },
    };
  }
  async has(recordId: string): Promise<boolean> {
    const current = await this.adapter.readCurrent();
    if (!current.ok) throw new Error(`real graph read refused: ${current.error.code}`);
    return current.value.live.includes(recordId);
  }
  async nodes(): Promise<string[]> {
    const current = await this.adapter.readCurrent();
    if (!current.ok) throw new Error(`real graph read refused: ${current.error.code}`);
    return [...current.value.nodes];
  }
  /** The real FileGraphStore snapshot, read back from disk (proves the mirror, not the model). */
  snapshotFile(): { nodes: string[]; links: Array<[string, string]> } {
    const raw = JSON.parse(readFileSync(this.snapshotPath, "utf-8")) as {
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string }>;
    };
    return {
      nodes: raw.nodes.map((node) => node.id).sort(),
      links: raw.links.map((link) => [link.source, link.target] as [string, string]),
    };
  }
}

function x2bMaterialize(record: { record_id: string }) {
  return {
    nodes: [...x2bOwnedNodes(record.record_id), X2B_HUB_NODE],
    edges: x2bOwnedEdges(record.record_id),
    contribution: x2bContribution(record.record_id),
    vector: x2bVector(record.record_id, DIMENSION),
  };
}

interface VectorOpener {
  sqlRunner?: X2bSqlRunner;
  connection?: string;
  hooks?: { beforePublish?: (prior: number) => void; beforeManifestCommit?: (prior: number) => void };
}

async function openRealGraph(dir: string, resolveTerminal: X2bTerminalResolver): Promise<RealGraphSurface> {
  const adapter = createFileGraphProjectionAdapter({
    dir: join(dir, "graph"),
    namespace: "x2b",
    materialize: x2bMaterialize,
    clock: () => NOW_X2B,
    resolveTerminal,
  });
  return new RealGraphSurface(adapter, join(dir, "graph", "graph-x2b.json"));
}

async function openRealVector(opener: VectorOpener, resolveTerminal: X2bTerminalResolver): Promise<RealVectorSurface> {
  const adapter = await createPostgresExactProjectionAdapter({
    namespace: "x2b",
    dimension: DIMENSION,
    ...(opener.sqlRunner !== undefined ? { sqlRunner: opener.sqlRunner }
      : { connectionString: opener.connection, driverModule: await import("pg") }),
    embed: (record) => x2bVector(record.record_id, DIMENSION),
    contribute: (record) => x2bContribution(record.record_id),
    clock: () => NOW_X2B,
    hooks: opener.hooks,
    resolveTerminal,
  });
  return new RealVectorSurface(adapter);
}

function x2bEnginePorts(scope = "scope:l3") {
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource: { scope_ref?: string }; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:x2b",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: request.resource.scope_ref ?? scope,
        not_before: NOW_X2B,
        expires_at: DEADLINE_X2B,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: FULL_ALLOWLIST, allow_derivation_lineage: false, max_packet_bytes: 1_048_576 },
        authentication_receipt_digest: DIGEST_X2B,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate(receipt_digest: Digest, checked_at: string) {
      const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact(request: { source_record: Record<string, unknown> }) {
      const src = request.source_record as {
        scope_ref: string; purpose_ref: string; valid_time: { t: number }; components: unknown[];
        primary_component_id: string; primary_event: unknown; citations: unknown[]; retention: unknown; record_digest: Digest;
      };
      const payload = {
        schema_version: 2 as const, scope_ref: src.scope_ref, purpose_ref: src.purpose_ref, valid_time: src.valid_time,
        components: src.components, primary_component_id: src.primary_component_id, primary_event: src.primary_event,
        citations: src.citations, retention: src.retention, reconciliation: { family_refs: [] },
      };
      const body = {
        payload, source_record_digest: src.record_digest, output_payload_digest: knowledgePayloadDigest(payload as never), policy_version: "1",
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("redaction-result", body) } };
    },
  };
  const policy = {
    policy_id: "policy:x2b",
    policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:x2b", policy_version: "1", record_digest: request.record_digest, decision: "accept" as const, issued_at: NOW_X2B };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
    },
  };
  const plaintext = new Map<string, string>();
  const crypto = {
    version: 1 as const,
    async seal(input: { candidate_id: string; plaintext: string }) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`, key_ref: `key:${input.candidate_id}`, ciphertext: `ciphertext:${input.candidate_id}` };
      return { ok: true as const, value: { ...body, envelope_digest: receiptDigest("sealed-candidate", body) } };
    },
    async open(input: { sealed: { candidate_id: string } }) {
      const value = plaintext.get(input.sealed.candidate_id);
      return value === undefined
        ? { ok: false as const, error: { code: "UNAUTHORIZED" as const, operation: "inspect_candidate" as const, message: "destroyed", retryable: false } }
        : { ok: true as const, value: { plaintext: value } };
    },
    async destroy(input: { key_ref: string }) {
      const body = { destroyed: true, key_ref: input.key_ref };
      return { ok: true as const, value: { destroyed: true, receipt_digest: receiptDigest("key-destruction", body) } };
    },
    async rotate() { throw new Error("unused"); },
  };
  return { authorization, policy, crypto };
}

function openX2bMemory(
  store: CanonicalMemoryStorePort,
  surfaces: ReadonlyArray<ProjectionInvalidationSurfaceV1>,
): MemoryPortV2 {
  const ports = x2bEnginePorts();
  return createMemoryPortV2({
    canonical_store: store,
    authorization: ports.authorization,
    admission_policy: ports.policy,
    crypto: ports.crypto,
    activity_sources: [],
    allow_unfenced_memory_store: true,
    projection_surfaces: surfaces,
    clock: { now: () => NOW_X2B },
  } as unknown as MemoryEngineDependenciesV2);
}

async function captureAdmit(memory: MemoryPortV2, key: string, sequence: string, text = `x2b memory probe body ${key}`): Promise<string> {
  const captured = await memory.capture(captureRequest(key, sequence, text));
  if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`capture failed: ${captured.ok ? "no-candidate" : `${captured.error.code} ${captured.error.message}`}`);
  const admitted = await memory.requestAdmission({
    candidate_id: captured.value.candidate_id,
    authorization: { credential: "credential:x2b" },
    deadline_at: DEADLINE_X2B,
  });
  if (!admitted.ok || admitted.value.record_id === undefined) throw new Error(`admission failed: ${admitted.ok ? "no-record" : `${admitted.error.code} ${admitted.error.message}`}`);
  return admitted.value.record_id;
}

async function admitAndIngest(
  memory: MemoryPortV2,
  surfaces: Array<{ ingest(recordId: string): Promise<void> }>,
  key: string,
  sequence: string,
): Promise<string> {
  const recordId = await captureAdmit(memory, key, sequence);
  for (const surface of surfaces) await surface.ingest(recordId);
  return recordId;
}

async function invalidateAll(memory: MemoryPortV2, through: string) {
  const invalidated = await memory.invalidateProjections({
    through_cursor: through,
    authorization: { credential: "credential:x2b" },
    deadline_at: DEADLINE_X2B,
  });
  if (!invalidated.ok) throw new Error(`invalidate failed: ${invalidated.error.code} ${invalidated.error.message}`);
  return invalidated.value;
}

/** Opus a2 MAJEUR-1: the four public-engine steps, including reopen and a subsequent writer. */
async function livingMaterialForgetProof(edgeCounts: readonly number[], order: (typeof X2B_ORDERS)[number]) {
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
  const dir = workdir();
  const materials = new Map<string, ReturnType<typeof x2bMaterialize>>();
  const open = () => createFileGraphProjectionAdapter({
    dir: join(dir, "graph"), resolveTerminal: canonicalTerminalResolver(store),
    clock: () => NOW_X2B, applyOrder: order, materialize: ({ record_id }) => materials.get(record_id)!,
  });
  const adapter = open();
  const graph = new RealGraphSurface(adapter, join(dir, "graph", "graph-x2b.json"));
  const memory = openX2bMemory(store, [graph]);
  const a = await captureAdmit(memory, "x2b-loop-record-a-0001", "1");
  materials.set(a, { nodes: [`node:${a}`], edges: [], contribution: 1, vector: [] });
  await graph.ingest(a);
  expect((await invalidateAll(memory, await highWater(memory))).complete).toBe(true);

  const b = await captureAdmit(memory, "x2b-loop-record-b-0001", "2");
  const nodes = [`node:${b}`, `node:${b}:cite`];
  const pairs: Array<[string, string]> = nodes.flatMap((source) => nodes.map((target): [string, string] => [source, target]));
  const edges = pairs.flatMap((edge, index) => Array.from({ length: edgeCounts[index]! }, () => edge));
  materials.set(b, { nodes, edges, contribution: 2, vector: [] });
  const ingested = await adapter.ingest(b);
  expect((await memory.transition(lifecycleCommand("tombstone", a))).ok).toBe(true);
  const head = await highWater(memory);
  const cascades = [];
  const snapshots = [];
  for (let replay = 0; replay < 3; replay++) {
    cascades.push(await memory.invalidateProjections({ through_cursor: head,
      authorization: { credential: "credential:x2b" }, deadline_at: DEADLINE_X2B }));
    snapshots.push(graph.snapshotFile());
  }
  await adapter.close();
  const reopened = open();
  // Capture a rejection as data so the original four steps all run even on the broken adapter.
  const recovery = await reopened.recover().catch((error: unknown) => ({ thrown: String(error) }));
  const coverage = await reopened.coverage();
  const c = await captureAdmit(memory, "x2b-loop-record-c-0001", "3");
  materials.set(c, { nodes: [`node:${c}`], edges: [], contribution: 3, vector: [] });
  const subsequent = await reopened.ingest(c);
  const current = await reopened.readCurrent();

  for (const file of snapshots) {
    expect(file.nodes).toEqual([...nodes].sort());
    expect(new Set(file.links.map((edge) => JSON.stringify(edge))))
      .toEqual(new Set(edges.map((edge) => JSON.stringify(edge))));
  }
  expect(ingested.ok).toBe(true);
  for (const cascade of cascades) expect(cascade).toMatchObject({ ok: true, value: { complete: true } });
  expect(recovery).toEqual({ ok: true, value: null });
  expect(coverage).toEqual({ cursor: head, complete: true });
  expect(subsequent.ok).toBe(true);
  expect(current.ok && current.value.live).toEqual([b, c].sort());
  expect(readFileSync(join(dir, "graph", "graph-x2b.json"), "utf8")).not.toContain(a);
  await reopened.close();
  await store.close();
}

describe("x2b projection cascade over the delivered file and SQL surfaces (local proof)", () => {
  it("Opus a2 loop reproduction: a living self-loop never strands a forgotten record in FileGraphStore", async () => {
    await livingMaterialForgetProof([0, 0, 0, 1], "adds-first");
  });

  // Still exhaust 81 shapes × both orders; each test has exactly nine cases
  // and an explicit CI budget, independent of scheduling and machine speed.
  for (const order of X2B_ORDERS) {
    it.each(Array.from({ length: 9 }, (_, index) => [index * 9, index * 9 + 8] as const))(
      `valid-material property: ${order} shapes %i..%i forget another record`, async (firstShape) => {
        let completed = 0;
        for (let shape = firstShape; shape < firstShape + 9; shape++) {
          const counts = Array.from({ length: 4 }, (_, index) => Math.floor(shape / 3 ** index) % 3);
          await livingMaterialForgetProof(counts, order);
          completed++;
        }
        expect(completed).toBe(9);
    }, 60_000);
  }

  it("FileGraphStore persisted-content property: tombstones erase owned nodes and every incident or dependent edge", async () => {
    for (const order of X2B_ORDERS) {
      for (let victim = 0; victim < 3; victim++) {
        const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
        const resolver = canonicalTerminalResolver(store);
        const dir = workdir();
        const materials = new Map<string, ReturnType<typeof x2bMaterialize>>();
        const open = () => createFileGraphProjectionAdapter({
          dir: join(dir, "graph"), resolveTerminal: resolver, clock: () => NOW_X2B, applyOrder: order,
          materialize: ({ record_id }) => materials.get(record_id)!,
        });
        const adapter = open();
        const graph = new RealGraphSurface(adapter, join(dir, "graph", "graph-x2b.json"));
        const memory = openX2bMemory(store, [graph]);
        const ids: string[] = [];
        for (let index = 0; index < 3; index++) ids.push(await captureAdmit(memory, `x2b-incident-record-${index}-0001`, String(index + 1)));
        const node = (index: number) => `node:${ids[index]}`;
        for (let index = 0; index < 3; index++) {
          const foreign = [0, 1, 2].filter((other) => other !== index);
          materials.set(ids[index]!, {
            nodes: [node(index), `${node(index)}:body`], contribution: index + 1, vector: [],
            edges: [
              [node(index), `${node(index)}:body`],
              ...foreign.flatMap((other): Array<[string, string]> => [
                [node(index), node(other)], [node(other), `${node(index)}:body`],
              ]),
              // Owned by this record, but both endpoints belong to other records.
              [`${node(foreign[0]!)}:body`, `${node(foreign[1]!)}:body`],
            ],
          });
          await graph.ingest(ids[index]!);
        }
        const before = graph.snapshotFile();
        expect(before.nodes).toHaveLength(6);
        expect(before.links).toHaveLength(18);
        const doomed = ids[victim]!;
        expect((await memory.transition(lifecycleCommand("tombstone", doomed))).ok).toBe(true);
        const head = await highWater(memory);
        const survivors = ids.filter((id) => id !== doomed);
        const expectedNodes = survivors.flatMap((id) => materials.get(id)!.nodes).sort();
        const expectedEdges = survivors.flatMap((id) => materials.get(id)!.edges)
          .filter(([source, target]) => expectedNodes.includes(source) && expectedNodes.includes(target));
        for (let replay = 0; replay < 3; replay++) {
          expect((await invalidateAll(memory, head)).complete).toBe(true);
          // Re-read the FileGraphStore JSON from disk at EVERY completed cascade.
          const file = graph.snapshotFile();
          expect(file.nodes).toEqual(expectedNodes);
          expect(new Set(file.links.map((edge) => JSON.stringify(edge))))
            .toEqual(new Set(expectedEdges.map((edge) => JSON.stringify(edge))));
          expect(readFileSync(join(dir, "graph", "graph-x2b.json"), "utf8")).not.toContain(doomed);
          const reopened = open();
          const current = await reopened.readCurrent();
          expect(current.ok).toBe(true);
          if (!current.ok) throw new Error(current.error.message);
          expect(current.value.nodes).toEqual(file.nodes);
          expect(new Set(current.value.edges.map((edge) => JSON.stringify(edge))))
            .toEqual(new Set(file.links.map((edge) => JSON.stringify(edge))));
          expect(current.value.live).toEqual([...survivors].sort());
          expect(current.value.tombstoned).toEqual([doomed]);
          expect([...current.value.influence.keys()].sort()).toEqual([...survivors].sort());
          expect(await reopened.coverage()).toEqual({ cursor: head, complete: true });
        }
        await store.close();
      }
    }
  });

  it("real vector deletion removes the record before scoring and top-k", async () => {
    const sql = createX2bMemorySqlRunner();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
    const resolveTerminal = canonicalTerminalResolver(store);
    const vector = await openRealVector({ sqlRunner: sql }, resolveTerminal);
    const memory = openX2bMemory(store, [vector]);
    const keep = await admitAndIngest(memory, [vector], "x2b-local-keep-0001", "1");
    const doomed = await admitAndIngest(memory, [vector], "x2b-local-doomed-0001", "2");
    await memory.transition(lifecycleCommand("tombstone", doomed));
    const readiness = await memory.readiness();
    if (!readiness.ok) throw new Error("readiness failed");
    const receipt = await invalidateAll(memory, readiness.value.high_water_cursor);
    expect(receipt.complete).toBe(true);
    // The row is physically deleted, not merely filtered at query time.
    expect(await vector.storedIds()).toEqual([keep]);
    expect(await vector.tombstoned()).toContain(doomed);
    const matches = await vector.querySimilar(x2bVector(doomed, DIMENSION), 10);
    expect(matches.map((match) => match.record_id)).not.toContain(doomed);
    expect(matches.map((match) => match.record_id)).toContain(keep);
  });

  it("terminal tombstones never reappear at any replay or recovery cut", async () => {
    const sql = createX2bMemorySqlRunner();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
    const resolveTerminal = canonicalTerminalResolver(store);
    const vector = await openRealVector({ sqlRunner: sql }, resolveTerminal);
    const dir = workdir();
    const graph = await openRealGraph(dir, resolveTerminal);
    const memory = openX2bMemory(store, [graph, vector]);
    const r1 = await admitAndIngest(memory, [graph, vector], "x2b-replay-a-0001", "1");
    const r2 = await admitAndIngest(memory, [graph, vector], "x2b-replay-b-0001", "2");
    await memory.transition(lifecycleCommand("tombstone", r1, "event:tombstone-a"));
    await memory.transition(lifecycleCommand("tombstone", r2, "event:tombstone-b"));
    const readiness = await memory.readiness();
    if (!readiness.ok) throw new Error("readiness failed");
    await invalidateAll(memory, readiness.value.high_water_cursor);
    // Every replay cut converges without resurrection, including reopened surfaces.
    await invalidateAll(memory, readiness.value.high_water_cursor);
    // A stale serving-path ingestion after the tombstone resurrects nothing.
    await graph.ingest(r1);
    await vector.ingest(r1);
    const reopenedGraph = await openRealGraph(dir, resolveTerminal);
    const reopenedVector = await openRealVector({ sqlRunner: sql }, resolveTerminal);
    expect(await reopenedGraph.has(r1)).toBe(false);
    expect(await reopenedGraph.has(r2)).toBe(false);
    const matches = await reopenedVector.querySimilar(x2bVector(r1, DIMENSION), 10);
    expect(matches.map((match) => match.record_id)).not.toContain(r1);
    expect(matches.map((match) => match.record_id)).not.toContain(r2);
    expect(await reopenedVector.storedIds()).toEqual([]);
    expect((await reopenedGraph.nodes()).join(",")).not.toContain(r1);
    // The real graph snapshot on disk carries neither tombstoned record.
    const file = reopenedGraph.snapshotFile();
    for (const node of [...x2bOwnedNodes(r1), ...x2bOwnedNodes(r2)]) expect(file.nodes).not.toContain(node);
    for (const edge of [...x2bOwnedEdges(r1), ...x2bOwnedEdges(r2)]) expect(file.links).not.toContainEqual(edge);
  });

  it("interrupted ADD REMOVE ADD replay preserves the accepted survivor, and refusals never advance", async () => {
    const sql = createX2bMemorySqlRunner();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
    const resolveTerminal = canonicalTerminalResolver(store);
    const vector = await openRealVector({ sqlRunner: sql }, resolveTerminal);
    const graph = await openRealGraph(workdir(), resolveTerminal);
    const memory = openX2bMemory(store, [graph, vector]);
    const survivor = await admitAndIngest(memory, [graph, vector], "x2b-local-survivor-01", "1");
    const doomed = await admitAndIngest(memory, [graph, vector], "x2b-local-doomed-02", "2");
    await memory.transition(lifecycleCommand("dispute", doomed));
    await memory.transition(lifecycleCommand("resolve_dispute", doomed));
    await memory.transition(lifecycleCommand("tombstone", doomed));
    // Lost response on the first call: the engine refuses, the retry converges every surface.
    vector.dropNextResponse = true;
    const readiness = await memory.readiness();
    if (!readiness.ok) throw new Error("readiness failed");
    const lost = await memory.invalidateProjections({
      through_cursor: readiness.value.high_water_cursor,
      authorization: { credential: "credential:x2b" },
      deadline_at: DEADLINE_X2B,
    });
    expect(lost.ok).toBe(false);
    const receipt = await invalidateAll(memory, readiness.value.high_water_cursor);
    expect(receipt.complete).toBe(true);
    expect(receipt.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(["graph", "vector"]);
    expect(await graph.has(survivor)).toBe(true);
    expect(await graph.has(doomed)).toBe(false);
    // A stale serving-path ingestion of the tombstoned record resurrects nothing, anywhere.
    await graph.ingest(doomed);
    await vector.ingest(doomed);
    expect(await graph.has(doomed)).toBe(false);
    expect(await vector.storedIds()).toEqual([survivor]);
    // Refusals: unknown id, past deadline, cursor above high water — none touches the surfaces.
    const unknown = await memory.invalidateProjections({
      through_cursor: "1",
      projection_ids: ["projection:nope"],
      authorization: { credential: "credential:x2b" },
      deadline_at: DEADLINE_X2B,
    });
    expect(unknown.ok).toBe(false);
    const late = await memory.invalidateProjections({
      through_cursor: "1",
      authorization: { credential: "credential:x2b" },
      deadline_at: "2026-08-16T12:30:00.000Z",
    });
    expect(late.ok).toBe(false);
    const recalled = await memory.recall(recallRequest("x2b"));
    if (!recalled.ok) throw new Error("recall failed");
    const ids = recalled.value.records.map((entry) => entry.record.record_id);
    expect(ids).toContain(survivor);
    expect(ids).not.toContain(doomed);
  });

  it("MAJEUR-1: a surface faulted on a late round catches up on retry with complete=true", async () => {
    for (const faulted of ["vector", "graph"] as const) {
      const sql = createX2bMemorySqlRunner();
      const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
      const resolveTerminal = canonicalTerminalResolver(store);
      const vector = await openRealVector({ sqlRunner: sql }, resolveTerminal);
      const dir = workdir();
      const graph = await openRealGraph(dir, resolveTerminal);
      const memory = openX2bMemory(store, [graph, vector]);
      const keep = await admitAndIngest(memory, [graph, vector], `x2b-catchup-${faulted}-keep`, "1");
      const doomed = await admitAndIngest(memory, [graph, vector], `x2b-catchup-${faulted}-doomed`, "2");
      await memory.transition(lifecycleCommand("tombstone", doomed));
      const readiness = await memory.readiness();
      if (!readiness.ok) throw new Error("readiness failed");
      const highWater = readiness.value.high_water_cursor;
      // Fault before applying the actual tombstone removal, after earlier rounds committed.
      const failed = faulted === "vector" ? vector : graph;
      failed.failRemovalOnce = doomed;
      const lost = await memory.invalidateProjections({
        through_cursor: highWater,
        authorization: { credential: "credential:x2b" },
        deadline_at: DEADLINE_X2B,
      });
      expect(lost.ok).toBe(false);
      expect(failed.failRemovalOnce).toBeUndefined();
      const receipt = await invalidateAll(memory, highWater);
      expect(receipt.complete).toBe(true);
      expect(receipt.through_cursor).toBe(highWater);
      expect((await invalidateAll(memory, highWater)).complete).toBe(true);
      expect(receipt.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(["graph", "vector"]);
      // The forgotten record stays forgotten on every surface, physically included.
      expect(await graph.has(keep)).toBe(true);
      expect(await graph.has(doomed)).toBe(false);
      expect(await vector.storedIds()).toEqual([keep]);
      const matches = await vector.querySimilar(x2bVector(doomed, DIMENSION), 10);
      expect(matches.map((match) => match.record_id)).not.toContain(doomed);
      const file = graph.snapshotFile();
      for (const node of x2bOwnedNodes(doomed)) expect(file.nodes).not.toContain(node);
      for (const node of x2bOwnedNodes(keep)) expect(file.nodes).toContain(node);
    }
  });
});

async function livingReplayProof(connection?: string): Promise<void> {
  const opened = connection === undefined ? undefined : await openPostgresCanonicalMemoryStoreV1({
    connection, clock: { now: () => NOW_X2B }, store_id: "x2b-living",
  });
  if (opened !== undefined && !opened.ok) throw new Error(opened.error.message);
  const store = opened?.ok ? opened.value : createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2B } });
  const resolver = canonicalTerminalResolver(store);
  const sqlRunner = connection === undefined ? createX2bMemorySqlRunner() : undefined;
  const vector = await openRealVector(connection === undefined ? { sqlRunner } : { connection }, resolver);
  const raw = await createPostgresExactVectorStore({ connectionString: connection, namespace: "x2b", dimension: DIMENSION },
    { driverModule: sqlRunner ?? await import("pg") });
  const graph = await openRealGraph(workdir(), resolver);
  try {
    const memory = openX2bMemory(store, [graph, vector]);
    await raw.upsertVectors([{ id: "raw-sibling", vector: x2bVector("raw-sibling", DIMENSION) }]);
    expect((await raw.query({ vector: x2bVector("raw-sibling", DIMENSION), topK: 1 })).map((r) => r.id)).toEqual(["raw-sibling"]);
    const living = await admitAndIngest(memory, [graph, vector], "x2b-living-record-0001", "1");
    expect((await memory.transition(lifecycleCommand("dispute", living))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("resolve_dispute", living))).ok).toBe(true);
    const doomed = await admitAndIngest(memory, [graph, vector], "x2b-other-tombstone", "2");
    expect((await memory.transition(lifecycleCommand("tombstone", doomed))).ok).toBe(true);
    const ready = await memory.readiness();
    if (!ready.ok) throw new Error(ready.error.message);
    for (let replay = 0; replay < 3; replay++) {
      expect((await invalidateAll(memory, ready.value.high_water_cursor)).complete).toBe(true);
      expect(await vector.storedIds()).toEqual([living]);
      expect((await vector.querySimilar(x2bVector(living, DIMENSION), 1)).map((r) => r.record_id)).toEqual([living]);
      expect(graph.snapshotFile().nodes).toEqual(expect.arrayContaining(x2bOwnedNodes(living)));
      expect(await graph.has(doomed)).toBe(false);
      expect((await raw.query({ vector: x2bVector("raw-sibling", DIMENSION) })).map((r) => r.id)).toEqual(["raw-sibling"]);
    }
    await raw.clear();
    expect(await vector.storedIds()).toEqual([living]);
  } finally {
    await raw.close(); await vector.close(); await graph.close(); await store.close();
  }
}

describe("x2b living replay regression", () => {
  it("public replay preserves a living resolved record in physical storage", () => livingReplayProof());
});

async function interruptedReplayProof(connection?: string): Promise<void> {
  const driverModule = connection === undefined ? undefined : await import("pg");
  for (const order of X2B_ORDERS) {
    const sqlRunner = connection === undefined ? createX2bMemorySqlRunner() : undefined;
    const namespace = `interrupted:${order}`;
    const dir = workdir();
    const hooks = { beforePublish: (prior: number) => { if (prior === 1) throw new Error("interrupted replay"); } };
    const openVector = (crash: boolean) => createPostgresExactProjectionAdapter({
      namespace, connectionString: connection, sqlRunner, driverModule, dimension: DIMENSION, applyOrder: order,
      clock: () => NOW_X2B, resolveTerminal: () => new Set(),
      embed: (record) => x2bVector(record.record_id, DIMENSION), hooks: crash ? hooks : undefined,
    });
    const openGraph = (crash: boolean) => createFileGraphProjectionAdapter({
      dir, namespace, materialize: x2bMaterialize, clock: () => NOW_X2B,
      resolveTerminal: () => new Set(), applyOrder: order, hooks: crash ? hooks : undefined,
    });
    const add: X2bProjectionBatch = { from_cursor_exclusive: "0", through_cursor_inclusive: "1",
      records: [{ record_id: "probe", record_digest: "probe" }], removals: [] };
    const remove: X2bProjectionBatch = { from_cursor_exclusive: "1", through_cursor_inclusive: "2",
      records: [], removals: [{ record_id: "probe", reason_ref: "dispute" }] };
    const readd: X2bProjectionBatch = { ...add, from_cursor_exclusive: "2", through_cursor_inclusive: "3" };
    const vector = await openVector(true);
    const graph = openGraph(true);
    try {
      for (const surface of [graph, vector]) {
        expect((await surface.ingest("survivor")).ok).toBe(true);
        expect((await surface.invalidate(add)).ok).toBe(true);
        const before = await surface.readCurrent();
        expect((await surface.invalidate(remove)).ok).toBe(false);
        expect(await surface.coverage()).toEqual({ cursor: "1", complete: true });
        expect(await surface.readCurrent()).toEqual(before);
      }
      expect(await vector.storedVectorIdsForTests()).toEqual(["probe", "survivor"]);
    } finally { await vector.close(); await graph.close(); }
    const reopenedVector = await openVector(false);
    const reopenedGraph = openGraph(false);
    try {
      for (const surface of [reopenedGraph, reopenedVector]) {
        expect((await surface.invalidate(remove)).ok).toBe(true);
        expect((await surface.invalidate(readd)).ok).toBe(true);
        const current = await surface.readCurrent();
        expect(current.ok && current.value.live).toEqual(["probe", "survivor"]);
        expect(await surface.coverage()).toEqual({ cursor: "3", complete: true });
      }
      expect(await reopenedVector.storedVectorIdsForTests()).toEqual(["probe", "survivor"]);
      const file = JSON.parse(readFileSync(join(dir, `graph-${encodeURIComponent(namespace)}.json`), "utf8"));
      expect(file.nodes.map((entry: { id: string }) => entry.id))
        .toEqual(expect.arrayContaining([...x2bOwnedNodes("probe"), ...x2bOwnedNodes("survivor")]));
    } finally { await reopenedVector.close(); await reopenedGraph.close(); }
  }
}

/** Inject races only after the preflight, at the actual locked manifest read. The
 * real-PG variant uses the delivered pg runner and actual SQL updates inside its
 * transaction; each refused transaction must roll these updates back. */
async function publicationGuardsProof(connection?: string): Promise<void> {
  type Race = "fence" | "deadline" | "conflict" | "stale";
  let race: Race | undefined;
  let now = NOW_X2B;
  let injected = 0;
  type Query = X2bSqlRunner["query"];
  const intercept = (query: Query): Query => async (sql, args) => {
    if (sql === X2B_SELECT_MANIFEST_FOR_UPDATE && race !== undefined) {
      const selected = race;
      race = undefined;
      injected += 1;
      const result = await query(sql, args);
      const state = JSON.parse(result.rows[0]!.manifest as string) as X2bPersistedState;
      if (selected === "fence") state.fenceHeld = false;
      if (selected === "conflict") state.manifestSeq += 1;
      if (selected === "stale") state.headCursor = "3";
      if (selected === "deadline") now = DEADLINE_X2B;
      await query(X2B_UPSERT_MANIFEST, [args![0], JSON.stringify(state)]);
    }
    return query(sql, args);
  };
  let sqlRunner: X2bSqlRunner | undefined;
  let driverModule: unknown;
  if (connection === undefined) {
    const base = createX2bMemorySqlRunner();
    sqlRunner = { ...base, withTransaction: (work) => base.withTransaction((tx) => work({ ...tx, query: intercept(tx.query) })) };
  } else {
    const pg = await import("pg");
    driverModule = { Pool: class {
      private readonly pool;
      constructor(config: { connectionString: string }) { this.pool = new pg.default.Pool(config); }
      query(sql: string, args?: unknown[]) { return this.pool.query(sql, args); }
      on(event: string, listener: () => void) { this.pool.on(event, listener); }
      end() { return this.pool.end(); }
      async connect() {
        const client = await this.pool.connect();
        return { query: intercept((sql, args) => client.query(sql, args)), release: () => client.release() };
      }
    } };
  }
  const vector = await createPostgresExactProjectionAdapter({
    namespace: "publication-guards", dimension: DIMENSION, connectionString: connection, sqlRunner, driverModule,
    clock: () => now, resolveTerminal: () => new Set(), embed: (record) => x2bVector(record.record_id, DIMENSION),
  });
  const seed: X2bProjectionBatch = { from_cursor_exclusive: "0", through_cursor_inclusive: "1",
    records: [{ record_id: "survivor", record_digest: "survivor" }], removals: [] };
  const input = { generation: "seed", headCursor: "1", batches: [seed], deadlineAt: DEADLINE_X2B, operationId: "seed" };
  try {
    const prepared = await vector.prepareGeneration(input);
    if (!prepared.ok) throw new Error(prepared.error.message);
    expect((await vector.publishPublication(prepared.value.token)).ok).toBe(true);
    expect((await vector.acknowledgePublication(prepared.value.token)).ok).toBe(true);
    expect(await vector.prepareGeneration({ ...input, headCursor: "0", operationId: "stale" }))
      .toMatchObject({ ok: false, error: { code: "PROJECTION_STALE" } });
    expect(await vector.prepareGeneration({ ...input, batches: [] }))
      .toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    const next = await vector.prepareGeneration({ ...input, generation: "next", headCursor: "2", operationId: "next",
      batches: [{ from_cursor_exclusive: "1", through_cursor_inclusive: "2", records: [], removals: [] }] });
    if (!next.ok) throw new Error(next.error.message);
    expect(await vector.acknowledgePublication(next.value.token)).toMatchObject({ ok: false, error: { code: "NOT_PUBLISHED" } });
    expect(await vector.acknowledgePublication("unknown")).toMatchObject({ ok: false, error: { code: "UNKNOWN_PUBLICATION" } });
    const cases = [["fence", "FENCE_LOST"], ["deadline", "DEADLINE_EXCEEDED"],
      ["conflict", "MANIFEST_CONFLICT"], ["stale", "PROJECTION_STALE"]] as const;
    for (const phase of ["publish", "acknowledge"] as const) {
      const before = await vector.readCurrent();
      for (const [fault, code] of cases) {
        race = fault;
        const result = phase === "publish" ? await vector.publishPublication(next.value.token)
          : await vector.acknowledgePublication(next.value.token);
        now = NOW_X2B;
        expect(result, `${phase}/${fault}`).toMatchObject({ ok: false, error: { code } });
        expect(race).toBeUndefined();
        expect((await vector.coverage()).cursor).toBe("1");
        expect(await vector.readCurrent()).toEqual(before);
        expect(await vector.storedVectorIdsForTests()).toEqual(["survivor"]);
      }
      if (phase === "publish") expect((await vector.publishPublication(next.value.token)).ok).toBe(true);
    }
    expect(injected).toBe(8);
    expect((await vector.acknowledgePublication(next.value.token)).ok).toBe(true);
    expect(await vector.coverage()).toEqual({ cursor: "2", complete: true });
  } finally { await vector.close(); }
}

describe("x2b replay and transaction guard proofs", () => {
  it("interrupted ADD REMOVE ADD replay preserves the published generation and accepted survivor", () => interruptedReplayProof());
  it("a stale head, lost fence, expired deadline or conflicting generation cannot publish or advance acknowledgement", () => publicationGuardsProof());
});

describe("x2b postgres cascade lane", () => {
  const decision = postgresLaneDecision([...MATRIX]);
  if (decision.lane === "fail") {
    const cause = decision.cause;
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(cause);
    });
    return;
  }
  const maybe = decision.lane === "run" ? it : it.skip;

  maybe("interrupted ADD REMOVE ADD replay preserves the published generation and accepted survivor on real Postgres", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      await interruptedReplayProof(postgres.connection);
    }
  });

  maybe("a stale head, lost fence, expired deadline or conflicting generation cannot publish or advance acknowledgement on real Postgres", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      await publicationGuardsProof(postgres.connection);
    }
  });

  maybe("public replay preserves living vectors on real Postgres 16 and 17", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      await livingReplayProof(postgres.connection);
    }
  });

  maybe("real vector deletion survives reopen and removes the record before scoring and top-k", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      const opened = await openPostgresCanonicalMemoryStoreV1({
        connection: postgres.connection,
        clock: { now: () => NOW_X2B },
        store_id: "x2b",
      });
      if (!opened.ok) throw new Error(`open pg${version} failed: ${opened.error.message}`);
      const resolveTerminal = canonicalTerminalResolver(opened.value);
      const vector = await openRealVector({ connection: postgres.connection }, resolveTerminal);
      const dir = workdir();
      const graph = await openRealGraph(dir, resolveTerminal);
      const memory = openX2bMemory(opened.value, [graph, vector]);
      const keep = await admitAndIngest(memory, [graph, vector], `x2b-pg${version}-keep-0001`, "1");
      const doomed = await admitAndIngest(memory, [graph, vector], `x2b-pg${version}-doomed-0001`, "2");
      const tombstoned = await memory.transition(lifecycleCommand("tombstone", doomed));
      if (!tombstoned.ok) throw new Error("tombstone failed");
      const receipt = await invalidateAll(memory, tombstoned.value.cursor);
      expect(receipt.complete).toBe(true);
      expect(receipt.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(["graph", "vector"]);
      // Reopen both surfaces on the same backends: the deletion survived.
      const reopenedVector = await openRealVector({ connection: postgres.connection }, resolveTerminal);
      const reopenedGraph = await openRealGraph(dir, resolveTerminal);
      const matches = await reopenedVector.querySimilar(x2bVector(doomed, DIMENSION), 10);
      expect(matches.map((match) => match.record_id)).not.toContain(doomed);
      expect(matches.map((match) => match.record_id)).toContain(keep);
      expect(await reopenedVector.storedIds()).toEqual([keep]);
      expect(await reopenedGraph.has(doomed)).toBe(false);
      expect(await reopenedGraph.has(keep)).toBe(true);
      // Close every owned pool before the container stops: an idle client lost at
      // teardown must not surface as an unhandled connection error.
      await vector.close();
      await reopenedVector.close();
      await graph.close();
      await reopenedGraph.close();
      const closed = await opened.value.close();
      expect(closed.ok).toBe(true);
    }
  });

  maybe("terminal tombstones never reappear on the real adapters at any replay or recovery cut", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      const opened = await openPostgresCanonicalMemoryStoreV1({
        connection: postgres.connection,
        clock: { now: () => NOW_X2B },
        store_id: "x2b",
      });
      if (!opened.ok) throw new Error(`open pg${version} failed: ${opened.error.message}`);
      const resolveTerminal = canonicalTerminalResolver(opened.value);
      const vector = await openRealVector({ connection: postgres.connection }, resolveTerminal);
      const memory = openX2bMemory(opened.value, [vector]);
      const r1 = await admitAndIngest(memory, [vector], `x2b-pg${version}-t1-0001`, "1");
      const r2 = await admitAndIngest(memory, [vector], `x2b-pg${version}-t2-0001`, "2");
      await memory.transition(lifecycleCommand("tombstone", r1, `event:tombstone-pg${version}-a`));
      await memory.transition(lifecycleCommand("tombstone", r2, `event:tombstone-pg${version}-b`));
      const readiness = await memory.readiness();
      if (!readiness.ok) throw new Error("readiness failed");
      await invalidateAll(memory, readiness.value.high_water_cursor);
      // Every replay cut, then reopen: no resurrection through the public engine.
      await invalidateAll(memory, readiness.value.high_water_cursor);
      // A stale serving-path ingestion after the tombstone resurrects nothing.
      await vector.ingest(r1);
      const reopened = await openRealVector({ connection: postgres.connection }, resolveTerminal);
      for (const id of [r1, r2]) {
        const matches = await reopened.querySimilar(x2bVector(id, DIMENSION), 10);
        expect(matches.map((match) => match.record_id)).not.toContain(id);
      }
      expect(await reopened.storedIds()).toEqual([]);
      expect(await reopened.tombstoned()).toEqual(expect.arrayContaining([r1, r2]));
      await vector.close();
      await reopened.close();
      await opened.value.close();
    }
  });

  maybe("an interrupted vector commit rolls back on Postgres and replay converges", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      const opened = await openPostgresCanonicalMemoryStoreV1({
        connection: postgres.connection,
        clock: { now: () => NOW_X2B },
        store_id: "x2b",
      });
      if (!opened.ok) throw new Error(`open pg${version} failed: ${opened.error.message}`);
      const resolveTerminal = canonicalTerminalResolver(opened.value);
      // Armed only after the serving-path ingestions: the ingest path shares the
      // beforeManifestCommit hook, so arming on count 0 would refuse the first ingest.
      let armed = false;
      const vector = await openRealVector(
        {
          connection: postgres.connection,
          hooks: { beforeManifestCommit: () => { if (armed) { armed = false; throw new Error("inject:crash-before-commit"); } } },
        },
        resolveTerminal,
      );
      const dir = workdir();
      const graph = await openRealGraph(dir, resolveTerminal);
      const memory = openX2bMemory(opened.value, [graph, vector]);
      const survivor = await admitAndIngest(memory, [graph, vector], `x2b-pg${version}-survivor-01`, "1");
      const probe = await admitAndIngest(memory, [graph, vector], `x2b-pg${version}-doomed-01`, "2");
      await memory.transition(lifecycleCommand("tombstone", probe));
      let removalRoundSeen = false;
      vector.beforeInvalidate = (batch) => {
        if (!removalRoundSeen && batch.removals.some((r) => r.record_id === probe)) {
          removalRoundSeen = true;
          armed = true;
        }
      };
      // The vector commit fails inside its transaction: the engine refuses, nothing is certified.
      const readiness = await memory.readiness();
      if (!readiness.ok) throw new Error("readiness failed");
      const crashed = await memory.invalidateProjections({
        through_cursor: readiness.value.high_water_cursor,
        authorization: { credential: "credential:x2b" },
        deadline_at: DEADLINE_X2B,
      });
      expect(crashed.ok).toBe(false);
      expect(removalRoundSeen).toBe(true);
      expect(armed).toBe(false);
      // Reopen the vector surface on the same database: the rollback left no orphan row.
      const reopenedVector = await openRealVector({ connection: postgres.connection }, resolveTerminal);
      expect(await reopenedVector.storedIds()).toEqual(expect.arrayContaining([survivor, probe]));
      // Replay converges every surface: the tombstone is terminal and physically deleted.
      const recovered = openX2bMemory(opened.value, [graph, reopenedVector]);
      const receipt = await invalidateAll(recovered, readiness.value.high_water_cursor);
      expect(receipt.complete).toBe(true);
      expect(await reopenedVector.storedIds()).toEqual([survivor]);
      const matches = await reopenedVector.querySimilar(x2bVector(probe, DIMENSION), 10);
      expect(matches.map((match) => match.record_id)).not.toContain(probe);
      expect(await graph.has(probe)).toBe(false);
      await vector.close();
      await reopenedVector.close();
      await graph.close();
      await opened.value.close();
    }
  });

  maybe("public invalidateProjections on Postgres 16 and 17 acknowledges every selected surface and recovers after crash or lost response", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      const opened = await openPostgresCanonicalMemoryStoreV1({
        connection: postgres.connection,
        clock: { now: () => NOW_X2B },
        store_id: "x2b",
      });
      if (!opened.ok) throw new Error(`open pg${version} failed: ${opened.error.message}`);
      const resolveTerminal = canonicalTerminalResolver(opened.value);
      const vector = await openRealVector({ connection: postgres.connection }, resolveTerminal);
      const dir = workdir();
      const graph = await openRealGraph(dir, resolveTerminal);
      const memory = openX2bMemory(opened.value, [graph, vector]);
      const survivor = await admitAndIngest(memory, [graph, vector], `x2b-pg${version}-survivor-01`, "1");
      // L3 capture under the lane scope (the L7 seed binds another scope and is refused).
      const probe = await captureAdmit(memory, `x2b-pg${version}-probe-01`, "2");
      await graph.ingest(probe);
      await vector.ingest(probe);
      await memory.transition(lifecycleCommand("tombstone", probe));
      // Lost response then retry: every selected surface is acknowledged, none left behind.
      vector.dropNextResponse = true;
      const readiness = await memory.readiness();
      if (!readiness.ok) throw new Error("readiness failed");
      const lost = await memory.invalidateProjections({
        through_cursor: readiness.value.high_water_cursor,
        authorization: { credential: "credential:x2b" },
        deadline_at: DEADLINE_X2B,
      });
      expect(lost.ok).toBe(false);
      const receipt = await invalidateAll(memory, readiness.value.high_water_cursor);
      expect(receipt.complete).toBe(true);
      expect(receipt.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(["graph", "vector"]);
      expect(receipt.receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      // A stale serving-path ingestion of the tombstoned probe resurrects nothing.
      await graph.ingest(probe);
      await vector.ingest(probe);
      // Crash: close the canonical store before any further call, reopen, replay converges.
      await opened.value.close();
      const reopenedStore = await openPostgresCanonicalMemoryStoreV1({
        connection: postgres.connection,
        clock: { now: () => NOW_X2B },
        store_id: "x2b",
      });
      if (!reopenedStore.ok) throw new Error("reopen failed");
      // The canonical resolver follows the live store: the pre-crash instance is closed.
      const reopenedResolveTerminal = canonicalTerminalResolver(reopenedStore.value);
      const reopenedVector = await openRealVector({ connection: postgres.connection }, reopenedResolveTerminal);
      const reopenedGraph = await openRealGraph(dir, reopenedResolveTerminal);
      const recovered = openX2bMemory(reopenedStore.value, [reopenedGraph, reopenedVector]);
      const replayed = await invalidateAll(recovered, await highWater(recovered));
      expect(replayed.complete).toBe(true);
      expect(await reopenedGraph.has(survivor)).toBe(true);
      expect(await reopenedGraph.has(probe)).toBe(false);
      expect(await reopenedVector.storedIds()).toContain(survivor);
      expect(await reopenedVector.storedIds()).not.toContain(probe);
      // Accepted lexical/FTS removal: recall serves the survivor, never the tombstoned probe.
      const recalled = await recovered.recall(recallRequest("x2b"));
      if (!recalled.ok) throw new Error("recall failed");
      const ids = recalled.value.records.map((entry) => entry.record.record_id);
      expect(ids).toContain(survivor);
      expect(ids).not.toContain(probe);
      await vector.close();
      await graph.close();
      await reopenedVector.close();
      await reopenedGraph.close();
      await reopenedStore.value.close();
    }
  });
});

async function highWater(memory: MemoryPortV2): Promise<string> {
  const readiness = await memory.readiness();
  if (!readiness.ok) throw new Error("readiness failed");
  return readiness.value.high_water_cursor;
}
