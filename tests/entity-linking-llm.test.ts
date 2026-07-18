import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  directLlmSpanProposer,
  linkEntities,
  llmConfigFromDetectors,
  requiresLlmProposer,
  type LlmSpanProposal,
  type LlmSpanProposer,
} from "../src/entity-linking.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import type { TextJsonGenerationClient, TextJsonGenerationInput } from "../src/llm-execution.js";
import type { NormalizedOntologyProfile, OntologyProfile, RegistryRecord } from "../src/types.js";

const cleanup: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-link-llm-"));
  cleanup.push(root);
  return root;
}

/** Partitioned Zone profile (municipality frontmatter), mirrors the L4a suite. */
function profile(
  root: string,
  linking: NonNullable<OntologyProfile["node_types"]>["Zone"]["linking"],
): NormalizedOntologyProfile {
  return normalizeOntologyProfile({
    id: "link-llm-test",
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
        partition_column: "municipality",
      },
    },
    outputs: { ontology: { occurrence_node_types: ["Zone"] } },
  }, join(root, "ontology-profile.yaml"));
}

function record(id: string, label: string, partition = "compton", aliases: string[] = []): RegistryRecord {
  return { registryId: "zones", id, label, aliases, nodeType: "Zone", partition, sourceFile: "/registry/zones.csv", raw: {} };
}

function writeDoc(root: string, name: string, body: string): string {
  const path = join(root, "docs", name);
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(path, `---\nmunicipality: compton\n---\n\n${body}\n`, "utf-8");
  return path;
}

/** A vitest spy proposer returning a fixed list; lets tests assert call counts. */
function spyProposer(proposals: LlmSpanProposal[]): ReturnType<typeof vi.fn> & LlmSpanProposer {
  return vi.fn(async () => proposals) as unknown as ReturnType<typeof vi.fn> & LlmSpanProposer;
}

afterEach(() => {
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("graphify link — llm detector proposes, graphify resolves", () => {
  it("resolves an LLM span via the EXACT resolver, never trusting the model's id hint", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    // The model proposes a verbatim span AND a hallucinated id. Resolution must
    // ignore the hint (not in partition) and link via exact to the real record.
    const proposer = spyProposer([{ raw_span: "C-15", registry_record_id: "llm-hallucinated-id" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, { detect: ["llm"], resolve: "exact", partition_from: { source_frontmatter: "municipality" } }),
      // A same-label record in ANOTHER partition must never be linked from compton.
      registries: { zones: [record("compton-c15", "C-15", "compton"), record("other-c15", "C-15", "other")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(proposer).toHaveBeenCalledTimes(1);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toMatchObject({
      raw_span: "C-15",
      detector: "llm",
      resolution: "linked",
      registry_record_id: "compton-c15", // from EXACT, not the LLM hint
      registry_partition: "compton",
    });
  });

  it("drops an LLM proposal that cannot be relocated verbatim (no occurrence, no repair)", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    const proposer = spyProposer([{ raw_span: "Z-999 (not present verbatim)" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, { detect: ["llm"], resolve: "exact", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(proposer).toHaveBeenCalledTimes(1);
    expect(result.occurrences).toEqual([]);
  });

  it("never fabricates a link from an invented id when the span is not a registry member", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-77 apparait ici.");
    // Span is verbatim but not in the registry; the (invented) id must not stick.
    const proposer = spyProposer([{ raw_span: "C-77", registry_record_id: "ghost" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, { detect: ["llm"], resolve: "exact", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toMatchObject({ raw_span: "C-77", detector: "llm", resolution: "unlinked" });
    expect(result.occurrences[0]!.registry_record_id).toBeUndefined();
  });

  it("open-extraction resolves none: verified unlinked occurrences without any id", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    const proposer = spyProposer([{ raw_span: "C-15" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, { preset: "open-extraction", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(proposer).toHaveBeenCalledTimes(1);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toMatchObject({ raw_span: "C-15", detector: "llm", resolution: "unlinked" });
    expect(result.occurrences[0]!.registry_record_id).toBeUndefined();
  });
});

describe("graphify link — hybrid-recall trigger discipline", () => {
  it("calls the LLM only for documents where the $0 detectors found nothing", async () => {
    const root = tempRoot();
    const hit = writeDoc(root, "hit.md", "Le code C-15 borne la zone.");     // lexicon finds C-15
    const miss = writeDoc(root, "miss.md", "Aucune zone mentionnee ici.");    // lexicon finds nothing
    const proposer = spyProposer([]);
    const result = await linkEntities({
      root,
      profile: profile(root, { preset: "hybrid-recall", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [hit, miss],
      llmProposer: proposer,
    });

    // zero_candidates trigger fires ONLY for miss.md → exactly one proposer call.
    expect(proposer).toHaveBeenCalledTimes(1);
    expect(proposer.mock.calls[0]![0]).toMatchObject({ sourceFile: "docs/miss.md", nodeType: "Zone" });
    // hit.md still produced its deterministic $0 (lexicon) occurrence.
    expect(result.occurrences).toEqual([
      expect.objectContaining({ source_file: "docs/hit.md", detector: "lexicon", resolution: "linked" }),
    ]);
  });
});

describe("graphify link — budget / dry-run gates skip paid calls", () => {
  it("makes zero calls when budget_usd is 0 and reports LINK_LLM_BUDGET_EXHAUSTED", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    const proposer = spyProposer([{ raw_span: "C-15" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, {
        detect: [{ llm: { trigger: "zero_candidates", budget_usd: 0 } }],
        resolve: "exact",
        partition_from: { source_frontmatter: "municipality" },
      }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(proposer).not.toHaveBeenCalled();
    expect(result.occurrences).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LINK_LLM_BUDGET_EXHAUSTED" })]));
  });

  it("makes zero calls under --dry-run (llmDryRun) and reports LINK_LLM_DRY_RUN", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    const proposer = spyProposer([{ raw_span: "C-15" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, { detect: ["llm"], resolve: "exact", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
      llmDryRun: true,
    });

    expect(proposer).not.toHaveBeenCalled();
    expect(result.occurrences).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LINK_LLM_DRY_RUN" })]));
  });
});

describe("graphify link — $0 default preserved (non-regression)", () => {
  it("gazetteer-exact makes ZERO LLM calls even when a proposer is provided", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    const proposer = spyProposer([{ raw_span: "C-15", registry_record_id: "ghost" }]);
    const result = await linkEntities({
      root,
      profile: profile(root, { preset: "gazetteer-exact", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(proposer).not.toHaveBeenCalled();
    expect(result.occurrences).toEqual([
      expect.objectContaining({ detector: "lexicon", resolution: "linked", registry_record_id: "compton-c15" }),
    ]);
  });

  it("a profile with no linking block is a no-op and never touches the proposer", async () => {
    const root = tempRoot();
    const noLink = normalizeOntologyProfile({
      id: "no-link",
      version: 1,
      node_types: { Zone: { registry: "zones" } },
      relation_types: {},
      registries: { zones: { source: "zones", id_column: "id", label_column: "label", node_type: "Zone" } },
    }, join(root, "profile.yaml"));
    const proposer = spyProposer([{ raw_span: "C-15" }]);
    const result = await linkEntities({
      root,
      profile: noLink,
      registries: { zones: [record("c15", "C-15")] },
      sourceFiles: [writeDoc(root, "compton.md", "Le code C-15 borne la zone.")],
      llmProposer: proposer,
    });

    expect(result.noOp).toBe(true);
    expect(proposer).not.toHaveBeenCalled();
  });

  it("requiresLlmProposer only reports presets that actually use the llm detector", () => {
    const root = tempRoot();
    const open = profile(root, { preset: "open-extraction", partition_from: { source_frontmatter: "municipality" } });
    const hybrid = profile(root, { preset: "hybrid-recall", partition_from: { source_frontmatter: "municipality" } });
    const gaz = profile(root, { preset: "gazetteer-exact", partition_from: { source_frontmatter: "municipality" } });
    expect(requiresLlmProposer(open)).toBe(true);
    expect(requiresLlmProposer(hybrid)).toBe(true);
    expect(requiresLlmProposer(gaz)).toBe(false);
    expect(llmConfigFromDetectors(gaz.node_types.Zone!.linking!.detect)).toBeUndefined();
    expect(llmConfigFromDetectors(open.node_types.Zone!.linking!.detect)).toMatchObject({ trigger: "zero_candidates" });
  });
});

describe("graphify link — direct provider adapter (offline)", () => {
  it("adapts a TextJsonGenerationClient into a span proposer and links end-to-end", async () => {
    const root = tempRoot();
    const source = writeDoc(root, "compton.md", "Le code C-15 borne la zone.");
    // A fake client that writes canned span JSON to outputPath — no network.
    const client: TextJsonGenerationClient = {
      mode: "direct",
      provider: "anthropic",
      model: "test-model",
      async generateJson(input: TextJsonGenerationInput) {
        mkdirSync(dirname(input.outputPath!), { recursive: true });
        writeFileSync(input.outputPath!, JSON.stringify({ spans: [{ raw_span: "C-15" }] }), "utf-8");
        return { status: "completed", provider: "anthropic", mode: "direct", model: "test-model", outputPath: input.outputPath, audit: {} };
      },
    };
    const proposer = directLlmSpanProposer(client, { stateDir: join(root, ".graphify") });
    const result = await linkEntities({
      root,
      profile: profile(root, { detect: ["llm"], resolve: "exact", partition_from: { source_frontmatter: "municipality" } }),
      registries: { zones: [record("compton-c15", "C-15", "compton")] },
      sourceFiles: [source],
      llmProposer: proposer,
    });

    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]).toMatchObject({ raw_span: "C-15", detector: "llm", resolution: "linked", registry_record_id: "compton-c15" });
  });
});
