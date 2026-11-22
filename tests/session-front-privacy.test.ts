import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

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
  // Kills a mutant that fails to isolate src/llm-mesh.ts onto exactly src/llm-mesh-bridge.ts and src/llm-json-port.ts.
  expect(closure.visited).toEqual([
    "src/llm-json-port.ts",
    "src/llm-mesh-bridge.ts",
    "src/llm-mesh.ts",
  ]);

  const directFromMesh = [...new Set(closure.localEdges.filter((e) => e.from === "src/llm-mesh.ts").map((e) => e.to))].sort();
  // Kills a mutant that imports src/llm-execution.ts from src/llm-mesh.ts or drops the ./llm-json-port.js / ./llm-mesh-bridge.js edges.
  expect(directFromMesh).toEqual([
    "src/llm-json-port.ts",
    "src/llm-mesh-bridge.ts",
  ]);

  const directFromBridge = closure.localEdges.filter((e) => e.from === "src/llm-mesh-bridge.ts").map((e) => e.to).sort();
  // Kills a mutant that keeps ./llm-execution.js in src/llm-mesh-bridge.ts instead of ./llm-json-port.js.
  expect(directFromBridge).toEqual(["src/llm-json-port.ts"]);

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

  const bridgePortImports = collectNamedImports(bridgeSf, "./llm-json-port.js");
  // Kills a mutant that drops or mis-types the ./llm-json-port.js type imports in src/llm-mesh-bridge.ts.
  expect(bridgePortImports).toEqual({
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

  const portPath = "../src/llm-json-port.js";
  const [portMod, meshMod, bridgeMod, execMod] = await Promise.all([
    import(portPath),
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
  const portPath = "../src/llm-json-port.js";
  const { parseJsonFromLlmText } = await import(portPath) as {
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
  const portPath = "../src/llm-json-port.js";
  const { textClientToCallLlm } = await import(portPath) as {
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
