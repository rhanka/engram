import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A raw NUL byte in a tracked text source is a tooling hazard, not a style nit.
 *
 * 1. `grep`/`rg` classify a NUL-bearing file as binary and report NO match — the
 *    local `grep` is ugrep 7.5.0, which prints nothing at all (not even the GNU
 *    "binary file matches" notice) and exits 1. Every "not found in <file>"
 *    conclusion drawn over such a file is a silent false negative. This has
 *    already produced two wrong readings in this repo.
 * 2. If the NUL falls in the first 8000 bytes, git's own binary sniff trips too:
 *    diffs degrade to "Bin N -> M bytes" and 3-way merge stops working, so any
 *    concurrent edit becomes an all-or-nothing conflict.
 *
 * The fix is always behaviour-identical: write the escape `\\u0000` instead of
 * the raw byte. Both denote the same single UTF-16 code unit at runtime.
 *
 * Note on how these get introduced: an agent tool whose parameters are JSON will
 * decode a `\\u0000` in a string payload into a real NUL before it ever reaches
 * disk. Writing the escape requires doubling the backslash at the call site.
 */

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".sh",
  ".txt",
]);

const repoRoot = resolve(__dirname, "..");

function trackedTextSources(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => {
      const dot = p.lastIndexOf(".");
      return dot !== -1 && TEXT_EXTENSIONS.has(p.slice(dot));
    });
}

describe("tracked text sources carry no raw NUL byte", () => {
  it("finds no raw NUL in any tracked text source", () => {
    const offenders: string[] = [];

    for (const relative of trackedTextSources()) {
      const absolute = join(repoRoot, relative);
      try {
        if (!statSync(absolute).isFile()) continue;
      } catch {
        continue; // tracked but absent in this checkout
      }
      const buffer = readFileSync(absolute);
      const offset = buffer.indexOf(0);
      if (offset === -1) continue;

      const count = buffer.reduce((n, byte) => (byte === 0 ? n + 1 : n), 0);
      const breaksGitMerge = offset < 8000;
      offenders.push(
        `${relative}: ${count} raw NUL byte(s), first at offset ${offset}` +
          (breaksGitMerge
            ? " — WITHIN git's 8000-byte sniff window, so 3-way merge is broken too"
            : " — outside git's sniff window, but grep still lies about this file"),
      );
    }

    expect(offenders, `write \\u0000 instead of the raw byte:\n${offenders.join("\n")}`).toEqual([]);
  });
});
