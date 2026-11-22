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
// grammar verification); `--audit-only` runs the L5 seam audit and the
// closed-core closure audit (plan/09 L5-P2a) and exits 0/1 without compiling.
// Any other argument is refused (USAGE).

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
// Test-only tree override (plan/09 L5-P2a GUARD): the closure-audit test runs
// `--audit-only` against isolated copies of the closed set that never touch
// the repository. Only the audit path reads through it; the build below
// always uses the repository root.
const auditRoot = process.env.ENGRAM_BUILD_LIVE_ROOT
  ? resolve(process.env.ENGRAM_BUILD_LIVE_ROOT)
  : root;
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
//   1. engram-live/analysis-cache.ts, code-analysis.ts, comparisons.ts and parse-adapter.ts
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
// tests/live-neutrality.test.ts (G2 also delivers the reused L5 modules as
// internal package files). Returns true when every check passes.
function runL5Audit(base) {
  const failures = [];
  const read = (rel) => {
    try {
      return readFileSync(join(base, rel), "utf8");
    } catch {
      failures.push(`${rel} is missing`);
      return null;
    }
  };
  const neutralModules = {
    "engram-live/analysis-cache.ts": ["deriveAnalysisCacheKey", "AnalysisCache"],
    "engram-live/code-analysis.ts": ["analyzeCode", "repairAffectedCalls"],
    "engram-live/parse-adapter.ts": ["createProductionParseAdapter"],
    "engram-live/comparisons.ts": ["compareBranches"],
    "engram-live/symbol-history.ts": ["correspondSymbols"],
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
  // L5-P2a: the extraction seam lives in the closed core; the root host
  // module binds it (see ExtractCoreHost in src/extract-core.ts).
  const core = read("src/extract-core.ts");
  if (core !== null) {
    // Boundary-precise markers: a bare "cacheStore" substring would also
    // match a renamed field, so the audit requires the exact declarations.
    for (const symbol of ["LiveExtractionPorts", "readonly cacheStore?:", "readonly grammarWasm?:", "live !== undefined", "liveNoCache", "liveExtractionKey", "liveOperationScope", "resolveLiveLanguage"]) {
      if (!core.includes(symbol)) {
        failures.push(`src/extract-core.ts must expose the injected L5 seam "${symbol}"`);
      }
    }
    // R13: deterministic resolution/comparison/repair — no model SDK in the
    // reused live closure either.
    for (const edge of ["mistral", "openai", "anthropic", "-bedrock", "cohere"]) {
      if (core.toLowerCase().includes(edge)) {
        failures.push(`src/extract-core.ts carries a forbidden model edge "${edge}" (R13)`);
      }
    }
  }
  const extract = read("src/extract.ts");
  if (extract !== null) {
    for (const symbol of ["bindExtractCoreHost", "./extract-core.js"]) {
      if (!extract.includes(symbol)) {
        failures.push(`src/extract.ts must bind the closed core "${symbol}"`);
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
    for (const symbol of ["liveContentKey", "liveNoCache", "live-cache-keys.js"]) {
      if (!cache.includes(symbol)) {
        failures.push(`src/cache.ts must expose the injected L5 seam "${symbol}"`);
      }
    }
  }
  const liveCacheKeys = read("src/live-cache-keys.ts");
  if (liveCacheKeys !== null) {
    for (const symbol of ["InjectedCacheStore", "liveExtractionKey", "LIVE_CACHE_SCHEMA_VERSION", "assertValidLiveStore"]) {
      if (!liveCacheKeys.includes(symbol)) {
        failures.push(`src/live-cache-keys.ts must expose the injected L5 seam "${symbol}"`);
      }
    }
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`build-live: L5_AUDIT_FAILED: ${failure}`);
    return false;
  }
  console.log("build-live: L5 seam audit ok — analysis-cache/code-analysis/comparisons/parse-adapter neutral, reused extraction seam present");
  return true;
}

// Closed extraction core (plan/09 L5-P2a): the single enumeration of the
// closed set, also reused by the packaged delivery of L5-P2b. The static
// value-import closure from src/extract-core.ts holds only node: builtins
// other than node:module and these modules; type-only imports are erased at
// emit and do not count.
const CLOSED_EXTRACTION_SET = [
  "src/extract-core.ts",
  "src/live-cache-keys.ts",
  "src/node-id.ts",
  "src/relation-remap.ts",
];

function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i + 2);
      out += end === -1 ? "" : "\n";
      i = end === -1 ? n : end + 1;
    } else if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
    } else {
      out += source[i];
      i++;
    }
  }
  return out;
}

function stripCommentsAndStrings(source) {
  return stripComments(source)
    .replace(/'(?:[^'\\\n]|\\.)*'?/g, '""')
    .replace(/"(?:[^"\\\n]|\\.)*"?/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`?/gs, '""');
}

// Static value-import specifiers of one module: [specifier, typeOnly].
// Parsed with the repository's dev TypeScript (as in
// scripts/check-live-package.mjs): every non-type-only ImportDeclaration
// and ExportDeclaration with a module specifier is a value edge.
// `import type ...` and all-`type` named imports are erased at emit and
// never count.
let cachedTypeScript = null;
function typeScript() {
  if (cachedTypeScript === null) cachedTypeScript = require("typescript");
  return cachedTypeScript;
}

function staticImportSpecifiers(source) {
  const ts = typeScript();
  const file = ts.createSourceFile("scan.ts", source, ts.ScriptTarget.ESNext, true);
  const specs = [];
  const seen = new Set();
  const record = (specifier) => {
    if (!seen.has(specifier)) {
      seen.add(specifier);
      specs.push([specifier, false]);
    }
  };
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteralLike(specifier)) continue;
      if (statement.importClause?.isTypeOnly === true) continue;
      const clause = statement.importClause;
      // A side-effect import has no clause and always evaluates its module.
      if (clause === undefined) {
        record(specifier.text);
        continue;
      }
      const named = clause.namedBindings;
      const allNamedType = named !== undefined && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
      const hasValueBinding = clause.name !== undefined
        || (named !== undefined && ts.isNamespaceImport(named));
      if (allNamedType && !hasValueBinding) continue;
      record(specifier.text);
    } else if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      if (specifier === undefined || !ts.isStringLiteralLike(specifier)) continue;
      if (statement.isTypeOnly === true) continue;
      record(specifier.text);
    }
  }
  return specs;
}

// Walk the static value-import closure from src/extract-core.ts and refuse
// any edge outside the enumerated set. `read` maps a repository-relative path
// to its content, or null when it is missing. Returns the failure list.
function auditClosedCore(read) {
  const failures = [];
  const seen = new Set();
  const queue = ["src/extract-core.ts"];
  let edges = 0;
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const content = read(rel);
    if (content === null) {
      failures.push(`closed core member "${rel}" is missing`);
      continue;
    }
    for (const [specifier] of staticImportSpecifiers(content)) {
      edges++;
      if (specifier === "node:module") {
        failures.push(`"${rel}" imports the module-loader builtin "node:module": the closed core builds no loader`);
        continue;
      }
      if (specifier.startsWith("node:")) continue;
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
        let resolved = `${dir}/${specifier}`.replace(/\/\.\//g, "/");
        // Resolve ".." segments textually (no filesystem access).
        const parts = [];
        for (const part of resolved.split("/")) {
          if (part === "..") parts.pop();
          else if (part !== ".") parts.push(part);
        }
        resolved = parts.join("/").replace(/\.js$/, ".ts");
        if (!CLOSED_EXTRACTION_SET.includes(resolved)) {
          failures.push(`"${rel}" leaves the enumerated set: "${specifier}" resolves to "${resolved}"`);
          continue;
        }
        queue.push(resolved);
        continue;
      }
      failures.push(`"${rel}" imports "${specifier}": the closed core imports only node builtins and modules of its enumerated set`);
    }
    const scrubbed = stripCommentsAndStrings(content);
    for (const token of ["createRequire", "getBuiltinModule"]) {
      if (new RegExp(`\\b${token}\\b`).test(scrubbed)) {
        failures.push(`"${rel}" references loader factory "${token}": the closed core builds no loader`);
      }
    }
    if (/(^|[^.\w$])require\s*\(/.test(scrubbed)) {
      failures.push(`"${rel}" calls require(): the closed core builds no loader`);
    }
    if (/(^|[^.\w$])import\s*\(/.test(scrubbed)) {
      failures.push(`"${rel}" uses a dynamic import(): the closed core builds no loader`);
    }
  }
  return { failures, modules: [...seen], edges };
}

// Packaged reused extraction (plan/09 L5-P2b): value names the committed
// declaration requires from the generated core. Types and interfaces are
// erased at emit and are not checked as values.
function declaredCoreValueNames(dtsSource) {
  const ts = typeScript();
  const file = ts.createSourceFile("extract-core.d.ts", dtsSource, ts.ScriptTarget.ESNext, true);
  const names = [];
  const isExported = (node) => (ts.canHaveModifiers(node) ? ts.getModifiers(node) : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDeclare = (node) => (ts.canHaveModifiers(node) ? ts.getModifiers(node) : []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      if (statement.name && (isExported(statement) || isDeclare(statement))) names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      if (isExported(statement) || isDeclare(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) names.push(element.name.text);
      }
    }
  }
  return [...new Set(names)];
}

// Value names the emitted core JavaScript exports.
function emittedCoreValueNames(jsSource) {
  const ts = typeScript();
  const file = ts.createSourceFile("extract-core.js", jsSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const names = [];
  for (const statement of file.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name &&
      (statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      if ((statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) names.push(element.name.text);
      }
    }
  }
  return [...new Set(names)];
}

const cliArgs = process.argv.slice(2);
if (cliArgs.length > 0) {
  if (cliArgs.length === 1 && cliArgs[0] === "--audit-only") {
    const auditRead = (rel) => {
      try {
        return readFileSync(join(auditRoot, rel), "utf8");
      } catch {
        return null;
      }
    };
    const seamOk = runL5Audit(auditRoot);
    const closed = auditClosedCore(auditRead);
    if (closed.failures.length > 0) {
      for (const failure of closed.failures) console.error(`build-live: CLOSED_CORE_AUDIT_FAILED: ${failure}`);
    } else {
      console.log(`build-live: closed core audit ok — ${closed.modules.length} modules, ${closed.edges} value edges in the enumerated set`);
    }
    process.exit(seamOk && closed.failures.length === 0 ? 0 : 1);
  }
  fail("USAGE", `unknown arguments ${JSON.stringify(cliArgs)} (expected no argument or --audit-only)`);
}

const stageGrammarsRoot = join(stageRoot, "grammars");
const ENGINE_AND_SCHEDULER_MODULES = [
  "git-stream",
  "git-protocol",
  "history",
  "refs",
  "repository",
  "retention",
  "pr-sync",
  "pr-attribution",
  "worktree",
  "attributes",
  "filesystem",
  "diffs",
  "snapshots",
  "content-policy",
  "scheduler",
  "watch",
  "reconcile",
  "coverage",
];
const emittedFiles = [
  ...["facts", "batch-codec", "generation", "symbol-history", "code-analysis", "analysis-cache", "comparisons", "parse-adapter", "factory-history", "factory-local", ...ENGINE_AND_SCHEDULER_MODULES].flatMap(name =>
    [`${name}.js`, `${name}.d.ts`, `${name}.d.ts.map`]),
  "line-attribution.d.ts",
  "line-attribution.d.ts.map",
  "line-attribution.js",
  "git-executor.d.ts",
  "git-executor.d.ts.map",
  "git-executor.js",
  "contracts.d.ts",
  "contracts.d.ts.map",
  "contracts.js",
  "registration.d.ts",
  "registration.d.ts.map",
  "registration.js",
  "integration.d.ts",
  "integration.d.ts.map",
  "integration.js",
  "reused-extraction.js",
  "reused-extraction.d.ts",
  "reused-extraction.d.ts.map",
  "reused/extract-core.js",
  "reused/live-cache-keys.js",
  "reused/node-id.js",
  "reused/relation-remap.js",
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

  // 1b. Second compiler pass over the closed extraction set (plan/09 L5-P2b):
  // the repository TypeScript alone emits the closed core JavaScript under
  // dist/reused/, with no declaration file for those modules.
  const stageReusedRoot = join(stageRoot, "reused");
  mkdirSync(stageReusedRoot, { recursive: true });
  const closedPass = spawnSync(
    process.execPath,
    [
      tsc,
      "--ignoreConfig",
      ...CLOSED_EXTRACTION_SET,
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--strict",
      "--skipLibCheck",
      "--types", "node",
      "--outDir", stageReusedRoot,
      "--rootDir", join(root, "src"),
      "--declaration", "false",
      "--declarationMap", "false",
      "--sourceMap", "false",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (closedPass.status !== 0) {
    fail("COMPILE_FAILED", `second tsc pass over the closed extraction set exited with ${closedPass.status}`);
  }
  for (const member of CLOSED_EXTRACTION_SET) {
    const base = member.slice("src/".length).replace(/\.ts$/, ".js");
    if (!existsSync(join(stageReusedRoot, base))) {
      fail("OUTPUT_INVALID", `second pass did not emit closed core member dist/reused/${base}`);
    }
  }
  // The committed declaration types the in-package import at compile time;
  // the build fails when the emitted core lacks a declared value.
  try {
    const dts = readFileSync(join(liveRoot, "reused", "extract-core.d.ts"), "utf8");
    const emittedCore = readFileSync(join(stageReusedRoot, "extract-core.js"), "utf8");
    const declared = declaredCoreValueNames(dts);
    const emitted = new Set(emittedCoreValueNames(emittedCore));
    for (const name of declared) {
      if (!emitted.has(name)) {
        fail("OUTPUT_INVALID", `emitted closed core dist/reused/extract-core.js does not export declared name "${name}"`);
      }
    }
    const reusedEntryDts = readFileSync(join(stageRoot, "reused-extraction.d.ts"), "utf8");
    if (reusedEntryDts.includes("./reused/")) {
      fail("OUTPUT_INVALID", "emitted dist/reused-extraction.d.ts must not reference unshipped ./reused/ internal declarations");
    }
    console.log(`build-live: closed core second pass ok — ${CLOSED_EXTRACTION_SET.length} modules, ${declared.length} declared values verified in dist/reused/extract-core.js`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("build-live:")) throw error;
    fail("OUTPUT_INVALID", `closed core declaration check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const emitted of emittedFiles) {
    if (!existsSync(join(stageRoot, emitted))) {
      fail("OUTPUT_INVALID", `expected emitted file engram-live/dist/${emitted} is missing`);
    }
  }

  // L5 seam audit on every build: the context-bound analysis seam must exist
  // and stay neutral before any grammar asset is trusted.
  if (!runL5Audit(root)) {
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
  mkdirSync(join(distRoot, "reused"), { recursive: true });
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
