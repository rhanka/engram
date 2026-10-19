// Tooling stays in the checkout; all subject imports resolve in the installed consumer.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { EXPECTED_TYPES } from "./fixtures/substrate-type-inventory.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const PUBLIC_ENTRY = "@sentropic/engram/memory-substrate";

export function verifyLockedClosure(consumerDir, pinned) {
  const installed = JSON.parse(readFileSync(join(consumerDir, "node_modules/.package-lock.json"), "utf8"));
  for (const [name, actual] of Object.entries(installed.packages)) {
    const expected = pinned.packages[name];
    if (!expected || actual.version !== expected.version || actual.integrity !== expected.integrity) {
      throw new Error(`locked dependency drift: ${name}`);
    }
  }
  for (const [name, expected] of Object.entries(pinned.packages)) {
    if (name && !expected.optional && !installed.packages[name]) throw new Error(`locked dependency missing: ${name}`);
  }
}

export function verifyInstalledTypes(consumerDir) {
  const target = join(consumerDir, "consumer.ts");
  writeFileSync(target, [
    `import * as substrate from ${JSON.stringify(PUBLIC_ENTRY)};`,
    `import type { ${EXPECTED_TYPES.join(", ")} } from ${JSON.stringify(PUBLIC_ENTRY)};`,
    `export function consume(options: ModuleStorageMemoryStoreOptionsV1): Promise<Result<CanonicalMemoryStorePort>> { return substrate.openModuleStorageCanonicalMemoryStoreV1(options); }`,
    `export const engine: typeof substrate.createMemoryPortV2 = substrate.createMemoryPortV2;`,
  ].join("\n"));
  const program = ts.createProgram([target], {
    strict: true, skipLibCheck: false, noEmit: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file, getCurrentDirectory: () => consumerDir, getNewLine: () => "\n",
  }));
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(program.getSourceFile(target).statements[0].moduleSpecifier);
  if (!module) throw new Error("installed public type entry did not resolve");
  const types = [], values = [];
  for (const symbol of checker.getExportsOfModule(module)) {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    (resolved.flags & ts.SymbolFlags.Value ? values : types).push(symbol.name);
  }
  assert.deepEqual(types.sort(), [...EXPECTED_TYPES].sort(), "installed public type inventory");
  assert.deepEqual(values.sort(), ["createMemoryPortV2", "openModuleStorageCanonicalMemoryStoreV1"], "installed public value inventory");
  console.log("installed type inventory: 63 types, 2 values; strict compilation passed");
}

export function verifyInstalledSemantics(consumerDir, repoRoot) {
  const seen = new Set();
  const stage = (source) => {
    if (seen.has(source)) return;
    seen.add(source);
    // Hash/schema/reference-port helpers are test oracles. The two subject
    // values and every dynamic public-entry import use the installed exports.
    const text = readFileSync(source, "utf8").replaceAll('"../src/memory-substrate/index.js"', JSON.stringify(PUBLIC_ENTRY));
    const output = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const target = join(consumerDir, relative(repoRoot, source)).replace(/\.ts$/, ".js");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output);
    const ast = ts.createSourceFile("oracle.js", output, ts.ScriptTarget.ESNext, true);
    const visit = (node) => {
      const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.startsWith(".")) {
        const dependency = resolve(dirname(source), specifier.text).replace(/\.js$/, ".ts");
        if (!dependency.startsWith(`${repoRoot}/`)) throw new Error("corpus oracle escaped repository");
        stage(dependency);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  };
  stage(join(repoRoot, "tests/memory-substrate.test.ts"));
  const config = join(consumerDir, "vitest.config.mjs");
  const vitestDir = dirname(require.resolve("vitest/package.json"));
  writeFileSync(config, `export default { test: { include: ["tests/memory-substrate.test.js"], alias: { vitest: ${JSON.stringify(join(vitestDir, "dist/index.js"))} }, pool: "forks", maxWorkers: 1 } };`);
  try {
    execFileSync(process.execPath, [join(vitestDir, "vitest.mjs"), "run", "--root", consumerDir, "--config", config], { cwd: consumerDir, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    throw new Error(`installed semantic corpus failed\n${error.stdout}\n${error.stderr}`);
  }
  console.log("installed semantic corpus: passed");
}
