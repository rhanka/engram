import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { beforeAll, expect, it } from "vitest";
import type { ReplayReport } from "./fixtures/p1-7-replay.js";

const baselineCommit = "b2e3fb8d1627e8c8c1ae8fbed9ce78ef76e3f502";
const root = fileURLToPath(new URL("../", import.meta.url));
const runner = "tests/fixtures/p1-7-replay.ts";
let baseline: ReplayReport, candidate: ReplayReport;

beforeAll(() => {
  const scratch = mkdtempSync(join(tmpdir(), "engram-p1-7-"));
  try {
    const snapshot = join(scratch, "baseline");
    mkdirSync(join(snapshot, "tests/fixtures"), { recursive: true });
    const archive = execFileSync("git", ["archive", baselineCommit, "src", "profiles/app-context/v1", "registry/entries.v1.json"],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-"], { cwd: snapshot, input: archive });
    copyFileSync(join(root, runner), join(snapshot, runner));
    symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "junction");
    const replay = (side: string, cwd: string): ReplayReport => {
      const outfile = join(scratch, "bundles", side, "replay.mjs");
      buildSync({ absWorkingDir: cwd, entryPoints: [runner], bundle: true, platform: "node",
        format: "esm", packages: "external", outfile });
      return JSON.parse(execFileSync(process.execPath, [outfile, scratch, side], { cwd, encoding: "utf8" }));
    };
    baseline = replay("baseline", snapshot);
    candidate = replay("candidate", root);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 30_000);

it("keeps the six-pin baseline census and replays every Engram pin, including drafts", () => {
  expect(Object.keys(baseline.census).sort()).toEqual([
    "diagram/archi@1.0.0", "diagram/archimate@1.0.0", "diagram/generic@1.0.0", "diagram/uml@1.0.0",
    "engram/app-context@1", "openerp/openerp@1",
  ]);
  expect(baseline.census["engram/app-context@1"]).toMatchObject({ sources: ["manifest", "records"] });
  expect(candidate.censusError ?? candidate.census).toEqual(baseline.census);
  const required = Object.keys(baseline.census).filter((key) => baseline.census[key]!.pin.profileShape === "engram-profile").sort();
  expect(Object.keys(baseline.receipts).sort()).toEqual(required);
  expect(Object.keys(candidate.receipts).sort()).toEqual(required);
});

it("replays the exact Engram loader bytes, pinned hashes, and bundle outcomes", () => {
  for (const [key, historical] of Object.entries(baseline.receipts)) {
    const current = candidate.receipts[key]!;
    expect(current, `${key} candidate receipt`).toBeDefined();
    const pin = baseline.census[key]!.pin.digest;
    const before = Buffer.from(historical.bytes, "base64");
    const after = Buffer.from(current.bytes, "base64");
    expect.soft(after.equals(before), `${key} SHA-256 input`).toBe(true);
    expect.soft(historical.bundleOutcome, `${key} baseline bundle outcome`).toBeDefined();
    expect.soft(current.bundleOutcome, `${key} bundle outcome`).toEqual(historical.bundleOutcome);
    for (const [receipt, bytes] of [[historical, before], [current, after]] as const) {
      expect.soft(createHash("sha256").update(bytes).digest("hex"), `${key} preimage digest`).toBe(pin);
      expect.soft(receipt, `${key} loader and bundle profile hashes`).toMatchObject({ profileHash: pin, bundleHashes: [pin, pin] });
    }
  }
});

it("preserves the bundle refusal for a file-backed linking normalizer", () => {
  expect(baseline.refusal).toMatchObject({ ok: false, refusalCode: "unsupported_linking_fn" });
  expect(candidate.refusal).toEqual(baseline.refusal);
});
