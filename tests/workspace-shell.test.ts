import { describe, expect, it } from "vitest";

import {
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
});
