import { describe, expect, it } from "vitest";
import {
  alignRecordsOneToOne, extractCandidateRecords, readRecFields,
} from "../src/bench-dossier/metrics-records-align.js";

const fv = (value: string | null) => ({ value, quote: value });
const mkKey = (pc: string | null, st: string | null, ci: string | null) => ({ pc, st, ci });

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
});
