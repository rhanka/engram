import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = join(root, "engram-live");
const buildScript = join(root, "scripts", "build-live.mjs");
const rootPackageJson = join(root, "package.json");

// No-Python proof, phase by phase: build, packing, installation, imports and
// exercises each run in an ISOLATED child process whose PATH starts with
// python/python2/python3/python2.7/py tripwires that record any invocation
// and fail. The marker is verified after every phase; if Python ever ran,
// its recorded command line is the failure trace. Nothing is checked only
// "before" an import: the imports themselves run in the protected child.

interface PhaseMarker {
  phase: string;
  marker: string | null;
}

interface PackedInstall {
  tmpRoot: string;
  installDir: string;
  tripwireBin: string;
  pythonMarker: string;
  tarball: string;
  packedPaths: string[];
  phaseTrace: PhaseMarker[];
}

const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function liveBuildIsFresh(): boolean {
  const marker = join(liveRoot, "dist", "index.js");
  if (!existsSync(marker)) return false;
  const inputs = [
    "contracts.ts",
    "registration.ts",
    "integration.ts",
    "index.ts",
    "tsconfig.json",
    "package.json",
    "grammar-manifest.json",
  ].map((name) => join(liveRoot, name));
  if (inputs.some((input) => !existsSync(input))) return false;
  const newestInput = Math.max(...inputs.map((input) => statSync(input).mtimeMs));
  return statSync(marker).mtimeMs >= newestInput;
}

function runProtectedBuild(env: NodeJS.ProcessEnv): void {
  if (!existsSync(buildScript)) {
    throw new Error("L1b is not implemented: scripts/build-live.mjs is missing (build the engram-live package).");
  }
  const lockPath = join(tmpdir(), "engram-live-build.lock");
  for (let attempt = 0; ; attempt++) {
    let handle: number | undefined;
    try {
      handle = openSync(lockPath, "wx");
    } catch {
      if (!existsSync(lockPath)) continue;
      if (statSync(lockPath).mtimeMs < Date.now() - 180_000) unlinkSync(lockPath);
      if (attempt > 900) throw new Error("engram-live build lock is stuck (L1b bootstrap).");
      sleep(100);
      continue;
    }
    try {
      // Build it even when a bootstrap left it fresh: this lane proves the
      // build phase itself, inside the protected environment.
      execFileSync(process.execPath, [buildScript], { cwd: root, env, stdio: "inherit" });
      return;
    } finally {
      try {
        closeSync(handle);
      } catch {
        /* fd already closed */
      }
      try {
        unlinkSync(lockPath);
      } catch {
        /* already gone */
      }
    }
  }
}

let packed: PackedInstall;

// Packs the deliverable exactly as shipped, inside the protected
// environment; returns the tarball path and the exact packed file list.
function packTarball(destination: string, env: NodeJS.ProcessEnv): { tarball: string; packedPaths: string[] } {
  const raw = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", destination],
    { cwd: liveRoot, env, encoding: "utf8" },
  );
  const parsed = JSON.parse(raw) as [{ filename: string; files: { path: string }[] }];
  return {
    tarball: join(destination, parsed[0].filename),
    packedPaths: parsed[0].files.map((file) => file.path),
  };
}

function writePythonTripwires(binDir: string, marker: string): void {
  mkdirSync(binDir, { recursive: true });
  for (const name of ["python", "python3", "python2", "python2.7", "py"]) {
    const shim = join(binDir, name);
    const script = `#!/bin/sh\nprintf '%s %s\\n' "$0" "$*" >> ${JSON.stringify(marker)}\nexit 127\n`;
    writeFileShim(shim, script);
  }
}

function writeFileShim(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o755 });
  chmodSync(path, 0o755);
}

// Records the tripwire marker AFTER a phase completed; the check never
// precedes the phase it guards. A non-null marker carries the recorded
// Python command line — the forbidden-load trace.
function recordPhaseMarker(phaseTrace: PhaseMarker[], phase: string, pythonMarker: string): void {
  phaseTrace.push({
    phase,
    marker: existsSync(pythonMarker) ? readFileSync(pythonMarker, "utf8") : null,
  });
}

function expectNoPython(phaseTrace: PhaseMarker[]): void {
  for (const phase of phaseTrace) {
    expect(
      phase.marker,
      `Python was evaluated during the "${phase.phase}" phase (recorded tripwire trace: ${phase.marker ?? ""})`,
    ).toBeNull();
  }
}

// Runs one protected phase: an isolated child process with the tripwire PATH.
function runProtectedPhase(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): string {
  return execFileSync(command, args, { ...options, encoding: "utf8" });
}

// Protected child probe: imports all three public entries (., /contracts,
// /integration) from inside the install and reports the delivered surface.
const IMPORT_PROBE = [
  'import * as rootEntry from "@sentropic/engram-live";',
  'import * as contracts from "@sentropic/engram-live/contracts";',
  'import * as integration from "@sentropic/engram-live/integration";',
  "const report = {",
  "  rootKeys: Object.keys(rootEntry).sort(),",
  "  contractsKeys: Object.keys(contracts).sort(),",
  "  integrationKeys: Object.keys(integration).sort(),",
  "  hasFactory: typeof integration.createLiveFactory === \"function\" && typeof rootEntry.createLiveFactory === \"function\",",
  "  languages: contracts.ADVERTISED_LANGUAGES.slice().sort(),",
  "  policyVersion: contracts.POLICY_VERSION,",
  "};",
  "console.log(JSON.stringify(report));",
  "",
].join("\n");

// Protected child probe: runs the executable factory with fake ports and
// requires every capability to stay explicit unavailable — zero fact-sink
// writes, and an unknown capability throws.
const EXERCISE_PROBE = [
  'import * as integration from "@sentropic/engram-live/integration";',
  'import * as contracts from "@sentropic/engram-live/contracts";',
  "const factSinkCalls = [];",
  "const factory = integration.createLiveFactory({",
  "  ports: {",
  "    git: {},",
  "    filesystem: { readFileBytes: async (path) => { throw new Error(\"no filesystem access expected: \" + path); } },",
  "    clock: { now: () => 1700000000000 },",
  "    content: {},",
  "    factSink: { deliver: async (batch) => { factSinkCalls.push(batch); return { received: true, batchId: \"probe-batch\" }; } },",
  "    cache: {},",
  "    grammarRuntime: { loadLanguage: async () => { throw new Error(\"no grammar load expected\"); } },",
  "  },",
  "  declaration: {",
  "    tenant: \"local:probe-owner\",",
  "    principal: \"local:probe-principal\",",
  "    hostFingerprint: \"probe-fingerprint\",",
  "    identityUncertainty: [],",
  "    declarationId: \"decl:probe\",",
  "    cloneId: \"clone:probe\",",
  "    worktreeId: \"wt:probe\",",
  "    authorizedRoots: [\"/probe/worktree\"],",
  "    liveCapability: \"live\",",
  "    policyVersion: contracts.POLICY_VERSION,",
  "    declarationRevision: 1,",
  "  },",
  "});",
  "const capabilities = factory.describeCapabilities();",
  "let unknownCapabilityError = null;",
  "try {",
  "  await factory.runCapability(\"not-a-capability\");",
  "} catch (error) {",
  "  unknownCapabilityError = String(error && error.message ? error.message : error);",
  "}",
  "const refs = await factory.runCapability(\"refs\");",
  "const report = {",
  "  capabilityCount: capabilities.length,",
  "  allUnavailable: capabilities.every((capability) => capability.state === \"unavailable\"),",
  "  reasoned: capabilities.every((capability) => typeof capability.reason === \"string\" && capability.reason.length > 0),",
  "  plannedLots: capabilities.every((capability) => typeof capability.plannedLot === \"string\" && capability.plannedLot.length > 0),",
  "  refs: { state: refs.state, delivered: refs.delivered, reasonLength: refs.reason.length },",
  "  factSinkCalls: factSinkCalls.length,",
  "  unknownCapabilityError,",
  "};",
  "console.log(JSON.stringify(report));",
  "",
].join("\n");

// Protected child probe: the grammar matrix. Every advertised language loads
// its packaged WASM through an injected grammar runtime (test-local
// web-tree-sitter, resolved from the repository devDependency tree) and
// parses a smoke snippet; a tampered byte is rejected by the pinned digest;
// an absent WASM, an absent manifest, an invalid manifest and the inherited
// names "constructor"/"toString" all report explicit unavailable coverage.
const GRAMMAR_PROBE = [
  'import { createRequire } from "node:module";',
  'import { readFileSync } from "node:fs";',
  'import { join } from "node:path";',
  'import * as integration from "@sentropic/engram-live/integration";',
  'import * as contracts from "@sentropic/engram-live/contracts";',
  "const rootRequire = createRequire(process.argv[2]);",
  "const TreeSitter = rootRequire(\"web-tree-sitter\");",
  "const installedRoot = process.argv[3];",
  "const manifest = JSON.parse(readFileSync(join(installedRoot, \"grammar-manifest.json\"), \"utf8\"));",
  "const realRead = async (path) => new Uint8Array(readFileSync(path));",
  "const declaration = {",
  "  tenant: \"local:probe-owner\",",
  "  principal: \"local:probe-principal\",",
  "  hostFingerprint: \"probe-fingerprint\",",
  "  identityUncertainty: [],",
  "  declarationId: \"decl:probe\",",
  "  cloneId: \"clone:probe\",",
  "  worktreeId: \"wt:probe\",",
  "  authorizedRoots: [\"/probe/worktree\"],",
  "  liveCapability: \"live\",",
  "  policyVersion: contracts.POLICY_VERSION,",
  "  declarationRevision: 1,",
  "};",
  "const makeFactory = (filesystem) => integration.createLiveFactory({",
  "  ports: {",
  "    git: {},",
  "    filesystem,",
  "    clock: { now: () => 0 },",
  "    content: {},",
  "    factSink: { deliver: async () => ({ received: true, batchId: \"probe-batch\" }) },",
  "    cache: {},",
  "    grammarRuntime: { loadLanguage: (wasm) => TreeSitter.Language.load(new Uint8Array(wasm)) },",
  "  },",
  "  declaration,",
  "});",
  "const factory = makeFactory({ readFileBytes: realRead });",
  "await TreeSitter.Parser.init();",
  "const parser = new TreeSitter.Parser();",
  "const snippets = {",
  "  c: \"int main(void) { return 0; }\",",
  "  cpp: \"int main() { return 0; }\",",
  "  go: \"package main\\n\\nfunc main() {}\",",
  "  java: \"class Probe {}\",",
  "  javascript: \"const probe = 1;\",",
  "  php: \"<?php $probe = 1;\",",
  "  python: \"probe = 1\",",
  "  ruby: \"probe = 1\",",
  "  rust: \"fn main() {}\",",
  "  typescript: \"const probe: number = 1;\",",
  "  tsx: \"const probe = <div />;\",",
  "};",
  "const loaded = {};",
  "for (const language of contracts.ADVERTISED_LANGUAGES) {",
  "  const result = await factory.loadGrammar(language);",
  "  const coverage = factory.grammarCoverage(language);",
  "  let smoke = null;",
  "  if (result.state === \"available\") {",
  "    parser.setLanguage(result.grammar);",
  "    const tree = parser.parse(snippets[language] || \"1 + 1\");",
  "    smoke = tree === null ? null : tree.rootNode.type;",
  "  }",
  "  loaded[language] = {",
  "    state: result.state,",
  "    bytesSha256: result.bytesSha256,",
  "    coverageState: coverage.state,",
  "    smoke,",
  "    pinnedSha256: manifest.languages[language].sha256,",
  "  };",
  "}",
  "const manifestPath = join(installedRoot, \"grammar-manifest.json\");",
  "const tamperedFactory = makeFactory({ readFileBytes: async (path) => {",
  "  const bytes = readFileSync(path);",
  "  if (!path.includes(join(\"dist\", \"grammars\"))) return new Uint8Array(bytes);",
  "  const out = new Uint8Array(bytes.byteLength + 1);",
  "  out.set(bytes, 0);",
  "  out[out.byteLength - 1] = 0;",
  "  return out;",
  "} });",
  "const tampered = {};",
  "for (const language of contracts.ADVERTISED_LANGUAGES) {",
  "  const result = await tamperedFactory.loadGrammar(language);",
  "  tampered[language] = { state: result.state, reason: result.reason };",
  "}",
  "const absentWasmFactory = makeFactory({ readFileBytes: async (path) => {",
  "  if (path === manifestPath) return realRead(path);",
  "  const error = new Error(\"ENOENT: no such file or directory, open '\" + path + \"'\");",
  "  error.code = \"ENOENT\";",
  "  throw error;",
  "} });",
  "const absentWasm = await absentWasmFactory.loadGrammar(\"typescript\");",
  "const missingManifestFactory = makeFactory({ readFileBytes: async (path) => {",
  "  if (path !== manifestPath) return realRead(path);",
  "  const error = new Error(\"ENOENT: no such file or directory, open '\" + path + \"'\");",
  "  error.code = \"ENOENT\";",
  "  throw error;",
  "} });",
  "const missingManifest = await missingManifestFactory.loadGrammar(\"c\");",
  "const invalidManifestFactory = makeFactory({ readFileBytes: async (path) => {",
  "  if (path === manifestPath) return new TextEncoder().encode(\"this is not the manifest\");",
  "  return realRead(path);",
  "} });",
  "const invalidManifest = await invalidManifestFactory.loadGrammar(\"c\");",
  "const inherited = {};",
  "for (const name of [\"constructor\", \"toString\"]) {",
  "  const result = await factory.loadGrammar(name);",
  "  const coverage = factory.grammarCoverage(name);",
  "  inherited[name] = { state: result.state, reason: result.reason, coverageState: coverage.state, coverageReason: coverage.reason };",
  "}",
  "const absent = {};",
  "for (const name of [\"lua\", \"julia\", \"not-a-language\"]) {",
  "  const result = await factory.loadGrammar(name);",
  "  const coverage = factory.grammarCoverage(name);",
  "  absent[name] = { state: result.state, reason: result.reason, coverageState: coverage.state, coverageReason: coverage.reason };",
  "}",
  "console.log(JSON.stringify({ loaded, tampered, absentWasm, missingManifest, invalidManifest, inherited, absent }));",
  "",
].join("\n");

// Protected child probe: the canonical identity derivation (L6a) must be
// importable from the PUBLIC entries of the installed package — h2a and
// cluster-mesh call exactly this surface, never an internal path. The
// probe derives clone/worktree/declaration identities through
// @sentropic/engram-live/integration and "." and proves determinism and
// the per-worktree declaration split.
const DERIVATION_PROBE = [
  'import * as rootEntry from "@sentropic/engram-live";',
  'import * as integration from "@sentropic/engram-live/integration";',
  'const components = {',
  '  hostScope: "host:probe",',
  '  commonDirRealpath: "/srv/probe/.git",',
  '  commonDirProjectFingerprint: "probe-fingerprint",',
  "  identityUncertainty: [],",
  '  oidAlgorithm: "sha1",',
  "};",
  'const deriveNames = ["deriveCloneIdentity", "deriveWorktreeIdentity", "deriveDeclarationIdentity"];',
  "const deriveTypes = deriveNames.map((name) => typeof integration[name]);",
  "const rootDerives = deriveNames.every((name) => typeof rootEntry[name] === \"function\");",
  "const clone = integration.deriveCloneIdentity(components);",
  "const cloneAgain = integration.deriveCloneIdentity(components);",
  "const worktree = integration.deriveWorktreeIdentity({",
  '  hostScope: "host:probe",',
  "  clone,",
  '  worktreePath: "/work/probe",',
  '  gitDir: "/srv/probe/.git",',
  '  worktreeFingerprint: "ws:probe",',
  "  identityUncertainty: [],",
  "});",
  "const sibling = integration.deriveWorktreeIdentity({",
  '  hostScope: "host:probe",',
  "  clone,",
  '  worktreePath: "/work/probe-wt",',
  '  gitDir: "/srv/probe/.git/worktrees/wt",',
  '  worktreeFingerprint: "ws:probe",',
  "  identityUncertainty: [],",
  "});",
  'const declaration = integration.deriveDeclarationIdentity({ hostScope: "host:probe", clone, worktree });',
  'const declarationAgain = integration.deriveDeclarationIdentity({ hostScope: "host:probe", clone, worktree });',
  "const report = {",
  "  deriveTypes,",
  "  rootDerives,",
  "  deterministicClone: cloneAgain.cloneId === clone.cloneId,",
  "  deterministicDeclaration: declarationAgain.declarationId === declaration.declarationId,",
  '  cloneIdPrefixed: clone.cloneId.startsWith("clone:"),',
  '  worktreeIdPrefixed: worktree.worktreeId.startsWith("wt:"),',
  '  declarationIdPrefixed: declaration.declarationId.startsWith("decl:"),',
  "  declarationBindsTriangle:",
  "    declaration.cloneId === clone.cloneId && declaration.worktreeId === worktree.worktreeId,",
  "  distinctWorktrees: sibling.worktreeId !== worktree.worktreeId,",
  "};",
  "console.log(JSON.stringify(report));",
  "",
].join("\n");

// Protected child probe (mutation canary): imports and exercises the
// delivered surface FIRST, then attempts to evaluate Python through
// node:child_process — the exact escape the review demonstrated. Inside
// the shared protected environment the tripwire shims must intercept every
// attempt: nothing is executed, the call fails with exit 127 and the
// invocation is recorded in the marker.
// Packs and installs the deliverable exactly as shipped, inside the SAME
// protected environment (tmpRoot/tripwireBin) the build phase already ran
// in: pack, install and every later probe phase share one tripwire
// directory and one marker, so no phase can fall back to the system PATH.
function packAndInstall(
  env: NodeJS.ProcessEnv,
  pythonMarker: string,
  phaseTrace: PhaseMarker[],
  tmpRoot: string,
  tripwireBin: string,
): PackedInstall {
  const { tarball, packedPaths } = packTarball(tmpRoot, env);
  recordPhaseMarker(phaseTrace, "pack", pythonMarker);
  const installDir = join(tmpRoot, "install");
  mkdirSync(installDir);
  writeFileSync(join(installDir, "package.json"), `${JSON.stringify({ name: "live-install-probe", version: "0.0.0", private: true }, null, 2)}\n`);
  // Owner 2026-10-14: no npm install/ci, even in fixtures. Verify the exact tarball locally.
  const packageDir = join(installDir, "node_modules", "@sentropic", "engram-live");
  mkdirSync(packageDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", packageDir, "--strip-components=1"], { cwd: installDir, env });
  recordPhaseMarker(phaseTrace, "install", pythonMarker);
  // Protected child probes: they import the three public entries and
  // exercise the factory inside the tripwire environment; the canary probe
  // additionally attempts a Python call, which the tripwires must reject.
  writeFileShim(join(installDir, "import-probe.mjs"), IMPORT_PROBE);
  writeFileShim(join(installDir, "exercise-probe.mjs"), EXERCISE_PROBE);
  writeFileShim(join(installDir, "grammar-probe.mjs"), GRAMMAR_PROBE);
  writeFileShim(join(installDir, "derivation-probe.mjs"), DERIVATION_PROBE);

  return { tmpRoot, installDir, tripwireBin, pythonMarker, tarball, packedPaths, phaseTrace };
}

function listFilesRecursively(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...listFilesRecursively(join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

interface ImportReport {
  rootKeys: string[];
  contractsKeys: string[];
  integrationKeys: string[];
  hasFactory: boolean;
  languages: string[];
  policyVersion: string;
}

interface ExerciseReport {
  capabilityCount: number;
  allUnavailable: boolean;
  reasoned: boolean;
  plannedLots: boolean;
  refs: { state: string; delivered: boolean; reasonLength: number };
  factSinkCalls: number;
  unknownCapabilityError: string | null;
}

interface GrammarReport {
  loaded: Record<string, { state: string; bytesSha256?: string; coverageState: string; smoke: string | null; pinnedSha256: string }>;
  tampered: Record<string, { state: string; reason?: string }>;
  absentWasm: { state: string; reason?: string };
  missingManifest: { state: string; reason?: string };
  invalidManifest: { state: string; reason?: string };
  inherited: Record<string, { state: string; reason?: string; coverageState: string; coverageReason: string }>;
  absent: Record<string, { state: string; reason?: string; coverageState: string; coverageReason: string }>;
}

interface DerivationReport {
  deriveTypes: string[];
  rootDerives: boolean;
  deterministicClone: boolean;
  deterministicDeclaration: boolean;
  cloneIdPrefixed: boolean;
  worktreeIdPrefixed: boolean;
  declarationIdPrefixed: boolean;
  declarationBindsTriangle: boolean;
  distinctWorktrees: boolean;
}

// The protected environment every phase runs in — ONE environment, created
// once and reused by every phase: the tripwire directory is first on PATH,
// so any python/python2/python3/python2.7/py invocation is recorded by the
// shim and fails with exit 127. A missing tripwire directory would silently
// hand control back to the system PATH, so it is a hard error, never a
// silent degradation.
function tripwireEnv(binDir: string): NodeJS.ProcessEnv {
  if (!existsSync(binDir)) {
    throw new Error(`protected environment is broken: tripwire directory ${binDir} does not exist`);
  }
  return { ...process.env, PATH: `${binDir}${process.env.PATH ? `:${process.env.PATH}` : ""}` };
}

describe("live package", () => {
  // Heavyweight setup (tsc build + npm pack + offline install in an
  // isolated tmpRoot): needs headroom under parallel gate load.
  beforeAll(() => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "engram-live-package-"));
    const binDir = join(tmpRoot, "tripwire-bin");
    const pythonMarker = join(tmpRoot, "python-invoked.marker");
    writePythonTripwires(binDir, pythonMarker);
    const env = tripwireEnv(binDir);
    const phaseTrace: PhaseMarker[] = [];
    // Phase 1: build the deliverable inside the protected environment.
    runProtectedBuild(env);
    recordPhaseMarker(phaseTrace, "build", pythonMarker);
    // Phases 2-3: pack exactly as delivered, install the real tarball
    // offline — both protected, markers recorded after each phase, inside
    // the SAME protected environment (one tmpRoot, one tripwire directory,
    // one marker for every phase).
    packed = packAndInstall(env, pythonMarker, phaseTrace, tmpRoot, binDir);
  }, 120000);

  it("installing and importing the delivered live surface without Python evaluates no database driver or root CLI", async () => {
    // No Python evaluated: the build, pack and install phases each ran in
    // an isolated child with the tripwire PATH, and every marker was
    // verified AFTER its phase.
    expectNoPython(packed.phaseTrace);

    // The install closure contains exactly the neutral package: no database
    // driver package, no root CLI package, no model SDK, no native addon.
    const modulesRoot = join(packed.installDir, "node_modules");
    // ".package-lock.json" is npm's own lockfile marker, not an installed
    // package; every real entry must be the neutral package's scope.
    expect(readdirSync(modulesRoot).filter((entry) => !entry.startsWith(".")).sort()).toEqual(["@sentropic"]);
    expect(readdirSync(join(modulesRoot, "@sentropic")).sort()).toEqual(["engram-live"]);
    const installedRoot = join(modulesRoot, "@sentropic", "engram-live");
    const installedFiles = listFilesRecursively(installedRoot).sort();
    expect(installedFiles.some((file) => /\.(py|pyc|pyo|node|gyp|tar|gz)$/i.test(file))).toBe(false);
    // The installed tree is exactly the packed surface — nothing more.
    expect(installedFiles).toEqual(packed.packedPaths.slice().sort());
    expect(installedFiles).toContain("dist/integration.js");
    expect(installedFiles).toContain("dist/contracts.js");
    expect(installedFiles).toContain("grammar-manifest.json");

    // The delivered metadata carries no install script, dependency or CLI,
    // pins the exact exports targets, and bounds the advertised support to
    // the qualified runtimes and platform.
    const installedPackageJson = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")) as Record<string, unknown>;
    expect(installedPackageJson.name).toBe("@sentropic/engram-live");
    expect(installedPackageJson.dependencies).toBeUndefined();
    expect(installedPackageJson.optionalDependencies).toBeUndefined();
    expect(installedPackageJson.peerDependencies).toBeUndefined();
    expect(installedPackageJson.bin).toBeUndefined();
    const scripts = installedPackageJson.scripts as Record<string, unknown> | undefined;
    for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
      expect(scripts?.[lifecycle]).toBeUndefined();
    }
    expect(installedPackageJson.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./contracts": { types: "./dist/contracts.d.ts", import: "./dist/contracts.js" },
      "./integration": { types: "./dist/integration.d.ts", import: "./dist/integration.js" },
    });
    expect(installedPackageJson.engines).toEqual({ node: "^20.0.0 || ^22.0.0 || ^24.0.0" });
    expect(installedPackageJson.os).toEqual(["linux"]);

    // Phase 4: import all three public entries (., /contracts, /integration)
    // from inside the install, in the protected child process; the marker is
    // verified after the imports — never before them.
    const importOutput = runProtectedPhase(process.execPath, ["import-probe.mjs"], {
      cwd: packed.installDir,
      env: tripwireEnv(packed.tripwireBin),
    });
    recordPhaseMarker(packed.phaseTrace, "import", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const report = JSON.parse(importOutput) as ImportReport;
    expect(report.hasFactory).toBe(true);
    expect(report.integrationKeys).toContain("createLiveFactory");
    expect(report.contractsKeys).toContain("ADVERTISED_LANGUAGES");
    expect(report.rootKeys).toContain("createLiveFactory");
    expect(report.rootKeys).toContain("ADVERTISED_LANGUAGES");
    expect(report.policyVersion.length).toBeGreaterThan(0);
    const manifestLanguages = Object.keys(
      (JSON.parse(readFileSync(join(installedRoot, "grammar-manifest.json"), "utf8")) as { languages: Record<string, unknown> }).languages,
    ).sort();
    expect(report.languages).toEqual(manifestLanguages);

    // Phase 5: exercise the executable factory with fake ports, still inside
    // the protected child; every capability must stay explicit unavailable.
    const exerciseOutput = runProtectedPhase(process.execPath, ["exercise-probe.mjs"], {
      cwd: packed.installDir,
      env: tripwireEnv(packed.tripwireBin),
    });
    recordPhaseMarker(packed.phaseTrace, "exercise", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const exercise = JSON.parse(exerciseOutput) as ExerciseReport;
    expect(exercise.capabilityCount).toBeGreaterThan(0);
    expect(exercise.allUnavailable).toBe(true);
    expect(exercise.reasoned).toBe(true);
    expect(exercise.plannedLots).toBe(true);
    expect(exercise.refs.state).toBe("unavailable");
    expect(exercise.refs.delivered).toBe(false);
    expect(exercise.refs.reasonLength).toBeGreaterThan(0);
    expect(exercise.unknownCapabilityError ?? "").toMatch(/unknown capability/i);
    expect(exercise.factSinkCalls).toBe(0);
  });

  it("every advertised language loads its packaged WASM and an absent grammar reports unavailable coverage", () => {
    // Phase 6: the grammar matrix runs entirely inside a protected child
    // process (tripwire PATH); the marker is verified after the phase.
    const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
    const output = runProtectedPhase(
      process.execPath,
      ["grammar-probe.mjs", rootPackageJson, installedRoot],
      { cwd: packed.installDir, env: tripwireEnv(packed.tripwireBin) },
    );
    recordPhaseMarker(packed.phaseTrace, "grammar", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);

    const report = JSON.parse(output) as GrammarReport;
    const manifest = JSON.parse(readFileSync(join(installedRoot, "grammar-manifest.json"), "utf8")) as {
      languages: Record<string, { file: string; sha256: string }>;
    };
    // Every advertised language: available, pinned to the packaged digest,
    // covered, and able to parse its smoke snippet.
    for (const language of Object.keys(manifest.languages)) {
      const entry = report.loaded[language];
      expect(entry, `grammar probe is missing language "${language}"`).toBeDefined();
      expect(entry.state).toBe("available");
      expect(entry.bytesSha256).toBe(manifest.languages[language].sha256);
      expect(entry.pinnedSha256).toBe(manifest.languages[language].sha256);
      expect(entry.coverageState).toBe("current");
      expect(entry.smoke, `grammar for "${language}" failed to parse its smoke snippet`).not.toBeNull();
    }
    expect(Object.keys(report.loaded).sort()).toEqual(Object.keys(manifest.languages).sort());
    // A tampered byte is rejected by the pinned digest, never silently loaded.
    for (const language of Object.keys(report.tampered)) {
      expect(report.tampered[language].state).toBe("unavailable");
      expect(report.tampered[language].reason ?? "").toMatch(/digest/);
    }
    // An absent WASM (ENOENT on the filesystem port) is explicit, and the
    // reason names the language and the failing port.
    expect(report.absentWasm.state).toBe("unavailable");
    expect(report.absentWasm.reason ?? "").toContain("typescript");
    expect(report.absentWasm.reason ?? "").toMatch(/filesystem port/);
    // Absent and invalid manifests degrade to explicit unavailability.
    expect(report.missingManifest.state).toBe("unavailable");
    expect(report.missingManifest.reason ?? "").toMatch(/manifest/);
    expect(report.missingManifest.reason ?? "").toMatch(/filesystem port/);
    expect(report.invalidManifest.state).toBe("unavailable");
    expect(report.invalidManifest.reason ?? "").toMatch(/manifest/);
    expect(report.invalidManifest.reason ?? "").toMatch(/is not valid JSON/);
    // Inherited property names are refused, not resolved through the
    // prototype chain.
    for (const name of ["constructor", "toString"]) {
      const inherited = report.inherited[name];
      expect(inherited.state).toBe("unavailable");
      expect(inherited.reason ?? "").toContain(name);
      expect(inherited.coverageState).toBe("unavailable");
      expect(inherited.coverageReason ?? "").toContain(name);
    }
    // Absent grammars (repository grammars not packaged, unknown names)
    // report unavailable coverage that names the missing language.
    for (const name of ["lua", "julia", "not-a-language"]) {
      const absent = report.absent[name];
      expect(absent.state).toBe("unavailable");
      expect(absent.reason ?? "").toContain(name);
      expect(absent.coverageState).toBe("unavailable");
      expect(absent.coverageReason ?? "").toContain(name);
    }
  });

  it("the canonical identity derivation is exported by the public entries of the built package", () => {
    // A protected child imports the derivation from the PUBLIC entries
    // (., /integration) of the installed package — never from an internal
    // path — and derives every opaque id through exactly that surface.
    const output = runProtectedPhase(process.execPath, ["derivation-probe.mjs"], {
      cwd: packed.installDir,
      env: tripwireEnv(packed.tripwireBin),
    });
    recordPhaseMarker(packed.phaseTrace, "derivation", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const report = JSON.parse(output) as DerivationReport;
    expect(report.deriveTypes).toEqual(["function", "function", "function"]);
    expect(report.rootDerives).toBe(true);
    expect(report.deterministicClone).toBe(true);
    expect(report.deterministicDeclaration).toBe(true);
    expect(report.cloneIdPrefixed).toBe(true);
    expect(report.worktreeIdPrefixed).toBe(true);
    expect(report.declarationIdPrefixed).toBe(true);
    expect(report.declarationBindsTriangle).toBe(true);
    expect(report.distinctWorktrees).toBe(true);
  });

  it("L5 source audit and packaged grammar inventory; reused-extraction delivery remains unverified (A6)", () => {
    // L5 GUARD (plan/09 L5): the reused root extraction exposes the injected
    // host seam instead of a source-root default, and the isolated build
    // audits it. No src/* import here: this file stays inside the neutral
    // test closure; the runtime seam behavior is covered by
    // tests/live-code-version.test.ts.
    const extractSource = readFileSync(join(root, "src", "extract.ts"), "utf8");
    // Boundary-precise markers: a bare "cacheStore" substring would also
    // match a renamed field, so the guard requires the exact declarations.
    for (const symbol of ["LiveExtractionPorts", "readonly cacheStore?:", "readonly grammarWasm?:", "liveOperationScope"]) {
      expect(extractSource, `reused extraction exposes the injected seam "${symbol}"`).toContain(symbol);
    }
    const cacheSource = readFileSync(join(root, "src", "cache.ts"), "utf8");
    for (const symbol of ["InjectedCacheStore", "liveContentKey"]) {
      expect(cacheSource, `reused cache exposes the injected seam "${symbol}"`).toContain(symbol);
    }
    // Isolated-build audit, fast mode (no compile): exit 0 and names the
    // audited neutral modules.
    let auditOutput: string;
    try {
      auditOutput = execFileSync(process.execPath, [buildScript, "--audit-only"], { cwd: root, encoding: "utf8" });
    } catch (error) {
      throw new Error(`L5 isolated-build audit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const name of ["analysis-cache", "code-analysis", "comparisons"]) {
      expect(auditOutput, `isolated-build audit covers ${name}`).toContain(name);
    }
    // No root install closure on the reused path: the neutral L5 modules
    // carry no source-root, driver, loader or model edge.
    for (const name of ["analysis-cache.ts", "code-analysis.ts", "comparisons.ts"]) {
      const content = readFileSync(join(liveRoot, name), "utf8");
      for (const edge of ["../src/", "node:sqlite", "node:module", "createRequire", "better-sqlite3", "mistral-ocr"]) {
        expect(content, `${name} carries no root-closure edge "${edge}"`).not.toContain(edge);
      }
    }
    // Only verified grammar assets are bundled: every dist grammar file is
    // pinned by the manifest, no unpinned bundled code.
    const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
    const manifest = JSON.parse(readFileSync(join(installedRoot, "grammar-manifest.json"), "utf8")) as {
      languages: Record<string, { file: string }>;
    };
    const pinnedFiles = new Set(Object.values(manifest.languages).map((entry) => entry.file));
    for (const file of readdirSync(join(installedRoot, "dist", "grammars"))) {
      expect(pinnedFiles.has(file), `bundled grammar asset "${file}" is pinned by the manifest`).toBe(true);
    }
    expect(pinnedFiles.size).toBeGreaterThan(0);
  });

  it("Python tripwire declarations are fail closed without launching an interpreter", () => {
    // Owner forbids interpreter-name canaries. This checks declarations only;
    // runtime interception of a forbidden launch is deliberately not claimed.
    expectNoPython(packed.phaseTrace);
    for (const name of ["python", "python3", "python2", "python2.7", "py"]) {
      const script = readFileSync(join(packed.tripwireBin, name), "utf8");
      expect(script).toContain("exit 127");
      expect(script).toContain(packed.pythonMarker);
    }
  });
});
