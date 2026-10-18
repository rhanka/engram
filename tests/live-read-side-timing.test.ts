import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildReadSideFixtures, cloneReadSideSource, inventoryDigest, LiveGitSandbox,
} from "./helpers/live-git-fixtures.js";

const BENCH = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/bench-live.mjs");
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const READ_SIDE_CASE_COUNT = 20;
const READ_SIDE_CONTINUATION_THRESHOLD = 0.30;
const isNonSuccessState = (state: string) => state !== "verified";
const counterbalancedOrder = (id: number) => id % 2 ? ["T0", "T1"] : ["T1", "T0"];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

interface Oracle {
  id: string;
  repository: string;
  argv: string[];
  expected: { status: number; bytes?: number; sha256?: string; contains?: string[] };
}
interface SyntheticCase {
  id: number;
  question: string;
  type: string;
  pins: Record<string, { algorithm: string; oid: string }>;
  permissions: {
    repositories: string[];
    committedRead: string;
    localStateRead: string;
    observedWrite: boolean;
    externalDisclosure: { allowed: boolean };
    secretExclusions: boolean;
  };
  expected: {
    state: string;
    answer: string;
    reason: { state: string; value: string; evidence: string[] } | null;
    missingCapabilities?: string[];
    requiredOutcome?: string;
    emittedBytes?: number;
    capture?: null;
    generation?: null;
    recoveryRequired?: boolean;
  };
  oracles: Oracle[];
}

const gitEnv = (root: string): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: "/usr/bin:/bin",
  HOME: root,
  XDG_CONFIG_HOME: root,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_ATTR_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Read Timing Fixture",
  GIT_AUTHOR_EMAIL: "read-timing@example.invalid",
  GIT_COMMITTER_NAME: "Read Timing Fixture",
  GIT_COMMITTER_EMAIL: "read-timing@example.invalid",
  GIT_AUTHOR_DATE: "1700000000 +0000",
  GIT_COMMITTER_DATE: "1700000000 +0000",
  GIT_TERMINAL_PROMPT: "0",
});

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv, input?: string): { status: number; stdout: Buffer } {
  try {
    const stdout = execFileSync("git", args, { cwd, env, input, maxBuffer: 8 * 1024 * 1024 });
    return { status: 0, stdout: Buffer.from(stdout) };
  } catch (error) {
    const e = error as { status?: number; stdout?: Buffer };
    if (typeof e.status === "number") return { status: e.status, stdout: Buffer.from(e.stdout ?? []) };
    throw error;
  }
}

let root = "";
let manifestPath = "";
let repoA = "";
let repoB = "";
let manifest: { cases: SyntheticCase[] } & Record<string, unknown>;
let evidence: Record<string, any>;
let evidenceRaw = "";

function buildRepo(path: string, env: NodeJS.ProcessEnv, files: Record<string, string>, message: string): string {
  mkdirSync(path, { recursive: true });
  git(path, ["init", "-q", "--initial-branch=main"], env);
  git(path, ["config", "commit.gpgSign", "false"], env);
  for (const [name, content] of Object.entries(files)) {
    const full = join(path, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const tree = git(path, ["write-tree"], env).stdout.toString().trim();
  void tree;
  git(path, ["add", "-A"], env);
  git(path, ["commit", "-q", "-m", message], env);
  return git(path, ["rev-parse", "HEAD"], env).stdout.toString().trim();
}

function oracle(cwd: string, env: NodeJS.ProcessEnv, id: string, repository: string, argv: string[]): Oracle {
  const result = git(cwd, ["--no-optional-locks", "-c", "core.fsmonitor=false", ...argv], env);
  return {
    id,
    repository,
    argv,
    expected: { status: result.status, bytes: result.stdout.length, sha256: sha256(result.stdout) },
  };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "engram-live-read-side-"));
  mkdirSync(join(root, "tmp"), { recursive: true });
  const env = gitEnv(root);
  repoA = join(root, "repo-a");
  repoB = join(root, "repo-b");
  const a1 = buildRepo(repoA, env, { "doc.txt": "alpha\nbeta\ngamma\n", "src/code.ts": "export const x = 1;\n" }, "synthetic Git control");
  const a2 = buildRepo(repoB, env, { "store.txt": "policy one\n", "src/item.ts": "export const y = 2;\n" }, "synthetic sentropic control");
  void a1;
  void a2;
  const headA = git(repoA, ["rev-parse", "HEAD"], env).stdout.toString().trim();
  const headB = git(repoB, ["rev-parse", "HEAD"], env).stdout.toString().trim();
  const treeA = git(repoA, ["rev-parse", "HEAD^{tree}"], env).stdout.toString().trim();
  const blobDoc = git(repoA, ["rev-parse", `HEAD:doc.txt`], env).stdout.toString().trim();

  const perms = (repositories: string[]) => ({
    repositories,
    committedRead: "authorized",
    localStateRead: "not-authorized",
    observedWrite: false,
    externalDisclosure: { allowed: false },
    secretExclusions: true,
  });
  const ready = (text: string) => ({ state: "oracle-ready", answer: text, reason: null });
  const cases: SyntheticCase[] = [];
  const push = (entry: SyntheticCase): void => {
    cases.push(entry);
  };
  // 13 oracle-ready cases over the two synthetic controls.
  const readyOracles: Array<[string, string, string, string[]]> = [
    ["r1-endpoint", "synthetic-h2a", repoA, ["rev-parse", "--verify", headA]],
    ["r2-blob", "synthetic-h2a", repoA, ["cat-file", "blob", blobDoc]],
    ["r3-tree", "synthetic-h2a", repoA, ["ls-tree", "-r", "--name-only", headA]],
    ["r4-log", "synthetic-h2a", repoA, ["log", "--format=%H %s", headA]],
    ["r5-show", "synthetic-h2a", repoA, ["show", "-s", "--format=%B", headA]],
    ["r6-diff", "synthetic-h2a", repoA, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--stat", headA]],
    ["r7-blame", "synthetic-h2a", repoA, ["blame", "--root", "--line-porcelain", headA, "--", "doc.txt"]],
    ["r8-parents", "synthetic-h2a", repoA, ["rev-list", "--parents", "--no-walk", headA]],
    ["r9-tree-sha", "synthetic-h2a", repoA, ["rev-parse", "--verify", `${treeA}`]],
    ["r10-endpoint", "synthetic-s", repoB, ["rev-parse", "--verify", headB]],
    ["r11-blob", "synthetic-s", repoB, ["cat-file", "-t", headB]],
    ["r12-log", "synthetic-s", repoB, ["log", "--format=%H", "--no-merges", headB]],
    ["r13-ls", "synthetic-s", repoB, ["ls-tree", headB]],
  ];
  readyOracles.forEach(([id, repository, cwd, argv], index) => {
    push({
      id: index + 1,
      question: `synthetic investigation ${index + 1}: which pinned object anchors this control?`,
      type: "synthetic-oracle",
      pins: { P: { algorithm: "sha1", oid: headA } },
      permissions: perms([repository]),
      expected: ready(`Synthetic control answer ${index + 1}: the pinned endpoint identifies the revision without disclosing file bytes.`),
      oracles: [oracle(cwd, env, id, repository, argv)],
    });
  });
  // 4 G3/G5 capacité absente cases; undocumented reasons stay « inconnu ».
  const absentReasons: Array<[number, string[], { state: string; value: string; evidence: string[] } | null, string, string[]]> = [
    [14, ["G3"], { state: "inconnu", value: "inconnu", evidence: [] }, "synthetic-h2a", ["show", "-s", "--format=%B", headA]],
    [15, ["G3"], { state: "inconnu", value: "inconnu", evidence: [] }, "synthetic-h2a", ["cat-file", "-t", headA]],
    [16, ["G3"], { state: "documented", value: "synthetic relocation note", evidence: ["anchor"] }, "synthetic-h2a", ["show", "-s", "--format=%B", headA]],
    [17, ["G5"], null, "synthetic-s", ["log", "--format=%H", headB]],
  ];
  for (const [id, missing, reason, repository, argv] of absentReasons) {
    const cwd = repository === "synthetic-h2a" ? repoA : repoB;
    const anchor = oracle(cwd, env, "anchor", repository, argv);
    push({
      id,
      question: `synthetic investigation ${id}: why does this control exist without a documented reason?`,
      type: "synthetic-absent",
      pins: { P: { algorithm: "sha1", oid: repository === "synthetic-h2a" ? headA : headB } },
      permissions: perms([repository]),
      expected: {
        state: "capacité absente",
        answer: `Synthetic control answer ${id}: the missing capability is explicit and no reason is invented.`,
        reason,
        missingCapabilities: missing,
      },
      oracles: [anchor],
    });
  }
  // Case 18: capture-absent (no stable capture supplied).
  push({
    id: 18,
    question: "synthetic investigation 18: what is the latest authorized index state?",
    type: "synthetic-capture",
    pins: { P: { algorithm: "sha1", oid: headA } },
    permissions: perms(["synthetic-h2a"]),
    expected: {
      state: "capture-absent",
      answer: "Synthetic control answer 18: no authorized stable capture was supplied; the committed tree proves no worktree state.",
      reason: null,
      capture: null,
      generation: null,
      recoveryRequired: true,
    },
    oracles: [oracle(repoA, env, "endpoint-only", "synthetic-h2a", ["rev-parse", "--verify", `${headA}^{tree}`])],
  });
  // Case 19: deliberate oracle mismatch stays retained as failed with its error.
  const mismatch = oracle(repoA, env, "mismatch", "synthetic-h2a", ["rev-parse", "--verify", headA]);
  mismatch.expected.sha256 = "0".repeat(64);
  push({
    id: 19,
    question: "synthetic investigation 19: which pinned object anchors this control?",
    type: "synthetic-oracle",
    pins: { P: { algorithm: "sha1", oid: headA } },
    permissions: perms(["synthetic-h2a"]),
    expected: ready("Synthetic control answer 19: this case carries a deliberately wrong digest and must stay retained as failed."),
    oracles: [mismatch],
  });
  // Case 20: G4 stays closed with the typed policy-unavailable refusal.
  push({
    id: 20,
    question: "synthetic investigation 20: can an unauthorized agent obtain unpublished content?",
    type: "synthetic-denial",
    pins: { P: { algorithm: "sha1", oid: headB } },
    permissions: perms(["synthetic-s"]),
    expected: {
      state: "capacité absente",
      answer: "Synthetic control answer 20: G4 is absent and the required outcome is refusal before emission with zero emitted bytes.",
      reason: null,
      missingCapabilities: ["G4"],
      requiredOutcome: "refusal-before-emission",
      emittedBytes: 0,
    },
    oracles: [oracle(repoB, env, "unpublished-endpoint", "synthetic-s", ["rev-parse", "--verify", `${headB}^{tree}`])],
  });

  manifest = {
    version: 1,
    oracleVersion: "synthetic-read-side/1",
    measurement: "unverified",
    installedQualification: "unverified",
    protocol: {
      cases: 20,
      arms: ["T0-current-available-workflow", "existing-planned-readers-only", "T1-native-read-side-with-G1-G5"],
      score: "median(1 - T1_i/T0_i)",
      population: "all-20-first-investigations",
      continuationThreshold: READ_SIDE_CONTINUATION_THRESHOLD,
    },
    revisions: {},
    cases,
  };
  manifestPath = join(root, "cases.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const outPath = join(root, "evidence.json");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: "/usr/bin:/bin",
    TMPDIR: join(root, "tmp"),
    XDG_RUNTIME_DIR: root,
    XDG_STATE_HOME: join(root, "state"),
    XDG_CONFIG_HOME: join(root, "config"),
  };
  const output = execFileSync(
    process.execPath,
    [BENCH, "--manifest", manifestPath, "--repo", `synthetic-h2a=${repoA}`, "--repo", `synthetic-s=${repoB}`, "--out", outPath],
    { env: childEnv, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
  );
  void output;
  evidenceRaw = readFileSync(outPath, "utf8");
  evidence = JSON.parse(evidenceRaw) as Record<string, any>;
}, 180_000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("counterbalanced first investigations retain all twenty cases and classification costs and separate existing reader gains from native additions", () => {
  it("retains all twenty first investigations with no case removed", () => {
    expect(evidence.cases).toHaveLength(READ_SIDE_CASE_COUNT);
    expect(evidence.cases.map((c: { id: number }) => c.id)).toEqual(
      Array.from({ length: READ_SIDE_CASE_COUNT }, (_, index) => index + 1),
    );
    expect(evidence.population).toBe("all-20-first-investigations");
  });

  it("records expected answers before timing and hides them from the operator run", () => {
    expect(evidence.expectationsFrozenAt).toBeLessThan(evidence.timingStartedAt);
    expect(evidence.operatorReceivedExpected).toBe(false);
    expect(evidence.expectedHashes).toHaveLength(READ_SIDE_CASE_COUNT);
    const leaked = (manifest.cases as SyntheticCase[]).some((entry) => evidenceRaw.includes(entry.expected.answer));
    expect(leaked).toBe(false);
    const docBytes = readFileSync(join(repoA, "doc.txt"), "utf8");
    expect(evidenceRaw.includes(docBytes.trim())).toBe(false);
  });

  it("counterbalances T0/T1 order across first investigations", () => {
    const orders = evidence.cases.map((c: { order: string[] }) => c.order.join(">"));
    expect(new Set(orders).size).toBeGreaterThan(1);
    for (const entry of evidence.cases as Array<{ id: number; order: string[] }>) {
      expect(entry.order).toEqual(counterbalancedOrder(entry.id));
    }
  });

  it("retains failed and denied cases and labels classification costs", () => {
    for (const entry of evidence.cases as Array<{ id: number; recoveryMs: unknown; state: string }>) {
      expect(typeof entry.recoveryMs).toBe("number");
      expect((entry.recoveryMs as number) >= 0).toBe(true);
    }
    const failed = evidence.cases.find((c: { id: number }) => c.id === 19) as { state: string; error: string };
    expect(failed.state).toBe("failed");
    expect(typeof failed.error).toBe("string");
    const denied = evidence.cases.find((c: { id: number }) => c.id === 20) as {
      state: string;
      emittedBytes: number;
      countsAsSaving: boolean;
    };
    expect(denied.state).toBe("policy-unavailable");
    expect(denied.emittedBytes).toBe(0);
    expect(denied.countsAsSaving).toBe(false);
    const capture = evidence.cases.find((c: { id: number }) => c.id === 18) as { state: string; recoveryMs: number };
    expect(capture.state).toBe("capture-absent");
    expect(capture.recoveryMs >= 0).toBe(true);
  });

  it("separates existing reader gains from native additions", () => {
    expect(evidence.existingReaders.state).toBe("reader-absent");
    expect(evidence.existingReaders.measured).toBe(false);
    expect(evidence.nativeAdditions.measured).toBe(false);
    expect(evidence.nativeAdditions.state).toBe("reader-absent");
    expect(evidence.nativeAdditions.gains).toHaveLength(READ_SIDE_CASE_COUNT);
    expect(evidence.existingReaders.note).not.toContain("measured gain");
    expect(evidence.t1State).toBe("reader-absent");
  });

  it("computes a diagnostic Git self-comparison median over SUCCESS cases only (non-success excluded, all retained)", () => {
    expect(evidence.threshold).toBe(READ_SIDE_CONTINUATION_THRESHOLD);
    expect(evidence.threshold).toBe(0.3);
    // All twenty cases stay in the list and counts: nothing removed.
    expect(evidence.cases).toHaveLength(READ_SIDE_CASE_COUNT);
    expect(evidence.caseCount).toBe(READ_SIDE_CASE_COUNT);
    const successCases = (evidence.cases as Array<{ state: string; gain: number | null }>).filter(
      (c) => !isNonSuccessState(c.state),
    );
    expect(successCases.length).toBeGreaterThan(0);
    expect(successCases.length).toBeLessThan(READ_SIDE_CASE_COUNT);
    const successGains = successCases.map((c) => c.gain);
    expect(successGains.every((g) => typeof g === "number" && Number.isFinite(g))).toBe(true);
    // Non-success states never enter the gain computation (gain null, excluded).
    for (const entry of evidence.cases as Array<{ state: string; gain: unknown }>) {
      if (isNonSuccessState(entry.state)) expect(entry.gain).toBeNull();
    }
    expect(evidence.medianGain).toBe(median(successGains as number[]));
    expect(evidence.medianGain).toBe(median(evidence.cases
      .filter((c: { state: string }) => c.state === "verified")
      .map((c: { t0FirstMs: number; t1TotalMs: number }) => 1 - c.t1TotalMs / c.t0FirstMs)));
    expect(evidence.medianGainScope).toContain("SUCCESS");
    // Quality over SUCCESS only: the retained failed case must not decide it.
    expect(evidence.qualityMet).toBe(true);
    expect(evidence.qualityScope).toContain("SUCCESS");
    // …while quality over ALL cases (including retained non-success) stays false,
    // proving non-success outcomes are present but excluded from the decision.
    expect(evidence.cases.every((c: { matchedExpectation: boolean }) => c.matchedExpectation)).toBe(false);
    // No continuation decision can be measured without a native reader.
    expect(evidence.continuation.decision).toBe(false);
    expect(evidence.continuation.measurable).toBe(false);
    expect(evidence.continuation.verdict).toBe("not-measurable");
  });

  it("keeps G3/G5 capacité absente explicit and undocumented reasons « inconnu » without fabrication", () => {
    for (const id of [14, 15, 16, 17]) {
      const entry = evidence.cases.find((c: { id: number }) => c.id === id) as {
        state: string;
        missingCapabilities: string[];
        reasonState: string;
      };
      expect(entry.state).toBe("capability-absent");
      expect(entry.missingCapabilities.length).toBeGreaterThan(0);
    }
    for (const id of [14, 15]) {
      const entry = evidence.cases.find((c: { id: number }) => c.id === id) as {
        reasonState: string;
        reasonValueSha256: string;
      };
      expect(entry.reasonState).toBe("inconnu");
      expect(entry.reasonValueSha256).toBe(sha256("inconnu"));
      expect("reasonValue" in (entry as Record<string, unknown>)).toBe(false);
    }
    const documented = evidence.cases.find((c: { id: number }) => c.id === 16) as {
      reasonState: string;
      reasonValueSha256: string;
    };
    expect(documented.reasonState).toBe("documented");
    expect(documented.reasonValueSha256).toBe(sha256("synthetic relocation note"));
    // Reason text never enters the evidence despite contentHashesOnly:true.
    expect(evidence.contentHashesOnly).toBe(true);
    expect(evidenceRaw.includes("synthetic relocation note")).toBe(false);
  });

  it("reports first-answer, warm, CPU/RSS/process evidence without source content or external transmission", () => {
    for (const entry of evidence.cases as Array<{
      t0FirstMs: unknown;
      t1FirstMs: unknown;
      t0WarmMs: unknown;
      t1WarmMs: unknown;
    }>) {
      for (const field of [entry.t0FirstMs, entry.t1FirstMs, entry.t0WarmMs, entry.t1WarmMs]) {
        expect(typeof field).toBe("number");
      }
    }
    expect(typeof evidence.resources.bootstrapMs).toBe("number");
    expect(typeof evidence.resources.processCount).toBe("number");
    expect(typeof evidence.resources.cpuMsParentProcessOnly).toBe("number");
    expect(typeof evidence.resources.rssBytesParentProcessOnly).toBe("number");
    expect(evidence.resources.resourceScope).toContain("parentProcessOnly");
    expect(evidenceRaw).toContain("parentProcessOnly");
    expect(evidence.network).toBe(false);
    expect(evidence.modelCalls).toBe(0);
  });

  it("never counts a rapid incomplete refusal as a time saving", () => {
    for (const entry of evidence.cases as Array<{ state: string; countsAsSaving: boolean }>) {
      if (isNonSuccessState(entry.state)) expect(entry.countsAsSaving).toBe(false);
    }
    const refused = evidence.cases.find((c: { id: number }) => c.id === 20) as { t1FirstMs: number; t0FirstMs: number; gain: number };
    void refused;
  });
});

describe("source review regression guards", () => {
  it("[P1-1] T1 is an explicit reader-absent state and no timing is presented as a native service", () => {
    expect(evidence.t1State).toBe("reader-absent");
    for (const entry of evidence.cases as Array<{ t1ReaderState: unknown }>) {
      expect(entry.t1ReaderState).toBe("reader-absent");
    }
    expect(evidence.nativeAdditions.measured).toBe(false);
    expect(evidence.nativeAdditions.state).toBe("reader-absent");
    const armsText = (evidence.arms as string[]).join(" ");
    expect(armsText).toContain("reader-absent");
    expect(armsText).not.toContain("T1-native-read-side");
    expect(evidenceRaw).not.toContain("T1-native-read-side");
    expect(evidence.baseline.note).toContain("self-comparison");
    expect(evidence.baseline.note).toContain("measures nothing about a native service");
    expect(evidence.nativeAdditions.note).toContain("NOT a native service measurement");
  });

  it("[P1-1] the verdict is not-measurable (native readers absent), never continuation YES/NO", () => {
    expect(evidence.continuation.decision).toBe(false);
    expect(evidence.continuation.measurable).toBe(false);
    expect(evidence.continuation.verdict).toBe("not-measurable");
    expect((evidence.continuation.reasons as string[])[0]).toContain(
      "not measurable: native readers absent (cluster-mesh L9-S, G3/G4/G5)",
    );
  });

  it("[P1-2] non-success states never enter the median or the decision and never count as success", () => {
    expect(evidence.cases).toHaveLength(READ_SIDE_CASE_COUNT);
    expect(evidence.successCaseCount).toBe(
      (evidence.cases as Array<{ state: string }>).filter((c) => !isNonSuccessState(c.state)).length,
    );
    for (const entry of evidence.cases as Array<{ state: string; matchedExpectation: unknown; countsAsSaving: unknown; gain: unknown }>) {
      if (isNonSuccessState(entry.state)) {
        expect(entry.matchedExpectation).toBe(false);
        expect(entry.countsAsSaving).toBe(false);
        expect(entry.gain).toBeNull();
      }
    }
    // Case 19 stays retained as failed with its error (kept in list and counts).
    const failed = evidence.cases.find((c: { id: number }) => c.id === 19) as { state: string; error: unknown; gain: unknown };
    expect(failed.state).toBe("failed");
    expect(typeof failed.error).toBe("string");
    expect(failed.gain).toBeNull();
  });

  it("[P1-2] the recovery timing is labelled result-classification-only (no recovery workflow measured)", () => {
    for (const entry of evidence.cases as Array<{
      classificationMs: unknown;
      classificationScope: string;
      recoveryScope: string;
      recoveryMs: unknown;
    }>) {
      expect(typeof entry.classificationMs).toBe("number");
      expect((entry.classificationMs as number) >= 0).toBe(true);
      expect(entry.classificationScope).toContain("result-classification-only");
      expect(entry.classificationScope).toContain("no-recovery-workflow-measured");
      expect(entry.recoveryScope).toBe("result-classification-only");
      expect(typeof entry.recoveryMs).toBe("number");
    }
  });

  it("[P2-3] expectations never reach the timed path and the real frozenAt is used", () => {
    expect(evidence.operatorReceivedExpected).toBe(false);
    expect(evidence.timedInputContainsExpected).toBe(false);
    expect(evidence.expectationsFrozenAt).toBeLessThan(evidence.timingStartedAt);
    // Keep the real freeze timestamp; bootstrap must precede the measured run.
    const benchSource = readFileSync(BENCH, "utf8");
    expect(benchSource).toContain("runOracleBatchTimed");
    expect(benchSource).not.toContain("timingStartedAt - 1");
    expect(benchSource).toContain("expectationsFrozenAt = frozenAt");
  });

  it("[P2-4] reason text never enters the evidence: sha256 plus category only", () => {
    expect(evidence.contentHashesOnly).toBe(true);
    for (const entry of evidence.cases as Array<Record<string, unknown>>) {
      expect("reasonValue" in entry).toBe(false);
      expect(typeof entry["reasonValueSha256"]).toBe("string");
      expect((entry["reasonValueSha256"] as string)).toMatch(/^[0-9a-f]{64}$/);
      // Category only (documented/inconnu) when a reason exists, else null — never text.
      expect(entry["reasonState"] === null || typeof entry["reasonState"] === "string").toBe(true);
    }
    expect(evidenceRaw.includes("synthetic relocation note")).toBe(false);
  });
});

function runBench(path: string, repos: Record<string, string>, out: string, extra: string[] = []) {
  execFileSync(process.execPath, [BENCH, "--manifest", path,
    ...Object.entries(repos).flatMap(([name, cwd]) => ["--repo", `${name}=${cwd}`]),
    "--out", out, ...extra], { timeout: 120_000, stdio: "pipe" });
  return JSON.parse(readFileSync(out, "utf8"));
}

it("runs the pinned engram oracles offline with package identity and no native-service measurement", () => {
  const box = new LiveGitSandbox(tmpdir());
  try {
    const path = fileURLToPath(new URL("./fixtures/live-read-side-cases.json", import.meta.url));
    const bytes = readFileSync(path);
    const pinned = JSON.parse(bytes.toString());
    const controls = buildReadSideFixtures(box);
    const pins = Object.values(pinned.revisions as Record<string, { repository: string; oid: string }>)
      .filter(pin => pin.repository === "engram").map(pin => pin.oid);
    const history = cloneReadSideSource(box, pins);
    const repos = { engram: history.repo, h2a: controls.h2a, sentropic: controls.sentropic };
    const inventories = Object.values(repos).map(root => inventoryDigest({ root }));
    const out = join(box.root, "evidence.json");
    const actual = runBench(path, repos, out);
    expect(actual.manifestPinned).toBe(true);
    expect(actual.manifestSha256).toBe(sha256(bytes));
    expect(actual.oracleVersion).toBe("native-git-read-side/1");
    const packageBytes = readFileSync(new URL("../engram-live/package.json", import.meta.url));
    expect(actual.artifacts.engramLive).toEqual({ name: "@sentropic/engram-live",
      version: JSON.parse(packageBytes.toString()).version, packageSha256: sha256(packageBytes),
      readerState: "reader-absent" });
    expect(actual.caseCount).toBe(20);
    expect(actual.successCaseCount).toBe(11);
    expect(actual.expectedHashes).toEqual(pinned.cases.map((entry: SyntheticCase) => ({
      id: entry.id, sha256: sha256(JSON.stringify(entry.expected)),
    })));
    for (const entry of actual.cases) {
      const control = pinned.cases.find((c: SyntheticCase) => c.id === entry.id);
      expect(entry.error, `case ${entry.id}`).toBeNull();
      expect(entry.t0Error, `case ${entry.id}`).toBeNull();
      expect(entry.t1ReaderState).toBe("reader-absent");
      expect(entry.reasonValueSha256).toBe(sha256(control.expected.reason?.value ?? ""));
      if (control.expected.state === "oracle-ready") expect(entry.state).toBe("verified");
      else {
        expect(entry.gain).toBeNull();
        expect(entry.countsAsSaving).toBe(false);
        expect(entry.matchedExpectation).toBe(false);
      }
    }
    expect(actual.cases[19]).toMatchObject({ id: 20, state: "policy-unavailable", emittedBytes: 0 });
    expect(actual.nativeAdditions.measured).toBe(false);
    expect(actual.continuation).toMatchObject({ measurable: false, verdict: "not-measurable",
      reasons: ["not measurable: native readers absent (cluster-mesh L9-S, G3/G4/G5)"] });
    expect(readFileSync(out, "utf8")).not.toContain('"measured": true');
    const raw = readFileSync(out, "utf8");
    for (const entry of pinned.cases) {
      expect(raw).not.toContain(entry.expected.answer);
      if (entry.expected.reason?.state === "documented") expect(raw).not.toContain(entry.expected.reason.value);
    }
    expect(Object.values(repos).map(root => inventoryDigest({ root }))).toEqual(inventories);
    box.trace.assertSafe();
  } finally { box.dispose(); }
}, 120_000);

it("retains explicit non-success states with null gains even when their Git controls match", () => {
  const altered = structuredClone(manifest);
  const states = ["failed", "denied", "refused", "reader-absent", "policy-unavailable"];
  altered.cases.forEach((entry, index) => { entry.expected.state = states[index % states.length]!; });
  const path = join(root, "non-success.json");
  writeFileSync(path, JSON.stringify(altered));
  const actual = runBench(path, { "synthetic-h2a": repoA, "synthetic-s": repoB }, join(root, "non-success-evidence.json"));
  expect(actual.cases).toHaveLength(20);
  states.forEach((state, index) => expect(actual.cases[index]).toMatchObject({
    state, gain: null, matchedExpectation: false, countsAsSaving: false,
  }));
  expect(actual.successCaseCount).toBe(0);
  expect(actual.medianGain).toBeNull();
  expect(actual.continuation.measurable).toBe(false);
});

it("honors warm repetitions separately from the counterbalanced first investigations", () => {
  const actual = runBench(manifestPath, { "synthetic-h2a": repoA, "synthetic-s": repoB },
    join(root, "warm-evidence.json"), ["--warm", "2"]);
  expect(actual.warmRepetitions).toBe(2);
  for (const entry of actual.cases) {
    expect(entry.t0WarmRepeatsMs).toHaveLength(2);
    expect(entry.t1WarmRepeatsMs).toHaveLength(2);
    expect(entry.t0WarmMs).toBe((entry.t0WarmRepeatsMs[0] + entry.t0WarmRepeatsMs[1]) / 2);
    expect(entry.t1WarmMs).toBe((entry.t1WarmRepeatsMs[0] + entry.t1WarmRepeatsMs[1]) / 2);
  }
});

it("rejects a missing or duplicate investigation instead of changing the fixed population", () => {
  for (const duplicate of [false, true]) {
    const altered = structuredClone(manifest);
    if (duplicate) altered.cases[19]!.id = 1;
    else altered.cases.pop();
    const path = join(root, "invalid-population.json");
    writeFileSync(path, JSON.stringify(altered));
    expect(() => runBench(path, { "synthetic-h2a": repoA }, join(root, "invalid-evidence.json")))
      .toThrow("manifest must retain all twenty numbered cases (1..20); no silent skip");
  }
});
