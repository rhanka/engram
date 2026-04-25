import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toHtml } from "../src/export.js";
import { safeToHtml } from "../src/html-export.js";

describe("safeToHtml", () => {
  it("removes stale HTML and returns a warning when optional export fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-export-"));
    const htmlPath = join(dir, "graph.html");
    writeFileSync(htmlPath, "stale html", "utf-8");
    const warnings: string[] = [];

    const G = new Graph();
    G.addNode("a", { label: "A" });
    const communities = new Map([[0, ["a"]]]);

    const result = safeToHtml(G, communities, htmlPath, {}, {
      onWarning: (message) => warnings.push(message),
      writer: () => {
        throw new Error("too large");
      },
    });

    expect(result).toBeUndefined();
    expect(existsSync(htmlPath)).toBe(false);
    expect(warnings).toEqual(["HTML export skipped: too large"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("renders aggregated community member counts when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-export-"));
    const htmlPath = join(dir, "graph.html");

    const G = new Graph();
    G.addNode("a", { label: "A", source_file: "src/a.ts", file_type: "code" });
    const communities = new Map([[0, ["a"]]]);

    toHtml(G, communities, htmlPath, {
      communityLabels: new Map([[0, "Core"]]),
      memberCounts: new Map([[0, 7]]),
    });

    const html = readFileSync(htmlPath, "utf-8");
    expect(html).toContain("\"count\":7");

    rmSync(dir, { recursive: true, force: true });
  });
});
