import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFromJson } from "../src/build.js";
import { toJson } from "../src/export.js";
import {
  assembleMemoryGraphProjection,
  attachMemoryProjectionToGraph,
  type MemoryGraphCandidateV1,
} from "../src/graph-memory-projection.js";

const CEILING = 52_428_800;
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function bulkCandidates(): MemoryGraphCandidateV1[] {
  return Array.from({ length: 100 }, (_, index) => ({
    record_id: `mem:bulk:${String(index).padStart(3, "0")}`,
    state: "accepted_current",
    projection_eligible: true,
    authorized: true,
    eligible_now: true,
    record_digest: `sha256:${"a".repeat(64)}`,
    scope_ref: "scope:l3",
    valid_time: { t: 1 },
    projection_cursor: "7",
    citation_refs: [...Array.from({ length: 1041 }, () => "y".repeat(500)), "z".repeat(index === 0 ? 163 : 115)],
    code_targets: [index % 2 === 0 ? "alpha_fn" : "beta_fn"],
  }));
}

function input(candidates: MemoryGraphCandidateV1[]) {
  return { high_water_cursor: "7", projection_cursor: "7", candidates, code_node_ids: ["alpha_fn", "beta_fn"] };
}

describe("MCP-L3 persisted memory byte ceiling", () => {
  it("should measure the writer's UTF-8 rows and accept only through the exact byte boundary", () => {
    const candidate = bulkCandidates()[0]!;
    candidate.citation_refs = ['é漢"\\\n'];
    const result = assembleMemoryGraphProjection(input([candidate]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const G = buildFromJson({
      nodes: [{ id: "alpha_fn", label: "alpha", file_type: "code", source_file: "sample.ts" }],
      edges: [], input_tokens: 0, output_tokens: 0,
    });
    attachMemoryProjectionToGraph(G, result.value);
    const dir = mkdtempSync(join(tmpdir(), "l3-byte-boundary-"));
    dirs.push(dir);
    const path = join(dir, "graph.json");
    expect(toJson(G, new Map(), path, { memoryHighWaterCursor: "7" })).toBe(true);
    const written = JSON.parse(readFileSync(path, "utf-8"));
    const nodes = written.nodes.filter((node: { file_type: string }) => node.file_type === "memory");
    const bytes = Buffer.byteLength(JSON.stringify({ nodes, links: written.links }, null, 2), "utf-8");
    expect(result.value.raw_byte_size).toBe(bytes);
    expect(assembleMemoryGraphProjection({ ...input([candidate]), byte_ceiling: bytes }).ok).toBe(true);
    expect(assembleMemoryGraphProjection({ ...input([candidate]), byte_ceiling: bytes - 1 }))
      .toMatchObject({ ok: false, error: { code: "PROJECTION_OVERSIZED" } });
  });

  it("should refuse 100 memories at exactly 52,428,800 compact bytes before assembly", () => {
    const result = assembleMemoryGraphProjection(input(bulkCandidates()));
    expect(result).toMatchObject({ ok: false, error: { code: "PROJECTION_OVERSIZED" } });
  });

});
