/**
 * Validation: the only place that decides whether a document or a view is
 * writable, and the only producer of the nine named rejected cases.
 *
 * Three rules it follows without exception:
 *   1. It never repairs. A document is refused with diagnostics, never
 *      "cleaned up" - a silently dropped dangling edge is what study invariant 1
 *      forbids at the semantic level.
 *   2. It reads nothing ambient. Types, roles, cardinalities, constraints and
 *      limits come from the profile registry handed to it.
 *   3. It collects. A caller gets every diagnostic of a run, not the first, so a
 *      refused transaction can be explained in one pass.
 */

import { referencesOf, validateAttributeValue, type AttributeSchema, type AttributeValue } from "./attributes.js";
import { tryCanonicalise } from "./canonical.js";
import { type Diagnostic, diagnostic } from "./diagnostics.js";
import {
  CURRENT_SCHEMA_VERSION,
  type Entity,
  type PreservedExtension,
  type Relation,
  type SemanticDocument,
  type SemanticPort,
  scopeTargetOf,
} from "./document.js";
import { hashContent } from "./hash.js";
import {
  entityTypeOf,
  portTypeOf,
  relationTypeOf,
  roleOf,
  validateProfile,
  type Profile,
  type ProfileId,
  type ProfileRegistry,
  type RelationTypeDeclaration,
} from "./profile.js";
import { parseRef, refKindOf, type EntityRef, type PortRef, type RefKind } from "./refs.js";
import type { DiagramState } from "./state.js";
import type { ViewDocument } from "./view.js";

export interface ValidationOptions {
  readonly registry: ProfileRegistry;
}

/** Base type attributes plus the additive attributes of a document type definition. */
export function effectiveEntitySchemas(
  document: SemanticDocument,
  profile: Profile,
  typeId: string,
): { readonly schemas: readonly AttributeSchema[] } | { readonly diagnostic: Diagnostic } {
  const declared = entityTypeOf(profile, typeId);
  if (declared !== undefined) {
    if (declared.abstract === true) {
      return {
        diagnostic: diagnostic({
          code: "unknown-entity-type",
          path: `profiles.${profile.id}.entityTypes.${typeId}`,
          message: `entity type ${typeId} is abstract and cannot be instantiated`,
          details: { abstract: true },
        }),
      };
    }
    return { schemas: declared.attributes };
  }

  const definition = document.typeDefinitions[typeId];
  if (definition === undefined) {
    return {
      diagnostic: diagnostic({
        code: "unknown-entity-type",
        path: `profiles.${profile.id}.entityTypes.${typeId}`,
        message: `neither profile ${profile.id} nor the document declares entity type ${typeId}`,
        details: { type: typeId, profile: profile.id },
      }),
    };
  }
  const base = entityTypeOf(profile, definition.baseType);
  if (base === undefined) {
    return {
      diagnostic: diagnostic({
        code: "unknown-entity-type",
        path: `typeDefinitions.${typeId}.baseType`,
        message: `type definition ${typeId} refines ${definition.baseType}, which profile ${profile.id} does not declare`,
      }),
    };
  }
  return { schemas: [...base.attributes, ...definition.attributes] };
}

function validateAttributeBag(
  attributes: Readonly<Record<string, AttributeValue>>,
  schemas: readonly AttributeSchema[],
  document: SemanticDocument,
  path: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map(schemas.map((schema) => [schema.name, schema] as const));

  for (const name of Object.keys(attributes).sort()) {
    const schema = byName.get(name);
    const value = attributes[name] as AttributeValue;
    if (schema === undefined) {
      // NAMED REJECTED CASE: an attribute outside the schema is not stored as a
      // free property. Unmodelled content belongs in an extension, with its hash.
      diagnostics.push(
        diagnostic({
          code: "attribute-not-in-schema",
          path: `${path}.${name}`,
          message: `attribute ${name} is not declared by the effective schema (declared: ${[...byName.keys()].sort().join(", ") || "none"})`,
          details: { attribute: name },
        }),
      );
      continue;
    }
    diagnostics.push(...validateAttributeValue(schema, value, `${path}.${name}`));
    for (const found of referencesOf(schema, value)) {
      const location = found.index === undefined ? `${path}.${name}` : `${path}.${name}[${found.index}]`;
      diagnostics.push(...resolveReference(document, found.raw, found.refKind, location));
    }
  }

  for (const schema of schemas) {
    if (schema.required === true && attributes[schema.name] === undefined) {
      diagnostics.push(
        diagnostic({
          code: "attribute-required-missing",
          path: `${path}.${schema.name}`,
          message: `attribute ${schema.name} is required by the schema`,
          details: { attribute: schema.name },
        }),
      );
    }
  }

  return diagnostics;
}

/** Does a reference of this namespace resolve inside this document? */
function resolveReference(
  document: SemanticDocument,
  raw: string,
  expected: RefKind,
  path: string,
): readonly Diagnostic[] {
  const parsed = parseRef(expected, raw, path);
  if (!parsed.ok) return [parsed.diagnostic];
  const found =
    expected === "entity"
      ? document.entities[raw]
      : expected === "relation"
        ? document.relations[raw]
        : expected === "port"
          ? document.ports[raw]
          : expected === "resource"
            ? document.resources[raw]
            : undefined;
  if (found !== undefined) return [];
  if (expected === "occurrence" || expected === "view" || expected === "document") {
    // A document holds no occurrences and no views; those references are
    // resolved against a state, not here. Reporting them as dangling from a
    // document would be a false positive, so the schema is what refuses them.
    return [
      diagnostic({
        code: "reference-type-mismatch",
        path,
        message: `a ${expected} reference cannot be resolved from a semantic document`,
        refs: [raw],
        details: { expectedKind: expected },
      }),
    ];
  }
  return [
    diagnostic({
      code: "dangling-reference",
      path,
      message: `${raw} resolves to no ${expected} in this document`,
      refs: [raw],
      details: { expectedKind: expected },
    }),
  ];
}

function validateEntity(
  entity: Entity,
  key: string,
  document: SemanticDocument,
  options: ValidationOptions,
): readonly Diagnostic[] {
  const path = `entities.${key}`;
  const diagnostics: Diagnostic[] = [...keyMatchesId(key, entity.id, "entity", path)];
  const profile = declaredProfile(document, entity.profile, options, path);
  if ("diagnostic" in profile) return [...diagnostics, profile.diagnostic];

  const effective = effectiveEntitySchemas(document, profile.profile, entity.type);
  if ("diagnostic" in effective) return [...diagnostics, { ...effective.diagnostic, path: `${path}.type` }];

  diagnostics.push(...validateAttributeBag(entity.attributes, effective.schemas, document, `${path}.attributes`));
  return diagnostics;
}

function validatePort(
  port: SemanticPort,
  key: string,
  document: SemanticDocument,
  options: ValidationOptions,
): readonly Diagnostic[] {
  const path = `ports.${key}`;
  const diagnostics: Diagnostic[] = [...keyMatchesId(key, port.id, "port", path)];
  const profile = declaredProfile(document, port.profile, options, path);
  if ("diagnostic" in profile) return [...diagnostics, profile.diagnostic];

  diagnostics.push(...resolveReference(document, port.owner, "entity", `${path}.owner`));

  const declared = portTypeOf(profile.profile, port.type);
  if (declared === undefined) {
    diagnostics.push(
      diagnostic({
        code: "unknown-port-type",
        path: `${path}.type`,
        message: `profile ${port.profile} does not declare port type ${port.type}`,
        details: { type: port.type },
      }),
    );
    return diagnostics;
  }
  if (!declared.directions.includes(port.direction)) {
    diagnostics.push(
      diagnostic({
        code: "port-direction-not-allowed",
        path: `${path}.direction`,
        message: `port type ${port.type} allows ${declared.directions.join(", ")}, not ${port.direction}`,
        details: { direction: port.direction, allowed: declared.directions.join(",") },
      }),
    );
  }
  diagnostics.push(
    ...validateAttributeBag(port.attributes, declared.attributes ?? [], document, `${path}.attributes`),
  );
  return diagnostics;
}

function validateRelation(
  relation: Relation,
  key: string,
  document: SemanticDocument,
  options: ValidationOptions,
): readonly Diagnostic[] {
  const path = `relations.${key}`;
  const diagnostics: Diagnostic[] = [...keyMatchesId(key, relation.id, "relation", path)];
  const profile = declaredProfile(document, relation.profile, options, path);
  if ("diagnostic" in profile) return [...diagnostics, profile.diagnostic];

  const declared = relationTypeOf(profile.profile, relation.type);
  if (declared === undefined) {
    diagnostics.push(
      diagnostic({
        code: "unknown-relation-type",
        path: `${path}.type`,
        message: `profile ${relation.profile} does not declare relation type ${relation.type}`,
        details: { type: relation.type },
      }),
    );
    return diagnostics;
  }

  const maxEndpoints = profile.profile.limits.maxEndpointsPerRelation;
  if (maxEndpoints !== undefined && relation.endpoints.length > maxEndpoints) {
    diagnostics.push(
      diagnostic({
        code: "limit-exceeded",
        path: `${path}.endpoints`,
        message: `${relation.endpoints.length} endpoints; profile ${profile.profile.id} allows ${maxEndpoints}`,
        details: { limit: "maxEndpointsPerRelation", seen: relation.endpoints.length, max: maxEndpoints },
      }),
    );
  }

  const perRole = new Map<string, number>();
  relation.endpoints.forEach((endpoint, index) => {
    const endpointPath = `${path}.endpoints[${index}]`;
    const role = roleOf(declared, endpoint.role);
    if (role === undefined) {
      diagnostics.push(
        diagnostic({
          code: "endpoint-role-unknown",
          path: `${endpointPath}.role`,
          message: `relation type ${relation.type} declares ${declared.roles.map((entry) => entry.role).join(", ")}, not ${endpoint.role}`,
          details: { role: endpoint.role },
        }),
      );
      return;
    }
    perRole.set(endpoint.role, (perRole.get(endpoint.role) ?? 0) + 1);

    const seenKind = refKindOf(endpoint.target);
    if (seenKind !== "entity" && seenKind !== "port") {
      diagnostics.push(
        diagnostic({
          code: seenKind === undefined ? "malformed-ref" : "reference-type-mismatch",
          path: `${endpointPath}.target`,
          message: `an endpoint targets an entity or a port, not ${seenKind ?? JSON.stringify(endpoint.target)}`,
          refs: [String(endpoint.target)],
          ...(seenKind === undefined ? {} : { details: { seenKind } }),
        }),
      );
      return;
    }
    if (!role.targets.includes(seenKind)) {
      diagnostics.push(
        diagnostic({
          code: "endpoint-target-not-allowed",
          path: `${endpointPath}.target`,
          message: `role ${endpoint.role} accepts ${role.targets.join(", ")}, not a ${seenKind}`,
          refs: [endpoint.target],
          details: { seenKind, allowed: role.targets.join(",") },
        }),
      );
      return;
    }

    const resolution = resolveReference(document, endpoint.target, seenKind, `${endpointPath}.target`);
    diagnostics.push(...resolution);
    if (resolution.length > 0) return;

    if (seenKind === "entity" && role.entityTypes !== undefined) {
      const target = document.entities[endpoint.target] as Entity;
      if (!role.entityTypes.includes(target.type)) {
        diagnostics.push(
          diagnostic({
            code: "endpoint-target-not-allowed",
            path: `${endpointPath}.target`,
            message: `role ${endpoint.role} accepts entity types ${role.entityTypes.join(", ")}; ${target.id} is a ${target.type}`,
            refs: [target.id],
            details: { seenType: target.type, allowed: role.entityTypes.join(",") },
          }),
        );
      }
    }
  });

  for (const role of declared.roles) {
    const count = perRole.get(role.role) ?? 0;
    if (count < role.cardinality.min || count > role.cardinality.max) {
      diagnostics.push(
        diagnostic({
          code: "endpoint-cardinality-violation",
          path: `${path}.endpoints`,
          message: `role ${role.role} carries ${count} endpoints; the declared cardinality is ${role.cardinality.min}..${role.cardinality.max}`,
          details: { role: role.role, seen: count, min: role.cardinality.min, max: role.cardinality.max },
        }),
      );
    }
  }

  diagnostics.push(
    ...validateAttributeBag(relation.attributes, declared.attributes ?? [], document, `${path}.attributes`),
  );
  return diagnostics;
}

/**
 * Hierarchy shapes. Every DECLARED hierarchy refuses cycles, `tree` also refuses
 * a second parent. The `acyclic-hierarchy` profile constraint is the profile
 * restating the rule explicitly; `validateProfile` checks it names a declared
 * hierarchy, so the two can never disagree.
 */
function validateHierarchies(
  document: SemanticDocument,
  relationTypes: readonly { readonly profile: ProfileId; readonly declaration: RelationTypeDeclaration }[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const { profile, declaration } of relationTypes) {
    const hierarchy = declaration.hierarchy;
    if (hierarchy === undefined) continue;

    const childToParents = new Map<string, string[]>();
    const children = new Map<string, string[]>();

    for (const relation of Object.values(document.relations)) {
      if (relation.profile !== profile || relation.type !== declaration.id) continue;
      const parents = relation.endpoints.filter((endpoint) => endpoint.role === hierarchy.parentRole);
      const kids = relation.endpoints.filter((endpoint) => endpoint.role === hierarchy.childRole);
      for (const parent of parents) {
        for (const kid of kids) {
          childToParents.set(kid.target, [...(childToParents.get(kid.target) ?? []), parent.target]);
          children.set(parent.target, [...(children.get(parent.target) ?? []), kid.target]);
        }
      }
    }

    if (hierarchy.shape === "tree") {
      for (const [child, parents] of [...childToParents.entries()].sort()) {
        if (parents.length > 1) {
          diagnostics.push(
            diagnostic({
              code: "hierarchy-multiple-parents",
              path: `relations`,
              message: `hierarchy ${hierarchy.id} is declared a tree; ${child} has ${parents.length} parents (${parents.sort().join(", ")})`,
              refs: [child, ...parents],
              details: { hierarchy: hierarchy.id, child, parents: parents.length },
            }),
          );
        }
      }
    }

    // Iterative depth-first walk with an explicit stack: a cycle must be
    // REPORTED with its members, not merely detected, so the diagnostic carries
    // the path that closes it.
    const state = new Map<string, "visiting" | "done">();
    const walk = (start: string): void => {
      const stack: { readonly node: string; readonly path: readonly string[] }[] = [{ node: start, path: [start] }];
      while (stack.length > 0) {
        const current = stack.pop() as { readonly node: string; readonly path: readonly string[] };
        const status = state.get(current.node);
        if (status === "done") continue;
        if (current.path.slice(0, -1).includes(current.node)) {
          const cycle = current.path.slice(current.path.indexOf(current.node));
          diagnostics.push(
            diagnostic({
              code: "hierarchy-cycle",
              path: "relations",
              message: `hierarchy ${hierarchy.id} closes a cycle: ${cycle.join(" -> ")}`,
              refs: cycle,
              details: { hierarchy: hierarchy.id, shape: hierarchy.shape, length: cycle.length - 1 },
            }),
          );
          continue;
        }
        state.set(current.node, "visiting");
        for (const child of (children.get(current.node) ?? []).slice().sort()) {
          stack.push({ node: child, path: [...current.path, child] });
        }
      }
      for (const [node, status] of state) if (status === "visiting") state.set(node, "done");
    };

    for (const root of [...children.keys()].sort()) walk(root);
  }

  return diagnostics;
}

function validateConstraints(document: SemanticDocument, profile: Profile): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const entities = Object.values(document.entities).filter((entity) => entity.profile === profile.id);

  for (const constraint of profile.constraints) {
    if (constraint.kind === "acyclic-hierarchy") continue; // handled by validateHierarchies
    if (constraint.kind === "max-entities-of-type") {
      const count = entities.filter((entity) => entity.type === constraint.entityType).length;
      if (count > constraint.max) {
        diagnostics.push(
          diagnostic({
            code: "limit-exceeded",
            path: "entities",
            message: `${count} entities of type ${constraint.entityType}; profile ${profile.id} allows ${constraint.max}`,
            details: { type: constraint.entityType, seen: count, max: constraint.max },
          }),
        );
      }
      continue;
    }
    const seen = new Map<string, string>();
    // Insertion order is not content: walk the constrained entities sorted by id
    // in UTF-16 code-unit order, like every other sorted walk in this file and
    // in `canonical.ts` (`Object.keys(...).sort()`). The first id in that order
    // is the reference and is never reported.
    const constrained = entities
      .filter((candidate) => candidate.type === constraint.entityType)
      .slice()
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    for (const entity of constrained) {
      const value = entity.attributes[constraint.attribute];
      if (value === undefined) continue;
      const key = tryCanonicalise(value, "value");
      if (!key.ok) continue;
      const previous = seen.get(key.text);
      if (previous !== undefined) {
        diagnostics.push(
          diagnostic({
            code: "unique-attribute-violation",
            path: `entities.${entity.id}.attributes.${constraint.attribute}`,
            message: `attribute ${constraint.attribute} must be unique among ${constraint.entityType} entities; ${previous} carries the same value`,
            refs: [entity.id, previous],
            details: { attribute: constraint.attribute, type: constraint.entityType },
          }),
        );
      } else {
        seen.set(key.text, entity.id);
      }
    }
  }
  return diagnostics;
}

function validateExtensions(document: SemanticDocument): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  document.extensions.forEach((extension: PreservedExtension, index) => {
    const path = `extensions[${index}]`;
    if (extension.validation === "unsupported") {
      // NAMED REJECTED CASE. The content is KEPT (D3-C: preserved with its hash,
      // inspectable, exportable) but the document is not writable while it
      // carries it: an unsupported extension must never look like a fact.
      diagnostics.push(
        diagnostic({
          code: "extension-unsupported",
          path,
          message: `extension ${extension.namespace}@${extension.schemaVersion} is unsupported: preserved for inspection and export, refused for write`,
          details: { namespace: extension.namespace, schemaVersion: extension.schemaVersion },
        }),
      );
    }
    const target = scopeTargetOf(extension.scope);
    if (target !== undefined) {
      const kind = extension.scope.kind as Exclude<PreservedExtension["scope"]["kind"], "document">;
      diagnostics.push(...resolveReference(document, target, kind, `${path}.scope.target`));
    }
    if (extension.contentHash.length === 0) {
      diagnostics.push(
        diagnostic({ code: "extension-hash-mismatch", path: `${path}.contentHash`, message: "an extension carries its content hash" }),
      );
    } else if (extension.source !== undefined && hashContent(extension.source) !== extension.contentHash) {
      diagnostics.push(
        diagnostic({
          code: "extension-hash-mismatch",
          path: `${path}.contentHash`,
          message: `recorded hash ${extension.contentHash} is not the hash of the retained source (${hashContent(extension.source)})`,
          details: { recorded: extension.contentHash, computed: hashContent(extension.source) },
        }),
      );
    }
  });
  return diagnostics;
}

function keyMatchesId(key: string, id: string, kind: RefKind, path: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const parsed = parseRef(kind, id, `${path}.id`);
  if (!parsed.ok) diagnostics.push(parsed.diagnostic);
  if (key !== id) {
    diagnostics.push(
      diagnostic({
        code: "record-key-mismatch",
        path,
        message: `record key ${key} is not the element's own id ${id}`,
        refs: [key, id],
      }),
    );
  }
  return diagnostics;
}

function declaredProfile(
  document: SemanticDocument,
  id: ProfileId,
  options: ValidationOptions,
  path: string,
): { readonly profile: Profile } | { readonly diagnostic: Diagnostic } {
  if (!document.profileRefs.includes(id)) {
    return {
      diagnostic: diagnostic({
        code: "profile-not-declared",
        path: `${path}.profile`,
        message: `profile ${id} is used but not declared by the document (declared: ${document.profileRefs.join(", ") || "none"})`,
        details: { profile: id },
      }),
    };
  }
  const profile = options.registry.get(id);
  if (profile === undefined) {
    return {
      diagnostic: diagnostic({
        code: "unknown-profile",
        path: `${path}.profile`,
        message: `profile ${id} is not in the registry (registered: ${options.registry.list().join(", ") || "none"})`,
        details: { profile: id },
      }),
    };
  }
  return { profile };
}

export function validateDocument(document: SemanticDocument, options: ValidationOptions): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (typeof document !== "object" || document === null) {
    return [diagnostic({ code: "document-not-an-object", path: "document", message: "a document is an object" })];
  }

  const version = document.schemaVersion;
  if (
    typeof version !== "object" ||
    !Number.isInteger(version.major) ||
    !Number.isInteger(version.minor) ||
    version.major < 1 ||
    version.minor < 0
  ) {
    diagnostics.push(
      diagnostic({
        code: "schema-version-malformed",
        path: "schemaVersion",
        message: `expected { major, minor } integers, got ${JSON.stringify(version)}`,
      }),
    );
  } else if (version.major !== CURRENT_SCHEMA_VERSION.major) {
    // NAMED REJECTED CASE: an unknown major is refused for WRITE. Reading,
    // inspecting and exporting it is `migrate.ts`'s job.
    diagnostics.push(
      diagnostic({
        code: "unknown-schema-major",
        path: "schemaVersion",
        message: `schema major ${version.major} is not writable by this build (current ${CURRENT_SCHEMA_VERSION.major}.${CURRENT_SCHEMA_VERSION.minor}); preserved for inspection and export`,
        details: { seenMajor: version.major, currentMajor: CURRENT_SCHEMA_VERSION.major },
      }),
    );
  } else if (version.minor !== CURRENT_SCHEMA_VERSION.minor) {
    diagnostics.push(
      diagnostic({
        code: "schema-migration-required",
        path: "schemaVersion",
        message: `schema ${version.major}.${version.minor} must be migrated to ${CURRENT_SCHEMA_VERSION.major}.${CURRENT_SCHEMA_VERSION.minor} before it is written`,
        details: { seenMinor: version.minor, currentMinor: CURRENT_SCHEMA_VERSION.minor },
      }),
    );
  }

  if (!Number.isInteger(document.revision) || document.revision < 0) {
    diagnostics.push(
      diagnostic({
        code: "value-not-finite",
        path: "revision",
        message: `a revision is a non-negative integer, got ${String(document.revision)}`,
      }),
    );
  }

  const documentIdParsed = parseRef("document", document.documentId, "documentId");
  if (!documentIdParsed.ok) diagnostics.push(documentIdParsed.diagnostic);

  if (document.profileRefs.length === 0) {
    diagnostics.push(
      diagnostic({ code: "profile-not-declared", path: "profileRefs", message: "a document declares at least one profile" }),
    );
  }
  const profiles: Profile[] = [];
  for (const id of document.profileRefs) {
    const profile = options.registry.get(id);
    if (profile === undefined) {
      diagnostics.push(
        diagnostic({
          code: "unknown-profile",
          path: "profileRefs",
          message: `profile ${id} is not in the registry (registered: ${options.registry.list().join(", ") || "none"})`,
          details: { profile: id },
        }),
      );
      continue;
    }
    profiles.push(profile);
    diagnostics.push(...validateProfile(profile));
  }

  for (const key of Object.keys(document.typeDefinitions).sort()) {
    const definition = document.typeDefinitions[key] as NonNullable<(typeof document.typeDefinitions)[string]>;
    const path = `typeDefinitions.${key}`;
    if (definition.id !== key) {
      diagnostics.push(
        diagnostic({ code: "record-key-mismatch", path, message: `record key ${key} is not the definition id ${definition.id}` }),
      );
    }
    const profile = declaredProfile(document, definition.profile, options, path);
    if ("diagnostic" in profile) {
      diagnostics.push(profile.diagnostic);
      continue;
    }
    const base = entityTypeOf(profile.profile, definition.baseType);
    if (base === undefined) {
      diagnostics.push(
        diagnostic({
          code: "unknown-entity-type",
          path: `${path}.baseType`,
          message: `profile ${definition.profile} does not declare base type ${definition.baseType}`,
        }),
      );
      continue;
    }
    const baseNames = new Set(base.attributes.map((attribute) => attribute.name));
    for (const attribute of definition.attributes) {
      if (baseNames.has(attribute.name)) {
        diagnostics.push(
          diagnostic({
            code: "type-definition-conflict",
            path: `${path}.attributes.${attribute.name}`,
            message: `type definition ${key} redeclares ${attribute.name}, which base type ${definition.baseType} already declares; refinements are additive only`,
            details: { attribute: attribute.name, baseType: definition.baseType },
          }),
        );
      }
    }
  }

  for (const key of Object.keys(document.entities).sort()) {
    diagnostics.push(...validateEntity(document.entities[key] as Entity, key, document, options));
  }
  for (const key of Object.keys(document.ports).sort()) {
    diagnostics.push(...validatePort(document.ports[key] as SemanticPort, key, document, options));
  }
  for (const key of Object.keys(document.relations).sort()) {
    diagnostics.push(...validateRelation(document.relations[key] as Relation, key, document, options));
  }
  for (const key of Object.keys(document.resources).sort()) {
    const resource = document.resources[key] as NonNullable<(typeof document.resources)[string]>;
    const path = `resources.${key}`;
    diagnostics.push(...keyMatchesId(key, resource.id, "resource", path));
    if (resource.uri.length === 0) {
      diagnostics.push(diagnostic({ code: "value-not-serialisable", path: `${path}.uri`, message: "a resource carries a uri" }));
    }
    if (resource.contentHash.length === 0) {
      diagnostics.push(
        diagnostic({ code: "extension-hash-mismatch", path: `${path}.contentHash`, message: "a resource carries its content hash" }),
      );
    }
    if (resource.byteLength !== undefined && (!Number.isInteger(resource.byteLength) || resource.byteLength < 0)) {
      diagnostics.push(
        diagnostic({ code: "value-not-finite", path: `${path}.byteLength`, message: `byteLength is a non-negative integer` }),
      );
    }
  }

  diagnostics.push(
    ...validateHierarchies(
      document,
      profiles.flatMap((profile) =>
        profile.relationTypes.map((declaration) => ({ profile: profile.id, declaration }) as const),
      ),
    ),
  );
  for (const profile of profiles) diagnostics.push(...validateConstraints(document, profile));
  diagnostics.push(...validateExtensions(document));

  for (const profile of profiles) {
    const entityCount = Object.values(document.entities).filter((entity) => entity.profile === profile.id).length;
    const relationCount = Object.values(document.relations).filter((relation) => relation.profile === profile.id).length;
    if (profile.limits.maxEntities !== undefined && entityCount > profile.limits.maxEntities) {
      diagnostics.push(
        diagnostic({
          code: "limit-exceeded",
          path: "entities",
          message: `${entityCount} entities of profile ${profile.id}; the declared limit is ${profile.limits.maxEntities}`,
          details: { limit: "maxEntities", seen: entityCount, max: profile.limits.maxEntities },
        }),
      );
    }
    if (profile.limits.maxRelations !== undefined && relationCount > profile.limits.maxRelations) {
      diagnostics.push(
        diagnostic({
          code: "limit-exceeded",
          path: "relations",
          message: `${relationCount} relations of profile ${profile.id}; the declared limit is ${profile.limits.maxRelations}`,
          details: { limit: "maxRelations", seen: relationCount, max: profile.limits.maxRelations },
        }),
      );
    }
  }

  const canonical = tryCanonicalise(document, "document");
  if (!canonical.ok) diagnostics.push(...canonical.diagnostics);

  return diagnostics;
}

function finiteNumbers(
  values: readonly (readonly [string, number])[],
  path: string,
): readonly Diagnostic[] {
  return values
    .filter(([, value]) => !Number.isFinite(value))
    .map(([name, value]) =>
      diagnostic({
        code: "value-not-finite",
        path: `${path}.${name}`,
        message: `${name} is ${String(value)}; geometry values are finite (study invariant 8)`,
      }),
    );
}

export function validateView(
  view: ViewDocument,
  document: SemanticDocument,
  options: ValidationOptions,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const viewIdParsed = parseRef("view", view.viewId, "viewId");
  if (!viewIdParsed.ok) diagnostics.push(viewIdParsed.diagnostic);

  if (view.semanticDocumentId !== document.documentId) {
    diagnostics.push(
      diagnostic({
        code: "view-document-mismatch",
        path: "semanticDocumentId",
        message: `view ${view.viewId} points at ${view.semanticDocumentId}, the document is ${document.documentId}`,
        refs: [view.semanticDocumentId, document.documentId],
      }),
    );
  }
  if (!Number.isInteger(view.revision) || view.revision < 0) {
    diagnostics.push(
      diagnostic({ code: "value-not-finite", path: "revision", message: `a revision is a non-negative integer` }),
    );
  } else if (view.revision > document.revision) {
    // Divergent revisions: a view cannot be ahead of the document it draws.
    diagnostics.push(
      diagnostic({
        code: "revision-divergence",
        path: "revision",
        message: `view revision ${view.revision} is ahead of document revision ${document.revision}`,
        details: { viewRevision: view.revision, documentRevision: document.revision },
      }),
    );
  }

  const seenOccurrenceIds = new Map<string, string>();
  const noteOccurrence = (id: string, where: string): void => {
    const previous = seenOccurrenceIds.get(id);
    if (previous !== undefined) {
      diagnostics.push(
        diagnostic({
          code: "duplicate-id",
          path: where,
          message: `occurrence id ${id} is already used in ${previous}; the three occurrence maps share one identity namespace`,
          refs: [id],
        }),
      );
      return;
    }
    seenOccurrenceIds.set(id, where);
  };

  for (const key of Object.keys(view.entityOccurrences).sort()) {
    const occurrence = view.entityOccurrences[key] as NonNullable<(typeof view.entityOccurrences)[string]>;
    const path = `entityOccurrences.${key}`;
    diagnostics.push(...keyMatchesId(key, occurrence.id, "occurrence", path));
    noteOccurrence(occurrence.id, path);
    diagnostics.push(...resolveReference(document, occurrence.entity, "entity", `${path}.entity`));
    diagnostics.push(
      ...finiteNumbers(
        [
          ["x", occurrence.geometry.x],
          ["y", occurrence.geometry.y],
          ["width", occurrence.geometry.width],
          ["height", occurrence.geometry.height],
        ],
        `${path}.geometry`,
      ),
    );
    if (occurrence.group !== undefined && view.groups[occurrence.group] === undefined) {
      diagnostics.push(
        diagnostic({
          code: "dangling-reference",
          path: `${path}.group`,
          message: `visual group ${occurrence.group} is not declared by this view`,
          refs: [occurrence.group],
        }),
      );
    }
  }

  for (const key of Object.keys(view.portOccurrences).sort()) {
    const occurrence = view.portOccurrences[key] as NonNullable<(typeof view.portOccurrences)[string]>;
    const path = `portOccurrences.${key}`;
    diagnostics.push(...keyMatchesId(key, occurrence.id, "occurrence", path));
    noteOccurrence(occurrence.id, path);
    const portResolution = resolveReference(document, occurrence.port, "port", `${path}.port`);
    diagnostics.push(...portResolution);
    const owner = view.entityOccurrences[occurrence.ownerOccurrence];
    if (owner === undefined) {
      diagnostics.push(
        diagnostic({
          code: "dangling-reference",
          path: `${path}.ownerOccurrence`,
          message: `${occurrence.ownerOccurrence} is no entity occurrence of this view`,
          refs: [occurrence.ownerOccurrence],
        }),
      );
    } else if (portResolution.length === 0) {
      const port = document.ports[occurrence.port] as SemanticPort;
      if (owner.entity !== port.owner) {
        // Study invariant 4: the geometric port is bound to the occurrence of
        // the entity that OWNS the semantic port, not to any occurrence.
        diagnostics.push(
          diagnostic({
            code: "port-owner-mismatch",
            path: `${path}.ownerOccurrence`,
            message: `port ${port.id} belongs to ${port.owner}; occurrence ${owner.id} draws ${owner.entity}`,
            refs: [port.id, port.owner, owner.id, owner.entity],
          }),
        );
      }
    }
    diagnostics.push(...finiteNumbers([["order", occurrence.order], ["anchor", occurrence.anchor]], path));
    if (Number.isFinite(occurrence.anchor) && (occurrence.anchor < 0 || occurrence.anchor > 1)) {
      diagnostics.push(
        diagnostic({
          code: "limit-exceeded",
          path: `${path}.anchor`,
          message: `anchor ${occurrence.anchor} is outside 0..1`,
          details: { anchor: occurrence.anchor },
        }),
      );
    }
  }

  for (const key of Object.keys(view.relationOccurrences).sort()) {
    const occurrence = view.relationOccurrences[key] as NonNullable<(typeof view.relationOccurrences)[string]>;
    const path = `relationOccurrences.${key}`;
    diagnostics.push(...keyMatchesId(key, occurrence.id, "occurrence", path));
    noteOccurrence(occurrence.id, path);
    const relationResolution = resolveReference(document, occurrence.relation, "relation", `${path}.relation`);
    diagnostics.push(...relationResolution);
    const relation = relationResolution.length === 0 ? (document.relations[occurrence.relation] as Relation) : undefined;

    occurrence.endpoints.forEach((endpoint, index) => {
      const endpointPath = `${path}.endpoints[${index}]`;
      const drawn = view.entityOccurrences[endpoint.occurrence] ?? view.portOccurrences[endpoint.occurrence];
      if (drawn === undefined) {
        diagnostics.push(
          diagnostic({
            code: "dangling-reference",
            path: `${endpointPath}.occurrence`,
            message: `${endpoint.occurrence} is no entity or port occurrence of this view`,
            refs: [endpoint.occurrence],
          }),
        );
        return;
      }
      if (relation === undefined) return;
      const targets = relation.endpoints
        .filter((candidate) => candidate.role === endpoint.role)
        .map((candidate) => candidate.target);
      if (targets.length === 0) {
        diagnostics.push(
          diagnostic({
            code: "occurrence-endpoint-mismatch",
            path: `${endpointPath}.role`,
            message: `relation ${relation.id} has no endpoint with role ${endpoint.role}`,
            refs: [relation.id],
            details: { role: endpoint.role },
          }),
        );
        return;
      }
      const drawnTarget: EntityRef | PortRef = "entity" in drawn ? drawn.entity : drawn.port;
      if (!targets.includes(drawnTarget)) {
        diagnostics.push(
          diagnostic({
            code: "occurrence-endpoint-mismatch",
            path: `${endpointPath}.occurrence`,
            message: `occurrence ${endpoint.occurrence} draws ${drawnTarget}; role ${endpoint.role} of ${relation.id} targets ${targets.join(", ")}`,
            refs: [endpoint.occurrence, drawnTarget, ...targets],
            details: { role: endpoint.role },
          }),
        );
      }
    });

    for (const [index, waypoint] of (occurrence.waypoints ?? []).entries()) {
      diagnostics.push(
        ...finiteNumbers([["x", waypoint.x], ["y", waypoint.y]], `${path}.waypoints[${index}]`),
      );
    }
  }

  for (const key of Object.keys(view.groups).sort()) {
    const group = view.groups[key] as NonNullable<(typeof view.groups)[string]>;
    const path = `groups.${key}`;
    if (group.id !== key) {
      diagnostics.push(
        diagnostic({ code: "record-key-mismatch", path, message: `record key ${key} is not the group id ${group.id}` }),
      );
    }
    // Membership is not checked here because it is not stored here: an
    // occurrence names its group, and that reference is validated where the
    // occurrence is (`entityOccurrences.*.group`).
  }

  const filterIds = new Set<string>();
  view.filters.forEach((filter, index) => {
    if (filterIds.has(filter.id)) {
      diagnostics.push(
        diagnostic({ code: "duplicate-id", path: `filters[${index}]`, message: `filter id ${filter.id} declared twice` }),
      );
    }
    filterIds.add(filter.id);
  });

  diagnostics.push(
    ...finiteNumbers(
      [
        ["x", view.presentation.camera.x],
        ["y", view.presentation.camera.y],
        ["zoom", view.presentation.camera.zoom],
      ],
      "presentation.camera",
    ),
  );
  if (Number.isFinite(view.presentation.camera.zoom) && view.presentation.camera.zoom <= 0) {
    diagnostics.push(
      diagnostic({
        code: "limit-exceeded",
        path: "presentation.camera.zoom",
        message: `zoom ${view.presentation.camera.zoom} must be strictly positive`,
      }),
    );
  }

  const canonical = tryCanonicalise(view, "view");
  if (!canonical.ok) diagnostics.push(...canonical.diagnostics);

  return diagnostics;
}

/** Document and views together: what a transaction validates before it commits. */
export function validateState(state: DiagramState, options: ValidationOptions): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [...validateDocument(state.document, options)];
  for (const key of Object.keys(state.views).sort()) {
    const view = state.views[key] as ViewDocument;
    if (view.viewId !== key) {
      diagnostics.push(
        diagnostic({
          code: "record-key-mismatch",
          path: `views.${key}`,
          message: `record key ${key} is not the view id ${view.viewId}`,
        }),
      );
    }
    diagnostics.push(
      ...validateView(view, state.document, options).map((entry) => ({ ...entry, path: `views.${key}.${entry.path}` })),
    );
  }
  return diagnostics;
}
