import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { specsOf, type Mission } from "./extract.js";
export type Verdict = "unanimous" | "majority" | "split" | "absent";
export interface ConvergeOptions { runs: string[]; mission: string; out: string }
export interface RunProv { value: unknown; quote: unknown }
export interface FieldVote { verdict: Verdict; value: unknown; runs: Record<string, RunProv> }
export interface FieldStats { counts: Record<Verdict, number>; pairwise_agreement: Record<string, number | null>; krippendorff_alpha: number | null }
type Entry = { norm: string | null; value: unknown; quote: unknown };
type StatAcc = { verdicts: Verdict[]; units: (string | null)[][] };
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const quoteOf = (v: unknown): string | null => typeof v === "string" && v.trim() ? v : null;
const cleanDigest = (v: unknown): string => String(v).replace(/^sha256:/i, "").trim().toLowerCase();
const sumSqOf = (m: Map<string, number>): number => [...m.values()].reduce((a, c) => a + c * c, 0);
const countVerdicts = (vs: Verdict[]): Record<Verdict, number> => { const c: Record<Verdict, number> = { unanimous: 0, majority: 0, split: 0, absent: 0 }; for (const v of vs) c[v]++; return c; };
export const isConvergeUsageError = (e: unknown): boolean => /mission digest mismatch|invalid mission|requires at least 2 runs|duplicate run directory|missing results\.ndjson|ENOENT/.test(String(e));
export function normalizeValue(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).normalize("NFC").trim().replace(/\s+/g, " ");
  if (!s) return null;
  const pc = s.match(/^([A-Za-z]\d[A-Za-z])[\s-]?(\d[A-Za-z]\d)$/);
  return pc ? `${pc[1]!.toUpperCase()} ${pc[2]!.toUpperCase()}` : s.toLowerCase();
}
export function krippendorffAlphaNominal(units: readonly (readonly (string | null)[])[]): number | null {
  let n = 0, doNum = 0;
  const totals = new Map<string, number>();
  for (const u of units) {
    const vals = u.filter((v): v is string => v !== null), m = vals.length;
    if (m < 2) continue;
    n += m;
    const counts = new Map<string, number>();
    for (const v of vals) { counts.set(v, (counts.get(v) ?? 0) + 1); totals.set(v, (totals.get(v) ?? 0) + 1); }
    doNum += (m * m - sumSqOf(counts)) / (m - 1);
  }
  if (n < 2) return null;
  const deNum = n * n - sumSqOf(totals);
  return deNum === 0 ? null : Number((1 - (doNum * (n - 1)) / deNum).toFixed(6));
}
function voteEntries(entries: Entry[], runNames: string[]): FieldVote {
  const runs: Record<string, RunProv> = {}, freq = new Map<string | null, number>(), raws = new Map<string, Map<string, { c: number; val: unknown }>>();
  entries.forEach((e, i) => {
    runs[runNames[i]!] = { value: e.value, quote: e.quote };
    freq.set(e.norm, (freq.get(e.norm) ?? 0) + 1);
    if (e.norm === null) return;
    let m = raws.get(e.norm); if (!m) raws.set(e.norm, (m = new Map()));
    const k = JSON.stringify(e.value); m.set(k, { c: (m.get(k)?.c ?? 0) + 1, val: e.value });
  });
  const total = entries.length;
  if ((freq.get(null) ?? 0) === total) return { verdict: "absent", value: null, runs };
  let topKey: string | null = null, topCount = 0;
  for (const [k, c] of freq) if (c > topCount) { topCount = c; topKey = k; }
  const pickRaw = (k: string): unknown => [...raws.get(k)!.values()].reduce((a, b) => b.c > a.c ? b : a).val;
  if (topCount === total) return { verdict: "unanimous", value: pickRaw(topKey!), runs };
  if (topCount > total / 2) return { verdict: "majority", value: topKey === null ? null : pickRaw(topKey), runs };
  return { verdict: "split", value: null, runs };
}
function summarize(acc: StatAcc, runNames: string[]): FieldStats {
  const pairwise_agreement: Record<string, number | null> = {};
  for (let i = 0; i < runNames.length; i++) for (let j = i + 1; j < runNames.length; j++) {
    const agree = acc.units.filter((u) => u[i] === u[j]).length;
    pairwise_agreement[`${runNames[i]}|${runNames[j]}`] = acc.units.length ? Number(((agree / acc.units.length) * 100).toFixed(4)) : null;
  }
  return { counts: countVerdicts(acc.verdicts), pairwise_agreement, krippendorff_alpha: krippendorffAlphaNominal(acc.units) };
}
function cellOf(raw: unknown, maxValues = 1): Entry {
  if (!isObj(raw)) return { norm: null, value: null, quote: null };
  if (maxValues > 1 && Array.isArray(raw.values)) {
    const items = raw.values.filter((x): x is Record<string, unknown> => isObj(x) && x.value != null);
    const norms = [...new Set(items.map((x) => normalizeValue(x.value)).filter((x): x is string => x !== null))].sort();
    return norms.length ? { norm: norms.join("\0"), value: items.map((x) => x.value), quote: items.map((x) => quoteOf(x.quote)) } : { norm: null, value: null, quote: null };
  }
  return { norm: normalizeValue(raw.value ?? null), value: raw.value ?? null, quote: quoteOf(raw.quote) };
}
export async function runConverge(opts: ConvergeOptions): Promise<{ rows: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  if (!Array.isArray(opts.runs) || opts.runs.length < 2) throw new Error("scrap converge: requires at least 2 runs");
  const canonDirs = opts.runs.map((d) => { const a = resolve(d); try { return realpathSync(a); } catch { return a; } });
  if (new Set(canonDirs).size !== canonDirs.length) throw new Error("scrap converge: duplicate run directory");
  const missionRaw = readFileSync(opts.mission), expectedDigest = createHash("sha256").update(missionRaw).digest("hex");
  let mission: Mission; try { mission = JSON.parse(missionRaw.toString("utf-8")) as Mission; } catch (e) { throw new Error(`scrap converge: invalid mission JSON: ${e instanceof Error ? e.message : String(e)}`); }
  const specs = specsOf(mission), bases = opts.runs.map((d) => basename(d.replace(/[\\/]+$/, "")) || d);
  const runNames = new Set(bases).size === bases.length ? bases : [...opts.runs];
  const allIds: string[] = [], seenIds = new Set<string>();
  const runMaps = opts.runs.map((dir) => {
    const file = join(dir, "results.ndjson");
    if (!existsSync(file)) throw new Error(`scrap converge: missing results.ndjson in ${dir}`);
    const byId = new Map<string, Record<string, unknown>>();
    for (const line of readFileSync(file, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      let r: unknown; try { r = JSON.parse(line); } catch { continue; }
      if (!isObj(r)) continue;
      if (r.type === "summary") { const md = r.mission_digest ?? r.missionDigest; if (md != null && cleanDigest(md) !== expectedDigest) throw new Error(`scrap converge: mission digest mismatch in ${dir} (expected ${expectedDigest}, got ${cleanDigest(md)})`); continue; }
      if (typeof r.id === "string") { byId.set(r.id, r); if (!seenIds.has(r.id)) { seenIds.add(r.id); allIds.push(r.id); } }
    }
    return byId;
  });
  const scalarAcc = new Map<string, StatAcc>(specs.filter((s) => s.kind !== "record").map((s) => [s.name, { verdicts: [], units: [] }]));
  const recAcc = new Map(specs.filter((s) => s.kind === "record").map((s) => [s.name, { verdicts: [] as Verdict[], aligned: 0, unmatched: 0, subs: new Map(s.subFields!.map((sf) => [sf.name, { verdicts: [] as Verdict[], units: [] as (string | null)[][] }])) }]));
  const rows = allIds.map((id) => {
    const perRun = runMaps.map((m) => m.get(id)), url = perRun.find((r) => typeof r?.url === "string")?.url, fields: Record<string, unknown> = {};
    for (const s of specs) {
      if (s.kind !== "record") {
        const entries = perRun.map((r) => cellOf(isObj(r?.fields) ? r.fields[s.name] : undefined, s.maxValues)), vote = voteEntries(entries, runNames), acc = scalarAcc.get(s.name)!;
        fields[s.name] = vote; acc.verdicts.push(vote.verdict); acc.units.push(entries.map((e) => e.norm)); continue;
      }
      type RecItem = { rec: Record<string, unknown>; pc: string | null; st: string | null; sc: string | null; hit?: boolean };
      const byRunRecs: RecItem[][] = perRun.map((r) => {
        const rf = isObj(r?.fields) ? r.fields[s.name] : undefined;
        return (isObj(rf) && Array.isArray(rf.values) ? rf.values.filter(isObj) : []).map((rec) => {
          const pc = cellOf(rec.postal_code).norm, st = cellOf(rec.street).norm, ci = cellOf(rec.city).norm;
          return { rec, pc, st, sc: st && ci ? `${st}\0${ci}` : null };
        });
      });
      const sharedPcs = new Set<string>();
      for (const recs of byRunRecs) { const seen = new Set<string>(); for (const x of recs) if (x.pc) { if (seen.has(x.pc)) sharedPcs.add(x.pc); seen.add(x.pc); } }
      const clusters: { pc: string | null; sts: Set<string>; scs: Set<string>; alignBy: "postal_code" | "street+city" | null; byRun: Map<number, Record<string, unknown>> }[] = [];
      const attach = (ri: number, x: RecItem, hit: typeof clusters[number] | undefined, by: "postal_code" | "street+city"): void => {
        if (!hit) return;
        x.hit = true; hit.byRun.set(ri, x.rec); hit.alignBy ??= by; hit.pc ??= x.pc; if (x.st) hit.sts.add(x.st); if (x.sc) hit.scs.add(x.sc);
      };
      byRunRecs.forEach((recs, ri) => {
        for (const x of recs) if (x.pc && x.st) attach(ri, x, (x.sc ? clusters.find((c) => !c.byRun.has(ri) && c.pc === x.pc && c.scs.has(x.sc!)) : undefined) ?? clusters.find((c) => !c.byRun.has(ri) && c.pc === x.pc && c.sts.has(x.st!)), "postal_code");
        for (const x of recs) if (!x.hit && x.sc) attach(ri, x, clusters.find((c) => !c.byRun.has(ri) && c.scs.has(x.sc!) && (!x.pc || !c.pc || c.pc === x.pc)), "street+city");
        for (const x of recs) if (!x.hit && x.pc && !sharedPcs.has(x.pc)) attach(ri, x, clusters.find((c) => !c.byRun.has(ri) && c.pc === x.pc), "postal_code");
        for (const x of recs) if (!x.hit) clusters.push({ pc: x.pc, sts: new Set(x.st ? [x.st] : []), scs: new Set(x.sc ? [x.sc] : []), alignBy: null, byRun: new Map([[ri, x.rec]]) });
      });
      const aligned: Record<string, unknown>[] = [], unmatched: Record<string, unknown>[] = [], rs = recAcc.get(s.name)!, nonMajRuns = new Set<number>();
      let anyMaj = false, anySplit = false;
      for (const c of clusters) {
        if (c.byRun.size <= runNames.length / 2) for (const ri of c.byRun.keys()) nonMajRuns.add(ri);
        if (c.byRun.size < 2) { const [ri, rec] = [...c.byRun.entries()][0]!; unmatched.push({ run: runNames[ri]!, fields: Object.fromEntries(s.subFields!.map((sf) => { const e = cellOf(rec[sf.name]); return [sf.name, { value: e.value, quote: e.quote }]; })) }); continue; }
        const subOut: Record<string, FieldVote> = {};
        for (const sf of s.subFields!) {
          const entries = runNames.map((_, ri) => cellOf(c.byRun.get(ri)?.[sf.name])), v = voteEntries(entries, runNames), ss = rs.subs.get(sf.name)!;
          subOut[sf.name] = v; ss.verdicts.push(v.verdict); ss.units.push(entries.map((e) => e.norm));
          if (v.verdict === "majority") anyMaj = true; else if (v.verdict === "split") anySplit = true;
        }
        const align_by = c.alignBy ?? (c.pc ? "postal_code" : "street+city");
        const align_key = align_by === "postal_code" ? (c.pc && sharedPcs.has(c.pc) && c.sts.size ? `${c.pc} | ${[...c.sts][0]}` : (c.pc ?? "")) : ([...c.scs][0] ?? "").replace("\0", " | ");
        aligned.push({ align_by, align_key, fields: subOut });
      }
      const recVerdict: Verdict = !aligned.length && !unmatched.length ? "absent" : anySplit || nonMajRuns.size >= runNames.length / 2 ? "split" : !nonMajRuns.size && !anyMaj ? "unanimous" : "majority";
      rs.verdicts.push(recVerdict); rs.aligned += aligned.length; rs.unmatched += unmatched.length;
      fields[s.name] = { verdict: recVerdict, aligned, unmatched };
    }
    return { id, ...(url ? { url } : {}), fields };
  });
  const sumFields = Object.fromEntries(specs.map((s) => s.kind !== "record" ? [s.name, summarize(scalarAcc.get(s.name)!, runNames)] : (() => { const rs = recAcc.get(s.name)!; return [s.name, { counts: countVerdicts(rs.verdicts), aligned: rs.aligned, unmatched: rs.unmatched, subfields: Object.fromEntries(s.subFields!.map((sf) => [sf.name, summarize(rs.subs.get(sf.name)!, runNames)])) }]; })()));
  const summary = { type: "summary", runs: runNames, mission_digest: expectedDigest, ids: allIds.length, fields: sumFields };
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(join(opts.out, "converge.ndjson"), `${[...rows, summary].map((r) => JSON.stringify(r)).join("\n")}\n`, "utf-8");
  console.log(`scrap converge summary: runs=${runNames.length} ids=${allIds.length} out=${join(opts.out, "converge.ndjson")}`);
  return { rows, summary };
}
