// Zero-dependency Mermaid-strict codec for archi@1 descriptions (P2-PARTITION-NOTE.r3.md, grammar engram.archi-mermaid/1).
import type {
  ArchiActiveHierarchy,
} from "../ontology-guardian/archi-cards.js";
import type {
  ArchiLanguage,
  ArchiManifest,
} from "../ontology-guardian/archi-check.js";
import type {
  ArchiLayoutGroup,
  ArchiLayoutHints,
  ArchiViewSpec,
  ArchiViewSpecLegend,
  ArchiViewSpecLegendToken,
} from "../ontology-guardian/archi-view.js";
import type { EngramDiagnostic } from "../ontology-guardian/diagnostics.js";
import type {
  NativeAttributeValue,
  NativeSemanticDocument,
} from "../ontology-guardian/diagram-native-types.js";
import type { Pin } from "../ontology-guardian/types.js";

type NativeEntity = NativeSemanticDocument["entities"][string];
type NativeRelation = NativeSemanticDocument["relations"][string];

export type {
  ArchiLanguage,
  ArchiLayoutGroup,
  ArchiLayoutHints,
  ArchiManifest,
  ArchiViewSpec,
  ArchiViewSpecLegend,
  ArchiViewSpecLegendToken,
};

/** Closed 10-code diagnostic inventory for the engram.archi-mermaid/1 codec (P-2 r3 §7). */
export const ARCHI_MERMAID_DIAGNOSTIC_CODES = Object.freeze([
  "mermaid-strict-invalid",
  "mermaid-strict-unsupported",
  "mermaid-strict-annotation-unknown",
  "mermaid-strict-duplicate",
  "mermaid-strict-duplicate-datum",
  "mermaid-strict-orphan-ref",
  "mermaid-strict-placement-drift",
  "mermaid-strict-style-drift",
  "mermaid-strict-noncanonical",
  "mermaid-strict-unrepresentable",
] as const);

export type ArchiMermaidDiagnosticCode = (typeof ARCHI_MERMAID_DIAGNOSTIC_CODES)[number];

/** Narrowed EngramDiagnostic envelope returned by the engram.archi-mermaid/1 codec (P-2 r3 §7). */
export interface ArchiMermaidDiagnostic extends EngramDiagnostic {
  readonly origin: "engram";
  readonly severity: "error";
  readonly code: ArchiMermaidDiagnosticCode;
  readonly nativeCode: ArchiMermaidDiagnosticCode;
  readonly path: string;
  readonly subjectRef: string;
}

/**
 * Discriminated result union returned by `parseArchiMermaid`, `printArchiMermaid`,
 * and `formatArchiMermaid`. Never throws.
 */
export type ArchiMermaidResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly [ArchiMermaidDiagnostic, ...ArchiMermaidDiagnostic[]] };

/**
 * Authored triple S = (ArchiManifest, NativeSemanticDocument, ArchiViewSpec[]) (P-2 r3 §1).
 *
 * Canonical ordering:
 * - `views` is ordered by derived `view-specs/<localId>.json` path in UTF-16 code unit order,
 *   matching `manifest.views`.
 * - Within `ArchiViewSpecLegend`, `tokens` are ordered by UTF-16 code unit order of the decoded
 *   model `category` string (`ArchiViewSpecLegendToken.category`), not by the raw `ASTRING` lexeme.
 */
export interface ArchiSourceTriple {
  readonly manifest: ArchiManifest;
  readonly document: NativeSemanticDocument;
  readonly views: readonly ArchiViewSpec[];
}

export interface ArchiMermaidParseOptions {
  readonly checkCanonical?: boolean;
  readonly subjectRef?: string;
}

export interface ArchiMermaidFormatOptions {
  readonly check?: boolean;
  readonly subjectRef?: string;
}

export interface ArchiMermaidPrintOptions {
  readonly subjectRef?: string;
}

const DEFAULT_SUBJECT_REF = ".engram/architecture/architecture.mmd";

class ArchiMermaidRefusal extends Error {
  readonly diagnostic: ArchiMermaidDiagnostic;

  constructor(
    code: ArchiMermaidDiagnosticCode,
    message: string,
    path: string,
    subjectRef: string = DEFAULT_SUBJECT_REF,
  ) {
    super(message);
    this.name = "ArchiMermaidRefusal";
    this.diagnostic = {
      origin: "engram",
      severity: "error",
      code,
      nativeCode: code,
      message,
      path,
      subjectRef,
    };
  }
}

function resolveSubjectRef(options: unknown): string {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    const sr = (options as { readonly subjectRef?: unknown }).subjectRef;
    if (typeof sr === "string") return sr;
  }
  return DEFAULT_SUBJECT_REF;
}

function settle<T>(
  fn: () => T,
  fallbackCode: ArchiMermaidDiagnosticCode,
  fallbackPath: string,
  subjectRef: string,
): ArchiMermaidResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof ArchiMermaidRefusal) {
      return { ok: false, diagnostics: [e.diagnostic] };
    }
    const rawMsg = e instanceof Error ? e.message : String(e);
    const message =
      fallbackCode === "mermaid-strict-invalid" && !/column \d+/.test(rawMsg)
        ? `${rawMsg} (at column 1)`
        : rawMsg;
    return {
      ok: false,
      diagnostics: [
        {
          origin: "engram",
          severity: "error",
          code: fallbackCode,
          nativeCode: fallbackCode,
          message,
          path: fallbackPath,
          subjectRef,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Grammar constants & pinned profile tables (zero runtime imports)
// ---------------------------------------------------------------------------

const LOCAL_RE = /^[a-z][a-z0-9-]{0,39}$/;
const EID_RE = /^e_[a-z][a-z0-9_]{0,39}$/;
const NAME_RE = /^[a-z][a-zA-Z0-9]*$/;
const WORD_RE = /^[a-z][a-z0-9-]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const VERSION_RE = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const TOKEN_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

type AttrKind = "text" | "enum" | "collection";

interface AttrDecl {
  readonly name: string;
  readonly kind: AttrKind;
}

interface EntityTypeSpec {
  readonly profile: "archi@1" | "generic@2";
  readonly rank: number;
  readonly container: boolean;
  readonly forms: ReadonlySet<string> | null;
  readonly attrs: readonly AttrDecl[];
  readonly attrMap: ReadonlyMap<string, AttrKind>;
}

interface RelationTypeSpec {
  readonly profile: "archi@1" | "generic@2";
  readonly rank: number;
  readonly roles: readonly [string, string];
  readonly attrs: readonly AttrDecl[];
  readonly attrMap: ReadonlyMap<string, AttrKind>;
}

const COMMON_ARCHI_ENTITY_ATTRS: readonly AttrDecl[] = [
  { name: "shortName", kind: "text" },
  { name: "role", kind: "text" },
  { name: "lifecycle", kind: "enum" },
  { name: "evidence", kind: "collection" },
  { name: "category", kind: "text" },
];

const COMMON_ARCHI_REL_ATTRS: readonly AttrDecl[] = [
  { name: "lifecycle", kind: "enum" },
  { name: "evidence", kind: "collection" },
  { name: "label", kind: "text" },
];

function makeEntitySpec(
  profile: "archi@1" | "generic@2",
  rank: number,
  container: boolean,
  forms: readonly string[] | null,
  attrs: readonly AttrDecl[],
): EntityTypeSpec {
  return {
    profile,
    rank,
    container,
    forms: forms ? new Set(forms) : null,
    attrs,
    attrMap: new Map(attrs.map((a) => [a.name, a.kind])),
  };
}

function makeRelSpec(
  profile: "archi@1" | "generic@2",
  rank: number,
  roles: readonly [string, string],
  attrs: readonly AttrDecl[],
): RelationTypeSpec {
  return {
    profile,
    rank,
    roles,
    attrs,
    attrMap: new Map(attrs.map((a) => [a.name, a.kind])),
  };
}

const ENTITY_SPECS: ReadonlyMap<string, EntityTypeSpec> = new Map<string, EntityTypeSpec>([
  ["actor", makeEntitySpec("archi@1", 0, false, ["human", "agent", "team", "org"], COMMON_ARCHI_ENTITY_ATTRS)],
  ["system", makeEntitySpec("archi@1", 1, true, null, COMMON_ARCHI_ENTITY_ATTRS)],
  ["repo", makeEntitySpec("archi@1", 2, true, null, [...COMMON_ARCHI_ENTITY_ATTRS, { name: "url", kind: "text" }])],
  ["package", makeEntitySpec("archi@1", 3, true, ["library", "plugin", "app"], [...COMMON_ARCHI_ENTITY_ATTRS, { name: "version", kind: "text" }])],
  ["component", makeEntitySpec("archi@1", 4, false, null, COMMON_ARCHI_ENTITY_ATTRS)],
  ["runtime", makeEntitySpec("archi@1", 5, false, ["cli", "mcp-server", "daemon", "job", "hook"], COMMON_ARCHI_ENTITY_ATTRS)],
  ["service", makeEntitySpec("archi@1", 6, false, null, COMMON_ARCHI_ENTITY_ATTRS)],
  ["api", makeEntitySpec("archi@1", 7, false, ["mcp", "http", "cli"], [...COMMON_ARCHI_ENTITY_ATTRS, { name: "access", kind: "enum" }])],
  ["store", makeEntitySpec("archi@1", 8, false, ["jsonl", "file", "database", "object-store", "graph"], [...COMMON_ARCHI_ENTITY_ATTRS, { name: "writerPolicy", kind: "enum" }])],
  ["artifact", makeEntitySpec("archi@1", 9, false, ["skill", "manifest", "schema", "doc"], COMMON_ARCHI_ENTITY_ATTRS)],
  ["host", makeEntitySpec("archi@1", 10, true, ["workstation", "cluster", "cloud-project"], COMMON_ARCHI_ENTITY_ATTRS)],
  ["legend", makeEntitySpec("generic@2", 2, true, null, [{ name: "description", kind: "text" }])],
  ["legend-key", makeEntitySpec("generic@2", 3, false, null, [{ name: "category", kind: "text" }, { name: "description", kind: "text" }])],
]);

const RELATION_SPECS: ReadonlyMap<string, RelationTypeSpec> = new Map<string, RelationTypeSpec>([
  ["partOf", makeRelSpec("archi@1", 0, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["managedIn", makeRelSpec("archi@1", 1, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["runsOn", makeRelSpec("archi@1", 2, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["ownedBy", makeRelSpec("archi@1", 3, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["operatedBy", makeRelSpec("archi@1", 4, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["deployedAs", makeRelSpec("archi@1", 5, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["dependsOn", makeRelSpec("archi@1", 6, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["executedBy", makeRelSpec("archi@1", 7, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["loadedBy", makeRelSpec("archi@1", 8, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  [
    "invokes",
    makeRelSpec("archi@1", 9, ["source", "target"], [
      ...COMMON_ARCHI_REL_ATTRS,
      { name: "trigger", kind: "enum" },
      { name: "event", kind: "text" },
    ]),
  ],
  ["providesApi", makeRelSpec("archi@1", 10, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["consumesApi", makeRelSpec("archi@1", 11, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["uses", makeRelSpec("archi@1", 12, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  [
    "accesses",
    makeRelSpec("archi@1", 13, ["source", "target"], [
      ...COMMON_ARCHI_REL_ATTRS,
      { name: "mode", kind: "enum" },
    ]),
  ],
  ["documents", makeRelSpec("archi@1", 14, ["source", "target"], COMMON_ARCHI_REL_ATTRS)],
  ["contains", makeRelSpec("generic@2", 1, ["parent", "child"], [])],
]);

const STRUCTURAL_DL_KEYWORDS = new Set([
  "format",
  "document",
  "schema",
  "revision",
  "language",
  "owning-repo",
  "profile",
  "pin",
  "entity",
  "nest",
  "edge",
  "rel",
  "view",
  "draw",
  "expanded",
  "legend",
  "key",
  "token",
  "stretch",
  "gap",
  "order",
  "group",
  "item",
]);

const HEAD_KEYWORDS = new Set([
  "format",
  "document",
  "schema",
  "revision",
  "language",
  "owning-repo",
  "profile",
  "pin",
]);

const VIEW_BODY_KEYWORDS = new Set([
  "draw",
  "expanded",
  "legend",
  "key",
  "token",
  "stretch",
  "gap",
  "order",
  "group",
  "item",
]);

const UNSUPPORTED_STATEMENT_HEADS = new Set([
  "graph",
  "direction",
  "style",
  "linkStyle",
  "click",
  "call",
  "href",
  "accTitle",
  "accDescr",
]);

const ALL_DECLARED_ATTR_NAMES = new Set([
  "shortName",
  "role",
  "lifecycle",
  "evidence",
  "category",
  "url",
  "version",
  "access",
  "writerPolicy",
  "description",
  "label",
  "trigger",
  "event",
  "mode",
]);

type GapField = keyof Pick<ArchiLayoutHints, "cardGapX" | "cardGapY" | "zoneGapX" | "zoneGapY" | "rankGap">;

const GAP_ORDER: readonly (readonly [string, GapField])[] = [
  ["card-x", "cardGapX"],
  ["card-y", "cardGapY"],
  ["zone-x", "zoneGapX"],
  ["zone-y", "zoneGapY"],
  ["rank", "rankGap"],
];

const GAP_KEY_TO_FIELD: ReadonlyMap<string, GapField> = new Map<string, GapField>(GAP_ORDER);

// Closed key sets for print domain M (m1)
const TRIPLE_KEYS: ReadonlySet<string> = new Set(["manifest", "document", "views"]);
const MANIFEST_KEYS: ReadonlySet<string> = new Set([
  "format",
  "language",
  "owningRepo",
  "document",
  "views",
  "profilePins",
  "cardsPin",
  "viewSchemaPin",
]);
const PIN_KEYS: ReadonlySet<string> = new Set(["id", "version", "contentDigest"]);
const DOCUMENT_KEYS: ReadonlySet<string> = new Set([
  "documentId",
  "schemaVersion",
  "revision",
  "profileRefs",
  "typeDefinitions",
  "entities",
  "relations",
  "ports",
  "resources",
  "extensions",
]);
const SCHEMA_VERSION_KEYS: ReadonlySet<string> = new Set(["major", "minor"]);
const ENTITY_KEYS: ReadonlySet<string> = new Set(["id", "profile", "type", "attributes"]);
const RELATION_KEYS: ReadonlySet<string> = new Set(["id", "profile", "type", "endpoints", "attributes"]);
const ENDPOINT_KEYS: ReadonlySet<string> = new Set(["role", "target"]);
const ATTR_SCALAR_KEYS: ReadonlySet<string> = new Set(["kind", "value"]);
const ATTR_COLLECTION_KEYS: ReadonlySet<string> = new Set(["kind", "items"]);
const VIEW_KEYS: ReadonlySet<string> = new Set([
  "format",
  "viewId",
  "activeHierarchy",
  "draw",
  "collapsed",
  "legend",
  "layout",
]);
const LEGEND_KEYS: ReadonlySet<string> = new Set(["legendRef", "title", "order", "tokens"]);
const TOKEN_KEYS: ReadonlySet<string> = new Set(["category", "token"]);
const LAYOUT_KEYS: ReadonlySet<string> = new Set([
  "stretch",
  "cardGapX",
  "cardGapY",
  "zoneGapX",
  "zoneGapY",
  "rankGap",
  "ordering",
  "grouping",
]);
const GROUP_KEYS: ReadonlySet<string> = new Set(["id", "direction", "stretch", "gapAfter", "items"]);

// ---------------------------------------------------------------------------
// Helpers: pointers, byte comparison, EID mapping, string escaping
// ---------------------------------------------------------------------------

function escPtr(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function cmpBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function trimSp(s: string): string {
  return s.replace(/^ +| +$/g, "");
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object" && !Array.isArray(val);
}

function isNonNegSafeInt(val: unknown): val is number {
  return typeof val === "number" && Number.isSafeInteger(val) && val >= 0;
}

function isSafeIntDecString(s: string): boolean {
  return INT_RE.test(s) && Number.isSafeInteger(Number(s));
}

function isSafeVersionString(s: string): boolean {
  return VERSION_RE.test(s) && s.split(".").every((seg) => Number.isSafeInteger(Number(seg)));
}

function toEid(entityId: string): string {
  const local = entityId.slice("entity:".length);
  return `e_${local.replace(/-/g, "_")}`;
}

function fromEid(eid: string): string {
  return `entity:${eid.slice(2).replace(/_/g, "-")}`;
}

let activeParseLines: readonly string[] = [];

function defaultLineColumn(lineIdx: number): number {
  const line = activeParseLines[lineIdx];
  if (typeof line !== "string" || line.length === 0) return 1;
  let idx = 0;
  while (idx < line.length && line.charCodeAt(idx) === 0x20) {
    idx++;
  }
  return idx < line.length ? idx + 1 : 1;
}

function failParse(
  code: ArchiMermaidDiagnosticCode,
  lineIdx: number,
  message: string,
  subjectRef: string,
  col?: number,
): never {
  const resolvedCol = col ?? defaultLineColumn(lineIdx);
  const fullMessage = /column \d+/.test(message) ? message : `${message} (at column ${resolvedCol})`;
  throw new ArchiMermaidRefusal(code, fullMessage, `/${lineIdx}`, subjectRef);
}

function failPrint(
  path: string,
  subjectRef: string,
  message: string,
): never {
  throw new ArchiMermaidRefusal("mermaid-strict-unrepresentable", message, path, subjectRef);
}

function assertExactKeysForPrint(
  obj: unknown,
  allowed: ReadonlySet<string>,
  path: string,
  subjectRef: string,
): Record<string, unknown> {
  if (!isPlainObject(obj)) {
    failPrint(path, subjectRef, `Expected object at ${path || "/"}.`);
  }
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      const kPath = path === "" ? `/${escPtr(k)}` : `${path}/${escPtr(k)}`;
      failPrint(kPath, subjectRef, `Unknown or unrepresentable field '${k}'.`);
    }
  }
  return obj;
}

function hasInvalidScalarOrControl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      if (i + 1 >= s.length) return true;
      const next = s.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const VSTRING_ENCODE_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  ['"', "#34;"],
  ["#", "#35;"],
  ["&", "#38;"],
  ["<", "#60;"],
  [">", "#62;"],
  ["[", "#91;"],
  ["]", "#93;"],
  ["`", "#96;"],
  ["{", "#123;"],
  ["|", "#124;"],
  ["\u2028", "#8232;"],
  ["\u2029", "#8233;"],
]);

const VSTRING_DECODE_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  ["#34;", '"'],
  ["#35;", "#"],
  ["#38;", "&"],
  ["#60;", "<"],
  ["#62;", ">"],
  ["#91;", "["],
  ["#93;", "]"],
  ["#96;", "`"],
  ["#123;", "{"],
  ["#124;", "|"],
  ["#8232;", "\u2028"],
  ["#8233;", "\u2029"],
]);

const VSTRING_RAW_FORBIDDEN = new Set([
  '"',
  "&",
  "<",
  ">",
  "[",
  "]",
  "`",
  "{",
  "|",
  "\u2028",
  "\u2029",
]);

function encodeVString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const esc = VSTRING_ENCODE_MAP.get(ch);
    out += esc !== undefined ? esc : ch;
  }
  return `${out}"`;
}

function decodeVString(raw: string, lineIdx: number, subjectRef: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    failParse("mermaid-strict-invalid", lineIdx, "Expected quoted VSTRING.", subjectRef);
  }
  const inner = raw.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (VSTRING_RAW_FORBIDDEN.has(ch)) {
      failParse("mermaid-strict-invalid", lineIdx, `Unescaped character '${ch}' in VSTRING.`, subjectRef);
    }
    if (ch === "#") {
      const semi = inner.indexOf(";", i + 1);
      if (semi === -1) {
        failParse("mermaid-strict-invalid", lineIdx, "Unescaped '#' in VSTRING.", subjectRef);
      }
      const code = inner.slice(i, semi + 1);
      const decoded = VSTRING_DECODE_MAP.get(code);
      if (decoded === undefined) {
        failParse("mermaid-strict-invalid", lineIdx, `Unknown entity escape '${code}' in VSTRING.`, subjectRef);
      }
      out += decoded;
      i = semi;
    } else {
      out += ch;
    }
  }
  return out;
}

function encodeAString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "{") out += "\\u007b";
    else if (ch === "\u2028") out += "\\u2028";
    else if (ch === "\u2029") out += "\\u2029";
    else out += ch;
  }
  return `${out}"`;
}

function decodeAString(raw: string, lineIdx: number, subjectRef: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    failParse("mermaid-strict-invalid", lineIdx, "Expected quoted ASTRING.", subjectRef);
  }
  const inner = raw.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === '"' || ch === "{" || ch === "\u2028" || ch === "\u2029") {
      failParse("mermaid-strict-invalid", lineIdx, "Unescaped character in ASTRING.", subjectRef);
    }
    if (ch === "\\") {
      if (i + 1 >= inner.length) {
        failParse("mermaid-strict-invalid", lineIdx, "Trailing backslash in ASTRING.", subjectRef);
      }
      const next = inner[i + 1]!;
      if (next === '"') {
        out += '"';
        i += 1;
      } else if (next === "\\") {
        out += "\\";
        i += 1;
      } else if (inner.startsWith("\\u007b", i)) {
        out += "{";
        i += 5;
      } else if (inner.startsWith("\\u2028", i)) {
        out += "\u2028";
        i += 5;
      } else if (inner.startsWith("\\u2029", i)) {
        out += "\u2029";
        i += 5;
      } else {
        failParse("mermaid-strict-invalid", lineIdx, "Invalid escape sequence in ASTRING.", subjectRef);
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function getAttrString(
  attrs: Readonly<Record<string, NativeAttributeValue>> | undefined,
  key: string,
): string | undefined {
  if (!attrs || !Object.hasOwn(attrs, key)) return undefined;
  const v = attrs[key] as { readonly kind?: string; readonly value?: unknown } | undefined;
  return typeof v?.value === "string" ? v.value : undefined;
}

function computeRelationPlacement(
  relType: string,
  srcEntity: { readonly type: string },
  tgtEntity: { readonly type: string; readonly attributes: Readonly<Record<string, NativeAttributeValue>> },
  relAttrs: Readonly<Record<string, NativeAttributeValue>>,
): "nest" | "edge" | "rel" {
  if (relType === "partOf" || relType === "contains") return "nest";
  if (
    relType === "managedIn" ||
    relType === "runsOn" ||
    relType === "ownedBy" ||
    relType === "operatedBy" ||
    relType === "providesApi" ||
    relType === "uses"
  ) {
    return "rel";
  }
  if (relType === "executedBy" || relType === "loadedBy") {
    return srcEntity.type === "package" ? "edge" : "rel";
  }
  if (relType === "accesses") {
    const mode = getAttrString(relAttrs, "mode");
    if (mode === "read") return "rel";
    const wp = getAttrString(tgtEntity.attributes, "writerPolicy");
    return wp === "single-writer" ? "rel" : "edge";
  }
  return "edge";
}

// ---------------------------------------------------------------------------
// printOrRefuse(triple): Model M -> Canonical Mermaid-strict text
// ---------------------------------------------------------------------------

function checkPrintString(val: unknown, path: string, subjectRef: string): string {
  if (typeof val !== "string" || hasInvalidScalarOrControl(val)) {
    failPrint(path, subjectRef, `Invalid or unrepresentable string at ${path}.`);
  }
  return val;
}

function checkAttributeMapForPrint(
  attrs: unknown,
  specAttrs: ReadonlyMap<string, AttrKind>,
  options: {
    readonly path: string;
    readonly subjectRef: string;
    readonly isEntity: boolean;
    readonly profile: "archi@1" | "generic@2";
    readonly forms: ReadonlySet<string> | null;
  },
): Readonly<Record<string, NativeAttributeValue>> {
  if (!isPlainObject(attrs)) {
    failPrint(options.path, options.subjectRef, `Missing attributes object at ${options.path}.`);
  }
  const rec = attrs as Record<string, NativeAttributeValue>;

  if (options.isEntity) {
    if (!Object.hasOwn(rec, "name")) {
      failPrint(`${options.path}/name`, options.subjectRef, "Entity requires text attribute 'name'.");
    }
    const nameAttr = assertExactKeysForPrint(rec["name"], ATTR_SCALAR_KEYS, `${options.path}/name`, options.subjectRef);
    if (nameAttr["kind"] !== "text") {
      failPrint(`${options.path}/name`, options.subjectRef, "Entity requires text attribute 'name'.");
    }
    checkPrintString(nameAttr["value"], `${options.path}/name/value`, options.subjectRef);
  }

  if (options.profile === "archi@1") {
    if (!Object.hasOwn(rec, "lifecycle")) {
      failPrint(`${options.path}/lifecycle`, options.subjectRef, "archi@1 record requires valid lifecycle.");
    }
  } else if (Object.hasOwn(rec, "lifecycle")) {
    failPrint(`${options.path}/lifecycle`, options.subjectRef, "generic@2 record cannot carry lifecycle.");
  }

  for (const [k, rawVal] of Object.entries(rec)) {
    const attrPath = `${options.path}/${escPtr(k)}`;
    if (options.isEntity && k === "name") continue;
    if (options.isEntity && k === "form") {
      if (!options.forms) {
        failPrint(attrPath, options.subjectRef, "Type does not declare form.");
      }
      const formVal = assertExactKeysForPrint(rawVal, ATTR_SCALAR_KEYS, attrPath, options.subjectRef);
      if (
        formVal["kind"] !== "enum" ||
        typeof formVal["value"] !== "string" ||
        hasInvalidScalarOrControl(formVal["value"]) ||
        !WORD_RE.test(formVal["value"])
      ) {
        failPrint(attrPath, options.subjectRef, "Invalid form attribute value.");
      }
      continue;
    }
    const expectedKind = specAttrs.get(k);
    if (!expectedKind) {
      failPrint(attrPath, options.subjectRef, `Undeclared attribute '${k}'.`);
    }
    const v = assertExactKeysForPrint(
      rawVal,
      expectedKind === "collection" ? ATTR_COLLECTION_KEYS : ATTR_SCALAR_KEYS,
      attrPath,
      options.subjectRef,
    );
    if (v["kind"] !== expectedKind) {
      failPrint(attrPath, options.subjectRef, `Attribute '${k}' kind mismatch.`);
    }
    if (expectedKind === "text") {
      checkPrintString(v["value"], `${attrPath}/value`, options.subjectRef);
    } else if (expectedKind === "enum") {
      const s = checkPrintString(v["value"], `${attrPath}/value`, options.subjectRef);
      if (!WORD_RE.test(s)) {
        failPrint(`${attrPath}/value`, options.subjectRef, `Enum attribute '${k}' must be a WORD.`);
      }
    } else if (expectedKind === "collection") {
      const items = v["items"];
      if (!Array.isArray(items)) {
        failPrint(`${attrPath}/items`, options.subjectRef, `Collection '${k}' items must be an array.`);
      }
      for (let i = 0; i < items.length; i++) {
        const item = assertExactKeysForPrint(items[i], ATTR_SCALAR_KEYS, `${attrPath}/items/${i}`, options.subjectRef);
        if (item["kind"] !== "text") {
          failPrint(`${attrPath}/items/${i}`, options.subjectRef, `Collection '${k}' item must be text.`);
        }
        checkPrintString(item["value"], `${attrPath}/items/${i}/value`, options.subjectRef);
      }
    }
  }
  return rec;
}

function emitAttributeLines(
  lines: string[],
  indent: string,
  attrDecls: readonly AttrDecl[],
  attrs: Readonly<Record<string, NativeAttributeValue>>,
  omitLabel: boolean,
): void {
  for (const decl of attrDecls) {
    if (omitLabel && decl.name === "label") continue;
    if (!Object.hasOwn(attrs, decl.name)) continue;
    const raw = attrs[decl.name];
    if (raw === undefined) continue;
    if (decl.name === "lifecycle") {
      const val = (raw as { readonly value: string }).value;
      if (val === "current") continue;
      lines.push(`${indent}%% @dl lifecycle ${val}`);
      continue;
    }
    if (decl.kind === "text") {
      const val = (raw as { readonly value: string }).value;
      lines.push(`${indent}%% @dl ${decl.name} ${encodeAString(val)}`);
    } else if (decl.kind === "enum") {
      const val = (raw as { readonly value: string }).value;
      lines.push(`${indent}%% @dl ${decl.name} ${val}`);
    } else if (decl.kind === "collection") {
      const items = (raw as { readonly items: readonly { readonly value: string }[] }).items;
      if (items.length === 0) {
        lines.push(`${indent}%% @dl ${decl.name} []`);
      } else {
        for (const item of items) {
          lines.push(`${indent}%% @dl ${decl.name} ${encodeAString(item.value)}`);
        }
      }
    }
  }
}

function validatePinForPrint(pin: unknown, path: string, subjectRef: string): Pin {
  const p = assertExactKeysForPrint(pin, PIN_KEYS, path, subjectRef);
  const id = checkPrintString(p["id"], `${path}/id`, subjectRef);
  const version = checkPrintString(p["version"], `${path}/version`, subjectRef);
  const digest = checkPrintString(p["contentDigest"], `${path}/contentDigest`, subjectRef);
  if (!WORD_RE.test(id) || !isSafeVersionString(version) || !HEX64_RE.test(digest)) {
    failPrint(path, subjectRef, `Malformed pin fields at ${path}.`);
  }
  return pin as Pin;
}

function printOrRefuse(triple: unknown, defaultRef: string): string {
  const topObj = assertExactKeysForPrint(triple, TRIPLE_KEYS, "", defaultRef);
  const manifestObj = assertExactKeysForPrint(topObj["manifest"], MANIFEST_KEYS, "/manifest", defaultRef);
  const docObj = assertExactKeysForPrint(topObj["document"], DOCUMENT_KEYS, "/document", defaultRef);
  const views = topObj["views"];
  if (!Array.isArray(views)) {
    failPrint("/views", defaultRef, "Views must be an array.");
  }
  const manifest = manifestObj as unknown as ArchiManifest;
  const document = docObj as unknown as NativeSemanticDocument;

  // M1, M2: document header & empty buckets
  const docId = checkPrintString(document.documentId, "/document/documentId", defaultRef);
  if (!docId.startsWith("document:")) {
    failPrint("/document/documentId", docId || defaultRef, "documentId must start with 'document:'.");
  }
  const docLocal = docId.slice("document:".length);
  if (!LOCAL_RE.test(docLocal)) {
    failPrint("/document/documentId", docId, "Invalid document local id.");
  }

  const sv = assertExactKeysForPrint(document.schemaVersion, SCHEMA_VERSION_KEYS, "/document/schemaVersion", docId);
  if (!isNonNegSafeInt(sv["major"]) || !isNonNegSafeInt(sv["minor"])) {
    failPrint("/document/schemaVersion", docId, "Invalid schemaVersion.");
  }
  if (!isNonNegSafeInt(document.revision)) {
    failPrint("/document/revision", docId, "Invalid revision.");
  }

  if (!Array.isArray(document.profileRefs) || document.profileRefs.length === 0) {
    failPrint("/document/profileRefs", docId, "profileRefs must be a non-empty array.");
  }
  const profileRank = new Map<string, number>();
  for (let i = 0; i < document.profileRefs.length; i++) {
    const ref = checkPrintString(document.profileRefs[i], `/document/profileRefs/${i}`, docId);
    if (ref !== "archi@1" && ref !== "generic@2") {
      failPrint(`/document/profileRefs/${i}`, docId, `Unsupported profileRef '${ref}'.`);
    }
    if (profileRank.has(ref)) {
      failPrint(`/document/profileRefs/${i}`, docId, `Duplicate profileRef '${ref}'.`);
    }
    profileRank.set(ref, i);
  }

  if (!isPlainObject(document.typeDefinitions) || Object.keys(document.typeDefinitions).length > 0) {
    failPrint("/document/typeDefinitions", docId, "typeDefinitions must be empty.");
  }
  if (!isPlainObject(document.ports) || Object.keys(document.ports).length > 0) {
    failPrint("/document/ports", docId, "ports must be empty.");
  }
  if (!isPlainObject(document.resources) || Object.keys(document.resources).length > 0) {
    failPrint("/document/resources", docId, "resources must be empty.");
  }
  if (!Array.isArray(document.extensions) || document.extensions.length > 0) {
    failPrint("/document/extensions", docId, "extensions must be empty.");
  }

  // Validate entities (M1, M3, M6, M7, M8)
  if (!isPlainObject(document.entities)) {
    failPrint("/document/entities", docId, "Missing entities map.");
  }
  const entities = document.entities;
  const entityIds = new Set(Object.keys(entities));
  const entitySpecsById = new Map<string, EntityTypeSpec>();
  for (const [key, ent] of Object.entries(entities)) {
    const entPath = `/document/entities/${escPtr(key)}`;
    const entObj = assertExactKeysForPrint(ent, ENTITY_KEYS, entPath, key);
    if (entObj["id"] !== key) {
      failPrint(entPath, key, "Entity key and id mismatch.");
    }
    if (!key.startsWith("entity:")) {
      failPrint(`${entPath}/id`, key, "Entity id must start with 'entity:'.");
    }
    const local = key.slice("entity:".length);
    if (!LOCAL_RE.test(local)) {
      failPrint(`${entPath}/id`, key, `Invalid entity local id '${local}'.`);
    }
    const spec = typeof entObj["type"] === "string" ? ENTITY_SPECS.get(entObj["type"]) : undefined;
    if (!spec) {
      failPrint(`${entPath}/type`, key, `Unsupported entity type '${String(entObj["type"])}'.`);
    }
    if (entObj["profile"] !== spec.profile || !profileRank.has(spec.profile)) {
      failPrint(`${entPath}/profile`, key, `Entity profile '${String(entObj["profile"])}' mismatch or not in profileRefs.`);
    }
    checkAttributeMapForPrint(entObj["attributes"], spec.attrMap, {
      path: `${entPath}/attributes`,
      subjectRef: key,
      isEntity: true,
      profile: spec.profile,
      forms: spec.forms,
    });
    entitySpecsById.set(key, spec);
  }

  // Validate relations & build composition tree (M1, M3, M4, M5, M6, M7, M8)
  if (!isPlainObject(document.relations)) {
    failPrint("/document/relations", docId, "Missing relations map.");
  }
  const relations = document.relations;
  const nestRelationByChild = new Map<string, { readonly rel: NativeRelation; readonly localId: string; readonly parentId: string }>();
  const childrenByParent = new Map<string, string[]>();
  const nonNestRelations: {
    readonly rel: NativeRelation;
    readonly localId: string;
    readonly spec: RelationTypeSpec;
    readonly srcId: string;
    readonly tgtId: string;
    readonly placement: "edge" | "rel";
  }[] = [];

  for (const [key, rel] of Object.entries(relations)) {
    const relPath = `/document/relations/${escPtr(key)}`;
    const relObj = assertExactKeysForPrint(rel, RELATION_KEYS, relPath, key);
    if (relObj["id"] !== key) {
      failPrint(relPath, key, "Relation key and id mismatch.");
    }
    if (!key.startsWith("relation:")) {
      failPrint(`${relPath}/id`, key, "Relation id must start with 'relation:'.");
    }
    const local = key.slice("relation:".length);
    if (!LOCAL_RE.test(local)) {
      failPrint(`${relPath}/id`, key, `Invalid relation local id '${local}'.`);
    }
    const spec = typeof relObj["type"] === "string" ? RELATION_SPECS.get(relObj["type"]) : undefined;
    if (!spec) {
      failPrint(`${relPath}/type`, key, `Unsupported relation type '${String(relObj["type"])}'.`);
    }
    if (relObj["profile"] !== spec.profile || !profileRank.has(spec.profile)) {
      failPrint(`${relPath}/profile`, key, `Relation profile '${String(relObj["profile"])}' mismatch or not in profileRefs.`);
    }
    if (!Array.isArray(relObj["endpoints"]) || relObj["endpoints"].length !== 2) {
      failPrint(`${relPath}/endpoints`, key, "Relation must have exactly 2 endpoints.");
    }
    const ep0 = assertExactKeysForPrint(relObj["endpoints"][0], ENDPOINT_KEYS, `${relPath}/endpoints/0`, key);
    const ep1 = assertExactKeysForPrint(relObj["endpoints"][1], ENDPOINT_KEYS, `${relPath}/endpoints/1`, key);
    if (
      ep0["role"] !== spec.roles[0] ||
      ep1["role"] !== spec.roles[1] ||
      typeof ep0["target"] !== "string" ||
      typeof ep1["target"] !== "string"
    ) {
      failPrint(`${relPath}/endpoints`, key, "Relation endpoints do not match declared roles.");
    }
    const tgt0 = ep0["target"];
    const tgt1 = ep1["target"];
    if (!entityIds.has(tgt0)) {
      failPrint(`${relPath}/endpoints/0/target`, key, `Unknown target entity '${tgt0}'.`);
    }
    if (!entityIds.has(tgt1)) {
      failPrint(`${relPath}/endpoints/1/target`, key, `Unknown target entity '${tgt1}'.`);
    }
    const ent0 = entities[tgt0]!;
    const ent1 = entities[tgt1]!;

    checkAttributeMapForPrint(relObj["attributes"], spec.attrMap, {
      path: `${relPath}/attributes`,
      subjectRef: key,
      isEntity: false,
      profile: spec.profile,
      forms: null,
    });

    const placement = computeRelationPlacement(rel.type, ent0, ent1, rel.attributes);
    if (placement === "nest") {
      // partOf: source = child, target = parent; contains: parent = parent, child = child
      const childId = rel.type === "partOf" ? tgt0 : tgt1;
      const parentId = rel.type === "partOf" ? tgt1 : tgt0;
      const childEnt = entities[childId]!;
      const parentEnt = entities[parentId]!;
      const parentSpec = entitySpecsById.get(parentId)!;
      const expectedNestType = childEnt.profile === "archi@1" ? "partOf" : "contains";
      if (rel.type !== expectedNestType) {
        failPrint(`${relPath}/type`, key, `Nesting relation for ${childEnt.profile} child must be '${expectedNestType}'.`);
      }
      if (childEnt.profile !== parentEnt.profile || !parentSpec.container) {
        failPrint(relPath, key, "Invalid nesting parent family or non-container parent.");
      }
      if (nestRelationByChild.has(childId)) {
        failPrint(relPath, key, `Entity '${childId}' has multiple nesting parents.`);
      }
      nestRelationByChild.set(childId, { rel, localId: local, parentId });
      let list = childrenByParent.get(parentId);
      if (!list) {
        list = [];
        childrenByParent.set(parentId, list);
      }
      list.push(childId);
    } else {
      nonNestRelations.push({
        rel,
        localId: local,
        spec,
        srcId: tgt0,
        tgtId: tgt1,
        placement,
      });
    }
  }

  // Check for cycles in composition tree (M5)
  for (const entId of entityIds) {
    const visited = new Set<string>();
    let cur: string | undefined = entId;
    while (cur !== undefined) {
      if (visited.has(cur)) {
        failPrint(`/document/entities/${escPtr(entId)}`, entId, "Cycle in composition tree.");
      }
      visited.add(cur);
      cur = nestRelationByChild.get(cur)?.parentId;
    }
  }

  // Validate manifest (M9, M12)
  if (manifest.format !== "engram.archi-manifest/1") {
    failPrint("/manifest/format", defaultRef, "Invalid manifest format.");
  }
  const lang = checkPrintString(manifest.language, "/manifest/language", defaultRef);
  if (!WORD_RE.test(lang)) {
    failPrint("/manifest/language", defaultRef, "Invalid manifest language.");
  }
  const owningRepo = checkPrintString(manifest.owningRepo, "/manifest/owningRepo", defaultRef);
  if (!entityIds.has(owningRepo)) {
    failPrint("/manifest/owningRepo", defaultRef, "owningRepo is not an entity of the document.");
  }
  if (manifest.document !== "document.json") {
    failPrint("/manifest/document", defaultRef, "manifest.document must be 'document.json'.");
  }
  if (!Array.isArray(manifest.profilePins)) {
    failPrint("/manifest/profilePins", defaultRef, "profilePins must be an array.");
  }
  const seenProfilePinIds = new Set<string>();
  for (let i = 0; i < manifest.profilePins.length; i++) {
    const p = validatePinForPrint(manifest.profilePins[i], `/manifest/profilePins/${i}`, defaultRef);
    if (seenProfilePinIds.has(p.id)) {
      failPrint(`/manifest/profilePins/${i}/id`, defaultRef, `Duplicate profilePin id '${p.id}'.`);
    }
    seenProfilePinIds.add(p.id);
  }
  if (manifest.cardsPin !== undefined) {
    validatePinForPrint(manifest.cardsPin, "/manifest/cardsPin", defaultRef);
  }
  validatePinForPrint(manifest.viewSchemaPin, "/manifest/viewSchemaPin", defaultRef);

  // Validate views (M1, M9, M10, M11, M12)
  const sortedViews: { readonly view: ArchiViewSpec; readonly localId: string; readonly specPath: string }[] = [];
  const seenViewIds = new Set<string>();
  for (let i = 0; i < views.length; i++) {
    const vRaw = views[i];
    const vPath = `/views/${i}`;
    const vObj = assertExactKeysForPrint(vRaw, VIEW_KEYS, vPath, defaultRef);
    const v = vObj as unknown as ArchiViewSpec;
    const vId = checkPrintString(v.viewId, `${vPath}/viewId`, defaultRef);
    if (!vId.startsWith("view:")) {
      failPrint(`${vPath}/viewId`, vId || defaultRef, "viewId must start with 'view:'.");
    }
    const vLocal = vId.slice("view:".length);
    if (!LOCAL_RE.test(vLocal) || seenViewIds.has(vLocal)) {
      failPrint(`${vPath}/viewId`, vId, `Invalid or duplicate viewId '${vId}'.`);
    }
    seenViewIds.add(vLocal);
    const specPath = `view-specs/${vLocal}.json`;
    if (i > 0 && cmpBytes(sortedViews[i - 1]!.specPath, specPath) >= 0) {
      failPrint(`${vPath}/viewId`, vId, "views array must be ordered by derived view-specs/<localId>.json path.");
    }
    if (v.format !== "engram.archi-view/1") {
      failPrint(`${vPath}/format`, vId, "Invalid view format.");
    }
    const hierarchy = checkPrintString(v.activeHierarchy, `${vPath}/activeHierarchy`, vId);
    if (!WORD_RE.test(hierarchy)) {
      failPrint(`${vPath}/activeHierarchy`, vId, "Invalid activeHierarchy.");
    }
    if (!Array.isArray(v.draw)) {
      failPrint(`${vPath}/draw`, vId, "draw must be an array.");
    }
    const drawnContainers = new Set<string>();
    for (let j = 0; j < v.draw.length; j++) {
      const ref = checkPrintString(v.draw[j], `${vPath}/draw/${j}`, vId);
      if (!entityIds.has(ref)) {
        failPrint(`${vPath}/draw/${j}`, vId, `Unknown entity '${ref}' in draw.`);
      }
      if (j > 0 && cmpBytes(v.draw[j - 1]!, ref) >= 0) {
        failPrint(`${vPath}/draw/${j}`, vId, "draw set must be strictly ascending.");
      }
      const spec = entitySpecsById.get(ref)!;
      if (spec.profile === "archi@1" && spec.container) {
        drawnContainers.add(ref);
      }
    }
    if (!Array.isArray(v.collapsed)) {
      failPrint(`${vPath}/collapsed`, vId, "collapsed must be an array.");
    }
    for (let j = 0; j < v.collapsed.length; j++) {
      const ref = checkPrintString(v.collapsed[j], `${vPath}/collapsed/${j}`, vId);
      if (j > 0 && cmpBytes(v.collapsed[j - 1]!, ref) >= 0) {
        failPrint(`${vPath}/collapsed/${j}`, vId, "collapsed set must be strictly ascending.");
      }
      if (!drawnContainers.has(ref)) {
        failPrint(`${vPath}/collapsed/${j}`, vId, `collapsed entity '${ref}' is not a drawn container.`);
      }
    }

    if (v.legend !== undefined) {
      const lPath = `${vPath}/legend`;
      assertExactKeysForPrint(v.legend, LEGEND_KEYS, lPath, vId);
      const lRef = checkPrintString(v.legend.legendRef, `${lPath}/legendRef`, vId);
      if (!entityIds.has(lRef)) {
        failPrint(`${lPath}/legendRef`, vId, `Unknown legendRef '${lRef}'.`);
      }
      if (v.legend.title !== undefined) {
        checkPrintString(v.legend.title, `${lPath}/title`, vId);
      }
      if (!Array.isArray(v.legend.order)) {
        failPrint(`${lPath}/order`, vId, "legend.order must be an array.");
      }
      const seenKeys = new Set<string>();
      for (let j = 0; j < v.legend.order.length; j++) {
        const kRef = checkPrintString(v.legend.order[j], `${lPath}/order/${j}`, vId);
        if (!entityIds.has(kRef) || seenKeys.has(kRef)) {
          failPrint(`${lPath}/order/${j}`, vId, `Unknown or duplicate key '${kRef}' in legend.order.`);
        }
        seenKeys.add(kRef);
      }
      if (!Array.isArray(v.legend.tokens)) {
        failPrint(`${lPath}/tokens`, vId, "legend.tokens must be an array.");
      }
      for (let j = 0; j < v.legend.tokens.length; j++) {
        const tok = assertExactKeysForPrint(v.legend.tokens[j], TOKEN_KEYS, `${lPath}/tokens/${j}`, vId);
        const cat = checkPrintString(tok["category"], `${lPath}/tokens/${j}/category`, vId);
        const tokenStr = checkPrintString(tok["token"], `${lPath}/tokens/${j}/token`, vId);
        if (!TOKEN_RE.test(tokenStr)) {
          failPrint(`${lPath}/tokens/${j}/token`, vId, `Invalid DS token '${tokenStr}'.`);
        }
        if (j > 0 && cmpBytes(v.legend.tokens[j - 1]!.category, cat) >= 0) {
          failPrint(`${lPath}/tokens/${j}/category`, vId, "legend.tokens must be strictly ascending by category.");
        }
      }
    }

    if (v.layout !== undefined) {
      const lyPath = `${vPath}/layout`;
      assertExactKeysForPrint(v.layout, LAYOUT_KEYS, lyPath, vId);
      const ly = v.layout;
      let hasAnyLayoutDatum = false;
      if (ly.stretch !== undefined) {
        if (typeof ly.stretch !== "boolean") {
          failPrint(`${lyPath}/stretch`, vId, "layout.stretch must be boolean.");
        }
        hasAnyLayoutDatum = true;
      }
      for (const [, field] of GAP_ORDER) {
        const gVal = ly[field];
        if (gVal !== undefined) {
          if (!isNonNegSafeInt(gVal)) {
            failPrint(`${lyPath}/${field}`, vId, `layout.${field} must be a non-negative safe integer.`);
          }
          hasAnyLayoutDatum = true;
        }
      }
      if (ly.ordering !== undefined) {
        if (!isPlainObject(ly.ordering)) {
          failPrint(`${lyPath}/ordering`, vId, "layout.ordering must be an object.");
        }
        const ordKeys = Object.keys(ly.ordering);
        if (ordKeys.length === 0) {
          failPrint(`${lyPath}/ordering`, vId, "Empty layout.ordering is unrepresentable (M11).");
        }
        hasAnyLayoutDatum = true;
        for (const pKey of ordKeys) {
          const pPath = `${lyPath}/ordering/${escPtr(pKey)}`;
          if (!entityIds.has(pKey)) {
            failPrint(pPath, vId, `Unknown parent entity '${pKey}' in layout.ordering.`);
          }
          const children = ly.ordering[pKey];
          if (!Array.isArray(children)) {
            failPrint(pPath, vId, "layout.ordering entry must be an array.");
          }
          const seenChildren = new Set<string>();
          for (let j = 0; j < children.length; j++) {
            const cRef = checkPrintString(children[j], `${pPath}/${j}`, vId);
            if (!entityIds.has(cRef) || seenChildren.has(cRef)) {
              failPrint(`${pPath}/${j}`, vId, `Unknown or duplicate child '${cRef}' in layout.ordering.`);
            }
            seenChildren.add(cRef);
          }
        }
      }
      if (ly.grouping !== undefined) {
        if (!Array.isArray(ly.grouping) || ly.grouping.length === 0) {
          failPrint(`${lyPath}/grouping`, vId, "Empty layout.grouping is unrepresentable (M11).");
        }
        hasAnyLayoutDatum = true;
        const seenGroups = new Set<string>();
        const validateGroup = (gRaw: unknown, gPath: string): void => {
          const gObj = assertExactKeysForPrint(gRaw, GROUP_KEYS, gPath, vId);
          const g = gObj as unknown as ArchiLayoutGroup;
          const gid = checkPrintString(g.id, `${gPath}/id`, vId);
          if (!LOCAL_RE.test(gid) || seenGroups.has(gid)) {
            failPrint(`${gPath}/id`, vId, `Invalid or duplicate layout group id '${gid}'.`);
          }
          seenGroups.add(gid);
          if (g.direction !== "rows" && g.direction !== "columns") {
            failPrint(`${gPath}/direction`, vId, "Invalid group direction.");
          }
          if (g.stretch !== undefined && typeof g.stretch !== "boolean") {
            failPrint(`${gPath}/stretch`, vId, "group.stretch must be boolean.");
          }
          if (g.gapAfter !== undefined && !isNonNegSafeInt(g.gapAfter)) {
            failPrint(`${gPath}/gapAfter`, vId, "group.gapAfter must be a non-negative safe integer.");
          }
          if (!Array.isArray(g.items)) {
            failPrint(`${gPath}/items`, vId, "group.items must be an array.");
          }
          const directRefs = new Set<string>();
          for (let k = 0; k < g.items.length; k++) {
            const item = g.items[k];
            const itemPath = `${gPath}/items/${k}`;
            if (typeof item === "string") {
              checkPrintString(item, itemPath, vId);
              if (!entityIds.has(item) || directRefs.has(item)) {
                failPrint(itemPath, vId, `Unknown or duplicate entity '${item}' in group items.`);
              }
              directRefs.add(item);
            } else {
              validateGroup(item, itemPath);
            }
          }
        };
        for (let j = 0; j < ly.grouping.length; j++) {
          validateGroup(ly.grouping[j], `${lyPath}/grouping/${j}`);
        }
      }
      if (!hasAnyLayoutDatum) {
        failPrint(lyPath, vId, "Empty layout {} is unrepresentable (M11).");
      }
    }

    sortedViews.push({ view: v, localId: vLocal, specPath });
  }

  sortedViews.sort((a, b) => cmpBytes(a.localId, b.localId));
  const expectedManifestViews = sortedViews
    .map((v) => v.specPath)
    .sort(cmpBytes);
  if (
    !Array.isArray(manifest.views) ||
    manifest.views.length !== expectedManifestViews.length ||
    manifest.views.some((mv, idx) => mv !== expectedManifestViews[idx])
  ) {
    failPrint("/manifest/views", defaultRef, "manifest.views does not match derived view-specs paths (M9).");
  }

  // K2, K12: Head section
  const headLines: string[] = [
    "flowchart LR",
    "%% @dl format engram.archi-mermaid/1",
    `%% @dl document ${docLocal}`,
    `%% @dl schema ${sv["major"]}.${sv["minor"]}`,
    `%% @dl revision ${document.revision}`,
    `%% @dl language ${manifest.language}`,
    `%% @dl owning-repo ${toEid(manifest.owningRepo)}`,
  ];
  for (const prof of document.profileRefs) {
    headLines.push(`%% @dl profile ${prof}`);
  }
  for (const pin of manifest.profilePins) {
    headLines.push(`%% @dl pin profile ${pin.id} ${pin.version} ${pin.contentDigest}`);
  }
  if (manifest.cardsPin !== undefined) {
    const cp = manifest.cardsPin;
    headLines.push(`%% @dl pin cards ${cp.id} ${cp.version} ${cp.contentDigest}`);
  }
  const vsp = manifest.viewSchemaPin;
  headLines.push(`%% @dl pin view-schema ${vsp.id} ${vsp.version} ${vsp.contentDigest}`);

  // K5, K6: Tree section
  const compareSiblings = (aId: string, bId: string): number => {
    const aEnt = entities[aId]!;
    const bEnt = entities[bId]!;
    const aSpec = entitySpecsById.get(aId)!;
    const bSpec = entitySpecsById.get(bId)!;
    const pDiff = profileRank.get(aEnt.profile)! - profileRank.get(bEnt.profile)!;
    if (pDiff !== 0) return pDiff;
    const tDiff = aSpec.rank - bSpec.rank;
    if (tDiff !== 0) return tDiff;
    return cmpBytes(toEid(aId), toEid(bId));
  };

  const rootEntityIds = [...entityIds]
    .filter((id) => !nestRelationByChild.has(id))
    .sort(compareSiblings);

  const treeOrder = new Map<string, number>();
  let nextTreePos = 0;

  const emitEntityBlock = (entityId: string, depth: number, outLines: string[]): void => {
    treeOrder.set(entityId, nextTreePos++);
    const ent = entities[entityId]!;
    const spec = entitySpecsById.get(entityId)!;
    const indent = "  ".repeat(depth);
    const formVal = getAttrString(ent.attributes, "form");
    outLines.push(`${indent}%% @dl entity ${ent.type}${formVal ? ` ${formVal}` : ""}`);
    emitAttributeLines(outLines, indent, spec.attrs, ent.attributes, false);

    if (depth >= 1) {
      const nestInfo = nestRelationByChild.get(entityId)!;
      const nestSpec = RELATION_SPECS.get(nestInfo.rel.type)!;
      outLines.push(`${indent}%% @dl nest ${nestInfo.localId}`);
      emitAttributeLines(outLines, indent, nestSpec.attrs, nestInfo.rel.attributes, false);
    }

    const eid = toEid(entityId);
    const nameStr = getAttrString(ent.attributes, "name")!;
    const vname = encodeVString(nameStr);
    if (spec.container) {
      outLines.push(`${indent}subgraph ${eid}[${vname}]`);
      const children = (childrenByParent.get(entityId) ?? []).slice().sort(compareSiblings);
      for (const childId of children) {
        emitEntityBlock(childId, depth + 1, outLines);
      }
      outLines.push(`${indent}end`);
    } else {
      outLines.push(`${indent}${eid}[${vname}]`);
    }
  };

  const sections: string[] = [headLines.join("\n")];
  for (const rootId of rootEntityIds) {
    const blockLines: string[] = [];
    emitEntityBlock(rootId, 0, blockLines);
    sections.push(blockLines.join("\n"));
  }

  // K7: Relations section
  if (nonNestRelations.length > 0) {
    nonNestRelations.sort((a, b) => {
      const posDiff = treeOrder.get(a.srcId)! - treeOrder.get(b.srcId)!;
      if (posDiff !== 0) return posDiff;
      const rankDiff = a.spec.rank - b.spec.rank;
      if (rankDiff !== 0) return rankDiff;
      const tgtDiff = cmpBytes(toEid(a.tgtId), toEid(b.tgtId));
      if (tgtDiff !== 0) return tgtDiff;
      return cmpBytes(a.localId, b.localId);
    });

    const relLines: string[] = [];
    for (const item of nonNestRelations) {
      const { rel, localId, spec, srcId, tgtId, placement } = item;
      const srcEid = toEid(srcId);
      const tgtEid = toEid(tgtId);
      if (placement === "edge") {
        relLines.push(`%% @dl edge ${localId} ${rel.type}`);
        emitAttributeLines(relLines, "", spec.attrs, rel.attributes, true);
        const lc = getAttrString(rel.attributes, "lifecycle") ?? "current";
        const arrow = lc === "current" ? "-->" : "-.->";
        const label = getAttrString(rel.attributes, "label");
        const labelPart = label !== undefined ? `|${encodeVString(label)}|` : "";
        relLines.push(`${srcEid} ${arrow}${labelPart} ${tgtEid}`);
      } else {
        relLines.push(`%% @dl rel ${localId} ${rel.type} ${srcEid} ${tgtEid}`);
        emitAttributeLines(relLines, "", spec.attrs, rel.attributes, false);
      }
    }
    sections.push(relLines.join("\n"));
  }

  // K8: Views section
  for (const { view, localId } of sortedViews) {
    const vLines: string[] = [`%% @dl view ${localId} ${view.activeHierarchy}`];
    const drawEids = view.draw.map(toEid).sort(cmpBytes);
    for (const eid of drawEids) {
      vLines.push(`%% @dl draw ${eid}`);
    }
    const collapsedSet = new Set(view.collapsed);
    const expandedEids = view.draw
      .filter((id) => {
        const spec = entitySpecsById.get(id)!;
        return spec.profile === "archi@1" && spec.container && !collapsedSet.has(id);
      })
      .map(toEid)
      .sort(cmpBytes);
    for (const eid of expandedEids) {
      vLines.push(`%% @dl expanded ${eid}`);
    }
    if (view.legend !== undefined) {
      const lg = view.legend;
      vLines.push(
        `%% @dl legend ${toEid(lg.legendRef)}${lg.title !== undefined ? ` ${encodeAString(lg.title)}` : ""}`,
      );
      for (const keyId of lg.order) {
        vLines.push(`%% @dl key ${toEid(keyId)}`);
      }
      // K8: tokens are ordered by UTF-16 code unit order of the decoded model category string.
      const sortedTokens = [...lg.tokens].sort((a, b) => cmpBytes(a.category, b.category));
      for (const tok of sortedTokens) {
        vLines.push(`%% @dl token ${encodeAString(tok.category)} ${tok.token}`);
      }
    }
    if (view.layout !== undefined) {
      const ly = view.layout;
      if (ly.stretch !== undefined) {
        vLines.push(`%% @dl stretch ${ly.stretch ? "true" : "false"}`);
      }
      for (const [gapKey, field] of GAP_ORDER) {
        const val = ly[field];
        if (val !== undefined) {
          vLines.push(`%% @dl gap ${gapKey} ${val}`);
        }
      }
      if (ly.ordering !== undefined) {
        const entries = Object.entries(ly.ordering)
          .map(([pId, children]) => [toEid(pId), children.map(toEid)] as const)
          .sort((a, b) => cmpBytes(a[0], b[0]));
        for (const [pEid, cEids] of entries) {
          vLines.push(`%% @dl order ${[pEid, ...cEids].join(" ")}`);
        }
      }
      if (ly.grouping !== undefined) {
        const emitGroup = (g: ArchiLayoutGroup, parentGroupId?: string): void => {
          let gLine = `%% @dl group ${g.id} ${g.direction}`;
          if (parentGroupId !== undefined) gLine += ` in ${parentGroupId}`;
          if (g.stretch !== undefined) gLine += ` stretch ${g.stretch ? "true" : "false"}`;
          if (g.gapAfter !== undefined) gLine += ` gap-after ${g.gapAfter}`;
          vLines.push(gLine);
          for (const item of g.items) {
            if (typeof item === "string") {
              vLines.push(`%% @dl item ${g.id} ${toEid(item)}`);
            } else {
              emitGroup(item, g.id);
            }
          }
        };
        for (const g of ly.grouping) {
          emitGroup(g);
        }
      }
    }
    sections.push(vLines.join("\n"));
  }

  // K11: Classes section
  const dashedEids: string[] = [];
  for (const [entId, ent] of Object.entries(entities)) {
    const entLc = getAttrString(ent.attributes, "lifecycle") ?? "current";
    const nestInfo = nestRelationByChild.get(entId);
    const nestLc = nestInfo ? (getAttrString(nestInfo.rel.attributes, "lifecycle") ?? "current") : "current";
    if (entLc !== "current" || nestLc !== "current") {
      dashedEids.push(toEid(entId));
    }
  }
  dashedEids.sort(cmpBytes);
  if (dashedEids.length > 0) {
    sections.push(`classDef dashed stroke-dasharray: 5 5\nclass ${dashedEids.join(",")} dashed`);
  }

  return `${sections.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// parseOrRefuse(text): engram.archi-mermaid/1 text -> Authored ArchiSourceTriple
// ---------------------------------------------------------------------------

interface MutableAttrBag {
  readonly attrs: Record<string, NativeAttributeValue>;
  readonly explicitEmptyCollections: Set<string>;
}

function parseAttrLine(
  attrName: string,
  rawVal: string,
  specAttrs: ReadonlyMap<string, AttrKind>,
  bag: MutableAttrBag,
  contextKind: "entity" | "nest" | "edge" | "rel",
  lineIdx: number,
  subjectRef: string,
): void {
  if (attrName === "name" || attrName === "form" || (contextKind === "edge" && attrName === "label")) {
    failParse("mermaid-strict-duplicate-datum", lineIdx, `Datum '${attrName}' cannot be written as an annotation line in ${contextKind}.`, subjectRef);
  }
  const kind = specAttrs.get(attrName);
  if (!kind) {
    failParse("mermaid-strict-annotation-unknown", lineIdx, `Unknown or undeclared attribute '${attrName}'.`, subjectRef);
  }
  if (rawVal.length === 0) {
    failParse("mermaid-strict-invalid", lineIdx, `Missing value for attribute '${attrName}'.`, subjectRef);
  }
  if (kind === "text") {
    if (rawVal === "[]" || !rawVal.startsWith('"') || !rawVal.endsWith('"')) {
      failParse("mermaid-strict-invalid", lineIdx, `Attribute '${attrName}' requires an ASTRING value.`, subjectRef);
    }
    const val = decodeAString(rawVal, lineIdx, subjectRef);
    if (Object.hasOwn(bag.attrs, attrName)) {
      failParse("mermaid-strict-duplicate", lineIdx, `Duplicate attribute '${attrName}'.`, subjectRef);
    }
    bag.attrs[attrName] = { kind: "text", value: val };
  } else if (kind === "enum") {
    if (rawVal === "[]" || rawVal.startsWith('"') || !WORD_RE.test(rawVal)) {
      failParse("mermaid-strict-invalid", lineIdx, `Attribute '${attrName}' requires a WORD value.`, subjectRef);
    }
    if (Object.hasOwn(bag.attrs, attrName)) {
      failParse("mermaid-strict-duplicate", lineIdx, `Duplicate attribute '${attrName}'.`, subjectRef);
    }
    bag.attrs[attrName] = { kind: "enum", value: rawVal };
  } else if (kind === "collection") {
    if (rawVal === "[]") {
      if (Object.hasOwn(bag.attrs, attrName) || bag.explicitEmptyCollections.has(attrName)) {
        failParse("mermaid-strict-duplicate", lineIdx, `Duplicate or conflicting empty collection '${attrName}'.`, subjectRef);
      }
      bag.explicitEmptyCollections.add(attrName);
      bag.attrs[attrName] = { kind: "collection", items: [] };
    } else {
      if (!rawVal.startsWith('"') || !rawVal.endsWith('"')) {
        failParse("mermaid-strict-invalid", lineIdx, `Collection '${attrName}' item requires an ASTRING.`, subjectRef);
      }
      if (bag.explicitEmptyCollections.has(attrName)) {
        failParse("mermaid-strict-duplicate", lineIdx, `Collection '${attrName}' cannot mix '[]' and items.`, subjectRef);
      }
      const val = decodeAString(rawVal, lineIdx, subjectRef);
      const existing = Object.hasOwn(bag.attrs, attrName)
        ? (bag.attrs[attrName] as { readonly kind: "collection"; readonly items: { readonly kind: "text"; readonly value: string }[] } | undefined)
        : undefined;
      if (!existing) {
        bag.attrs[attrName] = { kind: "collection", items: [{ kind: "text", value: val }] };
      } else {
        existing.items.push({ kind: "text", value: val });
      }
    }
  }
}

function classifyUnsupportedOrInvalidStatement(trimmed: string, lineIdx: number, subjectRef: string): never {
  const rawFirst = trimmed.split(/ +/)[0] ?? "";
  const firstWord = rawFirst.replace(/:$/, "");
  if (
    trimmed === "---" ||
    UNSUPPORTED_STATEMENT_HEADS.has(firstWord) ||
    firstWord === "flowchart" ||
    firstWord === "classDef" ||
    firstWord === "class"
  ) {
    failParse("mermaid-strict-unsupported", lineIdx, `Unsupported Mermaid statement '${rawFirst}'.`, subjectRef);
  }
  // Check for unsupported Mermaid node shapes, links, :::, @-->, &
  const quoteIdx = trimmed.indexOf('"');
  const prefix = quoteIdx === -1 ? trimmed : trimmed.slice(0, quoteIdx);
  if (
    prefix.includes("[[") ||
    prefix.includes("[/") ||
    prefix.includes("[\\") ||
    prefix.includes("(") ||
    prefix.includes("{") ||
    prefix.includes("@{") ||
    prefix.includes(">") ||
    prefix.includes("&") ||
    prefix.includes("==>") ||
    prefix.includes("---") ||
    prefix.includes("-.-") ||
    prefix.includes("~~~") ||
    prefix.includes("--o") ||
    prefix.includes("--x") ||
    prefix.includes("<-->") ||
    trimmed.includes(":::") ||
    trimmed.includes("@-->")
  ) {
    failParse("mermaid-strict-unsupported", lineIdx, "Unsupported Mermaid shape, link or class syntax.", subjectRef);
  }
  if (/^(subgraph +)?e_[a-z][a-z0-9_]*\[[^\]]*\]$/.test(trimmed) && !trimmed.includes('["')) {
    failParse("mermaid-strict-unsupported", lineIdx, "Unquoted Mermaid label is unsupported.", subjectRef);
  }
  failParse("mermaid-strict-invalid", lineIdx, "Unrecognized statement line.", subjectRef);
}

function parseOrRefuse(
  text: unknown,
  options: { readonly checkCanonical?: boolean; readonly subjectRef: string },
): ArchiSourceTriple {
  const { subjectRef } = options;
  activeParseLines = [];
  if (typeof text !== "string" || text.length === 0) {
    failParse("mermaid-strict-invalid", 0, "Empty or non-string input.", subjectRef, 1);
  }
  if (text.charCodeAt(0) === 0xfeff) {
    failParse("mermaid-strict-invalid", 0, "UTF-8 BOM is forbidden (K1).", subjectRef, 1);
  }

  const rawLines = text.split("\n");
  activeParseLines = rawLines;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    for (let j = 0; j < line.length; j++) {
      const c = line.charCodeAt(j);
      if (c === 0xfeff || c === 0x0d || c === 0x09 || c <= 0x1f || (c >= 0x7f && c <= 0x9f)) {
        failParse("mermaid-strict-invalid", i, "Forbidden control character, BOM, CR or TAB.", subjectRef, j + 1);
      }
      if (c >= 0xd800 && c <= 0xdbff) {
        if (j + 1 >= line.length) {
          failParse("mermaid-strict-invalid", i, "Lone high surrogate in UTF-16 input.", subjectRef, j + 1);
        }
        const next = line.charCodeAt(j + 1);
        if (next < 0xdc00 || next > 0xdfff) {
          failParse("mermaid-strict-invalid", i, "Lone high surrogate in UTF-16 input.", subjectRef, j + 1);
        }
        j++;
      } else if (c >= 0xdc00 && c <= 0xdfff) {
        failParse("mermaid-strict-invalid", i, "Lone low surrogate in UTF-16 input.", subjectRef, j + 1);
      }
    }
  }

  // Locate first non-empty line -> must be flowchart LR
  let idx = 0;
  while (idx < rawLines.length && trimSp(rawLines[idx]!) === "") {
    idx++;
  }
  if (idx >= rawLines.length) {
    failParse("mermaid-strict-invalid", 0, "Empty file.", subjectRef, 1);
  }
  const firstTrimmed = trimSp(rawLines[idx]!);
  if (firstTrimmed === "---") {
    failParse("mermaid-strict-unsupported", idx, "YAML front-matter is unsupported.", subjectRef);
  }
  if (firstTrimmed.startsWith("%%{")) {
    failParse("mermaid-strict-unsupported", idx, "Mermaid directives are unsupported.", subjectRef);
  }
  if (firstTrimmed.startsWith("%%") && !/^%% +@dl(?=$| )/.test(firstTrimmed)) {
    failParse("mermaid-strict-unsupported", idx, "Free comments and malformed @dl prefixes are unsupported.", subjectRef);
  }
  const firstTokens = firstTrimmed.split(/ +/);
  const firstHeadWord = (firstTokens[0] ?? "").replace(/:$/, "");
  if (
    firstTokens[0] === "flowchart" &&
    (firstTokens.length !== 2 || firstTokens[1] !== "LR") &&
    firstTokens.every((t) => /^[\x21-\x7e]+$/.test(t))
  ) {
    failParse("mermaid-strict-unsupported", idx, "Only 'flowchart LR' is supported on line 1.", subjectRef);
  }
  if (
    firstHeadWord === "classDef" ||
    firstHeadWord === "class" ||
    firstHeadWord === "graph" ||
    UNSUPPORTED_STATEMENT_HEADS.has(firstHeadWord)
  ) {
    failParse("mermaid-strict-unsupported", idx, `Unsupported diagram header '${firstTokens[0]}'.`, subjectRef);
  }
  if (firstTokens.length !== 2 || firstTokens[0] !== "flowchart" || firstTokens[1] !== "LR") {
    failParse("mermaid-strict-invalid", idx, "First statement must be 'flowchart LR'.", subjectRef);
  }
  idx++;

  // Head state
  let seenFormat = false;
  let docLocal: string | undefined;
  let schemaVersion: { readonly major: number; readonly minor: number } | undefined;
  let revision: number | undefined;
  let language: ArchiLanguage | undefined;
  let owningRepoEid: { readonly eid: string; readonly lineIdx: number } | undefined;
  const profileRefs: string[] = [];
  const profileRefSet = new Set<string>();
  const profilePins: Pin[] = [];
  const profilePinIdSet = new Set<string>();
  let cardsPin: Pin | undefined;
  let viewSchemaPin: Pin | undefined;

  // Section tracking: "head" | "tree" | "relations" | "views" | "classes" | "done"
  let section: "head" | "tree" | "relations" | "views" | "classes" | "done" = "head";

  const ensureHeadComplete = (lineIdx: number): void => {
    if (
      !seenFormat ||
      docLocal === undefined ||
      schemaVersion === undefined ||
      revision === undefined ||
      language === undefined ||
      owningRepoEid === undefined ||
      profileRefs.length === 0 ||
      viewSchemaPin === undefined
    ) {
      failParse("mermaid-strict-invalid", lineIdx, "Incomplete head section.", subjectRef);
    }
  };

  // Tree & entity state
  const entities: Record<string, NativeEntity> = {};
  const eidToEntityId = new Map<string, string>();
  const relations: Record<string, NativeRelation> = {};
  const seenRelationIds = new Set<string>();
  const nestRelationByChild = new Map<string, NativeRelation>();

  const subgraphStack: {
    readonly entityId: string;
    readonly profile: "archi@1" | "generic@2";
    readonly type: string;
    readonly lineIdx: number;
  }[] = [];

  interface OpenEntityBlock {
    readonly type: string;
    readonly spec: EntityTypeSpec;
    readonly form: string | undefined;
    readonly attrBag: MutableAttrBag;
    readonly openLineIdx: number;
    nest?: {
      readonly localId: string;
      readonly relId: string;
      readonly spec: RelationTypeSpec;
      readonly attrBag: MutableAttrBag;
      readonly lineIdx: number;
    };
  }
  let openEntity: OpenEntityBlock | undefined;

  // Relation section state
  interface OpenEdgeBlock {
    readonly kind: "edge";
    readonly localId: string;
    readonly relId: string;
    readonly relType: string;
    readonly spec: RelationTypeSpec;
    readonly attrBag: MutableAttrBag;
    readonly lineIdx: number;
  }
  interface OpenRelBlock {
    readonly kind: "rel";
    readonly localId: string;
    readonly relId: string;
    readonly relType: string;
    readonly spec: RelationTypeSpec;
    readonly srcEid: string;
    readonly tgtEid: string;
    readonly attrBag: MutableAttrBag;
    readonly lineIdx: number;
  }
  let openRelation: OpenEdgeBlock | OpenRelBlock | undefined;

  const finalizeOpenRel = (): void => {
    if (!openRelation) return;
    if (openRelation.kind === "edge") {
      failParse("mermaid-strict-invalid", openRelation.lineIdx, "Edge head not followed by edge line.", subjectRef);
    }
    const { relId, relType, spec, srcEid, tgtEid, attrBag, lineIdx } = openRelation;
    const srcId = eidToEntityId.get(srcEid);
    const tgtId = eidToEntityId.get(tgtEid);
    if (!srcId || !tgtId) {
      failParse("mermaid-strict-orphan-ref", lineIdx, "Unknown endpoint EID in rel head.", subjectRef);
    }
    const srcEnt = entities[srcId]!;
    const tgtEnt = entities[tgtId]!;
    if (spec.profile === "archi@1" && !Object.hasOwn(attrBag.attrs, "lifecycle")) {
      attrBag.attrs["lifecycle"] = { kind: "enum", value: "current" };
    }
    const placement = computeRelationPlacement(relType, srcEnt, tgtEnt, attrBag.attrs);
    if (placement !== "rel") {
      failParse("mermaid-strict-placement-drift", lineIdx, `Relation '${relId}' must be encoded as '${placement}', not 'rel'.`, subjectRef);
    }
    relations[relId] = {
      id: relId,
      profile: spec.profile,
      type: relType,
      endpoints: [
        { role: spec.roles[0], target: srcId },
        { role: spec.roles[1], target: tgtId },
      ],
      attributes: attrBag.attrs,
    };
    seenRelationIds.add(relId);
    openRelation = undefined;
  };

  // Views state
  interface MutableLayoutGroup {
    readonly id: string;
    readonly direction: "rows" | "columns";
    readonly stretch?: boolean;
    readonly gapAfter?: number;
    readonly items: (string | MutableLayoutGroup)[];
    readonly directRefs: Set<string>;
  }
  interface OpenViewBlock {
    readonly localId: string;
    readonly viewId: string;
    readonly activeHierarchy: ArchiActiveHierarchy;
    readonly drawSet: Set<string>;
    readonly expandedEntries: { readonly entityId: string; readonly lineIdx: number }[];
    readonly expandedSet: Set<string>;
    legend?: {
      readonly legendRef: string;
      readonly title?: string;
    };
    readonly legendKeys: string[];
    readonly legendKeySet: Set<string>;
    readonly legendTokens: Map<string, string>;
    readonly tokenLines: number[];
    readonly keyLines: number[];
    stretch?: boolean;
    readonly gaps: Partial<Record<GapField, number>>;
    readonly ordering: Map<string, string[]>;
    readonly grouping: MutableLayoutGroup[];
    readonly groupsById: Map<string, MutableLayoutGroup>;
    readonly lineIdx: number;
  }
  let openView: OpenViewBlock | undefined;
  const parsedViews: ArchiViewSpec[] = [];
  const seenViewIds = new Set<string>();

  const finalizeOpenView = (): void => {
    if (!openView) return;
    if (!openView.legend && (openView.keyLines.length > 0 || openView.tokenLines.length > 0)) {
      const errLine = openView.keyLines[0] ?? openView.tokenLines[0] ?? openView.lineIdx;
      failParse("mermaid-strict-invalid", errLine, "View 'key' or 'token' line without 'legend' line.", subjectRef);
    }
    const drawnContainers = new Set<string>();
    for (const entId of openView.drawSet) {
      const ent = entities[entId]!;
      const spec = ENTITY_SPECS.get(ent.type)!;
      if (spec.profile === "archi@1" && spec.container) {
        drawnContainers.add(entId);
      }
    }
    for (const exp of openView.expandedEntries) {
      if (!drawnContainers.has(exp.entityId)) {
        failParse("mermaid-strict-orphan-ref", exp.lineIdx, `Expanded entity '${exp.entityId}' is not a drawn container of view '${openView.viewId}'.`, subjectRef);
      }
    }
    const expandedSet = openView.expandedSet;
    const draw = [...openView.drawSet].sort(cmpBytes);
    const collapsed = [...drawnContainers].filter((id) => !expandedSet.has(id)).sort(cmpBytes);

    let legend: ArchiViewSpecLegend | undefined;
    if (openView.legend) {
      const tokens: ArchiViewSpecLegendToken[] = [...openView.legendTokens.entries()]
        .sort((a, b) => cmpBytes(a[0], b[0]))
        .map(([category, token]) => ({ category, token }));
      legend = {
        legendRef: openView.legend.legendRef,
        ...(openView.legend.title !== undefined ? { title: openView.legend.title } : {}),
        order: openView.legendKeys,
        tokens,
      };
    }

    const hasLayout =
      openView.stretch !== undefined ||
      Object.keys(openView.gaps).length > 0 ||
      openView.ordering.size > 0 ||
      openView.grouping.length > 0;

    let layout: ArchiLayoutHints | undefined;
    if (hasLayout) {
      const freezeGroup = (g: MutableLayoutGroup): ArchiLayoutGroup => ({
        id: g.id,
        direction: g.direction,
        ...(g.stretch !== undefined ? { stretch: g.stretch } : {}),
        ...(g.gapAfter !== undefined ? { gapAfter: g.gapAfter } : {}),
        items: g.items.map((item) => (typeof item === "string" ? item : freezeGroup(item))),
      });
      const orderingObj: Record<string, readonly string[]> = {};
      for (const [k, v] of [...openView.ordering.entries()].sort((a, b) => cmpBytes(a[0], b[0]))) {
        orderingObj[k] = v;
      }
      layout = {
        ...(openView.stretch !== undefined ? { stretch: openView.stretch } : {}),
        ...(openView.gaps.cardGapX !== undefined ? { cardGapX: openView.gaps.cardGapX } : {}),
        ...(openView.gaps.cardGapY !== undefined ? { cardGapY: openView.gaps.cardGapY } : {}),
        ...(openView.gaps.zoneGapX !== undefined ? { zoneGapX: openView.gaps.zoneGapX } : {}),
        ...(openView.gaps.zoneGapY !== undefined ? { zoneGapY: openView.gaps.zoneGapY } : {}),
        ...(openView.gaps.rankGap !== undefined ? { rankGap: openView.gaps.rankGap } : {}),
        ...(openView.ordering.size > 0 ? { ordering: orderingObj } : {}),
        ...(openView.grouping.length > 0 ? { grouping: openView.grouping.map(freezeGroup) } : {}),
      };
    }

    parsedViews.push({
      format: "engram.archi-view/1",
      viewId: openView.viewId,
      activeHierarchy: openView.activeHierarchy,
      draw,
      collapsed,
      ...(legend !== undefined ? { legend } : {}),
      ...(layout !== undefined ? { layout } : {}),
    });
    openView = undefined;
  };

  // Classes state
  let classBlockState: "none" | "expect-class" | "done" = "none";
  let classBlockLineIdx = 0;
  const dashedClassEids: string[] = [];
  const dashedClassEidSet = new Set<string>();

  for (; idx < rawLines.length; idx++) {
    const rawLine = rawLines[idx]!;
    const trimmed = trimSp(rawLine);
    if (trimmed === "") continue;

    // 1. Check directives or non-@dl comments
    if (trimmed.startsWith("%%{")) {
      failParse("mermaid-strict-unsupported", idx, "Mermaid directives are unsupported.", subjectRef);
    }
    if (trimmed.startsWith("%%")) {
      const dlMatch = /^%% +@dl(?: +(.*))?$/.exec(trimmed);
      if (!dlMatch) {
        failParse("mermaid-strict-unsupported", idx, "Free comments and malformed @dl prefixes are unsupported.", subjectRef);
      }
      if (classBlockState === "expect-class" || section === "classes" || section === "done") {
        failParse("mermaid-strict-invalid", idx, "Annotation line after class block.", subjectRef);
      }
      const payload = trimSp(dlMatch[1] ?? "");
      if (payload === "") {
        failParse("mermaid-strict-annotation-unknown", idx, "Empty @dl annotation.", subjectRef);
      }
      const spaceIdx = payload.indexOf(" ");
      const kw = spaceIdx === -1 ? payload : payload.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? "" : trimSp(payload.slice(spaceIdx + 1));

      // Handle by active open block or section
      if (HEAD_KEYWORDS.has(kw)) {
        if (openEntity || openRelation || openView) {
          failParse("mermaid-strict-annotation-unknown", idx, `Head keyword '${kw}' is out of context.`, subjectRef);
        }
        if (section !== "head") {
          failParse("mermaid-strict-invalid", idx, `Head keyword '${kw}' outside head section.`, subjectRef);
        }
        if (kw === "format") {
          if (seenFormat) failParse("mermaid-strict-duplicate", idx, "Duplicate format line.", subjectRef);
          if (rest !== "engram.archi-mermaid/1") {
            failParse("mermaid-strict-annotation-unknown", idx, `Unsupported format '${rest}'.`, subjectRef);
          }
          seenFormat = true;
        } else if (kw === "document") {
          if (docLocal !== undefined) failParse("mermaid-strict-duplicate", idx, "Duplicate document line.", subjectRef);
          if (!LOCAL_RE.test(rest)) failParse("mermaid-strict-invalid", idx, "Invalid document local id.", subjectRef);
          docLocal = rest;
        } else if (kw === "schema") {
          if (schemaVersion !== undefined) failParse("mermaid-strict-duplicate", idx, "Duplicate schema line.", subjectRef);
          const m = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(rest);
          if (!m || !isSafeIntDecString(m[1]!) || !isSafeIntDecString(m[2]!)) {
            failParse("mermaid-strict-invalid", idx, "Invalid schema version.", subjectRef);
          }
          schemaVersion = { major: Number(m[1]), minor: Number(m[2]) };
        } else if (kw === "revision") {
          if (revision !== undefined) failParse("mermaid-strict-duplicate", idx, "Duplicate revision line.", subjectRef);
          if (!isSafeIntDecString(rest)) failParse("mermaid-strict-invalid", idx, "Invalid revision.", subjectRef);
          revision = Number(rest);
        } else if (kw === "language") {
          if (language !== undefined) failParse("mermaid-strict-duplicate", idx, "Duplicate language line.", subjectRef);
          if (!WORD_RE.test(rest)) failParse("mermaid-strict-invalid", idx, "Invalid language.", subjectRef);
          language = rest as ArchiLanguage;
        } else if (kw === "owning-repo") {
          if (owningRepoEid !== undefined) failParse("mermaid-strict-duplicate", idx, "Duplicate owning-repo line.", subjectRef);
          if (!EID_RE.test(rest)) failParse("mermaid-strict-invalid", idx, "Invalid owning-repo EID.", subjectRef);
          owningRepoEid = { eid: rest, lineIdx: idx };
        } else if (kw === "profile") {
          const profMatch = /^([a-z][a-z0-9-]*)@(0|[1-9][0-9]*)$/.exec(rest);
          if (!profMatch || !isSafeIntDecString(profMatch[2]!)) {
            failParse("mermaid-strict-invalid", idx, "Invalid profile reference syntax.", subjectRef);
          }
          if (rest !== "archi@1" && rest !== "generic@2") {
            failParse("mermaid-strict-annotation-unknown", idx, `Unknown profile '${rest}'.`, subjectRef);
          }
          if (profileRefSet.has(rest)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate profile '${rest}'.`, subjectRef);
          }
          profileRefSet.add(rest);
          profileRefs.push(rest);
        } else if (kw === "pin") {
          const parts = rest.split(/ +/);
          if (parts.length !== 4) {
            failParse("mermaid-strict-invalid", idx, "Malformed pin line.", subjectRef);
          }
          const [role, id, version, digest] = parts as [string, string, string, string];
          if (role !== "profile" && role !== "cards" && role !== "view-schema") {
            failParse("mermaid-strict-annotation-unknown", idx, `Unknown pin role '${role}'.`, subjectRef);
          }
          if (!WORD_RE.test(id) || !isSafeVersionString(version) || !HEX64_RE.test(digest)) {
            failParse("mermaid-strict-invalid", idx, "Invalid pin arguments.", subjectRef);
          }
          const pinObj: Pin = { id, version, contentDigest: digest };
          if (role === "profile") {
            if (profilePinIdSet.has(id)) {
              failParse("mermaid-strict-duplicate", idx, `Duplicate pin profile '${id}'.`, subjectRef);
            }
            profilePinIdSet.add(id);
            profilePins.push(pinObj);
          } else if (role === "cards") {
            if (cardsPin !== undefined) {
              failParse("mermaid-strict-duplicate", idx, "Duplicate pin cards line.", subjectRef);
            }
            cardsPin = pinObj;
          } else {
            if (viewSchemaPin !== undefined) {
              failParse("mermaid-strict-duplicate", idx, "Duplicate pin view-schema line.", subjectRef);
            }
            viewSchemaPin = pinObj;
          }
        }
        continue;
      }

      // Leaving head section on first non-head @dl line
      if (section === "head") {
        if (
          !STRUCTURAL_DL_KEYWORDS.has(kw) &&
          !ALL_DECLARED_ATTR_NAMES.has(kw) &&
          kw !== "name" &&
          kw !== "form"
        ) {
          failParse("mermaid-strict-annotation-unknown", idx, `Unknown @dl keyword '${kw}' in head.`, subjectRef);
        }
        ensureHeadComplete(idx);
        section = "tree";
      }

      if (kw === "entity") {
        if (openEntity || openRelation || openView || section !== "tree") {
          failParse("mermaid-strict-invalid", idx, "Unexpected 'entity' annotation.", subjectRef);
        }
        const parts = rest === "" ? [] : rest.split(/ +/);
        if (parts.length < 1 || parts.length > 2) {
          failParse("mermaid-strict-invalid", idx, "Invalid 'entity' head syntax.", subjectRef);
        }
        const entType = parts[0]!;
        const form = parts[1];
        const spec = ENTITY_SPECS.get(entType);
        if (!spec || !profileRefSet.has(spec.profile)) {
          failParse("mermaid-strict-annotation-unknown", idx, `Undeclared entity type '${entType}'.`, subjectRef);
        }
        if (form !== undefined) {
          if (!spec.forms) {
            failParse("mermaid-strict-annotation-unknown", idx, `Entity type '${entType}' does not declare a form.`, subjectRef);
          }
          if (!WORD_RE.test(form)) {
            failParse("mermaid-strict-invalid", idx, `Invalid form token '${form}'.`, subjectRef);
          }
        }
        openEntity = {
          type: entType,
          spec,
          form,
          attrBag: { attrs: {}, explicitEmptyCollections: new Set() },
          openLineIdx: idx,
        };
        continue;
      }

      if (kw === "nest") {
        if (!openEntity || openEntity.nest || subgraphStack.length === 0 || section !== "tree") {
          failParse("mermaid-strict-invalid", idx, "Unexpected 'nest' annotation.", subjectRef);
        }
        if (!LOCAL_RE.test(rest)) {
          failParse("mermaid-strict-invalid", idx, `Invalid nest relation local id '${rest}'.`, subjectRef);
        }
        const relId = `relation:${rest}`;
        if (seenRelationIds.has(relId)) {
          failParse("mermaid-strict-duplicate", idx, `Duplicate relation id '${relId}'.`, subjectRef);
        }
        const nestRelType = openEntity.spec.profile === "archi@1" ? "partOf" : "contains";
        const nestSpec = RELATION_SPECS.get(nestRelType)!;
        openEntity.nest = {
          localId: rest,
          relId,
          spec: nestSpec,
          attrBag: { attrs: {}, explicitEmptyCollections: new Set() },
          lineIdx: idx,
        };
        continue;
      }

      if (kw === "edge" || kw === "rel") {
        if (openEntity || subgraphStack.length > 0 || (section !== "tree" && section !== "relations")) {
          failParse("mermaid-strict-invalid", idx, `Out-of-order '${kw}' block.`, subjectRef);
        }
        finalizeOpenRel();
        section = "relations";
        const parts = rest === "" ? [] : rest.split(/ +/);
        if (kw === "edge") {
          if (parts.length !== 2) {
            failParse("mermaid-strict-invalid", idx, "Malformed 'edge' head.", subjectRef);
          }
          const [localId, relType] = parts as [string, string];
          if (!LOCAL_RE.test(localId) || !NAME_RE.test(relType)) {
            failParse("mermaid-strict-invalid", idx, "Invalid edge local id or relation type token.", subjectRef);
          }
          const spec = RELATION_SPECS.get(relType);
          if (!spec || !profileRefSet.has(spec.profile)) {
            failParse("mermaid-strict-annotation-unknown", idx, `Undeclared relation type '${relType}'.`, subjectRef);
          }
          if (relType === "partOf" || relType === "contains") {
            failParse("mermaid-strict-placement-drift", idx, `Nesting relation '${relType}' cannot be written as edge.`, subjectRef);
          }
          const relId = `relation:${localId}`;
          if (seenRelationIds.has(relId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate relation id '${relId}'.`, subjectRef);
          }
          openRelation = {
            kind: "edge",
            localId,
            relId,
            relType,
            spec,
            attrBag: { attrs: {}, explicitEmptyCollections: new Set() },
            lineIdx: idx,
          };
        } else {
          if (parts.length !== 4) {
            failParse("mermaid-strict-invalid", idx, "Malformed 'rel' head.", subjectRef);
          }
          const [localId, relType, srcEid, tgtEid] = parts as [string, string, string, string];
          if (!LOCAL_RE.test(localId) || !NAME_RE.test(relType) || !EID_RE.test(srcEid) || !EID_RE.test(tgtEid)) {
            failParse("mermaid-strict-invalid", idx, "Invalid rel arguments.", subjectRef);
          }
          const spec = RELATION_SPECS.get(relType);
          if (!spec || !profileRefSet.has(spec.profile)) {
            failParse("mermaid-strict-annotation-unknown", idx, `Undeclared relation type '${relType}'.`, subjectRef);
          }
          if (relType === "partOf" || relType === "contains") {
            failParse("mermaid-strict-placement-drift", idx, `Nesting relation '${relType}' cannot be written as rel.`, subjectRef);
          }
          const relId = `relation:${localId}`;
          if (seenRelationIds.has(relId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate relation id '${relId}'.`, subjectRef);
          }
          openRelation = {
            kind: "rel",
            localId,
            relId,
            relType,
            spec,
            srcEid,
            tgtEid,
            attrBag: { attrs: {}, explicitEmptyCollections: new Set() },
            lineIdx: idx,
          };
        }
        continue;
      }

      if (kw === "view") {
        if (openEntity || subgraphStack.length > 0 || (section !== "tree" && section !== "relations" && section !== "views")) {
          failParse("mermaid-strict-invalid", idx, "Out-of-order 'view' block.", subjectRef);
        }
        finalizeOpenRel();
        finalizeOpenView();
        section = "views";
        const parts = rest === "" ? [] : rest.split(/ +/);
        if (parts.length !== 2) {
          failParse("mermaid-strict-invalid", idx, "Malformed 'view' head.", subjectRef);
        }
        const [vLocal, hierarchy] = parts as [string, string];
        if (!LOCAL_RE.test(vLocal) || !WORD_RE.test(hierarchy)) {
          failParse("mermaid-strict-invalid", idx, "Invalid view local id or hierarchy.", subjectRef);
        }
        if (seenViewIds.has(vLocal)) {
          failParse("mermaid-strict-duplicate", idx, `Duplicate view '${vLocal}'.`, subjectRef);
        }
        seenViewIds.add(vLocal);
        openView = {
          localId: vLocal,
          viewId: `view:${vLocal}`,
          activeHierarchy: hierarchy as ArchiActiveHierarchy,
          drawSet: new Set(),
          expandedEntries: [],
          expandedSet: new Set(),
          legendKeys: [],
          legendKeySet: new Set(),
          legendTokens: new Map(),
          tokenLines: [],
          keyLines: [],
          gaps: {},
          ordering: new Map(),
          grouping: [],
          groupsById: new Map(),
          lineIdx: idx,
        };
        continue;
      }

      if (VIEW_BODY_KEYWORDS.has(kw)) {
        if (!openView || section !== "views") {
          failParse("mermaid-strict-annotation-unknown", idx, `View keyword '${kw}' outside view block.`, subjectRef);
        }
        if (kw === "draw") {
          if (!EID_RE.test(rest)) failParse("mermaid-strict-invalid", idx, "Invalid EID on draw line.", subjectRef);
          const entId = eidToEntityId.get(rest);
          if (!entId) failParse("mermaid-strict-orphan-ref", idx, `Unknown entity '${rest}' in draw.`, subjectRef);
          if (openView.drawSet.has(entId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate draw entity '${rest}'.`, subjectRef);
          }
          openView.drawSet.add(entId);
        } else if (kw === "expanded") {
          if (!EID_RE.test(rest)) failParse("mermaid-strict-invalid", idx, "Invalid EID on expanded line.", subjectRef);
          const entId = eidToEntityId.get(rest);
          if (!entId) failParse("mermaid-strict-orphan-ref", idx, `Unknown entity '${rest}' in expanded.`, subjectRef);
          if (openView.expandedSet.has(entId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate expanded entity '${rest}'.`, subjectRef);
          }
          openView.expandedSet.add(entId);
          openView.expandedEntries.push({ entityId: entId, lineIdx: idx });
        } else if (kw === "legend") {
          if (openView.legend !== undefined) {
            failParse("mermaid-strict-duplicate", idx, "Duplicate legend line in view.", subjectRef);
          }
          const sp = rest.indexOf(" ");
          const eid = sp === -1 ? rest : rest.slice(0, sp);
          const titleRaw = sp === -1 ? undefined : trimSp(rest.slice(sp + 1));
          if (!EID_RE.test(eid)) failParse("mermaid-strict-invalid", idx, "Invalid legend EID.", subjectRef);
          const entId = eidToEntityId.get(eid);
          if (!entId) failParse("mermaid-strict-orphan-ref", idx, `Unknown legend entity '${eid}'.`, subjectRef);
          const title = titleRaw !== undefined ? decodeAString(titleRaw, idx, subjectRef) : undefined;
          openView.legend = { legendRef: entId, ...(title !== undefined ? { title } : {}) };
        } else if (kw === "key") {
          if (!EID_RE.test(rest)) failParse("mermaid-strict-invalid", idx, "Invalid key EID.", subjectRef);
          const entId = eidToEntityId.get(rest);
          if (!entId) failParse("mermaid-strict-orphan-ref", idx, `Unknown key entity '${rest}'.`, subjectRef);
          if (openView.legendKeySet.has(entId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate legend key '${rest}'.`, subjectRef);
          }
          openView.legendKeySet.add(entId);
          openView.legendKeys.push(entId);
          openView.keyLines.push(idx);
        } else if (kw === "token") {
          if (!rest.startsWith('"')) {
            failParse("mermaid-strict-invalid", idx, "token category must be an ASTRING.", subjectRef);
          }
          let endQuote = -1;
          for (let k = 1; k < rest.length; k++) {
            if (rest[k] === "\\") {
              k++;
              continue;
            }
            if (rest[k] === '"') {
              endQuote = k;
              break;
            }
          }
          if (endQuote === -1) {
            failParse("mermaid-strict-invalid", idx, "Unterminated category ASTRING on token line.", subjectRef);
          }
          const catRaw = rest.slice(0, endQuote + 1);
          const afterCat = rest.slice(endQuote + 1);
          if (!afterCat.startsWith(" ")) {
            failParse("mermaid-strict-invalid", idx, "Missing space after category on token line.", subjectRef);
          }
          const tokenStr = trimSp(afterCat);
          if (!TOKEN_RE.test(tokenStr)) {
            failParse("mermaid-strict-invalid", idx, `Invalid token '${tokenStr}'.`, subjectRef);
          }
          const category = decodeAString(catRaw, idx, subjectRef);
          if (openView.legendTokens.has(category)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate token category '${category}'.`, subjectRef);
          }
          openView.legendTokens.set(category, tokenStr);
          openView.tokenLines.push(idx);
        } else if (kw === "stretch") {
          if (openView.stretch !== undefined) {
            failParse("mermaid-strict-duplicate", idx, "Duplicate stretch line in view.", subjectRef);
          }
          if (rest !== "true" && rest !== "false") {
            failParse("mermaid-strict-invalid", idx, "stretch requires 'true' or 'false'.", subjectRef);
          }
          openView.stretch = rest === "true";
        } else if (kw === "gap") {
          const parts = rest.split(/ +/);
          if (parts.length !== 2) failParse("mermaid-strict-invalid", idx, "Malformed gap line.", subjectRef);
          const [gapKey, intStr] = parts as [string, string];
          const field = GAP_KEY_TO_FIELD.get(gapKey);
          if (!field || !isSafeIntDecString(intStr)) {
            failParse("mermaid-strict-invalid", idx, "Invalid gap key or integer.", subjectRef);
          }
          if (Object.hasOwn(openView.gaps, field)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate gap '${gapKey}'.`, subjectRef);
          }
          openView.gaps[field] = Number(intStr);
        } else if (kw === "order") {
          const parts = rest === "" ? [] : rest.split(/ +/);
          if (parts.length < 1) failParse("mermaid-strict-invalid", idx, "Malformed order line.", subjectRef);
          const parentEid = parts[0]!;
          if (!EID_RE.test(parentEid)) failParse("mermaid-strict-invalid", idx, "Invalid parent EID on order line.", subjectRef);
          const parentId = eidToEntityId.get(parentEid);
          if (!parentId) failParse("mermaid-strict-orphan-ref", idx, `Unknown parent '${parentEid}' on order line.`, subjectRef);
          if (openView.ordering.has(parentId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate order line for '${parentEid}'.`, subjectRef);
          }
          const children: string[] = [];
          const seenChildren = new Set<string>();
          for (let k = 1; k < parts.length; k++) {
            const cEid = parts[k]!;
            if (!EID_RE.test(cEid)) failParse("mermaid-strict-invalid", idx, "Invalid child EID on order line.", subjectRef);
            const cId = eidToEntityId.get(cEid);
            if (!cId) failParse("mermaid-strict-orphan-ref", idx, `Unknown child '${cEid}' on order line.`, subjectRef);
            if (seenChildren.has(cId)) {
              failParse("mermaid-strict-duplicate", idx, `Duplicate child '${cEid}' on order line.`, subjectRef);
            }
            seenChildren.add(cId);
            children.push(cId);
          }
          openView.ordering.set(parentId, children);
        } else if (kw === "group") {
          const parts = rest === "" ? [] : rest.split(/ +/);
          if (parts.length < 2) failParse("mermaid-strict-invalid", idx, "Malformed group line.", subjectRef);
          const gid = parts[0]!;
          const dir = parts[1]!;
          if (!LOCAL_RE.test(gid) || (dir !== "rows" && dir !== "columns")) {
            failParse("mermaid-strict-invalid", idx, "Invalid group id or direction.", subjectRef);
          }
          if (openView.groupsById.has(gid)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate layout group id '${gid}' in view.`, subjectRef);
          }
          let p = 2;
          let parentGid: string | undefined;
          let gStretch: boolean | undefined;
          let gapAfter: number | undefined;
          if (p < parts.length && parts[p] === "in") {
            if (p + 1 >= parts.length || !LOCAL_RE.test(parts[p + 1]!)) {
              failParse("mermaid-strict-invalid", idx, "Invalid 'in <parent>' on group line.", subjectRef);
            }
            parentGid = parts[p + 1]!;
            p += 2;
          }
          if (p < parts.length && parts[p] === "stretch") {
            if (p + 1 >= parts.length || (parts[p + 1] !== "true" && parts[p + 1] !== "false")) {
              failParse("mermaid-strict-invalid", idx, "Invalid 'stretch <BOOL>' on group line.", subjectRef);
            }
            gStretch = parts[p + 1] === "true";
            p += 2;
          }
          if (p < parts.length && parts[p] === "gap-after") {
            if (p + 1 >= parts.length || !isSafeIntDecString(parts[p + 1]!)) {
              failParse("mermaid-strict-invalid", idx, "Invalid 'gap-after <INT>' on group line.", subjectRef);
            }
            gapAfter = Number(parts[p + 1]!);
            p += 2;
          }
          if (p !== parts.length) {
            failParse("mermaid-strict-invalid", idx, "Unexpected trailing tokens on group line.", subjectRef);
          }
          const grp: MutableLayoutGroup = {
            id: gid,
            direction: dir,
            ...(gStretch !== undefined ? { stretch: gStretch } : {}),
            ...(gapAfter !== undefined ? { gapAfter } : {}),
            items: [],
            directRefs: new Set(),
          };
          if (parentGid !== undefined) {
            const parentGrp = openView.groupsById.get(parentGid);
            if (!parentGrp) {
              failParse("mermaid-strict-orphan-ref", idx, `Undeclared parent group '${parentGid}'.`, subjectRef);
            }
            parentGrp.items.push(grp);
          } else {
            openView.grouping.push(grp);
          }
          openView.groupsById.set(gid, grp);
        } else if (kw === "item") {
          const parts = rest.split(/ +/);
          if (parts.length !== 2) failParse("mermaid-strict-invalid", idx, "Malformed item line.", subjectRef);
          const [gid, eid] = parts as [string, string];
          if (!LOCAL_RE.test(gid) || !EID_RE.test(eid)) {
            failParse("mermaid-strict-invalid", idx, "Invalid item arguments.", subjectRef);
          }
          const grp = openView.groupsById.get(gid);
          if (!grp) {
            failParse("mermaid-strict-orphan-ref", idx, `Undeclared layout group '${gid}' on item line.`, subjectRef);
          }
          const entId = eidToEntityId.get(eid);
          if (!entId) {
            failParse("mermaid-strict-orphan-ref", idx, `Unknown entity '${eid}' on item line.`, subjectRef);
          }
          if (grp.directRefs.has(entId)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate item '${eid}' in group '${gid}'.`, subjectRef);
          }
          grp.directRefs.add(entId);
          grp.items.push(entId);
        }
        continue;
      }

      // Attribute line in entity, nest, edge, or rel block
      if (openEntity) {
        if (!NAME_RE.test(kw)) {
          failParse("mermaid-strict-annotation-unknown", idx, `Invalid attribute name '${kw}'.`, subjectRef);
        }
        if (openEntity.nest) {
          parseAttrLine(kw, rest, openEntity.nest.spec.attrMap, openEntity.nest.attrBag, "nest", idx, subjectRef);
        } else {
          parseAttrLine(kw, rest, openEntity.spec.attrMap, openEntity.attrBag, "entity", idx, subjectRef);
        }
        continue;
      }
      if (openRelation) {
        if (!NAME_RE.test(kw)) {
          failParse("mermaid-strict-annotation-unknown", idx, `Invalid attribute name '${kw}'.`, subjectRef);
        }
        parseAttrLine(kw, rest, openRelation.spec.attrMap, openRelation.attrBag, openRelation.kind, idx, subjectRef);
        continue;
      }

      if (ALL_DECLARED_ATTR_NAMES.has(kw) && (section === "tree" || section === "relations")) {
        failParse("mermaid-strict-invalid", idx, `Attribute '${kw}' without preceding entity or relation head.`, subjectRef);
      }

      failParse("mermaid-strict-annotation-unknown", idx, `Unknown or out-of-context @dl keyword '${kw}'.`, subjectRef);
    }

    // 2. Non-annotation statement lines
    const rawFirstStmtWord = trimmed.split(/ +/)[0] ?? "";
    const firstStmtWord = rawFirstStmtWord.replace(/:$/, "");
    if (
      trimmed === "---" ||
      UNSUPPORTED_STATEMENT_HEADS.has(firstStmtWord) ||
      firstStmtWord === "flowchart"
    ) {
      failParse("mermaid-strict-unsupported", idx, `Unsupported Mermaid statement '${rawFirstStmtWord}'.`, subjectRef);
    }
    if (section === "head") {
      if (firstStmtWord === "classDef" || firstStmtWord === "class") {
        failParse("mermaid-strict-unsupported", idx, `Unsupported '${firstStmtWord}' statement in head.`, subjectRef);
      }
      ensureHeadComplete(idx);
      section = "tree";
    }

    // Handle `end`
    if (trimmed === "end") {
      if (section !== "tree" || openEntity || subgraphStack.length === 0) {
        failParse("mermaid-strict-invalid", idx, "Unbalanced or unexpected 'end'.", subjectRef);
      }
      subgraphStack.pop();
      continue;
    }

    // Handle `classDef` and `class`
    if (trimmed.startsWith("classDef ") || trimmed === "classDef" || trimmed.startsWith("class ") || trimmed === "class") {
      if (openEntity || subgraphStack.length > 0) {
        failParse("mermaid-strict-invalid", idx, "Class statement inside tree.", subjectRef);
      }
      finalizeOpenRel();
      finalizeOpenView();
      section = "classes";

      const tokens = trimmed.split(/ +/);
      if (tokens[0] === "classDef") {
        if (
          tokens.length !== 5 ||
          tokens[1] !== "dashed" ||
          tokens[2] !== "stroke-dasharray:" ||
          tokens[3] !== "5" ||
          tokens[4] !== "5"
        ) {
          failParse("mermaid-strict-unsupported", idx, "Unsupported classDef statement.", subjectRef);
        }
        if (classBlockState !== "none") {
          failParse("mermaid-strict-duplicate", idx, "Duplicate classDef block.", subjectRef);
        }
        classBlockState = "expect-class";
        classBlockLineIdx = idx;
        continue;
      } else {
        if (tokens.length !== 3 || tokens[2] !== "dashed") {
          failParse("mermaid-strict-unsupported", idx, "Unsupported class statement.", subjectRef);
        }
        if (classBlockState === "none") {
          failParse("mermaid-strict-invalid", idx, "class line without preceding classDef.", subjectRef);
        }
        if (classBlockState === "done") {
          failParse("mermaid-strict-duplicate", idx, "Duplicate class line.", subjectRef);
        }
        const rawEids = tokens[1]!.split(",");
        if (rawEids.length === 0) {
          failParse("mermaid-strict-invalid", idx, "Empty class EID list.", subjectRef);
        }
        for (const eid of rawEids) {
          if (!EID_RE.test(eid)) {
            failParse("mermaid-strict-invalid", idx, `Invalid EID '${eid}' in class line.`, subjectRef);
          }
          if (!eidToEntityId.has(eid)) {
            failParse("mermaid-strict-orphan-ref", idx, `Unknown entity '${eid}' in class line.`, subjectRef);
          }
          if (dashedClassEidSet.has(eid)) {
            failParse("mermaid-strict-duplicate", idx, `Duplicate entity '${eid}' in class line.`, subjectRef);
          }
          dashedClassEidSet.add(eid);
          dashedClassEids.push(eid);
        }
        classBlockState = "done";
        classBlockLineIdx = idx;
        section = "done";
        continue;
      }
    }

    // Try matching node or subgraph statement:
    // subgraph <EID>[<VSTRING>] or <EID>[<VSTRING>]
    const nodeOrSubgraphMatch = /^(subgraph +)?(e_[a-z][a-z0-9_]{0,39})\[(".*")\]$/.exec(trimmed);
    if (nodeOrSubgraphMatch) {
      if (section !== "tree" || !openEntity) {
        failParse("mermaid-strict-invalid", idx, "Statement without preceding entity head.", subjectRef);
      }
      const isSubgraph = nodeOrSubgraphMatch[1] !== undefined;
      const eid = nodeOrSubgraphMatch[2]!;
      const rawVString = nodeOrSubgraphMatch[3]!;

      // Check for Markdown string `...` inside ["..."]
      if (rawVString.length >= 4 && rawVString.startsWith('"`') && rawVString.endsWith('`"')) {
        failParse("mermaid-strict-unsupported", idx, "Markdown string labels are unsupported.", subjectRef);
      }
      const nameVal = decodeVString(rawVString, idx, subjectRef);

      if (subgraphStack.length > 0 && !openEntity.nest) {
        failParse("mermaid-strict-invalid", idx, "Inner block inside subgraph requires a 'nest' head.", subjectRef);
      }
      if (eidToEntityId.has(eid)) {
        failParse("mermaid-strict-duplicate", idx, `Duplicate entity EID '${eid}'.`, subjectRef);
      }
      if (isSubgraph !== openEntity.spec.container) {
        failParse(
          "mermaid-strict-placement-drift",
          idx,
          `Entity type '${openEntity.type}' container flag contradicts ${isSubgraph ? "subgraph" : "node"} statement.`,
          subjectRef,
        );
      }
      if (subgraphStack.length > 0) {
        const parent = subgraphStack[subgraphStack.length - 1]!;
        if (parent.profile !== openEntity.spec.profile) {
          failParse("mermaid-strict-placement-drift", idx, "Cross-family nesting is forbidden.", subjectRef);
        }
      }

      const entityId = fromEid(eid);
      const attrs: Record<string, NativeAttributeValue> = {
        name: { kind: "text", value: nameVal },
        ...(openEntity.form !== undefined ? { form: { kind: "enum", value: openEntity.form } } : {}),
        ...openEntity.attrBag.attrs,
      };
      if (openEntity.spec.profile === "archi@1" && !Object.hasOwn(attrs, "lifecycle")) {
        attrs["lifecycle"] = { kind: "enum", value: "current" };
      }

      entities[entityId] = {
        id: entityId,
        profile: openEntity.spec.profile,
        type: openEntity.type,
        attributes: attrs,
      };
      eidToEntityId.set(eid, entityId);

      if (openEntity.nest) {
        const parent = subgraphStack[subgraphStack.length - 1]!;
        const nest = openEntity.nest;
        if (nest.spec.profile === "archi@1" && !Object.hasOwn(nest.attrBag.attrs, "lifecycle")) {
          nest.attrBag.attrs["lifecycle"] = { kind: "enum", value: "current" };
        }
        const endpoints =
          nest.spec.profile === "archi@1"
            ? [
                { role: "source", target: entityId },
                { role: "target", target: parent.entityId },
              ]
            : [
                { role: "parent", target: parent.entityId },
                { role: "child", target: entityId },
              ];
        const relRecord: NativeRelation = {
          id: nest.relId,
          profile: nest.spec.profile,
          type: nest.spec.profile === "archi@1" ? "partOf" : "contains",
          endpoints,
          attributes: nest.attrBag.attrs,
        };
        relations[nest.relId] = relRecord;
        seenRelationIds.add(nest.relId);
        nestRelationByChild.set(entityId, relRecord);
      }

      if (isSubgraph) {
        subgraphStack.push({
          entityId,
          profile: openEntity.spec.profile,
          type: openEntity.type,
          lineIdx: idx,
        });
      }
      openEntity = undefined;
      continue;
    }

    // Try matching edge statement:
    // <srcEid> (-->|-.->)[|<VSTRING>|] <tgtEid>
    const edgeMatch = /^(e_[a-z][a-z0-9_]{0,39}) +(-->|-\.->)(?:\|(".*")\|)? +(e_[a-z][a-z0-9_]{0,39})$/.exec(trimmed);
    if (edgeMatch) {
      if (section !== "relations" || !openRelation || openRelation.kind !== "edge") {
        failParse("mermaid-strict-invalid", idx, "Edge statement without preceding edge head.", subjectRef);
      }
      const srcEid = edgeMatch[1]!;
      const arrow = edgeMatch[2] as "-->" | "-.->";
      const rawLabel = edgeMatch[3];
      const tgtEid = edgeMatch[4]!;

      if (rawLabel !== undefined && rawLabel.length >= 4 && rawLabel.startsWith('"`') && rawLabel.endsWith('`"')) {
        failParse("mermaid-strict-unsupported", idx, "Markdown string labels are unsupported.", subjectRef);
      }
      const labelVal = rawLabel !== undefined ? decodeVString(rawLabel, idx, subjectRef) : undefined;
      const srcId = eidToEntityId.get(srcEid);
      const tgtId = eidToEntityId.get(tgtEid);
      if (!srcId || !tgtId) {
        failParse("mermaid-strict-orphan-ref", idx, "Unknown endpoint EID on edge statement.", subjectRef);
      }
      const srcEnt = entities[srcId]!;
      const tgtEnt = entities[tgtId]!;

      const attrs: Record<string, NativeAttributeValue> = {
        ...openRelation.attrBag.attrs,
        ...(labelVal !== undefined ? { label: { kind: "text", value: labelVal } } : {}),
      };
      if (openRelation.spec.profile === "archi@1" && !Object.hasOwn(attrs, "lifecycle")) {
        attrs["lifecycle"] = { kind: "enum", value: "current" };
      }

      const placement = computeRelationPlacement(openRelation.relType, srcEnt, tgtEnt, attrs);
      if (placement !== "edge") {
        failParse(
          "mermaid-strict-placement-drift",
          idx,
          `Relation '${openRelation.relId}' must be encoded as '${placement}', not 'edge'.`,
          subjectRef,
        );
      }

      const lc = getAttrString(attrs, "lifecycle") ?? "current";
      const expectedArrow = lc === "current" ? "-->" : "-.->";
      if (arrow !== expectedArrow) {
        failParse(
          "mermaid-strict-style-drift",
          idx,
          `Edge '${openRelation.relId}' lifecycle '${lc}' requires '${expectedArrow}', got '${arrow}'.`,
          subjectRef,
        );
      }

      relations[openRelation.relId] = {
        id: openRelation.relId,
        profile: openRelation.spec.profile,
        type: openRelation.relType,
        endpoints: [
          { role: openRelation.spec.roles[0], target: srcId },
          { role: openRelation.spec.roles[1], target: tgtId },
        ],
        attributes: attrs,
      };
      seenRelationIds.add(openRelation.relId);
      openRelation = undefined;
      continue;
    }

    classifyUnsupportedOrInvalidStatement(trimmed, idx, subjectRef);
  }

  // End-of-file completeness checks
  ensureHeadComplete(rawLines.length - 1);
  if (openEntity) {
    failParse("mermaid-strict-invalid", openEntity.openLineIdx, "Entity head not closed by statement.", subjectRef);
  }
  if (subgraphStack.length > 0) {
    failParse("mermaid-strict-invalid", subgraphStack[subgraphStack.length - 1]!.lineIdx, "Unclosed subgraph.", subjectRef);
  }
  finalizeOpenRel();
  finalizeOpenView();
  if (classBlockState === "expect-class") {
    failParse("mermaid-strict-invalid", classBlockLineIdx, "classDef dashed not followed by class line.", subjectRef);
  }

  const owningRepoId = eidToEntityId.get(owningRepoEid!.eid);
  if (!owningRepoId) {
    failParse("mermaid-strict-orphan-ref", owningRepoEid!.lineIdx, `Unknown owning-repo '${owningRepoEid!.eid}'.`, subjectRef);
  }

  // K11 / §3.5: Verify class dashed block matches preview status of entities
  const expectedDashedSet = new Set<string>();
  for (const [entId, ent] of Object.entries(entities)) {
    const entLc = getAttrString(ent.attributes, "lifecycle") ?? "current";
    const nestRel = nestRelationByChild.get(entId);
    const nestLc = nestRel ? (getAttrString(nestRel.attributes, "lifecycle") ?? "current") : "current";
    if (entLc !== "current" || nestLc !== "current") {
      expectedDashedSet.add(toEid(entId));
    }
  }
  if (expectedDashedSet.size === 0 && classBlockState === "done") {
    failParse("mermaid-strict-style-drift", classBlockLineIdx, "Unexpected class dashed block when all entities are current.", subjectRef);
  }
  if (expectedDashedSet.size > 0 && classBlockState !== "done") {
    failParse("mermaid-strict-style-drift", rawLines.length - 1, "Missing class dashed block for non-current entities.", subjectRef);
  }
  if (expectedDashedSet.size !== dashedClassEidSet.size || [...expectedDashedSet].some((eid) => !dashedClassEidSet.has(eid))) {
    failParse("mermaid-strict-style-drift", classBlockLineIdx, "class dashed EID list does not match non-current entities.", subjectRef);
  }

  // Sort views by derived view-specs/<localId>.json path (manifest.views order)
  const viewSpecPath = (v: ArchiViewSpec): string => `view-specs/${v.viewId.slice("view:".length)}.json`;
  parsedViews.sort((a, b) => cmpBytes(viewSpecPath(a), viewSpecPath(b)));
  const manifestViews = parsedViews.map(viewSpecPath);

  const manifest: ArchiManifest = {
    format: "engram.archi-manifest/1",
    language: language!,
    owningRepo: owningRepoId,
    document: "document.json",
    views: manifestViews,
    profilePins,
    ...(cardsPin !== undefined ? { cardsPin } : {}),
    viewSchemaPin: viewSchemaPin!,
  };

  const document: NativeSemanticDocument = {
    documentId: `document:${docLocal!}`,
    schemaVersion: schemaVersion!,
    revision: revision!,
    profileRefs,
    typeDefinitions: {},
    entities,
    relations,
    ports: {},
    resources: {},
    extensions: [],
  };

  const triple: ArchiSourceTriple = {
    manifest,
    document,
    views: parsedViews,
  };

  if (options.checkCanonical) {
    const canonicalText = printOrRefuse(triple, subjectRef);
    if (canonicalText !== text) {
      const actualLines = text.split("\n");
      const expectedLines = canonicalText.split("\n");
      let diffIdx = 0;
      const maxLen = Math.max(actualLines.length, expectedLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (actualLines[i] !== expectedLines[i]) {
          diffIdx = i;
          break;
        }
      }
      if (diffIdx >= actualLines.length) {
        diffIdx = Math.max(0, actualLines.length - 1);
      }
      const aLine = actualLines[diffIdx] ?? "";
      const eLine = expectedLines[diffIdx] ?? "";
      let diffCol = 1;
      const minChars = Math.min(aLine.length, eLine.length);
      while (diffCol - 1 < minChars && aLine.charCodeAt(diffCol - 1) === eLine.charCodeAt(diffCol - 1)) {
        diffCol++;
      }
      failParse(
        "mermaid-strict-noncanonical",
        diffIdx,
        `Non-canonical text at line ${diffIdx + 1}, column ${diffCol}.`,
        subjectRef,
        diffCol,
      );
    }
  }

  return triple;
}

// ---------------------------------------------------------------------------
// Public zero-dependency codec API (@sentropic/engram/archi-mermaid)
// ---------------------------------------------------------------------------

/**
 * Parse `engram.archi-mermaid/1` text into an authored {@link ArchiSourceTriple} (P-2 r3 §4, §7).
 *
 * Returns a discriminated {@link ArchiMermaidResult} union and never throws.
 * Note: At the codec layer, `language`, `lifecycle`, `form`, and enum attribute values accept any
 * lexical `WORD` (`^[a-z][a-z0-9-]*$`); semantic value narrowing belongs to stage 3 (`checkArchiSource` / `validateNativeSemanticDocument`).
 */
export function parseArchiMermaid(
  text: unknown,
  options?: ArchiMermaidParseOptions,
): ArchiMermaidResult<ArchiSourceTriple> {
  const subjectRef = resolveSubjectRef(options);
  const checkCanonical =
    Boolean(options && typeof options === "object" && !Array.isArray(options)) &&
    (options as ArchiMermaidParseOptions).checkCanonical === true;
  return settle(
    () => parseOrRefuse(text, { checkCanonical, subjectRef }),
    "mermaid-strict-invalid",
    "/0",
    subjectRef,
  );
}

/**
 * Print an authored {@link ArchiSourceTriple} to canonical `engram.archi-mermaid/1` text (P-2 r3 §4).
 *
 * Returns a discriminated {@link ArchiMermaidResult} union and never throws.
 */
export function printArchiMermaid(
  triple: unknown,
  options?: ArchiMermaidPrintOptions,
): ArchiMermaidResult<string> {
  const subjectRef = resolveSubjectRef(options);
  return settle(
    () => printOrRefuse(triple, subjectRef),
    "mermaid-strict-unrepresentable",
    "",
    subjectRef,
  );
}

/**
 * Format parseable `engram.archi-mermaid/1` text to canonical bytes, or verify canonical form when `check: true` (P-2 r3 §4).
 *
 * Returns a discriminated {@link ArchiMermaidResult} union and never throws.
 */
export function formatArchiMermaid(
  text: unknown,
  options?: ArchiMermaidFormatOptions,
): ArchiMermaidResult<string> {
  const subjectRef = resolveSubjectRef(options);
  const check =
    Boolean(options && typeof options === "object" && !Array.isArray(options)) &&
    (options as ArchiMermaidFormatOptions).check === true;
  const parsed = parseArchiMermaid(text, { checkCanonical: check, subjectRef });
  if (!parsed.ok) return parsed;
  return printArchiMermaid(parsed.value, { subjectRef });
}
