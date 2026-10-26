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
// @ts-expect-error gateEvidenceRef belongs to the reference-qualified arm only
const badWitness: TransitionQualification = {
  claim: "oracle-witness",
  parityMatrixDigest: "a".repeat(64),
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
