import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SJ-0e no-Python guard (spec §10 row SJ-0e, gate E).
// t1: a tree with one `*.py`, `pyproject.toml` or `requirements*.txt` fails,
//     and the failure names the path.
// t2: the repository as it is passes.
//
// The guard is `scripts/check-no-python.mjs` (Node only). It checks tracked
// and untracked non-ignored paths and fails on any `*.py` (plus `*.pyw`/`*.pyi`/`*.pyx`),
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

function copyGuardTo(dir: string) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  copyFileSync(guardPath, join(dir, GUARD_REL));
  symlinkSync(join(tsRoot, "node_modules"), join(dir, "node_modules"), "dir");
}

// Build a tracked temp tree (guard copy + files + `git add`) whose ROOT is
// the temp dir, mirroring the real repo layout the guard derives ROOT from.
function makeTrackedTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "check-no-python-"));
  try {
    copyGuardTo(dir);
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const init = spawnSync("git", ["-C", dir, "init", "-q"], { encoding: "utf-8" });
    expect(init.status).toBe(0);
    writeFileSync(join(dir, ".git", "info", "exclude"), "/node_modules\n");
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
      copyGuardTo(dir);
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

describe("executable contexts (SJ-0e-2)", () => {
  it.each([
    ["package.json script", "package.json", '{\n  "scripts": {\n    "build": "npm run prepare && python build.py"\n  }\n}\n', 3],
    ["nested package.json script", "packages/example/package.json", '{"scripts":{"build":"PATH=/bin env PIP_CONFIG_FILE=/dev/null /usr/bin/pip install demo"}}\n', 1],
    ["package.json script with quoted substitution", "package.json", JSON.stringify({ scripts: { build: 'echo "$(python3 --version)"' } }), 1],
    ["package.json script with backtick substitution", "package.json", JSON.stringify({ scripts: { build: "echo `pip --version`" } }), 1],
    ["workflow step", ".github/workflows/inline.yml", "jobs:\n  build:\n    steps:\n      - run: 'pipx run demo'\n", 4],
    ["workflow block step", ".github/workflows/block.yml", "jobs:\n  build:\n    steps:\n      - run: |\n          echo 'python3'\n          poetry run demo\n", 6],
    ["direct shebang", "tools/bootstrap", "#!/opt/bin/python3 -u\n", 1],
    ["env shebang", "tools/run.sh", "#!/usr/bin/env -S uv run --script\n", 1],
  ])("a %s invoking a Python command fails and names the file and line", (_context, file, content, line) => {
    const dir = makeTrackedTree({ [file]: content });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${file}:${line}:`);
    } finally {
      cleanup(dir);
    }
  });

  it.each([
    ["src/worker.mjs", 'import { spawn } from "node:child_process";\nspawn("python3", ["worker.py"]);\n'],
    ["src/worker.cjs", 'const cp = require("node:child_process");\ncp.execSync("echo Ready && /usr/bin/pip --version");\n'],
    ["src/worker.js", 'const { execFileSync: run } = require("child_process");\nrun("poetry", ["run", "demo"]);\n'],
    ["src/worker.ts", 'import * as cp from "node:child_process";\ncp.spawnSync("sh", ["-c", "uv run demo"]);\n'],
  ])("a JavaScript or TypeScript file (%s) spawning a Python command fails and names the file and line", (file, content) => {
    const dir = makeTrackedTree({ [file]: content });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${file}:2:`);
    } finally {
      cleanup(dir);
    }
  });

  it.each([
    ["a named shell option", 'bash -o pipefail -c "python3 build.py"', "python3"],
    ["a bundled named shell option", 'sh -eo pipefail -c "pip install demo"', "pip"],
    ["a named shell option with a plus", 'sh +o errexit -c "python3 build.py"', "python3"],
    ["a shell option with a plus", 'sh +e -c "python3 build.py"', "python3"],
    ["a bash shopt option", 'bash -O extglob +O nullglob -c "python3 build.py"', "python3"],
    ["a bash startup file", 'bash --rcfile /tmp/rc -c "python3 build.py"', "python3"],
    ["a bash init file", 'bash --init-file /tmp/rc -c "python3 build.py"', "python3"],
    ["a capitalized shell option cluster", 'sh -Cc "python3 build.py"', "python3"],
    ["an env split string with equals", 'env --split-string=FOO=1 python3 build.py', "python3"],
    ["a quoted env split string", 'env -S "FOO=1 BAR=2" python3 build.py', "python3"],
    ["an env split string carrying a wrapper", 'env -S "FOO=1 sh -c" "python3 build.py"', "python3"],
    ["an evaluated command", 'eval "echo ok &&" "python3 build.py"', "python3"],
    ["a double-quoted empty exec name", 'exec -a "" python3 build.py', "python3"],
    ["a single-quoted empty exec name", "exec -a '' python3 build.py", "python3"],
    ["a substitution starting with a subshell", 'echo $((python3 build.py); echo ok)', "python3"],
    ["a command substitution in arithmetic", 'echo $(( $(python3 -V) + 1 ))', "python3"],
    ["a quoted backtick substitution in arithmetic", 'echo "$(( `pip --version` + 1 ))"', "pip"],
  ])("detects a Python command behind %s", (_context, build, command) => {
    const dir = makeTrackedTree({ "package.json": JSON.stringify({ scripts: { build } }) });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`package.json:1: invokes ${command}`);
    } finally {
      cleanup(dir);
    }
  });

  it.each([
    ["an exec template", 'import { execSync } from "node:child_process";', 'execSync(`python3 ${scriptPath}`);', "python3"],
    ["a shell argument template", 'import { spawnSync } from "node:child_process";', 'spawnSync("sh", ["-c", `uv run ${target}`]);', "uv"],
    ["an execa tagged template", 'import { $ } from "execa";', 'await $`poetry run ${target}`;', "poetry"],
    ["an option-bound execa tag", 'import { $ } from "execa";', 'await $({ cwd: "/tmp" })`python3 a.py`;', "python3"],
    ["an aliased option-bound execa tag", 'const { $: run } = require("execa"); const opts = { cwd: "/tmp" }; const configured = run(opts);', 'await configured`python3 a.py`;', "python3"],
    ["an exec template with a const command", 'import { execSync } from "node:child_process"; const py = "python3";', 'execSync(`${py} ${scriptPath}`);', "python3"],
    ["an exec template with a nested const template", 'import { execSync } from "node:child_process"; const part = "py"; const command = `${part}thon3`;', 'execSync(`${command} a.py`);', "python3"],
    ["a CommonJS execa default", 'const execa = require("execa");', 'execa("python3", ["a.py"]);', "python3"],
    ["a CommonJS execa tag", 'const execa = require("execa");', 'execa`python3 ${scriptPath}`;', "python3"],
    ["an as-const command", 'import { spawnSync } from "node:child_process"; const cmd = "python3" as const;', 'spawnSync(cmd, ["a.py"]);', "python3"],
    ["a parenthesized satisfies command", 'import { spawnSync } from "node:child_process";', 'spawnSync(("python3" satisfies string), []);', "python3"],
    ["a shell call with an argv binding", 'import { spawnSync } from "node:child_process"; const argv = [];', 'spawnSync("echo ok && python3", argv, { shell: true });', "python3"],
    ["a shell call with a shorthand shell option", 'import { spawnSync } from "node:child_process"; const shell = true;', 'spawnSync("echo ok && python3", [], { shell });', "python3"],
    ["an execFile call with options and a callback", 'import { execFile } from "node:child_process"; const cb = () => {};', 'execFile("echo ok && python3", { shell: true }, cb);', "python3"],
    ["a fork with an asserted execPath", 'import { fork } from "node:child_process";', 'fork("worker.js", [], { execPath: <string>"/opt/bin/python3" });', "python3"],
  ])("detects a Python command in %s", (_context, setup, call, command) => {
    const file = "src/process.ts";
    const dir = makeTrackedTree({ [file]: `${setup}\n${call}\n` });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${file}:2: invokes ${command}`);
    } finally {
      cleanup(dir);
    }
  });

  it("scans JS and TS with the TypeScript syntax parser alone", () => {
    const source = readFileSync(guardPath, "utf8");
    expect(source).toContain("ts.createSourceFile(");
    expect(source).not.toMatch(/\b(?:createCompilerHost|createProgram|getTypeChecker)\b/);
  });

  it.each([
    [".github/workflows/extension.yaml", "jobs:\n  build:\n    steps:\n      - run: python3 build.py\n", 4],
    [".github/workflows/step-shell.yml", "jobs:\n  build:\n    steps:\n      - run: print('ok')\n        shell: python\n", 5],
    [".github/workflows/job-shell.yml", "jobs:\n  build:\n    defaults:\n      run:\n        shell: python\n    steps:\n      - run: print('ok')\n", 5],
    [".github/workflows/default-shell.yml", "defaults:\n  run:\n    shell: python\njobs:\n  build:\n    steps:\n      - run: print('ok')\n", 3],
    [".github/workflows/folded.yml", "jobs:\n  build:\n    steps:\n      - run: >-\n          echo python3 &&\n\n          python3 build.py\n", 7],
    [".github/workflows/plain.yml", "jobs:\n  build:\n    steps:\n      - run: echo python3 &&\n          python3 build.py\n", 5],
    [".github/workflows/double.yml", 'jobs:\n  build:\n    steps:\n      - run: "echo python3 &&\n          python\\x33 build.py"\n', 5],
  ])("detects Python at the physical source line in %s", (file, content, line) => {
    const dir = makeTrackedTree({ [file]: content });
    try {
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${file}:${line}: invokes python`);
    } finally {
      cleanup(dir);
    }
  });

  it("stays silent on prose, non-command arguments, and JavaScript fixture data", () => {
    const sample = 'import { spawnSync } from "node:child_process";\nspawnSync("python3");\n';
    const dir = makeTrackedTree({
      "README.md": "Python projects can run `python3 demo.py`.\n",
      "skills/reference/SKILL.md": "To use Python, run `uv run demo`.\n",
      "package.json": JSON.stringify({
        description: "python3 demo.py",
        scripts: { describe: "echo 'python3 demo.py && $(poetry run demo)' $(((python3 + 1)))" },
      }),
      ".github/workflows/clean.yml": "jobs:\n  build:\n    env:\n      run: python3 demo.py\n    steps:\n      - name: python3 demo.py\n        run: echo 'pip install demo' # python3 demo.py\n",
      ".github/examples/sample.yml": "jobs:\n  build:\n    steps:\n      - run: python3 demo.py\n",
      "src/clean.ts": 'import { spawnSync } from "node:child_process";\n// spawnSync("python3");\nconst label = "pip install demo";\nspawnSync("echo", ["poetry", label]);\n',
      "src/shadow.ts": 'import { execSync } from "node:child_process";\nfunction echo(execSync: (text: string) => void) { execSync("python3"); }\nexecSync("echo pip");\n',
      "src/template-cycle.ts": 'import { execSync } from "node:child_process";\nfunction dormant() { const a = `${b}`; const b = `${a}`; execSync(a); }\n',
      "tests/fixtures/example.js": sample,
      "worked/example/raw/demo.mjs": sample,
    });
    try {
      writeFileSync(join(dir, "src", "untracked.js"), sample);
      const r = runGuardAt(join(dir, GUARD_REL), dir);
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("ZERO PYTHON OK");
    } finally {
      cleanup(dir);
    }
  });
});
