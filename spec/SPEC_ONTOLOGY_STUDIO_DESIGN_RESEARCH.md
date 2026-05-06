# Ontology Studio Design Research

Status: draft research baseline

Scope: future local ontology reconciliation studio for generic Graphify ontology profiles.

Activation: explicit ontology profile workflow only. No behavior changes for normal Graphify runs.

## Non-Goals

- Do not turn `graph.html` into an ontology editor.
- Do not edit `.graphify/graph.json` or `.graphify/ontology/*.json` directly.
- Do not introduce domain-specific ontology examples, customer examples, partner examples, or proprietary ontology examples.
- Do not depend on MCP, embeddings, database storage, or remote services for the first studio design.
- Do not implement the studio in this research lot.

## Source Review

WebProtégé

- Source: https://protegewiki.stanford.edu/wiki/WebProtege
- Relevant patterns: simplified editing over OWL constructs, change tracking, revision history, permissions, discussions, watches, notifications, customizable forms.
- Graphify adaptation: keep edits as patch proposals with audit logs; use notes/reason fields and evidence panes instead of free-form ontology mutation.

VocBench

- Sources:
- https://op.europa.eu/en/web/eu-vocabularies/vocbench
- https://journals.sagepub.com/doi/10.3233/SW-200370
- https://vocbench.uniroma2.it/doc/user/data_view.jsf
- Relevant patterns: multilingual collaborative vocabulary management, role-oriented workflows, validation/publication workflow, left structure tree plus right resource detail, metadata/namespace management.
- Graphify adaptation: provide structure browsing for profile node types, registries and candidates; make validation state explicit; defer roles/collaboration to consuming projects.

OpenRefine Reconciliation

- Sources:
- https://openrefine.org/docs/manual/reconciling
- https://openrefine.org/docs/technical-reference/reconciliation-api
- https://openrefine.org/docs/technical-reference/clustering-in-depth
- Relevant patterns: candidate ranking, score facets, judgment facets, match/create/reject actions, bulk actions over filtered records, iterative reconciliation batches, preview-on-hover.
- Graphify adaptation: candidate queue with facets by status, score, type, evidence coverage and operation; every action exports or applies a `graphify_ontology_patch_v1`.

WebVOWL / VOWL

- Sources:
- https://www.semantic-web-journal.net/content/visualizing-ontologies-vowl
- https://journals.sagepub.com/doi/abs/10.3233/SW-150200
- Relevant patterns: intuitive OWL graph notation, force-directed layout, visual class/property distinction, usable by non-experts.
- Graphify adaptation: use graph visualization as context only; keep reconciliation controls in structured panels so dense graph layout does not become the edit surface.

Karma Semantic Mapping

- Source: https://www.isi.edu/results/publications/19538/semi-automatic-data-integration-using-karma
- Relevant patterns: source-to-ontology mapping, target ontology as input, recommendation-assisted mapping, user feedback loop for difficult mappings.
- Graphify adaptation: use profile declarations as the target ontology contract; assistant proposals remain recommendations that must become deterministic patches before apply.

## Design Principles

- Derived artifacts are read-only context. The studio writes only patch files, decision logs, configured registries or configured profiles through the patch core.
- Default mode is read-only. Write mode requires explicit local launch, explicit `--write`, and patch dry-run preview before apply.
- UI must be generic. Labels in fixtures and screenshots must be synthetic and domain-neutral.
- The happy path is reviewable: candidate, evidence, proposed patch, validation result, changed-file preview, apply, rebuild.
- The studio should be useful without a server: static read-only export can generate patch JSON for manual CLI application.

## User Journeys

- Review a candidate match: open candidate queue, filter `needs_review`, inspect evidence and canonical target, dry-run `accept_match`, apply with explicit approval.
- Reject a candidate match: inspect low-confidence match, choose `reject_match`, record reason, append rejected audit log.
- Create a canonical entity: select candidate without acceptable target, choose `create_canonical`, verify type is profile-declared, export or apply patch.
- Add or reject a relation: inspect relation evidence, validate endpoint types against profile relation rules, apply `add_relation` or `reject_relation`.
- Promote status: inspect evidence requirements, dry-run `set_status`, apply only if profile status transition is allowed.
- Export for review: in read-only mode, generate patch JSON and changed-file preview without local write APIs.

## Screen Pattern Inventory

- Candidate queue: table with facets for operation, status, score, node type, relation type, evidence count and source file.
- Evidence panel: citations, source snippets, OCR/image references when present, and links to originating graph nodes.
- Canonical entity panel: current label, aliases, registry refs, status, evidence coverage and relations.
- Graph context panel: read-only neighborhood around candidate and canonical target, not an editing canvas.
- Patch preview panel: JSON patch, validation result, warnings, changed-file preview and audit destination.
- Audit trail panel: applied/rejected patches from append-only logs, filtered by entity, operation, author and date.

## Component Inventory

- `CandidateQueue`
- `FacetBar`
- `EvidencePanel`
- `CanonicalEntityPanel`
- `GraphContextPanel`
- `PatchPreview`
- `ValidationSummary`
- `AuditTrail`
- `ApplyControls`
- `ReadOnlyExportControls`

## Token Requirements

Graphify should not hard-code a visual system in this lot. Future Svelte studio should consume a token adapter compatible with `../sent-tech-design-system` once available.

Minimum tokens:

- color semantic: `surface`, `surface-muted`, `text`, `text-muted`, `border`, `accent`, `danger`, `warning`, `success`, `info`
- status colors: `candidate`, `needs_review`, `validated`, `rejected`, `superseded`, `attached`
- typography: body, mono, heading, small, table
- spacing: `xs`, `sm`, `md`, `lg`, `xl`
- radius: panel, control, badge
- elevation: floating panel and modal
- focus ring: keyboard-visible, high contrast

Fallback adapter:

- If `../sent-tech-design-system` is absent, ship a minimal local CSS variable adapter with the same token names.
- Do not import private packages or real project tokens into Graphify.

## Accessibility Risks

- Graph-only navigation is insufficient; every graph relation must be reachable from table and panel views.
- Color must not be the only status indicator; use text badges and icons/labels.
- Patch apply controls need keyboard focus order and explicit confirmation copy.
- Long evidence snippets need collapsible regions with preserved source links.
- Dense candidate tables need column hiding, sticky headers and screen-reader labels.

## Scalability Risks

- Large candidate sets need pagination or virtualized rows.
- Graph context must cap displayed hops and nodes.
- Validation should run incrementally on selected patches, not revalidate the entire corpus for every UI click.
- Audit logs can grow; filtering should read indexed summaries when available.
- Static export should remain possible when no write server is running.

## MVP Recommendation

Implement MVP studio after patch core and MCP write mode are stable:

- Svelte local package or module, not the existing HTML viewer.
- Read-only launch first: `graphify ontology studio --config graphify.yaml`.
- Write launch only with `--write`, localhost binding and local token.
- Candidate queue, evidence panel, canonical entity panel, patch preview and audit trail.
- Patch export always available.
- Patch apply available only through the same deterministic patch core used by CLI and MCP.

## Acceptance Criteria

- No real project/client/partner ontology appears in docs, tests, fixtures or screenshots.
- Read-only mode can export a valid `graphify_ontology_patch_v1`.
- Write mode cannot mutate without explicit `--write`.
- Every write goes through validate, dry-run preview and apply.
- UI design uses token adapter boundaries and does not depend directly on an unavailable design system.
