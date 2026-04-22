import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";
import {
  buildFlowArtifact,
  detectEntryPoints,
  getFlowById,
  listFlows,
  readFlowArtifact,
  traceFlows,
  writeFlowArtifact,
} from "../src/flows.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-flows-"));
  tempDirs.push(dir);
  return dir;
}

function qn(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function addFunction(
  G: Graph,
  name: string,
  options: {
    path?: string;
    kind?: "Function" | "Test";
    decorators?: string[];
  } = {},
): string {
  const filePath = options.path ?? "app.py";
  const id = qn(filePath, name);
  G.addNode(id, {
    label: name,
    kind: options.kind ?? "Function",
    qualified_name: id,
    source_file: filePath,
    line_start: 1,
    line_end: 10,
    language: filePath.endsWith(".ts") ? "ts" : "python",
    decorators: options.decorators,
  });
  return id;
}

function addCall(G: Graph, source: string, target: string, filePath: string = "app.py"): void {
  if (G.type === "directed") {
    G.addDirectedEdge(source, target, {
      relation: "calls",
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: "L5",
    });
    return;
  }
  G.addUndirectedEdge(source, target, {
    relation: "calls",
    confidence: "EXTRACTED",
    source_file: filePath,
    source_location: "L5",
    _src: source,
    _tgt: target,
  });
}

describe("execution flows", () => {
  it("detects roots, framework decorators, and conventional names while excluding tests by default", () => {
    const G = new Graph({ type: "directed" });
    const entry = addFunction(G, "entry_func");
    const helper = addFunction(G, "helper");
    const caller = addFunction(G, "caller");
    const decorated = addFunction(G, "get_users", { decorators: ["app.get('/users')"] });
    addFunction(G, "main");
    addFunction(G, "on_message");
    addFunction(G, "it:should work", { kind: "Test", path: "tests/service.test.ts" });
    addFunction(G, "describe_block", { path: "src/service.spec.ts" });
    addCall(G, entry, helper);
    addCall(G, caller, decorated);
    const store = createReviewGraphStore(G);

    const defaultNames = detectEntryPoints(store).map((node) => node.name);
    expect(defaultNames).toContain("entry_func");
    expect(defaultNames).toContain("get_users");
    expect(defaultNames).toContain("main");
    expect(defaultNames).toContain("on_message");
    expect(defaultNames).not.toContain("helper");
    expect(defaultNames).not.toContain("it:should work");
    expect(defaultNames).not.toContain("describe_block");

    const allNames = detectEntryPoints(store, { includeTests: true }).map((node) => node.name);
    expect(allNames).toContain("it:should work");
    expect(allNames).toContain("describe_block");
  });

  it("traces CRG-style BFS flows with cycle protection, max depth, and trivial-flow skipping", () => {
    const G = new Graph({ type: "directed" });
    const main = addFunction(G, "main");
    const first = addFunction(G, "first");
    const second = addFunction(G, "second");
    const third = addFunction(G, "third");
    addFunction(G, "lonely");
    addCall(G, main, first);
    addCall(G, first, second);
    addCall(G, second, first);
    addCall(G, second, third);
    const store = createReviewGraphStore(G);

    const flows = traceFlows(store, { maxDepth: 2 });
    const mainFlow = flows.find((flow) => flow.entryPoint === main);

    expect(mainFlow?.qualifiedPath).toEqual([main, first, second]);
    expect(mainFlow?.nodeCount).toBe(3);
    expect(mainFlow?.depth).toBe(2);
    expect(flows.some((flow) => flow.entryPoint.endsWith("lonely"))).toBe(false);
  });

  it("reports multi-file flow spread and CRG criticality signals", () => {
    const G = new Graph({ type: "directed" });
    const singleA = addFunction(G, "single_a", { path: "one.py" });
    const singleB = addFunction(G, "single_b", { path: "one.py" });
    const api = addFunction(G, "login_handler", { path: "routes.py" });
    const service = addFunction(G, "check_password", { path: "services.py" });
    const repo = addFunction(G, "persist_session", { path: "repo.py" });
    addCall(G, singleA, singleB, "one.py");
    addCall(G, api, service, "routes.py");
    addCall(G, service, repo, "services.py");
    const store = createReviewGraphStore(G);

    const flows = traceFlows(store);
    const single = flows.find((flow) => flow.entryPoint === singleA);
    const secure = flows.find((flow) => flow.entryPoint === api);

    expect(single?.fileCount).toBe(1);
    expect(secure?.fileCount).toBe(3);
    expect(secure?.files).toEqual(["repo.py", "routes.py", "services.py"]);
    expect(secure?.criticality).toBeGreaterThanOrEqual(single?.criticality ?? 0);
    for (const flow of flows) {
      expect(flow.criticality).toBeGreaterThanOrEqual(0);
      expect(flow.criticality).toBeLessThanOrEqual(1);
    }
  });

  it("roundtrips .graphify flow artifacts and returns detailed flow steps", () => {
    const G = new Graph({ type: "directed" });
    const entry = addFunction(G, "entry");
    const callee = addFunction(G, "callee");
    addCall(G, entry, callee);
    const store = createReviewGraphStore(G);
    const artifact = buildFlowArtifact(store, {
      graphPath: ".graphify/graph.json",
      generatedAt: "2026-04-22T00:00:00.000Z",
    });
    const out = join(tempDir(), ".graphify", "flows.json");

    writeFlowArtifact(artifact, out);
    const restored = readFlowArtifact(out);
    const listed = listFlows(restored);
    const detail = getFlowById(restored, listed[0]!.id, store);

    expect(JSON.parse(readFileSync(out, "utf-8")).version).toBe(1);
    expect(listed).toHaveLength(1);
    expect(detail?.steps.map((step) => step.name)).toEqual(["entry", "callee"]);
    expect(detail?.steps[0]).toMatchObject({
      kind: "Function",
      file: "app.py",
      qualifiedName: entry,
    });
  });

  it("does not trace undirected CALLS edges without preserved direction and emits a warning", () => {
    const G = new Graph({ type: "undirected" });
    const source = addFunction(G, "source");
    const target = addFunction(G, "target");
    G.addUndirectedEdge(source, target, {
      relation: "calls",
      confidence: "EXTRACTED",
      source_file: "app.py",
    });
    const store = createReviewGraphStore(G);

    const artifact = buildFlowArtifact(store, { generatedAt: "2026-04-22T00:00:00.000Z" });

    expect(artifact.flows).toEqual([]);
    expect(artifact.warnings.join("\n")).toContain("direction");
  });
});
