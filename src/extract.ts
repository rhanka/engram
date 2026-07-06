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
import { sanitizeLabel } from "./security.js";
import { shebangInterpreter } from "./detect.js";

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
    ["tsx", "typescript"],
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

interface ResolvableLabelIndex {
  /** Keyed by the normalised label preserving original case (Ruby, C#, Java, Kotlin, …). */
  caseSensitive: Map<string, string>;
  /** Keyed by the lower-cased normalised label (PHP functions/classes). */
  caseInsensitive: Map<string, string>;
}

/** Languages whose call/identifier resolution is case-insensitive. Everything
 *  else resolves case-sensitively so e.g. a `render()` call does not phantom-link
 *  to a `Render` class/function that merely differs by case (upstream 4dce16f). */
const CASE_INSENSITIVE_CALL_MODULES = new Set<string>(["tree_sitter_php"]);

function addLabelCandidate(map: Map<string, Set<string>>, key: string, id: string): void {
  if (!key) return;
  const ids = map.get(key) ?? new Set<string>();
  ids.add(id);
  map.set(key, ids);
}

function resolveUniqueLabels(candidates: Map<string, Set<string>>): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const [label, ids] of candidates) {
    if (ids.size === 1) {
      resolved.set(label, ids.values().next().value as string);
    }
  }
  return resolved;
}

function buildResolvableLabelIndex(nodes: GraphNode[]): ResolvableLabelIndex {
  const csCandidates = new Map<string, Set<string>>();
  const ciCandidates = new Map<string, Set<string>>();
  for (const node of nodes) {
    const raw = String(node.label ?? "");
    const base = raw.replace(/\(?\)$/g, "").replace(/^\./, "");
    if (!base) continue;
    addLabelCandidate(csCandidates, base, node.id);
    addLabelCandidate(ciCandidates, base.toLowerCase(), node.id);
  }
  return {
    caseSensitive: resolveUniqueLabels(csCandidates),
    caseInsensitive: resolveUniqueLabels(ciCandidates),
  };
}

/** Resolve a callee name to a node id, honouring the language's case sensitivity. */
function resolveCalleeNid(
  index: ResolvableLabelIndex,
  calleeName: string,
  tsModule: string,
): string | undefined {
  if (CASE_INSENSITIVE_CALL_MODULES.has(tsModule)) {
    return index.caseInsensitive.get(calleeName.toLowerCase());
  }
  return index.caseSensitive.get(calleeName);
}

// ---------------------------------------------------------------------------
// Builtin god-node filter (port of upstream 80301a0, #916)
//
// Language built-in globals that the AST may classify as call targets when
// used as constructors or coercion functions (e.g. String(x), Number(x)).
// Without this filter they accumulate spurious "calls" edges from every call
// site and surface as false god-nodes in the ranking.  The filter is applied
// at the call-edge emission site (emitCallByName) so no legitimate symbol
// that happens to share a name with a built-in can be silently dropped.
// ---------------------------------------------------------------------------
export const LANGUAGE_BUILTIN_GLOBALS: ReadonlySet<string> = new Set<string>([
  // JavaScript / TypeScript ECMAScript built-ins
  "String", "Number", "Boolean", "Object", "Array", "Symbol", "BigInt",
  "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError",
  "ReferenceError", "EvalError", "URIError",
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "JSON", "Math",
  "Reflect", "Proxy", "Intl",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  // Browser / Node common globals
  "URL", "URLSearchParams", "FormData", "Blob", "File",
  "Headers", "Request", "Response", "AbortController", "AbortSignal",
  "TextEncoder", "TextDecoder", "console",
  // Python built-in callables
  "str", "int", "float", "bool", "list", "dict", "set", "tuple", "bytes",
  "len", "range", "enumerate", "zip", "map", "filter", "sum", "min", "max",
  "print", "open", "isinstance", "type", "super", "sorted", "reversed",
  "any", "all", "abs", "round", "next", "iter", "hash", "id", "repr",
  "callable", "getattr", "setattr", "hasattr", "delattr", "vars", "dir",
]);

type TsconfigAliasEntry = {
  aliasPrefix: string;
  targetBase: string;
};

const tsconfigAliasCache = new Map<string, TsconfigAliasEntry[]>();
type TsconfigDocument = {
  extends?: string | string[];
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
};

function stripJsonc(text: string): string {
  const pattern = /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  const stripped = text.replace(pattern, (token) => token.startsWith("\"") ? token : "");
  return stripped.replace(/,(\s*[}\]])/g, "$1");
}

function readTsconfigDocument(tsconfigPath: string): TsconfigDocument | null {
  try {
    const raw = readFileSync(tsconfigPath, "utf-8");
    try {
      return JSON.parse(raw) as TsconfigDocument;
    } catch {
      return JSON.parse(stripJsonc(raw)) as TsconfigDocument;
    }
  } catch {
    return null;
  }
}

function resolveTsconfigExtendsPath(extendsValue: string, fromDir: string): string | null {
  const candidateRoots: string[] = [];
  if (extendsValue.startsWith(".") || extendsValue.startsWith("/") || extendsValue.startsWith("..")) {
    candidateRoots.push(resolve(fromDir, extendsValue));
  } else {
    try {
      candidateRoots.push(moduleRequire.resolve(extendsValue, { paths: [fromDir] }));
    } catch {
      // fall through to common package-style candidates
    }
    if (!extendsValue.endsWith(".json")) {
      try {
        candidateRoots.push(moduleRequire.resolve(`${extendsValue}.json`, { paths: [fromDir] }));
      } catch {
        // ignore
      }
    }
    try {
      candidateRoots.push(moduleRequire.resolve(join(extendsValue, "tsconfig.json"), { paths: [fromDir] }));
    } catch {
      // ignore
    }
  }

  const candidates = candidateRoots.flatMap((candidate) => {
    const resolvedCandidate = resolve(candidate);
    if (extname(resolvedCandidate) === ".json") {
      return [resolvedCandidate];
    }
    return [
      resolvedCandidate,
      `${resolvedCandidate}.json`,
      join(resolvedCandidate, "tsconfig.json"),
    ];
  });

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function loadTsconfigAliasesFromPath(tsconfigPath: string, seen: Set<string> = new Set()): TsconfigAliasEntry[] {
  const resolvedTsconfigPath = resolve(tsconfigPath);
  const cached = tsconfigAliasCache.get(resolvedTsconfigPath);
  if (cached) return cached;
  if (seen.has(resolvedTsconfigPath)) return [];
  seen.add(resolvedTsconfigPath);

  const parsed = readTsconfigDocument(resolvedTsconfigPath);
  if (!parsed) {
    tsconfigAliasCache.set(resolvedTsconfigPath, []);
    return [];
  }

  const configDir = dirname(resolvedTsconfigPath);
  // F-0819-P1 (#1017): TS 5.0 allows `extends` to be an array of base configs,
  // merged left-to-right (later bases win). A bare-string check silently
  // dropped the array form, losing inherited path aliases. Resolve each base in
  // order and let later ones override earlier ones.
  const extendsList = typeof parsed.extends === "string"
    ? [parsed.extends]
    : Array.isArray(parsed.extends)
      ? parsed.extends.filter((e): e is string => typeof e === "string")
      : [];
  const merged = new Map<string, TsconfigAliasEntry>();
  for (const ext of extendsList) {
    const extendsPath = resolveTsconfigExtendsPath(ext, configDir);
    if (!extendsPath) continue;
    for (const entry of loadTsconfigAliasesFromPath(extendsPath, seen)) {
      merged.set(entry.aliasPrefix, entry);
    }
  }
  const baseDir = resolve(configDir, parsed.compilerOptions?.baseUrl ?? ".");
  for (const [alias, targets] of Object.entries(parsed.compilerOptions?.paths ?? {})) {
    const firstTarget = targets[0];
    if (!firstTarget) continue;
    merged.set(alias.replace(/\/\*$/, ""), {
      aliasPrefix: alias.replace(/\/\*$/, ""),
      targetBase: resolve(baseDir, firstTarget.replace(/\/\*$/, "")),
    });
  }

  const aliases = [...merged.values()];
  tsconfigAliasCache.set(resolvedTsconfigPath, aliases);
  return aliases;
}

function loadTsconfigAliases(startDir: string): TsconfigAliasEntry[] {
  let current = resolve(startDir);
  while (true) {
    const tsconfigPath = join(current, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      return loadTsconfigAliasesFromPath(tsconfigPath);
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
    `${resolvedImport}.mts`,
    `${resolvedImport}.cts`,
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

interface JsImportTargetInfo {
  targetId: string;
  resolvedPath?: string;
}

function resolveJsImportTargetInfo(raw: string, importerPath: string): JsImportTargetInfo | null {
  if (raw.startsWith(".")) {
    const resolvedImport = normalizeJsImportTarget(resolve(dirname(importerPath), raw));
    return {
      targetId: _makeId(toPortablePath(resolvedImport)),
      resolvedPath: resolvedImport,
    };
  }

  let resolvedAlias: string | null = null;
  for (const alias of loadTsconfigAliases(dirname(importerPath))) {
    if (raw === alias.aliasPrefix || raw.startsWith(`${alias.aliasPrefix}/`)) {
      const suffix = raw.slice(alias.aliasPrefix.length).replace(/^\/+/, "");
      resolvedAlias = normalizeJsImportTarget(resolve(alias.targetBase, suffix));
      break;
    }
  }
  if (resolvedAlias) {
    return {
      targetId: _makeId(toPortablePath(resolvedAlias)),
      resolvedPath: resolvedAlias,
    };
  }

  const moduleName = raw.split("/").pop() ?? "";
  // Unresolved: relative/absolute and tsconfig-alias resolution have run and
  // failed, so this is an external package (or a dangling local path).
  // Namespace the id with the "ref" prefix so it can NEVER collapse to the
  // same _makeId as a local file/symbol node. Without it, the bare
  // last-segment id (e.g. "tailwindcss/colors" -> "colors") collides with any
  // unrelated local file of that stem, producing a confident (EXTRACTED)
  // cross-language phantom imports_from edge. The ref-namespaced target has
  // no node, so build drops it as an external reference — the correct outcome
  // for a third-party import. Port of upstream e2ef4ef (#1638).
  return moduleName ? { targetId: _makeId("ref", raw) } : null;
}

function resolveJsImportTarget(raw: string, importerPath: string): string | null {
  return resolveJsImportTargetInfo(raw, importerPath)?.targetId ?? null;
}

function remapFileNodeIds(nodes: GraphNode[], edges: GraphEdge[], paths: string[], root: string): void {
  // Port of upstream safishamsi c898dc6 (#1033): file-level node IDs must match
  // the skill.md spec — ``{parent_dir}_{stem}``, no extension suffix. Using the
  // full relative path (e.g. "auth/session_py") breaks cross-extractor
  // resolution because semantic subagents generate the stem-only form.
  // canonicalId = _makeId(qualifiedFileStem) is the spec-compliant target.
  const byPath = new Map<string, {
    legacyId: string;
    qualifiedLegacyId: string;
    absoluteId: string;
    canonicalId: string;
    label: string;
  }>();
  const absoluteToCanonical = new Map<string, string>();

  for (const filePath of paths) {
    const resolvedPath = resolve(filePath);
    const canonicalId = _makeId(qualifiedFileStem(resolvedPath, root));
    const absoluteId = _makeId(toPortablePath(resolvedPath));
    byPath.set(resolvedPath, {
      legacyId: _makeId(basename(resolvedPath, extname(resolvedPath))),
      qualifiedLegacyId: canonicalId, // kept for back-compat reference
      absoluteId,
      canonicalId,
      label: basename(resolvedPath),
    });
    absoluteToCanonical.set(absoluteId, canonicalId);
  }

  for (const node of nodes) {
    const info = byPath.get(resolve(node.source_file ?? ""));
    if (!info || node.label !== info.label) continue;
    if (node.id === info.legacyId || node.id === info.qualifiedLegacyId || node.id === info.absoluteId) {
      node.id = info.canonicalId;
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
      edge.source = sourceInfo.canonicalId;
    }

    const remappedSource = absoluteToCanonical.get(edge.source);
    if (remappedSource) {
      edge.source = remappedSource;
    }

    const remappedTarget = absoluteToCanonical.get(edge.target);
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
      edge.target = sourceInfo.canonicalId;
    }
  }
}

function _readText(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

// ---------------------------------------------------------------------------
// Type-reference collectors (Lot 2 — type/field/generic-arg references)
//
// Upstream safishamsi emits `references` edges for the declared types of class
// fields / properties / vars / generic arguments across many languages. The TS
// extractor had NO type-reference subsystem (the only `references` edges were
// SQL foreign keys); these per-language collectors mirror upstream's
// `_<lang>_collect_type_refs` helpers. Each walks a type expression and appends
// `[name, role]` tuples where role is `"type"` (the head type) or
// `"generic_arg"` (a nested generic/template argument). Primitive/builtin types
// are skipped so they never become god-nodes.
// ---------------------------------------------------------------------------

/** A collected type reference: `[name, role]` where role is `"type"` or `"generic_arg"`. */
type TypeRef = [string, string];

/** Java declarations that can introduce type parameters visible to nested types. */
const _JAVA_TYPE_PARAMETER_SCOPE_DECLARATIONS = new Set<string>([
  "class_declaration",
  "interface_declaration",
  "record_declaration",
  "method_declaration",
  "constructor_declaration",
]);

/**
 * Return the Java type-parameter names in scope at `node` (walking enclosing
 * class/interface/record/method/constructor declarations). Port of upstream
 * safishamsi 8b9a998 (#1518): a bare type parameter (`T` in `Box<T>`) must not
 * emit a spurious `references`/`generic_arg` edge to a sourceless stub node.
 */
function _javaTypeParametersInScope(node: SyntaxNode, source: string): Set<string> {
  const names = new Set<string>();
  let scope: SyntaxNode | null = node;
  while (scope !== null) {
    if (_JAVA_TYPE_PARAMETER_SCOPE_DECLARATIONS.has(scope.type)) {
      const params = scope.childForFieldName("type_parameters");
      if (params) {
        for (const param of params.children) {
          if (param.type !== "type_parameter") continue;
          const nameNode = param.children.find((c) => c.type === "type_identifier");
          if (nameNode) names.add(_readText(nameNode, source));
        }
      }
    }
    scope = scope.parent;
  }
  return names;
}

/**
 * java.lang (auto-imported) plus the ubiquitous java.util / java.io /
 * java.time / java.util.{stream,function,concurrent} / java.math /
 * java.nio.file types that appear as field, parameter, return, and
 * generic-argument annotations. They never resolve to a project node, so
 * emitting `references` edges to them is pure noise. Suppressed at the
 * type-ref walker so they are never created as nodes or emitted as edges;
 * primitives are already dropped by grammar node type. Port of upstream
 * safishamsi 92edf78 (#1603).
 */
const _JAVA_BUILTIN_TYPES = new Set<string>([
  // java.lang — core
  "Object", "String", "CharSequence", "StringBuilder", "StringBuffer",
  "Number", "Byte", "Short", "Integer", "Long", "Float", "Double",
  "Boolean", "Character", "Void", "Class", "Enum", "Record", "Math",
  "System", "Thread", "Runnable", "Comparable", "Iterable", "Cloneable",
  "AutoCloseable", "Appendable", "Readable", "Process", "ProcessBuilder",
  "Runtime", "Package", "ThreadLocal", "InheritableThreadLocal",
  // java.lang — throwables
  "Throwable", "Exception", "RuntimeException", "Error",
  "IllegalArgumentException", "IllegalStateException", "NullPointerException",
  "IndexOutOfBoundsException", "ArrayIndexOutOfBoundsException",
  "ClassCastException", "NumberFormatException", "ArithmeticException",
  "UnsupportedOperationException", "InterruptedException",
  "CloneNotSupportedException", "SecurityException", "StackOverflowError",
  "OutOfMemoryError", "AssertionError",
  // java.util — collections & core
  "Collection", "List", "ArrayList", "LinkedList", "Vector", "Stack",
  "Set", "HashSet", "LinkedHashSet", "TreeSet", "SortedSet", "NavigableSet",
  "EnumSet", "Map", "HashMap", "LinkedHashMap", "TreeMap", "SortedMap",
  "NavigableMap", "Hashtable", "EnumMap", "Properties", "Queue", "Deque",
  "ArrayDeque", "PriorityQueue", "Iterator", "ListIterator", "Comparator",
  "Optional", "OptionalInt", "OptionalLong", "OptionalDouble", "Collections",
  "Arrays", "Objects", "Date", "Calendar", "Random", "UUID", "Scanner",
  "StringJoiner", "StringTokenizer", "BitSet", "Spliterator", "Locale",
  "NoSuchElementException", "ConcurrentModificationException",
  // java.util.stream
  "Stream", "IntStream", "LongStream", "DoubleStream", "Collector",
  "Collectors",
  // java.util.function
  "Function", "BiFunction", "Consumer", "BiConsumer", "Supplier",
  "Predicate", "BiPredicate", "UnaryOperator", "BinaryOperator",
  "IntFunction", "ToIntFunction", "ToLongFunction", "ToDoubleFunction",
  // java.util.concurrent
  "Callable", "Future", "CompletableFuture", "CompletionStage", "Executor",
  "ExecutorService", "Executors", "ScheduledExecutorService", "TimeUnit",
  "ConcurrentHashMap", "ConcurrentMap", "CopyOnWriteArrayList",
  "BlockingQueue", "CountDownLatch", "Semaphore", "CyclicBarrier",
  "AtomicInteger", "AtomicLong", "AtomicBoolean", "AtomicReference",
  // java.time
  "Instant", "Duration", "Period", "LocalDate", "LocalTime", "LocalDateTime",
  "ZonedDateTime", "OffsetDateTime", "ZoneId", "ZoneOffset", "DayOfWeek",
  "Month", "Year", "Clock", "DateTimeFormatter",
  // java.io / java.nio.file
  "IOException", "UncheckedIOException", "FileNotFoundException", "File",
  "InputStream", "OutputStream", "Reader", "Writer", "BufferedReader",
  "BufferedWriter", "InputStreamReader", "OutputStreamWriter", "FileReader",
  "FileWriter", "PrintStream", "PrintWriter", "ByteArrayInputStream",
  "ByteArrayOutputStream", "Serializable", "Closeable", "Path", "Paths",
  "Files",
  // java.math
  "BigDecimal", "BigInteger",
]);

/**
 * Walk a Java type expression; append `[name, role]` tuples. Skips primitives,
 * any in-scope type parameter, and java stdlib builtins
 * (`_JAVA_BUILTIN_TYPES`), and resolves the unqualified tail of a
 * `scoped_type_identifier` (`java.util.List` → `List`). Ports of upstream
 * safishamsi 31b3752 (#1485) + 8b9a998 (#1518) + 92edf78 (#1603).
 */
function _javaCollectTypeRefs(
  node: SyntaxNode | null,
  source: string,
  generic: boolean,
  out: TypeRef[],
  skip?: Set<string>,
): void {
  if (node === null) return;
  const skipSet = skip ?? _javaTypeParametersInScope(node, source);
  const t = node.type;
  if (t === "integral_type" || t === "floating_point_type" || t === "boolean_type" || t === "void_type") {
    return;
  }
  if (t === "type_identifier") {
    const name = _readText(node, source);
    if (name && !skipSet.has(name) && !_JAVA_BUILTIN_TYPES.has(name)) {
      out.push([name, generic ? "generic_arg" : "type"]);
    }
    return;
  }
  if (t === "scoped_type_identifier") {
    const text = _readText(node, source).split(".").pop() ?? "";
    if (text && !_JAVA_BUILTIN_TYPES.has(text)) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "generic_type") {
    for (const c of node.children) {
      if (c.type === "type_identifier" || c.type === "scoped_type_identifier") {
        const text = _readText(c, source).split(".").pop() ?? "";
        if (
          text &&
          !_JAVA_BUILTIN_TYPES.has(text) &&
          (c.type === "scoped_type_identifier" || !skipSet.has(text))
        ) {
          out.push([text, generic ? "generic_arg" : "type"]);
        }
        break;
      }
    }
    for (const c of node.children) {
      if (c.type === "type_arguments") {
        for (const arg of c.children) {
          if (arg.isNamed) _javaCollectTypeRefs(arg, source, true, out, skipSet);
        }
      }
    }
    return;
  }
  if (t === "array_type") {
    for (const c of node.children) {
      if (c.isNamed) _javaCollectTypeRefs(c, source, generic, out, skipSet);
    }
    return;
  }
  if (node.isNamed) {
    for (const c of node.children) {
      if (c.isNamed) _javaCollectTypeRefs(c, source, generic, out, skipSet);
    }
  }
}

/** C/C++ node types that denote a primitive/builtin type (never referenced). */
const _C_PRIMITIVE_TYPE_NODES = new Set<string>([
  "primitive_type", "sized_type_specifier", "auto", "placeholder_type_specifier",
]);

/**
 * Walk a C++ type expression; append `[name, role]` tuples. Resolves
 * `qualified_identifier` tails (`std::string` → `string`) and `template_type`
 * base + arguments (`std::vector<HttpClient>` → `vector` + `HttpClient` as a
 * generic_arg). Port of upstream safishamsi `_cpp_collect_type_refs`.
 */
function _cppCollectTypeRefs(
  node: SyntaxNode | null, source: string, generic: boolean, out: TypeRef[],
): void {
  if (node === null || _C_PRIMITIVE_TYPE_NODES.has(node.type)) return;
  const t = node.type;
  if (t === "type_identifier") {
    const text = _readText(node, source);
    if (text) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "qualified_identifier") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) _cppCollectTypeRefs(nameNode, source, generic, out);
    return;
  }
  if (t === "template_type") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const text = _readText(nameNode, source);
      if (text) out.push([text, generic ? "generic_arg" : "type"]);
    }
    const argsNode = node.childForFieldName("arguments");
    if (argsNode) {
      for (const c of argsNode.children) {
        if (c.isNamed) _cppCollectTypeRefs(c, source, true, out);
      }
    }
    return;
  }
  if (
    t === "type_descriptor" || t === "pointer_declarator" || t === "reference_declarator" ||
    t === "array_declarator" || t === "type_qualifier" || t === "abstract_pointer_declarator" ||
    t === "abstract_reference_declarator" || t === "abstract_array_declarator"
  ) {
    for (const c of node.children) {
      if (c.isNamed) _cppCollectTypeRefs(c, source, generic, out);
    }
  }
}

/**
 * Walk a Rust type expression; append `[name, role]` tuples. Skips primitives,
 * resolves the tail of a `scoped_type_identifier` (`crate::Logger` → `Logger`)
 * and the base + arguments of a `generic_type` (`Vec<Config>` → `Vec` +
 * `Config` as a generic_arg). Port of upstream safishamsi `_rust_collect_type_refs`.
 */
function _rustCollectTypeRefs(
  node: SyntaxNode | null, source: string, generic: boolean, out: TypeRef[],
): void {
  if (node === null) return;
  const t = node.type;
  if (t === "primitive_type") return;
  if (t === "type_identifier") {
    const text = _readText(node, source);
    if (text) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "scoped_type_identifier") {
    const text = _readText(node, source).split("::").pop() ?? "";
    if (text) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "generic_type") {
    let nameNode = node.childForFieldName("type");
    if (!nameNode) {
      for (const c of node.children) {
        if (c.type === "type_identifier" || c.type === "scoped_type_identifier") {
          nameNode = c;
          break;
        }
      }
    }
    if (nameNode) {
      const text = _readText(nameNode, source).split("::").pop() ?? "";
      if (text) out.push([text, generic ? "generic_arg" : "type"]);
    }
    for (const c of node.children) {
      if (c.type === "type_arguments") {
        for (const arg of c.children) {
          if (arg.isNamed) _rustCollectTypeRefs(arg, source, true, out);
        }
      }
    }
    return;
  }
  if (
    t === "reference_type" || t === "pointer_type" || t === "array_type" ||
    t === "tuple_type" || t === "slice_type"
  ) {
    for (const c of node.children) {
      if (c.isNamed) _rustCollectTypeRefs(c, source, generic, out);
    }
    return;
  }
  if (node.isNamed) {
    for (const c of node.children) {
      if (c.isNamed) _rustCollectTypeRefs(c, source, generic, out);
    }
  }
}

/** Rust type-expression node types that can appear as a positional (tuple) field. */
const _RUST_FIELD_TYPE_NODES = new Set<string>([
  "type_identifier", "generic_type", "scoped_type_identifier",
  "reference_type", "primitive_type", "tuple_type", "array_type",
]);

/** PHP type-expression node types that carry a declared type. */
const _PHP_TYPE_NODES = new Set<string>([
  "named_type", "primitive_type", "nullable_type",
  "union_type", "intersection_type", "optional_type",
]);

/** Return the unqualified tail of a PHP `name`/`qualified_name` node (`A\B\C` → `C`). */
function _phpNameText(node: SyntaxNode | null, source: string): string | null {
  if (node === null) return null;
  return _readText(node, source).split("\\").pop() || null;
}

/**
 * Walk a PHP type expression; append `[name, role]` tuples. Skips primitives
 * and unwraps `named_type` / nullable / union / intersection wrappers. Port of
 * upstream safishamsi `_php_collect_type_refs`.
 */
function _phpCollectTypeRefs(
  node: SyntaxNode | null, source: string, generic: boolean, out: TypeRef[],
): void {
  if (node === null) return;
  const t = node.type;
  if (t === "primitive_type") return;
  if (t === "named_type") {
    for (const c of node.children) {
      if (c.type === "name" || c.type === "qualified_name") {
        const text = _phpNameText(c, source);
        if (text) out.push([text, generic ? "generic_arg" : "type"]);
        return;
      }
    }
    return;
  }
  if (t === "name" || t === "qualified_name") {
    const text = _phpNameText(node, source);
    if (text) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "nullable_type" || t === "union_type" || t === "intersection_type" || t === "optional_type") {
    for (const c of node.children) {
      if (c.isNamed) _phpCollectTypeRefs(c, source, generic, out);
    }
    return;
  }
  if (node.isNamed) {
    for (const c of node.children) {
      if (c.isNamed) _phpCollectTypeRefs(c, source, generic, out);
    }
  }
}

/** C# declarations that can introduce type parameters visible to nested types. */
const _CSHARP_TYPE_PARAMETER_SCOPE_DECLARATIONS = new Set<string>([
  "class_declaration", "interface_declaration", "record_declaration",
  "struct_declaration", "method_declaration",
]);

/** Return the C# type-parameter names in scope at `node`. */
function _csharpTypeParametersInScope(node: SyntaxNode, source: string): Set<string> {
  const names = new Set<string>();
  let scope: SyntaxNode | null = node;
  while (scope !== null) {
    if (_CSHARP_TYPE_PARAMETER_SCOPE_DECLARATIONS.has(scope.type)) {
      for (const child of scope.children) {
        if (child.type !== "type_parameter_list") continue;
        for (const param of child.children) {
          if (param.type === "type_parameter") {
            const nameNode = param.children.find((sub) => sub.type === "identifier");
            if (nameNode) {
              const n = _readText(nameNode, source);
              if (n) names.add(n);
            }
          } else if (param.type === "identifier") {
            const n = _readText(param, source);
            if (n) names.add(n);
          }
        }
      }
    }
    scope = scope.parent;
  }
  return names;
}

/**
 * Walk a C# type expression; append `[name, role]` tuples. Skips predefined
 * types and in-scope type parameters, resolves the unqualified tail of a
 * `qualified_name` and the base + arguments of a `generic_name` (`List<Widget>`
 * → `List` + `Widget` as a generic_arg). Port of upstream safishamsi
 * `_csharp_collect_type_refs` (the qualified/qualifier metadata it also returns
 * is dropped here — TS reference edges carry no cross-file qualifier hint yet).
 */
function _csharpCollectTypeRefs(
  node: SyntaxNode | null,
  source: string,
  generic: boolean,
  out: TypeRef[],
  skip?: Set<string>,
): void {
  if (node === null) return;
  const skipSet = skip ?? _csharpTypeParametersInScope(node, source);
  const t = node.type;
  if (t === "predefined_type") return;
  if (t === "identifier") {
    const name = _readText(node, source);
    if (name && !skipSet.has(name)) out.push([name, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "qualified_name") {
    const text = (_readText(node, source).split(".").pop() ?? "").split("<")[0] ?? "";
    if (text && !skipSet.has(text)) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "generic_name") {
    let nameChild = node.childForFieldName("name");
    if (!nameChild) {
      nameChild = node.children.find((sub) => sub.type === "identifier") ?? null;
    }
    if (nameChild) {
      const name = _readText(nameChild, source).split(".").pop() ?? "";
      if (name && !skipSet.has(name)) out.push([name, generic ? "generic_arg" : "type"]);
    }
    for (const sub of node.children) {
      if (sub.type === "type_argument_list") {
        for (const arg of sub.children) {
          if (arg.isNamed) _csharpCollectTypeRefs(arg, source, true, out, skipSet);
        }
      }
    }
    return;
  }
  if (t === "nullable_type" || t === "array_type" || t === "pointer_type" || t === "ref_type") {
    for (const c of node.children) {
      if (c.isNamed) _csharpCollectTypeRefs(c, source, generic, out, skipSet);
    }
    return;
  }
  if (node.isNamed) {
    for (const c of node.children) {
      if (c.isNamed) _csharpCollectTypeRefs(c, source, generic, out, skipSet);
    }
  }
}

/**
 * Walk a Scala type expression; append `[name, role]` tuples. Handles
 * `type_identifier`, `generic_type` (`List[T]`) and common type wrappers. Port
 * of upstream safishamsi `_scala_collect_type_refs`.
 */
function _scalaCollectTypeRefs(
  node: SyntaxNode | null, source: string, generic: boolean, out: TypeRef[],
): void {
  if (node === null) return;
  const t = node.type;
  if (t === "type_identifier") {
    const text = _readText(node, source);
    if (text) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (t === "generic_type") {
    let base = node.childForFieldName("type");
    if (!base) {
      base = node.children.find((c) => c.type === "type_identifier") ?? null;
    }
    if (base && base.type === "type_identifier") {
      const text = _readText(base, source);
      if (text) out.push([text, generic ? "generic_arg" : "type"]);
    }
    for (const c of node.children) {
      if (c.type === "type_arguments") {
        for (const arg of c.children) {
          if (arg.isNamed) _scalaCollectTypeRefs(arg, source, true, out);
        }
      }
    }
    return;
  }
  if (
    t === "compound_type" || t === "infix_type" || t === "function_type" ||
    t === "tuple_type" || t === "annotated_type" || t === "projected_type"
  ) {
    for (const c of node.children) {
      if (c.isNamed) _scalaCollectTypeRefs(c, source, generic, out);
    }
  }
}

/**
 * Return the head identifier text from a Kotlin `user_type` node (without
 * generics). Port of upstream safishamsi `_kotlin_user_type_name`.
 */
function _kotlinUserTypeName(userTypeNode: SyntaxNode | null, source: string): string | null {
  if (userTypeNode === null) return null;
  for (const c of userTypeNode.children) {
    if (c.type === "type_identifier" || c.type === "identifier") {
      const text = _readText(c, source);
      return text || null;
    }
    if (c.type === "simple_user_type") {
      for (const sub of c.children) {
        if (sub.type === "identifier" || sub.type === "type_identifier") {
          const text = _readText(sub, source);
          return text || null;
        }
      }
    }
  }
  return null;
}

/**
 * Walk a Swift type expression; append `[name, role]` tuples. Unwraps
 * `type_annotation` / optional / array / dictionary / tuple wrappers and reads
 * the `type_identifier` head + `type_arguments` of a `user_type`. Port of
 * upstream safishamsi `_swift_collect_type_refs`.
 */
function _swiftCollectTypeRefs(
  node: SyntaxNode | null, source: string, generic: boolean, out: TypeRef[],
): void {
  if (node === null) return;
  const t = node.type;
  if (t === "type_annotation") {
    for (const c of node.children) {
      if (c.isNamed) _swiftCollectTypeRefs(c, source, generic, out);
    }
    return;
  }
  if (t === "user_type") {
    for (const c of node.children) {
      if (c.type === "type_identifier") {
        const text = _readText(c, source);
        if (text) out.push([text, generic ? "generic_arg" : "type"]);
        break;
      }
    }
    for (const c of node.children) {
      if (c.type === "type_arguments") {
        for (const arg of c.children) {
          if (arg.isNamed) _swiftCollectTypeRefs(arg, source, true, out);
        }
      }
    }
    return;
  }
  if (t === "type_identifier") {
    const text = _readText(node, source);
    if (text) out.push([text, generic ? "generic_arg" : "type"]);
    return;
  }
  if (
    t === "optional_type" || t === "implicitly_unwrapped_optional_type" ||
    t === "array_type" || t === "dictionary_type" || t === "tuple_type"
  ) {
    for (const c of node.children) {
      if (c.isNamed) _swiftCollectTypeRefs(c, source, generic, out);
    }
    return;
  }
  if (node.isNamed) {
    for (const c of node.children) {
      if (c.isNamed) _swiftCollectTypeRefs(c, source, generic, out);
    }
  }
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
  rootDir?: string,
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
  edges: GraphEdge[], strPath: string, rootDir?: string,
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

  // Port of upstream safishamsi 1494874 — barrel re-exports as explicit
  // graph edges. tree-sitter parses `export { X } from './mod'` as an
  // `export_statement` carrying a `string` child (the source module). Pure
  // exports without a `from` clause (`export const x = 1`, `export { local }`)
  // have no string child and must be ignored here so the walker keeps walking
  // children for the local declarations / specifiers.
  const isReExport = node.type === "export_statement";
  if (isReExport) {
    const hasStringChild = node.children.some((c) => c.type === "string");
    if (!hasStringChild) return;
  }

  const raw = readStringSpecifier(node);
  if (!raw) return;
  const targetInfo = resolveJsImportTargetInfo(raw, strPath);
  if (!targetInfo) return;
  const line = node.startPosition.row + 1;

  const importEdge: GraphEdge = {
    source: fileNid, target: targetInfo.targetId, relation: "imports_from",
    confidence: "EXTRACTED", source_file: strPath,
    source_location: `L${line}`, weight: 1.0,
  };
  if (isReExport) {
    // Tag the file-level edge so consumers (review-delta barrel detection,
    // wiki audit, etc.) can distinguish a regular `import` from an
    // `export { X } from './m'` re-export.
    (importEdge as GraphEdge & { context?: string }).context = "re-export";
  }
  edges.push(importEdge);

  // Symbol-level edges: each named specifier becomes a file→symbol edge.
  //   `import { Foo } from './bar'`         → file -imports->        bar.Foo
  //   `export { Foo } from './bar'`         → file -re_exports->     bar.Foo
  //   `export { default as Alias } from .`  → skipped (matches upstream)
  //   `export * from './bar'`               → no symbol-level edge (no clause)
  // The target id reuses _makeId(targetStem, sym) so it resolves to the same
  // node _extract_generic emits when defining the symbol in `./bar`. The
  // re_exports edge target lives in another file's seenIds — the cleanEdges
  // allowlist below permits this cross-file landing.
  if (!targetInfo.resolvedPath) return;
  const targetStem = qualifiedFileStem(
    targetInfo.resolvedPath,
    rootDir ?? dirname(resolve(strPath)),
  );

  const pushSymbolEdge = (sym: string, relation: "imports" | "re_exports"): void => {
    if (!sym || sym === "default") return;
    const edge: GraphEdge = {
      source: fileNid,
      target: _makeId(targetStem, sym),
      relation,
      confidence: "EXTRACTED",
      source_file: strPath,
      source_location: `L${line}`,
      weight: 1.0,
    };
    if (relation === "re_exports") {
      (edge as GraphEdge & { context?: string }).context = "re-export";
    }
    edges.push(edge);
  };

  if (isReExport) {
    // tree-sitter `export_statement` carries an `export_clause` listing the
    // re-exported specifiers. `export * from './m'` has no `export_clause`
    // (only a wildcard `*`), so it produces no symbol-level edges — only the
    // file-level imports_from already pushed above.
    for (const child of node.children) {
      if (child.type !== "export_clause") continue;
      for (const spec of child.children) {
        if (spec.type !== "export_specifier") continue;
        const nameNode = spec.childForFieldName("name");
        if (!nameNode) continue;
        pushSymbolEdge(_readText(nameNode, source), "re_exports");
      }
    }
  } else if (node.type === "import_statement") {
    for (const child of node.children) {
      if (child.type !== "import_clause") continue;
      for (const sub of child.children) {
        if (sub.type !== "named_imports") continue;
        for (const spec of sub.children) {
          if (spec.type !== "import_specifier") continue;
          const nameNode = spec.childForFieldName("name");
          if (!nameNode) continue;
          pushSymbolEdge(_readText(nameNode, source), "imports");
        }
      }
    }
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

/**
 * Resolve a Lua require() module name to a node id (F-0819-P1 #1075).
 *
 * Lua module names use dots as path separators: `require("pkg.b")` looks for
 * `pkg/b.lua` (or `.luau`) relative to a package root. Probe the importing
 * file's directory and walk upward; when a matching file is found, return the
 * id `_makeId(qualifiedFileStem(cand))` matching the file node id the extractor
 * assigns, so the edge lands on a real node. When nothing matches on disk, fall
 * back to `_makeId` of the full dotted module so the symbol-resolution pass can
 * still complete the edge instead of dropping it (previously the bare last
 * segment was used, which never matched any node id).
 */
function _resolveLuaImportTarget(rawModule: string, strPath: string): string {
  if (!rawModule) return "";
  const rel = rawModule.replace(/\./g, "/");
  let probe: string | null = null;
  try {
    probe = dirname(resolve(strPath));
  } catch {
    probe = null;
  }
  // The dotted module name IS the qualified relative path of the target file
  // (`pkg.b` -> `pkg/b.lua`), so the node id is `_makeId(rawModule)` in every
  // case. Probing the disk only distinguishes a resolvable local module from an
  // external one; either way the id is the dotted module (never the bare last
  // segment, which was the #1075 bug). We keep the probe so future callers can
  // branch on locality if needed.
  if (probe) {
    for (let i = 0; i < 6; i++) {
      for (const suffix of [".lua", ".luau"]) {
        if (existsSync(join(probe, `${rel}${suffix}`))) {
          return _makeId(rawModule);
        }
      }
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return _makeId(rawModule);
}

function _importLua(
  node: SyntaxNode, source: string, fileNid: string, _stem: string,
  edges: GraphEdge[], strPath: string,
): void {
  const text = _readText(node, source);
  const m = text.match(/require\s*[('"]?\s*['"]?([^'")\s]+)/);
  if (m) {
    const rawModule = m[1]!;
    const tgtNid = _resolveLuaImportTarget(rawModule, strPath);
    if (tgtNid) {
      edges.push({
        source: fileNid, target: tgtNid, relation: "imports",
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
// JS/TS extra walk for arrow functions and CommonJS requires
// ---------------------------------------------------------------------------

function _findRequireCall(valueNode: SyntaxNode | null, source: string): SyntaxNode | null {
  if (!valueNode) return null;
  if (valueNode.type === "call_expression") {
    const fn = valueNode.childForFieldName("function");
    if (fn && fn.type === "identifier" && _readText(fn, source) === "require") {
      return valueNode;
    }
  }
  if (valueNode.type === "member_expression") {
    return _findRequireCall(valueNode.childForFieldName("object"), source);
  }
  return null;
}

function _readStringArgument(node: SyntaxNode, source: string): string | null {
  const args = node.childForFieldName("arguments");
  if (!args) return null;
  for (const child of args.children) {
    if (child.type === "string") {
      return _readText(child, source).replace(/^['"`\s]+|['"`\s]+$/g, "");
    }
  }
  return null;
}

function _readJsCalleeName(node: SyntaxNode | null, source: string): string | null {
  if (!node) return null;
  if (["identifier", "type_identifier", "property_identifier"].includes(node.type)) {
    return _readText(node, source);
  }
  if (node.type === "member_expression") {
    const prop = node.childForFieldName("property");
    if (prop) return _readJsCalleeName(prop, source);
  }
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!;
    const name = _readJsCalleeName(child, source);
    if (name) return name;
  }
  return null;
}

function _requireImportsJs(
  node: SyntaxNode,
  source: string,
  fileNid: string,
  edges: GraphEdge[],
  strPath: string,
  rootDir: string,
): boolean {
  if (node.type !== "lexical_declaration" && node.type !== "variable_declaration") {
    return false;
  }

  let found = false;
  for (const child of node.children) {
    if (child.type !== "variable_declarator") continue;

    const value = child.childForFieldName("value");
    const call = _findRequireCall(value, source);
    if (!call) continue;

    const raw = _readStringArgument(call, source);
    if (!raw) continue;

    const target = resolveJsImportTargetInfo(raw, strPath);
    if (!target) continue;

    const line = node.startPosition.row + 1;
    edges.push({
      source: fileNid,
      target: target.targetId,
      relation: "imports_from",
      confidence: "EXTRACTED",
      source_file: strPath,
      source_location: `L${line}`,
      weight: 1.0,
    });
    found = true;

    if (!target.resolvedPath) continue;

    const targetStem = qualifiedFileStem(target.resolvedPath, rootDir);
    const nameNode = child.childForFieldName("name");
    const symNames: string[] = [];
    if (nameNode?.type === "object_pattern") {
      for (const prop of nameNode.children) {
        if (prop.type === "shorthand_property_identifier_pattern") {
          symNames.push(_readText(prop, source));
        } else if (prop.type === "pair_pattern") {
          const key = prop.childForFieldName("key");
          if (key) {
            symNames.push(_readText(key, source).replace(/^['"`\s]+|['"`\s]+$/g, ""));
          }
        }
      }
    } else if (value?.type === "member_expression") {
      const prop = value.childForFieldName("property");
      if (prop) {
        symNames.push(_readText(prop, source));
      }
    }

    for (const sym of symNames.filter(Boolean)) {
      edges.push({
        source: fileNid,
        target: _makeId(targetStem, sym),
        relation: "imports",
        confidence: "EXTRACTED",
        source_file: strPath,
        source_location: `L${line}`,
        weight: 1.0,
      });
    }
  }
  return found;
}

/**
 * Node types whose value is a callable, for the JS/TS `const x = <fn>` form
 * below. Older tree-sitter-javascript grammars label a function expression
 * `function`; current ones use `function_expression`. `generator_function`
 * (`const h = function*(){}`) — port of upstream safishamsi 09aeb97; the
 * function/function_expression members close the same long-standing gap for
 * plain function expressions (upstream `_JS_FUNCTION_VALUE_TYPES`).
 */
const _JS_FUNCTION_VALUE_TYPES = new Set<string>([
  "arrow_function", "function_expression", "function", "generator_function",
]);

function _jsExtraWalk(
  node: SyntaxNode, source: string, fileNid: string, stem: string, strPath: string,
  _nodes: GraphNode[], edges: GraphEdge[], _seenIds: Set<string>,
  functionBodies: Array<[string, SyntaxNode]>,
  _parentClassNid: string | null,
  addNodeFn: (nid: string, label: string, line: number) => void,
  addEdgeFn: (src: string, tgt: string, relation: string, line: number) => void,
  rootDir: string,
): boolean {
  if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
    const requireFound = _requireImportsJs(node, source, fileNid, edges, strPath, rootDir);
    let arrowFound = false;

    let constFound = false;

    // Scope guard (F-0819-P1 #1077): only emit nodes for module-level
    // declarations. A `const x = ...` inside an arrow callback (e.g. inside
    // `describe(() => { const set = new Set(...) })`) would otherwise emit a
    // bare-named node, and the same name colliding across unrelated files
    // produces phantom god-nodes. Arrow-function bodies are walked separately
    // via functionBodies, so locals never need a node here.
    const parent = node.parent;
    const isModuleLevel =
      parent !== null &&
      (parent.type === "program" ||
        (parent.type === "export_statement" &&
          parent.parent !== null &&
          parent.parent.type === "program"));

    if (node.type === "lexical_declaration" && isModuleLevel) {
      for (const child of node.children) {
        if (child.type === "variable_declarator") {
          const value = child.childForFieldName("value");
          const nameNode = child.childForFieldName("name");
          if (value && _JS_FUNCTION_VALUE_TYPES.has(value.type)) {
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
              arrowFound = true;
            }
          } else if (
            value &&
            ["object", "array", "as_expression", "call_expression", "new_expression"].includes(value.type)
          ) {
            if (nameNode) {
              const constName = _readText(nameNode, source);
              const line = child.startPosition.row + 1;
              const constNid = _makeId(stem, constName);
              addNodeFn(constNid, constName, line);
              addEdgeFn(fileNid, constNid, "contains", line);
              constFound = true;
            }
          }
        }
      }
    }
    return node.type === "lexical_declaration" || requireFound || arrowFound || constFound;
  }
  return false;
}

// ---------------------------------------------------------------------------
// TS extra walk for namespace / module declarations
// ---------------------------------------------------------------------------

/**
 * Emit a container node for a TS `namespace`/`module` declaration.
 *
 * `namespace Foo {}` parses as `internal_module` (with `name`/`body` fields);
 * `module Bar {}` and ambient `declare module "pkg" {}` parse as a named
 * `module` node that exposes no fields, so its name and body are found
 * positionally. Without this the container was never a node — its members
 * were still reached by the default recurse but the namespace itself was
 * invisible to the graph. Members stay file-contained (parity with
 * `_csharpExtraWalk`); the namespace becomes a sibling marker node so it is
 * queryable. Returns true if handled.
 *
 * The guard requires `isNamed` because the anonymous `module` keyword token
 * shares the `module` type string and would otherwise match here.
 * Port of upstream safishamsi 869aaf7.
 */
function _tsExtraWalk(
  node: SyntaxNode, source: string, fileNid: string, stem: string,
  parentClassNid: string | null,
  addNodeFn: (nid: string, label: string, line: number) => void,
  addEdgeFn: (src: string, tgt: string, relation: string, line: number) => void,
  walkFn: (node: SyntaxNode, parentClassNid: string | null) => void,
): boolean {
  if (node.isNamed && (node.type === "internal_module" || node.type === "module")) {
    let nameNode = node.childForFieldName("name");
    if (!nameNode) {
      for (const child of node.children) {
        if (child.isNamed && (child.type === "identifier" || child.type === "nested_identifier" || child.type === "string")) {
          nameNode = child;
          break;
        }
      }
    }
    let body = node.childForFieldName("body");
    if (!body) {
      for (const child of node.children) {
        if (child.type === "statement_block") {
          body = child;
          break;
        }
      }
    }
    if (nameNode) {
      let nsName = _readText(nameNode, source);
      if (nameNode.type === "string") {
        nsName = nsName.replace(/^['"`]+|['"`]+$/g, "");
      }
      if (nsName) {
        const nsNid = _makeId(stem, nsName);
        const line = node.startPosition.row + 1;
        addNodeFn(nsNid, nsName, line);
        addEdgeFn(fileNid, nsNid, "contains", line);
      }
    }
    if (body) {
      for (const child of body.children) {
        walkFn(child, parentClassNid);
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
  addEdgeFn: (
    src: string, tgt: string, relation: string, line: number,
    confidence?: "EXTRACTED" | "INFERRED", weight?: number, context?: string,
  ) => void,
  ensureNamedNodeFn?: (name: string, line: number) => string,
): boolean {
  if (node.type === "enum_entry" && parentClassNid) {
    const line = node.startPosition.row + 1;
    for (const child of node.children) {
      if (child.type === "simple_identifier") {
        const caseName = _readText(child, source);
        const caseNid = _makeId(parentClassNid, caseName);
        addNodeFn(caseNid, caseName, line);
        addEdgeFn(parentClassNid, caseNid, "case_of", line);
      }
    }
    // Associated-value types nest as `enum_type_parameters -> user_type ->
    // type_identifier` (a sibling of the case-name simple_identifier). The
    // case-name loop never descends into them, so `case started(Session)` used
    // to drop the `Event -> Session` reference. Emit a `references` edge from
    // the ENUM node to each collected type (port of upstream safishamsi ad70152).
    if (ensureNamedNodeFn) {
      for (const child of node.children) {
        if (child.type !== "enum_type_parameters") continue;
        for (const grand of child.children) {
          if (!grand.isNamed) continue;
          const refs: TypeRef[] = [];
          _swiftCollectTypeRefs(grand, source, false, refs);
          for (const [refName, role] of refs) {
            const ctx = role === "generic_arg" ? "generic_arg" : "type";
            const targetNid = ensureNamedNodeFn(refName, line);
            if (targetNid !== parentClassNid) {
              addEdgeFn(parentClassNid, targetNid, "references", line, "EXTRACTED", 1.0, ctx);
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

/**
 * Return the head symbol of a TS/JS `decorator` node: `@Injectable` → the
 * identifier; `@Component({...})` / `@Input()` → the `function` of the
 * call_expression; `@ng.Component()` / `@core.Injectable` → the `property` of
 * the member_expression (the imported symbol, not the namespace alias).
 * Port of upstream safishamsi 3540416.
 */
function _tsDecoratorName(decoNode: SyntaxNode, source: string): string | null {
  for (const child of decoNode.children) {
    if (!child.isNamed) continue;
    let target: SyntaxNode = child;
    if (target.type === "call_expression") {
      target = target.childForFieldName("function") ?? target;
    }
    if (target.type === "member_expression") {
      const prop = target.childForFieldName("property");
      return prop ? _readText(prop, source) : null;
    }
    if (target.type === "identifier") {
      return _readText(target, source);
    }
    return null;
  }
  return null;
}

/** Name of a `method_definition`, matching the id the function-types branch builds. */
function _tsMethodName(methodNode: SyntaxNode, source: string): string | null {
  const nameNode = methodNode.childForFieldName("name");
  return nameNode ? _readText(nameNode, source) : null;
}

/**
 * Collect `decorator` nodes under `node` (e.g. parameter decorators inside a
 * method's formal_parameters, or a field's own decorator), without crossing
 * into a nested class or a nested method, which own their own decorators.
 */
function _tsDescendantDecorators(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const rec = (n: SyntaxNode, top: boolean): void => {
    for (const child of n.children) {
      const ct = child.type;
      if (ct === "decorator") {
        out.push(child);
      } else if (ct === "class_declaration" || ct === "abstract_class_declaration") {
        continue;
      } else if (ct === "method_definition" && !top) {
        continue;
      } else {
        rec(child, false);
      }
    }
  };
  rec(node, true);
  return out;
}

/**
 * Emit `references` edges (context="decorator") from a class and its members
 * to the symbols of the TS/JS decorators applied to them (`@Component`,
 * `@Injectable`, `@Input`, `@Inject`, `@Entity`, …). Decorators occur only on
 * classes, class members, and parameters, so a single pass over the class
 * declaration covers them. Members that are graph nodes (methods) own their
 * decorators and their parameter decorators; members that are not nodes
 * (fields, parameters) attribute to the enclosing class. Targets go through
 * `ensureNamedNode`, so a decorator imported from another module becomes a
 * sourceless stub the corpus rewire collapses onto the real definition.
 * Port of upstream safishamsi 3540416.
 */
function _tsEmitDecoratorEdges(
  classNode: SyntaxNode,
  classNid: string,
  source: string,
  ensureNamedNode: (name: string, line: number) => string,
  addEdge: (
    src: string, tgt: string, relation: string, line: number,
    confidence?: "EXTRACTED" | "INFERRED", weight?: number, context?: string,
  ) => void,
): void {
  const emit = (decoNode: SyntaxNode, ownerNid: string): void => {
    const name = _tsDecoratorName(decoNode, source);
    if (!name) return;
    const line = decoNode.startPosition.row + 1;
    const target = ensureNamedNode(name, line);
    if (target !== ownerNid) {
      addEdge(ownerNid, target, "references", line, "EXTRACTED", 1.0, "decorator");
    }
  };

  // Class-level decorators: direct children of the class node (`@Deco class C`),
  // plus — when exported (`@Deco export class C`) — the decorators that sit on
  // the wrapping export_statement, before the class.
  for (const child of classNode.children) {
    if (child.type === "decorator") emit(child, classNid);
  }
  const parent = classNode.parent;
  if (parent !== null && parent.type === "export_statement") {
    for (const child of parent.children) {
      if (child.type === "decorator") {
        emit(child, classNid);
      } else if (child.type === "class_declaration" || child.type === "abstract_class_declaration") {
        break;
      }
    }
  }

  // Member decorators inside the class body.
  const body = classNode.children.find((c) => c.type === "class_body");
  if (!body) return;
  for (const member of body.children) {
    const mt = member.type;
    if (mt === "decorator") {
      // A method decorator is a sibling preceding the method; skip past any
      // stacked decorators to find it.
      let owner = classNid;
      let sib: SyntaxNode | null = member.nextNamedSibling;
      while (sib !== null && sib.type === "decorator") {
        sib = sib.nextNamedSibling;
      }
      if (sib !== null && sib.type === "method_definition") {
        const mname = _tsMethodName(sib, source);
        if (mname) owner = _makeId(classNid, mname);
      }
      emit(member, owner);
    } else if (mt === "method_definition") {
      const mname = _tsMethodName(member, source);
      const mNid = mname ? _makeId(classNid, mname) : classNid;
      for (const deco of _tsDescendantDecorators(member)) {
        emit(deco, mNid);
      }
    } else {
      // Fields / accessors: the member is not a node, so attribute its
      // decorators (e.g. `@Input()`, `@Column()`) to the class.
      for (const deco of _tsDescendantDecorators(member)) {
        emit(deco, classNid);
      }
    }
  }
}

const _JS_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "javascript",
  tsModule: "tree_sitter_javascript",
  classTypes: new Set(["class_declaration"]),
  // generator_function_declaration: `function* g()` — absent from
  // function_types upstream too until 09aeb97; generator *methods* already
  // parse as method_definition. Port of upstream safishamsi 09aeb97.
  functionTypes: new Set(["function_declaration", "generator_function_declaration", "method_definition"]),
  // export_statement is included so the walker hands re-exports
  // (`export { X } from './m'`) to _importJs. Pure exports (no `from`)
  // fall through to walk children in _extract_generic. Port of upstream
  // safishamsi 1494874.
  importTypes: new Set(["import_statement", "export_statement"]),
  callTypes: new Set(["call_expression", "new_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["member_expression"]),
  callAccessorField: "property",
  functionBoundaryTypes: new Set(["function_declaration", "generator_function_declaration", "arrow_function", "method_definition"]),
  importHandler: _importJs,
});

const _TS_CONFIG: LanguageConfig = defaultConfig({
  tsGrammarName: "typescript",
  tsModule: "tree_sitter_typescript",
  classTypes: new Set(["class_declaration", "interface_declaration", "enum_declaration", "type_alias_declaration"]),
  // generator_function_declaration — port of upstream safishamsi 09aeb97.
  functionTypes: new Set(["function_declaration", "generator_function_declaration", "method_definition"]),
  // export_statement is included so the walker hands re-exports
  // (`export { X } from './m'`) to _importJs. Pure exports (no `from`)
  // fall through to walk children in _extract_generic. Port of upstream
  // safishamsi 1494874.
  importTypes: new Set(["import_statement", "export_statement"]),
  callTypes: new Set(["call_expression", "new_expression"]),
  callFunctionField: "function",
  callAccessorNodeTypes: new Set(["member_expression"]),
  callAccessorField: "property",
  functionBoundaryTypes: new Set(["function_declaration", "generator_function_declaration", "arrow_function", "method_definition"]),
  importHandler: _importJs,
});

const _TSX_CONFIG: LanguageConfig = defaultConfig({
  ..._TS_CONFIG,
  tsGrammarName: "tsx",
  tsModule: "tree_sitter_typescript",
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
  /**
   * Swift `extension Foo` class_declarations found in this file. tree-sitter-swift
   * parses both `class Foo` and `extension Foo` as `class_declaration`; same-file
   * duplicates collapse via seen_ids (the per-file id carries the file stem) but
   * cross-file extensions don't — they're collected here for a corpus-level
   * merge after every file has been parsed. Port of upstream safishamsi 406bea4 / #969.
   */
  swift_extensions?: Array<{ nid: string; label: string }>;
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
  // tree-sitter-swift parses both `class Foo` and `extension Foo` as
  // `class_declaration`. Same-file pairs collapse via seenIds, but cross-file
  // extensions don't (the per-file id carries the file stem), so they're
  // collected here for a corpus-level merge after every file has been parsed.
  // Port of upstream safishamsi 406bea4 / #969.
  const swiftExtensions: Array<{ nid: string; label: string }> = [];

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
    context?: string,
  ): void {
    const edge: GraphEdge = {
      source: src, target: tgt, relation,
      confidence, source_file: strPath,
      source_location: `L${line}`, weight,
    };
    // `context` labels a type-reference edge ("field" / "generic_arg" / "type" /
    // "attribute"), mirroring upstream's `add_edge(..., context=...)`. Additive:
    // only set when supplied so existing edges are byte-for-byte unchanged.
    if (context) edge.context = context;
    edges.push(edge);
  }

  /**
   * Resolve a referenced type name to a node id, mirroring upstream's
   * `ensure_named_node`. Prefer a same-file, stem-qualified definition; else
   * emit a SOURCELESS stub (empty source_file) so the corpus-level cross-file
   * rewire can collapse it onto the real definition (same shape the inherits /
   * implements ports use). Deterministic and additive.
   */
  function ensureNamedNode(name: string, _line: number): string {
    let nid = _makeId(stem, name);
    if (seenIds.has(nid)) return nid;
    nid = _makeId(name);
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({
        id: nid, label: name, file_type: "code",
        source_file: "", source_location: "",
      });
    }
    return nid;
  }

  /**
   * Emit `references` edges from `sourceNid` to each collected type ref. A
   * generic argument keeps `generic_arg` context; every other role uses
   * `baseContext` (e.g. "field" for a field/property declaration, "type" for a
   * Swift enum associated value). Self-references are skipped.
   */
  function emitTypeRefs(
    sourceNid: string, refs: TypeRef[], line: number, baseContext: string,
  ): void {
    for (const [refName, role] of refs) {
      const ctx = role === "generic_arg" ? "generic_arg" : baseContext;
      const targetNid = ensureNamedNode(refName, line);
      if (targetNid !== sourceNid) {
        addEdge(sourceNid, targetNid, "references", line, "EXTRACTED", 1.0, ctx);
      }
    }
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function walk(node: SyntaxNode, parentClassNid: string | null = null): void {
    const t = node.type;

    // Import types
    if (config.importTypes.has(t)) {
      if (config.importHandler) {
        config.importHandler(node, source, fileNid, stem, edges, strPath, rootDir);
      }
      // Port of upstream safishamsi 1494874: an `export_statement` without a
      // `from` clause (`export const x = 1`, `export function foo() {}`,
      // `export { localVar }`) is NOT a re-export — fall through and walk
      // children so the local declaration / specifier still becomes a node.
      if (t === "export_statement") {
        const hasSource = node.children.some((c) => c.type === "string");
        if (!hasSource) {
          for (const child of node.children) {
            walk(child, parentClassNid);
          }
        }
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

      // TS/JS decorators on the class and its members (@Component,
      // @Injectable, @Input, @Inject, @Entity, …). Decorators live only in
      // class subtrees. Port of upstream safishamsi 3540416.
      if (config.tsModule === "tree_sitter_javascript" || config.tsModule === "tree_sitter_typescript") {
        _tsEmitDecoratorEdges(node, classNid, source, ensureNamedNode, addEdge);
      }

      // Swift extension dedup: tree-sitter-swift parses both `class Foo` and
      // `extension Foo` as `class_declaration`, with `extension Foo` carrying
      // an "extension" child node. Collect these so a corpus-level merge can
      // collapse cross-file extension nodes onto their canonical type. Port
      // of upstream safishamsi 406bea4 / #969.
      if (config.tsModule === "tree_sitter_swift" &&
          node.children.some((c) => c.type === "extension")) {
        swiftExtensions.push({ nid: classNid, label: className });
      }

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

      // Kotlin-specific: delegation_specifiers → inherits
      // (constructor_invocation) / implements (user_type), including the
      // `class Foo : Bar by baz` form which wraps the delegated interface in
      // an `explicit_delegation` node. Port of upstream safishamsi kotlin
      // delegation handling + 9b04022 (by-delegation branch). Generic-arg
      // reference recovery is deferred with the kotlin type-refs collector
      // (Lot 2 kotlin slice not yet ported).
      if (config.tsModule === "tree_sitter_kotlin") {
        for (const child of node.children) {
          if (child.type !== "delegation_specifiers") continue;
          for (const spec of child.children) {
            if (spec.type !== "delegation_specifier") continue;
            let relation = "implements";
            let userTypeNode: SyntaxNode | null = null;
            for (const sub of spec.children) {
              if (sub.type === "constructor_invocation") {
                relation = "inherits";
                for (const inner of sub.children) {
                  if (inner.type === "user_type") {
                    userTypeNode = inner;
                    break;
                  }
                }
                break;
              }
              if (sub.type === "user_type") {
                userTypeNode = sub;
                break;
              }
              // `class Foo : Bar by baz` wraps the delegated interface `Bar`
              // in an `explicit_delegation` node; grab its first `user_type`
              // descendant so the implements edge still fires (9b04022).
              if (sub.type === "explicit_delegation") {
                for (const inner of sub.children) {
                  if (inner.type === "user_type") {
                    userTypeNode = inner;
                    break;
                  }
                }
                break;
              }
            }
            if (!userTypeNode) continue;
            const base = _kotlinUserTypeName(userTypeNode, source);
            if (!base) continue;
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
            addEdge(classNid, baseNid, relation, line);
          }
        }
      }

      // Ruby-specific: `class Dog < Animal` puts the base class in the
      // `superclass` field (a `<` token followed by a `constant` or a
      // `scope_resolution`). There was no Ruby branch, so every Ruby inherits
      // edge was silently dropped. Port of upstream safishamsi a19b9e9.
      if (config.tsModule === "tree_sitter_ruby") {
        const sup = node.childForFieldName("superclass");
        if (sup) {
          let base = "";
          for (const sub of sup.children) {
            if (sub.type === "constant") {
              base = _readText(sub, source);
              break;
            }
            if (sub.type === "scope_resolution") {
              const consts = sub.children.filter((c) => c.type === "constant");
              if (consts.length > 0) base = _readText(consts[consts.length - 1]!, source);
              break;
            }
          }
          if (base) {
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

      // C++: `class Car : public Base<Dep>` — the `base_class_clause` carries
      // the inherited type(s). Emit an `inherits` edge on each base name and, for
      // a templated base, `generic_arg` references for its template arguments
      // (port of upstream safishamsi 21bcb43). This also closes the prior gap
      // where C++ emitted no `inherits` edge at all — the class handler had no
      // C++ branch, so `_cpp_collect_type_refs` handles nested/qualified args
      // (`Base<std::vector<Dep>>`) too.
      if (config.tsModule === "tree_sitter_cpp") {
        for (const child of node.children) {
          if (child.type !== "base_class_clause") continue;
          for (const sub of child.children) {
            let base = "";
            let templateArgsNode: SyntaxNode | null = null;
            if (sub.type === "type_identifier") {
              base = _readText(sub, source);
            } else if (sub.type === "qualified_identifier") {
              // Use the unqualified tail so "std::vector" matches a "vector"
              // node id if one exists; fall back to the full qualified text.
              const tail = sub.childForFieldName("name");
              base = tail ? _readText(tail, source) : _readText(sub, source);
            } else if (sub.type === "template_type") {
              const tname = sub.childForFieldName("name");
              base = tname ? _readText(tname, source) : _readText(sub, source);
              templateArgsNode = sub.childForFieldName("arguments");
            } else {
              continue;
            }
            if (!base) continue;
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
            if (templateArgsNode) {
              const argRefs: TypeRef[] = [];
              for (const arg of templateArgsNode.children) {
                if (arg.isNamed) _cppCollectTypeRefs(arg, source, true, argRefs);
              }
              for (const [refName] of argRefs) {
                const targetNid = ensureNamedNode(refName, line);
                if (targetNid !== classNid) {
                  addEdge(classNid, targetNid, "references", line, "EXTRACTED", 1.0, "generic_arg");
                }
              }
            }
          }
        }
      }

      // TypeScript / JavaScript: emit inherits/implements edges from heritage
      // clauses.  Two cases (port of upstream 88a8e3b #1095):
      //
      //  1. class_heritage / extends_clause — `class Foo extends Bar` and
      //     `class Foo implements IBar`.  Iterated over the heritage node's
      //     children looking for extends_clause and implements_clause.
      //
      //  2. extends_type_clause — `interface IFoo extends IBar, IBaz`.
      //     This node is NOT inside class_heritage; it's a sibling of the
      //     interface body.  Without this branch interface inheritance is
      //     silently dropped (#1095).
      //
      // Resolution: same-file symbols resolve via `labelToNid` (which covers
      // both same-file and cross-file); cross-file resolution happens in the
      // post-extract pass.  Emitting a stub node for unknown bases mirrors
      // the Python/Java approach so downstream analysis can see the edge even
      // when the base type lives in an unindexed package.
      if (config.tsModule === "tree_sitter_typescript" ||
          config.tsModule === "tree_sitter_javascript") {
        const emitHeritage = (baseName: string, relation: string, lineNum: number): void => {
          if (!baseName || LANGUAGE_BUILTIN_GLOBALS.has(baseName)) return;
          // Try same-file stem-qualified id first (the base class is likely in
          // the same file).  If not found, emit a stub with an empty source_file
          // so the cross-file post-extract pass and buildFromJson can resolve it.
          // Note: labelToNid is built AFTER walk() so we resolve against seenIds
          // directly here (port of upstream 88a8e3b #1095).
          let baseNid = _makeId(stem, baseName);
          if (!seenIds.has(baseNid)) {
            // Try bare global id (class declared with a different stem or in
            // another file already walked).
            const globalId = _makeId(baseName);
            if (seenIds.has(globalId)) {
              baseNid = globalId;
            } else {
              // Emit a stub so the edge target exists; buildFromJson deduplicates
              // stubs with their authoritative node once cross-file merging runs.
              nodes.push({
                id: baseNid, label: baseName, file_type: "code",
                source_file: "", source_location: "",
              });
              seenIds.add(baseNid);
            }
          }
          addEdge(classNid, baseNid, relation, lineNum);
        };

        // Walk node children for class_heritage / extends_type_clause.
        for (const child of node.children) {
          if (child.type === "class_heritage") {
            // class Foo extends Bar implements IFoo
            for (const hChild of child.children) {
              if (hChild.type === "extends_clause") {
                // `extends X` — single base class
                for (const sub of hChild.children) {
                  if (sub.type === "type_identifier" || sub.type === "identifier") {
                    emitHeritage(_readText(sub, source), "inherits", child.startPosition.row + 1);
                  }
                }
              } else if (hChild.type === "implements_clause") {
                // `implements X, Y, Z`
                for (const sub of hChild.children) {
                  if (sub.type === "type_identifier" || sub.type === "identifier") {
                    emitHeritage(_readText(sub, source), "implements", child.startPosition.row + 1);
                  }
                }
              }
            }
          } else if (child.type === "extends_type_clause") {
            // interface IFoo extends IBar, IBaz  (interface heritage, NOT class_heritage)
            for (const sub of child.children) {
              if (sub.type === "type_identifier" || sub.type === "identifier") {
                emitHeritage(_readText(sub, source), "inherits", child.startPosition.row + 1);
              }
            }
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

    // PHP 8 constructor property promotion: `__construct(private Repo $repo)`
    // parses the promoted param as `property_promotion_parameter`. A promoted
    // param is also a real class field, so emit a `field`-context reference on
    // the class (port of upstream safishamsi 51f805e). Runs before the function
    // handler and does NOT return, so the constructor is still processed
    // normally as a method.
    if (config.tsModule === "tree_sitter_php" && t === "method_declaration" && parentClassNid) {
      const params = node.children.find((c) => c.type === "formal_parameters");
      if (params) {
        for (const p of params.children) {
          if (p.type !== "property_promotion_parameter") continue;
          const typeNode = p.children.find((sub) => _PHP_TYPE_NODES.has(sub.type));
          if (!typeNode) continue;
          const line = p.startPosition.row + 1;
          const refs: TypeRef[] = [];
          _phpCollectTypeRefs(typeNode, source, false, refs);
          emitTypeRefs(parentClassNid, refs, line, "field");
        }
      }
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
        parentClassNid, addNode, addEdge, rootDir)) {
        return;
      }
    }

    // TS namespace / module containers (internal_module, module) — port of
    // upstream safishamsi 869aaf7.
    if (config.tsModule === "tree_sitter_typescript") {
      if (_tsExtraWalk(node, source, fileNid, stem, parentClassNid, addNode, addEdge, walk)) {
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
        parentClassNid, addNode, addEdge, ensureNamedNode)) {
        return;
      }
    }

    // Python: decorated_definition is a transparent wrapper around a
    // function_definition (@property / @staticmethod / @classmethod).
    // The default recurse below would pass null as parentClassNid, causing the
    // inner function_definition to be emitted with a class-unqualified node id
    // (e.g. `file_baz` instead of `file_bar_baz`).  Treat decorated_definition
    // as transparent so the parentClassNid propagates to the real function node
    // (port of upstream 9f73400 #1050).
    if (config.tsModule === "tree_sitter_python" && t === "decorated_definition") {
      for (const child of node.children) {
        walk(child, parentClassNid);
      }
      return;
    }

    // ── Type/field/generic-arg references (Lot 2) ──────────────────────────
    // Class field / property / var declarations emit `references` edges to
    // their declared type(s), including generic arguments. These nodes are
    // direct children of a class body, so `parentClassNid` is set when they are
    // reached. Each branch mirrors the corresponding upstream safishamsi fix.

    // Java: `private Repo<Config> repo;` — field type references (#1485), with
    // in-scope type parameters skipped (#1518).
    if (config.tsModule === "tree_sitter_java" && t === "field_declaration" && parentClassNid) {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        const line = node.startPosition.row + 1;
        const refs: TypeRef[] = [];
        _javaCollectTypeRefs(typeNode, source, false, refs);
        emitTypeRefs(parentClassNid, refs, line, "field");
      }
      return;
    }

    // PHP: `private Repo $repo;` — typed class property references. The type
    // sits as the first type-shaped direct child of the property_declaration.
    if (config.tsModule === "tree_sitter_php" && t === "property_declaration" && parentClassNid) {
      const typeNode = node.children.find((c) => _PHP_TYPE_NODES.has(c.type));
      if (typeNode) {
        const line = node.startPosition.row + 1;
        const refs: TypeRef[] = [];
        _phpCollectTypeRefs(typeNode, source, false, refs);
        emitTypeRefs(parentClassNid, refs, line, "field");
      }
      return;
    }

    // C#: field type references. The type is on the node's `type` field or,
    // for a `T x;` field, nested in a `variable_declaration`.
    if (config.tsModule === "tree_sitter_c_sharp" && t === "field_declaration" && parentClassNid) {
      let typeNode = node.childForFieldName("type");
      if (!typeNode) {
        for (const child of node.children) {
          if (child.type === "variable_declaration") {
            typeNode = child.childForFieldName("type");
            if (typeNode) break;
          }
        }
      }
      if (typeNode) {
        const line = node.startPosition.row + 1;
        const refs: TypeRef[] = [];
        _csharpCollectTypeRefs(typeNode, source, false, refs);
        emitTypeRefs(parentClassNid, refs, line, "field");
      }
      return;
    }

    // C#: auto-property type references (`public Widget Main { get; set; }`) —
    // the idiomatic way to declare state, previously dropped (port of upstream
    // safishamsi bb5e519). A property exposes its type directly on the node.
    if (config.tsModule === "tree_sitter_c_sharp" && t === "property_declaration" && parentClassNid) {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        const line = node.startPosition.row + 1;
        const refs: TypeRef[] = [];
        _csharpCollectTypeRefs(typeNode, source, false, refs);
        emitTypeRefs(parentClassNid, refs, line, "field");
      }
      return;
    }

    // Scala: `val a: Repo` / `var b: Repo` — field type references. val and var
    // are structurally identical (both expose a `type` field); `var_definition`
    // was the specific upstream fix (67b4525). Falls through (no return) so any
    // call expressions in the initializer are still walked.
    if (config.tsModule === "tree_sitter_scala"
        && (t === "val_definition" || t === "var_definition")
        && parentClassNid) {
      const typeNode = node.childForFieldName("type");
      if (typeNode) {
        const line = node.startPosition.row + 1;
        const refs: TypeRef[] = [];
        _scalaCollectTypeRefs(typeNode, source, false, refs);
        emitTypeRefs(parentClassNid, refs, line, "field");
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

  function emitCallByName(calleeName: string | null, node: SyntaxNode, callerNid: string): void {
    if (!calleeName) return;
    // Filter language built-ins so they never become god-nodes (port of upstream
    // 80301a0 #916: `_LANGUAGE_BUILTIN_GLOBALS` filter on callee resolution).
    if (LANGUAGE_BUILTIN_GLOBALS.has(calleeName)) return;
    const tgtNid = resolveCalleeNid(labelToNid, calleeName, config.tsModule);
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
      } else if (config.tsModule === "tree_sitter_javascript" || config.tsModule === "tree_sitter_typescript") {
        const calleeField = node.type === "new_expression" ? "constructor" : config.callFunctionField;
        calleeName = _readJsCalleeName(calleeField ? node.childForFieldName(calleeField) : null, source);
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

      emitCallByName(calleeName, node, callerNid);
    }

    for (const child of node.children) {
      walkCalls(child, callerNid);
    }
  }

  function walkJsTsDescendantCalls(bodyNode: SyntaxNode, callerNid: string): void {
    const callNodes = bodyNode.descendantsOfType(["call_expression", "new_expression"]) as SyntaxNode[];
    for (const callNode of callNodes) {
      let nested = false;
      let cur = callNode.parent;
      while (cur && !(cur.startIndex === bodyNode.startIndex && cur.endIndex === bodyNode.endIndex)) {
        if (config.functionBoundaryTypes.has(cur.type)) {
          nested = true;
          break;
        }
        cur = cur.parent;
      }
      if (nested) continue;
      const calleeField = callNode.type === "new_expression" ? "constructor" : config.callFunctionField;
      emitCallByName(_readJsCalleeName(calleeField ? callNode.childForFieldName(calleeField) : null, source), callNode, callerNid);
    }
  }

  for (const [callerNid, bodyNode] of functionBodies) {
    walkCalls(bodyNode, callerNid);
    if (config.tsModule === "tree_sitter_javascript" || config.tsModule === "tree_sitter_typescript") {
      walkJsTsDescendantCalls(bodyNode, callerNid);
    }
  }

  // -- Clean edges --
  const validIds = seenIds;
  const cleanEdges = edges.filter((edge) => {
    const src = edge.source;
    const tgt = edge.target;
    // `re_exports` is allow-listed alongside `imports`/`imports_from` so a
    // barrel re-export edge can land on a symbol that lives in another file
    // (i.e. the target id won't be in this file's seenIds). Port of upstream
    // safishamsi 1494874.
    return validIds.has(src) && (
      validIds.has(tgt)
      || edge.relation === "imports"
      || edge.relation === "imports_from"
      || edge.relation === "re_exports"
    );
  });

  const result: ExtractionResult = { nodes, edges: cleanEdges };
  if (swiftExtensions.length > 0) {
    result.swift_extensions = swiftExtensions;
  }
  return result;
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
  const ext = extname(filePath).toLowerCase();
  // `.mts`/`.cts` are TypeScript module/CommonJS variants — parse with the TS
  // grammar (the JS grammar drops `type`/`interface` declarations). Port of
  // upstream 1226c34.
  const config = ext === ".tsx"
    ? _TSX_CONFIG
    : ext === ".ts" || ext === ".mts" || ext === ".cts"
      ? _TS_CONFIG
      : _JS_CONFIG;
  const result = await _extractGeneric(filePath, config, rootDir);
  if (!result.error) {
    _extractJsRationale(filePath, result, rootDir);
  }
  return result;
}

// ---------------------------------------------------------------------------
// JS/TS rationale + doc-reference extraction
//
// Parity with _extractPythonRationale (port of upstream safishamsi 6d3a6f1):
// Python files get rationale nodes from docstrings and `# NOTE:`-style
// comments, but JS/TS comments were discarded entirely. That silently drops
// two high-value signals in mixed corpora:
//   1. rationale comments (`// NOTE:`, `// WHY:`, …) — same as Python;
//   2. architecture-decision references (`ADR-0011`, `RFC 793`) that teams
//      conventionally cite in file/function headers. These are the natural
//      join points between code and design docs in the same graph — without
//      them, code<->ADR edges never form even when the code cites the ADR.
// ---------------------------------------------------------------------------

const _JS_RATIONALE_PREFIXES = [
  "// NOTE:", "// IMPORTANT:", "// HACK:", "// WHY:", "// RATIONALE:",
  "// TODO:", "// FIXME:",
  "* NOTE:", "* IMPORTANT:", "* HACK:", "* WHY:", "* RATIONALE:",
  "* TODO:", "* FIXME:",
];

// Doc-reference tokens worth first-classing as graph nodes. Deliberately
// conservative: ADR-NNNN (any zero padding) and RFC NNNN / RFC-NNNN.
const _JS_DOC_REF_RE = /\b(ADR[- ]?\d{1,5}|RFC[- ]?\d{1,5})\b/gi;

// Only look for doc references inside comments, not string literals or code.
const _JS_COMMENT_LINE_RE = /^\s*(\/\/|\/\*|\*)/;

/**
 * Post-pass: extract rationale comments and ADR/RFC doc references from JS/TS
 * source. Mutates `result` in place (appends nodes/edges). Text-based, no
 * parser needed. Port of upstream safishamsi 6d3a6f1.
 */
function _extractJsRationale(
  filePath: string,
  result: ExtractionResult,
  rootDir: string = dirname(resolve(filePath)),
): void {
  let sourceText: string;
  try {
    sourceText = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  const stem = qualifiedFileStem(filePath, rootDir);
  const strPath = filePath;
  const { nodes, edges } = result;
  const seenIds = new Set(nodes.map((n) => n.id));
  const fileNid = _makeId(stem);
  const seenDocRefs = new Set<string>();

  const addRationale = (text: string, line: number): void => {
    const label = text.slice(0, 80).replace(/[\r\n]+/g, " ").trim();
    const rid = _makeId(stem, "rationale", String(line));
    if (!seenIds.has(rid)) {
      seenIds.add(rid);
      nodes.push({
        id: rid, label, file_type: "rationale",
        source_file: strPath, source_location: `L${line}`,
      });
    }
    edges.push({
      source: rid, target: fileNid, relation: "rationale_for",
      confidence: "EXTRACTED", source_file: strPath,
      source_location: `L${line}`, weight: 1.0,
    });
  };

  const addDocRef = (token: string, line: number): void => {
    // Normalize "adr 11" / "ADR-0011" spellings to a canonical "ADR-0011"
    // style label so references to the same document collapse to one node.
    const m = /^([A-Za-z]+)[- ]?(\d+)$/.exec(token);
    if (!m) return;
    const kind = m[1]!.toUpperCase();
    const num = m[2]!;
    const label = kind === "ADR" ? `${kind}-${num.padStart(4, "0")}` : `${kind}-${num}`;
    if (seenDocRefs.has(label)) return;
    seenDocRefs.add(label);
    const rid = _makeId("docref", label);
    if (!seenIds.has(rid)) {
      seenIds.add(rid);
      nodes.push({
        id: rid, label, file_type: "doc_ref",
        source_file: strPath, source_location: `L${line}`,
      });
    }
    edges.push({
      source: fileNid, target: rid, relation: "cites",
      confidence: "EXTRACTED", source_file: strPath,
      source_location: `L${line}`, weight: 1.0,
    });
  };

  const lines = sourceText.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!;
    const lineno = i + 1;
    const stripped = lineText.trim();
    if (_JS_RATIONALE_PREFIXES.some((p) => stripped.startsWith(p))) {
      addRationale(stripped.replace(/^[/* ]+/, ""), lineno);
    }
    if (_JS_COMMENT_LINE_RE.test(lineText)) {
      for (const match of stripped.matchAll(_JS_DOC_REF_RE)) {
        addDocRef(match[1]!, lineno);
      }
    }
  }
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
    /\bdef\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\b(?:void|int|double|num|String|bool|dynamic|Future(?:<[^>]+>)?)\s+([A-Za-z_$][\w$]*)\s*\(/g,
  ];
  for (const pattern of functionPatterns) {
    for (const match of source.matchAll(pattern)) {
      addNode(match[1]!, `${match[1]!}()`, "contains", match.index ?? 0);
    }
  }

  const quotedFunctionPattern = /\bdef\s+["']([^"']+)["']\s*\(/g;
  for (const match of source.matchAll(quotedFunctionPattern)) {
    addNode(match[1]!, `${match[1]!}()`, "contains", match.index ?? 0);
  }

  const rFunctionPattern = /(?:^|\n)\s*([A-Za-z_.][\w.]*)\s*(?:<-|=)\s*function\s*\(/g;
  for (const match of source.matchAll(rFunctionPattern)) {
    addNode(match[1]!, `${match[1]!}()`, "contains", match.index ?? 0);
  }

  const fortranPattern = /^\s*(program|module|subroutine|function)\s+([A-Za-z_]\w*)/gim;
  for (const match of source.matchAll(fortranPattern)) {
    const kind = match[1]!.toLowerCase();
    if (kind === "module" && source.slice(match.index ?? 0, (match.index ?? 0) + match[0].length).toLowerCase().includes("procedure")) {
      continue;
    }
    const name = match[2]!;
    const label = kind === "subroutine" || kind === "function" ? `${name}()` : name;
    addNode(name, label, "contains", match.index ?? 0);
  }

  const modulePattern = /\bmodule\s+([A-Za-z_$][\w$]*)\b/g;
  for (const match of source.matchAll(modulePattern)) {
    addNode(match[1]!, match[1]!, "contains", match.index ?? 0);
  }

  return { nodes, edges };
}

const GROOVY_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "new", "throw", "assert",
  "def", "class", "interface", "trait", "enum", "super", "this",
]);

function simpleGroovyTypeName(raw: string): string {
  return raw
    .replace(/<[^<>]*>/gu, "")
    .replace(/\[\s*\]/gu, "")
    .trim()
    .split(".")
    .filter(Boolean)
    .pop()
    ?.replace(/[^\w$].*$/u, "")
    .trim() ?? "";
}

function braceDelta(text: string): number {
  let delta = 0;
  for (const char of text) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

async function extractGroovy(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const stem = qualifiedFileStem(filePath, rootDir);
  const fileNid = _makeId(stem);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const classIdsByName = new Map<string, string>();
  const methodsByClass = new Map<string, Map<string, string>>();
  const pendingCalls: Array<{ source: string; classId: string; callee: string; line: number }> = [];

  function addNode(nid: string, label: string, line: number, sourceFile: string = filePath): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({
        id: nid,
        label,
        file_type: "code",
        source_file: sourceFile,
        source_location: sourceFile ? `L${line}` : "",
      });
    }
  }

  function addEdge(src: string, tgt: string, relation: string, line: number, extra: Record<string, unknown> = {}): void {
    edges.push({
      source: src,
      target: tgt,
      relation,
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${line}`,
      weight: 1.0,
      ...extra,
    });
  }

  function addExternalType(rawName: string): string | null {
    const name = simpleGroovyTypeName(rawName);
    if (!name) return null;
    const existing = classIdsByName.get(name.toLowerCase());
    if (existing) return existing;
    const nid = _makeId(name);
    addNode(nid, name, 1, "");
    return nid;
  }

  function addMethod(classId: string, name: string, label: string, line: number): string {
    const nid = _makeId(classId, name);
    addNode(nid, label, line);
    addEdge(classId, nid, "method", line);
    const classMethods = methodsByClass.get(classId) ?? new Map<string, string>();
    classMethods.set(name.toLowerCase(), nid);
    methodsByClass.set(classId, classMethods);
    return nid;
  }

  function scanCalls(lineText: string, callerId: string, classId: string, line: number): void {
    const callPattern = /\b([A-Za-z_$][\w$]*)\s*\(/gu;
    for (const match of lineText.matchAll(callPattern)) {
      const callee = match[1]!;
      const index = match.index ?? 0;
      const previous = index > 0 ? lineText[index - 1] ?? "" : "";
      if (previous === "." || previous === "$" || /[A-Za-z0-9_]/u.test(previous)) continue;
      if (GROOVY_KEYWORDS.has(callee)) continue;
      pendingCalls.push({ source: callerId, classId, callee, line });
    }
  }

  addNode(fileNid, basename(filePath), 1);

  for (const match of source.matchAll(/^\s*import\s+(?:static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$*][\w$*]*)*)/gmu)) {
    const imported = match[1]!;
    const targetName = simpleGroovyTypeName(imported.replace(/\.\*$/u, ""));
    if (!targetName) continue;
    addEdge(fileNid, _makeId(targetName), "imports", lineForIndex(source, match.index ?? 0), { context: "import" });
  }

  const lines = source.split(/\r?\n/u);
  let currentClass: { id: string; name: string; depth: number } | null = null;
  let currentMethod: { id: string; classId: string; depth: number } | null = null;

  const classPattern = /^\s*(?:(?:@\w+(?:\([^)]*\))?|public|private|protected|abstract|final|static)\s+)*(class|interface|trait|enum)\s+([A-Za-z_$][\w$]*)([^{]*)/u;
  const quotedFeaturePattern = /^\s*def\s+(?:"([^"]+)"|'([^']+)')\s*\([^)]*\)\s*\{?/u;
  const methodPattern = /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*(?:(?:def|[A-Za-z_$][\w$]*(?:\s*<[^>{};]+>)?(?:\s*\[\])?(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{?/u;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const lineText = lines[index]!;

    if (!currentClass) {
      const classMatch = classPattern.exec(lineText);
      if (!classMatch) continue;

      const className = classMatch[2]!;
      const classId = _makeId(stem, className);
      addNode(classId, className, lineNumber);
      addEdge(fileNid, classId, "contains", lineNumber);
      classIdsByName.set(className.toLowerCase(), classId);

      const suffix = classMatch[3] ?? "";
      const extendsMatch = /\bextends\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/u.exec(suffix);
      if (extendsMatch) {
        const parentId = addExternalType(extendsMatch[1]!);
        if (parentId) addEdge(classId, parentId, "inherits", lineNumber);
      }
      const implementsMatch = /\bimplements\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*,\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)*)/u.exec(suffix);
      if (implementsMatch) {
        for (const implemented of implementsMatch[1]!.split(",")) {
          const targetId = addExternalType(implemented);
          if (targetId) addEdge(classId, targetId, "implements", lineNumber);
        }
      }

      currentClass = { id: classId, name: className, depth: braceDelta(lineText) };
      if (currentClass.depth <= 0) currentClass.depth = 1;
      continue;
    }

    if (!currentMethod) {
      const featureMatch = quotedFeaturePattern.exec(lineText);
      const methodMatch = featureMatch ? null : methodPattern.exec(lineText);
      const methodName = featureMatch?.[1] ?? featureMatch?.[2] ?? methodMatch?.[1] ?? null;
      if (methodName && !GROOVY_KEYWORDS.has(methodName)) {
        const label = `${methodName}()`;
        const methodId = addMethod(currentClass.id, methodName, label, lineNumber);
        const openBraceIndex = lineText.indexOf("{");
        currentMethod = {
          id: methodId,
          classId: currentClass.id,
          depth: openBraceIndex >= 0 ? braceDelta(lineText.slice(openBraceIndex)) : 0,
        };
        if (openBraceIndex >= 0) {
          scanCalls(lineText.slice(openBraceIndex + 1), methodId, currentClass.id, lineNumber);
        }
        if (currentMethod.depth <= 0) {
          currentMethod = null;
        }
      }
    } else {
      scanCalls(lineText, currentMethod.id, currentMethod.classId, lineNumber);
      currentMethod.depth += braceDelta(lineText);
      if (currentMethod.depth <= 0) {
        currentMethod = null;
      }
    }

    currentClass.depth += braceDelta(lineText);
    if (currentClass.depth <= 0) {
      currentClass = null;
      currentMethod = null;
    }
  }

  for (const call of pendingCalls) {
    const target = methodsByClass.get(call.classId)?.get(call.callee.toLowerCase());
    if (target && target !== call.source) {
      addEdge(call.source, target, "calls", call.line);
    }
  }

  return { nodes, edges };
}

const SQL_IDENT = String.raw`(?:"[^"]+"|\[[^\]]+\]|` + "`[^`]+`" + String.raw`|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|\[[^\]]+\]|` + "`[^`]+`" + String.raw`|[A-Za-z_][\w$]*))*`;

function normalizeSqlObjectName(value: string): string {
  return value
    .split(".")
    .map((part) => part.trim().replace(/^["`\[]|["`\]]$/gu, ""))
    .filter(Boolean)
    .join(".");
}

function sqlStatementBlock(source: string, startIndex: number): string {
  const tail = source.slice(startIndex);
  const nextStatement = /(?:^|\n)\s*(?:create|alter|set\s+term|declare\s+external)\b/giu;
  nextStatement.lastIndex = 1;
  const next = nextStatement.exec(tail);
  if (!next) return tail;
  return tail.slice(0, next.index);
}

export async function extractSql(filePath: string, rootDir?: string): Promise<ExtractionResult> {
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
  const tableIds = new Map<string, string>();
  const sqlObjectIds = new Map<string, string>();

  function addTable(rawName: string, index: number): string {
    const name = normalizeSqlObjectName(rawName);
    const key = name.toLowerCase();
    const existing = tableIds.get(key);
    if (existing) return existing;
    const nid = _makeId(stem, name);
    tableIds.set(key, nid);
    nodes.push({
      id: nid,
      label: name,
      file_type: "code",
      source_file: filePath,
      source_location: `L${lineForIndex(source, index)}`,
    });
    edges.push({
      source: fileNid,
      target: nid,
      relation: "contains",
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${lineForIndex(source, index)}`,
      weight: 1.0,
    });
    return nid;
  }

  function addSqlObject(rawName: string, label: string, index: number): string {
    const name = normalizeSqlObjectName(rawName);
    const key = name.toLowerCase();
    const existing = sqlObjectIds.get(key);
    if (existing) return existing;
    const nid = _makeId(stem, name);
    sqlObjectIds.set(key, nid);
    nodes.push({
      id: nid,
      label,
      file_type: "code",
      source_file: filePath,
      source_location: `L${lineForIndex(source, index)}`,
    });
    edges.push({
      source: fileNid,
      target: nid,
      relation: "contains",
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${lineForIndex(source, index)}`,
      weight: 1.0,
    });
    return nid;
  }

  function addReference(sourceName: string, targetName: string, index: number): void {
    const sourceId = addTable(sourceName, index);
    const targetId = addTable(targetName, index);
    edges.push({
      source: sourceId,
      target: targetId,
      relation: "references",
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${lineForIndex(source, index)}`,
      weight: 1.0,
    });
  }

  const createTablePattern = new RegExp(
    String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(${SQL_IDENT})\s*\(([\s\S]*?)\)\s*;`,
    "giu",
  );
  for (const match of source.matchAll(createTablePattern)) {
    const tableName = match[1]!;
    addTable(tableName, match.index ?? 0);
    const body = match[2] ?? "";
    const bodyOffset = (match.index ?? 0) + match[0].indexOf(body);
    const referencePattern = new RegExp(String.raw`\breferences\s+(${SQL_IDENT})`, "giu");
    for (const ref of body.matchAll(referencePattern)) {
      addReference(tableName, ref[1]!, bodyOffset + (ref.index ?? 0));
    }
  }

  const alterFkPattern = new RegExp(
    String.raw`\balter\s+table\s+(?:only\s+)?(${SQL_IDENT})[\s\S]*?\bforeign\s+key\s*\([^)]*\)\s*references\s+(${SQL_IDENT})`,
    "giu",
  );
  for (const match of source.matchAll(alterFkPattern)) {
    addReference(match[1]!, match[2]!, match.index ?? 0);
  }

  const emittedReferences = new Set(
    edges
      .filter((edge) => edge.relation === "references")
      .map((edge) => `${edge.source}\0${edge.target}`),
  );
  const createTableStartPattern = new RegExp(String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(${SQL_IDENT})\s*\(`, "giu");
  for (const match of source.matchAll(createTableStartPattern)) {
    const tableName = match[1]!;
    const tableId = addTable(tableName, match.index ?? 0);
    const block = sqlStatementBlock(source, match.index ?? 0);
    const referencePattern = new RegExp(String.raw`\breferences\s+(${SQL_IDENT})`, "giu");
    for (const ref of block.matchAll(referencePattern)) {
      const targetId = addTable(ref[1]!, (match.index ?? 0) + (ref.index ?? 0));
      const key = `${tableId}\0${targetId}`;
      if (emittedReferences.has(key)) continue;
      emittedReferences.add(key);
      edges.push({
        source: tableId,
        target: targetId,
        relation: "references",
        confidence: "EXTRACTED",
        source_file: filePath,
        source_location: `L${lineForIndex(source, (match.index ?? 0) + (ref.index ?? 0))}`,
        weight: 1.0,
      });
    }
  }

  const nonTableSqlWords = new Set([
    "select", "where", "set", "dual", "null", "true", "false", "first", "skip",
    "rows", "next", "only", "lateral", "values", "new", "old",
  ]);

  function addSqlBodyTableEdges(sourceId: string, block: string, blockOffset: number): void {
    const bodyMatch = /\bbegin\b/i.exec(block);
    if (!bodyMatch) return;
    const body = block.slice(bodyMatch.index);
    const bodyOffset = blockOffset + bodyMatch.index;
    const seen = new Set<string>();
    const accessPattern = new RegExp(String.raw`\b(?:from|join|into|update)\s+(?:only\s+)?(${SQL_IDENT})`, "giu");
    for (const match of body.matchAll(accessPattern)) {
      const tableName = normalizeSqlObjectName(match[1]!);
      const simpleName = tableName.split(".").pop()?.toLowerCase() ?? "";
      if (!tableName || nonTableSqlWords.has(tableName.toLowerCase()) || nonTableSqlWords.has(simpleName)) continue;
      const tableId = addTable(tableName, bodyOffset + (match.index ?? 0));
      if (seen.has(tableId)) continue;
      seen.add(tableId);
      edges.push({
        source: sourceId,
        target: tableId,
        relation: "reads_from",
        confidence: "EXTRACTED",
        source_file: filePath,
        source_location: `L${lineForIndex(source, bodyOffset + (match.index ?? 0))}`,
        weight: 1.0,
      });
    }
  }

  const createTriggerPattern = new RegExp(
    String.raw`\bcreate\s+(?:or\s+(?:replace|alter)\s+)?(?:constraint\s+)?trigger\s+(${SQL_IDENT})\b`,
    "giu",
  );
  for (const match of source.matchAll(createTriggerPattern)) {
    const triggerName = normalizeSqlObjectName(match[1]!);
    const triggerId = addSqlObject(triggerName, triggerName, match.index ?? 0);
    const block = sqlStatementBlock(source, match.index ?? 0);
    const blockOffset = match.index ?? 0;
    const triggerTablePattern = new RegExp(String.raw`\b(?:on|for)\s+(?:only\s+)?(${SQL_IDENT})`, "giu");
    for (const tableMatch of block.matchAll(triggerTablePattern)) {
      const tableName = normalizeSqlObjectName(tableMatch[1]!);
      if (!tableName || tableName.toLowerCase() === "each") continue;
      const tableId = addTable(tableName, blockOffset + (tableMatch.index ?? 0));
      edges.push({
        source: triggerId,
        target: tableId,
        relation: "triggers",
        confidence: "EXTRACTED",
        source_file: filePath,
        source_location: `L${lineForIndex(source, blockOffset + (tableMatch.index ?? 0))}`,
        weight: 1.0,
      });
      break;
    }
    addSqlBodyTableEdges(triggerId, block, blockOffset);
  }

  const createRoutinePattern = new RegExp(
    String.raw`\bcreate\s+(?:or\s+(?:replace|alter)\s+)?(?:procedure|function)\s+(${SQL_IDENT})\b`,
    "giu",
  );
  for (const match of source.matchAll(createRoutinePattern)) {
    const routineName = normalizeSqlObjectName(match[1]!);
    const routineId = addSqlObject(routineName, `${routineName}()`, match.index ?? 0);
    addSqlBodyTableEdges(routineId, sqlStatementBlock(source, match.index ?? 0), match.index ?? 0);
  }

  return { nodes, edges };
}

export async function extractMarkdown(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const stem = qualifiedFileStem(filePath, rootDir);
  const fileNid = _makeId(stem);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();

  function addNode(nid: string, label: string, line: number, fileType: GraphNode["file_type"] = "document"): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({
        id: nid,
        label,
        file_type: fileType,
        source_file: filePath,
        source_location: `L${line}`,
      });
    }
  }

  function addEdge(sourceId: string, targetId: string, relation: string, line: number): void {
    edges.push({
      source: sourceId,
      target: targetId,
      relation,
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${line}`,
      weight: 1.0,
    });
  }

  addNode(fileNid, basename(filePath), 1);

  const headingStack: Array<{ level: number; id: string }> = [];
  let inCodeBlock = false;
  const codeBlockLines: string[] = [];

  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const lineText = lines[index]!;
    const stripped = lineText.trim();

    if (stripped.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLines.length = 0;
        continue;
      }

      // F-0819-P1 (#1077): close the fence WITHOUT emitting a node. Fenced
      // code blocks were always orphans (a single `contains` edge to the
      // parent doc) and inflated the disconnected-component count. We still
      // track the block so its contents aren't mistaken for headings.
      inCodeBlock = false;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(lineText);
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/u.exec(lineText);
    if (!headingMatch) continue;

    const level = headingMatch[1]!.length;
    const title = headingMatch[2]!.trim();
    let headingNid = _makeId(stem, title);
    if (seenIds.has(headingNid)) {
      headingNid = _makeId(stem, title, String(lineNumber));
    }
    addNode(headingNid, title, lineNumber);

    while (headingStack.length > 0 && headingStack.at(-1)!.level >= level) {
      headingStack.pop();
    }
    const parent = headingStack.at(-1)?.id ?? fileNid;
    addEdge(parent, headingNid, "contains", lineNumber);
    headingStack.push({ level, id: headingNid });
  }

  return { nodes, edges };
}

async function extractSvelte(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  const result = await extractRegexBackedCode(filePath, rootDir);

  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }

  const fileNode = result.nodes.find(
    (node) => node.label === basename(filePath) && node.source_file === filePath,
  );
  if (!fileNode) {
    return result;
  }

  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const target = resolveJsImportTarget(raw, filePath);
    if (!target) continue;
    result.edges.push({
      source: fileNode.id,
      target,
      relation: "imports_from",
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${lineForIndex(source, match.index ?? 0)}`,
      weight: 1.0,
    });
  }

  return result;
}

/**
 * Astro single-file components mix Markdown/HTML with a TypeScript frontmatter
 * (between leading `---` markers) plus optional `<script>` blocks. The regex-
 * backed base extractor catches typed declarations; this wrapper scans the
 * whole file source for static `import ... from "x"` and dynamic `import("x")`
 * calls so module edges land in the graph. Resolution reuses the JS/TS
 * resolver, which already handles relative paths and tsconfig path aliases.
 */
async function extractAstro(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  const result = await extractRegexBackedCode(filePath, rootDir);

  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }

  const fileNode = result.nodes.find(
    (node) => node.label === basename(filePath) && node.source_file === filePath,
  );
  if (!fileNode) {
    return result;
  }

  const seen = new Set<string>();
  const sourceText = source;
  const fileNodeId = fileNode.id;
  function pushImport(raw: string, index: number): void {
    const target = resolveJsImportTarget(raw, filePath);
    if (!target) return;
    const key = `${target}@${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.edges.push({
      source: fileNodeId,
      target,
      relation: "imports_from",
      confidence: "EXTRACTED",
      source_file: filePath,
      source_location: `L${lineForIndex(sourceText, index)}`,
      weight: 1.0,
    });
  }

  for (const match of source.matchAll(/\bimport\s+(?:[^"';]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const raw = match[1]?.trim();
    if (raw) pushImport(raw, match.index ?? 0);
  }
  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const raw = match[1]?.trim();
    if (raw) pushImport(raw, match.index ?? 0);
  }

  return result;
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
        const tgtNid = labelToNid.caseInsensitive.get(calleeName.toLowerCase());
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
  const localImplMethodIds = new Map<string, string>();

  function normalizeRustScopedPart(raw: string): string {
    return raw
      .trim()
      .replace(/^&(?:mut\s+)?/, "")
      .split("::")
      .pop()!
      .replace(/<.*$/, "")
      .replace(/^r#/, "")
      .trim()
      .toLowerCase();
  }

  function addNode(nid: string, label: string, line: number): void {
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: "code", source_file: strPath, source_location: `L${line}` });
    }
  }

  function addEdge(
    src: string, tgt: string, relation: string, line: number,
    confidence: "EXTRACTED" | "INFERRED" = "EXTRACTED", weight: number = 1.0,
    context?: string,
  ): void {
    const edge: GraphEdge = { source: src, target: tgt, relation, confidence, source_file: strPath, source_location: `L${line}`, weight };
    if (context) edge.context = context;
    edges.push(edge);
  }

  /** Resolve a referenced type name to a same-file node or a sourceless stub. */
  function ensureNamedNode(name: string): string {
    let nid = _makeId(stem, name);
    if (seenIds.has(nid)) return nid;
    nid = _makeId(name);
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label: name, file_type: "code", source_file: "", source_location: "" });
    }
    return nid;
  }

  /** Emit `references` edges from a struct/enum to each collected field type. */
  function emitRustTypeRefs(itemNid: string, typeNode: SyntaxNode | null, line: number): void {
    if (typeNode === null) return;
    const refs: TypeRef[] = [];
    _rustCollectTypeRefs(typeNode, source, false, refs);
    for (const [refName, role] of refs) {
      const ctx = role === "generic_arg" ? "generic_arg" : "field";
      const tgt = ensureNamedNode(refName);
      if (tgt !== itemNid) addEdge(itemNid, tgt, "references", line, "EXTRACTED", 1.0, ctx);
    }
  }

  const fileNid = _makeId(stem);
  addNode(fileNid, basename(filePath), 1);

  function walk(
    node: SyntaxNode,
    parentImplNid: string | null = null,
    parentImplTypeName: string | null = null,
  ): void {
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
          if (parentImplTypeName) {
            const methodKey = `${normalizeRustScopedPart(parentImplTypeName)}::${normalizeRustScopedPart(funcName)}`;
            localImplMethodIds.set(methodKey, funcNid);
          }
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

        // Field type `references` — previously every struct/enum field type was
        // silently dropped (extractRust only created the item node). Ports of
        // upstream safishamsi: named-struct fields (base), tuple-struct fields
        // (7eb847b), and enum-variant field types (674184d).
        if (t === "struct_item") {
          // Named struct: `struct S { a: Logger, b: Vec<Config> }`.
          for (const c of node.children) {
            if (c.type !== "field_declaration_list") continue;
            for (const field of c.children) {
              if (field.type !== "field_declaration") continue;
              let typeNode = field.childForFieldName("type");
              if (!typeNode) {
                typeNode = field.children.find((fc) => _RUST_FIELD_TYPE_NODES.has(fc.type)) ?? null;
              }
              emitRustTypeRefs(itemNid, typeNode, field.startPosition.row + 1);
            }
          }
          // Tuple struct: `struct Wrapper(pub Logger, Config);` — positional
          // field types nest directly under ordered_field_declaration_list with
          // no field_declaration wrapper (7eb847b).
          for (const c of node.children) {
            if (c.type !== "ordered_field_declaration_list") continue;
            const fline = c.startPosition.row + 1;
            for (const tc of c.children) {
              if (_RUST_FIELD_TYPE_NODES.has(tc.type)) emitRustTypeRefs(itemNid, tc, fline);
            }
          }
        }
        if (t === "enum_item") {
          // Variant payloads: tuple variant `Click(Logger)` nests types under
          // ordered_field_declaration_list; struct variant `Resize { size: Dim }`
          // under field_declaration_list (674184d).
          for (const c of node.children) {
            if (c.type !== "enum_variant_list") continue;
            for (const variant of c.children) {
              if (variant.type !== "enum_variant") continue;
              const vline = variant.startPosition.row + 1;
              for (const vc of variant.children) {
                if (vc.type === "ordered_field_declaration_list") {
                  for (const tc of vc.children) {
                    if (_RUST_FIELD_TYPE_NODES.has(tc.type)) emitRustTypeRefs(itemNid, tc, vline);
                  }
                } else if (vc.type === "field_declaration_list") {
                  for (const field of vc.children) {
                    if (field.type !== "field_declaration") continue;
                    emitRustTypeRefs(itemNid, field.childForFieldName("type"), field.startPosition.row + 1);
                  }
                }
              }
            }
          }
        }
      }
      return;
    }

    if (t === "impl_item") {
      const typeNode = node.childForFieldName("type");
      let implNid: string | null = null;
      let typeName: string | null = null;
      if (typeNode) {
        typeName = _readText(typeNode, source).trim();
        implNid = _makeId(stem, typeName);
        addNode(implNid, typeName, node.startPosition.row + 1);
      }
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walk(child, implNid, typeName);
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
      walk(child, null, null);
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
      let targetNid: string | null = null;
      if (funcNode) {
        if (funcNode.type === "identifier") {
          calleeName = _readText(funcNode, source);
        } else if (funcNode.type === "field_expression") {
          const field = funcNode.childForFieldName("field");
          if (field) calleeName = _readText(field, source);
        } else if (funcNode.type === "scoped_identifier") {
          const name = funcNode.childForFieldName("name");
          const path = funcNode.childForFieldName("path");
          if (name && path) {
            const methodKey = `${normalizeRustScopedPart(_readText(path, source))}::${normalizeRustScopedPart(_readText(name, source))}`;
            targetNid = localImplMethodIds.get(methodKey) ?? null;
          }
        }
      }
      if (!targetNid && calleeName) {
        targetNid = labelToNid.caseInsensitive.get(calleeName.toLowerCase()) ?? null;
      }
      if (targetNid && targetNid !== callerNid) {
        const pair = `${callerNid}|${targetNid}`;
        if (!seenCallPairs.has(pair)) {
          seenCallPairs.add(pair);
          const line = node.startPosition.row + 1;
          edges.push({
            source: callerNid, target: targetNid, relation: "calls",
            confidence: "EXTRACTED", source_file: strPath,
            source_location: `L${line}`, weight: 1.0,
          });
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

  // Resolve a bare type name to a node id: prefer an in-file definition
  // (stem-qualified), otherwise emit a SOURCELESS stub so the corpus-level
  // rewire can collapse it onto the real definition. Mirrors upstream's
  // `ensure_named_node`; addNode is idempotent so this is safe to call
  // before or after the referenced type is walked.
  function ensureNamedNode(name: string, line: number): string {
    const qualified = _makeId(stem, name);
    if (seenIds.has(qualified)) return qualified;
    const global = _makeId(name);
    if (!seenIds.has(global)) {
      seenIds.add(global);
      nodes.push({ id: global, label: name, file_type: "code", source_file: "", source_location: "" });
    }
    return global;
  }

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
        // Base type(s) after ':'. The handler previously read only the class
        // name and dropped every `class Dog : Animal` inheritance edge.
        // PowerShell has no syntactic base-vs-interface split, so (matching the
        // C# convention) the first base is emitted as `inherits` and the rest
        // as `implements`. Port of upstream safishamsi a129ff2.
        let colonSeen = false;
        let baseIndex = 0;
        for (const child of node.children) {
          if (child.type === ":") {
            colonSeen = true;
          } else if (colonSeen && child.type === "simple_name") {
            const baseNid = ensureNamedNode(_readText(child, source), line);
            if (baseNid !== classNid) {
              addEdge(classNid, baseNid, baseIndex === 0 ? "inherits" : "implements", line);
            }
            baseIndex++;
          }
        }
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
          const tgtNid = labelToNid.caseInsensitive.get(cmdText.toLowerCase());
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

  // Resolve a bare type/protocol name to a node id: prefer an in-file
  // definition (stem-qualified), otherwise emit a SOURCELESS stub so the
  // corpus-level rewire can collapse it onto the real definition. Mirrors
  // upstream's `ensure_named_node`.
  function ensureNamedNode(name: string): string {
    const qualified = _makeId(stem, name);
    if (seenIds.has(qualified)) return qualified;
    const global = _makeId(name);
    if (!seenIds.has(global)) {
      seenIds.add(global);
      nodes.push({ id: global, label: name, file_type: "code", source_file: "", source_location: "" });
    }
    return global;
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
        // Protocol-to-protocol adoption: `@protocol Foo <Bar>` exposes the
        // adopted protocols in a `protocol_reference_list`. Emit an `implements`
        // edge for each so protocol hierarchies aren't dropped. Port of
        // upstream safishamsi cd3a376.
        for (const child of node.children) {
          if (child.type === "protocol_reference_list") {
            for (const sub of child.children) {
              if (sub.type === "identifier") {
                const baseNid = ensureNamedNode(_read(sub));
                if (baseNid !== protoNid) {
                  addEdge(protoNid, baseNid, "implements", line);
                }
              }
            }
          }
        }
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
      const tgtNid = labelToNid.caseInsensitive.get(calleeName.toLowerCase());
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

  // Pass 1: name -> node_id across all files.
  // Upstream d84f07c: key stemToEntities by directory-qualified stem
  // (e.g. "auth.models") to avoid collisions when multiple files share the
  // same filename in different directories. Add a bareToQualified secondary
  // index for absolute imports — first writer wins when bare names collide.
  const stemToEntities = new Map<string, Map<string, string>>();
  const bareToQualified = new Map<string, string>();
  for (const fileResult of perFile) {
    for (const node of fileResult.nodes ?? []) {
      const src = node.source_file ?? "";
      if (!src) continue;
      const fqStem = qualifiedFileStem(src, rootDir);
      const bareStem = basename(src, extname(src));
      const label = node.label ?? "";
      const nid = node.id ?? "";
      if (label && !label.endsWith(")") && !label.endsWith(".py") && !label.startsWith("_")) {
        if (!stemToEntities.has(fqStem)) stemToEntities.set(fqStem, new Map());
        stemToEntities.get(fqStem)!.set(label, nid);
        if (!bareToQualified.has(bareStem)) {
          bareToQualified.set(bareStem, fqStem);
        }
      }
    }
  }

  // Pass 2
  const newEdges: GraphEdge[] = [];
  const stemToPath = new Map<string, string>();
  for (const p of paths) {
    stemToPath.set(qualifiedFileStem(p, rootDir), p);
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
        // Upstream d84f07c: resolve relative imports exactly via the importing
        // file's directory; absolute imports fall back to the bare-stem index.
        let targetFq: string | null = null;
        for (const child of node.children) {
          if (child.type === "relative_import") {
            for (const sub of child.children) {
              if (sub.type === "dotted_name") {
                const raw = source.slice(sub.startIndex, sub.endIndex);
                const bare = raw.split(".").pop()!;
                const candidate = join(dirname(filePath), `${bare}.py`);
                targetFq = qualifiedFileStem(candidate, rootDir);
                break;
              }
            }
            break;
          }
          if (child.type === "dotted_name" && targetFq === null) {
            const raw = source.slice(child.startIndex, child.endIndex);
            const bare = raw.split(".").pop()!;
            targetFq = bareToQualified.get(bare) ?? null;
          }
        }

        if (!targetFq || !stemToEntities.has(targetFq)) return;

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
          const tgtNid = stemToEntities.get(targetFq)?.get(name);
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
// .NET project files (.sln, .csproj/.fsproj/.vbproj/.props/.targets)
// Port of upstream safishamsi 8bcfffd (#515) + ad3f3b2 (XML DoS guard).
// ---------------------------------------------------------------------------

/**
 * Maximum byte size for XML project files (2 MiB).
 * Real MSBuild / Lazarus package files are well under this; anything larger
 * is either malformed or crafted to exhaust resources at parse time.
 * Port of upstream _PROJECT_XML_MAX_BYTES (ad3f3b2).
 */
const _PROJECT_XML_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Reject XML that declares DTDs or entities (billion-laughs / XXE guard).
 *
 * Node's built-in XML parser (via DOMParser-style APIs) does not cap entity
 * expansion. Pre-screening for `<!DOCTYPE` / `<!ENTITY` is defense-in-depth:
 * legitimate MSBuild and Lazarus package files never contain either declaration,
 * so this is a zero-false-positive screen.
 *
 * Port of upstream _project_xml_is_safe (ad3f3b2).
 */
function _projectXmlIsSafe(src: Buffer | string): boolean {
  const lowered = (typeof src === "string" ? src : src.toString("latin1")).toLowerCase();
  return !lowered.includes("<!doctype") && !lowered.includes("<!entity");
}

// Minimal synchronous XML attribute/element reader backed by regex.
// We intentionally avoid any XML parser to sidestep the billion-laughs risk:
// the guard above rejects DOCTYPE/ENTITY, and for the structural data we need
// (element names, attribute values) regex over clean MSBuild XML is reliable.

const _CSPROJ_PACKAGE_RE =
  /<PackageReference\s[^>]*Include="([^"]+)"[^>]*(?:Version="([^"]*)")?[^>]*\/?>/gi;
const _CSPROJ_PACKAGE_VERSION_RE = /Version="([^"]*)"/i;
const _CSPROJ_PROJREF_RE = /<ProjectReference\s[^>]*Include="([^"]+)"/gi;
const _CSPROJ_TF_RE = /<TargetFramework[s]?>([^<]+)<\/TargetFramework[s]?>/gi;
const _CSPROJ_SDK_ATTR_RE = /<Project\s[^>]*Sdk="([^"]+)"/i;

/**
 * Extract packages, project refs, and target framework from a
 * .csproj/.fsproj/.vbproj/.props/.targets file.
 *
 * XML guard (ad3f3b2): size cap + DOCTYPE/ENTITY rejection before any parse.
 * Extraction: regex over raw text (no XML parser), safe after the guard.
 */
export function extractCsproj(filePath: string, _rootDir?: string): ExtractionResult {
  let src: Buffer;
  try {
    src = readFileSync(filePath) as Buffer;
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  // --- XML DoS guard (ad3f3b2) ---
  if (src.length > _PROJECT_XML_MAX_BYTES) {
    return { nodes: [], edges: [], error: "project file too large (>2 MiB)" };
  }
  if (!_projectXmlIsSafe(src)) {
    return { nodes: [], edges: [], error: "refusing XML with DOCTYPE/ENTITY declaration (billion-laughs guard)" };
  }

  const text = src.toString("utf-8");
  const fileNid = _makeId(resolve(filePath));
  const nodes: GraphNode[] = [{
    id: fileNid,
    label: basename(filePath),
    file_type: "code",
    source_file: filePath,
    source_location: "L1",
  }];
  const edges: GraphEdge[] = [];
  const seenIds = new Set([fileNid]);

  function addNode(
    nid: string,
    label: string,
    fileType: "code" | "concept",
    relation: string,
  ): void {
    if (!nid) return;
    if (!seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({ id: nid, label, file_type: fileType, source_file: filePath });
    }
    edges.push({ source: fileNid, target: nid, relation, confidence: "EXTRACTED", source_file: filePath, weight: 1.0 });
  }

  // SDK attribute on <Project Sdk="...">
  const sdkMatch = _CSPROJ_SDK_ATTR_RE.exec(text);
  if (sdkMatch) {
    const sdk = sdkMatch[1]!.trim();
    addNode(_makeId("sdk", sdk), sdk, "concept", "references");
  }

  // TargetFramework(s) elements
  _CSPROJ_TF_RE.lastIndex = 0;
  for (const m of text.matchAll(_CSPROJ_TF_RE)) {
    const raw = m[1]!.trim();
    for (const fw of raw.split(";").map((s) => s.trim()).filter(Boolean)) {
      addNode(_makeId("framework", fw), fw, "concept", "references");
    }
  }

  // PackageReference elements
  _CSPROJ_PACKAGE_RE.lastIndex = 0;
  for (const m of text.matchAll(_CSPROJ_PACKAGE_RE)) {
    const name = m[1]!.trim();
    const version = m[2]?.trim() ?? "";
    const label = version ? `${name} (${version})` : name;
    addNode(_makeId("nuget", name), label, "code", "imports");
  }

  // ProjectReference elements
  _CSPROJ_PROJREF_RE.lastIndex = 0;
  for (const m of text.matchAll(_CSPROJ_PROJREF_RE)) {
    const refPath = m[1]!.replace(/\\/g, "/");
    let absRef: string;
    try {
      absRef = resolve(dirname(filePath), refPath);
    } catch {
      absRef = refPath;
    }
    const projLabel = basename(refPath);
    addNode(_makeId(absRef), projLabel, "code", "imports");
  }

  return { nodes, edges };
}

const _SLN_PROJECT_RE =
  /Project\("[^"]*"\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"\{([^}]*)\}"/g;
const _SLN_DEP_RE = /\{([0-9a-fA-F-]+)\}\s*=\s*\{([0-9a-fA-F-]+)\}/g;

/**
 * Extract projects and inter-project dependencies from a .sln file.
 * Port of upstream extract_sln (8bcfffd).
 */
export function extractSln(filePath: string, _rootDir?: string): ExtractionResult {
  let src: string;
  try {
    src = readFileSync(filePath, "utf-8");
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: String(e) };
  }

  const fileNid = _makeId(resolve(filePath));
  const nodes: GraphNode[] = [{
    id: fileNid,
    label: basename(filePath),
    file_type: "code",
    source_file: filePath,
    source_location: "L1",
  }];
  const edges: GraphEdge[] = [];
  const seenIds = new Set([fileNid]);
  const guidToNid = new Map<string, string>();

  _SLN_PROJECT_RE.lastIndex = 0;
  for (const m of src.matchAll(_SLN_PROJECT_RE)) {
    const projName = m[1]!;
    const projPath = m[2]!.replace(/\\/g, "/");
    const projGuid = m[3]!.toLowerCase();

    let absProj: string;
    try {
      absProj = resolve(dirname(filePath), projPath);
    } catch {
      absProj = projPath;
    }
    const projNid = _makeId(absProj);
    if (projNid && !seenIds.has(projNid)) {
      seenIds.add(projNid);
      nodes.push({
        id: projNid,
        label: projName,
        file_type: "code",
        source_file: absProj,
      });
      edges.push({
        source: fileNid,
        target: projNid,
        relation: "contains",
        confidence: "EXTRACTED",
        source_file: filePath,
        weight: 1.0,
      });
    }
    if (projGuid) guidToNid.set(projGuid, projNid);
  }

  // ProjectDependencies section → imports edges
  let inDepSection = false;
  let currentProjGuid: string | null = null;
  const _PROJECT_LINE_RE =
    /Project\("[^"]*"\)\s*=\s*"[^"]+"\s*,\s*"[^"]+"\s*,\s*"\{([^}]+)\}"/;

  for (const line of src.split("\n")) {
    const projLineMatch = _PROJECT_LINE_RE.exec(line);
    if (projLineMatch) {
      currentProjGuid = projLineMatch[1]!.toLowerCase();
      continue;
    }
    if (line.trim() === "EndProject") {
      currentProjGuid = null;
      continue;
    }
    if (line.includes("ProjectSection(ProjectDependencies)")) {
      inDepSection = true;
      continue;
    }
    if (inDepSection && line.includes("EndProjectSection")) {
      inDepSection = false;
      continue;
    }
    if (inDepSection && currentProjGuid) {
      _SLN_DEP_RE.lastIndex = 0;
      const depMatch = _SLN_DEP_RE.exec(line);
      if (depMatch) {
        const toGuid = depMatch[1]!.toLowerCase();
        const fromNid = guidToNid.get(currentProjGuid);
        const toNid = guidToNid.get(toGuid);
        if (fromNid && toNid && fromNid !== toNid) {
          edges.push({
            source: fromNid,
            target: toNid,
            relation: "imports",
            confidence: "EXTRACTED",
            source_file: filePath,
            weight: 1.0,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

// Async wrappers so they fit the ExtractorFn signature expected by _DISPATCH.
async function _extractSlnAsync(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return extractSln(filePath, rootDir);
}
async function _extractCsprojAsync(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return extractCsproj(filePath, rootDir);
}

// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) server configuration files.
// Port of upstream safishamsi 2c01a89 (#... mcp_ingest): extracts the
// `mcpServers` map of `.mcp.json` / `claude_desktop_config.json` / `mcp.json` /
// `mcp_servers.json` into server / command / package / env-var nodes.
//
// Symmetry: graphify exposes itself AS an MCP server (`--mcp`); this indexes
// MCP servers AS a corpus type, completing the loop.
//
// Security parity with upstream:
//   - Env var VALUES are NEVER read — only env var NAMES become nodes
//     (`env: {"API_KEY": "sk-..."}` → node "API_KEY" only).
//   - File size capped at 1 MiB (matches the generic JSON extractor cap).
//   - args are NOT persisted (they can embed paths / secrets); only a detected
//     npm/pypi package id from args becomes a node.
//   - All labels go through sanitizeLabel.
//
// Cross-config emergent edges: command / package / env_var nodes use GLOBAL ids
// (no per-file stem) so the same package or env var shared across two configs
// produces one shared node. Server nodes ARE stem-scoped so two configs both
// declaring "filesystem" do not collide.
// ---------------------------------------------------------------------------

/** Recognised MCP config filenames (matched on basename, case-sensitive). */
const _MCP_CONFIG_FILENAMES: ReadonlySet<string> = new Set([
  ".mcp.json",
  "claude_desktop_config.json",
  "mcp.json",
  "mcp_servers.json",
]);

const _MCP_MAX_BYTES = 1_048_576; // 1 MiB
const _MCP_MAX_SERVERS_PER_FILE = 200;

/** True when `filePath`'s basename is a recognised MCP config filename. */
export function isMcpConfigPath(filePath: string): boolean {
  return _MCP_CONFIG_FILENAMES.has(basename(filePath));
}

// Patterns observed in real MCP server configs (npx / uvx / pnpx / python):
//   ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
//   ["-y", "@org/pkg@1.2.3"]   ["mcp-server-fetch"]   ["mcp-server-time", "--tz=UTC"]
const _MCP_NPM_PKG_RE = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:@[\w.\-+]+)?$/;
const _MCP_PY_PKG_RE = /^[a-z0-9][a-z0-9._-]*-mcp(?:-[a-z0-9._-]+)?$|^mcp-[a-z0-9][a-z0-9._-]*$/;
const _MCP_ARG_FLAG_RE = /^-{1,2}\w/;

/** Drop the `@version` suffix from an npm package id, preserving the scope. */
function _mcpStripVersion(pkg: string): string {
  if (pkg.startsWith("@")) {
    const versionAt = pkg.indexOf("@", 1);
    return versionAt === -1 ? pkg : pkg.slice(0, versionAt);
  }
  const versionAt = pkg.indexOf("@");
  return versionAt === -1 ? pkg : pkg.slice(0, versionAt);
}

/** First arg that looks like an npm or pypi package id, else null. */
function _mcpDetectPackageFromArgs(args: unknown[]): string | null {
  for (const raw of args) {
    if (typeof raw !== "string") continue;
    const arg = raw.trim();
    if (!arg || _MCP_ARG_FLAG_RE.test(arg)) continue;
    if (_MCP_NPM_PKG_RE.test(arg)) return _mcpStripVersion(arg);
    if (_MCP_PY_PKG_RE.test(arg)) return arg;
  }
  return null;
}

/**
 * Parse an MCP config file into graphify nodes and edges. Mirrors the other
 * extractors: `{ nodes, edges }` on success, `{ nodes: [], edges: [], error }`
 * on parse failure / oversize / missing `mcpServers` map (indistinguishable
 * from "no MCP config here" for downstream callers).
 */
export function extractMcpConfig(filePath: string, rootDir?: string): ExtractionResult {
  let raw: Buffer;
  try {
    raw = readFileSync(filePath) as Buffer;
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: `mcp_ingest read error: ${String(e)}` };
  }
  if (raw.length > _MCP_MAX_BYTES) {
    return { nodes: [], edges: [], error: "mcp config too large to index" };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw.toString("utf-8"));
  } catch (e: unknown) {
    return { nodes: [], edges: [], error: `mcp_ingest json error: ${String(e)}` };
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return { nodes: [], edges: [], error: "mcp_ingest: root is not an object" };
  }

  const docObj = doc as Record<string, unknown>;
  let servers = docObj["mcpServers"];
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    // Some tools nest the map (e.g. {"mcp": {"servers": {...}}}). Try one
    // well-known alternate shape, no exhaustive search.
    const nested = docObj["mcp"];
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      servers = (nested as Record<string, unknown>)["servers"];
    }
    if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
      return { nodes: [], edges: [], error: "mcp_ingest: no mcpServers map" };
    }
  }

  const resolvedRoot = rootDir ?? dirname(resolve(filePath));
  const fileNid = _makeId(resolve(filePath));
  const fileStem = qualifiedFileStem(filePath, resolvedRoot);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();
  const seenEdges = new Set<string>();

  function addNode(nid: string, label: string, mcpKind: string): boolean {
    if (!nid || seenIds.has(nid)) return false;
    seenIds.add(nid);
    nodes.push({
      id: nid,
      label: sanitizeLabel(label),
      file_type: "code",
      source_file: filePath,
      source_location: "L1",
      node_type: mcpKind,
    });
    return true;
  }

  function addEdge(source: string, target: string, relation: string): void {
    if (!source || !target || source === target) return;
    const key = `${source} ${target} ${relation}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({
      source,
      target,
      relation,
      confidence: "EXTRACTED",
      confidence_score: 1.0,
      source_file: filePath,
      source_location: "L1",
      weight: 1.0,
    });
  }

  addNode(fileNid, basename(filePath), "mcp_config_file");

  let serverCount = 0;
  for (const [serverName, spec] of Object.entries(servers as Record<string, unknown>)) {
    if (!serverName) continue;
    if (typeof spec !== "object" || spec === null || Array.isArray(spec)) continue;
    if (serverCount >= _MCP_MAX_SERVERS_PER_FILE) break;
    serverCount += 1;

    const specObj = spec as Record<string, unknown>;
    const serverNid = _makeId(fileStem, "mcp_server", serverName);
    addNode(serverNid, serverName, "mcp_server");
    addEdge(fileNid, serverNid, "contains");

    const command = specObj["command"];
    if (typeof command === "string" && command.trim()) {
      const cmd = command.trim();
      const cmdNid = _makeId("mcp_command", cmd);
      addNode(cmdNid, cmd, "mcp_command");
      addEdge(serverNid, cmdNid, "references");
    }

    const args = specObj["args"];
    if (Array.isArray(args)) {
      const pkg = _mcpDetectPackageFromArgs(args);
      if (pkg) {
        const pkgNid = _makeId("mcp_package", pkg);
        addNode(pkgNid, pkg, "mcp_package");
        addEdge(serverNid, pkgNid, "references");
      }
    }

    const env = specObj["env"];
    if (typeof env === "object" && env !== null && !Array.isArray(env)) {
      // ONLY KEYS. Values may contain secrets and are never read here.
      for (const envName of Object.keys(env as Record<string, unknown>)) {
        if (!envName) continue;
        const envNid = _makeId("env_var", envName);
        addNode(envNid, envName, "env_var");
        addEdge(serverNid, envNid, "requires_env");
      }
    }
  }

  return { nodes, edges };
}

async function _extractMcpConfigAsync(filePath: string, rootDir?: string): Promise<ExtractionResult> {
  return extractMcpConfig(filePath, rootDir);
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
  // TypeScript module/CommonJS variants — port of upstream 1226c34.
  ".mts": extractJs,
  ".cts": extractJs,
  ".vue": extractRegexBackedCode,
  ".svelte": extractSvelte,
  ".astro": extractAstro,
  ".dart": extractRegexBackedCode,
  ".groovy": extractGroovy,
  ".gradle": extractGroovy,
  ".v": extractRegexBackedCode,
  ".sv": extractRegexBackedCode,
  ".svh": extractRegexBackedCode,
  ".sql": extractSql,
  ".md": extractMarkdown,
  ".mdx": extractMarkdown,
  ".qmd": extractMarkdown,
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
  ".luau": extractLua,
  ".toc": extractLua,
  ".zig": extractZig,
  ".ps1": extractPowershell,
  ".ex": extractElixir,
  ".exs": extractElixir,
  ".m": extractObjc,
  ".mm": extractObjc,
  ".jl": extractJulia,
  ".r": extractRegexBackedCode,
  ".f": extractRegexBackedCode,
  ".f90": extractRegexBackedCode,
  ".f95": extractRegexBackedCode,
  ".f03": extractRegexBackedCode,
  ".f08": extractRegexBackedCode,
  // .NET project files — port of upstream 8bcfffd / ad3f3b2
  ".sln": _extractSlnAsync,
  ".csproj": _extractCsprojAsync,
  ".fsproj": _extractCsprojAsync,
  ".vbproj": _extractCsprojAsync,
  ".props": _extractCsprojAsync,
  ".targets": _extractCsprojAsync,
};

// Extensionless executables (CLI entry points like `devctl` or `manage`) carry
// their language in the shebang, not the suffix. detect.classifyFile already
// routes them to the CODE path via shebangInterpreter; extraction dispatch must
// honor the same signal or these files are classified as code and then
// silently dropped. Only interpreters with a real TS extractor are mapped —
// detect's wider set (bash-family, perl, fish, tcsh, Rscript) stays unmapped
// and skipped rather than being mis-parsed by a wrong grammar (the TS port has
// no bash extractor, unlike upstream). Port of upstream 2ab0867.
const _SHEBANG_DISPATCH: Record<string, ExtractorFn> = {
  "python": extractPython,
  "python2": extractPython,
  "python3": extractPython,
  "node": extractJs,
  "nodejs": extractJs,
  "ruby": extractRuby,
  "lua": extractLua,
  "php": extractPhp,
  "julia": extractJulia,
};

/**
 * Return the extractor for a file: filename-based MCP/blade routing first,
 * then the lowercased-suffix dispatch table, then (for extensionless files)
 * shebang-interpreter routing mirroring detect.classifyFile.
 */
function _getExtractor(filePath: string): ExtractorFn | undefined {
  if (isMcpConfigPath(filePath)) return _extractMcpConfigAsync;
  if (basename(filePath).toLowerCase().endsWith(".blade.php")) return extractRegexBackedCode;
  const ext = extname(filePath).toLowerCase();
  if (!ext) {
    const interp = shebangInterpreter(filePath);
    return interp ? _SHEBANG_DISPATCH[interp] : undefined;
  }
  return _DISPATCH[ext];
}

/**
 * Collapse cross-file Swift `extension Foo` nodes into the canonical `Foo`.
 *
 * tree-sitter-swift reuses `class_declaration` for both `class Foo` and
 * `extension Foo`, and per-file node ids carry the file stem, so each file
 * that extends `Foo` produces its own `Foo` node. The match is done by label:
 * when exactly one non-extension declaration shares the label, extension
 * nodes redirect onto it. Extensions of types outside the corpus (no match)
 * and ambiguous labels (more than one match) are left untouched — picking
 * arbitrarily would invent edges.
 *
 * Port of upstream safishamsi 406bea4 / #969 (`_merge_swift_extensions`).
 */
export function _mergeSwiftExtensions(
  perFile: ExtractionResult[],
  allNodes: GraphNode[],
  allEdges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const extensionNids = new Set<string>();
  const extensionLabels = new Map<string, string>();
  for (const result of perFile) {
    for (const ext of result.swift_extensions ?? []) {
      extensionNids.add(ext.nid);
      extensionLabels.set(ext.nid, ext.label);
    }
  }

  if (extensionNids.size === 0) {
    return { nodes: allNodes, edges: allEdges };
  }

  const labelToCanonical = new Map<string, string[]>();
  for (const n of allNodes) {
    if (extensionNids.has(n.id)) continue;
    const label = n.label;
    if (!label) continue;
    const existing = labelToCanonical.get(label);
    if (existing) existing.push(n.id);
    else labelToCanonical.set(label, [n.id]);
  }

  const remap = new Map<string, string>();
  for (const extNid of extensionNids) {
    const label = extensionLabels.get(extNid)!;
    const candidates = labelToCanonical.get(label) ?? [];
    if (candidates.length !== 1) continue;
    const canonicalNid = candidates[0]!;
    if (canonicalNid !== extNid) {
      remap.set(extNid, canonicalNid);
    }
  }

  if (remap.size === 0) {
    return { nodes: allNodes, edges: allEdges };
  }

  const remappedNodes = allNodes.filter((n) => !remap.has(n.id));

  // Each extension file's `contains` edge ends up pointing at the canonical
  // type — multiple files containing the same node is the intended shape:
  // the type owns the methods, the files own their slice. Self-loops are
  // dropped (e.g. an in-file extension method whose call already pointed at
  // the canonical type).
  const rewritten: GraphEdge[] = [];
  const seenKeys = new Set<string>();
  for (const e of allEdges) {
    const src = remap.get(e.source) ?? e.source;
    const tgt = remap.get(e.target) ?? e.target;
    if (src === tgt) continue;
    const remapped: GraphEdge = { ...e, source: src, target: tgt };
    const key = `${src}\0${tgt}\0${remapped.relation}\0${remapped.source_file ?? ""}\0${remapped.source_location ?? ""}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    rewritten.push(remapped);
  }

  return { nodes: remappedNodes, edges: rewritten };
}

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

/**
 * Whether a non-error extraction result is safe to cache: every extractable
 * file yields at least a file node, so a zero-node result is anomalous and
 * must not be persisted (upstream 1288a55 / #1666).
 */
function _shouldCacheExtraction(result: ExtractionResult): boolean {
  return !result.error && (result.nodes?.length ?? 0) > 0;
}

export async function extractWithDiagnostics(paths: string[]): Promise<ExtractWithDiagnosticsResult> {
  const normalizedPaths = paths.map((filePath) => resolve(filePath));
  const perFile: ExtractionResult[] = [];
  const diagnostics: ExtractionDiagnostic[] = [];
  const zeroNodeFiles: string[] = [];
  const root = inferCommonRoot(normalizedPaths);

  const total = normalizedPaths.length;
  const _PROGRESS_INTERVAL = 100;

  for (let i = 0; i < normalizedPaths.length; i++) {
    if (total >= _PROGRESS_INTERVAL && i % _PROGRESS_INTERVAL === 0 && i > 0) {
      process.stderr.write(`  AST extraction: ${i}/${total} files (${Math.floor(i * 100 / total)}%)\n`);
    }
    const filePath = normalizedPaths[i]!;
    // Filename-based dispatch takes precedence over the suffix lookup so an
    // MCP config (`.mcp.json`, `mcp.json`, …) is not swallowed by generic
    // `.json` handling (port of upstream 2c01a89); extensionless files route
    // by shebang (port of upstream 2ab0867).
    const extractor = _getExtractor(filePath);
    if (!extractor) continue;

    const cached = loadCached(filePath, root);
    if (cached !== null) {
      perFile.push(cached as unknown as ExtractionResult);
      continue;
    }

    let result: ExtractionResult;
    try {
      result = await extractor(filePath, root);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({ filePath, error: message });
      perFile.push({ nodes: [], edges: [], error: message });
      continue;
    }
    if (!result.error) {
      // Never cache a zero-node result for an extractable file. Every
      // supported source produces at least a file node, so an empty node list
      // is anomalous (e.g. a transient hiccup). Caching it makes the empty
      // byte-stable across runs and silently blinds downstream queries to and
      // through the file; skipping the write lets a rerun self-heal. Port of
      // upstream safishamsi 1288a55 (#1666).
      if (_shouldCacheExtraction(result)) {
        saveCached(filePath, result as unknown as Record<string, unknown>, root);
      } else {
        zeroNodeFiles.push(filePath);
      }
    } else {
      diagnostics.push({ filePath, error: result.error });
    }
    perFile.push(result);
  }

  if (total >= _PROGRESS_INTERVAL) {
    process.stderr.write(`  AST extraction: ${total}/${total} files (100%)\n`);
  }

  // Surface previously-silent blindness: an accepted source file that landed
  // in the graph with zero nodes (port of upstream 1288a55 / #1666).
  if (zeroNodeFiles.length > 0) {
    process.stderr.write(
      `warning: ${zeroNodeFiles.length} source file(s) extracted with zero nodes (not cached, rerun self-heals):\n` +
      zeroNodeFiles.map((f) => `  - ${f}\n`).join(""),
    );
  }

  let allNodes: GraphNode[] = [];
  let allEdges: GraphEdge[] = [];
  for (const result of perFile) {
    allNodes.push(...(result.nodes ?? []));
    allEdges.push(...(result.edges ?? []));
  }

  // Add cross-file class-level edges (Python only)
  remapFileNodeIds(allNodes, allEdges, normalizedPaths, root);

  // Collapse cross-file Swift `extension Foo` nodes onto the canonical `Foo`.
  // Port of upstream safishamsi 406bea4 / #969. Runs after remapFileNodeIds
  // and before Python cross-file import resolution so the canonical Swift
  // nodes are in place for any downstream edge resolution.
  const swiftMerged = _mergeSwiftExtensions(perFile, allNodes, allEdges);
  allNodes = swiftMerged.nodes;
  allEdges = swiftMerged.edges;

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
  ".py", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".mts", ".cts", ".go", ".rs",
  ".java", ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp",
  ".rb", ".cs", ".kt", ".kts", ".scala", ".php", ".swift",
  ".lua", ".toc", ".zig", ".ps1",
  ".m", ".mm",
  ".jl", ".ex", ".exs",
  ".vue", ".svelte", ".astro", ".dart", ".groovy", ".gradle", ".v", ".sv", ".svh", ".ejs",
  ".md", ".mdx", ".qmd",
  ".luau", ".r", ".R", ".f", ".F", ".f90", ".F90", ".f95", ".F95", ".f03", ".F03", ".f08", ".F08",
  // .NET project files (8bcfffd / ad3f3b2)
  ".sln", ".csproj", ".fsproj", ".vbproj", ".props", ".targets",
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
        // MCP config files are dispatched by FILENAME, not extension (a bare
        // `.json` would otherwise be ignored). `.mcp.json` is a hidden file and
        // is intentionally skipped here (the `entry.startsWith(".")` guard
        // above), consistent with graphify's hidden-file policy — it is still
        // extracted when passed as an explicit single-file target.
        // Case-insensitive suffix fallback (raw match first so exact entries
        // like `.R`/`.F90` are untouched): the extractor dispatch lowercases
        // its extension, but this filter compared the raw suffix — so
        // capitalized/mixed-case extensions (`.PY`, `.Ts`) were silently
        // skipped at collection time. Port of upstream aa1bbda (#1671).
        if (_EXTENSIONS.has(ext) || _EXTENSIONS.has(ext.toLowerCase()) || _MCP_CONFIG_FILENAMES.has(entry)) {
          results.push(fullPath);
        }
      }
    }
  }

  walkDir(resolved, new Set<string>());
  return results.sort();
}

/**
 * Internal helpers exposed for unit tests only (F-0819-P1 #1075). Not part of
 * the public API; do not import from application code.
 */
export const __testing = {
  resolveLuaImportTarget: _resolveLuaImportTarget,
  /** Return the extractor for a given file path (real dispatch: filename, suffix, then shebang). */
  getExtractor: (filePath: string): ExtractorFn | undefined => _getExtractor(filePath),
  /** Cache-write gate for extraction results (upstream 1288a55 / #1666). */
  shouldCacheExtraction: _shouldCacheExtraction,
  /** Kotlin user_type head-name reader (upstream _kotlin_user_type_name). */
  kotlinUserTypeName: _kotlinUserTypeName,
};
