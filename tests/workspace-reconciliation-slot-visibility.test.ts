/**
 * Track G G6-3 (S2.3) — right reconciliation slot visibility.
 *
 * The `aside.workspace-reconciliation-slot` always exists in the DOM, but
 * carries the `hidden` attribute (and `aria-hidden`) when the active view
 * is *not* "reconciliation". When the user navigates to the Reconciliation
 * sub-view, the slot becomes visible and is populated with the provided
 * `rightDrawerHtml`.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

describe("Track G G6-3 — reconciliation slot visibility", () => {
  it("hides the slot (hidden attribute + aria-hidden) when activeView === 'workspace'", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "X",
      state: createDefaultViewerState(),
      rightDrawerHtml: '<aside id="should-not-appear">recon body</aside>',
    });
    expect(html).toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*\shidden\b/,
    );
    expect(html).toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*aria-hidden="true"/,
    );
    expect(html).not.toContain('id="should-not-appear"');
  });

  it("hides the slot when activeView === 'evidence'", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "X",
      state: { ...createDefaultViewerState(), activeView: "evidence" },
      rightDrawerHtml: '<aside id="should-not-appear">recon body</aside>',
    });
    expect(html).toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*\shidden\b/,
    );
    expect(html).not.toContain('id="should-not-appear"');
  });

  it("shows the slot and renders rightDrawerHtml when activeView === 'reconciliation'", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "X",
      state: { ...createDefaultViewerState(), activeView: "reconciliation" },
      rightDrawerHtml: '<aside id="recon-detail">Audit trail</aside>',
    });
    expect(html).not.toMatch(
      /<aside[^>]*class="workspace-reconciliation-slot"[^>]*\shidden\b/,
    );
    expect(html).toContain('id="recon-detail"');
    expect(html).toContain('data-active-view="reconciliation"');
  });
});
