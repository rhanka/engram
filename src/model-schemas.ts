export type NativeRefKind = "entity" | "relation" | "occurrence" | "port" | "view" | "resource" | "document";
export type NativeScalarSchema =
  | { readonly kind: "text"; readonly minLength?: number; readonly maxLength?: number; readonly pattern?: string; readonly patternName?: string }
  | { readonly kind: "boolean" | "date" }
  | { readonly kind: "quantity"; readonly units: readonly string[]; readonly integer?: boolean; readonly min?: number; readonly max?: number }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "reference"; readonly refKind: NativeRefKind; readonly targetTypes?: readonly string[] }
  | { readonly kind: "struct"; readonly targetTypes: readonly string[] };
export const DATA_MODEL_FORMAT = "engram.data-model/1";
export type EnumDomain = Extract<NativeScalarSchema, { kind: "enum" }>;
export interface ModelHeader {
  format: typeof DATA_MODEL_FORMAT;
  enums?: Record<string, EnumDomain>;
}
export type TextDomain = Pick<Extract<NativeScalarSchema, { kind: "text" }>, "kind" | "minLength" | "maxLength">;
export type LogicalType =
  | TextDomain
  | ({ kind: "string" } & Pick<TextDomain, "minLength" | "maxLength">)
  | Extract<NativeScalarSchema, { kind: "boolean" | "date" }>
  | { kind: "int" | "bigint" | "timestamptz" | "uuid" | "json" }
  | { kind: "decimal"; precision: number; scale: number }
  | { enumRef: string };
export interface ModelAttribute { name: string; type: LogicalType; nullable: boolean }
export type Names = readonly [string, ...string[]];
export interface FieldPair { fields: Names; targetFields: Names }
export interface Reference extends FieldPair { relation: string }
export interface ModelRow { attributes: readonly ModelAttribute[]; key: Names; unique?: readonly Names[] }
type Fragment = Record<string, unknown>;
export const NATIVE_TEXT_SCHEMA: Fragment = { type: "object", properties: { kind: { const: "text" }, minLength: { type: "number" }, maxLength: { type: "number" }, pattern: { type: "string" }, patternName: { type: "string" } }, required: ["kind"], additionalProperties: false };
export const NATIVE_BOOLEAN_SCHEMA: Fragment = { type: "object", properties: { kind: { const: "boolean" } }, required: ["kind"], additionalProperties: false };
export const NATIVE_DATE_SCHEMA: Fragment = { type: "object", properties: { kind: { const: "date" } }, required: ["kind"], additionalProperties: false };
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
const SIMPLE_KINDS = new Set(["int", "bigint", "timestamptz", "uuid", "json"]);
const TEXT_KINDS = new Set(["string", "text"]);
const isNonNegInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const extraKey = (value: Record<string, unknown>, ...allowed: string[]): string | undefined => Object.keys(value).find((key) => !allowed.includes(key));
export function validateLogicalType(type: unknown, enums: Record<string, unknown>, path: string): string[] {
  if (!isRecord(type)) return [`${path} must be an object`];
  if (Object.hasOwn(type, "enumRef")) return typeof type.enumRef === "string" && Object.keys(type).length === 1 && Object.hasOwn(enums, type.enumRef) && isRecord(enums[type.enumRef]) ? [] : [`${path}.enumRef references unknown domain ${String(type.enumRef)}`];
  if (typeof type.kind !== "string") return [`${path}.kind is required`];
  const kind = type.kind;
  if (!TEXT_KINDS.has(kind) && kind !== "decimal" && kind !== "boolean" && kind !== "date" && !SIMPLE_KINDS.has(kind)) return [`${path}.kind ${kind} is not allowed`];
  const unexpected = extraKey(type, "kind", ...(kind === "decimal" ? ["precision", "scale"] : TEXT_KINDS.has(kind) ? ["minLength", "maxLength"] : []));
  if (unexpected !== undefined) return [`${path}.${unexpected} is not allowed`];
  if (TEXT_KINDS.has(kind)) {
    for (const bound of ["minLength", "maxLength"] as const) if (type[bound] !== undefined && !isNonNegInt(type[bound])) return [`${path}.${bound} must be a nonnegative integer`];
    const { minLength, maxLength } = type as { minLength?: number; maxLength?: number };
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) return [`${path}.maxLength must not be below minLength`];
    return [];
  }
  if (kind === "decimal") {
    const { precision, scale } = type as { precision?: unknown; scale?: unknown };
    if (typeof precision !== "number" || !Number.isInteger(precision) || precision < 1 || precision > 38) return [`${path}.precision must be an integer between 1 and 38`];
    if (typeof scale !== "number" || !Number.isInteger(scale) || scale < 0 || scale > precision) return [`${path}.scale must be an integer between 0 and precision`];
    return [];
  }
  return [];
}
export function validateModelAttributes(attributes: unknown, enums: Record<string, unknown>, path: string): string[] {
  if (!Array.isArray(attributes) || attributes.length === 0) return [`${path} must be a nonempty list`];
  const errors: string[] = [];
  const seen = new Set<string>();
  attributes.forEach((attribute, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(attribute)) return void errors.push(`${itemPath} must be an object`);
    const unexpected = extraKey(attribute, "name", "type", "nullable");
    if (unexpected !== undefined) errors.push(`${itemPath}.${unexpected} is not allowed`);
    if (typeof attribute.name !== "string" || attribute.name.length === 0) errors.push(`${itemPath}.name is required`);
    else if (seen.has(attribute.name)) errors.push(`${itemPath}.name duplicates another attribute`);
    else seen.add(attribute.name);
    if (typeof attribute.nullable !== "boolean") errors.push(`${itemPath}.nullable is required`);
    errors.push(...validateLogicalType(attribute.type, enums, `${itemPath}.type`));
  });
  return errors;
}
export function validateModelEnums(enums: unknown, path: string): string[] {
  if (enums === undefined) return [];
  if (!isRecord(enums)) return [`${path} must be an object`];
  const errors: string[] = [];
  for (const [name, domain] of Object.entries(enums)) {
    if (name.length === 0) { errors.push(`${path} must not contain an empty domain name`); continue; }
    const values = isRecord(domain) && domain.kind === "enum" && extraKey(domain, "kind", "values") === undefined ? domain.values : undefined;
    if (values === undefined) errors.push(`${path}.${name} must be an enum domain`);
    else if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string" || value.length === 0)) errors.push(`${path}.${name}.values must be a nonempty list of nonempty strings`);
    else if (new Set(values).size !== values.length) errors.push(`${path}.${name}.values must be distinct`);
  }
  return errors;
}
function validateTuple(tuple: unknown, cols: Map<string, boolean>, nonNull: boolean, path: string): { errors: string[]; id?: string } {
  if (!Array.isArray(tuple) || tuple.length === 0) return { errors: [`${path} must be a nonempty tuple`] };
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tuple.length; i++) {
    const col = tuple[i], item = `${path}[${i}]`;
    if (typeof col !== "string" || !cols.has(col)) errors.push(`${item} references unknown attribute ${String(col)}`);
    else if (seen.has(col)) errors.push(`${item} duplicates attribute ${col}`);
    else { seen.add(col); if (nonNull && cols.get(col)) errors.push(`${item} must not reference nullable attribute ${col}`); }
  }
  return errors.length === 0 ? { errors, id: JSON.stringify(tuple) } : { errors };
}
export function validateModelKeys(row: { readonly attributes: readonly ModelAttribute[]; readonly key?: unknown; readonly unique?: unknown }, path: string): string[] {
  const cols = new Map(row.attributes.map((a) => [a.name, a.nullable]));
  const key = validateTuple(row.key, cols, true, `${path}.key`);
  const errors = [...key.errors];
  const seen = new Set<string>(key.id === undefined ? [] : [key.id]);
  if (row.unique === undefined) return errors;
  if (!Array.isArray(row.unique)) return [...errors, `${path}.unique must be a list`];
  for (let i = 0; i < row.unique.length; i++) {
    const unique = validateTuple(row.unique[i], cols, false, `${path}.unique[${i}]`);
    errors.push(...unique.errors);
    if (unique.id !== undefined) {
      if (seen.has(unique.id)) errors.push(`${path}.unique[${i}] duplicates an earlier key declaration`);
      else seen.add(unique.id);
    }
  }
  return errors;
}
const matchBound = (b: unknown, min: number, max: number | "many"): boolean => isRecord(b) && extraKey(b, "min", "max") === undefined && b.min === min && b.max === max;
function sameType(a: LogicalType, b: LogicalType): boolean {
  if ("enumRef" in a || "enumRef" in b) return "enumRef" in a && "enumRef" in b && a.enumRef === b.enumRef;
  return a.kind === b.kind && (a.kind === "decimal" && b.kind === "decimal" ? a.precision === b.precision && a.scale === b.scale : TEXT_KINDS.has(a.kind) && TEXT_KINDS.has(b.kind) ? (a as TextDomain).minLength === (b as TextDomain).minLength && (a as TextDomain).maxLength === (b as TextDomain).maxLength : true);
}
export function validateFieldPair(pair: Record<string, unknown>, local: ModelRow, target: ModelRow, path: string): string[] {
  const lMap = new Map(local.attributes.map((a) => [a.name, a])), tMap = new Map(target.attributes.map((a) => [a.name, a]));
  const l = validateTuple(pair.fields, new Map(local.attributes.map((a) => [a.name, a.nullable])), false, `${path}.fields`), t = validateTuple(pair.targetFields, new Map(target.attributes.map((a) => [a.name, a.nullable])), false, `${path}.targetFields`);
  if (l.errors.length + t.errors.length > 0) return [...l.errors, ...t.errors];
  const lf = pair.fields as Names, tf = pair.targetFields as Names, keys = new Set([JSON.stringify(target.key), ...(target.unique ?? []).filter((u) => u.every((c) => !tMap.get(c)!.nullable)).map((u) => JSON.stringify(u))]);
  if (lf.length !== tf.length || !keys.has(t.id!)) return [`${path}.targetFields ${lf.length !== tf.length ? "must match fields arity" : "must reference a primary key or non-nullable unique tuple"}`];
  return lf.flatMap((f, i) => sameType(lMap.get(f)!.type, tMap.get(tf[i]!)!.type) ? [] : [`${path}.fields[${i}] type does not match targetFields[${i}]`]);
}
export function validateModelFkEdges<R extends object>(nodes: Record<string, { readonly attributes?: readonly ModelAttribute[]; readonly key?: Names; readonly unique?: readonly Names[]; readonly references?: unknown }>, relations: Record<string, R>, endpoints: (relation: R, field: "source" | "target") => string[]): string[] {
  const errors: string[] = [], nodeMap = new Map(Object.entries(nodes)), relMap = new Map<string, { rel: Record<string, unknown>; src: string[]; dst: string[] }>(), bound = new Set<string>();
  for (const [id, raw] of Object.entries(relations)) {
    const src = endpoints(raw, "source"), dst = endpoints(raw, "target");
    for (const [f, list] of [["source", src], ["target", dst]] as const) if (list.length > 1) errors.push(`relation_types.${id}.${f} must name exactly one node type`);
    relMap.set(id, { rel: raw as Record<string, unknown>, src, dst });
  }
  for (const [nodeId, node] of nodeMap) {
    if (node.references === undefined) continue;
    if (!Array.isArray(node.references)) { errors.push(`node_types.${nodeId}.references must be a list`); continue; }
    node.references.forEach((ref, i) => {
      const p = `node_types.${nodeId}.references[${i}]`; if (!isRecord(ref)) return void errors.push(`${p} must be an object`);
      const extra = extraKey(ref, "relation", "fields", "targetFields"), info = typeof ref.relation === "string" ? relMap.get(ref.relation) : undefined;
      if (extra !== undefined) errors.push(`${p}.${extra} is not allowed`);
      if (!info) return void errors.push(`${p}.relation references unknown relation ${String(ref.relation)}`);
      const relId = ref.relation as string, relPath = `relation_types.${relId}`;
      if (info.src.length !== 1 || info.dst.length !== 1 || !nodeMap.has(info.src[0]!) || !nodeMap.has(info.dst[0]!)) return;
      if (info.src[0] !== nodeId || bound.has(relId)) return void errors.push(`${p}.relation ${info.src[0] !== nodeId ? `source ${info.src[0]} does not match ${nodeId}` : `duplicates FK binding for relation ${relId}`}`);
      bound.add(relId); for (const f of ["attributes", "key", "unique", "endpoints"]) if (info.rel[f] !== undefined) errors.push(`${relPath}.${f} is not allowed on an FK-backed relation`);
      const pairErrors = validateFieldPair(ref, node as ModelRow, nodeMap.get(info.dst[0]!)! as ModelRow, p);
      if (pairErrors.length > 0) return void errors.push(...pairErrors);
      const card = info.rel.cardinality, lf = ref.fields as Names, lSet = new Set(lf), nullable = lf.some((c) => node.attributes!.find((a) => a.name === c)!.nullable), unique = [node.key!, ...(node.unique ?? [])].some((u) => u.every((c) => lSet.has(c)));
      if (!isRecord(card) || extraKey(card, "in", "out") !== undefined) return void errors.push(`${relPath}.cardinality must declare in and out bounds`);
      if (!matchBound(card.out, nullable ? 0 : 1, 1)) errors.push(`${relPath}.cardinality.out must be {min:${nullable ? 0 : 1},max:1}`);
      if (!matchBound(card.in, 0, unique ? 1 : "many")) errors.push(`${relPath}.cardinality.in must be {min:0,max:${unique ? 1 : "many"}}`);
    });
  }
  return errors;
}
