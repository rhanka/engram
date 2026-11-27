import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runConverge } from "../src/scrap/converge.js";
import {
  alignRecordsOneToOne, extractCandidateRecords, readRecFields,
} from "../src/bench-dossier/metrics-records-align.js";
import {
  buildFallbackUsage, parseGoldenRecordUnit, projectImportedRecord,
} from "../src/bench-dossier/metrics-records-score.js";

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
});
