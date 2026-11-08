import { describe, expect, it, vi } from "vitest";
import * as rootApi from "../src/index.js";
import * as batchApi from "../src/extraction-batch.js";
import { canonicalBytes, digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { JSON_PROJECTION_VERSION, toJsonValue } from "../src/json-value.js";
import type { ExtractionMergeConflict } from "../src/extract-git.js";
import type { Extraction, GraphNode } from "../src/types.js";
import {
  type CachedExtractionEntryV2,
  type CoverageKey,
  type CoverageRecordV1,
  type CoverageRegistryPort,
  EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
  EXTRACTION_KEY_SCHEMA_V1,
  EXTRACTION_SEMANTICS_VERSION,
  type ExtractionCachePort,
  type ExtractionIdentityInput,
  type ExtractionKey,
  type ExtractionReceiptV1,
  checkCoverageGate,
  computeExtractionKey,
  createCachedExtractionEntry,
  getOrExtract,
  lookupCachedExtraction,
  normalizeExtractionIdentity,
  transitionCoverageRecord,
} from "../src/extraction-cache.js";

const DOC_SHA_A = "a".repeat(64);
const DOC_SHA_B = "b".repeat(64);
const PROFILE_DIGEST_V1 = "1".repeat(64);
const PROFILE_DIGEST_V2 = "2".repeat(64);
const REG_DIGEST_1 = "c".repeat(64);
const REG_DIGEST_2 = "d".repeat(64);

function makeBaselineIdentity(overrides: Partial<ExtractionIdentityInput> = {}): ExtractionIdentityInput {
  return {
    docSha: DOC_SHA_A,
    profileDigest: PROFILE_DIGEST_V1,
    promptVersion: "prompt-envelope/v1",
    engramVersion: EXTRACTION_SEMANTICS_VERSION,
    modelPolicy: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0,
      maxOutputTokens: 4096,
      verifierModel: null,
    },
    chunking: {
      maxChunkChars: 20_000,
      splitter: "v1",
    },
    prompt: {
      registries: {
        reg_alpha: REG_DIGEST_1,
        reg_beta: "absent",
      },
      maxRegistrySamplesPerRegistry: 3,
    },
    ...overrides,
  };
}

function makeSampleExtraction(label = "Entity Alpha"): Extraction {
  return {
    nodes: [
      {
        id: "node-1",
        label,
        file_type: "document",
        source_file: "docs/sample.pdf",
        node_type: "Alpha",
        confidence: "EXTRACTED",
        citations: [
          {
            source_file: "docs/sample.pdf",
            docSha: DOC_SHA_A,
            page: 1,
            quoteSpan: [0, 12],
            excerpt: "sample quote",
          },
        ],
        citation_count: 1,
      },
    ],
    edges: [
      {
        source: "node-1",
        target: "node-1",
        relation: "links_to",
        confidence: "EXTRACTED",
        source_file: "docs/sample.pdf",
        confidence_score: 0.95,
      },
    ],
    input_tokens: 120,
    output_tokens: 45,
  };
}

function makeSampleConflict(resolved = '"val-a"'): ExtractionMergeConflict {
  return {
    kind: "node",
    id: "node-1",
    field: "properties.prop_a",
    values: ['"val-a"', '"val-b"'],
    resolved,
    sourceFiles: ["docs/sample.pdf"],
  };
}

function makeOkReceipt(
  extractionKey: ExtractionKey,
  identity: ExtractionIdentityInput = makeBaselineIdentity(),
  overrides: Partial<ExtractionReceiptV1> = {},
): ExtractionReceiptV1 {
  return {
    extractionKey,
    docSha: identity.docSha.trim().toLowerCase(),
    profileDigest: identity.profileDigest.trim().toLowerCase(),
    promptVersion: identity.promptVersion.trim().normalize("NFC"),
    engramVersion: (identity.engramVersion ?? EXTRACTION_SEMANTICS_VERSION).trim().normalize("NFC"),
    status: "ok",
    fromCache: false,
    attempts: 1,
    model: identity.modelPolicy.model,
    provider: identity.modelPolicy.provider,
    modelSource: "response",
    latencyMs: 42,
    tokensIn: 120,
    tokensOut: 45,
    retryable: false,
    diagnostics: [],
    ...overrides,
  };
}

function cloneForStore<T>(val: T): T {
  const proj = toJsonValue(val);
  if (proj.ok) {
    return proj.value as unknown as T;
  }
  return val;
}

function createInMemoryCachePort(options: { withRepair?: boolean } = {}): {
  port: ExtractionCachePort;
  map: Map<string, unknown>;
  calls: { get: number; putIfAbsent: number; replaceInvalid: number };
} {
  const map = new Map<string, unknown>();
  const calls = { get: 0, putIfAbsent: 0, replaceInvalid: 0 };

  const port: ExtractionCachePort = {
    get(key: ExtractionKey) {
      calls.get++;
      return map.get(key);
    },
    putIfAbsent(key: ExtractionKey, entry: CachedExtractionEntryV2) {
      calls.putIfAbsent++;
      if (map.has(key)) {
        return "exists";
      }
      map.set(key, cloneForStore(entry));
      return "stored";
    },
    ...(options.withRepair
      ? {
          replaceInvalid(key: ExtractionKey, entry: CachedExtractionEntryV2, observed: unknown) {
            calls.replaceInvalid++;
            if (!map.has(key) || map.get(key) !== observed) {
              return "exists";
            }
            map.set(key, cloneForStore(entry));
            return "stored";
          },
        }
      : {}),
  };

  return { port, map, calls };
}

describe("F-EN1: extraction cache, identity, and coverage registry", () => {
  it("F-EN1-T1: key determinism, sensitivity across all bound components, normalization invariances, and validation refusals", () => {
    const base = makeBaselineIdentity();
    const resBase = computeExtractionKey(base);
    expect(resBase.ok).toBe(true);
    if (!resBase.ok) return;

    expect(resBase.key).toMatch(/^[0-9a-f]{64}$/);
    expect(resBase.identity.schema).toBe(EXTRACTION_KEY_SCHEMA_V1);
    expect(resBase.identity.entrySchema).toBe(EXTRACTION_CACHE_ENTRY_SCHEMA_V2);
    expect(resBase.identity.projectionVersion).toBe(JSON_PROJECTION_VERSION);
    expect(resBase.identity.semanticsVersion).toBe(EXTRACTION_SEMANTICS_VERSION);
    expect(Object.isFrozen(resBase)).toBe(true);
    expect(Object.isFrozen(resBase.identity)).toBe(true);

    // Closed-form check against digestOfPreimage
    expect(resBase.key).toBe(digestOfPreimage(resBase.identity));

    // Permuting property order at every level yields the exact same key
    const permuted: ExtractionIdentityInput = {
      prompt: {
        maxRegistrySamplesPerRegistry: 3,
        registries: {
          reg_beta: "absent",
          reg_alpha: REG_DIGEST_1,
        },
      },
      chunking: {
        splitter: "v1",
        maxChunkChars: 20_000,
      },
      modelPolicy: {
        verifierModel: null,
        maxOutputTokens: 4096,
        temperature: 0,
        model: "gpt-4o-mini",
        provider: "openai",
      },
      engramVersion: EXTRACTION_SEMANTICS_VERSION,
      promptVersion: "prompt-envelope/v1",
      profileDigest: PROFILE_DIGEST_V1,
      docSha: DOC_SHA_A,
    };
    const resPermuted = computeExtractionKey(permuted);
    expect(resPermuted.ok).toBe(true);
    if (resPermuted.ok) {
      expect(resPermuted.key).toBe(resBase.key);
    }

    // Mutating each single bound component yields a distinct key
    const mutations: Array<{ name: string; input: ExtractionIdentityInput }> = [
      { name: "docSha", input: makeBaselineIdentity({ docSha: DOC_SHA_B }) },
      { name: "profileDigest", input: makeBaselineIdentity({ profileDigest: PROFILE_DIGEST_V2 }) },
      { name: "promptVersion", input: makeBaselineIdentity({ promptVersion: "prompt-envelope/v2" }) },
      { name: "engramVersion", input: makeBaselineIdentity({ engramVersion: "engram-extraction-semantics/2" }) },
      {
        name: "modelPolicy.provider",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, provider: "anthropic" },
        }),
      },
      {
        name: "modelPolicy.model",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, model: "gpt-4o" },
        }),
      },
      {
        name: "modelPolicy.temperature (value)",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, temperature: 0.2 },
        }),
      },
      {
        name: "modelPolicy.temperature (null)",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, temperature: null },
        }),
      },
      {
        name: "modelPolicy.maxOutputTokens (value)",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, maxOutputTokens: 8192 },
        }),
      },
      {
        name: "modelPolicy.maxOutputTokens (null)",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, maxOutputTokens: null },
        }),
      },
      {
        name: "modelPolicy.verifierModel",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, verifierModel: "gpt-4o-verifier" },
        }),
      },
      {
        name: "chunking.maxChunkChars",
        input: makeBaselineIdentity({
          chunking: { maxChunkChars: 10_000, splitter: "v1" },
        }),
      },
      {
        name: "prompt.registries.<id> (digest -> absent)",
        input: makeBaselineIdentity({
          prompt: {
            registries: { reg_alpha: "absent", reg_beta: "absent" },
            maxRegistrySamplesPerRegistry: 3,
          },
        }),
      },
      {
        name: "prompt.registries.<id> (digest -> different digest)",
        input: makeBaselineIdentity({
          prompt: {
            registries: { reg_alpha: REG_DIGEST_2, reg_beta: "absent" },
            maxRegistrySamplesPerRegistry: 3,
          },
        }),
      },
      {
        name: "prompt.registries.<id> (entry removed)",
        input: makeBaselineIdentity({
          prompt: {
            registries: { reg_alpha: REG_DIGEST_1 },
            maxRegistrySamplesPerRegistry: 3,
          },
        }),
      },
      {
        name: "prompt.maxRegistrySamplesPerRegistry (3 <-> 5)",
        input: makeBaselineIdentity({
          prompt: {
            registries: { reg_alpha: REG_DIGEST_1, reg_beta: "absent" },
            maxRegistrySamplesPerRegistry: 5,
          },
        }),
      },
    ];

    for (const m of mutations) {
      const res = computeExtractionKey(m.input);
      expect(res.ok, `mutation ${m.name} should succeed`).toBe(true);
      if (res.ok) {
        expect(res.key, `mutation ${m.name} should change key`).not.toBe(resBase.key);
      }
    }

    // Normalization invariances:
    // 1. Uppercase hex docSha, profileDigest, and registry digest yield same key as lowercase
    const resUpper = computeExtractionKey(
      makeBaselineIdentity({
        docSha: `  ${DOC_SHA_A.toUpperCase()}  `,
        profileDigest: ` ${PROFILE_DIGEST_V1.toUpperCase()} `,
        modelPolicy: { ...base.modelPolicy, provider: "  OpenAI  ", model: "  gpt-4o-mini  " },
        prompt: {
          registries: {
            reg_alpha: ` ${REG_DIGEST_1.toUpperCase()} `,
            reg_beta: "absent",
          },
          maxRegistrySamplesPerRegistry: 3,
        },
      }),
    );
    expect(resUpper.ok).toBe(true);
    if (resUpper.ok) {
      expect(resUpper.key).toBe(resBase.key);
      expect(resUpper.identity.docSha).toBe(DOC_SHA_A);
      expect(resUpper.identity.profileDigest).toBe(PROFILE_DIGEST_V1);
      expect(resUpper.identity.prompt.registries.reg_alpha).toBe(REG_DIGEST_1);
    }

    // 2. verifierModel: "  " and verifierModel: undefined and verifierModel: null yield the same key
    const resVerifierBlank = computeExtractionKey(
      makeBaselineIdentity({
        modelPolicy: { ...base.modelPolicy, verifierModel: "   " },
      }),
    );
    const resVerifierUndefined = computeExtractionKey(
      makeBaselineIdentity({
        modelPolicy: {
          provider: base.modelPolicy.provider,
          model: base.modelPolicy.model,
          temperature: base.modelPolicy.temperature,
          maxOutputTokens: base.modelPolicy.maxOutputTokens,
        },
      }),
    );
    expect(resVerifierBlank.ok).toBe(true);
    expect(resVerifierUndefined.ok).toBe(true);
    if (resVerifierBlank.ok && resVerifierUndefined.ok) {
      expect(resVerifierBlank.key).toBe(resBase.key);
      expect(resVerifierUndefined.key).toBe(resBase.key);
      expect(resVerifierBlank.identity.modelPolicy.verifierModel).toBeNull();
    }

    // 3. omitted prompt and prompt: { registries: {}, maxRegistrySamplesPerRegistry: 3 } yield the same key
    const noPromptInput = makeBaselineIdentity({ prompt: undefined });
    const explicitEmptyPromptInput = makeBaselineIdentity({
      prompt: { registries: {}, maxRegistrySamplesPerRegistry: 3 },
    });
    const resNoPrompt = computeExtractionKey(noPromptInput);
    const resExplicitEmptyPrompt = computeExtractionKey(explicitEmptyPromptInput);
    expect(resNoPrompt.ok).toBe(true);
    expect(resExplicitEmptyPrompt.ok).toBe(true);
    if (resNoPrompt.ok && resExplicitEmptyPrompt.ok) {
      expect(resNoPrompt.key).toBe(resExplicitEmptyPrompt.key);
    }

    // 4. omitted or blank engramVersion defaults to EXTRACTION_SEMANTICS_VERSION
    const resDefaultEngramVer = computeExtractionKey(makeBaselineIdentity({ engramVersion: undefined }));
    const resBlankEngramVer = computeExtractionKey(makeBaselineIdentity({ engramVersion: "   " }));
    expect(resDefaultEngramVer.ok).toBe(true);
    expect(resBlankEngramVer.ok).toBe(true);
    if (resDefaultEngramVer.ok && resBlankEngramVer.ok) {
      expect(resDefaultEngramVer.key).toBe(resBase.key);
      expect(resBlankEngramVer.key).toBe(resBase.key);
      expect(resDefaultEngramVer.identity.engramVersion).toBe(EXTRACTION_SEMANTICS_VERSION);
      expect(resBlankEngramVer.identity.engramVersion).toBe(EXTRACTION_SEMANTICS_VERSION);
    }

    // 5. temperature -0 normalizes to 0 and quantizes to 6 decimals (0.2000004 === 0.2)
    const resNegZero = computeExtractionKey(
      makeBaselineIdentity({
        modelPolicy: { ...base.modelPolicy, temperature: -0 },
      }),
    );
    expect(resNegZero.ok).toBe(true);
    if (resNegZero.ok) {
      expect(resNegZero.key).toBe(resBase.key);
      expect(Object.is(resNegZero.identity.modelPolicy.temperature, 0)).toBe(true);
    }

    const resTemp02 = computeExtractionKey(
      makeBaselineIdentity({
        modelPolicy: { ...base.modelPolicy, temperature: 0.2 },
      }),
    );
    const resTempQuantized = computeExtractionKey(
      makeBaselineIdentity({
        modelPolicy: { ...base.modelPolicy, temperature: 0.2000004 },
      }),
    );
    expect(resTemp02.ok).toBe(true);
    expect(resTempQuantized.ok).toBe(true);
    if (resTemp02.ok && resTempQuantized.ok) {
      expect(resTempQuantized.key).toBe(resTemp02.key);
      expect(resTempQuantized.identity.modelPolicy.temperature).toBe(0.2);
    }

    // Validation refusals (no throw, issue at expected path)
    const invalidCases: Array<{ label: string; input: ExtractionIdentityInput; expectedPath: string }> = [
      {
        label: "temperature: NaN",
        input: makeBaselineIdentity({ modelPolicy: { ...base.modelPolicy, temperature: Number.NaN } }),
        expectedPath: "modelPolicy.temperature",
      },
      {
        label: "temperature: Infinity",
        input: makeBaselineIdentity({ modelPolicy: { ...base.modelPolicy, temperature: Number.POSITIVE_INFINITY } }),
        expectedPath: "modelPolicy.temperature",
      },
      {
        label: "maxOutputTokens: 0",
        input: makeBaselineIdentity({ modelPolicy: { ...base.modelPolicy, maxOutputTokens: 0 } }),
        expectedPath: "modelPolicy.maxOutputTokens",
      },
      {
        label: "maxOutputTokens: 1.5",
        input: makeBaselineIdentity({ modelPolicy: { ...base.modelPolicy, maxOutputTokens: 1.5 } }),
        expectedPath: "modelPolicy.maxOutputTokens",
      },
      {
        label: "chunking.splitter: v2",
        input: makeBaselineIdentity({
          chunking: { maxChunkChars: 20_000, splitter: "v2" as unknown as "v1" },
        }),
        expectedPath: "chunking.splitter",
      },
      {
        label: "chunking.maxChunkChars: 0",
        input: makeBaselineIdentity({
          chunking: { maxChunkChars: 0, splitter: "v1" },
        }),
        expectedPath: "chunking.maxChunkChars",
      },
      {
        label: "63-char docSha",
        input: makeBaselineIdentity({ docSha: "a".repeat(63) }),
        expectedPath: "docSha",
      },
      {
        label: "non-hex profileDigest",
        input: makeBaselineIdentity({ profileDigest: "g".repeat(64) }),
        expectedPath: "profileDigest",
      },
      {
        label: "empty promptVersion",
        input: makeBaselineIdentity({ promptVersion: "   " }),
        expectedPath: "promptVersion",
      },
      {
        label: "non-string verifierModel",
        input: makeBaselineIdentity({
          modelPolicy: { ...base.modelPolicy, verifierModel: 42 as unknown as string },
        }),
        expectedPath: "modelPolicy.verifierModel",
      },
      {
        label: "non-digest prompt.registries value",
        input: makeBaselineIdentity({
          prompt: { registries: { reg_alpha: "not-a-digest" }, maxRegistrySamplesPerRegistry: 3 },
        }),
        expectedPath: "prompt.registries.reg_alpha",
      },
      {
        label: "empty-after-trim registry id",
        input: makeBaselineIdentity({
          prompt: { registries: { "   ": "absent" }, maxRegistrySamplesPerRegistry: 3 },
        }),
        expectedPath: "prompt.registries",
      },
      {
        label: "prompt.maxRegistrySamplesPerRegistry: -1",
        input: makeBaselineIdentity({
          prompt: { registries: {}, maxRegistrySamplesPerRegistry: -1 },
        }),
        expectedPath: "prompt.maxRegistrySamplesPerRegistry",
      },
    ];

    for (const c of invalidCases) {
      const normRes = normalizeExtractionIdentity(c.input);
      expect(normRes.ok, `${c.label} should fail normalizeExtractionIdentity`).toBe(false);
      if (!normRes.ok) {
        expect(normRes.issues.some((i) => i.path === c.expectedPath), `${c.label} path`).toBe(true);
        expect(Object.isFrozen(normRes)).toBe(true);
        expect(Object.isFrozen(normRes.issues)).toBe(true);
      }
      const keyRes = computeExtractionKey(c.input);
      expect(keyRes.ok, `${c.label} should fail computeExtractionKey`).toBe(false);
      if (!keyRes.ok) {
        expect(keyRes.issues.some((i) => i.path === c.expectedPath)).toBe(true);
      }
    }

    // Deterministic issue collection order across all fields
    const allInvalid = normalizeExtractionIdentity({
      docSha: "bad",
      profileDigest: "bad",
      promptVersion: "",
      engramVersion: 123 as unknown as string,
      modelPolicy: {
        provider: "",
        model: "",
        temperature: Number.NaN,
        maxOutputTokens: 0,
        verifierModel: 99 as unknown as string,
      },
      chunking: {
        maxChunkChars: -5,
        splitter: "v2" as unknown as "v1",
      },
      prompt: {
        registries: { reg_bad: "invalid-digest" },
        maxRegistrySamplesPerRegistry: -1,
      },
    });
    expect(allInvalid.ok).toBe(false);
    if (!allInvalid.ok) {
      expect(allInvalid.issues.map((i) => i.path)).toEqual([
        "docSha",
        "profileDigest",
        "promptVersion",
        "engramVersion",
        "modelPolicy.provider",
        "modelPolicy.model",
        "modelPolicy.temperature",
        "modelPolicy.maxOutputTokens",
        "modelPolicy.verifierModel",
        "chunking.maxChunkChars",
        "chunking.splitter",
        "prompt.registries.reg_bad",
        "prompt.maxRegistrySamplesPerRegistry",
      ]);
    }
  });

  it("F-EN1-T2: re-run with identical inputs makes zero produce calls via getOrExtract and replays mergeConflicts", async () => {
    const { port, map } = createInMemoryCachePort();
    const identity = makeBaselineIdentity();
    const extraction = makeSampleExtraction();
    const conflicts: readonly ExtractionMergeConflict[] = [makeSampleConflict()];

    const produceSpy = vi.fn(async (key: ExtractionKey) => ({
      extraction: makeSampleExtraction(),
      mergeConflicts: conflicts,
      receipt: makeOkReceipt(key, identity, {
        attempts: 2,
        tokensIn: 300,
        tokensOut: 90,
        latencyMs: 55,
      }),
    }));

    // Run 1: cache miss -> calls produce once, stores entry
    const run1 = await getOrExtract({
      identity,
      cache: port,
      nowIso: "2026-11-07T12:00:00.000Z",
      nowMs: 1000,
      endMs: () => 1055,
      produce: produceSpy,
    });

    expect(produceSpy).toHaveBeenCalledTimes(1);
    expect(run1.status).toBe("ok");
    if (run1.status !== "ok") return;
    expect(run1.cacheWrite).toBe("stored");
    expect(run1.receipt.fromCache).toBe(false);
    expect(run1.receipt.attempts).toBe(2);
    expect(run1.receipt.tokensIn).toBe(300);
    expect(run1.receipt.tokensOut).toBe(90);
    expect(run1.extraction).toEqual(extraction);
    expect(run1.mergeConflicts).toEqual(conflicts);
    expect(Object.isFrozen(run1)).toBe(true);
    expect(Object.isFrozen(run1.receipt)).toBe(true);
    expect(Object.isFrozen(run1.mergeConflicts)).toBe(true);
    expect(Object.isFrozen(run1.extraction)).toBe(false);

    // Run 2: identical identity and cache -> 0 new produce calls, replays extraction and mergeConflicts
    const run2 = await getOrExtract({
      identity,
      cache: port,
      nowIso: "2026-11-07T12:01:00.000Z",
      nowMs: 2000,
      endMs: () => 2005,
      produce: produceSpy,
    });

    expect(produceSpy).toHaveBeenCalledTimes(1);
    expect(run2.status).toBe("ok");
    if (run2.status !== "ok") return;
    expect(run2.cacheWrite).toBe("hit");
    expect(run2.receipt.fromCache).toBe(true);
    expect(run2.receipt.attempts).toBe(0);
    expect(run2.receipt.tokensIn).toBeNull();
    expect(run2.receipt.tokensOut).toBeNull();
    expect(run2.receipt.latencyMs).toBe(5);
    expect(run2.receipt.model).toBe(identity.modelPolicy.model);
    expect(run2.receipt.provider).toBe(identity.modelPolicy.provider);
    expect(run2.receipt.modelSource).toBe("response");
    expect(run2.receipt.diagnostics).toContain("cache_hit");
    expect(run2.extraction).toEqual(run1.extraction);
    expect(run2.mergeConflicts).toEqual(run1.mergeConflicts);
    expect(run2.mergeConflicts).toHaveLength(1);
    expect(Object.isFrozen(run2.extraction)).toBe(false);

    // Tamper variant: mutate the stored mergeConflicts in the backing map -> run 3 is miss/digest_mismatch
    const keyRes = computeExtractionKey(identity);
    expect(keyRes.ok).toBe(true);
    if (!keyRes.ok) return;
    const stored = map.get(keyRes.key) as CachedExtractionEntryV2;
    map.set(keyRes.key, {
      ...stored,
      mergeConflicts: [makeSampleConflict('"tampered-val"')],
    });

    const lookup3 = await lookupCachedExtraction(port, identity);
    expect(lookup3.status).toBe("miss");
    if (lookup3.status === "miss") {
      expect(lookup3.reason).toBe("digest_mismatch");
    }

    const run3 = await getOrExtract({
      identity,
      cache: port,
      nowIso: "2026-11-07T12:02:00.000Z",
      nowMs: 3000,
      endMs: () => 3020,
      produce: produceSpy,
    });
    expect(produceSpy).toHaveBeenCalledTimes(2);
    expect(run3.status).toBe("ok");
    if (run3.status === "ok") {
      expect(run3.receipt.fromCache).toBe(false);
    }
  });

  it("F-EN1-T3: bumping profileDigest invalidates only affected entries while unaffected entries stay cached", async () => {
    const { port } = createInMemoryCachePort();
    const idAv1 = makeBaselineIdentity({ docSha: DOC_SHA_A, profileDigest: PROFILE_DIGEST_V1 });
    const idBv2 = makeBaselineIdentity({ docSha: DOC_SHA_B, profileDigest: PROFILE_DIGEST_V2 });
    const idAv2 = makeBaselineIdentity({ docSha: DOC_SHA_A, profileDigest: PROFILE_DIGEST_V2 });

    const produceSpy = vi.fn(async (key: ExtractionKey) => ({
      extraction: makeSampleExtraction(`extracted-${key.slice(0, 8)}`),
      mergeConflicts: [],
      receipt: makeOkReceipt(key, idAv1),
    }));

    // Populate doc A under v1 and doc B under v2 (2 produce calls)
    const resAv1 = await getOrExtract({
      identity: idAv1,
      cache: port,
      nowIso: "2026-11-07T12:00:00.000Z",
      nowMs: 100,
      endMs: () => 110,
      produce: (key) =>
        produceSpy(key).then((r) => ({ ...r, receipt: makeOkReceipt(key, idAv1) })),
    });
    const resBv2 = await getOrExtract({
      identity: idBv2,
      cache: port,
      nowIso: "2026-11-07T12:00:01.000Z",
      nowMs: 200,
      endMs: () => 210,
      produce: (key) =>
        produceSpy(key).then((r) => ({ ...r, receipt: makeOkReceipt(key, idBv2) })),
    });
    expect(resAv1.status).toBe("ok");
    expect(resBv2.status).toBe("ok");
    expect(produceSpy).toHaveBeenCalledTimes(2);

    // Query doc A under v2 -> miss + 1 new produce call
    const resAv2 = await getOrExtract({
      identity: idAv2,
      cache: port,
      nowIso: "2026-11-07T12:00:02.000Z",
      nowMs: 300,
      endMs: () => 310,
      produce: (key) =>
        produceSpy(key).then((r) => ({ ...r, receipt: makeOkReceipt(key, idAv2) })),
    });
    expect(resAv2.status).toBe("ok");
    if (resAv2.status === "ok") {
      expect(resAv2.cacheWrite).toBe("stored");
      expect(resAv2.receipt.fromCache).toBe(false);
    }
    expect(produceSpy).toHaveBeenCalledTimes(3);

    // Query doc B under v2 -> hit, 0 new calls
    const resBv2Hit = await getOrExtract({
      identity: idBv2,
      cache: port,
      nowIso: "2026-11-07T12:00:03.000Z",
      nowMs: 400,
      endMs: () => 402,
      produce: produceSpy,
    });
    expect(resBv2Hit.status).toBe("ok");
    if (resBv2Hit.status === "ok") {
      expect(resBv2Hit.cacheWrite).toBe("hit");
      expect(resBv2Hit.receipt.fromCache).toBe(true);
    }
    expect(produceSpy).toHaveBeenCalledTimes(3);

    // Query doc A under v1 -> still hit, entries coexist
    const resAv1Hit = await getOrExtract({
      identity: idAv1,
      cache: port,
      nowIso: "2026-11-07T12:00:04.000Z",
      nowMs: 500,
      endMs: () => 502,
      produce: produceSpy,
    });
    expect(resAv1Hit.status).toBe("ok");
    if (resAv1Hit.status === "ok") {
      expect(resAv1Hit.cacheWrite).toBe("hit");
      expect(resAv1Hit.receipt.fromCache).toBe(true);
      if (resAv1.status === "ok") {
        expect(resAv1Hit.extraction).toEqual(resAv1.extraction);
      }
    }
    expect(produceSpy).toHaveBeenCalledTimes(3);
  });

  it("F-EN1-T4: corrupt entries, port failures, repair, pass-through refusals, vanished-value re-reads, decode rule, and re-read failures", async () => {
    const identity = makeBaselineIdentity();
    const keyRes = computeExtractionKey(identity);
    expect(keyRes.ok).toBe(true);
    if (!keyRes.ok) return;
    const key = keyRes.key;

    const validEntryRes = createCachedExtractionEntry({
      identity,
      extraction: makeSampleExtraction(),
      mergeConflicts: [makeSampleConflict()],
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(validEntryRes.ok).toBe(true);
    if (!validEntryRes.ok) return;
    const baseEntry = validEntryRes.entry;

    // (i) Tamper entry.extraction.nodes in the backing map -> miss/digest_mismatch, no throw
    {
      const { port, map } = createInMemoryCachePort();
      const tampered = cloneForStore(baseEntry);
      (tampered.extraction.nodes as GraphNode[]).push({
        id: "node-tampered",
        label: "Tampered",
        file_type: "document",
        source_file: "docs/sample.pdf",
      });
      map.set(key, tampered);
      const lookup = await lookupCachedExtraction(port, identity);
      expect(lookup.status).toBe("miss");
      if (lookup.status === "miss") {
        expect(lookup.reason).toBe("digest_mismatch");
        expect(lookup.observed).toBe(tampered);
      }
    }

    // (ii) Replace entry.identity.promptVersion -> miss/identity_mismatch
    {
      const { port, map } = createInMemoryCachePort();
      const tampered = cloneForStore(baseEntry);
      (tampered.identity as { promptVersion: string }).promptVersion = "prompt-envelope/other";
      map.set(key, tampered);
      const lookup = await lookupCachedExtraction(port, identity);
      expect(lookup.status).toBe("miss");
      if (lookup.status === "miss") {
        expect(lookup.reason).toBe("identity_mismatch");
        expect(lookup.observed).toBe(tampered);
      }
    }

    // (iii) Store "not an entry" -> miss/invalid_entry
    {
      const { port, map } = createInMemoryCachePort();
      map.set(key, "not an entry");
      const lookup = await lookupCachedExtraction(port, identity);
      expect(lookup.status).toBe("miss");
      if (lookup.status === "miss") {
        expect(lookup.reason).toBe("invalid_entry");
        expect(lookup.observed).toBe("not an entry");
      }
    }

    // (iv) Store an extraction containing confidence_score: NaN with fabricated digest -> miss/invalid_entry
    {
      const { port, map } = createInMemoryCachePort();
      const nanEntry = cloneForStore(baseEntry);
      (nanEntry.extraction.edges[0] as { confidence_score?: number }).confidence_score = Number.NaN;
      (nanEntry as { payloadDigest: string }).payloadDigest = "f".repeat(64);
      map.set(key, nanEntry);
      const lookup = await lookupCachedExtraction(port, identity);
      expect(lookup.status).toBe("miss");
      if (lookup.status === "miss") {
        expect(lookup.reason).toBe("invalid_entry");
        expect(lookup.diagnostic).toContain("confidence_score");
        expect(lookup.observed).toBe(nanEntry);
      }
    }

    // (v) get throws -> cache_unavailable, and getOrExtract does not call produce
    {
      const throwingPort: ExtractionCachePort = {
        get() {
          throw new Error("S3 read timeout");
        },
        putIfAbsent() {
          return "stored";
        },
      };
      const lookup = await lookupCachedExtraction(throwingPort, identity);
      expect(lookup.status).toBe("cache_unavailable");
      if (lookup.status === "cache_unavailable") {
        expect(lookup.extractionKey).toBe(key);
        expect(lookup.diagnostic).toContain("S3 read timeout");
      }

      const produceSpy = vi.fn();
      const res = await getOrExtract({
        identity,
        cache: throwingPort,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 115,
        produce: produceSpy,
      });
      expect(produceSpy).not.toHaveBeenCalled();
      expect(res.status).toBe("refused");
      if (res.status === "refused") {
        expect(res.refusalCode).toBe("cache_unavailable");
        expect(res.cacheWrite).toBe("not_attempted");
        expect(res.receipt.retryable).toBe(true);
        expect(res.receipt.attempts).toBe(0);
      }
    }

    // (vi) putIfAbsent throws after produce -> status: "ok", cacheWrite: "write_failed"
    {
      const writeFailPort: ExtractionCachePort = {
        get() {
          return undefined;
        },
        putIfAbsent() {
          throw new Error("S3 PutObject failed");
        },
      };
      const res = await getOrExtract({
        identity,
        cache: writeFailPort,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 120,
        produce: async (k) => ({
          extraction: makeSampleExtraction(),
          mergeConflicts: [makeSampleConflict()],
          receipt: makeOkReceipt(k, identity),
        }),
      });
      expect(res.status).toBe("ok");
      if (res.status === "ok") {
        expect(res.cacheWrite).toBe("write_failed");
        expect(res.receipt.diagnostics).toContain("cache_write_failed");
      }
    }

    // (vii) Corrupt entry, two runs, port WITH replaceInvalid: run 1 -> repaired, run 2 -> hit (0 produce calls)
    {
      const { port, map } = createInMemoryCachePort({ withRepair: true });
      map.set(key, { corrupted: true });
      const produceSpy = vi.fn(async (k: ExtractionKey) => ({
        extraction: makeSampleExtraction("Repaired Entity"),
        mergeConflicts: [makeSampleConflict()],
        receipt: makeOkReceipt(k, identity),
      }));

      const run1 = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 120,
        produce: produceSpy,
      });
      expect(produceSpy).toHaveBeenCalledTimes(1);
      expect(run1.status).toBe("ok");
      if (run1.status === "ok") {
        expect(run1.cacheWrite).toBe("repaired");
      }

      const run2 = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:01:00.000Z",
        nowMs: 200,
        endMs: () => 205,
        produce: produceSpy,
      });
      expect(produceSpy).toHaveBeenCalledTimes(1);
      expect(run2.status).toBe("ok");
      if (run2.status === "ok" && run1.status === "ok") {
        expect(run2.cacheWrite).toBe("hit");
        expect(run2.extraction).toEqual(run1.extraction);
        const storedEntry = map.get(key) as CachedExtractionEntryV2;
        expect(run2.extraction).not.toBe(storedEntry.extraction);
        // Mutating the returned extraction leaves the stored entry unchanged
        run2.extraction.nodes.push({
          id: "mutated-after-return",
          label: "Mutated",
          file_type: "document",
          source_file: "docs/sample.pdf",
        });
        expect(storedEntry.extraction.nodes).toHaveLength(1);
      }
    }

    // (viii) Corrupt entry, two runs, port WITHOUT replaceInvalid: both runs produce, write_failed + cache_entry_unrepairable
    {
      const { port, map } = createInMemoryCachePort({ withRepair: false });
      map.set(key, { corrupted: true });
      const produceSpy = vi.fn(async (k: ExtractionKey) => ({
        extraction: makeSampleExtraction("Unrepaired"),
        mergeConflicts: [],
        receipt: makeOkReceipt(k, identity),
      }));

      const run1 = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 120,
        produce: produceSpy,
      });
      const run2 = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:01:00.000Z",
        nowMs: 200,
        endMs: () => 220,
        produce: produceSpy,
      });
      expect(produceSpy).toHaveBeenCalledTimes(2);
      for (const r of [run1, run2]) {
        expect(r.status).toBe("ok");
        if (r.status === "ok") {
          expect(r.cacheWrite).toBe("write_failed");
          expect(r.receipt.diagnostics).toContain("cache_write_failed");
          expect(r.receipt.diagnostics).toContain("cache_entry_unrepairable");
        }
      }
    }

    // (ix) produce returns { refused } with deadline_exceeded -> passed through unchanged, nothing stored; wrong key -> invalid_extraction_payload
    {
      const { port, map } = createInMemoryCachePort();
      const refusedReceipt: ExtractionReceiptV1 = {
        ...makeOkReceipt(key, identity),
        status: "timeout",
        retryable: true,
        refusalCode: "deadline_exceeded",
        refusalReason: "timed out after 5000ms",
        diagnostics: ["chunk_timeout"],
      };
      const res = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 5100,
        produce: async () => ({ refused: refusedReceipt }),
      });
      expect(res.status).toBe("refused");
      if (res.status === "refused") {
        expect(res.refusalCode).toBe("deadline_exceeded");
        expect(res.cacheWrite).toBe("not_attempted");
        expect(res.receipt).toEqual(refusedReceipt);
      }
      expect(map.size).toBe(0);

      // Refused receipt with wrong key -> invalid_extraction_payload
      const wrongKeyRes = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 120,
        produce: async () => ({
          refused: {
            ...refusedReceipt,
            extractionKey: "0".repeat(64),
          },
        }),
      });
      expect(wrongKeyRes.status).toBe("refused");
      if (wrongKeyRes.status === "refused") {
        expect(wrongKeyRes.refusalCode).toBe("invalid_extraction_payload");
        expect(wrongKeyRes.receipt.retryable).toBe(false);
      }
    }

    // (x) produce throws -> synthesized non-retryable upstream_error refusal with produce_threw
    {
      const { port } = createInMemoryCachePort();
      const res = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 125,
        produce: async () => {
          throw new Error("unexpected producer crash");
        },
      });
      expect(res.status).toBe("refused");
      if (res.status === "refused") {
        expect(res.refusalCode).toBe("upstream_error");
        expect(res.cacheWrite).toBe("not_attempted");
        expect(res.receipt.retryable).toBe(false);
        expect(res.receipt.attempts).toBe(0);
        expect(res.receipt.refusalReason).toContain("unexpected producer crash");
        expect(res.receipt.diagnostics).toContain("produce_threw");
      }
    }

    // (xi) Stored entry with malformed receipt (receipt.model: 42, or entry.extractionKey != key, or mergeConflicts not an array) -> miss/invalid_entry
    {
      const { port, map } = createInMemoryCachePort();

      const badModel = cloneForStore(baseEntry);
      (badModel.receipt as unknown as { model: unknown }).model = 42;
      map.set(key, badModel);
      const l1 = await lookupCachedExtraction(port, identity);
      expect(l1.status).toBe("miss");
      if (l1.status === "miss") expect(l1.reason).toBe("invalid_entry");

      const badKey = cloneForStore(baseEntry);
      (badKey as { extractionKey: string }).extractionKey = "0".repeat(64);
      map.set(key, badKey);
      const l2 = await lookupCachedExtraction(port, identity);
      expect(l2.status).toBe("miss");
      if (l2.status === "miss") expect(l2.reason).toBe("invalid_entry");

      const badConflicts = cloneForStore(baseEntry);
      (badConflicts as unknown as { mergeConflicts: unknown }).mergeConflicts = "not-an-array";
      map.set(key, badConflicts);
      const l3 = await lookupCachedExtraction(port, identity);
      expect(l3.status).toBe("miss");
      if (l3.status === "miss") expect(l3.reason).toBe("invalid_entry");
    }

    // (xii) Vanished-value re-read on both putIfAbsent "exists" and replaceInvalid "exists" paths
    {
      // Path A: putIfAbsent returns "exists" once while backing map is empty, then stores on the single retry
      const map = new Map<string, unknown>();
      let putCount = 0;
      const vanishedPutPort: ExtractionCachePort = {
        get(k) {
          return map.get(k);
        },
        putIfAbsent(k, entry) {
          putCount++;
          if (putCount === 1) {
            map.delete(k);
            return "exists";
          }
          map.set(k, cloneForStore(entry));
          return "stored";
        },
      };
      const resA = await getOrExtract({
        identity,
        cache: vanishedPutPort,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 110,
        produce: async (k) => ({
          extraction: makeSampleExtraction("Vanished Put Retry"),
          mergeConflicts: [],
          receipt: makeOkReceipt(k, identity),
        }),
      });
      expect(putCount).toBe(2);
      expect(resA.status).toBe("ok");
      if (resA.status === "ok") {
        expect(resA.cacheWrite).toBe("stored");
      }

      // Path B: replaceInvalid returns "exists" because the corrupt entry was deleted in the meantime -> re-read not_found -> 1 putIfAbsent stores
      const mapB = new Map<string, unknown>([[key, "corrupt-value"]]);
      let replaceCountB = 0;
      let putCountB = 0;
      const vanishedRepairPort: ExtractionCachePort = {
        get(k) {
          return mapB.get(k);
        },
        putIfAbsent(k, entry) {
          putCountB++;
          mapB.set(k, cloneForStore(entry));
          return "stored";
        },
        replaceInvalid(k) {
          replaceCountB++;
          mapB.delete(k);
          return "exists";
        },
      };
      const resB = await getOrExtract({
        identity,
        cache: vanishedRepairPort,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 110,
        produce: async (k) => ({
          extraction: makeSampleExtraction("Vanished Repair Retry"),
          mergeConflicts: [],
          receipt: makeOkReceipt(k, identity),
        }),
      });
      expect(replaceCountB).toBe(1);
      expect(putCountB).toBe(1);
      expect(resB.status).toBe("ok");
      if (resB.status === "ok") {
        expect(resB.cacheWrite).toBe("stored");
      }
    }

    // (xiii) Undecodable payload (decode rule): get returns raw non-JSON string -> miss/invalid_entry with observed, repaired via replaceInvalid
    {
      const { port, map } = createInMemoryCachePort({ withRepair: true });
      const rawTruncated = '{"schema":"engram.extraction-cache-entry/v2","truncated';
      map.set(key, rawTruncated);

      const lookup = await lookupCachedExtraction(port, identity);
      expect(lookup.status).toBe("miss");
      if (lookup.status === "miss") {
        expect(lookup.reason).toBe("invalid_entry");
        expect(lookup.observed).toBe(rawTruncated);
      }

      const produceSpy = vi.fn(async (k: ExtractionKey) => ({
        extraction: makeSampleExtraction("Recovered From Truncated"),
        mergeConflicts: [],
        receipt: makeOkReceipt(k, identity),
      }));
      const run1 = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 120,
        produce: produceSpy,
      });
      expect(run1.status).toBe("ok");
      if (run1.status === "ok") {
        expect(run1.cacheWrite).toBe("repaired");
      }
      const run2 = await getOrExtract({
        identity,
        cache: port,
        nowIso: "2026-11-07T12:01:00.000Z",
        nowMs: 200,
        endMs: () => 205,
        produce: produceSpy,
      });
      expect(produceSpy).toHaveBeenCalledTimes(1);
      expect(run2.status).toBe("ok");
      if (run2.status === "ok") {
        expect(run2.cacheWrite).toBe("hit");
      }
    }

    // (xiv) Re-read failure: putIfAbsent answers "exists" and the re-read get then throws -> write_failed + cache_write_failed + cache_reread_failed, no further write
    {
      let getCount = 0;
      let putCount = 0;
      let replaceCount = 0;
      const rereadFailPort: ExtractionCachePort = {
        get() {
          getCount++;
          if (getCount === 1) return undefined;
          throw new Error("S3 connection reset during re-read");
        },
        putIfAbsent() {
          putCount++;
          return "exists";
        },
        replaceInvalid() {
          replaceCount++;
          return "stored";
        },
      };
      const expectedConflicts = [makeSampleConflict()];
      const res = await getOrExtract({
        identity,
        cache: rereadFailPort,
        nowIso: "2026-11-07T12:00:00.000Z",
        nowMs: 100,
        endMs: () => 120,
        produce: async (k) => ({
          extraction: makeSampleExtraction("Produced Before Reread Fail"),
          mergeConflicts: expectedConflicts,
          receipt: makeOkReceipt(k, identity),
        }),
      });
      expect(res.status).toBe("ok");
      if (res.status === "ok") {
        expect(res.cacheWrite).toBe("write_failed");
        expect(res.extraction.nodes[0]?.label).toBe("Produced Before Reread Fail");
        expect(res.mergeConflicts).toEqual(expectedConflicts);
        expect(res.receipt.diagnostics).toContain("cache_write_failed");
        expect(res.receipt.diagnostics).toContain("cache_reread_failed");
      }
      expect(putCount).toBe(1);
      expect(replaceCount).toBe(0);
    }
  });

  it("F-EN1-T5: write-once under concurrent interleaving returns first writer payload/conflicts and loser receipt counters with cache_write_lost_race", async () => {
    const { port, map } = createInMemoryCachePort();
    const identity = makeBaselineIdentity();

    let releaseWriter1!: () => void;
    let releaseWriter2!: () => void;
    const writer1Gate = new Promise<void>((resolve) => {
      releaseWriter1 = resolve;
    });
    const writer2Gate = new Promise<void>((resolve) => {
      releaseWriter2 = resolve;
    });

    let missesCompleted = 0;
    let bothMissedResolve!: () => void;
    const bothMissed = new Promise<void>((resolve) => {
      bothMissedResolve = resolve;
    });

    const origGet = port.get.bind(port);
    port.get = (k: ExtractionKey) => {
      const res = origGet(k);
      missesCompleted++;
      if (missesCompleted === 2) {
        bothMissedResolve();
      }
      return res;
    };

    const extraction1 = makeSampleExtraction("First Writer Entity");
    const conflicts1: readonly ExtractionMergeConflict[] = [makeSampleConflict('"first-val"')];

    const extraction2 = makeSampleExtraction("Second Writer Entity");
    const conflicts2: readonly ExtractionMergeConflict[] = [makeSampleConflict('"second-val"')];

    const p1 = getOrExtract({
      identity,
      cache: port,
      nowIso: "2026-11-07T12:00:00.000Z",
      nowMs: 1000,
      endMs: () => 1040,
      produce: async (k) => {
        await writer1Gate;
        return {
          extraction: extraction1,
          mergeConflicts: conflicts1,
          receipt: makeOkReceipt(k, identity, {
            attempts: 1,
            tokensIn: 111,
            tokensOut: 22,
            latencyMs: 40,
            model: "gpt-4o-mini-2026-01",
            provider: "openai",
            modelSource: "response",
          }),
        };
      },
    });

    const p2 = getOrExtract({
      identity,
      cache: port,
      nowIso: "2026-11-07T12:00:00.000Z",
      nowMs: 1000,
      endMs: () => 1095,
      produce: async (k) => {
        await writer2Gate;
        return {
          extraction: extraction2,
          mergeConflicts: conflicts2,
          receipt: makeOkReceipt(k, identity, {
            attempts: 3,
            tokensIn: 333,
            tokensOut: 77,
            latencyMs: 95,
            model: "gpt-4o-mini-fallback",
            provider: "openai-routed",
            modelSource: "client",
          }),
        };
      },
    });

    // Wait until both calls have missed the initial lookup
    await bothMissed;

    // Let writer 1 finish first and write to cache, then let writer 2 finish and hit "exists"
    releaseWriter1();
    const res1 = await p1;
    releaseWriter2();
    const res2 = await p2;

    expect(map.size).toBe(1);
    expect(res1.status).toBe("ok");
    expect(res2.status).toBe("ok");
    if (res1.status !== "ok" || res2.status !== "ok") return;

    expect(res1.cacheWrite).toBe("stored");
    expect(res2.cacheWrite).toBe("exists");

    // Both results deep-equal the first writer's extraction and mergeConflicts
    expect(res1.extraction).toEqual(extraction1);
    expect(res2.extraction).toEqual(extraction1);
    expect(res1.mergeConflicts).toEqual(conflicts1);
    expect(res2.mergeConflicts).toEqual(conflicts1);

    // Losing writer's receipt carries loser's counters, fromCache: false, stored model fields, and cache_write_lost_race
    expect(res2.receipt.fromCache).toBe(false);
    expect(res2.receipt.attempts).toBe(3);
    expect(res2.receipt.tokensIn).toBe(333);
    expect(res2.receipt.tokensOut).toBe(77);
    expect(res2.receipt.latencyMs).toBe(95);
    expect(res2.receipt.model).toBe("gpt-4o-mini-2026-01");
    expect(res2.receipt.provider).toBe("openai");
    expect(res2.receipt.modelSource).toBe("response");
    expect(res2.receipt.diagnostics).toContain("cache_write_lost_race");
  });

  it("F-EN1-T6: coverage transitions, retryable/non-retryable bounds, absorbing abandoned, too-large posture, reset, invalid-record repair, decode rule, and unknown schema", async () => {
    const key: CoverageKey = {
      city: "ville-exemple",
      docSha: DOC_SHA_A,
      profileDigest: PROFILE_DIGEST_V1,
    };
    const extKey1 = "e".repeat(64);
    const extKey2 = "f".repeat(64);

    // 1. Non-retryable + retryable interleaving up to maxFailures: 3
    let rec = transitionCoverageRecord({
      current: null,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "invalid_json_output",
        retryable: false,
        reason: "bad json 1",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T12:00:00.000Z",
    });
    expect(rec.schema).toBe("engram.coverage-record/v1");
    expect(rec.status).toBe("pending");
    expect(rec.failureCount).toBe(1);
    expect(rec.retryableFailureCount).toBe(0);
    expect(rec.totalFailureCount).toBe(1);
    expect(Object.isFrozen(rec)).toBe(true);

    // Retryable failure (rate_limited) -> still pending, failureCount: 1, retryableFailureCount: 1
    rec = transitionCoverageRecord({
      current: rec,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "rate_limited",
        retryable: true,
        reason: "429",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T12:01:00.000Z",
    });
    expect(rec.status).toBe("pending");
    expect(rec.failureCount).toBe(1);
    expect(rec.retryableFailureCount).toBe(1);
    expect(rec.totalFailureCount).toBe(2);

    // Two more non-retryable failures -> abandoned at failureCount: 3
    rec = transitionCoverageRecord({
      current: rec,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "invalid_json_output",
        retryable: false,
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T12:02:00.000Z",
    });
    expect(rec.status).toBe("pending");
    expect(rec.failureCount).toBe(2);

    rec = transitionCoverageRecord({
      current: rec,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "schema_validation_failed",
        retryable: false,
        reason: "schema err",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T12:03:00.000Z",
    });
    expect(rec.status).toBe("abandoned");
    expect(rec.failureCount).toBe(3);
    expect(rec.retryableFailureCount).toBe(1);
    expect(rec.totalFailureCount).toBe(4);
    expect(rec.lastRefusalCode).toBe("schema_validation_failed");

    const store = new Map<string, unknown>([["ville-exemple", rec]]);
    const regPort: CoverageRegistryPort = {
      get(k) {
        return store.get(k.city);
      },
      put(r) {
        store.set(r.key.city, cloneForStore(r));
      },
    };
    const gateAbandoned = await checkCoverageGate(regPort, key, { extractionKey: extKey1 });
    expect(gateAbandoned.action).toBe("skip_abandoned");

    // 2. Retryable bound separately: two in a row stay pending, third consecutive abandons keeping lastRefusalCode
    let rRec: CoverageRecordV1 | null = null;
    for (let i = 1; i <= 2; i++) {
      rRec = transitionCoverageRecord({
        current: rRec,
        key,
        extractionKey: extKey1,
        outcome: {
          kind: "failed",
          status: "timeout",
          refusalCode: "deadline_exceeded",
          retryable: true,
        },
        maxFailures: 3,
        maxRetryableFailures: 3,
        nowIso: `2026-11-07T12:1${i}:00.000Z`,
      });
      expect(rRec.status).toBe("pending");
      expect(rRec.retryableFailureCount).toBe(i);
      expect(rRec.failureCount).toBe(0);
    }
    rRec = transitionCoverageRecord({
      current: rRec,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "timeout",
        refusalCode: "deadline_exceeded",
        retryable: true,
        reason: "third timeout",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T12:13:00.000Z",
    });
    expect(rRec.status).toBe("abandoned");
    expect(rRec.retryableFailureCount).toBe(3);
    expect(rRec.lastRefusalCode).toBe("deadline_exceeded");

    // 3. Absorbing abandoned: too-large, retryable, and non-retryable each leave status "abandoned" with only totalFailureCount + 1 and updatedAt changed; ok changes only updatedAt
    const baseAbandoned = rec;
    const afterTooLarge = transitionCoverageRecord({
      current: baseAbandoned,
      key,
      extractionKey: extKey2,
      outcome: {
        kind: "failed",
        status: "too-large",
        refusalCode: "document_too_large",
        retryable: false,
        reason: "over limit",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T13:00:00.000Z",
    });
    expect(afterTooLarge).toEqual({
      ...baseAbandoned,
      totalFailureCount: baseAbandoned.totalFailureCount + 1,
      updatedAt: "2026-11-07T13:00:00.000Z",
    });

    const afterRetryable = transitionCoverageRecord({
      current: afterTooLarge,
      key,
      extractionKey: extKey2,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "rate_limited",
        retryable: true,
        reason: "429 again",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T13:01:00.000Z",
    });
    expect(afterRetryable).toEqual({
      ...afterTooLarge,
      totalFailureCount: afterTooLarge.totalFailureCount + 1,
      updatedAt: "2026-11-07T13:01:00.000Z",
    });

    const afterNonRetryable = transitionCoverageRecord({
      current: afterRetryable,
      key,
      extractionKey: extKey2,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "empty_completion",
        retryable: false,
        reason: "empty",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T13:02:00.000Z",
    });
    expect(afterNonRetryable).toEqual({
      ...afterRetryable,
      totalFailureCount: afterRetryable.totalFailureCount + 1,
      updatedAt: "2026-11-07T13:02:00.000Z",
    });

    const afterOkFromAbandoned = transitionCoverageRecord({
      current: afterNonRetryable,
      key,
      extractionKey: extKey2,
      outcome: { kind: "ok" },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T13:03:00.000Z",
    });
    expect(afterOkFromAbandoned).toEqual({
      ...afterNonRetryable,
      updatedAt: "2026-11-07T13:03:00.000Z",
    });

    // Malformed outcome (undefined/null) from abandoned stays abandoned and never acts as an implicit reset (§1(c).6, M1)
    const afterUndefinedOutcomeFromAbandoned = transitionCoverageRecord({
      current: afterOkFromAbandoned,
      key,
      extractionKey: extKey2,
      outcome: undefined as never,
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T13:04:00.000Z",
    });
    expect(afterUndefinedOutcomeFromAbandoned).toEqual({
      ...afterOkFromAbandoned,
      updatedAt: "2026-11-07T13:04:00.000Z",
    });

    const afterNullOutcomeFromAbandoned = transitionCoverageRecord({
      current: afterUndefinedOutcomeFromAbandoned,
      key,
      extractionKey: extKey2,
      outcome: null as never,
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T13:05:00.000Z",
    });
    expect(afterNullOutcomeFromAbandoned).toEqual({
      ...afterUndefinedOutcomeFromAbandoned,
      updatedAt: "2026-11-07T13:05:00.000Z",
    });

    const malformedInputTransition = transitionCoverageRecord(undefined as never);
    expect(malformedInputTransition.lastReason).not.toBe("reset");
    expect(malformedInputTransition.failureCount).toBe(1);

    // 4. Reset from abandoned -> fresh pending record
    const afterReset = transitionCoverageRecord({
      current: afterNullOutcomeFromAbandoned,
      key,
      extractionKey: extKey1,
      outcome: { kind: "reset" },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T14:00:00.000Z",
    });
    expect(afterReset.status).toBe("pending");
    expect(afterReset.extractionKey).toBeNull();
    expect(afterReset.failureCount).toBe(0);
    expect(afterReset.retryableFailureCount).toBe(0);
    expect(afterReset.totalFailureCount).toBe(0);
    expect(afterReset.lastStatus).toBeNull();
    expect(afterReset.lastRefusalCode).toBeNull();
    expect(afterReset.lastReason).toBe("reset");

    // 5. too-large from non-abandoned -> pending with counters unchanged apart from totalFailureCount
    const pendingWithCounts = transitionCoverageRecord({
      current: afterReset,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "invalid_json_output",
        retryable: false,
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T14:01:00.000Z",
    });
    const tooLargeFromPending = transitionCoverageRecord({
      current: pendingWithCounts,
      key,
      extractionKey: extKey1,
      outcome: {
        kind: "failed",
        status: "too-large",
        refusalCode: "document_too_large",
        retryable: false,
        reason: "exceeded maxDocumentBytes",
      },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T14:02:00.000Z",
    });
    expect(tooLargeFromPending.status).toBe("pending");
    expect(tooLargeFromPending.failureCount).toBe(1);
    expect(tooLargeFromPending.retryableFailureCount).toBe(0);
    expect(tooLargeFromPending.totalFailureCount).toBe(2);
    expect(tooLargeFromPending.lastStatus).toBe("too-large");
    expect(tooLargeFromPending.lastRefusalCode).toBe("document_too_large");

    // 6. ok after failures -> covered, consecutive counters 0, totalFailureCount preserved; gate with same key -> skip_covered, different key -> proceed
    const coveredRec = transitionCoverageRecord({
      current: tooLargeFromPending,
      key,
      extractionKey: extKey1,
      outcome: { kind: "ok" },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T14:03:00.000Z",
    });
    expect(coveredRec.status).toBe("covered");
    expect(coveredRec.extractionKey).toBe(extKey1);
    expect(coveredRec.failureCount).toBe(0);
    expect(coveredRec.retryableFailureCount).toBe(0);
    expect(coveredRec.totalFailureCount).toBe(2);
    expect(coveredRec.lastStatus).toBe("ok");
    expect(coveredRec.lastRefusalCode).toBeNull();
    expect(coveredRec.lastReason).toBeNull();

    await regPort.put(coveredRec);
    const gateSameKey = await checkCoverageGate(regPort, key, { extractionKey: extKey1 });
    expect(gateSameKey.action).toBe("skip_covered");
    const gateDiffKey = await checkCoverageGate(regPort, key, { extractionKey: extKey2 });
    expect(gateDiffKey.action).toBe("proceed");

    // 7. Invalid-record repair (R3-M6): shape-invalid stored value ({status: "covered"} with no counters) -> proceed with record: null and coverage_record_invalid
    store.set("ville-exemple", { status: "covered" });
    const gateInvalid = await checkCoverageGate(regPort, key, { extractionKey: extKey1 });
    expect(gateInvalid).toEqual({
      action: "proceed",
      record: null,
      diagnostic: "coverage_record_invalid",
    });
    const repairedCov = transitionCoverageRecord({
      current: gateInvalid.action === "proceed" ? gateInvalid.record : null,
      key,
      extractionKey: extKey1,
      outcome: { kind: "ok" },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T15:00:00.000Z",
    });
    await regPort.put(repairedCov);
    const gateAfterRepair = await checkCoverageGate(regPort, key, { extractionKey: extKey1 });
    expect(gateAfterRepair.action).toBe("skip_covered");
    if (gateAfterRepair.action === "skip_covered") {
      expect(gateAfterRepair.record.schema).toBe("engram.coverage-record/v1");
    }

    // Throwing get double -> unavailable
    const throwingReg: CoverageRegistryPort = {
      get() {
        throw new Error("coverage store unreachable");
      },
      put() {},
    };
    const gateThrow = await checkCoverageGate(throwingReg, key, { extractionKey: extKey1 });
    expect(gateThrow.action).toBe("unavailable");
    if (gateThrow.action === "unavailable") {
      expect(gateThrow.diagnostic).toContain("coverage store unreachable");
    }

    // 8. Undecodable payload (decode rule): truncated-JSON string returned as a value -> proceed with coverage_record_invalid, repaired by following ok transition
    store.set("ville-exemple", '{"schema":"engram.coverage-record/v1","key":');
    const gateTruncated = await checkCoverageGate(regPort, key, { extractionKey: extKey1 });
    expect(gateTruncated).toEqual({
      action: "proceed",
      record: null,
      diagnostic: "coverage_record_invalid",
    });
    const repairedAfterTruncated = transitionCoverageRecord({
      current: gateTruncated.action === "proceed" ? gateTruncated.record : null,
      key,
      extractionKey: extKey1,
      outcome: { kind: "ok" },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T15:05:00.000Z",
    });
    await regPort.put(repairedAfterTruncated);
    const gateAfterTruncatedRepair = await checkCoverageGate(regPort, key, { extractionKey: extKey1 });
    expect(gateAfterTruncatedRepair.action).toBe("skip_covered");

    // 9. Unknown schema: {schema: "engram.coverage-record/v2", ...} -> unavailable with coverage_record_unknown_schema:engram.coverage-record/v2, no put, stored value byte-identical
    const unknownSchemaRecord = {
      schema: "engram.coverage-record/v2",
      key,
      status: "covered",
      extractionKey: extKey1,
      futureField: 123,
    };
    const unknownBeforeBytes = canonicalBytes(unknownSchemaRecord);
    let putCallsOnUnknown = 0;
    const unknownRegPort: CoverageRegistryPort = {
      get() {
        return unknownSchemaRecord;
      },
      put() {
        putCallsOnUnknown++;
      },
    };
    const gateUnknown = await checkCoverageGate(unknownRegPort, key, { extractionKey: extKey1 });
    expect(gateUnknown).toEqual({
      action: "unavailable",
      diagnostic: "coverage_record_unknown_schema:engram.coverage-record/v2",
    });
    expect(putCallsOnUnknown).toBe(0);
    expect(canonicalBytes(unknownSchemaRecord)).toBe(unknownBeforeBytes);

    // 10. Upper-case digests in key and extractionKey normalize on write so checkCoverageGate returns skip_covered (m1)
    const upperCovKey: CoverageKey = {
      city: "ville-exemple",
      docSha: `  ${DOC_SHA_A.toUpperCase()}  `,
      profileDigest: ` ${PROFILE_DIGEST_V1.toUpperCase()} `,
    };
    const upperExtKey = ` ${extKey1.toUpperCase()} `;
    const upperCoveredRec = transitionCoverageRecord({
      current: null,
      key: upperCovKey,
      extractionKey: upperExtKey,
      outcome: { kind: "ok" },
      maxFailures: 3,
      maxRetryableFailures: 3,
      nowIso: "2026-11-07T15:10:00.000Z",
    });
    expect(upperCoveredRec.key.docSha).toBe(DOC_SHA_A);
    expect(upperCoveredRec.key.profileDigest).toBe(PROFILE_DIGEST_V1);
    expect(upperCoveredRec.extractionKey).toBe(extKey1);
    await regPort.put(upperCoveredRec);
    const gateUpper = await checkCoverageGate(regPort, upperCovKey, { extractionKey: upperExtKey });
    expect(gateUpper.action).toBe("skip_covered");
    if (gateUpper.action === "skip_covered") {
      expect(gateUpper.record.key.docSha).toBe(DOC_SHA_A);
    }
  });

  it("F-EN1-T7: createCachedExtractionEntry refusals, undefined stripping, lone surrogates, sparse arrays, unprojectable conflicts, and own __proto__ keys", async () => {
    const identity = makeBaselineIdentity();
    const keyRes = computeExtractionKey(identity);
    expect(keyRes.ok).toBe(true);
    if (!keyRes.ok) return;
    const key = keyRes.key;

    // 1. Non-ok receipt -> ok: false
    const nonOkRes = createCachedExtractionEntry({
      identity,
      extraction: makeSampleExtraction(),
      receipt: {
        ...makeOkReceipt(key, identity),
        status: "refused",
        refusalCode: "empty_completion",
      },
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(nonOkRes.ok).toBe(false);
    if (!nonOkRes.ok) {
      expect(nonOkRes.refusalCode).toBe("invalid_extraction_payload");
    }

    // 2. Receipt key mismatched to identity -> ok: false
    const mismatchKeyRes = createCachedExtractionEntry({
      identity,
      extraction: makeSampleExtraction(),
      receipt: makeOkReceipt("0".repeat(64), identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(mismatchKeyRes.ok).toBe(false);
    if (!mismatchKeyRes.ok) {
      expect(mismatchKeyRes.refusalCode).toBe("invalid_extraction_payload");
    }

    // 3. Extraction carrying { community: undefined } on a node -> ok: true (key dropped by projection) and subsequent lookup hits
    const extWithUndefined = makeSampleExtraction();
    extWithUndefined.nodes[0]!.community = undefined;
    const undefRes = createCachedExtractionEntry({
      identity,
      extraction: extWithUndefined,
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(undefRes.ok).toBe(true);
    if (undefRes.ok) {
      expect("community" in undefRes.entry.extraction.nodes[0]!).toBe(false);
      expect(Object.isFrozen(undefRes.entry)).toBe(true);
      expect(Object.isFrozen(undefRes.entry.extraction)).toBe(true);
      // Caller's input extraction is not frozen
      expect(Object.isFrozen(extWithUndefined)).toBe(false);

      const { port } = createInMemoryCachePort();
      await port.putIfAbsent(key, undefRes.entry);
      const hit = await lookupCachedExtraction(port, identity);
      expect(hit.status).toBe("hit");
    }

    // 4. NaN confidence_score -> ok: false, invalid_extraction_payload
    const extWithNaN = makeSampleExtraction();
    extWithNaN.edges[0]!.confidence_score = Number.NaN;
    const nanRes = createCachedExtractionEntry({
      identity,
      extraction: extWithNaN,
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(nanRes.ok).toBe(false);
    if (!nanRes.ok) {
      expect(nanRes.refusalCode).toBe("invalid_extraction_payload");
      expect(nanRes.issues[0]?.path).toContain("confidence_score");
    }

    // 5. Lone surrogate ("\ud800") in citation excerpt -> ok: false, invalid_extraction_payload, issue path naming excerpt position, no throw
    const extWithSurrogate = makeSampleExtraction();
    extWithSurrogate.nodes[0]!.citations![0]!.excerpt = "bad \ud800 text";
    const surrRes = createCachedExtractionEntry({
      identity,
      extraction: extWithSurrogate,
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(surrRes.ok).toBe(false);
    if (!surrRes.ok) {
      expect(surrRes.refusalCode).toBe("invalid_extraction_payload");
      expect(surrRes.issues[0]?.path).toBe("nodes[0].citations[0].excerpt");
    }

    // 6. Sparse array (hole in citations) -> ok: false, invalid_extraction_payload, no throw
    const extWithHole = makeSampleExtraction();
    // eslint-disable-next-line no-sparse-arrays
    extWithHole.nodes[0]!.citations = new Array(1);
    const holeRes = createCachedExtractionEntry({
      identity,
      extraction: extWithHole,
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(holeRes.ok).toBe(false);
    if (!holeRes.ok) {
      expect(holeRes.refusalCode).toBe("invalid_extraction_payload");
      expect(holeRes.issues[0]?.path).toBe("nodes[0].citations[0]");
    }

    // 7. Unprojectable mergeConflicts list (NaN inside a conflict rendering input, cast) -> ok: false, invalid_extraction_payload
    const badConflict: ExtractionMergeConflict = {
      ...makeSampleConflict(),
      values: [Number.NaN as unknown as string, '"val-b"'],
    };
    const badConflictRes = createCachedExtractionEntry({
      identity,
      extraction: makeSampleExtraction(),
      mergeConflicts: [badConflict],
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(badConflictRes.ok).toBe(false);
    if (!badConflictRes.ok) {
      expect(badConflictRes.refusalCode).toBe("invalid_extraction_payload");
      expect(badConflictRes.issues[0]?.path).toBe("mergeConflicts[0].values[0]");
    }

    // 8. Own "__proto__" key on a node (built via JSON.parse, merged as own data properties) -> ok: true, preserved as own data property, prototype stays Object.prototype, lookup hits, changing value changes payloadDigest
    const parsedProto1 = JSON.parse('{"__proto__":{"x":1}}') as Record<string, unknown>;
    const parsedProto2 = JSON.parse('{"__proto__":{"x":2}}') as Record<string, unknown>;

    const extProto1 = makeSampleExtraction();
    Object.defineProperty(extProto1.nodes[0]!, "__proto__", {
      value: Object.getOwnPropertyDescriptor(parsedProto1, "__proto__")!.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const extProto2 = makeSampleExtraction();
    Object.defineProperty(extProto2.nodes[0]!, "__proto__", {
      value: Object.getOwnPropertyDescriptor(parsedProto2, "__proto__")!.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const protoRes1 = createCachedExtractionEntry({
      identity,
      extraction: extProto1,
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    const protoRes2 = createCachedExtractionEntry({
      identity,
      extraction: extProto2,
      receipt: makeOkReceipt(key, identity),
      createdAt: "2026-11-07T12:00:00.000Z",
    });

    expect(protoRes1.ok).toBe(true);
    expect(protoRes2.ok).toBe(true);
    if (protoRes1.ok && protoRes2.ok) {
      const storedNode = protoRes1.entry.extraction.nodes[0]!;
      expect(Object.getPrototypeOf(storedNode)).toBe(Object.prototype);
      const protoDesc = Object.getOwnPropertyDescriptor(storedNode, "__proto__");
      expect(protoDesc).toBeDefined();
      expect(protoDesc?.enumerable).toBe(true);
      expect(protoDesc?.value).toEqual({ x: 1 });
      expect(({} as Record<string, unknown>).x).toBeUndefined();

      // Changing only the "__proto__" key's value changes payloadDigest
      expect(protoRes1.entry.payloadDigest).not.toBe(protoRes2.entry.payloadDigest);

      // Subsequent lookup hits
      const { port } = createInMemoryCachePort();
      await port.putIfAbsent(key, protoRes1.entry);
      const lookupProto = await lookupCachedExtraction(port, identity);
      expect(lookupProto.status).toBe("hit");
    }

    // 9. Lookup step ordering: identity_mismatch (step ii) precedes digest_mismatch (step iii)
    if (protoRes1.ok) {
      const { port, map } = createInMemoryCachePort();
      const bothTampered = cloneForStore(protoRes1.entry);
      (bothTampered.identity as { promptVersion: string }).promptVersion = "prompt-v2";
      (bothTampered as { payloadDigest: string }).payloadDigest = "0".repeat(64);
      map.set(key, bothTampered);
      const stepOrderLookup = await lookupCachedExtraction(port, identity);
      expect(stepOrderLookup.status).toBe("miss");
      if (stepOrderLookup.status === "miss") {
        expect(stepOrderLookup.reason).toBe("identity_mismatch");
      }
    }

    // 10. Threshold clamping in transitionCoverageRecord & throwing getters fail-closed
    const clampedRec = transitionCoverageRecord({
      current: null,
      key: { city: "ville-exemple", docSha: DOC_SHA_A, profileDigest: PROFILE_DIGEST_V1 },
      extractionKey: key,
      outcome: {
        kind: "failed",
        status: "refused",
        refusalCode: "invalid_json_output",
        retryable: false,
        reason: "base",
      },
      maxFailures: 0,
      maxRetryableFailures: Number.NaN,
      nowIso: "2026-11-07T16:00:00.000Z",
    });
    expect(clampedRec.maxFailures).toBe(1);
    expect(clampedRec.maxRetryableFailures).toBe(1);
    expect(clampedRec.status).toBe("abandoned");
    expect(clampedRec.lastReason).toBe("base;maxFailures_clamped;maxRetryableFailures_clamped");

    let throwingGetterProduceCalls = 0;
    const throwingGetterCache = {
      get get(): ExtractionCachePort["get"] {
        throw new Error("getter exploded");
      },
      putIfAbsent() {
        return "stored" as const;
      },
    } as unknown as ExtractionCachePort;
    const throwingGetterRes = await getOrExtract({
      identity,
      cache: throwingGetterCache,
      nowIso: "2026-11-07T16:00:30.000Z",
      nowMs: 1000.25,
      endMs: () => 1010.75,
      produce: async (k) => {
        throwingGetterProduceCalls++;
        return {
          extraction: makeSampleExtraction(),
          receipt: makeOkReceipt(k, identity),
        };
      },
    });
    expect(throwingGetterRes.status).toBe("refused");
    expect(throwingGetterProduceCalls).toBe(0);
    if (throwingGetterRes.status === "refused") {
      expect(throwingGetterRes.refusalCode).toBe("cache_unavailable");
      expect(throwingGetterRes.receipt.latencyMs).toBe(10.5);
    }

    // Cacheless getOrExtract returns cacheWrite: "not_attempted" with unfrozen extraction
    const cachelessRes = await getOrExtract({
      identity,
      nowIso: "2026-11-07T16:01:00.000Z",
      nowMs: 1000,
      endMs: () => 1010,
      produce: async (k) => ({
        extraction: makeSampleExtraction("Cacheless"),
        mergeConflicts: [makeSampleConflict()],
        receipt: makeOkReceipt(k, identity),
      }),
    });
    expect(cachelessRes.status).toBe("ok");
    if (cachelessRes.status === "ok") {
      expect(cachelessRes.cacheWrite).toBe("not_attempted");
      expect(Object.isFrozen(cachelessRes.extraction)).toBe(false);
      expect(Object.isFrozen(cachelessRes.mergeConflicts)).toBe(true);
      expect(Object.isFrozen(cachelessRes.receipt)).toBe(true);
    }

    // Root barrel and extraction-batch subpath re-export checks
    expect(typeof rootApi.normalizeExtractionIdentity).toBe("function");
    expect(typeof rootApi.computeExtractionKey).toBe("function");
    expect(typeof rootApi.createCachedExtractionEntry).toBe("function");
    expect(typeof rootApi.lookupCachedExtraction).toBe("function");
    expect(typeof rootApi.transitionCoverageRecord).toBe("function");
    expect(typeof rootApi.checkCoverageGate).toBe("function");
    expect(typeof rootApi.getOrExtract).toBe("function");

    expect(batchApi.EXTRACTION_KEY_SCHEMA_V1).toBe(EXTRACTION_KEY_SCHEMA_V1);
    expect(batchApi.EXTRACTION_CACHE_ENTRY_SCHEMA_V2).toBe(EXTRACTION_CACHE_ENTRY_SCHEMA_V2);
    expect(batchApi.EXTRACTION_SEMANTICS_VERSION).toBe(EXTRACTION_SEMANTICS_VERSION);
    expect(typeof batchApi.normalizeExtractionIdentity).toBe("function");
    expect(typeof batchApi.computeExtractionKey).toBe("function");
    expect(typeof batchApi.createCachedExtractionEntry).toBe("function");
    expect(typeof batchApi.lookupCachedExtraction).toBe("function");
    expect(typeof batchApi.transitionCoverageRecord).toBe("function");
    expect(typeof batchApi.checkCoverageGate).toBe("function");
    expect(typeof batchApi.getOrExtract).toBe("function");
    expect("toJsonValue" in batchApi).toBe(false);
    expect("JSON_PROJECTION_VERSION" in batchApi).toBe(false);
    expect("bundleProfile" in batchApi).toBe(false);
    expect("PROFILE_BUNDLE_SCHEMA_V1" in batchApi).toBe(false);
  });
});
