#!/usr/bin/env node
/** Engram read-side timing harness (ported from L9-H; NOT installed qualification).
 *
 * Counterbalanced T0/T1 Git-component timing on authorized local data only.
 * There is NO native reader in this prototype (cluster-mesh L9-S, G3/G4/G5
 * absent): T1 is an explicit `reader-absent` state. Both arms run the same
 * native Git controls, so any T0/T1 delta compares the Git component with
 * itself (diagnostic self-comparison) and measures NOTHING about a native
 * service. The verdict is therefore always not-measurable here.
 *
 * - loads the case manifest from --manifest (the pinned copy verified by
 *   sha256, or any path argument for synthetic/test corpora);
 * - freezes expectations BEFORE timing; the timed runner receives only
 *   case ids and Git commands, expectations are compared AFTER timing
 *   (only hashes enter the evidence);
 * - counterbalances arm order per case (odd: T0 first, even: T1 first);
 * - retains every case in the list and counts; non-success states
 *   (capability-absent/capture-absent/policy-unavailable/reader-absent/
 *   failed/denied/refused) never enter the median or the decision and can
 *   never count as success via matchedExpectation;
 * - measures first-answer and warm repeats; CPU/RSS are parent Node process
 *   only (explicit `parentProcessOnly`; child Git resources not collected);
 * - result-classification timing is classification only (no recovery
 *   workflow measured);
 * - reports a diagnostic Git self-comparison median over SUCCESS cases only;
 *   native additions are `measured: false` (`reader-absent`);
 * - G4 stays closed: the typed `policy-unavailable` refusal is an explicit
 *   non-success state with zero emitted bytes, never a time saving;
 * - reason text never enters the evidence: sha256 of the reason plus its
 *   category (documented/inconnu) only, despite contentHashesOnly:true;
 * - emits JSON evidence with hashes/counts/OIDs only: no source content,
 *   no model call, no network, no execution lot.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

// Pinned engram corpus, independently verified by live-read-side-oracles.test.ts.
const MANIFEST_SHA256 = "9fdbb8795c3eaea5cb55a6bec4ca18270a8c5691e7169ca3b56e4087b6fc926c";
const CONTINUATION_THRESHOLD = 0.30;
const NON_SUCCESS = new Set([
  "capability-absent",
  "capacité absente",
  "capture-absent",
  "policy-unavailable",
  "reader-absent",
  "failed",
  "denied",
  "refused",
]);

const usage = `usage: node scripts/bench-live.mjs --manifest <path> --repo <name>=<path> [--repo ...] --out <path> [--warm <n>] [--timeout-ms <ms>]`;

function fail(message) {
  process.stderr.write(`bench-live: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { repos: {}, warm: 1, timeoutMs: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--manifest") args.manifest = argv[++i];
    else if (flag === "--repo") {
      const pair = argv[++i] ?? "";
      const cut = pair.indexOf("=");
      if (cut === -1) fail(`bad --repo ${pair}; expected name=path`);
      args.repos[pair.slice(0, cut)] = pair.slice(cut + 1);
    } else if (flag === "--out") args.out = argv[++i];
    else if (flag === "--warm") args.warm = Number(argv[++i]);
    else if (flag === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else fail(`unknown flag ${flag}\n${usage}`);
  }
  if (!args.manifest) fail(`missing --manifest\n${usage}`);
  if (!args.out) fail(`missing --out\n${usage}`);
  if (Object.keys(args.repos).length === 0) fail(`at least one --repo name=path is required\n${usage}`);
  if (!Number.isSafeInteger(args.warm) || args.warm < 1) fail("warm must be a positive integer");
  return args;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
let processCount = 0;

function git(cwd, argv, { timeoutMs, discardStdout = false }) {
  processCount += 1;
  const result = spawnSync(
    "git",
    ["--no-pager", "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "protocol.allow=never", ...argv],
    {
      cwd,
      env: {
        PATH: "/usr/bin:/bin",
        HOME: tmpdir(),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ATTR_NOSYSTEM: "1",
        LC_ALL: "C",
        GIT_TERMINAL_PROMPT: "0",
      },
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      stdio: discardStdout ? ["ignore", "ignore", "pipe"] : undefined,
      encoding: discardStdout ? undefined : "buffer",
    },
  );
  if (result.error) return { status: null, stdout: Buffer.alloc(0), stderr: String(result.error), spawned: false };
  return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr?.toString() ?? "", spawned: true };
}

function storageBytes(root) {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const path = stack.pop();
    let stat;
    try {
      stat = statSync(path, { throwIfNoEntry: false });
    } catch {
      continue;
    }
    if (!stat) continue;
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      let entries = [];
      try {
        entries = readdirSync(path);
      } catch {
        continue;
      }
      for (const entry of entries) stack.push(join(path, entry));
    } else {
      total += stat.size;
    }
  }
  return total;
}

function counterbalancedOrder(caseId) {
  return caseId % 2 === 1 ? ["T0", "T1"] : ["T1", "T0"];
}

function perCaseGain(t0Ms, t1Ms) {
  if (!Number.isFinite(t0Ms) || !Number.isFinite(t1Ms) || !(t0Ms > 0)) return null;
  return 1 - t1Ms / t0Ms;
}

function median(values) {
  if (values.length === 0) throw new Error("median of an empty population");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isG4(expected) {
  return (
    (expected.missingCapabilities ?? []).includes("G4") || expected.requiredOutcome === "refusal-before-emission"
  );
}

function checkOracleOutput(oracle, stdout, status) {
  const want = oracle.expected ?? {};
  if (status !== (want.status ?? 0)) return `oracle ${oracle.id}: status ${status} != expected ${want.status ?? 0}`;
  if (want.bytes !== undefined && stdout.length !== want.bytes) {
    return `oracle ${oracle.id}: bytes ${stdout.length} != expected ${want.bytes}`;
  }
  if (want.sha256 !== undefined && sha256(stdout) !== want.sha256) {
    return `oracle ${oracle.id}: sha256 mismatch`;
  }
  if (want.stdout !== undefined && stdout.toString("utf8") !== want.stdout) {
    return `oracle ${oracle.id}: stdout mismatch`;
  }
  const text = stdout.toString("utf8");
  for (const excerpt of want.contains ?? []) {
    if (!text.includes(excerpt)) return `oracle ${oracle.id}: missing excerpt`;
  }
  return null;
}

/**
 * Timed runner: receives ONLY case ids and Git commands. It never receives
 * frozen expectations (no reasons, no oracle.expected stdout/contains/status).
 * It records raw Git outputs with their timing; verification against the
 * frozen expectations happens AFTER timing via verifyOracleOutputs().
 */
function runOracleBatchTimed(timedOracles, repos, timeoutMs, discardStdout) {
  const started = performance.now();
  let spawnError = null;
  let oracleRuns = 0;
  const outputs = [];
  for (const oracleDef of timedOracles ?? []) {
    const cwd = repos[oracleDef.repository];
    if (!cwd) {
      spawnError = `oracle ${oracleDef.id}: no --repo mapping for ${oracleDef.repository}`;
      break;
    }
    const result = git(cwd, oracleDef.argv, { timeoutMs, discardStdout });
    oracleRuns += 1;
    if (!result.spawned) {
      spawnError = `oracle ${oracleDef.id}: subprocess unavailable (${result.stderr.slice(0, 120)})`;
      break;
    }
    outputs.push({ id: oracleDef.id, status: result.status, stdout: discardStdout ? null : result.stdout });
    if (spawnError) break;
  }
  return { ms: performance.now() - started, spawnError, outputs, oracleRuns };
}

/** Post-timing verification: compares raw outputs to the frozen expectations. */
function verifyOracleOutputs(outputs, spawnError, frozenOracles, discardStdout) {
  if (spawnError) return spawnError;
  for (let index = 0; index < (frozenOracles ?? []).length; index++) {
    const frozen = frozenOracles[index];
    const output = outputs[index];
    if (!output || output.id !== frozen.id) return `oracle ${frozen.id}: missing timed output`;
    if (discardStdout) {
      const wantStatus = frozen.expected?.status ?? 0;
      if (output.status !== wantStatus) {
        return `oracle ${frozen.id}: status ${output.status} != expected ${wantStatus}`;
      }
    } else {
      const error = checkOracleOutput(frozen, output.stdout ?? Buffer.alloc(0), output.status);
      if (error) return error;
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const wallStarted = performance.now();
  const cpuStarted = process.cpuUsage();

  let manifestBytes;
  try {
    manifestBytes = readFileSync(args.manifest);
  } catch (error) {
    fail(`cannot read manifest ${args.manifest}: ${error.message}`);
  }
  const manifestSha256 = sha256(manifestBytes);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    fail(`manifest is not JSON: ${error.message}`);
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 20 ||
      manifest.cases.some((entry, index) => entry.id !== index + 1)) {
    fail("manifest must retain all twenty numbered cases (1..20); no silent skip");
  }

  // Freeze expectations BEFORE timing; the timed runner never sees them.
  // The real frozenAt timestamp recorded here is reused verbatim as
  // expectationsFrozenAt (no synthetic offset derived from the later clock).
  const frozenAt = Date.now();
  const expectedHashes = manifest.cases.map((entry) => ({
    id: entry.id,
    sha256: sha256(JSON.stringify(entry.expected ?? null)),
  }));
  // Frozen expectations: compared AFTER timing, never passed to the runner.
  const expectationsById = new Map(
    manifest.cases.map((entry) => [
      entry.id,
      {
        state: entry.expected?.state ?? null,
        missingCapabilities: [...(entry.expected?.missingCapabilities ?? [])],
        requiredOutcome: entry.expected?.requiredOutcome ?? null,
        emittedBytes: entry.expected?.emittedBytes ?? null,
        capture: entry.expected?.capture ?? undefined,
        reasonState: entry.expected?.reason?.state ?? null,
        reasonValue: entry.expected?.reason?.value ?? null,
        reasonEvidence: [...(entry.expected?.reason?.evidence ?? [])],
        oracles: (entry.oracles ?? []).map((o) => ({ id: o.id, expected: { ...(o.expected ?? {}) } })),
        full: entry.expected ?? {},
      },
    ]),
  );
  // Timed operators: ONLY case ids and Git commands. No reasons, no answer
  // text, no oracle.expected stdout/contains/status reach the timed path.
  const operators = manifest.cases.map((entry) => ({
    id: entry.id,
    pins: entry.pins ?? {},
    permissions: entry.permissions ?? {},
    oracles: (entry.oracles ?? []).map((o) => ({
      id: o.id,
      repository: o.repository,
      argv: [...o.argv],
    })),
  }));

  // Bootstrap: validate every mapped repository without touching source content.
  const bootstrapStarted = performance.now();
  for (const [name, cwd] of Object.entries(args.repos)) {
    const probe = git(cwd, ["rev-parse", "--git-dir"], { timeoutMs: args.timeoutMs });
    if (!probe.spawned || probe.status !== 0) {
      fail(`repository mapping ${name}=${cwd} is not a usable git directory`);
    }
  }
  const bootstrapMs = performance.now() - bootstrapStarted;
  // Identify the neutral producer package without loading any host or reader.
  const packageBytes = readFileSync(new URL("../engram-live/package.json", import.meta.url));
  const livePackage = JSON.parse(packageBytes.toString("utf8"));
  const timingStartedAt = Date.now();
  const expectationsFrozenAt = frozenAt;

  const gitVersion = git(Object.values(args.repos)[0], ["--version"], { timeoutMs: args.timeoutMs });
  const toolVersions = {
    git: gitVersion.stdout.toString().trim(),
    node: process.version,
  };

  const cases = [];
  for (const entry of operators) {
    const frozen = expectationsById.get(entry.id);
    const expected = frozen.full ?? {};
    const order = counterbalancedOrder(entry.id);
    const timed = { T0: null, T1: null };
    const timedOutputs = { T0: null, T1: null };
    const timedSpawnErrors = { T0: null, T1: null };
    let oracleRuns = 0;

    // T0: Git-component baseline (timed; ids/commands only, no expectations).
    const runT0Timed = () => {
      const result = runOracleBatchTimed(entry.oracles, args.repos, args.timeoutMs, false);
      oracleRuns += result.oracleRuns;
      return result;
    };
    // T1: DIAGNOSTIC Git-component second run, NOT a native service. No native
    // reader exists in this prototype (cluster-mesh L9-S, G3/G4/G5 absent), so
    // T1 is an explicit `reader-absent` state. Running the same Git controls a
    // second time only compares the component with itself (self-comparison);
    // it measures nothing about a service and never feeds a decision.
    const runT1DiagnosticTimed = () => {
      const perms = entry.permissions ?? {};
      if (perms.committedRead !== undefined && perms.committedRead !== "authorized") {
        return { ms: 0, spawnError: "T1 refused: committed read not authorized", outputs: [], oracleRuns: 0 };
      }
      if (perms.externalDisclosure?.allowed === true) {
        return { ms: 0, spawnError: "T1 refused: external disclosure grant present without scope", outputs: [], oracleRuns: 0 };
      }
      const result = runOracleBatchTimed(entry.oracles, args.repos, args.timeoutMs, false);
      oracleRuns += result.oracleRuns;
      return result;
    };

    const arms = {
      T0: runT0Timed,
      T1: isG4(expected)
        ? () => {
            // G4 stays closed: typed policy-unavailable refusal before any
            // content is retained. Only exit statuses observed; every output
            // byte is discarded (zero emitted bytes). Timed ids/commands only.
            const result = runOracleBatchTimed(entry.oracles, args.repos, args.timeoutMs, true);
            oracleRuns += result.oracleRuns;
            return result;
          }
        : runT1DiagnosticTimed,
    };

    // First answers in counterbalanced order (timed only; no expectations).
    for (const arm of order) {
      const result = arms[arm]();
      timed[arm] = result.ms;
      timedOutputs[arm] = result.outputs ?? [];
      timedSpawnErrors[arm] = result.spawnError ?? null;
    }
    // Warm repetitions, kept separate from first answers (timed only).
    const t0WarmRepeatsMs = [];
    const t1WarmRepeatsMs = [];
    for (let repeat = 0; repeat < args.warm; repeat++) {
      const warmT0 = runOracleBatchTimed(entry.oracles, args.repos, args.timeoutMs, isG4(expected));
      oracleRuns += warmT0.oracleRuns;
      t0WarmRepeatsMs.push(warmT0.ms);
      t1WarmRepeatsMs.push(arms.T1().ms); // oracleRuns accounted inside the arm closure
    }

    // AFTER timing: verify raw outputs against the frozen expectations.
    const t0Error = verifyOracleOutputs(timedOutputs.T0, timedSpawnErrors.T0, frozen.oracles, isG4(expected));
    const t1Error = verifyOracleOutputs(timedOutputs.T1, timedSpawnErrors.T1, frozen.oracles, isG4(expected));

    // Result classification only: no recovery workflow exists or is measured
    // here. classificationMs times the state-matching below, nothing else.
    const classificationStarted = performance.now();
    let state;
    let expectationMatches;
    let statusError = t1Error;
    if (isG4(expected)) {
      state = t1Error ? "failed" : "policy-unavailable";
      expectationMatches =
        t1Error === null &&
        expected.requiredOutcome === "refusal-before-emission" &&
        (expected.emittedBytes ?? 0) === 0;
      if (t1Error === null && !expectationMatches) statusError = "G4 expectation mismatch";
    } else if (expected.state === "capture-absent") {
      state = t1Error ? "failed" : "capture-absent";
      expectationMatches = t1Error === null && expected.capture === null;
    } else if (expected.state === "capacité absente" || expected.state === "capability-absent") {
      state = t1Error ? "failed" : "capability-absent";
      expectationMatches = t1Error === null;
    } else if (NON_SUCCESS.has(expected.state)) {
      state = t1Error ? "failed" : expected.state;
      expectationMatches = false;
    } else {
      state = t1Error ? "failed" : "verified";
      expectationMatches = t1Error === null;
    }
    if (t0Error) {
      // A T0 that cannot answer is retained with its error; classification
      // still judges T1 outputs against the frozen expectation.
      statusError = statusError ?? `T0 error retained: ${t0Error}`;
    }
    // A non-success state can never count as success: matchedExpectation is
    // forced false for every non-success outcome, even when the frozen
    // expectation literally describes that outcome. Non-success cases stay in
    // the case list and counts but never enter the median or the decision.
    const matchedExpectation = NON_SUCCESS.has(state) ? false : expectationMatches === true;
    const emittedBytes = 0;
    const classificationMs = performance.now() - classificationStarted;
    const recoveryMs = classificationMs; // deprecated alias: classification only
    const recoveryScope = "result-classification-only";
    void emittedBytes;

    const t0FirstMs = timed.T0 ?? NaN;
    const t1FirstMs = timed.T1 ?? NaN;
    const t1TotalMs = (t1FirstMs ?? NaN) + classificationMs;
    // Non-success states are excluded from gain computation (gain null) while
    // the case itself stays retained in the list and counts.
    const gain = NON_SUCCESS.has(state) ? null : perCaseGain(t0FirstMs, t1TotalMs);
    const countsAsSaving = gain !== null && gain > 0 && !NON_SUCCESS.has(state) && matchedExpectation === true;

    // Reason text never enters the evidence: sha256 of the reason value plus
    // its category (reasonState such as documented/inconnu), never the text.
    const reasonText = frozen.reasonValue ?? "";
    cases.push({
      id: entry.id,
      order,
      state,
      t1ReaderState: "reader-absent",
      matchedExpectation,
      missingCapabilities: [...frozen.missingCapabilities],
      reasonState: frozen.reasonState,
      reasonValueSha256: sha256(String(reasonText)),
      reasonEvidence: [...frozen.reasonEvidence],
      t0FirstMs,
      t1FirstMs,
      t0WarmMs: t0WarmRepeatsMs.reduce((sum, ms) => sum + ms, 0) / args.warm,
      t1WarmMs: t1WarmRepeatsMs.reduce((sum, ms) => sum + ms, 0) / args.warm,
      t0WarmRepeatsMs,
      t1WarmRepeatsMs,
      classificationMs,
      classificationScope: "result-classification-only-no-recovery-workflow-measured",
      recoveryMs,
      recoveryScope,
      t1TotalMs,
      gain,
      countsAsSaving,
      emittedBytes: 0,
      oracleRuns,
      error: statusError,
      t0Error,
    });
  }

  // Median and quality over SUCCESS cases only (diagnostic Git
  // self-comparison). Every case stays in `cases` and counts; non-success
  // gains are null and excluded here, never removed from the report.
  const successCases = cases.filter((c) => !NON_SUCCESS.has(c.state));
  const successGains = successCases.map((c) => c.gain);
  if (successCases.some((c) => c.gain === null || !Number.isFinite(c.gain))) {
    fail("unusable T0 timing on a retained SUCCESS case: refusing to drop the case for the median (no silent skip)");
  }
  const medianGainValue = successCases.length > 0 ? median(successGains) : null;
  const quality = successCases.length > 0 && successCases.every((c) => c.matchedExpectation === true);
  // No native reader exists (cluster-mesh L9-S, G3/G4/G5 absent): T1 is
  // reader-absent, so no continuation decision can be measured here,
  // regardless of the diagnostic self-comparison numbers above.
  const continuation = {
    decision: false,
    measurable: false,
    verdict: "not-measurable",
    reasons: ["not measurable: native readers absent (cluster-mesh L9-S, G3/G4/G5)"],
  };

  const cpu = process.cpuUsage(cpuStarted);
  const mem = process.memoryUsage();
  let storage = 0;
  for (const cwd of Object.values(args.repos)) storage += storageBytes(cwd);

  const evidence = {
    version: 1,
    prototype: "bench-live/1 prototype run (NOT installed qualification)",
    measurement: "unverified",
    installedQualification: "unverified",
    manifestSha256,
    manifestPinned: manifestSha256 === MANIFEST_SHA256,
    oracleVersion: manifest.oracleVersion ?? null,
    artifacts: {
      engramLive: {
        name: livePackage.name,
        version: livePackage.version,
        packageSha256: sha256(packageBytes),
        readerState: "reader-absent",
      },
    },
    expectationsFrozenAt,
    timingStartedAt,
    operatorReceivedExpected: false,
    timedInputContainsExpected: false,
    expectedHashes,
    population: `all-${cases.length}-first-investigations`,
    caseCount: cases.length,
    warmRepetitions: args.warm,
    successCaseCount: successCases.length,
    t1State: "reader-absent",
    arms: [
      "T0-git-component-only",
      "T1-git-component-self-comparison-only-reader-absent-NOT-a-native-service",
      "existing-planned-readers-reader-absent",
    ],
    baseline: {
      note: "T0 and T1 both run the same native Git controls on authorized local data (counterbalanced order). T1 is an explicit reader-absent diagnostic second run (no native reader installed): the T0/T1 delta compares the Git component with itself (self-comparison) and measures nothing about a native service. Human search, document and memory overhead is declared unmeasured, never reduced to bare Git alone.",
      toolVersions,
      permissions: "per-case pins and permissions identical across arms",
    },
    existingReaders: {
      state: "reader-absent",
      measured: false,
      note: "No planned reader is installed in this prototype; the existing-lot improvement is explicitly unmeasured and kept separate from native additions.",
    },
    nativeAdditions: {
      measured: false,
      state: "reader-absent",
      note: "No native reader installed (cluster-mesh L9-S, G3/G4/G5 absent). T1 timings are the Git component run a second time (diagnostic self-comparison), NOT a native service measurement; gains below are diagnostic only and feed no decision.",
      gains: cases.map((c) => ({ id: c.id, gain: c.gain })),
    },
    cases,
    threshold: CONTINUATION_THRESHOLD,
    medianGain: medianGainValue,
    medianGainScope: "diagnostic-git-self-comparison-over-SUCCESS-cases-only-non-success-excluded",
    qualityMet: quality,
    qualityScope: "SUCCESS-cases-only-non-success-never-counts-as-success",
    continuation,
    executionPilot: "not-authorized-here",
    resources: {
      bootstrapMs,
      cpuMsParentProcessOnly: (cpu.user + cpu.system) / 1000,
      rssBytesParentProcessOnly: mem.rss,
      resourceScope: "parentProcessOnly",
      resourceNote:
        "CPU/RSS are parentProcessOnly (parent Node process); child Git process resources are not collected (spawnSync returns no rusage).",
      storageBytes: storage,
      processCount,
      wallMs: performance.now() - wallStarted,
    },
    hardware: { platform: process.platform, arch: process.arch },
    network: false,
    modelCalls: 0,
    contentHashesOnly: true,
  };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(evidence, null, 2));
  const medianLabel = medianGainValue === null ? "n/a (no SUCCESS cases)" : `${(medianGainValue * 100).toFixed(2)}% diagnostic self-comparison`;
  process.stdout.write(
    `bench-live: ${cases.length} cases (${successCases.length} SUCCESS diagnostic), median gain ${medianLabel}, ` +
      `quality ${quality ? "met (SUCCESS only)" : "NOT met (SUCCESS only)"}, continuation NOT MEASURABLE (reader-absent) ` +
      `(prototype, unverified)\n`,
  );
}

main().catch((error) => fail(`harness failure: ${error?.message ?? error}`));
