import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeJcs } from "../engram-memory/canonical-json.js";
import type { SessionFrontStoreV1 } from "../engram-memory/session-front-engine.js";
import { createSessionContextEngineV1 } from "../src/session-context/engine.js";

const tenantId = "tenant-1";
const workspaceId = "workspace-1";
const derivedWorktreeId = `wt:${"1".repeat(64)}`;
const roleRef = "agent:codex";
const sessionA = "session-a";
const sessionB = "session-b";
const actorRef = "actor_pseudo:9f2cb14d8a6e4b10c3d5f7812a4b6e90";
const cloneId = "clone:sj1a-local";
const fixedNow = () => "2026-06-01T00:00:00.000Z";
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

interface TestKey {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly derivedWorktreeId: string;
  readonly roleRef?: string;
  readonly sessionId: string;
}

function key(sessionId: string): TestKey {
  return { tenantId, workspaceId, derivedWorktreeId, roleRef, sessionId };
}

function engineFor(store: SessionFrontStoreV1) {
  return createSessionContextEngineV1({ store, actorRef, cloneId, now: fixedNow });
}

function textDigestOf(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function jcsSha256(value: unknown, domainPrefix = ""): string {
  return `sha256:${createHash("sha256").update(domainPrefix, "utf8").update(canonicalizeJcs(value), "utf8").digest("hex")}`;
}

function base32FromHex(hex: string): string {
  let bits = 0;
  let buffer = 0;
  let encoded = "";
  for (let i = 0; i < hex.length; i += 2) {
    buffer = (buffer << 8) | Number.parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += BASE32[(buffer << (5 - bits)) & 31];
  return encoded;
}

function expectedQueryIdOf(k: TestKey): string {
  const scope = k.roleRef === undefined ? { kind: "session", sessionId: k.sessionId } : { kind: "role", roleRef: k.roleRef };
  const digest = jcsSha256(
    { tenantId: k.tenantId, workspaceId: k.workspaceId, worktreeId: k.derivedWorktreeId, ...scope },
    "graphify-memory/session-context-query-id/v1\0",
  );
  return `query_${base32FromHex(digest.slice("sha256:".length)).slice(0, 16)}`;
}

function expectedQueryFields(k: TestKey, version: number, pinnedEventRecordIds: readonly string[]) {
  return {
    schemaVersion: "engram.session-context-query/v1" as const,
    queryId: expectedQueryIdOf(k),
    version,
    tenantId: k.tenantId,
    workspaceId: k.workspaceId,
    derivedWorktreeId: k.derivedWorktreeId,
    ...(k.roleRef === undefined ? {} : { roleRef: k.roleRef }),
    trackScope: [],
    ontologies: [],
    pinnedEventRecordIds: [...pinnedEventRecordIds],
    selectors: [],
  };
}

function expectedNeutralFields(k: TestKey, version: number, pinnedRefs: readonly string[]) {
  return {
    queryId: expectedQueryIdOf(k),
    version,
    tenantId: k.tenantId,
    workspaceId: k.workspaceId,
    worktreeId: k.derivedWorktreeId,
    ...(k.roleRef === undefined ? { sessionId: k.sessionId } : { roleRef: k.roleRef }),
    pinnedRefs: [...pinnedRefs],
    selectorIds: [],
  };
}

function expectedNeutralDigest(k: TestKey, version: number, pinnedRefs: readonly string[]): string {
  return jcsSha256(expectedNeutralFields(k, version, pinnedRefs), "graphify-memory/session-context-query/v1\0");
}

interface CapturedEventCommit {
  readonly idempotencyKey: string;
  readonly event: {
    readonly actorRef: string;
    readonly cloneId: string;
    readonly occurredAt: string;
    readonly payload: Readonly<Record<string, unknown>>;
  };
}

function memoryStore() {
  const commits: CapturedEventCommit[] = [];
  let tail = Promise.resolve();
  const store: SessionFrontStoreV1 = {
    transact(scope, apply) {
      const completion = tail.then(async () => {
        const writes: CapturedEventCommit[] = [];
        const outcome = await apply({
          cursor: String(commits.length + 1),
          async readReplay() {
            return undefined;
          },
          async readEvent() {
            return undefined;
          },
          async write(commit) {
            writes.push(structuredClone(commit) as unknown as CapturedEventCommit);
          },
        } as unknown as Parameters<Parameters<typeof store.transact>[1]>[0]);
        if (outcome.ok) commits.push(...writes);
        return outcome;
      });
      tail = completion.then(() => undefined, () => undefined);
      return completion;
    },
  };
  return { store, commits };
}

function failingStore(): SessionFrontStoreV1 {
  return {
    async transact() {
      return { ok: false, error: { operation: "capture", code: "STORE_UNAVAILABLE", message: "store down", retryable: true } };
    },
  };
}

describe("tests/session-context-engine.test.ts", () => {
  it("t1: the first noted event of a key creates version 1, the first request gives version 2, a digest is stable and a version never changes", async () => {
    const { store, commits } = memoryStore();
    const engine = engineFor(store);
    const k = key(sessionA);
    const qid = expectedQueryIdOf(k);
    const v1Fields = expectedQueryFields(k, 1, []);
    const expectedV1Digest = jcsSha256(v1Fields);
    const v2Ref = `pinned:${qid}:v2`;
    const v2Fields = expectedQueryFields(k, 2, [v2Ref]);
    const expectedV2Digest = jcsSha256(v2Fields);
    const expectedNeutralV1 = expectedNeutralFields(k, 1, []);
    const expectedNeutralV1Digest = expectedNeutralDigest(k, 1, []);
    const expectedNeutralV2 = expectedNeutralFields(k, 2, [v2Ref]);
    const expectedNeutralV2Digest = expectedNeutralDigest(k, 2, [v2Ref]);

    const v1 = await engine.noteSessionEvent(k);
    // Kills a mutant that alters schemaVersion, queryId derivation, initial version 1, or any non-digest field of v1.
    expect(v1).toEqual({ ...v1Fields, digest: expectedV1Digest });
    // Kills a mutant in queryDigestOf (constant digest, wrong hash, dropped field, or non-JCS encoding, SJ:745).
    expect(v1.digest).toBe(expectedV1Digest);

    const v2 = await engine.notePinnedRequest(k, "retry policy and backoff");
    // Kills a mutant that skips version increment, changes queryId across versions, or drops the pinned ref on v2.
    expect(v2).toEqual({ ...v2Fields, digest: expectedV2Digest });
    // Kills a mutant in queryDigestOf that ignores version or pinnedEventRecordIds when hashing v2 (SJ:745).
    expect(v2.digest).toBe(expectedV2Digest);
    // Kills a mutant that reuses v1's digest for v2.
    expect(v2.digest).not.toBe(expectedV1Digest);

    // Kills a mutant in getQuery that loses or overwrites v1 after v2 is appended.
    expect(engine.getQuery(qid, 1)).toEqual({ ...v1Fields, digest: expectedV1Digest });
    // Kills a mutant in getQuery that fails to return v2 by exact version.
    expect(engine.getQuery(qid, 2)).toEqual({ ...v2Fields, digest: expectedV2Digest });

    // Kills a mutant that skips L0 persistence on either v1 or v2.
    expect(commits.length).toBe(2);
    const raw = JSON.stringify(commits);
    // Kills a mutant that leaks h2a product vocabulary into neutral L0 records.
    expect(raw).not.toContain("h2a");
    // Kills a mutant that leaks @sentropic/ scope strings into neutral L0 records.
    expect(raw).not.toContain("@sentropic/");
    // Kills a mutant that substitutes hardcoded actorRef/cloneId/clock defaults instead of caller options.
    expect(commits[0]?.event.actorRef).toBe(actorRef);
    // Kills a mutant that drops or hardcodes cloneId on L0 event commits.
    expect(commits[0]?.event.cloneId).toBe(cloneId);
    // Kills a mutant that ignores the injected clock when recording L0 commits.
    expect(commits[0]?.event.occurredAt).toBe(fixedNow());
    // Kills a mutant that corrupts neutral payload fields or computes a wrong neutralDigest on v1.
    expect(commits[0]?.event.payload).toEqual({ kind: "session_context_query", ...expectedNeutralV1, neutralDigest: expectedNeutralV1Digest });
    // Kills a mutant that corrupts neutral payload fields or computes a wrong neutralDigest on v2.
    expect(commits[1]?.event.payload).toEqual({ kind: "session_context_query", ...expectedNeutralV2, neutralDigest: expectedNeutralV2Digest });

    const second = engineFor(store);
    const w1 = await second.noteSessionEvent(k);
    // Kills a mutant that derives non-deterministic queryId or digest across separate engine instances.
    expect(w1).toEqual({ ...v1Fields, digest: expectedV1Digest });

    // Kills a mutant that uses non-deterministic, clock-based, or counter-based idempotency keys per version.
    expect(commits.map((commit) => commit.idempotencyKey)).toEqual([`sj1a:${qid}:v1`, `sj1a:${qid}:v2`, `sj1a:${qid}:v1`]);

    // Kills a mutant that mutates v1 in place when v2 is committed.
    expect(v1).toEqual({ ...v1Fields, digest: expectedV1Digest });
  });

  it("t2: nothing changed outside the session: no item, byteLength 0, mode diff", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const k = key(sessionA);
    const qid = expectedQueryIdOf(k);
    const pinnedText = "retry policy and backoff";
    const expectedV2Digest = jcsSha256(expectedQueryFields(k, 2, [`pinned:${qid}:v2`]));
    const pinnedBytes = Buffer.byteLength(pinnedText, "utf8");

    await engine.noteSessionEvent(k);
    await engine.notePinnedRequest(k, pinnedText);
    const first = await engine.requestContext(k, { held: { queryId: qid, queryVersion: 2, cursor: "0" } });
    // Kills a mutant that rejects a valid initial requestContext call.
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Kills a mutant that skips initial full delivery for an unseen session or miscomputes its watermark/bytes/digest.
    expect(first.value).toEqual({
      mode: "full",
      watermark: { queryId: qid, queryVersion: 2, cursor: "2" },
      queryDigest: expectedV2Digest,
      byteLength: pinnedBytes,
      items: [{
        ref: `pinned:${qid}:v2`,
        digest: textDigestOf(pinnedText),
        slice: "track",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      }],
    });

    await engine.noteDecision(k, "own: keep the thread");
    const second = await engine.requestContext(k, { held: { queryId: qid, queryVersion: 2, cursor: "2" } });
    // Kills a mutant that rejects a follow-up diff request.
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Kills a mutant that returns mode full instead of diff when holding a valid watermark.
    expect(second.value.mode).toBe("diff");
    // Kills a mutant that fails to add own-session decisions to heldRefs (echoing the session's own decision back).
    expect(second.value.items).toEqual([]);
    // Kills a mutant that reports non-zero byteLength when nothing is delivered.
    expect(second.value.byteLength).toBe(0);
    // Kills a mutant that fails to advance watermark cursor or sets wrong queryDigest on an empty diff.
    expect(second.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "3" });
    // Kills a mutant that omits or corrupts queryDigest on an empty diff.
    expect(second.value.queryDigest).toBe(expectedV2Digest);
  });

  it("t3: a decision added from outside is delivered once with its watermark, and the next request holding that watermark gets 0 bytes", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const kA = key(sessionA);
    const kB = key(sessionB);
    const qid = expectedQueryIdOf(kA);
    const pinned1 = "retry policy and backoff";
    const pinned2 = "keep backoff bounded";
    const decisionText = "decision: adopt retry with backoff";
    const expectedV2Digest = jcsSha256(expectedQueryFields(kA, 2, [`pinned:${qid}:v2`]));
    const expectedV3Digest = jcsSha256(expectedQueryFields(kA, 3, [`pinned:${qid}:v2`, `pinned:${qid}:v3`]));
    const decisionDigest = textDigestOf(decisionText);
    const decisionBytes = Buffer.byteLength(decisionText, "utf8");
    const pinned2Digest = textDigestOf(pinned2);
    const pinned2Bytes = Buffer.byteLength(pinned2, "utf8");

    await engine.noteSessionEvent(kA);
    await engine.notePinnedRequest(kA, pinned1);
    const initialWatermark = await engine.lastWatermark(sessionA);
    // Kills a mutant in lastWatermark that returns pending instead of the committed query at cursor 0 before delivery.
    expect(initialWatermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "0" });

    const base = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "0" } });
    // Kills a mutant that fails initial full delivery.
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    // Kills a mutant that does not stamp cursor 2 on the initial full delivery watermark.
    expect(base.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "2" });

    const noted = await engine.noteDecision(kB, decisionText, sessionB);
    // Kills a mutant that fails to advance the journal cursor on noteDecision.
    expect(noted).toEqual({ cursor: "3" });

    const delivered = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "2" } });
    // Kills a mutant that rejects a valid diff request after an outside decision.
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    // Kills a mutant that sends mode full instead of diff for an outside decision.
    expect(delivered.value.mode).toBe("diff");
    // Kills a mutant that drops outside decisions or re-delivers the already-held pinned request.
    expect(delivered.value.items.map((item) => item.digest)).toEqual([decisionDigest]);
    // Kills a mutant that miscomputes UTF-8 byteLength on diff delivery.
    expect(delivered.value.byteLength).toBe(decisionBytes);
    // Kills a mutant that does not advance watermark cursor to the outside decision cursor.
    expect(delivered.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "3" });
    // Kills a mutant that returns a stale or corrupted queryDigest on diff delivery.
    expect(delivered.value.queryDigest).toBe(expectedV2Digest);

    const next = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "3" } });
    // Kills a mutant that rejects a repeat request at the latest watermark.
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    // Kills a mutant that re-delivers the outside decision when the caller holds cursor 3.
    expect(next.value.items).toEqual([]);
    // Kills a mutant that reports non-zero byteLength on an up-to-date diff.
    expect(next.value.byteLength).toBe(0);

    // Now seen holds {p2, D1} at cursor 3. Re-asking with the earlier valid cursor 2 MUST evaluate viewAt(2, "2").
    const replayCursor = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "2" } });
    // Kills a mutant that rejects a valid older watermark cursor.
    expect(replayCursor.ok).toBe(true);
    if (!replayCursor.ok) return;
    // Kills a mutant that deletes viewAt(held.queryVersion, held.cursor) in favour of seen.get(slot) or replaces held.cursor with latest cursor.
    expect(replayCursor.value.items.map((item) => item.digest)).toEqual([decisionDigest]);
    // Kills a mutant that drops byteLength when diffing against an earlier valid cursor.
    expect(replayCursor.value.byteLength).toBe(decisionBytes);

    // Advance to v3 with a second pinned request, deliver v3 so seen holds {p2, p3, D1} at cursor 4.
    await engine.notePinnedRequest(kA, pinned2);
    const toV3 = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "3" } });
    // Kills a mutant that rejects a diff crossing from v2 to v3.
    expect(toV3.ok).toBe(true);
    if (!toV3.ok) return;
    // Kills a mutant that fails to deliver the new pinned request on version bump to v3.
    expect(toV3.value.items.map((item) => item.digest)).toEqual([pinned2Digest]);

    // Holding v2 at the latest cursor 4: viewAt(v2, "4") excludes p3, whereas viewAt(head=v3, "4") and seen both include p3.
    const olderVersion = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "4" } });
    // Kills a mutant that rejects a valid older queryVersion at the current cursor.
    expect(olderVersion.ok).toBe(true);
    if (!olderVersion.ok) return;
    // Kills a mutant that deletes viewAt(held.queryVersion, held.cursor) or substitutes head.version for held.queryVersion.
    expect(olderVersion.value.items.map((item) => item.digest)).toEqual([pinned2Digest]);
    // Kills a mutant that miscomputes byteLength when diffing an older held queryVersion against v3.
    expect(olderVersion.value.byteLength).toBe(pinned2Bytes);
    // Kills a mutant that stamps the held version instead of head v3 on the returned watermark.
    expect(olderVersion.value.watermark).toEqual({ queryId: qid, queryVersion: 3, cursor: "4" });
    // Kills a mutant that stamps an older queryDigest instead of v3's digest.
    expect(olderVersion.value.queryDigest).toBe(expectedV3Digest);

    // Holding latest v3 at older cursor 2: viewAt(v3, "2") excludes D1 (cursor 3), whereas viewAt(v3, latest="4") and seen both include D1.
    const olderCursorOnV3 = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 3, cursor: "2" } });
    // Kills a mutant that rejects latest queryVersion paired with an older valid cursor.
    expect(olderCursorOnV3.ok).toBe(true);
    if (!olderCursorOnV3.ok) return;
    // Kills a mutant that replaces held.cursor with latest cursor or uses seen.get(slot) instead of viewAt(held.queryVersion, held.cursor).
    expect(olderCursorOnV3.value.items.map((item) => item.digest)).toEqual([decisionDigest]);
    // Kills a mutant that miscomputes byteLength for a cursor-only diff at v3.
    expect(olderCursorOnV3.value.byteLength).toBe(decisionBytes);
  });

  it("t4: reset gives mode full with the request word for word and every decision in scope", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const kA = key(sessionA);
    const kB = key(sessionB);
    const qid = expectedQueryIdOf(kA);
    const pinnedText = "retry policy and backoff";
    const d1 = "decision: adopt retry with backoff";
    const d2 = "decision: record backoff bounds";
    const expectedV2Digest = jcsSha256(expectedQueryFields(kA, 2, [`pinned:${qid}:v2`]));
    const expectedDigests = [textDigestOf(pinnedText), textDigestOf(d1), textDigestOf(d2)].sort();
    const expectedBytes =
      Buffer.byteLength(pinnedText, "utf8") +
      Buffer.byteLength(d1, "utf8") +
      Buffer.byteLength(d2, "utf8");

    await engine.noteSessionEvent(kA);
    await engine.notePinnedRequest(kA, pinnedText);
    await engine.noteDecision(kB, d1, sessionB);
    await engine.noteDecision(kB, d2, sessionB);
    const full = await engine.requestContext(kA, { reset: "compaction" });
    // Kills a mutant that rejects reset: "compaction".
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    // Kills a mutant that returns mode diff instead of full on reset.
    expect(full.value.mode).toBe("full");
    // Kills a mutant that drops the pinned request or any in-scope decision from a full reset view.
    expect(full.value.items.map((item) => item.digest).sort()).toEqual(expectedDigests);
    // Kills a mutant that miscomputes total UTF-8 byteLength across pinned request and decisions.
    expect(full.value.byteLength).toBe(expectedBytes);
    // Kills a mutant that emits duplicate or extra items on full reset.
    expect(full.value.items.length).toBe(3);
    // Kills a mutant that omits or corrupts watermark/queryDigest on full reset.
    expect(full.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "4" });
    // Kills a mutant that returns a wrong queryDigest on full reset.
    expect(full.value.queryDigest).toBe(expectedV2Digest);
  });

  it("t5: held and reset together, or neither, is INVALID_SCHEMA", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const k = key(sessionA);
    const qid = expectedQueryIdOf(k);
    const expectedWatermark = { queryId: qid, queryVersion: 1, cursor: "0" };

    await engine.noteSessionEvent(k);
    // Kills a mutant in lastWatermark that returns wrong queryId, version, or cursor after v1.
    expect(await engine.lastWatermark(sessionA)).toEqual(expectedWatermark);

    const both = await engine.requestContext(k, {
      held: expectedWatermark,
      reset: "compaction",
    } as unknown as Parameters<typeof engine.requestContext>[1]);
    // Kills a mutant that accepts held and reset together.
    expect(both.ok).toBe(false);
    if (both.ok) return;
    // Kills a mutant that returns a non-INVALID_SCHEMA error code when both held and reset are set.
    expect(both.error.code).toBe("INVALID_SCHEMA");

    const neither = await engine.requestContext(k, {});
    // Kills a mutant that accepts an empty request with neither held nor reset.
    expect(neither.ok).toBe(false);
    if (neither.ok) return;
    // Kills a mutant that returns a non-INVALID_SCHEMA error code when neither held nor reset is set.
    expect(neither.error.code).toBe("INVALID_SCHEMA");

    for (const bad of [
      null,
      undefined,
      { held: null },
      { held: expectedWatermark, reset: null },
      { reset: null },
      { reset: "bogus" },
      { reset: "COMPACTION" },
    ]) {
      const refused = await engine.requestContext(k, bad as unknown as Parameters<typeof engine.requestContext>[1]);
      // Kills a mutant that accepts null request, null held/reset, or an unknown reset literal.
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      // Kills a mutant that classifies bad request schemas under a code other than INVALID_SCHEMA.
      expect(refused.error.code).toBe("INVALID_SCHEMA");
    }
  });

  it("t6: an unreadable watermark is answered from engram's own record, and a session never seen gets the full view", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const kA = key(sessionA);
    const kB = key(sessionB);
    const otherKey = { ...kA, roleRef: "agent:other" };
    const qid = expectedQueryIdOf(kA);
    const otherQid = expectedQueryIdOf(otherKey);
    const pinnedText = "retry policy and backoff";
    const d1 = "decision: adopt retry with backoff";
    const d2 = "decision: enforce backoff cap";
    const expectedV2Digest = jcsSha256(expectedQueryFields(kA, 2, [`pinned:${qid}:v2`]));
    const pinnedDigest = textDigestOf(pinnedText);
    const d1Digest = textDigestOf(d1);
    const d2Digest = textDigestOf(d2);
    const d1Bytes = Buffer.byteLength(d1, "utf8");
    const d2Bytes = Buffer.byteLength(d2, "utf8");

    await engine.noteSessionEvent(kA);
    await engine.notePinnedRequest(kA, pinnedText);
    const base = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "0" } });
    // Kills a mutant that fails the initial full delivery establishing sessionA's seen record.
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    await engine.noteDecision(kB, d1, sessionB);

    // Unknown version 999 and cursor ahead of journal: unreadable -> falls back to seen ({p2}) and delivers [d1].
    const fallback = await engine.requestContext(kA, {
      held: { queryId: qid, queryVersion: 999, cursor: "999999999" },
    });
    // Kills a mutant that returns an error instead of falling back to engram's own record on unreadable watermark.
    expect(fallback.ok).toBe(true);
    if (!fallback.ok) return;
    // Kills a mutant that treats an unreadable watermark as a reset (mode full).
    expect(fallback.value.mode).toBe("diff");
    // Kills a mutant that deletes readable() (viewAt(999, 999999999) would drop d1 and re-send pinnedText).
    expect(fallback.value.items.map((item) => item.digest)).toEqual([d1Digest]);
    // Kills a mutant that miscomputes byteLength on unreadable-watermark fallback.
    expect(fallback.value.byteLength).toBe(d1Bytes);
    // Kills a mutant that echoes the unreadable watermark (version 999 / cursor 999999999) back to the caller.
    expect(fallback.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "3" });

    // Valid queryId and valid queryVersion 2, ONLY cursor ahead of journal while d2 is not yet in seen.
    await engine.noteDecision(kB, d2, sessionB);
    const futureCursorOnly = await engine.requestContext(kA, {
      held: { queryId: qid, queryVersion: 2, cursor: "999999999" },
    });
    // Kills a mutant that errors on a cursor-ahead-of-journal watermark.
    expect(futureCursorOnly.ok).toBe(true);
    if (!futureCursorOnly.ok) return;
    // Kills a mutant that turns a future-cursor watermark into a full reset.
    expect(futureCursorOnly.value.mode).toBe("diff");
    // Kills a mutant that deletes readable() or deletes its BigInt(held.cursor) <= BigInt(cursor) guard (which would hide unseen d2).
    expect(futureCursorOnly.value.items.map((item) => item.digest)).toEqual([d2Digest]);
    // Kills a mutant that miscomputes byteLength on future-cursor fallback.
    expect(futureCursorOnly.value.byteLength).toBe(d2Bytes);
    // Kills a mutant that echoes the future cursor 999999999 instead of actual journal cursor 4.
    expect(futureCursorOnly.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "4" });

    // Create a second key so otherQid exists in queries (versionsOf(otherQid).length > 0), advancing cursor to 5.
    await engine.noteSessionEvent(otherKey);
    const atDelivered = await engine.requestContext(kA, { held: { queryId: qid, queryVersion: 2, cursor: "4" } });
    // Kills a mutant that fails when held cursor is valid and caught up on key kA.
    expect(atDelivered.ok).toBe(true);
    if (!atDelivered.ok) return;
    // Kills a mutant that re-delivers items already held at cursor 4.
    expect(atDelivered.value.items).toEqual([]);

    // Every single failure clause of readable() isolated while seen already holds {p2, d1, d2}:
    // - foreign existing queryId (kills deleting held.queryId !== head.queryId)
    // - unknown queryId (kills deleting vs.length === 0)
    // - out-of-range / non-integer queryVersion with valid cursor 5 (kills deleting queryVersion checks)
    // - non-canonical cursor with valid queryId & queryVersion 2 (kills deleting isCanonicalCursor)
    for (const badHeld of [
      { queryId: otherQid, queryVersion: 1, cursor: "2" },
      { queryId: "query_unknown_0000", queryVersion: 2, cursor: "2" },
      { queryId: qid, queryVersion: 0, cursor: "5" },
      { queryId: qid, queryVersion: 3, cursor: "5" },
      { queryId: qid, queryVersion: Number.NaN, cursor: "5" },
      { queryId: qid, queryVersion: 1.5, cursor: "5" },
      { queryId: qid, queryVersion: 2, cursor: "-1" },
      { queryId: qid, queryVersion: 2, cursor: "" },
      { queryId: qid, queryVersion: 2, cursor: "01" },
      { queryId: qid, queryVersion: 2, cursor: "not-a-cursor" },
    ]) {
      const retry = await engine.requestContext(kA, { held: badHeld });
      // Kills a mutant that throws or refuses an unreadable watermark instead of answering from seen.
      expect(retry.ok).toBe(true);
      if (!retry.ok) return;
      // Kills a mutant that escalates an unreadable watermark to mode full.
      expect(retry.value.mode).toBe("diff");
      // Kills a mutant that deletes readable() or any of its guards (would call viewAt with bogus args and re-deliver items).
      expect(retry.value.items).toEqual([]);
      // Kills a mutant that delivers non-zero bytes on an unreadable watermark for an up-to-date session.
      expect(retry.value.byteLength).toBe(0);
      // Kills a mutant that echoes an unreadable watermark instead of the engine's current watermark.
      expect(retry.value.watermark).toEqual({ queryId: qid, queryVersion: 2, cursor: "5" });
    }

    const fresh = await engine.requestContext(key("session-never-seen"), {
      held: { queryId: qid, queryVersion: 2, cursor: "2" },
    });
    // Kills a mutant that refuses a session never seen before.
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    // Kills a mutant that answers an unseen session with mode diff instead of full.
    expect(fresh.value.mode).toBe("full");
    // Kills a mutant that omits items from an unseen session's initial full view.
    expect(fresh.value.items.map((item) => item.digest).sort()).toEqual([pinnedDigest, d1Digest, d2Digest].sort());
    // Kills a mutant that miscomputes byteLength on an unseen session's initial full view.
    expect(fresh.value.byteLength).toBe(Buffer.byteLength(pinnedText, "utf8") + d1Bytes + d2Bytes);
    // Kills a mutant that stamps a wrong queryDigest on an unseen session's full view.
    expect(fresh.value.queryDigest).toBe(expectedV2Digest);
  });

  it("t7: an L0 failure fails closed: the note is rejected and no version is committed", async () => {
    const bad = engineFor(failingStore());
    const kA = key(sessionA);
    const kB = key(sessionB);
    const qid = expectedQueryIdOf(kA);
    const expectedV1 = { ...expectedQueryFields(kA, 1, []), digest: jcsSha256(expectedQueryFields(kA, 1, [])) };

    // Kills a mutant that swallows L0 errors on noteSessionEvent.
    await expect(bad.noteSessionEvent(kA)).rejects.toThrow();
    // Kills a mutant that swallows L0 errors on notePinnedRequest.
    await expect(bad.notePinnedRequest(kA, "retry policy and backoff")).rejects.toThrow();
    // Kills a mutant that swallows L0 errors on noteDecision.
    await expect(bad.noteDecision(kB, "decision: adopt retry with backoff", sessionB)).rejects.toThrow();
    // Kills a mutant that commits v1 in memory before L0 persistence succeeds.
    expect(bad.getQuery(qid, 1)).toBeUndefined();
    // Kills a mutant that updates keyOfSession or watermark before L0 persistence succeeds.
    expect(await bad.lastWatermark(sessionA)).toEqual({ queryId: "query_pending", queryVersion: 1, cursor: "0" });

    const { store } = memoryStore();
    const good = engineFor(store);
    const v1 = await good.noteSessionEvent(kA);
    // Kills a mutant that shares mutable state across engine instances after another engine fails.
    expect(v1).toEqual(expectedV1);
  });

  it("t8: a second pinned request accumulates: version 3 keeps both requests and the full view carries both", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const k = key(sessionA);
    const qid = expectedQueryIdOf(k);
    const p1 = "retry policy and backoff";
    const p2 = "and record the bounds too";
    const v3Fields = expectedQueryFields(k, 3, [`pinned:${qid}:v2`, `pinned:${qid}:v3`]);
    const expectedV3Digest = jcsSha256(v3Fields);

    await engine.noteSessionEvent(k);
    await engine.notePinnedRequest(k, p1);
    const v3 = await engine.notePinnedRequest(k, p2);
    // Kills a mutant that overwrites instead of appending pinnedEventRecordIds or fails to bump to v3 with JCS digest.
    expect(v3).toEqual({ ...v3Fields, digest: expectedV3Digest });

    const full = await engine.requestContext(k, { reset: "compaction" });
    // Kills a mutant that rejects full reset at v3.
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    // Kills a mutant that drops either pinned request from v3's full view.
    expect(full.value.items.map((item) => item.digest).sort()).toEqual([textDigestOf(p1), textDigestOf(p2)].sort());
    // Kills a mutant that sums only the latest pinned request's bytes.
    expect(full.value.byteLength).toBe(Buffer.byteLength(p1, "utf8") + Buffer.byteLength(p2, "utf8"));
    // Kills a mutant that stamps a stale watermark or queryDigest at v3.
    expect(full.value.watermark).toEqual({ queryId: qid, queryVersion: 3, cursor: "3" });
  });

  it("t9: state never bleeds across keys: an unknown session holds the pending watermark and a cross-key full view changes no diff", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const kA = key(sessionA);
    const kOther = { ...kA, roleRef: "agent:other" };
    const qidA = expectedQueryIdOf(kA);
    const qidOther = expectedQueryIdOf(kOther);

    await engine.noteSessionEvent(kA);
    // Kills a mutant that returns an existing key's watermark for an unknown session.
    expect(await engine.lastWatermark("session-ghost")).toEqual({ queryId: "query_pending", queryVersion: 1, cursor: "0" });

    await engine.notePinnedRequest(kA, "alpha pinned");
    const fullA = await engine.requestContext(kA, { reset: "compaction" });
    // Kills a mutant that fails full delivery for key A.
    expect(fullA.ok).toBe(true);
    if (!fullA.ok) return;
    // Kills a mutant that drops key A's pinned item.
    expect(fullA.value.items.map((item) => item.digest)).toEqual([textDigestOf("alpha pinned")]);
    // Kills a mutant that assigns a wrong queryId on key A's watermark.
    expect(fullA.value.watermark).toEqual({ queryId: qidA, queryVersion: 2, cursor: "2" });

    await engine.noteSessionEvent(kOther);
    await engine.notePinnedRequest(kOther, "beta pinned");
    const fullB = await engine.requestContext(kOther, { reset: "compaction" });
    // Kills a mutant that fails full delivery for key B.
    expect(fullB.ok).toBe(true);
    if (!fullB.ok) return;
    // Kills a mutant that bleeds key A's pinned item into key B's full view.
    expect(fullB.value.items.map((item) => item.digest)).toEqual([textDigestOf("beta pinned")]);
    // Kills a mutant that collides key B's queryId with key A's queryId.
    expect(fullB.value.watermark).toEqual({ queryId: qidOther, queryVersion: 2, cursor: "4" });

    const retryA = await engine.requestContext(kA, {
      held: { queryId: qidA, queryVersion: 999, cursor: "999" },
    });
    // Kills a mutant that errors on key A's unreadable watermark after key B was read.
    expect(retryA.ok).toBe(true);
    if (!retryA.ok) return;
    // Kills a mutant that lets key B's full view overwrite key A's seen record (slot collision across keys).
    expect(retryA.value.items).toEqual([]);
    // Kills a mutant that delivers non-zero bytes on key A after a cross-key full view.
    expect(retryA.value.byteLength).toBe(0);
  });

  it("t10: key fields never collide on a delimiter: a pipe in one field is not a field boundary", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const k1 = { tenantId: "a|b", workspaceId: "c", derivedWorktreeId, sessionId: "s-delim" };
    const k2 = { tenantId: "a", workspaceId: "b|c", derivedWorktreeId, sessionId: "s-delim" };
    const kR = { tenantId: "t", workspaceId: "w", derivedWorktreeId, roleRef: "session:s2", sessionId: "s-any" };
    const kS = { tenantId: "t", workspaceId: "w", derivedWorktreeId, sessionId: "s2" };
    const id1 = expectedQueryIdOf(k1);
    const id2 = expectedQueryIdOf(k2);
    const idR = expectedQueryIdOf(kR);
    const idS = expectedQueryIdOf(kS);

    const q1 = await engine.noteSessionEvent(k1);
    const q2 = await engine.noteSessionEvent(k2);
    // Kills a mutant that derives k1's queryId with delimiter concatenation instead of canonical JCS.
    expect(q1.queryId).toBe(id1);
    // Kills a mutant that derives k2's queryId with delimiter concatenation instead of canonical JCS.
    expect(q2.queryId).toBe(id2);
    // Kills a mutant that maps (a|b, c) and (a, b|c) to the same key.
    expect(q1.queryId).not.toBe(q2.queryId);

    const qR = await engine.noteSessionEvent(kR);
    const qS = await engine.noteSessionEvent(kS);
    // Kills a mutant that omits kind: "role" when deriving a role-scoped queryId.
    expect(qR.queryId).toBe(idR);
    // Kills a mutant that omits kind: "session" when deriving a session-scoped queryId.
    expect(qS.queryId).toBe(idS);
    // Kills a mutant that collides roleRef "session:s2" with sessionId "s2".
    expect(qR.queryId).not.toBe(qS.queryId);
  });

  it("t11: non-object held, array request and nested null fields are rejected as INVALID_SCHEMA", async () => {
    const { store } = memoryStore();
    const engine = engineFor(store);
    const k = key(sessionA);
    const qid = expectedQueryIdOf(k);
    const validHeld = { queryId: qid, queryVersion: 1, cursor: "1" };

    await engine.noteSessionEvent(k);

    const invalidRequests: unknown[] = [
      [],
      Object.assign([], { reset: "compaction" }),
      Object.assign([], { held: validHeld }),
      { held: "not-an-object" },
      { held: 42 },
      { held: true },
      { held: [] },
      { held: new Date(0) },
      { held: { queryId: null, queryVersion: 1, cursor: "1" } },
      { held: { queryId: qid, queryVersion: null, cursor: "1" } },
      { held: { queryId: qid, queryVersion: 1, cursor: null } },
      { reset: "compaction", hostSignal: null },
      { reset: "compaction", loop: null },
      { reset: "compaction", loop: { objectiveLoopId: null, trackScope: [] } },
      { reset: "compaction", loop: { objectiveLoopId: "loop-1", trackScope: null } },
      { reset: "compaction", loop: { objectiveLoopId: "loop-1", trackScope: [null] } },
      {
        reset: "compaction",
        loop: {
          objectiveLoopId: "loop-1",
          trackScope: [{ repoKey: "r", workspace: "w", aggregateId: "a", role: "dev", aggregateKind: "task", baselineCommit: null }],
        },
      },
    ];

    for (const bad of invalidRequests) {
      const refused = await engine.requestContext(k, bad as Parameters<typeof engine.requestContext>[1]);
      // Kills a mutant that accepts array requests, non-object held values, or nested null fields.
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      // Kills a mutant that maps rejected non-object/array/nested-null requests to an error code other than INVALID_SCHEMA.
      expect(refused.error.code).toBe("INVALID_SCHEMA");
      // Kills a mutant that marks an INVALID_SCHEMA refusal as retryable.
      expect(refused.error.retryable).toBe(false);
    }

    const validWithLoop = await engine.requestContext(k, {
      reset: "compaction",
      hostSignal: "claude-compact",
      loop: {
        objectiveLoopId: "loop-1",
        trackScope: [{ repoKey: "r", workspace: "w", aggregateId: "a", role: "dev", aggregateKind: "task" }],
      },
    });
    // Kills a mutant whose null/object check over-rejects valid optional hostSignal and loop fields.
    expect(validWithLoop.ok).toBe(true);
    if (!validWithLoop.ok) return;
    // Kills a mutant that fails to deliver full mode when valid optional request fields are present.
    expect(validWithLoop.value.mode).toBe("full");
  });

  it("t12: concurrent note calls on the same key are serialised so both writes are kept", async () => {
    const { store, commits } = memoryStore();
    const engine = engineFor(store);
    const kA = key(sessionA);
    const kB = key(sessionB);
    const qid = expectedQueryIdOf(kA);
    const p1 = "first concurrent request";
    const p2 = "second concurrent request";
    const d1 = "first concurrent decision";
    const d2 = "second concurrent decision";
    const expectedV2 = { ...expectedQueryFields(kA, 2, [`pinned:${qid}:v2`]), digest: jcsSha256(expectedQueryFields(kA, 2, [`pinned:${qid}:v2`])) };
    const expectedV3 = {
      ...expectedQueryFields(kA, 3, [`pinned:${qid}:v2`, `pinned:${qid}:v3`]),
      digest: jcsSha256(expectedQueryFields(kA, 3, [`pinned:${qid}:v2`, `pinned:${qid}:v3`])),
    };

    const [qFirst, qSecond] = await Promise.all([
      engine.notePinnedRequest(kA, p1),
      engine.notePinnedRequest(kA, p2),
    ]);
    // Kills a mutant without per-key serialisation where concurrent notePinnedRequest calls both create v2 and lose the first write.
    expect(qFirst).toEqual(expectedV2);
    // Kills a mutant without per-key serialisation where the second concurrent notePinnedRequest overwrites v2 instead of accumulating v3.
    expect(qSecond).toEqual(expectedV3);

    const [decFirst, decSecond] = await Promise.all([
      engine.noteDecision(kB, d1, sessionB),
      engine.noteDecision(kB, d2, sessionB),
    ]);
    // Kills a mutant without per-key serialisation where concurrent noteDecision calls collide on cursor or drop the first list.
    expect(decFirst).toEqual({ cursor: "4" });
    // Kills a mutant without per-key serialisation where the second concurrent noteDecision fails to advance to cursor 5.
    expect(decSecond).toEqual({ cursor: "5" });

    // Kills a mutant that skips an L0 commit under concurrent note* calls (v1 + v2 + v3 + d1 + d2 = 5 commits).
    expect(commits.length).toBe(5);

    const full = await engine.requestContext(kA, { reset: "compaction" });
    // Kills a mutant that corrupts engine state after concurrent writes.
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    // Kills a mutant that loses either concurrent pinned request or either concurrent decision from the committed view.
    expect(full.value.items.map((item) => item.digest).sort()).toEqual(
      [textDigestOf(p1), textDigestOf(p2), textDigestOf(d1), textDigestOf(d2)].sort(),
    );
    // Kills a mutant that drops bytes from any of the four concurrently noted items.
    expect(full.value.byteLength).toBe(
      Buffer.byteLength(p1, "utf8") + Buffer.byteLength(p2, "utf8") + Buffer.byteLength(d1, "utf8") + Buffer.byteLength(d2, "utf8"),
    );
  });

  it("t13: a plain-object held lacking { queryId: string, queryVersion: number, cursor: string } is rejected as INVALID_SCHEMA", async () => {
    const k = key(sessionA);
    const qid = expectedQueryIdOf(k);
    const nullProtoEmpty = Object.create(null) as Record<string, unknown>;
    const malformedHeldValues: unknown[] = [
      {},
      nullProtoEmpty,
      { queryVersion: 1, cursor: "1" },
      { queryId: qid, cursor: "1" },
      { queryId: qid, queryVersion: 1 },
      { queryId: 123, queryVersion: 1, cursor: "1" },
      { queryId: qid, queryVersion: "1", cursor: "1" },
      { queryId: qid, queryVersion: 1, cursor: 0 },
      { queryId: 123, queryVersion: "1", cursor: 0 },
      { queryId: undefined, queryVersion: 1, cursor: "1" },
      { queryId: qid, queryVersion: undefined, cursor: "1" },
      { queryId: qid, queryVersion: 1, cursor: undefined },
    ];

    const { store: freshStore, commits: freshCommits } = memoryStore();
    const freshEngine = engineFor(freshStore);
    for (const held of malformedHeldValues) {
      const refused = await freshEngine.requestContext(k, { held } as unknown as Parameters<typeof freshEngine.requestContext>[1]);
      // Kills a mutant that accepts a plain-object held missing or mistyping queryId, queryVersion, or cursor on a fresh key.
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      // Kills a mutant that returns an error code other than INVALID_SCHEMA for malformed plain-object held values.
      expect(refused.error.code).toBe("INVALID_SCHEMA");
      // Kills a mutant that marks malformed held INVALID_SCHEMA refusals as retryable.
      expect(refused.error.retryable).toBe(false);
    }
    // Kills a mutant that validates held fields after calling ensureQuery(key) and persisting a v1 query to L0.
    expect(freshCommits.length).toBe(0);

    const { store } = memoryStore();
    const engine = engineFor(store);
    await engine.noteSessionEvent(k);
    const seeded = await engine.requestContext(k, { reset: "compaction" });
    // Kills a mutant that fails to seed seen state before testing malformed plain-object held rejection.
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;

    for (const held of malformedHeldValues) {
      const refused = await engine.requestContext(k, { held } as unknown as Parameters<typeof engine.requestContext>[1]);
      // Kills a mutant that lets malformed plain-object held fall through to readable() === false and return ok: true from seen.
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      // Kills a mutant that classifies malformed held on a seeded session under a code other than INVALID_SCHEMA.
      expect(refused.error.code).toBe("INVALID_SCHEMA");
      // Kills a mutant that marks a seeded-session INVALID_SCHEMA refusal as retryable.
      expect(refused.error.retryable).toBe(false);
    }

    const valid = await engine.requestContext(k, { held: { queryId: qid, queryVersion: 1, cursor: "1" } });
    // Kills a mutant whose held field check over-rejects a valid { queryId: string, queryVersion: number, cursor: string } watermark.
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    // Kills a mutant that alters mode or watermark when a valid plain-object held is accepted.
    expect(valid.value.mode).toBe("diff");
    // Kills a mutant that returns wrong items on a valid up-to-date held watermark.
    expect(valid.value.items).toEqual([]);
    // Kills a mutant that returns a wrong watermark after validating held field types.
    expect(valid.value.watermark).toEqual({ queryId: qid, queryVersion: 1, cursor: "1" });
  });

  it("t14: the shared cursor only moves forward across concurrent calls on distinct keys", async () => {
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };

    const alphaV1Entered = deferred();
    const alphaV1Release = deferred();
    const alphaDecEntered = deferred();
    const alphaDecRelease = deferred();

    const scriptedSlots = [
      { cursor: "9", entered: alphaV1Entered, release: alphaV1Release.promise },
      { cursor: "10", entered: deferred(), release: Promise.resolve() },
      { cursor: "99", entered: alphaDecEntered, release: alphaDecRelease.promise },
      { cursor: "100", entered: deferred(), release: Promise.resolve() },
    ];
    let slotIndex = 0;

    const store: SessionFrontStoreV1 = {
      async transact(_scope, apply) {
        const slot = scriptedSlots[slotIndex++];
        if (slot === undefined) throw new Error("unexpected extra transact call");
        const outcome = await apply({
          cursor: slot.cursor,
          async readReplay() {
            return undefined;
          },
          async readEvent() {
            return undefined;
          },
          async write() {},
        } as unknown as Parameters<Parameters<typeof store.transact>[1]>[0]);
        slot.entered.resolve();
        await slot.release;
        return outcome;
      },
    };

    const engine = engineFor(store);
    const kAlpha: TestKey = { tenantId, workspaceId, derivedWorktreeId, roleRef: "agent:alpha", sessionId: "session-alpha" };
    const kBeta: TestKey = { tenantId, workspaceId, derivedWorktreeId, roleRef: "agent:beta", sessionId: "session-beta" };
    const qidAlpha = expectedQueryIdOf(kAlpha);
    const qidBeta = expectedQueryIdOf(kBeta);

    // Phase 1: persistQuery resolves out of order across distinct keys ("10" commits before "9" resumes).
    const pAlphaV1 = engine.noteSessionEvent(kAlpha);
    await alphaV1Entered.promise;
    const pBetaV1 = engine.noteSessionEvent(kBeta);
    await pBetaV1;
    alphaV1Release.resolve();
    await pAlphaV1;

    const initBeta = await engine.requestContext(kBeta, { reset: "compaction" });
    // Kills a mutant that fails initial full delivery for kBeta after out-of-order concurrent persistQuery calls.
    expect(initBeta.ok).toBe(true);
    if (!initBeta.ok) return;
    // Kills a mutant that omits the BigInt monotonic guard on persistQuery (regressing cursor from "10" to "9") or uses string comparison ("9" > "10").
    expect(initBeta.value.watermark).toEqual({ queryId: qidBeta, queryVersion: 1, cursor: "10" });

    const initAlpha = await engine.requestContext(kAlpha, { reset: "compaction" });
    // Kills a mutant that fails initial full delivery for kAlpha after out-of-order concurrent persistQuery calls.
    expect(initAlpha.ok).toBe(true);
    if (!initAlpha.ok) return;
    // Kills a mutant that regresses the shared watermark cursor for kAlpha after kBeta advanced it to "10".
    expect(initAlpha.value.watermark).toEqual({ queryId: qidAlpha, queryVersion: 1, cursor: "10" });

    // Phase 2: noteDecision resolves out of order across distinct keys ("100" commits before "99" resumes).
    const dAlpha = "decision on alpha at cursor 99";
    const dBeta = "decision on beta at cursor 100";
    const dAlphaDigest = textDigestOf(dAlpha);
    const dBetaDigest = textDigestOf(dBeta);
    const dAlphaBytes = Buffer.byteLength(dAlpha, "utf8");
    const dBetaBytes = Buffer.byteLength(dBeta, "utf8");

    const pDecAlpha = engine.noteDecision(kAlpha, dAlpha, "peer-alpha");
    await alphaDecEntered.promise;
    const pDecBeta = engine.noteDecision(kBeta, dBeta, "peer-beta");
    const decBeta = await pDecBeta;
    alphaDecRelease.resolve();
    const decAlpha = await pDecAlpha;

    // Kills a mutant that returns the shared high-water cursor instead of each decision's own committed cursor.
    expect(decAlpha).toEqual({ cursor: "99" });
    // Kills a mutant that fails to return cursor "100" for kBeta's committed decision.
    expect(decBeta).toEqual({ cursor: "100" });

    const diffBeta = await engine.requestContext(kBeta, { held: { queryId: qidBeta, queryVersion: 1, cursor: "10" } });
    // Kills a mutant that rejects diff delivery on kBeta after out-of-order concurrent noteDecision calls.
    expect(diffBeta.ok).toBe(true);
    if (!diffBeta.ok) return;
    // Kills a mutant that switches mode away from diff on kBeta.
    expect(diffBeta.value.mode).toBe("diff");
    // Kills a mutant that omits the BigInt monotonic guard on noteDecision (cursor regresses to "99", causing viewAt to omit dBeta at "100") or uses string comparison ("99" > "100").
    expect(diffBeta.value.items.map((item) => item.digest)).toEqual([dBetaDigest]);
    // Kills a mutant that drops dBeta's bytes when shared cursor regresses below "100".
    expect(diffBeta.value.byteLength).toBe(dBetaBytes);
    // Kills a mutant that regresses kBeta's returned watermark cursor from "100" to "99".
    expect(diffBeta.value.watermark).toEqual({ queryId: qidBeta, queryVersion: 1, cursor: "100" });

    const replayBetaFrom99 = await engine.requestContext(kBeta, { held: { queryId: qidBeta, queryVersion: 1, cursor: "99" } });
    // Kills a mutant that rejects valid held cursor "99" against shared cursor "100".
    expect(replayBetaFrom99.ok).toBe(true);
    if (!replayBetaFrom99.ok) return;
    // Kills a mutant where shared cursor regressed to "99" (making viewAt(v1, "99") match nowView and delivering [] instead of dBeta).
    expect(replayBetaFrom99.value.items.map((item) => item.digest)).toEqual([dBetaDigest]);

    const heldBetaAt100 = await engine.requestContext(kBeta, { held: { queryId: qidBeta, queryVersion: 1, cursor: "100" } });
    // Kills a mutant that refuses held cursor "100" after out-of-order completion.
    expect(heldBetaAt100.ok).toBe(true);
    if (!heldBetaAt100.ok) return;
    // Kills a mutant that re-delivers dBeta when caller holds cursor "100".
    expect(heldBetaAt100.value.items).toEqual([]);
    // Kills a mutant that stamps a regressed watermark cursor instead of "100".
    expect(heldBetaAt100.value.watermark).toEqual({ queryId: qidBeta, queryVersion: 1, cursor: "100" });

    const diffAlpha = await engine.requestContext(kAlpha, { held: { queryId: qidAlpha, queryVersion: 1, cursor: "10" } });
    // Kills a mutant that rejects diff delivery on kAlpha after out-of-order concurrent noteDecision calls.
    expect(diffAlpha.ok).toBe(true);
    if (!diffAlpha.ok) return;
    // Kills a mutant that drops kAlpha's decision committed at cursor "99" when keeping shared cursor at "100".
    expect(diffAlpha.value.items.map((item) => item.digest)).toEqual([dAlphaDigest]);
    // Kills a mutant that miscomputes byteLength for kAlpha's decision at cursor "99".
    expect(diffAlpha.value.byteLength).toBe(dAlphaBytes);
    // Kills a mutant that stamps cursor "99" instead of the monotonic shared cursor "100" on kAlpha's delivery.
    expect(diffAlpha.value.watermark).toEqual({ queryId: qidAlpha, queryVersion: 1, cursor: "100" });
  });
});
