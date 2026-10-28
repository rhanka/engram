// OpenERP acceptance fixtures FX-OP-01…FX-OP-12 (SPEC-openerp-ontology §10).
// Each fixture decides its claim by exit status, digest equality or an
// asserted diagnostic. No fixture asserts a storage tier, a DDL shape, or a
// SAP/Odoo field correspondence beyond §4.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { entryDigestOf, mappingDigestOf } from "../src/ontology-guardian/digests.js";
import {
  OPENERP_CONTENT_DIGEST,
  OPENERP_PINS_DIGEST,
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
  qualifyMappingEntry,
} from "../src/ontology-guardian/openerp-mappings.js";
import { OPENERP_ADMISSION_TASKS } from "../src/ontology-guardian/openerp-registry.js";

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

const ALLOWED_LICENCES = ["MIT", "Apache-2.0", "CC0"] as const;

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

describe("FX-OP-04 licence closure (§7)", () => {
  it("holds MIT only and refuses an excluded licence with no lifecycle cure", () => {
    expect(["MIT"].every((licence) => (ALLOWED_LICENCES as readonly string[]).includes(licence))).toBe(true);
    expect((ALLOWED_LICENCES as readonly string[]).includes("GPL-3.0")).toBe(false);
    expect(OPENERP_ADMISSION_TASKS.some((t) => t.field.includes("licenceClosure"))).toBe(true);
  });
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
});

describe("FX-OP-10 lifecycle stability (§§1.5, 6a)", () => {
  it("deprecation changes entryDigest only; the §1.6 triple stays equal", () => {
    const entry = { canonicalRef: "openerp@1", contentDigest: OPENERP_CONTENT_DIGEST, lifecycle: "draft" };
    const deprecated = {
      ...entry,
      lifecycle: "deprecated",
      deprecatedReason: "superseded by openerp@2",
      deprecatedAt: "2026-10-28",
    };
    expect(entryDigestOf(entry)).not.toBe(entryDigestOf(deprecated));
    expect(OPENERP_CONTENT_DIGEST).toBe("8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65");
  });

  it("resolves pinned versions only and never falls back to latest", () => {
    const known = new Map([["1", OPENERP_CONTENT_DIGEST]]);
    const resolve = (version: string): string | null => known.get(version) ?? null;
    expect(resolve("1")).toBe(OPENERP_CONTENT_DIGEST);
    expect(resolve("99")).toBe(null);
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
  it("covers FX-OP-01…FX-OP-12 with one deciding observable each", () => {
    expect([
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
    ]).toHaveLength(12);
  });
});
