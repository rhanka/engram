// archi@1 semantic checks and negative corpus tests (spec/SPEC_EVOL_ARCHI_CARDS.md §2.4, §5.5, §6.1–§6.2).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sortDiagnostics, validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { EngramDiagnostic } from "../src/ontology-guardian/diagnostics.js";
import { checkSemanticShape } from "../src/ontology-guardian/diagram-document-shape.js";
import type { NativeSemanticDocument } from "../src/ontology-guardian/diagram-native-types.js";
import { GENERIC_V2 } from "../src/ontology-guardian/diagram-profiles.js";
import { ARCHI_V1 } from "../src/ontology-guardian/archi-profile.js";
import { checkArchi } from "../src/ontology-guardian/archi-check.js";
import type { ArchiLanguage, ArchiVerbCards, ArchiVerbKey } from "../src/ontology-guardian/archi-check.js";
import { dsCloneAvailable, dsSkipReason, loadDsDiagramCore } from "./helpers/ds-executor.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const readFixture = (rel: string): NativeSemanticDocument =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as NativeSemanticDocument;

const FIX_DOC = readFixture("joint-r2/document.json");
const TINT_DOC = readFixture("joint-r2-teintes/document.json");
const HO_DOC = readFixture("hosts-r3/document.json");

const ARCHI_DOCUMENT_STAGE_CODES = [
  "archi-input-invalid",
  "archi-source-conflict",
  "archi-footer-missing",
  "archi-single-writer",
  "archi-execution-unbound",
  "archi-edge-verb",
] as const;

const TEST_CARDS: ArchiVerbCards = {
  labels: {
    fr: {
      verb: {
        invokes: "lance",
        "invokes.poll": "sondage",
        consumesApi: "appelle",
        deployedAs: "déployé comme",
        dependsOn: "dépend de",
        documents: "documente",
        executedBy: "exécuté par",
        loadedBy: "chargé par",
        "accesses.append": "ajoute à",
        "accesses.write": "écrit",
      },
    },
    en: {
      verb: {
        invokes: "launches",
        "invokes.poll": "polls",
        consumesApi: "calls",
        deployedAs: "deployed as",
        dependsOn: "depends on",
        documents: "documents",
        executedBy: "run by",
        loadedBy: "loaded by",
        "accesses.append": "appends to",
        "accesses.write": "writes",
      },
    },
  },
};

const check = (doc: NativeSemanticDocument, lang: ArchiLanguage = "fr"): readonly EngramDiagnostic[] =>
  checkArchi(doc, TEST_CARDS, lang);

const attrVal = (rec: { readonly attributes?: Readonly<Record<string, unknown>> } | undefined, k: string): string | undefined => {
  const a = rec?.attributes?.[k] as { readonly value?: unknown } | undefined;
  return typeof a?.value === "string" ? a.value : undefined;
};

const edgeVerb = (r: NativeSemanticDocument["relations"][string], lang: ArchiLanguage): string => {
  const key = (
    r.type === "accesses" ? `accesses.${attrVal(r, "mode") ?? ""}`
    : r.type === "invokes" && attrVal(r, "trigger") === "poll" ? "invokes.poll"
    : r.type
  ) as ArchiVerbKey;
  return TEST_CARDS.labels[lang].verb[key];
};

// Committed type-level proof checked by `tsc --noEmit -p tsconfig.archi-types.json` (M3).
function _typeProof(doc: NativeSemanticDocument): void {
  // @ts-expect-error cards and language are required
  checkArchi(doc);
  // @ts-expect-error second argument must be ArchiVerbCards, not a language string
  checkArchi(doc, "en", "fr");
  // @ts-expect-error verb table requires all 10 closed verb keys
  const _incomplete: ArchiVerbCards = { labels: { fr: { verb: { invokes: "lance" } }, en: TEST_CARDS.labels.en } };
  void _incomplete;
}
void _typeProof;

function addRel(
  doc: NativeSemanticDocument,
  local: string,
  type: string,
  source: string,
  target: string,
  attrs: Record<string, unknown> = {},
): void {
  (doc.relations as Record<string, unknown>)[`relation:${local}`] = {
    id: `relation:${local}`,
    profile: "archi@1",
    type,
    endpoints: [
      { role: "source", target: `entity:${source}` },
      { role: "target", target: `entity:${target}` },
    ],
    attributes: {
      lifecycle: { kind: "enum", value: "current" },
      evidence: { kind: "collection", items: [{ kind: "text", value: "neg" }] },
      ...attrs,
    },
  };
}

function assertRecordEnvelope(diags: readonly EngramDiagnostic[]): void {
  expect(diags.length).toBeGreaterThan(0);
  expect(diags).toEqual(sortDiagnostics(diags));
  for (const d of diags) {
    expect(Object.keys(d).sort()).toEqual([
      "code", "message", "nativeCode", "nodeId", "origin", "path", "severity", "subjectRef",
    ]);
    expect(d.origin).toBe("engram");
    expect(d.severity).toBe("error");
    expect(d.code).toBe(d.nativeCode);
    expect(d.nodeId).toBe(d.subjectRef);
    expect(validPointer(d.path!)).toBe(true);
    expect(ARCHI_DOCUMENT_STAGE_CODES).toContain(d.code);
  }
}

describe("checkArchi and positive fixtures FIX, TINT, HO (§2.4, §5.5, §6.1, tier E)", () => {
  it("validates FIX (29 entities, 64 relations), TINT (33, 67) and HO (41, 79) with null/[]", () => {
    expect(Object.keys(FIX_DOC.entities)).toHaveLength(29);
    expect(Object.keys(FIX_DOC.relations)).toHaveLength(64);
    expect(checkSemanticShape(FIX_DOC)).toBeNull();
    expect(check(FIX_DOC)).toEqual([]);

    expect(Object.keys(TINT_DOC.entities)).toHaveLength(33);
    expect(Object.keys(TINT_DOC.relations)).toHaveLength(67);
    expect(checkSemanticShape(TINT_DOC)).toBeNull();
    expect(check(TINT_DOC)).toEqual([]);

    expect(Object.keys(HO_DOC.entities)).toHaveLength(41);
    expect(Object.keys(HO_DOC.relations)).toHaveLength(79);
    expect(checkSemanticShape(HO_DOC)).toBeNull();
    expect(check(HO_DOC)).toEqual([]);
  });

  it("refuses A1–A4, A6 (including missing label), N3 and N26 in the closed EngramDiagnostic envelope", () => {
    // N1, N2, N4, N5 archi half (EV:113–117): checkArchi returns []
    for (const mut of [
      (d: any) => { d.entities["entity:art-branch"].attributes.form.value = "hook"; },
      (d: any) => { delete d.entities["entity:rt-track"].attributes.role; },
      (d: any) => { d.entities["entity:sys-track"].attributes.form = { kind: "enum", value: "product" }; },
      (d: any) => { d.entities["entity:rt-track"].attributes.facts = { kind: "text", value: "valide puis ajoute" }; },
    ]) {
      const m = structuredClone(FIX_DOC);
      mut(m);
      expect(check(m)).toEqual([]);
    }

    // N3 verbatim (VAL:107, EV:115): relation:da-track label changed to « déploie »
    const n3 = structuredClone(FIX_DOC) as any;
    n3.relations["relation:da-track"].attributes.label = { kind: "text", value: "déploie" };
    const dN3 = check(n3);
    assertRecordEnvelope(dN3);
    expect(dN3.map((d) => [d.code, d.nodeId, d.path])).toEqual([
      ["archi-edge-verb", "relation:da-track", "/relations/relation:da-track"],
    ]);

    // M1: arrow-encoded relation without label fails closed with archi-edge-verb
    const noLabel = structuredClone(FIX_DOC) as any;
    delete noLabel.relations["relation:da-track"].attributes.label;
    const dNoLabel = check(noLabel);
    assertRecordEnvelope(dNoLabel);
    expect(dNoLabel.map((d) => [d.code, d.nodeId])).toEqual([["archi-edge-verb", "relation:da-track"]]);

    // N26: invokes with trigger poll labelled with « lance · sondage » instead of « sondage »
    const n26 = structuredClone(HO_DOC) as any;
    n26.relations["relation:host-agy"].attributes.label = { kind: "text", value: "lance · sondage" };
    const dN26 = check(n26);
    assertRecordEnvelope(dN26);
    expect(dN26.map((d) => [d.code, d.nodeId])).toEqual([["archi-edge-verb", "relation:host-agy"]]);

    // A1: direct managedIn conflicts with partOf ancestor's effective repo
    const a1 = structuredClone(FIX_DOC);
    addRel(a1, "x5", "managedIn", "rt-track", "repo-engram");
    const dA1 = check(a1);
    assertRecordEnvelope(dA1);
    expect(dA1.map((d) => [d.code, d.nodeId])).toEqual([["archi-source-conflict", "entity:rt-track"]]);

    // A2 (M2): single-writer store without writer -> single code archi-footer-missing
    const a2 = structuredClone(FIX_DOC) as any;
    delete a2.relations["relation:ac-write"];
    const dA2 = check(a2);
    assertRecordEnvelope(dA2);
    expect(dA2.map((d) => [d.code, d.nodeId])).toEqual([["archi-footer-missing", "entity:st-events"]]);

    // A2 across repo, host and system branches
    const a2Branches = structuredClone(FIX_DOC) as any;
    delete a2Branches.relations["relation:ob-repo-h2a"];
    delete a2Branches.relations["relation:op-poste"];
    delete a2Branches.relations["relation:mi-sys-engram"];
    const dBranches = check(a2Branches);
    assertRecordEnvelope(dBranches);
    expect(dBranches.map((d) => d.nodeId)).toEqual([
      "entity:api-memory", "entity:host-poste", "entity:repo-h2a", "entity:sys-engram",
    ]);

    // A6 in English ("launches" / "polls") with translated arrow labels (M1)
    const enDoc = structuredClone(HO_DOC) as any;
    for (const r of Object.values(enDoc.relations) as any[]) {
      if (r.attributes?.label) {
        r.attributes.label = { kind: "text", value: edgeVerb(r, "en") };
      }
    }
    enDoc.relations["relation:host-claude"].attributes.label = { kind: "text", value: "launches · hooks" };
    expect(check(enDoc, "en")).toEqual([]);
    enDoc.relations["relation:host-agy"].attributes.label = { kind: "text", value: "launches · poll" };
    expect(check(enDoc, "en").map((d) => [d.code, d.nodeId])).toEqual([["archi-edge-verb", "relation:host-agy"]]);

    // A3: second writer on single-writer store
    const a3 = structuredClone(FIX_DOC);
    addRel(a3, "x4", "accesses", "rt-track-mcp", "st-events", { mode: { kind: "enum", value: "append" } });
    const dA3 = check(a3);
    assertRecordEnvelope(dA3);
    expect(dA3.map((d) => [d.code, d.nodeId])).toEqual([["archi-single-writer", "entity:st-events"]]);

    // A4: executedBy without deployedAs / dependsOn chain
    const a4 = structuredClone(FIX_DOC);
    addRel(a4, "x1", "executedBy", "pkg-plugin", "rt-claude", { label: { kind: "text", value: "exécuté par" } });
    const dA4 = check(a4);
    assertRecordEnvelope(dA4);
    expect(dA4.map((d) => [d.code, d.nodeId])).toEqual([["archi-execution-unbound", "relation:x1"]]);
  });

  it("fails closed on malformed non-document inputs, unsupported languages and incomplete verb tables", () => {
    const nonRecordCases: Array<{ doc: unknown; cards: ArchiVerbCards; lang: ArchiLanguage; expectedSubject: string }> = [
      { doc: null, cards: TEST_CARDS, lang: "fr", expectedSubject: "document" },
      { doc: undefined, cards: TEST_CARDS, lang: "fr", expectedSubject: "document" },
      { doc: {}, cards: TEST_CARDS, lang: "fr", expectedSubject: "document" },
      { doc: { documentId: "doc:bad" }, cards: TEST_CARDS, lang: "fr", expectedSubject: "doc:bad" },
      { doc: FIX_DOC, cards: TEST_CARDS, lang: "de" as ArchiLanguage, expectedSubject: FIX_DOC.documentId },
      { doc: FIX_DOC, cards: {} as unknown as ArchiVerbCards, lang: "fr", expectedSubject: FIX_DOC.documentId },
    ];
    for (const { doc, cards, lang, expectedSubject } of nonRecordCases) {
      const res = checkArchi(doc as NativeSemanticDocument, cards, lang);
      expect(res).toHaveLength(1);
      const d = res[0]!;
      expect(Object.keys(d).sort()).toEqual([
        "code", "message", "nativeCode", "origin", "path", "severity", "subjectRef",
      ]);
      expect(d.origin).toBe("engram");
      expect(d.severity).toBe("error");
      expect(d.code).toBe("archi-input-invalid");
      expect(d.nativeCode).toBe("archi-input-invalid");
      expect(d.path).toBe("");
      expect(validPointer(d.path!)).toBe(true);
      expect(d.subjectRef).toBe(expectedSubject);
    }

    // Dotted entity id in shape failure emits path "" and preserves the dotted locator in message (m3)
    const dotted = structuredClone(FIX_DOC) as any;
    dotted.entities["entity:a.b"] = { id: "entity:a.b", profile: "archi@1", type: "actor", attributes: { name: 42 } };
    const dDotted = check(dotted);
    expect(dDotted).toHaveLength(1);
    expect(Object.keys(dDotted[0]!).sort()).toEqual([
      "code", "message", "nativeCode", "origin", "path", "severity", "subjectRef",
    ]);
    expect(dDotted[0]!.path).toBe("");
    expect(validPointer(dDotted[0]!.path!)).toBe(true);
    expect(dDotted[0]!.subjectRef).toBe(FIX_DOC.documentId);
    expect(dDotted[0]!.message).toContain("entities.entity:a.b.attributes.name");

    // Partial verb table missing verbs required by arrows refuses with archi-input-invalid (M3)
    const partialCards = {
      labels: {
        fr: { verb: { invokes: "lance" } },
        en: TEST_CARDS.labels.en,
      },
    } as unknown as ArchiVerbCards;
    const dPartial = checkArchi(FIX_DOC, partialCards, "fr");
    assertRecordEnvelope(dPartial);
    expect(new Set(dPartial.map((d) => d.code))).toEqual(new Set(["archi-input-invalid"]));
  });
});

describe.skipIf(!dsCloneAvailable())(`archi@1 DS semantic validation and N1–N5 (tier DS)${dsSkipReason()}`, () => {
  it("validates FIX, TINT and HO with [] and catches N1–N5 (both halves) and PE §7.4 native cases", async () => {
    const ds = await loadDsDiagramCore();
    const archi1 = ARCHI_V1.declaration;
    const generic2 = GENERIC_V2.declaration;
    const opts = {
      registry: ds.createProfileRegistry([archi1]),
      bindings: { schemaVersion: "1", rows: [ds.bindingRowFor(archi1, "scoped-constraints@1")] },
    };
    const tintOpts = {
      registry: ds.createProfileRegistry([archi1, generic2]),
      bindings: {
        schemaVersion: "1",
        rows: [
          ds.bindingRowFor(archi1, "scoped-constraints@1"),
          ds.bindingRowFor(generic2, "scoped-constraints@1"),
        ],
      },
    };
    expect(ds.validateDocument(FIX_DOC, opts)).toEqual([]);
    expect(ds.validateDocument(TINT_DOC, tintOpts)).toEqual([]);
    expect(ds.validateDocument(HO_DOC, opts)).toEqual([]);

    const pairOf = (mut: (d: any) => void): { native: string[]; archi: string[] } => {
      const d = structuredClone(FIX_DOC);
      mut(d);
      return {
        native: [...new Set((ds.validateDocument(d, opts) as { code: string }[]).map((x) => x.code))],
        archi: [...new Set(check(d).map((x) => x.code))],
      };
    };

    // EV:113–117 verbatim (both halves)
    expect(pairOf((d) => { d.entities["entity:art-branch"].attributes.form.value = "hook"; })).toEqual({
      native: ["enum-value-not-allowed"],
      archi: [],
    }); // N1
    expect(pairOf((d) => { delete d.entities["entity:rt-track"].attributes.role; })).toEqual({
      native: ["attribute-required-missing"],
      archi: [],
    }); // N2
    expect(pairOf((d) => { d.relations["relation:da-track"].attributes.label = { kind: "text", value: "déploie" }; })).toEqual({
      native: [],
      archi: ["archi-edge-verb"],
    }); // N3
    expect(pairOf((d) => { d.entities["entity:sys-track"].attributes.form = { kind: "enum", value: "product" }; })).toEqual({
      native: ["attribute-not-in-schema"],
      archi: [],
    }); // N4
    expect(pairOf((d) => { d.entities["entity:rt-track"].attributes.facts = { kind: "text", value: "valide puis ajoute" }; })).toEqual({
      native: ["attribute-not-in-schema"],
      archi: [],
    }); // N5

    const codesOf = (mut: (d: any) => void): string[] => pairOf(mut).native;
    expect(codesOf((d) => { d.relations["relation:po-control"].endpoints[1].target = "entity:sys-track"; })).toEqual([
      "legend-key-parent-invalid", "relationship-matrix-violation",
    ]);
    expect(codesOf((d) => { d.relations["relation:ca-h2a-memory"].endpoints[1].target = "entity:sys-engram"; })).toEqual([
      "endpoint-target-not-allowed",
    ]);
    expect(codesOf((d) => { delete d.relations["relation:po-control"]; })).toEqual(["legend-key-parent-invalid"]);
    expect(codesOf((d) => { d.entities["entity:rt-track"].type = "daemon"; })).toEqual([
      "unknown-entity-type", "endpoint-target-not-allowed",
    ]);
    expect(codesOf((d) => { d.entities["entity:rt-track"].attributes.form.value = "plugin"; })).toEqual(["enum-value-not-allowed"]);
    expect(codesOf((d) => { d.relations["relation:da-track"].type = "storesIn"; })).toEqual([
      "unknown-relation-type",
    ]);
    expect(codesOf((d) => { addRel(d, "x8", "ownedBy", "repo-h2a", "act-openai"); })).toEqual(["hierarchy-multiple-parents"]);
    expect(codesOf((d) => { delete d.entities["entity:rt-track"].attributes.evidence; })).toEqual(["attribute-required-missing"]);
    expect(codesOf((d) => { delete d.relations["relation:da-track"].attributes.lifecycle; })).toEqual(["attribute-required-missing"]);
  });
});
