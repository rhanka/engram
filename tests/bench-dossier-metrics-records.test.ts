import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runConverge } from "../src/scrap/converge.js";
import * as recordsBarrel from "../src/bench-dossier/metrics-records.js";
import {
  alignRecordsOneToOne, extractCandidateRecords, readRecFields,
} from "../src/bench-dossier/metrics-records-align.js";
import {
  buildFallbackUsage, parseGoldenRecordUnit, projectImportedRecord,
} from "../src/bench-dossier/metrics-records-score.js";
import {
  mapMetricsImportToBenchResults,
  scoreClusterSite, scoreUnweightedRecord,
} from "../src/bench-dossier/metrics-records.js";
import { BenchInvariantError, validateBenchResultsInvariants } from "../src/bench-dossier/invariants.js";
import { parseBenchResultsFile, type BenchResultsFile } from "../src/bench-dossier/results-contract.js";

const fv = (value: string | null) => ({ value, quote: value });
const mkKey = (pc: string | null, st: string | null, ci: string | null) => ({ pc, st, ci });

export function refuse(fn: () => unknown, code: string, Err: { new (...args: any[]): Error } = Error): Error {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Err);
  expect((caught as Error & { code?: string }).code).toBe(code);
  return caught as Error;
}

describe("BD-3 readRecFields & 1-to-1 postal_code / street+city alignment", () => {
  it("normalizes record fields and aligns 1-to-1 postal_code and street+city smoke case", () => {
    expect(readRecFields({
      postal_code: fv("m5x1a9"), street: fv("100  King St W"), city: fv("Montre\u0301al"),
    }, true, "city", "c")).toEqual({
      key: { pc: "M5X 1A9", st: "100 king st w", ci: "montréal" }, subVal: "montréal", inline: 0,
    });
    expect(alignRecordsOneToOne(
      [mkKey("M5X 1A9", "100 king st", "toronto"), mkKey("M5X 1A9", "200 bay st", "toronto")],
      [mkKey("M5X 1A9", "200 bay st", "toronto"), mkKey("M5X 1A9", "100 king st", null)],
    )).toEqual({ matched: [[1, 0], [0, 1]], unalignedGold: [], unalignedCand: [] });
    expect(extractCandidateRecords(null, "city")).toEqual({ items: [], dropped: 0, nulled: 0 });
  });

  it("handles readRecFields nullability, optionality, unverified_quote & negative vectors", () => {
    expect(readRecFields({}, true, "city", "c")).toEqual({
      key: { pc: null, st: null, ci: null }, subVal: null, inline: 0,
    });
    expect(readRecFields(Object.assign(Object.create(null), { city: null, street: undefined }), false, "city", "g"))
      .toEqual({ key: { pc: null, st: null, ci: null }, subVal: null, inline: 0 });
    expect(readRecFields({ postal_code: { value: null }, city: { value: "  " } }, false, "city", "g")).toEqual({
      key: { pc: null, st: null, ci: null }, subVal: null, inline: 0,
    });
    expect(readRecFields({
      postal_code: { value: "M5X 1A9", reason: "unverified_quote" }, city: { quote: "Toronto" },
    }, true, "city", "c")).toEqual({ key: { pc: null, st: null, ci: null }, subVal: null, inline: 1 });
    expect(readRecFields({ postal_code: { value: "m5x1a9", reason: "unverified_quote" } }, false, "city", "g"))
      .toEqual({ key: { pc: "M5X 1A9", st: null, ci: null }, subVal: null, inline: 0 });
    for (const bad of [null, [], new Date()]) refuse(() => readRecFields(bad, true, "city", "c"), "NOT_OBJECT");
    for (const bad of [[], new Date()]) refuse(() => readRecFields({ city: bad }, true, "city", "c"), "NOT_OBJECT");
    refuse(() => readRecFields({ city: {} }, false, "city", "g"), "MISSING_KEY");
    refuse(() => readRecFields({ city: { value: ["A"] } }, false, "city", "g"), "BAD_GOLD_VALUE");
    refuse(() => readRecFields({ city: { value: ["A"] } }, true, "city", "c"), "BAD_CANDIDATE_VALUE");
    refuse(() => readRecFields({ city: { value: ["A"], reason: "unverified_quote" } }, true, "city", "c"),
      "BAD_CANDIDATE_VALUE");
  });

  it("aligns shared-pc street, street+city fallback, prevents 1-to-1 reuse & blocks shared pc", () => {
    expect(alignRecordsOneToOne(
      [mkKey("M5X 1A9", "100 king st", "toronto"), mkKey("M5X 1A9", "200 bay st", "toronto")],
      [mkKey("M5X 1A9", "200 bay st", null), mkKey("M5X 1A9", "100 king st", null)],
    )).toEqual({ matched: [[1, 0], [0, 1]], unalignedGold: [], unalignedCand: [] });
    expect(alignRecordsOneToOne(
      [mkKey("K1P 6L2", "50 o'connor st", "ottawa"), mkKey("T2P 1N2", "100 main st", "calgary")],
      [mkKey(null, "50 o'connor st", "ottawa"), mkKey("T2P 9Z9", "100 main st", "calgary")],
    )).toEqual({ matched: [[0, 0]], unalignedGold: [1], unalignedCand: [1] });
    expect(alignRecordsOneToOne(
      [mkKey(null, "50 o'connor st", "ottawa")],
      [mkKey("K1P 6L2", "50 o'connor st", "ottawa")],
    )).toEqual({ matched: [[0, 0]], unalignedGold: [], unalignedCand: [] });
    expect(alignRecordsOneToOne(
      [mkKey("M5X 1A9", "100 king st", "toronto"), mkKey("M5X 1A9", "100 king st", null)],
      [mkKey("M5X 1A9", "100 king st", "toronto")],
    )).toEqual({ matched: [[0, 0]], unalignedGold: [1], unalignedCand: [] });
    expect(alignRecordsOneToOne(
      [mkKey("M5X 1A9", "100 king st", "toronto"), mkKey("M5X 1A9", "200 bay st", "toronto")],
      [mkKey("M5X 1A9", "300 queen st", "toronto")],
    )).toEqual({ matched: [], unalignedGold: [0, 1], unalignedCand: [0] });
    expect(alignRecordsOneToOne(
      [mkKey("H2Y 1S1", "500 rue st", "montréal")],
      [mkKey("H2Y 1S1", "500 rue saint", "montréal"), mkKey("H2Y 1S1", "500 rue saint", "montréal")],
    )).toEqual({ matched: [[0, 0]], unalignedGold: [], unalignedCand: [1] });
    expect(alignRecordsOneToOne(
      [mkKey("M5X 1A9", "300 queen st", "toronto")],
      [mkKey("M5X 1A9", "400 yonge st", "toronto"), mkKey("M5X 1A9", "500 front st", "toronto")],
    )).toEqual({ matched: [], unalignedGold: [0], unalignedCand: [0, 1] });
    expect(alignRecordsOneToOne(
      [mkKey("B3J 3N4", null, null)],
      [mkKey("B3J 3N4", null, null), mkKey("B3J 3N4", null, null)],
    )).toEqual({ matched: [[0, 0]], unalignedGold: [], unalignedCand: [1] });
    expect(alignRecordsOneToOne(
      [mkKey("M5X 1A9", "100 king st", "toronto")],
      [mkKey("M5X 1A9", "100 king st", null), mkKey("M5X 1A9", "100 king st", "toronto")],
    )).toEqual({ matched: [[0, 1]], unalignedGold: [], unalignedCand: [0] });
  });

  it("extracts candidate records across optionality/nullability and refuses invalid counts/shapes", () => {
    expect(extractCandidateRecords(undefined, "city")).toEqual({ items: [], dropped: 0, nulled: 0 });
    expect(extractCandidateRecords({}, "city")).toEqual({ items: [], dropped: 0, nulled: 0 });
    expect(extractCandidateRecords(Object.create(null), "city")).toEqual({ items: [], dropped: 0, nulled: 0 });
    expect(extractCandidateRecords({ values: [{ postal_code: fv("m5x1a9") }], unverified_dropped: 2 }, "city"))
      .toEqual({ items: [{ pc: "M5X 1A9", st: null, ci: null, subVal: null }], dropped: 2, nulled: 0 });
    expect(extractCandidateRecords({
      values: [{ city: { value: "T", reason: "unverified_quote" } }], unverified_subfields: 3,
    }, "city")).toEqual({ items: [{ pc: null, st: null, ci: null, subVal: null }], dropped: 0, nulled: 3 });
    expect(extractCandidateRecords({
      values: [
        { city: { value: "A", reason: "unverified_quote" }, street: { value: "B", reason: "unverified_quote" } },
      ],
      unverified_subfields: 1,
    }, "city")).toEqual({ items: [{ pc: null, st: null, ci: null, subVal: null }], dropped: 0, nulled: 2 });
    for (const bad of [[], "bad", new Date()]) refuse(() => extractCandidateRecords(bad, "city"), "NOT_OBJECT");
    for (const bad of [null, "bad"]) refuse(() => extractCandidateRecords({ values: bad }, "city"), "NOT_ARRAY");
    for (const bad of [null, []]) refuse(() => extractCandidateRecords({ values: [bad] }, "city"), "NOT_OBJECT");
    for (const bad of [-1, 1.5, null]) {
      refuse(() => extractCandidateRecords({ unverified_dropped: bad }, "city"), "BAD_COUNT", RangeError);
      refuse(() => extractCandidateRecords({ unverified_subfields: bad }, "city"), "BAD_COUNT", RangeError);
    }
  });
});

describe("BD-3 golden record parser, real converge shapes & majority gate", () => {
  it("parses smoke golden unit and absent/insufficient record units", () => {
    expect(parseGoldenRecordUnit({ id: "a", fields: { o: { verdict: "absent" } } }, "o", "city"))
      .toEqual({ id: "a", unit: { kind: "absent" } });
    expect(parseGoldenRecordUnit({ id: "i0", fields: { o: { verdict: "insufficient", n_answered: 0 } } }, "o", "city")
      .unit).toEqual({ kind: "insufficient" });
    expect(parseGoldenRecordUnit({ id: "i1", fields: { o: { verdict: "insufficient", n_answered: 1 } } }, "o", "city")
      .unit).toEqual({ kind: "insufficient" });
  });

  it("enforces clusterSupport > n_answered / 2 at K = 3, 4, 5 (including K=5 majority:null) & real converge",
    async () => {
      const mkCluster = (n: number, sup: number) => ({
        fields: {
          city: {
            verdict: sup > n / 2 || n - sup > n / 2 ? "majority" : "split",
            value: sup > n / 2 ? "Toronto" : null, n_answered: n,
            runs: Object.fromEntries(Array.from({ length: n },
              (_, i) => [`r${i + 1}`, fv(i < sup ? "Toronto" : null)])),
          },
          postal_code: {
            verdict: sup > n / 2 || n - sup > n / 2 ? "majority" : "split",
            value: sup > n / 2 ? "M5X 1A9" : null, n_answered: n,
            runs: Object.fromEntries(Array.from({ length: n },
              (_, i) => [`r${i + 1}`, fv(i < sup ? "M5X 1A9" : null)])),
          },
        },
      });
      expect(parseGoldenRecordUnit({ id: "g3", fields: { o: { verdict: "majority", n_answered: 3,
        aligned: [mkCluster(3, 2)] } } }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
        majClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto", goldVal: "toronto", splitVariants: null }],
      });
      expect(parseGoldenRecordUnit({ id: "g4e", fields: { o: { verdict: "split", n_answered: 4,
        aligned: [mkCluster(4, 2)] } } }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: true, majClusters: [], unmatched: [],
        nonMajClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto" }],
      });
      expect(parseGoldenRecordUnit({ id: "g4m", fields: { o: { verdict: "majority", n_answered: 4,
        aligned: [mkCluster(4, 3)] } } }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
        majClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto", goldVal: "toronto", splitVariants: null }],
      });
      expect(parseGoldenRecordUnit({ id: "g5e", fields: { o: { verdict: "majority", n_answered: 5,
        aligned: [mkCluster(5, 2)] } } }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: false, majClusters: [], unmatched: [],
        nonMajClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto" }],
      });
      expect(parseGoldenRecordUnit({ id: "g5m", fields: { o: { verdict: "majority", n_answered: 5,
        aligned: [mkCluster(5, 3)] } } }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
        majClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto", goldVal: "toronto", splitVariants: null }],
      });
      expect(parseGoldenRecordUnit({ id: "i", fields: { o: { verdict: "insufficient", aligned: [] } } }, "o", "city")
        .unit).toEqual({ kind: "insufficient" });
      expect(parseGoldenRecordUnit({
        id: "k3noRuns",
        fields: { o: { verdict: "unanimous", aligned: [{ fields: { city: { verdict: "unanimous", value: "Ottawa",
          n_answered: 3 } } }] } },
      }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
        majClusters: [{ pc: null, st: null, ci: "ottawa", goldVal: "ottawa", splitVariants: null }],
      });
      expect(parseGoldenRecordUnit({
        id: "recNAnsOnly",
        fields: { o: { verdict: "unanimous", n_answered: 2,
          aligned: [{ fields: { city: { verdict: "unanimous", value: "Ottawa" } } }] } },
      }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
        majClusters: [{ pc: null, st: null, ci: "ottawa", goldVal: "ottawa", splitVariants: null }],
      });
      expect(parseGoldenRecordUnit({
        id: "unmOnly",
        fields: { o: { verdict: "split", n_answered: 2, unmatched: [{ fields: { city: fv("Halifax") } }] } },
      }, "o", "city").unit).toEqual({
        kind: "resolved", recordSplit: true, majClusters: [], nonMajClusters: [],
        unmatched: [{ pc: null, st: null, ci: "halifax" }],
      });

      const root = mkdtempSync(join(tmpdir(), "bd3-conv-"));
      try {
        const missionText = JSON.stringify({
          instruction: "extract",
          fields: [{ name: "office", kind: "record", max_values: 3,
            fields: [{ name: "postal_code" }, { name: "city" }] }],
        });
        const missionPath = join(root, "mission.json");
        const digest = createHash("sha256").update(missionText).digest("hex");
        writeFileSync(missionPath, missionText);
        const mkRow = (id: string, hit: boolean) => ({
          id,
          fields: { office: { values: hit ? [{ postal_code: fv("M5X 1A9"), city: fv("Toronto") }] : [] } },
        });
        const runDirs: string[] = [];
        for (let rIdx = 0; rIdx < 5; rIdx++) {
          const dir = join(root, `r${rIdx + 1}`);
          mkdirSync(dir, { recursive: true });
          const lines = [
            mkRow("k5_2of5", rIdx < 2),
            mkRow("k5_3of5", rIdx < 3),
            { type: "summary", mission_digest: digest },
          ];
          writeFileSync(join(dir, "results.ndjson"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
          runDirs.push(dir);
        }
        const conv = await runConverge({ runs: runDirs, mission: missionPath, out: join(root, "out") });
        const conv2of5 = conv.rows[0] as { fields: { office: { aligned: Array<{ fields: Record<string, any> }> } } };
        expect(conv2of5.fields.office.aligned[0]?.fields.city.verdict).toBe("majority");
        expect(conv2of5.fields.office.aligned[0]?.fields.city.value).toBeNull();
        expect(parseGoldenRecordUnit(conv.rows[0], "office", "city").unit).toEqual({
          kind: "resolved", recordSplit: false, majClusters: [], unmatched: [],
          nonMajClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto" }],
        });
        expect(parseGoldenRecordUnit(conv.rows[1], "office", "city").unit).toEqual({
          kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
          majClusters: [{ pc: "M5X 1A9", st: null, ci: "toronto", goldVal: "toronto", splitVariants: null }],
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

  it("handles cross-subfield support, failed/missing runs, first-run fallback & null-prototype rows", () => {
    const crossSub = parseGoldenRecordUnit({
      id: "cross",
      fields: {
        o: {
          verdict: "majority", n_answered: 4,
          aligned: [{
            fields: {
              city: { verdict: "split", value: null, n_answered: 4, runs: {
                r1: fv("Toronto"), r2: fv(null), r3: fv("Montreal"), r4: fv(null), r5: { status: "failed", error: "e" },
              } },
              postal_code: { verdict: "majority", value: null, n_answered: 4, runs: {
                r1: fv(null), r2: fv("M5X 1A9"), r3: fv(null), r4: fv(null), r5: { status: "missing" },
              } },
            },
          }],
        },
      },
    }, "o", "city").unit;
    expect(crossSub).toEqual({
      kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
      majClusters: [{ pc: null, st: null, ci: null, goldVal: null, splitVariants: new Set(["toronto", "montreal"]) }],
    });
    const staleFailed = parseGoldenRecordUnit({
      id: "sf",
      fields: { o: { verdict: "split", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "split", value: null, n_answered: 4, runs: {
          r1: fv("Toronto"), r2: fv("Toronto"), r3: { status: "failed", error: "e", value: "Toronto" }, r4: fv(null),
        } },
      } }] } },
    }, "o", "city").unit;
    expect(staleFailed.kind === "resolved" && staleFailed.nonMajClusters).toHaveLength(1);
    const missingStale = parseGoldenRecordUnit({
      id: "ms",
      fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "majority", value: null, n_answered: 4, runs: {
          r1: fv("Toronto"), r2: fv("Montreal"), r3: { status: "missing", value: "Ottawa" }, r4: fv(null),
        } },
      } }] } },
    }, "o", "city").unit;
    expect(missingStale).toEqual({
      kind: "resolved", recordSplit: false, majClusters: [], unmatched: [],
      nonMajClusters: [{ pc: null, st: null, ci: "toronto" }],
    });
    const nullProto = Object.assign(Object.create(null), {
      id: "np",
      fields: Object.assign(Object.create(null), {
        o: Object.assign(Object.create(null), {
          verdict: "unanimous",
          aligned: [Object.assign(Object.create(null), {
            fields: Object.assign(Object.create(null), {
              city: Object.assign(Object.create(null), { verdict: "unanimous", value: "Ottawa", n_answered: 2 }),
            }),
          })],
        }),
      }),
    });
    expect(parseGoldenRecordUnit(nullProto, "o", "city").unit).toEqual({
      kind: "resolved", recordSplit: false, nonMajClusters: [], unmatched: [],
      majClusters: [{ pc: null, st: null, ci: "ottawa", goldVal: "ottawa", splitVariants: null }],
    });
  });

  it("refuses every single-defect nested golden record violation (including Date & null arrays)", () => {
    const cl = (n = 4) => ({
      fields: {
        city: { verdict: "unanimous", value: "Toronto", n_answered: n, runs: { r1: fv("Toronto") } },
      },
    });
    for (const bad of [null, [], new Date()]) refuse(() => parseGoldenRecordUnit(bad, "o", "city"), "NOT_OBJECT");
    for (const id of ["", " ", 123]) {
      refuse(() => parseGoldenRecordUnit({ id, fields: { o: { verdict: "absent" } } }, "o", "city"), "MISSING_ID");
    }
    const cases: [unknown, string, ErrorConstructor?][] = [
      [{ id: "g", fields: null }, "NOT_OBJECT"],
      [{ id: "g", fields: [] }, "NOT_OBJECT"],
      [{ id: "g", fields: new Date() }, "NOT_OBJECT"],
      [{ id: "g", fields: {} }, "MISSING_VOTE"],
      [{ id: "g", fields: { o: [] } }, "MISSING_VOTE"],
      [{ id: "g", fields: { o: new Date() } }, "MISSING_VOTE"],
      [{ id: "g", fields: { o: { verdict: "bad" } } }, "BAD_VERDICT"],
      [{ id: "g", fields: { o: { verdict: "absent", n_answered: -1 } } }, "BAD_COUNT", RangeError],
      [{ id: "g", fields: { o: { verdict: "absent", n_answered: 1.5 } } }, "BAD_COUNT", RangeError],
      [{ id: "g", fields: { o: { verdict: "absent", n_answered: null } } }, "BAD_COUNT", RangeError],
      [{ id: "g", fields: { o: { verdict: "insufficient", n_answered: 2 } } }, "N_ANSWERED_MISMATCH"],
      [{ id: "g", fields: { o: { verdict: "unanimous", n_answered: 1, aligned: [cl(2)] } } }, "N_ANSWERED_MISMATCH"],
      [{ id: "g", fields: { o: { verdict: "absent", aligned: "bad" } } }, "NOT_ARRAY"],
      [{ id: "g", fields: { o: { verdict: "absent", aligned: null } } }, "NOT_ARRAY"],
      [{ id: "g", fields: { o: { verdict: "absent", unmatched: "bad" } } }, "NOT_ARRAY"],
      [{ id: "g", fields: { o: { verdict: "absent", unmatched: null } } }, "NOT_ARRAY"],
      [{ id: "g", fields: { o: { verdict: "insufficient", aligned: [cl(2)] } } }, "INSUFFICIENT_NON_EMPTY"],
      [{ id: "g", fields: { o: { verdict: "insufficient", unmatched: [{}] } } }, "INSUFFICIENT_NON_EMPTY"],
      [{ id: "g", fields: { o: { verdict: "absent", aligned: [cl(2)] } } }, "ABSENT_NON_EMPTY"],
      [{ id: "g", fields: { o: { verdict: "absent", unmatched: [{}] } } }, "ABSENT_NON_EMPTY"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [] } } }, "UNANIMOUS_NULL"],
      [{ id: "g", fields: { o: { verdict: "split", aligned: [], unmatched: [] } } }, "SPLIT_NO_RUN"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [null] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [new Date()] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [{ fields: [] }] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [{ fields: new Date() }] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [{ fields: {} }] } } }, "MISSING_VOTE"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [{ fields: { city: [] } }] } } }, "MISSING_VOTE"],
      [{ id: "g", fields: { o: { verdict: "unanimous", aligned: [{ fields: { city: new Date() } }] } } },
        "MISSING_VOTE"],
      [{ id: "g", fields: { o: { verdict: "unanimous",
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T" } } }] } } }, "MISSING_N_ANSWERED"],
      [{ id: "g", fields: { o: { verdict: "unanimous",
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 1 } } }] } } },
        "N_ANSWERED_MISMATCH"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 2,
        aligned: [{ fields: { city: { verdict: "insufficient" } } }] } } }, "N_ANSWERED_MISMATCH"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 2,
        aligned: [{ fields: { city: { verdict: "insufficient", n_answered: 2 } } }] } } }, "N_ANSWERED_MISMATCH"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 2,
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 3 } } }] } } },
        "N_ANSWERED_MISMATCH"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4,
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 4 } } }] } } }, "MISSING_RUNS"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4,
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 4, runs: [] } } }] } } },
        "MISSING_RUNS"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4,
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 4, runs: new Date() } } }] } } },
        "MISSING_RUNS"],
      [{ id: "g", fields: { o: { verdict: "unanimous", n_answered: 3,
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 3, runs: [] } } }] } } },
        "MISSING_RUNS"],
      [{ id: "g", fields: { o: { verdict: "unanimous", n_answered: 3,
        aligned: [{ fields: { city: { verdict: "unanimous", value: "T", n_answered: 3, runs: null } } }] } } },
        "MISSING_RUNS"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "unanimous", value: "T", n_answered: 4, runs: { r1: "bad" } } } }] } } }, "BAD_SPLIT_RUN"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "unanimous", value: "T", n_answered: 4, runs: { r1: new Date() } } } }] } } },
        "BAD_SPLIT_RUN"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "unanimous", value: "T", n_answered: 4, runs: { r1: { quote: "x" } } } } }] } } },
        "BAD_SPLIT_RUN"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "unanimous", value: "T", n_answered: 4, runs: { r1: { status: "ok" } } } } }] } } },
        "BAD_SPLIT_RUN"],
      [{ id: "g", fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        city: { verdict: "unanimous", value: "T", n_answered: 4, runs: { r1: { value: ["T"] } } } } }] } } },
        "BAD_GOLD_VALUE"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2, unmatched: [null] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2, unmatched: [new Date()] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2, unmatched: [{ fields: [] }] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2, unmatched: [{ fields: new Date() }] } } },
        "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2,
        unmatched: [{ fields: { city: [] } }] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2,
        unmatched: [{ fields: { city: new Date() } }] } } }, "NOT_OBJECT"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2,
        unmatched: [{ fields: { city: { quote: "T" } } }] } } }, "MISSING_KEY"],
      [{ id: "g", fields: { o: { verdict: "split", n_answered: 2,
        unmatched: [{ fields: { city: { value: ["T"] } } }] } } }, "BAD_GOLD_VALUE"],
    ];
    for (const [row, code, Err = Error] of cases) refuse(() => parseGoldenRecordUnit(row, "o", "city"), code, Err);
  });

  it("scores empty record dataset and verifies barrel re-exports", () => {
    expect(recordsBarrel.alignRecordsOneToOne).toBe(alignRecordsOneToOne);
    expect(recordsBarrel.extractCandidateRecords).toBe(extractCandidateRecords);
    expect(recordsBarrel.readRecFields).toBe(readRecFields);
    expect(recordsBarrel.parseGoldenRecordUnit).toBe(parseGoldenRecordUnit);
    expect(recordsBarrel.buildFallbackUsage).toBe(buildFallbackUsage);
    expect(recordsBarrel.projectImportedRecord).toBe(projectImportedRecord);
    expect(recordsBarrel.scoreClusterSite).toBe(scoreClusterSite);
    const empty = scoreUnweightedRecord({ field: "office.city", goldenRows: [], candidateRows: [] });
    expect([empty.field, empty.attempted, empty.unverifiedWholeRecordsDropped]).toEqual(["office.city", 0, 0]);
    expect(empty.unweighted.precisionInterval).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    expect(empty.sitePresence.siteRecallInterval).toEqual({
      estimator: "unweighted", method: "none", clustering: "independent_site", valid: false, low: null, high: null,
    });
  });

  it("refuses malformed scoreUnweightedRecord inputs, dotted/whitespace fields & duplicate ids", () => {
    const absRow = { id: "g1", fields: { o: { verdict: "absent" } } };
    for (const bad of [null, [], new Date()]) refuse(() => scoreUnweightedRecord(bad as any), "NOT_OBJECT");
    for (const field of ["", "city", "a.b.c", ".city", "o.", " o.city", "o .city", "o. city", "o.city ", 123]) {
      refuse(() => scoreUnweightedRecord({ field: field as any, goldenRows: [], candidateRows: [] }), "BAD_FIELD");
    }
    for (const maxValues of [0, -1, 1.5, null, "2", Number.MAX_SAFE_INTEGER + 1]) {
      refuse(() => scoreUnweightedRecord({
        field: "o.city", maxValues: maxValues as any, goldenRows: [], candidateRows: [],
      }), "BAD_MAX_VALUES", RangeError);
    }
    refuse(() => scoreUnweightedRecord({ field: "o.city", goldenRows: "bad" as any, candidateRows: [] }), "NOT_ARRAY");
    refuse(() => scoreUnweightedRecord({ field: "o.city", goldenRows: [], candidateRows: "bad" as any }), "NOT_ARRAY");
    refuse(() => scoreUnweightedRecord({
      field: "o.city", goldenRows: [absRow, absRow], candidateRows: [],
    }), "DUPLICATE_ID");
    refuse(() => scoreUnweightedRecord({
      field: "o.city", goldenRows: [absRow], candidateRows: [{ id: "g1", fields: { o: "bad" } }],
    }), "NOT_OBJECT");
  });

  it("scores maxValues=1 Wilson intervals and broad split metrics for record fields", () => {
    const mv1 = scoreUnweightedRecord({
      field: "overflow.city", maxValues: 1,
      goldenRows: [
        { id: "m1", fields: { overflow: { verdict: "unanimous", n_answered: 2, aligned: [{ fields: {
          postal_code: { verdict: "unanimous", value: "M5X 1A9" }, city: { verdict: "unanimous", value: "Toronto" },
        } }] } } },
        { id: "m2", fields: { overflow: { verdict: "split", n_answered: 4, aligned: [{ fields: {
          postal_code: { verdict: "majority", value: "H2Y 1S1", n_answered: 4,
            runs: { r1: fv("H2Y 1S1"), r2: fv("H2Y 1S1"), r3: fv("H2Y 1S1"), r4: fv(null) } },
          city: { verdict: "split", value: null, n_answered: 4,
            runs: { r1: fv("Montréal"), r2: fv("Laval"), r3: fv(null), r4: fv(null) } },
        } }] } } },
      ],
      candidateRows: [
        { id: "m1", fields: { overflow: { values: [{ postal_code: fv("M5X 1A9"), city: fv("Toronto") }] } } },
        { id: "m2", fields: { overflow: { values: [{ postal_code: fv("H2Y 1S1"), city: fv("Ottawa") }] } } },
      ],
    });
    expect(mv1.unweighted.precisionInterval).toEqual({
      estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
      low: expect.closeTo(0.20654931437723742, 12), high: 1,
    });
    expect(mv1.diagnostics.broad).toEqual({ tp: 1, fp: 1, fn: 1, precision: 0.5, recall: 0.5, f1: 0.5 });
  });

  it("scores end-to-end record alignment, majority gate, sitePresence, Wilson & BD-1a/1c parity", () => {
    const cl4 = (pc: string | null, ci: string | null, sup: number) => ({
      fields: {
        postal_code: { verdict: sup > 2 ? "majority" : "split", value: sup > 2 ? pc : null, n_answered: 4,
          runs: Object.fromEntries([1, 2, 3, 4].map((i) => [`r${i}`, fv(i <= sup ? pc : null)])) },
        city: { verdict: sup > 2 ? "majority" : "split", value: sup > 2 ? ci : null, n_answered: 4,
          runs: Object.fromEntries([1, 2, 3, 4].map((i) => [`r${i}`, fv(i <= sup ? ci : null)])) },
      },
    });
    const goldenRows = [
      { id: "s1", fields: { o: { verdict: "majority", n_answered: 3, aligned: [
        { fields: { postal_code: { verdict: "unanimous", value: "M5X 1A9" },
          city: { verdict: "unanimous", value: "Toronto" } } },
        { fields: { street: { verdict: "majority", value: "500 Rue Saint" },
          city: { verdict: "majority", value: "Montréal" } } },
      ] } } },
      { id: "s2", fields: { o: { verdict: "split", n_answered: 3,
        aligned: [{ fields: { postal_code: { verdict: "unanimous", value: "K1P 6L2" },
          city: { verdict: "unanimous", value: "Ottawa" } } }],
        unmatched: [{ fields: { postal_code: fv("B3J 3N4"), city: fv("Halifax") } }] } } },
      { id: "s3", fields: { o: { verdict: "split", n_answered: 4,
        aligned: [cl4("T2P 1N2", "Calgary", 3), cl4("T5J 0N3", "Edmonton", 2)] } } },
      { id: "s4", fields: { o: { verdict: "split", n_answered: 4, aligned: [{ fields: {
        postal_code: { verdict: "majority", value: "V6B 1A1", n_answered: 4,
          runs: { r1: fv("V6B 1A1"), r2: fv("V6B 1A1"), r3: fv("V6B 1A1"), r4: fv(null) } },
        city: { verdict: "split", value: null, n_answered: 4,
          runs: { r1: fv("Vancouver"), r2: fv("Burnaby"), r3: fv(null), r4: fv(null) } },
      } }] } } },
      { id: "s5", fields: { o: { verdict: "absent", n_answered: 3 } } },
      { id: "s6", fields: { o: { verdict: "absent", n_answered: 3 } } },
      { id: "s7", fields: { o: { verdict: "absent", n_answered: 3 } } },
      { id: "s8", fields: { o: { verdict: "insufficient", n_answered: 1 } } },
      { id: "s9", fields: { o: { verdict: "unanimous", n_answered: 2, aligned: [{ fields: {
        postal_code: { verdict: "unanimous", value: "G1R 4P5" },
        city: { verdict: "unanimous", value: "Quebec" } } }] } } },
      { id: "s10", fields: { o: { verdict: "unanimous", n_answered: 2, aligned: [{ fields: {
        postal_code: { verdict: "unanimous", value: "L4Z 1X9" }, city: { verdict: "absent", value: null } } }] } } },
    ];
    const candidateRows = [
      { id: "s1", fields: { o: { values: [
        { postal_code: fv("m5x1a9"), city: fv("toronto") },
        { street: fv("500  rue saint"), city: fv("Montre\u0301al") },
        { postal_code: fv("H2Y 9Z9"), city: fv("DuplicateExtra") },
      ], unverified_dropped: 1, unverified_subfields: 2 } } },
      { id: "s2", fields: { o: { values: [
        { postal_code: fv("K1P 6L2"), city: fv("Gatineau"), street: { value: "x", reason: "unverified_quote" } },
        { postal_code: fv("B3J 3N4"), city: fv("Halifax") },
      ] } } },
      { id: "s3", fields: { o: { values: [
        { postal_code: fv("T2P 1N2"), city: fv("Calgary") }, { postal_code: fv("T5J 0N3"), city: fv("Edmonton") },
      ] } } },
      { id: "s4", fields: { o: { values: [{ postal_code: fv("V6B 1A1"), city: fv("Vancouver") }] } } },
      { id: "s5", fields: { o: { values: [
        { postal_code: fv("R3B 3K6"), city: fv("Winnipeg") }, { postal_code: fv("S7K 1J5"), city: fv("Saskatoon") },
      ] } } },
      { id: "s6", fields: { o: { values: [{ postal_code: fv("E1C 1G2"), city: fv(null) }] } } },
      { id: "s7", error: "llm_error", fields: null },
      { id: "s8", fields: { o: { values: [{ city: fv("Victoria") }] } } },
      { id: "s9", fields: { o: { values: [{ postal_code: fv("H2Y 1S1"), city: fv("Quebec") }] } } },
      { id: "s10", fields: { o: { values: [{ postal_code: fv("L4Z 1X9"), city: fv("Mississauga") }] } } },
    ];
    const res = scoreUnweightedRecord({
      field: "o.city", maxValues: 3, goldenRows, candidateRows,
      supportFloors: { precisionMinPredictions: 5, recallMinPositives: 5 },
    });
    expect([res.attempted, res.accepted, res.failed, res.unverifiedQuotesNulled,
      res.unverifiedWholeRecordsDropped]).toEqual([10, 9, 1, 3, 1]);
    expect(res.failuresByCode).toEqual({ llm_error: 1 });
    expect([res.goldPositive, res.goldAbsent, res.tp, res.fp, res.fpOnPresent, res.fpOnAbsent,
      res.fpElementsOnAbsent, res.fn, res.tn, res.failedOnAbsent, res.unresolved, res.insufficient])
      .toEqual([5, 4, 3, 6, 3, 2, 3, 2, 1, 1, 3, 1]);
    expect(Math.abs(res.precision! - 1 / 3)).toBeLessThan(1e-12);
    expect(Math.abs(res.recall! - 0.6)).toBeLessThan(1e-12);
    expect(Math.abs(res.f1! - 3 / 7)).toBeLessThan(1e-12);
    expect(Math.abs(res.abstentionSpecificity! - 1 / 3)).toBeLessThan(1e-12);
    const clusteredInvalid = {
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    };
    expect(res.unweighted.precisionInterval).toEqual(clusteredInvalid);
    expect(res.unweighted.recallInterval).toEqual(clusteredInvalid);
    expect(res.sitePresence).toEqual({
      goldPresentSites: 4, goldAbsentSites: 4, unresolvedSites: 1, insufficientSites: 1,
      tpSites: 3, fnSites: 1, wrongValueOnPresentSites: 1, fpOnAbsentSites: 2, tnSites: 1, failedOnAbsentSites: 1,
      siteRecall: 0.75,
      siteRecallInterval: {
        estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
        low: expect.closeTo(0.30064184258240184, 12), high: expect.closeTo(0.9544127391902995, 12),
      },
      siteAbstentionSpecificity: expect.closeTo(1 / 3, 12),
      siteAbstentionInterval: {
        estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
        low: expect.closeTo(0.06149194472039621, 12), high: expect.closeTo(0.7923403991979522, 12),
      },
    });
    expect(res.indeterminate).toEqual({ precision: false, recall: false, f1: false });
    expect([res.diagnostics.broad.tp, res.diagnostics.broad.fp, res.diagnostics.broad.fn]).toEqual([4, 6, 2]);
    const file: BenchResultsFile = {
      schemaId: "urn:engram:bench-results:1.0.0", schemaVersion: 1,
      generatedAt: "2026-11-26T10:00:00Z", campaignId: "rec-test",
      corpus: {
        partition: "eval", primaryEstimator: "unweighted", costBasisLabel: "extracted_packet", currency: "USD",
        goldenMissionSha256: "a".repeat(64), candidateMissionSha256: "b".repeat(64), fieldShapeVerified: true,
        goldenSha256: "c".repeat(64), goldenIds: 10, fields: ["o.city"], annotatorCount: 4,
        krippendorffAlphaByField: { "o.city": 0.7 },
      },
      supportFloors: { precisionMinPredictions: 5, recallMinPositives: 5, failureCeiling: 0.2 },
      records: [{
        armId: "arm-a", armMissionSha256: "b".repeat(64), missingDigestAllowed: false, provider: "OpenAI",
        model: "gpt-6-astra", modelLabel: "Astra", proseName: "OpenAI Astra", effort: "low", isCascade: false,
        isHighlighted: false, incomplete: false, comparator: "generic", isPrimaryComparator: true,
        weighted: null, calls: 9, callsPerItem: 1, tokens: "unknown",
        cost: { currency: "USD", costBasisItems: 9, costUnknownReason: "missing-usage",
          apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown", tariffStatus: "unknown", tariffSource: null,
          tariffAsOf: null, fxApplied: null, seatStatus: "unknown", seatMethod: "unknown",
          seatUnknownReason: "missing-observation", seatSharePerItem: "unknown", seatCostPerItem: "unknown",
          seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null },
        ...res,
      }],
    };
    expect(validateBenchResultsInvariants(parseBenchResultsFile(file), {
      missionSpecs: [{ name: "o", kind: "record", maxValues: 3,
        subFields: [{ name: "postal_code" }, { name: "street" }, { name: "city" }] }],
    }).records).toHaveLength(1);
  });

  it("enforces MAJOR #1 unresolved FP routing, isolated anySplit disjuncts, failuresByCode & failed sites", () => {
    const splitCityRow = {
      id: "u_split",
      fields: { o: { verdict: "majority", n_answered: 4, aligned: [{ fields: {
        postal_code: { verdict: "majority", value: "V6B 1A1", n_answered: 4,
          runs: { r1: fv("V6B 1A1"), r2: fv("V6B 1A1"), r3: fv("V6B 1A1"), r4: fv(null) } },
        city: { verdict: "split", value: null, n_answered: 4,
          runs: { r1: fv("Vancouver"), r2: fv("Burnaby"), r3: fv(null), r4: fv(null) } },
      } }] } },
    };
    const probe1 = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: [splitCityRow, { id: "abs1", fields: { o: { verdict: "absent", n_answered: 4 } } }],
      candidateRows: [
        { id: "u_split", fields: { o: { values: [
          { postal_code: fv("V6B 1A1"), city: fv("Vancouver") },
          { postal_code: fv("Z9Z 9Z9"), city: fv("Extra") },
        ] } } },
        { id: "abs1", fields: { o: { values: [] } } },
      ],
    });
    expect([probe1.goldAbsent, probe1.tn, probe1.fpOnAbsent, probe1.fpElementsOnAbsent, probe1.fpOnPresent, probe1.fp,
      probe1.abstentionSpecificity]).toEqual([1, 1, 0, 0, 1, 1, 1]);
    expect(probe1.sitePresence).toEqual({
      goldPresentSites: 0, goldAbsentSites: 1, unresolvedSites: 1, insufficientSites: 0,
      tpSites: 0, fnSites: 0, wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 1, failedOnAbsentSites: 0,
      siteRecall: null,
      siteRecallInterval: {
        estimator: "unweighted", method: "none", clustering: "independent_site", valid: false, low: null, high: null,
      },
      siteAbstentionSpecificity: 1,
      siteAbstentionInterval: {
        estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
        low: expect.closeTo(0.20654931437723742, 12), high: 1,
      },
    });

    const probe2 = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: [{
        id: "u_unm",
        fields: { o: { verdict: "majority", n_answered: 3, aligned: [],
          unmatched: [{ fields: { postal_code: fv("B3J 3N4"), city: fv("Halifax") } }] } },
      }],
      candidateRows: [{
        id: "u_unm",
        fields: { o: { values: [
          { postal_code: fv("B3J 3N4"), city: fv(null) },
          { postal_code: fv("H2Y 1S1"), city: fv("Extra") },
        ] } },
      }],
    });
    expect([probe2.goldAbsent, probe2.tn, probe2.fpOnAbsent, probe2.fpElementsOnAbsent, probe2.fpOnPresent,
      probe2.unresolved, probe2.abstentionSpecificity, probe2.sitePresence.unresolvedSites,
      probe2.sitePresence.fpOnAbsentSites, probe2.sitePresence.siteAbstentionSpecificity])
      .toEqual([0, 0, 0, 0, 1, 0, null, 1, 0, null]);

    const recSplitOnly = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: [{ id: "rs", fields: { o: { verdict: "split", n_answered: 3, aligned: [{ fields: {
        postal_code: { verdict: "unanimous", value: "M5X 1A9" }, city: { verdict: "absent", value: null },
      } }] } } }],
      candidateRows: [{ id: "rs", fields: { o: { values: [] } } }],
    });
    expect([recSplitOnly.sitePresence.unresolvedSites, recSplitOnly.goldAbsent]).toEqual([1, 0]);

    const nonMajOnly = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: [{ id: "nm", fields: { o: { verdict: "majority", n_answered: 5, aligned: [{ fields: {
        city: { verdict: "majority", value: null, n_answered: 5,
          runs: { r1: fv("Toronto"), r2: fv("Toronto"), r3: fv(null), r4: fv(null), r5: fv(null) } },
      } }] } } }],
      candidateRows: [{ id: "nm", fields: { o: { values: [] } } }],
    });
    expect([nonMajOnly.sitePresence.unresolvedSites, nonMajOnly.unresolved, nonMajOnly.goldAbsent]).toEqual([1, 1, 0]);

    const missedSplit = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: [splitCityRow],
      candidateRows: [{ id: "u_split", fields: { o: { values: [] } } }],
    });
    expect(missedSplit.diagnostics.broad).toEqual({ tp: 0, fp: 0, fn: 1, precision: null, recall: 0, f1: 0 });

    const twoClusters = {
      id: "two",
      fields: { o: { verdict: "unanimous", n_answered: 3, aligned: [
        { fields: { postal_code: { verdict: "unanimous", value: "M5X 1A9" },
          city: { verdict: "unanimous", value: "Toronto" } } },
        { fields: { postal_code: { verdict: "unanimous", value: "H2Y 1S1" },
          city: { verdict: "unanimous", value: "Montreal" } } },
      ] } },
    };
    const twoGolden = [
      twoClusters,
      { id: "p3", fields: { o: { verdict: "unanimous", n_answered: 3, aligned: [
        { fields: { postal_code: { verdict: "unanimous", value: "K1P 6L2" },
          city: { verdict: "unanimous", value: "Ottawa" } } },
      ] } } },
      { id: "p4", fields: { o: { verdict: "unanimous", n_answered: 3, aligned: [
        { fields: { postal_code: { verdict: "unanimous", value: "T2P 1N2" },
          city: { verdict: "unanimous", value: "Calgary" } } },
      ] } } },
    ];
    const failMulti = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: twoGolden,
      candidateRows: [
        { id: "two", error: "llm_error", fields: null },
        { id: "p3", error: "llm_error", fields: null },
        { id: "p4", error: "alpha_err", fields: null },
      ],
      supportFloors: { precisionMinPredictions: 5, recallMinPositives: 5 },
      independentGroupSupport: { predictions: 2, positives: 2 },
    });
    expect(Object.entries(failMulti.failuresByCode)).toEqual([["alpha_err", 1], ["llm_error", 2]]);
    expect([failMulti.goldPositive, failMulti.fn, failMulti.sitePresence.fnSites,
      failMulti.sitePresence.wrongValueOnPresentSites]).toEqual([4, 4, 3, 0]);
    const groupRes = scoreUnweightedRecord({
      field: "o.city",
      goldenRows: [twoClusters, twoGolden[1]!, twoGolden[2]!, {
        id: "p5", fields: { o: { verdict: "unanimous", n_answered: 3, aligned: [
          { fields: { postal_code: { verdict: "unanimous", value: "V6B 1A1" },
            city: { verdict: "unanimous", value: "Vancouver" } } },
        ] } } },
      ],
      candidateRows: [
        { id: "two", fields: { o: { values: [
          { postal_code: fv("M5X 1A9"), city: fv("Toronto") },
          { postal_code: fv("H2Y 1S1"), city: fv("Montreal") },
        ] } } },
        { id: "p3", fields: { o: { values: [{ postal_code: fv("K1P 6L2"), city: fv("Ottawa") }] } } },
        { id: "p4", fields: { o: { values: [{ postal_code: fv("T2P 1N2"), city: fv("Calgary") }] } } },
        { id: "p5", fields: { o: { values: [{ postal_code: fv("V6B 1A1"), city: fv("Vancouver") }] } } },
      ],
      supportFloors: { precisionMinPredictions: 5, recallMinPositives: 5 },
      independentGroupSupport: { predictions: 2, positives: 2 },
    });
    expect(groupRes.indeterminate).toEqual({ precision: true, recall: true, f1: true });
  });
});

describe("BD-3 metrics.json to BenchResultsFile lossless importer", () => {
  it("imports minimal empty unweighted metrics.json losslessly with defaults & barrel export", () => {
    expect(recordsBarrel.mapMetricsImportToBenchResults).toBe(mapMetricsImportToBenchResults);
    const out = mapMetricsImportToBenchResults({
      metrics: {
        schemaId: "urn:engram:bench-metrics-import:1.0.0", campaignId: "c1", partition: "eval",
        primaryEstimator: "unweighted", goldenSha256: "a".repeat(64), goldenMissionSha256: "b".repeat(64),
        candidateMissionSha256: "c".repeat(64), fieldShapeVerified: true, goldenIds: 0, fields: ["o.city"],
        annotatorCount: 2, krippendorffAlphaByField: { "o.city": null }, records: [],
      },
      arms: {},
      generatedAt: "2026-11-26T12:00:00Z",
    });
    expect(out).toEqual({
      schemaId: "urn:engram:bench-results:1.0.0", schemaVersion: 1, generatedAt: "2026-11-26T12:00:00Z",
      campaignId: "c1",
      corpus: {
        partition: "eval", primaryEstimator: "unweighted", costBasisLabel: "extracted_packet", currency: "USD",
        goldenMissionSha256: "b".repeat(64), candidateMissionSha256: "c".repeat(64), fieldShapeVerified: true,
        goldenSha256: "a".repeat(64), goldenIds: 0, fields: ["o.city"], annotatorCount: 2,
        krippendorffAlphaByField: { "o.city": null },
      },
      supportFloors: { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05 },
      records: [],
    });
  });

  const cloneJson = <T>(val: T): T => JSON.parse(JSON.stringify(val)) as T;
  const iv = (estimator: "unweighted" | "weighted", low: number, high: number, valid = true) => (valid
    ? { estimator, method: estimator === "weighted" ? "design_bootstrap_95" : "wilson_95_unweighted",
      clustering: estimator === "weighted" ? "group_resampled" : "independent_site", valid: true, low, high } as const
    : { estimator, method: "none", clustering: "clustered_record_invalid", valid: false, low: null,
      high: null } as const
  );

  function makeImportFixture() {
    const wIv = iv("weighted", 0.55, 0.85);
    const dis = iv("unweighted", 0, 0, false);
    const sRec = iv("unweighted", 0.5212421254128504, 0.8333525173175619);
    const sAbs = iv("unweighted", 0.49016247153664183, 0.9433178485456247);
    const baseRec = {
      armId: "arm-a", field: "office.city", comparator: "lotb_ca_post_v1", isPrimaryComparator: true,
      attempted: 43, accepted: 40, failed: 3, failuresByCode: { llm_error: 3 }, unverifiedQuotesNulled: 1,
      unverifiedWholeRecordsDropped: 0, goldPositive: 30, goldAbsent: 10, tp: 21, fp: 7, fpOnPresent: 5,
      fpOnAbsent: 2, fpElementsOnAbsent: 2, fn: 9, tn: 8, failedOnAbsent: 0, unresolved: 1, insufficient: 2,
      sitePresence: { goldPresentSites: 30, goldAbsentSites: 10, unresolvedSites: 1, insufficientSites: 2,
        tpSites: 21, fnSites: 9, wrongValueOnPresentSites: 3, fpOnAbsentSites: 2, tnSites: 8, failedOnAbsentSites: 0,
        siteRecall: 0.7, siteRecallInterval: sRec, siteAbstentionSpecificity: 0.8, siteAbstentionInterval: sAbs },
      unweighted: { precision: 0.75, recall: 0.7, f1: 42 / 58, precisionInterval: dis, recallInterval: dis },
      weighted: { scheme: "horvitz_thompson_s1_s2_v1", deff: 1.14, nEff: 26.3, precision: 0.76, recall: 0.69,
        f1: 0.723, precisionInterval: wIv, recallInterval: wIv, f1Interval: wIv },
      independentGroupSupport: { predictions: 28, positives: 29 },
      diagnostics: { broad: { tp: 22, fp: 6, fn: 8, precision: 22 / 28, recall: 22 / 30, f1: 44 / 58 },
        conditionalRetainedRecall: 0.81 },
      armMissionSha256: "e".repeat(64), calls: 45, costBasisItems: 1705, apiEquivalentTotal: 1.45,
      tokens: { input: 10000, output: 1500, reasoning: 200, cached: "unknown" as const, total: 11700 },
    };
    const secRec = { ...baseRec, comparator: "generic", isPrimaryComparator: false, calls: "unknown" as const,
      tokens: "unknown" as const, apiEquivalentTotal: "unknown" as const };
    delete (secRec as any).costBasisItems;
    delete (secRec as any).armMissionSha256;
    const armA = { schemaId: "urn:engram:bench-arm-manifest:1.0.0", armId: "arm-a", provider: "OpenAI",
      model: "gpt-6-astra", modelLabel: "Astra", proseName: "OpenAI Astra", effort: "low", isCascade: false,
      missionSha256: "e".repeat(64), isHighlighted: true, incomplete: true, allowLegacyMissingMissionDigest: true,
      tariffOverride: { status: "secondary_unverified", currency: "USD", source: "card", asOf: "2026-11-22" },
      fx: { from: "USD", to: "CAD", rate: 1.385, source: "boc", asOf: "2026-11-22" },
      seat: { status: "unknown", reason: "shared-seat-concurrent" } };
    return {
      metrics: {
        schemaId: "urn:engram:bench-metrics-import:1.0.0", campaignId: "lotb", partition: "sealed",
        goldenLabel: "pass1", primaryEstimator: "weighted", costBasisLabel: "attempted_id", currency: "CAD",
        goldenSha256: "b".repeat(64), goldenMissionSha256: "c".repeat(64), candidateMissionSha256: "d".repeat(64),
        fieldShapeVerified: true, goldenIds: 43, fields: ["office.city"], annotatorCount: 4,
        annotatorRunStats: { r1: { answered: 42, failed: 1, missing: 0 } }, missingDigestRuns: ["r1"],
        krippendorffAlphaByField: { "office.city": 0.84 },
        supportFloors: { recallMinPositives: 31, precisionMinPredictions: 29, failureCeiling: 0.08 },
        records: [baseRec, secRec],
      },
      arms: { "arm-a": armA }, generatedAt: "2026-11-26T12:00:00Z", maxValuesChanged: false,
      captureSuppliedIds: 50, captureAttemptedIds: 48, captureOkIds: 45,
      fieldLabels: { "office.city": { en: "office municipality", fr: "municipalité du bureau" } },
    };
  }

  it("enforces MINOR #3 Probe 6 COST_BLOCK_REQUIRED & MAJOR #2 unused armCosts + missionSpecs guards", () => {
    const fx = makeImportFixture() as any;
    const perMilFx = cloneJson(fx);
    perMilFx.metrics.records = [perMilFx.metrics.records[0]];
    perMilFx.metrics.records[0].apiEquivalentTotal = "unknown";
    perMilFx.arms["arm-a"].tariffOverride = { status: "primary", currency: "CAD", source: "card",
      asOf: "2026-11-22", perMillion: { input: 1, output: 2 } };
    delete perMilFx.arms["arm-a"].fx;
    refuse(() => mapMetricsImportToBenchResults(perMilFx), "COST_BLOCK_REQUIRED");

    const perMilNoTok = cloneJson(perMilFx);
    perMilNoTok.metrics.records[0].tokens = "unknown";
    expect(mapMetricsImportToBenchResults(perMilNoTok).records[0]?.cost.costUnknownReason).toBe("missing-usage");

    const perMilWithApi = cloneJson(perMilFx);
    perMilWithApi.metrics.records[0].apiEquivalentTotal = 1.25;
    expect(mapMetricsImportToBenchResults(perMilWithApi).records[0]?.cost.apiEquivalentTotal).toBe(1.25);

    const unusedBadCost = cloneJson(fx);
    unusedBadCost.metrics.records = [];
    unusedBadCost.armCosts = { "arm-a": { calls: 10, callsPerItem: 1, tokens: "unknown",
      cost: { completely: "bogus", currency: "EUR" } } };
    refuse(() => mapMetricsImportToBenchResults(unusedBadCost), "UNKNOWN_KEY");

    const unusedCurMismatch = cloneJson(fx);
    unusedCurMismatch.metrics.records = [];
    unusedCurMismatch.armCosts = { "arm-a": { calls: 10, callsPerItem: 1, tokens: "unknown",
      cost: { currency: "USD", costBasisItems: 10, costUnknownReason: "missing-usage",
        apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown", tariffStatus: "unknown",
        tariffSource: null, tariffAsOf: null, fxApplied: null, seatStatus: "unknown", seatMethod: "unknown",
        seatUnknownReason: "missing-observation", seatSharePerItem: "unknown", seatCostPerItem: "unknown",
        seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null } } };
    refuse(() => mapMetricsImportToBenchResults(unusedCurMismatch), "CURRENCY_MISMATCH");

    const specCases: [unknown, string][] = [
      [[{ kind: "record" }], "MISSING_KEY"],
      [[{ name: "o", kind: "scalar", maxValues: 1, extra: 1 }], "UNKNOWN_KEY"],
      [[{ name: " ", kind: "scalar", maxValues: 1 }], "EMPTY_STRING"],
      [[{ name: "o", kind: "bad", maxValues: 1 }], "BAD_ENUM"],
      [[{ name: "o", kind: "scalar", maxValues: 0 }], "NON_POSITIVE"],
      [[{ name: "o", kind: "scalar", maxValues: 1.5 }], "BAD_COUNT"],
      [[{ name: "o", kind: "record", maxValues: 3 }], "MISSING_KEY"],
      [[{ name: "o", kind: "record", maxValues: 3, subFields: [] }], "BAD_SHAPE"],
      [[{ name: "o", kind: "record", maxValues: 3, subFields: "bad" }], "NOT_ARRAY"],
      [[{ name: "o", kind: "record", maxValues: 3, subFields: [null] }], "NOT_OBJECT"],
      [[{ name: "o", kind: "record", maxValues: 3, subFields: [{ name: " " }] }], "EMPTY_STRING"],
      [[{ name: "o", kind: "record", maxValues: 3, subFields: [{ name: "c", instruction: "" }] }], "EMPTY_STRING"],
      [[{ name: "o", kind: "record", maxValues: 3, subFields: [{ name: "c", extra: 1 }] }], "UNKNOWN_KEY"],
      [[{ name: "o", kind: "scalar", maxValues: 1, subFields: [{ name: "c" }] }], "BAD_SHAPE"],
    ];
    for (const [missionSpecs, code] of specCases) {
      const badSpec = cloneJson(fx);
      badSpec.missionSpecs = missionSpecs;
      refuse(() => mapMetricsImportToBenchResults(badSpec), code);
    }
  });

  it("asserts full literal mapped BenchResultRecord, HT weights, costs, optionalities & armCosts", () => {
    const fx = makeImportFixture();
    const res = mapMetricsImportToBenchResults(fx as any);
    const wIv = { estimator: "weighted", method: "design_bootstrap_95", clustering: "group_resampled",
      valid: true, low: 0.55, high: 0.85 };
    const dis = { estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null };
    expect(res.records[0]).toEqual({
      armId: "arm-a", armMissionSha256: "e".repeat(64), missingDigestAllowed: true, provider: "OpenAI",
      model: "gpt-6-astra", modelLabel: "Astra", proseName: "OpenAI Astra", effort: "low", isCascade: false,
      isHighlighted: true, incomplete: true, field: "office.city", comparator: "lotb_ca_post_v1",
      isPrimaryComparator: true, attempted: 43, accepted: 40, failed: 3, failuresByCode: { llm_error: 3 },
      unverifiedQuotesNulled: 1, unverifiedWholeRecordsDropped: 0, goldPositive: 30, goldAbsent: 10, tp: 21, fp: 7,
      fpOnPresent: 5, fpOnAbsent: 2, fpElementsOnAbsent: 2, fn: 9, tn: 8, failedOnAbsent: 0, unresolved: 1,
      insufficient: 2, abstentionSpecificity: 0.8,
      sitePresence: { goldPresentSites: 30, goldAbsentSites: 10, unresolvedSites: 1, insufficientSites: 2,
        tpSites: 21, fnSites: 9, wrongValueOnPresentSites: 3, fpOnAbsentSites: 2, tnSites: 8, failedOnAbsentSites: 0,
        siteRecall: 0.7,
        siteRecallInterval: { estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site",
          valid: true, low: 0.5212421254128504, high: 0.8333525173175619 },
        siteAbstentionSpecificity: 0.8,
        siteAbstentionInterval: { estimator: "unweighted", method: "wilson_95_unweighted",
          clustering: "independent_site", valid: true, low: 0.49016247153664183, high: 0.9433178485456247 } },
      unweighted: { precision: 0.75, recall: 0.7, f1: 42 / 58, precisionInterval: dis, recallInterval: dis },
      weighted: { scheme: "horvitz_thompson_s1_s2_v1", deff: 1.14, nEff: 26.3, precision: 0.76, recall: 0.69,
        f1: 0.723, precisionInterval: wIv, recallInterval: wIv, f1Interval: wIv },
      precision: 0.76, recall: 0.69, f1: 0.723, precisionInterval: wIv, recallInterval: wIv,
      independentGroupSupport: { predictions: 28, positives: 29 },
      indeterminate: { precision: true, recall: true, f1: true },
      calls: 45, callsPerItem: 45 / 1705,
      tokens: { input: 10000, output: 1500, reasoning: 200, cached: "unknown", total: 11700 },
      cost: { currency: "CAD", costBasisItems: 1705, costUnknownReason: null, apiEquivalentTotal: 1.45,
        apiEquivalentPerItem: 1.45 / 1705, tariffStatus: "secondary_unverified", tariffSource: "card",
        tariffAsOf: "2026-11-22",
        fxApplied: { from: "USD", to: "CAD", rate: 1.385, source: "boc", asOf: "2026-11-22" },
        seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "shared-seat-concurrent",
        seatSharePerItem: "unknown", seatCostPerItem: "unknown", seatPlan: null, seatMonthlyPrice: null,
        seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null },
      diagnostics: { broad: { tp: 22, fp: 6, fn: 8, precision: 22 / 28, recall: 22 / 30, f1: 44 / 58 },
        conditionalRetainedRecall: 0.81 },
    });
    expect([res.records[1]?.cost.costUnknownReason, res.records[1]?.cost.seatUnknownReason,
      res.records[1]?.armMissionSha256]).toEqual(["missing-usage", "shared-seat-concurrent", "e".repeat(64)]);
    expect([res.corpus.costBasisLabel, res.corpus.goldenLabel, res.corpus.maxValuesChanged,
      res.corpus.captureSuppliedIds, res.corpus.captureAttemptedIds, res.corpus.captureOkIds,
      res.corpus.missingDigestRuns]).toEqual(["attempted_id", "pass1", false, 50, 48, 45, ["r1"]]);
    expect(res.corpus.fieldLabels).toEqual({
      "office.city": { en: "office municipality", fr: "municipalité du bureau" },
    });
    expect(res.corpus.annotatorRunStats).toEqual({ r1: { answered: 42, failed: 1, missing: 0 } });

    const unw = cloneJson(fx) as any;
    unw.metrics.primaryEstimator = "unweighted";
    unw.metrics.records[1].weighted = null;
    const unwOut = mapMetricsImportToBenchResults(unw);
    expect([unwOut.records[0]?.precision, unwOut.records[0]?.recall, unwOut.records[0]?.weighted?.precision,
      unwOut.records[1]?.weighted]).toEqual([0.75, 0.7, 0.76, null]);
    expect(unwOut.records[0]?.precisionInterval).toEqual(dis);
    expect(unwOut.records[0]?.recallInterval).toEqual(dis);

    const noGen = cloneJson(fx) as any;
    delete noGen.generatedAt;
    expect(mapMetricsImportToBenchResults(noGen).generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const noAllow = cloneJson(fx) as any;
    delete noAllow.arms["arm-a"].allowLegacyMissingMissionDigest;
    expect(mapMetricsImportToBenchResults(noAllow).records[0]?.missingDigestAllowed).toBe(false);

    const noHigh = cloneJson(fx) as any;
    delete noHigh.arms["arm-a"].isHighlighted;
    expect(mapMetricsImportToBenchResults(noHigh).records[0]?.isHighlighted).toBe(false);

    const noInc = cloneJson(fx) as any;
    delete noInc.arms["arm-a"].incomplete;
    expect(mapMetricsImportToBenchResults(noInc).records[0]?.incomplete).toBe(false);

    const incFalse = cloneJson(fx) as any;
    incFalse.arms["arm-a"].incomplete = false;
    expect(mapMetricsImportToBenchResults(incFalse).records[0]?.incomplete).toBe(false);

    const armTariffStatus = cloneJson(fx) as any;
    delete armTariffStatus.arms["arm-a"].fx;
    delete armTariffStatus.arms["arm-a"].tariffOverride;
    armTariffStatus.arms["arm-a"].tariffStatus = "primary";
    const atsOut = mapMetricsImportToBenchResults(armTariffStatus);
    expect([atsOut.records[0]?.cost.tariffStatus, atsOut.records[0]?.cost.tariffSource,
      atsOut.records[0]?.cost.tariffAsOf, atsOut.records[0]?.cost.fxApplied]).toEqual(["primary", null, null, null]);

    const noSeat = cloneJson(fx) as any;
    delete noSeat.arms["arm-a"].seat;
    expect(mapMetricsImportToBenchResults(noSeat).records[0]?.cost.seatUnknownReason).toBe("missing-observation");

    const noApi = cloneJson(fx) as any;
    delete noApi.metrics.records[0].apiEquivalentTotal;
    expect(mapMetricsImportToBenchResults(noApi).records[0]?.cost.costUnknownReason).toBe("unpriced-mission");

    const noArmSha = cloneJson(fx) as any;
    delete noArmSha.arms["arm-a"].missionSha256;
    delete noArmSha.metrics.records[0].armMissionSha256;
    expect(mapMetricsImportToBenchResults(noArmSha).records[0]?.armMissionSha256).toBe("d".repeat(64));

    const floorCeil = cloneJson(fx) as any;
    floorCeil.supportFloors = { precisionMinPredictions: 28, failureCeiling: 0.12 };
    const fcOut = mapMetricsImportToBenchResults(floorCeil);
    expect(fcOut.supportFloors).toEqual({ recallMinPositives: 31, precisionMinPredictions: 28, failureCeiling: 0.12 });
    expect(fcOut.records[0]?.indeterminate).toEqual({ precision: false, recall: true, f1: true });
  });
});
