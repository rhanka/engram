// Qualified DS adapter/renderer refs for diagram-presentation@1
// (frozen spec M3-R4 deb64b75, §3.2.1). Pinned references parse, project to
// the DS executor Pin shape { id, version, contentDigest } and bind to
// schemaPin f13d5957…; transitional/malformed pins refuse with
// presentation-pin-mismatch. Entry-byte hashes read the DS clone at the
// pinned commit; they skip (never fake-pass) when the clone is absent.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pinsDigestOf } from "../src/ontology-guardian/digests.js";
import {
  CONTRACT_CONTENT,
  CONTRACT_PIN,
  CONTRACT_QUALIFIED_REVISION,
  ENVELOPE_CONTRACT,
  ENVELOPE_CONTRACT_QUALIFIED,
  PAYLOAD_CONTRACT,
  PAYLOAD_CONTRACT_QUALIFIED,
  TRANSITIONAL_COMPATIBILITY,
  checkContractCatalogRevision,
  contractBindingOf,
  envelopeEntryDigest,
} from "../src/ontology-guardian/diagram-registry.js";
import { DIAGRAM_PRESENTATION_CONTRACT_SCHEMA } from "../src/ontology-guardian/diagram-schemas.js";
import {
  DS_ADAPTER_PATH,
  DS_ADAPTER_SHA256,
  DS_COMMIT,
  DS_RENDERER_PATH,
  DS_RENDERER_SHA256,
  DS_REPOSITORY,
  PINNED_ADAPTER_REF,
  PINNED_RENDERER_REF,
  PRESENTATION_PIN_MISMATCH,
  checkPresentationPins,
  isExactPin,
  parsePinnedDsRef,
  pinnedRefToAdapterPin,
} from "../src/ontology-guardian/diagram-presentation-pins.js";
import type { PinnedDsRef } from "../src/ontology-guardian/diagram-presentation-pins.js";
import type { Pin } from "../src/ontology-guardian/types.js";

const SCHEMA_DIGEST = "f13d595793e17e1e4740c9203b19d8381fc55b90e37121d61f5037cb79f0281a";
const CONTRACT_DIGEST = "74dadb9c31fff7653ca31692d8db3cfea782baea8d9268a3c20982ea8ab0aeae";
const OLD_ENTRY_DIGEST = "a83e2c1d0ea9612d38a0b3ad1a0f0ae4e93e7f7a10fcee49ab57a6a06659da0a";
const NEW_ENTRY_DIGEST = "c430ff66df3b04e6d792dd1a60e40e01dbeaffa47b206da0021a937ca83fa4f9";

const DS_CLONE = "/home/antoinefa/src/sent-tech-design-system";

function dsClonePresent(): boolean {
  try {
    execFileSync("git", ["-C", DS_CLONE, "rev-parse", "--git-dir"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const dsAvailable = dsClonePresent();

function dsEntryBytes(ref: PinnedDsRef): Buffer {
  return execFileSync("git", ["-C", DS_CLONE, "show", `${ref.commit}:${ref.path}`]);
}

function sha256HexBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function qualifiedAdapterPin(): Pin {
  return pinnedRefToAdapterPin(parsePinnedDsRef(PINNED_ADAPTER_REF));
}

function refWithPath(path: string): string {
  return `ds:${DS_REPOSITORY}/${path}@${DS_COMMIT}#sha256=${"0".repeat(64)}`;
}

describe("pinned DS reference format (§3.2.1)", () => {
  it("parses the qualified adapter reference to repository/commit/path/sha256", () => {
    expect(parsePinnedDsRef(PINNED_ADAPTER_REF)).toEqual({
      repository: DS_REPOSITORY,
      commit: DS_COMMIT,
      path: DS_ADAPTER_PATH,
      sha256: DS_ADAPTER_SHA256,
    });
  });

  it("parses the qualified renderer reference to repository/commit/path/sha256", () => {
    expect(parsePinnedDsRef(PINNED_RENDERER_REF)).toEqual({
      repository: DS_REPOSITORY,
      commit: DS_COMMIT,
      path: DS_RENDERER_PATH,
      sha256: DS_RENDERER_SHA256,
    });
  });

  it("projects the adapter reference onto the DS executor Pin shape", () => {
    expect(qualifiedAdapterPin()).toEqual({
      id: `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}`,
      version: DS_COMMIT,
      contentDigest: DS_ADAPTER_SHA256,
    });
  });

  it("refuses transitional references with presentation-pin-mismatch", () => {
    for (const value of [TRANSITIONAL_COMPATIBILITY.adapter, TRANSITIONAL_COMPATIBILITY.renderer]) {
      expect(() => parsePinnedDsRef(value)).toThrow(PRESENTATION_PIN_MISMATCH);
    }
  });

  it("refuses malformed references with presentation-pin-mismatch", () => {
    const malformed = [
      42,
      "ds:short#sha256=" + "0".repeat(64),
      `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}@${DS_COMMIT}`,
      `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}@${DS_COMMIT}#sha256=${"0".repeat(63)}`,
      `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}@short#sha256=${"0".repeat(64)}`,
      `ds:other/repo/${DS_ADAPTER_PATH}@${DS_COMMIT}#sha256=${"0".repeat(64)}`,
      `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}@${DS_COMMIT} #sha256=${"0".repeat(64)}`,
      `ds:${DS_REPOSITORY}/not-typescript.js@${DS_COMMIT}#sha256=${"0".repeat(64)}`,
    ];
    for (const value of malformed) {
      expect(() => parsePinnedDsRef(value)).toThrow(PRESENTATION_PIN_MISMATCH);
    }
  });

  it("refuses non-canonical entry paths with presentation-pin-mismatch", () => {
    const badPaths = [
      // NUL byte cannot occur in a git tree path.
      "packages/diagram-core/src/presentation-validate\u0000.ts",
      // Parent traversal.
      "../presentation-validate.ts",
      // Empty segment (doubled slash).
      "packages//diagram-core/src/presentation-validate.ts",
      // Parent segment in the middle.
      "packages/diagram-core/../src/presentation-validate.ts",
      // Current-directory segment.
      "packages/./diagram-core/src/presentation-validate.ts",
      // Leading slash is not repository-relative.
      "/packages/diagram-core/src/presentation-validate.ts",
      // Backslash is not POSIX.
      "packages\\diagram-core\\src\\presentation-validate.ts",
      // Control character (SOH, non-whitespace).
      "packages/diagram-core/src/presentation-validate\u0001.ts",
      // Control character (DEL).
      "packages/diagram-core/src/presentation-validate\u007f.ts",
      // Fragment delimiter collides with the reference grammar.
      "packages/diagram-core/src/present#ation-validate.ts",
      // Missing entry-file suffix.
      "packages/diagram-core/src/presentation-validate",
    ];
    for (const path of badPaths) {
      expect(() => parsePinnedDsRef(refWithPath(path))).toThrow(PRESENTATION_PIN_MISMATCH);
    }
  });
});

describe("adapter binding to schemaPin (§3.2.1)", () => {
  it("keeps contract contentDigest and schema pin unchanged", () => {
    expect(CONTRACT_CONTENT).toBe(CONTRACT_DIGEST);
    expect(DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.digest).toBe(SCHEMA_DIGEST);
    expect(DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin).toEqual({
      id: "diagram-presentation-schema",
      version: "1",
      contentDigest: SCHEMA_DIGEST,
    });
  });

  it("binds the qualified adapter to the contract schema pin through the catalog entry", () => {
    expect(PAYLOAD_CONTRACT_QUALIFIED.compatibility.adapter).toBe(PINNED_ADAPTER_REF);
    expect(parsePinnedDsRef(PAYLOAD_CONTRACT_QUALIFIED.compatibility.adapter).path).toBe(DS_ADAPTER_PATH);
    expect(PAYLOAD_CONTRACT_QUALIFIED.artifactBinding).toEqual(contractBindingOf());
    expect(PAYLOAD_CONTRACT_QUALIFIED.artifactBinding.schemaPin).toEqual(
      DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin,
    );
  });

  it("accepts the qualified adapter Pin and refuses each mutated Pin field", () => {
    const resolved = { contractPin: CONTRACT_PIN, adapterRef: PINNED_ADAPTER_REF };
    const adapterPin = qualifiedAdapterPin();
    expect(checkPresentationPins({ contractPin: CONTRACT_PIN, adapterPin }, resolved)).toEqual({
      outcome: "ok",
    });
    const mutants: Pin[] = [
      { ...adapterPin, id: "ds:other/repo/packages/diagram-core/src/presentation-validate.ts" },
      { ...adapterPin, version: "0".repeat(40) },
      { ...adapterPin, contentDigest: "0".repeat(64) },
    ];
    for (const mutant of mutants) {
      expect(checkPresentationPins({ contractPin: CONTRACT_PIN, adapterPin: mutant }, resolved)).toEqual({
        outcome: "refused",
        code: PRESENTATION_PIN_MISMATCH,
        path: "input.adapterPin",
      });
    }
    // The projected Pin equals the DS executor comparison shape field by field.
    expect(isExactPin(adapterPin, pinnedRefToAdapterPin(parsePinnedDsRef(PINNED_ADAPTER_REF)))).toBe(true);
  });

  it("refuses mutant and transitional catalog references with presentation-pin-mismatch", () => {
    const resolvedBase = { contractPin: CONTRACT_PIN, adapterRef: PINNED_ADAPTER_REF };
    void resolvedBase;
    const adapterPin = qualifiedAdapterPin();
    const wrongCommit = PINNED_ADAPTER_REF.replace(DS_COMMIT, "0".repeat(40));
    const wrongPath = PINNED_ADAPTER_REF.replace(DS_ADAPTER_PATH, "packages/diagram-core/src/validate.ts");
    const wrongSha =
      PINNED_ADAPTER_REF.slice(0, -1) + (PINNED_ADAPTER_REF.endsWith("e") ? "f" : "e");
    const malformedCatalogRefs = [
      wrongCommit,
      wrongPath,
      wrongSha,
      TRANSITIONAL_COMPATIBILITY.adapter,
      refWithPath("../presentation-validate.ts"),
      refWithPath("packages//diagram-core/src/presentation-validate.ts"),
    ];
    for (const adapterRef of malformedCatalogRefs) {
      expect(
        checkPresentationPins({ contractPin: CONTRACT_PIN, adapterPin }, { contractPin: CONTRACT_PIN, adapterRef }),
      ).toEqual({
        outcome: "refused",
        code: PRESENTATION_PIN_MISMATCH,
        path: "input.adapterPin",
      });
    }
    for (const contractPin of [
      { ...CONTRACT_PIN, contentDigest: "0".repeat(64) },
      { ...CONTRACT_PIN, version: "2" },
      { ...CONTRACT_PIN, id: "other" },
    ]) {
      expect(checkPresentationPins({ contractPin, adapterPin }, { contractPin: CONTRACT_PIN, adapterRef: PINNED_ADAPTER_REF })).toEqual({
        outcome: "refused",
        code: PRESENTATION_PIN_MISMATCH,
        path: "input.contractPin",
      });
    }
  });

  it("refuses non-Pin adapter input with presentation-pin-mismatch", () => {
    const resolved = { contractPin: CONTRACT_PIN, adapterRef: PINNED_ADAPTER_REF };
    for (const adapterPin of [
      PINNED_ADAPTER_REF,
      null,
      undefined,
      { id: "", version: DS_COMMIT, contentDigest: DS_ADAPTER_SHA256 },
      { id: `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}`, version: DS_COMMIT, contentDigest: "not-hex" },
    ]) {
      expect(
        checkPresentationPins(
          { contractPin: CONTRACT_PIN, adapterPin: adapterPin as unknown as Pin },
          resolved,
        ),
      ).toEqual({
        outcome: "refused",
        code: PRESENTATION_PIN_MISMATCH,
        path: "input.adapterPin",
      });
    }
  });
});

describe.skipIf(!dsAvailable)(
  `DS entry-byte hashes at the pinned commit${dsAvailable ? "" : " (skipped: DS clone absent at " + DS_CLONE + ")"}`,
  () => {
    it("hashes the adapter entry bytes to the pinned sha256", () => {
      const bytes = dsEntryBytes(parsePinnedDsRef(PINNED_ADAPTER_REF));
      expect(sha256HexBytes(bytes)).toBe(DS_ADAPTER_SHA256);
    });

    it("hashes the renderer entry bytes to the pinned sha256", () => {
      const bytes = dsEntryBytes(parsePinnedDsRef(PINNED_RENDERER_REF));
      expect(sha256HexBytes(bytes)).toBe(DS_RENDERER_SHA256);
    });
  },
);

describe("catalog entry lineage (entry 1 stays reproducible)", () => {
  it("leaves the transitional entry-1 record byte-identical", () => {
    expect(PAYLOAD_CONTRACT.compatibility).toEqual({ ...TRANSITIONAL_COMPATIBILITY });
    expect(PAYLOAD_CONTRACT.lineage.parents).toEqual([]);
    expect(PAYLOAD_CONTRACT.digests.contentDigest).toBe(CONTRACT_DIGEST);
    expect(PAYLOAD_CONTRACT.digests.pinsDigest).toBe(pinsDigestOf({ layers: [CONTRACT_PIN] }));
    expect(envelopeEntryDigest(ENVELOPE_CONTRACT)).toBe(OLD_ENTRY_DIGEST);
  });

  it("records entry 2 with qualified refs and preserved G0 artifact lineage", () => {
    expect(PAYLOAD_CONTRACT_QUALIFIED.compatibility.renderer).toBe(PINNED_RENDERER_REF);
    expect(PAYLOAD_CONTRACT_QUALIFIED.compatibility.adapter).toBe(PINNED_ADAPTER_REF);
    expect(PAYLOAD_CONTRACT_QUALIFIED.lineage).toEqual({ parents: [], mappings: [], migrations: [] });
    expect(PAYLOAD_CONTRACT_QUALIFIED.profilePin).toEqual(CONTRACT_PIN);
    expect(PAYLOAD_CONTRACT_QUALIFIED.stack).toEqual([CONTRACT_PIN]);
    expect(PAYLOAD_CONTRACT_QUALIFIED.digests.contentDigest).toBe(CONTRACT_DIGEST);
    expect(PAYLOAD_CONTRACT_QUALIFIED.digests.pinsDigest).toBe(pinsDigestOf({ layers: [CONTRACT_PIN] }));
    expect(ENVELOPE_CONTRACT_QUALIFIED.id).toBe("engram-diagram-presentation-2");
    expect(ENVELOPE_CONTRACT_QUALIFIED.entryVersion).toBe("2");
    expect(envelopeEntryDigest(ENVELOPE_CONTRACT_QUALIFIED)).toBe(NEW_ENTRY_DIGEST);
  });

  it("keeps the catalog-revision link outside the closed G0 payload/envelope", () => {
    expect(CONTRACT_QUALIFIED_REVISION).toEqual({
      successor: { id: "engram-diagram-presentation-2", entryVersion: "2" },
      predecessor: {
        id: "engram-diagram-presentation-1",
        entryVersion: "1",
        entryDigest: OLD_ENTRY_DIGEST,
      },
    });
    expect(CONTRACT_QUALIFIED_REVISION.successor).toEqual({
      id: ENVELOPE_CONTRACT_QUALIFIED.id,
      entryVersion: ENVELOPE_CONTRACT_QUALIFIED.entryVersion,
    });
    expect("predecessor" in PAYLOAD_CONTRACT_QUALIFIED).toBe(false);
    expect("successor" in PAYLOAD_CONTRACT_QUALIFIED).toBe(false);
    expect("predecessor" in ENVELOPE_CONTRACT_QUALIFIED).toBe(false);
  });

  it("resolves the predecessor and refuses a wrong predecessor digest", () => {
    expect(checkContractCatalogRevision(ENVELOPE_CONTRACT_QUALIFIED, ENVELOPE_CONTRACT)).toEqual({
      outcome: "ok",
    });
    expect(
      checkContractCatalogRevision(ENVELOPE_CONTRACT_QUALIFIED, ENVELOPE_CONTRACT, {
        successor: { id: "engram-diagram-presentation-2", entryVersion: "2" },
        predecessor: {
          id: "engram-diagram-presentation-1",
          entryVersion: "1",
          entryDigest: "0".repeat(64),
        },
      }),
    ).toEqual({
      outcome: "refused",
      code: PRESENTATION_PIN_MISMATCH,
      path: "predecessor.entryDigest",
    });
    expect(
      checkContractCatalogRevision(
        { id: "engram-diagram-presentation-9", entryVersion: "9" },
        ENVELOPE_CONTRACT,
      ),
    ).toEqual({
      outcome: "refused",
      code: PRESENTATION_PIN_MISMATCH,
      path: "successor.id",
    });
  });
});
