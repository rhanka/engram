// OpenERP G0 record and catalog binding (frozen SPEC-openerp-ontology §1).
// Governed data only: identity, digests and lineage from the exact §1.3–§1.6
// preimages. The §1.5 payload is incomplete by specification (OQ-OP-08,
// OQ-OP-13): corpusRef, receipts, consumers, compatibility, linkedTools and
// the closure/coverage digests are admission tasks, never invented here.
// The catalog binding below is the profile variant plus the static payload
// fields the spec instantiates; entryDigest is computed externally at
// admission and never self-embedded.
import type { Digest, OntologyRecord, Pin } from "./types.js";
import {
  OPENERP_CONTENT_DIGEST,
  OPENERP_PIN,
  OPENERP_PINS_DIGEST,
  OPENERP_RESULT_DIGEST,
  OPENERP_RELATION_ENDPOINTS,
} from "./openerp-profile.js";
import type { OntologyProfile } from "../types.js";

/** §1.3 exact record (G0 §1.4, closed). Draft: corpusRef absent. */
export const RECORD_OPENERP_V1: OntologyRecord = {
  namespace: "openerp",
  id: "openerp",
  version: "1",
  owner: "openerp",
  lifecycle: "draft",
  completeness: "complete",
  visibility: "public",
  profileShape: "engram-profile",
  artifactKind: "profile",
  profileRef: { canonicalRef: "openerp@1", contentDigest: OPENERP_CONTENT_DIGEST },
  digests: {
    contentDigest: OPENERP_CONTENT_DIGEST,
    pinsDigest: OPENERP_PINS_DIGEST,
    resultEvidence: { evidenceState: "resolved", digest: OPENERP_RESULT_DIGEST },
  },
  lineage: {
    parents: [],
    mappings: ["openerp-open-standards@1", "openerp-odoo@1", "openerp-sap@1"],
    migrations: [],
  },
  consumers: [],
};

/** §1.3 lineage reference strings (G0 public lineage form, not Pins). */
export const OPENERP_LINEAGE_MAPPINGS: readonly string[] = [
  "openerp-open-standards@1",
  "openerp-odoo@1",
  "openerp-sap@1",
] as const;

/** §1.5 catalog binding: the profile variant (relationMatrixRef absent, public entry). */
export const OPENERP_ARTIFACT_BINDING = {
  artifactKind: "profile",
  profilePin: OPENERP_PIN,
  stack: [OPENERP_PIN],
} as const;

/** §1.5 instantiated static payload fields (no value invented). */
export const OPENERP_CATALOG_STATIC = {
  canonicalRef: "openerp@1",
  namespace: "openerp",
  owner: "openerp",
  profileShape: "engram-profile",
  artifactKind: "profile",
  profilePin: OPENERP_PIN,
  stack: [OPENERP_PIN],
  digests: {
    contentDigest: OPENERP_CONTENT_DIGEST,
    pinsDigest: OPENERP_PINS_DIGEST,
    resultEvidence: { evidenceState: "resolved", digest: OPENERP_RESULT_DIGEST },
  },
  ruleSheets: [],
  lifecycle: "draft",
  provenance: {
    sourceRef: "OpenERP repository, snapshot source/ ([ONT], [RET], [EXP], [SUMS])",
    sourceRevision: "d06d5ece",
  },
  licenceLicences: ["MIT"],
  coverageDeclaredLimits:
    "Native profile: 67 entity types (node_types keys), 146 relation types (endpoints) from [ONT] dcee5c9d…; " +
    "G0 provenance outside the preimage: 776 column rows (773 real + 3 pseudo), 61 enumerated columns, " +
    "11 column CHECKs, 27 table invariants (§§2.3–2.7); no instance data, no SAP/Odoo field correspondence",
  lineage: {
    parents: [],
    mappings: ["openerp-open-standards@1", "openerp-odoo@1", "openerp-sap@1"],
    migrations: [],
  },
  conflictPolicy:
    "G0 §§2–4 mapping-required, never silent overwrite (SPEC-G0-guardian-contracts.md e6362445…)",
  completeness: "complete",
  migrations: [],
  visibility: "public",
} as const;

/** §1.5 admission tasks (unresolved, owned, blocking admission — no value asserted). */
export interface AdmissionTask {
  readonly field: string;
  readonly owner: string;
  readonly question: string;
}

export const OPENERP_ADMISSION_TASKS: readonly AdmissionTask[] = [
  { field: "corpusRef { ref, digest }", owner: "engram (catalog) + openerp (consumer targets)", question: "OQ-OP-08" },
  { field: "consumers", owner: "engram (catalog) + openerp (consumer targets)", question: "OQ-OP-08" },
  { field: "receipts (family-corpus arm for family EXT) + §5.5 gate", owner: "engram (catalog)", question: "OQ-OP-08" },
  { field: "compatibility { renderer, adapter } pinned references", owner: "engram", question: "OQ-OP-13" },
  { field: "linkedTools", owner: "engram", question: "OQ-OP-13" },
  { field: "licenceClosure.closureDigest recomputation", owner: "engram", question: "OQ-OP-13" },
  { field: "coverage.coverageDigest recomputation", owner: "engram", question: "OQ-OP-13" },
];

/** Byte-pinned fixture manifest (§ Source pins; corpus candidate for OQ-OP-08). */
export interface FixturePin {
  readonly path: string;
  readonly sha256: Digest;
}

export const OPENERP_SOURCE_FIXTURES: readonly FixturePin[] = [
  { path: "tests/fixtures/openerp/openerp-ontology.json", sha256: "dcee5c9da1fdca908e56a049a4af80e289a61beeda14ca9b155993152f2b1213" },
  { path: "tests/fixtures/openerp/RETROCESSION-openerp-ontology.md", sha256: "c655288b478b1d18acdfb1a9ab35f632c948f37745225d84adead2f93df6ab45" },
  { path: "tests/fixtures/openerp/export-ontology.mjs", sha256: "5ddf004260695ef53067083bdf253eb4e8dbaf71cba2c299f1e8dcccdcea9f4d" },
  { path: "tests/fixtures/openerp/SHA256SUMS", sha256: "f74f34b829eb25ee248f21db76ed85a2a4c117e13594dcb845fd5303b65b032a" },
];

/**
 * §6(b) FX-OP-09 tier-N successor fixture: removes references/onDelete from
 * the quote_handoffs.opportunity_id column and its matching relation (145
 * relations), assigns version 2. Isolated mutation of cloned values, not a
 * change to the pinned source.
 */
export function buildOpenerpSuccessorV2(): OntologyProfile {
  const node_types: Record<string, Record<string, never>> = {};
  for (const e of OPENERP_SUCCESSOR_NODE_IDS) node_types[e] = {};
  const relation_types: Record<string, { source: string; target: string }> = {};
  for (const r of OPENERP_RELATION_ENDPOINTS) {
    if (r.key === "quote_handoffs.opportunity_id") continue;
    relation_types[r.key] = { source: r.from, target: r.to };
  }
  return { id: "openerp", version: "2", default_language: "en", node_types: node_types as never, relation_types: relation_types as never };
}

const OPENERP_SUCCESSOR_NODE_IDS: readonly string[] = [
  "organizations",
  "tenant_settings",
  "users",
  "teams",
  "roles",
  "permission_grants",
  "audit_events",
  "file_objects",
  "comments",
  "notifications",
  "domain_events",
  "user_identities",
  "organization_members",
  "fx_rate_snapshots",
  "timeline_entries",
  "approval_requests",
  "idempotency_records",
  "translation_keys",
  "jobs",
  "passkey_credentials",
  "passkey_challenges",
  "agent_definitions",
  "agent_runs",
  "policy_decisions",
  "tool_calls",
  "supervision_requests",
  "companies",
  "contacts",
  "pipeline_stages",
  "opportunities",
  "leads",
  "projects",
  "project_tasks",
  "time_entries",
  "rates",
  "assignments",
  "invoice_proposals",
  "invoice_proposal_lines",
  "invoices",
  "invoice_lines",
  "payments",
  "tax_categories",
  "tax_rate_versions",
  "accounts",
  "journal_entries",
  "journal_entry_lines",
  "quote_handoffs",
  "recurring_billing_schedules",
  "saved_views",
  "report_definitions",
  "report_runs",
  "dashboards",
  "dashboard_widgets",
  "scheduled_deliveries",
  "delivery_runs",
  "workflow_definitions",
  "workflow_runs",
  "webhook_endpoints",
  "webhook_deliveries",
  "openerp_sessions",
  "oidc_state",
  "email_sends",
  "bank_accounts",
  "bank_transactions",
  "reconciliation_links",
  "auth_email_verifications",
  "auth_pending_tenant_selections",
];

/** §6(b) expected successor triple (Node-computed, never adjusted to fit code). */
export const SUCCESSOR_V2_DIGESTS = {
  contentDigest: "da41330ae7318fc723982e7a0e855376cef742a2431259d00b9ec0b8c3b81837",
  pinsDigest: "2dd66ac77bca68a8bc12b49b45b9aba2ec64cc3121b3e9f1b729357ffa496166",
  resultDigest: "df3e2bdcfe945e725cd83ae838c4fd89ba7eb515058cd6e7022a38f412db8a09",
} as const;

/** §6(b) version-only control triple ([ONT] unchanged, N1 version + Pin at 2). */
export const VERSION_ONLY_V2_DIGESTS = {
  contentDigest: "5b8137063525c84e2662ec1e350233298e9fab7d0615c428bf24728d911228e0",
  pinsDigest: "cb4732603161a4a1b9c834790f9ea313d780a25c96f73903d9a85bd6e317e256",
  resultDigest: "2513c3dcfc0de54b968d5f602b103cd1f7a682de13669f9d744e78e202123a96",
} as const;

export const SUCCESSOR_V2_PIN: Pin = {
  id: "openerp",
  version: "2",
  contentDigest: SUCCESSOR_V2_DIGESTS.contentDigest,
};

/** §7 licence closure allowlist (MIT throughout; closure within MIT/Apache-2.0/CC0 at admission). */
export const OPENERP_ALLOWED_LICENCES: readonly string[] = ["MIT", "Apache-2.0", "CC0"] as const;

/** Missing G0 contract operations for the OpenERP lot (owner: engram, separate decision). */
export interface OpenerpContractGap {
  readonly id: string;
  readonly missingOperation: string;
  readonly owner: "engram";
  readonly question: string;
}

export const OPENERP_G0_CONTRACT_GAPS: readonly OpenerpContractGap[] = [
  {
    id: "GAP-OP-03",
    missingOperation: "G0 record-closure validator for OntologyRecord (extra field refuses; corpusRef unresolved encoding refuses instead of omission)",
    owner: "engram",
    question: "G0 contract extension, separate decision",
  },
  {
    id: "GAP-OP-04",
    missingOperation: "G0 pack licence-closure recomputation with §5.5 excluded-licence gate for family EXT (no lifecycle cure)",
    owner: "engram",
    question: "G0 contract extension, separate decision",
  },
];

/** Fixture coverage for the §10 acceptance list: covered fixtures pass, not-covered stay open. */
export const OPENERP_FIXTURE_COVERAGE: Record<string, { readonly status: "covered" | "not-covered"; readonly gap?: string }> = {
  "FX-OP-01": { status: "covered" },
  "FX-OP-02": { status: "covered" },
  "FX-OP-03": { status: "not-covered", gap: "GAP-OP-03" },
  "FX-OP-04": { status: "not-covered", gap: "GAP-OP-04" },
  "FX-OP-05": { status: "covered" },
  "FX-OP-06": { status: "covered" },
  "FX-OP-07": { status: "covered" },
  "FX-OP-08": { status: "covered" },
  "FX-OP-09": { status: "covered" },
  "FX-OP-10": { status: "covered" },
  "FX-OP-11": { status: "covered" },
  "FX-OP-12": { status: "covered" },
};

export type OpenerpLicenceVerdict =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly code: "excluded-licence"; readonly reason: string };

/**
 * §7 allowlist unit check (NOT the FX-OP-04 pack closure gate).
 * Every licence must stay within the allowlist; any excluded licence refuses
 * with `excluded-licence`. This helper checks a caller-supplied string array
 * only: it neither computes the pack dependency closure nor participates in
 * `checkAdmission`. FX-OP-04 stays not-covered (GAP-OP-04, OQ-OP-13 open).
 */
export function checkOpenerpLicenceClosure(licences: readonly string[]): OpenerpLicenceVerdict {
  for (const licence of licences) {
    if (!(OPENERP_ALLOWED_LICENCES as readonly string[]).includes(licence)) {
      return { admitted: false, code: "excluded-licence", reason: `excluded licence: ${licence}` };
    }
  }
  return { admitted: true };
}

export type OpenerpVersionResolution =
  | { readonly resolved: true; readonly pin: Pin }
  | { readonly resolved: false; readonly code: "incompatible_version"; readonly reason: string };

/**
 * Pinned version resolution for openerp (FX-OP-10): versions resolve only by
 * exact pin (`1` → v1 pin, `2` → successor pin). Any unknown version refuses
 * with the exact `incompatible_version` code, never a latest fallback.
 */
export function resolveOpenerpVersion(version: string): OpenerpVersionResolution {
  if (version === OPENERP_PIN.version) return { resolved: true, pin: OPENERP_PIN };
  if (version === SUCCESSOR_V2_PIN.version) return { resolved: true, pin: SUCCESSOR_V2_PIN };
  return { resolved: false, code: "incompatible_version", reason: `unknown openerp version: ${version}` };
}

/** Draft record for the tier-N successor (admission path §1.5, corpus still absent). */
export const RECORD_OPENERP_V2_SUCCESSOR: OntologyRecord = {
  namespace: "openerp",
  id: "openerp",
  version: "2",
  owner: "openerp",
  lifecycle: "draft",
  completeness: "complete",
  visibility: "public",
  profileShape: "engram-profile",
  artifactKind: "profile",
  profileRef: { canonicalRef: "openerp@2", contentDigest: SUCCESSOR_V2_DIGESTS.contentDigest },
  digests: {
    contentDigest: SUCCESSOR_V2_DIGESTS.contentDigest,
    pinsDigest: SUCCESSOR_V2_DIGESTS.pinsDigest,
    resultEvidence: { evidenceState: "resolved", digest: SUCCESSOR_V2_DIGESTS.resultDigest },
  },
  lineage: {
    parents: [],
    mappings: ["openerp-open-standards@1", "openerp-odoo@1", "openerp-sap@1"],
    migrations: [],
  },
  consumers: [],
};
