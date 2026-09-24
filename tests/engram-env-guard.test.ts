import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guard for the src/env.ts contract ("All `GRAPHIFY_*` reads in `src/` must
// go through this module"). A direct legacy read bypasses the Engram-first
// precedence and the one-time deprecation warning, so it must fail here.
//
// What the pattern matches: a literal `GRAPHIFY_*` name reached through an
// environment-object accessor — `process.env.GRAPHIFY_X`,
// `process.env?.GRAPHIFY_X`, `process.env["GRAPHIFY_X"]` (either quote),
// and the same three shapes on a bare `env` map (the injected
// `deps.env`/`NodeJS.ProcessEnv` parameter, including `env?.`).
//
// What it deliberately does NOT match (so sanctioned code stays green):
// - the `"GRAPHIFY_X"` string literals passed as the `legacyKey` argument to
//   `engramEnv`/`engramEnvNumber`/`engramEnvBoolean` (no `env.` accessor in
//   front — they are helper-mediated, not direct reads);
// - `process.env` truthiness guards (`process.env ? ... : ...`), dynamic
//   lookups (`process.env[key]`), or shell vars (`$GRAPHIFY_CMD`);
// - `*_GRAPHIFY_*` constants (`DEFAULT_GRAPHIFY_STATE_DIR`, ...), comments,
//   and help text naming the legacy key.
// The negative lookbehind keeps `myenv.GRAPHIFY_X`-style identifiers from
// matching; only a standalone `env` counts.
const DIRECT_LEGACY_ENV_READ =
  /(?:process\s*\.\s*env|(?<![A-Za-z0-9_$.])env)\s*(\?\.\s*|\.\s*|\[\s*["'])GRAPHIFY_[A-Z0-9_]*/;

const SRC_ROOT = "src";
const HELPER = "src/env.ts";
const SKIP_DIRS = new Set(["node_modules", "dist", "tests", ".git"]);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".test.ts"))
        out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("engram env helper stays the only GRAPHIFY_* reader", () => {
  const files = sourceFiles(SRC_ROOT).filter(
    (file) => file.replace(/\\/g, "/") !== HELPER,
  );

  it("scans a non-empty set of source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has no direct GRAPHIFY_* environment read outside src/env.ts", () => {
    const offenders = files.filter((file) =>
      DIRECT_LEGACY_ENV_READ.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("is not vacuous: src/env.ts still names GRAPHIFY_* keys", () => {
    // Guards a scan that silently matches nothing (bad root, bad pattern).
    expect(readFileSync(HELPER, "utf8")).toContain("GRAPHIFY_");
  });
});
