// Corpus manifest test (frozen spec M3-R4 deb64b75, §8; design note
// round 3, section D). The manifest lists every §8 item — A1–A5, HRPN,
// S2-target, the §8.7 derived oracle and the BPMN items assigned to
// Engram — each with its immutable source (revision and path) and byte
// sha256. This test fails if any §8 item is missing or if any carried
// sha256 drifts. Fixture bytes carried in this repository are verified
// verbatim; remote-only sources resolve with git show revision:path.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = process.env.DIAGRAM_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));

import {
  CORPUS_MANIFEST,
  REQUIRED_CORPUS_IDS,
  corpusEntryById,
} from "../src/ontology-guardian/diagram-corpus.js";
import {
  SEALED_STABLE_ID_ALLOCATIONS,
  STABLE_ID_EXPECTATIONS,
  UML_MULTIPLICITY_ORACLE,
  stableId,
} from "../src/ontology-guardian/diagram-oracle.js";
import {
  ARCHIMATE_RELATIONSHIP_IDS,
  expandArchimateTuples,
} from "../src/ontology-guardian/diagram-profiles.js";
import { buildArchimateMatrixCases } from "../src/ontology-guardian/diagram-oracle.js";

import { sourceIndex, corpusBytes } from "./diagram-corpus-support.js";

const shaFile = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("corpus manifest completeness (§8)", () => {
  it("lists every §8 item exactly once", () => {
    const ids = CORPUS_MANIFEST.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...REQUIRED_CORPUS_IDS].sort());
    for (const id of REQUIRED_CORPUS_IDS) {
      expect(corpusEntryById(id)?.id).toBe(id);
    }
  });

  it("pins every entry with a full sha256 and a stated expectation", () => {
    for (const e of CORPUS_MANIFEST) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.source.repo.length).toBeGreaterThan(0);
      expect(e.source.revision.length).toBeGreaterThan(0);
      expect(e.source.path.length).toBeGreaterThan(0);
      expect(e.expectation.length).toBeGreaterThan(0);
    }
  });

  it("keeps the carried fixture bytes verbatim", () => {
    expect(CORPUS_MANIFEST).toEqual(sourceIndex.map(({ fixture, ...entry }) => entry));
    for (const entry of CORPUS_MANIFEST) {
      expect(createHash("sha256").update(corpusBytes(entry.id)).digest("hex"), entry.id).toBe(entry.sha256);
      expect(entry.source.revision).toMatch(/^(?:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/);
    }
  });

  it("keeps HRPN producer snapshots distinct from the frozen fixtures (§8.6)", () => {
    expect(corpusEntryById("hrpn-producer:data.json")!.sha256).not.toBe(
      corpusEntryById("instance:A5-manifest")!.sha256,
    );
    // The frozen A5 payloads resolve independently of the producer bytes.
    for (const id of ["instance:A5-semantic", "instance:A5-view", "instance:A5-manifest"]) {
      expect(corpusEntryById(id)!.kind).toBe("instance");
    }
    for (const id of [
      "hrpn-producer:data.json", "hrpn-producer:scene-metadata.mjs", "hrpn-producer:SCENES.md",
      "hrpn-producer:figures.json", "hrpn-producer:S2-target.png",
    ]) {
      expect(corpusEntryById(id)!.kind).toBe("producer-snapshot");
    }
  });

  it("covers A1–A5 with sources, counts and folds in the derived oracle", () => {
    const oracle = JSON.parse(
      readFileSync(join(testsDir, "fixtures", "pinned-sources", "m3-r4-derived-oracle.json"), "utf8"),
    ) as {
      instances: {
        id: string; source?: string; scene?: string; sourceSha256?: string;
        counts: unknown; defaultFolds: unknown;
      }[];
    };
    expect(oracle.instances.map((i) => i.id).sort()).toEqual(["A1", "A2", "A3", "A4a", "A4b", "A5"]);
    for (const instance of oracle.instances) {
      const provenance = instance.source ?? instance.scene ?? instance.sourceSha256 ?? "";
      expect(provenance.length).toBeGreaterThan(0);
      if (instance.sourceSha256 !== undefined) expect(instance.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(instance.counts as Record<string, unknown>).length).toBeGreaterThan(0);
      expect(Array.isArray(instance.defaultFolds)).toBe(true);
    }
  });

  it("carries the rejection oracles: multiplicity refusals and matrix rejections", () => {
    expect(UML_MULTIPLICITY_ORACLE.some((r) => !r.expected.ok)).toBe(true);
    const cases = buildArchimateMatrixCases(expandArchimateTuples(), ARCHIMATE_RELATIONSHIP_IDS);
    expect(cases.length).toBe(62 * 62 * 11);
    expect(cases.some((c) => c.expected === "rejected")).toBe(true);
    expect(cases.some((c) => c.expected === "allowed")).toBe(true);
  });

  it("replays the sealed stable ids by execution with four allocations", () => {
    expect(SEALED_STABLE_ID_ALLOCATIONS).toHaveLength(4);
    expect(SEALED_STABLE_ID_ALLOCATIONS.map((a) => stableId(a.owner, a.slot, a.key))).toEqual(
      [...STABLE_ID_EXPECTATIONS],
    );
  });
});
