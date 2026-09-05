import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { compileOntologyOutputs } from "../src/ontology-output.js";
import type { Extraction, NormalizedOntologyProfile } from "../src/types.js";

/**
 * Pins the `provenance_coverage` block of the ontology manifest.
 *
 * The block answers one question a consumer cannot otherwise ask: how much of
 * this corpus is anchored on a positional citation span. It is a STATISTIC and
 * nothing may branch on it; the test therefore pins its PRESENCE and its counts,
 * never a threshold.
 *
 * The zero case is the one that matters most. A coverage figure omitted when it
 * is zero would make "nothing is anchored" indistinguishable from "nobody
 * measured" — so the block is unconditional, and that is pinned here rather
 * than left to the reader of the writer.
 *
 * Anchored on imported symbols, never on line numbers.
 */

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-provenance-coverage-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

const profile: NormalizedOntologyProfile = {
  id: "synthetic",
  version: "1",
  default_language: "en",
  profile_hash: "profile-hash",
  node_types: { Component: {} },
  relation_types: {},
  registries: {},
  citation_policy: { minimum_granularity: "page", require_source_file: true, allow_bbox: "when_available" },
  hardening: { statuses: ["candidate", "validated"], default_status: "candidate", promotion_requires: [], status_transitions: [] },
  inference_policy: { allow_inferred_relations: true, allowed_relation_types: [], require_evidence_refs: false },
  evidence_policy: { require_evidence_refs: false, min_refs: 0, node_types: [], relation_types: [] },
  hierarchies: {},
  outputs: {
    ontology: {
      enabled: true,
      artifact_schema: "graphify_ontology_outputs_v1",
      canonical_node_types: ["Component"],
      source_node_types: [],
      occurrence_node_types: [],
      alias_fields: [],
      relation_exports: [],
      wiki: { enabled: false, page_node_types: [], include_backlinks: false, include_source_snippets: false },
    },
  },
} as NormalizedOntologyProfile;

/** One Component per entry; `location` undefined means "file only, no span". */
function extractionOf(locations: ReadonlyArray<string | undefined>): Extraction {
  return {
    input_tokens: 0,
    output_tokens: 0,
    nodes: locations.map((location, index) => ({
      id: `component-${index}`,
      label: `Component ${index}`,
      type: "Component",
      file_type: "document",
      source_file: "manual.md",
      ...(location ? { source_location: location } : {}),
      confidence: "EXTRACTED",
      status: "validated",
    })),
    edges: [],
  } as unknown as Extraction;
}

function manifestOf(locations: ReadonlyArray<string | undefined>): Record<string, unknown> {
  const outputDir = join(makeTempDir(), ".graphify", "ontology");
  compileOntologyOutputs({
    outputDir,
    extraction: extractionOf(locations),
    profile,
    config: { enabled: true, canonical_node_types: ["Component"] },
  });
  return JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf-8")) as Record<string, unknown>;
}

describe("ontology manifest provenance_coverage", () => {
  it("counts only the nodes whose source_refs carry a span", () => {
    const manifest = manifestOf(["L12", undefined, "p3", undefined]);

    // NON-VACUITY: `total` also guards the fixture — a profile that filtered
    // every node away would satisfy an anchored-count assertion with nothing.
    expect(manifest.provenance_coverage).toMatchObject({ anchored: 2, total: 4 });
    expect(manifest.node_count).toBe(4);
  });

  it("reports full coverage when every node is anchored", () => {
    expect(manifestOf(["L1", "L2"])).toMatchObject({ provenance_coverage: { anchored: 2, total: 2 } });
  });

  it("PUBLISHES the zero case instead of omitting the block", () => {
    // The load-bearing case. An omitted block would read as "not measured".
    const manifest = manifestOf([undefined, undefined]);

    expect(manifest).toHaveProperty("provenance_coverage");
    expect(manifest.provenance_coverage).toMatchObject({ anchored: 0, total: 2 });
  });

  it("states its criterion in plain words", () => {
    const coverage = manifestOf(["L1"]).provenance_coverage as { criterion?: unknown };

    // A count whose rule is not written down cannot be checked by its reader.
    expect(typeof coverage.criterion).toBe("string");
    expect(coverage.criterion).toContain("span");
  });

  it("stores no derived share alongside its operands", () => {
    const manifest = manifestOf(["L1", undefined]);

    // Assert the block EXISTS before asserting what it lacks. A bare negative
    // would also hold if the block vanished entirely — it would pass while
    // covering nothing, which is the failure mode this whole file guards.
    // Caught by the reverse proof: without this line the case stayed green
    // under the mutation that deleted the block.
    expect(manifest.provenance_coverage).toMatchObject({ anchored: 1, total: 2 });
    // A stored ratio is redundant state that can drift from the two numbers
    // beside it; the division belongs to the reader.
    expect(manifest).not.toHaveProperty("provenance_coverage.share");
  });
});
