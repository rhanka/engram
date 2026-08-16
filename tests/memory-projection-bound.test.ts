import { describe, expect, it } from "vitest";

import {
  MEMORY_PROJECTION_RAW_BYTE_CEILING,
  buildBoundedCurrentProjectionV1,
  canonicalizeJcs,
  exportBoundedCurrentProjectionV1,
  measureRawProjectionBytesV1,
  syntheticBoundedProjectionInputAtBytesV1,
} from "../graphify-memory/index.js";

describe("bounded current projection", () => {
  it("raw projection at cap passes and cap plus one byte fails without silent omission", () => {
    expect(MEMORY_PROJECTION_RAW_BYTE_CEILING).toBe(52_428_800);

    const atCapInput = syntheticBoundedProjectionInputAtBytesV1(MEMORY_PROJECTION_RAW_BYTE_CEILING);
    const overCapInput = syntheticBoundedProjectionInputAtBytesV1(MEMORY_PROJECTION_RAW_BYTE_CEILING + 1);

    // The synthetic fixture is deterministic and byte-exact, not a dirty artifact.
    expect(measureRawProjectionBytesV1(buildBoundedCurrentProjectionV1(atCapInput))).toBe(52_428_800);
    expect(measureRawProjectionBytesV1(buildBoundedCurrentProjectionV1(overCapInput))).toBe(52_428_801);

    const accepted = exportBoundedCurrentProjectionV1(atCapInput);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.raw_byte_size).toBe(52_428_800);
    expect(accepted.value.raw_byte_ceiling).toBe(52_428_800);
    expect(accepted.value.projection_schema_version).toBe(1);
    expect(accepted.value.included_count).toBe(1);
    expect(accepted.value.omitted_total).toBe(2);
    expect(accepted.value.omitted_by_reason.pending).toBe(1);
    expect(accepted.value.omitted_by_reason.tombstoned).toBe(1);
    expect(accepted.value.high_water_cursor).toBe("2");
    expect(accepted.value.projection_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(accepted.value.export_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // The bounded projection carries only envelopes, citation refs, and metadata:
    // never record bodies, journal events, receipts, or trust bindings.
    const raw = canonicalizeJcs(accepted.value.projection);
    expect(raw.includes("\"components\"")).toBe(false);
    expect(raw.includes("\"trust\"")).toBe(false);
    expect(raw.includes("\"ciphertext\"")).toBe(false);
    expect(raw.includes("\"event_hash\"")).toBe(false);

    const refused = exportBoundedCurrentProjectionV1(overCapInput);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("PROJECTION_OVERSIZED");
    expect(refused.error.operation).toBe("projection_invalidate");
    // No silent top-N loss: the refusal names the full count it declined to truncate.
    expect(refused.error.message).toContain(String(52_428_801));
    expect(refused.error.message).toContain(`${overCapInput.current.length} objects`);
  });
});
