/**
 * Track G G6-4 (closes G6-1 S0.2 debt) — compact candidate / canonical
 * comparison layout.
 *
 * The reconciliation sub-view central column previously rendered Type /
 * Status / Confidence / Source / Community on 5 separate Card rows (one
 * "ws-recon-box" per side) plus Shared terms / Reasons / Decision basis
 * each in their own framed boxes. Combined, that grew to ~480 px of
 * vertical chrome before the counters row. G6-4 pays back the UI debt
 * by re-using the G6-1 compact prose pattern: one H1, one row of pill
 * chips, an inline "candidate → canonical" prose line, a "•"-separated
 * meta row, and a single definition list for shared terms / reasons /
 * decision basis.
 *
 * Profile-neutral: no corpus-specific strings. Mobile 390 × 844 must
 * keep wrapping cleanly (no fixed widths > 1000 px).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleOntologyStudioRequest } from "../src/ontology-studio.js";

import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-g6-4-compact-"));
  tempDirs.push(dir);
  return dir;
}

function writeCandidateQueue(
  fixture: ReturnType<typeof writeOntologyWriteFixture>,
): void {
  const reconciliationDir = join(fixture.stateDir, "ontology", "reconciliation");
  mkdirSync(reconciliationDir, { recursive: true });
  writeFileSync(
    join(reconciliationDir, "candidates.json"),
    JSON.stringify(
      {
        schema: "graphify_ontology_reconciliation_candidates_v1",
        graph_hash: "graph-hash",
        profile_hash: "profile-hash",
        generated_at: "2026-05-23T00:00:00.000Z",
        candidate_count: 1,
        candidates: [
          {
            id: "candidate-high",
            kind: "entity_match",
            status: "candidate",
            score: 0.95,
            candidate_id: "candidate-component",
            canonical_id: "component-a",
            shared_terms: ["component"],
            evidence_refs: ["manual.md#p1", "manual.md#p2"],
            reasons: [
              "same node type: Component",
              "shared normalized term(s): component",
            ],
            proposed_patch_operation: "accept_match",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function writeGraphPreview(
  fixture: ReturnType<typeof writeOntologyWriteFixture>,
): void {
  writeFileSync(
    join(fixture.stateDir, "graph.json"),
    JSON.stringify(
      {
        nodes: [
          {
            id: "candidate-component",
            label: "Candidate component",
            node_type: "Component",
            status: "candidate",
            confidence: "EXTRACTED",
            source_file: "manual.md",
            source_location: "p1",
            community_name: "Operations chain",
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
            community_name: "Operations chain",
            community: 1,
          },
        ],
        links: [],
      },
      null,
      2,
    ),
    "utf-8",
  );
  writeFileSync(
    join(fixture.stateDir, "graph.html"),
    "<!doctype html><title>graph</title>",
    "utf-8",
  );
}

function reconciliationCentralBody(html: string): string {
  // Slice everything between the opening of the central display container
  // and the counters block. This is the surface the user perceives as the
  // "descriptive block" we want to keep compact.
  const start = html.indexOf('class="ws-recon-candidate"');
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('class="ws-counters"', start);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Track G G6-4 — compact candidate / canonical layout", () => {
  it("renders a single H1 (the reconcile id) and the 4 pill chips inline", () => {
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
    const central = reconciliationCentralBody(result.body);
    // Exactly one heading for the candidate id at the top of the central body.
    const headingMatches = [
      ...central.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g),
    ];
    expect(headingMatches.length).toBe(1);
    expect(headingMatches[0]![1]).toContain("candidate-high");
    // 4 pill chips in a single toolbar row.
    expect(central).toContain("entity_match");
    expect(central).toContain("candidate</span>");
    expect(central).toContain("score 95%");
    expect(central).toContain("accept_match");
    const pills = [...central.matchAll(/class="ws-recon-pill"/g)];
    expect(pills.length).toBe(4);
  });

  it("collapses Candidate / Canonical into a single inline prose row (no per-side ws-recon-box cards, no Type/Status/Confidence dl rows)", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );

    const central = reconciliationCentralBody(result.body);
    // Legacy per-side cards must be gone — both labels live in one prose line.
    expect(central).not.toMatch(/<section class="ws-recon-box">\s*<h4>Candidate<\/h4>/);
    expect(central).not.toMatch(/<section class="ws-recon-box">\s*<h4>Canonical<\/h4>/);
    // The 5-row vertical Type/Status/Confidence/Source/Community dt/dd
    // structure (one row per fact, repeated twice on each side) is the
    // exact debt we are paying back. None of those dl rows must remain.
    expect(central).not.toMatch(/<div>\s*<dt>Type<\/dt>/);
    expect(central).not.toMatch(/<div>\s*<dt>Status<\/dt>/);
    expect(central).not.toMatch(/<div>\s*<dt>Confidence<\/dt>/);
    expect(central).not.toMatch(/<div>\s*<dt>Source<\/dt>/);
    expect(central).not.toMatch(/<div>\s*<dt>Community<\/dt>/);
    // The arrow line conveys the mapping in plain text.
    expect(central).toContain('class="ws-recon-mapping"');
    expect(central).toContain("Candidate component");
    expect(central).toContain("Component A");
    expect(central).toContain("→");
    // The id mapping prose + meta line carries Type/Status/Confidence
    // inline, "•"-separated.
    expect(central).toContain('class="ws-recon-ids"');
    expect(central).toContain("candidate-component");
    expect(central).toContain("component-a");
    expect(central).toContain('class="ws-recon-meta-inline"');
    // The compact meta line collapses Type / Status / Confidence on ONE
    // row; we assert presence + ordering rather than the exact glue.
    expect(central).toMatch(/Component[\s\S]*candidate[\s\S]*EXTRACTED/);
  });

  it("renders Source and Community as single-line Key: value prose, not framed boxes", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );

    const central = reconciliationCentralBody(result.body);
    expect(central).toContain('class="ws-recon-line" data-line="source"');
    expect(central).toContain("manual.md:p1");
    expect(central).toContain('class="ws-recon-line" data-line="community"');
    expect(central).toContain("Operations chain");
  });

  it("renders Shared terms / Reasons / Decision basis as a single compact <dl>, not as framed Card boxes", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );

    const central = reconciliationCentralBody(result.body);
    // No <h4>Shared terms</h4>, <h4>Reasons</h4>, <h4>Decision basis</h4>
    // inside .ws-recon-box framed cards anymore — they collapse into a
    // single compact definition list.
    expect(central).not.toMatch(/<section class="ws-recon-box">\s*<h4>Shared terms<\/h4>/);
    expect(central).not.toMatch(/<section class="ws-recon-box">\s*<h4>Reasons<\/h4>/);
    expect(central).not.toMatch(/<section class="ws-recon-box">\s*<h4>Decision basis<\/h4>/);
    expect(central).toContain('class="ws-recon-summary"');
    // Three dt/dd pairs inside one dl.
    expect(central).toMatch(
      /<dt[^>]*data-term="shared-terms"[^>]*>[\s\S]*?SHARED TERMS[\s\S]*?<\/dt>/,
    );
    expect(central).toMatch(
      /<dt[^>]*data-term="reasons"[^>]*>[\s\S]*?REASONS[\s\S]*?<\/dt>/,
    );
    expect(central).toMatch(
      /<dt[^>]*data-term="decision-basis"[^>]*>[\s\S]*?DECISION BASIS[\s\S]*?<\/dt>/,
    );
    // Content of the three sections is still exposed (no info loss).
    expect(central).toContain("component"); // shared term
    expect(central).toContain("same node type: Component"); // reason
    expect(central).toContain("shared normalized term(s): component"); // reason
    expect(central).toContain("accept_match"); // decision basis operation
    expect(central).toContain("manual.md#p1"); // evidence ref
    expect(central).toContain("manual.md#p2"); // evidence ref
  });

  it("keeps the descriptive block structurally compact (≤ 6 major structural elements between H1 and counters)", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );

    const central = reconciliationCentralBody(result.body);
    // Count <section> elements inside the descriptive block (proxy for
    // vertical height since each adds padding/border in the framed
    // layout we are demolishing). In the verbose layout this was 5
    // (Candidate, Canonical, Shared terms, Reasons, Decision basis).
    const sections = [...central.matchAll(/<section\b/g)];
    expect(sections.length).toBeLessThanOrEqual(2);
    // .ws-recon-box (the framed Card visual unit) must not appear at all
    // anymore: prose lines replace them.
    const boxes = [...central.matchAll(/class="ws-recon-box"/g)];
    expect(boxes.length).toBe(0);
  });

  it("hides the descriptive block when no candidate is selected (and emits no h3/dl/pills)", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    // Intentionally do NOT write a candidate queue: candidate set is empty.
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation",
    );

    expect(result.status).toBe(200);
    // No central candidate article rendered.
    expect(result.body).not.toContain('class="ws-recon-candidate"');
    expect(result.body).not.toContain('class="ws-recon-mapping"');
    expect(result.body).not.toContain('class="ws-recon-summary"');
    // The reconciliation tab is still the active one (routing still works).
    expect(result.body).toMatch(
      /data-tab="reconciliation"[^>]*aria-selected="true"/,
    );
  });

  it("never leaks corpus-specific strings (framework / abp / process_std / ABPProcess / BusinessObject / DigitalApplicationTool)", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );

    const central = reconciliationCentralBody(result.body);
    expect(central).not.toMatch(
      /\b(?:framework|abp|process_std|ABPProcess|ProcessStdProcess|BusinessObject|DigitalApplicationTool)\b/,
    );
  });

  it("declares no fixed widths > 1000 px (mobile 390 × 844 wraps cleanly)", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?view=reconciliation&candidate=candidate-high",
    );

    // Style block must not declare any width / min-width above ~1000 px,
    // which would force horizontal scroll on a 390 px viewport.
    expect(result.body).not.toMatch(/width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
    expect(result.body).not.toMatch(/min-width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
    // The "@media" breakpoint must keep collapsing the compare into a
    // single column.
    expect(result.body).toContain("@media (max-width: 768px)");
  });
});
