import { createHash, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  migrateRetainedNeutralRecordsV1,
  verifyMigrationExclusionLedgerV1,
  type MigrationLedgerV1,
  type RetainedNeutralRecordV1,
} from "../engram-memory/index.js";
import { exclusionLedgerHost } from "./fixtures/memory-exclusion-ledger.js";

const D = `sha256:${"1".repeat(64)}` as const;
const records: RetainedNeutralRecordV1[] = [{
  source_ref: "keep", record_digest: D, valid_time: { t: 10, t_end: 20 },
  citations: [{ citation_id: "cit", source_ref: "src", locator: { scheme: "document", value: "a#1" }, content_digest: D, observed_at: "2026-10-16T00:00:00.000Z" }],
}, { source_ref: "exclude" }];

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function receipt(kind: string, value: any, digestField: string): string {
  const { [digestField]: _digest, ...body } = value;
  return "sha256:" + createHash("sha256").update(`graphify-memory/${kind}/v1\0` + canonical(body)).digest("hex");
}
function fingerprint(value: any): string {
  const { ledger_digest: _digest, signature: _signature, ...body } = value;
  return "sha256:" + createHash("sha256").update("graphify-memory/migration-ledger/v1\0" + canonical(body)).digest("hex");
}
async function signedLedger(host = exclusionLedgerHost()) {
  const result = await migrateRetainedNeutralRecordsV1(records, "pin:target", host);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture migration refused");
  return result.value;
}
const invalid = { ok: false, error: { code: "MIGRATION_LEDGER_INVALID", operation: "migrate", retryable: false } };
const unavailable = { ok: false, error: { code: "CAPABILITY_UNAVAILABLE", operation: "migrate", retryable: false } };
const invalidSchema = { ok: false, error: { code: "INVALID_SCHEMA", operation: "migrate", retryable: false } };

describe("host-signed migration exclusion ledger", () => {
  it("signs the independent domain-separated canonical fingerprint and verifies after JSON reload", async () => {
    const host = exclusionLedgerHost();
    const signer = vi.spyOn(host.exclusion_ledger_signer, "sign");
    const ledger = await signedLedger(host);
    expect(ledger.ledger_digest).toBe(fingerprint(ledger));
    expect(signer).toHaveBeenCalledExactlyOnceWith(ledger.ledger_digest);
    expect(verify(null, Buffer.from(ledger.ledger_digest), host.publicKey, Buffer.from(ledger.signature!.signature, "base64"))).toBe(true);
    expect(await verifyMigrationExclusionLedgerV1(JSON.parse(JSON.stringify(ledger)), host.exclusion_ledger_verifier)).toEqual({ ok: true, value: ledger });
    const reordered = JSON.parse(JSON.stringify(ledger), (_key, value) => value && !Array.isArray(value) && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse()) : value);
    expect(await verifyMigrationExclusionLedgerV1(reordered, host.exclusion_ledger_verifier)).toEqual({ ok: true, value: ledger });
    expect(await migrateRetainedNeutralRecordsV1([...records].reverse(), "pin:target", host)).toEqual({ ok: true, value: ledger });
  });

  it("refuses exclusions without a signer or verifier and allows lossless migration without either", async () => {
    const host = exclusionLedgerHost();
    const sign = vi.spyOn(host.exclusion_ledger_signer, "sign");
    expect(await migrateRetainedNeutralRecordsV1(records)).toMatchObject(unavailable);
    expect(await migrateRetainedNeutralRecordsV1(records, "1", { exclusion_ledger_signer: host.exclusion_ledger_signer })).toMatchObject(unavailable);
    expect(sign).not.toHaveBeenCalled();
    expect(await migrateRetainedNeutralRecordsV1([records[0]!])).toMatchObject({ ok: true, value: { excluded: [], migrated: [records[0]] } });
    expect(await migrateRetainedNeutralRecordsV1([])).toMatchObject({ ok: true, value: { excluded: [], migrated: [] } });
    expect(sign).not.toHaveBeenCalled();
    const ledger = await signedLedger(host);
    expect(await verifyMigrationExclusionLedgerV1(ledger)).toMatchObject(unavailable);
  });

  const alterations: Array<[string, (ledger: any) => void]> = [
    ["generation", (l) => { l.generation = "pin:other"; }],
    ["migrated partition", (l) => { l.migrated = []; }],
    ["excluded partition", (l) => { l.excluded = []; }],
    ["migrated source_ref", (l) => { l.migrated[0].source_ref = "other"; }],
    ["record_digest", (l) => { l.migrated[0].record_digest = `sha256:${"2".repeat(64)}`; }],
    ["valid_time.t", (l) => { l.migrated[0].valid_time.t++; }],
    ["valid_time.t_end", (l) => { l.migrated[0].valid_time.t_end++; }],
    ["missing valid_time.t_end", (l) => { delete l.migrated[0].valid_time.t_end; }],
    ["citations", (l) => { l.migrated[0].citations = []; }],
    ...["citation_id", "source_ref", "content_digest", "observed_at"].map((field): [string, (l: any) => void] =>
      [`citation.${field}`, (l) => { l.migrated[0].citations[0][field] += "changed"; }]),
    ...["scheme", "value"].map((field): [string, (l: any) => void] =>
      [`locator.${field}`, (l) => { l.migrated[0].citations[0].locator[field] += "changed"; }]),
    ["missing citation.observed_at", (l) => { delete l.migrated[0].citations[0].observed_at; }],
    ["migration_receipt_digest", (l) => { l.migrated[0].migration_receipt_digest = D; }],
    ["excluded source_ref", (l) => { l.excluded[0].source_ref = "other"; }],
    ["reason", (l) => { l.excluded[0].reason = "invalid_digest"; }],
    ["exclusion_receipt_digest", (l) => { l.excluded[0].exclusion_receipt_digest = D; }],
    ["additional field", (l) => { l.injected = true; }],
  ];
  it.each(alterations)("refuses altered %s with both the original and a recomputed fingerprint", async (_field, alter) => {
    const host = exclusionLedgerHost();
    const ledger = await signedLedger(host);
    alter(ledger);
    expect(await verifyMigrationExclusionLedgerV1(ledger, host.exclusion_ledger_verifier)).toMatchObject(invalid);
    // An attacker can repair ALL public hashes, but cannot issue the host signature.
    if (_field !== "migration_receipt_digest") for (const entry of ledger.migrated) {
      entry.migration_receipt_digest = receipt("migration-record", entry, "migration_receipt_digest") as MigrationLedgerV1["ledger_digest"];
    }
    if (_field !== "exclusion_receipt_digest") for (const entry of ledger.excluded) {
      entry.exclusion_receipt_digest = receipt("migration-exclusion", entry, "exclusion_receipt_digest") as MigrationLedgerV1["ledger_digest"];
    }
    ledger.ledger_digest = fingerprint(ledger) as MigrationLedgerV1["ledger_digest"];
    expect(await verifyMigrationExclusionLedgerV1(ledger, host.exclusion_ledger_verifier)).toMatchObject(invalid);
  });

  it("refuses an altered ledger fingerprint", async () => {
    const host = exclusionLedgerHost();
    const ledger = await signedLedger(host);
    ledger.ledger_digest = D;
    expect(await verifyMigrationExclusionLedgerV1(ledger, host.exclusion_ledger_verifier)).toMatchObject(invalid);
  });

  it.each(["signature", "algorithm", "key_id", "missing signature", "missing signature field", "extra signature field"])("refuses %s tampering", async (field) => {
    const host = exclusionLedgerHost();
    const ledger = await signedLedger(host);
    if (field === "missing signature") delete ledger.signature;
    else if (field === "missing signature field") delete (ledger.signature as any).key_id;
    else if (field === "extra signature field") (ledger.signature as any).extra = true;
    else ledger.signature![field as "signature" | "algorithm" | "key_id"] = field === "signature" ? Buffer.alloc(64).toString("base64") : "unknown";
    expect(await verifyMigrationExclusionLedgerV1(ledger, host.exclusion_ledger_verifier)).toMatchObject(invalid);
  });

  it("refuses stripping both exclusions and signature even after recomputing the fingerprint", async () => {
    const host = exclusionLedgerHost();
    const ledger = await signedLedger(host);
    ledger.excluded = [];
    delete ledger.signature;
    ledger.ledger_digest = fingerprint(ledger) as MigrationLedgerV1["ledger_digest"];
    expect(await verifyMigrationExclusionLedgerV1(ledger, host.exclusion_ledger_verifier)).toMatchObject(invalid);
  });

  it("checks a reloaded unsigned lossless ledger by re-deriving it from the trusted source and generation", async () => {
    for (const source of [[], [records[0]!]]) {
      const result = await migrateRetainedNeutralRecordsV1(source, "pin:target");
      if (!result.ok) throw new Error("lossless migration refused");
      const reload = JSON.parse(JSON.stringify(result.value));
      expect(reload.signature).toBeUndefined();
      // Storage alone cannot establish that an unsigned ledger was lossless.
      expect(await verifyMigrationExclusionLedgerV1(reload)).toMatchObject(invalid);
      const rederived = await migrateRetainedNeutralRecordsV1(source, "pin:target");
      expect(rederived).toEqual({ ok: true, value: reload });
      if (!rederived.ok) throw new Error("source re-derivation refused");
      reload.migrated = [{ source_ref: "forged" }];
      reload.ledger_digest = fingerprint(reload);
      expect(reload.ledger_digest).not.toBe(rederived.value.ledger_digest);
    }
    const host = exclusionLedgerHost();
    const stripped = await signedLedger(host);
    stripped.excluded = [];
    delete stripped.signature;
    stripped.ledger_digest = fingerprint(stripped) as MigrationLedgerV1["ledger_digest"];
    // Re-derive from the complete trusted source, never from the stored partitions.
    expect(await migrateRetainedNeutralRecordsV1(records, "pin:target")).toMatchObject(unavailable);
    const rederived = await migrateRetainedNeutralRecordsV1(records, "pin:target", host);
    if (!rederived.ok) throw new Error("source re-derivation refused");
    expect(rederived.value.excluded).not.toHaveLength(0);
    expect(rederived.value.ledger_digest).not.toBe(stripped.ledger_digest);
  });

  const incoherent: Array<[string, (ledger: any) => void]> = [
    ["migrated receipt", (l) => { l.migrated[0].migration_receipt_digest = D; }],
    ["exclusion receipt", (l) => { l.excluded[0].exclusion_receipt_digest = D; }],
    ["invalid migrated content", (l) => {
      l.migrated[0].citations = [];
      l.migrated[0].migration_receipt_digest = receipt("migration-record", l.migrated[0], "migration_receipt_digest");
    }],
    ["extra root field", (l) => { l.extra = true; }],
    ["unknown exclusion reason", (l) => {
      l.excluded[0].reason = "unknown";
      l.excluded[0].exclusion_receipt_digest = receipt("migration-exclusion", l.excluded[0], "exclusion_receipt_digest");
    }],
    ["extra migrated field", (l) => {
      l.migrated[0].extra = true;
      l.migrated[0].migration_receipt_digest = receipt("migration-record", l.migrated[0], "migration_receipt_digest");
    }],
    ["extra exclusion field", (l) => {
      l.excluded[0].extra = true;
      l.excluded[0].exclusion_receipt_digest = receipt("migration-exclusion", l.excluded[0], "exclusion_receipt_digest");
    }],
    ...["algorithm", "key_id", "signature"].map((field): [string, (l: any) => void] =>
      [`empty signature ${field}`, (l) => { l.signature[field] = ""; }]),
  ];
  it.each(incoherent)("refuses host-signed incoherent %s before invoking the verifier", async (_field, alter) => {
    const host = exclusionLedgerHost();
    const ledger = await signedLedger(host);
    alter(ledger);
    ledger.ledger_digest = fingerprint(ledger) as MigrationLedgerV1["ledger_digest"];
    const signature = await host.exclusion_ledger_signer.sign(ledger.ledger_digest);
    expect(verify(null, Buffer.from(ledger.ledger_digest), host.publicKey, Buffer.from(signature.signature, "base64"))).toBe(true);
    ledger.signature = _field.startsWith("empty signature") ? { ...signature, ...ledger.signature } : signature;
    const check = vi.spyOn(host.exclusion_ledger_verifier, "verify");
    expect(await verifyMigrationExclusionLedgerV1(ledger, host.exclusion_ledger_verifier)).toMatchObject(invalid);
    expect(check).not.toHaveBeenCalled();
  });

  const malformedInputs: Array<[string, (input: any) => void]> = [
    ["undefined interval end", (r) => { r[0].valid_time.t_end = undefined; }],
    ["undefined citation observation", (r) => { r[0].citations[0].observed_at = undefined; }],
    ["missing migrated source_ref", (r) => { delete r[0].source_ref; }],
    ["non-string migrated source_ref", (r) => { r[0].source_ref = 42; }],
    ["missing excluded source_ref", (r) => { delete r[1].source_ref; }],
    ["non-string excluded source_ref", (r) => { r[1].source_ref = 42; }],
    ["null record", (r) => { r[0] = null; }],
    ["non-JSON reference", (r) => { r[0].source_ref = () => "secret:input"; }],
  ];
  it.each(malformedInputs)("returns a typed refusal for %s without asking for a signature", async (_field, alter) => {
    const host = exclusionLedgerHost();
    const sign = vi.spyOn(host.exclusion_ledger_signer, "sign");
    const input = structuredClone(records);
    alter(input);
    const result = await migrateRetainedNeutralRecordsV1(input, "1", host);
    expect(result).toMatchObject(invalidSchema);
    expect(sign).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("secret:input");
  });

  it("rejects malformed collections and generations before asking for a signature", async () => {
    const host = exclusionLedgerHost();
    const sign = vi.spyOn(host.exclusion_ledger_signer, "sign");
    for (const input of [null, {}, "records", [undefined], [42]]) {
      expect(await migrateRetainedNeutralRecordsV1(input as any, "1", host)).toMatchObject(invalidSchema);
    }
    for (const generation of [null, 42, {}]) {
      expect(await migrateRetainedNeutralRecordsV1(records, generation as any, host)).toMatchObject(invalidSchema);
    }
    expect(sign).not.toHaveBeenCalled();
  });

  it("returns NFC strings after verification of canonically equivalent stored references", async () => {
    const host = exclusionLedgerHost();
    const source = structuredClone(records);
    source[0]!.source_ref = "gardé";
    source[0]!.citations![0]!.locator.value = "café";
    source[1]!.source_ref = "exclué";
    const result = await migrateRetainedNeutralRecordsV1(source, "génération", host);
    if (!result.ok) throw new Error("fixture migration refused");
    const reload = JSON.parse(JSON.stringify(result.value), (_key, value) => typeof value === "string" ? value.normalize("NFD") : value);
    expect(reload.excluded[0].source_ref).not.toBe(result.value.excluded[0]!.source_ref);
    expect(await verifyMigrationExclusionLedgerV1(reload, host.exclusion_ledger_verifier)).toEqual(result);
  });

  it("refuses an invalid or unknown signing key before returning a migration", async () => {
    const host = exclusionLedgerHost();
    const untrusted = exclusionLedgerHost();
    expect(await migrateRetainedNeutralRecordsV1(records, "1", { ...host, exclusion_ledger_signer: untrusted.exclusion_ledger_signer })).toMatchObject(invalid);
    expect(await migrateRetainedNeutralRecordsV1(records, "1", { ...host, exclusion_ledger_signer: { async sign(digest) {
      return { ...await host.exclusion_ledger_signer.sign(digest), key_id: "unknown" };
    } } })).toMatchObject(invalid);
  });

  it("maps throwing or malformed host ports to typed failures without leaking their errors", async () => {
    const host = exclusionLedgerHost();
    const throwing = async (): Promise<never> => { throw new Error("secret:key-material"); };
    for (const [ports, expected] of [
      [{ ...host, exclusion_ledger_signer: { sign: throwing } }, unavailable],
      [{ ...host, exclusion_ledger_verifier: { verify: throwing } }, unavailable],
      [{ ...host, exclusion_ledger_signer: { sign: async () => null as any } }, invalid],
      [{ ...host, exclusion_ledger_verifier: { verify: async () => "yes" as any } }, invalid],
    ] as const) {
      const result = await migrateRetainedNeutralRecordsV1(records, "1", ports);
      expect(result).toMatchObject(expected);
      expect(JSON.stringify(result)).not.toContain("secret:key-material");
    }
    for (const value of [null, {}, [], "ledger", { generation: "1", migrated: null, excluded: null }]) {
      expect(await verifyMigrationExclusionLedgerV1(value, host.exclusion_ledger_verifier)).toMatchObject(invalid);
    }
  });

  it("isolates ledger snapshots from caller mutations while host ports await", async () => {
    const host = exclusionLedgerHost();
    const input = structuredClone(records);
    const pending = migrateRetainedNeutralRecordsV1(input, "1", {
      ...host,
      exclusion_ledger_signer: { async sign(digest) {
        input[0]!.valid_time!.t++;
        return host.exclusion_ledger_signer.sign(digest);
      } },
    });
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input[0]!.valid_time!.t++;
    expect(result.value.migrated[0]!.valid_time.t).toBe(10);
    const ledger = structuredClone(result.value);
    const reread = verifyMigrationExclusionLedgerV1(ledger, {
      async verify(digest, signature) {
        ledger.generation = "changed during verification";
        signature.key_id = "changed by verifier";
        return host.exclusion_ledger_verifier.verify(digest, { ...result.value.signature! });
      },
    });
    expect(await reread).toEqual({ ok: true, value: result.value });
  });
});
