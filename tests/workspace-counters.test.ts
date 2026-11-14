/**
 * Track G G6-1 (S0.4) — four counters between prose and graph.
 *
 * Selected entities / selected classes / visible nodes / visible edges.
 * Values are read from WorkspaceViewerState + the dataset stats already
 * exposed via computeFocusSubgraph.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
  type GraphLike,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

const graph: GraphLike = {
  nodes: [
    { id: "a", label: "A", node_type: "T1" },
    { id: "b", label: "B", node_type: "T1" },
    { id: "c", label: "C", node_type: "T2" },
  ],
  edges: [
    { source: "a", target: "b", relation: "r", confidence: "EXTRACTED" },
    { source: "b", target: "c", relation: "r", confidence: "EXTRACTED" },
  ],
};

describe("Track G G6-1 — counters row", () => {
  it("renders four labelled counters in the rendered shell", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    expect(html).toContain('class="ws-counters"');
    expect(html).toContain('data-counter="selected-entities"');
    expect(html).toContain('data-counter="selected-classes"');
    expect(html).toContain('data-counter="visible-nodes"');
    expect(html).toContain('data-counter="visible-edges"');
  });

  it("reflects the selection state and dataset stats in each counter value", () => {
    const state = {
      ...createDefaultViewerState(),
      selectedTypes: ["T1", "T2"],
      selectedEntities: ["a", "b"],
      selectionState: {
        kind: "members",
        ref: "selection:test",
        entityIds: ["a", "b"],
      },
    };
    const html = renderWorkspaceShell({ tokens, title: "Workspace", state, graph });
    // 2 selected entities, 2 selected classes, visible nodes/edges from
    // the induced subgraph.
    expect(html).toMatch(
      /data-counter="selected-entities"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*2\s*<\/span>/,
    );
    expect(html).toMatch(
      /data-counter="selected-classes"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*2\s*<\/span>/,
    );
    expect(html).toMatch(
      /data-counter="visible-nodes"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*\d+\s*<\/span>/,
    );
    expect(html).toMatch(
      /data-counter="visible-edges"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*\d+\s*<\/span>/,
    );
  });

  it("places the counters between the description block and the graph controls", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    const idxCounters = html.indexOf('class="ws-counters"');
    const idxControls = html.indexOf('class="ws-graph-controls"');
    const idxGraphPanel = html.indexOf('id="graph-panel"');
    expect(idxCounters).toBeGreaterThan(-1);
    expect(idxControls).toBeGreaterThan(idxCounters);
    expect(idxGraphPanel).toBeGreaterThan(idxCounters);
  });
});


import { readFileSync as mlRead } from "node:fs";
import { computeFocusSubgraph as mlFocus } from "../src/workspace/graph-selection.js";
import { buildStudioScene as mlTsScene } from "../src/studio-scene.js";
import { buildScene as mlJsScene, computeDegrees as mlDegrees } from "../studio/src/lib/graphAdapter.js";
import { buildGraphRendererPayload as mlPayload } from "../studio/src/lib/graphRendererPayload.js";
const mlFive=JSON.parse(mlRead(new URL("./fixtures/multi-links/m4-five-node-degree.json",import.meta.url),"utf8"));
const mlNodes=mlFive.nodes.map((n:any,i:number)=>({...n,label:n.id,weight:1,shape:"dot",x:i,y:0}));
const mlBase=mlFive.links;
const mlAdded=[...mlBase,...["r2","r3","r4"].map(relation=>({source:"a",target:"b",relation}))];
describe("L0-T five-node",()=>{
 for(const surface of ["workspace","TS scene","browser scene","churn fallback","packed label priority"]) describe(surface,()=>{
  it("M4-five-node-topology-invariant",()=>{
   if(surface==="workspace"){
    const before=mlFocus({multigraph:true,nodes:mlNodes,edges:mlBase},createDefaultViewerState()).metrics;
    const after=mlFocus({multigraph:true,nodes:mlNodes,edges:mlAdded},createDefaultViewerState()).metrics;
    expect(before.averageDegree).toBe(1.2);expect(before.topHubId).toBe("c");
    expect(after.averageDegree).toBe(1.2);expect(after.topHubId).toBe("c");expect(after.density).toBe(before.density);expect([before.edges,after.edges]).toEqual([3,6]);
   }
   if(surface==="TS scene"||surface==="browser scene"){
    const build=surface==="TS scene"?mlTsScene:mlJsScene;
    const before=build({multigraph:true,nodes:mlNodes,edges:mlBase}),after=build({multigraph:true,nodes:mlNodes,edges:mlAdded});
    expect(after.nodes.map((n:any)=>({id:n.id,weight:n.weight,shape:n.shape}))).toEqual(before.nodes.map((n:any)=>({id:n.id,weight:n.weight,shape:n.shape})));
    if(surface==="browser scene")expect(mlDegrees(mlNodes,mlAdded,true).get("a")).toBe(1);
   }
   if(surface==="churn fallback"){
    const before=mlPayload({multigraph:true,nodes:mlNodes,edges:mlBase},{colorBy:"churn"}),after=mlPayload({multigraph:true,nodes:mlNodes,edges:mlAdded},{colorBy:"churn"});
    expect(Array.from(after.baseStyle.nodeColors)).toEqual(Array.from(before.baseStyle.nodeColors));
   }
   if(surface==="packed label priority"){
    // Extend the five-node fixture by one equally peripheral label so the
    // public top-5 gate actually has a competing sixth candidate.
    const ids=["c","d","e","z","b","a"];
    const nodes=ids.map((id,i)=>({id,label:id,node_type:"Character",shape:"roundedbox",weight:1,x:i,y:0}));
    const baseline=[...mlBase,{source:"c",target:"z",relation:"r1"}],parallel=[...mlAdded,{source:"c",target:"z",relation:"r1"}];
    const before=mlPayload({multigraph:true,nodes,edges:baseline},{zoom:0}),after=mlPayload({multigraph:true,nodes,edges:parallel},{zoom:0});
    expect(before.baseStyle.nodeLabels.filter(Boolean)).toHaveLength(5);
    expect(after.baseStyle.nodeLabels).toEqual(before.baseStyle.nodeLabels);
   }
  });
 });
 it("scene loop topology counts itself once",()=>{
  expect(mlDegrees([{id:"a"}],[{source:"a",target:"a",relation:"calls"}],true).get("a")).toBe(1);
 });
 it("browser structural edges do not feed topology sizing",()=>{
  const extra=[...mlBase,{source:"a",target:"c",structural:true,relation:"membership"}];
  expect([...mlDegrees(mlNodes,extra,true)]).toEqual([...mlDegrees(mlNodes,mlBase,true)]);
  const base=mlJsScene({multigraph:true,nodes:mlNodes,edges:mlBase}),withStructural=mlJsScene({multigraph:true,nodes:mlNodes,edges:extra});
  expect(withStructural.nodes.map((n:any)=>n.weight)).toEqual(base.nodes.map((n:any)=>n.weight));
 });
});
