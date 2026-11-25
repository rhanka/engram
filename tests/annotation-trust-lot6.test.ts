// Lot 6: pure JSON-LD 1.1 export view tests (§1, §7 row 6).
import { readFileSync } from "node:fs"; import { join } from "node:path"; import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js"; import { deepFreeze } from
  "../src/ontology-profile.js"; import type { Entry } from "../src/annotation-trust/types.js";
import { exportStreamJsonLd as go, formatJsonLd, type JsonLdDocument, type JsonLdRef }
  from "../src/annotation-trust/export.js"; import { parseEntry } from "../src/annotation-trust/parse.js";
import { PREFIXES, PROFILE_PIN, standardTerms, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
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
  const sh = (w: number[]) => ({ proposal: "shown" as const, shown: w }), ns = { proposal: "not-shown" as const };
  const goC = (xs: Entry[], live = true) => { const d = go(xs.map(({ contentDigest: _d, ...r }) => parseEntry({ ...r,
    contentDigest: digestOfPreimage(r) }, { live }))); checkDoc(d); return [(i: string) => byId(d, i), d] as const; };
  const [A1, huA, qU1] = [R("_:ann-1"), "_:actor-human-analyst-b", { "@type": "prov:Usage", "prov:entity":
    R("_:ann-1"), "prov:hadRole": R("_:role-displayed") }];
  const c2: Entry = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: sh([1]),
    action: { kind: "correct", judged: 1, value: cls("a_surveiller") }, classReasonCode: "S-PLANIFIE" };
  it("exports worked correction (full _:ann-2), exposure.shown range/dedupe and metadata", () => {
    const sealed = deepFreeze([a1, c2, ai(3, "pertinent", "run-b"), ai(4, "ecarte", "run-c", D2)].map(seal)),
      doc = go(sealed), g = (id: string) => byId(doc, id); checkDoc(doc);
    ex(doc["@graph"].map((n) => n["@id"])).toEqual(["_:sub-o", "_:sv-sv1", recA, aiA, huA, "_:role-decider",
      "_:role-recorder", "_:role-displayed", `_:plan-${D}`, `_:plan-${D2}`, "_:ann-1", "_:act-1", "_:ann-2-verdict",
      "_:ann-2", "_:act-2", "_:ann-3", "_:act-3", "_:ann-4", "_:act-4"]);
    ex([g(huA), g("_:role-displayed")]).toStrictEqual([{ "@id": huA, "@type": ["prov:Agent", "prov:Person"] },
      { "@id": "_:role-displayed", "rdf:value": "displayed" }]);
    ex(g("_:ann-1")?.["prov:wasInvalidatedBy"]).toEqual(R("_:act-2"));
    ex([g("_:ann-2-verdict"), g("_:ann-2"), g("_:act-2")]).toStrictEqual([{ "@id": "_:ann-2-verdict", "@type": [
      "oa:Annotation", "prov:Entity"], "dcterms:creator": R(huA), "prov:wasAttributedTo": R(huA), "as:generator":
      R(recA), "dcterms:created": "2026-11-24T00:00:02Z", "prov:generatedAtTime": "2026-11-24T00:00:02Z",
      "prov:wasGeneratedBy": R("_:act-2"), scopeRef: "s", slot: "class", revision: 2, contentDigest:
      sealed[1]!.contentDigest, "oa:motivatedBy": R("oa:assessing"), "oa:hasTarget": A1, "oa:hasBody": { decision:
      "correct", classReasonCode: "S-PLANIFIE" } }, { "@id": "_:ann-2", "@type": ["oa:Annotation", "prov:Entity"],
      "dcterms:creator": R(huA), "prov:wasAttributedTo": R(huA), "as:generator": R(recA), "dcterms:created":
      "2026-11-24T00:00:02Z", "prov:generatedAtTime": "2026-11-24T00:00:02Z", "prov:wasGeneratedBy": R("_:act-2"),
      scopeRef: "s", slot: "class", revision: 2, contentDigest: sealed[1]!.contentDigest, "oa:motivatedBy":
      R("oa:classifying"), "oa:hasTarget": R("_:sv-sv1"), "oa:hasBody": { "@type": "oa:TextualBody", "rdf:value":
      "a_surveiller", vocabulary: PROFILE_PIN }, "prov:wasDerivedFrom": A1 }, { "@id": "_:act-2", "@type": [
      "prov:Activity"], channel: "ui-select", actor: analyst, exposure: { proposal: "shown", shown: [1] },
      "prov:wasAssociatedWith": [R(huA), R(recA)], "prov:qualifiedAssociation": [{ "@type": "prov:Association",
      "prov:agent": R(huA), "prov:hadRole": R("_:role-decider") }, { "@type": "prov:Association", "prov:agent": R(recA),
      "prov:hadRole": R("_:role-recorder") }], "prov:used": [A1], "prov:qualifiedUsage": [qU1] }]);
    ex(g("_:act-2")?.exposure).not.toBe(c2.exposure);
    ex(noOwn(g("_:ann-3"), "prov:wasInvalidatedBy")).toBe(true);
    const { classReasonCode: _c, ...c2No } = c2;
    ex(goC([a1, c2No])[0]("_:ann-2-verdict")?.["oa:hasBody"]).toStrictEqual({ decision: "correct" });
    const [gCr] = goC([a1, { ...c2, rationale: "w" }]); ex(noOwn(gCr("_:ann-2"), "rationale")).toBe(true);
    ex(gCr("_:ann-2-verdict")?.["oa:hasBody"]).toStrictEqual({ decision: "correct", classReasonCode: "S-PLANIFIE",
      rationale: "w" });
    const shF = (w: number[]) => go([seal(a1), seal({ ...c2, exposure: sh(w) })]);
    for (const xs of [[1, 2], [1, 99]]) ex(() => shF(xs)).toThrow(/out-of-range/);
    ex(byId(shF([1, 1]), "_:act-2")).toMatchObject({ "prov:used": [A1], "prov:qualifiedUsage": [qU1] }); });
  it("exports confirm, reject, human assert, AI-only filter (E21b/E19) and double-invalidation", () => {
    const cf = u(2, { ...analyst, channel: "ui-thumbs" }, { kind: "confirm", judged: 1 }, { exposure: sh([1]) });
    const [gCf] = goC([a1, cf]); ex(noOwn(gCf("_:ann-1"), "prov:wasInvalidatedBy")).toBe(true);
    ex(gCf("_:ann-2")).toMatchObject({ "dcterms:creator": R(huA), "prov:wasAttributedTo": R(huA),
      "oa:motivatedBy": R("oa:assessing"), "oa:hasTarget": A1, "oa:hasBody": { decision: "confirm" } });
    ex(gCf("_:act-2")).toMatchObject({ channel: "ui-thumbs", "prov:used": [A1], "prov:qualifiedUsage": [qU1] });
    ex(goC([a1, { ...cf, rationale: "ok" }])[0]("_:ann-2")?.["oa:hasBody"]).toStrictEqual({ decision: "confirm",
      rationale: "ok" });
    const [gRj] = goC([a1, u(2, analyst, { kind: "reject", judged: 1, reason: "contradicted" }, { exposure: sh([1]),
      rationale: "err" })]);
    ex(gRj("_:ann-1")?.["prov:wasInvalidatedBy"]).toEqual(R("_:act-2"));
    ex(gRj("_:ann-2")).toMatchObject({ "oa:motivatedBy": R("oa:assessing"), "oa:hasTarget": A1,
      "oa:hasBody": { decision: "reject", reason: "contradicted", rationale: "err" } });
    const h2 = u(2, analyst, { kind: "assert", value: cls("ecarte") }, { exposure: ns, classReasonCode: "H",
      rationale: "f" }), [gHa] = goC([a1, h2, u(3, analyst, a1.action, { exposure: sh([1, 2]) })]);
    ex(gHa("_:ann-2")).toMatchObject({ "oa:motivatedBy": R("oa:classifying"), "oa:hasTarget": R("_:sv-sv1"),
      classReasonCode: "H", rationale: "f", "oa:hasBody": { "@type": "oa:TextualBody", "rdf:value": "ecarte",
        vocabulary: PROFILE_PIN } });
    ex(gHa("_:act-3")).toMatchObject({ "prov:used": [A1], "prov:qualifiedUsage": [qU1] });
    const hk = u(1, analyst, a1.action, { exposure: { proposal: "unknown" } });
    for (const xs of [[a1, u(2, analyst, a1.action, { exposure: sh([]) })], [u(1, analyst, a1.action,
      { exposure: ns })], [hk]]) { const [g, d] = goC(xs, false); ex(!g("_:role-displayed") &&
      d["@graph"].every((n) => noOwn(n, "prov:used", "prov:qualifiedUsage"))).toBe(true); }
    ex(goC([hk], false)[0]("_:act-1")?.exposure).toEqual({ proposal: "unknown" });
    const [gC3] = goC([a1, c2, u(3, analyst, { kind: "correct", judged: 2, value: cls("ecarte") },
      { replacesHuman: 2, exposure: sh([2]) })]);
    ex(gC3("_:ann-2")?.["prov:wasInvalidatedBy"]).toEqual(R("_:act-3"));
    ex(noOwn(gC3("_:act-3"), "prov:used", "prov:qualifiedUsage")).toBe(true);
    const q = u(2, analyst, { kind: "reject", judged: 1, reason: "obsolete" }, { exposure: sh([1]) }),
      r = { ...q, ...env(3), replacesHuman: 2 }, k = { ...c2, ...env(3), replacesHuman: 2 };
    for (const t of [[a1, c2, r], [a1, q, r], [a1, c2, k]]) ex(() => go(t.map(seal))).toThrow(/invalidated twice/); });
  it("exports uncertain, needs-elicitation, MCP mediators without Plan and note values", () => {
    const un = { kind: "uncertain" as const, judged: 1 }, [gUa] = goC([a1, u(2, a1.actor, un, { rationale: "amb" })]);
    ex(gUa("_:ann-2")).toMatchObject({ "oa:motivatedBy": R("oa:assessing"), "oa:hasTarget": A1,
      "oa:hasBody": { decision: "uncertain", rationale: "amb" } });
    ex(noOwn(gUa("_:act-2"), "exposure") && noOwn(gUa("_:ann-1"), "prov:wasInvalidatedBy")).toBe(true);
    ex(goC([a1, u(2, analyst, un, { exposure: ns })])[0]("_:ann-2")?.["oa:hasBody"])
      .toStrictEqual({ decision: "uncertain" });
    const ne = (q: string) => ({ kind: "needs-elicitation" as const, judged: 1, question: q });
    const [gQa] = goC([a1, u(2, a1.actor, ne("q?"), { rationale: "r" })]);
    ex(gQa("_:ann-2")).toMatchObject({ "oa:motivatedBy": R("oa:questioning"), "oa:hasTarget": A1, rationale: "r",
      "oa:hasBody": { "@type": "oa:TextualBody", "rdf:value": "q?" } });
    ex(noOwn(gQa("_:ann-1"), "prov:wasInvalidatedBy") && noOwn(gQa("_:act-2"), "exposure")).toBe(true);
    const [gQh] = goC([a1, u(2, analyst, ne("h?"), { exposure: ns })]);
    ex(gQh("_:ann-2")?.["oa:hasBody"]).toStrictEqual({ "@type": "oa:TextualBody", "rdf:value": "h?" });
    ex(noOwn(gQh("_:ann-2"), "rationale", "classReasonCode")).toBe(true);
    ex(goC([a1, u(2, a1.actor, ne("q?")), u(3, analyst, a1.action, { exposure: sh([1, 2]) })])[0]("_:act-3"))
      .toMatchObject({ "prov:used": [A1], "prov:qualifiedUsage": [qU1] });
    const el = { clientRef: "c", requestRef: "q", assurance: "server-asserted" as const, trace: "complete" as const,
      protocolRevision: "2025-11-25", sessionRef: "s", requestDigest: D, responseDigest: D, startedAt:
      "2026-11-24T00:00:01Z", endedAt: "2026-11-24T00:00:02Z", auditRef: "au" }, med = (c: string) => ({ "@type":
      "prov:Association", "prov:agent": R(`_:actor-client-${c}`), "prov:hadRole": R("_:role-mediator") });
    const m1 = u(1, { kind: "ai", actorRef: "m", model: "m", channel: "mcp", clientRef: "c", sessionRef: "s1" },
      a1.action), [gM, dM] = goC([m1, u(2, { kind: "human", actorRef: "h", receiptRef: "r", channel:
      "mcp-elicitation", elicitation: el }, { kind: "confirm", judged: 1 }, { exposure: sh([1]) })]);
    ex(dM["@graph"].filter((n) => n["@type"]?.includes("prov:Plan"))).toHaveLength(0);
    ex(JSON.stringify(dM["@graph"])).not.toContain("prov:hadPlan");
    ex(dM["@graph"].filter((n) => n["@id"].startsWith("_:actor-client-"))).toHaveLength(1);
    ex([gM("_:actor-client-c")?.["@type"], gM("_:actor-human-h")?.["@type"], gM("_:actor-ai-m")?.["@type"]]).toEqual([
      ["prov:Agent", "prov:SoftwareAgent"], ["prov:Agent", "prov:Person"], ["prov:Agent", "prov:SoftwareAgent"]]);
    ex(gM("_:role-mediator")).toEqual({ ...R("_:role-mediator"), "rdf:value": "mediator" });
    ex(gM("_:act-1")?.["prov:wasAssociatedWith"]).toEqual([R("_:actor-ai-m"), R("_:actor-client-c"), R(recA)]);
    ex(gM("_:act-2")?.["prov:wasAssociatedWith"]).toEqual([R("_:actor-human-h"), R("_:actor-client-c"), R(recA)]);
    ex(gM("_:act-1")?.["prov:qualifiedAssociation"]).toContainEqual(med("c"));
    ex(gM("_:act-2")?.["prov:qualifiedAssociation"]).toContainEqual(med("c"));
    ex((gM("_:act-2")?.actor as { elicitation?: unknown })?.elicitation).toEqual(el);
    const elP = { clientRef: "c2", requestRef: "q2", assurance: "server-asserted" as const, trace: "partial" as const,
      legacyRow: { sourceRef: "leg-r", sourceDigest: D } }, [gP] = goC([m1, u(2, { kind: "human", actorRef: "h",
      receiptRef: "r", channel: "mcp-elicitation", elicitation: elP }, { kind: "assert", value: cls("ecarte") },
      { exposure: ns })], false);
    ex(gP("_:actor-client-c2")?.["@type"]).toEqual(["prov:Agent", "prov:SoftwareAgent"]);
    ex((gP("_:act-2")?.actor as { elicitation?: unknown })?.elicitation).toEqual(elP);
    ex(gP("_:act-2")?.["prov:qualifiedAssociation"]).toContainEqual(med("c2"));
    const nt = (t: string) => ({ kind: "note" as const, text: t }), nS = { stream: { ...a1.stream, slot: "note" } };
    const [gN] = goC([{ ...u(1, a1.actor, { kind: "assert", value: nt("n1") }), ...nS },
      { ...u(2, analyst, { kind: "correct", judged: 1, value: nt("n2") }, { exposure: sh([1]) }), ...nS }]);
    ex([gN("_:ann-1"), gN("_:ann-2-verdict"), gN("_:ann-2"), gN("_:act-2")]).toMatchObject([
      { "oa:motivatedBy": R("oa:commenting"), "oa:hasTarget": R("_:sv-sv1"), "prov:wasInvalidatedBy": R("_:act-2"),
        "oa:hasBody": { "@type": "oa:TextualBody", "rdf:value": "n1" } },
      { "oa:motivatedBy": R("oa:assessing"), "oa:hasTarget": A1, "oa:hasBody": { decision: "correct" } },
      { "oa:motivatedBy": R("oa:commenting"), "oa:hasTarget": R("_:sv-sv1"), "prov:wasDerivedFrom": A1,
        "oa:hasBody": { "@type": "oa:TextualBody", "rdf:value": "n2" } },
      { "prov:used": [A1], "prov:qualifiedUsage": [qU1] }]);
    ex([gN("_:ann-1")?.["oa:hasBody"], gN("_:ann-2")?.["oa:hasBody"]]).toStrictEqual([
      { "@type": "oa:TextualBody", "rdf:value": "n1" }, { "@type": "oa:TextualBody", "rdf:value": "n2" }]); });
  it("exports preserve-source with shared SourceRow and obeys static zero-I/O and no-read-back", () => {
    const ad: Entry["actor"] = { kind: "adapter", actorRef: "imp", channel: "import" },
      rw = { sourceRef: "leg/1", sourceDigest: D, reportedSource: "csv", pendingHuman: true };
    const [gPs, dPs] = goC([u(1, ad, { kind: "preserve-source", row: rw }, { subjectVersion: null }),
      u(2, ad, { kind: "preserve-source", row: { sourceRef: "leg/1", sourceDigest: D } }, { subjectVersion: null })]);
    ex(dPs["@graph"].filter((n) => n["@id"].startsWith("_:src-"))).toHaveLength(1);
    ex(dPs["@graph"].some((n) => n["@type"]?.includes("oa:SpecificResource"))).toBe(false);
    ex(gPs("_:src-leg_2f_1")).toStrictEqual({ "@id": "_:src-leg_2f_1", "@type": ["prov:Entity"],
      sourceRef: "leg/1", sourceDigest: D });
    ex(gPs("_:ann-1")?.["@type"]).toStrictEqual(["prov:Entity"]);
    ex(gPs("_:ann-1")).toMatchObject({ "prov:wasDerivedFrom": R("_:src-leg_2f_1"),
      "dcterms:creator": R("_:actor-adapter-imp"), row: rw });
    ex(gPs("_:ann-1")?.row).not.toBe(rw);
    ex(noOwn(gPs("_:ann-1"), "oa:motivatedBy", "oa:hasTarget", "oa:hasBody")).toBe(true);
    ex(gPs("_:actor-adapter-imp")?.["@type"]).toEqual(["prov:Agent", "prov:SoftwareAgent"]);
    const [gSv] = goC([u(1, ad, { kind: "preserve-source", row: { sourceRef: "r2", sourceDigest: D } },
      { rationale: "kept" })]);
    ex(gSv("_:sv-sv1")).toEqual({ "@id": "_:sv-sv1", "@type": ["oa:SpecificResource", "prov:Entity"],
      "oa:hasSource": R("_:sub-o") });
    ex(gSv("_:ann-1")?.rationale).toBe("kept"); ex(noOwn(gSv("_:ann-1"), "oa:hasTarget")).toBe(true);
    const [, dOrd] = goC([a1, u(2, ad, { kind: "preserve-source", row: { sourceRef: "r2", sourceDigest: D } })]);
    ex(dOrd["@graph"].map((n) => n["@id"])).toEqual(["_:sub-o", "_:sv-sv1", recA, aiA, "_:actor-adapter-imp",
      "_:role-decider", "_:role-recorder", `_:plan-${D}`, "_:src-r2", "_:ann-1", "_:act-1", "_:ann-2", "_:act-2"]);
    const src = readFileSync(join(HERE, "../src/annotation-trust/export.ts"), "utf8");
    ex(src).not.toMatch(/\bnode:|Date\.now|new Date|Math\.random|randomUUID|\bfetch\b|parseEntry|reduceEntries/);
    for (const f of ["profile", "types", "parse", "reduce"])
      ex(readFileSync(join(HERE, `../src/annotation-trust/${f}.ts`), "utf8")).not.toMatch(/\.\/export/); });
  it("formats JSON-LD 1.1 greedily at width boundaries, handles null/keys and round-trips (E20)", () => {
    const emptyDoc = go([]), emptyFmt = formatJsonLd(emptyDoc);
    ex(emptyFmt).toContain('"@graph": []'); ex(JSON.parse(emptyFmt)).toEqual(emptyDoc);
    ex(JSON.parse(formatJsonLd(emptyDoc, 10))).toEqual(emptyDoc);
    const tiny: JsonLdDocument = { "@context": {}, "@graph": [] }, t10 = formatJsonLd(tiny, 10);
    ex(t10).toContain('"@context": {}'); ex(t10).toContain('"@graph": []'); ex(JSON.parse(t10)).toEqual(tiny);
    ex(JSON.parse(formatJsonLd(tiny))).toEqual(tiny);
    const tg: JsonLdDocument = { "@context": { k: 1 }, "@graph": [{ "@id": "_:a" }, { "@id": "_:c" }] };
    ex(formatJsonLd(tg)).toBe('{ "@context": { "k": 1 },\n  "@graph": [\n' +
      '    { "@id": "_:a" },\n    { "@id": "_:c" }\n  ]\n}\n');
    const nullDoc = go([seal({ ...a1, actor: { ...a1.actor, modelVersion: null } })]),
      nullFmt = formatJsonLd(nullDoc, 25);
    ex(JSON.parse(nullFmt)).toEqual(nullDoc); ex(nullFmt).toContain('"modelVersion": null');
    const nSyn: JsonLdDocument = { "@context": {}, "@graph": [{ "@id": "_:a", mv: null }] };
    ex(JSON.parse(formatJsonLd(nSyn, 15))).toEqual(nSyn);
    const kDoc: JsonLdDocument = { "@context": {}, "@graph": [{ "@id": "_:a", 'k"\\1': 1, p: "x".repeat(30) }] };
    ex([JSON.parse(formatJsonLd(kDoc, 120)), JSON.parse(formatJsonLd(kDoc, 40))]).toEqual([kDoc, kDoc]);
    const chk = (d: JsonLdDocument, w: number) => { const s = formatJsonLd(d, w), ls = s.slice(0, -1).split("\n");
      ex(JSON.parse(s)).toEqual(d); ex(ls.every((l) => l.length <= w)).toBe(true); return ls; };
    const b1: JsonLdDocument = { "@context": { k: 1 }, "@graph": [{ "@id": "_:a", x: "x".repeat(30) },
      { "@id": "_:b" }] };
    ex([chk(b1, 59)[2], chk(b1, 60)[2], chk(b1, 61)[2]]).toEqual([
      '    { "@id": "_:a",', `    { "@id": "_:a", "x": "${"x".repeat(30)}" },`,
      `    { "@id": "_:a", "x": "${"x".repeat(30)}" },`]);
    const b2: JsonLdDocument = { "@context": { k: 1 }, "@graph": [{ "@id": "_:a", a: 1, b: "x".repeat(44) },
      { "@id": "_:b" }] };
    ex([chk(b2, 59)[4], chk(b2, 60)[3], chk(b2, 61)[3]]).toEqual([
      "    },", `      "b": "${"x".repeat(44)}" },`, `      "b": "${"x".repeat(44)}" },`]);
    const b3: JsonLdDocument = { "@context": { k: 1 }, "@graph": [{ "@id": "_:a", obj: { k: "x".repeat(37), m: 1 },
      z: 1 }] };
    ex([chk(b3, 59)[3], chk(b3, 60)[3], chk(b3, 61)[3]]).toEqual([
      '      "obj": {', `      "obj": { "k": "${"x".repeat(37)}",`, `      "obj": { "k": "${"x".repeat(37)}",`]);
    const b4: JsonLdDocument = { "@context": { k: 1 }, "@graph": [{ "@id": "_:a", obj: { a: "x".repeat(29), b: 1 } },
      { "@id": "_:b" }] };
    ex([chk(b4, 60)[4], chk(b4, 63)[4], chk(b4, 64)[3]]).toEqual([
      '        "b": 1 } },', '        "b": 1 } },', `      "obj": { "a": "${"x".repeat(29)}", "b": 1 } },`]);
    const synth: JsonLdDocument = { "@context": { "@version": 1.1, "oa": "http://www.w3.org/ns/oa#" }, "@graph": [
      { "@id": "_:a", "oa:x": "1" }, { "@id": "_:c" },
      { "@id": "_:b", a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 }] };
    ex(chk(synth, 60).some((l) => l.includes('"a": 1, "b": 2'))).toBe(true);
    const worked = deepFreeze([a1, c2, ai(3, "pertinent", "run-b"), ai(4, "ecarte", "run-c", D2)].map(seal)),
      wDoc = go(worked), wFmt = formatJsonLd(wDoc);
    ex(wFmt).toBe(formatJsonLd(wDoc)); ex(wFmt.endsWith("\n}\n") && !wFmt.endsWith("\n\n")).toBe(true);
    ex(JSON.parse(wFmt)).toEqual(wDoc);
    const wLines = wFmt.slice(0, -1).split("\n");
    ex(wLines.length).toBeLessThanOrEqual(115); ex(wLines.every((l) => l.length <= 120)).toBe(true);
    chk(wDoc, 95);
    const escDoc = go([
      { ...u(1, a1.actor, { kind: "assert", value: { kind: "note", text: 'line1\n"q"\\élicitation' } }),
        stream: { ...a1.stream, slot: "note" } },
      { ...u(2, analyst, { kind: "needs-elicitation", judged: 1, question: 'why "x"\\?\né' },
        { exposure: ns }), stream: { ...a1.stream, slot: "note" } }].map(seal));
    ex(JSON.parse(formatJsonLd(escDoc))).toEqual(escDoc); }); });
