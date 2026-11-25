// Lot 6: pure JSON-LD 1.1 export view over validated annotation streams (§1, §7).
import { PREFIXES } from "./profile.js"; import type { AI, Entry, Value } from "./types.js";
export type JsonLdRef = { readonly "@id": string }; const ref = (id: string): JsonLdRef => ({ "@id": id });
export type JsonLdNode = JsonLdRef & { readonly "@type"?: readonly string[]; readonly [k: string]: unknown };
export type JsonLdDocument = { readonly "@context": Readonly<Record<string, string | number>>;
  readonly "@graph": readonly JsonLdNode[] };
const reg = (m: Map<string, JsonLdNode>, id: string, nd: JsonLdNode) => (m.has(id) || m.set(id, nd), id);
const slug = (s: string) => s.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}_`);
export function exportStreamJsonLd(entries: readonly Entry[]): JsonLdDocument {
  const ctx = { "@version": 1.1, ...PREFIXES } as const; if (!entries.length) return { "@context": ctx, "@graph": [] };
  const s0 = entries[0]!.stream, subjId = `_:sub-${slug(s0.subjectRef)}`, inv = new Map<number, string>();
  const aiRevs = new Set<number>();
  const M = () => new Map<string, JsonLdNode>(), [svs, actors, roles, plans, srcs] = [M(), M(), M(), M(), M()];
  entries.forEach((e, i) => { const s = e.stream;
    if (e.revision !== i + 1 || s.scopeRef !== s0.scopeRef || s.subjectRef !== s0.subjectRef || s.slot !== s0.slot)
      throw new Error(`annotation-trust: export entry ${i} breaks the committed sequence`);
    if ("exposure" in e && e.exposure.proposal === "shown") for (const n of e.exposure.shown)
      if (n >= e.revision) throw new Error(`annotation-trust: export entry ${i} has out-of-range exposure.shown ${n}`);
    if (e.actor.kind === "ai" && e.action.kind === "assert") aiRevs.add(e.revision);
    if (e.action.kind === "correct" || e.action.kind === "reject") {
      if (inv.has(e.action.judged)) throw new Error(`annotation-trust: revision ${e.action.judged} invalidated twice`);
      inv.set(e.action.judged, `_:act-${e.revision}`); } });
  const role = (n: string) => reg(roles, `_:role-${n}`, { "@id": `_:role-${n}`, "rdf:value": n });
  const actor = (k: string, r: string, t: string) => reg(actors, `_:actor-${k}-${slug(r)}`,
    { "@id": `_:actor-${k}-${slug(r)}`, "@type": ["prov:Agent", t] });
  const assoc = (a: string, r: string, p?: string, m?: string) => ({
    "prov:wasAssociatedWith": [ref(a), ...(m ? [ref(m)] : []), ref(r)], "prov:qualifiedAssociation": [
      { "@type": "prov:Association", "prov:agent": ref(a), "prov:hadRole": ref(role("decider")),
        ...(p ? { "prov:hadPlan": ref(p) } : {}) },
      ...(m ? [{ "@type": "prov:Association", "prov:agent": ref(m), "prov:hadRole": ref(role("mediator")) }] : []),
      { "@type": "prov:Association", "prov:agent": ref(r), "prov:hadRole": ref(role("recorder")) }] });
  const med = (c: string) => actor("client", c, "prov:SoftwareAgent");
  const base = (e: Entry, id: string, a: string, r: string, g: string) => ({ "@id": id, "@type": ["oa:Annotation",
    "prov:Entity"] as const, "dcterms:creator": ref(a), "prov:wasAttributedTo": ref(a), "as:generator": ref(r),
    "dcterms:created": e.recordedAt, "prov:generatedAtTime": e.recordedAt, "prov:wasGeneratedBy": ref(g),
    scopeRef: e.stream.scopeRef, slot: e.stream.slot, revision: e.revision, contentDigest: e.contentDigest });
  const meta = (e: Entry) => ({ ...(e.classReasonCode !== undefined ? { classReasonCode: e.classReasonCode } : {}),
    ...(e.rationale !== undefined ? { rationale: e.rationale } : {}) });
  const plan = (a: Extract<AI, { channel: "pipeline" }>) => reg(plans, `_:plan-${a.promptDigest}`, { "@id":
    `_:plan-${a.promptDigest}`, "@type": ["prov:Plan"], promptDigest: a.promptDigest, ...(a.promptId !== undefined
    ? { promptId: a.promptId } : {}) });
  const used = (e: Entry) => { if (!("exposure" in e) || e.exposure.proposal !== "shown") return {};
    const d = [...new Set(e.exposure.shown)].filter((n) => aiRevs.has(n));
    return d.length ? { "prov:used": d.map((n) => ref(`_:ann-${n}`)), "prov:qualifiedUsage": d.map((n) =>
      ({ "@type": "prov:Usage", "prov:entity": ref(`_:ann-${n}`), "prov:hadRole": ref(role("displayed")) })) } : {}; };
  const tb = (v: string, x = {}) => ({ "@type": "oa:TextualBody", "rdf:value": v, ...x });
  const nv = (e: Entry, a: string, r: string, g: string, x: Record<string, unknown>): JsonLdNode =>
    ({ ...base(e, `_:ann-${e.revision}`, a, r, g), ...meta(e), ...x });
  const vd = (e: Entry, a: string, r: string, g: string, j: string, d: string, x: Record<string, unknown> = {},
    id = `_:ann-${e.revision}`): JsonLdNode => ({ ...base(e, id, a, r, g), "oa:motivatedBy": ref("oa:assessing"),
    "oa:hasTarget": ref(j), "oa:hasBody": { decision: d, ...x, ...meta(e) } });
  const vf = (e: Entry, svId: string, v: Value) => ({
    "oa:motivatedBy": ref(v.kind === "class" ? "oa:classifying" : "oa:commenting"), "oa:hasTarget": ref(svId),
    "oa:hasBody": v.kind === "class" ? tb(v.code, { vocabulary: structuredClone(v.vocabulary) }) : tb(v.text),
    ...(inv.has(e.revision) ? { "prov:wasInvalidatedBy": ref(inv.get(e.revision)!) } : {}) });
  const act = (e: Entry, g: string, x: Record<string, unknown>): JsonLdNode => ({ "@id": g,
    "@type": ["prov:Activity"], channel: e.actor.channel, actor: structuredClone(e.actor), ...x });
  const out: JsonLdNode[] = []; for (const e of entries) { const g = `_:act-${e.revision}`,
    r = actor("recorder", e.recorderRef, "prov:SoftwareAgent");
    const svId = e.subjectVersion === null ? "" : reg(svs, `_:sv-${slug(e.subjectVersion)}`, {
      "@id": `_:sv-${slug(e.subjectVersion)}`, "@type": ["oa:SpecificResource", "prov:Entity"],
      "oa:hasSource": ref(subjId) }), [a, p, m]: [string, string?, string?] = e.actor.kind === "human"
      ? [actor("human", e.actor.actorRef, "prov:Person"), undefined,
        e.actor.channel === "mcp-elicitation" ? med(e.actor.elicitation.clientRef) : undefined]
      : [actor(e.actor.kind, e.actor.actorRef, "prov:SoftwareAgent"),
        e.actor.channel === "pipeline" ? plan(e.actor) : undefined,
        e.actor.channel === "mcp" ? med(e.actor.clientRef) : undefined];
    const ac = act(e, g, { ...("exposure" in e ? { exposure: structuredClone(e.exposure) } : {}),
      ...assoc(a, r, p, m), ...used(e) });
    if (e.action.kind === "assert") out.push(nv(e, a, r, g, vf(e, svId, e.action.value)), ac);
    else if (e.action.kind === "needs-elicitation") out.push(nv(e, a, r, g, { "oa:motivatedBy": ref("oa:questioning"),
      "oa:hasTarget": ref(`_:ann-${e.action.judged}`), "oa:hasBody": tb(e.action.question) }), ac);
    else if (e.action.kind === "preserve-source") {
      const rw = e.action.row, src = reg(srcs, `_:src-${slug(rw.sourceRef)}`, { "@id": `_:src-${slug(rw.sourceRef)}`,
        "@type": ["prov:Entity"], sourceRef: rw.sourceRef, sourceDigest: rw.sourceDigest });
      out.push(nv(e, a, r, g, { "@type": ["prov:Entity"], "prov:wasDerivedFrom": ref(src),
        row: structuredClone(rw) }), ac);
    } else { const k = e.action.kind, j = `_:ann-${e.action.judged}`;
      if (k === "correct") out.push(vd(e, a, r, g, j, "correct", {}, `_:ann-${e.revision}-verdict`),
        { ...base(e, `_:ann-${e.revision}`, a, r, g), ...vf(e, svId, e.action.value), "prov:wasDerivedFrom": ref(j) },
        ac);
      else if (k === "confirm" || k === "uncertain" || k === "reject")
        out.push(vd(e, a, r, g, j, k, k === "reject" ? { reason: e.action.reason } : {}), ac);
      else { const _never: never = k; throw new Error(`annotation-trust: unexpected ${String(_never)}`); } } }
  return { "@context": ctx, "@graph": [{ "@id": subjId, "@type": ["prov:Entity"] },
    ...svs.values(), ...actors.values(), ...roles.values(), ...plans.values(), ...srcs.values(), ...out] }; }
