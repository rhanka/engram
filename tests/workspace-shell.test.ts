import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

describe("Track G G2 — workspace shell scaffold", () => {
  it("renders an HTML5 document with the expected named regions", () => {
    const html = renderWorkspaceShell({ tokens, title: "Ontology workspace" });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('role="banner"');
    expect(html).toContain('id="left-workbench"');
    expect(html).toContain('id="central-display"');
    expect(html).toContain('id="graph-panel"');
    expect(html).toContain('id="right-drawer"');
    expect(html).toContain('role="main"');
    expect(html).toContain('role="application"');
  });

  it("marks the token source and lets studio routes fill each workspace region", () => {
    const html = renderWorkspaceShell({
      tokens,
      tokenSource: "fallback",
      title: "Ontology workspace",
      leftWorkbenchHtml: '<nav id="candidate-list">Candidate queue</nav>',
      centralDisplayHtml: '<article id="candidate-detail">Candidate detail</article>',
      rightDrawerHtml: '<aside id="audit-detail">Audit trail</aside>',
    });

    expect(html).toContain('data-token-source="fallback"');
    expect(html).toContain('<nav id="candidate-list">Candidate queue</nav>');
    expect(html).toContain('<article id="candidate-detail">Candidate detail</article>');
    expect(html).toContain('<aside id="audit-detail">Audit trail</aside>');
    expect(html).not.toContain("Queue rendering arrives in G5.");
    expect(html).not.toContain("Evidence / relations / audit trail accordion arrives with G5.");
  });

  it("keeps central display copy neutral until item rendering is wired", () => {
    const html = renderWorkspaceShell({ tokens, title: "Ontology workspace" });
    expect(html).toContain("No display item selected.");
    expect(html).not.toContain("G4 fills");
    expect(html).not.toContain("Track A wiki sidecar");
  });

  it("escapes the title so HTML in user input cannot break the shell", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("emits a skip-link as the first focusable element", () => {
    const html = renderWorkspaceShell({ tokens, title: "X" });
    const skipIndex = html.indexOf("ws-skip-link");
    const headerIndex = html.indexOf('class="ws-header"');
    expect(skipIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeGreaterThan(-1);
    expect(skipIndex).toBeLessThan(headerIndex);
    expect(html).toContain('href="#central-display"');
  });

  it("injects every token group as a --ws- CSS custom property", () => {
    const html = renderWorkspaceShell({ tokens, title: "X" });
    expect(html).toContain("--ws-surface:");
    expect(html).toContain("--ws-text:");
    expect(html).toContain("--ws-accent:");
    expect(html).toContain("--ws-space-4:");
    expect(html).toContain("--ws-radius-md:");
    expect(html).toContain("--ws-outline-color:");
  });

  it("flags write mode and read-only mode explicitly in the header banner", () => {
    const writeHtml = renderWorkspaceShell({
      tokens,
      title: "X",
      writeEnabled: true,
    });
    const readOnlyHtml = renderWorkspaceShell({
      tokens,
      title: "X",
      writeEnabled: false,
    });
    expect(writeHtml).toContain('data-write="true"');
    expect(writeHtml).toContain("WRITE ENABLED");
    expect(readOnlyHtml).toContain('data-write="false"');
    expect(readOnlyHtml).toContain("read-only");
  });

  it("renders the queue-empty hint when queueEmpty is true", () => {
    const empty = renderWorkspaceShell({ tokens, title: "X", queueEmpty: true });
    const populated = renderWorkspaceShell({ tokens, title: "X" });
    expect(empty).toContain('id="ws-queue-empty"');
    expect(empty).toContain("Reconciliation queue is empty.");
    expect(populated).toContain('id="ws-queue-stub"');
  });

  it("collapses the workbench to a top sheet via a 768px breakpoint", () => {
    const html = renderWorkspaceShell({ tokens, title: "X" });
    expect(html).toContain("@media (max-width: 768px)");
    expect(html).toContain("grid-template-columns: 1fr;");
    expect(html).toContain("max-height: 40vh;");
  });

  it("does not declare a fixed pixel width that would force horizontal scroll on 390px screens", () => {
    const html = renderWorkspaceShell({ tokens, title: "X" });
    expect(html).not.toMatch(/width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
    expect(html).not.toMatch(/min-width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
  });

  it("shows last-rebuilt timestamp only when provided", () => {
    const without = renderWorkspaceShell({ tokens, title: "X" });
    const withTs = renderWorkspaceShell({
      tokens,
      title: "X",
      lastRebuiltAt: "2026-05-20T08:58:00Z",
    });
    expect(without).not.toContain("last rebuilt");
    expect(withTs).toContain("last rebuilt: 2026-05-20T08:58:00Z");
  });

  it("renders selected entity content with safe graph-derived counts", () => {
    const state = {
      ...createDefaultViewerState(),
      displayRef: "entity:holmes",
    };
    const html = renderWorkspaceShell({
      tokens,
      title: "Ontology workspace",
      state,
      graph: {
        nodes: [
          {
            id: "holmes",
            label: "Sherlock <Holmes>",
            node_type: "Character",
            summary: "Consulting detective & violinist.",
          },
          { id: "watson", label: "Dr Watson", node_type: "Character" },
          { id: "ring", label: "Wedding ring", node_type: "Evidence" },
        ],
        edges: [
          { source: "holmes", target: "watson", relation: "works_with", evidence: ["chapter-1"] },
          { source: "ring", target: "holmes", relation: "points_to", evidence_count: 2 },
        ],
      },
    });

    expect(html).toContain('data-display-ref="entity:holmes"');
    expect(html).toContain("Sherlock &lt;Holmes&gt;");
    expect(html).toContain("Character");
    expect(html).toContain("Consulting detective &amp; violinist.");
    expect(html).toContain("<b>Relations:</b> 2");
    expect(html).toContain("<b>Evidence:</b> 3");
    expect(html).not.toContain("Sherlock <Holmes>");
  });

  it("renders useful source context for Graphify code nodes without descriptions", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Code graph workspace",
      state: { ...createDefaultViewerState(), displayRef: "entity:workspace_shell_renderworkspaceshell" },
      graph: {
        nodes: [
          {
            id: "workspace_shell_renderworkspaceshell",
            label: "renderWorkspaceShell()",
            file_type: "code",
            source_file: "src/workspace/shell.ts",
            source_location: "L270",
            community_name: "Workspace rendering",
          },
        ],
        links: [],
      },
    });

    expect(html).toContain("renderWorkspaceShell()");
    expect(html).toContain("code");
    expect(html).toContain("Source: src/workspace/shell.ts:L270");
    expect(html).toContain("Community: Workspace rendering");
    expect(html).not.toContain("No summary available.");
  });

  it("renders selected type and candidate display refs without profile-specific wiring", () => {
    const graph = {
      nodes: [
        { id: "holmes", label: "Sherlock Holmes", node_type: "Character" },
        { id: "watson", label: "Dr Watson", node_type: "Character" },
        { id: "motive", label: "Motive candidate", kind: "candidate", description: "Needs review." },
      ],
      links: [{ source: "holmes", target: "watson", relation: "works_with" }],
    };

    const typeHtml = renderWorkspaceShell({
      tokens,
      title: "Ontology workspace",
      state: { ...createDefaultViewerState(), displayRef: "type:Character" },
      graph,
    });
    expect(typeHtml).toContain("Character");
    expect(typeHtml).toContain("Type");
    expect(typeHtml).toContain("<b>Members:</b> 2");
    expect(typeHtml).toContain("<b>Relations:</b> 1");

    const candidateHtml = renderWorkspaceShell({
      tokens,
      title: "Ontology workspace",
      state: { ...createDefaultViewerState(), displayRef: "candidate:motive" },
      graph,
    });
    expect(candidateHtml).toContain("Motive candidate");
    expect(candidateHtml).toContain("candidate");
    expect(candidateHtml).toContain("Needs review.");
  });
});
