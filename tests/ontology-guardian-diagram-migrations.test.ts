// Diagram @1 → @2 migrations (frozen spec M3-R4 deb64b75, §§3.9.1/3.11.1/3.13).
// Round-trips, atomic refusals, @1 byte-immutability and the §3.9.1/§3.11.1
// mapping witnesses. Refusals return the exact original state, no candidate.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = process.env.DIAGRAM_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));

import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import {
  migrateArchimateV1ToV2,
  migrateGenericV1ToV2,
  migrateUmlV1ToV2,
  parseMultiplicity,
} from "../src/ontology-guardian/diagram-migrations.js";
import type { MigAttribute, MigDocument } from "../src/ontology-guardian/diagram-migrations.js";
import { expandArchimateTuples } from "../src/ontology-guardian/diagram-profiles.js";

const fixtures = join(testsDir, "fixtures");
const shaFile = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

// The historical authored generic fixture is intentionally partial. Add the
// native envelope explicitly at the call site; its pinned bytes stay intact.
function nativeInput(value: MigDocument): MigDocument {
  return value.documentId === undefined ? value : { schemaVersion: { major: 1, minor: 1 }, ports: {}, resources: {}, extensions: [], typeDefinitions: {}, ...value };
}
function loadMig(path: string): MigDocument {
  return nativeInput(JSON.parse(readFileSync(path, "utf8")) as MigDocument);
}

describe("@1 byte-immutability (§2.1, §8.5)", () => {
  it("pins the immutable DS declaration bytes", () => {
    expect(shaFile(join(fixtures, "pinned-sources", "ds-generic-ts.bytes"))).toBe(
      "b19967fe65483abdbf0e271f197e13691904e4b087c1542de23c52e2ad4f45c3",
    );
    expect(shaFile(join(fixtures, "pinned-sources", "ds-skeletons-ts.bytes"))).toBe(
      "0a01fd2569e68c2b99ca754f28dc7cbbbd9a1d491ffa9981161cae3bbf56b54e",
    );
  });

  it("pins the @1 skeleton documents and the c14n bytes", () => {
    expect(shaFile(join(fixtures, "pinned-sources", "archimate-skeleton-document.json"))).toBe(
      "8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951",
    );
    expect(shaFile(join(fixtures, "pinned-sources", "uml-skeleton-document.json"))).toBe(
      "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8",
    );
    expect(shaFile(join(fixtures, "pinned-sources", "bpmn-canvas-canonical-ts.bytes"))).toBe(
      "287d8cb87beb7384fc89a8d6141681010dcba50ee895aaadc3b31345541191ba",
    );
  });

  it("pins the authored generic@1 migration source", () => {
    expect(shaFile(join(fixtures, "generic-v1-minimal-document.json"))).toBe(
      "76bbe5b8f1323c85a141830156a6e47cce5aa3b9198988ad5c172b1f23fbbd16",
    );
  });

  it("holds transcription tripwires between pinned bytes and @1 data", () => {
    const generic = readFileSync(join(fixtures, "pinned-sources", "ds-generic-ts.bytes"), "utf8");
    const skeletons = readFileSync(join(fixtures, "pinned-sources", "ds-skeletons-ts.bytes"), "utf8");
    for (const marker of ["generic@1", "max-entities-of-type", "max: 64", "maxLength: 120", "containment"]) {
      expect(generic.includes(marker)).toBe(true);
    }
    for (const marker of ["archimate@1", "uml@1", "multiplicity", "maxLength: 20", "packageContainment"]) {
      expect(skeletons.includes(marker)).toBe(true);
    }
    // Exact @1 relation labels, never retyped: the pinned source spells the
    // three labels below and maps archimate ids to themselves.
    for (const marker of [
      'directedPair("generalization", "Generalization"',
      'directedPair("dependency", "Dependency"',
      "ARCHIMATE_RELATIONS.map((id) => directedPair(id, id))",
      'label: "Association"',
      'label: "Package containment"',
    ]) {
      expect(skeletons.includes(marker)).toBe(true);
    }
  });
});

describe("multiplicity parser (§3.11, A.2)", () => {
  it("parses the four admitted notations", () => {
    expect(parseMultiplicity("1")).toEqual({ ok: true, lower: 1, upper: 1 });
    expect(parseMultiplicity("0..1")).toEqual({ ok: true, lower: 0, upper: 1 });
    expect(parseMultiplicity("1..5")).toEqual({ ok: true, lower: 1, upper: 5 });
    expect(parseMultiplicity("*")).toEqual({ ok: true, lower: 0, upper: -1 });
    expect(parseMultiplicity("1..*")).toEqual({ ok: true, lower: 1, upper: -1 });
    expect(parseMultiplicity("0..*")).toEqual({ ok: true, lower: 0, upper: -1 });
  });

  it("refuses without trimming or guessing", () => {
    for (const raw of [" 1", "1 ", "one", "", "1...2", "n..m", "-1", "1.."]) {
      expect(parseMultiplicity(raw)).toEqual({ ok: false, reason: "multiplicity-syntax" });
    }
    expect(parseMultiplicity("5..1")).toEqual({ ok: false, reason: "multiplicity-invalid" });
  });
});

describe("canonical refusal selection", () => {
  it("reports the same first invalid attribute under reversed insertion", () => {
    const original = loadMig(join(fixtures, "pinned-sources", "uml-skeleton-document.json")).document as MigDocument;
    const labels = { sourceMultiplicity: { kind: "text", value: "bad-source" }, targetMultiplicity: { kind: "text", value: "bad-target" } };
    const results = [labels, Object.fromEntries(Object.entries(labels).reverse())].map(attributes => {
      const source = structuredClone(original);
      source.relations["relation:order-customer"] = { ...source.relations["relation:order-customer"]!, attributes };
      // Remove unrelated stereotype application so both isolated inputs reach
      // the multiplicity parser with exactly the same invalid declarations.
      source.entities["entity:order"] = { ...source.entities["entity:order"]!, attributes: { name: { kind: "text", value: "Order" } } };
      return migrateUmlV1ToV2(source, { stereotypes: {} });
    });
    expect(results[0]!.unmigrated).toEqual([{ path: "relations.relation:order-customer.attributes.sourceMultiplicity", reason: "multiplicity-syntax" }]);
    expect(results[1]!.unmigrated).toEqual(results[0]!.unmigrated);
  });
});

describe("generic@1 → generic@2 (§3.13.1)", () => {
  const source = (): MigDocument => loadMig(join(fixtures, "generic-v1-minimal-document.json"));

  it("migrates the minimal document, preserving every id and endpoint", () => {
    const report = migrateGenericV1ToV2(source());
    expect(report.outcome).toBe("ok");
    expect(report.unmigrated).toEqual([]);
    expect(report.target).not.toBeNull();
    const target = report.target!;
    expect(target.profileRefs).toEqual(["generic@2"]);
    expect(Object.keys(target.entities).sort()).toEqual([
      "entity:box", "entity:box-open", "entity:box-plain", "entity:node-a",
    ]);
    expect(Object.keys(target.relations).sort()).toEqual(["relation:assoc-a", "relation:contains-a", "relation:link-a"]);
    expect(target.relations["relation:link-a"]).toMatchObject({
      profile: "generic@2",
      endpoints: [
        { role: "source", target: "entity:node-a" },
        { role: "target", target: "entity:box-open" },
      ],
    });
    expect(target.relations["relation:assoc-a"]!.endpoints.map((e) => e.target)).toEqual([
      "entity:node-a", "entity:box", "entity:box-open",
    ]);
    const boundOp = report.operations.find((o) => o.action === "record-bound-change");
    expect(boundOp?.detail).toBe("link.label 120→200; values never rewritten");
    expect(target.relations["relation:link-a"]!.attributes["label"]).toEqual({ kind: "text", value: "wires" });
  });

  it("removes semantic collapsed and reports absent/false/true distinctly", () => {
    const report = migrateGenericV1ToV2(source());
    const removals = report.operations.filter((o) => o.action === "remove-semantic-collapsed");
    expect(removals.map((o) => `${o.path}=${o.detail}`).sort()).toEqual([
      "entities.entity:box-open.attributes.collapsed=was-false",
      "entities.entity:box-plain.attributes.collapsed=was-absent",
      "entities.entity:box.attributes.collapsed=was-true",
    ]);
    expect(report.target!.entities["entity:box"]!.attributes["collapsed"]).toBeUndefined();
  });

  it("round-trips: originalCanonical restores byte for byte; re-migration refuses", () => {
    const doc = source();
    const report = migrateGenericV1ToV2(doc);
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(doc));
    expect(report.originalSha256).toBe(sha256Hex(canonicalBytes(doc)));
    const again = migrateGenericV1ToV2(report.target!);
    expect(again.outcome).toBe("refused");
    expect(again.target).toBeNull();
    expect(again.unmigrated).toEqual([{ path: "", reason: "target-already-present" }]);
    expect(canonicalBytes(again.originalCanonical)).toBe(canonicalBytes(report.target!));
  });

  it("refuses presentation slots without retained views", () => {
    const doc = source();
    const withSlot = structuredClone(doc);
    (withSlot.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "K" };
    const report = migrateGenericV1ToV2(withSlot);
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:node-a.attributes.kicker", reason: "missing-presentation-destination" },
    ]);
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(withSlot));
  });

  it("moves presentation slots into retained occurrences when views are supplied", () => {
    const doc = source();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "K" };
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["icon"] = { kind: "text", value: "window" };
    const report = migrateGenericV1ToV2(doc, {
      views: [{
        viewId: "view:1", semanticDocumentId: "document:generic-1-minimal", revision: 0,
        entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:node-a" , geometry: { x: 0, y: 0, width: 460, height: 200 }} },
        relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } }}],
      contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) },
    });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.presentationMoves).toEqual({ "view:1/occurrence:a": { kicker: "K", icon: "window" } });
    expect(report.target!.entities["entity:node-a"]!.attributes["kicker"]).toBeUndefined();
    expect(report.target!.entities["entity:node-a"]!.attributes["icon"]).toBeUndefined();
    // The moves commit into the returned views, never beside them: text
    // slots land in text, the icon in its typed field, the diagram complete.
    expect(report.target!.views).toHaveLength(1);
    expect(report.target!.views![0]).toMatchObject({
      viewId: "view:1",
      presentation: { camera: { x: 0, y: 0, zoom: 1 },
        diagram: {
          contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) },
          entities: { "occurrence:a": { form: "card", text: { kicker: "K" }, icon: "window" } },
          legends: {},
          categoryTokens: [],
        },
      },
    });
  });

  it("refuses presentation moves without the pinned contract", () => {
    const doc = source();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "K" };
    const report = migrateGenericV1ToV2(doc, {
      views: [{
        viewId: "view:1", semanticDocumentId: "document:generic-1-minimal", revision: 0,
        entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:node-a" , geometry: { x: 0, y: 0, width: 460, height: 200 }} },
        relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } }}],
    });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{ path: "presentation.contractPin", reason: "missing-presentation-contract" }]);
  });

  it("refuses a conflicting destination value atomically", () => {
    const doc = source();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "K" };
    const report = migrateGenericV1ToV2(doc, {
      views: [{
        viewId: "view:1", semanticDocumentId: "document:generic-1-minimal", revision: 0,
        entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:node-a" , geometry: { x: 0, y: 0, width: 460, height: 200 }} },
        relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [],
        presentation: { camera: { x: 0, y: 0, zoom: 1 },  diagram: { contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) }, legends: {}, categoryTokens: [], entities: { "occurrence:a": { form: "card", text: { kicker: "OTHER" } } } } },
      }],
      contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) },
    });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "views.view:1.presentation.diagram.entities.occurrence:a.text.kicker",
      reason: "destination-conflict",
    }]);
  });

  it("preserves every native field of the full pinned document", () => {
    const doc = loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument;
    const report = migrateArchimateV1ToV2(doc, {
      "entity:actor": "business-actor",
      "entity:process": "business-process",
      "entity:component": "application-component",
    });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.schemaVersion).toEqual((doc as MigDocument).schemaVersion);
    expect(report.target!.resources).toEqual((doc as MigDocument).resources);
    expect(report.target!.extensions).toEqual((doc as MigDocument).extensions);
    expect(report.target!.typeDefinitions).toEqual((doc as MigDocument).typeDefinitions);
  });

  it("orders attribute operations canonically under reversed insertion", () => {
    const uml = (): MigDocument => loadMig(join(fixtures, "pinned-sources", "uml-skeleton-document.json")).document as MigDocument;
    const withStereotype = (doc: MigDocument): MigDocument => {
      const next = structuredClone(doc);
      next.entities["entity:stereotype-entity"] = {
        id: "entity:stereotype-entity", profile: "uml@1", type: "stereotype",
        attributes: {
          name: { kind: "text", value: "entity" },
          extends: { kind: "collection", items: [{ kind: "text", value: "class" }] },
        },
      };
      return next;
    };
    const input = { stereotypes: { entity: "entity:stereotype-entity" } };
    const flipAttributes = (doc: MigDocument): MigDocument => {
      const next = structuredClone(doc);
      const rel = next.relations["relation:order-customer"]!;
      const entries = Object.entries(rel.attributes);
      const flipped: Record<string, MigAttribute> = {};
      for (const [k, v] of entries.reverse()) flipped[k] = v as MigAttribute;
      next.relations["relation:order-customer"] = { ...rel, attributes: flipped };
      return next;
    };
    const first = migrateUmlV1ToV2(withStereotype(uml()), input);
    const second = migrateUmlV1ToV2(flipAttributes(withStereotype(uml())), input);
    expect(first.outcome).toBe("ok");
    expect(second.outcome).toBe("ok");
    if (first.outcome !== "ok" || second.outcome !== "ok") throw new Error("migration");
    expect(second.operations).toEqual(first.operations);
    expect(canonicalBytes(second.target!)).toBe(canonicalBytes(first.target!));
  });

  it("refuses an overlong presentation slot atomically (kicker≤200 into kicker≤80)", () => {
    const doc = source();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = {
      kind: "text", value: "k".repeat(100),
    };
    const report = migrateGenericV1ToV2(doc, {
      views: [{
        viewId: "view:1", semanticDocumentId: "document:generic-1-minimal", revision: 0,
        entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:node-a" , geometry: { x: 0, y: 0, width: 460, height: 200 }} },
        relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } }}],
    });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:node-a.attributes.kicker", reason: "incompatible-attribute-schema" },
    ]);
  });

  it("refuses a target-reserved refinement id before any rewrite", () => {
    const doc = source();
    const withReserved = { ...doc, typeDefinitions: { node: { id: "node", profile: "generic@1", baseType: "node", attributes: [] } } };
    const report = migrateGenericV1ToV2(withReserved);
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([{ path: "typeDefinitions.node", reason: "incompatible-attribute-schema" }]);
  });

  it("refuses a missing source profile without a candidate", () => {
    const doc = { ...source(), profileRefs: ["uml@1"] };
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([{ path: "", reason: "missing-source-profile" }]);
  });
});

describe("archimate@1 → archimate@2 (§§3.9.1/3.13.2)", () => {
  const source = (): MigDocument => loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument;
  const mapping = {
    "entity:actor": "business-actor",
    "entity:process": "business-process",
    "entity:component": "application-component",
  };

  it("migrates the pinned skeleton with byte-identical endpoints", () => {
    const report = migrateArchimateV1ToV2(source(), mapping);
    expect(report.outcome).toBe("ok");
    const target = report.target!;
    expect(target.profileRefs).toEqual(["archimate@2"]);
    expect(target.entities["entity:actor"]).toMatchObject({ profile: "archimate@2", type: "business-actor" });
    expect(target.entities["entity:process"]).toMatchObject({ profile: "archimate@2", type: "business-process" });
    expect(target.entities["entity:component"]).toMatchObject({ profile: "archimate@2", type: "application-component" });
    expect(target.entities["entity:junction"]).toMatchObject({ profile: "archimate@2", type: "junction" });
    expect(target.relations["relation:assignment"]!.endpoints).toEqual([
      { role: "source", target: "entity:actor" },
      { role: "target", target: "entity:process" },
    ]);
    expect(target.relations["relation:serving"]!.endpoints).toEqual([
      { role: "source", target: "entity:component" },
      { role: "target", target: "entity:process" },
    ]);
    expect(target.relations["relation:flow"]!.endpoints).toEqual([
      { role: "source", target: "entity:process" },
      { role: "target", target: "entity:junction" },
    ]);
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(source()));
  });

  it("derives layer/aspect from the catalogue and drops no authored name", () => {
    const report = migrateArchimateV1ToV2(source(), mapping);
    expect(report.target!.entities["entity:actor"]!.attributes).toEqual({
      name: { kind: "text", value: "Claims officer" },
      layer: { kind: "enum", value: "business" },
      aspect: { kind: "enum", value: "active" },
    });
  });

  it("refuses an unmapped element, leaving the original @1", () => {
    const report = migrateArchimateV1ToV2(source(), { "entity:actor": "business-actor" });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{ path: "entities.entity:component", reason: "missing-type-mapping" }]);
  });

  it("refuses a forbidden ordered pair (composition application-component→business-process)", () => {
    const doc = source();
    const edited = structuredClone(doc);
    edited.relations["relation:serving"] = { ...edited.relations["relation:serving"]!, type: "composition" };
    const report = migrateArchimateV1ToV2(edited, mapping);
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([{ path: "relations.relation:serving.endpoints", reason: "relationship-matrix-violation" }]);
  });

  it("refuses a relation without its source/target role (no guessing)", () => {
    const doc = source();
    const edited = structuredClone(doc);
    edited.relations["relation:flow"] = {
      ...edited.relations["relation:flow"]!,
      endpoints: [{ role: "source", target: "entity:process" }],
    };
    const report = migrateArchimateV1ToV2(edited, mapping);
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([{ path: "relations.relation:flow.endpoints", reason: "endpoint-role-unknown" }]);
  });

  it("holds the §3.9.1 relation-target pair assertions (association o, access rejected)", () => {
    const tuples = expandArchimateTuples();
    const allows = (relationship: string, s: string, t: string): boolean =>
      tuples.some((x) => x.relationType === relationship && x.sourceType === s && x.targetType === t);
    expect(allows("association", "application-component", "@relation")).toBe(true);
    expect(allows("association", "@relation", "application-component")).toBe(true);
    expect(allows("access", "application-component", "@relation")).toBe(false);
    expect(allows("access", "@relation", "application-component")).toBe(false);
  });

  it("never guesses @1 relation targets (explicit endpoints only)", () => {
    const doc = source();
    const edited = structuredClone(doc);
    edited.relations["relation:flow"] = {
      ...edited.relations["relation:flow"]!,
      type: "association",
      endpoints: [
        { role: "source", target: "entity:component" },
        { role: "target", target: "relation:assignment" },
      ],
    };
    const report = migrateArchimateV1ToV2(edited, mapping);
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{ path: "relations.relation:flow.endpoints", reason: "missing-type-mapping" }]);
  });
});

describe("uml@1 → uml@2 (§§3.11.1/3.13.2)", () => {
  const source = (): MigDocument => loadMig(join(fixtures, "pinned-sources", "uml-skeleton-document.json")).document as MigDocument;

  it("refuses the raw skeleton on its unmapped stereotype text", () => {
    const report = migrateUmlV1ToV2(source(), { stereotypes: {} });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "unmapped-stereotype" },
    ]);
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(source()));
  });

  it("migrates with an explicit stereotype mapping and converts multiplicities", () => {
    const doc = source();
    doc.entities["entity:stereotype-entity"] = {
      id: "entity:stereotype-entity", profile: "uml@1", type: "stereotype",
      attributes: {
        name: { kind: "text", value: "entity" },
        extends: { kind: "collection", items: [{ kind: "text", value: "class" }] },
      },
    };
    const report = migrateUmlV1ToV2(doc, {
      stereotypes: { entity: "entity:stereotype-entity" },
    });
    expect(report.outcome).toBe("ok");
    const target = report.target!;
    expect(target.profileRefs).toEqual(["uml@2"]);
    expect(target.entities["entity:order-total"]!.attributes["multiplicity"]).toEqual({
      kind: "struct", type: "multiplicity",
      fields: {
        lower: { kind: "quantity", value: 1, unit: "unit" },
        upper: { kind: "quantity", value: 1, unit: "unit" },
      },
    });
    expect(target.relations["relation:order-customer"]!.attributes["sourceMultiplicity"]).toMatchObject({
      kind: "struct", fields: { lower: { value: 0 }, upper: { value: -1 } },
    });
    expect(target.relations["relation:order-customer"]!.attributes["targetMultiplicity"]).toMatchObject({
      kind: "struct", fields: { lower: { value: 1 }, upper: { value: 1 } },
    });
    expect(target.entities["entity:order"]!.attributes["stereotypes"]).toEqual({
      kind: "collection",
      items: [{ kind: "reference", value: "entity:stereotype-entity" }],
    });
    expect(target.relations["relation:order-identifiable"]!.endpoints).toEqual([
      { role: "source", target: "entity:order" },
      { role: "target", target: "entity:identifiable" },
    ]);
  });

  it("refuses a stereotype applied outside its extends", () => {
    const doc = source();
    doc.entities["entity:stereotype-entity"] = {
      id: "entity:stereotype-entity", profile: "uml@1", type: "stereotype",
      attributes: {
        name: { kind: "text", value: "entity" },
        extends: { kind: "collection", items: [{ kind: "text", value: "interface" }] },
      },
    };
    const report = migrateUmlV1ToV2(doc, {
      stereotypes: { entity: "entity:stereotype-entity" },
    });
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "stereotype-application-invalid" },
    ]);
  });

  it("refuses a dangling stereotype mapping resolved in no document", () => {
    const report = migrateUmlV1ToV2(source(), {
      stereotypes: { entity: "entity:stereotype-entity" },
    });
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "unmapped-stereotype" },
    ]);
  });

  it("refuses a stereotype mapping that names a non-stereotype record", () => {
    const report = migrateUmlV1ToV2(source(), {
      stereotypes: { entity: "entity:order" },
    });
    expect(report.outcome).toBe("refused");
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "stereotype-application-invalid" },
    ]);
  });

  it("refuses untrimmable multiplicity text and reversed ranges", () => {
    const withDeclaration = (doc: MigDocument): MigDocument => {
      const next = structuredClone(doc);
      next.entities["s"] = {
        id: "s", profile: "uml@1", type: "stereotype",
        attributes: {
          name: { kind: "text", value: "entity" },
          extends: { kind: "collection", items: [{ kind: "text", value: "class" }] },
        },
      };
      return next;
    };
    const doc = source();
    const badText = withDeclaration(structuredClone(doc));
    (badText.entities["entity:order-total"]!.attributes["multiplicity"] as { value: string }).value = " 1";
    expect(migrateUmlV1ToV2(badText, { stereotypes: { entity: "s" } }).unmigrated).toEqual([
      { path: "entities.entity:order-total.attributes.multiplicity", reason: "multiplicity-syntax" },
    ]);
    const reversed = withDeclaration(structuredClone(doc));
    (reversed.entities["entity:order-total"]!.attributes["multiplicity"] as { value: string }).value = "5..1";
    expect(migrateUmlV1ToV2(reversed, { stereotypes: { entity: "s" } }).unmigrated).toEqual([
      { path: "entities.entity:order-total.attributes.multiplicity", reason: "multiplicity-invalid" },
    ]);
  });
});

describe("lossless copy-then-patch (design note A, finding 2)", () => {
  const generic = (): MigDocument =>
    nativeInput(JSON.parse(readFileSync(join(fixtures, "generic-v1-minimal-document.json"), "utf8")) as MigDocument);

  it("retains authored domain attributes on generic records", () => {
    const doc = generic();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["domainNote"] = {
      kind: "text", value: "MUST SURVIVE",
    };
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.entities["entity:node-a"]!.attributes["domainNote"]).toEqual({
      kind: "text", value: "MUST SURVIVE",
    });
    expect(report.operations.some((o) =>
      o.path === "entities.entity:node-a.attributes.domainNote" && o.action === "retain-domain-attribute",
    )).toBe(true);
  });

  it("retains authored domain attributes on archimate records", () => {
    const doc = loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument;
    (doc.entities["entity:actor"]!.attributes as Record<string, unknown>)["domainNote"] = {
      kind: "text", value: "MUST SURVIVE",
    };
    const report = migrateArchimateV1ToV2(doc, {
      "entity:actor": "business-actor",
      "entity:process": "business-process",
      "entity:component": "application-component",
    });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.entities["entity:actor"]!.attributes["domainNote"]).toEqual({
      kind: "text", value: "MUST SURVIVE",
    });
    expect(report.target!.entities["entity:actor"]!.attributes["name"]).toEqual({
      kind: "text", value: "Claims officer",
    });
  });

  it("resolves archimate refinements to their nearest catalogue ancestor", () => {
    const doc = loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument;
    doc.typeDefinitions = {
      "custom-actor": {
        id: "custom-actor", profile: "archimate@1", baseType: "business-actor",
        attributes: [{ name: "domainNote", kind: "text", maxLength: 200 }],
      },
    };
    doc.entities["entity:actor"] = {
      ...doc.entities["entity:actor"]!, type: "custom-actor",
      attributes: {
        ...doc.entities["entity:actor"]!.attributes,
        domainNote: { kind: "text", value: "MUST SURVIVE" },
      },
    };
    const report = migrateArchimateV1ToV2(doc, {
      "entity:actor": "business-actor",
      "entity:process": "business-process",
      "entity:component": "application-component",
    });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration " + JSON.stringify(report.unmigrated));
    expect(report.target!.entities["entity:actor"]!.type).toBe("custom-actor");
    expect(report.target!.entities["entity:actor"]!.attributes["domainNote"]).toEqual({
      kind: "text", value: "MUST SURVIVE",
    });
  });

  it("refuses an archimate mapping that contradicts the refinement ancestry", () => {
    const doc = loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument;
    doc.typeDefinitions = {
      "custom-actor": {
        id: "custom-actor", profile: "archimate@1", baseType: "business-actor", attributes: [],
      },
    };
    doc.entities["entity:actor"] = { ...doc.entities["entity:actor"]!, type: "custom-actor" };
    const report = migrateArchimateV1ToV2(doc, {
      "entity:actor": "application-component",
      "entity:process": "business-process",
      "entity:component": "application-component",
    });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:actor.type", reason: "incompatible-attribute-schema" },
    ]);
  });

  it("refuses an incompatible archimate refinement redeclaration", () => {
    const doc = loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument;
    doc.typeDefinitions = {
      "custom-actor": {
        id: "custom-actor", profile: "archimate@1", baseType: "business-actor",
        attributes: [{ name: "name", kind: "boolean" }],
      },
    };
    doc.entities["entity:actor"] = { ...doc.entities["entity:actor"]!, type: "custom-actor" };
    const report = migrateArchimateV1ToV2(doc, {
      "entity:actor": "business-actor",
      "entity:process": "business-process",
      "entity:component": "application-component",
    });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([
      {
        path: "typeDefinitions.custom-actor.attributes.name",
        reason: "type-definition-conflict",
        detail: "incompatible-attribute-schema",
      },
    ]);
  });

  it("keeps the complete target valid: endpoints and native fields survive", () => {
    const doc = generic();
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(doc));
    for (const id of Object.keys(doc.entities).sort()) {
      expect(report.target!.entities[id]!.id).toBe(id);
    }
    for (const id of Object.keys(doc.relations).sort()) {
      expect(report.target!.relations[id]!.endpoints).toEqual(doc.relations[id]!.endpoints);
    }
  });
});

describe("per-view presentation scoping (design note B, new findings)", () => {
  const generic = (): MigDocument =>
    nativeInput(JSON.parse(readFileSync(join(fixtures, "generic-v1-minimal-document.json"), "utf8")) as MigDocument);
  const fullView = (viewId: string, occurrences: Record<string, string>): MigDocument["views"] => [{
    viewId, semanticDocumentId: "document:generic-1-minimal", revision: 0,
    entityOccurrences: Object.fromEntries(
      Object.entries(occurrences).map(([occ, entity]) => [occ, { id: occ, entity, geometry: { x: 0, y: 0, width: 460, height: 200 } }]),
    ),
    relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } },
  }] as unknown as MigDocument["views"];

  it("keys moves by (view id, occurrence id), never by occurrence alone", () => {
    const doc = generic();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "NODE" };
    (doc.entities["entity:box"]!.attributes as Record<string, unknown>)["kicker"] = { kind: "text", value: "BOX" };
    const report = migrateGenericV1ToV2(doc, {
      views: [
        ...fullView("view:1", { "occurrence:a": "entity:node-a" })!,
        ...fullView("view:2", { "occurrence:a": "entity:box" })!,
      ],
      contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) },
    });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration " + JSON.stringify(report.unmigrated));
    const views = Object.fromEntries(report.target!.views!.map((v) => [v.viewId, v]));
    const textOf = (viewId: string): unknown =>
      (views[viewId]!.presentation as Record<string, Record<string, Record<string, Record<string, unknown>>>>)
        ["diagram"]["entities"]["occurrence:a"]["text"];
    expect(textOf("view:1")).toMatchObject({ kicker: "NODE" });
    expect(textOf("view:2")).toMatchObject({ kicker: "BOX" });
    // The report keys moves per view: one shared occurrence id never merges.
    expect(report.presentationMoves).toEqual({
      "view:1/occurrence:a": { kicker: "NODE" },
      "view:2/occurrence:a": { kicker: "BOX" },
    });
  });

  it("leaves unrelated profiles and their domain attributes untouched", () => {
    const doc = generic();
    (doc.entities as Record<string, MigDocument["entities"][string]>)["entity:foreign"] = {
      id: "entity:foreign", profile: "other@1", type: "widget",
      attributes: { body: { kind: "text", value: "legitimate semantic body" } },
    };
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.entities["entity:foreign"]).toEqual(doc.entities["entity:foreign"]);
  });

  it("commits requested fold groups into the views, not a side ledger", () => {
    const doc = generic();
    const report = migrateGenericV1ToV2(doc, {
      views: fullView("view:1", { "occurrence:a": "entity:box" }),
      seedFolds: true,
    });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.entities["entity:box"]!.attributes["collapsed"]).toBeUndefined();
    expect(report.target!.views![0]!.groups).toMatchObject({
      "grp.1.a": { id: "grp.1.a", occurrence: "occurrence:a", collapsed: true },
    });
  });

  it("refuses a view whose occurrence names no migrated entity", () => {
    const doc = generic();
    const report = migrateGenericV1ToV2(doc, {
      views: fullView("view:1", { "occurrence:ghost": "entity:missing" }),
    });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
  });
});

describe("refinement resolution (design note A, finding 5)", () => {
  const generic = (): MigDocument =>
    nativeInput(JSON.parse(readFileSync(join(fixtures, "generic-v1-minimal-document.json"), "utf8")) as MigDocument);
  const withRefinement = (
    doc: MigDocument, typeId: string, baseType: string, schemas: Record<string, unknown>,
  ): MigDocument => {
    const next = structuredClone(doc);
    next.typeDefinitions = {
      ...(next.typeDefinitions as Record<string, unknown>),
      [typeId]: { id: typeId, profile: "generic@1", baseType, attributes: Object.values(schemas) },
    };
    next.entities[`entity:${typeId}`] = {
      id: `entity:${typeId}`, profile: "generic@1", type: typeId,
      attributes: { name: { kind: "text", value: "Refined" } },
    };
    return next;
  };

  it("promotes compatible refinements and keeps compliant values", () => {
    const doc = withRefinement(generic(), "custom-node", "node", {
      domainNote: { name: "domainNote", kind: "text", maxLength: 200 },
    });
    (doc.entities["entity:custom-node"]!.attributes as Record<string, unknown>)["domainNote"] = {
      kind: "text", value: "kept",
    };
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration " + JSON.stringify(report.unmigrated));
    expect(report.target!.entities["entity:custom-node"]!.attributes["domainNote"]).toEqual({
      kind: "text", value: "kept",
    });
  });

  it("refuses an incompatible same-kind schema overlap", () => {
    const doc = withRefinement(generic(), "custom-node", "node", {
      category: { name: "category", kind: "boolean" },
    });
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "typeDefinitions.custom-node.attributes.category",
      reason: "type-definition-conflict",
      detail: "incompatible-attribute-schema",
    }]);
  });

  it("refuses an incompatible value kind against the resolved schema", () => {
    const doc = generic();
    (doc.entities["entity:node-a"]!.attributes as Record<string, unknown>)["category"] = {
      kind: "boolean", value: true,
    };
    const report = migrateGenericV1ToV2(doc);
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([{
      path: "entities.entity:node-a.attributes.category",
      reason: "type-definition-conflict",
      detail: "incompatible-attribute-schema",
    }]);
  });

  it("removes semantic collapsed from refined containers", () => {
    const doc = withRefinement(generic(), "custom-box", "container", {});
    const refined = structuredClone(doc);
    (refined.entities["entity:custom-box"]!.attributes as Record<string, unknown>)["collapsed"] = {
      kind: "boolean", value: true,
    };
    const report = migrateGenericV1ToV2(refined);
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.entities["entity:custom-box"]!.attributes["collapsed"]).toBeUndefined();
    expect(report.operations.some((o) =>
      o.path === "entities.entity:custom-box.attributes.collapsed" && o.action === "remove-semantic-collapsed",
    )).toBe(true);
  });
});

describe("stereotype ownership and declaration (finding 6)", () => {
  const uml = (): MigDocument =>
    loadMig(join(fixtures, "pinned-sources", "uml-skeleton-document.json")).document as MigDocument;

  it("refuses a stereotype declaration owned by another profile", () => {
    const doc = uml();
    doc.entities["entity:foreign-stereotype"] = {
      id: "entity:foreign-stereotype", profile: "foreign@1", type: "stereotype",
      attributes: {
        name: { kind: "text", value: "entity" },
        extends: { kind: "collection", items: [{ kind: "text", value: "class" }] },
      },
    };
    const report = migrateUmlV1ToV2(doc, { stereotypes: { entity: "entity:foreign-stereotype" } });
    expect(report.outcome).toBe("refused");
    expect(report.target).toBeNull();
    expect(report.unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "stereotype-application-invalid" },
    ]);
  });

  it("converts text extends items to the declared enum values", () => {
    const doc = uml();
    doc.entities["entity:stereotype-entity"] = {
      id: "entity:stereotype-entity", profile: "uml@1", type: "stereotype",
      attributes: {
        name: { kind: "text", value: "entity" },
        extends: { kind: "collection", items: [{ kind: "text", value: "class" }] },
      },
    };
    const report = migrateUmlV1ToV2(doc, { stereotypes: { entity: "entity:stereotype-entity" } });
    expect(report.outcome).toBe("ok");
    if (report.outcome !== "ok") throw new Error("migration");
    expect(report.target!.entities["entity:stereotype-entity"]!.attributes["extends"]).toEqual({
      kind: "collection", items: [{ kind: "enum", value: "class" }],
    });
  });

  it("refuses out-of-declaration and duplicate extends items", () => {
    const doc = uml();
    doc.entities["s"] = {
      id: "s", profile: "uml@1", type: "stereotype",
      attributes: {
        name: { kind: "text", value: "entity" },
        extends: { kind: "collection", items: [{ kind: "text", value: "class" }, { kind: "text", value: "class" }] },
      },
    };
    expect(migrateUmlV1ToV2(structuredClone(doc), { stereotypes: { entity: "s" } }).unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "stereotype-application-invalid" },
    ]);
    const bad = structuredClone(doc);
    (bad.entities["s"]!.attributes["extends"] as { items: { value: string }[] }).items = [{ kind: "text", value: "toto" } as never];
    expect(migrateUmlV1ToV2(bad, { stereotypes: { entity: "s" } }).unmigrated).toEqual([
      { path: "entities.entity:order.attributes.stereotypes[0]", reason: "stereotype-application-invalid" },
    ]);
  });
});

describe("migration property: declared-invariant subset (design note E)", () => {
  it("keeps ids, endpoints and pass-through attributes byte-identical on every corpus document", () => {
    const cases: { doc: MigDocument; run: (doc: MigDocument) => ReturnType<typeof migrateGenericV1ToV2> }[] = [
      {
        doc: nativeInput(JSON.parse(readFileSync(join(fixtures, "generic-v1-minimal-document.json"), "utf8")) as MigDocument),
        run: (doc) => migrateGenericV1ToV2(doc),
      },
      {
        doc: loadMig(join(fixtures, "pinned-sources", "archimate-skeleton-document.json")).document as MigDocument,
        run: (doc) => migrateArchimateV1ToV2(doc, {
          "entity:actor": "business-actor",
          "entity:process": "business-process",
          "entity:component": "application-component",
        }),
      },
    ];
    for (const { doc, run } of cases) {
      const report = run(structuredClone(doc));
      expect(report.outcome).toBe("ok");
      if (report.outcome !== "ok") throw new Error("migration " + JSON.stringify(report.unmigrated));
      expect(canonicalBytes(report.originalCanonical)).toBe(canonicalBytes(doc));
      for (const id of Object.keys(doc.entities).sort()) {
        expect(report.target!.entities[id]!.id).toBe(id);
      }
      for (const id of Object.keys(doc.relations).sort()) {
        expect(report.target!.relations[id]!.endpoints.map((e) => [e.role, e.target])).toEqual(
          doc.relations[id]!.endpoints.map((e) => [e.role, e.target]),
        );
      }
    }
    const uml = loadMig(join(fixtures, "pinned-sources", "uml-skeleton-document.json")).document as MigDocument;
    uml.entities["s"] = {
      id: "s", profile: "uml@1", type: "stereotype",
      attributes: {
        name: { kind: "text", value: "entity" },
        extends: { kind: "collection", items: [{ kind: "text", value: "class" }] },
      },
    };
    const umlReport = migrateUmlV1ToV2(structuredClone(uml), { stereotypes: { entity: "s" } });
    expect(umlReport.outcome).toBe("ok");
    if (umlReport.outcome !== "ok") throw new Error("migration");
    expect(canonicalBytes(umlReport.originalCanonical)).toBe(canonicalBytes(uml));
    expect(umlReport.target!.relations["relation:order-identifiable"]!.endpoints).toEqual(
      uml.relations["relation:order-identifiable"]!.endpoints,
    );
  });
});
