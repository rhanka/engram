import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";

import { buildProjectGraphForIdentity } from "../src/agent-stats/index.js";
import { buildProjectGraph, type ProjectIdentity, type SessionInput } from "../src/agent-stats/project-graph.js";
import { loadWorkspaceLocalH2aInstances } from "../src/agent-stats/registry.js";
import { filterTemporalWindow } from "../src/temporal-recall.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeRegistry(root: string, lines: unknown[]): void {
  const file = join(root, ".h2a", "registry", "instances.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lines.map((line) => typeof line === "string" ? line : JSON.stringify(line)).join("\n") + "\n");
}

const identity: ProjectIdentity = {
  canonicalId: "project",
  label: "Project",
  aliases: [{ name: "project", pathPrefixes: ["/repo"] }],
};

function session(agentId: string): SessionInput {
  return {
    factId: `codex:${agentId}`,
    host: "codex",
    sessionId: agentId,
    agentId,
    cwds: ["/repo"],
    startedAtMs: 100,
    endedAtMs: 200,
    branches: [],
    commitShas: [],
    prUrls: [],
    tokensTotal: 0,
    filesTouched: 0,
  };
}

describe("workspace-local h2a registry evidence", () => {
  it("loads only canonical local registry records, deduped in deterministic order", () => {
    const root = tempDir("agent-stats-h2a-root-");
    writeRegistry(root, [
      "not-json",
      { id: "codex:z", name: "private-z", workspace: { path: root, host: "codex", label: "private-z" } },
      { id: "codex:a", name: "private-a", workspace: { path: root, host: "codex", label: "private-a" } },
      { id: "codex:a", workspace: { path: root, host: "codex" } },
      { id: "codex:parent", workspace: { path: dirname(root), host: "codex" } },
      { id: "claude:wrong-host", workspace: { path: root, host: "codex" } },
      { id: "codex:\uE000", workspace: { path: root, host: "codex" } },
      { id: "codex:\u{10000}", workspace: { path: root, host: "codex" } },
    ]);

    expect(loadWorkspaceLocalH2aInstances(root).map((instance) => instance.id)).toEqual([
      "codex:a",
      "codex:z",
      "codex:\uE000",
      "codex:\u{10000}",
    ]);
  });

  it("fails closed when the local registry file is a symlink", () => {
    const root = tempDir("agent-stats-h2a-root-");
    const outside = tempDir("agent-stats-h2a-outside-");
    const file = join(root, ".h2a", "registry", "instances.jsonl");
    mkdirSync(dirname(file), { recursive: true });
    const outsideFile = join(outside, "instances.jsonl");
    writeFileSync(outsideFile, JSON.stringify({ id: "codex:outside", workspace: { path: root, host: "codex" } }) + "\n");
    symlinkSync(outsideFile, file);

    expect(loadWorkspaceLocalH2aInstances(root)).toEqual([]);
  });

  it("projects one unverified, timeless registry proof per matched agent deterministically", () => {
    const agentA = "codex:project:a-b";
    const agentB = "codex:project:b";
    const options = {
      identity,
      sessions: [session(agentA), session(agentB)],
      h2aCoordinationEvidence: [{ instanceId: agentB }, { instanceId: agentA }, { instanceId: agentA }, { instanceId: "codex:foreign" }],
    };
    const graph = buildProjectGraph(options);
    const reversed = buildProjectGraph({ ...options, h2aCoordinationEvidence: [...options.h2aCoordinationEvidence].reverse() });
    const evidence = graph.nodes.filter((node) => node.node_type === "CoordinationEvidence");
    const edges = graph.links.filter((edge) => edge.relation === "registered-in");

    expect(JSON.stringify(graph)).toBe(JSON.stringify(reversed));
    expect(evidence).toHaveLength(2);
    expect(edges).toHaveLength(2);
    expect(evidence.map((node) => node.instance_id)).toEqual([agentA, agentB]);
    for (const node of evidence) {
      expect(node).toMatchObject({
        evidence_type: "h2a-instance-registry",
        provenance: ".h2a/registry/instances.jsonl",
        scope: "workspace-local",
        trust: "unverified",
      });
      expect("t" in node).toBe(false);
      expect("t_end" in node).toBe(false);
      expect("t_src" in node).toBe(false);
    }
    for (const edge of edges) {
      expect(edge).toMatchObject({
        provenance: ".h2a/registry/instances.jsonl",
        scope: "workspace-local",
        trust: "unverified",
      });
      expect("t" in edge).toBe(false);
      expect("t_end" in edge).toBe(false);
      expect("t_src" in edge).toBe(false);
    }
    const temporal = filterTemporalWindow(graph, 100, 100);
    expect(temporal.nodes.some((node) => node.node_type === "CoordinationEvidence")).toBe(false);
    expect(temporal.edges.some((edge) => edge.relation === "registered-in")).toBe(false);
  });

  it("does not attach a proof when normalized Agent ids collide", () => {
    const graph = buildProjectGraph({
      identity,
      sessions: [session("codex:project:a-b"), session("codex:project:a_b")],
      h2aCoordinationEvidence: [{ instanceId: "codex:project:a-b" }, { instanceId: "codex:project:a_b" }],
    });

    expect(graph.nodes.filter((node) => node.node_type === "CoordinationEvidence")).toHaveLength(0);
    expect(graph.links.filter((edge) => edge.relation === "registered-in")).toHaveLength(0);
  });

  it("only projects an instance actually matched to an in-project session without serializing registry fields", () => {
    const root = tempDir("agent-stats-h2a-project-");
    const home = tempDir("agent-stats-h2a-home-");
    const instanceId = "claude:project:registered";
    writeRegistry(root, [
      {
        id: instanceId,
        name: "private-name",
        private_value: "do-not-project",
        workspace: { path: root, host: "claude", label: "private-label" },
      },
      { id: "claude:foreign", workspace: { path: dirname(root), host: "claude" } },
      { id: "codex:local-unmatched", workspace: { path: root, host: "codex" } },
    ]);
    const transcriptDir = join(home, ".claude", "projects", root.replace(/\//g, "-"));
    mkdirSync(transcriptDir, { recursive: true });
    const fixture = readFileSync("tests/fixtures/agent-stats/claude-wp1-repo-keys.jsonl", "utf-8").replaceAll("__REPO__", root);
    writeFileSync(join(transcriptDir, "session.jsonl"), fixture);

    const { graph } = buildProjectGraphForIdentity(
      { canonicalId: "project", label: "Project", aliases: [{ name: "project", pathPrefixes: [root] }], repoRootForRegistry: root },
      { home, commits: [], branchHeads: [], includeHubEdges: false },
    );
    const evidence = graph.nodes.filter((node) => node.node_type === "CoordinationEvidence");
    const edge = graph.links.find((link) => link.relation === "registered-in");

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ instance_id: instanceId, trust: "unverified" });
    expect(edge).toMatchObject({ trust: "unverified", scope: "workspace-local" });
    expect(JSON.stringify(graph)).not.toContain("private-name");
    expect(JSON.stringify(graph)).not.toContain("private-label");
    expect(JSON.stringify(graph)).not.toContain("do-not-project");
  });

  it("preserves a historical-alias agent identity without treating it as local evidence", () => {
    const root = tempDir("agent-stats-h2a-project-");
    const oldAlias = join(root, "old");
    const home = tempDir("agent-stats-h2a-home-");
    const instanceId = "claude:project:historic";
    mkdirSync(oldAlias, { recursive: true });
    writeRegistry(root, [{ id: instanceId, workspace: { path: oldAlias, host: "claude" } }]);
    const transcriptDir = join(home, ".claude", "projects", oldAlias.replace(/\//g, "-"));
    mkdirSync(transcriptDir, { recursive: true });
    const fixture = readFileSync("tests/fixtures/agent-stats/claude-wp1-repo-keys.jsonl", "utf-8").replaceAll("__REPO__", oldAlias);
    writeFileSync(join(transcriptDir, "session.jsonl"), fixture);

    const { graph } = buildProjectGraphForIdentity(
      {
        canonicalId: "project",
        label: "Project",
        aliases: [{ name: "old", pathPrefixes: [oldAlias] }, { name: "current", pathPrefixes: [root] }],
        repoRootForRegistry: root,
      },
      { home, commits: [], branchHeads: [], includeHubEdges: false },
    );

    expect(graph.nodes.find((node) => node.node_type === "Agent")?.label).toBe(instanceId);
    expect(graph.nodes.filter((node) => node.node_type === "CoordinationEvidence")).toHaveLength(0);
  });
});
