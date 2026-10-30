// Data/shape/migration qualification only. Native semantic validation,
// projection and layout execution remain DS U-KERNEL/U-QUAL evidence.
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { corpusBytes, corpusJson, sourceIndex } from "./diagram-corpus-support.js";
import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import { migrateGenericV1ToV2 } from "../src/ontology-guardian/diagram-migrations.js";
import type { MigDocument, MigView } from "../src/ontology-guardian/diagram-migrations.js";
import { DIAGRAM_SEMANTIC_SCHEMA, DIAGRAM_VIEW_SCHEMA, DIAGRAM_VIEW_SCHEMA_V2 } from "../src/ontology-guardian/diagram-schemas.js";
import { buildArchimateMatrixCases, materializeArchimateMatrixCase, derivedCaseId, stableId } from "../src/ontology-guardian/diagram-oracle.js";
import { ARCHIMATE_RELATIONSHIP_IDS, expandArchimateTuples } from "../src/ontology-guardian/diagram-profiles.js";

const ajv = new Ajv2020({ strict: true, allErrors: true });
const semantic = ajv.compile(DIAGRAM_SEMANTIC_SCHEMA.schema), view = ajv.compile(DIAGRAM_VIEW_SCHEMA.schema);
const oracle = corpusJson<any>("oracle:derived-json");
type CardCase = { id: string; source: MigDocument; sourceView: MigView; expectedDocument: MigDocument; expectedView: MigView;
  addedEntityIds?: string[]; addedRelationIds?: string[]; expectedSemanticDiagnostics: unknown[]; expectedViewDiagnostics: unknown[] };

describe("all six pinned semantic/view card cases", () => {
  for (const id of ["A1", "A2", "A3", "A4a", "A4b", "A5"]) {
    const fixture = corpusJson<CardCase>(`derived:cards-${id}`);
    const expected = oracle.instances.find((instance: any) => instance.id === id);
    it(`${id}: validates complete native source and target shapes`, () => {
      for (const document of [fixture.source, fixture.expectedDocument]) expect(semantic(document), JSON.stringify(semantic.errors)).toBe(true);
      for (const source of [fixture.sourceView, fixture.expectedView]) expect(view(source), JSON.stringify(view.errors)).toBe(true);
      expect(fixture.expectedSemanticDiagnostics).toEqual(expected.expectedSemanticDiagnostics);
      expect(fixture.expectedViewDiagnostics).toEqual(expected.expectedViewDiagnostics);
      expect(fixture.expectedDocument.typeDefinitions).toEqual({});
    });
    it(`${id}: reproduces the frozen target counts, folds, dashes and semantic references`, () => {
      const counts: Record<string, number> = {};
      for (const record of [...Object.values(fixture.expectedDocument.entities), ...Object.values(fixture.expectedDocument.relations)]) counts[record.type] = (counts[record.type] ?? 0) + 1;
      expect(counts).toEqual(expected.counts);
      const drawn = Object.values(fixture.expectedView.relationOccurrences!) as { relation: string; strokeStyle?: string; endpoints: { occurrence: string }[] }[];
      expect(drawn.filter(occurrence => occurrence.strokeStyle === "dashed").map(occurrence => occurrence.relation).sort()).toEqual([...expected.dashedRelationIds].sort());
      for (const relation of Object.values(fixture.expectedDocument.relations)) for (const endpoint of relation.endpoints) expect(fixture.expectedDocument.entities[endpoint.target]).toBeDefined();
      for (const occurrence of drawn) for (const endpoint of occurrence.endpoints) expect(fixture.expectedView.entityOccurrences[endpoint.occurrence]).toBeDefined();
      for (const occurrence of expected.defaultFolds) expect(fixture.expectedView.entityOccurrences[occurrence]).toBeDefined();
      expect(Object.keys(fixture.expectedDocument.entities).sort()).toEqual([...Object.keys(fixture.source.entities), ...(fixture.addedEntityIds ?? [])].sort());
      expect(Object.keys(fixture.expectedDocument.relations).sort()).toEqual([...Object.keys(fixture.source.relations), ...(fixture.addedRelationIds ?? [])].sort());
    });
    it(`${id}: restores the complete input and keeps the invariant subset through migration/reload`, () => {
      const source = JSON.parse(canonicalBytes(fixture.source)) as MigDocument;
      const sourceView = JSON.parse(canonicalBytes(fixture.sourceView)) as MigView;
      const contractPin = (fixture.expectedView.presentation!.diagram as { contractPin: { id: string; version: string; contentDigest: string } }).contractPin;
      const result = migrateGenericV1ToV2(source, { views: [sourceView], contractPin, viewSchemas: { [sourceView.viewId]: DIAGRAM_VIEW_SCHEMA_V2.pin } });
      expect(result.outcome, JSON.stringify(result.unmigrated)).toBe("ok");
      const fullInput = { ...source, views: [sourceView] };
      expect(canonicalBytes(result.originalCanonical)).toBe(canonicalBytes(fullInput));
      expect(result.originalSha256).toBe(sha256Hex(canonicalBytes(fullInput)));
      expect(canonicalBytes(JSON.parse(canonicalBytes(result.originalCanonical)))).toBe(canonicalBytes(fullInput));
      expect(canonicalBytes(source)).toBe(canonicalBytes(fixture.source));
      for (const [id, relation] of Object.entries(source.relations)) {
        expect(canonicalBytes(result.target!.relations[id]!.endpoints)).toBe(canonicalBytes(relation.endpoints));
        expect(canonicalBytes(result.target!.relations[id]!.attributes)).toBe(canonicalBytes(relation.attributes));
      }
      expect(result.target!.resources).toEqual(source.resources);
      expect(result.target!.extensions).toEqual(source.extensions);
      expect(result.target!.views![0]!.relationOccurrences).toEqual(sourceView.relationOccurrences);
      expect(result.target!.views![0]!.entityOccurrences).toEqual(sourceView.entityOccurrences);
      if (id !== "A5") {
        const { views: _views, ...actual } = result.target!;
        const expectedDocument = structuredClone(fixture.expectedDocument) as any;
        for (const added of fixture.addedEntityIds!) delete expectedDocument.entities[added];
        for (const added of fixture.addedRelationIds!) delete expectedDocument.relations[added];
        expect(canonicalBytes(actual)).toBe(canonicalBytes(expectedDocument));
      }
    });
  }
  it("keeps the full A5 slot ledger native and preserves every foreign extension", () => {
    const fixture = corpusJson<CardCase>("derived:cards-A5");
    expect(fixture.expectedDocument.entities).toEqual(oracle.instances.find((instance: any) => instance.id === "A5").entities);
    expect(fixture.expectedView.presentation!.diagram).toMatchObject({ entities: oracle.instances.find((instance: any) => instance.id === "A5").presentationEntities });
    expect(fixture.source.extensions).toHaveLength(19);
    expect(fixture.expectedDocument.extensions).toEqual((fixture.source.extensions as { namespace: string }[]).filter(extension => extension.namespace !== "hrpn.zone-slots"));
  });
});

describe("complete ArchiMate pair corpus", () => {
  it("materializes and shape-validates all 42,284 semantic/view cases, including both RelationRef axes", () => {
    const rows = buildArchimateMatrixCases(expandArchimateTuples(), ARCHIMATE_RELATIONSHIP_IDS);
    let allowed = 0, rejected = 0, relationAxes = 0;
    for (const row of rows) {
      const fixture = materializeArchimateMatrixCase(row);
      if (!semantic(fixture.document)) throw new Error(JSON.stringify(semantic.errors));
      if (!view(fixture.view)) throw new Error(JSON.stringify(view.errors));
      const source = fixture.document.relations["relation:case"]!.endpoints[0]!.target;
      const target = fixture.document.relations["relation:case"]!.endpoints[1]!.target;
      if ((source.startsWith("relation:")) !== (row.sourceType === "@relation")) throw new Error("source carrier");
      if ((target.startsWith("relation:")) !== (row.targetType === "@relation")) throw new Error("target carrier");
      if (row.sourceType === "@relation" || row.targetType === "@relation") relationAxes++;
      if (row.expected === "allowed") { allowed++; expect(fixture.expectedSemanticDiagnostics).toEqual([]); }
      else {
        rejected++;
        expect(fixture.expectedSemanticDiagnostics).toEqual([{ code: "relationship-matrix-violation", severity: "error", path: "relations.relation:case.endpoints",
          message: `relation relation:case of type ${row.relationType} is not allowed from ${row.sourceType} to ${row.targetType} by matrix archimate-3.2`, refs: ["relation:case", source, target],
          details: { matrixId: "archimate-3.2", relationType: row.relationType, sourceType: row.sourceType, targetType: row.targetType } }]);
      }
      expect(fixture.expectedViewDiagnostics).toEqual([]);
    }
    expect({ allowed, rejected, relationAxes }).toEqual({ allowed: 11569, rejected: 30715, relationAxes: 1353 });
  });
});

describe("literal Appendix C and sealed identity sources", () => {
  const cases = corpusJson<any[]>("oracle:diagnostics");
  it("carries all 58 diagnostic cases and all ten immutable source-bound case ids", () => {
    expect(cases).toHaveLength(58);
    const computed = cases.filter(row => row.sourcePin !== undefined);
    expect(computed).toHaveLength(10);
    for (const row of computed) {
      const source = sourceIndex.find(entry => entry.source.repo === row.sourcePin.repository && entry.source.revision === row.sourcePin.revision && entry.source.path === row.sourcePin.path)!;
      expect(source.sha256).toBe(row.sourcePin.sha256);
      expect(derivedCaseId(corpusBytes(source.id).toString("utf8"), row.mutation)).toBe(row.id);
      expect(Array.isArray(row.expected)).toBe(true);
    }
  });
  for (const id of ["jcs-key-order", "jcs-escapes", "jcs-numbers"]) it(`replays the actual sealed ${id} bytes`, () => {
    const row = corpusJson<any>(`sealed:${id}.json`);
    for (let i = 0; i < row.inputArtifacts.length; i++) expect(canonicalBytes(row.inputArtifacts[i].json)).toBe(row.expectedArtifacts[i].text);
  });
  it("replays all four stable-id allocations from the actual sealed source", () => {
    const row = corpusJson<any>("sealed:identity-stable-id.json");
    expect(row.inputArtifacts[0].json.map((allocation: any) => stableId(allocation.owner, allocation.slot, allocation.key))).toEqual(row.expectedArtifacts[0].json);
  });
});
