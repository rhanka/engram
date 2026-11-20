#!/usr/bin/env node
// Zero-Python guard (SJ-0e, spec §10): fails on any tracked `*.py`,
// `pyproject.toml` or `requirements*.txt`, naming each offending path.
// Node only, no dependency beyond Node builtins and `git`.
//
// Scans TRACKED files only (`git ls-files`), so ignored files (venv,
// __pycache__, node_modules) never count. The 16 exact SELF-ALLOWED paths
// below are Python-language INPUT DATA for graph extraction -- `tests/fixtures/
// sample*.py` (beside `sample.c`/`sample.go`) and `worked/**/raw/*.py` (with
// `GRAPH_REPORT.md`) -- never executed repo code. Every other Python path,
// including a new file under those same directories, fails. This is what lets
// t2 (repository as it is) pass without weakening t1 (any new file fails).
//
// Usage: node scripts/check-no-python.mjs
// Exit 0 when clean, 1 on any unexcused hit or when `git ls-files` fails
// (fail closed: a guard that cannot list the tree cannot prove zero-python).
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Grandfathered Python-language INPUT DATA (see header). Exact tracked paths.
const ALLOWED = new Set([
  "tests/fixtures/sample.py",
  "tests/fixtures/sample_calls.py",
  "worked/example/raw/api.py",
  "worked/example/raw/parser.py",
  "worked/example/raw/processor.py",
  "worked/example/raw/storage.py",
  "worked/example/raw/validator.py",
  "worked/httpx/raw/auth.py",
  "worked/httpx/raw/client.py",
  "worked/httpx/raw/exceptions.py",
  "worked/httpx/raw/models.py",
  "worked/httpx/raw/transport.py",
  "worked/httpx/raw/utils.py",
  "worked/mixed-corpus/raw/analyze.py",
  "worked/mixed-corpus/raw/build.py",
  "worked/mixed-corpus/raw/cluster.py",
]);

export function isPythonPath(rel) {
  if (/\.(py|pyw|pyi|pyx)$/i.test(rel)) return true;
  const base = basename(rel).toLowerCase();
  if (base === "pyproject.toml") return true;
  // `requirements*.txt`: starts with requirements, ends with .txt.
  if (base.startsWith("requirements") && base.endsWith(".txt")) return true;
  return false;
}

export function findHits(rels) {
  return rels.filter((rel) => rel !== "" && !ALLOWED.has(rel) && isPythonPath(rel));
}

function main() {
  const g = spawnSync("git", ["-C", ROOT, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (g.status !== 0) {
    console.error("check-no-python: `git ls-files` failed -- cannot prove zero-python");
    process.exit(1);
  }
  const rels = [...new Set(g.stdout.toString("utf8").split("\0"))];
  const hits = findHits(rels);
  if (hits.length === 0) {
    console.log(`✓ ZERO PYTHON OK (0 unexcused, ${ALLOWED.size} allowlisted fixture paths)`);
    return;
  }
  console.error(`check-no-python: unexcused Python paths (${hits.length}):`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

function isMainModule() {
  if (process.argv[1] == null) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
