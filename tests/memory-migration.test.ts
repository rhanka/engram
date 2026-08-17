import { describe, expect, it } from "vitest";

import { migrateRetainedNeutralRecordsV1, type Digest, type RetainedNeutralRecordV1 } from "../graphify-memory/index.js";

const DIGEST_A = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as Digest;
const DIGEST_B = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as Digest;
const CONTENT = "sha256:3333333333333333333333333333333333333333333333333333333333333333" as Digest;

describe("retained neutral record migration", () => {
  it("retained neutral records preserve digests/time/citations or emit an explicit exclusion ledger", () => {
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

    const ledger = migrateRetainedNeutralRecordsV1(records);

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
