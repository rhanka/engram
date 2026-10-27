/**
 * `generic@1` - the only COMPLETE profile of this lot (SPEC 3.3).
 *
 * "Complete" means: every type, role, cardinality, constraint and limit a
 * document may rely on is declared here, and every one of them is exercised by
 * a test or a fixture. It carries no BPMN, ArchiMate or UML semantics: a visual
 * shape induces no business status (study section 4.3, last row).
 */

import type { Profile } from "../profile.js";

export const GENERIC_PROFILE_ID = "generic@1" as const;

/** The declared containment hierarchy: a tree, so cycles are refused. */
export const GENERIC_CONTAINMENT_HIERARCHY = "containment" as const;

export const genericProfile: Profile = {
  id: GENERIC_PROFILE_ID,
  name: "generic",
  version: 1,
  completeness: "complete",
  entityTypes: [
    {
      id: "node",
      label: "Node",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "state", kind: "enum", values: ["draft", "active", "retired"] },
        // A single declared unit is how this profile PINS a unit: a bare number
        // is still refused, because the value carries its own kind.
        { name: "weight", kind: "quantity", units: ["unit"] },
        { name: "duration", kind: "quantity", units: ["s", "min", "h"] },
        { name: "createdAt", kind: "date" },
        { name: "pinned", kind: "boolean" },
        { name: "tags", kind: "collection", item: { kind: "text", maxLength: 40 }, maxItems: 8 },
        // A typed reference attribute: the namespace is declared, so an
        // occurrence id here is `reference-type-mismatch`, not a stray string.
        { name: "owner", kind: "reference", refKind: "entity" },
      ],
    },
    {
      id: "container",
      label: "Container",
      attributes: [
        { name: "name", kind: "text", required: true, maxLength: 200 },
        { name: "collapsed", kind: "boolean" },
      ],
    },
  ],
  portTypes: [
    {
      id: "port",
      label: "Port",
      directions: ["in", "out", "inout"],
      attributes: [{ name: "label", kind: "text", maxLength: 80 }],
    },
  ],
  relationTypes: [
    {
      id: "link",
      label: "Link",
      direction: "directed",
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
      id: "contains",
      label: "Contains",
      direction: "directed",
      roles: [
        // Only a container parents. This is the type matrix doing its job.
        { role: "parent", cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: ["container"] },
        { role: "child", cardinality: { min: 1, max: 1 }, targets: ["entity"] },
      ],
      hierarchy: {
        id: GENERIC_CONTAINMENT_HIERARCHY,
        shape: "tree",
        parentRole: "parent",
        childRole: "child",
      },
    },
    {
      id: "association",
      label: "Association",
      direction: "undirected",
      roles: [
        // A hyperrelation: 2 to 8 members under ONE role, one business id. A
        // projection may turn it into a junction node; the id survives.
        { role: "member", cardinality: { min: 2, max: 8 }, targets: ["entity"] },
      ],
      attributes: [{ name: "label", kind: "text", maxLength: 120 }],
    },
  ],
  constraints: [
    { kind: "acyclic-hierarchy", hierarchyId: GENERIC_CONTAINMENT_HIERARCHY },
    { kind: "unique-attribute", entityType: "container", attribute: "name" },
    { kind: "max-entities-of-type", entityType: "container", max: 64 },
  ],
  limits: {
    maxEntities: 100_000,
    maxRelations: 500_000,
    maxEndpointsPerRelation: 8,
  },
  notes: [
    "Complete profile: every declaration here is exercised by a test or a fixture in this package.",
    "Business cycles are legal through `link` and `association`; only the declared `containment` tree refuses them.",
    "No BPMN/ArchiMate/UML status is induced by any shape or name in this profile.",
  ],
};
