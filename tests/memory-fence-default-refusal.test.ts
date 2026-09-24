import { describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  createMemoryPortV2,
  type MemoryEngineDependenciesV2,
  type Result,
} from "../engram-memory/index.js";
import { DEADLINE, lifecycleCommand, NOW } from "./memory-l3-fixture.js";

// §5.9 anti-mutation guard. store-provenance.test.ts proves verifyStoreProvenance in isolation, but nothing drove
// the ENGINE without the opt-in flag — so forcing `allowUnfencedMemoryStore: true` in engine.ts survived the whole
// suite (every fixture sets the flag). This test binds the default-refusal to the engine: a module in-memory store
// (WeakSet member) is admitted ONLY when the host set allow_unfenced_memory_store to the boolean true. Membership
// alone (flag absent, or the forgeable string "true") must fail closed. Criterion: forcing the flag true in
// engine.ts must turn cases (a) and (b) RED.
const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);
const recallRequest = () => ({ query: "q", purpose_ref: "purpose:l3", authorization: { credential: "credential:l3" }, capability_policy: { minimum_channels: "lexical" as const, network: "forbid" as const }, budgets: { max_candidates: 10, max_results: 5, max_packet_bytes: 4096, deadline_at: DEADLINE } });

/** Engine over a genuine module in-memory store (WeakSet member), wiring ONLY the flag under test. */
function engineWithFlag(flag: unknown) {
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
  return createMemoryPortV2({
    canonical_store: store,
    ...(flag === undefined ? {} : { allow_unfenced_memory_store: flag }),
    clock: { now: () => NOW },
  } as unknown as MemoryEngineDependenciesV2);
}

async function fencingCodes(memory: ReturnType<typeof engineWithFlag>): Promise<string[]> {
  return [
    code(await memory.capture({} as never)),
    code(await memory.requestAdmission({} as never)),
    code(await memory.recall(recallRequest())),
    code(await memory.transition(lifecycleCommand("dispute", "mem_x"))),
    code(await memory.proposeCapitalisation({} as never)),
  ];
}

describe("engine fails closed on an unfenced in-memory store unless the host opted in (§5.9)", () => {
  it("(a) refuses all five fencing-dependent ops when the flag is absent — membership alone is not enough", async () => {
    const codes = await fencingCodes(engineWithFlag(undefined));
    expect(codes).toEqual(Array(5).fill("CAPABILITY_UNAVAILABLE"));
  });

  it("(b) refuses when the flag is the string \"true\" — the engine requires a strict boolean (=== true)", async () => {
    const codes = await fencingCodes(engineWithFlag("true"));
    expect(codes).toEqual(Array(5).fill("CAPABILITY_UNAVAILABLE"));
  });

  it("(c) admits past the gate when the flag is the boolean true (a bogus payload then fails validation, not provenance)", async () => {
    const memory = engineWithFlag(true);
    expect(code(await memory.capture({} as never))).toBe("INVALID_SCHEMA");
  });
});
