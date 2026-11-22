import { createHash } from "node:crypto";
import type { Cursor, RawSessionEventReceipt, SessionContextItemRefV1, SessionContextQueryV1, SessionTrackScopeRefV1, Sha256Digest } from "../session-front-contracts.js";
export type SessionContextSliceV1 = RawSessionEventReceipt["readySlices"][number];
export type SessionContextTierV1 = 1 | 2 | 3 | 4 | 5 | 6;
export const DEFAULT_VIEW_MAX_TOKENS = 8_000;
export const DEFAULT_BYTES_PER_TOKEN = 3;
export const SESSION_CONTEXT_SLICE_ORDER: readonly SessionContextSliceV1[] = ["track", "git", "architecture", "rules", "memory"];
export interface SessionContextViewEntryV1 { readonly ref: string; readonly text: string; readonly digest?: Sha256Digest; readonly slice?: SessionContextSliceV1; readonly disclosure?: SessionContextItemRefV1["disclosure"]; readonly authoredBy?: SessionContextItemRefV1["authoredBy"]; readonly authorModelRef?: string; readonly sourceEventRecordIds?: readonly string[]; readonly cursor?: Cursor; readonly replacedAtCursor?: Cursor; }
export type SessionContextRulesProviderV1 = (query: SessionContextQueryV1, cursor: Cursor) => readonly SessionContextViewEntryV1[];
export interface SessionContextViewInputV1 { readonly query: SessionContextQueryV1; readonly cursor: Cursor; readonly pinnedRequests?: readonly SessionContextViewEntryV1[]; readonly decisions?: readonly SessionContextViewEntryV1[]; readonly trackItems?: readonly SessionContextViewEntryV1[]; readonly rulesProvider?: SessionContextRulesProviderV1; readonly selectorItems?: readonly SessionContextViewEntryV1[]; readonly viewMaxTokens?: number; readonly maxTokensOverride?: number; readonly countTokens?: (text: string) => number; }
export interface SessionContextEvaluatedViewV1 { readonly items: readonly SessionContextItemRefV1[]; readonly readySlices: readonly SessionContextSliceV1[]; readonly readySlicePayloads: Partial<Record<SessionContextSliceV1, string>>; readonly byteLength: number; readonly tokenCount: number; readonly overflow?: "pinned_request_over_ceiling"; readonly omittedDecisionCount: number; readonly omittedItemCount: number; readonly rawTextByRef: ReadonlyMap<string, string>; readonly tierByRef?: ReadonlyMap<string, SessionContextTierV1>; }
export interface SessionContextDiffInputV1 { readonly nowView: SessionContextEvaluatedViewV1; readonly heldRefs: ReadonlySet<string>; readonly withdrawnEntries?: readonly SessionContextViewEntryV1[]; readonly viewMaxTokens?: number; readonly maxTokensOverride?: number; readonly countTokens?: (text: string) => number; }
export type SessionContextDiffResultV1 = Omit<SessionContextEvaluatedViewV1, "omittedDecisionCount" | "omittedItemCount">;
interface Materialized { readonly item: SessionContextItemRefV1; readonly line: string; readonly rawText: string; readonly tier: SessionContextTierV1; }
const sha256 = (text: string): Sha256Digest => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` as Sha256Digest;
const formatLine = (item: SessionContextItemRefV1, text: string): string => item.change === "withdrawn" ? `${item.ref}: [withdrawn] (${item.digest})` : item.disclosure === "reference" ? `${item.ref}: [reference] (${item.digest})` : `${item.ref}: ${text}`;
const decisionPtr = (n: number): Materialized => materialize({ ref: `pointer:decisions:${n}`, text: `${n} more decisions in scope: search with \`session_context: "history"\`` }, "memory", 6);
const omittedPtr = (n: number): Materialized => materialize({ ref: `pointer:omitted:${n}`, text: `${n} more items did not fit: search with \`session_context: "history"\`` }, "memory", 6);
const trackEntry = (s: SessionTrackScopeRefV1): SessionContextViewEntryV1 => ({ ref: `track:${s.repoKey}:${s.workspace}:${s.aggregateId}`, text: `${s.aggregateKind} ${s.aggregateId} (${s.role})${s.baselineCommit ? ` @${s.baselineCommit}` : ""}${s.decisionGateId ? ` gate:${s.decisionGateId}` : ""}`, slice: "track" });
const parsePtr = (ref: string, prefix: string): number => { const n = ref.startsWith(prefix) ? Number(ref.slice(prefix.length)) : 0; return Number.isSafeInteger(n) && n > 0 ? n : 0; };
export function resolveViewMaxTokens(workspaceLimit?: number, overrideLimit?: number): number {
  const base = workspaceLimit ?? DEFAULT_VIEW_MAX_TOKENS;
  if (!Number.isSafeInteger(base) || base < 1) throw new RangeError("viewMaxTokens must be a positive safe integer.");
  if (overrideLimit === undefined) return base;
  if (!Number.isSafeInteger(overrideLimit) || overrideLimit < 1) throw new RangeError("maxTokensOverride must be a positive safe integer.");
  return Math.min(base, overrideLimit);
}
function materialize(entry: SessionContextViewEntryV1, defaultSlice: SessionContextSliceV1, tier: SessionContextTierV1, change: "added" | "withdrawn" = "added"): Materialized {
  const digest = entry.digest ?? sha256(entry.text), disclosure = entry.disclosure ?? "text";
  const item: SessionContextItemRefV1 = { ref: entry.ref, digest, slice: entry.slice ?? defaultSlice, change, disclosure, authoredBy: entry.authoredBy ?? "code", ...(entry.authorModelRef === undefined ? {} : { authorModelRef: entry.authorModelRef }), sourceEventRecordIds: entry.sourceEventRecordIds ? [...entry.sourceEventRecordIds] : [] };
  const rawText = change === "withdrawn" ? `withdrawn:${item.ref}` : disclosure === "reference" ? `${item.ref} (${digest})` : entry.text;
  return { item, line: formatLine(item, entry.text), rawText, tier };
}
function render(records: readonly Materialized[], countTokens?: (text: string) => number): SessionContextDiffResultV1 {
  const grouped = new Map<SessionContextSliceV1, string[]>(), rawTextByRef = new Map<string, string>(), tierByRef = new Map<string, SessionContextTierV1>();
  for (const r of records) { const b = grouped.get(r.item.slice) ?? []; b.push(r.line); grouped.set(r.item.slice, b); rawTextByRef.set(r.item.ref, r.rawText); tierByRef.set(r.item.ref, r.tier); }
  const readySlices: SessionContextSliceV1[] = [], readySlicePayloads: Partial<Record<SessionContextSliceV1, string>> = {};
  let byteLength = 0;
  for (const slice of SESSION_CONTEXT_SLICE_ORDER) { const lines = grouped.get(slice); if (lines && lines.length > 0) { const p = lines.join("\n"); readySlices.push(slice); readySlicePayloads[slice] = p; byteLength += Buffer.byteLength(p, "utf8"); } }
  const tokenCount = byteLength === 0 ? 0 : countTokens ? readySlices.reduce((sum, s) => sum + countTokens(readySlicePayloads[s]!), 0) : Math.ceil(byteLength / DEFAULT_BYTES_PER_TOKEN);
  return { items: records.map((r) => r.item), readySlices, readySlicePayloads, byteLength, tokenCount, rawTextByRef, tierByRef };
}
function maxPrefix(hi: number, fits: (count: number) => boolean): number {
  if (hi < 0 || !fits(0)) return -1;
  let lo = 0; for (let high = hi; lo < high; ) { const mid = Math.ceil((lo + high) / 2); if (fits(mid)) lo = mid; else high = mid - 1; }
  return lo;
}
function packView(tier1: readonly Materialized[], tier2: readonly Materialized[], rest: readonly Materialized[], tail: readonly Materialized[], ceiling: number, countTokens?: (text: string) => number, extraDec = 0, extraRest = 0): SessionContextEvaluatedViewV1 {
  const fits = (recs: readonly Materialized[]): boolean => render(recs, countTokens).tokenCount <= ceiling;
  const omDecAll = tier2.length + extraDec, omRestAll = rest.length + extraRest;
  if (!fits(tier1)) return { ...render([...tier1, ...(omDecAll > 0 ? [decisionPtr(omDecAll)] : []), ...tail], countTokens), overflow: "pinned_request_over_ceiling", omittedDecisionCount: omDecAll, omittedItemCount: omRestAll };
  if (tail.length > 0 && !fits([...tier1, ...tail])) return { ...render([...tier1, ...tail.slice(0, Math.max(0, maxPrefix(tail.length, (n) => fits([...tier1, ...tail.slice(0, n)]))))], countTokens), omittedDecisionCount: omDecAll, omittedItemCount: omRestAll };
  const t12 = [...tier1, ...tier2, ...(extraDec > 0 ? [decisionPtr(extraDec)] : [])];
  if (!fits([...t12, ...tail])) {
    const k = maxPrefix(extraDec > 0 ? tier2.length : tier2.length - 1, (n) => fits([...tier1, ...tier2.slice(0, n), decisionPtr(omDecAll - n), ...tail]));
    if (k < 0) return { ...render([...tier1, ...tail], countTokens), omittedDecisionCount: omDecAll, omittedItemCount: omRestAll };
    const base = [...tier1, ...tier2.slice(0, k), decisionPtr(omDecAll - k)];
    return { ...render(omRestAll > 0 && fits([...base, omittedPtr(omRestAll), ...tail]) ? [...base, omittedPtr(omRestAll), ...tail] : [...base, ...tail], countTokens), omittedDecisionCount: omDecAll - k, omittedItemCount: omRestAll };
  }
  const all = [...t12, ...rest, ...(extraRest > 0 ? [omittedPtr(extraRest)] : []), ...tail];
  if (fits(all)) return { ...render(all, countTokens), omittedDecisionCount: extraDec, omittedItemCount: extraRest };
  const hiRest = extraRest > 0 ? rest.length : rest.length - 1;
  const mPtr = maxPrefix(hiRest, (n) => fits([...t12, ...rest.slice(0, n), omittedPtr(omRestAll - n), ...tail]));
  if (mPtr >= 0) return { ...render([...t12, ...rest.slice(0, mPtr), omittedPtr(omRestAll - mPtr), ...tail], countTokens), omittedDecisionCount: extraDec, omittedItemCount: omRestAll - mPtr };
  const mRaw = Math.max(0, maxPrefix(hiRest, (n) => fits([...t12, ...rest.slice(0, n), ...tail])));
  return { ...render([...t12, ...rest.slice(0, mRaw), ...tail], countTokens), omittedDecisionCount: extraDec, omittedItemCount: omRestAll - mRaw };
}
export function evaluateSessionContextView(input: SessionContextViewInputV1): SessionContextEvaluatedViewV1 {
  const ceiling = resolveViewMaxTokens(input.viewMaxTokens, input.maxTokensOverride), at = BigInt(input.cursor);
  const active = (e: SessionContextViewEntryV1): boolean => (e.cursor === undefined || BigInt(e.cursor) <= at) && (e.replacedAtCursor === undefined || BigInt(e.replacedAtCursor) > at);
  const tier1 = (input.pinnedRequests ?? []).map((e) => materialize(e, "track", 1));
  const tier2 = (input.decisions ?? []).filter(active).map((entry, index) => ({ entry, index }))
    .sort((a, b) => { const ca = BigInt(a.entry.cursor ?? a.index), cb = BigInt(b.entry.cursor ?? b.index); return cb > ca ? 1 : cb < ca ? -1 : b.index - a.index; })
    .map(({ entry }) => materialize(entry, "memory", 2));
  const explicitTrack = (input.trackItems ?? []).filter(active), seenTrack = new Set(explicitTrack.map((e) => e.ref));
  const tier3 = [...explicitTrack, ...input.query.trackScope.map(trackEntry).filter((e) => !seenTrack.has(e.ref))].map((e) => materialize(e, "track", 3));
  const tier4 = (input.rulesProvider ? input.rulesProvider(input.query, input.cursor) : []).filter(active).map((e) => materialize(e, "rules", 4));
  const rest = [...tier3, ...tier4, ...(input.selectorItems ?? []).filter(active).map((e) => materialize(e, "memory", 5))];
  return packView(tier1, tier2, rest, [], ceiling, input.countTokens);
}
export function diffSessionContextViews(input: SessionContextDiffInputV1): SessionContextDiffResultV1 {
  const ceiling = resolveViewMaxTokens(input.viewMaxTokens, input.maxTokensOverride);
  const activeRefs = new Set(input.nowView.items.map((item) => item.ref)), seenW = new Set<string>();
  const tier1: Materialized[] = [], tier2: Materialized[] = [], rest: Materialized[] = [], withdrawn: Materialized[] = [];
  let extraDec = 0, extraRest = 0;
  for (const item of input.nowView.items) {
    if (input.heldRefs.has(item.ref)) continue;
    const tier = input.nowView.tierByRef?.get(item.ref);
    if (tier === 6 || tier === undefined) { const d = parsePtr(item.ref, "pointer:decisions:"), o = parsePtr(item.ref, "pointer:omitted:"); if (d > 0) { extraDec += d; continue; } if (o > 0) { extraRest += o; continue; } }
    const rawText = input.nowView.rawTextByRef.get(item.ref) ?? "", rec: Materialized = { item, line: formatLine(item, rawText), rawText, tier: tier ?? 5 };
    (tier === 1 ? tier1 : tier === 2 ? tier2 : rest).push(rec);
  }
  for (const e of input.withdrawnEntries ?? []) { if (input.heldRefs.has(e.ref) && !activeRefs.has(e.ref) && !seenW.has(e.ref)) { seenW.add(e.ref); withdrawn.push(materialize(e, "memory", 2, "withdrawn")); } }
  const { omittedDecisionCount: _d, omittedItemCount: _i, ...diff } = packView(tier1, tier2, rest, withdrawn, ceiling, input.countTokens, extraDec, extraRest);
  return diff;
}
