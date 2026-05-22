/**
 * Track G G6-1 (S0.1) — three-column workspace shell.
 *
 * Verifies that the shell carries the new `workspace-reconciliation-slot`
 * scaffolding alongside the existing left rail / central column, and that
 * the slot is empty (no inline content) when the default Workspace view is
 * active (`state.activeView === "workspace"`). The mobile breakpoint must
 * collapse the slot so 390 px screens never trigger horizontal scroll.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

describe("Track G G6-1 — three-column shell", () => {
  it("renders the named reconciliation slot as a third effective column", () => {
    const html = renderWorkspaceShell({ tokens, title: "Workspace" });
    expect(html).toContain('class="workspace-reconciliation-slot');
    expect(html).toContain('id="workspace-reconciliation-slot"');
    // Grid declares three desktop columns.
    expect(html).toContain('grid-template-columns: 280px 1fr 320px');
  });

  it("leaves the reconciliation slot empty (and aria-hidden) in default Workspace view", () => {
    const state = createDefaultViewerState();
    // Default activeView is "workspace" — slot must be empty.
    expect(state.activeView).toBe("workspace");
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state,
      rightDrawerHtml: '<aside id="should-not-appear">hidden</aside>',
    });
    expect(html).toContain('id="workspace-reconciliation-slot"');
    expect(html).toContain('data-active-view="workspace"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('id="should-not-appear"');
  });

  it("still honours rightDrawerHtml when activeView is not 'workspace' (e.g. studio reconciliation)", () => {
    const state = { ...createDefaultViewerState(), activeView: "studio" };
    const html = renderWorkspaceShell({
      tokens,
      title: "Studio",
      state,
      rightDrawerHtml: '<aside id="recon-detail">Audit</aside>',
    });
    expect(html).toContain('id="recon-detail"');
    expect(html).toContain('data-active-view="studio"');
    expect(html).not.toContain('aria-hidden="true"');
  });

  it("collapses the reconciliation slot to nothing at the 768 px mobile breakpoint", () => {
    const html = renderWorkspaceShell({ tokens, title: "Workspace" });
    expect(html).toContain("@media (max-width: 768px)");
    // Mobile rule must zero-out the slot in workspace view to avoid scrolling at 390 px.
    expect(html).toMatch(
      /\.workspace-reconciliation-slot\[data-active-view=['"]workspace['"]\]\s*\{[^}]*display:\s*none/,
    );
  });

  it("does not declare any fixed width that would force horizontal scroll on 390 px screens", () => {
    const html = renderWorkspaceShell({ tokens, title: "Workspace" });
    expect(html).not.toMatch(/width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
    expect(html).not.toMatch(/min-width:\s*(?:1[0-9]{3,}|[2-9][0-9]{3,})px/);
  });
});
