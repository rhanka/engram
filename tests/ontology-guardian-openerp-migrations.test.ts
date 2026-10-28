// OpenERP candidate diff and versioning by preimage tier (§6b, FX-OP-09).
// Tier G only keeps native identity/version, Pin and the §1.6 triple fixed;
// tier N requires a successor draft at version 2; tier X assigns no native
// field and no version. Published openerp@1 bytes never change (G0 R-2).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOntologyProfile, validateOntologyProfile } from "../src/ontology-profile.js";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { pinsDigestOf, resultDigestOf, stableForHash } from "../src/ontology-guardian/digests.js";
import {
  OPENERP_CONTENT_DIGEST,
  OPENERP_PINS_DIGEST,
  OPENERP_PROFILE_V1,
  OPENERP_RESULT_DIGEST,
  auditOpenerpProfileFields,
  buildOpenerpProfileV1,
} from "../src/ontology-guardian/openerp-profile.js";
import { columnRows } from "../src/ontology-guardian/openerp-governed.js";
import {
  OPENERP_CATALOG_STATIC,
  RECORD_OPENERP_V1,
  SUCCESSOR_V2_DIGESTS,
  buildOpenerpSuccessorV2,
} from "../src/ontology-guardian/openerp-registry.js";

const here = process.env.OPENERP_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));
const ont = JSON.parse(readFileSync(join(here, "fixtures", "openerp", "openerp-ontology.json"), "utf8"));

function tripleOf(profile: Parameters<typeof normalizeOntologyProfile>[0]): {
  content: string;
  pins: string;
  result: string;
} {
  const normalized = normalizeOntologyProfile(profile);
  const pin = { id: "openerp", version: String((profile as { version: string }).version), contentDigest: normalized.profile_hash };
  return {
    content: normalized.profile_hash,
    pins: pinsDigestOf({ layers: [pin] }),
    result: resultDigestOf({ effectiveDeclarations: stableForHash(normalized), effectiveRuleSet: [], severityPolicyDigest: null }),
  };
}

describe("tier G: column metadata change keeps the §1.6 triple fixed", () => {
  it("flipping organizations.legal_name.notNull yields a metadata diff only", () => {
    const mutated = structuredClone(ont) as typeof ont;
    const organizations = mutated.entities.find((e: { entity: string }) => e.entity === "organizations") as {
      columns: { name: string; notNull: boolean }[];
    };
    const legalName = organizations.columns.find((c) => c.name === "legal_name")!;
    expect(legalName.notNull).toBe(true);
    legalName.notNull = false;
    const before = columnRows(ont).find((c) => c.entity === "organizations" && c.name === "legal_name")!;
    const after = columnRows(mutated).find((c) => c.entity === "organizations" && c.name === "legal_name")!;
    expect(before.notNull).toBe(true);
    expect(after.notNull).toBe(false);
    expect(canonicalBytes(buildOpenerpProfileV1(mutated))).toBe(canonicalBytes(OPENERP_PROFILE_V1));
    expect(tripleOf(buildOpenerpProfileV1(mutated))).toEqual({
      content: OPENERP_CONTENT_DIGEST,
      pins: OPENERP_PINS_DIGEST,
      result: OPENERP_RESULT_DIGEST,
    });
  });
});

describe("tier N: native change requires a successor draft, never an edit", () => {
  it("leaves published openerp@1 bytes unchanged (G0 R-2)", () => {
    expect(canonicalBytes(OPENERP_PROFILE_V1)).toBe(canonicalBytes(buildOpenerpProfileV1(ont)));
    expect(validateOntologyProfile(OPENERP_PROFILE_V1)).toEqual([]);
  });

  it("assigns version 2 with the three changed digests", () => {
    const successor = buildOpenerpSuccessorV2();
    expect(successor.version).toBe("2");
    expect(tripleOf(successor)).toEqual({
      content: SUCCESSOR_V2_DIGESTS.contentDigest,
      pins: SUCCESSOR_V2_DIGESTS.pinsDigest,
      result: SUCCESSOR_V2_DIGESTS.resultDigest,
    });
    expect(canonicalBytes(successor)).not.toBe(canonicalBytes(OPENERP_PROFILE_V1));
  });

  it("carries no migration at version 1 and no composition for EXT", () => {
    expect(RECORD_OPENERP_V1.lineage.migrations).toEqual([]);
    expect("migrationRef" in RECORD_OPENERP_V1).toBe(false);
    expect(OPENERP_CATALOG_STATIC.migrations).toEqual([]);
  });
});

describe("tier X: gaps assign no native field and no version", () => {
  it("unresolved OQ-OP-14 / OQ-OP-15 leaves the triple and version fixed", () => {
    expect(auditOpenerpProfileFields(OPENERP_PROFILE_V1 as unknown as Record<string, unknown>)).toEqual([]);
    const keys = JSON.stringify(OPENERP_PROFILE_V1);
    expect(keys.includes("attribute")).toBe(false);
    expect(keys.includes("constraint")).toBe(false);
    expect(keys.includes(".sql")).toBe(false);
    expect(OPENERP_PROFILE_V1.version).toBe("1");
    expect(tripleOf(OPENERP_PROFILE_V1)).toEqual({
      content: OPENERP_CONTENT_DIGEST,
      pins: OPENERP_PINS_DIGEST,
      result: OPENERP_RESULT_DIGEST,
    });
  });
});

describe("§6(d) source re-pin rule (OQ-OP-03)", () => {
  it("keeps d06d5ece unverified until OpenERP publishes the artifacts", () => {
    expect(OPENERP_CATALOG_STATIC.provenance).toEqual({
      sourceRef: "OpenERP repository, snapshot source/ ([ONT], [RET], [EXP], [SUMS])",
      sourceRevision: "d06d5ece",
    });
  });
});
