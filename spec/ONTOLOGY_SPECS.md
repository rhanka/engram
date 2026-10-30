# Ontology specs

Committed under owner decision E1 (OWNER-DECISIONS-2026-10-30): committed ontology specs live in engram `spec/`, beside the memory specs. Copies are byte-identical; sha256 values below were recomputed after copying.

## Committed specs

### spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md
- Original: `.graphify/scratch/design/ontology-guardian/SPEC-G0-guardian-contracts.md`
- sha256: `e6362445f87d6581ac31224c2dc44e15214b3a7debc2afff2b3d25b8b37ff8f6`
- Status: frozen
- Decision record: SOLID independent Astra review, final round after author switch (`review-G0-astra-sol2.out`, reviewed sha `31f81e0477a4125c18ad84dede813c71cd221ded48c312d6df105663c354974a`), recorded by the conductor on 2026-10-23; verdict source is `review-G0-astra-sol2.out` (`DOSSIER-ontology-guardian.md:730` is the dossier conductor closure).

### spec/SPEC_ONTOLOGY_OPENERP_FROZEN.md
- Original: `.graphify/scratch/design/ontology-guardian/openerp/SPEC-openerp-ontology-FROZEN-761beb41.md`
- sha256: `761beb417cc33c9181b0d1a74a8a59ca4350bf7970f99076d4ec5874250bbd93`
- Status: frozen
- Decision record: binding owner decisions recorded verbatim in the spec (2026-10-24: data model managed by engram, based on SAP and/or Odoo for interop; 2026-10-28: open standards only as normative reference, SAP/Odoo as mapping targets; 2026-10-28: MIT-only, no proprietary or LGPL derivation; vocabulary rule versions plus mappings).

### spec/SPEC_ONTOLOGY_OPENERP_ADDENDUM_1.md
- Original: `.graphify/scratch/design/ontology-guardian/openerp/ADDENDUM-1-openerp-register-answers.md`
- sha256: `413eb8ddfa374a5a73eddcf09b0563558b778fb81794a814105bd9fc87ca87c9`
- Status: validated
- Decision record: semantic-owner (OpenERP session) answers to gr-conductor, 2026-10-28; verifies frozen sha `761beb41…` and the [ONT]/[RET]/[EXP] pins match, reports no spec defect, and closes register items OQ-OP-10 (application convention), OQ-OP-11 (three pseudo-columns only), OQ-OP-12 (negative). OQ-OP-03 stays `unverified`.

### spec/SPEC_ONTOLOGY_DIAGRAM_VIEW_SCHEMA_V2.md
- Original: `.graphify/scratch/design/ontology-guardian/SPEC-diagram-view-schema-v2.md`
- sha256: `11f4f4fd1dae4fa8de654344115d78dc8628553c832937dab338fcfbebd8900b`
- Status: validated (Sol); owner decisions F1-c, F2-a, F3-a, G1, H1 recorded; implementation in progress
- Decision record: `OWNER-DECISIONS-2026-10-30.md` (dossier `DOSSIER-decision-demandes.html`, sha `024effba4d028eae2d2b78e98c710349e3a250d52f33527dc858df33a614c68c`); independent review `view-schema-v2-spec-review-sol.out` gives VERDICT: SOLID on these exact bytes. Owner summary: F1-c keeps the governed view schema as code-governed outside the catalog with exact pins (no new catalog kind, no contract entry); F2-a puts conversion refusals on a separate view-schema list and reuses `incompatible-attribute-schema` at the profile entry gate, with non-canonical failures reported outside the profile report; F3-a keeps `diagram-view-schema@1` as a retained draft selectable by exact pin (not published then deprecated); G1 runs the view-schema conversion separately before profile migration; H1 derives a missing summary id from its existing map key. The spec itself is unedited.

## Other candidates considered, not copied

- G2 diagram profiles: no standalone SPEC file exists in `ontology-guardian/` (filename search empty; only BRIEFs and `DESIGN-NOTE-G2-profiles-round3.md`). Review verdicts are NOT SOLID (`G2-profiles-review-sol-r3.out` and prior rounds). Not copied: no frozen or validated spec, no qualifying verdict.
- `m3/SPEC_EVOL_GD_M3_DIAGRAM_MODEL-FROZEN-deb64b75.md`: file exists and its name carries FROZEN, but its header states no implementation, admission, publication, consumer switch-over or review is claimed; M3 review verdicts are NOT SOLID (`.graphify/scratch/design/ontology-guardian/m3/review-M3-astra-r3.out`, `.graphify/scratch/design/ontology-guardian/m3/review-M3-sol-r3.out`). Not copied: no review verdict marks it frozen or validated.
- `time-reference/SPEC-time-reference-contract.md`: header status is proposed contract, tour 3 revision (2026-10-18). Not copied: not frozen or validated.
