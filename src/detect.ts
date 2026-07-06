/**
 * File discovery, type classification, and corpus health checks.
 */
import {
  readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, lstatSync, realpathSync,
} from "node:fs";
import { join, resolve, extname, basename, relative, sep, dirname, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import {
  DEFAULT_GRAPHIFY_STATE_DIR,
  LEGACY_GRAPHIFY_STATE_DIR,
  defaultManifestPath,
  resolveGraphifyPaths,
} from "./paths.js";
import { FileType } from "./types.js";
import { googleWorkspaceEnabled } from "./google-workspace.js";
import { fileWithinSizeCap, zipWithinCaps } from "./office-guard.js";
import type { DetectionResult, InputScopeInspection } from "./types.js";
import { detectGitWindow } from "./extract-git.js";

export const CODE_EXTENSIONS = new Set([
  ".py", ".ts", ".js", ".jsx", ".tsx", ".go", ".rs", ".java", ".cpp", ".cc", ".cxx",
  ".c", ".h", ".hpp", ".rb", ".swift", ".kt", ".kts", ".cs", ".scala", ".php",
  ".lua", ".toc", ".zig", ".ps1", ".ex", ".exs", ".m", ".mm", ".jl", ".vue",
  ".svelte", ".astro", ".dart", ".v", ".sv", ".svh", ".mjs", ".ejs", ".sql", ".r", ".groovy",
  ".gradle", ".luau", ".f", ".f90", ".f95", ".f03", ".f08",
  // TypeScript module/CommonJS variants — port of upstream 1226c34.
  ".mts", ".cts",
  // ArkTS — TypeScript-superset used by HarmonyOS / OpenHarmony app development.
  // Tree-sitter TypeScript already handles .ets AST extraction; detect just
  // needed to recognize the extension. Port of upstream safishamsi 52d75bd / #926.
  ".ets",
  // .NET project files — port of upstream safishamsi 8bcfffd / #515.
  // Regex-backed extractors (extractSln, extractCsproj) handle these; no tree-sitter
  // grammar required. .props/.targets are MSBuild SDK extension files that share the
  // same XML schema as .csproj and are dispatched to extractCsproj.
  ".sln", ".csproj", ".fsproj", ".vbproj", ".props", ".targets",
]);

/**
 * MCP (Model Context Protocol) config files, classified by FILENAME (not
 * extension — a bare `.json` is otherwise unclassified). Dispatched to
 * `extractMcpConfig`. Port of upstream safishamsi 2c01a89 (#... mcp_ingest).
 * `.mcp.json` is a hidden file: the detection walk skips dot-prefixed
 * basenames, so it is classified here for explicit single-file targets but not
 * picked up during a directory scan (consistent with the hidden-file policy).
 */
export const MCP_CONFIG_FILENAMES = new Set([
  ".mcp.json",
  "claude_desktop_config.json",
  "mcp.json",
  "mcp_servers.json",
]);

export const DOC_EXTENSIONS = new Set([".md", ".mdx", ".qmd", ".txt", ".rst", ".html", ".yaml", ".yml"]);
export const PAPER_EXTENSIONS = new Set([".pdf"]);
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
export const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx"]);
export const GOOGLE_WORKSPACE_EXTENSIONS = new Set([".gdoc", ".gsheet", ".gslides"]);
export const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mp3", ".wav", ".m4a", ".ogg",
]);

const CORPUS_WARN_THRESHOLD = 50_000;
const CORPUS_UPPER_THRESHOLD = 500_000;
const FILE_COUNT_UPPER = 500;

// Sensitive file patterns
const SENSITIVE_PATTERNS = [
  /(^|[\\/])\.(env|envrc)(\.|$)/i,
  /\.(pem|key|p12|pfx|cert|crt|der|p8)$/i,
  /(credential|secret|passwd|password|token|private_key)/i,
  /(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/,
  /(\.netrc|\.pgpass|\.htpasswd)$/i,
  /(aws_credentials|gcloud_credentials|service.account)/i,
];

// Academic paper signals
const PAPER_SIGNALS = [
  /\barxiv\b/i, /\bdoi\s*:/i, /\babstract\b/i, /\bproceedings\b/i,
  /\bjournal\b/i, /\bpreprint\b/i, /\\cite\{/, /\[\d+\]/, /\[\n\d+\n\]/,
  /eq\.\s*\d+|equation\s+\d+/i, /\d{4}\.\d{4,5}/, /\bwe propose\b/i, /\bliterature\b/i,
];
const PAPER_SIGNAL_THRESHOLD = 3;

function isSensitive(filePath: string): boolean {
  const name = basename(filePath);
  return SENSITIVE_PATTERNS.some((p) => p.test(name));
}

function looksLikePaper(filePath: string): boolean {
  try {
    const text = readFileSync(filePath, "utf-8").slice(0, 3000);
    const hits = PAPER_SIGNALS.filter((p) => p.test(text)).length;
    return hits >= PAPER_SIGNAL_THRESHOLD;
  } catch {
    return false;
  }
}

const ASSET_DIR_MARKERS = new Set([".imageset", ".xcassets", ".appiconset", ".colorset", ".launchimage"]);

// Interpreter names that mark a shebang-only file as CODE. Mirrors upstream
// `_SHEBANG_CODE_INTERPRETERS` (port of safishamsi b6127aa sub).
const SHEBANG_CODE_INTERPRETERS = new Set([
  "python", "python3", "python2",
  "ruby", "perl", "node", "nodejs",
  "bash", "sh", "dash", "zsh", "fish", "ksh", "tcsh",
  "lua", "php", "julia", "Rscript",
]);

/**
 * POSIX-style shell tokenizer covering the subset of `shlex.split` that
 * shebang lines actually exercise: single/double quotes, backslash escapes
 * outside single quotes, whitespace-separated tokens. Throws on unbalanced
 * quotes (matches shlex behavior) so the caller can fall back to None.
 */
function shellSplit(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let hasToken = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (inSingle) {
      if (c === "'") { inSingle = false; continue; }
      current += c;
      continue;
    }
    if (inDouble) {
      if (c === "\\" && i + 1 < input.length) {
        const next = input[i + 1]!;
        if (next === "\"" || next === "\\" || next === "$" || next === "`" || next === "\n") {
          current += next;
          i++;
          continue;
        }
        current += c;
        continue;
      }
      if (c === "\"") { inDouble = false; continue; }
      current += c;
      continue;
    }
    if (c === "'") { inSingle = true; hasToken = true; continue; }
    if (c === "\"") { inDouble = true; hasToken = true; continue; }
    if (c === "\\" && i + 1 < input.length) {
      current += input[i + 1]!;
      i++;
      hasToken = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += c;
    hasToken = true;
  }
  if (inSingle || inDouble) {
    throw new Error("unbalanced quote");
  }
  if (hasToken) tokens.push(current);
  return tokens;
}

function splitEnvS(value: string, rest: string[]): string[] {
  const packed = [value, ...rest].join(" ").trim();
  return shellSplit(packed);
}

/**
 * Strip leading env(1) options and var assignments, return the trailing
 * command argv. Covers macOS/BSD and GNU coreutils env documented spellings.
 *
 * POSIX/macOS short forms:
 *     env [-0iv] [-C workdir] [-P utilpath] [-S string]
 *         [-u name] [name=value ...] [utility [argument ...]]
 *
 * GNU coreutils long/compact forms additionally supported:
 *     --argv0=ARG / -a ARG / -aARG
 *     --unset=NAME / --unset NAME / -u NAME / -uNAME
 *     --chdir=DIR / --chdir DIR / -C DIR / -CDIR
 *     --split-string=STRING / --split-string STRING
 *     -S STRING / -SSTRING / -vS STRING / -vSSTRING
 *     --ignore-environment / --null / --debug / --list-signal-handling
 *     --default-signal[=SIG] / --ignore-signal[=SIG] / --block-signal[=SIG]
 *
 * `-S` / `--split-string` payloads are themselves env-style argument lists
 * per the GNU shebang synopsis:
 *     #!/usr/bin/env -[v]S[option]... [name=value]... command [args]...
 * so after splitting the payload we recursively re-parse it with
 * `allowSplit=false` (a nested -S inside a split payload is rejected to
 * bound recursion).
 *
 * Unknown hyphen-prefixed args yield [] (we refuse to guess whether their
 * next token is an interpreter or an operand).
 *
 * Port of upstream safishamsi b6127aa sub (`_env_command_args`).
 */
function envCommandArgs(args: string[], allowSplit: boolean = true): string[] {
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === "--") {
      return args.slice(i + 1);
    }

    // Split-string forms: tokenize the packed payload, then re-parse it as
    // env args (so leading assignments/flags inside the payload are skipped
    // before the interpreter is identified).
    if (allowSplit) {
      if (arg === "-S") {
        if (i + 1 >= args.length) return [];
        return envCommandArgs(splitEnvS(args.slice(i + 1).join(" "), []), false);
      }
      if (arg.startsWith("-S") && arg.length > 2) {
        return envCommandArgs(splitEnvS(arg.slice(2), args.slice(i + 1)), false);
      }
      if (arg === "-vS") {
        if (i + 1 >= args.length) return [];
        return envCommandArgs(splitEnvS(args.slice(i + 1).join(" "), []), false);
      }
      if (arg.startsWith("-vS") && arg.length > 3) {
        return envCommandArgs(splitEnvS(arg.slice(3), args.slice(i + 1)), false);
      }
      if (arg.startsWith("--split-string=")) {
        return envCommandArgs(splitEnvS(arg.slice("--split-string=".length), args.slice(i + 1)), false);
      }
      if (arg === "--split-string") {
        if (i + 1 >= args.length) return [];
        return envCommandArgs(splitEnvS(args[i + 1]!, args.slice(i + 2)), false);
      }
    }

    // Options with separate required operand
    if (arg === "-u" || arg === "-C" || arg === "-P" || arg === "-a" ||
        arg === "--unset" || arg === "--chdir" || arg === "--argv0") {
      if (i + 2 > args.length) return [];
      i += 2;
      continue;
    }

    // Clumped short option + operand (e.g. `-uPYTHONPATH`)
    if (
      (arg.startsWith("-u") || arg.startsWith("-C") || arg.startsWith("-P") || arg.startsWith("-a"))
      && arg.length > 2 && !arg.startsWith("--")
    ) {
      i += 1;
      continue;
    }

    // Long option with `=` operand
    if (arg.startsWith("--unset=") || arg.startsWith("--chdir=") || arg.startsWith("--argv0=")) {
      i += 1;
      continue;
    }

    // No-operand flags
    if (arg === "-" || arg === "-i" || arg === "-0" || arg === "-v" ||
        arg === "--ignore-environment" || arg === "--null" ||
        arg === "--debug" || arg === "--list-signal-handling") {
      i += 1;
      continue;
    }

    // Signal-handling long flags (with or without =SIG operand — treated as
    // no-effect for interpreter-resolution purposes)
    if (arg.startsWith("--default-signal") || arg.startsWith("--ignore-signal") ||
        arg.startsWith("--block-signal")) {
      i += 1;
      continue;
    }

    // Unknown hyphen-prefixed: refuse to guess
    if (arg.startsWith("-")) return [];

    // Inline NAME=value assignment
    if (arg.includes("=")) {
      i += 1;
      continue;
    }

    // First non-option, non-assignment token starts the command argv
    return args.slice(i);
  }

  return [];
}

/**
 * Return the interpreter basename from a shebang line, or null if there is
 * no shebang / the file is unreadable / parsing fails.
 *
 * Handles forms that a naive parser misses:
 *   - `#!/usr/bin/env -S python3 -u`     (env -S split-args form)
 *   - `#!/usr/bin/env -i bash`           (no-operand env flags)
 *   - `#!/usr/bin/env -u VAR python3`    (env options with operands)
 *   - `#!/usr/bin/env -C /tmp python3`   (env -C workdir)
 *   - `#!/usr/bin/env -P /bin python3`   (env -P utilpath)
 *   - `#!/usr/bin/env DEBUG=1 python3`   (inline var assignment)
 *   - `#!"/usr/local/bin/python with spaces"`  (shellSplit handles quotes)
 *
 * Port of upstream safishamsi b6127aa sub (`_shebang_interpreter`).
 */
export function shebangInterpreter(filePath: string): string | null {
  let first: Buffer;
  try {
    const fd = readFileSync(filePath);
    first = fd.subarray(0, 256);
  } catch {
    return null;
  }
  if (first.length < 2 || first[0] !== 0x23 /* # */ || first[1] !== 0x21 /* ! */) {
    return null;
  }
  const nl = first.indexOf(0x0a);
  const lineBuf = nl >= 0 ? first.subarray(0, nl) : first;
  // Decode as UTF-8 with replacement on errors (Buffer toString default).
  const line = lineBuf.toString("utf-8").slice(2).trim();
  let parts: string[];
  try {
    parts = shellSplit(line);
  } catch {
    return null;
  }
  if (parts.length === 0) return null;
  let interp = basename(parts[0]!);
  if (interp === "env") {
    const envArgs = envCommandArgs(parts.slice(1));
    if (envArgs.length === 0) return null;
    interp = basename(envArgs[0]!);
  }
  return interp;
}

function hasCodeShebang(filePath: string): boolean {
  const interp = shebangInterpreter(filePath);
  return interp !== null && SHEBANG_CODE_INTERPRETERS.has(interp);
}

export function classifyFile(filePath: string): FileType | null {
  const ext = extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return FileType.CODE;
  // MCP config files are recognised by full filename, not extension.
  if (MCP_CONFIG_FILENAMES.has(basename(filePath))) return FileType.CODE;
  if (PAPER_EXTENSIONS.has(ext)) {
    // PDFs inside Xcode asset catalogs are vector icons, not papers
    const parts = filePath.split(sep);
    if (parts.some((p) => [...ASSET_DIR_MARKERS].some((m) => p.endsWith(m)))) return null;
    return FileType.PAPER;
  }
  if (IMAGE_EXTENSIONS.has(ext)) return FileType.IMAGE;
  if (VIDEO_EXTENSIONS.has(ext)) return FileType.VIDEO;
  if (DOC_EXTENSIONS.has(ext)) {
    if (looksLikePaper(filePath)) return FileType.PAPER;
    return FileType.DOCUMENT;
  }
  if (!ext && hasCodeShebang(filePath)) return FileType.CODE;
  if (OFFICE_EXTENSIONS.has(ext)) return FileType.DOCUMENT;
  if (GOOGLE_WORKSPACE_EXTENSIONS.has(ext)) {
    return googleWorkspaceEnabled() ? FileType.DOCUMENT : null;
  }
  return null;
}

/**
 * Extract plain text from a PDF file using unpdf (modern pdfjs wrapper,
 * bundles its own pdfjs runtime; no peer pdfjs-dist install required).
 */
export async function extractPdfText(filePath: string): Promise<string> {
  // F-0831-P1 (F2): screen the on-disk size before unpdf decompresses the PDF
  // streams, so an oversized untrusted paper cannot OOM the scan.
  if (!fileWithinSizeCap(filePath)) return "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buf = readFileSync(filePath);
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(doc, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text ?? "");
  } catch {
    return "";
  }
}

/**
 * Convert .docx, .xlsx, .pptx, .odt, .ods, .odp and .rtf files to plain
 * text using officeparser. The host package keeps officeparser as an
 * optional dep with `pdfjs-dist` and `tesseract.js` overridden to
 * `empty-npm-package` (see package.json `overrides`); we always pass
 * `{ ocr: false }` so tesseract is never imported, and we route .pdf
 * separately through unpdf so the pdfjs stub is never hit either.
 */
async function officeParseToText(filePath: string): Promise<string> {
  try {
    const { parseOfficeAsync } = (await import("officeparser")) as unknown as {
      parseOfficeAsync: (file: string, opts?: { ocr?: boolean }) => Promise<string>;
    };
    return await parseOfficeAsync(filePath, { ocr: false });
  } catch {
    return "";
  }
}

/** Convert a .docx file to plain text via officeparser. */
export async function docxToMarkdown(filePath: string): Promise<string> {
  // F-0831-P1 (F2): .docx is a zip+XML container; cap it before officeparser
  // decompresses it, treating a zip-bomb as empty rather than parsing it.
  if (!zipWithinCaps(filePath)) return "";
  return (await officeParseToText(filePath)).trim();
}

/** Convert an .xlsx file to plain text via officeparser. */
export async function xlsxToMarkdown(filePath: string): Promise<string> {
  // F-0831-P1 (F2): same zip-bomb cap as .docx before openpyxl-style parsing.
  if (!zipWithinCaps(filePath)) return "";
  return (await officeParseToText(filePath)).trim();
}

/** Convert .docx/.xlsx to a markdown sidecar file. */
export async function convertOfficeFile(filePath: string, outDir: string): Promise<string | null> {
  const ext = extname(filePath).toLowerCase();
  let text: string;
  if (ext === ".docx") {
    text = await docxToMarkdown(filePath);
  } else if (ext === ".xlsx") {
    text = await xlsxToMarkdown(filePath);
  } else {
    return null;
  }

  if (!text.trim()) return null;

  mkdirSync(outDir, { recursive: true });
  const nameHash = createHash("sha256").update(resolve(filePath)).digest("hex").slice(0, 8);
  const stem = basename(filePath, extname(filePath));
  const outPath = join(outDir, `${stem}_${nameHash}.md`);
  writeFileSync(outPath, `<!-- converted from ${basename(filePath)} -->\n\n${text}`, "utf-8");
  return outPath;
}

function countWords(filePath: string): number {
  try {
    const text = readFileSync(filePath, "utf-8");
    return text.split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

// Directory names to always skip
const SKIP_DIRS = new Set([
  "venv", ".venv", "env", ".env", "node_modules", "__pycache__", ".git",
  "dist", "build", "target", "out", "site-packages", "lib64",
  ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".eggs",
  DEFAULT_GRAPHIFY_STATE_DIR, LEGACY_GRAPHIFY_STATE_DIR,
  // git worktree convention (port of upstream PR #947) -- sibling checkouts
  // are always redundant relative to the primary worktree at the scan root.
  ".worktrees",
]);

const VCS_MARKERS = [".git", ".hg", ".svn", "_darcs", ".fossil"];

function isNoiseDir(part: string): boolean {
  if (SKIP_DIRS.has(part)) return true;
  if (part.endsWith("_venv") || part.endsWith("_env")) return true;
  if (part.endsWith(".egg-info")) return true;
  return false;
}

interface GraphifyIgnoreRule {
  anchor: string;
  pattern: string;
  negated: boolean;
}

function parseGraphifyignoreLine(raw: string): { pattern: string; negated: boolean } | null {
  let line = raw.replace(/[\r\n]+$/g, "");
  line = line.replace(/(?<!\\) +$/g, "");
  line = line.replace(/^\s+/, "");
  if (!line || line.startsWith("#")) {
    return null;
  }
  let negated = false;
  if (line.startsWith("\\!") || line.startsWith("\\#")) {
    line = line.slice(1);
  } else if (line.startsWith("!")) {
    negated = true;
    line = line.slice(1);
  }
  if (!line) return null;
  return { pattern: line, negated };
}

function findVcsRoot(start: string): string | null {
  let current = resolve(start);
  const home = resolve(process.env.HOME ?? current);
  while (true) {
    if (VCS_MARKERS.some((marker) => existsSync(join(current, marker)))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current || current === home) {
      return null;
    }
    current = parent;
  }
}

function loadGraphifyignore(root: string): GraphifyIgnoreRule[] {
  const resolvedRoot = resolve(root);
  const ceiling = findVcsRoot(resolvedRoot) ?? resolvedRoot;
  const dirs: string[] = [];
  let current = resolvedRoot;

  while (true) {
    dirs.push(current);
    if (current === ceiling) {
      break;
    }
    current = dirname(current);
  }

  dirs.reverse();

  const patterns: GraphifyIgnoreRule[] = [];
  for (const dir of dirs) {
    // Prefer .graphifyignore; fall back to .gitignore so projects that
    // already maintain a .gitignore get sensible defaults without
    // duplicating it. Port of upstream PR #945 / commit 9e6192a.
    //
    // Note: an explicit empty .graphifyignore wins over any .gitignore in
    // the same directory (existsSync() is true), so users keep a way to
    // opt out of the fallback by `touch .graphifyignore`.
    let ignoreFile = join(dir, ".graphifyignore");
    if (!existsSync(ignoreFile)) {
      ignoreFile = join(dir, ".gitignore");
    }
    if (!existsSync(ignoreFile)) continue;
    for (const raw of readFileSync(ignoreFile, "utf-8").split(/\r?\n/)) {
      const parsed = parseGraphifyignoreLine(raw);
      if (!parsed) continue;
      patterns.push({ anchor: dir, pattern: parsed.pattern, negated: parsed.negated });
    }
  }
  return patterns;
}

function matchGlob(text: string, pattern: string): boolean {
  // Simple glob matching (*, ?)
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(text);
}

function relativeWithin(base: string, target: string): string | null {
  const rel = relative(base, target).replace(/\\/g, "/");
  if (rel === "") return "";
  if (rel === ".." || rel.startsWith("../")) return null;
  return rel;
}

function matchesIgnorePattern(rel: string, name: string, pattern: string, anchored: boolean): boolean {
  const parts = rel.split("/");
  if (matchGlob(rel, pattern)) return true;
  if (!anchored && matchGlob(name, pattern)) return true;
  for (let i = 0; i < parts.length; i++) {
    if (!anchored && matchGlob(parts[i]!, pattern)) return true;
    if (matchGlob(parts.slice(0, i + 1).join("/"), pattern)) return true;
  }
  return false;
}

function isIgnored(filePath: string, root: string, patterns: GraphifyIgnoreRule[]): boolean {
  if (patterns.length === 0) return false;

  let ignored = false;
  for (const rule of patterns) {
    const anchored = rule.pattern.startsWith("/");
    const p = rule.pattern.replace(/^\/+|\/+$/g, "");
    if (!p) continue;
    const relRoot = relativeWithin(root, filePath);
    const relAnchor = relativeWithin(rule.anchor, filePath);

    if (anchored) {
      if (relAnchor !== null && matchesIgnorePattern(relAnchor, basename(filePath), p, true)) {
        ignored = !rule.negated;
      }
      continue;
    }

    if (relRoot !== null && matchesIgnorePattern(relRoot, basename(filePath), p, false)) {
      ignored = !rule.negated;
    }
    if (rule.anchor !== root && relAnchor !== null && matchesIgnorePattern(relAnchor, basename(filePath), p, false)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function walkDir(
  dir: string,
  root: string,
  ignorePatterns: GraphifyIgnoreRule[],
  followSymlinks: boolean,
  skipPrune: boolean,
  visitedDirs: Set<string> = new Set(),
): string[] {
  const result: string[] = [];
  const hasNegationRules = ignorePatterns.some((rule) => rule.negated);
  if (followSymlinks) {
    try {
      const realDir = realpathSync(dir);
      if (visitedDirs.has(realDir)) return result;
      visitedDirs.add(realDir);
    } catch {
      return result;
    }
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = followSymlinks ? statSync(full) : lstatSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (!skipPrune) {
        if (entry.startsWith(".")) continue;
        if (isNoiseDir(entry)) continue;
        if (isIgnored(full, root, ignorePatterns) && !hasNegationRules) continue;
      }
      result.push(...walkDir(full, root, ignorePatterns, followSymlinks, skipPrune, visitedDirs));
    } else if (stat.isFile()) {
      if (!skipPrune && isIgnored(full, root, ignorePatterns)) continue;
      result.push(canonicalFilePath(full));
    }
  }

  return result;
}

function canonicalFilePath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

export interface DetectOptions {
  followSymlinks?: boolean;
  candidateFiles?: string[] | null;
  candidateRoot?: string;
  scope?: InputScopeInspection;
  /**
   * Additional ignore patterns appended to the loaded
   * `.graphifyignore` / `.gitignore` rules. Each pattern uses
   * gitignore syntax and is anchored at the scan root. Patterns are
   * applied *after* the loaded rules so they override negations.
   *
   * Port of upstream `--exclude` flag (PR #947, commit 9e6192a).
   */
  extraExcludes?: string[] | null;
}

interface ManifestEntry {
  mtime: number;
  hash: string;
}

type ManifestRecord = Record<string, number | ManifestEntry>;

interface SaveManifestOptions {
  root?: string;
}

function resolveCandidateFiles(
  rootResolved: string,
  candidateRoot: string,
  candidateFiles: string[],
  followSymlinks: boolean,
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const file of candidateFiles) {
    const fullPath = resolve(candidateRoot, file);
    if (seen.has(fullPath)) continue;
    seen.add(fullPath);
    resolved.push(fullPath);
  }
  // Ensure .graphify/memory under the requested root remains a possible input even when
  // the candidate inventory was built against a broader Git root.
  const memoryDir = resolveGraphifyPaths({ root: rootResolved }).memoryDir;
  if (existsSync(memoryDir)) {
    for (const file of walkDir(memoryDir, rootResolved, [], followSymlinks, true)) {
      if (seen.has(file)) continue;
      seen.add(file);
      resolved.push(file);
    }
  }
  return resolved;
}

export function detect(root: string, options?: DetectOptions): DetectionResult {
  const followSymlinks = options?.followSymlinks ?? false;
  const rootResolved = resolve(root);
  const paths = resolveGraphifyPaths({ root: rootResolved });
  const ignorePatterns = loadGraphifyignore(rootResolved);
  // CLI --exclude patterns are anchored at the scan root and appended last
  // so they win over any .graphifyignore / .gitignore rules (port of
  // upstream PR #947 / commit 9e6192a). Empty/whitespace-only entries are
  // dropped via parseGraphifyignoreLine().
  if (options?.extraExcludes && options.extraExcludes.length > 0) {
    for (const raw of options.extraExcludes) {
      const parsed = parseGraphifyignoreLine(raw);
      if (!parsed) continue;
      ignorePatterns.push({ anchor: rootResolved, pattern: parsed.pattern, negated: parsed.negated });
    }
  }
  const convertedDir = paths.convertedDir;
  const memoryDir = paths.memoryDir;

  const files: Record<string, string[]> = {
    code: [], document: [], paper: [], image: [], video: [],
  };
  let totalWords = 0;
  const skippedSensitive: string[] = [];
  let excludedIgnoredCount = options?.scope?.excluded_ignored_count ?? 0;
  let excludedSensitiveCount = 0;

  const allFiles = options?.candidateFiles !== undefined && options.candidateFiles !== null
    ? resolveCandidateFiles(rootResolved, options.candidateRoot ?? rootResolved, options.candidateFiles, followSymlinks)
    : [
      ...walkDir(rootResolved, rootResolved, ignorePatterns, followSymlinks, false),
      ...(existsSync(memoryDir)
        ? walkDir(memoryDir, rootResolved, ignorePatterns, followSymlinks, true)
        : []),
    ];

  // Sort all_files lexicographically so downstream extraction order is
  // deterministic regardless of filesystem b-tree / inode order (port of
  // upstream safishamsi 8db19d6, #1090).
  allFiles.sort();

  const seen = new Set<string>();

  for (const p of allFiles) {
    if (seen.has(p)) continue;
    seen.add(p);

    const inMemory = existsSync(memoryDir) && p.startsWith(memoryDir);
    if (!inMemory) {
      if (basename(p).startsWith(".")) continue;
      if (p.startsWith(convertedDir)) continue;
    }
    if (isIgnored(p, rootResolved, ignorePatterns)) {
      excludedIgnoredCount += 1;
      continue;
    }
    if (isSensitive(p)) {
      skippedSensitive.push(p);
      excludedSensitiveCount += 1;
      continue;
    }

    const ftype = classifyFile(p);
    if (!ftype) continue;

    // Office files: convert to markdown sidecar
    if (OFFICE_EXTENSIONS.has(extname(p).toLowerCase())) {
      // Note: office conversion is async but detect is sync.
      // We skip office files in sync detect; they're handled in the async pipeline.
      skippedSensitive.push(p + " [office conversion requires async - use pipeline]");
      continue;
    }

    files[ftype]!.push(p);
    if (ftype !== FileType.VIDEO) {
      totalWords += countWords(p);
    }
  }

  // Sort per-FileType lists so each bucket is lexicographically stable
  // (mirrors the Python per-ftype sort in 8db19d6).
  for (const list of Object.values(files)) {
    list.sort();
  }

  const totalFiles = Object.values(files).reduce((s, v) => s + v.length, 0);
  const needsGraph = totalWords >= CORPUS_WARN_THRESHOLD;

  let warning: string | null = null;
  if (!needsGraph) {
    warning = `Corpus is ~${totalWords.toLocaleString()} words - fits in a single context window. You may not need a graph.`;
  } else if (totalWords >= CORPUS_UPPER_THRESHOLD || totalFiles >= FILE_COUNT_UPPER) {
    warning =
      `Large corpus: ${totalFiles} files · ~${totalWords.toLocaleString()} words. ` +
      `Semantic extraction will be expensive (many Claude tokens). ` +
      `Consider running on a subfolder, or use --no-semantic to run AST-only.`;
  }

  const gitWindow = detectGitWindow(rootResolved);

  return {
    files,
    total_files: totalFiles,
    total_words: totalWords,
    needs_graph: needsGraph,
    warning,
    skipped_sensitive: skippedSensitive,
    graphifyignore_patterns: ignorePatterns.length,
    ...(gitWindow ? { git: gitWindow } : {}),
    ...(options?.scope
      ? {
        scope: {
          ...options.scope,
          included_count: totalFiles,
          excluded_ignored_count: excludedIgnoredCount,
          excluded_sensitive_count: excludedSensitiveCount,
        },
      }
      : {}),
  };
}

function md5File(filePath: string): string {
  const hash = createHash("md5");
  try {
    hash.update(readFileSync(filePath));
  } catch {
    return "";
  }
  return hash.digest("hex");
}

export function loadManifest(manifestPath: string = defaultManifestPath()): ManifestRecord {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as ManifestRecord;
  } catch {
    return {};
  }
}

function normaliseManifestEntry(entry: number | ManifestEntry | undefined): ManifestEntry | null {
  if (entry === undefined) return null;
  if (typeof entry === "number") {
    // Legacy schema: bare mtime number
    return { mtime: entry, hash: "" };
  }
  if (entry && typeof entry === "object" && typeof entry.mtime === "number") {
    return { mtime: entry.mtime, hash: typeof entry.hash === "string" ? entry.hash : "" };
  }
  return null;
}

function portablePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function manifestProjectRoot(manifestPath: string, options?: SaveManifestOptions): string {
  if (options?.root) return resolve(options.root);

  const manifestDir = resolve(dirname(manifestPath));
  const stateDirName = basename(manifestDir);
  if (stateDirName === DEFAULT_GRAPHIFY_STATE_DIR || stateDirName === LEGACY_GRAPHIFY_STATE_DIR) {
    return dirname(manifestDir);
  }
  return process.cwd();
}

function resolveManifestKey(root: string, key: string): string {
  if (isAbsolute(key) || isWindowsAbsolutePath(key)) return key;
  return resolve(root, key);
}

function manifestKeyForFile(root: string, filePath: string): string {
  if (isWindowsAbsolutePath(filePath)) return portablePath(filePath);

  const absolutePath = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const relativePath = relative(root, absolutePath);
  if (!relativePath) return ".";
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return portablePath(relativePath);
  }
  return portablePath(absolutePath);
}

export function saveManifest(
  files: Record<string, string[]>,
  manifestPath: string = defaultManifestPath(),
  options?: SaveManifestOptions,
): void {
  // Upstream 2d783e5 (#917): seed from the existing manifest so incremental
  // callers passing only a subset of files don't silently erase entries for
  // untouched files. Prune entries whose file no longer exists on disk —
  // those are genuine deletions detectIncremental() should treat as gone.
  const manifestRoot = manifestProjectRoot(manifestPath, options);
  const existing = loadManifest(manifestPath);
  const manifest: Record<string, ManifestEntry> = {};
  for (const [f, raw] of Object.entries(existing)) {
    const normalised = normaliseManifestEntry(raw);
    if (!normalised) continue;
    const absolutePath = resolveManifestKey(manifestRoot, f);
    try {
      if (existsSync(absolutePath)) {
        manifest[manifestKeyForFile(manifestRoot, absolutePath)] = normalised;
      }
    } catch { /* ignore stat errors */ }
  }

  for (const fileList of Object.values(files)) {
    for (const f of fileList) {
      const absolutePath = resolveManifestKey(manifestRoot, f);
      try {
        manifest[manifestKeyForFile(manifestRoot, absolutePath)] = {
          mtime: statSync(absolutePath).mtimeMs,
          hash: md5File(absolutePath),
        };
      } catch { /* deleted between detect and save */ }
    }
  }
  const dir = join(manifestPath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function detectIncremental(
  root: string,
  manifestPathOrOptions: string | DetectOptions = defaultManifestPath(root),
  maybeOptions?: DetectOptions,
): DetectionResult {
  const rootResolved = resolve(root);
  const manifestPath = typeof manifestPathOrOptions === "string"
    ? manifestPathOrOptions
    : defaultManifestPath(rootResolved);
  const options = typeof manifestPathOrOptions === "string"
    ? maybeOptions
    : manifestPathOrOptions;
  const full = detect(rootResolved, options);
  const manifest = loadManifest(manifestPath);

  if (Object.keys(manifest).length === 0) {
    return {
      ...full,
      incremental: true,
      new_files: full.files,
      unchanged_files: Object.fromEntries(Object.keys(full.files).map((k) => [k, []])),
      new_total: full.total_files,
    };
  }

  const newFiles: Record<string, string[]> = {};
  const unchangedFiles: Record<string, string[]> = {};
  for (const k of Object.keys(full.files)) {
    newFiles[k] = [];
    unchangedFiles[k] = [];
  }

  for (const [ftype, fileList] of Object.entries(full.files)) {
    for (const f of fileList) {
      const manifestKey = manifestKeyForFile(rootResolved, f);
      const storedMtime = manifest[f] ?? manifest[manifestKey];
      let currentMtime = 0;
      try { currentMtime = statSync(f).mtimeMs; } catch { /* ignore */ }
      let changed = false;
      if (storedMtime === undefined) {
        changed = true;
      } else if (typeof storedMtime === "number") {
        changed = currentMtime > storedMtime;
      } else {
        if (storedMtime.mtime === undefined || currentMtime !== storedMtime.mtime) {
          changed = md5File(f) !== storedMtime.hash;
        }
      }
      if (changed) {
        newFiles[ftype]!.push(f);
      } else {
        unchangedFiles[ftype]!.push(f);
      }
    }
  }

  const currentFiles = new Set<string>();
  for (const f of Object.values(full.files).flat()) {
    currentFiles.add(f);
    currentFiles.add(manifestKeyForFile(rootResolved, f));
  }
  const deletedFiles = Object.keys(manifest)
    .filter((f) => !currentFiles.has(f))
    .map((f) => resolveManifestKey(rootResolved, f));
  const newTotal = Object.values(newFiles).reduce((s, v) => s + v.length, 0);

  return {
    ...full,
    incremental: true,
    new_files: newFiles,
    unchanged_files: unchangedFiles,
    new_total: newTotal,
    deleted_files: deletedFiles,
  };
}
