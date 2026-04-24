import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type Graph from "graphology";

import type { DetectionResult, Extraction } from "./types.js";

export type PortablePathIssueKind =
  | "absolute_path"
  | "escaped_root_path";

export interface PortablePathIssue {
  path: string;
  jsonPath?: string;
  value: string;
  kind: PortablePathIssueKind;
}

export interface PortableCheckResult {
  ok: boolean;
  checkedFiles: string[];
  ignoredLocalFiles: string[];
  issues: PortablePathIssue[];
}

const LOCAL_LIFECYCLE_FILES = new Set([
  "branch.json",
  "worktree.json",
  "needs_update",
]);

const LOCAL_LIFECYCLE_PREFIXES = [
  ".graphify_",
  "cache/",
  "converted/",
  "memory/",
  "profile/",
  "transcripts/",
];

const TEXT_ARTIFACT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".html",
  ".htm",
  ".svg",
  ".graphml",
  ".txt",
]);

const EMBEDDED_PATH_PATTERN =
  /(^|[\s("'`:=])((?:\/(?:[A-Za-z0-9._-]+)[^\s"'`<>)\]]*)|(?:[A-Za-z]:[\\/][^\s"'`<>)\]]*)|(?:\.\.\/[^\s"'`<>)\]]*))/g;

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function hasSchemePrefix(value: string, offset: number): boolean {
  const prefix = value.slice(Math.max(0, offset - 12), offset);
  return /[A-Za-z][A-Za-z0-9+.-]:$/.test(prefix);
}

function portablePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function stripLeadingDotSlash(value: string): string {
  return value.replace(/^(?:\.\/)+/, "");
}

export function toProjectRelativePath(root: string, filePath: string): string {
  if (!filePath) return filePath;

  const rootResolved = resolve(root);
  const normalized = portablePath(filePath);
  if (isAbsolute(filePath) || isWindowsAbsolutePath(filePath)) {
    return stripLeadingDotSlash(portablePath(relative(rootResolved, resolve(filePath))));
  }

  return stripLeadingDotSlash(portablePath(normalized));
}

export function projectRootLabel(root: string): string {
  const rel = relative(process.cwd(), resolve(root));
  if (!rel) return ".";
  if (!rel.startsWith("..")) return portablePath(rel);
  return basename(root);
}

function normalizeMaybePath(root: string, value: string | undefined): string | undefined {
  if (!value) return value;
  return toProjectRelativePath(root, value);
}

function normalizeScopePath(root: string, value: string | undefined): string | undefined {
  if (!value) return value;
  const relativePath = toProjectRelativePath(root, value);
  return relativePath.length > 0 ? relativePath : ".";
}

export function makeExtractionPortable(extraction: Extraction, root: string): Extraction {
  return {
    ...extraction,
    nodes: extraction.nodes.map((node) => ({
      ...node,
      source_file: normalizeMaybePath(root, node.source_file) ?? node.source_file,
    })),
    edges: extraction.edges.map((edge) => ({
      ...edge,
      source_file: normalizeMaybePath(root, edge.source_file) ?? edge.source_file,
    })),
    hyperedges: (extraction.hyperedges ?? []).map((hyperedge) => ({
      ...hyperedge,
      source_file: normalizeMaybePath(root, hyperedge.source_file) ?? hyperedge.source_file,
    })),
  };
}

function normalizeFileMap(root: string, files?: Record<string, string[]>): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [kind, values] of Object.entries(files ?? {})) {
    normalized[kind] = values.map((value) => toProjectRelativePath(root, value));
  }
  return normalized;
}

export function makeDetectionPortable(detection: DetectionResult, root: string): DetectionResult {
  return {
    ...detection,
    files: normalizeFileMap(root, detection.files),
    skipped_sensitive: detection.skipped_sensitive.map((value) => toProjectRelativePath(root, value)),
    ...(detection.new_files ? { new_files: normalizeFileMap(root, detection.new_files) } : {}),
    ...(detection.unchanged_files ? { unchanged_files: normalizeFileMap(root, detection.unchanged_files) } : {}),
    ...(detection.deleted_files ? { deleted_files: detection.deleted_files.map((value) => toProjectRelativePath(root, value)) } : {}),
    ...(detection.scope
      ? {
        scope: {
          ...detection.scope,
          root: normalizeScopePath(root, detection.scope.root) ?? detection.scope.root,
          ...(detection.scope.git_root
            ? { git_root: normalizeScopePath(root, detection.scope.git_root) }
            : {}),
        },
      }
      : {}),
  };
}

export function makeGraphPortable<T extends Graph>(graph: T, root: string): T {
  graph.forEachNode((nodeId, attrs) => {
    if (typeof attrs.source_file === "string") {
      graph.setNodeAttribute(nodeId, "source_file", toProjectRelativePath(root, attrs.source_file));
    }
  });
  graph.forEachEdge((edgeId, attrs) => {
    if (typeof attrs.source_file === "string") {
      graph.setEdgeAttribute(edgeId, "source_file", toProjectRelativePath(root, attrs.source_file));
    }
  });
  const hyperedges = graph.getAttribute("hyperedges");
  if (Array.isArray(hyperedges)) {
    graph.setAttribute(
      "hyperedges",
      hyperedges.map((hyperedge) => {
        if (!hyperedge || typeof hyperedge !== "object") return hyperedge;
        const sourceFile = (hyperedge as { source_file?: unknown }).source_file;
        if (typeof sourceFile !== "string") return hyperedge;
        return {
          ...hyperedge,
          source_file: toProjectRelativePath(root, sourceFile),
        };
      }),
    );
  }
  return graph;
}

function isIgnoredLocalArtifact(relativePath: string): boolean {
  return (
    LOCAL_LIFECYCLE_FILES.has(relativePath) ||
    LOCAL_LIFECYCLE_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  );
}

function shouldScanFile(relativePath: string): boolean {
  if (isIgnoredLocalArtifact(relativePath)) return false;
  if (relativePath === "GRAPH_REPORT.md" || relativePath === "graph.json") return true;
  const ext = relativePath.includes(".") ? relativePath.slice(relativePath.lastIndexOf(".")) : "";
  return TEXT_ARTIFACT_EXTENSIONS.has(ext);
}

function pathIssueKind(value: string): PortablePathIssueKind | null {
  if (value.startsWith("../") || value === "..") return "escaped_root_path";
  if (isAbsolute(value) || isWindowsAbsolutePath(value)) return "absolute_path";
  return null;
}

function collectStringIssues(
  value: string,
  path: string,
  jsonPath: string | undefined,
  issues: PortablePathIssue[],
): void {
  const directKind = pathIssueKind(value);
  if (directKind) {
    issues.push({ path, jsonPath, value, kind: directKind });
    return;
  }

  for (const match of value.matchAll(EMBEDDED_PATH_PATTERN)) {
    const candidate = match[2] ?? "";
    if (!candidate || hasSchemePrefix(value, match.index + (match[1]?.length ?? 0))) continue;
    const kind = pathIssueKind(candidate);
    if (kind) {
      issues.push({ path, jsonPath, value: candidate, kind });
    }
  }
}

function collectJsonIssues(
  value: unknown,
  path: string,
  jsonPath: string,
  issues: PortablePathIssue[],
): void {
  if (typeof value === "string") {
    collectStringIssues(value, path, jsonPath, issues);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonIssues(item, path, `${jsonPath}[${index}]`, issues));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectJsonIssues(item, path, jsonPath === "$" ? `$.${key}` : `${jsonPath}.${key}`, issues);
    }
  }
}

function collectTextIssues(content: string, path: string, issues: PortablePathIssue[]): void {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    collectStringIssues(lines[index] ?? "", path, `line:${index + 1}`, issues);
  }
}

function walkFiles(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = resolve(dir, entry.name);
    const relativePath = portablePath(relative(root, absolutePath));
    if (entry.isDirectory()) {
      walkFiles(root, absolutePath, out);
      continue;
    }
    if (entry.isFile()) out.push(relativePath);
  }
}

export function scanPortableGraphifyArtifacts(graphifyDir: string = ".graphify"): PortableCheckResult {
  const root = resolve(graphifyDir);
  const checkedFiles: string[] = [];
  const ignoredLocalFiles: string[] = [];
  const issues: PortablePathIssue[] = [];

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return {
      ok: false,
      checkedFiles,
      ignoredLocalFiles,
      issues: [{ path: portablePath(graphifyDir), value: portablePath(graphifyDir), kind: "absolute_path" }],
    };
  }

  const files: string[] = [];
  walkFiles(root, root, files);
  for (const relativePath of files.sort()) {
    if (isIgnoredLocalArtifact(relativePath)) {
      ignoredLocalFiles.push(relativePath);
      continue;
    }
    if (!shouldScanFile(relativePath)) continue;
    const absolutePath = resolve(root, relativePath);
    const content = readFileSync(absolutePath, "utf-8");
    checkedFiles.push(relativePath);
    if (relativePath.endsWith(".json")) {
      try {
        collectJsonIssues(JSON.parse(content), relativePath, "$", issues);
      } catch {
        collectTextIssues(content, relativePath, issues);
      }
    } else {
      collectTextIssues(content, relativePath, issues);
    }
  }

  return {
    ok: issues.length === 0,
    checkedFiles,
    ignoredLocalFiles,
    issues,
  };
}
