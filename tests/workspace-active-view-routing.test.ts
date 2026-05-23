/**
 * Track G G6-3 (S2.1) — top-tabs routing.
 *
 * Verifies that the workspace shell exposes a Workspace / Reconciliation /
 * Evidence tab triad bound to `WorkspaceViewerState.activeView`, that the
 * default tab is "workspace", that the URL serializer round-trips the
 * active view, and that the rendered tabs honour the current state via
 * `aria-selected`.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
  viewerStateFromQuery,
  viewerStateToQuery,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

describe("Track G G6-3 — active view routing", () => {
  it("defaults activeView to 'workspace'", () => {
    expect(createDefaultViewerState().activeView).toBe("workspace");
  });

  it("renders the three top tabs Workspace / Reconciliation / Evidence", () => {
    const html = renderWorkspaceShell({ tokens, title: "Workspace" });
    expect(html).toContain('class="ws-tabs"');
    expect(html).toContain('data-tab="workspace"');
    expect(html).toContain('data-tab="reconciliation"');
    expect(html).toContain('data-tab="evidence"');
    expect(html).toContain(">Workspace<");
    expect(html).toContain(">Reconciliation<");
    expect(html).toContain(">Evidence<");
  });

  it("marks the active tab with aria-selected='true' and others with 'false'", () => {
    const workspaceHtml = renderWorkspaceShell({ tokens, title: "X" });
    expect(workspaceHtml).toMatch(
      /data-tab="workspace"[^>]*aria-selected="true"/,
    );
    expect(workspaceHtml).toMatch(
      /data-tab="reconciliation"[^>]*aria-selected="false"/,
    );
    expect(workspaceHtml).toMatch(
      /data-tab="evidence"[^>]*aria-selected="false"/,
    );

    const reconHtml = renderWorkspaceShell({
      tokens,
      title: "X",
      state: { ...createDefaultViewerState(), activeView: "reconciliation" },
    });
    expect(reconHtml).toMatch(
      /data-tab="reconciliation"[^>]*aria-selected="true"/,
    );
    expect(reconHtml).toMatch(
      /data-tab="workspace"[^>]*aria-selected="false"/,
    );
  });

  it("tabs point to the matching ?view= URL via plain anchors (server-rendered routing)", () => {
    const html = renderWorkspaceShell({ tokens, title: "X" });
    // Tabs are anchors so the live HTTP layer can rely on standard
    // navigation. Workspace tab clears the query (`/`).
    expect(html).toMatch(/data-tab="workspace"[^>]*href="\/"/);
    expect(html).toMatch(/data-tab="reconciliation"[^>]*href="\/\?view=reconciliation"/);
    expect(html).toMatch(/data-tab="evidence"[^>]*href="\/\?view=evidence"/);
  });

  it("URL query round-trip preserves activeView for reconciliation and evidence", () => {
    const reconQuery = viewerStateToQuery({
      ...createDefaultViewerState(),
      activeView: "reconciliation",
    });
    expect(reconQuery.view).toBe("reconciliation");
    expect(viewerStateFromQuery(reconQuery).activeView).toBe("reconciliation");

    const evidenceQuery = viewerStateToQuery({
      ...createDefaultViewerState(),
      activeView: "evidence",
    });
    expect(evidenceQuery.view).toBe("evidence");
    expect(viewerStateFromQuery(evidenceQuery).activeView).toBe("evidence");

    // Default view emits no `view` query key.
    expect(viewerStateToQuery(createDefaultViewerState()).view).toBeUndefined();
  });

  it("Evidence sub-view ships as an inert placeholder pointing to G7", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "X",
      state: { ...createDefaultViewerState(), activeView: "evidence" },
    });
    expect(html).toContain("Evidence view coming soon");
    expect(html).toContain('data-view="evidence"');
  });
});
