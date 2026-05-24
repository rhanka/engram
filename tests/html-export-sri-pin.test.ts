import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toHtml } from "../src/export.js";

/**
 * Port of upstream `tests/test_security_html.py` SRI assertions
 * (safishamsi/graphify b6127aa, PR #956).
 *
 * The vis-network CDN script tag emitted by `toHtml` must:
 *   - pin a versioned URL (vis-network@<exact-version>)
 *   - carry an `integrity="sha384-..."` Subresource Integrity hash
 *   - carry `crossorigin="anonymous"`
 * Without those, a compromised CDN response could inject arbitrary JS into
 * every rendered graph viewer.
 */
describe("toHtml vis-network CDN SRI pin", () => {
  function renderGraphHtml(): string {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-sri-"));
    try {
      const htmlPath = join(dir, "graph.html");
      const G = new Graph();
      G.addNode("a", { label: "A", file_type: "code", source_file: "src/a.ts" });
      G.addNode("b", { label: "B", file_type: "code", source_file: "src/b.ts" });
      G.addEdge("a", "b", { relation: "calls", confidence: "EXTRACTED" });
      const communities = new Map([[0, ["a", "b"]]]);
      toHtml(G, communities, htmlPath);
      return readFileSync(htmlPath, "utf-8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("pins the vis-network script tag to a versioned URL (no floating @latest)", () => {
    const html = renderGraphHtml();
    // Must NOT load unversioned vis-network (the old behaviour)
    expect(html).not.toMatch(/vis-network\/standalone\/umd\/vis-network\.min\.js"/);
    // Must include the explicit version in the URL
    expect(html).toMatch(/vis-network@9\.1\.6/);
  });

  it("includes integrity='sha384-...' on the vis-network script tag", () => {
    const html = renderGraphHtml();
    // Match the upstream-pinned hash exactly
    expect(html).toContain(
      'integrity="sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"',
    );
  });

  it("includes crossorigin='anonymous' on the vis-network script tag", () => {
    const html = renderGraphHtml();
    expect(html).toContain('crossorigin="anonymous"');
  });

  it("places integrity + crossorigin on the vis-network <script> (not on an unrelated tag)", () => {
    const html = renderGraphHtml();
    // The script tag itself must carry both attributes; assert via a single regex.
    const scriptTagRegex =
      /<script[^>]*src="[^"]*vis-network@9\.1\.6[^"]*"[^>]*integrity="sha384-[^"]+"[^>]*crossorigin="anonymous"[^>]*>/;
    const altOrderRegex =
      /<script[^>]*src="[^"]*vis-network@9\.1\.6[^"]*"[^>]*crossorigin="anonymous"[^>]*integrity="sha384-[^"]+"[^>]*>/;
    expect(
      scriptTagRegex.test(html) || altOrderRegex.test(html),
    ).toBe(true);
  });
});
