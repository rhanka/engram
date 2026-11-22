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
