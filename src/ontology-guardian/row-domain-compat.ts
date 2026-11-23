import { canonicalBytes } from "./canonical.js";
export interface RowDomainChange { readonly kind: "breaking" | "non-breaking"; readonly code: string;
  readonly path: string; readonly subject: string; readonly before: string | null; readonly after: string | null; }
const canon = (v: unknown): string => canonicalBytes(v);
const rowsOf = (doc: Record<string, unknown>, key: string): Record<string, any> =>
  (typeof doc[key] === "object" && doc[key] !== null ? (doc[key] as Record<string, any>) : {});
const attrsOf = (row: any): any[] => (Array.isArray(row?.attributes) ? row.attributes : []);
const change = (kind: RowDomainChange["kind"], code: string, path: string, subject: string, before?: unknown,
  after?: unknown): RowDomainChange =>
  ({ kind, code, path, subject, before: canon(before ?? null), after: canon(after ?? null) });
export function classifyLogicalType(oldT: unknown, newT: unknown, path: string, subject: string): RowDomainChange[] {
  const o: any = oldT ?? {}, n: any = newT ?? {};
  if (canon(o) === canon(n) || (o.kind === "decimal" && n.kind === "decimal")) return [];
  if (o.kind !== n.kind || (o.enumRef ?? null) !== (n.enumRef ?? null))
    return [change("breaking", "changed_logical_type", path, subject, o, n)];
  const omin = typeof o.minLength === "number" ? o.minLength : 0;
  const nmin = typeof n.minLength === "number" ? n.minLength : 0;
  const omax = typeof o.maxLength === "number" ? o.maxLength : Infinity;
  const nmax = typeof n.maxLength === "number" ? n.maxLength : Infinity;
  const widen = nmin <= omin && nmax >= omax, code = widen ? "widened_text_bounds" : "narrowed_text_bounds";
  return [change(widen ? "non-breaking" : "breaking", code, path, subject, o, n)];
}
export function classifyDecimal(oldT: unknown, newT: unknown, path: string, subject: string): RowDomainChange[] {
  const o: any = oldT ?? {}, n: any = newT ?? {};
  if (o.kind !== "decimal" || n.kind !== "decimal" || canon(o) === canon(n)) return [];
  const widen = n.scale >= o.scale && n.precision - n.scale >= o.precision - o.scale;
  const code = widen ? "widened_decimal" : "narrowed_decimal";
  return [change(widen ? "non-breaking" : "breaking", code, path, subject, o, n)];
}
export function classifyNamedEnums(oldE: unknown, newE: unknown): RowDomainChange[] {
  const o: Record<string, any> = typeof oldE === "object" && oldE !== null ? (oldE as Record<string, any>) : {};
  const n: Record<string, any> = typeof newE === "object" && newE !== null ? (newE as Record<string, any>) : {};
  const out: RowDomainChange[] = [], at = (d: string, tail = ""): string => `data_model.enums.${d}${tail}`;
  for (const d of Object.keys(n)) if (!Object.hasOwn(o, d))
    out.push(change("non-breaking", "added_enum_domain", at(d), d, undefined, n[d]));
  for (const d of Object.keys(o)) if (!Object.hasOwn(n, d))
    out.push(change("breaking", "removed_enum_domain", at(d), d, o[d], undefined));
  for (const d of Object.keys(o)) {
    if (!Object.hasOwn(n, d)) continue;
    const ov: unknown[] = o[d]?.values ?? [], nv: unknown[] = n[d]?.values ?? [];
    if (canon(ov) === canon(nv)) continue;
    const prefix = nv.length > ov.length && ov.every((v, i) => canon(v) === canon(nv[i]));
    const code = prefix ? "appended_enum_values" : "changed_enum_values";
    out.push(change(prefix ? "non-breaking" : "breaking", code, at(d, ".values"), d, ov, nv));
  }
  return out;
}
export function classifyRowAttributes(oldRow: unknown, newRow: unknown, path: string,
  subject: string): RowDomainChange[] {
  const oA = attrsOf(oldRow), nA = attrsOf(newRow), out: RowDomainChange[] = [];
  const oM = new Map(oA.map((a) => [a?.name, a])), nM = new Map(nA.map((a) => [a?.name, a]));
  const at = (tail: string): string => `${path}.attributes.${tail}`;
  for (const a of oA) if (!nM.has(a?.name)) out.push(change("breaking", "removed_attribute", at(a?.name), subject, a));
  for (const a of nA) if (!oM.has(a?.name)) {
    const code = a?.nullable ? "added_nullable_attribute" : "added_non_nullable_attribute";
    out.push(change(a?.nullable ? "non-breaking" : "breaking", code, at(a?.name), subject, undefined, a));
  }
  const oS = oA.map((a) => a?.name).filter((nm) => nM.has(nm));
  const nS = nA.map((a) => a?.name).filter((nm) => oM.has(nm));
  if (canon(oS) !== canon(nS))
    out.push(change("breaking", "reordered_row_attributes", `${path}.attributes`, subject, oS, nS));
  for (const a of oA) {
    const b = nM.get(a?.name);
    if (b === undefined) continue;
    if (a?.nullable === false && b?.nullable === true)
      out.push(change("non-breaking", "relaxed_attribute_nullability", at(a?.name), subject, a, b));
    else if (a?.nullable === true && b?.nullable === false)
      out.push(change("breaking", "tightened_attribute_nullability", at(a?.name), subject, a, b));
    const tpath = `${path}.attributes.${a?.name}.type`;
    out.push(...classifyLogicalType(a?.type, b?.type, tpath, subject));
    out.push(...classifyDecimal(a?.type, b?.type, tpath, subject));
  }
  return out;
}
export function classifyReferences(oldR: unknown, newR: unknown, path: string,
  subject: string): RowDomainChange[] {
  const o: any[] = Array.isArray(oldR) ? oldR : [], n: any[] = Array.isArray(newR) ? newR : [];
  const at = `${path}.references`, out: RowDomainChange[] = [];
  if (canon(o) === canon(n)) return out;
  if (o.length === n.length && canon(o.map(canon).sort()) === canon(n.map(canon).sort()))
    return [change("non-breaking", "reordered_references", at, subject, o, n)];
  for (let i = 0; i < Math.max(o.length, n.length); i++) {
    if (i >= o.length) out.push(change("breaking", "added_reference", at, subject, undefined, n[i]));
    else if (i >= n.length) out.push(change("breaking", "removed_reference", at, subject, o[i], undefined));
    else if (canon(o[i]) !== canon(n[i]))
      out.push(change("breaking", "changed_reference", at, subject, o[i], n[i]));
  }
  return out;
}
export function classifyEndpoints(oldE: unknown, newE: unknown, path: string,
  subject: string): RowDomainChange[] {
  const o: any = oldE ?? null, n: any = newE ?? null, at = `${path}.endpoints`;
  if (canon(o) === canon(n)) return [];
  if (o && n) {
    const out: RowDomainChange[] = [];
    for (const side of ["source", "target"])
      if (canon(o[side]) !== canon(n[side]))
        out.push(change("breaking", "changed_endpoint_mapping", `${at}.${side}`, subject, o[side], n[side]));
    return out;
  }
  return [change("breaking", "changed_endpoint_mapping", at, subject, oldE ?? null, newE ?? null)];
}
export function classifyCardinality(oldC: unknown, newC: unknown, path: string,
  subject: string): RowDomainChange[] {
  const out: RowDomainChange[] = [];
  for (const dir of ["in", "out"]) {
    const b: any = (oldC as any)?.[dir] ?? { min: 0, max: "many" };
    const a: any = (newC as any)?.[dir] ?? { min: 0, max: "many" };
    const oMax = b.max === "many" ? Infinity : b.max, nMax = a.max === "many" ? Infinity : a.max;
    if (a.min === b.min && nMax === oMax) continue;
    const narrow = a.min > b.min || nMax < oMax;
    const code = narrow ? "narrowed_cardinality" : "widened_cardinality";
    out.push(change(narrow ? "breaking" : "non-breaking", code, `${path}.${dir}`, subject, b, a));
  }
  return out;
}
export function classifyKeyTuples(oldRow: unknown, newRow: unknown, path: string, subject: string): RowDomainChange[] {
  const o: any = oldRow ?? {}, n: any = newRow ?? {}, out: RowDomainChange[] = [];
  if (canon(o.key ?? null) !== canon(n.key ?? null))
    out.push(change("breaking", "changed_primary_key", `${path}.key`, subject, o.key, n.key));
  const ou: unknown[] = Array.isArray(o.unique) ? o.unique : [];
  const nu: unknown[] = Array.isArray(n.unique) ? n.unique : [];
  if (canon(ou) === canon(nu)) return out;
  const ouS = ou.map(canon).sort(), nuS = nu.map(canon).sort(), same = canon(ouS) === canon(nuS);
  const upath = `${path}.unique`, code = same ? "reordered_unique_tuples" : "changed_unique_tuples";
  out.push(change(same ? "non-breaking" : "breaking", code, upath, subject, ou, nu));
  return out;
}
const classifyNodeRow = (o: any, n: any, path: string, subject: string): RowDomainChange[] =>
  [...classifyRowAttributes(o, n, path, subject), ...classifyKeyTuples(o, n, path, subject),
    ...classifyReferences(o?.references, n?.references, path, subject)];
const classifyRelationRow = (o: any, n: any, path: string, subject: string): RowDomainChange[] =>
  [...classifyRowAttributes(o, n, path, subject), ...classifyKeyTuples(o, n, path, subject),
    ...classifyEndpoints(o?.endpoints, n?.endpoints, path, subject),
    ...classifyCardinality(o?.cardinality, n?.cardinality, `${path}.cardinality`, subject)];
export function classifyRowDomainDelta(oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>): RowDomainChange[] {
  const out: RowDomainChange[] = [];
  out.push(...classifyNamedEnums((oldDoc.data_model as any)?.enums ?? {}, (newDoc.data_model as any)?.enums ?? {}));
  const oN = rowsOf(oldDoc, "node_types"), nN = rowsOf(newDoc, "node_types");
  for (const id of Object.keys(oN)) {
    if (!Object.hasOwn(nN, id)) continue;
    out.push(...classifyNodeRow(oN[id], nN[id], `node_types.${id}`, id));
  }
  const oR = rowsOf(oldDoc, "relation_types"), nR = rowsOf(newDoc, "relation_types");
  for (const id of Object.keys(oR)) {
    if (!Object.hasOwn(nR, id)) continue;
    out.push(...classifyRelationRow(oR[id], nR[id], `relation_types.${id}`, id));
  }
  return out;
}
