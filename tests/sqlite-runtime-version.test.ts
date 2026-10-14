import { describe, expect, it } from "vitest";

import {
  effectiveSqliteMinimumVersionForTestingV1,
  isSupportedSqliteRuntimeVersionV1,
  raiseSqliteMinimumVersionForTestingV1,
  resetSqliteMinimumVersionForTestingV1,
} from "../engram-memory/sqlite.js";

describe("sqlite runtime version gate", () => {
  it("the supported-runtime predicate admits 3.51.3 and later plus the 3.44.6+ and 3.50.7+ backport lines, and refuses the rest", () => {
    const admitted = [
      "3.44.6",
      "3.44.7",
      "3.50.7",
      "3.50.8",
      "3.51.3",
      "3.51.4",
      "3.52.0",
      "3.53.2",
      "4.0.0",
    ];
    for (const version of admitted) {
      expect(isSupportedSqliteRuntimeVersionV1(version), `${version} admitted`).toBe(true);
    }
    const refused = [
      "3.44.5",
      "3.50.6",
      "3.51.0",
      "3.51.1",
      "3.51.2",
      "3.45.0",
      "3.49.9",
      "3.43.0",
      "3.0.0",
      "2.7.7",
      "",
      "3.51",
      "3",
      "3.51.3.1",
      "v3.51.3",
      "3.51.x",
      "latest",
      " 3.51.3",
      "3.51.3 ",
      "3,51,3",
    ];
    for (const version of refused) {
      expect(isSupportedSqliteRuntimeVersionV1(version), `${version} refused`).toBe(false);
    }
  });

  it("the effective floor is the monotone maximum of every raised threshold (rising, falling, equal sequences)", () => {
    // Revue Sol tour 1/3 (MAJEUR) : le plancher effectif ne diminue jamais sans
    // réinitialisation explicite. Chaque séquence déterministe part du défaut
    // réglementaire 3.51.3 ; un raise au plus au niveau du plancher lève au
    // lieu d'abaisser.
    const cases: Array<{ sequence: string[]; raises: boolean[]; floors: string[] }> = [
      { sequence: ["3.51.4", "3.52.0", "99.0.0"], raises: [true, true, true], floors: ["3.51.4", "3.52.0", "99.0.0"] },
      { sequence: ["99.0.0", "3.52.0", "3.51.4"], raises: [true, false, false], floors: ["99.0.0", "99.0.0", "99.0.0"] },
      { sequence: ["3.52.0", "3.52.0"], raises: [true, false], floors: ["3.52.0", "3.52.0"] },
      { sequence: ["3.52.0", "99.0.0", "3.51.4", "100.0.0"], raises: [true, true, false, true], floors: ["3.52.0", "99.0.0", "99.0.0", "100.0.0"] },
    ];
    for (const { sequence, raises, floors } of cases) {
      resetSqliteMinimumVersionForTestingV1();
      try {
        expect(effectiveSqliteMinimumVersionForTestingV1(), "default floor").toBe("3.51.3");
        sequence.forEach((version, index) => {
          if (raises[index] === true) {
            raiseSqliteMinimumVersionForTestingV1(version);
          } else {
            expect(() => raiseSqliteMinimumVersionForTestingV1(version), `${version} does not raise`).toThrow();
          }
          expect(effectiveSqliteMinimumVersionForTestingV1(), `floor after ${version}`).toBe(floors[index]);
        });
      } finally {
        resetSqliteMinimumVersionForTestingV1();
      }
    }
    expect(effectiveSqliteMinimumVersionForTestingV1(), "floor after explicit reset").toBe("3.51.3");
  });

  it("the SQLite version bundled with better-sqlite3 is admitted", async () => {
    const native = await import("../engram-memory/node_modules/better-sqlite3/lib/index.js");
    const database = new native.default(":memory:");
    try {
      const row = database.prepare("select sqlite_version() as v").get() as { v: string };
      expect(isSupportedSqliteRuntimeVersionV1(row.v), `bundled ${row.v} admitted`).toBe(true);
    } finally {
      database.close();
    }
  });
});
