import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { buildBoundedCurrentProjectionV1 } from "../engram-memory/bounded-projection.js";
import {
  createSessionFrontEngineV1,
  type SessionFrontCommitV1 as EngineCommitV1,
  type SessionFrontEventInputV1,
  type SessionFrontStoreV1,
  type SessionFrontTransactionV1,
} from "../engram-memory/session-front-engine.js";
import type { Result } from "../src/session-front-contracts.js";
import {
  createEngramSessionIngestFront,
  deriveSessionFrontIdempotencyKey,
  isValidWorktreeId,
  validateRawSessionEventEnvelope,
  validateSessionExtractionProposalBatch,
  type CliHostId,
  type D6FileOrPathRef,
  type EngramSessionIngestFrontOptionsV1,
  type ExtractedCandidateItem,
  type RawSessionEventEnvelope,
  type RawSessionEventPayload,
  type SessionDbCitationTuple,
  type SessionExtractionProposalBatch,
  type SessionFrontCommitV1,
} from "../src/session-front-contracts.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const now = "2026-11-21T12:00:00.000Z";
const citation: SessionDbCitationTuple = {
  sessionId: "session-1",
  entryId: "entry-1",
  ordinal: 7,
  contentDigest: digest,
  branchEpoch: 2,
  parentEntryId: "entry-0",
};
const file: D6FileOrPathRef = {
  pathRef: "src/example.ts",
  contentFingerprint: digest,
  contentDisclosureAuthorized: false,
};
const turn = {
  kind: "speech_turn",
  speakerRole: "owner",
  hostId: "codex",
  deliveryPath: "mcp-opportunistic",
  sessionCitation: citation,
  triggerTurnSweep: true,
} as const satisfies RawSessionEventPayload;

const scope = { tenantId: "tenant-1", workspaceId: "workspace-1" };
const common = {
  ...scope,
  derivedWorktreeId: `wt:${"1".repeat(64)}`,
  sessionPseudoId: "sess_pseudo:1111",
  purposeRef: "memory.capture.session/v1",
  retention: { derivative_rule: "retain" },
  authorization: { credential: "verified-test-credential" },
  deadlineAt: "2026-11-21T12:01:00.000Z",
} as const;

function event(payload: RawSessionEventPayload = turn, sourceId: string = payload.kind): RawSessionEventEnvelope {
  return {
    ...common,
    schemaVersion: "engram.session-event/v1",
    idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "event", sourceId }),
    actorPseudoId: "actor_pseudo:2222",
    cloneId: "clone:one",
    mandateRef: null,
    occurredAt: now,
    payload,
  };
}

function extraction(sourceEventRecordIds: string[], sourceId = "extract-1"): SessionExtractionProposalBatch {
  return {
    ...common,
    schemaVersion: "engram.session-extraction/v1",
    idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "extraction", sourceId }),
    sourceEventRecordIds,
    extractor: {
      kind: "light-permanent-llm",
      modelOrAdapterId: "test-model",
      extractionSemanticsVersion: "test-v1",
      llmMeshAttemptRef: "attempt-1",
    },
    candidates: [],
  };
}

function candidate(localCandidateKey: string, sourceEventRecordIds: string[]): ExtractedCandidateItem {
  return {
    localCandidateKey,
    domain: "project",
    templateRef: { lineage: "track", templateId: "decision", templateVersion: "1.0.0", templateDigestSha256: digest },
    candidateEntityTypeId: "decision",
    candidateRelations: [],
    attributes: {},
    validTime: { t: 42 },
    sourceEventRecordIds,
    citations: [],
  };
}

function mandateFixture() {
  return {
    mandateId: "mandate-1",
    instance: "instance-1",
    role: "PRINCIPAL",
    scope: "scope-1",
    rights: ["read"],
    envelopeDigest: digest,
    signatures: [{ by: "issuer-1", alg: "ed25519", value: "sig-1" }],
  } as const;
}

function mandateBinding(mandate: unknown) {
  return { kind: "mandate_binding", mandate, unboundRoleAnalysisRequested: mandate === null } as const;
}

function fixture(overrides: Partial<EngramSessionIngestFrontOptionsV1> = {}) {
  const commits: SessionFrontCommitV1[] = [];
  let tail = Promise.resolve();
  const front = createEngramSessionIngestFront({
    authorize: async ({ input }) => ({
      ok: true,
      value: { hasMemoryIdentity: input.authorization.credential === common.authorization.credential },
    }),
    getReadySlices: () => ({ readySlices: ["track"], readySlicePayloads: { track: "Track is ready" } }),
    screenCandidate: ({ candidate }) => ({ ok: true, value: candidate.localCandidateKey === "blocked" ? "withheld" : "allow" }),
    store: {
      transact(scope, apply) {
        const completion = tail.then(async () => {
          const writes: SessionFrontCommitV1[] = [];
          const outcome = await apply({
            cursor: String(commits.length + 1),
            async readReplay(kind, idempotencyKey) {
              return commits.find((commit) =>
                commit.kind === kind && commit.idempotencyKey === idempotencyKey &&
                commit.scope.tenantId === scope.tenantId && commit.scope.workspaceId === scope.workspaceId);
            },
            async readEvent(id) {
              const entry = commits.find((commit) => commit.kind === "event" && commit.receipt.eventRecordId === id);
              if (entry?.kind !== "event") return undefined;
              const latest = commits.findLast((commit) =>
                commit.kind === "extraction" && Object.hasOwn(commit.receipt.sourceDispositions, id));
              return {
                scope: entry.scope,
                disposition: latest?.kind === "extraction"
                  ? latest.receipt.sourceDispositions[id]!
                  : entry.receipt.extractionDisposition,
              };
            },
            async write(commit) {
              writes.push(structuredClone(commit));
            },
          });
          if (outcome.ok) commits.push(...writes);
          return outcome;
        });
        tail = completion.then(() => undefined, () => undefined);
        return completion;
      },
    },
    ...overrides,
  });
  return { front, commits };
}

function successful<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (result.ok) return result.value;
  throw new Error(JSON.stringify(result.error));
}

describe("session front", () => {
  it("refuses unknown keys, invalid worktree identifiers, and idempotency keys outside 16..256 bytes", async () => {
    const { front, commits } = fixture();
    const invalidEvents = [
      { ...event(), unexpected: true },
      { ...event(), derivedWorktreeId: "/private/worktree" },
      { ...event(), idempotencyKey: "é".repeat(7) + "x" },
      { ...event(), idempotencyKey: "é".repeat(128) + "x" },
      { ...event(), payload: { ...turn, unexpected: true } },
      { ...event(), payload: { ...turn, sessionCitation: { ...citation, ordinal: -1 } } },
      { ...event(), payload: { kind: "file_ref", file: { ...file, pathRef: "C:\\private\\secret.txt" } } } as const,
    ];
    for (const input of invalidEvents) {
      expect(validateRawSessionEventEnvelope(input)).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
      expect(await front.recordSessionEvent(input)).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    }
    const invalidBatch = { ...extraction(["raw_missing"]), extractor: { ...extraction([]).extractor, unexpected: true } };
    expect(validateSessionExtractionProposalBatch(invalidBatch)).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(await front.recordExtraction(invalidBatch)).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(isValidWorktreeId(common.derivedWorktreeId)).toBe(true);
    expect(isValidWorktreeId(common.derivedWorktreeId + "\n")).toBe(false);
    expect(isValidWorktreeId(`wt:${"A".repeat(64)}`)).toBe(false);
    expect(deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "session/entry/7" }))
      .toBe("idem:v1:49a77900f4dc7c91cf7bd0f0b4076e6f3e9583d8d2efccc8d8337ff7b9df3d68");
    expect(commits).toHaveLength(0);
  });

  it("refuses extraction that cites an uncommitted or cross-scope event, including candidate-only citations", async () => {
    const { front, commits } = fixture();
    const local = successful(await front.recordSessionEvent(event()));
    const other = successful(await front.recordSessionEvent({ ...event(), workspaceId: "workspace-2" }));
    const batch = extraction([local.eventRecordId]);
    const candidate = {
      localCandidateKey: "candidate",
      domain: "project",
      templateRef: { lineage: "track", templateId: "decision", templateVersion: "1.0.0", templateDigestSha256: digest },
      candidateEntityTypeId: "decision",
      candidateRelations: [],
      attributes: {},
      validTime: { t: 42 },
      sourceEventRecordIds: [other.eventRecordId],
      citations: [],
    } as const;
    expect(await front.recordExtraction(extraction(["raw_missing"]))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await front.recordExtraction(extraction([other.eventRecordId]))).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await front.recordExtraction({ ...batch, candidates: [candidate] }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(await front.recordExtraction({ ...batch, candidates: [{ ...candidate, sourceEventRecordIds: ["raw_missing"] }] }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(commits).toHaveLength(2);

    const allowed = { ...candidate, sourceEventRecordIds: [local.eventRecordId] };
    const blocked = { ...allowed, localCandidateKey: "blocked" };
    const result = successful(await front.recordExtraction({ ...batch, candidates: [allowed, blocked] }));
    expect(result).toMatchObject({
      status: "committed",
      batchCursor: "3",
      outcomes: [{ localCandidateKey: "candidate", domain: "project", reviewStatus: "proposed", verdictAuthority: "track" }],
      d7BlockedKeys: ["blocked"],
      sourceDispositions: { [local.eventRecordId]: "proposed" },
    });
    expect(commits[2]).toMatchObject({ kind: "extraction", candidates: [allowed] });
    expect(successful(await front.recordExtraction({ ...batch, candidates: [allowed, blocked] }))).toEqual({
      ...result, status: "duplicate_exact",
    });
    const empty = successful(await front.recordSessionEvent(event(turn, "another-turn")));
    expect(successful(await front.recordExtraction(extraction([empty.eventRecordId], "empty"))).sourceDispositions)
      .toEqual({ [empty.eventRecordId]: "empty_verified" });
    const withheld = successful(await front.recordSessionEvent(event(turn, "withheld-turn")));
    expect(successful(await front.recordExtraction({
      ...extraction([withheld.eventRecordId], "withheld"),
      candidates: [{ ...blocked, sourceEventRecordIds: [withheld.eventRecordId] }],
    }))).toMatchObject({ outcomes: [], d7BlockedKeys: ["blocked"], sourceDispositions: { [withheld.eventRecordId]: "withheld_d7" } });
  });

  it("refuses engine-level extraction that cites uncommitted or cross-scope candidate sources", async () => {
    const events = new Map([
      ["raw_local", { scope: { ...scope }, disposition: "pending_extraction" as const }],
      ["raw_other", { scope: { tenantId: "tenant-1", workspaceId: "workspace-2" }, disposition: "pending_extraction" as const }],
    ]);
    const commits: EngineCommitV1[] = [];
    const store: SessionFrontStoreV1 = {
      async transact(scopeArg, apply) {
        const writes: EngineCommitV1[] = [];
        const tx: SessionFrontTransactionV1 = {
          cursor: "9",
          async readReplay() { return undefined; },
          async readEvent(id) { return events.get(id); },
          async write(commit) { writes.push(structuredClone(commit)); },
        };
        const outcome = await apply(tx);
        if (outcome.ok) commits.push(...writes);
        return outcome;
      },
    };
    const engine = createSessionFrontEngineV1(store);
    const batchFor = (sources: string[], candidateSources: string[]) => ({
      scope: { ...scope },
      idempotencyKey: `idem:v1:${"f".repeat(64)}`,
      worktreeId: common.derivedWorktreeId,
      sessionRef: "sess",
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      sourceEventRecordIds: sources,
      extractor: { kind: "session-llm", modelOrAdapterId: "model", extractionSemanticsVersion: "v1", llmMeshAttemptRef: "attempt" },
      candidates: [{ localCandidateKey: "c", domain: "project" as const, sourceEventRecordIds: candidateSources }],
    });
    const allow = () => ({ ok: true as const, value: "allow" as const });
    expect(await engine.recordExtraction(batchFor(["raw_local"], ["raw_missing"]), allow))
      .toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await engine.recordExtraction(batchFor(["raw_local"], ["raw_other"]), allow))
      .toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(commits).toHaveLength(0);
  });

  it("refuses both writes without a memory identity before touching the store", async () => {
    const { front, commits } = fixture();
    const authorization = { credential: "unverified-credential" };
    const raw = await front.recordSessionEvent({ ...event(), authorization });
    const batch = await front.recordExtraction({ ...extraction(["raw_missing"]), authorization });
    for (const result of [raw, batch]) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
      expect(JSON.stringify(result)).not.toContain(authorization.credential);
    }
    expect(commits).toHaveLength(0);
  });

  it("commits all six event kinds with citation, bounded text, disposition, slices and the null-mandate signal", async () => {
    const { front, commits } = fixture();
    const prefix = "a".repeat(65_534);
    const text = prefix + "🙂more";
    const payloads: RawSessionEventPayload[] = [
      { ...turn, boundedTurnText: text },
      {
        kind: "tool_result", hostId: "agy", toolName: "test-tool", invocationId: "call-1",
        succeeded: false, exitCode: 2, significance: "error", sessionCitation: citation, touchedFiles: [file],
      },
      { kind: "file_ref", file, gitCommitOid: { algorithm: "sha1", oid: "b".repeat(40) }, sessionCitation: citation },
      { kind: "mandate_binding", mandate: null, unboundRoleAnalysisRequested: true },
      {
        kind: "external_hmi_input", hmiSource: "github-pr-sync", externalSourceId: "PR#1@revision2",
        payloadDigest: digest, structuredAttributes: { title: "test" }, citations: [],
      },
      { kind: "context_saturation", hostId: "muse", observedTokenRatio: 1, throughOrdinal: 11 },
    ];
    for (const [index, payload] of payloads.entries()) {
      const input = event(payload);
      const output = successful(await front.recordSessionEvent(payload.kind === "external_hmi_input"
        ? { ...input, purposeRef: "memory.capture.hmi/v1" }
        : input));
      expect(output).toMatchObject({
        status: "recorded", eventRecordId: expect.stringMatching(/^raw_[a-z2-7]{52}$/),
        cursor: String(index + 1), extractionDisposition: "pending_extraction",
        readySlices: ["track"], readySlicePayloads: { track: "Track is ready" },
        h2aProactiveRoleAnalysisQueued: true, extractionSweepScheduled: index === 0 || index === 5,
      });
      expect(commits[index]).toMatchObject({ kind: "event", event: { payload: { kind: payload.kind } } });
    }
    expect(commits[0]).toMatchObject({
      event: { payload: { deliveryPath: "mcp-opportunistic" }, citation },
      turnText: { citation, text: prefix, truncatedInProjection: true },
      ordinal: { sessionId: citation.sessionId, branchEpoch: 2, throughOrdinal: 7 },
    });
    expect(commits[1]).toMatchObject({ event: { citation } });
    expect(commits[2]).toMatchObject({ event: { citation } });
    expect(JSON.stringify(commits)).not.toContain(common.authorization.credential);
    expect(JSON.stringify(commits)).not.toContain("🙂");
  });

  it("records a ninth host name while CliHostId still lists the eight known CLIs", async () => {
    type KnownHosts = "claude" | "codex" | "gemini" | "agy" | "hermes" | "opencode" | "muse" | "vibe";
    expectTypeOf<CliHostId>().toEqualTypeOf<KnownHosts>();
    const { front, commits } = fixture();
    const hostId = "session-loop";
    successful(await front.recordSessionEvent(event({ ...turn, hostId })));
    expect(commits[0]).toMatchObject({ event: { payload: { hostId } } });
  });

  it("replays the same input atomically across delivery paths and refuses conflicting bytes", async () => {
    const { front, commits } = fixture();
    const input = event(turn);
    const [first, replay] = await Promise.all([
      front.recordSessionEvent(input),
      front.recordSessionEvent({ ...input, payload: { ...turn, deliveryPath: "poll-scan" } }),
    ]);
    expect(successful(replay)).toEqual({ ...successful(first), status: "duplicate_exact" });
    expect(await front.recordSessionEvent({ ...input, payload: { ...turn, hostId: "different" } }))
      .toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    expect(commits).toHaveLength(1);
  });

  it("keeps session_summary flags and thresholds out of the receipt and the engine", async () => {
    const { front } = fixture();
    for (let index = 0; index < 25; index += 1) {
      const receipt = successful(await front.recordSessionEvent(event({ ...turn, triggerTurnSweep: false }, String(index))));
      expect(receipt.extractionSweepScheduled).toBe(false);
      expect(Object.keys(receipt).join(" ")).not.toMatch(/summary|threshold/i);
    }
    const engine = readFileSync(new URL("../engram-memory/session-front-engine.ts", import.meta.url), "utf8");
    expect(engine).not.toMatch(/session.?summary|turnCountThreshold|byteBudgetThreshold/i);
  });

  it("keeps committed speech_turn text out of the bounded current projection", async () => {
    const { front, commits } = fixture();
    const text = "private session speech marker";
    const receipt = successful(await front.recordSessionEvent(event({ ...turn, boundedTurnText: text })));
    expect(commits[0]).toMatchObject({ turnText: { text } });
    const accepted = {
      node_id: "node:accepted",
      record_id: "mem_accepted",
      record_digest: receipt.recordDigest,
      scope_ref: "scope-1",
      valid_time: { t: 42 },
      projection_cursor: receipt.cursor,
      citation_refs: ["citation-1"],
      ...commits[0],
    };
    const projection = buildBoundedCurrentProjectionV1({
      high_water_cursor: receipt.cursor,
      projection_cursor: receipt.cursor,
      current: [accepted],
      omitted: [{ record_id: receipt.eventRecordId, reason: "pending" }],
    });
    expect(projection.objects).toHaveLength(1);
    expect(JSON.stringify(projection)).not.toContain(text);
    expect(JSON.stringify(projection)).not.toContain(receipt.eventRecordId);
  });

  it("resolves the compiled entry @sentropic/engram/session-front-contracts from the installed tarball with its declarations", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, unknown>;
    };
    const entry = manifest.exports["./session-front-contracts"] as Record<string, string> | undefined;
    expect(entry?.types).toBe("./dist/session-front-contracts.d.ts");
    expect(entry?.import).toBe("./dist/session-front-contracts.js");
    const tsup = readFileSync(new URL("../tsup.config.ts", import.meta.url), "utf8");
    expect(tsup.match(/"session-front-contracts": "src\/session-front-contracts\.ts"/g)).toHaveLength(2);
    const adapter = readFileSync(new URL("../src/session-front/ingest.ts", import.meta.url), "utf8");
    for (const forbidden of ["better-sqlite3", "fs-ext", "@ai-sdk/", "process.env", "@sentropic/"]) {
      expect(adapter).not.toContain(forbidden);
    }
    expect(adapter).toContain("../../engram-memory/dist/session-front-engine.js");
    expect(typeof createEngramSessionIngestFront).toBe("function");
    const contracts = readFileSync(new URL("../src/session-front-contracts.ts", import.meta.url), "utf8");
    expect(contracts).toContain("../engram-memory/dist/contracts/index.js");
    for (const name of ["H2AMandateEnvelope", "LineageId", "OntologyTemplateEnvelopeRef", "Sha256Digest",
      "AuthorizationContextV1", "CitationV1", "Cursor", "Instant", "OpaqueRef", "Result", "RetentionV1"]) {
      expect(contracts).toContain(name);
    }
    const builtJs = readFileSync(new URL("../dist/session-front-contracts.js", import.meta.url), "utf8");
    const builtCjs = readFileSync(new URL("../dist/session-front-contracts.cjs", import.meta.url), "utf8");
    const builtDts = readFileSync(new URL("../dist/session-front-contracts.d.ts", import.meta.url), "utf8");
    for (const built of [builtJs, builtCjs]) {
      expect(built).toContain("deriveSessionFrontIdempotencyKey");
      expect(built).toContain("validateRawSessionEventEnvelope");
    }
    expect(builtDts).toContain("deriveSessionFrontIdempotencyKey");
    expect(builtDts).not.toMatch(/\$1/);
  });

  it("rejects un-normalized NFD bytes and duplicate keys across NFC boundaries", async () => {
    const nfdKey = "e\u0301".repeat(5) + "x";
    expect(new TextEncoder().encode(nfdKey).byteLength).toBe(16);
    expect(new TextEncoder().encode(nfdKey.normalize("NFC")).byteLength).toBeLessThan(16);
    expect(validateRawSessionEventEnvelope({ ...event(), idempotencyKey: nfdKey }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    const batch = extraction(["raw_1"], "nfc-dup");
    const first = candidate("caf\u00e9", ["raw_1"]);
    const second = candidate("cafe\u0301", ["raw_1"]);
    expect(first.localCandidateKey).not.toBe(second.localCandidateKey);
    expect(first.localCandidateKey.normalize("NFC")).toBe(second.localCandidateKey.normalize("NFC"));
    expect(validateSessionExtractionProposalBatch({ ...batch, candidates: [first, second] }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
  });

  it("derives the idempotency key from canonical JCS with validated OpaqueRef inputs", () => {
    expect(deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "cafe\u0301" }))
      .toBe(deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "caf\u00e9" }));
    for (const input of [
      { sourceKind: "", sourceId: "session/entry/7" },
      { sourceKind: "entry", sourceId: "" },
      { sourceKind: "entry", sourceId: "x".repeat(513) },
      { sourceKind: "entry", sourceId: "lone-surrogate-\uD800" },
      { sourceKind: "entry", sourceId: "session/entry/7", unexpected: true },
      { sourceId: "session/entry/7" },
    ]) {
      expect(() => deriveSessionFrontIdempotencyKey(input as never)).toThrow();
    }
  });

  it("refuses ungrounded extraction candidates and batches", async () => {
    const { front } = fixture();
    const local = successful(await front.recordSessionEvent(event()));
    const batch = extraction([local.eventRecordId], "ungrounded");
    expect(validateSessionExtractionProposalBatch({ ...batch, candidates: [candidate("lonely", [])] }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(await front.recordExtraction({ ...batch, candidates: [candidate("lonely", [])] }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateSessionExtractionProposalBatch({ ...batch, candidates: [candidate("stray", ["raw_other"])] }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateSessionExtractionProposalBatch({
      ...extraction([], "empty-batch"),
      candidates: [candidate("orphan", ["raw_1"])],
    })).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
  });

  it("keeps eventRecordId invariant across delivery paths and unbounded payload text", async () => {
    const harness = (cursor = "1") => {
      const commits: EngineCommitV1[] = [];
      const store: SessionFrontStoreV1 = {
        async transact(scope, apply) {
          const writes: EngineCommitV1[] = [];
          const tx: SessionFrontTransactionV1 = {
            cursor,
            async readReplay() { return undefined; },
            async readEvent() { return undefined; },
            async write(commit) { writes.push(structuredClone(commit)); },
          };
          const outcome = await apply(tx);
          if (outcome.ok) commits.push(...writes);
          return outcome;
        },
      };
      return { commits, engine: createSessionFrontEngineV1(store) };
    };
    const input = (deliveryPath: string, extra: Record<string, unknown> = {}): SessionFrontEventInputV1 => ({
      scope: { ...scope },
      idempotencyKey: `idem:v1:${"c".repeat(64)}`,
      worktreeId: common.derivedWorktreeId,
      sessionRef: "sess",
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      actorRef: "actor",
      cloneId: "clone:one",
      assignmentDigest: null,
      occurredAt: now,
      payload: {
        kind: "speech_turn",
        deliveryPath,
        sessionCitation: { ...citation },
        ...extra,
      } as SessionFrontEventInputV1["payload"],
      citation: { ...citation },
      text: "hello",
      queueExtraction: false,
    });
    const hook = harness();
    const poll = harness();
    const first = successful(await hook.engine.recordEvent(input("push-hook"), { syncState: "synced" }));
    const second = successful(await poll.engine.recordEvent(input("poll-scan"), { syncState: "synced" }));
    expect(second.eventRecordId).toBe(first.eventRecordId);
    expect(second.recordDigest).toBe(first.recordDigest);
    const smuggled = harness();
    const clean = harness();
    const smuggledReceipt = successful(await smuggled.engine.recordEvent(
      input("push-hook", { boundedTurnText: "Z".repeat(70_000), truncatedInProjection: false }),
      { syncState: "synced" },
    ));
    const cleanReceipt = successful(await clean.engine.recordEvent(input("push-hook"), { syncState: "synced" }));
    expect(smuggledReceipt.eventRecordId).toBe(cleanReceipt.eventRecordId);
    expect(smuggled.commits[0]).toMatchObject({ event: { payload: { deliveryPath: "push-hook" } } });
    expect(smuggled.commits[0]?.event.payload).not.toHaveProperty("boundedTurnText");
    expect(smuggled.commits[0]?.event.payload).not.toHaveProperty("truncatedInProjection");
  });

  it("rejects secret-bearing paths, unsigned mandates, and inconsistent mandate bindings", () => {
    const fileRef = (pathRef: string, extra: Partial<D6FileOrPathRef> = {}) => ({
      ...event(),
      payload: {
        kind: "file_ref",
        file: { pathRef, contentFingerprint: digest, contentDisclosureAuthorized: false, ...extra },
      },
    });
    for (const pathRef of [".env", ".env.local", "certs/prod.pem", "tls/private.key", "id_rsa",
      "credentials.json", "secrets.json", "service-account.json", "secrets/api.json", "a/credentials/b.ts",
      "https://example.com/a.ts", "ssh://git@example.com/a.git", "~/secret", "a\nb", "a\rb"]) {
      expect(validateRawSessionEventEnvelope(fileRef(pathRef)))
        .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    }
    expect(validateRawSessionEventEnvelope(fileRef("src/example.ts", { lineRange: { start: 0, end: 5 } })))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope(fileRef("src/example.ts", { lineRange: { start: 1, end: 5 } })))
      .toMatchObject({ ok: true });
    const unsigned = { ...mandateFixture(), signatures: [] as const };
    expect(validateRawSessionEventEnvelope({ ...event(), mandateRef: unsigned, payload: mandateBinding(unsigned) }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope({ ...event(), mandateRef: null, payload: mandateBinding(mandateFixture()) }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope({ ...event(), mandateRef: mandateFixture(), payload: mandateBinding(null) }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope({ ...event(), mandateRef: mandateFixture(), payload: mandateBinding(mandateFixture()) }))
      .toMatchObject({ ok: true });
  });

  it("requires pseudonymized session and actor identifiers with bounded host metadata", () => {
    expect(validateRawSessionEventEnvelope({ ...event(), sessionPseudoId: "alice@example.com" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope({ ...event(), actorPseudoId: "plain-user" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope(event({ ...turn, hostId: "   " })))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope(event({ ...turn, hostId: "x".repeat(513) })))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    expect(validateRawSessionEventEnvelope({ ...event(), authorization: { credential: "   " } }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
  });

  it("maps canonical-JSON failures inside the transaction to INVALID_SCHEMA", async () => {
    const commits: EngineCommitV1[] = [];
    const store: SessionFrontStoreV1 = {
      async transact(scope, apply) {
        const writes: EngineCommitV1[] = [];
        const tx: SessionFrontTransactionV1 = {
          cursor: "7",
          async readReplay() { return undefined; },
          async readEvent() { return undefined; },
          async write(commit) { writes.push(structuredClone(commit)); },
        };
        const outcome = await apply(tx);
        if (outcome.ok) commits.push(...writes);
        return outcome;
      },
    };
    const engine = createSessionFrontEngineV1(store);
    const poisoned = {
      scope: { ...scope },
      idempotencyKey: `idem:v1:${"e".repeat(64)}`,
      worktreeId: common.derivedWorktreeId,
      sessionRef: "sess",
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      actorRef: "actor",
      cloneId: "clone:one",
      assignmentDigest: null,
      occurredAt: now,
      payload: { kind: "speech_turn", deliveryPath: "push-hook", sessionCitation: { ...citation }, triggerTurnSweep: false },
      citation: { ...citation },
      text: "hello",
      queueExtraction: false,
    } as SessionFrontEventInputV1;
    expect(await engine.recordEvent(poisoned, { syncState: "synced", smuggled: 10n } as never))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    expect(commits).toHaveLength(0);
  });

  it("rejects duplicate and unbounded citations", () => {
    const one = { citation_id: "c-1", source_ref: "src", locator: { scheme: "s", value: "v" }, content_digest: digest };
    const batch = extraction(["raw_1"], "citations");
    expect(validateSessionExtractionProposalBatch({
      ...batch,
      candidates: [{ ...candidate("dup", ["raw_1"]), citations: [one, { ...one }] }],
    })).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    const many = Array.from({ length: 257 }, (_, index) => ({ ...one, citation_id: `c-${index}` }));
    expect(validateSessionExtractionProposalBatch({
      ...batch,
      candidates: [{ ...candidate("many", ["raw_1"]), citations: many }],
    })).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
  });

  it("delivers degraded banners only with queued-degraded sync state and filtered slices", async () => {
    const degradedSlices = () => ({
      readySlices: ["track"] as const,
      readySlicePayloads: { track: "Track is ready", git: "not ready" },
      syncState: "queued-degraded" as const,
      degradedBanner: "Memory link degraded — continuing with cached slices.",
    });
    const { front } = fixture({ getReadySlices: degradedSlices as never });
    const receipt = successful(await front.recordSessionEvent(event()));
    expect(receipt).toMatchObject({
      syncState: "queued-degraded",
      degradedBanner: "Memory link degraded — continuing with cached slices.",
      readySlices: ["track"],
      readySlicePayloads: { track: "Track is ready" },
    });
    expect(receipt.readySlicePayloads).not.toHaveProperty("git");
    const { front: bannerless } = fixture({
      getReadySlices: (() => ({ readySlices: ["track"], syncState: "queued-degraded" })) as never,
    });
    expect(await bannerless.recordSessionEvent(event()))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
  });

  it("records harness-domain outcomes under h2a verdict authority", async () => {
    const { front } = fixture();
    const local = successful(await front.recordSessionEvent(event()));
    const batch = extraction([local.eventRecordId], "harness-batch");
    const result = successful(await front.recordExtraction({
      ...batch,
      candidates: [{ ...candidate("harness-one", [local.eventRecordId]), domain: "harness" }],
    }));
    expect(result.outcomes).toMatchObject([{
      localCandidateKey: "harness-one",
      domain: "harness",
      reviewStatus: "proposed",
      verdictAuthority: "h2a",
    }]);
  });

  it("maps a throwing store to retryable STORE_UNAVAILABLE without leaking credentials", async () => {
    const { front } = fixture({
      store: { transact() { throw new Error("store down"); } } as never,
    });
    for (const result of [await front.recordSessionEvent(event()), await front.recordExtraction(extraction(["raw_1"]))]) {
      expect(result).toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE", retryable: true } });
      expect(JSON.stringify(result)).not.toContain(common.authorization.credential);
    }
  });

  it("records a ninth host name on tool_result and context_saturation payloads", async () => {
    const { front, commits } = fixture();
    const hostId = "session-loop";
    successful(await front.recordSessionEvent(event({
      kind: "tool_result", hostId, toolName: "test-tool", invocationId: "call-9",
      succeeded: true, significance: "routine", sessionCitation: citation, touchedFiles: [],
    })));
    successful(await front.recordSessionEvent(event({
      kind: "context_saturation", hostId, observedTokenRatio: 0.5, throughOrdinal: 3,
    })));
    expect(commits).toHaveLength(2);
    for (const commit of commits) {
      expect(commit).toMatchObject({ event: { payload: { hostId } } });
    }
  });

  it("queues no proactive role analysis for a bound mandate", async () => {
    const { front } = fixture();
    const bound = mandateFixture();
    const receipt = successful(await front.recordSessionEvent({ ...event(), mandateRef: bound, payload: mandateBinding(bound) }));
    expect(receipt.h2aProactiveRoleAnalysisQueued).toBe(false);
  });

  it("refuses writes past deadlineAt and contains callback failures", async () => {
    const { front } = fixture({ clock: { now: () => Date.parse(common.deadlineAt) + 1_000 } });
    expect(await front.recordSessionEvent(event()))
      .toMatchObject({ ok: false, error: { code: "DEADLINE_EXCEEDED" } });
    expect(await front.recordExtraction(extraction(["raw_1"])))
      .toMatchObject({ ok: false, error: { code: "DEADLINE_EXCEEDED" } });
    const throwingSlices = fixture({ getReadySlices: (() => { throw new Error("slices down"); }) as never });
    expect(await throwingSlices.front.recordSessionEvent(event())).toMatchObject({ ok: false });
    const throwingScreen = fixture({ screenCandidate: (() => { throw new Error("deny-list down"); }) as never });
    expect(await throwingScreen.front.recordExtraction(extraction(["raw_1"]))).toMatchObject({ ok: false });
  });

  it("records the built dist/mcp-memory.js digest in the derived registry entries", () => {
    const built = readFileSync(new URL("../dist/mcp-memory.js", import.meta.url));
    const digest = createHash("sha256").update(built).digest("hex");
    const entries = JSON.parse(readFileSync(new URL("../registry/entries.v1.json", import.meta.url), "utf8")) as {
      entries: { assets: { role: string; path: string; sha256: string }[] }[];
    };
    expect(entries.entries[0]?.assets.find((asset) => asset.path === "dist/mcp-memory.js")?.sha256).toBe(digest);
    const receipt = JSON.parse(readFileSync(new URL("../registry/publisher-assets.v1.json", import.meta.url), "utf8")) as {
      assets: { path: string; sha256: string }[];
    };
    expect(receipt.assets.find((asset) => asset.path === "dist/mcp-memory.js")?.sha256).toBe(digest);
  });

  it("rejects non-plain objects, symbol keys, and cycles with INVALID_SCHEMA", async () => {
    const commits: EngineCommitV1[] = [];
    const store: SessionFrontStoreV1 = {
      async transact(scope, apply) {
        const writes: EngineCommitV1[] = [];
        const tx: SessionFrontTransactionV1 = {
          cursor: "1",
          async readReplay() { return undefined; },
          async readEvent() { return undefined; },
          async write(commit) { writes.push(structuredClone(commit)); },
        };
        const outcome = await apply(tx);
        if (outcome.ok) commits.push(...writes);
        return outcome;
      },
    };
    const engine = createSessionFrontEngineV1(store);
    const base = {
      scope: { ...scope },
      idempotencyKey: `idem:v1:${"b".repeat(64)}`,
      worktreeId: common.derivedWorktreeId,
      sessionRef: "sess",
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      actorRef: "actor",
      cloneId: "clone:one",
      assignmentDigest: null,
      occurredAt: now,
      payload: { kind: "speech_turn", deliveryPath: "push-hook", sessionCitation: { ...citation }, triggerTurnSweep: false },
      citation: { ...citation },
      text: "hello",
      queueExtraction: false,
    };
    expect(await engine.recordEvent({ ...base, retention: new Date(0) as never }, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    expect(await engine.recordEvent({ ...base, retention: new Map() as never }, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    expect(await engine.recordEvent({ ...base, [Symbol("s")]: 1 } as never, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    const cyclic = { ...base } as Record<string, unknown>;
    cyclic.self = cyclic;
    expect(await engine.recordEvent(cyclic as never, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    expect(commits).toHaveLength(0);
  });

  it("fails closed on unexpected screenCandidate verdicts", async () => {
    const { front, commits } = fixture();
    const local = successful(await front.recordSessionEvent(event()));
    const batch = extraction([local.eventRecordId], "verdict-guard");
    const allowed = { ...candidate("verdict-ok", [local.eventRecordId]) };
    for (const verdict of ["quarantine", undefined, 0, "ALLOW"]) {
      const guarded = fixture({ screenCandidate: (() => ({ ok: true, value: verdict })) as never });
      expect(await guarded.front.recordExtraction({ ...batch, candidates: [allowed] }))
        .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    }
    const events = new Map([[local.eventRecordId, { scope: { ...scope }, disposition: "pending_extraction" as const }]]);
    const engineCommits: EngineCommitV1[] = [];
    const engineStore: SessionFrontStoreV1 = {
      async transact(scopeArg, apply) {
        const writes: EngineCommitV1[] = [];
        const tx: SessionFrontTransactionV1 = {
          cursor: "9",
          async readReplay() { return undefined; },
          async readEvent(id) { return events.get(id); },
          async write(commit) { writes.push(structuredClone(commit)); },
        };
        const outcome = await apply(tx);
        if (outcome.ok) engineCommits.push(...writes);
        return outcome;
      },
    };
    const engine = createSessionFrontEngineV1(engineStore);
    const batchFor = (sources: string[]) => ({
      scope: { ...scope },
      idempotencyKey: `idem:v1:${"a".repeat(64)}`,
      worktreeId: common.derivedWorktreeId,
      sessionRef: "sess",
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      sourceEventRecordIds: sources,
      extractor: { kind: "session-llm", modelOrAdapterId: "model", extractionSemanticsVersion: "v1", llmMeshAttemptRef: "attempt" },
      candidates: [{ localCandidateKey: "c", domain: "project" as const, sourceEventRecordIds: sources }],
    });
    for (const verdict of ["quarantine", undefined, 0]) {
      expect(await engine.recordExtraction(batchFor([local.eventRecordId]), (() => ({ ok: true, value: verdict })) as never))
        .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    }
    expect(engineCommits).toHaveLength(0);
    expect(commits).toHaveLength(1);
  });

  it("rejects backslash-delimited secret paths", () => {
    const fileRef = (pathRef: string) => ({
      ...event(),
      payload: {
        kind: "file_ref",
        file: { pathRef, contentFingerprint: digest, contentDisclosureAuthorized: false },
      },
    });
    for (const pathRef of ["secrets\\api.json", "config\\.env", "ssh\\id_rsa"]) {
      expect(validateRawSessionEventEnvelope(fileRef(pathRef)))
        .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA" } });
    }
    expect(validateRawSessionEventEnvelope(fileRef("src\\example.ts"))).toMatchObject({ ok: true });
  });

  it("validates idempotency source types before surrogates and length on NFC bytes", () => {
    let failure: unknown;
    try {
      deriveSessionFrontIdempotencyKey({ sourceKind: undefined as never, sourceId: "x" });
    } catch (error) {
      failure = error;
    }
    expect((failure as Error)?.name).toBe("SchemaFailure");
    expect(() => deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "\u0F43".repeat(170) })).toThrow();
    expect(deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "caf\u00e9" }))
      .toBe(deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "cafe\u0301" }));
  });

  it("returns STORE_UNAVAILABLE for non-canonical cursors and INVALID_SCHEMA for non-canonical engine input", async () => {
    const canonicalStore = (cursor: string, commits: EngineCommitV1[]): SessionFrontStoreV1 => ({
      async transact(scope, apply) {
        const writes: EngineCommitV1[] = [];
        const tx: SessionFrontTransactionV1 = {
          cursor,
          async readReplay() { return undefined; },
          async readEvent() { return undefined; },
          async write(commit) { writes.push(structuredClone(commit)); },
        };
        const outcome = await apply(tx);
        if (outcome.ok) commits.push(...writes);
        return outcome;
      },
    });
    const validInput = {
      scope: { ...scope },
      idempotencyKey: `idem:v1:${"d".repeat(64)}`,
      worktreeId: common.derivedWorktreeId,
      sessionRef: "sess",
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" },
      actorRef: "actor",
      cloneId: "clone:one",
      assignmentDigest: null,
      occurredAt: now,
      payload: { kind: "speech_turn", deliveryPath: "push-hook", sessionCitation: { ...citation }, triggerTurnSweep: false },
      citation: undefined,
      text: "hello",
      queueExtraction: false,
    };
    const cursorCommits: EngineCommitV1[] = [];
    const cursorEngine = createSessionFrontEngineV1(canonicalStore("01", cursorCommits));
    expect(await cursorEngine.recordEvent(validInput as never, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE", retryable: true } });
    expect(cursorCommits).toHaveLength(0);
    const inputCommits: EngineCommitV1[] = [];
    const inputEngine = createSessionFrontEngineV1(canonicalStore("7", inputCommits));
    expect(await inputEngine.recordEvent({ ...validInput, text: 10n as never }, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    const cyclic = { ...validInput } as Record<string, unknown>;
    cyclic.self = cyclic;
    expect(await inputEngine.recordEvent(cyclic as never, { syncState: "synced" }))
      .toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", retryable: false } });
    expect(inputCommits).toHaveLength(0);
  });
});
