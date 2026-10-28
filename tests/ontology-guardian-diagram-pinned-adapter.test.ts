// Qualified DS adapter/renderer refs for diagram-presentation@1
// (frozen spec M3-R4 deb64b75, §3.2.1). Pinned references parse, bind to
// schemaPin f13d5957…, and refuse transitional/mutant pins with
// presentation-pin-mismatch. Entry-byte hashes read the DS clone at the
// pinned commit; they skip (never fake-pass) when the clone is absent.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pinsDigestOf } from "../src/ontology-guardian/digests.js";
import {
  CONTRACT_CONTENT,
  CONTRACT_PIN,
  ENVELOPE_CONTRACT,
  ENVELOPE_CONTRACT_QUALIFIED,
  PAYLOAD_CONTRACT,
  PAYLOAD_CONTRACT_QUALIFIED,
  TRANSITIONAL_COMPATIBILITY,
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
  parsePinnedDsRef,
} from "../src/ontology-guardian/diagram-presentation-pins.js";
import type { PinnedDsRef } from "../src/ontology-guardian/diagram-presentation-pins.js";

const SCHEMA_DIGEST = "f13d595793e17e1e4740c9203b19d8381fc55b90e37121d61f5037cb79f0281a";
const CONTRACT_DIGEST = "74dadb9c31fff7653ca31692d8db3cfea782baea8d9268a3c20982ea8ab0aeae";
const OLD_ENTRY_DIGEST = "a83e2c1d0ea9612d38a0b3ad1a0f0ae4e93e7f7a10fcee49ab57a6a06659da0a";
const NEW_ENTRY_DIGEST = "b6cdadeadba30ff18732973fd5256d74238b5d6e6ebde0d43844556adef40d38";

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

  it("accepts the qualified pins and refuses mutants with presentation-pin-mismatch", () => {
    const resolved = { contractPin: CONTRACT_PIN, adapterRef: PINNED_ADAPTER_REF };
    expect(checkPresentationPins({ contractPin: CONTRACT_PIN, adapterPin: PINNED_ADAPTER_REF }, resolved)).toEqual({
      outcome: "ok",
    });
    const wrongCommit = PINNED_ADAPTER_REF.replace(DS_COMMIT, "0".repeat(40));
    const wrongPath = PINNED_ADAPTER_REF.replace(DS_ADAPTER_PATH, "packages/diagram-core/src/validate.ts");
    const wrongSha =
      PINNED_ADAPTER_REF.slice(0, -1) + (PINNED_ADAPTER_REF.endsWith("e") ? "f" : "e");
    const mutants = [wrongCommit, wrongPath, wrongSha, TRANSITIONAL_COMPATIBILITY.adapter];
    for (const adapterPin of mutants) {
      expect(checkPresentationPins({ contractPin: CONTRACT_PIN, adapterPin }, resolved)).toEqual({
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
      expect(checkPresentationPins({ contractPin, adapterPin: PINNED_ADAPTER_REF }, resolved)).toEqual({
        outcome: "refused",
        code: PRESENTATION_PIN_MISMATCH,
        path: "input.contractPin",
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

  it("records entry 2 with qualified refs and explicit lineage to entry 1", () => {
    expect(PAYLOAD_CONTRACT_QUALIFIED.compatibility.renderer).toBe(PINNED_RENDERER_REF);
    expect(PAYLOAD_CONTRACT_QUALIFIED.compatibility.adapter).toBe(PINNED_ADAPTER_REF);
    expect(PAYLOAD_CONTRACT_QUALIFIED.lineage).toEqual({ parents: [CONTRACT_PIN], mappings: [], migrations: [] });
    expect(PAYLOAD_CONTRACT_QUALIFIED.profilePin).toEqual(CONTRACT_PIN);
    expect(PAYLOAD_CONTRACT_QUALIFIED.stack).toEqual([CONTRACT_PIN]);
    expect(PAYLOAD_CONTRACT_QUALIFIED.digests.contentDigest).toBe(CONTRACT_DIGEST);
    expect(PAYLOAD_CONTRACT_QUALIFIED.digests.pinsDigest).toBe(pinsDigestOf({ layers: [CONTRACT_PIN] }));
    expect(ENVELOPE_CONTRACT_QUALIFIED.id).toBe("engram-diagram-presentation-2");
    expect(ENVELOPE_CONTRACT_QUALIFIED.entryVersion).toBe("2");
    expect(envelopeEntryDigest(ENVELOPE_CONTRACT_QUALIFIED)).toBe(NEW_ENTRY_DIGEST);
  });
});
