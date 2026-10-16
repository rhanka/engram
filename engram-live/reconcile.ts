// L6b producer only. Real atomic fencing/incarnation belong to L3a/L3b-S.
import { createHash } from "node:crypto";
import { COVERAGE_AXES, type LiveScope } from "./contracts.js";
import { validateScopeFencingToken, type ScopeFencingTokenDto } from "./integration.js";
import { allCurrent, certifyAxis, initialCoverage, invalidateAxes, markAxis, sourceVectorsEqual, type AxisState, type CoverageMap, type SourceVector } from "./coverage.js";
import { Scheduler, type ProducerPermit, type SchedulerStats, type WorkPriority } from "./scheduler.js";
import type { InvalidationSignal, WatchHub } from "./watch.js";
export type ScopeFencingToken = ScopeFencingTokenDto;
export interface CollectOptions {
  readonly fencingToken: ScopeFencingToken;
  readonly resources: ProducerPermit;
  readonly pageId: string;
  readonly pageDigest: string;
  readonly deletedPaths: readonly string[];
}
export interface CollectedBatch { readonly collected: readonly string[]; readonly complete: boolean; readonly receiptId: string; readonly unstable?: boolean }
export interface DiscoveryEntry { readonly path: string; readonly statSize: number; readonly contentFingerprint: string }
export interface DiscoveryLimits { readonly maxCount: number; readonly maxBytes: number }
export interface DiscoveryPage {
  readonly entries: readonly DiscoveryEntry[];
  readonly deletedPaths: readonly string[];
  readonly nextCursor: string | undefined;
  readonly done: boolean;
  readonly complete: boolean;
}
export interface SourceValidationReport {
  readonly valid: boolean;
  /** Verifies durable facts, deletions and dependent relations, not just source markers. */
  readonly projectionMatches: boolean;
  readonly sourceVector: SourceVector;
  readonly validatedAt: number;
  readonly axes: Readonly<Record<string, { readonly complete: boolean; readonly state?: Exclude<AxisState,"current">; readonly reason?: string }>>;
}
export interface PublishGenerationRequest {
  readonly generationId: string;
  readonly expectedIncarnation: string;
  readonly sourceVector: SourceVector;
  readonly checkpoint: string;
}
export interface PublishGenerationReport { readonly published: boolean; readonly generationId: string; readonly incarnation: string; readonly receiptId: string }
export interface ReconcileScan {
  /** Required streaming discovery: no materialize-then-slice alternative. */
  discoverPage(cursor: string | undefined, limits: DiscoveryLimits, options: CollectOptions): Promise<DiscoveryPage>;
  collectPaths(paths: readonly string[], options: CollectOptions): Promise<CollectedBatch>;
  repairRelations(paths: readonly string[], deletedPaths: readonly string[], options: CollectOptions): Promise<{ readonly complete: boolean; readonly receiptId: string }>;
  validateSource(expected: SourceVector, options: CollectOptions): Promise<SourceValidationReport>;
  publishGeneration(request: PublishGenerationRequest, options: CollectOptions): Promise<PublishGenerationReport>;
  /** Bounded cached fingerprint only: no Git/filesystem I/O. validateSource refreshes it under the permit. */
  currentSourceVector(resources: ProducerPermit): SourceVector;
  /** Cached content/deletion proof for one path; refreshed by the receiving collector. No I/O. */
  pathFingerprint(path: string, resources: ProducerPermit): string;
}
export interface MarkerStore {
  get(key: string): string | undefined;
  set(key: string, value: string, token: ScopeFencingToken): void;
  delete(key: string, token: ScopeFencingToken): void;
  incarnation(): string;
  hasGeneration(incarnation: string, generationId: string): boolean;
}
export interface WriterRequest { readonly scope: LiveScope; readonly minEpoch: number; readonly declarationRevision: number; readonly projectionIncarnation: string }
export interface WriterAuthority {
  acquire(request: WriterRequest): Promise<ScopeFencingToken | undefined>;
  renew(token: ScopeFencingToken): Promise<ScopeFencingToken | undefined>;
  validate(token: ScopeFencingToken): boolean;
  /** Synchronously revokes every receiving write/publication using this lease, before returning. */
  revoke(token: ScopeFencingToken): void;
  release(token: ScopeFencingToken): Promise<void>;
}
export interface ReconcileBudgets {
  readonly maxRounds: number;
  readonly collectPageSize: number;
  readonly maxPagesPerRound: number;
  readonly operationBytes: number;
  readonly maxDeltaPaths: number;
  readonly pollIntervalMs: number;
}
export interface ReconcilerPorts {
  readonly scope: LiveScope;
  readonly declarationRevision: number;
  readonly hub: WatchHub;
  readonly scan: ReconcileScan;
  readonly pollRefs: (options: CollectOptions) => Promise<readonly { readonly ref: string; readonly oid: string }[]>;
  readonly clock: { now(): number; schedule(ms: number, callback: () => void): () => void };
  readonly store: MarkerStore;
  readonly budgets: ReconcileBudgets;
  readonly writer: WriterAuthority;
  readonly scheduler: Scheduler;
}
export type ReconcilePhase = "bootstrap" | "scan" | "reconcile" | "current" | "degraded" | "shutdown";
interface Pass { readonly id: string; readonly start: number; readonly unknown: number; readonly overflow: number; readonly incarnation: string; vector: SourceVector; cursor: string | undefined }
interface Gate { refs: number; tail: Promise<void> }
const gates = new WeakMap<Scheduler,Map<string,Gate>>();
function scopeKey(s: LiveScope): string { return JSON.stringify([s.tenant,s.clone,s.worktree]); }
function digest(s: string): string { return createHash("sha256").update(s).digest("hex"); }
export class Reconciler {
  private readonly key: string;
  private readonly budgets: ReconcileBudgets;
  private readonly gate: Gate;
  private readonly detach: () => void;
  private readonly releaseResident: () => void;
  private map: CoverageMap;
  private state: "starting" | "running" | "stopping" | "stopped" = "starting";
  private reason?: string;
  private token?: ScopeFencingToken;
  private heldToken?: ScopeFencingToken;
  private minimumEpoch = 1;
  private doubt = 0; private unknown = 0; private lifecycleEpoch = 0;
  private readonly deltas = new Map<string,number>();
  private needsFull = true;
  private pass?: Pass;
  private baseStart = 0;
  private dataVector?: SourceVector;
  private dataIncarnation?: string;
  private generation?: string;
  private generationVector?: SourceVector;
  private sequence = 0; private activity = 0;
  private flight?: Promise<boolean>;
  private haltDrive = false;
  private stopping?: Promise<void>;
  private cancelTimer?: () => void;
  private readonly operations = new Set<string>();
  constructor(private readonly ports: ReconcilerPorts) {
    this.budgets=Object.freeze({...ports.budgets});
    if (!ports.writer || !ports.scheduler || !ports.scope || !ports.store || !ports.scan || !ports.clock.schedule) throw new Error("required authority, proof, clock and global budget ports");
    if(ports.hub.scheduler!==ports.scheduler)throw new Error("all live producers must share one budget manager");
    for (const name of ["discoverPage","collectPaths","repairRelations","validateSource","publishGeneration","currentSourceVector","pathFingerprint"] as const) if (typeof ports.scan[name] !== "function") throw new Error(`required proof/producer port: ${name}`);
    for (const name of ["incarnation","hasGeneration","set","delete"] as const) if (typeof ports.store[name] !== "function") throw new Error(`required storage proof port: ${name}`);
    for (const name of ["acquire","renew","validate","revoke","release"] as const) if (typeof ports.writer[name] !== "function") throw new Error(`required writer port: ${name}`);
    for (const name of ["maxRounds","collectPageSize","maxPagesPerRound","operationBytes","maxDeltaPaths","pollIntervalMs"] as const) if (!Number.isSafeInteger(this.budgets[name]) || this.budgets[name] < 1) throw new Error(`required reconcile budget: ${name}`);
    if (this.budgets.operationBytes > ports.scheduler.budgets.backfillReserveBytes || this.budgets.maxDeltaPaths > ports.scheduler.budgets.maxPendingPaths || this.budgets.pollIntervalMs > 10000) throw new Error("infeasible producer allowance or polling interval");
    this.key = scopeKey(ports.scope);
    let managerGates = gates.get(ports.scheduler); if (!managerGates) { managerGates = new Map(); gates.set(ports.scheduler,managerGates); }
    if ([...managerGates.values()].reduce((n,g)=>n+g.refs,0) >= ports.scheduler.budgets.maxPendingPaths) throw new Error("scope registration budget exceeded");
    this.releaseResident=ports.scheduler.retain(4096+this.budgets.maxDeltaPaths*(ports.scheduler.budgets.maxPathBytes*4+256)*COVERAGE_AXES.length*3,this.budgets.operationBytes);
    this.gate = managerGates.get(this.key) ?? { refs:0,tail:Promise.resolve() }; this.gate.refs++; managerGates.set(this.key,this.gate);
    this.map = initialCoverage([...COVERAGE_AXES],ports.clock.now());
    try { this.detach = ports.hub.onInvalidation(s => this.invalidate(s)); }
    catch(error) {this.gate.refs--;if(!this.gate.refs)managerGates.delete(this.key);this.releaseResident();throw error;}
  }
  lifecycle(): string { return this.state; }
  phase(): ReconcilePhase { return this.state === "stopped" || this.state === "stopping" ? "shutdown" : allCurrent(this.map) ? "current" : this.reason ? "degraded" : this.state === "starting" ? "bootstrap" : "reconcile"; }
  phaseSnapshot(): ReconcilePhase { return this.phase(); }
  coverage(): CoverageMap { return this.map; }
  degradedReason(): string | undefined { return this.reason; }
  activityCount(): number { return this.activity; }
  schedulerStats(): SchedulerStats | undefined { return this.ports.scheduler.lastStats(); }
  retentionSnapshot() { return { deltas:this.deltas.size,dischargedDeltas:0,operations:this.operations.size,pass:this.pass ? 1:0 }; }
  private mark(state: Exclude<AxisState,"current">, reason: string): void {
    for (const axis of Object.keys(this.map.axes)) this.map = markAxis(this.map,axis,state,reason,this.ports.clock.now());
  }
  private unknownDoubt(reason: string): void {
    this.unknown = ++this.doubt; this.needsFull = true; this.pass = undefined; this.deltas.clear();
    this.map = invalidateAxes(this.map,[...COVERAGE_AXES],this.doubt,reason,this.ports.clock.now());
  }
  private invalidate(signal: InvalidationSignal): void {
    if (this.state === "stopping" || this.state === "stopped") return;
    if ((signal.kind === "change" || signal.kind === "delete") && !signal.overflowed && signal.paths.length <= this.budgets.maxDeltaPaths && signal.paths.every(p=>Buffer.byteLength(p)<=this.ports.scheduler.budgets.maxPathBytes)) {
      const seq = ++this.doubt;
      for (const path of signal.paths) this.deltas.set(path,seq);
      if (this.deltas.size > this.budgets.maxDeltaPaths) this.unknownDoubt("delta impact overflow");
      else this.map = invalidateAxes(this.map,signal.axes?.length ? signal.axes : [...COVERAGE_AXES],seq,"known path doubt",signal.at,{deltaPaths:signal.paths,maxDeltaPathsPerAxis:this.budgets.maxDeltaPaths});
    } else this.unknownDoubt(`watch ${signal.kind}`);
  }
  private live(): boolean { return this.state !== "stopped" && this.state !== "stopping"; }
  private valid(token = this.token): token is ScopeFencingToken {
    return token !== undefined && validateScopeFencingToken(token,this.ports.scope,this.ports.store.incarnation(),this.ports.clock.now()).ok && token.declarationRevision === this.ports.declarationRevision && token.epoch >= this.minimumEpoch && this.ports.writer.validate(token);
  }
  private async acquire(): Promise<boolean> {
    if (!this.live()) return false;
    const writer = this.ports.writer;
    let next: ScopeFencingToken | undefined;
    if (this.valid()) {
      const token = this.token!;
      if (this.ports.clock.now() < token.expiresAt - (token.expiresAt-token.issuedAt)/5) return true;
      next = await writer.renew(token);
    } else next = await writer.acquire({ scope:this.ports.scope,minEpoch:this.minimumEpoch,declarationRevision:this.ports.declarationRevision,projectionIncarnation:this.ports.store.incarnation() });
    if (!this.live()) { if (next) {writer.revoke(next);await writer.release(next);} return false; }
    if (!this.valid(next)) { this.token = undefined; this.reason = "writer authority acquisition/renewal denied"; this.mark("degraded",this.reason); return false; }
    this.token = next; this.heldToken=next; return true;
  }
  private async unit<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.gate.tail; let release!: () => void;
    this.gate.tail = new Promise(r => { release = r; });
    await previous;
    try { if (!this.live() || !this.valid()) throw new Error("FENCING_REJECTED or stopped"); return await operation(); } finally { release(); }
  }
  private options(resources: ProducerPermit, pageId: string, pageDigest = pageId, deletedPaths: readonly string[] = []): CollectOptions {
    resources.check(); if (!this.live() || !this.valid()) throw new Error("FENCING_REJECTED or stopped");
    return {fencingToken:this.token!,resources,pageId,pageDigest,deletedPaths};
  }
  private generationExists(incarnation:string,generation:string): boolean { return this.ports.store.hasGeneration(incarnation,generation); }
  private capture(resources: ProducerPermit): SourceVector {
    const vector=this.ports.scan.currentSourceVector(resources);
    for(const key of ["refsFingerprint","headOid","indexFingerprint","pathMembershipFingerprint","contentFingerprint","configAttributesFingerprint"] as const)if(typeof vector[key]!=="string" || !vector[key].length || vector[key].length>1024)throw new Error("bounded source proof required");
    return Object.freeze({refsFingerprint:vector.refsFingerprint,headOid:vector.headOid,indexFingerprint:vector.indexFingerprint,pathMembershipFingerprint:vector.pathMembershipFingerprint,contentFingerprint:vector.contentFingerprint,configAttributesFingerprint:vector.configAttributesFingerprint,lockStateValid:vector.lockStateValid});
  }
  private checkpoint(value: string, resources: ProducerPermit): void {
    this.options(resources,"checkpoint"); this.ports.store.set("live-checkpoint",value,this.token!);
  }
  private leaseIdentity(): string { return digest(JSON.stringify([this.key,this.token!.epoch,this.token!.epochId])); }
  private async work(epoch: number, priority: WorkPriority, operation: (resources: ProducerPermit) => Promise<boolean>, bytes=this.budgets.operationBytes): Promise<boolean> {
    if (!this.live() || epoch!==this.lifecycleEpoch || !(await this.acquire()) || !this.live() || epoch!==this.lifecycleEpoch) return false;
    const id = `operation:${this.leaseIdentity()}:${++this.sequence}`; this.operations.add(id);
    const outcome = await this.ports.scheduler.execute({id,scopeId:this.key,priority,bytes,fencingToken:this.token!,idempotencyDigest:digest(id)},async resources => {
      if(!this.live() || epoch!==this.lifecycleEpoch)return {ok:false,retryable:false,superseded:true};
      const ok = await operation(resources); return ok ? {ok:true,receiptId:`operation:${id}`} : {ok:false,retryable:false,superseded:true};
    });
    this.operations.delete(id);
    if (!this.live() || epoch!==this.lifecycleEpoch) return false;
    // Capacity is temporary admission pressure; only terminal execution failures stop this drive.
    if (!outcome.ok) { this.haltDrive=outcome.reason!=="superseded" && outcome.reason!=="capacity"; this.reason = outcome.reason; this.mark(outcome.reason === "fenced" ? "degraded":"partial",outcome.reason); }
    return outcome.ok;
  }
  private schedule(): void {
    if (this.cancelTimer || !this.live()) return;
    this.cancelTimer = this.ports.clock.schedule(this.budgets.pollIntervalMs,() => {
      this.cancelTimer = undefined;
      if (!this.live()) return;
      void this.drive(this.budgets.maxRounds,true).finally(()=>this.schedule());
    });
  }
  async bootstrap(): Promise<void> { this.schedule(); await this.drive(); }
  reconcileRound(): Promise<{converged:boolean;degraded:boolean}> {
    return this.drive(1).then(converged=>({converged,degraded:!converged && !!this.reason}));
  }
  converge(): Promise<{converged:boolean;rounds:number}> { return this.drive().then(converged=>({converged,rounds:this.budgets.maxRounds})); }
  private drive(rounds = this.budgets.maxRounds, periodic=false): Promise<boolean> {
    if (!this.live()) return Promise.resolve(false);
    if (this.flight) return this.flight;
    // Synchronous invalidation precedes every awaited observation or producer call.
    if(!periodic)this.mark("pending","reconciliation in progress");
    const epoch=this.lifecycleEpoch;
    this.haltDrive=false;
    this.flight = Promise.resolve().then(async () => {
      try {
        if(!this.live() || epoch!==this.lifecycleEpoch)return false;
        if (!this.ports.hub.isReady()) { this.reason = "watch not ready"; this.mark("degraded",this.reason); return false; }
        if(this.state==="starting")this.state = "running";
        for (let i=0;i<rounds && this.live() && epoch===this.lifecycleEpoch && !this.haltDrive;i++) if (await this.round(epoch)) return true;
        return false;
      } catch (error) { this.reason = String(error).slice(0,1024); this.mark("degraded",this.reason); this.unknownDoubt(this.reason); return false; }
      finally { this.flight = undefined; }
    });
    return this.flight;
  }
  private async round(epoch: number): Promise<boolean> {
    const {hub,scan,store} = this.ports;const budgets=this.budgets;
    if (this.dataIncarnation && this.dataIncarnation !== store.incarnation()) this.unknownDoubt("storage incarnation replaced");
    if (this.generation && !this.generationExists(store.incarnation(),this.generation)) { this.generation=undefined; this.unknownDoubt("published generation lost"); }
    hub.consumeFlags();
    // Polling observes refs independently; changed refs require data, not marker updates.
    const observed = await this.work(epoch,"interactive",async resources => {
      const before = this.capture(resources);
      await this.ports.pollRefs(this.options(resources,"refs"));
      resources.check();
      if (this.dataVector && this.dataVector.refsFingerprint !== before.refsFingerprint) this.unknownDoubt("refs changed");
      return true;
    },Math.min(budgets.operationBytes,65536));
    if (!observed || !this.live() || epoch!==this.lifecycleEpoch) return false;
    if (!(await this.collectDeltas(epoch))) return false;
    if (this.needsFull) {
      for (let page=0;page<budgets.maxPagesPerRound && this.needsFull;page++) {
        const ok = await this.work(epoch,"backfill",async resources => {
          if (!this.pass) this.pass = {id:`scan:${this.leaseIdentity()}:${this.sequence}`,start:++this.doubt,unknown:this.unknown,overflow:hub.overflowSeq(),incarnation:store.incarnation(),vector:this.capture(resources),cursor:undefined};
          const pass = this.pass;
          const releaseDiscovery = resources.hold(this.ports.scheduler.budgets.maxDiscoveryBytes);
          try {
            const options = this.options(resources,`${pass.id}:${pass.cursor ?? "start"}`);
            const discovered = await hub.runScanPhase(()=>scan.discoverPage(pass.cursor,{maxCount:budgets.collectPageSize,maxBytes:this.ports.scheduler.budgets.maxDiscoveryBytes},options));
            const serialized = Buffer.byteLength(JSON.stringify(discovered),"utf8");
            if (serialized > this.ports.scheduler.budgets.maxDiscoveryBytes || discovered.entries.length+discovered.deletedPaths.length > budgets.collectPageSize || discovered.entries.some(e=>Buffer.byteLength(e.path)>this.ports.scheduler.budgets.maxPathBytes) || (discovered.nextCursor?.length??0)>1024 || !discovered.complete || (!discovered.done && (!discovered.nextCursor || discovered.nextCursor === pass.cursor))) { this.mark("partial","invalid/incomplete bounded discovery"); return false; }
            const paths = discovered.entries.map(e=>e.path);
            const pageDigest = digest(JSON.stringify([discovered.entries,discovered.deletedPaths]));
            const pageId = `${options.pageId}:${pageDigest}`;
            const receipt = await this.unit(async () => {
              const opts = this.options(resources,pageId,pageDigest,discovered.deletedPaths);
              let collected: CollectedBatch;
              try { collected = await scan.collectPaths(paths,opts); }
              catch(error){if(/CONFLICTING_PAGE_REPLAY/.test(String(error))){this.unknownDoubt("conflicting full-page replay");return false;}throw error;}
              if (!collected.complete || !collected.receiptId) { this.mark(collected.unstable ? "unstable":"partial","incomplete capture"); return false; }
              const repaired = await scan.repairRelations(paths,discovered.deletedPaths,this.options(resources,`${pageId}:relations`,pageDigest,discovered.deletedPaths));
              if (!repaired.complete || !repaired.receiptId) return false;
              if (!this.live() || !this.valid() || this.pass !== pass || pass.incarnation !== store.incarnation()) return false;
              this.checkpoint(JSON.stringify({scan:pass.id,cursor:discovered.nextCursor,source:pass.vector,receipt:collected.receiptId,incarnation:pass.incarnation}),resources);
              pass.cursor = discovered.nextCursor; this.activity++;
              return true;
            });
            if (!receipt || this.pass !== pass) return false;
            if (discovered.done) {
              if (pass.unknown !== this.unknown) return false;
              this.baseStart = pass.start; this.dataVector = pass.vector; this.dataIncarnation=pass.incarnation;
              this.pass=undefined; this.needsFull=false;
              hub.acknowledgeOverflow(pass.overflow);
              if (hub.overflowed()) { this.unknownDoubt("new overflow during discovery"); return false; }
            }
            return true;
          } finally { releaseDiscovery(); }
        });
        if (!ok || !this.live() || epoch!==this.lifecycleEpoch) return false;
      }
      if (this.needsFull) return false; // Cursor and scan identity survive ordinary yields.
    }
    if (this.deltas.size || this.needsFull || !this.dataVector) return false;
    // Hub paths are an acceleration cache. The bounded doubt map/base owns completion.
    hub.takePending();
    const guardDoubt = this.doubt;
    const expected = this.dataVector, incarnation=this.dataIncarnation;
    const certified = await this.work(epoch,"interactive",resources=>this.unit(async()=>{
      const unchanged = () => this.live() && this.lifecycleEpoch === epoch && this.doubt === guardDoubt && !this.needsFull && this.deltas.size===0 && !hub.overflowed() && hub.pendingCount()===0 && this.valid() && store.incarnation()===incarnation;
      const options = this.options(resources,`publish:${this.leaseIdentity()}:${this.sequence}`);
      const validationStart=this.ports.clock.now();
      const validation = await scan.validateSource(expected,options);
      if (!unchanged()) return false;
      if (!validation.valid || !validation.projectionMatches || !Number.isFinite(validation.validatedAt) || validation.validatedAt<validationStart || validation.validatedAt>this.ports.clock.now() || !sourceVectorsEqual(expected,validation.sourceVector)) { this.unknownDoubt("source/data proof changed"); return false; }
      // The closing poll is guarded too. Its new vector can never replace collected evidence.
      await this.ports.pollRefs(this.options(resources,`${options.pageId}:closing-refs`));
      if (!unchanged() || !sourceVectorsEqual(expected,this.capture(resources))) { this.unknownDoubt("final source observation changed"); return false; }
      let generation=this.generation;
      if (!generation || !this.generationVector || !sourceVectorsEqual(expected,this.generationVector) || !this.generationExists(incarnation!,generation)) {
        generation=`generation:${this.leaseIdentity()}:${this.sequence}`;
        const checkpoint=store.get("live-checkpoint"); if (!checkpoint) return false;
        const publication = await scan.publishGeneration({generationId:generation,expectedIncarnation:incarnation!,sourceVector:expected,checkpoint},this.options(resources,options.pageId));
        if (!unchanged() || !publication.published || !publication.receiptId || publication.incarnation!==incarnation || publication.generationId!==generation) return false;
        this.generation=generation;
        this.generationVector=expected;
      }
      if (!unchanged() || !this.generationExists(incarnation!,generation) || !sourceVectorsEqual(expected,this.capture(resources))) return false;
      // Certification point: guard and state update are synchronous, with no intervening await.
      const currentSourceVector=this.capture(resources);
      if(!unchanged())return false;
      const next: Record<string,CoverageMap["axes"][string]>={};
      for (const [axis,report] of Object.entries(this.map.axes)) {
        const proof=validation.axes[axis];
        next[axis]=certifyAxis({...report,pendingDeltas:{},dischargedDeltas:{}},{axis,sourceVector:expected,publishedGenerationId:generation,storageIncarnation:incarnation!,reconcileStartSeq:this.baseStart,reconcileEndSeq:this.doubt,complete:proof?.complete===true,stableSource:true,observedAt:validation.validatedAt,dischargedDeltas:{}},{currentSourceVector,activeStorageIncarnation:store.incarnation(),publishedGenerations:new Set(this.generationExists(incarnation!,generation)?[generation]:[]),unknownDoubtSeq:this.unknown,hasOverflow:hub.overflowed(),hasExcludedPaths:false,hasFailedTasks:false,hasPendingReconcile:this.needsFull||this.deltas.size>0,writerTokenValid:this.valid(),pendingDeltas:{}});
        if(proof && !proof.complete && proof.state && ["unknown","pending","backfill","stale","partial","unstable","degraded","auth_required","unavailable"].includes(proof.state)) next[axis]={...next[axis]!,state:proof.state,reason:proof.reason?.slice(0,1024)??next[axis]!.reason};
      }
      if(!unchanged())return false;
      this.map={axes:next}; this.reason=undefined; hub.clearDegraded(); return true;
    }),Math.min(budgets.operationBytes,65536));
    return certified && allCurrent(this.map);
  }
  private async collectDeltas(epoch: number): Promise<boolean> {
    const {scan}=this.ports;const budgets=this.budgets;
    const pending = [...this.deltas.entries()].slice(0,budgets.collectPageSize);
    if (pending.length) {
      const ok = await this.work(epoch,"interactive",resources=>this.unit(async()=>{
        const vector = this.capture(resources); const paths = pending.map(([p])=>p);
        const fingerprints=paths.map(path=>{const value=scan.pathFingerprint(path,resources);if(typeof value!=="string"||!value.length||value.length>1024)throw new Error("bounded path proof required");return [path,value];});
        const pageDigest=digest(JSON.stringify(fingerprints));
        const id = `delta:${this.leaseIdentity()}:${digest(JSON.stringify([pending,pageDigest]))}`;
        let collected: CollectedBatch;
        try { collected = await scan.collectPaths(paths,this.options(resources,id,pageDigest)); }
        catch(error){if(/CONFLICTING_PAGE_REPLAY/.test(String(error))){this.unknownDoubt("conflicting delta replay");return false;}throw error;}
        if (!collected.complete || !collected.receiptId) return false;
        const repaired = await scan.repairRelations(paths,[],this.options(resources,`${id}:relations`,pageDigest));
        if (!repaired.complete || !repaired.receiptId) return false;
        this.checkpoint(JSON.stringify({delta:id,receipt:collected.receiptId,source:vector}),resources);
        for (const [path,seq] of pending) if (this.deltas.get(path) === seq) this.deltas.delete(path);
        if(this.pass)this.pass.vector=vector;else this.dataVector=vector; this.activity++; return true;
      }));
      if (!ok || !this.live() || epoch!==this.lifecycleEpoch) return false;
    }
    return true;
  }
  noteWriterTakeover(epoch: string): void {
    if (!this.live()) return;
    const value=Number(epoch.replace(/^epoch-/,"")); if (!Number.isSafeInteger(value)||value<1) throw new Error("invalid writer epoch");
    this.minimumEpoch=Math.max(this.minimumEpoch+1,value); this.token=undefined;
    this.unknownDoubt("writer conflict requires verified acquisition"); this.reason="writer conflict"; this.mark("degraded",this.reason);
  }
  async restart(): Promise<void> { if (!this.live()) return; this.unknownDoubt("restart reconciliation"); await this.drive(); }
  /** Explicit cancellation preserves durable receipts/cursor until the port is quiescent. */
  cancelReconciliation(): Promise<void> {
    this.lifecycleEpoch++;this.mark("pending","reconciliation cancelled; durable progress retained");
    const ids=[...this.operations];for(const id of ids)this.ports.scheduler.cancelOperation(id);
    return Promise.resolve(this.flight).then(()=>this.ports.scheduler.quiesceScope(this.key)).then(()=>{
      for(const id of ids)this.ports.scheduler.discardPaused(id);
      this.mark("pending","cancelled reconciliation awaits recovery");
    });
  }
  shutdown(): Promise<void> {
    if (this.stopping) return this.stopping;
    // Revoke at the receiver before waiting: already dispatched ports lose publication/write authority too.
    const token=this.heldToken;this.token=undefined;this.heldToken=undefined;
    this.state="stopping"; this.lifecycleEpoch++;
    if(token)this.ports.writer.revoke(token);
    this.mark("pending","shutdown requires reconciliation on takeover");
    this.cancelTimer?.(); this.cancelTimer=undefined; this.detach();
    const ids=[...this.operations];for (const id of ids) this.ports.scheduler.cancelOperation(id);
    this.stopping=(async()=>{
      await this.flight;
      await this.ports.scheduler.quiesceScope(this.key);
      for(const id of ids)this.ports.scheduler.discardPaused(id);
      try { if (token) await this.ports.writer.release(token); }
      finally {this.gate.refs--; if (!this.gate.refs) gates.get(this.ports.scheduler)!.delete(this.key);this.releaseResident();this.mark("pending","stopped; writer revoked");this.state="stopped";}
    })(); return this.stopping;
  }
}
