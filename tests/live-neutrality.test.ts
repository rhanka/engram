import { execFileSync } from "node:child_process";
import { existsSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = join(root, "engram-live");
const buildScript = join(root, "scripts", "build-live.mjs");
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

// Shared build bootstrap: the L1b gate builds the package first
// (`node scripts/build-live.mjs`), and CI's plain `npm test` lane reaches
// these files without a prior engram-live build, so each test file ensures
// the build itself. A missing or stale build is built — never skipped.
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

export function ensureLiveBuild(): void {
  if (!existsSync(buildScript)) {
    throw new Error("L1b is not implemented: scripts/build-live.mjs is missing (build the engram-live package).");
  }
  if (liveBuildIsFresh()) return;
  // Cross-worker build lock: vitest runs test files in parallel workers and
  // both live test files bootstrap the same output tree.
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
      if (!liveBuildIsFresh()) {
        execFileSync(process.execPath, [buildScript], { cwd: root, stdio: "inherit" });
      }
      return;
    } finally {
      closeSyncQuiet(handle);
      try {
        unlinkSync(lockPath);
      } catch {
        /* already gone */
      }
    }
  }
}

function closeSyncQuiet(handle: number | undefined): void {
  if (handle === undefined) return;
  try {
    closeSync(handle);
  } catch {
    /* fd already closed with the process */
  }
}

interface ScannedFile {
  path: string;
  content: string;
}

interface ClosureViolation {
  path: string;
  specifier: string;
  reason: string;
}

type EdgeSet = "source" | "generated" | "package" | "test";

// Forbidden classes (spec/SPEC_LIVE_GIT_INDEXING.md §11, L1b plan row):
// the root monolithic CLI package, every other @sentropic/* consumer
// package, the h2a host, model/LLM modules, and storage-driver handles
// (including the node:sqlite builtin — node: builtins are otherwise free).
const ROOT_PACKAGE = "@sentropic/engram";
const SELF_PACKAGE = "@sentropic/engram-live";
const STORAGE_DRIVERS = new Set([
  "better-sqlite3",
  "fs-ext",
  "pg",
  "pg-pool",
  "sqlite3",
  "libsql",
  "@libsql/client",
  "node-gyp",
  "node-gyp-build",
  "node-pre-gyp",
  "prebuild-install",
]);
const MODEL_MODULES = new Set([
  "ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "@ai-sdk/mistral",
  "@mistralai/sdk",
  "openai",
  "@anthropic-ai/sdk",
  "mistral-ocr",
  "ollama-ai-provider",
  "ollama",
  "@google/generative-ai",
  "cohere-ai",
  "langchain",
]);

function forbiddenBareReason(specifier: string): string | undefined {
  if (specifier === "node:sqlite") return "storage-driver handle node:sqlite must not enter the neutral closure";
  if (STORAGE_DRIVERS.has(specifier)) return `storage-driver handle ${specifier} must not enter the neutral closure`;
  if (MODEL_MODULES.has(specifier) || specifier.startsWith("mistral")) {
    return `model dependency ${specifier} must not enter the neutral closure`;
  }
  if (specifier === ROOT_PACKAGE || specifier.startsWith(`${ROOT_PACKAGE}/`)) {
    return `root monolithic CLI package ${specifier} must not enter the neutral closure`;
  }
  if (specifier.startsWith("@sentropic/") && specifier !== SELF_PACKAGE && !specifier.startsWith(`${SELF_PACKAGE}/`)) {
    return `external consumer package ${specifier} must not enter the neutral closure`;
  }
  if (/^h2a(-|\/|$)/.test(specifier) || /^@sentropic\/h2a/.test(specifier)) {
    return `h2a host dependency ${specifier} must not enter the neutral closure`;
  }
  return undefined;
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveRepoRelative(fromPath: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(fromPath), specifier));
}

function effectiveInstalledPackage(pathOrSpecifier: string): string | undefined {
  const marker = "node_modules/";
  const idx = pathOrSpecifier.lastIndexOf(marker);
  if (idx === -1) return undefined;
  if (idx > 0 && pathOrSpecifier[idx - 1] !== "/") return undefined;
  const rest = pathOrSpecifier.slice(idx + marker.length);
  if (rest.length === 0) return "";
  const parts = rest.split("/");
  const first = parts[0] ?? "";
  if (first.length === 0) return "";
  if (first.startsWith("@")) {
    const second = parts[1] ?? "";
    return second.length > 0 ? `${first}/${second}` : first;
  }
  return first;
}

// AST import-closure scanner (same class as tests/memory-neutrality.test.ts):
// static imports, export-from, side-effect imports, import type, dynamic
// import() with literal or template-literal targets, import type with a
// literal, CommonJS require() and import-equals require, plus ambient
// declare-module names. Non-literal dynamic targets are counted as
// unresolvedDynamic, except pathToFileURL(...) calls which address a
// runtime-computed local file (the built output itself or an install probe).
interface ExtractedEdges {
  specifiers: string[];
  unresolvedDynamic: number;
  dynamicUrlBuilders: number;
  loaderTargets: string[];
  unresolvedLoaderTargets: number;
  loaderFactoryReferences: number;
}

function unwrapImportArgument(argument: import("typescript").Expression | undefined): import("typescript").Expression | undefined {
  let current = argument;
  for (let guard = 0; current && guard < 20; guard++) {
    if (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isSatisfiesExpression(current)
      || ts.isNonNullExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (current.kind === ts.SyntaxKind.TypeAssertionExpression) {
      current = (current as unknown as { expression: import("typescript").Expression }).expression;
      continue;
    }
    break;
  }
  return current;
}

function unwrapImportTypeArgument(argument: import("typescript").TypeNode): import("typescript").TypeNode {
  let current = argument;
  for (let guard = 0; guard < 20; guard++) {
    if (ts.isParenthesizedTypeNode(current)) {
      current = current.type;
      continue;
    }
    break;
  }
  return current;
}

const LOADER_FACTORY_NAMES = new Set(["createRequire", "getBuiltinModule"]);

function endsWithIdentifierOrProperty(expression: import("typescript").Expression, name: string): boolean {
  if (ts.isIdentifier(expression)) return expression.text === name;
  if (ts.isPropertyAccessExpression(expression)) {
    return ts.isIdentifier(expression.name) && expression.name.text === name;
  }
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
    return expression.argumentExpression.text === name;
  }
  return false;
}

// Indirect loader detection: createRequire(...) is a loader factory wherever
// it comes from (bare identifier or a property chain such as
// require("node:module").createRequire), and getBuiltinModule is a loader
// both as a property of process and as a destructured bare identifier. The
// binding itself is also followed through every rename: `import { createRequire as cr }`,
// `import { getBuiltinModule as g }`, `const { getBuiltinModule: builtin } = process`,
// `const { createRequire: cr } = require("node:module")` and property aliases
// (`const cr = m.createRequire`, `import * as m from "node:module"`) all stay
// controlled, as do loader aliases through further variables.
function bindingPropertyName(propertyName: import("typescript").PropertyName): string {
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) return propertyName.text;
  return "";
}

function extractEdges(content: string): ExtractedEdges {
  const source = ts.createSourceFile("scan.ts", content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const specifiers: string[] = [];
  const loaderTargets: string[] = [];
  let unresolvedDynamic = 0;
  let dynamicUrlBuilders = 0;
  let unresolvedLoaderTargets = 0;
  let loaderFactoryReferences = 0;
  // Pass 1 — loader binding resolution to a fixpoint. A tracked loader is
  // any binding that RECEIVES a loader value: by declaration initializer,
  // by plain or compound assignment (=, ??=, ||=, &&=, including `load =
  // load || cr(url)` conditionals), by destructuring assignment, or as
  // the return value of a local function. Renamed imports
  // (`import { createRequire as cr } from "node:module"`), renamed
  // destructuring (`const { getBuiltinModule: builtin } = process`),
  // property and element aliases (`const cr = m.createRequire`,
  // `m["createRequire"]`, `import * as m from "node:module"`), bound
  // copies (`m.createRequire.bind(m)`) and factory calls through any of
  // them register their identifier, so every later load through the
  // variable — however lazily it was built — is controlled like a direct
  // loader. Parenthesized/as-cast/nonnull initializers are unwrapped.
  const factoryNames = new Set<string>();
  const builtinNames = new Set<string>();
  const loaderAliases = new Set<string>();
  const loaderReturningFunctions = new Set<string>();
  const isBindCall = (expression: import("typescript").Expression): boolean => {
    return ts.isCallExpression(expression)
      && ts.isPropertyAccessExpression(expression.expression)
      && expression.expression.name.text === "bind";
  };
  const isFactoryReference = (expression: import("typescript").Expression): boolean => {
    const unwrapped = unwrapImportArgument(expression);
    if (!unwrapped) return false;
    if (endsWithIdentifierOrProperty(unwrapped, "createRequire")) return true;
    if (ts.isIdentifier(unwrapped) && factoryNames.has(unwrapped.text)) return true;
    if (isBindCall(unwrapped) && isFactoryReference(unwrapped.expression.expression)) return true;
    return false;
  };
  const isBuiltinReference = (expression: import("typescript").Expression): boolean => {
    const unwrapped = unwrapImportArgument(expression);
    if (!unwrapped) return false;
    return endsWithIdentifierOrProperty(unwrapped, "getBuiltinModule")
      || (ts.isIdentifier(unwrapped) && builtinNames.has(unwrapped.text));
  };
  const isCreateRequireFactoryCall = (expression: import("typescript").Expression): boolean => {
    return ts.isCallExpression(expression) && isFactoryReference(expression.expression);
  };
  const isGetBuiltinModuleReference = isBuiltinReference;
  // Classifies an expression by what it evaluates to: "loader" for a value
  // that loads modules (createRequire(...), getBuiltinModule, an alias, a
  // local function returning one, a bound copy), "factory" for the
  // createRequire factory itself, undefined otherwise.
  const classifyLoaderValue = (
    expression: import("typescript").Expression | undefined,
  ): "loader" | "factory" | undefined => {
    const unwrapped = unwrapImportArgument(expression);
    if (!unwrapped) return undefined;
    if (ts.isCallExpression(unwrapped)) {
      if (isCreateRequireFactoryCall(unwrapped)) return "loader";
      if (ts.isIdentifier(unwrapped.expression) && loaderReturningFunctions.has(unwrapped.expression.text)) return "loader";
      if (isBindCall(unwrapped)) return classifyLoaderValue(unwrapped.expression.expression);
      return undefined;
    }
    if (isBuiltinReference(unwrapped)) return "loader";
    if (ts.isIdentifier(unwrapped) && loaderAliases.has(unwrapped.text)) return "loader";
    if (ts.isBinaryExpression(unwrapped) || ts.isConditionalExpression(unwrapped)) {
      // load = load || cr(url) / load = cond ? cr(url) : load: any operand
      // receiving a loader makes the whole expression loader-valued.
      const operands = ts.isBinaryExpression(unwrapped)
        ? [unwrapped.left, unwrapped.right]
        : [unwrapped.whenTrue, unwrapped.whenFalse];
      const kinds = operands.map((operand) => classifyLoaderValue(operand));
      if (kinds.includes("loader")) return "loader";
      if (kinds.includes("factory")) return "factory";
      return undefined;
    }
    if (isFactoryReference(unwrapped)) return "factory";
    return undefined;
  };
  const declarations: import("typescript").VariableDeclaration[] = [];
  const assignments: import("typescript").BinaryExpression[] = [];
  const functionLikes: { name: string; returns: import("typescript").Expression[] }[] = [];
  // Return expressions of a function body, without descending into nested
  // function bodies (their returns belong to the nested function).
  const collectReturns = (body: import("typescript").Node): import("typescript").Expression[] => {
    const returns: import("typescript").Expression[] = [];
    const walk = (node: import("typescript").Node): void => {
      if (ts.isReturnStatement(node) && node.expression) returns.push(node.expression);
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) return;
      ts.forEachChild(node, walk);
    };
    walk(body);
    return returns;
  };
  const collectDeclarations = (node: import("typescript").Node): void => {
    if (ts.isImportDeclaration(node) && node.importClause && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text.replace(/^node:/, "");
      const namedBindings = node.importClause.namedBindings;
      if ((moduleName === "module" || moduleName === "process") && namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (!element.propertyName || !ts.isIdentifier(element.name)) continue;
          if (moduleName === "module" && element.propertyName.text === "createRequire") {
            factoryNames.add(element.name.text);
          }
          if (moduleName === "process" && element.propertyName.text === "getBuiltinModule") {
            builtinNames.add(element.name.text);
          }
        }
      }
    } else if (ts.isVariableDeclaration(node)) {
      declarations.push(node);
      if (ts.isIdentifier(node.name) && node.initializer
        && (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer))) {
        const body = node.initializer.body;
        functionLikes.push({
          name: node.name.text,
          returns: ts.isBlock(body) ? collectReturns(body) : [body],
        });
      }
    } else if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      functionLikes.push({ name: node.name.text, returns: collectReturns(node.body) });
    } else if (ts.isBinaryExpression(node) && (
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken
      || node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
      || node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
    )) {
      assignments.push(node);
    }
    ts.forEachChild(node, collectDeclarations);
  };
  collectDeclarations(source);
  for (let round = 0; round < 10; round++) {
    let changed = false;
    const register = (names: Set<string>, name: string): void => {
      if (!names.has(name)) {
        names.add(name);
        changed = true;
      }
    };
    for (const declaration of declarations) {
      if (ts.isObjectBindingPattern(declaration.name)) {
        // const { getBuiltinModule: builtin } = process and friends: the
        // destructured loader keeps its local name under control.
        for (const element of declaration.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const imported = element.propertyName ? bindingPropertyName(element.propertyName) : element.name.text;
          if (imported === "createRequire") register(factoryNames, element.name.text);
          if (imported === "getBuiltinModule") register(builtinNames, element.name.text);
        }
        continue;
      }
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const kind = classifyLoaderValue(declaration.initializer);
      if (kind === "loader") {
        // const load = createRequire(...) / const builtin = process.getBuiltinModule
        // / const load = mk() / const load2 = load.
        register(loaderAliases, declaration.name.text);
      } else if (kind === "factory") {
        // const cr = m.createRequire / createRequire / cr: a factory alias.
        register(factoryNames, declaration.name.text);
      }
    }
    for (const fn of functionLikes) {
      // function mk() { return createRequire(...); }: mk() builds a loader.
      if (!loaderReturningFunctions.has(fn.name)
        && fn.returns.some((value) => classifyLoaderValue(value) === "loader")) {
        register(loaderReturningFunctions, fn.name);
      }
    }
    for (const assignment of assignments) {
      // let load; load = cr(import.meta.url); load ??= cr(...); ({load} = o):
      // any assignment building a loader tracks its binding too, wherever
      // the assignment sits (module or function scope).
      if (ts.isIdentifier(assignment.left)) {
        const kind = classifyLoaderValue(assignment.right);
        if (kind) register(kind === "loader" ? loaderAliases : factoryNames, assignment.left.text);
      } else if (ts.isObjectLiteralExpression(assignment.left) || ts.isArrayLiteralExpression(assignment.left)) {
        // Destructuring assignment: conservative — when any right-hand
        // element receives a loader/factory value, every identifier bound
        // in the pattern is tracked.
        const rightValues = ts.isArrayLiteralExpression(assignment.right) && ts.isArrayLiteralExpression(assignment.left)
          ? assignment.right.elements
          : ts.isObjectLiteralExpression(assignment.right) && ts.isObjectLiteralExpression(assignment.left)
            ? assignment.right.properties.filter(ts.isPropertyAssignment).map((property) => property.initializer)
            : [assignment.right];
        const names = rightValues.some((value) => classifyLoaderValue(value) === "loader")
          ? loaderAliases
          : rightValues.some((value) => classifyLoaderValue(value) === "factory")
            ? factoryNames
            : undefined;
        if (!names) continue;
        const walkPattern = (pattern: import("typescript").Node): void => {
          if (ts.isIdentifier(pattern)) {
            register(names, pattern.text);
            return;
          }
          ts.forEachChild(pattern, walkPattern);
        };
        walkPattern(assignment.left);
      }
    }
    if (!changed) break;
  }
  const pushArgument = (argument: import("typescript").Expression | undefined): void => {
    const unwrapped = unwrapImportArgument(argument);
    if (!unwrapped) return;
    if (ts.isStringLiteralLike(unwrapped)) {
      specifiers.push(unwrapped.text);
      return;
    }
    // import(pathToFileURL(...).href) addresses a runtime-computed local
    // file (the built output or an install probe); the target is walked
    // separately by the file-set scans. Unwrap property chains (.href).
    let target = unwrapped;
    for (let guard = 0; guard < 20; guard++) {
      if (ts.isPropertyAccessExpression(target)) {
        target = target.expression;
        continue;
      }
      break;
    }
    if (ts.isCallExpression(target) && ts.isIdentifier(target.expression) && target.expression.text === "pathToFileURL") {
      dynamicUrlBuilders += 1;
      return;
    }
    unresolvedDynamic += 1;
  };
  // A load through an indirect loader must name a static string target; any
  // computed target is an unresolved loader target and is rejected.
  const pushLoaderArgument = (argument: import("typescript").Expression | undefined): void => {
    const unwrapped = unwrapImportArgument(argument);
    if (unwrapped && ts.isStringLiteralLike(unwrapped)) {
      loaderTargets.push(unwrapped.text);
      return;
    }
    unresolvedLoaderTargets += 1;
  };
  const visit = (node: import("typescript").Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
        else unresolvedDynamic += 1;
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) pushArgument(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        pushArgument(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        pushArgument(node.arguments[0]);
      } else if (ts.isCallExpression(node.expression) && isCreateRequireFactoryCall(node.expression)) {
        // createRequire(...)(target): the direct indirect-load form.
        pushLoaderArgument(node.arguments[0]);
      } else if (isGetBuiltinModuleReference(node.expression)) {
        // process.getBuiltinModule(target) / destructured getBuiltinModule(target).
        pushLoaderArgument(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && loaderAliases.has(node.expression.text)) {
        // alias(target): the indirect load through a variable.
        pushLoaderArgument(node.arguments[0]);
      } else if (
        ts.isCallExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && loaderReturningFunctions.has(node.expression.expression.text)
      ) {
        // mk()(target): the loader is the return value of a local function.
        pushLoaderArgument(node.arguments[0]);
      }
    } else if (ts.isImportTypeNode(node)) {
      const argument = unwrapImportTypeArgument(node.argument);
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        specifiers.push(argument.literal.text);
      } else {
        unresolvedDynamic += 1;
      }
    } else if (ts.isModuleDeclaration(node)) {
      if (ts.isStringLiteralLike(node.name)) specifiers.push(node.name.text);
    }
    // Outright-ban counter: every reference to a loader factory, however it
    // is reached (bare identifier, property or element access, type
    // position), is reported so the neutral-closure policies can forbid
    // createRequire/getBuiltinModule outright.
    if (ts.isIdentifier(node) && LOADER_FACTORY_NAMES.has(node.text)) {
      loaderFactoryReferences += 1;
    } else if (
      ts.isElementAccessExpression(node)
      && ts.isStringLiteralLike(node.argumentExpression)
      && LOADER_FACTORY_NAMES.has(node.argumentExpression.text)
    ) {
      loaderFactoryReferences += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return {
    specifiers: [...new Set(specifiers)],
    unresolvedDynamic,
    dynamicUrlBuilders,
    loaderTargets: [...new Set(loaderTargets)],
    unresolvedLoaderTargets,
    loaderFactoryReferences,
  };
}

function dynamicViolations(path: string, edges: ExtractedEdges, allowUrlBuilders: boolean): ClosureViolation[] {
  const unresolved = (allowUrlBuilders
    ? edges.unresolvedDynamic
    : edges.unresolvedDynamic + edges.dynamicUrlBuilders) + edges.unresolvedLoaderTargets;
  return unresolved > 0
    ? [{
      path,
      specifier: "(unresolved target)",
      reason: "unresolved dynamic import/require/loader targets are rejected: use a static string literal or pathToFileURL for the built output",
    }]
    : [];
}

// Scan targets with their provenance: a direct module edge or a load through
// an indirect loader (createRequire/getBuiltinModule). Both obey the same
// neutrality rules; the origin only sharpens the violation reason.
type ScanOrigin = "edge" | "indirect loader";

interface ScanTarget {
  specifier: string;
  origin: ScanOrigin;
}

function scanTargets(edges: ExtractedEdges): ScanTarget[] {
  return [
    ...edges.specifiers.map((specifier) => ({ specifier, origin: "edge" as const })),
    ...edges.loaderTargets.map((specifier) => ({ specifier, origin: "indirect loader" as const })),
  ];
}

function indirectSuffix(origin: ScanOrigin): string {
  return origin === "indirect loader" ? " (loaded through an indirect createRequire/getBuiltinModule loader)" : "";
}

function checkSourceFile(file: ScannedFile): ClosureViolation[] {
  const edges = extractEdges(file.content);
  const violations: ClosureViolation[] = [...dynamicViolations(file.path, edges, false)];
  // No legitimate loader use exists in the neutral closure, so loaders are
  // forbidden outright, not merely target-checked: any createRequire or
  // getBuiltinModule reference is rejected however it is laundered.
  if (edges.loaderFactoryReferences > 0) {
    violations.push({
      path: file.path,
      specifier: "(loader factory)",
      reason: "the neutral closure builds no loader at all: every createRequire/getBuiltinModule reference is forbidden outright (engram-live has no legitimate loader use)",
    });
  }
  // The contracts export is data-pure: no module of any kind, no indirect
  // loader, no load-time I/O (same guard class as tests/memory-neutrality.test.ts).
  const isContracts = file.path === "engram-live/contracts.ts";
  for (const { specifier, origin } of scanTargets(edges)) {
    if (isContracts) {
      violations.push({
        path: file.path,
        specifier,
        reason: `engram-live/contracts is data-pure and takes no imports, no indirect loaders and no load-time side effects (rejected ${origin}: "${specifier}")`,
      });
      continue;
    }
    const forbidden = forbiddenBareReason(specifier);
    if (forbidden) {
      violations.push({ path: file.path, specifier, reason: `${forbidden}${indirectSuffix(origin)}` });
      continue;
    }
    if (specifier === "module" || specifier === "node:module") {
      violations.push({
        path: file.path,
        specifier,
        reason: `source ${origin} imports the module-loader builtin ${specifier}: the neutral closure builds no loader (node:module is forbidden)${indirectSuffix(origin)}`,
      });
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveRepoRelative(file.path, specifier);
      const effective = effectiveInstalledPackage(resolved);
      if (effective !== undefined) {
        violations.push({
          path: file.path,
          specifier,
          reason: `source ${origin} reaches installed dependency "${effective}" under node_modules: the neutral package takes no dependency${indirectSuffix(origin)}`,
        });
        continue;
      }
      if (resolved !== "engram-live" && !resolved.startsWith("engram-live/")) {
        violations.push({
          path: file.path,
          specifier,
          reason: `source ${origin} escapes engram-live/ -> ${resolved}${indirectSuffix(origin)}`,
        });
      }
      continue;
    }
    violations.push({
      path: file.path,
      specifier,
      reason: `source edges and indirect loaders import only in-package relative modules and node: builtins (no runtime dependency)${indirectSuffix(origin)}`,
    });
  }
  return violations;
}

function checkGeneratedFile(file: ScannedFile): ClosureViolation[] {
  const edges = extractEdges(file.content);
  const violations: ClosureViolation[] = [...dynamicViolations(file.path, edges, false)];
  // Same outright loader ban on the emitted output: the built files build no
  // loader at all, whatever target it would name.
  if (edges.loaderFactoryReferences > 0) {
    violations.push({
      path: file.path,
      specifier: "(loader factory)",
      reason: "the neutral closure builds no loader at all: every createRequire/getBuiltinModule reference is forbidden outright (engram-live has no legitimate loader use)",
    });
  }
  // The emitted contracts surface is data-pure too: the built .js and the
  // declarations take no imports and no indirect loaders of any kind.
  const isContractsEmitted = file.path.startsWith("engram-live/dist/contracts.");
  for (const { specifier, origin } of scanTargets(edges)) {
    if (isContractsEmitted) {
      violations.push({
        path: file.path,
        specifier,
        reason: `emitted contracts are data-pure and take no imports, no indirect loaders and no load-time side effects (rejected ${origin}: "${specifier}")`,
      });
      continue;
    }
    const forbidden = forbiddenBareReason(specifier);
    if (forbidden) {
      violations.push({ path: file.path, specifier, reason: `${forbidden}${indirectSuffix(origin)}` });
      continue;
    }
    if (specifier === "module" || specifier === "node:module") {
      violations.push({
        path: file.path,
        specifier,
        reason: `generated-code ${origin} imports the module-loader builtin ${specifier}: the neutral closure builds no loader (node:module is forbidden)${indirectSuffix(origin)}`,
      });
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveRepoRelative(file.path, specifier);
      const effective = effectiveInstalledPackage(resolved);
      if (effective !== undefined) {
        violations.push({
          path: file.path,
          specifier,
          reason: `generated-code ${origin} reaches installed dependency "${effective}" under node_modules: the neutral package takes no dependency${indirectSuffix(origin)}`,
        });
        continue;
      }
      if (!resolved.startsWith("engram-live/dist/")) {
        violations.push({
          path: file.path,
          specifier,
          reason: `generated-code ${origin} escapes the emitted tree -> ${resolved}${indirectSuffix(origin)}`,
        });
      }
      continue;
    }
    violations.push({
      path: file.path,
      specifier,
      reason: `generated-code edges and indirect loaders import only in-dist relative modules and node: builtins (no runtime dependency)${indirectSuffix(origin)}`,
    });
  }
  return violations;
}

let publicSubpathsCache: Set<string> | undefined;
function publicImportSubpaths(): Set<string> {
  if (publicSubpathsCache) return publicSubpathsCache;
  const pkg = JSON.parse(readFileSync(join(liveRoot, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  if (!pkg.exports || typeof pkg.exports !== "object") {
    throw new Error("engram-live/package.json must declare an exports map (exact public subpaths).");
  }
  const out = new Set<string>();
  for (const key of Object.keys(pkg.exports)) {
    out.add(key === "." ? SELF_PACKAGE : `${SELF_PACKAGE}/${key.replace(/^\.\//, "")}`);
  }
  publicSubpathsCache = out;
  return out;
}

interface PackageClosureInput {
  packedPaths: string[];
  packageJson: Record<string, unknown>;
  lockJson: unknown;
  manifestLanguages: Record<string, { file: string }>;
}

function effectiveLockfileNames(lock: unknown): string[] {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    throw new Error("engram-live/package-lock.json must parse to an object carrying a packages record.");
  }
  const packages = (lock as { packages?: unknown }).packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    throw new Error("engram-live/package-lock.json must contain a packages record (no silent fallback).");
  }
  return Object.entries(packages as Record<string, { name?: unknown }>).map(([key, entry]) => {
    if (key === "") return typeof entry?.name === "string" ? entry.name : SELF_PACKAGE;
    const effective = entry !== null && typeof entry === "object"
      ? (entry as { name?: unknown }).name
      : undefined;
    if (typeof effective === "string" && effective.length > 0) return effective;
    return key.replace(/^node_modules\//, "");
  });
}

// The delivered surface is EXACT, not merely bounded: the packed file list,
// the exports map targets, and the qualified runtime/platform bounds are all
// pinned. Any drift — a missing required file, an extra dist file such as a
// stray dist/driver.mjs, a redirected export target, an unbounded engines
// field or an unadvertised platform — is a violation.
const EXPECTED_EXPORTS: Record<string, { types: string; import: string }> = {
  ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
  "./contracts": { types: "./dist/contracts.d.ts", import: "./dist/contracts.js" },
  "./integration": { types: "./dist/integration.d.ts", import: "./dist/integration.js" },
};
const EXPECTED_ENGINES = { node: "^20.0.0 || ^22.0.0 || ^24.0.0" };
const EXPECTED_OS = ["linux"];

function expectedPackedPaths(manifestLanguages: Record<string, { file: string }>): string[] {
  return [
    "package.json",
    "grammar-manifest.json",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/contracts.js",
    "dist/contracts.d.ts",
    "dist/contracts.d.ts.map",
    "dist/registration.js",
    "dist/registration.d.ts",
    "dist/registration.d.ts.map",
    "dist/integration.js",
    "dist/integration.d.ts",
    "dist/integration.d.ts.map",
    ...Object.values(manifestLanguages).map((entry) => `dist/grammars/${entry.file}`),
  ].sort();
}

function checkPackageClosure(input: PackageClosureInput): ClosureViolation[] {
  const violations: ClosureViolation[] = [];
  const packed = new Set(input.packedPaths);
  for (const path of input.packedPaths) {
    if (/\.(py|pyc|pyo)$/i.test(path)) {
      violations.push({ path, specifier: "(packed closure)", reason: "packed closure must not ship Python sources" });
    }
    if (path.includes("node_modules/") || path.startsWith("node_modules")) {
      violations.push({ path, specifier: "(packed closure)", reason: "packed closure must not ship node_modules" });
    }
    if (path.includes("engram-memory")) {
      violations.push({ path, specifier: "(packed closure)", reason: "packed closure must not ship the engram-memory package" });
    }
  }
  // Exact packed surface: nothing missing, nothing extra.
  const expected = expectedPackedPaths(input.manifestLanguages);
  for (const path of expected) {
    if (!packed.has(path)) {
      violations.push({ path, specifier: "(packed closure)", reason: `required file is missing from the packed closure: ${path}` });
    }
  }
  for (const path of [...packed].sort()) {
    if (!expected.includes(path)) {
      violations.push({
        path,
        specifier: "(packed closure)",
        reason: `packed file is outside the exact delivered surface (${expected.length} pinned files): ${path}`,
      });
    }
  }
  const pkg = input.packageJson;
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (pkg[field] !== undefined) {
      violations.push({ path: "engram-live/package.json", specifier: field, reason: `the neutral package declares no ${field} (no runtime dependency, no root shortcut)` });
    }
  }
  const scripts = pkg.scripts as Record<string, unknown> | undefined;
  if (scripts !== undefined) {
    for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
      if (scripts[lifecycle] !== undefined) {
        violations.push({ path: "engram-live/package.json", specifier: lifecycle, reason: "the neutral package ships no install lifecycle script (no Python fallback, no compiler step)" });
      }
    }
  }
  if (pkg.bin !== undefined) {
    violations.push({ path: "engram-live/package.json", specifier: "bin", reason: "the neutral package ships no CLI binary (no root CLI)" });
  }
  if (JSON.stringify(pkg.exports) !== JSON.stringify(EXPECTED_EXPORTS)) {
    violations.push({
      path: "engram-live/package.json",
      specifier: "exports",
      reason: `exports map must be exactly ${JSON.stringify(EXPECTED_EXPORTS)} (targets included, not just subpath names)`,
    });
  }
  if (JSON.stringify(pkg.engines) !== JSON.stringify(EXPECTED_ENGINES)) {
    violations.push({
      path: "engram-live/package.json",
      specifier: "engines",
      reason: `engines must stay bounded to the qualified runtimes: ${JSON.stringify(EXPECTED_ENGINES)}`,
    });
  }
  if (JSON.stringify(pkg.os) !== JSON.stringify(EXPECTED_OS)) {
    violations.push({
      path: "engram-live/package.json",
      specifier: "os",
      reason: `os must stay bounded to the qualified platform ${JSON.stringify(EXPECTED_OS)}; unverified combinations are not advertised`,
    });
  }
  const lockNames = effectiveLockfileNames(input.lockJson);
  for (const name of lockNames) {
    if (name !== SELF_PACKAGE) {
      violations.push({ path: "engram-live/package-lock.json", specifier: name, reason: "the lockfile closure must contain only @sentropic/engram-live itself (no transitive dependency)" });
    }
  }
  return violations;
}

// Neutral test closure: an EXPLICIT, controlled list of the tests and
// helpers that exercise the engram-live package. Root-CLI tests
// (live-no-llm, live-fixtures, live-worktree-safety, …) stay outside it
// whatever their tests/live-* name; a future package test or helper joins
// the closure only by being added to this list on purpose.
const NEUTRAL_TEST_FILES = new Set([
  "tests/live-neutrality.test.ts",
  "tests/live-package.test.ts",
  "tests/live-helper.ts",
]);

// Candidate repo paths a relative test import can resolve to (as written,
// with a .ts extension, and .js rewritten to .ts).
function neutralTestImportCandidates(fromPath: string, specifier: string): string[] {
  const resolved = resolveRepoRelative(fromPath, specifier);
  const candidates = [resolved, `${resolved}.ts`];
  if (resolved.endsWith(".js")) candidates.push(`${resolved.slice(0, -3)}.ts`);
  return candidates;
}

function checkTestFile(file: ScannedFile): ClosureViolation[] {
  const edges = extractEdges(file.content);
  const violations: ClosureViolation[] = [...dynamicViolations(file.path, edges, true)];
  for (const { specifier, origin } of scanTargets(edges)) {
    const forbidden = forbiddenBareReason(specifier);
    if (forbidden) {
      violations.push({ path: file.path, specifier, reason: `${forbidden}${indirectSuffix(origin)}` });
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    if (specifier === "vitest" || specifier === "typescript" || specifier === "web-tree-sitter") continue;
    if (publicImportSubpaths().has(specifier)) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveRepoRelative(file.path, specifier);
      const effective = effectiveInstalledPackage(resolved);
      if (effective !== undefined) {
        if (effective !== "web-tree-sitter" && effective !== "typescript" && effective !== "vitest") {
          violations.push({
            path: file.path,
            specifier,
            reason: `test ${origin} reaches installed dependency "${effective}" under node_modules: only the test-local scanner/parser backends are allowed${indirectSuffix(origin)}`,
          });
        }
        continue;
      }
      const inNeutralClosure = neutralTestImportCandidates(file.path, specifier)
        .some((candidate) => NEUTRAL_TEST_FILES.has(candidate));
      const inLivePackage = resolved === "engram-live" || resolved.startsWith("engram-live/");
      if (!inNeutralClosure && !inLivePackage) {
        violations.push({ path: file.path, specifier, reason: `test ${origin} leaves the neutral test closure -> ${resolved}${indirectSuffix(origin)}` });
      }
      continue;
    }
    violations.push({
      path: file.path,
      specifier,
      reason: `test edges and indirect loaders import only exact @sentropic/engram-live subpaths, node: builtins, the vitest/typescript/web-tree-sitter test backends, or in-closure files${indirectSuffix(origin)}`,
    });
  }
  return violations;
}

function checkImportClosure(files: ScannedFile[], kind: EdgeSet, input?: PackageClosureInput): ClosureViolation[] {
  switch (kind) {
    case "source":
      return files.flatMap(checkSourceFile);
    case "generated":
      return files.flatMap(checkGeneratedFile);
    case "package":
      return checkPackageClosure(input as PackageClosureInput);
    case "test":
      return files.flatMap(checkTestFile);
  }
}

function listScannedFiles(repoRelDir: string, extensions: string[]): ScannedFile[] {
  const out: ScannedFile[] = [];
  const absolute = join(root, ...repoRelDir.split("/"));
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const rel = `${repoRelDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...listScannedFiles(rel, extensions));
    } else if (entry.isFile() && extensions.some((ext) => rel.endsWith(ext))) {
      const file = join(root, ...rel.split("/"));
      if (statSync(file).size > 0) out.push({ path: rel, content: readFileSync(file, "utf8") });
    }
  }
  return out;
}

function sourceFiles(): ScannedFile[] {
  return listScannedFiles("engram-live", [".ts"]).filter((file) => !file.path.includes("/dist/"));
}

function generatedFiles(): ScannedFile[] {
  const files = listScannedFiles("engram-live/dist", [".js", ".d.ts"]);
  if (!files.some((file) => file.path === "engram-live/dist/index.js")) {
    throw new Error("engram-live build missing: run `node scripts/build-live.mjs` before this test (no skip).");
  }
  return files;
}

function testClosureFiles(): ScannedFile[] {
  const allTests = listScannedFiles("tests", [".ts"]);
  const byPath = new Map(allTests.map((file) => [file.path, file]));
  // Exactly the listed files that exist on disk: no tests/live-* pattern
  // and no engram-live mention heuristic. A listed file that does not
  // exist yet (a future helper) is simply absent from the scan, never
  // silently replaced by name matching.
  return [...NEUTRAL_TEST_FILES]
    .filter((path) => byPath.has(path))
    .map((path) => byPath.get(path) as ScannedFile);
}

function packedLivePaths(): string[] {
  const raw = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json"],
    { cwd: liveRoot, encoding: "utf8" },
  );
  const parsed = JSON.parse(raw) as [{ files: { path: string }[] }];
  return parsed[0].files.map((file) => file.path);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Transitive static closure of the built entry: every relative edge reachable
// from dist/integration.js must resolve inside the emitted tree.
function builtEntryClosureViolations(generated: ScannedFile[]): ClosureViolation[] {
  const byPath = new Map(generated.map((file) => [file.path, file]));
  const entry = "engram-live/dist/integration.js";
  const seen = new Set<string>([entry]);
  const queue: ScannedFile[] = [byPath.get(entry) as ScannedFile];
  const violations: ClosureViolation[] = [];
  if (!byPath.has(entry)) {
    throw new Error("engram-live build missing: dist/integration.js not found (no skip).");
  }
  while (queue.length > 0) {
    const current = queue.pop() as ScannedFile;
    const edges = extractEdges(current.content);
    violations.push(...dynamicViolations(current.path, edges, false));
    if (edges.loaderFactoryReferences > 0) {
      violations.push({
        path: current.path,
        specifier: "(loader factory)",
        reason: "the neutral closure builds no loader at all: every createRequire/getBuiltinModule reference is forbidden outright (engram-live has no legitimate loader use)",
      });
    }
    for (const { specifier, origin } of scanTargets(edges)) {
      const forbidden = forbiddenBareReason(specifier);
      if (forbidden) {
        violations.push({ path: current.path, specifier, reason: `${forbidden}${indirectSuffix(origin)}` });
        continue;
      }
      if (specifier === "module" || specifier === "node:module") {
        violations.push({
          path: current.path,
          specifier,
          reason: `transitive closure ${origin} imports the module-loader builtin ${specifier}: the neutral closure builds no loader (node:module is forbidden)${indirectSuffix(origin)}`,
        });
        continue;
      }
      if (!isRelativeSpecifier(specifier)) continue;
      const resolved = resolveRepoRelative(current.path, specifier);
      if (!resolved.startsWith("engram-live/dist/")) {
        violations.push({ path: current.path, specifier, reason: `transitive closure ${origin} escapes the emitted tree -> ${resolved}${indirectSuffix(origin)}` });
        continue;
      }
      if (!byPath.has(resolved)) {
        violations.push({ path: current.path, specifier, reason: `transitive closure ${origin} targets a missing emitted file -> ${resolved}${indirectSuffix(origin)}` });
        continue;
      }
      if (!seen.has(resolved)) {
        seen.add(resolved);
        queue.push(byPath.get(resolved) as ScannedFile);
      }
    }
  }
  return violations;
}

describe("live neutrality", () => {
  beforeAll(ensureLiveBuild);

  it("built live entry has no consumer or model dependency in its transitive static and dynamic import closure", async () => {
    const source = sourceFiles();
    const generated = generatedFiles();
    // Scanning every emitted file is a superset of the entry's transitive
    // closure; the explicit walk below proves the entry closure in addition.
    const violations = [
      ...source.flatMap(checkSourceFile),
      ...generated.flatMap(checkGeneratedFile),
      ...builtEntryClosureViolations(generated),
    ];
    expect(violations).toEqual([]);

    // Package closure: packed surface, package metadata and lockfile.
    const manifest = JSON.parse(readFileSync(join(liveRoot, "grammar-manifest.json"), "utf8")) as {
      languages: Record<string, { file: string; sha256: string }>;
    };
    const packageJson = JSON.parse(readFileSync(join(liveRoot, "package.json"), "utf8")) as Record<string, unknown>;
    const lockJson = JSON.parse(readFileSync(join(liveRoot, "package-lock.json"), "utf8"));
    expect(checkImportClosure([], "package", {
      packedPaths: packedLivePaths(),
      packageJson,
      lockJson,
      manifestLanguages: manifest.languages,
    })).toEqual([]);

    // Built grammar assets match the pinned manifest digests byte for byte.
    for (const [language, entry] of Object.entries(manifest.languages)) {
      const assetPath = join(liveRoot, "dist", "grammars", entry.file);
      expect(existsSync(assetPath)).toBe(true);
      expect(sha256(readFileSync(assetPath))).toBe(entry.sha256);
    }

    // Tests of the neutral surface stay inside it: the closure is the
    // explicit NEUTRAL_TEST_FILES list only, and every listed test keeps
    // its imports inside the package, the listed helpers and the allowed
    // test backends. The root-CLI live tests (live-no-llm, live-fixtures,
    // live-worktree-safety) must stay out of the closure whatever their
    // tests/live-* name.
    const neutralTests = testClosureFiles();
    expect(neutralTests.flatMap(checkTestFile)).toEqual([]);
    const closurePaths = neutralTests.map((file) => file.path);
    expect(closurePaths).toContain("tests/live-neutrality.test.ts");
    expect(closurePaths).toContain("tests/live-package.test.ts");
    expect(closurePaths).not.toContain("tests/live-no-llm.test.ts");
    expect(closurePaths).not.toContain("tests/live-fixtures.test.ts");

    // Runtime smoke: the built entry and contracts actually load, and the
    // advertised languages cannot drift from the pinned manifest.
    const integration = await import(pathToFileURL(join(liveRoot, "dist", "integration.js")).href);
    expect(typeof integration.createLiveFactory).toBe("function");
    const contracts = await import(pathToFileURL(join(liveRoot, "dist", "contracts.js")).href);
    expect(contracts.ADVERTISED_LANGUAGES.slice().sort()).toEqual(Object.keys(manifest.languages).sort());
  });

  it("source, built output and package closure scans reject an injected forbidden edge", async () => {
    const consumer = "@sen" + "tropic/engram";
    const alien = "@sen" + "tropic/cluster-mesh";
    // Source scan: root CLI, external consumer, driver and h2a edges.
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { cli } from "${consumer}";`,
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { adapter } from "${alien}";`,
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `const native = await import("better-sqlite3");`,
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { db } from "node:sqlite";`,
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { host } from "h2a-runtime";`,
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `const model = await import("mistral-ocr");`,
    }], "source")).not.toEqual([]);
    // Source scan: a relative escape into the root package is forbidden.
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { x } from "../src/cli.js";`,
    }], "source")).not.toEqual([]);
    // Source scan: a node_modules shortcut is forbidden.
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { g } from "./node_modules/@sentropic/graph/dist/index.js";`,
    }], "source")).not.toEqual([]);
    // Source scan legal control: relative, node: and type-level edges pass.
    expect(checkImportClosure([{
      path: "engram-live/integration.ts",
      content: `import { x } from "./contracts.js";\nimport { createHash } from "node:crypto";\ntype Z = import("./contracts.js").LiveScope;`,
    }], "source")).toEqual([]);
    // Generated-code scan: an edge escaping the emitted tree is forbidden, as is a driver.
    expect(checkImportClosure([{
      path: "engram-live/dist/integration.js",
      content: `import { x } from "../../src/cli.js";`,
    }], "generated")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/dist/integration.js",
      content: `import { db } from "pg";`,
    }], "generated")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/dist/integration.js",
      content: `import { x } from "./contracts.js";`,
    }], "generated")).toEqual([]);
    // Indirect loaders are controlled on the sources AND on the built
    // outputs: every form (createRequire via variable, createRequire direct,
    // require("node:module").createRequire alias, process.getBuiltinModule)
    // loading a storage-driver handle is rejected in both sets.
    const loaderProbes: { name: string; content: string }[] = [
      { name: "createRequire via variable", content: 'const load = createRequire(import.meta.url); const db = load("node:sqlite");' },
      { name: "createRequire direct", content: 'const db = createRequire(import.meta.url)("node:sqlite");' },
      { name: "createRequire through node:module", content: 'const load = require("node:module").createRequire(import.meta.url); const db = load("node:sqlite");' },
      { name: "process.getBuiltinModule", content: 'const db = process.getBuiltinModule("node:sqlite");' },
      { name: "renamed createRequire import", content: 'import { createRequire as cr } from "node:module"; const load = cr(import.meta.url); const db = load("node:sqlite");' },
      { name: "renamed getBuiltinModule import", content: 'import { getBuiltinModule as g } from "node:process"; const db = g("node:sqlite");' },
      { name: "namespace-imported createRequire property", content: 'import * as m from "node:module"; const load = m.createRequire(import.meta.url); const db = load("node:sqlite");' },
      { name: "aliased createRequire property", content: 'import * as m from "node:module"; const cr = m.createRequire; const load = cr(import.meta.url); const db = load("node:sqlite");' },
      { name: "default-imported module.createRequire", content: 'import module from "node:module"; const load = module.createRequire(import.meta.url); const db = load("node:sqlite");' },
      { name: "destructured renamed getBuiltinModule", content: 'const { getBuiltinModule: builtin } = process; const db = builtin("node:sqlite");' },
      { name: "destructured renamed createRequire", content: 'const { createRequire: cr } = require("node:module"); const load = cr(import.meta.url); const db = load("node:sqlite");' },
      { name: "loader alias through a second variable", content: 'const load = createRequire(import.meta.url); const load2 = load; const db = load2("node:sqlite");' },
      { name: "lazy assignment after declaration", content: 'let load; load = createRequire(import.meta.url); const db = load("node:sqlite");' },
      { name: "compound lazy assignment in a function", content: 'import { createRequire as cr } from "node:module"; let load; export function lazyDriver() { load ??= cr(import.meta.url); return load("node:sqlite"); }' },
      { name: "assignment inside a function", content: 'let load; function init() { load = createRequire(import.meta.url); } init(); const db = load("node:sqlite");' },
      { name: "logical-or lazy assignment", content: 'let load; load = load || createRequire(import.meta.url); const db = load("node:sqlite");' },
      { name: "loader returned by a local function", content: 'function mk() { return createRequire(import.meta.url); } const load = mk(); const db = load("node:sqlite");' },
      { name: "immediate call of a function-returned loader", content: 'function mk() { return createRequire(import.meta.url); } const db = mk()("node:sqlite");' },
      { name: "parenthesized loader initialization", content: 'const load = (createRequire(import.meta.url)); const db = load("node:sqlite");' },
      { name: "bound createRequire", content: 'import * as m from "node:module"; const bound = m.createRequire.bind(m); const load = bound(import.meta.url); const db = load("node:sqlite");' },
      { name: "destructuring assignment", content: 'let load; [load] = [createRequire(import.meta.url)]; const db = load("node:sqlite");' },
      { name: "lazily assigned getBuiltinModule", content: 'let builtin; builtin = process.getBuiltinModule; const db = builtin("node:sqlite");' },
    ];
    for (const probe of loaderProbes) {
      const inSource = checkImportClosure([{ path: "engram-live/integration.ts", content: probe.content }], "source");
      expect(
        inSource.some((violation) => violation.reason.includes("node:sqlite")),
        `${probe.name} must be rejected in the source scan: ${JSON.stringify(inSource)}`,
      ).toBe(true);
      const inGenerated = checkImportClosure([{ path: "engram-live/dist/integration.js", content: probe.content }], "generated");
      expect(
        inGenerated.some((violation) => violation.reason.includes("node:sqlite")),
        `${probe.name} must be rejected in the built-output scan: ${JSON.stringify(inGenerated)}`,
      ).toBe(true);
    }
    // An indirect loader or dynamic import with a computed target is refused
    // (no silent skip), in both the sources and the built outputs.
    for (const unresolved of [
      'export function probeLoad(target: string) { return createRequire(import.meta.url)(target); }',
      "const alias = createRequire(import.meta.url); export function probeLoad(target: string) { return alias(target); }",
      "export async function probeImport(target: string) { return import(target); }",
    ]) {
      expect(checkImportClosure([{ path: "engram-live/integration.ts", content: unresolved }], "source")).not.toEqual([]);
      expect(checkImportClosure([{ path: "engram-live/dist/integration.js", content: unresolved }], "generated")).not.toEqual([]);
    }
    // The neutral closure has NO legitimate loader use: even a loader aimed
    // at a node: builtin is refused there (createRequire/getBuiltinModule are
    // forbidden outright), while the test closure keeps loading its local
    // typescript backend through a loader.
    for (const loaderToBuiltin of [
      'const nodeCrypto = createRequire(import.meta.url)("node:crypto");',
      "const builtinCrypto = process.getBuiltinModule(\"node:crypto\");",
    ]) {
      expect(checkImportClosure([{
        path: "engram-live/integration.ts",
        content: loaderToBuiltin,
      }], "source")).not.toEqual([]);
      expect(checkImportClosure([{
        path: "engram-live/dist/integration.js",
        content: loaderToBuiltin,
      }], "generated")).not.toEqual([]);
    }
    expect(checkImportClosure([{
      path: "tests/live-neutrality.test.ts",
      content: 'const backend = createRequire(import.meta.url)("typescript");',
    }], "test")).toEqual([]);
    // The /contracts export stays data-pure: no module of any kind, no
    // indirect loader, no load-time I/O — source, built JS and declarations.
    expect(checkImportClosure([{
      path: "engram-live/contracts.ts",
      content: 'import { readFileSync } from "node:fs"; export const leak = readFileSync("/etc/passwd");',
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-live/contracts.ts",
      content: 'const load = createRequire(import.meta.url); export const leak = load("node:fs");',
    }], "source")).not.toEqual([]);
    for (const contractsPath of ["engram-live/dist/contracts.js", "engram-live/dist/contracts.d.ts"]) {
      expect(checkImportClosure([{
        path: contractsPath,
        content: 'import { readFileSync } from "node:fs"; readFileSync("/etc/passwd");',
      }], "generated")).not.toEqual([]);
    }
    // Package-closure GUARD: start from a complete witness package that
    // passes, then apply exactly ONE mutation and require its precise
    // rejection motif — the guard cannot pass for the wrong reason.
    const manifestLanguages = JSON.parse(readFileSync(join(liveRoot, "grammar-manifest.json"), "utf8")).languages as Record<string, { file: string }>;
    const witness: PackageClosureInput = {
      packedPaths: expectedPackedPaths(manifestLanguages),
      packageJson: JSON.parse(readFileSync(join(liveRoot, "package.json"), "utf8")) as Record<string, unknown>,
      lockJson: JSON.parse(readFileSync(join(liveRoot, "package-lock.json"), "utf8")),
      manifestLanguages,
    };
    expect(checkImportClosure([], "package", witness)).toEqual([]);
    const singleMutationRejected = (mutate: (input: PackageClosureInput) => PackageClosureInput, motif: RegExp): void => {
      const violations = checkImportClosure([], "package", mutate(witness));
      expect(
        violations.filter((violation) => motif.test(violation.reason)),
        `the single mutation matching ${motif.toString()} must be rejected for that precise reason (got ${JSON.stringify(violations)})`,
      ).not.toEqual([]);
    };
    singleMutationRejected((w) => ({ ...w, packedPaths: [...w.packedPaths, "dist/driver.mjs"] }), /exact delivered surface/);
    singleMutationRejected((w) => ({ ...w, packedPaths: [...w.packedPaths, "dist/fetch-grammars.py"] }), /Python/);
    singleMutationRejected((w) => ({ ...w, packedPaths: [...w.packedPaths, "node_modules/web-tree-sitter/index.js"] }), /node_modules/);
    singleMutationRejected((w) => ({ ...w, packedPaths: w.packedPaths.filter((path) => path !== "dist/integration.js") }), /missing from the packed closure/);
    singleMutationRejected((w) => ({
      ...w,
      packageJson: {
        ...w.packageJson,
        exports: { ...EXPECTED_EXPORTS, ".": { types: "./dist/index.d.ts", import: "./dist/driver.mjs" } },
      },
    }), /exports map must be exactly/);
    singleMutationRejected((w) => ({
      ...w,
      packageJson: {
        ...w.packageJson,
        scripts: { ...(w.packageJson.scripts as Record<string, unknown>), install: "python setup.py" },
      },
    }), /install lifecycle script/);
    singleMutationRejected((w) => ({
      ...w,
      packageJson: { ...w.packageJson, dependencies: { "better-sqlite3": "^12.0.0" } },
    }), /declares no dependencies/);
    singleMutationRejected((w) => ({
      ...w,
      lockJson: { packages: { "": { name: SELF_PACKAGE }, "node_modules/better-sqlite3": { version: "12.0.0" } } },
    }), /lockfile closure/);
    singleMutationRejected((w) => ({ ...w, packageJson: { ...w.packageJson, engines: { node: ">=20" } } }), /engines must stay bounded/);
    singleMutationRejected((w) => ({ ...w, packageJson: { ...w.packageJson, os: ["linux", "win32"] } }), /os must stay bounded/);
    // Test-closure scan: root src edges and consumers are rejected.
    expect(checkImportClosure([{
      path: "tests/live-package.test.ts",
      content: `import { x } from "../src/cli.js";\nimport { y } from "${consumer}";`,
    }], "test")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "tests/live-package.test.ts",
      content: `import { s } from "@sentropic/engram-live/integration";\nimport { c } from "./live-helper.js";`,
    }, {
      path: "tests/live-helper.ts",
      content: `import { g } from "../engram-live/dist/integration.js";`,
    }], "test")).toEqual([]);
    // A listed neutral test may not import outside the package and the
    // listed closure: an unlisted tests/ file (a root-CLI helper or another
    // tests/live-* test) is rejected even though it sits under tests/.
    expect(checkImportClosure([{
      path: "tests/live-package.test.ts",
      content: `import { f } from "./live-fixtures.js";\nimport { n } from "./live-no-llm.test.js";`,
    }], "test")).not.toEqual([]);
    // The same loader probes apply to the delivered-package scanner
    // (scripts/check-live-package.mjs): its extractLoadEdges must follow the
    // renamed, aliased and destructured bindings on the packed executables
    // too. The import only reads the module (the pack flow is guarded behind
    // a direct-run check).
    const tarballScanner = await import(pathToFileURL(join(root, "scripts", "check-live-package.mjs")).href) as {
      extractLoadEdges: (content: string, scriptKind: number) => { specifiers: string[]; loaderTargets: string[]; unresolved: number; loaderFactoryReferences: number };
    };
    for (const probe of loaderProbes) {
      const edges = tarballScanner.extractLoadEdges(probe.content, ts.ScriptKind.JS);
      expect(
        edges.loaderTargets.includes("node:sqlite"),
        `${probe.name} must be rejected by the tarball scanner: ${JSON.stringify(edges)}`,
      ).toBe(true);
    }
    const scannerEdges = tarballScanner.extractLoadEdges(
      'const nodeCrypto = createRequire(import.meta.url)("node:crypto");',
      ts.ScriptKind.JS,
    );
    expect(scannerEdges.loaderTargets).toEqual(["node:crypto"]);
    expect(scannerEdges.unresolved).toBe(0);
    // The scanner also reports every loader-factory reference so the
    // delivered-tree policy can forbid them outright.
    expect(scannerEdges.loaderFactoryReferences).toBeGreaterThan(0);
  });
});
