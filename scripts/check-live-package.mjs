#!/usr/bin/env node
// L1b package check (plan/09-BRANCH_LIVE_GIT_INDEXING.md; spec/
// SPEC_LIVE_GIT_INDEXING.md §11, A06/A15). Node only — no Python, no
// dependency beyond Node builtins, npm and tar.
//
// Packs @sentropic/engram-live exactly as it would be delivered and proves:
//   1. the packed surface is EXACTLY the allowed set (the three built
//      entries .js/.d.ts/.d.ts.map, one packaged WASM per pinned language,
//      the pinned grammar manifest, package.json) — no Python source, no
//      node_modules, no root src/ file, no engram-memory leakage, nothing
//      extra and nothing missing;
//   2. the packed metadata carries no install lifecycle script, no bin, no
//      dependency of any kind, an exact exports map (. , /contracts,
//      /integration, targets included) and bounded engines/os;
//   3. the lockfile closure contains only @sentropic/engram-live itself;
//   4. every exports target and packaged grammar exists in the tarball, and
//      each extracted grammar WASM hashes to its pinned sha256;
//   5. every executable extracted from the tarball (.js/.mjs/.cjs/.d.ts)
//      passes the AST load-closure scan: no forbidden module, no
//      node_modules reach, no edge outside the delivered tree, no
//      unresolved dynamic import()/require()/createRequire/getBuiltinModule
//      target, and emitted contracts that take zero imports and loaders.
//
// Exit causes: PACK_FAILED, CHECK_FAILED (all violations listed).

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = join(root, "engram-live");
const SELF = "@sentropic/engram-live";
const ROOT_PACKAGE = "@sentropic/engram";
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
const EXPECTED_EXPORTS = {
  ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
  "./contracts": { types: "./dist/contracts.d.ts", import: "./dist/contracts.js" },
  "./integration": { types: "./dist/integration.d.ts", import: "./dist/integration.js" },
};
const EXPECTED_ENGINES = { node: "^20.0.0 || ^22.0.0 || ^24.0.0" };
const EXPECTED_OS = ["linux"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const errors = [];
const note = (message) => errors.push(message);

// ---------------------------------------------------------------------------
// Compact AST load-closure scanner (same class as tests/live-neutrality.test.ts
// and tests/memory-neutrality.test.ts), applied to the EXTRACTED tarball.
// Resolves the repository's typescript devDependency; the delivered package
// itself never depends on it.
// ---------------------------------------------------------------------------
const ts = createRequire(import.meta.url)("typescript");

const LOADER_FACTORY_NAMES = new Set(["createRequire", "getBuiltinModule"]);

function endsWithIdentifierOrProperty(expression, name) {
  if (ts.isIdentifier(expression)) return expression.text === name;
  if (ts.isPropertyAccessExpression(expression)) {
    return ts.isIdentifier(expression.name) && expression.name.text === name;
  }
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
    return expression.argumentExpression.text === name;
  }
  return false;
}

function bindingPropertyName(propertyName) {
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) return propertyName.text;
  return "";
}

function unwrapArgument(argument) {
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
      current = current.expression;
      continue;
    }
    break;
  }
  return current;
}

// Static edges + indirect loader targets (createRequire(...)(x), an alias
// variable holding the factory, process.getBuiltinModule(x)) + unresolved
// dynamic/loader targets, which are rejected outright. The loader binding is
// followed through every rename, alias and destructuring AND through every
// later assignment: a loader however lazily it is built (plain or compound
// assignment, destructuring assignment, the return value of a local
// function, a bound copy, a parenthesized initializer) is tracked like a
// direct loader, mirroring tests/live-neutrality.test.ts.
export function extractLoadEdges(content, scriptKind) {
  const source = ts.createSourceFile("scan.ts", content, ts.ScriptTarget.ESNext, true, scriptKind);
  const specifiers = [];
  const loaderTargets = [];
  let unresolved = 0;
  let loaderFactoryReferences = 0;
  const factoryNames = new Set();
  const builtinNames = new Set();
  const loaderAliases = new Set();
  const loaderReturningFunctions = new Set();
  const isBindCall = (expression) =>
    ts.isCallExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && expression.expression.name.text === "bind";
  const isFactoryReference = (expression) => {
    const unwrapped = unwrapArgument(expression);
    if (!unwrapped) return false;
    if (endsWithIdentifierOrProperty(unwrapped, "createRequire")) return true;
    if (ts.isIdentifier(unwrapped) && factoryNames.has(unwrapped.text)) return true;
    if (isBindCall(unwrapped) && isFactoryReference(unwrapped.expression.expression)) return true;
    return false;
  };
  const isBuiltinReference = (expression) => {
    const unwrapped = unwrapArgument(expression);
    if (!unwrapped) return false;
    return endsWithIdentifierOrProperty(unwrapped, "getBuiltinModule")
      || (ts.isIdentifier(unwrapped) && builtinNames.has(unwrapped.text));
  };
  const isCreateRequireFactoryCall = (expression) =>
    ts.isCallExpression(expression) && isFactoryReference(expression.expression);
  const isGetBuiltinModuleReference = isBuiltinReference;
  // "loader": the expression evaluates to a module loader; "factory": it
  // evaluates to the createRequire factory itself.
  const classifyLoaderValue = (expression) => {
    const unwrapped = unwrapArgument(expression);
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
  const declarations = [];
  const assignments = [];
  const functionLikes = [];
  const collectReturns = (body) => {
    const returns = [];
    const walk = (node) => {
      if (ts.isReturnStatement(node) && node.expression) returns.push(node.expression);
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) return;
      ts.forEachChild(node, walk);
    };
    walk(body);
    return returns;
  };
  const collectDeclarations = (node) => {
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
    const register = (names, name) => {
      if (!names.has(name)) {
        names.add(name);
        changed = true;
      }
    };
    for (const declaration of declarations) {
      if (ts.isObjectBindingPattern(declaration.name)) {
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
        register(loaderAliases, declaration.name.text);
      } else if (kind === "factory") {
        register(factoryNames, declaration.name.text);
      }
    }
    for (const fn of functionLikes) {
      if (!loaderReturningFunctions.has(fn.name)
        && fn.returns.some((value) => classifyLoaderValue(value) === "loader")) {
        register(loaderReturningFunctions, fn.name);
      }
    }
    for (const assignment of assignments) {
      if (ts.isIdentifier(assignment.left)) {
        const kind = classifyLoaderValue(assignment.right);
        if (kind) register(kind === "loader" ? loaderAliases : factoryNames, assignment.left.text);
      } else if (ts.isObjectLiteralExpression(assignment.left) || ts.isArrayLiteralExpression(assignment.left)) {
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
        const walkPattern = (pattern) => {
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
  const pushArgument = (argument) => {
    const unwrapped = unwrapArgument(argument);
    if (unwrapped && ts.isStringLiteralLike(unwrapped)) {
      specifiers.push(unwrapped.text);
      return;
    }
    unresolved += 1;
  };
  const pushLoaderArgument = (argument) => {
    const unwrapped = unwrapArgument(argument);
    if (unwrapped && ts.isStringLiteralLike(unwrapped)) {
      loaderTargets.push(unwrapped.text);
      return;
    }
    unresolved += 1;
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      else unresolved += 1;
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
        else unresolved += 1;
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) pushArgument(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        pushArgument(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        pushArgument(node.arguments[0]);
      } else if (ts.isCallExpression(node.expression) && isCreateRequireFactoryCall(node.expression)) {
        pushLoaderArgument(node.arguments[0]);
      } else if (isGetBuiltinModuleReference(node.expression)) {
        pushLoaderArgument(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && loaderAliases.has(node.expression.text)) {
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
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        specifiers.push(argument.literal.text);
      } else {
        unresolved += 1;
      }
    } else if (ts.isModuleDeclaration(node)) {
      if (ts.isStringLiteralLike(node.name)) specifiers.push(node.name.text);
    }
    // Outright-ban counter: every loader-factory reference, however it is
    // reached, is reported so the delivered-tree policy can forbid
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
    loaderTargets: [...new Set(loaderTargets)],
    unresolved,
    loaderFactoryReferences,
  };
}

function forbiddenBareReason(specifier) {
  if (specifier === "node:sqlite") return "storage-driver handle node:sqlite must not enter the neutral closure";
  if (STORAGE_DRIVERS.has(specifier)) return `storage-driver handle ${specifier} must not enter the neutral closure`;
  if (MODEL_MODULES.has(specifier) || specifier.startsWith("mistral")) {
    return `model dependency ${specifier} must not enter the neutral closure`;
  }
  if (specifier === ROOT_PACKAGE || specifier.startsWith(`${ROOT_PACKAGE}/`)) {
    return `root monolithic CLI package ${specifier} must not enter the neutral closure`;
  }
  if (specifier.startsWith("@sentropic/") && specifier !== SELF && !specifier.startsWith(`${SELF}/`)) {
    return `external consumer package ${specifier} must not enter the neutral closure`;
  }
  if (/^h2a(-|\/|$)/.test(specifier) || /^@sentropic\/h2a/.test(specifier)) {
    return `h2a host dependency ${specifier} must not enter the neutral closure`;
  }
  return undefined;
}

function listExtractedFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listExtractedFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function scriptKindFor(path) {
  if (path.endsWith(".d.ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

// Scans one extracted executable: emitted contracts must take zero imports
// and zero loaders; every other file may import only node: builtins and
// relative edges that resolve inside the delivered tree; any unresolved
// dynamic import/require/loader target is rejected.
function scanExtractedExecutable(pkgDir, packedSet, path) {
  const violations = [];
  const content = readFileSync(join(pkgDir, path), "utf8");
  const edges = extractLoadEdges(content, scriptKindFor(path));
  if (edges.unresolved > 0) {
    violations.push(
      `${path}: unresolved dynamic import/require/loader targets are rejected (use a static string literal)`,
    );
  }
  // No legitimate loader use exists in the delivered tree, so loaders are
  // forbidden outright, not merely target-checked: any createRequire or
  // getBuiltinModule reference is rejected however it is laundered.
  if (edges.loaderFactoryReferences > 0) {
    violations.push(
      `${path}: the neutral closure builds no loader at all: every createRequire/getBuiltinModule reference is forbidden outright (the package has no legitimate loader use)`,
    );
  }
  const isContractsEmitted = path === "dist/contracts.js" || path === "dist/contracts.d.ts";
  const targets = [
    ...edges.specifiers.map((specifier) => ({ specifier, origin: "edge" })),
    ...edges.loaderTargets.map((specifier) => ({ specifier, origin: "indirect loader" })),
  ];
  for (const { specifier, origin } of targets) {
    if (isContractsEmitted) {
      violations.push(
        `${path}: emitted contracts are data-pure and take no imports, no indirect loaders and no load-time side effects (rejected ${origin}: "${specifier}")`,
      );
      continue;
    }
    const forbidden = forbiddenBareReason(specifier);
    if (forbidden) {
      violations.push(`${path}: ${forbidden}${origin === "indirect loader" ? " (loaded through an indirect createRequire/getBuiltinModule loader)" : ""}`);
      continue;
    }
    if (specifier === "module" || specifier === "node:module") {
      violations.push(
        `${path}: ${origin} imports the module-loader builtin ${specifier}: the neutral closure builds no loader (node:module is forbidden)`,
      );
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const resolved = posix.normalize(posix.join(posix.dirname(path), specifier));
      const candidates = [resolved, `${resolved}.js`, `${resolved}.d.ts`];
      if (!candidates.some((candidate) => packedSet.has(candidate))) {
        violations.push(`${path}: ${origin} escapes the delivered tree -> ${specifier} (resolves to ${resolved})`);
      }
      continue;
    }
    violations.push(
      `${path}: ${origin} imports a bare non-builtin module "${specifier}"; the delivered package takes no dependency and loads only node: builtins and in-package relative modules`,
    );
  }
  return violations;
}

// The pack/extract/scan flow runs only when the script is executed directly
// (node scripts/check-live-package.mjs). Importing the module instead exposes
// the AST scanner for the neutrality suite's in-memory tarball mutations,
// with no filesystem side effect.
function runLivePackageCheck() {

  // 0. Preconditions: a build must exist (no silent skip).
  for (const emitted of ["index.js", "contracts.js", "integration.js", "index.d.ts", "contracts.d.ts", "integration.d.ts"]) {
    if (!existsSync(join(liveRoot, "dist", emitted))) {
      note(`build missing: engram-live/dist/${emitted} (run node scripts/build-live.mjs first; no skip)`);
    }
  }
  if (!existsSync(join(liveRoot, "grammar-manifest.json"))) {
    note("engram-live/grammar-manifest.json is missing");
  }
  if (errors.length > 0) {
    console.error(`check-live-package: CHECK_FAILED:\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(join(liveRoot, "grammar-manifest.json"), "utf8"));
  const packageJson = JSON.parse(readFileSync(join(liveRoot, "package.json"), "utf8"));
  const lockJson = JSON.parse(readFileSync(join(liveRoot, "package-lock.json"), "utf8"));

  // The EXACT delivered surface: package.json + the pinned grammar manifest +
  // 9 built dist files + one WASM per pinned language.
  function expectedPackedPaths(manifestLanguages) {
    return [
      "package.json",
      "grammar-manifest.json",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/contracts.js",
      "dist/contracts.d.ts",
      "dist/contracts.d.ts.map",
      "dist/integration.js",
      "dist/integration.d.ts",
      "dist/integration.d.ts.map",
      ...Object.values(manifestLanguages).map((entry) => `dist/grammars/${entry.file}`),
    ].sort();
  }


  // 1. Pack exactly as delivered.
  const tmp = mkdtempSync(join(tmpdir(), "engram-live-check-"));
  let packResult;
  try {
    packResult = spawnSync("npm", ["pack", "--json", "--pack-destination", tmp], {
      cwd: liveRoot,
      encoding: "utf8",
    });
    if (packResult.status !== 0) {
      console.error(`check-live-package: PACK_FAILED:\n${packResult.stdout || ""}${packResult.stderr || ""}`);
      process.exit(1);
    }
    const packed = JSON.parse(packResult.stdout);
    const tarballName = packed[0].filename;
    const packedPaths = packed[0].files.map((file) => file.path);

    // 2. The packed surface is EXACTLY the allowed set: nothing extra, and
    // every expected entry present.
    const expected = expectedPackedPaths(manifest.languages);
    const packedSet = new Set(packedPaths);
    for (const path of packedPaths) {
      if (/\.(py|pyc|pyo|pyd|whl)$/i.test(path)) note(`packed file ships Python: ${path}`);
      if (path.includes("node_modules")) note(`packed file ships node_modules: ${path}`);
      if (path.includes("engram-memory")) note(`packed file ships the engram-memory package: ${path}`);
      if (!expected.includes(path)) note(`packed file is outside the exact delivered surface: ${path}`);
    }
    for (const path of expected) {
      if (!packedSet.has(path)) note(`required packed entry is missing from the exact delivered surface: ${path}`);
    }
    for (const [language, entry] of Object.entries(manifest.languages)) {
      if (typeof entry.sha256 !== "string" || entry.sha256.length !== 64) {
        note(`manifest entry for "${language}" must pin a 64-hex sha256`);
      }
    }

    // 4. Delivered metadata.
    if (packageJson.name !== SELF) note(`package name must be ${SELF}, found ${packageJson.name}`);
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      if (packageJson[field] !== undefined) note(`delivered package must declare no ${field}`);
    }
    if (packageJson.bin !== undefined) note("delivered package must ship no bin (no root CLI)");
    const scripts = packageJson.scripts || {};
    for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
      if (scripts[lifecycle] !== undefined) note(`delivered package must ship no ${lifecycle} script (no Python fallback)`);
    }
    if (JSON.stringify(packageJson.exports) !== JSON.stringify(EXPECTED_EXPORTS)) {
      note(`exports map must be exactly ${JSON.stringify(EXPECTED_EXPORTS)} (targets included, not just subpath names); found ${JSON.stringify(packageJson.exports)}`);
    }
    if (JSON.stringify(packageJson.engines) !== JSON.stringify(EXPECTED_ENGINES)) {
      note(`engines must stay bounded to the qualified runtimes: ${JSON.stringify(EXPECTED_ENGINES)}; found ${JSON.stringify(packageJson.engines)}`);
    }
    if (JSON.stringify(packageJson.os) !== JSON.stringify(EXPECTED_OS)) {
      note(`os must stay bounded to the qualified platform ${JSON.stringify(EXPECTED_OS)}; unverified combinations are not advertised; found ${JSON.stringify(packageJson.os)}`);
    }

    // 5. Lockfile closure: only the package itself.
    const lockNames = Object.entries(lockJson.packages || {}).map(([key, entry]) => {
      if (key === "") return entry && entry.name ? entry.name : SELF;
      return entry && entry.name ? entry.name : key.replace(/^node_modules\//, "");
    });
    for (const name of lockNames) {
      if (name !== SELF) note(`lockfile closure contains a transitive dependency: ${name}`);
    }

    // 6. Extract the tarball: exports targets, grammar digests, and the AST
    // scan of every executable actually delivered.
    const extractDir = join(tmp, "extract");
    mkdirSync(extractDir, { recursive: true });
    const tar = spawnSync("tar", ["-xf", join(tmp, tarballName), "-C", extractDir], { encoding: "utf8" });
    if (tar.status !== 0) {
      note(`tarball extraction failed: ${tar.stderr || tar.stdout}`);
    } else {
      const pkgDir = join(extractDir, "package");
      const extractedPaths = listExtractedFiles(pkgDir);
      const extractedSet = new Set(extractedPaths);
      // The extracted tree is the packed tree: no file slipped in or out.
      const sortedExtracted = extractedPaths.slice().sort();
      const sortedPacked = packedPaths.slice().sort();
      if (JSON.stringify(sortedExtracted) !== JSON.stringify(sortedPacked)) {
        note(`extracted tarball differs from the packed file list: extracted ${JSON.stringify(sortedExtracted)} vs packed ${JSON.stringify(sortedPacked)}`);
      }
      // Exports targets exist in the delivered tarball itself.
      for (const [subpath, target] of Object.entries(packageJson.exports || {})) {
        for (const field of ["types", "import"]) {
          const file = (target || {})[field];
          const rel = typeof file === "string" ? file.replace(/^\.\//, "") : undefined;
          if (typeof rel !== "string" || !extractedSet.has(rel)) {
            note(`exports "${subpath}" ${field} target is missing from the delivered tarball: ${file}`);
          }
        }
      }
      // Byte-true digest verification of every packaged grammar.
      for (const [language, entry] of Object.entries(manifest.languages)) {
        const rel = `dist/grammars/${entry.file}`;
        const extractedPath = join(pkgDir, rel);
        if (!extractedSet.has(rel)) {
          note(`tarball is missing the packaged grammar for "${language}": ${rel}`);
          continue;
        }
        const digest = sha256(readFileSync(extractedPath));
        if (digest !== entry.sha256) {
          note(`packed grammar for "${language}" hashes to ${digest}, manifest pins ${entry.sha256}`);
        }
      }
      // AST load-closure scan of every executable in the tarball.
      const executables = extractedPaths.filter((path) => /\.(js|mjs|cjs|d\.ts)$/.test(path));
      for (const path of executables) {
        for (const violation of scanExtractedExecutable(pkgDir, extractedSet, path)) note(violation);
      }
    }

    if (errors.length > 0) {
      console.error(`check-live-package: CHECK_FAILED:\n  - ${errors.join("\n  - ")}`);
      process.exit(1);
    }
    console.log(
      `check-live-package: PASS — ${tarballName} packs exactly ${packedPaths.length} files, ` +
      `${Object.keys(manifest.languages).length} pinned grammars digest-verified, every extracted executable AST-scanned clean, no install script, no dependency, no Python`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  runLivePackageCheck();
}
