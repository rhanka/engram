import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BenchCostSeatError } from "../src/bench-dossier/cost-seat.js";
import {
  BenchIngestError, isBenchIngestUsageError, loadCheckedMission,
  normalizeDigest, readCheckedBuf, sha256Hex,
} from "../src/bench-dossier/ingest-golden.js";
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
