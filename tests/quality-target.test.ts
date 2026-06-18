import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  ALL_EXTRACTED_CITATION_CONTRACT,
  canonicalJson,
  discoverQualityTargetsConfig,
  hashCitationExtractionContract,
  loadQualityTargetsConfig,
  validateCitationExtractionContractForTarget,
  validateQualityTarget,
} from "../src/quality-target.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-quality-target-"));
  tempDirs.push(dir);
  return dir;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function targetYaml(contractHash = hashCitationExtractionContract(ALL_EXTRACTED_CITATION_CONTRACT)): string {
  return [
    "quality:",
    "  targets:",
    "    public_studio:",
    "      kind: studio-static-bundle",
    "      bundle_path: .graphify/studio-next",
    "      baseline_bundle_path: .graphify/baselines/public-studio",
    "      publication:",
    "        blocking: true",
    "        require_resolved_manifest: true",
    "        data_only_chrome: true",
    "        chrome_reference_path: .graphify/baselines/public-studio",
    "        deny_source_path_patterns:",
    "          - .graphify/scratch/**",
    "        data_allowlist:",
    "          - graph.json",
    "          - ontology/citations.json",
    "      citations:",
    "        extraction:",
    "          mode: all_extracted",
    "          require_producer_proof: true",
    "          contract_id: graphify_all_extracted_entity_citations_v1",
    "          allowed_contract_hashes:",
    `            - ${contractHash}`,
    "          require_batch_coverage: true",
    "        display: full",
    "        inline:",
    "          mode: top_k",
    "          top_k: 8",
    "        require_sidecar: true",
    "        min_count_by_node:",
    "          character_sherlock_holmes: 89",
    "        no_shrink_by_node:",
    "          character_sherlock_holmes:",
    "            baseline_field: citation_count",
    "            max_drop: 0",
    "      graph:",
    "        min_nodes: 2091",
    "        min_edges: 3168",
    "      reconciliation:",
    "        min_candidates: 31",
    "        require_groupable_by_type: true",
    "      communities:",
    "        require_semantic_labels: false",
    "",
  ].join("\n");
}

describe("quality target config", () => {
  it("loads quality.targets without requiring profile.path or inputs.corpus", () => {
    const root = tempDir();
    const configPath = join(root, "graphify.yaml");
    write(configPath, targetYaml());

    const config = loadQualityTargetsConfig(configPath);
    const target = config.targets.public_studio;

    expect(target).toBeDefined();
    expect(target.resolvedBundlePath).toBe(join(root, ".graphify", "studio-next"));
    expect(target.resolvedBaselineBundlePath).toBe(join(root, ".graphify", "baselines", "public-studio"));
    expect(target.publication.resolvedChromeReferencePath).toBe(
      join(root, ".graphify", "baselines", "public-studio"),
    );
    expect(target.citations.extraction.mode).toBe("all_extracted");
    expect(target.citations.inline).toEqual({ mode: "top_k", top_k: 8 });
    expect(target.citations.min_count_by_node.character_sherlock_holmes).toBe(89);
    expect(validateQualityTarget(target)).toEqual([]);
  });

  it("discovers the same target config filenames as project config", () => {
    const root = tempDir();
    mkdirSync(join(root, ".graphify"), { recursive: true });
    writeFileSync(join(root, ".graphify", "config.yml"), "quality: {}\n", "utf-8");
    writeFileSync(join(root, ".graphify", "config.yaml"), "quality: {}\n", "utf-8");
    writeFileSync(join(root, "graphify.yml"), "quality: {}\n", "utf-8");
    writeFileSync(join(root, "graphify.yaml"), "quality: {}\n", "utf-8");

    const found = discoverQualityTargetsConfig(root);

    expect(found.found).toBe(true);
    expect(found.path).toBe(join(root, "graphify.yaml"));
  });

  it("rejects data-only chrome self comparison", () => {
    const root = tempDir();
    const configPath = join(root, "graphify.yaml");
    write(configPath, targetYaml().replace(
      "chrome_reference_path: .graphify/baselines/public-studio",
      "chrome_reference_path: .graphify/studio-next",
    ));

    const target = loadQualityTargetsConfig(configPath).targets.public_studio;

    expect(validateQualityTarget(target)).toContain(
      "publication.chrome_reference_path must not resolve to the bundle path",
    );
  });
});

describe("structured citation extraction contract", () => {
  it("canonicalizes object keys before hashing", () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 });

    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it("validates the built-in all-extracted contract against the target allowlist", () => {
    const root = tempDir();
    const configPath = join(root, "graphify.yaml");
    write(configPath, targetYaml());
    const target = loadQualityTargetsConfig(configPath).targets.public_studio;

    expect(validateCitationExtractionContractForTarget(target, ALL_EXTRACTED_CITATION_CONTRACT)).toEqual([]);
  });

  it("rejects an unallowlisted contract hash", () => {
    const root = tempDir();
    const configPath = join(root, "graphify.yaml");
    write(configPath, targetYaml("sha256:not-this-contract"));
    const target = loadQualityTargetsConfig(configPath).targets.public_studio;

    expect(validateCitationExtractionContractForTarget(target, ALL_EXTRACTED_CITATION_CONTRACT)).toEqual([
      expect.stringMatching(/^citations\.extraction\.contract hash sha256:/),
    ]);
  });

  it("rejects bounded or minimum-one citation contracts for all-extracted targets", () => {
    const root = tempDir();
    const configPath = join(root, "graphify.yaml");
    const badContract = {
      ...ALL_EXTRACTED_CITATION_CONTRACT,
      requirements: {
        ...ALL_EXTRACTED_CITATION_CONTRACT.requirements,
        bounded_samples_allowed: true,
        minimum_one_citation_only_allowed: true,
      },
    };
    write(configPath, targetYaml(hashCitationExtractionContract(badContract)));
    const target = loadQualityTargetsConfig(configPath).targets.public_studio;

    expect(validateCitationExtractionContractForTarget(target, badContract)).toEqual([
      "citations.extraction.contract must reject minimum-one-citation-only producers",
      "citations.extraction.contract must reject bounded samples",
    ]);
  });
});
