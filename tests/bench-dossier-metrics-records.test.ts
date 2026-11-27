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
});
