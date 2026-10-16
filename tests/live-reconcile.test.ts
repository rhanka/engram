// L6b: independent source/projection oracle, generated traces and controlled await boundaries.
import { describe, it, expect } from "vitest";
import { LiveGitSandbox, buildCorpus, inventoryDigest } from "./helpers/live-git-fixtures.js";
import { Reconciler, type ReconcilerPorts } from "../engram-live/reconcile.js";
import { allCurrent, certifyAxis, initialCoverage, markReconciled, type AxisCertificate, type AxisGuardSnapshot } from "../engram-live/coverage.js";
import { createWatchHub } from "../engram-live/watch.js";
import { createLiveRig, flush, generateMixedTrace, runTraceProperty, bindWorldPorts, createFakeClock, FakeWatcher, FakeWriterAuthority, LiveTestWorld, makeScheduler, testItem, type TraceStep } from "./helpers/live-clock-watch.js";

async function apply(rig: Awaited<ReturnType<typeof createLiveRig>>, step: TraceStep) {
  const {world,fake,reconciler,clock}=rig;
  switch(step.kind){
    case "edit":world.setFile(step.path,step.content);if(!step.silent)fake.emit({kind:"change",paths:[step.path]});break;
    case "delete":world.deleteFile(step.path);if(!step.silent)fake.emit({kind:"delete",paths:[step.path]});break;
    case "relation-edit":world.setFile(step.targetPath,step.exportSym,{exportsSymbol:step.exportSym});world.setFile(step.callerPath,"call",{callsSymbolIn:step.targetPath});if(!step.silent)fake.emit({kind:"change",paths:[step.targetPath,step.callerPath]});break;
    case "duplicate-change":fake.emit({kind:"change",paths:[step.path]});fake.emit({kind:"change",paths:[step.path]});break;
    case "ref-move":world.setRef(step.ref,step.oid,step.reuseCompleteOid);break;
    case "silent-replacement":world.replaceProjectionSilently();break;
    case "signaled-replacement":world.replaceProjectionSilently();fake.emit({kind:"projection-replaced"});break;
    case "writer-conflict":world.authority.forceCompetingEpoch(world.authority.currentEpoch+1);reconciler.noteWriterTakeover(`epoch-${world.authority.currentEpoch}`);break;
    case "quiet":clock.advance(step.ms);break;
    case "downtime":fake.emit({kind:"downtime",ms:step.ms});break;
    case "overflow":fake.emit({kind:"overflow"});break;
    case "restart":fake.emit({kind:"restart"});break;
  }
}
async function stabilize(rig: Awaited<ReturnType<typeof createLiveRig>>) {
  rig.clock.advance(10000);await flush();
  for(let i=0;i<5 && !allCurrent(rig.reconciler.coverage());i++) await rig.reconciler.converge();
  expect(allCurrent(rig.reconciler.coverage())).toBe(true);
  expect(rig.world.dataMatchesSource()).toBe(true);
}

describe("live reconcile",()=>{
  it("watcher readiness precedes initial scan and edits during the scan are reconciled before current coverage",async()=>{
    const rig=await createLiveRig({},false);
    await expect(rig.hub.runScanPhase(async()=>undefined)).rejects.toThrow(/not ready/);
    await rig.reconciler.bootstrap();expect(rig.world.fullScans).toBe(0);expect(allCurrent(rig.reconciler.coverage())).toBe(false);
    const ready=rig.hub.bootstrap();rig.fake.releaseReady();await ready;
    rig.world.setFile("a","old");let once=true;
    rig.world.onDuringCollectPage=()=>{if(once){once=false;rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});}};
    await stabilize(rig);expect(rig.world.projectedFiles.get("a")).toBe("new");await rig.close();
  });
  it("lost events overflow downtime packed refs and projection replacement converge after stabilization",async()=>{
    for(let seed=1;seed<=12;seed++)await runTraceProperty(seed,generateMixedTrace(seed,30),async trace=>{
      const rig=await createLiveRig();rig.world.setFile("base","base");await rig.reconciler.bootstrap();
      for(const step of trace){await apply(rig,step);await rig.reconciler.reconcileRound();if(allCurrent(rig.reconciler.coverage()))expect(rig.world.dataMatchesSource()).toBe(true);}
      await stabilize(rig);await rig.close();
    });
  });
  it("interactive changes and history backfill both progress under bounded queues retries and resource budgets",async()=>{
    const rig=await createLiveRig();for(let i=0;i<150;i++)rig.world.setFile(`f${String(i).padStart(4,"0")}`,"v");
    for(let round=0;round<15;round++){await rig.reconciler.reconcileRound();rig.world.setFile("hot",String(round));rig.fake.emit({kind:"change",paths:["hot"]});}
    await stabilize(rig);expect(rig.world.maxMaterializedDiscoveryBatch).toBeLessThanOrEqual(4);
    expect(rig.scheduler.ledgerSnapshot().workReservedBytes).toBe(0);await rig.close();
  });
  it("event storms and writer conflict produce bounded reconciliation and an explicit degraded state",async()=>{
    const rig=await createLiveRig();await rig.reconciler.bootstrap();
    for(let i=0;i<100;i++){rig.world.setFile(`storm${i}`,"x");rig.fake.emit({kind:"change",paths:[`storm${i}`]});}
    rig.world.authority.allowAcquire=false;rig.reconciler.noteWriterTakeover("epoch-9");
    const calls=rig.world.collectCalls.length;await rig.reconciler.converge();
    expect(rig.world.collectCalls.length).toBe(calls);expect(rig.reconciler.phase()).toBe("degraded");expect(rig.reconciler.retentionSnapshot().deltas).toBeLessThanOrEqual(16);
    rig.world.authority.allowAcquire=true;await stabilize(rig);await rig.close();
  });
  it("hook absence client disconnect and repeated ref polling cannot suppress collection or invent activity",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    const initial=rig.world.collectCalls.length;const detach=rig.hub.onChange(()=>{});detach();
    for(let i=0;i<4;i++)await rig.reconciler.reconcileRound();expect(rig.world.collectCalls.length).toBe(initial);
    rig.world.deleteFile("a");rig.world.setFile("silent","new");rig.world.setRef("refs/heads/new","b".repeat(40));
    rig.clock.advance(10000);await flush();for(let i=0;i<5&&!allCurrent(rig.reconciler.coverage());i++)await flush();
    expect(rig.world.dataMatchesSource()).toBe(true);expect(allCurrent(rig.reconciler.coverage())).toBe(true);await rig.close();
  });
  it("isolated in-memory lifecycle leaves an unrelated Git fixture unchanged (smoke only)",async()=>{
    const box=new LiveGitSandbox();
    try {
      const corpus=buildCorpus(box,"sha1","files");
      const read=(args:string[])=>box.read(corpus.repo,["--no-optional-locks","-c","core.fsmonitor=false","-c","filter.tripwire.process=","-c","filter.tripwire.clean=","-c","filter.tripwire.required=false",...args]).toString();
      const inventory=()=>[inventoryDigest(corpus),read(["status","--porcelain=v1","--untracked-files=all","--ignored"]),read(["config","--local","--list"]),read(["ls-files","--stage"])];
      const before=inventory();const rig=await createLiveRig();rig.world.setFile("x","x");await rig.reconciler.bootstrap();await rig.reconciler.restart();await rig.close();expect(inventory()).toEqual(before);
    } finally { box.dispose(); }
  });
});

describe("Sol author reproductions and generated classes A/B",()=>{
  it("n1 full-page replay after partial repair converges without consuming durable failure quota",async()=>{
    for(const signal of [false,true])for(const conflict of [false,true]){
      const rig=await createLiveRig();for(let i=0;i<6;i++)rig.world.setFile(`f${i}`,"old");
      const repair=rig.ports.scan.repairRelations;let partial=true;
      rig.ports.scan.repairRelations=(...args)=>partial?Promise.resolve({complete:false,receiptId:""}):repair(...args);
      await rig.reconciler.reconcileRound();const before=rig.scheduler.ledgerSnapshot().durableUsed;
      expect(rig.world.collectCalls).toHaveLength(1);partial=false;
      rig.world.setFile("f1","new");if(signal)rig.fake.emit({kind:"change",paths:["f1"]});
      if(conflict){const collect=rig.ports.scan.collectPaths;let reject=true;rig.ports.scan.collectPaths=(...args)=>{if(reject){reject=false;throw new Error("CONFLICTING_PAGE_REPLAY");}return collect(...args);};}
      await rig.reconciler.bootstrap();for(let i=0;i<5;i++){rig.clock.advance(10000);await flush();}
      expect(allCurrent(rig.reconciler.coverage())).toBe(true);expect(rig.world.dataMatchesSource()).toBe(true);
      expect(rig.scheduler.ledgerSnapshot().durableUsed).toBe(before);expect(rig.scheduler.lastStats()?.failedTotal??0).toBe(0);await rig.close();
    }
  });
  it("n1 a non-retryable producer failure ends the drive without repeating the failed page",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","v");let calls=0;
    rig.ports.scan.collectPaths=async()=>{calls++;throw new Error("permanent receiver failure");};
    await rig.reconciler.bootstrap();expect(calls).toBe(1);expect(rig.scheduler.ledgerSnapshot().durableUsed).toBe(1);
    expect(allCurrent(rig.reconciler.coverage())).toBe(false);await rig.close();
  });
  it("n2 cancellation between every operation prevents later collection publication and certification",async()=>{
    for(const scenario of ["bootstrap","delta","overflow","periodic"] as const){
      const exercise=async(cancelAt?:number)=>{
        const rig=await createLiveRig();for(let i=0;i<10;i++)rig.world.setFile(`f${i}`,"old");
        if(scenario!=="bootstrap"){
          await rig.reconciler.bootstrap();rig.world.setFile("f1","new");
          if(scenario==="delta")rig.fake.emit({kind:"change",paths:["f1"]});
          if(scenario==="overflow")rig.fake.emit({kind:"overflow"});
        }
        const durable=()=>JSON.stringify([[...rig.world.projectedFiles],[...rig.world.projectedRelations],[...rig.world.projectedRefs],[...rig.world.publishedGenerations],[...rig.world.pageReceipts],[...rig.world.markerStore]]);
        let settled=false;const flight=scenario==="periodic"?(rig.clock.advance(10000),rig.reconciler.converge()):rig.reconciler[scenario==="bootstrap"?"bootstrap":"converge"]();
        void flight.then(()=>{settled=true;});let point=0;
        while(!settled && point!==cancelAt){point++;await Promise.resolve();}
        if(cancelAt!==undefined){
          expect(settled,`${scenario}:${cancelAt}`).toBe(false);
          const snapshot=durable(),calls=rig.world.collectCalls.length;
          const cancellation=rig.reconciler.cancelReconciliation();let quiescent=false;
          void Promise.all([flight,cancellation]).then(()=>{quiescent=true;});
          while(!quiescent){expect(Object.values(rig.reconciler.coverage().axes).some(a=>a.state==="current"),`${scenario}:${cancelAt} in flight`).toBe(false);await Promise.resolve();}
          await flight;await cancellation;
          expect(durable(),`${scenario}:${cancelAt}`).toBe(snapshot);expect(rig.world.collectCalls.length,`${scenario}:${cancelAt}`).toBe(calls);
          expect(Object.values(rig.reconciler.coverage().axes).some(a=>a.state==="current"),`${scenario}:${cancelAt}`).toBe(false);
          expect(rig.scheduler.ledgerSnapshot().workReservedBytes).toBe(0);await stabilize(rig);
        }else{expect(allCurrent(rig.reconciler.coverage())).toBe(true);expect(rig.world.dataMatchesSource()).toBe(true);}
        await rig.close();return point;
      };
      const points=await exercise();expect(points).toBeGreaterThan(0);
      for(let point=0;point<points;point++)await exercise(point);
    }
  });
  it("B3 shutdown at every observed port boundary forbids subsequent writes publication and certification",async()=>{
    for(const scenario of ["bootstrap","delta"] as const){
      const exercise=async(stopAt?:number)=>{
        const rig=await createLiveRig();rig.world.setFile("a","old");
        if(scenario==="delta"){await rig.reconciler.bootstrap();rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});}
        let index=0,stopping:Promise<void>|undefined,snapshot:unknown,progressAfterStop=0;
        const durable=()=>JSON.stringify([[...rig.world.projectedFiles],[...rig.world.projectedRelations],[...rig.world.projectedRefs],[...rig.world.publishedGenerations],[...rig.world.pageReceipts],[...rig.world.markerStore],[...rig.world.projectedImmutableOids],[...rig.world.oidExtractionCount]]);
        const point=()=>{
          if(stopping)return;
          if(index++===stopAt){snapshot=durable();stopping=rig.reconciler.shutdown();}
        };
        const instrument=(target:object,names:readonly string[],asyncNames:readonly string[]=[])=>{
          const object=target as Record<string,(...args:unknown[])=>unknown>;
          for(const name of names){
            const original=object[name]!;
            object[name]=asyncNames.includes(name)?async(...args)=>{point();const result=await original.apply(target,args);point();return result;}:(...args)=>{point();const result=original.apply(target,args);if(stopping && ["writeProgress","park"].includes(name))progressAfterStop++;point();return result;};
          }
        };
        const asyncScan=["discoverPage","collectPaths","repairRelations","validateSource","publishGeneration"];
        instrument(rig.ports.scan,[...asyncScan,"currentSourceVector","pathFingerprint"],asyncScan);
        instrument(rig.ports.store,["get","set","delete","incarnation","hasGeneration"]);
        instrument(rig.ports.writer,["acquire","renew"],["acquire","renew"]);
        instrument(rig.ports,["pollRefs"],["pollRefs"]);
        instrument((rig.scheduler as unknown as {ports:object}).ports,["readProgress","writeProgress","park"]);
        instrument(rig.clock,["now"]);
        const result=await rig.reconciler.reconcileRound();
        if(stopAt!==undefined){
          expect(stopping,`${scenario}:${stopAt}`).toBeDefined();await stopping;
          expect(durable(),`${scenario}:${stopAt}`).toBe(snapshot);
          expect(progressAfterStop,`${scenario}:${stopAt}`).toBe(0);
          expect(result.converged,`${scenario}:${stopAt}`).toBe(false);
          expect(Object.values(rig.reconciler.coverage().axes).some(a=>a.state==="current"),`${scenario}:${stopAt}`).toBe(false);
          expect(rig.scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
        }
        const count=index;await rig.close();return count;
      };
      const count=await exercise();expect(count).toBeGreaterThan(50);
      for(let point=0;point<count;point++)await exercise(point);
    }
  });
  it("B3 publication rechecks the revoked lease even if the producer ignores cancellation",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});
    const generations=rig.world.publishedGenerations.size;let stop:Promise<void>|undefined;
    const publish=rig.ports.scan.publishGeneration;
    rig.ports.scan.publishGeneration=(request,options)=>publish(request,{...options,resources:{...options.resources,check:()=>{}}});
    rig.world.onDuringPublish=()=>{stop=rig.reconciler.shutdown();expect(rig.world.authority.validate(rig.world.authority.acquiredTokens.at(-1)!)).toBe(false);};
    await rig.reconciler.reconcileRound();expect(stop).toBeDefined();await stop;
    expect(rig.world.publishedGenerations.size).toBe(generations);expect(allCurrent(rig.reconciler.coverage())).toBe(false);await rig.close();
  });
  it("A1 a known path change invalidates synchronously before any round or debounce",async()=>{
    const rig=await createLiveRig();await rig.reconciler.bootstrap();expect(allCurrent(rig.reconciler.coverage())).toBe(true);
    rig.world.setFile("a","changed");rig.fake.emit({kind:"change",paths:["a"]});
    expect(Object.values(rig.reconciler.coverage().axes).every(a=>a.state!=="current")).toBe(true);await rig.close();
  });
  it("C5 superseded validation guards discharge durable quota instead of parking failures",async()=>{
    const rig=await createLiveRig({},true,{durableBacklogQuota:2});rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    const before=rig.scheduler.ledgerSnapshot().durableUsed;
    rig.world.onDuringValidateSource=()=>rig.fake.emit({kind:"change",paths:["a"]});
    for(let i=0;i<20;i++){await rig.reconciler.reconcileRound();expect(rig.scheduler.ledgerSnapshot().durableUsed).toBe(before);}
    rig.world.onDuringValidateSource=undefined;await stabilize(rig);await rig.close();
  });
  it("A2 a delta replay after relation failure repairs a silent unrelated edit and conflicts trigger a full pass",async()=>{
    for(const conflict of [false,true]){
      const rig=await createLiveRig();rig.world.setFile("a","old");rig.world.setFile("b","old");await rig.reconciler.bootstrap();
      rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});
      const repair=rig.ports.scan.repairRelations;let once=true;
      rig.ports.scan.repairRelations=async(...args)=>{if(once){once=false;return {complete:false,receiptId:""};}return repair(...args);};
      await rig.reconciler.reconcileRound();rig.world.setFile("b","silent");
      if(conflict){const collect=rig.ports.scan.collectPaths;let reject=true;rig.ports.scan.collectPaths=(paths,options)=>{if(reject){reject=false;throw new Error("CONFLICTING_PAGE_REPLAY");}return collect(paths,options);};}
      for(let i=0;i<5;i++){rig.clock.advance(10000);await flush();}
      expect(allCurrent(rig.reconciler.coverage())).toBe(true);expect(rig.world.dataMatchesSource()).toBe(true);
      if(!conflict){const replay=rig.world.collectCalls.filter(c=>c.pageId.startsWith("delta:"));expect(replay.length).toBeGreaterThanOrEqual(2);expect(replay[1]!.pageId).toBe(replay[0]!.pageId);expect(replay[1]!.pageDigest).toBe(replay[0]!.pageDigest);}
      expect(rig.scheduler.ledgerSnapshot().durableUsed).toBe(0);await rig.close();
    }
  });
  it("C4 multi-scope registration rejects infeasible residents and admitted scopes all converge",async()=>{
    const clock=createFakeClock(),worlds:LiveTestWorld[]=[],closers:(()=>Promise<void>)[]=[],reconcilers:Reconciler[]=[];
    const scheduler=makeScheduler(clock,{validateToken:token=>worlds.some(w=>w.authority.validate(token))});
    try{
      for(let i=0;i<6;i++){
        const world=new LiveTestWorld(clock,new FakeWriterAuthority(clock,{scope:{tenant:"t",clone:`c${i}`,worktree:"w"}}));world.setFile("a",String(i));worlds.push(world);
        const watcher=new FakeWatcher(clock),hub=createWatchHub({start:()=>watcher.start(),stop:()=>watcher.stop(),onSignal:listener=>watcher.onSignal((s,at)=>listener({...s,paths:"paths" in s?s.paths:[],at} as Parameters<typeof listener>[0]))},clock,{scheduler,maxPendingPaths:16,debounceMs:500});
        const ready=hub.bootstrap();watcher.releaseReady();await ready;
        try{
          const reconciler=new Reconciler({scope:world.authority.scope,declarationRevision:1,hub,scheduler,clock,...bindWorldPorts(world),budgets:{maxRounds:64,collectPageSize:4,maxPagesPerRound:2,operationBytes:4*1024*1024,maxDeltaPaths:16,pollIntervalMs:10000}});
          reconcilers.push(reconciler);closers.push(async()=>{await reconciler.shutdown();await hub.dispose();});
        }catch(error){expect(String(error)).toMatch(/headroom|resident/);await hub.dispose();break;}
      }
      expect(reconcilers.length).toBeGreaterThanOrEqual(4);expect(reconcilers.length).toBeLessThan(6);
      await Promise.all(reconcilers.map(r=>r.bootstrap()));
      for(let i=0;i<reconcilers.length;i++){expect(allCurrent(reconcilers[i]!.coverage()),String(i)).toBe(true);expect(worlds[i]!.dataMatchesSource()).toBe(true);}
    }finally{for(const close of closers)await close();}
  });
  it("A2 periodic validation preserves quiet coverage and never forces full scans for hot deltas",async()=>{
    const rig=await createLiveRig();for(let i=0;i<2000;i++)rig.world.setFile(`f${String(i).padStart(4,"0")}`,"old");
    await rig.reconciler.bootstrap();for(let i=0;i<5&&!allCurrent(rig.reconciler.coverage());i++)await rig.reconciler.converge();
    const scans=rig.world.fullScans;
    let captures=0;const capture=rig.ports.scan.currentSourceVector;rig.ports.scan.currentSourceVector=resources=>{captures++;return capture(resources);};
    for(let i=0;i<3;i++){captures=0;rig.clock.advance(10000);expect(allCurrent(rig.reconciler.coverage())).toBe(true);await flush();expect(captures).toBeLessThanOrEqual(4);}
    rig.world.setFile("f0000","hot");rig.fake.emit({kind:"change",paths:["f0000"]});rig.clock.advance(10000);await flush();
    expect(allCurrent(rig.reconciler.coverage())).toBe(true);expect(rig.world.dataMatchesSource()).toBe(true);expect(rig.world.fullScans).toBe(scans);await rig.close();
  });
  it("A2 overflow acknowledgement is unaffected by known changes on the final discovery page",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();rig.fake.emit({kind:"overflow"});
    const discover=rig.ports.scan.discoverPage;let changes=0;
    rig.ports.scan.discoverPage=async(...args)=>{const page=await discover(...args);if(page.done && changes++<4){rig.world.setFile("a",String(changes));rig.fake.emit({kind:"change",paths:["a"]});}return page;};
    await rig.reconciler.converge();expect(changes).toBe(1);expect(rig.hub.overflowed()).toBe(false);expect(allCurrent(rig.reconciler.coverage())).toBe(true);expect(rig.world.dataMatchesSource()).toBe(true);await rig.close();
  });
  it("B3 shutdown before the queued round starts revokes writing and never exposes current",async()=>{
    for(const entry of ["bootstrap","reconcileRound","converge"] as const){
      const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
      rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});
      const calls=rig.world.collectCalls.length,generations=rig.world.publishedGenerations.size;
      const flight=rig.reconciler[entry]();const stop=rig.reconciler.shutdown();
      await flight;await stop;
      expect(rig.world.collectCalls.length,entry).toBe(calls);
      expect(rig.world.publishedGenerations.size,entry).toBe(generations);
      expect(rig.reconciler.lifecycle()).toBe("stopped");
      expect(Object.values(rig.reconciler.coverage().axes).every(a=>a.state!=="current")).toBe(true);
      expect(rig.world.authority.releasedTokens).toHaveLength(1);
      rig.fake.emit({kind:"change",paths:["a"]});expect(allCurrent(rig.reconciler.coverage())).toBe(false);
      await rig.close();
    }
  });
  it("D1 cancellation before dispatch prevents the queued round from writing and remains recoverable",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});const count=rig.world.collectCalls.length;
    const flight=rig.reconciler.reconcileRound(),cancel=rig.reconciler.cancelReconciliation();await flight;await cancel;
    expect(rig.world.collectCalls.length).toBe(count);expect(allCurrent(rig.reconciler.coverage())).toBe(false);
    await stabilize(rig);await rig.close();
  });
  it("C1 shutdown discards queued reservations after scope quiescence",async()=>{
    const rig=await createLiveRig();await rig.reconciler.bootstrap();
    let release!:()=>void;const blocker=rig.scheduler.execute(testItem(rig.clock,"blocker",{fencingToken:rig.world.authority.acquiredTokens.at(-1)!}),async()=>{await new Promise<void>(r=>{release=r;});return {ok:true,receiptId:"blocker"};});await flush();
    const flight=rig.reconciler.reconcileRound();await flush();expect(rig.scheduler.pendingCount()).toBe(1);
    const stop=rig.reconciler.shutdown();release();await blocker;await flight;await stop;
    expect(rig.scheduler.ledgerSnapshot().workReservedBytes).toBe(0);expect(rig.world.authority.releasedTokens).toHaveLength(1);await rig.close();
  });
  it("B1 writer authority refuses a second holder and a takeover strictly advances and revokes the old epoch",async()=>{
    const clock=createFakeClock(),authority=new FakeWriterAuthority(clock);
    const first=(await authority.acquire())!;expect(authority.validate(first)).toBe(true);
    expect(await authority.acquire()).toBeUndefined();
    const next=(await authority.acquire({minEpoch:first.epoch+1}))!;
    expect(next.epoch).toBeGreaterThan(first.epoch);expect(authority.validate(first)).toBe(false);expect(authority.validate(next)).toBe(true);
    const renewed=(await authority.renew(next))!;expect(authority.validate(next)).toBe(false);expect(authority.validate(renewed)).toBe(true);
    authority.revoke(renewed);expect(authority.validate(renewed)).toBe(false);await authority.release(renewed);
    expect((await authority.acquire())!.epoch).toBeGreaterThan(renewed.epoch);
  });
  it("C5 operation and page identities bind the scope and monotonically renewed writer epoch",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    const pages=new Set(rig.world.collectCalls.map(c=>c.pageId)),oldEpoch=rig.world.authority.currentEpoch;
    await rig.reconciler.shutdown();rig.world.setFile("a","new");
    const successor=new Reconciler(rig.ports);await successor.bootstrap();
    expect(rig.world.authority.currentEpoch).toBeGreaterThan(oldEpoch);expect(allCurrent(successor.coverage())).toBe(true);
    expect(rig.world.collectCalls.filter(c=>!pages.has(c.pageId))).not.toHaveLength(0);
    expect(rig.world.dataMatchesSource()).toBe(true);await successor.shutdown();await rig.hub.dispose();
  });
  it("D1 reconciliation keeps a validated budget copy when the caller changes its object",async()=>{
    const rig=await createLiveRig();Object.assign(rig.ports.budgets,{maxRounds:0,maxPagesPerRound:0});
    rig.world.setFile("a","value");await rig.reconciler.bootstrap();expect(allCurrent(rig.reconciler.coverage())).toBe(true);await rig.close();
  });
  it("A1 each certification predicate independently rejects an otherwise valid certificate",()=>{
    const vector={refsFingerprint:"r",headOid:"h",indexFingerprint:"i",pathMembershipFingerprint:"p",contentFingerprint:"c",configAttributesFingerprint:"a"};
    const report=initialCoverage(["refs"],0).axes.refs!;
    const cert:AxisCertificate={axis:"refs",sourceVector:vector,publishedGenerationId:"g",storageIncarnation:"s",reconcileStartSeq:10,reconcileEndSeq:10,complete:true,stableSource:true,observedAt:1};
    const guard:AxisGuardSnapshot={currentSourceVector:vector,activeStorageIncarnation:"s",publishedGenerations:new Set(["g"]),writerTokenValid:true,hasOverflow:false,hasExcludedPaths:false,hasFailedTasks:false,hasPendingReconcile:false};
    expect(certifyAxis(report,cert,guard).state).toBe("current");
    const cases:[string,Partial<AxisCertificate>,Partial<AxisGuardSnapshot>][]=[
      ["axis",{axis:"ast"},{}],["writer",{},{writerTokenValid:false}],["stable",{stableSource:false},{}],
      ["captured lock",{sourceVector:{...vector,lockStateValid:false}},{}],["current lock",{},{currentSourceVector:{...vector,lockStateValid:false}}],
      ["source",{},{currentSourceVector:{...vector,contentFingerprint:"moved"}}],["empty incarnation",{storageIncarnation:""},{}],["incarnation",{},{activeStorageIncarnation:"reset"}],
      ["empty generation",{publishedGenerationId:""},{}],["generation",{},{publishedGenerations:new Set()}],["overflow",{},{hasOverflow:true}],
      ["pending",{},{hasPendingReconcile:true}],["complete",{complete:false},{}],["excluded",{},{hasExcludedPaths:true}],["failed",{},{hasFailedTasks:true}],
      ["base doubt",{},{unknownDoubtSeq:10}],["end",{reconcileEndSeq:9},{}],["delta cap",{},{pendingDeltas:{a:11,b:11},maxDeltaPathsPerAxis:1}],
      ["undischarged",{},{pendingDeltas:{a:11}}],
    ];
    for(const [name,c,g] of cases)expect(certifyAxis(report,{...cert,...c},{...guard,...g}).state,name).not.toBe("current");
    expect(certifyAxis(report,{...cert,dischargedDeltas:{a:11}},{...guard,pendingDeltas:{a:11}}).state).toBe("current");
  });
  it("A1 failed observation remains degraded until readiness is restored and data is reconciled",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","v");await rig.reconciler.bootstrap();
    rig.fake.emit({kind:"watch-error",reason:"observer failed"});rig.clock.advance(10000);await flush();await rig.reconciler.converge();
    expect(allCurrent(rig.reconciler.coverage())).toBe(false);expect(rig.hub.state).toBe("degraded");
    rig.fake.emit({kind:"restart"});await stabilize(rig);await rig.close();
  });
  it("A1 pending observation demotes synchronously; failed validation cannot be promoted by an empty queue",async()=>{
    expect(allCurrent(initialCoverage(["refs"],0))).toBe(false);
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});rig.world.onDuringValidateSource=()=>gate;
    const pending=rig.reconciler.reconcileRound();expect(allCurrent(rig.reconciler.coverage())).toBe(false);await flush();release();await pending;rig.world.onDuringValidateSource=undefined;
    const validate=rig.ports.scan.validateSource;rig.ports.scan.validateSource=async(...args)=>({...await validate(...args),valid:false});
    await rig.reconciler.reconcileRound();expect(allCurrent(rig.reconciler.coverage())).toBe(false);await rig.close();
  });
  it("A3 edits during the closing poll cannot replace the vector that produced the data",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();let polls=0;
    rig.world.onDuringPollRefs=()=>{if(++polls===2)rig.world.setFile("a","late silent edit");};
    await rig.reconciler.reconcileRound();expect(polls).toBe(2);expect(allCurrent(rig.reconciler.coverage())).toBe(false);expect(rig.world.projectedFiles.get("a")).toBe("old");
    rig.world.onDuringPollRefs=undefined;await stabilize(rig);await rig.close();
  });
  it("A1 proofless, incomplete or unrelated per-axis evidence never certifies data",async()=>{
    // @ts-expect-error A complete label cannot replace the mandatory certificate and guard.
    expect(markReconciled(initialCoverage(["refs"],0),"refs",{complete:true,stableSource:true,observedAt:1}).axes.refs?.state).not.toBe("current");
    const rig=await createLiveRig();rig.world.setFile("a","old");rig.world.forceIncompleteCollect=true;
    await rig.reconciler.bootstrap();for(let i=0;i<3;i++)await rig.reconciler.reconcileRound();expect(allCurrent(rig.reconciler.coverage())).toBe(false);
    rig.world.forceIncompleteCollect=false;await stabilize(rig);
    const validate=rig.ports.scan.validateSource;
    rig.ports.scan.validateSource=async(...args)=>{const proof=await validate(...args);return {...proof,axes:{...proof.axes,ast:{complete:false,reason:"missing grammar"},"pr-metadata":{complete:false,state:"auth_required",reason:"missing authority"}}};};
    await rig.reconciler.reconcileRound();expect(rig.reconciler.coverage().axes.ast?.state).toBe("partial");expect(rig.reconciler.coverage().axes.refs?.state).toBe("current");
    expect(rig.reconciler.coverage().axes.ast?.pendingCount).toBeGreaterThan(0);expect(rig.reconciler.coverage().axes.refs?.pendingCount).toBe(0);await rig.close();
  });
  it("A1 certificates are bound to their axis and incomplete remote authority remains distinct from local readiness",async()=>{
    const rig=await createLiveRig();await rig.reconciler.bootstrap();
    const report=rig.reconciler.coverage().axes.refs!,cert=report.certificate!;
    const wrong=certifyAxis({...report,axis:"ast"},cert,{currentSourceVector:cert.sourceVector,activeStorageIncarnation:cert.storageIncarnation,publishedGenerations:new Set([cert.publishedGenerationId]),writerTokenValid:true,hasOverflow:false,hasExcludedPaths:false,hasFailedTasks:false,hasPendingReconcile:false});
    expect(wrong.state).not.toBe("current");
    const validate=rig.ports.scan.validateSource;rig.ports.scan.validateSource=async(...args)=>{const proof=await validate(...args);return {...proof,axes:{...proof.axes,"pr-metadata":{complete:false,state:"auth_required",reason:"token missing"}}};};
    await rig.reconciler.reconcileRound();expect(rig.reconciler.coverage().axes["pr-metadata"]?.state).toBe("auth_required");expect(rig.reconciler.coverage().axes["working-tree"]?.state).toBe("current");await rig.close();
  });
  it("A2 autonomous periodic repair collects dropped deletions and refs, without round calls",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    const counts=new Map(rig.world.oidExtractionCount);
    rig.world.deleteFile("a");rig.world.setFile("b","new");rig.world.setRef("refs/heads/main","c".repeat(40));
    rig.clock.advance(10000);await flush();
    expect(rig.world.dataMatchesSource()).toBe(true);expect(rig.world.projectedRefs.get("refs/heads/main")).toBe("c".repeat(40));
    for(const [oid,count] of counts)expect(rig.world.oidExtractionCount.get(oid)).toBe(count);
    await rig.close();
  });
  it("A2 observed ref changes schedule data immediately; a failed observation never leaves current refs",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","v");await rig.reconciler.bootstrap();
    const count=rig.world.collectCalls.length;rig.world.setRef("refs/heads/new","f".repeat(40));await rig.reconciler.reconcileRound();
    expect(rig.world.collectCalls.length).toBeGreaterThan(count);expect(rig.world.projectedRefs.get("refs/heads/new")).toBe("f".repeat(40));
    rig.world.failPollRefs=true;await rig.reconciler.reconcileRound();expect(rig.reconciler.coverage().axes.refs?.state).not.toBe("current");rig.world.failPollRefs=false;await stabilize(rig);await rig.close();
  });
  it("A3 guards before publication prevent any commit after validation is invalidated; generation existence is required",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","v");await rig.reconciler.bootstrap();
    const generations=rig.world.publishedGenerations.size;
    rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});
    rig.world.onDuringValidateSource=()=>rig.fake.emit({kind:"packed-refs"});
    await rig.reconciler.reconcileRound();expect(rig.world.publishedGenerations.size).toBe(generations);
    rig.world.onDuringValidateSource=undefined;await stabilize(rig);
    const exists=rig.ports.store.hasGeneration;rig.ports.store.hasGeneration=()=>false;
    await rig.reconciler.reconcileRound();expect(allCurrent(rig.reconciler.coverage())).toBe(false);
    rig.ports.store.hasGeneration=exists;await rig.close();
  });
  it("A3 silent final-observation edits and resets during every awaited boundary cannot certify an old or empty projection",async()=>{
    for(let seed=21;seed<=25;seed++)for(const boundary of ["onDuringPollRefs","onDuringValidateSource","onDuringPublish","onDuringCollectPage"] as const){
      const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
      rig.world.setFile("trigger",String(seed));rig.fake.emit({kind:"change",paths:["trigger"]});
      let once=true;rig.world[boundary]=()=>{if(once){once=false;if(seed%2)rig.world.setFile("a",`silent-${seed}`);else rig.world.replaceProjectionSilently();}};
      await rig.reconciler.reconcileRound();if(allCurrent(rig.reconciler.coverage()))expect(rig.world.dataMatchesSource()).toBe(true);
      rig.world[boundary]=undefined;await stabilize(rig);await rig.close();
    }
  });
  it("A3 final doubt check rejects invalidations during publication and never recreates a generation marker",async()=>{
    for(const kind of ["packed-refs","downtime","restart","projection-replaced","overflow"] as const){
      const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
      rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});let once=true;
      rig.world.onDuringPublish=()=>{if(once){once=false;rig.fake.emit(kind==="downtime"?{kind,ms:1000}:{kind});}};
      await rig.reconciler.reconcileRound();expect(allCurrent(rig.reconciler.coverage())).toBe(false);
      rig.world.onDuringPublish=undefined;await stabilize(rig);await rig.close();
    }
  });
  it("B1 missing proof/authority ports fail configuration; every write carries a typed verified token",async()=>{
    const rig=await createLiveRig();
    for(const port of ["writer","scheduler"] as const)expect(()=>new Reconciler({...rig.ports,[port]:undefined} as unknown as ReconcilerPorts)).toThrow();
    for(const name of ["discoverPage","validateSource","publishGeneration","currentSourceVector"] as const)expect(()=>new Reconciler({...rig.ports,scan:{...rig.ports.scan,[name]:undefined}} as unknown as ReconcilerPorts)).toThrow();
    for(const name of ["incarnation","hasGeneration"] as const)expect(()=>new Reconciler({...rig.ports,store:{...rig.ports.store,[name]:undefined}} as unknown as ReconcilerPorts)).toThrow();
    rig.world.authority.allowAcquire=false;await rig.reconciler.bootstrap();expect(rig.world.collectCalls).toHaveLength(0);
    rig.world.authority.allowAcquire=true;await stabilize(rig);expect(rig.world.collectCalls.every(c=>typeof c.token==="object")).toBe(true);await rig.close();
  });
  it("B2 revocation between pages and at the receiving write forbids later stale writes and retries",async()=>{
    for(let seed=30;seed<36;seed++){
      const rig=await createLiveRig();for(let i=0;i<12;i++)rig.world.setFile(`f${i}`,"x");
      let once=true;rig.world.onDuringCollectPage=()=>{if(once){once=false;rig.world.authority.revokeAllCurrentTokens();rig.world.authority.allowAcquire=false;}};
      await rig.reconciler.bootstrap();expect(rig.world.projectedFiles.size).toBe(0);expect(rig.world.collectCalls.length).toBe(0);expect(allCurrent(rig.reconciler.coverage())).toBe(false);
      rig.world.onDuringCollectPage=undefined;rig.world.authority.allowAcquire=true;await stabilize(rig);await rig.close();
    }
  });
  it("B3 scope units including publication serialize across instances; late completion cannot reverse shutdown",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","x");await rig.reconciler.bootstrap();
    const peer=new Reconciler(rig.ports);let active=0,max=0;
    await peer.bootstrap();expect(peer.degradedReason()).toContain("denied");
    rig.world.publishedGenerations.clear();
    rig.world.onDuringPublish=async()=>{active++;max=Math.max(max,active);await flush();active--;};
    await Promise.all([rig.reconciler.restart(),rig.reconciler.converge(),peer.bootstrap()]);expect(max).toBe(1);
    rig.world.onDuringPublish=undefined;
    let release!:()=>void,entered!:()=>void;const entry=new Promise<void>(r=>{entered=r;});
    rig.world.onDuringCollectPage=async()=>{entered();await new Promise<void>(r=>{release=r;});};
    rig.world.setFile("a","late");rig.fake.emit({kind:"change",paths:["a"]});const flight=rig.reconciler.reconcileRound();await entry;
    const stop=rig.reconciler.shutdown();expect(rig.reconciler.lifecycle()).toBe("stopping");release();await flight;await stop;
    expect(rig.reconciler.lifecycle()).toBe("stopped");expect(allCurrent(rig.reconciler.coverage())).toBe(false);expect((await rig.reconciler.converge()).converged).toBe(false);
    rig.world.onDuringCollectPage=undefined;await peer.shutdown();await rig.hub.dispose();
  });
  it("A/B generated mixed traces bound delta retention through creation/deletion storms",async()=>{
    const rig=await createLiveRig();await rig.reconciler.bootstrap();
    for(let i=0;i<200;i++){const p=`temporary-${i}`;rig.world.setFile(p,"v");rig.fake.emit({kind:"change",paths:[p]});await rig.reconciler.converge();rig.world.deleteFile(p);rig.fake.emit({kind:"delete",paths:[p]});await rig.reconciler.converge();expect(rig.reconciler.retentionSnapshot().dischargedDeltas).toBe(0);for(const axis of Object.values(rig.reconciler.coverage().axes))expect(Object.keys(axis.dischargedDeltas??{}).length).toBeLessThanOrEqual(16);}
    await rig.close();
  });
  it("D1 explicit reconciliation cancellation preserves receipts and reservations until quiescence, then recovers",async()=>{
    const rig=await createLiveRig();rig.world.setFile("a","old");await rig.reconciler.bootstrap();
    rig.world.setFile("a","new");rig.fake.emit({kind:"change",paths:["a"]});
    let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});
    rig.world.onDuringCollectPage=async()=>{entered();await new Promise<void>(r=>{release=r;});};
    const flight=rig.reconciler.converge();await ready;const cancelled=rig.reconciler.cancelReconciliation();
    expect(allCurrent(rig.reconciler.coverage())).toBe(false);expect(rig.scheduler.ledgerSnapshot().workReservedBytes).toBeGreaterThan(0);
    release();await flight;await cancelled;expect(allCurrent(rig.reconciler.coverage())).toBe(false);expect(rig.scheduler.ledgerSnapshot().workReservedBytes).toBe(0);
    rig.world.onDuringCollectPage=undefined;await stabilize(rig);await rig.close();
  });
});
