/**
 * `bpmn@1`, `archimate@1`, `uml@1` - DECLARED SKELETONS, not conformance.
 *
 * SPEC 3.3 asks this lot for "l'ossature de validation des trois autres (types
 * et matrice de relations declares, fixtures de qualification listees mais non
 * exhaustives)". So each profile below:
 *   - declares its element types and its relation types with endpoint arity, so
 *     the SAME validation machinery runs over them (unknown type, unknown role,
 *     cardinality, hierarchy cycle all work);
 *   - carries `completeness: "skeleton"`, which a consumer can read and refuse;
 *   - carries in `notes` what is NOT declared, element by element.
 *
 * What is deliberately absent, and why it is absent rather than half-written:
 *   - BPMN: no containment rule between a sequence flow and its process, no
 *     event nature/direction matrix, no gateway arity rules, no DI. A valid
 *     diagram is not an executable process; execution engines are out of scope.
 *   - ArchiMate: the versioned relation/source/target MATRIX is not declared.
 *     Eleven relation types with the right arity is not the matrix, and no
 *     conformance can be claimed without a fixture per constraint.
 *   - UML: a declared subset only (classifiers and three relations). UML does
 *     not reduce to PlantUML text, and activity/sequence diagrams need their own
 *     profiles.
 * The native profiles are GD-M3.
 */

import type { Profile, RelationTypeDeclaration } from "../profile.js";

export const BPMN_SKELETON_PROFILE_ID = "bpmn@1" as const;
export const ARCHIMATE_SKELETON_PROFILE_ID = "archimate@1" as const;
export const UML_SKELETON_PROFILE_ID = "uml@1" as const;

/** A directed source→target relation with 1..1 on each end, the shape most skeleton relations share. */
function directedPair(id: string, label: string, entityTypes?: readonly string[]): RelationTypeDeclaration {
  const endpointTypes = entityTypes === undefined ? {} : { entityTypes };
  return {
    id,
    label,
    direction: "directed",
    roles: [
      { role: "source", cardinality: { min: 1, max: 1 }, targets: ["entity"], ...endpointTypes },
      { role: "target", cardinality: { min: 1, max: 1 }, targets: ["entity"], ...endpointTypes },
    ],
  };
}

export const bpmnSkeletonProfile: Profile = {
  id: BPMN_SKELETON_PROFILE_ID,
  name: "bpmn",
  version: 1,
  completeness: "skeleton",
  entityTypes: [
    { id: "process", label: "Process", attributes: [{ name: "name", kind: "text", required: true, maxLength: 200 }] },
    { id: "participant", label: "Participant (pool)", attributes: [{ name: "name", kind: "text", required: true, maxLength: 200 }] },
    { id: "lane", label: "Lane", attributes: [{ name: "name", kind: "text", maxLength: 200 }] },
    { id: "task", label: "Task", attributes: [{ name: "name", kind: "text", maxLength: 200 }] },
    { id: "subProcess", label: "Sub-process", attributes: [{ name: "name", kind: "text", maxLength: 200 }] },
    {
      id: "event",
      label: "Event",
      attributes: [
        { name: "name", kind: "text", maxLength: 200 },
        // Position declared; the nature/direction matrix of BPMN events is NOT.
        { name: "position", kind: "enum", values: ["start", "intermediate", "end"], required: true },
      ],
    },
    {
      id: "gateway",
      label: "Gateway",
      attributes: [
        { name: "name", kind: "text", maxLength: 200 },
        { name: "gatewayKind", kind: "enum", values: ["exclusive", "inclusive", "parallel", "eventBased", "complex"], required: true },
      ],
    },
  ],
  portTypes: [{ id: "flowPort", label: "Flow port", directions: ["in", "out"] }],
  relationTypes: [
    {
      id: "sequenceFlow",
      label: "Sequence flow",
      direction: "directed",
      roles: [
        { role: "source", cardinality: { min: 1, max: 1 }, targets: ["entity", "port"] },
        { role: "target", cardinality: { min: 1, max: 1 }, targets: ["entity", "port"] },
      ],
      attributes: [
        { name: "condition", kind: "text", maxLength: 400 },
        { name: "default", kind: "boolean" },
      ],
    },
    directedPair("messageFlow", "Message flow"),
    directedPair("association", "Association"),
    {
      id: "flowElementContainment",
      label: "Flow element containment",
      direction: "directed",
      roles: [
        { role: "parent", cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: ["process", "subProcess", "participant", "lane"] },
        { role: "child", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
      ],
      hierarchy: { id: "bpmn-containment", shape: "tree", parentRole: "parent", childRole: "child" },
    },
  ],
  constraints: [{ kind: "acyclic-hierarchy", hierarchyId: "bpmn-containment" }],
  limits: { maxEndpointsPerRelation: 2 },
  notes: [
    "SKELETON. Declared: element types, sequence/message/association arity, a containment tree.",
    "NOT declared: sequence flow contained in its process, message flow between participants, event nature and direction, gateway arity, BPMN DI, IDs and refs of the XML serialisation.",
    "A diagram this profile validates is not an executable process. Execution engines are out of scope.",
    "Qualification fixtures are partial: fixtures/valid/bpmn-skeleton-document.json only.",
  ],
};

/** The eleven ArchiMate relation types, by name, with arity only - not the matrix. */
const ARCHIMATE_RELATIONS = [
  "composition",
  "aggregation",
  "assignment",
  "realization",
  "serving",
  "access",
  "influence",
  "triggering",
  "flow",
  "association",
  "specialization",
] as const;

export const archimateSkeletonProfile: Profile = {
  id: ARCHIMATE_SKELETON_PROFILE_ID,
  name: "archimate",
  version: 1,
  completeness: "skeleton",
  entityTypes: [
    {
      id: "element",
      label: "Element",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        // Layer and aspect are declared as enumerations; WHICH element types
        // exist per layer is the M3 work, so the skeleton keeps one element
        // type rather than inventing a partial list that would read as a claim.
        { name: "layer", kind: "enum", required: true, values: ["strategy", "business", "application", "technology", "physical", "motivation", "implementation"] },
        { name: "aspect", kind: "enum", values: ["active", "behaviour", "passive", "motivation"] },
      ],
    },
    { id: "junction", label: "Junction", attributes: [{ name: "operator", kind: "enum", values: ["and", "or"], required: true }] },
    { id: "grouping", label: "Grouping", attributes: [{ name: "name", kind: "text", maxLength: 200 }] },
  ],
  portTypes: [],
  relationTypes: ARCHIMATE_RELATIONS.map((id) => directedPair(id, id)),
  constraints: [],
  limits: { maxEndpointsPerRelation: 2 },
  notes: [
    "SKELETON. Declared: element/junction/grouping, the eleven relation names with 1..1 arity.",
    "NOT declared: the versioned relation/source/target matrix, access mode, viewpoints, Open Group Model Exchange namespaces.",
    "No ArchiMate conformance is claimed. Conformance needs a fixture per matrix constraint (GD-M3).",
    "Qualification fixtures are partial: fixtures/valid/archimate-skeleton-document.json only.",
  ],
};

export const umlSkeletonProfile: Profile = {
  id: UML_SKELETON_PROFILE_ID,
  name: "uml",
  version: 1,
  completeness: "skeleton",
  entityTypes: [
    {
      id: "class",
      label: "Class",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "abstract", kind: "boolean" },
        { name: "stereotypes", kind: "collection", item: { kind: "text", maxLength: 60 }, maxItems: 8 },
      ],
    },
    { id: "interface", label: "Interface", attributes: [{ name: "name", kind: "text", required: true, maxLength: 200 }] },
    { id: "package", label: "Package", attributes: [{ name: "name", kind: "text", required: true, maxLength: 200 }] },
    {
      id: "property",
      label: "Property",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "typeName", kind: "text", maxLength: 200 },
        { name: "multiplicity", kind: "text", maxLength: 20 },
      ],
    },
    {
      id: "operation",
      label: "Operation",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "returnTypeName", kind: "text", maxLength: 200 },
      ],
    },
  ],
  portTypes: [],
  relationTypes: [
    {
      id: "association",
      label: "Association",
      direction: "directed",
      roles: [
        { role: "source", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
        { role: "target", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
      ],
      attributes: [
        { name: "sourceMultiplicity", kind: "text", maxLength: 20 },
        { name: "targetMultiplicity", kind: "text", maxLength: 20 },
      ],
    },
    directedPair("generalization", "Generalization", ["class", "interface"]),
    directedPair("dependency", "Dependency"),
    {
      id: "packageContainment",
      label: "Package containment",
      direction: "directed",
      roles: [
        { role: "parent", cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: ["package"] },
        { role: "child", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
      ],
      hierarchy: { id: "uml-package-containment", shape: "tree", parentRole: "parent", childRole: "child" },
    },
  ],
  constraints: [{ kind: "acyclic-hierarchy", hierarchyId: "uml-package-containment" }],
  limits: { maxEndpointsPerRelation: 2 },
  notes: [
    "SKELETON. Declared subset: classifiers, properties, operations, association/generalization/dependency, a package containment tree.",
    "NOT declared: full multiplicity semantics, profiles and stereotype application rules, activity/sequence/state families (their own profiles).",
    "UML does not reduce to PlantUML text; the pivot is a codec concern (GD-M4).",
    "Qualification fixtures are partial: fixtures/valid/uml-skeleton-document.json only.",
  ],
};
