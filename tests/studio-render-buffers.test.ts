import { describe, expect, it } from "vitest";

import { createGraphRenderer } from "@sentropic/graph";

import { buildStudioRenderBuffers } from "../src/studio-render-buffers.js";

describe("buildStudioRenderBuffers", () => {
  it("adapts a positioned studio scene into renderer and style typed buffers", () => {
    const payload = buildStudioRenderBuffers({
      nodes: [
        { id: "a", label: "Alpha", x: 10, y: 20, fx: 99, fy: 88, weight: 4, shape: "diamond" },
        { id: "b", label: "Beta", x: -5, y: 0, weight: 1, group: "G" },
        { id: "c", label: "Gamma", x: 30, y: -10, weight: 9 },
      ],
      edges: [
        { source: "a", target: "b", relation: "uses_method", dash: "long-dash" },
        { source: "b", target: "c", relation: "occurs_at", dash: "dotted", weak: true },
        { source: "missing", target: "c", relation: "dangling", dash: "dashed" },
      ],
      stats: { nodeCount: 3, edgeCount: 3, weakEdgeCount: 1, communityCount: 1 },
    });

    expect(payload.renderer).toBe("sentropic-graph");
    expect(payload.renderGraph.nodeIds).toEqual(["a", "b", "c"]);
    expect([...payload.renderGraph.positions]).toEqual([10, 20, -5, 0, 30, -10]);
    expect([...payload.renderGraph.edges]).toEqual([0, 1, 1, 2]);
    expect(payload.renderGraph.droppedEdges).toBe(1);
    expect(payload.renderGraph.nodeFlags?.fixed).toEqual(new Uint8Array([1, 0, 0]));

    expect([...payload.style.nodeSizes]).toEqual([6, 3, 9]);
    expect([...payload.style.edgeDash]).toEqual([3, 2]);
    expect([...payload.style.edgeWidths]).toEqual([1, 0.75]);
    expect(payload.stats).toEqual({
      nodeCount: 3,
      edgeCount: 2,
      droppedEdgeCount: 1,
      weakEdgeCount: 1,
    });
  });

  it("uses finite fx/fy pins as renderer positions when x/y are absent", () => {
    const payload = buildStudioRenderBuffers({
      nodes: [{ id: "a", label: "Alpha", fx: 10, fy: 20, weight: 1 }],
      edges: [],
      stats: { nodeCount: 1, edgeCount: 0, weakEdgeCount: 0, communityCount: 0 },
    });

    expect([...payload.renderGraph.positions]).toEqual([10, 20]);
    expect(payload.renderGraph.nodeFlags?.fixed).toEqual(new Uint8Array([1]));
  });

  it("requires either explicit x/y positions or finite fx/fy pins", () => {
    expect(() =>
      buildStudioRenderBuffers({
        nodes: [{ id: "a", label: "Alpha", weight: 1 }],
        edges: [],
        stats: { nodeCount: 1, edgeCount: 0, weakEdgeCount: 0, communityCount: 0 },
      }),
    ).toThrow("node a is missing finite x/y positions or fx/fy pins");
  });

  it("emits buffers accepted by the published @sentropic/graph renderer contract", () => {
    const payload = buildStudioRenderBuffers({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 10, y: 10, weight: 1 },
      ],
      edges: [{ source: "a", target: "b", relation: "appears_in", dash: "solid" }],
      stats: { nodeCount: 2, edgeCount: 1, weakEdgeCount: 0, communityCount: 1 },
    });

    const renderer = createGraphRenderer(null);
    renderer.setGraph(payload.renderGraph);
    renderer.setStyle(payload.style);
    renderer.fitView({ viewportWidth: 100, viewportHeight: 50, padding: 5 });

    expect(renderer.snapshot()).toMatchObject({
      nodeCount: 2,
      edgeCount: 1,
      positions: [0, 0, 10, 10],
      hasStyle: true,
    });
  });
});


import { readFileSync as mlRead } from "node:fs";
import { buildGraphRendererPayload as mlBrowser } from "../studio/src/lib/graphRendererPayload.js";
import { withReconcileEdge as mlOverlay } from "../studio/src/lib/graphAdapter.js";
const mlSceneNodes=[{id:"a",label:"A",x:0,y:0,weight:1,shape:"dot"},{id:"b",label:"B",x:10,y:0,weight:1,shape:"dot"}];
const mlSeven=[...[0,1,2,3].map(i=>({source:"a",target:"b",relation:"r"+i,confidence:i%2?"INFERRED":"EXTRACTED"})),...[0,1,2].map(i=>({source:"b",target:"a",relation:"r"+i,confidence:i%2?"EXTRACTED":"AMBIGUOUS"}))];
describe("L0-T studio lanes",()=>{
 for(const surface of ["node","browser"]) describe(surface,()=>{
  const build=(edges:any[],off=false)=>surface==="node"?buildStudioRenderBuffers({nodes:mlSceneNodes,edges} as never,{edgeCurvature:off?0:0.15}):mlBrowser({nodes:mlSceneNodes,edges},{curvedLinks:!off});
  it.fails("studio-lanes-4f3r-distinct-curved-off-zero",()=>{
   let canonical:string|undefined;
   for(const edges of [mlSeven,[...mlSeven].reverse(),[...mlSeven.slice(3),...mlSeven.slice(0,3)]]){
    const payload=build(edges),curves=Array.from(payload.style.edgeCurvatures);
    expect(curves).toHaveLength(7);
    const indexed=Array.from(payload.renderGraph.edgeInputIndices,(inputIndex,index)=>({edge:edges[inputIndex],curve:curves[index]}));
    const geometric=indexed.map(({edge,curve})=>curve*(edge.source==="a"?1:-1));
    expect(new Set(geometric).size).toBe(7);
    const mapped=indexed.map(({edge,curve})=>({key:JSON.stringify([edge.source,edge.target,edge.relation]),curve})).sort((a,b)=>a.key<b.key?-1:1);
    mapped.forEach((entry,i)=>expect(entry.curve).toBeCloseTo(0.15+(i<4?i:i-4)*0.12,6));
    const bytes=JSON.stringify(mapped);canonical??=bytes;expect(bytes).toBe(canonical);
   }
  });
  it("singleton curvature, OFF option and explicit curvature keep their contracts",()=>{
   expect(Array.from(build([mlSeven[0]]).style.edgeCurvatures)[0]).toBeCloseTo(0.15,6);
   expect(Array.from(build(mlSeven,true).style.edgeCurvatures)).toEqual(Array(7).fill(0));
   const explicit=build([{...mlSeven[0],curvature:0.72}]);
   expect(Array.from(explicit.style.edgeCurvatures)[0]).toBeCloseTo(0.72,6);
  });
 });
 it("renderer-retention-resolved-version",()=>{
  const resolved=JSON.parse(mlRead(new URL("../node_modules/@sentropic/graph/package.json",import.meta.url),"utf8"));
  expect(resolved.name).toBe("@sentropic/graph");
  expect(resolved.version).toMatch(/^\d+\.\d+\.\d+/);
  const payload=buildStudioRenderBuffers({nodes:mlSceneNodes,edges:[{source:"a",target:"b",relation:"reads"},{source:"a",target:"b",relation:"writes"},{source:"b",target:"a",relation:"calls"}]} as never);
  expect(payload.renderGraph.droppedEdges).toBe(0);
  expect(Array.from(payload.renderGraph.edgeInputIndices)).toEqual([0,1,2]);
  expect(Array.from(payload.renderGraph.edges)).toEqual([0,1,0,1,1,0]);
  expect(payload.renderGraph.edges.length).toBe(2*3);
  const renderer=createGraphRenderer(null);renderer.setGraph(payload.renderGraph);renderer.setStyle(payload.style);expect(renderer.snapshot().edgeCount).toBe(3);
 });
 it("reconcile overlay stays suppressed by any real relation in either direction",()=>{
  for(const e of mlSeven){const scene={nodes:mlSceneNodes,edges:[e]};expect(mlOverlay(scene,"a","b")).toBe(scene);}
  expect(mlOverlay({nodes:mlSceneNodes,edges:[]},"a","b").edges).toHaveLength(1);
 });
});
