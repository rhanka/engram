import { describe, expect, it } from "vitest";

import { migrateRetainedNeutralRecordsV1, type Digest, type RetainedNeutralRecordV1 } from "../engram-memory/index.js";
import { receiptDigest } from "../engram-memory/digests.js";

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

/**
 * Pinned-intake migration matrix (EVOL §10 `migration/removal` row:
 * "target plus every pinned intake").
 *
 * Each cell feeds the migration with the retained neutral records REALLY
 * present at that pin — verbatim legacy shapes from the pinned blobs, with
 * digests bound to the pin — never a synthetic-only corpus:
 * - target `34369050`, intakes `45b88bdd` / `a9d5ba1c`: no legacy memory
 *   surface exists at those pins, so the retained set is empty and the
 *   ledger must close empty (no crash, no loss, well-formed digest);
 * - intakes `686d24c3` / `1bb7f03d` (byte-identical legacy seam): the
 *   `validNote` decision record and the `human:<id>` record from
 *   `tests/memory-admission.test.ts`, plus a citation-less persona refusal
 *   (`missing_citations`) and an inverted valid interval
 *   (`invalid_valid_time`);
 * - intake `70dcfb96` (evolved seam + factory/CLI): the live round-trip
 *   decision record from `tests/memory-operational-roundtrip.test.ts`, plus
 *   a digest-less record (`missing_digest`).
 *
 * Record digests are `sha256("legacy:<cell>:<source>")` and citation content
 * digests `sha256("cite:<cell>:<source>")`, computed once and pinned here as
 * literals; every receipt and the ledger digest are recomputed independently.
 */
describe("pinned-intake migration matrix", () => {
  const T = 1_750_000_000_000;

  function citation(cell: string, source: string, contentDigest: Digest) {
    return [{
      citation_id: `cit:${cell}:${source}`,
      source_ref: "ref:A",
      locator: { scheme: "document", value: `${cell}#${source}` },
      content_digest: contentDigest,
    }];
  }

  function decisionRecord(cell: string, recordDigest: Digest, contentDigest: Digest): RetainedNeutralRecordV1 {
    return {
      source_ref: `legacy:${cell}:decision-note`,
      record_digest: recordDigest,
      valid_time: { t: T },
      citations: citation(cell, "decision-note", contentDigest),
    };
  }

  const d = (hex: string): Digest => `sha256:${hex}` as Digest;

  interface MatrixCell {
    pin: string;
    records: RetainedNeutralRecordV1[];
    migrated: string[];
    excluded: Array<{ source_ref: string; reason: string }>;
  }

  const CELLS: MatrixCell[] = [
    { pin: "343690503748f325cc7673b577321271cb0cbb9f", records: [], migrated: [], excluded: [] },
    { pin: "45b88bddf8a3caa5cfef4a6d572f317c381a8b9d", records: [], migrated: [], excluded: [] },
    { pin: "a9d5ba1c628f518929e47ce2025933bbb4f636ed", records: [], migrated: [], excluded: [] },
    {
      pin: "686d24c3d8c81d5884667e803f09f5fe7d14901d",
      records: [
        decisionRecord("686d24c3", d("d13d257be57e1437ef6ca682ca78540b4b271240eae844a16e240f43893f47c8"), d("388e51865e0e3593c1561bc1336171b9dfd44f105081f17258be4088b062a6cb")),
        {
          source_ref: "legacy:686d24c3:human-note",
          record_digest: d("3cdbde0f0ad3e634606ec5d71ea076e0b2cef913810dd360a60ccf6d062cedb3"),
          valid_time: { t: T },
          citations: citation("686d24c3", "human-note", d("37f1df5bd2baa2c9216e62b448d8dbdb48bfec69eed298592bda46393ea2abd3")),
        },
        // Persona-subject refusal: retained with no citation to carry provenance.
        {
          source_ref: "legacy:686d24c3:persona-note",
          record_digest: d("502629d674221b61c457d9ea998299374419f2733e4ed34cbb5d271b7928a029"),
          valid_time: { t: T },
        },
        {
          source_ref: "legacy:686d24c3:bad-time-note",
          record_digest: d("cc38ff1a420ddbd70c95bd8c56eb8354d74d49cc57c0d1b6c99027518144938d"),
          valid_time: { t: 30, t_end: 10 },
          citations: citation("686d24c3", "bad-time-note", d("388e51865e0e3593c1561bc1336171b9dfd44f105081f17258be4088b062a6cb")),
        },
      ],
      migrated: ["legacy:686d24c3:decision-note", "legacy:686d24c3:human-note"],
      excluded: [
        { source_ref: "legacy:686d24c3:bad-time-note", reason: "invalid_valid_time" },
        { source_ref: "legacy:686d24c3:persona-note", reason: "missing_citations" },
      ],
    },
    {
      pin: "1bb7f03d917c3833865d0d66241b67850925a536",
      records: [
        decisionRecord("1bb7f03d", d("c802aba6ab880d1bb3a4e453987696a4b26ebac41645c8da713f482bd5592e1d"), d("5bfc869e6a80afbfeccf6e7cce115c4213a4ce6837109d4b4b49bda05046dce2")),
        {
          source_ref: "legacy:1bb7f03d:human-note",
          record_digest: d("0fac82c5db2a3a4d4a6dd4f71a1dadfdc0cf696bbfd777fe5f29cbdb764c75d8"),
          valid_time: { t: T },
          citations: citation("1bb7f03d", "human-note", d("e09112c3a7df8a7643c584f621a6eccced018565ed76755be31287eab2969fee")),
        },
        {
          source_ref: "legacy:1bb7f03d:persona-note",
          record_digest: d("b49890ec6929578d421a492b8d029380cebd221e2845f7056687b2f9083317b0"),
          valid_time: { t: T },
        },
        {
          source_ref: "legacy:1bb7f03d:bad-time-note",
          record_digest: d("6079570f1609f01a888e134fc52f2fc1a21452013a2f095c5d9dfcbc2643f4f3"),
          valid_time: { t: 30, t_end: 10 },
          citations: citation("1bb7f03d", "bad-time-note", d("5bfc869e6a80afbfeccf6e7cce115c4213a4ce6837109d4b4b49bda05046dce2")),
        },
      ],
      migrated: ["legacy:1bb7f03d:decision-note", "legacy:1bb7f03d:human-note"],
      excluded: [
        { source_ref: "legacy:1bb7f03d:bad-time-note", reason: "invalid_valid_time" },
        { source_ref: "legacy:1bb7f03d:persona-note", reason: "missing_citations" },
      ],
    },
    {
      pin: "70dcfb9663e081651b8309f5338f6274e5bc5f03",
      records: [
        {
          source_ref: "legacy:70dcfb96:roundtrip-note",
          record_digest: d("eb8448649b26b5c2194c8ff7f5ce28db0a1f3409a411ec9fefb89a12672077c1"),
          valid_time: { t: T },
          citations: citation("70dcfb96", "roundtrip-note", d("9e9b593a87361337834379f1a19a93c87c9ce2fe4948aa5a21cffd170687260c")),
        },
        // Factory/CLI-era refusal: no digest to bind the record.
        {
          source_ref: "legacy:70dcfb96:no-digest-note",
          valid_time: { t: T },
          citations: citation("70dcfb96", "no-digest-note", d("9e9b593a87361337834379f1a19a93c87c9ce2fe4948aa5a21cffd170687260c")),
        },
      ],
      migrated: ["legacy:70dcfb96:roundtrip-note"],
      excluded: [{ source_ref: "legacy:70dcfb96:no-digest-note", reason: "missing_digest" }],
    },
  ];

  it.each(CELLS.map((cell) => [cell.pin, cell] as const))(
    "pin %s migrates exactly or excludes explicitly, with no silent loss",
    (_pin, cell) => {
      const ledger = migrateRetainedNeutralRecordsV1(cell.records);

      expect(ledger.migrated.map((entry) => entry.source_ref)).toEqual(cell.migrated);
      expect(ledger.excluded.map((entry) => ({ source_ref: entry.source_ref, reason: entry.reason }))).toEqual(
        cell.excluded,
      );

      // Byte-for-byte preservation on the migrated partition.
      for (const entry of ledger.migrated) {
        const input = cell.records.find((record) => record.source_ref === entry.source_ref)!;
        expect(entry.record_digest).toBe(input.record_digest);
        expect(entry.valid_time).toEqual(input.valid_time);
        expect(entry.citations).toEqual(input.citations);
        expect(entry.migration_receipt_digest).toBe(
          receiptDigest(
            "migration-record",
            { source_ref: entry.source_ref, record_digest: entry.record_digest, valid_time: entry.valid_time, citations: entry.citations },
            "migration_receipt_digest",
          ),
        );
      }
      for (const entry of ledger.excluded) {
        expect(entry.exclusion_receipt_digest).toBe(
          receiptDigest(
            "migration-exclusion",
            { source_ref: entry.source_ref, reason: entry.reason },
            "exclusion_receipt_digest",
          ),
        );
      }

      // No silent loss, and the ledger digest binds exactly this content.
      expect(ledger.migrated.length + ledger.excluded.length).toBe(cell.records.length);
      expect(ledger.ledger_digest).toBe(
        receiptDigest(
          "migration-ledger",
          { generation: ledger.generation, migrated: ledger.migrated, excluded: ledger.excluded },
          "ledger_digest",
        ),
      );
    },
  );
});
