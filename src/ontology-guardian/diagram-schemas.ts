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

// --- Semantic document schema over the governed families (spec §§2.1/3.1/3.9/3.11) ---
// Complete native shape: schemaVersion, typeDefinitions, resources and
// extensions are retained (§3.13.7); entity/relation records always carry
// their id, profile and type.

const ENTITY_RECORD = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    profile: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
    attributes: { type: "object" },
  },
  required: ["id", "profile", "type", "attributes"],
  additionalProperties: false,
};

const ENDPOINT_RECORD = {
  type: "object",
  properties: {
    role: { type: "string", minLength: 1 },
    target: { type: "string", minLength: 1 },
  },
  required: ["role", "target"],
  additionalProperties: false,
};

const RELATION_RECORD = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    profile: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
    endpoints: { type: "array", items: ENDPOINT_RECORD },
    attributes: { type: "object" },
  },
  required: ["id", "profile", "type", "endpoints", "attributes"],
  additionalProperties: false,
};

export const DIAGRAM_SEMANTIC_SCHEMA: GovernedSchema = govern("diagram-semantic-schema", "1", {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "engram:diagram-semantic-schema/1",
  title: "governed diagram SemanticDocument",
  type: "object",
  properties: {
    documentId: { type: "string", minLength: 1 },
    revision: { type: "integer", minimum: 0 },
    profileRefs: {
      type: "array",
      items: { enum: ["generic@2", "archimate@2", "uml@2", "generic@1", "archimate@1", "uml@1"] },
      minItems: 1,
    },
    schemaVersion: {
      type: "object",
      properties: {
        major: { type: "integer", minimum: 0 },
        minor: { type: "integer", minimum: 0 },
      },
      required: ["major", "minor"],
      additionalProperties: false,
    },
    entities: { type: "object", additionalProperties: ENTITY_RECORD },
    relations: { type: "object", additionalProperties: RELATION_RECORD },
    ports: { type: "object", additionalProperties: { type: "object" } },
    typeDefinitions: { type: "object", additionalProperties: { type: "object" } },
    resources: { type: "object" },
    extensions: { type: "array" },
    views: { type: "array", items: { type: "object" } },
  },
  required: ["documentId", "revision", "profileRefs", "entities", "relations"],
  additionalProperties: false,
});

// --- View document schema with the typed presentation extension (spec §§2.2/3.2.2/4.4.2) ---

const ENTITY_OCCURRENCE = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    entity: { type: "string", minLength: 1 },
  },
  required: ["id", "entity"],
  additionalProperties: true,
};

const RELATION_ENDPOINT_OCCURRENCE = {
  type: "object",
  properties: {
    role: { type: "string", minLength: 1 },
    occurrence: { type: "string", minLength: 1 },
    semanticTarget: { type: "string", minLength: 1 },
    sourceOccurrence: { type: "string", minLength: 1 },
  },
  required: ["role", "occurrence"],
  additionalProperties: false,
};

const RELATION_OCCURRENCE = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    relation: { type: "string", minLength: 1 },
    endpoints: { type: "array", items: RELATION_ENDPOINT_OCCURRENCE },
    waypoints: { type: "array", items: { type: "object" } },
    strokeStyle: { enum: ["solid", "dashed"] },
  },
  required: ["id", "relation", "endpoints"],
  additionalProperties: true,
};

const SUMMARY_DEFINITION = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    sourceOccurrence: { type: "string", minLength: 1 },
    targetOccurrence: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    relationIds: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
    strokeStyle: { enum: ["solid", "dashed"] },
  },
  required: ["sourceOccurrence", "targetOccurrence", "label", "relationIds"],
  additionalProperties: false,
};

export const DIAGRAM_VIEW_SCHEMA: GovernedSchema = govern("diagram-view-schema", "1", {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "engram:diagram-view-schema/1",
  title: "governed diagram ViewDocument",
  type: "object",
  properties: {
    viewId: { type: "string", minLength: 1 },
    semanticDocumentId: { type: "string", minLength: 1 },
    revision: { type: "integer", minimum: 0 },
    entityOccurrences: { type: "object", additionalProperties: ENTITY_OCCURRENCE },
    relationOccurrences: { type: "object", additionalProperties: RELATION_OCCURRENCE },
    portOccurrences: { type: "object", additionalProperties: { type: "object" } },
    groups: { type: "object", additionalProperties: { type: "object" } },
    filters: { type: "array", items: { type: "object" } },
    presentation: {
      type: "object",
      properties: {
        camera: { type: "object" },
        grid: { type: "object" },
        theme: { type: "string" },
        diagram: {
          type: "object",
          properties: DIAGRAM_VALUE_PROPERTIES,
          required: DIAGRAM_VALUE_REQUIRED,
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    summaryLabels: { type: "object", additionalProperties: SUMMARY_DEFINITION },
  },
  required: ["viewId", "semanticDocumentId", "revision"],
  additionalProperties: false,
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
  "endpoint-role-unknown",
  "relationship-matrix-violation",
];

export const GOVERNED_SCHEMAS: Readonly<Record<string, GovernedSchema>> = {
  "diagram-presentation-schema": DIAGRAM_PRESENTATION_CONTRACT_SCHEMA,
  "diagram-semantic-schema": DIAGRAM_SEMANTIC_SCHEMA,
  "diagram-view-schema": DIAGRAM_VIEW_SCHEMA,
};
