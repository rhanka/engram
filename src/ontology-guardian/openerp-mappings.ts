// OpenERP mapping artifacts (§4, three columns, versioned and digested).
// Each artifact is a closed G0 §3.3 envelope with entries [] at version 1:
// no row meets the §4.1 entry rule from the pinned sources, so every
// coverage row stays unverified with its owner. No identifier is invented.
// P-MAPPING digests recompute through src/ontology-guardian (never copied).
import { mappingDigestOf } from "./digests.js";
import { OPENERP_NODE_TYPE_IDS } from "./openerp-profile.js";
import type { Digest, MappingFile, Pin } from "./types.js";

export const OPENERP_COVERAGE_TYPES: readonly string[] = [
  "opportunities",
  "quote_handoffs",
  "projects",
  "time_entries",
  "invoice_proposals",
  "invoice_proposal_lines",
  "invoices",
  "invoice_lines",
  "payments",
  "journal_entries",
  "journal_entry_lines",
  "bank_transactions",
  "reconciliation_links",
  "accounts",
  "tax_categories",
  "tax_rate_versions",
  "fx_rate_snapshots",
  "companies",
  "contacts",
];

export interface OpenerpCoverageRow {
  readonly type: string;
  readonly reference: string;
  readonly status: "unverified";
  readonly owner: string;
}

function rows(
  refs: Record<string, string>,
  fallback: string,
  owner: (type: string) => string,
): OpenerpCoverageRow[] {
  return OPENERP_COVERAGE_TYPES.map((type) => ({
    type,
    reference: refs[type] ?? fallback,
    status: "unverified",
    owner: owner(type),
  }));
}

/** §4.2 register: column (a), normative, empty at version 1. */
export const OPEN_STANDARDS_REGISTER: readonly OpenerpCoverageRow[] = rows(
  {
    opportunities: "OAGIS inter-ERP exchange — exact revision and element to pin",
    quote_handoffs: "OAGIS inter-ERP exchange — exact revision and element to pin",
    projects: "OAGIS inter-ERP exchange — exact revision and element to pin",
    time_entries: "OAGIS inter-ERP exchange — exact revision and element to pin",
    invoice_proposals: "UBL 2.x / Peppol BIS; OAGIS inter-ERP exchange — exact revision and element to pin",
    invoice_proposal_lines: "UBL 2.x / Peppol BIS; OAGIS inter-ERP exchange — exact revision and element to pin",
    invoices: "UBL 2.x / Peppol BIS — exact revision and element to pin",
    invoice_lines: "UBL 2.x / Peppol BIS — exact revision and element to pin",
    payments: "ISO 20022 payments — exact message revision and element to pin",
    journal_entries: "SAF-T accounting export; OAGIS inter-ERP exchange — exact revision and element to pin",
    journal_entry_lines: "SAF-T accounting export; OAGIS inter-ERP exchange — exact revision and element to pin",
    bank_transactions: "ISO 20022 bank — exact message revision and element to pin",
    reconciliation_links: "No standard family asserted in the pinned sources — public reference to establish and pin",
    accounts: "SAF-T accounting export — exact revision and element to pin",
    tax_categories: "SAF-T accounting export; UBL 2.x (invoice use) — exact revision and element to pin",
    tax_rate_versions: "SAF-T accounting export — exact revision and element to pin",
    fx_rate_snapshots: "ISO 20022 bank; SAF-T accounting export — exact revision and element to pin",
    companies: "UBL 2.x (invoice use); OAGIS inter-ERP exchange — exact revision and element to pin",
    contacts: "UBL 2.x (invoice use); OAGIS inter-ERP exchange — exact revision and element to pin",
  },
  "OAGIS inter-ERP exchange — exact revision and element to pin",
  (type) => (type === "reconciliation_links" ? "OQ-OP-09" : "OQ-OP-02"),
);

/** §4.3 register: column (b), non-normative, empty at version 1. */
export const ODOO_REGISTER: readonly OpenerpCoverageRow[] = rows(
  {
    invoices: "Candidate account.move named by the owner decision / [RET] §4 — Odoo public API documentation to pin",
    invoice_lines: "Candidate account.move.line named by the owner decision / [RET] §4 — Odoo public API documentation to pin",
    payments: "Candidate account.payment named by the owner decision / [RET] §4 — Odoo public API documentation to pin",
    companies: "Candidate res.partner named by the owner decision / [RET] §4 — Odoo public API documentation to pin",
    contacts: "Candidate res.partner named by the owner decision / [RET] §4 — Odoo public API documentation to pin",
  },
  "Odoo public API documentation — exact object or field to establish and pin",
  () => "OQ-OP-05",
);

/** §4.4 register: column (c), non-normative, empty at version 1. */
export const SAP_REGISTER: readonly OpenerpCoverageRow[] = rows(
  {},
  "SAP published OData metadata — exact entity set or property to establish and pin",
  () => "OQ-OP-06",
);

function artifact(mappingId: string, contentDigest: Digest): MappingFile {
  return { mappingId, version: "1", contentDigest, entries: [] };
}

/** §4.2 complete artifact (P-MAPPING over empty entries). */
export const MAPPING_OPEN_STANDARDS: MappingFile = artifact(
  "openerp-open-standards",
  "0916d8fc11ece323cfaecf2e58d1dbbb483ecbb46fdb645ad7f212172ae02de3",
);
/** §4.3 complete artifact (P-MAPPING over empty entries). */
export const MAPPING_ODOO: MappingFile = artifact(
  "openerp-odoo",
  "b4eea21d5984a6b968b3d0cde2c21d482615b35ab416eb74e4d2997a7df283e7",
);
/** §4.4 complete artifact (P-MAPPING over empty entries). */
export const MAPPING_SAP: MappingFile = artifact(
  "openerp-sap",
  "48e2cd9eb8ab05d309ea9713430bc65e18f8d2898d293bfab3299cfdfcbcc5fe",
);

export const PIN_OPEN_STANDARDS: Pin = {
  id: "openerp-open-standards",
  version: "1",
  contentDigest: MAPPING_OPEN_STANDARDS.contentDigest,
};
export const PIN_ODOO: Pin = {
  id: "openerp-odoo",
  version: "1",
  contentDigest: MAPPING_ODOO.contentDigest,
};
export const PIN_SAP: Pin = {
  id: "openerp-sap",
  version: "1",
  contentDigest: MAPPING_SAP.contentDigest,
};

export const OPENERP_MAPPING_IDS = [
  "openerp-open-standards",
  "openerp-odoo",
  "openerp-sap",
] as const;

/** P-MAPPING recomputation for any of the three artifacts (own contentDigest excluded). */
export function recomputeMappingDigest(artifact: MappingFile): Digest {
  return mappingDigestOf({ mappingId: artifact.mappingId, version: artifact.version, entries: [...artifact.entries] });
}

/**
 * Entry qualification at version 1 (FX-OP-08): a correspondence enters
 * entries only from a pinned public reference naming the exact revision and
 * element; a grouped source never enters; a field-level (column-to-element)
 * entry never enters while OQ-OP-15 is open, even once sourced.
 */
export type MappingQualification =
  | { readonly qualified: true }
  | { readonly qualified: false; readonly reason: "grouped-source" | "field-level-blocked" | "reference-unpinned" | "unknown-source" };

/**
 * Native entity identifiers for type-arm resolution (§4.2 entry rule):
 * the 67 N2 keys. A type entry names exactly one of these; anything else
 * (column `entity.field`, grouped or unknown identifier) never enters,
 * independently of the supplied level or pin state.
 */
const NATIVE_ENTITY_IDS: readonly string[] = OPENERP_NODE_TYPE_IDS;

export function qualifyMappingEntry(candidate: {
  readonly from: string;
  readonly level: "type" | "field";
  readonly referencePinned: boolean;
}): MappingQualification {
  if (candidate.from.includes(",")) return { qualified: false, reason: "grouped-source" };
  if (candidate.from.includes(".")) return { qualified: false, reason: "field-level-blocked" };
  if (candidate.level === "field") return { qualified: false, reason: "field-level-blocked" };
  if (!(NATIVE_ENTITY_IDS as readonly string[]).includes(candidate.from)) {
    return { qualified: false, reason: "unknown-source" };
  }
  if (!candidate.referencePinned) return { qualified: false, reason: "reference-unpinned" };
  return { qualified: true };
}

/** Field-level entries stay blocked by the G0 contract gap OQ-OP-15 (owner: engram). */
export const FIELD_LEVEL_BLOCKED_BY = "OQ-OP-15" as const;
