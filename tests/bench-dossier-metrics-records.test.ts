import { describe, expect, it } from "vitest";
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
});
