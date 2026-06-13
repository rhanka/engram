/**
 * Unit tests for the CLI citation-flag plumbing:
 *   - `parseCitationCapFlag` / `parseTopKFlag` (flag string → typed value)
 *   - `resolveCitationPolicyForRoot` (reads `.graphify_detect.json`, applies
 *     the corpus-type default, then the CLI flag override).
 *
 * These exercise the resolution layer the describe/label/extract/update/watch
 * actions call; the precedence itself is covered in citation-policy.test.ts.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseCitationCapFlag,
  parseTopKFlag,
  resolveCitationPolicyForRoot,
} from "../src/cli.js";

const cleanupDirs: string[] = [];
function projectWithDetect(
  detect: Record<string, unknown> | null,
): string {
  const root = join(tmpdir(), `graphify-cit-flags-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  cleanupDirs.push(root);
  mkdirSync(join(root, ".graphify"), { recursive: true });
  if (detect) {
    writeFileSync(join(root, ".graphify", ".graphify_detect.json"), JSON.stringify(detect), "utf-8");
  }
  return root;
}
function buckets(b: Partial<Record<string, number>>, totalWords = 0) {
  const files: Record<string, string[]> = { code: [], document: [], paper: [], image: [], video: [] };
  for (const [k, n] of Object.entries(b)) files[k] = Array.from({ length: n ?? 0 }, (_v, i) => `${k}/${i}`);
  return { files, total_words: totalWords, total_files: Object.values(files).reduce((s, v) => s + v.length, 0) };
}

afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

describe("parseCitationCapFlag", () => {
  it("parses a numeric cap", () => {
    expect(parseCitationCapFlag("5")).toBe(5);
  });
  it("parses 'all' (case-insensitive)", () => {
    expect(parseCitationCapFlag("all")).toBe("all");
    expect(parseCitationCapFlag("ALL")).toBe("all");
  });
  it("returns undefined for empty / missing / invalid", () => {
    expect(parseCitationCapFlag(undefined)).toBeUndefined();
    expect(parseCitationCapFlag("")).toBeUndefined();
    expect(parseCitationCapFlag("abc")).toBeUndefined();
    expect(parseCitationCapFlag("-3")).toBeUndefined();
  });
});

describe("parseTopKFlag", () => {
  it("parses a positive integer", () => {
    expect(parseTopKFlag("12")).toBe(12);
  });
  it("returns undefined for non-positive / invalid / missing", () => {
    expect(parseTopKFlag(undefined)).toBeUndefined();
    expect(parseTopKFlag("0")).toBeUndefined();
    expect(parseTopKFlag("-1")).toBeUndefined();
    expect(parseTopKFlag("x")).toBeUndefined();
  });
});

describe("resolveCitationPolicyForRoot", () => {
  it("uses the corpus-type default from .graphify_detect.json (code → cap 3, K 3)", () => {
    const root = projectWithDetect(buckets({ code: 30 }, 9_000));
    const p = resolveCitationPolicyForRoot(root, {});
    expect(p.describeCap).toBe(3);
    expect(p.inlineTopK).toBe(3);
  });

  it("uses long-document default for a large prose corpus (cap 'all', K 8)", () => {
    const root = projectWithDetect(buckets({ document: 10 }, 120_000));
    const p = resolveCitationPolicyForRoot(root, {});
    expect(p.describeCap).toBe("all");
    expect(p.inlineTopK).toBe(8);
  });

  it("CLI flags override the corpus-type default", () => {
    const root = projectWithDetect(buckets({ code: 30 }, 9_000)); // code → cap 3 / K 3
    const p = resolveCitationPolicyForRoot(root, { describeCapFlag: "all", topKFlag: 6 });
    expect(p.describeCap).toBe("all");
    expect(p.inlineTopK).toBe(6);
  });

  it("falls back to the global default when no detect file is present", () => {
    const root = projectWithDetect(null);
    const p = resolveCitationPolicyForRoot(root, {});
    expect(p.describeCap).toBe(10);
    expect(p.inlineTopK).toBe(8);
  });

  it("profileMode forces entity-corpus (cap 'all') regardless of buckets", () => {
    const root = projectWithDetect(buckets({ document: 2 }, 2_000));
    const p = resolveCitationPolicyForRoot(root, { profileMode: true });
    expect(p.describeCap).toBe("all");
  });
});
