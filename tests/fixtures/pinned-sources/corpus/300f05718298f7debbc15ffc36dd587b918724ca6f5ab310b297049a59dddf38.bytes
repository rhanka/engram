/**
 * The semantic document (SPEC 3.3).
 *
 * WHAT IS IN: identity, schema version, revision, declared profiles, document
 * type definitions, entities, relations, semantic ports, referenced resources,
 * preserved extensions.
 *
 * WHAT IS OUT, and stays out: positions, camera, z-order, DOM components,
 * functions. Geometry lives in a view (`view.ts`), which is why an entity has no
 * `x`. A test asserts the field set, so an added `positions` key fails.
 *
 * WHY RECORDS AND NOT ARRAYS: collections are keyed by the element's own
 * reference (`entities["entity:n1"]`). Insertion order then carries no meaning,
 * the canonical serialisation sorts keys, and a command and its inverse restore
 * the SAME bytes whatever order they ran in. Every order that matters is an
 * explicit field (`PortOccurrence.order`, `z`), never an array position.
 */

import type { AttributeSchema, AttributeValue } from "./attributes.js";
import type { PortDirection, ProfileId } from "./profile.js";
import type { DocumentRef, EntityRef, PortRef, RelationRef, ResourceRef } from "./refs.js";

export interface SchemaVersion {
  readonly major: number;
  readonly minor: number;
}

export interface Entity {
  readonly id: EntityRef;
  /** The profile that declares this entity's type. Must be one of the document's `profileRefs`. */
  readonly profile: ProfileId;
  /** A profile entity type id, or a document type definition id. */
  readonly type: string;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

export interface RelationEndpoint {
  /** A role declared by the relation type. Not a position: `endpoints[0]` means nothing. */
  readonly role: string;
  /** An entity or a semantic port. The two are not interchangeable (the role declares which). */
  readonly target: EntityRef | PortRef;
}

export interface Relation {
  readonly id: RelationRef;
  readonly profile: ProfileId;
  readonly type: string;
  /**
   * Two or more typed endpoints. A hyperrelation (`generic@1`'s `association`,
   * 2..8 members) keeps ONE business id: a projection may turn it into a
   * junction node, and the id survives that projection (study invariant 4).
   */
  readonly endpoints: readonly RelationEndpoint[];
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

/**
 * A SEMANTIC port: it belongs to an entity and has a direction. Side, order and
 * anchor are GEOMETRIC and live on the port occurrence in a view, which is what
 * study invariant 4 means by "relies par occurrence".
 */
export interface SemanticPort {
  readonly id: PortRef;
  readonly profile: ProfileId;
  readonly type: string;
  readonly owner: EntityRef;
  readonly name: string;
  readonly direction: PortDirection;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

/**
 * A document-local type definition: an ADDITIVE refinement of a profile type.
 * It may add optional attributes; it may not redeclare one the base type
 * already declares (that is `type-definition-conflict`), because a document
 * cannot quietly change what a profile means.
 */
export interface TypeDefinition {
  readonly id: string;
  readonly profile: ProfileId;
  readonly baseType: string;
  readonly label?: string;
  readonly attributes: readonly AttributeSchema[];
}

export interface ResourceDescriptor {
  readonly id: ResourceRef;
  /** An identifier for the host's resolver. NOTHING here fetches, parses or executes it. */
  readonly uri: string;
  readonly mediaType: string;
  readonly contentHash: string;
  readonly byteLength?: number;
}

export type ExtensionScope =
  | { readonly kind: "document" }
  | { readonly kind: "entity"; readonly target: EntityRef }
  | { readonly kind: "relation"; readonly target: RelationRef }
  | { readonly kind: "port"; readonly target: PortRef };

/**
 * Validation level of imported content (decision D3-C):
 *   - `validated`: a profile validated it; it IS a business fact;
 *   - `preserved-unvalidated`: kept with its hash, readable, never a fact;
 *   - `unsupported`: kept for inspection and export, and REFUSED for write -
 *     `validateDocument` reports `extension-unsupported`.
 * No imported content, URI or markup is ever executed, implicitly or otherwise.
 */
export type ExtensionValidation = "validated" | "preserved-unvalidated" | "unsupported";

export interface PreservedExtension {
  /** Namespace URI. Identity of an extension is (namespace, schemaVersion, scope). */
  readonly namespace: string;
  readonly schemaVersion: string;
  readonly scope: ExtensionScope;
  readonly validation: ExtensionValidation;
  /** Hash of the source content, always present - it is what makes drift detectable. */
  readonly contentHash: string;
  /**
   * The source content, when the importer retained it. Its absence is the one
   * documented reason a command over extensions is NOT invertible: a replaced
   * extension whose source was never retained cannot be restored from a hash.
   */
  readonly source?: string;
}

export interface SemanticDocument {
  readonly documentId: DocumentRef;
  readonly schemaVersion: SchemaVersion;
  /** Monotonic. A command bumps it; undo is a NEW revision, never a rewrite. */
  readonly revision: number;
  readonly profileRefs: readonly ProfileId[];
  readonly typeDefinitions: Readonly<Record<string, TypeDefinition>>;
  readonly entities: Readonly<Record<string, Entity>>;
  readonly relations: Readonly<Record<string, Relation>>;
  readonly ports: Readonly<Record<string, SemanticPort>>;
  readonly resources: Readonly<Record<string, ResourceDescriptor>>;
  readonly extensions: readonly PreservedExtension[];
}

/** The document field set, asserted by a test: an added `positions` key fails it. */
export const SEMANTIC_DOCUMENT_FIELDS = [
  "documentId",
  "entities",
  "extensions",
  "ports",
  "profileRefs",
  "relations",
  "resources",
  "revision",
  "schemaVersion",
  "typeDefinitions",
] as const;

export interface CreateDocumentInput {
  readonly documentId: DocumentRef;
  readonly profileRefs: readonly ProfileId[];
  readonly schemaVersion?: SchemaVersion;
  readonly revision?: number;
}

/** The schema version this build writes. `migrate.ts` owns the version history. */
export const CURRENT_SCHEMA_VERSION: SchemaVersion = { major: 1, minor: 1 };

export function createDocument(input: CreateDocumentInput): SemanticDocument {
  return {
    documentId: input.documentId,
    schemaVersion: input.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    revision: input.revision ?? 0,
    profileRefs: [...input.profileRefs],
    typeDefinitions: {},
    entities: {},
    relations: {},
    ports: {},
    resources: {},
    extensions: [],
  };
}

/** Same (namespace, schemaVersion, scope) identity, for replacement and inverse. */
export function sameExtensionIdentity(left: PreservedExtension, right: PreservedExtension): boolean {
  if (left.namespace !== right.namespace || left.schemaVersion !== right.schemaVersion) return false;
  if (left.scope.kind !== right.scope.kind) return false;
  if (left.scope.kind === "document" || right.scope.kind === "document") return true;
  return left.scope.target === right.scope.target;
}

export const scopeTargetOf = (scope: ExtensionScope): EntityRef | RelationRef | PortRef | undefined =>
  scope.kind === "document" ? undefined : scope.target;
