import { describe, expect, it } from "vitest";

import { createMemoryPortV2, type MemoryEngineDependenciesV2, type Result } from "../graphify-memory/index.js";

const NOW = "2026-09-20T12:00:00.000Z";
const DEADLINE = "2026-09-20T12:04:00.000Z";
const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const EPOCH = "42";

const receipt = (operation: "bootstrap" | "rotate" | "revoke") =>
  ({ store_id: "store:s1", storage_epoch: EPOCH, operation, authorization_epoch: "1", credential_digest: DIGEST, issued_at: NOW, expires_at: DEADLINE, receipt_digest: DIGEST });

const code = (r: Result<unknown>) => (r.ok ? "OK" : r.error.code);

function makePort(opts: { provider?: unknown; fenceEpoch?: string; fenceOk?: boolean; fenceThrow?: boolean } = {}) {
  const calls: string[] = [];
  const defaultProvider = {
    version: 1 as const,
    async bootstrap() { calls.push("bootstrap"); return { ok: true as const, value: receipt("bootstrap") }; },
    async rotate() { calls.push("rotate"); return { ok: true as const, value: receipt("rotate") }; },
    async revoke() { calls.push("revoke"); return { ok: true as const, value: receipt("revoke") }; },
  };
  const canonical_store = {
    async readiness() {
      if (opts.fenceThrow) throw new Error("store driver crashed");
      return opts.fenceOk === false
        ? { ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "store cannot serve", retryable: false } }
        : { ok: true as const, value: { store_id: "store:s1", backend: "sqlite" as const, storage_epoch: opts.fenceEpoch ?? EPOCH, high_water_cursor: "0", capabilities: {}, issued_at: NOW, expires_at: DEADLINE, receipt_digest: DIGEST } };
    },
  };
  const port = createMemoryPortV2({
    canonical_store, admin_provider: "provider" in opts ? opts.provider : defaultProvider,
    authorization: {}, admission_policy: {}, crypto: {}, activity_sources: [], clock: { now: () => NOW },
  } as unknown as MemoryEngineDependenciesV2);
  return { port, calls };
}

const bootstrapReq = (storage_epoch = EPOCH) => ({ operation: "bootstrap" as const, bootstrap: { store_id: "store:s1", storage_epoch, admin_credential_ref: "cred:ref", deadline_at: DEADLINE } });
const rotateReq = () => ({ operation: "rotate" as const, rotate: { store_id: "store:s1", current_authorization_epoch: EPOCH, authorization: { credential: "c" }, deadline_at: DEADLINE } });
const revokeReq = () => ({ operation: "revoke" as const, revoke: { store_id: "store:s1", current_authorization_epoch: EPOCH, credential_digest: DIGEST, authorization: { credential: "c" }, deadline_at: DEADLINE } });

describe("MemoryPortV2.admin entry point (§5.5)", () => {
  it("(a) refuses CAPABILITY_UNAVAILABLE when no admin_provider is injected, before any other check", async () => {
    const { port, calls } = makePort({ provider: undefined });
    expect(code(await port.admin(bootstrapReq()))).toBe("CAPABILITY_UNAVAILABLE");
    expect(calls).toEqual([]);
  });

  it("(a) checks the provider strictly before the schema — a malformed request with no provider still refuses CAPABILITY_UNAVAILABLE", async () => {
    const { port } = makePort({ provider: undefined });
    expect(code(await port.admin({ operation: "bogus" } as never))).toBe("CAPABILITY_UNAVAILABLE");
  });

  it("(b) asserts FENCE_LOST before any dispatch only on an epoch mismatch", async () => {
    const mismatch = makePort({ fenceEpoch: "99" });
    expect(code(await mismatch.port.admin(bootstrapReq("42")))).toBe("FENCE_LOST");
    expect(mismatch.calls).toEqual([]);
  });

  it("(b) propagates the store code and never dispatches when the fence is not ok or throws (STORE_UNAVAILABLE != FENCE_LOST)", async () => {
    const notOk = makePort({ fenceOk: false });
    expect(code(await notOk.port.admin(bootstrapReq()))).toBe("STORE_UNAVAILABLE");
    expect(notOk.calls).toEqual([]);
    const threw = makePort({ fenceThrow: true });
    expect(code(await threw.port.admin(bootstrapReq()))).toBe("STORE_UNAVAILABLE");
    expect(threw.calls).toEqual([]);
  });

  it("(c) dispatches bootstrap|rotate|revoke to the injected provider per discriminant", async () => {
    const b = makePort(); expect((await b.port.admin(bootstrapReq())).ok).toBe(true); expect(b.calls).toEqual(["bootstrap"]);
    const ro = makePort(); expect((await ro.port.admin(rotateReq())).ok).toBe(true); expect(ro.calls).toEqual(["rotate"]);
    const rv = makePort(); expect((await rv.port.admin(revokeReq())).ok).toBe(true); expect(rv.calls).toEqual(["revoke"]);
  });

  it("(e) bootstrap on empty state needs no prior receipt and returns the provider AdminEpochReceiptV1", async () => {
    const r = await makePort().port.admin(bootstrapReq());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.operation).toBe("bootstrap"); expect(r.value.storage_epoch).toBe(EPOCH); }
  });

  it("(d) normalises a provider denial (denial:true) to UNAUTHORIZED regardless of the provider's own code", async () => {
    // a conforming provider declares denial:true; the engine maps it to UNAUTHORIZED even from a non-UNAUTHORIZED code.
    const denier = { version: 1 as const, async bootstrap() { return { ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "refused", retryable: false, denial: true as const } }; }, async rotate() { throw new Error("x"); }, async revoke() { throw new Error("x"); } };
    expect(code(await makePort({ provider: denier }).port.admin(bootstrapReq()))).toBe("UNAUTHORIZED");
  });

  it("(e) passes a non-authorization provider failure through with its own code (denial absent)", async () => {
    const failer = { version: 1 as const, async bootstrap() { return { ok: false as const, error: { code: "STORE_UNAVAILABLE" as const, operation: "admin" as const, message: "store down", retryable: false } }; }, async rotate() { throw new Error("x"); }, async revoke() { throw new Error("x"); } };
    expect(code(await makePort({ provider: failer }).port.admin(bootstrapReq()))).toBe("STORE_UNAVAILABLE");
  });

  it("(R1h/b) converts a throwing provider into a typed POLICY_UNAVAILABLE refusal — admin is total on its Result contract", async () => {
    const secret = "credential-ref-should-never-leak";
    const thrower = { version: 1 as const, async bootstrap() { throw new Error(secret); }, async rotate() { throw new Error("x"); }, async revoke() { throw new Error("x"); } };
    const r = await makePort({ provider: thrower }).port.admin(bootstrapReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("POLICY_UNAVAILABLE"); // not CAPABILITY_UNAVAILABLE (that is "no provider"), never UNAUTHORIZED
      expect(r.error.retryable).toBe(false);            // fail-closed
      expect("denial" in r.error).toBe(false);          // an exception declared no authorization decision
      expect(r.error.message).not.toContain(secret);    // D2 minimal redaction — never the raw error text
    }
  });

  it("rejects a malformed admin request with INVALID_SCHEMA", async () => {
    expect(code(await makePort().port.admin({ operation: "bootstrap" } as never))).toBe("INVALID_SCHEMA");
  });
});
