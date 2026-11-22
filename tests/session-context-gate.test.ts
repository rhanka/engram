import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  OntologyTemplateEnvelopeRef,
  SessionContextAmendmentV1,
  SessionContextQueryV1,
  SessionContextSelectorV1,
  SessionTrackScopeRefV1,
  Sha256Digest,
} from "../src/session-front-contracts.js";
import {
  DEFAULT_MAX_SELECTORS,
  MAX_SELECTOR_REF_BYTES,
  MAX_SELECTOR_TEXT_BYTES,
  SESSION_CONTEXT_GATE_REFUSAL_REASONS,
  deriveSessionContextSelectorId,
  evaluateSessionContextAmendment,
  isValidSessionContextSelectorId,
  projectSelectorWithheld,
  resolveMaxSelectors,
  type SessionContextGateOptionsV1,
  type SessionContextRightsScopeV1,
  type SessionContextStoredSelectorMatchV1,
} from "../src/session-context/gate.js";

const TENANT_ID = "tenant-sj6a";
const WORKSPACE_ID = "workspace-sj6a";
const WORKTREE_ID = `wt:${"a".repeat(64)}`;
const OTHER_WORKTREE_ID = `wt:${"b".repeat(64)}`;
const QUERY_ID = "query_sj6afixture0001";
const OTHER_QUERY_ID = "query_sj6aother000002";
const ROLE_REF = "agent:builder";
const OTHER_ROLE_REF = "agent:reviewer";
const MANDATE_DIGEST = `sha256:${"1".repeat(64)}` as Sha256Digest;
const OTHER_MANDATE_DIGEST = `sha256:${"2".repeat(64)}` as Sha256Digest;
const SHADOW_MODEL = "anthropic:claude-haiku-4";

function independentJcs(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (Array.isArray(value)) {
    return `[${value.map(independentJcs).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .map((key) => key.normalize("NFC"))
      .sort();
    const normalizedEntries = new Map<string, unknown>();
    for (const rawKey of Object.keys(record)) {
      normalizedEntries.set(rawKey.normalize("NFC"), record[rawKey]);
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${independentJcs(normalizedEntries.get(key))}`).join(",")}}`;
  }
  throw new TypeError(`Unsupported JCS test value: ${typeof value}`);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function independentSha256(text: string): Sha256Digest {
  return `sha256:${sha256Hex(text)}` as Sha256Digest;
}

function independentSelectorId(match: SessionContextStoredSelectorMatchV1): string {
  return `scs_${sha256Hex(independentJcs(match))}`;
}

function independentQueryDigest(bare: Omit<SessionContextQueryV1, "digest">): Sha256Digest {
  return `sha256:${sha256Hex(independentJcs(bare))}` as Sha256Digest;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry);
    }
  }
  return value;
}

function makeQuery(overrides: Partial<Omit<SessionContextQueryV1, "digest">> = {}): SessionContextQueryV1 {
  const bare: Omit<SessionContextQueryV1, "digest"> = {
    schemaVersion: "engram.session-context-query/v1",
    queryId: QUERY_ID,
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    derivedWorktreeId: WORKTREE_ID,
    roleRef: ROLE_REF,
    mandateDigest: MANDATE_DIGEST,
    trackScope: [],
    ontologies: [],
    pinnedEventRecordIds: ["raw_req_1"],
    selectors: [],
    ...overrides,
  };
  return deepFreeze({ ...bare, digest: independentQueryDigest(bare) });
}

function makeUnassignedQuery(overrides: Partial<Omit<SessionContextQueryV1, "digest">> = {}): SessionContextQueryV1 {
  const bare: Omit<SessionContextQueryV1, "digest"> = {
    schemaVersion: "engram.session-context-query/v1",
    queryId: "query_sj6aunassigned01",
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    derivedWorktreeId: WORKTREE_ID,
    trackScope: [],
    ontologies: [],
    pinnedEventRecordIds: [],
    selectors: [],
    ...overrides,
  };
  return deepFreeze({ ...bare, digest: independentQueryDigest(bare) });
}

function makeSelector(
  match: SessionContextStoredSelectorMatchV1,
  by: "agent" | "shadow",
  sourceEventRecordIds: readonly string[],
  authorModelRef?: string,
): SessionContextSelectorV1 {
  return deepFreeze({
    selectorId: independentSelectorId(match),
    match: match.kind === "text"
      ? { kind: "text", text: match.text.normalize("NFC") }
      : { kind: "ref", ref: match.ref.normalize("NFC") },
    by,
    ...(authorModelRef === undefined ? {} : { authorModelRef }),
    sourceEventRecordIds: [...sourceEventRecordIds],
  });
}

function sameSpaceScope(overrides: Partial<SessionContextRightsScopeV1> = {}): SessionContextRightsScopeV1 {
  return deepFreeze({
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    derivedWorktreeId: WORKTREE_ID,
    roleRef: ROLE_REF,
    mandateDigest: MANDATE_DIGEST,
    ...overrides,
  });
}

describe("SJ-6a — session context amendment gate", () => {
  it("t1: keep adds a selector and gives the next version, and the same keep again is no_change", () => {
    const base = makeQuery({ version: 1, selectors: [] });
    const textMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "retry policy and backoff" };
    const expectedTextId = independentSelectorId(textMatch);
    const keepText: SessionContextAmendmentV1 = deepFreeze({
      op: "keep",
      by: "agent",
      sourceEventRecordIds: ["raw_note_10"],
      basedOnVersion: 1,
      match: textMatch,
    });

    const first = evaluateSessionContextAmendment(base, keepText, { callerScope: sameSpaceScope() });
    const expectedSelector1 = makeSelector(textMatch, "agent", ["raw_note_10"]);
    const expectedQueryV2Bare: Omit<SessionContextQueryV1, "digest"> = {
      schemaVersion: base.schemaVersion,
      queryId: base.queryId,
      version: 2,
      tenantId: base.tenantId,
      workspaceId: base.workspaceId,
      derivedWorktreeId: base.derivedWorktreeId,
      roleRef: base.roleRef,
      mandateDigest: base.mandateDigest,
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [expectedSelector1],
    };
    const expectedDigestV2 = independentQueryDigest(expectedQueryV2Bare);

    // Kills a mutant that returns wrong verdict status or wrong selectorId on first keep.
    expect(first.verdict).toEqual({ selectorId: expectedTextId, verdict: "accepted" });
    // Kills a mutant that sets reason: undefined or null on an accepted verdict.
    expect(Object.hasOwn(first.verdict, "reason")).toBe(false);
    // Kills a mutant that fails to increment version by 1 on an accepted keep.
    expect(first.query.version).toBe(2);
    // Kills a mutant that reuses the old digest or hashes fields other than RFC 8785 JCS of Omit<query, 'digest'>.
    expect(first.query.digest).toBe(expectedDigestV2);
    // Kills a mutant that drops, duplicates, or corrupts selector fields when adding a selector.
    expect(first.query.selectors).toEqual([expectedSelector1]);
    // Kills a mutant that attaches authorModelRef as an own property when agent omits it.
    expect(Object.hasOwn(first.query.selectors[0]!, "authorModelRef")).toBe(false);
    // Kills a mutant that reports phantom evictions when below maxSelectors.
    expect(first.evictedSelectorIds).toEqual([]);
    // Kills a mutant that mutates the input query instead of returning a new immutable version.
    expect(base.version).toBe(1);
    // Kills a mutant that mutates the input query's selectors array in place.
    expect(base.selectors).toEqual([]);

    // Determinism: calling the pure gate again with identical frozen inputs yields identical output.
    const repeatClean = evaluateSessionContextAmendment(base, keepText, { callerScope: sameSpaceScope() });
    // Kills a mutant that injects clock, random state, or module-level mutable state into the gate.
    expect(repeatClean).toEqual(first);

    // Same keep again on v2 -> no_change, version and digest stay untouched.
    const dupAgent = evaluateSessionContextAmendment(first.query, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: ["raw_note_11"],
      basedOnVersion: 2,
      match: { kind: "text", text: "retry policy and backoff" },
    });
    // Kills a mutant that accepts a duplicate keep instead of returning no_change.
    expect(dupAgent.verdict).toEqual({ selectorId: expectedTextId, verdict: "no_change" });
    // Kills a mutant that attaches a reason property on a no_change verdict.
    expect(Object.hasOwn(dupAgent.verdict, "reason")).toBe(false);
    // Kills a mutant that bumps version on no_change.
    expect(dupAgent.query.version).toBe(2);
    // Kills a mutant that recomputes or alters digest on no_change.
    expect(dupAgent.query.digest).toBe(expectedDigestV2);
    // Kills a mutant that modifies selectors on no_change.
    expect(dupAgent.query.selectors).toEqual([expectedSelector1]);
    // Kills a mutant that reports evictedSelectorIds on no_change.
    expect(dupAgent.evictedSelectorIds).toEqual([]);

    // Shadow keeping the same subject already kept by agent -> no_change (never downgrades ownership).
    const dupShadow = evaluateSessionContextAmendment(
      first.query,
      {
        op: "keep",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: ["raw_ev_1"],
        basedOnVersion: 2,
        match: { kind: "text", text: "retry policy and backoff" },
      },
      { existingEventRecordIds: new Set(["raw_ev_1"]) },
    );
    // Kills a mutant that lets shadow overwrite or re-accept an already-kept agent selector.
    expect(dupShadow.verdict).toEqual({ selectorId: expectedTextId, verdict: "no_change" });
    // Kills a mutant that changes the existing selector's author from agent to shadow on duplicate keep.
    expect(dupShadow.query.selectors[0]!.by).toBe("agent");

    // Shadow keeping a new ref selector with valid same-space refScopes + existingEventRecordIds -> accepted v3.
    const refMatch: SessionContextStoredSelectorMatchV1 = { kind: "ref", ref: "rec_decision_42" };
    const expectedRefId = independentSelectorId(refMatch);
    const keepRefShadow: SessionContextAmendmentV1 = deepFreeze({
      op: "keep",
      by: "shadow",
      authorModelRef: SHADOW_MODEL,
      sourceEventRecordIds: ["raw_ev_2"],
      basedOnVersion: 2,
      match: refMatch,
    });
    const third = evaluateSessionContextAmendment(first.query, keepRefShadow, {
      callerScope: sameSpaceScope(),
      refScopes: new Map([["rec_decision_42", sameSpaceScope()]]),
      existingEventRecordIds: new Set(["raw_ev_2"]),
    });
    const expectedSelector2 = makeSelector(refMatch, "shadow", ["raw_ev_2"], SHADOW_MODEL);
    const expectedDigestV3 = independentQueryDigest({
      ...expectedQueryV2Bare,
      version: 3,
      selectors: [expectedSelector1, expectedSelector2],
    });
    // Kills a mutant that rejects valid attributed shadow ref keeps.
    expect(third.verdict).toEqual({ selectorId: expectedRefId, verdict: "accepted" });
    // Kills a mutant that fails to advance version to 3 on shadow keep.
    expect(third.query.version).toBe(3);
    // Kills a mutant that miscomputes digest or drops authorModelRef on a shadow selector.
    expect(third.query.digest).toBe(expectedDigestV3);
    // Kills a mutant that fails to append the shadow selector preserving existing order.
    expect(third.query.selectors).toEqual([expectedSelector1, expectedSelector2]);

    // journalEnabled: false refuses even an already-kept selector with closed reason 'journal_off'.
    const offResult = evaluateSessionContextAmendment(first.query, keepText, { journalEnabled: false });
    // Kills a mutant that ignores journalEnabled: false or returns no_change before checking journal_off.
    expect(offResult.verdict).toEqual({ selectorId: expectedTextId, verdict: "refused", reason: "journal_off" });
    // Kills a mutant that mutates version when refused for journal_off.
    expect(offResult.query.version).toBe(2);
    // Kills a mutant that mutates digest when refused for journal_off.
    expect(offResult.query.digest).toBe(expectedDigestV2);

    // Static purity check: gate.ts has no I/O, no clock, no randomness.
    const gateSource = readFileSync(resolve(process.cwd(), "src/session-context/gate.ts"), "utf8");
    // Kills a mutant that imports filesystem, network, or child-process I/O into the pure gate.
    expect(/\bnode:(?:fs|http|https|net|child_process|os)\b|\bfetch\s*\(|\bprocess\.env\b/.test(gateSource)).toBe(false);
    // Kills a mutant that introduces wall-clock or nondeterministic randomness into the pure gate.
    expect(/\bnew\s+Date\b|\bDate\.now\b|\bperformance\.now\b|\bMath\.random\b/.test(gateSource)).toBe(false);
  });

  it("t2: drop removes a selector by its selectorId, the shadow's included", () => {
    const agentMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "agent focus topic" };
    const shadowMatch1: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "shadow inferred topic" };
    const shadowMatch2: SessionContextStoredSelectorMatchV1 = { kind: "ref", ref: "src/retry.ts" };
    const agentSel = makeSelector(agentMatch, "agent", ["raw_1"]);
    const shadowSel1 = makeSelector(shadowMatch1, "shadow", ["raw_2"], SHADOW_MODEL);
    const shadowSel2 = makeSelector(shadowMatch2, "shadow", ["raw_3"], SHADOW_MODEL);
    const v3 = makeQuery({ version: 3, selectors: [agentSel, shadowSel1, shadowSel2] });

    // Agent drops a shadow selector by selectorId alone.
    const dropShadowByAgent = evaluateSessionContextAmendment(v3, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: ["raw_4"],
      basedOnVersion: 3,
      selectorId: shadowSel1.selectorId,
    });
    const expectedAfterDrop1 = independentQueryDigest({
      schemaVersion: v3.schemaVersion,
      queryId: v3.queryId,
      version: 4,
      tenantId: v3.tenantId,
      workspaceId: v3.workspaceId,
      derivedWorktreeId: v3.derivedWorktreeId,
      roleRef: v3.roleRef,
      mandateDigest: v3.mandateDigest,
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [agentSel, shadowSel2],
    });
    // Kills a mutant that prevents the agent from dropping a shadow selector.
    expect(dropShadowByAgent.verdict).toEqual({ selectorId: shadowSel1.selectorId, verdict: "accepted" });
    // Kills a mutant that fails to increment version on drop.
    expect(dropShadowByAgent.query.version).toBe(4);
    // Kills a mutant that leaves the dropped shadow selector in place or reorders survivors.
    expect(dropShadowByAgent.query.selectors).toEqual([agentSel, shadowSel2]);
    // Kills a mutant that miscomputes digest after drop.
    expect(dropShadowByAgent.query.digest).toBe(expectedAfterDrop1);
    // Kills a mutant that reports evictions on an explicit drop.
    expect(dropShadowByAgent.evictedSelectorIds).toEqual([]);

    // Dropping the same already-removed selector again -> no_change.
    const dropAgain = evaluateSessionContextAmendment(dropShadowByAgent.query, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: ["raw_5"],
      basedOnVersion: 4,
      selectorId: shadowSel1.selectorId,
    });
    // Kills a mutant that accepts or refuses dropping an unknown/already-gone selector instead of no_change.
    expect(dropAgain.verdict).toEqual({ selectorId: shadowSel1.selectorId, verdict: "no_change" });
    // Kills a mutant that bumps version when drop matches no selector.
    expect(dropAgain.query.version).toBe(4);
    // Kills a mutant that alters digest on no_change drop.
    expect(dropAgain.query.digest).toBe(expectedAfterDrop1);

    // Shadow may drop its own shadow selector when attributed.
    const dropShadowByShadow = evaluateSessionContextAmendment(
      dropShadowByAgent.query,
      {
        op: "drop",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: ["raw_6"],
        basedOnVersion: 4,
        selectorId: shadowSel2.selectorId,
      },
      { existingEventRecordIds: new Set(["raw_6"]) },
    );
    // Kills a mutant that blocks an attributed shadow from dropping a shadow selector.
    expect(dropShadowByShadow.verdict).toEqual({ selectorId: shadowSel2.selectorId, verdict: "accepted" });
    // Kills a mutant that drops the wrong selector when shadow drops its own selector.
    expect(dropShadowByShadow.query.selectors).toEqual([agentSel]);
    // Kills a mutant that fails to advance version to 5.
    expect(dropShadowByShadow.query.version).toBe(5);

    // Shadow CANNOT drop an agent selector -> refused outside_rights.
    const shadowDropsAgent = evaluateSessionContextAmendment(
      dropShadowByShadow.query,
      {
        op: "drop",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: ["raw_7"],
        basedOnVersion: 5,
        selectorId: agentSel.selectorId,
      },
      { existingEventRecordIds: new Set(["raw_7"]) },
    );
    // Kills a mutant that allows the shadow to drop an agent selector (eviction bypass).
    expect(shadowDropsAgent.verdict).toEqual({
      selectorId: agentSel.selectorId,
      verdict: "refused",
      reason: "outside_rights",
    });
    // Kills a mutant that removes the agent selector despite refusing the shadow drop.
    expect(shadowDropsAgent.query.selectors).toEqual([agentSel]);
    // Kills a mutant that bumps version when shadow drop of agent selector is refused.
    expect(shadowDropsAgent.query.version).toBe(5);

    // Agent drops its own agent selector -> accepted, selectors becomes empty.
    const dropAgentByAgent = evaluateSessionContextAmendment(dropShadowByShadow.query, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 5,
      selectorId: agentSel.selectorId,
    });
    // Kills a mutant that prevents the agent from dropping its own selector.
    expect(dropAgentByAgent.verdict).toEqual({ selectorId: agentSel.selectorId, verdict: "accepted" });
    // Kills a mutant that leaves agent selector behind after agent drop.
    expect(dropAgentByAgent.query.selectors).toEqual([]);
    // Kills a mutant that fails to advance version to 6.
    expect(dropAgentByAgent.query.version).toBe(6);

    // Drop of a brand-new unknown valid selectorId -> no_change.
    const unknownId = `scs_${"9".repeat(64)}`;
    const dropUnknown = evaluateSessionContextAmendment(dropAgentByAgent.query, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 6,
      selectorId: unknownId,
    });
    // Kills a mutant that refuses an unknown valid selectorId instead of returning no_change.
    expect(dropUnknown.verdict).toEqual({ selectorId: unknownId, verdict: "no_change" });
    // Kills a mutant that changes version on unknown selectorId drop.
    expect(dropUnknown.query.version).toBe(6);

    // Drop carrying a match field (SJ-6b t9) or non-scs_ selectorId -> closed refusal invalid_amendment.
    const dropWithMatch = evaluateSessionContextAmendment(v3, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 3,
      selectorId: agentSel.selectorId,
      match: agentMatch,
    } as unknown as SessionContextAmendmentV1);
    // Kills a mutant that permits a drop amendment carrying a match field.
    expect(dropWithMatch.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
    // Kills a mutant that alters query when drop carries a match field.
    expect(dropWithMatch.query.version).toBe(3);

    const dropBadId = evaluateSessionContextAmendment(v3, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 3,
      selectorId: "not-a-selector-id",
    });
    // Kills a mutant that accepts a malformed non-scs_ selectorId on drop.
    expect(dropBadId.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
  });

  it("t3: nothing unpins a request, widens a right or changes the Track scope or the ontologies, and a selector outside the rights is refused outside_rights", () => {
    const trackScope: readonly SessionTrackScopeRefV1[] = deepFreeze([
      {
        repoKey: "engram",
        workspace: WORKSPACE_ID,
        aggregateId: "US-101",
        role: "primary",
        aggregateKind: "user_story",
        baselineCommit: "cf695249f",
        decisionGateId: "gate-1",
        decisionGateDigest: `sha256:${"3".repeat(64)}` as Sha256Digest,
      },
    ]);
    const ontologies: readonly OntologyTemplateEnvelopeRef[] = deepFreeze([
      {
        lineage: "track",
        templateId: "track-core",
        templateVersion: "1.0.0",
        templateDigestSha256: `sha256:${"4".repeat(64)}` as Sha256Digest,
      },
      {
        lineage: "h2a",
        templateId: "h2a-roles",
        templateVersion: "1.2.0",
        templateDigestSha256: `sha256:${"5".repeat(64)}` as Sha256Digest,
      },
    ]);
    const pinned = deepFreeze(["raw_pinned_1", "raw_pinned_2"]);
    const rich = makeQuery({
      version: 2,
      objectiveLoopId: "loop-42",
      trackScope,
      ontologies,
      pinnedEventRecordIds: pinned,
      selectors: [],
    });

    // Legitimate keep preserves every immutable non-selector field verbatim.
    const validKeep = evaluateSessionContextAmendment(
      rich,
      {
        op: "keep",
        by: "agent",
        sourceEventRecordIds: ["raw_9"],
        basedOnVersion: 2,
        match: { kind: "text", text: "keep scope intact" },
      },
      { callerScope: sameSpaceScope() },
    );
    // Kills a mutant that refuses a legitimate in-rights keep on a rich query.
    expect(validKeep.verdict.verdict).toBe("accepted");
    // Kills a mutant that drops or mutates pinnedEventRecordIds during keep.
    expect(validKeep.query.pinnedEventRecordIds).toEqual(pinned);
    // Kills a mutant that changes tenantId, workspaceId, derivedWorktreeId, roleRef, or mandateDigest.
    expect({
      tenantId: validKeep.query.tenantId,
      workspaceId: validKeep.query.workspaceId,
      derivedWorktreeId: validKeep.query.derivedWorktreeId,
      roleRef: validKeep.query.roleRef,
      mandateDigest: validKeep.query.mandateDigest,
    }).toEqual({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: ROLE_REF,
      mandateDigest: MANDATE_DIGEST,
    });
    // Kills a mutant that clears or mutates objectiveLoopId or trackScope.
    expect(validKeep.query.objectiveLoopId).toBe("loop-42");
    // Kills a mutant that drops or alters trackScope entries.
    expect(validKeep.query.trackScope).toEqual(trackScope);
    // Kills a mutant that drops or alters ontologies entries.
    expect(validKeep.query.ontologies).toEqual(ontologies);

    // Unassigned query preserves absence of optional fields (never sets undefined or null).
    const unassigned = makeUnassignedQuery();
    const unassignedKeep = evaluateSessionContextAmendment(
      unassigned,
      {
        op: "keep",
        by: "agent",
        sourceEventRecordIds: [],
        basedOnVersion: 1,
        match: { kind: "text", text: "unassigned subject" },
      },
      {
        callerScope: {
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          derivedWorktreeId: WORKTREE_ID,
          sessionPseudoId: "sess_pseudo:aa",
        },
      },
    );
    // Kills a mutant that refuses a valid keep on an unassigned session query.
    expect(unassignedKeep.verdict.verdict).toBe("accepted");
    // Kills a mutant that injects roleRef on an unassigned query.
    expect(Object.hasOwn(unassignedKeep.query, "roleRef")).toBe(false);
    // Kills a mutant that injects mandateDigest on an unassigned query.
    expect(Object.hasOwn(unassignedKeep.query, "mandateDigest")).toBe(false);
    // Kills a mutant that injects objectiveLoopId when absent.
    expect(Object.hasOwn(unassignedKeep.query, "objectiveLoopId")).toBe(false);

    // Forged amendments attempting to unpin, widen rights, or alter trackScope/ontologies -> refused outside_rights.
    const tamperPayloads: readonly Record<string, unknown>[] = [
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, pinnedEventRecordIds: [] },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, unpin: "raw_pinned_1" },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, tenantId: "tenant-other" },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, workspaceId: "ws-other" },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, derivedWorktreeId: OTHER_WORKTREE_ID },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, roleRef: OTHER_ROLE_REF },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, mandateDigest: OTHER_MANDATE_DIGEST },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, trackScope: [] },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, objectiveLoopId: "loop-hijack" },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, ontologies: [] },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x", tenantId: "tenant-other" } },
    ];
    for (const forged of tamperPayloads) {
      const outcome = evaluateSessionContextAmendment(rich, forged as unknown as SessionContextAmendmentV1);
      // Kills a mutant that allows or ignores protected query-field tampering in an amendment.
      expect(outcome.verdict.verdict).toBe("refused");
      // Kills a mutant that misclassifies protected query-field tampering away from outside_rights.
      expect(outcome.verdict.verdict === "refused" ? outcome.verdict.reason : "").toBe("outside_rights");
      // Kills a mutant that modifies the query on protected-field tampering.
      expect(outcome.query).toEqual(rich);
    }

    // CallerScope mismatches on each of the 5 rights dimensions -> refused outside_rights (on keep AND drop, even on existing/unknown selectors).
    const badCallerScopes: readonly SessionContextRightsScopeV1[] = [
      sameSpaceScope({ tenantId: "tenant-other" }),
      sameSpaceScope({ workspaceId: "workspace-other" }),
      sameSpaceScope({ derivedWorktreeId: OTHER_WORKTREE_ID }),
      sameSpaceScope({ roleRef: OTHER_ROLE_REF }),
      sameSpaceScope({ roleRef: undefined }),
      sameSpaceScope({ mandateDigest: OTHER_MANDATE_DIGEST }),
      sameSpaceScope({ mandateDigest: undefined }),
    ];
    const existingSelId = independentSelectorId({ kind: "text", text: "keep scope intact" });
    for (const badScope of badCallerScopes) {
      const keepOut = evaluateSessionContextAmendment(
        validKeep.query,
        { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "text", text: "keep scope intact" } },
        { callerScope: badScope },
      );
      // Kills a mutant that fails to check every callerScope right field or leaks no_change before checking caller rights.
      expect(keepOut.verdict).toEqual({ selectorId: existingSelId, verdict: "refused", reason: "outside_rights" });
      // Kills a mutant that alters query when callerScope disagrees on a right.
      expect(keepOut.query.version).toBe(3);

      const dropOut = evaluateSessionContextAmendment(
        validKeep.query,
        { op: "drop", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, selectorId: `scs_${"e".repeat(64)}` },
        { callerScope: badScope },
      );
      // Kills a mutant that skips callerScope check on drop (existence oracle leak).
      expect(dropOut.verdict).toEqual({ selectorId: `scs_${"e".repeat(64)}`, verdict: "refused", reason: "outside_rights" });
    }

    // targetScope mismatch -> refused outside_rights.
    const badTarget = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "cross target" } },
      { targetScope: sameSpaceScope({ workspaceId: "workspace-other" }) },
    );
    // Kills a mutant that ignores targetScope rights verification.
    expect(badTarget.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "cross target" }),
      verdict: "refused",
      reason: "outside_rights",
    });

    // Ref selector WITHOUT refScopes -> fail-closed refused outside_rights.
    const unprovedRef: SessionContextStoredSelectorMatchV1 = { kind: "ref", ref: "rec_unproved_1" };
    const noScopeProof = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 2,
      match: unprovedRef,
    });
    // Kills a mutant that fails open when refScopes is omitted for a ref selector.
    expect(noScopeProof.verdict).toEqual({
      selectorId: independentSelectorId(unprovedRef),
      verdict: "refused",
      reason: "outside_rights",
    });

    // Ref selector missing from refScopes (including prototype keys) -> refused outside_rights.
    for (const missingRef of ["rec_unknown", "toString", "constructor"]) {
      const missingOutcome = evaluateSessionContextAmendment(
        rich,
        { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: missingRef } },
        { refScopes: { "rec_known": sameSpaceScope() } },
      );
      // Kills a mutant that accepts unknown refs or suffers prototype lookup on plain Record refScopes.
      expect(missingOutcome.verdict).toEqual({
        selectorId: independentSelectorId({ kind: "ref", ref: missingRef }),
        verdict: "refused",
        reason: "outside_rights",
      });
    }

    // Inherited prototype scope entries on plain Record refScopes/eventScopes must be ignored (Object.hasOwn).
    const protoRefScopes: Readonly<Record<string, SessionContextRightsScopeV1>> = Object.assign(
      Object.create({ rec_inherited: sameSpaceScope() }) as Record<string, SessionContextRightsScopeV1>,
      { rec_known: sameSpaceScope() },
    );
    const inheritedRefOutcome = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "rec_inherited" } },
      { refScopes: protoRefScopes },
    );
    // Kills a mutant that drops Object.hasOwn in lookupScope for plain Record refScopes and accepts inherited prototype scopes.
    expect(inheritedRefOutcome.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "ref", ref: "rec_inherited" }),
      verdict: "refused",
      reason: "outside_rights",
    });
    const ownRecordRefOutcome = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "rec_known" } },
      { refScopes: protoRefScopes },
    );
    // Kills a mutant that rejects valid own-property lookups on plain Record refScopes.
    expect(ownRecordRefOutcome.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "ref", ref: "rec_known" }),
      verdict: "accepted",
    });

    const protoEventScopes: Readonly<Record<string, SessionContextRightsScopeV1>> = Object.assign(
      Object.create({ raw_inherited: sameSpaceScope() }) as Record<string, SessionContextRightsScopeV1>,
      { raw_known: sameSpaceScope() },
    );
    const inheritedEventOutcome = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_inherited"], basedOnVersion: 2, match: { kind: "text", text: "inherited event probe" } },
      { eventScopes: protoEventScopes },
    );
    // Kills a mutant that drops Object.hasOwn in lookupScope for plain Record eventScopes and accepts inherited prototype scopes.
    expect(inheritedEventOutcome.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "inherited event probe" }),
      verdict: "refused",
      reason: "unattributed",
    });
    const ownRecordEventOutcome = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_known"], basedOnVersion: 2, match: { kind: "text", text: "own record event probe" } },
      { eventScopes: protoEventScopes },
    );
    // Kills a mutant that rejects valid own-property lookups on plain Record eventScopes.
    expect(ownRecordEventOutcome.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "own record event probe" }),
      verdict: "accepted",
    });

    // Ref selector whose refScope disagrees on tenant, workspace, worktree, role, or mandate -> refused outside_rights.
    const badRefScopes: readonly SessionContextRightsScopeV1[] = [
      sameSpaceScope({ tenantId: "tenant-other" }),
      sameSpaceScope({ workspaceId: "workspace-other" }),
      sameSpaceScope({ derivedWorktreeId: OTHER_WORKTREE_ID }),
      sameSpaceScope({ roleRef: OTHER_ROLE_REF }),
      sameSpaceScope({ mandateDigest: OTHER_MANDATE_DIGEST }),
    ];
    for (const refScope of badRefScopes) {
      const refOut = evaluateSessionContextAmendment(
        rich,
        { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "rec_foreign_1" } },
        { refScopes: new Map([["rec_foreign_1", refScope]]) },
      );
      // Kills a mutant that fails to enforce tenant/workspace/worktree/role/mandate on refScopes.
      expect(refOut.verdict).toEqual({
        selectorId: independentSelectorId({ kind: "ref", ref: "rec_foreign_1" }),
        verdict: "refused",
        reason: "outside_rights",
      });
    }

    // Workspace-level ref (roleRef & mandateDigest omitted on target) in same (tenant, workspace, worktree) -> allowed for a mandated query.
    const wsRef = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "src/retry.ts" } },
      { refScopes: new Map([["src/retry.ts", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID }]]) },
    );
    // Kills a mutant that rejects a workspace-level same-space file ref when roleRef is unset on the target.
    expect(wsRef.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "ref", ref: "src/retry.ts" }),
      verdict: "accepted",
    });

    // Valid D6 withheld-path:<64hex> ref in same space -> accepted.
    const validWithheldPath = `withheld-path:${"c".repeat(64)}`;
    const withheldPathOk = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: validWithheldPath } },
      { refScopes: new Map([[validWithheldPath, sameSpaceScope()]]) },
    );
    // Kills a mutant that wrongly rejects a valid D6 withheld-path:<64hex> ref as an unknown URI scheme.
    expect(withheldPathOk.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "ref", ref: validWithheldPath }),
      verdict: "accepted",
    });

    // Unassigned query (roleRef === undefined) refuses role-scoped ref AND other-session ref, accepts own-session ref.
    const unassignedRoleRef = evaluateSessionContextAmendment(
      unassigned,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 1, match: { kind: "ref", ref: "rec_role_1" } },
      {
        callerScope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_pseudo:aa" },
        refScopes: new Map([["rec_role_1", sameSpaceScope()]]),
      },
    );
    // Kills a mutant that allows an unassigned session (no roleRef) to select a role-scoped ref.
    expect(unassignedRoleRef.verdict.verdict === "refused" ? unassignedRoleRef.verdict.reason : "").toBe("outside_rights");

    const unassignedOtherSession = evaluateSessionContextAmendment(
      unassigned,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 1, match: { kind: "ref", ref: "raw_other_sess" } },
      {
        callerScope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_pseudo:aa" },
        refScopes: new Map([["raw_other_sess", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_pseudo:bb" }]]),
      },
    );
    // Kills a mutant that allows an unassigned session to select another session's event ref.
    expect(unassignedOtherSession.verdict.verdict === "refused" ? unassignedOtherSession.verdict.reason : "").toBe("outside_rights");

    const unassignedOwnSession = evaluateSessionContextAmendment(
      unassigned,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 1, match: { kind: "ref", ref: "raw_own_sess" } },
      {
        callerScope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_pseudo:aa" },
        refScopes: new Map([["raw_own_sess", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_pseudo:aa" }]]),
      },
    );
    // Kills a mutant that blocks an unassigned session from selecting its own session's event ref.
    expect(unassignedOwnSession.verdict.verdict).toBe("accepted");

    // Intrinsic path/boundary escapes are ALWAYS refused outside_rights even if listed in refScopes.
    const forbiddenRefs: readonly string[] = [
      "/etc/passwd",
      "../other-repo/secret.ts",
      "src/../../etc/hosts",
      "~/.ssh/config",
      "C:\\Windows\\win.ini",
      "file:///etc/passwd",
      "https://evil.example/leak",
      "src/*",
      ".env",
      "config/.env.local",
      "secrets/api.json",
      "keys/id_rsa",
      "certs/server.pem",
      "certs/tls.key",
      "bad\x00ref",
      "withheld-path:not-64-hex",
      `file:${OTHER_WORKTREE_ID}:a.ts`,
      `${OTHER_WORKTREE_ID}`,
      "wt:malformed-worktree",
      `src/${OTHER_WORKTREE_ID}/escape.ts`,
      `pinned:${OTHER_QUERY_ID}:v1`,
      `decision:${OTHER_QUERY_ID}:deadbeef:1`,
      `track:engram:other-workspace:US-1`,
      // Round-2 Finding 3: surrounding whitespace, trailing separators, empty/dot segments, .env dir, uppercase secrets, colon subpaths.
      " /etc/passwd",
      " ../secret.ts",
      " ~/.ssh/config",
      " file:///etc/passwd",
      "src/a/.. ",
      "rec_1 ",
      " rec_1",
      "config/.env/",
      "keys/id_rsa/",
      "certs/server.pem/",
      "src/retry.ts/",
      "src//retry.ts",
      "src/./retry.ts",
      "./src/retry.ts",
      ".",
      "..",
      ".env/prod.txt",
      "Secrets/api.json",
      "keys/ID_RSA",
      "config/.ENV",
      "certs/server.PEM",
      "certs/TLS.KEY",
      "src/.ssh/config",
      `pinned:${QUERY_ID}:../etc/passwd`,
      `pinned:${QUERY_ID}:/etc/passwd`,
      `pinned:${QUERY_ID}:`,
      `pinned:${QUERY_ID}:.env`,
      `pinned:${QUERY_ID}:v1:extra`,
      `decision:${QUERY_ID}:..:1`,
      `decision:${QUERY_ID}:deadbeef:../x`,
      `track:engram:${WORKSPACE_ID}:../etc/passwd`,
      `track::${WORKSPACE_ID}:US-1`,
      `track:engram:${WORKSPACE_ID}:`,
      `track:secrets:${WORKSPACE_ID}:US-1`,
      `wt:${"a".repeat(64)}/escape`,
      "FILE:///etc/passwd",
    ];
    for (const badRef of forbiddenRefs) {
      const escaped = evaluateSessionContextAmendment(
        rich,
        { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: badRef } },
        { refScopes: new Map([[badRef, sameSpaceScope()]]) },
      );
      // Kills a mutant that misses any intrinsic ref escape (absolute path, traversal, secret, wildcard, URI, foreign wt/query/track).
      expect(escaped.verdict).toEqual({
        selectorId: independentSelectorId({ kind: "ref", ref: badRef }),
        verdict: "refused",
        reason: "outside_rights",
      });
    }

    // Shadow attribution boundary: missing model, malformed model, empty sources, missing event index, unknown event -> unattributed; cross-space event -> outside_rights.
    const shadowMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "shadow note" };
    const shadowMatchId = independentSelectorId(shadowMatch);
    const unattributedCases: readonly { readonly amendment: SessionContextAmendmentV1; readonly options?: SessionContextGateOptionsV1 }[] = [
      { amendment: { op: "keep", by: "shadow", sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: shadowMatch }, options: { existingEventRecordIds: new Set(["raw_1"]) } },
      { amendment: { op: "keep", by: "shadow", authorModelRef: "", sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: shadowMatch }, options: { existingEventRecordIds: new Set(["raw_1"]) } },
      { amendment: { op: "keep", by: "shadow", authorModelRef: "nocolon", sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: shadowMatch }, options: { existingEventRecordIds: new Set(["raw_1"]) } },
      { amendment: { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: [], basedOnVersion: 2, match: shadowMatch }, options: { existingEventRecordIds: new Set(["raw_1"]) } },
      { amendment: { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: shadowMatch } },
      { amendment: { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_missing"], basedOnVersion: 2, match: shadowMatch }, options: { existingEventRecordIds: new Set(["raw_1"]) } },
    ];
    for (const c of unattributedCases) {
      const res = evaluateSessionContextAmendment(rich, c.amendment, c.options);
      // Kills a mutant that allows an unattributed or unverified-event shadow amendment.
      expect(res.verdict).toEqual({ selectorId: shadowMatchId, verdict: "refused", reason: "unattributed" });
    }

    const crossSpaceEvent = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_other_tenant"], basedOnVersion: 2, match: shadowMatch },
      { eventScopes: new Map([["raw_other_tenant", sameSpaceScope({ tenantId: "tenant-other" })]]) },
    );
    // Kills a mutant that allows a shadow amendment citing an event from another space.
    expect(crossSpaceEvent.verdict).toEqual({ selectorId: shadowMatchId, verdict: "refused", reason: "outside_rights" });

    // Closed refusal reasons + text UTF-8 byte ceiling (8192 ok, 8193 refused) + null rejection.
    // Kills a mutant that drifts the documented closed refusal set.
    expect(SESSION_CONTEXT_GATE_REFUSAL_REASONS).toEqual([
      "outside_rights",
      "selector_ceiling",
      "unattributed",
      "journal_off",
      "invalid_amendment",
    ]);
    // Kills a mutant that drifts MAX_SELECTOR_TEXT_BYTES from SJ:727 (8192 bytes) or MAX_SELECTOR_REF_BYTES (4096 bytes).
    expect({ text: MAX_SELECTOR_TEXT_BYTES, ref: MAX_SELECTOR_REF_BYTES }).toEqual({ text: 8_192, ref: 4_096 });

    const exact8192 = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 2,
      match: { kind: "text", text: "a".repeat(8_192) },
    });
    // Kills a mutant that uses strict < instead of <= on the 8192-byte text ceiling.
    expect(exact8192.verdict.verdict).toBe("accepted");

    const over8192Utf8 = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 2,
      match: { kind: "text", text: "\u20ac".repeat(2_731) }, // 2731 * 3 = 8193 UTF-8 bytes (< 8192 UTF-16 code units!)
    });
    // Kills a mutant that counts UTF-16 string.length instead of UTF-8 byteLength against 8192 bytes.
    expect(over8192Utf8.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });

    // Ref UTF-8 byte ceiling (4096 ok, 4097 refused).
    const exact4096Ref = "r".repeat(4_096);
    const exact4096RefRes = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: exact4096Ref } },
      { refScopes: new Map([[exact4096Ref, sameSpaceScope()]]) },
    );
    // Kills a mutant that uses strict < instead of <= on MAX_SELECTOR_REF_BYTES (4096 bytes).
    expect(exact4096RefRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "ref", ref: exact4096Ref }),
      verdict: "accepted",
    });

    const over4096RefUtf8 = "\u20ac".repeat(1_365) + "aa"; // 1365 * 3 + 2 = 4097 UTF-8 bytes (1367 UTF-16 code units)
    const over4096RefRes = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: over4096RefUtf8 } },
      { refScopes: new Map([[over4096RefUtf8, sameSpaceScope()]]) },
    );
    // Kills a mutant that drops MAX_SELECTOR_REF_BYTES or checks string.length instead of UTF-8 byteLength.
    expect(over4096RefRes.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });

    // authorModelRef UTF-8 byte ceiling (256 ok, 257 refused).
    const exact256ModelRef = `p:${"m".repeat(254)}`;
    const exact256ModelRes = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "shadow", authorModelRef: exact256ModelRef, sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: { kind: "text", text: "model-ref-256" } },
      { existingEventRecordIds: new Set(["raw_1"]) },
    );
    // Kills a mutant that uses strict < instead of <= on the 256-byte authorModelRef ceiling.
    expect(exact256ModelRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "model-ref-256" }),
      verdict: "accepted",
    });

    const over256ModelRefUtf8 = `p:${"\u20ac".repeat(85)}`; // 2 + 85 * 3 = 257 UTF-8 bytes (87 UTF-16 code units)
    const over256ShadowRes = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "shadow", authorModelRef: over256ModelRefUtf8, sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: { kind: "text", text: "model-ref-257-shadow" } },
      { existingEventRecordIds: new Set(["raw_1"]) },
    );
    // Kills a mutant that drops the 256-byte limit in isValidModelRef or counts UTF-16 code units on shadow amendments.
    expect(over256ShadowRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "model-ref-257-shadow" }),
      verdict: "refused",
      reason: "unattributed",
    });

    const over256AgentRes = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      authorModelRef: over256ModelRefUtf8,
      sourceEventRecordIds: [],
      basedOnVersion: 2,
      match: { kind: "text", text: "model-ref-257-agent" },
    });
    // Kills a mutant that drops the 256-byte limit in isValidModelRef on agent amendments.
    expect(over256AgentRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "model-ref-257-agent" }),
      verdict: "refused",
      reason: "invalid_amendment",
    });

    // sourceEventRecordIds whitespace-only rejection and 512/513-byte UTF-8 boundary.
    const whitespaceEventRes = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: ["   "],
      basedOnVersion: 2,
      match: { kind: "text", text: "whitespace-event-id" },
    });
    // Kills a mutant that drops .trim().length > 0 in isValidEventId and accepts space-only sourceEventRecordIds.
    expect(whitespaceEventRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "whitespace-event-id" }),
      verdict: "refused",
      reason: "invalid_amendment",
    });

    const exact512EventId = "e".repeat(512);
    const exact512EventRes = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [exact512EventId],
      basedOnVersion: 2,
      match: { kind: "text", text: "event-id-512" },
    });
    // Kills a mutant that uses strict < instead of <= on the 512-byte sourceEventRecordId ceiling.
    expect(exact512EventRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "event-id-512" }),
      verdict: "accepted",
    });

    const over512EventIdUtf8 = "\u20ac".repeat(171); // 171 * 3 = 513 UTF-8 bytes (171 UTF-16 code units)
    const over512EventRes = evaluateSessionContextAmendment(rich, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [over512EventIdUtf8],
      basedOnVersion: 2,
      match: { kind: "text", text: "event-id-513" },
    });
    // Kills a mutant that drops the 512-byte limit in isValidEventId or counts UTF-16 code units instead of UTF-8 bytes.
    expect(over512EventRes.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "event-id-513" }),
      verdict: "refused",
      reason: "invalid_amendment",
    });

    const cyclic: Record<string, unknown> = { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2 };
    cyclic.match = cyclic;
    const malformedCases: readonly unknown[] = [
      null,
      "not-an-object",
      [],
      cyclic,
      { op: "keep", by: "agent", authorModelRef: null, sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "ok" } },
      { op: "keep", by: "agent", authorModelRef: 123, sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "ok" } },
      { op: "keep", by: "agent", authorModelRef: "bad-no-colon", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "ok" } },
      { op: "keep", by: "shadow", authorModelRef: 123, sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: { kind: "text", text: "ok" } },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "" } },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "" } },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "withheld", textDigest: independentSha256("secret") } },
      { op: "unknown", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2 },
      { op: "unknown", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, selectorId: `scs_${"0".repeat(64)}` },
      { op: "keep", by: "nobody", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" } },
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "text", text: "x" }, extraField: true },
      { op: "keep", by: "agent", sourceEventRecordIds: [""], basedOnVersion: 2, match: { kind: "text", text: "x" } },
    ];
    for (const malformed of malformedCases) {
      const res = evaluateSessionContextAmendment(rich, malformed as SessionContextAmendmentV1);
      // Kills a mutant that throws uncaught or accepts a malformed/null amendment instead of returning a closed refusal.
      expect(res.verdict.verdict).toBe("refused");
      // Kills a mutant that returns an open/unlisted refusal reason on malformed input.
      expect(SESSION_CONTEXT_GATE_REFUSAL_REASONS.includes(res.verdict.verdict === "refused" ? res.verdict.reason : ("" as never))).toBe(true);
      // Kills a mutant that modifies query on malformed input.
      expect(res.query).toEqual(rich);
    }

    // Non-string authorModelRef on a shadow amendment is refused as invalid_amendment (type error, not unattributed).
    const nonStringShadowModel = evaluateSessionContextAmendment(
      rich,
      { op: "keep", by: "shadow", authorModelRef: 123, sourceEventRecordIds: ["raw_1"], basedOnVersion: 2, match: { kind: "text", text: "ok" } } as unknown as SessionContextAmendmentV1,
      { existingEventRecordIds: new Set(["raw_1"]) },
    );
    // Kills a mutant that fails to classify a non-string authorModelRef as invalid_amendment before shadow attribution.
    expect(nonStringShadowModel.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "ok" }),
      verdict: "refused",
      reason: "invalid_amendment",
    });
  });

  it("t4: beyond maxSelectors the oldest shadow selector goes, and the shadow never evicts an agent selector", () => {
    // Kills a mutant that changes DEFAULT_MAX_SELECTORS from SJ:826 (64).
    expect(DEFAULT_MAX_SELECTORS).toBe(64);
    // Kills a mutant that allows maxSelectorsOverride to raise the workspace limit instead of only lowering it.
    expect(resolveMaxSelectors(3, 10)).toBe(3);
    // Kills a mutant that ignores a lower maxSelectorsOverride.
    expect(resolveMaxSelectors(64, 5)).toBe(5);
    // Kills a mutant that fails to default maxSelectors to 64.
    expect(resolveMaxSelectors()).toBe(64);
    // Kills a mutant that accepts negative or non-integer maxSelectors.
    expect(() => resolveMaxSelectors(-1)).toThrow(RangeError);
    // Kills a mutant that accepts non-integer maxSelectorsOverride.
    expect(() => resolveMaxSelectors(10, 2.5)).toThrow(RangeError);

    const a1 = makeSelector({ kind: "text", text: "agent-1" }, "agent", ["raw_a1"]);
    const a2 = makeSelector({ kind: "text", text: "agent-2" }, "agent", ["raw_a2"]);
    const s1 = makeSelector({ kind: "text", text: "shadow-1" }, "shadow", ["raw_s1"], SHADOW_MODEL);
    const s2 = makeSelector({ kind: "text", text: "shadow-2" }, "shadow", ["raw_s2"], SHADOW_MODEL);

    // Interleaved [agent-1, shadow-1, shadow-2] at ceiling 3: adding shadow-3 evicts shadow-1 (oldest shadow, NOT agent-1 and NOT shadow-2).
    const qInterleaved = makeQuery({ version: 4, selectors: [a1, s1, s2] });
    const s3Match: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "shadow-3" };
    const s3Expected = makeSelector(s3Match, "shadow", ["raw_s3"], SHADOW_MODEL);
    const res1 = evaluateSessionContextAmendment(
      qInterleaved,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_s3"], basedOnVersion: 4, match: s3Match },
      { maxSelectors: 3, existingEventRecordIds: new Set(["raw_s3"]) },
    );
    const expectedDigest1 = independentQueryDigest({
      schemaVersion: qInterleaved.schemaVersion,
      queryId: qInterleaved.queryId,
      version: 5,
      tenantId: qInterleaved.tenantId,
      workspaceId: qInterleaved.workspaceId,
      derivedWorktreeId: qInterleaved.derivedWorktreeId,
      roleRef: qInterleaved.roleRef,
      mandateDigest: qInterleaved.mandateDigest,
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [a1, s2, s3Expected],
    });
    // Kills a mutant that refuses a keep when a shadow selector is available to evict.
    expect(res1.verdict).toEqual({ selectorId: s3Expected.selectorId, verdict: "accepted" });
    // Kills a mutant that evicts selectors[0] (agent-1) or newest shadow (shadow-2) instead of oldest shadow (shadow-1).
    expect(res1.query.selectors).toEqual([a1, s2, s3Expected]);
    // Kills a mutant that fails to report the exact evicted shadow selectorId.
    expect(res1.evictedSelectorIds).toEqual([s1.selectorId]);
    // Kills a mutant that miscomputes version or digest after eviction.
    expect({ version: res1.query.version, digest: res1.query.digest }).toEqual({ version: 5, digest: expectedDigest1 });

    // Interleaved [agent-1, shadow-1, agent-2] at ceiling 3: agent keep ALSO evicts shadow-1 (the middle shadow selector).
    const qMiddleShadow = makeQuery({ version: 4, selectors: [a1, s1, a2] });
    const a3Match: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "agent-3" };
    const a3Expected = makeSelector(a3Match, "agent", ["raw_a3"]);
    const resMiddle = evaluateSessionContextAmendment(
      qMiddleShadow,
      { op: "keep", by: "agent", sourceEventRecordIds: ["raw_a3"], basedOnVersion: 4, match: a3Match },
      { maxSelectors: 3 },
    );
    // Kills a mutant that evicts index 0 instead of the oldest shadow selector in the middle.
    expect(resMiddle.query.selectors).toEqual([a1, a2, a3Expected]);
    // Kills a mutant that reports the wrong evicted id for a middle shadow eviction.
    expect(resMiddle.evictedSelectorIds).toEqual([s1.selectorId]);

    // All selectors are the agent's ([agent-1, agent-2], maxSelectors: 2): shadow keep -> refused selector_ceiling.
    const qAllAgent = makeQuery({ version: 3, selectors: [a1, a2] });
    const shadowBlocked = evaluateSessionContextAmendment(
      qAllAgent,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_s4"], basedOnVersion: 3, match: { kind: "text", text: "shadow-4" } },
      { maxSelectors: 2, existingEventRecordIds: new Set(["raw_s4"]) },
    );
    // Kills a mutant that allows the shadow to evict an agent selector at ceiling.
    expect(shadowBlocked.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "shadow-4" }),
      verdict: "refused",
      reason: "selector_ceiling",
    });
    // Kills a mutant that modifies query or version when shadow hits all-agent ceiling.
    expect(shadowBlocked.query).toEqual(qAllAgent);
    // Kills a mutant that reports evictions on selector_ceiling refusal.
    expect(shadowBlocked.evictedSelectorIds).toEqual([]);

    // All selectors are the agent's: agent keep of a new subject -> ALSO refused selector_ceiling (SJ:162).
    const agentBlocked = evaluateSessionContextAmendment(
      qAllAgent,
      { op: "keep", by: "agent", sourceEventRecordIds: ["raw_a4"], basedOnVersion: 3, match: { kind: "text", text: "agent-4" } },
      { maxSelectors: 2 },
    );
    // Kills a mutant that lets agent silently evict another agent selector instead of refusing selector_ceiling.
    expect(agentBlocked.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "agent-4" }),
      verdict: "refused",
      reason: "selector_ceiling",
    });
    // Kills a mutant that alters selectors when all-agent keep is refused.
    expect(agentBlocked.query.selectors).toEqual([a1, a2]);

    // Re-keeping an already-kept agent selector while at all-agent ceiling -> no_change (NOT selector_ceiling!).
    const dupAtCeiling = evaluateSessionContextAmendment(
      qAllAgent,
      { op: "keep", by: "agent", sourceEventRecordIds: ["raw_a5"], basedOnVersion: 3, match: { kind: "text", text: "agent-1" } },
      { maxSelectors: 2 },
    );
    // Kills a mutant that checks selector_ceiling before idempotency (no_change).
    expect(dupAtCeiling.verdict).toEqual({ selectorId: a1.selectorId, verdict: "no_change" });

    // Lowered override below current length: [shadow-1, shadow-2, agent-1] with override 2 evicts both shadows to fit new selector.
    const qLowered = makeQuery({ version: 4, selectors: [s1, s2, a1] });
    const loweredOk = evaluateSessionContextAmendment(
      qLowered,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_s3"], basedOnVersion: 4, match: s3Match },
      { maxSelectors: 4, maxSelectorsOverride: 2, existingEventRecordIds: new Set(["raw_s3"]) },
    );
    // Kills a mutant that evicts only 1 shadow when a lowered ceiling requires evicting multiple shadows.
    expect(loweredOk.query.selectors).toEqual([a1, s3Expected]);
    // Kills a mutant that omits any evicted shadow id when multiple shadows are evicted.
    expect(loweredOk.evictedSelectorIds).toEqual([s1.selectorId, s2.selectorId]);

    // Lowered override where not enough shadows exist ([shadow-1, agent-1, agent-2], override 2) -> refused selector_ceiling.
    const qLoweredBlocked = makeQuery({ version: 4, selectors: [s1, a1, a2] });
    const loweredRefused = evaluateSessionContextAmendment(
      qLoweredBlocked,
      { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_s3"], basedOnVersion: 4, match: s3Match },
      { maxSelectors: 4, maxSelectorsOverride: 2, existingEventRecordIds: new Set(["raw_s3"]) },
    );
    // Kills a mutant that exceeds maxSelectors or evicts an agent selector when shadows alone cannot restore the lowered ceiling.
    expect(loweredRefused.verdict).toEqual({ selectorId: s3Expected.selectorId, verdict: "refused", reason: "selector_ceiling" });
    // Kills a mutant that partially mutates selectors before failing the lowered-ceiling check.
    expect(loweredRefused.query).toEqual(qLoweredBlocked);

    // maxSelectors: 0 refuses any new keep with selector_ceiling (even when a shadow selector is present).
    const zeroCeiling = evaluateSessionContextAmendment(
      makeQuery({ version: 1, selectors: [s1] }),
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 1, match: { kind: "text", text: "zero-cap" } },
      { maxSelectors: 0 },
    );
    // Kills a mutant that allows adding a selector when maxSelectors is 0.
    expect(zeroCeiling.verdict).toEqual({
      selectorId: independentSelectorId({ kind: "text", text: "zero-cap" }),
      verdict: "refused",
      reason: "selector_ceiling",
    });
  });

  it("t5: a late basedOnVersion runs against the current version", () => {
    const v1 = makeQuery({ version: 1, selectors: [] });

    // basedOnVersion: 0 against version 1 (SJ:666 t5, SJ-6b t8) -> accepted, produces version 2.
    const m0: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "before-v1-subject" };
    const fromZero = evaluateSessionContextAmendment(v1, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: ["raw_0"],
      basedOnVersion: 0,
      match: m0,
    });
    const sel0 = makeSelector(m0, "agent", ["raw_0"]);
    // Kills a mutant that refuses basedOnVersion === 0 against version 1.
    expect(fromZero.verdict).toEqual({ selectorId: sel0.selectorId, verdict: "accepted" });
    // Kills a mutant that sets version to basedOnVersion + 1 (1) instead of query.version + 1 (2).
    expect(fromZero.query.version).toBe(2);
    // Kills a mutant that fails to store the selector when basedOnVersion is 0.
    expect(fromZero.query.selectors).toEqual([sel0]);

    // Two late amendments on different selectors, both based on v1, both apply sequentially against current version.
    const mA: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "late-subject-A" };
    const mB: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "late-subject-B" };
    const lateA = evaluateSessionContextAmendment(fromZero.query, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: ["raw_A"],
      basedOnVersion: 1,
      match: mA,
    });
    const selA = makeSelector(mA, "agent", ["raw_A"]);
    // Kills a mutant that refuses a late basedOnVersion (< query.version).
    expect(lateA.verdict).toEqual({ selectorId: selA.selectorId, verdict: "accepted" });
    // Kills a mutant that computes version from basedOnVersion instead of current query.version (2 -> 3).
    expect(lateA.query.version).toBe(3);

    const lateB = evaluateSessionContextAmendment(
      lateA.query,
      {
        op: "keep",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: ["raw_B"],
        basedOnVersion: 1,
        match: mB,
      },
      { existingEventRecordIds: new Set(["raw_B"]) },
    );
    const selB = makeSelector(mB, "shadow", ["raw_B"], SHADOW_MODEL);
    const expectedV4Digest = independentQueryDigest({
      schemaVersion: v1.schemaVersion,
      queryId: v1.queryId,
      version: 4,
      tenantId: v1.tenantId,
      workspaceId: v1.workspaceId,
      derivedWorktreeId: v1.derivedWorktreeId,
      roleRef: v1.roleRef,
      mandateDigest: v1.mandateDigest,
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [sel0, selA, selB],
    });
    // Kills a mutant that drops the second late amendment or loses the first when both are based on v1.
    expect(lateB.verdict).toEqual({ selectorId: selB.selectorId, verdict: "accepted" });
    // Kills a mutant that fails to keep all three selectors across two late amendments.
    expect(lateB.query.selectors).toEqual([sel0, selA, selB]);
    // Kills a mutant that miscomputes version or digest after applying two late amendments.
    expect({ version: lateB.query.version, digest: lateB.query.digest }).toEqual({ version: 4, digest: expectedV4Digest });

    // Same selector, later amendment in journal order wins (both late, basedOnVersion: 1): drop after keep -> absent; keep after drop -> present.
    const lateDropA = evaluateSessionContextAmendment(lateB.query, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: ["raw_drop_A"],
      basedOnVersion: 1,
      selectorId: selA.selectorId,
    });
    // Kills a mutant that rejects a late drop against a newer current version.
    expect(lateDropA.verdict).toEqual({ selectorId: selA.selectorId, verdict: "accepted" });
    // Kills a mutant that fails to remove selA when late drop runs after keep.
    expect(lateDropA.query.selectors).toEqual([sel0, selB]);
    // Kills a mutant that does not bump version to 5 on late drop.
    expect(lateDropA.query.version).toBe(5);

    const lateReKeepA = evaluateSessionContextAmendment(lateDropA.query, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: ["raw_rekeep_A"],
      basedOnVersion: 1,
      match: mA,
    });
    const selAReKept = makeSelector(mA, "agent", ["raw_rekeep_A"]);
    // Kills a mutant that prevents a later keep in journal order from overriding an earlier drop.
    expect(lateReKeepA.verdict).toEqual({ selectorId: selA.selectorId, verdict: "accepted" });
    // Kills a mutant that fails to restore selA when keep arrives after drop.
    expect(lateReKeepA.query.selectors).toEqual([sel0, selB, selAReKept]);

    // Invalid basedOnVersion: negative, non-integer, future (> query.version) -> refused invalid_amendment.
    for (const badVersion of [-1, 1.5, Number.NaN, lateReKeepA.query.version + 1]) {
      const badRes = evaluateSessionContextAmendment(lateReKeepA.query, {
        op: "keep",
        by: "agent",
        sourceEventRecordIds: [],
        basedOnVersion: badVersion,
        match: { kind: "text", text: "bad-version-probe" },
      });
      // Kills a mutant that accepts negative, fractional, NaN, or future (> query.version) basedOnVersion.
      expect(badRes.verdict.verdict).toBe("refused");
      // Kills a mutant that returns an unexpected refusal reason for invalid basedOnVersion.
      expect(badRes.verdict.verdict === "refused" ? badRes.verdict.reason : "").toBe("invalid_amendment");
    }

    // Invalid query.version (< 1) fails closed with RangeError.
    const invalidVersionQuery = makeQuery({ version: 0 });
    // Kills a mutant that accepts a corrupted query with version < 1.
    expect(() =>
      evaluateSessionContextAmendment(invalidVersionQuery, {
        op: "keep",
        by: "agent",
        sourceEventRecordIds: [],
        basedOnVersion: 0,
        match: { kind: "text", text: "x" },
      }),
    ).toThrow(RangeError);
  });

  it("t6: selectorId is scs_ and the digest of the stored match", () => {
    const textMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "line1\n\"quoted\"\\slash" };
    const expectedTextId = independentSelectorId(textMatch);
    const derivedTextId = deriveSessionContextSelectorId(textMatch);

    // Kills a mutant that omits the 'scs_' prefix, truncates the digest, or uses uppercase hex.
    expect(/^scs_[0-9a-f]{64}$/.test(derivedTextId)).toBe(true);
    // Kills a mutant that hashes raw text instead of RFC 8785 JCS of the full stored match object.
    expect(derivedTextId).toBe(expectedTextId);
    // Kills a mutant that hashes only match.text without { kind: 'text', text }.
    expect(derivedTextId).not.toBe(`scs_${sha256Hex(textMatch.text)}`);

    // Key order independence (JCS sorts object keys lexicographically).
    const reordered = { text: textMatch.text, kind: "text" } as unknown as SessionContextStoredSelectorMatchV1;
    // Kills a mutant that uses JSON.stringify key-insertion order instead of RFC 8785 JCS.
    expect(deriveSessionContextSelectorId(reordered)).toBe(expectedTextId);

    // Unicode NFC normalization equivalence: NFD 'cafe\u0301' and NFC 'caf\u00e9' derive the exact same selectorId.
    const nfdId = deriveSessionContextSelectorId({ kind: "text", text: "cafe\u0301" });
    const nfcId = deriveSessionContextSelectorId({ kind: "text", text: "caf\u00e9" });
    const expectedCafeId = independentSelectorId({ kind: "text", text: "caf\u00e9" });
    // Kills a mutant that skips NFC canonicalization before hashing stored match bytes.
    expect(nfdId).toBe(expectedCafeId);
    // Kills a mutant that gives different selectorIds for NFD vs NFC equivalent subjects.
    expect(nfdId).toBe(nfcId);

    // Stored match kind is part of the digest: { kind: 'text', text: 'src/retry.ts' } !== { kind: 'ref', ref: 'src/retry.ts' }.
    const asTextId = deriveSessionContextSelectorId({ kind: "text", text: "src/retry.ts" });
    const asRefId = deriveSessionContextSelectorId({ kind: "ref", ref: "src/retry.ts" });
    // Kills a mutant that ignores the kind discriminant when deriving selectorId.
    expect(asTextId).toBe(independentSelectorId({ kind: "text", text: "src/retry.ts" }));
    // Kills a mutant that hashes text and ref identically.
    expect(asRefId).toBe(independentSelectorId({ kind: "ref", ref: "src/retry.ts" }));
    // Kills a mutant that collides a text match and a ref match with the same string payload.
    expect(asTextId).not.toBe(asRefId);

    // isValidSessionContextSelectorId accepts scs_ + 64 lowercase hex and rejects everything else.
    // Kills a mutant that rejects a valid scs_ + 64 lowercase hex selectorId.
    expect(isValidSessionContextSelectorId(expectedTextId)).toBe(true);
    for (const invalidId of [
      `sha256:${"a".repeat(64)}`,
      `scs_${"A".repeat(64)}`,
      `scs_${"a".repeat(63)}`,
      `scs_${"a".repeat(65)}`,
      `scs_${"g".repeat(64)}`,
      "",
      null,
      123,
    ]) {
      // Kills a mutant that weakens selectorId format validation.
      expect(isValidSessionContextSelectorId(invalidId)).toBe(false);
    }

    // deriveSessionContextSelectorId rejects 'withheld' match (output-only, never stored).
    // Kills a mutant that derives a selectorId from a withheld projection instead of refusing it.
    expect(() =>
      deriveSessionContextSelectorId({
        kind: "withheld",
        textDigest: independentSha256("other session text"),
      } as unknown as SessionContextStoredSelectorMatchV1),
    ).toThrow(RangeError);

    // A withheld D6 projection keeps the original stored match's selectorId (SJ:666 t6, SJ:731, SJ:892) and can be dropped by that id!
    const storedText = "other session confidential topic";
    const storedMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: storedText };
    const storedSelector = makeSelector(storedMatch, "shadow", ["raw_other_1"], SHADOW_MODEL);
    const projected = projectSelectorWithheld(storedSelector);
    const expectedTextDigest = independentSha256(storedText);

    // Kills a mutant that recomputes selectorId from the withheld match instead of preserving the stored match's selectorId.
    expect(projected.selectorId).toBe(storedSelector.selectorId);
    // Kills a mutant whose projected selectorId accidentally hashes the withheld object.
    expect(projected.selectorId).not.toBe(`scs_${sha256Hex(independentJcs({ kind: "withheld", textDigest: expectedTextDigest }))}`);
    // Kills a mutant that leaks raw text or miscomputes textDigest in a withheld projection.
    expect(projected.match).toEqual({ kind: "withheld", textDigest: expectedTextDigest });
    // Kills a mutant that drops author or source provenance during withheld projection.
    expect({
      by: projected.by,
      authorModelRef: projected.authorModelRef,
      sourceEventRecordIds: projected.sourceEventRecordIds,
    }).toEqual({
      by: "shadow",
      authorModelRef: SHADOW_MODEL,
      sourceEventRecordIds: ["raw_other_1"],
    });

    // Projecting an agent selector without authorModelRef keeps authorModelRef absent (no undefined/null own key).
    const agentStored = makeSelector(storedMatch, "agent", ["raw_a1"]);
    const agentProjected = projectSelectorWithheld(agentStored);
    // Kills a mutant that inserts authorModelRef: undefined on withheld projection of an agent selector.
    expect(Object.hasOwn(agentProjected, "authorModelRef")).toBe(false);

    // Projecting a ref selector preserves its selectorId and ref match unchanged.
    const refStored = makeSelector({ kind: "ref", ref: "rec_99" }, "agent", ["raw_r1"]);
    const refProjected = projectSelectorWithheld(refStored);
    // Kills a mutant that turns a ref selector into withheld or mutates its selectorId.
    expect(refProjected).toEqual(refStored);

    // A reader who only saw the withheld projection can drop the selector using projected.selectorId alone.
    const qWithStored = makeQuery({ version: 2, selectors: [storedSelector] });
    const dropViaProjectedId = evaluateSessionContextAmendment(qWithStored, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: ["raw_drop_withheld"],
      basedOnVersion: 2,
      selectorId: projected.selectorId,
    });
    // Kills a mutant that fails to match a withheld projection's selectorId against the stored selector on drop.
    expect(dropViaProjectedId.verdict).toEqual({ selectorId: storedSelector.selectorId, verdict: "accepted" });
    // Kills a mutant that leaves the selector behind when dropped by its projected selectorId.
    expect(dropViaProjectedId.query.selectors).toEqual([]);
  });

  it("t7: JSON-parsed __proto__ keys with null or primitive values are refused as invalid_amendment", () => {
    const base = makeQuery({ version: 1, selectors: [] });
    const validId = independentSelectorId({ kind: "text", text: "hi" });
    const protoPayloads: readonly string[] = [
      '{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":1,"match":{"kind":"text","text":"hi"},"__proto__":null}',
      '{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":1,"match":{"kind":"text","text":"hi"},"__proto__":123}',
      '{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":1,"match":{"kind":"text","text":"hi","__proto__":null}}',
      '{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":1,"match":{"kind":"text","text":"hi","__proto__":123}}',
      `{"op":"drop","by":"agent","sourceEventRecordIds":[],"basedOnVersion":1,"selectorId":"${validId}","__proto__":null}`,
      '{"op":"keep","by":"agent","sourceEventRecordIds":[{"__proto__":null}],"basedOnVersion":1,"match":{"kind":"text","text":"hi"}}',
    ];
    for (const rawJson of protoPayloads) {
      const parsed = JSON.parse(rawJson) as SessionContextAmendmentV1;
      const res = evaluateSessionContextAmendment(base, parsed);
      // Kills a mutant that normalizes JSON-parsed __proto__ keys via plain object assignment instead of rejecting them as invalid_amendment.
      expect(res.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
      // Kills a mutant that mutates or advances query when a JSON-parsed __proto__ payload is supplied.
      expect(res.query).toEqual(base);
    }

    for (const rawMatchJson of [
      '{"kind":"text","text":"hi","__proto__":null}',
      '{"kind":"text","text":"hi","__proto__":123}',
      '{"kind":"ref","ref":"src/a.ts","__proto__":null}',
    ]) {
      const parsedMatch = JSON.parse(rawMatchJson) as SessionContextStoredSelectorMatchV1;
      // Kills a mutant that accepts a JSON-parsed __proto__ key inside parseStoredMatch / deriveSessionContextSelectorId.
      expect(() => deriveSessionContextSelectorId(parsedMatch)).toThrow(RangeError);
    }
  });

  it("t8: drop on pre-existing duplicate selectors refuses shadow if any copy is agent-owned and removes every copy on agent drop", () => {
    const dupMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "duplicate-subject" };
    const otherMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "survivor-subject" };
    const dupId = independentSelectorId(dupMatch);
    const shadowCopy = makeSelector(dupMatch, "shadow", ["raw_s1"], SHADOW_MODEL);
    const agentCopy = makeSelector(dupMatch, "agent", ["raw_a1"]);
    const otherAgent = makeSelector(otherMatch, "agent", ["raw_other"]);

    // Pre-existing query with duplicate selectorId: shadow at index 0, agent at index 1.
    const qDupMixed = makeQuery({ version: 3, selectors: [shadowCopy, agentCopy, otherAgent] });

    // Shadow drop must inspect ALL copies and refuse outside_rights because an agent copy holds dupId.
    const shadowDropMixed = evaluateSessionContextAmendment(
      qDupMixed,
      {
        op: "drop",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: ["raw_s2"],
        basedOnVersion: 3,
        selectorId: dupId,
      },
      { existingEventRecordIds: new Set(["raw_s2"]) },
    );
    // Kills a mutant that checks only findIndex(...).by === 'agent' on duplicate selectors and lets shadow drop instead of refusing outside_rights.
    expect(shadowDropMixed.verdict).toEqual({ selectorId: dupId, verdict: "refused", reason: "outside_rights" });
    // Kills a mutant that removes any duplicate entry or bumps version when shadow drop of an agent-held duplicate is refused.
    expect(shadowDropMixed.query).toEqual(qDupMixed);

    // Agent drop must remove ALL copies of dupId, leaving only otherAgent.
    const agentDropMixed = evaluateSessionContextAmendment(qDupMixed, {
      op: "drop",
      by: "agent",
      sourceEventRecordIds: ["raw_a2"],
      basedOnVersion: 3,
      selectorId: dupId,
    });
    const expectedMixedDigest = independentQueryDigest({
      schemaVersion: qDupMixed.schemaVersion,
      queryId: qDupMixed.queryId,
      version: 4,
      tenantId: qDupMixed.tenantId,
      workspaceId: qDupMixed.workspaceId,
      derivedWorktreeId: qDupMixed.derivedWorktreeId,
      roleRef: qDupMixed.roleRef,
      mandateDigest: qDupMixed.mandateDigest,
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [otherAgent],
    });
    // Kills a mutant that refuses an agent drop on duplicate selectors.
    expect(agentDropMixed.verdict).toEqual({ selectorId: dupId, verdict: "accepted" });
    // Kills a mutant that filters only index !== idx and leaves duplicate copies of selectorId active.
    expect(agentDropMixed.query.selectors).toEqual([otherAgent]);
    // Kills a mutant that miscomputes version or digest after removing all duplicate copies.
    expect({ version: agentDropMixed.query.version, digest: agentDropMixed.query.digest }).toEqual({
      version: 4,
      digest: expectedMixedDigest,
    });

    // Shadow drop on duplicate shadow-only copies removes every copy of dupId.
    const shadowCopy2 = makeSelector(dupMatch, "shadow", ["raw_s3"], SHADOW_MODEL);
    const qDupShadowOnly = makeQuery({ version: 5, selectors: [shadowCopy, otherAgent, shadowCopy2] });
    const shadowDropAllShadow = evaluateSessionContextAmendment(
      qDupShadowOnly,
      {
        op: "drop",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: ["raw_s4"],
        basedOnVersion: 5,
        selectorId: dupId,
      },
      { existingEventRecordIds: new Set(["raw_s4"]) },
    );
    // Kills a mutant that refuses a shadow drop when all duplicate copies are shadow-owned.
    expect(shadowDropAllShadow.verdict).toEqual({ selectorId: dupId, verdict: "accepted" });
    // Kills a mutant that leaves a second shadow duplicate copy behind after shadow drop.
    expect(shadowDropAllShadow.query.selectors).toEqual([otherAgent]);
    // Kills a mutant that fails to bump version when dropping duplicate shadow copies.
    expect(shadowDropAllShadow.query.version).toBe(6);
  });

  it("t9: query.version at Number.MAX_SAFE_INTEGER throws RangeError while MAX_SAFE_INTEGER - 1 advances cleanly", () => {
    const atMaxSafe = makeQuery({ version: Number.MAX_SAFE_INTEGER, selectors: [] });
    // Kills a mutant that omits !Number.isSafeInteger(query.version + 1) and lets canonicalizeJcs throw CanonicalJsonError instead of RangeError.
    expect(() =>
      evaluateSessionContextAmendment(atMaxSafe, {
        op: "keep",
        by: "agent",
        sourceEventRecordIds: [],
        basedOnVersion: Number.MAX_SAFE_INTEGER,
        match: { kind: "text", text: "overflow-version" },
      }),
    ).toThrow(RangeError);

    const belowMaxSafe = makeQuery({ version: Number.MAX_SAFE_INTEGER - 1, selectors: [] });
    const match: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "last-safe-version" };
    const expectedSel = makeSelector(match, "agent", []);
    const expectedMaxDigest = independentQueryDigest({
      schemaVersion: belowMaxSafe.schemaVersion,
      queryId: belowMaxSafe.queryId,
      version: Number.MAX_SAFE_INTEGER,
      tenantId: belowMaxSafe.tenantId,
      workspaceId: belowMaxSafe.workspaceId,
      derivedWorktreeId: belowMaxSafe.derivedWorktreeId,
      roleRef: belowMaxSafe.roleRef,
      mandateDigest: belowMaxSafe.mandateDigest,
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [expectedSel],
    });
    const res = evaluateSessionContextAmendment(belowMaxSafe, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: Number.MAX_SAFE_INTEGER - 1,
      match,
    });
    // Kills a mutant that over-tightens query.version validation and rejects MAX_SAFE_INTEGER - 1.
    expect(res.verdict).toEqual({ selectorId: expectedSel.selectorId, verdict: "accepted" });
    // Kills a mutant that miscomputes version or digest when advancing to Number.MAX_SAFE_INTEGER.
    expect({ version: res.query.version, digest: res.query.digest }).toEqual({
      version: Number.MAX_SAFE_INTEGER,
      digest: expectedMaxDigest,
    });
  });

  it("t10: resolveMaxSelectors normalizes -0 to +0 for workspaceLimit and overrideLimit", () => {
    // Kills a mutant that returns -0 from resolveMaxSelectors(-0).
    expect(Object.is(resolveMaxSelectors(-0), 0)).toBe(true);
    // Kills a mutant that returns -0 from resolveMaxSelectors(10, -0).
    expect(Object.is(resolveMaxSelectors(10, -0), 0)).toBe(true);
    // Kills a mutant that returns -0 from resolveMaxSelectors(-0, 10).
    expect(Object.is(resolveMaxSelectors(-0, 10), 0)).toBe(true);
    // Kills a mutant that returns -0 from resolveMaxSelectors(0, -0).
    expect(Object.is(resolveMaxSelectors(0, -0), 0)).toBe(true);
  });

  it("t11: buildNextQuery omits explicit undefined optional properties on trackScope and ontologies entries", () => {
    const cleanTrack1: SessionTrackScopeRefV1 = {
      repoKey: "engram",
      workspace: WORKSPACE_ID,
      aggregateId: "US-201",
      role: "primary",
      aggregateKind: "user_story",
    };
    const cleanTrack2: SessionTrackScopeRefV1 = {
      repoKey: "engram",
      workspace: WORKSPACE_ID,
      aggregateId: "US-202",
      role: "supporting",
      aggregateKind: "epic",
      baselineCommit: "cf695249f",
    };
    const cleanOntology: OntologyTemplateEnvelopeRef = {
      lineage: "track",
      templateId: "track-core",
      templateVersion: "1.0.0",
      templateDigestSha256: `sha256:${"4".repeat(64)}` as Sha256Digest,
    };
    const trackWithUndefined: SessionTrackScopeRefV1 = {
      ...cleanTrack1,
      baselineCommit: undefined,
      decisionGateId: undefined,
      decisionGateDigest: undefined,
    };
    const ontologyWithUndefined = {
      ...cleanOntology,
      optionalMeta: undefined,
    } as unknown as OntologyTemplateEnvelopeRef;

    const baseClean = makeQuery({
      version: 1,
      trackScope: [cleanTrack1, cleanTrack2],
      ontologies: [cleanOntology],
      selectors: [],
    });
    const queryWithUndefinedOptionals: SessionContextQueryV1 = deepFreeze({
      ...baseClean,
      trackScope: [trackWithUndefined, cleanTrack2],
      ontologies: [ontologyWithUndefined],
    });

    const match: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "omit-undefined-optionals" };
    const expectedSel = makeSelector(match, "agent", []);
    const expectedDigest = independentQueryDigest({
      schemaVersion: baseClean.schemaVersion,
      queryId: baseClean.queryId,
      version: 2,
      tenantId: baseClean.tenantId,
      workspaceId: baseClean.workspaceId,
      derivedWorktreeId: baseClean.derivedWorktreeId,
      roleRef: baseClean.roleRef,
      mandateDigest: baseClean.mandateDigest,
      trackScope: [cleanTrack1, cleanTrack2],
      ontologies: [cleanOntology],
      pinnedEventRecordIds: ["raw_req_1"],
      selectors: [expectedSel],
    });

    const res = evaluateSessionContextAmendment(queryWithUndefinedOptionals, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 1,
      match,
    });
    // Kills a mutant that keeps explicit undefined keys on trackScope/ontologies entries and throws CanonicalJsonError.
    expect(res.verdict).toEqual({ selectorId: expectedSel.selectorId, verdict: "accepted" });
    // Kills a mutant that retains undefined own keys on cloned trackScope entries or drops defined optional fields.
    expect(res.query.trackScope).toEqual([cleanTrack1, cleanTrack2]);
    // Kills a mutant that keeps baselineCommit as an own undefined property on trackScope[0].
    expect(Object.hasOwn(res.query.trackScope[0]!, "baselineCommit")).toBe(false);
    // Kills a mutant that retains undefined own keys on cloned ontologies entries.
    expect(res.query.ontologies).toEqual([cleanOntology]);
    // Kills a mutant that keeps optionalMeta as an own undefined property on ontologies[0].
    expect(Object.hasOwn(res.query.ontologies[0]!, "optionalMeta")).toBe(false);
    // Kills a mutant that computes a non-canonical digest when stripping undefined optional properties.
    expect(res.query.digest).toBe(expectedDigest);
  });

  it("t12: total rights table covers every (target role × sessionPseudoId) × (role-scoped vs unassigned) cell for agent and shadow on refs and cited events", () => {
    const roleQuery = makeQuery({ version: 2, selectors: [] });
    const roleCaller = sameSpaceScope({ sessionPseudoId: "sess_builder_1" });
    const unassignedQuery = makeUnassignedQuery({ version: 2, selectors: [] });
    const unassignedCaller: SessionContextRightsScopeV1 = deepFreeze({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      sessionPseudoId: "sess_unassigned_1",
    });

    interface RightsCellCase {
      readonly label: string;
      readonly query: SessionContextQueryV1;
      readonly callerScope?: SessionContextRightsScopeV1;
      readonly target: SessionContextRightsScopeV1;
      readonly expected: "allowed" | "outside_rights";
    }

    const cells: readonly RightsCellCase[] = [
      // Column 1: Role-scoped query (roleRef set)
      {
        label: "role query × target(role=same, session=unset)",
        query: roleQuery,
        callerScope: roleCaller,
        target: sameSpaceScope(),
        expected: "allowed",
      },
      {
        label: "role query × target(role=other, session=unset)",
        query: roleQuery,
        callerScope: roleCaller,
        target: sameSpaceScope({ roleRef: OTHER_ROLE_REF }),
        expected: "outside_rights",
      },
      {
        label: "role query × target(role=same, session=other-cli)",
        query: roleQuery,
        callerScope: roleCaller,
        target: sameSpaceScope({ sessionPseudoId: "sess_builder_other_cli" }),
        expected: "allowed",
      },
      {
        label: "role query × target(role=other, session=same-as-caller)",
        query: roleQuery,
        callerScope: roleCaller,
        target: sameSpaceScope({ roleRef: OTHER_ROLE_REF, sessionPseudoId: "sess_builder_1" }),
        expected: "outside_rights",
      },
      {
        label: "role query × target(role=unset, session=unset) workspace-level",
        query: roleQuery,
        callerScope: roleCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID },
        expected: "allowed",
      },
      {
        label: "role query × target(role=unset, session=unassigned-other) [Finding 1]",
        query: roleQuery,
        callerScope: roleCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_unassigned_other" },
        expected: "outside_rights",
      },
      {
        label: "role query × target(role=unset, session=same-as-caller) [Finding 1]",
        query: roleQuery,
        callerScope: roleCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_builder_1" },
        expected: "outside_rights",
      },
      {
        label: "role query × target(role=same, mandate=other)",
        query: roleQuery,
        callerScope: roleCaller,
        target: sameSpaceScope({ mandateDigest: OTHER_MANDATE_DIGEST }),
        expected: "outside_rights",
      },
      // Column 2: Unassigned-session query (roleRef unset)
      {
        label: "unassigned query × target(role=set, session=unset)",
        query: unassignedQuery,
        callerScope: unassignedCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, roleRef: ROLE_REF },
        expected: "outside_rights",
      },
      {
        label: "unassigned query × target(role=set, session=same-as-caller)",
        query: unassignedQuery,
        callerScope: unassignedCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, roleRef: ROLE_REF, sessionPseudoId: "sess_unassigned_1" },
        expected: "outside_rights",
      },
      {
        label: "unassigned query × target(role=unset, session=unset) workspace-level",
        query: unassignedQuery,
        callerScope: unassignedCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID },
        expected: "allowed",
      },
      {
        label: "unassigned query × target(role=unset, session=unset, mandate=set)",
        query: unassignedQuery,
        callerScope: unassignedCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, mandateDigest: MANDATE_DIGEST },
        expected: "outside_rights",
      },
      {
        label: "unassigned query × target(role=unset, session=own)",
        query: unassignedQuery,
        callerScope: unassignedCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_unassigned_1" },
        expected: "allowed",
      },
      {
        label: "unassigned query × target(role=unset, session=other)",
        query: unassignedQuery,
        callerScope: unassignedCaller,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_unassigned_2" },
        expected: "outside_rights",
      },
      {
        label: "unassigned query × target(role=unset, session=set) without callerScope",
        query: unassignedQuery,
        callerScope: undefined,
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_unassigned_1" },
        expected: "outside_rights",
      },
      {
        label: "unassigned query × target(role=unset, session=empty-string)",
        query: unassignedQuery,
        callerScope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "" },
        target: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "" },
        expected: "outside_rights",
      },
    ];

    for (const [idx, c] of cells.entries()) {
      const refName = `rec_cell_${idx}`;
      const evName = `raw_cell_${idx}`;
      const refMatch: SessionContextStoredSelectorMatchV1 = { kind: "ref", ref: refName };
      const textMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: `event-cell-${idx}` };
      const expectedRefId = independentSelectorId(refMatch);
      const expectedTextId = independentSelectorId(textMatch);
      const expectedVerdict = (id: string) =>
        c.expected === "allowed"
          ? { selectorId: id, verdict: "accepted" }
          : { selectorId: id, verdict: "refused", reason: "outside_rights" };
      const baseOpts: SessionContextGateOptionsV1 = c.callerScope === undefined ? {} : { callerScope: c.callerScope };

      // 1. Agent ref selector
      const agentRef = evaluateSessionContextAmendment(
        c.query,
        { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: c.query.version, match: refMatch },
        { ...baseOpts, refScopes: new Map([[refName, c.target]]) },
      );
      // Kills a mutant that breaks any rights-table cell for agent ref selectors.
      expect(agentRef.verdict, `${c.label} [agent ref]`).toEqual(expectedVerdict(expectedRefId));

      // 2. Shadow ref selector (citing an in-space event so only refScopes decides)
      const shadowRef = evaluateSessionContextAmendment(
        c.query,
        { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_ok"], basedOnVersion: c.query.version, match: refMatch },
        { ...baseOpts, existingEventRecordIds: new Set(["raw_ok"]), refScopes: new Map([[refName, c.target]]) },
      );
      // Kills a mutant that breaks any rights-table cell for shadow ref selectors.
      expect(shadowRef.verdict, `${c.label} [shadow ref]`).toEqual(expectedVerdict(expectedRefId));

      // 3. Agent cited event in eventScopes (Finding 4: agent goes through the same rights table as shadow)
      const agentEvent = evaluateSessionContextAmendment(
        c.query,
        { op: "keep", by: "agent", sourceEventRecordIds: [evName], basedOnVersion: c.query.version, match: textMatch },
        { ...baseOpts, eventScopes: new Map([[evName, c.target]]) },
      );
      // Kills a mutant that skips or diverges on eventScopes rights enforcement for agent amendments.
      expect(agentEvent.verdict, `${c.label} [agent event]`).toEqual(expectedVerdict(expectedTextId));

      // 4. Shadow cited event in eventScopes
      const shadowEvent = evaluateSessionContextAmendment(
        c.query,
        { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: [evName], basedOnVersion: c.query.version, match: textMatch },
        { ...baseOpts, eventScopes: new Map([[evName, c.target]]) },
      );
      // Kills a mutant that breaks any rights-table cell for shadow eventScopes citations.
      expect(shadowEvent.verdict, `${c.label} [shadow event]`).toEqual(expectedVerdict(expectedTextId));

      // 5. Explicit targetScope
      const targetCheck = evaluateSessionContextAmendment(
        c.query,
        { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: c.query.version, match: textMatch },
        { ...baseOpts, targetScope: c.target },
      );
      // Kills a mutant that uses a separate inconsistent predicate for targetScope instead of the total rights table.
      expect(targetCheck.verdict, `${c.label} [targetScope]`).toEqual(expectedVerdict(expectedTextId));
    }

    // Finding 4 specifically on agent drop citing a cross-tenant event in eventScopes.
    const kept = makeSelector({ kind: "text", text: "kept-item" }, "agent", ["raw_ok"]);
    const qWithKept = makeQuery({ version: 2, selectors: [kept] });
    const agentDropForeignEvent = evaluateSessionContextAmendment(
      qWithKept,
      { op: "drop", by: "agent", sourceEventRecordIds: ["raw_foreign"], basedOnVersion: 2, selectorId: kept.selectorId },
      { eventScopes: new Map([["raw_foreign", sameSpaceScope({ tenantId: "tenant-other" })]]) },
    );
    // Kills a mutant that allows an agent drop to cite a cross-tenant event resolved in eventScopes.
    expect(agentDropForeignEvent.verdict).toEqual({
      selectorId: kept.selectorId,
      verdict: "refused",
      reason: "outside_rights",
    });
    // Kills a mutant that removes the selector despite refusing a cross-tenant event citation on agent drop.
    expect(agentDropForeignEvent.query.selectors).toEqual([kept]);
  });

  it("t13: strict entry decoder rejects sparse arrays, accessors, symbols, non-enumerable keys, non-plain prototypes, -0 basedOnVersion, and throwing Proxies without throwing", () => {
    const shadowSel = makeSelector({ kind: "text", text: "shadow-target" }, "shadow", ["raw_1"], SHADOW_MODEL);
    const base = makeQuery({ version: 2, selectors: [shadowSel] });
    const newMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "sparse-probe" };

    // Finding 2a: sparse array on shadow drop MUST refuse invalid_amendment (never drop selector).
    const sparseShadowDrop = evaluateSessionContextAmendment(
      base,
      {
        op: "drop",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: new Array(1) as string[],
        basedOnVersion: 2,
        selectorId: shadowSel.selectorId,
      },
      { existingEventRecordIds: new Set(["raw_1"]) },
    );
    // Kills a mutant that uses Array.prototype.every/some over a sparse sourceEventRecordIds array and lets shadow drop bypass attribution.
    expect(sparseShadowDrop.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
    // Kills a mutant that drops the selector when shadow drop carries a sparse sourceEventRecordIds array.
    expect(sparseShadowDrop.query.selectors).toEqual([shadowSel]);

    // Finding 2b: sparse array on agent keep and shadow keep MUST return invalid_amendment (never throw CanonicalJsonError).
    const sparseKeepAgent = evaluateSessionContextAmendment(base, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: new Array(1) as string[],
      basedOnVersion: 2,
      match: newMatch,
    });
    // Kills a mutant that allows sparse sourceEventRecordIds past decoding and throws CanonicalJsonError on agent keep.
    expect(sparseKeepAgent.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });

    const holeWithValid: string[] = [];
    holeWithValid[1] = "raw_1";
    const sparseKeepShadow = evaluateSessionContextAmendment(
      base,
      {
        op: "keep",
        by: "shadow",
        authorModelRef: SHADOW_MODEL,
        sourceEventRecordIds: holeWithValid,
        basedOnVersion: 2,
        match: newMatch,
      },
      { existingEventRecordIds: new Set(["raw_1"]) },
    );
    // Kills a mutant that skips leading holes in sparse sourceEventRecordIds on shadow keep.
    expect(sparseKeepShadow.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });

    // Accessor getters must be rejected WITHOUT invoking them.
    let getterCalls = 0;
    const withTopGetter = {
      get op() {
        getterCalls += 1;
        return "keep";
      },
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 2,
      match: newMatch,
    };
    const topGetterRes = evaluateSessionContextAmendment(base, withTopGetter as unknown as SessionContextAmendmentV1);
    // Kills a mutant that reads properties directly via obj[key] instead of checking data descriptors before reading.
    expect(topGetterRes.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
    // Kills a mutant that invokes a getter property on the raw amendment input before rejecting accessors.
    expect(getterCalls).toBe(0);

    const matchWithGetter = {
      kind: "text",
      get text() {
        getterCalls += 1;
        return "from-getter";
      },
    };
    const matchGetterRes = evaluateSessionContextAmendment(
      base,
      { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: matchWithGetter } as unknown as SessionContextAmendmentV1,
    );
    // Kills a mutant that accepts an accessor property inside match.
    expect(matchGetterRes.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
    // Kills a mutant that invokes a getter inside match before rejecting accessors.
    expect(getterCalls).toBe(0);

    const arrWithGetter: unknown[] = [];
    Object.defineProperty(arrWithGetter, 0, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "raw_1";
      },
    });
    const arrGetterRes = evaluateSessionContextAmendment(
      base,
      { op: "keep", by: "agent", sourceEventRecordIds: arrWithGetter, basedOnVersion: 2, match: newMatch } as unknown as SessionContextAmendmentV1,
    );
    // Kills a mutant that accepts an accessor index on sourceEventRecordIds.
    expect(arrGetterRes.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });
    // Kills a mutant that invokes a getter on a sourceEventRecordIds array element.
    expect(getterCalls).toBe(0);

    // Throwing Proxy must be refused invalid_amendment without throwing.
    const hostileProxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("proxy boom");
        },
      },
    );
    const proxyRes = evaluateSessionContextAmendment(base, hostileProxy as unknown as SessionContextAmendmentV1);
    // Kills a mutant that lets a throwing Proxy escape evaluateSessionContextAmendment uncaught.
    expect(proxyRes.verdict).toEqual({ selectorId: "", verdict: "refused", reason: "invalid_amendment" });

    // basedOnVersion: -0 must be refused invalid_amendment.
    const negZeroVer = evaluateSessionContextAmendment(base, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: -0,
      match: newMatch,
    });
    // Kills a mutant that accepts -0 for basedOnVersion instead of refusing non-canonical -0.
    expect(negZeroVer.verdict).toEqual({
      selectorId: independentSelectorId(newMatch),
      verdict: "refused",
      reason: "invalid_amendment",
    });

    // deriveSessionContextSelectorId also enforces the strict object decoder.
    const symMatch = { kind: "text", text: "ok", [Symbol("s")]: 1 };
    const nonEnumMatch = Object.defineProperty({ kind: "text", text: "ok" }, "hidden", { value: 1, enumerable: false });
    class CustomMatch {
      kind = "text" as const;
      text = "ok";
    }
    for (const badMatch of [matchWithGetter, symMatch, nonEnumMatch, new CustomMatch(), { kind: "text", text: "bad\uD800" }, hostileProxy]) {
      // Kills a mutant that bypasses strict object/string decoding inside deriveSessionContextSelectorId.
      expect(() => deriveSessionContextSelectorId(badMatch as unknown as SessionContextStoredSelectorMatchV1)).toThrow(RangeError);
    }
  });

  it("t14: property-style adversarial table refuses >=40 hostile amendments (every R1/R2 case included) with closed reason and no throw, while legitimate amendments are accepted", () => {
    const existingShadow = makeSelector({ kind: "text", text: "existing-shadow" }, "shadow", ["raw_s0"], SHADOW_MODEL);
    const existingAgent = makeSelector({ kind: "text", text: "existing-agent" }, "agent", ["raw_a0"]);
    const dupMatch: SessionContextStoredSelectorMatchV1 = { kind: "text", text: "dup-subject" };
    const dupId = independentSelectorId(dupMatch);
    const dupShadow = makeSelector(dupMatch, "shadow", ["raw_ds"], SHADOW_MODEL);
    const dupAgent = makeSelector(dupMatch, "agent", ["raw_da"]);
    const baseRole = makeQuery({ version: 3, selectors: [existingShadow, existingAgent, dupShadow, dupAgent] });
    const baseUnassigned = makeUnassignedQuery({ version: 2, selectors: [] });
    const roleCaller = sameSpaceScope({ sessionPseudoId: "sess_role_1" });
    const unassignedCaller: SessionContextRightsScopeV1 = deepFreeze({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      sessionPseudoId: "sess_unassigned_1",
    });

    const keepBase = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 3,
      match: { kind: "text", text: "probe" },
      ...overrides,
    });
    const refKeep = (ref: string): SessionContextAmendmentV1 => ({
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 3,
      match: { kind: "ref", ref },
    });

    class EvilAmendment {
      op = "keep";
      by = "agent";
      sourceEventRecordIds: string[] = [];
      basedOnVersion = 3;
      match = { kind: "text", text: "from-class" };
    }
    class SubArray extends Array<string> {}
    const cyclic: Record<string, unknown> = { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3 };
    cyclic.match = cyclic;
    const trailingHole = ["raw_1"];
    trailingHole.length = 2;
    const deletedHole = ["raw_1", "raw_2"];
    delete deletedHole[0];
    const hugeSparse = new Array<string>(10_000_000);
    const arrExtraProp = Object.assign(["raw_1"], { extra: "nope" });
    const arrProtoNonEnum = Object.defineProperty(["raw_1"], "__proto__", { value: null, enumerable: false });
    const arrSym = Object.assign(["raw_1"], { [Symbol("arr")]: 1 });
    const arrNonEnumIdx: string[] = [];
    Object.defineProperty(arrNonEnumIdx, 0, { value: "raw_1", enumerable: false });
    const topNonEnum = Object.defineProperty(keepBase(), "hidden", { value: 1, enumerable: false });
    const topNonEnumOp = Object.defineProperty(
      { by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "text", text: "probe" } },
      "op",
      { value: "keep", enumerable: false },
    );
    const topProtoNonEnum = Object.defineProperty(keepBase(), "__proto__", { value: null, enumerable: false });
    const matchNonEnum = Object.defineProperty({ kind: "text", text: "probe" }, "hidden", { value: 1, enumerable: false });
    const matchNonEnumText = Object.defineProperty({ kind: "text" }, "text", { value: "probe", enumerable: false });
    const matchProtoNonEnum = Object.defineProperty({ kind: "text", text: "probe" }, "__proto__", { value: null, enumerable: false });
    const throwingGetter = Object.defineProperty(keepBase(), "op", {
      enumerable: true,
      get() {
        throw new Error("getter-boom");
      },
    });
    const throwingProxy = new Proxy({}, { ownKeys() { throw new Error("proxy-ownKeys-boom"); } });
    const protoLiteral = Object.assign(Object.create({ tenantId: "evil" }) as Record<string, unknown>, keepBase());

    interface HostileCase {
      readonly name: string;
      readonly query: SessionContextQueryV1;
      readonly amendment: unknown;
      readonly options?: SessionContextGateOptionsV1;
      readonly expectedReason: (typeof SESSION_CONTEXT_GATE_REFUSAL_REASONS)[number];
    }

    const hostileCases: readonly HostileCase[] = [
      // 1-6: Primitives and non-object values
      { name: "null amendment", query: baseRole, amendment: null, expectedReason: "invalid_amendment" },
      { name: "undefined amendment", query: baseRole, amendment: undefined, expectedReason: "invalid_amendment" },
      { name: "string amendment", query: baseRole, amendment: "keep", expectedReason: "invalid_amendment" },
      { name: "number amendment", query: baseRole, amendment: 42, expectedReason: "invalid_amendment" },
      { name: "bigint amendment", query: baseRole, amendment: 1n, expectedReason: "invalid_amendment" },
      { name: "array amendment", query: baseRole, amendment: [], expectedReason: "invalid_amendment" },
      // 7-11: Non-plain prototypes & Proxy
      { name: "Date amendment", query: baseRole, amendment: new Date(), expectedReason: "invalid_amendment" },
      { name: "Map amendment", query: baseRole, amendment: new Map(), expectedReason: "invalid_amendment" },
      { name: "class instance amendment", query: baseRole, amendment: new EvilAmendment(), expectedReason: "invalid_amendment" },
      { name: "custom prototype object", query: baseRole, amendment: protoLiteral, expectedReason: "invalid_amendment" },
      { name: "throwing Proxy amendment", query: baseRole, amendment: throwingProxy, expectedReason: "invalid_amendment" },
      // 12-19: Round-1 & Round-2 __proto__ own-key vectors
      { name: "JSON __proto__: null top-level", query: baseRole, amendment: JSON.parse('{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":3,"match":{"kind":"text","text":"x"},"__proto__":null}'), expectedReason: "invalid_amendment" },
      { name: "JSON __proto__: 123 top-level", query: baseRole, amendment: JSON.parse('{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":3,"match":{"kind":"text","text":"x"},"__proto__":123}'), expectedReason: "invalid_amendment" },
      { name: "JSON __proto__: {tenantId} top-level", query: baseRole, amendment: JSON.parse('{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":3,"match":{"kind":"text","text":"x"},"__proto__":{"tenantId":"other"}}'), expectedReason: "invalid_amendment" },
      { name: "JSON __proto__: null alongside tenantId (decoder precedes protected-key check)", query: baseRole, amendment: JSON.parse('{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":3,"match":{"kind":"text","text":"x"},"tenantId":"other","__proto__":null}'), expectedReason: "invalid_amendment" },
      { name: "JSON __proto__: null in match", query: baseRole, amendment: JSON.parse('{"op":"keep","by":"agent","sourceEventRecordIds":[],"basedOnVersion":3,"match":{"kind":"text","text":"x","__proto__":null}}'), expectedReason: "invalid_amendment" },
      { name: "JSON __proto__: null in drop", query: baseRole, amendment: JSON.parse(`{"op":"drop","by":"agent","sourceEventRecordIds":[],"basedOnVersion":3,"selectorId":"${existingShadow.selectorId}","__proto__":null}`), expectedReason: "invalid_amendment" },
      { name: "JSON __proto__: null in sourceEventRecordIds", query: baseRole, amendment: JSON.parse('{"op":"keep","by":"agent","sourceEventRecordIds":[{"__proto__":null}],"basedOnVersion":3,"match":{"kind":"text","text":"x"}}'), expectedReason: "invalid_amendment" },
      { name: "non-enumerable __proto__ top-level", query: baseRole, amendment: topProtoNonEnum, expectedReason: "invalid_amendment" },
      { name: "non-enumerable __proto__ in match", query: baseRole, amendment: keepBase({ match: matchProtoNonEnum }), expectedReason: "invalid_amendment" },
      // 20-26: Accessors, symbols, non-enumerable keys
      { name: "throwing getter on op", query: baseRole, amendment: throwingGetter, expectedReason: "invalid_amendment" },
      { name: "symbol key on amendment", query: baseRole, amendment: { ...keepBase(), [Symbol("k")]: 1 }, expectedReason: "invalid_amendment" },
      { name: "symbol key on match", query: baseRole, amendment: keepBase({ match: { kind: "text", text: "x", [Symbol("m")]: 1 } }), expectedReason: "invalid_amendment" },
      { name: "symbol key on sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: arrSym }), expectedReason: "invalid_amendment" },
      { name: "non-enumerable key on amendment", query: baseRole, amendment: topNonEnum, expectedReason: "invalid_amendment" },
      { name: "non-enumerable valid op key on amendment", query: baseRole, amendment: topNonEnumOp, expectedReason: "invalid_amendment" },
      { name: "non-enumerable key on match", query: baseRole, amendment: keepBase({ match: matchNonEnum }), expectedReason: "invalid_amendment" },
      { name: "non-enumerable valid text key on match", query: baseRole, amendment: keepBase({ match: matchNonEnumText }), expectedReason: "invalid_amendment" },
      { name: "non-enumerable index on sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: arrNonEnumIdx }), expectedReason: "invalid_amendment" },
      // 27-34: Round-2 Finding 2 sparse & exotic arrays
      { name: "sparse new Array(1) on shadow drop", query: baseRole, amendment: { op: "drop", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: new Array(1), basedOnVersion: 3, selectorId: existingShadow.selectorId }, options: { existingEventRecordIds: new Set(["raw_1"]) }, expectedReason: "invalid_amendment" },
      { name: "sparse new Array(1) on agent keep", query: baseRole, amendment: keepBase({ sourceEventRecordIds: new Array(1) }), expectedReason: "invalid_amendment" },
      { name: "trailing hole in sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: trailingHole }), expectedReason: "invalid_amendment" },
      { name: "deleted index hole in sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: deletedHole }), expectedReason: "invalid_amendment" },
      { name: "huge sparse array (1e7)", query: baseRole, amendment: keepBase({ sourceEventRecordIds: hugeSparse }), expectedReason: "invalid_amendment" },
      { name: "array with extra named property", query: baseRole, amendment: keepBase({ sourceEventRecordIds: arrExtraProp }), expectedReason: "invalid_amendment" },
      { name: "array with non-enumerable __proto__", query: baseRole, amendment: keepBase({ sourceEventRecordIds: arrProtoNonEnum }), expectedReason: "invalid_amendment" },
      { name: "Array subclass in sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: new SubArray("raw_1") }), expectedReason: "invalid_amendment" },
      // 35-43: Malformed values, surrogates, -0, cyclic, schema/bounds violations
      { name: "cyclic amendment", query: baseRole, amendment: cyclic, expectedReason: "invalid_amendment" },
      { name: "basedOnVersion -0", query: baseRole, amendment: keepBase({ basedOnVersion: -0 }), expectedReason: "invalid_amendment" },
      { name: "basedOnVersion future", query: baseRole, amendment: keepBase({ basedOnVersion: 4 }), expectedReason: "invalid_amendment" },
      { name: "unpaired high surrogate in match.text", query: baseRole, amendment: keepBase({ match: { kind: "text", text: "a\uD800b" } }), expectedReason: "invalid_amendment" },
      { name: "unpaired low surrogate in sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: ["raw_\uDC00"] }), expectedReason: "invalid_amendment" },
      { name: "unpaired surrogate in authorModelRef", query: baseRole, amendment: keepBase({ by: "shadow", authorModelRef: "anthropic:\uD800", sourceEventRecordIds: ["raw_1"] }), options: { existingEventRecordIds: new Set(["raw_1"]) }, expectedReason: "invalid_amendment" },
      { name: "drop carrying match field", query: baseRole, amendment: { op: "drop", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, selectorId: existingShadow.selectorId, match: { kind: "text", text: "x" } }, expectedReason: "invalid_amendment" },
      { name: "keep with withheld match", query: baseRole, amendment: keepBase({ match: { kind: "withheld", textDigest: independentSha256("x") } }), expectedReason: "invalid_amendment" },
      { name: "explicit undefined authorModelRef", query: baseRole, amendment: keepBase({ authorModelRef: undefined }), expectedReason: "invalid_amendment" },
      { name: "leading whitespace in sourceEventRecordIds", query: baseRole, amendment: keepBase({ sourceEventRecordIds: [" raw_1"] }), expectedReason: "invalid_amendment" },
      { name: "trailing whitespace in agent authorModelRef", query: baseRole, amendment: keepBase({ authorModelRef: `${SHADOW_MODEL} ` }), expectedReason: "invalid_amendment" },
      { name: "malformed wt: ref matching malformed query.derivedWorktreeId", query: makeQuery({ version: 3, derivedWorktreeId: "wt:not-64-hex" }), amendment: refKeep("wt:not-64-hex"), options: { refScopes: new Map([["wt:not-64-hex", sameSpaceScope({ derivedWorktreeId: "wt:not-64-hex" })]]) }, expectedReason: "outside_rights" },
      // 44-53: Round-2 Finding 3 intrinsic ref escapes (even when present in refScopes!)
      { name: "leading whitespace absolute path ref", query: baseRole, amendment: refKeep(" /etc/passwd"), options: { refScopes: new Map([[" /etc/passwd", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "trailing whitespace traversal ref", query: baseRole, amendment: refKeep("src/a/.. "), options: { refScopes: new Map([["src/a/.. ", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "trailing slash .env ref", query: baseRole, amendment: refKeep("config/.env/"), options: { refScopes: new Map([["config/.env/", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: ".env intermediate directory ref", query: baseRole, amendment: refKeep(".env/prod.txt"), options: { refScopes: new Map([[".env/prod.txt", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "uppercase Secrets directory ref", query: baseRole, amendment: refKeep("Secrets/api.json"), options: { refScopes: new Map([["Secrets/api.json", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "uppercase ID_RSA ref", query: baseRole, amendment: refKeep("keys/ID_RSA"), options: { refScopes: new Map([["keys/ID_RSA", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "uppercase .PEM ref", query: baseRole, amendment: refKeep("certs/server.PEM"), options: { refScopes: new Map([["certs/server.PEM", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "pinned colon traversal ref", query: baseRole, amendment: refKeep(`pinned:${QUERY_ID}:../etc/passwd`), options: { refScopes: new Map([[`pinned:${QUERY_ID}:../etc/passwd`, sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "track empty repoKey ref", query: baseRole, amendment: refKeep(`track::${WORKSPACE_ID}:US-1`), options: { refScopes: new Map([[`track::${WORKSPACE_ID}:US-1`, sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "unknown URI scheme ref", query: baseRole, amendment: refKeep("file:///etc/passwd"), options: { refScopes: new Map([["file:///etc/passwd", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      // 54-60: Rights-table, attribution, protected-key, duplicate-drop, ceiling, journal_off
      { name: "protected key tenantId tamper", query: baseRole, amendment: keepBase({ tenantId: "tenant-other" }), expectedReason: "outside_rights" },
      { name: "Finding 1: role query selects unassigned private ref", query: baseRole, amendment: refKeep("raw_unassigned_priv"), options: { callerScope: roleCaller, refScopes: new Map([["raw_unassigned_priv", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_unassigned_9" }]]) }, expectedReason: "outside_rights" },
      { name: "Finding 1: role query shadow cites unassigned private event", query: baseRole, amendment: { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_unassigned_ev"], basedOnVersion: 3, match: { kind: "text", text: "ev" } }, options: { callerScope: roleCaller, eventScopes: new Map([["raw_unassigned_ev", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID, sessionPseudoId: "sess_unassigned_9" }]]) }, expectedReason: "outside_rights" },
      { name: "Finding 4: agent cites cross-tenant event", query: baseRole, amendment: keepBase({ sourceEventRecordIds: ["raw_other_tenant"] }), options: { eventScopes: new Map([["raw_other_tenant", sameSpaceScope({ tenantId: "tenant-other" })]]) }, expectedReason: "outside_rights" },
      { name: "R1 Finding 2: shadow drops mixed duplicate agent/shadow selector", query: baseRole, amendment: { op: "drop", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_1"], basedOnVersion: 3, selectorId: dupId }, options: { existingEventRecordIds: new Set(["raw_1"]) }, expectedReason: "outside_rights" },
      { name: "unassigned query selects role-scoped ref", query: baseUnassigned, amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "rec_role_only" } }, options: { callerScope: unassignedCaller, refScopes: new Map([["rec_role_only", sameSpaceScope()]]) }, expectedReason: "outside_rights" },
      { name: "shadow without authorModelRef", query: baseRole, amendment: { op: "keep", by: "shadow", sourceEventRecordIds: ["raw_1"], basedOnVersion: 3, match: { kind: "text", text: "no-model" } }, options: { existingEventRecordIds: new Set(["raw_1"]) }, expectedReason: "unattributed" },
      { name: "journal_off refuses valid amendment", query: baseRole, amendment: keepBase(), options: { journalEnabled: false }, expectedReason: "journal_off" },
    ];

    // Kills a mutant or accidental edit that drops the hostile table below the 40-case design-note floor.
    expect(hostileCases.length).toBeGreaterThanOrEqual(40);

    for (const h of hostileCases) {
      let res!: ReturnType<typeof evaluateSessionContextAmendment>;
      // Kills a mutant that throws uncaught on any hostile amendment input.
      expect(() => {
        res = evaluateSessionContextAmendment(h.query, h.amendment as SessionContextAmendmentV1, h.options);
      }, h.name).not.toThrow();
      // Kills a mutant that accepts or returns no_change for a hostile amendment.
      expect(res.verdict.verdict, h.name).toBe("refused");
      const reason = res.verdict.verdict === "refused" ? res.verdict.reason : "";
      // Kills a mutant that emits an open/unknown refusal reason outside SESSION_CONTEXT_GATE_REFUSAL_REASONS.
      expect(SESSION_CONTEXT_GATE_REFUSAL_REASONS.includes(reason as never), h.name).toBe(true);
      // Kills a mutant that misclassifies the refusal reason of a hostile amendment.
      expect(reason, h.name).toBe(h.expectedReason);
      // Kills a mutant that mutates or advances query when refusing a hostile amendment.
      expect(res.query, h.name).toEqual(h.query);
      // Kills a mutant that reports phantom evictions when refusing a hostile amendment.
      expect(res.evictedSelectorIds, h.name).toEqual([]);
    }

    // Legitimate amendments table: every allowed shape and rights cell still accepted.
    const nullProtoMatch = Object.assign(Object.create(null) as Record<string, unknown>, { kind: "text", text: "null-proto-subject" });
    const nullProtoAmendment = Object.assign(Object.create(null) as Record<string, unknown>, {
      op: "keep",
      by: "agent",
      sourceEventRecordIds: [],
      basedOnVersion: 3,
      match: nullProtoMatch,
    }) as unknown as SessionContextAmendmentV1;
    const validWithheld = `withheld-path:${"d".repeat(64)}`;
    const validPinned = `pinned:${QUERY_ID}:v2`;
    const validDecision = `decision:${QUERY_ID}:deadbeef:1`;
    const validTrack = `track:engram:${WORKSPACE_ID}:US-42`;

    interface LegitimateCase {
      readonly name: string;
      readonly query: SessionContextQueryV1;
      readonly amendment: SessionContextAmendmentV1;
      readonly options?: SessionContextGateOptionsV1;
      readonly expectedSelectorId: string;
    }

    const legitimateCases: readonly LegitimateCase[] = [
      {
        name: "agent keep text",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: ["raw_1"], basedOnVersion: 3, match: { kind: "text", text: "legit-text" } },
        options: { callerScope: roleCaller, eventScopes: new Map([["raw_1", sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "text", text: "legit-text" }),
      },
      {
        name: "agent keep with null-prototype amendment and match",
        query: baseRole,
        amendment: nullProtoAmendment,
        options: { callerScope: roleCaller },
        expectedSelectorId: independentSelectorId({ kind: "text", text: "null-proto-subject" }),
      },
      {
        name: "agent keep with valid authorModelRef and NFD text",
        query: baseRole,
        amendment: { op: "keep", by: "agent", authorModelRef: "anthropic:claude-opus-4", sourceEventRecordIds: [], basedOnVersion: 0, match: { kind: "text", text: "cafe\u0301 topic" } },
        expectedSelectorId: independentSelectorId({ kind: "text", text: "caf\u00e9 topic" }),
      },
      {
        name: "agent keep relative file ref (workspace-level)",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: "src/session-context/gate.ts" } },
        options: { callerScope: roleCaller, refScopes: new Map([["src/session-context/gate.ts", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID }]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: "src/session-context/gate.ts" }),
      },
      {
        name: "agent keep record id ref",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: "rec_decision_99" } },
        options: { callerScope: roleCaller, refScopes: new Map([["rec_decision_99", sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: "rec_decision_99" }),
      },
      {
        name: "agent keep withheld-path ref",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: validWithheld } },
        options: { callerScope: roleCaller, refScopes: new Map([[validWithheld, sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: validWithheld }),
      },
      {
        name: "agent keep same-worktree wt: ref",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: WORKTREE_ID } },
        options: { callerScope: roleCaller, refScopes: new Map([[WORKTREE_ID, sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: WORKTREE_ID }),
      },
      {
        name: "agent keep pinned:<queryId>:v2 ref",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: validPinned } },
        options: { callerScope: roleCaller, refScopes: new Map([[validPinned, sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: validPinned }),
      },
      {
        name: "agent keep decision:<queryId>:<hash>:<seq> ref",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: validDecision } },
        options: { callerScope: roleCaller, refScopes: new Map([[validDecision, sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: validDecision }),
      },
      {
        name: "agent keep track:<repo>:<workspaceId>:<agg> ref",
        query: baseRole,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, match: { kind: "ref", ref: validTrack } },
        options: { callerScope: roleCaller, refScopes: new Map([[validTrack, sameSpaceScope()]]) },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: validTrack }),
      },
      {
        name: "shadow keep citing earlier session of same role",
        query: baseRole,
        amendment: { op: "keep", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_prev_cli"], basedOnVersion: 2, match: { kind: "text", text: "inherited-shadow-topic" } },
        options: { callerScope: roleCaller, eventScopes: new Map([["raw_prev_cli", sameSpaceScope({ sessionPseudoId: "sess_prev_cli" })]]) },
        expectedSelectorId: independentSelectorId({ kind: "text", text: "inherited-shadow-topic" }),
      },
      {
        name: "unassigned query keep own-session ref",
        query: baseUnassigned,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: ["raw_own_ev"], basedOnVersion: 2, match: { kind: "ref", ref: "raw_own_ref" } },
        options: {
          callerScope: unassignedCaller,
          refScopes: new Map([["raw_own_ref", unassignedCaller]]),
          eventScopes: new Map([["raw_own_ev", unassignedCaller]]),
        },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: "raw_own_ref" }),
      },
      {
        name: "unassigned query keep workspace-level ref",
        query: baseUnassigned,
        amendment: { op: "keep", by: "agent", sourceEventRecordIds: [], basedOnVersion: 2, match: { kind: "ref", ref: "docs/design note.md" } },
        options: {
          callerScope: unassignedCaller,
          refScopes: new Map([["docs/design note.md", { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, derivedWorktreeId: WORKTREE_ID }]]),
        },
        expectedSelectorId: independentSelectorId({ kind: "ref", ref: "docs/design note.md" }),
      },
      {
        name: "shadow drop of shadow-only selector",
        query: baseRole,
        amendment: { op: "drop", by: "shadow", authorModelRef: SHADOW_MODEL, sourceEventRecordIds: ["raw_s2"], basedOnVersion: 3, selectorId: existingShadow.selectorId },
        options: { callerScope: roleCaller, eventScopes: new Map([["raw_s2", sameSpaceScope()]]) },
        expectedSelectorId: existingShadow.selectorId,
      },
      {
        name: "agent drop removes all duplicate copies",
        query: baseRole,
        amendment: { op: "drop", by: "agent", sourceEventRecordIds: [], basedOnVersion: 3, selectorId: dupId },
        options: { callerScope: roleCaller },
        expectedSelectorId: dupId,
      },
    ];

    for (const ok of legitimateCases) {
      const res = evaluateSessionContextAmendment(ok.query, ok.amendment, ok.options);
      // Kills a mutant that over-rejects a legitimate amendment shape or allowed rights-table cell.
      expect(res.verdict, ok.name).toEqual({ selectorId: ok.expectedSelectorId, verdict: "accepted" });
      // Kills a mutant that fails to advance version by 1 on a legitimate amendment.
      expect(res.query.version, ok.name).toBe(ok.query.version + 1);
      const { digest: actualDigest, ...bareNext } = res.query;
      // Kills a mutant that miscomputes the RFC 8785 JCS digest on a legitimate amendment.
      expect(actualDigest, ok.name).toBe(independentQueryDigest(bareNext));
    }
  });
});
