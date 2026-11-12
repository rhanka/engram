/**
 * Lot L2 — Spec Frontmatter, Stored Exact Text, Section Spans, Section Markers & Manifest
 * (§2.2–§2.3, §3.2, §4.1–§4.2, §6.2, `.appctx/DESIGN-NOTE-L2-SCOPE.md`, `.appctx/DESIGN-NOTE-EXTRACTORS-NO-GUESS.md`).
 *
 * Supported subset table (Rule 2 of DESIGN-NOTE-EXTRACTORS-NO-GUESS.md & DESIGN-NOTE-L2-SCOPE.md).
 * Any construct outside this table emits an `unsupported-construct` (or `manifest-outside-checkout` /
 * `target-unresolved` / `target-ambiguous`) diagnostic with `file:line`, and contributes zero edges:
 *
 * | Area | Supported construct | Unsupported / invalid construct (diagnostic, zero edges) |
 * | --- | --- | --- |
 * | Manifest path | Fixed `<checkout>/.engram/spec-map.yaml` with `realpath` inside `<checkout>` `realpath` | Symlink / parent-dir symlink outside checkout or external manifest (`manifest-outside-checkout`, file ignored) |
 * | Manifest YAML | Mapping with optional `version: number` and `entries: SpecMapEntry[]` (`path`, `id?`, `title?`, `status?`, `section?`, `requirement?`, `requirements?`, `supersedes?`, `governs?`, `track?`, `decisions?`) | YAML syntax errors, non-map root/entry, unknown keys, or invalid field types (`unsupported-construct`); escaping `path` (`target-unresolved`) |
 * | Spec frontmatter | Leading `--- ... ---` / `...` YAML mapping (`id?`, `title?`, `status?`, `supersedes?`, `governs?`, `track?`, `decisions?`, `requirements?`) | Malformed YAML inside `--- ... ---` envelope (envelope kept, never re-parsed as Markdown), non-map root, unknown keys, or invalid field types (`unsupported-construct`) |
 * | Section marker | Single-line `<!-- app-context: {yaml flow mapping} -->` on the first non-blank line after a heading, outside code fences | Multi-line marker comments, non-flow-mapping `app-context:` comments, legacy `<!-- governs/requirement/track/decisions: ... -->` comments, misplaced markers, or invalid fields (`unsupported-construct`) |
 * | Code fences & headings | CommonMark line fences (` ``` ` or `~~~`, length >= 3, closed by same char of length >= opener); everything inside fence ignored; heading text unchanged from `extractMarkdown` | Non-fenced heading dropped by `extractMarkdown` due to unbalanced inner backtick fence desynchronization (`unsupported-construct`) |
 * | Requirements | Declared in frontmatter, section marker, or manifest as `{id, section?, statement?}` only; pass 1 collection, pass 2 resolution; referenced by bare `requirement: id` in marker/manifest (never creating a missing Requirement) | Non-string/empty `id` or `section` (`unsupported-construct`); same `id` declared for different sections, conflicting outer/inner `section`, or duplicate declarations (`target-ambiguous`, no `Requirement` node, no edge); unresolved `section` or bare `requirement: id` reference (`target-unresolved`) |
 * | Markdown links | Ignored (no `cites`, `governs`, or `refines` edges from links) | N/A |
 * | Target selectors | Shorthand strings or objects for `component`, `route` (`sveltekit\|hash\|pathname`), `endpoint`, `entity` (`postgres\|mysql\|sqlite`), `field`, `symbol` | Unknown selector kind, unknown selector key, conflicting/invalid selector aliases, invalid `routerKind`/`dialect`, or missing required selector field (`target-unresolved`, zero edges from declaration) |
 */

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { isAlias, isMap, isPair, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

import { extractMarkdown } from "../extract.js";
import { canonicalBytes } from "../ontology-guardian/canonical.js";
import type { Extraction, GraphEdge, GraphNode, OntologyCitation, OntologyEvidenceRecord, OntologyStatus } from "../types.js";
import { appContextNodeId } from "./node-id.js";
import type {
  AppContextCitation,
  AppContextDataDialect,
  AppContextDiagnostic,
  AppContextDiagnosticCandidate,
  AppContextDiagnosticCode,
  AppContextFileCitation,
  AppContextRelationRecord,
  AppContextRouterKind,
  TargetSelector,
} from "./types.js";

export type SpecStatus = "draft" | "active" | "superseded" | "evol";

const VALID_SPEC_STATUSES = new Set<SpecStatus>(["draft", "active", "superseded", "evol"]);
const VALID_ROUTER_KINDS = new Set<AppContextRouterKind>(["sveltekit", "hash", "pathname"]);
const VALID_DIALECTS = new Set<AppContextDataDialect>(["postgres", "mysql", "sqlite"]);

const FRONTMATTER_KEYS = new Set(["id", "title", "status", "supersedes", "governs", "track", "decisions", "requirements"]);
const MARKER_KEYS = new Set(["governs", "track", "decisions", "requirement", "requirements"]);
const MANIFEST_ROOT_KEYS = new Set(["version", "entries"]);
const MANIFEST_ENTRY_KEYS = new Set([
  "path", "id", "title", "status", "section", "requirement", "requirements", "supersedes", "governs", "track", "decisions",
]);
const REQUIREMENT_OBJ_KEYS = new Set(["id", "section", "statement"]);
const COMPONENT_SELECTOR_KEYS = new Set(["kind", "file", "exportName", "export_name"]);
const ROUTE_SELECTOR_KEYS = new Set(["kind", "pattern", "routerKind", "router_kind"]);
const ENDPOINT_SELECTOR_KEYS = new Set(["kind", "method", "pathTemplate", "path_template", "path"]);
const ENTITY_SELECTOR_KEYS = new Set(["kind", "name", "schema", "dialect"]);
const FIELD_SELECTOR_KEYS = new Set(["kind", "entity", "field", "name", "schema", "dialect"]);
const SYMBOL_SELECTOR_KEYS = new Set(["kind", "file", "symbolName", "symbol_name", "name"]);
const MANIFEST_REL_PATH = ".engram/spec-map.yaml";

export interface SpecRequirementDeclarationInput {
  id: string;
  section?: string;
  statement?: string;
  startLine?: number;
  endLine?: number;
}

export interface SpecFrontmatter {
  id?: string;
  title?: string;
  status?: SpecStatus;
  supersedes?: string[];
  governs?: TargetSelector[];
  track?: string[];
  decisions?: string[];
  requirements?: SpecRequirementDeclarationInput[];
}

export interface DeclarationDiagnosticInfo {
  code: AppContextDiagnosticCode;
  reason: string;
  selectorKey: string;
  line: number;
}

export interface SpecMapEntry {
  path: string;
  id?: string;
  title?: string;
  status?: SpecStatus;
  section?: string;
  requirement?: string | SpecRequirementDeclarationInput;
  requirements?: SpecRequirementDeclarationInput[];
  supersedes?: string[];
  governs?: TargetSelector[];
  track?: string[];
  decisions?: string[];
  startLine: number;
  endLine: number;
}

export interface SpecMapManifest {
  version?: number;
  entries: SpecMapEntry[];
}

export interface ExtractSpecsOptions {
  rootDir: string;
  repoKey: string;
  commit: string;
  include?: string[];
  exclude?: string[];
  specFiles?: string[];
  knownNodes?: readonly GraphNode[];
  knownEvidence?: readonly OntologyEvidenceRecord[];
  knownExtraction?: Pick<Extraction, "nodes" | "evidence">;
  baseMarkdownByFile?: ReadonlyMap<string, Awaited<ReturnType<typeof extractMarkdown>>>;
}

export interface SpecExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: OntologyEvidenceRecord[];
  relations: AppContextRelationRecord[];
  diagnostics: AppContextDiagnostic[];
  extraction: Extraction;
}

type Resolution3<T> =
  | { status: "missing" }
  | { status: "unique"; value: T }
  | { status: "ambiguous"; candidates: AppContextDiagnosticCandidate[] };

type LineSpan = { startLine: number; endLine: number };

function normalizeRelPosix(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\/+/u, "");
}

function tryRealpath(targetPath: string): string | null {
  try {
    return realpathSync(targetPath);
  } catch {
    return null;
  }
}

function isConfinedRelativePosix(relPosix: string): boolean {
  return Boolean(relPosix && relPosix !== "." && relPosix !== ".." && !relPosix.startsWith("../") && !relPosix.startsWith("/"));
}

/** Validates checkout confinement, zero symlinks, regular file, and `.md` extension (§4.2, M1, r2). */
function validateCheckoutMarkdownPath(
  rootDir: string,
  rawPath: string,
  allowAbsoluteInsideRoot: boolean,
): { ok: true; repoRelPath: string } | { ok: false; reason: string } {
  const trimmed = rawPath.trim();
  if (!trimmed) return { ok: false, reason: "Empty spec path" };
  const slashNormalized = trimmed.replace(/\\/gu, "/");
  if (!allowAbsoluteInsideRoot && (isAbsolute(trimmed) || slashNormalized.startsWith("/"))) {
    return { ok: false, reason: `Spec path '${rawPath}' must be relative to checkout root` };
  }
  const absRoot = resolve(rootDir);
  const absCandidate = isAbsolute(trimmed) ? resolve(trimmed) : resolve(absRoot, trimmed);
  const relOs = relative(absRoot, absCandidate);
  if (isAbsolute(relOs)) return { ok: false, reason: `Spec path '${rawPath}' escapes checkout root` };
  const relPosix = relOs.split(sep).join("/").replace(/\\/gu, "/");
  if (!isConfinedRelativePosix(relPosix)) return { ok: false, reason: `Spec path '${rawPath}' escapes checkout root` };
  if (extname(relPosix).toLowerCase() !== ".md") return { ok: false, reason: `Spec path '${rawPath}' is not a Markdown (.md) file` };

  const segments = relPosix.split("/");
  let cur = absRoot;
  for (let i = 0; i < segments.length; i++) {
    cur = resolve(cur, segments[i]!);
    let stat;
    try {
      stat = lstatSync(cur);
    } catch {
      return { ok: false, reason: `Spec file '${rawPath}' does not exist` };
    }
    if (stat.isSymbolicLink()) return { ok: false, reason: `Spec path '${rawPath}' traverses a symbolic link` };
    if (i === segments.length - 1 && !stat.isFile()) return { ok: false, reason: `Spec path '${rawPath}' is not a regular file` };
  }

  const realRoot = tryRealpath(absRoot);
  const realCandidate = tryRealpath(absCandidate);
  if (realRoot && realCandidate) {
    const realRel = relative(realRoot, realCandidate).split(sep).join("/").replace(/\\/gu, "/");
    if (isAbsolute(realRel) || !isConfinedRelativePosix(realRel)) {
      return { ok: false, reason: `Spec path '${rawPath}' resolves outside checkout root` };
    }
  }
  return { ok: true, repoRelPath: relPosix };
}

/** Validates `<checkout>/.engram/spec-map.yaml` realpath confinement (Rule 1, R1). */
function checkCheckoutManifest(
  rootDir: string,
  rawOptions: Record<string, unknown>,
): { status: "absent" } | { status: "outside"; reason: string } | { status: "ok"; absPath: string } {
  if ("specMapPath" in rawOptions && rawOptions.specMapPath !== undefined) {
    return {
      status: "outside",
      reason: `External specMapPath '${String(rawOptions.specMapPath)}' is not allowed; manifest must be at '${MANIFEST_REL_PATH}' inside checkout`,
    };
  }
  const absRoot = resolve(rootDir);
  const engramDir = resolve(absRoot, ".engram");
  const manifestAbs = resolve(engramDir, "spec-map.yaml");

  let engramStat;
  try {
    engramStat = lstatSync(engramDir);
  } catch {
    return { status: "absent" };
  }
  const realRoot = tryRealpath(absRoot);
  if (engramStat.isSymbolicLink()) {
    const realEngram = tryRealpath(engramDir);
    if (!realRoot || !realEngram) return { status: "outside", reason: "Manifest parent directory '.engram' is an unresolvable symlink" };
    const relEngram = relative(realRoot, realEngram).split(sep).join("/").replace(/\\/gu, "/");
    if (isAbsolute(relEngram) || !isConfinedRelativePosix(relEngram)) {
      return { status: "outside", reason: "Manifest parent directory '.engram' resolves outside checkout root" };
    }
  }

  let manifestStat;
  try {
    manifestStat = lstatSync(manifestAbs);
  } catch {
    return { status: "absent" };
  }
  const realManifest = tryRealpath(manifestAbs);
  if (!realRoot || !realManifest) return { status: "outside", reason: `Manifest '${MANIFEST_REL_PATH}' cannot be resolved inside checkout root` };
  const relManifest = relative(realRoot, realManifest).split(sep).join("/").replace(/\\/gu, "/");
  if (isAbsolute(relManifest) || !isConfinedRelativePosix(relManifest)) {
    return { status: "outside", reason: `Manifest '${MANIFEST_REL_PATH}' resolves outside checkout root` };
  }
  if (!manifestStat.isFile() && !manifestStat.isSymbolicLink()) {
    return { status: "outside", reason: `Manifest '${MANIFEST_REL_PATH}' is not a regular file` };
  }
  return { status: "ok", absPath: realManifest };
}

export function splitLogicalLines(content: string): string[] {
  return content.length === 0 ? [""] : content.replace(/\r?\n$/u, "").split(/\r?\n/u);
}

export function sliceSpecLines(content: string, startLine: number, endLine: number): string {
  const lines = splitLogicalLines(content);
  const clampedStart = Math.max(1, Math.min(startLine, lines.length));
  const clampedEnd = Math.max(clampedStart, Math.min(endLine, lines.length));
  return lines.slice(clampedStart - 1, clampedEnd).join("\n");
}

export function slugifyHeading(heading: string): string {
  const normalized = heading.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized || "section";
}

function globToRegExp(globPattern: string): RegExp {
  const normalized = normalizeRelPosix(globPattern.trim()).replace(/^\/+/u, "");
  let regexStr = "^";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        if (normalized[i + 2] === "/") { regexStr += "(?:.+/)?"; i += 2; }
        else { regexStr += ".*"; i += 1; }
      } else regexStr += "[^/]*";
    } else if (ch === "?") regexStr += "[^/]";
    else regexStr += "+.^$()[]{}|\\".includes(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`${regexStr}$`, "u");
}

function walkMarkdownFiles(rootDir: string): string[] {
  const results: string[] = [];
  const absRoot = resolve(rootDir);
  function visit(currentDir: string): void {
    let entries: string[];
    try { entries = readdirSync(currentDir).sort(); } catch { return; }
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules" || entry === ".graphify") continue;
      const fullPath = resolve(currentDir, entry);
      let stat;
      try { stat = lstatSync(fullPath); } catch { continue; }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(fullPath);
      else if (stat.isFile() && extname(entry).toLowerCase() === ".md") {
        const rel = relative(absRoot, fullPath).split(sep).join("/").replace(/\\/gu, "/");
        if (isConfinedRelativePosix(rel)) results.push(rel);
      }
    }
  }
  visit(absRoot);
  return results.sort();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseStrictStringArray(value: unknown): { ok: true; values: string[] } | { ok: false } {
  if (typeof value === "string") {
    const s = value.trim();
    return s.length > 0 ? { ok: true, values: [s] } : { ok: false };
  }
  if (!Array.isArray(value)) return { ok: false };
  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) return { ok: false };
    values.push(item.trim());
  }
  return { ok: true, values };
}

export function diagnosticSelectorKey(components: readonly unknown[]): string {
  return canonicalBytes(components);
}

export function selectorKeyForTarget(selector: TargetSelector): string {
  switch (selector.kind) {
    case "component": return diagnosticSelectorKey(["Component", normalizeRelPosix(selector.file), selector.exportName ?? "default"]);
    case "route": return diagnosticSelectorKey(["Route", selector.routerKind ?? null, selector.pattern]);
    case "endpoint": return diagnosticSelectorKey(["ApiEndpoint", selector.method.toUpperCase(), selector.pathTemplate]);
    case "entity": return diagnosticSelectorKey(["DataEntity", selector.dialect ?? null, selector.schema ?? null, selector.name]);
    case "field": return diagnosticSelectorKey(["DataField", selector.dialect ?? null, selector.schema ?? null, selector.entity, selector.field]);
    case "symbol": return diagnosticSelectorKey(["CodeSymbol", normalizeRelPosix(selector.file), selector.symbolName]);
  }
}

export type ParsedTargetSelectorResult =
  | { ok: true; selector: TargetSelector }
  | { ok: false; reason: string; selectorKey: string };

function findUnknownSelectorKey(obj: Record<string, unknown>, allowedKeys: ReadonlySet<string>): string | null {
  for (const k of Object.keys(obj)) {
    if (!allowedKeys.has(k)) return k;
  }
  return null;
}

function readAliasedSelectorString(
  obj: Record<string, unknown>,
  aliasKeys: readonly string[],
  required: boolean,
  allowedValues?: ReadonlySet<string>,
): { ok: true; value?: string } | { ok: false; reason: string } {
  const presentValues: string[] = [];
  for (const k of aliasKeys) {
    if (k in obj) {
      const v = asNonEmptyString(obj[k]);
      if (!v || (allowedValues && !allowedValues.has(v))) {
        return { ok: false, reason: `Selector has invalid '${k}' value '${String(obj[k])}'` };
      }
      presentValues.push(v);
    }
  }
  if (presentValues.length === 0) {
    return required ? { ok: false, reason: `Selector is missing required '${aliasKeys[0]!}'` } : { ok: true };
  }
  if (new Set(presentValues).size > 1) {
    return { ok: false, reason: `Selector has conflicting aliases for '${aliasKeys[0]!}'` };
  }
  return { ok: true, value: presentValues[0]! };
}

function parseOptionalSchemaAndDialect(
  obj: Record<string, unknown>,
  kindLabel: "Entity" | "Field",
): { ok: true; schema?: string; dialect?: AppContextDataDialect } | { ok: false; reason: string } {
  const schemaRes = readAliasedSelectorString(obj, ["schema"], false);
  if (!schemaRes.ok) return { ok: false, reason: `${kindLabel} selector has invalid 'schema'` };
  const dialectRes = readAliasedSelectorString(obj, ["dialect"], false, VALID_DIALECTS);
  if (!dialectRes.ok) return { ok: false, reason: `${kindLabel} selector has invalid dialect '${String(obj.dialect)}'` };
  return {
    ok: true,
    ...(schemaRes.value ? { schema: schemaRes.value } : {}),
    ...(dialectRes.value ? { dialect: dialectRes.value as AppContextDataDialect } : {}),
  };
}

export function parseTargetSelectorDetailed(raw: unknown): ParsedTargetSelectorResult {
  const invalid = (reason: string, tuple: readonly unknown[]): ParsedTargetSelectorResult => ({
    ok: false, reason, selectorKey: diagnosticSelectorKey(["InvalidSelector", ...tuple]),
  });

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx <= 0) return invalid(`Invalid target selector '${trimmed}'`, ["string", trimmed]);
    const kind = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (!rest) return invalid(`Empty target selector body in '${trimmed}'`, ["string", trimmed]);

    if (kind === "component") {
      const hashIdx = rest.indexOf("#");
      const file = normalizeRelPosix(hashIdx >= 0 ? rest.slice(0, hashIdx).trim() : rest);
      const exportName = hashIdx >= 0 ? rest.slice(hashIdx + 1).trim() : "default";
      if (!file || !exportName) return invalid(`Invalid component selector '${trimmed}'`, ["component", trimmed]);
      return { ok: true, selector: { kind: "component", file, exportName } };
    }
    if (kind === "route") {
      const secondColon = rest.indexOf(":");
      if (secondColon > 0) {
        const prefix = rest.slice(0, secondColon).trim();
        const candidatePattern = rest.slice(secondColon + 1).trim();
        if (!prefix.startsWith("/") && !prefix.startsWith("#")) {
          if (!VALID_ROUTER_KINDS.has(prefix as AppContextRouterKind) || !candidatePattern) {
            return invalid(`Invalid route selector '${trimmed}': invalid routerKind '${prefix}'`, ["route", prefix, candidatePattern]);
          }
          return { ok: true, selector: { kind: "route", routerKind: prefix as AppContextRouterKind, pattern: candidatePattern } };
        }
      }
      return { ok: true, selector: { kind: "route", pattern: rest } };
    }
    if (kind === "endpoint") {
      const m = /^([A-Za-z]+)(?:\s+|:)(.+)$/u.exec(rest);
      const pathTemplate = m?.[2]?.trim() ?? "";
      if (!m || !pathTemplate) return invalid(`Invalid endpoint selector '${trimmed}'`, ["endpoint", trimmed]);
      return { ok: true, selector: { kind: "endpoint", method: m[1]!.toUpperCase(), pathTemplate } };
    }
    if (kind === "entity") {
      const parts = rest.split(/[.:]/u).map((p) => p.trim());
      if (parts.some((p) => p.length === 0) || parts.length > 3) return invalid(`Invalid entity selector '${trimmed}'`, ["entity", trimmed]);
      if (parts.length === 1) return { ok: true, selector: { kind: "entity", name: parts[0]! } };
      if (parts.length === 2) return { ok: true, selector: { kind: "entity", schema: parts[0]!, name: parts[1]! } };
      if (!VALID_DIALECTS.has(parts[0] as AppContextDataDialect)) return invalid(`Invalid entity dialect '${parts[0]}' in '${trimmed}'`, ["entity", ...parts]);
      return { ok: true, selector: { kind: "entity", dialect: parts[0] as AppContextDataDialect, schema: parts[1]!, name: parts[2]! } };
    }
    if (kind === "field") {
      const parts = rest.split(/[.:#]/u).map((p) => p.trim());
      if (parts.some((p) => p.length === 0) || parts.length < 2 || parts.length > 4) return invalid(`Invalid field selector '${trimmed}'`, ["field", trimmed]);
      if (parts.length === 2) return { ok: true, selector: { kind: "field", entity: parts[0]!, field: parts[1]! } };
      if (parts.length === 3) return { ok: true, selector: { kind: "field", schema: parts[0]!, entity: parts[1]!, field: parts[2]! } };
      if (!VALID_DIALECTS.has(parts[0] as AppContextDataDialect)) return invalid(`Invalid field dialect '${parts[0]}' in '${trimmed}'`, ["field", ...parts]);
      return { ok: true, selector: { kind: "field", dialect: parts[0] as AppContextDataDialect, schema: parts[1]!, entity: parts[2]!, field: parts[3]! } };
    }
    if (kind === "symbol") {
      const sepIdx = rest.indexOf("#") >= 0 ? rest.indexOf("#") : rest.lastIndexOf(":");
      const file = sepIdx > 0 ? normalizeRelPosix(rest.slice(0, sepIdx).trim()) : "";
      const symbolName = sepIdx > 0 ? rest.slice(sepIdx + 1).trim() : "";
      if (!file || !symbolName) return invalid(`Invalid symbol selector '${trimmed}'`, ["symbol", trimmed]);
      return { ok: true, selector: { kind: "symbol", file, symbolName } };
    }
    return invalid(`Unknown target selector kind '${kind}'`, ["unknown-kind", trimmed]);
  }

  const obj = asRecord(raw);
  if (!obj) return invalid("Target selector must be a string or object", ["non-object", String(raw)]);
  const kind = asNonEmptyString(obj.kind)?.toLowerCase();
  if (!kind) return invalid("Target selector object is missing 'kind'", ["missing-kind", obj]);

  if (kind === "component") {
    const unknownKey = findUnknownSelectorKey(obj, COMPONENT_SELECTOR_KEYS);
    if (unknownKey) return invalid(`Unsupported key '${unknownKey}' in component selector`, ["component", obj]);
    const fileRes = readAliasedSelectorString(obj, ["file"], true);
    if (!fileRes.ok) return invalid(fileRes.reason, ["component", obj]);
    const exportRes = readAliasedSelectorString(obj, ["exportName", "export_name"], false);
    if (!exportRes.ok) return invalid(exportRes.reason, ["component", obj]);
    return { ok: true, selector: { kind: "component", file: normalizeRelPosix(fileRes.value!), exportName: exportRes.value ?? "default" } };
  }
  if (kind === "route") {
    const unknownKey = findUnknownSelectorKey(obj, ROUTE_SELECTOR_KEYS);
    if (unknownKey) return invalid(`Unsupported key '${unknownKey}' in route selector`, ["route", obj]);
    const patternRes = readAliasedSelectorString(obj, ["pattern"], true);
    if (!patternRes.ok) return invalid(patternRes.reason, ["route", obj]);
    const rkRes = readAliasedSelectorString(obj, ["routerKind", "router_kind"], false, VALID_ROUTER_KINDS);
    if (!rkRes.ok) return invalid(rkRes.reason, ["route", obj]);
    return {
      ok: true,
      selector: {
        kind: "route",
        ...(rkRes.value ? { routerKind: rkRes.value as AppContextRouterKind } : {}),
        pattern: patternRes.value!,
      },
    };
  }
  if (kind === "endpoint") {
    const unknownKey = findUnknownSelectorKey(obj, ENDPOINT_SELECTOR_KEYS);
    if (unknownKey) return invalid(`Unsupported key '${unknownKey}' in endpoint selector`, ["endpoint", obj]);
    const methodRes = readAliasedSelectorString(obj, ["method"], true);
    const pathRes = readAliasedSelectorString(obj, ["pathTemplate", "path_template", "path"], true);
    if (!methodRes.ok || !pathRes.ok) return invalid("Endpoint selector requires valid 'method' and 'pathTemplate'", ["endpoint", obj]);
    return { ok: true, selector: { kind: "endpoint", method: methodRes.value!.toUpperCase(), pathTemplate: pathRes.value! } };
  }
  if (kind === "entity") {
    const unknownKey = findUnknownSelectorKey(obj, ENTITY_SELECTOR_KEYS);
    if (unknownKey) return invalid(`Unsupported key '${unknownKey}' in entity selector`, ["entity", obj]);
    const nameRes = readAliasedSelectorString(obj, ["name"], true);
    if (!nameRes.ok) return invalid(nameRes.reason, ["entity", obj]);
    const sd = parseOptionalSchemaAndDialect(obj, "Entity");
    if (!sd.ok) return invalid(sd.reason, ["entity", obj]);
    return { ok: true, selector: { kind: "entity", name: nameRes.value!, ...(sd.schema ? { schema: sd.schema } : {}), ...(sd.dialect ? { dialect: sd.dialect } : {}) } };
  }
  if (kind === "field") {
    const unknownKey = findUnknownSelectorKey(obj, FIELD_SELECTOR_KEYS);
    if (unknownKey) return invalid(`Unsupported key '${unknownKey}' in field selector`, ["field", obj]);
    const entityRes = readAliasedSelectorString(obj, ["entity"], true);
    const fieldRes = readAliasedSelectorString(obj, ["field", "name"], true);
    if (!entityRes.ok || !fieldRes.ok) return invalid("Field selector requires valid 'entity' and 'field'", ["field", obj]);
    const sd = parseOptionalSchemaAndDialect(obj, "Field");
    if (!sd.ok) return invalid(sd.reason, ["field", obj]);
    return { ok: true, selector: { kind: "field", entity: entityRes.value!, field: fieldRes.value!, ...(sd.schema ? { schema: sd.schema } : {}), ...(sd.dialect ? { dialect: sd.dialect } : {}) } };
  }
  if (kind === "symbol") {
    const unknownKey = findUnknownSelectorKey(obj, SYMBOL_SELECTOR_KEYS);
    if (unknownKey) return invalid(`Unsupported key '${unknownKey}' in symbol selector`, ["symbol", obj]);
    const fileRes = readAliasedSelectorString(obj, ["file"], true);
    const symRes = readAliasedSelectorString(obj, ["symbolName", "symbol_name", "name"], true);
    if (!fileRes.ok || !symRes.ok) return invalid("Symbol selector requires valid 'file' and 'symbolName'", ["symbol", obj]);
    return { ok: true, selector: { kind: "symbol", file: normalizeRelPosix(fileRes.value!), symbolName: symRes.value! } };
  }
  return invalid(`Unknown target selector kind '${kind}'`, ["unknown-kind", obj]);
}

export function parseTargetSelector(raw: unknown): TargetSelector | null {
  const res = parseTargetSelectorDetailed(raw);
  return res.ok ? res.selector : null;
}

function parseSpecStatus(raw: unknown): SpecStatus | undefined {
  const s = asNonEmptyString(raw)?.toLowerCase() as SpecStatus | undefined;
  return s && VALID_SPEC_STATUSES.has(s) ? s : undefined;
}

function offsetToLine(rawYaml: string, lineCounter: LineCounter, offset: number, lineOffset: number): number {
  if (rawYaml.length === 0) return 1 + lineOffset;
  let clamped = Math.max(0, Math.min(offset, rawYaml.length - 1));
  while (clamped > 0 && /[\r\n]/u.test(rawYaml[clamped]!)) clamped -= 1;
  return lineCounter.linePos(clamped).line + lineOffset;
}

function offsetRangeToLineSpan(
  rawYaml: string,
  lineCounter: LineCounter,
  range: readonly [number, number, number?] | null | undefined,
  lineOffset: number = 0,
): LineSpan {
  if (!range || rawYaml.length === 0) return { startLine: 1 + lineOffset, endLine: 1 + lineOffset };
  const startOffset = Math.max(0, Math.min(range[0], rawYaml.length - 1));
  let endOffset = Math.max(startOffset, Math.min(range[1], rawYaml.length));
  while (endOffset > startOffset && /[\r\n\t ]/u.test(rawYaml[endOffset - 1]!)) endOffset -= 1;
  const lastCharOffset = Math.max(startOffset, endOffset - 1);
  const startLine = lineCounter.linePos(startOffset).line + lineOffset;
  const endLine = Math.max(startLine, lineCounter.linePos(lastCharOffset).line + lineOffset);
  return { startLine, endLine };
}

function makeUnsupportedDiag(sourceTag: string, subKey: string, reason: string, line: number): DeclarationDiagnosticInfo {
  return { code: "unsupported-construct", reason, selectorKey: diagnosticSelectorKey(["UnsupportedConstruct", sourceTag, subKey, line]), line };
}

function findFirstAliasNode(node: unknown): { range?: [number, number, number?] } | null {
  if (!node || typeof node !== "object") return null;
  if (isAlias(node)) return node as { range?: [number, number, number?] };
  if (isPair(node)) return findFirstAliasNode(node.key) ?? findFirstAliasNode(node.value);
  if (isMap(node) || isSeq(node)) {
    for (const item of node.items) {
      const found = findFirstAliasNode(item);
      if (found) return found;
    }
  }
  return null;
}

function safeNodeToJs(
  node: { toJS: (doc: ReturnType<typeof parseDocument>) => unknown },
  doc: ReturnType<typeof parseDocument>,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: node.toJS(doc) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function parseTargetSelectorListWithAst(
  rawYaml: string,
  lineCounter: LineCounter,
  governsNode: unknown,
  rawJsValue: unknown,
  lineOffset: number,
  fallbackLine: number,
): { valid: TargetSelector[]; diagnostics: DeclarationDiagnosticInfo[] } {
  const valid: TargetSelector[] = [];
  const diagnostics: DeclarationDiagnosticInfo[] = [];
  if (isSeq(governsNode) && Array.isArray(rawJsValue)) {
    for (let idx = 0; idx < rawJsValue.length; idx++) {
      const itemNode = governsNode.items[idx] as { range?: [number, number, number?] } | undefined;
      const itemLine = itemNode?.range ? offsetRangeToLineSpan(rawYaml, lineCounter, itemNode.range, lineOffset).startLine : fallbackLine;
      const res = parseTargetSelectorDetailed(rawJsValue[idx]);
      if (res.ok) valid.push(res.selector);
      else diagnostics.push({ code: "target-unresolved", reason: res.reason, selectorKey: res.selectorKey, line: itemLine });
    }
    return { valid, diagnostics };
  }
  if (typeof rawJsValue === "string" || (typeof rawJsValue === "object" && rawJsValue !== null && !Array.isArray(rawJsValue))) {
    const res = parseTargetSelectorDetailed(rawJsValue);
    if (res.ok) valid.push(res.selector);
    else diagnostics.push({ code: "target-unresolved", reason: res.reason, selectorKey: res.selectorKey, line: fallbackLine });
    return { valid, diagnostics };
  }
  diagnostics.push(makeUnsupportedDiag("governs", "governs-non-seq", "Invalid 'governs' value: expected sequence of target selectors", fallbackLine));
  return { valid, diagnostics };
}

function parseRequirementObjectAst(
  rawYaml: string,
  lineCounter: LineCounter,
  node: unknown,
  doc: ReturnType<typeof parseDocument>,
  lineOffset: number,
  fallbackLine: number,
  sourceTag: string,
): { ok: true; value: SpecRequirementDeclarationInput } | { ok: false; diag: DeclarationDiagnosticInfo } {
  const span = (node as { range?: [number, number, number?] } | null)?.range
    ? offsetRangeToLineSpan(rawYaml, lineCounter, (node as { range: [number, number, number?] }).range, lineOffset)
    : { startLine: fallbackLine, endLine: fallbackLine };
  if (!isMap(node)) {
    return { ok: false, diag: makeUnsupportedDiag(sourceTag, "requirement-non-map", "Requirement declaration must be a mapping {id, section?, statement?}", span.startLine) };
  }
  const aliasNode = findFirstAliasNode(node);
  if (aliasNode) {
    const aliasLine = aliasNode.range ? offsetRangeToLineSpan(rawYaml, lineCounter, aliasNode.range, lineOffset).startLine : span.startLine;
    return { ok: false, diag: makeUnsupportedDiag(sourceTag, "req-alias", "YAML aliases are not supported in requirement declaration", aliasLine) };
  }
  const pairKeyLines: Record<string, number> = {};
  for (const pair of node.items) {
    if (!isPair(pair) || !isScalar(pair.key) || typeof pair.key.value !== "string") {
      return { ok: false, diag: makeUnsupportedDiag(sourceTag, "req-key", "Invalid key in requirement declaration", span.startLine) };
    }
    const k = pair.key.value;
    const kLine = offsetRangeToLineSpan(rawYaml, lineCounter, pair.key.range, lineOffset).startLine;
    pairKeyLines[k] = kLine;
    if (!REQUIREMENT_OBJ_KEYS.has(k)) {
      return { ok: false, diag: makeUnsupportedDiag(sourceTag, `req-unknown-${k}`, `Unsupported key '${k}' in requirement declaration`, kLine) };
    }
  }
  const jsRes = safeNodeToJs(node, doc);
  if (!jsRes.ok) {
    return { ok: false, diag: makeUnsupportedDiag(sourceTag, "req-convert", jsRes.message, span.startLine) };
  }
  const jsObj = asRecord(jsRes.value);
  const id = asNonEmptyString(jsObj?.id);
  if (!jsObj || !id) {
    return { ok: false, diag: makeUnsupportedDiag(sourceTag, "req-id", "Requirement declaration requires a non-empty string 'id'", pairKeyLines.id ?? span.startLine) };
  }
  let section: string | undefined;
  if ("section" in jsObj) {
    section = asNonEmptyString(jsObj.section);
    if (!section) return { ok: false, diag: makeUnsupportedDiag(sourceTag, `req-section-${id}`, "Requirement 'section' must be a non-empty string", pairKeyLines.section ?? span.startLine) };
  }
  let statement: string | undefined;
  if ("statement" in jsObj) {
    if (typeof jsObj.statement !== "string") {
      return { ok: false, diag: makeUnsupportedDiag(sourceTag, `req-statement-${id}`, "Requirement 'statement' must be a string", pairKeyLines.statement ?? span.startLine) };
    }
    statement = jsObj.statement.trim();
  }
  return { ok: true, value: { id, ...(section ? { section } : {}), ...(statement ? { statement } : {}), startLine: span.startLine, endLine: span.endLine } };
}

function parseRequirementsSeqAst(
  rawYaml: string,
  lineCounter: LineCounter,
  seqNode: unknown,
  doc: ReturnType<typeof parseDocument>,
  lineOffset: number,
  fallbackLine: number,
  sourceTag: string,
): { ok: true; values: SpecRequirementDeclarationInput[] } | { ok: false; diagnostics: DeclarationDiagnosticInfo[] } {
  if (!isSeq(seqNode)) {
    return { ok: false, diagnostics: [makeUnsupportedDiag(sourceTag, "requirements-non-seq", "'requirements' must be a sequence of {id, section?, statement?} objects", fallbackLine)] };
  }
  const values: SpecRequirementDeclarationInput[] = [];
  const diagnostics: DeclarationDiagnosticInfo[] = [];
  for (const itemNode of seqNode.items) {
    const res = parseRequirementObjectAst(rawYaml, lineCounter, itemNode, doc, lineOffset, fallbackLine, sourceTag);
    if (res.ok) values.push(res.value);
    else diagnostics.push(res.diag);
  }
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, values };
}

interface ParsedDeclarationFields {
  path?: string;
  id?: string;
  title?: string;
  status?: SpecStatus;
  section?: string;
  requirement?: string | SpecRequirementDeclarationInput;
  requirements: SpecRequirementDeclarationInput[];
  supersedes: string[];
  governs: TargetSelector[];
  track: string[];
  decisions: string[];
}

/** Shared AST-backed validator for frontmatter, section markers, and manifest entries (Rule 2, Rule 6, Rule 7, R2, r1, B1, M2, m1). */
function parseDeclarationMapAst(params: {
  rawYaml: string;
  lineCounter: LineCounter;
  mapNode: ReturnType<typeof parseDocument>["contents"];
  doc: ReturnType<typeof parseDocument>;
  allowedKeys: ReadonlySet<string>;
  lineOffset: number;
  fallbackLine: number;
  sourceTag: string;
  requirePath?: boolean;
}): { ok: boolean; fields: ParsedDeclarationFields; keyLines: Record<string, LineSpan>; diagnostics: DeclarationDiagnosticInfo[] } {
  const { rawYaml, lineCounter, mapNode, doc, allowedKeys, lineOffset, fallbackLine, sourceTag } = params;
  const diagnostics: DeclarationDiagnosticInfo[] = [];
  const keyLines: Record<string, LineSpan> = {};
  const emptyFields: ParsedDeclarationFields = { requirements: [], supersedes: [], governs: [], track: [], decisions: [] };

  if (!isMap(mapNode)) {
    diagnostics.push(makeUnsupportedDiag(sourceTag, "non-map", `Declaration in '${sourceTag}' must be a YAML mapping`, fallbackLine));
    return { ok: false, fields: emptyFields, keyLines, diagnostics };
  }

  let governsAstNode: unknown;
  let reqAstNode: unknown;
  let reqsAstNode: unknown;

  for (const pair of mapNode.items) {
    if (!isPair(pair) || !isScalar(pair.key) || typeof pair.key.value !== "string") {
      diagnostics.push(makeUnsupportedDiag(sourceTag, "invalid-key", `Invalid key in '${sourceTag}'`, fallbackLine));
      continue;
    }
    const k = pair.key.value;
    const keyRange = pair.key.range;
    const valRange = (pair.value as { range?: [number, number, number?] } | null)?.range;
    const startOffset = keyRange?.[0] ?? 0;
    const endOffset = valRange?.[1] ?? keyRange?.[1] ?? startOffset;
    const span = offsetRangeToLineSpan(rawYaml, lineCounter, [startOffset, endOffset], lineOffset);
    keyLines[k] = span;
    if (!allowedKeys.has(k)) {
      diagnostics.push(makeUnsupportedDiag(sourceTag, `unknown-key-${k}`, `Unsupported key '${k}' in '${sourceTag}'`, span.startLine));
    }
    if (k === "governs") governsAstNode = pair.value;
    if (k === "requirement") reqAstNode = pair.value;
    if (k === "requirements") reqsAstNode = pair.value;
  }

  const aliasNode = findFirstAliasNode(mapNode);
  if (aliasNode) {
    const aliasLine = aliasNode.range ? offsetRangeToLineSpan(rawYaml, lineCounter, aliasNode.range, lineOffset).startLine : fallbackLine;
    diagnostics.push(makeUnsupportedDiag(sourceTag, "yaml-alias", `Unsupported YAML alias in '${sourceTag}'`, aliasLine));
    return { ok: false, fields: emptyFields, keyLines, diagnostics };
  }

  const jsRes = safeNodeToJs(mapNode, doc);
  if (!jsRes.ok) {
    diagnostics.push(makeUnsupportedDiag(sourceTag, "yaml-convert", jsRes.message, fallbackLine));
    return { ok: false, fields: emptyFields, keyLines, diagnostics };
  }
  const item = asRecord(jsRes.value) ?? {};
  const lineOf = (k: string): number => keyLines[k]?.startLine ?? fallbackLine;

  let pathVal: string | undefined;
  if (params.requirePath) {
    pathVal = asNonEmptyString(item.path);
    if (!pathVal) {
      diagnostics.push(makeUnsupportedDiag(sourceTag, "missing-path", "Manifest entry is missing a valid string 'path'", lineOf("path")));
      return { ok: false, fields: emptyFields, keyLines, diagnostics };
    }
  }

  const readOptString = (k: "id" | "title" | "section"): string | undefined => {
    if (!(k in item)) return undefined;
    const v = asNonEmptyString(item[k]);
    if (!v) diagnostics.push(makeUnsupportedDiag(sourceTag, `field-${k}`, `'${k}' must be a non-empty string`, lineOf(k)));
    return v;
  };

  const id = readOptString("id");
  const title = readOptString("title");
  const section = readOptString("section");

  let status: SpecStatus | undefined;
  if ("status" in item) {
    status = parseSpecStatus(item.status);
    if (!status) diagnostics.push(makeUnsupportedDiag(sourceTag, "field-status", `Invalid status '${String(item.status)}'`, lineOf("status")));
  }

  let requirement: string | SpecRequirementDeclarationInput | undefined;
  if ("requirement" in item) {
    const reqLine = lineOf("requirement");
    const strReq = asNonEmptyString(item.requirement);
    if (strReq) {
      requirement = strReq;
    } else if (isMap(reqAstNode)) {
      const parsedReq = parseRequirementObjectAst(rawYaml, lineCounter, reqAstNode, doc, lineOffset, reqLine, sourceTag);
      if (parsedReq.ok) requirement = parsedReq.value;
      else diagnostics.push(parsedReq.diag);
    } else {
      diagnostics.push(makeUnsupportedDiag(sourceTag, "field-requirement", "'requirement' must be a non-empty string or {id, section?} mapping", reqLine));
    }
  }

  let requirements: SpecRequirementDeclarationInput[] = [];
  if ("requirements" in item) {
    const parsedReqs = parseRequirementsSeqAst(rawYaml, lineCounter, reqsAstNode, doc, lineOffset, lineOf("requirements"), sourceTag);
    if (parsedReqs.ok) requirements = parsedReqs.values;
    else diagnostics.push(...parsedReqs.diagnostics);
  }

  const readStringList = (k: "supersedes" | "track" | "decisions"): string[] => {
    if (!(k in item)) return [];
    const res = parseStrictStringArray(item[k]);
    if (res.ok) return res.values;
    diagnostics.push(makeUnsupportedDiag(sourceTag, `field-${k}`, `'${k}' must be a list of non-empty strings`, lineOf(k)));
    return [];
  };

  const supersedes = readStringList("supersedes");
  const track = readStringList("track");
  const decisions = readStringList("decisions");

  let governs: TargetSelector[] = [];
  if ("governs" in item) {
    const govParsed = parseTargetSelectorListWithAst(rawYaml, lineCounter, governsAstNode, item.governs, lineOffset, lineOf("governs"));
    if (govParsed.diagnostics.length > 0) diagnostics.push(...govParsed.diagnostics);
    else governs = govParsed.valid;
  }

  if (diagnostics.length > 0) return { ok: false, fields: emptyFields, keyLines, diagnostics };

  return {
    ok: true,
    fields: {
      ...(pathVal ? { path: normalizeRelPosix(pathVal) } : {}),
      ...(id ? { id } : {}),
      ...(title ? { title } : {}),
      ...(status ? { status } : {}),
      ...(section ? { section } : {}),
      ...(requirement !== undefined ? { requirement } : {}),
      requirements,
      supersedes,
      governs,
      track,
      decisions,
    },
    keyLines,
    diagnostics: [],
  };
}

function parseSpecMapManifestDetailed(rawYaml: string): { manifest: SpecMapManifest; diagnostics: DeclarationDiagnosticInfo[] } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(rawYaml, { lineCounter });
  const diagnostics: DeclarationDiagnosticInfo[] = [];

  if (doc.errors.length > 0) {
    const errLine = offsetToLine(rawYaml, lineCounter, doc.errors[0]!.pos?.[0] ?? 0, 0);
    diagnostics.push(makeUnsupportedDiag(MANIFEST_REL_PATH, "yaml-error", `Invalid YAML in ${MANIFEST_REL_PATH}: ${doc.errors[0]!.message}`, errLine));
    return { manifest: { entries: [] }, diagnostics };
  }
  if (!isMap(doc.contents)) {
    diagnostics.push(makeUnsupportedDiag(MANIFEST_REL_PATH, "root-non-map", `${MANIFEST_REL_PATH} root must be a YAML mapping`, 1));
    return { manifest: { entries: [] }, diagnostics };
  }

  let version: number | undefined;
  for (const pair of doc.contents.items) {
    if (!isPair(pair) || !isScalar(pair.key) || typeof pair.key.value !== "string") {
      diagnostics.push(makeUnsupportedDiag(MANIFEST_REL_PATH, "root-key", `Invalid root key in ${MANIFEST_REL_PATH}`, 1));
      return { manifest: { entries: [] }, diagnostics };
    }
    const keyName = pair.key.value;
    const keyLine = offsetRangeToLineSpan(rawYaml, lineCounter, pair.key.range, 0).startLine;
    if (!MANIFEST_ROOT_KEYS.has(keyName)) {
      diagnostics.push(makeUnsupportedDiag(MANIFEST_REL_PATH, `root-key-${keyName}`, `Unsupported root key '${keyName}' in ${MANIFEST_REL_PATH}`, keyLine));
      return { manifest: { entries: [] }, diagnostics };
    }
    if (keyName === "version") {
      if (!isScalar(pair.value) || typeof pair.value.value !== "number" || !Number.isInteger(pair.value.value)) {
        diagnostics.push(makeUnsupportedDiag(MANIFEST_REL_PATH, "version", `Invalid 'version' in ${MANIFEST_REL_PATH}`, keyLine));
        return { manifest: { entries: [] }, diagnostics };
      }
      version = pair.value.value;
    }
  }

  const entriesPair = doc.contents.items.find((p) => isPair(p) && isScalar(p.key) && String(p.key.value) === "entries");
  if (!entriesPair) return { manifest: { ...(version !== undefined ? { version } : {}), entries: [] }, diagnostics };

  const entriesKeyLine = offsetRangeToLineSpan(rawYaml, lineCounter, entriesPair.key?.range, 0).startLine;
  if (!isSeq(entriesPair.value)) {
    diagnostics.push(makeUnsupportedDiag(MANIFEST_REL_PATH, "entries-non-seq", `'entries' in ${MANIFEST_REL_PATH} must be a YAML sequence`, entriesKeyLine));
    return { manifest: { ...(version !== undefined ? { version } : {}), entries: [] }, diagnostics };
  }

  const entries: SpecMapEntry[] = [];
  for (const itemNode of entriesPair.value.items) {
    const entrySpan = offsetRangeToLineSpan(rawYaml, lineCounter, (itemNode as { range?: [number, number, number?] } | null)?.range, 0);
    const parsedEntry = parseDeclarationMapAst({
      rawYaml, lineCounter, mapNode: itemNode as ReturnType<typeof parseDocument>["contents"], doc,
      allowedKeys: MANIFEST_ENTRY_KEYS, lineOffset: 0, fallbackLine: entrySpan.startLine, sourceTag: MANIFEST_REL_PATH, requirePath: true,
    });
    if (!parsedEntry.ok) {
      diagnostics.push(...parsedEntry.diagnostics);
      continue;
    }
    const f = parsedEntry.fields;
    entries.push({
      path: f.path!,
      ...(f.id ? { id: f.id } : {}),
      ...(f.title ? { title: f.title } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.section ? { section: f.section } : {}),
      ...(f.requirement !== undefined ? { requirement: f.requirement } : {}),
      ...(f.requirements.length > 0 ? { requirements: f.requirements } : {}),
      supersedes: f.supersedes,
      governs: f.governs,
      track: f.track,
      decisions: f.decisions,
      startLine: entrySpan.startLine,
      endLine: entrySpan.endLine,
    });
  }
  return { manifest: { ...(version !== undefined ? { version } : {}), entries }, diagnostics };
}

export function parseSpecMapManifest(rawYaml: string): SpecMapManifest {
  return parseSpecMapManifestDetailed(rawYaml).manifest;
}

function parseLeadingFrontmatter(
  lines: readonly string[],
  sourceFile: string,
): { frontmatter: SpecFrontmatter; diagnostics: DeclarationDiagnosticInfo[]; endLine: number; keyLines: Record<string, LineSpan> } | null {
  if (lines.length < 2 || lines[0]!.replace(/^\uFEFF/u, "").trim() !== "---") return null;
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === "---" || trimmed === "...") { closeIdx = i; break; }
  }
  if (closeIdx < 1) return null;

  const endLine = closeIdx + 1;
  const rawYaml = lines.slice(1, closeIdx).join("\n");
  const lineCounter = new LineCounter();
  const doc = parseDocument(rawYaml, { lineCounter });

  if (doc.errors.length > 0) {
    const errLine = offsetToLine(rawYaml, lineCounter, doc.errors[0]!.pos?.[0] ?? 0, 1);
    return {
      frontmatter: {},
      diagnostics: [makeUnsupportedDiag(sourceFile, "frontmatter-yaml", `Invalid YAML in frontmatter of '${sourceFile}': ${doc.errors[0]!.message}`, errLine)],
      endLine,
      keyLines: {},
    };
  }
  if (doc.contents === null || doc.contents === undefined) return { frontmatter: {}, diagnostics: [], endLine, keyLines: {} };

  const parsed = parseDeclarationMapAst({
    rawYaml, lineCounter, mapNode: doc.contents, doc, allowedKeys: FRONTMATTER_KEYS, lineOffset: 1, fallbackLine: 2, sourceTag: sourceFile,
  });
  if (!parsed.ok) return { frontmatter: {}, diagnostics: parsed.diagnostics, endLine, keyLines: {} };

  const f = parsed.fields;
  return {
    frontmatter: {
      ...(f.id ? { id: f.id } : {}),
      ...(f.title ? { title: f.title } : {}),
      ...(f.status ? { status: f.status } : {}),
      supersedes: f.supersedes,
      governs: f.governs,
      track: f.track,
      decisions: f.decisions,
      requirements: f.requirements,
    },
    diagnostics: [],
    endLine,
    keyLines: parsed.keyLines,
  };
}

interface ParsedMarker {
  line: number;
  enclosingHeadingLine: number;
  requirement?: string | SpecRequirementDeclarationInput;
  requirements: SpecRequirementDeclarationInput[];
  governs: TargetSelector[];
  track: string[];
  decisions: string[];
}

function parseSectionMarkerFlowYaml(
  rawFlowYaml: string,
  lineNum: number,
  enclosingHeadingLine: number,
  sourceFile: string,
): { ok: true; marker: ParsedMarker } | { ok: false; diagnostics: DeclarationDiagnosticInfo[] } {
  const trimmed = rawFlowYaml.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { ok: false, diagnostics: [makeUnsupportedDiag(sourceFile, "marker-non-flow", "Section marker must be a single-line YAML flow mapping '<!-- app-context: { ... } -->'", lineNum)] };
  }
  const lineCounter = new LineCounter();
  const doc = parseDocument(trimmed, { lineCounter });
  if (doc.errors.length > 0 || !isMap(doc.contents) || doc.contents.items.length === 0) {
    return { ok: false, diagnostics: [makeUnsupportedDiag(sourceFile, "marker-yaml", `Invalid or empty YAML flow mapping in section marker at line ${lineNum}`, lineNum)] };
  }
  const parsed = parseDeclarationMapAst({
    rawYaml: trimmed, lineCounter, mapNode: doc.contents, doc, allowedKeys: MARKER_KEYS, lineOffset: lineNum - 1, fallbackLine: lineNum, sourceTag: sourceFile,
  });
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };
  const f = parsed.fields;
  return {
    ok: true,
    marker: {
      line: lineNum,
      enclosingHeadingLine,
      ...(f.requirement !== undefined ? { requirement: f.requirement } : {}),
      requirements: f.requirements,
      governs: f.governs,
      track: f.track,
      decisions: f.decisions,
    },
  };
}

/** CommonMark line-based code-fence detector (Rule 5). */
function computeCommonMarkFencedLines(lines: readonly string[], frontmatterEndLine: number): Set<number> {
  const fencedLines = new Set<number>();
  let i = frontmatterEndLine;
  while (i < lines.length) {
    const openMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(lines[i]!);
    const isBacktickWithInlineTick = openMatch !== null && openMatch[1]![0] === "`" && openMatch[2]!.includes("`");
    if (openMatch && !isBacktickWithInlineTick) {
      const fenceChar = openMatch[1]![0]!;
      const fenceLen = openMatch[1]!.length;
      fencedLines.add(i + 1);
      let closeIdx = i + 1;
      while (closeIdx < lines.length) {
        fencedLines.add(closeIdx + 1);
        const closeMatch = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(lines[closeIdx]!);
        if (closeMatch && closeMatch[1]![0] === fenceChar && closeMatch[1]!.length >= fenceLen) break;
        closeIdx += 1;
      }
      i = closeIdx + 1;
      continue;
    }
    i += 1;
  }
  return fencedLines;
}

interface SectionRecord {
  nodeId: string;
  heading: string;
  slugPath: string;
  leafSlug: string;
  file: string;
  startLine: number;
  endLine: number;
}

interface RequirementRecord {
  nodeId: string;
  parentNodeId: string;
}

interface ParsedSpecDocument {
  repoRelPath: string;
  content: string;
  totalLines: number;
  specSeed: string;
  title: string;
  status: SpecStatus;
  specMetaSpans: LineSpan[];
  statusMetaSpan?: LineSpan;
  sectionsDesynced: boolean;
  frontmatterEndLine: number;
  frontmatter: SpecFrontmatter;
  frontmatterKeyLines: Record<string, LineSpan>;
  manifestEntries: SpecMapEntry[];
  rawHeadings: Array<{ title: string; lineNumber: number; level: number }>;
  markers: ParsedMarker[];
}

function buildPreviewSections(
  repoRelPath: string,
  rawHeadings: ReadonlyArray<{ title: string; lineNumber: number; level: number }>,
  totalLines: number,
): SectionRecord[] {
  const sections: SectionRecord[] = [];
  const stack: Array<{ level: number; slugPath: string }> = [];
  const siblingCountsByParent = new Map<string, Map<string, number>>();
  for (let i = 0; i < rawHeadings.length; i++) {
    const h = rawHeadings[i]!;
    let endLine = totalLines;
    for (let j = i + 1; j < rawHeadings.length; j++) {
      if (rawHeadings[j]!.level <= h.level) { endLine = rawHeadings[j]!.lineNumber - 1; break; }
    }
    while (stack.length > 0 && stack.at(-1)!.level >= h.level) stack.pop();
    const parent = stack.at(-1);
    const parentKey = parent?.slugPath ?? "";
    const baseSlug = slugifyHeading(h.title);
    let siblingMap = siblingCountsByParent.get(parentKey);
    if (!siblingMap) { siblingMap = new Map<string, number>(); siblingCountsByParent.set(parentKey, siblingMap); }
    const count = (siblingMap.get(baseSlug) ?? 0) + 1;
    siblingMap.set(baseSlug, count);
    const leafSlug = count === 1 ? baseSlug : `${baseSlug}~${count}`;
    const slugPath = parent ? `${parent.slugPath}/${leafSlug}` : leafSlug;
    sections.push({ nodeId: slugPath, heading: h.title, slugPath, leafSlug, file: repoRelPath, startLine: h.lineNumber, endLine });
    stack.push({ level: h.level, slugPath });
  }
  return sections;
}

function filterValidManifestMetaEntries(
  sectionsDesynced: boolean,
  previewSections: readonly SectionRecord[],
  frontmatter: SpecFrontmatter,
  markers: readonly ParsedMarker[],
  manifestEntries: readonly SpecMapEntry[],
): SpecMapEntry[] {
  const secByHeadingLine = new Map(previewSections.map((s) => [s.startLine, s]));
  const reqParentsById = new Map<string, string[]>();
  const invalidReqIds = new Set<string>();

  const recordDecl = (req: SpecRequirementDeclarationInput, outerSec: SectionRecord | undefined): boolean => {
    if (sectionsDesynced) {
      invalidReqIds.add(req.id);
      return false;
    }
    let targetSec = outerSec;
    if (req.section) {
      const res = resolveSectionInSpec(req.section, previewSections);
      if (res.status !== "unique") {
        invalidReqIds.add(req.id);
        return false;
      }
      if (outerSec && res.value.slugPath !== outerSec.slugPath) {
        invalidReqIds.add(req.id);
        return false;
      }
      targetSec = res.value;
    }
    const list = reqParentsById.get(req.id) ?? [];
    list.push(targetSec ? targetSec.slugPath : "__spec__");
    reqParentsById.set(req.id, list);
    return true;
  };

  for (const r of frontmatter.requirements ?? []) recordDecl(r, undefined);
  for (const m of markers) {
    const sec = secByHeadingLine.get(m.enclosingHeadingLine);
    if (!sec) continue;
    for (const r of [...(typeof m.requirement === "object" ? [m.requirement] : []), ...m.requirements]) recordDecl(r, sec);
  }

  const entryOuterSec = new Map<SpecMapEntry, SectionRecord | undefined>();
  const structurallyInvalidEntries = new Set<SpecMapEntry>();

  for (const e of manifestEntries) {
    if (sectionsDesynced && (e.section !== undefined || e.requirement !== undefined || (e.requirements?.length ?? 0) > 0)) {
      structurallyInvalidEntries.add(e);
      continue;
    }
    let outerSec: SectionRecord | undefined;
    if (e.section !== undefined) {
      const res = resolveSectionInSpec(e.section, previewSections);
      if (res.status !== "unique") {
        structurallyInvalidEntries.add(e);
        continue;
      }
      outerSec = res.value;
    }
    entryOuterSec.set(e, outerSec);
    for (const r of [...(typeof e.requirement === "object" ? [e.requirement] : []), ...(e.requirements ?? [])]) {
      if (!recordDecl(r, outerSec)) structurallyInvalidEntries.add(e);
    }
  }

  const isUniquelyValidReq = (reqId: string): string | null => {
    if (invalidReqIds.has(reqId)) return null;
    const parents = reqParentsById.get(reqId);
    if (!parents || parents.length !== 1) return null;
    return parents[0]!;
  };

  return manifestEntries.filter((e) => {
    if (structurallyInvalidEntries.has(e)) return false;
    const outerSec = entryOuterSec.get(e);
    for (const r of [...(typeof e.requirement === "object" ? [e.requirement] : []), ...(e.requirements ?? [])]) {
      if (!isUniquelyValidReq(r.id)) return false;
    }
    if (typeof e.requirement === "string") {
      const parentKey = isUniquelyValidReq(e.requirement);
      if (!parentKey) return false;
      if (outerSec && parentKey !== outerSec.slugPath) return false;
    }
    return true;
  });
}

interface TargetCatalogEntry {
  node: GraphNode;
  candidate: AppContextDiagnosticCandidate;
}

function makeFileCitation(sourceFile: string, lineStart: number, lineEnd: number, commit: string): AppContextFileCitation {
  return { citation_kind: "file", source_file: sourceFile, line_start: lineStart, line_end: lineEnd, commit };
}

function compareCandidates(a: AppContextDiagnosticCandidate, b: AppContextDiagnosticCandidate): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  if (a.endLine !== b.endLine) return a.endLine - b.endLine;
  return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
}

function candidateFromGraphNode(node: GraphNode): AppContextDiagnosticCandidate {
  const file = normalizeRelPosix(String(node.file ?? node.source_file ?? ""));
  const startLine = typeof node.startLine === "number" ? node.startLine : 1;
  const endLine = typeof node.endLine === "number" ? node.endLine : startLine;
  return { file, startLine, endLine, label: node.label };
}

function hasNonEmptyStrings(rec: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.every((k) => Boolean(asNonEmptyString(rec[k])));
}

function isValidTrackProjectionCitation(
  cit: unknown,
  expectedFile: "track-projections/track-query.json" | "track-projections/track-decisions.json",
  expectedCmd: "track query --format json" | "track decision ls --format json",
): boolean {
  const c = asRecord(cit);
  return Boolean(
    c && c.citation_kind === "track_cli_projection" && c.source_file === expectedFile &&
      typeof c.line_start === "number" && typeof c.line_end === "number" &&
      c.command === expectedCmd && hasNonEmptyStrings(c, "json_pointer", "cli_version", "commit"),
  );
}

function isCompleteCatalogNode(node: GraphNode, knownEvidenceById: ReadonlyMap<string, OntologyEvidenceRecord>): boolean {
  if (!node.id || !node.label || !node.node_type) return false;
  if (!Array.isArray(node.citations) || node.citations.length === 0) return false;
  if (!Array.isArray(node.evidence_refs) || node.evidence_refs.length === 0) return false;
  if (node.evidence_refs.some((ref) => typeof ref !== "string" || !knownEvidenceById.has(ref))) return false;

  const rec = node as unknown as Record<string, unknown>;
  switch (node.node_type) {
    case "Route":
      return VALID_ROUTER_KINDS.has(node.routerKind as AppContextRouterKind) && hasNonEmptyStrings(rec, "routePattern", "file");
    case "Component":
      return hasNonEmptyStrings(rec, "file", "exportName", "framework");
    case "ApiEndpoint":
      return hasNonEmptyStrings(rec, "method", "pathTemplate", "file");
    case "DataEntity":
      return VALID_DIALECTS.has(node.dialect as AppContextDataDialect) && hasNonEmptyStrings(rec, "schema", "name") && (node.entityKind === "table" || node.entityKind === "view");
    case "DataField":
      return VALID_DIALECTS.has(node.dialect as AppContextDataDialect) && hasNonEmptyStrings(rec, "schema", "entityName", "name", "dbType") &&
        typeof node.nullable === "boolean" && typeof node.isPk === "boolean" && typeof node.isFk === "boolean";
    case "CodeSymbol":
      return hasNonEmptyStrings(rec, "file", "symbolKind", "symbolName");
    case "TrackItem": {
      const t = asRecord(node.track);
      return Boolean(t && hasNonEmptyStrings(t, "id", "title", "kind", "workspace", "bucket", "realization", "acceptance") &&
        node.citations.every((c) => isValidTrackProjectionCitation(c, "track-projections/track-query.json", "track query --format json")));
    }
    case "TrackWorkpackage": {
      const t = asRecord(node.track);
      return Boolean(t && hasNonEmptyStrings(t, "wpId", "wpLabel") &&
        node.citations.every((c) => isValidTrackProjectionCitation(c, "track-projections/track-query.json", "track query --format json")));
    }
    case "TrackDecision": {
      const t = asRecord(node.track);
      return Boolean(t && hasNonEmptyStrings(t, "id", "title", "workspace", "decisionKind", "realization", "outcome", "structure") &&
        typeof t.structured === "boolean" && typeof t.optionCount === "number" && typeof t.openQuestionCount === "number" &&
        typeof t.hasRecommendation === "boolean" && Array.isArray(t.options) &&
        node.citations.every((c) => isValidTrackProjectionCitation(c, "track-projections/track-decisions.json", "track decision ls --format json")));
    }
    default:
      return false;
  }
}

function finalizeMatches(matches: readonly TargetCatalogEntry[]): Resolution3<TargetCatalogEntry> {
  if (matches.length === 0) return { status: "missing" };
  if (matches.length === 1) return { status: "unique", value: matches[0]! };
  return { status: "ambiguous", candidates: matches.map((m) => m.candidate).sort(compareCandidates) };
}

function resolveTargetSelectorAgainstCatalog(selector: TargetSelector, catalog: readonly TargetCatalogEntry[]): Resolution3<TargetCatalogEntry> {
  return finalizeMatches(
    catalog.filter(({ node: n }) => {
      switch (selector.kind) {
        case "component":
          return n.node_type === "Component" && normalizeRelPosix(String(n.file ?? n.source_file ?? "")) === normalizeRelPosix(selector.file) && String(n.exportName ?? "default") === (selector.exportName ?? "default");
        case "route":
          return n.node_type === "Route" && String(n.routePattern ?? "") === selector.pattern && (!selector.routerKind || String(n.routerKind ?? "") === selector.routerKind);
        case "endpoint":
          return n.node_type === "ApiEndpoint" && String(n.method ?? "").toUpperCase() === selector.method.toUpperCase() && String(n.pathTemplate ?? "") === selector.pathTemplate;
        case "entity":
          return n.node_type === "DataEntity" && String(n.name ?? "") === selector.name && (!selector.schema || String(n.schema ?? "") === selector.schema) && (!selector.dialect || String(n.dialect ?? "") === selector.dialect);
        case "field":
          return n.node_type === "DataField" && String(n.entityName ?? "") === selector.entity && String(n.name ?? "") === selector.field && (!selector.schema || String(n.schema ?? "") === selector.schema) && (!selector.dialect || String(n.dialect ?? "") === selector.dialect);
        case "symbol":
          return n.node_type === "CodeSymbol" && normalizeRelPosix(String(n.file ?? n.source_file ?? "")) === normalizeRelPosix(selector.file) && String(n.symbolName ?? "") === selector.symbolName;
      }
    }),
  );
}

function resolveTrackIdAgainstCatalog(ulid: string, catalog: readonly TargetCatalogEntry[]): Resolution3<TargetCatalogEntry> {
  return finalizeMatches(
    catalog.filter(({ node: n }) => {
      const trackObj = asRecord(n.track);
      return (n.node_type === "TrackItem" && asNonEmptyString(trackObj?.id) === ulid) || (n.node_type === "TrackWorkpackage" && asNonEmptyString(trackObj?.wpId) === ulid);
    }),
  );
}

function resolveDecisionIdAgainstCatalog(ulid: string, catalog: readonly TargetCatalogEntry[]): Resolution3<TargetCatalogEntry> {
  return finalizeMatches(catalog.filter(({ node: n }) => n.node_type === "TrackDecision" && asNonEmptyString(asRecord(n.track)?.id) === ulid));
}

function resolveSectionInSpec(rawSectionQuery: string, sections: readonly SectionRecord[]): Resolution3<SectionRecord> {
  const sectionQuery = rawSectionQuery.replace(/^#+/u, "").trim();
  if (!sectionQuery) return { status: "missing" };
  const toCand = (s: SectionRecord): AppContextDiagnosticCandidate => ({ file: s.file, startLine: s.startLine, endLine: s.endLine, label: s.heading });

  const exactSlugMatches = sections.filter((s) => s.slugPath === sectionQuery);
  if (exactSlugMatches.length === 1) return { status: "unique", value: exactSlugMatches[0]! };
  if (exactSlugMatches.length > 1) return { status: "ambiguous", candidates: exactSlugMatches.map(toCand).sort(compareCandidates) };

  const slugQuery = slugifyHeading(sectionQuery);
  const aliasMatches = sections.filter(
    (s) => s.slugPath === slugQuery || s.leafSlug === sectionQuery || s.leafSlug === slugQuery || slugifyHeading(s.heading) === slugQuery || s.heading === sectionQuery,
  );
  if (aliasMatches.length === 0) return { status: "missing" };
  if (aliasMatches.length === 1) return { status: "unique", value: aliasMatches[0]! };
  return { status: "ambiguous", candidates: aliasMatches.map(toCand).sort(compareCandidates) };
}

function citationKey(c: AppContextCitation): string {
  return c.citation_kind === "track_cli_projection"
    ? canonicalBytes(["track", c.source_file, c.line_start, c.line_end, c.json_pointer, c.commit])
    : canonicalBytes(["file", c.source_file, c.line_start, c.line_end, c.commit]);
}

export function buildAppContextRelationRecords(edges: readonly GraphEdge[]): AppContextRelationRecord[] {
  const byKey = new Map<string, { source: string; target: string; relation: string; derivationMethods: Set<string>; evidenceRefs: Set<string>; citationsByKey: Map<string, AppContextCitation> }>();
  for (const edge of edges) {
    const key = canonicalBytes([edge.source, edge.target, edge.relation]);
    let group = byKey.get(key);
    if (!group) {
      group = { source: edge.source, target: edge.target, relation: edge.relation, derivationMethods: new Set<string>(), evidenceRefs: new Set<string>(), citationsByKey: new Map<string, AppContextCitation>() };
      byKey.set(key, group);
    }
    if (typeof edge.derivation_method === "string" && edge.derivation_method.trim()) group.derivationMethods.add(edge.derivation_method.trim());
    for (const ref of edge.evidence_refs ?? []) if (typeof ref === "string" && ref.trim()) group.evidenceRefs.add(ref.trim());
    for (const cit of (edge.citations ?? []) as unknown as AppContextCitation[]) if (cit && typeof cit.source_file === "string") group.citationsByKey.set(citationKey(cit), cit);
  }
  return [...byKey.values()]
    .map((g) => ({
      source: g.source,
      target: g.target,
      relation: g.relation,
      confidence: "EXTRACTED" as const,
      derivation_methods: [...g.derivationMethods].sort(),
      evidence_refs: [...g.evidenceRefs].sort(),
      citations: [...g.citationsByKey.values()],
    }))
    .sort((a, b) => (a.source !== b.source ? (a.source < b.source ? -1 : 1) : a.target !== b.target ? (a.target < b.target ? -1 : 1) : a.relation < b.relation ? -1 : a.relation > b.relation ? 1 : 0));
}

export async function extractSpecs(options: ExtractSpecsOptions): Promise<SpecExtractionResult> {
  if (typeof options.commit !== "string" || options.commit.trim().length === 0) {
    throw new Error("extractSpecs requires a non-empty commit SHA");
  }
  const rootDir = resolve(options.rootDir);
  const repoKey = options.repoKey;
  const commit = options.commit.trim();
  const includeRegexes = (options.include ?? ["docs/spec/**/*.md"]).map(globToRegExp);
  const excludeRegexes = (options.exclude ?? []).map(globToRegExp);
  const isExcluded = (relPath: string): boolean => excludeRegexes.some((re) => re.test(relPath));

  const diagnosticsById = new Map<string, AppContextDiagnostic>();
  const recordDiagnostic = (
    code: AppContextDiagnosticCode,
    selectorKey: string,
    message: string,
    file?: string,
    line?: number,
    candidates?: AppContextDiagnosticCandidate[],
  ): void => {
    const id = appContextNodeId(repoKey, "Diagnostic", [code, selectorKey]);
    if (!diagnosticsById.has(id)) {
      diagnosticsById.set(id, { id, code, message, ...(file ? { file } : {}), ...(line !== undefined ? { line } : {}), ...(candidates ? { candidates } : {}) });
    }
  };

  // 1. Validate and load optional `<checkout>/.engram/spec-map.yaml` manifest (Rule 1, M1, R1, R2)
  const manifestCheck = checkCheckoutManifest(rootDir, options as unknown as Record<string, unknown>);
  let manifest: SpecMapManifest = { entries: [] };
  if (manifestCheck.status === "outside") {
    recordDiagnostic("manifest-outside-checkout", diagnosticSelectorKey(["Manifest", MANIFEST_REL_PATH]), manifestCheck.reason, MANIFEST_REL_PATH, 1);
  } else if (manifestCheck.status === "ok") {
    const parsedManifest = parseSpecMapManifestDetailed(readFileSync(manifestCheck.absPath, "utf8"));
    manifest = parsedManifest.manifest;
    for (const d of parsedManifest.diagnostics) recordDiagnostic(d.code, d.selectorKey, d.reason, MANIFEST_REL_PATH, d.line);
  }

  const manifestEntriesByPath = new Map<string, SpecMapEntry[]>();
  const validManifestPaths: string[] = [];
  for (const entry of manifest.entries) {
    const check = validateCheckoutMarkdownPath(rootDir, entry.path, false);
    if (!check.ok) {
      recordDiagnostic("target-unresolved", diagnosticSelectorKey(["Spec", entry.path]), check.reason, MANIFEST_REL_PATH, entry.startLine);
      continue;
    }
    const list = manifestEntriesByPath.get(check.repoRelPath) ?? [];
    list.push({ ...entry, path: check.repoRelPath });
    manifestEntriesByPath.set(check.repoRelPath, list);
    validManifestPaths.push(check.repoRelPath);
  }

  // 2. Discover and validate spec files (M1)
  const matchedSpecPaths = new Set<string>();
  if (options.specFiles && options.specFiles.length > 0) {
    for (const rawFile of options.specFiles) {
      const check = validateCheckoutMarkdownPath(rootDir, rawFile, true);
      if (!check.ok) {
        recordDiagnostic("target-unresolved", diagnosticSelectorKey(["Spec", rawFile]), check.reason, rawFile, 1);
        continue;
      }
      if (!isExcluded(check.repoRelPath)) matchedSpecPaths.add(check.repoRelPath);
    }
  } else {
    for (const relPath of walkMarkdownFiles(rootDir)) {
      if (!isExcluded(relPath) && includeRegexes.some((re) => re.test(relPath))) matchedSpecPaths.add(relPath);
    }
    for (const relPath of validManifestPaths) if (!isExcluded(relPath)) matchedSpecPaths.add(relPath);
  }
  const specRelPaths = [...matchedSpecPaths].sort();

  // 3. Parse each spec file: frontmatter envelope, CommonMark fences, extractMarkdown headings, and section markers
  const parsedDocs: ParsedSpecDocument[] = [];
  for (const repoRelPath of specRelPaths) {
    const absPath = resolve(rootDir, repoRelPath);
    const content = readFileSync(absPath, "utf8");
    const lines = splitLogicalLines(content);
    const totalLines = Math.max(1, lines.length);
    const mdExtraction = options.baseMarkdownByFile?.get(repoRelPath) ?? (await extractMarkdown(absPath, rootDir));

    const fmResult = parseLeadingFrontmatter(lines, repoRelPath);
    for (const d of fmResult?.diagnostics ?? []) recordDiagnostic(d.code, d.selectorKey, d.reason, repoRelPath, d.line);
    const frontmatter = fmResult?.frontmatter ?? {};
    const frontmatterEndLine = fmResult?.endLine ?? 0;
    const frontmatterKeyLines = fmResult?.keyLines ?? {};
    const fencedLines = computeCommonMarkFencedLines(lines, frontmatterEndLine);

    const rawHeadings: Array<{ title: string; lineNumber: number; level: number }> = [];
    const extractedHeadingLines = new Set<number>();
    for (const mdNode of mdExtraction.nodes.slice(1)) {
      const locMatch = /^L(\d+)$/u.exec(mdNode.source_location ?? "");
      if (!locMatch) continue;
      const lineNumber = Number.parseInt(locMatch[1]!, 10);
      if (lineNumber <= frontmatterEndLine || lineNumber > totalLines || fencedLines.has(lineNumber)) continue;
      const hMatch = /^(#{1,6})\s+(.+)$/u.exec(lines[lineNumber - 1]!.replace(/^\uFEFF/u, ""));
      if (hMatch) {
        extractedHeadingLines.add(lineNumber);
        rawHeadings.push({ title: mdNode.label, lineNumber, level: hMatch[1]!.length });
      }
    }
    rawHeadings.sort((a, b) => a.lineNumber - b.lineNumber);

    // R4.3: Detect non-fenced headings dropped by `extractMarkdown` due to unbalanced inner fence desynchronization
    const desyncedHeadingLines = new Set<number>();
    for (let i = frontmatterEndLine; i < lines.length; i++) {
      const lineNum = i + 1;
      if (fencedLines.has(lineNum)) continue;
      if (/^(#{1,6})\s+(.+)$/u.test(lines[i]!.replace(/^\uFEFF/u, "")) && !extractedHeadingLines.has(lineNum)) {
        desyncedHeadingLines.add(lineNum);
        recordDiagnostic("unsupported-construct", diagnosticSelectorKey(["UnsupportedConstruct", repoRelPath, "desynced-heading", lineNum]), `Heading at ${repoRelPath}:${lineNum} was skipped by extractMarkdown due to nested fence desynchronization`, repoRelPath, lineNum);
      }
    }

    // Rule 2.b: Single-line flow marker on first non-blank line after heading, outside fences
    const allowedMarkerLineToHeadingLine = new Map<number, number>();
    for (let hIdx = 0; hIdx < rawHeadings.length; hIdx++) {
      const h = rawHeadings[hIdx]!;
      const nextHeadingLine = rawHeadings[hIdx + 1]?.lineNumber ?? totalLines + 1;
      for (let lineNum = h.lineNumber + 1; lineNum < nextHeadingLine; lineNum++) {
        if (desyncedHeadingLines.has(lineNum)) break;
        if (lines[lineNum - 1]!.trim() === "") continue;
        if (!fencedLines.has(lineNum)) allowedMarkerLineToHeadingLine.set(lineNum, h.lineNumber);
        break;
      }
    }

    const markers: ParsedMarker[] = [];
    let i = frontmatterEndLine;
    while (i < lines.length) {
      const lineNum = i + 1;
      if (fencedLines.has(lineNum) || !lines[i]!.includes("<!--")) { i += 1; continue; }
      const lineText = lines[i]!;
      const singleLineComment = /^<!--([\s\S]*?)-->$/u.exec(lineText.trim());
      if (singleLineComment && !singleLineComment[1]!.includes("-->")) {
        const inner = singleLineComment[1]!.trim();
        const appCtxMatch = /^app-context\s*:\s*([\s\S]*)$/iu.exec(inner);
        if (appCtxMatch) {
          const headingLine = allowedMarkerLineToHeadingLine.get(lineNum);
          if (headingLine === undefined) {
            recordDiagnostic("unsupported-construct", diagnosticSelectorKey(["UnsupportedConstruct", repoRelPath, "misplaced-marker", lineNum]), `Section marker at ${repoRelPath}:${lineNum} must be on the first non-blank line after a heading`, repoRelPath, lineNum);
          } else {
            const parsedMarker = parseSectionMarkerFlowYaml(appCtxMatch[1]!, lineNum, headingLine, repoRelPath);
            if (parsedMarker.ok) markers.push(parsedMarker.marker);
            else for (const d of parsedMarker.diagnostics) recordDiagnostic(d.code, d.selectorKey, d.reason, repoRelPath, d.line);
          }
        } else if (/^(?:requirement|requirements|governs|track|decisions)\s*:/iu.test(inner)) {
          recordDiagnostic("unsupported-construct", diagnosticSelectorKey(["UnsupportedConstruct", repoRelPath, "legacy-marker", lineNum]), `Unsupported HTML comment marker form at ${repoRelPath}:${lineNum}; use '<!-- app-context: { ... } -->'`, repoRelPath, lineNum);
        }
        i += 1;
        continue;
      }

      let closeIdx = i;
      const chunkLines: string[] = [lineText];
      if (!lineText.includes("-->")) {
        closeIdx = i + 1;
        while (closeIdx < lines.length) {
          chunkLines.push(lines[closeIdx]!);
          if (lines[closeIdx]!.includes("-->")) break;
          closeIdx += 1;
        }
      }
      if (/<!--\s*(?:app-context|requirement|requirements|governs|track|decisions)\s*:/iu.test(chunkLines.join("\n"))) {
        recordDiagnostic("unsupported-construct", diagnosticSelectorKey(["UnsupportedConstruct", repoRelPath, "invalid-comment-marker", lineNum]), `Unsupported HTML comment marker at ${repoRelPath}:${lineNum}; section marker must be a single-line '<!-- app-context: { ... } -->' on the first non-blank line after a heading`, repoRelPath, lineNum);
      }
      i = closeIdx + 1;
    }

    const sectionsDesynced = desyncedHeadingLines.size > 0;
    const effectiveHeadings = sectionsDesynced ? [] : rawHeadings;
    const effectiveMarkers = sectionsDesynced ? [] : markers;
    const fileManifestEntries = manifestEntriesByPath.get(repoRelPath) ?? [];

    const previewSections = buildPreviewSections(repoRelPath, effectiveHeadings, totalLines);
    const validMetaEntries = filterValidManifestMetaEntries(
      sectionsDesynced,
      previewSections,
      frontmatter,
      effectiveMarkers,
      fileManifestEntries,
    );
    const pickMetaEntry = (key: "id" | "title" | "status"): SpecMapEntry | undefined =>
      validMetaEntries.find((e) => !e.section && e.requirement === undefined && Boolean(e[key])) ??
      validMetaEntries.find((e) => Boolean(e[key]));

    const idManifestEntry = frontmatter.id ? undefined : pickMetaEntry("id");
    const titleManifestEntry = frontmatter.title ? undefined : pickMetaEntry("title");
    const statusManifestEntry = frontmatter.status ? undefined : pickMetaEntry("status");

    const specMetaSpanByKey = new Map<string, LineSpan>();
    for (const entry of [idManifestEntry, titleManifestEntry, statusManifestEntry]) {
      if (entry) specMetaSpanByKey.set(`${entry.startLine}:${entry.endLine}`, { startLine: entry.startLine, endLine: entry.endLine });
    }

    const specSeed = frontmatter.id ?? idManifestEntry?.id ?? repoRelPath;
    const firstH1 = effectiveHeadings.find((h) => h.level === 1)?.title ?? effectiveHeadings[0]?.title;
    const title = frontmatter.title ?? titleManifestEntry?.title ?? firstH1 ?? basename(repoRelPath, extname(repoRelPath));
    const status: SpecStatus = frontmatter.status ?? statusManifestEntry?.status ?? "draft";
    const statusMetaSpan = statusManifestEntry ? { startLine: statusManifestEntry.startLine, endLine: statusManifestEntry.endLine } : undefined;

    parsedDocs.push({
      repoRelPath,
      content,
      totalLines,
      specSeed,
      title,
      status,
      specMetaSpans: [...specMetaSpanByKey.values()],
      ...(statusMetaSpan ? { statusMetaSpan } : {}),
      sectionsDesynced,
      frontmatterEndLine,
      frontmatter,
      frontmatterKeyLines,
      manifestEntries: fileManifestEntries,
      rawHeadings: effectiveHeadings,
      markers: effectiveMarkers,
    });
  }

  // 4. Detect duplicate Spec `id` declarations across the corpus (§4.1 rule 2)
  const docsBySpecSeed = new Map<string, ParsedSpecDocument[]>();
  for (const doc of parsedDocs) {
    const group = docsBySpecSeed.get(doc.specSeed) ?? [];
    group.push(doc);
    docsBySpecSeed.set(doc.specSeed, group);
  }
  const ambiguousSpecSeeds = new Set<string>();
  for (const [specSeed, group] of docsBySpecSeed.entries()) {
    if (group.length > 1) {
      ambiguousSpecSeeds.add(specSeed);
      const candidates = group.map((d) => ({ file: d.repoRelPath, startLine: 1, endLine: d.totalLines, label: d.title })).sort(compareCandidates);
      recordDiagnostic("target-ambiguous", diagnosticSelectorKey(["Spec", specSeed]), `Duplicate Spec id '${specSeed}' declared in ${group.length} files`, candidates[0]?.file, candidates[0]?.startLine, candidates);
    }
  }
  const validDocs = parsedDocs.filter((d) => !ambiguousSpecSeeds.has(d.specSeed));

  // 5. Build validated target catalog from pre-extracted `knownNodes` & `knownEvidence` (M2)
  const knownEvidenceById = new Map<string, OntologyEvidenceRecord>();
  for (const ev of [...(options.knownEvidence ?? []), ...(options.knownExtraction?.evidence ?? [])]) {
    if (ev && typeof ev.id === "string" && ev.id.trim() && Array.isArray(ev.citations) && ev.citations.length > 0) knownEvidenceById.set(ev.id, ev);
  }
  const targetCatalog: TargetCatalogEntry[] = [];
  for (const kn of [...(options.knownNodes ?? []), ...(options.knownExtraction?.nodes ?? [])]) {
    if (isCompleteCatalogNode(kn, knownEvidenceById)) targetCatalog.push({ node: kn, candidate: candidateFromGraphNode(kn) });
  }

  // 6. State for emitted nodes, edges, and evidence
  const nodesById = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const evidenceById = new Map<string, OntologyEvidenceRecord>();

  const registerSpecEvidence = (sourceFile: string, startLine: number, endLine: number): { evidenceId: string; citation: AppContextFileCitation } => {
    const citation = makeFileCitation(sourceFile, startLine, endLine, commit);
    const evidenceId = `ev:${createHash("sha256").update(canonicalBytes([repoKey, sourceFile, startLine, endLine, commit]), "utf8").digest("hex").slice(0, 24)}`;
    if (!evidenceById.has(evidenceId)) evidenceById.set(evidenceId, { id: evidenceId, source_file: sourceFile, citations: [citation as unknown as OntologyCitation] });
    return { evidenceId, citation };
  };

  const buildNodeEvidenceAndCitations = (
    primaryFile: string,
    primaryStart: number,
    primaryEnd: number,
    manifestSpans: readonly LineSpan[],
  ): { evidenceRefs: string[]; citations: OntologyCitation[] } => {
    const evidenceRefs: string[] = [];
    const citations: OntologyCitation[] = [];
    const seenEv = new Set<string>();
    const addEv = (file: string, s: number, e: number): void => {
      const { evidenceId, citation } = registerSpecEvidence(file, s, e);
      if (!seenEv.has(evidenceId)) {
        seenEv.add(evidenceId);
        evidenceRefs.push(evidenceId);
        citations.push(citation as unknown as OntologyCitation);
      }
    };
    addEv(primaryFile, primaryStart, primaryEnd);
    for (const sp of manifestSpans) addEv(MANIFEST_REL_PATH, sp.startLine, sp.endLine);
    return { evidenceRefs, citations };
  };

  const includeCatalogNodeInGraph = (node: GraphNode): void => {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
    for (const ref of node.evidence_refs ?? []) {
      const ev = knownEvidenceById.get(ref);
      if (ev && !evidenceById.has(ev.id)) evidenceById.set(ev.id, ev);
    }
  };

  const formatLineLoc = (startLine: number, endLine: number): string => (startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`);

  const emitEdge = (params: {
    sourceId: string; targetId: string; relation: string; assertionBasis: string; derivationMethod: string;
    sourceFile: string; startLine: number; endLine: number; status?: OntologyStatus;
  }): void => {
    const { evidenceId, citation } = registerSpecEvidence(params.sourceFile, params.startLine, params.endLine);
    edges.push({
      source: params.sourceId, target: params.targetId, relation: params.relation, confidence: "EXTRACTED",
      status: params.status ?? "validated", assertion_basis: params.assertionBasis, derivation_method: params.derivationMethod,
      evidence_refs: [evidenceId], citations: [citation as unknown as OntologyCitation], source_file: params.sourceFile,
      source_location: formatLineLoc(params.startLine, params.endLine), startLine: params.startLine, endLine: params.endLine,
      line_start: params.startLine, line_end: params.endLine, weight: 1.0,
    });
  };

  const createRequirementRecord = (params: {
    doc: ParsedSpecDocument; reqId: string; statement?: string; parentNodeId: string;
    normativeStartLine: number; normativeEndLine: number; declFile: string; declStartLine: number; declEndLine: number;
    derivationMethod: "spec_frontmatter_requirement" | "spec_requirement_marker";
  }): RequirementRecord => {
    const reqNodeId = appContextNodeId(repoKey, "Requirement", [params.doc.specSeed, params.reqId]);
    const extraSpans = params.doc.statusMetaSpan ? [params.doc.statusMetaSpan] : [];
    const { evidenceRefs, citations } = buildNodeEvidenceAndCitations(params.declFile, params.declStartLine, params.declEndLine, extraSpans);
    nodesById.set(reqNodeId, {
      id: reqNodeId, label: params.reqId, node_type: "Requirement", file_type: "document", status: params.doc.status,
      reqId: params.reqId, specId: params.doc.specSeed, ...(params.statement ? { statement: params.statement } : {}),
      file: params.doc.repoRelPath, startLine: params.normativeStartLine, endLine: params.normativeEndLine,
      source_file: params.declFile, source_location: formatLineLoc(params.declStartLine, params.declEndLine),
      evidence_refs: evidenceRefs, citations,
    });
    emitEdge({
      sourceId: params.parentNodeId, targetId: reqNodeId, relation: "specifies", assertionBasis: "explicit_declaration",
      derivationMethod: params.derivationMethod, sourceFile: params.declFile, startLine: params.declStartLine, endLine: params.declEndLine,
    });
    return { nodeId: reqNodeId, parentNodeId: params.parentNodeId };
  };

  const specNodeIdBySeed = new Map<string, string>();
  const sectionsBySpecSeed = new Map<string, SectionRecord[]>();
  const sectionByHeadingLineBySpecSeed = new Map<string, Map<number, SectionRecord>>();
  const requirementsBySpecSeed = new Map<string, Map<string, RequirementRecord>>();
  const suppressedReqsBySpecSeed = new Map<string, Set<string>>();
  const rejectedMarkersBySpecSeed = new Map<string, Set<ParsedMarker>>();
  const rejectedEntriesBySpecSeed = new Map<string, Set<SpecMapEntry>>();

  // 7. Pass 1 over valid docs: create File, Spec, SpecSection nodes and collect ALL Requirement declarations (Rule 4, R5, R6, B1, B3, M1)
  for (const doc of validDocs) {
    const fileNodeId = appContextNodeId(repoKey, "File", [doc.repoRelPath]);
    const specNodeId = appContextNodeId(repoKey, "Spec", [doc.specSeed]);
    specNodeIdBySeed.set(doc.specSeed, specNodeId);

    const { evidenceId: fileEvId, citation: fileCitation } = registerSpecEvidence(doc.repoRelPath, 1, doc.totalLines);
    const { evidenceRefs: specEvRefs, citations: specCitations } = buildNodeEvidenceAndCitations(doc.repoRelPath, 1, doc.totalLines, doc.specMetaSpans);
    const fullDocLoc = `L1-L${doc.totalLines}`;

    nodesById.set(fileNodeId, {
      id: fileNodeId, label: doc.repoRelPath, node_type: "File", file_type: "document", status: "reference",
      path: doc.repoRelPath, file: doc.repoRelPath, startLine: 1, endLine: doc.totalLines,
      source_file: doc.repoRelPath, source_location: fullDocLoc, evidence_refs: [fileEvId], citations: [fileCitation as unknown as OntologyCitation],
    });
    nodesById.set(specNodeId, {
      id: specNodeId, label: doc.title, node_type: "Spec", file_type: "document", status: doc.status,
      specId: doc.specSeed, file: doc.repoRelPath, title: doc.title, startLine: 1, endLine: doc.totalLines, content: doc.content,
      source_file: doc.repoRelPath, source_location: fullDocLoc, evidence_refs: specEvRefs, citations: specCitations,
    });
    emitEdge({
      sourceId: fileNodeId, targetId: specNodeId, relation: "contains", assertionBasis: "explicit_declaration",
      derivationMethod: "file_spec_declaration", sourceFile: doc.repoRelPath, startLine: 1, endLine: doc.totalLines,
    });

    const sectionRecords: SectionRecord[] = [];
    const sectionByHeadingLine = new Map<number, SectionRecord>();
    const stack: Array<{ level: number; slugPath: string; nodeId: string }> = [];
    const siblingCountsByParent = new Map<string, Map<string, number>>();
    const statusExtraSpans = doc.statusMetaSpan ? [doc.statusMetaSpan] : [];

    for (let i = 0; i < doc.rawHeadings.length; i++) {
      const h = doc.rawHeadings[i]!;
      let endLine = doc.totalLines;
      for (let j = i + 1; j < doc.rawHeadings.length; j++) {
        if (doc.rawHeadings[j]!.level <= h.level) { endLine = doc.rawHeadings[j]!.lineNumber - 1; break; }
      }
      while (stack.length > 0 && stack.at(-1)!.level >= h.level) stack.pop();
      const parent = stack.at(-1);
      const parentKey = parent?.slugPath ?? "";
      const parentNodeId = parent?.nodeId ?? specNodeId;

      const baseSlug = slugifyHeading(h.title);
      let siblingMap = siblingCountsByParent.get(parentKey);
      if (!siblingMap) { siblingMap = new Map<string, number>(); siblingCountsByParent.set(parentKey, siblingMap); }
      const count = (siblingMap.get(baseSlug) ?? 0) + 1;
      siblingMap.set(baseSlug, count);
      const leafSlug = count === 1 ? baseSlug : `${baseSlug}~${count}`;
      const slugPath = parent ? `${parent.slugPath}/${leafSlug}` : leafSlug;

      const secNodeId = appContextNodeId(repoKey, "SpecSection", [doc.specSeed, slugPath]);
      const { evidenceRefs: secEvRefs, citations: secCitations } = buildNodeEvidenceAndCitations(doc.repoRelPath, h.lineNumber, endLine, statusExtraSpans);

      nodesById.set(secNodeId, {
        id: secNodeId, label: h.title, node_type: "SpecSection", file_type: "document", status: doc.status,
        specId: doc.specSeed, heading: h.title, slugPath, level: h.level, file: doc.repoRelPath,
        startLine: h.lineNumber, endLine, source_file: doc.repoRelPath, source_location: formatLineLoc(h.lineNumber, endLine),
        evidence_refs: secEvRefs, citations: secCitations,
      });
      emitEdge({
        sourceId: parentNodeId, targetId: secNodeId, relation: "contains", assertionBasis: "ast_containment",
        derivationMethod: "extract_markdown_heading", sourceFile: doc.repoRelPath, startLine: h.lineNumber, endLine,
      });

      const secRec: SectionRecord = { nodeId: secNodeId, heading: h.title, slugPath, leafSlug, file: doc.repoRelPath, startLine: h.lineNumber, endLine };
      sectionRecords.push(secRec);
      sectionByHeadingLine.set(h.lineNumber, secRec);
      stack.push({ level: h.level, slugPath, nodeId: secNodeId });
    }
    sectionsBySpecSeed.set(doc.specSeed, sectionRecords);
    sectionByHeadingLineBySpecSeed.set(doc.specSeed, sectionByHeadingLine);

    interface CollectedReqDecl {
      reqId: string; statement?: string; parentNodeId: string; normativeStartLine: number; normativeEndLine: number;
      declFile: string; declStartLine: number; declEndLine: number;
      derivationMethod: "spec_frontmatter_requirement" | "spec_requirement_marker";
    }

    const reqDeclsById = new Map<string, CollectedReqDecl[]>();
    const suppressedReqs = new Set<string>();
    const rejectedMarkers = new Set<ParsedMarker>();
    const rejectedEntries = new Set<SpecMapEntry>();

    const resolveDeclaredSection = (sectionQuery: string, declFile: string, declLine: number, forReqId?: string): SectionRecord | null => {
      const secRes = resolveSectionInSpec(sectionQuery, sectionRecords);
      const secKey = diagnosticSelectorKey(["SpecSection", doc.specSeed, sectionQuery]);
      if (secRes.status === "missing") {
        recordDiagnostic("target-unresolved", secKey, `Unresolved SpecSection '${sectionQuery}' in ${doc.repoRelPath}`, declFile, declLine);
        if (forReqId) suppressedReqs.add(forReqId);
        return null;
      }
      if (secRes.status === "ambiguous") {
        recordDiagnostic("target-ambiguous", secKey, `Ambiguous SpecSection '${sectionQuery}' in ${doc.repoRelPath}`, declFile, declLine, secRes.candidates);
        if (forReqId) suppressedReqs.add(forReqId);
        return null;
      }
      return secRes.value;
    };

    const pushReqDecl = (
      req: SpecRequirementDeclarationInput, targetSec: SectionRecord | undefined, declFile: string,
      declStart: number, declEnd: number, derivationMethod: "spec_frontmatter_requirement" | "spec_requirement_marker",
    ): void => {
      const list = reqDeclsById.get(req.id) ?? [];
      list.push({
        reqId: req.id, statement: req.statement, parentNodeId: targetSec ? targetSec.nodeId : specNodeId,
        normativeStartLine: targetSec ? targetSec.startLine : 1, normativeEndLine: targetSec ? targetSec.endLine : doc.totalLines,
        declFile, declStartLine: declStart, declEndLine: declEnd, derivationMethod,
      });
      reqDeclsById.set(req.id, list);
    };

    const addReqDecl = (
      req: SpecRequirementDeclarationInput, defaultSec: SectionRecord | undefined, declFile: string,
      declStart: number, declEnd: number, derivationMethod: "spec_frontmatter_requirement" | "spec_requirement_marker",
    ): boolean => {
      if (doc.sectionsDesynced) {
        suppressedReqs.add(req.id);
        return false;
      }
      let targetSec = defaultSec;
      if (req.section) {
        const resolved = resolveDeclaredSection(req.section, declFile, declStart, req.id);
        if (!resolved) return false;
        if (defaultSec && resolved.nodeId !== defaultSec.nodeId) {
          pushReqDecl(req, defaultSec, declFile, declStart, declEnd, derivationMethod);
          pushReqDecl(req, resolved, declFile, declStart, declEnd, derivationMethod);
          return false;
        }
        targetSec = resolved;
      }
      pushReqDecl(req, targetSec, declFile, declStart, declEnd, derivationMethod);
      return true;
    };

    const fmReqSpan = doc.frontmatterKeyLines.requirements ?? { startLine: 1, endLine: Math.max(1, doc.frontmatterEndLine) };
    for (const fmReq of doc.frontmatter.requirements ?? []) {
      addReqDecl(fmReq, undefined, doc.repoRelPath, fmReq.startLine ?? fmReqSpan.startLine, fmReq.endLine ?? fmReqSpan.endLine, "spec_frontmatter_requirement");
    }
    for (const marker of doc.markers) {
      const enclosingSec = sectionByHeadingLine.get(marker.enclosingHeadingLine);
      if (!enclosingSec) continue;
      for (const mReq of [...(typeof marker.requirement === "object" ? [marker.requirement] : []), ...marker.requirements]) {
        if (!addReqDecl(mReq, enclosingSec, doc.repoRelPath, marker.line, marker.line, "spec_requirement_marker")) {
          rejectedMarkers.add(marker);
        }
      }
    }
    for (const entry of doc.manifestEntries) {
      if (doc.sectionsDesynced && (entry.section !== undefined || entry.requirement !== undefined || (entry.requirements?.length ?? 0) > 0)) {
        rejectedEntries.add(entry);
        continue;
      }
      let entrySec: SectionRecord | undefined;
      if (entry.section) {
        const reqIdForSec = typeof entry.requirement === "object" ? entry.requirement.id : entry.requirement;
        const resolved = resolveDeclaredSection(entry.section, MANIFEST_REL_PATH, entry.startLine, reqIdForSec);
        if (!resolved) {
          rejectedEntries.add(entry);
          continue;
        }
        entrySec = resolved;
      }
      if (typeof entry.requirement === "object") {
        if (!addReqDecl(entry.requirement, entrySec, MANIFEST_REL_PATH, entry.startLine, entry.endLine, "spec_requirement_marker")) {
          rejectedEntries.add(entry);
        }
      }
      for (const mReq of entry.requirements ?? []) {
        if (!addReqDecl(mReq, entrySec, MANIFEST_REL_PATH, mReq.startLine ?? entry.startLine, mReq.endLine ?? entry.endLine, "spec_requirement_marker")) {
          rejectedEntries.add(entry);
        }
      }
    }

    const reqMap = new Map<string, RequirementRecord>();
    for (const [reqId, allDecls] of reqDeclsById.entries()) {
      if (suppressedReqs.has(reqId)) continue;
      const distinctParents = new Set(allDecls.map((d) => d.parentNodeId));
      const isAmbiguous = distinctParents.size > 1 || allDecls.length > 1;

      if (isAmbiguous) {
        suppressedReqs.add(reqId);
        const allSameNormativeSpan = allDecls.every(
          (d) => d.normativeStartLine === allDecls[0]!.normativeStartLine && d.normativeEndLine === allDecls[0]!.normativeEndLine,
        );
        const candidates = allDecls
          .map((d) => ({
            file: allSameNormativeSpan ? d.declFile : doc.repoRelPath,
            startLine: allSameNormativeSpan ? d.declStartLine : d.normativeStartLine,
            endLine: allSameNormativeSpan ? d.declEndLine : d.normativeEndLine,
            label: reqId,
          }))
          .sort(compareCandidates);
        recordDiagnostic("target-ambiguous", diagnosticSelectorKey(["Requirement", doc.specSeed, reqId]), `Duplicate or conflicting Requirement '${reqId}' in spec '${doc.specSeed}'`, doc.repoRelPath, candidates[0]?.startLine, candidates);
        continue;
      }
      reqMap.set(reqId, createRequirementRecord({ doc, ...allDecls[0]! }));
    }

    requirementsBySpecSeed.set(doc.specSeed, reqMap);
    suppressedReqsBySpecSeed.set(doc.specSeed, suppressedReqs);
    rejectedMarkersBySpecSeed.set(doc.specSeed, rejectedMarkers);
    rejectedEntriesBySpecSeed.set(doc.specSeed, rejectedEntries);
  }

  const attachDeclarationsToNode = (params: {
    sourceNodeId: string; governs: readonly TargetSelector[]; track: readonly string[]; decisions: readonly string[];
    governsMethod: "spec_frontmatter_governs" | "spec_section_marker_governs" | "spec_map_governs";
    trackMethod: "spec_frontmatter_track" | "spec_section_marker_track" | "spec_map_track";
    decisionsMethod: "spec_frontmatter_decisions" | "spec_section_marker_decisions" | "spec_map_decisions";
    sourceFile: string; startLine: number; endLine: number; governsSpan?: LineSpan; trackSpan?: LineSpan; decisionsSpan?: LineSpan;
  }): void => {
    const gSpan = params.governsSpan ?? { startLine: params.startLine, endLine: params.endLine };
    const tSpan = params.trackSpan ?? { startLine: params.startLine, endLine: params.endLine };
    const dSpan = params.decisionsSpan ?? { startLine: params.startLine, endLine: params.endLine };

    for (const selector of params.governs) {
      const selKey = selectorKeyForTarget(selector);
      const resolution = resolveTargetSelectorAgainstCatalog(selector, targetCatalog);
      if (resolution.status === "missing") {
        recordDiagnostic("target-unresolved", selKey, `Unresolved governed target '${selKey}'`, params.sourceFile, gSpan.startLine);
      } else if (resolution.status === "ambiguous") {
        recordDiagnostic("target-ambiguous", selKey, `Ambiguous governed target '${selKey}'`, params.sourceFile, gSpan.startLine, resolution.candidates);
      } else {
        includeCatalogNodeInGraph(resolution.value.node);
        emitEdge({
          sourceId: params.sourceNodeId, targetId: resolution.value.node.id, relation: "governs",
          assertionBasis: "explicit_declaration", derivationMethod: params.governsMethod,
          sourceFile: params.sourceFile, startLine: gSpan.startLine, endLine: gSpan.endLine,
        });
      }
    }

    const trackAndDecisionBindings = [
      { ids: params.track, keyTag: "Track", label: "Track ID", relation: "tracks", method: params.trackMethod, span: tSpan, resolve: resolveTrackIdAgainstCatalog },
      { ids: params.decisions, keyTag: "TrackDecision", label: "Track decision ID", relation: "decides", method: params.decisionsMethod, span: dSpan, resolve: resolveDecisionIdAgainstCatalog },
    ] as const;

    for (const binding of trackAndDecisionBindings) {
      for (const ulid of binding.ids) {
        const key = diagnosticSelectorKey([binding.keyTag, ulid]);
        const resolution = binding.resolve(ulid, targetCatalog);
        if (resolution.status === "missing") {
          recordDiagnostic("track-id-unresolved", key, `Unresolved ${binding.label} '${ulid}'`, params.sourceFile, binding.span.startLine);
        } else if (resolution.status === "ambiguous") {
          recordDiagnostic("target-ambiguous", key, `Ambiguous ${binding.label} '${ulid}'`, params.sourceFile, binding.span.startLine, resolution.candidates);
        } else {
          includeCatalogNodeInGraph(resolution.value.node);
          emitEdge({
            sourceId: resolution.value.node.id, targetId: params.sourceNodeId, relation: binding.relation,
            assertionBasis: "explicit_declaration", derivationMethod: binding.method,
            sourceFile: params.sourceFile, startLine: binding.span.startLine, endLine: binding.span.endLine,
          });
        }
      }
    }
  };

  const resolveSupersedesTarget = (targetRef: string, sourceFile: string, line: number): string | null => {
    const normPath = normalizeRelPosix(targetRef);
    const matchedDocsByPath = new Map<string, ParsedSpecDocument>();
    for (const d of parsedDocs) {
      if (d.specSeed === targetRef || d.repoRelPath === normPath) {
        matchedDocsByPath.set(d.repoRelPath, d);
        if (ambiguousSpecSeeds.has(d.specSeed)) {
          for (const dup of docsBySpecSeed.get(d.specSeed) ?? []) {
            matchedDocsByPath.set(dup.repoRelPath, dup);
          }
        }
      }
    }
    const matchedDocs = [...matchedDocsByPath.values()];
    if (matchedDocs.length === 0) {
      recordDiagnostic("target-unresolved", diagnosticSelectorKey(["Spec", targetRef]), `Unresolved superseded Spec '${targetRef}'`, sourceFile, line);
      return null;
    }
    const distinctNodeIds = new Set(
      matchedDocs.map((d) => (ambiguousSpecSeeds.has(d.specSeed) ? `ambig:${d.repoRelPath}` : specNodeIdBySeed.get(d.specSeed)!)),
    );
    if (distinctNodeIds.size > 1) {
      const candidates = matchedDocs
        .map((d) => ({ file: d.repoRelPath, startLine: 1, endLine: d.totalLines, label: d.title }))
        .sort(compareCandidates);
      recordDiagnostic("target-ambiguous", diagnosticSelectorKey(["Spec", targetRef]), `Ambiguous superseded Spec '${targetRef}'`, sourceFile, line, candidates);
      return null;
    }
    return specNodeIdBySeed.get(matchedDocs[0]!.specSeed) ?? null;
  };

  // 8. Pass 2 over valid docs: resolve and emit frontmatter, section marker, and manifest edges (Rule 4, B1, B3, B4)
  for (const doc of validDocs) {
    const specNodeId = specNodeIdBySeed.get(doc.specSeed)!;
    const sectionRecords = sectionsBySpecSeed.get(doc.specSeed) ?? [];
    const sectionByHeadingLine = sectionByHeadingLineBySpecSeed.get(doc.specSeed) ?? new Map<number, SectionRecord>();
    const reqMap = requirementsBySpecSeed.get(doc.specSeed) ?? new Map<string, RequirementRecord>();
    const suppressedReqs = suppressedReqsBySpecSeed.get(doc.specSeed) ?? new Set<string>();
    const rejectedMarkers = rejectedMarkersBySpecSeed.get(doc.specSeed) ?? new Set<ParsedMarker>();
    const rejectedEntries = rejectedEntriesBySpecSeed.get(doc.specSeed) ?? new Set<SpecMapEntry>();

    const fmSpan: LineSpan = { startLine: 1, endLine: Math.max(1, doc.frontmatterEndLine || 1) };
    const supSpan = doc.frontmatterKeyLines.supersedes ?? fmSpan;
    for (const supRef of doc.frontmatter.supersedes ?? []) {
      const targetSpecId = resolveSupersedesTarget(supRef, doc.repoRelPath, supSpan.startLine);
      if (targetSpecId) {
        emitEdge({
          sourceId: specNodeId, targetId: targetSpecId, relation: "supersedes", assertionBasis: "explicit_declaration",
          derivationMethod: "spec_frontmatter_supersedes", sourceFile: doc.repoRelPath, startLine: supSpan.startLine, endLine: supSpan.endLine,
        });
      }
    }

    attachDeclarationsToNode({
      sourceNodeId: specNodeId, governs: doc.frontmatter.governs ?? [], track: doc.frontmatter.track ?? [], decisions: doc.frontmatter.decisions ?? [],
      governsMethod: "spec_frontmatter_governs", trackMethod: "spec_frontmatter_track", decisionsMethod: "spec_frontmatter_decisions",
      sourceFile: doc.repoRelPath, startLine: fmSpan.startLine, endLine: fmSpan.endLine,
      governsSpan: doc.frontmatterKeyLines.governs ?? fmSpan, trackSpan: doc.frontmatterKeyLines.track ?? fmSpan, decisionsSpan: doc.frontmatterKeyLines.decisions ?? fmSpan,
    });

    for (const marker of doc.markers) {
      if (rejectedMarkers.has(marker)) continue;
      const enclosingSec = sectionByHeadingLine.get(marker.enclosingHeadingLine);
      if (!enclosingSec) continue;
      let targetSourceNodeId = enclosingSec.nodeId;
      if (marker.requirement !== undefined) {
        const reqId = typeof marker.requirement === "string" ? marker.requirement : marker.requirement.id;
        if (suppressedReqs.has(reqId)) continue;
        const reqRec = reqMap.get(reqId);
        if (!reqRec || reqRec.parentNodeId !== enclosingSec.nodeId) {
          recordDiagnostic("target-unresolved", diagnosticSelectorKey(["Requirement", doc.specSeed, reqId]), `Unresolved Requirement '${reqId}' in ${doc.repoRelPath}`, doc.repoRelPath, marker.line);
          continue;
        }
        targetSourceNodeId = reqRec.nodeId;
      }
      attachDeclarationsToNode({
        sourceNodeId: targetSourceNodeId, governs: marker.governs, track: marker.track, decisions: marker.decisions,
        governsMethod: "spec_section_marker_governs", trackMethod: "spec_section_marker_track", decisionsMethod: "spec_section_marker_decisions",
        sourceFile: doc.repoRelPath, startLine: marker.line, endLine: marker.line,
      });
    }

    for (const entry of doc.manifestEntries) {
      if (rejectedEntries.has(entry)) continue;
      let entrySourceNodeId = specNodeId;
      if (entry.section) {
        const secRes = resolveSectionInSpec(entry.section, sectionRecords);
        if (secRes.status !== "unique") continue;
        entrySourceNodeId = secRes.value.nodeId;
      }
      if (entry.requirement !== undefined) {
        const reqId = typeof entry.requirement === "string" ? entry.requirement : entry.requirement.id;
        if (suppressedReqs.has(reqId)) continue;
        const reqRec = reqMap.get(reqId);
        if (!reqRec || (entry.section && reqRec.parentNodeId !== entrySourceNodeId)) {
          recordDiagnostic("target-unresolved", diagnosticSelectorKey(["Requirement", doc.specSeed, reqId]), `Unresolved Requirement '${reqId}' in ${doc.repoRelPath}`, MANIFEST_REL_PATH, entry.startLine);
          continue;
        }
        entrySourceNodeId = reqRec.nodeId;
      }
      for (const supRef of entry.supersedes ?? []) {
        const targetSpecId = resolveSupersedesTarget(supRef, MANIFEST_REL_PATH, entry.startLine);
        if (targetSpecId) {
          emitEdge({
            sourceId: specNodeId, targetId: targetSpecId, relation: "supersedes", assertionBasis: "explicit_declaration",
            derivationMethod: "spec_map_supersedes", sourceFile: MANIFEST_REL_PATH, startLine: entry.startLine, endLine: entry.endLine,
          });
        }
      }
      attachDeclarationsToNode({
        sourceNodeId: entrySourceNodeId, governs: entry.governs ?? [], track: entry.track ?? [], decisions: entry.decisions ?? [],
        governsMethod: "spec_map_governs", trackMethod: "spec_map_track", decisionsMethod: "spec_map_decisions",
        sourceFile: MANIFEST_REL_PATH, startLine: entry.startLine, endLine: entry.endLine,
      });
    }
  }

  const nodes = [...nodesById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const evidence = [...evidenceById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const diagnostics = [...diagnosticsById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const relations = buildAppContextRelationRecords(edges);
  const extraction: Extraction = { nodes, edges, evidence, input_tokens: 0, output_tokens: 0 };

  return { nodes, edges, evidence, relations, diagnostics, extraction };
}
