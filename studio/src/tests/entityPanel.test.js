import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The right-hand entity panel renders the per-node description. The description
 * is sourced from the entity sidecar (`entity.description`), which now carries
 * the graph.json `node.description` (WP11) as a { status: "generated",
 * description } record (see src/studio-assets.ts buildEntitySidecar). This test
 * pins the panel's derivation + render so the node description keeps reaching
 * the UI. Source-string assertions match the studio's existing component-test
 * style (see appHeader.test.js).
 */
const panelSource = readFileSync(
  resolve(process.cwd(), "src/components/EntityPanel.svelte"),
  "utf8",
);

describe("EntityPanel description", () => {
  it("derives the description from the entity sidecar (entity.description)", () => {
    // Reads the sidecar produced by buildEntitySidecar, which surfaces
    // graph.json node.description as a generated entry.
    expect(panelSource).toMatch(/const sidecar = entity\?\.description;/);
    expect(panelSource).toMatch(/sidecar\.status === "generated"/);
    expect(panelSource).toMatch(/typeof sidecar\.description === "string"/);
    expect(panelSource).toMatch(/return sidecar\.description\.trim\(\);/);
  });

  it("renders the description text in a Description section when present", () => {
    expect(panelSource).toMatch(/{#if description}/);
    expect(panelSource).toMatch(/<h3 class="entity-section-heading">Description<\/h3>/);
    expect(panelSource).toMatch(
      /<div class="entity-description">\{@html renderInlineMarkdown\(description\)\}<\/div>/,
    );
  });

  it("keeps the description readable (small, wrapped) via .entity-description", () => {
    // Small font + line-height for a one-sentence node description.
    expect(panelSource).toMatch(/\.entity-description\s*{[\s\S]*line-height:\s*1\.5;[\s\S]*}/);
    expect(panelSource).toMatch(/\.entity-description\s*{[\s\S]*font-size:\s*0\.9rem;[\s\S]*}/);
  });
});

describe("EntityPanel citations (exhaustive-citations Level-1/Level-2)", () => {
  it("Citations header count reads node.citation_count (true count), not the inline sum", () => {
    // A hub reads "Citations (214)" immediately from the Level-1 true count;
    // only old graphs (no citation_count) fall back to the inline length.
    expect(panelSource).toMatch(/node\.citation_count/);
    expect(panelSource).toMatch(/typeof node\.citation_count === "number"/);
    // The count is fed to the Citations disclosure (DS Collapsible) via the
    // trailing circle Badge. The custom Accordion was replaced by DS Collapsible
    // in the P3 migration; the true count still reaches the header. §S.6.1: the
    // accordion stays collapsed by default and OPENS when the cited-source
    // viewer focuses one of this entity's citations.
    expect(panelSource).toMatch(/<Collapsible title="Citations" open=\{focusCitationIndex >= 0\}>/);
    expect(panelSource).toMatch(
      /<Badge shape="circle" size="sm" tone="neutral">\{citationTotal\}<\/Badge>/,
    );
  });

  it("renders the inline K-set instantly, then upgrades to the sidecar's full list", () => {
    // Inline node.citations (K-set) renders before the fetch resolves; when the
    // lazy sidecar arrives with citations.citations, the full list replaces it.
    expect(panelSource).toMatch(/citationsByFileFrom/);
    expect(panelSource).toMatch(/entity\?\.citations\?\.citations/);
    // The full list is preferred over the inline node citations when present.
    expect(panelSource).toMatch(/Array\.isArray\(entity\?\.citations\?\.citations\)/);
  });

  it("imports citationsByFileFrom for the lazy upgrade", () => {
    expect(panelSource).toMatch(/citationsByFileFrom/);
  });
});

describe("EntityPanel viewer→panel sync (§S.6.1 selection-scope navigation)", () => {
  it("resolves focusCitation to a passage index — identity first, loose fields fallback", () => {
    expect(panelSource).toMatch(/focusCitation = null,/);
    expect(panelSource).toMatch(/sourceCitations\.indexOf\(focusCitation\)/);
    expect(panelSource).toMatch(/citationLooksSame\(c, focusCitation\)/);
  });

  it("highlights + tags the current passage and opens its file accordion", () => {
    expect(panelSource).toMatch(/entity-cite-passage--current=\{p\.index === focusCitationIndex\}/);
    expect(panelSource).toMatch(/data-cite-current=\{p\.index === focusCitationIndex \? "true" : undefined\}/);
    expect(panelSource).toMatch(/open=\{cf\.passages\.some\(\(p\) => p\.index === focusCitationIndex\)\}/);
  });

  it("hands the entity id to the open-source payload (thread aiming)", () => {
    expect(panelSource).toMatch(/entityId: node\?\.id \?\? focusId \?\? null,/);
  });

  it("scrolls the current passage into view (guarded for jsdom)", () => {
    expect(panelSource).toMatch(/data-cite-current='true'/);
    expect(panelSource).toMatch(/typeof el\.scrollIntoView === "function"/);
  });
});
