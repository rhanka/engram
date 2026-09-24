import { receiptDigest } from "./digests.js";
import type { CitationV1, Digest, OpaqueRef, ValidIntervalV1 } from "./contracts/index.js";

/**
 * Migration closure (SPEC §9 L7): each retained neutral record is either
 * transformed with its digests/valid-time/citations preserved exactly, or it is
 * listed in an explicit exclusion ledger with a deterministic reason. Silent
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
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function validValidTime(value: ValidIntervalV1 | undefined): value is ValidIntervalV1 {
  if (value === undefined || !Number.isSafeInteger(value.t)) return false;
  if (value.t_end === undefined) return true;
  return Number.isSafeInteger(value.t_end) && value.t_end >= value.t;
}

function citationsPreserved(citations: ReadonlyArray<CitationV1> | undefined): citations is ReadonlyArray<CitationV1> {
  return Array.isArray(citations) && citations.length > 0
    && citations.every((citation) => typeof citation.citation_id === "string" && isDigest(citation.content_digest));
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

/** Partition retained neutral records into preserved migrations and an exclusion ledger. */
export function migrateRetainedNeutralRecordsV1(
  records: ReadonlyArray<RetainedNeutralRecordV1>,
  generation = "1",
): MigrationLedgerV1 {
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
      valid_time: record.valid_time!,
      citations: record.citations!,
    };
    migrated.push({ ...body, migration_receipt_digest: receiptDigest("migration-record", body, "migration_receipt_digest") });
  }
  migrated.sort((a, b) => (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0));
  excluded.sort((a, b) => (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0));
  const ledgerBody = { generation, migrated, excluded };
  return { ...ledgerBody, ledger_digest: receiptDigest("migration-ledger", ledgerBody as unknown as Record<string, unknown>, "ledger_digest") };
}
