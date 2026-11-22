import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  SessionContextQueryV1,
  SessionFrontStoreV1,
  Sha256Digest,
} from "../src/session-front-contracts.js";
import { createSessionContextEngineV1 } from "../src/session-context/engine.js";
import {
  DEFAULT_BYTES_PER_TOKEN,
  DEFAULT_VIEW_MAX_TOKENS,
  diffSessionContextViews,
  evaluateSessionContextView,
  resolveViewMaxTokens,
  type SessionContextRulesProviderV1,
  type SessionContextSliceV1,
  type SessionContextViewEntryV1,
} from "../src/session-context/view.js";

const TENANT_ID = "tenant-sj1c";
const WORKSPACE_ID = "workspace-sj1c";
const WORKTREE_ID = `wt:${"a".repeat(64)}`;
const ROLE_REF = "agent:builder";
const ACTOR_REF = "actor_pseudo:11223344556677889900aabbccddeeff";
const CLONE_ID = "clone:sj1c-local";
const FIXED_NOW = () => "2026-11-22T02:00:00.000Z";
const SLICE_ORDER: readonly SessionContextSliceV1[] = [
  "track",
  "git",
  "architecture",
  "rules",
  "memory",
];

function sha256Text(text: string): Sha256Digest {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` as Sha256Digest;
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function expectedDefaultTokens(bytes: number): number {
  return bytes === 0 ? 0 : Math.ceil(bytes / 3);
}

function expectedDecisionPointer(omitted: number): string {
  return `${omitted} more decisions in scope: search with \`session_context: "history"\``;
}

function expectedOmittedPointer(omitted: number): string {
  return `${omitted} more items did not fit: search with \`session_context: "history"\``;
}

function expectedLine(ref: string, text: string, mode: "text" | "reference" | "withdrawn" = "text"): string {
  if (mode === "withdrawn") return `${ref}: [withdrawn] (${sha256Text(text)})`;
  if (mode === "reference") return `${ref}: [reference] (${sha256Text(text)})`;
  return `${ref}: ${text}`;
}

function expectedPayloads(
  entries: readonly { readonly slice: SessionContextSliceV1; readonly line: string }[],
): {
  readonly readySlices: readonly SessionContextSliceV1[];
  readonly readySlicePayloads: Partial<Record<SessionContextSliceV1, string>>;
  readonly byteLength: number;
  readonly tokenCount: number;
} {
  const grouped = new Map<SessionContextSliceV1, string[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.slice) ?? [];
    bucket.push(entry.line);
    grouped.set(entry.slice, bucket);
  }
  const readySlices: SessionContextSliceV1[] = [];
  const readySlicePayloads: Partial<Record<SessionContextSliceV1, string>> = {};
  let byteLength = 0;
  for (const slice of SLICE_ORDER) {
    const lines = grouped.get(slice);
    if (lines !== undefined && lines.length > 0) {
      const text = lines.join("\n");
      readySlices.push(slice);
      readySlicePayloads[slice] = text;
      byteLength += utf8Bytes(text);
    }
  }
  return {
    readySlices,
    readySlicePayloads,
    byteLength,
    tokenCount: expectedDefaultTokens(byteLength),
  };
}

function makeQuery(overrides: Partial<SessionContextQueryV1> = {}): SessionContextQueryV1 {
  return {
    schemaVersion: "engram.session-context-query/v1",
    queryId: "query_sj1cfixture0001",
    version: 2,
    digest: sha256Text("query-fixture-v2"),
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    derivedWorktreeId: WORKTREE_ID,
    roleRef: ROLE_REF,
    trackScope: [],
    ontologies: [],
    pinnedEventRecordIds: ["pinned:req-1"],
    selectors: [],
    ...overrides,
  };
}

function memoryStore(): SessionFrontStoreV1 {
  let cursorSeq = 0;
  let tail = Promise.resolve();
  return {
    transact(_scope, apply) {
      const completion = tail.then(async () => {
        const nextCursor = String(cursorSeq + 1);
        const outcome = await apply({
          cursor: nextCursor,
          async readReplay() {
            return undefined;
          },
          async readEvent() {
            return undefined;
          },
          async write() {},
        } as unknown as Parameters<Parameters<SessionFrontStoreV1["transact"]>[1]>[0]);
        if (outcome.ok) cursorSeq += 1;
        return outcome;
      });
      tail = completion.then(
        () => undefined,
        () => undefined,
      );
      return completion;
    },
  };
}

describe("tests/session-context-view.test.ts", () => {
  it("t1: the six tiers come in order and give way in that order", () => {
    const pinnedText = "Passe la limite de tentatives a 5";
    const decOld = "decision-1: keep exponential backoff across every retry attempt with jitter and structured audit markers";
    const decMid = "decision-2: cap retry delay at 30s and keep circuit breaker state isolated per workspace tenant scope";
    const decNew = "decision-3: emit metric on final failure and preserve exact error codes across retries without dropping details";
    const trackText = "feature TRK-42 in_progress retry policy and bounded backoff implementation tracked across objective loop scope";
    const ruleText = "rule: builder role must keep zero Python and stay strictly inside the allowed file list for every commissioned lot";
    const sel1Text = "fact: src/retry.ts handles backoff retries and logs every terminal failure with structured diagnostics";
    const sel2Text = "check: retry.test.ts failed expected 3 got 5 while verifying exponential backoff limit under bounded retry ceiling";

    const query = makeQuery();
    const pinnedRequests: readonly SessionContextViewEntryV1[] = [
      { ref: "pinned:req-1", text: pinnedText },
    ];
    // Provided out of order (old, new, mid) to verify newest-first sorting by cursor.
    const decisions: readonly SessionContextViewEntryV1[] = [
      { ref: "dec:1", text: decOld, cursor: "10" },
      { ref: "dec:3", text: decNew, cursor: "30" },
      { ref: "dec:2", text: decMid, cursor: "20" },
    ];
    const trackItems: readonly SessionContextViewEntryV1[] = [
      { ref: "trk:42", text: trackText, slice: "track" },
    ];
    const rulesProvider: SessionContextRulesProviderV1 = () => [
      { ref: "rule:zero-py", text: ruleText, slice: "rules" },
    ];
    const selectorItems: readonly SessionContextViewEntryV1[] = [
      { ref: "sel:fact-1", text: sel1Text, slice: "memory", authoredBy: "shadow", authorModelRef: "openai:gpt-5-mini", sourceEventRecordIds: ["raw_1"] },
      { ref: "sel:check-1", text: sel2Text, slice: "git", authoredBy: "code", sourceEventRecordIds: ["raw_2"] },
    ];

    // Full budget: all five content tiers fit in exact order 1 -> 2 (newest first) -> 3 -> 4 -> 5, with no tier-6 pointer.
    const full = evaluateSessionContextView({
      query,
      cursor: "30",
      pinnedRequests,
      decisions,
      trackItems,
      rulesProvider,
      selectorItems,
      viewMaxTokens: 1_000,
    });
    const fullExpected = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:3", decNew) },
      { slice: "memory", line: expectedLine("dec:2", decMid) },
      { slice: "memory", line: expectedLine("dec:1", decOld) },
      { slice: "track", line: expectedLine("trk:42", trackText) },
      { slice: "rules", line: expectedLine("rule:zero-py", ruleText) },
      { slice: "memory", line: expectedLine("sel:fact-1", sel1Text) },
      { slice: "git", line: expectedLine("sel:check-1", sel2Text) },
    ]);

    // Kills a mutant that reorders tiers 1..5 or fails to sort tier 2 decisions newest-first by cursor.
    expect(full.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:3",
      "dec:2",
      "dec:1",
      "trk:42",
      "rule:zero-py",
      "sel:fact-1",
      "sel:check-1",
    ]);
    // Kills a mutant that omits slices, changes canonical slice order, or misformats ref-prefixed slice payloads.
    expect(full.readySlices).toEqual(fullExpected.readySlices);
    // Kills a mutant that breaks line prefixing (`ref: text`) or groups lines into the wrong slice.
    expect(full.readySlicePayloads).toEqual(fullExpected.readySlicePayloads);
    // Kills a mutant that miscomputes UTF-8 byteLength across rendered slice payloads.
    expect(full.byteLength).toBe(fullExpected.byteLength);
    // Kills a mutant that miscomputes default 3-bytes-per-token count on full view.
    expect(full.tokenCount).toBe(fullExpected.tokenCount);
    // Kills a mutant that emits overflow when the full view fits within viewMaxTokens.
    expect(Object.hasOwn(full, "overflow")).toBe(false);
    // Kills a mutant that reports omitted items when all items fit.
    expect(full.omittedDecisionCount).toBe(0);
    // Kills a mutant that reports omitted non-decision items when all items fit.
    expect(full.omittedItemCount).toBe(0);

    // Step A: tighten ceiling so tier 5 gives way FIRST (keeping sel:fact-1, dropping sel:check-1, emitting tier-6 pointer).
    const tier5Partial = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:3", decNew) },
      { slice: "memory", line: expectedLine("dec:2", decMid) },
      { slice: "memory", line: expectedLine("dec:1", decOld) },
      { slice: "track", line: expectedLine("trk:42", trackText) },
      { slice: "rules", line: expectedLine("rule:zero-py", ruleText) },
      { slice: "memory", line: expectedLine("sel:fact-1", sel1Text) },
      { slice: "memory", line: expectedLine("pointer:omitted:1", expectedOmittedPointer(1)) },
    ]);
    // Kills a mutant in test fixture sizing (confirms partial tier-5 + pointer is strictly tighter than full view).
    expect(tier5Partial.tokenCount).toBeLessThan(fullExpected.tokenCount);
    const shed5 = evaluateSessionContextView({
      query,
      cursor: "30",
      pinnedRequests,
      decisions,
      trackItems,
      rulesProvider,
      selectorItems,
      viewMaxTokens: tier5Partial.tokenCount,
    });
    // Kills a mutant that sheds tier 4/3/2 before tier 5, or places tier-6 pointer before tier 5.
    expect(shed5.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:3",
      "dec:2",
      "dec:1",
      "trk:42",
      "rule:zero-py",
      "sel:fact-1",
      "pointer:omitted:1",
    ]);
    // Kills a mutant that lets a partial tier-5 view exceed viewMaxTokens.
    expect(shed5.tokenCount).toBe(tier5Partial.tokenCount);
    // Kills a mutant that miscounts omitted non-decision items when tier 5 sheds one item.
    expect(shed5.omittedItemCount).toBe(1);

    // Step B: tighten ceiling so ALL of tier 5 and tier 4 give way, while tiers 1, 2, 3 remain intact + tier-6 pointer.
    const tier123AndPtr = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:3", decNew) },
      { slice: "memory", line: expectedLine("dec:2", decMid) },
      { slice: "memory", line: expectedLine("dec:1", decOld) },
      { slice: "track", line: expectedLine("trk:42", trackText) },
      { slice: "memory", line: expectedLine("pointer:omitted:3", expectedOmittedPointer(3)) },
    ]);
    const shed4 = evaluateSessionContextView({
      query,
      cursor: "30",
      pinnedRequests,
      decisions,
      trackItems,
      rulesProvider,
      selectorItems,
      viewMaxTokens: tier123AndPtr.tokenCount,
    });
    // Kills a mutant that sheds tier 3 before tier 4, or keeps tier 5 when tier 4 had to give way.
    expect(shed4.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:3",
      "dec:2",
      "dec:1",
      "trk:42",
      "pointer:omitted:3",
    ]);
    // Kills a mutant that breaches ceiling after shedding tiers 5 and 4.
    expect(shed4.tokenCount).toBe(tier123AndPtr.tokenCount);
    // Kills a mutant that miscounts omitted items across tiers 4 and 5 (1 rule + 2 selector items = 3).
    expect(shed4.omittedItemCount).toBe(3);

    // Step C: tighten ceiling so tier 3 ALSO gives way, while tiers 1 and 2 stay intact + tier-6 pointer.
    const tier12AndPtr = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:3", decNew) },
      { slice: "memory", line: expectedLine("dec:2", decMid) },
      { slice: "memory", line: expectedLine("dec:1", decOld) },
      { slice: "memory", line: expectedLine("pointer:omitted:4", expectedOmittedPointer(4)) },
    ]);
    const shed3 = evaluateSessionContextView({
      query,
      cursor: "30",
      pinnedRequests,
      decisions,
      trackItems,
      rulesProvider,
      selectorItems,
      viewMaxTokens: tier12AndPtr.tokenCount,
    });
    // Kills a mutant that sheds tier 2 decisions before tier 3 track items.
    expect(shed3.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:3",
      "dec:2",
      "dec:1",
      "pointer:omitted:4",
    ]);
    // Kills a mutant that miscounts omitted items across tiers 3, 4, and 5 (1 + 1 + 2 = 4).
    expect(shed3.omittedItemCount).toBe(4);
    // Kills a mutant that drops decisions when tiers 1 and 2 fit.
    expect(shed3.omittedDecisionCount).toBe(0);

    // Step D: tighten ceiling below tier 1 + all tier 2 so oldest decisions drop first and newest survives with pointer.
    const tier1PlusNewestDecAndPtr = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:3", decNew) },
      { slice: "memory", line: expectedLine("pointer:decisions:2", expectedDecisionPointer(2)) },
    ]);
    const shed2 = evaluateSessionContextView({
      query,
      cursor: "30",
      pinnedRequests,
      decisions,
      trackItems,
      rulesProvider,
      selectorItems,
      viewMaxTokens: tier1PlusNewestDecAndPtr.tokenCount,
    });
    // Kills a mutant that drops the newest decision instead of the oldest, or omits the decision pointer line.
    expect(shed2.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:3",
      "pointer:decisions:2",
    ]);
    // Kills a mutant that fails to count the 2 dropped older decisions.
    expect(shed2.omittedDecisionCount).toBe(2);
    // Kills a mutant that breaches viewMaxTokens when shedding tier 2 decisions.
    expect(shed2.tokenCount).toBeLessThanOrEqual(tier1PlusNewestDecAndPtr.tokenCount);
  });

  it("t2: no view exceeds viewMaxTokens, and step 500 is under the ceiling of step 1", async () => {
    // Kills a mutant that alters the spec default viewMaxTokens (8_000) or default bytes-per-token (3).
    expect(DEFAULT_VIEW_MAX_TOKENS).toBe(8_000);
    // Kills a mutant that changes the default 3-UTF-8-bytes-per-token constant (SJ:894).
    expect(DEFAULT_BYTES_PER_TOKEN).toBe(3);

    // Exact 3-UTF-8-bytes-per-token boundary with multi-byte UTF-8 ("€" is 3 UTF-8 bytes, 1 UTF-16 code unit).
    const query = makeQuery();
    const pinnedRef = "p:1";
    const utf8Text = "€€€€"; // 12 UTF-8 bytes; line "p:1: €€€€" = 5 + 12 = 17 UTF-8 bytes -> ceil(17/3) = 6 tokens (UTF-16 length would be 9 -> 3 tokens).
    const line17Bytes = expectedLine(pinnedRef, utf8Text);
    const exactBytes17 = utf8Bytes(line17Bytes);
    // Kills a mutant in test fixture arithmetic (ensures fixture itself is 17 UTF-8 bytes, 6 tokens).
    expect(exactBytes17).toBe(17);

    const exactFit = evaluateSessionContextView({
      query,
      cursor: "1",
      pinnedRequests: [{ ref: pinnedRef, text: utf8Text }],
      viewMaxTokens: 6,
    });
    // Kills a mutant that uses UTF-16 string.length or Math.floor instead of Math.ceil(utf8Bytes / 3), or rejects exact boundary with >=.
    expect(exactFit.tokenCount).toBe(6);
    // Kills a mutant that computes byteLength in UTF-16 code units instead of UTF-8 bytes.
    expect(exactFit.byteLength).toBe(17);
    // Kills a mutant that flags overflow when tokenCount === viewMaxTokens (off-by-one >= instead of >).
    expect(Object.hasOwn(exactFit, "overflow")).toBe(false);

    const oneTokenTighter = evaluateSessionContextView({
      query,
      cursor: "1",
      pinnedRequests: [{ ref: pinnedRef, text: utf8Text }],
      viewMaxTokens: 5,
    });
    // Kills a mutant that uses 4 bytes/token (ceil(17/4)=5 <= 5), UTF-16 length (ceil(9/3)=3 <= 5), or Math.floor (floor(17/3)=5 <= 5).
    expect(oneTokenTighter.overflow).toBe("pinned_request_over_ceiling");

    // Step 1 vs step 501 (500 more steps) through pure view evaluation under ceiling 180 tokens.
    const ceiling = 180;
    const pinnedText = "Maintain bounded context across 500 working steps";
    const step1 = evaluateSessionContextView({
      query,
      cursor: "1",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      decisions: [{ ref: "dec:1", text: "decision-1: initial policy", cursor: "1" }],
      viewMaxTokens: ceiling,
    });

    const decisions500: SessionContextViewEntryV1[] = Array.from({ length: 50 }, (_, idx) => ({
      ref: `dec:${idx + 1}`,
      text: `decision-${idx + 1}: settled rule number ${idx + 1} for retry module`,
      cursor: String(idx + 1),
    }));
    const selector500: SessionContextViewEntryV1[] = Array.from({ length: 451 }, (_, idx) => ({
      ref: `step:${idx + 51}`,
      text: `step-${idx + 51}: edited src/retry.ts and observed test run output ${idx + 51}`,
      slice: idx % 2 === 0 ? "git" : "memory",
      cursor: String(idx + 51),
      authoredBy: "code",
      sourceEventRecordIds: [`raw_${idx + 51}`],
    }));

    const step501 = evaluateSessionContextView({
      query,
      cursor: "501",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      decisions: decisions500,
      selectorItems: selector500,
      viewMaxTokens: ceiling,
    });

    // Kills a mutant that exceeds the ceiling at step 1.
    expect(step1.tokenCount).toBeLessThanOrEqual(ceiling);
    // Kills a mutant that lets view size grow past step 1's ceiling after 500 additional steps.
    expect(step501.tokenCount).toBeLessThanOrEqual(ceiling);
    // Kills a mutant whose rendered payload UTF-8 bytes exceed ceiling * 3 bytes at step 500.
    expect(step501.byteLength).toBeLessThanOrEqual(ceiling * 3);
    // Kills a mutant that falsely sets overflow when pinned request fits and lower tiers were trimmed.
    expect(Object.hasOwn(step501, "overflow")).toBe(false);
    // Kills a mutant that drops the pinned request at step 500.
    expect(step501.items[0]?.ref).toBe("pinned:req-1");
    // Kills a mutant that drops the newest decision at step 500 instead of older decisions.
    expect(step501.items[1]?.ref).toBe("dec:50");
    // Kills a mutant that fails to count all omitted decisions at step 500.
    const inlineDecCount = step501.items.filter((i) => i.ref.startsWith("dec:")).length;
    expect(inlineDecCount + step501.omittedDecisionCount).toBe(50);

    // End-to-end engine check: step 1 vs 500 more steps through createSessionContextEngineV1 under ceiling 180.
    const engine = createSessionContextEngineV1({
      store: memoryStore(),
      actorRef: ACTOR_REF,
      cloneId: CLONE_ID,
      now: FIXED_NOW,
      viewMaxTokens: ceiling,
    });
    const k = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: ROLE_REF,
      sessionId: "sess-500",
    };
    await engine.noteSessionEvent(k);
    await engine.notePinnedRequest(k, pinnedText);
    const engineStep1 = await engine.requestContext(k, { reset: "restart" });
    // Kills a mutant that fails initial full view on the engine with viewMaxTokens configured.
    expect(engineStep1.ok).toBe(true);
    if (!engineStep1.ok) return;
    // Kills a mutant where engine step 1 exceeds the byte ceiling.
    expect(engineStep1.value.byteLength).toBeLessThanOrEqual(ceiling * 3);

    for (let i = 1; i <= 50; i += 1) {
      await engine.noteDecision(k, `engine-decision-${i}: keep retry limit bounded at ${i}`, "peer-session");
    }
    for (let i = 1; i <= 450; i += 1) {
      await engine.noteViewItem(k, 5, {
        ref: `fact:${i}`,
        text: `observed step ${i} output in src/retry.ts during verification`,
        slice: "memory",
        authoredBy: "code",
        sourceEventRecordIds: [`raw_step_${i}`],
      });
    }

    const engineStep501 = await engine.requestContext(k, { reset: "compaction" });
    // Kills a mutant that fails compaction full view on the engine after 500 steps.
    expect(engineStep501.ok).toBe(true);
    if (!engineStep501.ok) return;
    // Kills a mutant in engine.ts that ignores viewMaxTokens and dumps all 500 steps unbounded.
    expect(engineStep501.value.byteLength).toBeLessThanOrEqual(ceiling * 3);
    // Kills a mutant in engine.ts that fails to bound rendered view tokens under ceiling at step 500.
    const evaluatedAt501 = engine.evaluateView(k);
    expect(evaluatedAt501?.tokenCount).toBeLessThanOrEqual(ceiling);
    // Kills a mutant in engine.ts that omits the decision pointer item when 50 decisions exceed the ceiling.
    expect(
      engineStep501.value.items.some((item) => item.ref.startsWith("pointer:decisions:")),
    ).toBe(true);
  });

  it("t3: decisions that do not fit are counted in the pointer line", () => {
    const query = makeQuery();
    const pinnedText = "Fix retry timeout";
    const d1 = "decision-1: first settled decision text for scope with enough UTF-8 bytes to exceed one pointer line cleanly";
    const d2 = "decision-2: second settled decision text for scope with enough UTF-8 bytes to exceed one pointer line cleanly";
    const d3 = "decision-3: third settled decision text for scope with enough UTF-8 bytes to exceed one pointer line cleanly";
    const d4 = "decision-4: fourth settled decision text for scope with enough UTF-8 bytes to exceed one pointer line cleanly";
    const decisions: readonly SessionContextViewEntryV1[] = [
      { ref: "dec:1", text: d1, cursor: "1" },
      { ref: "dec:2", text: d2, cursor: "2" },
      { ref: "dec:3", text: d3, cursor: "3" },
      { ref: "dec:4", text: d4, cursor: "4" },
    ];

    // Exact budget for pinned + 2 newest decisions (dec:4, dec:3) + pointer line for 2 omitted decisions.
    const target = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:4", d4) },
      { slice: "memory", line: expectedLine("dec:3", d3) },
      { slice: "memory", line: expectedLine("pointer:decisions:2", expectedDecisionPointer(2)) },
    ]);

    const view = evaluateSessionContextView({
      query,
      cursor: "4",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      decisions,
      viewMaxTokens: target.tokenCount,
    });

    // Kills a mutant that drops decisions silently instead of keeping the newest inline and emitting the pointer item.
    expect(view.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:4",
      "dec:3",
      "pointer:decisions:2",
    ]);
    // Kills a mutant that reports the wrong omittedDecisionCount (must be 2 for dec:2 and dec:1).
    expect(view.omittedDecisionCount).toBe(2);
    // Kills a mutant that changes the exact SJ §2.7 pointer wording or omits it from readySlicePayloads.memory.
    expect(view.readySlicePayloads.memory).toBe(target.readySlicePayloads.memory);
    // Kills a mutant that omits the decision pointer line text verbatim.
    expect(view.readySlicePayloads.memory).toContain(expectedDecisionPointer(2));
    // Kills a mutant that fails to reserve space for the pointer line and exceeds viewMaxTokens.
    expect(view.tokenCount).toBeLessThanOrEqual(target.tokenCount);
    // Kills a mutant that sets overflow when pinned request + decision pointer fit within viewMaxTokens.
    expect(Object.hasOwn(view, "overflow")).toBe(false);

    // Reservation trap test: budget fits pinned + 3 decisions ALONE (no room left for pointer line),
    // yet does NOT fit pinned + all 4 decisions -> MUST backtrack to 2 decisions + pointer line (never breach ceiling, never drop silently).
    const threeWithoutPointer = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:4", d4) },
      { slice: "memory", line: expectedLine("dec:3", d3) },
      { slice: "memory", line: expectedLine("dec:2", d2) },
    ]);
    const fourDecisions = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("dec:4", d4) },
      { slice: "memory", line: expectedLine("dec:3", d3) },
      { slice: "memory", line: expectedLine("dec:2", d2) },
      { slice: "memory", line: expectedLine("dec:1", d1) },
    ]);
    // Kills a mutant in test fixture assumptions (verifies threeWithoutPointer < fourDecisions).
    expect(threeWithoutPointer.tokenCount).toBeLessThan(fourDecisions.tokenCount);

    const trap = evaluateSessionContextView({
      query,
      cursor: "4",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      decisions,
      viewMaxTokens: threeWithoutPointer.tokenCount,
    });
    // Kills a mutant that greedily includes 3 decisions and then overflows ceiling with the pointer line.
    expect(trap.tokenCount).toBeLessThanOrEqual(threeWithoutPointer.tokenCount);
    // Kills a mutant that greedily includes 3 decisions and then drops dec:1 in silence (no pointer line).
    expect(trap.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:4",
      "dec:3",
      "pointer:decisions:2",
    ]);
    // Kills a mutant that reports wrong omittedDecisionCount after backtracking from 3 to 2 decisions.
    expect(trap.omittedDecisionCount).toBe(2);
    // Kills a mutant that computes wrong digest on the pointer item itself.
    expect(trap.items[3]?.digest).toBe(sha256Text(expectedDecisionPointer(2)));

    // Short-decision trap: when each decision (~55B) is shorter than the pointer line (~89B), must backtrack by 2 decisions so pointer fits strictly under ceiling.
    const shortDecisions: readonly SessionContextViewEntryV1[] = [
      { ref: "sd:1", text: "short-decision-1: first rule in scope", cursor: "1" },
      { ref: "sd:2", text: "short-decision-2: second rule in scope", cursor: "2" },
      { ref: "sd:3", text: "short-decision-3: third rule in scope", cursor: "3" },
      { ref: "sd:4", text: "short-decision-4: fourth rule in scope", cursor: "4" },
    ];
    const shortThreeNoPtr = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-1", pinnedText) },
      { slice: "memory", line: expectedLine("sd:4", shortDecisions[3]!.text) },
      { slice: "memory", line: expectedLine("sd:3", shortDecisions[2]!.text) },
      { slice: "memory", line: expectedLine("sd:2", shortDecisions[1]!.text) },
    ]);
    const shortTrap = evaluateSessionContextView({
      query,
      cursor: "4",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      decisions: shortDecisions,
      viewMaxTokens: shortThreeNoPtr.tokenCount,
    });
    // Kills a mutant that only backtracks by one decision instead of binary-searching for the exact largest k fitting with the pointer.
    expect(shortTrap.tokenCount).toBeLessThanOrEqual(shortThreeNoPtr.tokenCount);
    // Kills a mutant that drops short decisions silently or keeps too many short decisions alongside the pointer.
    expect(shortTrap.items.map((item) => item.ref)).toEqual(["pinned:req-1", "sd:4", "pointer:decisions:3"]);
    // Kills a mutant that misreports omittedDecisionCount after multi-decision backtracking.
    expect(shortTrap.omittedDecisionCount).toBe(3);

    // Degenerate headroom: tier 1 fits alone, but ceiling leaves less than one pointer line -> never exceeds viewMaxTokens.
    const pinnedOnlyTokens = expectedDefaultTokens(utf8Bytes(expectedLine("pinned:req-1", pinnedText)));
    const ultraTight = evaluateSessionContextView({
      query,
      cursor: "4",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      decisions,
      viewMaxTokens: pinnedOnlyTokens + 2,
    });
    // Kills a mutant that emits the decision pointer even when tier 1 + pointer exceeds viewMaxTokens (breaking tokenCount <= viewMaxTokens without overflow).
    expect(ultraTight.tokenCount).toBeLessThanOrEqual(pinnedOnlyTokens + 2);
    // Kills a mutant that reports overflow when tier 1 itself fit within viewMaxTokens.
    expect(Object.hasOwn(ultraTight, "overflow")).toBe(false);
    // Kills a mutant that misreports omittedDecisionCount when 0 decisions fit.
    expect(ultraTight.omittedDecisionCount).toBe(4);
  });

  it("t4: a pinned request over the ceiling is delivered whole, with overflow", async () => {
    const query = makeQuery();
    const longRequest = "Passe la limite de tentatives a 5 et garde exactement chaque mot de cette demande sans jamais tronquer un seul octet";
    const pinnedLine = expectedLine("pinned:req-1", longRequest);
    const pinnedTokens = expectedDefaultTokens(utf8Bytes(pinnedLine));
    const smallCeiling = pinnedTokens - 1; // 1 token below the pinned request!

    // Case 1: pinned request alone (no decisions) exceeds ceiling.
    const solo = evaluateSessionContextView({
      query,
      cursor: "1",
      pinnedRequests: [{ ref: "pinned:req-1", text: longRequest }],
      trackItems: [{ ref: "trk:1", text: "track item should be dropped", slice: "track" }],
      selectorItems: [{ ref: "sel:1", text: "selector item should be dropped", slice: "memory" }],
      viewMaxTokens: smallCeiling,
    });

    // Kills a mutant that omits overflow when the pinned request exceeds viewMaxTokens.
    expect(solo.overflow).toBe("pinned_request_over_ceiling");
    // Kills a mutant that truncates or drops the pinned request when over ceiling.
    expect(solo.readySlicePayloads.track).toBe(pinnedLine);
    // Kills a mutant that alters byteLength when delivering the full oversized pinned request.
    expect(solo.byteLength).toBe(utf8Bytes(pinnedLine));
    // Kills a mutant that still emits tier 3 or tier 5 items when tier 1 already overflowed the ceiling.
    expect(solo.items.map((item) => item.ref)).toEqual(["pinned:req-1"]);
    // Kills a mutant that fails to compute the full verbatim digest of the oversized pinned request.
    expect(solo.items[0]?.digest).toBe(sha256Text(longRequest));
    // Kills a mutant that fails to count omitted lower-tier items during pinned overflow.
    expect(solo.omittedItemCount).toBe(2);

    // Case 2: pinned request exceeds ceiling while 2 decisions exist in scope -> pinned delivered whole + overflow + decision pointer line so decisions are never dropped in silence.
    const withDecisions = evaluateSessionContextView({
      query,
      cursor: "5",
      pinnedRequests: [{ ref: "pinned:req-1", text: longRequest }],
      decisions: [
        { ref: "dec:1", text: "decision one", cursor: "2" },
        { ref: "dec:2", text: "decision two", cursor: "3" },
      ],
      viewMaxTokens: smallCeiling,
    });
    // Kills a mutant that drops overflow when decisions are also present.
    expect(withDecisions.overflow).toBe("pinned_request_over_ceiling");
    // Kills a mutant that drops decisions silently during pinned-request overflow (SJ §9.1 check 1).
    expect(withDecisions.items.map((item) => item.ref)).toEqual(["pinned:req-1", "pointer:decisions:2"]);
    // Kills a mutant that truncates the pinned request when decisions are also in scope.
    expect(withDecisions.readySlicePayloads.track).toBe(pinnedLine);
    // Kills a mutant that omits the decision count pointer line during pinned-request overflow.
    expect(withDecisions.readySlicePayloads.memory).toBe(
      expectedLine("pointer:decisions:2", expectedDecisionPointer(2)),
    );
    // Kills a mutant that misreports omittedDecisionCount during pinned-request overflow.
    expect(withDecisions.omittedDecisionCount).toBe(2);

    // Case 3: end-to-end through createSessionContextEngineV1 -> delivery reports overflow and full request digest.
    const engine = createSessionContextEngineV1({
      store: memoryStore(),
      actorRef: ACTOR_REF,
      cloneId: CLONE_ID,
      now: FIXED_NOW,
      viewMaxTokens: 10,
    });
    const k = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: ROLE_REF,
      sessionId: "sess-overflow",
    };
    await engine.noteSessionEvent(k);
    await engine.notePinnedRequest(k, longRequest);
    const delivered = await engine.requestContext(k, { reset: "compaction" });
    // Kills a mutant that refuses an oversized pinned request instead of delivering it with overflow.
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    // Kills a mutant in engine.ts that drops the overflow flag from SessionContextDeliveryV1.
    expect(delivered.value.overflow).toBe("pinned_request_over_ceiling");
    // Kills a mutant in engine.ts that truncates the pinned request text before computing digest/byteLength.
    expect(delivered.value.items[0]?.digest).toBe(sha256Text(longRequest));
    // Kills a mutant in engine.ts that drops bytes from the oversized pinned request.
    expect(delivered.value.byteLength).toBe(utf8Bytes(longRequest));

    // Case 4: two pinned requests (original + correction) that each fit individually, yet together exceed ceiling -> BOTH delivered whole with overflow.
    const part1 = "a".repeat(30); // "pinned:req-1: " (14) + 30 = 44B -> 15 tokens
    const part2 = "b".repeat(30); // "pinned:req-2: " (14) + 30 = 44B -> 15 tokens; combined with "\n" = 89B -> 30 tokens
    const multiOverflow = evaluateSessionContextView({
      query,
      cursor: "2",
      pinnedRequests: [
        { ref: "pinned:req-1", text: part1 },
        { ref: "pinned:req-2", text: part2 },
      ],
      viewMaxTokens: 25,
    });
    // Kills a mutant that only checks pinnedRequests[0] against viewMaxTokens instead of the whole tier 1.
    expect(multiOverflow.overflow).toBe("pinned_request_over_ceiling");
    // Kills a mutant that drops or cuts the second pinned correction during overflow.
    expect(multiOverflow.readySlicePayloads.track).toBe(
      `${expectedLine("pinned:req-1", part1)}\n${expectedLine("pinned:req-2", part2)}`,
    );
  });

  it("t5: a replaced decision the session holds comes as one withdrawn item", async () => {
    const d1Text = "decision: retry limit is 3";
    const d2Text = "decision: retry limit is 5";
    const d1Digest = sha256Text(d1Text);
    const d2Digest = sha256Text(d2Text);

    // Pure diffSessionContextViews verification (including rendered withdrawn payload line).
    const query = makeQuery();
    const heldView = evaluateSessionContextView({
      query,
      cursor: "3",
      pinnedRequests: [{ ref: "pinned:req-1", text: "retry limit" }],
      decisions: [{ ref: "dec:1", text: d1Text, cursor: "3" }],
      viewMaxTokens: 500,
    });
    const nowView = evaluateSessionContextView({
      query,
      cursor: "4",
      pinnedRequests: [{ ref: "pinned:req-1", text: "retry limit" }],
      decisions: [
        { ref: "dec:1", text: d1Text, cursor: "3", replacedAtCursor: "4" },
        { ref: "dec:2", text: d2Text, cursor: "4" },
      ],
      viewMaxTokens: 500,
    });

    // Kills a mutant in evaluateSessionContextView that keeps a replaced decision active at cursor >= replacedAtCursor.
    expect(nowView.items.map((item) => item.ref)).toEqual(["pinned:req-1", "dec:2"]);

    const pureDiff = diffSessionContextViews({
      nowView,
      heldRefs: new Set(heldView.items.map((item) => item.ref)),
      withdrawnEntries: [{ ref: "dec:1", text: d1Text, slice: "memory", cursor: "3", replacedAtCursor: "4" }],
      viewMaxTokens: 500,
    });
    const expectedDiffPayloads = expectedPayloads([
      { slice: "memory", line: expectedLine("dec:2", d2Text) },
      { slice: "memory", line: expectedLine("dec:1", d1Text, "withdrawn") },
    ]);

    // Kills a mutant in diffSessionContextViews that drops the withdrawn item or duplicates it.
    expect(pureDiff.items).toEqual([
      {
        ref: "dec:2",
        digest: d2Digest,
        slice: "memory",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
      {
        ref: "dec:1",
        digest: d1Digest,
        slice: "memory",
        change: "withdrawn",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);
    // Kills a mutant that omits the withdrawn line from readySlicePayloads or misformats its ref prefix.
    expect(pureDiff.readySlicePayloads).toEqual(expectedDiffPayloads.readySlicePayloads);
    // Kills a mutant that miscomputes byteLength for a diff containing a withdrawn item.
    expect(pureDiff.byteLength).toBe(expectedDiffPayloads.byteLength);

    // Tight diff ceiling: when added + withdrawn together exceed diff viewMaxTokens, diff stays bounded under ceiling while preserving the withdrawn item.
    const tightWithdrawnLine = expectedLine("dec:1", d1Text, "withdrawn");
    const tightDiffCeiling = expectedDefaultTokens(utf8Bytes(tightWithdrawnLine)) + 2;
    const tightDiff = diffSessionContextViews({
      nowView,
      heldRefs: new Set(heldView.items.map((item) => item.ref)),
      withdrawnEntries: [{ ref: "dec:1", text: d1Text, slice: "memory", cursor: "3", replacedAtCursor: "4" }],
      viewMaxTokens: tightDiffCeiling,
    });
    // Kills a mutant in diffSessionContextViews that skips ceiling enforcement when combining added and withdrawn items.
    expect(tightDiff.tokenCount).toBeLessThanOrEqual(tightDiffCeiling);
    // Kills a mutant in diffSessionContextViews that drops the withdrawn notice before trimming lower-priority added items.
    expect(tightDiff.items).toEqual([
      {
        ref: "dec:1",
        digest: d1Digest,
        slice: "memory",
        change: "withdrawn",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);

    // End-to-end engine verification of decision replacement lifecycle.
    const engine = createSessionContextEngineV1({
      store: memoryStore(),
      actorRef: ACTOR_REF,
      cloneId: CLONE_ID,
      now: FIXED_NOW,
    });
    const kA = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: ROLE_REF,
      sessionId: "session-a",
    };
    const kB = { ...kA, sessionId: "session-b" };
    const kC = { ...kA, sessionId: "session-c" };

    await engine.noteSessionEvent(kA);
    await engine.notePinnedRequest(kA, "retry limit");
    // Session C establishes its baseline at cursor "2" BEFORE d1 exists.
    const baseC = await engine.requestContext(kC, { reset: "restart" });
    // Kills a mutant that fails baseline delivery for session C.
    expect(baseC.ok).toBe(true);
    if (!baseC.ok) return;

    const noted1 = await engine.noteDecision(kB, d1Text, "session-b");
    // Session A receives full view holding d1 at cursor "3".
    const fullA = await engine.requestContext(kA, { reset: "restart" });
    // Kills a mutant that fails full delivery holding d1 for session A.
    expect(fullA.ok).toBe(true);
    if (!fullA.ok) return;
    const d1Item = fullA.value.items.find((item) => item.digest === d1Digest);
    // Kills a mutant that omits d1 from session A's initial view before replacement.
    expect(d1Item?.change).toBe("added");
    if (d1Item === undefined) return;

    // Replace d1 with d2 at cursor "4".
    const replaced = await engine.replaceDecision(kB, d1Item.ref, d2Text, "session-b");
    // Kills a mutant that fails to advance cursor monotonically on replaceDecision.
    expect(BigInt(replaced.cursor) > BigInt(noted1.cursor)).toBe(true);

    // Session A asks for a diff holding watermark at cursor "3" (which held d1):
    // MUST receive d2 (added) and EXACTLY ONE withdrawn item for d1!
    const diffA = await engine.requestContext(kA, { held: fullA.value.watermark });
    // Kills a mutant that rejects diff delivery after a decision replacement.
    expect(diffA.ok).toBe(true);
    if (!diffA.ok) return;
    // Kills a mutant that escalates a decision-replacement diff to mode full.
    expect(diffA.value.mode).toBe("diff");
    const withdrawnItems = diffA.value.items.filter((item) => item.change === "withdrawn");
    const addedItems = diffA.value.items.filter((item) => item.change === "added");
    // Kills a mutant that drops the withdrawn item or emits multiple withdrawn items for one replaced decision.
    expect(withdrawnItems).toEqual([
      {
        ref: d1Item.ref,
        digest: d1Digest,
        slice: "memory",
        change: "withdrawn",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);
    // Kills a mutant that fails to deliver the replacement decision d2 alongside the withdrawal of d1.
    expect(addedItems).toEqual([
      {
        ref: replaced.ref,
        digest: d2Digest,
        slice: "memory",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);
    // Kills a mutant that reports byteLength 0 when a replacement and withdrawal are delivered.
    expect(diffA.value.byteLength).toBeGreaterThan(0);

    // Follow-up diff from session A holding the NEW watermark at cursor "4": ZERO bytes, NOT repeated!
    const nextA = await engine.requestContext(kA, { held: diffA.value.watermark });
    // Kills a mutant that fails a follow-up diff after withdrawal.
    expect(nextA.ok).toBe(true);
    if (!nextA.ok) return;
    // Kills a mutant that keeps re-emitting the withdrawn decision after the watermark passed replacement.
    expect(nextA.value.items).toEqual([]);
    // Kills a mutant that reports non-zero bytes after the withdrawal was already acknowledged.
    expect(nextA.value.byteLength).toBe(0);

    // Unreadable watermark fallback for session A (after seen already removed d1): MUST NOT re-emit withdrawn!
    const unreadableA = await engine.requestContext(kA, {
      held: { queryId: fullA.value.watermark.queryId, queryVersion: 999, cursor: "999" },
    });
    // Kills a mutant that errors on unreadable watermark after a withdrawal.
    expect(unreadableA.ok).toBe(true);
    if (!unreadableA.ok) return;
    // Kills a mutant that fails to delete withdrawn refs from engine's `seen` set on delivery.
    expect(unreadableA.value.items).toEqual([]);

    // Full reset after replacement: ONLY active d2, NEVER a withdrawn item for d1!
    const resetA = await engine.requestContext(kA, { reset: "compaction" });
    // Kills a mutant that fails full reset after a decision replacement.
    expect(resetA.ok).toBe(true);
    if (!resetA.ok) return;
    // Kills a mutant that emits a withdrawn item on a full reset or resurrects the replaced decision d1.
    expect(resetA.value.items.map((item) => ({ ref: item.ref, digest: item.digest, change: item.change }))).toEqual([
      { ref: `pinned:${fullA.value.watermark.queryId}:v2`, digest: sha256Text("retry limit"), change: "added" },
      { ref: replaced.ref, digest: d2Digest, change: "added" },
    ]);

    // Session C never held d1 (its watermark was cursor "2", before d1 at "3"): gets ONLY d2, ZERO withdrawn!
    const diffC = await engine.requestContext(kC, { held: baseC.value.watermark });
    // Kills a mutant that fails diff delivery for a session that never held the replaced decision.
    expect(diffC.ok).toBe(true);
    if (!diffC.ok) return;
    // Kills a mutant that emits a withdrawn item to a session that never held the replaced decision.
    expect(diffC.value.items).toEqual([
      {
        ref: replaced.ref,
        digest: d2Digest,
        slice: "memory",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);

    // Own-session decision replaced from outside: session A notes dOwn, peer replaces it with dOwn2 -> session A gets withdrawn(dOwn) + added(dOwn2) once, then 0 bytes.
    const ownText = "decision: own-session choice to cache retries";
    const ownReplacementText = "decision: peer replaced cache retries with stateless retries";
    const ownNoted = await engine.noteDecision(kA, ownText);
    const afterOwn = await engine.requestContext(kA, { held: resetA.value.watermark });
    // Kills a mutant that echoes an own-session decision back to its author before replacement.
    expect(afterOwn.ok && afterOwn.value.items.length === 0).toBe(true);
    if (!afterOwn.ok) return;
    const ownRef = engine.evaluateView(kA)?.items.find((item) => item.digest === sha256Text(ownText))?.ref;
    // Kills a mutant that fails to record the own-session decision in the evaluated view.
    expect(ownRef).toBeDefined();
    if (ownRef === undefined) return;
    const ownReplaced = await engine.replaceDecision(kB, ownRef, ownReplacementText, "session-b");
    // Kills a mutant that fails to advance cursor past the own-session decision on replaceDecision.
    expect(BigInt(ownReplaced.cursor) > BigInt(ownNoted.cursor)).toBe(true);

    const diffOwnReplaced = await engine.requestContext(kA, { held: afterOwn.value.watermark });
    // Kills a mutant that fails diff delivery when an own-session decision is replaced.
    expect(diffOwnReplaced.ok).toBe(true);
    if (!diffOwnReplaced.ok) return;
    // Kills a mutant that fails to notify session A with the replacement digest and withdrawn own-decision digest when its own decision was replaced from outside.
    expect(
      diffOwnReplaced.value.items.map((item) => ({ ref: item.ref, digest: item.digest, change: item.change })),
    ).toEqual([
      { ref: ownReplaced.ref, digest: sha256Text(ownReplacementText), change: "added" },
      { ref: ownRef, digest: sha256Text(ownText), change: "withdrawn" },
    ]);

    const diffOwnSettled = await engine.requestContext(kA, { held: diffOwnReplaced.value.watermark });
    // Kills a mutant that fails follow-up diff after an own-session decision was withdrawn.
    expect(diffOwnSettled.ok).toBe(true);
    if (!diffOwnSettled.ok) return;
    // Kills a mutant that omits `BigInt(decision.replacedAtCursor) > BigInt(baselineCursor)` on own-session decisions (causing infinite withdrawn re-emission!).
    expect(diffOwnSettled.value.items).toEqual([]);
    // Kills a mutant that reports non-zero byteLength once own-session withdrawal is settled.
    expect(diffOwnSettled.value.byteLength).toBe(0);

    // Replacing an unknown or already-replaced ref fails closed.
    // Kills a mutant that silently ignores replacing a non-existent decision ref.
    await expect(engine.replaceDecision(kB, "decision:missing", "new")).rejects.toThrow();
    // Kills a mutant that allows replacing the same decision ref twice.
    await expect(engine.replaceDecision(kB, d1Item.ref, "second replacement")).rejects.toThrow();
  });

  it("t6: each item has its ref, digest, slice, disclosure, authoredBy and sources", () => {
    const query = makeQuery({
      trackScope: [
        {
          repoKey: "engram",
          workspace: WORKSPACE_ID,
          aggregateId: "TRK-99",
          role: "builder",
          aggregateKind: "feature",
          baselineCommit: "abc1234",
          decisionGateId: "gate-1",
          decisionGateDigest: sha256Text("gate-1-body"),
        },
      ],
    });
    const pinnedText = "Ship SJ-1c whole view";
    const decText = "Use RFC 8785 digests everywhere";
    const ruleText = "Never edit files outside Allowed list";
    const gitText = "modified src/session-context/view.ts";
    const archiText = "view.ts depends only on session-front-contracts.ts";
    const planText = "Write RED tests then green implementation";
    const dreamText = "Permanent decision from last month on backoff";
    const expectedTrackText = "feature TRK-99 (builder) @abc1234 gate:gate-1";
    const expectedTrackRef = `track:engram:${WORKSPACE_ID}:TRK-99`;

    const rulesProvider: SessionContextRulesProviderV1 = () => [
      {
        ref: "rule:allowed-scope",
        text: ruleText,
        slice: "rules",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_rule_1"],
      },
    ];

    const view = evaluateSessionContextView({
      query,
      cursor: "25",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText, sourceEventRecordIds: ["raw_req_1"] }],
      decisions: [
        {
          ref: "dec:1",
          text: decText,
          cursor: "5",
          slice: "memory",
          disclosure: "text",
          authoredBy: "code",
          sourceEventRecordIds: ["raw_dec_1"],
        },
      ],
      rulesProvider,
      selectorItems: [
        {
          ref: "git:change-1",
          text: gitText,
          slice: "git",
          disclosure: "text",
          authoredBy: "code",
          sourceEventRecordIds: ["raw_git_1"],
        },
        {
          ref: "arch:comp-1",
          text: archiText,
          slice: "architecture",
          disclosure: "reference",
          authoredBy: "shadow",
          authorModelRef: "anthropic:claude-haiku-4",
          sourceEventRecordIds: ["raw_arch_1"],
        },
        {
          ref: "plan:step-1",
          text: planText,
          slice: "track",
          disclosure: "text",
          authoredBy: "main_model",
          authorModelRef: "anthropic:claude-sonnet-4",
          sourceEventRecordIds: ["raw_plan_1"],
        },
        {
          ref: "dream:rec-1",
          text: dreamText,
          slice: "memory",
          disclosure: "reference",
          authoredBy: "dreaming",
          authorModelRef: "openai:gpt-5-mini",
          sourceEventRecordIds: ["raw_dream_1", "raw_dream_2"],
        },
      ],
      viewMaxTokens: 2_000,
    });

    // Kills a mutant that drops, hardcodes, or corrupts ref, digest, slice, change, disclosure, authoredBy, authorModelRef, or sourceEventRecordIds across all five slices and all four authors.
    expect(view.items).toEqual([
      {
        ref: "pinned:req-1",
        digest: sha256Text(pinnedText),
        slice: "track",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_req_1"],
      },
      {
        ref: "dec:1",
        digest: sha256Text(decText),
        slice: "memory",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_dec_1"],
      },
      {
        ref: expectedTrackRef,
        digest: sha256Text(expectedTrackText),
        slice: "track",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
      {
        ref: "rule:allowed-scope",
        digest: sha256Text(ruleText),
        slice: "rules",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_rule_1"],
      },
      {
        ref: "git:change-1",
        digest: sha256Text(gitText),
        slice: "git",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_git_1"],
      },
      {
        ref: "arch:comp-1",
        digest: sha256Text(archiText),
        slice: "architecture",
        change: "added",
        disclosure: "reference",
        authoredBy: "shadow",
        authorModelRef: "anthropic:claude-haiku-4",
        sourceEventRecordIds: ["raw_arch_1"],
      },
      {
        ref: "plan:step-1",
        digest: sha256Text(planText),
        slice: "track",
        change: "added",
        disclosure: "text",
        authoredBy: "main_model",
        authorModelRef: "anthropic:claude-sonnet-4",
        sourceEventRecordIds: ["raw_plan_1"],
      },
      {
        ref: "dream:rec-1",
        digest: sha256Text(dreamText),
        slice: "memory",
        change: "added",
        disclosure: "reference",
        authoredBy: "dreaming",
        authorModelRef: "openai:gpt-5-mini",
        sourceEventRecordIds: ["raw_dream_1", "raw_dream_2"],
      },
    ]);

    // Kills a mutant that omits any of the five Spec 1 slices when all five have items.
    expect(view.readySlices).toEqual(["track", "git", "architecture", "rules", "memory"]);

    // Kills a mutant that leaks raw text of a `disclosure: "reference"` item into readySlicePayloads.
    expect(view.readySlicePayloads.architecture).toBe(expectedLine("arch:comp-1", archiText, "reference"));
    // Kills a mutant that leaks raw text of a dreaming reference recall into readySlicePayloads.
    expect(view.readySlicePayloads.memory).not.toContain(dreamText);
    // Kills a mutant that drops the reference fingerprint line for a dreaming recall.
    expect(view.readySlicePayloads.memory).toContain(expectedLine("dream:rec-1", dreamText, "reference"));

    // Kills a mutant that sets `authorModelRef: undefined` or `null` as an own property on code-authored items.
    for (const item of view.items.filter((entry) => entry.authoredBy === "code")) {
      expect(Object.hasOwn(item, "authorModelRef")).toBe(false);
    }
  });

  it("t7: viewMaxTokens override may lower the workspace ceiling, never raise it, and invalid ceilings fail closed", () => {
    // Kills a mutant that ignores the default 8_000 when both arguments are omitted.
    expect(resolveViewMaxTokens(undefined, undefined)).toBe(8_000);
    // Kills a mutant that refuses to lower viewMaxTokens via a host/run override.
    expect(resolveViewMaxTokens(500, 120)).toBe(120);
    // Kills a mutant that lets a host/run override raise viewMaxTokens above the workspace ceiling (Math.max instead of Math.min).
    expect(resolveViewMaxTokens(500, 1_200)).toBe(500);
    // Kills a mutant that lets a host/run override raise above the default 8_000 when workspace limit is omitted.
    expect(resolveViewMaxTokens(undefined, 20_000)).toBe(8_000);

    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      // Kills a mutant that accepts zero, negative, fractional, NaN, or infinite viewMaxTokens.
      expect(() => resolveViewMaxTokens(bad, undefined)).toThrow();
      // Kills a mutant that accepts invalid maxTokensOverride values.
      expect(() => resolveViewMaxTokens(500, bad)).toThrow();
    }

    // Verify evaluateSessionContextView applies Math.min(viewMaxTokens, maxTokensOverride) in practice.
    const query = makeQuery();
    const pinnedText = "a".repeat(60); // line "pinned:req-1: " + 60 = 74 bytes -> 25 tokens
    const attemptRaise = evaluateSessionContextView({
      query,
      cursor: "1",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      viewMaxTokens: 20,
      maxTokensOverride: 500,
    });
    // Kills a mutant in evaluateSessionContextView that lets maxTokensOverride raise the ceiling and hide overflow.
    expect(attemptRaise.overflow).toBe("pinned_request_over_ceiling");

    const lowered = evaluateSessionContextView({
      query,
      cursor: "1",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedText }],
      viewMaxTokens: 500,
      maxTokensOverride: 20,
    });
    // Kills a mutant in evaluateSessionContextView that ignores a lower maxTokensOverride.
    expect(lowered.overflow).toBe("pinned_request_over_ceiling");
  });

  it("t8: evaluation is deterministic, never mutates inputs, leaves tier 4 empty without a rulesProvider, and accepts custom countTokens", () => {
    const query = makeQuery();
    const pinnedInput: SessionContextViewEntryV1[] = [{ ref: "pinned:req-1", text: "Keep context deterministic" }];
    const decisionInput: SessionContextViewEntryV1[] = [
      { ref: "dec:1", text: "alpha decision", cursor: "1", sourceEventRecordIds: ["raw_1"] },
      { ref: "dec:2", text: "beta decision", cursor: "2", sourceEventRecordIds: ["raw_2"] },
    ];
    const snapshotDecisions = structuredClone(decisionInput);

    const first = evaluateSessionContextView({
      query,
      cursor: "2",
      pinnedRequests: pinnedInput,
      decisions: decisionInput,
      viewMaxTokens: 500,
    });
    const second = evaluateSessionContextView({
      query,
      cursor: "2",
      pinnedRequests: pinnedInput,
      decisions: decisionInput,
      viewMaxTokens: 500,
    });

    // Kills a mutant that introduces non-determinism across repeated evaluations of the same version and cursor.
    expect(first.items).toEqual(second.items);
    // Kills a mutant that renders non-identical bytes across repeated evaluations of the same version and cursor.
    expect(first.readySlicePayloads).toEqual(second.readySlicePayloads);
    // Kills a mutant that sorts the caller's decisions array in place.
    expect(decisionInput).toEqual(snapshotDecisions);
    // Kills a mutant that fabricates tier 4 rules items when no rulesProvider is supplied (plan/10 Row 8).
    expect(first.items.filter((item) => item.slice === "rules")).toEqual([]);
    // Kills a mutant that emits a `rules` slice payload when no rulesProvider is supplied.
    expect(Object.hasOwn(first.readySlicePayloads, "rules")).toBe(false);

    // Custom host countTokens: count whitespace-separated words (1 token per word).
    const wordCounter = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
    const pinnedWords = "one two three"; // "pinned:req-1: one two three" -> 4 words
    const decWords = "four five six"; // "dec:1: four five six" -> 4 words
    const customView = evaluateSessionContextView({
      query,
      cursor: "2",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedWords }],
      decisions: [{ ref: "dec:1", text: decWords, cursor: "1" }],
      viewMaxTokens: 8,
      countTokens: wordCounter,
    });
    // Kills a mutant that ignores the host-supplied countTokens function and falls back to bytes/3 (which would be ceil(47/3)=16 > 8!).
    expect(customView.tokenCount).toBe(8);
    // Kills a mutant that drops dec:1 when custom countTokens says it fits in 8 tokens.
    expect(customView.items.map((item) => item.ref)).toEqual(["pinned:req-1", "dec:1"]);
    // Kills a mutant that reports overflow when custom countTokens is within viewMaxTokens.
    expect(Object.hasOwn(customView, "overflow")).toBe(false);

    const customTight = evaluateSessionContextView({
      query,
      cursor: "2",
      pinnedRequests: [{ ref: "pinned:req-1", text: pinnedWords }],
      decisions: [{ ref: "dec:1", text: decWords, cursor: "1" }],
      viewMaxTokens: 3,
      countTokens: wordCounter,
    });
    // Kills a mutant that ignores custom countTokens on the overflow check (4 words > 3 ceiling).
    expect(customTight.overflow).toBe("pinned_request_over_ceiling");

    // Future-cursor and replacement filtering across Tiers 2, 3, 4, and 5: items committed after input.cursor or replaced at/before input.cursor MUST NOT enter the evaluated view.
    const scopedTrackRef = `track:engram:${WORKSPACE_ID}:TRK-7`;
    const scopedTrackText = "feature TRK-7 (builder)";
    const cursorQuery = makeQuery({
      trackScope: [
        {
          repoKey: "engram",
          workspace: WORKSPACE_ID,
          aggregateId: "TRK-7",
          role: "builder",
          aggregateKind: "feature",
        },
      ],
    });
    const cursorBounded = evaluateSessionContextView({
      query: cursorQuery,
      cursor: "10",
      pinnedRequests: [{ ref: "pinned:req-1", text: "bounded cursor check" }],
      decisions: [
        { ref: "dec:past", text: "visible at cursor 10", cursor: "9" },
        { ref: "dec:at", text: "visible at exact cursor 10", cursor: "10" },
        { ref: "dec:future", text: "must stay invisible at cursor 10", cursor: "11" },
      ],
      trackItems: [
        { ref: "trk:past", text: "track visible at 9", slice: "track", cursor: "9" },
        { ref: "trk:at", text: "track visible at 10", slice: "track", cursor: "10" },
        { ref: "trk:future", text: "track invisible at 10", slice: "track", cursor: "11" },
        { ref: "trk:replaced", text: "track replaced at 10", slice: "track", cursor: "5", replacedAtCursor: "10" },
        { ref: "trk:replaced-later", text: "track still active at 10", slice: "track", cursor: "6", replacedAtCursor: "11" },
        { ref: scopedTrackRef, text: "future override of trackScope item", slice: "track", cursor: "11" },
      ],
      rulesProvider: () => [
        { ref: "rule:at", text: "rule visible at 10", slice: "rules", cursor: "10" },
        { ref: "rule:future", text: "rule invisible at 10", slice: "rules", cursor: "11" },
        { ref: "rule:replaced", text: "rule replaced at 10", slice: "rules", cursor: "4", replacedAtCursor: "10" },
      ],
      selectorItems: [
        { ref: "sel:past", text: "selector visible at 10", cursor: "10" },
        { ref: "sel:future", text: "selector invisible at 10", cursor: "11" },
      ],
      viewMaxTokens: 500,
    });
    // Kills a mutant that skips `.filter(active)` on Tier-3 trackItems or Tier-4 rulesProvider items, or drops `BigInt(e.cursor) <= at` / `BigInt(e.replacedAtCursor) > at` (or builds `seenTrack` before filtering).
    expect(cursorBounded.items.map((item) => item.ref)).toEqual([
      "pinned:req-1",
      "dec:at",
      "dec:past",
      "trk:past",
      "trk:at",
      "trk:replaced-later",
      scopedTrackRef,
      "rule:at",
      "sel:past",
    ]);
    // Kills a mutant that builds `seenTrack` from unfiltered `trackItems`, letting a future Tier-3 item shadow a `query.trackScope` entry at an earlier cursor.
    expect(cursorBounded.readySlicePayloads.track).toContain(expectedLine(scopedTrackRef, scopedTrackText));
    // Kills a mutant that leaks a future Tier-3 override's text into the evaluated view at an earlier cursor.
    expect(cursorBounded.readySlicePayloads.track).not.toContain("future override of trackScope item");
  });

  it("t9: Tier-3 items committed after a held watermark are delivered in the next diff and never dropped", async () => {
    const trkText = "feature TRK-88 moved to ready_for_review";
    const ruleText = "rule: enforce zero Python on new tier-4 rules";
    let ruleCursor: string | undefined;
    const engine = createSessionContextEngineV1({
      store: memoryStore(),
      actorRef: ACTOR_REF,
      cloneId: CLONE_ID,
      now: FIXED_NOW,
      rulesProvider: () =>
        ruleCursor === undefined
          ? []
          : [{ ref: "rule:new", text: ruleText, slice: "rules", cursor: ruleCursor, sourceEventRecordIds: ["raw_rule_new"] }],
    });
    const k = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: ROLE_REF,
      sessionId: "sess-tier3-diff",
    };

    await engine.noteSessionEvent(k);
    await engine.notePinnedRequest(k, "Track Tier-3 updates");
    const baseline = await engine.requestContext(k, { reset: "restart" });
    // Kills a mutant that fails baseline delivery before Tier-3 noteViewItem.
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    const notedTrk = await engine.noteViewItem(k, 3, {
      ref: "trk:88",
      text: trkText,
      slice: "track",
      sourceEventRecordIds: ["raw_trk_88"],
    });
    ruleCursor = notedTrk.cursor;

    const diff = await engine.requestContext(k, { held: baseline.value.watermark });
    // Kills a mutant that rejects diff delivery after a Tier-3 noteViewItem.
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    // Kills a mutant that escalates a Tier-3 diff to mode full.
    expect(diff.value.mode).toBe("diff");
    // Kills a mutant that fails to filter Tier-3 trackItems or Tier-4 rules by held.cursor (which puts future items into heldRefs and permanently drops them from diffs).
    expect(diff.value.items).toEqual([
      {
        ref: "trk:88",
        digest: sha256Text(trkText),
        slice: "track",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_trk_88"],
      },
      {
        ref: "rule:new",
        digest: sha256Text(ruleText),
        slice: "rules",
        change: "added",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: ["raw_rule_new"],
      },
    ]);
    // Kills a mutant that miscomputes byteLength on a Tier-3 + Tier-4 diff delivery.
    expect(diff.value.byteLength).toBe(utf8Bytes(trkText) + utf8Bytes(ruleText));

    const settled = await engine.requestContext(k, { held: diff.value.watermark });
    // Kills a mutant that fails follow-up diff after Tier-3/Tier-4 delivery.
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    // Kills a mutant that re-emits Tier-3/Tier-4 items after the watermark advances past their commit cursor.
    expect(settled.value.items).toEqual([]);
    // Kills a mutant that reports non-zero byteLength when no new Tier-3/Tier-4 items arrived.
    expect(settled.value.byteLength).toBe(0);
  });

  it("t10: diffSessionContextViews bounds non-pinned diffs even on nowView.overflow, protects new Tier-1, and counts shed Tier-2 decisions", async () => {
    const query = makeQuery();
    const oversizedPinned = "P".repeat(120); // "pinned:req-1: " (14) + 120 = 134 bytes -> 45 tokens
    const decOldText = "decision-old: superseded limit";
    const withdrawnOldLine = expectedLine("dec:old", decOldText, "withdrawn");
    const withdrawnOldTokens = expectedDefaultTokens(utf8Bytes(withdrawnOldLine));
    const ptr2Tokens = expectedDefaultTokens(utf8Bytes(expectedLine("pointer:decisions:2", expectedDecisionPointer(2))));
    const tightCeiling = Math.max(withdrawnOldTokens, ptr2Tokens) + 2; // fits withdrawn OR pointer alone, NOT both, and strictly below oversizedPinned (45 tokens)

    // Case 1: oversized pinned request is ALREADY in heldRefs (nowView.overflow is set, but added has NO Tier-1 item).
    // Diff MUST enforce tightCeiling and MUST NOT report overflow: "pinned_request_over_ceiling".
    const overflowNowView = evaluateSessionContextView({
      query,
      cursor: "4",
      pinnedRequests: [{ ref: "pinned:req-1", text: oversizedPinned }],
      decisions: [
        { ref: "dec:new1", text: "first new decision", cursor: "3" },
        { ref: "dec:new2", text: "second new decision", cursor: "4" },
      ],
      viewMaxTokens: tightCeiling,
    });
    // Kills a mutant in test fixture sizing (confirms nowView itself is in pinned_request_over_ceiling with pointer:decisions:2).
    expect(overflowNowView.overflow).toBe("pinned_request_over_ceiling");
    // Kills a mutant in test fixture sizing (confirms pointer + withdrawn would exceed tightCeiling if trimming were bypassed).
    expect(
      expectedPayloads([
        { slice: "memory", line: expectedLine("pointer:decisions:2", expectedDecisionPointer(2)) },
        { slice: "memory", line: withdrawnOldLine },
      ]).tokenCount,
    ).toBeGreaterThan(tightCeiling);

    const diffAlreadyHeldPinned = diffSessionContextViews({
      nowView: overflowNowView,
      heldRefs: new Set(["pinned:req-1", "dec:old"]),
      withdrawnEntries: [{ ref: "dec:old", text: decOldText, slice: "memory", cursor: "1", replacedAtCursor: "4" }],
      viewMaxTokens: tightCeiling,
    });
    // Kills a mutant that skips diff trimming whenever `nowView.overflow !== undefined`, allowing non-pinned diffs to exceed viewMaxTokens.
    expect(diffAlreadyHeldPinned.tokenCount).toBeLessThanOrEqual(tightCeiling);
    // Kills a mutant that propagates `nowView.overflow` onto a diff containing no Tier-1 pinned request.
    expect(Object.hasOwn(diffAlreadyHeldPinned, "overflow")).toBe(false);
    // Kills a mutant that drops the withdrawn item instead of trimming lower-priority added items under tightCeiling.
    expect(diffAlreadyHeldPinned.items).toEqual([
      {
        ref: "dec:old",
        digest: sha256Text(decOldText),
        slice: "memory",
        change: "withdrawn",
        disclosure: "text",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);

    // Case 2: oversized pinned request is already in heldRefs and only pointer:decisions:2 is added (fits under tightCeiling -> delivered with NO overflow).
    const diffFittingPtr = diffSessionContextViews({
      nowView: overflowNowView,
      heldRefs: new Set(["pinned:req-1"]),
      viewMaxTokens: tightCeiling,
    });
    // Kills a mutant that wrongly emits overflow when a non-pinned diff fits within viewMaxTokens despite nowView.overflow.
    expect(Object.hasOwn(diffFittingPtr, "overflow")).toBe(false);
    // Kills a mutant that drops a fitting decision pointer from a diff when nowView had pinned overflow.
    expect(diffFittingPtr.items.map((item) => ({ ref: item.ref, digest: item.digest }))).toEqual([
      { ref: "pointer:decisions:2", digest: sha256Text(expectedDecisionPointer(2)) },
    ]);
    // Kills a mutant that miscomputes tokenCount on a pointer-only diff.
    expect(diffFittingPtr.tokenCount).toBe(ptr2Tokens);

    // Case 3: new Tier-1 pinned correction + 3 new Tier-2 decisions + Tier-3 + withdrawn exceed diff ceiling (while nowView fits under its own ceiling).
    // Diff MUST protect new Tier-1, keep the newest Tier-2 decision(s) that fit, and emit pointer:decisions:N for shed Tier-2 decisions.
    const pinned2Text = "Keep retry ceiling tight";
    const d3Text = "decision-3: newest settled rule for bounded retry backoff across worker retries";
    const d2Text = "decision-2: middle settled rule for bounded retry backoff across worker retries";
    const d1Text = "decision-1: oldest settled rule for bounded retry backoff across worker retries";
    const trkText = "feature TRK-99 retry metrics";
    const fullNowView = evaluateSessionContextView({
      query,
      cursor: "6",
      pinnedRequests: [
        { ref: "pinned:req-1", text: "Original request" },
        { ref: "pinned:req-2", text: pinned2Text },
      ],
      decisions: [
        { ref: "dec:1", text: d1Text, cursor: "3" },
        { ref: "dec:2", text: d2Text, cursor: "4" },
        { ref: "dec:3", text: d3Text, cursor: "5" },
      ],
      trackItems: [{ ref: "trk:99", text: trkText, slice: "track", cursor: "6" }],
      viewMaxTokens: 500,
    });
    const targetCase3 = expectedPayloads([
      { slice: "track", line: expectedLine("pinned:req-2", pinned2Text) },
      { slice: "memory", line: expectedLine("dec:3", d3Text) },
      { slice: "memory", line: expectedLine("pointer:decisions:2", expectedDecisionPointer(2)) },
      { slice: "memory", line: withdrawnOldLine },
    ]);
    const diffTrimmed = diffSessionContextViews({
      nowView: fullNowView,
      heldRefs: new Set(["pinned:req-1", "dec:old"]),
      withdrawnEntries: [{ ref: "dec:old", text: decOldText, slice: "memory", cursor: "1", replacedAtCursor: "6" }],
      viewMaxTokens: targetCase3.tokenCount,
    });
    // Kills a mutant that slices `added.slice(0, k)` directly without protecting Tier-1 or emitting `pointer:decisions:N` for shed Tier-2 decisions.
    expect(diffTrimmed.items.map((item) => ({ ref: item.ref, digest: item.digest, change: item.change }))).toEqual([
      { ref: "pinned:req-2", digest: sha256Text(pinned2Text), change: "added" },
      { ref: "dec:3", digest: sha256Text(d3Text), change: "added" },
      { ref: "pointer:decisions:2", digest: sha256Text(expectedDecisionPointer(2)), change: "added" },
      { ref: "dec:old", digest: sha256Text(decOldText), change: "withdrawn" },
    ]);
    // Kills a mutant that omits the decision pointer text when shedding Tier-2 decisions in a diff.
    expect(diffTrimmed.readySlicePayloads.memory).toContain(expectedDecisionPointer(2));
    // Kills a mutant that exceeds viewMaxTokens when shedding Tier-2 decisions in a diff.
    expect(diffTrimmed.tokenCount).toBeLessThanOrEqual(targetCase3.tokenCount);
    // Kills a mutant that sets overflow when new Tier-1 fit within viewMaxTokens.
    expect(Object.hasOwn(diffTrimmed, "overflow")).toBe(false);

    // Case 4: newly added Tier-1 pinned correction ALONE exceeds diff ceiling (both when nowView.overflow is absent and when present).
    // Diff MUST deliver new Tier-1 whole with overflow: "pinned_request_over_ceiling" AND pointer:decisions:N for omitted Tier-2 decisions.
    const longCorrection = "C".repeat(120); // "pinned:req-2: " (14) + 120 = 134 bytes -> 45 tokens
    const overDiffCeiling = 20;
    const nowViewBigBudget = evaluateSessionContextView({
      query,
      cursor: "5",
      pinnedRequests: [
        { ref: "pinned:req-1", text: "short" },
        { ref: "pinned:req-2", text: longCorrection },
      ],
      decisions: [
        { ref: "dec:1", text: "first decision", cursor: "3" },
        { ref: "dec:2", text: "second decision", cursor: "4" },
      ],
      trackItems: [{ ref: "trk:1", text: "track dropped on overflow", slice: "track", cursor: "5" }],
      viewMaxTokens: 500,
    });
    const diffNewPinnedOverflow = diffSessionContextViews({
      nowView: nowViewBigBudget,
      heldRefs: new Set(["pinned:req-1"]),
      viewMaxTokens: overDiffCeiling,
    });
    // Kills a mutant that drops or truncates a newly added Tier-1 pinned request when `nowView.overflow === undefined` and diff ceiling is smaller than Tier-1.
    expect(diffNewPinnedOverflow.overflow).toBe("pinned_request_over_ceiling");
    // Kills a mutant that fails to deliver new oversized Tier-1 whole with pointer:decisions:2 for omitted new Tier-2 decisions.
    expect(diffNewPinnedOverflow.items.map((item) => ({ ref: item.ref, digest: item.digest }))).toEqual([
      { ref: "pinned:req-2", digest: sha256Text(longCorrection) },
      { ref: "pointer:decisions:2", digest: sha256Text(expectedDecisionPointer(2)) },
    ]);
    // Kills a mutant that truncates the newly added oversized Tier-1 payload in a diff.
    expect(diffNewPinnedOverflow.readySlicePayloads.track).toBe(expectedLine("pinned:req-2", longCorrection));

    // Case 5: end-to-end engine check when added decisions + withdrawn exceed viewMaxTokens while nowView itself fits.
    // The engine diff MUST stay bounded and emit `pointer:decisions:N` so shed decisions are never lost silently when watermark advances.
    const dInitText = "decision-init: initial retry limit is three attempts across workers";
    const dReplText = "decision-repl: replacement retry limit is five attempts with jitter across workers";
    const dExtraText = "decision-extra: audit log every terminal retry failure with exact error code";
    const engineCeiling = 115; // nowView (96t) <= 115t, [dExtra, pointer:decisions:1, withdrawn] (113t) <= 115t < [dExtra, dRepl, withdrawn] (126t)
    const engine = createSessionContextEngineV1({
      store: memoryStore(),
      actorRef: ACTOR_REF,
      cloneId: CLONE_ID,
      now: FIXED_NOW,
      viewMaxTokens: engineCeiling,
    });
    const kA = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: ROLE_REF,
      sessionId: "sess-diff-ptr-a",
    };
    const kB = { ...kA, sessionId: "sess-diff-ptr-b" };
    await engine.noteSessionEvent(kA);
    await engine.notePinnedRequest(kA, "retry");
    await engine.noteDecision(kB, dInitText, "sess-diff-ptr-b");
    const initA = await engine.requestContext(kA, { reset: "restart" });
    // Kills a mutant that fails initial full view before replacement in engine diff-pointer test.
    expect(initA.ok).toBe(true);
    if (!initA.ok) return;
    const initDecRef = initA.value.items.find((item) => item.digest === sha256Text(dInitText))?.ref;
    // Kills a mutant that omits initial decision from session A's baseline view.
    expect(initDecRef).toBeDefined();
    if (initDecRef === undefined) return;

    await engine.replaceDecision(kB, initDecRef, dReplText, "sess-diff-ptr-b");
    await engine.noteDecision(kB, dExtraText, "sess-diff-ptr-b");

    // Verify nowView itself fits under engineCeiling (so trimming happens strictly in diffSessionContextViews).
    const nowEval = engine.evaluateView(kA);
    // Kills a mutant in test fixture sizing (confirms nowView fits inside engineCeiling before combining with withdrawn).
    expect(nowEval !== undefined && nowEval.tokenCount <= engineCeiling && nowEval.omittedDecisionCount === 0).toBe(true);

    const diffEngine = await engine.requestContext(kA, { held: initA.value.watermark });
    // Kills a mutant that fails engine diff delivery when added + withdrawn exceed viewMaxTokens.
    expect(diffEngine.ok).toBe(true);
    if (!diffEngine.ok) return;
    // Kills a mutant in engine/diff that silently drops a new decision when diff trims under viewMaxTokens (must emit pointer:decisions:1).
    expect(diffEngine.value.items.map((item) => ({ digest: item.digest, change: item.change }))).toEqual([
      { digest: sha256Text(dExtraText), change: "added" },
      { digest: sha256Text(expectedDecisionPointer(1)), change: "added" },
      { digest: sha256Text(dInitText), change: "withdrawn" },
    ]);
    // Kills a mutant that omits the `pointer:decisions:1` ref on the shed decision pointer item.
    expect(diffEngine.value.items[1]?.ref).toBe("pointer:decisions:1");
    // Kills a mutant that falsely reports overflow on an engine diff where Tier-1 was already held.
    expect(Object.hasOwn(diffEngine.value, "overflow")).toBe(false);

    // Case 6: end-to-end engine check when session already holds an oversized pinned request and receives a later non-pinned diff (NO false overflow).
    const overEngine = createSessionContextEngineV1({
      store: memoryStore(),
      actorRef: ACTOR_REF,
      cloneId: CLONE_ID,
      now: FIXED_NOW,
      viewMaxTokens: 35,
    });
    const kOver = { ...kA, sessionId: "sess-over-held" };
    await overEngine.noteSessionEvent(kOver);
    await overEngine.notePinnedRequest(kOver, oversizedPinned);
    const fullOver = await overEngine.requestContext(kOver, { reset: "restart" });
    // Kills a mutant that fails full view delivery for an oversized pinned request.
    expect(fullOver.ok).toBe(true);
    if (!fullOver.ok) return;
    // Kills a mutant that omits overflow on initial full view carrying an oversized pinned request.
    expect(fullOver.value.overflow).toBe("pinned_request_over_ceiling");

    await overEngine.noteDecision(kOver, "peer decision while oversized pinned is already held", "peer-over");
    const diffOver = await overEngine.requestContext(kOver, { held: fullOver.value.watermark });
    // Kills a mutant that fails diff delivery when an oversized pinned request is already held.
    expect(diffOver.ok).toBe(true);
    if (!diffOver.ok) return;
    // Kills a mutant that leaks `overflow: "pinned_request_over_ceiling"` onto a follow-up diff whose oversized pinned request is already held.
    expect(Object.hasOwn(diffOver.value, "overflow")).toBe(false);
    // Kills a mutant that drops the decision pointer from a follow-up diff when oversized pinned request is already held.
    expect(diffOver.value.items.map((item) => ({ ref: item.ref, digest: item.digest }))).toEqual([
      { ref: "pointer:decisions:1", digest: sha256Text(expectedDecisionPointer(1)) },
    ]);
  });
});
