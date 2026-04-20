import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildFromJson } from "../src/build.js";
import { cluster } from "../src/cluster.js";
import { runConfiguredDataprep } from "../src/configured-dataprep.js";
import { toJson } from "../src/export.js";
import { buildProfileExtractionPrompt } from "../src/profile-prompts.js";
import { buildProfileReport } from "../src/profile-report.js";
import { validateProfileExtraction } from "../src/profile-validate.js";
import { validateExtraction } from "../src/validate.js";
import type { Extraction } from "../src/types.js";

const tempDirs: string[] = [];
const fixtureRoot = resolve(process.cwd(), "tests", "fixtures", "profile-demo");

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-profile-pipeline-"));
  tempDirs.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  mkdirSync(join(root, ".graphify"), { recursive: true });
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("profile synthetic end-to-end pipeline", () => {
  it("runs configured dataprep through graph build/export while preserving profile attributes", async () => {
    const root = makeProject();
    const dataprep = await runConfiguredDataprep(root, {
      configPath: join(root, "graphify.yaml"),
      semanticPrepare: async (detection, options) => ({
        detection,
        transcriptPaths: [],
        pdfArtifacts: [],
        prompt: options.initialPrompt ?? "synthetic prompt",
      }),
    });
    const prompt = buildProfileExtractionPrompt({
      profile: dataprep.profile,
      projectConfig: dataprep.projectConfig,
      registries: dataprep.registries,
    });
    const semanticExtraction: Extraction = {
      nodes: [
        {
          id: "manual_filter_replacement",
          label: "Synthetic filter replacement",
          file_type: "document",
          source_file: join(root, "raw", "manuals", "manual.md"),
          node_type: "MaintenanceProcess",
          status: "candidate",
          citations: [{ source_file: join(root, "raw", "manuals", "manual.md"), page: 1 }],
        },
      ],
      edges: [
        {
          source: "manual_filter_replacement",
          target: "registry_components_CMP_001",
          relation: "replaces",
          confidence: "EXTRACTED",
          source_file: join(root, "raw", "manuals", "manual.md"),
          status: "candidate",
          citations: [{ source_file: join(root, "raw", "manuals", "manual.md"), page: 1 }],
        },
      ],
      hyperedges: [],
      input_tokens: 10,
      output_tokens: 5,
    };
    const extraction: Extraction = {
      nodes: [...dataprep.registryExtraction.nodes, ...semanticExtraction.nodes],
      edges: semanticExtraction.edges,
      hyperedges: [],
      input_tokens: semanticExtraction.input_tokens,
      output_tokens: semanticExtraction.output_tokens,
    };

    expect(prompt).toContain("Allowed node types");
    expect(validateExtraction(extraction)).toEqual([]);
    const profileValidation = validateProfileExtraction(extraction, { profile: dataprep.profile });
    expect(profileValidation.valid).toBe(true);

    const graph = buildFromJson(extraction);
    const communities = cluster(graph);
    const graphPath = join(root, ".graphify", "profile-e2e-graph.json");
    toJson(graph, communities, graphPath);
    const graphJson = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    const registryNode = graphJson.nodes.find((node) => node.id === "registry_components_CMP_001");
    const processNode = graphJson.nodes.find((node) => node.id === "manual_filter_replacement");

    expect(registryNode).toMatchObject({
      node_type: "Component",
      registry_id: "components",
      registry_record_id: "CMP-001",
      status: "validated",
    });
    expect(processNode).toMatchObject({
      node_type: "MaintenanceProcess",
      status: "candidate",
    });
    expect(processNode?.citations).toEqual([
      { source_file: join(root, "raw", "manuals", "manual.md"), page: 1 },
    ]);

    const report = buildProfileReport({
      profileState: dataprep.profileState,
      profile: dataprep.profile,
      projectConfig: dataprep.projectConfig,
      registries: dataprep.registries,
      validationResult: profileValidation,
      graph: graphJson,
    });
    expect(report).toContain("# Graphify Profile Report");
    expect(report).toContain("Synthetic filter replacement");
  });
});
