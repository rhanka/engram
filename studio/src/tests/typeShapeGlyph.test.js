import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shapeSvgPath } from "@sentropic/graph";
import { shapeForType, variantForType } from "../lib/graphAdapter.js";

const glyphSource = readFileSync(
  resolve(process.cwd(), "src/components/TypeShapeGlyph.svelte"),
  "utf8",
);
const railSource = readFileSync(resolve(process.cwd(), "src/components/LeftRail.svelte"), "utf8");

describe("TypeShapeGlyph (left-rail type swatches)", () => {
  it("derives the glyph from the renderer pipeline, not a hand-drawn shape", () => {
    // type -> shapeForType (the SAME mapping buildScene puts on scene nodes)
    expect(glyphSource).toMatch(
      /import \{ shapeForType, variantForType \} from "\.\.\/lib\/graphAdapter\.js"/,
    );
    expect(glyphSource).toMatch(/shapeForType\(\{ type \}\)/);
    // shape -> shapeSvgPath (the SAME vertex math drawNodeShapePath draws)
    expect(glyphSource).toMatch(/import \{ shapeSvgPath \} from "@sentropic\/graph"/);
    expect(glyphSource).toMatch(/shapeSvgPath\(shape,/);
    // No hand-drawn CSS shapes (the old legend's clip-path triangle drifted).
    expect(glyphSource).not.toMatch(/clip-path/);
    expect(glyphSource).not.toMatch(/border-left|border-bottom/);
  });

  it("renders box-category types hollow with a border, like the canvas box glyph", () => {
    expect(glyphSource).toMatch(/isBoxShape\(shape\)/);
    expect(glyphSource).toMatch(/class:hollow/);
  });

  it("reflects the fill / border variants from the renderer's TYPE_VARIANT map", () => {
    // Same source as the canvas: variantForType drives hollow + bold classes.
    expect(glyphSource).toMatch(/variantForType\(\{ type \}\)/);
    expect(glyphSource).toMatch(/variant\.fill === "hollow"/);
    expect(glyphSource).toMatch(/variant\.border === "bold"/);
    expect(glyphSource).toMatch(/class:bold/);
    // The map disambiguates types sharing a shape.
    expect(variantForType({ type: "Character" })).toEqual({});
    expect(variantForType({ type: "Alias" })).toEqual({ fill: "hollow" });
    expect(variantForType({ type: "Author" })).toEqual({ border: "bold" });
    expect(variantForType({ type: "Work" })).toEqual({ fill: "hollow", border: "bold" });
    expect(variantForType({ type: "Object" })).toEqual({ fill: "hollow" });
  });

  it("LeftRail shows the glyph in the DS SelectableRow leading slot, left of the type label", () => {
    expect(railSource).toMatch(/import TypeShapeGlyph from "\.\/TypeShapeGlyph\.svelte"/);
    // DS slots: the glyph lives in the `leading` slot (rendered left of content)
    // and the type label is the row's default content. Both the taxonomy accordion
    // and the flat fallback render the Type SelectableRow with its FILTER wiring
    // (value/selected/onselect) — so the opening tag is multi-line — followed by
    // the glyph-in-leading-slot pattern.
    expect(railSource).toMatch(
      /<SelectableRow[\s\S]*?value=\{t\.key\}[\s\S]*?>\s*\{#snippet leading\(\)}\s*<TypeShapeGlyph type=\{t\.key\} \/>\s*\{\/snippet}\s*\{t\.key\}/,
    );
  });

  it("shapeForType + shapeSvgPath resolve every ontology type to a drawable path", () => {
    const types = [
      "Character", "Alias", "DisguisePersona", "NarrativeRole", "Location",
      "Organization", "Evidence", "Object", "ForensicMethod", "Work",
      "ChapterOrStory", "Saga", "Author", "Translator", "CrimeOrScheme",
      "Case", "Fact", "Motive", "Event",
    ];
    for (const type of types) {
      const shape = shapeForType({ type });
      const path = shapeSvgPath(shape, 6);
      expect(path.startsWith("M ")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
    }
    // Spot-check the canvas parity of a known mapping: Character is a diamond.
    expect(shapeSvgPath(shapeForType({ type: "Character" }), 5)).toBe(
      "M 0 -5 L 5 0 L 0 5 L -5 0 Z",
    );
  });
});
