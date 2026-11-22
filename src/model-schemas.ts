import type { OntologyNodeType, OntologyRegistrySpec, OntologyRelationCardinality, OntologyRelationType } from "./types.js";
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
export type Cardinality = Required<OntologyRelationCardinality>;
export interface ModelEndpoints { source: FieldPair; target: FieldPair }
export type ModelNode = OntologyNodeType & ModelRow & { references?: readonly Reference[] };
export type ModelEdge = OntologyRelationType & { cardinality: Cardinality } & ({ attributes?: never; key?: never; unique?: never; endpoints?: never } | (ModelRow & { endpoints: ModelEndpoints }));
type Fragment = Record<string, unknown>;
export const NATIVE_TEXT_SCHEMA: Fragment = { type: "object", properties: { kind: { const: "text" }, minLength: { type: "number" }, maxLength: { type: "number" }, pattern: { type: "string" }, patternName: { type: "string" } }, required: ["kind"], additionalProperties: false };
export const NATIVE_BOOLEAN_SCHEMA: Fragment = { type: "object", properties: { kind: { const: "boolean" } }, required: ["kind"], additionalProperties: false };
export const NATIVE_DATE_SCHEMA: Fragment = { type: "object", properties: { kind: { const: "date" } }, required: ["kind"], additionalProperties: false };
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
const SIMPLE_KINDS = new Set(["int", "bigint", "timestamptz", "uuid", "json"]);
const TEXT_KINDS = new Set(["string", "text"]);
const isNonNegInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
export const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor", "sourcePath", "profile_hash", "bound_source_path"]);
export const extraKey = (value: Record<string, unknown>, ...allowed: string[]): string | undefined => Object.keys(value).find((key) => !allowed.includes(key));
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
    if (name.trim().length === 0 || RESERVED_KEYS.has(name)) { errors.push(name.trim().length === 0 ? `${path} must not contain an empty domain name` : `${path}.${name} is a reserved key`); continue; }
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
export function validateFieldPair(pair: Record<string, unknown>, local: Pick<ModelRow, "attributes">, target: ModelRow, path: string, nonNull = false): string[] {
  const lMap = new Map(local.attributes.map((a) => [a.name, a])), tMap = new Map(target.attributes.map((a) => [a.name, a]));
  const l = validateTuple(pair.fields, new Map(local.attributes.map((a) => [a.name, a.nullable])), nonNull, `${path}.fields`), t = validateTuple(pair.targetFields, new Map(target.attributes.map((a) => [a.name, a.nullable])), false, `${path}.targetFields`);
  if (l.errors.length + t.errors.length > 0) return [...l.errors, ...t.errors];
  const lf = pair.fields as Names, tf = pair.targetFields as Names, keys = new Set([JSON.stringify(target.key), ...(target.unique ?? []).filter((u) => u.every((c) => !tMap.get(c)!.nullable)).map((u) => JSON.stringify(u))]);
  if (lf.length !== tf.length || !keys.has(t.id!)) return [`${path}.targetFields ${lf.length !== tf.length ? "must match fields arity" : "must reference a primary key or non-nullable unique tuple"}`];
  return lf.flatMap((f, i) => sameType(lMap.get(f)!.type, tMap.get(tf[i]!)!.type) ? [] : [`${path}.fields[${i}] type does not match targetFields[${i}]`]);
}
const isBound = (b: unknown): b is { min: number; max: number | "many" } => isRecord(b) && extraKey(b, "min", "max") === undefined && isNonNegInt(b.min) && (b.max === "many" || (isNonNegInt(b.max) && b.max >= b.min));
const isUnique = (row: Pick<ModelRow, "key" | "unique">, fields: Names): boolean => { const s = new Set(fields); return [row.key, ...(row.unique ?? [])].some((u) => u.every((c) => s.has(c))); };
export function validateModelFkEdges<R extends object>(nodes: Record<string, { readonly attributes?: readonly ModelAttribute[]; readonly key?: Names; readonly unique?: readonly Names[]; readonly references?: unknown }>, relations: Record<string, R>, endpoints: (relation: R, field: "source" | "target") => string[], enums?: Record<string, unknown>): string[] {
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
  if (enums === undefined || errors.length > 0) return errors;
  for (const [id, info] of relMap) {
    if (bound.has(id) || info.src.length !== 1 || info.dst.length !== 1 || !nodeMap.has(info.src[0]!) || !nodeMap.has(info.dst[0]!)) continue;
    const rel = info.rel, p = `relation_types.${id}`, ep = rel.endpoints, attrErrs = validateModelAttributes(rel.attributes, enums, `${p}.attributes`), epOk = { source: false, target: false };
    let keyOk = false; errors.push(...attrErrs);
    if (attrErrs.length === 0) {
      const row = { attributes: rel.attributes as readonly ModelAttribute[], key: rel.key as Names, unique: rel.unique as readonly Names[] | undefined }, keyErrs = validateModelKeys(row, p);
      errors.push(...keyErrs); keyOk = keyErrs.length === 0;
      if (!isRecord(ep)) errors.push(`${p}.endpoints must be an object`);
      else {
        const extra = extraKey(ep, "source", "target"); if (extra !== undefined) errors.push(`${p}.endpoints.${extra} is not allowed`);
        for (const [side, nodeId] of [["source", info.src[0]!], ["target", info.dst[0]!]] as const) {
          const pair = ep[side], epPath = `${p}.endpoints.${side}`; if (!isRecord(pair)) { errors.push(`${epPath} must be an object`); continue; }
          const pExtra = extraKey(pair, "fields", "targetFields"), pErrs = validateFieldPair(pair, row, nodeMap.get(nodeId)! as ModelRow, epPath, true);
          if (pExtra !== undefined) errors.push(`${epPath}.${pExtra} is not allowed`);
          errors.push(...pErrs); if (pExtra === undefined && pErrs.length === 0) epOk[side] = true;
        }
      }
    }
    const card = rel.cardinality;
    if (!isRecord(card) || extraKey(card, "in", "out") !== undefined) errors.push(`${p}.cardinality must declare in and out bounds`);
    else for (const [dir, side] of [["out", "source"], ["in", "target"]] as const) {
      const b = card[dir];
      if (!isBound(b)) errors.push(`${p}.cardinality.${dir} must declare integer min >= 0 and max >= min or "many"`);
      else if (b.max === 1 && keyOk && epOk[side] && !isUnique(rel as unknown as ModelRow, ((ep as Record<string, FieldPair>)[side]!).fields)) errors.push(`${p}.cardinality.${dir} max 1 requires a unique endpoints.${side}.fields tuple`);
    }
  }
  return errors;
}
type FieldCheck = (v: unknown, path: string, errors: string[]) => void;
export const isNonEmptyStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0, isTrimmedStr = (v: unknown): v is string => isNonEmptyStr(v) && v.trim() === v;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isNonEmptyStr);
const rule = (ok: (v: unknown) => boolean, msg: string): FieldCheck => (v, p, e) => { if (!ok(v)) e.push(`${p} ${msg}`); };
const all = (keys: readonly string[], fn: FieldCheck): Record<string, FieldCheck> => Object.fromEntries(keys.map((k) => [k, fn]));
const cAny: FieldCheck = () => {}, cBool = rule((v) => typeof v === "boolean", "must be a boolean"), cStr = rule(isNonEmptyStr, "must be a nonempty string"), cTrimStr = rule(isTrimmedStr, "must be a trimmed nonempty string"), cNullTrimStr = rule((v) => v === null || isTrimmedStr(v), "must be a trimmed nonempty string or null");
const cStrList = rule(isStrList, "must be a list of nonempty strings"), cNonEmptyStrList = rule((v) => isStrList(v) && v.length > 0, "must be a nonempty list of nonempty strings"), cStrOrList = rule((v) => isNonEmptyStr(v) || isStrList(v), "must be a nonempty string or list of nonempty strings"), cNonEmptyStrOrList = rule((v) => isNonEmptyStr(v) || (isStrList(v) && v.length > 0), "must be a nonempty string or nonempty list of nonempty strings");
const cNonNegInt = rule(isNonNegInt, "must be a nonnegative integer"), cNonNegNum = rule((v) => typeof v === "number" && Number.isFinite(v) && v >= 0, "must be a nonnegative number"), cSet = (s: Set<string>): FieldCheck => rule((v) => typeof v === "string" && s.has(v), `must be one of ${[...s].join(", ")}`);
function checkObj(raw: unknown, path: string, fields: Record<string, FieldCheck>, errors: string[]): void {
  if (!isRecord(raw)) { errors.push(`${path} must be an object`); return; }
  for (const [k, v] of Object.entries(raw)) { const kp = path ? `${path}.${k}` : k, fn = Object.hasOwn(fields, k) ? fields[k] : undefined; if (!fn) errors.push(`${kp} is not allowed`); else if (v !== undefined) fn(v, kp, errors); }
}
function checkMap(raw: unknown, path: string, schema: Record<string, FieldCheck>, errors: string[]): void {
  if (!isRecord(raw)) { errors.push(`${path} must be an object`); return; }
  for (const [k, v] of Object.entries(raw)) if (!isNonEmptyStr(k) || RESERVED_KEYS.has(k)) errors.push(!isNonEmptyStr(k) ? `${path} must not contain an empty key` : `${path}.${k} is a reserved key`); else checkObj(v, `${path}.${k}`, schema, errors);
}
const checkObjSchema = (schema: Record<string, FieldCheck>): FieldCheck => (v, p, e) => checkObj(v, p, schema, e);
const checkMapSchema = (schema: Record<string, FieldCheck>): FieldCheck => (v, p, e) => checkMap(v, p, schema, e);
const CIT_SCHEMA: Record<string, FieldCheck> = { minimum_granularity: cSet(new Set(["file", "page", "section", "paragraph"])), require_source_file: cBool, allow_bbox: rule((v) => typeof v === "boolean" || v === "when_available", 'must be a boolean or "when_available"') };
const TRANS_SCHEMA: Record<string, FieldCheck> = { from: cNonEmptyStrOrList, to: cNonEmptyStrOrList, from_statuses: cNonEmptyStrList, to_statuses: cNonEmptyStrList, requires: cStrList };
const HARD_SCHEMA: Record<string, FieldCheck> = { statuses: cNonEmptyStrList, default_status: cStr, promotion_requires: cStrList, status_transitions: (v, p, e) => { if (!Array.isArray(v)) { e.push(`${p} must be a list`); return; } v.forEach((t, i) => { const tp = `${p}[${i}]`; checkObj(t, tp, TRANS_SCHEMA, e); if (!isRecord(t)) return; for (const [a, b] of [["from", "from_statuses"], ["to", "to_statuses"]] as const) if (t[a] !== undefined && t[b] !== undefined) e.push(`${tp}.${b} cannot be combined with ${a}`); else if (t[a] === undefined && t[b] === undefined) e.push(`${tp}.${a} is required`); }); } };
const INF_SCHEMA: Record<string, FieldCheck> = { allow_inferred_relations: cBool, allowed_relation_types: cStrList, require_evidence_refs: cBool };
const EV_SCHEMA: Record<string, FieldCheck> = { require_evidence_refs: cBool, min_refs: cNonNegInt, node_types: cStrList, relation_types: cStrList };
const WIKI_SCHEMA: Record<string, FieldCheck> = { ...all(["enabled", "include_backlinks", "include_source_snippets"], cBool), page_node_types: cStrList };
const OUT_SCHEMA: Record<string, FieldCheck> = { ontology: checkObjSchema({ enabled: cBool, artifact_schema: cStr, ...all(["canonical_node_types", "source_node_types", "occurrence_node_types", "alias_fields"], cStrList), relation_exports: (v, p, e) => { if (!Array.isArray(v)) { e.push(`${p} must be a list`); return; } v.forEach((item, i) => { const ip = `${p}[${i}]`; if (isNonEmptyStr(item)) return; if (!isRecord(item)) { e.push(`${ip} must be a nonempty string or object`); return; } checkObj(item, ip, { relation_type: cStr }, e); if (item.relation_type === undefined) e.push(`${ip}.relation_type is required`); }); }, wiki: checkObjSchema(WIKI_SCHEMA) }) };
const LINK_BUILTINS = new Set(["case_fold", "dash_fold", "collapse_ws"]), LINK_MODES = new Set(["exact", "none"]), LINK_DETECTORS = new Set(["lexicon", "pattern", "llm"]);
const checkPattern: FieldCheck = (v, p, e) => { checkObj(v, p, { form: cStr, flags: cStr, membership: rule((x) => x === "required", 'must be "required"'), expand: (x, ep, er) => { checkObj(x, ep, { ranges: cStr }, er); if (isRecord(x) && x.ranges === undefined) er.push(`${ep}.ranges is required`); } }, e); if (isRecord(v)) { if (v.form === undefined) e.push(`${p}.form is required`); else if (isNonEmptyStr(v.form) && (v.flags === undefined || isNonEmptyStr(v.flags))) { try { new RegExp(v.form, v.flags as string | undefined); } catch { e.push(`${p}.form must be a valid regex`); } } } };
const LLM_SCHEMA: Record<string, FieldCheck> = { trigger: cSet(new Set(["zero_candidates", "unresolved_candidates", "below_min_candidates"])), budget_usd: cNonNegNum, dry_run: cBool, min_candidates: cNonNegInt };
const LINK_SCHEMA: Record<string, FieldCheck> = {
  preset: cSet(new Set(["gazetteer-exact", "open-extraction", "hybrid-recall"])),
  normalize: checkObjSchema({ builtin: rule((x) => Array.isArray(x) && x.every((b) => typeof b === "string" && LINK_BUILTINS.has(b)), "must be a list of built-in normalizers"), fn: cTrimStr }),
  partition_from: (v, p, e) => { checkObj(v, p, { source_frontmatter: cTrimStr, else: (x, ep, er) => { checkObj(x, ep, { path_segment: cNonNegInt }, er); if (isRecord(x) && x.path_segment === undefined) er.push(`${ep}.path_segment is required`); } }, e); if (isRecord(v) && v.source_frontmatter === undefined) e.push(`${p}.source_frontmatter is required`); },
  detect: (v, p, e) => { if (!Array.isArray(v)) { e.push(`${p} must be a list`); return; } v.forEach((d, i) => { const dp = `${p}[${i}]`; if (typeof d === "string" && LINK_DETECTORS.has(d)) return; if (!isRecord(d)) { e.push(`${dp} must be lexicon, pattern, llm, or a detector object`); return; } const ks = Object.keys(d); if (ks.length === 1 && ks[0] === "pattern") checkPattern(d.pattern, `${dp}.pattern`, e); else if (ks.length === 1 && ks[0] === "llm") checkObj(d.llm, `${dp}.llm`, LLM_SCHEMA, e); else e.push(`${dp} must declare only pattern or llm`); }); },
  patterns: (v, p, e) => { if (!Array.isArray(v)) e.push(`${p} must be a list`); else v.forEach((d, i) => checkPattern(d, `${p}[${i}]`, e)); },
  resolve: (v, p, e) => { if (typeof v === "string" && LINK_MODES.has(v)) return; checkObj(v, p, { mode: cSet(LINK_MODES) }, e); if (isRecord(v) && v.mode === undefined) e.push(`${p}.mode is required`); },
  evidence: checkObjSchema({ verbatim: rule((x) => x === "required", 'must be "required"'), context_window: cNonNegNum }),
};
const NODE_SCHEMA: Record<string, FieldCheck> = { aliases: cStrList, registry: cAny, source_backed: cBool, status_policy: cStr, linking: checkObjSchema(LINK_SCHEMA), visual_encoding: checkObjSchema(all(["shape", "color_hex", "fill", "border"], cStr)), ...all(["attributes", "key", "unique", "references"], cAny) };
const REL_SCHEMA: Record<string, FieldCheck> = { source: cStrOrList, target: cStrOrList, source_types: cStrList, target_types: cStrList, ...all(["cardinality", "attributes", "key", "unique", "endpoints"], cAny), requires_evidence: cBool, assertion_basis: cStrOrList, derivation_method: cStrOrList, derivation_methods: cStrList };
const REG_SCHEMA: Record<string, FieldCheck> = { ...all(["source", "id_column", "label_column", "alias_columns", "node_type", "partition_column"], cAny), bound_source_path: cStr };
const HIER_SCHEMA: Record<string, FieldCheck> = all(["registry", "parent_column", "child_column", "relation_type", "parent_node_type", "child_node_type"], cStr);
const CLASS_HIER_SCHEMA: Record<string, FieldCheck> = { relation_type: cTrimStr, membership_relation_type: cTrimStr, classes: checkMapSchema({ parent: cNullTrimStr, label: cNullTrimStr, member_node_types: cStrList, member_hierarchies: cStrList }) };
const PROFILE_SCHEMA: Record<string, FieldCheck> = { ...all(["id", "version", "data_model"], cAny), ...all(["default_language", "sourcePath", "profile_hash"], cStr), node_types: checkMapSchema(NODE_SCHEMA), relation_types: checkMapSchema(REL_SCHEMA), registries: checkMapSchema(REG_SCHEMA), citation_policy: checkObjSchema(CIT_SCHEMA), hardening: checkObjSchema(HARD_SCHEMA), inference_policy: checkObjSchema(INF_SCHEMA), evidence_policy: checkObjSchema(EV_SCHEMA), hierarchies: checkMapSchema(HIER_SCHEMA), class_hierarchies: checkMapSchema(CLASS_HIER_SCHEMA), outputs: checkObjSchema(OUT_SCHEMA) };
export function validateModelClosure(profile: Record<string, unknown>): string[] {
  const errors: string[] = [];
  checkObj(profile, "", PROFILE_SCHEMA, errors);
  if (profile.node_types === undefined) errors.push("node_types must be an object");
  if (isRecord(profile.relation_types)) for (const [id, r] of Object.entries(profile.relation_types)) if (isNonEmptyStr(id) && !RESERVED_KEYS.has(id) && isRecord(r)) for (const [a, b] of [["source", "source_types"], ["target", "target_types"], ["derivation_method", "derivation_methods"]] as const) if (r[a] !== undefined && r[b] !== undefined) errors.push(`relation_types.${id}.${b} cannot be combined with ${a}`);
  return errors;
}
export function validateModelRegistries(nodes: Record<string, Pick<ModelNode, "attributes" | "key" | "unique">>, registries: Record<string, OntologyRegistrySpec>): string[] {
  const errors: string[] = [], nodeMap = new Map(Object.entries(nodes));
  for (const [id, reg] of Object.entries(registries)) {
    const p = `registries.${id}`, node = typeof reg.node_type === "string" ? nodeMap.get(reg.node_type) : undefined; if (!node) continue;
    const cols = new Map(node.attributes.map((a) => [a.name, a])), singleKeys = new Set([node.key, ...(node.unique ?? [])].filter((u) => u.length === 1 && !cols.get(u[0]!)!.nullable).map((u) => u[0]!));
    if (isNonEmptyStr(reg.id_column) && !singleKeys.has(reg.id_column)) errors.push(`${p}.id_column must reference a non-null single-field candidate key`);
    if (isNonEmptyStr(reg.label_column)) { const lbl = cols.get(reg.label_column); if (!lbl || lbl.nullable || !("kind" in lbl.type) || !TEXT_KINDS.has(lbl.type.kind)) errors.push(`${p}.label_column must reference a non-null string or text attribute`); }
    if (reg.alias_columns !== undefined && !Array.isArray(reg.alias_columns)) errors.push(`${p}.alias_columns must be a list`); else if (Array.isArray(reg.alias_columns)) { const seen = new Set<string>(); reg.alias_columns.forEach((c, i) => { if (typeof c !== "string" || !cols.has(c)) errors.push(`${p}.alias_columns[${i}] references unknown attribute ${String(c)}`); else if (seen.has(c)) errors.push(`${p}.alias_columns[${i}] duplicates attribute ${c}`); else seen.add(c); }); }
    if (reg.partition_column !== undefined && (typeof reg.partition_column !== "string" || !cols.has(reg.partition_column))) errors.push(`${p}.partition_column references unknown attribute ${String(reg.partition_column)}`);
  }
  return errors;
}
