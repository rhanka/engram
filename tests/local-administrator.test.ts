import { describe, expect, it } from "vitest";

import {
  authorizationResourceDigest,
  createAlwaysActiveLocalAdministrationFenceV1,
  createInMemoryLocalAdministrationStateStoreV1,
  createInMemoryLocalCredentialSourceV1,
  createLocalAdministratorV1,
} from "../graphify-memory/index.js";

const NOW = "2026-08-16T12:34:56.789Z";

describe("local administrator", () => {
  it("fresh standalone service denies until explicit credential bootstrap and old receipts fail after rotation", async () => {
    const credentials = createInMemoryLocalCredentialSourceV1();
    const administrator = createLocalAdministratorV1({
      clock: { now: () => NOW },
      credentials,
      state: createInMemoryLocalAdministrationStateStoreV1(),
      fence: createAlwaysActiveLocalAdministrationFenceV1(),
    });
    const request = {
      operation: "capture" as const,
      resource: { scope_ref: "scope:case-7" },
      resource_digest: authorizationResourceDigest("capture", { scope_ref: "scope:case-7" }),
      context: { credential: "not-initialized" },
      issued_at: NOW,
      deadline_at: "2026-08-16T12:40:00.000Z",
    };

    await expect(administrator.authorization.authorize(request)).resolves.toMatchObject({ ok: true, value: { allowed: false } });
    await expect(administrator.bootstrap()).resolves.toEqual({ ok: true, value: { initialized: true } });
    const credential = await credentials.read();
    expect(credential).toMatchObject({ ok: true });
    if (!credential.ok || credential.value === undefined) return;

    const allowed = await administrator.authorization.authorize({ ...request, context: { credential: credential.value } });
    expect(allowed).toMatchObject({ ok: true, value: { allowed: true, revocation_epoch: "0" } });
    if (!allowed.ok || !allowed.value.allowed) return;
    expect(Date.parse(allowed.value.expires_at) - Date.parse(allowed.value.not_before)).toBeLessThanOrEqual(300_000);

    await expect(administrator.rotate(credential.value)).resolves.toEqual({ ok: true, value: { rotated: true } });
    await expect(administrator.authorization.authorize({ ...request, context: { credential: credential.value } })).resolves.toMatchObject({ ok: true, value: { allowed: false } });
    await expect(administrator.authorization.revalidate(allowed.value.receipt_digest, NOW)).resolves.toMatchObject({
      ok: true,
      value: { valid: false, reason: "revoked" },
    });
  });
});
