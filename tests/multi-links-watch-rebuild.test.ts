import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { expect, it } from "vitest";
import { rebuildCode } from "../src/watch.js";
import { projectGraphForPortableInspection, scanPortableGraphifyArtifacts } from "../src/portable-artifacts.js";
import { edge, node, tempDir } from "./helpers/multi-links.js";

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
