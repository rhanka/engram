#!/usr/bin/env node
// L1b build (plan/09-BRANCH_LIVE_GIT_INDEXING.md; spec/SPEC_LIVE_GIT_INDEXING.md
// §11, A15). Node only — no Python, no package download, no network, no
// dependency beyond Node builtins and the repository's dev TypeScript.
//
// What it does, in order:
//   1. strict-compiles engram-live (contracts.ts, registration.ts,
//      integration.ts, index.ts) into engram-live/dist/ with declarations;
//   2. verifies every grammar pinned in engram-live/grammar-manifest.json
//      against the source tree: the source file must exist and its sha256
//      must match the pinned digest — a drifted or tampered grammar aborts
//      the build instead of being silently trusted;
//   3. copies the verified WASM bytes into engram-live/dist/grammars/ and
//      re-verifies the copied digest;
//   4. removes any stale WASM asset no longer pinned by the manifest;
//   5. checks the emitted entry surface (index/contracts/registration/
//      integration .js and .d.ts) and that the packaged manifest matches the
//      advertised contracts constant.
//
// Exit causes: COMPILE_FAILED, MANIFEST_INVALID, SOURCE_MISSING,
// DIGEST_MISMATCH, OUTPUT_INVALID, L5_AUDIT_FAILED, USAGE.
//
// Modes: no argument runs the full build (compile + L5 seam audit +
// grammar verification); `--audit-only` runs the L5 seam audit alone and
// exits 0/1 without compiling. Any other argument is refused (USAGE).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = join(root, "engram-live");
const distRoot = join(liveRoot, "dist");
const grammarsRoot = join(distRoot, "grammars");
const stageRoot = join(liveRoot, `.dist-stage-${process.pid}`);
const require = createRequire(import.meta.url);

function fail(cause, detail) {
  rmSync(stageRoot, { recursive: true, force: true });
  console.error(`build-live: ${cause}: ${detail}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// L5 seam audit (plan/09 L5; spec/SPEC_LIVE_GIT_INDEXING.md §8, A08/A13;
// L5-cache-design R4a/R13 + A1/A13). Static, dependency-free verification
// that the context-bound analysis seam exists and the neutral closure is
// intact:
//
//   1. engram-live/analysis-cache.ts, code-analysis.ts and comparisons.ts
//      exist, export their entry symbols, and carry no forbidden edge
//      (source-root import, storage driver, module loader, model module,
//      dynamic import, filesystem writes, exit-hook registration, LLM SDK);
//   2. the reused root extraction exposes the injected seam
//      (LiveExtractionPorts/cacheStore/grammarWasm through src/extract.ts,
//      InjectedCacheStore/liveContentKey/liveExtractionKey through
//      src/cache.ts) with live-strict guards (live !== undefined,
//      liveNoCache, grammar-bound keys, operation-local scratch) instead of
//      a source-root default.
//
// The audit emits no file: the exact packed surface stays pinned by
// tests/live-neutrality.test.ts (new L5 modules are source-side neutral
// logic, not new package entries). Returns true when every check passes.
function runL5Audit() {
  const failures = [];
  const read = (rel) => {
    try {
      return readFileSync(join(root, rel), "utf8");
    } catch {
      failures.push(`${rel} is missing`);
      return null;
    }
  };
  const neutralModules = {
    "engram-live/analysis-cache.ts": ["deriveAnalysisCacheKey", "AnalysisCache"],
    "engram-live/code-analysis.ts": ["analyzeCode", "repairAffectedCalls"],
    "engram-live/comparisons.ts": ["compareBranches"],
  };
  const forbiddenEdges = [
    "../src/",
    "node:sqlite",
    "node:module",
    "createRequire",
    "getBuiltinModule",
    "better-sqlite3",
    "mistral",
    "openai",
    "anthropic",
    "await import(",
    "from \"openai",
    "from 'openai",
    "@anthropic",
    "@mistral",
    "node:fs",
    "node:fs/promises",
    "writeFileSync",
    "mkdirSync",
    "renameSync",
    "process.on(\"exit\"",
    "process.on('exit'",
    "beforeExit",
  ];
  for (const [rel, symbols] of Object.entries(neutralModules)) {
    const content = read(rel);
    if (content === null) continue;
    for (const symbol of symbols) {
      if (!content.includes(symbol)) {
        failures.push(`${rel} must export ${symbol}`);
      }
    }
    for (const edge of forbiddenEdges) {
      if (edge.startsWith("node:fs") && rel === "engram-live/comparisons.ts" && content.includes("node:crypto")) {
        // comparisons.ts legitimately imports node:crypto (OID recomputation);
        // the node:fs ban still applies — check writes, not the crypto import.
        if (content.includes("node:fs\"") || content.includes("node:fs'") || content.includes("node:fs/promises")) {
          failures.push(`${rel} carries a forbidden edge "${edge}" (neutral closure)`);
        }
        continue;
      }
      if (content.includes(edge)) {
        failures.push(`${rel} carries a forbidden edge "${edge}" (neutral closure)`);
      }
    }
  }
  const extract = read("src/extract.ts");
  if (extract !== null) {
    // Boundary-precise markers: a bare "cacheStore" substring would also
    // match a renamed field, so the audit requires the exact declarations.
    for (const symbol of ["LiveExtractionPorts", "readonly cacheStore?:", "readonly grammarWasm?:", "live !== undefined", "liveNoCache", "liveExtractionKey", "liveOperationScope", "resolveLiveLanguage"]) {
      if (!extract.includes(symbol)) {
        failures.push(`src/extract.ts must expose the injected L5 seam "${symbol}"`);
      }
    }
    // R13: deterministic resolution/comparison/repair — no model SDK in the
    // reused live closure either.
    for (const edge of ["mistral", "openai", "anthropic", "-bedrock", "cohere"]) {
      if (extract.toLowerCase().includes(edge)) {
        failures.push(`src/extract.ts carries a forbidden model edge "${edge}" (R13)`);
      }
    }
  }
  const cache = read("src/cache.ts");
  if (cache !== null) {
    for (const symbol of ["InjectedCacheStore", "liveContentKey", "liveExtractionKey", "LIVE_CACHE_SCHEMA_VERSION", "assertValidLiveStore", "liveNoCache"]) {
      if (!cache.includes(symbol)) {
        failures.push(`src/cache.ts must expose the injected L5 seam "${symbol}"`);
      }
    }
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`build-live: L5_AUDIT_FAILED: ${failure}`);
    return false;
  }
  console.log("build-live: L5 seam audit ok — analysis-cache/code-analysis/comparisons neutral, reused extraction seam present");
  return true;
}

const cliArgs = process.argv.slice(2);
if (cliArgs.length > 0) {
  if (cliArgs.length === 1 && cliArgs[0] === "--audit-only") {
    process.exit(runL5Audit() ? 0 : 1);
  }
  fail("USAGE", `unknown arguments ${JSON.stringify(cliArgs)} (expected no argument or --audit-only)`);
}

const stageGrammarsRoot = join(stageRoot, "grammars");
const emittedFiles = [
  "contracts.d.ts",
  "contracts.d.ts.map",
  "contracts.js",
  "registration.d.ts",
  "registration.d.ts.map",
  "registration.js",
  "integration.d.ts",
  "integration.d.ts.map",
  "integration.js",
  "index.d.ts",
  "index.d.ts.map",
  "index.js",
];

rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stageGrammarsRoot, { recursive: true });
try {
  // 1. Strict compile (the repository's devDependency TypeScript) into a
  // sibling staging directory so engram-live/dist is never truncated in-place.
  const tsc = require.resolve("typescript/bin/tsc");
  const compiled = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--outDir", stageRoot], {
    cwd: liveRoot,
    stdio: "inherit",
  });
  if (compiled.status !== 0) {
    fail("COMPILE_FAILED", `tsc -p engram-live/tsconfig.json exited with ${compiled.status}`);
  }
  for (const emitted of emittedFiles) {
    if (!existsSync(join(stageRoot, emitted))) {
      fail("OUTPUT_INVALID", `expected emitted file engram-live/dist/${emitted} is missing`);
    }
  }

  // L5 seam audit on every build: the context-bound analysis seam must exist
  // and stay neutral before any grammar asset is trusted.
  if (!runL5Audit()) {
    fail("L5_AUDIT_FAILED", "context-bound analysis seam is missing or escapes the neutral closure");
  }

  // 2. Pinned grammar manifest verification against the source tree.
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(liveRoot, "grammar-manifest.json"), "utf8"));
  } catch (error) {
    fail("MANIFEST_INVALID", `grammar-manifest.json does not parse: ${error.message}`);
  }
  if (!manifest || typeof manifest !== "object" || !manifest.languages || typeof manifest.languages !== "object") {
    fail("MANIFEST_INVALID", "grammar-manifest.json must carry a languages record");
  }
  const languages = Object.entries(manifest.languages);
  if (languages.length === 0) {
    fail("MANIFEST_INVALID", "grammar-manifest.json pins no language; the advertised matrix must be explicit");
  }

  // The advertised matrix must match the pinned manifest exactly: contracts.ts
  // is the built constant consumers see, so a drift is a packaging defect.
  const contractsSource = readFileSync(join(liveRoot, "contracts.ts"), "utf8");
  const advertisedMatch = contractsSource.match(/ADVERTISED_LANGUAGES[\s\S]*?=\s*\[([\s\S]*?)\]/);
  if (!advertisedMatch) {
    fail("MANIFEST_INVALID", "contracts.ts must define the ADVERTISED_LANGUAGES constant");
  }
  const advertised = advertisedMatch[1]
    .split(",")
    .map((entry) => entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/["'\s]/g, ""))
    .filter((entry) => entry.length > 0);
  const pinned = languages.map(([language]) => language).sort();
  if (JSON.stringify(advertised.slice().sort()) !== JSON.stringify(pinned)) {
    fail("MANIFEST_INVALID", `ADVERTISED_LANGUAGES ${JSON.stringify(advertised)} drifts from the pinned manifest ${JSON.stringify(pinned)}`);
  }

  const pinnedFiles = new Set();
  for (const [language, entry] of languages) {
    if (!entry || typeof entry !== "object" || typeof entry.file !== "string" || typeof entry.sha256 !== "string") {
      fail("MANIFEST_INVALID", `manifest entry for "${language}" must carry file and sha256`);
    }
    const sourcePath = join(root, entry.sourcePath);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      fail("SOURCE_MISSING", `pinned source for "${language}" is missing: ${entry.sourcePath}`);
    }
    const sourceBytes = readFileSync(sourcePath);
    const sourceDigest = sha256(sourceBytes);
    if (sourceDigest !== entry.sha256) {
      fail(
        "DIGEST_MISMATCH",
        `source grammar for "${language}" (${entry.sourcePath}) has sha256 ${sourceDigest}, manifest pins ${entry.sha256}; re-pin the manifest deliberately`,
      );
    }
    if (typeof entry.bytes === "number" && entry.bytes !== sourceBytes.byteLength) {
      fail("DIGEST_MISMATCH", `source grammar for "${language}" is ${sourceBytes.byteLength} bytes, manifest pins ${entry.bytes}`);
    }
    // 3. Stage and re-verify the packaged bytes before atomic installation.
    const stagedPath = join(stageGrammarsRoot, entry.file);
    writeFileSync(stagedPath, sourceBytes);
    const packagedDigest = sha256(readFileSync(stagedPath));
    if (packagedDigest !== entry.sha256) {
      fail("DIGEST_MISMATCH", `packaged grammar for "${language}" has sha256 ${packagedDigest} after copy, manifest pins ${entry.sha256}`);
    }
    pinnedFiles.add(entry.file);
    console.log(`build-live: verified ${language} -> dist/grammars/${entry.file} (${entry.sha256.slice(0, 12)}…, ${sourceBytes.byteLength} bytes)`);
  }

  // 4. Atomically install verified grammars and emitted entries into dist,
  // renaming index.js last so the freshness marker is updated only after
  // every packaged file is in place.
  mkdirSync(grammarsRoot, { recursive: true });
  for (const [, entry] of languages) {
    renameSync(join(stageGrammarsRoot, entry.file), join(grammarsRoot, entry.file));
  }
  for (const entry of readdirSync(grammarsRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".wasm") && !pinnedFiles.has(entry.name)) {
      rmSync(join(grammarsRoot, entry.name));
      console.log(`build-live: removed stale grammar asset ${entry.name} (unpinned)`);
    }
  }
  for (const emitted of emittedFiles) {
    renameSync(join(stageRoot, emitted), join(distRoot, emitted));
  }
  console.log(`build-live: engram-live built — ${languages.length} grammars verified, entry surface emitted to engram-live/dist`);
} finally {
  rmSync(stageRoot, { recursive: true, force: true });
}
