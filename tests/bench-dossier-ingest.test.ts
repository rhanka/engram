import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BenchCostSeatError } from "../src/bench-dossier/cost-seat.js";
import {
  parseImportMetricsArgv, parseImportMetricsOptions, parseScrapScoreArgv, parseScrapScoreOptions,
} from "../src/bench-dossier/ingest-cli.js";
import {
  BenchIngestError, isBenchIngestUsageError, loadCheckedMission,
  normalizeDigest, readCheckedBuf, sha256Hex,
} from "../src/bench-dossier/ingest-golden.js";
import { loadArmBundles } from "../src/bench-dossier/ingest-io.js";
import { BenchInvariantError } from "../src/bench-dossier/invariants.js";
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
});
