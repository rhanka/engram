// Diagram lot vectors (frozen spec M3-R4 deb64b75, §§7.3.5/7.4, A.1/A.3/A.4).
// Every digest below is recomputed through src/ontology-guardian and must
// match the spec byte for byte. A mismatch fails the lot; values are never
// adjusted to fit the code.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = process.env.DIAGRAM_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));

import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import {
  contentDiagramDigest,
  contentDiagramPreimage,
  deltaDigestOf,
  mappingDigestOf,
  pinsDigestOf,
  pinsPreimage,
} from "../src/ontology-guardian/digests.js";
import {
  ARCHIMATE_CATALOGUE,
  ARCHIMATE_CONCEPT_NAMES,
  ARCHIMATE_MATRIX_CELLS,
  CATALOGUE_BYTES,
  CATALOGUE_SHA256,
  TUPLES_BYTES,
  TUPLES_COUNT,
  TUPLES_SHA256,
} from "../src/ontology-guardian/diagram-matrix-data.js";
import {
  ARCHIMATE_V2,
  GENERIC_V2,
  UML_V2,
  expandArchimateTuples,
} from "../src/ontology-guardian/diagram-profiles.js";
import { ARCHIMATE_V1_CONTENT, GENERIC_V1_CONTENT, UML_V1_CONTENT } from "../src/ontology-guardian/diagram-skeletons.js";
import { CONTRACT_CONTENT, envelopeEntryDigest } from "../src/ontology-guardian/diagram-registry.js";
import {
  DIAGRAM_PRESENTATION_CONTRACT_SCHEMA,
  DIAGRAM_SEMANTIC_SCHEMA,
  DIAGRAM_VIEW_SCHEMA,
} from "../src/ontology-guardian/diagram-schemas.js";
import type { RegistryEnvelope } from "../src/ontology-guardian/catalog.js";

const A64 = "a".repeat(64);
const B64 = "b".repeat(64);
const fixtures = join(testsDir, "fixtures", "pinned-sources");
const specimen = JSON.parse(readFileSync(join(fixtures, "m3-a3-serialization-specimen.json"), "utf8"));

describe("§7.3.5 frozen vectors, exact bytes", () => {
  it("V-PINS-1 reproduces bytes (186) and digest", () => {
    const pin = { id: "generic", version: "1.0.0", contentDigest: A64 };
    expect(canonicalBytes(pinsPreimage({ layers: [pin] }))).toBe(
      `{"deltaDigest":null,"layers":[{"contentDigest":"${A64}","id":"generic","version":"1.0.0"}],"mappingDigest":null,"ruleSheets":[]}`,
    );
    expect(pinsDigestOf({ layers: [pin] })).toBe("467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe");
  });

  it("V-DIAGRAM-1 reproduces bytes (206) and digest", () => {
    const preimage = {
      completeness: "complete",
      constraints: [],
      entityTypes: [{ id: "node" }],
      limits: { maxEntities: 100, maxRelations: 200, maxEndpointsPerRelation: 4 },
      portTypes: [],
      profile: "generic@1",
      relationTypes: [],
    };
    expect(canonicalBytes(preimage)).toBe(
      `{"completeness":"complete","constraints":[],"entityTypes":[{"id":"node"}],"limits":{"maxEndpointsPerRelation":4,"maxEntities":100,"maxRelations":200},"portTypes":[],"profile":"generic@1","relationTypes":[]}`,
    );
    expect(canonicalBytes(preimage).length).toBe(206);
    expect(sha256Hex(canonicalBytes(preimage))).toBe("4d2c641281713349753eb80ba40e0b08ec29b2f93847e4d0f2feb18e25381c94");
  });

  it("V-MAPPING-1 reproduces bytes (86) and digest", () => {
    expect(
      mappingDigestOf({ mappingId: "m1", version: "1.0.0", entries: [{ kind: "rename", from: "a", to: "b" }] }),
    ).toBe("b5770fd9b0623a047f65ed3d7811340afa965a623faaf0fd3e58babbc1be2516");
    expect(canonicalBytes({ entries: [{ from: "a", kind: "rename", to: "b" }], mappingId: "m1", version: "1.0.0" }).length).toBe(86);
  });

  it("V-DELTA-1 reproduces bytes (320) and digest", () => {
    const base = { id: "generic", version: "1.0.0", contentDigest: A64 };
    expect(
      deltaDigestOf({
        base,
        mappingRef: null,
        operations: [{ op: "add", subject: "c4-system", declarationDigest: B64 }],
        retiredFixtures: [],
        retiredRules: [],
      }),
    ).toBe("436065f4f09c6de4dc7f25f8eb3821088e43f27c2f9454137fc19042bebff3e2");
    expect(
      canonicalBytes({
        base, mappingRef: null,
        operations: [{ declarationDigest: B64, op: "add", subject: "c4-system" }],
        retiredFixtures: [], retiredRules: [],
      }).length,
    ).toBe(320);
  });
});

describe("A.1 catalogue and matrix transcription", () => {
  it("holds 61 catalogue rows, 62 concepts, 62 cell rows", () => {
    expect(ARCHIMATE_CATALOGUE.length).toBe(61);
    expect(ARCHIMATE_CONCEPT_NAMES.length).toBe(62);
    expect(ARCHIMATE_CONCEPT_NAMES[46]).toBe("Relationship");
    expect(ARCHIMATE_MATRIX_CELLS.length).toBe(62);
    for (const row of ARCHIMATE_MATRIX_CELLS) expect(row.split(" ").length).toBe(62);
  });

  it("reproduces the catalogue oracle (5280 bytes)", () => {
    const bytes = canonicalBytes(ARCHIMATE_CATALOGUE.map((c) => ({ aspect: c.aspect, id: c.id, layer: c.layer, name: c.name })));
    expect(bytes.length).toBe(CATALOGUE_BYTES);
    expect(sha256Hex(bytes)).toBe(CATALOGUE_SHA256);
  });

  it("expands 11,569 tuples and reproduces the tuple oracle (1027156 bytes)", () => {
    const tuples = expandArchimateTuples();
    expect(tuples.length).toBe(TUPLES_COUNT);
    const bytes = canonicalBytes(tuples);
    expect(bytes.length).toBe(TUPLES_BYTES);
    expect(sha256Hex(bytes)).toBe(TUPLES_SHA256);
  });

  it("holds the transcribed pair witnesses", () => {
    const tuples = expandArchimateTuples();
    const allows = (r: string, s: string, t: string): boolean =>
      tuples.some((x) => x.relationType === r && x.sourceType === s && x.targetType === t);
    expect(allows("access", "application-component", "data-object")).toBe(true);
    expect(allows("access", "data-object", "application-component")).toBe(false);
    expect(allows("association", "data-object", "application-component")).toBe(true);
  });
});

describe("A.4 draft declaration digests", () => {
  it("archimate@2 reproduces content 1ffa38c1… and artifact b7dd36d5…", () => {
    expect(ARCHIMATE_V2.contentDigest).toBe("1ffa38c1169b43d932b7c6d69cea24b52dd753f0f4e14eb43f6e83746cce1189");
    expect(ARCHIMATE_V2.artifactDigest).toBe("b7dd36d534e1aceb42d2aff433a1988f462a9eeaefe58bc541a3d6936a95b267");
    expect(canonicalBytes(contentDiagramPreimage({
      profile: "archimate@2",
      completeness: "complete",
      entityTypes: ARCHIMATE_V2.declaration["entityTypes"] as readonly unknown[],
      portTypes: ARCHIMATE_V2.declaration["portTypes"] as readonly unknown[],
      relationTypes: ARCHIMATE_V2.declaration["relationTypes"] as readonly unknown[],
      constraints: ARCHIMATE_V2.declaration["constraints"] as readonly unknown[],
      limits: ARCHIMATE_V2.declaration["limits"] as { maxEntities?: number | null; maxRelations?: number | null; maxEndpointsPerRelation?: number | null },
    })).length).toBe(1047531);
  });

  it("uml@2 reproduces content d7da59f2… and artifact ab6cf4de…", () => {
    expect(UML_V2.contentDigest).toBe("d7da59f277c0f4216a32c201dacdb837270e687ef5d8b1838f00f083e14f9e96");
    expect(UML_V2.artifactDigest).toBe("ab6cf4de23ad003f376239a23a0bae3adec929b7866edb1e0adeaa4156cdba41");
    expect(canonicalBytes(contentDiagramPreimage({
      profile: "uml@2",
      completeness: "complete",
      entityTypes: UML_V2.declaration["entityTypes"] as readonly unknown[],
      portTypes: UML_V2.declaration["portTypes"] as readonly unknown[],
      relationTypes: UML_V2.declaration["relationTypes"] as readonly unknown[],
      constraints: UML_V2.declaration["constraints"] as readonly unknown[],
      limits: UML_V2.declaration["limits"] as { maxEntities?: number | null; maxRelations?: number | null; maxEndpointsPerRelation?: number | null },
    })).length).toBe(5068);
  });

  it("pins @1 transcription digests as stability goldens", () => {
    expect(GENERIC_V1_CONTENT).toBe("6166cca09085eb244751d4c3b0edf82de000d3ca445af134409836970a2f1dbe");
    expect(ARCHIMATE_V1_CONTENT).toBe("96791bf1886f4a57d3cb96c82573a2bed9da621ddc9262c81d6167b90c3b3b22");
    expect(UML_V1_CONTENT).toBe("23049f0e5bd97343cd627f1d9a17d608164873949b21131ee4951ce0633bb3d6");
  });

  it("pins generic@2, schema and contract digests as stability goldens", () => {
    expect(GENERIC_V2.contentDigest).toBe("0ac5e9a7e4eb7f1f12afb06e38ef935b1582a9522c31a8ed816c621827f100b4");
    expect(DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.digest).toBe("f50c4dfe71302432c9752c67b37ecbe8f7267d0b1813ff9090a56483332bf32c");
    expect(DIAGRAM_SEMANTIC_SCHEMA.digest).toBe("c2e891febf856fcaa5a2c737538fff4242014fde3ff9ef0aac703302b73c984f");
    expect(DIAGRAM_VIEW_SCHEMA.digest).toBe("962de98bfa87d049ec17e2bce6dadac5019be027ab7178eb100bd189bc2877be");
    expect(CONTRACT_CONTENT).toBe("a25a81d843ca8a1ca25ae44504fd6ba07d5ee7741b8d882b54546210dfc0c947");
  });

});

describe("governed declaration structure (§§3.1/3.9.2/3.11)", () => {
  it("holds the generic@2 replacement base shape", () => {
    const d = GENERIC_V2.declaration;
    const entities = d["entityTypes"] as Record<string, unknown>[];
    expect(entities.map((e) => e["id"])).toEqual(["node", "container", "legend", "legend-key"]);
    expect(entities[1]).toMatchObject({ id: "container", container: true });
    expect(entities[2]).toMatchObject({ id: "legend", container: true });
    const relations = d["relationTypes"] as Record<string, unknown>[];
    const link = relations.find((r) => r["id"] === "link") as Record<string, unknown>;
    expect((link["attributes"] as Record<string, unknown>[]).find((a) => a["name"] === "label")).toMatchObject({ maxLength: 200 });
    const contains = relations.find((r) => r["id"] === "contains") as Record<string, unknown>;
    expect((contains["roles"] as Record<string, unknown>[])[0]).toMatchObject({ role: "parent", entityTypes: ["container", "legend"] });
    expect(d["constraints"]).toContainEqual({ kind: "children-restricted", hierarchyId: "containment", parentType: "legend", childTypes: ["legend-key"] });
    expect(d["constraints"]).toContainEqual({ kind: "required-parent", hierarchyId: "containment", childType: "legend-key", parentTypes: ["legend"] });
    expect(d["limits"]).toEqual({ maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 });
  });

  it("holds the archimate@2 declaration recipe (§3.9.2, A.4)", () => {
    const d = ARCHIMATE_V2.declaration;
    const entities = d["entityTypes"] as Record<string, unknown>[];
    expect(entities.length).toBe(62);
    expect(entities[0]).toMatchObject({ id: "element", abstract: true });
    const relations = d["relationTypes"] as Record<string, unknown>[];
    expect(relations.length).toBe(12);
    for (const rel of relations.slice(0, 11)) {
      for (const role of rel["roles"] as Record<string, unknown>[]) {
        expect(role["targets"]).toEqual(["entity", "relation"]);
      }
    }
    const access = relations.find((r) => r["id"] === "access") as Record<string, unknown>;
    expect(access["attributes"]).toEqual([{ name: "accessMode", kind: "enum", values: ["write", "read", "unspecified", "read-write"] }]);
    const influence = relations.find((r) => r["id"] === "influence") as Record<string, unknown>;
    expect(influence["attributes"]).toEqual([{ name: "strength", kind: "text" }]);
    const matrix = (d["constraints"] as Record<string, unknown>[]).find((c) => c["kind"] === "relationship-matrix") as Record<string, unknown>;
    expect(matrix["matrixId"]).toBe("archimate-3.2");
    expect((matrix["tuples"] as unknown[]).length).toBe(11569);
    expect(d["limits"]).toEqual({ maxEndpointsPerRelation: 2 });
  });

  it("holds the uml@2 declaration recipe (§3.11, A.4)", () => {
    const d = UML_V2.declaration;
    const entities = d["entityTypes"] as Record<string, unknown>[];
    const multiplicity = entities.find((e) => e["id"] === "multiplicity") as Record<string, unknown>;
    expect(multiplicity["abstract"]).toBe(true);
    const attrs = multiplicity["attributes"] as Record<string, unknown>[];
    expect(attrs.find((a) => a["name"] === "lower")).toMatchObject({ kind: "quantity", required: true, integer: true, min: 0, max: 9007199254740991 });
    expect(attrs.find((a) => a["name"] === "upper")).toMatchObject({ kind: "quantity", required: true, integer: true, min: -1, max: 9007199254740991 });
    const constraints = d["constraints"] as Record<string, unknown>[];
    expect(constraints).toContainEqual({ kind: "bound-pair", valueType: "multiplicity", lowerField: "lower", upperField: "upper", unboundedUpper: -1 });
    expect(constraints).toContainEqual({ kind: "at-most-value", relationType: "association", attributes: ["sourceAggregation", "targetAggregation"], value: "composite", max: 1 });
    expect(constraints).toContainEqual({ kind: "collection-unique", entityType: "stereotype", attribute: "extends" });
    const stereotype = entities.find((e) => e["id"] === "stereotype") as Record<string, unknown>;
    expect((stereotype["attributes"] as Record<string, unknown>[]).find((a) => a["name"] === "extends")).toMatchObject({ minItems: 1, maxItems: 5 });
  });
});

describe("§7.3.5 mutation consequences on governed profiles", () => {
  it("flipping completeness, container, scope, pattern or bound changes contentDigest; notes do not", () => {
    const base = contentDiagramDigest({
      profile: "generic@2", completeness: "complete",
      entityTypes: (GENERIC_V2.declaration["entityTypes"] as readonly unknown[]).map((t) => structuredClone(t)),
      portTypes: [], relationTypes: [],
      constraints: [{ kind: "unique-attribute", entityType: "legend-key", attribute: "category", scope: "within-legend" }],
      limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },
    });
    const flip = (mutate: (p: Record<string, unknown>) => void): string => {
      const p = {
        profile: "generic@2", completeness: "complete",
        entityTypes: (GENERIC_V2.declaration["entityTypes"] as readonly unknown[]).map((t) => structuredClone(t)),
        portTypes: [], relationTypes: [],
        constraints: [{ kind: "unique-attribute", entityType: "legend-key", attribute: "category", scope: "within-legend" }],
        limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },
      } as unknown as Record<string, unknown>;
      mutate(p);
      return contentDiagramDigest(p as Parameters<typeof contentDiagramDigest>[0]);
    };
    expect(flip((p) => { p["completeness"] = "skeleton"; })).not.toBe(base);
    expect(flip((p) => { ((p["entityTypes"] as Record<string, unknown>[])[1] as Record<string, unknown>)["container"] = false; })).not.toBe(base);
    expect(flip((p) => { ((p["constraints"] as Record<string, unknown>[])[0] as Record<string, unknown>)["scope"] = "within-document"; })).not.toBe(base);
    expect(flip((p) => { (((p["entityTypes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["attributes"] as Record<string, unknown>[])[0]!["pattern"] = "^[a-z]+$"; })).not.toBe(base);
    expect(flip((p) => { (p["limits"] as Record<string, unknown>)["maxEntities"] = 5; })).not.toBe(base);
    expect(
      contentDiagramDigest({
        profile: "generic@2", completeness: "complete",
        entityTypes: GENERIC_V2.declaration["entityTypes"] as readonly unknown[],
        portTypes: [], relationTypes: [],
        constraints: [{ kind: "unique-attribute", entityType: "legend-key", attribute: "category", scope: "within-legend" }],
        limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },
        notes: ["an editorial note"],
      }),
    ).toBe(base);
  });

  it("a notes-only change moves artifactDigest and keeps contentDigest", () => {
    const declaration = structuredClone(GENERIC_V2.declaration) as Record<string, unknown>;
    (declaration["notes"] as unknown[]) = ["editorial"];
    expect(sha256Hex(canonicalBytes(declaration))).not.toBe(GENERIC_V2.artifactDigest);
    expect(
      contentDiagramDigest({
        profile: "generic@2",
        completeness: declaration["completeness"] as "skeleton" | "complete",
        entityTypes: declaration["entityTypes"] as readonly unknown[],
        portTypes: declaration["portTypes"] as readonly unknown[],
        relationTypes: declaration["relationTypes"] as readonly unknown[],
        constraints: declaration["constraints"] as readonly unknown[],
        limits: declaration["limits"] as { maxEntities?: number; maxRelations?: number; maxEndpointsPerRelation?: number },
      }),
    ).toBe(GENERIC_V2.contentDigest);
  });
});

describe("A.3 serialization specimen oracles through the G0 module", () => {
  function projectionOf(declaration: Record<string, unknown>, profile: string): Parameters<typeof contentDiagramDigest>[0] {
    const limits = declaration["limits"] as { maxEntities?: number; maxRelations?: number; maxEndpointsPerRelation?: number };
    return {
      profile, completeness: declaration["completeness"] as "skeleton" | "complete",
      entityTypes: declaration["entityTypes"] as readonly unknown[],
      portTypes: declaration["portTypes"] as readonly unknown[],
      relationTypes: declaration["relationTypes"] as readonly unknown[],
      constraints: declaration["constraints"] as readonly unknown[],
      limits: { maxEntities: limits.maxEntities, maxRelations: limits.maxRelations, maxEndpointsPerRelation: limits.maxEndpointsPerRelation },
    };
  }

  it("recomputes base/layer content digests from the specimen declarations", () => {
    expect(contentDiagramDigest(projectionOf(specimen.base.declaration, "specimen-base@1"))).toBe(
      specimen.base.record.digests.contentDigest,
    );
    expect(specimen.base.record.digests.contentDigest).toBe("63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e");
    expect(contentDiagramDigest(projectionOf(specimen.stacked.declaration, "specimen-layer@1"))).toBe(
      "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59",
    );
  });

  it("recomputes asset bytes, corpus, fixture and parity digests", () => {
    expect(sha256Hex(canonicalBytes(specimen.base.declaration))).toBe("ffcf89f3c1ab72bbbf6262f421745bd03fc16b4767bdbc5092c2ce8496bf9760");
    expect(sha256Hex(canonicalBytes(specimen.stacked.declaration))).toBe("fd8b9a9ab48fcf94f955bf65c06164e470a63ddb17fc1a68c919f145ea931417");
    expect(sha256Hex(canonicalBytes(specimen.corpus))).toBe("3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8");
    expect(sha256Hex(specimen.artifacts["fixture:case-inputs"].bytes)).toBe("431033b0add7b951a5a63956b25a43c5069749b69acee1a8d8aa6a6c78272a9d");
    expect(sha256Hex(specimen.artifacts["fixture:parity-matrix"].bytes)).toBe("e408dcd7721485c12f8d4900e059b83a2d9aa7682d5798f7783144219ee73b46");
  });

  it("recomputes seven distinct artifact byte digests (six artifacts plus the corpus)", () => {
    const digests = Object.values(specimen.artifacts as Record<string, { bytes: string }>).map((a) => sha256Hex(a.bytes));
    expect(digests.length).toBe(6);
    expect(new Set([...digests, sha256Hex(canonicalBytes(specimen.corpus))]).size).toBe(7);
  });

  it("recomputes both external P-ENTRY values from the closed envelopes", () => {
    expect(envelopeEntryDigest(specimen.base.envelope as RegistryEnvelope)).toBe(specimen.base.externalEntryDigest);
    expect(envelopeEntryDigest(specimen.stacked.envelope as RegistryEnvelope)).toBe(specimen.stacked.externalEntryDigest);
    expect(specimen.base.externalEntryDigest).toBe("500d7242b900d4559ffd2291ea69498fcfda3415738958b3c8d62e0927a9349d");
    expect(specimen.stacked.externalEntryDigest).toBe("5544190fd969998f25dc384d910565c2c98b73051f372bce3d39b96521965142");
  });
});
