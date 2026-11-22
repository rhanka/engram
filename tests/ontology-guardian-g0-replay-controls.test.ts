import { createHash } from "node:crypto"; import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path"; import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { beforeAll, expect, it } from "vitest";
import type { ReplayReport } from "./fixtures/p1-7-replay.js";
const baselineCommit = "453b95b55d3d1f8d89cf181a3ea53ed16d8e7260";
const root = fileURLToPath(new URL("../", import.meta.url));
const runner = "tests/fixtures/p1-7-replay.ts";
let baseline: ReplayReport, candidate: ReplayReport;
const setup = (tag: string): [string, string] => {
  const scratch = mkdtempSync(join(tmpdir(), `engram-g0-1c-${tag}-`));
  const snapshot = join(scratch, "baseline");
  mkdirSync(join(snapshot, "tests/fixtures"), { recursive: true });
  const archive = execFileSync("git", ["archive", baselineCommit, "src", "profiles/app-context/v1", "registry/entries.v1.json"], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  execFileSync("tar", ["-xf", "-"], { cwd: snapshot, input: archive });
  copyFileSync(join(root, runner), join(snapshot, runner));
  symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "junction");
  return [scratch, snapshot];
};
const replayIn = (scratch: string, cwd: string, side: string): ReplayReport => {
  const outfile = join(scratch, "bundles", side, "replay.mjs");
  buildSync({ absWorkingDir: cwd, entryPoints: [runner], bundle: true, platform: "node", format: "esm", packages: "external", outfile });
  return JSON.parse(execFileSync(process.execPath, [outfile, scratch, side], { cwd, encoding: "utf8" }));
};
beforeAll(() => {
  const [scratch, snapshot] = setup("base");
  try {
    baseline = replayIn(scratch, snapshot, "baseline");
    candidate = replayIn(scratch, root, "candidate");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60_000);
type Gated = ReplayReport & { nativeReceipts?: Record<string, { bytes: string; digest: string }>; ownerCovered?: string[]; privateUncovered?: string[]; controls?: Record<string, boolean>; controlDigests?: Record<string, string> };
const full = (report: ReplayReport): Gated => report as Gated;
const coveredKeys = (report: ReplayReport): string[] =>
  [...Object.keys(report.receipts), ...Object.keys(full(report).nativeReceipts ?? {})].sort();
const requiredKeys = (report: ReplayReport): string[] =>
  Object.keys(report.census).filter((key) => !(full(report).ownerCovered ?? []).includes(key)).sort();
const releasePass = (report: ReplayReport): boolean => {
  const gated = full(report);
  const keys = requiredKeys(report);
  return report.censusError === undefined && keys.length > 0 && coveredKeys(report).join() === keys.join() && (gated.privateUncovered ?? ["missing"]).length === 0 && Object.keys(gated.controls ?? {}).length > 0 && Object.values(gated.controls ?? {}).every(Boolean);
};
it("replays every native diagram preimage byte-identically against its pin", () => {
  const history = Object.entries(full(baseline).nativeReceipts ?? {});
  expect(history.length).toBeGreaterThan(0);
  for (const [key, historical] of history) {
    const current = full(candidate).nativeReceipts?.[key]!;
    expect(current).toBeDefined();
    expect([current.bytes, current.digest]).toEqual([historical.bytes, historical.digest]);
    for (const bytes of [historical.bytes, current.bytes]) expect(createHash("sha256").update(Buffer.from(bytes, "base64")).digest("hex"), `${key} bytes digest`).toBe(baseline.census[key]!.pin.digest);
    expect(candidate.census[key]?.pin.digest, `${key} candidate census pin`).toBe(baseline.census[key]!.pin.digest);
  }
});
it("covers applicable private-owner receipts instead of passing incomplete", () => {
  for (const report of [baseline, candidate]) {
    expect([full(report).ownerCovered ?? [], full(report).privateUncovered]).toEqual([[], []]);
    expect(releasePass(report)).toBe(true);
  }
  expect(releasePass({ ...baseline, privateUncovered: ["diagram/generic@1.0.0"] } as ReplayReport)).toBe(false);
  const [scratch, snapshot] = setup("private");
  try {
    const registry = join(snapshot, "src/ontology-guardian/openerp-registry.ts");
    writeFileSync(registry, readFileSync(registry, "utf8").replace('visibility: "public"', 'visibility: "private:acme"'));
    const exposed = replayIn(scratch, snapshot, "baseline");
    expect(full(exposed).privateUncovered).toEqual(["openerp/openerp@1"]);
    expect(releasePass(exposed)).toBe(false);
    writeFileSync(join(scratch, "owner-receipts.json"), JSON.stringify({ "openerp/openerp@1": { digest: exposed.census["openerp/openerp@1"]!.pin.digest, equal: true } }));
    const covered = replayIn(scratch, snapshot, "candidate");
    expect(releasePass(covered)).toBe(true);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
it("requires one matching receipt per census pin and runs the remaining §5 controls", () => {
  for (const report of [baseline, candidate]) {
    expect(coveredKeys(report)).toEqual(requiredKeys(report));
    expect(full(report).controls).toMatchObject({ attributesEmptyTrips: true, keyOrderStable: true, numericVersionStable: true, renormalizeStable: true, bindStable: true, bundleBoundStable: true, bundleRenumberedStable: true, bundleExtensionsEmpty: true });
    for (const [key, receipt] of Object.entries(report.receipts)) expect((receipt as { boundHash?: string }).boundHash, `${key} bind preserves the digest`).toBe(receipt.profileHash);
    expect(releasePass(report)).toBe(true);
  }
  expect(Object.keys(full(baseline).controlDigests ?? {}).sort()).toEqual(["bundleBound", "bundleBoundDigest", "bundleRenumbered", "controlBind", "controlNormalize", "renumbered", "reordered"]);
  expect(full(candidate).controlDigests).toEqual(full(baseline).controlDigests);
  expect(releasePass({ ...baseline, controls: { ...full(baseline).controls, keyOrderStable: false } } as ReplayReport)).toBe(false);
});
