// OpenERP invariants as declared constraints (§3, tier G annotations).
// Closed shape { subject, kind, scope, enforcement, source } (§3.1).
// No §3 declaration enters any native-profile preimage. Enforcement follows
// the extraction: database where [ONT] shows the mechanism, application where
// [RET] states it, application-convention per ADDENDUM-1 OQ-OP-10, unverified
// where no mechanism is extracted. OQ-OP-10/11/12 applied exactly as written.
export type ConstraintEnforcement = "database" | "application" | "application-convention" | "unverified";

export interface GovernedConstraint {
  readonly subject: string;
  readonly kind: string;
  readonly scope: string;
  readonly enforcement: ConstraintEnforcement;
  readonly source: string;
}

/** §3.2(a) uniqueness scoped to organization_id (all database-enforced). */
export const UNIQUENESS_CONSTRAINTS: readonly GovernedConstraint[] = [
  { subject: "users (organization_id, email)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "roles (organization_id, name)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "organization_members (user_identity_id, organization_id)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "idempotency_records primary key (organization_id, key)", kind: "compositePrimaryKey", scope: "organization_id", enforcement: "database", source: "§2.7 compositePrimaryKey" },
  { subject: "translation_keys (organization_id, namespace, key, locale)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "jobs (organization_id, idempotency_key)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "agent_definitions (organization_id, name)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "pipeline_stages (organization_id, name)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "pipeline_stages (organization_id, order_index)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "rates (organization_id, name)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique rates_org_name_unique" },
  { subject: "invoices (organization_id, invoice_number)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "payments (organization_id, id)", kind: "addedConstraint", scope: "organization_id", enforcement: "database", source: "§2.7 addedConstraint 0041_banking_reconciliation.sql" },
  { subject: "tax_categories (organization_id, code)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "accounts (organization_id, code)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "email_sends (organization_id, idempotency_key)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "bank_accounts (organization_id, provider, provider_account_ref)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "bank_accounts (organization_id, id, provider)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "bank_transactions (organization_id, bank_account_id, provider, provider_transaction_ref)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "bank_transactions (organization_id, id)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
  { subject: "reconciliation_links (organization_id, bank_transaction_id, candidate_kind, candidate_id)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },
];

/**
 * §3.2(b) + ADDENDUM-1 OQ-OP-11: the only relations recorded as
 * tenantCarried database are these three named composite foreign keys.
 */
export interface TenantCarriedKey {
  readonly constraint: string;
  readonly columns: string;
  readonly references: string;
}

export const TENANT_CARRIED_DATABASE: readonly TenantCarriedKey[] = [
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
];

/** OQ-OP-11 supporting unique constraints (design-intent evidence, never enforcement evidence). */
export const TENANT_CARRY_SUPPORTING_UNIQUES: readonly string[] = [
  "bank_transactions unique (organization_id, bank_account_id, provider, provider_transaction_ref)",
  "bank_transactions unique (organization_id, id)",
  "reconciliation_links unique (organization_id, bank_transaction_id, candidate_kind, candidate_id)",
];

/** OQ-OP-11 single-kind guard: reconciliation_links.candidate_kind = payment. */
export const CANDIDATE_KIND_SINGLE_KIND = "candidate_kind = 'payment'" as const;

/**
 * §3.2(b): the 8 relations targeting the global entity user_identities are
 * declared not tenant-carried (the target carries no organization_id).
 */
export const NOT_TENANT_CARRIED_RELATIONS: readonly string[] = [
  "organization_members.user_identity_id",
  "timeline_entries.actor_user_identity_id",
  "approval_requests.requester_user_identity_id",
  "approval_requests.approver_user_identity_id",
  "passkey_credentials.user_identity_id",
  "passkey_challenges.user_identity_id",
  "openerp_sessions.user_identity_id",
  "auth_pending_tenant_selections.user_identity_id",
];

export type TenantCarried = "tenant-carried-database" | "not-tenant-carried" | "unverified";

/** Per-relation tenant-carrying (§3.2(b)): no generalization beyond these arms. */
export function tenantCarriedOf(relationKey: string): TenantCarried {
  if ((NOT_TENANT_CARRIED_RELATIONS as readonly string[]).includes(relationKey)) return "not-tenant-carried";
  return "unverified";
}

/**
 * §3.2(c) + ADDENDUM-1 OQ-OP-12 (resolved, negative): database-immutable are
 * exactly bank_transactions and audit_events. domain_events has no trigger,
 * rule, revoke or CHECK and carries consumed_at: mutable outbox, unverified.
 */
export const DATABASE_IMMUTABLE_ENTITIES: readonly string[] = ["bank_transactions", "audit_events"] as const;

export const IMMUTABILITY_MECHANISMS: Record<string, readonly string[]> = {
  bank_transactions: [
    "trigger bank_transactions_immutable_evidence before update or delete",
    "function protect_imported_bank_transaction()",
    "0041_banking_reconciliation.sql",
  ],
  audit_events: [
    "trigger audit_events_no_update before update",
    "trigger audit_events_no_delete before delete",
    "function audit_events_block_mutations()",
    "0007_audit_events_partition.sql",
  ],
};

/** §5: the outbox arm requires an OpenERP schema decision first. */
export const OUTBOX_ARM_GATED = {
  status: "unverified",
  owner: "openerp",
  question: "OQ-OP-12",
  gate: "drop consumed_at or split emission from consumption",
  standingArms: ["bank_transactions", "audit_events"],
} as const;

export function immutabilityOf(entity: string): { readonly enforcement: ConstraintEnforcement; readonly owner?: string } {
  if ((DATABASE_IMMUTABLE_ENTITIES as readonly string[]).includes(entity)) return { enforcement: "database" };
  if (entity === "domain_events") return { enforcement: "unverified", owner: "OQ-OP-12" };
  return { enforcement: "unverified" };
}

/**
 * §3.2(d) + ADDENDUM-1 OQ-OP-10 (application convention): the two source_type
 * columns are text not null with no CHECK; application signatures are
 * sourceType: string with no union and no schema. Target tables are carried
 * explicitly, never derived from the kind label.
 */
export const LINE_SOURCE_ENFORCEMENT = "application-convention" as const;

export interface LineSourceTarget {
  readonly column: string;
  readonly kind: string;
  readonly target: string;
  readonly writer: string;
}

export const LINE_SOURCE_TARGETS: readonly LineSourceTarget[] = [
  { column: "invoice_lines.source_type", kind: "manual", target: "null source_id", writer: "billing/invoice-service.ts:145" },
  { column: "invoice_lines.source_type", kind: "invoice_proposal_line", target: "invoice_proposal_lines.id", writer: "billing/invoice-service.ts:228" },
  { column: "invoice_lines.source_type", kind: "quote_handoff", target: "quote_handoffs.id", writer: "billing/invoice-service.ts:315" },
  { column: "invoice_lines.source_type", kind: "recurring_schedule", target: "recurring_billing_schedules.id", writer: "billing/recurring-schedule-service.ts:302 and :415" },
  { column: "invoice_proposal_lines.source_type", kind: "time_entry", target: "time_entries.id", writer: "project/invoice-proposal-service.ts:167" },
];

/** Allowed kinds with database enforcement (enum / CHECK). */
export const JOURNAL_SOURCE_KINDS: readonly string[] = ["invoice", "payment", "manual"] as const;
export const CANDIDATE_KINDS: readonly string[] = ["payment"] as const;

export function checkJournalSourceType(value: string): boolean {
  return (JOURNAL_SOURCE_KINDS as readonly string[]).includes(value);
}

/** reconciliation_links.candidate_kind is required (notNull true): never null. */
export function checkCandidateKind(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return (CANDIDATE_KINDS as readonly string[]).includes(value);
}

/** Line-level pairs report their allowed-kind set as unverified (OQ-OP-10). */
export function lineSourceKindStatus(): { readonly status: "unverified"; readonly owner: "OQ-OP-10" } {
  return { status: "unverified", owner: "OQ-OP-10" };
}

/** §3.2(e) application-enforced accounting balance (no database mechanism). */
export const ACCOUNTING_BALANCE: GovernedConstraint = {
  subject: "journal_entries / journal_entry_lines double-entry balance",
  kind: "application-balance",
  scope: "organization_id",
  enforcement: "application",
  source: "migration 0024 via [RET] §3.1",
};

/** §3.2(f) tenancy mechanism (declared, not decided). */
export const TENANCY = {
  scopeUnit: "organization_id",
  tenancyLevels: 1,
  mechanism: "session setting app.current_organization_id, forced row level security",
  tenantScopedEntities: 62,
  forcedRlsEntities: 60,
  exceptions: ["organizations", "user_identities", "passkey_credentials", "passkey_challenges", "oidc_state"],
  tenantScopedWithoutForcedRls: ["translation_keys", "jobs", "openerp_sessions"],
} as const;

/** Tenant-scoped uniqueness check (FX-OP-05): same org + same key violates. */
export function violatesTenantScopedUniqueness(
  a: { readonly organization_id: string; readonly key: string },
  b: { readonly organization_id: string; readonly key: string },
): boolean {
  return a.organization_id === b.organization_id && a.key === b.key;
}
