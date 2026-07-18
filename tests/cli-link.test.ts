import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "../src/cli.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import type { DetectionResult, RegistryRecord } from "../src/types.js";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

function setupProject(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-link-cli-"));
  cleanup.push(root);
  const profileDir = join(root, ".graphify", "profile");
  mkdirSync(join(profileDir, "registries"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  const profile = normalizeOntologyProfile({
    id: "cli-link",
    version: 1,
    node_types: {
      Zone: {
        registry: "zones",
        linking: {
          preset: "gazetteer-exact",
          partition_from: { source_frontmatter: "municipality" },
        },
      },
    },
    relation_types: {},
    registries: {
      zones: {
        source: "zones",
        id_column: "id",
        label_column: "label",
        node_type: "Zone",
        partition_column: "municipality",
      },
    },
    outputs: { ontology: { occurrence_node_types: ["Zone"] } },
  }, join(root, "graphify", "ontology-profile.yaml"));
  const document = join(root, "docs", "compton.md");
  writeFileSync(document, "---\nmunicipality: compton\n---\n\nC-15\n", "utf-8");
  const records: RegistryRecord[] = [{
    registryId: "zones",
    id: "compton-c15",
    label: "C-15",
    aliases: [],
    nodeType: "Zone",
    partition: "compton",
    sourceFile: join(root, "zones.csv"),
    raw: {},
  }];
  const detection: DetectionResult = {
    files: { code: [], document: [document], paper: [], image: [], video: [] },
    total_files: 1,
    total_words: 1,
    needs_graph: false,
    warning: null,
    skipped_sensitive: [],
    graphifyignore_patterns: 0,
  };
  writeFileSync(join(profileDir, "ontology-profile.normalized.json"), JSON.stringify(profile));
  writeFileSync(join(profileDir, "project-config.normalized.json"), JSON.stringify({ configDir: root }));
  writeFileSync(join(profileDir, "registries", "zones.json"), JSON.stringify(records));
  writeFileSync(join(profileDir, "semantic-detection.json"), JSON.stringify(detection));
  writeFileSync(join(profileDir, "profile-state.json"), JSON.stringify({
    profile_id: profile.id,
    profile_version: profile.version,
    profile_hash: profile.profile_hash,
    project_config_path: join(root, "graphify.yaml"),
    ontology_profile_path: join(root, "graphify", "ontology-profile.yaml"),
    state_dir: join(root, ".graphify"),
    detect_roots: [join(root, "docs")],
    exclude_roots: [],
    registry_counts: { zones: 1 },
    registry_node_count: 1,
    semantic_file_count: 1,
    transcript_count: 0,
    pdf_artifact_count: 0,
  }));
  return root;
}

async function runCli(args: string[], cwd: string): Promise<string[]> {
  const argv = process.argv;
  const previousCwd = process.cwd();
  const log = console.log;
  const logs: string[] = [];
  process.argv = ["node", "graphify", ...args];
  console.log = (...items: unknown[]) => { logs.push(items.join(" ")); };
  process.chdir(cwd);
  try {
    await main();
    return logs;
  } finally {
    process.chdir(previousCwd);
    process.argv = argv;
    console.log = log;
  }
}

describe("graphify link CLI", () => {
  it("consumes profile-state dataprep artifacts and writes list + Studio sidecar", async () => {
    const root = setupProject();
    const logs = await runCli(["link", root, "--profile-state", ".graphify/profile/profile-state.json"], root);
    const outputDir = join(root, ".graphify", "ontology");
    const occurrences = JSON.parse(readFileSync(join(outputDir, "occurrences.json"), "utf-8"));

    expect(occurrences).toEqual([expect.objectContaining({ registry_record_id: "compton-c15", source_file: "docs/compton.md" })]);
    expect(JSON.parse(readFileSync(join(outputDir, "entity-occurrence-summary.json"), "utf-8"))).toEqual({
      registry_zones_compton_c15: expect.objectContaining({ total: 1 }),
    });
    expect(logs.join("\n")).toMatch(/wrote 1 occurrence/i);
  });

  it("honors --dry-run and --out without writing the requested occurrence file", async () => {
    const root = setupProject();
    const output = join(root, "custom", "occurrences.json");
    const logs = await runCli([
      "link",
      root,
      "--profile-state", ".graphify/profile/profile-state.json",
      "--out", "custom/occurrences.json",
      "--dry-run",
    ], root);

    expect(() => readFileSync(output, "utf-8")).toThrow();
    expect(logs.join("\n")).toMatch(/dry-run.*1 occurrence/i);
  });
});
