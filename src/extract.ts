/**
 * Deterministic structural extraction from source code using tree-sitter.
 * Outputs nodes + edges dicts.
 *
 * TypeScript port of graphify/extract.py — uses web-tree-sitter (WASM) instead
 * of Python's native tree-sitter bindings.
 */

import { readFileSync, readdirSync, lstatSync, realpathSync, existsSync } from "node:fs";
import { resolve, basename, extname, dirname, join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import type { GraphNode, GraphEdge, Extraction } from "./types.js";
import { loadCached, saveCached } from "./cache.js";

// ---------------------------------------------------------------------------
// web-tree-sitter types  (re-exported from the package)
// ---------------------------------------------------------------------------
import * as TreeSitter from "web-tree-sitter";
type SyntaxNode = TreeSitter.Node;
type Tree = TreeSitter.Tree;

const Parser = (
  (TreeSitter as unknown as { Parser?: typeof TreeSitter.Parser }).Parser ??
  (TreeSitter as unknown as { default?: typeof TreeSitter.Parser }).default
)!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _parserInitialized = false;

function getModuleRequire(): NodeJS.Require {
  try {
    return createRequire(import.meta.url);
  } catch {
    return require;
  }
}

const moduleRequire = getModuleRequire();

async function ensureParserInit(): Promise<void> {
  if (!_parserInitialized) {
    await Parser.init();
    _parserInitialized = true;
  }
}

function parseText(parser: InstanceType<typeof Parser>, source: string): Tree {
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error("Parser returned null");
  }
  return tree;
}

/** Try to locate a WASM grammar file. Returns the resolved path or null. */
function resolveGrammarWasm(langName: string): string | null {
  const packageName = new Map<string, string>([
    ["c_sharp", "c-sharp"],
  ]).get(langName) ?? langName;
  // Try common npm package conventions
  const candidates = [
    `tree-sitter-${packageName}/tree-sitter-${langName}.wasm`,
    `tree-sitter-${packageName}/tree-sitter-${packageName}.wasm`,
    `tree-sitter-${packageName}/tree_sitter_${langName}.wasm`,
    `tree-sitter-${packageName}/tree_sitter_${packageName.replace(/-/g, "_")}.wasm`,
    `tree-sitter-${packageName}/${langName}.wasm`,
    `tree-sitter-${packageName}/${packageName}.wasm`,
  ];
  for (const candidate of candidates) {
    try {
      const resolved = moduleRequire.resolve(candidate);
      if (existsSync(resolved)) return resolved;
    } catch {
      /* not found via require.resolve — skip */
    }
  }
  // Also try a path relative to node_modules
  const nmDir = join(process.cwd(), "node_modules");
  for (const candidate of candidates) {
    const p = join(nmDir, candidate);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Cache of loaded Parser.Language instances keyed by language name.
 * Avoids re-reading WASM files on every file extraction.
 */
const _languageCache = new Map<string, TreeSitter.Language>();

async function loadLanguage(langName: string): Promise<TreeSitter.Language | null> {
  if (_languageCache.has(langName)) return _languageCache.get(langName)!;
  const wasmPath = resolveGrammarWasm(langName);
  if (!wasmPath) return null;
  try {
    const lang = await TreeSitter.Language.load(wasmPath);
    _languageCache.set(langName, lang);
    return lang;
  } catch {
    return null;
  }
}

/** Build a stable node ID from one or more name parts. */
function _makeId(...parts: string[]): string {
  const combined = parts
    .filter(Boolean)
    .map((p) => p.replace(/^[_.]+|[_.]+$/g, ""))
    .join("_");
  const cleaned = combined.replace(/[^a-zA-Z0-9]+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "").toLowerCase();
}

function toPortablePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function inferCommonRoot(paths: string[]): string {
  try {
    if (paths.length === 0) {
      return resolve(".");
    }
    if (paths.length === 1) {
      return resolve(dirname(paths[0]!));
    }
    const parts = paths.map((p) => resolve(p).split(sep));
    const minLen = Math.min(...parts.map((p) => p.length));
    let commonLen = 0;
    for (let i = 0; i < minLen; i++) {
      const uniqueAtLevel = new Set(parts.map((p) => p[i]));
      if (uniqueAtLevel.size === 1) {
        commonLen++;
      } else {
        break;
      }
    }
    return commonLen > 0
      ? resolve(parts[0]!.slice(0, commonLen).join(sep))
      : resolve(".");
  } catch {
    return resolve(".");
  }
}

function projectRelativeFilePath(filePath: string, root: string): string {
  const resolvedPath = resolve(filePath);
  const rel = relative(root, resolvedPath);
  if (!rel || rel.startsWith("..")) {
    return toPortablePath(resolvedPath);
  }
  return toPortablePath(rel);
}

function qualifiedFileStem(filePath: string, rootDir: string = dirname(resolve(filePath))): string {
  const stem = basename(filePath, extname(filePath));
  const parentDir = dirname(resolve(filePath));
  if (resolve(parentDir) === resolve(rootDir)) {
    return stem;
  }
  const parent = basename(parentDir);
  if (!parent || parent === ".") {
    return stem;
  }
  return `${parent}.${stem}`;
}

function buildResolvableLabelIndex(nodes: GraphNode[]): Map<string, string> {
  const candidates = new Map<string, Set<string>>();
  for (const node of nodes) {
    const raw = String(node.label ?? "");
    const normalized = raw.replace(/\(?\)$/g, "").replace(/^\./, "").toLowerCase();
    if (!normalized) continue;
    const ids = candidates.get(normalized) ?? new Set<string>();
    ids.add(node.id);
    candidates.set(normalized, ids);
  }

  const resolved = new Map<string, string>();
  for (const [label, ids] of candidates) {
    if (ids.size === 1) {
      resolved.set(label, ids.values().next().value as string);
    }
  }
  return resolved;
}

type TsconfigAliasEntry = {
  aliasPrefix: string;
  targetBase: string;
};

const tsconfigAliasCache = new Map<string, TsconfigAliasEntry[]>();

function loadTsconfigAliases(startDir: string): TsconfigAliasEntry[] {
  let current = resolve(startDir);
  while (true) {
    const tsconfigPath = join(current, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      const cached = tsconfigAliasCache.get(tsconfigPath);
      if (cached) {
        return cached;
      }
      try {
        const parsed = JSON.parse(readFileSync(tsconfigPath, "utf-8")) as {
          compilerOptions?: { paths?: Record<string, string[]> };
        };
        const aliases = Object.entries(parsed.compilerOptions?.paths ?? {})
          .map(([alias, targets]) => {
            const firstTarget = targets[0];
            if (!firstTarget) {
              return null;
            }
            return {
              aliasPrefix: alias.replace(/\/\*$/, ""),
              targetBase: resolve(current, firstTarget.replace(/\/\*$/, "")),
            } satisfies TsconfigAliasEntry;
          })
          .filter((entry): entry is TsconfigAliasEntry => entry !== null);
        tsconfigAliasCache.set(tsconfigPath, aliases);
        return aliases;
      } catch {
        tsconfigAliasCache.set(tsconfigPath, []);
        return [];
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return [];
    }
    current = parent;
  }
}

function normalizeJsImportTarget(resolvedImport: string): string {
  const ext = extname(resolvedImport).toLowerCase();
  if (ext === ".js") {
    return resolvedImport.slice(0, -3) + ".ts";
  }
  if (ext === ".jsx") {
    return resolvedImport.slice(0, -4) + ".tsx";
  }
  if (ext) {
    return resolvedImport;
  }

  const candidates = [
    `${resolvedImport}.ts`,
    `${resolvedImport}.tsx`,
    `${resolvedImport}.js`,
    `${resolvedImport}.jsx`,
    `${resolvedImport}.mjs`,
    `${resolvedImport}.ejs`,
    join(resolvedImport, "index.ts"),
    join(resolvedImport, "index.tsx"),
    join(resolvedImport, "index.js"),
    join(resolvedImport, "index.jsx"),
    join(resolvedImport, "index.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return resolvedImport;
}

function remapFileNodeIds(nodes: GraphNode[], edges: GraphEdge[], paths: string[], root: string): void {
  const byPath = new Map<string, {
    legacyId: string;
    qualifiedLegacyId: string;
    absoluteId: string;
    portableId: string;
    label: string;
  }>();
  const absoluteToPortable = new Map<string, string>();

  for (const filePath of paths) {
    const resolvedPath = resolve(filePath);
    const portableId = _makeId(projectRelativeFilePath(resolvedPath, root));
    const absoluteId = _makeId(toPortablePath(resolvedPath));
    byPath.set(resolvedPath, {
      legacyId: _makeId(basename(resolvedPath, extname(resolvedPath))),
      qualifiedLegacyId: _makeId(qualifiedFileStem(resolvedPath, root)),
      absoluteId,
      portableId,
      label: basename(resolvedPath),
    });
    absoluteToPortable.set(absoluteId, portableId);
  }

  for (const node of nodes) {
    const info = byPath.get(resolve(node.source_file ?? ""));
    if (!info || node.label !== info.label) continue;
    if (node.id === info.legacyId || node.id === info.qualifiedLegacyId || node.id === info.absoluteId) {
      node.id = info.portableId;
    }
  }

  for (const edge of edges) {
    const sourceInfo = byPath.get(resolve(edge.source_file ?? ""));
    if (
      sourceInfo &&
      (edge.source === sourceInfo.legacyId ||
        edge.source === sourceInfo.qualifiedLegacyId ||
        edge.source === sourceInfo.absoluteId)
    ) {
      edge.source = sourceInfo.portableId;
    }

    const remappedSource = absoluteToPortable.get(edge.source);
    if (remappedSource) {
      edge.source = remappedSource;
    }

    const remappedTarget = absoluteToPortable.get(edge.target);
    if (remappedTarget) {
      edge.target = remappedTarget;
    } else if (
      sourceInfo &&
      edge.relation === "rationale_for" &&
      (
        edge.target === sourceInfo.legacyId ||
        edge.target === sourceInfo.qualifiedLegacyId ||
        edge.target === sourceInfo.absoluteId
      )
    ) {
      edge.target = sourceInfo.portableId;
    }
  }
}

function _readText(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

// ---------------------------------------------------------------------------
// LanguageConfig interface + generic helpers
// ---------------------------------------------------------------------------

type ImportHandler = (
  node: SyntaxNode,
  source: string,
  fileNid: string,
  stem: string,
  edges: GraphEdge[],
  strPath: string,
) => void;

type ResolveFunctionNameFn = (node: SyntaxNode, source: string) => string | null;

type ExtraWalkFn = (
  node: SyntaxNode,
  source: string,
  fileNid: string,
  stem: string,
  strPath: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seenIds: Set<string>,
  functionBodies: Array<[string, SyntaxNode]>,
  parentClassNid: string | null,
  addNodeFn: (nid: string, label: string, line: number) => void,
  addEdgeFn: (src: string, tgt: string, relation: string, line: number) => void,
  walkFn?: (node: SyntaxNode, parentClassNid: string | null) => void,
) => boolean;

interface LanguageConfig {
  tsGrammarName: string; // e.g. "python"
  tsModule: string; // original Python module name — used for language-specific branches

  classTypes: Set<string>;
  functionTypes: Set<string>;
  importTypes: Set<string>;
  callTypes: Set<string>;

  nameField: string;
  nameFallbackChildTypes: string[];

  bodyField: string;
  bodyFallbackChildTypes: string[];

  callFunctionField: string;
  callAccessorNodeTypes: Set<string>;
  callAccessorField: string;

  functionBoundaryTypes: Set<string>;

  importHandler: ImportHandler | null;
  resolveFunctionNameFn: ResolveFunctionNameFn | null;

  functionLabelParens: boolean;

  extraWalkFn: ExtraWalkFn | null;
}

function defaultConfig(overrides: Partial<LanguageConfig> & Pick<LanguageConfig, "tsGrammarName" | "tsModule">): LanguageConfig {
  return {
    classTypes: new Set(),
    functionTypes: new Set(),
    importTypes: new Set(),
    callTypes: new Set(),
    nameField: "name",
    nameFallbackChildTypes: [],
    bodyField: "body",
    bodyFallbackChildTypes: [],
    callFunctionField: "function",
    callAccessorNodeTypes: new Set(),
    callAccessorField: "attribute",
    functionBoundaryTypes: new Set(),
    importHandler: null,
    resolveFunctionNameFn: null,
    functionLabelParens: true,
    extraWalkFn: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Generic helpers for name / body resolution
// ---------------------------------------------------------------------------

function _resolveName(node: SyntaxNode, source: string, config: LanguageConfig): string | null {
  if (config.resolveFunctionNameFn !== null) {
    return null; // caller handles this separately
  }
  const n = node.childForFieldName(config.nameField);
  if (n) return _readText(n, source);
  for (const child of node.children) {
    if (config.nameFallbackChildTypes.includes(child.type)) {
      return _readText(child, source);
    }
  }
  return null;
}

function _findBody(node: SyntaxNode, config: LanguageConfig): SyntaxNode | null {
  const b = node.childForFieldName(config.bodyField);
  if (b) return b;
  for (const child of node.children) {
    if (config.bodyFallbackChildTypes.includes(child.type)) {
      return child;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Import handlers
// ---------------------------------------------------------------------------

function _importPython(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  const t = node.type;
  if (t === "import_statement") {
    for (const child of node.children) {
      if (child.type === "dotted_name" || child.type === "aliased_import") {
        const raw = _readText(child, source);
        const moduleName = raw.split(" as ")[0]!.trim().replace(/^\.+/, "");
        const tgtNid = _makeId(moduleName);
        edges.push({
          source: fileNid, target: tgtNid, relation: "imports",
          confidence: "EXTRACTED", source_file: strPath,
          source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
        });
      }
    }
  } else if (t === "import_from_statement") {
    const moduleNode = node.childForFieldName("module_name");
    if (moduleNode) {
      const raw = _readText(moduleNode, source).replace(/^\.+/, "");
      const tgtNid = _makeId(raw);
      edges.push({
        source: fileNid, target: tgtNid, relation: "imports_from",
        confidence: "EXTRACTED", source_file: strPath,
        source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
      });
    }
  }
}

function _importJs(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  const readStringSpecifier = (current: SyntaxNode): string | null => {
    if (current.type === "string") {
      return _readText(current, source).replace(/^['"`\s]+|['"`\s]+$/g, "");
    }
    for (const child of current.children) {
      const value = readStringSpecifier(child);
      if (value) return value;
    }
    return null;
  };

  if (node.type === "call_expression") {
    const callee = node.childForFieldName("function") ?? node.children[0] ?? null;
    if (!callee || _readText(callee, source) !== "import") {
      return;
    }
  }
  const raw = readStringSpecifier(node);
  if (!raw) return;
  let tgtNid: string | null = null;
  if (raw.startsWith(".")) {
    const resolvedImport = normalizeJsImportTarget(resolve(dirname(strPath), raw));
    tgtNid = _makeId(toPortablePath(resolvedImport));
  } else {
    let resolvedAlias: string | null = null;
    for (const alias of loadTsconfigAliases(dirname(strPath))) {
      if (raw === alias.aliasPrefix || raw.startsWith(`${alias.aliasPrefix}/`)) {
        const suffix = raw.slice(alias.aliasPrefix.length).replace(/^\/+/, "");
        resolvedAlias = normalizeJsImportTarget(resolve(alias.targetBase, suffix));
        break;
      }
    }
    if (resolvedAlias) {
      tgtNid = _makeId(toPortablePath(resolvedAlias));
    } else {
      const moduleName = raw.split("/").pop() ?? "";
      if (moduleName) {
        tgtNid = _makeId(moduleName);
      }
    }
  }
  if (tgtNid) {
    edges.push({
      source: fileNid, target: tgtNid, relation: "imports_from",
      confidence: "EXTRACTED", source_file: strPath,
      source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
    });
  }
}

function _importJava(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  function walkScoped(n: SyntaxNode): string {
    const parts: string[] = [];
    let cur: SyntaxNode | null = n;
    while (cur) {
      if (cur.type === "scoped_identifier") {
        const nameNode = cur.childForFieldName("name");
        if (nameNode) parts.push(_readText(nameNode, source));
        cur = cur.childForFieldName("scope");
      } else if (cur.type === "identifier") {
        parts.push(_readText(cur, source));
        break;
      } else {
        break;
      }
    }
    parts.reverse();
    return parts.join(".");
  }

  for (const child of node.children) {
    if (child.type === "scoped_identifier" || child.type === "identifier") {
      const pathStr = walkScoped(child);
      const pathParts = pathStr.split(".");
      let moduleName = pathParts[pathParts.length - 1]!.replace(/\*/g, "").replace(/\.+$/, "").trim();
      if (!moduleName && pathParts.length > 1) {
        moduleName = pathParts[pathParts.length - 2]!;
      }
      if (!moduleName) moduleName = pathStr;
      if (moduleName) {
        const tgtNid = _makeId(moduleName);
        edges.push({
          source: fileNid, target: tgtNid, relation: "imports",
          confidence: "EXTRACTED", source_file: strPath,
          source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
        });
      }
      break;
    }
  }
}

function _importC(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  for (const child of node.children) {
    if (["string_literal", "system_lib_string", "string"].includes(child.type)) {
      const raw = _readText(child, source).replace(/^["<>\s]+|["<>\s]+$/g, "");
      const moduleName = raw.split("/").pop()!.split(".")[0]!;
      if (moduleName) {
        const tgtNid = _makeId(moduleName);
        edges.push({
          source: fileNid, target: tgtNid, relation: "imports",
          confidence: "EXTRACTED", source_file: strPath,
          source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
        });
      }
      break;
    }
  }
}

function _importCsharp(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  for (const child of node.children) {
    if (["qualified_name", "identifier", "name_equals"].includes(child.type)) {
      const raw = _readText(child, source);
      const moduleName = raw.split(".").pop()!.trim();
      if (moduleName) {
        const tgtNid = _makeId(moduleName);
        edges.push({
          source: fileNid, target: tgtNid, relation: "imports",
          confidence: "EXTRACTED", source_file: strPath,
          source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
        });
      }
      break;
    }
  }
}

function _importKotlin(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  const pathNode = node.childForFieldName("path");
  if (pathNode) {
    const raw = _readText(pathNode, source);
    const moduleName = raw.split(".").pop()!.trim();
    if (moduleName) {
      const tgtNid = _makeId(moduleName);
      edges.push({
        source: fileNid, target: tgtNid, relation: "imports",
        confidence: "EXTRACTED", source_file: strPath,
        source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
      });
    }
    return;
  }
  // Fallback: find identifier child
  for (const child of node.children) {
    if (child.type === "identifier") {
      const raw = _readText(child, source);
      const tgtNid = _makeId(raw);
      edges.push({
        source: fileNid, target: tgtNid, relation: "imports",
        confidence: "EXTRACTED", source_file: strPath,
        source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
      });
      break;
    }
  }
}

function _importScala(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  for (const child of node.children) {
    if (child.type === "stable_id" || child.type === "identifier") {
      const raw = _readText(child, source);
      const moduleName = raw.split(".").pop()!.replace(/[{}\s]/g, "").trim();
      if (moduleName && moduleName !== "_") {
        const tgtNid = _makeId(moduleName);
        edges.push({
          source: fileNid, target: tgtNid, relation: "imports",
          confidence: "EXTRACTED", source_file: strPath,
          source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
        });
      }
      break;
    }
  }
}

function _importPhp(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  for (const child of node.children) {
    if (["qualified_name", "name", "identifier"].includes(child.type)) {
      const raw = _readText(child, source);
      const moduleName = raw.split("\\").pop()!.trim();
      if (moduleName) {
        const tgtNid = _makeId(moduleName);
        edges.push({
          source: fileNid, target: tgtNid, relation: "imports",
          confidence: "EXTRACTED", source_file: strPath,
          source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
        });
      }
      break;
    }
  }
}

function _importLua(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  const text = _readText(node, source);
  const m = text.match(/require\s*[('"]?\s*['"]?([^'")\s]+)/);
  if (m) {
    const moduleName = m[1]!.split(".").pop()!;
    if (moduleName) {
      edges.push({
        source: fileNid, target: moduleName, relation: "imports",
        confidence: "EXTRACTED", source_file: strPath,
        source_location: String(node.startPosition.row + 1), weight: 1.0,
      });
    }
  }
}

function _importSwift(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  for (const child of node.children) {
    if (child.type === "identifier") {
      const raw = _readText(child, source);
      const tgtNid = _makeId(raw);
      edges.push({
        source: fileNid, target: tgtNid, relation: "imports",
        confidence: "EXTRACTED", source_file: strPath,
        source_location: `L${node.startPosition.row + 1}`, weight: 1.0,
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// C/C++ function name helpers
// ---------------------------------------------------------------------------

function _getCFuncName(node: SyntaxNode, source: string): string | null {
  if (node.type === "identifier") return _readText(node, source);
  const decl = node.childForFieldName("declarator");
  if (decl) return _getCFuncName(decl, source);
  for (const child of node.children) {
    if (child.type === "identifier") return _readText(child, source);
  }
  return null;
}

function _getCppFuncName(node: SyntaxNode, source: string): string | null {
  if (node.type === "identifier") return _readText(node, source);
  if (node.type === "qualified_identifier") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) return _readText(nameNode, source);
  }
  const decl = node.childForFieldName("declarator");
  if (decl) return _getCppFuncName(decl, source);
  for (const child of node.children) {
    if (child.type === "identifier") return _readText(child, source);
  }
  return null;
}

// ---------------------------------------------------------------------------
// JS/TS extra walk for arrow functions
// ---------------------------------------------------------------------------

function _jsExtraWalk(
  node: SyntaxNode, source: string, fileNid: string, stem: string, _strPath: string,
  _nodes: GraphNode[], _edges: GraphEdge[], _seenIds: Set<string>,
  functionBodies: Array<[string, SyntaxNode]>,
  _parentClassNid: string | null,
  addNodeFn: (nid: string, label: string, line: number) => void,
  addEdgeFn: (src: string, tgt: string, relation: string, line: number) => void,
): boolean {
  if (node.type === "lexical_declaration") {
    for (const child of node.children) {
      if (child.type === "variable_declarator") {
        const value = child.childForFieldName("value");
        if (value && value.type === "arrow_function") {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const funcName = _readText(nameNode, source);
            const line = child.startPosition.row + 1;
            const funcNid = _makeId(stem, funcName);
            addNodeFn(funcNid, `${funcName}()`, line);
            addEdgeFn(fileNid, funcNid, "contains", line);
            const body = value.childForFieldName("body");
            if (body) {
              functionBodies.push([funcNid, body]);
            }
          }
        }
      }
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// C# extra walk for namespace declarations
// ---------------------------------------------------------------------------

function _csharpExtraWalk(
  node: SyntaxNode, source: string, fileNid: string, stem: string, _strPath: string,
  _nodes: GraphNode[], _edges: GraphEdge[], _seenIds: Set<string>,
  _functionBodies: Array<[string, SyntaxNode]>,
  parentClassNid: string | null,
  addNodeFn: (nid: string, label: string, line: number) => void,
  addEdgeFn: (src: string, tgt: string, relation: string, line: number) => void,
  walkFn?: (node: SyntaxNode, parentClassNid: string | null) => void,
): boolean {
  if (node.type === "namespace_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const nsName = _readText(nameNode, source);
      const nsNid = _makeId(stem, nsName);
      const line = node.startPosition.row + 1;
      addNodeFn(nsNid, nsName, line);
      addEdgeFn(fileNid, nsNid, "contains", line);
    }
    const body = node.childForFieldName("body");
    if (body && walkFn) {
      for (const child of body.children) {
        walkFn(child, parentClassNid);
      }
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Swift extra walk for enum cases
// ---------------------------------------------------------------------------

function _swiftExtraWalk(
  node: SyntaxNode, source: string, _fileNid: string, _stem: string, _strPath: string,
  _nodes: GraphNode[], _edges: GraphEdge[], _seenIds: Set<string>,
  _functionBodies: Array<[string, SyntaxNode]>,
  parentClassNid: string | null,
  addNodeFn: (nid: string, label: string, line: number) => void,
  addEdgeFn: (src: string, tgt: string, relation: string, line: number) => void,
): boolean {
  if (node.type === "enum_entry" && parentClassNid) {
    for (const child of node.children) {
      if (child.type === "simple_identifier") {
        const caseName = _readText(child, source);
        const caseNid = _makeId(parentClassNid, caseName);
        const line = node.startPosition.row + 1;
        addNodeFn(caseNid, caseName, line);
        addEdgeFn(parentClassNid, caseNid, "case_of", line);
      }
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Language configs
// ---------------------------------------------------------------------------

const _PYTHON_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "python",
  tsModule: "tree_sitter_python",
  classTypes: new Set(["class_definition"]),
  functionTypes: new Set(["function_definition"]),
  importTypes: new Set(["import_statement", "import_from_statement"]),
  callTypes: new Set(["call"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["attribute"]),
  callAccessorField: "attribute",
  functionBoundaryTypes: new Set(["function_definition"]),
  importHandler: _importPython,
});

const _JS_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "javascript",
  tsModule: "tree_sitter_javascript",
  classTypes: new Set(["class_declaration"]),
  functionTypes: new Set(["function_declaration", "method_definition"]),
  importTypes: new Set(["import_statement"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["member_expression"]),
  callAccessorField: "property",
  functionBoundaryTypes: new Set(["function_declaration", "arrow_function", "method_definition"]),
  importHandler: _importJs,
});

const _TS_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "typescript",
  tsModule: "tree_sitter_typescript",
  classTypes: new Set(["class_declaration"]),
  functionTypes: new Set(["function_declaration", "method_definition"]),
  importTypes: new Set(["import_statement"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["member_expression"]),
  callAccessorField: "property",
  functionBoundaryTypes: new Set(["function_declaration", "arrow_function", "method_definition"]),
  importHandler: _importJs,
});

const _JAVA_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "java",
  tsModule: "tree_sitter_java",
  classTypes: new Set(["class_declaration", "interface_declaration"]),
  functionTypes: new Set(["method_declaration", "constructor_declaration"]),
  importTypes: new Set(["import_declaration"]),
  callTypes: new Set(["method_invocation"]),
  callFunctionField: "name",
  callAccessorNodeTypes: new Set(),
  functionBoundaryTypes: new Set(["method_declaration", "constructor_declaration"]),
  importHandler: _importJava,
});

const _C_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "c",
  tsModule: "tree_sitter_c",
  classTypes: new Set(),
  functionTypes: new Set(["function_definition"]),
  importTypes: new Set(["preproc_include"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["field_expression"]),
  callAccessorField: "field",
  functionBoundaryTypes: new Set(["function_definition"]),
  importHandler: _importC,
  resolveFunctionNameFn: _getCFuncName,
});

const _CPP_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "cpp",
  tsModule: "tree_sitter_cpp",
  classTypes: new Set(["class_specifier"]),
  functionTypes: new Set(["function_definition"]),
  importTypes: new Set(["preproc_include"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["field_expression", "qualified_identifier"]),
  callAccessorField: "field",
  functionBoundaryTypes: new Set(["function_definition"]),
  importHandler: _importC,
  resolveFunctionNameFn: _getCppFuncName,
});

const _RUBY_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "ruby",
  tsModule: "tree_sitter_ruby",
  classTypes: new Set(["class"]),
  functionTypes: new Set(["method", "singleton_method"]),
  importTypes: new Set(),
  callTypes: new Set(["call"]),
  callFunctionField: "method",
  callAccessorNodeTypes: new Set(),
  nameFallbackChildTypes: ["constant", "scope_resolution", "identifier"],
  bodyFallbackChildTypes: ["body_statement"],
  functionBoundaryTypes: new Set(["method", "singleton_method"]),
});

const _CSHARP_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "c_sharp",
  tsModule: "tree_sitter_c_sharp",
  classTypes: new Set(["class_declaration", "interface_declaration"]),
  functionTypes: new Set(["method_declaration"]),
  importTypes: new Set(["using_directive"]),
  callTypes: new Set(["invocation_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["member_access_expression"]),
  callAccessorField: "name",
  bodyFallbackChildTypes: ["declaration_list"],
  functionBoundaryTypes: new Set(["method_declaration"]),
  importHandler: _importCsharp,
});

const _KOTLIN_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "kotlin",
  tsModule: "tree_sitter_kotlin",
  classTypes: new Set(["class_declaration", "object_declaration"]),
  functionTypes: new Set(["function_declaration"]),
  importTypes: new Set(["import_header"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "",
  callAccessorNodeTypes: new Set(["navigation_expression"]),
  callAccessorField: "",
  nameFallbackChildTypes: ["simple_identifier"],
  bodyFallbackChildTypes: ["function_body", "class_body"],
  functionBoundaryTypes: new Set(["function_declaration"]),
  importHandler: _importKotlin,
});

const _SCALA_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "scala",
  tsModule: "tree_sitter_scala",
  classTypes: new Set(["class_definition", "object_definition"]),
  functionTypes: new Set(["function_definition"]),
  importTypes: new Set(["import_declaration"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "",
  callAccessorNodeTypes: new Set(["field_expression"]),
  callAccessorField: "field",
  nameFallbackChildTypes: ["identifier"],
  bodyFallbackChildTypes: ["template_body"],
  functionBoundaryTypes: new Set(["function_definition"]),
  importHandler: _importScala,
});

const _PHP_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "php",
  tsModule: "tree_sitter_php",
  classTypes: new Set(["class_declaration"]),
  functionTypes: new Set(["function_definition", "method_declaration"]),
  importTypes: new Set(["namespace_use_clause"]),
  callTypes: new Set(["function_call_expression", "member_call_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["member_call_expression"]),
  callAccessorField: "name",
  nameFallbackChildTypes: ["name"],
  bodyFallbackChildTypes: ["declaration_list", "compound_statement"],
  functionBoundaryTypes: new Set(["function_definition", "method_declaration"]),
  importHandler: _importPhp,
});

const _LUA_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "lua",
  tsModule: "tree_sitter_lua",
  classTypes: new Set(),
  functionTypes: new Set(["function_declaration"]),
  importTypes: new Set(["variable_declaration"]),
  callTypes: new Set(["function_call"]),
  callFunctionField: "name",
  callAccessorNodeTypes: new Set(["method_index_expression"]),
  callAccessorField: "name",
  nameFallbackChildTypes: ["identifier", "method_index_expression"],
  bodyFallbackChildTypes: ["block"],
  functionBoundaryTypes: new Set(["function_declaration"]),
  importHandler: _importLua,
});

const _SWIFT_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "swift",
  tsModule: "tree_sitter_swift",
  classTypes: new Set(["class_declaration", "protocol_declaration"]),
  functionTypes: new Set(["function_declaration", "init_declaration", "deinit_declaration", "subscript_declaration"]),
  importTypes: new Set(["import_declaration"]),
  callTypes: new Set(["call_expression"]),
  callFunctionField: "",
  callAccessorNodeTypes: new Set(["navigation_expression"]),
  callAccessorField: "",
  nameFallbackChildTypes: ["simple_identifier", "type_identifier", "user_type"],
  bodyFallbackChildTypes: ["class_body", "protocol_body", "function_body", "enum_class_body"],
  functionBoundaryTypes: new Set(["function_declaration", "init_declaration", "deinit_declaration", "subscript_declaration"]),
  importHandler: _importSwift,
});

// ---------------------------------------------------------------------------
// Generic extractor
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  error?: string;
}

async function _extractGeneric(
  filePath: string,
  config: LanguageConfig,
  rootDir: string = dirname(resolve(filePath)),
): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage(config.tsGrammarName);
  if (!lang) {
    return { nodes: [], edges: [], error: `Grammar not found for ${config.tsGrammarName}` };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({
        id: nid, label, file_type: "code",
        source_file: strPath, source_location: `L${line}`,
      });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({
      source: src, target: tgt, relation,
      confidence, source_file: strPath,
      source_location: `L${line}`, weight,
    });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function walk(node: SyntaxNode, parentClassNid: string | null = null): void {
    const t = node.type;

    // Import types
    if (config.importTypes.has(t)) {
      if (config.importHandler) {
        config.importHandler(node, source, fileNid, stem, edges, strPath);
      }
      return;
    }

    // Class types
    if (config.classTypes.has(t)) {
      let nameNode = node.childForFieldName(config.nameField);
      if (!nameNode) {
        for (const child of node.children) {
          if (config.nameFallbackChildTypes.includes(child.type)) {
            nameNode = child;
            break;
          }
        }
      }
      if (!nameNode) return;
      const className = _readText(nameNode, source);
      const classNid = _makeId(stem, className);
      const line = node.startPosition.row + 1;
      addNode(classNid, className, line);
      addEdge(fileNid, classNid, "contains", line);

      // Python-specific: inheritance
      if (config.tsModule === "tree_sitter_python") {
        const args = node.childForFieldName("superclasses");
        if (args) {
          for (const arg of args.children) {
            if (arg.type === "identifier") {
              const base = _readText(arg, source);
              let baseNid = _makeId(stem, base);
              if (!seenIds.has(baseNid)) {
                baseNid = _makeId(base);
                if (!seenIds.has(baseNid)) {
                  nodes.push({
                    id: baseNid, label: base, file_type: "code",
                    source_file: "", source_location: "",
                  });
                  seenIds.add(baseNid);
                }
              }
              addEdge(classNid, baseNid, "inherits", line);
            }
          }
        }
      }

      // Swift-specific: conformance / inheritance
      if (config.tsModule === "tree_sitter_swift") {
        for (const child of node.children) {
          if (child.type === "inheritance_specifier") {
            for (const sub of child.children) {
              if (sub.type === "user_type" || sub.type === "type_identifier") {
                const base = _readText(sub, source);
                let baseNid = _makeId(stem, base);
                if (!seenIds.has(baseNid)) {
                  baseNid = _makeId(base);
                  if (!seenIds.has(baseNid)) {
                    nodes.push({
                      id: baseNid, label: base, file_type: "code",
                      source_file: "", source_location: "",
                    });
                    seenIds.add(baseNid);
                  }
                }
                addEdge(classNid, baseNid, "inherits", line);
              }
            }
          }
        }
      }

      // C#-specific: inheritance / interface implementation via base_list
      if (config.tsModule === "tree_sitter_c_sharp") {
        for (const child of node.children) {
          if (child.type === "base_list") {
            for (const sub of child.children) {
              if (sub.type === "identifier" || sub.type === "generic_name") {
                let base: string;
                if (sub.type === "generic_name") {
                  const nameChild = sub.childForFieldName("name");
                  base = nameChild ? _readText(nameChild, source) : _readText(sub.children[0]!, source);
                } else {
                  base = _readText(sub, source);
                }
                let baseNid = _makeId(stem, base);
                if (!seenIds.has(baseNid)) {
                  baseNid = _makeId(base);
                  if (!seenIds.has(baseNid)) {
                    nodes.push({
                      id: baseNid, label: base, file_type: "code",
                      source_file: "", source_location: "",
                    });
                    seenIds.add(baseNid);
                  }
                }
                addEdge(classNid, baseNid, "inherits", line);
              }
            }
          }
        }
      }

      // Java-specific: superclass / interface inheritance and implementation.
      if (config.tsModule === "tree_sitter_java") {
        const emitJavaParent = (baseName: string, relation: string): void => {
          if (!baseName) return;
          let baseNid = _makeId(stem, baseName);
          if (!seenIds.has(baseNid)) {
            baseNid = _makeId(baseName);
            if (!seenIds.has(baseNid)) {
              nodes.push({
                id: baseNid, label: baseName, file_type: "code",
                source_file: "", source_location: "",
              });
              seenIds.add(baseNid);
            }
          }
          addEdge(classNid, baseNid, relation, line);
        };

        const collectJavaTypeNames = (node: SyntaxNode, out: Set<string>): void => {
          if (node.type === "type_identifier" || node.type === "identifier") {
            out.add(_readText(node, source));
            return;
          }
          for (const child of node.children) {
            collectJavaTypeNames(child, out);
          }
        };

        const superclass = node.childForFieldName("superclass");
        if (superclass) {
          const names = new Set<string>();
          collectJavaTypeNames(superclass, names);
          for (const baseName of names) {
            emitJavaParent(baseName, "inherits");
            break;
          }
        }

        const interfaces = node.childForFieldName("interfaces");
        if (interfaces) {
          const names = new Set<string>();
          collectJavaTypeNames(interfaces, names);
          for (const baseName of names) emitJavaParent(baseName, "implements");
        }

        if (t === "interface_declaration") {
          for (const child of node.children) {
            if (child.type !== "extends_interfaces" && child.type !== "super_interfaces") continue;
            const names = new Set<string>();
            collectJavaTypeNames(child, names);
            for (const baseName of names) emitJavaParent(baseName, "inherits");
          }
        }
      }

      // Find body and recurse
      const body = _findBody(node, config);
      if (body) {
        for (const child of body.children) {
          walk(child, classNid);
        }
      }
      return;
    }

    // Function types
    if (config.functionTypes.has(t)) {
      let funcName: string | null = null;

      // Swift deinit/subscript have no name field
      if (t === "deinit_declaration") {
        funcName = "deinit";
      } else if (t === "subscript_declaration") {
        funcName = "subscript";
      } else if (config.resolveFunctionNameFn !== null) {
        // C/C++ style: use declarator
        const declarator = node.childForFieldName("declarator");
        if (declarator) {
          funcName = config.resolveFunctionNameFn(declarator, source);
        }
      } else {
        let nameNode = node.childForFieldName(config.nameField);
        if (!nameNode) {
          for (const child of node.children) {
            if (config.nameFallbackChildTypes.includes(child.type)) {
              nameNode = child;
              break;
            }
          }
        }
        funcName = nameNode ? _readText(nameNode, source) : null;
      }

      if (!funcName) return;

      const line = node.startPosition.row + 1;
      let funcNid: string;
      if (parentClassNid) {
        funcNid = _makeId(parentClassNid, funcName);
        addNode(funcNid, `.${funcName}()`, line);
        addEdge(parentClassNid, funcNid, "method", line);
      } else {
        funcNid = _makeId(stem, funcName);
        addNode(funcNid, `${funcName}()`, line);
        addEdge(fileNid, funcNid, "contains", line);
      }

      const body = _findBody(node, config);
      if (body) {
        functionBodies.push([funcNid, body]);
      }
      return;
    }

    // JS/TS arrow functions
    if (config.tsModule === "tree_sitter_javascript" || config.tsModule === "tree_sitter_typescript") {
      if (t === "call_expression" && config.importHandler) {
        config.importHandler(node, source, fileNid, stem, edges, strPath);
      }
      if (_jsExtraWalk(node, source, fileNid, stem, strPath,
        nodes, edges, seenIds, functionBodies,
        parentClassNid, addNode, addEdge)) {
        return;
      }
    }

    // C# namespaces
    if (config.tsModule === "tree_sitter_c_sharp") {
      if (_csharpExtraWalk(node, source, fileNid, stem, strPath,
        nodes, edges, seenIds, functionBodies,
        parentClassNid, addNode, addEdge, walk)) {
        return;
      }
    }

    // Swift enum cases
    if (config.tsModule === "tree_sitter_swift") {
      if (_swiftExtraWalk(node, source, fileNid, stem, strPath,
        nodes, edges, seenIds, functionBodies,
        parentClassNid, addNode, addEdge)) {
        return;
      }
    }

    // Default: recurse
    for (const child of node.children) {
      walk(child, null);
    }
  }

  walk(root);

  if (config.tsModule === "tree_sitter_javascript" || config.tsModule === "tree_sitter_typescript") {
    function walkDynamicImports(node: SyntaxNode): void {
      if (node.type === "call_expression" && config.importHandler) {
        config.importHandler(node, source, fileNid, stem, edges, strPath);
      }
      for (const child of node.children) {
        walkDynamicImports(child);
      }
    }
    walkDynamicImports(root);
  }

  // -- Call-graph pass --
  const labelToNid = buildResolvableLabelIndex(nodes);

  const seenCallPairs = new Set<string>();

  function walkCalls(node: SyntaxNode, callerNid: string): void {
    if (config.functionBoundaryTypes.has(node.type)) return;

    if (config.callTypes.has(node.type)) {
      let calleeName: string | null = null;

      // Special handling per language
      if (config.tsModule === "tree_sitter_swift") {
        const first = node.children[0] ?? null;
        if (first) {
          if (first.type === "simple_identifier") {
            calleeName = _readText(first, source);
          } else if (first.type === "navigation_expression") {
            for (const child of first.children) {
              if (child.type === "navigation_suffix") {
                for (const sc of child.children) {
                  if (sc.type === "simple_identifier") {
                    calleeName = _readText(sc, source);
                  }
                }
              }
            }
          }
        }
      } else if (config.tsModule === "tree_sitter_kotlin") {
        const first = node.children[0] ?? null;
        if (first) {
          if (first.type === "simple_identifier") {
            calleeName = _readText(first, source);
          } else if (first.type === "navigation_expression") {
            for (let i = first.children.length - 1; i >= 0; i--) {
              if (first.children[i]!.type === "simple_identifier") {
                calleeName = _readText(first.children[i]!, source);
                break;
              }
            }
          }
        }
      } else if (config.tsModule === "tree_sitter_scala") {
        const first = node.children[0] ?? null;
        if (first) {
          if (first.type === "identifier") {
            calleeName = _readText(first, source);
          } else if (first.type === "field_expression") {
            const field = first.childForFieldName("field");
            if (field) {
              calleeName = _readText(field, source);
            } else {
              for (let i = first.children.length - 1; i >= 0; i--) {
                if (first.children[i]!.type === "identifier") {
                  calleeName = _readText(first.children[i]!, source);
                  break;
                }
              }
            }
          }
        }
      } else if (config.tsModule === "tree_sitter_c_sharp" && node.type === "invocation_expression") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          calleeName = _readText(nameNode, source);
        } else {
          for (const child of node.children) {
            if (child.isNamed) {
              const raw = _readText(child, source);
              if (raw.includes(".")) {
                calleeName = raw.split(".").pop()!;
              } else {
                calleeName = raw;
              }
              break;
            }
          }
        }
      } else if (config.tsModule === "tree_sitter_php") {
        if (node.type === "function_call_expression") {
          const funcNode = node.childForFieldName("function");
          if (funcNode) calleeName = _readText(funcNode, source);
        } else {
          const nameNode = node.childForFieldName("name");
          if (nameNode) calleeName = _readText(nameNode, source);
        }
      } else if (config.tsModule === "tree_sitter_cpp") {
        const funcNode = config.callFunctionField ? node.childForFieldName(config.callFunctionField) : null;
        if (funcNode) {
          if (funcNode.type === "identifier") {
            calleeName = _readText(funcNode, source);
          } else if (funcNode.type === "field_expression" || funcNode.type === "qualified_identifier") {
            const name = funcNode.childForFieldName("field") ?? funcNode.childForFieldName("name");
            if (name) calleeName = _readText(name, source);
          }
        }
      } else {
        // Generic: get callee from callFunctionField
        const funcNode = config.callFunctionField ? node.childForFieldName(config.callFunctionField) : null;
        if (funcNode) {
          if (funcNode.type === "identifier") {
            calleeName = _readText(funcNode, source);
          } else if (config.callAccessorNodeTypes.has(funcNode.type)) {
            if (config.callAccessorField) {
              const attr = funcNode.childForFieldName(config.callAccessorField);
              if (attr) calleeName = _readText(attr, source);
            }
          } else {
            // Try reading the node directly (e.g. Java name field is the callee)
            calleeName = _readText(funcNode, source);
          }
        }
      }

      if (calleeName) {
        const tgtNid = labelToNid.get(calleeName.toLowerCase());
        if (tgtNid && tgtNid !== callerNid) {
          const pair = `${callerNid}|${tgtNid}`;
          if (!seenCallPairs.has(pair)) {
            seenCallPairs.add(pair);
            const line = node.startPosition.row + 1;
            edges.push({
              source: callerNid, target: tgtNid, relation: "calls",
              confidence: "EXTRACTED", source_file: strPath,
              source_location: `L${line}`, weight: 1.0,
            });
          }
        }
      }
    }

    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  for (const [callerNid, bodyNode] of functionBodies) {
    walkCalls(bodyNode, callerNid);
  }

  // -- Clean edges --
  const validIds = seenIds;
  const cleanEdges = edges.filter((edge) => {
    const src = edge.source;
    const tgt = edge.target;
    return validIds.has(src) && (validIds.has(tgt) || edge.relation === "imports" || edge.relation === "imports_from");
  });

  return { nodes, edges: cleanEdges };
}

// ---------------------------------------------------------------------------
// Python rationale extraction
// ---------------------------------------------------------------------------

const _RATIONALE_PREFIXES = [
  "# NOTE:", "# IMPORTANT:", "# HACK:", "# WHY:",
  "# RATIONALE:", "# TODO:", "# FIXME:",
];

async function _extractPythonRationale(
  filePath: string,
  result: ExtractionResult,
  rootDir: string = dirname(resolve(filePath)),
): Promise<void> {
  await ensureParserInit();
  const lang = await loadLanguage("python");
  if (!lang) return;

  let source: string;
  let root: SyntaxNode;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    const tree = parseText(parser, source);
    root = tree.rootNode;
  } catch {
    return;
  }

  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const { nodes, edges } = result;
  const seenIds = new Set(nodes.map((n) => n.id));
  const fileNid = _makeId(stem);

  function getDocstring(bodyNode: SyntaxNode | null): [string, number] | null {
    if (!bodyNode) return null;
    for (const child of bodyNode.children) {
      if (child.type === "expression_statement") {
        for (const sub of child.children) {
          if (sub.type === "string" || sub.type === "concatenated_string") {
            let text = source.slice(sub.startIndex, sub.endIndex);
            text = text.replace(/^["']+|["']+$/g, "").replace(/^"""+|"""+$/g, "").replace(/^'''+|'''+$/g, "").trim();
            if (text.length > 20) {
              return [text, child.startPosition.row + 1];
            }
          }
        }
      }
      break;
    }
    return null;
  }

  function addRationale(text: string, line: number, parentNid: string): void {
    const label = text.slice(0, 80).replace(/\n/g, " ").trim();
    const rid = _makeId(stem, "rationale", String(line));
    if (!seenIds.has(rid)) {
      seenIds.add(rid);
      nodes.push({
        id: rid, label, file_type: "rationale" as GraphNode["file_type"],
        source_file: strPath, source_location: `L${line}`,
      });
    }
    edges.push({
      source: rid, target: parentNid, relation: "rationale_for",
      confidence: "EXTRACTED", source_file: strPath,
      source_location: `L${line}`, weight: 1.0,
    });
  }

  // Module-level docstring
  const ds = getDocstring(root);
  if (ds) addRationale(ds[0], ds[1], fileNid);

  // Class and function docstrings
  function walkDocstrings(node: SyntaxNode, parentNid: string): void {
    const t = node.type;
    if (t === "class_definition") {
      const nameNode = node.childForFieldName("name");
      const body = node.childForFieldName("body");
      if (nameNode && body) {
        const className = source.slice(nameNode.startIndex, nameNode.endIndex);
        const nid = _makeId(stem, className);
        const classDs = getDocstring(body);
        if (classDs) addRationale(classDs[0], classDs[1], nid);
        for (const child of body.children) {
          walkDocstrings(child, nid);
        }
      }
      return;
    }
    if (t === "function_definition") {
      const nameNode = node.childForFieldName("name");
      const body = node.childForFieldName("body");
      if (nameNode && body) {
        const funcName = source.slice(nameNode.startIndex, nameNode.endIndex);
        const nid = parentNid !== fileNid ? _makeId(parentNid, funcName) : _makeId(stem, funcName);
        const funcDs = getDocstring(body);
        if (funcDs) addRationale(funcDs[0], funcDs[1], nid);
      }
      return;
    }
    for (const child of node.children) {
      walkDocstrings(child, parentNid);
    }
  }

  walkDocstrings(root, fileNid);

  // Rationale comments
  const lines = source.split("\n");
  for (let lineno = 0; lineno < lines.length; lineno++) {
    const stripped = lines[lineno]!.trim();
    if (_RATIONALE_PREFIXES.some((p) => stripped.startsWith(p))) {
      addRationale(stripped, lineno + 1, fileNid);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API: per-language extractors
// ---------------------------------------------------------------------------

export async function extractPython(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  const result = await _extractGeneric(filePath, _PYTHON_CONFIG, rootDir);
  if (!result.error) {
    await _extractPythonRationale(filePath, result, rootDir);
  }
  return result;
}

export async function extractJs(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  const ext = extname(filePath);
  const config = (ext === ".ts" || ext === ".tsx") ? _TS_CONFIG : _JS_CONFIG;
  return _extractGeneric(filePath, config, rootDir);
}

export async function extractJava(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _JAVA_CONFIG, rootDir);
}

export async function extractC(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _C_CONFIG, rootDir);
}

export async function extractCpp(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _CPP_CONFIG, rootDir);
}

export async function extractRuby(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _RUBY_CONFIG, rootDir);
}

export async function extractCsharp(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _CSHARP_CONFIG, rootDir);
}

export async function extractKotlin(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _KOTLIN_CONFIG, rootDir);
}

export async function extractScala(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _SCALA_CONFIG, rootDir);
}

export async function extractPhp(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _PHP_CONFIG, rootDir);
}

export async function extractLua(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _LUA_CONFIG, rootDir);
}

export async function extractSwift(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return _extractGeneric(filePath, _SWIFT_CONFIG, rootDir);
}

// ---------------------------------------------------------------------------
// Julia extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractJulia(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("julia");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-julia not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function funcNameFromSignature(sigNode: SyntaxNode): string | null {
    for (const child of sigNode.children) {
      if (child.type === "call_expression") {
        const callee = child.children[0] ?? null;
        if (callee && callee.type === "identifier") {
          return _readText(callee, source);
        }
      }
    }
    return null;
  }

  function walkCalls(bodyNode: SyntaxNode, funcNid: string): void {
    if (!bodyNode) return;
    const t = bodyNode.type;
    if (t === "function_definition" || t === "short_function_definition") return;
    if (t === "call_expression" && bodyNode.children.length > 0) {
      const callee = bodyNode.children[0]!;
      if (callee.type === "identifier") {
        const calleeName = _readText(callee, source);
        const targetNid = _makeId(stem, calleeName);
        addEdge(funcNid, targetNid, "calls", bodyNode.startPosition.row + 1, "EXTRACTED");
      } else if (callee.type === "field_expression" && callee.children.length >= 3) {
        const methodNode = callee.children[callee.children.length - 1]!;
        const methodName = _readText(methodNode, source);
        const targetNid = _makeId(stem, methodName);
        addEdge(funcNid, targetNid, "calls", bodyNode.startPosition.row + 1, "EXTRACTED");
      }
    }
    for (const child of bodyNode.children) {
      walkCalls(child, funcNid);
    }
  }

  function walk(node: SyntaxNode, scopeNid: string): void {
    const t = node.type;

    // Module
    if (t === "module_definition") {
      const nameNode = node.children.find((c) => c.type === "identifier") ?? null;
      if (nameNode) {
        const modName = _readText(nameNode, source);
        const modNid = _makeId(stem, modName);
        const line = node.startPosition.row + 1;
        addNode(modNid, modName, line);
        addEdge(fileNid, modNid, "defines", line);
        for (const child of node.children) {
          walk(child, modNid);
        }
      }
      return;
    }

    // Struct
    if (t === "struct_definition") {
      const typeHead = node.children.find((c) => c.type === "type_head") ?? null;
      if (typeHead) {
        const binExpr = typeHead.children.find((c) => c.type === "binary_expression") ?? null;
        if (binExpr) {
          const identifiers = binExpr.children.filter((c) => c.type === "identifier");
          if (identifiers.length > 0) {
            const structName = _readText(identifiers[0]!, source);
            const structNid = _makeId(stem, structName);
            const line = node.startPosition.row + 1;
            addNode(structNid, structName, line);
            addEdge(scopeNid, structNid, "defines", line);
            if (identifiers.length >= 2) {
              const superName = _readText(identifiers[identifiers.length - 1]!, source);
              addEdge(structNid, _makeId(stem, superName), "inherits", line, "EXTRACTED");
            }
          }
        } else {
          const nameNode = typeHead.children.find((c) => c.type === "identifier") ?? null;
          if (nameNode) {
            const structName = _readText(nameNode, source);
            const structNid = _makeId(stem, structName);
            const line = node.startPosition.row + 1;
            addNode(structNid, structName, line);
            addEdge(scopeNid, structNid, "defines", line);
          }
        }
      }
      return;
    }

    // Abstract type
    if (t === "abstract_definition") {
      const typeHead = node.children.find((c) => c.type === "type_head") ?? null;
      if (typeHead) {
        const nameNode = typeHead.children.find((c) => c.type === "identifier") ?? null;
        if (nameNode) {
          const absName = _readText(nameNode, source);
          const absNid = _makeId(stem, absName);
          const line = node.startPosition.row + 1;
          addNode(absNid, absName, line);
          addEdge(scopeNid, absNid, "defines", line);
        }
      }
      return;
    }

    // Function: function foo(...) ... end
    if (t === "function_definition") {
      const sigNode = node.children.find((c) => c.type === "signature") ?? null;
      if (sigNode) {
        const funcName = funcNameFromSignature(sigNode);
        if (funcName) {
          const funcNid = _makeId(stem, funcName);
          const line = node.startPosition.row + 1;
          addNode(funcNid, `${funcName}()`, line);
          addEdge(scopeNid, funcNid, "defines", line);
          functionBodies.push([funcNid, node]);
        }
      }
      return;
    }

    // Short function: foo(x) = expr
    if (t === "assignment") {
      const lhs = node.children[0] ?? null;
      if (lhs && lhs.type === "call_expression" && lhs.children.length > 0) {
        const callee = lhs.children[0]!;
        if (callee.type === "identifier") {
          const funcName = _readText(callee, source);
          const funcNid = _makeId(stem, funcName);
          const line = node.startPosition.row + 1;
          addNode(funcNid, `${funcName}()`, line);
          addEdge(scopeNid, funcNid, "defines", line);
          const rhs = node.children.length >= 3 ? node.children[node.children.length - 1]! : null;
          if (rhs) {
            functionBodies.push([funcNid, rhs]);
          }
        }
      }
      return;
    }

    // Using / Import
    if (t === "using_statement" || t === "import_statement") {
      const line = node.startPosition.row + 1;
      for (const child of node.children) {
        if (child.type === "identifier") {
          const modName = _readText(child, source);
          const impNid = _makeId(modName);
          addNode(impNid, modName, line);
          addEdge(scopeNid, impNid, "imports", line);
        } else if (child.type === "selected_import") {
          const identifiers = child.children.filter((c) => c.type === "identifier");
          if (identifiers.length > 0) {
            const pkgName = _readText(identifiers[0]!, source);
            const pkgNid = _makeId(pkgName);
            addNode(pkgNid, pkgName, line);
            addEdge(scopeNid, pkgNid, "imports", line);
          }
        }
      }
      return;
    }

    for (const child of node.children) {
      walk(child, scopeNid);
    }
  }

  walk(root, fileNid);

  for (const [funcNid, bodyNode] of functionBodies) {
    if (bodyNode.type === "function_definition") {
      for (const child of bodyNode.children) {
        if (child.type !== "signature") {
          walkCalls(child, funcNid);
        }
      }
    } else {
      walkCalls(bodyNode, funcNid);
    }
  }

  return { nodes, edges };
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

async function extractRegexBackedCode(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const stem = qualifiedFileStem(filePath, rootDir);
  const fileNid = _makeId(stem);
  const nodes: GraphNode[] = [{
    id: fileNid,
    label: basename(filePath),
    file_type: "code",
    source_file: filePath,
    source_location: "L1",
  }];
  const edges: GraphEdge[] = [];
  const seenIds = new Set([fileNid]);

  function addNode(name: string, label: string, relation: string, index: number): void {
    const nid = _makeId(stem, name);
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({
        id: nid,
        label,
        file_type: "code",
        source_file: filePath,
        source_location: `L${lineForIndex(source, index)}`,
      });
    }
    edges.push({
      source: fileNid,
      target: nid,
      relation,
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${lineForIndex(source, index)}`,
      weight: 1.0,
    });
  }

  const classPattern = /\bclass\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(classPattern)) {
    addNode(match[1]!, match[1]!, "contains", match.index ?? 0);
  }

  const functionPatterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\b(?:void|int|double|num|String|bool|dynamic|Future(?:<[^>]+>)?)\s+([A-Za-z_$][\w$]*)\s*\(/g,
  ];
  for (const pattern of functionPatterns) {
    for (const match of source.matchAll(pattern)) {
      addNode(match[1]!, `${match[1]!}()`, "contains", match.index ?? 0);
    }
  }

  const modulePattern = /\bmodule\s+([A-Za-z_$][\w$]*)\b/g;
  for (const match of source.matchAll(modulePattern)) {
    addNode(match[1]!, match[1]!, "contains", match.index ?? 0);
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Go extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractGo(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("go");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-go not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const pkgScope = dirname(filePath).split(sep).pop() || stem;
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function goImportNodeId(importPath: string): string {
    return _makeId("go_pkg", importPath);
  }

  function walk(node: SyntaxNode): void {
    const t = node.type;

    if (t === "function_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const funcName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        const funcNid = _makeId(stem, funcName);
        addNode(funcNid, `${funcName}()`, line);
        addEdge(fileNid, funcNid, "contains", line);
        const body = node.childForFieldName("body");
        if (body) functionBodies.push([funcNid, body]);
      }
      return;
    }

    if (t === "method_declaration") {
      const receiver = node.childForFieldName("receiver");
      let receiverType: string | null = null;
      if (receiver) {
        for (const param of receiver.children) {
          if (param.type === "parameter_declaration") {
            const typeNode = param.childForFieldName("type");
            if (typeNode) {
              receiverType = _readText(typeNode, source).replace(/^\*/, "").trim();
            }
            break;
          }
        }
      }
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const methodName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        let methodNid: string;
        if (receiverType) {
          const parentNid = _makeId(pkgScope, receiverType);
          addNode(parentNid, receiverType, line);
          methodNid = _makeId(parentNid, methodName);
          addNode(methodNid, `.${methodName}()`, line);
          addEdge(parentNid, methodNid, "method", line);
        } else {
          methodNid = _makeId(stem, methodName);
          addNode(methodNid, `${methodName}()`, line);
          addEdge(fileNid, methodNid, "contains", line);
        }
        const body = node.childForFieldName("body");
        if (body) functionBodies.push([methodNid, body]);
      }
      return;
    }

    if (t === "type_declaration") {
      for (const child of node.children) {
        if (child.type === "type_spec") {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const typeName = _readText(nameNode, source);
            const line = child.startPosition.row + 1;
            const typeNid = _makeId(pkgScope, typeName);
            addNode(typeNid, typeName, line);
            addEdge(fileNid, typeNid, "contains", line);
          }
        }
      }
      return;
    }

    if (t === "import_declaration") {
      for (const child of node.children) {
        if (child.type === "import_spec_list") {
          for (const spec of child.children) {
            if (spec.type === "import_spec") {
              const pathNode = spec.childForFieldName("path");
              if (pathNode) {
                const raw = _readText(pathNode, source).replace(/^"|"$/g, "");
                const tgtNid = goImportNodeId(raw);
                addEdge(fileNid, tgtNid, "imports_from", spec.startPosition.row + 1);
              }
            }
          }
        } else if (child.type === "import_spec") {
          const pathNode = child.childForFieldName("path");
          if (pathNode) {
            const raw = _readText(pathNode, source).replace(/^"|"$/g, "");
            const tgtNid = goImportNodeId(raw);
            addEdge(fileNid, tgtNid, "imports_from", child.startPosition.row + 1);
          }
        }
      }
      return;
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);

  // Call-graph pass
  const labelToNid = buildResolvableLabelIndex(nodes);

  const seenCallPairs = new Set<string>();

  function walkCalls(node: SyntaxNode, callerNid: string): void {
    if (node.type === "function_declaration" || node.type === "method_declaration") return;
    if (node.type === "call_expression") {
      const funcNode = node.childForFieldName("function");
      let calleeName: string | null = null;
      if (funcNode) {
        if (funcNode.type === "identifier") {
          calleeName = _readText(funcNode, source);
        } else if (funcNode.type === "selector_expression") {
          const field = funcNode.childForFieldName("field");
          if (field) calleeName = _readText(field, source);
        }
      }
      if (calleeName) {
        const tgtNid = labelToNid.get(calleeName.toLowerCase());
        if (tgtNid && tgtNid !== callerNid) {
          const pair = `${callerNid}|${tgtNid}`;
          if (!seenCallPairs.has(pair)) {
            seenCallPairs.add(pair);
            const line = node.startPosition.row + 1;
            edges.push({
              source: callerNid, target: tgtNid, relation: "calls",
              confidence: "EXTRACTED", source_file: strPath,
              source_location: `L${line}`, weight: 1.0,
            });
          }
        }
      }
    }
    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  for (const [callerNid, bodyNode] of functionBodies) {
    walkCalls(bodyNode, callerNid);
  }

  const cleanEdges = edges.filter((e) =>
    seenIds.has(e.source) && (seenIds.has(e.target) || e.relation === "imports" || e.relation === "imports_from"),
  );

  return { nodes, edges: cleanEdges };
}

// ---------------------------------------------------------------------------
// Rust extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractRust(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("rust");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-rust not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function walk(node: SyntaxNode, parentImplNid: string | null = null): void {
    const t = node.type;

    if (t === "function_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const funcName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        let funcNid: string;
        if (parentImplNid) {
          funcNid = _makeId(parentImplNid, funcName);
          addNode(funcNid, `.${funcName}()`, line);
          addEdge(parentImplNid, funcNid, "method", line);
        } else {
          funcNid = _makeId(stem, funcName);
          addNode(funcNid, `${funcName}()`, line);
          addEdge(fileNid, funcNid, "contains", line);
        }
        const body = node.childForFieldName("body");
        if (body) functionBodies.push([funcNid, body]);
      }
      return;
    }

    if (t === "struct_item" || t === "enum_item" || t === "trait_item") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const itemName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        const itemNid = _makeId(stem, itemName);
        addNode(itemNid, itemName, line);
        addEdge(fileNid, itemNid, "contains", line);
      }
      return;
    }

    if (t === "impl_item") {
      const typeNode = node.childForFieldName("type");
      let implNid: string | null = null;
      if (typeNode) {
        const typeName = _readText(typeNode, source).trim();
        implNid = _makeId(stem, typeName);
        addNode(implNid, typeName, node.startPosition.row + 1);
      }
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walk(child, implNid);
        }
      }
      return;
    }

    if (t === "use_declaration") {
      const arg = node.childForFieldName("argument");
      if (arg) {
        const raw = _readText(arg, source);
        const clean = raw.split("{")[0]!.replace(/:+$/, "").replace(/\*$/, "").replace(/:+$/, "");
        const moduleName = clean.split("::").pop()!.trim();
        if (moduleName) {
          const tgtNid = _makeId(moduleName);
          addEdge(fileNid, tgtNid, "imports_from", node.startPosition.row + 1);
        }
      }
      return;
    }

    for (const child of node.children) {
      walk(child, null);
    }
  }

  walk(root);

  // Call-graph pass
  const labelToNid = buildResolvableLabelIndex(nodes);

  const seenCallPairs = new Set<string>();

  function walkCalls(node: SyntaxNode, callerNid: string): void {
    if (node.type === "function_item") return;
    if (node.type === "call_expression") {
      const funcNode = node.childForFieldName("function");
      let calleeName: string | null = null;
      if (funcNode) {
        if (funcNode.type === "identifier") {
          calleeName = _readText(funcNode, source);
        } else if (funcNode.type === "field_expression") {
          const field = funcNode.childForFieldName("field");
          if (field) calleeName = _readText(field, source);
        } else if (funcNode.type === "scoped_identifier") {
          const name = funcNode.childForFieldName("name");
          if (name) calleeName = _readText(name, source);
        }
      }
      if (calleeName) {
        const tgtNid = labelToNid.get(calleeName.toLowerCase());
        if (tgtNid && tgtNid !== callerNid) {
          const pair = `${callerNid}|${tgtNid}`;
          if (!seenCallPairs.has(pair)) {
            seenCallPairs.add(pair);
            const line = node.startPosition.row + 1;
            edges.push({
              source: callerNid, target: tgtNid, relation: "calls",
              confidence: "EXTRACTED", source_file: strPath,
              source_location: `L${line}`, weight: 1.0,
            });
          }
        }
      }
    }
    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  for (const [callerNid, bodyNode] of functionBodies) {
    walkCalls(bodyNode, callerNid);
  }

  const cleanEdges = edges.filter((e) =>
    seenIds.has(e.source) && (seenIds.has(e.target) || e.relation === "imports" || e.relation === "imports_from"),
  );

  return { nodes, edges: cleanEdges };
}

// ---------------------------------------------------------------------------
// Zig extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractZig(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("zig");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-zig not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function extractImport(node: SyntaxNode): void {
    for (const child of node.children) {
      if (child.type === "builtin_function") {
        let bi: string | null = null;
        let args: SyntaxNode | null = null;
        for (const c of child.children) {
          if (c.type === "builtin_identifier") bi = _readText(c, source);
          else if (c.type === "arguments") args = c;
        }
        if ((bi === "@import" || bi === "@cImport") && args) {
          for (const arg of args.children) {
            if (arg.type === "string_literal" || arg.type === "string") {
              const raw = _readText(arg, source).replace(/^"|"$/g, "");
              const moduleName = raw.split("/").pop()!.split(".")[0]!;
              if (moduleName) {
                const tgtNid = _makeId(moduleName);
                addEdge(fileNid, tgtNid, "imports_from", node.startPosition.row + 1);
              }
              return;
            }
          }
        }
      } else if (child.type === "field_expression") {
        extractImport(child);
        return;
      }
    }
  }

  function walk(node: SyntaxNode, parentStructNid: string | null = null): void {
    const t = node.type;

    if (t === "function_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const funcName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        let funcNid: string;
        if (parentStructNid) {
          funcNid = _makeId(parentStructNid, funcName);
          addNode(funcNid, `.${funcName}()`, line);
          addEdge(parentStructNid, funcNid, "method", line);
        } else {
          funcNid = _makeId(stem, funcName);
          addNode(funcNid, `${funcName}()`, line);
          addEdge(fileNid, funcNid, "contains", line);
        }
        const body = node.childForFieldName("body");
        if (body) functionBodies.push([funcNid, body]);
      }
      return;
    }

    if (t === "variable_declaration") {
      let nameNode: SyntaxNode | null = null;
      let valueNode: SyntaxNode | null = null;
      for (const child of node.children) {
        if (child.type === "identifier") {
          nameNode = child;
        } else if (["struct_declaration", "enum_declaration", "union_declaration", "builtin_function", "field_expression"].includes(child.type)) {
          valueNode = child;
        }
      }

      if (valueNode && valueNode.type === "struct_declaration") {
        if (nameNode) {
          const structName = _readText(nameNode, source);
          const line = node.startPosition.row + 1;
          const structNid = _makeId(stem, structName);
          addNode(structNid, structName, line);
          addEdge(fileNid, structNid, "contains", line);
          for (const child of valueNode.children) {
            walk(child, structNid);
          }
        }
        return;
      }

      if (valueNode && (valueNode.type === "enum_declaration" || valueNode.type === "union_declaration")) {
        if (nameNode) {
          const typeName = _readText(nameNode, source);
          const line = node.startPosition.row + 1;
          const typeNid = _makeId(stem, typeName);
          addNode(typeNid, typeName, line);
          addEdge(fileNid, typeNid, "contains", line);
        }
        return;
      }

      if (valueNode && (valueNode.type === "builtin_function" || valueNode.type === "field_expression")) {
        extractImport(node);
      }
      return;
    }

    for (const child of node.children) {
      walk(child, parentStructNid);
    }
  }

  walk(root);

  // Call-graph pass
  const seenCallPairs = new Set<string>();

  function walkCalls(node: SyntaxNode, callerNid: string): void {
    if (node.type === "function_declaration") return;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn) {
        const callee = _readText(fn, source).split(".").pop()!;
        const tgtNid = nodes.find(
          (n) => n.label === `${callee}()` || n.label === `.${callee}()`,
        )?.id ?? null;
        if (tgtNid && tgtNid !== callerNid) {
          const pair = `${callerNid}|${tgtNid}`;
          if (!seenCallPairs.has(pair)) {
            seenCallPairs.add(pair);
            addEdge(callerNid, tgtNid, "calls", node.startPosition.row + 1, "EXTRACTED", 1.0);
          }
        }
      }
    }
    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  for (const [callerNid, bodyNode] of functionBodies) {
    walkCalls(bodyNode, callerNid);
  }

  const cleanEdges = edges.filter((e) =>
    seenIds.has(e.source) && (seenIds.has(e.target) || e.relation === "imports_from"),
  );

  return { nodes, edges: cleanEdges };
}

// ---------------------------------------------------------------------------
// PowerShell extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractPowershell(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("powershell");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-powershell not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  const _PS_SKIP = new Set([
    "using", "return", "if", "else", "elseif", "foreach", "for",
    "while", "do", "switch", "try", "catch", "finally", "throw",
    "break", "continue", "exit", "param", "begin", "process", "end",
  ]);

  function findScriptBlockBody(node: SyntaxNode): SyntaxNode | null {
    for (const child of node.children) {
      if (child.type === "script_block") {
        for (const sc of child.children) {
          if (sc.type === "script_block_body") return sc;
        }
        return child;
      }
    }
    return null;
  }

  function walk(node: SyntaxNode, parentClassNid: string | null = null): void {
    const t = node.type;

    if (t === "function_statement") {
      const nameNode = node.children.find((c) => c.type === "function_name") ?? null;
      if (nameNode) {
        const funcName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        const funcNid = _makeId(stem, funcName);
        addNode(funcNid, `${funcName}()`, line);
        addEdge(fileNid, funcNid, "contains", line);
        const body = findScriptBlockBody(node);
        if (body) functionBodies.push([funcNid, body]);
      }
      return;
    }

    if (t === "class_statement") {
      const nameNode = node.children.find((c) => c.type === "simple_name") ?? null;
      if (nameNode) {
        const className = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        const classNid = _makeId(stem, className);
        addNode(classNid, className, line);
        addEdge(fileNid, classNid, "contains", line);
        for (const child of node.children) {
          walk(child, classNid);
        }
      }
      return;
    }

    if (t === "class_method_definition") {
      const nameNode = node.children.find((c) => c.type === "simple_name") ?? null;
      if (nameNode) {
        const methodName = _readText(nameNode, source);
        const line = node.startPosition.row + 1;
        let methodNid: string;
        if (parentClassNid) {
          methodNid = _makeId(parentClassNid, methodName);
          addNode(methodNid, `.${methodName}()`, line);
          addEdge(parentClassNid, methodNid, "method", line);
        } else {
          methodNid = _makeId(stem, methodName);
          addNode(methodNid, `${methodName}()`, line);
          addEdge(fileNid, methodNid, "contains", line);
        }
        const body = findScriptBlockBody(node);
        if (body) functionBodies.push([methodNid, body]);
      }
      return;
    }

    if (t === "command") {
      const cmdNameNode = node.children.find((c) => c.type === "command_name") ?? null;
      if (cmdNameNode) {
        const cmdText = _readText(cmdNameNode, source).toLowerCase();
        if (cmdText === "using") {
          const tokens: string[] = [];
          for (const child of node.children) {
            if (child.type === "command_elements") {
              for (const el of child.children) {
                if (el.type === "generic_token") {
                  tokens.push(_readText(el, source));
                }
              }
            }
          }
          const moduleTokens = tokens.filter(
            (tk) => !["namespace", "module", "assembly"].includes(tk.toLowerCase()),
          );
          if (moduleTokens.length > 0) {
            const moduleName = moduleTokens[moduleTokens.length - 1]!.split(".").pop()!;
            addEdge(fileNid, _makeId(moduleName), "imports_from", node.startPosition.row + 1);
          }
        }
      }
      return;
    }

    for (const child of node.children) {
      walk(child, parentClassNid);
    }
  }

  walk(root);

  // Call-graph pass
  const labelToNid = buildResolvableLabelIndex(nodes);

  const seenCallPairs = new Set<string>();

  function walkCalls(node: SyntaxNode, callerNid: string): void {
    if (node.type === "function_statement" || node.type === "class_statement") return;
    if (node.type === "command") {
      const cmdNameNode = node.children.find((c) => c.type === "command_name") ?? null;
      if (cmdNameNode) {
        const cmdText = _readText(cmdNameNode, source);
        if (!_PS_SKIP.has(cmdText.toLowerCase())) {
          const tgtNid = labelToNid.get(cmdText.toLowerCase());
          if (tgtNid && tgtNid !== callerNid) {
            const pair = `${callerNid}|${tgtNid}`;
            if (!seenCallPairs.has(pair)) {
              seenCallPairs.add(pair);
              addEdge(callerNid, tgtNid, "calls", node.startPosition.row + 1, "EXTRACTED", 1.0);
            }
          }
        }
      }
    }
    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  for (const [callerNid, bodyNode] of functionBodies) {
    walkCalls(bodyNode, callerNid);
  }

  const cleanEdges = edges.filter((e) =>
    seenIds.has(e.source) && (seenIds.has(e.target) || e.relation === "imports_from"),
  );

  return { nodes, edges: cleanEdges };
}

// ---------------------------------------------------------------------------
// Objective-C extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractObjc(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("objc");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-objc not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const methodBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function _read(node: SyntaxNode): string {
    return source.slice(node.startIndex, node.endIndex);
  }

  function walk(node: SyntaxNode, parentNid: string | null = null): void {
    const t = node.type;
    const line = node.startPosition.row + 1;

    if (t === "preproc_include") {
      for (const child of node.children) {
        if (child.type === "system_lib_string") {
          const raw = _read(child).replace(/^[<>]+|[<>]+$/g, "");
          const module = raw.split("/").pop()!.replace(".h", "");
          if (module) {
            const tgtNid = _makeId(module);
            addEdge(fileNid, tgtNid, "imports", line);
          }
        } else if (child.type === "string_literal") {
          for (const sub of child.children) {
            if (sub.type === "string_content") {
              const raw = _read(sub);
              const module = raw.split("/").pop()!.replace(".h", "");
              if (module) {
                const tgtNid = _makeId(module);
                addEdge(fileNid, tgtNid, "imports", line);
              }
            }
          }
        }
      }
      return;
    }

    if (t === "class_interface") {
      const identifiers = node.children.filter((c) => c.type === "identifier");
      if (identifiers.length === 0) {
        for (const child of node.children) walk(child, parentNid);
        return;
      }
      const name = _read(identifiers[0]!);
      const clsNid = _makeId(stem, name);
      addNode(clsNid, name, line);
      addEdge(fileNid, clsNid, "contains", line);
      // superclass is second identifier after ':'
      let colonSeen = false;
      for (const child of node.children) {
        if (child.type === ":") {
          colonSeen = true;
        } else if (colonSeen && child.type === "identifier") {
          const superNid = _makeId(_read(child));
          addEdge(clsNid, superNid, "inherits", line);
          colonSeen = false;
        } else if (child.type === "parameterized_arguments") {
          for (const sub of child.children) {
            if (sub.type === "type_name") {
              for (const s of sub.children) {
                if (s.type === "type_identifier") {
                  const protoNid = _makeId(_read(s));
                  addEdge(clsNid, protoNid, "imports", line);
                }
              }
            }
          }
        } else if (child.type === "method_declaration") {
          walk(child, clsNid);
        }
      }
      return;
    }

    if (t === "class_implementation") {
      let name: string | null = null;
      for (const child of node.children) {
        if (child.type === "identifier") { name = _read(child); break; }
      }
      if (!name) {
        for (const child of node.children) walk(child, parentNid);
        return;
      }
      const implNid = _makeId(stem, name);
      if (!seenIds.has(implNid)) {
        addNode(implNid, name, line);
        addEdge(fileNid, implNid, "contains", line);
      }
      for (const child of node.children) {
        if (child.type === "implementation_definition") {
          for (const sub of child.children) walk(sub, implNid);
        }
      }
      return;
    }

    if (t === "protocol_declaration") {
      let name: string | null = null;
      for (const child of node.children) {
        if (child.type === "identifier") { name = _read(child); break; }
      }
      if (name) {
        const protoNid = _makeId(stem, name);
        addNode(protoNid, `<${name}>`, line);
        addEdge(fileNid, protoNid, "contains", line);
        for (const child of node.children) walk(child, protoNid);
      }
      return;
    }

    if (t === "method_declaration" || t === "method_definition") {
      const container = parentNid || fileNid;
      const parts: string[] = [];
      for (const child of node.children) {
        if (child.type === "identifier") {
          parts.push(_read(child));
        }
      }
      const methodName = parts.join("") || null;
      if (methodName) {
        const methodNid = _makeId(container, methodName);
        addNode(methodNid, `-${methodName}`, line);
        addEdge(container, methodNid, "method", line);
        if (t === "method_definition") {
          methodBodies.push([methodNid, node]);
        }
      }
      return;
    }

    for (const child of node.children) {
      walk(child, parentNid);
    }
  }

  walk(root);

  // Second pass: resolve calls inside method bodies
  const allMethodNids = new Set(nodes.filter((n) => n.id !== fileNid).map((n) => n.id));
  const seenCalls = new Set<string>();

  for (const [callerNid, bodyNode] of methodBodies) {
    function objcWalkCalls(n: SyntaxNode): void {
      if (n.type === "message_expression") {
        for (const child of n.children) {
          if (child.type === "selector" || child.type === "keyword_argument_list") {
            const sel: string[] = [];
            if (child.type === "selector") {
              sel.push(_read(child));
            } else {
              for (const sub of child.children) {
                if (sub.type === "keyword_argument") {
                  for (const s of sub.children) {
                    if (s.type === "selector") sel.push(_read(s));
                  }
                }
              }
            }
            const methodName = sel.join("");
            for (const candidate of allMethodNids) {
              if (candidate.endsWith(_makeId("", methodName).replace(/^_/, ""))) {
                const pair = `${callerNid}|${candidate}`;
                if (!seenCalls.has(pair) && callerNid !== candidate) {
                  seenCalls.add(pair);
                  addEdge(callerNid, candidate, "calls", bodyNode.startPosition.row + 1, "EXTRACTED", 1.0);
                }
              }
            }
          }
        }
      }
      for (const child of n.children) {
        objcWalkCalls(child);
      }
    }
    objcWalkCalls(bodyNode);
  }

  return { nodes, edges, error: undefined };
}

// ---------------------------------------------------------------------------
// Elixir extractor (custom walk)
// ---------------------------------------------------------------------------

export async function extractElixir(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  await ensureParserInit();
  const lang = await loadLanguage("elixir");
  if (!lang) {
    return { nodes: [], edges: [], error: "tree-sitter-elixir not available" };
  }

  let source: string;
  let tree: Tree;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    source = readFileSync(filePath, "utf-8");
    tree = parseText(parser, source);
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const root = tree.rootNode;
  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const functionBodies: Array<[string, SyntaxNode]> = [];

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
  ): void {
    edges.push({ source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight });
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  const _IMPORT_KEYWORDS = new Set(["alias", "import", "require", "use"]);

  function getAliasText(node: SyntaxNode): string | null {
    for (const child of node.children) {
      if (child.type === "alias") {
        return source.slice(child.startIndex, child.endIndex);
      }
    }
    return null;
  }

  function walk(node: SyntaxNode, parentModuleNid: string | null = null): void {
    if (node.type !== "call") {
      for (const child of node.children) walk(child, parentModuleNid);
      return;
    }

    let identifierNode: SyntaxNode | null = null;
    let argumentsNode: SyntaxNode | null = null;
    let doBlockNode: SyntaxNode | null = null;
    for (const child of node.children) {
      if (child.type === "identifier") identifierNode = child;
      else if (child.type === "arguments") argumentsNode = child;
      else if (child.type === "do_block") doBlockNode = child;
    }

    if (!identifierNode) {
      for (const child of node.children) walk(child, parentModuleNid);
      return;
    }

    const keyword = source.slice(identifierNode.startIndex, identifierNode.endIndex);
    const line = node.startPosition.row + 1;

    if (keyword === "defmodule") {
      const moduleName = argumentsNode ? getAliasText(argumentsNode) : null;
      if (!moduleName) return;
      const moduleNid = _makeId(stem, moduleName);
      addNode(moduleNid, moduleName, line);
      addEdge(fileNid, moduleNid, "contains", line);
      if (doBlockNode) {
        for (const child of doBlockNode.children) walk(child, moduleNid);
      }
      return;
    }

    if (keyword === "def" || keyword === "defp") {
      let funcName: string | null = null;
      if (argumentsNode) {
        for (const child of argumentsNode.children) {
          if (child.type === "call") {
            for (const sub of child.children) {
              if (sub.type === "identifier") {
                funcName = source.slice(sub.startIndex, sub.endIndex);
                break;
              }
            }
          } else if (child.type === "identifier") {
            funcName = source.slice(child.startIndex, child.endIndex);
            break;
          }
        }
      }
      if (!funcName) return;
      const container = parentModuleNid || fileNid;
      const funcNid = _makeId(container, funcName);
      addNode(funcNid, `${funcName}()`, line);
      if (parentModuleNid) {
        addEdge(parentModuleNid, funcNid, "method", line);
      } else {
        addEdge(fileNid, funcNid, "contains", line);
      }
      if (doBlockNode) {
        functionBodies.push([funcNid, doBlockNode]);
      }
      return;
    }

    if (_IMPORT_KEYWORDS.has(keyword) && argumentsNode) {
      const moduleName = getAliasText(argumentsNode);
      if (moduleName) {
        const tgtNid = _makeId(moduleName);
        addEdge(fileNid, tgtNid, "imports", line);
      }
      return;
    }

    for (const child of node.children) walk(child, parentModuleNid);
  }

  walk(root);

  // Call-graph pass
  const labelToNid = buildResolvableLabelIndex(nodes);

  const seenCallPairs = new Set<string>();
  const _SKIP_KEYWORDS = new Set([
    "def", "defp", "defmodule", "defmacro", "defmacrop",
    "defstruct", "defprotocol", "defimpl", "defguard",
    "alias", "import", "require", "use",
    "if", "unless", "case", "cond", "with", "for",
  ]);

  function walkCalls(node: SyntaxNode, callerNid: string): void {
    if (node.type !== "call") {
      for (const child of node.children) walkCalls(child, callerNid);
      return;
    }
    for (const child of node.children) {
      if (child.type === "identifier") {
        const kw = source.slice(child.startIndex, child.endIndex);
        if (_SKIP_KEYWORDS.has(kw)) {
          for (const c of node.children) walkCalls(c, callerNid);
          return;
        }
        break;
      }
    }
    let calleeName: string | null = null;
    for (const child of node.children) {
      if (child.type === "dot") {
        const dotText = source.slice(child.startIndex, child.endIndex);
        const parts = dotText.replace(/\.$/, "").split(".");
        if (parts.length > 0) calleeName = parts[parts.length - 1]!;
        break;
      }
      if (child.type === "identifier") {
        calleeName = source.slice(child.startIndex, child.endIndex);
        break;
      }
    }
    if (calleeName) {
      const tgtNid = labelToNid.get(calleeName.toLowerCase());
      if (tgtNid && tgtNid !== callerNid) {
        const pair = `${callerNid}|${tgtNid}`;
        if (!seenCallPairs.has(pair)) {
          seenCallPairs.add(pair);
          addEdge(callerNid, tgtNid, "calls", node.startPosition.row + 1, "EXTRACTED", 1.0);
        }
      }
    }
    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  for (const [callerNid, body] of functionBodies) {
    walkCalls(body, callerNid);
  }

  const cleanEdges = edges.filter((e) =>
    seenIds.has(e.source) && (seenIds.has(e.target) || e.relation === "imports"),
  );

  return { nodes, edges: cleanEdges, error: undefined };
}

// ---------------------------------------------------------------------------
// Cross-file import resolution (Python only)
// ---------------------------------------------------------------------------

async function _resolveCrossFileImports(
  perFile: ExtractionResult[],
  paths: string[],
): Promise<GraphEdge[]> {
  await ensureParserInit();
  const lang = await loadLanguage("python");
  if (!lang) return [];

  const parser = new Parser();
  parser.setLanguage(lang);
  const rootDir = inferCommonRoot(paths);

  // Pass 1: name -> node_id across all files
  const stemToEntities = new Map<string, Map<string, string>>();
  for (const fileResult of perFile) {
    for (const node of fileResult.nodes ?? []) {
      const src = node.source_file ?? "";
      if (!src) continue;
      const fileStem = basename(src, extname(src));
      const label = node.label ?? "";
      const nid = node.id ?? "";
      if (label && !label.endsWith(")") && !label.endsWith(".py") && !label.startsWith("_")) {
        if (!stemToEntities.has(fileStem)) stemToEntities.set(fileStem, new Map());
        stemToEntities.get(fileStem)!.set(label, nid);
      }
    }
  }

  // Pass 2
  const newEdges: GraphEdge[] = [];
  const stemToPath = new Map<string, string>();
  for (const p of paths) {
    stemToPath.set(basename(p, extname(p)), p);
  }

  for (let idx = 0; idx < perFile.length; idx++) {
    const fileResult = perFile[idx]!;
    const filePath = paths[idx]!;
      const fileStem = qualifiedFileStem(filePath, rootDir);
    const strPath = filePath;

    const localClasses = fileResult.nodes
      .filter((n) =>
        n.source_file === strPath &&
        !n.label.endsWith(")") &&
        !n.label.endsWith(".py") &&
        n.id !== _makeId(fileStem),
      )
      .map((n) => n.id);

    if (localClasses.length === 0) continue;

    let source: string;
    let tree: Tree;
    try {
      source = readFileSync(filePath, "utf-8");
      tree = parseText(parser, source);
    } catch {
      continue;
    }

    function walkImports(node: SyntaxNode): void {
      if (node.type === "import_from_statement") {
        let targetStem: string | null = null;
        for (const child of node.children) {
          if (child.type === "relative_import") {
            for (const sub of child.children) {
              if (sub.type === "dotted_name") {
                const raw = source.slice(sub.startIndex, sub.endIndex);
                targetStem = raw.split(".").pop()!;
                break;
              }
            }
            break;
          }
          if (child.type === "dotted_name" && targetStem === null) {
            const raw = source.slice(child.startIndex, child.endIndex);
            targetStem = raw.split(".").pop()!;
          }
        }

        if (!targetStem || !stemToEntities.has(targetStem)) return;

        const importedNames: string[] = [];
        let pastImportKw = false;
        for (const child of node.children) {
          if (child.type === "import") {
            pastImportKw = true;
            continue;
          }
          if (!pastImportKw) continue;
          if (child.type === "dotted_name") {
            importedNames.push(source.slice(child.startIndex, child.endIndex));
          } else if (child.type === "aliased_import") {
            const nameNode = child.childForFieldName("name");
            if (nameNode) {
              importedNames.push(source.slice(nameNode.startIndex, nameNode.endIndex));
            }
          }
        }

        const line = node.startPosition.row + 1;
        for (const name of importedNames) {
          const tgtNid = stemToEntities.get(targetStem)?.get(name);
          if (tgtNid) {
            for (const srcClassNid of localClasses) {
              newEdges.push({
                source: srcClassNid, target: tgtNid, relation: "uses",
                confidence: "INFERRED", source_file: strPath,
                source_location: `L${line}`, weight: 0.8,
              });
            }
          }
        }
      }
      for (const child of node.children) {
        walkImports(child);
      }
    }

    walkImports(tree.rootNode);
  }

  return newEdges;
}

// ---------------------------------------------------------------------------
// Main extract() and collectFiles()
// ---------------------------------------------------------------------------

type ExtractorFn = (filePath: string, rootDir?: string) => Promise<ExtractionResult>;

const _DISPATCH: Record<string, ExtractorFn> = {
  ".py": extractPython,
  ".js": extractJs,
  ".jsx": extractJs,
  ".mjs": extractJs,
  ".ts": extractJs,
  ".tsx": extractJs,
  ".vue": extractRegexBackedCode,
  ".svelte": extractRegexBackedCode,
  ".dart": extractRegexBackedCode,
  ".v": extractRegexBackedCode,
  ".sv": extractRegexBackedCode,
  ".ejs": extractRegexBackedCode,
  ".go": extractGo,
  ".rs": extractRust,
  ".java": extractJava,
  ".c": extractC,
  ".h": extractC,
  ".cpp": extractCpp,
  ".cc": extractCpp,
  ".cxx": extractCpp,
  ".hpp": extractCpp,
  ".rb": extractRuby,
  ".cs": extractCsharp,
  ".kt": extractKotlin,
  ".kts": extractKotlin,
  ".scala": extractScala,
  ".php": extractPhp,
  ".swift": extractSwift,
  ".lua": extractLua,
  ".toc": extractLua,
  ".zig": extractZig,
  ".ps1": extractPowershell,
  ".ex": extractElixir,
  ".exs": extractElixir,
  ".m": extractObjc,
  ".mm": extractObjc,
  ".jl": extractJulia,
};

/**
 * Extract AST nodes and edges from a list of code files.
 *
 * Two-pass process:
 * 1. Per-file structural extraction (classes, functions, imports)
 * 2. Cross-file import resolution: turns file-level imports into
 *    class-level INFERRED edges (DigestAuth --uses--> Response)
 */
export interface ExtractionDiagnostic {
  filePath: string;
  error: string;
}

export interface ExtractWithDiagnosticsResult {
  extraction: Extraction;
  diagnostics: ExtractionDiagnostic[];
}

export async function extractWithDiagnostics(paths: string[]): Promise<ExtractWithDiagnosticsResult> {
  const normalizedPaths = paths.map((filePath) => resolve(filePath));
  const perFile: ExtractionResult[] = [];
  const diagnostics: ExtractionDiagnostic[] = [];
  const root = inferCommonRoot(normalizedPaths);

  const total = normalizedPaths.length;
  const _PROGRESS_INTERVAL = 100;

  for (let i = 0; i < normalizedPaths.length; i++) {
    if (total >= _PROGRESS_INTERVAL && i % _PROGRESS_INTERVAL === 0 && i > 0) {
      process.stderr.write(`  AST extraction: ${i}/${total} files (${Math.floor(i * 100 / total)}%)\n`);
    }
    const filePath = normalizedPaths[i]!;
    const ext = extname(filePath);
    const extractor = basename(filePath).endsWith(".blade.php")
      ? extractRegexBackedCode
      : _DISPATCH[ext];
    if (!extractor) continue;

    const cached = loadCached(filePath, root);
    if (cached !== null) {
      perFile.push(cached as unknown as ExtractionResult);
      continue;
    }

    const result = await extractor(filePath, root);
    if (!result.error) {
      saveCached(filePath, result as unknown as Record<string, unknown>, root);
    } else {
      diagnostics.push({ filePath, error: result.error });
    }
    perFile.push(result);
  }

  if (total >= _PROGRESS_INTERVAL) {
    process.stderr.write(`  AST extraction: ${total}/${total} files (100%)\n`);
  }

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  for (const result of perFile) {
    allNodes.push(...(result.nodes ?? []));
    allEdges.push(...(result.edges ?? []));
  }

  // Add cross-file class-level edges (Python only)
  remapFileNodeIds(allNodes, allEdges, normalizedPaths, root);

  const pyPaths = normalizedPaths.filter((p) => extname(p) === ".py");
  if (pyPaths.length > 0) {
    const pyResults = perFile.filter((_r, i) => extname(normalizedPaths[i]!) === ".py");
    try {
      const crossFileEdges = await _resolveCrossFileImports(pyResults, pyPaths);
      allEdges.push(...crossFileEdges);
    } catch {
      // Cross-file import resolution failed, skipping
    }
  }

  return {
    extraction: {
      nodes: allNodes,
      edges: allEdges,
      input_tokens: 0,
      output_tokens: 0,
    },
    diagnostics,
  };
}

export async function extract(paths: string[]): Promise<Extraction> {
  const { extraction } = await extractWithDiagnostics(paths);
  return extraction;
}

// ---------------------------------------------------------------------------
// collectFiles
// ---------------------------------------------------------------------------

const _EXTENSIONS = new Set([
  ".py", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".go", ".rs",
  ".java", ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp",
  ".rb", ".cs", ".kt", ".kts", ".scala", ".php", ".swift",
  ".lua", ".toc", ".zig", ".ps1",
  ".m", ".mm",
  ".jl", ".ex", ".exs",
  ".vue", ".svelte", ".dart", ".v", ".sv", ".ejs",
]);

/**
 * Walk a directory (or return a single file) and collect code files by
 * supported extension.
 */
export function collectFiles(target: string, options?: { followSymlinks?: boolean }): string[] {
  const followSymlinks = options?.followSymlinks ?? false;
  const resolved = resolve(target);

  try {
    const stat = lstatSync(resolved);
    if (stat.isFile()) return [resolved];
  } catch {
    return [];
  }

  const results: string[] = [];

  function hasHiddenPartInsideRoot(path: string): boolean {
    const rel = relative(resolved, path);
    if (!rel || rel.startsWith("..")) return false;
    return rel.split(sep).some((part) => part.startsWith("."));
  }

  function walkDir(dir: string, visited: Set<string>): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = join(dir, entry);

      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink() && !followSymlinks) continue;

      if (stat.isDirectory() || (stat.isSymbolicLink() && followSymlinks)) {
        // Cycle detection for symlinks
        if (stat.isSymbolicLink()) {
          try {
            const real = realpathSync(fullPath);
            if (visited.has(real)) continue;
            visited.add(real);
            const parentReal = realpathSync(dirname(fullPath));
            if (parentReal === real || parentReal.startsWith(real + sep)) continue;
          } catch {
            continue;
          }
        }

        // Skip hidden directories inside the scanned root, but do not reject
        // project roots that live under hidden worktree containers.
        if (hasHiddenPartInsideRoot(fullPath)) continue;

        walkDir(fullPath, visited);
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walkDir(resolved, new Set<string>());
  return results.sort();
}
