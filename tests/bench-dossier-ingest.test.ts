import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BenchCostSeatError } from "../src/bench-dossier/cost-seat.js";
import {
  parseImportMetricsArgv, parseImportMetricsOptions, parseScrapScoreArgv, parseScrapScoreOptions,
} from "../src/bench-dossier/ingest-cli.js";
import {
  BenchIngestError, isBenchIngestUsageError, loadCheckedMission, loadSeatMap,
  normalizeDigest, readCheckedBuf, readConvergeGolden, sha256Hex,
} from "../src/bench-dossier/ingest-golden.js";
import { runScrapScore } from "../src/bench-dossier/ingest.js";
import { loadArmBundles, readCaptureStats } from "../src/bench-dossier/ingest-io.js";
import { resolveSealedArmCost } from "../src/bench-dossier/ingest-sealed.js";
import { BenchInvariantError, compatibleMissionFieldShape, wilson95 } from "../src/bench-dossier/invariants.js";
import { readBenchResultsFile } from "../src/bench-dossier/results-contract.js";
import { BenchResultsValidationError } from "../src/bench-dossier/results-guards.js";

function catchError(action: () => unknown): unknown {
  try {
    action();
    return undefined;
  } catch (err) {
    return err;
  }
}

describe("BD-5 tree-01: BenchIngestError, exit-2 guard & digest/IO loaders", () => {
  it("preserves code, message, name, cause and distinguishes exit-2 usage errors", () => {
    const root = new SyntaxError("bad");
    const err = new BenchIngestError("BAD_USAGE", "missing --golden", root);
    expect([err.name, err.code, err.message, err.cause]).toEqual([
      "BenchIngestError", "BAD_USAGE", "BAD_USAGE: missing --golden", root,
    ]);
    const plain = new BenchIngestError("MISSING_GOLDEN_DIGEST", "no digest");
    expect([plain.code, plain.cause]).toEqual(["MISSING_GOLDEN_DIGEST", undefined]);
    for (const [val, expected] of [
      [err, true],
      [new BenchCostSeatError("CURRENCY_MISMATCH", "$.fx"), true],
      [new BenchInvariantError("MISSION_FIELD_SHAPE", "$.fields"), true],
      [new BenchResultsValidationError("BAD_SCHEMA", "$"), true],
      [new BenchResultsValidationError("IO_ERROR", "/x", { errno: "ENOENT" }), true],
      [new BenchResultsValidationError("IO_ERROR", "/x", { errno: "ENOTDIR" }), true],
      [new BenchResultsValidationError("IO_ERROR", "/x", { errno: "EISDIR" }), true],
      [new BenchResultsValidationError("IO_ERROR", "/x", { errno: "EACCES" }), false],
      [new Error("scrap extract: invalid mission (bad)"), true],
      [Object.assign(new Error("missing"), { code: "MISSING_VOTE" }), true],
      [Object.assign(new TypeError("arg"), { code: "ERR_INVALID_ARG_TYPE" }), false],
      [Object.assign(new RangeError("big"), { code: "ERR_FS_FILE_TOO_LARGE" }), false],
      [Object.assign(new Error("io"), { code: "EACCES", syscall: "open" }), false],
      [Object.assign(new Error("fs"), { code: "BAD_CODE", syscall: "open" }), false],
      [{ code: "BAD_CODE" }, false],
      [new Error("unexpected"), false],
      [null, false],
    ] as const) expect(isBenchIngestUsageError(val)).toBe(expected);
  });

  it("normalizes digests and separates readCheckedBuf/loadCheckedMission IO_ERROR from BAD_MISSION", () => {
    expect(normalizeDigest(" SHA256:  ABcd12 ")).toBe("abcd12");
    expect(sha256Hex(Buffer.from("abc", "utf8"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const dir = mkdtempSync(join(tmpdir(), "bdi-t1-"));
    try {
      const raw = JSON.stringify({ instruction: "x", fields: ["city"] });
      writeFileSync(join(dir, "m.json"), raw);
      expect(loadCheckedMission(join(dir, "m.json")).digest).toBe(sha256Hex(Buffer.from(raw, "utf8")));
      writeFileSync(join(dir, "bad.json"), "{bad");
      const badMissionErr = catchError(() => loadCheckedMission(join(dir, "bad.json"))) as BenchIngestError;
      expect([badMissionErr instanceof BenchIngestError, badMissionErr.code]).toEqual([true, "BAD_MISSION"]);
      for (const loadMissing of [
        () => loadCheckedMission(join(dir, "no.json")),
        () => readCheckedBuf(join(dir, "no.bin")),
      ]) {
        const ioErr = catchError(loadMissing) as BenchResultsValidationError;
        expect([ioErr instanceof BenchResultsValidationError, ioErr.code, ioErr.errno,
          isBenchIngestUsageError(ioErr)]).toEqual([true, "IO_ERROR", "ENOENT", true]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("BD-5 tree-02: parseScrapScoreOptions & parseImportMetricsOptions positive defaults", () => {
  const baseScore = {
    golden: "g.ndjson", goldenMission: "mg.json", candidateMission: "mc.json",
    arms: ["a1"], out: "out.json", campaignId: "lotb",
  };
  const baseImport = { metrics: "m.json", arms: ["a1"] };

  it("parses omitted defaults, null-proto objects, undefined fields, and non-default values", () => {
    const nullProto = Object.assign(Object.create(null), baseScore, { partition: undefined, recallFloor: undefined });
    expect(parseScrapScoreOptions(nullProto)).toEqual({
      ...baseScore, partition: undefined, goldenLabel: undefined, captureDir: undefined, currency: undefined,
      costBasis: undefined, seatObservations: undefined, fields: undefined, recallFloor: undefined,
      precisionFloor: undefined, failureCeiling: undefined, generatedAt: undefined, fieldLabels: undefined,
    });
    expect(parseScrapScoreOptions({
      ...baseScore, arms: ["a1", "a2"], partition: "sealed", goldenLabel: "pass2", captureDir: "cap",
      currency: "CAD", costBasis: "supplied_id", seatObservations: "seats.json", fields: ["office.city"],
      recallFloor: "0", precisionFloor: 5, failureCeiling: ".5", generatedAt: "2026-11-27T12:00:00Z",
      fieldLabels: { "office.city": { en: "city", fr: "ville" } },
    })).toEqual({
      ...baseScore, arms: ["a1", "a2"], partition: "sealed", goldenLabel: "pass2", captureDir: "cap",
      currency: "CAD", costBasis: "supplied_id", seatObservations: "seats.json", fields: ["office.city"],
      recallFloor: 0, precisionFloor: 5, failureCeiling: 0.5, generatedAt: "2026-11-27T12:00:00Z",
      fieldLabels: { "office.city": { en: "city", fr: "ville" } },
    });
    expect(parseImportMetricsOptions({
      ...baseImport, out: "out.json", golden: "g.ndjson", goldenMission: "mg.json", candidateMission: "mc.json",
      failureCeiling: "1", maxValuesChanged: false,
    })).toEqual({
      ...baseImport, out: "out.json", golden: "g.ndjson", goldenMission: "mg.json", candidateMission: "mc.json",
      captureDir: undefined, currency: undefined, costBasis: undefined, seatObservations: undefined,
      recallFloor: undefined, precisionFloor: undefined, failureCeiling: 1, generatedAt: undefined,
      fieldLabels: undefined, maxValuesChanged: false,
    });
  });

  it("refuses malformed objects, unknown keys, missing strings, nullables, enums, and bounds", () => {
    const checkBadScore = (raw: unknown) => {
      const err = catchError(() => parseScrapScoreOptions(raw)) as BenchIngestError;
      expect([err instanceof BenchIngestError, err.code]).toEqual([true, "BAD_USAGE"]);
    };
    for (const bad of [null, Object.assign([], baseScore), "x", Object.assign(new Date(), baseScore)]) {
      checkBadScore(bad);
    }
    for (const key of ["golden", "goldenMission", "candidateMission", "out", "campaignId"] as const) {
      for (const bad of [undefined, null, "", "   ", 1]) checkBadScore({ ...baseScore, [key]: bad });
    }
    for (const badArms of [undefined, null, [], ["a", "  "], "a1"]) checkBadScore({ ...baseScore, arms: badArms });
    const badScorePatches: Record<string, unknown>[] = [
      { extra: 1 }, { goldenLabel: null }, { goldenLabel: " " }, { captureDir: "" }, { seatObservations: null },
      { generatedAt: "" }, { partition: "bogus" }, { partition: null }, { currency: "EUR" }, { costBasis: "bad" },
      { fields: [] }, { fields: [""] }, { fields: null }, { recallFloor: -1 }, { recallFloor: 1.5 },
      { recallFloor: "05" }, { recallFloor: " 5" }, { recallFloor: Number.MAX_SAFE_INTEGER + 1 }, { recallFloor: null },
      { precisionFloor: "-1" }, { failureCeiling: -0.1 }, { failureCeiling: 1.01 }, { failureCeiling: "0." },
      { failureCeiling: "bad" }, { failureCeiling: null }, { fieldLabels: { c: { en: "x" } } },
      { fieldLabels: { c: { fr: "x" } } }, { fieldLabels: null }, { partition: { toString: () => "eval" } },
    ];
    for (const patch of badScorePatches) checkBadScore({ ...baseScore, ...patch });
    for (const patch of [{ extra: 1 }, { metrics: " " }, { metrics: null }, { arms: [] }, { out: "" },
      { golden: null }, { goldenMission: "" }, { candidateMission: " " }, { maxValuesChanged: "true" },
      { maxValuesChanged: null }]) {
      const err = catchError(() => parseImportMetricsOptions({ ...baseImport, ...patch })) as BenchIngestError;
      expect([err instanceof BenchIngestError, err.code]).toEqual([true, "BAD_USAGE"]);
    }
  });
});

describe("BD-5 tree-04: CLI argv option parsers", () => {
  it("parses space-separated, =, and repeated multi-value flags for score and import argv", () => {
    expect(parseScrapScoreArgv([
      "--golden=g.ndjson", "--golden-mission", "mg.json", "--candidate-mission", "mc.json",
      "--arms", "a1", "a2", "--arms=a3", "--out", "o.json", "--campaign-id", "c1", "--partition", "pilot",
      "--golden-label", "p1", "--capture-dir", "cap", "--currency", "CAD", "--cost-basis", "attempted_id",
      "--seat-observations", "s.json", "--fields", "f1", "f2", "--recall-floor", "4",
      "--precision-floor=6", "--failure-ceiling", "0.2",
    ])).toEqual({
      golden: "g.ndjson", goldenMission: "mg.json", candidateMission: "mc.json", arms: ["a1", "a2", "a3"],
      out: "o.json", campaignId: "c1", partition: "pilot", goldenLabel: "p1", captureDir: "cap",
      currency: "CAD", costBasis: "attempted_id", seatObservations: "s.json", fields: ["f1", "f2"],
      recallFloor: 4, precisionFloor: 6, failureCeiling: 0.2, generatedAt: undefined, fieldLabels: undefined,
    });
    expect(parseImportMetricsArgv(["--metrics", "m.json", "--arms", "a1", "--out", "o.json"])).toEqual({
      metrics: "m.json", arms: ["a1"], out: "o.json", golden: undefined, goldenMission: undefined,
      candidateMission: undefined, captureDir: undefined, currency: undefined, costBasis: undefined,
      seatObservations: undefined, recallFloor: undefined, precisionFloor: undefined, failureCeiling: undefined,
      generatedAt: undefined, fieldLabels: undefined, maxValuesChanged: undefined,
    });
  });

  it("refuses malformed, duplicate, unknown, empty-multi, positional, and flag-swallow argv tokens", () => {
    const base = ["--golden", "g", "--golden-mission", "mg", "--candidate-mission", "mc",
      "--arms", "a1", "--out", "o", "--campaign-id", "c"];
    for (const bad of [
      "bad" as unknown as string[], [123 as unknown as string], ["xxgolden", "g", ...base.slice(2)],
      ["--golden", "g", "--golden-mission", "mg", "--candidate-mission", "mc",
        "--arms", "a1", "--out", "o", "--campaignId", "c"],
      [...base, "--unknown", "x"], [...base, "--generated-at", "2026-11-27"],
      [...base, "--golden", "g2"], [...base, "--golden-label", "--partition"], [...base, "--golden-label"],
      [...base, "--arms"],
    ]) {
      const err = catchError(() => parseScrapScoreArgv(bad)) as BenchIngestError;
      expect([err instanceof BenchIngestError, err.code]).toEqual([true, "BAD_USAGE"]);
    }
    for (const bad of [
      ["--metrics", "m", "--arms", "a1", "--fields", "f1"],
      ["--metrics", "m", "--arms", "a1", "--max-values-changed", "true"],
    ]) {
      const err = catchError(() => parseImportMetricsArgv(bad)) as BenchIngestError;
      expect([err instanceof BenchIngestError, err.code]).toEqual([true, "BAD_USAGE"]);
    }
  });
});

describe("BD-5 tree-05: loadArmBundles missionPath, price_table & digest normalization", () => {
  const mkM = (p: string, maxValues: number, inRate: number) => {
    writeFileSync(p, JSON.stringify({
      instruction: "x", fields: [{ name: "tags", kind: "scalar", max_values: maxValues }],
      price_table: { source: "p", as_of: "2026-11-22", currency: "USD", status: "primary",
        per_million: { input: inRate, output: 0 } },
    }));
    return loadCheckedMission(p);
  };
  const armBase = {
    schemaId: "urn:engram:bench-arm-manifest:1.0.0", provider: "OpenAI", model: "gpt-6-astra-low",
    modelLabel: "Astra", proseName: "OpenAI Astra", effort: "low", isCascade: false,
  };
  const mkArm = (dir: string, arm: Record<string, unknown>, rows?: Record<string, unknown>[]) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "arm.json"), JSON.stringify({ ...armBase, ...arm }));
    if (rows) writeFileSync(join(dir, "results.ndjson"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  };
  const rowOk = (digest?: string) => [
    { id: "1", fields: { tags: { values: [] } } },
    { type: "summary", ok: 1, failed: 0, calls_total: 1, ...(digest !== undefined ? { mission_digest: digest } : {}),
      tokens: { input: 1_000_000, output: 0, reasoning: 0, total: 1_000_000 } },
  ];

  it("loads arm.missionPath, normalizes digests, overrides price_table, and propagates seats", () => {
    const dir = mkdtempSync(join(tmpdir(), "bdi-t5-"));
    try {
      const refM = mkM(join(dir, "gold.json"), 2, 1);
      const defM = mkM(join(dir, "cand.json"), 2, 1);
      const armM = mkM(join(dir, "arm-m.json"), 3, 4);
      const a1 = join(dir, "a1");
      const a2 = join(dir, "a2");
      const a3 = join(dir, "a3");
      mkArm(a1, { armId: "arm-1", missionPath: "../arm-m.json", missionSha256: `SHA256:${armM.digest.toUpperCase()}` },
        rowOk(`sha256:${armM.digest.toUpperCase()}`));
      mkArm(a2, { armId: "arm-2", allowLegacyMissingMissionDigest: true }, rowOk());
      mkArm(a3, { armId: "arm-3", missionSha256: `SHA256:${"c".repeat(64).toUpperCase()}` });
      const seatMap = new Map([["arm-1", { status: "unknown" as const, reason: "shared-seat-concurrent" as const }]]);
      const res = loadArmBundles({
        armDirs: [a1, a2], refMission: refM, defaultMission: defM, requireResults: true, currency: "USD", seatMap,
      });
      expect([res.maxValuesChanged, res.bundles[0]?.armCost?.cost.apiEquivalentTotal,
        res.bundles[0]?.armCost?.cost.seatUnknownReason, res.bundles[1]?.armCost?.cost.apiEquivalentTotal])
        .toEqual([true, 4, "shared-seat-concurrent", 1]);
      const sealed = loadArmBundles({
        armDirs: [a3], refMission: refM, defaultMission: defM, requireResults: false, currency: "USD",
        seatMap: new Map(),
      });
      expect([sealed.bundles[0]?.armCost, sealed.bundles[0]?.expectedDigest, sealed.bundles[0]?.priceTable])
        .toEqual([undefined, "c".repeat(64), undefined]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads seat maps and refuses duplicate dir/symlink/armId, bad missionPath shape, and bad digests", () => {
    expect(loadSeatMap(undefined).size).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "bdi-t6-"));
    try {
      const seatPath = join(dir, "seats.json");
      writeFileSync(seatPath, JSON.stringify({
        schemaId: "urn:engram:seat-observation:1.0.0",
        observations: { toString: { status: "unknown", reason: "shared-seat-concurrent" } },
      }));
      expect(loadSeatMap(seatPath).get("toString")).toEqual({ status: "unknown", reason: "shared-seat-concurrent" });
      expect((catchError(() => loadSeatMap("")) as BenchResultsValidationError).errno).toBe("ENOENT");
      const refM = mkM(join(dir, "gold.json"), 2, 1);
      const defM = mkM(join(dir, "cand.json"), 2, 1);
      const badShape = mkM(join(dir, "badshape.json"), 1, 1);
      const a1 = join(dir, "a1");
      const aDup = join(dir, "a1-dup");
      const aSym = join(dir, "a1-sym");
      mkArm(a1, { armId: "arm-1" }, rowOk(defM.digest));
      mkArm(aDup, { armId: "arm-1" }, rowOk(defM.digest));
      symlinkSync(a1, aSym);
      for (const armDirs of [[a1, a1], [a1, aSym]]) {
        const err = catchError(() => loadArmBundles({
          armDirs, refMission: refM, defaultMission: defM, requireResults: true, currency: "USD", seatMap: new Map(),
        })) as BenchIngestError;
        expect([err instanceof BenchIngestError, err.code]).toEqual([true, "DUPLICATE_ARM_DIR"]);
      }
      const dupId = catchError(() => loadArmBundles({
        armDirs: [a1, aDup], refMission: refM, defaultMission: defM, requireResults: true, currency: "USD",
        seatMap: new Map(),
      })) as BenchIngestError;
      expect(dupId.code).toBe("DUPLICATE_ARM_ID");
      const runArm = (arm: Record<string, unknown>, rows: Record<string, unknown>[]) => {
        const armDir = join(dir, "x");
        rmSync(armDir, { recursive: true, force: true });
        mkArm(armDir, arm, rows);
        return loadArmBundles({
          armDirs: [armDir], refMission: refM, defaultMission: defM, requireResults: true, currency: "USD",
          seatMap: new Map(),
        });
      };
      const shpErr = catchError(() => runArm({ armId: "x", missionPath: "../badshape.json" },
        rowOk(badShape.digest))) as BenchInvariantError;
      expect(shpErr.invariant).toBe("MISSION_FIELD_SHAPE");
      for (const [arm, rows, code] of [
        [{ armId: "x", missionSha256: "f".repeat(64) }, rowOk("f".repeat(64)), "MISSION_DIGEST_MISMATCH"],
        [{ armId: "x", missionSha256: "f".repeat(64) }, rowOk(defM.digest), "MISSION_DIGEST_MISMATCH"],
        [{ armId: "x" }, [{ id: "1" }], "MISSING_ARM_DIGEST"],
        [{ armId: "x", allowLegacyMissingMissionDigest: false }, rowOk(), "MISSING_ARM_DIGEST"],
        [{ armId: "x", allowLegacyMissingMissionDigest: true }, rowOk("0".repeat(64)), "MISSION_DIGEST_MISMATCH"],
      ] as const) {
        const err = catchError(() => runArm(arm, [...rows])) as BenchIngestError;
        expect([err instanceof BenchIngestError, err.code]).toEqual([true, code]);
      }
      const sealedDir = join(dir, "sealed-mis");
      mkArm(sealedDir, { armId: "xs", missionPath: "../gold.json", missionSha256: "f".repeat(64) });
      const sealedErr = catchError(() => loadArmBundles({
        armDirs: [sealedDir], refMission: refM, defaultDigest: defM.digest, requireResults: false, currency: "USD",
        seatMap: new Map(),
      })) as BenchIngestError;
      expect(sealedErr.code).toBe("MISSION_DIGEST_MISMATCH");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("BD-5 tree-07: readConvergeGolden digest, #509 stats, fields & refusals", () => {
  const mission = {
    instruction: "x",
    fields: ["city", "toString", { name: "office", kind: "record" as const, max_values: 3, fields: [{ name: "zip" }] }],
  };
  const specs = compatibleMissionFieldShape(mission, mission).goldenSpecs;

  it("extracts goldenSha256, #509 run_stats, missing_digest_runs, alphas & prototype keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "bdi-t7-"));
    try {
      const gPath = join(dir, "converge.ndjson");
      const digest = "a".repeat(64);
      const rows = [
        { id: "1", fields: { city: { verdict: "unanimous", value: "MTL" } } },
        { type: "summary", runs: ["r1", "r2"], mission_digest: `sha256:${digest.toUpperCase()}`, ids: 1,
          missing_digest_runs: ["r1"],
          run_stats: { r1: { answered: 1, failed: 0, missing: 0, failed_by_code: { llm_error: 0 } } },
          fields: { city: { krippendorff_alpha: 0.75 },
            office: { subfields: { zip: { krippendorff_alpha: 0.625 } } } } },
      ];
      const text = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
      writeFileSync(gPath, text);
      const out = readConvergeGolden(gPath, digest, ["office.zip", "city", "toString"], specs);
      expect([out.fields, out.annotatorCount, out.missingDigestRuns, out.goldenSha256]).toEqual([
        ["office.zip", "city", "toString"], 2, ["r1"], sha256Hex(Buffer.from(text)),
      ]);
      expect(out.krippendorffAlphaByField).toEqual({ "office.zip": 0.625, city: 0.75, toString: null });
      expect(out.annotatorRunStats).toEqual({ r1: { answered: 1, failed: 0, missing: 0 } });
      const minPath = join(dir, "min.ndjson");
      writeFileSync(minPath, `${JSON.stringify({ type: "summary", runs: ["r1", "r2"], missionDigest: digest,
        fields: { city: { krippendorff_alpha: null } } })}\n`);
      const minOut = readConvergeGolden(minPath, digest, undefined, specs);
      expect({ fields: minOut.fields, annotatorRunStats: minOut.annotatorRunStats,
        missingDigestRuns: minOut.missingDigestRuns, annotatorCount: minOut.annotatorCount,
        goldenRows: minOut.goldenRows }).toEqual({
        fields: ["city", "toString", "office.zip"], annotatorRunStats: undefined, missingDigestRuns: undefined,
        annotatorCount: 2, goldenRows: [],
      });
      expect(minOut.krippendorffAlphaByField).toEqual({ city: null, toString: null, "office.zip": null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses missing/duplicate summary, bad/missing golden digest, id mismatch, and field errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "bdi-t8-"));
    try {
      const digest = "a".repeat(64);
      const okSum = { type: "summary", runs: ["r1", "r2"], mission_digest: digest, ids: 0 };
      const runGolden = (rows: unknown[], req?: string[]) => {
        const p = join(dir, "g.ndjson");
        writeFileSync(p, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
        return readConvergeGolden(p, digest, req, specs);
      };
      for (const [rows, req, code] of [
        [[{ id: "1" }], undefined, "MISSING_GOLDEN_SUMMARY"], [[okSum, okSum], undefined, "DUPLICATE_GOLDEN_SUMMARY"],
        [[{ type: "summary", runs: ["r1"] }], undefined, "MISSING_GOLDEN_DIGEST"],
        [[{ type: "summary", runs: ["r1"], mission_digest: "  " }], undefined, "MISSING_GOLDEN_DIGEST"],
        [[{ type: "summary", runs: ["r1"], mission_digest: null }], undefined, "MISSING_GOLDEN_DIGEST"],
        [[{ ...okSum, mission_digest: "b".repeat(64) }], undefined, "GOLDEN_MISSION_DIGEST_MISMATCH"],
        [[{ ...okSum, ids: 2 }], undefined, "GOLDEN_IDS_MISMATCH"],
        [[okSum], ["city", "city"], "DUPLICATE_FIELD"], [[okSum], ["office"], "UNKNOWN_FIELD"],
      ] as const) {
        const err = catchError(() => runGolden([...rows], req ? [...req] : undefined)) as BenchIngestError;
        expect([err instanceof BenchIngestError, err.code]).toEqual([true, code]);
      }
      for (const [patch, code] of [
        [{ mission_digest: 123 }, "WRONG_TYPE"], [{ runs: [] }, "BAD_SHAPE"], [{ ids: null }, "WRONG_TYPE"],
        [{ missing_digest_runs: [""] }, "EMPTY_STRING"], [{ missing_digest_runs: null }, "NOT_ARRAY"],
        [{ run_stats: { r1: { answered: -1, failed: 0, missing: 0 } } }, "BAD_COUNT"],
        [{ run_stats: { r1: { answered: 0, failed: 0, missing: 0,
          failed_by_code: { llm_error: -1 } } } }, "BAD_COUNT"],
        [{ run_stats: null }, "NOT_OBJECT"], [{ fields: null }, "NOT_OBJECT"],
        [{ fields: { city: { krippendorff_alpha: "nan" } } }, "WRONG_TYPE"],
      ] as const) {
        const err = catchError(() => runGolden([{ ...okSum, ...patch }])) as BenchResultsValidationError;
        expect([err instanceof BenchResultsValidationError, err.code]).toEqual([true, code]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("BD-5 tree-09: readCaptureStats latest-status merge & guards", () => {
  it("tracks all 10 ScrapStatus values, latest-status overwrite, and invalid_input without id", () => {
    const dir = mkdtempSync(join(tmpdir(), "bdi-t9-"));
    try {
      const rows = [
        { id: "u1", status: "ok" },
        { id: "u1", status: "dns" },
        { id: "u2", status: "ok" },
        { id: "u3", status: "http_4xx" },
        { id: "u4", status: "http_5xx" },
        { id: "u5", status: "robots_denied" },
        { id: "u6", status: "blocked_antibot" },
        { id: "u7", status: "empty_js_shell" },
        { id: "u8", status: "invalid_url" },
        { id: "u9", status: "invalid_url" },
        { id: "u9", status: "timeout" },
        { id: "", status: "invalid_input" },
        { status: "invalid_input" },
      ];
      writeFileSync(join(dir, "state.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
      expect(readCaptureStats(dir)).toEqual({
        captureSuppliedIds: 11, captureAttemptedIds: 8, captureOkIds: 1,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses missing state.jsonl, missing status/id, empty id, and unknown status", () => {
    const dir = mkdtempSync(join(tmpdir(), "bdi-t9b-"));
    try {
      const missingErr = catchError(() => readCaptureStats(dir)) as BenchResultsValidationError;
      expect([missingErr.code, missingErr.errno, isBenchIngestUsageError(missingErr)]).toEqual([
        "IO_ERROR", "ENOENT", true,
      ]);
      for (const [row, code] of [
        [{ id: "1" }, "MISSING_KEY"],
        [{ id: "1", status: "bogus" }, "BAD_ENUM"],
        [{ status: "ok" }, "MISSING_KEY"],
        [{ id: "  ", status: "ok" }, "EMPTY_STRING"],
      ] as const) {
        writeFileSync(join(dir, "state.jsonl"), `${JSON.stringify(row)}\n`);
        const err = catchError(() => readCaptureStats(dir)) as BenchResultsValidationError;
        expect([err instanceof BenchResultsValidationError, err.code]).toEqual([true, code]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("BD-5 tree-10: resolveSealedArmCost price_table, digest & provenance", () => {
  const iv = {
    estimator: "unweighted" as const, method: "wilson_95_unweighted" as const,
    clustering: "independent_site" as const, valid: true, low: 0.2, high: 0.9,
  };
  const sp = {
    goldPresentSites: 1, goldAbsentSites: 1, unresolvedSites: 0, insufficientSites: 0, tpSites: 1, fnSites: 0,
    wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 1, failedOnAbsentSites: 0, siteRecall: 1,
    siteRecallInterval: iv, siteAbstentionSpecificity: 1, siteAbstentionInterval: iv,
  };
  const baseRec = {
    armId: "arm-s", field: "city", comparator: "generic", isPrimaryComparator: true, failuresByCode: {},
    attempted: 2, accepted: 2, failed: 0, unverifiedQuotesNulled: 0, unverifiedWholeRecordsDropped: null,
    goldPositive: 1, goldAbsent: 1, tp: 1, fp: 0, fpOnPresent: 0, fpOnAbsent: 0, fpElementsOnAbsent: 0,
    fn: 0, tn: 1, failedOnAbsent: 0, unresolved: 0, insufficient: 0, sitePresence: sp, weighted: null,
    unweighted: { precision: 1, recall: 1, f1: 1, precisionInterval: iv, recallInterval: iv },
  };
  const baseArm = {
    schemaId: "urn:engram:bench-arm-manifest:1.0.0" as const, armId: "arm-s", provider: "OpenAI",
    model: "gpt-6-astra", modelLabel: "Astra", proseName: "OpenAI Astra", effort: "low" as const, isCascade: false,
  };
  const pt = { source: "pt-src", as_of: "2026-11-22", currency: "USD" as const, status: "primary" as const,
    per_million: { input: 4, output: 0 } };
  const fx = { from: "USD" as const, to: "CAD" as const, rate: 2, source: "boc", asOf: "2026-11-22" };

  it("prices via price_table without seat, honors unpinned armMissionSha256, and stamps tariff/FX", () => {
    const [dc, other] = ["c".repeat(64), "d".repeat(64)];
    const toks = { input: 500_000, output: 0, reasoning: 0, cached: "unknown" as const, total: 500_000 };
    const priced = resolveSealedArmCost([{ ...baseRec, calls: 2, costBasisItems: 2, tokens: toks }],
      { ...baseArm, tariffStatus: "secondary_unverified", fx }, "CAD", dc, undefined, pt);
    expect([priced?.cost.apiEquivalentTotal, priced?.cost.apiEquivalentPerItem, priced?.cost.costUnknownReason,
      priced?.cost.tariffStatus, priced?.cost.tariffSource, priced?.cost.tariffAsOf, priced?.cost.fxApplied])
      .toEqual([4, 2, null, "secondary_unverified", "pt-src", "2026-11-22", fx]);
    const over = resolveSealedArmCost([{ ...baseRec, calls: 2, costBasisItems: 2, apiEquivalentTotal: 1 }],
      { ...baseArm, tariffStatus: "secondary_unverified", fx,
        tariffOverride: { status: "unknown", currency: "USD", source: "ov", asOf: "2026-11-23" } },
      "CAD", dc, undefined, pt);
    expect([over?.cost.apiEquivalentTotal, over?.cost.tariffStatus, over?.cost.tariffSource, over?.cost.tariffAsOf])
      .toEqual([1, "unknown", "ov", "2026-11-23"]);
    const seat = {
      status: "measured" as const, method: "weekly_burn_delta" as const, windowMinutes: 10080 as const,
      isolatedSeat: true as const, plan: "Pro", planMonthlyPrice: 487, planSource: "s", planAsOf: "2026-11-22",
      remainingBefore: 0.75, remainingAfter: 0.25, observedItems: 8,
    };
    const unpinned = resolveSealedArmCost([
      { ...baseRec, armMissionSha256: other, calls: 1, costBasisItems: 1, tokens: toks },
      { ...baseRec, field: "zip", armMissionSha256: `SHA256:${other.toUpperCase()}`, calls: 1, costBasisItems: 1,
        tokens: toks },
    ], baseArm, "USD", dc, seat, pt);
    expect([unpinned?.armMissionSha256, unpinned?.cost.apiEquivalentTotal, unpinned?.cost.costUnknownReason,
      unpinned?.cost.seatCostPerItem]).toEqual([other, "unknown", "unpriced-mission", 7]);
    const badPt = { ...pt, currency: "EUR" as unknown as "USD" };
    expect((catchError(() => resolveSealedArmCost([], baseArm, "USD", dc, undefined, badPt)) as BenchCostSeatError)
      .code).toBe("BAD_ENUM");
    expect((catchError(() => resolveSealedArmCost([{ ...baseRec, armMissionSha256: other }],
      { ...baseArm, missionSha256: dc }, "USD", dc, undefined, undefined)) as BenchIngestError).code)
      .toBe("MISSION_DIGEST_MISMATCH");
  });

  it("enforces sealed FX/currency (P2), zero-basis (P3/I39), sourceCurrency tiers (I40-I43) & estimated seat", () => {
    const dc = "c".repeat(64);
    const toks = { input: 500_000, output: 0, reasoning: 0, cached: 0, total: 500_000 };
    const seat = {
      status: "measured" as const, method: "weekly_burn_delta" as const, windowMinutes: 10080 as const,
      isolatedSeat: true as const, plan: "Pro", planMonthlyPrice: 487, planSource: "s", planAsOf: "2026-11-22",
      remainingBefore: 0.75, remainingAfter: 0.25, observedItems: 8,
    };
    for (const [recPatch, armPatch, cur, rawPt, exSeat] of [
      [{ calls: 1, costBasisItems: 1, apiEquivalentTotal: 1 },
        { fx: { from: "USD" as const, to: "USD" as const, rate: 1, source: "b", asOf: "d" } }, "CAD", undefined,
        undefined],
      [{ calls: 1, costBasisItems: 1, apiEquivalentTotal: 1 },
        { fx: { from: "CAD" as const, to: "CAD" as const, rate: 2, source: "b", asOf: "d" } }, "CAD", undefined, seat],
      [{ calls: 1, costBasisItems: 1 },
        { tariffOverride: { status: "primary" as const, currency: "USD" as const, source: "s", asOf: "d" } },
        "CAD", undefined, seat],
      [{ calls: 1, costBasisItems: 1, apiEquivalentTotal: 1 },
        { fx, tariffOverride: { status: "primary" as const, currency: "CAD" as const, source: "s", asOf: "d" } },
        "USD", pt, seat],
      [{ calls: 1, costBasisItems: 1, apiEquivalentTotal: 1 }, {}, "CAD", pt, seat],
    ] as const) {
      const err = catchError(() => resolveSealedArmCost([{ ...baseRec, ...recPatch }],
        { ...baseArm, ...armPatch }, cur, dc, exSeat, rawPt)) as BenchCostSeatError;
      expect([err instanceof BenchCostSeatError, err.code]).toEqual([true, "CURRENCY_MISMATCH"]);
    }
    for (const [recPatch, exSeat] of [
      [{ calls: 2 }, seat],
      [{ apiEquivalentTotal: 1 }, seat],
      [{ calls: 3, costBasisItems: 0 }, seat],
    ] as const) {
      const err = catchError(() => resolveSealedArmCost([{ ...baseRec, ...recPatch }],
        baseArm, "USD", dc, exSeat, undefined)) as { code?: string };
      expect([isBenchIngestUsageError(err), err.code]).toEqual([true, "COST_BASIS"]);
    }
    const zeroApi = catchError(() => resolveSealedArmCost(
      [{ ...baseRec, calls: 0, costBasisItems: 0, apiEquivalentTotal: 5 }],
      baseArm, "USD", dc, seat, undefined)) as BenchCostSeatError;
    expect([zeroApi instanceof BenchCostSeatError, zeroApi.code]).toEqual([true, "BAD_SHAPE"]);
    const zeroOk = resolveSealedArmCost(
      [{ ...baseRec, calls: 0, costBasisItems: 0, apiEquivalentTotal: 0 }], baseArm, "USD", dc, seat, undefined);
    expect([zeroOk?.callsPerItem, zeroOk?.cost.apiEquivalentTotal, zeroOk?.cost.apiEquivalentPerItem])
      .toEqual([0, 0, 0]);
    const ovRate = { status: "primary" as const, source: "ov", asOf: "d", perMillion: { input: 4, output: 0 } };
    const t40 = resolveSealedArmCost([{ ...baseRec, calls: 1, costBasisItems: 1, tokens: toks }],
      { ...baseArm, fx, tariffOverride: { ...ovRate, currency: "CAD" } }, "CAD", dc, undefined, pt);
    const t41 = resolveSealedArmCost([{ ...baseRec, calls: 1, costBasisItems: 1, tokens: toks }],
      { ...baseArm, fx, tariffOverride: ovRate }, "CAD", dc, undefined, { ...pt, currency: "CAD" });
    const t42 = resolveSealedArmCost([{ ...baseRec, calls: 1, costBasisItems: 1, tokens: toks }],
      { ...baseArm, fx, tariffOverride: ovRate }, "CAD", dc, undefined, undefined);
    const missTok = resolveSealedArmCost([{ ...baseRec, costBasisItems: 1 }],
      baseArm, "USD", dc, undefined, pt);
    const estSeat = {
      status: "estimated" as const, method: "api_cost_proportional" as const, windowMinutes: 10080 as const,
      plan: "Pro", planMonthlyPrice: 100, planSource: "s", planAsOf: "d", observedApiEquivalent: 10,
      quotaDeltaFraction: 0.25, basePlanMultiplier: 1, targetPlanMultiplier: 2,
    };
    const est = resolveSealedArmCost([{ ...baseRec, costBasisItems: 1, tokens: toks }],
      baseArm, "USD", dc, estSeat, pt);
    expect([t40?.cost.apiEquivalentTotal, t41?.cost.apiEquivalentTotal, t42?.cost.apiEquivalentTotal,
      missTok?.cost.costUnknownReason, est?.calls, est?.callsPerItem, est?.cost.seatStatus,
      resolveSealedArmCost([], baseArm, "USD", dc, seat, undefined),
      resolveSealedArmCost([{ ...baseRec }], baseArm, "USD", dc, undefined, undefined),
    ]).toEqual([2, 2, 4, "missing-usage", "unknown", "unknown", "estimated", undefined, undefined]);
  });

  it("enforces multi-record COST_CONFLICT per field and per tokensEqual key (I29-I32)", () => {
    const dc = "c".repeat(64);
    const other = "d".repeat(64);
    const tokA = { input: 100, output: 10, reasoning: 5, cached: 2, total: 115 };
    const tokB = { total: 115, cached: 2, reasoning: 5, output: 10, input: 100 };
    const rec = {
      ...baseRec, armMissionSha256: `SHA256:${dc.toUpperCase()}`, calls: 4, costBasisItems: 2,
      apiEquivalentTotal: 1, tokens: tokA,
    };
    const ok = resolveSealedArmCost([rec, { ...rec, field: "zip", armMissionSha256: dc, tokens: tokB }],
      baseArm, "USD", dc, undefined, pt);
    expect([ok?.calls, ok?.callsPerItem, ok?.tokens, ok?.cost.apiEquivalentTotal, ok?.cost.apiEquivalentPerItem])
      .toEqual([4, 2, tokA, 1, 0.5]);
    for (const conflictPatch of [
      { calls: 5 },
      { costBasisItems: 3 },
      { apiEquivalentTotal: 2 },
      { armMissionSha256: other },
      { tokens: { ...tokA, input: 101 } },
      { tokens: { ...tokA, output: 11 } },
      { tokens: { ...tokA, reasoning: 6 } },
      { tokens: { ...tokA, cached: 3 } },
      { tokens: { ...tokA, cached: "unknown" as const } },
      { tokens: { ...tokA, total: 116 } },
      { tokens: undefined },
    ]) {
      const err = catchError(() => resolveSealedArmCost(
        [rec, { ...rec, field: "zip", ...conflictPatch }], baseArm, "USD", dc, undefined, pt,
      )) as BenchIngestError;
      expect([err instanceof BenchIngestError, err.code]).toEqual([true, "COST_CONFLICT"]);
    }
  });
});

describe("BD-5 tree-13: runScrapScore e2e literal campaign & #509 corpus projections", () => {
  it("scores scalar+record+#509 campaign e2e, writes out, and projects all corpus fields", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bd5-s-"));
    try {
      const mObj = (ins: string, mv: number, inRate: number) => ({ instruction: ins,
        fields: ["city", { name: "office", kind: "record", max_values: mv, fields: [{ name: "postal_code" }] }],
        price_table: { source: "pt", as_of: "2026-11-22", currency: "USD", status: "primary",
          per_million: { input: inRate, output: 0 } } });
      const [mg, mc] = ["mg", "mc"].map((name) => join(tmpDir, `${name}.json`)) as string[];
      writeFileSync(mg!, JSON.stringify(mObj("g", 2, 1)));
      writeFileSync(mc!, JSON.stringify(mObj("c", 2, 1)));
      const [gd, cd] = [loadCheckedMission(mg!).digest, loadCheckedMission(mc!).digest];
      const gRows = [
        { id: "1", fields: { city: { verdict: "unanimous", value: "MTL", n_answered: 2 },
          office: { verdict: "unanimous", n_answered: 2,
            aligned: [{ fields: { postal_code: { verdict: "unanimous", value: "H2Y 1S1" } } }] } } },
        { id: "2", fields: { city: { verdict: "absent", value: null, n_answered: 2 },
          office: { verdict: "absent", n_answered: 2, aligned: [], unmatched: [] } } },
        { id: "3", fields: { city: { verdict: "insufficient", value: null, n_answered: 1 },
          office: { verdict: "insufficient", n_answered: 1, aligned: [], unmatched: [] } } },
        { type: "summary", runs: ["r1", "r2"], mission_digest: gd, ids: 3, missing_digest_runs: ["r1"],
          run_stats: { r1: { answered: 2, failed: 1, missing: 0, failed_by_code: { llm_error: 1 } } },
          fields: { city: { krippendorff_alpha: 1 },
            office: { subfields: { postal_code: { krippendorff_alpha: 0.8 } } } } },
      ];
      const gText = `${gRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
      const [gPath, capDir, arm1] = ["converge.ndjson", "cap", "a1"].map((n) => join(tmpDir, n)) as string[];
      writeFileSync(gPath!, gText);
      mkdirSync(capDir!);
      writeFileSync(join(capDir!, "state.jsonl"),
        `${JSON.stringify({ id: "1", status: "ok" })}\n${JSON.stringify({ id: "2", status: "dns" })}\n`);
      mkdirSync(arm1!);
      writeFileSync(join(arm1!, "arm.json"), JSON.stringify({ schemaId: "urn:engram:bench-arm-manifest:1.0.0",
        armId: "arm-a", provider: "OpenAI", model: "gpt-6-astra", modelLabel: "Astra", proseName: "OpenAI Astra",
        effort: "low", isCascade: false }));
      const aRows = [
        { id: "1", fields: { city: { value: "mtl" }, office: { values: [{ postal_code: { value: "h2y 1s1" } }] } } },
        { id: "2", fields: { city: { value: null }, office: { values: [] } } },
        { id: "3", error: "llm_error", fields: null },
        { type: "summary", ok: 2, failed: 1, calls_total: 3, mission_digest: cd,
          tokens: { input: 500_000, output: 0, reasoning: 0, total: 500_000 } },
      ];
      writeFileSync(join(arm1!, "results.ndjson"), `${aRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
      const outDef = join(tmpDir, "sub/def.json");
      const resDef = await runScrapScore({
        golden: gPath!, goldenMission: mg!, candidateMission: mc!, arms: [arm1!], out: outDef, campaignId: "lotb",
        captureDir: capDir!,
      });
      expect(readBenchResultsFile(outDef)).toEqual(resDef);
      expect([resDef.generatedAt.endsWith(".000Z"), resDef.corpus.partition, resDef.corpus.costBasisLabel,
        resDef.corpus.currency, resDef.corpus.maxValuesChanged, resDef.corpus.goldenSha256,
        resDef.corpus.annotatorCount, resDef.corpus.goldenMissionSha256, resDef.corpus.candidateMissionSha256,
        resDef.corpus.captureSuppliedIds, resDef.corpus.captureAttemptedIds, resDef.corpus.captureOkIds,
        resDef.corpus.missingDigestRuns, resDef.corpus.annotatorRunStats, resDef.corpus.krippendorffAlphaByField,
        resDef.supportFloors, resDef.records[0]?.precisionInterval, resDef.records[1]?.precisionInterval.method,
        resDef.records.map((r) => [r.field, r.tp, r.tn, r.insufficient, r.precision, r.cost.apiEquivalentTotal]),
      ]).toEqual([false, "eval", "extracted_packet", "USD", undefined, sha256Hex(Buffer.from(gText)), 2, gd, cd,
        2, 2, 1, ["r1"], { r1: { answered: 2, failed: 1, missing: 0 } }, { city: 1, "office.postal_code": 0.8 },
        { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05 },
        { estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
          ...wilson95(1, 1) }, "none",
        [["city", 1, 1, 1, 1, 0.5], ["office.postal_code", 1, 1, 1, 1, 0.5]]]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
