// Engram transcriptions of the immutable @1 skeleton declarations.
// Source bytes: DS f6f3ba37 packages/diagram-core/src/profiles/{generic,skeletons}.ts
// (pinned fixtures tests/fixtures/pinned-sources/ds-*.bytes, hashes §8.5).
// These transcriptions are migration source data only. The @1 byte sources
// stay immutable: the preservation gate hashes the pinned bytes, never this
// file. New declarations go in diagram-profiles.ts, never here.
import { contentDiagramDigest } from "./digests.js";
import type { DiagramProfileProjection } from "./digests.js";
import type { Digest, Pin } from "./types.js";

type Json = unknown;

function projection(id: string, declaration: Record<string, Json>): DiagramProfileProjection {
  const limits = declaration["limits"] as { maxEntities?: number; maxRelations?: number; maxEndpointsPerRelation?: number } | undefined;
  return {
    profile: id,
    completeness: declaration["completeness"] as "skeleton" | "complete",
    entityTypes: (declaration["entityTypes"] ?? []) as readonly unknown[],
    portTypes: (declaration["portTypes"] ?? []) as readonly unknown[],
    relationTypes: (declaration["relationTypes"] ?? []) as readonly unknown[],
    constraints: (declaration["constraints"] ?? []) as readonly unknown[],
    limits: {
      maxEntities: limits?.maxEntities,
      maxRelations: limits?.maxRelations,
      maxEndpointsPerRelation: limits?.maxEndpointsPerRelation,
    },
  };
}

function directedPair(id: string, entityTypes?: readonly string[]): Record<string, Json> {
  const extra = entityTypes === undefined ? {} : { entityTypes: [...entityTypes] };
  return {
    id, label: id, direction: "directed",
    roles: [
      { role: "source", cardinality: { min: 1, max: 1 }, targets: ["entity"], ...extra },
      { role: "target", cardinality: { min: 1, max: 1 }, targets: ["entity"], ...extra },
    ],
  };
}

// --- generic@1 (transcribed from ds-generic-ts.bytes) ---

export const GENERIC_V1_DECLARATION: Record<string, Json> = {
  id: "generic@1", name: "generic", version: 1, completeness: "complete",
  entityTypes: [
    {
      id: "node", label: "Node",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "state", kind: "enum", values: ["draft", "active", "retired"] },
        { name: "weight", kind: "quantity", units: ["unit"] },
        { name: "duration", kind: "quantity", units: ["s", "min", "h"] },
        { name: "createdAt", kind: "date" },
        { name: "pinned", kind: "boolean" },
        { name: "tags", kind: "collection", item: { kind: "text", maxLength: 40 }, maxItems: 8 },
        { name: "owner", kind: "reference", refKind: "entity" },
      ],
    },
    {
      id: "container", label: "Container",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "collapsed", kind: "boolean" },
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
        { name: "label", kind: "text", maxLength: 120 },
        { name: "weight", kind: "quantity", units: ["unit"] },
      ],
    },
    {
      id: "contains", label: "Contains", direction: "directed",
      roles: [
        { role: "parent", cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: ["container"] },
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
    { kind: "unique-attribute", entityType: "container", attribute: "name" },
    { kind: "max-entities-of-type", entityType: "container", max: 64 },
  ],
  limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },
};

// --- archimate@1 (transcribed from ds-skeletons-ts.bytes) ---

const ARCHIMATE_V1_RELATIONS = [
  "composition", "aggregation", "assignment", "realization", "serving", "access",
  "influence", "triggering", "flow", "association", "specialization",
];

export const ARCHIMATE_V1_DECLARATION: Record<string, Json> = {
  id: "archimate@1", name: "archimate", version: 1, completeness: "skeleton",
  entityTypes: [
    {
      id: "element", label: "Element",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "layer", kind: "enum", required: true, values: ["strategy", "business", "application", "technology", "physical", "motivation", "implementation"] },
        { name: "aspect", kind: "enum", values: ["active", "behaviour", "passive", "motivation"] },
      ],
    },
    {
      id: "junction", label: "Junction",
      attributes: [{ name: "operator", kind: "enum", values: ["and", "or"], required: true }],
    },
    {
      id: "grouping", label: "Grouping",
      attributes: [{ name: "name", kind: "text", maxLength: 200 }],
    },
  ],
  portTypes: [],
  relationTypes: ARCHIMATE_V1_RELATIONS.map((id) => directedPair(id)),
  constraints: [],
  limits: { maxEndpointsPerRelation: 2 },
};

// --- uml@1 (transcribed from ds-skeletons-ts.bytes) ---

export const UML_V1_DECLARATION: Record<string, Json> = {
  id: "uml@1", name: "uml", version: 1, completeness: "skeleton",
  entityTypes: [
    {
      id: "class", label: "Class",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "abstract", kind: "boolean" },
        { name: "stereotypes", kind: "collection", item: { kind: "text", maxLength: 60 }, maxItems: 8 },
      ],
    },
    {
      id: "interface", label: "Interface",
      attributes: [{ name: "name", kind: "text", required: true, maxLength: 200 }],
    },
    {
      id: "package", label: "Package",
      attributes: [{ name: "name", kind: "text", required: true, maxLength: 200 }],
    },
    {
      id: "property", label: "Property",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "typeName", kind: "text", maxLength: 200 },
        { name: "multiplicity", kind: "text", maxLength: 20 },
      ],
    },
    {
      id: "operation", label: "Operation",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "returnTypeName", kind: "text", maxLength: 200 },
      ],
    },
  ],
  portTypes: [],
  relationTypes: [
    {
      id: "association", label: "Association", direction: "directed",
      roles: [
        { role: "source", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
        { role: "target", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
      ],
      attributes: [
        { name: "sourceMultiplicity", kind: "text", maxLength: 20 },
        { name: "targetMultiplicity", kind: "text", maxLength: 20 },
      ],
    },
    directedPair("generalization", ["class", "interface"]),
    directedPair("dependency"),
    {
      id: "packageContainment", label: "Package containment", direction: "directed",
      roles: [
        { role: "parent", cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: ["package"] },
        { role: "child", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
      ],
      hierarchy: { id: "uml-package-containment", shape: "tree", parentRole: "parent", childRole: "child" },
    },
  ],
  constraints: [{ kind: "acyclic-hierarchy", hierarchyId: "uml-package-containment" }],
  limits: { maxEndpointsPerRelation: 2 },
};

export const GENERIC_V1_CONTENT: Digest = contentDiagramDigest(projection("generic@1", GENERIC_V1_DECLARATION));
export const ARCHIMATE_V1_CONTENT: Digest = contentDiagramDigest(projection("archimate@1", ARCHIMATE_V1_DECLARATION));
export const UML_V1_CONTENT: Digest = contentDiagramDigest(projection("uml@1", UML_V1_DECLARATION));

export const GENERIC_V1_PIN: Pin = { id: "generic", version: "1.0.0", contentDigest: GENERIC_V1_CONTENT };
export const ARCHIMATE_V1_PIN: Pin = { id: "archimate", version: "1.0.0", contentDigest: ARCHIMATE_V1_CONTENT };
export const UML_V1_PIN: Pin = { id: "uml", version: "1.0.0", contentDigest: UML_V1_CONTENT };
