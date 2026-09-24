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
//
// That accessor pattern cannot see a destructured read
// (`const { GRAPHIFY_X } = process.env`) or a read through an alias
// (`const e = env; e.GRAPHIFY_X`). BARE_LEGACY_IDENTIFIER closes that class:
// once comments and the contents of string and template literals are blanked
// out, any remaining `GRAPHIFY_*` token is code, not text — and outside
// src/env.ts no code may name a legacy key. The sanctioned
// `engramEnv("…", "GRAPHIFY_X")` arguments and generated shell text such as
// `$GRAPHIFY_CMD` live inside literals and are blanked; `*_GRAPHIFY_*`
// constants are excluded by the identifier boundaries.
const BARE_LEGACY_IDENTIFIER = /(?<![A-Za-z0-9_$])GRAPHIFY_[A-Z0-9_]*(?![A-Za-z0-9_$])/;

// Blanks // and /* */ comments and the contents of '…', "…" and `…` literals.
// ${…} substitutions inside template literals are kept as code, so an
// expression interpolated into a template is still scanned.
function codeOnly(source: string): string {
  let out = "";
  let i = 0;
  const templateDepth: number[] = [];
  let braceDepth = 0;
  const skipQuoted = (quote: string) => {
    i += 1;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === "\\") i += 1;
      else if (source[i] === "\n") out += "\n";
      i += 1;
    }
    i += 1;
    out += " ";
  };
  const skipTemplate = () => {
    i += 1;
    while (i < source.length) {
      const c = source[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { i += 1; out += " "; return; }
      if (c === "$" && source[i + 1] === "{") { i += 2; templateDepth.push(braceDepth); braceDepth += 1; out += " "; return; }
      if (c === "\n") out += "\n";
      i += 1;
    }
  };
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (c === "/" && n === "/") { while (i < source.length && source[i] !== "\n") i += 1; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") out += "\n"; i += 1; } i += 2; continue; }
    if (c === "'" || c === '"') { skipQuoted(c); continue; }
    if (c === "`") { skipTemplate(); continue; }
    if (c === "{") { braceDepth += 1; }
    if (c === "}") {
      braceDepth -= 1;
      if (templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth) { templateDepth.pop(); skipTemplate(); continue; }
    }
    out += c;
    i += 1;
  }
  return out;
}

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

  it("has no GRAPHIFY_* identifier in code outside src/env.ts (destructuring, aliasing)", () => {
    const offenders = files.filter((file) => BARE_LEGACY_IDENTIFIER.test(codeOnly(readFileSync(file, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("catches the destructured and aliased read forms, and ignores literals", () => {
    expect(BARE_LEGACY_IDENTIFIER.test(codeOnly("const { GRAPHIFY_STORE } = process.env;"))).toBe(true);
    expect(BARE_LEGACY_IDENTIFIER.test(codeOnly("const e = env; const v = e.GRAPHIFY_STORE;"))).toBe(true);
    expect(BARE_LEGACY_IDENTIFIER.test(codeOnly("const v = `${process.env.GRAPHIFY_STORE}`;"))).toBe(true);
    expect(BARE_LEGACY_IDENTIFIER.test(codeOnly('engramEnv("ENGRAM_STORE", "GRAPHIFY_STORE");'))).toBe(false);
    expect(BARE_LEGACY_IDENTIFIER.test(codeOnly("const script = `GRAPHIFY_CMD=engram\\n`; // GRAPHIFY_NOTE"))).toBe(false);
    expect(BARE_LEGACY_IDENTIFIER.test(codeOnly("const DEFAULT_GRAPHIFY_STATE_DIR = 1;"))).toBe(false);
  });

  it("is not vacuous: src/env.ts still names GRAPHIFY_* keys", () => {
    // Guards a scan that silently matches nothing (bad root, bad pattern).
    expect(readFileSync(HELPER, "utf8")).toContain("GRAPHIFY_");
  });
});
