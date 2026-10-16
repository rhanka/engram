import { describe,it,expect } from "vitest";
import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNativeWatchHub } from "../engram-live/watch.js";
import { Scheduler, type WorkItem, type SchedulerPorts } from "../engram-live/scheduler.js";
import { createFakeClock,createSeededRandom,makeScheduler,testItem,testBudgets,createLiveRig,flush,runTraceProperty } from "./helpers/live-clock-watch.js";
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function itemDeadline<T>(promise:Promise<T>):Promise<T>{let settled=false;void promise.then(()=>{settled=true;},()=>{settled=true;});await flush();if(!settled)throw new Error("individual result blocked by global drainage");return promise;}

describe("live scheduler budget",()=>{
  it("fake sink backpressure bounds queue bytes concurrency and retries while both priorities advance",async()=>{
    const clock=createFakeClock();let active=0,max=0;const order:string[]=[];const attempts=new Map<string,number>();const delays:number[]=[];
    const scheduler=makeScheduler(clock,{sink:{deliver:async(id,_token,resources)=>{active++;max=Math.max(max,active);const free=resources.hold(512);try{await flush();order.push(id);const n=(attempts.get(id)??0)+1;attempts.set(id,n);return n===1?{ok:false,retryable:true,retryAfterMs:1e15}:{ok:true,receiptId:id};}finally{free();active--;}}},sleep:async ms=>{delays.push(ms);clock.advance(ms);}});
    for(let i=0;i<12;i++)expect(scheduler.enqueue(testItem(clock,`i${i}`))).toBe("queued");
    for(let i=0;i<12;i++)expect(scheduler.enqueue(testItem(clock,`b${i}`,{priority:"backfill"}))).toBe("queued");
    const stats=await scheduler.run();expect(stats.deliveredInteractive).toBe(12);expect(stats.deliveredBackfill).toBe(12);expect(max).toBeLessThanOrEqual(4);expect(delays.every(d=>d<=30000)).toBe(true);expect(stats.retries).toBe(24);
    expect(scheduler.ledgerSnapshot()).toMatchObject({workReservedBytes:0,activeOperations:0,registeredCallbacks:0,registeredConsumers:0,heldAllocations:0});
  });
  it("native Linux watch smoke observes a real filesystem change after readiness",async()=>{
    expect(process.platform).toBe("linux");const dir=mkdtempSync(join(tmpdir(),"l6b-watch-"));const hub=createNativeWatchHub(dir,createFakeClock(),{debounceMs:500,maxPendingPaths:16,scheduler:makeScheduler(createFakeClock())});
    try{await hub.bootstrap();writeFileSync(join(dir,"smoke.ts"),"export const x=1;");for(let i=0;i<100&&!hub.pendingCount();i++)await sleep(10);expect(hub.pendingPaths()).toContain(join(dir,"smoke.ts"));}finally{await hub.dispose();rmSync(dir,{recursive:true,force:true});}
  });
  it("rejects missing and infeasible finite limits before any producer runs",()=>{
    const clock=createFakeClock();for(const key of Object.keys(testBudgets()))expect(()=>makeScheduler(clock,{}, {[key]:undefined})).toThrow();
    expect(()=>makeScheduler(clock,{}, {maxGitChildren:5})).toThrow();expect(()=>makeScheduler(clock,{}, {maxActiveOperationsPerScope:4})).toThrow();
  });
});

describe("Sol author reproductions and generated classes C/D",()=>{
  it("n3 a revoked worker cannot park a durable failure even when it throws a generic error",async()=>{
    const clock=createFakeClock();let valid=true,parks=0;
    const scheduler=makeScheduler(clock,{validateToken:()=>valid,park:()=>{parks++;}});
    const result=await scheduler.execute(testItem(clock,"revoked-failure"),async()=>{valid=false;throw new Error("receiver failed");});
    expect(result).toEqual({ok:false,reason:"fenced"});expect(parks).toBe(0);await scheduler.run();
    expect(scheduler.lastStats()?.failedTotal).toBe(0);expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
    const ports=(makeScheduler(clock,{validateToken:()=>false}) as unknown as {ports:SchedulerPorts}).ports;
    expect(()=>ports.park(testItem(clock,"stale-park"),"failure",1)).toThrow(/FENCING_REJECTED/);
  });
  it("D1 attempt and cancellation deadlines use the injected clock and budgets cannot change after validation",async()=>{
    const clock=createFakeClock(),input=testBudgets({attemptDeadlineMs:20,cancellationDeadlineMs:5});
    const scheduler=new Scheduler((makeScheduler(clock) as unknown as {ports:SchedulerPorts}).ports,input);Object.assign(input,{maxConcurrency:999,attemptDeadlineMs:999});
    expect(scheduler.budgets.maxConcurrency).toBe(4);expect(Object.isFrozen(scheduler.budgets)).toBe(true);
    let release!:()=>void;const result=scheduler.execute(testItem(clock,"deadline"),async()=>{await new Promise<void>(r=>{release=r;});return {ok:true,receiptId:"late"};});
    await flush();clock.advance(19);expect(scheduler.ledgerSnapshot().quarantined).toBe(0);
    clock.advance(1);clock.advance(4);expect(scheduler.ledgerSnapshot().quarantined).toBe(0);
    clock.advance(1);expect(await result).toEqual({ok:false,reason:"quarantined"});
    release();await flush();expect(scheduler.discardPaused("deadline")).toBe(true);expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
  });
  it("C4 one scope cannot consume the active permits reserved for its neighbors",async()=>{
    const clock=createFakeClock(),started:string[]=[],releases:(()=>void)[]=[];
    const scheduler=makeScheduler(clock,{sink:{deliver:async id=>{started.push(id);await new Promise<void>(r=>{releases.push(r);});return {ok:true,receiptId:id};}}});
    for(let i=0;i<4;i++)scheduler.enqueue(testItem(clock,`same${i}`,{scopeId:"same"}));
    scheduler.enqueue(testItem(clock,"neighbor",{scopeId:"neighbor"}));await flush();
    expect(started).toEqual(["same0","neighbor"]);
    for(let i=0;i<4;i++){for(const release of releases.splice(0))release();await flush();}
    await scheduler.run();expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
  });
  it("D1 a paused acknowledgement cannot resume until the original attempt is quiescent",async()=>{
    const clock=createFakeClock(),scheduler=makeScheduler(clock),item=testItem(clock,"quiescent");
    const result=scheduler.execute(item,async()=>{scheduler.cancelOperation(item.id);return {ok:true,receiptId:"done"};});
    await result.then(()=>{expect(scheduler.ledgerSnapshot().activeOperations).toBe(1);expect(scheduler.resume(item.id)).toBe(false);});
    await scheduler.quiesceScope(item.scopeId);expect(scheduler.resume(item.id)).toBe(true);await scheduler.run();
    expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
  });
  it("C5 a new manager restores durable attempts rather than granting an exhausted operation another retry budget",async()=>{
    const clock=createFakeClock();let calls=0;const durable=new Map<string,{attempts:number;receiptId?:string;digest:string;scopeId:string}>();
    const shared={readProgress:(item:WorkItem)=>durable.get(item.id),writeProgress:(item:WorkItem,value:{attempts:number;receiptId?:string})=>{durable.set(item.id,{...value,digest:item.idempotencyDigest,scopeId:item.scopeId});},backlogSize:()=>[...durable.values()].filter(p=>!p.receiptId).length};
    const item=testItem(clock,"restart-retry");const task=async()=>{calls++;return {ok:false as const,retryable:true};};
    await makeScheduler(clock,shared).execute(item,task);expect(calls).toBe(3);
    await makeScheduler(clock,shared).execute(item,task);expect(calls).toBe(3);
  });
  it("C1 rejected operations with suspended siblings retain global ownership across concurrent run calls",async()=>{
    for(let seed=40;seed<45;seed++)await runTraceProperty(seed,Array.from({length:12},(_,i)=>i),async trace=>{
      const clock=createFakeClock();let active=0,max=0;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
      const scheduler=makeScheduler(clock,{sink:{deliver:async(id)=>{active++;max=Math.max(max,active);try{if(id==="stuck")await gate;else throw new Error("sink rejection");return {ok:true,receiptId:id};}finally{active--;}}}});
      scheduler.enqueue(testItem(clock,"stuck"));void scheduler.run();await flush();
      for(const n of trace){scheduler.enqueue(testItem(clock,`throw${n}`));const a=scheduler.run(),b=scheduler.run();expect(a).toBe(b);await flush();expect(active).toBe(1);expect(scheduler.ledgerSnapshot().activeOperations).toBe(1);}
      release();await scheduler.run();expect(max).toBeLessThanOrEqual(4);expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
    });
  });
  it("C2 endless streams bound every actual manager collection; each caller completes before a suspended tail",async()=>{
    const clock=createFakeClock();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const scheduler=makeScheduler(clock);
    const tail=scheduler.execute(testItem(clock,"tail"),async()=>{await gate;return {ok:true,receiptId:"tail"};});await flush();
    for(let i=0;i<2000;i++){
      const result=await itemDeadline(scheduler.execute(testItem(clock,`stream${i}`),async()=>i%2?{ok:false,retryable:false}:{ok:true,receiptId:String(i)}));
      expect(result.ok).toBe(i%2===0);const snap=scheduler.ledgerSnapshot();expect(snap.retainedResults).toBe(0);expect(snap.registeredCallbacks).toBeLessThanOrEqual(1);expect(snap.retainedDiagnostics).toBeLessThanOrEqual(8);expect(snap.registeredConsumers).toBeLessThanOrEqual(1);
      // Inspect sizes rather than trusting published counters alone (Opus amendment 9).
      const internal=scheduler as unknown as {entries:Map<string,unknown>;diagnostics:unknown[];scopeActive:Map<string,number>;quiescence:Map<string,unknown>};
      expect(internal.entries.size).toBeLessThanOrEqual(2);expect(internal.diagnostics.length).toBeLessThanOrEqual(8);expect(internal.scopeActive.size).toBeLessThanOrEqual(2);expect(internal.quiescence.size).toBe(0);
    }
    release();await tail;await scheduler.run();expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
  });
  it("C2/B4 duplicate consumers are bounded and conflicting identities return a typed failure without replacement",async()=>{
    const clock=createFakeClock(),scheduler=makeScheduler(clock);let release!:()=>void,second=0;const gate=new Promise<void>(r=>{release=r;});
    const item=testItem(clock,"same");const task=async()=>{await gate;return {ok:true as const,receiptId:"first"};};
    const first=scheduler.execute(item,task);await flush();
    for(let i=0;i<10000;i++)expect(scheduler.execute(item,task)).toBe(first);
    const conflict=scheduler.execute({...item,bytes:1000000000,idempotencyDigest:"different"},async()=>{second++;return {ok:true,receiptId:"second"};});
    release();const conflicting=await conflict;
    expect(conflicting).toEqual({ok:false,reason:"conflict"});expect(scheduler.enqueue({...item,bytes:item.bytes+1})).toBe("conflict");
    expect(scheduler.ledgerSnapshot().registeredConsumers).toBe(1);expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(item.bytes);release();expect((await first).ok).toBe(true);expect(second).toBe(0);
  });
  it("C3 discovery pages and real input/output allocations are reserved before production and resume beyond every turn cap",async()=>{
    const rig=await createLiveRig({},true,{},{collectPageSize:64,maxPagesPerRound:4});
    for(let i=0;i<10003;i++)rig.world.setFile(`p${String(i).padStart(6,"0")}`,"v");
    const discover=rig.ports.scan.discoverPage,collect=rig.ports.scan.collectPaths;
    let heldMax=0;rig.ports.scan.discoverPage=async(...args)=>{const ledger=rig.scheduler.ledgerSnapshot();expect(ledger.reservedBytes).toBeGreaterThanOrEqual(rig.ports.budgets.operationBytes);expect(ledger.heldAllocations).toBeGreaterThanOrEqual(testBudgets().maxDiscoveryBytes);return discover(...args);};
    rig.ports.scan.collectPaths=async(...args)=>{heldMax=Math.max(heldMax,rig.scheduler.ledgerSnapshot().workReservedBytes);return collect(...args);};
    await rig.reconciler.bootstrap();expect(rig.world.dataMatchesSource()).toBe(true);expect(rig.world.maxMaterializedDiscoveryBatch).toBeLessThanOrEqual(64);expect(heldMax).toBe(4*1024*1024);
    const cursors=rig.world.discoveryCalls.filter(c=>c.cursor!==undefined).map(c=>c.cursor!);expect(new Set(cursors).size).toBe(cursors.length);
    await rig.close();
  },20000);
  it("C3 actual megabyte reads cannot fit a path-sized reservation and growth cannot extend a read allowance",async()=>{
    const small=await createLiveRig({},true,{},{operationBytes:32768});small.world.setFile("tiny","x".repeat(1024*1024),{statSize:1024*1024});
    await small.reconciler.bootstrap();expect(small.world.projectedFiles.size).toBe(0);expect(small.scheduler.ledgerSnapshot().workReservedBytes).toBe(0);await small.close();
    const rig=await createLiveRig();rig.world.setFile("tiny","x".repeat(1024*1024),{statSize:1024*1024});await rig.reconciler.converge();expect(rig.world.dataMatchesSource()).toBe(false); // 1 MiB plus encoded path exceeds the fixed emitted batch allowance.
    rig.world.setFile("tiny","x".repeat(128),{statSize:1});rig.fake.emit({kind:"change",paths:["tiny"]});await rig.reconciler.converge();expect(rig.reconciler.phase()).not.toBe("current");await rig.close();
  });
  it("C4 admission reserves a 16KiB page at 64KiB; execution rotates 3:1 and across scopes under continuous pressure",async()=>{
    const clock=createFakeClock();const s=makeScheduler(clock,{}, {maxPendingBytes:65536,backfillReserveBytes:16384});
    for(let i=0;i<7;i++)s.enqueue(testItem(clock,`i${i}`,{bytes:8192}));expect(s.enqueue(testItem(clock,"backfill",{bytes:16384,priority:"backfill"}))).toBe("queued");expect(s.ledgerSnapshot().reservedBytes).toBeLessThanOrEqual(65536);await s.run();
    const order:string[]=[];let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    const manager=makeScheduler(clock,{sink:{deliver:async id=>{order.push(id);await gate;return {ok:true,receiptId:id};}}},{maxConcurrency:2});
    for(let i=0;i<12;i++){manager.enqueue(testItem(clock,`i${i}`,{scopeId:`scope${i%3}`}));manager.enqueue(testItem(clock,`b${i}`,{priority:"backfill",scopeId:`back${i%3}`}));}
    void manager.run();await flush();release();await flush();
    expect(order.slice(0,4).filter(id=>id.startsWith("b"))).toHaveLength(1);
    for(let i=0;i<12;i+=4)expect(order.slice(i,i+4).some(id=>id.startsWith("b"))).toBe(true);
    await manager.run();
  });
  it("C4 scopes rotate within each class even when one scope has spare active permits",async()=>{
    const clock=createFakeClock();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const order:string[]=[];
    const s=makeScheduler(clock,{sink:{deliver:async id=>{order.push(id);await gate;return {ok:true,receiptId:id};}}},{maxActiveOperationsPerScope:3});
    for(const scope of ["a","b"])for(let i=0;i<4;i++)s.enqueue(testItem(clock,`${scope}${i}`,{scopeId:scope}));
    void s.run();await flush();expect(order.slice(0,2)).toEqual(["a0","b0"]);release();await s.run();
  });
  it("C1/C3 reserves actual reads before their callback, bounds Git children and never releases leaked buffers",async()=>{
    const clock=createFakeClock();const s=makeScheduler(clock);let reads=0,active=0,max=0;
    const result=await s.execute(testItem(clock,"read"),async resources=>{
      const free=resources.hold(2500);
      try { await expect(resources.readFile(2048,async()=>{reads++;return {bytesRead:2048,value:0};})).rejects.toThrow(/budget/); } finally { free(); }
      const promises=Array.from({length:5},()=>resources.withGit(async()=>{active++;max=Math.max(max,active);await flush();active--;return 0;}));
      const results=await Promise.allSettled(promises);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
      return {ok:true,receiptId:"read"};
    });expect(result.ok).toBe(true);expect(reads).toBe(0);expect(max).toBe(4);await s.run();
    let free!:()=>void;const leaked=await s.execute(testItem(clock,"leak"),async resources=>{free=resources.hold(16);return {ok:true,receiptId:"leak"};});
    expect(leaked).toEqual({ok:false,reason:"quarantined"});expect(s.ledgerSnapshot().workReservedBytes).toBe(4096);expect(s.discardPaused("leak")).toBe(false);free();await s.quiesceScope(testItem(clock,"leak").scopeId);expect(s.discardPaused("leak")).toBe(true);await s.run();expect(s.ledgerSnapshot().workReservedBytes).toBe(0);
  });
  it("C5 quota exhaustion preserves durable failure backlog, refuses new admission and resumes after acknowledged discharge",async()=>{
    const clock=createFakeClock();const s=makeScheduler(clock,{}, {durableBacklogQuota:2});
    for(let i=0;i<2;i++)await s.execute(testItem(clock,`failure${i}`),async()=>({ok:false,retryable:false}));
    expect(await s.execute(testItem(clock,"excess"),async()=>({ok:true,receiptId:"x"}))).toEqual({ok:false,reason:"capacity"});
    expect(s.ledgerSnapshot()).toMatchObject({durableUsed:2,durableParked:2,workReservedBytes:0});s.acknowledgeBacklog(1);expect((await s.execute(testItem(clock,"recovered"),async()=>({ok:true,receiptId:"r"}))).ok).toBe(true);
  });
  it("C5 retry ceilings and attempts survive cancellation/resume; fencing failures are never transient",async()=>{
    const clock=createFakeClock();const delays:number[]=[];const parked:{attempts:number}[]=[];let attempts=0,releaseSleep!:()=>void;
    const scheduler=makeScheduler(clock,{park:(_item,_reason,n)=>parked.push({attempts:n}),sleep:async(ms)=>{delays.push(ms);await new Promise<void>(r=>{releaseSleep=r;});}});
    const item=testItem(clock,"retry");const first=scheduler.execute(item,async()=>{attempts++;return {ok:false,retryable:true,retryAfterMs:1e15};});await flush();
    expect(delays).toEqual([30000]);scheduler.cancelOperation(item.id);releaseSleep();await first;await flush();expect(scheduler.resume(item.id)).toBe(true);await flush();
    for(let i=0;i<5;i++){releaseSleep();await flush();}await scheduler.run();expect(attempts).toBe(3);expect(parked.at(-1)?.attempts).toBe(3);expect(scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
    let fenced=0;const promise=scheduler.execute(testItem(clock,"fenced"),async()=>{fenced++;return {ok:false,retryable:true,fenced:true};});for(let i=0;i<5;i++){await flush();releaseSleep();}const result=await promise;expect(result).toEqual({ok:false,reason:"fenced"});expect(fenced).toBe(1);
  });
  it("D1 cancellation at dispatch delivery acknowledgement and backoff retains identity and exact reservations",async()=>{
    for(let seed=80;seed<86;seed++){
      const clock=createFakeClock();let release!:()=>void;let calls=0;const gate=new Promise<void>(r=>{release=r;});const s=makeScheduler(clock);
      const item=testItem(clock,`cancel${seed}`);const result=s.execute(item,async()=>{calls++;await gate;return {ok:true,receiptId:item.id};});
      if(seed%2)await flush();s.cancelOperation(item.id);expect(s.ledgerSnapshot().workReservedBytes).toBe(item.bytes);release();expect((await result).ok).toBe(false);await flush();
      expect(s.resume(item.id)).toBe(true);await s.run();expect(calls).toBe(1);expect(s.ledgerSnapshot()).toMatchObject({workReservedBytes:0,registeredCallbacks:0,activeOperations:0});
    }
  });
  it("D1 blocked cancelled scope is quarantined, remains charged, and a healthy scope still progresses",async()=>{
    const clock=createFakeClock();const s=makeScheduler(clock,{}, {maxConcurrency:2,cancellationDeadlineMs:5});let release!:()=>void;
    const blocked=s.execute(testItem(clock,"blocked",{scopeId:"bad"}),async()=>{await new Promise<void>(r=>{release=r;});return {ok:true,receiptId:"late"};});await flush();s.cancelOperation("blocked");
    clock.advance(5);expect(await blocked).toEqual({ok:false,reason:"quarantined"});expect(s.ledgerSnapshot()).toMatchObject({activeOperations:1,quarantined:1,workReservedBytes:4096});
    const healthy=await s.execute(testItem(clock,"healthy",{scopeId:"good"}),async()=>({ok:true,receiptId:"healthy"}));expect(healthy.ok).toBe(true);await flush();expect(s.ledgerSnapshot().activeOperations).toBe(1);expect(s.resume("blocked")).toBe(false);
    release();await flush();expect(s.discardPaused("blocked")).toBe(true);await s.run();expect(s.ledgerSnapshot().workReservedBytes).toBe(0);
  });
  it("C/D generated admission failure allocation and cancellation traces never exceed independently held resources",async()=>{
    for(let seed=90;seed<100;seed++){
      const random=createSeededRandom(seed);
      const trace=Array.from({length:80},(_,i)=>({id:i,fail:random()<.25,cancel:random()<.2}));
      await runTraceProperty(seed,trace,async steps=>{
        const clock=createFakeClock();let held=0,maxHeld=0,active=0,maxActive=0;
        const cap=seed%2?32768:65536,slots=seed%2?12:5;
        const s=makeScheduler(clock,{}, {maxPendingBytes:cap,backfillReserveBytes:8192,maxPendingPaths:slots,maxConsumers:slots});
        const results=[];
        for(const step of steps){const id=String(step.id);results.push(s.execute(testItem(clock,id),async resources=>{active++;maxActive=Math.max(maxActive,active);const free=resources.hold(512);held+=512;maxHeld=Math.max(maxHeld,held);try{await flush();return step.fail?{ok:false as const,retryable:false}:{ok:true as const,receiptId:id};}finally{held-=512;free();active--;}}));if(step.cancel)s.cancelOperation(id);if(step.id%8===0)await flush();
          expect(s.ledgerSnapshot().reservedBytes).toBeLessThanOrEqual(cap);
          expect((s as unknown as {entries:Map<string,unknown>}).entries.size).toBeLessThanOrEqual(slots);
        }
        await Promise.all(results);await s.run();expect(maxActive).toBeLessThanOrEqual(4);expect(maxHeld).toBeLessThanOrEqual(4*512);expect(held).toBe(0);
        const entries=(s as unknown as {entries:Map<string,{state:string}>}).entries;for(const [id,e] of entries)if(e.state==="paused")s.discardPaused(id);expect(s.ledgerSnapshot().workReservedBytes).toBe(0);
      });
    }
  });
});
