// @sentropic/engram-live/attributes — attribute checks before any content read
// (spec/SPEC_LIVE_GIT_INDEXING.md §7; plan/09 L4a).
//
// Relevant filter/diff attributes are evaluated by git itself through
// `check-attr -z --stdin` in NUL framing (lossless for unusual path bytes),
// separately for the worktree context (working-tree .gitattributes files)
// and the index context (.gitattributes blobs as staged in this worktree's
// index, via an isolated empty GIT_DIR/GIT_WORK_TREE run). Filtered and
// protected paths are excluded in either context before any conversion-
// capable read; changed attribute fingerprints invalidate the capture.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SafeGitExecutor } from "./git-executor.js";
import { createHash } from "node:crypto";
import { splitNulBytes, toPathBytes, toPathKey, type PathBytes } from "./filesystem.js";

export interface PathAttributes {
  readonly filter: string;
  readonly diff: string;
}

export const ATTR_UNSPECIFIED = "unspecified";
export const ATTR_UNSET = "unset";
export const ATTR_SET = "set";

/** A conversion-capable clean/smudge/process driver is attached. */
export function isFiltered(attributes: PathAttributes): boolean {
  return attributes.filter !== ATTR_UNSPECIFIED && attributes.filter !== ATTR_UNSET;
}

/** A textconv/external-diff driver may apply at diff time (raw reads stay raw). */
export function hasTextconvDriver(attributes: PathAttributes): boolean {
  return attributes.diff !== ATTR_UNSPECIFIED && attributes.diff !== ATTR_UNSET;
}

export function defaultAttributes(): PathAttributes {
  return { filter: ATTR_UNSPECIFIED, diff: ATTR_UNSPECIFIED };
}

export function sameAttributes(left: PathAttributes, right: PathAttributes): boolean {
  return left.filter === right.filter && left.diff === right.diff;
}

function checkAttrInput(paths: readonly PathBytes[]): Buffer {
  return Buffer.concat(paths.map((path) => Buffer.concat([toPathBytes(path), Buffer.from([0])])));
}

/** Parse `check-attr -z` output: path\0 attr\0 value\0 triples, keeping
 * paths as raw bytes (latin1 keys are a bijective byte mapping). */
export function parseCheckAttrZ(output: Buffer, paths: readonly PathBytes[]): Map<string, PathAttributes> {
  const found = new Map<string, { filter?: string; diff?: string }>();
  const parts = splitNulBytes(output).map((part) => part.toString("latin1"));
  for (let index = 0; index + 2 < parts.length; index += 3) {
    const path = parts[index] as string;
    const attr = parts[index + 1] as string;
    const value = parts[index + 2] as string;
    if (attr !== "filter" && attr !== "diff") continue;
    const entry = found.get(path) ?? {};
    entry[attr] = value;
    found.set(path, entry);
  }
  const result = new Map<string, PathAttributes>();
  for (const path of paths) {
    const key = toPathKey(toPathBytes(path));
    const entry = found.get(key) ?? {};
    result.set(key, {
      filter: entry.filter ?? ATTR_UNSPECIFIED,
      diff: entry.diff ?? ATTR_UNSPECIFIED,
    });
  }
  return result;
}

/** Worktree context: attributes exactly as the working tree declares them. */
export function readAttributes(
  exec: SafeGitExecutor,
  cwd: string,
  paths: readonly PathBytes[],
): Map<string, PathAttributes> {
  if (paths.length === 0) return new Map();
  const output = exec.run(cwd, ["check-attr", "-z", "filter", "diff", "--stdin"], checkAttrInput(paths));
  return parseCheckAttrZ(output, paths);
}

/** Index context: with an empty scratch worktree, git falls back to the
 * .gitattributes blobs staged in the index of GIT_DIR — the attributes that
 * would gate staged content — without ever reading the working-tree files. */
export function readAttributesIndex(
  exec: SafeGitExecutor,
  gitDir: string,
  paths: readonly PathBytes[],
): Map<string, PathAttributes> {
  if (paths.length === 0) return new Map();
  const scratch = mkdtempSync(join(tmpdir(), "engram-live-attr-"));
  try {
    const output = exec.run(
      scratch,
      ["check-attr", "-z", "filter", "diff", "--stdin"],
      checkAttrInput(paths),
      { GIT_DIR: gitDir, GIT_WORK_TREE: scratch },
    );
    return parseCheckAttrZ(output, paths);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Canonical fingerprint over one or more attribute contexts; any change in
 * any context invalidates the capture. */
export function fingerprintAttributes(...contexts: ReadonlyMap<string, PathAttributes>[]): string {
  const hash = createHash("sha256");
  for (const context of contexts) {
    for (const key of [...context.keys()].sort()) {
      const entry = context.get(key) as PathAttributes;
      hash.update(key).update("\0").update(entry.filter).update("\0").update(entry.diff).update("\0");
    }
    hash.update("\0context\0");
  }
  return hash.digest("hex");
}
