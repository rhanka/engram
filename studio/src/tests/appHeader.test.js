import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.svelte"), "utf8");

describe("App header DS structure", () => {
  it("uses the DS AppChrome chrome for brand, segmented navigation and graph stats", () => {
    expect(appSource).toMatch(/import \{[^}]*AppChrome[^}]*Button[^}]*Badge[^}]*ButtonGroup[^}]*\}/);
    // Simple "Graphify" title — the "Ontology Studio" subtitle was dropped
    // (brand simplification); AppChrome now carries a single productName.
    expect(appSource).toMatch(/<AppChrome[\s\S]*productName="Graphify"/);
    expect(appSource).toMatch(
      /{#snippet identity\(\)}[\s\S]*<ButtonGroup[\s\S]*attached[\s\S]*label="Studio view"/,
    );
    expect(appSource).toMatch(/aria-pressed=\{viewerState\.activeView === "workspace"\}/);
    expect(appSource).toMatch(/aria-pressed=\{viewerState\.activeView === "reconciliation"\}/);
    expect(appSource).toMatch(/onclick=\{\(\) => handleSetView\("workspace"\)\}/);
    expect(appSource).toMatch(/onclick=\{\(\) => handleSetView\("reconciliation"\)\}/);
    expect(appSource).toMatch(
      /{#snippet extraSelectors\(\)}[\s\S]*class="app-stats"[\s\S]*aria-label="Graph summary"/,
    );
    expect(appSource).toContain("<Badge tone=\"neutral\">{scene.stats.nodeCount} nodes</Badge>");
    expect(appSource).toContain("<Badge tone=\"neutral\">{scene.stats.edgeCount} edges</Badge>");
    expect(appSource).toContain("<Badge tone=\"info\">{scene.stats.communityCount} groups</Badge>");
  });

  it("renders the in-UI model switcher (DS Select) in the chrome, gated on >1 model", () => {
    expect(appSource).toMatch(/import \{[^}]*\bSelect\b[^}]*\} from "@sentropic\/design-system-svelte"/);
    expect(appSource).toMatch(/{#snippet extraSelectors\(\)}[\s\S]*{#if modelStore\.models\.length > 1}/);
    expect(appSource).toMatch(/<Select[\s\S]*value=\{modelId\}[\s\S]*onchange=\{[^}]*handleSelectModel/);
    expect(appSource).toMatch(/{#each modelStore\.models as model \(model\.id\)}/);
  });

  it("keeps responsive header behavior on local slot content instead of DS internals", () => {
    expect(appSource).not.toMatch(/st-appChrome__/);
    expect(appSource).not.toMatch(/st-appHeader__/);
    expect(appSource).not.toMatch(/\.app-view-switcher \.st-button/);
    expect(appSource).toMatch(/class="view-label view-label--full">Knowledge graph</);
    expect(appSource).toMatch(/class="view-label view-label--full">Entity reconciliation</);
    expect(appSource).toMatch(/class="view-label view-label--compact" aria-hidden="true"[\s\S]*Recon/);
    expect(appSource).toMatch(/@media \(max-width: 720px\)[\s\S]*\.app-stats[\s\S]*display: none/);
  });
});
