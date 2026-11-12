/**
 * Lot L4 — Drizzle AST Data-Model & Query-Builder Extractor (Reduced Scope).
 * Binding: `.appctx/DESIGN-NOTE-L4-SCOPE.md`, `.appctx/DESIGN-NOTE-EXTRACTORS-NO-GUESS.md`, `SPEC_EVOL_APP_CONTEXT_GRAPH.r4` §7.
 *
 * Supported-Construct Table (anything outside this table emits `unsupported-construct` or `unsupported-schema-format` with zero nodes/edges):
 * | Category | Supported AST Construct | Emitted Nodes / Edges | Unsupported (diagnostic, no node/edge) |
 * | --- | --- | --- | --- |
 * | Drizzle table | `pgTable("<name>", { ... }, <cb>?)` (`pgTable` from `drizzle-orm/pg-core`) | `DataEntity` (`postgres`, `public`, `<name>`, `table`) | Dynamic name, non-object cols, unimported/shadowed `pgTable`, `mysqlTable`/`sqliteTable` |
 * | Drizzle schema table | `<sVar>.table("<name>", { ... }, <cb>?)` or `pgSchema("<s>").table(...)` | `DataEntity` (`postgres`, `<s>`, `<name>`, `table`) | Non-literal schema name in `pgSchema(...)`, unresolved schema handle |
 * | Drizzle column | `<prop>: <colBuilder>("<col>"?, <literalOpts>?)` from `drizzle-orm/pg-core` | `DataField` + `has_field` (`drizzle_schema_column`) | Spread `...cols`, computed key `[k]`, helper factory, `customType(...)`, dynamic args/opts |
 * | Column modifiers | `.notNull()`, `.primaryKey()`, `.unique()`, `.default(<lit>)`, `.defaultNow()`, `.defaultRandom()` | Sets `nullable: false`, `isPk: true` on `DataField` | `.$type<T>()`, `.array()`, `.generatedAlwaysAs(...)`, `.$defaultFn(...)`, `.$onUpdate(...)`, `.default(fn())` |
 * | Inline FK | `.references(() => <table>.<prop>, <literalOpts>?)` | `DataField --references--> DataField` (`drizzle_schema_fk`), `isFk: true` | Non-callback/non-member body (`unsupported-construct`); unresolved table/logical prop (`target-unresolved`) |
 * | Table callback | `(t) => [...]` or `(t) => ({ ... })` with `primaryKey`, `foreignKey`, `index("<n>").on(...)`, `uniqueIndex("<n>").on(...)` | Composite PK (`isPk: true, nullable: false`); composite FK (`drizzle_schema_fk`, `isFk: true`) | Spreads, `check(...)`, `unique(...)`, unnamed/dynamic index, mismatched `columns`/`foreignColumns` |
 * | Drizzle `select` | `<db>.select(...).from(<T>)` / `selectDistinct` (+ `.innerJoin`/`.leftJoin`/`.rightJoin`/`.fullJoin(<T>, ...)`) in fn | `CodeSymbol --reads--> DataEntity` (`drizzle_select_ast`) | Non-identifier `<T>`, unresolved/shadowed `<T>`, top-level query outside function, detached `.from(...)` |
 * | Drizzle mutations | `<db>.insert(<T>)`, `<db>.update(<T>)`, `<db>.delete(<T>)` inside a function | `CodeSymbol --writes--> DataEntity` (`drizzle_mutation_ast`) | Non-identifier `<T>`, unresolved/shadowed `<T>`, top-level mutation outside function |
 * | Raw SQL / Prisma / SQL | `sql\`...\`` (`unsupported-construct`); `schema.prisma` (`unsupported-schema-format`); `.sql` (`extractSql` unchanged) | Base `extractSql` only | No SQL DDL/DML `DataEntity`/`DataField`/`reads`/`writes`, no migration replay, no `schema-conflict` |
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, posix, resolve, sep } from "node:path";
import * as TreeSitter from "web-tree-sitter";
import { extractJs, extractSql, type ExtractionResult } from "../extract.js";
import { appContextNodeId } from "./node-id.js";
import type { AppContextCitation, AppContextDataDialect, AppContextDiagnostic, AppContextDiagnosticCandidate, AppContextDiagnosticCode } from "./types.js";

export interface DataModelSourceFile { path: string; language: "sql" | "drizzle" | "prisma" | "ts"; content: string; }
export interface DataModelSymbolRef { id: string; file: string; symbolKind: string; symbolName: string; line: number; endLine?: number; }
export interface DataModelEndpointRef { id: string; method: string; pathTemplate: string; file: string; line: number; endLine?: number; }
export interface DataModelCallRef { caller: string; callee: string; file: string; line: number; endLine?: number; }
export interface DataModelHandleRef { handler: string; endpoint: string; file: string; line: number; endLine?: number; }
export interface ExtractDataModelOptions {
  repoKey: string; commit: string; defaultDialect?: AppContextDataDialect; defaultSchema?: string; maxHops?: number;
  symbols?: DataModelSymbolRef[]; endpoints?: DataModelEndpointRef[]; calls?: DataModelCallRef[]; handles?: DataModelHandleRef[]; rootDir?: string;
}
export type DataModelNodeType = "DataEntity" | "DataField" | "CodeSymbol" | "ApiEndpoint";
export interface DataModelNode {
  id: string; node_type: DataModelNodeType; dialect?: AppContextDataDialect; schema?: string; name?: string;
  entityName?: string; entityKind?: "table" | "view"; dbType?: string; nullable?: boolean | "unresolved";
  isPk?: boolean; isFk?: boolean; file?: string; symbolKind?: string; symbolName?: string; method?: string; pathTemplate?: string;
  source_file: string; line_start: number; line_end: number; citations: AppContextCitation[]; evidence_refs: string[];
}
export type DataModelRelation = "has_field" | "references" | "reads" | "writes";
export interface DataModelEdge { source: string; target: string; relation: DataModelRelation; derivation_method: string; evidence_refs: string[]; citations: AppContextCitation[]; }
export type DataModelDiagnosticCode = AppContextDiagnosticCode | "unsupported-construct" | "unsupported-schema-format";
export interface DataModelDiagnostic extends Omit<AppContextDiagnostic, "code"> { code: DataModelDiagnosticCode; startLine?: number; endLine?: number; }
export interface ExtractDataModelResult { nodes: DataModelNode[]; edges: DataModelEdge[]; diagnostics: DataModelDiagnostic[]; }
export interface DataModelInputFile { absPath: string; repoRelPath: string; language: "sql" | "drizzle" | "prisma" | "ts"; }
export interface DataModelFilesResult { base: ExtractionResult[]; model: ExtractDataModelResult; }

type TsParser = InstanceType<typeof TreeSitter.Parser>;
type TsNode = TreeSitter.Node;

let tsParser: TsParser | null = null;
let tsLanguage: TreeSitter.Language | null = null;
let tsReady: Promise<void> | null = null;

export async function ensureDataModelTsReady(): Promise<void> {
  if (tsParser !== null && tsLanguage !== null) return;
  if (tsReady === null) {
    tsReady = (async () => {
      try {
        const req = createRequire(import.meta.url);
        const wasmPath = ["tree-sitter-typescript/tree-sitter-typescript.wasm", "tree-sitter-typescript/tree_sitter_typescript.wasm"]
          .map((c) => { try { return req.resolve(c); } catch { return ""; } }).find(Boolean);
        if (!wasmPath) throw new Error("tree-sitter-typescript WASM not found");
        const ParserCtor = ((TreeSitter as unknown as { Parser?: typeof TreeSitter.Parser }).Parser ??
          (TreeSitter as unknown as { default?: typeof TreeSitter.Parser }).default)!;
        await ParserCtor.init();
        tsLanguage = await TreeSitter.Language.load(wasmPath);
        const parser = new ParserCtor(); parser.setLanguage(tsLanguage); tsParser = parser;
      } catch (err) { tsReady = null; throw err; }
    })();
  }
  await tsReady;
}

// Buffer-based UTF-8 Source Slicing & Literal Decoding (Note 6, R2-M1, R2-M10, R3-M3)
interface TsSourceBuffer { text: string; buffer: Buffer; byteOffsets: Uint32Array; }
function createTsSourceBuffer(text: string): TsSourceBuffer {
  const buffer = Buffer.from(text, "utf-8"), byteOffsets = new Uint32Array(text.length + 1);
  let bytePos = 0;
  for (let i = 0; i < text.length; i++) {
    byteOffsets[i] = bytePos;
    const code = text.charCodeAt(i);
    if (code < 0x80) bytePos += 1;
    else if (code < 0x800) bytePos += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      byteOffsets[i + 1] = bytePos + 2; bytePos += 4; i += 1;
    } else bytePos += 3;
  }
  byteOffsets[text.length] = bytePos;
  return { text, buffer, byteOffsets };
}

const semanticChildren = (node: TsNode | null | undefined): TsNode[] => node ? node.namedChildren.filter((c) => c.type !== "comment") : [];
const nodeText = (src: TsSourceBuffer, node: TsNode): string =>
  src.buffer.subarray(src.byteOffsets[node.startIndex] ?? 0, src.byteOffsets[node.endIndex] ?? src.buffer.length).toString("utf-8");
const nodeSpan = (node: TsNode) => ({ startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
const makeCitation = (file: string, lineStart: number, lineEnd: number, commit: string): AppContextCitation =>
  ({ citation_kind: "file", source_file: file, line_start: lineStart, line_end: lineEnd, commit });
const evidenceKey = (file: string, lineStart: number, lineEnd: number): string => `${file}#L${lineStart}-L${lineEnd}`;

function sortAndDedupeCitations(cites: AppContextCitation[]): AppContextCitation[] {
  const seen = new Set<string>(), unique: AppContextCitation[] = [];
  for (const cite of cites) {
    const key = `${cite.source_file}\0${cite.line_start}\0${cite.line_end}\0${cite.commit}`;
    if (!seen.has(key)) { seen.add(key); unique.push(cite); }
  }
  return unique.sort((a, b) =>
    a.source_file !== b.source_file ? (a.source_file < b.source_file ? -1 : 1) : a.line_start !== b.line_start ? a.line_start - b.line_start
    : a.line_end !== b.line_end ? a.line_end - b.line_end : a.commit < b.commit ? -1 : a.commit > b.commit ? 1 : 0);
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "\\": "\\", "'": "'", '"': '"', "/": "/" };

function readStaticStringLiteral(src: TsSourceBuffer, node: TsNode | null | undefined): string | null {
  let target = node ?? null;
  while (target && (target.type === "parenthesized_expression" || target.type === "as_expression")) target = semanticChildren(target)[0] ?? null;
  if (!target || target.type !== "string") return null;
  const raw = nodeText(src, target), q = raw[0];
  if (raw.length < 2 || (q !== '"' && q !== "'") || raw[raw.length - 1] !== q) return null;
  const body = raw.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== "\\") { out += ch; continue; }
    if (++i >= body.length) return null;
    const esc = body[i]!;
    if (esc in SIMPLE_ESCAPES) out += SIMPLE_ESCAPES[esc];
    else if (esc === "0") { if (i + 1 < body.length && /[0-9]/.test(body[i + 1]!)) return null; out += "\0"; }
    else if (esc === "\n") { /* line continuation */ }
    else if (esc === "\r") { if (body[i + 1] === "\n") i += 1; }
    else if (esc === "x" || (esc === "u" && body[i + 1] !== "{")) {
      const len = esc === "x" ? 2 : 4, hex = body.slice(i + 1, i + 1 + len);
      if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) return null;
      out += String.fromCharCode(Number.parseInt(hex, 16)); i += len;
    } else if (esc === "u" && body[i + 1] === "{") {
      const closeIdx = body.indexOf("}", i + 2), hex = closeIdx === -1 ? "" : body.slice(i + 2, closeIdx);
      const cp = /^[0-9a-fA-F]{1,6}$/.test(hex) ? Number.parseInt(hex, 16) : 0x110000;
      if (cp > 0x10ffff) return null;
      out += String.fromCodePoint(cp); i = closeIdx;
    } else return null;
  }
  return out;
}

const isStaticPrimitiveLiteral = (src: TsSourceBuffer, node: TsNode | null | undefined): boolean =>
  Boolean(node && (readStaticStringLiteral(src, node) !== null || node.type === "number" || node.type === "true" ||
    node.type === "false" || node.type === "null" || (node.type === "unary_expression" && nodeText(src, node).startsWith("-") && semanticChildren(node)[0]?.type === "number")));

// Drizzle pg-core Builders & Canonical Type Formatting (R2-B1, R2-M8)
const DRIZZLE_PG_BUILDERS: Readonly<Record<string, string>> = {
  uuid: "UUID", text: "TEXT", integer: "INTEGER", int: "INTEGER", serial: "SERIAL", smallserial: "SMALLSERIAL", bigserial: "BIGSERIAL",
  bigint: "BIGINT", smallint: "SMALLINT", boolean: "BOOLEAN", timestamp: "TIMESTAMP", date: "DATE", time: "TIME", interval: "INTERVAL",
  varchar: "VARCHAR", char: "CHAR", numeric: "NUMERIC", decimal: "NUMERIC", real: "REAL", doublePrecision: "DOUBLE PRECISION",
  json: "JSON", jsonb: "JSONB", bytea: "BYTEA", inet: "INET", cidr: "CIDR", macaddr: "MACADDR",
};
const SERIAL_BUILDERS = new Set(["serial", "smallserial", "bigserial"]);
const isDrizzlePgCoreModule = (m: string) => m === "drizzle-orm/pg-core" || m.startsWith("drizzle-orm/pg-core/") || m === "drizzle-orm";
const isUnsupportedDrizzleDialectModule = (m: string) =>
  m === "drizzle-orm/mysql-core" || m.startsWith("drizzle-orm/mysql-core/") || m === "drizzle-orm/sqlite-core" || m.startsWith("drizzle-orm/sqlite-core/");

function formatColumnTypeWithOptions(baseType: string, optsNode: TsNode | null, src: TsSourceBuffer): string | null {
  if (!optsNode) return baseType;
  const pairs = readObjectPairMap(optsNode, src);
  if (!pairs) return null;
  let lengthVal: number | null = null, precisionVal: number | null = null, scaleVal: number | null = null, withTimezone = false;
  for (const [key, valNode] of pairs) {
    if (key === "length" || key === "precision" || key === "scale") {
      const num = valNode.type === "number" ? Number(nodeText(src, valNode)) : -1;
      if (!Number.isInteger(num) || num < 0) return null;
      if (key === "length") lengthVal = num; else if (key === "precision") precisionVal = num; else scaleVal = num;
    } else if (key === "withTimezone" && (valNode.type === "true" || valNode.type === "false")) withTimezone = valNode.type === "true";
    else if (key === "mode" && readStaticStringLiteral(src, valNode) !== null) continue;
    else if (key === "enum" && valNode.type === "array" && semanticChildren(valNode).every((el) => readStaticStringLiteral(src, el) !== null)) continue;
    else return null;
  }
  if (baseType === "VARCHAR" || baseType === "CHAR") return lengthVal !== null ? `${baseType}(${lengthVal})` : baseType;
  if (baseType === "TIMESTAMP" || baseType === "TIME") {
    const tzBase = withTimezone ? (baseType === "TIMESTAMP" ? "TIMESTAMPTZ" : "TIMETZ") : baseType;
    return precisionVal !== null ? `${tzBase}(${precisionVal})` : tzBase;
  }
  if (baseType === "NUMERIC") return precisionVal !== null && scaleVal !== null ? `NUMERIC(${precisionVal},${scaleVal})` : precisionVal !== null ? `NUMERIC(${precisionVal})` : "NUMERIC";
  return baseType;
}

// Lexical Scope & Import Binding Tree (Note 4, R2-B1, R2-M2, R3-B1, R3-B3)
interface ImportBindingInfo { sourceModule: string; importedKind: "named" | "namespace" | "default"; importedName: string; }
interface Binding { id: string; name: string; file: string; scope: LexicalScope; kind: "import" | "var" | "param" | "function"; declNode: TsNode; initNode: TsNode | null; importInfo?: ImportBindingInfo; reassigned?: boolean; }
interface LexicalScope { id: number; node: TsNode; parent: LexicalScope | null; bindings: Map<string, Binding>; }
interface FunctionDeclRecord { symbolId: string; symbolName: string; symbolKind: string; file: string; fnNode: TsNode; startLine: number; endLine: number; binding: Binding | null; }
interface FileAstContext {
  file: string; src: TsSourceBuffer; root: TsNode; moduleScope: LexicalScope;
  scopeByNodeId: Map<number, LexicalScope>; bindingByInitNodeId: Map<number, Binding>;
  exports: Map<string, Binding>; reExports: Array<{ sourceModule: string; exportedName: string; importedName: string }>;
  starReExports: string[]; functions: FunctionDeclRecord[];
}

const SCOPE_NODE_TYPES = new Set(["program", "function_declaration", "generator_function_declaration", "function", "function_expression", "arrow_function", "method_definition", "statement_block", "for_statement", "for_in_statement", "catch_clause"]);
const FUNCTION_BOUNDARY_TYPES = new Set(["function_declaration", "generator_function_declaration", "function", "function_expression", "arrow_function", "method_definition"]);

function nearestVarScope(scope: LexicalScope): LexicalScope {
  let cur = scope;
  while (cur.parent && !FUNCTION_BOUNDARY_TYPES.has(cur.node.type) && cur.node.type !== "program") cur = cur.parent;
  return cur;
}

function collectBindingIdentifiers(patternNode: TsNode | null | undefined, src: TsSourceBuffer, out: Array<{ name: string; node: TsNode }>): void {
  if (!patternNode || patternNode.type === "type_annotation") return;
  if (patternNode.type === "identifier" || patternNode.type === "shorthand_property_identifier_pattern" || patternNode.type === "shorthand_property_identifier") { out.push({ name: nodeText(src, patternNode), node: patternNode }); return; }
  if (patternNode.type === "pair_pattern" || patternNode.type === "pair") { collectBindingIdentifiers(patternNode.childForFieldName("value"), src, out); return; }
  if (patternNode.type === "assignment_pattern" || patternNode.type === "object_assignment_pattern") { collectBindingIdentifiers(patternNode.childForFieldName("left"), src, out); return; }
  if (patternNode.type === "required_parameter" || patternNode.type === "optional_parameter") { collectBindingIdentifiers(patternNode.childForFieldName("pattern") ?? semanticChildren(patternNode)[0], src, out); return; }
  for (const child of semanticChildren(patternNode)) collectBindingIdentifiers(child, src, out);
}

function buildFileAstContext(file: string, src: TsSourceBuffer, root: TsNode, repoKey: string, knownSymbolsByFile: Map<string, DataModelSymbolRef[]>): FileAstContext {
  let nextScopeId = 1;
  const scopeByNodeId = new Map<number, LexicalScope>(), bindingByInitNodeId = new Map<number, Binding>(), exports = new Map<string, Binding>();
  const moduleScope: LexicalScope = { id: nextScopeId++, node: root, parent: null, bindings: new Map() };
  scopeByNodeId.set(root.id, moduleScope);
  const reExports: Array<{ sourceModule: string; exportedName: string; importedName: string }> = [], starReExports: string[] = [];
  const rawFunctions: Array<{ fnNode: TsNode; symbolName: string; kind: "function" | "method"; startLine: number; endLine: number; binding: Binding | null }> = [];
  const fileSyms = knownSymbolsByFile.get(file) ?? [];

  const makeBinding = (scope: LexicalScope, name: string, kind: Binding["kind"], declNode: TsNode, initNode: TsNode | null = null, importInfo?: ImportBindingInfo, reassigned = false): Binding => {
    const existing = scope.bindings.get(name);
    if (existing) {
      if (existing.initNode) bindingByInitNodeId.delete(existing.initNode.id);
      existing.initNode = null; existing.reassigned = true; return existing;
    }
    const b: Binding = { id: `${file}#${scope.id}:${name}@${declNode.startIndex}`, name, file, scope, kind, declNode, initNode: reassigned ? null : initNode, importInfo, reassigned };
    scope.bindings.set(name, b);
    if (initNode && !reassigned) bindingByInitNodeId.set(initNode.id, b);
    return b;
  };

  for (const stmt of semanticChildren(root)) {
    const sourceModule = stmt.type === "import_statement" ? readStaticStringLiteral(src, stmt.childForFieldName("source")) : null;
    const clause = sourceModule ? semanticChildren(stmt).find((c) => c.type === "import_clause") : null;
    for (const cc of semanticChildren(clause)) {
      if (cc.type === "identifier") makeBinding(moduleScope, nodeText(src, cc), "import", cc, null, { sourceModule: sourceModule!, importedKind: "default", importedName: "default" });
      else if (cc.type === "namespace_import") {
        const idNode = semanticChildren(cc).find((c) => c.type === "identifier");
        if (idNode) makeBinding(moduleScope, nodeText(src, idNode), "import", idNode, null, { sourceModule: sourceModule!, importedKind: "namespace", importedName: "*" });
      } else if (cc.type === "named_imports") {
        for (const spec of semanticChildren(cc)) {
          const nameNode = spec.type === "import_specifier" ? spec.childForFieldName("name") : null, aliasNode = spec.childForFieldName("alias");
          if (nameNode) makeBinding(moduleScope, aliasNode ? nodeText(src, aliasNode) : nodeText(src, nameNode), "import", spec, null, { sourceModule: sourceModule!, importedKind: "named", importedName: nodeText(src, nameNode) });
        }
      }
    }
  }

  function walkScope(node: TsNode, currentScope: LexicalScope, isExported = false): void {
    let activeScope = currentScope;
    if (node.id !== root.id && SCOPE_NODE_TYPES.has(node.type)) {
      activeScope = { id: nextScopeId++, node, parent: currentScope, bindings: new Map() };
      scopeByNodeId.set(node.id, activeScope);
      const paramIds: Array<{ name: string; node: TsNode }> = [];
      collectBindingIdentifiers(node.childForFieldName("parameters") ?? node.childForFieldName("parameter"), src, paramIds);
      for (const p of paramIds) makeBinding(activeScope, p.name, "param", p.node);
    }
    if (node.type === "function_declaration" || node.type === "generator_function_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const fnName = nodeText(src, nameNode), fnBinding = makeBinding(currentScope, fnName, "function", node, node);
        if (isExported && currentScope === moduleScope) exports.set(fnName, fnBinding);
        if (currentScope === moduleScope) { const { startLine, endLine } = nodeSpan(node); rawFunctions.push({ fnNode: node, symbolName: fnName, kind: "function", startLine, endLine, binding: fnBinding }); }
      }
    } else if (node.type === "method_definition" && node.childForFieldName("name")) {
      const { startLine, endLine } = nodeSpan(node);
      rawFunctions.push({ fnNode: node, symbolName: nodeText(src, node.childForFieldName("name")!), kind: "method", startLine, endLine, binding: null });
    } else if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
      const targetScope = node.type === "variable_declaration" ? nearestVarScope(currentScope) : currentScope;
      for (const decl of semanticChildren(node)) {
        const nameNode = decl.type === "variable_declarator" ? decl.childForFieldName("name") : null, valNode = decl.childForFieldName("value") ?? null;
        if (nameNode?.type === "identifier") {
          const varName = nodeText(src, nameNode), varBinding = makeBinding(targetScope, varName, "var", decl, valNode);
          if (isExported && targetScope === moduleScope) exports.set(varName, varBinding);
          if (targetScope === moduleScope && valNode && (valNode.type === "arrow_function" || valNode.type === "function" || valNode.type === "function_expression")) {
            const { startLine, endLine } = nodeSpan(valNode);
            rawFunctions.push({ fnNode: valNode, symbolName: varName, kind: "function", startLine, endLine, binding: varBinding });
          }
        } else if (nameNode) {
          const patIds: Array<{ name: string; node: TsNode }> = [];
          collectBindingIdentifiers(nameNode, src, patIds);
          for (const p of patIds) { const b = makeBinding(targetScope, p.name, "var", p.node, null, undefined, true); if (isExported && targetScope === moduleScope) exports.set(p.name, b); }
        }
      }
    } else if (node.type === "export_statement" && currentScope === moduleScope) {
      const sourceModule = readStaticStringLiteral(src, node.childForFieldName("source"));
      if (sourceModule) {
        const clause = semanticChildren(node).find((c) => c.type === "export_clause");
        if (!clause) { starReExports.push(sourceModule); return; }
        for (const spec of semanticChildren(clause)) {
          const nameNode = spec.type === "export_specifier" ? spec.childForFieldName("name") : null, aliasNode = spec.childForFieldName("alias");
          if (nameNode) reExports.push({ sourceModule, exportedName: aliasNode ? nodeText(src, aliasNode) : nodeText(src, nameNode), importedName: nodeText(src, nameNode) });
        }
        return;
      }
      for (const child of semanticChildren(node)) {
        if (child.type === "export_clause") {
          for (const spec of semanticChildren(child)) {
            const nameNode = spec.type === "export_specifier" ? spec.childForFieldName("name") : null, b = nameNode ? moduleScope.bindings.get(nodeText(src, nameNode)) : undefined;
            if (b) exports.set(spec.childForFieldName("alias") ? nodeText(src, spec.childForFieldName("alias")!) : b.name, b);
          }
        } else walkScope(child, currentScope, true);
      }
      return;
    }
    for (const child of semanticChildren(node)) walkScope(child, activeScope, false);
  }

  walkScope(root, moduleScope, false);
  const ctx: FileAstContext = { file, src, root, moduleScope, scopeByNodeId, bindingByInitNodeId, exports, reExports, starReExports, functions: [] };

  const invalidateTarget = (targetNode: TsNode | null | undefined): void => {
    const ids: Array<{ name: string; node: TsNode }> = [];
    collectBindingIdentifiers(targetNode, src, ids);
    for (const id of ids) {
      const b = resolveIdentifierInScope(id.name, id.node, ctx);
      if (b) { if (b.initNode) bindingByInitNodeId.delete(b.initNode.id); b.initNode = null; b.reassigned = true; }
    }
  };
  const walkAssignments = (node: TsNode): void => {
    if (node.type === "assignment_expression" || node.type === "augmented_assignment_expression") invalidateTarget(node.childForFieldName("left"));
    else if (node.type === "update_expression") invalidateTarget(node.childForFieldName("argument"));
    for (const child of semanticChildren(node)) walkAssignments(child);
  };
  walkAssignments(root);

  const fnCountByName = new Map<string, number>();
  for (const rf of rawFunctions) if (rf.kind === "function" && !rf.binding?.reassigned) fnCountByName.set(rf.symbolName, (fnCountByName.get(rf.symbolName) ?? 0) + 1);

  for (const rf of rawFunctions) {
    if (rf.binding?.reassigned) continue;
    if (rf.kind === "method") {
      const exact = fileSyms.filter((s) => s.symbolName === rf.symbolName && s.line === rf.startLine && (s.symbolKind === "method" || s.endLine === rf.endLine));
      if (exact.length === 1) ctx.functions.push({ symbolId: exact[0]!.id, symbolName: rf.symbolName, symbolKind: exact[0]!.symbolKind, file, fnNode: rf.fnNode, startLine: rf.startLine, endLine: rf.endLine, binding: null });
    } else if ((fnCountByName.get(rf.symbolName) ?? 0) === 1) {
      const symMatches = fileSyms.filter((s) => s.symbolName === rf.symbolName && s.symbolKind === "function"), exactLine = symMatches.filter((s) => s.line === rf.startLine);
      const chosen = exactLine.length === 1 ? exactLine[0] : symMatches.length === 1 ? symMatches[0] : undefined;
      if (symMatches.length <= 1 || chosen) {
        const symbolId = chosen?.id ?? appContextNodeId(repoKey, "CodeSymbol", [file, "function", rf.symbolName]);
        ctx.functions.push({ symbolId, symbolName: rf.symbolName, symbolKind: "function", file, fnNode: rf.fnNode, startLine: rf.startLine, endLine: rf.endLine, binding: rf.binding });
      }
    }
  }
  return ctx;
}

function resolveIdentifierInScope(identName: string, atNode: TsNode, fileCtx: FileAstContext): Binding | null {
  let cur: TsNode | null = atNode, scope: LexicalScope | null = null;
  while (cur && !scope) { scope = fileCtx.scopeByNodeId.get(cur.id) ?? null; cur = cur.parent; }
  for (let s: LexicalScope | null = scope ?? fileCtx.moduleScope; s; s = s.parent) if (s.bindings.has(identName)) return s.bindings.get(identName)!;
  return null;
}

function resolveRelativeFile(fromFile: string, specifier: string, fileCtxByPath: Map<string, FileAstContext>): FileAstContext | null {
  if (!specifier.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromFile.replace(/\\/g, "/")), specifier)), stripped = base.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, "");
  for (const c of [base, stripped, `${stripped}.ts`, `${stripped}.tsx`, `${stripped}.js`, `${stripped}.jsx`, `${stripped}/index.ts`, `${stripped}/index.js`]) {
    if (fileCtxByPath.has(c)) return fileCtxByPath.get(c)!;
  }
  return null;
}

function dedupeBindings(bindings: Binding[]): Binding[] {
  const byId = new Map<string, Binding>();
  for (const b of bindings) if (!byId.has(b.id)) byId.set(b.id, b);
  return [...byId.values()];
}

function resolveExportedBindings(targetFile: FileAstContext, exportedName: string, fileCtxByPath: Map<string, FileAstContext>, visited = new Set<string>()): Binding[] {
  const key = `${targetFile.file}::${exportedName}`;
  if (visited.has(key)) return [];
  visited.add(key);
  if (targetFile.exports.has(exportedName)) return resolveCanonicalBindings(targetFile.exports.get(exportedName)!, fileCtxByPath, visited);
  const directMatches: Binding[] = [];
  for (const re of targetFile.reExports) {
    const next = re.exportedName === exportedName ? resolveRelativeFile(targetFile.file, re.sourceModule, fileCtxByPath) : null;
    if (next) directMatches.push(...resolveExportedBindings(next, re.importedName, fileCtxByPath, new Set(visited)));
  }
  if (directMatches.length > 0) return dedupeBindings(directMatches);
  const starMatches: Binding[] = [];
  for (const starMod of targetFile.starReExports) {
    const next = resolveRelativeFile(targetFile.file, starMod, fileCtxByPath);
    if (next) starMatches.push(...resolveExportedBindings(next, exportedName, fileCtxByPath, new Set(visited)));
  }
  return dedupeBindings(starMatches);
}

function resolveCanonicalBindings(binding: Binding | null, fileCtxByPath: Map<string, FileAstContext>, visited = new Set<string>()): Binding[] {
  if (!binding) return [];
  if (visited.has(binding.id)) return [binding];
  visited.add(binding.id);
  if (binding.kind === "import" && binding.importInfo?.sourceModule.startsWith(".")) {
    const fromFileCtx = fileCtxByPath.get(binding.file), targetFile = fromFileCtx ? resolveRelativeFile(fromFileCtx.file, binding.importInfo.sourceModule, fileCtxByPath) : null;
    if (!targetFile) return [binding];
    if (binding.importInfo.importedKind === "named") return resolveExportedBindings(targetFile, binding.importInfo.importedName, fileCtxByPath, visited);
    if (binding.importInfo.importedKind === "default") return resolveExportedBindings(targetFile, "default", fileCtxByPath, visited);
  }
  return [binding];
}

function resolveCanonicalBinding(binding: Binding | null, fileCtxByPath: Map<string, FileAstContext>): Binding | null {
  const cands = resolveCanonicalBindings(binding, fileCtxByPath);
  return cands.length === 1 && !cands[0]!.reassigned ? cands[0]! : null;
}

// Drizzle Symbol Resolution & Call Chain Helpers
function resolveDrizzleImport(expr: TsNode | null | undefined, fileCtx: FileAstContext, fileCtxByPath: Map<string, FileAstContext>): { sourceModule: string; importedName: string } | null {
  if (!expr) return null;
  if (expr.type === "identifier") {
    const canonical = resolveCanonicalBinding(resolveIdentifierInScope(nodeText(fileCtx.src, expr), expr, fileCtx), fileCtxByPath);
    return canonical?.kind === "import" && canonical.importInfo?.importedKind === "named" ? { sourceModule: canonical.importInfo.sourceModule, importedName: canonical.importInfo.importedName } : null;
  }
  if (expr.type === "member_expression") {
    const obj = expr.childForFieldName("object"), prop = expr.childForFieldName("property");
    const canonical = obj?.type === "identifier" && prop ? resolveCanonicalBinding(resolveIdentifierInScope(nodeText(fileCtx.src, obj), obj, fileCtx), fileCtxByPath) : null;
    if (canonical?.kind === "import" && canonical.importInfo && (canonical.importInfo.importedKind === "namespace" || canonical.importInfo.importedKind === "default")) {
      return { sourceModule: canonical.importInfo.sourceModule, importedName: nodeText(fileCtx.src, prop!) };
    }
  }
  return null;
}

const resolveDrizzlePgCoreSymbol = (expr: TsNode | null | undefined, fileCtx: FileAstContext, fileCtxByPath: Map<string, FileAstContext>): string | null => {
  const imp = resolveDrizzleImport(expr, fileCtx, fileCtxByPath);
  return imp && isDrizzlePgCoreModule(imp.sourceModule) ? imp.importedName : null;
};
const isUnsupportedDrizzleTableConstructor = (expr: TsNode | null | undefined, fileCtx: FileAstContext, fileCtxByPath: Map<string, FileAstContext>): boolean => {
  const imp = resolveDrizzleImport(expr, fileCtx, fileCtxByPath);
  return Boolean(imp && isUnsupportedDrizzleDialectModule(imp.sourceModule) && (imp.importedName === "mysqlTable" || imp.importedName === "mysqlSchema" || imp.importedName === "sqliteTable"));
};
const isDrizzleSqlTag = (expr: TsNode | null | undefined, fileCtx: FileAstContext, fileCtxByPath: Map<string, FileAstContext>): boolean => {
  const imp = resolveDrizzleImport(expr, fileCtx, fileCtxByPath);
  return Boolean(imp && imp.importedName === "sql" && (imp.sourceModule === "drizzle-orm" || imp.sourceModule.startsWith("drizzle-orm/")));
};
const getCallArguments = (callNode: TsNode): TsNode[] => semanticChildren(callNode.childForFieldName("arguments"));

interface ChainedCallStep { methodName: string; args: TsNode[]; callNode: TsNode; }
interface UnwrappedCallChain { rootCall: TsNode; rootCallee: TsNode; rootArgs: TsNode[]; steps: ChainedCallStep[]; }
function unwrapCallChain(expr: TsNode, src: TsSourceBuffer): UnwrappedCallChain | null {
  const steps: ChainedCallStep[] = [];
  for (let cur: TsNode = expr; cur.type === "call_expression"; ) {
    const fn = cur.childForFieldName("function"), obj = fn?.type === "member_expression" ? fn.childForFieldName("object") : null, prop = fn?.type === "member_expression" ? fn.childForFieldName("property") : null;
    if (!fn) return null;
    if (obj?.type === "call_expression" && prop) { steps.unshift({ methodName: nodeText(src, prop), args: getCallArguments(cur), callNode: cur }); cur = obj; continue; }
    return { rootCall: cur, rootCallee: fn, rootArgs: getCallArguments(cur), steps };
  }
  return null;
}

function getOutermostChainedCall(callNode: TsNode): TsNode {
  let cur: TsNode = callNode;
  while (cur.parent?.type === "member_expression" && cur.parent.childForFieldName("object")?.id === cur.id && cur.parent.parent?.type === "call_expression") cur = cur.parent.parent;
  return cur;
}

function readObjectPairMap(node: TsNode, src: TsSourceBuffer): Map<string, TsNode> | null {
  if (node.type !== "object") return null;
  const map = new Map<string, TsNode>();
  for (const child of semanticChildren(node)) {
    const keyNode = child.type === "pair" ? child.childForFieldName("key") : null, valNode = child.type === "pair" ? child.childForFieldName("value") : null;
    const key = keyNode?.type === "property_identifier" ? nodeText(src, keyNode) : readStaticStringLiteral(src, keyNode);
    if (!key || !valNode) return null;
    map.set(key, valNode);
  }
  return map;
}

function unwrapSingleReturnExpression(bodyNode: TsNode): TsNode | null {
  let cur: TsNode = bodyNode;
  while (cur.type === "parenthesized_expression") { const ch = semanticChildren(cur); if (!ch[0]) return null; cur = ch[0]; }
  const stmts = cur.type === "statement_block" ? semanticChildren(cur) : null;
  if (!stmts) return cur;
  const retExpr = stmts.length === 1 && stmts[0]!.type === "return_statement" ? semanticChildren(stmts[0]!)[0] : undefined;
  return retExpr ? unwrapSingleReturnExpression(retExpr) : null;
}

function extractInlineFkMemberTarget(cbNode: TsNode | null | undefined, optsNode: TsNode | null | undefined, src: TsSourceBuffer): TsNode | null {
  if (!cbNode || (cbNode.type !== "arrow_function" && cbNode.type !== "function_expression" && cbNode.type !== "function")) return null;
  const body = cbNode.childForFieldName("body"), retExpr = body ? unwrapSingleReturnExpression(body) : null;
  if (!retExpr || retExpr.childForFieldName("object")?.type !== "identifier" || retExpr.childForFieldName("property")?.type !== "property_identifier") return null;
  if (optsNode) {
    const pairMap = readObjectPairMap(optsNode, src);
    if (!pairMap || ![...pairMap.values()].every((v) => readStaticStringLiteral(src, v) !== null)) return null;
  }
  return retExpr;
}

// Core Extractor (`extractDataModel`)
interface DeferredInlineFk { fileCtx: FileAstContext; sourceField: DataModelNode; memberExpr: TsNode; callNode: TsNode; }
interface TableRecord { fileCtx: FileAstContext; entityNode: DataModelNode; binding: Binding | null; propToField: Map<string, DataModelNode>; callbackNode: TsNode | null; }

export function extractDataModel(sources: DataModelSourceFile[], options: ExtractDataModelOptions): ExtractDataModelResult {
  const { repoKey, commit } = options;
  const dialect: AppContextDataDialect = "postgres", defaultSchema = options.defaultSchema ?? "public";
  const nodesById = new Map<string, DataModelNode>(), edgesByKey = new Map<string, DataModelEdge>(), diagnosticsById = new Map<string, DataModelDiagnostic>();

  function upsertNode(node: DataModelNode): DataModelNode {
    const existing = nodesById.get(node.id);
    const merged = sortAndDedupeCitations(existing ? [...existing.citations, ...node.citations] : node.citations);
    const refs = merged.map((c) => evidenceKey(c.source_file, c.line_start, c.line_end));
    if (!existing) { const copy: DataModelNode = { ...node, citations: merged, evidence_refs: refs }; nodesById.set(copy.id, copy); return copy; }
    existing.citations = merged; existing.evidence_refs = refs;
    if (node.isPk) { existing.isPk = true; existing.nullable = false; }
    if (node.isFk) existing.isFk = true;
    return existing;
  }
  function appendNodeCitation(node: DataModelNode, cite: AppContextCitation): void {
    node.citations = sortAndDedupeCitations([...node.citations, cite]);
    node.evidence_refs = node.citations.map((c) => evidenceKey(c.source_file, c.line_start, c.line_end));
  }
  function addEdge(source: string, target: string, relation: DataModelRelation, derivationMethod: string, cites: AppContextCitation[]): void {
    const key = `${source}\0${target}\0${relation}\0${derivationMethod}`, existing = edgesByKey.get(key);
    const merged = sortAndDedupeCitations(existing ? [...existing.citations, ...cites] : cites);
    edgesByKey.set(key, { source, target, relation, derivation_method: derivationMethod, citations: merged, evidence_refs: merged.map((c) => evidenceKey(c.source_file, c.line_start, c.line_end)) });
  }
  function addDiagnostic(code: DataModelDiagnosticCode, message: string, file: string, startLine: number, endLine = startLine, detail: string | ReadonlyArray<string> = [], candidates?: AppContextDiagnosticCandidate[]): void {
    const parts = typeof detail === "string" ? [detail || message] : detail.length > 0 ? [...detail] : [message];
    const id = appContextNodeId(repoKey, "Diagnostic", [code, file, String(startLine), String(endLine), ...parts]);
    if (!diagnosticsById.has(id)) diagnosticsById.set(id, { id, code, message, file, line: startLine, startLine, endLine, ...(candidates?.length ? { candidates } : {}) });
  }

  const knownSymbolsById = new Map<string, DataModelNode>(), knownSymbolsByFile = new Map<string, DataModelSymbolRef[]>();
  for (const sym of options.symbols ?? []) {
    const normFile = sym.file.replace(/\\/g, "/"), endLine = sym.endLine ?? sym.line;
    const symNode = upsertNode({ id: sym.id, node_type: "CodeSymbol", file: normFile, symbolKind: sym.symbolKind, symbolName: sym.symbolName, source_file: normFile, line_start: sym.line, line_end: endLine, citations: [makeCitation(normFile, sym.line, endLine, commit)], evidence_refs: [] });
    knownSymbolsById.set(symNode.id, symNode);
    const list = knownSymbolsByFile.get(normFile) ?? []; list.push({ ...sym, file: normFile }); knownSymbolsByFile.set(normFile, list);
  }
  const knownEndpointsById = new Map<string, DataModelNode>();
  for (const ep of options.endpoints ?? []) {
    const normFile = ep.file.replace(/\\/g, "/"), endLine = ep.endLine ?? ep.line;
    const epNode = upsertNode({ id: ep.id, node_type: "ApiEndpoint", method: ep.method, pathTemplate: ep.pathTemplate, file: normFile, source_file: normFile, line_start: ep.line, line_end: endLine, citations: [makeCitation(normFile, ep.line, endLine, commit)], evidence_refs: [] });
    knownEndpointsById.set(epNode.id, epNode);
  }

  const ordered = [...sources].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (ordered.some((s) => s.language === "drizzle" || s.language === "ts") && (tsParser === null || tsLanguage === null)) {
    throw new Error("extractDataModel: TypeScript AST not ready — await ensureDataModelTsReady() once before calling on TS/Drizzle sources.");
  }

  const fileCtxByPath = new Map<string, FileAstContext>();
  for (const s of ordered) {
    const normPath = s.path.replace(/\\/g, "/");
    if (s.language === "prisma" || normPath.endsWith(".prisma")) { addDiagnostic("unsupported-schema-format", `Prisma schema '${normPath}' is out of scope in Lot L4.`, normPath, 1, 1, [normPath]); continue; }
    if (s.language === "sql" || normPath.endsWith(".sql")) continue;
    const src = createTsSourceBuffer(s.content), tree = tsParser!.parse(s.content);
    if (!tree) throw new Error(`extractDataModel: tree-sitter parse returned null for ${normPath}`);
    fileCtxByPath.set(normPath, buildFileAstContext(normPath, src, tree.rootNode, repoKey, knownSymbolsByFile));
  }

  // Pass 1a: Discover `pgSchema("<s>")` bindings
  const schemaByBinding = new Map<Binding, string>();
  for (const fileCtx of fileCtxByPath.values()) {
    for (const binding of fileCtx.bindingByInitNodeId.values()) {
      if (!binding.reassigned && binding.initNode?.type === "call_expression" && resolveDrizzlePgCoreSymbol(binding.initNode.childForFieldName("function"), fileCtx, fileCtxByPath) === "pgSchema") {
        const schemaName = readStaticStringLiteral(fileCtx.src, getCallArguments(binding.initNode)[0]);
        if (!schemaName) { const span = nodeSpan(binding.initNode); addDiagnostic("unsupported-construct", "pgSchema(...) requires a static string literal schema name.", fileCtx.file, span.startLine, span.endLine, ["pgSchema", String(binding.initNode.startIndex)]); }
        else schemaByBinding.set(binding, schemaName);
      }
    }
  }

  // Pass 1b: Discover `pgTable` & `<schemaVar>.table` calls
  const tableByBinding = new Map<Binding, TableRecord>(), allTables: TableRecord[] = [], deferredInlineFks: DeferredInlineFk[] = [];
  const toAmbiguousCandidates = (cands: Binding[]): AppContextDiagnosticCandidate[] =>
    cands.map((b) => {
      const span = nodeSpan(b.initNode ?? b.declNode), tbl = tableByBinding.get(b);
      return { file: b.file, startLine: span.startLine, endLine: span.endLine, label: tbl ? `${tbl.entityNode.schema}.${tbl.entityNode.name}` : b.name };
    }).sort((a, b) => (a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.startLine !== b.startLine ? a.startLine - b.startLine : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  function resolveTableCallSchema(callNode: TsNode, fileCtx: FileAstContext): { kind: "ok"; schema: string } | { kind: "unsupported"; spanNode: TsNode; message: string; detail: string[] } | { kind: "unrelated" } {
    const callee = callNode.childForFieldName("function");
    if (!callee) return { kind: "unrelated" };
    if (resolveDrizzlePgCoreSymbol(callee, fileCtx, fileCtxByPath) === "pgTable") return { kind: "ok", schema: defaultSchema };
    if (isUnsupportedDrizzleTableConstructor(callee, fileCtx, fileCtxByPath)) return { kind: "unsupported", spanNode: callNode, message: "Non-PostgreSQL Drizzle constructor is out of scope in Lot L4.", detail: ["dialect", String(callNode.startIndex)] };
    if (callee.type === "identifier") {
      const calleeName = nodeText(fileCtx.src, callee);
      if (calleeName === "pgTable" || calleeName === "mysqlTable" || calleeName === "sqliteTable") return { kind: "unsupported", spanNode: callNode, message: `Unbound or shadowed '${calleeName}' call.`, detail: ["unbound-ctor", calleeName, String(callNode.startIndex)] };
    }
    const obj = callee.type === "member_expression" ? callee.childForFieldName("object") : null;
    const prop = callee.type === "member_expression" ? callee.childForFieldName("property") : null;
    if (prop && nodeText(fileCtx.src, prop) === "table" && obj) {
      if (obj.type === "identifier") {
        const canonicalB = resolveCanonicalBinding(resolveIdentifierInScope(nodeText(fileCtx.src, obj), obj, fileCtx), fileCtxByPath);
        if (canonicalB && schemaByBinding.has(canonicalB)) return { kind: "ok", schema: schemaByBinding.get(canonicalB)! };
        if (getCallArguments(callNode).length >= 2) return { kind: "unsupported", spanNode: callNode, message: "Unresolved schema handle in .table(...) declaration.", detail: ["schema-handle", nodeText(fileCtx.src, obj), String(callNode.startIndex)] };
      } else if (obj.type === "call_expression") {
        const objCallee = obj.childForFieldName("function");
        if (resolveDrizzlePgCoreSymbol(objCallee, fileCtx, fileCtxByPath) === "pgSchema") {
          const schemaArg = getCallArguments(obj)[0], schemaName = readStaticStringLiteral(fileCtx.src, schemaArg);
          if (schemaName !== null) return { kind: "ok", schema: schemaName };
          return { kind: "unsupported", spanNode: schemaArg ?? obj, message: "pgSchema(...) requires a static string literal schema name.", detail: ["pgSchema-inline", String(obj.startIndex)] };
        }
        if (objCallee?.type === "identifier" && nodeText(fileCtx.src, objCallee) === "pgSchema") return { kind: "unsupported", spanNode: obj, message: "Unbound or shadowed pgSchema(...) call.", detail: ["pgSchema-unbound", String(obj.startIndex)] };
      }
    }
    return { kind: "unrelated" };
  }

  function extractTableFromCall(callNode: TsNode, schemaName: string, binding: Binding | null, fileCtx: FileAstContext): void {
    const args = getCallArguments(callNode), tableName = readStaticStringLiteral(fileCtx.src, args[0]), colsObjNode = args[1];
    if (!tableName || colsObjNode?.type !== "object") {
      const span = nodeSpan((!tableName ? args[0] : colsObjNode) ?? callNode);
      addDiagnostic("unsupported-construct", !tableName ? "Drizzle pgTable(...) requires a static string literal table name." : `Drizzle table '${tableName}' requires an inline object literal of columns.`, fileCtx.file, span.startLine, span.endLine, !tableName ? ["pgTable", "name", String(callNode.startIndex)] : ["pgTable", schemaName, tableName, "cols", String(callNode.startIndex)]);
      return;
    }

    const colChildren = semanticChildren(colsObjNode);
    let hasExcludedMember = false;
    for (const propChild of colChildren) {
      const propSpan = nodeSpan(propChild), keyNode = propChild.type === "pair" ? propChild.childForFieldName("key") : null;
      const propName = keyNode?.type === "property_identifier" ? nodeText(fileCtx.src, keyNode) : readStaticStringLiteral(fileCtx.src, keyNode);
      if (propChild.type !== "pair" || !propName) {
        addDiagnostic("unsupported-construct", `Unsupported spread or computed member in Drizzle table '${tableName}'.`, fileCtx.file, propSpan.startLine, propSpan.endLine, ["table-member", schemaName, tableName, String(propChild.startIndex)]);
        hasExcludedMember = true;
      }
    }
    if (hasExcludedMember) return;

    const callSpan = nodeSpan(callNode), entityCite = makeCitation(fileCtx.file, callSpan.startLine, callSpan.endLine, commit);
    const entityNode = upsertNode({
      id: appContextNodeId(repoKey, "DataEntity", [dialect, schemaName, tableName]), node_type: "DataEntity", dialect, schema: schemaName, name: tableName, entityKind: "table",
      source_file: fileCtx.file, line_start: callSpan.startLine, line_end: callSpan.endLine, citations: [entityCite], evidence_refs: [],
    });
    const validBinding = binding && !binding.reassigned ? binding : null;
    const tableRec: TableRecord = { fileCtx, entityNode, binding: validBinding, propToField: new Map(), callbackNode: args[2] ?? null };
    if (validBinding) tableByBinding.set(validBinding, tableRec);
    allTables.push(tableRec);

    for (const propChild of colChildren) {
      const propSpan = nodeSpan(propChild), keyNode = propChild.childForFieldName("key")!, valNode = propChild.childForFieldName("value");
      const propName = (keyNode.type === "property_identifier" ? nodeText(fileCtx.src, keyNode) : readStaticStringLiteral(fileCtx.src, keyNode))!;
      const chain = valNode ? unwrapCallChain(valNode, fileCtx.src) : null, builderSym = chain ? resolveDrizzlePgCoreSymbol(chain.rootCallee, fileCtx, fileCtxByPath) : null;
      const baseDbType = builderSym ? DRIZZLE_PG_BUILDERS[builderSym] : undefined;
      if (!chain || !builderSym || !baseDbType || chain.rootArgs.length > 2) {
        addDiagnostic("unsupported-construct", `Unsupported column in Drizzle table '${tableName}'.`, fileCtx.file, propSpan.startLine, propSpan.endLine, ["col", schemaName, tableName, propName, String(propChild.startIndex)]);
        continue;
      }
      let colName = propName, optsNode: TsNode | null = null, argsValid = true;
      if (chain.rootArgs.length === 1) {
        const litName = readStaticStringLiteral(fileCtx.src, chain.rootArgs[0]);
        if (litName !== null) colName = litName; else if (chain.rootArgs[0]!.type === "object") optsNode = chain.rootArgs[0]!; else argsValid = false;
      } else if (chain.rootArgs.length === 2) {
        const litName = readStaticStringLiteral(fileCtx.src, chain.rootArgs[0]);
        if (litName === null) argsValid = false; else { colName = litName; optsNode = chain.rootArgs[1]!; }
      }
      const formattedType = argsValid ? formatColumnTypeWithOptions(baseDbType, optsNode, fileCtx.src) : null;
      if (!formattedType) {
        addDiagnostic("unsupported-construct", `Unsupported column arguments or options in '${tableName}.${propName}'.`, fileCtx.file, propSpan.startLine, propSpan.endLine, ["opts", schemaName, tableName, propName, String(propChild.startIndex)]);
        continue;
      }

      let isPk = false, nullable = !SERIAL_BUILDERS.has(builderSym), hasUnsupportedModifier = false;
      const pendingRefs: Array<{ memberExpr: TsNode; callNode: TsNode }> = [];
      for (const step of chain.steps) {
        if (step.methodName === "notNull" && step.args.length === 0) nullable = false;
        else if (step.methodName === "primaryKey" && step.args.length === 0) { isPk = true; nullable = false; }
        else if ((step.methodName === "defaultNow" || step.methodName === "defaultRandom") && step.args.length === 0) { /* supported */ }
        else if (step.methodName === "default" && step.args.length === 1 && isStaticPrimitiveLiteral(fileCtx.src, step.args[0])) { /* supported */ }
        else if (step.methodName === "unique" && (step.args.length === 0 || (step.args.length === 1 && readStaticStringLiteral(fileCtx.src, step.args[0]) !== null))) { /* supported */ }
        else if (step.methodName === "references" && step.args.length >= 1 && step.args.length <= 2) {
          const memberExpr = extractInlineFkMemberTarget(step.args[0], step.args[1], fileCtx.src);
          if (!memberExpr) {
            const stepSpan = nodeSpan(step.callNode);
            addDiagnostic("unsupported-construct", `Unsupported .references(...) callback in '${tableName}.${propName}'.`, fileCtx.file, stepSpan.startLine, stepSpan.endLine, ["ref", schemaName, tableName, propName, String(step.callNode.startIndex)]);
            hasUnsupportedModifier = true; break;
          }
          pendingRefs.push({ memberExpr, callNode: step.callNode });
        } else {
          const stepSpan = nodeSpan(step.callNode);
          addDiagnostic("unsupported-construct", `Unsupported modifier '.${step.methodName}(...)' in '${tableName}.${propName}'.`, fileCtx.file, stepSpan.startLine, stepSpan.endLine, ["modifier", schemaName, tableName, propName, step.methodName, String(step.callNode.startIndex)]);
          hasUnsupportedModifier = true; break;
        }
      }
      if (hasUnsupportedModifier) continue;

      const fieldCite = makeCitation(fileCtx.file, propSpan.startLine, propSpan.endLine, commit);
      const fieldNode = upsertNode({
        id: appContextNodeId(repoKey, "DataField", [dialect, schemaName, tableName, colName]), node_type: "DataField", dialect, schema: schemaName, entityName: tableName, name: colName,
        dbType: formattedType, nullable, isPk, isFk: false, source_file: fileCtx.file, line_start: propSpan.startLine, line_end: propSpan.endLine, citations: [fieldCite], evidence_refs: [],
      });
      tableRec.propToField.set(propName, fieldNode);
      addEdge(entityNode.id, fieldNode.id, "has_field", "drizzle_schema_column", [fieldCite]);
      for (const ref of pendingRefs) deferredInlineFks.push({ fileCtx, sourceField: fieldNode, memberExpr: ref.memberExpr, callNode: ref.callNode });
    }
  }

  for (const fileCtx of fileCtxByPath.values()) {
    const scanTableCalls = (node: TsNode): void => {
      if (node.type === "call_expression") {
        const resolved = resolveTableCallSchema(node, fileCtx);
        if (resolved.kind === "unsupported") { const span = nodeSpan(resolved.spanNode); addDiagnostic("unsupported-construct", resolved.message, fileCtx.file, span.startLine, span.endLine, resolved.detail); }
        else if (resolved.kind === "ok") extractTableFromCall(node, resolved.schema, fileCtx.bindingByInitNodeId.get(node.id) ?? null, fileCtx);
      }
      for (const child of semanticChildren(node)) scanTableCalls(child);
    };
    scanTableCalls(fileCtx.root);
  }

  // Pass 2a: Resolve inline FKs and table-level callbacks
  function resolveTargetTableField(memberExpr: TsNode, fileCtx: FileAstContext): { field: DataModelNode } | { error: DataModelDiagnosticCode; message: string; candidates?: AppContextDiagnosticCandidate[] } {
    const objNode = memberExpr.type === "member_expression" ? memberExpr.childForFieldName("object") : null;
    const propNode = memberExpr.type === "member_expression" ? memberExpr.childForFieldName("property") : null;
    if (objNode?.type !== "identifier" || propNode?.type !== "property_identifier") return { error: "unsupported-construct", message: "FK target must be a static <tableIdent>.<prop> access." };
    const tableIdent = nodeText(fileCtx.src, objNode), propName = nodeText(fileCtx.src, propNode);
    const cands = resolveCanonicalBindings(resolveIdentifierInScope(tableIdent, objNode, fileCtx), fileCtxByPath);
    if (cands.length > 1) return { error: "target-ambiguous", message: `Ambiguous Drizzle table '${tableIdent}'.`, candidates: toAmbiguousCandidates(cands) };
    const canonicalB = cands.length === 1 && !cands[0]!.reassigned ? cands[0]! : null;
    const targetTable = canonicalB ? tableByBinding.get(canonicalB) : undefined;
    if (!targetTable) return { error: "target-unresolved", message: `Cannot resolve referenced Drizzle table '${tableIdent}'.` };
    const targetField = targetTable.propToField.get(propName);
    return targetField ? { field: targetField } : { error: "target-unresolved", message: `Property '${propName}' does not exist on Drizzle table '${targetTable.entityNode.name}'.` };
  }

  for (const fk of deferredInlineFks) {
    const fullSpan = nodeSpan(fk.callNode), resolved = resolveTargetTableField(fk.memberExpr, fk.fileCtx);
    if ("error" in resolved) {
      const targetSpan = nodeSpan(fk.memberExpr);
      addDiagnostic(resolved.error, resolved.message, fk.fileCtx.file, targetSpan.startLine, targetSpan.endLine, [fk.sourceField.id, "ref-target", String(fk.memberExpr.startIndex)], resolved.candidates);
    } else {
      fk.sourceField.isFk = true;
      addEdge(fk.sourceField.id, resolved.field.id, "references", "drizzle_schema_fk", [makeCitation(fk.fileCtx.file, fullSpan.startLine, fullSpan.endLine, commit)]);
    }
  }

  for (const tableRec of allTables) {
    const cb = tableRec.callbackNode;
    if (!cb) continue;
    const { fileCtx } = tableRec, cbSpan = nodeSpan(cb), tName = tableRec.entityNode.name!, sName = tableRec.entityNode.schema!;
    const paramsNode = (cb.type === "arrow_function" || cb.type === "function_expression" || cb.type === "function") ? (cb.childForFieldName("parameters") ?? cb.childForFieldName("parameter")) : null;
    const paramIds: Array<{ name: string; node: TsNode }> = [];
    if (paramsNode) collectBindingIdentifiers(paramsNode, fileCtx.src, paramIds);
    const tParamName = paramIds[0]?.name, bodyNode = cb.childForFieldName("body"), retExpr = bodyNode ? unwrapSingleReturnExpression(bodyNode) : null;
    if (!tParamName || paramIds.length !== 1 || !retExpr || (retExpr.type !== "array" && retExpr.type !== "object")) {
      addDiagnostic("unsupported-construct", `Unsupported table callback shape on '${tName}'.`, fileCtx.file, cbSpan.startLine, cbSpan.endLine, [sName, tName, "cb-shape", String(cb.startIndex)]);
      continue;
    }

    const constraintExprs: TsNode[] = [];
    for (const child of semanticChildren(retExpr)) {
      if (retExpr.type === "array" && child.type !== "spread_element") constraintExprs.push(child);
      else if (retExpr.type === "object" && child.type === "pair" && child.childForFieldName("value")) constraintExprs.push(child.childForFieldName("value")!);
      else { const s = nodeSpan(child); addDiagnostic("unsupported-construct", `Unsupported entry in table callback on '${tName}'.`, fileCtx.file, s.startLine, s.endLine, [sName, tName, "cb-entry", String(child.startIndex)]); }
    }

    const resolveSelfField = (expr: TsNode): DataModelNode | null => {
      const obj = expr.type === "member_expression" ? expr.childForFieldName("object") : null, prop = expr.type === "member_expression" ? expr.childForFieldName("property") : null;
      return obj?.type === "identifier" && prop?.type === "property_identifier" && nodeText(fileCtx.src, obj) === tParamName ? (tableRec.propToField.get(nodeText(fileCtx.src, prop)) ?? null) : null;
    };

    for (const item of constraintExprs) {
      const itemSpan = nodeSpan(item), chain = unwrapCallChain(item, fileCtx.src), rootSym = chain ? resolveDrizzlePgCoreSymbol(chain.rootCallee, fileCtx, fileCtxByPath) : null;
      if (!chain || !rootSym) { addDiagnostic("unsupported-construct", `Unsupported constraint in table '${tName}'.`, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, "cb-item", String(item.startIndex)]); continue; }
      if (rootSym === "index" || rootSym === "uniqueIndex") {
        const idxName = readStaticStringLiteral(fileCtx.src, chain.rootArgs[0]), onStep = chain.steps.find((s) => s.methodName === "on");
        if (!idxName || !onStep || onStep.args.length === 0 || chain.steps.length !== 1 || !onStep.args.every((a) => resolveSelfField(a) !== null)) {
          addDiagnostic("unsupported-construct", `Invalid index constraint in table '${tName}'.`, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, "idx", String(item.startIndex)]);
        }
      } else if (rootSym === "primaryKey") {
        const colsArr = chain.rootArgs[0] ? readObjectPairMap(chain.rootArgs[0], fileCtx.src)?.get("columns") : undefined;
        const fields = colsArr?.type === "array" ? semanticChildren(colsArr).map(resolveSelfField) : [];
        if (fields.length === 0 || fields.some((f) => f === null)) addDiagnostic("unsupported-construct", `Invalid composite primaryKey in table '${tName}'.`, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, "pk", String(item.startIndex)]);
        else { const pkCite = makeCitation(fileCtx.file, itemSpan.startLine, itemSpan.endLine, commit); for (const f of fields) { f!.isPk = true; f!.nullable = false; appendNodeCitation(f!, pkCite); } }
      } else if (rootSym === "foreignKey") {
        const pairs = chain.rootArgs[0] ? readObjectPairMap(chain.rootArgs[0], fileCtx.src) : null, colsArr = pairs?.get("columns"), foreignColsArr = pairs?.get("foreignColumns");
        const srcExprs = colsArr?.type === "array" ? semanticChildren(colsArr) : [], dstExprs = foreignColsArr?.type === "array" ? semanticChildren(foreignColsArr) : [];
        if (colsArr?.type !== "array" || foreignColsArr?.type !== "array" || srcExprs.length === 0 || srcExprs.length !== dstExprs.length) {
          addDiagnostic("unsupported-construct", `Invalid foreignKey in table '${tName}'.`, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, "fk", String(item.startIndex)]); continue;
        }
        const srcFields: DataModelNode[] = [], dstFields: DataModelNode[] = [];
        let failed = false;
        for (let i = 0; i < srcExprs.length; i++) {
          const srcF = resolveSelfField(srcExprs[i]!);
          if (!srcF) { addDiagnostic("unsupported-construct", `Invalid local column in foreignKey on '${tName}'.`, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, "fk-src", String(item.startIndex)]); failed = true; break; }
          const dstRes = resolveTargetTableField(dstExprs[i]!, fileCtx);
          if ("error" in dstRes) { addDiagnostic(dstRes.error, dstRes.message, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, "fk-dst", String(i), String(item.startIndex)], dstRes.candidates); failed = true; break; }
          srcFields.push(srcF); dstFields.push(dstRes.field);
        }
        if (!failed) {
          const fkCite = makeCitation(fileCtx.file, itemSpan.startLine, itemSpan.endLine, commit);
          for (let i = 0; i < srcFields.length; i++) { srcFields[i]!.isFk = true; appendNodeCitation(srcFields[i]!, fkCite); addEdge(srcFields[i]!.id, dstFields[i]!.id, "references", "drizzle_schema_fk", [fkCite]); }
        }
      } else addDiagnostic("unsupported-construct", `Constraint '${rootSym}' in table '${tName}' is unsupported.`, fileCtx.file, itemSpan.startLine, itemSpan.endLine, [sName, tName, rootSym, String(item.startIndex)]);
    }
  }

  // Pass 2b: Query-builder reads/writes & raw SQL template diagnostics (R3-B2, R3-B3)
  const directAccesses: Array<{ symbolId: string; targetEntityId: string; relation: "reads" | "writes"; citation: AppContextCitation }> = [];
  const astCalls: DataModelCallRef[] = [];

  const findNearestFunctionBoundary = (atNode: TsNode): TsNode | null => {
    for (let cur = atNode.parent; cur; cur = cur.parent) if (FUNCTION_BOUNDARY_TYPES.has(cur.type)) return cur;
    return null;
  };
  const findEnclosingFunctionDecl = (atNode: TsNode, fileCtx: FileAstContext): FunctionDeclRecord | null => {
    const boundary = findNearestFunctionBoundary(atNode);
    return boundary ? (fileCtx.functions.find((f) => f.fnNode.id === boundary.id) ?? null) : null;
  };
  const ensureFunctionSymbolNode = (fnDecl: FunctionDeclRecord): DataModelNode => {
    const node = upsertNode({
      id: fnDecl.symbolId, node_type: "CodeSymbol", file: fnDecl.file, symbolKind: fnDecl.symbolKind, symbolName: fnDecl.symbolName,
      source_file: fnDecl.file, line_start: fnDecl.startLine, line_end: fnDecl.endLine, citations: [makeCitation(fnDecl.file, fnDecl.startLine, fnDecl.endLine, commit)], evidence_refs: [],
    });
    knownSymbolsById.set(node.id, node);
    return node;
  };

  function resolveQueryTableArgument(argNode: TsNode | undefined, fileCtx: FileAstContext): { table: TableRecord } | { diagCode: DataModelDiagnosticCode; message: string; candidates?: AppContextDiagnosticCandidate[] } {
    if (!argNode) return { diagCode: "unsupported-construct", message: "Missing table argument in Drizzle query." };
    if (argNode.type === "identifier") {
      const identName = nodeText(fileCtx.src, argNode);
      const cands = resolveCanonicalBindings(resolveIdentifierInScope(identName, argNode, fileCtx), fileCtxByPath);
      if (cands.length > 1) return { diagCode: "target-ambiguous", message: `Ambiguous Drizzle table '${identName}'.`, candidates: toAmbiguousCandidates(cands) };
      const canonicalB = cands.length === 1 && !cands[0]!.reassigned ? cands[0]! : null, tableRec = canonicalB ? tableByBinding.get(canonicalB) : undefined;
      return tableRec ? { table: tableRec } : { diagCode: "target-unresolved", message: `Identifier '${identName}' does not resolve to a supported Drizzle pgTable.` };
    }
    if (argNode.type === "member_expression") {
      const obj = argNode.childForFieldName("object"), prop = argNode.childForFieldName("property");
      const localB = obj?.type === "identifier" && prop?.type === "property_identifier" ? resolveIdentifierInScope(nodeText(fileCtx.src, obj), obj, fileCtx) : null;
      if (localB?.kind === "import" && localB.importInfo?.importedKind === "namespace" && localB.importInfo.sourceModule.startsWith(".")) {
        const targetFile = resolveRelativeFile(fileCtx.file, localB.importInfo.sourceModule, fileCtxByPath);
        const cands = targetFile ? resolveExportedBindings(targetFile, nodeText(fileCtx.src, prop!), fileCtxByPath) : [];
        if (cands.length > 1) return { diagCode: "target-ambiguous", message: "Ambiguous namespace Drizzle table.", candidates: toAmbiguousCandidates(cands) };
        const exportedB = cands.length === 1 && !cands[0]!.reassigned ? cands[0]! : null, tableRec = exportedB ? tableByBinding.get(exportedB) : undefined;
        return tableRec ? { table: tableRec } : { diagCode: "target-unresolved", message: "Namespace member does not resolve to a supported Drizzle pgTable." };
      }
    }
    return { diagCode: "unsupported-construct", message: `Dynamic table argument '${nodeText(fileCtx.src, argNode)}' is unsupported.` };
  }

  const UNRELATED_INIT_TYPES = new Set(["object", "array", "new_expression", "string", "number", "true", "false", "null", "arrow_function", "function", "function_expression", "class"]);
  function classifyDbReceiver(receiverNode: TsNode | null | undefined, fileCtx: FileAstContext): "supported" | "unrelated" | "unsupported" {
    let target = receiverNode ?? null;
    while (target && (target.type === "parenthesized_expression" || target.type === "as_expression")) target = semanticChildren(target)[0] ?? null;
    if (!target) return "unsupported";
    if (UNRELATED_INIT_TYPES.has(target.type)) return "unrelated";
    if (target.type === "identifier") {
      const localB = resolveIdentifierInScope(nodeText(fileCtx.src, target), target, fileCtx);
      if (!localB) return "unsupported";
      const cands = resolveCanonicalBindings(localB, fileCtxByPath);
      if (cands.length !== 1 || cands[0]!.reassigned) return "unsupported";
      const b = cands[0]!;
      if (tableByBinding.has(b) || schemaByBinding.has(b) || b.kind === "function") return "unrelated";
      if (b.kind === "param") return "supported";
      if (b.kind === "import") {
        if (b.importInfo && (isDrizzlePgCoreModule(b.importInfo.sourceModule) || isUnsupportedDrizzleDialectModule(b.importInfo.sourceModule)) && b.importInfo.importedName !== "drizzle") return "unrelated";
        return "supported";
      }
      if (b.kind === "var") {
        if (!b.initNode) return "unsupported";
        if (UNRELATED_INIT_TYPES.has(b.initNode.type)) return "unrelated";
        if (b.initNode.type === "call_expression") {
          const bFileCtx = fileCtxByPath.get(b.file) ?? fileCtx, imp = resolveDrizzleImport(b.initNode.childForFieldName("function"), bFileCtx, fileCtxByPath);
          if (imp && imp.sourceModule.startsWith("drizzle-orm") && imp.importedName === "drizzle") return "supported";
          if (imp && (isDrizzlePgCoreModule(imp.sourceModule) || isUnsupportedDrizzleDialectModule(imp.sourceModule))) return "unrelated";
        }
      }
    }
    return "unsupported";
  }

  function findSelectChainReceiver(expr: TsNode, src: TsSourceBuffer): TsNode | null {
    for (let cur: TsNode | null = expr; cur?.type === "call_expression"; ) {
      const fn = cur.childForFieldName("function");
      if (fn?.type !== "member_expression") return null;
      const prop = fn.childForFieldName("property"), name = prop ? nodeText(src, prop) : "", recv = fn.childForFieldName("object") ?? null;
      if (name === "select" || name === "selectDistinct" || name === "selectDistinctOn") return recv;
      if (name === "from" || name === "innerJoin" || name === "leftJoin" || name === "rightJoin" || name === "fullJoin") { cur = recv; continue; }
      return null;
    }
    return null;
  }

  for (const fileCtx of fileCtxByPath.values()) {
    const walkAst = (node: TsNode): void => {
      if (node.type === "tagged_template_expression" || (node.type === "call_expression" && semanticChildren(node).some((c) => c.type === "template_string"))) {
        if (isDrizzleSqlTag(node.childForFieldName("function") ?? semanticChildren(node)[0], fileCtx, fileCtxByPath)) {
          const span = nodeSpan(node);
          addDiagnostic("unsupported-construct", "Raw sql`...` template literal is unsupported in Lot L4.", fileCtx.file, span.startLine, span.endLine, ["sql-template", String(node.startIndex)]);
        }
      }
      if (node.type === "call_expression") {
        const fnNode = node.childForFieldName("function"), enclosingFn = findEnclosingFunctionDecl(node, fileCtx);
        if (enclosingFn && fnNode?.type === "identifier") {
          const canonicalB = resolveCanonicalBinding(resolveIdentifierInScope(nodeText(fileCtx.src, fnNode), fnNode, fileCtx), fileCtxByPath);
          const calleeFn = canonicalB ? fileCtxByPath.get(canonicalB.file)?.functions.find((f) => f.binding?.id === canonicalB.id) : undefined;
          if (calleeFn && calleeFn.symbolId !== enclosingFn.symbolId) {
            ensureFunctionSymbolNode(enclosingFn); ensureFunctionSymbolNode(calleeFn);
            const callSpan = nodeSpan(node);
            astCalls.push({ caller: enclosingFn.symbolId, callee: calleeFn.symbolId, file: fileCtx.file, line: callSpan.startLine, endLine: callSpan.endLine });
          }
        }
        if (fnNode?.type === "member_expression") {
          const objNode = fnNode.childForFieldName("object"), propNode = fnNode.childForFieldName("property");
          const methodName = propNode ? nodeText(fileCtx.src, propNode) : "", args = getCallArguments(node);
          const selectRecv = objNode && (methodName === "from" || methodName === "innerJoin" || methodName === "leftJoin" || methodName === "rightJoin" || methodName === "fullJoin") ? findSelectChainReceiver(objNode, fileCtx.src) : null;
          const isMutationName = methodName === "insert" || methodName === "update" || methodName === "delete";
          const recvKind = selectRecv ? classifyDbReceiver(selectRecv, fileCtx) : isMutationName && objNode ? classifyDbReceiver(objNode, fileCtx) : "unrelated";
          if (recvKind !== "unrelated" && (selectRecv !== null || isMutationName)) {
            const outerSpan = nodeSpan(getOutermostChainedCall(node)), argSpan = nodeSpan(args[0] ?? node), isSelectHop = selectRecv !== null;
            if (recvKind === "unsupported" || (isMutationName && args.length !== 1)) {
              addDiagnostic("unsupported-construct", `Unsupported Drizzle query receiver or call on '${methodName}'.`, fileCtx.file, outerSpan.startLine, outerSpan.endLine, ["query-recv", methodName, String(node.startIndex)]);
            } else {
              const res = resolveQueryTableArgument(args[0], fileCtx);
              if ("diagCode" in res) addDiagnostic(res.diagCode, res.message, fileCtx.file, argSpan.startLine, argSpan.endLine, [methodName, String(node.startIndex)], res.candidates);
              else if (!enclosingFn) addDiagnostic("unsupported-construct", "Drizzle query without a supported enclosing function has no source CodeSymbol.", fileCtx.file, outerSpan.startLine, outerSpan.endLine, ["unowned-query", methodName, String(node.startIndex)]);
              else {
                const symNode = ensureFunctionSymbolNode(enclosingFn), cite = makeCitation(fileCtx.file, outerSpan.startLine, outerSpan.endLine, commit), relation = isSelectHop ? "reads" : "writes";
                addEdge(symNode.id, res.table.entityNode.id, relation, isSelectHop ? "drizzle_select_ast" : "drizzle_mutation_ast", [cite]);
                directAccesses.push({ symbolId: symNode.id, targetEntityId: res.table.entityNode.id, relation, citation: cite });
              }
            }
          }
        }
      }
      for (const child of semanticChildren(node)) walkAst(child);
    };
    walkAst(fileCtx.root);
  }

  // Step 6: Bounded Order-Independent Handler Call Propagation (R2-M11)
  const validCalls: DataModelCallRef[] = [...astCalls], validHandles: DataModelHandleRef[] = [];
  for (const call of options.calls ?? []) {
    const normFile = call.file.replace(/\\/g, "/"), endLine = call.endLine ?? call.line;
    const okCaller = knownSymbolsById.has(call.caller), okCallee = knownSymbolsById.has(call.callee);
    if (!okCaller) addDiagnostic("target-unresolved", `Unresolved calls caller '${call.caller}'.`, normFile, call.line, endLine, ["call-caller", call.caller, String(call.line)]);
    if (!okCallee) addDiagnostic("target-unresolved", `Unresolved calls callee '${call.callee}'.`, normFile, call.line, endLine, ["call-callee", call.callee, String(call.line)]);
    if (okCaller && okCallee) validCalls.push({ ...call, file: normFile });
  }
  for (const h of options.handles ?? []) {
    const normFile = h.file.replace(/\\/g, "/"), endLine = h.endLine ?? h.line;
    const okHandler = knownSymbolsById.has(h.handler), okEndpoint = knownEndpointsById.has(h.endpoint);
    if (!okHandler) addDiagnostic("target-unresolved", `Unresolved handles handler '${h.handler}'.`, normFile, h.line, endLine, ["handle-handler", h.handler, String(h.line)]);
    if (!okEndpoint) addDiagnostic("target-unresolved", `Unresolved handles endpoint '${h.endpoint}'.`, normFile, h.line, endLine, ["handle-endpoint", h.endpoint, String(h.line)]);
    if (okHandler && okEndpoint) validHandles.push({ ...h, file: normFile });
  }

  const maxHops = Math.min(6, Math.max(1, Math.round(options.maxHops ?? 3)));
  const callersOf = new Map<string, DataModelCallRef[]>(), handledBy = new Map<string, DataModelHandleRef[]>();
  for (const call of validCalls) { const list = callersOf.get(call.callee) ?? []; list.push(call); callersOf.set(call.callee, list); }
  for (const h of validHandles) { const list = handledBy.get(h.handler) ?? []; list.push(h); handledBy.set(h.handler, list); }

  for (const direct of directAccesses) {
    const queue = [{ symbol: direct.symbolId, depth: 0, trail: [direct.citation], onPath: new Set([direct.symbolId]) }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const h of handledBy.get(current.symbol) ?? []) {
        addEdge(h.endpoint, direct.targetEntityId, direct.relation, "handler_call_propagation", [makeCitation(h.file, h.line, h.endLine ?? h.line, commit), ...current.trail]);
      }
      if (current.depth >= maxHops) continue;
      for (const call of callersOf.get(current.symbol) ?? []) {
        if (current.onPath.has(call.caller)) continue;
        const nextPath = new Set(current.onPath); nextPath.add(call.caller);
        queue.push({ symbol: call.caller, depth: current.depth + 1, trail: [...current.trail, makeCitation(call.file, call.line, call.endLine ?? call.line, commit)], onPath: nextPath });
      }
    }
  }

  return {
    nodes: [...nodesById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...edgesByKey.values()].sort((a, b) =>
      a.source !== b.source ? (a.source < b.source ? -1 : 1) : a.target !== b.target ? (a.target < b.target ? -1 : 1)
      : a.relation !== b.relation ? (a.relation < b.relation ? -1 : 1) : a.derivation_method < b.derivation_method ? -1 : a.derivation_method > b.derivation_method ? 1 : 0),
    diagnostics: [...diagnosticsById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

// Worktree Wrapper (`extractDataModelFromFiles`) — Preserves Base Identity (R2-M12)
function deriveCommonCheckoutRoot(files: DataModelInputFile[], explicitRootDir?: string): string | undefined {
  if (explicitRootDir) return resolve(explicitRootDir);
  if (files.length === 0) return undefined;
  for (const f of files) {
    const absNorm = resolve(f.absPath).replace(/\\/g, "/"), relNorm = f.repoRelPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (relNorm && absNorm.endsWith(`/${relNorm}`)) return resolve(absNorm.slice(0, absNorm.length - relNorm.length - 1) || "/");
  }
  if (files.length === 1) return resolve(dirname(files[0]!.absPath));
  const splitPaths = files.map((f) => resolve(f.absPath).split(sep)), minLen = Math.min(...splitPaths.map((p) => p.length));
  let commonLen = 0;
  while (commonLen < minLen && splitPaths.every((p) => p[commonLen] === splitPaths[0]![commonLen])) commonLen += 1;
  return commonLen > 0 ? resolve(splitPaths[0]!.slice(0, commonLen).join(sep) || sep) : undefined;
}

export async function extractDataModelFromFiles(files: DataModelInputFile[], options: ExtractDataModelOptions): Promise<DataModelFilesResult> {
  if (files.some((f) => f.language === "drizzle" || f.language === "ts")) await ensureDataModelTsReady();
  const sharedRootDir = deriveCommonCheckoutRoot(files, options.rootDir), base: ExtractionResult[] = [], sources: DataModelSourceFile[] = [];
  for (const f of files) {
    sources.push({ path: f.repoRelPath, language: f.language, content: readFileSync(f.absPath, "utf-8") });
    if (f.language === "sql") base.push(await extractSql(f.absPath, sharedRootDir));
    else if (f.language === "drizzle" || f.language === "ts") base.push(await extractJs(f.absPath, sharedRootDir));
    else base.push({ nodes: [], edges: [] });
  }
  return { base, model: extractDataModel(sources, options) };
}
