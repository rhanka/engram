/**
 * D12 — reconciliation actions panel.
 *
 * Verifies that the dedicated action toolbar is present in the reconciliation
 * right slot and behaves as expected in read-only versus write mode:
 * - read-only: the action buttons are disabled and the helper note is shown;
 * - write mode: the action buttons are enabled and the JSON payload model is
 *   embedded for the injected client script.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleOntologyStudioRequest } from "../src/ontology-studio.js";

import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-recon-actions-"));
  tempDirs.push(dir);
  return dir;
}

function writeCandidateQueue(fixture: ReturnType<typeof writeOntologyWriteFixture>): void {
  const reconciliationDir = join(fixture.stateDir, "ontology", "reconciliation");
  mkdirSync(reconciliationDir, { recursive: true });
  writeFileSync(
    join(reconciliationDir, "candidates.json"),
    JSON.stringify({
      schema: "graphify_ontology_reconciliation_candidates_v1",
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      generated_at: "2026-05-21T00:00:00.000Z",
      candidate_count: 1,
      candidates: [
        {
          id: "candidate-high",
          kind: "entity_match",
          status: "candidate",
          score: 0.91,
          candidate_id: "candidate-component",
          canonical_id: "component-a",
          shared_terms: ["component"],
          evidence_refs: ["manual.md#p1"],
          reasons: ["same node type: Component"],
          proposed_patch_operation: "accept_match",
        },
      ],
    }, null, 2),
    "utf-8",
  );
}

function writeGraphPreview(fixture: ReturnType<typeof writeOntologyWriteFixture>): void {
  writeFileSync(
    join(fixture.stateDir, "graph.json"),
    JSON.stringify({
      nodes: [
        {
          id: "candidate-component",
          label: "Candidate component",
          node_type: "Component",
          status: "candidate",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          source_location: "p1",
          community: 1,
        },
        {
          id: "component-a",
          label: "Component A",
          node_type: "Component",
          status: "validated",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          source_location: "p1",
          community: 1,
        },
      ],
      links: [
        { source: "candidate-component", target: "component-a", relation: "candidate_match", confidence: "EXTRACTED" },
      ],
    }, null, 2),
    "utf-8",
  );
  writeFileSync(join(fixture.stateDir, "graph.html"), "<!doctype html><title>graph</title>", "utf-8");
}

function actionsSection(html: string): string {
  const match = html.match(/<section class="ws-recon-actions"[\s\S]*?<\/section>/);
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Track D12 reconciliation actions panel", () => {
  it("renders a disabled action panel in read-only mode", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );
    expect(result.status).toBe(200);

    const html = actionsSection(result.body);
    expect(html).toContain('id="reconciliation-actions"');
    expect(html).toContain('data-write="false"');
    expect(html).toContain('data-error="true"');
    expect(html).toContain("<button");
    expect(html).toMatch(/data-action="validate"[^>]*disabled/);
    expect(html).toMatch(/data-action="dry-run"[^>]*disabled/);
    expect(html).toMatch(/data-action="apply"[^>]*disabled/);
    expect(html).toMatch(/data-action="apply"[^>]*data-operation="reject_match"/);
  });

  it("renders an enabled action panel in write mode with embedded payload JSON", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );
    expect(result.status).toBe(200);

    const html = actionsSection(result.body);
    expect(html).toContain('data-write="true"');
    expect(html).not.toContain('data-error="true"');
    expect(html).toContain('id="reconciliation-actions-model"');
    expect(html).toContain('"candidateNodeId":"candidate-component"');
    expect(html).toContain('"canonicalNodeId":"component-a"');
    expect(html).not.toMatch(/data-action="validate"[^>]*disabled/);
    expect(html).toContain('<pre class="ws-recon-actions-result"');
  });
});
