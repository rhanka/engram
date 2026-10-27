// Engram JSON schemas for the diagram lot (frozen spec M3-R4 deb64b75, §7.1).
// Governed data only: semantic/view/presentation schemas + diagnostic code
// inventory. No executor, no validation runtime (G2: DS executes).
import { sha256Hex } from "./canonical.js";
import { canonicalBytes } from "./canonical.js";
import type { Digest, Pin } from "./types.js";

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

// --- diagram-presentation@1 contract schema (spec §3.2.2 closed shape) ---

const PRESENTATION_TEXT = {
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
    text: PRESENTATION_TEXT,
    icon: { type: "string", minLength: 1, maxLength: 40 },
    categoryRef: { type: "string", minLength: 1 },
  },
  required: ["form", "text"],
  additionalProperties: false,
};

export const DIAGRAM_PRESENTATION_CONTRACT_SCHEMA: GovernedSchema = govern(
  "diagram-presentation-schema",
  "1",
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "engram:diagram-presentation-schema/1",
    title: "diagram-presentation@1 contract",
    type: "object",
    properties: {
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
          properties: { order: { type: "array", items: { type: "string", minLength: 1 } } },
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
    },
    required: ["contractPin", "entities", "legends", "categoryTokens"],
    additionalProperties: false,
  },
);

// --- Semantic document schema over the governed families (spec §§3.1/3.9/3.11) ---

const ATTRIBUTE_VALUE = {
  type: "object",
  properties: {
    kind: { enum: ["text", "enum", "boolean", "quantity", "collection", "reference", "struct", "date"] },
  },
  required: ["kind"],
  additionalProperties: true,
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
    entities: { type: "object", additionalProperties: { type: "object" } },
    relations: { type: "object", additionalProperties: { type: "object" } },
    ports: { type: "object", additionalProperties: { type: "object" } },
  },
  required: ["documentId", "revision", "profileRefs", "entities", "relations"],
  additionalProperties: false,
});
void ATTRIBUTE_VALUE;

// --- View document schema with the typed presentation extension (spec §3.2.2) ---

export const DIAGRAM_VIEW_SCHEMA: GovernedSchema = govern("diagram-view-schema", "1", {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "engram:diagram-view-schema/1",
  title: "governed diagram ViewDocument",
  type: "object",
  properties: {
    viewId: { type: "string", minLength: 1 },
    semanticDocumentId: { type: "string", minLength: 1 },
    revision: { type: "integer", minimum: 0 },
    entityOccurrences: { type: "object", additionalProperties: { type: "object" } },
    relationOccurrences: { type: "object", additionalProperties: { type: "object" } },
    portOccurrences: { type: "object", additionalProperties: { type: "object" } },
    groups: { type: "object", additionalProperties: { type: "object" } },
    presentation: {
      type: "object",
      properties: {
        camera: { type: "object" },
        diagram: { type: "object" },
      },
      additionalProperties: true,
    },
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
export const MIGRATION_REPORT_REASONS: readonly string[] = [
  "missing-type-mapping",
  "multiplicity-syntax",
  "unmapped-stereotype",
  "missing-presentation-destination",
  "incompatible-attribute-schema",
];

export const GOVERNED_SCHEMAS: Readonly<Record<string, GovernedSchema>> = {
  "diagram-presentation-schema": DIAGRAM_PRESENTATION_CONTRACT_SCHEMA,
  "diagram-semantic-schema": DIAGRAM_SEMANTIC_SCHEMA,
  "diagram-view-schema": DIAGRAM_VIEW_SCHEMA,
};
