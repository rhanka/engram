import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compileNormalizerByNodeType } from "../src/entity-normalizer.js";
import {
  buildRegistryIndex,
  linkEntities,
  resolveEntityCandidate,
  verifyRawCandidate,
  writeEntityLinkingArtifacts,
} from "../src/entity-linking.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import { buildEntitySidecar } from "../src/studio-assets.js";
import type { NormalizedOntologyProfile, OntologyProfile, RegistryRecord } from "../src/types.js";

const cleanup: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-link-"));
  cleanup.push(root);
  return root;
}

function profile(root: string, linking: NonNullable<OntologyProfile["node_types"]>["Zone"]["linking"], partitioned = true): NormalizedOntologyProfile {
  return normalizeOntologyProfile({
    id: "link-test",
    version: 1,
    node_types: { Zone: { registry: "zones", linking } },
    relation_types: {},
    registries: {
      zones: {
        source: "zones",
        id_column: "id",
        label_column: "label",
        alias_columns: ["alias"],
        node_type: "Zone",
        ...(partitioned ? { partition_column: "municipality" } : {}),
      },
    },
    outputs: { ontology: { occurrence_node_types: ["Zone"] } },
  }, join(root, "ontology-profile.yaml"));
}

function record(id: string, label: string, partition = "compton", aliases: string[] = []): RegistryRecord {
  return {
    registryId: "zones",
    id,
    label,
    aliases,
    nodeType: "Zone",
    partition,
    sourceFile: "/registry/zones.csv",
    raw: {},
  };
}

function writeDoc(root: string, name: string, content: string): string {
  const path = join(root, "docs", name);
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(path, content, "utf-8");
  return path;
}

afterEach(() => {
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe("graphify link deterministic core", () => {
  it("links a lexicon mention only within its frontmatter partition with raw-file offsets", () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "---\nmunicipality: compton\n---\n\nLe code C-15 est applicable.\n");
    const normalized = profile(root, {
      preset: "gazetteer-exact",
      partition_from: { source_frontmatter: "municipality" },
    });
    const result = linkEntities({
      root,
      profile: normalized,
      registries: { zones: [record("compton-c15", "C-15", "compton"), record("other-c15", "C-15", "other")] },
      sourceFiles: [source],
    });

    expect(result.issues.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toMatchObject({
      raw_span: "C-15",
      registry_record_id: "compton-c15",
      registry_partition: "compton",
      resolution: "linked",
      detector: "lexicon",
      source_file: "docs/compton.md",
    });
    const occurrence = result.occurrences[0]!;
    expect(readFileSync(source, "utf-8").slice(occurrence.offsets.start, occurrence.offsets.end)).toBe(occurrence.raw_span);
  });

  it("fails closed before detection when a partitioned document has no binding", () => {
    const root = tempRoot();
    const source = writeDoc(root, "missing.md", "C-15\n");
    const result = linkEntities({
      root,
      profile: profile(root, { preset: "gazetteer-exact", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15")] },
      sourceFiles: [source],
    });

    expect(result.occurrences).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LINK_PARTITION_UNRESOLVED", severity: "error" })]));
  });

  it("does not turn a pattern-shaped non-member into an invented registry value", () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "---\nmunicipality: compton\n---\n\nC-999\n");
    const result = linkEntities({
      root,
      profile: profile(root, {
        detect: [{ pattern: { form: "C-\\d+" } }],
        resolve: "exact",
        partition_from: { source_frontmatter: "municipality" },
      }),
      registries: { zones: [record("compton-c15", "C-15")] },
      sourceFiles: [source],
    });

    expect(result.occurrences).toEqual([]);
  });

  it("keeps exact linked, ambiguous, and unlinked buckets deterministic", () => {
    const root = tempRoot();
    const source = writeDoc(root, "buckets.md", "---\nmunicipality: compton\n---\n\nC-15\n");
    const normalized = profile(root, { preset: "gazetteer-exact", partition_from: { source_frontmatter: "municipality" } });
    const normalizer = compileNormalizerByNodeType(normalized).Zone!;
    const unique = buildRegistryIndex("zones", "compton", "test", normalizer, [record("c15", "C-15")]);
    const ambiguous = buildRegistryIndex("zones", "compton", "test-ambiguous", normalizer, [
      record("c15-a", "C-15"),
      record("c15-b", "C-15"),
    ]);
    const candidate = { node_type: "Zone", detector: "lexicon" as const, raw_span: "C-15", source_file: "doc.md", page: 1, offsets: { start: 0, end: 4 } };

    expect(resolveEntityCandidate(candidate, unique, normalizer, "exact")).toMatchObject({ resolution: "linked", registryRecordId: "c15" });
    expect(resolveEntityCandidate(candidate, ambiguous, normalizer, "exact")).toMatchObject({ resolution: "ambiguous", candidateIds: ["c15-a", "c15-b"] });
    expect(resolveEntityCandidate({ ...candidate, raw_span: "C-99" }, unique, normalizer, "exact")).toMatchObject({ resolution: "unlinked" });
    expect(resolveEntityCandidate(candidate, unique, normalizer, "none")).toEqual({ resolution: "unlinked", candidateIds: [] });

    const ambiguousRun = linkEntities({
      root,
      profile: normalized,
      registries: { zones: [record("c15-a", "C-15"), record("c15-b", "C-15")] },
      sourceFiles: [source],
    });
    expect(ambiguousRun.occurrences).toEqual([expect.objectContaining({ resolution: "ambiguous" })]);
    expect(ambiguousRun.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LINK_RESOLUTION_AMBIGUOUS", refs: expect.arrayContaining(["record:c15-a", "record:c15-b"]) }),
    ]));

    const noneRun = linkEntities({
      root,
      profile: profile(root, {
        detect: ["lexicon"],
        resolve: "none",
        partition_from: { source_frontmatter: "municipality" },
      }),
      registries: { zones: [record("c15", "C-15")] },
      sourceFiles: [source],
    });
    expect(noneRun.occurrences).toEqual([expect.objectContaining({ resolution: "unlinked" })]);
    expect(noneRun.occurrences[0]?.registry_record_id).toBeUndefined();
  });

  it("drops non-relocatable candidates at the common raw/verbatim gate", () => {
    expect(verifyRawCandidate("C-15", {
      raw_span: "C-99",
      offsets: { start: 0, end: 4 },
    })).toBe(false);
  });

  it("keeps absent linking opt-in as an explicit no-op and reports deferred LLM presets", () => {
    const root = tempRoot();
    const noLink = normalizeOntologyProfile({
      id: "no-link",
      version: 1,
      node_types: { Zone: { registry: "zones" } },
      relation_types: {},
      registries: { zones: { source: "zones", id_column: "id", label_column: "label", node_type: "Zone" } },
    }, join(root, "profile.yaml"));
    expect(linkEntities({ root, profile: noLink, registries: { zones: [record("c15", "C-15")] }, sourceFiles: [] }).noOp).toBe(true);

    const pending = profile(root, { preset: "open-extraction", partition_from: { source_frontmatter: "municipality" } });
    expect(linkEntities({ root, profile: pending, registries: { zones: [record("c15", "C-15")] }, sourceFiles: [] }).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LINK_LLM_DETECTOR_UNAVAILABLE" })]),
    );
  });

  it("writes the canonical sorted list and a Studio node summary sidecar", () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "---\nmunicipality: compton\n---\n\nC-15 puis C-15.\n");
    const normalized = profile(root, { preset: "gazetteer-exact", partition_from: { source_frontmatter: "municipality" } });
    const result = linkEntities({
      root,
      profile: normalized,
      registries: { zones: [record("c15", "C-15")] },
      sourceFiles: [source],
    });
    const outputDir = join(root, ".graphify", "ontology");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "nodes.json"), JSON.stringify([
      { id: "registry_zones_c15", registry_id: "zones", registry_partition: "compton", registry_record_id: "c15" },
    ]));
    writeEntityLinkingArtifacts(outputDir, normalized, result);

    const occurrences = JSON.parse(readFileSync(join(outputDir, "occurrences.json"), "utf-8"));
    const summary = JSON.parse(readFileSync(join(outputDir, "entity-occurrence-summary.json"), "utf-8"));
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((occurrence: { offsets: { start: number } }) => occurrence.offsets.start)).toEqual([
      ...occurrences.map((occurrence: { offsets: { start: number } }) => occurrence.offsets.start),
    ].sort((left: number, right: number) => left - right));
    expect(summary.registry_zones_c15).toMatchObject({ total: 2, documents: { "docs/compton.md": 2 }, snippets: ["C-15"] });
    expect(buildEntitySidecar(join(root, ".graphify"), "registry_zones_c15").occurrences).toMatchObject({ total: 2 });
  });
});
