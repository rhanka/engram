import { createHash } from "node:crypto";
import { canonicalizeJcs } from "../../engram-memory/dist/canonical-json.js";
import type { SessionContextAmendmentV1, SessionContextQueryV1, SessionContextSelectorMatchV1, SessionContextSelectorV1, Sha256Digest } from "../session-front-contracts.js";

export const DEFAULT_MAX_SELECTORS = 64;
export const MAX_SELECTOR_TEXT_BYTES = 8_192;
export const MAX_SELECTOR_REF_BYTES = 4_096;
export const SESSION_CONTEXT_GATE_REFUSAL_REASONS = ["outside_rights", "selector_ceiling", "unattributed", "journal_off", "invalid_amendment"] as const;
export type SessionContextGateRefusalReasonV1 = (typeof SESSION_CONTEXT_GATE_REFUSAL_REASONS)[number];
export type SessionContextStoredSelectorMatchV1 = Exclude<SessionContextSelectorMatchV1, { readonly kind: "withheld" }>;
export interface SessionContextRightsScopeV1 { readonly tenantId: string; readonly workspaceId: string; readonly derivedWorktreeId: string; readonly roleRef?: string; readonly mandateDigest?: Sha256Digest; readonly sessionPseudoId?: string; }
export type SessionContextGateVerdictResultV1 = { readonly selectorId: string; readonly verdict: "accepted" } | { readonly selectorId: string; readonly verdict: "no_change" } | { readonly selectorId: string; readonly verdict: "refused"; readonly reason: SessionContextGateRefusalReasonV1 };
export interface SessionContextGateOptionsV1 { readonly journalEnabled?: boolean; readonly maxSelectors?: number; readonly maxSelectorsOverride?: number; readonly callerScope?: SessionContextRightsScopeV1; readonly targetScope?: SessionContextRightsScopeV1; readonly refScopes?: ReadonlyMap<string, SessionContextRightsScopeV1> | Readonly<Record<string, SessionContextRightsScopeV1>>; readonly existingEventRecordIds?: ReadonlySet<string> | readonly string[]; readonly eventScopes?: ReadonlyMap<string, SessionContextRightsScopeV1> | Readonly<Record<string, SessionContextRightsScopeV1>>; }
export interface SessionContextGateEvaluationV1 { readonly verdict: SessionContextGateVerdictResultV1; readonly query: SessionContextQueryV1; readonly evictedSelectorIds: readonly string[]; }

interface DecodedBase { readonly ok: true; readonly selectorId: string; readonly by: "agent" | "shadow"; readonly authorModelRef?: string; readonly sourceEventRecordIds: readonly string[]; readonly basedOnVersion: number; }
type DecodedAmendment =
  | { readonly ok: false; readonly selectorId: string; readonly reason: "invalid_amendment" | "outside_rights" }
  | (DecodedBase & { readonly op: "keep"; readonly match: SessionContextStoredSelectorMatchV1 })
  | (DecodedBase & { readonly op: "drop" });

const UNPAIRED_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const REF_FORBIDDEN_CHAR_RE = /[\x00-\x1f\x7f-\x9f*]/;
const SELECTOR_ID_RE = /^scs_[0-9a-f]{64}$/;
const WITHHELD_PATH_RE = /^withheld-path:[0-9a-f]{64}$/;
const WORKTREE_ID_RE = /^wt:[0-9a-f]{64}$/;
const MODEL_REF_RE = /^[^\s:\x00-\x1f\x7f][^:\x00-\x1f\x7f]*:[^\s:\x00-\x1f\x7f][^\x00-\x1f\x7f]*$/;
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(["secret", "secrets", "credentials", ".ssh", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials.json", "secrets.json", "service-account.json"]);
const PROTECTED_QUERY_KEYS: ReadonlySet<string> = new Set(["schemaVersion", "queryId", "version", "digest", "tenantId", "workspaceId", "derivedWorktreeId", "roleRef", "mandateDigest", "objectiveLoopId", "trackScope", "ontologies", "pinnedEventRecordIds", "selectors", "rights", "unpin", "scope", "scopeRef"]);
const KEEP_KEYS: ReadonlySet<string> = new Set(["op", "by", "authorModelRef", "sourceEventRecordIds", "basedOnVersion", "match"]);
const DROP_KEYS: ReadonlySet<string> = new Set(["op", "by", "authorModelRef", "sourceEventRecordIds", "basedOnVersion", "selectorId"]);

const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const omitUndefined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const lookupScope = (source: ReadonlyMap<string, SessionContextRightsScopeV1> | Readonly<Record<string, SessionContextRightsScopeV1>> | undefined, key: string): SessionContextRightsScopeV1 | undefined =>
  source === undefined ? undefined : source instanceof Map ? source.get(key) : Object.hasOwn(source, key) ? (source as Readonly<Record<string, SessionContextRightsScopeV1>>)[key] : undefined;
const readNfcString = (v: unknown): string | undefined => typeof v === "string" && !UNPAIRED_SURROGATE_RE.test(v) ? v.normalize("NFC") : undefined;
const isValidModelRef = (v: string): boolean => v === v.trim() && Buffer.byteLength(v, "utf8") <= 256 && MODEL_REF_RE.test(v);
const isValidEventId = (v: string): boolean => v.length > 0 && v === v.trim() && Buffer.byteLength(v, "utf8") <= 512 && !CONTROL_CHAR_RE.test(v);
const cloneSelector = (s: SessionContextSelectorV1): SessionContextSelectorV1 => ({
  selectorId: s.selectorId,
  match: { ...s.match },
  by: s.by,
  ...(s.authorModelRef === undefined ? {} : { authorModelRef: s.authorModelRef }),
  sourceEventRecordIds: [...s.sourceEventRecordIds],
});

function decodeBoundedString(v: unknown, minBytes: number, maxBytes: number): string | undefined {
  const s = readNfcString(v);
  if (s === undefined) return undefined;
  const bytes = Buffer.byteLength(s, "utf8");
  return bytes >= minBytes && bytes <= maxBytes ? s : undefined;
}
function readPlainObj(v: unknown): Record<string, unknown> | undefined {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return undefined;
  if (Object.getOwnPropertySymbols(v).length > 0) return undefined;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.getOwnPropertyNames(v)) {
    if (key === "__proto__") return undefined;
    const desc = Object.getOwnPropertyDescriptor(v, key);
    if (!desc || !desc.enumerable || !("value" in desc)) return undefined;
    out[key] = desc.value;
  }
  return out;
}
function decodeDenseStrings(v: unknown): readonly string[] | undefined {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertySymbols(v).length > 0) return undefined;
  const len = v.length;
  if (Object.getOwnPropertyNames(v).length !== len + 1) return undefined;
  const out: string[] = [];
  for (let i = 0; i < len; i += 1) {
    const desc = Object.getOwnPropertyDescriptor(v, String(i));
    if (!desc || !desc.enumerable || !("value" in desc)) return undefined;
    const s = readNfcString(desc.value);
    if (s === undefined) return undefined;
    out.push(s);
  }
  return out;
}
function decodeStoredMatchObj(obj: Record<string, unknown>): SessionContextStoredSelectorMatchV1 | undefined {
  if (Object.keys(obj).length !== 2) return undefined;
  if (obj.kind === "text") {
    const text = decodeBoundedString(obj.text, 1, MAX_SELECTOR_TEXT_BYTES);
    return text === undefined ? undefined : { kind: "text", text };
  }
  if (obj.kind === "ref") {
    const ref = decodeBoundedString(obj.ref, 1, MAX_SELECTOR_REF_BYTES);
    return ref === undefined ? undefined : { kind: "ref", ref };
  }
  return undefined;
}
function decodeAmendment(raw: unknown, currentVersion: number): DecodedAmendment {
  const bad = (selectorId = "", reason: "invalid_amendment" | "outside_rights" = "invalid_amendment"): DecodedAmendment => ({ ok: false, selectorId, reason });
  try {
    const obj = readPlainObj(raw);
    if (obj === undefined) return bad();
    const hasMatch = Object.hasOwn(obj, "match");
    const matchObj = hasMatch ? readPlainObj(obj.match) : undefined;
    if (hasMatch && matchObj === undefined) return bad();
    if (Object.keys(obj).some((k) => PROTECTED_QUERY_KEYS.has(k)) || (matchObj !== undefined && Object.keys(matchObj).some((k) => PROTECTED_QUERY_KEYS.has(k)))) return bad("", "outside_rights");
    const op = obj.op;
    if (op !== "keep" && op !== "drop") return bad();
    if (Object.keys(obj).some((k) => !(op === "keep" ? KEEP_KEYS : DROP_KEYS).has(k))) return bad();
    const rawEventIds = decodeDenseStrings(obj.sourceEventRecordIds);
    if (rawEventIds === undefined) return bad();
    const match = op === "keep" ? (matchObj === undefined ? undefined : decodeStoredMatchObj(matchObj)) : undefined;
    const selectorId = op === "keep" ? (match === undefined ? "" : `scs_${sha256Hex(canonicalizeJcs(match))}`) : (isValidSessionContextSelectorId(obj.selectorId) ? obj.selectorId : "");
    if (selectorId === "") return bad();
    const by = obj.by;
    if (by !== "agent" && by !== "shadow") return bad(selectorId);
    if (!rawEventIds.every(isValidEventId)) return bad(selectorId);
    const basedOnVersion = obj.basedOnVersion;
    if (typeof basedOnVersion !== "number" || Object.is(basedOnVersion, -0) || !Number.isSafeInteger(basedOnVersion) || basedOnVersion < 0 || basedOnVersion > currentVersion) return bad(selectorId);
    let authorModelRef: string | undefined;
    if (Object.hasOwn(obj, "authorModelRef")) {
      const normModel = readNfcString(obj.authorModelRef);
      if (normModel === undefined) return bad(selectorId);
      if (isValidModelRef(normModel)) authorModelRef = normModel;
      else if (by === "agent") return bad(selectorId);
    }
    const base: DecodedBase = { ok: true, selectorId, by, ...(authorModelRef === undefined ? {} : { authorModelRef }), sourceEventRecordIds: rawEventIds, basedOnVersion };
    return op === "keep" ? { ...base, op: "keep", match: match! } : { ...base, op: "drop" };
  } catch {
    return bad();
  }
}

export const isValidSessionContextSelectorId = (value: unknown): value is string => typeof value === "string" && SELECTOR_ID_RE.test(value);
export function deriveSessionContextSelectorId(match: SessionContextStoredSelectorMatchV1): string {
  let parsed: SessionContextStoredSelectorMatchV1 | undefined;
  try {
    const obj = readPlainObj(match);
    parsed = obj === undefined ? undefined : decodeStoredMatchObj(obj);
  } catch {
    parsed = undefined;
  }
  if (parsed === undefined) throw new RangeError("match must be a valid stored text or ref selector match.");
  return `scs_${sha256Hex(canonicalizeJcs(parsed))}`;
}
export function projectSelectorWithheld(selector: SessionContextSelectorV1): SessionContextSelectorV1 {
  const match: SessionContextSelectorMatchV1 =
    selector.match.kind === "text"
      ? {
          kind: "withheld",
          textDigest: `sha256:${sha256Hex(selector.match.text)}` as Sha256Digest,
        }
      : { ...selector.match };
  return { selectorId: selector.selectorId, match, by: selector.by, ...(selector.authorModelRef === undefined ? {} : { authorModelRef: selector.authorModelRef }), sourceEventRecordIds: [...selector.sourceEventRecordIds] };
}
export function resolveMaxSelectors(workspaceLimit?: number, overrideLimit?: number): number {
  const base = workspaceLimit ?? DEFAULT_MAX_SELECTORS;
  if (!Number.isSafeInteger(base) || base < 0) throw new RangeError("maxSelectors must be a non-negative safe integer.");
  if (overrideLimit !== undefined && (!Number.isSafeInteger(overrideLimit) || overrideLimit < 0)) throw new RangeError("maxSelectorsOverride must be a non-negative safe integer.");
  const limit = overrideLimit === undefined ? base : Math.min(base, overrideLimit);
  return limit === 0 ? 0 : limit;
}

function isSafeSegment(seg: string): boolean {
  if (seg.length === 0 || seg !== seg.trim() || seg === "." || seg === ".." || seg.startsWith("~") || /[\\/:]/.test(seg)) return false;
  const low = seg.toLowerCase();
  return !low.startsWith(".env") && !low.endsWith(".pem") && !low.endsWith(".key") && !FORBIDDEN_SEGMENTS.has(low);
}
function isIntrinsicRefAllowed(ref: string, query: SessionContextQueryV1): boolean {
  if (REF_FORBIDDEN_CHAR_RE.test(ref)) return false;
  if (!ref.includes(":")) return ref.split(/[\\/]/).every(isSafeSegment);
  const parts = ref.split(":");
  switch (parts[0]) {
    case "withheld-path": return WITHHELD_PATH_RE.test(ref);
    case "wt": return ref === query.derivedWorktreeId && WORKTREE_ID_RE.test(ref);
    case "pinned": return parts.length === 3 && query.queryId.length > 0 && parts[1] === query.queryId && isSafeSegment(parts[2]!);
    case "decision": return (parts.length === 3 || parts.length === 4) && query.queryId.length > 0 && parts[1] === query.queryId && parts.slice(2).every(isSafeSegment);
    case "track": return parts.length === 4 && query.workspaceId.length > 0 && parts[2] === query.workspaceId && isSafeSegment(parts[1]!) && isSafeSegment(parts[3]!);
    default: return false;
  }
}

const isCallerMatchingQuery = (c: SessionContextRightsScopeV1, q: SessionContextQueryV1): boolean =>
  c.tenantId === q.tenantId && c.workspaceId === q.workspaceId && c.derivedWorktreeId === q.derivedWorktreeId && c.roleRef === q.roleRef && c.mandateDigest === q.mandateDigest;

/*
 * Total rights table (default: "outside_rights"). Precondition for every cell:
 * target matches query on (tenantId, workspaceId, derivedWorktreeId) and
 * (target.mandateDigest === undefined || target.mandateDigest === query.mandateDigest).
 * | Target (roleRef × sessionPseudoId) | Role-scoped query (roleRef set)   | Unassigned-session query (roleRef unset)                 |
 * |------------------------------------|-----------------------------------|----------------------------------------------------------|
 * | role set   × session unset         | allowed iff target.role === query | outside_rights                                           |
 * | role set   × session set           | allowed iff target.role === query | outside_rights                                           |
 * | role unset × session unset         | allowed (workspace-level item)    | allowed (workspace-level item)                           |
 * | role unset × session set           | outside_rights (unassigned priv.) | allowed iff non-empty callerSession === target.session   |
 */
function decideTargetRights(query: SessionContextQueryV1, target: SessionContextRightsScopeV1, callerSessionId?: string): "allowed" | "outside_rights" {
  if (target.tenantId !== query.tenantId || target.workspaceId !== query.workspaceId || target.derivedWorktreeId !== query.derivedWorktreeId) return "outside_rights";
  if (target.mandateDigest !== undefined && target.mandateDigest !== query.mandateDigest) return "outside_rights";
  if (query.roleRef !== undefined) {
    return target.roleRef !== undefined
      ? target.roleRef === query.roleRef
        ? "allowed"
        : "outside_rights"
      : target.sessionPseudoId === undefined
        ? "allowed"
        : "outside_rights";
  }
  if (target.roleRef === undefined && (target.sessionPseudoId === undefined || (callerSessionId !== undefined && callerSessionId.length > 0 && target.sessionPseudoId === callerSessionId))) {
    return "allowed";
  }
  return "outside_rights";
}

function buildNextQuery(query: SessionContextQueryV1, selectors: readonly SessionContextSelectorV1[]): SessionContextQueryV1 {
  const bare: Omit<SessionContextQueryV1, "digest"> = {
    schemaVersion: query.schemaVersion,
    queryId: query.queryId,
    version: query.version + 1,
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    derivedWorktreeId: query.derivedWorktreeId,
    ...(query.roleRef === undefined ? {} : { roleRef: query.roleRef }),
    ...(query.mandateDigest === undefined ? {} : { mandateDigest: query.mandateDigest }),
    ...(query.objectiveLoopId === undefined ? {} : { objectiveLoopId: query.objectiveLoopId }),
    trackScope: query.trackScope.map(omitUndefined),
    ontologies: query.ontologies.map(omitUndefined),
    pinnedEventRecordIds: [...query.pinnedEventRecordIds],
    selectors,
  };
  return { ...bare, digest: `sha256:${sha256Hex(canonicalizeJcs(bare))}` as Sha256Digest };
}

export function evaluateSessionContextAmendment(query: SessionContextQueryV1, amendment: SessionContextAmendmentV1, options?: SessionContextGateOptionsV1): SessionContextGateEvaluationV1 {
  if (!Number.isSafeInteger(query.version) || query.version < 1 || !Number.isSafeInteger(query.version + 1)) throw new RangeError("query.version must be a positive safe integer.");
  const maxSelectors = resolveMaxSelectors(options?.maxSelectors, options?.maxSelectorsOverride);
  const refuse = (selectorId: string, reason: SessionContextGateRefusalReasonV1): SessionContextGateEvaluationV1 => ({ verdict: { selectorId, verdict: "refused", reason }, query, evictedSelectorIds: [] });
  const noChange = (selectorId: string): SessionContextGateEvaluationV1 => ({ verdict: { selectorId, verdict: "no_change" }, query, evictedSelectorIds: [] });
  const decoded = decodeAmendment(amendment, query.version);
  if (!decoded.ok) return refuse(decoded.selectorId, decoded.reason);
  const { selectorId, by, sourceEventRecordIds: sources } = decoded;
  if (options?.journalEnabled === false) return refuse(selectorId, "journal_off");
  if (options?.callerScope !== undefined && !isCallerMatchingQuery(options.callerScope, query)) return refuse(selectorId, "outside_rights");
  const callerSessionId = options?.callerScope?.sessionPseudoId;
  if (by === "shadow") {
    if (decoded.authorModelRef === undefined || sources.length === 0) return refuse(selectorId, "unattributed");
    if (options?.eventScopes === undefined && options?.existingEventRecordIds === undefined) return refuse(selectorId, "unattributed");
    if (options?.existingEventRecordIds !== undefined) {
      const known = options.existingEventRecordIds instanceof Set ? options.existingEventRecordIds : new Set(options.existingEventRecordIds);
      if (sources.some((id) => !known.has(id))) return refuse(selectorId, "unattributed");
    }
  }
  if (options?.eventScopes !== undefined) {
    for (const id of sources) {
      const evScope = lookupScope(options.eventScopes, id);
      if (evScope === undefined) { if (by === "shadow") return refuse(selectorId, "unattributed"); }
      else if (decideTargetRights(query, evScope, callerSessionId) !== "allowed") return refuse(selectorId, "outside_rights");
    }
  }
  if (options?.targetScope !== undefined && decideTargetRights(query, options.targetScope, callerSessionId) !== "allowed") return refuse(selectorId, "outside_rights");
  if (decoded.op === "drop") {
    const matches = query.selectors.filter((s) => s.selectorId === selectorId);
    if (matches.length === 0) return noChange(selectorId);
    if (by === "shadow" && matches.some((s) => s.by === "agent")) {
      return refuse(selectorId, "outside_rights");
    }
    return {
      verdict: { selectorId, verdict: "accepted" },
      query: buildNextQuery(
        query,
        query.selectors.filter((s) => s.selectorId !== selectorId).map(cloneSelector),
      ),
      evictedSelectorIds: [],
    };
  }
  if (decoded.match.kind === "ref") {
    if (!isIntrinsicRefAllowed(decoded.match.ref, query)) return refuse(selectorId, "outside_rights");
    const refScope = lookupScope(options?.refScopes, decoded.match.ref);
    if (refScope === undefined || decideTargetRights(query, refScope, callerSessionId) !== "allowed") return refuse(selectorId, "outside_rights");
  }
  if (query.selectors.some((s) => s.selectorId === selectorId)) return noChange(selectorId);
  const needed = Math.max(0, query.selectors.length - (maxSelectors - 1));
  const shadowIndices = query.selectors.flatMap((s, i) => (s.by === "shadow" ? [i] : []));
  if (shadowIndices.length < needed) return refuse(selectorId, "selector_ceiling");
  const evictIndices = shadowIndices.slice(0, needed), evictSet = new Set(evictIndices);
  const added: SessionContextSelectorV1 = {
    selectorId,
    match: decoded.match,
    by,
    ...(decoded.authorModelRef === undefined ? {} : { authorModelRef: decoded.authorModelRef }),
    sourceEventRecordIds: [...sources],
  };
  return {
    verdict: { selectorId, verdict: "accepted" },
    query: buildNextQuery(query, [
      ...query.selectors.filter((_, i) => !evictSet.has(i)).map(cloneSelector),
      added,
    ]),
    evictedSelectorIds: evictIndices.map((i) => query.selectors[i]!.selectorId),
  };
}
