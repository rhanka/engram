/**
 * Track G G6-1 (S0.2) — compact central description block.
 *
 * Replaces the verbose Type/Status/Confidence/Source/Community cards with
 * a single compact prose block (H1 + inline facts + Aliases/Relations/
 * Evidence as small-caps sections). Same rendering applies to entity
 * displayRef AND candidate displayRef. `insufficient_evidence` continues
 * to hide the description silently.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
  type GraphLike,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

const graph: GraphLike = {
  nodes: [
    {
      id: "holmes",
      label: "Sherlock Holmes",
      node_type: "Character",
      status: "active",
      confidence: "EXTRACTED",
      source_file: "doc.md",
      source_location: "L1",
      community_name: "Detectives",
      aliases: ["Holmes", "The detective"],
      summary: "Consulting detective.",
    },
    { id: "watson", label: "Dr Watson", node_type: "Character" },
  ],
  edges: [
    { source: "holmes", target: "watson", relation: "works_with", evidence_count: 2 },
  ],
};

describe("Track G G6-1 — compact entity description", () => {
  it("renders entity prose compactly with no verbose Type/Status/Confidence/Source/Community rows", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: { ...createDefaultViewerState(), displayRef: "entity:holmes" },
      graph,
    });
    // H1 title present.
    expect(html).toContain('class="ws-compact-title"');
    expect(html).toContain("Sherlock Holmes");
    // Prose lines are flowed inline (single .ws-compact-facts block).
    expect(html).toContain('class="ws-compact-facts"');
    // The legacy dt/dd rows must be gone: each fact must NOT live in its own card row.
    expect(html).not.toMatch(/<div>\s*<dt>Type<\/dt>/);
    expect(html).not.toMatch(/<div>\s*<dt>Status<\/dt>/);
    expect(html).not.toMatch(/<div>\s*<dt>Confidence<\/dt>/);
    // Compact aliases section uses small-caps heading and inline list.
    expect(html).toContain('class="ws-compact-section ws-compact-aliases"');
    expect(html).toContain("Holmes");
    expect(html).toContain("The detective");
    // Compact relations + evidence sections.
    expect(html).toContain('class="ws-compact-section ws-compact-relations"');
    expect(html).toContain('class="ws-compact-section ws-compact-evidence"');
  });

  it("renders a candidate displayRef using the same compact prose layout", () => {
    const candidateGraph: GraphLike = {
      nodes: [
        {
          id: "motive",
          label: "Motive candidate",
          kind: "candidate",
          description: "Needs review.",
        },
      ],
      links: [],
    };
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: { ...createDefaultViewerState(), displayRef: "candidate:motive" },
      graph: candidateGraph,
    });
    expect(html).toContain('class="ws-compact-title"');
    expect(html).toContain("Motive candidate");
    expect(html).toContain("Needs review.");
    expect(html).toContain('class="ws-compact-facts"');
  });

  it("hides the description block silently when the sidecar reports insufficient_evidence", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: { ...createDefaultViewerState(), displayRef: "entity:holmes" },
      graph,
      descriptionSidecar: {
        status: "insufficient_evidence",
        target_id: "holmes",
        target_kind: "node",
      },
    });
    // The compact block is gone, no description text leaked.
    expect(html).not.toContain('class="ws-compact-description"');
    expect(html).not.toContain("Consulting detective.");
    // But the title is still rendered (insufficient_evidence hides the description,
    // not the entity card itself).
    expect(html).toContain("Sherlock Holmes");
  });

  it("inlines the Track A markdown description when the sidecar status is 'generated'", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: { ...createDefaultViewerState(), displayRef: "entity:holmes" },
      graph,
      descriptionSidecar: {
        status: "generated",
        target_id: "holmes",
        target_kind: "node",
        description: "**Bold** prose from the wiki sidecar.",
      },
    });
    expect(html).toContain('class="ws-compact-description"');
    // Bold markdown is preserved as inline emphasis (escaped or transformed
    // to <strong>; assert non-empty rendering).
    expect(html.includes("Bold prose from the wiki sidecar") || html.includes("<strong>Bold</strong>"))
      .toBe(true);
  });

  it("does not hardcode any corpus-specific string (Process / framework / abp / process_std / BusinessObject)", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: { ...createDefaultViewerState(), displayRef: "entity:holmes" },
      graph,
    });
    expect(html).not.toMatch(/\b(?:framework|abp|process_std|ABPProcess|ProcessStdProcess|BusinessObject|DigitalApplicationTool)\b/);
  });
});
