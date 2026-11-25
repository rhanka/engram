// Lot 6: pure JSON-LD 1.1 export view tests (§1, §7 row 6).
import { readFileSync } from "node:fs"; import { join } from "node:path"; import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js"; import { deepFreeze } from
  "../src/ontology-profile.js"; import type { Entry } from "../src/annotation-trust/types.js";
import { exportStreamJsonLd as go, type JsonLdRef } from "../src/annotation-trust/export.js"; import { parseEntry }
  from "../src/annotation-trust/parse.js"; import { PREFIXES, PROFILE_PIN, standardTerms, TEMPLATE_REF } from
  "../src/annotation-trust/profile.js";
const [HERE, D, D2] = [import.meta.dirname, "a".repeat(64), "b".repeat(64)], IRIS = new Set(Object.values(
  standardTerms).flat()), ex = expect, R = (id: string) => ({ "@id": id }), cls = (c: string) => ({ kind:
  "class" as const, vocabulary: PROFILE_PIN, code: c }), seal = ({ contentDigest: _d, ...r }: Entry) =>
  parseEntry({ ...r, contentDigest: digestOfPreimage(r) });
const env = (n: number, s = "class") => ({ stream: { scopeRef: "s", subjectRef: "o", slot: s }, template: TEMPLATE_REF,
  profile: PROFILE_PIN, pinsDigest: D, resultDigest: D, revision: n, expectedRevision: n - 1, replacesHuman: null,
  recorderRef: "rec", policyRef: "pol", authorityReceiptRef: "auth", commandDigest: D, contentDigest: D, requestId:
  `66666666-6666-4666-8666-00000000000${n}` as Entry["requestId"], recordedAt: `2026-11-24T00:00:0${n}Z`,
  evidence: { citations: [], evidenceRefs: [] } });
const analyst = { kind: "human" as const, actorRef: "analyst-b", receiptRef: "rc-b", channel: "ui-select" as const };
const ai = (n: number, c: string, id: string, pd = D, x = {}) => ({ ...env(n), subjectVersion: "sv1" as string, actor: {
  kind: "ai" as const, actorRef: "radar-pipeline", model: "m", channel: "pipeline" as const, modelVersion: "mv",
  promptDigest: pd, runRef: id, ...x }, action: { kind: "assert" as const, value: cls(c) } });
const u = (n: number, actor: Entry["actor"], action: Entry["action"], x = {}) =>
  ({ ...env(n), subjectVersion: "sv1", actor, action, ...x }) as Entry;
const [a1, a2, a3] = [ai(1, "pertinent", "run-a"), ai(2, "pertinent", "run-b"), ai(3, "ecarte", "run-c", D2)],
  [aiA, recA] = ["_:actor-ai-radar-pipeline", "_:actor-recorder-rec"],
  byId = (d: ReturnType<typeof go>, id: string) => d["@graph"].find((n) => n["@id"] === id),
  noOwn = (o: Record<string, unknown> | undefined, ...ks: string[]) => ks.every((k) => !Object.hasOwn(o!, k));
const checkDoc = (d: ReturnType<typeof go>) => { const gr = d["@graph"], ids = new Map(gr.map((n) => [n["@id"], n]));
  const ok = (s: string) => ex(IRIS.has(s)).toBe(true); ex(ids.size).toBe(gr.length);
  const walk = (v: unknown): void => { if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k.includes(":")) ok(k);
      if (k === "@type") (Array.isArray(x) ? x : [x]).forEach(ok);
      else if (k === "@id" && typeof x === "string" && !x.startsWith("_:")) ok(x);
      else if (k !== "@id" && typeof (x as JsonLdRef)?.["@id"] === "string") { const i = (x as JsonLdRef)["@id"];
        if (i.startsWith("_:")) ex(ids.has(i)).toBe(true); if (k === "prov:hadPlan")
        ex(ids.get(i)?.["@type"]).toEqual(["prov:Plan"]); } if (k === "prov:hadPlan") ex(x).toStrictEqual({
        "@id": ex.any(String) }); walk(x); } else if (typeof v === "string") ex(v).not.toMatch(/^https?:\/\//); };
  walk(gr); ex(gr.some((n) => n["@type"]?.some((t) => t === "Selection" || t === "EvaluationPair"))).toBe(false); };
describe("lot 6 json-ld export", () => {
  it("exports pipeline assertions with 36-IRI closure, 2:1 Plan sharing and exact graph order", () => {
    const sealed = deepFreeze([a1, a2, a3].map(seal)), doc = go(sealed), g = (id: string) => byId(doc, id);
    const fx = JSON.parse(readFileSync(join(HERE, "fixtures/annotation-trust/prefix-bindings.json"), "utf8"));
    ex(doc["@context"]).toEqual({ "@version": 1.1, ...PREFIXES });
    ex(doc["@context"]).toEqual({ "@version": 1.1, ...fx.bindings["@context"], prov: fx.prov.iri }); checkDoc(doc);
    ex(doc["@graph"].map((n) => n["@id"])).toEqual(["_:sub-o", "_:sv-sv1", recA, aiA, "_:role-decider",
      "_:role-recorder", `_:plan-${D}`, `_:plan-${D2}`, "_:ann-1", "_:act-1", "_:ann-2", "_:act-2",
      "_:ann-3", "_:act-3"]);
    ex(["_:sub-o", "_:sv-sv1", recA, aiA, "_:role-decider", "_:role-recorder", `_:plan-${D}`, `_:plan-${D2}`].map(g))
      .toStrictEqual([{ "@id": "_:sub-o", "@type": ["prov:Entity"] }, { "@id": "_:sv-sv1", "@type": [
        "oa:SpecificResource", "prov:Entity"], "oa:hasSource": R("_:sub-o") }, { "@id": recA, "@type": ["prov:Agent",
        "prov:SoftwareAgent"] }, { "@id": aiA, "@type": ["prov:Agent", "prov:SoftwareAgent"] }, { "@id":
        "_:role-decider", "rdf:value": "decider" }, { "@id": "_:role-recorder", "rdf:value": "recorder" }, { "@id":
        `_:plan-${D}`, "@type": ["prov:Plan"], promptDigest: D }, { "@id": `_:plan-${D2}`, "@type": ["prov:Plan"],
        promptDigest: D2 }]);
    ex([g("_:ann-1"), g("_:act-1")]).toStrictEqual([{ "@id": "_:ann-1", "@type": ["oa:Annotation", "prov:Entity"],
      "dcterms:creator": R(aiA), "prov:wasAttributedTo": R(aiA), "as:generator": R(recA), "dcterms:created":
      "2026-11-24T00:00:01Z", "prov:generatedAtTime": "2026-11-24T00:00:01Z", "prov:wasGeneratedBy": R("_:act-1"),
      scopeRef: "s", slot: "class", revision: 1, contentDigest: sealed[0]!.contentDigest, "oa:motivatedBy":
      R("oa:classifying"), "oa:hasTarget": R("_:sv-sv1"), "oa:hasBody": { "@type": "oa:TextualBody", "rdf:value":
      "pertinent", vocabulary: PROFILE_PIN } }, { "@id": "_:act-1", "@type": ["prov:Activity"], channel: "pipeline",
      actor: a1.actor, "prov:wasAssociatedWith": [R(aiA), R(recA)], "prov:qualifiedAssociation": [{ "@type":
      "prov:Association", "prov:agent": R(aiA), "prov:hadRole": R("_:role-decider"), "prov:hadPlan": R(`_:plan-${D}`)
      }, { "@type": "prov:Association", "prov:agent": R(recA), "prov:hadRole": R("_:role-recorder") }] }]);
    ex((g("_:ann-1")?.["oa:hasBody"] as { vocabulary?: unknown })?.vocabulary).not.toBe(a1.action.value.vocabulary);
    ex(g("_:act-1")?.actor).not.toBe(a1.actor);
    for (const [id, p] of [["_:act-2", D], ["_:act-3", D2]] as const) ex(g(id)?.["prov:qualifiedAssociation"])
      .toContainEqual({ "@type": "prov:Association", "prov:agent": R(aiA), "prov:hadRole": R("_:role-decider"),
        "prov:hadPlan": R(`_:plan-${p}`) }); });
  it("exports optional promptId, metadata, empty stream, injective slugs and E15a guards", () => {
    ex(go([])).toEqual({ "@context": { "@version": 1.1, ...PREFIXES }, "@graph": [] });
    const p1 = (x: object) => go([seal({ ...a1, ...x })]);
    ex(byId(p1({ actor: { ...a1.actor, promptId: "cls-v1" } }), `_:plan-${D}`)?.promptId).toBe("cls-v1");
    ex([byId(p1({ classReasonCode: "P" }), "_:ann-1")?.classReasonCode,
      byId(p1({ rationale: "r" }), "_:ann-1")?.rationale]).toEqual(["P", "r"]);
    ex(noOwn(byId(p1({ observedAt: "2026-11-23T00:00:00Z" }), "_:ann-1"), "observedAt")).toBe(true);
    const idOf = (r: string) => go([seal({ ...a1, stream: { ...a1.stream, subjectRef: r } })])["@graph"][0]!["@id"];
    ex(["a-b", "A-b", "a_b", "a:b", "a_3a_b", "a/b"].map(idOf)).toEqual(["_:sub-a-b", "_:sub-A-b",
      "_:sub-a_5f_b", "_:sub-a_3a_b", "_:sub-a_5f_3a_5f_b", "_:sub-a_2f_b"]);
    const s = (k: string, v: string) => ({ ...ai(2, "pertinent", "run-b"), stream: { ...a1.stream, [k]: v } });
    for (const x of [a1, s("scopeRef", "s2"), s("subjectRef", "o2"), s("slot", "note")])
      ex(() => go([seal(a1), seal(x)])).toThrow(/sequence/); });
  it("fails closed on unimplemented arms and obeys static zero-I/O and no-read-back", () => {
    for (const fs of [[u(1, { kind: "ai", actorRef: "m", model: "m", channel: "mcp", clientRef: "c" }, a1.action)],
      [u(1, a1.actor, { kind: "assert", value: { kind: "note", text: "n" } })],
      [a1, u(2, a1.actor, { kind: "uncertain", judged: 1 })], [a1, u(2, analyst, { kind: "correct", judged: 1,
        value: cls("ecarte") }, { exposure: { proposal: "shown", shown: [1] } })],
      [u(1, analyst, a1.action, { exposure: { proposal: "not-shown" } })]] as Entry[][])
      ex(() => go(fs.map(seal))).toThrow(/unimplemented/);
    const src = readFileSync(join(HERE, "../src/annotation-trust/export.ts"), "utf8");
    ex(src).not.toMatch(/\bnode:|Date\.now|new Date|Math\.random|randomUUID|\bfetch\b|parseEntry|reduceEntries/);
    for (const f of ["profile", "types", "parse", "reduce"])
      ex(readFileSync(join(HERE, `../src/annotation-trust/${f}.ts`), "utf8")).not.toMatch(/\.\/export/); }); });
