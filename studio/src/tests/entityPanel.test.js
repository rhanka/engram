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
