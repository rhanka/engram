import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compileOntologyOutputs } from "../src/ontology-output.js";
import { compileNormalizerByNodeType } from "../src/entity-normalizer.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import { generateOntologyReconciliationCandidates } from "../src/ontology-reconciliation.js";
import { loadProfileRegistries } from "../src/profile-registry.js";
import type { Extraction, NormalizedOntologyProfile, OntologyProfile } from "../src/types.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";

const cleanupDirs: string[] = [];
const fixtureModule = join(process.cwd(), "tests", "fixtures", "normalizers", "zone-normalize.mjs");

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-normalizer-"));
  cleanupDirs.push(root);
  return root;
}

function profileSource(root: string): string {
  return join(root, "ontology-profile.yaml");
}

function copyNormalizer(root: string): void {
  copyFileSync(fixtureModule, join(root, "zone-normalize.mjs"));
}

function rawProfile(options: {
  linking?: false | { builtin?: string[]; fn?: string; preset?: string };
} = {}): OntologyProfile {
  const linking = options.linking === false
    ? undefined
    : {
      preset: options.linking?.preset ?? "gazetteer-exact",
      normalize: {
        ...(options.linking?.builtin === undefined ? {} : { builtin: options.linking.builtin }),
        ...(options.linking?.fn === undefined ? {} : { fn: options.linking.fn }),
      },
    };
  return {
    id: "zone-normalizer-test",
    version: 1,
    node_types: {
      Zone: {
        registry: "zones",
        ...(linking ? { linking } : {}),
      },
    },
    relation_types: {},
    registries: {
      zones: {
        source: "zones",
        id_column: "id",
        label_column: "label",
        alias_columns: ["alias"],
        node_type: "Zone",
        partition_column: "partition",
      },
    },
  };
}

function normalizedProfile(
  root: string,
  linking: false | { builtin?: string[]; fn?: string; preset?: string },
): NormalizedOntologyProfile {
  return normalizeOntologyProfile(rawProfile({ linking }), profileSource(root));
}

function bindRegistry(profile: NormalizedOntologyProfile, registryPath: string): NormalizedOntologyProfile {
  return {
    ...profile,
    registries: {
      ...profile.registries,
      zones: { ...profile.registries.zones!, bound_source_path: registryPath },
    },
  };
}

function writeRegistry(root: string, rows: string): string {
  const path = join(root, "zones.csv");
  writeFileSync(path, `id,label,alias,partition\n${rows}`, "utf-8");
  return path;
}

function extraction(nodes: Extraction["nodes"]): Extraction {
  return { input_tokens: 0, output_tokens: 0, nodes, edges: [] };
}

function reconciliationContext(profile: NormalizedOntologyProfile, nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "graph-hash",
    profile,
    profileState: {} as OntologyPatchContext["profileState"],
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

describe("typed-linking normalizer contract", () => {
  it("keeps a node type without linking byte-for-byte on historical output and exact reconciliation", () => {
    const root = tempDir();
    const profile = normalizedProfile(root, false);
    const outputDir = join(root, "ontology");

    compileOntologyOutputs({
      outputDir,
      extraction: extraction([{ id: "cafe", label: "Café-3", aliases: ["Étage A"], type: "Zone" }]),
      profile,
      config: { enabled: true, canonical_node_types: ["Zone"] },
    });

    const nodes = JSON.parse(readFileSync(join(outputDir, "nodes.json"), "utf-8")) as Array<{ normalized_terms: string[] }>;
    const aliases = JSON.parse(readFileSync(join(outputDir, "aliases.json"), "utf-8")) as Array<{ normalized: string }>;
    expect(nodes[0]?.normalized_terms).toEqual(["café-3", "étage a"]);
    expect(aliases[0]?.normalized).toBe("étage a");
    expect(profile.node_types.Zone).toEqual({ registry: "zones" });
    expect(profile.profile_hash).toBe("044e4480a0ce56e5ced55655a9c3047d0ec0dd372a370c25ab61e00449578956");

    const queue = generateOntologyReconciliationCandidates(reconciliationContext(profile, [
      { id: "accented", label: "Café-3", type: "Zone", registry_id: "zones", registry_partition: "compton" },
      { id: "plain", label: "Cafe-3", type: "Zone", registry_id: "zones", registry_partition: "compton" },
    ]), { fuzzy: false, generatedAt: "2026-07-17T00:00:00.000Z" });
    expect(queue.candidates).toEqual([]);
  });

  it("uses one opted-in normalizer for ontology output and reconciliation exact", () => {
    const root = tempDir();
    const profile = normalizedProfile(root, {});
    const outputDir = join(root, "ontology");

    compileOntologyOutputs({
      outputDir,
      extraction: extraction([{ id: "cafe", label: "Café", aliases: ["Café Zone"], type: "Zone" }]),
      profile,
      config: { enabled: true, canonical_node_types: ["Zone"] },
    });

    const nodes = JSON.parse(readFileSync(join(outputDir, "nodes.json"), "utf-8")) as Array<{ normalized_terms: string[] }>;
    const aliases = JSON.parse(readFileSync(join(outputDir, "aliases.json"), "utf-8")) as Array<{ normalized: string }>;
    expect(nodes[0]?.normalized_terms).toEqual(["cafe", "cafe zone"]);
    expect(aliases[0]?.normalized).toBe("cafe zone");

    copyNormalizer(root);
    const fnProfile = normalizedProfile(root, {
      builtin: ["case_fold", "dash_fold", "collapse_ws"],
      fn: "./zone-normalize.mjs#normalizeZoneCode",
    });
    expect(compileNormalizerByNodeType(fnProfile).Zone?.("20  HA")).toBe("ha-20");

    const queue = generateOntologyReconciliationCandidates(reconciliationContext(profile, [
      { id: "accented", label: "Café", type: "Zone", registry_id: "zones", registry_partition: "compton" },
      { id: "plain", label: "Cafe", type: "Zone", registry_id: "zones", registry_partition: "compton" },
    ]), { fuzzy: false, generatedAt: "2026-07-17T00:00:00.000Z" });
    expect(queue.candidates).toEqual([expect.objectContaining({
      tier: "exact",
      score: 1,
      shared_terms: ["cafe"],
    })]);
  });

  it("rejects a non-idempotent registry normalizer before corpus work", () => {
    const root = tempDir();
    copyNormalizer(root);
    const profile = normalizedProfile(root, {
      builtin: ["case_fold"],
      fn: "./zone-normalize.mjs#nonIdempotent",
    });
    const registryPath = writeRegistry(root, "H-1,H-1,,compton\n");

    expect(() => loadProfileRegistries(bindRegistry(profile, registryPath))).toThrow(/not idempotent/);
  });

  it("rejects intra-partition normalizer collisions and accepts equal keys across partitions", () => {
    const root = tempDir();
    copyNormalizer(root);
    const profile = normalizedProfile(root, {
      builtin: ["case_fold"],
      fn: "./zone-normalize.mjs#collapseDigits",
    });
    const collisionPath = writeRegistry(root, "H-1,H-1,,compton\nH-10,H-10,,compton\n");

    expect(() => loadProfileRegistries(bindRegistry(profile, collisionPath))).toThrow(
      /normalizer_collision.*H-1.*H-10/,
    );

    const crossPartitionPath = writeRegistry(
      root,
      "C-15-compton,C-15,,compton\nC-15-other,C-15,,other\n",
    );
    expect(() => loadProfileRegistries(bindRegistry(profile, crossPartitionPath))).not.toThrow();
  });

  it("changes profile_hash when one byte of a local normalizer module changes", () => {
    const root = tempDir();
    copyNormalizer(root);
    const first = normalizedProfile(root, {
      builtin: ["case_fold"],
      fn: "./zone-normalize.mjs#normalizeZoneCode",
    });
    const modulePath = join(root, "zone-normalize.mjs");
    writeFileSync(modulePath, `${readFileSync(modulePath, "utf-8")}\n`, "utf-8");
    const second = normalizedProfile(root, {
      builtin: ["case_fold"],
      fn: "./zone-normalize.mjs#normalizeZoneCode",
    });

    expect(first.node_types.Zone.linking?.normalizer).toMatchObject({
      contract: "graphify_entity_normalizer_v1",
      builtins: ["case_fold@1"],
      export: "normalizeZoneCode",
    });
    expect(second.profile_hash).not.toBe(first.profile_hash);
  });
});
