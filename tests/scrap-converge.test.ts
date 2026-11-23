import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isConvergeUsageError, krippendorffAlphaNominal, normalizeValue, runConverge } from "../src/scrap/converge.js";
import { runExtract } from "../src/scrap/extract.js";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

function writeFixture(
  missionObj: Record<string, unknown>,
  runs: Record<string, Record<string, unknown>[]>,
  opts?: { omitSummary?: boolean | string[] },
): { root: string; missionPath: string; missionDigest: string; runDirs: string[]; outDir: string } {
  const root = mkdtempSync(join(tmpdir(), "scc-"));
  const missionText = JSON.stringify(missionObj);
  const missionPath = join(root, "mission.json");
  const missionDigest = sha256(missionText);
  writeFileSync(missionPath, missionText);
  const runDirs: string[] = [];
  for (const [name, rows] of Object.entries(runs)) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    const skip = opts?.omitSummary === true || (Array.isArray(opts?.omitSummary) && opts.omitSummary.includes(name));
    const hasSum = rows.some((r) => r.type === "summary");
    const full = !skip && !hasSum ? [...rows, { type: "summary", mission_digest: missionDigest }] : rows;
    // Intentionally NO snapshots/ and NO state.jsonl: converge must never read snapshots.
    writeFileSync(join(dir, "results.ndjson"), `${full.map((r) => JSON.stringify(r)).join("\n")}\n`);
    runDirs.push(dir);
  }
  return { root, missionPath, missionDigest, runDirs, outDir: join(root, "out") };
}

const readConverge = (outDir: string): { rows: any[]; summary: any } => {
  const all = readFileSync(join(outDir, "converge.ndjson"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const summary = all.find((r) => r.type === "summary");
  const rows = all.filter((r) => r.type !== "summary");
  return { rows, summary };
};

// Independent textbook Krippendorff's alpha (nominal) via explicit ordered coder-pair coincidence matrix.
function independentAlphaNominal(units: (string | null)[][]): number | null {
  const coincidences = new Map<string, Map<string, number>>();
  const margins = new Map<string, number>();
  let totalPairable = 0;
  for (const unit of units) {
    const present = unit.filter((v): v is string => v !== null);
    const m = present.length;
    if (m < 2) continue;
    totalPairable += m;
    for (const v of present) margins.set(v, (margins.get(v) ?? 0) + 1);
    const weight = 1 / (m - 1);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        if (i === j) continue;
        const a = present[i]!, b = present[j]!;
        let row = coincidences.get(a);
        if (!row) { row = new Map(); coincidences.set(a, row); }
        row.set(b, (row.get(b) ?? 0) + weight);
      }
    }
  }
  if (totalPairable < 2) return null;
  let observedDisagree = 0;
  for (const [c, row] of coincidences) {
    for (const [k, w] of row) if (c !== k) observedDisagree += w;
  }
  const Do = observedDisagree / totalPairable;
  let expectedDisagree = 0;
  for (const [c, nc] of margins) {
    for (const [k, nk] of margins) if (c !== k) expectedDisagree += nc * nk;
  }
  const De = expectedDisagree / (totalPairable * (totalPairable - 1));
  if (De === 0) return null;
  return Number((1 - Do / De).toFixed(6));
}

async function runCli(args: string[], cwd: string): Promise<{ code: number; err: string }> {
  const { main } = await import("../src/cli.js");
  const pa = process.argv, pc = process.cwd(), pe = process.exit, ce = console.error, cl = console.log;
  let code = 0;
  const errs: string[] = [];
  console.log = (() => {}) as any;
  console.error = ((...a: unknown[]) => { errs.push(a.map(String).join(" ")); }) as any;
  (process as any).exit = ((c?: any) => { code = c ?? 0; throw new Error(`__exit__${code}`); }) as any;
  process.argv = ["node", "engram", ...args];
  process.chdir(cwd);
  try { await main(); } catch (e) { if (!String(e).includes("__exit__")) throw e; }
  finally { process.argv = pa; process.chdir(pc); process.exit = pe; console.error = ce; console.log = cl; }
  return { code, err: errs.join("\n") };
}

const fVal = (value: string | null, quote: string | null = value): { value: string | null; quote: string | null; sha256: string | null } => ({
  value, quote, sha256: quote ? "a".repeat(64) : null,
});

const OFFICES_MISSION = {
  fields: [
    "company",
    "postal_code",
    {
      name: "offices",
      kind: "record",
      max_values: 3,
      fields: [{ name: "street" }, { name: "city" }, { name: "province" }, { name: "postal_code" }],
    },
  ],
  instruction: "Extract company, primary postal code, and Canadian offices.",
};

describe("scrap converge", () => {
  it("votes 3/3 unanimous, 2/3 majority, split, all-null, and normalises NFC/spaces/case and Canadian postal codes", async () => {
    const mission = { fields: ["city", "postal_code", "phone"], instruction: "Extract." };
    const fx = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Montréal", "Office in Montréal"), postal_code: fVal("h2y1s1", "QC h2y1s1"), phone: fVal(null) } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Toronto", "Toronto ON"), postal_code: fVal("M5X 1A9", "M5X 1A9"), phone: fVal("416-555-0100", "Tel: 416-555-0100") } },
        { id: "u3", url: "http://x/3", fields: { city: fVal("Ottawa", "Ottawa"), postal_code: fVal("K1P 6L2", "K1P 6L2"), phone: fVal("613-555-0101", "613-555-0101") } },
        { id: "u4", url: "http://x/4", fields: { city: fVal(null), postal_code: fVal(null), phone: fVal(null) } },
      ],
      runB: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("  MONTRÉAL  ", "MONTRÉAL, QC"), postal_code: fVal("H2Y 1S1", "H2Y 1S1"), phone: fVal(null) } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Toronto", "Toronto"), postal_code: fVal("m5x-1a9", "m5x-1a9"), phone: fVal("416-555-0100", "416-555-0100") } },
        { id: "u3", url: "http://x/3", fields: { city: fVal("Halifax", "Halifax"), postal_code: fVal("B3J 3N4", "B3J 3N4"), phone: fVal(null) } },
        { id: "u4", url: "http://x/4", fields: { city: fVal(null), postal_code: fVal(null), phone: fVal(null) } },
      ],
      runC: [
        // NFD e + combining acute accent, double spaces, hyphenated postal code
        { id: "u1", url: "http://x/1", fields: { city: fVal("Montre\u0301al", "Montre\u0301al QC"), postal_code: fVal("H2Y-1S1", "H2Y-1S1"), phone: fVal(null) } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Vancouver", "Vancouver BC"), postal_code: fVal(null), phone: fVal(null) } },
        { id: "u3", url: "http://x/3", fields: { city: fVal("Calgary", "Calgary"), postal_code: fVal("T2P 1N2", "T2P 1N2"), phone: fVal(null) } },
        { id: "u4", url: "http://x/4", fields: { city: fVal(null), postal_code: fVal(null), phone: fVal(null) } },
      ],
    });

    expect(normalizeValue("  h2y-1s1 ")).toBe("H2Y 1S1");
    expect(normalizeValue("H2Y1S1")).toBe("H2Y 1S1");
    expect(normalizeValue("  Montre\u0301al   Nord ")).toBe("montréal nord");
    expect(normalizeValue("   ")).toBeNull();
    expect(normalizeValue(null)).toBeNull();

    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);
    expect(rows).toHaveLength(4);

    // u1: 3/3 unanimous on city (NFC+case+trim) and postal_code (A1A 1A1), all-null on phone
    expect(rows[0].fields.city).toEqual({
      verdict: "unanimous",
      value: "Montréal",
      n_answered: 3,
      n_runs: 3,
      runs: {
        runA: { value: "Montréal", quote: "Office in Montréal" },
        runB: { value: "  MONTRÉAL  ", quote: "MONTRÉAL, QC" },
        runC: { value: "Montre\u0301al", quote: "Montre\u0301al QC" },
      },
    });
    expect(rows[0].fields.postal_code).toEqual({
      verdict: "unanimous",
      value: "h2y1s1",
      n_answered: 3,
      n_runs: 3,
      runs: {
        runA: { value: "h2y1s1", quote: "QC h2y1s1" },
        runB: { value: "H2Y 1S1", quote: "H2Y 1S1" },
        runC: { value: "H2Y-1S1", quote: "H2Y-1S1" },
      },
    });
    expect(rows[0].fields.phone.verdict).toBe("absent");
    expect(rows[0].fields.phone.value).toBeNull();
    expect(rows[0].fields.phone.n_answered).toBe(3);
    expect(rows[0].fields.phone.n_runs).toBe(3);

    // u2: 2/3 majority (value vs other value on city; value vs null on postal_code & phone)
    expect(rows[1].fields.city.verdict).toBe("majority");
    expect(rows[1].fields.city.value).toBe("Toronto");
    expect(rows[1].fields.postal_code.verdict).toBe("majority");
    expect(rows[1].fields.postal_code.value).toBe("M5X 1A9");
    expect(rows[1].fields.phone.verdict).toBe("majority");
    expect(rows[1].fields.phone.value).toBe("416-555-0100");

    // u3: 3-way split on city & postal_code; 2/3 null majority on phone
    expect(rows[2].fields.city.verdict).toBe("split");
    expect(rows[2].fields.city.value).toBeNull();
    expect(rows[2].fields.postal_code.verdict).toBe("split");
    expect(rows[2].fields.postal_code.value).toBeNull();
    expect(rows[2].fields.phone.verdict).toBe("majority");
    expect(rows[2].fields.phone.value).toBeNull();

    // u4: all-null across all fields
    expect(rows[3].fields.city).toMatchObject({ verdict: "absent", value: null, n_answered: 3, n_runs: 3 });
    expect(rows[3].fields.postal_code).toMatchObject({ verdict: "absent", value: null, n_answered: 3, n_runs: 3 });
    expect(rows[3].fields.phone).toMatchObject({ verdict: "absent", value: null, n_answered: 3, n_runs: 3 });

    // Summary counts & pairwise percent agreement
    expect(summary.type).toBe("summary");
    expect(summary.ids).toBe(4);
    expect(summary.runs).toEqual(["runA", "runB", "runC"]);
    expect(summary.allow_missing_digest).toBe(false);
    expect(summary.missing_digest_runs).toEqual([]);
    expect(summary.run_stats).toEqual({
      runA: { answered: 4, failed: 0, failed_by_code: {}, missing: 0 },
      runB: { answered: 4, failed: 0, failed_by_code: {}, missing: 0 },
      runC: { answered: 4, failed: 0, failed_by_code: {}, missing: 0 },
    });
    expect(summary.fields.city.counts).toEqual({ unanimous: 1, majority: 1, split: 1, absent: 1, insufficient: 0 });
    expect(summary.fields.postal_code.counts).toEqual({ unanimous: 1, majority: 1, split: 1, absent: 1, insufficient: 0 });
    expect(summary.fields.phone.counts).toEqual({ unanimous: 0, majority: 2, split: 0, absent: 2, insufficient: 0 });
    // city pairwise: A|B agree on u1,u2,u4 (3/4=75%); A|C on u1,u4 (2/4=50%); B|C on u1,u4 (2/4=50%)
    expect(summary.fields.city.pairwise_agreement).toEqual({ "runA|runB": 75, "runA|runC": 50, "runB|runC": 50 });
    // phone: true null stays a category -> n=12, margins N=9 P1=2 P2=1, Do_num=4, De_num=58 -> 1 - 44/58 = 7/29
    expect(summary.fields.phone.krippendorff_alpha).toBe(Number((7 / 29).toFixed(6)));
    expect(summary.fields.phone.alpha_excluded_units).toBe(0);
  });

  it("aligns record fields by postal_code else street+city, votes per sub-field, and reports unmatched records with their run", async () => {
    const office = (street: string | null, city: string | null, province: string | null, postal_code: string | null) => ({
      street: fVal(street),
      city: fVal(city),
      province: fVal(province),
      postal_code: fVal(postal_code),
    });
    const fx = writeFixture(OFFICES_MISSION, {
      runA: [
        {
          id: "co1",
          url: "http://x/co1",
          fields: {
            company: fVal("Acme Canada Inc."),
            postal_code: fVal("M5X 1A9"),
            offices: {
              values: [
                // Matches across runs by normalised postal_code despite differing street formatting & order
                office("100 King St W", "Toronto", "ON", "m5x1a9"),
                // No postal_code -> matches across runs by street+city
                office("500 Rue Saint-Jacques", "Montréal", "QC", null),
                // Only in runA -> unmatched
                office("1801 Hollis St", "Halifax", "NS", "B3J 3N4"),
              ],
              unverified_dropped: 0,
              unverified_subfields: 0,
            },
          },
        },
        {
          id: "co2",
          url: "http://x/co2",
          fields: {
            company: fVal("Empty Corp"),
            postal_code: fVal(null),
            offices: { values: [], unverified_dropped: 0, unverified_subfields: 0 },
          },
        },
      ],
      runB: [
        {
          id: "co1",
          url: "http://x/co1",
          fields: {
            company: fVal("Acme Canada Inc."),
            postal_code: fVal("M5X 1A9"),
            offices: {
              values: [
                // Reversed order, street+city match with NFC/case difference
                office("500  rue saint-jacques", "Montre\u0301al", "QC", null),
                // Postal code match with canonical spacing
                office("100 King St W", "Toronto", "ON", "M5X 1A9"),
                // Missing both postal_code and street -> cannot align -> unmatched
                office(null, "Winnipeg", "MB", null),
              ],
              unverified_dropped: 0,
              unverified_subfields: 0,
            },
          },
        },
        {
          id: "co2",
          url: "http://x/co2",
          fields: {
            company: fVal("Empty Corp"),
            postal_code: fVal(null),
            offices: { values: [], unverified_dropped: 0, unverified_subfields: 0 },
          },
        },
      ],
      runC: [
        {
          id: "co1",
          url: "http://x/co1",
          fields: {
            company: fVal("Acme Canada Inc."),
            postal_code: fVal("M5X-1A9"),
            offices: {
              values: [
                // Matches Toronto by postal_code even with different street spelling
                office("100 King Street West", "Toronto", "ON", "M5X-1A9"),
                // Missed Montreal entirely -> Montreal aligns across A+B (2/3 majority)
              ],
              unverified_dropped: 0,
              unverified_subfields: 0,
            },
          },
        },
        {
          id: "co2",
          url: "http://x/co2",
          fields: {
            company: fVal("Empty Corp"),
            postal_code: fVal(null),
            offices: { values: [], unverified_dropped: 0, unverified_subfields: 0 },
          },
        },
      ],
    });

    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);

    const co1Offices = rows[0].fields.offices;
    expect(co1Offices.aligned).toHaveLength(2);
    // Cluster 0: Toronto aligned by postal_code
    expect(co1Offices.aligned[0].align_by).toBe("postal_code");
    expect(co1Offices.aligned[0].align_key).toBe("M5X 1A9");
    expect(co1Offices.aligned[0].fields.postal_code).toMatchObject({ verdict: "unanimous" });
    expect(co1Offices.aligned[0].fields.city).toMatchObject({ verdict: "unanimous", value: "Toronto" });
    expect(co1Offices.aligned[0].fields.street).toMatchObject({ verdict: "majority", value: "100 King St W" });
    expect(co1Offices.aligned[0].fields.street.runs.runC).toEqual({ value: "100 King Street West", quote: "100 King Street West" });

    // Cluster 1: Montreal aligned by street+city (present in A & B, absent in C -> 2/3 majority)
    expect(co1Offices.aligned[1].align_by).toBe("street+city");
    expect(co1Offices.aligned[1].fields.city).toMatchObject({ verdict: "majority", value: "Montréal" });
    expect(co1Offices.aligned[1].fields.city.runs.runC).toEqual({ value: null, quote: null });
    expect(co1Offices.aligned[1].fields.province).toMatchObject({ verdict: "majority", value: "QC" });
    expect(co1Offices.aligned[1].fields.postal_code).toMatchObject({ verdict: "absent", value: null });

    // Unmatched: Halifax from runA, Winnipeg (missing street & postal_code) from runB
    expect(co1Offices.unmatched).toHaveLength(2);
    expect(co1Offices.unmatched.map((u: any) => [u.run, u.fields.city.value])).toEqual([
      ["runA", "Halifax"],
      ["runB", "Winnipeg"],
    ]);

    // co2: all runs had [] -> absent
    expect(rows[1].fields.offices).toEqual({ verdict: "absent", n_answered: 3, n_runs: 3, aligned: [], unmatched: [] });

    // Summary stats for record field and its subfields
    expect(summary.fields.offices.unmatched).toBe(2);
    expect(summary.fields.offices.counts.absent).toBe(1);
    expect(summary.fields.offices.subfields.city.counts).toEqual({ unanimous: 1, majority: 1, split: 0, absent: 0, insufficient: 0 });
    // Cluster 0: [Toronto, Toronto, Toronto]; Cluster 1: [Montréal, Montréal, NULL(runC missed)] -> n=6, Do_num=2, De_num=22 -> 1 - 10/22 = 6/11
    expect(summary.fields.offices.subfields.city.krippendorff_alpha).toBe(Number((6 / 11).toFixed(6)));
  });

  it("computes Krippendorff's alpha (nominal) matching independent textbook calculation on known tables", async () => {
    // 1. Krippendorff (2011) canonical 4-observer x 12-unit nominal table (includes missing values & 1-value unit 12).
    const k2011: (string | null)[][] = [
      ["1", "1", null, "1"],
      ["2", "2", "3", "2"],
      ["3", "3", "3", "3"],
      ["3", "3", "3", "3"],
      ["2", "2", "2", "2"],
      ["1", "2", "3", "4"],
      ["4", "4", "4", "4"],
      ["1", "1", "2", "1"],
      ["2", "2", "2", "2"],
      [null, "5", "5", "5"],
      [null, null, "1", "1"],
      [null, "3", null, null],
    ];
    const expected2011 = independentAlphaNominal(k2011);
    expect(expected2011).toBe(Number((113 / 152).toFixed(6)));
    expect(krippendorffAlphaNominal(k2011)).toBe(expected2011);

    // 2. End-to-end through runConverge on a small 3-run x 6-id table with missing values and <2-value rows.
    const table: (string | null)[][] = [
      ["ON", "ON", "ON"],     // unanimous
      ["QC", "QC", "QC"],     // unanimous
      ["BC", "BC", "AB"],     // 2/3 majority
      ["ON", "QC", null],     // 2 values disagree, 1 null
      ["AB", null, null],     // only 1 run has a value -> excluded from alpha
      [null, null, null],     // all null -> excluded from alpha
    ];
    const runNames = ["r1", "r2", "r3"];
    const runs: Record<string, Record<string, unknown>[]> = {};
    for (let r = 0; r < 3; r++) {
      runs[runNames[r]!] = table.map((row, idx) => ({
        id: `s${idx + 1}`,
        url: `http://x/${idx + 1}`,
        fields: { province: fVal(row[r]!) },
      }));
    }
    const fx = writeFixture({ fields: ["province"], instruction: "Extract province." }, runs);
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { summary } = readConverge(fx.outDir);
    // All 3 runs answered on all 6 ids: true null stays a nominal category (not missing data).
    const expectedSmall = independentAlphaNominal(table.map((row) => row.map((v) => (v === null ? "__NULL__" : normalizeValue(v)!))));
    expect(expectedSmall).not.toBeNull();
    expect(summary.fields.province.krippendorff_alpha).toBe(expectedSmall);
    expect(summary.fields.province.alpha_excluded_units).toBe(0);

    // 3. All-null field -> alpha is null.
    expect(krippendorffAlphaNominal([[null, null], [null, null]])).toBeNull();
    // 4. Only 1 run has a value per unit -> alpha is null.
    expect(krippendorffAlphaNominal([["ON", null, null], [null, "QC", null]])).toBeNull();
  });

  it("ignores type:'summary' rows (including multiple retry summaries) and uses latest row per id", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const fx = writeFixture(mission, {
      runA: [
        { id: "x1", url: "http://x/1", error: "llm_error", error_detail: "500", fields: null },
        { type: "summary", ok: 0, failed: 1, calls_total: 1, mission_digest: digest },
        { id: "x1", url: "http://x/1", fields: { city: fVal("Ottawa", "Ottawa, ON") } },
        { type: "summary", ok: 1, failed: 0, calls_total: 1, mission_digest: digest },
      ],
      runB: [
        { id: "x1", url: "http://x/1", fields: { city: fVal("Ottawa", "Ottawa") } },
        { type: "summary", ok: 1, failed: 0, calls_total: 1, mission_digest: digest },
      ],
    });

    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("x1");
    expect(rows[0].fields.city.verdict).toBe("unanimous");
    expect(rows[0].fields.city.value).toBe("Ottawa");
    expect(summary.ids).toBe(1);
    expect(summary.mission_digest).toBe(digest);
  });

  it("refuses runs whose summary reports a different mission digest (exit 2) and verifies end-to-end with runExtract", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const goodDigest = sha256(JSON.stringify(mission));
    const badDigest = sha256(JSON.stringify({ fields: ["city"], instruction: "Different instruction." }));
    const fx = writeFixture(mission, {
      runA: [
        { id: "a1", url: "http://x/1", fields: { city: fVal("Toronto") } },
        { type: "summary", ok: 1, failed: 0, calls_total: 1, mission_digest: goodDigest },
      ],
      runB: [
        { id: "a1", url: "http://x/1", fields: { city: fVal("Toronto") } },
        { type: "summary", ok: 1, failed: 0, calls_total: 1, mission_digest: badDigest },
      ],
    });

    let err: unknown;
    try { await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir }); } catch (e) { err = e; }
    expect(String(err)).toMatch(/mission digest mismatch/);
    expect(isConvergeUsageError(err)).toBe(true);

    // CLI exits 2 on mission digest mismatch and on bad usage (<2 runs)
    const cliMismatch = await runCli(["scrap", "converge", "--runs", ...fx.runDirs, "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(cliMismatch.code).toBe(2);
    expect(cliMismatch.err).toMatch(/mission digest mismatch/);

    const cliTooFew = await runCli(["scrap", "converge", "--runs", fx.runDirs[0]!, "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(cliTooFew.code).toBe(2);

    // End-to-end: runExtract emits mission_digest in summary; converge accepts matching mission (exit 0) and rejects altered mission (exit 2).
    const e2e = mkdtempSync(join(tmpdir(), "scc-e2e-"));
    const html = "<html><body><p>Office in Quebec City, QC.</p></body></html>";
    const hSha = sha256(html);
    const mPath = join(e2e, "mission.json");
    const mOtherPath = join(e2e, "mission-other.json");
    writeFileSync(mPath, JSON.stringify({ fields: ["city"], instruction: "Extract city." }));
    writeFileSync(mOtherPath, JSON.stringify({ fields: ["city"], instruction: "Extract province instead." }));
    const stub = {
      generateJson: async (input: any) => {
        await input.validateResponse?.(JSON.stringify({ city: { value: "Quebec City", quote: "Quebec City" } }));
        return { audit: { usage: { input: 10, output: 5 } } };
      },
    };
    const dirs: string[] = [];
    for (const tag of ["a", "b"]) {
      const d = join(e2e, tag);
      mkdirSync(join(d, "snapshots"), { recursive: true });
      writeFileSync(join(d, "snapshots", `${hSha}.html`), html);
      writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "q1", url: "http://x/q1", status: "ok", pages: [{ url: "http://x/q1", final_url: "http://x/q1", status: 200, bytes: html.length, sha256: hSha }] })}\n`);
      const origLog = console.log; console.log = () => {};
      try { await runExtract({ out: d, mission: mPath, model: "openai:gpt-5-mini" }, stub); } finally { console.log = origLog; }
      dirs.push(d);
    }
    const okRes = await runCli(["scrap", "converge", "--runs", dirs[0]!, dirs[1]!, "--mission", mPath, "--out", join(e2e, "conv-ok")], e2e);
    expect(okRes.code).toBe(0);
    expect(readConverge(join(e2e, "conv-ok")).rows[0].fields.city.verdict).toBe("unanimous");

    const badRes = await runCli(["scrap", "converge", "--runs", dirs[0]!, dirs[1]!, "--mission", mOtherPath, "--out", join(e2e, "conv-bad")], e2e);
    expect(badRes.code).toBe(2);
  });

  it("handles cross-run postal_code + street+city fallback, prevents conflicting postal_code merges, and handles 2-run splits", async () => {
    const office = (street: string | null, city: string | null, province: string | null, postal_code: string | null) => ({
      street: fVal(street), city: fVal(city), province: fVal(province), postal_code: fVal(postal_code),
    });
    const fx = writeFixture(OFFICES_MISSION, {
      runA: [{
        id: "x1", url: "http://x/x1",
        fields: {
          company: fVal("North Co"),
          postal_code: fVal("K1P 6L2"),
          offices: {
            values: [
              // Same street+city as runB, but runB has postal_code=null -> should align by street+city
              office("50 O'Connor St", "Ottawa", "ON", "K1P 6L2"),
              // Different postal_code at same street+city as runB's second record -> must NOT merge
              office("100 Main St", "Calgary", "AB", "T2P 1N2"),
            ],
          },
        },
      }],
      runB: [{
        id: "x1", url: "http://x/x1",
        fields: {
          company: fVal("South Co"),
          postal_code: fVal(null),
          offices: {
            values: [
              office("50 O'Connor St", "Ottawa", "ON", null),
              office("100 Main St", "Calgary", "AB", "T2P 9Z9"),
            ],
          },
        },
      }],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows } = readConverge(fx.outDir);
    // 2-run disagreements -> split
    expect(rows[0].fields.company).toMatchObject({ verdict: "split", value: null });
    expect(rows[0].fields.postal_code).toMatchObject({ verdict: "split", value: null });
    // Ottawa aligned across A (has postal_code) and B (postal_code null) via street+city
    expect(rows[0].fields.offices.aligned).toHaveLength(1);
    expect(rows[0].fields.offices.aligned[0].align_by).toBe("street+city");
    expect(rows[0].fields.offices.aligned[0].fields.city).toMatchObject({ verdict: "unanimous", value: "Ottawa" });
    expect(rows[0].fields.offices.aligned[0].fields.postal_code).toMatchObject({ verdict: "split", value: null });
    // Conflicting Calgary postal codes stayed unmatched
    expect(rows[0].fields.offices.unmatched).toHaveLength(2);
    expect(rows[0].fields.offices.unmatched.map((u: any) => [u.run, u.fields.postal_code.value])).toEqual([
      ["runA", "T2P 1N2"],
      ["runB", "T2P 9Z9"],
    ]);
  });

  it("aligns records sharing a postal code by postal_code + street (then street + city) and never cross-pairs", async () => {
    const office = (street: string | null, city: string | null, province: string | null, postal_code: string | null) => ({
      street: fVal(street), city: fVal(city), province: fVal(province), postal_code: fVal(postal_code),
    });
    const fx = writeFixture(OFFICES_MISSION, {
      runA: [
        {
          id: "co1", url: "http://x/co1",
          fields: {
            company: fVal("Shared PC Co"), postal_code: fVal("M5X 1A9"),
            offices: {
              values: [
                office("100 King St", "Toronto", "ON", "M5X 1A9"),
                office("200 Bay St", "Toronto", "ON", "M5X 1A9"),
              ],
            },
          },
        },
        {
          id: "co2", url: "http://x/co2",
          fields: {
            company: fVal("Mixed Shared PC Co"), postal_code: fVal("M5X 1A9"),
            offices: {
              values: [
                // Missing city in runA -> must still match runB by postal_code + street
                office("100 King St", null, "ON", "M5X 1A9"),
                // Present with postal_code in runA, missing postal_code in runB -> fallback street + city
                office("200 Bay St", "Toronto", "ON", "M5X 1A9"),
                // Distinct street at same shared postal_code -> must never cross-pair with runB's 400 Yonge St
                office("300 Queen St", "Toronto", "ON", "M5X 1A9"),
              ],
            },
          },
        },
        {
          id: "co3", url: "http://x/co3",
          fields: {
            company: fVal("Asymmetric Co"), postal_code: fVal("M5X 1A9"),
            offices: { values: [office("100 King St", "Toronto", "ON", "M5X 1A9")] },
          },
        },
      ],
      runB: [
        {
          id: "co1", url: "http://x/co1",
          fields: {
            company: fVal("Shared PC Co"), postal_code: fVal("M5X 1A9"),
            offices: {
              // Opposite array order for two offices sharing M5X 1A9
              values: [
                office("200 Bay St", "Toronto", "ON", "m5x-1a9"),
                office("100 King St", "Toronto", "ON", "M5X1A9"),
              ],
            },
          },
        },
        {
          id: "co2", url: "http://x/co2",
          fields: {
            company: fVal("Mixed Shared PC Co"), postal_code: fVal("M5X 1A9"),
            offices: {
              values: [
                office("200 Bay St", "Toronto", "ON", null),
                office("400 Yonge St", "Toronto", "ON", "M5X 1A9"),
                office("100 King St", "Toronto", "ON", "M5X 1A9"),
              ],
            },
          },
        },
        {
          id: "co3", url: "http://x/co3",
          fields: {
            company: fVal("Asymmetric Co"), postal_code: fVal("M5X 1A9"),
            offices: {
              // 200 Bay St appears before 100 King St -> must not steal runA's 100 King St cluster
              values: [
                office("200 Bay St", "Toronto", "ON", "M5X 1A9"),
                office("100 King St", "Toronto", "ON", "M5X 1A9"),
              ],
            },
          },
        },
      ],
    });

    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows } = readConverge(fx.outDir);

    // co1: both offices aligned cleanly with zero cross-pairing
    const co1 = rows[0].fields.offices;
    expect(co1.verdict).toBe("unanimous");
    expect(co1.unmatched).toHaveLength(0);
    expect(co1.aligned).toHaveLength(2);
    expect(co1.aligned[0].fields.street).toMatchObject({ verdict: "unanimous", value: "100 King St" });
    expect(co1.aligned[0].fields.postal_code).toMatchObject({ verdict: "unanimous" });
    expect(co1.aligned[1].fields.street).toMatchObject({ verdict: "unanimous", value: "200 Bay St" });
    expect(co1.aligned[1].fields.postal_code).toMatchObject({ verdict: "unanimous" });

    // co2: 100 King St via postal_code+street (despite null city in runA), 200 Bay St via street+city, 300 Queen & 400 Yonge stay unmatched
    const co2 = rows[1].fields.offices;
    expect(co2.aligned).toHaveLength(2);
    expect(co2.aligned[0].align_by).toBe("postal_code");
    expect(co2.aligned[0].fields.street).toMatchObject({ verdict: "unanimous", value: "100 King St" });
    expect(co2.aligned[1].align_by).toBe("street+city");
    expect(co2.aligned[1].fields.street).toMatchObject({ verdict: "unanimous", value: "200 Bay St" });
    expect(co2.unmatched.map((u: any) => [u.run, u.fields.street.value])).toEqual([
      ["runA", "300 Queen St"],
      ["runB", "400 Yonge St"],
    ]);

    // co3: 100 King St matches cleanly; leading 200 Bay St in runB stays unmatched
    const co3 = rows[2].fields.offices;
    expect(co3.aligned).toHaveLength(1);
    expect(co3.aligned[0].fields.street).toMatchObject({ verdict: "unanimous", value: "100 King St" });
    expect(co3.unmatched.map((u: any) => [u.run, u.fields.street.value])).toEqual([["runB", "200 Bay St"]]);
  });

  it("rejects duplicate run directories (same path, relative alias, trailing slash, symlink) with exit 2", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const fx = writeFixture(mission, {
      runA: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      runB: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
    });
    const linkA = join(fx.root, "runA-link");
    symlinkSync(fx.runDirs[0]!, linkA);

    let err: unknown;
    try { await runConverge({ runs: [fx.runDirs[0]!, fx.runDirs[0]!], mission: fx.missionPath, out: fx.outDir }); } catch (e) { err = e; }
    expect(String(err)).toMatch(/duplicate run directory/);
    expect(isConvergeUsageError(err)).toBe(true);

    const samePath = await runCli(["scrap", "converge", "--runs", fx.runDirs[0]!, fx.runDirs[0]!, "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(samePath.code).toBe(2);
    expect(samePath.err).toMatch(/duplicate run directory/);

    const relAlias = await runCli(["scrap", "converge", "--runs", "./runA", "runA", "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(relAlias.code).toBe(2);
    expect(relAlias.err).toMatch(/duplicate run directory/);

    const trailingSlash = await runCli(["scrap", "converge", "--runs", fx.runDirs[0]!, `${fx.runDirs[0]!}/`, "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(trailingSlash.code).toBe(2);

    const symlinkAlias = await runCli(["scrap", "converge", "--runs", fx.runDirs[0]!, linkA, "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(symlinkAlias.code).toBe(2);

    const threeWithDup = await runCli(["scrap", "converge", "--runs", fx.runDirs[0]!, fx.runDirs[1]!, "./runA", "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(threeWithDup.code).toBe(2);

    // Distinct directories sharing a basename are still accepted
    const d1 = join(fx.root, "a", "same"), d2 = join(fx.root, "b", "same");
    mkdirSync(d1, { recursive: true }); mkdirSync(d2, { recursive: true });
    const sumLine = JSON.stringify({ type: "summary", mission_digest: fx.missionDigest });
    writeFileSync(join(d1, "results.ndjson"), `${JSON.stringify({ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } })}\n${sumLine}\n`);
    writeFileSync(join(d2, "results.ndjson"), `${JSON.stringify({ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } })}\n${sumLine}\n`);
    const distinctSameBase = await runCli(["scrap", "converge", "--runs", d1, d2, "--mission", fx.missionPath, "--out", join(fx.root, "out-same-base")], fx.root);
    expect(distinctSameBase.code).toBe(0);
    expect(readConverge(join(fx.root, "out-same-base")).summary.runs).toEqual([d1, d2]);
  });

  it("computes record-level verdict from presence across all runs (1/3 empty-majority, extra unmatched in 3 runs -> split)", async () => {
    const office = (street: string | null, city: string | null, province: string | null, postal_code: string | null) => ({
      street: fVal(street), city: fVal(city), province: fVal(province), postal_code: fVal(postal_code),
    });
    const row = (id: string, values: Record<string, unknown>[]) => ({
      id, url: `http://x/${id}`,
      fields: { company: fVal("Co"), postal_code: fVal(null), offices: { values } },
    });
    const toronto = office("100 King St", "Toronto", "ON", "M5X 1A9");
    const halifax = office("1801 Hollis St", "Halifax", "NS", "B3J 3N4");
    const winnipeg = office("201 Portage Ave", "Winnipeg", "MB", "R3B 3K6");
    const regina = office("1800 Hamilton St", "Regina", "SK", "S4P 4B5");

    const fx3 = writeFixture(OFFICES_MISSION, {
      runA: [
        row("r1_one_of_three", [halifax]),
        row("r2_one_run_two_extra", [halifax, winnipeg]),
        row("r3_two_unmatched_one_empty", [halifax]),
        row("r4_aligned_plus_one_extra", [toronto, halifax]),
        row("r5_aligned_plus_two_extra", [toronto, halifax]),
        row("r6_aligned_plus_three_extra", [toronto, halifax]),
      ],
      runB: [
        row("r1_one_of_three", []),
        row("r2_one_run_two_extra", []),
        row("r3_two_unmatched_one_empty", [winnipeg]),
        row("r4_aligned_plus_one_extra", [toronto]),
        row("r5_aligned_plus_two_extra", [toronto, winnipeg]),
        row("r6_aligned_plus_three_extra", [toronto, winnipeg]),
      ],
      runC: [
        row("r1_one_of_three", []),
        row("r2_one_run_two_extra", []),
        row("r3_two_unmatched_one_empty", []),
        row("r4_aligned_plus_one_extra", [toronto]),
        row("r5_aligned_plus_two_extra", [toronto]),
        row("r6_aligned_plus_three_extra", [toronto, regina]),
      ],
    });
    await runConverge({ runs: fx3.runDirs, mission: fx3.missionPath, out: fx3.outDir });
    const { rows: rows3, summary: sum3 } = readConverge(fx3.outDir);
    const byId = Object.fromEntries(rows3.map((r) => [r.id, r.fields.offices.verdict]));
    // 1/3 present (2/3 empty) -> empty-majority ("majority"), not "split"
    expect(byId.r1_one_of_three).toBe("majority");
    expect(byId.r2_one_run_two_extra).toBe("majority");
    // 2/3 distinct unmatched -> no majority -> "split"
    expect(byId.r3_two_unmatched_one_empty).toBe("split");
    // Aligned unanimous + 1/3 run with extra unmatched -> 2/3 agree -> "majority"
    expect(byId.r4_aligned_plus_one_extra).toBe("majority");
    // Aligned unanimous + 2/3 or 3/3 runs with extra unmatched -> not majority -> "split"
    expect(byId.r5_aligned_plus_two_extra).toBe("split");
    expect(byId.r6_aligned_plus_three_extra).toBe("split");
    expect(sum3.fields.offices.counts).toEqual({ unanimous: 0, majority: 3, split: 3, absent: 0, insufficient: 0 });

    // 2-run boundary: 1/2 present or 1/2 extra unmatched is a 50/50 split (no strict majority)
    const fx2 = writeFixture(OFFICES_MISSION, {
      runA: [row("two_one_present", [halifax]), row("two_one_extra", [toronto, halifax])],
      runB: [row("two_one_present", []), row("two_one_extra", [toronto])],
    });
    await runConverge({ runs: fx2.runDirs, mission: fx2.missionPath, out: fx2.outDir });
    const { rows: rows2 } = readConverge(fx2.outDir);
    expect(rows2[0].fields.offices.verdict).toBe("split");
    expect(rows2[1].fields.offices.verdict).toBe("split");
  });

  // --- Abstention, failure, missing-id, alpha, record-presence & missing-digest tests ---

  it("excludes a failed run in 3 so 2 answering runs vote 2-of-2 with n_answered=2 and failed provenance (kills mutants: failed-as-null, n_answered-equals-n_runs)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const fx = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Montréal") } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } },
        { id: "u3", url: "http://x/3", fields: { city: fVal(null) } },
        { id: "u4", url: "http://x/4", fields: { city: fVal("Ottawa") } },
      ],
      runB: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Montréal") } },
        { id: "u2", url: "http://x/2", fields: { city: fVal(null) } },
        { id: "u3", url: "http://x/3", fields: { city: fVal(null) } },
        { id: "u4", url: "http://x/4", fields: { city: fVal("Ottawa") } },
      ],
      runC: [
        { id: "u1", url: "http://x/1", error: "llm_error", error_detail: "503", fields: null },
        { id: "u2", url: "http://x/2", error: "parse_error", error_detail: "bad json", fields: null },
        { id: "u3", url: "http://x/3", error: "empty_response", error_detail: "empty", fields: null },
        { id: "u4", url: "http://x/4", fields: { city: fVal("Ottawa") } },
      ],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);

    // u1: 2 of 2 answered "Montréal" (never shown as 3 of 3; runC has status/error and NO value/quote)
    expect(rows[0].fields.city).toEqual({
      verdict: "unanimous",
      value: "Montréal",
      n_answered: 2,
      n_runs: 3,
      runs: {
        runA: { value: "Montréal", quote: "Montréal" },
        runB: { value: "Montréal", quote: "Montréal" },
        runC: { status: "failed", error: "llm_error" },
      },
    });
    expect("value" in rows[0].fields.city.runs.runC).toBe(false);
    expect("quote" in rows[0].fields.city.runs.runC).toBe(false);

    // u2: A="Toronto", B=null, C=failed -> 1 vs 1 split (NOT 2/3 null-majority!)
    expect(rows[1].fields.city).toMatchObject({ verdict: "split", value: null, n_answered: 2, n_runs: 3 });
    expect(rows[1].fields.city.runs.runC).toEqual({ status: "failed", error: "parse_error" });

    // u3: A=null, B=null, C=failed -> absent over 2 of 2 answered (n_answered=2, n_runs=3)
    expect(rows[2].fields.city).toMatchObject({ verdict: "absent", value: null, n_answered: 2, n_runs: 3 });
    expect(rows[2].fields.city.runs.runC).toEqual({ status: "failed", error: "empty_response" });

    // u4: all 3 answered
    expect(rows[3].fields.city).toMatchObject({ verdict: "unanimous", value: "Ottawa", n_answered: 3, n_runs: 3 });

    expect(summary.fields.city.counts).toEqual({ unanimous: 2, majority: 0, split: 1, absent: 1, insufficient: 0 });
    expect(summary.run_stats).toEqual({
      runA: { answered: 4, failed: 0, failed_by_code: {}, missing: 0 },
      runB: { answered: 4, failed: 0, failed_by_code: {}, missing: 0 },
      runC: { answered: 1, failed: 3, failed_by_code: { empty_response: 1, llm_error: 1, parse_error: 1 }, missing: 0 },
    });
  });

  it("marks <2 answering runs in 2 runs as insufficient with value null (kills mutants: min-answering-threshold-1, failed-equals-failed-pairwise)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const fx = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Quebec City") } },
        { id: "u2", url: "http://x/2", fields: { city: fVal(null) } },
        { id: "u3", url: "http://x/3", error: "llm_error", error_detail: "timeout", fields: null },
      ],
      runB: [
        { id: "u1", url: "http://x/1", error: "missing_credentials", error_detail: "no key", fields: null },
        { id: "u2", url: "http://x/2", error: "write_error", error_detail: "enoent", fields: null },
        { id: "u3", url: "http://x/3", error: "parse_error", error_detail: "bad", fields: null },
      ],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);

    expect(rows[0].fields.city).toEqual({
      verdict: "insufficient",
      value: null,
      n_answered: 1,
      n_runs: 2,
      runs: {
        runA: { value: "Quebec City", quote: "Quebec City" },
        runB: { status: "failed", error: "missing_credentials" },
      },
    });
    expect(rows[1].fields.city).toMatchObject({ verdict: "insufficient", value: null, n_answered: 1, n_runs: 2 });
    expect(rows[2].fields.city).toMatchObject({ verdict: "insufficient", value: null, n_answered: 0, n_runs: 2 });
    expect(summary.fields.city.counts).toEqual({ unanimous: 0, majority: 0, split: 0, absent: 0, insufficient: 3 });
    expect(summary.fields.city.alpha_excluded_units).toBe(3);
    expect(summary.fields.city.krippendorff_alpha).toBeNull();
    expect(summary.fields.city.pairwise_agreement).toEqual({ "runA|runB": null });
  });

  it("classifies an id absent from a run as missing with no fake null and counts run_stats.missing (kills mutants: missing-id-as-null, missing-classified-as-failed)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const fx = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Halifax") } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Victoria") } },
      ],
      runB: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Halifax") } },
      ],
      runC: [],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);

    expect(rows[0].fields.city).toEqual({
      verdict: "unanimous",
      value: "Halifax",
      n_answered: 2,
      n_runs: 3,
      runs: {
        runA: { value: "Halifax", quote: "Halifax" },
        runB: { value: "Halifax", quote: "Halifax" },
        runC: { status: "missing" },
      },
    });
    expect("value" in rows[0].fields.city.runs.runC).toBe(false);
    expect("error" in rows[0].fields.city.runs.runC).toBe(false);
    expect(rows[1].fields.city).toMatchObject({ verdict: "insufficient", value: null, n_answered: 1, n_runs: 3 });
    expect(rows[1].fields.city.runs.runB).toEqual({ status: "missing" });
    expect(rows[1].fields.city.runs.runC).toEqual({ status: "missing" });
    expect(summary.run_stats).toEqual({
      runA: { answered: 2, failed: 0, failed_by_code: {}, missing: 0 },
      runB: { answered: 1, failed: 0, failed_by_code: {}, missing: 1 },
      runC: { answered: 0, failed: 0, failed_by_code: {}, missing: 2 },
    });
  });

  it("follows extract.ts:118-124 last-row-wins semantics: error->ok is answered, ok->error is failed (kills mutants: first-row-wins, sticky-ok-row)", async () => {
    // src/scrap/extract.ts:118-124 scans results.ndjson sequentially and overwrites
    // lastErr.set(r.id, r.error == null ? null : String(r.error)), so the last row per id
    // defines the authoritative state (both for --retry-failed recovery and for a trailing error).
    const mission = { fields: ["city"], instruction: "Extract city." };
    const fx = writeFixture(mission, {
      runA: [
        { id: "u_retry_ok", url: "http://x/1", error: "llm_error", error_detail: "500", fields: null },
        { id: "u_retry_ok", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { id: "u_ok_then_err", url: "http://x/2", fields: { city: fVal("Toronto") } },
        { id: "u_ok_then_err", url: "http://x/2", error: "parse_error", error_detail: "truncated", fields: null },
      ],
      runB: [
        { id: "u_retry_ok", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { id: "u_ok_then_err", url: "http://x/2", fields: { city: fVal("Toronto") } },
      ],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);

    expect(rows[0].fields.city).toMatchObject({ verdict: "unanimous", value: "Ottawa", n_answered: 2, n_runs: 2 });
    expect(rows[0].fields.city.runs.runA).toEqual({ value: "Ottawa", quote: "Ottawa" });
    expect(rows[1].fields.city).toMatchObject({ verdict: "insufficient", value: null, n_answered: 1, n_runs: 2 });
    expect(rows[1].fields.city.runs.runA).toEqual({ status: "failed", error: "parse_error" });
    expect(summary.run_stats).toEqual({
      runA: { answered: 1, failed: 1, failed_by_code: { parse_error: 1 }, missing: 0 },
      runB: { answered: 2, failed: 0, failed_by_code: {}, missing: 0 },
    });
  });

  it("keeps true null 3/3 as absent and as a nominal category in alpha (kills mutant: true-null-as-missing)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const fx = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal(null) } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Montréal") } },
        { id: "u3", url: "http://x/3", fields: { city: fVal(null) } },
      ],
      runB: [
        { id: "u1", url: "http://x/1", fields: { city: fVal(null) } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Montréal") } },
        { id: "u3", url: "http://x/3", fields: { city: fVal(null) } },
      ],
      runC: [
        { id: "u1", url: "http://x/1", fields: { city: fVal(null) } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Montréal") } },
        { id: "u3", url: "http://x/3", fields: { city: fVal(null) } },
      ],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { rows, summary } = readConverge(fx.outDir);

    expect(rows[0].fields.city).toEqual({
      verdict: "absent",
      value: null,
      n_answered: 3,
      n_runs: 3,
      runs: {
        runA: { value: null, quote: null },
        runB: { value: null, quote: null },
        runC: { value: null, quote: null },
      },
    });
    expect(summary.fields.city.counts).toEqual({ unanimous: 1, majority: 0, split: 0, absent: 2, insufficient: 0 });
    expect(summary.fields.city.alpha_excluded_units).toBe(0);
    // Perfect agreement across two non-degenerate categories (NULL and "montréal") -> alpha = 1
    expect(summary.fields.city.krippendorff_alpha).toBe(1);
    expect(summary.fields.city.pairwise_agreement).toEqual({ "runA|runB": 100, "runA|runC": 100, "runB|runC": 100 });
  });

  it("computes Krippendorff's alpha and pairwise agreement by hand with missing data, true null category, and <2-answer exclusion (kills mutants: missing-as-null-category-in-alpha, true-null-dropped-in-alpha, singleton-in-alpha-margins, pairwise-denominator-includes-abstentions)", async () => {
    // Hand-computed 3-run x 5-id table:
    //   u1: [ON,   ON,   failed]  -> m=2, Do_num += 0
    //   u2: [QC,   QC,   QC    ]  -> m=3, Do_num += 0
    //   u3: [NULL, NULL, NULL  ]  -> m=3, Do_num += 0  (true null is a category!)
    //   u4: [ON,   NULL, missing] -> m=2, Do_num += 2
    //   u5: [ON,   failed, missing] -> m=1 < 2 -> EXCLUDED (alpha_excluded_units = 1)
    // Included n = 2+3+3+2 = 10; margins: ON=3, QC=3, NULL=4.
    // Do_num = 2; De_num = 10^2 - (3^2 + 3^2 + 4^2) = 100 - 34 = 66.
    // alpha = 1 - (2 * 9) / 66 = 1 - 18/66 = 8/11 = 0.727273.
    // Pairwise: r1|r2 = 3/4 (75%), r1|r3 = 2/2 (100%), r2|r3 = 2/2 (100%).
    const mission = { fields: ["province"], instruction: "Extract province." };
    const fx = writeFixture(mission, {
      r1: [
        { id: "u1", url: "http://x/1", fields: { province: fVal("ON") } },
        { id: "u2", url: "http://x/2", fields: { province: fVal("QC") } },
        { id: "u3", url: "http://x/3", fields: { province: fVal(null) } },
        { id: "u4", url: "http://x/4", fields: { province: fVal("ON") } },
        { id: "u5", url: "http://x/5", fields: { province: fVal("ON") } },
      ],
      r2: [
        { id: "u1", url: "http://x/1", fields: { province: fVal("ON") } },
        { id: "u2", url: "http://x/2", fields: { province: fVal("QC") } },
        { id: "u3", url: "http://x/3", fields: { province: fVal(null) } },
        { id: "u4", url: "http://x/4", fields: { province: fVal(null) } },
        { id: "u5", url: "http://x/5", error: "parse_error", error_detail: "bad", fields: null },
      ],
      r3: [
        { id: "u1", url: "http://x/1", error: "llm_error", error_detail: "500", fields: null },
        { id: "u2", url: "http://x/2", fields: { province: fVal("QC") } },
        { id: "u3", url: "http://x/3", fields: { province: fVal(null) } },
        // u4 and u5 missing from r3
      ],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    const { summary } = readConverge(fx.outDir);

    const handAlpha = Number((8 / 11).toFixed(6));
    expect(independentAlphaNominal([
      ["on", "on", null],
      ["qc", "qc", "qc"],
      ["__NULL__", "__NULL__", "__NULL__"],
      ["on", "__NULL__", null],
      ["on", null, null],
    ])).toBe(handAlpha);
    expect(summary.fields.province.krippendorff_alpha).toBe(handAlpha);
    expect(summary.fields.province.alpha_excluded_units).toBe(1);
    expect(summary.fields.province.pairwise_agreement).toEqual({ "r1|r2": 75, "r1|r3": 100, "r2|r3": 100 });
  });

  it("excludes failed/missing runs from record alignment, unmatched counts, and presence verdicts (kills mutants: record-denominator-uses-n_runs, record-insufficient-emits-unmatched, failed-row-fields-leak-into-records)", async () => {
    const office = (street: string | null, city: string | null, province: string | null, postal_code: string | null) => ({
      street: fVal(street), city: fVal(city), province: fVal(province), postal_code: fVal(postal_code),
    });
    const okRow = (id: string, values: Record<string, unknown>[]) => ({
      id, url: `http://x/${id}`,
      fields: { company: fVal("Co"), postal_code: fVal(null), offices: { values } },
    });
    const toronto = office("100 King St", "Toronto", "ON", "M5X 1A9");
    const halifax = office("1801 Hollis St", "Halifax", "NS", "B3J 3N4");

    const fx3 = writeFixture(OFFICES_MISSION, {
      runA: [
        okRow("rec_2of2_unanimous", [toronto]),
        okRow("rec_1_vs_empty_plus_failed", [halifax]),
        okRow("rec_2of2_empty_plus_missing", []),
        okRow("rec_1of3_insufficient", [toronto]),
        okRow("rec_failed_with_stale_fields", [toronto]),
      ],
      runB: [
        okRow("rec_2of2_unanimous", [toronto]),
        okRow("rec_1_vs_empty_plus_failed", []),
        okRow("rec_2of2_empty_plus_missing", []),
        { id: "rec_1of3_insufficient", url: "http://x/rec_1of3_insufficient", error: "llm_error", error_detail: "502", fields: null },
        okRow("rec_failed_with_stale_fields", [toronto]),
      ],
      runC: [
        { id: "rec_2of2_unanimous", url: "http://x/rec_2of2_unanimous", error: "llm_error", error_detail: "503", fields: null },
        { id: "rec_1_vs_empty_plus_failed", url: "http://x/rec_1_vs_empty_plus_failed", error: "parse_error", error_detail: "bad", fields: null },
        // rec_2of2_empty_plus_missing and rec_1of3_insufficient missing from runC
        // Malformed failed row that still carries a fields object must NEVER leak into alignment/unmatched
        { id: "rec_failed_with_stale_fields", url: "http://x/rec_failed_with_stale_fields", error: "llm_error", fields: { company: fVal("Co"), postal_code: fVal(null), offices: { values: [halifax] } } },
      ],
    });
    await runConverge({ runs: fx3.runDirs, mission: fx3.missionPath, out: fx3.outDir });
    const { rows: rows3, summary: sum3 } = readConverge(fx3.outDir);
    const byId = Object.fromEntries(rows3.map((r) => [r.id, r.fields.offices]));

    // 2 answering runs agree on Toronto, 3rd failed -> unanimous over 2 of 2 answered
    expect(byId.rec_2of2_unanimous).toMatchObject({ verdict: "unanimous", n_answered: 2, n_runs: 3, unmatched: [] });
    expect(byId.rec_2of2_unanimous.aligned).toHaveLength(1);
    expect(byId.rec_2of2_unanimous.aligned[0].fields.city).toEqual({
      verdict: "unanimous",
      value: "Toronto",
      n_answered: 2,
      n_runs: 3,
      runs: {
        runA: { value: "Toronto", quote: "Toronto" },
        runB: { value: "Toronto", quote: "Toronto" },
        runC: { status: "failed", error: "llm_error" },
      },
    });
    // 1 present vs 1 empty among 2 answering runs (3rd failed) -> 50/50 split (NOT 2/3 empty-majority!)
    expect(byId.rec_1_vs_empty_plus_failed).toMatchObject({ verdict: "split", n_answered: 2, n_runs: 3, aligned: [] });
    expect(byId.rec_1_vs_empty_plus_failed.unmatched).toHaveLength(1);
    // 2 answering runs empty, 3rd missing -> absent with n_answered=2
    expect(byId.rec_2of2_empty_plus_missing).toEqual({ verdict: "absent", n_answered: 2, n_runs: 3, aligned: [], unmatched: [] });
    // Only 1 answering run (2 abstained) -> insufficient and zero unmatched
    expect(byId.rec_1of3_insufficient).toEqual({ verdict: "insufficient", n_answered: 1, n_runs: 3, aligned: [], unmatched: [] });
    // Failed row carrying stale fields does not leak Halifax into unmatched
    expect(byId.rec_failed_with_stale_fields).toMatchObject({ verdict: "unanimous", n_answered: 2, n_runs: 3, unmatched: [] });
    expect(sum3.fields.offices.unmatched).toBe(1);
    expect(sum3.fields.offices.counts).toEqual({ unanimous: 2, majority: 0, split: 1, absent: 1, insufficient: 1 });

    // 2-run case: 1 answered [Toronto], 1 failed -> insufficient, never unmatched
    const fx2 = writeFixture(OFFICES_MISSION, {
      runA: [okRow("two_fail", [toronto])],
      runB: [{ id: "two_fail", url: "http://x/two_fail", error: "llm_error", error_detail: "err", fields: null }],
    });
    await runConverge({ runs: fx2.runDirs, mission: fx2.missionPath, out: fx2.outDir });
    const { rows: rows2, summary: sum2 } = readConverge(fx2.outDir);
    expect(rows2[0].fields.offices).toEqual({ verdict: "insufficient", n_answered: 1, n_runs: 2, aligned: [], unmatched: [] });
    expect(sum2.fields.offices.unmatched).toBe(0);
  });

  it("refuses runs with missing summary or null/missing mission digest (exit 2) unless --allow-missing-digest is passed and still refuses mismatched digest (kills mutants: null-digest-passes-silently, allow-missing-digest-bypasses-mismatch)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const goodDigest = sha256(JSON.stringify(mission));
    const badDigest = sha256(JSON.stringify({ fields: ["city"], instruction: "Other." }));

    // 1. Run missing a summary row entirely -> exit 2
    const fxNoSum = writeFixture(mission, {
      runA: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      runB: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
    }, { omitSummary: ["runB"] });
    let errNoSum: unknown;
    try { await runConverge({ runs: fxNoSum.runDirs, mission: fxNoSum.missionPath, out: fxNoSum.outDir }); } catch (e) { errNoSum = e; }
    expect(String(errNoSum)).toMatch(/missing summary|mission digest/i);
    expect(isConvergeUsageError(errNoSum)).toBe(true);
    const cliNoSum = await runCli(["scrap", "converge", "--runs", ...fxNoSum.runDirs, "--mission", fxNoSum.missionPath, "--out", fxNoSum.outDir], fxNoSum.root);
    expect(cliNoSum.code).toBe(2);
    expect(cliNoSum.err).toMatch(/missing summary|mission digest/i);

    // 2. Run with summary row whose mission_digest is null -> exit 2
    const fxNullDig = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { type: "summary", ok: 1, failed: 0, mission_digest: goodDigest },
      ],
      runB: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { type: "summary", ok: 1, failed: 0, mission_digest: null },
      ],
    });
    const cliNullDig = await runCli(["scrap", "converge", "--runs", ...fxNullDig.runDirs, "--mission", fxNullDig.missionPath, "--out", fxNullDig.outDir], fxNullDig.root);
    expect(cliNullDig.code).toBe(2);
    expect(cliNullDig.err).toMatch(/missing mission digest/i);

    // 3. --allow-missing-digest allows both missing-summary and null-digest runs and records it in summary
    const cliAllowed = await runCli(["scrap", "converge", "--runs", ...fxNoSum.runDirs, "--mission", fxNoSum.missionPath, "--out", join(fxNoSum.root, "out-ok"), "--allow-missing-digest"], fxNoSum.root);
    expect(cliAllowed.code).toBe(0);
    const allowedSum = readConverge(join(fxNoSum.root, "out-ok")).summary;
    expect(allowedSum.allow_missing_digest).toBe(true);
    expect(allowedSum.missing_digest_runs).toEqual(["runB"]);

    const apiAllowed = await runConverge({ runs: fxNullDig.runDirs, mission: fxNullDig.missionPath, out: join(fxNullDig.root, "out-ok"), allowMissingDigest: true });
    expect(apiAllowed.summary.allow_missing_digest).toBe(true);
    expect(apiAllowed.summary.missing_digest_runs).toEqual(["runB"]);

    // 4. Even with --allow-missing-digest, a mismatched digest is STILL refused (exit 2)
    const fxBadDig = writeFixture(mission, {
      runA: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { type: "summary", ok: 1, failed: 0, mission_digest: goodDigest },
      ],
      runB: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { type: "summary", ok: 1, failed: 0, mission_digest: badDigest },
      ],
    });
    const cliBadEvenAllowed = await runCli(["scrap", "converge", "--runs", ...fxBadDig.runDirs, "--mission", fxBadDig.missionPath, "--out", fxBadDig.outDir, "--allow-missing-digest"], fxBadDig.root);
    expect(cliBadEvenAllowed.code).toBe(2);
    expect(cliBadEvenAllowed.err).toMatch(/mission digest mismatch/);
  });

  it("refuses browser runs without --allow-transport and accepts them with it (kills mutants: transport-marker-ignored, allow-transport-unchecked)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const bRow = (id: string, city: string): Record<string, unknown> => ({
      id, url: `http://x/${id}`, fields: { city: fVal(city) }, transport: "browser",
    });
    const bSum = { type: "summary", transport: "browser", mission_digest: digest, ok: 1, failed: 0 };
    const fx = writeFixture(mission, {
      runA: [bRow("u1", "Ottawa"), bSum],
      runB: [bRow("u1", "Ottawa"), bSum],
    });
    let apiErr: unknown;
    try { await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir }); }
    catch (e) { apiErr = e; }
    expect(String(apiErr)).toMatch(/requires --allow-transport/);
    expect(isConvergeUsageError(apiErr)).toBe(true);
    const cliRefused = await runCli(["scrap", "converge", "--runs", ...fx.runDirs,
      "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(cliRefused.code).toBe(2);
    expect(cliRefused.err).toMatch(/requires --allow-transport/);
    expect(cliRefused.err).toContain(fx.runDirs[0]!);
    const cliOk = await runCli(["scrap", "converge", "--runs", ...fx.runDirs, "--mission", fx.missionPath,
      "--out", join(fx.root, "out-ok"), "--allow-transport", "browser"], fx.root);
    expect(cliOk.code).toBe(0);
    const allowed = readConverge(join(fx.root, "out-ok")).summary;
    expect(allowed.allow_transports).toEqual(["browser"]);
    expect(allowed.run_transports).toEqual({ runA: "browser", runB: "browser" });
  });

  it("still refuses a browser run without its summary under --allow-missing-digest, and refuses mixed or unlisted transports with no override (kills mutants: missing-summary-browser-passes, mixed-transport-passes, unlisted-transport-passes)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const bRow = (id: string, city: string): Record<string, unknown> => ({
      id, url: `http://x/${id}`, fields: { city: fVal(city) }, transport: "browser",
    });
    const fxNoSum = writeFixture(mission, {
      runA: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { type: "summary", mission_digest: digest }],
      runB: [bRow("u1", "Ottawa")],
    }, { omitSummary: ["runB"] });
    const cliNoSum = await runCli(["scrap", "converge", "--runs", ...fxNoSum.runDirs, "--mission",
      fxNoSum.missionPath, "--out", fxNoSum.outDir, "--allow-missing-digest"], fxNoSum.root);
    expect(cliNoSum.code).toBe(2);
    expect(cliNoSum.err).toContain(fxNoSum.runDirs[1]);
    expect(cliNoSum.err).toMatch(/requires --allow-transport/);

    const fxMixed = writeFixture(mission, {
      runA: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }, bRow("u2", "Toronto")],
      runB: [bRow("u1", "Ottawa"), bRow("u2", "Toronto"),
        { type: "summary", transport: "browser", mission_digest: digest }],
    });
    const cliMixed = await runCli(["scrap", "converge", "--runs", ...fxMixed.runDirs, "--mission",
      fxMixed.missionPath, "--out", fxMixed.outDir, "--allow-transport", "browser"], fxMixed.root);
    expect(cliMixed.code).toBe(2);
    expect(isConvergeUsageError(cliMixed.err)).toBe(true);
    const cliMixedBare = await runCli(["scrap", "converge", "--runs", ...fxMixed.runDirs, "--mission",
      fxMixed.missionPath, "--out", fxMixed.outDir], fxMixed.root);
    expect(cliMixedBare.code).toBe(2);

    const fxOther = writeFixture(mission, {
      runA: [{ ...bRow("u1", "Ottawa"), transport: "pigeon" },
        { type: "summary", transport: "pigeon", mission_digest: digest }],
      runB: [bRow("u1", "Ottawa"), { type: "summary", transport: "browser", mission_digest: digest }],
    });
    const cliOther = await runCli(["scrap", "converge", "--runs", ...fxOther.runDirs, "--mission",
      fxOther.missionPath, "--out", fxOther.outDir, "--allow-transport", "browser"], fxOther.root);
    expect(cliOther.code).toBe(2);
    expect(cliOther.err).toMatch(/pigeon/);
  });

  it("records null run_transports for extract runs alongside an allowed browser run (kills mutants: unmarked-run-misclassified)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const fx = writeFixture(mission, {
      runA: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      runB: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") }, transport: "browser" },
        { type: "summary", transport: "browser", mission_digest: digest }],
    });
    const res = await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir,
      allowTransports: ["browser", "browser"] });
    expect(res.summary.run_transports).toEqual({ runA: null, runB: "browser" });
    expect(res.summary.allow_transports).toEqual(["browser", "browser"]);
  });

  it("keeps byte-identical converge.ndjson without --group (kills mutants: groups-leak, renamed-runs)", async () => {
    const digest = sha256(JSON.stringify(OFFICES_MISSION));
    const off = (s: string | null, c: string | null, p: string | null, z: string | null) => ({
      street: fVal(s), city: fVal(c), province: fVal(p), postal_code: fVal(z),
    });
    const row = (id: string, company: string | null, postal: string | null, values: unknown[]) => ({
      id, url: `http://x/${id}`,
      fields: { company: fVal(company), postal_code: fVal(postal), offices: { values } },
    });
    const toronto = [off("100 King St W", "Toronto", "ON", "M5X 1A9")];
    const torontoLong = [off("100 King Street West", "Toronto", "ON", "M5X 1A9")];
    const ottawa = [off("50 O'Connor St", "Ottawa", "ON", "K1P 6L2")];
    const ottawaNoPc = [off("50 O'Connor St", "Ottawa", "ON", null)];
    const fx = writeFixture(OFFICES_MISSION, {
      seedA: [
        row("b1", "Acme Canada Inc.", "M5X 1A9", toronto),
        row("b2", "Beta LLC", "K1P 6L2", ottawa),
        row("b3", "Gamma Inc.", null, []),
      ],
      seedB: [
        { ...row("b1", "Acme Canada Inc.", "M5X-1A9", torontoLong), transport: "browser" },
        { ...row("b2", "Beta LLC", "K1P 6L2", ottawaNoPc), transport: "browser" },
        { ...row("b3", "Gamma Inc.", null, []), transport: "browser" },
        { type: "summary", transport: "browser", mission_digest: digest, ok: 3, failed: 0 },
      ],
      seedC: [
        row("b1", "Acme Canada Inc.", "M5X 1A9", toronto),
        { id: "b2", url: "http://x/b2", error: "llm_error", error_detail: "503", fields: null },
      ],
    });
    const opts = { runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir, allowTransports: ["browser"] };
    await runConverge(opts);
    const bytes = readFileSync(join(fx.outDir, "converge.ndjson"), "utf-8");
    expect(sha256(bytes)).toBe("e0afcf171ea863853aa114f3b235b72ccad60538cc07e410c08481e9eeae767d");
    expect("groups" in readConverge(fx.outDir).summary).toBe(false);
  });

  // --- --group helpers (S and B share no id; X and Y overlap both) ---
  const goff = (s: string | null, c: string | null, p: string | null, z: string | null) => ({
    street: fVal(s), city: fVal(c), province: fVal(p), postal_code: fVal(z),
  });
  const grow = (id: string, company: string | null, postal: string | null, values: unknown[]) => ({
    id, url: `http://x/${id}`,
    fields: { company: fVal(company), postal_code: fVal(postal), offices: { values } },
  });
  const groupRuns = () => {
    const toronto = [goff("100 King St W", "Toronto", "ON", "M5X 1A9")];
    const ottawa = [goff("50 O'Connor St", "Ottawa", "ON", "K1P 6L2")];
    const halifax = [goff("1801 Hollis St", "Halifax", "NS", "B3J 3N4")];
    const calgary = [goff("100 Main St", "Calgary", "AB", "T2P 1N2")];
    return {
      S: [grow("s1", "Acme Canada Inc.", "M5X 1A9", toronto), grow("s2", "Beta LLC", "K1P 6L2", ottawa)],
      B: [grow("s3", "Gamma Inc.", "B3J 3N4", halifax), grow("s4", "Delta Co", "T2P 1N2", calgary)],
      X: [
        grow("s1", "Acme Canada Inc.", "M5X 1A9", toronto),
        grow("s2", "Beta LLC", "K1P 6L2", ottawa),
        grow("s3", "Xenon Ltd", "B3J 3N4", halifax),
        grow("s4", "Delta Co", "T2P 1N2", calgary),
      ],
      Y: [
        grow("s1", "Acme Canada Inc.", "M5X 1A9", toronto),
        grow("s2", "Ypsilon LLC", "K1P 6L2", ottawa),
        grow("s3", "Gamma Inc.", "B3J 3N4", halifax),
        grow("s4", "Delta Co", "T2P 1N2", calgary),
      ],
    };
  };

  it("equals a hand-merged run dir (kills mutants: fold-first, misplaced, pairwise-members)", async () => {
    const fx = writeFixture(OFFICES_MISSION, groupRuns());
    const sDir = fx.runDirs[0]!, bDir = fx.runDirs[1]!, xDir = fx.runDirs[2]!, yDir = fx.runDirs[3]!;
    const a1Dir = join(fx.root, "A1");
    mkdirSync(a1Dir, { recursive: true });
    const cat = (d: string): string => readFileSync(join(d, "results.ndjson"), "utf-8");
    writeFileSync(join(a1Dir, "results.ndjson"), cat(sDir) + cat(bDir));
    const groups = [{ name: "A1", dirs: [sDir, bDir] }];
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: join(fx.root, "out-group"), groups });
    await runConverge({ runs: [a1Dir, xDir, yDir], mission: fx.missionPath, out: join(fx.root, "out-hand") });
    const g = readConverge(join(fx.root, "out-group"));
    const h = readConverge(join(fx.root, "out-hand"));
    expect(g.rows).toEqual(h.rows);
    expect(g.summary.fields).toEqual(h.summary.fields);
    expect(g.summary.runs).toEqual(h.summary.runs);
    expect(g.summary.run_stats).toEqual(h.summary.run_stats);
    expect(g.summary.ids).toBe(h.summary.ids);
    expect(g.summary.runs).toEqual(["A1", "X", "Y"]);
    expect(g.rows[0].fields.company).toMatchObject({ verdict: "unanimous", value: "Acme Canada Inc.", n_runs: 3 });
    expect(Object.keys(g.summary.fields.company.pairwise_agreement).sort()).toEqual(["A1|X", "A1|Y", "X|Y"]);
  });

  it("same vote with and without the group (kills mutants: member-vote, column-alpha, sb-null)", async () => {
    const fx = writeFixture(OFFICES_MISSION, groupRuns());
    const sDir = fx.runDirs[0]!, bDir = fx.runDirs[1]!;
    await runConverge({
      runs: fx.runDirs, mission: fx.missionPath, out: join(fx.root, "out-g"),
      groups: [{ name: "A1", dirs: [sDir, bDir] }],
    });
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: join(fx.root, "out-u") });
    const g = readConverge(join(fx.root, "out-g"));
    const u = readConverge(join(fx.root, "out-u"));
    expect(g.rows).toHaveLength(u.rows.length);
    for (let i = 0; i < g.rows.length; i++) {
      expect(g.rows[i].id).toBe(u.rows[i].id);
      for (const f of ["company", "postal_code"]) {
        for (const k of ["verdict", "value", "n_answered"]) {
          expect(g.rows[i].fields[f][k]).toEqual(u.rows[i].fields[f][k]);
        }
        expect(g.rows[i].fields[f].n_runs).toBe(3);
        expect(u.rows[i].fields[f].n_runs).toBe(4);
      }
      const go = g.rows[i].fields.offices, uo = u.rows[i].fields.offices;
      expect([go.verdict, go.n_answered]).toEqual([uo.verdict, uo.n_answered]);
      expect(go.aligned).toHaveLength(uo.aligned.length);
      go.aligned.forEach((a: any, ai: number) => {
        for (const sf of ["street", "city", "province", "postal_code"]) {
          for (const k of ["verdict", "value", "n_answered"]) {
            expect(a.fields[sf][k]).toEqual(uo.aligned[ai].fields[sf][k]);
          }
        }
      });
      expect(go.unmatched).toHaveLength(uo.unmatched.length);
    }
    expect(g.rows[0].fields.company).toMatchObject({ verdict: "unanimous", value: "Acme Canada Inc." });
    for (const f of ["company", "postal_code"]) {
      expect(g.summary.fields[f].counts).toEqual(u.summary.fields[f].counts);
      expect(g.summary.fields[f].krippendorff_alpha).toBe(u.summary.fields[f].krippendorff_alpha);
      expect(g.summary.fields[f].alpha_excluded_units).toBe(u.summary.fields[f].alpha_excluded_units);
    }
    expect(g.summary.fields.offices.counts).toEqual(u.summary.fields.offices.counts);
    for (const sf of ["street", "city", "province", "postal_code"]) {
      const gs = g.summary.fields.offices.subfields[sf], us = u.summary.fields.offices.subfields[sf];
      expect(gs.krippendorff_alpha).toBe(us.krippendorff_alpha);
      expect(gs.alpha_excluded_units).toBe(us.alpha_excluded_units);
    }
    expect(u.summary.fields.company.pairwise_agreement["S|B"]).toBeNull();
    const uKeys = Object.keys(u.summary.fields.company.pairwise_agreement).sort();
    expect(uKeys).toEqual(["B|X", "B|Y", "S|B", "S|X", "S|Y", "X|Y"]);
    const gKeys = Object.keys(g.summary.fields.company.pairwise_agreement).sort();
    expect(gKeys).toEqual(["A1|X", "A1|Y", "X|Y"]);
  });

  it("failed run plus browser retry is one column (kills mutants: failed-cell, superseded, order)", async () => {
    const digest = sha256(JSON.stringify(OFFICES_MISSION));
    const toronto = [goff("100 King St W", "Toronto", "ON", "M5X 1A9")];
    const ottawa = [goff("50 O'Connor St", "Ottawa", "ON", "K1P 6L2")];
    const fail = (id: string, error: string) => ({
      id, url: `http://x/${id}`, error, error_detail: "x", fields: null,
    });
    const fx = writeFixture(OFFICES_MISSION, {
      S: [fail("g1", "empty_response"), fail("g2", "llm_error"), grow("g3", "Acme Canada Inc.", "M5X 1A9", toronto)],
      B: [
        { ...grow("g1", "Acme Canada Inc.", "M5X 1A9", toronto), transport: "browser" },
        { ...grow("g2", "Beta LLC", "K1P 6L2", ottawa), transport: "browser" },
        { type: "summary", transport: "browser", mission_digest: digest, ok: 2, failed: 0 },
      ],
      X: [
        grow("g1", "Acme Canada Inc.", "M5X 1A9", toronto),
        grow("g2", "Beta LLC", "K1P 6L2", ottawa),
        grow("g3", "Acme Canada Inc.", "M5X 1A9", toronto),
      ],
      Y: [
        grow("g1", "Acme Canada Inc.", "M5X 1A9", toronto),
        grow("g2", "Beta LLC", "K1P 6L2", ottawa),
        grow("g3", "Acme Canada Inc.", "M5X 1A9", toronto),
      ],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!, x = fx.runDirs[2]!, y = fx.runDirs[3]!;
    const outApi = join(fx.root, "out-api");
    await runConverge({
      runs: fx.runDirs, mission: fx.missionPath, out: outApi,
      allowTransports: ["browser"], groups: [{ name: "A1", dirs: [s, b] }],
    });
    const { rows, summary } = readConverge(outApi);
    expect(rows).toHaveLength(3);
    expect(rows[0].fields.company).toMatchObject({ verdict: "unanimous", value: "Acme Canada Inc." });
    expect(rows[0].fields.company.runs.A1).toEqual({ value: "Acme Canada Inc.", quote: "Acme Canada Inc." });
    expect(summary.run_stats.A1).toEqual({ answered: 3, failed: 0, failed_by_code: {}, missing: 0 });
    expect(summary.run_transports).toEqual({ S: null, B: "browser", X: null, Y: null });
    expect(summary.groups.A1).toEqual({
      members: [
        {
          run: "S", transport: null, answered: 1, failed: 2,
          failed_by_code: { empty_response: 1, llm_error: 1 }, missing: 0,
        },
        { run: "B", transport: "browser", answered: 2, failed: 0, failed_by_code: {}, missing: 1 },
      ],
      superseded_failed: 2,
    });
    const stripTransport = (d: string): string => {
      const lines = readFileSync(join(d, "results.ndjson"), "utf-8").split("\n").filter((l) => l.trim());
      return lines.map((l) => {
        const r = JSON.parse(l) as Record<string, unknown>;
        delete r.transport;
        return JSON.stringify(r);
      }).join("\n");
    };
    const handDir = join(fx.root, "A1");
    mkdirSync(handDir, { recursive: true });
    const sLines = readFileSync(join(s, "results.ndjson"), "utf-8").trim();
    writeFileSync(join(handDir, "results.ndjson"), `${sLines}\n${stripTransport(b)}\n`);
    await runConverge({ runs: [handDir, x, y], mission: fx.missionPath, out: join(fx.root, "out-hand") });
    expect(readConverge(join(fx.root, "out-hand")).rows).toEqual(rows);
    const cliBase = ["scrap", "converge", "--runs", ...fx.runDirs, "--mission", fx.missionPath];
    const cliFwd = await runCli([...cliBase, "--out", join(fx.root, "out-fwd"), "--allow-transport", "browser",
      "--group", `A1=${s},${b}`], fx.root);
    expect(cliFwd.code).toBe(0);
    const cliRev = await runCli([...cliBase, "--out", join(fx.root, "out-rev"), "--allow-transport", "browser",
      "--group", `A1=${b},${s}`], fx.root);
    expect(cliRev.code).toBe(0);
    const apiBytes = readFileSync(join(outApi, "converge.ndjson"), "utf-8");
    expect(readFileSync(join(fx.root, "out-fwd", "converge.ndjson"), "utf-8")).toBe(apiBytes);
    expect(readFileSync(join(fx.root, "out-rev", "converge.ndjson"), "utf-8")).toBe(apiBytes);
    let noFlagErr: unknown;
    try {
      const noGroups = [{ name: "A1", dirs: [s, b] }];
      await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: join(fx.root, "out-no"), groups: noGroups });
    } catch (e) { noFlagErr = e; }
    expect(String(noFlagErr)).toContain(b);
    expect(isConvergeUsageError(noFlagErr)).toBe(true);
    const cliNoFlag = await runCli([...cliBase, "--out", join(fx.root, "out-cli-no"),
      "--group", `A1=${s},${b}`], fx.root);
    expect(cliNoFlag.code).toBe(2);
    expect(cliNoFlag.err).toContain(b);
  });

  it("both members failed: later member's row is the cell (kills mutants: first-wins, uncounted)", async () => {
    const toronto = [goff("100 King St W", "Toronto", "ON", "M5X 1A9")];
    const halifax = [goff("1801 Hollis St", "Halifax", "NS", "B3J 3N4")];
    const failed = (id: string, error: string) => ({
      id, url: `http://x/${id}`, error, error_detail: "x", fields: null,
    });
    const fx = writeFixture(OFFICES_MISSION, {
      S: [failed("h1", "llm_error"), grow("h2", "Acme Canada Inc.", "M5X 1A9", toronto)],
      B: [failed("h1", "parse_error"), grow("h3", "Gamma Inc.", "B3J 3N4", halifax)],
      X: [
        grow("h1", "Acme Canada Inc.", "M5X 1A9", toronto),
        grow("h2", "Acme Canada Inc.", "M5X 1A9", toronto),
        grow("h3", "Gamma Inc.", "B3J 3N4", halifax),
      ],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!;
    await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir,
      groups: [{ name: "A1", dirs: [s, b] }] });
    const { rows, summary } = readConverge(fx.outDir);
    expect(rows[0].fields.company.runs.A1).toEqual({ status: "failed", error: "parse_error" });
    expect(summary.run_stats.A1).toEqual({ answered: 2, failed: 1, failed_by_code: { parse_error: 1 }, missing: 0 });
    expect(summary.groups.A1).toEqual({
      members: [
        { run: "S", transport: null, answered: 1, failed: 1, failed_by_code: { llm_error: 1 }, missing: 1 },
        { run: "B", transport: null, answered: 1, failed: 1, failed_by_code: { parse_error: 1 }, missing: 1 },
      ],
      superseded_failed: 1,
    });
  });

  it("two answers of one annotator refused (kills mutants: merge-answers, null-not-answer)", async () => {
    const fx = writeFixture({ fields: ["city"], instruction: "Extract city." }, {
      S: [
        { id: "d1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { id: "d2", url: "http://x/2", fields: { city: fVal(null) } },
        { id: "d3", url: "http://x/3", fields: { city: fVal(null) } },
      ],
      B: [
        { id: "d1", url: "http://x/1", fields: { city: fVal("Toronto") } },
        { id: "d2", url: "http://x/2", fields: { city: fVal(null) } },
        { id: "d3", url: "http://x/3", fields: { city: fVal("Toronto") } },
      ],
      X: [
        { id: "d1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { id: "d2", url: "http://x/2", fields: { city: fVal(null) } },
        { id: "d3", url: "http://x/3", fields: { city: fVal(null) } },
      ],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!;
    const outApi = join(fx.root, "out-api");
    let err: unknown;
    try {
      await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: outApi,
        groups: [{ name: "A1", dirs: [s, b] }] });
    } catch (e) { err = e; }
    expect(String(err)).toMatch(/scrap converge: group/);
    for (const needle of ["A1", "d1", s, b, "3 ids answered"]) expect(String(err)).toContain(needle);
    expect(isConvergeUsageError(err)).toBe(true);
    expect(existsSync(outApi)).toBe(false);
    const outCli = join(fx.root, "out-cli");
    const cli = await runCli(["scrap", "converge", "--runs", ...fx.runDirs, "--mission", fx.missionPath,
      "--out", outCli, "--group", `A1=${s},${b}`], fx.root);
    expect(cli.code).toBe(2);
    expect(cli.err).toMatch(/scrap converge: group/);
    for (const needle of ["A1", "d1", s, b, "3 ids answered"]) expect(cli.err).toContain(needle);
    expect(existsSync(outCli)).toBe(false);
  });

  it("bad group membership refused (kills mutants: ghost-member, regrouped-dir, dup-member, split)", async () => {
    const fx = writeFixture({ fields: ["city"], instruction: "Extract city." }, {
      S: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      B: [{ id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } }],
      X: [{ id: "u3", url: "http://x/3", fields: { city: fVal("Vancouver") } }],
      Y: [{ id: "u4", url: "http://x/4", fields: { city: fVal("Calgary") } }],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!, x = fx.runDirs[2]!;
    const ghost = join(fx.root, "ghost");
    type G = { name: string; dirs: string[] };
    let n = 0;
    const refuse = async (runs: string[], specs: string[], groups: G[], needles: string[]): Promise<void> => {
      n++;
      const outApi = join(fx.root, `out-api-${n}`);
      let err: unknown;
      try {
        await runConverge({ runs, mission: fx.missionPath, out: outApi, groups });
      } catch (e) { err = e; }
      expect(String(err)).toMatch(/scrap converge: group/);
      for (const needle of needles) expect(String(err)).toContain(needle);
      expect(isConvergeUsageError(err)).toBe(true);
      expect(existsSync(outApi)).toBe(false);
      const outCli = join(fx.root, `out-cli-${n}`);
      const args = ["scrap", "converge", "--runs", ...runs, "--mission", fx.missionPath, "--out", outCli];
      for (const spec of specs) args.push("--group", spec);
      const cli = await runCli(args, fx.root);
      expect(cli.code).toBe(2);
      expect(cli.err).toMatch(/scrap converge: group/);
      for (const needle of needles) expect(cli.err).toContain(needle);
      expect(existsSync(outCli)).toBe(false);
    };
    await refuse([s, b, x], [`A1=${s},${ghost}`], [{ name: "A1", dirs: [s, ghost] }],
      ["A1", ghost, "is not a --runs directory"]);
    await refuse(
      [s, b, x], [`A1=${s},${b}`, `A2=${b},${x}`],
      [{ name: "A1", dirs: [s, b] }, { name: "A2", dirs: [b, x] }], ["A2", b, "already in group"],
    );
    await refuse([s, b, x], [`A1=${s},${s}`], [{ name: "A1", dirs: [s, s] }], ["A1", s, "appears twice"]);
    await refuse([s, b, x], [`A1=${s},${x}`], [{ name: "A1", dirs: [s, x] }], ["A1", "not adjacent"]);
    await refuse([s, b, x], [`A1=${s},${b},`], [{ name: "A1", dirs: [s, b, ""] }],
      ["A1", "empty member"]);
    await refuse([s, b, x], [`A1=${s},,${b}`], [{ name: "A1", dirs: [s, "", b] }],
      ["A1", "empty member"]);
  });

  it("degenerate groups refused (kills mutants: lone-member, one-column-left)", async () => {
    const fx = writeFixture({ fields: ["city"], instruction: "Extract city." }, {
      S: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      B: [{ id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } }],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!;
    type G = { name: string; dirs: string[] };
    const cases: [string, G[], string[]][] = [
      ["lone", [{ name: "A1", dirs: [s] }], ["A1", "needs at least two members"]],
      ["onecol", [{ name: "A1", dirs: [s, b] }], ["A1", "leaves only"]],
    ];
    for (const [tag, groups, needles] of cases) {
      const outApi = join(fx.root, `out-api-${tag}`);
      let err: unknown;
      try {
        await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: outApi, groups });
      } catch (e) { err = e; }
      expect(String(err)).toMatch(/scrap converge: group/);
      for (const needle of needles) expect(String(err)).toContain(needle);
      expect(isConvergeUsageError(err)).toBe(true);
      expect(existsSync(outApi)).toBe(false);
      const outCli = join(fx.root, `out-cli-${tag}`);
      const args = ["scrap", "converge", "--runs", ...fx.runDirs, "--mission", fx.missionPath, "--out", outCli];
      for (const gDef of groups) args.push("--group", `${gDef.name}=${gDef.dirs.join(",")}`);
      const cli = await runCli(args, fx.root);
      expect(cli.code).toBe(2);
      expect(cli.err).toMatch(/scrap converge: group/);
      for (const needle of needles) expect(cli.err).toContain(needle);
      expect(existsSync(outCli)).toBe(false);
    }
  });

  it("bad group names refused (kills mutants: illegal-name, name-collision, dup-group, no-equals)", async () => {
    const fx = writeFixture({ fields: ["city"], instruction: "Extract city." }, {
      S: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      B: [{ id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } }],
      X: [{ id: "u3", url: "http://x/3", fields: { city: fVal("Vancouver") } }],
      Y: [{ id: "u4", url: "http://x/4", fields: { city: fVal("Calgary") } }],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!, x = fx.runDirs[2]!, y = fx.runDirs[3]!;
    type G = { name: string; dirs: string[] };
    let n = 0;
    const refuse = async (runs: string[], specs: string[], groups: G[], needles: string[]): Promise<void> => {
      n++;
      const outApi = join(fx.root, `out-api-${n}`);
      let err: unknown;
      try {
        await runConverge({ runs, mission: fx.missionPath, out: outApi, groups });
      } catch (e) { err = e; }
      expect(String(err)).toMatch(/scrap converge: group/);
      for (const needle of needles) expect(String(err)).toContain(needle);
      expect(isConvergeUsageError(err)).toBe(true);
      expect(existsSync(outApi)).toBe(false);
      const outCli = join(fx.root, `out-cli-${n}`);
      const args = ["scrap", "converge", "--runs", ...runs, "--mission", fx.missionPath, "--out", outCli];
      for (const spec of specs) args.push("--group", spec);
      const cli = await runCli(args, fx.root);
      expect(cli.code).toBe(2);
      expect(cli.err).toMatch(/scrap converge: group/);
      expect(existsSync(outCli)).toBe(false);
    };
    await refuse([s, b, x], [`=${s},${b}`], [{ name: "", dirs: [s, b] }],
      ["scrap converge: group", "invalid name"]);
    await refuse([s, b, x], [`A|1=${s},${b}`], [{ name: "A|1", dirs: [s, b] }], ["A|1", "invalid name"]);
    await refuse([s, b, x], [`A/1=${s},${b}`], [{ name: "A/1", dirs: [s, b] }], ["A/1", "invalid name"]);
    await refuse([s, b, x], [`A 1=${s},${b}`], [{ name: "A 1", dirs: [s, b] }], ["A 1", "invalid name"]);
    await refuse([s, b, x], [`S=${s},${b}`], [{ name: "S", dirs: [s, b] }], ["S", "name equals a run directory name"]);
    await refuse(
      [s, b, x, y], [`A1=${s},${b}`, `A1=${x},${y}`],
      [{ name: "A1", dirs: [s, b] }, { name: "A1", dirs: [x, y] }], ["A1", "duplicate group name"],
    );
    let eqErr: unknown;
    try {
      const outEq = join(fx.root, "out-api-eq");
      const eqGroups = [{ name: "A=1", dirs: [s, b] }];
      await runConverge({ runs: [s, b, x], mission: fx.missionPath, out: outEq, groups: eqGroups });
    } catch (e) { eqErr = e; }
    expect(String(eqErr)).toMatch(/scrap converge: group/);
    for (const needle of ["A=1", "invalid name"]) expect(String(eqErr)).toContain(needle);
    expect(isConvergeUsageError(eqErr)).toBe(true);
    const outNoEq = join(fx.root, "out-cli-noeq");
    const noEq = await runCli(["scrap", "converge", "--runs", s, b, x, "--mission", fx.missionPath,
      "--out", outNoEq, "--group", "A1"], fx.root);
    expect(noEq.code).toBe(2);
    expect(noEq.err).toMatch(/scrap converge: group/);
    for (const needle of ["A1", "spec must be"]) expect(noEq.err).toContain(needle);
    expect(existsSync(outNoEq)).toBe(false);
  });

  it("group checks run before any results.ndjson read (kills mutants: late-groups)", async () => {
    const fx = writeFixture({ fields: ["city"], instruction: "Extract city." }, {
      S: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      B: [{ id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } }],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!;
    const noRes = join(fx.root, "NORES");
    mkdirSync(noRes, { recursive: true });
    const runs = [s, b, noRes];
    const outApi = join(fx.root, "out-api-late");
    let err: unknown;
    try {
      await runConverge({ runs, mission: fx.missionPath, out: outApi, groups: [{ name: "A|1", dirs: [s, b] }] });
    } catch (e) { err = e; }
    expect(String(err)).toMatch(/scrap converge: group/);
    for (const needle of ["A|1", "invalid name"]) expect(String(err)).toContain(needle);
    expect(String(err)).not.toContain("missing results.ndjson");
    expect(isConvergeUsageError(err)).toBe(true);
    expect(existsSync(outApi)).toBe(false);
    const outCli = join(fx.root, "out-cli-late");
    const cli = await runCli(["scrap", "converge", "--runs", ...runs, "--mission", fx.missionPath,
      "--out", outCli, "--group", `A|1=${s},${b}`], fx.root);
    expect(cli.code).toBe(2);
    expect(cli.err).toMatch(/scrap converge: group/);
    for (const needle of ["A|1", "invalid name"]) expect(cli.err).toContain(needle);
    expect(cli.err).not.toContain("missing results.ndjson");
    expect(existsSync(outCli)).toBe(false);
  });

  it("per-directory checks survive grouping (kills mutants: mixed-member, no-summary, digest-group)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const mixed = writeFixture(mission, {
      S: [
        { id: "m1", url: "http://x/m1", fields: { city: fVal("Ottawa") } },
        { id: "m2", url: "http://x/m2", fields: { city: fVal("Toronto") }, transport: "browser" },
      ],
      B: [
        { id: "m1", url: "http://x/m1", fields: { city: fVal("Ottawa") } },
        { id: "m2", url: "http://x/m2", fields: { city: fVal("Toronto") } },
      ],
      X: [
        { id: "m1", url: "http://x/m1", fields: { city: fVal("Ottawa") } },
        { id: "m2", url: "http://x/m2", fields: { city: fVal("Toronto") } },
      ],
    });
    const s = mixed.runDirs[0]!, b = mixed.runDirs[1]!, x = mixed.runDirs[2]!;
    const mixedGroups = [{ name: "A1", dirs: [s, b] }];
    let bareErr: unknown;
    try {
      const outBare = join(mixed.root, "out-bare");
      await runConverge({ runs: mixed.runDirs, mission: mixed.missionPath, out: outBare, groups: mixedGroups });
    } catch (e) { bareErr = e; }
    expect(String(bareErr)).toMatch(/mixed or unmarked/);
    expect(isConvergeUsageError(bareErr)).toBe(true);
    expect(existsSync(join(mixed.root, "out-bare"))).toBe(false);
    const cliBase = ["scrap", "converge", "--runs", s, b, x, "--mission", mixed.missionPath];
    const cliBare = await runCli([...cliBase, "--out", join(mixed.root, "out-cli-bare"),
      "--group", `A1=${s},${b}`], mixed.root);
    expect(cliBare.code).toBe(2);
    expect(cliBare.err).toMatch(/mixed or unmarked/);
    expect(existsSync(join(mixed.root, "out-cli-bare"))).toBe(false);
    const cliFlag = await runCli([...cliBase, "--out", join(mixed.root, "out-cli-flag"),
      "--allow-transport", "browser", "--group", `A1=${s},${b}`], mixed.root);
    expect(cliFlag.code).toBe(2);
    expect(cliFlag.err).toMatch(/mixed or unmarked/);
    expect(existsSync(join(mixed.root, "out-cli-flag"))).toBe(false);
    const noSum = writeFixture(mission, {
      S: [{ id: "m1", url: "http://x/m1", fields: { city: fVal("Ottawa") } }],
      B: [{ id: "m2", url: "http://x/m2", fields: { city: fVal("Toronto") } }],
      X: [
        { id: "m1", url: "http://x/m1", fields: { city: fVal("Ottawa") } },
        { id: "m2", url: "http://x/m2", fields: { city: fVal("Toronto") } },
      ],
    }, { omitSummary: ["S"] });
    const ns = noSum.runDirs[0]!, nb = noSum.runDirs[1]!, nx = noSum.runDirs[2]!;
    let sumErr: unknown;
    try {
      const groups = [{ name: "A1", dirs: [ns, nb] }];
      await runConverge({ runs: noSum.runDirs, mission: noSum.missionPath, out: join(noSum.root, "out-no"), groups });
    } catch (e) { sumErr = e; }
    expect(String(sumErr)).toMatch(/missing summary/);
    expect(isConvergeUsageError(sumErr)).toBe(true);
    const cliNoSum = await runCli(["scrap", "converge", "--runs", ns, nb, nx, "--mission", noSum.missionPath,
      "--out", join(noSum.root, "out-cli-no"), "--group", `A1=${ns},${nb}`], noSum.root);
    expect(cliNoSum.code).toBe(2);
    expect(cliNoSum.err).toMatch(/missing summary/);
    expect(existsSync(join(noSum.root, "out-cli-no"))).toBe(false);
    const cliOk = await runCli(["scrap", "converge", "--runs", ns, nb, nx, "--mission", noSum.missionPath,
      "--out", join(noSum.root, "out-ok"), "--allow-missing-digest", "--group", `A1=${ns},${nb}`], noSum.root);
    expect(cliOk.code).toBe(0);
    const okSum = readConverge(join(noSum.root, "out-ok")).summary;
    expect(okSum.missing_digest_runs).toEqual(["S"]);
    expect(okSum.groups.A1.members[0].run).toBe("S");
  });

  it("--group before or after --runs, and twice (kills mutants: flag-order, dropped-flag)", async () => {
    const fx = writeFixture({ fields: ["city"], instruction: "Extract city." }, {
      S: [{ id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } }],
      B: [{ id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } }],
      X: [
        { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") } },
        { id: "u2", url: "http://x/2", fields: { city: fVal("Toronto") } },
      ],
      Y: [{ id: "u3", url: "http://x/3", fields: { city: fVal("Vancouver") } }],
    });
    const s = fx.runDirs[0]!, b = fx.runDirs[1]!, x = fx.runDirs[2]!, y = fx.runDirs[3]!;
    const base = ["scrap", "converge", "--runs", s, b, x, y, "--mission", fx.missionPath];
    const after = await runCli([...base, "--out", join(fx.root, "out-after"), "--group", `A1=${s},${b}`], fx.root);
    expect(after.code).toBe(0);
    const before = await runCli(["scrap", "converge", "--group", `A1=${s},${b}`, "--runs", s, b, x, y,
      "--mission", fx.missionPath, "--out", join(fx.root, "out-before")], fx.root);
    expect(before.code).toBe(0);
    const readBytes = (d: string): string => readFileSync(join(d, "converge.ndjson"), "utf-8");
    expect(readBytes(join(fx.root, "out-before"))).toBe(readBytes(join(fx.root, "out-after")));
    const two = await runCli([...base, "--out", join(fx.root, "out-two"), "--group", `A1=${s},${b}`,
      "--group", `A2=${x},${y}`], fx.root);
    expect(two.code).toBe(0);
    expect(readConverge(join(fx.root, "out-two")).summary.runs).toEqual(["A1", "A2"]);
    const rev = await runCli([...base, "--out", join(fx.root, "out-rev"), "--group", `A2=${x},${y}`,
      "--group", `A1=${s},${b}`], fx.root);
    expect(rev.code).toBe(0);
    expect(readBytes(join(fx.root, "out-rev"))).toBe(readBytes(join(fx.root, "out-two")));
    expect(Object.keys(readConverge(join(fx.root, "out-rev")).summary.groups)).toEqual(["A1", "A2"]);
  });

  it("refuses assistant runs without flag (kills mutant: assistant-without-flag-passes)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const aRow = { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") }, transport: "assistant" };
    const aSum = { type: "summary", transport: "assistant", mission_digest: digest };
    const fx = writeFixture(mission, { runA: [aRow, aSum], runB: [aRow, aSum] });
    let apiErr: unknown;
    try {
      await runConverge({ runs: fx.runDirs, mission: fx.missionPath, out: fx.outDir });
    } catch (e) { apiErr = e; }
    expect(String(apiErr)).toMatch(/requires --allow-transport/);
    expect(isConvergeUsageError(apiErr)).toBe(true);
    const cliRefused = await runCli(["scrap", "converge", "--runs", ...fx.runDirs,
      "--mission", fx.missionPath, "--out", fx.outDir], fx.root);
    expect(cliRefused.code).toBe(2);
    expect(cliRefused.err).toMatch(/requires --allow-transport/);
  });

  it("accepts assistant runs with flag (kills mutant: assistant-with-flag-refused)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const aRow = { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") }, transport: "assistant" };
    const aSum = { type: "summary", transport: "assistant", mission_digest: digest, ok: 1, failed: 0 };
    const fx = writeFixture(mission, { runA: [aRow, aSum], runB: [aRow, aSum] });
    const cliOk = await runCli(["scrap", "converge", "--runs", ...fx.runDirs, "--mission", fx.missionPath,
      "--out", join(fx.root, "out-ok"), "--allow-transport", "assistant"], fx.root);
    expect(cliOk.code).toBe(0);
    const allowed = readConverge(join(fx.root, "out-ok")).summary;
    expect(allowed.allow_transports).toEqual(["assistant"]);
    expect(allowed.run_transports).toEqual({ runA: "assistant", runB: "assistant" });
  });

  it("does not admit assistant under browser flag (kills mutant: assistant-under-browser-passes)", async () => {
    const mission = { fields: ["city"], instruction: "Extract city." };
    const digest = sha256(JSON.stringify(mission));
    const aRow = { id: "u1", url: "http://x/1", fields: { city: fVal("Ottawa") }, transport: "assistant" };
    const aSum = { type: "summary", transport: "assistant", mission_digest: digest };
    const fx = writeFixture(mission, { runA: [aRow, aSum], runB: [aRow, aSum] });
    const cliOther = await runCli(["scrap", "converge", "--runs", ...fx.runDirs, "--mission",
      fx.missionPath, "--out", fx.outDir, "--allow-transport", "browser"], fx.root);
    expect(cliOther.code).toBe(2);
    expect(cliOther.err).toMatch(/assistant/);
  });
});
