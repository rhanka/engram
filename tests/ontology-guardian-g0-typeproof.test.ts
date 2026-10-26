// G0 type-level proof: every `@ts-expect-error` below must fail compilation
// when the transcribed shape drifts. Checked by
// `tsc --noEmit -p tsconfig.g0-types.json`; vitest runs this file for its
// runtime assertions only.
import { describe, expect, it } from "vitest";

import type { NativeSeverity } from "../src/ontology-guardian/diagnostics.js";
import type {
  CompiledSetting,
  DiagnosticCode,
  IdMapping,
  NativeReport,
  Report2Diagnostic,
  ReportEntry,
} from "../src/ontology-guardian/diagnostics.js";
import type { SkillPayload, SkillProfileSelector, TransitionQualification } from "../src/ontology-guardian/catalog.js";
import type { DeltaOperationDigest } from "../src/ontology-guardian/digests.js";
import type {
  DigestEvidence,
  Lifecycle,
  MappingEntry,
  Pin,
  TenantVisibility,
} from "../src/ontology-guardian/types.js";

describe("G0 type-level proof", () => {
  it("represents public and private drafts before corpus qualification", () => {
    const common = {
      namespace: "drafts", id: "new-profile", version: "0.1.0", owner: "owner",
      lifecycle: "draft" as const, completeness: "skeleton" as const,
      profileShape: "diagram-profile" as const, artifactKind: "profile" as const,
      profileRef: { canonicalRef: "draft:new-profile", contentDigest: "a".repeat(64) },
      lineage: { parents: [], mappings: [], migrations: [] }, consumers: [],
    };
    const publicDraft: OntologyRecord = { ...common, visibility: "public" };
    const privateDraft: OntologyRecord = { ...common, visibility: "private:tenant" };
    for (const draft of [publicDraft, privateDraft]) {
      expect(draft.corpusRef).toBeUndefined();
      expect(draft.digests).toBeUndefined();
    }
  });
  it("holds the transcribed shapes at runtime", () => {
    const pin: Pin = { id: "generic", version: "1.0.0", contentDigest: "a".repeat(64) };
    expect(pin.id).toBe("generic");
    const selector: SkillProfileSelector = "instructions";
    expect(selector).toBe("instructions");
    const code: DiagnosticCode = "hierarchy-cycle";
    expect(code).toBe("hierarchy-cycle");
    const severity: NativeSeverity = "warn";
    expect(severity).toBe("warn");
  });
});

// A Pin with a missing required field refuses.
// @ts-expect-error required version is missing
const badPin: Pin = { id: "generic" };

// Tenant visibility is exactly public or private:<tenant>.
// @ts-expect-error bare "private" without a tenant is not a visibility
const badVisibility: TenantVisibility = "private";

// Lifecycle stays the four-state enum.
// @ts-expect-error archived is not a lifecycle state
const badLifecycle: Lifecycle = "archived";

// The skill profile selector is the literal union, never an object arm.
// @ts-expect-error the pinned contract requires "instructions" | "tools"
const badSelector: SkillProfileSelector = { instructions: "Use this skill." };

// The skill profile selector admits no third word.
// @ts-expect-error only the two pinned words exist
const badSelectorWord: SkillProfileSelector = "tools-list";

// The DS diagnostic code union is closed.
// @ts-expect-error invented codes never typecheck
const badCode: DiagnosticCode = "invented-code";

// P-DELTA: an add carrying newName refuses at the type level.
// @ts-expect-error newName is forbidden outside rename-with-mapping
const badAdd: DeltaOperationDigest = { op: "add", subject: "t", declarationDigest: "a".repeat(64), newName: "x" };

// P-DELTA: a rename without newName refuses at the type level.
// @ts-expect-error rename-with-mapping requires newName
const badRename: DeltaOperationDigest = { op: "rename-with-mapping", subject: "a", declarationDigest: "a".repeat(64) };

// A compiled setting severity is the pinned string-or-number, never a boolean.
// @ts-expect-error booleans are not native severities
const badSetting: CompiledSetting = { rule: "r", severity: true };

// The native report version is the literal "2".
// @ts-expect-error reportVersion "3" is not a Report/2 report
const badReportVersion: NativeReport["reportVersion"] = "3";

// The native stage vocabulary has no draft/accept members.
// @ts-expect-error draft is a readiness policy, never a report stage
const badStage: ReportEntry["stage"] = "draft";

// The operation field stays a string.
// @ts-expect-error numeric operations never typecheck
const badOperation: NativeReport["operation"] = 42;

// Oracle-witness evidence carries no gate reference field.
const badWitness: TransitionQualification = {
  claim: "oracle-witness",
  parityMatrixDigest: "a".repeat(64),
  // @ts-expect-error gateEvidenceRef belongs to the reference-qualified arm only
  gateEvidenceRef: "gate-1",
};

// An endpoint mapping entry without its role refuses.
// @ts-expect-error endpoint entries require role
const badMapping: MappingEntry = { kind: "endpoint", from: "rel", to: "rel2" };

// Mapping arms carry no foreign fields.
// @ts-expect-error rename carries no role field
const badArm: MappingEntry = { kind: "rename", from: "a", to: "b", role: "source" };

// DigestEvidence arms are closed: unresolved carries no digest.
// @ts-expect-error unresolved carries no digest value
const badEvidence: DigestEvidence = { evidenceState: "unresolved", digest: "a".repeat(64) };

// A skill payload keeps the literal selector at the type level, and the
// ontology envelope still requires its payload arm.
export function typeproofShapes(payload: SkillPayload, entry: Report2Diagnostic, mapping: IdMapping): void {
  expect(payload.profile).toBeDefined();
  expect(entry.origin).toBe("report2");
  expect(mapping.domain).toBeDefined();
}

import type { OntologyRecord, GuardianDiagnostic } from "../src/ontology-guardian/types.js";
import type { OntologyPayload, SkillToolDescriptor, RegistryEnvelope, Receipt } from "../src/ontology-guardian/catalog.js";
import type { ApplyPreview, PrivateApplyPreview } from "../src/ontology-guardian/application.js";
import type { AdmissionRequest } from "../src/ontology-guardian/admission.js";

// @ts-expect-error unverified descriptors are uninhabitable
const unknownTool: SkillToolDescriptor = { invented: 42 };
// @ts-expect-error effectiveProfile is required by §6.1
const missingPreview: ApplyPreview = { bindingChanges: [], staleArtifacts: [], nextRebuild: "build" };
// @ts-expect-error no invented top-level pins in §6.1
const inventedPreview: ApplyPreview = { effectiveProfile: {}, bindingChanges: [], staleArtifacts: [], nextRebuild: "build", pins: [] };
// @ts-expect-error private preview representation is unverified, hence closed
const privatePreview: PrivateApplyPreview = { pins: [], receipts: [] };
// @ts-expect-error guardian operation codes form a closed union
const inventedGuardian: GuardianDiagnostic["code"] = "invented";

function forbiddenContracts(record: Exclude<OntologyRecord, { lifecycle: "draft" }>, payload: OntologyPayload, envelope: RegistryEnvelope, request: AdmissionRequest, receipt: Receipt): void {
  const { supersededBy, deprecatedReason, deprecatedAt, migrationRef, ...recordCommon } = record;
  // @ts-expect-error deprecated requires reason and date
  const deprecated: OntologyRecord = { ...recordCommon, lifecycle: "deprecated" };
  // @ts-expect-error deprecated requires date even with reason
  const undated: OntologyRecord = { ...recordCommon, lifecycle: "deprecated", deprecatedReason: "retired" };
  // @ts-expect-error superseded requires successor and migration
  const superseded: OntologyRecord = { ...recordCommon, lifecycle: "superseded" };
  // @ts-expect-error superseded requires migration paired with successor
  const unmigrated: OntologyRecord = { ...recordCommon, lifecycle: "superseded", supersededBy: { id: "n", version: "2", contentDigest: "a".repeat(64) } };
  // @ts-expect-error published cannot carry deprecation metadata
  const published: OntologyRecord = { ...recordCommon, lifecycle: "published", deprecatedReason: "retired" };
  const { supersededBy: successor, deprecatedReason: reason, deprecatedAt: date, ...payloadCommon } = payload;
  // @ts-expect-error payload deprecation needs reason and date too
  const badPayload: OntologyPayload = { ...payloadCommon, lifecycle: "deprecated" };
  // @ts-expect-error artifactBinding must agree with artifactKind
  const mismatchedArtifact: OntologyPayload = { ...payload, artifactKind: "theme", artifactBinding: { artifactKind: "mechanism", mechanismVersion: "1", descriptorPins: [], compatibilityMatrixVersion: "1" } };
  // @ts-expect-error ontology payload cannot be missing from its envelope
  const missingOntology: RegistryEnvelope = { ...envelope, kind: "ontology", ontology: undefined };
  // @ts-expect-error requirements must derive from entry; no caller array exists
  const erasedRequirements: AdmissionRequest = { ...request, requiredReceipts: [] };
}

function lifecycleAndRoleProof(record: Exclude<OntologyRecord, { lifecycle: "draft" }>, receipt: Receipt): void {
  const { supersededBy, deprecatedReason, deprecatedAt, migrationRef, ...common } = record;
  // @ts-expect-error date does not replace required deprecation reason
  const reasonless: OntologyRecord = { ...common, lifecycle: "deprecated", deprecatedAt: "2026-10-26" };
  // @ts-expect-error migration does not replace required successor
  const successorless: OntologyRecord = { ...common, lifecycle: "superseded", migrationRef: "migration" };
  const { validatorRole, transitionQualification, ...receiptCommon } = receipt;
  // @ts-expect-error oracle role requires its witness
  const bareOracle: Receipt = { ...receiptCommon, validatorRole: "transitional-oracle" };
  // @ts-expect-error retained checks cannot carry a transition claim
  const claimedRetained: Receipt = { ...receiptCommon, validatorRole: "retained-check", transitionQualification: { claim: "oracle-witness", parityMatrixDigest: "a".repeat(64) } };
}

function draftAndPublicationProof(record: OntologyRecord & { lifecycle: "published" }): void {
  const { corpusRef, digests, ...common } = record;
  const draft: OntologyRecord = { ...common, lifecycle: "draft" };
  const corpusDraft: OntologyRecord = { ...draft, corpusRef };
  const digestedDraft: OntologyRecord = { ...draft, digests };
  const qualifiedDraft: OntologyRecord = { ...draft, corpusRef, digests };
  // @ts-expect-error published still requires corpusRef
  const corpusless: OntologyRecord = { ...common, digests };
  // @ts-expect-error published still requires digests
  const digestless: OntologyRecord = { ...common, corpusRef };
}
