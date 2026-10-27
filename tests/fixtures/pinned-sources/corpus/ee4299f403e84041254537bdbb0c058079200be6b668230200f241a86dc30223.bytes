/**
 * Versioned profiles (decision D1-A).
 *
 * A profile is a SCHEMA MODULE with a version in its id (`generic@1`). It
 * declares the entity, port and relation types that exist, which endpoints a
 * relation legally has, the constraints the document must satisfy, and the
 * limits it refuses to go beyond. Validation reads nothing else: there is no
 * ambient truth about "a node" or "a flow" anywhere in this package.
 *
 * `completeness` is part of the declaration, and it is not decoration. Only
 * `generic@1` is `"complete"` in this lot. `bpmn@1`, `archimate@1` and `uml@1`
 * are `"skeleton"`: their types and relation matrix are declared and validated
 * by the same machinery, their qualification fixtures are partial, and NO
 * conformance to BPMN, ArchiMate or UML is claimed. A consumer can read that
 * field and refuse to rely on them.
 */

import type { AttributeSchema } from "./attributes.js";
import { type Diagnostic, diagnostic } from "./diagnostics.js";

/** `<name>@<major>`; the major is part of the identity, so `bpmn@1` and `bpmn@2` coexist. */
export type ProfileId = `${string}@${number}`;

export type PortDirection = "in" | "out" | "inout";

export interface EntityTypeDeclaration {
  readonly id: string;
  readonly label: string;
  readonly attributes: readonly AttributeSchema[];
  /** An abstract type may be refined by a document type definition but not instantiated. */
  readonly abstract?: boolean;
}

export interface PortTypeDeclaration {
  readonly id: string;
  readonly label: string;
  readonly directions: readonly PortDirection[];
  readonly attributes?: readonly AttributeSchema[];
}

/** What a relation endpoint may point at. Entities and ports are not interchangeable. */
export type EndpointTargetKind = "entity" | "port";

export interface RelationRoleDeclaration {
  readonly role: string;
  /** How many endpoints may carry this role. `max` is required: an unbounded role is a bag. */
  readonly cardinality: { readonly min: number; readonly max: number };
  readonly targets: readonly EndpointTargetKind[];
  /** When present, the only entity types this role accepts. Absent = any declared type. */
  readonly entityTypes?: readonly string[];
}

/**
 * A relation type may declare that its instances form a HIERARCHY. `shape:
 * "tree"` is what makes `hierarchy-cycle` and `hierarchy-multiple-parents`
 * checkable; `shape: "dag"` allows several parents but still refuses cycles.
 * Business containment, processing hierarchy and visual grouping stay distinct
 * (study invariant 3): this declaration is about business containment only.
 */
export interface HierarchyDeclaration {
  readonly id: string;
  readonly shape: "tree" | "dag";
  readonly parentRole: string;
  readonly childRole: string;
}

export interface RelationTypeDeclaration {
  readonly id: string;
  readonly label: string;
  readonly direction: "directed" | "undirected";
  readonly roles: readonly RelationRoleDeclaration[];
  readonly attributes?: readonly AttributeSchema[];
  readonly hierarchy?: HierarchyDeclaration;
}

/**
 * Constraints beyond the type matrix. Every kind here is EXECUTABLE by
 * `validate.ts` - a constraint vocabulary nothing enforces would be prose in a
 * data structure.
 */
export type ProfileConstraint =
  | { readonly kind: "acyclic-hierarchy"; readonly hierarchyId: string }
  | { readonly kind: "unique-attribute"; readonly entityType: string; readonly attribute: string }
  | { readonly kind: "max-entities-of-type"; readonly entityType: string; readonly max: number };

export interface ProfileLimits {
  readonly maxEntities?: number;
  readonly maxRelations?: number;
  readonly maxEndpointsPerRelation?: number;
}

export interface Profile {
  readonly id: ProfileId;
  readonly name: string;
  readonly version: number;
  readonly completeness: "complete" | "skeleton";
  readonly entityTypes: readonly EntityTypeDeclaration[];
  readonly portTypes: readonly PortTypeDeclaration[];
  readonly relationTypes: readonly RelationTypeDeclaration[];
  readonly constraints: readonly ProfileConstraint[];
  readonly limits: ProfileLimits;
  /** Declared limits, in prose, for a human reading a skeleton profile. */
  readonly notes: readonly string[];
}

export interface ProfileRegistry {
  get(id: ProfileId): Profile | undefined;
  has(id: ProfileId): boolean;
  list(): readonly ProfileId[];
}

export function createProfileRegistry(profiles: readonly Profile[]): ProfileRegistry {
  const byId = new Map<ProfileId, Profile>();
  for (const profile of profiles) {
    const existing = byId.get(profile.id);
    if (existing !== undefined) {
      throw new Error(`profile ${profile.id} registered twice; a profile id is a version, not a name`);
    }
    byId.set(profile.id, profile);
  }
  return {
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    list: () => [...byId.keys()].sort(),
  };
}

export const entityTypeOf = (profile: Profile, typeId: string): EntityTypeDeclaration | undefined =>
  profile.entityTypes.find((type) => type.id === typeId);

export const portTypeOf = (profile: Profile, typeId: string): PortTypeDeclaration | undefined =>
  profile.portTypes.find((type) => type.id === typeId);

export const relationTypeOf = (profile: Profile, typeId: string): RelationTypeDeclaration | undefined =>
  profile.relationTypes.find((type) => type.id === typeId);

export const roleOf = (
  relationType: RelationTypeDeclaration,
  role: string,
): RelationRoleDeclaration | undefined => relationType.roles.find((declared) => declared.role === role);

/**
 * A profile is itself validated, once, when it enters a registry-backed run.
 * A profile whose hierarchy names a role it does not declare would make
 * `hierarchy-cycle` unreachable, which is worse than a loud refusal.
 */
export function validateProfile(profile: Profile): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const path = `profiles.${profile.id}`;

  const seenEntityTypes = new Set<string>();
  for (const type of profile.entityTypes) {
    if (seenEntityTypes.has(type.id)) {
      diagnostics.push(
        diagnostic({ code: "duplicate-id", path: `${path}.entityTypes.${type.id}`, message: "entity type declared twice" }),
      );
    }
    seenEntityTypes.add(type.id);
    diagnostics.push(...duplicateAttributeNames(type.attributes, `${path}.entityTypes.${type.id}.attributes`));
  }

  for (const type of profile.relationTypes) {
    const roles = new Set(type.roles.map((role) => role.role));
    for (const role of type.roles) {
      if (role.cardinality.max < role.cardinality.min || role.cardinality.min < 0) {
        diagnostics.push(
          diagnostic({
            code: "endpoint-cardinality-violation",
            path: `${path}.relationTypes.${type.id}.roles.${role.role}`,
            message: `declared cardinality ${role.cardinality.min}..${role.cardinality.max} is empty or negative`,
          }),
        );
      }
      for (const entityType of role.entityTypes ?? []) {
        if (!seenEntityTypes.has(entityType)) {
          diagnostics.push(
            diagnostic({
              code: "unknown-entity-type",
              path: `${path}.relationTypes.${type.id}.roles.${role.role}.entityTypes`,
              message: `role accepts entity type ${entityType}, which the profile does not declare`,
            }),
          );
        }
      }
    }
    const hierarchy = type.hierarchy;
    if (hierarchy !== undefined) {
      for (const role of [hierarchy.parentRole, hierarchy.childRole]) {
        if (!roles.has(role)) {
          diagnostics.push(
            diagnostic({
              code: "endpoint-role-unknown",
              path: `${path}.relationTypes.${type.id}.hierarchy`,
              message: `hierarchy ${hierarchy.id} names role ${role}, which the relation type does not declare`,
            }),
          );
        }
      }
    }
  }

  for (const constraint of profile.constraints) {
    if (constraint.kind === "acyclic-hierarchy") {
      const declared = profile.relationTypes.some((type) => type.hierarchy?.id === constraint.hierarchyId);
      if (!declared) {
        diagnostics.push(
          diagnostic({
            code: "type-definition-conflict",
            path: `${path}.constraints`,
            message: `constraint names hierarchy ${constraint.hierarchyId}, which no relation type declares`,
          }),
        );
      }
    } else if (!seenEntityTypes.has(constraint.entityType)) {
      diagnostics.push(
        diagnostic({
          code: "unknown-entity-type",
          path: `${path}.constraints`,
          message: `constraint names entity type ${constraint.entityType}, which the profile does not declare`,
        }),
      );
    }
  }

  return diagnostics;
}

function duplicateAttributeNames(attributes: readonly AttributeSchema[], path: string): readonly Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const attribute of attributes) {
    if (seen.has(attribute.name)) {
      diagnostics.push(
        diagnostic({ code: "duplicate-id", path: `${path}.${attribute.name}`, message: "attribute declared twice" }),
      );
    }
    seen.add(attribute.name);
  }
  return diagnostics;
}
