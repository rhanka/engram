import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadOntologyPatchContext } from "../src/ontology-patch-context.js";
import type { OntologyPatchNode } from "../src/ontology-patch.js";
import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

/**
 * Pins the SURVIVAL of `trust` across the on-disk round-trip.
 *
 * `loadOntologyPatchContext` does not deserialise `nodes.json`; it reprojects it
 * onto an explicit whitelist. A field missing from that whitelist is dropped
 * WITHOUT a word — no error, no warning, green suite — so a corpus could declare
 * provenance tiers while `violatesTrustTier` (memory contract §3.4) stayed
 * dormant and nothing in the output would say so.
 *
 * The guard therefore has to exercise the REAL loader against real files. A test
 * that reimplemented the projection would pin its own copy and drift silently
 * from the code it claims to protect.
 *
 * Anchored on IMPORTED SYMBOLS, never on line numbers: `ontology-reconciliation`
 * measures 2016 lines on `main` against 943 on a feature branch, so a hard-coded
 * range would keep passing while covering nothing — the very defect this file
 * guards against, reproduced inside the guard.
 */

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-trust-roundtrip-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

/** Writes `nodes` verbatim over the fixture's nodes.json, then loads it back. */
function roundTrip(nodes: ReadonlyArray<Record<string, unknown>>): OntologyPatchNode[] {
  const fixture = writeOntologyWriteFixture(makeTempDir());
  writeFileSync(
    join(fixture.stateDir, "ontology", "nodes.json"),
    JSON.stringify(nodes, null, 2),
    "utf-8",
  );
  const loaded = loadOntologyPatchContext(fixture.profileStatePath).nodes;
  // NON-VACUITY CONTROL. Every assertion below reads a node out of this array;
  // an empty one would satisfy all of them by saying nothing at all.
  expect(loaded.length).toBe(nodes.length);
  return loaded;
}

describe("loadOntologyPatchContext trust round-trip", () => {
  it("carries every declared tier through unchanged", () => {
    // All four members, one by one: a whitelist entry that only handled the
    // first would pass a single-tier test and drop the rest in silence.
    const tiers = ["earned", "asserted", "signed", "unverified"] as const;
    const loaded = roundTrip(tiers.map((tier) => ({ id: `node-${tier}`, type: "Component", trust: tier })));

    expect(loaded.map((node) => node.trust)).toEqual([...tiers]);
  });

  it("drops a tier outside the union rather than relaying it", () => {
    // Fail-open on purpose: an unrecognised string relayed as-is would create a
    // FICTIONAL mismatch against a legitimately tiered node and remove that pair
    // from the candidate queue without declaring the loss.
    const [loaded] = roundTrip([{ id: "node-bogus", type: "Component", trust: "not-a-tier" }]);

    expect(loaded!.trust).toBeUndefined();
  });

  it("leaves an untagged node untagged", () => {
    const [loaded] = roundTrip([{ id: "node-untagged", type: "Component" }]);

    expect(loaded!.trust).toBeUndefined();
  });

  it("drops a non-string tier", () => {
    const loaded = roundTrip([
      { id: "node-number", type: "Component", trust: 7 },
      { id: "node-object", type: "Component", trust: { tier: "earned" } },
      { id: "node-null", type: "Component", trust: null },
    ]);

    expect(loaded.map((node) => node.trust)).toEqual([undefined, undefined, undefined]);
  });

  it("keeps the tier independent of the other whitelisted fields", () => {
    // Guards against a projection that carried `trust` but clobbered a
    // neighbour, or vice versa.
    const [loaded] = roundTrip([
      {
        id: "node-full",
        type: "Component",
        label: "Widget",
        status: "validated",
        trust: "earned",
        aliases: ["W"],
        source_refs: ["manual.md#p1"],
      },
    ]);

    expect(loaded).toMatchObject({
      id: "node-full",
      type: "Component",
      label: "Widget",
      status: "validated",
      trust: "earned",
      aliases: ["W"],
      source_refs: ["manual.md#p1"],
    });
  });
});
