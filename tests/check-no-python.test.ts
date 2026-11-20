import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SJ-0e no-Python guard (spec §10 row SJ-0e, gate E).
// t1: a tree with one `*.py`, `pyproject.toml` or `requirements*.txt` fails,
//     and the failure names the path.
// t2: the repository as it is passes.
//
// The guard is `scripts/check-no-python.mjs` (Node only). It scans TRACKED
// files (`git ls-files`) and fails on any `*.py` (plus `*.pyw`/`*.pyi`/`*.pyx`),
// `pyproject.toml` or `requirements*.txt`, printing each offending path.
// The two language-sample corpora (`tests/fixtures/sample*.py` alongside
// `sample.c`/`sample.go`, and `worked/**/raw/*.py` with `GRAPH_REPORT.md`)
// are Python-language INPUTS for graph extraction, never executed repo code,
// so those 16 exact paths are grandfathered inside the guard. Every other
// Python path fails, including a new file under those same directories --
// the extra tests below pin that narrowness.

const tsRoot = fileURLToPath(new URL("..", import.meta.url));
const GUARD_REL = join("scripts", "check-no-python.mjs");
const guardPath = join(tsRoot, GUARD_REL);

function runGuardAt(guardFile: string, cwd: string) {
  return spawnSync(process.execPath, [guardFile], { cwd, encoding: "utf-8" });
}

// Build a tracked temp tree (guard copy + files + `git add`) whose ROOT is
// the temp dir, mirroring the real repo layout the guard derives ROOT from.
function makeTrackedTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "check-no-python-"));
  try {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    copyFileSync(guardPath, join(dir, GUARD_REL));
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const init = spawnSync("git", ["-C", dir, "init", "-q"], { encoding: "utf-8" });
    expect(init.status).toBe(0);
    const add = spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf-8" });
    expect(add.status).toBe(0);
    return dir;
  } catch (err) {
    cleanup(dir);
    throw err;
  }
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

describe("check-no-python (SJ-0e)", () => {
  it("t1: a tree with one *.py fails and names the path", () => {
    const dir = makeTrackedTree({
      "src/bad.py": "x = 1\n",
      "src/clean.ts": "export const x = 1;\n",
    });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(`${r.stdout}\n${r.stderr}`).toContain("src/bad.py");
    } finally {
      cleanup(dir);
    }
  });

  it("t1: a tree with a nested *.py fails and names the full path", () => {
    const dir = makeTrackedTree({ "a/b/c/evil.py": "raise SystemExit\n" });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(`${r.stdout}\n${r.stderr}`).toContain("a/b/c/evil.py");
    } finally {
      cleanup(dir);
    }
  });

  it("t1: a tree with pyproject.toml fails and names the path", () => {
    const dir = makeTrackedTree({ "pyproject.toml": '[project]\nname = "x"\nversion = "0.1.0"\n' });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(`${r.stdout}\n${r.stderr}`).toContain("pyproject.toml");
    } finally {
      cleanup(dir);
    }
  });

  it("t1: a tree with requirements*.txt fails and names the path", () => {
    const dir = makeTrackedTree({ "requirements-dev.txt": "requests\n" });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(`${r.stdout}\n${r.stderr}`).toContain("requirements-dev.txt");
    } finally {
      cleanup(dir);
    }
  });

  it("a clean tree passes", () => {
    const dir = makeTrackedTree({
      "src/clean.ts": "export const x = 1;\n",
      "README.md": "# hi\n",
    });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("ZERO PYTHON OK");
    } finally {
      cleanup(dir);
    }
  });

  it("grandfathered fixture data passes, but a new .py under the same dirs fails", () => {
    const dir = makeTrackedTree({
      "tests/fixtures/sample.py": "class Transformer:\n    pass\n",
      "worked/example/raw/api.py": "x = 1\n",
    });
    try {
      const ok = runGuardAt(join(dir, GUARD_REL), dir);
      expect(ok.status).toBe(0);
    } finally {
      cleanup(dir);
    }

    const dir2 = makeTrackedTree({ "tests/fixtures/new_sample.py": "x = 1\n" });
    try {
      const bad = runGuardAt(join(dir2, GUARD_REL), dir2);
      expect(bad.status).toBe(1);
      expect(`${bad.stdout}\n${bad.stderr}`).toContain("tests/fixtures/new_sample.py");
    } finally {
      cleanup(dir2);
    }
  });

  it("untracked non-ignored *.py fails even without git add", () => {
    const dir = makeTrackedTree({ "src/clean.ts": "export const x = 1;\n" });
    try {
      writeFileSync(join(dir, "src/untracked.py"), "x = 1\n");
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(`${r.stdout}\n${r.stderr}`).toContain("src/untracked.py");
    } finally {
      cleanup(dir);
    }
  });

  it("invocation through a symlink still runs the guard", () => {
    const dir = makeTrackedTree({ "src/clean.ts": "export const x = 1;\n" });
    try {
      const link = join(dir, "guard-link.mjs");
      symlinkSync(join(dir, GUARD_REL), link);
      const r = runGuardAt(link, dir);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("ZERO PYTHON OK");
    } finally {
      cleanup(dir);
    }
  });

  it("fails closed (exit 1, cannot prove zero-python) outside a Git tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-no-python-non-git-"));
    try {
      mkdirSync(join(dir, "scripts"), { recursive: true });
      copyFileSync(guardPath, join(dir, GUARD_REL));
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(`${r.stdout}\n${r.stderr}`).toContain("cannot prove zero-python");
    } finally {
      cleanup(dir);
    }
  });

  it("t2: the repository as it is passes", () => {
    const r = runGuardAt(guardPath, tsRoot);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ZERO PYTHON OK");
  });
});
