// Migration boundary only: pinned document.ts/attributes.ts with explicit
// K2/K6 and M3 schema fields. Semantic execution/admission remains owner-side.
import { boolean, enumeration, list, map, number, record, text } from "./diagram-view-shape.js";
import type { Check } from "./diagram-view-shape.js";

const strings = list(text);
const kinds = ["text", "boolean", "date", "quantity", "enum", "reference", "struct", "collection"];
const attribute: Check = (value, path) => {
  const kind = (value as { kind?: string } | null)?.kind;
  if (kind === "collection") return record({ kind: enumeration(kind), items: list(attribute) })(value, path);
  if (kind === "struct") return record({ kind: enumeration(kind), type: text, fields: map(attribute) })(value, path);
  if (!kind || !kinds.includes(kind)) return path;
  return record({ kind: enumeration(kind), value: kind === "boolean" ? boolean : kind === "quantity" ? number : text,
    ...(kind === "quantity" ? { unit: text } : {}) })(value, path);
};
function schema(named: boolean, collection: boolean): Check {
  return (value, path) => {
    const kind = (value as { kind?: string } | null)?.kind;
    if (!kind || !kinds.includes(kind) || (!collection && kind === "collection")) return path;
    const required: Record<string, Check> = { kind: enumeration(kind), ...(named ? { name: text } : {}) };
    const optional: Record<string, Check> = named ? { required: boolean } : {};
    if (kind === "text") Object.assign(optional, { minLength: number, maxLength: number, pattern: text, patternName: text });
    if (kind === "quantity") { required.units = strings; Object.assign(optional, { integer: boolean, min: number, max: number }); }
    if (kind === "enum") required.values = strings;
    if (kind === "reference") {
      required.refKind = enumeration("document", "entity", "relation", "port", "resource", "view", "occurrence");
      optional.targetTypes = strings;
    }
    if (kind === "struct") required.targetTypes = strings;
    if (kind === "collection") {
      required.item = schema(false, false); required.maxItems = number; optional.minItems = number;
    }
    return record(required, optional)(value, path);
  };
}
const attributes = map(attribute);
const entity = record({ id: text, profile: text, type: text, attributes });
const relation = record({ id: text, profile: text, type: text, endpoints: list(record({ role: text, target: text })), attributes });
const port = record({ id: text, profile: text, type: text, owner: text, name: text, direction: enumeration("in", "out", "inout"), attributes });
const definition = record({ id: text, profile: text, baseType: text, attributes: list(schema(true, true)) }, { label: text });
const resource = record({ id: text, uri: text, mediaType: text, contentHash: text }, { byteLength: number });
const scope: Check = (value, path) => {
  const kind = (value as { kind?: string } | null)?.kind;
  if (kind === "document") return record({ kind: enumeration(kind) })(value, path);
  return record({ kind: enumeration("entity", "relation", "port"), target: text })(value, path);
};
const extension = record({ namespace: text, schemaVersion: text, scope,
  validation: enumeration("validated", "preserved-unvalidated", "unsupported"), contentHash: text }, { source: text });
const document = record({
  documentId: text, schemaVersion: record({ major: number, minor: number }),
  revision: (value, path) => Number.isInteger(value) && (value as number) >= 0 ? null : path,
  profileRefs: strings, typeDefinitions: map(definition), entities: map(entity), relations: map(relation),
  ports: map(port), resources: map(resource), extensions: list(extension),
});

export function checkSemanticShape(value: unknown): string | null {
  const failure = document(value, "");
  return failure === null ? null : failure.replace(/^\./, "");
}
