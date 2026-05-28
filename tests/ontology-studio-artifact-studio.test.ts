/**
 * Track G G-studio-lot2 — studio serves the graph.html artifact in studio
 * mode when asked. The studio CSS (`body.studio-mode ...`) already ships in
 * every export; the server flips the body class to `studio-mode` when the
 * artifact is requested with `?studio=1`, so the embedded canvas claims the
 * full center and shows only the legend.
 *
 * The route wiring (`?studio=1` -> graphHtmlArtifactResult(context, true)) is
 * a one-liner exercised by lint/build; the load-bearing transform is the
 * pure `injectStudioMode` helper tested directly here.
 */
import { describe, expect, it } from "vitest";

import { injectStudioMode } from "../src/ontology-studio.js";

describe("Track G G-studio-lot2 — injectStudioMode", () => {
  it("adds the studio-mode class to a bare <body>", () => {
    const html = "<!DOCTYPE html><html><head></head><body>\n<div id=\"graph\"></div>\n</body></html>";
    const out = injectStudioMode(html);
    expect(out).toMatch(/<body[^>]*class="studio-mode"/);
  });

  it("appends studio-mode to an existing class list, preserving other attributes", () => {
    const html = '<body lang="en" class="theme-dark"><div id="graph"></div></body>';
    const out = injectStudioMode(html);
    expect(out).toMatch(/<body[^>]*class="theme-dark studio-mode"/);
    expect(out).toContain('lang="en"');
  });

  it("is idempotent when the body is already studio-mode", () => {
    const html = '<body class="studio-mode"><div id="graph"></div></body>';
    expect(injectStudioMode(html)).toBe(html);
  });

  it("does not touch markup with no <body> tag", () => {
    const html = "<div id=\"graph\"></div>";
    expect(injectStudioMode(html)).toBe(html);
  });
});
