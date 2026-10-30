// diagram-view-schema@2: migration, composition and shape parity.
// SPEC-diagram-view-schema-v2 §§4/6, owner decisions F2-a (separate list),
// H1 (key derivation), G1 (separate view stage before profile migration).
// Ajv stays the test-only independent oracle over the exact governed values.
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";

import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import {
  DIAGRAM_VIEW_SCHEMA,
  DIAGRAM_VIEW_SCHEMA_V2,
  resolveViewSchemaPin,
  resolveViewSchemaVersion,
} from "../src/ontology-guardian/diagram-schemas.js";
import {
  checkGovernedViewShape,
  checkSummaryShapeV1,
  checkSummaryShapeV2,
  checkViewShapeV1,
  checkViewShapeV2,
} from "../src/ontology-guardian/diagram-view-shape.js";
import {
  adoptViewSchemaV2,
  migrateRetainedViewsV1ToV2,
  migrateViewSchemaV1ToV2,
} from "../src/ontology-guardian/diagram-view-migration.js";
import type { BoundaryPreflightRefusal } from "../src/ontology-guardian/diagram-view-migration.js";
import {
  migrateArchimateV1ToV2,
  migrateArchimateWithViewsV1ToV2,
  migrateGenericV1ToV2,
  migrateGenericWithViewsV1ToV2,
  migrateUmlV1ToV2,
  migrateUmlWithViewsV1ToV2,
} from "../src/ontology-guardian/diagram-migrations.js";
import type { MigDocument, MigView } from "../src/ontology-guardian/diagram-migrations.js";

const V1 = DIAGRAM_VIEW_SCHEMA.pin;
const V2 = DIAGRAM_VIEW_SCHEMA_V2.pin;
const VIEW_PINS = { source: V1, target: V2 };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateV1 = ajv.compile(DIAGRAM_VIEW_SCHEMA.schema);
const validateV2 = ajv.compile(DIAGRAM_VIEW_SCHEMA_V2.schema);

function minimalView(summaryLabels?: Record<string, unknown>): Record<string, unknown> {
  return {
    viewId: "view:a",
    semanticDocumentId: "document:test-1",
    revision: 0,
    entityOccurrences: {
      "occurrence:a": { id: "occurrence:a", entity: "entity:a", geometry: { x: 0, y: 0, width: 460, height: 200 } },
    },
    relationOccurrences: {},
    portOccurrences: {},
    groups: {},
    filters: [],
    presentation: { camera: { x: 0, y: 0, zoom: 1 } },
    ...(summaryLabels === undefined ? {} : { summaryLabels }),
  };
}

const completeSummary = (): Record<string, unknown> => ({
  id: "sum:a", sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a",
  label: "Kept", relationIds: ["relation:r"],
});

/** §6.1: generic@1 document whose summary lacks id and occurrence list. */
function idLessDocument(): MigDocument {
  return {
    documentId: "document:generic-1", schemaVersion: { major: 1, minor: 1 }, revision: 0,
    profileRefs: ["generic@1"],
    entities: {
      "entity:node-a": {
        id: "entity:node-a", profile: "generic@1", type: "node",
        attributes: { name: { kind: "text", value: "A" } },
      },
    },
    relations: {}, ports: {}, typeDefinitions: {}, resources: {}, extensions: [],
    views: [{
      viewId: "view:a", semanticDocumentId: "document:generic-1", revision: 0,
      entityOccurrences: {
        "occurrence:a": { id: "occurrence:a", entity: "entity:node-a", geometry: { x: 0, y: 0, width: 460, height: 200 } },
      },
      relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [],
      presentation: { camera: { x: 0, y: 0, zoom: 1 } },
      summaryLabels: {
        "sum:a": {
          sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a",
          label: "Kept", relationIds: ["relation:r"],
        },
      },
    } as unknown as MigView],
  };
}

describe("exact pin resolution (no fallback, no inference)", () => {
  it("resolves both versions by exact pin and refuses the rest", () => {
    expect(resolveViewSchemaPin(V1)).toBe(DIAGRAM_VIEW_SCHEMA);
    expect(resolveViewSchemaPin(V2)).toBe(DIAGRAM_VIEW_SCHEMA_V2);
    expect(resolveViewSchemaVersion("1")).toBe(DIAGRAM_VIEW_SCHEMA);
    expect(resolveViewSchemaVersion("2")).toBe(DIAGRAM_VIEW_SCHEMA_V2);
    expect(resolveViewSchemaVersion("3")).toBeUndefined();
    expect(resolveViewSchemaVersion("")).toBeUndefined();
    expect(resolveViewSchemaPin({ ...V1, version: "3" })).toBeUndefined();
    expect(resolveViewSchemaPin({ ...V1, contentDigest: "0".repeat(64) })).toBeUndefined();
    expect(resolveViewSchemaPin({ ...V2, version: "1" })).toBeUndefined();
    expect(resolveViewSchemaPin({ id: "diagram-presentation", version: "1", contentDigest: V1.contentDigest })).toBeUndefined();
  });
});

describe("§6.1 lot-2 fixture: exact @1 view-migration stage", () => {
  it("derives sum:a from its map key with one declared addition", () => {
    const doc = idLessDocument();
    const bytes = canonicalBytes(doc.views![0]);
    const report = migrateViewSchemaV1ToV2(doc.views![0], VIEW_PINS);
    if ("boundary" in report || report.outcome !== "ok") throw new Error("view stage must succeed");
    expect(report.migrationId).toBe("engram:migration-view-schema-1-2");
    expect(report.from).toEqual(V1);
    expect(report.to).toEqual(V2);
    expect(report.originalSha256).toBe(sha256Hex(bytes));
    expect(report.operations).toEqual([{
      path: "summaryLabels.sum:a.id", action: "derive-summary-id-from-key",
      detail: "H1: copy the existing map key into the absent own id",
    }]);
    expect(report.unmigrated).toEqual([]);
    expect((report.target as Record<string, Record<string, Record<string, unknown>>>)["summaryLabels"]!["sum:a"]).toMatchObject({
      id: "sum:a", label: "Kept", relationIds: ["relation:r"],
    });
    expect(validateV2(report.target)).toBe(true);
    expect(checkViewShapeV2(report.target)).toBeNull();
    expect(validateV1(report.target)).toBe(true);
    // The original is retained byte for byte; the input is never mutated.
    expect(canonicalBytes(report.originalCanonical)).toBe(bytes);
    expect(doc.views![0]).toEqual(JSON.parse(bytes));
  });

  it("accepts absent and empty summary maps with zero operations", () => {
    for (const view of [minimalView(), minimalView({}), minimalView({ "sum:a": { ...completeSummary() } })]) {
      const report = migrateViewSchemaV1ToV2(view, VIEW_PINS);
      if ("boundary" in report || report.outcome !== "ok") throw new Error("empty summaries must migrate");
      expect(report.operations).toEqual([]);
      expect(report.unmigrated).toEqual([]);
      expect(canonicalBytes(report.target)).toBe(canonicalBytes(view));
    }
  });

  it("keeps every unrelated value, map order and empty keys exact", () => {
    const summaries = { "": { sourceOccurrence: "o", targetOccurrence: "o", label: "E", relationIds: ["r"] } };
    const report = migrateViewSchemaV1ToV2(minimalView(summaries), VIEW_PINS);
    if ("boundary" in report || report.outcome !== "ok") throw new Error("empty key must migrate");
    expect((report.target as Record<string, Record<string, Record<string, unknown>>>)["summaryLabels"]![""]!["id"]).toBe("");
    expect(checkViewShapeV2(report.target)).toBeNull();
  });

  it("never takes JSON identity from an inherited property", () => {
    const summary = Object.create({ id: "inherited" });
    Object.assign(summary, { sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: ["r"] });
    const report = migrateViewSchemaV1ToV2(minimalView({ "sum:a": summary }), VIEW_PINS);
    // A custom prototype is not JSON data: the boundary refuses before shape.
    expect(report).toMatchObject({ boundary: "pre-canonical", outcome: "refused", reason: "non-json-input", target: null });
  });

  it("keeps a __proto__ map key as an exact own string", () => {
    const view = JSON.parse('{"viewId":"view:a","semanticDocumentId":"d","revision":0,"entityOccurrences":{},"relationOccurrences":{},"portOccurrences":{},"groups":{},"filters":[],"presentation":{"camera":{"x":0,"y":0,"zoom":1}},"summaryLabels":{"__proto__":{"sourceOccurrence":"o","targetOccurrence":"o","label":"P","relationIds":["r"]}}}');
    const report = migrateViewSchemaV1ToV2(view, VIEW_PINS);
    if ("boundary" in report || report.outcome !== "ok") throw new Error("__proto__ key must migrate");
    expect(Object.hasOwn((report.target as Record<string, Record<string, unknown>>)["summaryLabels"]!, "__proto__")).toBe(true);
    expect(validateV2(report.target)).toBe(true);
  });

  it("refuses a conflicting present id atomically with no candidate", () => {
    const view = minimalView({
      "sum:a": { ...completeSummary() },
      "sum:b": { id: "other", sourceOccurrence: "o", targetOccurrence: "o", label: "B", relationIds: ["r"] },
    });
    const before = canonicalBytes(view);
    const report = migrateViewSchemaV1ToV2(view, VIEW_PINS);
    if ("boundary" in report || report.outcome !== "refused") throw new Error("conflict must refuse");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "summaryLabels.sum:b.id", reason: "summary-key-conflict",
      detail: 'record-key-mismatch: existing summary id differs from its map key "sum:b"',
    }]);
    expect(report.from).toEqual(V1);
    expect(report.to).toEqual(V2);
    expect(canonicalBytes(report.originalCanonical)).toBe(before);
  });
});

describe("§4.2 view-schema refusal rows (separate-list F2-a)", () => {
  it("refuses an inadmissible source selection, repeating @2 included", () => {
    const view = minimalView({ "sum:a": completeSummary() });
    for (const source of [{ ...V1, version: "3" }, { ...V1, contentDigest: "0".repeat(64) }, V2]) {
      const report = migrateViewSchemaV1ToV2(view, { source, target: V2 });
      if ("boundary" in report || report.outcome !== "refused") throw new Error("bad source pin must refuse");
      expect(report.target).toBeNull();
      expect(report.unmigrated).toHaveLength(1);
      expect(report.unmigrated[0]!.path).toBe("");
      expect(report.unmigrated[0]!.reason).toBe(
        source === V2 ? "unknown-source-schema" : source.contentDigest === V1.contentDigest ? "unknown-source-schema" : "source-digest-mismatch",
      );
      expect(report.from).toEqual(source);
    }
  });

  it("refuses an inadmissible target selection", () => {
    const view = minimalView({ "sum:a": { sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: ["r"] } });
    for (const [target, reason] of [
      [{ ...V2, version: "1" }, "unknown-target-schema"],
      [{ ...V2, contentDigest: "0".repeat(64) }, "target-digest-mismatch"],
    ] as const) {
      const report = migrateViewSchemaV1ToV2(view, { source: V1, target });
      if ("boundary" in report || report.outcome !== "refused") throw new Error("bad target pin must refuse");
      expect(report.target).toBeNull();
      expect(report.unmigrated).toEqual([{
        path: "", reason,
        detail: expect.stringContaining(target.version === "1" ? "target schema selection unavailable" : "target schema digest mismatch"),
      }]);
    }
  });

  it("refuses an invalid @1 source shape at its offending path", () => {
    for (const [summaries, path] of [
      [{ "sum:a": { sourceOccurrence: "o", targetOccurrence: "o", label: "", relationIds: ["r"] } }, "summaryLabels.sum:a.label"],
      [{ "sum:a": { sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: [] } }, "summaryLabels.sum:a.relationIds"],
      [{ "sum:a": { sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: ["r"], relationOccurrences: ["o"] } }, "summaryLabels.sum:a.relationOccurrences"],
    ] as const) {
      const view = minimalView(summaries as Record<string, unknown>);
      const report = migrateViewSchemaV1ToV2(view, VIEW_PINS);
      if ("boundary" in report || report.outcome !== "refused") throw new Error("invalid @1 source must refuse");
      expect(report.target).toBeNull();
      expect(report.unmigrated[0]).toMatchObject({ path, reason: "invalid-source-view" });
    }
  });

  it("reports pre-canonical failures outside any report, with no fabricated digest", () => {
    const surrogate = minimalView({ "sum:a": { ...completeSummary(), label: "lone-\ud800" } });
    const surrogateReport = migrateViewSchemaV1ToV2(surrogate, VIEW_PINS);
    expect(surrogateReport).toMatchObject({
      boundary: "pre-canonical", outcome: "refused",
      reason: "canonical-evidence-unavailable", target: null,
    });
    expect((surrogateReport as BoundaryPreflightRefusal).detail).toContain("invalid-unicode:lone-surrogate");
    expect("originalSha256" in (surrogateReport as Record<string, unknown>)).toBe(false);
    expect("unmigrated" in (surrogateReport as Record<string, unknown>)).toBe(false);
    const nonJson = migrateViewSchemaV1ToV2(undefined, VIEW_PINS);
    expect(nonJson).toMatchObject({ boundary: "pre-canonical", outcome: "refused", reason: "non-json-input", target: null });
    // The profile boundary behaves the same way when canonical evidence cannot form.
    const profileSurrogate = migrateGenericV1ToV2(
      { documentId: "d", profileRefs: ["generic@1"], entities: {}, relations: {}, note: "lone-\ud800" } as unknown as MigDocument,
      { viewSchemas: {} },
    );
    expect(profileSurrogate).toMatchObject({
      boundary: "pre-canonical", outcome: "refused",
      reason: "canonical-evidence-unavailable", target: null,
    });
    expect("originalSha256" in (profileSurrogate as Record<string, unknown>)).toBe(false);
    const profileNonJson = migrateGenericV1ToV2("not-a-document" as unknown as MigDocument, { viewSchemas: {} });
    expect(profileNonJson).toMatchObject({ boundary: "pre-canonical", outcome: "refused", reason: "non-json-input", target: null });
  });
});

describe("direct @2 adoption (no derivation, no @1 fallback)", () => {
  it("adopts DS-conforming data with empty labels and occurrence lists", () => {
    const view = minimalView({
      "sum:a": { id: "sum:a", sourceOccurrence: "o", targetOccurrence: "o", label: "", relationIds: ["r"], relationOccurrences: [] },
    });
    const report = adoptViewSchemaV2(view, V2);
    if ("boundary" in report || report.outcome !== "ok") throw new Error("adoption must succeed");
    expect(report.operations).toEqual([]);
    expect(report.target).toEqual(JSON.parse(canonicalBytes(view)));
    expect(validateV2(report.target)).toBe(true);
    expect(validateV1(report.target)).toBe(false);
  });

  it("refuses id-less bytes at the summary id path", () => {
    const doc = idLessDocument();
    const report = adoptViewSchemaV2(doc.views![0], V2);
    if ("boundary" in report || report.outcome !== "refused") throw new Error("id-less adoption must refuse");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "summaryLabels.sum:a.id", reason: "invalid-source-view",
      detail: expect.stringContaining("diagram-view-schema/2"),
    }]);
  });

  it("refuses an inadmissible adoption pin without deriving", () => {
    const view = minimalView({ "sum:a": completeSummary() });
    for (const [target, reason] of [
      [V1, "unknown-target-schema"],
      [{ ...V2, contentDigest: "0".repeat(64) }, "target-digest-mismatch"],
    ] as const) {
      const report = adoptViewSchemaV2(view, target);
      if ("boundary" in report || report.outcome !== "refused") throw new Error("bad adoption pin must refuse");
      expect(report.target).toBeNull();
      expect(report.unmigrated[0]!.reason).toBe(reason);
    }
  });
});

describe("§6.1 composition preflight rows (G1, separate-list F2-a)", () => {
  it("keeps the current obstruction: an @2-associated id-less view refuses at the summary id path", () => {
    const doc = idLessDocument();
    const bytes = canonicalBytes({ ...doc, views: doc.views });
    const report = migrateGenericV1ToV2(doc, { viewSchemas: { "view:a": V2 } });
    if ("boundary" in report || report.outcome !== "refused") throw new Error("direct @2 call on id-less bytes must refuse");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{ path: "views.view:a.summaryLabels.sum:a.id", reason: "incompatible-attribute-schema" }]);
    expect(canonicalBytes(report.originalCanonical)).toBe(bytes);
  });

  it("refuses an @1 association with the documented conversion detail", () => {
    const doc = idLessDocument();
    const report = migrateGenericV1ToV2(doc, { viewSchemas: { "view:a": V1 } });
    if ("boundary" in report || report.outcome !== "refused") throw new Error("@1 association must refuse");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "views.view:a", reason: "incompatible-attribute-schema",
      detail: "view conversion required before strict profile preflight for retained view views.view:a",
    }]);
  });

  it("covers all four association gate rows on every profile route", () => {
    const generic = idLessDocument();
    const derived = migrateViewSchemaV1ToV2(generic.views![0], VIEW_PINS);
    if ("boundary" in derived || derived.outcome !== "ok") throw new Error("fixture derivation must succeed");
    const converted = { ...generic, views: [derived.target as unknown as MigView] };
    const convertedId = converted.views[0]!.viewId;
    const rows: { association: Record<string, unknown>; detail: string }[] = [
      { association: {}, detail: "view-schema association absent for retained view views.view:a" },
      { association: { "view:a": { id: "diagram-view", version: "9", contentDigest: "0".repeat(64) } }, detail: "unresolved/unsupported view-schema association" },
      { association: { "view:a": { ...V2, contentDigest: "0".repeat(64) } }, detail: "view-schema association digest mismatch for retained view views.view:a" },
      { association: { "view:a": V1 }, detail: "view conversion required before strict profile preflight for retained view views.view:a" },
    ];
    for (const { association, detail } of rows) {
      const report = migrateGenericV1ToV2(converted, { viewSchemas: association as Record<string, never> });
      if ("boundary" in report || report.outcome !== "refused") throw new Error(`gate row must refuse: ${detail}`);
      expect(report.target).toBeNull();
      expect(report.unmigrated).toEqual([{
        path: "views.view:a", reason: "incompatible-attribute-schema", detail: expect.stringContaining(detail),
      }]);
    }
    expect(convertedId).toBe("view:a");
    // Archimate and UML routes enforce the same gate vocabulary.
    const archimateDoc = { ...converted, profileRefs: ["archimate@1"] };
    const archimateReport = migrateArchimateV1ToV2(archimateDoc, { entityTypes: {} }, { viewSchemas: { "view:a": V1 } });
    if ("boundary" in archimateReport || archimateReport.outcome !== "refused") throw new Error("archimate gate must refuse");
    expect(archimateReport.unmigrated[0]).toMatchObject({ path: "views.view:a", reason: "incompatible-attribute-schema" });
    const umlReport = migrateUmlV1ToV2({ ...converted, profileRefs: ["uml@1"] }, { stereotypes: {} }, { viewSchemas: {} });
    if ("boundary" in umlReport || umlReport.outcome !== "refused") throw new Error("uml gate must refuse");
    expect(umlReport.unmigrated[0]).toMatchObject({ path: "views.view:a", reason: "incompatible-attribute-schema" });
  });

  it("runs the derived result through generic@1→generic@2 with no re-declared addition", () => {
    const doc = idLessDocument();
    const derived = migrateViewSchemaV1ToV2(doc.views![0], VIEW_PINS);
    if ("boundary" in derived || derived.outcome !== "ok") throw new Error("fixture derivation must succeed");
    const report = migrateGenericV1ToV2(
      { ...doc, views: [derived.target as unknown as MigView] },
      { viewSchemas: { "view:a": V2 } },
    );
    if ("boundary" in report || report.outcome !== "ok") throw new Error("profile step must succeed");
    const summary = (report.target!.views![0] as unknown as Record<string, Record<string, Record<string, unknown>>>)["summaryLabels"]!["sum:a"]!;
    expect(summary["id"]).toBe("sum:a");
    expect(report.operations.some(operation => operation.path === "views.view:a.summaryLabels.sum:a.id")).toBe(false);
  });
});

describe("staged composition (i): view stage before profile migration", () => {
  it("converts then migrates, keeping both stage originals and receipts", () => {
    const doc = idLessDocument();
    const result = migrateGenericWithViewsV1ToV2(doc, { viewPins: VIEW_PINS });
    const { viewStage, profileStage } = result;
    if ("boundary" in viewStage || viewStage.outcome !== "ok") throw new Error("view stage must succeed");
    expect(viewStage.operations).toEqual([{
      path: "views.view:a.summaryLabels.sum:a.id", action: "derive-summary-id-from-key",
      detail: "H1: copy the existing map key into the absent own id",
    }]);
    if (profileStage === null || "boundary" in profileStage || profileStage.outcome !== "ok") {
      throw new Error(`profile stage must succeed: ${JSON.stringify(profileStage)}`);
    }
    expect(profileStage.target!.profileRefs).toEqual(["generic@2"]);
    const converted = (profileStage.target!.views![0] as unknown as Record<string, Record<string, Record<string, unknown>>>)["summaryLabels"]!["sum:a"]!;
    expect(converted["id"]).toBe("sum:a");
    // Pre-conversion original stays available through the view stage report.
    expect(viewStage.originalCanonical).toEqual(doc.views);
    expect(profileStage.originalCanonical.views).toHaveLength(1);
  });

  it("holds the profile stage when the view stage refuses", () => {
    const view = minimalView({
      "sum:a": { ...completeSummary() },
      "sum:b": { id: "other", sourceOccurrence: "o", targetOccurrence: "o", label: "B", relationIds: ["r"] },
    });
    const doc = { ...idLessDocument(), views: [view as unknown as MigView] };
    const result = migrateGenericWithViewsV1ToV2(doc, { viewPins: VIEW_PINS });
    if ("boundary" in result.viewStage || result.viewStage.outcome !== "refused") throw new Error("view stage must refuse");
    expect(result.profileStage).toBeNull();
    expect(result.viewStage.target).toBeNull();
    expect(result.viewStage.unmigrated[0]!.path).toBe("views.view:a.summaryLabels.sum:b.id");
  });

  it("preserves both originals when the second stage refuses", () => {
    const doc = idLessDocument();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "K" };
    // No contract pin: the view stage succeeds while the profile stage refuses.
    const result = migrateGenericWithViewsV1ToV2(doc, { viewPins: VIEW_PINS, views: doc.views });
    if ("boundary" in result.viewStage || result.viewStage.outcome !== "ok") throw new Error("view stage must succeed");
    if (result.profileStage === null || "boundary" in result.profileStage || result.profileStage.outcome !== "refused") {
      throw new Error("profile stage must refuse");
    }
    expect(result.profileStage.unmigrated).toEqual([
      { path: "presentation.contractPin", reason: "missing-presentation-contract" },
    ]);
    expect(result.viewStage.originalCanonical).toEqual(doc.views);
    const intermediate = result.profileStage.originalCanonical as MigDocument;
    expect(intermediate.profileRefs).toEqual(["generic@1"]);
    expect((intermediate.views![0] as unknown as Record<string, Record<string, Record<string, unknown>>>)["summaryLabels"]!["sum:a"]!["id"]).toBe("sum:a");
  });

  it("refuses multi-view conversion atomically with no partial candidate", () => {
    const good = minimalView({ "sum:a": { ...completeSummary() } });
    const bad = minimalView({ "sum:b": { id: "other", sourceOccurrence: "o", targetOccurrence: "o", label: "B", relationIds: ["r"] } });
    const report = migrateRetainedViewsV1ToV2([good, bad], VIEW_PINS);
    if ("boundary" in report || report.outcome !== "refused") throw new Error("stage must refuse atomically");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "views.view:a.summaryLabels.sum:b.id", reason: "summary-key-conflict",
      detail: expect.stringContaining("record-key-mismatch"),
    }]);
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes([good, bad]));
  });

  it("runs the archimate and uml orchestrators over an empty retained set", () => {
    const doc = idLessDocument();
    const { views: _views, ...noViews } = doc;
    void _views;
    const archimate = migrateArchimateWithViewsV1ToV2(
      { ...noViews, profileRefs: ["archimate@1"] }, { entityTypes: {} }, { viewPins: VIEW_PINS },
    );
    if ("boundary" in archimate.viewStage || archimate.viewStage.outcome !== "ok") throw new Error("archimate view stage must succeed");
    expect(archimate.viewStage.operations).toEqual([]);
    const uml = migrateUmlWithViewsV1ToV2(
      { ...noViews, profileRefs: ["uml@1"] }, { stereotypes: {} }, { viewPins: VIEW_PINS },
    );
    if ("boundary" in uml.viewStage || uml.viewStage.outcome !== "ok") throw new Error("uml view stage must succeed");
    if (uml.profileStage === null || "boundary" in uml.profileStage || uml.profileStage.outcome !== "ok") {
      throw new Error(`uml profile stage must succeed: ${JSON.stringify(uml.profileStage)}`);
    }
    expect(uml.profileStage.target!.profileRefs).toEqual(["uml@2"]);
  });
});

describe("§6.2 hand-written vs Ajv parity over both exact governed schemas", () => {
  interface ParityCase {
    readonly name: string;
    readonly view: Record<string, unknown>;
    /** Expected acceptance per version; the strict guard always matches @2. */
    readonly v1: boolean;
    readonly v2: boolean;
  }

  const summaryView = (summary: unknown): Record<string, unknown> => minimalView({ "sum:a": summary as Record<string, unknown> });
  const fullSummary = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ ...completeSummary(), ...overrides });

  const cases: ParityCase[] = [
    { name: "no summaries", view: minimalView(), v1: true, v2: true },
    { name: "empty summary map", view: minimalView({}), v1: true, v2: true },
    { name: "complete ordinary summary, no stroke", view: summaryView(fullSummary()), v1: true, v2: true },
    { name: "complete summary, solid stroke", view: summaryView(fullSummary({ strokeStyle: "solid" })), v1: true, v2: true },
    { name: "complete summary, dashed stroke", view: summaryView(fullSummary({ strokeStyle: "dashed" })), v1: true, v2: true },
    { name: "empty label with id", view: summaryView(fullSummary({ label: "" })), v1: false, v2: true },
    { name: "id absent, other fields valid", view: summaryView({ sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: ["r"] }), v1: true, v2: false },
    { name: "occurrence list absent", view: summaryView(fullSummary()), v1: true, v2: true },
    { name: "distinct occurrence list", view: summaryView(fullSummary({ relationOccurrences: ["o1", "o2"] })), v1: false, v2: true },
    { name: "empty occurrence list (shape only)", view: summaryView(fullSummary({ relationOccurrences: [] })), v1: false, v2: true },
    { name: "missing sourceOccurrence", view: summaryView({ id: "sum:a", targetOccurrence: "o", label: "L", relationIds: ["r"] }), v1: false, v2: false },
    { name: "missing targetOccurrence", view: summaryView({ id: "sum:a", sourceOccurrence: "o", label: "L", relationIds: ["r"] }), v1: false, v2: false },
    { name: "missing label", view: summaryView({ id: "sum:a", sourceOccurrence: "o", targetOccurrence: "o", relationIds: ["r"] }), v1: false, v2: false },
    { name: "missing relationIds", view: summaryView({ id: "sum:a", sourceOccurrence: "o", targetOccurrence: "o", label: "L" }), v1: false, v2: false },
    { name: "missing id refused only by @2", view: summaryView({ sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: ["r"] }), v1: true, v2: false },
    { name: "empty relationIds", view: summaryView(fullSummary({ relationIds: [] })), v1: false, v2: false },
    { name: "unsupported stroke", view: summaryView(fullSummary({ strokeStyle: "dotted" })), v1: false, v2: false },
    { name: "unknown summary property", view: summaryView(fullSummary({ accidental: true })), v1: false, v2: false },
    { name: "null label", view: summaryView(fullSummary({ label: null })), v1: false, v2: false },
    { name: "non-string label", view: summaryView(fullSummary({ label: 42 })), v1: false, v2: false },
    { name: "non-array relationIds", view: summaryView(fullSummary({ relationIds: "r" })), v1: false, v2: false },
    { name: "non-string relation id", view: summaryView(fullSummary({ relationIds: ["r", 7] })), v1: false, v2: false },
    { name: "non-array occurrence list", view: summaryView(fullSummary({ relationOccurrences: "o1" })), v1: false, v2: false },
    { name: "non-string occurrence item", view: summaryView(fullSummary({ relationOccurrences: ["o1", 7] })), v1: false, v2: false },
    { name: "null occurrence item", view: summaryView(fullSummary({ relationOccurrences: [null] })), v1: false, v2: false },
    { name: "non-string id", view: summaryView(fullSummary({ id: 7 })), v1: false, v2: false },
    { name: "null id", view: summaryView(fullSummary({ id: null })), v1: false, v2: false },
    { name: "duplicate relationIds accepted at shape level", view: summaryView(fullSummary({ relationIds: ["b", "a", "a"] })), v1: true, v2: true },
    { name: "duplicate occurrence list accepted at shape level", view: summaryView(fullSummary({ relationOccurrences: ["o2", "o1", "o1"] })), v1: false, v2: true },
    { name: "mismatching map key and id accepted at shape level", view: summaryView(fullSummary({ id: "sum:b" })), v1: true, v2: true },
    { name: "empty label with occurrence list", view: summaryView(fullSummary({ label: "", relationOccurrences: ["o1"] })), v1: false, v2: true },
  ];

  for (const { name, view, v1, v2 } of cases) {
    it(`agrees on ${name} (@1:${v1} @2:${v2})`, () => {
      const handV1 = checkViewShapeV1(view);
      const handV2 = checkViewShapeV2(view);
      expect(validateV1(view)).toBe(v1);
      expect(validateV2(view)).toBe(v2);
      expect(handV1 === null).toBe(v1);
      expect(handV2 === null).toBe(v2);
      // The integrated strict guard always matches the @2 check.
      expect(checkGovernedViewShape("1", view) === null).toBe(v1);
      expect(checkGovernedViewShape("2", view) === null).toBe(v2);
      expect(checkGovernedViewShape("9", view)).not.toBeNull();
      if (!v1) {
        expect(handV1).not.toBeNull();
        expect(validateV1.errors ?? []).not.toEqual([]);
      }
      if (!v2) {
        expect(handV2).not.toBeNull();
        expect(validateV2.errors ?? []).not.toEqual([]);
      }
    });
  }

  it("reports consistent refusal locations for summary violations", () => {
    const view = summaryView({ sourceOccurrence: "o", targetOccurrence: "o", label: "L", relationIds: ["r"] });
    expect(checkViewShapeV1(view)).toBeNull();
    expect(checkViewShapeV2(view)).toBe("summaryLabels.sum:a.id");
    expect(checkSummaryShapeV1((view["summaryLabels"] as Record<string, unknown>)["sum:a"], "summaryLabels.sum:a")).toBeNull();
    expect(checkSummaryShapeV2((view["summaryLabels"] as Record<string, unknown>)["sum:a"], "summaryLabels.sum:a")).toBe("summaryLabels.sum:a.id");
  });

  it("keeps every unchanged top-level and nested view constraint on both versions", () => {
    const base = minimalView({ "sum:a": { ...completeSummary() } });
    const variants: [string, (view: Record<string, unknown>) => void][] = [
      ["negative revision", view => { view["revision"] = -1; }],
      ["fractional revision", view => { view["revision"] = 1.5; }],
      ["missing camera", view => { (view["presentation"] as Record<string, unknown>)["camera"] = { x: 0, y: 0 }; }],
      ["unpaired semanticTarget", view => {
        (view["relationOccurrences"] as Record<string, unknown>)["occurrence:r"] = {
          id: "occurrence:r", relation: "relation:r",
          endpoints: [{ role: "source", occurrence: "occurrence:a", semanticTarget: "entity:a" }],
        };
      }],
      ["unpaired sourceOccurrence", view => {
        (view["relationOccurrences"] as Record<string, unknown>)["occurrence:r"] = {
          id: "occurrence:r", relation: "relation:r",
          endpoints: [{ role: "source", occurrence: "occurrence:a", sourceOccurrence: "occurrence:b" }],
        };
      }],
      ["null summaryLabels", view => { view["summaryLabels"] = null; }],
      ["open top-level property", view => { view["hover"] = true; }],
      ["bad legend-key title bound", view => {
        (view["presentation"] as Record<string, unknown>)["diagram"] = {
          contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) },
          entities: { "occurrence:a": { form: "legend-key", text: { title: "k".repeat(121) } } },
          legends: {}, categoryTokens: [],
        };
      }],
    ];
    for (const [label, mutate] of variants) {
      for (const version of ["1", "2"] as const) {
        const view = structuredClone(base);
        mutate(view);
        const hand = version === "1" ? checkViewShapeV1(view) : checkViewShapeV2(view);
        const ajvValidate = version === "1" ? validateV1 : validateV2;
        expect(ajvValidate(view), `${label} @${version}`).toBe(false);
        expect(hand, `${label} @${version}`).not.toBeNull();
      }
    }
  });
});
