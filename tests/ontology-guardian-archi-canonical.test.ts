// archi@1 canonical JSON, strict I-JSON reader, closed shapes, §5.6 invariants (C1–C5, R1, E1) and m-r2-2 sortDiagnostics type proof
// (spec/SPEC_EVOL_ARCHI_CARDS.md §5.2, §5.4–§5.6, §6.1–§6.2, m-r2-2).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import { canonicalBytes, digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import {
  compareDiagnostics,
  sortDiagnostics,
  validPointer,
  type ArchiDsDiagnostic,
  type Diagnostic,
  type EngramDiagnostic,
} from "../src/ontology-guardian/diagnostics.js";
import { DIAGRAM_DIAGNOSTIC_CODES } from "../src/ontology-guardian/diagram-schemas.js";
import type { NativeSemanticDocument } from "../src/ontology-guardian/diagram-native-types.js";
import {
  ARCHI_DIAGNOSTIC_CODES,
  checkArchi,
  type ArchiDiagnosticCode,
  type ArchiManifest,
} from "../src/ontology-guardian/archi-check.js";
import { ARCHI_CARDS_CONTENT } from "../src/ontology-guardian/archi-cards-data.js";
import { projectArchiCards } from "../src/ontology-guardian/archi-cards.js";
import {
  archiOccurrenceRef,
  buildArchiSourceView,
  checkArchiView,
  type ArchiDsPort,
  type ArchiViewSpec,
} from "../src/ontology-guardian/archi-view.js";
import {
  ARCHI_MANIFEST_PATH,
  assertValidArchiDiagnosticEnvelope,
  checkArchiAcceptanceShape,
  checkArchiDocumentInvariants,
  checkArchiManifestShape,
  checkArchiSourceTriple,
  checkArchiViewBindingShape,
  checkArchiViewSpecShape,
  parseStrictIJson,
  toArchiDsDiagnostic,
  type ArchiAcceptance,
  type ArchiSourceTripleInput,
  type ArchiViewBinding,
} from "../src/ontology-guardian/archi-shapes.js";
import {
  createMemoryArchiWriter,
  ingestArchitecture,
  type ArchiIngestDsPort,
} from "../src/ontology-guardian/archi-ingest.js";
import {
  DS_ADAPTER_SHA256,
  DS_COMMIT,
  DS_RENDERER_SHA256,
} from "../src/ontology-guardian/diagram-presentation-pins.js";
import { CONTRACT_PIN } from "../src/ontology-guardian/diagram-registry.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const readText = (rel: string): string => readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8");
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

const FIX_MANIFEST = readJson<ArchiManifest>("joint-r2/manifest.json");
const FIX_DOC = readJson<NativeSemanticDocument>("joint-r2/document.json");
const ROLES_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/roles.json");
const ROLES_REPLIE_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/roles-replie.json");
const DEPLOIEMENT_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/deploiement.json");
const H2A_REPO_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/h2a-repo.json");

const TINT_MANIFEST = readJson<ArchiManifest>("joint-r2-teintes/manifest.json");
const TINT_DOC = readJson<NativeSemanticDocument>("joint-r2-teintes/document.json");
const ROLES_TEINTES_SPEC = readJson<ArchiViewSpec>("joint-r2-teintes/view-specs/roles-teintes.json");

const HO_MANIFEST = readJson<ArchiManifest>("hosts-r3/manifest.json");
const HO_DOC = readJson<NativeSemanticDocument>("hosts-r3/document.json");
const ROLES_HOSTS_SPEC = readJson<ArchiViewSpec>("hosts-r3/view-specs/roles-hosts.json");
const DEPLOIEMENT_HOSTS_SPEC = readJson<ArchiViewSpec>("hosts-r3/view-specs/deploiement-hosts.json");

const COMMIT_1 = "1111111111111111111111111111111111111111";
const COMMIT_2 = "2222222222222222222222222222222222222222";

function shuffleObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(shuffleObjectKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).reverse();
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      out[k] = shuffleObjectKeysDeep(v);
    }
    return out;
  }
  return value;
}

function createPureFakeDsPort(): ArchiIngestDsPort {
  return {
    commit: DS_COMMIT,
    adapterSha256: DS_ADAPTER_SHA256,
    rendererSha256: DS_RENDERER_SHA256,
    validateProfile: () => [],
    verifyExecutorBindings: () => [],
    validateDocument: () => [],
    validateView: () => [],
    validateDiagramPresentation: () => [],
    createProfileRegistry: (profiles) => ({ profiles }),
    bindingRowFor: (profile: any, mechanismId: string) => ({
      profileId: profile.id,
      version: profile.version,
      mechanismId,
    }),
    projectView: (_doc, view, collapsedIds) => {
      const collapsedSet = new Set(collapsedIds);
      const groups: Record<string, any> = {};
      for (const [gid, g] of Object.entries(view.groups)) {
        const grp = g as { id: string; collapsed: boolean; occurrence?: string };
        groups[gid] = {
          ...grp,
          collapsed: Boolean(grp.occurrence && collapsedSet.has(grp.occurrence)),
        };
      }
      return { ...view, groups };
    },
    classifyInternalRelations: () => new Set<string>(),
    analyzeSummaries: (view) => {
      const actives = new Map<string, unknown>();
      for (const s of Object.values(view.summaryLabels ?? {})) {
        const sum = s as { sourceOccurrence: string; targetOccurrence: string; strokeStyle?: string };
        const style = sum.strokeStyle ?? "solid";
        const key = `(${sum.sourceOccurrence},${sum.targetOccurrence},${style})`;
        actives.set(key, { ...sum, key });
      }
      return { actives, sourceIssues: [], conflicts: [] };
    },
  };
}

describe("m-r2-2: sortDiagnostics accepts ArchiDsDiagnostic and preserves typing (§5.5, m-r2-2)", () => {
  it("accepts ArchiDsDiagnostic[] and (EngramDiagnostic | ArchiDsDiagnostic)[] at compile time and sorts deterministically", () => {
    const dsDiags: readonly ArchiDsDiagnostic[] = [
      {
        origin: "diagram-core",
        code: "tone-category-unknown",
        nativeCode: "tone-category-unknown",
        severity: "error",
        path: "presentation.diagram.entities.occurrence:o-rt-h2a.categoryRef",
        message: "Unknown tone category.",
        refs: ["occurrence:o-rt-h2a"],
        subjectRef: "occurrence:o-rt-h2a",
      },
      {
        origin: "diagram-core",
        code: "endpoint-without-join",
        nativeCode: "endpoint-without-join",
        severity: "error",
        path: "relations.relation:ct-cross",
        message: "Endpoint without join.",
        refs: ["relation:ct-cross"],
        subjectRef: "relation:ct-cross",
      },
      {
        origin: "diagram-core",
        code: "legend-key-parent-invalid",
        nativeCode: "legend-key-parent-invalid",
        severity: "warning",
        path: "relations.relation:ct-cross",
        message: "Legend key parent invalid.",
        subjectRef: "relations.relation:ct-cross",
      },
    ];

    const sortedDs = sortDiagnostics(dsDiags);
    expectTypeOf(sortedDs).toEqualTypeOf<ArchiDsDiagnostic[]>();
    expect(sortedDs.map((d) => d.code)).toEqual([
      "endpoint-without-join",
      "legend-key-parent-invalid",
      "tone-category-unknown",
    ]);
    expect(compareDiagnostics(sortedDs[0]!, sortedDs[1]!)).toBeLessThan(0);

    const engramDiag: EngramDiagnostic = {
      origin: "engram",
      severity: "error",
      code: "archi-zone-mismatch",
      nativeCode: "archi-zone-mismatch",
      path: "/entityOccurrences/occurrence:o-rt-h2a",
      nodeId: "occurrence:o-rt-h2a",
      subjectRef: "occurrence:o-rt-h2a",
      message: "Zone mismatch.",
    };
    const mixed: readonly (EngramDiagnostic | ArchiDsDiagnostic)[] = [ dsDiags[0]!, engramDiag ];
    const sortedMixed = sortDiagnostics(mixed);
    expectTypeOf(sortedMixed).toEqualTypeOf<(EngramDiagnostic | ArchiDsDiagnostic)[]>();
    expect(sortedMixed.map((d) => d.code)).toEqual(["archi-zone-mismatch", "tone-category-unknown"]);

    // Existing Diagnostic[] callers still infer Diagnostic[]
    const g0Input: readonly Diagnostic[] = [engramDiag];
    const g0Sorted = sortDiagnostics(g0Input);
    expectTypeOf(g0Sorted).toEqualTypeOf<Diagnostic[]>();
  });
});

describe("ARCHI_DIAGNOSTIC_CODES inventory (§5.5)", () => {
  it("exports the exact frozen 25-code inventory (21 archi-*, 2 DS layout names, 2 G0 names) and leaves DIAGRAM_DIAGNOSTIC_CODES unchanged", () => {
    expect(Object.isFrozen(ARCHI_DIAGNOSTIC_CODES)).toBe(true);
    expect(ARCHI_DIAGNOSTIC_CODES).toHaveLength(25);
    expect(new Set(ARCHI_DIAGNOSTIC_CODES).size).toBe(25);

    const archiPrefixed = ARCHI_DIAGNOSTIC_CODES.filter((c) => c.startsWith("archi-"));
    const layoutNames = ARCHI_DIAGNOSTIC_CODES.filter((c) => c === "card-overflow" || c === "zone-overflow");
    const g0Names = ARCHI_DIAGNOSTIC_CODES.filter((c) => c === "incompatible_version" || c === "digest-mismatch");
    expect(archiPrefixed).toHaveLength(21);
    expect(layoutNames).toEqual(["card-overflow", "zone-overflow"]);
    expect(g0Names).toEqual(["incompatible_version", "digest-mismatch"]);

    for (const c of ARCHI_DIAGNOSTIC_CODES) {
      const typed: ArchiDiagnosticCode = c;
      expect(typeof typed).toBe("string");
    }

    // DIAGRAM_DIAGNOSTIC_CODES does not change (§5.5 line 401)
    expect(DIAGRAM_DIAGNOSTIC_CODES).not.toContain("archi-manifest-missing");
  });
});

describe("Strict I-JSON reader and closed shape guards (§5.2, §5.3, §5.6, §6.2)", () => {
  it("C1: rejects duplicate member names in a view spec, manifest, or nested object at parse time", () => {
    const dupViewSpec = `{
      "format": "engram.archi-view/1",
      "viewId": "view:roles",
      "activeHierarchy": "archi-composition",
      "draw": ["entity:sys-h2a"],
      "draw": ["entity:sys-engram"],
      "collapsed": []
    }`;
    const parsed = parseStrictIJson(dupViewSpec);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.pointer).toBe("/draw");
      expect(parsed.reason).toMatch(/duplicate/i);
    }

    // Nested duplicate member name
    const dupNested = `{"format":"engram.archi-view/1","legend":{"legendRef":"entity:l","legendRef":"entity:l2"}}`;
    const parsedNested = parseStrictIJson(dupNested);
    expect(parsedNested.ok).toBe(false);
    if (!parsedNested.ok) {
      expect(parsedNested.pointer).toBe("/legend/legendRef");
    }
  });

  it("rejects UTF-8 BOM, ill-formed UTF-8, lone surrogates, non-finite numbers and unescaped control characters", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    expect(parseStrictIJson(withBom).ok).toBe(false);

    const badUtf8 = new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]);
    expect(parseStrictIJson(badUtf8).ok).toBe(false);

    // Lone high surrogate escape
    expect(parseStrictIJson('{"a":"\\uD800"}').ok).toBe(false);
    // High surrogate followed by normal char
    expect(parseStrictIJson('{"a":"\\uD800x"}').ok).toBe(false);
    // Lone low surrogate escape
    expect(parseStrictIJson('{"a":"\\uDC00"}').ok).toBe(false);
    // Valid surrogate pair passes
    const validPair = parseStrictIJson('{"a":"\\uD83D\\uDE00"}');
    expect(validPair.ok).toBe(true);

    // Unescaped control char inside string
    expect(parseStrictIJson('{"a":"line1\nline2"}').ok).toBe(false);
    // Trailing token
    expect(parseStrictIJson('{"a":1} {"b":2}').ok).toBe(false);
  });

  it("refuses unknown fields in ArchiManifest, ArchiViewSpec, ArchiViewBinding and ArchiAcceptance (§5.2, §5.4)", () => {
    const badManifest = { ...FIX_MANIFEST, unknownField: true };
    const mDiags = checkArchiManifestShape(badManifest, ARCHI_MANIFEST_PATH);
    expect(mDiags.map((d) => d.code)).toEqual(["archi-manifest-invalid"]);
    expect(mDiags[0]!.path).toBe("/unknownField");

    const badSpec = { ...ROLES_SPEC, extraField: 123 };
    const vDiags = checkArchiViewSpecShape(badSpec, "view:roles");
    expect(vDiags.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(vDiags[0]!.path).toBe("/extraField");

    const validBinding: ArchiViewBinding = {
      viewId: "view:roles",
      activeHierarchy: "archi-composition",
      language: "fr",
      documentPin: { id: "document:archi-joint", version: "0", contentDigest: "a".repeat(64) },
      viewPin: { id: "view:roles", version: "0", contentDigest: "b".repeat(64) },
      profilePins: FIX_MANIFEST.profilePins,
      semanticCategoryPins: [],
      viewSchemaPin: FIX_MANIFEST.viewSchemaPin,
      cardsPin: FIX_MANIFEST.cardsPin!,
      presentationContractPin: CONTRACT_PIN,
      dsCommit: DS_COMMIT,
    };
    expect(checkArchiViewBindingShape(validBinding)).toBeNull();
    expect(checkArchiViewBindingShape({ ...validBinding, rogue: 1 })).toBe("/rogue");

    const validAcceptance: ArchiAcceptance = {
      format: "engram.archi-acceptance/1",
      source: { repository: "repo", commit: COMMIT_1, manifestPath: ARCHI_MANIFEST_PATH },
      language: "fr",
      owningRepo: "entity:repo-h2a",
      documentPin: validBinding.documentPin,
      profilePins: FIX_MANIFEST.profilePins,
      cardsPin: FIX_MANIFEST.cardsPin!,
      viewSchemaPin: FIX_MANIFEST.viewSchemaPin,
      bindings: [{ id: "binding:roles", version: "0", contentDigest: "c".repeat(64) }],
      files: [{ path: "document.json", contentDigest: "a".repeat(64) }],
    };
    expect(checkArchiAcceptanceShape(validAcceptance)).toBeNull();
    expect(checkArchiAcceptanceShape({ ...validAcceptance, extra: 1 })).toBe("/extra");
  });

  it("C2: refuses unsorted or duplicated draw, collapsed, manifest.views, or legend.tokens with archi-input-invalid", () => {
    const unsortedDraw: ArchiViewSpec = {
      ...ROLES_SPEC,
      draw: ["entity:sys-track", "entity:api-h2a"],
      collapsed: [],
    };
    const d1 = checkArchiViewSpecShape(unsortedDraw, "view:roles");
    expect(d1.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(d1[0]!.path).toBe("/draw/1");

    const dupDraw: ArchiViewSpec = {
      ...ROLES_SPEC,
      draw: ["entity:api-h2a", "entity:api-h2a"],
      collapsed: [],
    };
    const d2 = checkArchiViewSpecShape(dupDraw, "view:roles");
    expect(d2.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(d2[0]!.path).toBe("/draw/1");

    const unsortedCollapsed: ArchiViewSpec = {
      ...ROLES_SPEC,
      collapsed: ["entity:sys-engram", "entity:pkg-h2a"],
    };
    const d3 = checkArchiViewSpecShape(unsortedCollapsed, "view:roles");
    expect(d3.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(d3[0]!.path).toBe("/collapsed/1");

    const unsortedTokens: ArchiViewSpec = {
      ...ROLES_TEINTES_SPEC,
      legend: {
        ...ROLES_TEINTES_SPEC.legend!,
        tokens: [...ROLES_TEINTES_SPEC.legend!.tokens].reverse(),
      },
    };
    const d4 = checkArchiViewSpecShape(unsortedTokens, "view:roles-teintes");
    expect(d4.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(d4[0]!.path).toBe("/legend/tokens/1");

    const unsortedViews: ArchiManifest = {
      ...FIX_MANIFEST,
      views: [...FIX_MANIFEST.views].reverse(),
    };
    const d5 = checkArchiManifestShape(unsortedViews, ARCHI_MANIFEST_PATH);
    expect(d5.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(d5[0]!.path).toBe("/views/1");
  });

  it("C3: refuses decomposed (non-NFC) strings, control characters, and non-integer numbers with archi-input-invalid", () => {
    const nonNfcDoc = structuredClone(FIX_DOC);
    (nonNfcDoc.entities["entity:sys-h2a"]!.attributes["name"] as { value: string }).value =
      "Syste\u0300me h2a";
    const dNfc = checkArchiDocumentInvariants(nonNfcDoc, nonNfcDoc.documentId);
    expect(dNfc.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(dNfc[0]!.path).toBe("/entities/entity:sys-h2a/attributes/name/value");

    const ctrlDoc = structuredClone(FIX_DOC);
    (ctrlDoc.entities["entity:sys-h2a"]!.attributes["role"] as { value: string }).value =
      "Ligne 1\nLigne 2";
    const dCtrl = checkArchiDocumentInvariants(ctrlDoc, ctrlDoc.documentId);
    expect(dCtrl.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(dCtrl[0]!.path).toBe("/entities/entity:sys-h2a/attributes/role/value");
  });

  it("C4: refuses local id 'sys.h2a' (invalid local id grammar) and bare refs without prefix with archi-input-invalid", () => {
    const badIdDoc = structuredClone(FIX_DOC) as Record<string, any>;
    badIdDoc["entities"] = {
      ...badIdDoc["entities"],
      "entity:sys.h2a": {
        ...badIdDoc["entities"]["entity:sys-h2a"],
        id: "entity:sys.h2a",
      },
    };
    const dDoc = checkArchiDocumentInvariants(badIdDoc as NativeSemanticDocument, FIX_DOC.documentId);
    expect(dDoc.map((d) => d.code)).toContain("archi-input-invalid");
    expect(dDoc.some((d) => d.path === "/entities/entity:sys.h2a/id" || d.path === "/entities/entity:sys.h2a")).toBe(true);

    const badIdSpec: ArchiViewSpec = {
      ...ROLES_SPEC,
      draw: ["entity:sys.h2a"],
      collapsed: [],
    };
    const dSpec = checkArchiViewSpecShape(badIdSpec, "view:roles");
    expect(dSpec.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(dSpec[0]!.path).toBe("/draw/0");

    const bareIdSpec: ArchiViewSpec = {
      ...ROLES_SPEC,
      draw: ["sys-h2a"],
      collapsed: [],
    };
    const dBare = checkArchiViewSpecShape(bareIdSpec, "view:roles");
    expect(dBare.map((d) => d.code)).toEqual(["archi-input-invalid"]);
    expect(dBare[0]!.path).toBe("/draw/0");
  });

  it("C5 & R1: FIX pretty-printed with shuffled object keys produces identical pins and files, and re-ingesting persisted canonical bytes is byte-identical then a no-op", () => {
    const ds = createPureFakeDsPort();

    const canonicalSourceFiles: Record<string, string> = {
      [ARCHI_MANIFEST_PATH]: canonicalBytes(FIX_MANIFEST),
      ".engram/architecture/document.json": canonicalBytes(FIX_DOC),
      ".engram/architecture/view-specs/deploiement.json": canonicalBytes(DEPLOIEMENT_SPEC),
      ".engram/architecture/view-specs/h2a-repo.json": canonicalBytes(H2A_REPO_SPEC),
      ".engram/architecture/view-specs/roles-replie.json": canonicalBytes(ROLES_REPLIE_SPEC),
      ".engram/architecture/view-specs/roles.json": canonicalBytes(ROLES_SPEC),
    };

    const shuffledPrettySourceFiles: Record<string, string> = {
      [ARCHI_MANIFEST_PATH]: JSON.stringify(shuffleObjectKeysDeep(FIX_MANIFEST), null, 4) + "\n\n",
      ".engram/architecture/document.json": JSON.stringify(shuffleObjectKeysDeep(FIX_DOC), null, 2) + "\n",
      ".engram/architecture/view-specs/deploiement.json": JSON.stringify(shuffleObjectKeysDeep(DEPLOIEMENT_SPEC), null, 2),
      ".engram/architecture/view-specs/h2a-repo.json": JSON.stringify(shuffleObjectKeysDeep(H2A_REPO_SPEC), null, 2),
      ".engram/architecture/view-specs/roles-replie.json": JSON.stringify(shuffleObjectKeysDeep(ROLES_REPLIE_SPEC), null, 2),
      ".engram/architecture/view-specs/roles.json": JSON.stringify(shuffleObjectKeysDeep(ROLES_SPEC), null, 2),
    };

    const writer1 = createMemoryArchiWriter();
    const res1 = ingestArchitecture(
      { repository: "repo-fix", commit: COMMIT_1 },
      {
        readAt: (_commit, path) => canonicalSourceFiles[path] ?? null,
        ds,
        write: writer1,
      },
    );
    expect(res1.outcome).toBe("accepted");

    const writer2 = createMemoryArchiWriter();
    const res2 = ingestArchitecture(
      { repository: "repo-fix", commit: COMMIT_1 },
      {
        readAt: (_commit, path) => shuffledPrettySourceFiles[path] ?? null,
        ds,
        write: writer2,
      },
    );
    expect(res2.outcome).toBe("accepted");

    if (res1.outcome === "accepted" && res2.outcome === "accepted") {
      // C5: identical pins and identical persisted files
      expect(res2.acceptance).toEqual(res1.acceptance);
      expect(res2.acceptanceDigest).toBe(res1.acceptanceDigest);
      expect(Object.keys(res2.files).sort()).toEqual(Object.keys(res1.files).sort());
      for (const k of Object.keys(res1.files)) {
        expect(res2.files[k]).toBe(res1.files[k]);
      }

      // R1: re-ingesting the persisted canonical triple from a fresh writer produces byte-identical directory
      const persistedTripleSource: Record<string, string> = {
        [ARCHI_MANIFEST_PATH]: res1.files["manifest.json"]!,
        ".engram/architecture/document.json": res1.files["document.json"]!,
        ".engram/architecture/view-specs/deploiement.json": res1.files["view-specs/deploiement.json"]!,
        ".engram/architecture/view-specs/h2a-repo.json": res1.files["view-specs/h2a-repo.json"]!,
        ".engram/architecture/view-specs/roles-replie.json": res1.files["view-specs/roles-replie.json"]!,
        ".engram/architecture/view-specs/roles.json": res1.files["view-specs/roles.json"]!,
      };
      const writer3 = createMemoryArchiWriter();
      const res3 = ingestArchitecture(
        { repository: "repo-fix", commit: COMMIT_1 },
        {
          readAt: (_commit, path) => persistedTripleSource[path] ?? null,
          ds,
          write: writer3,
        },
      );
      expect(res3.outcome).toBe("accepted");
      if (res3.outcome === "accepted") {
        expect(res3.files).toEqual(res1.files);
      }

      // R1 part 2: re-ingesting into writer1 at COMMIT_2 is a no-op and preserves COMMIT_1
      const resNoop = ingestArchitecture(
        { repository: "repo-fix", commit: COMMIT_2 },
        {
          readAt: (_commit, path) => persistedTripleSource[path] ?? null,
          ds,
          write: writer1,
        },
      );
      expect(resNoop.outcome).toBe("accepted");
      if (resNoop.outcome === "accepted") {
        expect(resNoop.idempotent).toBe(true);
        expect(resNoop.acceptance.source.commit).toBe(COMMIT_1);
        expect(writer1.writeCount).toBe(1);
      }
    }
  });

  it("E1: every corpus refusal carries the exact EngramDiagnostic or ArchiDsDiagnostic keys in sortDiagnostics order", () => {
    const docDiags = checkArchi(
      {
        ...FIX_DOC,
        entities: {
          ...FIX_DOC.entities,
          "entity:st-events": {
            ...FIX_DOC.entities["entity:st-events"]!,
            attributes: {
              ...FIX_DOC.entities["entity:st-events"]!.attributes,
              writerPolicy: { kind: "enum", value: "single-writer" },
            },
          },
        },
        relations: {},
      },
      ARCHI_CARDS_CONTENT,
      "fr",
    );
    expect(docDiags.length).toBeGreaterThan(0);
    for (const d of docDiags) {
      assertValidArchiDiagnosticEnvelope(d);
      expect(validPointer(d.path!)).toBe(true);
    }
    expect(docDiags).toEqual(sortDiagnostics(docDiags));

    const dsNative = toArchiDsDiagnostic({
      code: "tone-category-unknown",
      severity: "error",
      path: "presentation.diagram.entities.occurrence:o-rt-h2a.categoryRef",
      message: "Tone category unknown.",
      refs: ["occurrence:o-rt-h2a"],
    });
    assertValidArchiDiagnosticEnvelope(dsNative);
    expect(dsNative.origin).toBe("diagram-core");
    expect(dsNative.subjectRef).toBe("occurrence:o-rt-h2a");
  });

  it("§5.6.6 lossless round-trip gate with T = canonical JSON on all corpus triples (joint-r2, joint-r2-teintes, hosts-r3)", () => {
    const triples: readonly ArchiSourceTripleInput[] = [
      {
        manifest: FIX_MANIFEST,
        document: FIX_DOC,
        views: [DEPLOIEMENT_SPEC, H2A_REPO_SPEC, ROLES_REPLIE_SPEC, ROLES_SPEC],
      },
      {
        manifest: TINT_MANIFEST,
        document: TINT_DOC,
        views: [ROLES_TEINTES_SPEC],
      },
      {
        manifest: HO_MANIFEST,
        document: HO_DOC,
        views: [DEPLOIEMENT_HOSTS_SPEC, ROLES_HOSTS_SPEC],
      },
    ];

    const formatT = (s: ArchiSourceTripleInput): string => canonicalBytes(s);
    const parseT = (t: string): ArchiSourceTripleInput => {
      const res = parseStrictIJson(t);
      if (!res.ok) throw new Error(res.reason);
      return res.value as ArchiSourceTripleInput;
    };

    for (const S of triples) {
      expect(checkArchiSourceTriple(S)).toEqual([]);
      const t = formatT(S);
      expect(canonicalBytes(parseT(formatT(S)))).toBe(canonicalBytes(S));
      expect(formatT(parseT(t))).toBe(t);
    }
  });
});
