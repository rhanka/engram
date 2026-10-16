// L6b: one injected manager owns admission, allocations, attempts and retention.
import type { ScopeFencingTokenDto } from "./integration.js";
export type SchedulerFencingToken = ScopeFencingTokenDto;
export type WorkPriority = "interactive" | "backfill";
export function scopeIdentity(token: SchedulerFencingToken): string { return JSON.stringify([token.scope.tenant,token.scope.clone,token.scope.worktree]); }
export interface WorkItem {
  readonly id: string;
  readonly scopeId: string;
  readonly priority: WorkPriority;
  /** Includes descriptor, buffers, copies, output and retained completion. */
  readonly bytes: number;
  readonly fencingToken: SchedulerFencingToken;
  readonly idempotencyDigest: string;
}
export interface SchedulerBudgets {
  readonly maxPendingPaths: number;
  readonly maxPendingBytes: number;
  readonly maxConcurrency: number;
  readonly maxActiveOperationsPerScope: number;
  readonly maxRetries: number;
  readonly retryBaseMs: number;
  readonly maxBackoffMs: number;
  readonly maxFailedKept: number;
  readonly maxConsumers: number;
  readonly maxFileSizeBytes: number;
  readonly maxPathBytes: number;
  readonly readMarginBytes: number;
  readonly maxDiscoveryBytes: number;
  readonly maxBatchBytes: number;
  readonly maxGitChildren: number;
  readonly attemptDeadlineMs: number;
  readonly cancellationDeadlineMs: number;
  readonly interactiveQuantum: number;
  readonly backfillQuantum: number;
  readonly backfillReserveBytes: number;
  readonly durableBacklogQuota: number;
}
export type TaskOutcome = { readonly ok: true; readonly receiptId: string } |
  { readonly ok: false; readonly retryable: boolean; readonly retryAfterMs?: number; readonly fenced?: boolean; readonly superseded?: boolean };
export type SinkDelivery = TaskOutcome;
export type ExecutionResult = { readonly ok: true; readonly receiptId: string } |
  { readonly ok: false; readonly reason: "conflict" | "capacity" | "fenced" | "cancelled" | "failed" | "quarantined" | "superseded" };
export type EnqueueResult = "queued" | "overflow" | "conflict" | "fenced";
export interface ProducerPermit {
  readonly signal: AbortSignal;
  readonly capacityBytes: number;
  /** Reserve before allocating or reading. Keep the release until all copies die. */
  hold(bytes: number): () => void;
  withGit<T>(read: () => Promise<T>): Promise<T>;
  readFile<T>(statSize: number, read: (limitBytes: number) => Promise<{ bytesRead: number; value: T }>): Promise<T>;
  check(): void;
}
export interface SchedulerPorts {
  readonly clock: { now(): number; schedule(ms: number, callback: () => void): () => void };
  readonly sink: { deliver(id: string, token: SchedulerFencingToken, permit: ProducerPermit): Promise<TaskOutcome> };
  readonly validateToken: (token: SchedulerFencingToken) => boolean;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Durable failure/pause receipt; must be bounded and synchronous. */
  readonly park: (item: WorkItem, reason: string, attempts: number) => void;
  /** Scope-bound durable progress; receiving writes atomically fence item.fencingToken. */
  readonly readProgress: (item: WorkItem) => { readonly attempts:number; readonly receiptId?:string; readonly digest:string; readonly scopeId:string } | undefined;
  readonly writeProgress: (item: WorkItem, progress:{readonly attempts:number;readonly receiptId?:string}) => void;
  readonly backlogSize: () => number;
}
export interface SchedulerStats {
  readonly deliveredInteractive: number; readonly deliveredBackfill: number;
  readonly retries: number; readonly failed: readonly string[]; readonly failedTotal: number;
  readonly cancelled: boolean; readonly maxObservedQueue: number;
  readonly maxObservedBytes: number; readonly maxObservedConcurrency: number;
}
interface Entry {
  readonly item: WorkItem;
  readonly worker?: (permit: ProducerPermit) => Promise<TaskOutcome>;
  readonly controller: AbortController;
  readonly promise?: Promise<ExecutionResult>;
  resolve?: (result: ExecutionResult) => void;
  state: "queued" | "active" | "backoff" | "paused";
  attempts: number;
  receipt?: string;
  cancelled: boolean;
  quarantined: boolean;
  used: number;
  persisted: boolean;
  cancelTimer?: () => void;
}
export class Scheduler {
  private readonly entries = new Map<string, Entry>();
  private readonly queues: Record<WorkPriority, Entry[]> = { interactive: [], backfill: [] };
  private readonly scopeActive = new Map<string, number>();
  private readonly diagnostics: string[] = [];
  private active = 0; private gitChildren = 0; private bytes = 0; private consumers = 0;
  private rotation = 0;
  private readonly lastScope: Record<WorkPriority, string | undefined> = { interactive: undefined, backfill: undefined };
  private scheduled = false; private overflow = 0; private flight?: Promise<SchedulerStats>;
  private finishRun?: (stats: SchedulerStats) => void;
  private deliveredInteractive = 0; private deliveredBackfill = 0; private retries = 0; private failedTotal = 0;
  private maxQueue = 0; private maxBytes = 0; private maxActive = 0;
  private last?: SchedulerStats;
  private durableUsed = 0;
  private durableParked = 0;
  private readonly residents = new Map<number,number>();
  private readonly residentWork = new Map<number,number>();
  private residentSequence = 0;
  private readonly quiescence = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  readonly budgets: SchedulerBudgets;
  constructor(private readonly ports: SchedulerPorts, budgets: SchedulerBudgets) {
    this.budgets = Object.freeze({...budgets});
    budgets = this.budgets;
    const names: (keyof SchedulerBudgets)[] = ["maxPendingPaths", "maxPendingBytes", "maxConcurrency", "maxActiveOperationsPerScope", "maxRetries", "retryBaseMs", "maxBackoffMs", "maxFailedKept", "maxConsumers", "maxFileSizeBytes", "maxPathBytes", "readMarginBytes", "maxDiscoveryBytes", "maxBatchBytes", "maxGitChildren", "attemptDeadlineMs", "cancellationDeadlineMs", "interactiveQuantum", "backfillQuantum", "backfillReserveBytes", "durableBacklogQuota"];
    for (const name of names) {
      const value = budgets[name];
      if (!Number.isSafeInteger(value) || value < (["maxRetries", "readMarginBytes"].includes(name) ? 0 : 1)) throw new Error(`required finite budget: ${name}`);
    }
    if (budgets.maxGitChildren > 4 || budgets.maxBatchBytes > 4 * 1024 * 1024 ||
      budgets.maxActiveOperationsPerScope >= budgets.maxConcurrency ||
      budgets.backfillReserveBytes >= budgets.maxPendingBytes || budgets.maxConsumers > budgets.maxPendingPaths ||
      budgets.interactiveQuantum !== 3 || budgets.backfillQuantum !== 1) throw new Error("infeasible global/per-scope/fairness budgets");
    for(const name of ["validateToken","park","readProgress","writeProgress","backlogSize"] as const)if(typeof ports[name]!=="function")throw new Error(`required writer/durable port: ${name}`);
    if(typeof ports.clock.schedule!=="function")throw new Error("required deadline clock");
    const historical=ports.backlogSize();
    if(!Number.isSafeInteger(historical)||historical<0||historical>budgets.durableBacklogQuota)throw new Error("invalid durable backlog quota state");
    this.durableUsed=historical;this.durableParked=historical;
    // Bounded diagnostic ring and its snapshots are charged for this manager's lifetime.
    this.retain(4096+budgets.maxFailedKept*192);
  }
  private descriptorBytes(item: WorkItem): number {
    return 256 + Buffer.byteLength(JSON.stringify({id:item.id,scopeId:item.scopeId,priority:item.priority,bytes:item.bytes,idempotencyDigest:item.idempotencyDigest,fencingToken:{tokenId:item.fencingToken.tokenId,scope:{tenant:item.fencingToken.scope.tenant,clone:item.fencingToken.scope.clone,worktree:item.fencingToken.scope.worktree},epoch:item.fencingToken.epoch,epochId:item.fencingToken.epochId,declarationRevision:item.fencingToken.declarationRevision,projectionIncarnation:item.fencingToken.projectionIncarnation,issuedAt:item.fencingToken.issuedAt,expiresAt:item.fencingToken.expiresAt}}), "utf8");
  }
  private matches(a: WorkItem, b: WorkItem): boolean { return a.id===b.id && a.scopeId===b.scopeId && a.priority===b.priority && a.bytes===b.bytes && a.idempotencyDigest===b.idempotencyDigest && a.fencingToken.tokenId===b.fencingToken.tokenId; }
  private admit(item: WorkItem, worker?: Entry["worker"]): EnqueueResult {
    const existing = this.entries.get(item.id);
    if (existing) return this.matches(existing.item, item) && existing.worker === worker ? "queued" : "conflict";
    if (!item.fencingToken?.scope || item.scopeId!==scopeIdentity(item.fencingToken) || !this.ports.validateToken(item.fencingToken)) return "fenced";
    for (const field of [item.id,item.scopeId,item.idempotencyDigest,item.fencingToken.tokenId,item.fencingToken.epochId,item.fencingToken.projectionIncarnation,item.fencingToken.scope.tenant,item.fencingToken.scope.clone,item.fencingToken.scope.worktree]) if (typeof field!=="string" || field.length>1024) throw new Error("bounded work identity required");
    if (item.priority!=="interactive" && item.priority!=="backfill") throw new Error("invalid priority");
    if (!item.id || !item.idempotencyDigest || !item.scopeId || !Number.isSafeInteger(item.bytes) || item.bytes < this.descriptorBytes(item)) throw new Error("invalid work descriptor or allocation allowance");
    const progress=this.ports.readProgress(item);
    if(progress && (progress.digest!==item.idempotencyDigest || progress.scopeId!==item.scopeId))return "conflict";
    if(progress && (!Number.isSafeInteger(progress.attempts)||progress.attempts<0||(progress.receiptId?.length??0)>1024))throw new Error("invalid bounded durable progress");
    const existingClaim=progress!==undefined && progress.receiptId===undefined;
    const reservedBackfill = [...this.entries.values()].filter(e => e.item.priority === "backfill");
    const headroom = item.priority === "interactive" ? Math.max(0, this.budgets.backfillReserveBytes - reservedBackfill.reduce((n,e) => n + e.item.bytes,0)) : 0;
    const slotHeadroom = item.priority === "interactive" && reservedBackfill.length === 0 ? 1 : 0;
    if ((!existingClaim && this.durableUsed >= this.budgets.durableBacklogQuota) || this.entries.size + this.residents.size + 1 > this.budgets.maxPendingPaths - slotHeadroom || this.bytes + item.bytes > this.budgets.maxPendingBytes - headroom || (worker && this.consumers >= this.budgets.maxConsumers)) {
      this.overflow++; return "overflow";
    }
    let resolve: Entry["resolve"];
    const promise = worker ? new Promise<ExecutionResult>(r => { resolve = r; }) : undefined;
    const source=item.fencingToken;
    const token=Object.freeze({tokenId:source.tokenId,epoch:source.epoch,epochId:source.epochId,declarationRevision:source.declarationRevision,projectionIncarnation:source.projectionIncarnation,issuedAt:source.issuedAt,expiresAt:source.expiresAt,scope:Object.freeze({tenant:source.scope.tenant,clone:source.scope.clone,worktree:source.scope.worktree})});
    const normalized=Object.freeze({id:item.id,scopeId:item.scopeId,priority:item.priority,bytes:item.bytes,idempotencyDigest:item.idempotencyDigest,fencingToken:token});
    const entry: Entry = { item: normalized, worker, controller: new AbortController(), promise, resolve, state: "queued", attempts: progress?.attempts ?? 0, receipt:progress?.receiptId, persisted:existingClaim, cancelled: false, quarantined: false, used: this.descriptorBytes(item) };
    this.entries.set(item.id, entry); this.queues[item.priority].push(entry);
    if(existingClaim)this.durableParked--;else this.durableUsed++;
    this.bytes += item.bytes; if (worker) this.consumers++;
    this.maxQueue = Math.max(this.maxQueue,this.entries.size); this.maxBytes = Math.max(this.maxBytes,this.bytes);
    return "queued";
  }
  enqueue(item: WorkItem): EnqueueResult { const r = this.admit(item); if (r === "queued") this.wake(); return r; }
  execute(item: WorkItem, worker: NonNullable<Entry["worker"]>): Promise<ExecutionResult> {
    const admission = this.admit(item,worker);
    if (admission !== "queued") return Promise.resolve({ ok: false, reason: admission === "overflow" ? "capacity" : admission });
    const promise = this.entries.get(item.id)!.promise!;
    this.wake(); return promise;
  }
  private wake(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.pump(); });
  }
  private choose(): Entry | undefined {
    for (let i = 0; i < 4; i++) {
      const priority: WorkPriority = this.rotation < 3 ? "interactive" : "backfill";
      this.rotation = (this.rotation + 1) % 4;
      const queue = this.queues[priority];
      const eligible = (e: Entry) => (this.scopeActive.get(e.item.scopeId) ?? 0) < this.budgets.maxActiveOperationsPerScope;
      let index = queue.findIndex(e => eligible(e) && e.item.scopeId !== this.lastScope[priority]);
      if (index < 0) index = queue.findIndex(eligible);
      if (index >= 0) { const e = queue.splice(index,1)[0]!; this.lastScope[priority] = e.item.scopeId; return e; }
    }
    return undefined;
  }
  private pump(): void {
    while (this.active < this.budgets.maxConcurrency) { const e = this.choose(); if (!e) break; this.launch(e); }
    // No Promise.race over active promises: a long-lived sibling retains no per-turn handlers.
    if (![...this.entries.values()].some(e => e.state === "queued" || e.state === "backoff" || (e.state === "active" && !e.quarantined))) {
      const finish = this.finishRun; this.finishRun = undefined; this.flight = undefined;
      this.last = this.stats(); finish?.(this.last);
    }
  }
  private permit(e: Entry): ProducerPermit {
    const check = () => { if (e.cancelled || e.controller.signal.aborted) throw new Error("operation cancelled"); if (!this.ports.validateToken(e.item.fencingToken)) throw new Error("FENCING_REJECTED"); };
    return { signal: e.controller.signal, capacityBytes: e.item.bytes,
      check,
      hold: bytes => {
        check(); if (!Number.isSafeInteger(bytes) || bytes < 0 || e.used + bytes > e.item.bytes) throw new Error("producer allocation budget exceeded");
        e.used += bytes; let released = false;
        return () => { if (released) throw new Error("double allocation release"); released = true; e.used -= bytes; };
      },
      withGit: async read => { check(); if (this.gitChildren >= this.budgets.maxGitChildren) throw new Error("Git child budget exhausted"); this.gitChildren++; try { return await read(); } finally { this.gitChildren--; } },
      readFile: async (statSize,read) => {
        check();
        if (!Number.isSafeInteger(statSize) || statSize<0 || statSize>this.budgets.maxFileSizeBytes) throw new Error("excluded_oversize");
        const allowance=statSize+this.budgets.readMarginBytes;
        const free=this.permit(e).hold(allowance);
        try {
          const result=await read(allowance);
          if (!Number.isSafeInteger(result.bytesRead) || result.bytesRead<0 || result.bytesRead>allowance) throw new Error("unstable streamed read");
          check();return result.value;
        } finally { free(); }
      },
    };
  }
  private notify(e: Entry, result: ExecutionResult): void { const resolve = e.resolve; if (resolve) { e.resolve = undefined; this.consumers--; resolve(result); } }
  private retire(e: Entry, result: ExecutionResult): void {
    if (e.used !== this.descriptorBytes(e.item)) { e.state="paused"; e.quarantined=true; this.notify(e,{ok:false,reason:"quarantined"}); return; }
    this.entries.delete(e.item.id); this.bytes -= e.item.bytes; this.notify(e,result);
    if (result.ok || result.reason==="superseded" || result.reason==="fenced" && !e.persisted) this.durableUsed--; else this.durableParked++;
  }
  private park(e: Entry, reason: string): void {
    try { if(this.ports.validateToken(e.item.fencingToken))this.ports.park(e.item,reason,e.attempts); } catch { reason="durable parking failed"; }
    e.state = "paused"; this.notify(e,{ ok:false,reason:"cancelled" });
  }
  private launch(e: Entry): void {
    e.state = "active"; this.active++; this.scopeActive.set(e.item.scopeId,(this.scopeActive.get(e.item.scopeId) ?? 0)+1);
    this.maxActive = Math.max(this.maxActive,this.active);
    const cancelDeadline = this.ports.clock.schedule(this.budgets.attemptDeadlineMs,() => { if(e.state==="active")this.cancelOperation(e.item.id); });
    void this.attempt(e).finally(() => {
      cancelDeadline(); e.cancelTimer?.();
      this.active--; const count = this.scopeActive.get(e.item.scopeId)! - 1;
      if (count) this.scopeActive.set(e.item.scopeId,count); else this.scopeActive.delete(e.item.scopeId);
      if (!count) { this.quiescence.get(e.item.scopeId)?.resolve(); this.quiescence.delete(e.item.scopeId); }
      this.wake();
    });
  }
  private async attempt(e: Entry): Promise<void> {
    if (e.cancelled) { this.park(e,"cancelled before dispatch"); return; }
    if (!this.ports.validateToken(e.item.fencingToken)) { this.retire(e,{ok:false,reason:"fenced"}); return; }
    if (e.receipt) { this.retire(e,{ok:true,receiptId:e.receipt}); return; }
    if(e.attempts>this.budgets.maxRetries){this.park(e,"durable retry budget exhausted");this.retire(e,{ok:false,reason:"failed"});return;}
    let outcome: TaskOutcome;
    e.attempts++;
    try {
      this.ports.writeProgress(e.item,{attempts:e.attempts});e.persisted=true;
      outcome = await (e.worker ? e.worker(this.permit(e)) : this.ports.sink.deliver(e.item.id,e.item.fencingToken,this.permit(e)));
      if(outcome.ok || outcome.superseded){
        if(!this.ports.validateToken(e.item.fencingToken))throw new Error("FENCING_REJECTED");
        this.ports.writeProgress(e.item,{attempts:e.attempts,receiptId:outcome.ok?outcome.receiptId:`superseded:${e.item.id}`});
      }
    }
    catch (error) { outcome = { ok:false,retryable:false,fenced: /FENCING/.test(String(error)) }; }
    if (outcome.ok && !outcome.receiptId) outcome={ok:false,retryable:false};
    if (outcome.ok) {
      e.receipt = outcome.receiptId;
      if (e.cancelled) { this.park(e,"acknowledged after cancellation"); return; }
      if (e.item.priority === "interactive") this.deliveredInteractive++; else this.deliveredBackfill++;
      this.retire(e,{ok:true,receiptId:outcome.receiptId}); return;
    }
    if (outcome.fenced) { this.retire(e,{ok:false,reason:"fenced"}); return; }
    if (e.cancelled) { this.park(e,"cancelled attempt"); return; }
    if (outcome.superseded) { this.retire(e,{ok:false,reason:"superseded"}); return; }
    if (!outcome.retryable || e.attempts > this.budgets.maxRetries) {
      if (!this.ports.validateToken(e.item.fencingToken)) { this.retire(e,{ok:false,reason:"fenced"}); return; }
      try { this.ports.park(e.item,"failure",e.attempts); } catch { this.park(e,"durable failure receipt rejected"); return; }
      this.failedTotal++;
      if (this.diagnostics.length === this.budgets.maxFailedKept) this.diagnostics.shift(); this.diagnostics.push(e.item.id.slice(0,64));
      this.retire(e,{ok:false,reason:"failed"}); return;
    }
    this.retries++; e.state = "backoff";
    const supplied = outcome.retryAfterMs;
    const delay = Math.min(this.budgets.maxBackoffMs, supplied !== undefined && Number.isFinite(supplied) && supplied >= 0 ? supplied : this.budgets.retryBaseMs * 2 ** (e.attempts-1));
    // The timer has no reference to siblings; backoff retains its own descriptor and reservation.
    void Promise.resolve().then(()=>this.ports.sleep(delay,e.controller.signal)).then(() => {
      if (e.cancelled) this.park(e,"cancelled backoff"); else { e.state = "queued"; this.queues[e.item.priority].push(e); }
    }, () => this.park(e,"interrupted backoff")).finally(() => this.wake());
  }
  cancelOperation(id: string): void {
    const e = this.entries.get(id); if (!e || e.cancelled) return;
    e.cancelled = true; e.controller.abort();
    if (e.state === "queued") { const q = this.queues[e.item.priority]; q.splice(q.indexOf(e),1); this.park(e,"cancelled queue"); }
    if (e.state === "active") {
      e.cancelTimer = this.ports.clock.schedule(this.budgets.cancellationDeadlineMs,() => { e.quarantined = true; this.notify(e,{ok:false,reason:"quarantined"}); this.wake(); });
    }
    this.wake();
  }
  resume(id: string): boolean {
    const e = this.entries.get(id); if (!e || e.state !== "paused") return false;
    // A cancelled port must be quiescent before a replacement attempt; callbacks/attempts stay intact.
    if ((this.scopeActive.get(e.item.scopeId) ?? 0) > 0) return false;
    Object.assign(e,{ controller: new AbortController(),cancelled:false,quarantined:false,state:"queued" });
    this.queues[e.item.priority].push(e); this.wake(); return true;
  }
  discardPaused(id: string): boolean {
    const e = this.entries.get(id); if (!e || e.state !== "paused") return false;
    if ((this.scopeActive.get(e.item.scopeId) ?? 0) > 0) return false;
    const valid=this.ports.validateToken(e.item.fencingToken);
    try { if(valid)this.ports.park(e.item,"durable handoff",e.attempts); } catch { return false; }
    this.retire(e,{ok:false,reason:valid?"cancelled":"fenced"}); this.wake(); return !this.entries.has(id);
  }
  run(): Promise<SchedulerStats> {
    if (!this.flight) this.flight = new Promise(r => { this.finishRun = r; });
    const flight = this.flight; this.wake(); return flight;
  }
  quiesceScope(scope: string): Promise<void> {
    if (!this.scopeActive.has(scope)) return Promise.resolve();
    let waiter = this.quiescence.get(scope);
    if (!waiter) {
      let resolve!: () => void;
      const promise = new Promise<void>(r => { resolve = r; });
      waiter = { promise, resolve }; this.quiescence.set(scope,waiter);
    }
    return waiter.promise;
  }
  /** Host supplies the count only after durable backlog receipts are discharged. */
  acknowledgeBacklog(count: number): void {
    if (!Number.isSafeInteger(count) || count<1 || count>this.durableParked) throw new Error("invalid durable backlog acknowledgement");
    this.durableParked-=count; this.durableUsed-=count;
  }
  /** Long-lived watcher/coverage allocations use the same byte and item ledger. */
  retain(bytes: number, operationBytes=0): () => void {
    const working=Math.max(operationBytes,...this.residentWork.values());
    if (!Number.isSafeInteger(bytes) || bytes<1 || !Number.isSafeInteger(operationBytes) || operationBytes<0 || this.bytes+bytes+working>this.budgets.maxPendingBytes-this.budgets.backfillReserveBytes || this.entries.size+this.residents.size>=this.budgets.maxPendingPaths-1) throw new Error("resident allocation budget exhausted or infeasible producer headroom");
    const id=++this.residentSequence;this.residents.set(id,bytes);this.bytes+=bytes;
    this.residentWork.set(id,operationBytes);
    this.maxBytes=Math.max(this.maxBytes,this.bytes);
    return ()=>{if(!this.residents.delete(id))throw new Error("double resident release");this.residentWork.delete(id);this.bytes-=bytes;};
  }
  private stats(): SchedulerStats { return { deliveredInteractive:this.deliveredInteractive,deliveredBackfill:this.deliveredBackfill,retries:this.retries,failed:[...this.diagnostics],failedTotal:this.failedTotal,cancelled:[...this.entries.values()].some(e=>e.cancelled),maxObservedQueue:this.maxQueue,maxObservedBytes:this.maxBytes,maxObservedConcurrency:this.maxActive }; }
  lastStats(): SchedulerStats | undefined { return this.last; }
  pendingCount(): number { return this.queues.interactive.length+this.queues.backfill.length; }
  pendingBytes(): number { return [...this.queues.interactive,...this.queues.backfill].reduce((n,e)=>n+e.item.bytes,0); }
  overflowCount(): number { return this.overflow; }
  ledgerSnapshot() {
    const residentBytes=[...this.residents.values()].reduce((n,b)=>n+b,0);
    return { retainedResults:[...this.entries.values()].filter(e=>e.receipt).length,registeredCallbacks:[...this.entries.values()].filter(e=>e.worker).length,registeredConsumers:this.consumers,retainedDiagnostics:this.diagnostics.length,activeOperations:this.active,reservedBytes:this.bytes,residentBytes,workReservedBytes:this.bytes-residentBytes,reservations:this.entries.size+this.residents.size,durableUsed:this.durableUsed,durableParked:this.durableParked,gitChildren:this.gitChildren,heldAllocations:[...this.entries.values()].reduce((n,e)=>n+e.used-this.descriptorBytes(e.item),0),quarantined:[...this.entries.values()].filter(e=>e.quarantined).length,gcWeakRefCoverage:"not covered" as const };
  }
}
