/**
 * X2b real projection adapters — host-owned bridges outside the neutral package.
 * INVARIANTS (breaking case class each): 1 idempotent removal by record_id drops
 * owned nodes, incident/dependent edges, vectors and derived contributions (breaks if a
 * removal path skips any owned kind); 2 unrelated ids and namespaces survive (breaks on a
 * namespace-blind clear or a shared key); 3 terminal tombstones never reappear at any replay
 * or recovery cut (breaks if an add bypasses the tombstone set or last-touch order); 4 state
 * persists across reopen (breaks if the manifest/snapshot write is not atomic or not re-read);
 * 5 existing graphify uses of FileGraphStore/pgvector stay unchanged (breaks on any edit to them).
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Graph from "graphology";
import { createFileGraphStore } from "./file.js";

export const X2B_PROJECTION_VERSION = "x2b/v1";
const X2B_TERMINAL_REASON = "memory:tombstoned";

/** Per-manifest-path compare-and-swap chains (see withManifestLock inside the adapter). */
const manifestLocks = new Map<string, Promise<void>>();

export interface X2bRecordRef {
  record_id: string;
  record_digest: string;
}

export interface X2bRemovalRef {
  record_id: string;
  reason_ref: string;
}

export interface X2bProjectionBatch {
  from_cursor_exclusive: string;
  through_cursor_inclusive: string;
  records: X2bRecordRef[];
  removals: X2bRemovalRef[];
}

export type X2bResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; operation: string; message: string; retryable: boolean } };

export interface X2bMaterial {
  /** Explicit node ownership (shared nodes must be declared by every owning record). */
  nodes: string[];
  /** Owned edges survive only while both endpoints have a live owner. */
  edges: Array<[string, string]>;
  contribution: number;
  vector: number[];
}

export interface X2bAdapterHooks {
  /** Called before each publication with the count of previously completed publications; may throw to simulate a crash. */
  beforePublish?: (priorPublications: number) => void;
  /** Called after the new snapshot is mirrored, before the manifest commit; may throw to simulate a crash. */
  beforeManifestCommit?: (priorPublications: number) => void;
}

/**
 * X2 rule applied at the surface: terminality comes ONLY from canonical state — the persisted
 * tombstone set plus the injected canonical answer over the journal total order (last `to_state
 * === "tombstoned"` per record, absorbing), evaluated when the batch APPLIES — never from the
 * batch's opaque `reason_ref`, not even the retroactive fold reason. Without an injected
 * resolver construction refuses: a reason label cannot substitute for canonical state.
 */
export type X2bTerminalResolver = (recordIds: readonly string[]) => Promise<ReadonlySet<string>> | ReadonlySet<string>;

export interface X2bAdapterOptions {
  namespace?: string;
  materialize: (record: X2bRecordRef) => X2bMaterial;
  clock?: () => string;
  applyOrder?: "adds-first" | "removals-first";
  hooks?: X2bAdapterHooks;
  resolveTerminal: X2bTerminalResolver;
}

export interface X2bCoverage {
  cursor: string;
  complete: boolean;
}

export function x2bAggregateCoverage(entries: X2bCoverage[]): X2bCoverage {
  if (entries.length === 0) return { cursor: "0", complete: false };
  let cursor = entries[0]!.cursor;
  let complete = true;
  for (const entry of entries) {
    if (compareCursor(entry.cursor, cursor) < 0) cursor = entry.cursor;
    if (!entry.complete) complete = false;
  }
  return { cursor, complete };
}

export function compareCursor(left: string, right: string): number {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

export function x2bDigestOf(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, field]) => field !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${stableJson(field)}`).join(",")}}`;
}

function refusal(code: string, message: string, retryable: boolean): { ok: false; error: { code: string; operation: string; message: string; retryable: boolean } } {
  return { ok: false, error: { code, operation: "projection_invalidate", message, retryable } };
}

/** Internal publication diagnostics never escape as undeclared engine refusal codes. */
export function x2bSurfaceRefusal(result: Extract<X2bResult<never>, { ok: false }>) {
  const allowed = new Set(["FENCE_LOST", "DEADLINE_EXCEEDED", "DIGEST_CONFLICT", "CURSOR_GAP", "PROJECTION_STALE", "STORE_UNAVAILABLE"]);
  return allowed.has(result.error.code) ? result : refusal("PROJECTION_STALE", result.error.message, true);
}

export interface X2bPendingEntry {
  token: string;
  incarnation: string;
  generation: string;
  headCursor: string;
  batches: X2bProjectionBatch[];
  deadlineAt: string;
  operationId: string;
  contentDigest: string;
  manifestSeq: number;
  stage: "prepared" | "published" | "acknowledged";
}

export interface X2bPersistedState {
  version: string;
  namespace: string;
  incarnation: string;
  generation: string;
  headCursor: string;
  ackCursor: string;
  manifestSeq: number;
  /** Write-ahead intent, repaired only by an explicit writer under the manifest lock. */
  mirrorIntent: number | null;
  tombstoned: string[];
  live: string[];
  lastTouch: Record<string, string>;
  influence: Record<string, number>;
  operations: Record<string, { digest: string; incarnation: string }>;
  fenceEpoch: number;
  fenceHeld: boolean;
  pending: Record<string, X2bPendingEntry>;
  publications: number;
}

export function freshX2bState(namespace: string): X2bPersistedState {
  return {
    version: X2B_PROJECTION_VERSION,
    namespace,
    incarnation: randomUUID(),
    generation: "",
    headCursor: "0",
    ackCursor: "0",
    manifestSeq: 0,
    mirrorIntent: null,
    tombstoned: [],
    live: [],
    lastTouch: Object.create(null),
    influence: Object.create(null),
    operations: Object.create(null),
    fenceEpoch: 1,
    fenceHeld: true,
    pending: {},
    publications: 0,
  };
}

export function x2bContentDigest(batches: X2bProjectionBatch[]): string {
  return x2bDigestOf(
    batches.map((batch) => ({
      from: batch.from_cursor_exclusive,
      through: batch.through_cursor_inclusive,
      records: [...batch.records].sort((a, b) => (a.record_id < b.record_id ? -1 : 1)),
      removals: [...batch.removals].sort((a, b) => (a.record_id < b.record_id ? -1 : 1)),
    })),
  );
}

/**
 * Retroactive tombstone fold: records already terminally tombstoned move to removals, never
 * back. Terminality is the union of the persisted tombstone set and the canonical answer
 * resolved at apply time — the batch's opaque `reason_ref` never decides it, not even the
 * retroactive fold reason the canonical store itself emits (that reason is carried so
 * removals stay informative, never so surfaces can branch on it).
 */
export function foldX2bBatch(
  batch: X2bProjectionBatch,
  tombstoned: ReadonlySet<string>,
  knownTerminal: ReadonlySet<string> = new Set(),
): { records: X2bRecordRef[]; removals: X2bRemovalRef[] } {
  const knownRemovals = new Set(batch.removals.map((removal) => removal.record_id));
  const terminal = (recordId: string): boolean => tombstoned.has(recordId) || knownTerminal.has(recordId);
  const records = batch.records.filter((record) => !terminal(record.record_id));
  const retro = batch.records
    .filter((record) => terminal(record.record_id) && !knownRemovals.has(record.record_id))
    .map((record) => ({ record_id: record.record_id, reason_ref: X2B_TERMINAL_REASON }));
  return {
    records: [...records].sort((a, b) => (a.record_id < b.record_id ? -1 : 1)),
    removals: [...batch.removals, ...retro].sort((a, b) => (a.record_id < b.record_id ? -1 : 1)),
  };
}

function isTerminalRemoval(removal: X2bRemovalRef, knownTerminal: ReadonlySet<string>): boolean {
  // Canonical state only: the persisted tombstone set (checked by callers alongside this) and
  // the injected canonical answer. The batch's opaque reason_ref NEVER decides terminality.
  return knownTerminal.has(removal.record_id);
}

export interface X2bPrepareInput {
  generation: string;
  headCursor: string;
  batches: X2bProjectionBatch[];
  deadlineAt: string;
  operationId: string;
}

export function planX2bPrepare(
  state: X2bPersistedState,
  input: X2bPrepareInput,
  now: string,
): X2bResult<{ token: string; duplicate: boolean }> {
  if (!state.fenceHeld) return refusal("FENCE_LOST", "canonical fence is lost; reacquire before preparing", true);
  if (now >= input.deadlineAt) return refusal("DEADLINE_EXCEEDED", "preparation deadline elapsed", false);
  if (compareCursor(input.headCursor, state.headCursor) < 0) {
    return refusal("PROJECTION_STALE", "stale head cannot prepare past the pinned canonical head", false);
  }
  const contentDigest = x2bContentDigest(input.batches);
  const known = state.operations[input.operationId];
  if (known !== undefined && known.incarnation === state.incarnation && known.digest !== contentDigest) {
    return refusal("DIGEST_CONFLICT", "operation identity is already bound to different content", false);
  }
  // Only acknowledged coverage can bridge the start of a new window. A prepared head
  // cannot certify omitted events. The persisted head has already been applied in full:
  // replaying older windows after an interrupted acknowledgement may retain that head.
  let covered = state.ackCursor;
  let previousThrough: string | undefined;
  for (const batch of input.batches) {
    if (compareCursor(batch.from_cursor_exclusive, covered) > 0 ||
        (previousThrough !== undefined && compareCursor(batch.from_cursor_exclusive, previousThrough) !== 0) ||
        compareCursor(batch.through_cursor_inclusive, batch.from_cursor_exclusive) < 0) {
      return refusal("CURSOR_GAP", "batches must cover a contiguous window from acknowledged coverage", false);
    }
    if (compareCursor(batch.through_cursor_inclusive, covered) > 0) covered = batch.through_cursor_inclusive;
    previousThrough = batch.through_cursor_inclusive;
  }
  if (compareCursor(input.headCursor, covered) > 0 && compareCursor(input.headCursor, state.headCursor) > 0) {
    return refusal("CURSOR_GAP", "batches do not cover the requested head", false);
  }
  // Same operation with identical content prepares a fresh token: re-application is idempotent
  // (last-touch order plus the terminal tombstone set), so retries converge without conflicts.
  const token = `prep:${state.manifestSeq + 1}:${x2bDigestOf(input.operationId).slice(7, 19)}`;
  state.pending[token] = {
    token,
    incarnation: state.incarnation,
    generation: input.generation,
    headCursor: input.headCursor,
    batches: input.batches.map((batch) => ({
      from_cursor_exclusive: batch.from_cursor_exclusive,
      through_cursor_inclusive: batch.through_cursor_inclusive,
      records: batch.records.map((record) => ({ ...record })),
      removals: batch.removals.map((removal) => ({ ...removal })),
    })),
    deadlineAt: input.deadlineAt,
    operationId: input.operationId,
    contentDigest,
    manifestSeq: state.manifestSeq,
    stage: "prepared",
  };
  state.operations[input.operationId] = { digest: contentDigest, incarnation: state.incarnation };
  return { ok: true, value: { token, duplicate: false } };
}

export interface X2bAppliedPlan {
  live: Set<string>;
  lastTouch: Record<string, string>;
  influence: Record<string, number>;
  tombstoned: Set<string>;
  added: X2bRecordRef[];
  removed: string[];
  /** Only canonical terminal ids may be physically purged, including orphan-row repairs. */
  purged: string[];
}

/** Computes the post-batch live set, last-touch cursors and derived influence without persisting. */
export function planX2bApply(
  state: X2bPersistedState,
  batches: X2bProjectionBatch[],
  order: "adds-first" | "removals-first",
  knownTerminal: ReadonlySet<string> = new Set(),
): X2bAppliedPlan {
  const tombstoned = new Set(state.tombstoned);
  const live = new Set(state.live);
  const lastTouch: Record<string, string> = Object.assign(Object.create(null), state.lastTouch);
  const influence: Record<string, number> = Object.assign(Object.create(null), state.influence);
  const added: X2bRecordRef[] = [];
  const removed: string[] = [];
  const purgedIds = new Set<string>();
  for (const batch of batches) {
    const folded = foldX2bBatch(batch, tombstoned, knownTerminal);
    const through = batch.through_cursor_inclusive;
    const applyRecords = () => {
      for (const record of folded.records) {
        if (tombstoned.has(record.record_id) || knownTerminal.has(record.record_id)) continue;
        const touched = lastTouch[record.record_id];
        if (touched !== undefined && compareCursor(through, touched) <= 0) continue;
        if (!live.has(record.record_id)) added.push(record);
        live.add(record.record_id);
        lastTouch[record.record_id] = through;
      }
    };
    const applyRemovals = () => {
      for (const removal of folded.removals) {
        if (isTerminalRemoval(removal, knownTerminal) || tombstoned.has(removal.record_id)) {
          if (live.has(removal.record_id)) removed.push(removal.record_id);
          live.delete(removal.record_id);
          delete influence[removal.record_id];
          tombstoned.add(removal.record_id);
          purgedIds.add(removal.record_id);
          if (compareCursor(through, lastTouch[removal.record_id] ?? "0") > 0) lastTouch[removal.record_id] = through;
          continue;
        }
        const touched = lastTouch[removal.record_id];
        if (touched !== undefined && compareCursor(through, touched) <= 0) continue;
        if (live.has(removal.record_id)) removed.push(removal.record_id);
        live.delete(removal.record_id);
        delete influence[removal.record_id];
        lastTouch[removal.record_id] = through;
      }
    };
    if (order === "adds-first") {
      applyRecords();
      applyRemovals();
    } else {
      applyRemovals();
      applyRecords();
    }
  }
  return {
    live, lastTouch, influence, tombstoned,
    added: added.filter((record) => live.has(record.record_id)),
    removed: removed.filter((id) => !live.has(id)),
    purged: [...purgedIds].filter((id) => tombstoned.has(id) && !live.has(id)).sort(),
  };
}

export function x2bStateDigest(state: X2bPersistedState, namespace: string): string {
  return x2bDigestOf({
    version: X2B_PROJECTION_VERSION,
    namespace,
    incarnation: state.incarnation,
    generation: state.generation,
    head: state.headCursor,
    coverage: state.ackCursor,
    live: [...state.live].sort(),
    tombstoned: [...state.tombstoned].sort(),
    influence: Object.entries(state.influence).sort(([a], [b]) => (a < b ? -1 : 1)),
  });
}

export interface X2bReadModel {
  digest: string;
  cursor: string;
  generation: string;
  live: string[];
  tombstoned: string[];
  nodes: string[];
  edges: Array<[string, string]>;
  influence: Map<string, number>;
}

export interface X2bPublicationProof {
  generation: string;
  headCursor: string;
  manifestDigest: string;
  manifestSeq: number;
}

export interface X2bAcknowledgeReceipt {
  cursor: string;
  digest: string;
  generation: string;
  incarnation: string;
}

/**
 * File-backed real graph projection adapter. Owned graph objects per record come from the
 * injected (host-authorized) materialization; the live set is mirrored to a private snapshot
 * through the existing FileGraphStore.pushGraph; the manifest (generation, cursors, tombstones,
 * incarnation, fence) persists atomically beside it and is re-read on reopen. Stale pendings
 * from an interrupted instance are discarded on open and never auto-published.
 */
export function createFileGraphProjectionAdapter(options: X2bAdapterOptions & { dir: string }) {
  if (typeof options.resolveTerminal !== "function") throw new Error("canonical resolveTerminal is required");
  if (typeof options.materialize !== "function") throw new Error("authorized materialize is required");
  const namespace = options.namespace ?? "x2b";
  const materialize = options.materialize;
  const clock = options.clock ?? (() => new Date().toISOString());
  const order = options.applyOrder ?? "adds-first";
  const hooks = options.hooks ?? {};
  const resolveTerminal = options.resolveTerminal;
  const manifestPath = resolve(options.dir, `manifest-${encodeURIComponent(namespace)}.json`);
  const snapshotPath = resolve(options.dir, `graph-${encodeURIComponent(namespace)}.json`);

  function readRaw(): X2bPersistedState {
    if (!existsSync(manifestPath)) return freshX2bState(namespace);
    const state = JSON.parse(readFileSync(manifestPath, "utf-8")) as X2bPersistedState;
    state.lastTouch = Object.assign(Object.create(null), state.lastTouch);
    state.influence = Object.assign(Object.create(null), state.influence);
    state.operations = Object.assign(Object.create(null), state.operations);
    state.pending = {};
    if (state.mirrorIntent === undefined) state.mirrorIntent = null;
    return state;
  }

  function writeManifest(state: X2bPersistedState): void {
    mkdirSync(dirname(manifestPath), { recursive: true });
    // Unique temp name: concurrent writers never share a temp file; rename stays atomic.
    const tmp = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      // Only committed state persists: preparation tokens stay in instance memory, so an
      // interrupted instance leaves no publishable pending behind for the next opener.
      writeFileSync(tmp, JSON.stringify({ ...state, pending: {} }));
      renameSync(tmp, manifestPath);
    } finally {
      rmSync(tmp, { force: true });
    }
  }

  /**
   * The process queue and filesystem bakery tickets serialize all writers, including
   * separate processes. Tickets publish atomically; dead processes are ignored using their
   * Linux process birth identity, so SIGKILL cannot strand a lock or make a stale writer win.
   */
  async function withManifestLock<T>(work: () => Promise<T>): Promise<T> {
    const prior = manifestLocks.get(manifestPath) ?? Promise.resolve();
    let release: () => void = () => {};
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    manifestLocks.set(manifestPath, prior.then(() => turn, () => turn));
    await prior;
    let unlock: (() => void) | undefined;
    try {
      unlock = await acquireFileLock();
      return await work();
    } finally {
      unlock?.();
      release();
    }
  }

  async function withManifestResult<T>(work: () => Promise<X2bResult<T>>): Promise<X2bResult<T>> {
    try {
      return await withManifestLock(work);
    } catch {
      return refusal("STORE_UNAVAILABLE", "file writer lock or storage unavailable; retry", true);
    }
  }

  async function acquireFileLock(): Promise<() => void> {
    const dir = `${manifestPath}.writers`;
    mkdirSync(dir, { recursive: true });
    const name = `${process.pid}-${randomUUID()}.json`;
    const path = join(dir, name);
    type Ticket = { pid: number; birth: string; choosing: boolean; number: number };
    const birthOf = (pid: number): string | undefined => {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      return fields[0] === "Z" || fields[0] === "X" ? undefined : fields[19];
    };
    const birth = birthOf(process.pid);
    if (birth === undefined) throw new Error("Linux process identity unavailable");
    const ticket: Ticket = { pid: process.pid, birth, choosing: true, number: 0 };
    const write = () => {
      const temp = `${path}.tmp`;
      writeFileSync(temp, JSON.stringify(ticket));
      renameSync(temp, path);
    };
    const others = (): Array<[string, Ticket]> => readdirSync(dir)
      .filter((file) => file.endsWith(".json") && file !== name)
      .flatMap((file): Array<[string, Ticket]> => {
        try {
          const other = JSON.parse(readFileSync(join(dir, file), "utf8")) as Ticket;
          if (birthOf(other.pid) === other.birth) return [[file, other]];
          rmSync(join(dir, file), { force: true });
          return [];
        } catch (error) {
          if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) {
            rmSync(join(dir, file), { force: true });
            return [];
          }
          throw error;
        }
      });
    try {
      write();
      ticket.number = Math.max(0, ...others().map(([, other]) => other.number)) + 1;
      ticket.choosing = false;
      write();
      while (others().some(([file, other]) => other.choosing ||
        other.number < ticket.number || (other.number === ticket.number && file < name))) {
        await new Promise((done) => setTimeout(done, 1));
      }
      return () => rmSync(path, { force: true });
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    }
  }

  async function openState(): Promise<X2bPersistedState> {
    const state = readRaw();
    if (state.mirrorIntent !== null) {
      // Writer-only recovery under withManifestLock. Readers never call this function.
      await mirrorSnapshot(state);
      state.mirrorIntent = null;
      writeManifest(state);
    }
    return state;
  }

  async function resolveIds(recordIds: readonly string[]): Promise<X2bResult<ReadonlySet<string>>> {
    try {
      return { ok: true, value: await resolveTerminal(recordIds) };
    } catch {
      return refusal("STORE_UNAVAILABLE", "canonical terminal resolution failed; retry", true);
    }
  }

  /**
   * Single-writer atomic commit: the manifest snapshot (live set, tombstones, cursors) is
   * written first as a write-ahead intent, then the graph mirror is rebuilt, then the intent
   * clears. A crash between the steps requires writer recovery; reads refuse meanwhile. A competing
   * writer detected at commit heals the mirror to the manifest truth and refuses for retry.
   */
  async function commitWithMirror(
    state: X2bPersistedState,
    baseSeq: number,
    priorPublications: number,
  ): Promise<X2bResult<null>> {
    let snapshot: ReturnType<typeof buildSnapshot>;
    try {
      // Construct once before publishing any intent: invalid material must not strand
      // recovery, and no second materialization may fail after the intent is durable.
      snapshot = buildSnapshot(state);
    } catch {
      return refusal("MATERIALIZATION_FAILED", "snapshot construction failed; nothing published", true);
    }
    state.mirrorIntent = state.manifestSeq;
    try {
      writeManifest(state);
    } catch {
      return refusal("STORE_UNAVAILABLE", "manifest intent write failed; prior publication preserved", true);
    }
    try {
      await mirrorSnapshot(state, snapshot);
    } catch {
      return refusal("STORE_UNAVAILABLE", "snapshot mirror failed; writer recovery required", true);
    }
    try {
      hooks.beforeManifestCommit?.(priorPublications);
    } catch {
      return refusal("PUBLICATION_INTERRUPTED", "publication interrupted before commit; writer recovery required", true);
    }
    const fresh = readRaw();
    if (fresh.manifestSeq !== baseSeq + 1 || fresh.mirrorIntent !== baseSeq + 1) {
      try {
        await mirrorSnapshot(fresh);
      } catch {
        return refusal("STORE_UNAVAILABLE", "competing manifest healed read failed; retry", true);
      }
      return refusal("MANIFEST_CONFLICT", "manifest advanced under a competing writer; retry", true);
    }
    state.mirrorIntent = null;
    try {
      writeManifest(state);
    } catch {
      return refusal("STORE_UNAVAILABLE", "manifest commit failed; writer recovery required", true);
    }
    return { ok: true, value: null };
  }

  function buildSnapshot(state: X2bPersistedState) {
    const graph: Graph = new Graph({ multi: false, allowSelfLoops: true });
    const communities = new Map<number, string[]>();
    const materials = [...state.live].sort().map((recordId) => materialize({ record_id: recordId, record_digest: "" }));
    // Collect ALL live ownership before edges: cross-record endpoints may be declared
    // later, but an edge can never create an undeclared (or forgotten) endpoint.
    for (const material of materials) {
      for (const node of material.nodes) if (!graph.hasNode(node)) graph.addNode(node);
    }
    let community = 0;
    for (const material of materials) {
      for (const [source, target] of material.edges) {
        if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
        if (!graph.hasEdge(source, target)) graph.addEdge(source, target);
      }
      communities.set(community++, material.nodes);
    }
    return { graph, communities };
  }

  async function mirrorSnapshot(state: X2bPersistedState, snapshot = buildSnapshot(state)): Promise<void> {
    const { graph, communities } = snapshot;
    const stage = `${snapshotPath}.${randomUUID()}.tmp`;
    try {
      await createFileGraphStore({ target: stage }).pushGraph(graph, communities);
      renameSync(stage, snapshotPath);
    } finally {
      rmSync(stage, { force: true });
    }
  }

  function readModel(state: X2bPersistedState): X2bReadModel {
    const materials = new Map<string, X2bMaterial>();
    for (const recordId of state.live) {
      materials.set(recordId, materialize({ record_id: recordId, record_digest: "" }));
    }
    const nodes = new Set<string>();
    const edges: Array<[string, string]> = [];
    for (const material of materials.values()) {
      for (const node of material.nodes) nodes.add(node);
    }
    for (const material of materials.values()) {
      for (const edge of material.edges) {
        if (nodes.has(edge[0]) && nodes.has(edge[1])) edges.push(edge);
      }
    }
    return {
      digest: x2bStateDigest(state, namespace),
      cursor: state.ackCursor,
      generation: state.generation,
      live: [...state.live].sort(),
      tombstoned: [...state.tombstoned].sort(),
      nodes: [...nodes].sort(),
      edges: edges.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)),
      influence: new Map(Object.entries(state.influence)),
    };
  }

  const pending = new Map<string, X2bPendingEntry>();

  function proofOf(state: X2bPersistedState): X2bPublicationProof {
    return {
      generation: state.generation,
      headCursor: state.headCursor,
      manifestDigest: x2bStateDigest(state, namespace),
      manifestSeq: state.manifestSeq,
    };
  }

  /**
   * Compare-and-swap publication: terminality resolves BEFORE the lock (it may await), then
   * the manifest is re-read fresh UNDER the lock and every guard (incarnation, fence,
   * sequence, head) re-validates on that fresh state. Between the fresh re-read and the
   * intent write only synchronous work runs, so a concurrent writer in this process can
   * never slip a stale write in — it either committed before our re-read (we apply on top)
   * or after our commit (our post-write verification refuses MANIFEST_CONFLICT).
   */
  async function publishEntry(token: string): Promise<X2bResult<X2bPublicationProof>> {
    const prepared = pending.get(token);
    // Unknown here refuses exactly like lookup on a stale incarnation: nothing is certified.
    if (prepared === undefined) return refusal("UNKNOWN_PUBLICATION", "unknown publication token or previous incarnation", false);
    // X2 apply-time filter: terminality is resolved now, over the canonical journal order —
    // the batch's opaque reason_ref never decides it. This may await (slow resolver) while
    // holding NO lock; the fresh re-read below re-validates everything against current state.
    const recordIds = [...new Set(prepared.batches.flatMap((batch) => [
      ...batch.records.map((record) => record.record_id),
      ...batch.removals.map((removal) => removal.record_id),
    ]))];
    const resolved = await resolveIds(recordIds);
    if (!resolved.ok) return resolved;
    return withManifestResult(async () => {
      const fresh = await openState();
      const entry = pending.get(token);
      if (entry === undefined || entry !== prepared || entry.incarnation !== fresh.incarnation) {
        return refusal("UNKNOWN_PUBLICATION", "unknown publication token or previous incarnation", false);
      }
      if (entry.stage === "published" || entry.stage === "acknowledged") {
        return { ok: true, value: proofOf(fresh) };
      }
      if (!fresh.fenceHeld) return refusal("FENCE_LOST", "canonical fence is lost; reacquire before publishing", true);
      if (clock() >= entry.deadlineAt) return refusal("DEADLINE_EXCEEDED", "publication deadline elapsed", false);
      try {
        hooks.beforePublish?.(fresh.publications);
      } catch {
        return refusal("PUBLICATION_INTERRUPTED", "publication interrupted before commit; prior publication preserved", true);
      }
      if (entry.manifestSeq !== fresh.manifestSeq) {
        return refusal("MANIFEST_CONFLICT", "manifest advanced under a competing writer; retry", true);
      }
      if (compareCursor(entry.headCursor, fresh.headCursor) < 0) {
        return refusal("PROJECTION_STALE", "stale head cannot publish past the pinned canonical head", false);
      }
      const plan = planX2bApply(fresh, entry.batches, order, resolved.value);
      const materials = new Map<string, X2bMaterial>();
      try {
        for (const id of plan.live) materials.set(id, materialize({ record_id: id, record_digest: "" }));
      } catch {
        return refusal("MATERIALIZATION_FAILED", "record materialization failed; nothing published", true);
      }
      const priorPublications = fresh.publications;
      const baseSeq = fresh.manifestSeq;
      fresh.live = [...plan.live].sort();
      fresh.lastTouch = plan.lastTouch;
      fresh.tombstoned = [...plan.tombstoned].sort();
      fresh.influence = Object.create(null);
      for (const [recordId, material] of materials) fresh.influence[recordId] = material.contribution;
      for (const removed of plan.removed) delete fresh.influence[removed];
      fresh.headCursor = compareCursor(entry.headCursor, fresh.headCursor) > 0 ? entry.headCursor : fresh.headCursor;
      fresh.generation = entry.generation;
      fresh.publications += 1;
      fresh.manifestSeq += 1;
      const committed = await commitWithMirror(fresh, baseSeq, priorPublications);
      if (!committed.ok) return committed;
      entry.stage = "published";
      (entry as { publishSeq?: number }).publishSeq = fresh.manifestSeq;
      (entry as { resultHead?: string }).resultHead = fresh.headCursor;
      return { ok: true, value: proofOf(fresh) };
    });
  }

  const adapter = {
    projection_id: "graph",

    /**
     * Serving-path ingestion with re-read-and-reapply: terminality resolves BEFORE the lock,
     * then the manifest is re-read fresh UNDER the lock and the tombstone set, the resolved
     * terminal set AND the last-touch map re-validate on that fresh state. A stale ingest
     * that lost the race absorbs (success, nothing applied) — it never reintroduces a
     * fallen object and never regresses the acknowledgement cursor.
     */
    async ingest(recordId: string): Promise<X2bResult<{ record_id: string }>> {
      const resolved = await resolveIds([recordId]);
      if (!resolved.ok) return resolved;
      if (resolved.value.has(recordId)) return { ok: true, value: { record_id: recordId } };
      let material: X2bMaterial;
      try {
        material = materialize({ record_id: recordId, record_digest: "" });
      } catch {
        return refusal("MATERIALIZATION_FAILED", "record materialization failed", true);
      }
      return withManifestResult(async () => {
        const fresh = await openState();
        // Re-check on fresh state: a tombstone acknowledged while we resolved absorbs.
        if (fresh.tombstoned.includes(recordId)) return { ok: true, value: { record_id: recordId } };
        if (resolved.value.has(recordId)) return { ok: true, value: { record_id: recordId } };
        // Batch traffic owns touched records: only an applied batch may move them again, so
        // a stale serving-path ingest absorbs instead of resurrecting. Terminality still
        // comes from canonical state, never from any label.
        if (fresh.lastTouch[recordId] !== undefined) return { ok: true, value: { record_id: recordId } };
        const priorPublications = fresh.publications;
        const baseSeq = fresh.manifestSeq;
        fresh.live = [...new Set([...fresh.live, recordId])].sort();
        fresh.lastTouch[recordId] = fresh.headCursor;
        fresh.influence[recordId] = material.contribution;
        fresh.manifestSeq += 1;
        const committed = await commitWithMirror(fresh, baseSeq, priorPublications);
        if (!committed.ok) return committed;
        return { ok: true, value: { record_id: recordId } };
      });
    },

    /**
     * Single-batch round: the reported cursor is the APPLIED batch's through cursor — never
     * beyond it — so a lagging surface is always caught up by the next replay and the
     * cascade converges instead of pinning itself at the acknowledgement cursor.
     */
    async invalidate(batch: X2bProjectionBatch): Promise<X2bResult<{ projection_id: string; cursor: string; digest: string }>> {
      const seeded = readRaw();
      const head = compareCursor(batch.through_cursor_inclusive, seeded.headCursor) > 0
        ? batch.through_cursor_inclusive
        : seeded.headCursor;
      const prepared = await adapter.prepareGeneration({
        generation: seeded.generation === "" ? "gen:auto" : seeded.generation,
        headCursor: head,
        batches: [batch],
        deadlineAt: "9999-01-01T00:00:00.000Z",
        operationId: `auto:${batch.from_cursor_exclusive}:${batch.through_cursor_inclusive}:${x2bContentDigest([batch])}`,
      });
      if (!prepared.ok) return x2bSurfaceRefusal(prepared);
      const published = await publishEntry(prepared.value.token);
      if (!published.ok) return x2bSurfaceRefusal(published);
      const acknowledged = await adapter.acknowledgePublication(prepared.value.token);
      if (!acknowledged.ok) return x2bSurfaceRefusal(acknowledged);
      const current = readRaw();
      // The batch applied and coverage reaches at least its through cursor: certify exactly
      // the applied batch. Otherwise fall back to the acknowledgement cursor so the caller
      // stops safely instead of certifying uncovered ground.
      const cursor = compareCursor(current.ackCursor, batch.through_cursor_inclusive) >= 0
        ? batch.through_cursor_inclusive
        : current.ackCursor;
      return {
        ok: true,
        value: { projection_id: "graph", cursor, digest: x2bStateDigest(current, namespace) },
      };
    },

    async prepareGeneration(input: X2bPrepareInput): Promise<X2bResult<{ token: string; duplicate: boolean }>> {
      return withManifestResult(async () => {
        const fresh = await openState();
        const prepared = planX2bPrepare(fresh, input, clock());
        if (!prepared.ok) return prepared;
        pending.set(prepared.value.token, fresh.pending[prepared.value.token]!);
        writeManifest(fresh);
        return prepared;
      });
    },

    async publishPublication(token: string): Promise<X2bResult<X2bPublicationProof>> {
      return publishEntry(token);
    },

    async acknowledgePublication(token: string): Promise<X2bResult<X2bAcknowledgeReceipt>> {
      return withManifestResult(async () => {
        const fresh = await openState();
        const entry = pending.get(token);
        if (entry === undefined || entry.incarnation !== fresh.incarnation) {
          return refusal("UNKNOWN_PUBLICATION", "unknown publication token or previous incarnation", false);
        }
        if (entry.stage === "acknowledged") {
          return {
            ok: true,
            value: { cursor: fresh.ackCursor, digest: x2bStateDigest(fresh, namespace), generation: fresh.generation, incarnation: fresh.incarnation },
          };
        }
        if (entry.stage !== "published") return refusal("NOT_PUBLISHED", "preparation alone cannot acknowledge", false);
        if (!fresh.fenceHeld) return refusal("FENCE_LOST", "canonical fence is lost; reacquire before acknowledging", true);
        if (clock() >= entry.deadlineAt) return refusal("DEADLINE_EXCEEDED", "acknowledgement deadline elapsed", false);
        const publishSeq = (entry as { publishSeq?: number }).publishSeq;
        const resultHead = (entry as { resultHead?: string }).resultHead;
        if (publishSeq === undefined || fresh.manifestSeq !== publishSeq) {
          return refusal("MANIFEST_CONFLICT", "previous manifest advanced; acknowledgement refuses", true);
        }
        if (resultHead === undefined || fresh.headCursor !== resultHead) {
          return refusal("PROJECTION_STALE", "expected head moved; acknowledgement refuses", false);
        }
        fresh.ackCursor = compareCursor(fresh.headCursor, fresh.ackCursor) > 0 ? fresh.headCursor : fresh.ackCursor;
        entry.stage = "acknowledged";
        writeManifest(fresh);
        return {
          ok: true,
          value: { cursor: fresh.ackCursor, digest: x2bStateDigest(fresh, namespace), generation: fresh.generation, incarnation: fresh.incarnation },
        };
      });
    },

    async readCurrent(): Promise<X2bResult<X2bReadModel>> {
      const state = readRaw();
      if (state.mirrorIntent !== null) return refusal("PROJECTION_STALE", "writer recovery required", true);
      if (state.generation === "") return refusal("PROJECTION_STALE", "no committed generation is available", false);
      const terminal = await resolveIds(state.live);
      if (!terminal.ok) return terminal;
      if (state.live.some((id) => terminal.value.has(id))) return refusal("PROJECTION_STALE", "canonical tombstone awaits projection", true);
      try { return { ok: true, value: readModel(state) }; }
      catch { return refusal("MATERIALIZATION_FAILED", "record materialization failed", true); }
    },

    async coverage(): Promise<X2bCoverage> {
      const state = readRaw();
      if (state.mirrorIntent !== null) return { cursor: state.ackCursor, complete: false };
      if (state.generation === "") return { cursor: state.ackCursor, complete: false };
      return { cursor: state.ackCursor, complete: state.ackCursor === state.headCursor };
    },

    async loseFenceForTests(): Promise<void> {
      await withManifestLock(async () => {
        const state = await openState();
        state.fenceHeld = false;
        writeManifest(state);
      });
    },

    async reacquireFenceForTests(): Promise<void> {
      await withManifestLock(async () => {
        const state = await openState();
        state.fenceHeld = true;
        state.fenceEpoch += 1;
        writeManifest(state);
      });
    },

    async recreateForTests(): Promise<void> {
      await withManifestLock(async () => {
        const state = await openState();
        state.incarnation = randomUUID();
        state.pending = {};
        pending.clear();
        state.manifestSeq += 1;
        writeManifest(state);
      });
    },

    /** Test-only: every owned node id currently mirrored in the real graph file. */
    mirroredNodeIdsForTests(): string[] {
      const file = JSON.parse(readFileSync(snapshotPath, "utf8")) as { nodes: Array<{ id: string }> };
      return file.nodes.map((node) => node.id).sort();
    },

    async clearNamespaceForTests(): Promise<void> {
      await withManifestLock(async () => {
        const state = await openState();
        const baseSeq = state.manifestSeq;
        state.live = [];
        state.lastTouch = Object.create(null);
        state.influence = Object.create(null);
        state.operations = Object.create(null);
        state.manifestSeq += 1;
        const committed = await commitWithMirror(state, baseSeq, state.publications);
        if (!committed.ok) throw new Error(committed.error.message);
      });
    },

    async recover(): Promise<X2bResult<null>> {
      return withManifestResult(async () => {
        await openState();
        return { ok: true, value: null };
      });
    },

    async close(): Promise<void> {},
  };

  return adapter;
}

export type FileGraphProjectionAdapter = ReturnType<typeof createFileGraphProjectionAdapter>;
