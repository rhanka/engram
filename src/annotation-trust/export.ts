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
  const s0 = entries[0]!.stream, subjId = `_:sub-${slug(s0.subjectRef)}`;
  const M = () => new Map<string, JsonLdNode>(), [svs, actors, roles, plans] = [M(), M(), M(), M()];
  entries.forEach((e, i) => { const s = e.stream;
    if (e.revision !== i + 1 || s.scopeRef !== s0.scopeRef || s.subjectRef !== s0.subjectRef || s.slot !== s0.slot)
      throw new Error(`annotation-trust: export entry ${i} breaks the committed sequence`); });
  const role = (n: string) => reg(roles, `_:role-${n}`, { "@id": `_:role-${n}`, "rdf:value": n });
  const actor = (k: string, r: string, t: string) => reg(actors, `_:actor-${k}-${slug(r)}`,
    { "@id": `_:actor-${k}-${slug(r)}`, "@type": ["prov:Agent", t] });
  const assoc = (a: string, r: string, p: string) => ({ "prov:wasAssociatedWith": [ref(a), ref(r)],
    "prov:qualifiedAssociation": [{ "@type": "prov:Association", "prov:agent": ref(a), "prov:hadRole":
      ref(role("decider")), "prov:hadPlan": ref(p) }, { "@type": "prov:Association", "prov:agent": ref(r),
      "prov:hadRole": ref(role("recorder")) }] });
  const base = (e: Entry, id: string, a: string, r: string, g: string) => ({ "@id": id, "@type": ["oa:Annotation",
    "prov:Entity"] as const, "dcterms:creator": ref(a), "prov:wasAttributedTo": ref(a), "as:generator": ref(r),
    "dcterms:created": e.recordedAt, "prov:generatedAtTime": e.recordedAt, "prov:wasGeneratedBy": ref(g),
    scopeRef: e.stream.scopeRef, slot: e.stream.slot, revision: e.revision, contentDigest: e.contentDigest });
  const meta = (e: Entry) => ({ ...(e.classReasonCode !== undefined ? { classReasonCode: e.classReasonCode } : {}),
    ...(e.rationale !== undefined ? { rationale: e.rationale } : {}) });
  const plan = (a: Extract<AI, { channel: "pipeline" }>) => reg(plans, `_:plan-${a.promptDigest}`, { "@id":
    `_:plan-${a.promptDigest}`, "@type": ["prov:Plan"], promptDigest: a.promptDigest, ...(a.promptId !== undefined
    ? { promptId: a.promptId } : {}) });
  const tb = (v: string, x: Record<string, unknown>) => ({ "@type": "oa:TextualBody", "rdf:value": v, ...x });
  const vf = (svId: string, v: Extract<Value, { kind: "class" }>) => ({ "oa:motivatedBy": ref("oa:classifying"),
    "oa:hasTarget": ref(svId), "oa:hasBody": tb(v.code, { vocabulary: structuredClone(v.vocabulary) }) });
  const act = (e: Entry, g: string, x: Record<string, unknown>): JsonLdNode => ({ "@id": g,
    "@type": ["prov:Activity"], channel: e.actor.channel, actor: structuredClone(e.actor), ...x });
  const out: JsonLdNode[] = []; for (const e of entries) { const g = `_:act-${e.revision}`,
    r = actor("recorder", e.recorderRef, "prov:SoftwareAgent");
    if (e.actor.channel !== "pipeline" || e.action.kind !== "assert" || e.action.value.kind !== "class")
      throw new Error("annotation-trust: unimplemented entry arm");
    const svS = slug(e.subjectVersion as string), svId = reg(svs, `_:sv-${svS}`, { "@id": `_:sv-${svS}`, "@type":
      ["oa:SpecificResource", "prov:Entity"], "oa:hasSource": ref(subjId) }), a = actor("ai", e.actor.actorRef,
      "prov:SoftwareAgent"); out.push({ ...base(e, `_:ann-${e.revision}`, a, r, g), ...meta(e), ...vf(svId,
      e.action.value) }, act(e, g, assoc(a, r, plan(e.actor)))); }
  return { "@context": ctx, "@graph": [{ "@id": subjId, "@type": ["prov:Entity"] },
    ...svs.values(), ...actors.values(), ...roles.values(), ...plans.values(), ...out] }; }
