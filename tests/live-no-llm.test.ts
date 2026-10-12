/**
 * L1a — Code-Only Execution Without LLM (plan/09-BRANCH_LIVE_GIT_INDEXING.md,
 * spec/SPEC_LIVE_GIT_INDEXING.md §11 + A07).
 *
 * The live/code-only paths (watch batches, code-only `update`, the code path of
 * `buildProject`) must run deterministically: zero model inference, zero
 * embeddings, zero assistant instruction emission and zero deferred-enrichment
 * markers — even when provider keys, configured enrichers, --force or
 * previously stored vectors/descriptions are present. A mixed code/document
 * batch must refresh the code AND flag the documents; it must never collapse
 * into a notification-only pass. Explicit non-live enrichment (injected
 * callers, `engram describe` / `engram label`) remains separately callable.
 *
 * Provider seam: the semantic stage entrypoints (`generateNodeDescriptions`,
 * `applySalientCommunityLabels`, `generateCommunityLabels`) are mocked to
 * THROW when invoked, the AI SDK embedding entrypoints (`embed`, `embedMany`)
 * count + fail if ever called, and EVERY network attempt (global `fetch`,
 * `node:http(s)` transports) is COUNTED — a swallowed network exception still
 * trips the zero-assertion. A code-only run that reaches any of them fails
 * loudly instead of silently spending a round-trip.
 *
 * `buildProject` runs its semantic finalizer under the pre-existing contract;
 * its code-only path is the explicit `live: true` opt-in.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
// A07 — named bindings captured at module load, BEFORE any per-test trap is
// installed. Overwriting `http.request` later cannot move these references,
// so they prove the counter works at module level (socket/tls/fetch), not
// merely on the default-object properties.
import { get as namedHttpGet, request as namedHttpRequest } from "node:http";
import { get as namedHttpsGet, request as namedHttpsRequest } from "node:https";

const STATE_DIR = ".engram";
const DESCRIBE_PENDING = ".graphify_describe_pending";
const DESC_INSTRUCTIONS = "description-instructions";
const LABEL_INSTRUCTIONS = "label-instructions";

const cleanupDirs: string[] = [];

const PROVIDER_KEY_ENV = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
];
const savedEnv: Record<string, string | undefined> = {};

function setFakeProviderKeys(): void {
  for (const key of PROVIDER_KEY_ENV) {
    savedEnv[key] = process.env[key];
    process.env[key] = "fake-l1a-provider-key";
  }
}

function clearProviderKeys(): void {
  for (const key of PROVIDER_KEY_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreProviderKeys(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete savedEnv[key];
  }
}

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-live-no-llm-"));
  cleanupDirs.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(
    join(dir, "src", "alpha.ts"),
    "export function alpha() { return beta(); }\nexport function beta() { return 1; }\n",
    "utf-8",
  );
  writeFileSync(
    join(dir, "src", "gamma.ts"),
    "export function gamma() { return alpha(); }\n",
    "utf-8",
  );
  writeFileSync(join(dir, "docs", "notes.md"), "# Notes\nSome document content.\n", "utf-8");
  return dir;
}

function wipeStateDir(dir: string): void {
  rmSync(join(dir, STATE_DIR), { recursive: true, force: true });
}

const PROVIDER_VIOLATION =
  "L1a violation: a model provider stage was invoked on the code-only live path";
const NETWORK_VIOLATION =
  "L1a violation: a network transport was invoked on the code-only live path";
const EMBEDDING_VIOLATION =
  "L1a violation: an embeddings provider was invoked on the code-only live path";
let describeStageCalls = 0;
let labelStageCalls = 0;
/**
 * A07 network proof: EVERY network attempt is COUNTED, not just trapped.
 * A `fetch` (or http/https call) whose exception is swallowed by the
 * implementation still increments the counter, so the zero-assertion below
 * fails even when no error ever surfaces.
 */
let networkAttempts = 0;
let embeddingCalls = 0;

const savedHttpTraps = { request: http.request, get: http.get };
const savedHttpsTraps = { request: https.request, get: https.get };
const savedNetTraps = { connect: net.connect, createConnection: net.createConnection };
const savedSocketConnect = net.Socket.prototype.connect;
const savedTlsConnect = tls.connect;

/** Count + throw on every transport; restored in afterEach. */
function installNetworkTraps(): void {
  networkAttempts = 0;
  const trap = (name: string) =>
    (..._args: unknown[]) => {
      networkAttempts += 1;
      throw new Error(`${NETWORK_VIOLATION} (${name})`);
    };
  // Transport trap: the direct backends go through the AI SDK, which uses the
  // global fetch — any accidental round-trip fails loudly instead of hitting
  // the network with whatever key happens to be in env. The global binding is
  // single (Node's built-in fetch is undici-backed; the `undici` npm package
  // is not a dependency), so one stub covers every `fetch` call style.
  vi.stubGlobal("fetch", vi.fn((..._args: unknown[]) => {
    networkAttempts += 1;
    throw new Error(NETWORK_VIOLATION);
  }));
  // Lower-level transports: a direct `node:http(s)` call must trip the same
  // counter — counting (not just throwing) defeats swallowed exceptions.
  (http as unknown as Record<string, unknown>)["request"] = trap("http.request");
  (http as unknown as Record<string, unknown>)["get"] = trap("http.get");
  (https as unknown as Record<string, unknown>)["request"] = trap("https.request");
  (https as unknown as Record<string, unknown>)["get"] = trap("https.get");
  // A07 module level: named ESM bindings (`import { request } from
  // "node:http"`) capture the original function at load time, so patching the
  // default-object properties above cannot move them. Every transport —
  // however imported — funnels through `net.Socket.prototype.connect` to open
  // its TCP socket (verified: the throw surfaces synchronously and catchably
  // from `http(s).request()/get()`, `net.connect()` and `tls.connect()`,
  // before any handle or SYN exists), so counting + throwing there trips the
  // zero-assertion for named imports, raw `node:net`/`node:tls` use, and any
  // undici-backed stack alike.
  (net as unknown as Record<string, unknown>)["connect"] = trap("net.connect");
  (net as unknown as Record<string, unknown>)["createConnection"] = trap("net.createConnection");
  (net.Socket.prototype as unknown as Record<string, unknown>)["connect"] =
    trap("net.Socket.connect");
  (tls as unknown as Record<string, unknown>)["connect"] = trap("tls.connect");
}

function restoreNetworkTraps(): void {
  (http as unknown as Record<string, unknown>)["request"] = savedHttpTraps.request;
  (http as unknown as Record<string, unknown>)["get"] = savedHttpTraps.get;
  (https as unknown as Record<string, unknown>)["request"] = savedHttpsTraps.request;
  (https as unknown as Record<string, unknown>)["get"] = savedHttpsTraps.get;
  (net as unknown as Record<string, unknown>)["connect"] = savedNetTraps.connect;
  (net as unknown as Record<string, unknown>)["createConnection"] = savedNetTraps.createConnection;
  (net.Socket.prototype as unknown as Record<string, unknown>)["connect"] = savedSocketConnect;
  (tls as unknown as Record<string, unknown>)["connect"] = savedTlsConnect;
}

/** Zero model calls, zero embeddings, zero network attempts of any kind. */
function assertZeroModelAndNetwork(): void {
  expect(describeStageCalls).toBe(0);
  expect(labelStageCalls).toBe(0);
  expect(embeddingCalls).toBe(0);
  expect(networkAttempts).toBe(0);
}

/** Mock the semantic stage entrypoints so ANY invocation fails the test. */
function installFailingProviders(): void {
  describeStageCalls = 0;
  labelStageCalls = 0;
  embeddingCalls = 0;
  installNetworkTraps();
  vi.doMock("../src/node-descriptions.js", async () => {
    const actual =
      await vi.importActual<typeof import("../src/node-descriptions.js")>("../src/node-descriptions.js");
    return {
      ...actual,
      generateNodeDescriptions: vi.fn(async () => {
        describeStageCalls += 1;
        throw new Error(PROVIDER_VIOLATION);
      }),
    };
  });
  vi.doMock("../src/community-labeling.js", async () => {
    const actual =
      await vi.importActual<typeof import("../src/community-labeling.js")>("../src/community-labeling.js");
    return {
      ...actual,
      applySalientCommunityLabels: vi.fn(async () => {
        labelStageCalls += 1;
        throw new Error(PROVIDER_VIOLATION);
      }),
      generateCommunityLabels: vi.fn(async () => {
        labelStageCalls += 1;
        throw new Error(PROVIDER_VIOLATION);
      }),
    };
  });
  // Embeddings seam: no live/code-only path may reach the AI SDK embedding
  // entrypoints — an injected provider that counts + fails if ever called.
  vi.doMock("ai", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("ai");
    return {
      ...actual,
      embed: vi.fn(async () => {
        embeddingCalls += 1;
        throw new Error(EMBEDDING_VIOLATION);
      }),
      embedMany: vi.fn(async () => {
        embeddingCalls += 1;
        throw new Error(EMBEDDING_VIOLATION);
      }),
    };
  });
}

function assertNoAssistantArtifacts(dir: string): void {
  const stateDir = join(dir, STATE_DIR);
  expect(existsSync(join(stateDir, DESC_INSTRUCTIONS))).toBe(false);
  expect(existsSync(join(stateDir, LABEL_INSTRUCTIONS))).toBe(false);
  expect(existsSync(join(stateDir, DESCRIBE_PENDING))).toBe(false);
}

function readGraphNodes(dir: string): Array<Record<string, unknown>> {
  const raw = JSON.parse(readFileSync(join(dir, STATE_DIR, "graph.json"), "utf-8")) as {
    nodes?: Array<Record<string, unknown>>;
  };
  return raw.nodes ?? [];
}

afterEach(() => {
  vi.doUnmock("../src/node-descriptions.js");
  vi.doUnmock("../src/community-labeling.js");
  vi.doUnmock("ai");
  vi.unstubAllGlobals();
  restoreNetworkTraps();
  vi.resetModules();
  restoreProviderKeys();
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("L1a — code-only execution without LLM", () => {
  it("watch refreshes code in a mixed code and document batch without model calls or assistant artifacts", async () => {
    setFakeProviderKeys();
    installFailingProviders();
    vi.resetModules();
    const dir = makeProject();

    const { rebuildWatchBatch } = await import("../src/watch.js");
    expect(typeof rebuildWatchBatch).toBe("function");

    const result = await rebuildWatchBatch(dir, [
      join(dir, "src", "alpha.ts"),
      join(dir, "docs", "notes.md"),
    ]);

    // The CODE half of the batch was refreshed (not a notification-only pass).
    expect(result.codeRebuilt).toBe(true);
    expect(result.nonCodeNotified).toBe(true);
    const nodes = readGraphNodes(dir);
    expect(nodes.some((n) => String(n.id).includes("alpha"))).toBe(true);

    // The DOCUMENT half is flagged for semantic refresh — a signal only.
    expect(existsSync(join(dir, STATE_DIR, "needs_update"))).toBe(true);

    // Zero inference, zero embeddings, zero network, zero assistant artifacts.
    assertNoAssistantArtifacts(dir);
    assertZeroModelAndNetwork();
  });

  it("code-only update and buildProject behave identically with and without provider keys", async () => {
    const dir = makeProject();

    // --- Run 1: fake provider keys present --------------------------------
    setFakeProviderKeys();
    installFailingProviders();
    vi.resetModules();
    let { rebuildCode } = await import("../src/watch.js");
    let ok = await rebuildCode(dir, false, {});
    expect(ok).toBe(true);
    assertNoAssistantArtifacts(dir);
    const updateGraphWithKeys = readFileSync(join(dir, STATE_DIR, "graph.json"), "utf-8");
    const updateReportWithKeys = readFileSync(join(dir, STATE_DIR, "GRAPH_REPORT.md"), "utf-8");

    // `live: true` is the explicit code-only opt-in for buildProject —
    // without it the pre-existing contract runs the semantic finalizer.
    let { buildProject } = await import("../src/pipeline.js");
    await buildProject(dir, { studio: false, live: true });
    assertNoAssistantArtifacts(dir);
    const buildGraphWithKeys = readFileSync(join(dir, STATE_DIR, "graph.json"), "utf-8");
    const buildReportWithKeys = readFileSync(join(dir, STATE_DIR, "GRAPH_REPORT.md"), "utf-8");
    assertZeroModelAndNetwork();

    // --- Run 2: no provider keys ------------------------------------------
    restoreProviderKeys();
    clearProviderKeys();
    installFailingProviders();
    vi.resetModules();
    ({ rebuildCode } = await import("../src/watch.js"));
    wipeStateDir(dir);
    ok = await rebuildCode(dir, false, {});
    expect(ok).toBe(true);
    assertNoAssistantArtifacts(dir);
    const updateGraphNoKeys = readFileSync(join(dir, STATE_DIR, "graph.json"), "utf-8");
    const updateReportNoKeys = readFileSync(join(dir, STATE_DIR, "GRAPH_REPORT.md"), "utf-8");

    ({ buildProject } = await import("../src/pipeline.js"));
    await buildProject(dir, { studio: false, live: true });
    assertNoAssistantArtifacts(dir);
    const buildGraphNoKeys = readFileSync(join(dir, STATE_DIR, "graph.json"), "utf-8");
    const buildReportNoKeys = readFileSync(join(dir, STATE_DIR, "GRAPH_REPORT.md"), "utf-8");
    assertZeroModelAndNetwork();

    // Identical deterministic outputs regardless of provider keys.
    expect(updateGraphNoKeys).toBe(updateGraphWithKeys);
    expect(updateReportNoKeys).toBe(updateReportWithKeys);
    expect(buildGraphNoKeys).toBe(buildGraphWithKeys);
    expect(buildReportNoKeys).toBe(buildReportWithKeys);
  });

  it("force, configured enrichers and existing vectors cannot activate inference or deferred enrichment in live", async () => {
    setFakeProviderKeys();
    installFailingProviders();
    vi.resetModules();
    const dir = makeProject();

    // Establish a deterministic baseline graph, then dress it with
    // previously stored semantic state: node descriptions + citation vectors,
    // an unanswered description batch and a label answer.
    let { rebuildCode } = await import("../src/watch.js");
    let ok = await rebuildCode(dir, false, {});
    expect(ok).toBe(true);

    const stateDir = join(dir, STATE_DIR);
    const seeded = JSON.parse(readFileSync(join(stateDir, "graph.json"), "utf-8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    // Pre-existing vector-carrying state: a legacy node tied to an alive file
    // (nodes freshly re-extracted from the AST are rebuilt from scratch by the
    // existing merge contract; this one rides the preserved-node merge path).
    // It carries a REAL stored vector, not just citations.
    seeded.nodes.push({
      id: "legacy_helper_fn",
      label: "legacy()",
      file_type: "code",
      source_file: "src/alpha.ts",
      community: 0,
      description: "Pre-existing description.",
      citations: [{ source_file: "docs/notes.md", page: 1 }],
      embedding: [0.1, 0.2, 0.3],
    });
    writeFileSync(join(stateDir, "graph.json"), JSON.stringify(seeded), "utf-8");
    // A configured project enricher is present too — it must stay inert on the
    // live path.
    writeFileSync(
      join(dir, "engram.yaml"),
      "llm:\n  provider: openai\n  model: gpt-4o-mini\n",
      "utf-8",
    );
    mkdirSync(join(stateDir, DESC_INSTRUCTIONS), { recursive: true });
    writeFileSync(
      join(stateDir, DESC_INSTRUCTIONS, "batch-001.json"),
      JSON.stringify({ "alpha_fn": "Stale assistant answer." }),
      "utf-8",
    );
    mkdirSync(join(stateDir, LABEL_INSTRUCTIONS), { recursive: true });
    writeFileSync(
      join(stateDir, LABEL_INSTRUCTIONS, "communities.json"),
      JSON.stringify({ "0": "Stale Salient Layer" }),
      "utf-8",
    );

    // Live refresh with --force, a configured enricher and fake keys present.
    // The live surface exposes NO enrichment knobs at all (only the
    // `enrichment` group, which live callers never set), so there is nothing
    // to smuggle a mode/backend through — this call is the whole live API.
    ({ rebuildCode } = await import("../src/watch.js"));
    ok = await rebuildCode(dir, false, { force: true });
    expect(ok).toBe(true);

    // No inference, no embeddings, no network; no deferred-enrichment marker.
    assertZeroModelAndNetwork();
    expect(existsSync(join(stateDir, DESCRIBE_PENDING))).toBe(false);

    // Pre-existing vectors/descriptions survive untouched (preserved by the
    // deterministic merge, never re-enriched, never consumed), and freshly
    // re-extracted nodes gain no description (nothing enriched them).
    const nodes = readGraphNodes(dir);
    const legacy = nodes.find((n) => String(n.id) === "legacy_helper_fn");
    expect(legacy?.["description"]).toBe("Pre-existing description.");
    expect(Array.isArray(legacy?.["embedding"])).toBe(true);
    const alpha = nodes.find((n) => String(n.id).includes("alpha"));
    expect(alpha?.["description"]).toBeUndefined();
    expect(
      existsSync(join(stateDir, DESC_INSTRUCTIONS, "batch-001.json")),
    ).toBe(true);
    expect(
      existsSync(join(stateDir, LABEL_INSTRUCTIONS, "communities.json")),
    ).toBe(true);
  });

  it("explicit non-live enrichment remains separately callable", async () => {
    vi.resetModules();
    const dir = makeProject();

    const Graph = (await import("graphology")).default;
    const { generateNodeDescriptions } = await import("../src/node-descriptions.js");
    const { applySalientCommunityLabels } = await import("../src/community-labeling.js");

    const G = new Graph({ type: "undirected" });
    const file = join(dir, "src", "alpha.ts");
    G.addNode("alpha_fn", { label: "alpha()", file_type: "code", source_file: file });
    G.addNode("beta_fn", { label: "beta()", file_type: "code", source_file: file });
    G.addUndirectedEdge("alpha_fn", "beta_fn", { relation: "calls", confidence: "EXTRACTED" });

    let describeCalls = 0;
    const describeResult = await generateNodeDescriptions(G, {
      callLlm: async (prompt: string) => {
        describeCalls += 1;
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `Explicit ${id}.`])));
      },
    });
    expect(describeCalls).toBeGreaterThan(0);
    expect(describeResult.coverage.described).toBeGreaterThan(0);
    expect(G.getNodeAttribute("alpha_fn", "description")).toBe("Explicit alpha_fn.");

    const communities = new Map<number, string[]>([[0, ["alpha_fn", "beta_fn"]]]);
    const labels = new Map<number, string>([[0, "Community 0"]]);
    let labelCalls = 0;
    const labelResult = await applySalientCommunityLabels(G, communities, labels, {
      callLlm: async () => {
        labelCalls += 1;
        return JSON.stringify({ "0": "Explicit Salient Layer" });
      },
    });
    expect(labelCalls).toBeGreaterThan(0);
    expect(labelResult.source).toBe("llm");
    expect(labels.get(0)).toBe("Explicit Salient Layer");

    // The buildProject injection seam still describes under the pre-existing
    // contract (the finalizer runs by default); a description-only caller
    // also opts out of the label stage (`label: false`) so no
    // salient-label/assistant work can ride along.
    const { buildProject } = await import("../src/pipeline.js");
    let buildCalls = 0;
    await buildProject(dir, {
      studio: false,
      label: false,
      describeCallLlm: async (prompt: string) => {
        buildCalls += 1;
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `Explicit ${id}.`])));
      },
    });
    expect(buildCalls).toBeGreaterThan(0);
    const buildNodes = readGraphNodes(dir);
    const alpha = buildNodes.find((n) => String(n.id).includes("alpha"));
    expect(String(alpha?.["description"])).toMatch(/^Explicit /);
    // The explicitly requested description-only finalizer emits no assistant
    // label artifacts.
    assertNoAssistantArtifacts(dir);
  });

  it("the live opt-in keeps an injected description caller inert", async () => {
    setFakeProviderKeys();
    installFailingProviders();
    vi.resetModules();
    const dir = makeProject();

    const { buildProject } = await import("../src/pipeline.js");
    // `live: true` + a description caller: the callback must NOT reach any
    // stage — zero model calls, zero network, zero assistant artifacts.
    // (Without the opt-in, the pre-existing contract applies: the finalizer
    // runs and a `describe:true` + callback call describes, as pinned by
    // tests/build-project-descriptions.test.ts.)
    await buildProject(dir, {
      studio: false,
      live: true,
      describe: true,
      describeCallLlm: async () => {
        throw new Error(PROVIDER_VIOLATION);
      },
    });

    assertNoAssistantArtifacts(dir);
    assertZeroModelAndNetwork();
    const nodes = readGraphNodes(dir);
    expect(nodes.some((n) => String(n.id).includes("alpha"))).toBe(true);
    expect(nodes.every((n) => n["description"] === undefined)).toBe(true);
  });

  it("`engram update --fill-missing` and mode options resume the requested non-live enrichment", async () => {
    // Counting (non-failing) providers so the REAL `update` command can be
    // driven end-to-end: the dispatch must transmit --fill-missing and the
    // mode/backend/lang options to the semantic stages, then finalize the
    // describe-pending marker.
    let describeOptions: Record<string, unknown> | null = null;
    let labelOptions: Record<string, unknown> | null = null;
    describeStageCalls = 0;
    labelStageCalls = 0;
    vi.doMock("../src/node-descriptions.js", async () => {
      const actual =
        await vi.importActual<typeof import("../src/node-descriptions.js")>("../src/node-descriptions.js");
      return {
        ...actual,
        generateNodeDescriptions: vi.fn(async (G: import("graphology").default, opts: Record<string, unknown>) => {
          describeStageCalls += 1;
          describeOptions = opts;
          let describable = 0;
          let described = 0;
          G.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
            if (attrs["file_type"] !== "code") return;
            describable += 1;
            if (typeof attrs["description"] === "string" && attrs["description"]) return;
            G.setNodeAttribute(nodeId, "description", `Filled ${nodeId}.`);
          });
          // Coverage counts every describable node that now HAS a description
          // (newly stamped or already present) — the real gap-fill semantics.
          G.forEachNode((_nodeId: string, attrs: Record<string, unknown>) => {
            if (attrs["file_type"] !== "code") return;
            if (typeof attrs["description"] === "string" && attrs["description"]) described += 1;
          });
          return {
            describedCount: described,
            source: "llm",
            coverage: { describable, described, ungrounded: 0, reasons: {} },
          };
        }),
      };
    });
    vi.doMock("../src/community-labeling.js", async () => {
      const actual =
        await vi.importActual<typeof import("../src/community-labeling.js")>("../src/community-labeling.js");
      return {
        ...actual,
        applySalientCommunityLabels: vi.fn(
          async (
            _G: import("graphology").default,
            communities: Map<number, string[]>,
            labels: Map<number, string>,
            opts: Record<string, unknown>,
          ) => {
            labelStageCalls += 1;
            labelOptions = opts;
            for (const cid of communities.keys()) {
              labels.set(cid, `Salient Layer ${cid}`);
            }
            return { source: "llm" };
          },
        ),
      };
    });
    vi.resetModules();

    const dir = makeProject();
    const { main } = await import("../src/cli.js");

    const runCli = async (args: string[]): Promise<{ logs: string[]; exitCode: number }> => {
      const previousArgv = process.argv;
      const previousCwd = process.cwd();
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      const originalExit = process.exit;
      const logs: string[] = [];
      console.log = (...a: unknown[]) => { logs.push(a.join(" ")); };
      console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
      console.warn = (...a: unknown[]) => { logs.push(a.join(" ")); };
      process.exit = ((code?: number | string | null): never => {
        throw new Error(`process.exit ${code ?? 0}`);
      }) as typeof process.exit;
      process.argv = ["node", "graphify", ...args];
      process.chdir(dir);
      try {
        await main();
        return { logs, exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const match = message.match(/^process\.exit (\d+)/);
        if (match) return { logs, exitCode: Number(match[1]) };
        throw error;
      } finally {
        process.chdir(previousCwd);
        process.argv = previousArgv;
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        process.exit = originalExit;
      }
    };

    // Run 1: default `update` — full non-live enrichment, all nodes described.
    const first = await runCli(["update", dir]);
    expect(first.exitCode).toBe(0);
    expect(first.logs.join("\n")).toContain("descriptions + salient community labels on by default");
    expect(describeStageCalls).toBeGreaterThan(0);
    expect(labelStageCalls).toBeGreaterThan(0);

    const graphPath = join(dir, STATE_DIR, "graph.json");
    const described = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    const alphaId = String(
      described.nodes.find((n) => String(n["id"]).includes("alpha"))?.["id"],
    );
    const alphaDescription = String(
      described.nodes.find((n) => String(n["id"]) === alphaId)?.["description"],
    );
    expect(alphaDescription).toMatch(/^Filled /);

    // Simulate the git-hook contract: the marker recommends the gap-fill.
    writeFileSync(
      join(dir, STATE_DIR, DESCRIBE_PENDING),
      "Graph rebuilt by the fast git hook without descriptions/labels.\n",
      "utf-8",
    );

    // Run 2: `update --fill-missing` with explicit mode/backend/lang options.
    const second = await runCli([
      "update", dir,
      "--fill-missing",
      "--description-backend", "openai",
      "--description-mode", "direct",
      "--description-lang", "en",
      "--label-mode", "direct",
      "--label-lang", "en",
    ]);
    expect(second.exitCode).toBe(0);

    // The explicit request was transmitted, not silently ignored.
    expect(describeOptions?.["onlyMissing"]).toBe(true);
    expect(describeOptions?.["provider"]).toBe("openai");
    expect(describeOptions?.["mode"]).toBe("direct");
    expect(describeOptions?.["descriptionLang"]).toBe("en");
    expect(labelOptions?.["mode"]).toBe("direct");
    expect(labelOptions?.["labelLang"]).toBe("en");

    // Gap-fill semantics: the already-described node was NOT re-described.
    const after = readGraphNodes(dir);
    expect(String(after.find((n) => String(n["id"]) === alphaId)?.["description"])).toBe(
      alphaDescription,
    );
    // The salient labels landed in graph.json.
    expect(
      after.some((n) => String(n["community_name"] ?? "").startsWith("Salient Layer")),
    ).toBe(true);
    // The marker was finalized (descriptions complete + answers ingested).
    expect(existsSync(join(dir, STATE_DIR, DESCRIBE_PENDING))).toBe(false);
  });

  it("a no-change live refresh preserves annotations of re-extracted symbols", async () => {
    const dir = makeProject();

    // Baseline deterministic (code-only) rebuild.
    let { rebuildCode } = await import("../src/watch.js");
    expect(await rebuildCode(dir, false, {})).toBe(true);

    // Simulate the non-live enrichment having described an AST-extracted
    // symbol — the COMMON case (the legacy-id fixture used elsewhere masks it
    // because such nodes ride the preserved-node merge path instead).
    const graphPath = join(dir, STATE_DIR, "graph.json");
    const seeded = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    const target = seeded.nodes.find(
      (n) => String(n["id"]).includes("alpha") && n["file_type"] === "code",
    );
    expect(target).toBeDefined();
    target!["description"] = "Described by the non-live workflow.";
    target!["citations"] = [{ source_file: "docs/notes.md", page: 1 }];
    writeFileSync(graphPath, JSON.stringify(seeded), "utf-8");

    // Live refresh with NO source change: the re-extracted symbol keeps its
    // annotations deterministically — the live path never re-describes, so
    // without preservation the prior enrichment work would be erased.
    setFakeProviderKeys();
    installFailingProviders();
    vi.resetModules();
    ({ rebuildCode } = await import("../src/watch.js"));
    expect(await rebuildCode(dir, false, {})).toBe(true);

    const nodes = readGraphNodes(dir);
    const after = nodes.find((n) => String(n["id"]) === String(target!["id"]));
    expect(after?.["description"]).toBe("Described by the non-live workflow.");
    expect(Array.isArray(after?.["citations"])).toBe(true);
    assertZeroModelAndNetwork();
  });

  it("assistant gap-fill preserves label instructions and the pending marker until label answers are verified", async () => {
    // Review scenario: the graph is already fully described but labels are
    // still generic. `update --fill-missing` in assistant mode must EMIT the
    // label instructions and KEEP them (plus the pending marker) until the
    // assistant answer is ingested — a descriptions-complete run must never
    // purge unverified label work or clear the marker while labels are generic.
    vi.resetModules();
    clearProviderKeys();
    installNetworkTraps();
    const dir = makeProject();

    // Baseline code-only rebuild, then simulate the non-live workflow having
    // described every symbol (seed every node so the gap-fill finds nothing
    // missing, whatever node types extraction produced).
    let { rebuildCode, checkUpdate } = await import("../src/watch.js");
    expect(await rebuildCode(dir, false, {})).toBe(true);
    const graphPath = join(dir, STATE_DIR, "graph.json");
    const seeded = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    for (const n of seeded.nodes) {
      if (typeof n["description"] !== "string") {
        n["description"] = `Seeded description for ${String(n["id"])}.`;
      }
    }
    writeFileSync(graphPath, JSON.stringify(seeded), "utf-8");

    // Gap-fill in assistant mode (no provider keys): descriptions are already
    // complete, so the label stage emits its instructions for the host
    // assistant — nothing is verified yet.
    const gapFill = {
      describe: true,
      descriptionOnlyMissing: true,
      descriptionMode: "assistant" as const,
      label: true,
      labelMode: "assistant" as const,
    };
    expect(await rebuildCode(dir, false, { enrichment: gapFill })).toBe(true);

    // The emitted label instructions and the pending marker SURVIVE:
    // labels are still generic and the refresh is not current.
    const labelDir = join(dir, STATE_DIR, LABEL_INSTRUCTIONS);
    expect(existsSync(join(labelDir, "communities.md"))).toBe(true);
    expect(existsSync(join(dir, STATE_DIR, DESCRIBE_PENDING))).toBe(true);
    const pending = readGraphNodes(dir);
    expect(
      pending.some((n) => String(n["community_name"] ?? "").startsWith("Salient")),
    ).toBe(false);
    expect(checkUpdate(dir).current).toBe(false);
    assertZeroModelAndNetwork();

    // The assistant answers: map every labeled cid to a salient name, then
    // re-run the same gap-fill — the answer is ingested and verified.
    const instruction = readFileSync(join(labelDir, "communities.md"), "utf-8");
    const cids = [...instruction.matchAll(/^Community (\d+):/gmu)].map((m) => Number(m[1]));
    expect(cids.length).toBeGreaterThan(0);
    writeFileSync(
      join(labelDir, "communities.json"),
      JSON.stringify(
        Object.fromEntries(cids.map((cid) => [String(cid), "Verified Salient Layer"])),
      ),
      "utf-8",
    );
    ({ rebuildCode, checkUpdate } = await import("../src/watch.js"));
    expect(await rebuildCode(dir, false, { enrichment: gapFill })).toBe(true);

    // Verified: instructions consumed, marker cleared, salient names landed,
    // and the refresh is current again.
    expect(existsSync(join(labelDir, "communities.md"))).toBe(false);
    expect(existsSync(join(dir, STATE_DIR, DESCRIBE_PENDING))).toBe(false);
    const verified = readGraphNodes(dir);
    expect(
      verified.some(
        (n) => String(n["community_name"] ?? "") === "Verified Salient Layer",
      ),
    ).toBe(true);
    expect(checkUpdate(dir).current).toBe(true);
    assertZeroModelAndNetwork();
  });

  it.each([
    ["empty object", "{}"],
    ["malformed JSON", "{ this is not json"],
  ])("assistant gap-fill keeps pending on an invalid label answer (%s)", async (_case, payload) => {
    // Pending-until-verified: a `{}` or malformed `communities.json` ingests
    // to zero names, so the instruction file, the generic labels AND the
    // pending marker must all survive, and check-update stays not-current.
    // Only a validly ingested answer may clear them.
    vi.resetModules();
    clearProviderKeys();
    installNetworkTraps();
    const dir = makeProject();

    // Baseline code-only rebuild, then simulate the non-live workflow having
    // described every symbol.
    let { rebuildCode, checkUpdate } = await import("../src/watch.js");
    expect(await rebuildCode(dir, false, {})).toBe(true);
    const graphPath = join(dir, STATE_DIR, "graph.json");
    const seeded = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<Record<string, unknown>>;
    };
    for (const n of seeded.nodes) {
      if (typeof n["description"] !== "string") {
        n["description"] = `Seeded description for ${String(n["id"])}.`;
      }
    }
    writeFileSync(graphPath, JSON.stringify(seeded), "utf-8");

    const gapFill = {
      describe: true,
      descriptionOnlyMissing: true,
      descriptionMode: "assistant" as const,
      label: true,
      labelMode: "assistant" as const,
    };
    expect(await rebuildCode(dir, false, { enrichment: gapFill })).toBe(true);

    // The assistant answers with an invalid payload, then the gap-fill runs
    // again to ingest it.
    const labelDir = join(dir, STATE_DIR, LABEL_INSTRUCTIONS);
    expect(existsSync(join(labelDir, "communities.md"))).toBe(true);
    writeFileSync(join(labelDir, "communities.json"), payload, "utf-8");
    ({ rebuildCode, checkUpdate } = await import("../src/watch.js"));
    expect(await rebuildCode(dir, false, { enrichment: gapFill })).toBe(true);

    // Nothing was verified: instruction file, generic labels and marker stay,
    // and the refresh is not current.
    expect(existsSync(join(labelDir, "communities.md"))).toBe(true);
    expect(existsSync(join(dir, STATE_DIR, DESCRIBE_PENDING))).toBe(true);
    const nodes = readGraphNodes(dir);
    expect(
      nodes.some((n) => String(n["community_name"] ?? "").startsWith("Salient")),
    ).toBe(false);
    expect(checkUpdate(dir).current).toBe(false);
    assertZeroModelAndNetwork();
  });

  it("every network attempt is counted, including named imports and raw sockets (A07)", async () => {
    // Module-level proof: transports reached through named ESM bindings
    // (captured before the traps are installed) or raw node:net/node:tls
    // must trip the same counter as the default-object properties and the
    // global fetch — a swallowed exception still fails the zero-assertion.
    installNetworkTraps();
    const absorb = (fn: () => void): void => {
      try {
        fn();
      } catch {
        // Counted, not surfaced.
      }
    };
    const onError = (): void => undefined;
    const loopback = "http://127.0.0.1:1/";
    const loopbackTls = "https://127.0.0.1:1/";

    absorb(() => { void (globalThis.fetch as unknown as (u: string) => unknown)(loopback); });
    absorb(() => {
      const req = (http as unknown as Record<string, (u: string) => { on(o: string, h: () => void): void; end(): void; destroy(): void }>)["request"]!(loopback);
      req.on("error", onError);
      req.end();
      req.destroy();
    });
    absorb(() => {
      const req = namedHttpRequest(loopback);
      req.on("error", onError);
      req.end();
      req.destroy();
    });
    absorb(() => {
      const req = namedHttpGet(loopback);
      req.on("error", onError);
      req.destroy();
    });
    absorb(() => {
      const req = namedHttpsRequest(loopbackTls);
      req.on("error", onError);
      req.end();
      req.destroy();
    });
    absorb(() => {
      const req = namedHttpsGet(loopbackTls);
      req.on("error", onError);
      req.destroy();
    });
    absorb(() => {
      const sock = net.connect(1, "127.0.0.1");
      sock.on("error", onError);
      sock.destroy();
    });
    absorb(() => {
      const sock = tls.connect(1, "127.0.0.1", {}, () => undefined);
      sock.on("error", onError);
      sock.destroy();
    });
    // Let refused loopback connections settle (red state) without leaking.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(networkAttempts).toBe(8);
    expect(() => assertZeroModelAndNetwork()).toThrow();
  });
});
