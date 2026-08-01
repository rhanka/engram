import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A raw NUL byte in a tracked source is a tooling hazard, not a style nit.
 *
 * 1. `grep` reports NO match on a NUL-bearing file. The cause is not ugrep
 *    itself: `grep` is a shell function that calls ugrep with a fixed flag set
 *    including `-I` (skip binary files). Bare `command grep -c` finds the
 *    matches; adding `-I` alone drops them and exits 1. Every "not found in
 *    <file>" conclusion drawn over such a file is a silent false negative, and
 *    `-r` is the worst case: it skips the file without a word. This has already
 *    produced two wrong readings in this repo.
 * 2. If the NUL falls in the first 8000 bytes, git's own binary sniff trips too:
 *    diffs degrade to "Binary files differ" and 3-way merge stops working, so
 *    any concurrent edit becomes an all-or-nothing conflict.
 *
 * The fix is always behaviour-identical: write the JS escape (backslash-u-0000)
 * instead of the raw byte. Both denote the same single UTF-16 code unit.
 *
 * Note on how these get introduced: an agent tool whose parameters are JSON will
 * decode an escaped NUL in a string payload into a real byte before it ever
 * reaches disk, and the harness edit tool round-trips a raw NUL as a space, so
 * hand-editing such a line silently reverts it. Fix them with a byte-level
 * codemod and review the diff.
 *
 * SCOPE — fail-closed, by denylist. An earlier revision of this gate used an
 * allowlist of 14 text extensions, which silently excluded 64 tracked files: 16
 * `.py`, 14 `.svelte` (the studio's primary component format), plus `.jsonl`,
 * `.csv`, `.toml` and the whole extractor-fixture tail (`.c`, `.go`, `.java`,
 * `.rb`, `.rs`, `.kt`, ...). A gate that names itself after "sources" while
 * checking a subset is believed where it does not look. Inverted: everything
 * tracked is scanned unless its extension is DECLARED binary below, so a new
 * source format is covered the day it lands, without editing this file.
 */

/**
 * Extensions whose files are legitimately byte-oriented. Adding one here is a
 * deliberate decision to stop scanning that format — never a way to silence a
 * finding in a text file.
 */
const BINARY_EXTENSIONS = new Set([
  // raster images (.svg is XML and stays scanned)
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tif", ".tiff", ".avif", ".svgz",
  // fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  // archives + compressed
  ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".zst",
  // media
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".mov", ".avi",
  // compiled / opaque binaries
  ".wasm", ".node", ".so", ".dylib", ".dll", ".exe", ".bin", ".pdf", ".class", ".pyc",
  // packfile internals, occasionally tracked
  ".pack", ".idx",
]);

const repoRoot = resolve(__dirname, "..");

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((p) => p.length > 0);
}

/** Extension of the BASENAME, so a dotfile like `.gitignore` is scanned, not skipped. */
function extensionOf(relative: string): string {
  const base = relative.slice(relative.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

function scannedFiles(): string[] {
  return trackedFiles().filter((p) => !BINARY_EXTENSIONS.has(extensionOf(p)));
}

describe("no tracked file carries a raw NUL byte, except declared binary formats", () => {
  it("finds no raw NUL outside the declared binary formats", () => {
    const offenders: string[] = [];

    for (const relative of scannedFiles()) {
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
      offenders.push(
        `${relative}: ${count} raw NUL byte(s), first at offset ${offset}` +
          (offset < 8000
            ? " — WITHIN git's 8000-byte sniff window, so 3-way merge is broken too"
            : " — outside git's sniff window, but grep still lies about this file"),
      );
    }

    expect(
      offenders,
      "Write the JS escape (backslash-u-0000) instead of the raw byte. If the file is " +
        "genuinely a binary format, add its extension to BINARY_EXTENSIONS above — " +
        "deliberately, and never to silence a finding in a text file.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("keeps the formats the previous allowlist silently skipped inside its scope", () => {
    // Regression guard for finding F4: if a future edit narrows the scope back to
    // an allowlist, these real tracked formats fall out and this fails.
    const scanned = scannedFiles();
    for (const ext of [".svelte", ".py"]) {
      expect(
        scanned.some((p) => p.endsWith(ext)),
        `${ext} files must stay inside the gate's scope`,
      ).toBe(true);
    }
  });
});
