// OpenERP acceptance fixtures FX-OP-01…FX-OP-12 (SPEC-openerp-ontology §10).
// Each fixture decides its claim by exit status, digest equality or an
// asserted diagnostic. No fixture asserts a storage tier, a DDL shape, or a
// SAP/Odoo field correspondence beyond §4.
// FX-OP-04 observable table (§10 line -> deciding operation -> submitted input):
// | recomputed closure contains MIT only | NONE (licences:["MIT"] is data; no G0 pack-closure operation) | NOT submitted -> not-covered GAP-OP-04 |
// | excluded licence refuses admission with excluded-licence, no lifecycle cure | NONE (checkOpenerpLicenceClosure checks a string array only, src/ontology-guardian/openerp-registry.ts:245; checkAdmission only returns missing-receipt, src/ontology-guardian/admission.ts:445) | pack with real dependency closure NOT submitted (no operation) -> not-covered GAP-OP-04 |
// FX-OP-10 observable table (§10 line -> deciding operation -> submitted input):
// | deprecation leaves triple equal, changes entryDigest | entryDigestOf (src/ontology-guardian/digests.ts:292) + pinsDigestOf (:81) + resultDigestOf (:271) + hashOntologyProfile (src/ontology-profile.ts:505) | complete synthetic catalog entries before/after with triple recomputed from unchanged profile inputs |
// | deprecated version stays resolvable by pin | resolveOpenerpVersion (src/ontology-guardian/openerp-registry.ts:263) | resolved pin checked against the synthetic catalog state |
// | unknown version refuses incompatible_version | resolveOpenerpVersion (src/ontology-guardian/openerp-registry.ts:263) | "99" and "" (never a latest fallback) |
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import {
  entryDigestOf,
  mappingDigestOf,
  pinsDigestOf,
  resultDigestOf,
  stableForHash,
} from "../src/ontology-guardian/digests.js";
import { hashOntologyProfile, normalizeOntologyProfile } from "../src/ontology-profile.js";
import {
  OPENERP_CONTENT_DIGEST,
  OPENERP_PIN,
  OPENERP_PINS_DIGEST,
  OPENERP_PROFILE_V1,
  OPENERP_RESULT_DIGEST,
} from "../src/ontology-guardian/openerp-profile.js";
import {
  ACCOUNTING_BALANCE,
  CANDIDATE_KINDS,
  JOURNAL_SOURCE_KINDS,
  LINE_SOURCE_ENFORCEMENT,
  LINE_SOURCE_TARGETS,
  NOT_TENANT_CARRIED_RELATIONS,
  OUTBOX_ARM_GATED,
  TENANCY,
  TENANT_CARRIED_DATABASE,
  UNIQUENESS_CONSTRAINTS,
  checkCandidateKind,
  checkJournalSourceType,
  immutabilityOf,
  lineSourceKindStatus,
  tenantCarriedOf,
  violatesTenantScopedUniqueness,
} from "../src/ontology-guardian/openerp-constraints.js";
import {
  FIELD_LEVEL_BLOCKED_BY,
  MAPPING_ODOO,
  MAPPING_OPEN_STANDARDS,
  MAPPING_SAP,
  OPENERP_COVERAGE_TYPES,
  qualifyMappingEntry,
} from "../src/ontology-guardian/openerp-mappings.js";
import {
  OPENERP_ADMISSION_TASKS,
  OPENERP_ALLOWED_LICENCES,
  OPENERP_FIXTURE_COVERAGE,
  OPENERP_G0_CONTRACT_GAPS,
  RECORD_OPENERP_V1,
  SUCCESSOR_V2_DIGESTS,
  SUCCESSOR_V2_PIN,
  checkOpenerpLicenceClosure,
  resolveOpenerpVersion,
} from "../src/ontology-guardian/openerp-registry.js";

const here = process.env.OPENERP_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));
const ont = JSON.parse(readFileSync(join(here, "fixtures", "openerp", "openerp-ontology.json"), "utf8"));

/** §6(b) export semantic comparison: producedAt set aside, all else exact. */
function compareExportSemantics(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const { producedAt: _pa, ...restA } = a;
  const { producedAt: _pb, ...restB } = b;
  return canonicalBytes(restA) === canonicalBytes(restB);
}

/** Test-side oracle of the declared amount shape CHECK (§2.7 bank_transactions). */
function checkAmountShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "amountMinor,currency,scale") return false;
  if (typeof record["amountMinor"] !== "number") return false;
  if (typeof record["scale"] !== "number") return false;
  if (typeof record["currency"] !== "string") return false;
  return /^[A-Z]{3}$/.test(record["currency"] as string);
}

const ALLOWED_LICENCES = OPENERP_ALLOWED_LICENCES;

describe("FX-OP-01 export comparison discipline (§6b)", () => {
  it("compares semantically with producedAt set aside, never by file sha", () => {
    const rerun = { ...ont, producedAt: "2026-10-28" };
    expect(compareExportSemantics(ont, rerun)).toBe(true);
    const changed = structuredClone(ont) as { entities: { entity: string }[] };
    changed.entities = [...changed.entities, { entity: "invented" }];
    expect(compareExportSemantics(ont, changed as never)).toBe(false);
    expect(canonicalBytes(ont)).not.toBe(canonicalBytes(rerun));
  });
});

describe("FX-OP-04 licence closure (§7) — not-covered (GAP-OP-04)", () => {
  it("documents FX-OP-04 as not-covered (missing G0 pack-closure gate)", () => {
    expect(OPENERP_FIXTURE_COVERAGE["FX-OP-04"]).toEqual({ status: "not-covered", gap: "GAP-OP-04" });
    expect(OPENERP_G0_CONTRACT_GAPS.find((g) => g.id === "GAP-OP-04")).toMatchObject({ owner: "engram" });
    expect(OPENERP_ADMISSION_TASKS.some((t) => t.field.includes("licenceClosure"))).toBe(true);
  });

  it("allowlist unit (NOT FX-OP-04): string array check only, no pack closure", () => {
    expect(checkOpenerpLicenceClosure(["MIT"])).toEqual({ admitted: true });
    expect(checkOpenerpLicenceClosure([...ALLOWED_LICENCES])).toEqual({ admitted: true });
    const excluded = checkOpenerpLicenceClosure(["MIT", "GPL-3.0"]);
    expect(excluded.admitted).toBe(false);
    if (excluded.admitted !== false) throw new Error("licence");
    expect(excluded.code).toBe("excluded-licence");
  });

  it.todo("FX-OP-04 pack closure: missing G0 pack licence-closure recomputation with excluded-licence gate (GAP-OP-04, owner engram)");
});

describe("FX-OP-05 tenant-scoped uniqueness (§3.2a)", () => {
  it("declares 20 tenant-scoped uniqueness rows, all database", () => {
    expect(UNIQUENESS_CONSTRAINTS.length).toBe(20);
    for (const row of UNIQUENESS_CONSTRAINTS) {
      expect(row.scope).toBe("organization_id");
      expect(row.enforcement).toBe("database");
    }
    const subjects = UNIQUENESS_CONSTRAINTS.map((r) => r.subject);
    expect(subjects).toContain("invoices (organization_id, invoice_number)");
    expect(subjects).toContain("accounts (organization_id, code)");
    expect(subjects).toContain("tax_categories (organization_id, code)");
  });

  it("accepts distinct tenants and refuses same tenant plus key", () => {
    expect(
      violatesTenantScopedUniqueness(
        { organization_id: "org-a", key: "INV-1" },
        { organization_id: "org-b", key: "INV-1" },
      ),
    ).toBe(false);
    expect(
      violatesTenantScopedUniqueness(
        { organization_id: "org-a", key: "INV-1" },
        { organization_id: "org-a", key: "INV-1" },
      ),
    ).toBe(true);
    expect(
      violatesTenantScopedUniqueness(
        { organization_id: "org-a", key: "INV-1" },
        { organization_id: "org-a", key: "INV-2" },
      ),
    ).toBe(false);
  });
});

describe("FX-OP-06 polymorphic declarations (§3.2d, OQ-OP-10)", () => {
  it("asserts no target for the manual arm and refuses kinds outside the sets", () => {
    expect(checkJournalSourceType("manual")).toBe(true);
    expect(checkJournalSourceType("subscription")).toBe(false);
    const manual = LINE_SOURCE_TARGETS.find((r) => r.kind === "manual")!;
    expect(manual.target).toBe("null source_id");
    expect(checkCandidateKind("payment")).toBe(true);
    expect(checkCandidateKind("invoice")).toBe(false);
    expect(checkCandidateKind(null)).toBe(false);
    expect(JOURNAL_SOURCE_KINDS).toEqual(["invoice", "payment", "manual"]);
    expect(CANDIDATE_KINDS).toEqual(["payment"]);
  });

  it("records line-level kind sets as unverified under OQ-OP-10", () => {
    expect(lineSourceKindStatus()).toEqual({ status: "unverified", owner: "OQ-OP-10" });
    expect(LINE_SOURCE_ENFORCEMENT).toBe("application-convention");
    const recurring = LINE_SOURCE_TARGETS.find((r) => r.kind === "recurring_schedule")!;
    expect(recurring.target).toBe("recurring_billing_schedules.id");
    expect(recurring.writer).toBe("billing/recurring-schedule-service.ts:302 and :415");
  });
});

describe("FX-OP-07 evidence immutability (§3.2c, OQ-OP-12)", () => {
  it("declares database immutability for exactly two entities", () => {
    expect(immutabilityOf("bank_transactions")).toEqual({ enforcement: "database" });
    expect(immutabilityOf("audit_events")).toEqual({ enforcement: "database" });
    expect(immutabilityOf("domain_events")).toEqual({ enforcement: "unverified", owner: "OQ-OP-12" });
    expect(OUTBOX_ARM_GATED).toMatchObject({ status: "unverified", owner: "openerp", question: "OQ-OP-12" });
    expect([...OUTBOX_ARM_GATED.standingArms].sort()).toEqual(["audit_events", "bank_transactions"]);
  });

  it("refuses an amount jsonb value with an extra or missing key", () => {
    expect(checkAmountShape({ amountMinor: 100, currency: "CAD", scale: 2 })).toBe(true);
    expect(checkAmountShape({ amountMinor: 100, currency: "CAD", scale: 2, extra: 1 })).toBe(false);
    expect(checkAmountShape({ amountMinor: 100, currency: "CAD" })).toBe(false);
    expect(checkAmountShape({ amountMinor: 100, currency: "cad", scale: 2 })).toBe(false);
  });
});

describe("FX-OP-08 mapping integrity (§4, §6c)", () => {
  it("publishes a first type entry as mapping version 2 with ontology digests fixed", () => {
    const v2 = mappingDigestOf({
      mappingId: MAPPING_OPEN_STANDARDS.mappingId,
      version: "2",
      entries: [{ kind: "type", from: "invoices", to: "ubl:Invoice" }],
    });
    expect(v2).not.toBe(MAPPING_OPEN_STANDARDS.contentDigest);
    expect(OPENERP_CONTENT_DIGEST).toBe("8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65");
    expect(OPENERP_PINS_DIGEST).toBe("cda06dc8e8895fa8e940b11092f7b720c08053caf7871ad63818b879a3914e6a");
    expect(OPENERP_RESULT_DIGEST).toBe("8e71a6769cfd313bb44a6943369e5aa4de513802607ea8a4f13ae8b3f98a910f");
    for (const artifact of [MAPPING_OPEN_STANDARDS, MAPPING_ODOO, MAPPING_SAP]) {
      expect(artifact.entries).toEqual([]);
    }
  });

  it("fails qualification for field decisions, grouped sources and unpinned references", () => {
    expect(qualifyMappingEntry({ from: "invoices", level: "type", referencePinned: true })).toEqual({
      qualified: true,
    });
    expect(qualifyMappingEntry({ from: "invoices.total", level: "field", referencePinned: true })).toEqual({
      qualified: false,
      reason: "field-level-blocked",
    });
    expect(FIELD_LEVEL_BLOCKED_BY).toBe("OQ-OP-15");
    expect(qualifyMappingEntry({ from: "companies, contacts", level: "type", referencePinned: true })).toEqual({
      qualified: false,
      reason: "grouped-source",
    });
    expect(qualifyMappingEntry({ from: "invoices", level: "type", referencePinned: false })).toEqual({
      qualified: false,
      reason: "reference-unpinned",
    });
  });

  it("rejects column and unknown sources independently of the supplied level (FX-OP-08)", () => {
    expect(qualifyMappingEntry({ from: "invoices.company_id", level: "type", referencePinned: true })).toEqual({
      qualified: false,
      reason: "field-level-blocked",
    });
    expect(qualifyMappingEntry({ from: "invoices.company_id", level: "field", referencePinned: true })).toEqual({
      qualified: false,
      reason: "field-level-blocked",
    });
    expect(qualifyMappingEntry({ from: "invoices.company_id", level: "type", referencePinned: false })).toEqual({
      qualified: false,
      reason: "field-level-blocked",
    });
    expect(qualifyMappingEntry({ from: "no_such_entity", level: "type", referencePinned: true })).toEqual({
      qualified: false,
      reason: "unknown-source",
    });
    expect(qualifyMappingEntry({ from: "no_such_entity", level: "field", referencePinned: true })).toEqual({
      qualified: false,
      reason: "field-level-blocked",
    });
    expect(qualifyMappingEntry({ from: "companies, contacts", level: "field", referencePinned: true })).toEqual({
      qualified: false,
      reason: "grouped-source",
    });
  });
});

describe("FX-OP-10 lifecycle stability (§§1.5, 6a)", () => {
  it("deprecation changes entryDigest only; the §1.6 triple stays equal (recomputed)", () => {
    const normalized = normalizeOntologyProfile(OPENERP_PROFILE_V1);
    const recomputedContent = hashOntologyProfile(normalized);
    const recomputedPins = pinsDigestOf({ layers: [OPENERP_PIN] });
    const recomputedResult = resultDigestOf({
      effectiveDeclarations: stableForHash(normalized),
      effectiveRuleSet: [],
      severityPolicyDigest: null,
    });
    expect(recomputedContent).toBe(OPENERP_CONTENT_DIGEST);
    expect(recomputedPins).toBe(OPENERP_PINS_DIGEST);
    expect(recomputedResult).toBe(OPENERP_RESULT_DIGEST);
    const syntheticCorpus = { ref: "synthetic-corpus@1", digest: "c".repeat(64) };
    const publishedEntry = {
      synthetic: "test-only, not real catalog evidence",
      canonicalRef: "openerp@1",
      namespace: "openerp",
      owner: "openerp",
      profileShape: "engram-profile",
      artifactKind: "profile",
      profilePin: OPENERP_PIN,
      stack: [OPENERP_PIN],
      digests: {
        contentDigest: recomputedContent,
        pinsDigest: recomputedPins,
        resultEvidence: { evidenceState: "resolved", digest: recomputedResult },
      },
      provenance: { sourceRef: "synthetic", sourceRevision: "synthetic" },
      lineage: { parents: [], mappings: ["openerp-open-standards@1", "openerp-odoo@1", "openerp-sap@1"], migrations: [] },
      conflictPolicy: "synthetic",
      completeness: "complete",
      lifecycle: "published",
      corpusRef: syntheticCorpus,
      visibility: "public",
    };
    const deprecatedEntry = {
      ...publishedEntry,
      lifecycle: "deprecated",
      deprecatedReason: "superseded by openerp@2",
      deprecatedAt: "2026-10-28",
    };
    expect(entryDigestOf(publishedEntry as unknown as Record<string, unknown>)).not.toBe(
      entryDigestOf(deprecatedEntry as unknown as Record<string, unknown>),
    );
    expect(publishedEntry.digests.contentDigest).toBe(recomputedContent);
    expect(publishedEntry.digests.pinsDigest).toBe(recomputedPins);
    expect((publishedEntry.digests.resultEvidence as { digest: string }).digest).toBe(recomputedResult);
    expect(deprecatedEntry.digests.contentDigest).toBe(recomputedContent);
    expect(deprecatedEntry.digests.pinsDigest).toBe(recomputedPins);
    expect((deprecatedEntry.digests.resultEvidence as { digest: string }).digest).toBe(recomputedResult);
    expect(SUCCESSOR_V2_DIGESTS.contentDigest).not.toBe(OPENERP_CONTENT_DIGEST);
  });

  it("resolves pinned versions only and never falls back to latest", () => {
    const syntheticCatalogByPin = new Map([
      [`${OPENERP_PIN.id}@${OPENERP_PIN.version}`, OPENERP_PIN],
      [`${SUCCESSOR_V2_PIN.id}@${SUCCESSOR_V2_PIN.version}`, SUCCESSOR_V2_PIN],
    ]);
    const one = resolveOpenerpVersion("1");
    expect(one.resolved).toBe(true);
    if (one.resolved !== true) throw new Error("resolve");
    expect(one.pin).toEqual(OPENERP_PIN);
    expect(one.pin.contentDigest).toBe(OPENERP_CONTENT_DIGEST);
    expect(syntheticCatalogByPin.get(`${one.pin.id}@${one.pin.version}`)).toEqual(OPENERP_PIN);
    const two = resolveOpenerpVersion("2");
    expect(two.resolved).toBe(true);
    if (two.resolved !== true) throw new Error("resolve");
    expect(two.pin).toEqual(SUCCESSOR_V2_PIN);
    expect(syntheticCatalogByPin.get(`${two.pin.id}@${two.pin.version}`)).toEqual(SUCCESSOR_V2_PIN);
    const unknown = resolveOpenerpVersion("99");
    expect(unknown.resolved).toBe(false);
    if (unknown.resolved !== false) throw new Error("resolve");
    expect(unknown.code).toBe("incompatible_version");
    const empty = resolveOpenerpVersion("");
    expect(empty.resolved).toBe(false);
    if (empty.resolved !== false) throw new Error("resolve");
    expect(empty.code).toBe("incompatible_version");
  });
});

describe("FX-OP-11 optional-pattern isolation (§5)", () => {
  it("removing §5 changes no §1.6 digest and no §4 entry", () => {
    for (const bytes of [
      canonicalBytes({ contentDigest: OPENERP_CONTENT_DIGEST, id: "openerp", version: "1" }),
      canonicalBytes({ entries: [], mappingId: "openerp-open-standards", version: "1" }),
    ]) {
      expect(bytes.includes("outbox")).toBe(false);
      expect(bytes.includes("consumed_at")).toBe(false);
    }
    expect(ACCOUNTING_BALANCE.enforcement).toBe("application");
    expect(TENANCY.scopeUnit).toBe("organization_id");
  });
});

describe("§3.2(b) tenant-carrying declarations (OQ-OP-11)", () => {
  it("records database tenant-carrying for exactly the three named FKs", () => {
    expect(TENANT_CARRIED_DATABASE).toEqual([
      {
        constraint: "bank_transactions_account_provider_fk",
        columns: "(organization_id, bank_account_id, provider)",
        references: "bank_accounts (organization_id, id, provider)",
      },
      {
        constraint: "reconciliation_links_transaction_fk",
        columns: "(organization_id, bank_transaction_id)",
        references: "bank_transactions (organization_id, id)",
      },
      {
        constraint: "reconciliation_links_payment_fk",
        columns: "(organization_id, candidate_id)",
        references: "payments (organization_id, id)",
      },
    ]);
    expect(NOT_TENANT_CARRIED_RELATIONS.length).toBe(8);
    for (const key of NOT_TENANT_CARRIED_RELATIONS) expect(tenantCarriedOf(key)).toBe("not-tenant-carried");
    expect(tenantCarriedOf("invoices.company_id")).toBe("unverified");
    expect(tenantCarriedOf("invoices.organization_id")).toBe("unverified");
  });
});

describe("acceptance fixture list (§10)", () => {
  it("covers FX-OP-01…FX-OP-12 with 03/04 not-covered and the rest decided", () => {
    const fixtures = [
      "FX-OP-01",
      "FX-OP-02",
      "FX-OP-03",
      "FX-OP-04",
      "FX-OP-05",
      "FX-OP-06",
      "FX-OP-07",
      "FX-OP-08",
      "FX-OP-09",
      "FX-OP-10",
      "FX-OP-11",
      "FX-OP-12",
    ] as const;
    expect(fixtures).toHaveLength(12);
    expect(OPENERP_FIXTURE_COVERAGE["FX-OP-03"]).toEqual({ status: "not-covered", gap: "GAP-OP-03" });
    expect(OPENERP_FIXTURE_COVERAGE["FX-OP-04"]).toEqual({ status: "not-covered", gap: "GAP-OP-04" });
    expect(OPENERP_FIXTURE_COVERAGE["FX-OP-10"]).toEqual({ status: "covered" });
    expect(OPENERP_G0_CONTRACT_GAPS.filter((g) => g.owner === "engram").length).toBe(2);
    expect(compareExportSemantics(ont, { ...ont, producedAt: "2026-10-28" })).toBe(true);
    expect(OPENERP_CONTENT_DIGEST.length).toBe(64);
    expect(violatesTenantScopedUniqueness({ organization_id: "org-a", key: "k" }, { organization_id: "org-a", key: "k" })).toBe(true);
    expect(checkJournalSourceType("manual")).toBe(true);
    expect(checkAmountShape({ amountMinor: 1, currency: "CAD", scale: 2 })).toBe(true);
    expect(qualifyMappingEntry({ from: "invoices.company_id", level: "type", referencePinned: true }).qualified).toBe(false);
    expect(SUCCESSOR_V2_DIGESTS.contentDigest.length).toBe(64);
    expect(resolveOpenerpVersion("99").resolved).toBe(false);
    expect(ACCOUNTING_BALANCE.enforcement).toBe("application");
    expect(OPENERP_COVERAGE_TYPES.length).toBe(19);
  });
});
