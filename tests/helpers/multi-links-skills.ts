import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import * as api from "../../src/index.js";
import { buildFromJson } from "../../src/build.js";
import { loadGraphFromData, serializeGraph } from "../../src/graph.js";
import { rows, type Row } from "./multi-links.js";

export const skillDocuments = ["skill.md", "skill-claw.md", "skill-droid.md", "skill-opencode.md", "skill-trae.md", "skill-windows.md"].map(name => "src/skills/" + name);
export interface SkillCode { path: string; text: string; portable?: string; portableBytes?: string; scripts: string[] }
export function readSkill(path: string): SkillCode {
  const text = readFileSync(path, "utf8");
  const markers = [...text.matchAll(/<!--([^>]+)-->/g)];
  const start = markers.find(m => /(?:multi.links|portable|relation)/i.test(m[1]) && /begin|start/i.test(m[1]));
  const end = start && markers.find(m => m.index! > start.index! && /(?:multi.links|portable|relation)/i.test(m[1]) && /end|stop/i.test(m[1]));
  const portableBytes = start && end ? text.slice(start.index! + start[0].length, end.index) : undefined;
  const portable = portableBytes?.trim().replace(/^```(?:javascript|js|typescript|ts)\s*\n/, "").replace(/\n```$/, "");
  const scripts = [...text.matchAll(/node\s+-e\s+"\n([\s\S]*?)^\s*"\s*$/gm)].map(m => m[1].replace(/\\([\\$`"])/g, "$1"));
  return { path, text, portable, portableBytes, scripts };
}
const localRequire = createRequire(resolve("package.json"));
export function executeSnippet(source: string, raw: Row, fresh: Row) {
  const logs: string[] = [], writes: Row[] = [];
  const fs = {
    readFileSync(path: string) {
      if (/\/(?:\.graphify_extract|\.engram_extract)\.json$/.test(path)) return JSON.stringify(fresh);
      if (/\/\.graphify_incremental\.json$/.test(path)) return JSON.stringify({ deleted_files: [] });
      if (/\/\.graphify_analysis\.json$/.test(path)) return JSON.stringify({ communities: {} });
      if (/\/graph\.json$/.test(path)) return JSON.stringify(raw);
      return readFileSync(path, "utf8"); // e.g. an explicitly referenced authored portable module
    },
    existsSync(path: string) { return /\/(?:graph|\.graphify_(?:extract|incremental|analysis))\.json$/.test(path) || existsSync(path); },
    writeFileSync(path: string, contents: string) { writes.push({ path, contents }); },
  };
  const require = (name: string) => name === "fs" || name === "node:fs" ? fs : name === "@sentropic/engram" || name === "@sentropic/graphify" ? api : localRequire(name);
  const names = ["loadGraphFromData", "serializeGraph", "mergeEdgeEvidence", "upsertRelationEdge", "getPairEdges", "observationKey", "assertionIdentityOf", "prepareFreshExtraction", "legacyObservationFromRawLink", "canonicalBytes"];
  const capture = names.map(n => n + ": typeof " + n + " === 'undefined' ? undefined : " + n).join(",");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} as Row };
  const result = new Function("require", "console", "process", "module", "exports", compiled + "\nreturn { G:typeof G==='undefined'?undefined:G,GExisting:typeof GExisting==='undefined'?undefined:GExisting," + capture + "};")(
    require, { log: (...args: unknown[]) => logs.push(args.map(String).join(" ")), error: (...args: unknown[]) => logs.push(args.map(String).join(" ")), warn: (...args: unknown[]) => logs.push(args.map(String).join(" ")) }, { exit(code = 0) { throw new Error("shipped snippet exited with code " + code); } }, module, module.exports,
  );
  return { ...module.exports, ...Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined)), logs, writes };
}
export function skillOperations(skill: SkillCode, raw: Row, fresh: Row) {
  // Markers never substitute for the shipped consumers. Each separate node -e
  // snippet gets its own lexical scope, just as the document instructs.
  const merge = skill.scripts.find(s => /GExisting/.test(s) && /GNew\.forEachEdge/.test(s));
  const query = skill.scripts.find(s => /const question\s*=/.test(s) && /subgraphEdges/.test(s));
  const path = skill.scripts.find(s => /const aTerm\s*=/.test(s));
  const neighbors = skill.scripts.find(s => /const term\s*=/.test(s) && /CONNECTIONS/.test(s));
  if (!merge || !query || !path || !neighbors) throw new Error(skill.path + ": missing executable loader/merge/query/path/neighbours block");
  const labels = raw.nodes.map((n: Row) => n.label || n.id);
  const queryCode = query.replace(/'QUESTION'/g, JSON.stringify(labels[0])).replace(/'MODE'/g, "'bfs'").replace(/\bBUDGET\b/g, "2000");
  const pathCode = path.replace(/'NODE_A'/g, JSON.stringify(labels[0])).replace(/'NODE_B'/g, JSON.stringify(labels[1] ?? labels[0]));
  const neighborCode = neighbors.replace(/'NODE_NAME'/g, JSON.stringify(labels[0]));
  const loaded = executeSnippet(merge, raw, { nodes: [], edges: [], hyperedges: [], input_tokens: 0, output_tokens: 0 }).GExisting;
  const merged = executeSnippet(merge, raw, fresh).GExisting;
  let queried: ReturnType<typeof executeSnippet> | undefined, queryError: unknown;
  try { queried = executeSnippet(queryCode, raw, fresh); } catch (error) { queryError = error; }
  let pathed: ReturnType<typeof executeSnippet> | undefined, pathError: unknown;
  let neighbored: ReturnType<typeof executeSnippet> | undefined, neighborsError: unknown;
  try { pathed = executeSnippet(pathCode, raw, fresh); } catch (error) { pathError = error; }
  try { neighbored = executeSnippet(neighborCode, raw, fresh); } catch (error) { neighborsError = error; }
  return { loaded, merged, query: queried?.logs, queryError, path: pathed?.logs, pathError, neighbors: neighbored?.logs, neighborsError };
}

export async function executePushSnippet(skill: SkillCode, fresh: Row) {
  const source = skill.scripts.find(s => /\bpushToNeo4j\(/.test(s));
  if (!source) throw new Error(skill.path + ": missing executable pushToNeo4j consumer");
  // Await an authored IIFE when present. Five current copies omit await on the
  // wrapper; do not repair that omission in the harness. Drain pending calls
  // only AFTER their actual console statements, so cleanup cannot leak mocks.
  const logs: string[] = [];
  const pending: Promise<unknown>[] = [];
  const exposedApi = new Proxy(api, { get(target, property) {
    if (property !== "pushToNeo4j") return Reflect.get(target, property);
    return (...args: Parameters<typeof api.pushToNeo4j>) => { const result = api.pushToNeo4j(...args); pending.push(result); return result; };
  } });
  const require = (name: string) => name === "fs" ? { readFileSync: (path: string) => JSON.stringify(path.includes("analysis") ? { communities: {} } : fresh) } : name === "@sentropic/engram" || name === "@sentropic/graphify" ? exposedApi : localRequire(name);
  const code = source.trim().replace(/^\(async\s*\(\)\s*=>/, "return (async () =>");
  await new Function("require", "console", "process", code)(require, { log: (...args: unknown[]) => logs.push(args.map(String).join(" ")), warn: (...args: unknown[]) => logs.push(args.map(String).join(" ")), error: (...args: unknown[]) => logs.push(args.map(String).join(" ")) }, { exit(code: number) { throw new Error("shipped push exited with code " + code); } });
  await Promise.all(pending);
  return logs;
}
export const canonicalRows = (G: any) => {
  const sort = (v: any): any => Array.isArray(v) ? v.map(sort) : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
  return JSON.stringify(rows(G).map(sort).sort((a,b)=>JSON.stringify([a.source,a.target,a.relation])<JSON.stringify([b.source,b.target,b.relation])?-1:1));
};
export function coreHistory(raw: Row, fresh: Row) {
  const loaded = loadGraphFromData(raw);
  const nodes = new Map<string, Row>();
  for (const n of [...raw.nodes, ...fresh.nodes]) nodes.set(n.id, { ...nodes.get(n.id), ...n });
  const merged = buildFromJson({ ...fresh, nodes: [...nodes.values()], edges: [...(serializeGraph(loaded).links ?? []), ...fresh.edges] } as never, { directed: raw.directed });
  return { loaded, merged };
}
