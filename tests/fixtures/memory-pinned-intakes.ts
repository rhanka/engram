/** Offline extraction: only git blobs at the six EVOL intake pins are executed.
 * Admission refusals never enter the corpus. Recall inputs are captured BEFORE
 * filtering, including closed-before, private, and tombstoned stored fixtures.
 * Shape-only producer examples are not stored records. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { posix } from "node:path";
import ts from "typescript";
import { expect, vi } from "vitest";

export const INTAKE_PINS = [
  "343690503748f325cc7673b577321271cb0cbb9f",
  "45b88bddf8a3caa5cfef4a6d572f317c381a8b9d",
  "a9d5ba1c628f518929e47ce2025933bbb4f636ed",
  "686d24c3d8c81d5884667e803f09f5fe7d14901d",
  "1bb7f03d917c3833865d0d66241b67850925a536",
  "70dcfb9663e081651b8309f5338f6274e5bc5f03",
] as const;
export type LegacyNode = Record<string, any>;
export interface PinnedRecord { origin: string; node: LegacyNode; identityCanonical?: string; legacyId: string }
export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
export function pinnedBlob(pin: string, path: string): string {
  return execFileSync("git", ["show", `${pin}:${path}`], { encoding: "utf8", maxBuffer: 8_388_608 });
}

/** Literal graph writes and SQL read-back rows are stored fixtures too. Read
 * their pinned expressions without booting storage modules or a database. */
function storageFixtures(pin: string, files: string[]): Array<{ origin: string; node: LegacyNode }> {
  const records: Array<{ origin: string; node: LegacyNode }> = [];
  for (const path of ["tests/storage-postgres-time-window.test.ts", "tests/memory-trusttier-roundtrip.test.ts"]) {
    if (!files.includes(path)) continue;
    const ast = ts.createSourceFile(path, pinnedBlob(pin, path), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node) && node.properties.some((property) =>
        ts.isPropertyAssignment(property) && property.name.getText() === "node_type"
        && property.initializer.getText() === '"MemoryNote"')) {
        const value = new Function(ts.transpile(`return (${node.getText()});`))();
        if (ts.isCallExpression(node.parent) && node.parent.expression.getText().endsWith(".addNode")) {
          value.id = new Function(`return ${node.parent.arguments[0]!.getText()};`)();
        }
        records.push({ origin: `${pin}:${path}:${node.pos}`, node: value });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const path = "tests/storage-postgres-readback.test.ts";
  if (files.includes(path)) {
    const ast = ts.createSourceFile(path, pinnedBlob(pin, path), ts.ScriptTarget.Latest, true);
    const factory = ast.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "memoryRow");
    if (!factory) throw new Error(`${pin}: missing memoryRow fixture`);
    const evaluate = (call: ts.CallExpression) => new Function(ts.transpile(`${factory.getText()}; return ${call.getText()};`))();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.expression.getText() === "memoryRow") {
        records.push({ origin: `${pin}:${path}:${node.pos}`, node: evaluate(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return records;
}

export async function extractPinnedRecords(pin: string): Promise<PinnedRecord[]> {
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", pin], { encoding: "utf8" }).trim().split("\n");
  const stored = storageFixtures(pin, files);
  if (!files.includes("src/memory-admission.ts")) {
    expect(files.filter((path) => /^src\/memory-/.test(path))).toEqual([]);
    return stored.map(({ origin, node }) => ({ origin, node, legacyId: node.id }));
  }
  const callbacks: Array<{ title: string; path: string; run: () => unknown }> = [];
  const records = new Map<string, PinnedRecord>();
  const cache = new Map<string, any>();
  let origin = "";
  const requireNode = createRequire(import.meta.url);
  const admissionSource = pinnedBlob(pin, "src/memory-admission.ts");
  const admissionAst = ts.createSourceFile("admission.ts", admissionSource, ts.ScriptTarget.Latest, true);
  const identity = admissionAst.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "memoryNoteId");
  if (!identity?.body) throw new Error(`${pin}: missing legacy identity function`);
  const canonicalDeclaration = identity.body.statements.find(ts.isVariableStatement)!.getText();
  const identityCanonical = new Function("note", ts.transpile(`${canonicalDeclaration}; return canonical;`)) as (note: LegacyNode) => string;
  const capture = (node: LegacyNode): void => {
    if (node.node_type !== "MemoryNote" && node.type !== "MemoryNote") return;
    // Full admission notes use that pin's content identity. Graph/SQL-only
    // fixtures predate or bypass admission: keep their actual stored id.
    const canonical = node.event && node.provenance && node.principal_owner ? identityCanonical(node) : undefined;
    const legacyId = canonical === undefined ? node.id : `mem:${sha256(canonical).slice(0, 16)}`;
    const key = `${origin}#${node.id}:${sha256(JSON.stringify(node))}`;
    records.set(key, { origin: key, node: structuredClone(node), identityCanonical: canonical, legacyId });
  };
  const load = (path: string): any => {
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} as any };
    cache.set(path, module.exports);
    let source = pinnedBlob(pin, path);
    if (path === "src/temporal-recall.ts") {
      // Load the actual pinned predicate closure, without initializing unrelated
      // project-config/storage registries (their I/O is outside this fixture).
      const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
      source = ast.statements.filter((node) => ts.isFunctionDeclaration(node)
        && ["hasOwn", "temporalBounds", "overlapsTemporalWindow"].includes(node.name?.text ?? ""))
        .map((node) => node.getText()).join("\n");
    }
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = (name: string): any => {
      if (name === "vitest") return {
        expect, vi,
        describe: (_title: string, run: () => void) => run(),
        it: (title: string, run: () => unknown) => callbacks.push({ title, path, run }),
      };
      if (name.startsWith("node:")) return requireNode(name);
      if (!name.startsWith(".")) throw new Error(`unexpected pinned dependency: ${name}`);
      return load(posix.normalize(posix.join(posix.dirname(path), name)).replace(/\.js$/, ".ts"));
    };
    new Function("require", "exports", "module", compiled)(localRequire, module.exports, module);
    if (path === "src/memory-admission.ts") {
      const admit = module.exports.admitMemoryNote;
      module.exports.admitMemoryNote = (note: LegacyNode, deps: LegacyNode) => admit(note, {
        ...deps,
        appendNode: async (node: LegacyNode) => {
          // Verify the actual pinned gate's id against its independently hashed canonical.
          expect(node.id).toBe(`mem:${sha256(identityCanonical(note)).slice(0, 16)}`);
          capture(node);
          return deps.appendNode(node);
        },
      });
    }
    if (path === "src/memory-recall.ts") {
      const recall = module.exports.recallMemory;
      module.exports.recallMemory = (input: LegacyNode, ...args: unknown[]) => {
        input.nodes.forEach(capture);
        return recall(input, ...args);
      };
    }
    return module.exports;
  };
  for (const path of files.filter((path) => /^tests\/memory-(admission|recall|factory|cli)\.test\.ts$/.test(path))) load(path);
  for (const callback of callbacks) {
    origin = `${pin}:${callback.path}:${callback.title}`;
    await callback.run();
  }
  // The live round-trip's note is a literal in a database-gated test. Extract
  // just that literal and its lexical constants/resolver, never the SQL test.
  const roundtrip = "tests/memory-operational-roundtrip.test.ts";
  if (files.includes(roundtrip)) {
    const source = ts.createSourceFile(roundtrip, pinnedBlob(pin, roundtrip), ts.ScriptTarget.Latest, true);
    const declarations = new Map<string, ts.VariableDeclaration>();
    let resolver: ts.ArrowFunction | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(), node);
      if (ts.isPropertyAssignment(node) && node.name.getText() === "resolveSource" && ts.isArrowFunction(node.initializer)) resolver = node.initializer;
      ts.forEachChild(node, visit);
    };
    visit(source);
    const expression = (name: string) => declarations.get(name)!.initializer!.getText();
    const evaluate = (text: string) => new Function(ts.transpile(`const T = ${expression("T")}; const OWNER = ${expression("OWNER")}; return (${text});`))();
    origin = `${pin}:${roundtrip}:noteInput`;
    const admitted = await load("src/memory-admission.ts").admitMemoryNote(evaluate(expression("noteInput")), {
      resolveSource: evaluate(resolver!.getText()), appendNode: async () => ({ created: true }),
    });
    expect(admitted.admitted).toBe(true);
  }
  for (const fixture of stored) { origin = fixture.origin; capture(fixture.node); }
  return [...records.values()];
}
