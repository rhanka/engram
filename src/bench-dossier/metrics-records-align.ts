import { assertCountInt, ensure, isPlainObject } from "./metrics-intervals.js";
import { toGoldSet, type GoldenScalarRow } from "./metrics-parsers.js";

export type GoldenRecordRow = GoldenScalarRow;
export interface MatchRecordKey {
  readonly pc: string | null;
  readonly st: string | null;
  readonly ci: string | null;
}
export interface AlignedCluster extends MatchRecordKey {
  readonly goldVal: string | null;
  readonly splitVariants: ReadonlySet<string> | null;
}
export interface CandidateRecordItem extends MatchRecordKey {
  readonly subVal: string | null;
}
export type RecordGoldUnit =
  | { readonly kind: "insufficient" }
  | { readonly kind: "absent" }
  | {
      readonly kind: "resolved";
      readonly recordSplit: boolean;
      readonly majClusters: readonly AlignedCluster[];
      readonly nonMajClusters: readonly MatchRecordKey[];
      readonly unmatched: readonly MatchRecordKey[];
    };

export const optionalCountInt = (val: unknown, name: string): number | undefined =>
  (val === undefined ? undefined : assertCountInt(val, name));

export const normalizeSingleValue = (val: unknown, tag: string, code = "BAD_GOLD_VALUE"): string | null =>
  [...toGoldSet(val, 1, tag, code)][0] ?? null;

export const keyOfRecordMap = (vals: ReadonlyMap<string, string | null>): MatchRecordKey =>
  ({ pc: vals.get("postal_code") ?? null, st: vals.get("street") ?? null, ci: vals.get("city") ?? null });

/** Read normalized record key fields and target sub-field value from a record object. */
export function readRecFields(obj: unknown, isCand: boolean, subField: string, tag: string) {
  ensure(isPlainObject(obj), "NOT_OBJECT", `${tag} must be plain object`);
  const vals = new Map<string, string | null>();
  let inline = 0;
  for (const [subName, rawSub] of Object.entries(obj)) {
    if (rawSub == null) continue;
    ensure(isPlainObject(rawSub), "NOT_OBJECT", `${tag}.${subName}: must be object`);
    if (!isCand) ensure("value" in rawSub, "MISSING_KEY", `${tag}.${subName}: missing value`);
    const val = normalizeSingleValue(rawSub.value ?? null, `${tag}.${subName}`,
      isCand ? "BAD_CANDIDATE_VALUE" : "BAD_GOLD_VALUE");
    if (isCand && rawSub.reason === "unverified_quote") inline++;
    else vals.set(subName, val);
  }
  return { key: keyOfRecordMap(vals), subVal: vals.get(subField) ?? null, inline };
}

/** Extract verified candidate records and unverified quote counts from a candidate record field. */
export function extractCandidateRecords(raw: unknown, subField: string) {
  if (raw == null) return { items: [] as CandidateRecordItem[], dropped: 0, nulled: 0 };
  ensure(isPlainObject(raw), "NOT_OBJECT", "candidate record field must be plain object or null");
  ensure(raw.values === undefined || Array.isArray(raw.values), "NOT_ARRAY", "candidate values must be array");
  let inline = 0;
  const items = ((raw.values as unknown[] | undefined) ?? []).map((rec, idx) => {
    const got = readRecFields(rec, true, subField, `candidate.values[${idx}]`);
    inline += got.inline;
    return { ...got.key, subVal: got.subVal };
  });
  const dropped = optionalCountInt(raw.unverified_dropped, "unverified_dropped") ?? 0;
  const subNulled = optionalCountInt(raw.unverified_subfields, "unverified_subfields") ?? 0;
  return { items, dropped, nulled: Math.max(subNulled, inline) };
}

/** Align candidate records 1-to-1 against golden clusters by postal_code then street+city. */
export function alignRecordsOneToOne<Gk extends MatchRecordKey, Ck extends MatchRecordKey>(
  goldens: readonly Gk[], cands: readonly Ck[],
) {
  const streetCityOf = (rec: MatchRecordKey) => (rec.st !== null && rec.ci !== null ? `${rec.st}\0${rec.ci}` : null);
  const shared = new Set<string>();
  const seen = new Map<string, string>();
  goldens.forEach((rec, idx) => {
    if (rec.pc) seen.has(rec.pc) ? shared.add(rec.pc) : seen.set(rec.pc, `\0${idx}`);
  });
  seen.clear();
  for (const rec of cands) {
    if (!rec.pc) continue;
    const streetCity = `${rec.st ?? ""}\0${rec.ci ?? ""}`;
    if ((seen.get(rec.pc) ?? streetCity) !== streetCity) shared.add(rec.pc);
    else seen.set(rec.pc, streetCity);
  }
  const usedGold = new Set<number>();
  const usedCand = new Set<number>();
  const matched: [number, number][] = [];
  const runPass = (ok: (gold: Gk, cand: Ck) => boolean) => cands.forEach((cand, candIdx) => {
    if (usedCand.has(candIdx)) return;
    const goldIdx = goldens.findIndex((gold, idx) => !usedGold.has(idx) && ok(gold, cand));
    if (goldIdx < 0) return;
    usedGold.add(goldIdx);
    usedCand.add(candIdx);
    matched.push([goldIdx, candIdx]);
  });
  runPass((gold, cand) => !!gold.pc && gold.pc === cand.pc && streetCityOf(gold) !== null
    && streetCityOf(gold) === streetCityOf(cand));
  runPass((gold, cand) => !!gold.pc && gold.pc === cand.pc && !!gold.st && gold.st === cand.st);
  runPass((gold, cand) => streetCityOf(gold) !== null && streetCityOf(gold) === streetCityOf(cand)
    && (!gold.pc || !cand.pc || gold.pc === cand.pc));
  runPass((gold, cand) => !!gold.pc && gold.pc === cand.pc && !shared.has(gold.pc));
  return {
    matched,
    unalignedGold: goldens.map((_, idx) => idx).filter((idx) => !usedGold.has(idx)),
    unalignedCand: cands.map((_, idx) => idx).filter((idx) => !usedCand.has(idx)),
  };
}
