// @sentropic/engram-live/watch — L6b injected native-watch orchestration
// (spec/SPEC_LIVE_GIT_INDEXING.md §7, §13; L6b-design.md §6 I2, §7).
//
// Events accelerate work; reconciliation establishes state. Every incoming
// watch signal bumps a monotonic invalidation sequence and invokes registered
// synchronous invalidation callbacks BEFORE debounce, queue admission, or any
// await so coverage axes drop out of "current" in the same turn.

import { watch as fsWatch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { Scheduler } from "./scheduler.js";

export type WatchSignalKind =
  | "change"
  | "delete"
  | "overflow"
  | "restart"
  | "downtime"
  | "packed-refs"
  | "projection-replaced"
  | "watch-error";

export interface WatchEvent {
  readonly kind: WatchSignalKind;
  readonly paths: readonly string[];
  readonly at: number;
  /** Downtime duration for kind "downtime"; absent otherwise. */
  readonly ms?: number;
  /** Optional specific coverage axes invalidated by this signal. */
  readonly axes?: readonly string[];
}

export interface InvalidationSignal {
  readonly seq: number;
  readonly kind: WatchSignalKind;
  readonly paths: readonly string[];
  readonly overflowed: boolean;
  readonly at: number;
  readonly ms?: number;
  readonly axes?: readonly string[];
}

export interface WatchPort {
  /** Resolves when the native watcher is ready. Buffered signals precede it. */
  start(): Promise<void>;
  stop(): Promise<void>;
  onSignal(listener: (event: WatchEvent) => void): () => void;
}

export interface WatchClock {
  now(): number;
}

export interface WatchConfig {
  readonly scheduler: Scheduler;
  /** Coalescence window for change notifications (LIVE §13: 500 ms). */
  readonly debounceMs: number;
  /** Hard bound on coalesced pending paths; overflow past it is explicit. */
  readonly maxPendingPaths: number;
  /** Optional synchronous invalidation callback fired before debounce/admission. */
  readonly onInvalidation?: (signal: InvalidationSignal) => void;
}

export type WatcherState = "starting" | "ready" | "degraded" | "stopped";

/** One-shot disruption flags consumed by the reconciler. */
export interface DrainedFlags {
  readonly restarted: boolean;
  readonly downtimeMs: number;
  readonly packedRefs: boolean;
  readonly projectionReplaced: boolean;
}

export interface WatchHub {
  readonly scheduler: Scheduler;
  readonly state: WatcherState;
  /** Start the port and resolve only once it reports readiness. */
  bootstrap(): Promise<void>;
  /** Run the initial scan fn; refused before readiness, always. */
  runScanPhase<T>(scan: () => Promise<T>): Promise<T>;
  isReady(): boolean;
  pendingPaths(): readonly string[];
  pendingCount(): number;
  /** Drain the coalesced set for one reconcile round. */
  takePending(): string[];
  /** Requeue paths an incomplete collection could not absorb (bounded). */
  requeue(paths: readonly string[]): void;
  overflowed(): boolean;
  /**
   * Monotone invalidation sequence: every watch signal (change, overflow,
   * restart, downtime, projection replacement, packed-refs) bumps it
   * synchronously before debounce or queue admission.
   */
  invalidationSeq(): number;
  /** Latest overflow sequence, unaffected by ordinary path changes. */
  overflowSeq(): number;
  /**
   * Clear only overflows covered by the sequence captured at rescan start.
   */
  acknowledgeOverflow(upto?: number): void;
  consumeFlags(): DrainedFlags;
  degradedReason(): string | undefined;
  clearDegraded(): void;
  /**
   * Register a synchronous invalidation callback invoked inside port.onSignal
   * BEFORE debounce, queue admission, or any await (design §6 I2).
   */
  onInvalidation(listener: (signal: InvalidationSignal) => void): () => void;
  onChange(listener: (paths: readonly string[]) => void): () => void;
  dispose(): Promise<void>;
}

const EMPTY_FLAGS: DrainedFlags = {
  restarted: false,
  downtimeMs: 0,
  packedRefs: false,
  projectionReplaced: false,
};

export function createWatchHub(port: WatchPort, clock: WatchClock, config: WatchConfig): WatchHub {
  if (!Number.isFinite(config.debounceMs) || config.debounceMs < 0) {
    throw new Error("watch debounceMs must be a finite non-negative delay");
  }
  if (!Number.isInteger(config.maxPendingPaths) || config.maxPendingPaths < 1) {
    throw new Error("watch maxPendingPaths must be a positive integer bound");
  }
  if (!config.scheduler || config.maxPendingPaths>config.scheduler.budgets.maxPendingPaths) throw new Error("watch requires the global budget manager");
  const maxPathBytes=config.scheduler.budgets.maxPathBytes;
  const releaseResident=config.scheduler.retain(4096+config.maxPendingPaths*(4*maxPathBytes+512));

  let state: WatcherState = "starting";
  const pending = new Map<string, number>();
  let overflow = false;
  let invalidations = 0;
  let latestOverflow = 0;
  let degradation: string | undefined;
  let observationFailed=false;
  let flags: DrainedFlags = { ...EMPTY_FLAGS };
  let lastNotifyAt = Number.NEGATIVE_INFINITY;
  const invalidationListeners = new Set<(signal: InvalidationSignal) => void>();
  if (config.onInvalidation !== undefined) {
    invalidationListeners.add(config.onInvalidation);
  }
  const changeListeners = new Set<(paths: readonly string[]) => void>();

  const degrade = (reason: string): void => {
    degradation = reason;
    if (state === "ready") state = "degraded";
  };

  const emitInvalidationSync = (signal: InvalidationSignal): void => {
    for (const listener of [...invalidationListeners]) {
      listener(signal);
    }
  };

  const notifyDebounced = (paths: readonly string[]): void => {
    const at = clock.now();
    if (at - lastNotifyAt < config.debounceMs) return;
    lastNotifyAt = at;
    for (const listener of [...changeListeners]) listener(paths);
  };

  const willChangeOverflow = (paths: readonly string[]): boolean => {
    if(paths.length>config.maxPendingPaths)return true;
    let projectedSize = pending.size;
    for (const path of paths) {
      if(Buffer.byteLength(path)>maxPathBytes)return true;
      if (!pending.has(path)) {
        projectedSize += 1;
        if (projectedSize > config.maxPendingPaths) return true;
      }
    }
    return false;
  };

  const unsubscribe = port.onSignal((event) => {
    if (state === "stopped") return;

    // 1. Synchronous invalidation BEFORE debounce, queue admission, or any await.
    const isPathMutation = event.kind === "change" || event.kind === "delete";
    const changeOverflows = isPathMutation && willChangeOverflow(event.paths);
    const signalOverflows = event.kind === "overflow" || changeOverflows;
    if (signalOverflows) {
      overflow = true;
    }
    invalidations += 1;
    const seq = invalidations;
    if(signalOverflows)latestOverflow=seq;

    switch (event.kind) {
      case "overflow":
        degrade("watch overflow reported by the native watcher: full reconciliation required");
        break;
      case "restart":
        observationFailed=false;
        flags = { ...flags, restarted: true };
        degrade("watcher restarted: catch-up reconciliation required");
        break;
      case "watch-error":
        observationFailed=true;
        degrade("watch observation failed: readiness must be restored before certification");
        break;
      case "downtime":
        flags = { ...flags, downtimeMs: flags.downtimeMs + (event.ms ?? 0) };
        degrade("watcher downtime: catch-up reconciliation required");
        break;
      case "packed-refs":
        flags = { ...flags, packedRefs: true };
        break;
      case "projection-replaced":
        flags = { ...flags, projectionReplaced: true };
        degrade("projection replaced: checkpoints invalid, full reconciliation required");
        break;
      case "change":
      case "delete":
        if (changeOverflows) {
          degrade(
            `watch overflow: ${config.maxPendingPaths} bounded pending paths kept, full reconciliation required`,
          );
        }
        break;
    }

    emitInvalidationSync({
      seq,
      kind: event.kind,
      paths: signalOverflows ? [] : event.paths,
      overflowed: signalOverflows,
      at: event.at,
      ms: event.ms,
      axes: event.axes,
    });

    // 2. Bounded queue admission and debounced notification AFTER synchronous invalidation.
    if (isPathMutation) {
      for (const path of event.paths) {
        if(Buffer.byteLength(path)>maxPathBytes)break;
        if (pending.has(path)) continue;
        if (pending.size >= config.maxPendingPaths) {
          overflow = true;
          break;
        }
        pending.set(path, event.at);
      }
      if (event.paths.length > 0) {
        notifyDebounced(event.paths.slice(0,config.maxPendingPaths));
      }
    }
  });

  return {
    scheduler:config.scheduler,
    get state(): WatcherState {
      return state;
    },
    async bootstrap(): Promise<void> {
      if (state !== "starting") {
        throw new Error(`watch bootstrap requires the starting state (state is "${state}")`);
      }
      await port.start();
      if (state === "starting") state = "ready";
    },
    async runScanPhase<T>(scan: () => Promise<T>): Promise<T> {
      if (state === "starting") {
        throw new Error("watch not ready: the initial scan is refused before watcher readiness");
      }
      if (state === "stopped") {
        throw new Error("watch stopped: no scan phase runs after dispose");
      }
      return scan();
    },
    isReady(): boolean {
      return !observationFailed && (state === "ready" || state === "degraded");
    },
    pendingPaths(): readonly string[] {
      return [...pending.keys()];
    },
    pendingCount(): number {
      return pending.size;
    },
    takePending(): string[] {
      const drained = [...pending.keys()];
      pending.clear();
      return drained;
    },
    requeue(paths: readonly string[]): void {
      const at = clock.now();
      for (const path of paths) {
        if (pending.has(path)) continue;
        if (pending.size >= config.maxPendingPaths || Buffer.byteLength(path)>maxPathBytes) {
          overflow = true;
          invalidations += 1;
          const seq = invalidations;
          latestOverflow=seq;
          degrade(
            `watch overflow on requeue: ${pending.size} bounded pending paths kept, full reconciliation required`,
          );
          emitInvalidationSync({
            seq,
            kind: "overflow",
            paths: [],
            overflowed: true,
            at,
          });
          return;
        }
        pending.set(path, at);
      }
    },
    overflowed(): boolean {
      return overflow;
    },
    invalidationSeq(): number {
      return invalidations;
    },
    overflowSeq(): number { return latestOverflow; },
    acknowledgeOverflow(upto?: number): void {
      if (upto !== undefined && upto < latestOverflow) return;
      overflow = false;
    },
    consumeFlags(): DrainedFlags {
      const drained = flags;
      flags = { ...EMPTY_FLAGS };
      return drained;
    },
    degradedReason(): string | undefined {
      return degradation;
    },
    clearDegraded(): void {
      if(observationFailed)return;
      degradation = undefined;
      if (state === "degraded") state = "ready";
    },
    onInvalidation(listener: (signal: InvalidationSignal) => void): () => void {
      if(invalidationListeners.size>=config.maxPendingPaths)throw new Error("watch listener limit");
      invalidationListeners.add(listener);
      return () => {
        invalidationListeners.delete(listener);
      };
    },
    onChange(listener: (paths: readonly string[]) => void): () => void {
      if(changeListeners.size>=config.maxPendingPaths)throw new Error("watch listener limit");
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    async dispose(): Promise<void> {
      if(state==="stopped")return;
      state = "stopped";
      unsubscribe();
      invalidationListeners.clear();
      changeListeners.clear();
      try { await port.stop(); } finally { releaseResident(); }
    },
  };
}

/**
 * Production watch port over node:fs.watch for one directory (non-recursive;
 * linked worktrees share a common-dir watcher per worktree through separate
 * hubs). A null filename carries no path set, so it becomes an explicit
 * overflow — never a silent skip. Watcher errors degrade explicitly.
 */
export function createNativeWatchHub(dir: string, clock: WatchClock, config: WatchConfig): WatchHub {
  let emit: ((event: WatchEvent) => void) | undefined;
  let watcher: FSWatcher | undefined;
  const port: WatchPort = {
    start: () =>
      new Promise<void>((resolve, reject) => {
        try {
          watcher = fsWatch(dir, (_eventType, filename) => {
            const target = emit;
            if (target === undefined) return;
            if (typeof filename === "string" && filename.length > 0) {
              target({ kind: "change", paths: [join(dir, filename)], at: clock.now() });
            } else {
              target({ kind: "overflow", paths: [], at: clock.now() });
            }
          });
          watcher.on("error", () => {
            emit?.({ kind: "watch-error", paths: [], at: clock.now() });
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    stop: async () => {
      watcher?.close();
      watcher = undefined;
    },
    onSignal: (listener: (event: WatchEvent) => void): (() => void) => {
      emit = listener;
      return () => {
        if (emit === listener) emit = undefined;
      };
    },
  };
  return createWatchHub(port, clock, config);
}
