import { receiptDigest } from "./digests.js";
import type {
  CitationV1, Digest, ExclusionLedgerSignatureV1, ExclusionLedgerVerifierPortV1,
  MigrationExclusionLedgerPortsV1, OpaqueRef, Result, ValidIntervalV1,
} from "./contracts/index.js";

/**
 * Migration closure (SPEC §9 L7): each retained neutral record is either
 * transformed with its digests/valid-time/citations preserved exactly, or it is
 * listed in a host-signed exclusion ledger with a deterministic reason. Silent
 * loss is forbidden — every input appears in exactly one output partition.
 */

export interface RetainedNeutralRecordV1 {
  source_ref: OpaqueRef;
  record_digest?: Digest;
  valid_time?: ValidIntervalV1;
  citations?: ReadonlyArray<CitationV1>;
}

export interface MigratedNeutralRecordV1 {
  source_ref: OpaqueRef;
  record_digest: Digest;
  valid_time: ValidIntervalV1;
  citations: ReadonlyArray<CitationV1>;
  migration_receipt_digest: Digest;
}

export type MigrationExclusionReason =
  | "missing_digest"
  | "invalid_digest"
  | "missing_valid_time"
  | "invalid_valid_time"
  | "missing_citations"
  | "invalid_citations";

export interface MigrationExclusionEntryV1 {
  source_ref: OpaqueRef;
  reason: MigrationExclusionReason;
  exclusion_receipt_digest: Digest;
}

export interface MigrationLedgerV1 {
  generation: string;
  migrated: ReadonlyArray<MigratedNeutralRecordV1>;
  excluded: ReadonlyArray<MigrationExclusionEntryV1>;
  ledger_digest: Digest;
  // 2026-10-16 amendment: mandatory whenever excluded is non-empty; absent on lossless migration.
  signature?: ExclusionLedgerSignatureV1;
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function validValidTime(value: unknown): value is ValidIntervalV1 {
  if (!object(value) || !exact(value, ["t"], ["t_end"]) || !Number.isSafeInteger(value.t)) return false;
  if (value.t_end === undefined) return true;
  return Number.isSafeInteger(value.t_end) && (value.t_end as number) >= (value.t as number);
}

function citationsPreserved(citations: unknown): citations is ReadonlyArray<CitationV1> {
  return Array.isArray(citations) && citations.length > 0
    && citations.every((citation) => object(citation)
      && exact(citation, ["citation_id", "source_ref", "locator", "content_digest"], ["observed_at"])
      && typeof citation.citation_id === "string" && typeof citation.source_ref === "string" && isDigest(citation.content_digest)
      && (citation.observed_at === undefined || typeof citation.observed_at === "string")
      && object(citation.locator) && exact(citation.locator, ["scheme", "value"])
      && typeof citation.locator.scheme === "string" && typeof citation.locator.value === "string");
}

function classify(record: RetainedNeutralRecordV1): MigrationExclusionReason | undefined {
  if (record.record_digest === undefined) return "missing_digest";
  if (!isDigest(record.record_digest)) return "invalid_digest";
  if (record.valid_time === undefined) return "missing_valid_time";
  if (!validValidTime(record.valid_time)) return "invalid_valid_time";
  if (record.citations === undefined) return "missing_citations";
  if (!citationsPreserved(record.citations)) return "invalid_citations";
  return undefined;
}

function refusal(code: "CAPABILITY_UNAVAILABLE" | "MIGRATION_LEDGER_INVALID", message: string): Result<MigrationLedgerV1> {
  return { ok: false, error: { code, operation: "migrate", message, retryable: false } };
}

function ledgerDigest(ledger: MigrationLedgerV1): Digest {
  const { ledger_digest: _digest, signature: _signature, ...body } = ledger;
  return receiptDigest("migration-ledger", body, "ledger_digest");
}

function validSignature(value: unknown): value is ExclusionLedgerSignatureV1 {
  return object(value) && exact(value, ["algorithm", "key_id", "signature"])
    && [value.algorithm, value.key_id, value.signature].every((field) => typeof field === "string" && field.length > 0);
}

/** Re-read an exclusion ledger from untrusted storage. A stripped exclusion partition never bypasses signature verification. */
export async function verifyMigrationExclusionLedgerV1(
  value: unknown,
  verifier?: ExclusionLedgerVerifierPortV1,
): Promise<Result<MigrationLedgerV1>> {
  let ledger: MigrationLedgerV1;
  try {
    // Isolate storage/caller objects before crossing an asynchronous host boundary.
    const snapshot: unknown = structuredClone(value);
    if (!object(snapshot) || !exact(snapshot, ["generation", "migrated", "excluded", "ledger_digest", "signature"])
      || typeof snapshot.generation !== "string" || !Array.isArray(snapshot.migrated) || !Array.isArray(snapshot.excluded)
      || !isDigest(snapshot.ledger_digest) || !validSignature(snapshot.signature)) {
      return refusal("MIGRATION_LEDGER_INVALID", "migration exclusion ledger is malformed or unsigned");
    }
    ledger = snapshot as unknown as MigrationLedgerV1;
    if (ledger.ledger_digest !== ledgerDigest(ledger)
      || !ledger.migrated.every((entry) => object(entry)
        && exact(entry, ["source_ref", "record_digest", "valid_time", "citations", "migration_receipt_digest"])
        && typeof entry.source_ref === "string" && classify(entry) === undefined
        && entry.migration_receipt_digest === receiptDigest("migration-record", { ...entry }, "migration_receipt_digest"))
      || !ledger.excluded.every((entry) => object(entry)
        && exact(entry, ["source_ref", "reason", "exclusion_receipt_digest"])
        && typeof entry.source_ref === "string"
        && ["missing_digest", "invalid_digest", "missing_valid_time", "invalid_valid_time", "missing_citations", "invalid_citations"].includes(entry.reason)
        && entry.exclusion_receipt_digest === receiptDigest("migration-exclusion", { ...entry }, "exclusion_receipt_digest"))) {
      return refusal("MIGRATION_LEDGER_INVALID", "migration exclusion ledger digest or receipts do not match");
    }
  } catch {
    return refusal("MIGRATION_LEDGER_INVALID", "migration exclusion ledger is not canonical data");
  }
  if (!verifier) return refusal("CAPABILITY_UNAVAILABLE", "migration exclusion ledger requires a host verifier");
  try {
    // Give the host its own descriptor, so it cannot mutate the accepted snapshot.
    if (await verifier.verify(ledger.ledger_digest, { ...ledger.signature! }) !== true) {
      return refusal("MIGRATION_LEDGER_INVALID", "migration exclusion ledger signature is invalid or its key is unknown");
    }
  } catch {
    return refusal("CAPABILITY_UNAVAILABLE", "migration exclusion ledger host verifier failed");
  }
  return { ok: true, value: ledger };
}

/** Partition, sign and verify before returning any exclusions. No keys or default signer live in this package. */
export async function migrateRetainedNeutralRecordsV1(
  records: ReadonlyArray<RetainedNeutralRecordV1>,
  generation = "1",
  ports: MigrationExclusionLedgerPortsV1 = {},
): Promise<Result<MigrationLedgerV1>> {
  const migrated: MigratedNeutralRecordV1[] = [];
  const excluded: MigrationExclusionEntryV1[] = [];
  for (const record of records) {
    const reason = classify(record);
    if (reason !== undefined) {
      const body = { source_ref: record.source_ref, reason };
      excluded.push({ ...body, exclusion_receipt_digest: receiptDigest("migration-exclusion", body, "exclusion_receipt_digest") });
      continue;
    }
    // Preserve digest / valid-time / citations byte-for-byte.
    const body = {
      source_ref: record.source_ref,
      record_digest: record.record_digest!,
      valid_time: structuredClone(record.valid_time!),
      citations: structuredClone(record.citations!),
    };
    migrated.push({ ...body, migration_receipt_digest: receiptDigest("migration-record", body, "migration_receipt_digest") });
  }
  migrated.sort((a, b) => (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0));
  excluded.sort((a, b) => (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0));
  const ledgerBody = { generation, migrated, excluded };
  const ledger: MigrationLedgerV1 = { ...ledgerBody, ledger_digest: receiptDigest("migration-ledger", ledgerBody, "ledger_digest") };
  if (excluded.length === 0) return { ok: true, value: ledger };
  if (!ports.exclusion_ledger_signer || !ports.exclusion_ledger_verifier) {
    return refusal("CAPABILITY_UNAVAILABLE", "excluding retained records requires a host signer and verifier");
  }
  try {
    ledger.signature = await ports.exclusion_ledger_signer.sign(ledger.ledger_digest);
  } catch {
    return refusal("CAPABILITY_UNAVAILABLE", "migration exclusion ledger host signer failed");
  }
  return verifyMigrationExclusionLedgerV1(ledger, ports.exclusion_ledger_verifier);
}
