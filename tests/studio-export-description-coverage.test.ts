/**
 * Low-description-coverage hint (field report ia-aero).
 *
 * A French 1-PDF graph produced entities.json with 620/620 null descriptions
 * SILENTLY. A ~0%-description graph almost always means the description pass
 * never ran, so the static studio export now emits a non-fatal warning pointing
 * the user to `graphify describe` — and the provisional rationale fallback does
 * NOT count toward real coverage, so the signal survives even when the studio
 * looks populated.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildStaticStudio,
  lowDescriptionCoverageWarning,
} from "../src/studio-export.js";
import { __resetGraphDescriptionCache } from "../src/studio-assets.js";

describe("lowDescriptionCoverageWarning (pure threshold)", () => {
  it("warns at 0% coverage and points to graphify describe", () => {
    const msg = lowDescriptionCoverageWarning({ total: 620, described: 0, provisional: 0 });
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/0\/620/);
    expect(msg).toMatch(/graphify describe/);
  });

  it("mentions provisional rationale fills when present (both signals surfaced)", () => {
    const msg = lowDescriptionCoverageWarning({ total: 620, described: 0, provisional: 596 });
    expect(msg).not.toBeNull();
    // The fallback filled it AND describe is still recommended.
    expect(msg).toMatch(/596 node\(s\) were filled provisionally/);
    expect(msg).toMatch(/graphify describe/);
  });

  it("is silent on healthy coverage", () => {
    expect(lowDescriptionCoverageWarning({ total: 100, described: 80, provisional: 0 })).toBeNull();
  });

  it("is silent on an empty graph (no nodes -> no signal)", () => {
    expect(lowDescriptionCoverageWarning({ total: 0, described: 0, provisional: 0 })).toBeNull();
  });

  it("fires just below the low threshold but not at a healthy ratio", () => {
    // 1/100 = 1% < 2% threshold -> warn.
    expect(lowDescriptionCoverageWarning({ total: 100, described: 1, provisional: 0 })).not.toBeNull();
    // 3/100 = 3% > 2% threshold -> healthy enough, no warn.
    expect(lowDescriptionCoverageWarning({ total: 100, described: 3, provisional: 0 })).toBeNull();
  });
});

describe("buildStaticStudio description-coverage integration", () => {
  const dirs: string[] = [];
  afterEach(() => {
    __resetGraphDescriptionCache();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function makeFixture(nodes: Array<Record<string, unknown>>): { stateDir: string; spaDir: string } {
    const stateDir = mkdtempSync(join(tmpdir(), "graphify-cov-state-"));
    dirs.push(stateDir);
    writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes, links: [] }));
    const spaDir = mkdtempSync(join(tmpdir(), "graphify-cov-spa-"));
    dirs.push(spaDir);
    writeFileSync(join(spaDir, "index.html"), "<html></html>");
    return { stateDir, spaDir };
  }

  it("warns + reports 0 real coverage when no node has a description (the ia-aero footgun)", () => {
    // Every node carries only a rationale (the field-report shape): 0 real
    // descriptions, all provisional.
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      rationale: `Justification ${i}.`,
    }));
    const { stateDir, spaDir } = makeFixture(nodes);
    const warnings: string[] = [];
    const result = buildStaticStudio({
      stateDir,
      outDir: join(stateDir, "studio"),
      spaDir,
      onWarning: (m) => warnings.push(m),
    });
    expect(result.descriptionCoverage).toEqual({ total: 10, described: 0, provisional: 10 });
    const hint = warnings.find((m) => /graphify describe/.test(m));
    expect(hint).toBeDefined();
    expect(hint).toMatch(/10 node\(s\) were filled provisionally/);
  });

  it("does NOT warn when every node has a real description", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      description: `A real description ${i}.`,
    }));
    const { stateDir, spaDir } = makeFixture(nodes);
    const warnings: string[] = [];
    const result = buildStaticStudio({
      stateDir,
      outDir: join(stateDir, "studio"),
      spaDir,
      onWarning: (m) => warnings.push(m),
    });
    expect(result.descriptionCoverage).toEqual({ total: 10, described: 10, provisional: 0 });
    expect(warnings.find((m) => /graphify describe/.test(m))).toBeUndefined();
  });
});
