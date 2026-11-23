import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as engramMemory from "../engram-memory/index.js";
import type {
  ActivityEvidenceSource,
  AuthorizationAllowedV1,
  AuthorizationPort,
  AuthorizationRequestV1,
  AuthorizationRevalidationV1,
  CandidatePayloadV2,
  CryptoPort,
  Digest,
  MemoryPortV2,
  MemoryRecordV2,
  RedactionDirectiveV1,
  RedactionRequestV1,
  RedactionResultV1,
  Result,
  RetentionV1,
  SessionFrontCommitV1,
  SessionFrontScopeV1,
  SessionFrontStoreV1,
  SessionFrontTransactionV1,
} from "../engram-memory/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src");
const printer = ts.createPrinter({ removeComments: true });

interface ModuleEdge {
  readonly from: string;
  readonly specifier: string;
  readonly kind: "import" | "export" | "dynamic-import" | "import-type" | "import-equals" | "require";
}

interface UnresolvedDynamicCall {
  readonly from: string;
  readonly kind: "dynamic-import" | "require";
  readonly expression: string;
}

interface CollectedSpecifiers {
  readonly edges: ModuleEdge[];
  readonly unresolvedDynamic: UnresolvedDynamicCall[];
}

function toRepoPath(absPath: string): string {
  return relative(ROOT, absPath).split("\\").join("/");
}

function parseSource(relPath: string): ts.SourceFile {
  const absPath = resolve(ROOT, relPath);
  const text = readFileSync(absPath, "utf8");
  return ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function printNode(node: ts.Node, sf: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, " ").trim();
}

function collectSpecifiersFromSource(sf: ts.SourceFile, fromRel: string): CollectedSpecifiers {
  const edges: ModuleEdge[] = [];
  const unresolvedDynamic: UnresolvedDynamicCall[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ from: fromRel, specifier: node.moduleSpecifier.text, kind: "import" });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ from: fromRel, specifier: node.moduleSpecifier.text, kind: "export" });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expr = node.moduleReference.expression;
      if (ts.isStringLiteralLike(expr)) {
        edges.push({ from: fromRel, specifier: expr.text, kind: "import-equals" });
      } else {
        unresolvedDynamic.push({ from: fromRel, kind: "require", expression: expr.getText(sf) });
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      edges.push({ from: fromRel, specifier: node.argument.literal.text, kind: "import-type" });
    } else if (ts.isCallExpression(node)) {
      const first = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (first && ts.isStringLiteralLike(first)) {
          edges.push({ from: fromRel, specifier: first.text, kind: "dynamic-import" });
        } else {
          unresolvedDynamic.push({
            from: fromRel,
            kind: "dynamic-import",
            expression: first ? first.getText(sf) : "",
          });
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        if (first && ts.isStringLiteralLike(first)) {
          edges.push({ from: fromRel, specifier: first.text, kind: "require" });
        } else {
          unresolvedDynamic.push({
            from: fromRel,
            kind: "require",
            expression: first ? first.getText(sf) : "",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { edges, unresolvedDynamic };
}

function resolveLocalModule(
  fromRel: string,
  specifier: string,
  hasFile: (relPath: string) => boolean = (relPath) => existsSync(resolve(ROOT, relPath)),
): string | null {
  if (!specifier.startsWith(".")) return null;
  const baseDir = posix.dirname(fromRel);
  const joined = posix.normalize(posix.join(baseDir, specifier));
  const stem = joined.replace(/\.(?:[cm]?js|[cm]?ts|tsx)$/, "");
  const candidates = [
    `${stem}.ts`,
    `${stem}.mts`,
    `${stem}.cts`,
    `${stem}.tsx`,
    `${stem}.js`,
    `${stem}/index.ts`,
    `${stem}/index.js`,
  ];
  for (const candidate of candidates) {
    if (hasFile(candidate)) return candidate;
  }
  return joined;
}

function walkLocalClosure(
  entryRel: string,
  virtualFiles?: ReadonlyMap<string, string>,
): {
  readonly visited: readonly string[];
  readonly localEdges: ReadonlyArray<{ readonly from: string; readonly to: string; readonly kind: ModuleEdge["kind"] }>;
  readonly externalEdges: ReadonlyArray<ModuleEdge>;
  readonly unresolvedDynamic: ReadonlyArray<UnresolvedDynamicCall>;
} {
  const visited = new Set<string>();
  const queue: string[] = [entryRel];
  const localEdges: Array<{ readonly from: string; readonly to: string; readonly kind: ModuleEdge["kind"] }> = [];
  const externalEdges: ModuleEdge[] = [];
  const unresolvedDynamic: UnresolvedDynamicCall[] = [];
  const hasFile = (relPath: string): boolean =>
    virtualFiles ? virtualFiles.has(relPath) || existsSync(resolve(ROOT, relPath)) : existsSync(resolve(ROOT, relPath));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const virtualText = virtualFiles?.get(current);
    let sf: ts.SourceFile;
    if (virtualText !== undefined) {
      sf = ts.createSourceFile(current, virtualText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    } else if (existsSync(resolve(ROOT, current))) {
      sf = parseSource(current);
    } else {
      continue;
    }
    const collected = collectSpecifiersFromSource(sf, current);
    unresolvedDynamic.push(...collected.unresolvedDynamic);
    for (const edge of collected.edges) {
      const target = resolveLocalModule(current, edge.specifier, hasFile);
      if (target !== null) {
        localEdges.push({ from: current, to: target, kind: edge.kind });
        if (!visited.has(target)) queue.push(target);
      } else {
        externalEdges.push(edge);
      }
    }
  }

  return {
    visited: [...visited].sort(),
    localEdges,
    externalEdges,
    unresolvedDynamic,
  };
}

function collectProcessEnvRefs(sf: ts.SourceFile): string[] {
  const hits: string[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.name.text === "env"
    ) {
      hits.push(node.parent.getText(sf));
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

function collectApiKeyMentions(sf: ts.SourceFile): string[] {
  const hits: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) && /_API_KEY\b/.test(node.text)) {
      hits.push(node.text);
    } else if (ts.isIdentifier(node) && /_API_KEY\b/.test(node.text)) {
      hits.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

function collectLocalExportedDecls(sf: ts.SourceFile): Map<string, { kind: "type" | "interface" | "function"; node: ts.Statement }> {
  const out = new Map<string, { kind: "type" | "interface" | "function"; node: ts.Statement }>();
  for (const stmt of sf.statements) {
    const hasExport = Boolean(
      ts.canHaveModifiers(stmt) &&
        ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
    );
    if (!hasExport) continue;
    if (ts.isTypeAliasDeclaration(stmt)) out.set(stmt.name.text, { kind: "type", node: stmt });
    else if (ts.isInterfaceDeclaration(stmt)) out.set(stmt.name.text, { kind: "interface", node: stmt });
    else if (ts.isFunctionDeclaration(stmt) && stmt.name) out.set(stmt.name.text, { kind: "function", node: stmt });
  }
  return out;
}

function collectNamedReExports(sf: ts.SourceFile, fromSpecifier: string): { values: string[]; types: string[] } {
  const values: string[] = [];
  const types: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== fromSpecifier) continue;
    if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;
    for (const el of stmt.exportClause.elements) {
      const exportedName = el.name.text;
      if (stmt.isTypeOnly || el.isTypeOnly) types.push(exportedName);
      else values.push(exportedName);
    }
  }
  return { values: values.sort(), types: types.sort() };
}

function collectNamedImports(sf: ts.SourceFile, fromSpecifier: string): { values: string[]; types: string[] } {
  const values: string[] = [];
  const types: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== fromSpecifier) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const importedName = el.propertyName?.text ?? el.name.text;
      if (stmt.importClause?.isTypeOnly || el.isTypeOnly) types.push(importedName);
      else values.push(importedName);
    }
  }
  return { values: values.sort(), types: types.sort() };
}

it("any import of src/llm-execution.ts from src/llm-mesh.ts fails", () => {
  const syntheticProbe = ts.createSourceFile(
    "src/synthetic-probe.ts",
    [
      'import { a } from "./llm-execution.js";',
      'import type { B } from "./llm-execution.js";',
      'export { c } from "./llm-execution.js";',
      'const d = () => import("./llm-execution.js");',
      'type E = import("./llm-execution.js").TextJsonGenerationClient;',
      'import f = require("./llm-execution.js");',
      'const g = require("./llm-execution.js");',
    ].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const probeCollected = collectSpecifiersFromSource(syntheticProbe, "src/synthetic-probe.ts");
  const probeEdges = probeCollected.edges;
  // Kills a mutant in the AST edge walker that ignores any import/export syntax form.
  expect(probeEdges.map((e) => e.kind)).toEqual([
    "import",
    "import",
    "export",
    "dynamic-import",
    "import-type",
    "import-equals",
    "require",
  ]);
  // Kills a mutant that misclassifies literal import/require specifiers as unresolved dynamic calls.
  expect(probeCollected.unresolvedDynamic).toEqual([]);
  // Kills a mutant in relative specifier resolution that fails to map ./llm-execution.js to src/llm-execution.ts.
  expect(probeEdges.every((e) => resolveLocalModule(e.from, e.specifier) === "src/llm-execution.ts")).toBe(true);

  const closure = walkLocalClosure("src/llm-mesh.ts");
  const edgesToLlmExecution = closure.localEdges.filter((e) => e.to === "src/llm-execution.ts");

  // Kills a mutant that hides an import(...) or require(...) target behind a non-literal dynamic expression inside the src/llm-mesh.ts closure.
  expect(closure.unresolvedDynamic).toEqual([]);
  // Kills a mutant that re-introduces a direct or transitive import/re-export of src/llm-execution.ts from src/llm-mesh.ts.
  expect(edgesToLlmExecution).toEqual([]);
  // Kills a mutant that reaches src/llm-execution.ts anywhere in the src/llm-mesh.ts module graph.
  expect(closure.visited).not.toContain("src/llm-execution.ts");
  // Kills a mutant that fails to isolate src/llm-mesh.ts onto exactly src/llm-mesh-bridge.ts, src/llm-mesh-core.ts, src/llm-mesh-errors.ts, and src/llm-json-port.ts.
  expect(closure.visited).toEqual([
    "src/llm-json-port.ts",
    "src/llm-mesh-bridge.ts",
    "src/llm-mesh-core.ts",
    "src/llm-mesh-errors.ts",
    "src/llm-mesh.ts",
  ]);

  const directFromMesh = [...new Set(closure.localEdges.filter((e) => e.from === "src/llm-mesh.ts").map((e) => e.to))].sort();
  // Kills a mutant that imports src/llm-execution.ts from src/llm-mesh.ts or drops the ./llm-json-port.js / ./llm-mesh-bridge.js edges.
  expect(directFromMesh).toEqual([
    "src/llm-json-port.ts",
    "src/llm-mesh-bridge.ts",
  ]);

  const directFromBridge = [...new Set(closure.localEdges.filter((e) => e.from === "src/llm-mesh-bridge.ts").map((e) => e.to))].sort();
  // Kills a mutant that keeps ./llm-execution.js in src/llm-mesh-bridge.ts instead of ./llm-mesh-core.js and ./llm-mesh-errors.js.
  expect(directFromBridge).toEqual(["src/llm-mesh-core.ts", "src/llm-mesh-errors.ts"]);

  const directFromCore = [...new Set(closure.localEdges.filter((e) => e.from === "src/llm-mesh-core.ts").map((e) => e.to))].sort();
  // Kills a mutant that pulls ./llm-execution.js or ./llm-mesh-bridge.js into mesh-free src/llm-mesh-core.ts.
  expect(directFromCore).toEqual(["src/llm-json-port.ts", "src/llm-mesh-errors.ts"]);

  const coreSf = parseSource("src/llm-mesh-core.ts");
  const coreStaticExternalRuntime: string[] = [];
  for (const stmt of coreSf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const isTypeOnly = Boolean(stmt.importClause?.isTypeOnly) || (
        Boolean(stmt.importClause?.namedBindings) &&
        ts.isNamedImports(stmt.importClause!.namedBindings!) &&
        stmt.importClause!.namedBindings!.elements.every((el) => el.isTypeOnly) &&
        !stmt.importClause?.name
      );
      if (!isTypeOnly && !stmt.moduleSpecifier.text.startsWith(".")) {
        coreStaticExternalRuntime.push(stmt.moduleSpecifier.text);
      }
    }
  }
  // Kills a mutant that adds a runtime import of @sentropic/llm-mesh (or any non-node external) into src/llm-mesh-core.ts.
  expect(coreStaticExternalRuntime).toEqual(["node:crypto"]);

  const directFromErrors = closure.localEdges.filter((e) => e.from === "src/llm-mesh-errors.ts");
  // Kills a mutant that adds any local import inside src/llm-mesh-errors.ts.
  expect(directFromErrors).toEqual([]);

  const externalFromErrors = closure.externalEdges.filter((e) => e.from === "src/llm-mesh-errors.ts");
  // Kills a mutant that introduces @sentropic/llm-mesh or any external import into mesh-free src/llm-mesh-errors.ts.
  expect(externalFromErrors).toEqual([]);

  const directFromPort = closure.localEdges.filter((e) => e.from === "src/llm-json-port.ts");
  // Kills a mutant that adds any local import inside src/llm-json-port.ts.
  expect(directFromPort).toEqual([]);

  const externalFromPort = closure.externalEdges.filter((e) => e.from === "src/llm-json-port.ts").map((e) => e.specifier).sort();
  // Kills a mutant that introduces any third-party or SDK package import inside src/llm-json-port.ts.
  expect(externalFromPort).toEqual(["node:fs", "node:os", "node:path"]);

  const forbiddenSdkEdges = closure.externalEdges.filter(
    (e) => e.specifier === "ai" || e.specifier.startsWith("@ai-sdk/") || e.specifier === "mistral-ocr",
  );
  // Kills a mutant that pulls @ai-sdk/*, ai, or mistral-ocr into the src/llm-mesh.ts closure.
  expect(forbiddenSdkEdges).toEqual([]);

  const forbiddenHelperTargets = new Set([
    "src/llm-execution.ts",
    "src/node-descriptions.ts",
    "src/community-labeling.ts",
    "src/pdf-ocr.ts",
  ]);
  const forbiddenLocalEdges = closure.localEdges.filter((e) => forbiddenHelperTargets.has(e.to));
  // Kills a mutant that pulls provider-SDK helper modules into the src/llm-mesh.ts closure.
  expect(forbiddenLocalEdges).toEqual([]);

  const portEnvRefs = collectProcessEnvRefs(parseSource("src/llm-json-port.ts"));
  // Kills a mutant that reads or writes process.env inside src/llm-json-port.ts.
  expect(portEnvRefs).toEqual([]);

  const apiKeyMentions = closure.visited.flatMap((rel) => collectApiKeyMentions(parseSource(rel)));
  // Kills a mutant that references any *_API_KEY env var inside the src/llm-mesh.ts closure.
  expect(apiKeyMentions).toEqual([]);
  // Kills a mutant that breaks path normalization assumptions on the repository src root.
  expect(toRepoPath(SRC)).toBe("src");
});

it("JSON-port symbols are moved (never copied) into src/llm-json-port.ts and keep re-export identity", async () => {
  const EXPECTED_PORT_SYMBOLS = [
    "LlmExecutionMode",
    "LlmExecutionResult",
    "TextJsonGenerationClient",
    "TextJsonGenerationInput",
    "TextJsonGenerationResult",
    "parseJsonFromLlmText",
    "textClientToCallLlm",
  ];

  // Kills a mutant that omits creating src/llm-json-port.ts.
  expect(existsSync(resolve(ROOT, "src/llm-json-port.ts"))).toBe(true);

  const portSf = parseSource("src/llm-json-port.ts");
  const portDecls = collectLocalExportedDecls(portSf);

  // Kills a mutant that omits or adds an unexpected exported declaration in src/llm-json-port.ts.
  expect([...portDecls.keys()].sort()).toEqual(EXPECTED_PORT_SYMBOLS);

  const typeShapes: Record<string, unknown> = {};
  for (const [name, entry] of portDecls.entries()) {
    if (entry.kind === "type" && ts.isTypeAliasDeclaration(entry.node)) {
      typeShapes[name] = printNode(entry.node.type, portSf);
    } else if (entry.kind === "interface" && ts.isInterfaceDeclaration(entry.node)) {
      typeShapes[name] = entry.node.members.map((m) => printNode(m, portSf));
    } else {
      typeShapes[name] = entry.kind;
    }
  }
  // Kills a mutant that alters the declared shape or kind of any JSON-port contract symbol in src/llm-json-port.ts.
  expect(typeShapes).toEqual({
    LlmExecutionMode: '"assistant" | "direct" | "batch" | "mesh"',
    TextJsonGenerationInput: [
      "schema: string;",
      "prompt: string;",
      "outputPath?: string;",
      "validateResponse?: (text: string) => void | Promise<void>;",
      "maxOutputTokens?: number;",
    ],
    LlmExecutionResult: [
      'status: "instructions_written" | "completed";',
      "provider: string;",
      "mode: LlmExecutionMode;",
      "model?: string;",
      "outputPath?: string;",
      "instructionPath?: string;",
      "audit: Record<string, unknown>;",
    ],
    TextJsonGenerationResult: "LlmExecutionResult",
    TextJsonGenerationClient: [
      "readonly mode: LlmExecutionMode;",
      "readonly provider: string;",
      "readonly model?: string;",
      "generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult>;",
    ],
    parseJsonFromLlmText: "function",
    textClientToCallLlm: "function",
  });

  const execSf = parseSource("src/llm-execution.ts");
  const execLocalDecls = collectLocalExportedDecls(execSf);
  const duplicatedInExec = EXPECTED_PORT_SYMBOLS.filter((name) => execLocalDecls.has(name));
  // Kills a mutant that copies any JSON-port symbol in src/llm-execution.ts instead of moving it.
  expect(duplicatedInExec).toEqual([]);

  const execReExports = collectNamedReExports(execSf, "./llm-json-port.js");
  // Kills a mutant that stops re-exporting parseJsonFromLlmText or textClientToCallLlm from src/llm-execution.ts.
  expect(execReExports.values).toEqual(["parseJsonFromLlmText", "textClientToCallLlm"]);
  // Kills a mutant that stops re-exporting any JSON-port type from src/llm-execution.ts.
  expect(execReExports.types).toEqual([
    "LlmExecutionMode",
    "LlmExecutionResult",
    "TextJsonGenerationClient",
    "TextJsonGenerationInput",
    "TextJsonGenerationResult",
  ]);

  const meshSf = parseSource("src/llm-mesh.ts");
  const meshLocalDecls = collectLocalExportedDecls(meshSf);
  const duplicatedInMesh = EXPECTED_PORT_SYMBOLS.filter((name) => meshLocalDecls.has(name));
  // Kills a mutant that copies a JSON-port symbol inside src/llm-mesh.ts.
  expect(duplicatedInMesh).toEqual([]);

  const meshPortReExports = collectNamedReExports(meshSf, "./llm-json-port.js");
  // Kills a mutant that drops textClientToCallLlm re-export from src/llm-mesh.ts.
  expect(meshPortReExports).toEqual({ values: ["textClientToCallLlm"], types: [] });

  const meshBridgeReExports = collectNamedReExports(meshSf, "./llm-mesh-bridge.js");
  // Kills a mutant that alters the bridge re-export surface of src/llm-mesh.ts.
  expect(meshBridgeReExports).toEqual({
    values: ["classifyRouteFailure", "createGraphifyMesh", "meshTextJsonClient"],
    types: [
      "CreateGraphifyMeshOptions",
      "GraphifyMesh",
      "GraphifyMeshResponseValidator",
      "MeshTextJsonClientOptions",
    ],
  });

  const bridgeSf = parseSource("src/llm-mesh-bridge.ts");
  const bridgeLocalDecls = collectLocalExportedDecls(bridgeSf);
  const duplicatedInBridge = EXPECTED_PORT_SYMBOLS.filter((name) => bridgeLocalDecls.has(name));
  // Kills a mutant that copies a JSON-port symbol inside src/llm-mesh-bridge.ts.
  expect(duplicatedInBridge).toEqual([]);

  const coreSfForPort = parseSource("src/llm-mesh-core.ts");
  const coreLocalDecls = collectLocalExportedDecls(coreSfForPort);
  const duplicatedInCore = EXPECTED_PORT_SYMBOLS.filter((name) => coreLocalDecls.has(name));
  // Kills a mutant that copies a JSON-port symbol inside src/llm-mesh-core.ts.
  expect(duplicatedInCore).toEqual([]);

  const corePortImports = collectNamedImports(coreSfForPort, "./llm-json-port.js");
  // Kills a mutant that drops or mis-types the ./llm-json-port.js type imports in src/llm-mesh-core.ts.
  expect(corePortImports).toEqual({
    values: [],
    types: ["TextJsonGenerationClient", "TextJsonGenerationInput", "TextJsonGenerationResult"],
  });

  const indexSf = parseSource("src/index.ts");
  const indexExecReExports = collectNamedReExports(indexSf, "./llm-execution.js");
  for (const name of [
    "LlmExecutionMode",
    "LlmExecutionResult",
    "TextJsonGenerationClient",
    "TextJsonGenerationInput",
    "TextJsonGenerationResult",
  ]) {
    // Kills a mutant that breaks root public re-export of JSON-port types via src/index.ts.
    expect(indexExecReExports.types).toContain(name);
  }

  const [portMod, meshMod, bridgeMod, execMod] = await Promise.all([
    import("../src/llm-json-port.js"),
    import("../src/llm-mesh.js"),
    import("../src/llm-mesh-bridge.js"),
    import("../src/llm-execution.js"),
  ]);

  // Kills a mutant that breaks runtime function identity between src/llm-mesh.ts and src/llm-json-port.ts.
  expect(Object.is(meshMod.textClientToCallLlm, portMod.textClientToCallLlm)).toBe(true);
  // Kills a mutant that breaks runtime function identity between src/llm-execution.ts and src/llm-json-port.ts for textClientToCallLlm.
  expect(Object.is(execMod.textClientToCallLlm, portMod.textClientToCallLlm)).toBe(true);
  // Kills a mutant that breaks runtime function identity between src/llm-mesh.ts and src/llm-execution.ts for textClientToCallLlm.
  expect(Object.is(meshMod.textClientToCallLlm, execMod.textClientToCallLlm)).toBe(true);
  // Kills a mutant that breaks runtime function identity between src/llm-execution.ts and src/llm-json-port.ts for parseJsonFromLlmText.
  expect(Object.is(execMod.parseJsonFromLlmText, portMod.parseJsonFromLlmText)).toBe(true);
  // Kills a mutant that breaks runtime identity of createGraphifyMesh re-exported by src/llm-mesh.ts.
  expect(Object.is(meshMod.createGraphifyMesh, bridgeMod.createGraphifyMesh)).toBe(true);
  // Kills a mutant that breaks runtime identity of meshTextJsonClient re-exported by src/llm-mesh.ts.
  expect(Object.is(meshMod.meshTextJsonClient, bridgeMod.meshTextJsonClient)).toBe(true);
  // Kills a mutant that breaks runtime identity of classifyRouteFailure re-exported by src/llm-mesh.ts.
  expect(Object.is(meshMod.classifyRouteFailure, bridgeMod.classifyRouteFailure)).toBe(true);
});

it("parseJsonFromLlmText in src/llm-json-port.ts fails closed on empty, invalid, or oversized UTF-8 text", async () => {
  const { parseJsonFromLlmText } = await import("../src/llm-json-port.js") as {
    parseJsonFromLlmText: (text: string | null | undefined) => unknown;
  };

  // Kills a mutant that breaks plain JSON object parsing.
  expect(parseJsonFromLlmText('{"alpha":1,"beta":["x","y"]}')).toEqual({ alpha: 1, beta: ["x", "y"] });
  // Kills a mutant that fails to strip lowercase ```json code fences.
  expect(parseJsonFromLlmText('  ```json\n{"fenced":true}\n```  ')).toEqual({ fenced: true });
  // Kills a mutant that fails to strip uppercase ```JSON fences (case-insensitive flag).
  expect(parseJsonFromLlmText('```JSON\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  // Kills a mutant that fails to strip unlabeled ``` fences.
  expect(parseJsonFromLlmText('```\n{"bare":42}\n```')).toEqual({ bare: 42 });

  for (const emptyInput of ["", "   \n\t  ", null, undefined] as const) {
    // Kills a mutant that stops failing closed on empty, whitespace, null, or undefined LLM responses.
    expect(() => parseJsonFromLlmText(emptyInput)).toThrow("LLM returned empty or filtered response");
  }

  // Kills a mutant that swallows JSON syntax errors or drops the error prefix.
  expect(() => parseJsonFromLlmText('{"unterminated":')).toThrow("Direct LLM response was not valid JSON:");

  const CEILING_BYTES = 10 * 1024 * 1024;
  const exactAsciiPayload = `"${"a".repeat(CEILING_BYTES - 2)}"`;
  // Kills a mutant in test fixture sizing (confirms exact ceiling fixture is 10,485,760 UTF-8 bytes).
  expect(Buffer.byteLength(exactAsciiPayload, "utf-8")).toBe(CEILING_BYTES);
  // Kills a mutant that turns `byteLength > MAX_DIRECT_LLM_JSON_BYTES` into `>=`.
  expect(parseJsonFromLlmText(exactAsciiPayload)).toBe("a".repeat(CEILING_BYTES - 2));

  const overByOneByteAscii = `"${"a".repeat(CEILING_BYTES - 1)}"`;
  // Kills a mutant that drops or relaxes the 10 MiB ceiling check.
  expect(() => parseJsonFromLlmText(overByOneByteAscii)).toThrow(
    `Direct LLM response exceeds ${CEILING_BYTES} bytes (${CEILING_BYTES + 1} bytes); refusing to parse JSON`,
  );

  // Each 'é' is 1 UTF-16 code unit (.length === 5,242,882 < 10 MiB) but 2 UTF-8 bytes (10,485,762 > 10 MiB).
  const overUtf8UnderLength = `"${"\u00e9".repeat(CEILING_BYTES / 2)}"`;
  // Kills a mutant in test fixture sizing (confirms JS length < ceiling while UTF-8 bytes > ceiling).
  expect(overUtf8UnderLength.length).toBeLessThan(CEILING_BYTES);
  // Kills a mutant that checks candidate.length instead of Buffer.byteLength(candidate, "utf-8").
  expect(() => parseJsonFromLlmText(overUtf8UnderLength)).toThrow(
    `Direct LLM response exceeds ${CEILING_BYTES} bytes (${CEILING_BYTES + 2} bytes); refusing to parse JSON`,
  );
});

it("textClientToCallLlm in src/llm-json-port.ts forwards options, reads UTF-8 output, and removes its temp file", async () => {
  const { textClientToCallLlm } = await import("../src/llm-json-port.js") as {
    textClientToCallLlm: (
      client: {
        readonly mode: "assistant" | "direct" | "batch" | "mesh";
        readonly provider: string;
        readonly model?: string;
        generateJson(input: {
          schema: string;
          prompt: string;
          outputPath?: string;
          validateResponse?: (text: string) => void | Promise<void>;
          maxOutputTokens?: number;
        }): Promise<{
          status: "instructions_written" | "completed";
          provider: string;
          mode: "assistant" | "direct" | "batch" | "mesh";
          audit: Record<string, unknown>;
        }>;
      },
      schema: string,
      validateResponse?: (text: string) => void | Promise<void>,
    ) => (prompt: string, maxTokens: number) => Promise<string>;
  };

  const expectedPayload = '{"label":"café — résumé","count":7}';
  const receivedInputs: Array<Record<string, unknown>> = [];
  const validator = (_text: string): void => {};

  const stubClient = {
    mode: "mesh" as const,
    provider: "openai",
    model: "gpt-5.5",
    async generateJson(input: {
      schema: string;
      prompt: string;
      outputPath?: string;
      validateResponse?: (text: string) => void | Promise<void>;
      maxOutputTokens?: number;
    }) {
      receivedInputs.push({ ...input });
      if (input.outputPath) writeFileSync(input.outputPath, expectedPayload, "utf8");
      return { status: "completed" as const, provider: "openai", mode: "mesh" as const, audit: {} };
    },
  };

  const callWithValidator = textClientToCallLlm(stubClient, "node_description_v1", validator);
  const returned = await callWithValidator("Describe node A", 512);
  const firstInput = receivedInputs[0]!;
  const firstPath = String(firstInput.outputPath);

  // Kills a mutant that fails to read back UTF-8 content written to outputPath.
  expect(returned).toBe(expectedPayload);
  // Kills a mutant that drops or alters schema forwarding.
  expect(firstInput.schema).toBe("node_description_v1");
  // Kills a mutant that drops or alters prompt forwarding.
  expect(firstInput.prompt).toBe("Describe node A");
  // Kills a mutant that drops or alters maxTokens -> maxOutputTokens forwarding.
  expect(firstInput.maxOutputTokens).toBe(512);
  // Kills a mutant that drops validateResponse forwarding when supplied.
  expect(firstInput.validateResponse).toBe(validator);
  // Kills a mutant that places the temp file outside tmpdir() or alters its prefix/suffix.
  expect(dirname(firstPath)).toBe(tmpdir());
  // Kills a mutant that corrupts the temp filename pattern.
  expect(basename(firstPath)).toMatch(/^graphify-textjson-\d+-\d+-[a-z0-9]+\.json$/);
  // Kills a mutant that leaks the temp file after a successful call.
  expect(existsSync(firstPath)).toBe(false);

  const callWithoutValidator = textClientToCallLlm(stubClient, "community_label_v1");
  await callWithoutValidator("Label community 1", 256);
  const secondInput = receivedInputs[1]!;
  // Kills a mutant that injects an explicit validateResponse key when no validator was supplied.
  expect(Object.hasOwn(secondInput, "validateResponse")).toBe(false);
  // Kills a mutant that leaks the temp file on a second invocation without validator.
  expect(existsSync(String(secondInput.outputPath))).toBe(false);

  let failedPath = "";
  const failingClient = {
    mode: "mesh" as const,
    provider: "openai",
    async generateJson(input: { outputPath?: string }) {
      failedPath = String(input.outputPath);
      writeFileSync(failedPath, '{"partial":true}', "utf8");
      throw new Error("simulated provider error");
    },
  };
  const callFailing = textClientToCallLlm(failingClient, "node_description_v1");
  // Kills a mutant that swallows errors thrown by client.generateJson.
  await expect(callFailing("Trigger failure", 128)).rejects.toThrow("simulated provider error");
  // Kills a mutant that omits the finally cleanup block on failure.
  expect(existsSync(failedPath)).toBe(false);
});

function getLeadingJsDocText(sf: ts.SourceFile, node: ts.Node): string | null {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.pos) ?? [];
  const jsDocs = ranges
    .filter((r) => r.kind === ts.SyntaxKind.MultiLineCommentTrivia)
    .map((r) => sf.text.slice(r.pos, r.end))
    .filter((raw) => raw.startsWith("/**") && raw !== "/**/");
  if (jsDocs.length === 0) return null;
  return jsDocs
    .map((raw) =>
      raw
        .slice(3, -2)
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*\*\s?/, ""))
        .join(" "),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLeadingLineCommentText(sf: ts.SourceFile, node: ts.Node): string {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.pos) ?? [];
  return ranges
    .filter((r) => r.kind === ts.SyntaxKind.SingleLineCommentTrivia)
    .map((r) => sf.text.slice(r.pos, r.end).replace(/^\/\/\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

it("moved JSON-port declarations in src/llm-json-port.ts preserve their JSDoc contracts and #924 rationale", () => {
  const portSf = parseSource("src/llm-json-port.ts");
  const portDecls = collectLocalExportedDecls(portSf);

  const inputEntry = portDecls.get("TextJsonGenerationInput");
  // Kills a mutant that drops the TextJsonGenerationInput interface from src/llm-json-port.ts.
  expect(inputEntry && ts.isInterfaceDeclaration(inputEntry.node)).toBe(true);
  const inputIface = inputEntry!.node as ts.InterfaceDeclaration;

  const findProperty = (name: string): ts.PropertySignature | undefined =>
    inputIface.members.find(
      (m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === name,
    );

  const validateProp = findProperty("validateResponse");
  // Kills a mutant that removes validateResponse from TextJsonGenerationInput.
  expect(validateProp).toBeDefined();
  const validateJsDoc = getLeadingJsDocText(portSf, validateProp!);
  // Kills a mutant that omits or downgrades the JSDoc docstring on TextJsonGenerationInput.validateResponse.
  expect(validateJsDoc).not.toBeNull();
  // Kills a mutant that drops the consumer-owned acceptance check rule from validateResponse JSDoc.
  expect(validateJsDoc).toContain("Consumer-owned acceptance check for the raw model text.");
  // Kills a mutant that drops the MUST-validate-before-completion requirement from validateResponse JSDoc.
  expect(validateJsDoc).toContain("A generating client MUST run this before it reports successful completion.");
  // Kills a mutant that drops the non-generating assistant client rule from validateResponse JSDoc.
  expect(validateJsDoc).toContain("Non-generating assistant clients ignore it.");

  const maxTokensProp = findProperty("maxOutputTokens");
  // Kills a mutant that removes maxOutputTokens from TextJsonGenerationInput.
  expect(maxTokensProp).toBeDefined();
  const maxTokensJsDoc = getLeadingJsDocText(portSf, maxTokensProp!);
  // Kills a mutant that omits or downgrades the JSDoc docstring on TextJsonGenerationInput.maxOutputTokens.
  expect(maxTokensJsDoc).not.toBeNull();
  // Kills a mutant that drops the normative CEILING TO HONOR regime from maxOutputTokens JSDoc.
  expect(maxTokensJsDoc).toContain("Regime — CEILING TO HONOR, not a best-effort hint:");
  // Kills a mutant that drops the fail-explicitly ceiling requirement from maxOutputTokens JSDoc.
  expect(maxTokensJsDoc).toContain(
    "a client that performs model generation MUST forward this cap to the provider; if it cannot express an output cap it MUST fail explicitly rather than generate uncapped",
  );
  // Kills a mutant that drops the non-generating client exemption from maxOutputTokens JSDoc.
  expect(maxTokensJsDoc).toContain(
    "A NON-generating client (e.g. the assistant-emit sidecar, which asks a human to fill the JSON and calls no model) has no generation to cap and ignores this field.",
  );

  const adapterEntry = portDecls.get("textClientToCallLlm");
  // Kills a mutant that removes textClientToCallLlm from src/llm-json-port.ts.
  expect(adapterEntry && ts.isFunctionDeclaration(adapterEntry.node)).toBe(true);
  const adapterJsDoc = getLeadingJsDocText(portSf, adapterEntry!.node);
  // Kills a mutant that replaces the textClientToCallLlm JSDoc docstring with a // comment or omits it.
  expect(adapterJsDoc).not.toBeNull();
  // Kills a mutant that drops the adapter contract summary from textClientToCallLlm JSDoc.
  expect(adapterJsDoc).toContain("Adapt a `TextJsonGenerationClient` down to a raw text-returning call");
  // Kills a mutant that drops the maxTokens ceiling-to-honor contract from textClientToCallLlm JSDoc.
  expect(adapterJsDoc).toContain(
    "`maxTokens` is forwarded as the port's `maxOutputTokens` (ceiling-to-honor): a client that cannot cap its output fails loud instead of silently over-generating.",
  );
  // Kills a mutant that truncates the byte-for-byte caller-loop preservation contract from textClientToCallLlm JSDoc.
  expect(adapterJsDoc).toContain(
    "while its existing loop — retry policy and per-call token budget included — stays byte-for-byte unchanged.",
  );

  const parseEntry = portDecls.get("parseJsonFromLlmText");
  // Kills a mutant that removes parseJsonFromLlmText from src/llm-json-port.ts.
  expect(parseEntry && ts.isFunctionDeclaration(parseEntry.node) && Boolean(parseEntry.node.body?.statements[0])).toBe(true);
  const firstGuardStmt = (parseEntry!.node as ts.FunctionDeclaration).body!.statements[0]!;
  const guardComment = getLeadingLineCommentText(portSf, firstGuardStmt);
  // Kills a mutant that drops the upstream #924 reference comment in parseJsonFromLlmText.
  expect(guardComment).toContain("Upstream f5fea13 (#924): guard against empty / filtered LLM responses.");
  // Kills a mutant that drops the HTTP 200 empty/filtered rationale comment in parseJsonFromLlmText.
  expect(guardComment).toContain(
    "OpenAI-compatible providers can return HTTP 200 with empty choices or message=null on content-filter / Ollama overload",
  );
});

it("AST edge walker captures backtick dynamic specifiers and flags unresolved dynamic import/require calls", () => {
  const probeSf = ts.createSourceFile(
    "src/dynamic-probe.ts",
    [
      "const a = () => import(`./llm-execution.js`);",
      "const b = require(`./llm-execution.js`);",
      "const c = (target: string) => import(target);",
      "const d = (target: string) => require(target);",
      "const e = (stem: string) => import(`./${stem}.js`);",
      "const f = (stem: string) => require(`./${stem}.js`);",
      'const g = () => import("./llm-" + "execution.js");',
      'const h = () => require("./llm-" + "execution.js");',
      'const i = () => import(("./llm-execution.js"));',
      "const j = () => require();",
    ].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const { edges, unresolvedDynamic } = collectSpecifiersFromSource(probeSf, "src/dynamic-probe.ts");

  // Kills a mutant in collectSpecifiersFromSource that checks ts.isStringLiteral instead of ts.isStringLiteralLike for backtick import()/require().
  expect(edges).toEqual([
    { from: "src/dynamic-probe.ts", specifier: "./llm-execution.js", kind: "dynamic-import" },
    { from: "src/dynamic-probe.ts", specifier: "./llm-execution.js", kind: "require" },
  ]);
  // Kills a mutant that fails to resolve backtick dynamic specifiers to src/llm-execution.ts.
  expect(edges.map((e) => resolveLocalModule(e.from, e.specifier))).toEqual([
    "src/llm-execution.ts",
    "src/llm-execution.ts",
  ]);
  // Kills a mutant that drops unresolved dynamic import(...) or require(...) calls instead of recording them.
  expect(unresolvedDynamic).toEqual([
    { from: "src/dynamic-probe.ts", kind: "dynamic-import", expression: "target" },
    { from: "src/dynamic-probe.ts", kind: "require", expression: "target" },
    { from: "src/dynamic-probe.ts", kind: "dynamic-import", expression: "`./${stem}.js`" },
    { from: "src/dynamic-probe.ts", kind: "require", expression: "`./${stem}.js`" },
    { from: "src/dynamic-probe.ts", kind: "dynamic-import", expression: '"./llm-" + "execution.js"' },
    { from: "src/dynamic-probe.ts", kind: "require", expression: '"./llm-" + "execution.js"' },
    { from: "src/dynamic-probe.ts", kind: "dynamic-import", expression: '("./llm-execution.js")' },
    { from: "src/dynamic-probe.ts", kind: "require", expression: "" },
  ]);

  const virtualFiles = new Map<string, string>([
    ["src/virtual-mesh.ts", "export const load = () => import(`./virtual-bridge.js`);"],
    [
      "src/virtual-bridge.ts",
      [
        "export const hidden = (p: string) => import(p);",
        "export const hiddenReq = (p: string) => require(p);",
        "export const directBacktick = () => require(`./llm-execution.js`);",
      ].join("\n"),
    ],
  ]);
  const virtualClosure = walkLocalClosure("src/virtual-mesh.ts", virtualFiles);
  // Kills a mutant in walkLocalClosure that fails to follow backtick dynamic imports across transitive hops.
  expect(virtualClosure.localEdges.filter((e) => e.from.startsWith("src/virtual-"))).toEqual([
    { from: "src/virtual-mesh.ts", to: "src/virtual-bridge.ts", kind: "dynamic-import" },
    { from: "src/virtual-bridge.ts", to: "src/llm-execution.ts", kind: "require" },
  ]);
  // Kills a mutant in walkLocalClosure that omits src/llm-execution.ts reached via backtick dynamic hops.
  expect(virtualClosure.visited).toContain("src/llm-execution.ts");
  // Kills a mutant in walkLocalClosure that drops unresolved dynamic calls collected from visited modules.
  expect(virtualClosure.unresolvedDynamic.filter((u) => u.from.startsWith("src/virtual-"))).toEqual([
    { from: "src/virtual-bridge.ts", kind: "dynamic-import", expression: "p" },
    { from: "src/virtual-bridge.ts", kind: "require", expression: "p" },
  ]);
});

function parseSemverTriple(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`invalid semver triple: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemverTriple(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function satisfiesHalfOpenRange(range: string, version: string): boolean {
  const match = /^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!match) return false;
  const target = parseSemverTriple(version);
  const lower = parseSemverTriple(match[1]!);
  const upper = parseSemverTriple(match[2]!);
  return compareSemverTriple(target, lower) >= 0 && compareSemverTriple(target, upper) < 0;
}

it(
  "the mesh is an optional peer admitting 0.39.x and remains an exact development dependency; the installed consumer with no mesh refuses the mesh entry by name",
  { timeout: 180_000 },
  () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      devDependencies?: Record<string, string>;
    };

    // Kills a mutant that leaves @sentropic/llm-mesh in runtime dependencies.
    expect(pkg.dependencies?.["@sentropic/llm-mesh"]).toBeUndefined();
    // Kills a mutant that moves @sentropic/llm-mesh into optionalDependencies instead of optional peerDependencies.
    expect(pkg.optionalDependencies?.["@sentropic/llm-mesh"]).toBeUndefined();

    const peerRange = pkg.peerDependencies?.["@sentropic/llm-mesh"];
    // Kills a mutant that omits @sentropic/llm-mesh from peerDependencies or narrows/widens its range away from >=0.38.0 <0.40.0.
    expect(peerRange).toBe(">=0.38.0 <0.40.0");
    // Kills a mutant whose peer range rejects 0.38.0 floor.
    expect(satisfiesHalfOpenRange(peerRange!, "0.38.0")).toBe(true);
    // Kills a mutant whose peer range rejects 0.38.6.
    expect(satisfiesHalfOpenRange(peerRange!, "0.38.6")).toBe(true);
    // Kills a mutant whose peer range fails to admit 0.39.0 (0.39.x line).
    expect(satisfiesHalfOpenRange(peerRange!, "0.39.0")).toBe(true);
    // Kills a mutant whose peer range fails to admit 0.39.99 (upper 0.39.x).
    expect(satisfiesHalfOpenRange(peerRange!, "0.39.99")).toBe(true);
    // Kills a mutant whose peer range admits unsupported 0.37.x versions.
    expect(satisfiesHalfOpenRange(peerRange!, "0.37.99")).toBe(false);
    // Kills a mutant whose peer range admits breaking 0.40.0+.
    expect(satisfiesHalfOpenRange(peerRange!, "0.40.0")).toBe(false);

    // Kills a mutant that drops optional: true from peerDependenciesMeta["@sentropic/llm-mesh"].
    expect(pkg.peerDependenciesMeta?.["@sentropic/llm-mesh"]).toEqual({ optional: true });

    const devVersion = pkg.devDependencies?.["@sentropic/llm-mesh"];
    // Kills a mutant that removes @sentropic/llm-mesh from devDependencies or uses a range/non-0.38.x specifier instead of an exact published 0.38.x pin.
    expect(devVersion).toMatch(/^0\.38\.\d+$/);

    const rootLock = JSON.parse(readFileSync(resolve(ROOT, "package-lock.json"), "utf8")) as {
      packages?: Record<string, {
        version?: string;
        dev?: boolean;
        integrity?: string;
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        peerDependenciesMeta?: Record<string, { optional?: boolean }>;
        devDependencies?: Record<string, string>;
      }>;
    };
    const rootLockSelf = rootLock.packages?.[""];
    // Kills a mutant that fails to refresh package-lock.json after removing @sentropic/llm-mesh from dependencies.
    expect(rootLockSelf?.dependencies?.["@sentropic/llm-mesh"]).toBeUndefined();
    // Kills a mutant that omits peerDependencies["@sentropic/llm-mesh"] in package-lock.json.
    expect(rootLockSelf?.peerDependencies?.["@sentropic/llm-mesh"]).toBe(">=0.38.0 <0.40.0");
    // Kills a mutant that omits peerDependenciesMeta["@sentropic/llm-mesh"].optional in package-lock.json.
    expect(rootLockSelf?.peerDependenciesMeta?.["@sentropic/llm-mesh"]).toEqual({ optional: true });
    // Kills a mutant that fails to pin devDependencies["@sentropic/llm-mesh"] in package-lock.json to match package.json.
    expect(rootLockSelf?.devDependencies?.["@sentropic/llm-mesh"]).toBe(devVersion);

    const rootLockMesh = rootLock.packages?.["node_modules/@sentropic/llm-mesh"];
    // Kills a mutant that resolves a different @sentropic/llm-mesh version in package-lock.json than the exact devDependency pin.
    expect(rootLockMesh?.version).toBe(devVersion);
    // Kills a mutant that leaves node_modules/@sentropic/llm-mesh as a non-dev production dependency in package-lock.json.
    expect(rootLockMesh?.dev).toBe(true);
    // Kills a mutant that drops integrity on node_modules/@sentropic/llm-mesh in package-lock.json.
    expect(rootLockMesh?.integrity).toMatch(/^sha512-/);

    const consumerLock = JSON.parse(
      readFileSync(resolve(ROOT, "scripts/fixtures/substrate-consumer/package-lock.json"), "utf8"),
    ) as {
      packages?: Record<string, {
        version?: string;
        integrity?: string;
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      }>;
    };
    const consumerEngram = consumerLock.packages?.["node_modules/@sentropic/engram"];
    // Kills a mutant that leaves @sentropic/llm-mesh in the offline consumer fixture's engram dependencies.
    expect(consumerEngram?.dependencies?.["@sentropic/llm-mesh"]).toBeUndefined();
    // Kills a mutant that omits @sentropic/llm-mesh optional peer metadata in the offline consumer fixture.
    expect(consumerEngram?.peerDependencies?.["@sentropic/llm-mesh"]).toBe(">=0.38.0 <0.40.0");
    // Kills a mutant that drops optional: true for @sentropic/llm-mesh in the offline consumer fixture.
    expect(consumerEngram?.peerDependenciesMeta?.["@sentropic/llm-mesh"]).toEqual({ optional: true });
    // Kills a mutant that retains node_modules/@sentropic/llm-mesh inside the offline consumer fixture closure.
    expect(consumerLock.packages?.["node_modules/@sentropic/llm-mesh"]).toBeUndefined();

    const workflowText = readFileSync(resolve(ROOT, ".github/workflows/typescript-ci.yml"), "utf8");
    const packedScriptText = readFileSync(resolve(ROOT, "scripts/check-packed-surface.sh"), "utf8");
    // Kills a mutant that omits installing the @sentropic/llm-mesh peer in the CI smoke-test clean consumer.
    expect(workflowText).toMatch(/@sentropic\/llm-mesh@/);
    // Kills a mutant that omits installing the @sentropic/llm-mesh peer in scripts/check-packed-surface.sh.
    expect(packedScriptText).toMatch(/@sentropic\/llm-mesh@/);

    // Real installed peer-absent consumer: pack candidate tarball, install offline using the committed consumer lock.
    const npmBin = process.env.SUBSTRATE_NPM_BIN ?? "npm";
    const packDir = mkdtempSync(join(tmpdir(), "engram-nomesh-pack-"));
    const consumerDir = mkdtempSync(join(tmpdir(), "engram-nomesh-consumer-"));
    try {
      const packOut = execFileSync(
        npmBin,
        ["pack", "--offline", "--ignore-scripts", "--silent", "--pack-destination", packDir],
        { cwd: ROOT, encoding: "utf8" },
      );
      const tarballName = packOut.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".tgz")).pop();
      // Kills a mutant where npm pack fails to emit a candidate tarball for the peer-absent consumer check.
      expect(tarballName).toBeDefined();
      const tarballPath = join(packDir, tarballName!);

      copyFileSync(tarballPath, join(consumerDir, "engram.tgz"));
      copyFileSync(
        resolve(ROOT, "scripts/fixtures/substrate-consumer/package.json"),
        join(consumerDir, "package.json"),
      );
      const patchedLock = JSON.parse(
        readFileSync(resolve(ROOT, "scripts/fixtures/substrate-consumer/package-lock.json"), "utf8"),
      ) as { packages: Record<string, { integrity?: string }> };
      patchedLock.packages["node_modules/@sentropic/engram"]!.integrity =
        `sha512-${createHash("sha512").update(readFileSync(tarballPath)).digest("base64")}`;
      writeFileSync(join(consumerDir, "package-lock.json"), JSON.stringify(patchedLock));

      execFileSync(
        npmBin,
        ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
        { cwd: consumerDir, encoding: "utf8", stdio: "pipe" },
      );

      // Kills a mutant where installing @sentropic/engram without peer args still pulls @sentropic/llm-mesh into node_modules.
      expect(existsSync(join(consumerDir, "node_modules", "@sentropic", "llm-mesh"))).toBe(false);

      // Non-mesh public entries must load cleanly without @sentropic/llm-mesh installed.
      const nonMeshCheck = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          [
            'const rootMod = await import("@sentropic/engram");',
            'const sfcMod = await import("@sentropic/engram/session-front-contracts");',
            'const subMod = await import("@sentropic/engram/memory-substrate");',
            'if (typeof rootMod.buildFromJson !== "function") throw new Error("missing root buildFromJson");',
            'if (typeof sfcMod.createEngramSessionIngestFront !== "function") throw new Error("missing session-front-contracts");',
            'if (typeof subMod.createMemoryPortV2 !== "function") throw new Error("missing memory-substrate");',
            'console.log("non-mesh-ok");',
          ].join("\n"),
        ],
        { cwd: consumerDir, encoding: "utf8" },
      );
      // Kills a mutant where removing @sentropic/llm-mesh breaks root, session-front-contracts, or memory-substrate imports.
      expect(nonMeshCheck.status, nonMeshCheck.stderr).toBe(0);
      // Kills a mutant where the non-mesh probe exits 0 without executing its verification body.
      expect(nonMeshCheck.stdout.trim()).toBe("non-mesh-ok");

      // Importing @sentropic/engram/llm-mesh without the optional peer MUST fail and name @sentropic/llm-mesh.
      const meshEntryRefusal = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          [
            "try {",
            '  await import("@sentropic/engram/llm-mesh");',
            '  console.log("UNEXPECTED_SUCCESS");',
            "  process.exit(0);",
            "} catch (err) {",
            "  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';",
            "  const msg = err instanceof Error ? err.message : String(err);",
            "  console.error(JSON.stringify({ code, msg }));",
            "  process.exit(42);",
            "}",
          ].join("\n"),
        ],
        { cwd: consumerDir, encoding: "utf8" },
      );
      // Kills a mutant where @sentropic/engram/llm-mesh silently resolves or bundles @sentropic/llm-mesh without the peer installed.
      expect(meshEntryRefusal.status).toBe(42);
      const refusalPayload = JSON.parse(meshEntryRefusal.stderr.trim()) as { code: string; msg: string };
      // Kills a mutant where the refusal of @sentropic/engram/llm-mesh fails for an unrelated reason instead of missing module resolution.
      expect(refusalPayload.code).toBe("ERR_MODULE_NOT_FOUND");
      // Kills a mutant where the refusal of @sentropic/engram/llm-mesh omits naming @sentropic/llm-mesh.
      expect(refusalPayload.msg).toContain("@sentropic/llm-mesh");

      // Installed CLI works without @sentropic/llm-mesh for general commands and direct scrap extract,
      // and refuses `engram scrap extract --model mesh:...` with exit 2 naming @sentropic/llm-mesh before any request.
      const cliBin = join(consumerDir, "node_modules", "@sentropic", "engram", "dist", "cli.js");
      const versionRun = spawnSync(process.execPath, [cliBin, "--version"], { cwd: consumerDir, encoding: "utf8" });
      // Kills a mutant where dist/cli.js hoists a top-level static import of @sentropic/llm-mesh and crashes on --version.
      expect(versionRun.status, versionRun.stderr).toBe(0);
      // Kills a mutant where the installed CLI reports a mismatched package version.
      expect(versionRun.stdout.trim()).toBe(pkg.version);

      const scrapWork = join(consumerDir, "scrap-work");
      const snapHtml = "<html><body><p>alpha street number one brighton</p></body></html>";
      const snapSha = createHash("sha256").update(snapHtml).digest("hex");
      mkdirSync(join(scrapWork, "snapshots"), { recursive: true });
      writeFileSync(join(scrapWork, "snapshots", `${snapSha}.html`), snapHtml);
      writeFileSync(
        join(scrapWork, "state.jsonl"),
        `${JSON.stringify({ id: "a1", url: "http://x/1", status: "ok", pages: [{ url: "http://x/1", final_url: "http://x/1", status: 200, bytes: snapHtml.length, sha256: snapSha }] })}\n`,
      );
      const missionPath = join(scrapWork, "mission.json");
      writeFileSync(missionPath, JSON.stringify({ fields: ["f"], instruction: "Extract." }));

      const meshScrapRun = spawnSync(
        process.execPath,
        [cliBin, "scrap", "extract", "--out", scrapWork, "--mission", missionPath, "--model", "mesh:gemini-4-hydrogen-high"],
        { cwd: consumerDir, encoding: "utf8" },
      );
      // Kills a mutant where `engram scrap extract --model mesh:...` exits with a non-2 code when @sentropic/llm-mesh is absent.
      expect(meshScrapRun.status, meshScrapRun.stderr).toBe(2);
      // Kills a mutant where the peer-absent scrap refusal omits naming the missing optional package @sentropic/llm-mesh.
      expect(meshScrapRun.stderr).toContain("@sentropic/llm-mesh");
      // Kills a mutant where the peer-absent scrap refusal omits explaining that the package is an optional peer.
      expect(meshScrapRun.stderr).toMatch(/optional peer package/i);
      // Kills a mutant that writes results.ndjson or starts extraction before refusing on missing @sentropic/llm-mesh.
      expect(existsSync(join(scrapWork, "results.ndjson"))).toBe(false);

      const directEmptyDir = join(consumerDir, "scrap-direct-empty");
      mkdirSync(directEmptyDir, { recursive: true });
      writeFileSync(
        join(directEmptyDir, "state.jsonl"),
        `${JSON.stringify({ id: "skip1", url: "http://x/skip", status: "dns", pages: [] })}\n`,
      );
      const directEmptyRun = spawnSync(
        process.execPath,
        [cliBin, "scrap", "extract", "--out", directEmptyDir, "--mission", missionPath, "--model", "openai:gpt-5-mini"],
        { cwd: consumerDir, encoding: "utf8" },
      );
      // Kills a mutant where direct `engram scrap extract` fails without @sentropic/llm-mesh installed.
      expect(directEmptyRun.status, directEmptyRun.stderr).toBe(0);
      // Kills a mutant where direct `engram scrap extract` fails to print its summary without @sentropic/llm-mesh installed.
      expect(directEmptyRun.stdout).toContain("scrap extract summary: ok=0 failed=0");
    } finally {
      rmSync(packDir, { recursive: true, force: true });
      rmSync(consumerDir, { recursive: true, force: true });
    }
  },
);

// ============================================================================
// Row 12 (1-E2-2) — Privacy modules in engram-memory/privacy/*
// ============================================================================

const PRIVACY_API = engramMemory as Record<string, unknown>;

const PRIVACY_SCOPE_A: SessionFrontScopeV1 = {
  tenantId: "tenant-alpha",
  workspaceId: "ws-alpha",
};

const PRIVACY_SCOPE_B: SessionFrontScopeV1 = {
  tenantId: "tenant-alpha",
  workspaceId: "ws-beta",
};

const PRIVACY_SCOPE_C: SessionFrontScopeV1 = {
  tenantId: "tenant-beta",
  workspaceId: "ws-alpha",
};

const T0_INSTANT = "2026-11-20T12:00:00.000Z";
const T1_INSTANT = "2026-11-20T13:00:00.000Z";
const T_DEADLINE = "2026-11-20T18:00:00.000Z";

function makeKeyBytes(seed: number): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = (seed + i * 7) & 0xff;
  }
  return bytes;
}

function expectedHmacPseudonym(
  prefix: "actor_pseudo:" | "sess_pseudo:",
  domain: string,
  key: Uint8Array,
  rawId: string,
): string {
  const hex = createHmac("sha256", key)
    .update(domain + rawId.normalize("NFC"), "utf8")
    .digest("hex");
  return `${prefix}${hex}`;
}

function makeBaselineCandidate(
  scopeRef: string,
  purposeRef: string,
  text: string,
  retention: RetentionV1 = { derivative_rule: "retain" },
): CandidatePayloadV2 {
  const contentDigest = engramMemory.receiptDigest("test-citation", { text });
  return {
    schema_version: 2,
    scope_ref: scopeRef,
    purpose_ref: purposeRef,
    valid_time: { t: Date.parse(T0_INSTANT) },
    components: [
      {
        component_id: "comp-1",
        kind: "context",
        text,
        citation_ids: ["cit-1"],
      },
    ],
    primary_component_id: "comp-1",
    primary_event: {
      at: Date.parse(T0_INSTANT),
      type_ref: "session:turn",
      citation_id: "cit-1",
    },
    citations: [
      {
        citation_id: "cit-1",
        source_ref: "session-db:s1",
        locator: { scheme: "ordinal", value: "1" },
        content_digest: contentDigest,
      },
    ],
    retention,
    reconciliation: { family_refs: [] },
  };
}

function makeBaselineRecord(
  scopeRef: string,
  purposeRef: string,
  text: string,
): MemoryRecordV2 {
  const candidate = makeBaselineCandidate(scopeRef, purposeRef, text);
  const payloadDigest = engramMemory.knowledgePayloadDigest(candidate);
  const authReceipt = engramMemory.receiptDigest("auth-test", { scopeRef, purposeRef });
  const trustBody = {
    class: "asserted" as const,
    evidence_digest: engramMemory.receiptDigest("ev-test", { text }),
    verifier_id: "graphify-memory:asserted",
    verifier_version: "1.0.0",
    issued_at: T0_INSTANT,
    revocation_epoch: "0",
  };
  const trust = {
    ...trustBody,
    receipt_digest: engramMemory.receiptDigest("trust-binding", trustBody),
  };
  const draft = {
    ...candidate,
    payload_digest: payloadDigest,
    recorded_at: T0_INSTANT,
    recorded_cursor: "1",
    authorization_receipt_digest: authReceipt,
    trust,
  };
  const recordDigest = engramMemory.memoryRecordDigest(draft);
  const recordId = engramMemory.recordIdFromDigest(recordDigest);
  return {
    ...draft,
    record_id: recordId,
    record_digest: recordDigest,
  };
}

function makeTestAuthorizationPort(
  scopeRef: string,
  policyVersion = "armor-policy/v1",
  overrides?: {
    readonly redactImpl?: (req: RedactionRequestV1) => Promise<Result<RedactionResultV1>>;
  },
): {
  readonly port: AuthorizationPort;
  readonly issuedReceipts: AuthorizationAllowedV1[];
} {
  const issuedReceipts: AuthorizationAllowedV1[] = [];
  const directive: RedactionDirectiveV1 = {
    mode: "field-allowlist",
    allowed_fields: [""],
    allow_derivation_lineage: true,
    max_packet_bytes: 65_536,
  };
  const port: AuthorizationPort = {
    version: 1,
    async authorize(request: AuthorizationRequestV1) {
      const targetScope = request.resource.scope_ref ?? scopeRef;
      const body = {
        allowed: true as const,
        decision_id: `dec_${issuedReceipts.length + 1}`,
        policy_version: policyVersion,
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: targetScope,
        not_before: "2026-11-20T00:00:00.000Z",
        expires_at: "2026-11-20T23:59:59.000Z",
        revocation_epoch: "0",
        redaction: directive,
        authentication_receipt_digest: engramMemory.receiptDigest("authn-test", {
          cred: request.context.credential,
        }),
      };
      const allowed: AuthorizationAllowedV1 = {
        ...body,
        receipt_digest: engramMemory.receiptDigest("authorization-allowed", body),
      };
      issuedReceipts.push(allowed);
      return { ok: true, value: allowed };
    },
    async revalidate(digest: Digest, at: string) {
      const body = {
        receipt_digest: digest,
        checked_at: at,
        valid: true,
        current_revocation_epoch: "0",
        reason: "valid" as const,
      };
      const reval: AuthorizationRevalidationV1 = {
        ...body,
        revalidation_receipt_digest: engramMemory.receiptDigest(
          "authorization-revalidation",
          body,
          "revalidation_receipt_digest",
        ),
      };
      return { ok: true, value: reval };
    },
    async redact(request: RedactionRequestV1) {
      if (overrides?.redactImpl) {
        return overrides.redactImpl(request);
      }
      const applied = engramMemory.applyPortOwnedRedaction(
        request.source_record,
        request.directive,
      );
      if (!applied.ok) {
        return applied;
      }
      const raw = applied.value as Record<string, unknown>;
      const candidateKeys = [
        "schema_version",
        "scope_ref",
        "purpose_ref",
        "valid_time",
        "components",
        "primary_component_id",
        "primary_event",
        "citations",
        "retention",
        "reconciliation",
        "derivation",
      ];
      const payloadObj: Record<string, unknown> = {};
      for (const key of candidateKeys) {
        if (Object.hasOwn(raw, key)) {
          payloadObj[key] = raw[key];
        }
      }
      const payload = payloadObj as unknown as CandidatePayloadV2;
      const outputPayloadDigest = engramMemory.knowledgePayloadDigest(payload);
      const body = {
        payload,
        source_record_digest: request.source_record.record_digest,
        output_payload_digest: outputPayloadDigest,
        policy_version: policyVersion,
      };
      return {
        ok: true,
        value: {
          ...body,
          receipt_digest: engramMemory.receiptDigest("redaction-result", body),
        },
      };
    },
  };
  return { port, issuedReceipts };
}

function makeInMemorySessionFrontStore(): {
  readonly store: SessionFrontStoreV1;
  readonly commits: SessionFrontCommitV1[];
} {
  const commits: SessionFrontCommitV1[] = [];
  const replays = new Map<string, SessionFrontCommitV1>();
  const events = new Map<
    string,
    {
      readonly scope: SessionFrontScopeV1;
      disposition: "pending_extraction" | "proposed" | "empty_verified" | "withheld_d7";
      readonly ordinal?: number;
      readonly sessionRef?: string;
    }
  >();
  let nextCursor = 1;
  const store: SessionFrontStoreV1 = {
    async transact<T>(
      scope: SessionFrontScopeV1,
      apply: (tx: SessionFrontTransactionV1) => Promise<Result<T>>,
    ): Promise<Result<T>> {
      const staged: SessionFrontCommitV1[] = [];
      const cursor = String(nextCursor);
      const tx: SessionFrontTransactionV1 = {
        cursor,
        async readReplay(kind, key) {
          const found = replays.get(`${scope.tenantId}:${scope.workspaceId}:${kind}:${key}`);
          if (!found) {
            return undefined;
          }
          return {
            kind: found.kind,
            inputDigest: found.inputDigest,
            receipt: found.receipt,
          } as never;
        },
        async readEvent(eventRecordId) {
          const found = events.get(eventRecordId);
          return found ? { ...found } : undefined;
        },
        async write(commit) {
          staged.push(commit);
        },
      };
      const outcome = await apply(tx);
      if (outcome.ok && staged.length > 0) {
        nextCursor += 1;
        for (const commit of staged) {
          commits.push(commit);
          replays.set(
            `${commit.scope.tenantId}:${commit.scope.workspaceId}:${commit.kind}:${commit.idempotencyKey}`,
            commit,
          );
          if (commit.kind === "event") {
            events.set(commit.receipt.eventRecordId, {
              scope: commit.scope,
              disposition: commit.receipt.extractionDisposition,
              ordinal: commit.ordinal?.throughOrdinal,
              sessionRef: commit.event.sessionRef,
            });
          } else {
            for (const [id, disp] of Object.entries(commit.receipt.sourceDispositions)) {
              const entry = events.get(id);
              if (entry) {
                entry.disposition = disp;
              }
            }
          }
        }
      }
      return outcome;
    },
  };
  return { store, commits };
}

function makeInMemoryCryptoPort(log?: string[]): CryptoPort {
  const keys = new Map<string, string>();
  let counter = 0;
  return {
    version: 1,
    async seal(input) {
      counter += 1;
      const keyRef = `key-ref-${counter}`;
      keys.set(keyRef, input.plaintext);
      const body = {
        candidate_id: input.candidate_id,
        envelope_ref: `env-${counter}`,
        key_ref: keyRef,
        ciphertext: Buffer.from(input.plaintext, "utf8").toString("base64url"),
      };
      return {
        ok: true,
        value: {
          ...body,
          envelope_digest: engramMemory.receiptDigest("sealed-envelope", body, "envelope_digest"),
        },
      };
    },
    async open(input) {
      const plaintext = keys.get(input.sealed.key_ref);
      if (plaintext === undefined) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            operation: "request_admission",
            message: "key destroyed",
            retryable: false,
          },
        };
      }
      return { ok: true, value: { plaintext } };
    },
    async destroy(input) {
      log?.push(`destroy:${input.key_ref}`);
      const existed = keys.delete(input.key_ref);
      return {
        ok: true,
        value: {
          destroyed: existed || true,
          receipt_digest: engramMemory.receiptDigest("crypto-destroy", {
            key_ref: input.key_ref,
            idempotency_key: input.idempotency_key,
          }),
        },
      };
    },
    async rotate(input) {
      return {
        ok: true,
        value: {
          key_ref: `${input.key_ref}-rot`,
          receipt_digest: engramMemory.receiptDigest("crypto-rotate", {
            key_ref: input.key_ref,
          }),
        },
      };
    },
  };
}

function makeProtoPoisoned(base: Record<string, unknown>): Record<string, unknown> {
  const poisoned: Record<string, unknown> = { ...base };
  Object.defineProperty(poisoned, "__proto__", {
    value: { injected: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return poisoned;
}

function makeGetterObject(base: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const obj: Record<string, unknown> = { ...base };
  delete obj[key];
  Object.defineProperty(obj, key, {
    get() {
      return value;
    },
    enumerable: true,
    configurable: true,
  });
  return obj;
}

function makeNonEnumerableObject(
  base: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const obj: Record<string, unknown> = { ...base };
  Object.defineProperty(obj, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return obj;
}

function makeThrowingProxy(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("hostile proxy trap");
      },
      getOwnPropertyDescriptor() {
        throw new Error("hostile proxy trap");
      },
    },
  );
}

it("a cross-boundary egress without a PiiArmorStamp fails closed", async () => {
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<unknown>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<Result<unknown>>;
  const verifyStamp = PRIVACY_API.verifyPiiArmorStampV1 as (
    stamp: unknown,
    expectedPolicy: unknown,
    binding?: unknown,
  ) => Result<unknown>;
  const evaluateEgress = PRIVACY_API.evaluateEgressBoundaryV1 as (input: unknown) => Result<unknown>;

  // Kills a mutant that omits exporting the PII armor and deny-list entrypoints from engram-memory.
  expect(typeof createDenyList).toBe("function");
  // Kills a mutant that omits exporting redactWithPiiArmorV1 from engram-memory.
  expect(typeof redactWithArmor).toBe("function");
  // Kills a mutant that omits exporting verifyPiiArmorStampV1 from engram-memory.
  expect(typeof verifyStamp).toBe("function");
  // Kills a mutant that omits exporting evaluateEgressBoundaryV1 from engram-memory.
  expect(typeof evaluateEgress).toBe("function");

  const denyListRes = createDenyList({
    version: "d7-2026-11",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: ["email", "secret-token", "private-key"],
  });
  // Kills a mutant that fails to build a valid baseline ConfidentialityDenyListV1.
  expect(denyListRes.ok).toBe(true);
  const denyList = denyListRes.ok
    ? (denyListRes.value as { readonly version: string; readonly digestSha256: Digest })
    : undefined;

  const { port: authPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1");
  const cleanRecord = makeBaselineRecord(
    "scope:ws-alpha",
    "memory.recall.study/v1",
    "Architecture decision: use deterministic canonical digests.",
  );
  const actorPseudo = expectedHmacPseudonym(
    "actor_pseudo:",
    "engram/d33/actor/v1\0",
    makeKeyBytes(11),
    "actor:alice",
  );
  const sessionPseudo = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(11),
    "sess-001",
  );
  const authzReceiptDigest = engramMemory.receiptDigest("authz-cap", { id: "1" });
  const redactionReq: RedactionRequestV1 = {
    source_record: cleanRecord,
    target_scope_ref: "scope:ws-beta",
    directive: {
      mode: "field-allowlist",
      allowed_fields: [""],
      allow_derivation_lineage: false,
      max_packet_bytes: 8_192,
    },
    authorization_receipt_digest: authzReceiptDigest,
  };

  const baselineArmorInput = {
    authorizationPort: authPort,
    request: redactionReq,
    denyList,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace" as const,
    d33Pseudonymized: true,
    actorPseudoId: actorPseudo,
    sessionPseudoId: sessionPseudo,
  };
  const armorRes = await redactWithArmor(baselineArmorInput);
  // Kills a mutant that rejects a valid PII-armored redaction request behind AuthorizationPort.redact.
  expect(armorRes.ok).toBe(true);
  type ArmoredOut = {
    readonly redactionReceipt: Record<string, unknown> & {
      readonly outputPayloadDigest: Digest;
      readonly receiptDigest: Digest;
    };
    readonly stamp: {
      readonly policyVersion: string;
      readonly redactionReceiptDigest: Digest;
      readonly d7BlacklistVersion: string;
      readonly d33Pseudonymized: true;
    };
    readonly packetBytes: number;
  };
  const armored = armorRes.ok ? (armorRes.value as ArmoredOut) : undefined;

  // Kills a mutant that drops policyVersion or d7BlacklistVersion or d33Pseudonymized from PiiArmorStampV1.
  expect(armored?.stamp.policyVersion).toBe("armor-policy/v1");
  // Kills a mutant that omits binding d7BlacklistVersion on PiiArmorStampV1.
  expect(armored?.stamp.d7BlacklistVersion).toBe("d7-2026-11");
  // Kills a mutant that does not set d33Pseudonymized: true on PiiArmorStampV1.
  expect(armored?.stamp.d33Pseudonymized).toBe(true);
  // Kills a mutant that omits or produces a malformed redactionReceiptDigest on PiiArmorStampV1.
  expect(armored?.stamp.redactionReceiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

  const expectedPolicy = {
    policyVersion: "armor-policy/v1",
    d7BlacklistVersion: "d7-2026-11",
    d7BlacklistDigest: denyList!.digestSha256,
  };
  const baselineBinding = {
    redactionReceipt: armored!.redactionReceipt,
    sourceScopeRef: "scope:ws-alpha",
    targetScopeRef: "scope:ws-beta",
    boundary: "cross-workspace" as const,
    authorizationReceiptDigest: authzReceiptDigest,
    payloadDigest: armored!.redactionReceipt.outputPayloadDigest,
  };

  for (const boundary of ["cross-workspace", "cross-tenant", "study", "external-model"] as const) {
    const boundaryArmorRes = await redactWithArmor({ ...baselineArmorInput, boundary });
    // Kills a mutant that fails to bind PII armor redaction for any cross-boundary kind.
    expect(boundaryArmorRes.ok).toBe(true);
    const boundaryArmored = boundaryArmorRes.ok ? (boundaryArmorRes.value as ArmoredOut) : armored!;
    const validCross = evaluateEgress({
      boundary,
      metamodelClass: "typed_node",
      sourceScopeRef: "scope:ws-alpha",
      targetScopeRef: "scope:ws-beta",
      authorizationReceiptDigest: authzReceiptDigest,
      payloadDigest: boundaryArmored.redactionReceipt.outputPayloadDigest,
      piiArmorStamp: boundaryArmored.stamp,
      redactionReceipt: boundaryArmored.redactionReceipt,
      expectedPolicy,
      packetBytes: boundaryArmored.packetBytes,
      maxPacketBytes: 8_192,
    });
    // Kills a mutant that refuses valid stamped cross-boundary egress for any cross-boundary kind.
    expect(validCross.ok).toBe(true);
    if (validCross.ok) {
      const val = validCross.value as {
        readonly permitted: boolean;
        readonly crossesBoundary: boolean;
        readonly mode: string;
      };
      // Kills a mutant that misreports crossesBoundary or mode on stamped cross-boundary egress.
      expect(val.permitted).toBe(true);
      // Kills a mutant that marks cross-boundary egress as crossesBoundary: false.
      expect(val.crossesBoundary).toBe(true);
      // Kills a mutant that allows unmasked mode on cross-boundary egress.
      expect(val.mode).toBe("pii-armored");
    }

    const noStamp = evaluateEgress({
      boundary,
      metamodelClass: "typed_node",
      sourceScopeRef: "scope:ws-alpha",
      targetScopeRef: "scope:ws-beta",
      authorizationReceiptDigest: authzReceiptDigest,
      payloadDigest: boundaryArmored.redactionReceipt.outputPayloadDigest,
      redactionReceipt: boundaryArmored.redactionReceipt,
      expectedPolicy,
      packetBytes: boundaryArmored.packetBytes,
      maxPacketBytes: 8_192,
    });
    // Kills a mutant that allows cross-boundary egress when piiArmorStamp is absent.
    expect(noStamp.ok).toBe(false);
    if (!noStamp.ok) {
      // Kills a mutant that returns an open/wrong refusal code when piiArmorStamp is missing.
      expect(noStamp.error.code).toBe("UNAUTHORIZED");
    }
  }

  const nullStamp = evaluateEgress({
    boundary: "cross-workspace",
    metamodelClass: "typed_node",
    sourceScopeRef: "scope:ws-alpha",
    targetScopeRef: "scope:ws-beta",
    authorizationReceiptDigest: authzReceiptDigest,
    payloadDigest: armored!.redactionReceipt.outputPayloadDigest,
    piiArmorStamp: null,
    redactionReceipt: armored!.redactionReceipt,
    expectedPolicy,
    packetBytes: armored!.packetBytes,
    maxPacketBytes: 8_192,
  });
  // Kills a mutant that treats piiArmorStamp: null as valid on cross-boundary egress.
  expect(nullStamp.ok).toBe(false);
  if (!nullStamp.ok) {
    // Kills a mutant that fails to refuse piiArmorStamp: null with UNAUTHORIZED.
    expect(nullStamp.error.code).toBe("UNAUTHORIZED");
  }

  const noExpectedPolicy = evaluateEgress({
    boundary: "cross-workspace",
    metamodelClass: "typed_node",
    sourceScopeRef: "scope:ws-alpha",
    targetScopeRef: "scope:ws-beta",
    authorizationReceiptDigest: authzReceiptDigest,
    payloadDigest: armored!.redactionReceipt.outputPayloadDigest,
    piiArmorStamp: armored!.stamp,
    redactionReceipt: armored!.redactionReceipt,
    packetBytes: armored!.packetBytes,
    maxPacketBytes: 8_192,
  });
  // Kills a mutant that trusts a caller-supplied PiiArmorStamp without an active policy baseline.
  expect(noExpectedPolicy.ok).toBe(false);
  if (!noExpectedPolicy.ok) {
    // Kills a mutant that fails to return POLICY_UNAVAILABLE when active armor policy is absent.
    expect(noExpectedPolicy.error.code).toBe("POLICY_UNAVAILABLE");
  }

  const falsePseudoStamp = verifyStamp(
    { ...armored!.stamp, d33Pseudonymized: false },
    expectedPolicy,
    baselineBinding,
  );
  // Kills a mutant that accepts d33Pseudonymized: false on PiiArmorStampV1.
  expect(falsePseudoStamp.ok).toBe(false);
  if (!falsePseudoStamp.ok) {
    // Kills a mutant that fails to refuse unpseudonymized stamp with UNAUTHORIZED.
    expect(falsePseudoStamp.error.code).toBe("UNAUTHORIZED");
  }

  const wrongPolicyVersion = verifyStamp(
    { ...armored!.stamp, policyVersion: "armor-policy/v0" },
    expectedPolicy,
    baselineBinding,
  );
  // Kills a mutant that skips checking stamp.policyVersion against expectedPolicy.policyVersion.
  expect(wrongPolicyVersion.ok).toBe(false);
  if (!wrongPolicyVersion.ok) {
    // Kills a mutant that uses wrong refusal code for mismatched stamp policyVersion.
    expect(wrongPolicyVersion.error.code).toBe("UNAUTHORIZED");
  }

  const wrongBlacklistVersion = verifyStamp(
    { ...armored!.stamp, d7BlacklistVersion: "d7-stale" },
    expectedPolicy,
    baselineBinding,
  );
  // Kills a mutant that skips checking stamp.d7BlacklistVersion against expectedPolicy.
  expect(wrongBlacklistVersion.ok).toBe(false);
  if (!wrongBlacklistVersion.ok) {
    // Kills a mutant that uses wrong refusal code for mismatched d7BlacklistVersion.
    expect(wrongBlacklistVersion.error.code).toBe("UNAUTHORIZED");
  }

  const wrongReceiptDigest = verifyStamp(
    { ...armored!.stamp, redactionReceiptDigest: `sha256:${"a".repeat(64)}` },
    expectedPolicy,
    baselineBinding,
  );
  // Kills a mutant that skips verifying stamp.redactionReceiptDigest against the bound receipt digest.
  expect(wrongReceiptDigest.ok).toBe(false);
  if (!wrongReceiptDigest.ok) {
    // Kills a mutant that uses wrong refusal code for mismatched redactionReceiptDigest.
    expect(wrongReceiptDigest.error.code).toBe("UNAUTHORIZED");
  }

  const externalModelArmorRes = await redactWithArmor({
    ...baselineArmorInput,
    boundary: "external-model",
  });
  expect(externalModelArmorRes.ok).toBe(true);
  const externalModelArmored = externalModelArmorRes.ok
    ? (externalModelArmorRes.value as ArmoredOut)
    : armored!;
  const overByteBound = evaluateEgress({
    boundary: "external-model",
    metamodelClass: "typed_node",
    sourceScopeRef: "scope:ws-alpha",
    targetScopeRef: "scope:ws-beta",
    authorizationReceiptDigest: authzReceiptDigest,
    payloadDigest: externalModelArmored.redactionReceipt.outputPayloadDigest,
    piiArmorStamp: externalModelArmored.stamp,
    redactionReceipt: externalModelArmored.redactionReceipt,
    expectedPolicy,
    packetBytes: 8_193,
    maxPacketBytes: 8_192,
  });
  // Kills a mutant that drops the D8 max_packet_bytes bound check on cross-boundary egress.
  expect(overByteBound.ok).toBe(false);
  if (!overByteBound.ok) {
    // Kills a mutant that uses wrong refusal code when packetBytes exceeds maxPacketBytes.
    expect(overByteBound.error.code).toBe("UNAUTHORIZED");
  }

  const d24Sync = evaluateEgress({
    boundary: "same-workspace-sync",
    metamodelClass: "typed_node",
    workspaceSyncEnabled: true,
  });
  // Kills a mutant that breaks D24 integral unmasked same-workspace sync when sync is enabled.
  expect(d24Sync.ok).toBe(true);
  if (d24Sync.ok) {
    const val = d24Sync.value as { readonly crossesBoundary: boolean; readonly mode: string };
    // Kills a mutant that misclassifies same-workspace sync as crossesBoundary: true.
    expect(val.crossesBoundary).toBe(false);
    // Kills a mutant that masks D24 same-workspace sync instead of integral-unmasked.
    expect(val.mode).toBe("integral-unmasked");
  }

  const d24TurnUnconsented = evaluateEgress({
    boundary: "same-workspace-sync",
    metamodelClass: "turn_text",
    workspaceSyncEnabled: true,
    contentPolicyAllowsSync: false,
    turnTextBytes: 128,
  });
  // Kills a mutant that replicates unconsented CLI turn_text without ContentPolicyV1 consent.
  expect(d24TurnUnconsented.ok).toBe(false);
  if (!d24TurnUnconsented.ok) {
    // Kills a mutant that fails to refuse unconsented turn_text sync with UNAUTHORIZED.
    expect(d24TurnUnconsented.error.code).toBe("UNAUTHORIZED");
  }

  const d24TurnOversized = evaluateEgress({
    boundary: "same-workspace-sync",
    metamodelClass: "turn_text",
    workspaceSyncEnabled: true,
    contentPolicyAllowsSync: true,
    turnTextBytes: 65_537,
  });
  // Kills a mutant that allows turn_text > 64 KiB on same-workspace sync.
  expect(d24TurnOversized.ok).toBe(false);
  if (!d24TurnOversized.ok) {
    // Kills a mutant that returns wrong error code when turn_text exceeds 65_536 bytes.
    expect(d24TurnOversized.error.code).toBe("PROJECTION_OVERSIZED");
  }

  for (const ctxClass of ["context_log", "context_summary"] as const) {
    const localDefault = evaluateEgress({
      boundary: "same-workspace-sync",
      metamodelClass: ctxClass,
      workspaceSyncEnabled: true,
    });
    // Kills a mutant that replicates context_log/context_summary without explicit D10/S1-m transfer opt-in.
    expect(localDefault.ok).toBe(false);
    if (!localDefault.ok) {
      // Kills a mutant that fails to refuse local-by-default context transfer with UNAUTHORIZED.
      expect(localDefault.error.code).toBe("UNAUTHORIZED");
    }

    const mandateOnly = evaluateEgress({
      boundary: "same-workspace-sync",
      metamodelClass: ctxClass,
      workspaceSyncEnabled: true,
      mandateAllowsContextTransfer: true,
      repoPolicyAllowsContextTransfer: false,
    });
    // Kills a mutant that transfers context_log/context_summary on mandate alone without repo policy.
    expect(mandateOnly.ok).toBe(false);

    const repoOnly = evaluateEgress({
      boundary: "same-workspace-sync",
      metamodelClass: ctxClass,
      workspaceSyncEnabled: true,
      mandateAllowsContextTransfer: false,
      repoPolicyAllowsContextTransfer: true,
    });
    // Kills a mutant that transfers context_log/context_summary on repo policy alone without mandate.
    expect(repoOnly.ok).toBe(false);

    const bothAllowed = evaluateEgress({
      boundary: "same-workspace-sync",
      metamodelClass: ctxClass,
      workspaceSyncEnabled: true,
      mandateAllowsContextTransfer: true,
      repoPolicyAllowsContextTransfer: true,
    });
    // Kills a mutant that blocks D10 context transfer even when both mandate and repo policy allow it.
    expect(bothAllowed.ok).toBe(true);
  }

  const secretRecord = makeBaselineRecord(
    "scope:ws-alpha",
    "memory.recall.study/v1",
    "Contact alice@example.com with secret token AKIA1234567890ABCDEF",
  );
  const d7BlockedArmor = await redactWithArmor({
    ...baselineArmorInput,
    request: { ...redactionReq, source_record: secretRecord },
  });
  // Kills a mutant that stamps PiiArmorStampV1 on redacted output containing a D7 secret/PII hit.
  expect(d7BlockedArmor.ok).toBe(false);
  if (!d7BlockedArmor.ok) {
    // Kills a mutant that uses wrong refusal code when D7 blocks PII armor redaction.
    expect(d7BlockedArmor.error.code).toBe("UNAUTHORIZED");
  }

  const notPseudonymized = await redactWithArmor({
    ...baselineArmorInput,
    d33Pseudonymized: false,
  });
  // Kills a mutant that stamps PiiArmorStampV1 when d33Pseudonymized is false.
  expect(notPseudonymized.ok).toBe(false);
  if (!notPseudonymized.ok) {
    // Kills a mutant that uses wrong refusal code for unpseudonymized armor request.
    expect(notPseudonymized.error.code).toBe("UNAUTHORIZED");
  }

  const badActorPseudo = await redactWithArmor({
    ...baselineArmorInput,
    actorPseudoId: "raw-email@example.com",
  });
  // Kills a mutant that accepts a raw actor identifier instead of a D33 actor_pseudo digest.
  expect(badActorPseudo.ok).toBe(false);

  const throwingPort = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1", {
    redactImpl: async () => {
      throw new Error("boom secret");
    },
  }).port;
  const portThrew = await redactWithArmor({
    ...baselineArmorInput,
    authorizationPort: throwingPort,
  });
  // Kills a mutant that lets AuthorizationPort.redact exceptions escape instead of failing closed.
  expect(portThrew.ok).toBe(false);
  if (!portThrew.ok) {
    // Kills a mutant that misclassifies a throwing AuthorizationPort.redact call.
    expect(portThrew.error.code).toBe("POLICY_UNAVAILABLE");
  }

  const leakyPort = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1", {
    redactImpl: async (req) => {
      const payloadWithDerivation: CandidatePayloadV2 = {
        ...makeBaselineCandidate("scope:ws-alpha", "memory.recall.study/v1", "Clean note"),
        derivation: {
          source_record_ids: ["mem_src1"],
          transform_ref: "test:transform",
          transform_receipt_digest: engramMemory.receiptDigest("tr", { x: 1 }),
        },
      };
      const outDigest = engramMemory.knowledgePayloadDigest(payloadWithDerivation);
      const body = {
        payload: payloadWithDerivation,
        source_record_digest: req.source_record.record_digest,
        output_payload_digest: outDigest,
        policy_version: "armor-policy/v1",
      };
      return {
        ok: true,
        value: { ...body, receipt_digest: engramMemory.receiptDigest("redaction-result", body) },
      };
    },
  }).port;
  const leakyDirectiveRes = await redactWithArmor({
    ...baselineArmorInput,
    authorizationPort: leakyPort,
  });
  // Kills a mutant that trusts AuthorizationPort.redact output retaining disallowed derivation lineage.
  expect(leakyDirectiveRes.ok).toBe(false);
  if (!leakyDirectiveRes.ok) {
    // Kills a mutant that returns wrong refusal code when redacted payload violates directive allowlist.
    expect(leakyDirectiveRes.error.code).toBe("UNAUTHORIZED");
  }

  const protoEgress = evaluateEgress(
    makeProtoPoisoned({
      boundary: "same-workspace-sync",
      metamodelClass: "typed_node",
      workspaceSyncEnabled: true,
    }),
  );
  // Kills a mutant whose strict decoder accepts an own __proto__ key on egress evaluation.
  expect(protoEgress.ok).toBe(false);

  const getterEgress = evaluateEgress(
    makeGetterObject(
      { boundary: "same-workspace-sync", metamodelClass: "typed_node", workspaceSyncEnabled: true },
      "workspaceSyncEnabled",
      true,
    ),
  );
  // Kills a mutant whose strict decoder evaluates getter accessors instead of requiring own data properties.
  expect(getterEgress.ok).toBe(false);

  const proxyEgress = evaluateEgress(makeThrowingProxy());
  // Kills a mutant that throws on hostile Proxy input instead of returning INVALID_SCHEMA.
  expect(proxyEgress.ok).toBe(false);
  if (!proxyEgress.ok) {
    // Kills a mutant that returns an unexpected error code on Proxy decode failure.
    expect(proxyEgress.error.code).toBe("INVALID_SCHEMA");
  }
});

it("revoking memory.capture.session/v1 blocks capture with AUTHORIZATION_REVOKED", async () => {
  const createController = PRIVACY_API.createPurposeRevocationControllerV1 as () => {
    revokePurpose(input: unknown): Result<unknown>;
    checkPurposeAuthorization(input: unknown): Result<unknown>;
    wrapAuthorizationPort(inner: AuthorizationPort, options?: unknown): AuthorizationPort;
    wrapMemoryPort(inner: MemoryPortV2, options?: unknown): MemoryPortV2;
  };
  const decorateMemoryPort = PRIVACY_API.wrapMemoryPortWithPurposeRevocationV1 as (
    inner: MemoryPortV2,
    controller: unknown,
    options?: unknown,
  ) => MemoryPortV2;
  // Kills a mutant that omits exporting createPurposeRevocationControllerV1 from engram-memory.
  expect(typeof createController).toBe("function");
  // Kills a mutant that omits exporting the MemoryPortV2 purpose-revocation decorator from study-window.ts.
  expect(typeof decorateMemoryPort).toBe("function");

  const controller = createController();
  const scopeRef = "scope:ws-alpha";
  const { port: innerAuth, issuedReceipts } = makeTestAuthorizationPort(scopeRef);
  const wrappedAuth = controller.wrapAuthorizationPort(innerAuth);
  const store = engramMemory.createInMemoryCanonicalMemoryStoreV1({
    clock: { now: () => T0_INSTANT },
  });
  const rawMemoryPort = engramMemory.createMemoryPortV2({
    canonical_store: store,
    authorization: wrappedAuth,
    admission_policy: {
      policy_id: "adm-pol",
      policy_version: "1.0.0",
      async decide(req) {
        const body = {
          policy_id: "adm-pol",
          policy_version: "1.0.0",
          record_digest: req.record_digest,
          decision: "accept" as const,
          issued_at: T0_INSTANT,
        };
        return {
          ok: true,
          value: { ...body, receipt_digest: engramMemory.receiptDigest("admission-decision", body) },
        };
      },
    },
    allow_unfenced_memory_store: true,
    crypto: makeInMemoryCryptoPort(),
    activity_sources: [],
    clock: { now: () => T0_INSTANT },
  });
  let innerCaptureCalls = 0;
  const spyingInnerPort: MemoryPortV2 = {
    ...rawMemoryPort,
    async capture(request) {
      innerCaptureCalls += 1;
      return rawMemoryPort.capture(request);
    },
  };
  const memoryPort = decorateMemoryPort(spyingInnerPort, controller);

  const makeCaptureReq = (idKey: string, seq: string, purposeRef: string, contextRef?: string) => {
    const payload = makeBaselineCandidate(scopeRef, purposeRef, `Captured fact ${idKey}`);
    const payloadDigest = engramMemory.knowledgePayloadDigest(payload);
    return {
      schema_version: 2 as const,
      idempotency_key: idKey,
      payload,
      evidence: {
        evidence_ref: `ev:${idKey}`,
        evidence_digest: payloadDigest,
        citation_ids: ["cit-1"],
      },
      authorization:
        contextRef === undefined
          ? { credential: "cred-alpha" }
          : { credential: "cred-alpha", context_ref: contextRef },
      source_order: { source_ref: "session:s1", sequence: seq },
      deadline_at: T_DEADLINE,
      cancellation_ref: `cancel:${idKey}`,
    };
  };

  const preCapture = await memoryPort.capture(
    makeCaptureReq("capture-idem-key-0001", "1", "memory.capture.session/v1", "memory.capture.session/v1"),
  );
  // Kills a mutant that blocks valid capture before memory.capture.session/v1 is revoked.
  expect(preCapture.ok).toBe(true);
  const captureReceiptBeforeRevoke = issuedReceipts[0]!.receipt_digest;
  const candidateId = preCapture.ok ? preCapture.value.candidate_id! : "";

  const admitted = await memoryPort.requestAdmission({
    candidate_id: candidateId,
    authorization: { credential: "cred-alpha" },
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant that breaks requestAdmission delegation through the decorated MemoryPortV2.
  expect(admitted.ok).toBe(true);
  const admittedRecordId = admitted.ok ? admitted.value.record_id! : "";

  const hmiBefore = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    purposeRef: "memory.capture.hmi/v1",
  });
  // Kills a mutant that blocks memory.capture.hmi/v1 before any revocation occurs.
  expect(hmiBefore.ok).toBe(true);

  const revoked = controller.revokePurpose({
    scopeRef,
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that refuses a valid memory.capture.session/v1 revocation command.
  expect(revoked.ok).toBe(true);
  if (revoked.ok) {
    const rec = revoked.value as { readonly receiptDigest: Digest; readonly revocationEpoch: string };
    // Kills a mutant that omits a canonical digest on PurposeRevocationReceiptV1.
    expect(rec.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Kills a mutant that fails to increment revocationEpoch past "0".
    expect(rec.revocationEpoch).toBe("1");
  }

  const callsBeforeRevokedCapture = innerCaptureCalls;
  const postCapture = await memoryPort.capture(
    makeCaptureReq("capture-idem-key-0002", "2", "memory.capture.session/v1", "memory.capture.session/v1"),
  );
  // Kills a mutant that permits capture after memory.capture.session/v1 was revoked.
  expect(postCapture.ok).toBe(false);
  if (!postCapture.ok) {
    // Kills a mutant that returns a code other than AUTHORIZATION_REVOKED for revoked capture.
    expect(postCapture.error.code).toBe("AUTHORIZATION_REVOKED");
  }
  // Kills a mutant that delegates to inner.capture before checking revocation on the decorated port.
  expect(innerCaptureCalls).toBe(callsBeforeRevokedCapture);

  // Unrevoked context_ref paired with a revoked payload.purpose_ref MUST be refused before delegating.
  const spoofedContextCapture = await memoryPort.capture(
    makeCaptureReq("capture-idem-key-spoof", "3", "memory.capture.session/v1", "memory.capture.hmi/v1"),
  );
  // Kills a mutant that lets an unrevoked context_ref bypass a revoked payload.purpose_ref.
  expect(spoofedContextCapture.ok).toBe(false);
  if (!spoofedContextCapture.ok) {
    // Kills a mutant returning a code other than AUTHORIZATION_REVOKED for unrevoked context_ref + revoked payload purpose.
    expect(spoofedContextCapture.error.code).toBe("AUTHORIZATION_REVOKED");
  }
  // Kills a mutant that delegates to inner.capture when context_ref is unrevoked but payload.purpose_ref is revoked.
  expect(innerCaptureCalls).toBe(callsBeforeRevokedCapture);

  // Recall after capture revocation MUST remain served through the decorated port.
  const recallAfterCaptureRevoke = await memoryPort.recall({
    query: "Captured fact capture-idem-key-0001",
    purpose_ref: "memory.recall.contextual/v1",
    authorization: { credential: "cred-alpha", context_ref: "memory.recall.contextual/v1" },
    capability_policy: { minimum_channels: "lexical", network: "forbid" },
    budgets: {
      max_candidates: 20,
      max_results: 10,
      max_packet_bytes: 65_536,
      deadline_at: T_DEADLINE,
    },
  });
  // Kills a mutant that blocks recall after capture revocation through the decorated port.
  expect(recallAfterCaptureRevoke.ok).toBe(true);
  if (recallAfterCaptureRevoke.ok) {
    // Kills a mutant that drops admitted records from recall after capture revocation.
    expect(recallAfterCaptureRevoke.value.records.map((entry) => entry.record.record_id)).toEqual([
      admittedRecordId,
    ]);
  }

  const revalAfter = await wrappedAuth.revalidate(captureReceiptBeforeRevoke, T1_INSTANT);
  // Kills a mutant that keeps an earlier capture receipt valid on revalidate after capture revocation.
  expect(revalAfter.ok).toBe(true);
  if (revalAfter.ok) {
    // Kills a mutant that reports valid: true on revalidate of a revoked capture receipt.
    expect(revalAfter.value.valid).toBe(false);
    // Kills a mutant that reports a reason other than "revoked" on revoked capture receipt revalidation.
    expect(revalAfter.value.reason).toBe("revoked");
  }

  const directCheck = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that allows direct checkPurposeAuthorization after capture revocation.
  expect(directCheck.ok).toBe(false);
  if (!directCheck.ok) {
    // Kills a mutant that returns wrong error code on direct checkPurposeAuthorization after revocation.
    expect(directCheck.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const hmiStillOpen = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    purposeRef: "memory.capture.hmi/v1",
  });
  // Kills a mutant that conflates memory.capture.session/v1 revocation with memory.capture.hmi/v1.
  expect(hmiStillOpen.ok).toBe(true);

  const revokeAllCapture = controller.revokePurpose({
    scopeRef,
    purpose: "memory.capture.*",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that rejects wildcard memory.capture.* revocation.
  expect(revokeAllCapture.ok).toBe(true);

  const hmiBlocked = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    purposeRef: "memory.capture.hmi/v1",
  });
  // Kills a mutant that fails to revoke memory.capture.hmi/v1 when memory.capture.* is revoked.
  expect(hmiBlocked.ok).toBe(false);
  if (!hmiBlocked.ok) {
    // Kills a mutant that returns wrong code for wildcard-revoked HMI capture.
    expect(hmiBlocked.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const crossNamespaceCapture = await memoryPort.capture(
    makeCaptureReq("capture-idem-key-0004", "4", "memory.recall.contextual/v1", "memory.recall.contextual/v1"),
  );
  // Kills a mutant that lets a recall purpose authorize a capture operation.
  expect(crossNamespaceCapture.ok).toBe(false);
  if (!crossNamespaceCapture.ok) {
    // Kills a mutant that returns wrong code for recall-purpose misuse on capture.
    expect(crossNamespaceCapture.error.code).toBe("UNAUTHORIZED");
  }

  // Frozen EVOL AuthorizationResourceV1 carries no purpose_ref; wrapAuthorizationPort accepts it on unrevoked scopes.
  const freshCtrl = createController();
  const { port: freshInnerAuth } = makeTestAuthorizationPort(scopeRef);
  const freshWrappedAuth = freshCtrl.wrapAuthorizationPort(freshInnerAuth);
  const frozenResourceAuth = await freshWrappedAuth.authorize({
    operation: "capture",
    resource: { scope_ref: scopeRef },
    resource_digest: engramMemory.authorizationResourceDigest("capture", { scope_ref: scopeRef }),
    context: { credential: "cred-alpha" },
    issued_at: T0_INSTANT,
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant where wrapAuthorizationPort still demands non-EVOL resource.purpose_ref on frozen AuthorizationResourceV1.
  expect(frozenResourceAuth.ok).toBe(true);

  const principalCtrl = createController();
  const revPrincipal = principalCtrl.revokePurpose({
    scopeRef,
    principalRef: "agent-a",
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that rejects principal-scoped capture revocation.
  expect(revPrincipal.ok).toBe(true);

  const agentABlocked = principalCtrl.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    principalRef: "agent-a",
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that fails to block a principal whose capture grant was revoked.
  expect(agentABlocked.ok).toBe(false);
  if (!agentABlocked.ok) {
    // Kills a mutant that returns wrong code for principal-revoked capture.
    expect(agentABlocked.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const agentBAllowed = principalCtrl.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    principalRef: "agent-b",
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that revokes other principals when only agent-a was revoked.
  expect(agentBAllowed.ok).toBe(true);

  const badPurpose = controller.revokePurpose({
    scopeRef,
    purpose: "memory.unknown/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that accepts an unknown purpose string in revokePurpose.
  expect(badPurpose.ok).toBe(false);
  if (!badPurpose.ok) {
    // Kills a mutant that returns wrong code for unknown purpose in revokePurpose.
    expect(badPurpose.error.code).toBe("INVALID_SCHEMA");
  }

  const protoRevoke = controller.revokePurpose(
    makeProtoPoisoned({ scopeRef, purpose: "memory.capture.session/v1", revokedAt: T1_INSTANT }),
  );
  // Kills a mutant that allows __proto__ key in revokePurpose input.
  expect(protoRevoke.ok).toBe(false);
});

it("a deny-list hit is withheld as withheld_d7", async () => {
  const hashTerm = PRIVACY_API.hashConfidentialTermV1 as (input: unknown) => Result<Digest>;
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<unknown>;
  const validateDenyList = PRIVACY_API.validateConfidentialityDenyListV1 as (input: unknown) => Result<unknown>;
  const screenDenyList = PRIVACY_API.screenForDenyListV1 as (
    denyList: unknown,
    surface: unknown,
    options?: unknown,
  ) => Result<{
    readonly allowed: boolean;
    readonly disposition: "allow" | "withheld_d7";
    readonly engineVerdict: "allow" | "withheld";
    readonly denyListVersion: string;
    readonly denyListDigest: Digest;
    readonly matchedRules: readonly string[];
    readonly receiptDigest: Digest;
  }>;

  // Kills a mutant that omits exporting deny-list helpers from engram-memory.
  expect(typeof hashTerm).toBe("function");
  // Kills a mutant that omits exporting createConfidentialityDenyListV1.
  expect(typeof createDenyList).toBe("function");
  // Kills a mutant that omits exporting validateConfidentialityDenyListV1.
  expect(typeof validateDenyList).toBe("function");
  // Kills a mutant that omits exporting screenForDenyListV1.
  expect(typeof screenDenyList).toBe("function");

  const saltedRes = hashTerm({ term: "Project-Nightingale", salt: "d7-salt-1" });
  const saltedPhraseRes = hashTerm({ term: "Project Atlas", salt: "d7-salt-1" });
  // Kills a mutant that fails to hash a confidential term with salt.
  expect(saltedRes.ok && saltedPhraseRes.ok).toBe(true);
  const saltedNfdRes = hashTerm({ term: "Café-Noir".normalize("NFD"), salt: "d7-salt-1" });
  const saltedNfcRes = hashTerm({ term: "Café-Noir".normalize("NFC"), salt: "d7-salt-1" });
  // Kills a mutant that fails to NFC-normalize salted terms before hashing.
  expect(saltedNfdRes.ok && saltedNfcRes.ok && saltedNfdRes.value === saltedNfcRes.value).toBe(true);

  const baselineInput = {
    version: "d7-v1",
    saltedTermHashes: [
      saltedRes.ok ? saltedRes.value : (`sha256:${"0".repeat(64)}` as Digest),
      saltedPhraseRes.ok ? saltedPhraseRes.value : (`sha256:${"0".repeat(64)}` as Digest),
    ],
    deterministicPatterns: ["TOPSECRET-[0-9]{4}"],
    piiCategoryRules: [
      "email",
      "phone",
      "national-id",
      "iban",
      "secret-token",
      "private-key",
      "client-program-code",
    ],
  };
  const created = createDenyList(baselineInput);
  // Kills a mutant that refuses a complete valid ConfidentialityDenyListV1.
  expect(created.ok).toBe(true);
  const denyList = created.ok ? (created.value as Record<string, unknown>) : undefined;

  const validated = validateDenyList(denyList);
  // Kills a mutant that rejects a freshly created ConfidentialityDenyListV1.
  expect(validated.ok).toBe(true);

  const cleanText = "Release 0.38.6 verified on 2026-11-22 with zero findings.";
  const cleanResult = screenDenyList(denyList, { summary: cleanText }, { termSalt: "d7-salt-1" });
  // Kills a mutant that false-positives on ISO dates or SemVer strings.
  expect(cleanResult.ok).toBe(true);
  if (cleanResult.ok) {
    // Kills a mutant that withholds clean text.
    expect(cleanResult.value.allowed).toBe(true);
    // Kills a mutant that reports wrong disposition for clean text.
    expect(cleanResult.value.disposition).toBe("allow");
    // Kills a mutant that reports wrong engineVerdict for clean text.
    expect(cleanResult.value.engineVerdict).toBe("allow");
    // Kills a mutant that populates matchedRules on clean text.
    expect(cleanResult.value.matchedRules).toEqual([]);
  }

  const hitCases: ReadonlyArray<readonly [string, unknown, string]> = [
    ["salted-term", "Discussed project-nightingale timeline", "project-nightingale"],
    ["salted-phrase", "Discussed Project Atlas.", "Project Atlas"],
    ["pattern", "Memo references TOPSECRET-4821 dossier", "TOPSECRET-4821"],
    ["email", "Reach owner at alice.dupont@example.org", "alice.dupont@example.org"],
    ["phone", "Call +33 6 12 34 56 78 for confirmation", "+33 6 12 34 56 78"],
    ["national-id", "Identifier 123-45-6789 recorded", "123-45-6789"],
    ["iban", "Transfer to FR76 3000 6000 0112 3456 7890 189", "FR76 3000 6000 0112 3456 7890 189"],
    ["aws-key", "Found AKIA1234567890ABCDEF in log", "AKIA1234567890ABCDEF"],
    ["gh-token", "Token ghp_abcdefghijklmnopqrstuvwxyz123456", "ghp_abcdefghijklmnopqrstuvwxyz123456"],
    ["cred-assign", "Config password=hunter2_secret", "hunter2_secret"],
    ["cred-url", "Proxy https://admin:s3cr3tpass@internal.local/db", "s3cr3tpass"],
    ["private-key", "-----BEGIN RSA PRIVATE KEY-----\nabc", "BEGIN RSA PRIVATE KEY"],
    ["client-code", "Engagement CLIENT-ACME-001 brief", "CLIENT-ACME-001"],
    ["object-key", { "alice@example.org": "benign value" }, "alice@example.org"],
  ];

  for (const [label, surface, secretNeedle] of hitCases) {
    const hit = screenDenyList(denyList, surface, { termSalt: "d7-salt-1" });
    // Kills a mutant that throws or fails to return ok screening result on D7 hit.
    expect(hit.ok, label).toBe(true);
    if (hit.ok) {
      // Kills a mutant that allows a D7-matching surface through.
      expect(hit.value.allowed, label).toBe(false);
      // Kills a mutant that fails to classify a D7 hit as withheld_d7.
      expect(hit.value.disposition, label).toBe("withheld_d7");
      // Kills a mutant that returns "allow" engineVerdict on a D7 hit.
      expect(hit.value.engineVerdict, label).toBe("withheld");
      // Kills a mutant that omits matched rule diagnostics on a D7 hit.
      expect(hit.value.matchedRules.length, label).toBeGreaterThan(0);
      // Kills a mutant that leaks matched secret plaintext into matchedRules or screening output.
      expect(JSON.stringify(hit.value), label).not.toContain(secretNeedle);
    }
  }

  // Real SessionFrontEngineV1 integration: withheld_d7 source disposition + d7BlockedKeys.
  const { store: sfStore } = makeInMemorySessionFrontStore();
  const sfEngine = engramMemory.createSessionFrontEngineV1(sfStore);
  const worktreeId = `wt:${"a".repeat(64)}`;
  const sessionRef = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(7),
    "sess-d7",
  );
  const actorRef = expectedHmacPseudonym(
    "actor_pseudo:",
    "engram/d33/actor/v1\0",
    makeKeyBytes(7),
    "actor-d7",
  );
  const evClean = await sfEngine.recordEvent(
    {
      scope: PRIVACY_SCOPE_A,
      idempotencyKey: "idem:v1:" + "1".repeat(64),
      worktreeId,
      sessionRef,
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      actorRef,
      cloneId: "clone-1",
      assignmentDigest: null,
      occurredAt: T0_INSTANT,
      payload: { kind: "speech_turn", text: "clean event" },
      queueExtraction: true,
    },
    { syncState: "synced" },
  );
  const evHit = await sfEngine.recordEvent(
    {
      scope: PRIVACY_SCOPE_A,
      idempotencyKey: "idem:v1:" + "2".repeat(64),
      worktreeId,
      sessionRef,
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      actorRef,
      cloneId: "clone-1",
      assignmentDigest: null,
      occurredAt: T0_INSTANT,
      payload: { kind: "speech_turn", text: "event with secret" },
      queueExtraction: true,
    },
    { syncState: "synced" },
  );
  // Kills a mutant breaking baseline session-front event recording in the D7 integration test.
  expect(evClean.ok && evHit.ok).toBe(true);
  if (evClean.ok && evHit.ok) {
    const extRes = await sfEngine.recordExtraction(
      {
        scope: PRIVACY_SCOPE_A,
        idempotencyKey: "idem:v1:" + "3".repeat(64),
        worktreeId,
        sessionRef,
        purposeRef: "memory.capture.session/v1",
        retention: { derivative_rule: "retain" },
        sourceEventRecordIds: [evClean.value.eventRecordId, evHit.value.eventRecordId],
        extractor: { kind: "light-permanent-llm" },
        candidates: [
          {
            localCandidateKey: "cand-clean",
            domain: "project",
            sourceEventRecordIds: [evClean.value.eventRecordId],
            summary: "Public architecture note",
          },
          {
            localCandidateKey: "cand-secret",
            domain: "project",
            sourceEventRecordIds: [evHit.value.eventRecordId],
            summary: "Owner email bob@secret-corp.example",
          },
        ],
      },
      (candidate) => {
        const screened = screenDenyList(denyList, candidate, { termSalt: "d7-salt-1" });
        return screened.ok ? { ok: true, value: screened.value.engineVerdict } : screened;
      },
    );
    // Kills a mutant that fails to integrate screenForDenyListV1 with SessionFrontEngineV1.recordExtraction.
    expect(extRes.ok).toBe(true);
    if (extRes.ok) {
      // Kills a mutant that fails to record blocked D7 candidate keys in d7BlockedKeys.
      expect(extRes.value.d7BlockedKeys).toEqual(["cand-secret"]);
      // Kills a mutant that persists a D7-withheld candidate into extraction outcomes.
      expect(extRes.value.outcomes.map((o) => o.localCandidateKey)).toEqual(["cand-clean"]);
      // Kills a mutant that fails to mark the blocked source event as withheld_d7.
      expect(extRes.value.sourceDispositions[evHit.value.eventRecordId]).toBe("withheld_d7");
      // Kills a mutant that mislabels the clean source event instead of proposed.
      expect(extRes.value.sourceDispositions[evClean.value.eventRecordId]).toBe("proposed");
    }
  }

  // Single-field negative cases on ConfidentialityDenyListV1.
  const tamperedDigest = validateDenyList({ ...denyList, version: "d7-v2" });
  // Kills a mutant that skips verifying digestSha256 on ConfidentialityDenyListV1.
  expect(tamperedDigest.ok).toBe(false);
  if (!tamperedDigest.ok) {
    // Kills a mutant that returns a code other than INVALID_DIGEST for tampered deny-list digest.
    expect(tamperedDigest.error.code).toBe("INVALID_DIGEST");
  }

  const missingList = screenDenyList(undefined, "hello");
  // Kills a mutant that allows screening when ConfidentialityDenyListV1 is absent.
  expect(missingList.ok).toBe(false);
  if (!missingList.ok) {
    // Kills a mutant that fails to return POLICY_UNAVAILABLE for absent deny-list.
    expect(missingList.error.code).toBe("POLICY_UNAVAILABLE");
  }

  const badRegex = createDenyList({ ...baselineInput, deterministicPatterns: ["[unclosed"] });
  // Kills a mutant that accepts invalid RegExp syntax in deterministicPatterns.
  expect(badRegex.ok).toBe(false);
  if (!badRegex.ok) {
    // Kills a mutant that returns wrong code for invalid regex pattern.
    expect(badRegex.error.code).toBe("INVALID_SCHEMA");
  }

  const unknownCategory = createDenyList({ ...baselineInput, piiCategoryRules: ["blood-type"] });
  // Kills a mutant that admits unknown category names in piiCategoryRules.
  expect(unknownCategory.ok).toBe(false);
  if (!unknownCategory.ok) {
    // Kills a mutant that returns wrong code for unknown piiCategoryRules entry.
    expect(unknownCategory.error.code).toBe("INVALID_SCHEMA");
  }

  const emptyRules = createDenyList({
    version: "d7-empty",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: [],
  });
  // Kills a mutant that permits an empty vacuous deny-list with zero rules.
  expect(emptyRules.ok).toBe(false);
  if (!emptyRules.ok) {
    // Kills a mutant that returns wrong code for an empty deny-list.
    expect(emptyRules.error.code).toBe("INVALID_SCHEMA");
  }

  const sparsePatterns: unknown[] = [];
  sparsePatterns.length = 1;
  const sparseRes = createDenyList({ ...baselineInput, deterministicPatterns: sparsePatterns });
  // Kills a mutant whose strict decoder accepts sparse arrays in deterministicPatterns.
  expect(sparseRes.ok).toBe(false);

  const protoSurface = screenDenyList(denyList, makeProtoPoisoned({ a: "ok" }));
  // Kills a mutant whose strict decoder accepts __proto__ key in screened surface.
  expect(protoSurface.ok).toBe(false);
  if (!protoSurface.ok) {
    // Kills a mutant that fails to return INVALID_SCHEMA on __proto__ in screened surface.
    expect(protoSurface.error.code).toBe("INVALID_SCHEMA");
  }
});

it("an ad-hoc per-CLI retention fails", () => {
  const validateRetention = PRIVACY_API.validateHostRetentionV1 as (input: unknown) => Result<unknown>;
  // Kills a mutant that omits exporting validateHostRetentionV1 from engram-memory.
  expect(typeof validateRetention).toBe("function");

  const hostPolicy = {
    policyId: "host-audit-default-v1",
    auditWindowMs: 3_600_000,
    derivativeRule: "make-ineligible" as const,
  };
  const validOpenBaseline = {
    hostPolicy,
    retention: { derivative_rule: "make-ineligible" as const },
    firstAdmissionAt: T0_INSTANT,
    channelRetention: { kind: "unbounded" as const },
  };
  const validOpen = validateRetention(validOpenBaseline);
  // Kills a mutant that rejects a valid open-session retention matching the declared host policy.
  expect(validOpen.ok).toBe(true);

  const closedExpires = new Date(Date.parse(T1_INSTANT) + hostPolicy.auditWindowMs).toISOString();
  const validClosedBaseline = {
    hostPolicy,
    retention: {
      derivative_rule: "make-ineligible" as const,
      expires_at: closedExpires,
    },
    firstAdmissionAt: T0_INSTANT,
    closedAt: T1_INSTANT,
    channelRetention: { kind: "unbounded" as const },
  };
  const validClosed = validateRetention(validClosedBaseline);
  // Kills a mutant that rejects a valid closed-session retention matching host auditWindowMs.
  expect(validClosed.ok).toBe(true);

  // Single-field negative 1: explicit adHocTtlMs per-CLI override.
  const explicitAdHoc = validateRetention({
    ...validOpenBaseline,
    adHocTtlMs: 60_000,
  });
  // Kills a mutant that accepts an explicit ad-hoc per-CLI TTL override field.
  expect(explicitAdHoc.ok).toBe(false);
  if (!explicitAdHoc.ok) {
    // Kills a mutant that returns a code other than INVALID_SCHEMA on ad-hoc per-CLI TTL.
    expect(explicitAdHoc.error.code).toBe("INVALID_SCHEMA");
  }

  // Single-field negative 2: mismatched callerPolicyId attempting a per-CLI host policy override.
  const wrongCallerPolicy = validateRetention({
    ...validOpenBaseline,
    callerPolicyId: "cli-custom-policy",
  });
  // Kills a mutant that allows a per-CLI callerPolicyId different from the single declared hostPolicy.
  expect(wrongCallerPolicy.ok).toBe(false);
  if (!wrongCallerPolicy.ok) {
    // Kills a mutant that returns wrong error code for mismatched callerPolicyId.
    expect(wrongCallerPolicy.error.code).toBe("INVALID_SCHEMA");
  }

  // Single-field negative 3: per-CLI derivative_rule override.
  const wrongDerivativeRule = validateRetention({
    ...validOpenBaseline,
    retention: { derivative_rule: "retain" },
  });
  // Kills a mutant that permits a per-CLI derivative_rule overriding hostPolicy.derivativeRule.
  expect(wrongDerivativeRule.ok).toBe(false);
  if (!wrongDerivativeRule.ok) {
    // Kills a mutant that returns wrong error code for derivative_rule override.
    expect(wrongDerivativeRule.error.code).toBe("INVALID_SCHEMA");
  }

  // Single-field negative 4: ad-hoc expires_at on open session with unbounded channel retention.
  const adHocOpenExpiry = validateRetention({
    ...validOpenBaseline,
    retention: {
      derivative_rule: "make-ineligible",
      expires_at: "2026-11-20T12:30:00.000Z",
    },
  });
  // Kills a mutant that allows an ad-hoc per-CLI expires_at on an open unbounded session.
  expect(adHocOpenExpiry.ok).toBe(false);
  if (!adHocOpenExpiry.ok) {
    // Kills a mutant that returns wrong error code for ad-hoc open-session expires_at.
    expect(adHocOpenExpiry.error.code).toBe("INVALID_SCHEMA");
  }

  // Single-field negative 5: ad-hoc shorter per-CLI TTL on closed session.
  const adHocShorterClosed = validateRetention({
    ...validClosedBaseline,
    retention: {
      derivative_rule: "make-ineligible",
      expires_at: new Date(Date.parse(T1_INSTANT) + 60_000).toISOString(),
    },
  });
  // Kills a mutant that permits a shorter ad-hoc per-CLI TTL overriding the declared host auditWindowMs.
  expect(adHocShorterClosed.ok).toBe(false);
  if (!adHocShorterClosed.ok) {
    // Kills a mutant that returns wrong error code for ad-hoc closed-session TTL.
    expect(adHocShorterClosed.error.code).toBe("INVALID_SCHEMA");
  }

  // Single-field negative 6: unknown channel retention kind fails closed.
  const unknownChannel = validateRetention({
    ...validOpenBaseline,
    channelRetention: { kind: "per-cli-sliding", maxAgeMs: 60_000 },
  });
  // Kills a mutant that fails to refuse an unknown channel retention kind.
  expect(unknownChannel.ok).toBe(false);
  if (!unknownChannel.ok) {
    // Kills a mutant that returns wrong error code for unknown channel retention.
    expect(unknownChannel.error.code).toBe("INVALID_SCHEMA");
  }

  // Single-field negative 7: missing hostPolicy fails closed with POLICY_UNAVAILABLE.
  const missingHostPolicy = validateRetention({
    retention: { derivative_rule: "make-ineligible" },
    firstAdmissionAt: T0_INSTANT,
    channelRetention: { kind: "unbounded" },
  });
  // Kills a mutant that invents a default host policy when hostPolicy is absent.
  expect(missingHostPolicy.ok).toBe(false);
  if (!missingHostPolicy.ok) {
    // Kills a mutant that returns wrong error code when hostPolicy is missing.
    expect(missingHostPolicy.error.code).toBe("POLICY_UNAVAILABLE");
  }

  // Strict decoder negative: non-enumerable property & getter.
  const nonEnum = validateRetention(makeNonEnumerableObject(validOpenBaseline, "hidden", 1));
  // Kills a mutant whose strict decoder ignores non-enumerable own properties.
  expect(nonEnum.ok).toBe(false);

  const getter = validateRetention(makeGetterObject(validOpenBaseline, "firstAdmissionAt", T0_INSTANT));
  // Kills a mutant whose strict decoder accepts accessor properties on retention validation.
  expect(getter.ok).toBe(false);
});

it("an expires_at beyond the computed retention deadline fails", () => {
  const computeDeadline = PRIVACY_API.computeRetentionDeadlineV1 as (
    channelRetention: unknown,
    firstAdmissionAt: unknown,
  ) => Result<string | undefined>;
  const validateRetention = PRIVACY_API.validateHostRetentionV1 as (input: unknown) => Result<unknown>;

  // Kills a mutant that omits exporting computeRetentionDeadlineV1 from engram-memory.
  expect(typeof computeDeadline).toBe("function");

  const hostPolicy = {
    policyId: "host-audit-f15",
    auditWindowMs: 7_200_000,
    derivativeRule: "retain" as const,
  };
  const finiteChannel = { kind: "finite" as const, maxAgeMs: 1_800_000 };
  const deadlineRes = computeDeadline(finiteChannel, T0_INSTANT);
  // Kills a mutant that fails to compute a finite retention deadline from firstAdmissionAt + maxAgeMs.
  expect(deadlineRes.ok).toBe(true);
  const expectedChannelDeadline = new Date(Date.parse(T0_INSTANT) + 1_800_000).toISOString();
  if (deadlineRes.ok) {
    // Kills a mutant that computes the wrong millisecond deadline for finite channel retention.
    expect(deadlineRes.value).toBe(expectedChannelDeadline);
  }

  // Case A: open session with finite channel retention — exact deadline passes, +1 ms fails.
  const openFiniteValid = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain", expires_at: expectedChannelDeadline },
    firstAdmissionAt: T0_INSTANT,
    channelRetention: finiteChannel,
  });
  // Kills a mutant that rejects retention.expires_at equal to the exact computed channel deadline.
  expect(openFiniteValid.ok).toBe(true);

  const openFinitePlusOneMs = validateRetention({
    hostPolicy,
    retention: {
      derivative_rule: "retain",
      expires_at: new Date(Date.parse(expectedChannelDeadline) + 1).toISOString(),
    },
    firstAdmissionAt: T0_INSTANT,
    channelRetention: finiteChannel,
  });
  // Kills a mutant that allows expires_at 1 ms beyond the finite channel deadline.
  expect(openFinitePlusOneMs.ok).toBe(false);
  if (!openFinitePlusOneMs.ok) {
    // Kills a mutant that returns a code other than INVALID_SCHEMA when expires_at exceeds deadline.
    expect(openFinitePlusOneMs.error.code).toBe("INVALID_SCHEMA");
  }

  const openFiniteOmitted = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain" },
    firstAdmissionAt: T0_INSTANT,
    channelRetention: finiteChannel,
  });
  // Kills a mutant that lets omitting expires_at bypass a finite ContentPolicyV1 retention deadline.
  expect(openFiniteOmitted.ok).toBe(false);
  if (!openFiniteOmitted.ok) {
    // Kills a mutant that returns wrong error code when finite expires_at is omitted.
    expect(openFiniteOmitted.error.code).toBe("INVALID_SCHEMA");
  }

  // Case B: closed session where channelDeadline < hostAuditExpiresAt -> min is channelDeadline.
  const closedAt = "2026-11-20T12:10:00.000Z";
  const hostAuditExpiresAt = new Date(Date.parse(closedAt) + hostPolicy.auditWindowMs).toISOString();
  const minIsChannelValid = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain", expires_at: expectedChannelDeadline },
    firstAdmissionAt: T0_INSTANT,
    closedAt,
    channelRetention: finiteChannel,
  });
  // Kills a mutant that fails to clamp closed-session retention to min(hostAuditExpiresAt, channelDeadline).
  expect(minIsChannelValid.ok).toBe(true);

  const exceedsChannelViaHost = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain", expires_at: hostAuditExpiresAt },
    firstAdmissionAt: T0_INSTANT,
    closedAt,
    channelRetention: finiteChannel,
  });
  // Kills a mutant that uses hostAuditExpiresAt instead of Math.min when channelDeadline is tighter.
  expect(exceedsChannelViaHost.ok).toBe(false);
  if (!exceedsChannelViaHost.ok) {
    // Kills a mutant that returns wrong code when hostAuditExpiresAt outlives finite channelDeadline.
    expect(exceedsChannelViaHost.error.code).toBe("INVALID_SCHEMA");
  }

  // Case C: closed session where hostAuditExpiresAt < channelDeadline -> min is hostAuditExpiresAt.
  const longerChannel = { kind: "finite" as const, maxAgeMs: 86_400_000 };
  const longerChannelDeadline = new Date(Date.parse(T0_INSTANT) + 86_400_000).toISOString();
  const minIsHostValid = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain", expires_at: hostAuditExpiresAt },
    firstAdmissionAt: T0_INSTANT,
    closedAt,
    channelRetention: longerChannel,
  });
  // Kills a mutant that ignores hostAuditExpiresAt when channelDeadline is looser.
  expect(minIsHostValid.ok).toBe(true);

  const exceedsHostViaChannel = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain", expires_at: longerChannelDeadline },
    firstAdmissionAt: T0_INSTANT,
    closedAt,
    channelRetention: longerChannel,
  });
  // Kills a mutant that uses Math.max instead of Math.min across host and channel deadlines.
  expect(exceedsHostViaChannel.ok).toBe(false);
  if (!exceedsHostViaChannel.ok) {
    // Kills a mutant that returns wrong code when expires_at exceeds hostAuditExpiresAt.
    expect(exceedsHostViaChannel.error.code).toBe("INVALID_SCHEMA");
  }

  const badChannel = computeDeadline({ kind: "finite", maxAgeMs: 0 }, T0_INSTANT);
  // Kills a mutant that allows zero or non-positive maxAgeMs in finite channel retention.
  expect(badChannel.ok).toBe(false);

  const closedBeforeAdmission = validateRetention({
    hostPolicy,
    retention: { derivative_rule: "retain", expires_at: expectedChannelDeadline },
    firstAdmissionAt: T1_INSTANT,
    closedAt: T0_INSTANT,
    channelRetention: finiteChannel,
  });
  // Kills a mutant that accepts closedAt preceding firstAdmissionAt.
  expect(closedBeforeAdmission.ok).toBe(false);
});

it("pseudonyms are deterministic per scope", async () => {
  const createPseudonymizer = PRIVACY_API.createScopedPseudonymizerV1 as (keyProvider: unknown) => {
    pseudonymizeActor(input: unknown): Promise<Result<string>>;
    pseudonymizeSession(input: unknown): Promise<Result<string>>;
  };
  const isActorPseudo = PRIVACY_API.isActorPseudonymV1 as (value: unknown) => boolean;
  const isSessionPseudo = PRIVACY_API.isSessionPseudonymV1 as (value: unknown) => boolean;

  // Kills a mutant that omits exporting createScopedPseudonymizerV1 from engram-memory.
  expect(typeof createPseudonymizer).toBe("function");
  // Kills a mutant that omits exporting isActorPseudonymV1 from engram-memory.
  expect(typeof isActorPseudo).toBe("function");
  // Kills a mutant that omits exporting isSessionPseudonymV1 from engram-memory.
  expect(typeof isSessionPseudo).toBe("function");

  const keyA = makeKeyBytes(1);
  const keyB = makeKeyBytes(2);
  const keyC = makeKeyBytes(3);
  const keyAHex = Buffer.from(keyA).toString("hex");
  const keyMap = new Map<string, Uint8Array>([
    ["tenant-alpha:ws-alpha", keyA],
    ["tenant-alpha:ws-beta", keyB],
    ["tenant-beta:ws-alpha", keyC],
  ]);

  const spies = [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "debug").mockImplementation(() => {}),
  ];
  try {
    const pseudo = createPseudonymizer({
      getScopeKey(scope: SessionFrontScopeV1) {
        const key = keyMap.get(`${scope.tenantId}:${scope.workspaceId}`);
        if (!key) {
          return {
            ok: false,
            error: {
              code: "POLICY_UNAVAILABLE",
              operation: "capture",
              message: `missing key ${keyAHex}`,
              retryable: false,
            },
          };
        }
        return { ok: true, value: key };
      },
    });

    const actorA1 = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "alice@example.org",
    });
    const actorA2 = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "alice@example.org",
    });
    // Kills a mutant that fails on valid actor pseudonymization.
    expect(actorA1.ok && actorA2.ok).toBe(true);
    if (actorA1.ok && actorA2.ok) {
      const expected = expectedHmacPseudonym(
        "actor_pseudo:",
        "engram/d33/actor/v1\0",
        keyA,
        "alice@example.org",
      );
      // Kills a mutant whose actor pseudonym is non-deterministic within one scope.
      expect(actorA1.value).toBe(actorA2.value);
      // Kills a mutant that deviates from S1:875 HMAC-SHA256 domain formula.
      expect(actorA1.value).toBe(expected);
      // Kills a mutant whose isActorPseudonymV1 rejects valid actor_pseudo:<64hex>.
      expect(isActorPseudo(actorA1.value)).toBe(true);
      // Kills a mutant whose isSessionPseudonymV1 mistakenly accepts actor_pseudo:.
      expect(isSessionPseudo(actorA1.value)).toBe(false);
    }

    const nfdActor = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "e\u0301lise",
    });
    const nfcActor = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "\u00e9lise",
    });
    // Kills a mutant that forgets NFC normalization before HMAC-SHA256 (S1:875).
    expect(nfdActor.ok && nfcActor.ok && nfdActor.value === nfcActor.value).toBe(true);

    const sessA1 = await pseudo.pseudonymizeSession({
      scope: PRIVACY_SCOPE_A,
      sessionId: "alice@example.org",
    });
    // Kills a mutant that fails on valid session pseudonymization.
    expect(sessA1.ok).toBe(true);
    if (sessA1.ok && actorA1.ok) {
      const expectedSess = expectedHmacPseudonym(
        "sess_pseudo:",
        "engram/d33/session/v1\0",
        keyA,
        "alice@example.org",
      );
      // Kills a mutant that deviates from S1:876 session HMAC-SHA256 domain formula.
      expect(sessA1.value).toBe(expectedSess);
      // Kills a mutant that reuses the same HMAC domain for actor and session IDs.
      expect(sessA1.value.slice("sess_pseudo:".length)).not.toBe(
        actorA1.value.slice("actor_pseudo:".length),
      );
      // Kills a mutant whose isSessionPseudonymV1 rejects valid sess_pseudo:<64hex>.
      expect(isSessionPseudo(sessA1.value)).toBe(true);
    }

    // Cross-scope unlinkability across different workspace and different tenant.
    const actorB = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_B,
      canonicalActorId: "alice@example.org",
    });
    const actorC = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_C,
      canonicalActorId: "alice@example.org",
    });
    // Kills a mutant that fails on other valid scopes.
    expect(actorB.ok && actorC.ok).toBe(true);
    if (actorA1.ok && actorB.ok && actorC.ok) {
      // Kills a mutant that makes pseudonyms linkable across workspaces.
      expect(actorB.value).not.toBe(actorA1.value);
      // Kills a mutant that makes pseudonyms linkable across tenants.
      expect(actorC.value).not.toBe(actorA1.value);
      // Kills a mutant that produces colliding pseudonyms across distinct scopes.
      expect(actorC.value).not.toBe(actorB.value);
    }

    // Accidental cross-scope key reuse MUST fail closed (unlinkability invariant).
    const reusedKeyPseudo = createPseudonymizer({
      getScopeKey() {
        return { ok: true, value: keyA };
      },
    });
    const firstScope = await reusedKeyPseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "bob",
    });
    const secondScope = await reusedKeyPseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_B,
      canonicalActorId: "bob",
    });
    // Kills a mutant that rejects the first scope bound to a valid 256-bit key.
    expect(firstScope.ok).toBe(true);
    // Kills a mutant that permits the same K_pseudo bytes to be reused across two different scopes.
    expect(secondScope.ok).toBe(false);
    if (!secondScope.ok) {
      // Kills a mutant that returns wrong code on cross-scope key reuse refusal.
      expect(secondScope.error.code).toBe("POLICY_UNAVAILABLE");
      // Kills a mutant that leaks raw key hex or raw actor id into refusal messages.
      expect(secondScope.error.message).not.toContain(keyAHex);
    }

    // Missing scope key + throwing key provider + invalid key lengths + all-zero key.
    const missingScope = await pseudo.pseudonymizeActor({
      scope: { tenantId: "tenant-z", workspaceId: "ws-z" },
      canonicalActorId: "secret-user-name",
    });
    // Kills a mutant that succeeds when the scope key custodian returns unavailable.
    expect(missingScope.ok).toBe(false);
    if (!missingScope.ok) {
      // Kills a mutant that echoes key custodian error message containing key material.
      expect(missingScope.error.message).not.toContain(keyAHex);
      // Kills a mutant that echoes raw actor ID into error message.
      expect(missingScope.error.message).not.toContain("secret-user-name");
    }

    for (const badKey of [new Uint8Array(31), new Uint8Array(33), new Uint8Array(32), "not-bytes"]) {
      const badCustodian = createPseudonymizer({
        getScopeKey() {
          return { ok: true, value: badKey };
        },
      });
      const res = await badCustodian.pseudonymizeSession({
        scope: PRIVACY_SCOPE_A,
        sessionId: "sess-bad-key",
      });
      // Kills a mutant that accepts non-256-bit, all-zero, or non-Uint8Array K_pseudo keys.
      expect(res.ok).toBe(false);
      if (!res.ok) {
        // Kills a mutant that returns wrong error code for invalid K_pseudo material.
        expect(res.error.code).toBe("POLICY_UNAVAILABLE");
      }
    }

    const throwingCustodian = createPseudonymizer({
      getScopeKey() {
        throw new Error(`custodian failed with ${keyAHex}`);
      },
    });
    const threwRes = await throwingCustodian.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "alice",
    });
    // Kills a mutant that lets key provider exceptions escape instead of failing closed.
    expect(threwRes.ok).toBe(false);
    if (!threwRes.ok) {
      // Kills a mutant that leaks thrown key custodian exception text into MemoryErrorV1.message.
      expect(threwRes.error.message).not.toContain(keyAHex);
    }

    // Strict decoder cases on pseudonymizeActor.
    const nulActor = await pseudo.pseudonymizeActor({
      scope: PRIVACY_SCOPE_A,
      canonicalActorId: "alice\0bob",
    });
    // Kills a mutant that allows NUL bytes inside actor identifiers.
    expect(nulActor.ok).toBe(false);

    const protoActor = await pseudo.pseudonymizeActor(
      makeProtoPoisoned({ scope: PRIVACY_SCOPE_A, canonicalActorId: "alice" }),
    );
    // Kills a mutant that allows __proto__ key in pseudonymizeActor input.
    expect(protoActor.ok).toBe(false);

    // Verify ZERO console logs across every pseudonym operation and error path.
    for (const spy of spies) {
      // Kills a mutant that logs K_pseudo or any diagnostic to console.* during pseudonymization.
      expect(spy).not.toHaveBeenCalled();
    }
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
});

it("recall stays available after capture is revoked", async () => {
  const createController = PRIVACY_API.createPurposeRevocationControllerV1 as () => {
    revokePurpose(input: unknown): Result<unknown>;
    wrapAuthorizationPort(inner: AuthorizationPort): AuthorizationPort;
    wrapMemoryPort(inner: MemoryPortV2, options?: unknown): MemoryPortV2;
  };
  const decorateMemoryPort = PRIVACY_API.wrapMemoryPortWithPurposeRevocationV1 as (
    inner: MemoryPortV2,
    controller: unknown,
    options?: unknown,
  ) => MemoryPortV2;
  // Kills a mutant that omits exporting createPurposeRevocationControllerV1.
  expect(typeof createController).toBe("function");
  // Kills a mutant that omits exporting wrapMemoryPortWithPurposeRevocationV1.
  expect(typeof decorateMemoryPort).toBe("function");

  const controller = createController();
  const scopeRef = "scope:ws-alpha";
  const { port: innerAuth, issuedReceipts } = makeTestAuthorizationPort(scopeRef);
  const wrappedAuth = controller.wrapAuthorizationPort(innerAuth);
  const store = engramMemory.createInMemoryCanonicalMemoryStoreV1({
    clock: { now: () => T0_INSTANT },
  });
  const rawMemoryPort = engramMemory.createMemoryPortV2({
    canonical_store: store,
    authorization: wrappedAuth,
    admission_policy: {
      policy_id: "adm-pol",
      policy_version: "1.0.0",
      async decide(req) {
        const body = {
          policy_id: "adm-pol",
          policy_version: "1.0.0",
          record_digest: req.record_digest,
          decision: "accept" as const,
          issued_at: T0_INSTANT,
        };
        return {
          ok: true,
          value: { ...body, receipt_digest: engramMemory.receiptDigest("admission-decision", body) },
        };
      },
    },
    allow_unfenced_memory_store: true,
    crypto: makeInMemoryCryptoPort(),
    activity_sources: [],
    clock: { now: () => T0_INSTANT },
  });
  const memoryPort = decorateMemoryPort(rawMemoryPort, controller);

  const payload = makeBaselineCandidate(
    scopeRef,
    "memory.capture.session/v1",
    "Durable architecture invariant for recall survival.",
  );
  const payloadDigest = engramMemory.knowledgePayloadDigest(payload);
  const captured = await memoryPort.capture({
    schema_version: 2,
    idempotency_key: "recall-survival-idem-0001",
    payload,
    evidence: {
      evidence_ref: "ev:recall-survival",
      evidence_digest: payloadDigest,
      citation_ids: ["cit-1"],
    },
    authorization: { credential: "cred-alpha", context_ref: "memory.capture.session/v1" },
    source_order: { source_ref: "session:s1", sequence: "1" },
    deadline_at: T_DEADLINE,
    cancellation_ref: "cancel:recall-1",
  });
  // Kills a mutant that blocks initial capture before revocation.
  expect(captured.ok).toBe(true);
  const candidateId = captured.ok ? captured.value.candidate_id! : "";

  const admitted = await memoryPort.requestAdmission({
    candidate_id: candidateId,
    authorization: { credential: "cred-alpha" },
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant that fails to admit the captured record into accepted_current.
  expect(admitted.ok).toBe(true);
  const recordId = admitted.ok ? admitted.value.record_id! : "";

  const recallReq = (purposeRef: string) => ({
    query: "Durable architecture invariant",
    purpose_ref: purposeRef,
    authorization: { credential: "cred-alpha", context_ref: purposeRef },
    capability_policy: { minimum_channels: "lexical" as const, network: "forbid" as const },
    budgets: {
      max_candidates: 20,
      max_results: 10,
      max_packet_bytes: 65_536,
      deadline_at: T_DEADLINE,
    },
  });

  const recallBefore = await memoryPort.recall(recallReq("memory.recall.contextual/v1"));
  // Kills a mutant that breaks contextual recall before capture revocation.
  expect(recallBefore.ok).toBe(true);
  const recallReceiptBefore = issuedReceipts.find((r) => r.operation === "recall_current")!.receipt_digest;

  // Revoke capture (both session and wildcard capture.*).
  const revSession = controller.revokePurpose({
    scopeRef,
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  const revWildcard = controller.revokePurpose({
    scopeRef,
    purpose: "memory.capture.*",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that fails to revoke capture purposes.
  expect(revSession.ok && revWildcard.ok).toBe(true);

  const captureAfter = await memoryPort.capture({
    schema_version: 2,
    idempotency_key: "recall-survival-idem-0002",
    payload,
    evidence: {
      evidence_ref: "ev:recall-survival-2",
      evidence_digest: payloadDigest,
      citation_ids: ["cit-1"],
    },
    authorization: { credential: "cred-alpha", context_ref: "memory.capture.session/v1" },
    source_order: { source_ref: "session:s1", sequence: "2" },
    deadline_at: T_DEADLINE,
    cancellation_ref: "cancel:recall-2",
  });
  // Kills a mutant that leaves capture open after capture revocation.
  expect(captureAfter.ok).toBe(false);
  if (!captureAfter.ok) {
    // Kills a mutant that returns a code other than AUTHORIZATION_REVOKED for post-revocation capture.
    expect(captureAfter.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const recallRevalAfter = await wrappedAuth.revalidate(recallReceiptBefore, T1_INSTANT);
  // Kills a mutant that invalidates existing recall receipts when capture is revoked.
  expect(recallRevalAfter.ok && recallRevalAfter.value.valid).toBe(true);

  const contextualAfter = await memoryPort.recall(recallReq("memory.recall.contextual/v1"));
  // Kills a mutant that cuts contextual recall when capture is revoked.
  expect(contextualAfter.ok).toBe(true);
  if (contextualAfter.ok) {
    // Kills a mutant that empties recall results over admitted records after capture revocation.
    expect(contextualAfter.value.records.map((entry) => entry.record.record_id)).toEqual([recordId]);
  }

  const studyAfter = await memoryPort.recall(recallReq("memory.recall.study/v1"));
  // Kills a mutant that cuts study recall when capture is revoked.
  expect(studyAfter.ok).toBe(true);
  if (studyAfter.ok) {
    // Kills a mutant that drops admitted records from study recall after capture revocation.
    expect(studyAfter.value.records.map((entry) => entry.record.record_id)).toEqual([recordId]);
  }

  // Contrast: explicitly revoking contextual recall blocks contextual recall without blocking study recall.
  const revContextual = controller.revokePurpose({
    scopeRef,
    purpose: "memory.recall.contextual/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that refuses explicit contextual recall revocation.
  expect(revContextual.ok).toBe(true);

  const contextualBlocked = await memoryPort.recall(recallReq("memory.recall.contextual/v1"));
  // Kills a mutant that ignores explicit revocation of memory.recall.contextual/v1.
  expect(contextualBlocked.ok).toBe(false);
  if (!contextualBlocked.ok) {
    // Kills a mutant that returns wrong code when memory.recall.contextual/v1 itself is revoked.
    expect(contextualBlocked.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const studyStillAlive = await memoryPort.recall(recallReq("memory.recall.study/v1"));
  // Kills a mutant that revokes memory.recall.study/v1 when only memory.recall.contextual/v1 was revoked.
  expect(studyStillAlive.ok).toBe(true);
});

it("a purge announcement receipt precedes a purge", async () => {
  const evalWindow = PRIVACY_API.evaluateAuditWindowV1 as (input: unknown) => Result<{
    readonly state: string;
    readonly auditWindowEndsAt: string;
    readonly purgeEligible: boolean;
  }>;
  const createReceipt = PRIVACY_API.createPurgeAnnouncementReceiptV1 as (
    input: unknown,
  ) => Result<Record<string, unknown>>;
  const verifyReceipt = PRIVACY_API.verifyPurgeAnnouncementReceiptV1 as (
    receipt: unknown,
  ) => Result<Record<string, unknown>>;
  const executePurge = PRIVACY_API.executeAnnouncedPurgeV1 as (
    input: unknown,
  ) => Promise<Result<Record<string, unknown>>>;

  // Kills a mutant that omits exporting D14 audit-window / purge helpers from engram-memory.
  expect(typeof evalWindow).toBe("function");
  // Kills a mutant that omits exporting createPurgeAnnouncementReceiptV1.
  expect(typeof createReceipt).toBe("function");
  // Kills a mutant that omits exporting verifyPurgeAnnouncementReceiptV1.
  expect(typeof verifyReceipt).toBe("function");
  // Kills a mutant that omits exporting executeAnnouncedPurgeV1.
  expect(typeof executePurge).toBe("function");

  const hostPolicy = {
    policyId: "host-audit-d14",
    auditWindowMs: 3_600_000,
    derivativeRule: "make-ineligible" as const,
  };
  const closedAt = T0_INSTANT;
  const windowEndMs = Date.parse(closedAt) + hostPolicy.auditWindowMs;
  const windowEnd = new Date(windowEndMs).toISOString();
  const oneMsBefore = new Date(windowEndMs - 1).toISOString();
  const execAt = new Date(windowEndMs + 1_000).toISOString();
  const sessionPseudoId = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(9),
    "sess-purge-1",
  );

  const atClose = evalWindow({ hostPolicy, closedAt, now: closedAt });
  // Kills a mutant that fails to enter presented-for-audit at closedAt.
  expect(atClose.ok && atClose.value.state === "presented-for-audit" && !atClose.value.purgeEligible).toBe(
    true,
  );

  const justBeforeEnd = evalWindow({ hostPolicy, closedAt, now: oneMsBefore });
  // Kills a mutant that stops audit presentation before auditWindowEndsAt.
  expect(
    justBeforeEnd.ok &&
      justBeforeEnd.value.state === "presented-for-audit" &&
      !justBeforeEnd.value.purgeEligible,
  ).toBe(true);

  const atEnd = evalWindow({ hostPolicy, closedAt, now: windowEnd });
  // Kills a mutant that uses > instead of >= for now >= auditWindowEndsAt transition.
  expect(
    atEnd.ok &&
      atEnd.value.state === "presentation-stopped" &&
      atEnd.value.purgeEligible &&
      atEnd.value.auditWindowEndsAt === windowEnd,
  ).toBe(true);

  const earlyAnnouncement = createReceipt({
    hostPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: [sessionPseudoId],
    closedAt,
    announcedAt: oneMsBefore,
    targetClasses: ["host-context-log", "host-audit-view", "expired-memory-envelope"],
  });
  // Kills a mutant that emits a PurgeAnnouncementReceiptV1 before the post-close audit window ends.
  expect(earlyAnnouncement.ok).toBe(false);
  if (!earlyAnnouncement.ok) {
    // Kills a mutant that returns a code other than ILLEGAL_TRANSITION for premature purge announcement.
    expect(earlyAnnouncement.error.code).toBe("ILLEGAL_TRANSITION");
  }

  const validAnnouncement = createReceipt({
    hostPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: [sessionPseudoId],
    closedAt,
    announcedAt: windowEnd,
    executeNotBefore: execAt,
    targetClasses: ["host-context-log", "host-audit-view", "expired-memory-envelope"],
  });
  // Kills a mutant that fails to create a valid PurgeAnnouncementReceiptV1 at auditWindowEndsAt.
  expect(validAnnouncement.ok).toBe(true);
  const receipt = validAnnouncement.ok ? validAnnouncement.value : {};

  // Kills a mutant that emits the wrong schemaVersion on PurgeAnnouncementReceiptV1.
  expect(receipt.schemaVersion).toBe("engram.purge-announcement/v1");
  // Kills a mutant that omits receiptDigest on PurgeAnnouncementReceiptV1.
  expect(receipt.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  // Kills a mutant whose verifyPurgeAnnouncementReceiptV1 rejects a valid receipt.
  expect(verifyReceipt(receipt).ok).toBe(true);

  const events: string[] = [];
  const cryptoPort = makeInMemoryCryptoPort(events);
  const executed = await executePurge({
    hostPolicy,
    announcement: receipt,
    now: execAt,
    crypto: cryptoPort,
    expiredKeyRefs: ["key-ref-1"],
    async journalAnnouncement(r: { readonly receiptDigest: Digest }) {
      events.push(`announced:${r.receiptDigest}`);
      return { ok: true, value: { journaled: true as const } };
    },
    async purgeTarget(targetClass: string) {
      events.push(`purged:${targetClass}`);
      return { ok: true, value: { purged: true as const } };
    },
  });
  // Kills a mutant that refuses a valid announced purge execution.
  expect(executed.ok).toBe(true);
  // Kills a mutant that executes purge or key destruction before journaling the announcement receipt.
  expect(events).toEqual([
    `announced:${String(receipt.receiptDigest)}`,
    "destroy:key-ref-1",
    "purged:host-context-log",
    "purged:host-audit-view",
    "purged:expired-memory-envelope",
  ]);

  // Single-field negative cases: every refusal MUST run zero destructions and zero purges.
  const runExpectingNoSideEffects = async (override: Record<string, unknown>) => {
    const sideEffects: string[] = [];
    const res = await executePurge({
      hostPolicy,
      announcement: receipt,
      now: execAt,
      crypto: makeInMemoryCryptoPort(sideEffects),
      expiredKeyRefs: ["key-ref-1"],
      async journalAnnouncement() {
        sideEffects.push("announced");
        return { ok: true, value: { journaled: true as const } };
      },
      async purgeTarget(targetClass: string) {
        sideEffects.push(`purged:${targetClass}`);
        return { ok: true, value: { purged: true as const } };
      },
      ...override,
    });
    return { res, sideEffects };
  };

  const noReceipt = await runExpectingNoSideEffects({ announcement: undefined });
  // Kills a mutant that runs a purge without a PurgeAnnouncementReceiptV1.
  expect(noReceipt.res.ok).toBe(false);
  if (!noReceipt.res.ok) {
    // Kills a mutant that returns wrong code when announcement receipt is absent.
    expect(noReceipt.res.error.code).toBe("ILLEGAL_TRANSITION");
  }
  // Kills a mutant that performs side effects before rejecting a missing announcement receipt.
  expect(noReceipt.sideEffects).toEqual([]);

  const tamperedReceipt = await runExpectingNoSideEffects({
    announcement: { ...receipt, workspaceId: "ws-tampered" },
  });
  // Kills a mutant that accepts a tampered PurgeAnnouncementReceiptV1 without digest verification.
  expect(tamperedReceipt.res.ok).toBe(false);
  if (!tamperedReceipt.res.ok) {
    // Kills a mutant that returns wrong code for tampered PurgeAnnouncementReceiptV1 digest.
    expect(tamperedReceipt.res.error.code).toBe("INVALID_DIGEST");
  }
  // Kills a mutant that runs side effects on a tampered announcement receipt.
  expect(tamperedReceipt.sideEffects).toEqual([]);

  // Single-field negative: mismatched hostAuditPolicyId with recomputed receiptDigest -> POLICY_STALE.
  const otherPolicy = { ...hostPolicy, policyId: "host-audit-other" };
  const otherReceiptRes = createReceipt({
    hostPolicy: otherPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: [sessionPseudoId],
    closedAt,
    announcedAt: windowEnd,
    executeNotBefore: execAt,
    targetClasses: ["host-context-log"],
  });
  // Kills a mutant breaking baseline creation of second-policy announcement receipt.
  expect(otherReceiptRes.ok).toBe(true);
  const stalePolicyRun = await runExpectingNoSideEffects({
    announcement: otherReceiptRes.ok ? otherReceiptRes.value : {},
  });
  // Kills a mutant that executes purge for a receipt bound to a different hostAuditPolicyId.
  expect(stalePolicyRun.res.ok).toBe(false);
  if (!stalePolicyRun.res.ok) {
    // Kills a mutant that returns wrong error code on hostAuditPolicyId mismatch.
    expect(stalePolicyRun.res.error.code).toBe("POLICY_STALE");
  }
  // Kills a mutant that performs side effects on policy-mismatched purge receipt.
  expect(stalePolicyRun.sideEffects).toEqual([]);

  const tooEarlyExec = await runExpectingNoSideEffects({
    now: new Date(Date.parse(execAt) - 1).toISOString(),
  });
  // Kills a mutant that executes purge 1 ms before executeNotBefore.
  expect(tooEarlyExec.res.ok).toBe(false);
  if (!tooEarlyExec.res.ok) {
    // Kills a mutant that returns wrong error code when now < executeNotBefore.
    expect(tooEarlyExec.res.error.code).toBe("ILLEGAL_TRANSITION");
  }
  // Kills a mutant that performs side effects before executeNotBefore.
  expect(tooEarlyExec.sideEffects).toEqual([]);

  const journalFailed = await runExpectingNoSideEffects({
    async journalAnnouncement() {
      return {
        ok: false,
        error: {
          code: "STORE_UNAVAILABLE",
          operation: "expire",
          message: "journal write failed",
          retryable: true,
        },
      };
    },
  });
  // Kills a mutant that runs physical purge when announcement journaling fails.
  expect(journalFailed.res.ok).toBe(false);
  // Kills a mutant that destroys keys or purges targets after a failed announcement journal write.
  expect(journalFailed.sideEffects).toEqual([]);

  // D23 invariant: canonical turn_text is never an admissible purge target class.
  const badTarget = createReceipt({
    hostPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: [sessionPseudoId],
    closedAt,
    announcedAt: windowEnd,
    targetClasses: ["turn_text"],
  });
  // Kills a mutant that allows canonical turn_text inside PurgeAnnouncementReceiptV1.targetClasses (D23).
  expect(badTarget.ok).toBe(false);
  if (!badTarget.ok) {
    // Kills a mutant that returns wrong code for inadmissible purge targetClass.
    expect(badTarget.error.code).toBe("INVALID_SCHEMA");
  }

  const rawSessionId = createReceipt({
    hostPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: ["raw-session-uuid-123"],
    closedAt,
    announcedAt: windowEnd,
    targetClasses: ["host-context-log"],
  });
  // Kills a mutant that allows raw un-pseudonymized session IDs in PurgeAnnouncementReceiptV1.
  expect(rawSessionId.ok).toBe(false);
});

it("the study window filters memory.recall.study/v1 only", async () => {
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<{
    readonly version: string;
    readonly digestSha256: Digest;
  }>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<
    Result<{
      readonly redactionReceipt: Record<string, unknown> & {
        readonly outputPayloadDigest: Digest;
        readonly receiptDigest: Digest;
      };
      readonly stamp: Record<string, unknown>;
    }>
  >;
  const applyStudyWindow = PRIVACY_API.applyStudyWindowV1 as (input: unknown) => Result<{
    readonly purposeRef: string;
    readonly windowApplied: boolean;
    readonly asOf: string;
    readonly windowStart?: string;
    readonly activeProjectIds: readonly string[];
    readonly items: ReadonlyArray<{
      readonly itemId: string;
      readonly projectId: string;
      readonly sessionPseudoId: string;
      readonly observedAt: string;
      readonly sourceScopeRef?: string;
      readonly payloadDigest?: Digest;
      readonly piiArmorStamp?: Record<string, unknown>;
      readonly redactionReceipt?: Record<string, unknown>;
    }>;
    readonly droppedByTimeWindowCount: number;
    readonly droppedByProjectCapCount: number;
  }>;

  // Kills a mutant that omits exporting applyStudyWindowV1 from engram-memory.
  expect(typeof applyStudyWindow).toBe("function");

  const asOf = "2026-11-22T00:00:00.000Z";
  const asOfMs = Date.parse(asOf);
  const dayMs = 86_400_000;
  const windowStartMs = asOfMs - 183 * dayMs;

  const studyDenyListRes = createDenyList({
    version: "d7-2026-11",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: ["email", "secret-token"],
  });
  expect(studyDenyListRes.ok).toBe(true);
  if (!studyDenyListRes.ok) {
    return;
  }
  const studyTargetScope = "scope:study-corpus";
  const studyAuthzReceipt = engramMemory.receiptDigest("authz-study", { id: "study-1" });
  const { port: studyAuthPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1");
  const studyArmorRes = await redactWithArmor({
    authorizationPort: studyAuthPort,
    request: {
      source_record: makeBaselineRecord(
        "scope:ws-alpha",
        "memory.recall.study/v1",
        "Armored study item summary.",
      ),
      target_scope_ref: studyTargetScope,
      directive: {
        mode: "field-allowlist",
        allowed_fields: [""],
        allow_derivation_lineage: false,
        max_packet_bytes: 8_192,
      },
      authorization_receipt_digest: studyAuthzReceipt,
    },
    denyList: studyDenyListRes.value,
    policyVersion: "armor-policy/v1",
    boundary: "study",
    d33Pseudonymized: true,
  });
  expect(studyArmorRes.ok).toBe(true);
  if (!studyArmorRes.ok) {
    return;
  }
  const expectedArmorPolicy = {
    policyVersion: "armor-policy/v1",
    d7BlacklistVersion: "d7-2026-11",
    d7BlacklistDigest: studyDenyListRes.value.digestSha256,
  };
  const validStamp = studyArmorRes.value.stamp;
  const validReceipt = studyArmorRes.value.redactionReceipt;
  const validPayloadDigest = validReceipt.outputPayloadDigest;
  const sessPseudo = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(42),
    "sess-study",
  );

  // Build 35 projects inside the 183-day window (project-01 newest .. project-35 oldest),
  // plus exact boundary items: at windowStart, 1 ms older than windowStart, at asOf, and 1 ms after asOf.
  const items: Array<{
    readonly itemId: string;
    readonly projectId: string;
    readonly sessionPseudoId: string;
    readonly observedAt: string;
    readonly sourceScopeRef?: string;
    readonly payloadDigest?: Digest;
    readonly piiArmorStamp?: Record<string, unknown>;
    readonly redactionReceipt?: Record<string, unknown>;
  }> = [];
  for (let i = 1; i <= 35; i += 1) {
    const pad = String(i).padStart(2, "0");
    items.push({
      itemId: `item-p${pad}`,
      projectId: `project-${pad}`,
      sessionPseudoId: sessPseudo,
      observedAt: new Date(asOfMs - i * dayMs).toISOString(),
      sourceScopeRef: "scope:ws-alpha",
      payloadDigest: validPayloadDigest,
      piiArmorStamp: validStamp,
      redactionReceipt: validReceipt,
    });
  }
  // Exact inclusive lower boundary (183 days before asOf) on project-01.
  items.push({
    itemId: "item-exact-lower",
    projectId: "project-01",
    sessionPseudoId: sessPseudo,
    observedAt: new Date(windowStartMs).toISOString(),
    sourceScopeRef: "scope:ws-alpha",
    payloadDigest: validPayloadDigest,
    piiArmorStamp: validStamp,
    redactionReceipt: validReceipt,
  });
  // 1 ms before lower boundary (must be dropped in study, kept in contextual).
  items.push({
    itemId: "item-too-old-1ms",
    projectId: "project-01",
    sessionPseudoId: sessPseudo,
    observedAt: new Date(windowStartMs - 1).toISOString(),
    sourceScopeRef: "scope:ws-alpha",
    payloadDigest: validPayloadDigest,
    piiArmorStamp: validStamp,
    redactionReceipt: validReceipt,
  });
  // 400 days old (must be dropped in study, kept in contextual).
  items.push({
    itemId: "item-400d-old",
    projectId: "project-02",
    sessionPseudoId: sessPseudo,
    observedAt: new Date(asOfMs - 400 * dayMs).toISOString(),
    sourceScopeRef: "scope:ws-alpha",
    payloadDigest: validPayloadDigest,
    piiArmorStamp: validStamp,
    redactionReceipt: validReceipt,
  });
  // Exact inclusive upper boundary (asOf) on project-01.
  items.push({
    itemId: "item-exact-upper",
    projectId: "project-01",
    sessionPseudoId: sessPseudo,
    observedAt: asOf,
    sourceScopeRef: "scope:ws-alpha",
    payloadDigest: validPayloadDigest,
    piiArmorStamp: validStamp,
    redactionReceipt: validReceipt,
  });
  // 1 ms after asOf (future relative to asOf; must be dropped in study, kept in contextual).
  items.push({
    itemId: "item-future-1ms",
    projectId: "project-01",
    sessionPseudoId: sessPseudo,
    observedAt: new Date(asOfMs + 1).toISOString(),
    sourceScopeRef: "scope:ws-alpha",
    payloadDigest: validPayloadDigest,
    piiArmorStamp: validStamp,
    redactionReceipt: validReceipt,
  });

  const snapshotBefore = JSON.stringify(items);

  const studyRes = applyStudyWindow({
    purposeRef: "memory.recall.study/v1",
    asOf,
    items,
    targetScopeRef: studyTargetScope,
    authorizationReceiptDigest: studyAuthzReceipt,
    expectedArmorPolicy,
  });
  // Kills a mutant that fails on valid memory.recall.study/v1 filtering.
  expect(studyRes.ok).toBe(true);
  if (studyRes.ok) {
    // Kills a mutant that does not apply the D9 window to memory.recall.study/v1.
    expect(studyRes.value.windowApplied).toBe(true);
    // Kills a mutant that fails to cap active projects at 30 on memory.recall.study/v1.
    expect(studyRes.value.activeProjectIds).toHaveLength(30);
    // Kills a mutant that drops newest projects instead of capping at the 30 most recently active.
    expect(studyRes.value.activeProjectIds).toContain("project-01");
    // Kills a mutant that retains project-30 boundary wrongly.
    expect(studyRes.value.activeProjectIds).toContain("project-30");
    // Kills a mutant that allows project-31 beyond the 30-project cap.
    expect(studyRes.value.activeProjectIds).not.toContain("project-31");
    // Kills a mutant that allows project-35 beyond the 30-project cap.
    expect(studyRes.value.activeProjectIds).not.toContain("project-35");

    const keptIds = studyRes.value.items.map((item) => item.itemId);
    // Kills a mutant that excludes the exact 183-day lower boundary (> instead of >=).
    expect(keptIds).toContain("item-exact-lower");
    // Kills a mutant that excludes the exact asOf upper boundary (< instead of <=).
    expect(keptIds).toContain("item-exact-upper");
    // Kills a mutant that retains an item 1 ms older than the 183-day sliding window.
    expect(keptIds).not.toContain("item-too-old-1ms");
    // Kills a mutant that retains a 400-day-old item in study recall.
    expect(keptIds).not.toContain("item-400d-old");
    // Kills a mutant that retains a future item 1 ms after asOf in study recall.
    expect(keptIds).not.toContain("item-future-1ms");
    // Kills a mutant that miscounts items dropped by the 183-day window.
    expect(studyRes.value.droppedByTimeWindowCount).toBe(3);
    // Kills a mutant that miscounts items dropped by the 30-project cap.
    expect(studyRes.value.droppedByProjectCapCount).toBe(5);
  }

  // Kills a mutant that mutates or truncates the caller's input items array.
  expect(JSON.stringify(items)).toBe(snapshotBefore);

  // Hard Non-Truncation Invariant: memory.recall.contextual/v1 is NEVER filtered by D9,
  // even across 35 projects, 400-day-old items, and items without study PiiArmorStamp.
  const contextualItems = [
    ...items,
    {
      itemId: "item-contextual-unstamped",
      projectId: "project-36",
      sessionPseudoId: sessPseudo,
      observedAt: new Date(asOfMs - 500 * dayMs).toISOString(),
    },
  ];
  const contextualRes = applyStudyWindow({
    purposeRef: "memory.recall.contextual/v1",
    asOf,
    items: contextualItems,
  });
  // Kills a mutant that refuses memory.recall.contextual/v1 or demands study armor stamp for it.
  expect(contextualRes.ok).toBe(true);
  if (contextualRes.ok) {
    // Kills a mutant that applies the D9 study window to memory.recall.contextual/v1.
    expect(contextualRes.value.windowApplied).toBe(false);
    // Kills a mutant that truncates or drops any item for memory.recall.contextual/v1.
    expect(contextualRes.value.items).toHaveLength(contextualItems.length);
    // Kills a mutant that caps active projects at 30 for memory.recall.contextual/v1.
    expect(contextualRes.value.activeProjectIds).toHaveLength(36);
    // Kills a mutant that reports non-zero time-window drops on contextual recall.
    expect(contextualRes.value.droppedByTimeWindowCount).toBe(0);
    // Kills a mutant that reports non-zero project-cap drops on contextual recall.
    expect(contextualRes.value.droppedByProjectCapCount).toBe(0);
  }

  // Single-field negative cases on study recall.
  const validStudyBase = {
    purposeRef: "memory.recall.study/v1",
    asOf,
    items: [items[0]!],
    targetScopeRef: studyTargetScope,
    authorizationReceiptDigest: studyAuthzReceipt,
    expectedArmorPolicy,
  };

  const unstampedStudy = applyStudyWindow({
    ...validStudyBase,
    items: [
      {
        itemId: "item-unstamped",
        projectId: "project-01",
        sessionPseudoId: sessPseudo,
        observedAt: asOf,
        sourceScopeRef: "scope:ws-alpha",
        payloadDigest: validPayloadDigest,
        redactionReceipt: validReceipt,
      },
    ],
  });
  // Kills a mutant that allows an item without PiiArmorStamp in memory.recall.study/v1.
  expect(unstampedStudy.ok).toBe(false);
  if (!unstampedStudy.ok) {
    // Kills a mutant that returns a code other than UNAUTHORIZED for unstamped study item.
    expect(unstampedStudy.error.code).toBe("UNAUTHORIZED");
  }

  const rawSessionStudy = applyStudyWindow({
    ...validStudyBase,
    items: [
      {
        itemId: "item-raw-session",
        projectId: "project-01",
        sessionPseudoId: "raw-session-id",
        observedAt: asOf,
        sourceScopeRef: "scope:ws-alpha",
        payloadDigest: validPayloadDigest,
        piiArmorStamp: validStamp,
        redactionReceipt: validReceipt,
      },
    ],
  });
  // Kills a mutant that allows an unpseudonymized session ID in memory.recall.study/v1.
  expect(rawSessionStudy.ok).toBe(false);
  if (!rawSessionStudy.ok) {
    // Kills a mutant that returns a code other than UNAUTHORIZED for raw session ID in study.
    expect(rawSessionStudy.error.code).toBe("UNAUTHORIZED");
  }

  const missingArmorPolicy = applyStudyWindow({
    purposeRef: "memory.recall.study/v1",
    asOf,
    items: [items[0]!],
    targetScopeRef: studyTargetScope,
    authorizationReceiptDigest: studyAuthzReceipt,
  });
  // Kills a mutant that skips expectedArmorPolicy verification for study reads.
  expect(missingArmorPolicy.ok).toBe(false);
  if (!missingArmorPolicy.ok) {
    // Kills a mutant that returns wrong code when expectedArmorPolicy is absent for study read.
    expect(missingArmorPolicy.error.code).toBe("POLICY_UNAVAILABLE");
  }

  const widenedProjects = applyStudyWindow({
    ...validStudyBase,
    policy: {
      maxActiveProjects: 31,
      sessionSlidingWindowDays: 183,
      requirePiiArmor: true,
      requirePseudonymized: true,
    },
  });
  // Kills a mutant that allows widening StudyCorpusCalibrationPolicyV1.maxActiveProjects above 30.
  expect(widenedProjects.ok).toBe(false);
  if (!widenedProjects.ok) {
    // Kills a mutant that returns wrong code for widened maxActiveProjects.
    expect(widenedProjects.error.code).toBe("INVALID_SCHEMA");
  }

  const widenedDays = applyStudyWindow({
    ...validStudyBase,
    policy: {
      maxActiveProjects: 30,
      sessionSlidingWindowDays: 184,
      requirePiiArmor: true,
      requirePseudonymized: true,
    },
  });
  // Kills a mutant that allows widening sessionSlidingWindowDays above 183.
  expect(widenedDays.ok).toBe(false);

  const capturePurposeOnStudy = applyStudyWindow({
    ...validStudyBase,
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that admits a capture purpose on study/recall windowing.
  expect(capturePurposeOnStudy.ok).toBe(false);
  if (!capturePurposeOnStudy.ok) {
    // Kills a mutant that returns wrong code for capture purpose passed to applyStudyWindowV1.
    expect(capturePurposeOnStudy.error.code).toBe("UNAUTHORIZED");
  }

  const unknownPurpose = applyStudyWindow({
    ...validStudyBase,
    purposeRef: "memory.recall.unknown/v1",
  });
  // Kills a mutant that admits an unknown recall purpose in applyStudyWindowV1.
  expect(unknownPurpose.ok).toBe(false);
  if (!unknownPurpose.ok) {
    // Kills a mutant that returns wrong code for unknown purpose in applyStudyWindowV1.
    expect(unknownPurpose.error.code).toBe("INVALID_SCHEMA");
  }

  const sparseItems: unknown[] = [];
  sparseItems.length = 1;
  const sparseStudy = applyStudyWindow({ ...validStudyBase, items: sparseItems });
  // Kills a mutant whose strict decoder accepts a sparse items array in applyStudyWindowV1.
  expect(sparseStudy.ok).toBe(false);
});

it("forged and cross-scope or cross-boundary replayed PiiArmorStampV1 is refused", async () => {
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<{
    readonly version: string;
    readonly digestSha256: Digest;
  }>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<
    Result<{
      readonly redaction: RedactionResultV1;
      readonly redactionReceipt: Record<string, unknown> & {
        readonly receiptDigest: Digest;
        readonly outputPayloadDigest: Digest;
      };
      readonly stamp: {
        readonly policyVersion: string;
        readonly redactionReceiptDigest: Digest;
        readonly d7BlacklistVersion: string;
        readonly d33Pseudonymized: true;
      };
      readonly packetBytes: number;
    }>
  >;
  const verifyStamp = PRIVACY_API.verifyPiiArmorStampV1 as (
    stamp: unknown,
    expectedPolicy: unknown,
    binding?: unknown,
  ) => Result<unknown>;
  const evaluateEgress = PRIVACY_API.evaluateEgressBoundaryV1 as (input: unknown) => Result<unknown>;
  const applyStudyWindow = PRIVACY_API.applyStudyWindowV1 as (input: unknown) => Result<unknown>;

  const denyListRes = createDenyList({
    version: "d7-2026-11",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: ["email", "secret-token"],
  });
  // Kills a mutant breaking baseline ConfidentialityDenyListV1 construction for BLOCKER 1 tests.
  expect(denyListRes.ok).toBe(true);
  if (!denyListRes.ok) {
    return;
  }
  const denyList = denyListRes.value;

  const forgedStamp = {
    policyVersion: "armor-policy/v1",
    redactionReceiptDigest: `sha256:${"0".repeat(64)}` as Digest,
    d7BlacklistVersion: "d7-2026-11",
    d33Pseudonymized: true as const,
  };
  const policyOnly = {
    policyVersion: "armor-policy/v1",
    d7BlacklistVersion: "d7-2026-11",
    d7BlacklistDigest: denyList.digestSha256,
  };

  const forgedVerify = verifyStamp(forgedStamp, policyOnly);
  // Kills a mutant that accepts a forged PiiArmorStampV1 when redactionReceipt binding is omitted.
  expect(forgedVerify.ok).toBe(false);
  if (!forgedVerify.ok) {
    // Kills a mutant that uses an open/wrong code when stamp verification lacks a receipt binding.
    expect(forgedVerify.error.code).toBe("UNAUTHORIZED");
  }

  const forgedEgress = evaluateEgress({
    boundary: "cross-workspace",
    metamodelClass: "typed_node",
    piiArmorStamp: forgedStamp,
    expectedPolicy: policyOnly,
    packetBytes: 128,
    maxPacketBytes: 4_096,
  });
  // Kills a mutant that accepts a forged PiiArmorStampV1 on cross-boundary egress without a receipt.
  expect(forgedEgress.ok).toBe(false);
  if (!forgedEgress.ok) {
    // Kills a mutant that fails to refuse a forged egress stamp with UNAUTHORIZED.
    expect(forgedEgress.error.code).toBe("UNAUTHORIZED");
  }

  const sessPseudo = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(51),
    "sess-forged-study",
  );
  const forgedStudy = applyStudyWindow({
    purposeRef: "memory.recall.study/v1",
    asOf: T1_INSTANT,
    items: [
      {
        itemId: "item-forged",
        projectId: "project-01",
        sessionPseudoId: sessPseudo,
        observedAt: T1_INSTANT,
        piiArmorStamp: forgedStamp,
      },
    ],
    expectedArmorPolicy: {
      policyVersion: "armor-policy/v1",
      d7BlacklistVersion: "d7-2026-11",
    },
  });
  // Kills a mutant that admits a forged PiiArmorStampV1 in memory.recall.study/v1 without receipt binding.
  expect(forgedStudy.ok).toBe(false);

  const { port: authPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1");
  const authzReceipt = engramMemory.receiptDigest("authz-cap", { id: "blocker-1" });
  const sourceRecord = makeBaselineRecord(
    "scope:ws-alpha",
    "memory.capture.session/v1",
    "Clean decision for bound cross-workspace redaction.",
  );
  const redactionReq: RedactionRequestV1 = {
    source_record: sourceRecord,
    target_scope_ref: "scope:ws-beta",
    directive: {
      mode: "field-allowlist",
      allowed_fields: [""],
      allow_derivation_lineage: false,
      max_packet_bytes: 8_192,
    },
    authorization_receipt_digest: authzReceipt,
  };

  const missingBoundaryRedaction = await redactWithArmor({
    authorizationPort: authPort,
    request: redactionReq,
    denyList,
    policyVersion: "armor-policy/v1",
    d33Pseudonymized: true,
  });
  // Kills a mutant that permits redactWithPiiArmorV1 without binding an explicit cross-boundary kind.
  expect(missingBoundaryRedaction.ok).toBe(false);
  if (!missingBoundaryRedaction.ok) {
    // Kills a mutant that returns a code other than INVALID_SCHEMA when boundary is omitted.
    expect(missingBoundaryRedaction.error.code).toBe("INVALID_SCHEMA");
  }

  const boundRedaction = await redactWithArmor({
    authorizationPort: authPort,
    request: redactionReq,
    denyList,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace",
    d33Pseudonymized: true,
  });
  // Kills a mutant that fails to produce a bound PiiArmorRedactionReceiptV1 and frozen 4-field stamp.
  expect(boundRedaction.ok).toBe(true);
  if (!boundRedaction.ok) {
    return;
  }
  const { stamp, redactionReceipt, packetBytes } = boundRedaction.value;
  // Kills a mutant that alters the frozen 4-key S1 shape of PiiArmorStampV1.
  expect(Object.keys(stamp).sort()).toEqual([
    "d33Pseudonymized",
    "d7BlacklistVersion",
    "policyVersion",
    "redactionReceiptDigest",
  ]);
  // Kills a mutant that fails to match stamp.redactionReceiptDigest to redactionReceipt.receiptDigest.
  expect(stamp.redactionReceiptDigest).toBe(redactionReceipt.receiptDigest);

  const validEgressBase = {
    boundary: "cross-workspace" as const,
    metamodelClass: "typed_node" as const,
    sourceScopeRef: "scope:ws-alpha",
    targetScopeRef: "scope:ws-beta",
    authorizationReceiptDigest: authzReceipt,
    payloadDigest: redactionReceipt.outputPayloadDigest,
    piiArmorStamp: stamp,
    redactionReceipt,
    expectedPolicy: policyOnly,
    packetBytes,
    maxPacketBytes: 8_192,
  };
  const validBoundEgress = evaluateEgress(validEgressBase);
  // Kills a mutant that rejects a valid bound cross-workspace egress with matching receipt and active fields.
  expect(validBoundEgress.ok).toBe(true);

  const replayDifferentBoundary = evaluateEgress({
    ...validEgressBase,
    boundary: "external-model",
  });
  // Kills a mutant that allows replaying a cross-workspace stamp on an external-model boundary.
  expect(replayDifferentBoundary.ok).toBe(false);
  if (!replayDifferentBoundary.ok) {
    // Kills a mutant that returns wrong code on cross-boundary stamp replay.
    expect(replayDifferentBoundary.error.code).toBe("UNAUTHORIZED");
  }

  const replayDifferentSourceScope = evaluateEgress({
    ...validEgressBase,
    sourceScopeRef: "scope:ws-other-source",
  });
  // Kills a mutant that allows replaying a stamp from one sourceScopeRef onto another.
  expect(replayDifferentSourceScope.ok).toBe(false);
  if (!replayDifferentSourceScope.ok) {
    // Kills a mutant that returns wrong code on sourceScopeRef replay.
    expect(replayDifferentSourceScope.error.code).toBe("UNAUTHORIZED");
  }

  const replayDifferentTargetScope = evaluateEgress({
    ...validEgressBase,
    targetScopeRef: "scope:ws-gamma",
  });
  // Kills a mutant that allows replaying a stamp from one targetScopeRef onto another.
  expect(replayDifferentTargetScope.ok).toBe(false);
  if (!replayDifferentTargetScope.ok) {
    // Kills a mutant that returns wrong code on targetScopeRef replay.
    expect(replayDifferentTargetScope.error.code).toBe("UNAUTHORIZED");
  }

  const replayDifferentAuthz = evaluateEgress({
    ...validEgressBase,
    authorizationReceiptDigest: engramMemory.receiptDigest("authz-cap", { id: "different" }),
  });
  // Kills a mutant that allows replaying a stamp under a different authorizationReceiptDigest.
  expect(replayDifferentAuthz.ok).toBe(false);
  if (!replayDifferentAuthz.ok) {
    // Kills a mutant that returns wrong code on authorizationReceiptDigest replay.
    expect(replayDifferentAuthz.error.code).toBe("UNAUTHORIZED");
  }

  const replayDifferentPayload = evaluateEgress({
    ...validEgressBase,
    payloadDigest: `sha256:${"b".repeat(64)}` as Digest,
  });
  // Kills a mutant that allows replaying a stamp onto a different redacted payload digest.
  expect(replayDifferentPayload.ok).toBe(false);
  if (!replayDifferentPayload.ok) {
    // Kills a mutant that returns wrong code on payloadDigest replay.
    expect(replayDifferentPayload.error.code).toBe("UNAUTHORIZED");
  }

  const tamperedReceipt = evaluateEgress({
    ...validEgressBase,
    redactionReceipt: { ...redactionReceipt, targetScopeRef: "scope:ws-gamma" },
    targetScopeRef: "scope:ws-gamma",
  });
  // Kills a mutant that skips recomputing redactionReceipt canonical digest during stamp verification.
  expect(tamperedReceipt.ok).toBe(false);
  if (!tamperedReceipt.ok) {
    // Kills a mutant that returns wrong code on tampered redactionReceipt digest.
    expect(tamperedReceipt.error.code).toBe("INVALID_DIGEST");
  }

  const studyReplayFromCrossWorkspace = applyStudyWindow({
    purposeRef: "memory.recall.study/v1",
    asOf: T1_INSTANT,
    targetScopeRef: "scope:ws-beta",
    authorizationReceiptDigest: authzReceipt,
    expectedArmorPolicy: policyOnly,
    items: [
      {
        itemId: "item-replayed-boundary",
        projectId: "project-01",
        sessionPseudoId: sessPseudo,
        observedAt: T1_INSTANT,
        sourceScopeRef: "scope:ws-alpha",
        payloadDigest: redactionReceipt.outputPayloadDigest,
        piiArmorStamp: stamp,
        redactionReceipt,
      },
    ],
  });
  // Kills a mutant that allows replaying a cross-workspace receipt on memory.recall.study/v1.
  expect(studyReplayFromCrossWorkspace.ok).toBe(false);
  if (!studyReplayFromCrossWorkspace.ok) {
    // Kills a mutant returning wrong refusal code when non-study receipt is replayed in study window.
    expect(studyReplayFromCrossWorkspace.error.code).toBe("UNAUTHORIZED");
  }
});

it("MemoryPortV2 decorator and wrapAuthorizationPort enforce purpose/principal revocation across capture, ingestActivity, recall, and proposeCapitalisation", async () => {
  const createController = PRIVACY_API.createPurposeRevocationControllerV1 as () => {
    revokePurpose(input: unknown): Result<unknown>;
    checkPurposeAuthorization(input: unknown): Result<unknown>;
    wrapAuthorizationPort(inner: AuthorizationPort, options?: unknown): AuthorizationPort;
    wrapMemoryPort(inner: MemoryPortV2, options?: unknown): MemoryPortV2;
  };
  const decorateMemoryPort = PRIVACY_API.wrapMemoryPortWithPurposeRevocationV1 as (
    inner: MemoryPortV2,
    controller: unknown,
    options?: unknown,
  ) => MemoryPortV2;
  // Kills a mutant that omits exporting wrapMemoryPortWithPurposeRevocationV1 from engram-memory.
  expect(typeof decorateMemoryPort).toBe("function");

  const controller = createController();
  const scopeRef = "scope:ws-alpha";
  const targetScopeRef = "scope:ws-beta";
  const { port: innerAuth, issuedReceipts } = makeTestAuthorizationPort(scopeRef);
  let innerAuthorizeCalls = 0;
  const spyingInnerAuth: AuthorizationPort = {
    ...innerAuth,
    async authorize(req) {
      innerAuthorizeCalls += 1;
      return innerAuth.authorize(req);
    },
  };
  const resolvePrincipalFromCredential = (credential: string) => {
    if (credential === "cred-agent-a") {
      return { ok: true as const, value: "agent-a" };
    }
    if (credential === "cred-agent-b") {
      return { ok: true as const, value: "agent-b" };
    }
    return { ok: true as const, value: undefined };
  };
  const wrappedWithPrincipal = controller.wrapAuthorizationPort(spyingInnerAuth, {
    resolvePrincipal(req: AuthorizationRequestV1) {
      return resolvePrincipalFromCredential(req.context.credential);
    },
  });

  let activityReads = 0;
  const activityEvidence = (() => {
    const base = makeBaselineCandidate(scopeRef, "memory.capture.session/v1", "Activity item from host");
    return {
      evidence_id: "act-ev-1",
      subject_ref: "subj:1",
      sequence: "1",
      valid_time: base.valid_time,
      components: base.components,
      primary_component_id: base.primary_component_id,
      primary_event: base.primary_event,
      citations: base.citations,
      evidence_digest: engramMemory.receiptDigest("act-ev", { id: "act-ev-1" }),
    };
  })();
  const activitySource: ActivityEvidenceSource = {
    source_id: "src:activity-1",
    source_version: "1.0.0",
    async read() {
      activityReads += 1;
      const body = {
        source_id: "src:activity-1",
        source_version: "1.0.0",
        evidence: [activityEvidence],
      };
      return {
        ok: true,
        value: {
          ...body,
          page_digest: engramMemory.receiptDigest("activity-page", body),
        },
      };
    },
    async cancel() {
      return { ok: true, value: { cancelled: true } };
    },
  };

  const makeEngine = (auth: AuthorizationPort, sources: readonly ActivityEvidenceSource[] = []) =>
    engramMemory.createMemoryPortV2({
      canonical_store: engramMemory.createInMemoryCanonicalMemoryStoreV1({
        clock: { now: () => T0_INSTANT },
      }),
      authorization: auth,
      admission_policy: {
        policy_id: "adm-pol",
        policy_version: "1.0.0",
        async decide(req) {
          const body = {
            policy_id: "adm-pol",
            policy_version: "1.0.0",
            record_digest: req.record_digest,
            decision: "accept" as const,
            issued_at: T0_INSTANT,
          };
          return {
            ok: true,
            value: { ...body, receipt_digest: engramMemory.receiptDigest("admission-decision", body) },
          };
        },
      },
      allow_unfenced_memory_store: true,
      crypto: makeInMemoryCryptoPort(),
      activity_sources: sources,
      clock: { now: () => T0_INSTANT },
    });

  const rawPort = makeEngine(wrappedWithPrincipal, [activitySource]);
  let innerCaptureCalls = 0;
  let innerIngestCalls = 0;
  let innerRecallCalls = 0;
  let innerCapCalls = 0;
  const spyingRawPort: MemoryPortV2 = {
    ...rawPort,
    async capture(req) {
      innerCaptureCalls += 1;
      return rawPort.capture(req);
    },
    async ingestActivity(req) {
      innerIngestCalls += 1;
      return rawPort.ingestActivity(req);
    },
    async recall(req) {
      innerRecallCalls += 1;
      return rawPort.recall(req);
    },
    async proposeCapitalisation(req) {
      innerCapCalls += 1;
      return rawPort.proposeCapitalisation(req);
    },
  };
  const memoryPort = decorateMemoryPort(spyingRawPort, controller, {
    resolvePrincipal(invocation: { readonly authorization: { readonly credential: string } }) {
      return resolvePrincipalFromCredential(invocation.authorization.credential);
    },
  });

  const makeCaptureInput = (
    idKey: string,
    seq: string,
    purposeRef: string,
    credential: string,
    contextRef?: string,
    targetScope = scopeRef,
  ) => {
    const payload = makeBaselineCandidate(targetScope, purposeRef, `Fact ${idKey}`);
    const payloadDigest = engramMemory.knowledgePayloadDigest(payload);
    return {
      schema_version: 2 as const,
      idempotency_key: idKey,
      payload,
      evidence: {
        evidence_ref: `ev:${idKey}`,
        evidence_digest: payloadDigest,
        citation_ids: ["cit-1"],
      },
      authorization:
        contextRef === undefined ? { credential } : { credential, context_ref: contextRef },
      source_order: { source_ref: "session:s-blocker2", sequence: seq },
      deadline_at: T_DEADLINE,
      cancellation_ref: `cancel:${idKey}`,
    };
  };

  // Issue receipts for agent-a, agent-b, and an absent-principal caller before revocation.
  const preA = await memoryPort.capture(
    makeCaptureInput("b2-idem-pre-a-0001", "1", "memory.capture.session/v1", "cred-agent-a"),
  );
  const preB = await memoryPort.capture(
    makeCaptureInput("b2-idem-pre-b-0002", "2", "memory.capture.session/v1", "cred-agent-b"),
  );
  const preAnon = await memoryPort.capture(
    makeCaptureInput("b2-idem-pre-anon-3", "3", "memory.capture.session/v1", "cred-unknown"),
  );
  // Kills a mutant that breaks capture before principal revocation when canonical payload.purpose_ref is set.
  expect(preA.ok && preB.ok && preAnon.ok).toBe(true);
  const receiptA = issuedReceipts[0]!.receipt_digest;
  const receiptB = issuedReceipts[1]!.receipt_digest;
  const receiptAnon = issuedReceipts[2]!.receipt_digest;

  // Admit agent-a's record in scope:ws-alpha so proposeCapitalisation can read and capitalise it into scope:ws-beta.
  const admittedSource = await memoryPort.requestAdmission({
    candidate_id: preA.ok ? preA.value.candidate_id! : "",
    authorization: { credential: "cred-agent-a" },
    deadline_at: T_DEADLINE,
  });
  expect(admittedSource.ok).toBe(true);
  const sourceRecordId = admittedSource.ok ? admittedSource.value.record_id! : "";

  // MAJOR verification: proposeCapitalisation MUST work end-to-end through the decorated port + wrapped AuthorizationPort,
  // even with authorization.context_ref set to the target capture purpose and frozen AuthorizationResourceV1.
  const capitaliseBeforeRevoke = await memoryPort.proposeCapitalisation({
    idempotency_key: "cap-idem-before-0001",
    source_record_id: sourceRecordId,
    target_scope_ref: targetScopeRef,
    purpose_ref: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    authorization: { credential: "cred-agent-a", context_ref: "memory.capture.session/v1" },
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant where proposeCapitalisation fails closed under wrapAuthorizationPort + decorator (MAJOR).
  expect(capitaliseBeforeRevoke.ok).toBe(true);
  if (capitaliseBeforeRevoke.ok) {
    // Kills a mutant that fails to commit a pending derivative candidate on proposeCapitalisation.
    expect(capitaliseBeforeRevoke.value.status).toBe("committed_pending");
  }

  // ingestActivity succeeds before revocation.
  const ingestBefore = await memoryPort.ingestActivity({
    source_id: "src:activity-1",
    limit: 10,
    scope_ref: scopeRef,
    purpose_ref: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    reconciliation: { family_refs: [] },
    authorization: { credential: "cred-agent-a", context_ref: "memory.capture.session/v1" },
    deadline_at: T_DEADLINE,
    cancellation_ref: "cancel:ingest-before",
  });
  // Kills a mutant that breaks ingestActivity delegation before revocation.
  expect(ingestBefore.ok).toBe(true);
  expect(activityReads).toBe(1);

  // Revoke only agent-a on memory.capture.session/v1 in scope:ws-alpha.
  const revA = controller.revokePurpose({
    scopeRef,
    principalRef: "agent-a",
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that fails to revoke a principal's capture purpose.
  expect(revA.ok).toBe(true);

  const captureCallsBeforePostA = innerCaptureCalls;
  const postA = await memoryPort.capture(
    makeCaptureInput("b2-idem-post-a-004", "4", "memory.capture.session/v1", "cred-agent-a"),
  );
  // Kills a mutant where decorator ignores principal-scoped capture revocation.
  expect(postA.ok).toBe(false);
  if (!postA.ok) {
    // Kills a mutant that returns a code other than AUTHORIZATION_REVOKED for a revoked principal.
    expect(postA.error.code).toBe("AUTHORIZATION_REVOKED");
  }
  // Kills a mutant that delegates to inner.capture for a revoked principal.
  expect(innerCaptureCalls).toBe(captureCallsBeforePostA);

  // ingestActivity for revoked agent-a MUST be refused BEFORE delegating (0 inner calls, 0 source.read calls).
  const ingestCallsBeforeRevoked = innerIngestCalls;
  const activityReadsBeforeRevoked = activityReads;
  const ingestRevokedA = await memoryPort.ingestActivity({
    source_id: "src:activity-1",
    limit: 10,
    scope_ref: scopeRef,
    purpose_ref: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    reconciliation: { family_refs: [] },
    authorization: { credential: "cred-agent-a", context_ref: "memory.capture.hmi/v1" },
    deadline_at: T_DEADLINE,
    cancellation_ref: "cancel:ingest-revoked",
  });
  // Kills a mutant that fails to block ingestActivity on a revoked purpose/principal (or trusts spoofed context_ref).
  expect(ingestRevokedA.ok).toBe(false);
  if (!ingestRevokedA.ok) {
    // Kills a mutant returning wrong code for revoked ingestActivity.
    expect(ingestRevokedA.error.code).toBe("AUTHORIZATION_REVOKED");
    expect(ingestRevokedA.error.operation).toBe("capture");
  }
  // Kills a mutant that delegates to inner.ingestActivity or reads activity source before checking revocation.
  expect(innerIngestCalls).toBe(ingestCallsBeforeRevoked);
  expect(activityReads).toBe(activityReadsBeforeRevoked);

  // Unrevoked agent-b can still ingestActivity and capture.
  const postB = await memoryPort.capture(
    makeCaptureInput("b2-idem-post-b-005", "5", "memory.capture.session/v1", "cred-agent-b"),
  );
  // Kills a mutant that blocks an unrevoked principal when only agent-a was revoked.
  expect(postB.ok).toBe(true);

  const captureCallsBeforeAnon = innerCaptureCalls;
  const postAnon = await memoryPort.capture(
    makeCaptureInput("b2-idem-post-anon6", "6", "memory.capture.session/v1", "cred-unknown"),
  );
  // Kills a mutant that allows an unknown/absent principal under an active principal-scoped revocation.
  expect(postAnon.ok).toBe(false);
  if (!postAnon.ok) {
    // Kills a mutant that fails to refuse absent principal under principal-scoped revocation with AUTHORIZATION_REVOKED.
    expect(postAnon.error.code).toBe("AUTHORIZATION_REVOKED");
  }
  expect(innerCaptureCalls).toBe(captureCallsBeforeAnon);

  // Source-scope capture revocation on ws-alpha does NOT block proposeCapitalisation into unrevoked target ws-beta.
  const capitaliseTargetStillOpen = await memoryPort.proposeCapitalisation({
    idempotency_key: "cap-idem-target-open",
    source_record_id: sourceRecordId,
    target_scope_ref: targetScopeRef,
    purpose_ref: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    authorization: { credential: "cred-agent-a" },
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant that conflates source-scope capture revocation with target-scope capitalisation.
  expect(capitaliseTargetStillOpen.ok).toBe(true);

  // Revoke agent-a on targetScopeRef (scope:ws-beta) -> proposeCapitalisation for agent-a MUST fail BEFORE delegating,
  // even with a spoofed unrevoked context_ref, while agent-b still succeeds.
  const revTargetA = controller.revokePurpose({
    scopeRef: targetScopeRef,
    principalRef: "agent-a",
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  expect(revTargetA.ok).toBe(true);

  const capCallsBeforeRevoked = innerCapCalls;
  const capitaliseRevokedA = await memoryPort.proposeCapitalisation({
    idempotency_key: "cap-idem-revoked-001",
    source_record_id: sourceRecordId,
    target_scope_ref: targetScopeRef,
    purpose_ref: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    authorization: { credential: "cred-agent-a", context_ref: "memory.capture.hmi/v1" },
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant that fails to block proposeCapitalisation when target scope purpose is revoked for agent-a.
  expect(capitaliseRevokedA.ok).toBe(false);
  if (!capitaliseRevokedA.ok) {
    // Kills a mutant returning wrong code or operation on revoked proposeCapitalisation.
    expect(capitaliseRevokedA.error.code).toBe("AUTHORIZATION_REVOKED");
    expect(capitaliseRevokedA.error.operation).toBe("propose_capitalisation");
  }
  // Kills a mutant that delegates to inner.proposeCapitalisation before checking revocation.
  expect(innerCapCalls).toBe(capCallsBeforeRevoked);

  const capitaliseAllowedB = await memoryPort.proposeCapitalisation({
    idempotency_key: "cap-idem-allowed-00b",
    source_record_id: sourceRecordId,
    target_scope_ref: targetScopeRef,
    purpose_ref: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    authorization: { credential: "cred-agent-b" },
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant that blocks unrevoked agent-b from proposeCapitalisation when only agent-a was revoked.
  expect(capitaliseAllowedB.ok).toBe(true);

  const directAbsentPrincipal = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that allows checkPurposeAuthorization with omitted principalRef under principal revocation.
  expect(directAbsentPrincipal.ok).toBe(false);
  if (!directAbsentPrincipal.ok) {
    // Kills a mutant returning wrong error code for omitted principalRef under principal revocation.
    expect(directAbsentPrincipal.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const revalA = await wrappedWithPrincipal.revalidate(receiptA, T1_INSTANT);
  // Kills a mutant that keeps agent-a's prior capture receipt valid on revalidate after agent-a revocation.
  expect(revalA.ok && revalA.value.valid === false && revalA.value.reason === "revoked").toBe(true);

  const revalB = await wrappedWithPrincipal.revalidate(receiptB, T1_INSTANT);
  // Kills a mutant that invalidates agent-b's capture receipt when only agent-a was revoked.
  expect(revalB.ok && revalB.value.valid === true).toBe(true);

  const revalAnon = await wrappedWithPrincipal.revalidate(receiptAnon, T1_INSTANT);
  // Kills a mutant that keeps an unidentified-principal receipt valid after a principal-scoped revocation.
  expect(revalAnon.ok && revalAnon.value.valid === false && revalAnon.value.reason === "revoked").toBe(
    true,
  );

  // Spoofing an unrevoked context_ref must NEVER authorize a revoked payload.purpose_ref or recall purpose_ref.
  const spoofCtrl = createController();
  const { port: spoofInnerAuth } = makeTestAuthorizationPort(scopeRef);
  const spoofRaw = makeEngine(spoofCtrl.wrapAuthorizationPort(spoofInnerAuth));
  let spoofInnerRecallCalls = 0;
  const spoofSpyingRaw: MemoryPortV2 = {
    ...spoofRaw,
    async recall(req) {
      spoofInnerRecallCalls += 1;
      return spoofRaw.recall(req);
    },
  };
  const spoofPort = decorateMemoryPort(spoofSpyingRaw, spoofCtrl);
  const spoofPortWithScope = decorateMemoryPort(spoofSpyingRaw, spoofCtrl, { scopeRef });

  const revSession = spoofCtrl.revokePurpose({
    scopeRef,
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant breaking baseline scope-wide revocation for context_ref spoofing check.
  expect(revSession.ok).toBe(true);

  const spoofedCapture = await spoofPort.capture(
    makeCaptureInput(
      "b2-idem-spoof-0007",
      "7",
      "memory.capture.session/v1",
      "cred-alpha",
      "memory.capture.hmi/v1",
    ),
  );
  // Kills a mutant that trusts unvalidated context_ref to authorize a revoked payload.purpose_ref.
  expect(spoofedCapture.ok).toBe(false);
  if (!spoofedCapture.ok) {
    // Kills a mutant returning wrong code when unrevoked context_ref attempts to bypass revoked capture purpose.
    expect(spoofedCapture.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const revContextual = spoofCtrl.revokePurpose({
    scopeRef,
    purpose: "memory.recall.contextual/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant breaking baseline recall revocation for recall context_ref spoofing check.
  expect(revContextual.ok).toBe(true);

  // With scopeRef on decorator: recall MUST be refused BEFORE delegating to inner.recall.
  const recallCallsBeforeScoped = spoofInnerRecallCalls;
  const spoofedScopedRecall = await spoofPortWithScope.recall({
    query: "architecture",
    purpose_ref: "memory.recall.contextual/v1",
    authorization: { credential: "cred-alpha", context_ref: "memory.recall.study/v1" },
    capability_policy: { minimum_channels: "lexical", network: "forbid" },
    budgets: {
      max_candidates: 10,
      max_results: 5,
      max_packet_bytes: 8_192,
      deadline_at: T_DEADLINE,
    },
  });
  // Kills a mutant that skips pre-delegation recall revocation when scopeRef is known.
  expect(spoofedScopedRecall.ok).toBe(false);
  if (!spoofedScopedRecall.ok) {
    expect(spoofedScopedRecall.error.code).toBe("AUTHORIZATION_REVOKED");
  }
  // Kills a mutant that delegates to inner.recall when scopeRef is known and purpose is revoked.
  expect(spoofInnerRecallCalls).toBe(recallCallsBeforeScoped);

  // Without scopeRef on decorator (bound through wrappedAuth): recall with spoofed context_ref MUST also fail AUTHORIZATION_REVOKED.
  const spoofedRecall = await spoofPort.recall({
    query: "architecture",
    purpose_ref: "memory.recall.contextual/v1",
    authorization: { credential: "cred-alpha", context_ref: "memory.recall.study/v1" },
    capability_policy: { minimum_channels: "lexical", network: "forbid" },
    budgets: {
      max_candidates: 10,
      max_results: 5,
      max_packet_bytes: 8_192,
      deadline_at: T_DEADLINE,
    },
  });
  // Kills a mutant that trusts unrevoked context_ref to authorize a revoked RecallRequestV2.purpose_ref.
  expect(spoofedRecall.ok).toBe(false);
  if (!spoofedRecall.ok) {
    // Kills a mutant returning wrong code when unrevoked context_ref tries to bypass revoked recall purpose.
    expect(spoofedRecall.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  // Getter TOCTOU on CaptureRequestV2, RecallRequestV2, CapitalisationRequestV1, and AuthorizationRequestV1
  // MUST fail closed with INVALID_SCHEMA BEFORE delegating.
  let capGetterReads = 0;
  const toctouPayload = { ...makeBaselineCandidate(scopeRef, "memory.capture.hmi/v1", "Getter test") } as Record<string, unknown>;
  delete toctouPayload.purpose_ref;
  Object.defineProperty(toctouPayload, "purpose_ref", {
    enumerable: true,
    configurable: true,
    get() {
      capGetterReads += 1;
      return capGetterReads === 1 ? "memory.capture.hmi/v1" : "memory.capture.session/v1";
    },
  });
  const baseCap = makeCaptureInput("b2-idem-getter-001", "8", "memory.capture.hmi/v1", "cred-agent-b");
  const capCallsBeforeGetter = innerCaptureCalls;
  const getterCaptureRes = await memoryPort.capture({
    ...baseCap,
    payload: toctouPayload as unknown as CandidatePayloadV2,
  });
  // Kills a mutant that reads CaptureRequestV2 without strict decoding (allowing getter TOCTOU on payload.purpose_ref).
  expect(getterCaptureRes.ok).toBe(false);
  if (!getterCaptureRes.ok) {
    expect(getterCaptureRes.error.code).toBe("INVALID_SCHEMA");
  }
  expect(innerCaptureCalls).toBe(capCallsBeforeGetter);
  expect(capGetterReads).toBe(0);

  const recallCallsBeforeGetter = innerRecallCalls;
  const getterRecallRes = await memoryPort.recall(
    makeGetterObject(
      {
        query: "architecture",
        purpose_ref: "memory.recall.contextual/v1",
        authorization: { credential: "cred-agent-b" },
        capability_policy: { minimum_channels: "lexical", network: "forbid" },
        budgets: {
          max_candidates: 10,
          max_results: 5,
          max_packet_bytes: 8_192,
          deadline_at: T_DEADLINE,
        },
      },
      "purpose_ref",
      "memory.recall.contextual/v1",
    ) as never,
  );
  // Kills a mutant that reads RecallRequestV2 without strict decoding.
  expect(getterRecallRes.ok).toBe(false);
  if (!getterRecallRes.ok) {
    expect(getterRecallRes.error.code).toBe("INVALID_SCHEMA");
  }
  expect(innerRecallCalls).toBe(recallCallsBeforeGetter);

  const capPropCallsBeforeGetter = innerCapCalls;
  const getterCapRes = await memoryPort.proposeCapitalisation(
    makeGetterObject(
      {
        idempotency_key: "cap-idem-getter-0001",
        source_record_id: sourceRecordId,
        target_scope_ref: targetScopeRef,
        purpose_ref: "memory.capture.hmi/v1",
        retention: { derivative_rule: "retain" },
        authorization: { credential: "cred-agent-b" },
        deadline_at: T_DEADLINE,
      },
      "purpose_ref",
      "memory.capture.hmi/v1",
    ) as never,
  );
  // Kills a mutant that reads CapitalisationRequestV1 without strict decoding.
  expect(getterCapRes.ok).toBe(false);
  if (!getterCapRes.ok) {
    expect(getterCapRes.error.code).toBe("INVALID_SCHEMA");
    expect(getterCapRes.error.operation).toBe("propose_capitalisation");
  }
  expect(innerCapCalls).toBe(capPropCallsBeforeGetter);

  // Getter TOCTOU on AuthorizationRequestV1 passed directly to wrapAuthorizationPort.authorize must refuse before inner.authorize.
  let authGetterReads = 0;
  const toctouContext: Record<string, unknown> = {};
  Object.defineProperty(toctouContext, "credential", {
    enumerable: true,
    configurable: true,
    get() {
      authGetterReads += 1;
      return authGetterReads === 1 ? "cred-agent-b" : "cred-agent-a";
    },
  });
  const callsBeforeAuthGetter = innerAuthorizeCalls;
  const getterAuthRes = await wrappedWithPrincipal.authorize({
    operation: "capture",
    resource: { scope_ref: scopeRef },
    resource_digest: engramMemory.authorizationResourceDigest("capture", { scope_ref: scopeRef }),
    context: toctouContext as AuthorizationRequestV1["context"],
    issued_at: T0_INSTANT,
    deadline_at: T_DEADLINE,
  });
  // Kills a mutant that reads AuthorizationRequestV1 without strict decoding (allowing getter TOCTOU).
  expect(getterAuthRes.ok).toBe(false);
  if (!getterAuthRes.ok) {
    expect(getterAuthRes.error.code).toBe("INVALID_SCHEMA");
  }
  expect(innerAuthorizeCalls).toBe(callsBeforeAuthGetter);
  expect(authGetterReads).toBe(0);

  // Decorator without resolvePrincipal must still fail closed under an active principal-scoped revocation.
  const noResolverPort = decorateMemoryPort(makeEngine(controller.wrapAuthorizationPort(innerAuth)), controller);
  const captureWithoutResolver = await noResolverPort.capture(
    makeCaptureInput("b2-idem-nores-0008", "9", "memory.capture.session/v1", "cred-agent-b"),
  );
  // Kills a mutant that bypasses principal-scoped revocation when resolvePrincipal is omitted.
  expect(captureWithoutResolver.ok).toBe(false);
  if (!captureWithoutResolver.ok) {
    expect(captureWithoutResolver.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  // Throwing resolvePrincipal on decorator must fail closed with POLICY_UNAVAILABLE without throwing.
  const throwingPort = decorateMemoryPort(makeEngine(innerAuth), controller, {
    resolvePrincipal() {
      throw new Error("principal directory unavailable");
    },
  });
  const captureThrowingResolver = await throwingPort.capture(
    makeCaptureInput("b2-idem-throw-0009", "10", "memory.capture.session/v1", "cred-agent-b"),
  );
  // Kills a mutant that lets resolvePrincipal exceptions escape instead of failing closed.
  expect(captureThrowingResolver.ok).toBe(false);
  if (!captureThrowingResolver.ok) {
    expect(captureThrowingResolver.error.code).toBe("POLICY_UNAVAILABLE");
  }

  // Unwrapped innerAuth + no scopeRef on decorator MUST still fail closed on recall when that recall purpose is revoked.
  const unwrappedRecallPort = spoofCtrl.wrapMemoryPort(makeEngine(spoofInnerAuth));
  const unwrappedRevokedRecall = await unwrappedRecallPort.recall({
    query: "architecture",
    purpose_ref: "memory.recall.contextual/v1",
    authorization: { credential: "cred-alpha" },
    capability_policy: { minimum_channels: "lexical", network: "forbid" },
    budgets: {
      max_candidates: 10,
      max_results: 5,
      max_packet_bytes: 8_192,
      deadline_at: T_DEADLINE,
    },
  });
  // Kills a mutant that silently serves recall when neither scopeRef nor wrapAuthorizationPort verified the scope under active recall revocation.
  expect(unwrappedRevokedRecall.ok).toBe(false);
  if (!unwrappedRevokedRecall.ok) {
    expect(unwrappedRevokedRecall.error.code).toBe("AUTHORIZATION_REVOKED");
  }
});

it("purpose revocation keys forbid NUL bytes and isolate literal '*' principal from scope-wide revocation", () => {
  const createController = PRIVACY_API.createPurposeRevocationControllerV1 as () => {
    revokePurpose(input: unknown): Result<unknown>;
    checkPurposeAuthorization(input: unknown): Result<unknown>;
  };
  const controller = createController();
  const scopeRef = "scope:ws-alpha";

  const starRevoke = controller.revokePurpose({
    scopeRef,
    principalRef: "*",
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that crashes when handling literal '*' principalRef.
  expect(starRevoke.ok).toBe(true);

  const otherPrincipalAfterStar = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    principalRef: "agent-b",
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant whose string-concatenation key collides principalRef: '*' with the scope-wide slot.
  expect(otherPrincipalAfterStar.ok).toBe(true);

  const starPrincipalBlocked = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    principalRef: "*",
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that drops revocation enforcement for literal '*' principalRef.
  expect(starPrincipalBlocked.ok).toBe(false);
  if (!starPrincipalBlocked.ok) {
    // Kills a mutant returning wrong code when literal '*' principalRef is revoked.
    expect(starPrincipalBlocked.error.code).toBe("AUTHORIZATION_REVOKED");
  }

  const nulScopeRevoke = controller.revokePurpose({
    scopeRef: "scope:a\0agent-x",
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that allows NUL bytes in revokePurpose.scopeRef (cross-scope slot collision).
  expect(nulScopeRevoke.ok).toBe(false);
  if (!nulScopeRevoke.ok) {
    // Kills a mutant returning wrong code for NUL byte in revokePurpose.scopeRef.
    expect(nulScopeRevoke.error.code).toBe("INVALID_SCHEMA");
  }

  const nulPrincipalRevoke = controller.revokePurpose({
    scopeRef,
    principalRef: "agent\0x",
    purpose: "memory.capture.session/v1",
    revokedAt: T1_INSTANT,
  });
  // Kills a mutant that allows NUL bytes in revokePurpose.principalRef.
  expect(nulPrincipalRevoke.ok).toBe(false);
  if (!nulPrincipalRevoke.ok) {
    // Kills a mutant returning wrong code for NUL byte in revokePurpose.principalRef.
    expect(nulPrincipalRevoke.error.code).toBe("INVALID_SCHEMA");
  }

  const nulScopeCheck = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef: "scope:a\0b",
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that allows NUL bytes in checkPurposeAuthorization.scopeRef.
  expect(nulScopeCheck.ok).toBe(false);

  const nulPrincipalCheck = controller.checkPurposeAuthorization({
    operation: "capture",
    scopeRef,
    principalRef: "agent\0b",
    purposeRef: "memory.capture.session/v1",
  });
  // Kills a mutant that allows NUL bytes in checkPurposeAuthorization.principalRef.
  expect(nulPrincipalCheck.ok).toBe(false);
});

it("D7 salted-term screening does not truncate past 512 tokens and refuses missing termSalt", async () => {
  const hashTerm = PRIVACY_API.hashConfidentialTermV1 as (input: unknown) => Result<Digest>;
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<unknown>;
  const screenDenyList = PRIVACY_API.screenForDenyListV1 as (
    denyList: unknown,
    surface: unknown,
    options?: unknown,
  ) => Result<{ readonly allowed: boolean; readonly disposition: string }>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<Result<unknown>>;

  const phraseHashRes = hashTerm({ term: "Project Atlas", salt: "real-salt-42" });
  // Kills a mutant breaking baseline hashConfidentialTermV1 for multi-word phrase.
  expect(phraseHashRes.ok).toBe(true);
  if (!phraseHashRes.ok) {
    return;
  }

  const listRes = createDenyList({
    version: "d7-salt-test",
    saltedTermHashes: [phraseHashRes.value],
    deterministicPatterns: [],
    piiCategoryRules: [],
  });
  // Kills a mutant breaking baseline deny-list with saltedTermHashes.
  expect(listRes.ok).toBe(true);
  if (!listRes.ok) {
    return;
  }
  const denyList = listRes.value;

  // 600 whitespace-separated tokens preceding the salted multi-word phrase (well under 64 KiB).
  const paddedText = `${"alpha ".repeat(600)}Project Atlas roadmap`;
  const paddedScreen = screenDenyList(denyList, paddedText, { termSalt: "real-salt-42" });
  // Kills a mutant that fails screening valid <= 64 KiB text with > 512 tokens.
  expect(paddedScreen.ok).toBe(true);
  if (paddedScreen.ok) {
    // Kills a mutant that truncates phrase tokens at 512 and misses trailing salted phrases.
    expect(paddedScreen.value.allowed).toBe(false);
    // Kills a mutant that fails to mark a post-512-token salted phrase hit as withheld_d7.
    expect(paddedScreen.value.disposition).toBe("withheld_d7");
  }

  const missingSaltScreen = screenDenyList(denyList, "Project Atlas roadmap");
  // Kills a mutant that silently defaults termSalt to denyList.version instead of failing closed.
  expect(missingSaltScreen.ok).toBe(false);
  if (!missingSaltScreen.ok) {
    // Kills a mutant returning a code other than POLICY_UNAVAILABLE when termSalt is omitted for salted hashes.
    expect(missingSaltScreen.error.code).toBe("POLICY_UNAVAILABLE");
  }

  const { port: authPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1");
  const cleanRecord = makeBaselineRecord("scope:ws-alpha", "memory.capture.session/v1", "Benign text.");
  const armorMissingSalt = await redactWithArmor({
    authorizationPort: authPort,
    request: {
      source_record: cleanRecord,
      target_scope_ref: "scope:ws-beta",
      directive: {
        mode: "field-allowlist",
        allowed_fields: [""],
        allow_derivation_lineage: false,
        max_packet_bytes: 8_192,
      },
      authorization_receipt_digest: engramMemory.receiptDigest("authz-cap", { id: "salt-check" }),
    },
    denyList,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace",
    d33Pseudonymized: true,
  });
  // Kills a mutant that permits redactWithPiiArmorV1 to skip salted-term screening when termSalt is omitted.
  expect(armorMissingSalt.ok).toBe(false);
  if (!armorMissingSalt.ok) {
    // Kills a mutant returning wrong refusal code in redactWithPiiArmorV1 when termSalt is absent.
    expect(armorMissingSalt.error.code).toBe("POLICY_UNAVAILABLE");
  }
});

it("evaluateEgressBoundaryV1 refuses omitted byte-ceiling inputs instead of skipping checks", async () => {
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<{
    readonly version: string;
    readonly digestSha256: Digest;
  }>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<
    Result<{
      readonly redactionReceipt: { readonly outputPayloadDigest: Digest };
      readonly stamp: Record<string, unknown>;
      readonly packetBytes: number;
    }>
  >;
  const evaluateEgress = PRIVACY_API.evaluateEgressBoundaryV1 as (input: unknown) => Result<unknown>;

  const denyListRes = createDenyList({
    version: "d7-2026-11",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: ["email"],
  });
  // Kills a mutant breaking baseline deny-list construction for byte-ceiling refusal tests.
  expect(denyListRes.ok).toBe(true);
  if (!denyListRes.ok) {
    return;
  }

  const { port: authPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1");
  const authzReceipt = engramMemory.receiptDigest("authz-cap", { id: "bytes-check" });
  const armorRes = await redactWithArmor({
    authorizationPort: authPort,
    request: {
      source_record: makeBaselineRecord("scope:ws-alpha", "memory.capture.session/v1", "Bounded note."),
      target_scope_ref: "scope:ws-beta",
      directive: {
        mode: "field-allowlist",
        allowed_fields: [""],
        allow_derivation_lineage: false,
        max_packet_bytes: 8_192,
      },
      authorization_receipt_digest: authzReceipt,
    },
    denyList: denyListRes.value,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace",
    d33Pseudonymized: true,
  });
  // Kills a mutant breaking baseline bound redaction for byte-ceiling test.
  expect(armorRes.ok).toBe(true);
  if (!armorRes.ok) {
    return;
  }

  const missingCrossBytes = evaluateEgress({
    boundary: "cross-workspace",
    metamodelClass: "typed_node",
    sourceScopeRef: "scope:ws-alpha",
    targetScopeRef: "scope:ws-beta",
    authorizationReceiptDigest: authzReceipt,
    payloadDigest: armorRes.value.redactionReceipt.outputPayloadDigest,
    piiArmorStamp: armorRes.value.stamp,
    redactionReceipt: armorRes.value.redactionReceipt,
    expectedPolicy: {
      policyVersion: "armor-policy/v1",
      d7BlacklistVersion: "d7-2026-11",
      d7BlacklistDigest: denyListRes.value.digestSha256,
    },
  });
  // Kills a mutant that skips the cross-boundary maxPacketBytes check when packetBytes/maxPacketBytes are omitted.
  expect(missingCrossBytes.ok).toBe(false);
  if (!missingCrossBytes.ok) {
    // Kills a mutant returning wrong code when cross-boundary byte counts are omitted.
    expect(missingCrossBytes.error.code).toBe("INVALID_SCHEMA");
  }

  const missingTurnBytes = evaluateEgress({
    boundary: "same-workspace-sync",
    metamodelClass: "turn_text",
    workspaceSyncEnabled: true,
    contentPolicyAllowsSync: true,
  });
  // Kills a mutant that skips the 64 KiB turn_text check on same-workspace-sync when turnTextBytes is omitted.
  expect(missingTurnBytes.ok).toBe(false);
  if (!missingTurnBytes.ok) {
    // Kills a mutant returning wrong code when turnTextBytes is omitted on same-workspace-sync turn_text.
    expect(missingTurnBytes.error.code).toBe("INVALID_SCHEMA");
  }
});

it("executeAnnouncedPurgeV1 refuses destroyed:false from CryptoPort.destroy", async () => {
  const createReceipt = PRIVACY_API.createPurgeAnnouncementReceiptV1 as (input: unknown) => Result<unknown>;
  const executePurge = PRIVACY_API.executeAnnouncedPurgeV1 as (input: unknown) => Promise<Result<unknown>>;

  const hostPolicy = {
    policyId: "host-audit-destroy-check",
    auditWindowMs: 3_600_000,
    derivativeRule: "make-ineligible" as const,
  };
  const windowEnd = new Date(Date.parse(T0_INSTANT) + hostPolicy.auditWindowMs).toISOString();
  const sessionPseudoId = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(61),
    "sess-destroy-false",
  );
  const receiptRes = createReceipt({
    hostPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: [sessionPseudoId],
    closedAt: T0_INSTANT,
    announcedAt: windowEnd,
    executeNotBefore: windowEnd,
    targetClasses: ["host-context-log"],
  });
  // Kills a mutant breaking baseline purge receipt creation for destroyed:false test.
  expect(receiptRes.ok).toBe(true);
  if (!receiptRes.ok) {
    return;
  }

  let purgedCalled = false;
  const falseDestroyCrypto: CryptoPort = {
    ...makeInMemoryCryptoPort(),
    async destroy(input) {
      return {
        ok: true,
        value: {
          destroyed: false,
          receipt_digest: engramMemory.receiptDigest("crypto-destroy", {
            key_ref: input.key_ref,
            idempotency_key: input.idempotency_key,
          }),
        },
      };
    },
  };

  const purgeRes = await executePurge({
    hostPolicy,
    announcement: receiptRes.value,
    now: windowEnd,
    crypto: falseDestroyCrypto,
    expiredKeyRefs: ["key-ref-not-destroyed"],
    async journalAnnouncement() {
      return { ok: true as const, value: { journaled: true as const } };
    },
    async purgeTarget() {
      purgedCalled = true;
      return { ok: true as const, value: { purged: true as const } };
    },
  });
  // Kills a mutant that treats CryptoPort.destroy returning { destroyed: false } as a successful key destruction.
  expect(purgeRes.ok).toBe(false);
  if (!purgeRes.ok) {
    // Kills a mutant returning wrong refusal code when CryptoPort.destroy reports destroyed: false.
    expect(purgeRes.error.code).toBe("STORE_UNAVAILABLE");
    // Kills a mutant returning wrong operation when CryptoPort.destroy reports destroyed: false.
    expect(purgeRes.error.operation).toBe("expire");
  }
  // Kills a mutant that proceeds to purgeTarget after a key failed to destroy.
  expect(purgedCalled).toBe(false);
});

it("minor round-1 guards: bounded purge idempotency key and normalized errors, pre-redact directive validation, extreme-year study windowStart, and bounded JSON recursion", async () => {
  const createReceipt = PRIVACY_API.createPurgeAnnouncementReceiptV1 as (input: unknown) => Result<unknown>;
  const executePurge = PRIVACY_API.executeAnnouncedPurgeV1 as (input: unknown) => Promise<Result<unknown>>;
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<{
    readonly version: string;
    readonly digestSha256: Digest;
  }>;
  const screenDenyList = PRIVACY_API.screenForDenyListV1 as (
    denyList: unknown,
    surface: unknown,
    options?: unknown,
  ) => Result<unknown>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<Result<unknown>>;
  const applyStudyWindow = PRIVACY_API.applyStudyWindowV1 as (input: unknown) => Result<unknown>;

  // Minor 1 (Finding 7): 400-byte keyRef produces <= 256-byte idempotency_key, and failed callbacks normalize to operation: "expire".
  const hostPolicy = {
    policyId: "host-audit-minor7",
    auditWindowMs: 3_600_000,
    derivativeRule: "make-ineligible" as const,
  };
  const windowEnd = new Date(Date.parse(T0_INSTANT) + hostPolicy.auditWindowMs).toISOString();
  const sessPseudo = expectedHmacPseudonym(
    "sess_pseudo:",
    "engram/d33/session/v1\0",
    makeKeyBytes(71),
    "sess-minor7",
  );
  const receiptRes = createReceipt({
    hostPolicy,
    scope: PRIVACY_SCOPE_A,
    sessionPseudoIds: [sessPseudo],
    closedAt: T0_INSTANT,
    announcedAt: windowEnd,
    executeNotBefore: windowEnd,
    targetClasses: ["host-context-log"],
  });
  expect(receiptRes.ok).toBe(true);
  if (receiptRes.ok) {
    let observedIdemKey = "";
    const observingCrypto: CryptoPort = {
      ...makeInMemoryCryptoPort(),
      async destroy(input) {
        observedIdemKey = input.idempotency_key;
        return {
          ok: true,
          value: {
            destroyed: true,
            receipt_digest: engramMemory.receiptDigest("crypto-destroy", {
              key_ref: input.key_ref,
              idempotency_key: input.idempotency_key,
            }),
          },
        };
      },
    };
    const longKeyRef = `key_${"x".repeat(400)}`;
    const longKeyPurge = await executePurge({
      hostPolicy,
      announcement: receiptRes.value,
      now: windowEnd,
      crypto: observingCrypto,
      expiredKeyRefs: [longKeyRef],
      async journalAnnouncement() {
        return { ok: true as const, value: { journaled: true as const } };
      },
      async purgeTarget() {
        return { ok: true as const, value: { purged: true as const } };
      },
    });
    // Kills a mutant that breaks purge execution on valid 400-byte keyRef.
    expect(longKeyPurge.ok).toBe(true);
    const keyBytes = new TextEncoder().encode(observedIdemKey).byteLength;
    // Kills a mutant that concatenates raw keyRef into idempotency_key exceeding the 256-byte bound.
    expect(keyBytes >= 16 && keyBytes <= 256).toBe(true);

    const unnormalizedJournalErr = await executePurge({
      hostPolicy,
      announcement: receiptRes.value,
      now: windowEnd,
      async journalAnnouncement() {
        return {
          ok: false,
          error: {
            code: "STORE_UNAVAILABLE",
            operation: "capture",
            message: "disk busy",
            retryable: true,
          },
        };
      },
      async purgeTarget() {
        return { ok: true as const, value: { purged: true as const } };
      },
    });
    // Kills a mutant that returns an unnormalized callback error without operation: "expire".
    expect(unnormalizedJournalErr.ok).toBe(false);
    if (!unnormalizedJournalErr.ok) {
      expect(unnormalizedJournalErr.error.operation).toBe("expire");
    }

    const malformedPurgeErr = await executePurge({
      hostPolicy,
      announcement: receiptRes.value,
      now: windowEnd,
      async journalAnnouncement() {
        return { ok: true as const, value: { journaled: true as const } };
      },
      async purgeTarget() {
        return { ok: false, error: null };
      },
    });
    // Kills a mutant that passes through a null error object from purgeTarget verbatim.
    expect(malformedPurgeErr.ok).toBe(false);
    if (!malformedPurgeErr.ok) {
      expect(malformedPurgeErr.error.code).toBe("STORE_UNAVAILABLE");
      expect(malformedPurgeErr.error.operation).toBe("expire");
    }
  }

  // Minor 2 (Finding 8): invalid directive is refused BEFORE AuthorizationPort.redact is invoked.
  const denyListRes = createDenyList({
    version: "d7-2026-11",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: ["email"],
  });
  expect(denyListRes.ok).toBe(true);
  if (denyListRes.ok) {
    let redactCalls = 0;
    const { port: countingPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1", {
      redactImpl: async () => {
        redactCalls += 1;
        return {
          ok: false,
          error: {
            code: "POLICY_UNAVAILABLE",
            operation: "propose_capitalisation",
            message: "should not be reached",
            retryable: false,
          },
        };
      },
    });
    const badDirectiveRes = await redactWithArmor({
      authorizationPort: countingPort,
      request: {
        source_record: makeBaselineRecord("scope:ws-alpha", "memory.capture.session/v1", "Note"),
        target_scope_ref: "scope:ws-beta",
        directive: {
          mode: "field-allowlist",
          allowed_fields: ["/scope_ref", "/components"],
          allow_derivation_lineage: false,
          max_packet_bytes: 0,
        },
        authorization_receipt_digest: engramMemory.receiptDigest("authz-cap", { id: "minor8" }),
      },
      denyList: denyListRes.value,
      policyVersion: "armor-policy/v1",
      boundary: "cross-workspace",
      d33Pseudonymized: true,
    });
    // Kills a mutant that invokes AuthorizationPort.redact before validating RedactionDirectiveV1.
    expect(badDirectiveRes.ok).toBe(false);
    if (!badDirectiveRes.ok) {
      expect(badDirectiveRes.error.code).toBe("INVALID_SCHEMA");
    }
    // Kills a mutant that reaches AuthorizationPort.redact with an invalid directive.
    expect(redactCalls).toBe(0);

    // Minor 3 (Finding 9): extreme-year asOf where windowStart < year 0000 refuses INVALID_SCHEMA.
    const extremeStudy = applyStudyWindow({
      purposeRef: "memory.recall.study/v1",
      asOf: "0000-01-01T00:00:00.000Z",
      items: [],
      targetScopeRef: "scope:study-target",
      authorizationReceiptDigest: engramMemory.receiptDigest("authz-study", { id: "minor9" }),
      expectedArmorPolicy: {
        policyVersion: "armor-policy/v1",
        d7BlacklistVersion: "d7-2026-11",
        d7BlacklistDigest: denyListRes.value.digestSha256,
      },
    });
    // Kills a mutant that emits a negative-year windowStart string violating Instant syntax.
    expect(extremeStudy.ok).toBe(false);
    if (!extremeStudy.ok) {
      expect(extremeStudy.error.code).toBe("INVALID_SCHEMA");
    }

    // Minor 4 (Finding 10): deeply nested JSON surface refuses INVALID_SCHEMA without throwing RangeError.
    let deep: unknown = "leaf";
    for (let depth = 0; depth < 256; depth += 1) {
      deep = { child: deep };
    }
    const deepRes = screenDenyList(denyListRes.value, deep);
    // Kills a mutant with uncapped recursion in decodeStrictJsonValue / collectStrings.
    expect(deepRes.ok).toBe(false);
    if (!deepRes.ok) {
      expect(deepRes.error.code).toBe("INVALID_SCHEMA");
    }
  }
});

it("minor round-2 guards: applyStudyWindowV1 validates expectedArmorPolicy on empty items; redactWithPiiArmorV1 checks termSalt before redact and normalizes port errors", async () => {
  const hashTerm = PRIVACY_API.hashConfidentialTermV1 as (input: unknown) => Result<Digest>;
  const createDenyList = PRIVACY_API.createConfidentialityDenyListV1 as (input: unknown) => Result<{
    readonly version: string;
    readonly digestSha256: Digest;
  }>;
  const redactWithArmor = PRIVACY_API.redactWithPiiArmorV1 as (input: unknown) => Promise<Result<unknown>>;
  const applyStudyWindow = PRIVACY_API.applyStudyWindowV1 as (input: unknown) => Result<unknown>;

  // Round-2 MINOR 1: applyStudyWindowV1 MUST validate expectedArmorPolicy schema even when items is empty.
  const badPolicyEmptyItems = applyStudyWindow({
    purposeRef: "memory.recall.study/v1",
    asOf: T1_INSTANT,
    items: [],
    targetScopeRef: "scope:study-target",
    authorizationReceiptDigest: engramMemory.receiptDigest("authz-study", { id: "r2-minor1" }),
    expectedArmorPolicy: {
      policyVersion: "armor-policy/v1",
      d7BlacklistVersion: "d7-2026-11",
      d7BlacklistDigest: "not-a-sha256-digest",
    },
  });
  // Kills a mutant that defers expectedArmorPolicy validation to the per-item loop and returns ok:true on empty items.
  expect(badPolicyEmptyItems.ok).toBe(false);
  if (!badPolicyEmptyItems.ok) {
    // Kills a mutant returning wrong code for malformed expectedArmorPolicy on empty study items.
    expect(badPolicyEmptyItems.error.code).toBe("INVALID_SCHEMA");
    expect(badPolicyEmptyItems.error.operation).toBe("recall_current");
  }

  const extraKeyPolicyEmptyItems = applyStudyWindow({
    purposeRef: "memory.recall.study/v1",
    asOf: T1_INSTANT,
    items: [],
    targetScopeRef: "scope:study-target",
    authorizationReceiptDigest: engramMemory.receiptDigest("authz-study", { id: "r2-minor1b" }),
    expectedArmorPolicy: {
      policyVersion: "armor-policy/v1",
      d7BlacklistVersion: "d7-2026-11",
      d7BlacklistDigest: `sha256:${"a".repeat(64)}`,
      unexpected: true,
    },
  });
  // Kills a mutant that allows extra keys on expectedArmorPolicy when items is empty.
  expect(extraKeyPolicyEmptyItems.ok).toBe(false);
  if (!extraKeyPolicyEmptyItems.ok) {
    expect(extraKeyPolicyEmptyItems.error.code).toBe("INVALID_SCHEMA");
  }

  // Round-2 MINOR 2a: redactWithPiiArmorV1 MUST refuse missing termSalt BEFORE invoking AuthorizationPort.redact.
  const phraseHash = hashTerm({ term: "SecretCodename", salt: "r2-salt" });
  expect(phraseHash.ok).toBe(true);
  if (!phraseHash.ok) {
    return;
  }
  const saltedListRes = createDenyList({
    version: "d7-r2-minor2",
    saltedTermHashes: [phraseHash.value],
    deterministicPatterns: [],
    piiCategoryRules: [],
  });
  expect(saltedListRes.ok).toBe(true);
  if (!saltedListRes.ok) {
    return;
  }

  let saltCheckRedactCalls = 0;
  const { port: countingSaltPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1", {
    redactImpl: async () => {
      saltCheckRedactCalls += 1;
      return {
        ok: false,
        error: {
          code: "POLICY_UNAVAILABLE",
          operation: "propose_capitalisation",
          message: "should not be invoked when termSalt is missing",
          retryable: false,
        },
      };
    },
  });
  const missingSaltRes = await redactWithArmor({
    authorizationPort: countingSaltPort,
    request: {
      source_record: makeBaselineRecord("scope:ws-alpha", "memory.capture.session/v1", "Benign text"),
      target_scope_ref: "scope:ws-beta",
      directive: {
        mode: "field-allowlist",
        allowed_fields: [""],
        allow_derivation_lineage: false,
        max_packet_bytes: 8_192,
      },
      authorization_receipt_digest: engramMemory.receiptDigest("authz-cap", { id: "r2-minor2a" }),
    },
    denyList: saltedListRes.value,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace",
    d33Pseudonymized: true,
  });
  // Kills a mutant that invokes AuthorizationPort.redact before verifying termSalt availability.
  expect(missingSaltRes.ok).toBe(false);
  if (!missingSaltRes.ok) {
    expect(missingSaltRes.error.code).toBe("POLICY_UNAVAILABLE");
  }
  // Kills a mutant that calls AuthorizationPort.redact unnecessarily before refusing missing termSalt.
  expect(saltCheckRedactCalls).toBe(0);

  // Round-2 MINOR 2b: redactWithPiiArmorV1 MUST normalize malformed port error objects instead of spreading raw fields.
  const emptyListRes = createDenyList({
    version: "d7-r2-minor2b",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: ["email"],
  });
  expect(emptyListRes.ok).toBe(true);
  if (!emptyListRes.ok) {
    return;
  }

  const { port: malformedErrPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1", {
    redactImpl: async () =>
      ({
        ok: false,
        error: {
          code: "NOT_A_VALID_CODE",
          operation: "capture",
          message: "",
          retryable: "nope",
          leakedSecret: "raw-credential",
        },
      }) as unknown as Result<RedactionResultV1>,
  });
  const malformedErrRes = await redactWithArmor({
    authorizationPort: malformedErrPort,
    request: {
      source_record: makeBaselineRecord("scope:ws-alpha", "memory.capture.session/v1", "Benign text"),
      target_scope_ref: "scope:ws-beta",
      directive: {
        mode: "field-allowlist",
        allowed_fields: [""],
        allow_derivation_lineage: false,
        max_packet_bytes: 8_192,
      },
      authorization_receipt_digest: engramMemory.receiptDigest("authz-cap", { id: "r2-minor2b" }),
    },
    denyList: emptyListRes.value,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace",
    d33Pseudonymized: true,
  });
  // Kills a mutant that spreads malformed AuthorizationPort.redact error objects verbatim.
  expect(malformedErrRes.ok).toBe(false);
  if (!malformedErrRes.ok) {
    expect(malformedErrRes.error.code).toBe("POLICY_UNAVAILABLE");
    expect(malformedErrRes.error.operation).toBe("propose_capitalisation");
    expect(malformedErrRes.error.retryable).toBe(false);
    expect(Object.hasOwn(malformedErrRes.error as unknown as Record<string, unknown>, "leakedSecret")).toBe(false);
  }

  const { port: extraFieldErrPort } = makeTestAuthorizationPort("scope:ws-alpha", "armor-policy/v1", {
    redactImpl: async () =>
      ({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          operation: "capture",
          message: "redaction denied",
          retryable: false,
          extraInternalField: "internal-stack",
        },
      }) as unknown as Result<RedactionResultV1>,
  });
  const extraFieldErrRes = await redactWithArmor({
    authorizationPort: extraFieldErrPort,
    request: {
      source_record: makeBaselineRecord("scope:ws-alpha", "memory.capture.session/v1", "Benign text"),
      target_scope_ref: "scope:ws-beta",
      directive: {
        mode: "field-allowlist",
        allowed_fields: [""],
        allow_derivation_lineage: false,
        max_packet_bytes: 8_192,
      },
      authorization_receipt_digest: engramMemory.receiptDigest("authz-cap", { id: "r2-minor2c" }),
    },
    denyList: emptyListRes.value,
    policyVersion: "armor-policy/v1",
    boundary: "cross-workspace",
    d33Pseudonymized: true,
  });
  // Kills a mutant that forwards unvalidated extra fields from a failed AuthorizationPort.redact error.
  expect(extraFieldErrRes.ok).toBe(false);
  if (!extraFieldErrRes.ok) {
    expect(extraFieldErrRes.error).toEqual({
      code: "UNAUTHORIZED",
      operation: "propose_capitalisation",
      message: "redaction denied",
      retryable: false,
    });
  }
});
