import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as batchSubpath from "../src/extraction-batch.js";
import * as rootApi from "../src/index.js";
import { parseJsonFromLlmText, type TextJsonGenerationClient, type TextJsonGenerationInput } from "../src/llm-execution.js";
import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import {
  PROFILE_BUNDLE_SCHEMA_V1,
  type ProfileBundleV1,
  bundleProfile,
} from "../src/profile-bundle.js";
import { buildProfileChunkPrompt } from "../src/profile-prompts.js";
import type { Extraction, OntologyProfile, RegistryRecord } from "../src/types.js";
import {
  type CachedExtractionEntryV2,
  type CoverageKey,
  type CoverageRecordV1,
  type CoverageRegistryPort,
  EXTRACTION_SEMANTICS_VERSION,
  type ExtractionCachePort,
  type ExtractionKey,
  type ExtractionModelPolicyV1,
  transitionCoverageRecord,
} from "../src/extraction-cache.js";

const DOC_SHA_1 = "1".repeat(64);
const DOC_SHA_2 = "2".repeat(64);
const DOC_SHA_3 = "3".repeat(64);
const DOC_SHA_4 = "4".repeat(64);

const SYNTHETIC_PROFILE_YAML = `id: synthetic-batch-profile
version: 2
default_language: fr
node_types:
  Alpha:
    id_prefix: "alpha:"
    definition: Alpha entity
    aliases: [alpha_alias]
    registry: reg_alpha
    source_backed: true
    status_policy: candidate
    properties:
      score: { type: number, description: Score }
  Beta:
    id_prefix: "beta:"
    definition: Beta entity
    aliases: [beta_alias]
    properties:
      title: { type: string, description: Title }
relation_types:
  links_to:
    source: [Alpha]
    target: [Alpha, Beta]
    requires_evidence: false
    assertion_basis: [explicit]
    derivation_methods: [extracted]
    description: Links Alpha
registries:
  reg_alpha:
    source: alpha_src
    id_column: id
    label_column: label
    alias_columns: [slug]
    node_type: Alpha
citation_policy:
  minimum_granularity: page
  require_source_file: true
  allow_bbox: when_available
evidence_policy:
  require_evidence_refs: false
  min_refs: 0
  node_types: []
  relation_types: []
inference_policy:
  allow_inferred_relations: true
  allowed_relation_types: [links_to]
  require_evidence_refs: false
hardening:
  statuses: [candidate, validated, rejected]
  default_status: candidate
  promotion_requires: [citation]
  status_transitions:
    - { from: [candidate], to: [validated, rejected] }
outputs:
  ontology:
    enabled: true
    canonical_node_types: [Alpha]
    source_node_types: [Beta]
    relation_exports: [links_to]
    wiki:
      enabled: false
      page_node_types: [Alpha]
      include_backlinks: false
      include_source_snippets: false`;

const SYNTHETIC_PROFILE_REORDERED_YAML = `outputs:
  ontology:
    wiki: { include_source_snippets: false, include_backlinks: false, page_node_types: [Alpha], enabled: false }
    relation_exports: [links_to]
    source_node_types: [Beta]
    canonical_node_types: [Alpha]
    enabled: true
hardening:
  status_transitions: [{ to: [validated, rejected], from: [candidate] }]
  promotion_requires: [citation]
  default_status: candidate
  statuses: [candidate, validated, rejected]
inference_policy: { require_evidence_refs: false, allowed_relation_types: [links_to], allow_inferred_relations: true }
evidence_policy: { relation_types: [], node_types: [], min_refs: 0, require_evidence_refs: false }
citation_policy: { allow_bbox: when_available, require_source_file: true, minimum_granularity: page }
registries:
  reg_alpha: { node_type: Alpha, alias_columns: [slug], label_column: label, id_column: id, source: alpha_src }
relation_types:
  links_to: { description: Links Alpha, derivation_methods: [extracted], assertion_basis: [explicit], requires_evidence: false, target: [Alpha, Beta], source: [Alpha] }
node_types:
  Beta:
    properties: { title: { description: Title, type: string } }
    aliases: [beta_alias]
    definition: Beta entity
    id_prefix: "beta:"
  Alpha:
    properties: { score: { description: Score, type: number } }
    status_policy: candidate
    source_backed: true
    registry: reg_alpha
    aliases: [alpha_alias]
    definition: Alpha entity
    id_prefix: "alpha:"
default_language: fr
version: 2
id: synthetic-batch-profile`;

function makeRegistryRecord(id: string, label = `Label ${id}`, extra: Partial<RegistryRecord> = {}): RegistryRecord {
  return {
    registryId: "reg_alpha",
    id,
    label,
    aliases: [id.toLowerCase()],
    nodeType: "Alpha",
    sourceFile: `/virtual/${id}.csv`,
    raw: { id, label },
    ...extra,
  };
}

const DEFAULT_RECORDS: readonly RegistryRecord[] = [
  makeRegistryRecord("rec-1", "Record One"),
  makeRegistryRecord("rec-2", "Record Two"),
];

function makeFullBundle(
  yaml = SYNTHETIC_PROFILE_YAML,
  records: readonly RegistryRecord[] = DEFAULT_RECORDS,
): ProfileBundleV1 {
  const res = bundleProfile(yaml, { reg_alpha: records });
  if (!res.ok) {
    throw new Error(`Failed to build synthetic full bundle: ${JSON.stringify(res.errors)}`);
  }
  return res.bundle;
}

const DEFAULT_MODEL_POLICY: ExtractionModelPolicyV1 = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0,
  maxOutputTokens: 2048,
  verifierModel: null,
};

function makeValidExtractionJson(options: {
  nodeId?: string;
  label?: string;
  page?: number | string;
  docSha?: string;
  sourceFile?: string;
  score?: number;
  inputTokens?: number;
  outputTokens?: number;
} = {}): string {
  const payload = {
    nodes: [
      {
        id: options.nodeId ?? "alpha:1",
        label: options.label ?? "Entity Alpha 1",
        file_type: "document",
        source_file: options.sourceFile ?? "docs/doc1.pdf",
        node_type: "Alpha",
        status: "candidate",
        confidence: "EXTRACTED",
        ...(options.score !== undefined ? { score: options.score } : {}),
        citations: [
          {
            source_file: options.sourceFile ?? "docs/doc1.pdf",
            docSha: options.docSha ?? DOC_SHA_1,
            page: options.page ?? 1,
            quoteSpan: [0, 5],
            excerpt: "Alpha",
          },
        ],
      },
    ],
    edges: [],
    input_tokens: options.inputTokens ?? 100,
    output_tokens: options.outputTokens ?? 40,
  };
  return JSON.stringify(payload);
}

function createInMemoryCache(options: { withRepair?: boolean; throwOnGet?: boolean; throwOnPut?: boolean } = {}) {
  const map = new Map<string, unknown>();
  const calls = { get: 0, putIfAbsent: 0, replaceInvalid: 0 };
  let throwOnGet = options.throwOnGet ?? false;
  let throwOnPut = options.throwOnPut ?? false;

  const port: ExtractionCachePort = {
    get(key: ExtractionKey) {
      calls.get++;
      if (throwOnGet) {
        throw new Error("cache store read failure");
      }
      return map.get(key);
    },
    putIfAbsent(key: ExtractionKey, entry: CachedExtractionEntryV2) {
      calls.putIfAbsent++;
      if (throwOnPut) {
        throw new Error("cache store write failure");
      }
      if (map.has(key)) {
        return "exists";
      }
      map.set(key, structuredClone(entry));
      return "stored";
    },
    ...(options.withRepair
      ? {
          replaceInvalid(key: ExtractionKey, entry: CachedExtractionEntryV2, observed: unknown) {
            calls.replaceInvalid++;
            if (throwOnPut) {
              throw new Error("cache store replace failure");
            }
            if (!map.has(key) || map.get(key) !== observed) {
              return "exists";
            }
            map.set(key, structuredClone(entry));
            return "stored";
          },
        }
      : {}),
  };

  return {
    port,
    map,
    calls,
    setThrowOnGet(val: boolean) {
      throwOnGet = val;
    },
    setThrowOnPut(val: boolean) {
      throwOnPut = val;
    },
  };
}

function covKeyString(key: CoverageKey): string {
  return `${key.city}\0${key.docSha.trim().toLowerCase()}\0${key.profileDigest.trim().toLowerCase()}`;
}

function createInMemoryCoverage(options: { throwOnGet?: boolean; throwOnPut?: boolean } = {}) {
  const map = new Map<string, unknown>();
  const putHistory: CoverageRecordV1[] = [];
  const calls = { get: 0, put: 0 };
  let throwOnGet = options.throwOnGet ?? false;
  let throwOnPut = options.throwOnPut ?? false;

  const port: CoverageRegistryPort = {
    get(key: CoverageKey) {
      calls.get++;
      if (throwOnGet) {
        throw new Error("coverage registry read failure");
      }
      return map.get(covKeyString(key));
    },
    put(record: CoverageRecordV1) {
      calls.put++;
      if (throwOnPut) {
        throw new Error("coverage registry write failure");
      }
      const copy = structuredClone(record);
      map.set(covKeyString(record.key), copy);
      putHistory.push(copy);
    },
  };

  return {
    port,
    map,
    putHistory,
    calls,
    getRecord(city: string, docSha: string, profileDigest: string): CoverageRecordV1 | undefined {
      return map.get(covKeyString({ city, docSha, profileDigest })) as CoverageRecordV1 | undefined;
    },
    seedRaw(city: string, docSha: string, profileDigest: string, rawValue: unknown) {
      map.set(covKeyString({ city, docSha, profileDigest }), rawValue);
    },
    setThrowOnGet(val: boolean) {
      throwOnGet = val;
    },
    setThrowOnPut(val: boolean) {
      throwOnPut = val;
    },
  };
}

function createManualClock(initialMs = 1_700_000_000_000) {
  let currentMs = initialMs;
  let nextHandle = 1;
  const timers = new Map<number, { fireAt: number; fn: () => void }>();

  const clock: batchSubpath.HeadlessClock = {
    nowMs() {
      return currentMs;
    },
    nowIso() {
      return new Date(currentMs).toISOString();
    },
    setTimeout(fn: () => void, ms: number) {
      const id = nextHandle++;
      timers.set(id, { fireAt: currentMs + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(handle: unknown) {
      if (typeof handle === "number") {
        timers.delete(handle);
      }
    },
  };

  return {
    clock,
    advanceBy(ms: number) {
      currentMs += ms;
      for (const [id, timer] of [...timers.entries()]) {
        if (timer.fireAt <= currentMs) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    activeTimerCount() {
      return timers.size;
    },
  };
}

const T9_SEMANTICS_GOLDEN = {
  semanticsVersion: "engram-extraction-semantics/1",
  schema: "engram_extraction_v1",
  promptSha256: "36df289e3dee99b21b719c9086d6571ef8b84d5d9648717a8b32777dfa71c473",
  splitterSha256: "70314067b7d76e961c8bdccaef3d9414a8e5c829c76082b457bdeae56d6d0b93",
} as const;

function verifySemanticsGolden(
  actual: {
    readonly semanticsVersion: string;
    readonly schema: string;
    readonly promptSha256: string;
    readonly splitterSha256: string;
  },
  golden: typeof T9_SEMANTICS_GOLDEN,
): void {
  if (actual.semanticsVersion !== golden.semanticsVersion) {
    throw new Error(
      `EXTRACTION_SEMANTICS_VERSION moved (${golden.semanticsVersion} -> ${actual.semanticsVersion}): re-record the golden`,
    );
  }
  if (
    actual.schema !== golden.schema ||
    actual.promptSha256 !== golden.promptSha256 ||
    actual.splitterSha256 !== golden.splitterSha256
  ) {
    throw new Error(
      `Extraction prompt, schema, or splitter output changed without version change: bump EXTRACTION_SEMANTICS_VERSION`,
    );
  }
}

describe("F-EN3: headless bounded extraction batch with structured receipts", () => {
  it("F-EN3-T1: oversized document -> too-large, zero model calls, coverage pending, and bound rise re-opens", async () => {
    const bundle = makeFullBundle();
    const cache = createInMemoryCache();
    const cov = createInMemoryCoverage();
    const clock = createManualClock();
    let generateCalls = 0;

    const client: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        generateCalls++;
        return {
          status: "ok",
          text: makeValidExtractionJson({ docSha: DOC_SHA_1 }),
          tokensIn: 120,
          tokensOut: 45,
          model: "gpt-4o-mini",
          provider: "openai",
        };
      },
    };

    const bigText = "Alpha ".repeat(25_000); // 150,000 UTF-8 bytes
    expect(Buffer.byteLength(bigText, "utf8")).toBe(150_000);

    const res1 = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/oversized.pdf",
        pages: [{ page: 1, text: bigText }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 2,
        maxChunkChars: 200_000,
      },
      client,
      cache: cache.port,
      coverage: {
        port: cov.port,
        city: "ville-exemple",
        maxFailures: 3,
      },
      clock: clock.clock,
    });

    expect(res1.extraction).toBeNull();
    expect(res1.receipt.status).toBe("too-large");
    expect(res1.receipt.refusalCode).toBe("document_too_large");
    expect(res1.receipt.attempts).toBe(0);
    expect(res1.receipt.retryable).toBe(false);
    expect(res1.suggestedExitCode).toBe(0);
    expect(res1.mergeConflicts).toEqual([]);
    expect(generateCalls).toBe(0);

    const rec1 = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
    expect(rec1).toBeDefined();
    expect(rec1?.status).toBe("pending");
    expect(rec1?.lastStatus).toBe("too-large");
    expect(rec1?.lastRefusalCode).toBe("document_too_large");
    expect(rec1?.failureCount).toBe(0);
    expect(rec1?.retryableFailureCount).toBe(0);
    expect(rec1?.totalFailureCount).toBe(1);

    // Re-run with raised maxDocumentBytes: 200_000 -> extracts
    const res2 = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/oversized.pdf",
        pages: [{ page: 1, text: bigText }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 200_000,
        maxAttempts: 2,
        maxChunkChars: 200_000,
      },
      client,
      cache: cache.port,
      coverage: {
        port: cov.port,
        city: "ville-exemple",
        maxFailures: 3,
      },
      clock: clock.clock,
    });

    expect(res2.receipt.status).toBe("ok");
    expect(res2.extraction).not.toBeNull();
    expect(res2.receipt.attempts).toBe(1);
    expect(res2.suggestedExitCode).toBe(0);
    expect(generateCalls).toBe(1);

    const rec2 = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
    expect(rec2?.status).toBe("covered");
    expect(rec2?.failureCount).toBe(0);
    expect(rec2?.totalFailureCount).toBe(1);

    // Page-count limit check (maxDocumentPages)
    const resPages = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_2,
        sourceFile: "docs/too-many-pages.pdf",
        pages: [
          { page: 1, text: "Alpha p1" },
          { page: 2, text: "Alpha p2" },
        ],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxDocumentPages: 1,
        maxAttempts: 2,
      },
      client,
      cache: cache.port,
      coverage: {
        port: cov.port,
        city: "ville-exemple",
      },
      clock: clock.clock,
    });
    expect(resPages.receipt.status).toBe("too-large");
    expect(resPages.receipt.refusalCode).toBe("document_too_large");
    expect(resPages.receipt.attempts).toBe(0);
    expect(resPages.suggestedExitCode).toBe(0);
  });

  it("F-EN3-T2: timeout with partial counters via manual scheduler and getOrExtract composition", async () => {
    const bundle = makeFullBundle();
    const cache = createInMemoryCache();
    const cov = createInMemoryCoverage();
    const manualClock1 = createManualClock();

    // Variant 1: Two chunks; chunk 1 resolves with tokensIn: 400, tokensOut: 120; chunk 2 never settles
    let callCount1 = 0;
    const client1: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      generate() {
        callCount1++;
        if (callCount1 === 1) {
          return Promise.resolve({
            status: "ok",
            text: makeValidExtractionJson({ page: 1 }),
            tokensIn: 400,
            tokensOut: 120,
            model: "gpt-4o-mini",
            provider: "openai",
          });
        }
        return new Promise<batchSubpath.HeadlessLlmTurnResponse>(() => {
          // Never settles
        });
      },
    };

    const promise1 = batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/two-chunks.pdf",
        pages: [
          { page: 1, text: "Alpha page one content." },
          { page: 2, text: "Alpha page two content." },
        ],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 1000,
        maxDocumentBytes: 100_000,
        maxAttempts: 2,
        maxChunkChars: 40, // Forces 2 chunks (each rendered page is ~34 chars)
      },
      client: client1,
      cache: cache.port,
      coverage: {
        port: cov.port,
        city: "ville-exemple",
      },
      clock: manualClock1.clock,
    });

    // Wait a microtask tick so chunk 1 completes and chunk 2 starts waiting
    await new Promise((r) => setImmediate(r));
    expect(callCount1).toBe(2);

    manualClock1.advanceBy(1000);
    const res1 = await promise1;

    expect(res1.extraction).toBeNull();
    expect(res1.receipt.status).toBe("timeout");
    expect(res1.receipt.refusalCode).toBe("deadline_exceeded");
    expect(res1.receipt.attempts).toBe(2);
    expect(res1.receipt.tokensIn).toBeNull();
    expect(res1.receipt.tokensOut).toBeNull();
    expect(res1.receipt.latencyMs).toBe(1000);
    expect(res1.receipt.retryable).toBe(true);
    expect(res1.suggestedExitCode).toBe(75);
    expect(cache.map.size).toBe(0);

    // Variant 2: Single chunk; attempt 1 returns tokensIn: 400 (invalid JSON so it retries); attempt 2 hangs
    const manualClock2 = createManualClock();
    let callCount2 = 0;
    const client2: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      generate() {
        callCount2++;
        if (callCount2 === 1) {
          return Promise.resolve({
            status: "ok",
            text: "not valid json",
            tokensIn: 400,
            tokensOut: 90,
            model: "gpt-4o-mini",
            provider: "openai",
          });
        }
        return new Promise<batchSubpath.HeadlessLlmTurnResponse>(() => {
          // Never settles
        });
      },
    };

    const promise2 = batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_2,
        sourceFile: "docs/one-chunk.pdf",
        pages: [{ page: 1, text: "Alpha single chunk." }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 1500,
        maxDocumentBytes: 100_000,
        maxAttempts: 2,
      },
      client: client2,
      cache: cache.port,
      coverage: {
        port: cov.port,
        city: "ville-exemple",
      },
      clock: manualClock2.clock,
    });

    await new Promise((r) => setImmediate(r));
    expect(callCount2).toBe(2);

    manualClock2.advanceBy(1500);
    const res2 = await promise2;

    expect(res2.extraction).toBeNull();
    expect(res2.receipt.status).toBe("timeout");
    expect(res2.receipt.refusalCode).toBe("deadline_exceeded");
    expect(res2.receipt.attempts).toBe(2);
    expect(res2.receipt.tokensIn).toBeNull();
    expect(res2.receipt.tokensOut).toBeNull();
    expect(res2.receipt.latencyMs).toBe(1500);
    expect(res2.receipt.retryable).toBe(true);
    expect(res2.suggestedExitCode).toBe(75);
  });

  it("F-EN3-T3: refusals without throwing across content_filter, empty, invalid JSON, 429, unknown, native refusals, and 401 vs 400", async () => {
    const bundle = makeFullBundle();
    const clock = createManualClock();

    const runWithTurn = async (
      turnFn: (attempt: number) => Promise<batchSubpath.HeadlessLlmTurnResponse>,
      options: { maxAttempts?: number; cache?: ExtractionCachePort; coverage?: HeadlessCoverageConfig } = {},
    ) => {
      let attempt = 0;
      const client: batchSubpath.HeadlessLlmClient = {
        provider: "openai",
        model: "gpt-4o-mini",
        generate() {
          attempt++;
          return turnFn(attempt);
        },
      };
      return batchSubpath.extractDocumentBatch({
        document: {
          docSha: DOC_SHA_1,
          sourceFile: "docs/t3.pdf",
          pages: [{ page: 1, text: "Alpha text" }],
        },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: {
          timeoutMs: 5000,
          maxDocumentBytes: 100_000,
          maxAttempts: options.maxAttempts ?? 2,
        },
        client,
        ...(options.cache ? { cache: options.cache } : {}),
        ...(options.coverage ? { coverage: options.coverage } : {}),
        clock: clock.clock,
      });
    };

    type HeadlessCoverageConfig = NonNullable<batchSubpath.HeadlessExtractInput["coverage"]>;

    // (i) finishReason: "content_filter" and hyphenated "content-filter"
    for (const reason of ["content_filter", "content-filter"]) {
      const r = await runWithTurn(async () => ({
        status: "ok",
        text: makeValidExtractionJson(),
        tokensIn: 50,
        tokensOut: 10,
        finishReason: reason,
      }));
      expect(r.receipt.status).toBe("refused");
      expect(r.receipt.refusalCode).toBe("provider_content_filter");
      expect(r.receipt.attempts).toBe(1);
      expect(r.receipt.retryable).toBe(false);
      expect(r.suggestedExitCode).toBe(0);
    }

    // (ii) Empty text -> empty_completion, 1 attempt
    const rEmpty = await runWithTurn(async () => ({
      status: "ok",
      text: "   ",
      tokensIn: 30,
      tokensOut: 0,
    }));
    expect(rEmpty.receipt.status).toBe("refused");
    expect(rEmpty.receipt.refusalCode).toBe("empty_completion");
    expect(rEmpty.receipt.attempts).toBe(1);
    expect(rEmpty.receipt.retryable).toBe(false);
    expect(rEmpty.suggestedExitCode).toBe(0);

    // (iii) Invalid JSON x maxAttempts: 2 -> invalid_json_output, 2 attempts
    const rBadJson = await runWithTurn(
      async () => ({
        status: "ok",
        text: "{ invalid json",
        tokensIn: 20,
        tokensOut: 5,
      }),
      { maxAttempts: 2 },
    );
    expect(rBadJson.receipt.status).toBe("refused");
    expect(rBadJson.receipt.refusalCode).toBe("invalid_json_output");
    expect(rBadJson.receipt.attempts).toBe(2);
    expect(rBadJson.receipt.tokensIn).toBe(40);
    expect(rBadJson.receipt.tokensOut).toBe(10);
    expect(rBadJson.receipt.retryable).toBe(false);
    expect(rBadJson.suggestedExitCode).toBe(0);

    // (iv) 429-shaped throw x 2 -> rate_limited, retryable, exit 75
    const r429 = await runWithTurn(
      async () => {
        throw Object.assign(new Error("Rate limit exceeded"), { status: 429 });
      },
      { maxAttempts: 2 },
    );
    expect(r429.receipt.status).toBe("refused");
    expect(r429.receipt.refusalCode).toBe("rate_limited");
    expect(r429.receipt.attempts).toBe(2);
    expect(r429.receipt.retryable).toBe(true);
    expect(r429.suggestedExitCode).toBe(75);

    // (v) Unknown throw -> row 24 upstream_error non-retryable with unclassified_client_error, exit 0, 1 attempt
    const rUnknown = await runWithTurn(async () => {
      throw new Error("Completely unexpected error");
    });
    expect(rUnknown.receipt.status).toBe("refused");
    expect(rUnknown.receipt.refusalCode).toBe("upstream_error");
    expect(rUnknown.receipt.retryable).toBe(false);
    expect(rUnknown.receipt.diagnostics).toContain("unclassified_client_error");
    expect(rUnknown.receipt.attempts).toBe(1);
    expect(rUnknown.suggestedExitCode).toBe(0);

    // (vi) Native refusal responses (no throw)
    const rNatNonRetry = await runWithTurn(async () => ({
      status: "refused",
      refusalCode: "upstream_error",
      retryable: false,
      tokensIn: 10,
      tokensOut: 0,
    }));
    expect(rNatNonRetry.receipt.status).toBe("refused");
    expect(rNatNonRetry.receipt.refusalCode).toBe("upstream_error");
    expect(rNatNonRetry.receipt.retryable).toBe(false);
    expect(rNatNonRetry.receipt.attempts).toBe(1);
    expect(rNatNonRetry.receipt.diagnostics).toContain("native_refusal_non_retryable");
    expect(rNatNonRetry.suggestedExitCode).toBe(0);

    const rNatRetry = await runWithTurn(
      async () => ({
        status: "refused",
        refusalCode: "rate_limited",
        retryable: true,
        tokensIn: null,
        tokensOut: null,
      }),
      { maxAttempts: 2 },
    );
    expect(rNatRetry.receipt.status).toBe("refused");
    expect(rNatRetry.receipt.refusalCode).toBe("rate_limited");
    expect(rNatRetry.receipt.retryable).toBe(true);
    expect(rNatRetry.receipt.attempts).toBe(2);
    expect(rNatRetry.suggestedExitCode).toBe(75);

    // retryable absent (with code upstream_error or absent) -> row 24
    for (const code of ["upstream_error" as const, undefined]) {
      const rNatAbsent = await runWithTurn(async () => ({
        status: "refused",
        ...(code ? { refusalCode: code } : {}),
        tokensIn: null,
        tokensOut: null,
      }));
      expect(rNatAbsent.receipt.status).toBe("refused");
      expect(rNatAbsent.receipt.refusalCode).toBe("upstream_error");
      expect(rNatAbsent.receipt.retryable).toBe(false);
      expect(rNatAbsent.receipt.attempts).toBe(1);
      expect(rNatAbsent.receipt.diagnostics).toContain("native_refusal_non_retryable");
      expect(rNatAbsent.suggestedExitCode).toBe(0);
    }

    // code-first dispatch: empty_completion with retryable: true -> row 14, 1 attempt, non-retryable
    const rNatEmpty = await runWithTurn(async () => ({
      status: "refused",
      refusalCode: "empty_completion",
      retryable: true,
      tokensIn: 15,
      tokensOut: 0,
    }));
    expect(rNatEmpty.receipt.status).toBe("refused");
    expect(rNatEmpty.receipt.refusalCode).toBe("empty_completion");
    expect(rNatEmpty.receipt.retryable).toBe(false);
    expect(rNatEmpty.receipt.attempts).toBe(1);
    expect(rNatEmpty.suggestedExitCode).toBe(0);

    // provider_content_filter -> row 13, 1 attempt
    const rNatFilter = await runWithTurn(async () => ({
      status: "refused",
      refusalCode: "provider_content_filter",
      tokensIn: 15,
      tokensOut: 0,
    }));
    expect(rNatFilter.receipt.status).toBe("refused");
    expect(rNatFilter.receipt.refusalCode).toBe("provider_content_filter");
    expect(rNatFilter.receipt.retryable).toBe(false);
    expect(rNatFilter.receipt.attempts).toBe(1);
    expect(rNatFilter.suggestedExitCode).toBe(0);

    // (vii) Unwrapped 401-shaped throw -> client_configuration_error, exit 64, 1 attempt, coverage untouched across 3 runs
    const cache401 = createInMemoryCache();
    const cov401 = createInMemoryCoverage();
    for (let i = 0; i < 3; i++) {
      const r401 = await runWithTurn(
        async () => {
          throw Object.assign(new Error("Unauthorized API key"), { statusCode: 401 });
        },
        {
          cache: cache401.port,
          coverage: { port: cov401.port, city: "ville-exemple", maxFailures: 3 },
        },
      );
      expect(r401.receipt.status).toBe("refused");
      expect(r401.receipt.refusalCode).toBe("client_configuration_error");
      expect(r401.receipt.retryable).toBe(false);
      expect(r401.receipt.attempts).toBe(1);
      expect(r401.suggestedExitCode).toBe(64);
    }
    expect(cov401.calls.put).toBe(0);
    expect(cov401.map.size).toBe(0);

    // 400-shaped throw -> row 24 (document class, never row 23)
    const r400 = await runWithTurn(
      async () => {
        throw Object.assign(new Error("Context length exceeded"), { statusCode: 400 });
      },
      {
        cache: cache401.port,
        coverage: { port: cov401.port, city: "ville-exemple", maxFailures: 3 },
      },
    );
    expect(r400.receipt.status).toBe("refused");
    expect(r400.receipt.refusalCode).toBe("upstream_error");
    expect(r400.receipt.diagnostics).toContain("unclassified_client_error");
    expect(r400.receipt.attempts).toBe(1);
    expect(r400.suggestedExitCode).toBe(0);
    expect(cov401.calls.put).toBe(1);
  });

  it("F-EN3-T4: adaptTextJsonClient contract across direct-like, wrapped SDK, mesh, assistant, and non-exposing doubles", async () => {
    const bundle = makeFullBundle();
    const clock = createManualClock();

    // 1. Faithful direct-like double: parses text before validateResponse and returns redacted usage
    const capturedInputs: TextJsonGenerationInput[] = [];
    const directLikeDouble: TextJsonGenerationClient = {
      mode: "direct",
      provider: "openai",
      model: "gpt-4o-mini",
      async generateJson(input) {
        capturedInputs.push(input);
        const rawText = makeValidExtractionJson({ inputTokens: 777, outputTokens: 333 });
        parseJsonFromLlmText(rawText);
        await input.validateResponse?.(rawText);
        return {
          status: "completed",
          provider: "openai",
          mode: "direct",
          model: "gpt-4o-mini",
          audit: {
            finishReason: "stop",
            usage: {
              inputTokens: "[REDACTED]",
              outputTokens: "[REDACTED]",
            },
          },
        };
      },
    };

    const cache1 = createInMemoryCache();
    const adaptedDirect = batchSubpath.adaptTextJsonClient(directLikeDouble);
    expect(adaptedDirect.adaptedFrom).toBe(directLikeDouble);

    const resOk = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/t4.pdf",
        pages: [{ page: 1, text: "Alpha text" }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 2,
      },
      client: adaptedDirect,
      cache: cache1.port,
      clock: clock.clock,
    });

    expect(resOk.receipt.status).toBe("ok");
    expect(capturedInputs).toHaveLength(1);
    expect("outputPath" in capturedInputs[0]!).toBe(false);
    expect(resOk.receipt.tokensIn).toBeNull();
    expect(resOk.receipt.tokensOut).toBeNull();
    expect(resOk.receipt.modelSource).toBe("client");
    expect(resOk.extraction?.input_tokens).toBe(0);
    expect(resOk.extraction?.output_tokens).toBe(0);
    const storedEntry = [...cache1.map.values()][0] as CachedExtractionEntryV2;
    expect(storedEntry.extraction.input_tokens).toBe(0);
    expect(storedEntry.extraction.output_tokens).toBe(0);

    // 2. Rejecting variants of direct-like double
    const runRejectingDirect = async (
      errorFactory: () => unknown,
      options: { cache?: ExtractionCachePort; coverage?: NonNullable<batchSubpath.HeadlessExtractInput["coverage"]> } = {},
    ) => {
      const double: TextJsonGenerationClient = {
        mode: "direct",
        provider: "openai",
        model: "gpt-4o-mini",
        async generateJson() {
          throw errorFactory();
        },
      };
      return batchSubpath.extractDocumentBatch({
        document: {
          docSha: DOC_SHA_1,
          sourceFile: "docs/t4-reject.pdf",
          pages: [{ page: 1, text: "Alpha text" }],
        },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: {
          timeoutMs: 5000,
          maxDocumentBytes: 100_000,
          maxAttempts: 2,
        },
        client: batchSubpath.adaptTextJsonClient(double),
        ...(options.cache ? { cache: options.cache } : {}),
        ...(options.coverage ? { coverage: options.coverage } : {}),
        clock: clock.clock,
      });
    };

    const rEmpty = await runRejectingDirect(() => new Error("LLM returned empty or filtered response"));
    expect(rEmpty.receipt.refusalCode).toBe("empty_completion");
    expect(rEmpty.receipt.attempts).toBe(1);
    expect(rEmpty.suggestedExitCode).toBe(0);

    const rInvalidJson = await runRejectingDirect(
      () => new Error("Direct LLM response was not valid JSON: Unexpected token"),
    );
    expect(rInvalidJson.receipt.refusalCode).toBe("invalid_json_output");
    expect(rInvalidJson.receipt.attempts).toBe(2);
    expect(rInvalidJson.suggestedExitCode).toBe(0);

    const rExceeds = await runRejectingDirect(
      () => new Error("Direct LLM response exceeds 10485760 bytes (12000000 bytes); refusing to parse JSON"),
    );
    expect(rExceeds.receipt.refusalCode).toBe("invalid_json_output");
    expect(rExceeds.receipt.attempts).toBe(2);
    expect(rExceeds.suggestedExitCode).toBe(0);

    const cacheCred = createInMemoryCache();
    const covCred = createInMemoryCoverage();
    const rMissingCred = await runRejectingDirect(
      () => new Error("Missing provider credential for openai; set one of OPENAI_API_KEY"),
      { cache: cacheCred.port, coverage: { port: covCred.port, city: "ville-exemple" } },
    );
    expect(rMissingCred.receipt.refusalCode).toBe("client_configuration_error");
    expect(rMissingCred.receipt.attempts).toBe(1);
    expect(rMissingCred.suggestedExitCode).toBe(64);
    expect(covCred.map.size).toBe(0);

    // 3. Wrapped transport shapes (AI SDK AI_RetryError forms)
    const cacheWrap = createInMemoryCache();
    const covWrap = createInMemoryCoverage();
    for (let i = 0; i < 3; i++) {
      const rRetry429 = await runRejectingDirect(
        () => ({
          name: "AI_RetryError",
          message: "Failed after 3 attempts. Last error: Too Many Requests",
          lastError: { statusCode: 429, isRetryable: true },
        }),
        {
          cache: cacheWrap.port,
          coverage: { port: covWrap.port, city: "ville-exemple", maxFailures: 3, maxRetryableFailures: 10 },
        },
      );
      expect(rRetry429.receipt.refusalCode).toBe("rate_limited");
      expect(rRetry429.receipt.retryable).toBe(true);
      expect(rRetry429.suggestedExitCode).toBe(75);
    }
    const wrapRec = covWrap.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
    expect(wrapRec?.status).toBe("pending");
    expect(wrapRec?.retryableFailureCount).toBe(3);
    expect(wrapRec?.failureCount).toBe(0);

    const rRetryNet = await runRejectingDirect(() => ({
      name: "AI_RetryError",
      message: "Failed after 3 attempts. Last error: Cannot connect to API",
      lastError: {
        message: "Cannot connect to API: connect ECONNREFUSED",
        isRetryable: true,
        cause: { code: "ECONNREFUSED" },
      },
    }));
    expect(rRetryNet.receipt.refusalCode).toBe("upstream_error");
    expect(rRetryNet.receipt.retryable).toBe(true);
    expect(rRetryNet.suggestedExitCode).toBe(75);

    // 4. Mesh-like non-validating throwing double -> unsupported_client, exit 64, 1 underlying call (probe)
    let meshProbeCalls = 0;
    const meshNonValidatingDouble: TextJsonGenerationClient = {
      mode: "mesh",
      provider: "openai",
      model: "gpt-4o-mini",
      async generateJson() {
        meshProbeCalls++;
        throw new Error("input.validateResponse requires the GraphifyMesh to implement generateValidated");
      },
    };
    const rMeshProbe = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/t4-mesh.pdf",
        pages: [
          { page: 1, text: "Chunk 1" },
          { page: 2, text: "Chunk 2" },
        ],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 3,
        maxChunkChars: 15,
      },
      client: batchSubpath.adaptTextJsonClient(meshNonValidatingDouble),
      clock: clock.clock,
    });
    expect(rMeshProbe.receipt.refusalCode).toBe("unsupported_client");
    expect(rMeshProbe.suggestedExitCode).toBe(64);
    expect(rMeshProbe.receipt.attempts).toBe(1);
    expect(meshProbeCalls).toBe(1);

    // 5. Assistant-mode double -> unsupported_client, 0 underlying calls, attempts: 0
    let assistantCalls = 0;
    const assistantDouble: TextJsonGenerationClient = {
      mode: "assistant",
      provider: "openai",
      model: "gpt-4o-mini",
      async generateJson() {
        assistantCalls++;
        return {
          status: "instructions_written",
          provider: "openai",
          mode: "assistant",
          model: "gpt-4o-mini",
          audit: {},
        };
      },
    };
    const rAssistant = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/t4-assistant.pdf",
        pages: [{ page: 1, text: "Alpha" }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 2,
      },
      client: batchSubpath.adaptTextJsonClient(assistantDouble),
      clock: clock.clock,
    });
    expect(rAssistant.receipt.refusalCode).toBe("unsupported_client");
    expect(rAssistant.suggestedExitCode).toBe(64);
    expect(rAssistant.receipt.attempts).toBe(0);
    expect(assistantCalls).toBe(0);

    // 6. Double that completes without invoking validateResponse -> row 11, exit 64, attempts: 1, client_did_not_expose_text
    const covNoExpose = createInMemoryCoverage();
    const cacheNoExpose = createInMemoryCache();
    const readFileSyncSpy = vi.spyOn(fs, "readFileSync");
    try {
      const nonExposingDouble: TextJsonGenerationClient = {
        mode: "direct",
        provider: "openai",
        model: "gpt-4o-mini",
        async generateJson() {
          return {
            status: "completed",
            provider: "openai",
            mode: "direct",
            model: "gpt-4o-mini",
            outputPath: "/tmp/nonexistent-should-never-be-read.json",
            audit: {},
          };
        },
      };
      for (let i = 0; i < 3; i++) {
        const rNoExpose = await batchSubpath.extractDocumentBatch({
          document: {
            docSha: DOC_SHA_1,
            sourceFile: "docs/t4-no-expose.pdf",
            pages: [{ page: 1, text: "Alpha" }],
          },
          profileBundle: bundle,
          modelPolicy: DEFAULT_MODEL_POLICY,
          promptVersion: "prompt/v1",
          bounds: {
            timeoutMs: 5000,
            maxDocumentBytes: 100_000,
            maxAttempts: 2,
          },
          client: batchSubpath.adaptTextJsonClient(nonExposingDouble),
          cache: cacheNoExpose.port,
          coverage: { port: covNoExpose.port, city: "ville-exemple", maxFailures: 3 },
          clock: clock.clock,
        });
        expect(rNoExpose.receipt.refusalCode).toBe("unsupported_client");
        expect(rNoExpose.suggestedExitCode).toBe(64);
        expect(rNoExpose.receipt.attempts).toBe(1);
        expect(rNoExpose.receipt.diagnostics).toContain("client_did_not_expose_text");
      }
      expect(covNoExpose.map.size).toBe(0);
      expect(readFileSyncSpy).not.toHaveBeenCalled();
    } finally {
      readFileSyncSpy.mockRestore();
    }

    // 7. Mesh-normalized rejecting doubles
    const cacheMesh = createInMemoryCache();
    const covMesh = createInMemoryCoverage();
    const rMeshRateLimit = await runRejectingDirect(
      () => ({
        providerId: "p",
        message: "rate limited on gateway",
        retryable: true,
        retryReason: "rate_limit",
        code: "rate_limit_exceeded",
      }),
      {
        cache: cacheMesh.port,
        coverage: { port: covMesh.port, city: "ville-exemple" },
      },
    );
    expect(rMeshRateLimit.receipt.refusalCode).toBe("rate_limited");
    expect(rMeshRateLimit.receipt.retryable).toBe(true);
    expect(rMeshRateLimit.suggestedExitCode).toBe(75);
    expect(covMesh.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.retryableFailureCount).toBe(1);

    const covMeshAuth = createInMemoryCoverage();
    const rMeshInvalidKey = await runRejectingDirect(
      () => ({
        providerId: "p",
        message: "invalid api key",
        retryable: false,
        code: "invalid_api_key",
      }),
      {
        cache: cacheMesh.port,
        coverage: { port: covMeshAuth.port, city: "ville-exemple" },
      },
    );
    expect(rMeshInvalidKey.receipt.refusalCode).toBe("client_configuration_error");
    expect(rMeshInvalidKey.suggestedExitCode).toBe(64);
    expect(covMeshAuth.map.size).toBe(0);

    const rMeshBridgeConfig = await runRejectingDirect(
      () => new Error("Graphify mesh: no authResolver configured for provider 'p'. Configure one."),
      {
        cache: cacheMesh.port,
        coverage: { port: covMeshAuth.port, city: "ville-exemple" },
      },
    );
    expect(rMeshBridgeConfig.receipt.refusalCode).toBe("client_configuration_error");
    expect(rMeshBridgeConfig.suggestedExitCode).toBe(64);
    expect(covMeshAuth.map.size).toBe(0);
  });

  it("F-EN3-T5: end-to-end pages, citation stamping, pruning with full cascade, splitter surrogate guard, cache and conflict replay", async () => {
    const bundle = makeFullBundle();
    const cache = createInMemoryCache();
    const cov = createInMemoryCoverage();
    const clock = createManualClock();

    let modelCalls = 0;
    const responsePayload = {
      nodes: [
        {
          id: "alpha:1",
          label: "Valid Alpha",
          file_type: "document",
          source_file: "wrong/file.pdf",
          node_type: "Alpha",
          status: "candidate",
          confidence: "EXTRACTED",
          citations: [
            {
              // (a) cites page 2 with wrong docSha and wrong source_file
              source_file: "wrong/file.pdf",
              docSha: "f".repeat(64),
              page: 2,
              quoteSpan: [0, 10],
              excerpt: "Page two a",
            },
            {
              // (c) quoteSpan exceeds page 2 text length -> dropped
              source_file: "docs/e2e.pdf",
              docSha: DOC_SHA_1,
              page: 2,
              quoteSpan: [0, 500],
              excerpt: "Out of bounds",
            },
          ],
        },
        {
          // (b) cites page 99 (not in document) -> citation dropped -> node pruned by missing_citation_page
          id: "beta:1",
          label: "Invalid Beta",
          file_type: "document",
          source_file: "docs/e2e.pdf",
          node_type: "Beta",
          status: "candidate",
          confidence: "EXTRACTED",
          citations: [
            {
              source_file: "docs/e2e.pdf",
              docSha: DOC_SHA_1,
              page: 99,
              excerpt: "Unknown page",
            },
          ],
        },
      ],
      edges: [
        {
          source: "alpha:1",
          target: "beta:1",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "docs/e2e.pdf",
          citations: [
            {
              source_file: "docs/e2e.pdf",
              docSha: DOC_SHA_1,
              page: 2,
              excerpt: "Edge cite",
            },
          ],
        },
      ],
      hyperedges: [
        {
          id: "he-1",
          label: "Group AB",
          nodes: ["alpha:1", "beta:1"],
          confidence: "EXTRACTED",
          source_file: "docs/e2e.pdf",
        },
      ],
      mentions: [
        {
          id: "m-1",
          text: "Beta mention",
          source_file: "docs/e2e.pdf",
          node_id: "beta:1",
        },
      ],
      occurrences: [
        {
          id: "occ-1",
          source_file: "docs/e2e.pdf",
          linked_entity_ids: ["alpha:1", "beta:1"],
        },
      ],
      mappings: [
        {
          id: "map-1",
          source_id: "beta:1",
          target_id: "alpha:1",
          relation: "same_as",
        },
      ],
      input_tokens: 100,
      output_tokens: 50,
    };

    const client: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        modelCalls++;
        return {
          status: "ok",
          text: JSON.stringify(responsePayload),
          tokensIn: 250,
          tokensOut: 80,
          model: "gpt-4o-mini",
          provider: "openai",
        };
      },
    };

    const extractInput: batchSubpath.HeadlessExtractInput = {
      document: {
        docSha: DOC_SHA_1.toUpperCase(),
        sourceFile: "docs/e2e.pdf",
        pages: [
          { page: 1, text: "Page one content here." },
          { page: 2, text: "Page two alpha content." },
        ],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 2,
      },
      client,
      cache: cache.port,
      coverage: {
        port: cov.port,
        city: "ville-exemple",
      },
      clock: clock.clock,
    };

    const res1 = await batchSubpath.extractDocumentBatch(extractInput);
    expect(res1.receipt.status).toBe("ok");
    expect(res1.receipt.fromCache).toBe(false);
    expect(modelCalls).toBe(1);
    expect(res1.mergeConflicts).toEqual([]);

    // Diagnostics check
    expect(res1.receipt.diagnostics).toContain("citation_identity_overwritten:1");
    expect(res1.receipt.diagnostics).toContain("quote_span_out_of_bounds");
    expect(res1.receipt.diagnostics).toContain("citation_page_unknown");
    expect(res1.receipt.diagnostics).toContain("pruned_node:beta:1:missing_citation_page");
    expect(res1.receipt.diagnostics).toContain("pruned_edge:0:dangling");
    expect(res1.receipt.diagnostics).toContain("pruned_hyperedge:he-1:dangling");
    expect(res1.receipt.diagnostics).toContain("pruned_mention_ref:m-1:dangling");
    expect(res1.receipt.diagnostics).toContain("pruned_occurrence_ref:occ-1:dangling");
    expect(res1.receipt.diagnostics).toContain("pruned_mapping:map-1:dangling");

    // Extraction content check: only alpha:1 survives, no reference to beta:1 anywhere
    expect(res1.extraction?.nodes).toHaveLength(1);
    expect(res1.extraction?.nodes[0]?.id).toBe("alpha:1");
    expect(res1.extraction?.nodes[0]?.citations).toHaveLength(1);
    expect(res1.extraction?.nodes[0]?.citations?.[0]?.docSha).toBe(DOC_SHA_1);
    expect(res1.extraction?.nodes[0]?.citations?.[0]?.source_file).toBe("docs/e2e.pdf");
    expect(res1.extraction?.edges).toEqual([]);
    expect(res1.extraction?.hyperedges ?? []).toEqual([]);
    expect(res1.extraction?.mentions).toHaveLength(1);
    expect(res1.extraction?.mentions?.[0]?.node_id).toBeUndefined();
    expect(res1.extraction?.occurrences).toHaveLength(1);
    expect(res1.extraction?.occurrences?.[0]?.linked_entity_ids).toEqual(["alpha:1"]);
    expect(res1.extraction?.mappings ?? []).toEqual([]);
    expect(JSON.stringify(res1.extraction)).not.toContain("beta:1");

    // Cache and coverage check
    expect(res1.receipt.extractionKey).toBeTruthy();
    expect(cache.map.has(res1.receipt.extractionKey!)).toBe(true);
    const covRec = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
    expect(covRec?.status).toBe("covered");
    expect(covRec?.extractionKey).toBe(res1.receipt.extractionKey);

    // Second identical run: 0 model calls, fromCache: true
    const res2 = await batchSubpath.extractDocumentBatch(extractInput);
    expect(modelCalls).toBe(1);
    expect(res2.receipt.status).toBe("ok");
    expect(res2.receipt.fromCache).toBe(true);
    expect(res2.receipt.attempts).toBe(0);
    expect(res2.extraction).toEqual(res1.extraction);
    expect(res2.mergeConflicts).toEqual(res1.mergeConflicts);

    // Splitter surrogate-pair guard variant
    const capturedPrompts: string[] = [];
    const astralPageText = "012345678😀abcdef"; // index 9 is lead surrogate \uD83D, index 10 is trail \uDE00
    const splitterClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate(input) {
        capturedPrompts.push(input.prompt);
        return {
          status: "ok",
          text: JSON.stringify({ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 }),
          tokensIn: 10,
          tokensOut: 5,
        };
      },
    };

    const resSplit = await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_2,
        sourceFile: "docs/astral.pdf",
        pages: [{ page: 1, text: astralPageText }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 1,
        maxChunkChars: 10,
      },
      client: splitterClient,
      clock: clock.clock,
    });
    expect(resSplit.receipt.status).toBe("ok");
    expect(capturedPrompts.length).toBe(2);
    for (const p of capturedPrompts) {
      // Must contain no lone surrogate
      for (let i = 0; i < p.length; i++) {
        const code = p.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = p.charCodeAt(i + 1);
          expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
          i++;
        } else {
          expect(code >= 0xdc00 && code <= 0xdfff).toBe(false);
        }
      }
    }
    const piece1 = capturedPrompts[0]!.split("[[page 1]]\n")[1]!;
    const piece2 = capturedPrompts[1]!.split("[[page 1 continued 2]]\n")[1]!;
    expect(piece1).toBe("012345678");
    expect(piece2).toBe("😀abcdef");
    expect(piece1 + piece2).toBe(astralPageText);

    // Conflict-replay variant: two chunks disagree on scalar field `score`
    const conflictCache = createInMemoryCache();
    let conflictCalls = 0;
    const conflictClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        conflictCalls++;
        const pageNum = conflictCalls === 1 ? 1 : 2;
        const scoreVal = conflictCalls === 1 ? 10 : 20;
        return {
          status: "ok",
          text: makeValidExtractionJson({
            nodeId: "alpha:1",
            docSha: DOC_SHA_3,
            sourceFile: "docs/conflict.pdf",
            page: pageNum,
            score: scoreVal,
          }),
          tokensIn: 50,
          tokensOut: 20,
        };
      },
    };

    const conflictInput: batchSubpath.HeadlessExtractInput = {
      document: {
        docSha: DOC_SHA_3,
        sourceFile: "docs/conflict.pdf",
        pages: [
          { page: 1, text: "Alpha page one text" },
          { page: 2, text: "Alpha page two text" },
        ],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 1,
        maxChunkChars: 35,
      },
      client: conflictClient,
      cache: conflictCache.port,
      clock: clock.clock,
    };

    const cRun1 = await batchSubpath.extractDocumentBatch(conflictInput);
    expect(cRun1.receipt.status).toBe("ok");
    expect(conflictCalls).toBe(2);
    expect(cRun1.mergeConflicts).toHaveLength(1);
    expect(cRun1.mergeConflicts[0]?.field).toBe("score");
    expect(cRun1.mergeConflicts[0]?.values).toEqual(["10", "20"]);

    const cRun2 = await batchSubpath.extractDocumentBatch(conflictInput);
    expect(conflictCalls).toBe(2);
    expect(cRun2.receipt.fromCache).toBe(true);
    expect(cRun2.mergeConflicts).toEqual(cRun1.mergeConflicts);
  });

  it("F-EN3-T6: pipeline-order edge cases across cache, coverage gate, repair, unknown schema, and retryable bounds", async () => {
    const bundle = makeFullBundle();
    const clock = createManualClock();

    const makeOkClient = (counter: { count: number }): batchSubpath.HeadlessLlmClient => ({
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        counter.count++;
        return {
          status: "ok",
          text: makeValidExtractionJson(),
          tokensIn: 50,
          tokensOut: 20,
          model: "gpt-4o-mini",
          provider: "openai",
        };
      },
    });

    // (i) Coverage abandoned + valid cache entry under current key -> ok from cache; coverage stays abandoned (timestamp only)
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();
      const counter = { count: 0 };
      const baseInput: batchSubpath.HeadlessExtractInput = {
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple" },
        clock: clock.clock,
      };
      const rPop = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rPop.receipt.status).toBe("ok");
      const key = rPop.receipt.extractionKey!;

      // Seed abandoned record
      const abandonedRec = transitionCoverageRecord({
        current: null,
        key: { city: "ville-exemple", docSha: DOC_SHA_1, profileDigest: bundle.digest },
        extractionKey: key,
        outcome: { kind: "failed", status: "refused", refusalCode: "empty_completion", retryable: false },
        maxFailures: 1,
        nowIso: "2026-01-01T00:00:00.000Z",
      });
      expect(abandonedRec.status).toBe("abandoned");
      cov.seedRaw("ville-exemple", DOC_SHA_1, bundle.digest, abandonedRec);

      clock.advanceBy(5000);
      const rHit = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rHit.receipt.status).toBe("ok");
      expect(rHit.receipt.fromCache).toBe(true);
      expect(counter.count).toBe(1);
      const afterRec = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
      expect(afterRec?.status).toBe("abandoned");
      expect(afterRec?.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    }

    // (ii) Coverage covered under current key + empty cache -> extracts with covered_but_cache_miss
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();
      const counter = { count: 0 };
      const baseInput: batchSubpath.HeadlessExtractInput = {
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple" },
        clock: clock.clock,
      };
      await batchSubpath.extractDocumentBatch(baseInput);
      cache.map.clear(); // Empty cache while coverage is covered
      const rMiss = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rMiss.receipt.status).toBe("ok");
      expect(rMiss.receipt.fromCache).toBe(false);
      expect(rMiss.receipt.diagnostics).toContain("covered_but_cache_miss");
      expect(counter.count).toBe(2);
    }

    // (iii) Cache down -> cache_unavailable, 0 model calls, and no coverage record created across 10 runs
    {
      const cache = createInMemoryCache({ throwOnGet: true });
      const cov = createInMemoryCoverage();
      const counter = { count: 0 };
      const baseInput: batchSubpath.HeadlessExtractInput = {
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple", maxRetryableFailures: 10 },
        clock: clock.clock,
      };
      for (let i = 0; i < 10; i++) {
        const rDown = await batchSubpath.extractDocumentBatch(baseInput);
        expect(rDown.receipt.status).toBe("refused");
        expect(rDown.receipt.refusalCode).toBe("cache_unavailable");
        expect(rDown.suggestedExitCode).toBe(75);
      }
      expect(counter.count).toBe(0);
      expect(cov.map.size).toBe(0);

      cache.setThrowOnGet(false);
      const rUp = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rUp.receipt.status).toBe("ok");
      expect(counter.count).toBe(1);
    }

    // (iv) Coverage down + cache hit -> ok; coverage down + cache miss -> coverage_unavailable;
    // plus invalid-record repair, truncated-JSON string repair, and unknown-schema refusal
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();
      const counter = { count: 0 };
      const baseInput: batchSubpath.HeadlessExtractInput = {
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple" },
        clock: clock.clock,
      };
      await batchSubpath.extractDocumentBatch(baseInput);
      cov.setThrowOnGet(true);

      // Coverage down + cache hit -> ok
      const rHitCovDown = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rHitCovDown.receipt.status).toBe("ok");
      expect(rHitCovDown.receipt.fromCache).toBe(true);
      expect(rHitCovDown.receipt.diagnostics).toContain("coverage_write_failed");

      // Coverage down + cache miss -> coverage_unavailable, 0 model calls
      cache.map.clear();
      const prevCount = counter.count;
      const rMissCovDown = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rMissCovDown.receipt.status).toBe("refused");
      expect(rMissCovDown.receipt.refusalCode).toBe("coverage_unavailable");
      expect(rMissCovDown.suggestedExitCode).toBe(75);
      expect(counter.count).toBe(prevCount);

      // Seeded shape-invalid coverage value of known schema -> repairs with coverage_record_invalid
      cov.setThrowOnGet(false);
      cov.seedRaw("ville-exemple", DOC_SHA_1, bundle.digest, {
        schema: "engram.coverage-record/v1",
        status: "not-a-valid-status",
      });
      const rRepairObj = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rRepairObj.receipt.status).toBe("ok");
      expect(rRepairObj.receipt.diagnostics).toContain("coverage_record_invalid");
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.status).toBe("covered");

      // Truncated-JSON raw string stored in coverage -> repairs with coverage_record_invalid
      cache.map.clear();
      cov.seedRaw("ville-exemple", DOC_SHA_1, bundle.digest, '{"schema":"engram.coverage-record/v1","key":');
      const rRepairStr = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rRepairStr.receipt.status).toBe("ok");
      expect(rRepairStr.receipt.diagnostics).toContain("coverage_record_invalid");
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.status).toBe("covered");

      // Unknown-schema coverage record -> row 7 coverage_unavailable, exit 75, 0 model calls, byte-identical
      cache.map.clear();
      const unknownSchemaRec = {
        schema: "engram.coverage-record/v2",
        key: { city: "ville-exemple", docSha: DOC_SHA_1, profileDigest: bundle.digest },
        status: "pending",
      };
      cov.seedRaw("ville-exemple", DOC_SHA_1, bundle.digest, structuredClone(unknownSchemaRec));
      const countBeforeUnknown = counter.count;
      const rUnknownSchema = await batchSubpath.extractDocumentBatch(baseInput);
      expect(rUnknownSchema.receipt.status).toBe("refused");
      expect(rUnknownSchema.receipt.refusalCode).toBe("coverage_unavailable");
      expect(rUnknownSchema.suggestedExitCode).toBe(75);
      expect(rUnknownSchema.receipt.diagnostics).toContain(
        "coverage_record_unknown_schema:engram.coverage-record/v2",
      );
      expect(counter.count).toBe(countBeforeUnknown);
      expect(cov.map.get(covKeyString({ city: "ville-exemple", docSha: DOC_SHA_1, profileDigest: bundle.digest }))).toEqual(
        unknownSchemaRec,
      );
    }

    // (v) maxRetryableFailures: 3 with deadline_exceeded; maxRetryableFailures: 25 with rate_limited; maxFailures: 3 with invalid_json_output
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();
      let timeoutCalls = 0;
      const timeoutClient: batchSubpath.HeadlessLlmClient = {
        provider: "openai",
        model: "gpt-4o-mini",
        async generate() {
          timeoutCalls++;
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        },
      };
      const timeoutInput: batchSubpath.HeadlessExtractInput = {
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6-v.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 1000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: timeoutClient,
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple", maxFailures: 3, maxRetryableFailures: 3 },
        clock: clock.clock,
      };
      await batchSubpath.extractDocumentBatch(timeoutInput);
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.status).toBe("pending");
      await batchSubpath.extractDocumentBatch(timeoutInput);
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.status).toBe("pending");
      await batchSubpath.extractDocumentBatch(timeoutInput);
      const recAfter3 = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
      expect(recAfter3?.status).toBe("abandoned");
      expect(recAfter3?.lastRefusalCode).toBe("deadline_exceeded");
      expect(timeoutCalls).toBe(3);

      // 4th run -> row 8 abandoned with 0 model calls and batch exit 0
      const batch4 = await batchSubpath.runHeadlessExtractionBatch([timeoutInput]);
      expect(batch4.results[0]?.receipt.status).toBe("abandoned");
      expect(batch4.results[0]?.receipt.attempts).toBe(0);
      expect(batch4.suggestedExitCode).toBe(0);
      expect(timeoutCalls).toBe(3);

      // maxRetryableFailures: 25 -> 10 rate_limited runs never abandon
      const rateLimitClient: batchSubpath.HeadlessLlmClient = {
        provider: "openai",
        model: "gpt-4o-mini",
        async generate() {
          throw Object.assign(new Error("429"), { status: 429 });
        },
      };
      for (let i = 0; i < 10; i++) {
        await batchSubpath.extractDocumentBatch({
          ...timeoutInput,
          document: { docSha: DOC_SHA_2, sourceFile: "docs/t6-rl.pdf", pages: [{ page: 1, text: "Alpha" }] },
          client: rateLimitClient,
          coverage: { port: cov.port, city: "ville-exemple", maxFailures: 3, maxRetryableFailures: 25 },
        });
      }
      expect(cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)?.status).toBe("pending");
      expect(cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)?.retryableFailureCount).toBe(10);

      // 3 invalid_json_output runs (maxFailures: 3) -> 4th run abandoned with 0 model calls
      let badJsonCalls = 0;
      const badJsonClient: batchSubpath.HeadlessLlmClient = {
        provider: "openai",
        model: "gpt-4o-mini",
        async generate() {
          badJsonCalls++;
          return { status: "ok", text: "not json", tokensIn: 10, tokensOut: 2 };
        },
      };
      const badJsonInput: batchSubpath.HeadlessExtractInput = {
        ...timeoutInput,
        document: { docSha: DOC_SHA_3, sourceFile: "docs/t6-json.pdf", pages: [{ page: 1, text: "Alpha" }] },
        client: badJsonClient,
        coverage: { port: cov.port, city: "ville-exemple", maxFailures: 3 },
      };
      for (let i = 0; i < 3; i++) {
        await batchSubpath.extractDocumentBatch(badJsonInput);
      }
      expect(badJsonCalls).toBe(3);
      const r4th = await batchSubpath.extractDocumentBatch(badJsonInput);
      expect(r4th.receipt.status).toBe("abandoned");
      expect(r4th.receipt.attempts).toBe(0);
      expect(badJsonCalls).toBe(3);
    }

    // (vi) Pre-gate outcomes never re-open abandoned
    {
      const cache = createInMemoryCache({ throwOnGet: true });
      const cov = createInMemoryCoverage();
      const counter = { count: 0 };
      const seededAbandoned = transitionCoverageRecord({
        current: null,
        key: { city: "ville-exemple", docSha: DOC_SHA_1, profileDigest: bundle.digest },
        extractionKey: "e".repeat(64),
        outcome: { kind: "failed", status: "refused", refusalCode: "empty_completion", retryable: false },
        maxFailures: 1,
        nowIso: "2026-01-01T00:00:00.000Z",
      });
      cov.seedRaw("ville-exemple", DOC_SHA_1, bundle.digest, structuredClone(seededAbandoned));

      const rCacheDown = await batchSubpath.extractDocumentBatch({
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6-vi.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple" },
        clock: clock.clock,
      });
      expect(rCacheDown.receipt.refusalCode).toBe("cache_unavailable");
      expect(rCacheDown.suggestedExitCode).toBe(75);
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)).toEqual(seededAbandoned);

      // Oversized document on seeded abandoned with empty cache -> too-large receipt, record still abandoned
      cache.setThrowOnGet(false);
      clock.advanceBy(1000);
      const rTooLarge = await batchSubpath.extractDocumentBatch({
        document: {
          docSha: DOC_SHA_1,
          sourceFile: "docs/t6-vi.pdf",
          pages: [{ page: 1, text: "x".repeat(200) }],
        },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 50, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple" },
        clock: clock.clock,
      });
      expect(rTooLarge.receipt.status).toBe("too-large");
      const recAfterTooLarge = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
      expect(recAfterTooLarge?.status).toBe("abandoned");
      expect(recAfterTooLarge?.totalFailureCount).toBe(seededAbandoned.totalFailureCount + 1);
    }

    // (vii) Misconfiguration never abandons: 3 unsupported_client runs create no coverage record
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();
      const counter = { count: 0 };
      const assistantDouble: TextJsonGenerationClient = {
        mode: "assistant",
        provider: "openai",
        model: "gpt-4o-mini",
        async generateJson() {
          return { status: "instructions_written", provider: "openai", mode: "assistant", audit: {} };
        },
      };
      for (let i = 0; i < 3; i++) {
        const r = await batchSubpath.extractDocumentBatch({
          document: { docSha: DOC_SHA_1, sourceFile: "docs/t6-vii.pdf", pages: [{ page: 1, text: "Alpha" }] },
          profileBundle: bundle,
          modelPolicy: DEFAULT_MODEL_POLICY,
          promptVersion: "prompt/v1",
          bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
          client: batchSubpath.adaptTextJsonClient(assistantDouble),
          cache: cache.port,
          coverage: { port: cov.port, city: "ville-exemple", maxFailures: 3 },
          clock: clock.clock,
        });
        expect(r.receipt.refusalCode).toBe("unsupported_client");
      }
      expect(cov.map.size).toBe(0);

      const rGood = await batchSubpath.extractDocumentBatch({
        document: { docSha: DOC_SHA_1, sourceFile: "docs/t6-vii.pdf", pages: [{ page: 1, text: "Alpha" }] },
        profileBundle: bundle,
        modelPolicy: DEFAULT_MODEL_POLICY,
        promptVersion: "prompt/v1",
        bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
        client: makeOkClient(counter),
        cache: cache.port,
        coverage: { port: cov.port, city: "ville-exemple", maxFailures: 3 },
        clock: clock.clock,
      });
      expect(rGood.receipt.status).toBe("ok");
      expect(counter.count).toBe(1);
    }
  });

  it("F-EN3-T7: identity and input validation, bundle re-derivation, key-sorted profile prompts, registry sorting, and sourceFile rename", async () => {
    const bundle = makeFullBundle();
    const clock = createManualClock();
    let calls = 0;
    const capturedPrompts: string[] = [];

    const client: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate(input) {
        calls++;
        capturedPrompts.push(input.prompt);
        return {
          status: "ok",
          text: makeValidExtractionJson({ sourceFile: "docs/original.pdf" }),
          tokensIn: 50,
          tokensOut: 20,
          model: "gpt-4o-mini",
          provider: "openai",
        };
      },
    };

    const baseInput: batchSubpath.HeadlessExtractInput = {
      document: { docSha: DOC_SHA_1, sourceFile: "docs/original.pdf", pages: [{ page: 1, text: "Alpha" }] },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 2 },
      client,
      clock: clock.clock,
    };

    // 1. Bindings-only bundle -> invalid_identity, 0 calls
    const bindingsOnlyRes = bundleProfile(SYNTHETIC_PROFILE_YAML);
    expect(bindingsOnlyRes.ok).toBe(true);
    if (!bindingsOnlyRes.ok) return;
    const rBindingsOnly = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: bindingsOnlyRes.bundle,
    });
    expect(rBindingsOnly.receipt.refusalCode).toBe("invalid_identity");
    expect(rBindingsOnly.suggestedExitCode).toBe(65);
    expect(calls).toBe(0);

    // 2. Tampered bundle (documentProjection scalar flipped, digest left stale) -> invalid_identity with invalid_profile_bundle
    const covTamper = createInMemoryCoverage();
    const cacheTamper = createInMemoryCache();
    const tamperedDocProj = structuredClone(bundle.documentProjection) as Record<string, unknown>;
    tamperedDocProj.default_language = "en";
    const tamperedBundle: ProfileBundleV1 = {
      ...bundle,
      documentProjection: tamperedDocProj as ProfileBundleV1["documentProjection"],
    };
    const rTampered = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: tamperedBundle,
      cache: cacheTamper.port,
      coverage: { port: covTamper.port, city: "ville-exemple" },
    });
    expect(rTampered.receipt.refusalCode).toBe("invalid_identity");
    expect(rTampered.receipt.diagnostics).toContain("invalid_profile_bundle");
    expect(rTampered.suggestedExitCode).toBe(65);
    expect(calls).toBe(0);
    expect(covTamper.map.size).toBe(0);

    // 3. bundle.profile tamper case: alter bundle.profile scalar leaving documentProjection and digest intact ->
    // captured prompts byte-equal genuine bundle and second run is a cache hit with 0 model calls
    const cacheProfTamper = createInMemoryCache();
    const rGenuine = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      cache: cacheProfTamper.port,
    });
    expect(rGenuine.receipt.status).toBe("ok");
    expect(calls).toBe(1);
    const genuinePrompt = capturedPrompts[0]!;

    const mutatedProfile = structuredClone(bundle.profile) as unknown as Record<string, unknown>;
    mutatedProfile.default_language = "TAMPERED_LANG";
    mutatedProfile.id = "tampered-id";
    const profTamperedBundle: ProfileBundleV1 = {
      ...bundle,
      profile: mutatedProfile as unknown as ProfileBundleV1["profile"],
    };

    // Hit against genuine cache
    const rProfTamperHit = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: profTamperedBundle,
      cache: cacheProfTamper.port,
    });
    expect(rProfTamperHit.receipt.status).toBe("ok");
    expect(rProfTamperHit.receipt.fromCache).toBe(true);
    expect(calls).toBe(1);

    // Without cache, prompt is still byte-identical to genuinePrompt
    const rProfTamperFresh = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: profTamperedBundle,
    });
    expect(rProfTamperFresh.receipt.status).toBe("ok");
    expect(capturedPrompts[1]).toBe(genuinePrompt);

    // 4. Policy/client model mismatch -> invalid_identity
    const rModelMismatch = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      modelPolicy: { ...DEFAULT_MODEL_POLICY, model: "other-model" },
    });
    expect(rModelMismatch.receipt.refusalCode).toBe("invalid_identity");
    expect(rModelMismatch.suggestedExitCode).toBe(65);

    // 5. Empty sourceFile -> invalid_document_input, 0 new calls, no coverage record
    const callsBeforeInvalidDoc = calls;
    const rEmptySf = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      document: { docSha: DOC_SHA_1, sourceFile: "   ", pages: [{ page: 1, text: "Alpha" }] },
      cache: cacheTamper.port,
      coverage: { port: covTamper.port, city: "ville-exemple" },
    });
    expect(rEmptySf.receipt.refusalCode).toBe("invalid_document_input");
    expect(rEmptySf.suggestedExitCode).toBe(65);
    expect(calls).toBe(callsBeforeInvalidDoc);
    expect(covTamper.map.size).toBe(0);

    // 6. Empty coverage.city -> invalid_bounds, exit 64, 0 calls
    const rEmptyCity = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      cache: cacheTamper.port,
      coverage: { port: covTamper.port, city: "" },
    });
    expect(rEmptyCity.receipt.refusalCode).toBe("invalid_bounds");
    expect(rEmptyCity.suggestedExitCode).toBe(64);

    // 7. Duplicate page numbers / non-integer page -> invalid_document_input
    const rDupPage = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/dup.pdf",
        pages: [
          { page: 1, text: "A" },
          { page: 1, text: "B" },
        ],
      },
    });
    expect(rDupPage.receipt.refusalCode).toBe("invalid_document_input");
    expect(rDupPage.suggestedExitCode).toBe(65);

    const rFloatPage = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/float.pdf",
        pages: [{ page: 1.5, text: "A" }],
      },
    });
    expect(rFloatPage.receipt.refusalCode).toBe("invalid_document_input");
    expect(rFloatPage.suggestedExitCode).toBe(65);

    // 8. maxAttempts: 0, maxAttempts: 1.5, maxChunkChars: 1.5 -> invalid_bounds, exit 64
    for (const badBounds of [
      { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 0 },
      { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1.5 },
      { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1, maxChunkChars: 1.5 },
    ]) {
      const rBadBounds = await batchSubpath.extractDocumentBatch({
        ...baseInput,
        bounds: badBounds,
      });
      expect(rBadBounds.receipt.refusalCode).toBe("invalid_bounds");
      expect(rBadBounds.suggestedExitCode).toBe(64);
    }

    // 9. coverage without cache -> invalid_bounds, exit 64
    const rCovNoCache = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      coverage: { port: covTamper.port, city: "ville-exemple" },
    });
    expect(rCovNoCache.receipt.refusalCode).toBe("invalid_bounds");
    expect(rCovNoCache.suggestedExitCode).toBe(64);

    // 10. Registry records whose digest != bundle -> row 4 (invalid_identity + registry_digest_mismatch)
    const rBadReg = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      registries: {
        reg_alpha: [makeRegistryRecord("rec-1", "Different Label")],
      },
    });
    expect(rBadReg.receipt.refusalCode).toBe("invalid_identity");
    expect(rBadReg.receipt.diagnostics).toContain("registry_digest_mismatch");
    expect(rBadReg.suggestedExitCode).toBe(65);

    // 11. Key-order variant: two bundles from key-permuted renderings -> identical prompts and cache hit
    const bundleReordered = makeFullBundle(SYNTHETIC_PROFILE_REORDERED_YAML, DEFAULT_RECORDS);
    expect(bundleReordered.digest).toBe(bundle.digest);
    const cacheKeyOrder = createInMemoryCache();
    const promptsBeforeOrder = capturedPrompts.length;
    const rOrder1 = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: bundle,
      cache: cacheKeyOrder.port,
    });
    expect(rOrder1.receipt.status).toBe("ok");
    const promptOrder1 = capturedPrompts[promptsBeforeOrder]!;

    const rOrder2Hit = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: bundleReordered,
      cache: cacheKeyOrder.port,
    });
    expect(rOrder2Hit.receipt.status).toBe("ok");
    expect(rOrder2Hit.receipt.fromCache).toBe(true);

    const rOrder2Fresh = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      profileBundle: bundleReordered,
    });
    expect(rOrder2Fresh.receipt.status).toBe("ok");
    expect(capturedPrompts[capturedPrompts.length - 1]).toBe(promptOrder1);

    // 12. Registry presence sensitivity & record sorting invariance
    const cacheReg = createInMemoryCache();
    const rWithoutReg = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      cache: cacheReg.port,
    });
    const callsAfterNoReg = calls;
    const rWithReg = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      registries: { reg_alpha: [DEFAULT_RECORDS[1]!, DEFAULT_RECORDS[0]!] },
      cache: cacheReg.port,
    });
    expect(calls).toBe(callsAfterNoReg + 1);
    expect(rWithReg.receipt.extractionKey).not.toBe(rWithoutReg.receipt.extractionKey);

    // Shuffled record input order -> cache hit, 0 model calls
    const rWithRegShuffled = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      registries: { reg_alpha: [DEFAULT_RECORDS[0]!, DEFAULT_RECORDS[1]!] },
      cache: cacheReg.port,
    });
    expect(rWithRegShuffled.receipt.fromCache).toBe(true);
    expect(calls).toBe(callsAfterNoReg + 1);

    // 13. Same bytes, renamed sourceFile -> cache hit, stored source_file preserved, source_file_differs_from_cached diagnostic
    const rRenamed = await batchSubpath.extractDocumentBatch({
      ...baseInput,
      document: { docSha: DOC_SHA_1, sourceFile: "docs/renamed.pdf", pages: [{ page: 1, text: "Alpha" }] },
      cache: cacheReg.port,
    });
    expect(rRenamed.receipt.status).toBe("ok");
    expect(rRenamed.receipt.fromCache).toBe(true);
    expect(rRenamed.extraction?.nodes[0]?.citations?.[0]?.source_file).toBe("docs/original.pdf");
    expect(rRenamed.receipt.diagnostics).toContain("source_file_differs_from_cached:docs/original.pdf");
  });

  it("F-EN3-T8: batch aggregation, summary partition invariant, exit code precedence, and concurrency input ordering", async () => {
    const bundle = makeFullBundle();
    const cache = createInMemoryCache();
    const cov = createInMemoryCoverage();
    const clock = createManualClock();

    const assertBatchPartition = (batch: batchSubpath.HeadlessBatchResult) => {
      const s = batch.summary;
      expect(s.ok + s.refused + s.timeout + s.tooLarge + s.abandoned).toBe(s.total);
      expect(s.okFromCache).toBeLessThanOrEqual(s.ok);
    };

    const okClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        return {
          status: "ok",
          text: makeValidExtractionJson(),
          tokensIn: 100,
          tokensOut: 30,
          model: "gpt-4o-mini",
          provider: "openai",
        };
      },
    };

    const emptyClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        return { status: "ok", text: "", tokensIn: 10, tokensOut: 0 };
      },
    };

    const makeDocInput = (
      docSha: string,
      overrides: Partial<batchSubpath.HeadlessExtractInput> = {},
    ): batchSubpath.HeadlessExtractInput => ({
      document: { docSha, sourceFile: `docs/${docSha.slice(0, 6)}.pdf`, pages: [{ page: 1, text: "Alpha" }] },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 1 },
      client: okClient,
      cache: cache.port,
      coverage: { port: cov.port, city: "ville-exemple" },
      clock: clock.clock,
      ...overrides,
    });

    // Pre-populate DOC_SHA_1 in cache, and seed DOC_SHA_3 as abandoned
    await batchSubpath.extractDocumentBatch(makeDocInput(DOC_SHA_1));
    const seededAbandoned = transitionCoverageRecord({
      current: null,
      key: { city: "ville-exemple", docSha: DOC_SHA_3, profileDigest: bundle.digest },
      extractionKey: "e".repeat(64),
      outcome: { kind: "failed", status: "refused", refusalCode: "empty_completion", retryable: false },
      maxFailures: 1,
      nowIso: clock.clock.nowIso(),
    });
    cov.seedRaw("ville-exemple", DOC_SHA_3, bundle.digest, seededAbandoned);

    // 1. Batch of [ok (cached), ok (fresh), terminal-refused, abandoned, too-large] -> exit 0
    const batch1 = await batchSubpath.runHeadlessExtractionBatch([
      makeDocInput(DOC_SHA_1), // cached ok
      makeDocInput(DOC_SHA_2), // fresh ok
      makeDocInput("5".repeat(64), { client: emptyClient }), // terminal-refused (empty_completion)
      makeDocInput(DOC_SHA_3), // abandoned
      makeDocInput(DOC_SHA_4, {
        document: { docSha: DOC_SHA_4, sourceFile: "docs/big.pdf", pages: [{ page: 1, text: "x".repeat(200) }] },
        bounds: { timeoutMs: 5000, maxDocumentBytes: 50, maxAttempts: 1 },
      }), // too-large
    ]);

    assertBatchPartition(batch1);
    expect(batch1.suggestedExitCode).toBe(0);
    expect(batch1.summary).toEqual({
      total: 5,
      ok: 2,
      okFromCache: 1,
      refused: 1,
      timeout: 0,
      tooLarge: 1,
      abandoned: 1,
      tokensIn: 110,
      tokensOut: 30,
      tokensUnknownCount: 3, // cached ok, abandoned, too-large have null tokens
    });

    // 2. Batch with retryable cache_unavailable counts it in summary.refused and exits 75
    const downCache = createInMemoryCache({ throwOnGet: true });
    const batchCacheDown = await batchSubpath.runHeadlessExtractionBatch([
      makeDocInput("6".repeat(64), { cache: downCache.port }),
    ]);
    assertBatchPartition(batchCacheDown);
    expect(batchCacheDown.summary.refused).toBe(1);
    expect(batchCacheDown.suggestedExitCode).toBe(75);

    // 3. Add one timeout -> exit 75
    const abortClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        const err = new Error("abort");
        err.name = "AbortError";
        throw err;
      },
    };
    const batchTimeout = await batchSubpath.runHeadlessExtractionBatch([
      makeDocInput(DOC_SHA_1),
      makeDocInput("7".repeat(64), { client: abortClient }),
    ]);
    assertBatchPartition(batchTimeout);
    expect(batchTimeout.summary.timeout).toBe(1);
    expect(batchTimeout.suggestedExitCode).toBe(75);

    // 4. Batch of [invalid_document_input only] -> per-doc code 65, batch exit 0
    const batchInvalidDoc = await batchSubpath.runHeadlessExtractionBatch([
      makeDocInput("8".repeat(64), {
        document: { docSha: "8".repeat(64), sourceFile: "", pages: [{ page: 1, text: "Alpha" }] },
      }),
    ]);
    assertBatchPartition(batchInvalidDoc);
    expect(batchInvalidDoc.results[0]?.suggestedExitCode).toBe(65);
    expect(batchInvalidDoc.suggestedExitCode).toBe(0);

    // 5. Batch with invalid_identity -> exit 65; with invalid_bounds -> 64 beats 65; retryable 75 beats both
    const badIdInput = makeDocInput("not-a-digest");
    const badBoundsInput = makeDocInput(DOC_SHA_1, {
      bounds: { timeoutMs: 0, maxDocumentBytes: 100_000, maxAttempts: 1 },
    });

    const batch65 = await batchSubpath.runHeadlessExtractionBatch([badIdInput]);
    assertBatchPartition(batch65);
    expect(batch65.suggestedExitCode).toBe(65);

    const batch64 = await batchSubpath.runHeadlessExtractionBatch([badIdInput, badBoundsInput]);
    assertBatchPartition(batch64);
    expect(batch64.suggestedExitCode).toBe(64);

    const batch75 = await batchSubpath.runHeadlessExtractionBatch([
      badIdInput,
      badBoundsInput,
      makeDocInput("9".repeat(64), { client: abortClient }),
    ]);
    assertBatchPartition(batch75);
    expect(batch75.suggestedExitCode).toBe(75);

    // 6. Empty batch -> exit 0, zeroed summary
    const batchEmpty = await batchSubpath.runHeadlessExtractionBatch([]);
    assertBatchPartition(batchEmpty);
    expect(batchEmpty.results).toEqual([]);
    expect(batchEmpty.suggestedExitCode).toBe(0);
    expect(batchEmpty.summary).toEqual({
      total: 0,
      ok: 0,
      okFromCache: 0,
      refused: 0,
      timeout: 0,
      tooLarge: 0,
      abandoned: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensUnknownCount: 0,
    });

    // 7. Results in input order under concurrency: 2 with reversed completion order
    let resolveDoc1!: () => void;
    const doc1Barrier = new Promise<void>((r) => {
      resolveDoc1 = r;
    });
    const completionOrder: string[] = [];

    const slowClient1: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        await doc1Barrier;
        completionOrder.push("doc1");
        return {
          status: "ok",
          text: makeValidExtractionJson({ docSha: "a".repeat(64), label: "First Input" }),
          tokensIn: 10,
          tokensOut: 5,
        };
      },
    };
    const fastClient2: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        completionOrder.push("doc2");
        resolveDoc1();
        return {
          status: "ok",
          text: makeValidExtractionJson({ docSha: "b".repeat(64), label: "Second Input" }),
          tokensIn: 20,
          tokensOut: 10,
        };
      },
    };

    const batchConcurrent = await batchSubpath.runHeadlessExtractionBatch(
      [
        makeDocInput("a".repeat(64), { client: slowClient1, cache: undefined, coverage: undefined }),
        makeDocInput("b".repeat(64), { client: fastClient2, cache: undefined, coverage: undefined }),
      ],
      { concurrency: 2 },
    );
    expect(completionOrder).toEqual(["doc2", "doc1"]);
    expect(batchConcurrent.results[0]?.receipt.docSha).toBe("a".repeat(64));
    expect(batchConcurrent.results[1]?.receipt.docSha).toBe("b".repeat(64));
  });

  it("F-EN3-T9: semantics pin golden guard on EXTRACTION_SEMANTICS_VERSION, schema, prompt, and splitter", async () => {
    const bundle = makeFullBundle(SYNTHETIC_PROFILE_YAML, DEFAULT_RECORDS);
    const clock = createManualClock();

    let capturedPrompt = "";
    let capturedSchema = "";
    const promptCaptureClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate(input) {
        capturedPrompt = input.prompt;
        capturedSchema = input.schema;
        return {
          status: "ok",
          text: JSON.stringify({ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 }),
          tokensIn: 0,
          tokensOut: 0,
        };
      },
    };

    await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_1,
        sourceFile: "docs/pinned.pdf",
        pages: [{ page: 1, text: "Pinned page one content." }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 1,
        maxChunkChars: 20_000,
      },
      registries: {
        reg_alpha: [DEFAULT_RECORDS[1]!, DEFAULT_RECORDS[0]!],
      },
      maxRegistrySamplesPerRegistry: 3,
      client: promptCaptureClient,
      clock: clock.clock,
    });

    const splitChunks: string[] = [];
    const splitterCaptureClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate(input) {
        const marker = "## Chunk content\n";
        const idx = input.prompt.indexOf(marker);
        splitChunks.push(idx >= 0 ? input.prompt.slice(idx + marker.length) : input.prompt);
        return {
          status: "ok",
          text: JSON.stringify({ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 }),
          tokensIn: 0,
          tokensOut: 0,
        };
      },
    };

    await batchSubpath.extractDocumentBatch({
      document: {
        docSha: DOC_SHA_2,
        sourceFile: "docs/pinned-split.pdf",
        pages: [{ page: 1, text: "Line1\nLine2 with spaces and\n012345678😀abcdef" }],
      },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: {
        timeoutMs: 5000,
        maxDocumentBytes: 100_000,
        maxAttempts: 1,
        maxChunkChars: 10,
      },
      client: splitterCaptureClient,
      clock: clock.clock,
    });

    const actualPin = {
      semanticsVersion: EXTRACTION_SEMANTICS_VERSION,
      schema: capturedSchema || batchSubpath.EXTRACTION_SCHEMA_V1,
      promptSha256: sha256Hex(capturedPrompt),
      splitterSha256: sha256Hex(JSON.stringify(splitChunks)),
    };

    // 1. Live pin must match the committed golden
    expect(actualPin).toEqual(T9_SEMANTICS_GOLDEN);
    expect(() => verifySemanticsGolden(actualPin, T9_SEMANTICS_GOLDEN)).not.toThrow();

    // 2. Hash move without semanticsVersion move -> "bump EXTRACTION_SEMANTICS_VERSION"
    expect(() =>
      verifySemanticsGolden(
        { ...actualPin, promptSha256: "0".repeat(64) },
        T9_SEMANTICS_GOLDEN,
      ),
    ).toThrow(/bump EXTRACTION_SEMANTICS_VERSION/);

    expect(() =>
      verifySemanticsGolden(
        { ...actualPin, splitterSha256: "0".repeat(64) },
        T9_SEMANTICS_GOLDEN,
      ),
    ).toThrow(/bump EXTRACTION_SEMANTICS_VERSION/);

    // 3. semanticsVersion move without golden update -> "re-record the golden"
    expect(() =>
      verifySemanticsGolden(
        { ...actualPin, semanticsVersion: "engram-extraction-semantics/2" },
        T9_SEMANTICS_GOLDEN,
      ),
    ).toThrow(/re-record the golden/);
  });

  it("F-EN3-T10: batch row-24 guard (owner option O-1, option C) across systemic, isolated, mixed, and crash replay", async () => {
    const bundle = makeFullBundle();
    const clock = createManualClock();

    const unknownThrowClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        throw new Error("unrecognized gateway error shape");
      },
    };

    const nativeRow24Client: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        return {
          status: "refused",
          refusalCode: "upstream_error",
          retryable: false,
          tokensIn: 10,
          tokensOut: 0,
        };
      },
    };

    const okClient: batchSubpath.HeadlessLlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async generate() {
        return {
          status: "ok",
          text: makeValidExtractionJson(),
          tokensIn: 80,
          tokensOut: 25,
          model: "gpt-4o-mini",
          provider: "openai",
        };
      },
    };

    const makeInput = (
      docSha: string,
      cache: ExtractionCachePort,
      cov: CoverageRegistryPort,
      client: batchSubpath.HeadlessLlmClient = unknownThrowClient,
    ): batchSubpath.HeadlessExtractInput => ({
      document: { docSha, sourceFile: `docs/${docSha.slice(0, 6)}.pdf`, pages: [{ page: 1, text: "Alpha" }] },
      profileBundle: bundle,
      modelPolicy: DEFAULT_MODEL_POLICY,
      promptVersion: "prompt/v1",
      bounds: { timeoutMs: 5000, maxDocumentBytes: 100_000, maxAttempts: 2 },
      client,
      cache,
      coverage: { port: cov, city: "ville-exemple", maxFailures: 3 },
      clock: clock.clock,
    });

    // (i) Systemic: 3 non-cached documents throwing same unknown error -> exit 64, 0 coverage puts
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();

      // Seed a pending record for DOC_SHA_1 to verify it stays byte-identical
      const seededPending = transitionCoverageRecord({
        current: null,
        key: { city: "ville-exemple", docSha: DOC_SHA_1, profileDigest: bundle.digest },
        extractionKey: "a".repeat(64),
        outcome: { kind: "reset" },
        maxFailures: 3,
        nowIso: "2026-01-01T00:00:00.000Z",
      });
      cov.seedRaw("ville-exemple", DOC_SHA_1, bundle.digest, structuredClone(seededPending));

      const batchSys = await batchSubpath.runHeadlessExtractionBatch([
        makeInput(DOC_SHA_1, cache.port, cov.port),
        makeInput(DOC_SHA_2, cache.port, cov.port),
        makeInput(DOC_SHA_3, cache.port, cov.port),
      ]);

      expect(batchSys.suggestedExitCode).toBe(64);
      expect(batchSys.summary.refused).toBe(3);
      expect(
        batchSys.summary.ok +
          batchSys.summary.refused +
          batchSys.summary.timeout +
          batchSys.summary.tooLarge +
          batchSys.summary.abandoned,
      ).toBe(batchSys.summary.total);

      for (const r of batchSys.results) {
        expect(r.receipt.status).toBe("refused");
        expect(r.receipt.refusalCode).toBe("upstream_error");
        expect(r.receipt.diagnostics).toContain("unclassified_client_error");
        expect(r.receipt.attempts).toBe(1);
        expect(r.suggestedExitCode).toBe(0);
      }

      // No coverage puts for any of the three
      expect(cov.calls.put).toBe(0);
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)).toEqual(seededPending);
      expect(cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)).toBeUndefined();
      expect(cov.getRecord("ville-exemple", DOC_SHA_3, bundle.digest)).toBeUndefined();

      // Cache-hit variant: a 4th document served from cache (row 10) does not prevent the guard,
      // and its own ok transition IS written
      await batchSubpath.extractDocumentBatch(makeInput(DOC_SHA_4, cache.port, cov.port, okClient));
      cov.putHistory.length = 0;
      cov.calls.put = 0;

      const batchSysWithHit = await batchSubpath.runHeadlessExtractionBatch([
        makeInput(DOC_SHA_1, cache.port, cov.port),
        makeInput(DOC_SHA_2, cache.port, cov.port),
        makeInput(DOC_SHA_3, cache.port, cov.port),
        makeInput(DOC_SHA_4, cache.port, cov.port, unknownThrowClient), // hits cache
      ]);

      expect(batchSysWithHit.suggestedExitCode).toBe(64);
      expect(batchSysWithHit.summary.okFromCache).toBe(1);
      expect(cov.calls.put).toBe(1);
      expect(cov.putHistory[0]?.key.docSha).toBe(DOC_SHA_4);
      expect(cov.putHistory[0]?.status).toBe("covered");
      expect(cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)).toBeUndefined();
    }

    // (ii) Isolated: batch of 1 non-cached document -> option A: batch exit 0, transition written, 3 runs abandon
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();

      for (let i = 1; i <= 3; i++) {
        const batchIso = await batchSubpath.runHeadlessExtractionBatch([
          makeInput(DOC_SHA_1, cache.port, cov.port),
        ]);
        expect(batchIso.suggestedExitCode).toBe(0);
        expect(batchIso.results[0]?.suggestedExitCode).toBe(0);
        expect(cov.calls.put).toBe(i);
        const rec = cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest);
        expect(rec?.failureCount).toBe(i);
        expect(rec?.status).toBe(i < 3 ? "pending" : "abandoned");
      }
    }

    // (iii) Mixed: [row-24, row-24, fresh ok] -> exit 0, both row-24 transitions written
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();

      const batchMixed = await batchSubpath.runHeadlessExtractionBatch([
        makeInput(DOC_SHA_1, cache.port, cov.port, unknownThrowClient),
        makeInput(DOC_SHA_2, cache.port, cov.port, unknownThrowClient),
        makeInput(DOC_SHA_3, cache.port, cov.port, okClient),
      ]);

      expect(batchMixed.suggestedExitCode).toBe(0);
      expect(cov.calls.put).toBe(3);
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.failureCount).toBe(1);
      expect(cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)?.failureCount).toBe(1);
      expect(cov.getRecord("ville-exemple", DOC_SHA_3, bundle.digest)?.status).toBe("covered");

      // Differing-reason variant: [thrown unknown, native non-retryable refusal] -> exit 0, both transitions written
      const cacheDiff = createInMemoryCache();
      const covDiff = createInMemoryCoverage();
      const batchDiffReason = await batchSubpath.runHeadlessExtractionBatch([
        makeInput(DOC_SHA_1, cacheDiff.port, covDiff.port, unknownThrowClient),
        makeInput(DOC_SHA_2, cacheDiff.port, covDiff.port, nativeRow24Client),
      ]);

      expect(batchDiffReason.suggestedExitCode).toBe(0);
      expect(covDiff.calls.put).toBe(2);
      expect(covDiff.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.failureCount).toBe(1);
      expect(covDiff.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)?.failureCount).toBe(1);
    }

    // (iv) Crash replay: [okDoc, row24Doc, hangingDoc] under concurrency: 1
    {
      const cache = createInMemoryCache();
      const cov = createInMemoryCoverage();
      let hangingStarted!: () => void;
      const hangingStartedPromise = new Promise<void>((r) => {
        hangingStarted = r;
      });

      const hangingClient: batchSubpath.HeadlessLlmClient = {
        provider: "openai",
        model: "gpt-4o-mini",
        generate() {
          hangingStarted();
          return new Promise<batchSubpath.HeadlessLlmTurnResponse>(() => {
            // Never settles (simulates crash before batch completion)
          });
        },
      };

      let row24Calls = 0;
      const countingRow24Client: batchSubpath.HeadlessLlmClient = {
        provider: "openai",
        model: "gpt-4o-mini",
        async generate() {
          row24Calls++;
          throw new Error("unrecognized error on row24Doc");
        },
      };

      // Start the crashing batch without awaiting its completion
      void batchSubpath.runHeadlessExtractionBatch(
        [
          makeInput(DOC_SHA_1, cache.port, cov.port, okClient),
          makeInput(DOC_SHA_2, cache.port, cov.port, countingRow24Client),
          makeInput(DOC_SHA_3, cache.port, cov.port, hangingClient),
        ],
        { concurrency: 1 },
      );

      await hangingStartedPromise;

      // okDoc's covered transition is already written; row24Doc's transition is held (NOT written)
      expect(cov.calls.put).toBe(1);
      expect(cov.getRecord("ville-exemple", DOC_SHA_1, bundle.digest)?.status).toBe("covered");
      expect(cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest)).toBeUndefined();
      expect(row24Calls).toBe(1);

      // Next run over the same stores: row24Doc alone re-runs, batch exits 0, failureCount is 1
      const replayBatch = await batchSubpath.runHeadlessExtractionBatch([
        makeInput(DOC_SHA_2, cache.port, cov.port, countingRow24Client),
      ]);
      expect(replayBatch.suggestedExitCode).toBe(0);
      expect(row24Calls).toBe(2);
      const replayedRec = cov.getRecord("ville-exemple", DOC_SHA_2, bundle.digest);
      expect(replayedRec?.failureCount).toBe(1);
      expect(replayedRec?.totalFailureCount).toBe(1);
    }

    // Root and subpath export parity check
    expect(typeof rootApi.adaptTextJsonClient).toBe("function");
    expect(typeof rootApi.extractDocumentBatch).toBe("function");
    expect(typeof rootApi.runHeadlessExtractionBatch).toBe("function");
    expect(rootApi.EXTRACTION_SCHEMA_V1).toBe("engram_extraction_v1");
  });
});
