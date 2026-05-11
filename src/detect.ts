/**
 * File discovery, type classification, and corpus health checks.
 */
import {
  readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, lstatSync,
} from "node:fs";
import { join, resolve, extname, basename, relative, sep, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  DEFAULT_GRAPHIFY_STATE_DIR,
  LEGACY_GRAPHIFY_STATE_DIR,
  defaultManifestPath,
  resolveGraphifyPaths,
} from "./paths.js";
import { FileType } from "./types.js";
import { googleWorkspaceEnabled } from "./google-workspace.js";
import type { DetectionResult, InputScopeInspection } from "./types.js";

export const CODE_EXTENSIONS = new Set([
  ".py", ".ts", ".js", ".jsx", ".tsx", ".go", ".rs", ".java", ".cpp", ".cc", ".cxx",
  ".c", ".h", ".hpp", ".rb", ".swift", ".kt", ".kts", ".cs", ".scala", ".php",
  ".lua", ".toc", ".zig", ".ps1", ".ex", ".exs", ".m", ".mm", ".jl", ".vue",
  ".svelte", ".dart", ".v", ".sv", ".mjs", ".ejs", ".sql", ".r", ".groovy",
  ".gradle", ".luau", ".f", ".f90", ".f95", ".f03", ".f08",
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
const FILE_COUNT_UPPER = 200;

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

function hasCodeShebang(filePath: string): boolean {
  try {
    const firstLine = readFileSync(filePath, "utf-8").split(/\r?\n/, 1)[0] ?? "";
    return firstLine.startsWith("#!");
  } catch {
    return false;
  }
}

export function classifyFile(filePath: string): FileType | null {
  const ext = extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return FileType.CODE;
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

/** Extract plain text from a PDF file using pdf-parse. */
export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buf = readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text;
  } catch {
    return "";
  }
}

/** Convert a .docx file to markdown text using mammoth. */
export async function docxToMarkdown(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ path: filePath });
    // mammoth produces HTML; strip tags for a simple text fallback
    return result.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/** Convert an .xlsx file to markdown text using exceljs. */
export async function xlsxToMarkdown(filePath: string): Promise<string> {
  try {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const sections: string[] = [];
    wb.eachSheet((ws) => {
      const rows: string[][] = [];
      ws.eachRow((row) => {
        const cells = (row.values as unknown[]).slice(1).map((v) => (v != null ? String(v) : ""));
        rows.push(cells);
      });
      if (rows.length === 0) return;
      sections.push(`## Sheet: ${ws.name}`);
      const header = "| " + rows[0]!.join(" | ") + " |";
      const sep = "| " + rows[0]!.map(() => "---").join(" | ") + " |";
      sections.push(header, sep);
      for (const row of rows.slice(1)) {
        sections.push("| " + row.join(" | ") + " |");
      }
    });
    return sections.join("\n");
  } catch {
    return "";
  }
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
    const ignoreFile = join(dir, ".graphifyignore");
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
): string[] {
  const result: string[] = [];
  const hasNegationRules = ignorePatterns.some((rule) => rule.negated);
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
      result.push(...walkDir(full, root, ignorePatterns, followSymlinks, skipPrune));
    } else if (stat.isFile()) {
      if (!skipPrune && isIgnored(full, root, ignorePatterns)) continue;
      result.push(full);
    }
  }

  return result;
}

export interface DetectOptions {
  followSymlinks?: boolean;
  candidateFiles?: string[] | null;
  candidateRoot?: string;
  scope?: InputScopeInspection;
}

interface ManifestEntry {
  mtime: number;
  hash: string;
}

type ManifestRecord = Record<string, number | ManifestEntry>;

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

  return {
    files,
    total_files: totalFiles,
    total_words: totalWords,
    needs_graph: needsGraph,
    warning,
    skipped_sensitive: skippedSensitive,
    graphifyignore_patterns: ignorePatterns.length,
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

export function saveManifest(files: Record<string, string[]>, manifestPath: string = defaultManifestPath()): void {
  const manifest: Record<string, ManifestEntry> = {};
  for (const fileList of Object.values(files)) {
    for (const f of fileList) {
      try {
        manifest[f] = {
          mtime: statSync(f).mtimeMs,
          hash: md5File(f),
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
  const manifestPath = typeof manifestPathOrOptions === "string"
    ? manifestPathOrOptions
    : defaultManifestPath(root);
  const options = typeof manifestPathOrOptions === "string"
    ? maybeOptions
    : manifestPathOrOptions;
  const full = detect(root, options);
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
      const storedMtime = manifest[f];
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

  const currentFiles = new Set(Object.values(full.files).flat());
  const deletedFiles = Object.keys(manifest).filter((f) => !currentFiles.has(f));
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
