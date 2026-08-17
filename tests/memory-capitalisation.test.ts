import { describe, expect, it } from "vitest";

import { createInMemoryCanonicalMemoryStoreV1, type CanonicalMemoryStorePort } from "../graphify-memory/index.js";
import { AuthorizationRequestLike, buildMemory, DEADLINE, FULL_ALLOWLIST, NOW, recallRequest, seedAccepted } from "./memory-l7-fixture.js";

const SRC = "scope:src";
const DST = "scope:dst";

function crossScopeResolver(sourceScopeById: (id: string) => string | undefined): (request: AuthorizationRequestLike) => string {
  return (request) => {
    if (request.resource.scope_ref) return request.resource.scope_ref;
    if (request.resource.record_id) return sourceScopeById(request.resource.record_id) ?? DST;
    return DST;
  };
}

describe("capitalisation derivative", () => {
  it("sanitized derivative has a new scope re-enters pending and exposes no cross-scope edge or lineage without permission", async () => {
    const store: CanonicalMemoryStorePort = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });

    // Seed the source in its own protection scope.
    const seeder = buildMemory({ store, scope: SRC });
    const source = await seedAccepted(seeder.memory, "kappa capital knowledge to sanitize", { scope: SRC });

    const resolver = crossScopeResolver((id) => (id === source ? SRC : undefined));
    const hidden = buildMemory({ store, scope: DST, scopeResolver: resolver, allowLineage: false, allowedFields: FULL_ALLOWLIST });

    const proposed = await hidden.memory.proposeCapitalisation({
      idempotency_key: `capitalise-${"0".repeat(16)}`,
      source_record_id: source,
      target_scope_ref: DST,
      purpose_ref: "purpose:capital",
      retention: { derivative_rule: "retain" },
      authorization: { credential: "credential:l7" },
      deadline_at: DEADLINE,
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    // Re-enters pending: it is a fresh pending candidate, not an accepted record.
    expect(proposed.value.status).toBe("committed_pending");
    const candidateId = proposed.value.candidate_id!;
    expect(candidateId).toBeTypeOf("string");

    // Admit the derivative; it becomes an accepted record in the new scope.
    const admitted = await hidden.memory.requestAdmission({ candidate_id: candidateId, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    expect(admitted.value.status).toBe("accepted");
    const derivative = admitted.value.record_id!;
    expect(derivative).not.toBe(source);

    // Recall in the target scope WITHOUT lineage permission: the derivation is redacted away.
    const withoutLineage = await hidden.memory.recall(recallRequest("kappa capital knowledge"));
    expect(withoutLineage.ok).toBe(true);
    if (!withoutLineage.ok) return;
    const hiddenPacket = withoutLineage.value.records.find((entry) => entry.record.record_id === derivative);
    expect(hiddenPacket).toBeDefined();
    expect(hiddenPacket!.record.scope_ref).toBe(DST);                              // new scope
    expect(Object.hasOwn(hiddenPacket!.record as Record<string, unknown>, "derivation")).toBe(false); // no lineage
    expect(hiddenPacket!.redacted_fields).toContain("/derivation");

    // Recall WITH explicit lineage permission: the canonical private lineage is present and points at the source only.
    const permitted = buildMemory({ store, scope: DST, scopeResolver: resolver, allowLineage: true, allowedFields: FULL_ALLOWLIST });
    const withLineage = await permitted.memory.recall(recallRequest("kappa capital knowledge"));
    expect(withLineage.ok).toBe(true);
    if (!withLineage.ok) return;
    const exposed = withLineage.value.records.find((entry) => entry.record.record_id === derivative);
    expect(exposed).toBeDefined();
    const derivation = (exposed!.record as unknown as { derivation?: { source_record_ids: string[] } }).derivation;
    expect(derivation).toBeDefined();
    expect(derivation!.source_record_ids).toEqual([source]);
  });
});
