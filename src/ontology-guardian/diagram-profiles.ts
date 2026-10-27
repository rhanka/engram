// Engram diagram profile declarations (frozen spec M3-R4 deb64b75, §7.1).
// Governed data + pure derivation only. No executor, layout or rendering (G2).
// Digests are computed through src/ontology-guardian (never re-implemented).
import { canonicalBytes, sha256Hex } from "./canonical.js";
import { contentDiagramDigest } from "./digests.js";
import type { DiagramProfileProjection } from "./digests.js";
import type { Digest, Pin } from "./types.js";
import {
  ARCHIMATE_CATALOGUE,
  ARCHIMATE_CONCEPT_NAMES,
  ARCHIMATE_MATRIX_CELLS,
  RELATION_KEY,
} from "./diagram-matrix-data.js";

// ---------------------------------------------------------------------------
// Shared native declaration helpers (spec Appendix A.4 recipe, transcribed)
// ---------------------------------------------------------------------------

type Json = unknown;

function text(name: string, maxLength?: number, required = false): Json {
  return { name, kind: "text", ...(required ? { required: true } : {}), ...(maxLength === undefined ? {} : { maxLength }) };
}
function bool(name: string): Json {
  return { name, kind: "boolean" };
}
function enumeration(name: string, values: readonly string[], required = false): Json {
  return { name, kind: "enum", values: [...values], ...(required ? { required: true } : {}) };
}
function role(name: string, targets: readonly string[], entityTypes?: readonly string[]): Json {
  return { role: name, cardinality: { min: 1, max: 1 }, targets: [...targets], ...(entityTypes === undefined ? {} : { entityTypes: [...entityTypes] }) };
}
function pair(id: string, entityTypes?: readonly string[], targets: readonly string[] = ["entity"]): Record<string, Json> {
  return { id, label: id, direction: "directed", roles: [role("source", targets, entityTypes), role("target", targets, entityTypes)] };
}
function hierarchy(id: string, hierarchyId: string, parentType: string, childTypes?: readonly string[]): Record<string, Json> {
  return {
    id, label: id, direction: "directed",
    roles: [role("parent", ["entity"], [parentType]), role("child", ["entity"], childTypes)],
    hierarchy: { id: hierarchyId, shape: "tree", parentRole: "parent", childRole: "child" },
  };
}

export interface GovernedProfile {
  readonly declaration: Record<string, Json>;
  readonly contentDigest: Digest;
  readonly artifactDigest: Digest;
}

function govern(id: string, declaration: Record<string, Json>, projection: DiagramProfileProjection): GovernedProfile {
  void id;
  return {
    declaration,
    contentDigest: contentDiagramDigest(projection),
    artifactDigest: sha256Hex(canonicalBytes(declaration)),
  };
}

// ---------------------------------------------------------------------------
// generic@2 — replacement base (spec §3.1). Independent lineage, not a child.
// ---------------------------------------------------------------------------

const GENERIC_NODE_ATTRS: readonly Json[] = [
  { name: "name", kind: "text", required: true, maxLength: 200 },
  { name: "state", kind: "enum", values: ["draft", "active", "retired"] },
  { name: "weight", kind: "quantity", units: ["unit"] },
  { name: "duration", kind: "quantity", units: ["s", "min", "h"] },
  { name: "createdAt", kind: "date" },
  { name: "pinned", kind: "boolean" },
  { name: "tags", kind: "collection", item: { kind: "text", maxLength: 40 }, maxItems: 8 },
  { name: "owner", kind: "reference", refKind: "entity" },
  { name: "category", kind: "text", maxLength: 40 },
];

function generic2Declaration(): Record<string, Json> {
  return {
    id: "generic@2",
    name: "generic",
    version: 2,
    completeness: "complete",
    entityTypes: [
      { id: "node", label: "Node", attributes: [...GENERIC_NODE_ATTRS] },
      {
        id: "container", label: "Container", container: true,
        attributes: [
          { name: "name", kind: "text", required: true, maxLength: 200 },
          { name: "category", kind: "text", maxLength: 40 },
        ],
      },
      {
        id: "legend", label: "Legend", container: true,
        attributes: [
          { name: "name", kind: "text", required: true, maxLength: 200 },
          { name: "description", kind: "text", maxLength: 600 },
        ],
      },
      {
        id: "legend-key", label: "Legend key",
        attributes: [
          { name: "name", kind: "text", required: true, maxLength: 120 },
          { name: "category", kind: "text", required: true, maxLength: 40 },
          { name: "description", kind: "text", maxLength: 200 },
        ],
      },
    ],
    portTypes: [
      {
        id: "port", label: "Port", directions: ["in", "out", "inout"],
        attributes: [{ name: "label", kind: "text", maxLength: 80 }],
      },
    ],
    relationTypes: [
      {
        id: "link", label: "Link", direction: "directed",
        roles: [
          { role: "source", cardinality: { min: 1, max: 1 }, targets: ["entity", "port"] },
          { role: "target", cardinality: { min: 1, max: 1 }, targets: ["entity", "port"] },
        ],
        attributes: [
          { name: "label", kind: "text", maxLength: 200 },
          { name: "weight", kind: "quantity", units: ["unit"] },
        ],
      },
      {
        id: "contains", label: "Contains", direction: "directed",
        roles: [
          { role: "parent", cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: ["container", "legend"] },
          { role: "child", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
        ],
        hierarchy: { id: "containment", shape: "tree", parentRole: "parent", childRole: "child" },
      },
      {
        id: "association", label: "Association", direction: "undirected",
        roles: [{ role: "member", cardinality: { min: 2, max: 8 }, targets: ["entity"] }],
        attributes: [{ name: "label", kind: "text", maxLength: 120 }],
      },
    ],
    constraints: [
      { kind: "acyclic-hierarchy", hierarchyId: "containment" },
      { kind: "children-restricted", hierarchyId: "containment", parentType: "legend", childTypes: ["legend-key"] },
      { kind: "required-parent", hierarchyId: "containment", childType: "legend-key", parentTypes: ["legend"] },
      { kind: "unique-attribute", entityType: "legend-key", attribute: "category", scope: "within-legend" },
    ],
    limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },
    notes: [],
  };
}

function toProjection(declaration: Record<string, Json>, profile: string): DiagramProfileProjection {
  const limits = declaration["limits"] as { maxEntities?: number; maxRelations?: number; maxEndpointsPerRelation?: number };
  return {
    profile,
    completeness: declaration["completeness"] as "skeleton" | "complete",
    entityTypes: declaration["entityTypes"] as readonly unknown[],
    portTypes: declaration["portTypes"] as readonly unknown[],
    relationTypes: declaration["relationTypes"] as readonly unknown[],
    constraints: declaration["constraints"] as readonly unknown[],
    limits: { maxEntities: limits.maxEntities, maxRelations: limits.maxRelations, maxEndpointsPerRelation: limits.maxEndpointsPerRelation },
  };
}

export const GENERIC_V2: GovernedProfile = govern("generic@2", generic2Declaration(), toProjection(generic2Declaration(), "generic@2"));

// ---------------------------------------------------------------------------
// archimate@2 / uml@2 — A.4 deterministic expansion over the pinned catalogue
// ---------------------------------------------------------------------------

export const ARCHIMATE_RELATIONSHIP_IDS = [
  "composition", "aggregation", "assignment", "realization",
  "serving", "access", "influence", "triggering", "flow", "association", "specialization",
] as const;

export function expandArchimateTuples(): { relationType: string; sourceType: string; targetType: string }[] {
  const typeId = (name: string): string =>
    name === "Relationship" ? "@relation" : name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const out: { relationType: string; sourceType: string; targetType: string }[] = [];
  ARCHIMATE_MATRIX_CELLS.forEach((row, i) => {
    row.split(" ").forEach((keys, j) => {
      if (keys === "-") return;
      for (const k of keys) {
        out.push({ relationType: RELATION_KEY[k]!, sourceType: typeId(ARCHIMATE_CONCEPT_NAMES[i]!), targetType: typeId(ARCHIMATE_CONCEPT_NAMES[j]!) });
      }
    });
  });
  return out;
}

function archimate2Declaration(): Record<string, Json> {
  const tuples = expandArchimateTuples();
  return {
    id: "archimate@2", name: "archimate", version: 2, completeness: "complete",
    entityTypes: [
      { id: "element", label: "Element", abstract: true, attributes: [] },
      ...ARCHIMATE_CATALOGUE.map((c) => ({
        id: c.id, label: c.name, supertypes: ["element"],
        ...(c.id === "grouping" ? { container: true } : {}),
        attributes: [
          ...(c.id === "junction"
            ? [enumeration("operator", ["and", "or"], true)]
            : [text("name", 200, c.id !== "grouping")]),
          ...(c.layer === "none" ? [] : [enumeration("layer", [c.layer], true)]),
          enumeration("aspect", [c.aspect]),
        ],
      })),
    ],
    portTypes: [],
    relationTypes: [
      ...ARCHIMATE_RELATIONSHIP_IDS.map((id) => ({
        ...pair(id, undefined, ["entity", "relation"]),
        ...(id === "access"
          ? { attributes: [enumeration("accessMode", ["write", "read", "unspecified", "read-write"])] }
          : id === "influence"
            ? { attributes: [text("strength")] }
            : id === "association"
              ? { attributes: [bool("directed")] }
              : {}),
      })),
      hierarchy("groupingContainment", "archimate-grouping", "grouping", ["element"]),
    ],
    constraints: [
      { kind: "acyclic-hierarchy", hierarchyId: "archimate-grouping" },
      { kind: "relationship-matrix", matrixId: "archimate-3.2", sourceRole: "source", targetRole: "target", tuples },
      { kind: "incident-type-uniformity", matrixId: "archimate-3.2", entityType: "junction", relationTypes: [...ARCHIMATE_RELATIONSHIP_IDS] },
    ],
    limits: { maxEndpointsPerRelation: 2 },
    notes: [],
  };
}

const visibility = (): Json => enumeration("visibility", ["public", "protected", "private", "package"]);
const stereotypes = (): Json => ({
  name: "stereotypes", kind: "collection",
  item: { kind: "reference", refKind: "entity", targetTypes: ["stereotype"] }, maxItems: 8,
});
const common = (): Json[] => [text("name", 200, true), visibility(), stereotypes()];
const multiplicity = (name: string): Json => ({ name, kind: "struct", targetTypes: ["multiplicity"] });
const aggregation = (name: string): Json => enumeration(name, ["none", "shared", "composite"]);

function uml2Declaration(): Record<string, Json> {
  const generalization = pair("generalization", ["class", "interface"]);
  generalization["hierarchy"] = { id: "uml-generalization", shape: "dag", parentRole: "target", childRole: "source" };
  return {
    id: "uml@2", name: "uml", version: 2, completeness: "complete",
    entityTypes: [
      { id: "class", label: "Class", attributes: [...common(), bool("abstract"), bool("isStatic")] },
      { id: "interface", label: "Interface", attributes: common() },
      { id: "package", label: "Package", container: true, attributes: common() },
      {
        id: "property", label: "Property",
        attributes: [...common(), text("typeName", 200), multiplicity("multiplicity"), bool("isDerived"), bool("isStatic")],
      },
      {
        id: "operation", label: "Operation",
        attributes: [...common(), text("returnTypeName", 200), bool("isStatic")],
      },
      {
        id: "stereotype", label: "Stereotype",
        attributes: [
          text("name", 60, true),
          {
            name: "extends", kind: "collection", required: true,
            item: { kind: "enum", values: ["class", "interface", "package", "property", "operation"] },
            minItems: 1, maxItems: 5,
          },
        ],
      },
      {
        id: "multiplicity", label: "Multiplicity", abstract: true,
        attributes: [
          { name: "lower", kind: "quantity", required: true, units: ["unit"], integer: true, min: 0, max: 9007199254740991 },
          { name: "upper", kind: "quantity", required: true, units: ["unit"], integer: true, min: -1, max: 9007199254740991 },
          bool("isOrdered"), bool("isUnique"),
        ],
      },
    ],
    portTypes: [],
    relationTypes: [
      {
        ...pair("association", ["class", "interface"]),
        attributes: [multiplicity("sourceMultiplicity"), multiplicity("targetMultiplicity"), aggregation("sourceAggregation"), aggregation("targetAggregation")],
      },
      generalization,
      pair("dependency"),
      hierarchy("packageContainment", "uml-package-containment", "package"),
    ],
    constraints: [
      { kind: "acyclic-hierarchy", hierarchyId: "uml-package-containment" },
      { kind: "acyclic-hierarchy", hierarchyId: "uml-generalization" },
      { kind: "bound-pair", valueType: "multiplicity", lowerField: "lower", upperField: "upper", unboundedUpper: -1 },
      { kind: "reference-application", attribute: "stereotypes", declarationType: "stereotype", allowedTypesField: "extends" },
      { kind: "at-most-value", relationType: "association", attributes: ["sourceAggregation", "targetAggregation"], value: "composite", max: 1 },
      { kind: "collection-unique", entityType: "stereotype", attribute: "extends" },
    ],
    limits: { maxEndpointsPerRelation: 2 },
    notes: [],
  };
}

export const ARCHIMATE_V2: GovernedProfile = govern("archimate@2", archimate2Declaration(), toProjection(archimate2Declaration(), "archimate@2"));
export const UML_V2: GovernedProfile = govern("uml@2", uml2Declaration(), toProjection(uml2Declaration(), "uml@2"));

// ---------------------------------------------------------------------------
// diagram-presentation@1 — G0 contract artifact (spec §3.2.1, mechanism-descriptor)
// ---------------------------------------------------------------------------

export const DIAGRAM_PRESENTATION_ID = "diagram-presentation@1" as const;
export const DIAGRAM_PRESENTATION_COMPATIBILITY = "1" as const;

/** Contract schema digest: SHA-256 over the RFC 8785 bytes of the contract schema. */
export function contractSchemaDigest(schema: unknown): Digest {
  return sha256Hex(canonicalBytes(schema));
}

export interface ContractBinding {
  readonly artifactKind: "contract";
  readonly schemaPin: Pin;
  readonly compatibilityMatrixVersion: "1";
}

export function diagramPresentationBinding(schemaPin: Pin): ContractBinding {
  return { artifactKind: "contract", schemaPin, compatibilityMatrixVersion: DIAGRAM_PRESENTATION_COMPATIBILITY };
}

/** All governed @2 profiles of this lot, keyed by ProfileId. */
export const GOVERNED_PROFILES: Readonly<Record<string, GovernedProfile>> = {
  "generic@2": GENERIC_V2,
  "archimate@2": ARCHIMATE_V2,
  "uml@2": UML_V2,
};
