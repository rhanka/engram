// G0 guardian contracts — conformance tests (spec §7.2 vectors, §7.4, §8, §5.5, D-B7).
import { describe, expect, it } from "vitest";

import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import {
  contentDiagramDigest,
  contentDiagramPreimage,
  deltaDigestOf,
  deltaPreimage,
  entryDigestOf,
  mappingDigestOf,
  mappingPreimage,
  ownerResultDigestOfDocument,
  pinsDigestOf,
  pinsPreimage,
  resultDigestOf,
  severityPolicyDigestOf,
  stableForHash,
} from "../src/ontology-guardian/digests.js";
import type { DeltaOperationDigest, DiagramProfileProjection } from "../src/ontology-guardian/digests.js";
import {
  assertValidCompiledOptions,
  assertValidCompiledRule,
  assertValidNativeReport,
  assertValidSetting,
  compareDiagnostics,
  composeApplicability,
  deriveApplicability,
  diagnosticsToNativeEntries,
  guardianDiagnostic,
  lintSummary,
  mappingResolvesConflict,
  mergeApplicability,
  nativeEntryOf,
  refusedOutcome,
  reportToDiagnostics,
  sortDiagnostics,
  validateCoordinate,
  validPointer,
} from "../src/ontology-guardian/diagnostics.js";
import type {
  CompiledSetting,
  NativeReport,
  Report2Diagnostic,
  ReportEntry,
} from "../src/ontology-guardian/diagnostics.js";
import { checkAdmission } from "../src/ontology-guardian/admission.js";
import type { AdmissionEntry, AdmissionRequirement } from "../src/ontology-guardian/admission.js";
import type { McpPayload, Receipt, RegistryEnvelope, SkillPayload } from "../src/ontology-guardian/catalog.js";
import { assertValidDeltaOperation, projectPrivateRecord } from "../src/ontology-guardian/types.js";
import type { Digest, OntologyRecord, Pin } from "../src/ontology-guardian/types.js";

const A64 = "a".repeat(64);
const B64 = "b".repeat(64);

function pin(id: string, version = "1.0.0", contentDigest: Digest = A64): Pin {
  return { contentDigest, id, version };
}

// --- §7.2 canonical vectors: exact bytes, byte-for-byte ---

describe("§7.2 canonical vectors", () => {
  it("V-PINS-1 reproduces bytes and digest", () => {
    const preimage = pinsPreimage({ layers: [pin("generic")] });
    const bytes = canonicalBytes(preimage);
    expect(bytes).toBe(
      `{"deltaDigest":null,"layers":[{"contentDigest":"${A64}","id":"generic","version":"1.0.0"}],"mappingDigest":null,"ruleSheets":[]}`,
    );
    expect(bytes.length).toBe(186);
    expect(sha256Hex(bytes)).toBe("467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe");
    expect(pinsDigestOf({ layers: [pin("generic")] })).toBe(
      "467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe",
    );
  });

  it("V-DIAGRAM-1 reproduces bytes and digest", () => {
    const profile: DiagramProfileProjection = {
      profile: "generic@1",
      completeness: "complete",
      entityTypes: [{ id: "node" }],
      portTypes: [],
      relationTypes: [],
      constraints: [],
      limits: { maxEntities: 100, maxRelations: 200, maxEndpointsPerRelation: 4 },
    };
    const bytes = canonicalBytes(contentDiagramPreimage(profile));
    expect(bytes).toBe(
      `{"completeness":"complete","constraints":[],"entityTypes":[{"id":"node"}],"limits":{"maxEndpointsPerRelation":4,"maxEntities":100,"maxRelations":200},"portTypes":[],"profile":"generic@1","relationTypes":[]}`,
    );
    expect(bytes.length).toBe(206);
    expect(contentDiagramDigest(profile)).toBe(
      "4d2c641281713349753eb80ba40e0b08ec29b2f93847e4d0f2feb18e25381c94",
    );
  });

  it("V-MAPPING-1 reproduces bytes and digest", () => {
    const preimage = mappingPreimage({
      mappingId: "m1",
      version: "1.0.0",
      entries: [{ kind: "rename", from: "a", to: "b" }],
    });
    const bytes = canonicalBytes(preimage);
    expect(bytes).toBe(`{"entries":[{"from":"a","kind":"rename","to":"b"}],"mappingId":"m1","version":"1.0.0"}`);
    expect(bytes.length).toBe(86);
    expect(mappingDigestOf({ mappingId: "m1", version: "1.0.0", entries: [{ kind: "rename", from: "a", to: "b" }] })).toBe(
      "b5770fd9b0623a047f65ed3d7811340afa965a623faaf0fd3e58babbc1be2516",
    );
  });

  it("V-DELTA-1 reproduces bytes and digest", () => {
    const input = {
      base: pin("generic"),
      mappingRef: null,
      operations: [{ op: "add" as const, subject: "c4-system", declarationDigest: B64 }],
      retiredFixtures: [],
      retiredRules: [],
    };
    const bytes = canonicalBytes(deltaPreimage(input));
    expect(bytes).toBe(
      `{"base":{"contentDigest":"${A64}","id":"generic","version":"1.0.0"},"mappingRef":null,"operations":[{"declarationDigest":"${B64}","op":"add","subject":"c4-system"}],"retiredFixtures":[],"retiredRules":[]}`,
    );
    expect(bytes.length).toBe(320);
    expect(deltaDigestOf(input)).toBe("436065f4f09c6de4dc7f25f8eb3821088e43f27c2f9454137fc19042bebff3e2");
  });

  it("any single-byte change breaks the vector check", () => {
    const bytes = `{"deltaDigest":null,"layers":[{"contentDigest":"${A64}","id":"generic","version":"1.0.0"}],"mappingDigest":null,"ruleSheets":[]}`;
    expect(sha256Hex(`${bytes} `)).not.toBe("467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe");
    expect(sha256Hex(bytes.replace('"generic"', '"Generic"'))).not.toBe(
      "467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe",
    );
  });
});

// --- §7.2 owner selector/byte vectors (E0/E1, V-OWNER-0a..1) ---

const E0 =
  `{"$schema":"urn:profile-mechanism:1","base":{"id":"base","sha256":"${A64}","version":"1.0.0"},"capabilities":[],"compatibilityAliases":[],"descriptors":[{"id":"bpmn","sha256":"${B64}","version":"1.0.0"}],"exports":[],"mechanismVersion":"1","messages":[],"migrations":[],"notions":[],"placements":[],"policies":{},"producerDelta":[],"profile":"g0-vector","providerDialects":[],"recipes":[],"resources":[],"rules":[],"schemaVersion":"1.0.0","themes":[],"ui":[],"validation":[{"id":"import","policy":"draft","settings":[{"classification":"readiness","rule":"label-required","severity":"warn"}]},{"id":"import","policy":"accept","settings":[{"classification":"readiness","rule":"label-required","severity":"error"}]},{"id":"release","policy":"accept","settings":[{"classification":"advisory","rule":"label-required","severity":"info"}]}],"version":"1.0.0"}`;

const E1 = E0.replace(
  `"policy":"draft","settings":[{"classification":"readiness","rule":"label-required","severity":"warn"}`,
  `"policy":"draft","settings":[{"classification":"readiness","rule":"label-required","severity":"error"}`,
);

const WARN = [{ classification: "readiness", rule: "label-required", severity: "warn" }];
const ERROR = [{ classification: "readiness", rule: "label-required", severity: "error" }];
const INFO_ADVISORY = [{ classification: "advisory", rule: "label-required", severity: "info" }];

describe("§7.2 owner selector vectors", () => {
  it("E0 hashes to the frozen owner digest over 968 bytes", () => {
    expect(E0.length).toBe(968);
    expect(ownerResultDigestOfDocument(E0)).toBe(
      "d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903",
    );
  });

  it("E1 (one severity cell changed) hashes to its frozen digest over 969 bytes", () => {
    expect(E1.length).toBe(969);
    expect(ownerResultDigestOfDocument(E1)).toBe(
      "f3c0f8f0fb4d1526767df6841e42de873473d72178ca71c88b7b0fd58521eb2c",
    );
  });

  it("V-OWNER-0a/0b/0c share the document digest, selection digests differ", () => {
    expect(severityPolicyDigestOf("import", "draft", WARN)).toBe(
      "f4fe529257140570caa80653a2c33b55d942f8ede92a8a03d6dc8e048f1fb7db",
    );
    expect(severityPolicyDigestOf("import", "accept", ERROR)).toBe(
      "af61ae36a73bb35ef0271c1edbdb15cf7ed271342edd536d2d4561f2b7057028",
    );
    expect(severityPolicyDigestOf("release", "accept", INFO_ADVISORY)).toBe(
      "8b3bb80431f6df02eb1832c92e4c4e6b07e5056b9e453cf2679e2a583632b918",
    );
    expect(ownerResultDigestOfDocument(E0)).toBe(ownerResultDigestOfDocument(E0));
  });

  it("V-OWNER-1 changes the stored row: selection and result digests change", () => {
    expect(severityPolicyDigestOf("import", "draft", ERROR)).toBe(
      "8eaf5e7eb8909c547f0f55c4fd8f3f65f14951ad9e079ef8bef851bdbe0ca655",
    );
    expect(ownerResultDigestOfDocument(E1)).not.toBe(ownerResultDigestOfDocument(E0));
  });

  it("FX-CAT-SELECTION policy-only case: identical settings under accept", () => {
    expect(severityPolicyDigestOf("import", "accept", WARN)).toBe(
      "935a32b0f48e494e4e0226473703404562f8cbed025bddd73c2a1c1b5d3927f8",
    );
  });

  it("deleting empty themes/ui breaks the owner digest (no permitted projection)", () => {
    const noThemes = E0.replace(`"themes":[],"ui":[]`, `"ui":[]`);
    expect(ownerResultDigestOfDocument(noThemes)).not.toBe(ownerResultDigestOfDocument(E0));
    const noSchema = E0.replace(`{"$schema":"urn:profile-mechanism:1",`, `{`);
    expect(ownerResultDigestOfDocument(noSchema)).not.toBe(ownerResultDigestOfDocument(E0));
  });
});

// --- §7.4 contentDigest completeness (diagram scope) ---

const BASE_PROFILE: DiagramProfileProjection = {
  profile: "generic@1",
  completeness: "complete",
  entityTypes: [{ id: "node", label: "Node", attributes: { size: "number" }, abstract: false }],
  portTypes: [{ id: "port", label: "Port" }],
  relationTypes: [
    {
      id: "link",
      roles: { from: { min: 1, max: 1 }, to: { min: 0, max: 5 } },
      targets: ["node"],
      hierarchy: "dag",
    },
  ],
  constraints: [{ kind: "unique-attribute", target: "node.name", bound: 1 }],
  limits: { maxEntities: 100, maxRelations: 200, maxEndpointsPerRelation: 4 },
};

describe("§7.4 contentDigest", () => {
  it("FX-DIG-C1 profile and completeness each change the digest", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    expect(contentDiagramDigest({ ...BASE_PROFILE, profile: "generic@2" })).not.toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, completeness: "skeleton" })).not.toBe(base);
  });

  it("FX-DIG-C2 one entity type field at a time changes the digest", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    const [declared] = BASE_PROFILE.entityTypes;
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, entityTypes: [{ ...declared, id: "node2" }] }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, entityTypes: [{ ...declared, label: "Task" }] }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, entityTypes: [{ ...declared, attributes: { size: "string" } }] }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, entityTypes: [{ ...declared, abstract: true }] }),
    ).not.toBe(base);
  });

  it("FX-DIG-C3 one port type declaration changes the digest", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    const [declared] = BASE_PROFILE.portTypes;
    expect(contentDiagramDigest({ ...BASE_PROFILE, portTypes: [{ ...declared, id: "port2" }] })).not.toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, portTypes: [{ ...declared, label: "Pin" }] })).not.toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, portTypes: [] })).not.toBe(base);
  });

  it("FX-DIG-C4 one relation field at a time changes the digest", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    const [declared] = BASE_PROFILE.relationTypes as Record<string, unknown>[];
    const roles = declared!["roles"] as { from: Record<string, unknown>; to: Record<string, unknown> };
    expect(
      contentDiagramDigest({
        ...BASE_PROFILE,
        relationTypes: [{ ...declared, roles: { ...roles, from: { ...roles.from, min: 2 } } }],
      }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({
        ...BASE_PROFILE,
        relationTypes: [{ ...declared, roles: { ...roles, to: { ...roles.to, max: 6 } } }],
      }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, relationTypes: [{ ...declared, targets: ["node2"] }] }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, relationTypes: [{ ...declared, hierarchy: "tree" }] }),
    ).not.toBe(base);
  });

  it("FX-DIG-C5 one constraint field at a time changes the digest", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    const [declared] = BASE_PROFILE.constraints as Record<string, unknown>[];
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, constraints: [{ ...declared, kind: "required-attribute" }] }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, constraints: [{ ...declared, target: "node.label" }] }),
    ).not.toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, constraints: [{ ...declared, bound: 2 }] })).not.toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, constraints: [] })).not.toBe(base);
  });

  it("FX-DIG-C6 each limit and each omission changes the digest; skeletons qualify", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    expect(contentDiagramDigest({ ...BASE_PROFILE, limits: { ...BASE_PROFILE.limits, maxEntities: 101 } })).not.toBe(
      base,
    );
    expect(contentDiagramDigest({ ...BASE_PROFILE, limits: { ...BASE_PROFILE.limits, maxRelations: 201 } })).not.toBe(
      base,
    );
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, limits: { ...BASE_PROFILE.limits, maxEndpointsPerRelation: 5 } }),
    ).not.toBe(base);
    // Each omission hashes that key as null: omitting one limit changes the digest.
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, limits: { maxEntities: 100, maxEndpointsPerRelation: 4 } }),
    ).not.toBe(base);
    expect(
      contentDiagramDigest({ ...BASE_PROFILE, limits: { maxEntities: 100, maxRelations: 200 } }),
    ).not.toBe(base);
    // Pinned skeletons hash omitted limits as null: explicit null equals omission.
    const skeleton: DiagramProfileProjection = {
      profile: "bpmn@1",
      completeness: "skeleton",
      entityTypes: [],
      portTypes: [],
      relationTypes: [],
      constraints: [],
      limits: { maxEndpointsPerRelation: 2 },
    };
    expect(contentDiagramDigest(skeleton)).toBe(
      contentDiagramDigest({ ...skeleton, limits: { maxEntities: null, maxRelations: null, maxEndpointsPerRelation: 2 } }),
    );
    // Omission is never 0.
    expect(contentDiagramDigest(skeleton)).not.toBe(
      contentDiagramDigest({ ...skeleton, limits: { maxEntities: 0, maxRelations: 0, maxEndpointsPerRelation: 2 } }),
    );
  });

  it("FX-DIG-C7 each irrelevant input really varies and leaves the digest unchanged", () => {
    const base = contentDiagramDigest(BASE_PROFILE);
    expect(contentDiagramDigest({ ...BASE_PROFILE, notes: ["human reading note"] })).toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, themeRef: "dark@2" })).toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, catalogRef: "catalog-entry-7" })).toBe(base);
    expect(contentDiagramDigest({ ...BASE_PROFILE, filePath: "/profiles/generic.ts" })).toBe(base);
    expect(
      contentDiagramDigest({
        ...BASE_PROFILE,
        notes: ["n"],
        themeRef: "dark@2",
        catalogRef: "entry-7",
        filePath: "/profiles/generic.ts",
      }),
    ).toBe(base);
  });
});

// --- §7.4 pinsDigest completeness ---

describe("§7.4 pinsDigest", () => {
  const basePin = pin("generic");
  it("FX-DIG-P1 each layer pin field changes the digest", () => {
    const base = pinsDigestOf({ layers: [basePin] });
    expect(pinsDigestOf({ layers: [pin("other")] })).not.toBe(base);
    expect(pinsDigestOf({ layers: [pin("generic", "2.0.0")] })).not.toBe(base);
    expect(pinsDigestOf({ layers: [pin("generic", "1.0.0", B64)] })).not.toBe(base);
  });

  it("FX-DIG-P2 reordering layers changes the digest and resolved bytes", () => {
    const fwd = pinsDigestOf({ layers: [pin("a"), pin("b")] });
    expect(pinsDigestOf({ layers: [pin("b"), pin("a")] })).not.toBe(fwd);
  });

  it("FX-DIG-P3 rule-sheet pins and composed order change the digest", () => {
    const base = pinsDigestOf({ layers: [basePin], ruleSheets: [pin("sheet-a")] });
    expect(pinsDigestOf({ layers: [basePin], ruleSheets: [pin("sheet-b")] })).not.toBe(base);
    const two = pinsDigestOf({ layers: [basePin], ruleSheets: [pin("sheet-a"), pin("sheet-b")] });
    expect(pinsDigestOf({ layers: [basePin], ruleSheets: [pin("sheet-b"), pin("sheet-a")] })).not.toBe(two);
    expect(pinsDigestOf({ layers: [basePin] })).not.toBe(base);
  });

  it("FX-DIG-P3b one rule-sheet version changes the digest", () => {
    const base = pinsDigestOf({ layers: [basePin], ruleSheets: [pin("sheet-a")] });
    expect(pinsDigestOf({ layers: [basePin], ruleSheets: [pin("sheet-a", "2.0.0")] })).not.toBe(base);
  });

  it("FX-DIG-P4 each delta input changes the digest; one add encodes without a profile", () => {
    const delta = {
      base: basePin,
      mappingRef: null,
      operations: [{ op: "add" as const, subject: "t", declarationDigest: B64 }],
      retiredFixtures: [],
      retiredRules: [],
    };
    const base = deltaDigestOf(delta);
    // Base pin: one field at a time.
    expect(deltaDigestOf({ ...delta, base: pin("other") })).not.toBe(base);
    expect(deltaDigestOf({ ...delta, base: pin("generic", "2.0.0") })).not.toBe(base);
    // Single-value operation payload: same op and subject, one digest changes.
    expect(
      deltaDigestOf({
        ...delta,
        operations: [{ op: "add" as const, subject: "t", declarationDigest: A64 }],
      }),
    ).not.toBe(base);
    // Pure operation reorder: the same two operations in swapped order.
    const two = {
      ...delta,
      operations: [
        { op: "add" as const, subject: "t", declarationDigest: B64 },
        { op: "add" as const, subject: "u", declarationDigest: A64 },
      ],
    };
    expect(deltaDigestOf({ ...two, operations: [...two.operations].reverse() })).not.toBe(deltaDigestOf(two));
    // One retired reason at a time.
    expect(
      deltaDigestOf({ ...delta, retiredFixtures: [{ fixtureRef: "f", reason: "superseded" }] }),
    ).not.toBe(base);
    expect(
      deltaDigestOf({
        ...delta,
        retiredFixtures: [{ fixtureRef: "f", reason: "superseded" }],
        // Same ref, only the reason changes.
      }),
    ).not.toBe(deltaDigestOf({ ...delta, retiredFixtures: [{ fixtureRef: "f", reason: "renamed" }] }));
    expect(deltaDigestOf({ ...delta, retiredRules: [{ ruleId: "r", reason: "renamed" }] })).not.toBe(base);
    // Mapping reference: absent versus one pin.
    expect(deltaDigestOf({ ...delta, mappingRef: pin("map") })).not.toBe(base);
    // The delta digest enters pinsDigest; one add needs no whole-profile value.
    expect(pinsDigestOf({ layers: [basePin], deltaDigest: base })).not.toBe(pinsDigestOf({ layers: [basePin] }));
  });

  it("FX-DIG-P5 each mapping decision field changes the digest", () => {
    const one = { mappingId: "m", version: "1.0.0", entries: [{ kind: "cardinality" as const, subject: "r", chosenMin: 1, chosenMax: 3 }] };
    const base = mappingDigestOf(one);
    // chosenMin alone (the field a hardcoded projection would drop).
    expect(mappingDigestOf({ ...one, entries: [{ kind: "cardinality", subject: "r", chosenMin: 2, chosenMax: 3 }] })).not.toBe(base);
    expect(mappingDigestOf({ ...one, entries: [{ kind: "cardinality", subject: "r", chosenMin: 1, chosenMax: 4 }] })).not.toBe(base);
    const shaped = {
      mappingId: "m",
      version: "1.0.0",
      entries: [{ kind: "hierarchy" as const, relationId: "rel", chosenShape: "dag" as const, parentRole: "p", childRole: "c" }],
    };
    expect(
      mappingDigestOf({ ...shaped, entries: [{ kind: "hierarchy", relationId: "rel", chosenShape: "tree" as const, parentRole: "p", childRole: "c" }] }),
    ).not.toBe(mappingDigestOf(shaped));
    expect(
      mappingDigestOf({ ...shaped, entries: [{ kind: "hierarchy", relationId: "rel", chosenShape: "dag" as const, parentRole: "q", childRole: "c" }] }),
    ).not.toBe(mappingDigestOf(shaped));
    const severe = {
      mappingId: "m",
      version: "1.0.0",
      entries: [{ kind: "severity" as const, ruleId: "r", phase: "import", readinessPolicy: "draft", chosenSeverity: "warn" }],
    };
    expect(
      mappingDigestOf({ ...severe, entries: [{ kind: "severity", ruleId: "r", phase: "import", readinessPolicy: "draft", chosenSeverity: "error" }] }),
    ).not.toBe(mappingDigestOf(severe));
    const renamed = {
      mappingId: "m",
      version: "1.0.0",
      entries: [{ kind: "rename" as const, from: "a", to: "b" }],
    };
    expect(mappingDigestOf({ ...renamed, entries: [{ kind: "rename", from: "a2", to: "b" }] })).not.toBe(
      mappingDigestOf(renamed),
    );
    // Entry order, mappingId and version each change the digest.
    const twoEntries = {
      mappingId: "m",
      version: "1.0.0",
      entries: [
        { kind: "rename" as const, from: "a", to: "b" },
        { kind: "type" as const, from: "T", to: "U" },
      ],
    };
    expect(mappingDigestOf({ ...twoEntries, entries: [...twoEntries.entries].reverse() })).not.toBe(
      mappingDigestOf(twoEntries),
    );
    expect(mappingDigestOf({ ...one, mappingId: "m2" })).not.toBe(base);
    expect(mappingDigestOf({ ...one, version: "2.0.0" })).not.toBe(base);
    expect(pinsDigestOf({ layers: [basePin], mappingDigest: base })).not.toBe(pinsDigestOf({ layers: [basePin] }));
  });

  it("FX-DIG-P6 applied theme state really varies and leaves pinsDigest unchanged", () => {
    const before = pinsDigestOf({ layers: [basePin] });
    // Theme state is not a pin input: varying it keeps the digest identical.
    expect(pinsDigestOf({ layers: [basePin], themeState: { theme: "dark@2" } })).toBe(before);
    expect(pinsDigestOf({ layers: [pin("generic")], themeState: { theme: "light@1" } })).toBe(before);
    expect(pinsDigestOf({ layers: [basePin], themeState: undefined })).toBe(before);
    // Changed bytes behind an unchanged pin recompute a different content digest:
    // presenting them under the old pin refuses at the gate instead of forking pinsDigest.
    expect(contentDiagramDigest({ ...BASE_PROFILE, profile: "generic@2" })).not.toBe(basePin.contentDigest);
  });
});

// --- §7.4 resultDigest + entryDigest, FX-DIG-01/04, FX-THM-01 ---

const RESULT_BASE = {
  effectiveDeclarations: contentDiagramPreimage(BASE_PROFILE),
  effectiveRuleSet: [
    {
      classification: "readiness",
      code: "label-required",
      messageKey: "label.required",
      ruleBody: { id: "label-required", phase: "import", select: { kind: "node" }, assert: { has: "label" } },
      ruleId: "label-required",
      severity: "warn",
    },
  ],
  severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
};

describe("§7.4 resultDigest and entryDigest", () => {
  it("FX-DIG-R1 effective declaration change (pins identical) changes resultDigest", () => {
    const base = resultDigestOf(RESULT_BASE);
    const changed = resultDigestOf({
      ...RESULT_BASE,
      effectiveDeclarations: contentDiagramPreimage({ ...BASE_PROFILE, profile: "generic@2" }),
    });
    expect(changed).not.toBe(base);
  });

  it("FX-DIG-R2 one pattern and one classification inside a rule body change resultDigest", () => {
    const base = resultDigestOf(RESULT_BASE);
    const [row] = RESULT_BASE.effectiveRuleSet;
    // Same ruleId, same severity, same pins: only the select pattern changes.
    const pattern = resultDigestOf({
      ...RESULT_BASE,
      effectiveRuleSet: [
        {
          ...row!,
          ruleBody: { id: "label-required", phase: "import", select: { kind: "edge" }, assert: { has: "label" } },
        },
      ],
    });
    expect(pattern).not.toBe(base);
    // Same body, only the stored classification changes (the field a hardcoded row would drop).
    const classification = resultDigestOf({
      ...RESULT_BASE,
      effectiveRuleSet: [{ ...row!, classification: "advisory" }],
    });
    expect(classification).not.toBe(base);
    expect(classification).not.toBe(pattern);
    // Same body, only the assert threshold changes.
    expect(
      resultDigestOf({
        ...RESULT_BASE,
        effectiveRuleSet: [
          {
            ...row!,
            ruleBody: { id: "label-required", phase: "import", select: { kind: "node" }, assert: { has: "label", min: 2 } },
          },
        ],
      }),
    ).not.toBe(base);
  });

  it("FX-DIG-OWNER mutating an effective rule body changes the whole-document digest", () => {
    const withRule = E0.replace(`"rules":[]`, `"rules":[{"id":"label-required","phase":"import","select":{},"assert":{}}]`);
    expect(ownerResultDigestOfDocument(withRule)).not.toBe(ownerResultDigestOfDocument(E0));
  });

  it("FX-DIG-R3 severity/selection change resultDigest; owner selector alone does not", () => {
    const base = resultDigestOf(RESULT_BASE);
    expect(resultDigestOf({ ...RESULT_BASE, severityPolicyDigest: severityPolicyDigestOf("import", "draft", ERROR) })).not.toBe(base);
    // Policy-only selection (identical settings under accept): policy digest and result change.
    const policyOnly = severityPolicyDigestOf("import", "accept", WARN);
    expect(policyOnly).toBe("935a32b0f48e494e4e0226473703404562f8cbed025bddd73c2a1c1b5d3927f8");
    expect(policyOnly).not.toBe(severityPolicyDigestOf("import", "draft", WARN));
    expect(resultDigestOf({ ...RESULT_BASE, severityPolicyDigest: policyOnly })).not.toBe(base);
    // Owner scope: the 0a/0b selector pair changes effective severity and selection
    // digest while the same E0 document keeps its frozen result digest.
    expect(severityPolicyDigestOf("import", "accept", ERROR)).not.toBe(severityPolicyDigestOf("import", "draft", WARN));
    expect(ownerResultDigestOfDocument(E0)).toBe(
      "d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903",
    );
    // V-OWNER-1 stores a changed severity row: selection and result digests change.
    expect(severityPolicyDigestOf("import", "draft", ERROR)).toBe(
      "8eaf5e7eb8909c547f0f55c4fd8f3f65f14951ad9e079ef8bef851bdbe0ca655",
    );
    expect(ownerResultDigestOfDocument(E1)).toBe(
      "f3c0f8f0fb4d1526767df6841e42de873473d72178ca71c88b7b0fd58521eb2c",
    );
  });

  it("FX-DIG-01/FX-DIG-R4 composition-only change: pinsDigest unchanged, resultDigest changed", () => {
    const pins = pinsDigestOf({ layers: [pin("generic")] });
    expect(pinsDigestOf({ layers: [pin("generic")] })).toBe(pins);
    expect(resultDigestOf({ ...RESULT_BASE, severityPolicyDigest: severityPolicyDigestOf("import", "accept", WARN) })).not.toBe(
      resultDigestOf(RESULT_BASE),
    );
  });

  it("FX-DIG-R5 catalog metadata really varies and leaves resultDigest unchanged", () => {
    const base = resultDigestOf(RESULT_BASE);
    // Owner, consumers and other catalog fields vary; the effective result is identical.
    expect(resultDigestOf({ ...RESULT_BASE, catalogMetadata: { owner: "team-a", consumers: ["c1"] } })).toBe(base);
    expect(resultDigestOf({ ...RESULT_BASE, catalogMetadata: { owner: "team-b", consumers: ["c1", "c2"] } })).toBe(
      base,
    );
    expect(resultDigestOf({ ...RESULT_BASE, catalogMetadata: undefined })).toBe(base);
  });

  it("FX-THM-01 separate theme application leaves styled digests identical; baking it in does not", () => {
    // A separately pinned theme is presentation state outside E: E bytes and digest unchanged.
    expect(ownerResultDigestOfDocument(E0)).toBe("d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903");
    expect(contentDiagramDigest(BASE_PROFILE)).toBe(contentDiagramDigest({ ...BASE_PROFILE, themeRef: "dark@2" }));
    // Baking the theme into the native document sections is a profile-byte change.
    const themed = E0.replace(`"themes":[]`, `"themes":["dark"]`);
    expect(ownerResultDigestOfDocument(themed)).not.toBe(ownerResultDigestOfDocument(E0));
    // Removing it restores the frozen bytes exactly.
    expect(ownerResultDigestOfDocument(themed.replace(`"themes":["dark"]`, `"themes":[]`))).toBe(
      ownerResultDigestOfDocument(E0),
    );
  });

  it("FX-DIG-E1 one envelope field at a time changes entryDigest", () => {
    const entry = {
      format: "sentropic.registry-entry/v1",
      kind: "ontology",
      id: "o",
      name: "O",
      entryVersion: "1.0.0",
      assets: [{ role: "profile", path: "profile.json", mediaType: "application/json", sha256: A64 }],
    };
    const base = entryDigestOf(entry);
    expect(entryDigestOf({ ...entry, name: "O2" })).not.toBe(base);
    expect(entryDigestOf({ ...entry, entryVersion: "1.0.1" })).not.toBe(base);
    expect(
      entryDigestOf({
        ...entry,
        assets: [{ role: "profile", path: "profile.json", mediaType: "application/json", sha256: B64 }],
      }),
    ).not.toBe(base);
  });

  it("FX-DIG-E2 one payload pin or owner field changes entryDigest", () => {
    const entry = {
      kind: "ontology",
      id: "o",
      owner: "team-a",
      profilePin: { id: "generic", version: "1.0.0", contentDigest: A64 },
      stack: [{ id: "generic", version: "1.0.0", contentDigest: A64 }],
    };
    const base = entryDigestOf(entry);
    expect(entryDigestOf({ ...entry, owner: "team-b" })).not.toBe(base);
    expect(
      entryDigestOf({ ...entry, profilePin: { id: "generic", version: "2.0.0", contentDigest: A64 } }),
    ).not.toBe(base);
    expect(
      entryDigestOf({ ...entry, stack: [{ id: "other", version: "1.0.0", contentDigest: A64 }] }),
    ).not.toBe(base);
  });

  it("FX-DIG-04/FX-DIG-E3 deprecation changes entryDigest only", () => {
    const content = contentDiagramDigest(BASE_PROFILE);
    const pins = pinsDigestOf({ layers: [pin("generic")] });
    const result = resultDigestOf(RESULT_BASE);
    // Profile bytes untouched by deprecation: the three content digests recompute equal.
    expect(contentDiagramDigest(BASE_PROFILE)).toBe(content);
    expect(pinsDigestOf({ layers: [pin("generic")] })).toBe(pins);
    expect(resultDigestOf(RESULT_BASE)).toBe(result);
    const before = entryDigestOf({ kind: "ontology", id: "o", lifecycle: "published" });
    const after = entryDigestOf({
      kind: "ontology",
      id: "o",
      lifecycle: "deprecated",
      deprecatedReason: "renamed",
      deprecatedAt: "2026-10-25",
      supersededBy: { contentDigest: content, id: "o2", version: "1.0.0" },
    });
    expect(after).not.toBe(before);
  });

  it("FX-DIG-E4 evidence flip and FX-DIG-E5 receipts/lineage change entryDigest", () => {
    const unresolved = entryDigestOf({ kind: "ontology", id: "o", resultEvidence: { evidenceState: "unresolved" } });
    const resolved = entryDigestOf({ kind: "ontology", id: "o", resultEvidence: { evidenceState: "resolved", digest: A64 } });
    expect(resolved).not.toBe(unresolved);
    expect(entryDigestOf({ kind: "ontology", id: "o", consumers: ["a"] })).not.toBe(
      entryDigestOf({ kind: "ontology", id: "o", consumers: ["a", "b"] }),
    );
    // Adding one required receipt changes the entry digest.
    const noReceipt = entryDigestOf({ kind: "ontology", id: "o", receipts: [] });
    expect(entryDigestOf({ kind: "ontology", id: "o", receipts: [{ receiptKind: "bpmn-bijection" }] })).not.toBe(
      noReceipt,
    );
    // Adding one mapping reference or one consumer changes the entry digest.
    expect(entryDigestOf({ kind: "ontology", id: "o", lineage: { parents: [] } })).not.toBe(
      entryDigestOf({ kind: "ontology", id: "o", lineage: { parents: [], derivation: null, mappings: ["m1"] } }),
    );
  });

  it("FX-DIG-E6 entryDigest is external: self-embedding refuses", () => {
    expect(() => entryDigestOf({ kind: "ontology", id: "o", entryDigest: A64 })).toThrow("entry-digest-self-embedded");
  });

  it("digest values never substitute for one another", () => {
    const pins = pinsDigestOf({ layers: [pin("generic")] });
    const result = resultDigestOf(RESULT_BASE);
    expect(pins).not.toBe(contentDiagramDigest(BASE_PROFILE));
    expect(result).not.toBe(pins);
  });
});

// --- §2.1 envelope: lossless mapping, ordering, native predicates ---

function sampleReport(): NativeReport {
  const loss: ReportEntry = {
    code: "loss.semantic-type",
    severity: "warn",
    classification: "loss",
    lossClass: "semantic-type",
    stage: "import",
    ruleId: "profile:node-kind",
    messageKey: "loss.semantic-type",
    disposition: "dropped",
    source: { domain: "tree", pointer: "/entities/2", targetId: "Task_2", provenance: "exact" },
    result: { domain: "tree", pointer: "/entities/2", targetId: "Task_2", provenance: "exact" },
    beforePresent: true,
    before: { kind: "task" },
    afterPresent: false,
    pageId: "p1",
    occurrenceKey: "o-2",
  };
  const info: ReportEntry = {
    code: "normalize.ok",
    severity: "info",
    classification: "readiness",
    stage: "normalize",
    ruleId: "adapter",
    messageKey: "normalize.ok",
    disposition: "corrected",
    source: { domain: "tree", pointer: null, targetId: null, provenance: "unavailable" },
    result: { domain: "tree", pointer: null, targetId: null, provenance: "unavailable" },
    beforePresent: false,
    afterPresent: true,
    after: { kind: "node" },
  };
  // Native order differs from G0 code order on purpose.
  return {
    reportVersion: "2",
    operation: "validate",
    entries: [loss, info],
    rawStandardFindings: [{ raw: true }],
    idMap: [{ sourceId: "a", resultId: "b", domain: "migration" }],
    artifacts: [{ format: "bpmn", capability: "structural", entryIndexes: [0] }],
  };
}

describe("§2.1 diagnostics envelope", () => {
  it("FX-DIAG-01 native report round-trips through separate copies", () => {
    const report = sampleReport();
    const snapshot = JSON.stringify(report);
    const diagnostics = reportToDiagnostics(report, (e) => e.ruleId, (e) => (e.code === "loss.semantic-type" ? "N3" : undefined));
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]!.reportEntryIndex).toBe(0);
    expect(diagnostics[1]!.reportEntryIndex).toBe(1);
    expect(diagnostics[0]!.studyDisposition).toBe("N3");
    expect(diagnostics[1]!.studyDisposition).toBeUndefined();
    // Native report untouched: no G0 fields inside entries, order kept.
    expect(JSON.stringify(report)).toBe(snapshot);
    expect("origin" in report.entries[0]!).toBe(false);
    // Permute only the separate copies, then invert.
    const permuted = [diagnostics[1]!, diagnostics[0]!];
    expect(diagnosticsToNativeEntries(report, permuted)).toEqual(report.entries);
    // Native entry copy strips exactly the G0 fields.
    expect(nativeEntryOf(diagnostics[0]!)).toEqual(report.entries[0]);
  });

  it("FX-DIAG-01 inverse refuses missing/duplicate/out-of-range indexes", () => {
    const report = sampleReport();
    const diagnostics = reportToDiagnostics(report, (e) => e.ruleId);
    expect(() => diagnosticsToNativeEntries(report, [diagnostics[0]!])).toThrow("diagnostic-count-mismatch");
    expect(() => diagnosticsToNativeEntries(report, [diagnostics[0]!, diagnostics[0]!])).toThrow("diagnostic-duplicate-index");
    const tampered: Report2Diagnostic = { ...diagnostics[1]!, code: "other" };
    expect(() => diagnosticsToNativeEntries(report, [diagnostics[0]!, tampered])).toThrow("diagnostic-code-mismatch");
  });

  it("FX-DIAG-02 coordinate predicates and lint barrier hold", () => {
    validateCoordinate({ domain: "tree", pointer: null, targetId: "Task_1", provenance: "unavailable" });
    validateCoordinate({ domain: "tree", pointer: null, targetId: null, provenance: "unavailable" });
    expect(() => validateCoordinate({ domain: "none", pointer: null, targetId: "t", provenance: "unavailable" })).toThrow();
    expect(validPointer("")).toBe(true);
    expect(validPointer("/a/0")).toBe(true);
    expect(validPointer("~x")).toBe(false);
    expect(validPointer("a")).toBe(false);
    expect(
      lintSummary([
        { severity: "error", disposition: "corrected" },
        { severity: "error", disposition: "dropped" },
        { severity: "error", disposition: "mapped" },
      ]),
    ).toEqual({ ok: true, counts: { info: 0, warn: 0, error: 0 } });
    expect(lintSummary([{ severity: "error", disposition: "observed" }])).toEqual({
      ok: false,
      counts: { info: 0, warn: 0, error: 1 },
    });
    expect(lintSummary([{ severity: "warn", disposition: "observed" }]).counts.warn).toBe(1);
  });

  it("G0 ordering sorts by (code, subjectRef, locator), null first, ties by index", () => {
    const report = sampleReport();
    const [loss, info] = reportToDiagnostics(report, (e) => e.ruleId);
    const sorted = sortDiagnostics([info!, loss!]);
    expect(sorted[0]!.code).toBe("loss.semantic-type");
    expect(compareDiagnostics(loss!, loss!)).toBe(0);
    // Null locators first within equal keys.
    const a = guardianDiagnostic("unresolved-conflict", "s", "error", "m", null);
    const b = guardianDiagnostic("unresolved-conflict", "s", "error", "m", "/p");
    expect(compareDiagnostics(a, b)).toBe(-1);
  });

  it("FX-COMPILED-01 compiled-rule closure: options refuse, bindings stay separate", () => {
    assertValidCompiledRule({
      id: "r",
      phase: "import",
      select: {},
      assert: {},
      code: "c",
      message: "m",
      classification: "readiness",
      bindings: [{ ownerId: "o", role: "r", targetId: "t" }],
    });
    expect(() =>
      assertValidCompiledRule({ id: "r", phase: "import", select: {}, assert: {}, code: "c", message: "m", classification: "readiness", options: {} }),
    ).toThrow("compiled-rule-forbidden:options");
  });

  it("FX-LINEAGE-01 private reference/record mapping round-trips; mismatch refuses", () => {
    const lineage = {
      parents: [pin("base")],
      derivationRef: { base: pin("base"), deltaDigest: B64 },
      mappings: ["m1"],
      migrations: [],
    };
    const digests = { contentDigest: A64, pinsDigest: B64, resultEvidence: { evidenceState: "resolved" as const, digest: A64 } };
    const record = projectPrivateRecord(lineage, digests);
    expect(record).not.toBeNull();
    expect(record!.base).toEqual(pin("base"));
    expect(record!.resultingDigests).toEqual(digests);
    expect(projectPrivateRecord({ parents: [], mappings: [], migrations: [] }, digests)).toBeNull();
  });

  it("FX-MAP-01 typed arms resolve; bare entries refuse cardinality/hierarchy/severity", () => {
    expect(mappingResolvesConflict("cardinality-conflict", "r", [{ kind: "cardinality", subject: "r", chosenMin: 1, chosenMax: 2 }])).toBe(true);
    expect(mappingResolvesConflict("cardinality-conflict", "r", [{ kind: "rename", from: "r", to: "s" }])).toBe(false);
    expect(mappingResolvesConflict("hierarchy-shape-conflict", "rel", [{ kind: "hierarchy", relationId: "rel", chosenShape: "dag", parentRole: "p", childRole: "c" }])).toBe(true);
    expect(mappingResolvesConflict("hierarchy-shape-conflict", "rel", [{ kind: "rename", from: "rel", to: "x" }])).toBe(false);
    expect(mappingResolvesConflict("severity-conflict", "rule-1", [{ kind: "severity", ruleId: "rule-1", phase: "import", readinessPolicy: "draft", chosenSeverity: "error" }])).toBe(true);
    expect(mappingResolvesConflict("severity-conflict", "rule-1", [{ kind: "rename", from: "rule-1", to: "rule-2" }])).toBe(false);
    expect(mappingResolvesConflict("type-id-collision", "T", [{ kind: "type", from: "T", to: "U" }])).toBe(true);
    expect(mappingResolvesConflict("relation-endpoint-incompatible", "rel", [{ kind: "endpoint", from: "rel", to: "rel2", role: "source" }])).toBe(true);
  });
});

// --- §8.7 conflict families, failing then passing ---

const CONFLICT_SUBJECTS: Record<string, { code: string; mapping: { kind: string } & Record<string, unknown> }> = {
  "FX-CF-01": { code: "type-id-collision", mapping: { kind: "type", from: "T", to: "U" } },
  "FX-CF-02": { code: "relation-endpoint-incompatible", mapping: { kind: "endpoint", from: "rel", to: "rel2", role: "source" } },
  "FX-CF-03": { code: "cardinality-conflict", mapping: { kind: "cardinality", subject: "r", chosenMin: 1, chosenMax: 2 } },
  "FX-CF-04": { code: "hierarchy-shape-conflict", mapping: { kind: "hierarchy", relationId: "rel", chosenShape: "dag", parentRole: "p", childRole: "c" } },
  "FX-CF-05": { code: "attribute-redefinition", mapping: { kind: "type", from: "T", to: "U" } },
  "FX-CF-06": { code: "status-vocabulary-divergence", mapping: { kind: "vocabulary", from: "open", to: "candidate" } },
  "FX-CF-07": { code: "parent-type-removal", mapping: { kind: "type", from: "T", to: "U" } },
  "FX-CF-08": { code: "endpoint-without-join", mapping: { kind: "endpoint", from: "rel", to: "rel2", role: "source" } },
  "FX-CF-09": { code: "gate-weakening", mapping: { kind: "severity", ruleId: "gate", phase: "release", readinessPolicy: "accept", chosenSeverity: "error" } },
  "FX-CF-10": { code: "unmapped-rename", mapping: { kind: "rename", from: "old", to: "new" } },
  "FX-CF-11": { code: "severity-conflict", mapping: { kind: "severity", ruleId: "rule-1", phase: "import", readinessPolicy: "draft", chosenSeverity: "error" } },
};

describe("§8.7 conflict families failing then passing", () => {
  for (const [fx, { code }] of Object.entries(CONFLICT_SUBJECTS)) {
    it(`${fx} ${code}: failing run refuses with no candidate, passing run resolves`, () => {
      // Failing: refusal carries the named diagnostic at severity error, no candidate bytes.
      const refused = refusedOutcome([guardianDiagnostic(code, "subject", "error", `${code}.found`)]);
      expect(refused.outcome).toBe("refused");
      expect(refused.diagnostics).toHaveLength(1);
      expect(refused.diagnostics[0]!.nativeCode).toBe(code);
      expect("candidate" in refused).toBe(false);
    });
  }

  it("passing runs carry the reviewed typed mapping decision", () => {
    expect(mappingResolvesConflict("cardinality-conflict", "r", [{ kind: "cardinality", subject: "r", chosenMin: 1, chosenMax: 2 }])).toBe(true);
    expect(mappingResolvesConflict("hierarchy-shape-conflict", "rel", [{ kind: "hierarchy", relationId: "rel", chosenShape: "dag", parentRole: "p", childRole: "c" }])).toBe(true);
    expect(mappingResolvesConflict("severity-conflict", "rule-1", [{ kind: "severity", ruleId: "rule-1", phase: "import", readinessPolicy: "draft", chosenSeverity: "error" }])).toBe(true);
  });

  it("FX-CF-12 hierarchy-cycle-detached is success with reporting, never a refusal", () => {
    const diagnostics = [guardianDiagnostic("hierarchy-cycle-detached", "cycle", "info", "cycle.detached", "/entities/a")];
    expect(diagnostics).toHaveLength(1);
    expect(() => refusedOutcome(diagnostics)).toThrow("refused-requires-error");
    expect(diagnostics[0]!.severity).toBe("info");
  });

  it("FX-MRG-REG silent attribute overwrite refuses by construction", () => {
    const refused = refusedOutcome([guardianDiagnostic("attribute-redefinition", "attr", "error", "overwrite.refused")]);
    expect(refused.outcome).toBe("refused");
  });
});

// --- §5.5 admission gate ---

function passingSelection(digest: Digest = severityPolicyDigestOf("import", "draft", WARN)): AdmissionEntry["selections"][number] {
  return {
    phase: "import",
    readinessPolicy: "draft",
    settings: WARN as CompiledSetting[],
    severityPolicyDigest: digest,
    rules: [{ ruleId: "label-required", severity: "warn" }],
  };
}

function requirement(
  receiptKind: AdmissionRequirement["receiptKind"],
  libraryId = "bpmn-canvas",
  libraryVersion = "1.0.0",
  extra: Partial<AdmissionRequirement> = {},
): AdmissionRequirement {
  return { receiptKind, libraryId, libraryVersion, ...extra };
}

function admissionEntry(overrides: Partial<AdmissionEntry> = {}): AdmissionEntry {
  return {
    stack: [pin("generic")],
    pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
    resultEvidence: { evidenceState: "resolved", digest: A64 },
    profilePin: pin("generic"),
    corpusDigest: B64,
    selections: [passingSelection()],
    ruleSheetPins: [pin("sheet-a")],
    visibility: "public",
    ...overrides,
  };
}

function bpmnParityReceipt(overrides: Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>> = {}): Receipt {
  return {
    receiptKind: "bpmn-parity",
    corpusDigest: B64,
    libraryId: "bpmn-canvas",
    libraryVersion: "1.0.0",
    validatorRole: "transitional-oracle",
    transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 },
    verdict: "pass",
    issuedAt: "2026-10-26",
    evaluatedStack: {
      stack: [pin("generic")],
      pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
      resultEvidence: { evidenceState: "resolved", digest: A64 },
    },
    proofBindings: {
      proofSet: "published-corpus",
      corpusAuthority: { tag: "profile-corpus-v1.0.0", manifestDigest: B64 },
      profilePin: pin("generic"),
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
      ruleSheetPins: [pin("sheet-a")],
      compiledLintEvidence: {
        scope: "public",
        compiledOptions: {
          mechanismVersion: "1",
          profileDigest: A64,
          phase: "import",
          readinessPolicy: "draft",
          compiledRules: [],
          bindings: [],
          severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
        },
        settings: WARN as CompiledSetting[],
      },
    },
    ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" }],
    ...overrides,
  };
}

describe("§5.5 admission gate", () => {
  it("admits a passing matching receipt", () => {
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [bpmnParityReceipt()] })).toEqual({
      admitted: true,
    });
  });

  it("FX-RCPT-UNRESOLVED pass with unresolved evidence refuses; both arms must resolve equal", () => {
    const unresolvedReceipt = bpmnParityReceipt({
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "unresolved" },
      },
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [unresolvedReceipt] }),
    ).toEqual({ admitted: false, code: "missing-receipt", reason: expect.stringContaining("unresolved") });
    expect(
      checkAdmission({
        entry: admissionEntry({ resultEvidence: { evidenceState: "unresolved" } }),
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [bpmnParityReceipt()],
      }).admitted,
    ).toBe(false);
  });

  it("FX-RCPT-MISMATCH stack order, pinsDigest and resolved result refuse", () => {
    const entry = admissionEntry();
    const wrongOrder = bpmnParityReceipt({
      evaluatedStack: {
        stack: [pin("generic", "2.0.0")],
        pinsDigest: entry.pinsDigest,
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
    });
    expect(checkAdmission({ entry, requiredReceipts: [requirement("bpmn-parity")], receipts: [wrongOrder] }).admitted).toBe(false);
    const wrongPins = bpmnParityReceipt({
      evaluatedStack: { stack: [pin("generic")], pinsDigest: B64, resultEvidence: { evidenceState: "resolved", digest: A64 } },
    });
    expect(checkAdmission({ entry, requiredReceipts: [requirement("bpmn-parity")], receipts: [wrongPins] }).admitted).toBe(false);
    const wrongResult = bpmnParityReceipt({
      evaluatedStack: { stack: [pin("generic")], pinsDigest: entry.pinsDigest, resultEvidence: { evidenceState: "resolved", digest: B64 } },
    });
    expect(checkAdmission({ entry, requiredReceipts: [requirement("bpmn-parity")], receipts: [wrongResult] }).admitted).toBe(false);
  });

  it("FX-CAT-GATE/FX-RCPT-FAIL missing or failed receipt refuses, skeleton included", () => {
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [] }).admitted).toBe(false);
    const failed = bpmnParityReceipt({ verdict: "fail" });
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [failed] }).admitted).toBe(false);
  });

  it("FX-RCPT-NOTEVAL a required not-evaluated rule never counts as pass", () => {
    const noteval = bpmnParityReceipt({
      ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "not-evaluated", parity: "open" }],
    });
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [noteval] }).admitted).toBe(false);
  });

  it("wrong role for the transition gate and unqualified reference claim refuse", () => {
    const oracle = bpmnParityReceipt();
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [oracle], requireReference: true }).admitted,
    ).toBe(false);
    const unqualified = bpmnParityReceipt({ validatorRole: "qualified-ds-execution" });
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [unqualified] }).admitted).toBe(false);
  });

  it("severity mismatch and stale selection digest refuse with matching result evidence", () => {
    const stale = bpmnParityReceipt({
      ruleVerdicts: [{ ruleId: "label-required", severity: "error", verdict: "pass", parity: "proven" }],
    });
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [stale] }).admitted).toBe(false);
    const fresh = bpmnParityReceipt() as Extract<Receipt, { receiptKind: "bpmn-parity" }>;
    const staleDigest = bpmnParityReceipt({
      proofBindings: { ...fresh.proofBindings, severityPolicyDigest: severityPolicyDigestOf("import", "draft", ERROR) },
    });
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [staleDigest] }).admitted).toBe(false);
  });

  it("FX-RCPT-ARMS family arms need no BPMN proofs; wrong family matter refuses", () => {
    const familyReceipt: Receipt = {
      receiptKind: "family-corpus",
      corpusDigest: B64,
      libraryId: "engram",
      libraryVersion: "1.0.0",
      validatorRole: "retained-check",
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      family: "ENG",
      fixtureDigest: B64,
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
      ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" }],
    };
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")], receipts: [familyReceipt] })).toEqual({
      admitted: true,
    });
    const wrongFixture = { ...familyReceipt, fixtureDigest: A64 } as Receipt;
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")], receipts: [wrongFixture] }).admitted).toBe(false);
    const h2a: Receipt = {
      receiptKind: "h2a-vocabulary",
      corpusDigest: B64,
      libraryId: "h2a",
      libraryVersion: "1.0.0",
      validatorRole: "retained-check",
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      protocolPin: pin("other"),
      sourceRevision: "abc",
      fixtureDigest: B64,
      severityPolicyDigest: null,
      ruleVerdicts: [],
    };
    expect(
      checkAdmission({ entry: admissionEntry({ selections: [] }), requiredReceipts: [requirement("h2a-vocabulary", "h2a", "1.0.0")], receipts: [h2a] }).admitted,
    ).toBe(false);
  });

  it("null selection only with no rule sheet; bijection needs full coverage; theme invariance", () => {
    const nulled: Receipt = {
      receiptKind: "family-corpus",
      corpusDigest: B64,
      libraryId: "engram",
      libraryVersion: "1.0.0",
      validatorRole: "retained-check",
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      family: "ENG",
      fixtureDigest: B64,
      severityPolicyDigest: null,
      ruleVerdicts: [],
    };
    // Entry has rule sheets but receipt claims null selection: refuse.
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")], receipts: [nulled] }).admitted).toBe(false);
    const bijection: Receipt = {
      receiptKind: "bpmn-bijection",
      corpusDigest: B64,
      libraryId: "d2d",
      libraryVersion: "1.0.0",
      validatorRole: "transitional-oracle",
      transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 },
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      descriptorCoverage: { covered: 3, total: 4 },
      roundTripEvidenceRef: "rt",
      moddleTestPin: pin("bpmn-moddle"),
      severityPolicyDigest: null,
    };
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-bijection", "d2d", "1.0.0")], receipts: [bijection] }).admitted).toBe(false);
    const theme: Receipt = {
      receiptKind: "theme-invariance",
      corpusDigest: B64,
      libraryId: "d2d",
      libraryVersion: "1.0.0",
      validatorRole: "retained-check",
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      styledProfilePin: pin("generic"),
      semanticDigestsBefore: { contentDigest: A64, pinsDigest: A64, resultDigest: A64 },
      semanticDigestsAfter: { contentDigest: A64, pinsDigest: A64, resultDigest: B64 },
      severityPolicyDigest: null,
    };
    expect(checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("theme-invariance", "d2d", "1.0.0")], receipts: [theme] }).admitted).toBe(false);
  });
});

// --- §1.4/§5.3 frozen record and lineage shapes; §3.2 rename mapping ---

describe("frozen record, lineage and rename shapes", () => {
  it("§1.4 public record carries the lineage container; private record carries PrivateLineage", () => {
    const pub: OntologyRecord = {
      namespace: "d2d",
      id: "base",
      version: "1.0.0",
      owner: "team",
      lifecycle: "published",
      completeness: "complete",
      visibility: "public",
      profileShape: "diagram-profile",
      artifactKind: "base",
      profileRef: { canonicalRef: "c", contentDigest: A64 },
      corpusRef: { ref: "r", digest: A64 },
      digests: { contentDigest: A64, pinsDigest: B64, resultEvidence: { evidenceState: "resolved", digest: A64 } },
      lineage: { parents: [pin("generic")], mappings: ["m1"], migrations: [] },
      consumers: [],
    };
    expect(pub.lineage.parents).toHaveLength(1);
    expect(pub.lineage.mappings).toEqual(["m1"]);
    const priv: OntologyRecord = {
      namespace: "d2d",
      id: "base",
      version: "1.0.0",
      owner: "team",
      lifecycle: "published",
      completeness: "complete",
      visibility: "private:tenant-a",
      profileShape: "diagram-profile",
      artifactKind: "base",
      profileRef: { canonicalRef: "c", contentDigest: A64 },
      corpusRef: { ref: "r", digest: A64 },
      digests: { contentDigest: A64, pinsDigest: B64, resultEvidence: { evidenceState: "resolved", digest: A64 } },
      lineage: { parents: [pin("generic")], mappings: [], migrations: [] },
      consumers: [],
    };
    expect(priv.lineage.parents).toHaveLength(1);
    expect("derivation" in priv.lineage).toBe(false);
  });

  it("§3.2 rename-with-mapping carries its mappingEntry with subject/new-name consistency", () => {
    assertValidDeltaOperation({
      op: "rename-with-mapping",
      subject: "old",
      newName: "new",
      mappingEntry: { kind: "rename", from: "old", to: "new" },
    });
    expect(() =>
      assertValidDeltaOperation({
        op: "rename-with-mapping",
        subject: "old",
        newName: "new",
        mappingEntry: { kind: "rename", from: "other", to: "new" },
      }),
    ).toThrow("rename-mapping-subject-mismatch");
    expect(() =>
      assertValidDeltaOperation({
        op: "rename-with-mapping",
        subject: "old",
        newName: "new",
        mappingEntry: { kind: "rename", from: "old", to: "other" },
      }),
    ).toThrow("rename-mapping-newname-mismatch");
    assertValidDeltaOperation({ op: "add", subject: "t", declaration: { id: "t" } });
  });
});

// --- §5.2 registry union: skill, mcp, ontology arms ---

describe("§5.2 registry envelope union", () => {
  const base = {
    format: "sentropic.registry-entry/v1" as const,
    contractVersion: "1.1.4",
    id: "e",
    name: "E",
    description: "entry",
    entryVersion: "1.0.0",
    publisher: { packageName: "p", packageVersion: "1.0.0" },
    compatibility: { entryContract: "c", packages: [], schemaProfiles: [], requiredHostFeatures: [], optionalHostFeatures: [] },
    parameters: { schemaVersion: "s", schema: {}, defaults: {} },
    bindings: [],
    assets: [],
  };
  it("skill and mcp arms carry their own payloads; ontology requires its payload", () => {
    const skill: SkillPayload = {
      profile: "instructions",
      metadata: { category: "c", contextFilters: [], permissionRequirements: [], toolNames: [] },
      instructionsAsset: "SKILL.md",
      capabilities: [{ id: "cap", description: "d", effect: "read-only", permissions: [] }],
      tools: [],
      documentSchemas: [],
      dependencies: [],
    };
    const skillEntry: RegistryEnvelope = { ...base, kind: "skill", skill };
    expect(skillEntry.kind).toBe("skill");
    const mcp: McpPayload = {
      manifestAsset: "manifest.json",
      connectorIds: ["c"],
      transportProfiles: [{ id: "t", mode: "stdio", protocolVersions: ["1"], requiredHostFeatures: [] }],
      protocolVersions: ["1"],
    };
    const mcpEntry: RegistryEnvelope = { ...base, kind: "mcp", mcp };
    expect(mcpEntry.kind).toBe("mcp");
    // kind ontology without its payload is a type error (checked by tsc, not only by tests):
    //   const bad: RegistryEnvelope = { ...base, kind: "ontology" };
  });
});

// --- S-COMPILED native constraints and RFC 8785 unicode ---

describe("native evidence constraints and canonical unicode", () => {
  it("S-COMPILED options close the rule; settings keep required native fields", () => {
    assertValidSetting({ rule: "label-required", severity: "warn", classification: "readiness" });
    assertValidSetting({ rule: "label-required", severity: 2, options: { threshold: 1 } });
    expect(() => assertValidSetting({ rule: "label-required" })).toThrow("setting-missing:severity");
    expect(() => assertValidSetting({ severity: "warn" })).toThrow("setting-missing:rule");
    expect(() => assertValidSetting({ rule: "r", severity: "warn", extra: 1 })).toThrow("setting-forbidden:extra");
    assertValidCompiledOptions({
      mechanismVersion: "1",
      profileDigest: A64,
      phase: "import",
      readinessPolicy: "draft",
      compiledRules: [
        {
          id: "r",
          phase: "import",
          select: {},
          assert: {},
          code: "c",
          message: "m",
          classification: "readiness",
          bindings: [{ ownerId: "o", role: "r", targetId: "t" }],
        },
      ],
      bindings: [{ ownerId: "o", role: "r", targetId: "t" }],
      severityPolicyDigest: A64,
    });
    expect(() =>
      assertValidCompiledOptions({
        mechanismVersion: "2",
        profileDigest: A64,
        phase: "import",
        readinessPolicy: "draft",
        compiledRules: [],
        bindings: [],
        severityPolicyDigest: A64,
      }),
    ).toThrow("compiled-options-mechanism");
  });

  it("RFC 8785 canonicalization rejects lone surrogates in values and keys", () => {
    expect(() => canonicalBytes("lone \ud800 lead")).toThrow("invalid-unicode");
    expect(() => canonicalBytes("lone \udc00 trail")).toThrow("invalid-unicode");
    expect(() => canonicalBytes({ ["bad \udc00"]: 1 })).toThrow("invalid-unicode");
    // A well-formed astral pair serializes unchanged.
    expect(canonicalBytes("𝄞")).toBe('"𝄞"');
    expect(canonicalBytes({ key: "𝄞" })).toBe('{"key":"𝄞"}');
  });

  it("FX-DIAG-01 inverse accepts canonically equal entries with reordered keys", () => {
    const report = sampleReport();
    const diags = reportToDiagnostics(report, (e) => e.ruleId);
    const reshuffled = diags.map((d) => {
      const native = nativeEntryOf(d) as unknown as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(native).reverse()) out[key] = native[key];
      return {
        ...out,
        origin: "report2",
        nativeCode: d.nativeCode,
        subjectRef: d.subjectRef,
        reportEntryIndex: d.reportEntryIndex,
        ...(d.studyDisposition !== undefined ? { studyDisposition: d.studyDisposition } : {}),
      } as unknown as Report2Diagnostic;
    });
    expect(Object.keys(reshuffled[0]!).join(",")).not.toBe(Object.keys(report.entries[0]!).join(","));
    expect(diagnosticsToNativeEntries(report, reshuffled)).toEqual(report.entries);
  });

  it("§2.1.1 non-null locator ties keep reportEntryIndex order", () => {
    const report = sampleReport();
    const [first] = reportToDiagnostics(report, (e) => e.ruleId);
    const at = (index: number): Report2Diagnostic => ({
      ...first!,
      code: "same",
      nativeCode: "same",
      subjectRef: "s",
      reportEntryIndex: index,
      source: { domain: "tree", pointer: "/p", targetId: null, provenance: "exact" },
      result: { domain: "tree", pointer: "/p", targetId: null, provenance: "exact" },
    });
    const later = at(1);
    const earlier = at(0);
    expect(compareDiagnostics(later, earlier)).toBeGreaterThan(0);
    expect(compareDiagnostics(earlier, later)).toBeLessThan(0);
    expect(sortDiagnostics([later, earlier]).map((d) => (d as Report2Diagnostic).reportEntryIndex)).toEqual([0, 1]);
  });
});

// --- §5.5 admission: digests, requirements, selection, verdicts, families, private path ---

function receiptBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    corpusDigest: B64,
    libraryId: "bpmn-canvas",
    libraryVersion: "1.0.0",
    validatorRole: "transitional-oracle",
    transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 },
    verdict: "pass",
    issuedAt: "2026-10-26",
    evaluatedStack: {
      stack: [pin("generic")],
      pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
      resultEvidence: { evidenceState: "resolved", digest: A64 },
    },
    ...overrides,
  };
}

describe("§5.5 admission hardening", () => {
  it("every digest value is validated: malformed, empty and absent digests refuse", () => {
    const good = { entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [bpmnParityReceipt()] };
    expect(checkAdmission(good)).toEqual({ admitted: true });
    expect(checkAdmission({ ...good, entry: admissionEntry({ pinsDigest: "zzz" }) }).admitted).toBe(false);
    expect(checkAdmission({ ...good, entry: admissionEntry({ pinsDigest: "" }) }).admitted).toBe(false);
    expect(checkAdmission({ ...good, entry: admissionEntry({ corpusDigest: "NOT-HEX" }) }).admitted).toBe(false);
    const absentDigest = bpmnParityReceipt({
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: undefined as unknown as Digest,
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [absentDigest] })
        .admitted,
    ).toBe(false);
    // An unresolved arm carrying a digest value never matches resolved evidence.
    const smuggled = bpmnParityReceipt({
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "unresolved", digest: A64 } as unknown as { evidenceState: "resolved"; digest: Digest },
      },
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [smuggled] })
        .admitted,
    ).toBe(false);
  });

  it("one receipt satisfies exactly one library requirement", () => {
    const single = bpmnParityReceipt();
    // The same receipt presented twice still leaves the second requirement missing.
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity"), requirement("bpmn-parity")],
        receipts: [single],
      }).admitted,
    ).toBe(false);
    // Two libraries, two receipts: each requirement binds its own.
    const twin = bpmnParityReceipt({ libraryId: "bpmn-twin", libraryVersion: "2.0.0" });
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity"), requirement("bpmn-parity", "bpmn-twin", "2.0.0")],
        receipts: [single, twin],
      }),
    ).toEqual({ admitted: true });
    // Proof set is part of the requirement: the wrong set refuses.
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity", "bpmn-canvas", "1.0.0", { proofSet: "local-expectations" })],
        receipts: [single],
      }).admitted,
    ).toBe(false);
    // Qualification scope is part of the requirement: the wrong phase refuses.
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity", "bpmn-canvas", "1.0.0", { phase: "release" })],
        receipts: [single],
      }).admitted,
    ).toBe(false);
  });

  it("selection and compiled evidence are verified, not only found", () => {
    // Stale settings: binding names the WARN selection but evidence carries ERROR settings.
    const staleSettings = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
          },
          settings: ERROR as CompiledSetting[],
        },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [staleSettings] })
        .admitted,
    ).toBe(false);
    // Selector mismatch: compiled options name release/accept, selection is import/draft.
    const selectorMismatch = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "release",
            readinessPolicy: "accept",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
          },
          settings: WARN as CompiledSetting[],
        },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [selectorMismatch],
      }).admitted,
    ).toBe(false);
    // Native profile digest must equal the entry profile pin.
    const profileMismatch = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: B64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
          },
          settings: WARN as CompiledSetting[],
        },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [profileMismatch],
      }).admitted,
    ).toBe(false);
    // Compiled-rule closure: options in a compiled rule refuse.
    const closedViolation = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [
              { id: "r", phase: "import", select: {}, assert: {}, code: "c", message: "m", classification: "r", options: {} },
            ],
            bindings: [],
            severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
          },
          settings: WARN as CompiledSetting[],
        },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [closedViolation],
      }).admitted,
    ).toBe(false);
  });

  it("every selected rule needs its own verdict row: missing, forged off and foreign rows refuse", () => {
    const twoRules = admissionEntry({
      selections: [
        {
          ...passingSelection(),
          rules: [
            { ruleId: "label-required", severity: "warn" },
            { ruleId: "second-rule", severity: "error" },
          ],
        },
      ],
    });
    // Missing row for the second selected rule refuses.
    expect(
      checkAdmission({
        entry: twoRules,
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [bpmnParityReceipt()],
      }).admitted,
    ).toBe(false);
    // Forged off: the selection says warn, the verdict claims off.
    const forgedOff = bpmnParityReceipt({
      ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "off", parity: "proven" }],
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [forgedOff] })
        .admitted,
    ).toBe(false);
    // Unknown rule verdict refuses.
    const foreign = bpmnParityReceipt({
      ruleVerdicts: [
        { ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" },
        { ruleId: "ghost-rule", severity: "warn", verdict: "pass", parity: "proven" },
      ],
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [foreign] })
        .admitted,
    ).toBe(false);
    // Selected off admits an off verdict for its own row only when the native
    // settings select off too: effective severity derives from the settings.
    const offSettings = [{ classification: "readiness", rule: "label-required", severity: "off" }] as CompiledSetting[];
    const offDigest = severityPolicyDigestOf("import", "draft", offSettings);
    const offSelection = admissionEntry({
      selections: [
        {
          phase: "import",
          readinessPolicy: "draft",
          settings: offSettings,
          severityPolicyDigest: offDigest,
          rules: [{ ruleId: "label-required", severity: "off" }],
        },
      ],
    });
    const offVerdict = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        severityPolicyDigest: offDigest,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: offDigest,
          },
          settings: offSettings,
        },
      },
      ruleVerdicts: [{ ruleId: "label-required", severity: "off", verdict: "off", parity: "proven" }],
    });
    expect(
      checkAdmission({ entry: offSelection, requiredReceipts: [requirement("bpmn-parity")], receipts: [offVerdict] }),
    ).toEqual({ admitted: true });
    // A row relabelled off while the settings still select warn refuses:
    // the row must equal the derived effective severity. The receipt below
    // binds the unchanged WARN selection and claims off throughout.
    const relabelled = admissionEntry({
      selections: [
        {
          ...passingSelection(),
          rules: [{ ruleId: "label-required", severity: "off" }],
        },
      ],
    });
    const relabelledVerdict = bpmnParityReceipt({
      ruleVerdicts: [{ ruleId: "label-required", severity: "off", verdict: "off", parity: "proven" }],
    });
    expect(
      checkAdmission({ entry: relabelled, requiredReceipts: [requirement("bpmn-parity")], receipts: [relabelledVerdict] })
        .admitted,
    ).toBe(false);
  });

  it("family proof bindings: corpus, schema, matrix, pins and roles are all checked", () => {
    // Wrong corpus evidence refuses on the parity arm too.
    const wrongCorpus = bpmnParityReceipt({ corpusDigest: A64 });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [wrongCorpus] })
        .admitted,
    ).toBe(false);
    // Contract verdict binds the entry schema pin and the matrix version.
    const contractEntry = admissionEntry({ contractSchemaPin: pin("schema"), compatibilityMatrixVersion: "3" });
    const contractOk: Receipt = {
      ...(receiptBase() as unknown as Receipt),
      receiptKind: "contract-verdict",
      schemaPin: pin("schema"),
      compatibilityMatrixVersion: "3",
      caseVerdicts: [{ caseId: "c1" }],
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
    } as Receipt;
    expect(
      checkAdmission({
        entry: contractEntry,
        requiredReceipts: [requirement("contract-verdict", "bpmn-canvas", "1.0.0")],
        receipts: [contractOk],
      }),
    ).toEqual({ admitted: true });
    const wrongSchema = { ...contractOk, schemaPin: pin("other") } as Receipt;
    expect(
      checkAdmission({
        entry: contractEntry,
        requiredReceipts: [requirement("contract-verdict", "bpmn-canvas", "1.0.0")],
        receipts: [wrongSchema],
      }).admitted,
    ).toBe(false);
    const missingBinding = { ...contractOk } as Receipt;
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("contract-verdict", "bpmn-canvas", "1.0.0")],
        receipts: [missingBinding],
      }).admitted,
    ).toBe(false);
    const wrongMatrix = { ...contractOk, compatibilityMatrixVersion: "4" } as Receipt;
    expect(
      checkAdmission({
        entry: contractEntry,
        requiredReceipts: [requirement("contract-verdict", "bpmn-canvas", "1.0.0")],
        receipts: [wrongMatrix],
      }).admitted,
    ).toBe(false);
    // Theme invariance binds the styled profile pin; the null policy digest is
    // the no-rule-sheet binding, so the admitting entry pins no sheets.
    const themeEntry = admissionEntry({ selections: [], ruleSheetPins: [] });
    const themeOk: Receipt = {
      ...(receiptBase() as unknown as Receipt),
      receiptKind: "theme-invariance",
      styledProfilePin: pin("generic"),
      semanticDigestsBefore: { contentDigest: A64, pinsDigest: A64, resultDigest: A64 },
      semanticDigestsAfter: { contentDigest: A64, pinsDigest: A64, resultDigest: A64 },
      severityPolicyDigest: null,
    } as Receipt;
    expect(
      checkAdmission({
        entry: themeEntry,
        requiredReceipts: [requirement("theme-invariance", "bpmn-canvas", "1.0.0")],
        receipts: [themeOk],
      }),
    ).toEqual({ admitted: true });
    const wrongStyled = { ...themeOk, styledProfilePin: pin("other") } as Receipt;
    expect(
      checkAdmission({
        entry: themeEntry,
        requiredReceipts: [requirement("theme-invariance", "bpmn-canvas", "1.0.0")],
        receipts: [wrongStyled],
      }).admitted,
    ).toBe(false);
  });

  it("h2a and mem admit retained checks with pinned revision; oracle role and drift refuse", () => {
    const h2aOk: Receipt = {
      ...(receiptBase({ libraryId: "h2a", libraryVersion: "1.0.0", validatorRole: "retained-check", transitionQualification: undefined }) as unknown as Receipt),
      receiptKind: "h2a-vocabulary",
      protocolPin: pin("generic"),
      sourceRevision: "rev-1",
      fixtureDigest: B64,
      severityPolicyDigest: null,
      ruleVerdicts: [],
    } as Receipt;
    const h2aEntry = admissionEntry({ selections: [], ruleSheetPins: [], sourceRevision: "rev-1" });
    expect(
      checkAdmission({
        entry: h2aEntry,
        requiredReceipts: [requirement("h2a-vocabulary", "h2a", "1.0.0")],
        receipts: [h2aOk],
      }),
    ).toEqual({ admitted: true });
    const oracleRole = {
      ...h2aOk,
      validatorRole: "transitional-oracle",
      transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 },
    } as Receipt;
    expect(
      checkAdmission({
        entry: h2aEntry,
        requiredReceipts: [requirement("h2a-vocabulary", "h2a", "1.0.0")],
        receipts: [oracleRole],
      }).admitted,
    ).toBe(false);
    const wrongRevision = { ...h2aOk, sourceRevision: "rev-2" } as Receipt;
    expect(
      checkAdmission({
        entry: h2aEntry,
        requiredReceipts: [requirement("h2a-vocabulary", "h2a", "1.0.0")],
        receipts: [wrongRevision],
      }).admitted,
    ).toBe(false);
    expect(
      checkAdmission({
        entry: admissionEntry({ selections: [], ruleSheetPins: [] }),
        requiredReceipts: [requirement("h2a-vocabulary", "h2a", "1.0.0")],
        receipts: [h2aOk],
      }).admitted,
    ).toBe(false);
    const memOk: Receipt = {
      ...(receiptBase({ libraryId: "mem", libraryVersion: "1.0.0", validatorRole: "retained-check", transitionQualification: undefined }) as unknown as Receipt),
      receiptKind: "mem-descriptor",
      descriptorPin: pin("generic"),
      fixtureDigest: B64,
      severityPolicyDigest: null,
      ruleVerdicts: [],
    } as Receipt;
    expect(
      checkAdmission({
        entry: admissionEntry({ selections: [], ruleSheetPins: [] }),
        requiredReceipts: [requirement("mem-descriptor", "mem", "1.0.0")],
        receipts: [memOk],
      }),
    ).toEqual({ admitted: true });
  });

  it("private entries admit through the owner-side path only", () => {
    const ownerSelection = {
      phase: "import",
      readinessPolicy: "draft",
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
      rules: [{ ruleId: "label-required", severity: "warn" }],
    };
    const privateEntry = admissionEntry({ selections: [], visibility: "private", ownerSelection });
    const privateReceipt = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        compiledLintEvidence: { scope: "private-reference", ownerReceiptRef: "owner-ref-1" },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({
        entry: privateEntry,
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [privateReceipt],
      }),
    ).toEqual({ admitted: true });
    // Public selections on a private entry refuse.
    expect(
      checkAdmission({
        entry: admissionEntry({ visibility: "private", ownerSelection }),
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [privateReceipt],
      }).admitted,
    ).toBe(false);
    // Missing owner selection binding refuses.
    expect(
      checkAdmission({
        entry: admissionEntry({ selections: [], visibility: "private" }),
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [privateReceipt],
      }).admitted,
    ).toBe(false);
    // Owner severity drift refuses even with matching result evidence.
    const drifted = admissionEntry({
      selections: [],
      visibility: "private",
      ownerSelection: { ...ownerSelection, severityPolicyDigest: severityPolicyDigestOf("import", "draft", ERROR) },
    });
    expect(
      checkAdmission({
        entry: drifted,
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [privateReceipt],
      }).admitted,
    ).toBe(false);
    // A public-scope evidence on a private entry refuses.
    expect(
      checkAdmission({
        entry: privateEntry,
        requiredReceipts: [requirement("bpmn-parity")],
        receipts: [bpmnParityReceipt()],
      }).admitted,
    ).toBe(false);
  });
});

// --- D-B7: no compose over TRK/H2A/MEM ---

describe("D-B7 operation-not-applicable", () => {
  it("compose over TRK, H2A, MEM refuses; DIA composes", () => {
    for (const family of ["TRK", "H2A", "MEM"]) {
      const diagnostics = composeApplicability(family);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.code).toBe("operation-not-applicable");
      expect(diagnostics[0]!.severity).toBe("error");
    }
    expect(composeApplicability("DIA")).toEqual([]);
  });

  it("derive and merge applicability follow §§3.4/4.2", () => {
    expect(deriveApplicability("TRK")[0]!.code).toBe("operation-not-applicable");
    expect(deriveApplicability("H2A")[0]!.code).toBe("operation-not-applicable");
    expect(deriveApplicability("DIA")).toEqual([]);
    expect(deriveApplicability("MEM")).toEqual([]);
    expect(deriveApplicability("MEM", true)[0]!.code).toBe("operation-not-applicable");
    expect(mergeApplicability("MEM")[0]!.code).toBe("operation-not-applicable");
    expect(mergeApplicability("DIA")).toEqual([]);
  });
});

// --- §5.5 admission: order-independent set matching ---

const ERROR_SETTINGS = [{ classification: "readiness", rule: "label-required", severity: "error" }] as CompiledSetting[];
const ACCEPT_DIGEST = severityPolicyDigestOf("import", "accept", ERROR_SETTINGS);

function dualSelectionEntry(): AdmissionEntry {
  return admissionEntry({
    selections: [
      passingSelection(),
      {
        phase: "import",
        readinessPolicy: "accept",
        settings: ERROR_SETTINGS,
        severityPolicyDigest: ACCEPT_DIGEST,
        rules: [{ ruleId: "label-required", severity: "error" }],
      },
    ],
  });
}

function scopedParityReceipt(policy: "draft" | "accept"): Receipt {
  const settings = policy === "draft" ? (WARN as CompiledSetting[]) : ERROR_SETTINGS;
  const digest = policy === "draft" ? severityPolicyDigestOf("import", "draft", WARN) : ACCEPT_DIGEST;
  const severity = policy === "draft" ? "warn" : "error";
  return bpmnParityReceipt({
    proofBindings: {
      ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
      severityPolicyDigest: digest,
      compiledLintEvidence: {
        scope: "public",
        compiledOptions: {
          mechanismVersion: "1",
          profileDigest: A64,
          phase: "import",
          readinessPolicy: policy,
          compiledRules: [],
          bindings: [],
          severityPolicyDigest: digest,
        },
        settings,
      },
    },
    ruleVerdicts: [{ ruleId: "label-required", severity, verdict: "pass", parity: "proven" }],
  });
}

describe("§5.5 order-independent matching", () => {
  const draftReq = requirement("bpmn-parity", "bpmn-canvas", "1.0.0", { readinessPolicy: "draft" });
  const acceptReq = requirement("bpmn-parity", "bpmn-canvas", "1.0.0", { readinessPolicy: "accept" });

  it("draft and accept receipts admit in either order, for either requirement order", () => {
    const draft = scopedParityReceipt("draft");
    const accept = scopedParityReceipt("accept");
    for (const receipts of [[draft, accept], [accept, draft]]) {
      for (const requiredReceipts of [[draftReq, acceptReq], [acceptReq, draftReq]]) {
        expect(checkAdmission({ entry: dualSelectionEntry(), requiredReceipts, receipts })).toEqual({
          admitted: true,
        });
      }
    }
  });

  it("a scoped requirement never consumes a receipt from the other scope", () => {
    const draft = scopedParityReceipt("draft");
    expect(
      checkAdmission({ entry: dualSelectionEntry(), requiredReceipts: [acceptReq], receipts: [draft] }).admitted,
    ).toBe(false);
    // The phase side of the scope behaves the same way.
    const releaseReq = requirement("bpmn-parity", "bpmn-canvas", "1.0.0", { phase: "release" });
    expect(
      checkAdmission({ entry: dualSelectionEntry(), requiredReceipts: [releaseReq], receipts: [draft] }).admitted,
    ).toBe(false);
  });
});

// --- §5.5 admission: duplicate verdicts and native severity derivation ---

describe("§5.5 verdict rows and effective severity", () => {
  it("duplicate verdict rows for one rule refuse", () => {
    const duplicated = bpmnParityReceipt({
      ruleVerdicts: [
        { ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" },
        { ruleId: "label-required", severity: "warn", verdict: "diagnostic", parity: "proven" },
      ],
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [duplicated] })
        .admitted,
    ).toBe(false);
  });

  it("numeric settings derive the effective severity; unknown severities refuse", () => {
    const numeric = [{ classification: "readiness", rule: "label-required", severity: 2 }] as unknown as CompiledSetting[];
    const numericDigest = severityPolicyDigestOf("import", "draft", numeric);
    const numericEntry = admissionEntry({
      selections: [
        {
          phase: "import",
          readinessPolicy: "draft",
          settings: numeric,
          severityPolicyDigest: numericDigest,
          rules: [{ ruleId: "label-required", severity: "error" }],
        },
      ],
    });
    const numericReceipt = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        severityPolicyDigest: numericDigest,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: numericDigest,
          },
          settings: numeric,
        },
      },
      ruleVerdicts: [{ ruleId: "label-required", severity: "error", verdict: "pass", parity: "proven" }],
    });
    expect(
      checkAdmission({ entry: numericEntry, requiredReceipts: [requirement("bpmn-parity")], receipts: [numericReceipt] }),
    ).toEqual({ admitted: true });
    // The same row labelled warn against the numeric error setting refuses.
    const mislabelled = admissionEntry({
      selections: [{ ...numericEntry.selections[0]!, rules: [{ ruleId: "label-required", severity: "warn" }] }],
    });
    expect(
      checkAdmission({ entry: mislabelled, requiredReceipts: [requirement("bpmn-parity")], receipts: [numericReceipt] })
        .admitted,
    ).toBe(false);
  });

  it("profile:-prefixed setting rows bind bare rule ids; missing rows and bad values refuse", () => {
    const prefixed = [{ classification: "readiness", rule: "profile:label-required", severity: "warn" }] as CompiledSetting[];
    const prefixedDigest = severityPolicyDigestOf("import", "draft", prefixed);
    const prefixedEntry = admissionEntry({
      selections: [
        {
          phase: "import",
          readinessPolicy: "draft",
          settings: prefixed,
          severityPolicyDigest: prefixedDigest,
          rules: [{ ruleId: "label-required", severity: "warn" }],
        },
      ],
    });
    const prefixedReceipt = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        severityPolicyDigest: prefixedDigest,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: prefixedDigest,
          },
          settings: prefixed,
        },
      },
    });
    expect(
      checkAdmission({ entry: prefixedEntry, requiredReceipts: [requirement("bpmn-parity")], receipts: [prefixedReceipt] }),
    ).toEqual({ admitted: true });
    // A selected rule with no setting row has no bound effective severity.
    const unsettled = admissionEntry({
      selections: [{ ...prefixedEntry.selections[0]!, rules: [{ ruleId: "ghost-rule", severity: "warn" }] }],
    });
    expect(
      checkAdmission({ entry: unsettled, requiredReceipts: [requirement("bpmn-parity")], receipts: [prefixedReceipt] })
        .admitted,
    ).toBe(false);
    // An out-of-range numeric severity is not an effective severity.
    const wild = [{ classification: "readiness", rule: "label-required", severity: 4 }] as unknown as CompiledSetting[];
    const wildReceipt = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        compiledLintEvidence: {
          scope: "public",
          compiledOptions: {
            mechanismVersion: "1",
            profileDigest: A64,
            phase: "import",
            readinessPolicy: "draft",
            compiledRules: [],
            bindings: [],
            severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
          },
          settings: wild,
        },
      },
    });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [wildReceipt] })
        .admitted,
    ).toBe(false);
  });
});

// --- §5.5 admission: corpus authority, transition qualification, private families ---

describe("§5.5 authority, transition qualification and private families", () => {
  it("corpus authority tag and manifest digest bind the entry corpus", () => {
    const forgedTag = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        corpusAuthority: { tag: "other-corpus-v9.9.9", manifestDigest: B64 },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [forgedTag] })
        .admitted,
    ).toBe(false);
    const forgedHash = bpmnParityReceipt({
      proofBindings: {
        ...(bpmnParityReceipt() as unknown as { proofBindings: Record<string, unknown> }).proofBindings,
        corpusAuthority: { tag: "profile-corpus-v1.0.0", manifestDigest: A64 },
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [forgedHash] })
        .admitted,
    ).toBe(false);
  });

  it("transition qualification is a closed role/claim union with validated values", () => {
    // Oracle without witness evidence refuses.
    const bare = { ...bpmnParityReceipt(), transitionQualification: undefined } as unknown as Receipt;
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [bare] })
        .admitted,
    ).toBe(false);
    // Oracle with a malformed matrix digest refuses.
    const badMatrix = bpmnParityReceipt({
      transitionQualification: { claim: "oracle-witness", parityMatrixDigest: "zzz" },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [badMatrix] })
        .admitted,
    ).toBe(false);
    // Retained checks carry no transition claim.
    const retainedClaimed = {
      ...(receiptBase({ libraryId: "mem", libraryVersion: "1.0.0", validatorRole: "retained-check" }) as unknown as Receipt),
      receiptKind: "mem-descriptor",
      descriptorPin: pin("generic"),
      fixtureDigest: B64,
      severityPolicyDigest: null,
      ruleVerdicts: [],
    } as Receipt;
    expect(
      checkAdmission({
        entry: admissionEntry({ selections: [], ruleSheetPins: [] }),
        requiredReceipts: [requirement("mem-descriptor", "mem", "1.0.0")],
        receipts: [retainedClaimed],
      }).admitted,
    ).toBe(false);
    // Qualified without reference evidence refuses; with bad pin or empty
    // gate reference refuses; with open parity refuses.
    const qualifiedBare = bpmnParityReceipt({ validatorRole: "qualified-ds-execution" });
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [qualifiedBare] })
        .admitted,
    ).toBe(false);
    const qualifiedBadPin = bpmnParityReceipt({
      validatorRole: "qualified-ds-execution",
      transitionQualification: {
        claim: "reference-qualified",
        parityMatrixDigest: B64,
        qualifiedExecutorPin: pin("exec", "1.0.0", "zzz"),
        gateEvidenceRef: "gate-1",
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [qualifiedBadPin] })
        .admitted,
    ).toBe(false);
    const qualifiedNoGate = bpmnParityReceipt({
      validatorRole: "qualified-ds-execution",
      transitionQualification: {
        claim: "reference-qualified",
        parityMatrixDigest: B64,
        qualifiedExecutorPin: pin("exec"),
        gateEvidenceRef: "",
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [qualifiedNoGate] })
        .admitted,
    ).toBe(false);
    const qualifiedOpen = bpmnParityReceipt({
      validatorRole: "qualified-ds-execution",
      transitionQualification: {
        claim: "reference-qualified",
        parityMatrixDigest: B64,
        qualifiedExecutorPin: pin("exec"),
        gateEvidenceRef: "gate-1",
      },
      ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "pass", parity: "open" }],
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [qualifiedOpen] })
        .admitted,
    ).toBe(false);
    // Full reference qualification with proven parity admits.
    const qualified = bpmnParityReceipt({
      validatorRole: "qualified-ds-execution",
      transitionQualification: {
        claim: "reference-qualified",
        parityMatrixDigest: B64,
        qualifiedExecutorPin: pin("exec"),
        gateEvidenceRef: "gate-1",
      },
    } as Partial<Extract<Receipt, { receiptKind: "bpmn-parity" }>>);
    expect(
      checkAdmission({ entry: admissionEntry(), requiredReceipts: [requirement("bpmn-parity")], receipts: [qualified] }),
    ).toEqual({ admitted: true });
  });

  it("private family receipts bind through the owner-side selection", () => {
    const ownerSelection = {
      phase: "import",
      readinessPolicy: "draft",
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
      rules: [{ ruleId: "label-required", severity: "warn" }],
    };
    const privateEntry = admissionEntry({ selections: [], visibility: "private", ownerSelection });
    const familyReceipt: Receipt = {
      receiptKind: "family-corpus",
      corpusDigest: B64,
      libraryId: "engram",
      libraryVersion: "1.0.0",
      validatorRole: "retained-check",
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      family: "ENG",
      fixtureDigest: B64,
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
      ruleVerdicts: [{ ruleId: "label-required", severity: "warn", verdict: "pass", parity: "proven" }],
    };
    expect(
      checkAdmission({
        entry: privateEntry,
        requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")],
        receipts: [familyReceipt],
      }),
    ).toEqual({ admitted: true });
    // Replacing the policy binding with null and removing verdicts admits
    // nothing while rule sheets are present.
    const stripped = { ...familyReceipt, severityPolicyDigest: null, ruleVerdicts: [] } as Receipt;
    expect(
      checkAdmission({
        entry: privateEntry,
        requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")],
        receipts: [stripped],
      }).admitted,
    ).toBe(false);
    // An owner digest drift refuses with matching result evidence.
    const drifted = admissionEntry({
      selections: [],
      visibility: "private",
      ownerSelection: { ...ownerSelection, severityPolicyDigest: severityPolicyDigestOf("import", "draft", ERROR_SETTINGS) },
    });
    expect(
      checkAdmission({
        entry: drifted,
        requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")],
        receipts: [familyReceipt],
      }).admitted,
    ).toBe(false);
    // A private entry without sheets admits the explicit null binding.
    const sheetless = admissionEntry({ selections: [], ruleSheetPins: [], visibility: "private" });
    const empty: Receipt = { ...familyReceipt, severityPolicyDigest: null, ruleVerdicts: [] };
    expect(
      checkAdmission({
        entry: sheetless,
        requiredReceipts: [requirement("family-corpus", "engram", "1.0.0")],
        receipts: [empty],
      }),
    ).toEqual({ admitted: true });
  });

  it("mechanism and bijection arms bind their policy digest; null with sheets refuses", () => {
    const mechEntry = admissionEntry({ compatibilityMatrixVersion: "3" });
    const mechOk: Receipt = {
      ...(receiptBase() as unknown as Receipt),
      receiptKind: "mechanism-compat",
      compatibilityMatrixVersion: "3",
      caseVerdicts: [{ caseId: "m1" }],
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
    } as Receipt;
    expect(
      checkAdmission({
        entry: mechEntry,
        requiredReceipts: [requirement("mechanism-compat", "bpmn-canvas", "1.0.0")],
        receipts: [mechOk],
      }),
    ).toEqual({ admitted: true });
    const mechNull = { ...mechOk, severityPolicyDigest: null } as Receipt;
    expect(
      checkAdmission({
        entry: mechEntry,
        requiredReceipts: [requirement("mechanism-compat", "bpmn-canvas", "1.0.0")],
        receipts: [mechNull],
      }).admitted,
    ).toBe(false);
    const mechUnknown = { ...mechOk, severityPolicyDigest: B64 } as Receipt;
    expect(
      checkAdmission({
        entry: mechEntry,
        requiredReceipts: [requirement("mechanism-compat", "bpmn-canvas", "1.0.0")],
        receipts: [mechUnknown],
      }).admitted,
    ).toBe(false);
    // Bijection with full coverage and a bound digest admits; null with
    // sheets refuses.
    const fullCoverage: Receipt = {
      receiptKind: "bpmn-bijection",
      corpusDigest: B64,
      libraryId: "d2d",
      libraryVersion: "1.0.0",
      validatorRole: "transitional-oracle",
      transitionQualification: { claim: "oracle-witness", parityMatrixDigest: B64 },
      verdict: "pass",
      issuedAt: "2026-10-26",
      evaluatedStack: {
        stack: [pin("generic")],
        pinsDigest: pinsDigestOf({ layers: [pin("generic")] }),
        resultEvidence: { evidenceState: "resolved", digest: A64 },
      },
      descriptorCoverage: { covered: 4, total: 4 },
      roundTripEvidenceRef: "rt",
      moddleTestPin: pin("bpmn-moddle"),
      severityPolicyDigest: severityPolicyDigestOf("import", "draft", WARN),
    };
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-bijection", "d2d", "1.0.0")],
        receipts: [fullCoverage],
      }),
    ).toEqual({ admitted: true });
    const bijectionNull = { ...fullCoverage, severityPolicyDigest: null } as Receipt;
    expect(
      checkAdmission({
        entry: admissionEntry(),
        requiredReceipts: [requirement("bpmn-bijection", "d2d", "1.0.0")],
        receipts: [bijectionNull],
      }).admitted,
    ).toBe(false);
    // A null policy digest with no sheets admits on the bijection arm too.
    expect(
      checkAdmission({
        entry: admissionEntry({ selections: [], ruleSheetPins: [] }),
        requiredReceipts: [requirement("bpmn-bijection", "d2d", "1.0.0")],
        receipts: [bijectionNull],
      }),
    ).toEqual({ admitted: true });
  });
});

// --- S-COMPILED pinned validator: phase, uniqueness, type, closure ---

describe("pinned compiled validation", () => {
  const rule = {
    id: "r",
    phase: "import",
    select: {},
    assert: {},
    code: "c",
    message: "m",
    classification: "readiness",
  };
  const options = {
    mechanismVersion: "1" as const,
    profileDigest: A64,
    phase: "import",
    readinessPolicy: "draft",
    compiledRules: [rule],
    bindings: [{ ownerId: "o", role: "r", targetId: "t" }],
    severityPolicyDigest: A64,
  };

  it("accepts the pinned shape and refuses wrong-phase, duplicate and mistyped rules", () => {
    assertValidCompiledOptions(options);
    expect(() => assertValidCompiledOptions({ ...options, compiledRules: [{ ...rule, phase: "release" }] })).toThrow(
      "compiled-rule-wrong-phase",
    );
    expect(() => assertValidCompiledOptions({ ...options, compiledRules: [rule, { ...rule }] })).toThrow(
      "compiled-rule-duplicate",
    );
    expect(() => assertValidCompiledOptions({ ...options, compiledRules: [{ ...rule, code: 42 }] })).toThrow(
      "compiled-rule-invalid:code",
    );
    expect(() => assertValidCompiledOptions({ ...options, compiledRules: [{ ...rule, classification: 7 }] })).toThrow(
      "compiled-rule-invalid:type",
    );
    expect(() => assertValidCompiledOptions({ ...options, phase: "draft" })).toThrow("compiled-options-invalid:phase");
    expect(() => assertValidCompiledOptions({ ...options, readinessPolicy: "review" })).toThrow(
      "compiled-options-invalid:readinessPolicy",
    );
    expect(() => assertValidCompiledOptions({ ...options, profileDigest: "zzz" })).toThrow(
      "compiled-options-invalid:profileDigest",
    );
  });

  it("closes bindings: exact keys, non-empty values, unique owner pairs", () => {
    expect(() => assertValidCompiledOptions({ ...options, bindings: [{ ownerId: "o", role: "r" }] })).toThrow(
      "compiled-binding",
    );
    expect(() => assertValidCompiledOptions({ ...options, bindings: [{ ownerId: "", role: "r", targetId: "t" }] })).toThrow(
      "compiled-binding-missing-field",
    );
    expect(() =>
      assertValidCompiledOptions({
        ...options,
        bindings: [
          { ownerId: "o", role: "r", targetId: "t" },
          { ownerId: "o", role: "r", targetId: "other" },
        ],
      }),
    ).toThrow("compiled-binding-duplicate");
    expect(() =>
      assertValidCompiledOptions({ ...options, compiledRules: [{ ...rule, bindings: [{ ownerId: "o", role: "r", targetId: "t", extra: 1 }] }] }),
    ).toThrow("compiled-binding-forbidden-field");
  });
});

// --- §2.1/§6.2 native report boundary ---

describe("native report boundary", () => {
  it("accepts the well-formed native report", () => {
    expect(() => assertValidNativeReport(sampleReport())).not.toThrow();
  });

  it("refuses duplicates, disorder, unknown fields and presence violations", () => {
    const report = sampleReport();
    const duplicated = { ...report, entries: [report.entries[0], report.entries[0]] };
    expect(() => assertValidNativeReport(duplicated)).toThrow("native-report-duplicate-entry");
    expect(() => reportToDiagnostics(duplicated, (e) => e.ruleId)).toThrow("native-report-duplicate-entry");
    const reordered = { ...report, entries: [...report.entries].reverse() };
    expect(() => assertValidNativeReport(reordered)).toThrow("native-report-out-of-order");
    const extraTop = { ...report, invented: true };
    expect(() => assertValidNativeReport(extraTop)).toThrow("native-report-report-forbidden:invented");
    const extraEntry = {
      ...report,
      entries: [{ ...report.entries[1], invented: 1 }, report.entries[0]],
    };
    expect(() => assertValidNativeReport(extraEntry)).toThrow("native-report-entry-forbidden:invented");
    const badPresence = {
      ...report,
      entries: [report.entries[0], { ...report.entries[1], beforePresent: true }],
    };
    expect(() => assertValidNativeReport(badPresence)).toThrow("native-report-invalid:entry.before-presence");
    const lossMisplaced = {
      ...report,
      entries: [report.entries[0], { ...report.entries[1], classification: "readiness", lossClass: "layout" }],
    };
    expect(() => assertValidNativeReport(lossMisplaced)).toThrow("native-report-forbidden:entry.lossClass");
  });

  it("refuses bad literals, pointers, identity, revisions, maps and artifacts", () => {
    const report = sampleReport();
    const badStage = { ...report, entries: [{ ...report.entries[0], stage: "draft" }, report.entries[1]] };
    expect(() => assertValidNativeReport(badStage)).toThrow("native-report-invalid:entry.stage");
    const badPointer = {
      ...report,
      entries: [{ ...report.entries[0], source: { domain: "tree", pointer: "nope", targetId: null, provenance: "exact" } }, report.entries[1]],
    };
    expect(() => assertValidNativeReport(badPointer)).toThrow("native-report-invalid:entry.source");
    const emptyOperation = { ...report, operation: "" };
    expect(() => assertValidNativeReport(emptyOperation)).toThrow("native-report-invalid:report.operation");
    const badVersion = { ...report, reportVersion: "3" };
    expect(() => assertValidNativeReport(badVersion)).toThrow("native-report-invalid:reportVersion");
    const badIdentity = { ...report, sourceIdentity: { mechanismVersion: "2" } };
    expect(() => assertValidNativeReport(badIdentity)).toThrow("native-report-report.sourceIdentity-missing");
    const badRevision = { ...report, inputRevision: "zzz" };
    expect(() => assertValidNativeReport(badRevision)).toThrow("native-report-invalid:report.inputRevision");
    const unsortedMap = {
      ...report,
      idMap: [
        { sourceId: "b", resultId: "y", domain: "export" },
        { sourceId: "a", resultId: "x", domain: "export" },
      ],
    };
    expect(() => assertValidNativeReport(unsortedMap)).toThrow("native-report-idMap-unsorted");
    const unreachableLoss = { ...report, artifacts: [] };
    expect(() => assertValidNativeReport(unreachableLoss)).toThrow("native-report-loss-unreachable:0");
    const unsupportedDigest = {
      ...report,
      artifacts: [{ format: "bpmn", capability: "unsupported", digest: A64, entryIndexes: [0] }],
    };
    expect(() => assertValidNativeReport(unsupportedDigest)).toThrow("native-report-artifact-digest-unsupported");
    const nonIncreasing = {
      ...report,
      artifacts: [{ format: "bpmn", capability: "structural", entryIndexes: [1, 1] }],
    };
    expect(() => assertValidNativeReport(nonIncreasing)).toThrow("native-report-invalid:artifact.entryIndex-order");
    const outOfRange = {
      ...report,
      artifacts: [{ format: "bpmn", capability: "structural", entryIndexes: [7] }],
    };
    expect(() => assertValidNativeReport(outOfRange)).toThrow("native-report-invalid:artifact.entryIndex-range");
  });
});

// --- P-DELTA operation shapes ---

describe("P-DELTA operation shapes", () => {
  const shell = {
    base: pin("generic"),
    mappingRef: null,
    retiredFixtures: [],
    retiredRules: [],
  };

  it("rename carries newName in the hashed bytes; add never does", () => {
    const renamed = deltaPreimage({
      ...shell,
      operations: [{ op: "rename-with-mapping", subject: "a", declarationDigest: B64, newName: "b" }],
    });
    expect(canonicalBytes(renamed)).toContain('"newName":"b"');
    const added = deltaPreimage({ ...shell, operations: [{ op: "add", subject: "t", declarationDigest: B64 }] });
    expect(canonicalBytes(added)).not.toContain("newName");
    expect(deltaDigestOf({ ...shell, operations: [{ op: "rename-with-mapping", subject: "a", declarationDigest: B64, newName: "b" }] })).not.toBe(
      deltaDigestOf({ ...shell, operations: [{ op: "rename-with-mapping", subject: "a", declarationDigest: B64, newName: "c" }] }),
    );
  });

  it("rename without newName, add with newName and unknown ops refuse before hashing", () => {
    expect(() =>
      deltaPreimage({ ...shell, operations: [{ op: "rename-with-mapping", subject: "a", declarationDigest: B64 }] as unknown as DeltaOperationDigest }),
    ).toThrow("delta-op-newname-required");
    expect(() =>
      deltaPreimage({ ...shell, operations: [{ op: "add", subject: "t", declarationDigest: B64, newName: "x" }] as unknown as DeltaOperationDigest }),
    ).toThrow("delta-op-newname-forbidden:add");
    expect(() =>
      deltaPreimage({ ...shell, operations: [{ op: "copy", subject: "t", declarationDigest: B64 }] as unknown as DeltaOperationDigest }),
    ).toThrow("unknown-delta-operation");
    expect(() =>
      deltaPreimage({ ...shell, operations: [{ op: "narrow", subject: "", declarationDigest: B64 }] }),
    ).toThrow("delta-op-invalid:subject");
  });
});

// --- Sol r2 #11 mutation regressions: one isolated mutation per omitted input ---

describe("Sol r2 #11 mutation regressions", () => {
  it("R1 dropping one rule-sheet pin changes pinsDigest", () => {
    const layers = [pin("generic")];
    const withSheets = pinsDigestOf({ layers, ruleSheets: [pin("sheet-a"), pin("sheet-b")] });
    expect(pinsDigestOf({ layers, ruleSheets: [pin("sheet-a")] })).not.toBe(withSheets);
    expect(pinsDigestOf({ layers })).not.toBe(withSheets);
  });

  it("R2 dropping the delta base changes the delta digest", () => {
    const shell = {
      mappingRef: null,
      operations: [{ op: "add" as const, subject: "t", declarationDigest: B64 }],
      retiredFixtures: [],
      retiredRules: [],
    };
    const base = deltaDigestOf({ ...shell, base: pin("generic") });
    expect(deltaDigestOf({ ...shell, base: pin("generic", "2.0.0") })).not.toBe(base);
    expect(deltaDigestOf({ ...shell, base: pin("other") })).not.toBe(base);
  });

  it("R3 dropping a mapping childRole changes the mapping digest", () => {
    const input = {
      mappingId: "m",
      version: "1.0.0",
      entries: [{ kind: "hierarchy" as const, relationId: "rel", chosenShape: "dag" as const, parentRole: "p", childRole: "c" }],
    };
    const base = mappingDigestOf(input);
    expect(
      mappingDigestOf({
        ...input,
        entries: [{ kind: "hierarchy", relationId: "rel", chosenShape: "dag", parentRole: "p", childRole: "other" }],
      }),
    ).not.toBe(base);
  });

  it("R4 dropping an endpoint role changes the mapping digest", () => {
    const input = {
      mappingId: "m",
      version: "1.0.0",
      entries: [{ kind: "endpoint" as const, from: "rel", to: "rel2", role: "source" }],
    };
    const base = mappingDigestOf(input);
    expect(
      mappingDigestOf({ ...input, entries: [{ kind: "endpoint", from: "rel", to: "rel2", role: "target" }] }),
    ).not.toBe(base);
  });

  it("R5 dropping a result-row severity changes resultDigest", () => {
    const base = resultDigestOf(RESULT_BASE);
    const [row] = RESULT_BASE.effectiveRuleSet;
    expect(
      resultDigestOf({ ...RESULT_BASE, effectiveRuleSet: [{ ...row!, severity: "error" }] }),
    ).not.toBe(base);
  });

  it("R6 dropping per-rule bindings changes resultDigest", () => {
    const base = resultDigestOf(RESULT_BASE);
    const [row] = RESULT_BASE.effectiveRuleSet;
    const bound = {
      ...row!,
      ruleBody: { ...(row!.ruleBody as Record<string, unknown>), bindings: [{ ownerId: "o", role: "r", targetId: "t" }] },
    };
    const unbound = { ...row!, ruleBody: { ...(row!.ruleBody as Record<string, unknown>) } };
    expect(resultDigestOf({ ...RESULT_BASE, effectiveRuleSet: [bound] })).not.toBe(
      resultDigestOf({ ...RESULT_BASE, effectiveRuleSet: [unbound] }),
    );
  });
});
