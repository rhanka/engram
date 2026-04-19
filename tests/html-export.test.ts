import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
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
});
