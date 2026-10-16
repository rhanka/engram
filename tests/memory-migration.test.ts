import { describe, expect, it } from "vitest";

import { migrateRetainedNeutralRecordsV1, verifyMigrationExclusionLedgerV1, type Digest, type RetainedNeutralRecordV1 } from "../engram-memory/index.js";
import { createHash, verify } from "node:crypto";
import { INTAKE_PINS, extractPinnedRecords, gitBlobSha, readPinnedIntake, sha256 } from "./fixtures/memory-pinned-intakes.js";
import { exclusionLedgerHost } from "./fixtures/memory-exclusion-ledger.js";

const DIGEST_A = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as Digest;
const DIGEST_B = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as Digest;
const CONTENT = "sha256:3333333333333333333333333333333333333333333333333333333333333333" as Digest;

describe("retained neutral record migration", () => {
  it("retained neutral records preserve digests/time/citations or emit a host-signed exclusion ledger", async () => {
    const records: RetainedNeutralRecordV1[] = [
      {
        source_ref: "legacy:keep-open",
        record_digest: DIGEST_A,
        valid_time: { t: 1_700_000_000_000 },
        citations: [{ citation_id: "cit-a", source_ref: "src-a", locator: { scheme: "document", value: "a#1" }, content_digest: CONTENT }],
      },
      {
        source_ref: "legacy:keep-bounded",
        record_digest: DIGEST_B,
        valid_time: { t: 10, t_end: 20 },
        citations: [{ citation_id: "cit-b", source_ref: "src-b", locator: { scheme: "document", value: "b#1" }, content_digest: CONTENT }],
      },
      // Cannot be preserved: no citations to carry provenance forward.
      { source_ref: "legacy:no-citations", record_digest: DIGEST_A, valid_time: { t: 5 } },
      // Cannot be preserved: inverted valid interval.
      { source_ref: "legacy:bad-time", record_digest: DIGEST_A, valid_time: { t: 30, t_end: 10 }, citations: [{ citation_id: "cit-c", source_ref: "src-c", locator: { scheme: "document", value: "c#1" }, content_digest: CONTENT }] },
      // Cannot be preserved: no digest to bind.
      { source_ref: "legacy:no-digest", valid_time: { t: 7 }, citations: [{ citation_id: "cit-d", source_ref: "src-d", locator: { scheme: "document", value: "d#1" }, content_digest: CONTENT }] },
    ];

    const host = exclusionLedgerHost();
    const result = await migrateRetainedNeutralRecordsV1(records, "1", host);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("migration refused");
    const ledger = result.value;
    expect(await verifyMigrationExclusionLedgerV1(JSON.parse(JSON.stringify(ledger)), host.exclusion_ledger_verifier)).toEqual(result);

    // Retained records are transformed with digests/valid-time/citations preserved byte-for-byte.
    expect(ledger.migrated.map((entry) => entry.source_ref)).toEqual(["legacy:keep-bounded", "legacy:keep-open"]);
    const open = ledger.migrated.find((entry) => entry.source_ref === "legacy:keep-open")!;
    expect(open.record_digest).toBe(DIGEST_A);
    expect(open.valid_time).toEqual({ t: 1_700_000_000_000 });
    expect(open.citations).toEqual(records[0]!.citations);
    expect(open.migration_receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const bounded = ledger.migrated.find((entry) => entry.source_ref === "legacy:keep-bounded")!;
    expect(bounded.valid_time).toEqual({ t: 10, t_end: 20 });

    // Everything else is on the explicit exclusion ledger with a deterministic reason.
    expect(ledger.excluded.map((entry) => ({ source_ref: entry.source_ref, reason: entry.reason }))).toEqual([
      { source_ref: "legacy:bad-time", reason: "invalid_valid_time" },
      { source_ref: "legacy:no-citations", reason: "missing_citations" },
      { source_ref: "legacy:no-digest", reason: "missing_digest" },
    ]);
    for (const entry of ledger.excluded) expect(entry.exclusion_receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // No silent loss: every input appears in exactly one partition.
    expect(ledger.migrated.length + ledger.excluded.length).toBe(records.length);
    expect(ledger.ledger_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});


/** Actual pinned legacy shapes enter the delivered migration path unchanged.
 * Legacy fixtures have no V2 record_digest/citations; deriving their historical
 * identity does NOT manufacture those missing fields. The current migrator
 * therefore excludes them explicitly in a host-signed ledger, verified again
 * after JSON reload (EVOL §10).
 */
function refCanonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(refCanonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ":" + refCanonical(item)).join(",") + "}";
  return JSON.stringify(value);
}
function refReceipt(kind: string, value: unknown): Digest {
  return ("sha256:" + createHash("sha256").update("graphify-memory/" + kind + "/v1\0" + refCanonical(value)).digest("hex")) as Digest;
}

describe("pinned-intake migration matrix", () => {
  it.each(INTAKE_PINS)("pin %s reproduces every frozen record from its versioned source blobs without git history", async (pin) => {
    const fixture = readPinnedIntake(pin);
    expect(fixture.pin).toBe(pin);
    expect(fixture.sources.length).toBeGreaterThan(0);
    expect(new Set(fixture.sources.map(({ path }) => path)).size).toBe(fixture.sources.length);
    for (const { content, blobSha } of fixture.sources) {
      expect(gitBlobSha(Buffer.from(content, "utf8"))).toBe(blobSha);
    }
    for (const { origin } of fixture.records) {
      expect(origin.startsWith(`${pin}:`)).toBe(true);
      expect(fixture.sources.some(({ path }) => path === origin.split(":")[1])).toBe(true);
    }
    // Compare serialized bytes as well as replaying all original admission assertions.
    expect(JSON.stringify(await extractPinnedRecords(fixture))).toBe(JSON.stringify(fixture.records));
  });

  it.each(INTAKE_PINS)("pin %s partitions every real retained fixture with reproducible legacy identity and receipts", async (pin) => {
    const fixtures = readPinnedIntake(pin).records;
    const early = INTAKE_PINS.indexOf(pin) < 3;
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.some(({ node }) => node.id === "other")).toBe(true);
    if (!early) {
      for (const label of ["mem:live", "mem:closed-before", "mem:open"]) {
        expect(fixtures.some(({ node }) => node.id === label), label).toBe(true);
      }
      expect(fixtures.some(({ node }) => node.subject === "human:antoinefa")).toBe(true);
      expect(fixtures.some(({ node }) => node.subject === "persona" || node.memory_kind === "persona")).toBe(false);
      expect(fixtures.every(({ node }) => node.t_end === undefined || node.t_end >= node.t)).toBe(true);
    }
    const records = fixtures.map(({ node, origin, identityCanonical, legacyId }) => {
      expect(legacyId).toBe(identityCanonical === undefined ? node.id : "mem:" + sha256(identityCanonical).slice(0, 16));
      expect(node.record_digest).toBeUndefined();
      return { ...node, source_ref: origin + ":" + legacyId };
    });
    const before = structuredClone(records);
    const host = exclusionLedgerHost();
    const result = await migrateRetainedNeutralRecordsV1(records, "1", host);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("pinned migration refused");
    const ledger = result.value;
    const excluded = records.map(({ source_ref }) => {
      const body = { source_ref, reason: "missing_digest" as const };
      return { ...body, exclusion_receipt_digest: refReceipt("migration-exclusion", body) };
    }).sort((a, b) => a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0);
    const body = { generation: "1", migrated: [], excluded };
    const digest = refReceipt("migration-ledger", body);
    expect(ledger).toEqual({ ...body, ledger_digest: digest, signature: expect.objectContaining({ algorithm: "Ed25519", key_id: "host:test-key" }) });
    expect(verify(null, Buffer.from(digest), host.publicKey, Buffer.from(ledger.signature!.signature, "base64"))).toBe(true);
    const reload = JSON.parse(JSON.stringify(ledger));
    expect(await verifyMigrationExclusionLedgerV1(reload, host.exclusion_ledger_verifier)).toEqual(result);
    reload.excluded[0].source_ref += ":altered";
    expect(await verifyMigrationExclusionLedgerV1(reload, host.exclusion_ledger_verifier)).toMatchObject({ ok: false, error: { code: "MIGRATION_LEDGER_INVALID" } });
    expect(await migrateRetainedNeutralRecordsV1(records)).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
    expect(new Set(ledger.excluded.map(({ source_ref }) => source_ref))).toEqual(new Set(records.map(({ source_ref }) => source_ref)));
    expect(ledger.excluded).toHaveLength(records.length);
    expect(records).toEqual(before);
  });
});
