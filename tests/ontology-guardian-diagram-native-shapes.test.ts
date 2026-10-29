// Independent fixtures from pinned document.ts/view.ts/attributes.ts, with
// explicit M3 additions. Required fields come from the native TypeScript AST,
// never from the schemas under test. Ajv executes the negative fixtures.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type tsTypes from "typescript";
import { corpusBytes, corpusJson, testsDir } from "./diagram-corpus-support.js";
import { DIAGRAM_PRESENTATION_CONTRACT_SCHEMA, DIAGRAM_SEMANTIC_SCHEMA, DIAGRAM_VIEW_SCHEMA } from "../src/ontology-guardian/diagram-schemas.js";
import { checkViewShape } from "../src/ontology-guardian/diagram-view-shape.js";
import { checkSemanticShape } from "../src/ontology-guardian/diagram-document-shape.js";

const ts = createRequire(join(testsDir, "native-shapes.cjs"))("typescript") as typeof tsTypes;
const nativeRequired = new Map<string, string[]>();
const spec = corpusBytes("spec:frozen").toString();
const presentationTypes = spec.slice(spec.indexOf("#### 3.2.2 Closed persisted shape")).match(/~~~ts\n([\s\S]*?)\n~~~/)![1]!;
for (const [id, bytes] of [["ds:document.ts", corpusBytes("ds:document.ts").toString()], ["ds:view.ts", corpusBytes("ds:view.ts").toString()], ["M3:3.2.2", presentationTypes]]) {
  const tree = ts.createSourceFile(id!, bytes!, ts.ScriptTarget.Latest, true);
  for (const node of tree.statements) {
    if (ts.isInterfaceDeclaration(node)) nativeRequired.set(node.name.text,
      node.members.filter(ts.isPropertySignature).filter(member => !member.questionToken).map(member => member.name.getText(tree)));
  }
}
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validators = { semantic: ajv.compile(DIAGRAM_SEMANTIC_SCHEMA.schema), view: ajv.compile(DIAGRAM_VIEW_SCHEMA.schema), presentation: ajv.compile(DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.schema) };
const geometry = { x: 0, y: 0, width: 460, height: 200 };
const entity = { id: "entity:a", profile: "generic@2", type: "node", attributes: { name: { kind: "text", value: "A" } } };
const semantic = { documentId: "document:shapes", schemaVersion: { major: 1, minor: 1 }, revision: 0,
  profileRefs: ["generic@2"], entities: { "entity:a": entity }, relations: {}, ports: {}, resources: {}, extensions: [], typeDefinitions: {} };
const view = { viewId: "view:shapes", semanticDocumentId: semantic.documentId, revision: 0,
  entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:a", geometry } },
  relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } } };
const presentation = { contractPin: { id: "diagram-presentation", version: "1", contentDigest: "a".repeat(64) },
  entities: {}, legends: {}, categoryTokens: [] };
const directPresentation = validators.presentation;
validators.presentation = ((input: unknown): boolean => {
  const result = directPresentation(input);
  expect(validators.view({ ...view, presentation: { ...view.presentation, diagram: input } })).toBe(result);
  return result as boolean;
}) as typeof directPresentation;
type Kind = keyof typeof validators;
type Path = (string | number)[];
function replace(kind: Kind, path: Path, value: unknown): unknown {
  if (path.length === 0) return value;
  const root = structuredClone(kind === "semantic" ? semantic : kind === "view" ? view : presentation) as Record<string, any>;
  let cursor: any = root;
  for (const key of path.slice(0, -1)) cursor = cursor[key] ??= {};
  cursor[path.at(-1)!] = value;
  return root;
}
function wrongType(value: unknown): unknown {
  if (typeof value === "string") return 42;
  if (typeof value === "number") return "42";
  if (typeof value === "boolean") return "true";
  return null;
}
function fixture(name: string, kind: Kind, path: Path, value: Record<string, unknown>, required = nativeRequired.get(name), checkViewGuard = true): void {
  if (required === undefined) throw new Error(`untranscribed native interface ${name}`);
  describe(`native shape ${name} (${kind}:${path.join("/")})`, () => {
    const check = (v: unknown, expected: boolean): void => {
      const input = replace(kind, path, v);
      expect(validators[kind](input), JSON.stringify(validators[kind].errors)).toBe(expected);
      if (kind === "semantic") expect(checkSemanticShape(input) === null).toBe(expected);
      if (kind === "view" && checkViewGuard) expect(checkViewShape(input) === null).toBe(expected);
      if (kind === "presentation") expect(checkViewShape({ ...view, presentation: { ...view.presentation, diagram: input } }) === null).toBe(expected);
    };
    it("accepts the full native record", () => check(value, true));
    it("rejects a non-record", () => check(null, false));
    it("checks the empty-record boundary", () => check({}, required!.length === 0));
    it("rejects an extra property", () => check({ ...value, accidental: true }, false));
    for (const key of ["constructor", "__proto__", "toString"]) it(`rejects an extra own ${key} property`, () => check({ ...value, [key]: true }, false));
    for (const key of required) it(`rejects missing ${key}`, () => {
      const incomplete = structuredClone(value); delete incomplete[key]; check(incomplete, false);
    });
    for (const [key, original] of Object.entries(value)) {
      it(`rejects wrong type for ${key}`, () => check({ ...value, [key]: wrongType(original) }, false));
      it(`rejects null for ${key}`, () => check({ ...value, [key]: null }, false));
      if (Array.isArray(original)) it(`rejects a malformed item in ${key}`, () => check({ ...value, [key]: [wrongType(original[0])] }, false));
      if (Array.isArray(original)) it(`rejects a null item in ${key}`, () => check({ ...value, [key]: [null] }, false));
      if (!required.includes(key) && key !== "semanticTarget" && key !== "sourceOccurrence") it(`accepts absent optional ${key}`, () => {
        const absent = structuredClone(value); delete absent[key]; check(absent, true);
      });
    }
  });
}

fixture("SemanticDocument", "semantic", [], semantic);
fixture("SchemaVersion", "semantic", ["schemaVersion"], { major: 1, minor: 1 });
fixture("Entity", "semantic", ["entities", "entity:a"], entity);
const endpoint = { role: "source", target: "entity:a" };
const relation = { id: "relation:a", profile: "generic@2", type: "link", endpoints: [endpoint], attributes: {} };
fixture("Relation", "semantic", ["relations", "relation:a"], relation);
// Install enclosing relation for the endpoint fixture.
const originalRelation = semantic.relations as Record<string, unknown>;
originalRelation["relation:a"] = relation;
fixture("RelationEndpoint", "semantic", ["relations", "relation:a", "endpoints", 0], endpoint);
fixture("SemanticPort", "semantic", ["ports", "port:a"], { id: "port:a", profile: "generic@2", type: "port", owner: "entity:a", name: "input", direction: "in", attributes: {} });
fixture("TypeDefinition", "semantic", ["typeDefinitions", "custom"], { id: "custom", profile: "generic@2", baseType: "node", label: "Domain node", attributes: [{ name: "domainNote", kind: "text", maxLength: 200 }] });
fixture("ResourceDescriptor", "semantic", ["resources", "resource:a"], { id: "resource:a", uri: "urn:example:a", mediaType: "text/plain", contentHash: "a".repeat(64), byteLength: 1 });
fixture("PreservedExtension", "semantic", ["extensions", 0], { namespace: "urn:foreign", schemaVersion: "1", scope: { kind: "document" }, validation: "preserved-unvalidated", contentHash: "a".repeat(64), source: "opaque" });
(semantic.extensions as unknown[]).push({ namespace: "urn:foreign", schemaVersion: "1", scope: { kind: "document" }, validation: "preserved-unvalidated", contentHash: "a".repeat(64) });
for (const kind of ["document", "entity", "relation", "port"]) {
  const scope = kind === "document" ? { kind } : { kind, target: `${kind}:a` };
  fixture(`ExtensionScope:${kind}`, "semantic", ["extensions", 0, "scope"], scope, Object.keys(scope));
}

const values = [
  { kind: "text", value: "a" }, { kind: "boolean", value: true }, { kind: "date", value: "2026-10-27" },
  { kind: "quantity", value: 1, unit: "unit" }, { kind: "enum", value: "active" }, { kind: "reference", value: "entity:a" },
  { kind: "collection", items: [{ kind: "reference", value: "entity:a" }] },
  { kind: "struct", type: "multiplicity", fields: { lower: { kind: "quantity", value: 0, unit: "unit" }, upper: { kind: "quantity", value: -1, unit: "unit" } } },
];
for (const value of values) fixture(`AttributeValue:${value.kind}`, "semantic", ["entities", "entity:a", "attributes", "value"], value, Object.keys(value));
const schemas = [
  { name: "t", kind: "text", required: true, minLength: 1, maxLength: 200, pattern: "^[a-z]+$", patternName: "key" },
  { name: "b", kind: "boolean", required: false }, { name: "d", kind: "date" },
  { name: "q", kind: "quantity", units: ["unit"], integer: true, min: 0, max: 100 },
  { name: "e", kind: "enum", values: ["a", "b"] },
  { name: "r", kind: "reference", refKind: "entity", targetTypes: ["node"] },
  { name: "s", kind: "struct", targetTypes: ["multiplicity"] },
  { name: "c", kind: "collection", item: { kind: "text", maxLength: 40 }, minItems: 0, maxItems: 8 },
];
(semantic.typeDefinitions as Record<string, unknown>)["custom"] = { id: "custom", profile: "generic@2", baseType: "node", attributes: [] };
for (const schema of schemas) {
  const required = ["name", "kind", ...({ quantity: ["units"], enum: ["values"], reference: ["refKind"], struct: ["targetTypes"], collection: ["item", "maxItems"] }[schema.kind] ?? [])];
  fixture(`AttributeSchema:${schema.kind}`, "semantic", ["typeDefinitions", "custom", "attributes", 0], schema, required);
}
(semantic.typeDefinitions as Record<string, unknown>)["custom"] = { id: "custom", profile: "generic@2", baseType: "node", attributes: [{ name: "c", kind: "collection", item: { kind: "text" }, maxItems: 8 }] };
for (const schema of schemas.filter(schema => schema.kind !== "collection")) {
  const { name: _name, required: _required, ...item } = schema;
  const required = ["kind", ...({ quantity: ["units"], enum: ["values"], reference: ["refKind"], struct: ["targetTypes"] }[item.kind] ?? [])];
  fixture(`ScalarSchema:${item.kind}`, "semantic", ["typeDefinitions", "custom", "attributes", 0, "item"], item, required);
}
fixture("ViewDocument", "view", [], view);
fixture("Geometry", "view", ["entityOccurrences", "occurrence:a", "geometry"], geometry);
fixture("EntityOccurrence", "view", ["entityOccurrences", "occurrence:a"], { id: "occurrence:a", entity: "entity:a", geometry, group: "group:a", z: 2 });
const relationOccurrence = { id: "occurrence:r", relation: "relation:a", endpoints: [{ role: "source", occurrence: "occurrence:a" }], waypoints: [{ x: 1, y: 2 }], strokeStyle: "dashed" };
(view.relationOccurrences as Record<string, unknown>)["occurrence:r"] = relationOccurrence;
fixture("RelationOccurrence", "view", ["relationOccurrences", "occurrence:r"], relationOccurrence);
fixture("RelationOccurrenceEndpoint", "view", ["relationOccurrences", "occurrence:r", "endpoints", 0], { role: "source", occurrence: "occurrence:a", semanticTarget: "entity:a", sourceOccurrence: "occurrence:a" });
fixture("Point", "view", ["relationOccurrences", "occurrence:r", "waypoints", 0], { x: 1, y: 2 });
fixture("PortOccurrence", "view", ["portOccurrences", "occurrence:p"], { id: "occurrence:p", port: "port:a", ownerOccurrence: "occurrence:a", side: "east", order: 1, anchor: 0.5 });
fixture("VisualGroup", "view", ["groups", "group:a"], { id: "group:a", label: "Group", collapsed: true, occurrence: "occurrence:a" });
fixture("PresentationState", "view", ["presentation"], { camera: { x: 0, y: 0, zoom: 1 }, grid: { size: 8, snap: true }, theme: "light" });
fixture("Camera", "view", ["presentation", "camera"], { x: 0, y: 0, zoom: 1 }, ["x", "y", "zoom"]);
fixture("Grid", "view", ["presentation", "grid"], { size: 8, snap: true }, ["size", "snap"]);
// The governed summary schema retains its pinned shape; the M3 guard is tested separately below.
fixture("SummaryLabelDefinition", "view", ["summaryLabels", "sum:a"], { id: "sum:a", sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a", label: "Summary", relationIds: ["relation:a"], strokeStyle: "solid" }, ["sourceOccurrence", "targetOccurrence", "label", "relationIds"], false);
describe("summary definition shape (M3 §4.5.1)", () => {
  const summary = { id: "sum:a", sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a", label: "Summary", relationIds: ["relation:a"] };
  const input = (value: unknown): unknown => replace("view", ["summaryLabels", "sum:a"], value);
  it("rejects a missing id at the summary id path", () => {
    const { id: _id, ...withoutId } = summary;
    expect(checkViewShape(input(withoutId))).toBe("summaryLabels.sum:a.id");
  });
  it("accepts optional relation occurrence references", () => {
    expect(checkViewShape(input({ ...summary, relationOccurrences: ["o1"] }))).toBeNull();
  });
  it("rejects non-list relation occurrences at their path", () => {
    for (const relationOccurrences of [null, "o1", {}]) {
      expect(checkViewShape(input({ ...summary, relationOccurrences }))).toBe("summaryLabels.sum:a.relationOccurrences");
    }
  });
  it("rejects non-string relation occurrence items at their index", () => {
    for (const item of [null, 42, {}]) {
      expect(checkViewShape(input({ ...summary, relationOccurrences: ["o1", item] }))).toBe("summaryLabels.sum:a.relationOccurrences.1");
    }
  });
  it("accepts an empty label", () => {
    expect(checkViewShape(input({ ...summary, label: "" }))).toBeNull();
  });
  it("rejects unknown summary properties at their path", () => {
    expect(checkViewShape(input({ ...summary, accidental: true }))).toBe("summaryLabels.sum:a.accidental");
  });
  it("leaves ordering, distinctness and key agreement to DS validation", () => {
    expect(checkViewShape(input({ ...summary, id: "sum:b", relationIds: ["relation:b", "relation:a", "relation:a"],
      relationOccurrences: ["o2", "o1", "o1"] }))).toBeNull();
  });
  it("accepts an empty optional relation occurrence list", () => {
    expect(checkViewShape(input({ ...summary, relationOccurrences: [] }))).toBeNull();
  });
  it("retains the non-empty relation id list requirement", () => {
    expect(checkViewShape(input({ ...summary, relationIds: [] }))).toBe("summaryLabels.sum:a.relationIds");
  });
});
fixture("DiagramPresentation", "presentation", [], presentation);
fixture("ContractPin", "presentation", ["contractPin"], presentation.contractPin, ["id", "version", "contentDigest"]);
const entityPresentation = { form: "card", text: { title: "A", kicker: "K", body: "B", detail: "D", subtitle: "S", footer: "F" }, icon: "window", categoryRef: "entity:key" };
(presentation.entities as Record<string, unknown>)["occurrence:a"] = entityPresentation;
fixture("EntityPresentation", "presentation", ["entities", "occurrence:a"], entityPresentation);
fixture("PresentationText", "presentation", ["entities", "occurrence:a", "text"], entityPresentation.text);
fixture("LegendPresentation", "presentation", ["legends", "occurrence:legend"], { order: ["entity:key"] });
fixture("CategoryTokenBinding", "presentation", ["categoryTokens", 0], { legendRef: "entity:legend", category: "key", token: "st.category" });
describe("every presentation bound and grammar", () => {
  for (const [slot, max] of Object.entries({ title: 200, kicker: 80, body: 400, detail: 400, subtitle: 600, footer: 120 })) {
    it(`enforces ${slot} <= ${max}`, () => {
      expect(validators.presentation(replace("presentation", ["entities", "occurrence:a", "text", slot], "x".repeat(max)))).toBe(true);
      expect(validators.presentation(replace("presentation", ["entities", "occurrence:a", "text", slot], "x".repeat(max + 1)))).toBe(false);
      expect(checkViewShape({ ...view, presentation: { ...view.presentation, diagram: replace("presentation", ["entities", "occurrence:a", "text", slot], "x".repeat(max + 1)) } })).not.toBeNull();
    });
  }
  for (const form of ["card", "container", "legend", "legend-key"]) it(`enforces the title boundary for ${form}`, () => {
    const max = form === "legend-key" ? 120 : 200;
    expect(validators.presentation(replace("presentation", ["entities", "occurrence:a"], { form, text: { title: "x".repeat(max) } }))).toBe(true);
    expect(validators.presentation(replace("presentation", ["entities", "occurrence:a"], { form, text: { title: "x".repeat(max + 1) } }))).toBe(false);
  });
  for (const invalid of ["", "X", "x".repeat(41)]) it(`rejects icon ${JSON.stringify(invalid)}`, () =>
    expect(validators.presentation(replace("presentation", ["entities", "occurrence:a", "icon"], invalid))).toBe(false));
  for (const category of ["", "X", "x".repeat(41)]) it(`rejects category ${JSON.stringify(category)}`, () =>
    expect(validators.presentation(replace("presentation", ["categoryTokens", 0], { legendRef: "entity:legend", category, token: "st.category" }))).toBe(false));
  for (const token of ["", "X", "x".repeat(81)]) it(`rejects token ${JSON.stringify(token)}`, () =>
    expect(validators.presentation(replace("presentation", ["categoryTokens", 0], { legendRef: "entity:legend", category: "key", token }))).toBe(false));
  it("rejects duplicate legend order and empty nominal references", () => {
    expect(validators.presentation(replace("presentation", ["legends", "occurrence:legend"], { order: ["entity:key", "entity:key"] }))).toBe(false);
    expect(validators.presentation(replace("presentation", ["legends", "occurrence:legend"], { order: [""] }))).toBe(false);
    expect(validators.presentation(replace("presentation", ["entities", "occurrence:a", "categoryRef"], ""))).toBe(false);
    expect(validators.presentation(replace("presentation", ["categoryTokens", 0], { legendRef: "", category: "key", token: "st.category" }))).toBe(false);
  });
  it("rejects malformed digest text in the contract and its view embedding", () => {
    for (const contentDigest of ["", "g".repeat(64), "a".repeat(63), "A".repeat(64)]) {
      expect(validators.presentation(replace("presentation", ["contractPin", "contentDigest"], contentDigest))).toBe(false);
    }
  });
  it("retains the explicitly declared minima alongside the grammars", () => {
    for (const schema of [DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.schema, (DIAGRAM_VIEW_SCHEMA.schema as any).properties.presentation.properties.diagram] as any[]) {
      expect(schema.properties.entities.additionalProperties.properties.icon.minLength).toBe(1);
      expect(schema.properties.categoryTokens.items.properties.category.minLength).toBe(1);
      expect(schema.properties.categoryTokens.items.properties.token.minLength).toBe(1);
      const conditional = schema.properties.entities.additionalProperties.allOf[0];
      // Parent form/text/title constraints make these three encodings
      // behaviorally redundant; they remain explicit governed schema data.
      expect(conditional.if.required).toEqual(["form"]);
      expect(conditional.then.properties.text.type).toBe("object");
      expect(conditional.then.properties.text.properties.title.type).toBe("string");
    }
  });
  it("checks revision lower bounds and both provenance dependencies", () => {
    expect(validators.semantic(replace("semantic", ["revision"], -1))).toBe(false);
    expect(validators.view(replace("view", ["revision"], -1))).toBe(false);
    expect(validators.view(replace("view", ["summaryLabels"], null))).toBe(false);
    const summary = { sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a", label: "Summary", relationIds: ["relation:a"] };
    expect(validators.view(replace("view", ["summaryLabels", "sum:a"], { ...summary, label: "" }))).toBe(false);
    expect(validators.view(replace("view", ["summaryLabels", "sum:a"], { ...summary, relationIds: [] }))).toBe(false);
    for (const field of ["semanticTarget", "sourceOccurrence"]) {
      const input = replace("view", ["relationOccurrences", "occurrence:r", "endpoints", 0], { role: "source", occurrence: "occurrence:a", [field]: "entity:a" });
      expect(validators.view(input)).toBe(false); expect(checkViewShape(input)).not.toBeNull();
    }
  });
});
for (const kind of ["entity-type", "relation-type", "attribute-equals"]) {
  const value = kind === "attribute-equals" ? { id: "filter:a", kind, attribute: "name", value: "A", mode: "include" }
    : { id: "filter:a", kind, types: ["node"], mode: "include" };
  fixture(`ViewFilter:${kind}`, "view", ["filters", 0], value, Object.keys(value));
}
describe("recursive values and closed unions", () => {
  it("rejects object-shaped refinement attributes and valueless references", () => {
    const definition = { id: "custom", profile: "generic@2", baseType: "node", attributes: {} };
    expect(validators.semantic(replace("semantic", ["typeDefinitions", "custom"], definition))).toBe(false);
    expect(validators.semantic(replace("semantic", ["entities", "entity:a", "attributes", "value"], { kind: "reference", refKind: "entity" }))).toBe(false);
  });
  for (const direction of ["in", "out", "inout"]) it(`accepts native port direction ${direction}`, () => {
    expect(validators.semantic(replace("semantic", ["ports", "port:p"], { id: "port:p", profile: "generic@2", type: "port", owner: "entity:a", name: "P", direction, attributes: {} }))).toBe(true);
  });
  for (const side of ["north", "east", "south", "west"]) it(`accepts native port side ${side}`, () => {
    const input = replace("view", ["portOccurrences", "occurrence:p"], { id: "occurrence:p", port: "port:p", ownerOccurrence: "occurrence:a", side, order: 0, anchor: 0 });
    expect(validators.view(input)).toBe(true); expect(checkViewShape(input)).toBeNull();
  });
  for (const kind of ["entity-type", "relation-type", "attribute-equals"]) for (const mode of ["include", "exclude"]) it(`accepts filter ${kind}/${mode}`, () => {
    const value = kind === "attribute-equals" ? { id: "filter:a", kind, attribute: "name", value: "A", mode } : { id: "filter:a", kind, types: ["node"], mode };
    const input = replace("view", ["filters", 0], value);
    expect(validators.view(input)).toBe(true); expect(checkViewShape(input)).toBeNull();
    expect(validators.view(replace("view", ["filters", 0], { ...value, mode: "banana" }))).toBe(false);
  });
  for (const kind of ["document", "entity", "relation", "port"]) for (const validation of ["validated", "preserved-unvalidated", "unsupported"]) it(`accepts extension ${kind}/${validation}`, () => {
    const value = { namespace: "urn:foreign", schemaVersion: "1", scope: kind === "document" ? { kind } : { kind, target: "entity:a" }, validation, contentHash: "a".repeat(64) };
    expect(validators.semantic(replace("semantic", ["extensions", 0], value))).toBe(true);
    expect(validators.semantic(replace("semantic", ["extensions", 0], { ...value, scope: { kind: "banana" } }))).toBe(false);
  });
  for (const value of [{ kind: "reference" }, { kind: "collection", items: [{}] }, { kind: "struct", type: "multiplicity", fields: { lower: {} } }])
    it(`rejects ${JSON.stringify(value)}`, () => expect(validators.semantic(replace("semantic", ["entities", "entity:a", "attributes", "value"], value))).toBe(false));
  for (const anchor of [-0.1, 1.1]) it(`rejects anchor ${anchor}`, () => {
    const input = replace("view", ["portOccurrences", "occurrence:p"], { id: "occurrence:p", port: "port:a", ownerOccurrence: "occurrence:a", side: "east", order: 0, anchor });
    expect(validators.view(input)).toBe(false); expect(checkViewShape(input)).not.toBeNull();
  });
  it("accepts the complete pinned A5 semantic and view bytes", () => {
    expect(validators.semantic(corpusJson("instance:A5-semantic")), JSON.stringify(validators.semantic.errors)).toBe(true);
    const source = corpusJson("instance:A5-view");
    expect(validators.view(source), JSON.stringify(validators.view.errors)).toBe(true);
    expect(checkViewShape(source)).toBeNull();
  });
});
