// Diagram lot type-level proof: every `@ts-expect-error` below must fail
// compilation when a closed shape drifts. Checked by
// `tsc --noEmit -p tsconfig.diagram-types.json`; vitest runs this file for
// its runtime assertions only.
import { describe, expect, it } from "vitest";

import type { Pin } from "../src/ontology-guardian/types.js";
import type {
  ContractBinding,
  GovernedProfile,
} from "../src/ontology-guardian/diagram-profiles.js";
import type {
  ArchimateMigrationMapping,
  MigDocument,
  MigrationOperation,
  MigrationOutcome,
  MigrationRefusal,
  MigrationReport,
  MigrationSuccess,
  UnmigratedItem,
} from "../src/ontology-guardian/diagram-migrations.js";
import type { SupersessionRow } from "../src/ontology-guardian/diagram-registry.js";
import { SUPERSESSION } from "../src/ontology-guardian/diagram-registry.js";
import type { NativeAttributeValue, NativePortOccurrence, NativeSemanticDocument, NativeTypeDefinition, NativeViewDocument } from "../src/ontology-guardian/diagram-native-types.js";

describe("diagram lot type-level proof", () => {
  it("holds the closed migration shapes at runtime", () => {
    const outcome: MigrationOutcome = "refused";
    expect(outcome).toBe("refused");
    const op: MigrationOperation = { path: "profileRefs", action: "replace-profile-ref" };
    expect(op.action).toBe("replace-profile-ref");
    const item: UnmigratedItem = { path: "", reason: "missing-source-profile" };
    expect(item.reason).toBe("missing-source-profile");
    const binding: ContractBinding = {
      artifactKind: "contract",
      schemaPin: { id: "diagram-presentation-schema", version: "1", contentDigest: "a".repeat(64) },
      compatibilityMatrixVersion: "1",
    };
    expect(binding.compatibilityMatrixVersion).toBe("1");
    for (const row of SUPERSESSION) {
      const check: SupersessionRow = row;
      expect(check.migrationRef.startsWith("engram:migration-")).toBe(true);
    }
  });

  it("keeps governed profiles closed over declaration and digests", () => {
    const profile: GovernedProfile = {
      declaration: {},
      contentDigest: "a".repeat(64),
      artifactDigest: "b".repeat(64),
    };
    expect(profile.declaration).toEqual({});
    const pin: Pin = { id: "generic", version: "2.0.0", contentDigest: "a".repeat(64) };
    expect(pin.version).toBe("2.0.0");
  });
});

// MigrationOutcome is the closed two-state union.
// @ts-expect-error partial is not a migration outcome
const badOutcome: MigrationOutcome = "partial";

// §3.13.2 requires the closed entityTypes wrapper, never a flat map.
// @ts-expect-error entityTypes is required
const missingArchimateMapping: ArchimateMigrationMapping = {};
const flatArchimateMapping: ArchimateMigrationMapping = {
  // @ts-expect-error entity references belong inside entityTypes
  "entity:actor": "business-actor",
};
const extraArchimateMapping: ArchimateMigrationMapping = {
  entityTypes: {},
  // @ts-expect-error no additional wrapper fields
  extra: true,
};
const nonStringArchimateMapping: ArchimateMigrationMapping = {
  // @ts-expect-error catalogue assignments must be strings
  entityTypes: { "entity:actor": 1 },
};

// The contract binding pins compatibility matrix version "1" exactly.
const badBinding: ContractBinding = {
  artifactKind: "contract",
  schemaPin: { id: "s", version: "1", contentDigest: "a".repeat(64) },
  // @ts-expect-error only matrix version "1" is bound
  compatibilityMatrixVersion: "2",
};

// A migration report always carries its outcome and target arm.
// @ts-expect-error target is required (null when refused)
const badReport: MigrationReport = {
  migrationId: "engram:migration-generic-1-2",
  from: { id: "generic", version: "1.0.0", contentDigest: "a".repeat(64) },
  to: { id: "generic", version: "2.0.0", contentDigest: "b".repeat(64) },
  originalSha256: "c".repeat(64),
  originalCanonical: {
    documentId: "d", revision: 0, profileRefs: [], entities: {}, relations: {},
  },
  operations: [],
  unmigrated: [{ path: "", reason: "missing-source-profile" }],
  outcome: "refused",
};

// A refusal never carries a target document.
const badRefused: MigrationRefusal = {
  migrationId: "engram:migration-generic-1-2",
  from: { id: "generic", version: "1.0.0", contentDigest: "a".repeat(64) },
  to: { id: "generic", version: "2.0.0", contentDigest: "b".repeat(64) },
  originalSha256: "c".repeat(64),
  originalCanonical: {
    documentId: "d", revision: 0, profileRefs: [], entities: {}, relations: {},
  },
  operations: [],
  unmigrated: [{ path: "", reason: "missing-source-profile" }],
  outcome: "refused",
  // @ts-expect-error refused carries a null target
  target: {
    documentId: "d", revision: 0, profileRefs: [], entities: {}, relations: {},
  },
};

// A success never carries a null target.
const badSuccess: MigrationSuccess = {
  migrationId: "engram:migration-generic-1-2",
  from: { id: "generic", version: "1.0.0", contentDigest: "a".repeat(64) },
  to: { id: "generic", version: "2.0.0", contentDigest: "b".repeat(64) },
  originalSha256: "c".repeat(64),
  originalCanonical: {
    documentId: "d", revision: 0, profileRefs: [], entities: {}, relations: {},
  },
  operations: [],
  unmigrated: [],
  outcome: "ok",
  // @ts-expect-error ok carries a non-null target
  target: null,
};

// Refusal reasons are a closed vocabulary.
// @ts-expect-error reason strings are closed
const badReason: UnmigratedItem = { path: "", reason: "bogus-reason" };

// A governed document requires its entity and relation maps.
// @ts-expect-error entities cannot be omitted
const badDocument: MigDocument = {
  documentId: "d", revision: 0, profileRefs: ["generic@1"], relations: {},
};

// A supersession row always names its migration reference.
// @ts-expect-error migrationRef is required
const badRow: SupersessionRow = {
  from: { id: "generic", version: "1.0.0", contentDigest: "a".repeat(64) },
  supersededBy: { id: "generic", version: "2.0.0", contentDigest: "b".repeat(64) },
};

const badNativeDefinition: NativeTypeDefinition = {
  id: "custom", profile: "generic@1", baseType: "node",
  // @ts-expect-error native refinements carry AttributeSchema[], never a dictionary
  attributes: {},
};
const badNativePort: NativePortOccurrence = {
  id: "occurrence:p", port: "port:p", ownerOccurrence: "occurrence:a", side: "east", order: 0,
  // @ts-expect-error native anchors are numeric
  anchor: "middle",
};
// @ts-expect-error every reference value carries its target
const badNativeReference: NativeAttributeValue = { kind: "reference" };
// @ts-expect-error a complete native view requires presentation.camera
const badNativeView: NativeViewDocument = {
  viewId: "view:a", semanticDocumentId: "document:a", revision: 0,
  entityOccurrences: {}, relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [],
};
type NativeSummaryDefinition = NonNullable<NativeViewDocument["summaryLabels"]>[string];
const nativeSummary: NativeSummaryDefinition = {
  id: "sum:a", sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a",
  label: "", relationIds: ["relation:r"], relationOccurrences: ["occurrence:r"],
};
// @ts-expect-error native summaries require their identity
const badNativeSummary: NativeSummaryDefinition = { sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a", label: "", relationIds: ["relation:r"] };

// @ts-expect-error native semantic documents require their schema version
const badNativeSemantic: NativeSemanticDocument = {
  documentId: "document:a", revision: 0, profileRefs: ["generic@1"], typeDefinitions: {}, entities: {}, relations: {}, ports: {}, resources: {}, extensions: [],
};
