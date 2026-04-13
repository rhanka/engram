/**
 * File discovery, type classification, and corpus health checks.
 */
import {
  readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, lstatSync,
} from "node:fs";
import { join, resolve, extname, basename, relative, sep, dirname } from "node:path";
import { createHash } from "node:crypto";
import { FileType } from "./types.js";
import type { DetectionResult } from "./types.js";

const MANIFEST_PATH = "graphify-out/manifest.json";

export const CODE_EXTENSIONS = new Set([
  ".py", ".ts", ".js", ".jsx", ".tsx", ".go", ".rs", ".java", ".cpp", ".cc", ".cxx",
  ".c", ".h", ".hpp", ".rb", ".swift", ".kt", ".kts", ".cs", ".scala", ".php",
  ".lua", ".toc", ".zig", ".ps1", ".ex", ".exs", ".m", ".mm", ".jl",
]);

export const DOC_EXTENSIONS = new Set([".md", ".txt", ".rst"]);
export const PAPER_EXTENSIONS = new Set([".pdf"]);
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
export const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx"]);

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
  return SENSITIVE_PATTERNS.some((p) => p.test(name) || p.test(filePath));
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
  if (DOC_EXTENSIONS.has(ext)) {
    if (looksLikePaper(filePath)) return FileType.PAPER;
    return FileType.DOCUMENT;
  }
  if (OFFICE_EXTENSIONS.has(ext)) return FileType.DOCUMENT;
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
]);

function isNoiseDir(part: string): boolean {
  if (SKIP_DIRS.has(part)) return true;
  if (part.endsWith("_venv") || part.endsWith("_env")) return true;
  if (part.endsWith(".egg-info")) return true;
  return false;
}

function loadGraphifyignore(root: string): string[] {
  const patterns: string[] = [];
  let current = resolve(root);

  while (true) {
    const ignoreFile = join(current, ".graphifyignore");
    if (existsSync(ignoreFile)) {
      for (let line of readFileSync(ignoreFile, "utf-8").split("\n")) {
        line = line.trim();
        if (line && !line.startsWith("#")) {
          patterns.push(line);
        }
      }
    }

    if (existsSync(join(current, ".git"))) {
      break;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
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

function isIgnored(filePath: string, root: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  let rel: string;
  try {
    rel = relative(root, filePath).replace(/\\/g, "/");
  } catch {
    return false;
  }
  const parts = rel.split("/");
  for (const pattern of patterns) {
    const p = pattern.replace(/^\/+|\/+$/g, "");
    if (!p) continue;
    if (matchGlob(rel, p)) return true;
    if (matchGlob(basename(filePath), p)) return true;
    for (let i = 0; i < parts.length; i++) {
      if (matchGlob(parts[i]!, p)) return true;
      if (matchGlob(parts.slice(0, i + 1).join("/"), p)) return true;
    }
  }
  return false;
}

function walkDir(
  dir: string,
  root: string,
  ignorePatterns: string[],
  followSymlinks: boolean,
  skipPrune: boolean,
): string[] {
  const result: string[] = [];
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
        if (isIgnored(full, root, ignorePatterns)) continue;
      }
      result.push(...walkDir(full, root, ignorePatterns, followSymlinks, skipPrune));
    } else if (stat.isFile()) {
      result.push(full);
    }
  }

  return result;
}

export function detect(root: string, options?: { followSymlinks?: boolean }): DetectionResult {
  const followSymlinks = options?.followSymlinks ?? false;
  const rootResolved = resolve(root);
  const ignorePatterns = loadGraphifyignore(rootResolved);
  const convertedDir = join(rootResolved, "graphify-out", "converted");
  const memoryDir = join(rootResolved, "graphify-out", "memory");

  const files: Record<string, string[]> = {
    code: [], document: [], paper: [], image: [],
  };
  let totalWords = 0;
  const skippedSensitive: string[] = [];

  // Walk main tree
  const allFiles = walkDir(rootResolved, rootResolved, ignorePatterns, followSymlinks, false);

  // Also walk memory dir if it exists
  if (existsSync(memoryDir)) {
    allFiles.push(...walkDir(memoryDir, rootResolved, ignorePatterns, followSymlinks, true));
  }

  const seen = new Set<string>();

  for (const p of allFiles) {
    if (seen.has(p)) continue;
    seen.add(p);

    const inMemory = existsSync(memoryDir) && p.startsWith(memoryDir);
    if (!inMemory) {
      if (basename(p).startsWith(".")) continue;
      if (p.startsWith(convertedDir)) continue;
    }
    if (isIgnored(p, rootResolved, ignorePatterns)) continue;
    if (isSensitive(p)) {
      skippedSensitive.push(p);
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
    totalWords += countWords(p);
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
  };
}

export function loadManifest(manifestPath: string = MANIFEST_PATH): Record<string, number> {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveManifest(files: Record<string, string[]>, manifestPath: string = MANIFEST_PATH): void {
  const manifest: Record<string, number> = {};
  for (const fileList of Object.values(files)) {
    for (const f of fileList) {
      try {
        manifest[f] = statSync(f).mtimeMs;
      } catch { /* deleted between detect and save */ }
    }
  }
  const dir = join(manifestPath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function detectIncremental(root: string, manifestPath: string = MANIFEST_PATH): DetectionResult {
  const full = detect(root);
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
      if (storedMtime === undefined || currentMtime > storedMtime) {
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
