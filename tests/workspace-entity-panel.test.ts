/**
 * Track G G-studio-lot4 (#7) — right-column entity panel.
 *
 * When a node is selected, the REAL right column (not the canvas, not the
 * dark sidebar) shows the entity:
 *   - the wiki DESCRIPTION (from the descriptions sidecar; insufficient_evidence
 *     omits the block entirely — no placeholder);
 *   - its RELATIONS (parity with EntityRelationsAccordion);
 *   - the evidence SNIPPET (intent point 5 — a short quote, not the whole source);
 *   - OCCURRENCE / citation COUNTS (intent point 6 — total mentions + per-document
 *     appearance count) from the occurrences data.
 *
 * Profile-neutral: no corpus-specific strings.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderEntityPanel,
  renderWorkspaceShell,
  type EntityPanelOccurrences,
  type GraphLike,
} from "../src/workspace/index.js";

const graph: GraphLike = {
  nodes: [
    { id: "holmes", label: "Sherlock Holmes", node_type: "Character", community_name: "Detectives" },
    { id: "watson", label: "Dr Watson", node_type: "Character" },
    { id: "study", label: "A Study in Scarlet", node_type: "Work" },
  ],
  edges: [
    { source: "holmes", target: "watson", relation: "works_with" },
    { source: "study", target: "holmes", relation: "features" },
  ],
};

function panel(args: Partial<Parameters<typeof renderEntityPanel>[0]> = {}): string {
  return renderEntityPanel({
    node: graph.nodes[0]!,
    graph,
    ...args,
  });
}

describe("Track G G-studio-lot4 — entity panel (#7)", () => {
  it("renders the entity title and type in the right column", () => {
    const html = panel();
    expect(html).toContain('class="ws-entity-panel"');
    expect(html).toContain("Sherlock Holmes");
    expect(html).toContain("Character");
  });

  it("inlines the generated wiki description from the sidecar", () => {
    const html = panel({
      descriptionSidecar: {
        status: "generated",
        target_id: "holmes",
        target_kind: "node",
        description: "Consulting detective of 221B Baker Street.",
      },
    });
    expect(html).toContain('class="ws-entity-description"');
    expect(html).toContain("Consulting detective of 221B Baker Street.");
  });

  it("omits the description block silently on insufficient_evidence (no placeholder)", () => {
    const html = panel({
      descriptionSidecar: {
        status: "insufficient_evidence",
        target_id: "holmes",
        target_kind: "node",
      },
    });
    expect(html).not.toContain('class="ws-entity-description"');
    // Title still rendered.
    expect(html).toContain("Sherlock Holmes");
  });

  it("lists relations (incoming + outgoing) with the related entity label and relation", () => {
    const html = panel();
    expect(html).toContain('class="ws-entity-relations"');
    // Outgoing: holmes works_with watson.
    expect(html).toContain("works_with");
    expect(html).toContain("Dr Watson");
    // Incoming: study features holmes.
    expect(html).toContain("features");
    expect(html).toContain("A Study in Scarlet");
  });

  it("shows a short evidence snippet (a quote, not the whole source) when available", () => {
    const occurrences: EntityPanelOccurrences = {
      holmes: {
        total: 12,
        documents: { "study-in-scarlet.txt": 5, "the-sign-of-four.txt": 7 },
        snippets: ["...the world's only consulting detective, Mr Sherlock Holmes..."],
      },
    };
    const html = panel({ occurrences });
    expect(html).toContain('class="ws-entity-snippet"');
    // The apostrophe is HTML-escaped (&#39;) in the rendered quote.
    expect(html).toContain("the world&#39;s only consulting detective");
  });

  it("shows occurrence / citation counts: total mentions + per-document appearance count", () => {
    const occurrences: EntityPanelOccurrences = {
      holmes: {
        total: 12,
        documents: { "study-in-scarlet.txt": 5, "the-sign-of-four.txt": 7 },
      },
    };
    const html = panel({ occurrences });
    expect(html).toContain('class="ws-entity-occurrences"');
    // Total mentions surfaced.
    expect(html).toMatch(/12[\s\S]*mention/i);
    // Per-document appearance count surfaced.
    expect(html).toContain("study-in-scarlet.txt");
    expect(html).toMatch(/study-in-scarlet\.txt[\s\S]*?5/);
  });

  it("renders no occurrences block when there is no occurrence data for the node", () => {
    const html = panel({ occurrences: {} });
    expect(html).not.toContain('class="ws-entity-occurrences"');
    expect(html).not.toContain('class="ws-entity-snippet"');
  });

  it("does not leak corpus-specific strings", () => {
    const html = panel({
      descriptionSidecar: {
        status: "generated",
        target_id: "holmes",
        target_kind: "node",
        description: "A description.",
      },
    });
    expect(html).not.toMatch(/\b(?:framework|abp|process_std|ABPProcess|ProcessStdProcess|BusinessObject|DigitalApplicationTool)\b/);
  });
});

describe("Track G G-studio-lot4 — entity panel in the shell right column (#7)", () => {
  it("surfaces the entity panel in the right slot in workspace view when an entity is selected", () => {
    const tokens = getWorkspaceTokens("light");
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: { ...createDefaultViewerState(), activeView: "workspace", displayRef: "entity:holmes" },
      graph,
      entityPanelHtml: renderEntityPanel({ node: graph.nodes[0]!, graph }),
    });
    // The right slot is visible (not aria-hidden) and carries the panel.
    expect(html).toContain('id="workspace-reconciliation-slot"');
    expect(html).toContain('class="ws-entity-panel"');
    // The panel sits in the right column slot, not inside the canvas / center.
    const slotIdx = html.indexOf('id="workspace-reconciliation-slot"');
    const panelIdx = html.indexOf('class="ws-entity-panel"');
    expect(panelIdx).toBeGreaterThan(slotIdx);
    // Slot tagged as the entity view (so it is NOT hidden by the workspace rule).
    expect(html).toContain('data-active-view="entity"');
  });

  it("keeps the right slot hidden in workspace view when no entity panel is provided", () => {
    const html = renderWorkspaceShell({
      tokens: getWorkspaceTokens("light"),
      title: "Workspace",
      state: { ...createDefaultViewerState(), activeView: "workspace" },
      graph,
    });
    expect(html).toContain('aria-hidden="true"');
  });
});
