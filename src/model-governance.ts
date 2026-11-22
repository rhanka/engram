import { canonicalBytes, sha256Hex } from "./ontology-guardian/canonical.js"; import { isDigest, type Digest, type Pin } from "./ontology-guardian/types.js";
import { hashOntologyProfile, normalizeOntologyProfile } from "./ontology-profile.js";
import { DATA_MODEL_FORMAT, RESERVED_KEYS, extraKey, isNonEmptyStr, isRecord, isTrimmedStr, validateModelAttributes, validateModelClosure, validateModelEnums, validateModelFkEdges, validateModelKeys, validateModelRegistries, type ModelAttribute, type ModelNode, type ModelRow, type Names } from "./model-schemas.js";
import type { NormalizedOntologyProfile, OntologyProfile, OntologyRegistrySpec } from "./types.js";
export const DATA_GOVERNANCE_FORMAT = "engram.data-governance/1";
export interface QualifiedPin { namespace: string; pin: Pin }
export type TenantScope = { kind: "global" } | { kind: "tenant"; tenant: string; workspace?: string };
export type PiiCategory = "identifier" | "contact" | "authentication" | "personal" | "sensitive";
export type ColumnGovernance = ({ pii: { category: "none" }; retention?: never; erasure?: never } | { pii: { category: PiiCategory }; retention: string; erasure: "delete" | "anonymize" }) & { protect?: { encrypt: true } };
export interface Retention { from: string; days: number }
export interface ChangeCapture { include: boolean } export interface SealedModelGovernance { readonly bytes: string; readonly byteLength: number; readonly digest: Digest; readonly pin: QualifiedPin }
export interface StorageNeeds { tenantScope: TenantScope; columns: Record<string, ColumnGovernance>; cdc: ChangeCapture; retention?: Record<string, Retention>; physical?: { schema?: string; table?: string; columns?: Record<string, string> }; indexes?: readonly { kind: "btree" | "unique" | "gin"; fields: Names }[]; partitionBy?: Names; sortBy?: readonly { field: string; direction: "asc" | "desc" }[] }
export interface ModelGovernance { format: typeof DATA_GOVERNANCE_FORMAT; namespace: string; id: string; version: string; profile: QualifiedPin; entities: Record<string, StorageNeeds>; relations?: Record<string, StorageNeeds> }
const SCOPE_KINDS = new Set(["uuid", "string", "text", "int", "bigint"]), PII_CATS = new Set(["identifier", "contact", "authentication", "personal", "sensitive"]);
const ERASURE = new Set(["delete", "anonymize"]), TABLE_KEYS = ["tenantScope", "columns", "retention", "cdc", "physical", "indexes", "partitionBy", "sortBy"], V2_RE = /^2(?:\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))?$/, NORM_SUF = ".linking.normalizer is not allowed";
const SQL_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/, INDEX_KINDS = new Set(["btree", "unique", "gin"]);
const relEnds = (r: Record<string, unknown>, f: "source" | "target"): string[] => { const raw = r[`${f}_types`] ?? r[f]; return Array.isArray(raw) ? raw as string[] : typeof raw === "string" ? [raw] : []; };
const badKey = (k: string, p: string): string | undefined => !isNonEmptyStr(k) ? `${p} must not contain an empty key` : RESERVED_KEYS.has(k) ? `${p}.${k} is a reserved key` : undefined;
const checkScopeOp = (op: unknown, cols: Map<string, ModelAttribute>, p: string, errors: string[]): void => { const a = typeof op === "string" ? cols.get(op) : undefined; if (!a) errors.push(`${p} references unknown attribute ${String(op)}`); else if (a.nullable) errors.push(`${p} must not reference nullable attribute ${op}`); else if (!("kind" in a.type) || !SCOPE_KINDS.has(a.type.kind)) errors.push(`${p} attribute ${op} has unsupported scope kind`); };
const okNorm = (p: Record<string, unknown>, id: string): boolean => { const nt = p.node_types, n = isRecord(nt) && Object.hasOwn(nt, id) ? nt[id] : undefined, d = isRecord(n) && isRecord(n.linking) ? n.linking.normalizer : undefined; return isDigest(p.profile_hash) && isRecord(d) && extraKey(d, "contract", "builtins", "export", "module_sha256", "normalizer_hash") === undefined && isDigest(d.normalizer_hash); };
function verifyN(profile: unknown): { errors: string[]; nodes?: Record<string, ModelNode>; rels?: Record<string, Record<string, unknown>> } {
  if (!isRecord(profile)) return { errors: ["profile must be an object"] };
  const m = profile.data_model; if (!isRecord(m) || m.format !== DATA_MODEL_FORMAT) return { errors: [!isRecord(m) ? "data_model must be an object" : `data_model.format must be ${DATA_MODEL_FORMAT}`] };
  const mEx = extraKey(m, "format", "enums"); if (mEx !== undefined) return { errors: [`data_model.${mEx} is not allowed`] };
  if (typeof profile.version !== "string" || !V2_RE.test(profile.version)) return { errors: ["version must be an exact major-2 version string for data_model"] };
  if (!isNonEmptyStr(profile.id)) return { errors: ["id is required"] };
  const ce = validateModelClosure(profile).filter((e) => !(e.startsWith("node_types.") && e.endsWith(NORM_SUF) && okNorm(profile, e.slice(11, -NORM_SUF.length)))); if (ce.length > 0) return { errors: ce };
  const nodes = profile.node_types as Record<string, Record<string, unknown>>, rels = (profile.relation_types ?? {}) as Record<string, Record<string, unknown>>, regs = (profile.registries ?? {}) as Record<string, Record<string, unknown>>, mNodes = nodes as unknown as Record<string, ModelNode>;
  if (Object.keys(nodes).length === 0) return { errors: ["node_types must be a nonempty object"] };
  const errors = validateModelEnums(m.enums, "data_model.enums"); if (errors.length > 0) return { errors };
  const enums = Object.assign(Object.create(null), m.enums);
  for (const [id, n] of Object.entries(nodes)) {
    const ae = validateModelAttributes(n.attributes, enums, `node_types.${id}.attributes`); errors.push(...ae, ...(ae.length === 0 ? validateModelKeys({ attributes: n.attributes as readonly ModelAttribute[], key: n.key, unique: n.unique }, `node_types.${id}`) : []));
    if (n.registry !== undefined && (typeof n.registry !== "string" || !Object.hasOwn(regs, n.registry) || regs[n.registry]!.node_type !== id)) errors.push(`node_types.${id}.registry references invalid registry ${String(n.registry)}`);
  }
  for (const [id, r] of Object.entries(rels)) for (const s of ["source", "target"] as const) { const l = relEnds(r, s); if (l.length === 0 || (l.length === 1 && !Object.hasOwn(nodes, l[0]!))) errors.push(`relation_types.${id}.${s} references unknown node type`); }
  for (const [id, reg] of Object.entries(regs)) { for (const f of ["source", "id_column", "label_column", "node_type"] as const) if (!isNonEmptyStr(reg[f])) errors.push(`registries.${id}.${f} is required`); if (isNonEmptyStr(reg.node_type) && !Object.hasOwn(nodes, reg.node_type)) errors.push(`registries.${id}.node_type references unknown node type ${reg.node_type}`); }
  if (errors.length === 0) errors.push(...validateModelFkEdges(mNodes, rels, relEnds, enums), ...validateModelRegistries(mNodes, regs as unknown as Record<string, OntologyRegistrySpec>));
  return { errors, nodes: mNodes, rels };
}
interface TableRef { p: string; schema: string; table: string; hasTable: boolean }
function checkFields(raw: unknown, cols: Map<string, ModelAttribute>, p: string, errors: string[]): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) { errors.push(`${p} must be a nonempty list`); return undefined; }
  const seen = new Set<string>(), n0 = errors.length;
  raw.forEach((f, i) => { if (typeof f !== "string" || !cols.has(f)) errors.push(`${p}[${i}] references unknown attribute ${String(f)}`); else if (seen.has(f)) errors.push(`${p}[${i}] duplicates attribute ${f}`); else seen.add(f); });
  return errors.length === n0 ? raw as string[] : undefined;
}
function checkStorage(row: ModelRow, t: Record<string, unknown>, cols: Map<string, ModelAttribute>, p: string, id: string, tables: TableRef[], errors: string[]): void {
  if (!isRecord(t.cdc)) errors.push(`${p}.cdc must be an object`); else { const ex = extraKey(t.cdc, "include"); if (ex !== undefined) errors.push(`${p}.cdc.${ex} is not allowed`); if (typeof t.cdc.include !== "boolean") errors.push(`${p}.cdc.include must be a boolean`); }
  let schema = "", table = id, hasTable = false, tableOk = true;
  if (t.physical !== undefined) if (!isRecord(t.physical)) { errors.push(`${p}.physical must be an object`); tableOk = false; } else {
    const ph = t.physical, ex = extraKey(ph, "schema", "table", "columns"); if (ex !== undefined) errors.push(`${p}.physical.${ex} is not allowed`);
    if (ph.schema !== undefined) if (typeof ph.schema !== "string" || !SQL_ID_RE.test(ph.schema)) { errors.push(`${p}.physical.schema must be a valid SQL identifier`); tableOk = false; } else schema = ph.schema;
    if (ph.table !== undefined) if (typeof ph.table !== "string" || !SQL_ID_RE.test(ph.table)) { errors.push(`${p}.physical.table must be a valid SQL identifier`); tableOk = false; } else { table = ph.table; hasTable = true; }
    if (ph.columns !== undefined) if (!isRecord(ph.columns)) errors.push(`${p}.physical.columns must be an object`); else {
      const ovs: Array<[string, string]> = [], ovSet = new Set<string>();
      for (const [k, v] of Object.entries(ph.columns)) { const bk = badKey(k, `${p}.physical.columns`), cp = `${p}.physical.columns.${k}`; if (bk) errors.push(bk); else if (!cols.has(k)) errors.push(`${cp} references unknown attribute ${k}`); else { ovSet.add(k); if (typeof v !== "string" || !SQL_ID_RE.test(v)) errors.push(`${cp} must be a valid SQL identifier`); else ovs.push([k, v]); } }
      const used = new Set(row.attributes.filter((a) => !ovSet.has(a.name)).map((a) => a.name)); for (const [k, v] of ovs) if (used.has(v)) errors.push(`${p}.physical.columns.${k} collides with SQL column ${v}`); else used.add(v);
    }
  }
  if (tableOk) tables.push({ p, schema, table, hasTable });
  if (t.indexes !== undefined) if (!Array.isArray(t.indexes)) errors.push(`${p}.indexes must be a list`); else {
    const uniq = new Set([row.key, ...(row.unique ?? [])].map((u) => JSON.stringify(u)));
    t.indexes.forEach((idx, i) => { const ip = `${p}.indexes[${i}]`; if (!isRecord(idx)) return void errors.push(`${ip} must be an object`); const ex = extraKey(idx, "kind", "fields"); if (ex !== undefined) errors.push(`${ip}.${ex} is not allowed`); if (typeof idx.kind !== "string" || !INDEX_KINDS.has(idx.kind)) errors.push(`${ip}.kind must be "btree", "unique", or "gin"`); const f = checkFields(idx.fields, cols, `${ip}.fields`, errors); if (idx.kind === "unique" && f && !uniq.has(JSON.stringify(f))) errors.push(`${ip}.fields must match a unique tuple declared in N`); });
  }
  if (t.partitionBy !== undefined) checkFields(t.partitionBy, cols, `${p}.partitionBy`, errors);
  if (t.sortBy !== undefined) if (!Array.isArray(t.sortBy)) errors.push(`${p}.sortBy must be a list`); else {
    const seen = new Set<string>(); t.sortBy.forEach((s, i) => { const sp = `${p}.sortBy[${i}]`; if (!isRecord(s)) return void errors.push(`${sp} must be an object`); const ex = extraKey(s, "field", "direction"); if (ex !== undefined) errors.push(`${sp}.${ex} is not allowed`); if (typeof s.field !== "string" || !cols.has(s.field)) errors.push(`${sp}.field references unknown attribute ${String(s.field)}`); else if (seen.has(s.field)) errors.push(`${sp}.field duplicates attribute ${s.field}`); else seen.add(s.field); if (s.direction !== "asc" && s.direction !== "desc") errors.push(`${sp}.direction must be "asc" or "desc"`); });
  }
}
function checkTable(row: ModelRow, t: unknown, p: string, id: string, tables: TableRef[], errors: string[]): void {
  if (!isRecord(t)) { errors.push(`${p} must be an object`); return; }
  const tEx = extraKey(t, ...TABLE_KEYS), cols = new Map(row.attributes.map((a) => [a.name, a])), sc = t.tenantScope, rules = new Map<string, Retention | null>(), retOk = t.retention === undefined || isRecord(t.retention);
  if (tEx !== undefined) errors.push(`${p}.${tEx} is not allowed`);
  if (!isRecord(sc)) errors.push(`${p}.tenantScope must be an object`);
  else if (sc.kind === "global") { const ex = extraKey(sc, "kind"); if (ex !== undefined) errors.push(`${p}.tenantScope.${ex} is not allowed`); }
  else if (sc.kind === "tenant") {
    const ex = extraKey(sc, "kind", "tenant", "workspace"); if (ex !== undefined) errors.push(`${p}.tenantScope.${ex} is not allowed`);
    checkScopeOp(sc.tenant, cols, `${p}.tenantScope.tenant`, errors);
    if (sc.workspace !== undefined) { if (sc.workspace === sc.tenant && typeof sc.tenant === "string" && cols.has(sc.tenant)) errors.push(`${p}.tenantScope.workspace must differ from tenant`); else checkScopeOp(sc.workspace, cols, `${p}.tenantScope.workspace`, errors); }
  } else errors.push(`${p}.tenantScope.kind must be "global" or "tenant"`);
  if (!retOk) errors.push(`${p}.retention must be an object`);
  else if (isRecord(t.retention)) for (const [k, r] of Object.entries(t.retention)) {
    const bk = badKey(k, `${p}.retention`), rp = `${p}.retention.${k}`; if (bk || !isRecord(r)) { errors.push(bk ?? `${rp} must be an object`); if (!bk) rules.set(k, null); continue; }
    const n0 = errors.length, ex = extraKey(r, "from", "days"), fa = typeof r.from === "string" ? cols.get(r.from) : undefined; if (ex !== undefined) errors.push(`${rp}.${ex} is not allowed`);
    if (!fa) errors.push(`${rp}.from references unknown attribute ${String(r.from)}`); else if (fa.nullable) errors.push(`${rp}.from must not reference nullable attribute ${r.from}`); else if (!("kind" in fa.type) || fa.type.kind !== "timestamptz") errors.push(`${rp}.from attribute ${r.from} must have kind timestamptz`);
    if (typeof r.days !== "number" || !Number.isSafeInteger(r.days) || r.days <= 0) errors.push(`${rp}.days must be a positive safe integer`);
    rules.set(k, errors.length === n0 ? { from: r.from as string, days: r.days as number } : null);
  }
  checkStorage(row, t, cols, p, id, tables, errors);
  if (!isRecord(t.columns)) { errors.push(`${p}.columns must be an object`); return; }
  for (const a of row.attributes) if (!Object.hasOwn(t.columns, a.name)) errors.push(`${p}.columns.${a.name} is required`);
  let del: Retention | undefined;
  for (const [k, c] of Object.entries(t.columns)) {
    const bk = badKey(k, `${p}.columns`), cp = `${p}.columns.${k}`; if (bk || !cols.has(k) || !isRecord(c) || !isRecord(c.pii)) { errors.push(bk ?? (!cols.has(k) ? `${cp} references unknown attribute ${k}` : !isRecord(c) ? `${cp} must be an object` : `${cp}.pii must be an object`)); continue; }
    const pEx = extraKey(c.pii, "category"), cat = c.pii.category; if (pEx !== undefined) errors.push(`${cp}.pii.${pEx} is not allowed`);
    if (cat === "none") { for (const fk of Object.keys(c)) if (fk !== "pii" && fk !== "protect") errors.push(`${cp}.${fk} is not allowed on pii category none`); }
    else if (typeof cat === "string" && PII_CATS.has(cat)) {
      const cEx = extraKey(c, "pii", "retention", "erasure", "protect"); if (cEx !== undefined) errors.push(`${cp}.${cEx} is not allowed`);
      if (typeof c.retention !== "string" || (retOk && !rules.has(c.retention))) errors.push(`${cp}.retention ${c.retention === undefined ? "is required" : `references unknown retention rule ${String(c.retention)}`}`);
      if (typeof c.erasure !== "string" || !ERASURE.has(c.erasure)) errors.push(`${cp}.erasure must be "delete" or "anonymize"`);
      else if (c.erasure === "delete" && typeof c.retention === "string") { const r = rules.get(c.retention); if (r) { if (!del) del = r; else if (del.from !== r.from || del.days !== r.days) errors.push(`${cp}.retention conflicts with another delete schedule on this table`); } }
    } else errors.push(`${cp}.pii.category must be one of none, identifier, contact, authentication, personal, sensitive`);
    if (c.protect !== undefined) {
      if (!isRecord(c.protect)) errors.push(`${cp}.protect must be an object`);
      else { const ex = extraKey(c.protect, "encrypt"); if (ex !== undefined) errors.push(`${cp}.protect.${ex} is not allowed`); if (c.protect.encrypt !== true) errors.push(`${cp}.protect.encrypt must be true`); }
    }
  }
}
export function validateModelGovernance(profile: OntologyProfile | NormalizedOntologyProfile, governance: unknown): string[] {
  const n = verifyN(profile); if (n.errors.length > 0) return n.errors; if (!isRecord(governance)) return ["governance must be an object"];
  const errors: string[] = [], topEx = extraKey(governance, "format", "namespace", "id", "version", "profile", "entities", "relations"), gp = governance.profile, nodes = n.nodes!, rels = n.rels!, entities = governance.entities;
  if (topEx !== undefined) errors.push(`${topEx} is not allowed`); if (governance.format !== DATA_GOVERNANCE_FORMAT) errors.push(`format must be ${DATA_GOVERNANCE_FORMAT}`);
  for (const k of ["namespace", "id", "version"] as const) if (!isTrimmedStr(governance[k])) errors.push(`${k} is required`);
  if (!isRecord(gp)) errors.push("profile must be an object");
  else { const pEx = extraKey(gp, "namespace", "pin"), pin = gp.pin; if (pEx !== undefined) errors.push(`profile.${pEx} is not allowed`); if (!isTrimmedStr(gp.namespace)) errors.push("profile.namespace is required"); if (!isRecord(pin)) errors.push("profile.pin must be an object"); else { const ex = extraKey(pin, "id", "version", "contentDigest"); if (ex !== undefined) errors.push(`profile.pin.${ex} is not allowed`); for (const k of ["id", "version"] as const) if (!isTrimmedStr(pin[k])) errors.push(`profile.pin.${k} is required`); if (!isDigest(pin.contentDigest)) errors.push("profile.pin.contentDigest must be a 64-hex sha256 digest"); } }
  const tables: TableRef[] = [], stored = Object.keys(rels).filter((id) => Array.isArray(rels[id]!.attributes));
  if (!isRecord(entities)) errors.push("entities must be an object");
  else { for (const id of Object.keys(nodes)) if (!Object.hasOwn(entities, id)) errors.push(`entities.${id} is required`); for (const [id, t] of Object.entries(entities)) { const bk = badKey(id, "entities"); if (bk) errors.push(bk); else if (!Object.hasOwn(nodes, id)) errors.push(`entities.${id} references unknown entity ${id}`); else checkTable(nodes[id]!, t, `entities.${id}`, id, tables, errors); } }
  if (governance.relations === undefined) { if (stored.length > 0) errors.push("relations is required"); }
  else if (!isRecord(governance.relations)) errors.push("relations must be an object");
  else { for (const id of stored) if (!Object.hasOwn(governance.relations, id)) errors.push(`relations.${id} is required`); for (const [id, t] of Object.entries(governance.relations)) { const bk = badKey(id, "relations"); if (bk) errors.push(bk); else if (!Object.hasOwn(rels, id)) errors.push(`relations.${id} references unknown relation ${id}`); else if (!Array.isArray(rels[id]!.attributes)) errors.push(`relations.${id} is not allowed on an FK-backed relation`); else checkTable(rels[id] as unknown as ModelRow, t, `relations.${id}`, id, tables, errors); } }
  const usedTables = new Set<string>(); for (const pass of [false, true]) for (const tb of tables) if (tb.hasTable === pass) { const k = JSON.stringify([tb.schema, tb.table]); if (usedTables.has(k)) errors.push(`${tb.hasTable ? `${tb.p}.physical.table` : tb.p} collides with SQL table ${tb.table}`); else usedTables.add(k); }
  return errors;
}
const stripUndef = (v: unknown, seen = new Set<object>()): unknown => { if (typeof v !== "object" || v === null || seen.has(v)) return v; const arr = Array.isArray(v), keys = Reflect.ownKeys(v), ds = Object.getOwnPropertyDescriptors(v); if ((!arr && !isRecord(v)) || keys.some((k) => typeof k !== "string" || (!(arr && k === "length") && (!ds[k]!.enumerable || !("value" in ds[k]!)))) || (arr && (keys.length !== v.length + 1 || keys.filter((k) => k !== "length").some((k, i) => k !== String(i))))) return v; seen.add(v); const out = arr ? v.map((x) => stripUndef(x, seen)) : Object.fromEntries((keys as string[]).filter((k) => ds[k]!.value !== undefined).map((k) => [k, stripUndef(ds[k]!.value, seen)])); seen.delete(v); return out; };
export function sealModelGovernance(profile: OntologyProfile | NormalizedOntologyProfile, governance: unknown): SealedModelGovernance {
  const errors = validateModelGovernance(profile, governance); if (errors.length > 0) throw new Error(`Invalid model governance:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  const g = governance as ModelGovernance, raw = profile as Record<string, unknown>, hasNorm = Object.values(profile.node_types ?? {}).some((n) => isRecord(n) && isRecord(n.linking) && n.linking.normalizer !== undefined);
  const nHash = normalizeOntologyProfile(hasNorm ? { ...profile, node_types: Object.fromEntries(Object.entries(profile.node_types ?? {}).map(([id, n]) => isRecord(n) && isRecord(n.linking) && n.linking.normalizer !== undefined ? [id, { ...n, linking: Object.fromEntries(Object.entries(n.linking).filter(([k]) => k !== "normalizer")) }] : [id, n])) } as OntologyProfile : profile as OntologyProfile).profile_hash;
  if (hasNorm && hashOntologyProfile(profile) !== nHash) throw new Error("linking.normalizer does not match normalized profile"); else if (raw.profile_hash !== undefined && (raw.profile_hash !== nHash || hashOntologyProfile(profile) !== nHash)) throw new Error("profile_hash does not match normalized profile digest");
  for (const [k, exp] of [["id", profile.id], ["version", profile.version], ["contentDigest", nHash]] as const) if (g.profile.pin[k] !== exp) throw new Error(`profile.pin.${k} does not match profile ${k}`);
  const bytes = canonicalBytes(stripUndef(g)), digest = sha256Hex(bytes); return { bytes, byteLength: Buffer.byteLength(bytes, "utf8"), digest, pin: { namespace: g.namespace, pin: { id: g.id, version: g.version, contentDigest: digest } } };
}
