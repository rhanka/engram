# Addendum 1 to SPEC-openerp-ontology-FROZEN-761beb41: semantic-owner answers (2026-10-28)

**Source.** The OpenERP session (the semantic owner) answered by message to gr-conductor on 2026-10-28.
- Provenance: `openerp-attested`, citing the openerp repo at HEAD. That HEAD is not yet versioned, so it is `unverified` until OQ-OP-03 lands.
- Precedence: this addendum adds data and closes register items. It overrides the frozen spec only where it says so.

**Verification by OpenERP.**
- The frozen spec's sha256 761beb41… matches.
- The three source pins [ONT] dcee5c9d…, [RET] c655288b… and [EXP] 5ddf0042… match byte for byte.
- No spec defect was found.
- The 57 + 4 = 61 enumerated count is confirmed.
- The three tenant-scoped tables without forced RLS (`translation_keys`, `jobs`, `openerp_sessions`) are confirmed.

## OQ-OP-12: resolved, negative
- `domain_events` (0001_foundation.sql:132) has **no** database immutability mechanism. It has no trigger, rule, revoke or CHECK.
- It also carries `consumed_at timestamptz`, which is written after the fact. It is therefore a mutable outbox.
- The spec stays as written.
- Database-immutable: exactly two tables.
  - `bank_transactions`: trigger `bank_transactions_immutable_evidence` and `protect_imported_bank_transaction()`, 0041.
  - `audit_events`: triggers `audit_events_no_update` and `audit_events_no_delete`, and `audit_events_block_mutations()`, 0007.
- §5, the engram-first split: the **outbox arm requires an OpenERP schema decision first**, either dropping `consumed_at` or splitting emission from consumption. The bank-evidence and audit arms stand.

## OQ-OP-11: resolved for the three pseudo-columns only
These three relations are recorded as `tenantCarried: database`.

| Constraint | Columns | References |
|---|---|---|
| `bank_transactions_account_provider_fk` | `(organization_id, bank_account_id, provider)` | `bank_accounts (organization_id, id, provider)` |
| `reconciliation_links_transaction_fk` | `(organization_id, bank_transaction_id)` | `bank_transactions (organization_id, id)` |
| `reconciliation_links_payment_fk` | `(organization_id, candidate_id)` | `payments (organization_id, id)` |

Supporting unique constraints:
- `bank_transactions`: `unique (organization_id, bank_account_id, provider, provider_transaction_ref)` and `unique (organization_id, id)`;
- `reconciliation_links`: `unique (organization_id, bank_transaction_id, candidate_kind, candidate_id)`;
- `reconciliation_links.candidate_kind` is constrained by `check (candidate_kind = 'payment')`: single-kind polymorphism, enforced by the database.

The other non-global relations are single-column foreign keys. Whether they carry the tenant stays `unverified`.

## OQ-OP-10: resolved, as an application convention
**Enforcement level.**
- The two `source_type` columns are `text not null`, with no CHECK.
- The application signatures are `sourceType: string`, with no union and no schema.
- So the record uses `enforcement: application-convention`: observed-complete at HEAD, **never** `database`.

**Target tables are carried explicitly, never derived from the kind label.** For example, the kind `recurring_schedule` targets the table `recurring_billing_schedules`.

| Column | Kind | Target | Writer |
|---|---|---|---|
| `invoice_lines.source_type` | `manual` | null `source_id` | billing/invoice-service.ts:145 |
| `invoice_lines.source_type` | `invoice_proposal_line` | `invoice_proposal_lines.id` | billing/invoice-service.ts:228 |
| `invoice_lines.source_type` | `quote_handoff` | `quote_handoffs.id` | billing/invoice-service.ts:315 |
| `invoice_lines.source_type` | `recurring_schedule` | `recurring_billing_schedules.id` | billing/recurring-schedule-service.ts:302 and :415 |
| `invoice_proposal_lines.source_type` | `time_entry` | `time_entries.id` | project/invoice-proposal-service.ts:167 |

OpenERP reports this as an integrity gap to its own owner. Engram asserts nothing stronger.

## Unchanged or rerouted
- **OQ-OP-03**, the source commit pin: blocked on the OpenERP owner. `d06d5ece` stays `unverified`, and the sha256 pins remain the authority.
- **OQ-OP-01**, Peppol in Canada/Québec: not instructed. No Peppol row is asserted.
- **OQ-OP-04**: routed to sentropic (DD1/DD7), together with the multi-tenant anchor.
- **OQ-OP-07**: OpenERP proposes that the correspondence tables live in the registry under engram custody, and the adapter code in an OpenERP-side package. This is input to the owner; it is not decided here.
- **OQ-OP-14 and OQ-OP-15**: OpenERP agrees with them. Tiers G and X stay `preserved-unvalidated`.
- OpenERP withdrew its earlier JCS re-serialization suggestion. §1.6 is confirmed: the raw-file sha256 pins the source, and `contentDigest` is computed by `hashOntologyProfile` over the normalized profile.
