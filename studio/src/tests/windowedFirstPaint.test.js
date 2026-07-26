import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Storage LOT 3 — the App/LeftRail half of the windowed first paint.
 *
 * These are SOURCE assertions (the studio's convention for locking markup:
 * jsdom has no Canvas2D and mounting App pulls in GraphCanvas). They guard the
 * two properties that make the feature honest rather than merely fast:
 *   - first paint goes through the windowed loader, and
 *   - the rail never presents a bounded slice as if it were the whole corpus.
 */
const appSource = readFileSync(resolve(process.cwd(), "src/App.svelte"), "utf8");
const railSource = readFileSync(
  resolve(process.cwd(), "src/components/LeftRail.svelte"),
  "utf8",
);

describe("App wiring (windowed first paint)", () => {
  it("mounts through loadWorkspaceWindowed, not the bare loadWorkspace", () => {
    expect(appSource).toContain("loadWorkspaceWindowed");
    expect(appSource).toMatch(/import \{ loadWorkspaceWindowed \} from "\.\/lib\/sceneLoader\.js"/);
  });

  it("feeds the loader the window probe and the window scene adapter", () => {
    expect(appSource).toMatch(/loadWorkspaceWindowed\(\{[\s\S]*?fetchWindow,/);
    expect(appSource).toMatch(/buildWindowScene: \(win\) =>/);
  });

  it("paints the window by unlocking the template before the full load", () => {
    // `loaded = true` inside onFirstPaint is what removes the multi-MB wait.
    expect(appSource).toMatch(/onFirstPaint: \(windowScene\) => \{[\s\S]*?loaded = true;/);
    expect(appSource).toMatch(/onFirstPaint: \(windowScene\) => \{[\s\S]*?sceneData = windowScene;/);
  });

  it("derives a corpus total from the store aggregate and hands it to the rail", () => {
    expect(appSource).toMatch(/const corpusNodeCount = \$derived\(/);
    expect(appSource).toMatch(/<LeftRail[\s\S]*\{corpusNodeCount\}/);
  });
});

describe("LeftRail honest counters (visible vs corpus)", () => {
  it("keeps the existing badges for a normal, non-windowed scene", () => {
    expect(railSource).toMatch(/\{#if hasQuery\}\{entityTotal\} \/ \{totalNodeCount\} nodes/);
    expect(railSource).toMatch(/\{stats\.edgeCount\} edges/);
    expect(railSource).toMatch(/\{stats\.communityCount\} groups/);
  });

  it("adds a windowed badge that is gated on the scene being a slice", () => {
    expect(railSource).toMatch(/const windowed = \$derived\(stats\?\.windowed === true\)/);
    expect(railSource).toMatch(/\{#if windowed\}[\s\S]*?windowed · \{windowSummary\}/);
  });

  it("renders 'visible of corpus' when the corpus total is known", () => {
    expect(railSource).toMatch(/\$\{totalNodeCount\} of \$\{corpusTotal\} nodes/);
  });

  it("never invents a denominator when the corpus total is unknown", () => {
    expect(railSource).toMatch(/\$\{totalNodeCount\} nodes \(bounded slice\)/);
    // A null/0/NaN corpus must degrade, not render as a total.
    expect(railSource).toMatch(
      /Number\.isFinite\(corpusNodeCount\) && corpusNodeCount > 0 \? corpusNodeCount : null/,
    );
  });
});

/**
 * The corpus/window summary is a pure formula; lift it verbatim (the rail-render
 * convention) so the honest-counter arithmetic is tested, not just its markup.
 */
const windowSummary = (totalNodeCount, corpusNodeCount) => {
  const corpusTotal =
    Number.isFinite(corpusNodeCount) && corpusNodeCount > 0 ? corpusNodeCount : null;
  return corpusTotal
    ? `${totalNodeCount} of ${corpusTotal} nodes`
    : `${totalNodeCount} nodes (bounded slice)`;
};

describe("windowSummary formula", () => {
  it("states visible AND corpus — never the corpus alone", () => {
    // The exact complaint this feature answers: 2 000 drawn out of 50 086.
    expect(windowSummary(2000, 50086)).toBe("2000 of 50086 nodes");
  });

  it("degrades honestly with no corpus total", () => {
    expect(windowSummary(2000, null)).toBe("2000 nodes (bounded slice)");
    expect(windowSummary(2000, 0)).toBe("2000 nodes (bounded slice)");
    expect(windowSummary(2000, Number.NaN)).toBe("2000 nodes (bounded slice)");
  });
});
