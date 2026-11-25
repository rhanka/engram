import type { JsonValue } from "../json-value.js";
import type { LineageId, Sha256Digest } from "../metamodel-contracts.js";
import { isExactVersion, pinProblem } from "../ontology-guardian/admission.js";
import type { Pin } from "../ontology-guardian/types.js";
import { hashOntologyPresentation } from "../ontology-profile.js";
import { isRecord } from "../profile-validate.js";
import type { NormalizedOntologyProfile } from "../types.js";
import {
  createMetamodelDiagnostic,
  type MetamodelDiagnostic,
  type MetamodelDiagnosticCode,
} from "./diagnostics.js";

export const SUPPORTED_METAMODEL_VERSION = "engram.metamodel/v1" as const;
export const VALID_LINEAGES: ReadonlySet<string> = new Set<LineageId>(["archi", "h2a", "track", "engram"]);
export const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
export const TEMPLATE_ID_RE = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
export const IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const ID_PREFIX_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const SEMVER_V1_RE =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$/;
export const RANK_KEY_RE = /^(0|[1-9][0-9]*)$/;
export const MAX_REGEX_PATTERN_LENGTH = 256;
const MAX_FINITE_REGEX_REPEAT = 1024;

export const VALID_AUTHORITIES = new Set([
  "author",
  "track-control",
  "third-party-reviewer",
  "h2a-mandate",
  "mandated-act",
  "own-act-human",
]);

export const VALID_ADMISSION_MODES = new Set([
  "bounded-auto",
  "promotion-third-party-review",
  "mandate-gated",
  "mandated-act",
  "own-act-human",
]);

export const VALID_ACCEPTANCE_AUTHORITIES = new Set(["own-act-human", "mandated-act", "third-party-reviewer"]);

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
}

export interface ValidationSink {
  readonly diagnostics: MetamodelDiagnostic[];
  lineage: LineageId | null;
  subject: string;
}

export function addError(
  sink: ValidationSink,
  code: MetamodelDiagnosticCode,
  path: string,
  message: string,
  subject?: string,
): void {
  sink.diagnostics.push(
    createMetamodelDiagnostic({
      code,
      severity: "error",
      path,
      lineage: sink.lineage,
      subject: subject ?? sink.subject,
      message,
    }),
  );
}

/** Rejects every key outside `allowedKeys` via `Object.entries` iteration (Rule 2 closed-schema guard). */
export function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  code: MetamodelDiagnosticCode,
  path: string,
  label: string,
  sink: ValidationSink,
): boolean {
  let hasUnknown = false;
  for (const [key] of Object.entries(obj)) {
    if (!allowedKeys.has(key)) {
      addError(sink, code, `${path}.${key}`, `Unknown ${label} key ${key}`);
      hasUnknown = true;
    }
  }
  return hasUnknown;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

export function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function exactStringTuple(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return expected.every((item, index) => value[index] === item);
}

export function isExactSemVer(value: unknown): value is string {
  return isExactVersion(value) && SEMVER_V1_RE.test(value);
}

export function parseSemVer(version: string): ParsedSemVer | null {
  if (!isExactSemVer(version)) return null;
  const withoutBuild = version.split("+", 1)[0]!;
  const dashIdx = withoutBuild.indexOf("-");
  const core = dashIdx >= 0 ? withoutBuild.slice(0, dashIdx) : withoutBuild;
  const prerelease = dashIdx >= 0 ? withoutBuild.slice(dashIdx + 1) : null;
  const [majorStr, minorStr, patchStr] = core.split(".");
  return {
    major: Number(majorStr),
    minor: Number(minorStr),
    patch: Number(patchStr),
    prerelease,
  };
}

export function compareSemVer(a: ParsedSemVer, b: ParsedSemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

export function isSha256Digest(value: unknown): value is Sha256Digest {
  return typeof value === "string" && SHA256_DIGEST_RE.test(value);
}

/** Thin adapter reusing `pinProblem` from `src/ontology-guardian/admission.ts`. */
export function isValidPinShape(value: unknown, what = "template"): value is Pin {
  return pinProblem(value as Pin, what) === null;
}

/** Thin adapter reusing `hashOntologyPresentation` from `src/ontology-profile.ts`. */
export function computePresentationDigest(doc: Record<string, JsonValue>): Sha256Digest {
  const rawNodeTypes = isRecord(doc.node_types) ? doc.node_types : {};
  const nodeTypes = Object.fromEntries(
    Object.entries(rawNodeTypes).map(([id, node]) => [
      id,
      { visual_encoding: isRecord(node) && node.visual_encoding !== undefined ? node.visual_encoding : undefined },
    ]),
  );
  return hashOntologyPresentation({
    node_types: nodeTypes,
    presentation: doc.presentation,
  } as unknown as NormalizedOntologyProfile);
}

export function registryKey(lineage: string, templateId: string, templateVersion: string): string {
  return `${lineage}\0${templateId}\0${templateVersion}`;
}

export function streamKey(lineage: string, templateId: string): string {
  return `${lineage}\0${templateId}`;
}

const MAX_UNICODE_CP = 0x10ffff;
type CodePointRange = readonly [number, number];
type CodePointSet = readonly CodePointRange[];

const EMPTY_CP_SET: CodePointSet = [];
const ALL_CP_SET: CodePointSet = [[0, MAX_UNICODE_CP]];
const DIGIT_CP_SET: CodePointSet = [[0x30, 0x39]];
const WORD_CP_SET: CodePointSet = [
  [0x30, 0x39],
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
];
const WS_CP_SET: CodePointSet = [
  [0x09, 0x0d],
  [0x20, 0x20],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];
const DOT_CP_SET: CodePointSet = [
  [0x00, 0x09],
  [0x0b, 0x0c],
  [0x0e, 0x2027],
  [0x202a, MAX_UNICODE_CP],
];

const UNICODE_SYNTAX_ESCAPES = new Set("^$\\.*+?()[]{}|/");
const UNICODE_CONTROL_ESCAPES: Readonly<Record<string, number>> = {
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
};
const ASCII_LETTER_RE = /^[A-Za-z]$/;
const HEX2_RE = /^[0-9a-fA-F]{2}$/;
const HEX4_RE = /^[0-9a-fA-F]{4}$/;
const HEX_BRACE_RE = /^\{([0-9a-fA-F]+)\}/;

type RegexAstNode =
  | { readonly kind: "empty" }
  | { readonly kind: "anchor" }
  | {
      readonly kind: "atom";
      readonly first: CodePointSet;
      readonly backreference?: boolean;
      readonly unsupported?: boolean;
    }
  | { readonly kind: "seq"; readonly parts: readonly RegexAstNode[] }
  | { readonly kind: "alt"; readonly branches: readonly RegexAstNode[] }
  | {
      readonly kind: "group";
      readonly body: RegexAstNode;
      readonly lookaround: boolean;
      readonly unsupported?: boolean;
    }
  | { readonly kind: "quant"; readonly body: RegexAstNode; readonly min: number; readonly max: number };

interface RegexAnalysis {
  readonly unsafe: boolean;
  readonly nullable: boolean;
  readonly consumesChar: boolean;
  readonly hasQuantifier: boolean;
  readonly hasAmbiguousAlt: boolean;
  readonly hasLookaround: boolean;
  readonly first: CodePointSet;
  readonly leadingVarAtoms: readonly CodePointSet[];
  readonly trailingVarAtoms: readonly CodePointSet[];
}

function overlapCp(a: CodePointSet, b: CodePointSet): boolean {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const [aLo, aHi] = a[i]!;
    const [bLo, bHi] = b[j]!;
    if (aLo <= bHi && bLo <= aHi) return true;
    if (aHi < bHi) i += 1;
    else j += 1;
  }
  return false;
}

function unionCp(a: CodePointSet, b: CodePointSet): CodePointSet {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const merged: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const next = j >= b.length || (i < a.length && a[i]![0] <= b[j]![0]) ? a[i++]! : b[j++]!;
    const prev = merged[merged.length - 1];
    if (prev && next[0] <= prev[1] + 1) {
      if (next[1] > prev[1]) prev[1] = next[1];
    } else {
      merged.push([next[0], next[1]]);
    }
  }
  return merged;
}

function complementCp(a: CodePointSet): CodePointSet {
  if (a.length === 0) return ALL_CP_SET;
  const out: Array<[number, number]> = [];
  let cursor = 0;
  for (const [lo, hi] of a) {
    if (lo > cursor) out.push([cursor, lo - 1]);
    cursor = hi + 1;
  }
  if (cursor <= MAX_UNICODE_CP) out.push([cursor, MAX_UNICODE_CP]);
  return out;
}

const NON_DIGIT_CP_SET: CodePointSet = complementCp(DIGIT_CP_SET);
const NON_WORD_CP_SET: CodePointSet = complementCp(WORD_CP_SET);
const NON_WS_CP_SET: CodePointSet = complementCp(WS_CP_SET);

function mergeFirstList(lists: readonly CodePointSet[]): CodePointSet[] {
  let combined: CodePointSet = EMPTY_CP_SET;
  for (const item of lists) {
    if (item.length > 0) combined = unionCp(combined, item);
  }
  return combined.length > 0 ? [combined] : [];
}

interface ParsedUnicodeEscape {
  readonly nextIdx: number;
  readonly first: CodePointSet;
  readonly isAnchor?: boolean;
  readonly isBackreference?: boolean;
  readonly unsupported?: boolean;
  readonly singleCp?: number;
}

function parseUnicodeHexEscape(source: string, idx: number): ParsedUnicodeEscape {
  if (source[idx + 2] === "{") {
    const match = HEX_BRACE_RE.exec(source.slice(idx + 2));
    if (match) {
      const cp = Number.parseInt(match[1]!, 16);
      if (cp <= MAX_UNICODE_CP) {
        return { nextIdx: idx + 2 + match[0].length, first: [[cp, cp]], singleCp: cp };
      }
    }
    const close = source.indexOf("}", idx + 3);
    return { nextIdx: close >= 0 ? close + 1 : idx + 2, first: EMPTY_CP_SET, unsupported: true };
  }
  const hex4 = source.slice(idx + 2, idx + 6);
  if (!HEX4_RE.test(hex4)) return { nextIdx: idx + 2, first: EMPTY_CP_SET, unsupported: true };
  const hi = Number.parseInt(hex4, 16);
  if (hi >= 0xd800 && hi <= 0xdbff && source[idx + 6] === "\\" && source[idx + 7] === "u") {
    const loHex = source.slice(idx + 8, idx + 12);
    if (HEX4_RE.test(loHex)) {
      const lo = Number.parseInt(loHex, 16);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        const cp = ((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
        return { nextIdx: idx + 12, first: [[cp, cp]], singleCp: cp };
      }
    }
  }
  return { nextIdx: idx + 6, first: [[hi, hi]], singleCp: hi };
}

/**
 * Strict ECMA-262 `[+UnicodeMode]` escape parser (no Annex B fallbacks).
 * Every escape class not modeled with an exact Unicode code point set (including `\p{...}` / `\P{...}`)
 * is marked `unsupported: true` and refused.
 */
function parseUnicodeEscape(source: string, idx: number, inClass: boolean): ParsedUnicodeEscape {
  const ch = source[idx + 1];
  if (ch === undefined) return { nextIdx: source.length, first: EMPTY_CP_SET, unsupported: true };
  if (!inClass && (ch === "b" || ch === "B")) return { nextIdx: idx + 2, first: EMPTY_CP_SET, isAnchor: true };
  if (inClass && ch === "b") return { nextIdx: idx + 2, first: [[0x08, 0x08]], singleCp: 0x08 };
  if (inClass && ch === "-") return { nextIdx: idx + 2, first: [[0x2d, 0x2d]], singleCp: 0x2d };
  if (!inClass && ch >= "1" && ch <= "9") {
    let end = idx + 2;
    while (end < source.length && source[end]! >= "0" && source[end]! <= "9") end += 1;
    return { nextIdx: end, first: ALL_CP_SET, isBackreference: true };
  }
  if (!inClass && ch === "k" && source[idx + 2] === "<") {
    const close = source.indexOf(">", idx + 3);
    return { nextIdx: close >= 0 ? close + 1 : source.length, first: ALL_CP_SET, isBackreference: true };
  }
  if (ch === "0") {
    const next = source[idx + 2];
    if (next !== undefined && next >= "0" && next <= "9") {
      return { nextIdx: idx + 2, first: EMPTY_CP_SET, unsupported: true };
    }
    return { nextIdx: idx + 2, first: [[0x00, 0x00]], singleCp: 0x00 };
  }
  if (ch === "d") return { nextIdx: idx + 2, first: DIGIT_CP_SET };
  if (ch === "D") return { nextIdx: idx + 2, first: NON_DIGIT_CP_SET };
  if (ch === "w") return { nextIdx: idx + 2, first: WORD_CP_SET };
  if (ch === "W") return { nextIdx: idx + 2, first: NON_WORD_CP_SET };
  if (ch === "s") return { nextIdx: idx + 2, first: WS_CP_SET };
  if (ch === "S") return { nextIdx: idx + 2, first: NON_WS_CP_SET };
  if (ch === "p" || ch === "P") {
    const close = source[idx + 2] === "{" ? source.indexOf("}", idx + 3) : -1;
    return { nextIdx: close >= 0 ? close + 1 : idx + 2, first: ALL_CP_SET, unsupported: true };
  }
  if (ch === "c") {
    const letter = source[idx + 2];
    if (letter !== undefined && ASCII_LETTER_RE.test(letter)) {
      const cp = letter.charCodeAt(0) & 0x1f;
      return { nextIdx: idx + 3, first: [[cp, cp]], singleCp: cp };
    }
    return { nextIdx: idx + 2, first: EMPTY_CP_SET, unsupported: true };
  }
  if (ch === "x") {
    const hex = source.slice(idx + 2, idx + 4);
    if (HEX2_RE.test(hex)) {
      const cp = Number.parseInt(hex, 16);
      return { nextIdx: idx + 4, first: [[cp, cp]], singleCp: cp };
    }
    return { nextIdx: idx + 2, first: EMPTY_CP_SET, unsupported: true };
  }
  if (ch === "u") return parseUnicodeHexEscape(source, idx);
  if (Object.hasOwn(UNICODE_CONTROL_ESCAPES, ch)) {
    const cp = UNICODE_CONTROL_ESCAPES[ch]!;
    return { nextIdx: idx + 2, first: [[cp, cp]], singleCp: cp };
  }
  if (UNICODE_SYNTAX_ESCAPES.has(ch)) {
    const cp = ch.codePointAt(0)!;
    return { nextIdx: idx + 2, first: [[cp, cp]], singleCp: cp };
  }
  return { nextIdx: idx + 2, first: EMPTY_CP_SET, unsupported: true };
}

/** Strict ECMA-262 `[+UnicodeMode]` character class parser (`[]` and `[^]` close immediately at `]`). */
function parseUnicodeCharClass(
  source: string,
  startIdx: number,
): { readonly nextIdx: number; readonly first: CodePointSet; readonly unsupported: boolean } {
  let i = startIdx + 1;
  const negated = source[i] === "^";
  if (negated) i += 1;
  let first: CodePointSet = EMPTY_CP_SET;
  let prevCp: number | null = null;
  let unsupported = false;

  while (i < source.length) {
    if (source[i] === "]") {
      return { nextIdx: i + 1, first: negated ? complementCp(first) : first, unsupported };
    }
    if (source[i] === "-" && prevCp !== null && source[i + 1] !== undefined && source[i + 1] !== "]") {
      i += 1;
      let endCp: number | null = null;
      if (source[i] === "\\") {
        const esc = parseUnicodeEscape(source, i, true);
        i = esc.nextIdx;
        if (esc.unsupported || esc.singleCp === undefined) unsupported = true;
        else endCp = esc.singleCp;
      } else {
        endCp = source.codePointAt(i)!;
        i += endCp > 0xffff ? 2 : 1;
      }
      if (endCp === null || endCp < prevCp) unsupported = true;
      else first = unionCp(first, [[prevCp, endCp]]);
      prevCp = null;
      continue;
    }
    if (source[i] === "\\") {
      const esc = parseUnicodeEscape(source, i, true);
      i = esc.nextIdx;
      if (esc.unsupported) unsupported = true;
      first = unionCp(first, esc.first);
      prevCp = esc.singleCp ?? null;
    } else {
      const cp = source.codePointAt(i)!;
      i += cp > 0xffff ? 2 : 1;
      first = unionCp(first, [[cp, cp]]);
      prevCp = cp;
    }
  }
  return { nextIdx: i, first: EMPTY_CP_SET, unsupported: true };
}

function readRegexQuantifier(
  source: string,
  idx: number,
): { readonly nextIdx: number; readonly min: number; readonly max: number } | null {
  const ch = source[idx];
  let min: number;
  let max: number;
  let nextIdx: number;
  if (ch === "*") {
    min = 0;
    max = Number.POSITIVE_INFINITY;
    nextIdx = idx + 1;
  } else if (ch === "+") {
    min = 1;
    max = Number.POSITIVE_INFINITY;
    nextIdx = idx + 1;
  } else if (ch === "?") {
    min = 0;
    max = 1;
    nextIdx = idx + 1;
  } else if (ch === "{") {
    const match = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(idx));
    if (!match) return null;
    min = Number(match[1]);
    max = match[2] === undefined ? min : match[3] ? Number(match[3]) : Number.POSITIVE_INFINITY;
    nextIdx = idx + match[0].length;
  } else {
    return null;
  }
  if (source[nextIdx] === "?") nextIdx += 1;
  return { nextIdx, min, max };
}

function parseGroupHeader(
  source: string,
  openIdx: number,
): { readonly contentStart: number; readonly lookaround: boolean; readonly unsupported: boolean } {
  const i = openIdx + 1;
  if (source[i] !== "?") return { contentStart: i, lookaround: false, unsupported: false };
  const next = source[i + 1];
  if (next === ":") return { contentStart: i + 2, lookaround: false, unsupported: false };
  if (next === "=" || next === "!") return { contentStart: i + 2, lookaround: true, unsupported: false };
  if (next === "<") {
    const third = source[i + 2];
    if (third === "=" || third === "!") return { contentStart: i + 3, lookaround: true, unsupported: false };
    const close = source.indexOf(">", i + 2);
    return close >= 0
      ? { contentStart: close + 1, lookaround: false, unsupported: false }
      : { contentStart: i + 2, lookaround: false, unsupported: true };
  }
  const colon = source.indexOf(":", i + 1);
  return { contentStart: colon >= 0 ? colon + 1 : i + 1, lookaround: false, unsupported: true };
}

function parseRegexAst(source: string): RegexAstNode {
  let pos = 0;

  const parseAlt = (): RegexAstNode => {
    const branches: RegexAstNode[] = [parseSeq()];
    while (pos < source.length && source[pos] === "|") {
      pos += 1;
      branches.push(parseSeq());
    }
    return branches.length === 1 ? branches[0]! : { kind: "alt", branches };
  };

  const parseSeq = (): RegexAstNode => {
    const parts: RegexAstNode[] = [];
    while (pos < source.length && source[pos] !== "|" && source[pos] !== ")") {
      let node = parsePrimary();
      const quant = readRegexQuantifier(source, pos);
      if (quant) {
        pos = quant.nextIdx;
        node = { kind: "quant", body: node, min: quant.min, max: quant.max };
      }
      parts.push(node);
    }
    if (parts.length === 0) return { kind: "empty" };
    return parts.length === 1 ? parts[0]! : { kind: "seq", parts };
  };

  const parsePrimary = (): RegexAstNode => {
    const ch = source[pos]!;
    if (ch === "^" || ch === "$") {
      pos += 1;
      return { kind: "anchor" };
    }
    if (ch === ".") {
      pos += 1;
      return { kind: "atom", first: DOT_CP_SET };
    }
    if (ch === "\\") {
      const esc = parseUnicodeEscape(source, pos, false);
      pos = esc.nextIdx;
      if (esc.isAnchor) return { kind: "anchor" };
      return {
        kind: "atom",
        first: esc.first,
        backreference: esc.isBackreference,
        unsupported: esc.unsupported,
      };
    }
    if (ch === "[") {
      const cls = parseUnicodeCharClass(source, pos);
      pos = cls.nextIdx;
      return { kind: "atom", first: cls.first, unsupported: cls.unsupported };
    }
    if (ch === "(") {
      const header = parseGroupHeader(source, pos);
      pos = header.contentStart;
      const body = parseAlt();
      if (source[pos] === ")") pos += 1;
      return { kind: "group", body, lookaround: header.lookaround, unsupported: header.unsupported };
    }
    const cp = source.codePointAt(pos)!;
    pos += cp > 0xffff ? 2 : 1;
    return { kind: "atom", first: [[cp, cp]] };
  };

  return parseAlt();
}

function analyzeSeqNode(parts: readonly RegexAstNode[]): RegexAnalysis {
  const analyzed = parts.map((part) => analyzeRegexAst(part));
  let unsafe = analyzed.some((a) => a.unsafe);
  let active: CodePointSet[] = [];
  for (const part of analyzed) {
    if (!unsafe) {
      for (const trailing of active) {
        if (part.leadingVarAtoms.some((leading) => overlapCp(trailing, leading))) {
          unsafe = true;
          break;
        }
      }
    }
    const kept = active.filter((t) => part.nullable || (part.consumesChar && overlapCp(t, part.first)));
    active = mergeFirstList([...kept, ...part.trailingVarAtoms]);
  }

  const leadingCandidates: CodePointSet[] = [];
  for (let i = 0; i < analyzed.length; i += 1) {
    for (const candidate of analyzed[i]!.leadingVarAtoms) {
      let reachable = true;
      for (let j = 0; j < i; j += 1) {
        const prev = analyzed[j]!;
        if (!prev.nullable && !(prev.consumesChar && overlapCp(candidate, prev.first))) {
          reachable = false;
          break;
        }
      }
      if (reachable) leadingCandidates.push(candidate);
    }
  }

  let first: CodePointSet = EMPTY_CP_SET;
  for (const part of analyzed) {
    if (part.consumesChar) first = unionCp(first, part.first);
    if (!part.nullable) break;
  }

  return {
    unsafe,
    nullable: analyzed.every((a) => a.nullable),
    consumesChar: analyzed.some((a) => a.consumesChar),
    hasQuantifier: analyzed.some((a) => a.hasQuantifier),
    hasAmbiguousAlt: analyzed.some((a) => a.hasAmbiguousAlt),
    hasLookaround: analyzed.some((a) => a.hasLookaround),
    first,
    leadingVarAtoms: mergeFirstList(leadingCandidates),
    trailingVarAtoms: active,
  };
}

function analyzeAltNode(branches: readonly RegexAstNode[]): RegexAnalysis {
  const analyzed = branches.map((b) => analyzeRegexAst(b));
  let thisAltAmbiguous = false;
  if (analyzed.length > 1) {
    if (analyzed.some((b) => b.nullable)) {
      thisAltAmbiguous = true;
    } else {
      for (let i = 0; i < analyzed.length && !thisAltAmbiguous; i += 1) {
        for (let j = i + 1; j < analyzed.length; j += 1) {
          if (overlapCp(analyzed[i]!.first, analyzed[j]!.first)) {
            thisAltAmbiguous = true;
            break;
          }
        }
      }
    }
  }
  let first: CodePointSet = EMPTY_CP_SET;
  for (const b of analyzed) {
    if (b.consumesChar) first = unionCp(first, b.first);
  }
  const consumesChar = analyzed.some((b) => b.consumesChar);
  const extraAtom = thisAltAmbiguous && consumesChar ? [first] : [];
  return {
    unsafe: analyzed.some((b) => b.unsafe),
    nullable: analyzed.some((b) => b.nullable),
    consumesChar,
    hasQuantifier: analyzed.some((b) => b.hasQuantifier),
    hasAmbiguousAlt: thisAltAmbiguous || analyzed.some((b) => b.hasAmbiguousAlt),
    hasLookaround: analyzed.some((b) => b.hasLookaround),
    first,
    leadingVarAtoms: mergeFirstList([...analyzed.flatMap((b) => b.leadingVarAtoms), ...extraAtom]),
    trailingVarAtoms: mergeFirstList([...analyzed.flatMap((b) => b.trailingVarAtoms), ...extraAtom]),
  };
}

function analyzeRegexAst(node: RegexAstNode): RegexAnalysis {
  if (node.kind === "empty" || node.kind === "anchor") {
    return {
      unsafe: false,
      nullable: true,
      consumesChar: false,
      hasQuantifier: false,
      hasAmbiguousAlt: false,
      hasLookaround: false,
      first: EMPTY_CP_SET,
      leadingVarAtoms: [],
      trailingVarAtoms: [],
    };
  }
  if (node.kind === "atom") {
    return {
      unsafe: Boolean(node.backreference || node.unsupported),
      nullable: false,
      consumesChar: node.first.length > 0,
      hasQuantifier: false,
      hasAmbiguousAlt: false,
      hasLookaround: false,
      first: node.first,
      leadingVarAtoms: [],
      trailingVarAtoms: [],
    };
  }
  if (node.kind === "group") {
    const body = analyzeRegexAst(node.body);
    const unsafe = body.unsafe || Boolean(node.unsupported);
    if (!node.lookaround) return unsafe === body.unsafe ? body : { ...body, unsafe };
    return {
      ...body,
      unsafe: unsafe || body.hasQuantifier || body.hasLookaround,
      nullable: true,
      consumesChar: false,
      hasLookaround: true,
      first: EMPTY_CP_SET,
      leadingVarAtoms: [],
      trailingVarAtoms: [],
    };
  }
  if (node.kind === "quant") {
    const body = analyzeRegexAst(node.body);
    const isVariable = node.min !== node.max;
    const isRepeating = node.max > 1;
    const unsafe =
      body.unsafe ||
      body.hasQuantifier ||
      body.hasAmbiguousAlt ||
      body.hasLookaround ||
      (Number.isFinite(node.max) && node.max > MAX_FINITE_REGEX_REPEAT) ||
      (isRepeating && body.nullable);
    const consumesChar = node.max > 0 && body.consumesChar;
    // Safe `quant` bodies forbid both `hasQuantifier` and `hasAmbiguousAlt`, which are the only
    // AST producers of non-empty `leadingVarAtoms`/`trailingVarAtoms`.
    const varAtoms = isVariable && consumesChar ? mergeFirstList([body.first]) : [];
    return {
      unsafe,
      nullable: node.min === 0 || body.nullable,
      consumesChar,
      hasQuantifier: true,
      hasAmbiguousAlt: body.hasAmbiguousAlt,
      hasLookaround: body.hasLookaround,
      first: consumesChar ? body.first : EMPTY_CP_SET,
      leadingVarAtoms: varAtoms,
      trailingVarAtoms: varAtoms,
    };
  }
  if (node.kind === "seq") return analyzeSeqNode(node.parts);
  return analyzeAltNode(node.branches);
}

function hasUnsafeRegexQuantifiers(source: string): boolean {
  return analyzeRegexAst(parseRegexAst(source)).unsafe;
}

/**
 * Shared strict Unicode (`/u`) AST regex validation helper (Owner Decision 25/11):
 * enforces non-empty string, length `<= 256`, compilation with `new RegExp(pattern, "u")`
 * (`MM_REGEX_INVALID_UNICODE` on failure), exact Unicode code-point modeling (refusing unmodeled
 * escapes such as `\p{...}` / `\P{...}` and inline modifier groups), zero backreferences, zero
 * nested quantifiers inside any quantified group, zero quantifiers or nested lookarounds inside
 * any lookaround (quantifier-free lookarounds such as `(?!-)` remain allowed), zero quantified
 * alternations with overlapping first characters, finite repeat bound `<= 1024`, and zero
 * sequential overlapping variable quantifiers.
 */
export function validateRegexPattern(
  pattern: unknown,
  code: MetamodelDiagnosticCode,
  path: string,
  sink: ValidationSink,
): void {
  if (typeof pattern !== "string" || pattern.length === 0) {
    addError(sink, code, path, "pattern must be a non-empty regex string");
    return;
  }
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    addError(sink, code, path, `pattern length ${pattern.length} exceeds maximum ${MAX_REGEX_PATTERN_LENGTH} chars`);
    return;
  }
  try {
    new RegExp(pattern, "u");
  } catch {
    addError(sink, "MM_REGEX_INVALID_UNICODE", path, "pattern is not a valid ECMA-262 Unicode (/u) RegExp");
    return;
  }
  if (hasUnsafeRegexQuantifiers(pattern)) {
    addError(
      sink,
      code,
      path,
      "pattern contains forbidden nested quantifiers, quantifiers or nested lookarounds inside lookarounds, ambiguous quantified alternations, backreferences, or unmodeled escapes",
    );
  }
}
