import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { rebuildCode } from "../src/watch.js";
import { RelationEdgeInvariantError } from "../src/graph.js";
import * as exports from "../src/export.js";
import * as citations from "../src/citations.js";
import * as files from "../src/storage/file.js";
import { projectGraphForPortableInspection, scanPortableGraphifyArtifacts } from "../src/portable-artifacts.js";
import { edge, node, tempDir } from "./helpers/multi-links.js";

it.each(["legacy", "captured"])("watcher rejects parseable overflow in %s evidence before persistence", async kind => {
  const root = tempDir(), state = join(root, ".engram");
  mkdirSync(join(state, "ontology"), { recursive: true });
  writeFileSync(join(root, "f.ts"), "export function alpha() { return beta(); }\nexport function beta() { return 1; }\n");
  const observation = '"source_file":"f.ts","confidence_score":1e400';
  const evidence = kind === "legacy" ? observation : '"evidence_observations":[{' + observation + '}]';
  const text = '{"nodes":[{"id":"a"},{"id":"b"}],"links":[{"source":"a","target":"b","relation":"reads",' + evidence + '},{"source":"a","target":"b","relation":"writes","source_file":"f.ts"}]}';
  const raw = JSON.parse(text);
  expect(kind === "legacy" ? raw.links[0].confidence_score : raw.links[0].evidence_observations[0].confidence_score).toBe(Infinity);
  const path = join(state, "graph.json"), sidecar = join(state, "ontology/citations.json");
  writeFileSync(path, text);
  writeFileSync(sidecar, "citation sentinel");
  const before = readFileSync(path), beforeSidecar = readFileSync(sidecar);
  const persist = vi.spyOn(exports, "persistGraphWithCitations");
  const citationWrite = vi.spyOn(citations, "writeCitationsSidecar");
  const reproject = vi.spyOn(citations, "reprojectCitationsLLMFree");
  const mirror = vi.spyOn(files, "createFileGraphStore");
  try {
    await expect(rebuildCode(root, false, { force: true, noCluster: true, clearStale: false, citationsReproject: true }))
      .rejects.toThrow(RelationEdgeInvariantError);
    expect(readFileSync(path).equals(before)).toBe(true);
    expect(readFileSync(sidecar).equals(beforeSidecar)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(citationWrite).not.toHaveBeenCalled();
    expect(reproject).not.toHaveBeenCalled();
    expect(mirror).not.toHaveBeenCalled();
  } finally { persist.mockRestore(); citationWrite.mockRestore(); reproject.mockRestore(); mirror.mockRestore(); }
});

it("two successive real watcher rebuilds retain every observation and are byte-stable", async () => {
  const root = tempDir(), state = join(root, ".engram");
  mkdirSync(state);
  // Seed stored links to exercise snapshot replay, including absolute provenance.
  const nodes = [node("a", { source_file: "" }), node("b", { source_file: "" })];
  const links = [edge({ relation: "reads", source_file: join(root, "f.ts"), source_location: "L1" }), edge({ relation: "writes", source_location: "L2" }), edge({ source: "b", target: "a", source_location: "L3" })];
  const path = join(state, "graph.json");
  writeFileSync(path, JSON.stringify({ nodes, links }));
  const options = { force: true, noCluster: true, clearStale: false };
  expect(await rebuildCode(root, false, options)).toBe(true);
  const first = readFileSync(path);
  expect(await rebuildCode(root, false, options)).toBe(true);
  const second = readFileSync(path);
  expect(second.equals(first)).toBe(true);
  const raw = JSON.parse(second.toString());
  expect(raw.links).toHaveLength(3);
  expect(raw.links.flatMap((row: any) => row.evidence_observations)).toHaveLength(3);
  expect(raw.links.find((row: any) => row.relation === "reads").source_file).toBe(join(root, "f.ts"));
  console.log("WATCHER_BYTE_STABILITY", createHash("sha256").update(first).digest("hex"), first.length);
});

it("portable inspection projects captured paths while persistence retains verbatim provenance", () => {
  const root = tempDir(), state = join(root, ".engram");
  mkdirSync(state);
  const absolute = join(root, "f.ts");
  const record = { source_file: absolute, confidence: "INFERRED" };
  const raw = { graph_format: "engram-graph/2", nodes: [], links: [{ ...edge({ source_file: absolute }), evidence_observations: [record] }] };
  const before = JSON.stringify(raw);
  const projected = projectGraphForPortableInspection(raw, root) as typeof raw;
  expect(projected.links[0].source_file).toBe("f.ts");
  expect(projected.links[0].evidence_observations[0].source_file).toBe("f.ts");
  expect(JSON.stringify(raw)).toBe(before);
  const path = join(state, "graph.json");
  writeFileSync(path, before);
  expect(scanPortableGraphifyArtifacts(state).ok).toBe(true);
  expect(readFileSync(path, "utf8")).toBe(before);
});
