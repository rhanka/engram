/**
 * X2b shared deterministic property corpus (no imports: usable from both the
 * local adapter suite and the engine/Postgres suite without joining the
 * neutral import closure). Every sequence is deterministic; resume points,
 * partitions and apply orders are enumerated, never sampled.
 */

export interface X2bEvent {
  cursor: string;
  record_id: string;
  kind: "add" | "remove";
  reason_ref: string;
}

export interface X2bBatch {
  from_cursor_exclusive: string;
  through_cursor_inclusive: string;
  records: Array<{ record_id: string; record_digest: string }>;
  removals: Array<{ record_id: string; reason_ref: string }>;
}

/** Four records; R1/R2 follow dispute → resolve_dispute → tombstone, R3/R4 supersede → rewind → tombstone. */
export const X2B_RECORDS = ["x2b:r1", "x2b:r2", "x2b:r3", "x2b:r4"] as const;

export function x2bDigest(recordId: string): string {
  return `sha256:x2b-${recordId}`;
}

/** Canonical legal histories: adds interleave removals; tombstones are terminal per record. */
export function x2bHistories(): X2bEvent[][] {
  const disputeTombstone: X2bEvent[] = [
    { cursor: "1", record_id: "x2b:r1", kind: "add", reason_ref: "memory:capture" },
    { cursor: "2", record_id: "x2b:r2", kind: "add", reason_ref: "memory:capture" },
    { cursor: "3", record_id: "x2b:r1", kind: "remove", reason_ref: "memory:dispute" },
    { cursor: "4", record_id: "x2b:r1", kind: "add", reason_ref: "memory:resolve_dispute" },
    { cursor: "5", record_id: "x2b:r2", kind: "remove", reason_ref: "memory:dispute" },
    { cursor: "6", record_id: "x2b:r2", kind: "add", reason_ref: "memory:resolve_dispute" },
    { cursor: "7", record_id: "x2b:r1", kind: "remove", reason_ref: "memory:tombstoned" },
    { cursor: "8", record_id: "x2b:r2", kind: "remove", reason_ref: "memory:tombstoned" },
  ];
  const supersedeTombstone: X2bEvent[] = [
    { cursor: "1", record_id: "x2b:r3", kind: "add", reason_ref: "memory:capture" },
    { cursor: "2", record_id: "x2b:r4", kind: "add", reason_ref: "memory:capture" },
    { cursor: "3", record_id: "x2b:r3", kind: "remove", reason_ref: "memory:supersede" },
    { cursor: "4", record_id: "x2b:r3", kind: "add", reason_ref: "memory:rewind" },
    { cursor: "5", record_id: "x2b:r4", kind: "remove", reason_ref: "memory:supersede" },
    { cursor: "6", record_id: "x2b:r4", kind: "add", reason_ref: "memory:rewind" },
    { cursor: "7", record_id: "x2b:r3", kind: "remove", reason_ref: "memory:tombstoned" },
    { cursor: "8", record_id: "x2b:r4", kind: "remove", reason_ref: "memory:tombstoned" },
  ];
  const interleaved: X2bEvent[] = [
    { cursor: "1", record_id: "x2b:r1", kind: "add", reason_ref: "memory:capture" },
    { cursor: "2", record_id: "x2b:r3", kind: "add", reason_ref: "memory:capture" },
    { cursor: "3", record_id: "x2b:r1", kind: "remove", reason_ref: "memory:dispute" },
    { cursor: "4", record_id: "x2b:r3", kind: "remove", reason_ref: "memory:supersede" },
    { cursor: "5", record_id: "x2b:r1", kind: "add", reason_ref: "memory:resolve_dispute" },
    { cursor: "6", record_id: "x2b:r3", kind: "add", reason_ref: "memory:rewind" },
    { cursor: "7", record_id: "x2b:r1", kind: "remove", reason_ref: "memory:tombstoned" },
    { cursor: "8", record_id: "x2b:r3", kind: "remove", reason_ref: "memory:tombstoned" },
  ];
  return [disputeTombstone, supersedeTombstone, interleaved];
}

/** Page partitions exercised by the matrix (one event per page up to one window). */
export const X2B_PARTITIONS = [1, 2, 3, 8] as const;

/** Apply orders exercised by the matrix. */
export const X2B_ORDERS = ["adds-first", "removals-first"] as const;
export type X2bOrder = (typeof X2B_ORDERS)[number];

/** Every resume cursor, including zero after convergence. */
export function x2bResumeCursors(events: X2bEvent[]): string[] {
  const cursors = ["0", ...events.map((event) => event.cursor)];
  return [...new Set(cursors)];
}

export function partitionIntoBatches(events: X2bEvent[], pageSize: number): X2bBatch[] {
  const batches: X2bBatch[] = [];
  let after = "0";
  for (let i = 0; i < events.length; i += pageSize) {
    const page = events.slice(i, i + pageSize);
    const last = page[page.length - 1]!;
    const seen = new Map<string, X2bEvent>();
    for (const event of page) seen.set(event.record_id, event);
    const records = [...seen.values()]
      .filter((event) => event.kind === "add")
      .map((event) => ({ record_id: event.record_id, record_digest: x2bDigest(event.record_id) }))
      .sort((a, b) => (a.record_id < b.record_id ? -1 : 1));
    const removals = [...seen.values()]
      .filter((event) => event.kind === "remove")
      .map((event) => ({ record_id: event.record_id, reason_ref: event.reason_ref }))
      .sort((a, b) => (a.record_id < b.record_id ? -1 : 1));
    batches.push({ from_cursor_exclusive: after, through_cursor_inclusive: last.cursor, records, removals });
    after = last.cursor;
  }
  return batches;
}

/** Independent sequential oracle: last operation per record wins; tombstoned is terminal. */
export function x2bOracle(
  events: X2bEvent[],
  throughCursor: string,
  order: X2bOrder,
): { live: Set<string>; tombstoned: Set<string>; influence: Map<string, number> } {
  const last = new Map<string, X2bEvent>();
  for (const event of events) {
    if (BigInt(event.cursor) > BigInt(throughCursor)) break;
    last.set(event.record_id, event);
  }
  const tombstoned = new Set(
    [...last.entries()].filter(([, event]) => event.reason_ref === "memory:tombstoned").map(([id]) => id),
  );
  const live = new Set(
    [...last.entries()].filter(([, event]) => event.kind === "add").map(([id]) => id),
  );
  void order;
  const influence = new Map<string, number>();
  for (const id of live) influence.set(id, x2bContribution(id));
  return { live, tombstoned, influence };
}

/** Deterministic per-record derived contribution (independent of any adapter). */
export function x2bContribution(recordId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < recordId.length; i++) {
    hash ^= recordId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1000;
}

/** Deterministic embedding of fixed dimension from the record id (CI vectors). */
export function x2bVector(recordId: string, dimension: number): number[] {
  const out: number[] = [];
  let seed = x2bContribution(recordId) + 1;
  for (let i = 0; i < dimension; i++) {
    seed = ((Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) >>> 0;
    out.push(seed / 0x7fffffff - 0.5);
  }
  return out;
}

export function x2bCosine(left: number[], right: number[]): number {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i]! * right[i]!;
    a += left[i]! * left[i]!;
    b += right[i]! * right[i]!;
  }
  if (a === 0 || b === 0) return 0;
  return dot / Math.sqrt(a * b);
}

/** Exclusive ownership: shared hub ownership is declared separately by every materializer. */
export function x2bOwnedNodes(recordId: string): string[] {
  return [`x2b:node:${recordId}`, `x2b:node:${recordId}:cite`];
}

export const X2B_HUB_NODE = "x2b:node:hub";

export function x2bOwnedEdges(recordId: string): Array<[string, string]> {
  return [
    [`x2b:node:${recordId}`, `x2b:node:${recordId}:cite`],
    [`x2b:node:${recordId}`, X2B_HUB_NODE],
  ];
}
