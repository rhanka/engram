// OpenERP spec vectors (SPEC-openerp-ontology-FROZEN-761beb41, §§1.6/2.9/4/6b).
// Spec digests recompute through src/ontology-guardian and must match the
// spec byte for byte; expected values are never adjusted to fit code.
import { describe, expect, it } from "vitest";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashOntologyProfile,
  normalizeOntologyProfile,
  validateOntologyProfile,
} from "../src/ontology-profile.js";
import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import {
  mappingDigestOf,
  pinsDigestOf,
  resultDigestOf,
  stableForHash,
} from "../src/ontology-guardian/digests.js";
import {
  OPENERP_CONTENT_DIGEST,
  OPENERP_PIN,
  OPENERP_PINS_DIGEST,
  OPENERP_PROFILE_V1,
  OPENERP_RELATION_ENDPOINTS,
  OPENERP_RESULT_DIGEST,
  auditOpenerpProfileFields,
  buildOpenerpProfileV1,
  openerpPinsDigestOf,
  openerpResultDigestOf,
} from "../src/ontology-guardian/openerp-profile.js";
import {
  EXPECTED_COLUMN_CHECKS,
  EXPECTED_COLUMN_ROWS,
  EXPECTED_ENUM_COLUMNS,
  EXPECTED_PSEUDO_COLUMNS,
  EXPECTED_TABLE_INVARIANTS,
  columnChecks,
  columnRows,
  entityIndex,
  enumColumns,
  headerCounts,
  pseudoColumns,
  relationRows,
  tableInvariants,
} from "../src/ontology-guardian/openerp-governed.js";
import {
  DATABASE_IMMUTABLE_ENTITIES,
  IMMUTABILITY_MECHANISMS,
  LINE_SOURCE_TARGETS,
  OUTBOX_ARM_GATED,
} from "../src/ontology-guardian/openerp-constraints.js";
import {
  MAPPING_ODOO,
  MAPPING_OPEN_STANDARDS,
  MAPPING_SAP,
  ODOO_REGISTER,
  OPEN_STANDARDS_REGISTER,
  OPENERP_COVERAGE_TYPES,
  SAP_REGISTER,
  recomputeMappingDigest,
} from "../src/ontology-guardian/openerp-mappings.js";
import {
  SUCCESSOR_V2_DIGESTS,
  VERSION_ONLY_V2_DIGESTS,
  buildOpenerpSuccessorV2,
} from "../src/ontology-guardian/openerp-registry.js";

const here = process.env.OPENERP_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "openerp");
const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const ont = JSON.parse(readFileSync(join(fixtureDir, "openerp-ontology.json"), "utf8"));

describe("byte-pinned source fixtures (§ Source pins)", () => {
  it("verifies the four sha256 pins", () => {
    expect(sha256File(join(fixtureDir, "openerp-ontology.json"))).toBe(
      "dcee5c9da1fdca908e56a049a4af80e289a61beeda14ca9b155993152f2b1213",
    );
    expect(sha256File(join(fixtureDir, "RETROCESSION-openerp-ontology.md"))).toBe(
      "c655288b478b1d18acdfb1a9ab35f632c948f37745225d84adead2f93df6ab45",
    );
    expect(sha256File(join(fixtureDir, "export-ontology.mjs"))).toBe(
      "5ddf004260695ef53067083bdf253eb4e8dbaf71cba2c299f1e8dcccdcea9f4d",
    );
    expect(sha256File(join(fixtureDir, "SHA256SUMS"))).toBe(
      "f74f34b829eb25ee248f21db76ed85a2a4c117e13594dcb845fd5303b65b032a",
    );
  });
});

describe("§2.1 extraction header and counts", () => {
  it("transcribes counts 43 / 67 / 62 / 60 / 146 / 57 / 27 / 0", () => {
    expect(headerCounts(ont)).toEqual({
      migrations: 43,
      entities: 67,
      tenantScoped: 62,
      forcedRls: 60,
      relations: 146,
      enumeratedFields: 57,
      tableInvariants: 27,
      parserGaps: 0,
    });
  });

  it("indexes 67 entities with tenant and RLS flags", () => {
    const index = entityIndex(ont);
    expect(index.length).toBe(67);
    const byId = new Map(index.map((r) => [r.entity, r]));
    expect(byId.get("organizations")).toMatchObject({ tenant: false, forcedRls: true, cols: 12, invariants: 0 });
    expect(byId.get("translation_keys")).toMatchObject({ tenant: true, forcedRls: false });
    expect(byId.get("jobs")).toMatchObject({ tenant: true, forcedRls: false });
    expect(byId.get("openerp_sessions")).toMatchObject({ tenant: true, forcedRls: false });
    expect(byId.get("user_identities")).toMatchObject({ tenant: false, forcedRls: false });
    expect(index.filter((r) => r.tenant).length).toBe(62);
    expect(index.filter((r) => r.forcedRls).length).toBe(60);
  });
});

describe("§§2.3–2.7 governed preservation counts", () => {
  it("holds 776 column rows including 3 as-extracted pseudo-columns", () => {
    expect(columnRows(ont).length).toBe(EXPECTED_COLUMN_ROWS);
    const pseudo = pseudoColumns(ont);
    expect(pseudo.length).toBe(EXPECTED_PSEUDO_COLUMNS);
    expect(pseudo.map((c) => `${c.entity}.${c.type}`).sort()).toEqual([
      "bank_transactions.bank_transactions_account_provider_fk",
      "reconciliation_links.reconciliation_links_payment_fk",
      "reconciliation_links.reconciliation_links_transaction_fk",
    ]);
  });

  it("holds 57 enumerated columns, 11 column CHECKs, 27 table invariants", () => {
    expect(enumColumns(ont).length).toBe(EXPECTED_ENUM_COLUMNS);
    expect(columnChecks(ont).length).toBe(EXPECTED_COLUMN_CHECKS);
    expect(tableInvariants(ont).length).toBe(EXPECTED_TABLE_INVARIANTS);
  });

  it("transcribes CHECK and invariant clauses verbatim", () => {
    const checks = new Map(columnChecks(ont).map((c) => [`${c.entity}.${c.field}`, c]));
    expect(checks.get("reconciliation_links.candidate_kind")).toMatchObject({
      check: "candidate_kind = 'payment'",
      notNull: true,
    });
    expect(checks.get("companies.language")).toMatchObject({ notNull: false });
    const invariants = tableInvariants(ont);
    expect(invariants.filter((t) => t.kind === "trigger").length).toBe(3);
    expect(
      invariants.find((t) => t.entity === "bank_transactions" && t.kind === "check:jsonbShape")!.clause,
    ).toContain("amountMinor");
    expect(
      invariants.find((t) => t.entity === "bank_transactions" && t.kind === "trigger")!.clause,
    ).toContain("protect_imported_bank_transaction()");
  });

  it("transcribes 146 typed relations with required flags and delete rules", () => {
    const rows = relationRows(ont);
    expect(rows.length).toBe(146);
    const quote = rows.find((r) => r.from === "quote_handoffs" && r.field === "opportunity_id")!;
    expect(quote).toMatchObject({ to: "opportunities", required: true, onDelete: "no action (default)" });
    const cascade = rows.filter((r) => r.onDelete === "cascade");
    expect(cascade.length).toBe(5);
  });
});

describe("§2.9 native profile N1–N4", () => {
  it("builds the pinned N1 value deterministically from [ONT]", () => {
    const built = buildOpenerpProfileV1(ont);
    expect(canonicalBytes(built)).toBe(canonicalBytes(OPENERP_PROFILE_V1));
    expect(Object.keys((built.node_types as object) ?? {}).length).toBe(67);
    expect(Object.keys((built.relation_types as object) ?? {}).length).toBe(146);
  });

  it("states 67 empty node types and 146 endpoint-only relation types", () => {
    const nodes = OPENERP_PROFILE_V1.node_types as Record<string, unknown>;
    expect(Object.keys(nodes).length).toBe(67);
    for (const value of Object.values(nodes)) expect(value).toEqual({});
    const relations = OPENERP_PROFILE_V1.relation_types as Record<string, { source: string; target: string }>;
    expect(Object.keys(relations).length).toBe(146);
    for (const [key, value] of Object.entries(relations)) {
      expect(Object.keys(value).sort()).toEqual(["source", "target"]);
      const endpoint = OPENERP_RELATION_ENDPOINTS.find((r) => r.key === key)!;
      expect(value).toEqual({ source: endpoint.from, target: endpoint.to });
    }
  });

  it("passes validateOntologyProfile with no error (FX-OP-02)", () => {
    expect(validateOntologyProfile(OPENERP_PROFILE_V1)).toEqual([]);
    const normalized = normalizeOntologyProfile(OPENERP_PROFILE_V1);
    expect(Object.keys(normalized.node_types).length).toBe(67);
    expect(Object.keys(normalized.relation_types).length).toBe(146);
    expect(normalized.profile_hash).toBe(OPENERP_CONTENT_DIGEST);
    expect(auditOpenerpProfileFields(OPENERP_PROFILE_V1 as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("reports non-native keys on a widened value (N4 audit)", () => {
    const widened = structuredClone(OPENERP_PROFILE_V1) as unknown as Record<string, unknown>;
    (widened as Record<string, unknown>)["scopeUnit"] = "organization_id";
    ((widened["relation_types"] as Record<string, Record<string, unknown>>)["invoices.company_id"] as Record<string, unknown>)["cardinality"] = "many";
    expect(auditOpenerpProfileFields(widened)).toEqual([
      "top:scopeUnit",
      "relation:invoices.company_id",
    ]);
  });

  it("transcribes column references with delete rules (§2.3)", () => {
    const org = columnRows(ont).find((c) => c.entity === "users" && c.name === "organization_id")!;
    expect(org.references).toEqual({ entity: "organizations", field: "id" });
    expect(org.onDelete).toBe("no action (default)");
    expect(org.notNull).toBe(true);
  });

  it("claims native conformance only: a fabricated non-native field still validates", () => {
    const mutated = structuredClone(OPENERP_PROFILE_V1) as unknown as {
      node_types: Record<string, Record<string, unknown>>;
    };
    mutated.node_types["invoices"] = {
      inventedAttribute: "amount",
      inventedReference: "nonexistent",
      inventedConstraint: "unique",
    };
    expect(validateOntologyProfile(mutated as never)).toEqual([]);
  });
});

describe("§1.6 digest vectors, exact bytes", () => {
  it("reproduces contentDigest 8c00c51d… via hashOntologyProfile", () => {
    const normalized = normalizeOntologyProfile(OPENERP_PROFILE_V1);
    expect(hashOntologyProfile(normalized)).toBe(OPENERP_CONTENT_DIGEST);
    expect(OPENERP_CONTENT_DIGEST).toBe(
      "8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65",
    );
  });

  it("reproduces the P-PINS preimage bytes and pinsDigest cda06dc8…", () => {
    expect(
      canonicalBytes({
        deltaDigest: null,
        layers: [{ contentDigest: OPENERP_CONTENT_DIGEST, id: "openerp", version: "1" }],
        mappingDigest: null,
        ruleSheets: [],
      }),
    ).toBe(
      `{"deltaDigest":null,"layers":[{"contentDigest":"${OPENERP_CONTENT_DIGEST}","id":"openerp","version":"1"}],"mappingDigest":null,"ruleSheets":[]}`,
    );
    expect(pinsDigestOf({ layers: [OPENERP_PIN] })).toBe(OPENERP_PINS_DIGEST);
    expect(openerpPinsDigestOf()).toBe("cda06dc8e8895fa8e940b11092f7b720c08053caf7871ad63818b879a3914e6a");
  });

  it("reproduces resultDigest 8e71a676… via P-RESULT engram scope", () => {
    const normalized = normalizeOntologyProfile(OPENERP_PROFILE_V1);
    expect(
      resultDigestOf({ effectiveDeclarations: stableForHash(normalized), effectiveRuleSet: [], severityPolicyDigest: null }),
    ).toBe(OPENERP_RESULT_DIGEST);
    expect(openerpResultDigestOf(normalized)).toBe(
      "8e71a6769cfd313bb44a6943369e5aa4de513802607ea8a4f13ae8b3f98a910f",
    );
  });
});

describe("§4 mapping artifact vectors, exact bytes", () => {
  const cases = [
    { artifact: MAPPING_OPEN_STANDARDS, digest: "0916d8fc11ece323cfaecf2e58d1dbbb483ecbb46fdb645ad7f212172ae02de3" },
    { artifact: MAPPING_ODOO, digest: "b4eea21d5984a6b968b3d0cde2c21d482615b35ab416eb74e4d2997a7df283e7" },
    { artifact: MAPPING_SAP, digest: "48e2cd9eb8ab05d309ea9713430bc65e18f8d2898d293bfab3299cfdfcbcc5fe" },
  ] as const;

  it("asserts empty entries and recomputes every P-MAPPING digest", () => {
    for (const { artifact, digest } of cases) {
      expect(artifact.version).toBe("1");
      expect(artifact.entries).toEqual([]);
      expect(recomputeMappingDigest(artifact)).toBe(digest);
      expect(artifact.contentDigest).toBe(digest);
      expect(
        mappingDigestOf({ mappingId: artifact.mappingId, version: "1", entries: [] }),
      ).toBe(digest);
      expect(canonicalBytes({ entries: [], mappingId: artifact.mappingId, version: "1" })).toBe(
        `{"entries":[],"mappingId":${JSON.stringify(artifact.mappingId)},"version":"1"}`,
      );
    }
  });

  it("lists 19 individual unverified rows per register, never grouped", () => {
    expect(OPENERP_COVERAGE_TYPES.length).toBe(19);
    for (const register of [OPEN_STANDARDS_REGISTER, ODOO_REGISTER, SAP_REGISTER]) {
      expect(register.length).toBe(19);
      expect(register.map((r) => r.type).sort()).toEqual([...OPENERP_COVERAGE_TYPES].sort());
      for (const row of register) {
        expect(row.status).toBe("unverified");
        expect(row.type.includes(",")).toBe(false);
      }
    }
    expect(OPEN_STANDARDS_REGISTER.find((r) => r.type === "reconciliation_links")!.owner).toBe("OQ-OP-09");
    expect(OPEN_STANDARDS_REGISTER.filter((r) => r.type !== "reconciliation_links").every((r) => r.owner === "OQ-OP-02")).toBe(true);
    expect(ODOO_REGISTER.every((r) => r.owner === "OQ-OP-05")).toBe(true);
    expect(SAP_REGISTER.every((r) => r.owner === "OQ-OP-06")).toBe(true);
  });
});

describe("§6(b) FX-OP-09 digest vectors", () => {
  it("tier-N successor at version 2 reproduces the three changed digests", () => {
    const successor = buildOpenerpSuccessorV2();
    expect(validateOntologyProfile(successor)).toEqual([]);
    expect(Object.keys(successor.relation_types as object).length).toBe(145);
    expect("quote_handoffs.opportunity_id" in (successor.relation_types as object)).toBe(false);
    const normalized = normalizeOntologyProfile(successor);
    expect(normalized.profile_hash).toBe(SUCCESSOR_V2_DIGESTS.contentDigest);
    expect(pinsDigestOf({ layers: [{ id: "openerp", version: "2", contentDigest: normalized.profile_hash }] })).toBe(
      SUCCESSOR_V2_DIGESTS.pinsDigest,
    );
    expect(
      resultDigestOf({ effectiveDeclarations: stableForHash(normalized), effectiveRuleSet: [], severityPolicyDigest: null }),
    ).toBe(SUCCESSOR_V2_DIGESTS.resultDigest);
  });

  it("version-only control at 2 reproduces its three changed digests", () => {
    const control = { ...OPENERP_PROFILE_V1, version: "2" } as typeof OPENERP_PROFILE_V1;
    const normalized = normalizeOntologyProfile(control);
    expect(normalized.profile_hash).toBe(VERSION_ONLY_V2_DIGESTS.contentDigest);
    expect(pinsDigestOf({ layers: [{ id: "openerp", version: "2", contentDigest: normalized.profile_hash }] })).toBe(
      VERSION_ONLY_V2_DIGESTS.pinsDigest,
    );
    expect(
      resultDigestOf({ effectiveDeclarations: stableForHash(normalized), effectiveRuleSet: [], severityPolicyDigest: null }),
    ).toBe(VERSION_ONLY_V2_DIGESTS.resultDigest);
  });

  it("uses timing-safe digest comparison", () => {
    expect(
      timingSafeEqual(Buffer.from(OPENERP_CONTENT_DIGEST, "utf8"), Buffer.from(OPENERP_CONTENT_DIGEST, "utf8")),
    ).toBe(true);
    expect(sha256Hex("openerp@1") === OPENERP_CONTENT_DIGEST).toBe(false);
  });
});

describe("FX-OP-01(a) full ordered tier-G equality against the byte-pinned source", () => {
  it("reproduces all 776 column rows in order with every optional field", () => {
    const expected: unknown[] = [];
    for (const e of ont.entities as {
      entity: string;
      columns: {
        name: string;
        type: string;
        notNull: boolean;
        references?: { entity: string; field: string };
        onDelete?: string;
        enum?: string[];
        check?: string;
        addedBy?: string;
      }[];
    }[]) {
      for (const c of e.columns) {
        const row: Record<string, unknown> = { entity: e.entity, name: c.name, type: c.type, notNull: c.notNull };
        if (c.references !== undefined) row["references"] = { entity: c.references.entity, field: c.references.field };
        if (c.onDelete !== undefined) row["onDelete"] = c.onDelete;
        if (c.enum !== undefined) row["enum"] = [...c.enum];
        if (c.check !== undefined) row["check"] = c.check;
        if (c.addedBy !== undefined) row["addedBy"] = c.addedBy;
        expected.push(row);
      }
    }
    const actual = columnRows(ont);
    expect(actual.length).toBe(776);
    expect(actual).toEqual(expected);
    expect(canonicalBytes(actual)).toBe(canonicalBytes(expected));
  });

  it("reproduces all 146 relations in order with required flags and delete rules", () => {
    const expected = (ont.relations as { from: string; field: string; to: string; required: boolean; onDelete: string }[]).map(
      (r) => ({ from: r.from, field: r.field, to: r.to, required: r.required, onDelete: r.onDelete }),
    );
    const actual = relationRows(ont);
    expect(actual.length).toBe(146);
    expect(actual).toEqual(expected);
    expect(canonicalBytes(actual)).toBe(canonicalBytes(expected));
  });

  it("reproduces all 57 enum columns, 11 CHECKs and 27 invariants in order", () => {
    const expectedEnums: unknown[] = [];
    const expectedChecks: unknown[] = [];
    for (const e of ont.entities as {
      entity: string;
      columns: { name: string; type: string; notNull: boolean; enum?: string[]; check?: string }[];
    }[]) {
      for (const c of e.columns) {
        if (c.enum !== undefined) expectedEnums.push({ entity: e.entity, field: c.name, values: [...c.enum] });
        if (c.check !== undefined) expectedChecks.push({ entity: e.entity, field: c.name, check: c.check, notNull: c.notNull });
      }
    }
    const expectedInvariants: unknown[] = [];
    for (const e of ont.entities as {
      entity: string;
      tableInvariants: { kind: string; clause: string; addedBy?: string }[];
    }[]) {
      for (const t of e.tableInvariants) {
        const row: Record<string, unknown> = { entity: e.entity, kind: t.kind, clause: t.clause };
        if (t.addedBy !== undefined) row["addedBy"] = t.addedBy;
        expectedInvariants.push(row);
      }
    }
    expect(enumColumns(ont)).toEqual(expectedEnums);
    expect(canonicalBytes(enumColumns(ont))).toBe(canonicalBytes(expectedEnums));
    expect(columnChecks(ont)).toEqual(expectedChecks);
    expect(canonicalBytes(columnChecks(ont))).toBe(canonicalBytes(expectedChecks));
    expect(tableInvariants(ont)).toEqual(expectedInvariants);
    expect(canonicalBytes(tableInvariants(ont))).toBe(canonicalBytes(expectedInvariants));
  });
});

describe("addendum preservation (§3.2c/d, §5, OQ-OP-10/11/12)", () => {
  it("holds the five target/writer rows byte for byte", () => {
    expect(LINE_SOURCE_TARGETS).toEqual([
      { column: "invoice_lines.source_type", kind: "manual", target: "null source_id", writer: "billing/invoice-service.ts:145" },
      { column: "invoice_lines.source_type", kind: "invoice_proposal_line", target: "invoice_proposal_lines.id", writer: "billing/invoice-service.ts:228" },
      { column: "invoice_lines.source_type", kind: "quote_handoff", target: "quote_handoffs.id", writer: "billing/invoice-service.ts:315" },
      { column: "invoice_lines.source_type", kind: "recurring_schedule", target: "recurring_billing_schedules.id", writer: "billing/recurring-schedule-service.ts:302 and :415" },
      { column: "invoice_proposal_lines.source_type", kind: "time_entry", target: "time_entries.id", writer: "project/invoice-proposal-service.ts:167" },
    ]);
  });

  it("holds the complete outbox gate and standing arms", () => {
    expect(OUTBOX_ARM_GATED).toEqual({
      status: "unverified",
      owner: "openerp",
      question: "OQ-OP-12",
      gate: "drop consumed_at or split emission from consumption",
      standingArms: ["bank_transactions", "audit_events"],
    });
    expect(canonicalBytes(OUTBOX_ARM_GATED)).toBe(
      canonicalBytes({
        status: "unverified",
        owner: "openerp",
        question: "OQ-OP-12",
        gate: "drop consumed_at or split emission from consumption",
        standingArms: ["bank_transactions", "audit_events"],
      }),
    );
  });

  it("checks declared immutability mechanisms against their source clauses", () => {
    expect(DATABASE_IMMUTABLE_ENTITIES).toEqual(["bank_transactions", "audit_events"]);
    const invariants = tableInvariants(ont);
    const bankTrigger = invariants.find((t) => t.entity === "bank_transactions" && t.kind === "trigger");
    expect(bankTrigger).toBeDefined();
    expect(bankTrigger!.clause).toContain("bank_transactions_immutable_evidence");
    expect(bankTrigger!.clause).toContain("protect_imported_bank_transaction()");
    expect(bankTrigger!.addedBy).toBe("0041_banking_reconciliation.sql");
    expect(IMMUTABILITY_MECHANISMS["bank_transactions"]!.join(" ")).toContain("bank_transactions_immutable_evidence");
    expect(IMMUTABILITY_MECHANISMS["bank_transactions"]!.join(" ")).toContain("protect_imported_bank_transaction()");
    expect(IMMUTABILITY_MECHANISMS["bank_transactions"]!.join(" ")).toContain("0041_banking_reconciliation.sql");
    const auditTriggers = invariants.filter((t) => t.entity === "audit_events" && t.kind === "trigger");
    expect(auditTriggers.length).toBeGreaterThan(0);
    expect(auditTriggers.some((t) => t.clause.includes("audit_events_block_mutations"))).toBe(true);
    expect(IMMUTABILITY_MECHANISMS["audit_events"]!.join(" ")).toContain("audit_events_block_mutations()");
  });
});
