import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildReadSideFixtures, cloneReadSideSource, inventoryDigest, LiveGitSandbox } from "./helpers/live-git-fixtures.js";

const load = () => JSON.parse(readFileSync(new URL("./fixtures/live-read-side-cases.json", import.meta.url), "utf8")) as Manifest;
interface Pin { algorithm: string; oid: string }
interface Oracle {
  id: string; repository: string; argv: string[];
  expected: { status: number; bytes: number; sha256: string; stdout?: string; contains?: string[] };
}
type Case = Omit<typeof import("./fixtures/live-read-side-cases.json")["cases"][number], "pins" | "oracles"> & {
  pins: Record<string, Pin>; oracles: Oracle[];
};
type Manifest = Omit<typeof import("./fixtures/live-read-side-cases.json"), "revisions" | "cases"> & {
  revisions: Record<string, Pin & { repository: string }>; cases: Case[];
};
const boxes: LiveGitSandbox[] = [];
afterEach(() => { for (const box of boxes.splice(0)) box.dispose(); });
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const lines = (text: string) => text.trim().split("\n").filter(Boolean);
const missing = new Map([[3, "G3"], [6, "G3"], [8, "G3"], [11, "G3"], [12, "G3"], [14, "G5"], [18, "G3"], [20, "G4"]]);

// These checks protect the measurement contract as well as the Git controls.
// Native oracle readiness never implies installed reader/capability readiness.
function verifyManifest(manifest: Manifest) {
  expect(manifest.cases).toHaveLength(20);
  expect(manifest.cases.map(entry => entry.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  expect(manifest.measurement).toBe("unverified");
  expect(manifest.installedQualification).toBe("unverified");
  expect(manifest.sourcePolicy).toMatchObject({ network: false, dependenciesAdded: false,
    engram: { path: "/home/antoinefa/src/graphify", access: "read-only-local-clone", observedWrites: false,
      clone: ["--local", "--no-hardlinks", "--no-checkout"] },
    controls: { access: "native-git-fixtures", observedWrites: false, setupLocation: "os-temp-outside-observed-worktrees" } });
  expect(manifest.sourcePolicy.substitutions).toContain("not the original analysis C revisions");
  expect(manifest.protocol).toMatchObject({ cases: 20,
    baseline: ["native Git", "available engram tools", "accessible document search", "accessible memory tools"],
    arms: ["T0-current-available-workflow", "existing-planned-readers-only", "T1-native-read-side-with-G1-G5"],
    permissionsAndPinsIdenticalAcrossArms: true, oracleAccess: "verifier-only-hide-from-operators", freezeExpectationsBeforeTiming: true,
    timing: "question-received-to-usable-verified-answer-including-search-errors-recovery-retries",
    counterbalance: "T0/T1-order-across-operators", firstAnswersSeparateFromWarm: true,
    separateResources: ["bootstrap", "CPU", "RSS", "storage", "processes"],
    correctness: ["OIDs", "paths", "ranges", "ordered-parents", "generations", "citations", "authorization"],
    reasonsRequireExplicitSources: true, failedCasesRetained: true, deniedOrFastIncompleteRefusalIsNotGain: true,
    recoveryRequiredWhenBaselineCanAnswer: true, score: "median(1 - T1_i/T0_i)", population: "all-20-first-investigations",
    continuationThreshold: 0.30, constantQualityRequired: true, thresholdRetuning: false,
    executionPilot: { authorized: false, additionalGainThreshold: 0.20,
      includedCosts: ["preparation", "copying", "verification", "recovery", "cleanup"] }, results: "unverified" });
  for (const revision of Object.values(manifest.revisions)) {
    expect(revision.algorithm).toBe("sha1");
    expect(revision.oid).toMatch(/^[a-f0-9]{40}$/);
  }
  const oracleIds: string[] = [];
  for (const entry of manifest.cases) {
    expect(entry.question.length).toBeGreaterThan(20);
    expect(entry.expected.answer.length).toBeGreaterThan(40);
    expect(Object.keys(entry.pins).length).toBeGreaterThan(0);
    expect(entry.oracles.length).toBeGreaterThan(0);
    for (const [alias, pin] of Object.entries(entry.pins)) {
      const revision = manifest.revisions[alias];
      expect(revision, alias).toBeDefined();
      expect(pin).toEqual({ algorithm: revision.algorithm, oid: revision.oid });
    }
    expect(entry.permissions).toMatchObject({ committedRead: "authorized", localStateRead: "not-authorized", observedWrite: false,
      externalDisclosure: { allowed: false, repository: "*", provider: "*", scope: [], duration: null, grant: null }, secretExclusions: true });
    expect(new Set(entry.permissions.repositories)).toEqual(new Set(entry.oracles.map(oracle => oracle.repository)));
    const absent = missing.get(entry.id);
    if (absent) {
      expect(entry.expected.state, `case ${entry.id}`).toBe("capacité absente");
      expect(entry.expected.missingCapabilities).toEqual([absent]);
    } else expect(entry.expected.state).toBe(entry.id === 7 ? "capture-absent" : "oracle-ready");
    if ([8, 11, 12, 18].includes(entry.id)) {
      expect(entry.expected.reason).toEqual({ state: "inconnu", value: "inconnu", evidence: [] });
    } else if ([3, 6].includes(entry.id)) {
      expect(entry.expected.reason?.state).toBe("documented");
      expect(entry.expected.reason!.evidence.length).toBeGreaterThan(0);
      for (const id of entry.expected.reason!.evidence) {
        const source = entry.oracles.find(oracle => oracle.id === id);
        expect(source, id).toBeDefined();
        expect(source!.argv[0]).toMatch(/^(show|cat-file)$/);
        expect(source!.expected.contains!.length).toBeGreaterThan(0);
      }
      // A citation id cannot license an invented rationale. The reason is
      // a verbatim quote (whitespace normalized) from a pinned commit message;
      // its complete expected bytes are verified again against native Git.
      const quote = entry.expected.reason!.value.replace(/\s+/g, " ");
      expect(entry.expected.reason!.evidence.some(id => {
        const source = entry.oracles.find(oracle => oracle.id === id)!;
        return source.argv[0] === "show" && source.argv.includes("-s") &&
          source.expected.stdout?.replace(/\s+/g, " ").includes(quote);
      })).toBe(true);
    } else expect(entry.expected.reason).toBeNull();
    for (const oracle of entry.oracles) {
      oracleIds.push(oracle.id);
      expect(oracle.argv[0]).toMatch(/^(blame|cat-file|diff|log|ls-tree|merge-base|rev-list|rev-parse|show)$/);
      expect(oracle.expected.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(oracle.expected.bytes).toBeGreaterThanOrEqual(0);
      const endpoints = oracle.argv.flatMap(arg => /^[a-f0-9]{40}(?:$|[:^])/.test(arg) ? [arg.slice(0, 40)] : []);
      expect(endpoints.length, oracle.id).toBeGreaterThan(0);
      for (const oid of endpoints) expect(Object.values(entry.pins).some(pin => pin.oid === oid), oracle.id).toBe(true);
      if (oracle.argv[0] === "diff" || (oracle.argv[0] === "show" && !oracle.argv.includes("-s"))) {
        expect(oracle.argv).toEqual(expect.arrayContaining(["--no-ext-diff", "--no-textconv"]));
      }
      if (oracle.expected.status !== 0) {
        expect(oracle.argv.slice(0, 2)).toEqual(["merge-base", "--is-ancestor"]);
        expect(oracle.expected.status).toBe(1);
      }
    }
  }
  expect(new Set(oracleIds).size).toBe(oracleIds.length);
}

it("the twenty case manifest pins full OIDs permissions and independently verified expectations without inferring undocumented reasons", () => {
  const manifest = load();
  verifyManifest(manifest);
  const box = new LiveGitSandbox("/tmp"); boxes.push(box);
  expect(relative(process.cwd(), box.root).startsWith("..")).toBe(true);
  const control = buildReadSideFixtures(box);
  const repositories: Record<string, string> = { engram: cloneReadSideSource(box, manifest.sourcePolicy.engram.path),
    h2a: control.h2a, sentropic: control.sentropic };
  const frozenControls = Object.fromEntries(Object.entries(manifest.revisions).filter(([alias]) => alias.startsWith("F_"))
    .map(([alias, revision]) => [alias, revision.oid]));
  expect(control.pins).toEqual(frozenControls);
  const inventories = Object.fromEntries(Object.entries(repositories).map(([name, root]) => [name, inventoryDigest({ root })]));
  for (const revision of Object.values(manifest.revisions)) {
    expect(box.read(repositories[revision.repository], ["cat-file", "-t", revision.oid]).toString()).toBe("commit\n");
  }
  const observations = new Map<string, string>();
  for (const entry of manifest.cases) for (const oracle of entry.oracles) {
    const result = box.probe(repositories[oracle.repository], oracle.argv, "oracle");
    expect(result.status, `${entry.id}/${oracle.id}: ${result.stderr}`).toBe(oracle.expected.status);
    expect(result.stderr.toString(), oracle.id).toBe("");
    expect(result.stdout.length, oracle.id).toBe(oracle.expected.bytes);
    expect(sha256(result.stdout), oracle.id).toBe(oracle.expected.sha256);
    const text = result.stdout.toString("utf8");
    if (oracle.expected.stdout !== undefined) expect(text, oracle.id).toBe(oracle.expected.stdout);
    for (const excerpt of oracle.expected.contains ?? []) expect(text, oracle.id).toContain(excerpt);
    observations.set(oracle.id, text);
  }
  const output = (id: string) => { expect(observations.has(id), id).toBe(true); return observations.get(id)!; };
  const pin = (alias: string) => manifest.revisions[alias].oid;
  // Verify semantic controls in addition to byte digests. No live parser,
  // producer, reader, Git argument builder or engine is imported here.
  expect(output("line-origin")).toContain(`${pin("E_G1_ORIGIN")} 221 321 1`);
  expect(output("stats-after")).toBe("");
  expect(output("stats-reason")).toContain("now lives in h2a");
  expect(output("ingestion-reason")).toContain("D-8 A");
  expect(output("ingestion-decision")).toContain("D-8=A");
  expect(lines(output("live-paths"))).toHaveLength(12);
  expect(lines(output("live-paths")).filter(line => line.startsWith("A\t"))).toHaveLength(10);
  const hp = lines(output("hp-contribution")), hr = lines(output("hr-contribution"));
  expect(hp.filter(path => hr.includes(path))).toEqual(manifest.cases[12]!.expected.commonPaths);
  expect(lines(output("ordered-parents"))[0]!.split(" ")).toEqual([pin("F_JOIN"), pin("F_HP"), pin("F_HR")]);
  const commits = (id: string) => lines(output(id)).map(line => line.split(" ")[0]);
  expect(commits("all-parents")).toContain(pin("F_HR"));
  expect(commits("first-parent")).not.toContain(pin("F_HR"));
  expect(output("first-parent-patch")).not.toBe(output("second-parent-patch"));
  const cochange = manifest.cases[13]!.expected;
  const observationsByCommit = output("cochange-observations").trim().split(/(?=^[a-f0-9]{40}$)/m).filter(Boolean);
  expect(observationsByCommit).toHaveLength(cochange.denominator!);
  const counts: Record<string, number> = {};
  for (const observation of observationsByCommit) for (const path of lines(observation).filter(line => line.startsWith("tests/"))) {
    counts[path] = (counts[path] ?? 0) + 1;
  }
  expect(counts).toEqual(cochange.counts);
  expect((Date.parse(cochange.window!.until) - Date.parse(cochange.window!.since)) / 86400000).toBe(cochange.window!.days);
  expect(output("visibility-paths")).toContain("R056\tsrc/visibility.ts\tsrc/scope-visibility.ts");
  expect(output("symbol-before").replace("scopeVisibilityRoot", "ScopeVisibilityRoot")).toBe(output("symbol-after"));
  expect(output("follow-rename")).toContain(pin("F_K3"));
  expect(output("historical-absence")).toBe("");
  expect(output("h-contract")).toBe(output("s-contract"));
  expect(manifest.cases[18]!.expected).toMatchObject({ copyOrigin: "inconnu", dynamicTarget: "undetermined", crossRepositoryContinuity: "unproven" });
  expect(manifest.cases[6]!.expected).toMatchObject({ state: "capture-absent", capture: null, generation: null, recoveryRequired: true });
  expect(manifest.cases[19]!.expected).toMatchObject({ state: "capacité absente", requiredOutcome: "refusal-before-emission", emittedBytes: 0, enforcement: "unverified" });
  for (const [name, root] of Object.entries(repositories)) expect(inventoryDigest({ root }), name).toBe(inventories[name]);
  for (const launch of box.trace.launches) {
    expect(launch.cwd.startsWith(box.root + "/") || launch.cwd === box.root).toBe(true);
  }
  const cloneEvents = readFileSync(join(box.root, "clone-setup/git-trace2.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(cloneEvents.find(event => event.event === "start").argv).toEqual(expect.arrayContaining(["clone", "--local", "--no-hardlinks", "--no-checkout"]));
  expect(cloneEvents.filter(event => event.event === "child_start").every(event =>
    event.child_class === "transport/file" && event.argv.length === 1 && event.argv[0] === "git-upload-pack '/home/antoinefa/src/graphify/.git'")).toBe(true);
  box.trace.assertSafe();
});

it("rejects shortened pins missing cases disclosure grants invented reasons and hidden capability or measurement gaps", () => {
  const mutations: ((manifest: Manifest) => void)[] = [
    manifest => { manifest.revisions.E.oid = manifest.revisions.E.oid.slice(0, 8); },
    manifest => { manifest.cases.pop(); },
    manifest => { manifest.cases[0]!.permissions.externalDisclosure.allowed = true; },
    manifest => { manifest.cases[7]!.expected.reason = { state: "documented", value: "Invented performance rationale", evidence: ["detach-message"] }; },
    manifest => { manifest.cases[2]!.expected.reason!.value = "Invented rationale attached to a real citation"; },
    manifest => { manifest.cases[13]!.expected.state = "oracle-ready"; },
    manifest => { manifest.measurement = "verified"; },
    manifest => { manifest.protocol.continuationThreshold = 0.20; },
    manifest => { manifest.protocol.baseline = ["native Git"]; },
    manifest => { manifest.cases[0]!.oracles[0]!.argv[0] = "checkout"; },
  ];
  for (const mutate of mutations) {
    const manifest = load(); mutate(manifest);
    expect(() => verifyManifest(manifest)).toThrow();
  }
});
