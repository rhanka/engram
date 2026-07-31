import { describe, expect, it } from "vitest";
import {
  RAIL_INDENT,
  cumulativeIndentRem,
  indentStepCss,
  indentStepRem,
} from "../lib/railIndent.js";

/**
 * ADAPTIVE rail indentation. The rail is ~306px and the ontology tree now nests
 * the registry forests, so a row can sit 7+ levels deep. A constant step either
 * wastes the rail at level 1 or clips the label + badges by level 6. These lock
 * the two guarantees the scheme makes: a step that SHRINKS with depth, and a
 * cumulative indent that is BOUNDED whatever the depth.
 */
describe("railIndent — the step decays with the row's rendered depth", () => {
  it("is strictly non-increasing level after level", () => {
    let previous = Infinity;
    for (let depth = 0; depth < 12; depth += 1) {
      const step = indentStepRem(depth);
      expect(step).toBeLessThanOrEqual(previous);
      previous = step;
    }
  });

  it("actually shrinks over the depths the process-std-shaped tree reaches", () => {
    // Not merely "non-increasing": a deep row must cost visibly less than a
    // shallow one, otherwise the rail is eaten before the leaves are reached.
    expect(indentStepRem(5)).toBeLessThan(indentStepRem(0) / 2);
  });

  it("starts at the base step for a root row's children", () => {
    expect(indentStepRem(0)).toBeCloseTo(RAIL_INDENT.base, 6);
    expect(cumulativeIndentRem(0)).toBe(0);
  });

  it("never lets a step fall below the readable floor while budget remains", () => {
    // A step of 0 would flatten the tree into an ambiguous list.
    for (let depth = 0; depth < 6; depth += 1) {
      expect(indentStepRem(depth)).toBeGreaterThanOrEqual(RAIL_INDENT.min);
    }
  });
});

describe("railIndent — the TOTAL indent is bounded (the rail can never be eaten)", () => {
  it("caps the cumulative indent at the budget for ANY depth", () => {
    for (const depth of [0, 1, 5, 12, 40, 500]) {
      expect(cumulativeIndentRem(depth)).toBeLessThanOrEqual(RAIL_INDENT.budget);
    }
  });

  it("keeps a deep row's total indent a small fraction of a 306px rail", () => {
    // 2.6rem ≈ 42px at the 16px root font — ~14% of the rail, so the label and
    // its L-level / child-count badges keep the rest.
    expect(cumulativeIndentRem(8) * 16).toBeLessThan(306 * 0.2);
  });

  it("stops stepping once the budget is spent", () => {
    const deep = 200;
    expect(cumulativeIndentRem(deep)).toBe(RAIL_INDENT.budget);
    expect(indentStepRem(deep)).toBe(0);
  });

  it("is monotone: a deeper row is never indented LESS than a shallower one", () => {
    let previous = -1;
    for (let depth = 0; depth < 30; depth += 1) {
      const total = cumulativeIndentRem(depth);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });
});

describe("railIndent — CSS emission + defensive inputs", () => {
  it("emits a rounded rem length", () => {
    expect(indentStepCss(0)).toBe("0.7rem");
    expect(indentStepCss(1)).toMatch(/^\d+(\.\d+)?rem$/);
  });

  it("treats a negative / NaN / missing depth as the root", () => {
    for (const bad of [-3, Number.NaN, undefined, null, "nope"]) {
      expect(indentStepRem(bad)).toBeCloseTo(RAIL_INDENT.base, 6);
      expect(cumulativeIndentRem(bad)).toBe(0);
    }
  });

  it("honours a caller-supplied ladder (nothing is hardcoded to one tree)", () => {
    const tight = { base: 0.4, decay: 0.5, min: 0.05, budget: 0.7 };
    expect(indentStepRem(0, tight)).toBeCloseTo(0.4, 6);
    expect(cumulativeIndentRem(10, tight)).toBeLessThanOrEqual(0.7);
  });
});
