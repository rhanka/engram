// Engram JSON schemas for the diagram lot (frozen spec M3-R4 deb64b75, §7.1).
// Governed data only: semantic/view/presentation schemas + diagnostic code
// inventory. No executor, no validation runtime (G2: DS executes). Shapes
// transcribe the native §2.1/§2.2/§3.2.2/§4.4.2 contracts; full behavioral
// validation stays DS execution (U-QUAL).
import { sha256Hex } from "./canonical.js";
import { canonicalBytes } from "./canonical.js";
import type { Digest, Pin } from "./types.js";
import type { MigrationRefusalReason } from "./diagram-migrations.js";

export interface GovernedSchema {
  readonly pin: Pin;
  readonly schema: Record<string, unknown>;
  readonly digest: Digest;
}

function govern(id: string, version: string, schema: Record<string, unknown>): GovernedSchema {
  const digest = sha256Hex(canonicalBytes(schema));
  return { pin: { id, version, contentDigest: digest }, schema, digest };
}

const KEY_GRAMMAR = { type: "string", minLength: 1, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$" };
const TOKEN_GRAMMAR = {
  type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)*$",
};
const ICON_GRAMMAR = { type: "string", minLength: 1, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$" };

// --- diagram-presentation@1 contract shape (spec §3.2.2 closed shape) ---
// Shared single source: the contract schema and the view schema embed the
// same closed diagram value. Title bound is form-dependent: legend-key
// titles admit 120, every other form 200 (§3.2.2).

const PRESENTATION_TEXT_BASE = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 200 },
    kicker: { type: "string", maxLength: 80 },
    body: { type: "string", maxLength: 400 },
    detail: { type: "string", maxLength: 400 },
    subtitle: { type: "string", maxLength: 600 },
    footer: { type: "string", maxLength: 120 },
  },
  additionalProperties: false,
};

const ENTITY_PRESENTATION = {
  type: "object",
  properties: {
    form: { enum: ["card", "container", "legend", "legend-key"] },
    text: PRESENTATION_TEXT_BASE,
    icon: ICON_GRAMMAR,
    categoryRef: { type: "string", minLength: 1 },
  },
  required: ["form", "text"],
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { form: { const: "legend-key" } }, required: ["form"] },
      then: { properties: { text: { type: "object", properties: { title: { type: "string", maxLength: 120 } } } } },
    },
  ],
};

const DIAGRAM_VALUE_PROPERTIES = {
  contractPin: {
    type: "object",
    properties: {
      id: { const: "diagram-presentation" },
      version: { const: "1" },
      contentDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    },
    required: ["id", "version", "contentDigest"],
    additionalProperties: false,
  },
  entities: { type: "object", additionalProperties: ENTITY_PRESENTATION },
  legends: {
    type: "object",
    additionalProperties: {
      type: "object",
      properties: { order: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true } },
      required: ["order"],
      additionalProperties: false,
    },
  },
  categoryTokens: {
    type: "array",
    items: {
      type: "object",
      properties: {
        legendRef: { type: "string", minLength: 1 },
        category: KEY_GRAMMAR,
        token: TOKEN_GRAMMAR,
      },
      required: ["legendRef", "category", "token"],
      additionalProperties: false,
    },
  },
};

const DIAGRAM_VALUE_REQUIRED = ["contractPin", "entities", "legends", "categoryTokens"];

export const DIAGRAM_PRESENTATION_CONTRACT_SCHEMA: GovernedSchema = govern(
  "diagram-presentation-schema",
  "1",
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "engram:diagram-presentation-schema/1",
    title: "diagram-presentation@1 contract",
    type: "object",
    properties: DIAGRAM_VALUE_PROPERTIES,
    required: DIAGRAM_VALUE_REQUIRED,
    additionalProperties: false,
  },
);

// Native shapes: DS f6f3ba37 document.ts, view.ts and attributes.ts, carried
// verbatim in the corpus. K1/K2/K6 and persisted M3 additions are explicit.
// Schema validation establishes shape; registry/type/reference execution is DS.
type Shape = Record<string, unknown>;
const string: Shape = { type: "string" };
const number: Shape = { type: "number" };
const boolean: Shape = { type: "boolean" };
const strings: Shape = { type: "array", items: string };
const object = (properties: Record<string, unknown>, required: readonly string[]): Shape =>
  ({ type: "object", properties, required, additionalProperties: false });
const map = (value: Shape): Shape => ({ type: "object", additionalProperties: value });
const array = (items: Shape): Shape => ({ type: "array", items });
const choice = (...values: string[]): Shape => ({ enum: values });
const ref = (name: string): Shape => ({ $ref: "#/$defs/" + name });

// AttributeValue is recursive through K6 fields and collection items.
const scalarValues = ["text", "boolean", "date", "quantity", "enum", "reference"].map(kind =>
  object({ kind: { const: kind }, value: kind === "boolean" ? boolean : kind === "quantity" ? number : string,
    ...(kind === "quantity" ? { unit: string } : {}) },
    kind === "quantity" ? ["kind", "value", "unit"] : ["kind", "value"]));
const valueDefinitions = {
  attributeValue: { anyOf: [
    ...scalarValues,
    object({ kind: { const: "collection" }, items: array(ref("attributeValue")) }, ["kind", "items"]),
    object({ kind: { const: "struct" }, type: string, fields: map(ref("attributeValue")) }, ["kind", "type", "fields"]),
  ] },
};
const scalarSchemas: Shape[] = [
  object({ kind: { const: "text" }, minLength: number, maxLength: number, pattern: string, patternName: string }, ["kind"]),
  object({ kind: { const: "boolean" } }, ["kind"]),
  object({ kind: { const: "date" } }, ["kind"]),
  object({ kind: { const: "quantity" }, units: strings, integer: boolean, min: number, max: number }, ["kind", "units"]),
  object({ kind: { const: "enum" }, values: strings }, ["kind", "values"]),
  object({ kind: { const: "reference" }, refKind: choice("document", "entity", "relation", "port", "resource", "view", "occurrence"), targetTypes: strings }, ["kind", "refKind"]),
  object({ kind: { const: "struct" }, targetTypes: strings }, ["kind", "targetTypes"]),
];
const attributeSchema = { anyOf: [
  ...scalarSchemas,
  object({ kind: { const: "collection" }, item: { anyOf: scalarSchemas }, maxItems: number, minItems: number }, ["kind", "item", "maxItems"]),
].map(shape => object({ ...(shape.properties as Record<string, unknown>), name: string, required: boolean },
  [...(shape.required as string[]), "name"])) };
const attributeMap = map(ref("attributeValue"));
const entity = object({ id: string, profile: string, type: string, attributes: attributeMap }, ["id", "profile", "type", "attributes"]);
const endpoint = object({ role: string, target: string }, ["role", "target"]);
const relation = object({ id: string, profile: string, type: string, endpoints: array(endpoint), attributes: attributeMap },
  ["id", "profile", "type", "endpoints", "attributes"]);
const port = object({ id: string, profile: string, type: string, owner: string, name: string,
  direction: choice("in", "out", "inout"), attributes: attributeMap },
  ["id", "profile", "type", "owner", "name", "direction", "attributes"]);
const definition = object({ id: string, profile: string, baseType: string, label: string, attributes: array(attributeSchema) },
  ["id", "profile", "baseType", "attributes"]);
const resource = object({ id: string, uri: string, mediaType: string, contentHash: string, byteLength: number },
  ["id", "uri", "mediaType", "contentHash"]);
const scope = { anyOf: [object({ kind: { const: "document" } }, ["kind"]),
  ...["entity", "relation", "port"].map(kind => object({ kind: { const: kind }, target: string }, ["kind", "target"]))] };
const extension = object({ namespace: string, schemaVersion: string, scope,
  validation: choice("validated", "preserved-unvalidated", "unsupported"), contentHash: string, source: string },
  ["namespace", "schemaVersion", "scope", "validation", "contentHash"]);

export const DIAGRAM_SEMANTIC_SCHEMA: GovernedSchema = govern("diagram-semantic-schema", "1", {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "engram:diagram-semantic-schema/1", $defs: valueDefinitions,
  ...object({ documentId: string, schemaVersion: object({ major: number, minor: number }, ["major", "minor"]),
    revision: { type: "integer", minimum: 0 }, profileRefs: strings, typeDefinitions: map(definition),
    entities: map(entity), relations: map(relation), ports: map(port), resources: map(resource), extensions: array(extension) },
  ["documentId", "schemaVersion", "revision", "profileRefs", "typeDefinitions", "entities", "relations", "ports", "resources", "extensions"]),
});

const point = object({ x: number, y: number }, ["x", "y"]);
const geometry = object({ x: number, y: number, width: number, height: number }, ["x", "y", "width", "height"]);
const entityOccurrence = object({ id: string, entity: string, geometry, group: string, z: number }, ["id", "entity", "geometry"]);
const projectedEndpoint = {
  ...object({ role: string, occurrence: string, semanticTarget: string, sourceOccurrence: string }, ["role", "occurrence"]),
  dependentRequired: { semanticTarget: ["sourceOccurrence"], sourceOccurrence: ["semanticTarget"] },
};
const relationOccurrence = object({ id: string, relation: string, endpoints: array(projectedEndpoint), waypoints: array(point),
  strokeStyle: choice("solid", "dashed") }, ["id", "relation", "endpoints"]);
const portOccurrence = object({ id: string, port: string, ownerOccurrence: string, side: choice("north", "east", "south", "west"),
  order: number, anchor: { type: "number", minimum: 0, maximum: 1 } }, ["id", "port", "ownerOccurrence", "side", "order", "anchor"]);
const group = object({ id: string, label: string, collapsed: boolean, occurrence: string }, ["id"]);
const filter = { anyOf: [
  ...["entity-type", "relation-type"].map(kind => object({ id: string, kind: { const: kind }, types: strings, mode: choice("include", "exclude") }, ["id", "kind", "types", "mode"])),
  object({ id: string, kind: { const: "attribute-equals" }, attribute: string, value: string, mode: choice("include", "exclude") }, ["id", "kind", "attribute", "value", "mode"]),
] };
const summary = object({ id: string, sourceOccurrence: string, targetOccurrence: string, label: { type: "string", minLength: 1 },
  relationIds: { type: "array", items: string, minItems: 1 }, strokeStyle: choice("solid", "dashed") },
  ["sourceOccurrence", "targetOccurrence", "label", "relationIds"]);
export const DIAGRAM_VIEW_SCHEMA: GovernedSchema = govern("diagram-view-schema", "1", {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "engram:diagram-view-schema/1",
  ...object({ viewId: string, semanticDocumentId: string, revision: { type: "integer", minimum: 0 },
    entityOccurrences: map(entityOccurrence), relationOccurrences: map(relationOccurrence), portOccurrences: map(portOccurrence),
    groups: map(group), filters: array(filter),
    presentation: object({ camera: object({ x: number, y: number, zoom: number }, ["x", "y", "zoom"]),
      grid: object({ size: number, snap: boolean }, ["size", "snap"]), theme: string,
      diagram: object(DIAGRAM_VALUE_PROPERTIES, DIAGRAM_VALUE_REQUIRED) }, ["camera"]), summaryLabels: map(summary) },
  ["viewId", "semanticDocumentId", "revision", "entityOccurrences", "relationOccurrences", "portOccurrences", "groups", "filters", "presentation"]),
});

// --- Diagnostic code inventory additions of this lot (spec Appendix C.1) ---
// Native arms stay owner-side (U-DIAG); this list is the governed binding input.

export const DIAGRAM_DIAGNOSTIC_CODES: readonly string[] = [
  "legend-key-parent-invalid",
  "tone-category-unknown",
  "text-pattern-mismatch",
  "quantity-not-integer",
  "quantity-below-min",
  "quantity-above-max",
  "relationship-matrix-violation",
  "multiplicity-invalid",
  "stereotype-application-invalid",
  "reference-target-type",
  "struct-type-unknown",
  "struct-field-not-in-schema",
  "struct-type-not-allowed",
  "supertype-unknown",
  "supertype-cycle",
  "attribute-conflict",
  "abstract-instantiated",
];

/** Migration report reason strings (spec Appendix C.1: report reasons, not diagnostics). */
export const MIGRATION_REPORT_REASONS: readonly MigrationRefusalReason[] = [
  "missing-source-profile",
  "target-already-present",
  "missing-type-mapping",
  "multiplicity-syntax",
  "multiplicity-invalid",
  "unmapped-stereotype",
  "stereotype-application-invalid",
  "missing-presentation-destination",
  "missing-presentation-contract",
  "destination-conflict",
  "incompatible-attribute-schema",
  "type-definition-conflict",
  "endpoint-role-unknown",
  "relationship-matrix-violation",
];

export const GOVERNED_SCHEMAS: Readonly<Record<string, GovernedSchema>> = {
  "diagram-presentation-schema": DIAGRAM_PRESENTATION_CONTRACT_SCHEMA,
  "diagram-semantic-schema": DIAGRAM_SEMANTIC_SCHEMA,
  "diagram-view-schema": DIAGRAM_VIEW_SCHEMA,
};
