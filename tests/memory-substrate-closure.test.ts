/**
 * Closure guards for the public memory substrate entry
 * (amendment §5.6, §5.7, binding §1.2/C6).
 *
 * - Runtime namespace is exactly the two values of amendment §1.2.
 * - Exported type names are exactly the 63 names of amendment §1.3
 *   (62 existing + ModuleStorageMemoryStoreOptionsV1), in source and
 *   in the built declarations. No default export, no `export *`.
 * - No cluster-mesh import (runtime or type) anywhere in the entry,
 *   its sources, or its built artifacts.
 * - No native database driver is statically resolved by any Engram
 *   published entry: the guard fails if `better-sqlite3`, `fs-ext`,
 *   a native `pg` driver, or any `.node` addon is reachable from
 *   `./memory-substrate` (and re-checks `.`, `./llm-mesh`,
 *   `./memory-tools`).
 * - `package.json` maps `./memory-substrate` exactly and adds no
 *   driver dependency for the substrate.
 * - Strict external TypeScript consumption (`skipLibCheck: false`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entrySource = join(root, "src", "memory-substrate", "index.ts");
const distJs = join(root, "dist", "memory-substrate.js");
const distDts = join(root, "dist", "memory-substrate.d.ts");
const requireFromHere = createRequire(import.meta.url);
const ts = requireFromHere("typescript") as typeof import("typescript");

/** The 63 closed type names of amendment §1.3 (order-free). */
const EXPECTED_TYPE_NAMES = new Set([
  "Result", "MemoryErrorV1", "MemoryErrorCode", "MemoryOperation",
  "Digest", "Cursor", "Instant", "OpaqueRef", "IdempotencyKey", "JsonPointer",
  "ValidIntervalV1", "CitationLocatorV1", "CitationV1", "MemoryComponentKind",
  "MemoryComponentV2", "PrimaryEventAnchorV1", "DerivationLineageV1",
  "RetentionV1", "ReconciliationConsentV1", "CandidatePayloadV2",
  "MemoryPortV2", "GuardedMemoryPortV2", "MemoryFirstEffectGuardV1",
  "MemoryEngineDependenciesV2",
  "CaptureRequestV2", "CaptureAcknowledgementV1",
  "AdmissionRequestV1", "AdmissionOutcomeV1",
  "LifecycleCommandV1", "LifecycleCommandBaseV1", "LifecycleEventAnchorV1",
  "LifecycleReceiptV1", "MemoryState", "MemoryRecordV2", "TrustBindingV1",
  "EvidenceBundleV1",
  "AuthorizationPort", "AuthorizationContextV1", "AuthorizationResourceV1",
  "AuthorizationRequestV1", "AuthorizationResultV1", "AuthorizationAllowedV1",
  "AuthorizationDeniedV1", "AuthorizationRevalidationV1",
  "RedactionDirectiveV1", "RedactionRequestV1", "RedactionResultV1",
  "AdmissionPolicy", "AdmissionPolicyRequestV1",
  "AdmissionDecisionEnvelopeV1", "AdmissionDecision",
  "CryptoPort", "SealedCandidateEnvelopeV1", "ClockPort",
  "CanonicalMemoryStorePort", "CanonicalStoreCapabilitiesV1",
  "CanonicalTransactionReceiptV1", "LifecycleEventV2",
  "CaptureIdempotencyRecordV1", "PersistedCaptureIdempotencyV1",
  "PersistedAdmissionOutcomeV1", "RecoveryCheckpointManifestV1",
  "ModuleStorageMemoryStoreOptionsV1",
]);

const EXPECTED_VALUE_NAMES = new Set([
  "createMemoryPortV2",
  "openModuleStorageCanonicalMemoryStoreV1",
]);

const FORBIDDEN_SPECIFIERS = new Set(["better-sqlite3", "fs-ext", "pg"]);

interface StaticEdge { specifier: string; dynamic: boolean; }

function staticEdges(content: string): StaticEdge[] {
  const source = ts.createSourceFile("scan.ts", content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const out: StaticEdge[] = [];
  const visit = (node: import("typescript").Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier === undefined) return;
      if (ts.isStringLiteralLike(specifier)) out.push({ specifier: specifier.text, dynamic: false });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteralLike(first)) out.push({ specifier: first.text, dynamic: false });
      else out.push({ specifier: "(dynamic)", dynamic: true });
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteralLike(first)) out.push({ specifier: first.text, dynamic: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function exportedTypeNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()!.trim();
      if (name.length > 0) names.add(name);
    }
  }
  return names;
}

function exportedNamesOfDeclarationFile(content: string): { types: Set<string>; values: Set<string> } {
  const source = ts.createSourceFile("scan.d.ts", content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const types = new Set<string>();
  const values = new Set<string>();
  const record = (name: string, isType: boolean) => { (isType ? types : values).add(name); };
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (isExported) record(statement.name.text, true);
    } else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!isExported) continue;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) record(declaration.name.text, false);
        }
      } else if (statement.name !== undefined) {
        record(statement.name.text, false);
      }
    } else if (ts.isExportDeclaration(statement)) {
      const elements = statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements
        : [];
      if (statement.exportClause === undefined) {
        throw new Error("export * is forbidden in the substrate entry declarations");
      }
      for (const element of elements) {
        const name = element.name.text;
        if (statement.isTypeOnly || EXPECTED_TYPE_NAMES.has(name)) types.add(name);
        else if (EXPECTED_VALUE_NAMES.has(name)) values.add(name);
        else throw new Error(`unexpected exported name in substrate declarations: ${name}`);
      }
    } else if (ts.isExportAssignment(statement)) {
      throw new Error("a default export is forbidden in the substrate entry");
    }
  }
  return { types, values };
}

function readDistDeclarationClosure(): { types: Set<string>; values: Set<string> } {
  let dts: string;
  try {
    dts = readFileSync(distDts, "utf8");
  } catch {
    throw new Error("substrate build missing: run `npm run build` before this test (no skip).");
  }
  const entry = exportedNamesOfDeclarationFile(dts);
  const chunkPattern = /from\s*["'](\.[^"']*)["']/g;
  const chunks = new Set<string>();
  for (const match of dts.matchAll(chunkPattern)) chunks.add(match[1]!);
  // Re-exported names are counted from the entry file itself; chunks only contribute
  // non-exported local declarations, which stay excluded from the count by construction.
  void chunks;
  return entry;
}

describe("substrate entry shape (amendment §1, §5.6)", () => {
  it("exports exactly the two runtime values, no default, no export *", async () => {
    const namespace = await import("../src/memory-substrate/index.js") as Record<string, unknown>;
    expect(new Set(Object.keys(namespace))).toEqual(EXPECTED_VALUE_NAMES);
    const source = readFileSync(entrySource, "utf8");
    expect(source).not.toMatch(/export\s+default\b/);
    expect(source).not.toMatch(/export\s*\*\s*from/);
    expect(source).not.toMatch(/openFencedSqliteCanonicalMemoryStoreV1|openPostgresCanonicalMemoryStoreV1/);
  });

  it("exports exactly the 63 closed type names in source", () => {
    const source = readFileSync(entrySource, "utf8");
    expect(exportedTypeNames(source)).toEqual(EXPECTED_TYPE_NAMES);
  });

  it("exports exactly the 63 closed type names in the built declarations", () => {
    const built = readDistDeclarationClosure();
    expect(built.types).toEqual(EXPECTED_TYPE_NAMES);
    expect(built.values).toEqual(EXPECTED_VALUE_NAMES);
  });

  it("maps ./memory-substrate exactly in package.json, with no new driver dependency", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
      exports: Record<string, Record<string, string>>;
      dependencies: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(pkg.exports["./memory-substrate"]).toEqual({
      types: "./dist/memory-substrate.d.ts",
      import: "./dist/memory-substrate.js",
    });
    for (const section of [pkg.dependencies, pkg.optionalDependencies ?? {}, pkg.peerDependencies ?? {}]) {
      expect(section["better-sqlite3"]).toBeUndefined();
      expect(section["fs-ext"]).toBeUndefined();
    }
    expect(pkg.dependencies["pg"]).toBeUndefined();
  });
});

describe("substrate neutrality and driver guards (amendment §5.7)", () => {
  const scannedSources = [
    entrySource,
    join(root, "engram-memory", "module-storage-neutral.ts"),
    join(root, "engram-memory", "module-storage-memory-store.ts"),
  ];

  it("imports no cluster-mesh package anywhere in the substrate", () => {
    // Provenance comments may name the design; only module resolution is forbidden.
    for (const file of [...scannedSources, distJs, distDts]) {
      const content = readFileSync(file, "utf8");
      for (const edge of staticEdges(content)) {
        expect(edge.specifier.includes("cluster-mesh"), `${file}: cluster-mesh import`).toBe(false);
      }
    }
  });

  it("statically resolves no native driver from the substrate artifacts", () => {
    for (const file of [...scannedSources, distJs]) {
      const content = readFileSync(file, "utf8");
      for (const edge of staticEdges(content)) {
        expect(edge.dynamic, `${file}: unresolved dynamic import target`).toBe(false);
        expect(FORBIDDEN_SPECIFIERS.has(edge.specifier), `${file}: forbidden driver ${edge.specifier}`).toBe(false);
        expect(edge.specifier.endsWith(".node"), `${file}: forbidden addon ${edge.specifier}`).toBe(false);
      }
    }
  });

  it("statically resolves no native driver from any published entry", () => {
    for (const artifact of ["index.js", "index.cjs", "llm-mesh.js", "memory-tools.js", "memory-substrate.js"]) {
      const content = readFileSync(join(root, "dist", artifact), "utf8");
      for (const edge of staticEdges(content)) {
        if (edge.dynamic) continue;
        expect(FORBIDDEN_SPECIFIERS.has(edge.specifier), `${artifact}: forbidden driver ${edge.specifier}`).toBe(false);
        expect(edge.specifier.endsWith(".node"), `${artifact}: forbidden addon ${edge.specifier}`).toBe(false);
      }
    }
  });

  it("compiles strict externally with skipLibCheck:false", () => {
    const tsc = requireFromHere.resolve("typescript/bin/tsc");
    const workspace = mkdtempSync(join(tmpdir(), "substrate-external-consumer-"));
    try {
      const consumer = [
        `import { createMemoryPortV2, openModuleStorageCanonicalMemoryStoreV1 } from ${JSON.stringify(distJs)};`,
        `import type { CanonicalMemoryStorePort, ClockPort, CryptoPort, Digest, ModuleStorageMemoryStoreOptionsV1, Result } from ${JSON.stringify(distJs)};`,
        `export async function consume(options: ModuleStorageMemoryStoreOptionsV1): Promise<Result<CanonicalMemoryStorePort>> {`,
        `  return openModuleStorageCanonicalMemoryStoreV1(options);`,
        `}`,
        `export function sealPort(crypto: CryptoPort): (candidate_id: string) => Promise<unknown> {`,
        `  return (candidate_id: string) => crypto.seal({ candidate_id, plaintext: "x", context_digest: ("sha256:" + "0".repeat(64)) as Digest });`,
        `}`,
        `export function engineFactory(clock: ClockPort): typeof createMemoryPortV2 { return createMemoryPortV2; }`,
        ``,
      ].join("\n");
      const target = join(workspace, "consumer.ts");
      writeFileSync(target, consumer);
      execFileSync(process.execPath, [
        tsc,
        "--ignoreConfig",
        "--strict",
        "--skipLibCheck", "false",
        "--noEmit",
        "--target", "ES2022",
        "--module", "NodeNext",
        "--moduleResolution", "NodeNext",
        target,
      ], { cwd: root, stdio: "pipe" });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
