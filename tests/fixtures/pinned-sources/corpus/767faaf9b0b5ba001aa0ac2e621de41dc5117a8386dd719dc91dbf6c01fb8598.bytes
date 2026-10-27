/**
 * View documents and occurrences (SPEC 3.4).
 *
 * An OCCURRENCE is a drawing of a semantic element in one view. The same entity
 * has N occurrences in one view and occurrences in several views; drawing it
 * twice does not duplicate the entity (study invariant 2). Removing an
 * occurrence removes a drawing, nothing else. Removing the ENTITY demands an
 * explicit policy for its occurrences and relations - `commands.ts` has no
 * default for it.
 *
 * WHAT IS IN a view: occurrences, visual groups, view filters and the
 * PERSISTABLE presentation state. WHAT IS OUT: transient state (hover, the
 * in-flight drag, the current marquee) and any duplicate of business data. A
 * view stores no attribute of an entity: it points at the entity.
 *
 * All three occurrence maps share ONE `occurrence:` identity namespace, so an
 * occurrence id is unique across the three (checked as `duplicate-id`).
 */

import type { DocumentRef, EntityRef, OccurrenceRef, PortRef, RelationRef, ViewRef } from "./refs.js";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Geometry is persisted presentation, and every number must be finite (study invariant 8). */
export interface Geometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EntityOccurrence {
  readonly id: OccurrenceRef;
  readonly entity: EntityRef;
  readonly geometry: Geometry;
  /** A visual group id, when this drawing sits in one. Visual grouping is NOT containment. */
  readonly group?: string;
  /** Explicit paint order. A field, never an array position. */
  readonly z?: number;
}

export interface RelationOccurrenceEndpoint {
  /** The role of the relation this end draws. Matched against the relation's own endpoints. */
  readonly role: string;
  /** The occurrence this end attaches to: an entity occurrence or a port occurrence. */
  readonly occurrence: OccurrenceRef;
}

export interface RelationOccurrence {
  readonly id: OccurrenceRef;
  readonly relation: RelationRef;
  readonly endpoints: readonly RelationOccurrenceEndpoint[];
  /** Persisted route hints. An empty/absent list means "the renderer routes it". */
  readonly waypoints?: readonly Point[];
}

export type PortSide = "north" | "east" | "south" | "west";

/**
 * The geometric half of a port: it binds a SEMANTIC port to the occurrence of
 * its owning entity, with side, order and anchor explicit (study invariant 4).
 */
export interface PortOccurrence {
  readonly id: OccurrenceRef;
  readonly port: PortRef;
  readonly ownerOccurrence: OccurrenceRef;
  readonly side: PortSide;
  readonly order: number;
  /** Position along the side, 0..1 from the side's start. */
  readonly anchor: number;
}

/**
 * A visual group declares itself; MEMBERSHIP IS NOT DUPLICATED HERE. An
 * occurrence names its group through `EntityOccurrence.group`, and
 * {@link occurrencesInGroup} derives the list.
 *
 * Why it is not a member list: two sources of truth for one fact drift, and they
 * drift in a way that breaks the inverse. With a member list, removing a drawing
 * had to prune the list too, and re-creating the drawing could not restore it
 * (no command of this lot edits a group), so `delete -> undo` came back with a
 * group that had quietly lost a member - a byte difference the round-trip test
 * caught. Derived membership has no such gap.
 */
export interface VisualGroup {
  readonly id: string;
  readonly label?: string;
  readonly collapsed?: boolean;
}

/**
 * Declarative view filters. This lot VALIDATES and PERSISTS them; it does not
 * evaluate them. Deciding what a filter hides, and what happens to a relation
 * whose endpoint is hidden, is a presentation decision and belongs to
 * GD-M2-CANVAS - see README, "What is not covered yet".
 */
export type ViewFilter =
  | { readonly id: string; readonly kind: "entity-type"; readonly types: readonly string[]; readonly mode: "include" | "exclude" }
  | { readonly id: string; readonly kind: "relation-type"; readonly types: readonly string[]; readonly mode: "include" | "exclude" }
  | {
      readonly id: string;
      readonly kind: "attribute-equals";
      readonly attribute: string;
      /** Compared against the attribute value's own `value` field, as text. */
      readonly value: string;
      readonly mode: "include" | "exclude";
    };

/**
 * Persistable presentation state. `camera` is stored HERE and not imported from
 * a renderer package on purpose: a persisted, migration-versioned schema must
 * not be hostage to another package's type evolution (SPEC 3.6). A renderer
 * adapter maps these three numbers to its own camera contract; that adapter is
 * GD-M2-CANVAS work, not this lot's.
 */
export interface PresentationState {
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly grid?: { readonly size: number; readonly snap: boolean };
  /** A theme id the host resolves. No colour, no token value is stored here. */
  readonly theme?: string;
}

export interface ViewDocument {
  readonly viewId: ViewRef;
  readonly semanticDocumentId: DocumentRef;
  /** The document revision this view was last changed at. Never ahead of the document. */
  readonly revision: number;
  readonly entityOccurrences: Readonly<Record<string, EntityOccurrence>>;
  readonly relationOccurrences: Readonly<Record<string, RelationOccurrence>>;
  readonly portOccurrences: Readonly<Record<string, PortOccurrence>>;
  readonly groups: Readonly<Record<string, VisualGroup>>;
  readonly filters: readonly ViewFilter[];
  readonly presentation: PresentationState;
}

/** The view field set, asserted by a test: an added `hover` key fails it. */
export const VIEW_DOCUMENT_FIELDS = [
  "entityOccurrences",
  "filters",
  "groups",
  "portOccurrences",
  "presentation",
  "relationOccurrences",
  "revision",
  "semanticDocumentId",
  "viewId",
] as const;

export const DEFAULT_PRESENTATION: PresentationState = { camera: { x: 0, y: 0, zoom: 1 } };

export interface CreateViewInput {
  readonly viewId: ViewRef;
  readonly semanticDocumentId: DocumentRef;
  readonly revision?: number;
  readonly presentation?: PresentationState;
}

export function createView(input: CreateViewInput): ViewDocument {
  return {
    viewId: input.viewId,
    semanticDocumentId: input.semanticDocumentId,
    revision: input.revision ?? 0,
    entityOccurrences: {},
    relationOccurrences: {},
    portOccurrences: {},
    groups: {},
    filters: [],
    presentation: input.presentation ?? DEFAULT_PRESENTATION,
  };
}

export type OccurrenceKind = "entity" | "relation" | "port";

export type AnyOccurrence = EntityOccurrence | RelationOccurrence | PortOccurrence;

/** Which of the three maps holds an occurrence id, if any. One namespace, three maps. */
export function occurrenceKindOf(view: ViewDocument, id: OccurrenceRef): OccurrenceKind | undefined {
  if (view.entityOccurrences[id] !== undefined) return "entity";
  if (view.relationOccurrences[id] !== undefined) return "relation";
  if (view.portOccurrences[id] !== undefined) return "port";
  return undefined;
}

export function findOccurrence(view: ViewDocument, id: OccurrenceRef): AnyOccurrence | undefined {
  return view.entityOccurrences[id] ?? view.relationOccurrences[id] ?? view.portOccurrences[id];
}

/** Every occurrence of ONE entity in ONE view. N of them is the normal case. */
export function occurrencesOfEntity(view: ViewDocument, entity: EntityRef): readonly EntityOccurrence[] {
  return Object.values(view.entityOccurrences)
    .filter((occurrence) => occurrence.entity === entity)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function occurrencesOfRelation(view: ViewDocument, relation: RelationRef): readonly RelationOccurrence[] {
  return Object.values(view.relationOccurrences)
    .filter((occurrence) => occurrence.relation === relation)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** Derived membership: the entity drawings that name this group. */
export function occurrencesInGroup(view: ViewDocument, group: string): readonly EntityOccurrence[] {
  return Object.values(view.entityOccurrences)
    .filter((occurrence) => occurrence.group === group)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function occurrencesOfPort(view: ViewDocument, port: PortRef): readonly PortOccurrence[] {
  return Object.values(view.portOccurrences)
    .filter((occurrence) => occurrence.port === port)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
