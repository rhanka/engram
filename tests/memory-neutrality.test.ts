import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const memoryRoot = join(root, "engram-memory");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
// Test-local scanner backend: the "typescript" package, a root devDependency
// (see devDependencies in package.json). Loaded through createRequire; type
// positions use import("typescript") so no value-level "typescript" edge is
// added (a type-level edge would stay allowed via TEST_ALLOWED_BARE anyway).
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

function emittedDeclaration(source: string): string {
  const output = mkdtempSync(join(tmpdir(), "memory-contract-declaration-"));
  try {
    execFileSync(process.execPath, [
      tsc,
      "--ignoreConfig",
      source,
      "--declaration",
      "--emitDeclarationOnly",
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--skipLibCheck",
      "--outDir", output,
    ], { cwd: root, stdio: "pipe" });
    return readFileSync(join(output, basename(source).replace(/\.ts$/, ".d.ts")), "utf8");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

// F5 (FIN §3.1.3 T0.1): pure import-closure scanner over (path, content)
// pairs. Test-local by design — no new source module. Paths are
// repository-relative posix paths (engram-memory/..., tests/..., docs/...).
interface ScannedFile {
  path: string;
  content: string;
}

interface ClosureViolation {
  path: string;
  specifier: string;
  reason: string;
}

type EdgeSet = "source" | "generated" | "test" | "doc";

// Declared drivers (FIN §3.1.1 R0.2): better-sqlite3 and fs-ext are isolated
// to sqlite.ts (and its ambient shim sqlite-native.d.ts); pg to postgres.ts
// (and pg.d.ts).
const SQLITE_DRIVER_SPECIFIERS = new Set(["better-sqlite3", "fs-ext"]);
const POSTGRES_DRIVER_SPECIFIERS = new Set(["pg"]);
const DECLARED_DRIVER_SPECIFIERS = new Set([...SQLITE_DRIVER_SPECIFIERS, ...POSTGRES_DRIVER_SPECIFIERS]);

// Exact public subpaths (T0.1c/d, T0.2): derived from the exports map of
// engram-memory/package.json — "." becomes "engram-memory", "./sqlite"
// becomes "engram-memory/sqlite". No suffix stripping: "engram-memory/sqlite.js"
// is NOT an exported subpath and is rejected.
function publicImportSubpaths(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(memoryRoot, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  if (!pkg.exports || typeof pkg.exports !== "object") {
    throw new Error("engram-memory/package.json must declare an exports map (exact public subpaths).");
  }
  const out = new Set<string>();
  for (const key of Object.keys(pkg.exports)) {
    out.add(key === "." ? "engram-memory" : `engram-memory/${key.replace(/^\.\//, "")}`);
  }
  return out;
}
const PUBLIC_SUBPATHS = publicImportSubpaths();

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveRepoRelative(fromPath: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(fromPath), specifier));
}

function isInsidePackage(resolved: string): boolean {
  return resolved === "engram-memory" || resolved.startsWith("engram-memory/");
}

// Fence delimiters, built — never typed: no literal triple-backtick or
// triple-tilde run appears in this file, so fixture fences cannot confuse any
// present or future line-oriented reader of this source.
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;
const TILDE = String.fromCharCode(126);

// Collects every syntactic module edge with the TypeScript AST: static
// import, export-from, import type, side-effect import, dynamic import()
// (including backtick literals without substitution and calls carrying import
// options such as { with: ... }), type-level import(), CommonJS require()
// and import-equals require, plus ambient declare-module names. Only
// syntactic positions count: an ordinary string — even one reading
// "from 'x'" or "import('x')" — yields no edge, regex literals cannot mask a
// following edge, template interpolations are walked, and escapes are decoded
// through .text. A dynamic target that is not statically resolvable (a
// variable, a template with substitutions) is counted in unresolvedDynamic
// and rejected explicitly by every check* function below.
interface ExtractedEdges {
  specifiers: string[];
  unresolvedDynamic: number;
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

function extractEdges(content: string): ExtractedEdges {
  const source = ts.createSourceFile("scan.ts", content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const specifiers: string[] = [];
  let unresolvedDynamic = 0;
  const pushArgument = (argument: import("typescript").Expression | undefined): void => {
    const unwrapped = unwrapImportArgument(argument);
    if (!unwrapped) return;
    if (ts.isStringLiteralLike(unwrapped)) specifiers.push(unwrapped.text);
    else unresolvedDynamic += 1;
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
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { specifiers: [...new Set(specifiers)], unresolvedDynamic };
}

function dynamicViolations(path: string, edges: ExtractedEdges): ClosureViolation[] {
  return edges.unresolvedDynamic > 0
    ? [{
      path,
      specifier: "(dynamic target)",
      reason: "unresolved dynamic import/require targets are rejected: use a static string literal",
    }]
    : [];
}

// Effective installed package for any path traversing node_modules/:
// the package after the LAST node_modules/ segment (scoped names keep
// scope/name), or undefined when the path never traverses node_modules/.
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

function sourceInstalledViolation(path: string, specifier: string, effective: string): ClosureViolation | undefined {
  if (SQLITE_DRIVER_SPECIFIERS.has(effective)) {
    if (path !== "engram-memory/sqlite.ts" && path !== "engram-memory/sqlite-native.d.ts") {
      return { path, specifier, reason: `${effective} is isolated to sqlite.ts and sqlite-native.d.ts` };
    }
    return undefined;
  }
  if (POSTGRES_DRIVER_SPECIFIERS.has(effective)) {
    if (path !== "engram-memory/postgres.ts" && path !== "engram-memory/pg.d.ts") {
      return { path, specifier, reason: `${effective} is isolated to postgres.ts and pg.d.ts` };
    }
    return undefined;
  }
  return { path, specifier, reason: `source edge reaches installed dependency "${effective}" under node_modules: only declared drivers are allowed` };
}

function checkSourceFile(file: ScannedFile): ClosureViolation[] {
  const edges = extractEdges(file.content);
  const violations: ClosureViolation[] = [...dynamicViolations(file.path, edges)];
  const isContracts = file.path === "engram-memory/contracts/index.ts";
  for (const specifier of edges.specifiers) {
    if (isContracts) {
      violations.push({ path: file.path, specifier, reason: "engram-memory/contracts is data-only and takes no imports" });
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveRepoRelative(file.path, specifier);
      const effective = effectiveInstalledPackage(resolved);
      if (effective !== undefined) {
        const violation = sourceInstalledViolation(file.path, specifier, effective);
        if (violation) violations.push(violation);
        continue;
      }
      if (!isInsidePackage(resolved)) {
        violations.push({ path: file.path, specifier, reason: `source edge escapes engram-memory/ -> ${resolved}` });
      }
      continue;
    }
    {
      const effective = effectiveInstalledPackage(specifier);
      if (effective !== undefined) {
        const violation = sourceInstalledViolation(file.path, specifier, effective);
        if (violation) violations.push(violation);
        continue;
      }
    }
    if (SQLITE_DRIVER_SPECIFIERS.has(specifier)) {
      if (file.path !== "engram-memory/sqlite.ts" && file.path !== "engram-memory/sqlite-native.d.ts") {
        violations.push({ path: file.path, specifier, reason: `${specifier} is isolated to sqlite.ts and sqlite-native.d.ts` });
      }
      continue;
    }
    if (POSTGRES_DRIVER_SPECIFIERS.has(specifier)) {
      if (file.path !== "engram-memory/postgres.ts" && file.path !== "engram-memory/pg.d.ts") {
        violations.push({ path: file.path, specifier, reason: `${specifier} is isolated to postgres.ts and pg.d.ts` });
      }
      continue;
    }
    violations.push({ path: file.path, specifier, reason: "source edges resolve to a relative engram-memory module, a node: builtin, or a declared driver" });
  }
  return violations;
}

function checkGeneratedFile(file: ScannedFile): ClosureViolation[] {
  const edges = extractEdges(file.content);
  const violations: ClosureViolation[] = [...dynamicViolations(file.path, edges)];
  const isContractsEmitted = file.path.includes("contracts/");
  const allowSqlite = file.path === "engram-memory/dist/sqlite.js" || file.path === "engram-memory/dist/sqlite.d.ts";
  const allowPostgres = file.path === "engram-memory/dist/postgres.js" || file.path === "engram-memory/dist/postgres.d.ts";
  for (const specifier of edges.specifiers) {
    if (isContractsEmitted) {
      violations.push({ path: file.path, specifier, reason: "emitted contracts take no imports" });
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveRepoRelative(file.path, specifier);
      const effective = effectiveInstalledPackage(resolved);
      if (effective !== undefined) {
        const allowed = (SQLITE_DRIVER_SPECIFIERS.has(effective) && allowSqlite)
          || (POSTGRES_DRIVER_SPECIFIERS.has(effective) && allowPostgres);
        if (!allowed) {
          violations.push({ path: file.path, specifier, reason: `generated-code edge reaches installed dependency "${effective}" under node_modules: only the owning adapter driver is allowed` });
        }
        continue;
      }
      const insideEmitted = resolved.startsWith("engram-memory/dist/") || resolved.startsWith("engram-memory/contracts/dist/");
      if (!insideEmitted) {
        violations.push({ path: file.path, specifier, reason: `generated-code edge escapes the emitted tree -> ${resolved}` });
      }
      continue;
    }
    {
      const effective = effectiveInstalledPackage(specifier);
      if (effective !== undefined) {
        const allowed = (SQLITE_DRIVER_SPECIFIERS.has(effective) && allowSqlite)
          || (POSTGRES_DRIVER_SPECIFIERS.has(effective) && allowPostgres);
        if (!allowed) {
          violations.push({ path: file.path, specifier, reason: `generated-code edge reaches installed dependency "${effective}" under node_modules: only the owning adapter driver is allowed` });
        }
        continue;
      }
    }
    if (SQLITE_DRIVER_SPECIFIERS.has(specifier) && allowSqlite) continue;
    if (POSTGRES_DRIVER_SPECIFIERS.has(specifier) && allowPostgres) continue;
    violations.push({ path: file.path, specifier, reason: "generated-code edges resolve inside the emitted tree, to a node: builtin, or to the owning adapter driver" });
  }
  return violations;
}

function closureHas(closurePaths: Set<string>, resolved: string): boolean {
  if (closurePaths.has(resolved) || closurePaths.has(`${resolved}.ts`)) return true;
  return resolved.endsWith(".js") && closurePaths.has(`${resolved.slice(0, -3)}.ts`);
}

// Bare specifiers a test file may carry: the runner, the test-local scanner
// backend itself ("typescript", a root devDependency — loaded through
// createRequire, and explicitly allowed here for direct AST use), and the
// declared adapter drivers.
const TEST_ALLOWED_BARE = new Set(["vitest", "typescript", ...DECLARED_DRIVER_SPECIFIERS]);

// X2b integration exception: `tests/memory-projection-cascade.postgres.test.ts` intentionally
// wires the neutral engine to the delivered host-owned adapters — the product under test is
// the engine driving the real FileGraphStore and the real Postgres vectors. The crossing is
// the requirement, so exactly these two host-bridge edges from exactly that file are allowed.
// Every other src/** edge from the closure stays forbidden (see the self-tests below).
// MCP-L1 deliberately tests the product read facade over the neutral engine;
// permit that one integration edge, never a product import by engram-memory.
const TEST_ALLOWED_HOST_EDGES = new Set([
  "tests/memory-projection-cascade.postgres.test.ts -> src/storage/memory-projection",
  "tests/memory-projection-cascade.postgres.test.ts -> src/storage/vector/postgres-exact",
  "tests/memory-mcp-l1-reads.test.ts -> src/memory-tools/reads",
  // Substrate acceptance (0.21.0) consumes the public memory-substrate entry over the neutral
  // engine: the product under test is the entry driving the reference port. Entry only, never internals.
  "tests/memory-substrate.test.ts -> src/memory-substrate/index",
  "tests/memory-substrate-closure.test.ts -> src/memory-substrate/index",
  // MCP-L2 recovery explicitly integrates the neutral SQLite engine with
  // the delivered host reservation ports and write facade.
  "tests/memory-mcp-l2-recovery-fixture.ts -> src/mcp/memory/reference-ports",
  "tests/memory-mcp-l2-recovery-fixture.ts -> src/memory-tools/writes",
]);

function hostEdgeKey(path: string, resolved: string): string {
  const module = resolved.endsWith(".js") || resolved.endsWith(".ts") ? resolved.slice(0, -3) : resolved;
  return `${path} -> ${module}`;
}

function checkTestFile(file: ScannedFile, closurePaths: Set<string>): ClosureViolation[] {
  const edges = extractEdges(file.content);
  const violations: ClosureViolation[] = [...dynamicViolations(file.path, edges)];
  for (const specifier of edges.specifiers) {
    if (specifier.startsWith("node:")) continue;
    if (TEST_ALLOWED_BARE.has(specifier)) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveRepoRelative(file.path, specifier);
      const effective = effectiveInstalledPackage(resolved);
      if (effective !== undefined) {
        if (!DECLARED_DRIVER_SPECIFIERS.has(effective)) {
          violations.push({ path: file.path, specifier, reason: `test-closure edge reaches installed dependency "${effective}" under node_modules: only declared drivers are allowed` });
        }
        continue;
      }
      if (isInsidePackage(resolved) || closureHas(closurePaths, resolved)) continue;
      if (TEST_ALLOWED_HOST_EDGES.has(hostEdgeKey(file.path, resolved))) continue;
      violations.push({ path: file.path, specifier, reason: `test-closure edge leaves the closure -> ${resolved}` });
      continue;
    }
    {
      const effective = effectiveInstalledPackage(specifier);
      if (effective !== undefined) {
        if (!DECLARED_DRIVER_SPECIFIERS.has(effective)) {
          violations.push({ path: file.path, specifier, reason: `test-closure edge reaches installed dependency "${effective}" under node_modules: only declared drivers are allowed` });
        }
        continue;
      }
    }
    // Bare memory imports must name an exact exported subpath: "engram-memory"
    // and "engram-memory/sqlite" pass, "engram-memory/sqlite.js" does not.
    if (PUBLIC_SUBPATHS.has(specifier)) continue;
    violations.push({ path: file.path, specifier, reason: "test-closure edges import only exact engram-memory subpaths, node: builtins, vitest, typescript, declared drivers, or in-closure files" });
  }
  return violations;
}

function checkDocFile(file: ScannedFile): ClosureViolation[] {
  const violations: ClosureViolation[] = [];
  extractFencedBlocks(file.content).forEach((block, index) => {
    const edges = extractEdges(block);
    if (!edges.specifiers.some((specifier) => specifier.includes("engram-memory"))) return;
    violations.push(...dynamicViolations(`${file.path}#block${index}`, edges));
    for (const specifier of edges.specifiers) {
      if (!specifier.includes("engram-memory")) continue;
      if (!PUBLIC_SUBPATHS.has(specifier)) {
        violations.push({
          path: `${file.path}#block${index}`,
          specifier,
          reason: "documentation examples import engram-memory only through an exact exported subpath (., /contracts, /integration, /sqlite, /postgres)",
        });
      }
    }
  });
  return violations;
}

function checkImportClosure(files: ScannedFile[], kind: EdgeSet, closurePaths?: Set<string>): ClosureViolation[] {
  switch (kind) {
    case "source":
      return files.flatMap(checkSourceFile);
    case "generated":
      return files.flatMap(checkGeneratedFile);
    case "test": {
      const paths = closurePaths ?? new Set(files.map((file) => file.path));
      return files.flatMap((file) => checkTestFile(file, paths));
    }
    case "doc":
      return files.flatMap(checkDocFile);
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

// T0.1a — sources: every engram-memory .ts except node_modules/ and any
// emitted dist/ tree (engram-memory/dist/ and engram-memory/contracts/dist/:
// ".d.ts" ends with ".ts", so the suffix match alone would retain them).
function sourceFiles(): ScannedFile[] {
  return listScannedFiles("engram-memory", [".ts"])
    .filter((file) => !file.path.includes("/dist/"));
}

// T0.1b — generated code: the emitted .js/.d.ts trees. A missing build
// fails with an explicit message; it never skips.
function generatedFiles(): ScannedFile[] {
  const files = listScannedFiles("engram-memory/dist", [".js", ".d.ts"])
    .concat(listScannedFiles("engram-memory/contracts/dist", [".d.ts"]));
  if (!files.some((file) => file.path === "engram-memory/dist/index.js")) {
    throw new Error(
      "engram-memory build missing: run `npm --prefix engram-memory run build` before this test (no skip).",
    );
  }
  return files;
}

// T0.1c — tests and fixtures: every tests/**/*.ts file whose specifiers
// import engram-memory, plus the local modules it reaches through relative
// imports (fixtures and helpers such as memory-l3-fixture.ts).
function testClosureFiles(): ScannedFile[] {
  const allTests = listScannedFiles("tests", [".ts"]);
  const byPath = new Map(allTests.map((file) => [file.path, file]));
  const closure = new Map<string, ScannedFile>();
  const queue: ScannedFile[] = [];
  for (const file of allTests) {
    if (extractEdges(file.content).specifiers.some((specifier) => specifier.includes("engram-memory"))) {
      closure.set(file.path, file);
      queue.push(file);
    }
  }
  while (queue.length > 0) {
    const current = queue.pop() as ScannedFile;
    for (const specifier of extractEdges(current.content).specifiers) {
      if (!isRelativeSpecifier(specifier)) continue;
      const resolved = resolveRepoRelative(current.path, specifier);
      const candidates = [resolved, `${resolved}.ts`];
      if (resolved.endsWith(".js")) candidates.push(`${resolved.slice(0, -3)}.ts`);
      for (const candidate of candidates) {
        const next = byPath.get(candidate);
        if (next && !closure.has(candidate)) {
          closure.set(candidate, next);
          queue.push(next);
        }
      }
    }
  }
  return [...closure.values()];
}

// One fence run on a line: up to 3 leading spaces, then 3+ backticks or 3+
// tildes. Returns the fence character, its length, and the rest of the line.
function fenceRun(line: string): { char: string; length: number; rest: string } | undefined {
  let i = 0;
  while (i < line.length && line[i] === " ") i++;
  if (i > 3) return undefined;
  const char = line[i];
  if (char !== BT && char !== TILDE) return undefined;
  let j = i;
  while (j < line.length && line[j] === char) j++;
  if (j - i < 3) return undefined;
  return { char, length: j - i, rest: line.slice(j) };
}

// Strips CommonMark container prefixes (block quotes ">", unordered "-"/"+"/"*",
// ordered "1."/"1)") before fence detection, including nestings such as
// "> -" or "- >". Thematic breaks ("---", "***") are not containers: the
// marker must be followed by spaces/tabs or the end of the line.
function stripMarkdownContainers(line: string): string {
  let current = line;
  for (let guard = 0; guard < 10; guard++) {
    let match = current.match(/^ {0,3}> ?/);
    if (match) {
      current = current.slice(match[0].length);
      continue;
    }
    match = current.match(/^ {0,3}[-+*](?:[ \t]+|$)/);
    if (match) {
      current = current.slice(match[0].length);
      continue;
    }
    match = current.match(/^ {0,3}\d{1,9}[.)](?:[ \t]+|$)/);
    if (match) {
      current = current.slice(match[0].length);
      continue;
    }
    break;
  }
  return current;
}

// CommonMark fenced code blocks: backtick OR tilde fences, up to 3 spaces of
// indentation, a closing fence of the same character at least as long as the
// opening one followed only by whitespace. A backtick opening whose info
// string contains a backtick is not a fence. Container prefixes are stripped
// first, so fences inside quotes and lists are discovered. An unclosed fence
// runs to the end of the document.
function extractFencedBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const open = fenceRun(stripMarkdownContainers(lines[i] ?? ""));
    if (!open || (open.char === BT && open.rest.includes(BT))) { i++; continue; }
    const content: string[] = [];
    i++;
    while (i < lines.length) {
      const stripped = stripMarkdownContainers(lines[i] ?? "");
      const close = fenceRun(stripped);
      if (close && close.char === open.char && close.length >= open.length && close.rest.trim() === "") {
        i++;
        break;
      }
      content.push(stripped);
      i++;
    }
    blocks.push(content.join("\n"));
  }
  return blocks;
}

// Technical directories excluded from the no-git documentation fallback:
// installed trees, version control, build outputs and coverage reports.
// Everything else — root files, _extracted, docs, spec, plan, studio — is
// covered, so the fallback is a superset of the tracked Markdown set.
const FALLBACK_EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".nyc_output"]);

function fallbackKeepsPath(relPath: string): boolean {
  if (!relPath.endsWith(".md")) return false;
  return !relPath.split("/").some((segment) => FALLBACK_EXCLUDED_DIRS.has(segment));
}

function fallbackMarkdownPaths(): string[] {
  const out: string[] = [];
  const walk = (relDir: string): void => {
    const absolute = join(root, ...relDir.split("/").filter((part) => part.length > 0));
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const rel = relDir.length > 0 ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!FALLBACK_EXCLUDED_DIRS.has(entry.name)) walk(rel);
      } else if (entry.isFile() && fallbackKeepsPath(rel)) {
        if (statSync(join(root, ...rel.split("/"))).size > 0) out.push(rel);
      }
    }
  };
  walk("");
  return out;
}

// T0.1d — documentation examples: fenced code blocks of tracked Markdown
// files that import engram-memory. The "*.md" pathspec matches at any depth,
// so subdirectories (docs/, spec/, _extracted, ...) are covered. Outside a
// git worktree (exported tarball, minimal container) the git call fails:
// fall back to a root walk with explicit technical exclusions, a fail-closed
// superset of the tracked set.
function docExampleFiles(): ScannedFile[] {
  let tracked: string[];
  try {
    tracked = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
      .split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    tracked = fallbackMarkdownPaths();
  }
  return tracked
    .map((path) => ({ path, content: readFileSync(join(root, path), "utf8") }))
    .filter((file) => extractFencedBlocks(file.content)
      .some((block) => extractEdges(block).specifiers.some((specifier) => specifier.includes("engram-memory"))));
}

function packedMemoryPaths(): string[] {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: memoryRoot, encoding: "utf8" });
  const parsed = JSON.parse(raw) as [{ files: { path: string }[] }];
  return parsed[0].files.map((file) => file.path);
}

// T0.2: the lockfile half of the packed closure is its EFFECTIVE package
// names — the entry "name" field when present (npm aliases install a package
// under a different directory), otherwise the install path. A missing or
// misshapen "packages" record is refused explicitly: no silent ?? {}.
function effectiveLockfileNames(lock: unknown): string[] {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    throw new Error("engram-memory/package-lock.json must parse to an object carrying a packages record.");
  }
  const packages = (lock as { packages?: unknown }).packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    throw new Error("engram-memory/package-lock.json must contain a packages record (no silent fallback).");
  }
  return Object.entries(packages as Record<string, { name?: unknown }>).map(([key, entry]) => {
    if (key === "") return "engram-memory";
    const effective = entry !== null && typeof entry === "object"
      ? (entry as { name?: unknown }).name
      : undefined;
    if (typeof effective === "string" && effective.length > 0) return effective;
    return key.replace(/^node_modules\//, "");
  });
}

// node_modules contents are no longer scanned as text.
function lockfilePackageNames(): string[] {
  return effectiveLockfileNames(JSON.parse(readFileSync(join(memoryRoot, "package-lock.json"), "utf8")));
}

describe("memory neutrality", () => {
  it("the import-closure scanner rejects a forbidden edge in each scanned set: source, generated code, test closure, documentation example", () => {
    const consumer = "@sen" + "tropic/graph";
    // Source set: an organization-scoped edge is forbidden.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `import { x } from "${consumer}";`,
    }], "source")).not.toEqual([]);
    // Source set: a driver outside its isolated module is forbidden.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `const native = await import("better-sqlite3");`,
    }], "source")).not.toEqual([]);
    // Source set: CommonJS require edges are detected too.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `const g = require("${consumer}");`,
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `import g = require("${consumer}");`,
    }], "source")).not.toEqual([]);
    // A "//" inside a regular string (URL) is not a comment and must not
    // hide a forbidden edge later on the same line.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `const u = "http://example.com"; import { x } from "${consumer}";`,
    }], "source")).not.toEqual([]);
    // Source set: the data-only contracts package takes no imports.
    expect(checkImportClosure([{
      path: "engram-memory/contracts/index.ts",
      content: `import { x } from "../digests.js";`,
    }], "source")).not.toEqual([]);
    // Source set legal control: relative, node: and type-level edges pass.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `import { x } from "./store-factory.js";\nimport { createHash } from "node:crypto";\nimport type { Y } from "./contracts/index.js";\ntype Z = import("./contracts/index.js").Digest;`,
    }], "source")).toEqual([]);
    // Generated-code set: an edge escaping the emitted tree is forbidden.
    expect(checkImportClosure([{
      path: "engram-memory/dist/engine.js",
      content: `import { x } from "../src/consumer.js";`,
    }], "generated")).not.toEqual([]);
    // Generated-code set legal control.
    expect(checkImportClosure([{
      path: "engram-memory/dist/engine.js",
      content: `import { x } from "./store-factory.js";`,
    }], "generated")).toEqual([]);
    // Test-closure set: src/** and organization-scoped edges are forbidden.
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: `import { x } from "../engram-memory/index.js";\nimport { y } from "../src/consumer.js";`,
    }], "test")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: `import { x } from "../engram-memory/index.js";\nimport { y } from "${consumer}";`,
    }], "test")).not.toEqual([]);
    // Test-closure set legal control: engram-memory, node:, vitest,
    // declared drivers and in-closure relative edges pass.
    expect(checkImportClosure([
      {
        path: "tests/memory-capture.test.ts",
        content: `import { describe } from "vitest";\nimport { x } from "../engram-memory/index.js";\nimport { y } from "./memory-l3-fixture.js";\nimport { createHash } from "node:crypto";`,
      },
      {
        path: "tests/memory-l3-fixture.ts",
        content: `import { z } from "../engram-memory/store-factory.js";`,
      },
    ], "test")).toEqual([]);
    // Documentation-example set: only exported subpaths pass.
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\nimport { x } from "engram-memory/engine.js";\n${FENCE}\n`,
    }], "doc")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\nimport { x } from "engram-memory/sqlite";\n${FENCE}\n`,
    }], "doc")).toEqual([]);
  });

  it("SOL61-1: the AST scanner catches real edges the lexer missed and takes none from ordinary strings", () => {
    const consumer = "@sen" + "tropic/graph";
    // Backtick literal without substitution is a static edge.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "void import(`typescript`);",
    }], "source")).not.toEqual([]);
    // Import inside a template interpolation is walked, not erased.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "const s = `${await import(\"" + consumer + "\")}`;",
    }], "source")).not.toEqual([]);
    // Variable targets are rejected explicitly, not skipped.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "export async function load(name: string) { return import(name); }",
    }], "source")).not.toEqual([]);
    // Templates with substitutions are unresolved dynamics, not edges.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "export async function load(lang: string) { return import(`./locales/${lang}.js`); }",
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "const m = require(target);",
    }], "source")).not.toEqual([]);
    // Import options ("with") do not hide the first argument.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "const m = await import(\"outside\", { with: { type: \"json\" } });",
    }], "source")).not.toEqual([]);
    // A regex literal on the same line masks nothing.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "const re = /[//]/; import { x } from \"" + consumer + "\";",
    }], "source")).not.toEqual([]);
    // Escapes are decoded through the AST literal text.
    expect(extractEdges("import { x } from \"a\\u0062c\";").specifiers).toEqual(["abc"]);
    // Export-from and type-level import() are edges too.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "export { x } from \"" + consumer + "\";",
    }], "source")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "type T = import(\"" + consumer + "\");",
    }], "source")).not.toEqual([]);
    // Ordinary strings yield no edge, even when they read like imports.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "const s = \"from 'external-example'\";",
    }], "source")).toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: "const s = \"import('external-example')\";",
    }], "source")).toEqual([]);
  });

  it("SOL61-2: installed trees allow only declared drivers, exact public subpaths pass", () => {
    // A scoped package smuggled under engram-memory/node_modules/ is rejected.
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: "import x from \"../engram-memory/node_modules/@sentropic/graph/dist/index.js\";",
    }], "test")).not.toEqual([]);
    // Any ordinary installed package is rejected as well.
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: "import x from \"../engram-memory/node_modules/lodash/index.js\";",
    }], "test")).not.toEqual([]);
    // A declared driver reached through node_modules stays allowed.
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: "import x from \"../engram-memory/node_modules/pg/lib/index.js\";",
    }], "test")).toEqual([]);
    // Exact exported subpaths pass: "engram-memory" and "engram-memory/sqlite".
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: "import x from \"engram-memory\";",
    }], "test")).toEqual([]);
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: "import x from \"engram-memory/sqlite\";",
    }], "test")).toEqual([]);
    // A non-exported subpath spelling is rejected.
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: "import x from \"engram-memory/sqlite.js\";",
    }], "test")).not.toEqual([]);
  });

  it("SOL61-3: the lockfile control reads effective names and refuses a missing structure", () => {
    // An alias installs the target under a neutral directory: the entry
    // "name" field is the effective name under control.
    expect(effectiveLockfileNames({
      packages: {
        "": { name: "engram-memory", version: "0.0.0" },
        "node_modules/neutral-alias": { name: "@sen" + "tropic/graph", version: "1.0.0" },
      },
    })).toContain("@sen" + "tropic/graph");
    // Ordinary entries still resolve through their install path.
    expect(effectiveLockfileNames({
      packages: { "": { name: "engram-memory" }, "node_modules/pg": { version: "8.23.0" } },
    })).toContain("pg");
    // An absent or misshapen structure throws instead of passing silently.
    expect(() => effectiveLockfileNames({})).toThrow();
    expect(() => effectiveLockfileNames({ packages: null })).toThrow();
    expect(() => effectiveLockfileNames(null)).toThrow();
  });

  it("SOL61-4: CommonMark fences use backticks or tildes, indentation and length", () => {
    const T3 = TILDE.repeat(3);
    const engineDoc = "import { x } from \"engram-memory/engine\";";
    // Tilde fences are code fences.
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${T3}ts\n${engineDoc}\n${T3}\n`,
    }], "doc")).not.toEqual([]);
    // Up to 3 spaces of indentation still open a fence.
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `  ${T3}ts\n${engineDoc}\n  ${T3}\n`,
    }], "doc")).not.toEqual([]);
    // A closing fence shorter than the opening one does not close: the
    // import stays inside the block. Tildes carry the length rule here, so
    // the block stays re-parseable (a stray backtick run would open a
    // template literal in the re-parsed block and swallow the import).
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${TILDE.repeat(5)}ts\nconst ok = 1;\n${T3}\n${engineDoc}\n${TILDE.repeat(5)}\n`,
    }], "doc")).not.toEqual([]);
    // An unclosed fence runs to the end of the document.
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\n${engineDoc}\n`,
    }], "doc")).not.toEqual([]);
  });

  it("SOL61-5: documentation subpaths are exact and future valid examples pass", () => {
    // "engram-memory/sqlite.js" is not an exported subpath: rejected.
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\nimport { x } from "engram-memory/sqlite.js";\n${FENCE}\n`,
    }], "doc")).not.toEqual([]);
    // A future valid example using an exact subpath must keep passing.
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\nimport { x } from "engram-memory";\n${FENCE}\n`,
    }], "doc")).toEqual([]);
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\nimport { x } from "engram-memory/contracts";\n${FENCE}\n`,
    }], "doc")).toEqual([]);
  });

  it("SOL61-6: the staging module is absent, engram code carries no h2a coupling, and the no-git fallback keeps its exclusions", () => {
    // F12 (BR08-EX-F12): the h2a staging module has relocated out of this
    // repository — the fallback coverage pin becomes an absence pin.
    expect(existsSync(join(root, "_extracted", "agent-stats-h2a-module"))).toBe(false);
    expect(existsSync(join(root, "_extracted", "agent-stats-h2a-module", "README.md"))).toBe(false);
    // The neutrality the pin protected stays verified over the real tree:
    // no h2a coupling in engram-memory sources, by text and by import edge.
    const staging = "h2" + "a";
    const coupled = sourceFiles()
      .filter((file) => file.content.includes(staging))
      .map((file) => file.path);
    expect(coupled, "engram-memory sources must carry no h2a coupling").toEqual([]);
    expect(checkImportClosure(sourceFiles(), "source")).toEqual([]);
    expect(fallbackKeepsPath("README.md")).toBe(true);
    expect(fallbackKeepsPath("_extracted/notes.md")).toBe(true);
    expect(fallbackKeepsPath("docs/guide.md")).toBe(true);
    expect(fallbackKeepsPath("node_modules/pkg/README.md")).toBe(false);
    expect(fallbackKeepsPath(".git/notes.md")).toBe(false);
    expect(fallbackKeepsPath("engram-memory/dist/notes.md")).toBe(false);
    expect(fallbackKeepsPath("coverage/report.md")).toBe(false);
    const fallbackPaths = fallbackMarkdownPaths();
    expect(fallbackPaths.length).toBeGreaterThan(0);
    // Root files stay covered; the relocated staging README is gone.
    expect(fallbackPaths).toContain("README.md");
    expect(fallbackPaths).not.toContain("_extracted/agent-stats-h2a-module/README.md");
    for (const kept of fallbackPaths) {
      expect(kept.endsWith(".md")).toBe(true);
      expect(fallbackKeepsPath(kept)).toBe(true);
    }
  });

  it("SOL61b-1: relative node_modules traversals resolve to the effective package with driver isolation", () => {
    const consumer = "@sen" + "tropic/graph";
    // "./node_modules/pg" from engine.ts is pg and stays isolated like a bare specifier.
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `import "./node_modules/pg/lib/index.js";`,
    }], "source")).not.toEqual([]);
    // Same traversal in generated code escapes the owning adapter.
    expect(checkImportClosure([{
      path: "engram-memory/dist/engine.js",
      content: `import "./node_modules/pg/lib/index.js";`,
    }], "generated")).not.toEqual([]);
    // Nested trees resolve to the LAST node_modules segment.
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: `import x from "../engram-memory/node_modules/pg/node_modules/${consumer}/dist/index.js";`,
    }], "test")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "tests/memory-capture.test.ts",
      content: `import x from "../engram-memory/contracts/node_modules/${consumer}/index.js";`,
    }], "test")).not.toEqual([]);
    // Control: pg through node_modules stays allowed in its isolated adapter.
    expect(checkImportClosure([{
      path: "engram-memory/postgres.ts",
      content: `import "./node_modules/pg/lib/index.js";`,
    }], "source")).toEqual([]);
  });

  it("SOL61b-2: fenced blocks inside quotes, lists, and nestings are discovered", () => {
    const T3 = TILDE.repeat(3);
    const engineDoc = `import { x } from "engram-memory/engine";`;
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `> ${T3}ts\n> ${engineDoc}\n> ${T3}\n`,
    }], "doc")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `- ${T3}ts\n  ${engineDoc}\n  ${T3}\n`,
    }], "doc")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `1. ${T3}ts\n   ${engineDoc}\n   ${T3}\n`,
    }], "doc")).not.toEqual([]);
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `> - ${T3}ts\n> - ${engineDoc}\n> - ${T3}\n`,
    }], "doc")).not.toEqual([]);
  });

  it("SOL61b-3: parenthesized and type-wrapped import() targets stay static", () => {
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `void import(("node:crypto"));`,
    }], "source")).toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `void import("node:crypto" as const);`,
    }], "source")).toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `void import("node:crypto" satisfies string);`,
    }], "source")).toEqual([]);
    expect(checkImportClosure([{
      path: "engram-memory/engine.ts",
      content: `void import("node:crypto"!);`,
    }], "source")).toEqual([]);
  });

  it("SOL61b-4: doc blocks without a memory surface are not controlled", () => {
    const valid = `${FENCE}ts\nimport { x } from "engram-memory/sqlite";\n${FENCE}`;
    const unrelated = `${FENCE}ts\n(name: string) => import(name)\n${FENCE}`;
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${valid}\n${unrelated}\n`,
    }], "doc")).toEqual([]);
    expect(checkImportClosure([{
      path: "docs/example.md",
      content: `${FENCE}ts\nimport { x } from "engram-memory/engine.js";\n${FENCE}\n`,
    }], "doc")).not.toEqual([]);
  });

  it("engram-memory import closure is one-way across sources, generated code, memory tests and fixtures, and documentation examples", () => {
    const sources = sourceFiles();
    const generated = generatedFiles();
    const tests = testClosureFiles();
    const docs = docExampleFiles();

    // Wiring control: the scan is non-vacuous on the real tree — the sets
    // contain one anchor each. The documentation-example set is recorded as
    // empty at baseline (DOC_BASELINE_COUNT), but as a floor, not a ceiling:
    // a future valid example must PASS the doc check, so no equality with []
    // is asserted here.
    const DOC_BASELINE_COUNT = 0;
    const sourcePaths = new Set(sources.map((file) => file.path));
    const generatedPaths = new Set(generated.map((file) => file.path));
    const testPaths = new Set(tests.map((file) => file.path));
    for (const [set, anchor] of [
      [sourcePaths, "engram-memory/engine.ts"],
      [sourcePaths, "engram-memory/contracts/index.ts"],
      [generatedPaths, "engram-memory/dist/index.js"],
      [testPaths, "tests/memory-l3-fixture.ts"],
    ] as const) {
      expect(set.has(anchor), `wiring control: the scanned sets must contain ${anchor}`).toBe(true);
    }
    expect(docs.length >= DOC_BASELINE_COUNT, "documentation-example count must never drop below the recorded baseline").toBe(true);

    const violations = [
      ...checkImportClosure(sources, "source"),
      ...checkImportClosure(generated, "generated"),
      ...checkImportClosure(tests, "test"),
      ...checkImportClosure(docs, "doc"),
    ];
    expect(
      violations,
      "engram-memory import closure must stay one-way (see FIN §3.1.3 T0.1)",
    ).toEqual([]);
  });

  it("packed engram-memory file list and lockfile closure use only neutral vocabulary", () => {
    const packed = packedMemoryPaths();
    expect(packed.length, "the npm pack list is the scanned set: it must be non-empty").toBeGreaterThan(0);
    for (const required of ["dist/index.js", "dist/integration.js", "contracts/dist/index.d.ts"]) {
      expect(packed, `package build must emit ${required} (run npm --prefix engram-memory run build)`).toContain(required);
    }
    const closure = [
      ...packed,
      ...packed.map((path) => readFileSync(join(memoryRoot, path), "utf8")),
      ...lockfilePackageNames(),
      emittedDeclaration("engram-memory/contracts/index.ts"),
    ];
    const consumerNamespace = "@sen" + "tropic/";
    const forbiddenIdentifiers = [
      consumerNamespace,
      "h2" + "a",
      "principal_owner",
      "leg1_verdict_ref",
      "leg2_verdict_ref",
      "independence_attestation",
      "requestingPrincipal",
      "review_status",
    ];
    const violations = forbiddenIdentifiers.filter((identifier) =>
      closure.some((artifact) => artifact.includes(identifier)),
    );

    expect(
      violations,
      "packed engram-memory file list, lockfile closure, emitted declarations, and schemas must not retain consumer identifiers or evaluator/topology shapes",
    ).toEqual([]);
  });
});
