// Proposed archi@1 strict I-JSON reader, closed shape guards, §5.6 canonical checks and diagnostic envelope helpers
// (spec/SPEC_EVOL_ARCHI_CARDS.md §5.1–§5.6).
import {
  sortDiagnostics,
  validPointer,
  type ArchiDsDiagnostic,
  type DsDiagnosticSeverity,
  type EngramDiagnostic,
} from "./diagnostics.js";
import { checkSemanticShape } from "./diagram-document-shape.js";
import type { NativeSemanticDocument } from "./diagram-native-types.js";
import { GENERIC_V2 } from "./diagram-profiles.js";
import type { Pin } from "./types.js";
import {
  ARCHI_DIAGNOSTIC_CODES,
  type ArchiDiagnosticCode,
  type ArchiLanguage,
  type ArchiManifest,
} from "./archi-check.js";
import { ARCHI_V1 } from "./archi-profile.js";
import { ARCHI_CONTAINER_KINDS, type ArchiActiveHierarchy } from "./archi-cards.js";
import type { ArchiViewSpec } from "./archi-view.js";

/** Fixed repository-relative path for architecture discovery (§5.1). */
export const ARCHI_MANIFEST_PATH = ".engram/architecture/manifest.json" as const;

const LOCAL_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAX_LOCAL_ID_LEN = 40;
const DIGEST_HEX_RE = /^[0-9a-f]{64}$/;
const COMMIT_HEX_RE = /^[0-9a-f]{40}$/;
const ACTIVE_HIERARCHIES: ReadonlySet<string> = new Set<ArchiActiveHierarchy>([
  "archi-composition",
  "archi-source",
  "archi-deployment",
  "archi-dossier-hosts",
]);
const ARCHI_CODE_SET: ReadonlySet<string> = new Set<string>(ARCHI_DIAGNOSTIC_CODES);

const esc = (t: string): string => t.replace(/~/g, "~0").replace(/\//g, "~1");

interface DeclaredProfile {
  readonly id: string;
  readonly relationTypes: readonly {
    readonly id: string;
    readonly roles: readonly { readonly role: string }[];
  }[];
}

function buildRoleOrderMap(profiles: readonly DeclaredProfile[]): ReadonlyMap<string, readonly [string, string]> {
  const map = new Map<string, readonly [string, string]>();
  for (const p of profiles) {
    for (const rt of p.relationTypes) {
      if (rt.roles[0]?.role && rt.roles[1]?.role) {
        map.set(`${p.id}::${rt.id}`, [rt.roles[0].role, rt.roles[1].role]);
      }
    }
  }
  return map;
}

const ROLE_ORDER_BY_PROFILE_TYPE = buildRoleOrderMap([
  ARCHI_V1.declaration as unknown as DeclaredProfile,
  GENERIC_V2.declaration as unknown as DeclaredProfile,
]);

/** proposed: stages of the atomic ingestion pipeline (§5.3). */
export type ArchiStage =
  | "source"
  | "pins"
  | "executor"
  | "document"
  | "views"
  | "fold-states"
  | "versioning"
  | "record";

/** proposed: scoped diagnostic bucket inside an ArchiRefusal (§5.5). */
export interface ArchiRefusalScope {
  readonly scope: string;
  readonly diagnostics: readonly (EngramDiagnostic | ArchiDsDiagnostic)[];
}

/** proposed: refusal envelope returned by ingestArchitecture and verifyArchiBinding (§5.5). */
export interface ArchiRefusal {
  readonly outcome: "refused";
  readonly stage: ArchiStage;
  readonly scopes: readonly ArchiRefusalScope[];
}

/** proposed: per-view binding record written to bindings/<view local>.json (§5.4). */
export interface ArchiViewBinding {
  readonly viewId: string;
  readonly activeHierarchy: ArchiActiveHierarchy;
  readonly language: ArchiLanguage;
  readonly documentPin: Pin;
  readonly viewPin: Pin;
  readonly profilePins: readonly Pin[];
  readonly semanticCategoryPins: readonly Pin[];
  readonly legendRef?: string;
  readonly viewSchemaPin: Pin;
  readonly cardsPin: Pin;
  readonly presentationContractPin: Pin;
  readonly dsCommit: string;
}

/** proposed: source provenance block in ArchiAcceptance (§5.4). */
export interface ArchiAcceptanceSource {
  readonly repository: string;
  readonly commit: string;
  readonly manifestPath: string;
}

/** proposed: file digest entry in ArchiAcceptance.files (§5.4). */
export interface ArchiAcceptanceFileEntry {
  readonly path: string;
  readonly contentDigest: string;
}

/** proposed: acceptance record written to acceptance.json (§5.4). */
export interface ArchiAcceptance {
  readonly format: "engram.archi-acceptance/1";
  readonly source: ArchiAcceptanceSource;
  readonly language: ArchiLanguage;
  readonly owningRepo: string;
  readonly documentPin: Pin;
  readonly profilePins: readonly Pin[];
  readonly cardsPin: Pin;
  readonly viewSchemaPin: Pin;
  readonly bindings: readonly Pin[];
  readonly files: readonly ArchiAcceptanceFileEntry[];
}

/** proposed: authored triple S = (manifest, document, views) (§5.6.1). */
export interface ArchiSourceTripleInput {
  readonly manifest: ArchiManifest;
  readonly document: NativeSemanticDocument;
  readonly views: readonly ArchiViewSpec[];
}

/** proposed: discriminated result of parseStrictIJson (§5.3 stage 1). */
export type ArchiIJsonParseResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly pointer: string; readonly reason: string };

function isWellFormedUnicodeString(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/**
 * Strict RFC 7493 I-JSON parser (§5.3 stage 1, §5.6):
 * - Rejects UTF-8 BOM (0xEF 0xBB 0xBF or \uFEFF) and ill-formed UTF-8 bytes
 * - Rejects lone UTF-16 surrogates (raw or \uXXXX escapes)
 * - Rejects duplicate object member names at parse time with exact RFC 6901 pointer
 * - Rejects non-finite numbers and unescaped control characters
 */
export function parseStrictIJson(input: Uint8Array | string): ArchiIJsonParseResult {
  let text: string;
  if (typeof input === "string") {
    if (input.charCodeAt(0) === 0xfeff) {
      return { ok: false, pointer: "", reason: "UTF-8 BOM (U+FEFF) is forbidden in I-JSON." };
    }
    if (!isWellFormedUnicodeString(input)) {
      return { ok: false, pointer: "", reason: "Input string contains a lone UTF-16 surrogate." };
    }
    text = input;
  } else if (input instanceof Uint8Array) {
    if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
      return { ok: false, pointer: "", reason: "UTF-8 BOM (0xEF 0xBB 0xBF) is forbidden in I-JSON." };
    }
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      text = decoder.decode(input);
    } catch {
      return { ok: false, pointer: "", reason: "Input bytes are not valid UTF-8." };
    }
    if (text.charCodeAt(0) === 0xfeff) {
      return { ok: false, pointer: "", reason: "UTF-8 BOM is forbidden in I-JSON." };
    }
  } else {
    return { ok: false, pointer: "", reason: "Input must be a string or Uint8Array." };
  }

  let pos = 0;
  const len = text.length;

  const skipWs = (): void => {
    while (pos < len) {
      const ch = text.charCodeAt(pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        pos++;
      } else {
        break;
      }
    }
  };

  const parseHex4 = (pointer: string): number => {
    if (pos + 4 > len) {
      throw { pointer, reason: "Truncated \\uXXXX escape in string." };
    }
    let val = 0;
    for (let i = 0; i < 4; i++) {
      const c = text.charCodeAt(pos++);
      val <<= 4;
      if (c >= 0x30 && c <= 0x39) val |= c - 0x30;
      else if (c >= 0x41 && c <= 0x46) val |= c - 0x41 + 10;
      else if (c >= 0x61 && c <= 0x66) val |= c - 0x61 + 10;
      else throw { pointer, reason: "Invalid hex digit in \\uXXXX escape." };
    }
    return val;
  };

  const parseString = (pointer: string): string => {
    if (text.charCodeAt(pos) !== 0x22) {
      throw { pointer, reason: "Expected '\"' to start string." };
    }
    pos++;
    let out = "";
    while (pos < len) {
      const ch = text.charCodeAt(pos++);
      if (ch === 0x22) {
        return out;
      }
      if (ch <= 0x1f) {
        throw { pointer, reason: `Unescaped control character U+${ch.toString(16).padStart(4, "0")} in string.` };
      }
      if (ch === 0x5c) {
        if (pos >= len) throw { pointer, reason: "Unterminated escape sequence in string." };
        const escCh = text.charCodeAt(pos++);
        switch (escCh) {
          case 0x22:
            out += '"';
            break;
          case 0x5c:
            out += "\\";
            break;
          case 0x2f:
            out += "/";
            break;
          case 0x62:
            out += "\b";
            break;
          case 0x66:
            out += "\f";
            break;
          case 0x6e:
            out += "\n";
            break;
          case 0x72:
            out += "\r";
            break;
          case 0x74:
            out += "\t";
            break;
          case 0x75: {
            const unit = parseHex4(pointer);
            if (unit >= 0xd800 && unit <= 0xdbff) {
              if (pos + 2 > len || text.charCodeAt(pos) !== 0x5c || text.charCodeAt(pos + 1) !== 0x75) {
                throw { pointer, reason: "Lone high surrogate escape in string (RFC 7493)." };
              }
              pos += 2;
              const low = parseHex4(pointer);
              if (low < 0xdc00 || low > 0xdfff) {
                throw { pointer, reason: "High surrogate not followed by low surrogate in string (RFC 7493)." };
              }
              out += String.fromCharCode(unit, low);
            } else if (unit >= 0xdc00 && unit <= 0xdfff) {
              throw { pointer, reason: "Lone low surrogate escape in string (RFC 7493)." };
            } else {
              out += String.fromCharCode(unit);
            }
            break;
          }
          default:
            throw { pointer, reason: `Invalid escape sequence \\${String.fromCharCode(escCh)} in string.` };
        }
      } else {
        out += String.fromCharCode(ch);
      }
    }
    throw { pointer, reason: "Unterminated string literal." };
  };

  const parseNumber = (pointer: string): number => {
    const start = pos;
    if (text.charCodeAt(pos) === 0x2d) pos++;
    if (pos >= len) throw { pointer, reason: "Truncated number literal." };
    const first = text.charCodeAt(pos);
    if (first === 0x30) {
      pos++;
    } else if (first >= 0x31 && first <= 0x39) {
      pos++;
      while (pos < len && text.charCodeAt(pos) >= 0x30 && text.charCodeAt(pos) <= 0x39) pos++;
    } else {
      throw { pointer, reason: "Invalid number literal." };
    }
    if (pos < len && text.charCodeAt(pos) === 0x2e) {
      pos++;
      if (pos >= len || text.charCodeAt(pos) < 0x30 || text.charCodeAt(pos) > 0x39) {
        throw { pointer, reason: "Invalid fractional part in number literal." };
      }
      while (pos < len && text.charCodeAt(pos) >= 0x30 && text.charCodeAt(pos) <= 0x39) pos++;
    }
    if (pos < len && (text.charCodeAt(pos) === 0x65 || text.charCodeAt(pos) === 0x45)) {
      pos++;
      if (pos < len && (text.charCodeAt(pos) === 0x2b || text.charCodeAt(pos) === 0x2d)) pos++;
      if (pos >= len || text.charCodeAt(pos) < 0x30 || text.charCodeAt(pos) > 0x39) {
        throw { pointer, reason: "Invalid exponent in number literal." };
      }
      while (pos < len && text.charCodeAt(pos) >= 0x30 && text.charCodeAt(pos) <= 0x39) pos++;
    }
    const raw = text.slice(start, pos);
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      throw { pointer, reason: `Non-finite number ${raw} is forbidden in I-JSON.` };
    }
    return num;
  };

  const parseValue = (pointer: string): unknown => {
    skipWs();
    if (pos >= len) {
      throw { pointer, reason: "Unexpected end of JSON input." };
    }
    const ch = text.charCodeAt(pos);
    if (ch === 0x7b) {
      pos++;
      skipWs();
      const obj: Record<string, unknown> = {};
      const seen = new Set<string>();
      if (pos < len && text.charCodeAt(pos) === 0x7d) {
        pos++;
        return obj;
      }
      while (true) {
        skipWs();
        if (pos >= len || text.charCodeAt(pos) !== 0x22) {
          throw { pointer, reason: "Expected string member name in object." };
        }
        const key = parseString(pointer);
        const childPointer = `${pointer}/${esc(key)}`;
        if (seen.has(key)) {
          throw { pointer: childPointer, reason: `Duplicate object member name "${key}" is forbidden in I-JSON.` };
        }
        seen.add(key);
        skipWs();
        if (pos >= len || text.charCodeAt(pos) !== 0x3a) {
          throw { pointer: childPointer, reason: "Expected ':' after object member name." };
        }
        pos++;
        const val = parseValue(childPointer);
        Object.defineProperty(obj, key, {
          value: val,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        skipWs();
        if (pos < len && text.charCodeAt(pos) === 0x2c) {
          pos++;
          continue;
        }
        if (pos < len && text.charCodeAt(pos) === 0x7d) {
          pos++;
          return obj;
        }
        throw { pointer: childPointer, reason: "Expected ',' or '}' in object." };
      }
    }
    if (ch === 0x5b) {
      pos++;
      skipWs();
      const arr: unknown[] = [];
      if (pos < len && text.charCodeAt(pos) === 0x5d) {
        pos++;
        return arr;
      }
      let idx = 0;
      while (true) {
        const childPointer = `${pointer}/${idx}`;
        arr.push(parseValue(childPointer));
        idx++;
        skipWs();
        if (pos < len && text.charCodeAt(pos) === 0x2c) {
          pos++;
          continue;
        }
        if (pos < len && text.charCodeAt(pos) === 0x5d) {
          pos++;
          return arr;
        }
        throw { pointer: childPointer, reason: "Expected ',' or ']' in array." };
      }
    }
    if (ch === 0x22) {
      return parseString(pointer);
    }
    if (ch === 0x74 && text.startsWith("true", pos)) {
      pos += 4;
      return true;
    }
    if (ch === 0x66 && text.startsWith("false", pos)) {
      pos += 5;
      return false;
    }
    if (ch === 0x6e && text.startsWith("null", pos)) {
      pos += 4;
      return null;
    }
    if (ch === 0x2d || (ch >= 0x30 && ch <= 0x39)) {
      return parseNumber(pointer);
    }
    throw { pointer, reason: `Unexpected token '${text[pos]}' in JSON.` };
  };

  try {
    const value = parseValue("");
    skipWs();
    if (pos !== len) {
      return { ok: false, pointer: "", reason: "Unexpected trailing characters after root JSON value." };
    }
    return { ok: true, value };
  } catch (err) {
    if (err && typeof err === "object" && "pointer" in err && "reason" in err) {
      return {
        ok: false,
        pointer: String((err as { pointer: unknown }).pointer),
        reason: String((err as { reason: unknown }).reason),
      };
    }
    return { ok: false, pointer: "", reason: err instanceof Error ? err.message : String(err) };
  }
}

export function makeArchiDiagnostic(
  code: ArchiDiagnosticCode,
  path: string,
  subjectRef: string,
  message: string,
  nodeId?: string,
): EngramDiagnostic {
  const normalizedPath = path === "" || path.startsWith("/") ? path : `/${path}`;
  return {
    origin: "engram",
    severity: "error",
    code,
    nativeCode: code,
    message,
    path: normalizedPath,
    ...(nodeId !== undefined ? { nodeId } : {}),
    subjectRef,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidLocalId(local: string): boolean {
  return local.length > 0 && local.length <= MAX_LOCAL_ID_LEN && LOCAL_ID_RE.test(local);
}

export function isValidPrefixedRef(value: unknown, prefix: string): value is string {
  if (typeof value !== "string" || !value.startsWith(`${prefix}:`)) return false;
  return isValidLocalId(value.slice(prefix.length + 1));
}

function isValidRepoRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\")) return false;
  const parts = value.split("/");
  if (parts.some((p) => p.length === 0 || p === "." || p === "..")) return false;
  return value.endsWith(".json");
}

function checkPinClosedShape(value: unknown, pointer: string): string | null {
  if (!isPlainRecord(value)) return pointer;
  const keys = Object.keys(value);
  for (const k of keys) {
    if (k !== "id" && k !== "version" && k !== "contentDigest") {
      return `${pointer}/${esc(k)}`;
    }
  }
  if (typeof value["id"] !== "string" || value["id"].length === 0) return `${pointer}/id`;
  if (typeof value["version"] !== "string" || value["version"].length === 0) return `${pointer}/version`;
  if (typeof value["contentDigest"] !== "string" || !DIGEST_HEX_RE.test(value["contentDigest"])) {
    return `${pointer}/contentDigest`;
  }
  return null;
}

/**
 * Recursively checks §5.6.5 string and number invariants on a parsed JSON value:
 * - Strings are well-formed Unicode, NFC normalized, and contain no control characters (U+0000–U+001F, U+007F–U+009F).
 * - Numbers are safe integers.
 */
export function checkArchiValueInvariants(
  value: unknown,
  subjectRef: string,
  pointer = "",
  nodeId?: string,
): EngramDiagnostic[] {
  const out: EngramDiagnostic[] = [];
  if (typeof value === "string") {
    if (!isWellFormedUnicodeString(value)) {
      out.push(makeArchiDiagnostic("archi-input-invalid", pointer, subjectRef, "String contains a lone surrogate.", nodeId));
    } else if (value !== value.normalize("NFC")) {
      out.push(makeArchiDiagnostic("archi-input-invalid", pointer, subjectRef, "String is not NFC-normalized (§5.6.5).", nodeId));
    } else if (hasControlChar(value)) {
      out.push(
        makeArchiDiagnostic(
          "archi-input-invalid",
          pointer,
          subjectRef,
          "String contains a forbidden control character (§5.6.5).",
          nodeId,
        ),
      );
    }
    return out;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      out.push(makeArchiDiagnostic("archi-input-invalid", pointer, subjectRef, "Numbers in the archi triple must be integers (§5.6.5).", nodeId));
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      out.push(...checkArchiValueInvariants(value[i], subjectRef, `${pointer}/${i}`, nodeId));
    }
    return out;
  }
  if (isPlainRecord(value)) {
    for (const [k, v] of Object.entries(value)) {
      const childPtr = `${pointer}/${esc(k)}`;
      out.push(...checkArchiValueInvariants(k, subjectRef, childPtr, nodeId));
      out.push(...checkArchiValueInvariants(v, subjectRef, childPtr, nodeId));
    }
  }
  return out;
}

const MANIFEST_ALLOWED_KEYS = new Set([
  "format",
  "language",
  "owningRepo",
  "document",
  "views",
  "profilePins",
  "cardsPin",
  "viewSchemaPin",
]);

/**
 * Closed shape and §5.6 checks for ArchiManifest (§5.2, §5.3 stage 1, §5.6).
 * Shape errors emit `archi-manifest-invalid`; §5.6 set/ref/string invariants emit `archi-input-invalid`.
 */
export function checkArchiManifestShape(
  value: unknown,
  subjectRef: string = ARCHI_MANIFEST_PATH,
): readonly EngramDiagnostic[] {
  if (!isPlainRecord(value)) {
    return [makeArchiDiagnostic("archi-manifest-invalid", "", subjectRef, "Manifest must be a JSON object.")];
  }
  const diagnostics: EngramDiagnostic[] = [];

  for (const k of Object.keys(value)) {
    if (!MANIFEST_ALLOWED_KEYS.has(k)) {
      diagnostics.push(
        makeArchiDiagnostic("archi-manifest-invalid", `/${esc(k)}`, subjectRef, `Unknown field "${k}" in ArchiManifest.`),
      );
    }
  }
  for (const req of MANIFEST_ALLOWED_KEYS) {
    if (!(req in value)) {
      diagnostics.push(
        makeArchiDiagnostic("archi-manifest-invalid", `/${esc(req)}`, subjectRef, `Missing required field "${req}" in ArchiManifest.`),
      );
    }
  }
  if (diagnostics.length > 0) return sortDiagnostics(diagnostics);

  if (value["format"] !== "engram.archi-manifest/1") {
    diagnostics.push(
      makeArchiDiagnostic("archi-manifest-invalid", "/format", subjectRef, 'Manifest format must be "engram.archi-manifest/1".'),
    );
  }
  if (value["language"] !== "fr" && value["language"] !== "en") {
    diagnostics.push(
      makeArchiDiagnostic("archi-manifest-invalid", "/language", subjectRef, 'Manifest language must be "fr" or "en".'),
    );
  }
  if (typeof value["owningRepo"] !== "string" || value["owningRepo"].length === 0) {
    diagnostics.push(
      makeArchiDiagnostic("archi-manifest-invalid", "/owningRepo", subjectRef, "Manifest owningRepo must be a non-empty string."),
    );
  } else if (!isValidPrefixedRef(value["owningRepo"], "entity")) {
    diagnostics.push(
      makeArchiDiagnostic(
        "archi-input-invalid",
        "/owningRepo",
        subjectRef,
        `Manifest owningRepo "${value["owningRepo"]}" must be a valid EntityRef (entity:<local>).`,
      ),
    );
  }

  if (!isValidRepoRelativePath(value["document"])) {
    diagnostics.push(
      makeArchiDiagnostic("archi-manifest-invalid", "/document", subjectRef, "Manifest document must be a valid repo-relative .json path."),
    );
  }

  if (!Array.isArray(value["views"]) || value["views"].length === 0) {
    diagnostics.push(
      makeArchiDiagnostic("archi-manifest-invalid", "/views", subjectRef, "Manifest views must be a non-empty array of paths."),
    );
  } else {
    const views = value["views"];
    let orderFailed = false;
    for (let i = 0; i < views.length; i++) {
      if (!isValidRepoRelativePath(views[i])) {
        diagnostics.push(
          makeArchiDiagnostic("archi-manifest-invalid", `/views/${i}`, subjectRef, `Manifest views[${i}] must be a valid repo-relative .json path.`),
        );
      } else if (!orderFailed && i > 0 && typeof views[i - 1] === "string" && (views[i] as string) <= (views[i - 1] as string)) {
        orderFailed = true;
        diagnostics.push(
          makeArchiDiagnostic(
            "archi-input-invalid",
            `/views/${i}`,
            subjectRef,
            "Manifest views array must be sorted ascending without duplicates (§5.6.3).",
          ),
        );
      }
    }
  }

  if (!Array.isArray(value["profilePins"]) || value["profilePins"].length === 0) {
    diagnostics.push(
      makeArchiDiagnostic("archi-manifest-invalid", "/profilePins", subjectRef, "Manifest profilePins must be a non-empty array of Pins."),
    );
  } else {
    for (let i = 0; i < value["profilePins"].length; i++) {
      const bad = checkPinClosedShape(value["profilePins"][i], `/profilePins/${i}`);
      if (bad !== null) {
        diagnostics.push(makeArchiDiagnostic("archi-manifest-invalid", bad, subjectRef, `Invalid Pin in profilePins[${i}].`));
      }
    }
  }

  const badCardsPin = checkPinClosedShape(value["cardsPin"], "/cardsPin");
  if (badCardsPin !== null) {
    diagnostics.push(makeArchiDiagnostic("archi-manifest-invalid", badCardsPin, subjectRef, "Invalid cardsPin in ArchiManifest."));
  }

  const badViewSchemaPin = checkPinClosedShape(value["viewSchemaPin"], "/viewSchemaPin");
  if (badViewSchemaPin !== null) {
    diagnostics.push(makeArchiDiagnostic("archi-manifest-invalid", badViewSchemaPin, subjectRef, "Invalid viewSchemaPin in ArchiManifest."));
  }

  diagnostics.push(...checkArchiValueInvariants(value, subjectRef, ""));
  return sortDiagnostics(diagnostics);
}

const VIEW_SPEC_ALLOWED_KEYS = new Set([
  "format",
  "viewId",
  "activeHierarchy",
  "draw",
  "collapsed",
  "legend",
]);
const LEGEND_ALLOWED_KEYS = new Set(["legendRef", "title", "order", "tokens"]);
const LEGEND_TOKEN_ALLOWED_KEYS = new Set(["category", "token"]);

/**
 * Closed shape and §5.6 checks for ArchiViewSpec (§5.2, §5.3 stage 1, §5.6).
 */
export function checkArchiViewSpecShape(
  value: unknown,
  fallbackSubjectRef = "view",
): readonly EngramDiagnostic[] {
  if (!isPlainRecord(value)) {
    return [makeArchiDiagnostic("archi-input-invalid", "", fallbackSubjectRef, "ArchiViewSpec must be a JSON object.")];
  }
  const subjectRef =
    typeof value["viewId"] === "string" && value["viewId"].length > 0 ? value["viewId"] : fallbackSubjectRef;
  const diagnostics: EngramDiagnostic[] = [];

  for (const k of Object.keys(value)) {
    if (!VIEW_SPEC_ALLOWED_KEYS.has(k)) {
      diagnostics.push(
        makeArchiDiagnostic("archi-input-invalid", `/${esc(k)}`, subjectRef, `Unknown field "${k}" in ArchiViewSpec.`),
      );
    }
  }
  for (const req of ["format", "viewId", "activeHierarchy", "draw", "collapsed"]) {
    if (!(req in value)) {
      diagnostics.push(
        makeArchiDiagnostic("archi-input-invalid", `/${esc(req)}`, subjectRef, `Missing required field "${req}" in ArchiViewSpec.`),
      );
    }
  }
  if (diagnostics.length > 0) return sortDiagnostics(diagnostics);

  if (value["format"] !== "engram.archi-view/1") {
    diagnostics.push(
      makeArchiDiagnostic("archi-input-invalid", "/format", subjectRef, 'ArchiViewSpec format must be "engram.archi-view/1".'),
    );
  }
  if (!isValidPrefixedRef(value["viewId"], "view")) {
    diagnostics.push(
      makeArchiDiagnostic("archi-input-invalid", "/viewId", subjectRef, 'ArchiViewSpec viewId must match "view:<local>" (§5.2, §5.6.2).'),
    );
  }
  if (typeof value["activeHierarchy"] !== "string" || !ACTIVE_HIERARCHIES.has(value["activeHierarchy"])) {
    diagnostics.push(
      makeArchiDiagnostic("archi-input-invalid", "/activeHierarchy", subjectRef, "Invalid activeHierarchy in ArchiViewSpec."),
    );
  }

  for (const field of ["draw", "collapsed"] as const) {
    const arr = value[field];
    if (!Array.isArray(arr)) {
      diagnostics.push(makeArchiDiagnostic("archi-input-invalid", `/${field}`, subjectRef, `ArchiViewSpec ${field} must be an array.`));
      continue;
    }
    let fieldOrderFailed = false;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!isValidPrefixedRef(item, "entity")) {
        diagnostics.push(
          makeArchiDiagnostic(
            "archi-input-invalid",
            `/${field}/${i}`,
            subjectRef,
            `ArchiViewSpec ${field}[${i}] must be a valid EntityRef "entity:<local>" (§5.2, §5.6.2).`,
          ),
        );
      } else if (!fieldOrderFailed && i > 0 && typeof arr[i - 1] === "string" && item <= (arr[i - 1] as string)) {
        fieldOrderFailed = true;
        diagnostics.push(
          makeArchiDiagnostic(
            "archi-input-invalid",
            `/${field}/${i}`,
            item,
            `ArchiViewSpec ${field} must be sorted ascending without duplicates (§5.6.3).`,
            item,
          ),
        );
      }
    }
  }

  if ("legend" in value) {
    const lg = value["legend"];
    if (!isPlainRecord(lg)) {
      diagnostics.push(makeArchiDiagnostic("archi-input-invalid", "/legend", subjectRef, "ArchiViewSpec legend must be an object."));
    } else {
      for (const k of Object.keys(lg)) {
        if (!LEGEND_ALLOWED_KEYS.has(k)) {
          diagnostics.push(
            makeArchiDiagnostic("archi-input-invalid", `/legend/${esc(k)}`, subjectRef, `Unknown field "${k}" in ArchiViewSpec.legend.`),
          );
        }
      }
      if (!isValidPrefixedRef(lg["legendRef"], "entity")) {
        diagnostics.push(
          makeArchiDiagnostic("archi-input-invalid", "/legend/legendRef", subjectRef, "legend.legendRef must be a valid EntityRef."),
        );
      }
      if ("title" in lg && (typeof lg["title"] !== "string" || lg["title"].length === 0)) {
        diagnostics.push(
          makeArchiDiagnostic("archi-input-invalid", "/legend/title", subjectRef, "legend.title must be a non-empty string when present."),
        );
      }
      if (!Array.isArray(lg["order"])) {
        diagnostics.push(makeArchiDiagnostic("archi-input-invalid", "/legend/order", subjectRef, "legend.order must be an array."));
      } else {
        const seenOrder = new Set<string>();
        for (let i = 0; i < lg["order"].length; i++) {
          const item = lg["order"][i];
          if (!isValidPrefixedRef(item, "entity")) {
            diagnostics.push(
              makeArchiDiagnostic("archi-input-invalid", `/legend/order/${i}`, subjectRef, "legend.order entry must be a valid EntityRef."),
            );
          } else if (seenOrder.has(item)) {
            diagnostics.push(
              makeArchiDiagnostic("archi-input-invalid", `/legend/order/${i}`, item, "Duplicate entry in legend.order.", item),
            );
          } else {
            seenOrder.add(item);
          }
        }
      }
      if (!Array.isArray(lg["tokens"])) {
        diagnostics.push(makeArchiDiagnostic("archi-input-invalid", "/legend/tokens", subjectRef, "legend.tokens must be an array."));
      } else {
        let tokenOrderFailed = false;
        for (let i = 0; i < lg["tokens"].length; i++) {
          const row = lg["tokens"][i];
          if (!isPlainRecord(row)) {
            diagnostics.push(makeArchiDiagnostic("archi-input-invalid", `/legend/tokens/${i}`, subjectRef, "legend.tokens entry must be an object."));
            continue;
          }
          for (const k of Object.keys(row)) {
            if (!LEGEND_TOKEN_ALLOWED_KEYS.has(k)) {
              diagnostics.push(
                makeArchiDiagnostic("archi-input-invalid", `/legend/tokens/${i}/${esc(k)}`, subjectRef, `Unknown field "${k}" in legend.tokens[${i}].`),
              );
            }
          }
          if (typeof row["category"] !== "string" || row["category"].length === 0) {
            diagnostics.push(
              makeArchiDiagnostic("archi-input-invalid", `/legend/tokens/${i}/category`, subjectRef, "legend.tokens category must be a non-empty string."),
            );
          } else if (
            !tokenOrderFailed &&
            i > 0 &&
            isPlainRecord(lg["tokens"][i - 1]) &&
            typeof (lg["tokens"][i - 1] as Record<string, unknown>)["category"] === "string" &&
            row["category"] <= ((lg["tokens"][i - 1] as Record<string, unknown>)["category"] as string)
          ) {
            tokenOrderFailed = true;
            diagnostics.push(
              makeArchiDiagnostic(
                "archi-input-invalid",
                `/legend/tokens/${i}`,
                subjectRef,
                "legend.tokens must be sorted ascending by category without duplicates (§5.6.3).",
              ),
            );
          }
          if (typeof row["token"] !== "string" || row["token"].length === 0) {
            diagnostics.push(
              makeArchiDiagnostic("archi-input-invalid", `/legend/tokens/${i}/token`, subjectRef, "legend.tokens token must be a non-empty string."),
            );
          }
        }
      }
    }
  }

  diagnostics.push(...checkArchiValueInvariants(value, subjectRef, ""));
  return sortDiagnostics(diagnostics);
}

export function dottedPathToPointer(dotted: string): string {
  if (dotted === "") return "";
  if (dotted.startsWith("/")) return dotted;
  return `/${dotted.split(".").map(esc).join("/")}`;
}

/**
 * Closed shape (`checkSemanticShape`) and §5.6 canonical checks on a SemanticDocument (§5.3 stage 1, §5.6).
 */
export function checkArchiDocumentInvariants(
  document: unknown,
  fallbackSubjectRef = "document",
): readonly EngramDiagnostic[] {
  const docId =
    isPlainRecord(document) && typeof document["documentId"] === "string" && document["documentId"].length > 0
      ? document["documentId"]
      : fallbackSubjectRef;
  const shapeErr = checkSemanticShape(document);
  if (shapeErr !== null) {
    return [
      makeArchiDiagnostic(
        "archi-input-invalid",
        dottedPathToPointer(shapeErr),
        docId,
        `Invalid semantic document shape at ${shapeErr || "<root>"}.`,
      ),
    ];
  }
  const doc = document as NativeSemanticDocument;
  const diagnostics: EngramDiagnostic[] = [];

  if (!isValidPrefixedRef(doc.documentId, "document")) {
    diagnostics.push(
      makeArchiDiagnostic("archi-input-invalid", "/documentId", docId, 'documentId must match "document:<local>" (§5.6.2).'),
    );
  }

  for (const [entKey, ent] of Object.entries(doc.entities)) {
    const ptr = `/entities/${esc(entKey)}`;
    if (!isValidPrefixedRef(entKey, "entity") || !isValidPrefixedRef(ent.id, "entity")) {
      diagnostics.push(
        makeArchiDiagnostic(
          "archi-input-invalid",
          `${ptr}/id`,
          ent.id || entKey,
          `Entity id "${ent.id || entKey}" must match "entity:<local>" with local id ^[a-z][a-z0-9-]*$ (<= 40 chars; §5.6.2).`,
          ent.id || entKey,
        ),
      );
    }
    diagnostics.push(...checkArchiValueInvariants(ent, ent.id || entKey, ptr, ent.id || entKey));
  }

  for (const [relKey, rel] of Object.entries(doc.relations)) {
    const ptr = `/relations/${esc(relKey)}`;
    if (!isValidPrefixedRef(relKey, "relation") || !isValidPrefixedRef(rel.id, "relation")) {
      diagnostics.push(
        makeArchiDiagnostic(
          "archi-input-invalid",
          `${ptr}/id`,
          rel.id || relKey,
          `Relation id "${rel.id || relKey}" must match "relation:<local>" with local id ^[a-z][a-z0-9-]*$ (<= 40 chars; §5.6.2).`,
          rel.id || relKey,
        ),
      );
    }
    for (let i = 0; i < rel.endpoints.length; i++) {
      const ep = rel.endpoints[i]!;
      if (!isValidPrefixedRef(ep.target, "entity")) {
        diagnostics.push(
          makeArchiDiagnostic(
            "archi-input-invalid",
            `${ptr}/endpoints/${i}/target`,
            rel.id,
            `Relation ${rel.id} endpoint[${i}].target "${ep.target}" must be a valid EntityRef.`,
            rel.id,
          ),
        );
      }
    }
    const expectedRoles = ROLE_ORDER_BY_PROFILE_TYPE.get(`${rel.profile}::${rel.type}`);
    if (
      expectedRoles &&
      rel.endpoints.length === 2 &&
      (rel.endpoints[0]?.role !== expectedRoles[0] || rel.endpoints[1]?.role !== expectedRoles[1])
    ) {
      diagnostics.push(
        makeArchiDiagnostic(
          "archi-input-invalid",
          `${ptr}/endpoints`,
          rel.id,
          `Relation ${rel.id} endpoints must follow declared role order [${expectedRoles[0]}, ${expectedRoles[1]}] (§5.6.3).`,
          rel.id,
        ),
      );
    }
    diagnostics.push(...checkArchiValueInvariants(rel, rel.id || relKey, ptr, rel.id || relKey));
  }

  return sortDiagnostics(diagnostics);
}

/**
 * Stage 1 cross-checks across the authored triple (manifest, document, views):
 * - owningRepo resolves in document.entities to an archi@1 repo
 * - every draw[] entry resolves in document.entities to an archi@1 entity
 * - every collapsed[] entry is in draw[] and resolves to an archi@1 container
 */
export function checkArchiStage1CrossRefs(
  manifest: ArchiManifest,
  document: NativeSemanticDocument,
  views: readonly ArchiViewSpec[],
): {
  readonly manifestDiagnostics: readonly EngramDiagnostic[];
  readonly viewDiagnostics: ReadonlyMap<string, readonly EngramDiagnostic[]>;
} {
  const manifestDiags: EngramDiagnostic[] = [];
  const owning = document.entities[manifest.owningRepo];
  if (!owning || owning.profile !== "archi@1" || owning.type !== "repo") {
    manifestDiags.push(
      makeArchiDiagnostic(
        "archi-input-invalid",
        "/owningRepo",
        manifest.owningRepo,
        `Manifest owningRepo "${manifest.owningRepo}" does not resolve to an archi@1 repo entity in document.`,
        manifest.owningRepo,
      ),
    );
  }

  const viewDiags = new Map<string, readonly EngramDiagnostic[]>();
  const seenViewIds = new Set<string>();
  for (const spec of views) {
    const diags: EngramDiagnostic[] = [];
    if (seenViewIds.has(spec.viewId)) {
      diags.push(
        makeArchiDiagnostic(
          "archi-input-invalid",
          "/viewId",
          spec.viewId,
          `Duplicate viewId "${spec.viewId}" in manifest views.`,
        ),
      );
    }
    seenViewIds.add(spec.viewId);

    const drawSet = new Set<string>(spec.draw);
    for (let i = 0; i < spec.draw.length; i++) {
      const entityId = spec.draw[i]!;
      const ent = document.entities[entityId];
      if (!ent || ent.profile !== "archi@1") {
        diags.push(
          makeArchiDiagnostic(
            "archi-input-invalid",
            `/draw/${i}`,
            entityId,
            `View ${spec.viewId} draw[${i}] ("${entityId}") does not resolve to an archi@1 entity in document.`,
            entityId,
          ),
        );
      }
    }
    for (let i = 0; i < spec.collapsed.length; i++) {
      const entityId = spec.collapsed[i]!;
      const ent = document.entities[entityId];
      if (!drawSet.has(entityId) || !ent || ent.profile !== "archi@1" || !ARCHI_CONTAINER_KINDS.has(ent.type)) {
        diags.push(
          makeArchiDiagnostic(
            "archi-input-invalid",
            `/collapsed/${i}`,
            entityId,
            `View ${spec.viewId} collapsed[${i}] ("${entityId}") must be a drawn container in that view.`,
            entityId,
          ),
        );
      }
    }
    if (diags.length > 0) {
      viewDiags.set(spec.viewId, sortDiagnostics(diags));
    }
  }

  return {
    manifestDiagnostics: sortDiagnostics(manifestDiags),
    viewDiagnostics: viewDiags,
  };
}

/**
 * Validates the complete authored triple S = (manifest, document, views) against §5.2 and §5.6.
 */
export function checkArchiSourceTriple(triple: ArchiSourceTripleInput): readonly EngramDiagnostic[] {
  const out: EngramDiagnostic[] = [];
  out.push(...checkArchiManifestShape(triple.manifest, ARCHI_MANIFEST_PATH));
  out.push(...checkArchiDocumentInvariants(triple.document, triple.document?.documentId ?? "document"));
  for (const v of triple.views) {
    out.push(...checkArchiViewSpecShape(v, v?.viewId ?? "view"));
  }
  if (out.length === 0) {
    const cross = checkArchiStage1CrossRefs(triple.manifest, triple.document, triple.views);
    out.push(...cross.manifestDiagnostics);
    for (const vd of cross.viewDiagnostics.values()) {
      out.push(...vd);
    }
  }
  return sortDiagnostics(out);
}

const VIEW_BINDING_ALLOWED_KEYS = new Set([
  "viewId",
  "activeHierarchy",
  "language",
  "documentPin",
  "viewPin",
  "profilePins",
  "semanticCategoryPins",
  "legendRef",
  "viewSchemaPin",
  "cardsPin",
  "presentationContractPin",
  "dsCommit",
]);

/**
 * Hand-written closed shape guard for ArchiViewBinding (§5.4). Returns null when valid, or the offending RFC 6901 pointer.
 */
export function checkArchiViewBindingShape(value: unknown): string | null {
  if (!isPlainRecord(value)) return "";
  for (const k of Object.keys(value)) {
    if (!VIEW_BINDING_ALLOWED_KEYS.has(k)) return `/${esc(k)}`;
  }
  for (const req of VIEW_BINDING_ALLOWED_KEYS) {
    if (req === "legendRef") continue;
    if (!(req in value)) return `/${esc(req)}`;
  }
  if (!isValidPrefixedRef(value["viewId"], "view")) return "/viewId";
  if (typeof value["activeHierarchy"] !== "string" || !ACTIVE_HIERARCHIES.has(value["activeHierarchy"])) {
    return "/activeHierarchy";
  }
  if (value["language"] !== "fr" && value["language"] !== "en") return "/language";
  const dPin = checkPinClosedShape(value["documentPin"], "/documentPin");
  if (dPin !== null) return dPin;
  const vPin = checkPinClosedShape(value["viewPin"], "/viewPin");
  if (vPin !== null) return vPin;
  if (!Array.isArray(value["profilePins"]) || value["profilePins"].length === 0) return "/profilePins";
  for (let i = 0; i < value["profilePins"].length; i++) {
    const pErr = checkPinClosedShape(value["profilePins"][i], `/profilePins/${i}`);
    if (pErr !== null) return pErr;
  }
  if (!Array.isArray(value["semanticCategoryPins"])) return "/semanticCategoryPins";
  for (let i = 0; i < value["semanticCategoryPins"].length; i++) {
    const pErr = checkPinClosedShape(value["semanticCategoryPins"][i], `/semanticCategoryPins/${i}`);
    if (pErr !== null) return pErr;
  }
  if ("legendRef" in value && !isValidPrefixedRef(value["legendRef"], "entity")) return "/legendRef";
  const vsPin = checkPinClosedShape(value["viewSchemaPin"], "/viewSchemaPin");
  if (vsPin !== null) return vsPin;
  const cPin = checkPinClosedShape(value["cardsPin"], "/cardsPin");
  if (cPin !== null) return cPin;
  const pcPin = checkPinClosedShape(value["presentationContractPin"], "/presentationContractPin");
  if (pcPin !== null) return pcPin;
  if (typeof value["dsCommit"] !== "string" || !COMMIT_HEX_RE.test(value["dsCommit"])) return "/dsCommit";
  return null;
}

const ACCEPTANCE_ALLOWED_KEYS = new Set([
  "format",
  "source",
  "language",
  "owningRepo",
  "documentPin",
  "profilePins",
  "cardsPin",
  "viewSchemaPin",
  "bindings",
  "files",
]);
const ACCEPTANCE_SOURCE_KEYS = new Set(["repository", "commit", "manifestPath"]);
const ACCEPTANCE_FILE_KEYS = new Set(["path", "contentDigest"]);

/**
 * Hand-written closed shape guard for ArchiAcceptance (`engram.archi-acceptance/1`, §5.4).
 * Returns null when valid, or the offending RFC 6901 pointer.
 */
export function checkArchiAcceptanceShape(value: unknown): string | null {
  if (!isPlainRecord(value)) return "";
  for (const k of Object.keys(value)) {
    if (!ACCEPTANCE_ALLOWED_KEYS.has(k)) return `/${esc(k)}`;
  }
  for (const req of ACCEPTANCE_ALLOWED_KEYS) {
    if (!(req in value)) return `/${esc(req)}`;
  }
  if (value["format"] !== "engram.archi-acceptance/1") return "/format";
  if (!isPlainRecord(value["source"])) return "/source";
  for (const k of Object.keys(value["source"])) {
    if (!ACCEPTANCE_SOURCE_KEYS.has(k)) return `/source/${esc(k)}`;
  }
  if (typeof value["source"]["repository"] !== "string" || value["source"]["repository"].length === 0) {
    return "/source/repository";
  }
  if (typeof value["source"]["commit"] !== "string" || !COMMIT_HEX_RE.test(value["source"]["commit"])) {
    return "/source/commit";
  }
  if (value["source"]["manifestPath"] !== ARCHI_MANIFEST_PATH) return "/source/manifestPath";
  if (value["language"] !== "fr" && value["language"] !== "en") return "/language";
  if (!isValidPrefixedRef(value["owningRepo"], "entity")) return "/owningRepo";
  const dPin = checkPinClosedShape(value["documentPin"], "/documentPin");
  if (dPin !== null) return dPin;
  if (!Array.isArray(value["profilePins"]) || value["profilePins"].length === 0) return "/profilePins";
  for (let i = 0; i < value["profilePins"].length; i++) {
    const pErr = checkPinClosedShape(value["profilePins"][i], `/profilePins/${i}`);
    if (pErr !== null) return pErr;
  }
  const cPin = checkPinClosedShape(value["cardsPin"], "/cardsPin");
  if (cPin !== null) return cPin;
  const vsPin = checkPinClosedShape(value["viewSchemaPin"], "/viewSchemaPin");
  if (vsPin !== null) return vsPin;
  if (!Array.isArray(value["bindings"]) || value["bindings"].length === 0) return "/bindings";
  for (let i = 0; i < value["bindings"].length; i++) {
    const bErr = checkPinClosedShape(value["bindings"][i], `/bindings/${i}`);
    if (bErr !== null) return bErr;
    const bId = (value["bindings"][i] as Pin).id;
    if (!isValidPrefixedRef(bId, "binding")) return `/bindings/${i}/id`;
    if (i > 0 && bId <= (value["bindings"][i - 1] as Pin).id) return `/bindings/${i}/id`;
  }
  if (!Array.isArray(value["files"]) || value["files"].length === 0) return "/files";
  for (let i = 0; i < value["files"].length; i++) {
    const f = value["files"][i];
    if (!isPlainRecord(f)) return `/files/${i}`;
    for (const k of Object.keys(f)) {
      if (!ACCEPTANCE_FILE_KEYS.has(k)) return `/files/${i}/${esc(k)}`;
    }
    if (typeof f["path"] !== "string" || !isValidRepoRelativePath(f["path"])) return `/files/${i}/path`;
    if (typeof f["contentDigest"] !== "string" || !DIGEST_HEX_RE.test(f["contentDigest"])) {
      return `/files/${i}/contentDigest`;
    }
    if (i > 0 && f["path"] <= ((value["files"][i - 1] as Record<string, unknown>)["path"] as string)) {
      return `/files/${i}/path`;
    }
  }
  return null;
}

/**
 * Converts a native DS diagnostic into the ArchiDsDiagnostic envelope arm (§5.5):
 * keeps all S-DSDIAG fields verbatim, plus origin: "diagram-core", nativeCode = code,
 * and subjectRef = refs[0] when present, else path.
 */
export function toArchiDsDiagnostic(raw: {
  readonly code: string;
  readonly severity: DsDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
  readonly refs?: readonly string[];
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}): ArchiDsDiagnostic {
  const subjectRef =
    Array.isArray(raw.refs) && typeof raw.refs[0] === "string" && raw.refs[0].length > 0
      ? raw.refs[0]
      : raw.path;
  return {
    origin: "diagram-core",
    code: raw.code,
    nativeCode: raw.code,
    severity: raw.severity,
    path: raw.path,
    message: raw.message,
    ...(raw.refs !== undefined ? { refs: raw.refs } : {}),
    ...(raw.details !== undefined ? { details: raw.details } : {}),
    subjectRef,
  };
}

const ENGRAM_ALLOWED_KEYS = new Set([
  "origin",
  "severity",
  "code",
  "nativeCode",
  "message",
  "path",
  "nodeId",
  "subjectRef",
]);
const DS_ALLOWED_KEYS = new Set([
  "origin",
  "code",
  "nativeCode",
  "severity",
  "path",
  "message",
  "refs",
  "details",
  "subjectRef",
  "studyDisposition",
]);

/**
 * Asserts that a diagnostic strictly conforms to the §5.5 envelope (`EngramDiagnostic` or `ArchiDsDiagnostic`, E1).
 */
export function assertValidArchiDiagnosticEnvelope(
  diag: unknown,
): asserts diag is EngramDiagnostic | ArchiDsDiagnostic {
  if (!isPlainRecord(diag)) {
    throw new Error("Diagnostic envelope must be an object.");
  }
  if (diag["origin"] === "engram") {
    for (const k of Object.keys(diag)) {
      if (!ENGRAM_ALLOWED_KEYS.has(k)) {
        throw new Error(`Forbidden key "${k}" on EngramDiagnostic envelope (§5.5).`);
      }
    }
    if (diag["severity"] !== "error") {
      throw new Error(`EngramDiagnostic severity must be "error", got "${String(diag["severity"])}".`);
    }
    if (typeof diag["code"] !== "string" || !ARCHI_CODE_SET.has(diag["code"])) {
      throw new Error(`EngramDiagnostic code "${String(diag["code"])}" is not in ARCHI_DIAGNOSTIC_CODES.`);
    }
    if (diag["nativeCode"] !== diag["code"]) {
      throw new Error("EngramDiagnostic nativeCode must equal code.");
    }
    if (typeof diag["message"] !== "string" || diag["message"].length === 0) {
      throw new Error("EngramDiagnostic message must be a non-empty string.");
    }
    if (typeof diag["path"] !== "string" || !validPointer(diag["path"])) {
      throw new Error(`EngramDiagnostic path "${String(diag["path"])}" is not a valid RFC 6901 pointer.`);
    }
    if ("nodeId" in diag && (typeof diag["nodeId"] !== "string" || diag["nodeId"].length === 0)) {
      throw new Error("EngramDiagnostic nodeId must be a non-empty string when present.");
    }
    if (typeof diag["subjectRef"] !== "string" || diag["subjectRef"].length === 0) {
      throw new Error("EngramDiagnostic subjectRef must be a non-empty string.");
    }
    return;
  }
  if (diag["origin"] === "diagram-core") {
    for (const k of Object.keys(diag)) {
      if (!DS_ALLOWED_KEYS.has(k)) {
        throw new Error(`Forbidden key "${k}" on ArchiDsDiagnostic envelope (§5.5).`);
      }
    }
    if (diag["severity"] !== "error" && diag["severity"] !== "warning") {
      throw new Error(`ArchiDsDiagnostic severity must be "error" or "warning".`);
    }
    if (typeof diag["code"] !== "string" || diag["code"].length === 0) {
      throw new Error("ArchiDsDiagnostic code must be a non-empty string.");
    }
    if (diag["nativeCode"] !== diag["code"]) {
      throw new Error("ArchiDsDiagnostic nativeCode must equal code.");
    }
    if (typeof diag["path"] !== "string") {
      throw new Error("ArchiDsDiagnostic path must be a string.");
    }
    if (typeof diag["message"] !== "string" || diag["message"].length === 0) {
      throw new Error("ArchiDsDiagnostic message must be a non-empty string.");
    }
    if (typeof diag["subjectRef"] !== "string" || diag["subjectRef"].length === 0) {
      throw new Error("ArchiDsDiagnostic subjectRef must be a non-empty string.");
    }
    return;
  }
  throw new Error(`Invalid diagnostic origin "${String(diag["origin"])}" (expected "engram" or "diagram-core").`);
}
