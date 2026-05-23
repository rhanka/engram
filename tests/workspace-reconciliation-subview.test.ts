/**
 * Track G G6-3 (S2.2) — reconciliation sub-view live HTTP route.
 *
 * Drives the new `/?view=reconciliation` deep link end-to-end:
 *  - the candidate workbench stays in the *left* rail (no longer a
 *    `leftWorkbenchHtml` override that hides the G6-2 rail),
 *  - the *central* column shows the compact Candidate / Canonical
 *    comparison reusing the G6-1 compact format,
 *  - the *right* slot (workspace-reconciliation-slot) is visible and
 *    renders the Evidence / Audit / Rebuild accordion content,
 *  - the queue is reachable from the left rail.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleOntologyStudioRequest } from "../src/ontology-studio.js";

import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-recon-subview-"));
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
  writeFileSync(
    fixture.auditPath,
    JSON.stringify({
      patch: { ...fixture.patch, id: "decision-audit", created_at: "2026-05-21T01:00:00.000Z" },
      applied_at: "2026-05-21T02:00:00.000Z",
    }) + "\n",
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

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Track G G6-3 — reconciliation sub-view (HTTP)", () => {
  it("default route `/` renders the Workspace tab with the reconciliation slot HIDDEN", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/",
    );

    expect(result.status).toBe(200);
    // Tabs are present, Workspace is the active tab.
    expect(result.body).toMatch(
      /data-tab="workspace"[^>]*aria-selected="true"/,
    );
    expect(result.body).toMatch(
      /data-tab="reconciliation"[^>]*aria-selected="false"/,
    );
    // Right slot is hidden in workspace view.
    expect(result.body).toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*\shidden\b/,
    );
    // The G6-2 rail (with SEARCH/TYPES/SELECTED/FACETS/RESULTS) renders
    // in the left workbench rather than the legacy `ws-recon-toolbar`
    // override.
    expect(result.body).toContain('data-rail-section="search"');
    expect(result.body).toContain('data-rail-section="types"');
    expect(result.body).not.toContain('class="ws-recon-toolbar"');
  });

  it("?view=reconciliation deep-links into the reconciliation sub-view", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation",
    );

    expect(result.status).toBe(200);
    // Reconciliation tab is now active.
    expect(result.body).toMatch(
      /data-tab="reconciliation"[^>]*aria-selected="true"/,
    );
    // Right slot is VISIBLE and populated (no `hidden` attribute on the slot).
    expect(result.body).not.toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*\shidden\b/,
    );
    expect(result.body).toContain("Audit trail");
    expect(result.body).toContain("Evidence</summary>");
    expect(result.body).toContain("Rebuild status</summary>");
    // The candidate queue lives in the left rail (workbench), not in
    // central or the slot.
    expect(result.body).toContain('id="candidate-list"');
    // Central column shows the compact candidate/canonical comparison.
    expect(result.body).toContain('class="ws-recon-compare"');
    expect(result.body).toContain("candidate-component");
    expect(result.body).toContain("component-a");
  });

  it("?view=reconciliation&candidate=<id> deep-links to a specific candidate", () => {
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
    expect(result.body).toContain('data-candidate-id="candidate-high"');
    // Audit trail dedupes by patch id.
    expect(result.body).toContain("decision-audit");
    // Right slot visible.
    expect(result.body).not.toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*\shidden\b/,
    );
    // G6-4: the candidate central column uses the compact prose layout
    // (single H3 + 4 pills + inline mapping + Source/Community lines +
    // summary <dl>), not the legacy 5-row Card boxes.
    expect(result.body).toContain('class="ws-recon-mapping"');
    expect(result.body).toContain('class="ws-recon-summary"');
    expect(result.body).not.toMatch(
      /<section class="ws-recon-box">\s*<h4>Candidate<\/h4>/,
    );
    expect(result.body).not.toMatch(
      /<section class="ws-recon-box">\s*<h4>Shared terms<\/h4>/,
    );
  });

  it("declares a mobile breakpoint that collapses the right slot to a bottom sheet at 390 px", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation",
    );

    expect(result.body).toContain("@media (max-width: 768px)");
    // Bottom-sheet rule: the slot moves to the last grid row and gets a
    // capped max-height so 390 × 844 viewports never trigger horizontal
    // scroll. Fixed-width regressions would tickle this assertion.
    expect(result.body).not.toMatch(/width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
    expect(result.body).not.toMatch(/min-width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
  });
});
