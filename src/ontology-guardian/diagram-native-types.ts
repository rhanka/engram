// Structural transcription: pinned DS f6f3ba37 document.ts/view.ts/attributes.ts
// (all three raw sources are carried in the corpus). M3 K2/K6, grammars and
// view extensions are explicit below. Nominal-reference validation stays DS.
export type NativeRefKind = "entity" | "relation" | "occurrence" | "port" | "view" | "resource" | "document";
export type NativeScalarValue =
  | { readonly kind: "text" | "date" | "enum" | "reference"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "quantity"; readonly value: number; readonly unit: string }
  | { readonly kind: "struct"; readonly type: string; readonly fields: Readonly<Record<string, NativeAttributeValue>> };
export type NativeAttributeValue = NativeScalarValue | { readonly kind: "collection"; readonly items: readonly NativeAttributeValue[] };
export type NativeScalarSchema =
  | { readonly kind: "text"; readonly minLength?: number; readonly maxLength?: number; readonly pattern?: string; readonly patternName?: string }
  | { readonly kind: "boolean" | "date" }
  | { readonly kind: "quantity"; readonly units: readonly string[]; readonly integer?: boolean; readonly min?: number; readonly max?: number }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "reference"; readonly refKind: NativeRefKind; readonly targetTypes?: readonly string[] }
  | { readonly kind: "struct"; readonly targetTypes: readonly string[] };
export type NativeAttributeSchema = { readonly name: string; readonly required?: boolean } &
  (NativeScalarSchema | { readonly kind: "collection"; readonly item: NativeScalarSchema; readonly maxItems: number; readonly minItems?: number });
export interface NativeTypeDefinition {
  readonly id: string;
  readonly profile: string;
  readonly baseType: string;
  readonly label?: string;
  readonly attributes: readonly NativeAttributeSchema[];
}
export interface NativeSemanticDocument {
  readonly documentId: string;
  readonly schemaVersion: { readonly major: number; readonly minor: number };
  readonly revision: number;
  readonly profileRefs: readonly string[];
  readonly typeDefinitions: Readonly<Record<string, NativeTypeDefinition>>;
  readonly entities: Readonly<Record<string, { readonly id: string; readonly profile: string; readonly type: string; readonly attributes: Readonly<Record<string, NativeAttributeValue>> }>>;
  readonly relations: Readonly<Record<string, { readonly id: string; readonly profile: string; readonly type: string; readonly endpoints: readonly { readonly role: string; readonly target: string }[]; readonly attributes: Readonly<Record<string, NativeAttributeValue>> }>>;
  readonly ports: Readonly<Record<string, { readonly id: string; readonly profile: string; readonly type: string; readonly owner: string; readonly name: string; readonly direction: "in" | "out" | "inout"; readonly attributes: Readonly<Record<string, NativeAttributeValue>> }>>;
  readonly resources: Readonly<Record<string, { readonly id: string; readonly uri: string; readonly mediaType: string; readonly contentHash: string; readonly byteLength?: number }>>;
  readonly extensions: readonly { readonly namespace: string; readonly schemaVersion: string;
    readonly scope: { readonly kind: "document" } | { readonly kind: "entity" | "relation" | "port"; readonly target: string };
    readonly validation: "validated" | "preserved-unvalidated" | "unsupported"; readonly contentHash: string; readonly source?: string }[];
}
export interface NativeGeometry { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface NativeEntityOccurrence {
  readonly id: string; readonly entity: string; readonly geometry: NativeGeometry;
  readonly group?: string; readonly z?: number;
}
export interface NativePortOccurrence {
  readonly id: string; readonly port: string; readonly ownerOccurrence: string;
  readonly side: "north" | "east" | "south" | "west"; readonly order: number; readonly anchor: number;
}
export type NativeViewFilter =
  | { readonly id: string; readonly kind: "entity-type" | "relation-type"; readonly types: readonly string[]; readonly mode: "include" | "exclude" }
  | { readonly id: string; readonly kind: "attribute-equals"; readonly attribute: string; readonly value: string; readonly mode: "include" | "exclude" };
export interface NativePresentationText {
  readonly title?: string; readonly kicker?: string; readonly body?: string;
  readonly detail?: string; readonly subtitle?: string; readonly footer?: string;
}
export interface NativeDiagramPresentation {
  readonly contractPin: import("./types.js").Pin;
  readonly entities: Readonly<Record<string, {
    readonly form: "card" | "container" | "legend" | "legend-key"; readonly text: NativePresentationText;
    readonly icon?: string; readonly categoryRef?: string;
  }>>;
  readonly legends: Readonly<Record<string, { readonly order: readonly string[] }>>;
  readonly categoryTokens: readonly { readonly legendRef: string; readonly category: string; readonly token: string }[];
}
export interface NativePresentationState {
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly grid?: { readonly size: number; readonly snap: boolean };
  readonly theme?: string;
  readonly diagram?: NativeDiagramPresentation;
}
export type NativeOccurrenceEndpoint = { readonly role: string; readonly occurrence: string } &
  ({ readonly semanticTarget: string; readonly sourceOccurrence: string } | { readonly semanticTarget?: never; readonly sourceOccurrence?: never });
export interface NativeViewDocument {
  readonly viewId: string; readonly semanticDocumentId: string; readonly revision: number;
  readonly entityOccurrences: Readonly<Record<string, NativeEntityOccurrence>>;
  readonly relationOccurrences: Readonly<Record<string, {
    readonly id: string; readonly relation: string; readonly endpoints: readonly NativeOccurrenceEndpoint[];
    readonly waypoints?: readonly { readonly x: number; readonly y: number }[]; readonly strokeStyle?: "solid" | "dashed";
  }>>;
  readonly portOccurrences: Readonly<Record<string, NativePortOccurrence>>;
  readonly groups: Readonly<Record<string, { readonly id: string; readonly label?: string; readonly collapsed?: boolean; readonly occurrence?: string }>>;
  readonly filters: readonly NativeViewFilter[];
  readonly presentation: NativePresentationState;
  readonly summaryLabels?: Readonly<Record<string, { readonly id?: string; readonly sourceOccurrence: string; readonly targetOccurrence: string; readonly label: string; readonly relationIds: readonly string[]; readonly strokeStyle?: "solid" | "dashed" }>>;
}
