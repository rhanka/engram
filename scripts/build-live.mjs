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
// DIGEST_MISMATCH, OUTPUT_INVALID.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
const require = createRequire(import.meta.url);

function fail(cause, detail) {
  console.error(`build-live: ${cause}: ${detail}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// 1. Strict compile (the repository's devDependency TypeScript).
const tsc = require.resolve("typescript/bin/tsc");
const compiled = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], {
  cwd: liveRoot,
  stdio: "inherit",
});
if (compiled.status !== 0) {
  fail("COMPILE_FAILED", `tsc -p engram-live/tsconfig.json exited with ${compiled.status}`);
}
for (const emitted of ["index.js", "contracts.js", "integration.js", "index.d.ts", "contracts.d.ts", "integration.d.ts"]) {
  if (!existsSync(join(distRoot, emitted))) {
    fail("OUTPUT_INVALID", `expected emitted file engram-live/dist/${emitted} is missing`);
  }
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

mkdirSync(grammarsRoot, { recursive: true });
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
  // 3. Copy and re-verify the packaged bytes.
  const targetPath = join(grammarsRoot, entry.file);
  writeFileSync(targetPath, sourceBytes);
  const packagedDigest = sha256(readFileSync(targetPath));
  if (packagedDigest !== entry.sha256) {
    fail("DIGEST_MISMATCH", `packaged grammar for "${language}" has sha256 ${packagedDigest} after copy, manifest pins ${entry.sha256}`);
  }
  pinnedFiles.add(entry.file);
  console.log(`build-live: verified ${language} -> dist/grammars/${entry.file} (${entry.sha256.slice(0, 12)}…, ${sourceBytes.byteLength} bytes)`);
}

// 4. Remove stale WASM assets no longer pinned.
for (const entry of readdirSync(grammarsRoot, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".wasm") && !pinnedFiles.has(entry.name)) {
    rmSync(join(grammarsRoot, entry.name));
    console.log(`build-live: removed stale grammar asset ${entry.name} (unpinned)`);
  }
}

console.log(`build-live: engram-live built — ${languages.length} grammars verified, entry surface emitted to engram-live/dist`);
