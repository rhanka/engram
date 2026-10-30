// Migration boundary shape guard, transcribed from the pinned DS view.ts
// (f6f3ba37; corpus ds:view.ts), plus M3 §§3.2.2/4.4.2/4.5.1.
// This checks persistable input/output data only. No semantic executor,
// projection, layout, rendering or registry/admission logic lives here.
export type Check = (value: unknown, path: string) => string | null;
export const text: Check = (v, p) => typeof v === "string" ? null : p;
export const number: Check = (v, p) => typeof v === "number" && Number.isFinite(v) ? null : p;
export const boolean: Check = (v, p) => typeof v === "boolean" ? null : p;
export const enumeration = (...values: string[]): Check => (v, p) => values.includes(v as string) ? null : p;
const bounded = (max: number, pattern?: RegExp): Check => (v, p) =>
  typeof v === "string" && [...v].length <= max && (!pattern || pattern.test(v)) ? null : p;
export const record = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => (v, p) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return p;
  const value = v as Record<string, unknown>;
  for (const key of Object.keys(required)) {
    if (!Object.hasOwn(value, key)) return `${p}.${key}`;
  }
  for (const key of Object.keys(value).sort()) {
    const check = Object.hasOwn(required, key) ? required[key] : Object.hasOwn(optional, key) ? optional[key] : undefined;
    if (check === undefined) return `${p}.${key}`;
    const failed = check(value[key], `${p}.${key}`);
    if (failed !== null) return failed;
  }
  return null;
};
export const list = (item: Check): Check => (v, p) => {
  if (!Array.isArray(v)) return p;
  for (let i = 0; i < v.length; i++) { const failed = item(v[i], `${p}.${i}`); if (failed !== null) return failed; }
  return null;
};
export const map = (item: Check): Check => (v, p) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return p;
  for (const key of Object.keys(v).sort()) {
    const failed = item((v as Record<string, unknown>)[key], `${p}.${key}`);
    if (failed !== null) return failed;
  }
  return null;
};
const point = record({ x: number, y: number });
const geometry = record({ x: number, y: number, width: number, height: number });
const endpointShape = record({ role: text, occurrence: text }, { semanticTarget: text, sourceOccurrence: text });
const endpoint: Check = (v, p) => {
  const failure = endpointShape(v, p);
  if (failure !== null) return failure;
  const value = v as Record<string, unknown>;
  return Object.hasOwn(value, "semanticTarget") === Object.hasOwn(value, "sourceOccurrence") ? null : p;
};
const filter: Check = (v, p) => {
  const kind = (v as Record<string, unknown> | null)?.["kind"];
  if (kind === "entity-type" || kind === "relation-type") {
    return record({ id: text, kind: enumeration(kind), types: list(text), mode: enumeration("include", "exclude") })(v, p);
  }
  return record({ id: text, kind: enumeration("attribute-equals"), attribute: text, value: text, mode: enumeration("include", "exclude") })(v, p);
};
const digest: Check = (v, p) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? null : p;
const key = bounded(40, /^[a-z][a-z0-9-]*$/);
const token = bounded(80, /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/);
const nonempty: Check = (v, p) => typeof v === "string" && v.length > 0 ? null : p;
const uniqueStrings: Check = (v, p) => {
  const failure = list(nonempty)(v, p);
  if (failure !== null) return failure;
  return new Set(v as string[]).size === (v as string[]).length ? null : p;
};
const presentationEntity: Check = (v, p) => {
  const form = (v as Record<string, unknown> | null)?.["form"];
  return record({ form: enumeration("card", "container", "legend", "legend-key"),
    text: record({}, { title: bounded(form === "legend-key" ? 120 : 200), kicker: bounded(80), body: bounded(400),
      detail: bounded(400), subtitle: bounded(600), footer: bounded(120) }) },
  { icon: key, categoryRef: nonempty })(v, p);
};
const diagram = record({
  contractPin: record({ id: enumeration("diagram-presentation"), version: enumeration("1"), contentDigest: digest }),
  entities: map(presentationEntity), legends: map(record({ order: uniqueStrings })),
  categoryTokens: list(record({ legendRef: nonempty, category: key, token })),
});
const summary: Check = (v, p) => {
  const failure = record({ id: text, sourceOccurrence: text, targetOccurrence: text, label: text, relationIds: list(text) },
    { strokeStyle: enumeration("solid", "dashed"), relationOccurrences: list(text) })(v, p);
  if (failure !== null) return failure;
  return ((v as { relationIds: string[] }).relationIds.length > 0) ? null : `${p}.relationIds`;
};

/** @1 summary shape: `id` optional, label non-empty, no occurrence list. */
const summaryV1: Check = (v, p) => {
  const failure = record({ sourceOccurrence: text, targetOccurrence: text, label: nonempty, relationIds: list(text) },
    { id: text, strokeStyle: enumeration("solid", "dashed") })(v, p);
  if (failure !== null) return failure;
  return ((v as { relationIds: string[] }).relationIds.length > 0) ? null : `${p}.relationIds`;
};

/** Shape of one summary definition under the selected governed @1 schema. */
export function checkSummaryShapeV1(value: unknown, path: string): string | null {
  return summaryV1(value, path);
}

/** Shape of one summary definition under the selected governed @2 schema. */
export function checkSummaryShapeV2(value: unknown, path: string): string | null {
  return summary(value, path);
}
const viewRecord = (summaries: Check): Check => record({
  viewId: text, semanticDocumentId: text,
  revision: (v, p) => Number.isInteger(v) && (v as number) >= 0 ? null : p,
  entityOccurrences: map(record({ id: text, entity: text, geometry }, { group: text, z: number })),
  relationOccurrences: map(record({ id: text, relation: text, endpoints: list(endpoint) },
    { waypoints: list(point), strokeStyle: enumeration("solid", "dashed") })),
  portOccurrences: map(record({ id: text, port: text, ownerOccurrence: text, side: enumeration("north", "east", "south", "west"),
    order: number, anchor: (v, p) => number(v, p) === null && (v as number) >= 0 && (v as number) <= 1 ? null : p })),
  groups: map(record({ id: text }, { label: text, collapsed: boolean, occurrence: text })),
  filters: list(filter),
  presentation: record({ camera: record({ x: number, y: number, zoom: number }) },
    { grid: record({ size: number, snap: boolean }), theme: text, diagram }),
}, { summaryLabels: map(summaries) });

const view = viewRecord(summary);
const viewV1 = viewRecord(summaryV1);

/** Returns the offending path; a missing native field is never defaulted. */
export function checkViewShape(value: unknown): string | null {
  const failure = view(value, "");
  return failure === null ? null : failure.replace(/^\./, "");
}

/**
 * Pinned hand-written check against the exact governed @1 view-schema value
 * (JSON Schema 2020-12 semantics). No runtime dependency; Ajv stays the
 * test-only oracle.
 */
export function checkViewShapeV1(value: unknown): string | null {
  const failure = viewV1(value, "");
  return failure === null ? null : failure.replace(/^\./, "");
}

/** Pinned hand-written check against the exact governed @2 view-schema value. */
export function checkViewShapeV2(value: unknown): string | null {
  return checkViewShape(value);
}

/**
 * Version-dispatched governed check. An unknown version refuses at the root
 * without falling back to another version.
 */
export function checkGovernedViewShape(version: string, value: unknown): string | null {
  if (version === "1") return checkViewShapeV1(value);
  if (version === "2") return checkViewShapeV2(value);
  return "";
}
