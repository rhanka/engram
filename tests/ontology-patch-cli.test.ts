import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { runConfiguredDataprep } from "../src/configured-dataprep.js";
import { ONTOLOGY_PATCH_SCHEMA, type OntologyPatch } from "../src/ontology-patch.js";

const tempDirs: string[] = [];
const fixtureRoot = join(process.cwd(), "tests", "fixtures", "profile-demo");

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempProfileProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-patch-cli-"));
  tempDirs.push(dir);
  cpSync(fixtureRoot, dir, { recursive: true });
  writeFileSync(
    join(dir, "graphify.yaml"),
    readFileSync(join(dir, "graphify.yaml"), "utf-8").replace(
      "  write_profile_report: true\n",
      [
        "  write_profile_report: true",
        "  ontology:",
        "    reconciliation:",
        "      decisions_path: graphify/reconciliation/decisions.jsonl",
        "",
      ].join("\n"),
    ),
    "utf-8",
  );
  return dir;
}

async function runCli(args: string[], cwd: string) {
  const { main } = await import("../src/cli.js");
  return runMain(() => main(), ["node", "graphify", ...args], cwd);
}

async function runSkillRuntime(args: string[], cwd: string) {
  const { main } = await import("../src/skill-runtime.js");
  return runMain(() => main(["node", "graphify-skill-runtime", ...args]), ["node", "graphify-skill-runtime", ...args], cwd);
}

async function runMain(call: () => Promise<void>, argv: string[], cwd: string) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  process.argv = argv;
  process.chdir(cwd);
  console.log = (...items: unknown[]) => { logs.push(items.join(" ")); };
  console.error = (...items: unknown[]) => { errors.push(items.join(" ")); };
  console.warn = (...items: unknown[]) => { warnings.push(items.join(" ")); };
  process.exit = ((code?: string | number | null) => {
    throw new Error(`process.exit ${code ?? 0}`);
  }) as typeof process.exit;
  try {
    await call();
    return { exitCode: 0, logs, errors, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/^process\.exit (\d+)/);
    return {
      exitCode: match ? Number(match[1]) : 1,
      logs,
      errors: match ? errors : [...errors, message],
      warnings,
    };
  } finally {
    process.argv = previousArgv;
    process.chdir(previousCwd);
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }
}

async function prepareProject(): Promise<{ root: string; profileStatePath: string; patchPath: string; decisionsPath: string }> {
  const root = tempProfileProject();
  const result = await runConfiguredDataprep(root, {
    semanticPrepare: async (detection) => ({ detection, transcriptPaths: [], pdfArtifacts: [] }),
  });
  const ontologyDir = join(root, ".graphify", "ontology");
  mkdirSync(ontologyDir, { recursive: true });
  writeFileSync(
    join(ontologyDir, "manifest.json"),
    JSON.stringify({ schema: "graphify_ontology_outputs_v1", profile_hash: result.profile.profile_hash, graph_hash: "graph-hash" }, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(ontologyDir, "nodes.json"),
    JSON.stringify([
      {
        id: "candidate-component",
        label: "Component A",
        type: "Component",
        status: "candidate",
        normalized_terms: ["component a"],
        source_refs: ["manual.md#p1"],
      },
      {
        id: "component-a",
        label: "Component A",
        type: "Component",
        status: "validated",
        aliases: ["A Component"],
        normalized_terms: ["component a", "a component"],
        source_refs: ["manual.md#p1"],
      },
    ], null, 2),
    "utf-8",
  );
  writeFileSync(join(ontologyDir, "relations.json"), "[]", "utf-8");
  writeFileSync(join(ontologyDir, "sources.json"), JSON.stringify([{ id: "manual.md#p1" }], null, 2), "utf-8");
  const patch: OntologyPatch = {
    schema: ONTOLOGY_PATCH_SCHEMA,
    id: "patch-synthetic-cli-001",
    operation: "accept_match",
    status: "proposed",
    profile_hash: result.profile.profile_hash,
    graph_hash: "graph-hash",
    target: { candidate_id: "candidate-component", canonical_id: "component-a" },
    evidence_refs: ["manual.md#p1"],
    reason: "Synthetic CLI patch.",
    author: "tester",
    created_at: "2026-05-05T00:00:00.000Z",
  };
  const patchPath = join(root, "patch.json");
  writeFileSync(patchPath, JSON.stringify(patch, null, 2), "utf-8");
  return {
    root,
    profileStatePath: join(root, ".graphify", "profile", "profile-state.json"),
    patchPath,
    decisionsPath: join(root, "graphify", "reconciliation", "decisions.jsonl"),
  };
}

describe("ontology patch CLI", () => {
  it("generates reconciliation candidates through CLI and skill runtime", async () => {
    const { root, profileStatePath } = await prepareProject();
    const cliOut = join(root, ".graphify", "ontology", "reconciliation", "candidates.json");
    const runtimeOut = join(root, ".graphify", "ontology", "reconciliation", "runtime-candidates.json");

    const cli = await runCli([
      "ontology",
      "candidates",
      "--profile-state",
      profileStatePath,
      "--out",
      cliOut,
      "--json",
    ], root);
    const runtime = await runSkillRuntime([
      "ontology-candidates",
      "--profile-state",
      profileStatePath,
      "--out",
      runtimeOut,
    ], root);

    expect(cli.exitCode, JSON.stringify(cli, null, 2)).toBe(0);
    expect(runtime.exitCode, JSON.stringify(runtime, null, 2)).toBe(0);
    const queue = JSON.parse(readFileSync(cliOut, "utf-8")) as {
      schema: string;
      candidate_count: number;
      candidates: Array<{ candidate_id: string; canonical_id: string; proposed_patch_operation: string }>;
    };
    expect(queue.schema).toBe("graphify_ontology_reconciliation_candidates_v1");
    expect(queue.candidate_count).toBe(1);
    expect(queue.candidates[0]).toMatchObject({
      candidate_id: "candidate-component",
      canonical_id: "component-a",
      proposed_patch_operation: "accept_match",
    });
    expect(existsSync(runtimeOut)).toBe(true);
  });

  it("validates, dry-runs and writes ontology patches through configured authoritative paths", async () => {
    const { root, profileStatePath, patchPath, decisionsPath } = await prepareProject();

    const validate = await runCli([
      "ontology",
      "patch",
      "validate",
      "--profile-state",
      profileStatePath,
      "--patch",
      patchPath,
      "--json",
    ], root);
    const dryRun = await runCli([
      "ontology",
      "patch",
      "apply",
      "--profile-state",
      profileStatePath,
      "--patch",
      patchPath,
      "--json",
    ], root);
    const write = await runCli([
      "ontology",
      "patch",
      "apply",
      "--profile-state",
      profileStatePath,
      "--patch",
      patchPath,
      "--write",
      "--json",
    ], root);

    expect(validate.exitCode, JSON.stringify(validate, null, 2)).toBe(0);
    expect(JSON.parse(validate.logs.join("\n")).valid).toBe(true);
    expect(dryRun.exitCode, JSON.stringify(dryRun, null, 2)).toBe(0);
    expect(JSON.parse(dryRun.logs.join("\n")).dry_run).toBe(true);
    expect(write.exitCode, JSON.stringify(write, null, 2)).toBe(0);
    expect(readFileSync(decisionsPath, "utf-8")).toContain("patch-synthetic-cli-001");
    expect(readFileSync(join(root, ".graphify", "needs_update"), "utf-8")).toContain("ontology patch applied");
  });

  it("exposes patch validation and dry-run through the skill runtime", async () => {
    const { root, profileStatePath, patchPath, decisionsPath } = await prepareProject();

    const validate = await runSkillRuntime([
      "ontology-patch-validate",
      "--profile-state",
      profileStatePath,
      "--patch",
      patchPath,
    ], root);
    const dryRun = await runSkillRuntime([
      "ontology-patch-apply",
      "--profile-state",
      profileStatePath,
      "--patch",
      patchPath,
      "--dry-run",
    ], root);

    expect(validate.exitCode, JSON.stringify(validate, null, 2)).toBe(0);
    expect(JSON.parse(validate.logs.join("\n")).valid).toBe(true);
    expect(dryRun.exitCode, JSON.stringify(dryRun, null, 2)).toBe(0);
    expect(JSON.parse(dryRun.logs.join("\n")).dry_run).toBe(true);
    expect(existsSync(decisionsPath)).toBe(false);
  });
});
