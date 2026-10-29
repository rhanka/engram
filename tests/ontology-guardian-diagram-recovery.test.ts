import { describe, expect, it } from "vitest";
import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import { auditMigrationLoss, commitMigration, migrateGenericV1ToV2, migrateArchimateV1ToV2, migrateUmlV1ToV2, patchPath, resolveEffectiveType } from "../src/ontology-guardian/diagram-migrations.js";
import type { MigDocument, MigView, MigrationSuccess } from "../src/ontology-guardian/diagram-migrations.js";
import { corpusJson } from "./diagram-corpus-support.js";
import { MIGRATION_REPORT_REASONS } from "../src/ontology-guardian/diagram-schemas.js";

const contractPin = { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) };
const document = (): MigDocument => ({
  documentId: "document:recovery", schemaVersion: { major: 1, minor: 1 }, revision: 1, profileRefs: ["generic@1"],
  entities: { "entity:a": { id: "entity:a", profile: "generic@1", type: "node", attributes: { name: { kind: "text", value: "A" } } } },
  relations: {}, ports: {}, typeDefinitions: {}, resources: {}, extensions: [],
});
const view = (viewId = "view:a"): MigView => ({ viewId, semanticDocumentId: "document:recovery", revision: 1,
  entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:a", geometry: { x: 0, y: 0, width: 460, height: 200 } } },
  relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } } });

describe("complete DiagramState recovery", () => {
  it("snapshots external and embedded views on success and refusal", () => {
    for (const refuse of [false, true]) {
      const source = { ...document(), views: [view("view:z")] };
      const extra = view("view:a");
      if (refuse) (source.entities["entity:a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "x".repeat(81) };
      const expected = { ...source, views: [...source.views, extra] };
      const expectedBytes = canonicalBytes(expected);
      const report = migrateGenericV1ToV2(source, { views: [extra], contractPin });
      expect(report.outcome).toBe(refuse ? "refused" : "ok");
      expect(canonicalBytes(report.originalCanonical)).toBe(expectedBytes);
      expect(report.originalSha256).toBe(sha256Hex(canonicalBytes(expected)));
      expect(source.views).toHaveLength(1);
      (extra.presentation!.camera as { x: number }).x = 99;
      expect(canonicalBytes(report.originalCanonical)).toBe(expectedBytes);
    }
  });
  it("compares valid view sets by identity while restoring the original order", () => {
    const source = { ...document(), views: [view("view:z"), view("view:a")] };
    const report = migrateGenericV1ToV2(source);
    expect(report.outcome).toBe("ok");
    expect(auditMigrationLoss(source, { ...source, views: [...source.views].reverse() }, new Set())).toBeNull();
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(source));
  });
  it("refuses unknown document fields while retaining their complete recovery bytes", () => {
    const source = { ...document(), domainNote: { nested: ["one", { value: "two" }] }, views: [view()] };
    const report = migrateGenericV1ToV2(source);
    expect(report.outcome).toBe("refused");
    expect(report.originalCanonical.domainNote).toEqual(source.domainNote);
  });
  it("refuses conflicting view identities without losing either input", () => {
    const source = { ...document(), views: [view()] };
    const other = view(); other.presentation!.camera = { x: 10, y: 0, zoom: 1 };
    const report = migrateGenericV1ToV2(source, { views: [other] });
    expect(report.outcome).toBe("refused");
    expect(report.originalCanonical.views).toEqual([source.views[0], other]);
  });
  it("audits additions, array/object identity and dotted keys independently", () => {
    const source = { ...document(), domainNote: { "a.b": "first", a: { b: "second" }, empty: [] } };
    expect(auditMigrationLoss(source, { ...source, extra: true }, new Set())).toBe("extra");
    expect(auditMigrationLoss(source, { ...source, domainNote: { ...source.domainNote, empty: {} } }, new Set())).toBe("domainNote.empty");
    const changed = { ...source, domainNote: { ...source.domainNote, a: { b: "changed" } } };
    expect(auditMigrationLoss(source, changed, new Set([patchPath("domainNote", "a.b")]))).toBe("domainNote.a.b");
    expect(auditMigrationLoss(source, changed, new Set([patchPath("domainNote", "a", "b")]))).toBeNull();
  });
  it("refuses identity-only and malformed source views before committing", () => {
    const bad: unknown[] = [null, { viewId: "view:a", semanticDocumentId: "document:recovery", revision: 1 }];
    for (const entityPresentation of [{ form: "banana", text: {} }, { form: "card", text: { title: 42 } }]) {
      const invalid = view();
      invalid.presentation!.diagram = { contractPin, entities: { "occurrence:a": entityPresentation }, legends: {}, categoryTokens: [] };
      bad.push(invalid);
    }
    for (const invalid of bad) {
      const result = migrateGenericV1ToV2(document(), { views: [invalid as MigView] });
      expect(result.outcome).toBe("refused"); expect(result.target).toBeNull();
      expect(result.originalCanonical.views).toEqual([invalid]);
    }
  });
});

// A complete synthetic state exercises every native retained subtree, empty
// collection and unknown field. These independent leaf paths drive one
// deliberate candidate corruption and one audit mutant per path.
export const LOSSLESS_WITNESS: MigDocument = { ...document(),
  relations: { "relation:r": { id: "relation:r", profile: "generic@1", type: "link", endpoints: [{ role: "source", target: "entity:a" }], attributes: { label: { kind: "text", value: "kept" } } } },
  ports: { "port:p": { id: "port:p", profile: "generic@1", type: "port", owner: "entity:a", name: "P", direction: "in", attributes: {} } },
  typeDefinitions: { "custom": { id: "custom", profile: "generic@1", baseType: "node", attributes: [{ name: "domainNote", kind: "text", maxLength: 100 }] } },
  resources: { "resource:r": { id: "resource:r", uri: "urn:r", mediaType: "text/plain", contentHash: "a".repeat(64), byteLength: 0 } },
  extensions: [{ namespace: "urn:foreign", schemaVersion: "1", scope: { kind: "document" }, validation: "preserved-unvalidated", contentHash: "b".repeat(64), source: "<raw/>" }],
  views: [{ ...view(), relationOccurrences: { "occurrence:r": { id: "occurrence:r", relation: "relation:r", endpoints: [{ role: "source", occurrence: "occurrence:a" }], waypoints: [{ x: 1, y: 2 }], strokeStyle: "dashed" } },
    portOccurrences: { "occurrence:p": { id: "occurrence:p", port: "port:p", ownerOccurrence: "occurrence:a", side: "east", order: 1, anchor: 0.5 } },
    groups: { "group:a": { id: "group:a", label: "G", collapsed: false, occurrence: "occurrence:a" } },
    filters: [{ id: "filter:a", kind: "entity-type", types: ["node"], mode: "include" }],
    summaryLabels: { "sum:a": { id: "sum:a", sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a", label: "Kept", relationIds: ["relation:r"], relationOccurrences: ["occurrence:r"] } } }],
};
export function losslessLeafPaths(value: unknown, base: (string | number)[] = []): (string | number)[][] {
  if (value === null || typeof value !== "object" || Object.keys(value).length === 0) return [base];
  return Object.entries(value).flatMap(([key, child]) => losslessLeafPaths(child, [...base, Array.isArray(value) ? Number(key) : key]));
}
describe("atomic loss refusal, every input leaf", () => {
  it("retains summary relation occurrences through generic migration", () => {
    const source = structuredClone(LOSSLESS_WITNESS);
    const result = migrateGenericV1ToV2(source);
    expect(result.outcome, JSON.stringify(result.unmigrated)).toBe("ok");
    expect(result.target!.views).toEqual(source.views);
    expect(result.originalCanonical).toEqual(source);
  });
  it("accepts the complete witness before testing corruption", () => {
    const source = structuredClone(LOSSLESS_WITNESS);
    const candidate: MigrationSuccess = { migrationId: "test:commit", from: contractPin, to: contractPin,
      originalCanonical: source, originalSha256: sha256Hex(canonicalBytes(source)), operations: [], unmigrated: [], outcome: "ok", target: structuredClone(source) };
    const result = commitMigration(candidate, new Set());
    expect(result.outcome, JSON.stringify(result.unmigrated)).toBe("ok");
    expect(result.target).toEqual(source);
  });
  for (const path of losslessLeafPaths(LOSSLESS_WITNESS)) it(`refuses corruption at ${path.join("/")}`, () => {
    const source = structuredClone(LOSSLESS_WITNESS), target = structuredClone(source);
    let cursor: any = target;
    for (const key of path.slice(0, -1)) cursor = cursor[key];
    cursor[path.at(-1)!] = "corrupted";
    const candidate: MigrationSuccess = { migrationId: "test:commit", from: contractPin, to: contractPin,
      originalCanonical: source, originalSha256: sha256Hex(canonicalBytes(source)), operations: [], unmigrated: [], outcome: "ok", target };
    expect(auditMigrationLoss(source, target, new Set())).not.toBeNull();
    const result = commitMigration(candidate, new Set());
    expect(result.outcome).toBe("refused"); expect(result.target).toBeNull();
    expect(result.originalSha256).toBe(candidate.originalSha256);
    expect(canonicalBytes(result.originalCanonical)).toBe(canonicalBytes(source));
  });
});

describe("native refinements and resolved stereotype families", () => {
  it("retains native additive attribute names that also occur on Object.prototype", () => {
    const attributes = JSON.parse('{"name":{"kind":"text","value":"A"},"constructor":{"kind":"text","value":"constructor"},"__proto__":{"kind":"text","value":"proto"},"toString":{"kind":"text","value":"string"}}');
    const source = { ...document(), typeDefinitions: { custom: { id: "custom", profile: "generic@1", baseType: "node",
      attributes: ["constructor", "__proto__", "toString"].map(name => ({ name, kind: "text" })) } },
      entities: { "entity:a": { ...document().entities["entity:a"]!, type: "custom", attributes } } };
    const result = migrateGenericV1ToV2(source);
    expect(result.outcome, JSON.stringify(result.unmigrated)).toBe("ok");
    expect(canonicalBytes(result.target!.entities["entity:a"]!.attributes)).toBe(canonicalBytes(attributes));
    expect(result.target!.typeDefinitions!.custom).toEqual({ ...source.typeDefinitions.custom, profile: "generic@2" });
  });
  it("resolves every declared ancestor, inherited capability and typed conflict", () => {
    const declaration = { id: "example@2", entityTypes: [
      { id: "root", abstract: true, container: true, attributes: [{ name: "name", kind: "text", maxLength: 200 }] },
      { id: "middle", supertypes: ["root"], attributes: [] },
      { id: "leaf", supertypes: ["middle"], attributes: [] },
    ] };
    expect(resolveEffectiveType(declaration, {}, "leaf")).toMatchObject({ ok: true, effective: {
      baseId: "leaf", chain: ["leaf", "middle", "root"], container: true, attrs: { name: { kind: "text" } },
    } });
    expect(resolveEffectiveType(declaration, { foreign: { id: "foreign", profile: "other@2", baseType: "leaf", attributes: [] } }, "foreign").ok).toBe(false);
    expect(resolveEffectiveType(declaration, { cycle: { id: "cycle", profile: "example@2", baseType: "cycle", attributes: [] } }, "cycle").ok).toBe(false);
    const conflict = { ...declaration, entityTypes: [declaration.entityTypes[0], { id: "other", attributes: [{ name: "name", kind: "boolean" }] }, { id: "leaf", supertypes: ["root", "other"], attributes: [] }] };
    expect(resolveEffectiveType(conflict, {}, "leaf").ok).toBe(false);
  });
  it("refuses unused and valueless incompatible native declarations", () => {
    for (const schema of [{ name: "category", kind: "boolean" }, { name: "category", kind: "text", maxLength: 41 }]) {
      const source = { ...document(), typeDefinitions: { custom: { id: "custom", profile: "generic@1", baseType: "node", attributes: [schema] } } };
      const result = migrateGenericV1ToV2(source);
      expect(result.outcome).toBe("refused");
      expect(result.unmigrated[0]).toMatchObject({ path: "typeDefinitions.custom.attributes.category", reason: "type-definition-conflict" });
      expect(MIGRATION_REPORT_REASONS).toContain(result.unmigrated[0]!.reason);
    }
  });
  it("promotes a compatible native overlap and retains additive schemas through full ancestry", () => {
    const source = { ...document(), typeDefinitions: {
      parent: { id: "parent", profile: "generic@1", baseType: "node", attributes: [{ name: "category", kind: "text", minLength: 1, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$", patternName: "key" }] },
      child: { id: "child", profile: "generic@1", baseType: "parent", attributes: [{ name: "domainNote", kind: "boolean" }] },
    }, entities: { "entity:a": { ...document().entities["entity:a"]!, type: "child", attributes: { name: { kind: "text", value: "A" }, domainNote: { kind: "boolean", value: true } } } } };
    const result = migrateGenericV1ToV2(source);
    expect(result.outcome).toBe("ok");
    expect(result.target!.typeDefinitions!.parent).toBeUndefined();
    expect((result.target!.typeDefinitions!.child as { baseType: string }).baseType).toBe("node");
    expect((result.target!.typeDefinitions!.child as { attributes: unknown[] }).attributes).toEqual(source.typeDefinitions.child.attributes);
    expect(result.target!.entities["entity:a"]!.type).toBe("child");
  });
  it("rebases a native element refinement onto the explicit concrete assignment", () => {
    const source = corpusJson<{ document: MigDocument }>("ds:archimate-skeleton-document.json").document;
    source.typeDefinitions = { custom: { id: "custom", profile: "archimate@1", baseType: "element", attributes: [{ name: "domainNote", kind: "text", maxLength: 100 }] } };
    source.entities["entity:actor"] = { ...source.entities["entity:actor"]!, type: "custom", attributes: { ...source.entities["entity:actor"]!.attributes, domainNote: { kind: "text", value: "kept" } } };
    const result = migrateArchimateV1ToV2(source, { entityTypes: { "entity:actor": "business-actor", "entity:process": "business-process", "entity:component": "application-component" } });
    expect(result.outcome).toBe("ok");
    expect(result.target!.typeDefinitions!.custom).toEqual({ ...source.typeDefinitions.custom as object, profile: "archimate@2", baseType: "business-actor" });
    expect(result.target!.entities["entity:actor"]!.type).toBe("custom");
    expect(result.target!.entities["entity:actor"]!.attributes.domainNote).toEqual({ kind: "text", value: "kept" });
  });
  it("applies a declared stereotype to a refinement of its permitted class family", () => {
    const source = corpusJson<{ document: MigDocument }>("ds:uml-skeleton-document.json").document;
    source.typeDefinitions = { domain: { id: "domain", profile: "uml@1", baseType: "class", attributes: [] }, specialized: { id: "specialized", profile: "uml@1", baseType: "stereotype", attributes: [] } };
    source.entities["entity:order"] = { ...source.entities["entity:order"]!, type: "domain" };
    source.entities["entity:declared"] = { id: "entity:declared", profile: "uml@1", type: "specialized", attributes: { name: { kind: "text", value: "entity" }, extends: { kind: "collection", items: [{ kind: "text", value: "class" }] } } };
    const result = migrateUmlV1ToV2(source, { stereotypes: { entity: "entity:declared" } });
    expect(result.outcome).toBe("ok");
    expect(result.target!.entities["entity:order"]!.attributes.stereotypes).toEqual({ kind: "collection", items: [{ kind: "reference", value: "entity:declared" }] });
  });
});
