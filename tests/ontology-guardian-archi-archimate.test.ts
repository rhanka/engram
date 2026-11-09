// ArchiMate 3.x mapping tables, identifier bijections, and property codec (P-6, Lot 7) tests A-T1..A-T4
// (spec/SPEC_EVOL_ARCHI_CARDS.md « P-6 — the ArchiMate mapping (engram-owned) », §2.8, §5.5, §6.1, §6.2).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ARCHI_ARCHIMATE_DIAGNOSTIC_CODES,
  ARCHI_ARCHIMATE_ELEMENT_TABLE,
  ARCHI_ARCHIMATE_PROPERTIES,
  ARCHI_ARCHIMATE_RELATIONSHIP_TABLE,
  ARCHI_DIAGNOSTIC_CODES,
  archiAttributesOfArchimate,
  archiEntityTypeOfArchimate,
  archiRefOfArchimateId,
  archiRelationTypeOfArchimate,
  archiViewOfArchimateId,
  archimateElementOf,
  archimateIdOf,
  archimatePropertiesOf,
  archimateRelationshipOf,
  archimateViewIdOf,
  assertValidArchiDiagnosticEnvelope,
  canonicalBytes,
  type ArchiArchimateDiagnostic,
  type ArchiArchimateDiagnosticCode,
  type ArchiArchimateFailureCode,
  type ArchiArchimateRelationReversed,
  type ArchiArchimateResult,
  type ArchiDiagnosticCode,
  type ArchiViewSpec,
  type NativeSemanticDocument,
} from "../src/archi.js";
import { parseArchiMermaid, type ArchiSourceTriple } from "../src/archi-mermaid/index.js";
import { ARCHI_CONTAINER_KINDS } from "../src/ontology-guardian/archi-cards.js";
import { ARCHI1_DECLARATION, ARCHI1_TUPLES } from "../src/ontology-guardian/archi-profile.js";
import {
  ARCHIMATE_CATALOGUE,
  TUPLES_COUNT,
  expandMatrixTuples,
  matrixAllows,
} from "../src/ontology-guardian/diagram-matrix-data.js";
import { validPointer } from "../src/ontology-guardian/diagnostics.js";

// Regex literals from P-6 §3 tested directly since module regexes stay private (SPEC:523, 838-844).
const ARCHI_REF_RE = /^(document|entity|relation):[a-z][a-z0-9-]{0,39}$/;
const ARCHIMATE_ID_RE = /^(document|entity|relation)_[a-z][a-z0-9-]{0,39}$/;
const VIEW_REF_RE = /^view:[a-z][a-z0-9-]{0,39}$/;
const ARCHIMATE_VIEW_ID_RE =
  /^view_[a-z][a-z0-9-]{0,39}\.(-|e_[a-z][a-z0-9_]{0,39}(\.e_[a-z][a-z0-9_]{0,39})*)$/;
const RESERVED_PREFIXES = ["entity_", "relation_", "document_", "view_", "propdef-"] as const;

const testsDir = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(testsDir, "fixtures", "archi");

function loadFixtureTriple(name: string): ArchiSourceTriple {
  const mmd = readFileSync(join(fixturesRoot, name, "architecture.mmd"), "utf8");
  const parsed = parseArchiMermaid(mmd, { checkCanonical: true });
  expect(parsed.ok, parsed.ok ? "" : parsed.diagnostics[0]?.message).toBe(true);
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message);
  return parsed.value;
}

const FX_JOINT_R2 = loadFixtureTriple("joint-r2");
const FX_JOINT_R2_TEINTES = loadFixtureTriple("joint-r2-teintes");
const FX_HOSTS_R3 = loadFixtureTriple("hosts-r3");

const CORPUS_FIXTURES = [
  {
    name: "joint-r2",
    triple: FX_JOINT_R2,
    expectedArchiRefs: 94,
    expectedTotalRefs: 94,
    expectedViews: 4,
    expectedFoldStates: 29,
    expectedDistinctViewPairs: 26,
  },
  {
    name: "joint-r2-teintes",
    triple: FX_JOINT_R2_TEINTES,
    expectedArchiRefs: 94,
    expectedTotalRefs: 101,
    expectedViews: 1,
    expectedFoldStates: 9,
    expectedDistinctViewPairs: 9,
  },
  {
    name: "hosts-r3",
    triple: FX_HOSTS_R3,
    expectedArchiRefs: 121,
    expectedTotalRefs: 121,
    expectedViews: 2,
    expectedFoldStates: 15,
    expectedDistinctViewPairs: 14,
  },
] as const;

function attrString(
  rec: { readonly attributes?: Readonly<Record<string, unknown>> },
  key: string,
): string | undefined {
  const entry = rec.attributes?.[key] as { readonly value?: unknown } | undefined;
  return typeof entry?.value === "string" ? entry.value : undefined;
}

function endpointOf(
  rel: NativeSemanticDocument["relations"][string],
  role: "source" | "target",
): string {
  const found = rel.endpoints.find((e) => e.role === role)?.target;
  if (!found) throw new Error(`Missing ${role} endpoint on ${rel.id}`);
  return found;
}

/** Derives the 3 + C fold states of a view per ING:803-823 (SPEC:535, 540). */
function deriveViewFoldStates(
  doc: NativeSemanticDocument,
  spec: ArchiViewSpec,
): { readonly key: string; readonly collapsed: readonly string[] }[] {
  const drawnContainers = spec.draw
    .filter((entityId) => ARCHI_CONTAINER_KINDS.has(doc.entities[entityId]?.type ?? ""))
    .sort();
  const defaultCollapsed = [...spec.collapsed].sort();
  const defaultSet = new Set(defaultCollapsed);

  return [
    { key: "default", collapsed: defaultCollapsed },
    { key: "expanded", collapsed: [] },
    { key: "collapsed", collapsed: drawnContainers },
    ...drawnContainers.map((c) => ({
      key: `toggle:${c}`,
      collapsed: defaultSet.has(c)
        ? defaultCollapsed.filter((x) => x !== c)
        : [...defaultCollapsed, c].sort(),
    })),
  ];
}

/** Builds all 32 (kind, form) pairs from ARCHI1_DECLARATION (AP:38-50). */
function buildAll32KindFormPairs(): { readonly kind: string; readonly form?: string }[] {
  const out: { readonly kind: string; readonly form?: string }[] = [];
  for (const et of ARCHI1_DECLARATION.entityTypes) {
    const formAttr = et.attributes.find((a) => a.name === "form") as
      | { readonly values?: readonly string[]; readonly required?: boolean }
      | undefined;
    if (!formAttr || !formAttr.values) {
      out.push({ kind: et.id });
    } else {
      if (!formAttr.required) {
        out.push({ kind: et.id });
      }
      for (const f of formAttr.values) {
        out.push({ kind: et.id, form: f });
      }
    }
  }
  return out;
}

/** Builds the typed ArchiArchimateRelationReversed inputs for all archi@1 relations of a fixture. */
function fixtureRelationInputs(
  fx: (typeof CORPUS_FIXTURES)[number],
): ArchiArchimateRelationReversed[] {
  const { entities, relations } = fx.triple.document;
  const out: ArchiArchimateRelationReversed[] = [];
  for (const rel of Object.values(relations)) {
    if (rel.profile !== "archi@1") continue;
    const srcEntity = entities[endpointOf(rel, "source")]!;
    const tgtEntity = entities[endpointOf(rel, "target")]!;
    const srcForm = attrString(srcEntity, "form");
    const tgtForm = attrString(tgtEntity, "form");
    const mode = attrString(rel, "mode");
    const trigger = attrString(rel, "trigger");
    const event = attrString(rel, "event");
    out.push({
      relationType: rel.type,
      ...(mode !== undefined ? { mode } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(event !== undefined ? { event } : {}),
      source: srcForm !== undefined ? { kind: srcEntity.type, form: srcForm } : { kind: srcEntity.type },
      target: tgtForm !== undefined ? { kind: tgtEntity.type, form: tgtForm } : { kind: tgtEntity.type },
    });
  }
  return out;
}

/** Builds the closed 804-input relationship domain (SPEC:540, 812). */
function buildAll804RelationshipInputs(): {
  readonly endpointPairCount: number;
  readonly inputs: readonly ArchiArchimateRelationReversed[];
} {
  const pairsByKind = new Map<string, { readonly kind: string; readonly form?: string }[]>();
  for (const pair of buildAll32KindFormPairs()) {
    const list = pairsByKind.get(pair.kind) ?? [];
    list.push(pair);
    pairsByKind.set(pair.kind, list);
  }

  let endpointPairCount = 0;
  const inputs: ArchiArchimateRelationReversed[] = [];

  for (const tuple of ARCHI1_TUPLES) {
    const sources = pairsByKind.get(tuple.sourceType) ?? [];
    const targets = pairsByKind.get(tuple.targetType) ?? [];
    for (const source of sources) {
      for (const target of targets) {
        endpointPairCount++;
        if (tuple.relationType === "accesses") {
          for (const mode of ["read", "append", "write"] as const) {
            inputs.push({ relationType: tuple.relationType, mode, source, target });
          }
        } else if (tuple.relationType === "invokes") {
          for (const trigger of ["hook", "poll", "mcp-stdio", "command", "schedule"] as const) {
            inputs.push({ relationType: tuple.relationType, trigger, source, target });
            inputs.push({ relationType: tuple.relationType, trigger, event: "e", source, target });
          }
        } else {
          inputs.push({ relationType: tuple.relationType, source, target });
        }
      }
    }
  }

  return { endpointPairCount, inputs };
}

function expectArchimateRefusal<T>(
  res: ArchiArchimateResult<T>,
  expectedCode: ArchiArchimateFailureCode,
  expectedPath: string,
  expectedSubjectRef = "archimate",
): ArchiArchimateDiagnostic {
  expect(res.ok, `expected refusal ${expectedCode} at "${expectedPath}"`).toBe(false);
  if (res.ok) throw new Error("expected ok: false");
  expect(res.diagnostics).toHaveLength(1);
  const diag = res.diagnostics[0];
  assertValidArchiDiagnosticEnvelope(diag);
  expect(diag.origin).toBe("engram");
  expect(diag.severity).toBe("error");
  expect(diag.code).toBe(expectedCode);
  expect(diag.nativeCode).toBe(expectedCode);
  expect(diag.path).toBe(expectedPath);
  expect(diag.subjectRef).toBe(expectedSubjectRef);
  expect(validPointer(diag.path)).toBe(true);
  return diag;
}

function assertRecursivelyFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  if (Array.isArray(value)) {
    for (const item of value) assertRecursivelyFrozen(item, seen);
  } else {
    for (const child of Object.values(value as Record<string, unknown>)) {
      assertRecursivelyFrozen(child, seen);
    }
  }
}

describe("ArchiMate 3.x mapping tables and bijections (P-6, Lot 7)", () => {
  it("A-T1: proves totality and injectivity over the 3 corpus fixtures, 53 fold states / 49 view ids, 32 (kind, form) pairs, and 804 typed relationship inputs", () => {
    const unionConceptIds = new Map<string, string>();
    const allViewIds = new Set<string>();
    const propdefIds = new Set(ARCHI_ARCHIMATE_PROPERTIES.map((p) => p.identifier));
    expect(propdefIds.size).toBe(23);
    for (const id of propdefIds) {
      expect(id.startsWith("propdef-")).toBe(true);
    }

    let totalViews = 0;
    let totalFoldStates = 0;

    for (const fx of CORPUS_FIXTURES) {
      const { document: doc, views } = fx.triple;
      expect(views).toHaveLength(fx.expectedViews);
      totalViews += views.length;

      const fixtureConceptIds = new Set<string>();
      const allDocRefs: string[] = [
        doc.documentId,
        ...Object.keys(doc.entities),
        ...Object.keys(doc.relations),
      ];
      const archiDocRefs: string[] = [
        doc.documentId,
        ...Object.values(doc.entities)
          .filter((e) => e.profile === "archi@1")
          .map((e) => e.id),
        ...Object.values(doc.relations)
          .filter((r) => r.profile === "archi@1")
          .map((r) => r.id),
      ];
      expect(allDocRefs).toHaveLength(fx.expectedTotalRefs);
      expect(archiDocRefs).toHaveLength(fx.expectedArchiRefs);

      for (const ref of allDocRefs) {
        expect(ARCHI_REF_RE.test(ref)).toBe(true);
        const idRes = archimateIdOf(ref);
        expect(idRes.ok, idRes.ok ? "" : idRes.diagnostics[0]?.message).toBe(true);
        if (!idRes.ok) continue;
        expect(ARCHIMATE_ID_RE.test(idRes.value)).toBe(true);
        expect(fixtureConceptIds.has(idRes.value)).toBe(false);
        fixtureConceptIds.add(idRes.value);

        const prevRef = unionConceptIds.get(idRes.value);
        if (prevRef !== undefined) {
          expect(prevRef).toBe(ref);
        }
        unionConceptIds.set(idRes.value, ref);
      }
      expect(fixtureConceptIds.size).toBe(fx.expectedTotalRefs);

      // Fold states per view (3 + C rule of ING:803-823)
      const fixtureViewIds = new Set<string>();
      let fxStates = 0;
      for (const spec of views) {
        expect(VIEW_REF_RE.test(spec.viewId)).toBe(true);
        const states = deriveViewFoldStates(doc, spec);
        fxStates += states.length;
        totalFoldStates += states.length;
        for (const st of states) {
          const vIdRes = archimateViewIdOf(spec.viewId, st.collapsed);
          expect(vIdRes.ok, vIdRes.ok ? "" : vIdRes.diagnostics[0]?.message).toBe(true);
          if (!vIdRes.ok) continue;
          expect(ARCHIMATE_VIEW_ID_RE.test(vIdRes.value)).toBe(true);
          fixtureViewIds.add(vIdRes.value);
          allViewIds.add(vIdRes.value);
        }
      }
      expect(fxStates).toBe(fx.expectedFoldStates);
      expect(fixtureViewIds.size).toBe(fx.expectedDistinctViewPairs);
    }

    expect(totalViews).toBe(7);
    expect(totalFoldStates).toBe(53);
    expect(allViewIds.size).toBe(49);

    // Witness: default and all-expanded fold states of view:roles coexist with distinct ids
    const rolesDefaultId = archimateViewIdOf("view:roles", [
      "entity:pkg-h2a",
      "entity:pkg-plugin",
      "entity:sys-engram",
    ]);
    const rolesExpandedId = archimateViewIdOf("view:roles", []);
    expect(rolesDefaultId).toEqual({
      ok: true,
      value: "view_roles.e_pkg_h2a.e_pkg_plugin.e_sys_engram",
    });
    expect(rolesExpandedId).toEqual({
      ok: true,
      value: "view_roles.-",
    });
    expect(allViewIds.has("view_roles.e_pkg_h2a.e_pkg_plugin.e_sys_engram")).toBe(true);
    expect(allViewIds.has("view_roles.-")).toBe(true);

    // Cross-namespace witnesses: document:roles, entity:roles, relation:roles, view:roles
    const crossNs = [
      archimateIdOf("document:roles"),
      archimateIdOf("entity:roles"),
      archimateIdOf("relation:roles"),
      archimateViewIdOf("view:roles", []),
    ];
    expect(crossNs.map((r) => (r.ok ? r.value : ""))).toEqual([
      "document_roles",
      "entity_roles",
      "relation_roles",
      "view_roles.-",
    ]);
    expect(new Set(crossNs.map((r) => (r.ok ? r.value : ""))).size).toBe(4);

    // Disjointness across concept/model ids, view ids, and propdef- ids, and reserved prefixes
    for (const vId of allViewIds) {
      expect(unionConceptIds.has(vId)).toBe(false);
      expect(propdefIds.has(vId)).toBe(false);
      expect(RESERVED_PREFIXES.some((p) => vId.startsWith(p))).toBe(true);
    }
    for (const cId of unionConceptIds.keys()) {
      expect(propdefIds.has(cId)).toBe(false);
      expect(RESERVED_PREFIXES.some((p) => cId.startsWith(p))).toBe(true);
    }

    // Element table: 32 pairs -> 8 ArchiMate types, total and injective
    expect(ARCHI_ARCHIMATE_ELEMENT_TABLE).toHaveLength(32);
    const pairs32 = buildAll32KindFormPairs();
    expect(pairs32).toHaveLength(32);

    const catalogueById = new Map(ARCHIMATE_CATALOGUE.map((c) => [c.id, c]));
    const elementOutputs = new Set<string>();
    const mappedTypeIds = new Set<string>();
    const manyToOneFalseRows: string[] = [];

    for (const pair of pairs32) {
      const res = archimateElementOf(pair);
      expect(res.ok, res.ok ? "" : res.diagnostics[0]?.message).toBe(true);
      if (!res.ok) continue;
      const val = res.value;
      const cat = catalogueById.get(val.archimateTypeId);
      expect(cat).toBeDefined();
      expect(val.archimateElement).toBe(cat?.name);
      expect(val.layer).toBe(cat?.layer);
      expect(val.aspect).toBe(cat?.aspect);
      mappedTypeIds.add(val.archimateTypeId);
      if (!val.manyToOne) {
        manyToOneFalseRows.push(`${val.kind}:${val.form ?? ""}`);
      }
      const bytes = Buffer.from(canonicalBytes(val)).toString("utf8");
      expect(elementOutputs.has(bytes)).toBe(false);
      elementOutputs.add(bytes);
    }
    expect(elementOutputs.size).toBe(32);
    expect([...mappedTypeIds].sort()).toEqual([
      "application-component",
      "application-interface",
      "artifact",
      "business-actor",
      "data-object",
      "device",
      "grouping",
      "node",
    ]);
    expect(manyToOneFalseRows).toEqual(["host:workstation"]);

    // Every fixture archi@1 entity maps cleanly
    for (const fx of CORPUS_FIXTURES) {
      for (const entity of Object.values(fx.triple.document.entities)) {
        if (entity.profile !== "archi@1") continue;
        const form = attrString(entity, "form");
        const elRes = archimateElementOf(
          form !== undefined ? { kind: entity.type, form } : { kind: entity.type },
        );
        expect(elRes.ok).toBe(true);
      }
    }

    // Relationship table: 15 rows, 509 endpoint pairs, 804 typed inputs, total and injective
    expect(ARCHI_ARCHIMATE_RELATIONSHIP_TABLE).toHaveLength(15);
    const { endpointPairCount, inputs: relInputs } = buildAll804RelationshipInputs();
    expect(endpointPairCount).toBe(509);
    expect(relInputs).toHaveLength(804);

    const relOutputs = new Set<string>();
    const distinctNominalTriples = new Set<string>();
    for (const input of relInputs) {
      const res = archimateRelationshipOf(input);
      expect(res.ok, res.ok ? "" : res.diagnostics[0]?.message).toBe(true);
      if (!res.ok) continue;
      const val = res.value;
      distinctNominalTriples.add(
        `${input.relationType}:${val.archimateSource.archimateTypeId}->${val.archimateTarget.archimateTypeId}`,
      );
      const bytes = Buffer.from(canonicalBytes(val)).toString("utf8");
      expect(relOutputs.has(bytes)).toBe(false);
      relOutputs.add(bytes);
    }
    expect(distinctNominalTriples.size).toBe(42);
    expect(relOutputs.size).toBe(804);

    // Every fixture archi@1 relation maps cleanly
    for (const fx of CORPUS_FIXTURES) {
      for (const relInput of fixtureRelationInputs(fx)) {
        const relRes = archimateRelationshipOf(relInput);
        expect(relRes.ok).toBe(true);
      }
    }
  });

  it("A-T2: round-trips concept/model ids, view ids (incl. UTF-16 vs EID order-flip), elements, relationships, and the 23-property vocabulary across all fixtures", () => {
    // 1. Concept/model id round trip on all fixture refs + boundary lengths 1 and 40
    const boundaryRefs = [
      "document:a",
      `document:a${"0".repeat(39)}`,
      "entity:a",
      `entity:a-${"b".repeat(38)}`,
      "relation:z",
      `relation:z${"9".repeat(39)}`,
    ];
    for (const ref of boundaryRefs) {
      const fwd = archimateIdOf(ref);
      expect(fwd.ok).toBe(true);
      if (!fwd.ok) continue;
      const rev = archiRefOfArchimateId(fwd.value);
      expect(rev).toEqual({ ok: true, value: ref });
    }

    for (const fx of CORPUS_FIXTURES) {
      const { document: doc, views } = fx.triple;
      for (const ref of [doc.documentId, ...Object.keys(doc.entities), ...Object.keys(doc.relations)]) {
        const fwd = archimateIdOf(ref);
        expect(fwd.ok).toBe(true);
        if (!fwd.ok) continue;
        const rev = archiRefOfArchimateId(fwd.value);
        expect(rev).toEqual({ ok: true, value: ref });
      }

      // 2. View id round trip across all 53 fold states
      for (const spec of views) {
        for (const st of deriveViewFoldStates(doc, spec)) {
          const fwd = archimateViewIdOf(spec.viewId, st.collapsed);
          expect(fwd.ok).toBe(true);
          if (!fwd.ok) continue;
          const rev = archiViewOfArchimateId(fwd.value);
          expect(rev).toEqual({
            ok: true,
            value: { viewRef: spec.viewId, collapsed: st.collapsed },
          });
        }
      }
    }

    // View id boundary lengths 1 and 40 + UTF-16 vs EID byte order-flip witness (N6)
    const maxLocal = `a${"0".repeat(39)}`;
    const boundaryViewState = {
      viewRef: `view:${maxLocal}`,
      collapsed: ["entity:a", `entity:${maxLocal}`],
    };
    const bViewId = archimateViewIdOf(boundaryViewState.viewRef, boundaryViewState.collapsed);
    expect(bViewId.ok).toBe(true);
    if (bViewId.ok) {
      expect(archiViewOfArchimateId(bViewId.value)).toEqual({
        ok: true,
        value: boundaryViewState,
      });
    }

    const flipFwd = archimateViewIdOf("view:roles", ["entity:sys-a-b", "entity:sys-a1"]);
    expect(flipFwd).toEqual({
      ok: true,
      value: "view_roles.e_sys_a1.e_sys_a_b",
    });
    const flipRev = archiViewOfArchimateId("view_roles.e_sys_a1.e_sys_a_b");
    expect(flipRev).toEqual({
      ok: true,
      value: { viewRef: "view:roles", collapsed: ["entity:sys-a-b", "entity:sys-a1"] },
    });

    // §4 rule (2) witness: component-wise (view local, COLLAPSED token) byte order puts
    // "roles" before "roles-replie", whereas sorting view_<local>.<C> strings puts
    // "view_roles-replie.-" before "view_roles.-" because '-' (0x2D) < '.' (0x2E)
    const rolesId = archimateViewIdOf("view:roles", []);
    const rolesReplieId = archimateViewIdOf("view:roles-replie", []);
    expect(rolesId.ok && rolesReplieId.ok).toBe(true);
    if (rolesId.ok && rolesReplieId.ok) {
      expect([rolesId.value, rolesReplieId.value].sort()).toEqual([
        "view_roles-replie.-",
        "view_roles.-",
      ]);
      const byPair = [rolesReplieId.value, rolesId.value].sort((a, b) => {
        const dotA = a.indexOf(".");
        const dotB = b.indexOf(".");
        const localA = a.slice("view_".length, dotA);
        const localB = b.slice("view_".length, dotB);
        if (localA !== localB) return localA < localB ? -1 : 1;
        const cA = a.slice(dotA + 1);
        const cB = b.slice(dotB + 1);
        return cA < cB ? -1 : cA > cB ? 1 : 0;
      });
      expect(byPair).toEqual(["view_roles.-", "view_roles-replie.-"]);
    }

    // 3. Element round trip for all 32 (kind, form) pairs (full mapping + minimal required keys)
    for (const pair of buildAll32KindFormPairs()) {
      const fwd = archimateElementOf(pair);
      expect(fwd.ok).toBe(true);
      if (!fwd.ok) continue;
      expect(archiEntityTypeOfArchimate(fwd.value)).toEqual({ ok: true, value: pair });
      expect(
        archiEntityTypeOfArchimate({
          archimateTypeId: fwd.value.archimateTypeId,
          properties: fwd.value.properties,
        }),
      ).toEqual({ ok: true, value: pair });
    }

    // 4. Relationship round trip for all 804 typed inputs and all fixture relations
    const { inputs: relInputs } = buildAll804RelationshipInputs();
    for (const rel of relInputs) {
      const fwd = archimateRelationshipOf(rel);
      expect(fwd.ok).toBe(true);
      if (!fwd.ok) continue;
      expect(archiRelationTypeOfArchimate(fwd.value)).toEqual({ ok: true, value: rel });
      expect(
        archiRelationTypeOfArchimate({
          archimateTypeId: fwd.value.archimateTypeId,
          archimateSource: {
            archimateTypeId: fwd.value.archimateSource.archimateTypeId,
            properties: fwd.value.archimateSource.properties,
          },
          archimateTarget: {
            archimateTypeId: fwd.value.archimateTarget.archimateTypeId,
            properties: fwd.value.archimateTarget.properties,
          },
          ...(fwd.value.directed ? { directed: fwd.value.directed } : {}),
          ...(fwd.value.accessMode ? { accessMode: fwd.value.accessMode } : {}),
          properties: fwd.value.properties,
        }),
      ).toEqual({ ok: true, value: rel });
    }
    for (const fx of CORPUS_FIXTURES) {
      for (const input of fixtureRelationInputs(fx)) {
        const fwd = archimateRelationshipOf(input);
        expect(fwd.ok).toBe(true);
        if (!fwd.ok) continue;
        expect(archiRelationTypeOfArchimate(fwd.value)).toEqual({ ok: true, value: input });
        expect(
          archiRelationTypeOfArchimate({
            archimateTypeId: fwd.value.archimateTypeId,
            archimateSource: {
              archimateTypeId: fwd.value.archimateSource.archimateTypeId,
              properties: fwd.value.archimateSource.properties,
            },
            archimateTarget: {
              archimateTypeId: fwd.value.archimateTarget.archimateTypeId,
              properties: fwd.value.archimateTarget.properties,
            },
            ...(fwd.value.directed ? { directed: fwd.value.directed } : {}),
            ...(fwd.value.accessMode ? { accessMode: fwd.value.accessMode } : {}),
            properties: fwd.value.properties,
          }),
        ).toEqual({ ok: true, value: input });
      }
    }

    // 5. Property vocabulary round trip on every FX document, archi@1 entity, relation, and view
    const propOrderIndex = new Map(ARCHI_ARCHIMATE_PROPERTIES.map((p, idx) => [p.name, idx]));

    for (const fx of CORPUS_FIXTURES) {
      const { document: doc, views } = fx.triple;

      // Model (document)
      const docId = archimateIdOf(doc.documentId);
      expect(docId.ok).toBe(true);
      const docProps = archimatePropertiesOf({ ref: doc.documentId });
      expect(docProps).toEqual({ ok: true, value: { "archi-ref": doc.documentId } });
      if (docProps.ok && docId.ok) {
        const docDecoded = archiAttributesOfArchimate(docProps.value, {
          kind: undefined,
          relationType: undefined,
          identifier: docId.value,
        });
        expect(docDecoded).toEqual({
          ok: true,
          value: { ref: doc.documentId, attributes: {} },
        });
      }

      // Entities (archi@1)
      for (const entity of Object.values(doc.entities)) {
        if (entity.profile !== "archi@1") continue;
        const eId = archimateIdOf(entity.id);
        expect(eId.ok).toBe(true);
        const eProps = archimatePropertiesOf({
          ref: entity.id,
          kind: entity.type,
          attributes: entity.attributes,
        });
        expect(eProps.ok, eProps.ok ? "" : eProps.diagnostics[0]?.message).toBe(true);
        if (!eProps.ok || !eId.ok) continue;

        // Verify emission order follows ARCHI_ARCHIMATE_PROPERTIES
        const emittedKeys = Object.keys(eProps.value);
        for (let i = 1; i < emittedKeys.length; i++) {
          expect(propOrderIndex.get(emittedKeys[i - 1]!)).toBeLessThan(
            propOrderIndex.get(emittedKeys[i]!)!,
          );
        }

        const decoded = archiAttributesOfArchimate(eProps.value, {
          kind: entity.type,
          relationType: undefined,
          identifier: eId.value,
        });
        expect(decoded.ok, decoded.ok ? "" : decoded.diagnostics[0]?.message).toBe(true);
        if (!decoded.ok) continue;

        const expectedAttrs: Record<string, unknown> = { ...entity.attributes };
        delete expectedAttrs["name"];
        delete expectedAttrs["role"];
        delete expectedAttrs["label"];

        expect(decoded.value).toEqual({
          ref: entity.id,
          kind: entity.type,
          attributes: expectedAttrs,
        });
        expect(Buffer.from(canonicalBytes(decoded.value.attributes)).toString("utf8")).toBe(
          Buffer.from(canonicalBytes(expectedAttrs)).toString("utf8"),
        );
      }

      // Relations (archi@1)
      for (const rel of Object.values(doc.relations)) {
        if (rel.profile !== "archi@1") continue;
        const rId = archimateIdOf(rel.id);
        expect(rId.ok).toBe(true);
        const rProps = archimatePropertiesOf({
          ref: rel.id,
          relationType: rel.type,
          attributes: rel.attributes,
        });
        expect(rProps.ok, rProps.ok ? "" : rProps.diagnostics[0]?.message).toBe(true);
        if (!rProps.ok || !rId.ok) continue;

        const emittedKeys = Object.keys(rProps.value);
        for (let i = 1; i < emittedKeys.length; i++) {
          expect(propOrderIndex.get(emittedKeys[i - 1]!)).toBeLessThan(
            propOrderIndex.get(emittedKeys[i]!)!,
          );
        }

        const decoded = archiAttributesOfArchimate(rProps.value, {
          kind: undefined,
          relationType: rel.type,
          identifier: rId.value,
        });
        expect(decoded.ok, decoded.ok ? "" : decoded.diagnostics[0]?.message).toBe(true);
        if (!decoded.ok) continue;

        const expectedAttrs: Record<string, unknown> = { ...rel.attributes };
        delete expectedAttrs["name"];
        delete expectedAttrs["role"];
        delete expectedAttrs["label"];

        expect(decoded.value).toEqual({
          ref: rel.id,
          relationType: rel.type,
          attributes: expectedAttrs,
        });
        expect(Buffer.from(canonicalBytes(decoded.value.attributes)).toString("utf8")).toBe(
          Buffer.from(canonicalBytes(expectedAttrs)).toString("utf8"),
        );
      }

      // Views
      for (const spec of views) {
        const vId = archimateViewIdOf(spec.viewId, spec.collapsed);
        expect(vId.ok).toBe(true);
        const vProps = archimatePropertiesOf({ ref: spec.viewId });
        expect(vProps).toEqual({ ok: true, value: { "archi-ref": spec.viewId } });
        if (vProps.ok && vId.ok) {
          const vDecoded = archiAttributesOfArchimate(vProps.value, {
            kind: undefined,
            relationType: undefined,
            identifier: vId.value,
          });
          expect(vDecoded).toEqual({
            ok: true,
            value: { ref: spec.viewId, attributes: {} },
          });
        }
      }
    }

    // Exercise all 8 evidence slots + model-level archi-carrier + event attribute
    const eightEvidenceItems = Array.from({ length: 8 }, (_, idx) => ({
      kind: "text" as const,
      value: `proof-${idx + 1}`,
    }));
    const fullPkgRecord = {
      ref: "entity:pkg-full",
      kind: "package",
      attributes: {
        name: { kind: "text", value: "Full Package" },
        shortName: { kind: "text", value: "full" },
        role: { kind: "text", value: "Exercises 8 evidence slots and version" },
        form: { kind: "enum", value: "library" },
        version: { kind: "text", value: "1.2.3" },
        category: { kind: "text", value: "core" },
        lifecycle: { kind: "enum", value: "proposed" },
        evidence: { kind: "collection", items: eightEvidenceItems },
      },
    };
    const fullPkgProps = archimatePropertiesOf(fullPkgRecord);
    expect(fullPkgProps.ok).toBe(true);
    if (fullPkgProps.ok) {
      expect(Object.keys(fullPkgProps.value)).toEqual([
        "archi-ref",
        "archi-kind",
        "archi-form",
        "archi-lifecycle",
        "archi-evidence-1",
        "archi-evidence-2",
        "archi-evidence-3",
        "archi-evidence-4",
        "archi-evidence-5",
        "archi-evidence-6",
        "archi-evidence-7",
        "archi-evidence-8",
        "archi-short-name",
        "archi-category",
        "archi-version",
      ]);
      const fullPkgDecoded = archiAttributesOfArchimate(fullPkgProps.value);
      expect(fullPkgDecoded.ok).toBe(true);
      if (fullPkgDecoded.ok) {
        expect(fullPkgDecoded.value.attributes["evidence"]).toEqual({
          kind: "collection",
          items: eightEvidenceItems,
        });
      }
    }

    const modelWithCarrier = archiAttributesOfArchimate(
      {
        "archi-carrier": "archi-carrier 1 text=engram.archi-mermaid/1 sha256=0000000000000000000000000000000000000000000000000000000000000000 view=roles collapsed=-\nflowchart TB\n",
        "archi-ref": "document:archi-joint",
      },
      { scope: "model", identifier: "document_archi-joint" },
    );
    expect(modelWithCarrier).toEqual({
      ok: true,
      value: { ref: "document:archi-joint", attributes: {} },
    });

    // Empty-string lower-bound round trips (version: "", shortName: "", url: "", evidence item "", invokes event: "")
    const emptyTextPkgRecord = {
      ref: "entity:pkg-empty",
      kind: "package",
      attributes: {
        shortName: { kind: "text", value: "" },
        form: { kind: "enum", value: "library" },
        version: { kind: "text", value: "" },
        lifecycle: { kind: "enum", value: "current" },
        evidence: { kind: "collection", items: [{ kind: "text", value: "" }] },
      },
    };
    const emptyPkgProps = archimatePropertiesOf(emptyTextPkgRecord);
    expect(emptyPkgProps).toEqual({
      ok: true,
      value: {
        "archi-ref": "entity:pkg-empty",
        "archi-kind": "package",
        "archi-form": "library",
        "archi-lifecycle": "current",
        "archi-evidence-1": "",
        "archi-short-name": "",
        "archi-version": "",
      },
    });
    if (emptyPkgProps.ok) {
      expect(archiAttributesOfArchimate(emptyPkgProps.value)).toEqual({
        ok: true,
        value: emptyTextPkgRecord,
      });
    }

    const emptyUrlRepoRecord = {
      ref: "entity:repo-empty",
      kind: "repo",
      attributes: {
        url: { kind: "text", value: "" },
        lifecycle: { kind: "enum", value: "current" },
        evidence: { kind: "collection", items: [{ kind: "text", value: "p" }] },
      },
    };
    const emptyUrlProps = archimatePropertiesOf(emptyUrlRepoRecord);
    expect(emptyUrlProps.ok).toBe(true);
    if (emptyUrlProps.ok) {
      expect(archiAttributesOfArchimate(emptyUrlProps.value)).toEqual({
        ok: true,
        value: emptyUrlRepoRecord,
      });
    }

    const emptyEventRelInput: ArchiArchimateRelationReversed = {
      relationType: "invokes",
      trigger: "hook",
      event: "",
      source: { kind: "runtime", form: "cli" },
      target: { kind: "runtime", form: "cli" },
    };
    const emptyEventRelFwd = archimateRelationshipOf(emptyEventRelInput);
    expect(emptyEventRelFwd.ok).toBe(true);
    if (emptyEventRelFwd.ok) {
      expect(archiRelationTypeOfArchimate(emptyEventRelFwd.value)).toEqual({
        ok: true,
        value: emptyEventRelInput,
      });
    }

    const emptyEventRelRecord = {
      ref: "relation:inv-empty",
      relationType: "invokes",
      attributes: {
        trigger: { kind: "enum", value: "hook" },
        event: { kind: "text", value: "" },
        lifecycle: { kind: "enum", value: "current" },
        evidence: { kind: "collection", items: [{ kind: "text", value: "" }] },
      },
    };
    const emptyEventRelProps = archimatePropertiesOf(emptyEventRelRecord);
    expect(emptyEventRelProps).toEqual({
      ok: true,
      value: {
        "archi-ref": "relation:inv-empty",
        "archi-relation-type": "invokes",
        "archi-lifecycle": "current",
        "archi-evidence-1": "",
        "archi-trigger": "hook",
        "archi-event": "",
      },
    });
    if (emptyEventRelProps.ok) {
      expect(archiAttributesOfArchimate(emptyEventRelProps.value)).toEqual({
        ok: true,
        value: emptyEventRelRecord,
      });
    }
  });

  it("A-T3: validates all 804 typed relationship inputs and fixture relations against the ArchiMate 3.2 matrix (783 nominal + 21 Association fallbacks)", () => {
    const TUPLES = expandMatrixTuples();
    expect(TUPLES).toHaveLength(TUPLES_COUNT);

    const { inputs } = buildAll804RelationshipInputs();
    let fallbackCount = 0;
    let nominalCount = 0;
    let partOfCompPkgFallbacks = 0;
    let runsOnFallbacks = 0;

    for (const input of inputs) {
      const res = archimateRelationshipOf(input);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const {
        archimateTypeId,
        nominalTypeId,
        usedAssociationFallback,
        archimateSource,
        archimateTarget,
      } = res.value;

      const nominalAllowed = matrixAllows(
        TUPLES,
        nominalTypeId,
        archimateSource.archimateTypeId,
        archimateTarget.archimateTypeId,
      );
      expect(usedAssociationFallback).toBe(!nominalAllowed);
      expect(
        matrixAllows(
          TUPLES,
          archimateTypeId,
          archimateSource.archimateTypeId,
          archimateTarget.archimateTypeId,
        ),
      ).toBe(true);

      if (usedAssociationFallback) {
        fallbackCount++;
        expect(archimateTypeId).toBe("association");
        expect(res.value.archimateRelationship).toBe("Association");
        expect(res.value.directed).toBe(true);
        if (
          input.relationType === "partOf" &&
          input.source.kind === "component" &&
          input.target.kind === "package"
        ) {
          partOfCompPkgFallbacks++;
        } else if (input.relationType === "runsOn") {
          runsOnFallbacks++;
        } else {
          throw new Error(`Unexpected fallback on ${JSON.stringify(input)}`);
        }
      } else {
        nominalCount++;
        expect(archimateTypeId).toBe(nominalTypeId);
      }
    }

    expect(partOfCompPkgFallbacks).toBe(3);
    expect(runsOnFallbacks).toBe(18);
    expect(fallbackCount).toBe(21);
    expect(nominalCount).toBe(783);

    // Verify all fixture relations against the matrix as well
    for (const fx of CORPUS_FIXTURES) {
      for (const relInput of fixtureRelationInputs(fx)) {
        const res = archimateRelationshipOf(relInput);
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        const m = res.value;
        expect(m.usedAssociationFallback).toBe(
          !matrixAllows(
            TUPLES,
            m.nominalTypeId,
            m.archimateSource.archimateTypeId,
            m.archimateTarget.archimateTypeId,
          ),
        );
        expect(
          matrixAllows(
            TUPLES,
            m.archimateTypeId,
            m.archimateSource.archimateTypeId,
            m.archimateTarget.archimateTypeId,
          ),
        ).toBe(true);
      }
    }
  });

  it("A-T4: enforces all refusal paths, diagnostic envelopes, recursive table freeze, and 38-code drift guards", () => {
    // 1. Absent or empty archi-kind -> archimate-kind-missing at "/properties/archi-kind"
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({ archimateTypeId: "grouping", properties: {} }),
      "archimate-kind-missing",
      "/properties/archi-kind",
    );
    expectArchimateRefusal(
      archiEntityTypeOfArchimate(
        { archimateTypeId: "grouping", properties: { "archi-kind": "" } },
        { subjectRef: "custom-subj" },
      ),
      "archimate-kind-missing",
      "/properties/archi-kind",
      "custom-subj",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof",
      }),
      "archimate-kind-missing",
      "/properties/archi-kind",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-kind": "",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof",
      }),
      "archimate-kind-missing",
      "/properties/archi-kind",
    );

    // 2. Unknown keys, non-objects, throwing getters, and empty subjectRef fallback
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("boom");
        },
      },
    );
    expectArchimateRefusal(archimateElementOf(null), "archi-input-invalid", "");
    expectArchimateRefusal(archimateElementOf(throwingProxy), "archi-input-invalid", "");
    expectArchimateRefusal(
      archimateElementOf({ kind: "system", extra: 1 }, { subjectRef: "" }),
      "archi-input-invalid",
      "/extra",
      "archimate",
    );
    expectArchimateRefusal(
      archimateElementOf({ kind: "system", "a/b~c": 1 }),
      "archi-input-invalid",
      "/a~1b~0c",
    );
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({
        archimateTypeId: "grouping",
        properties: { "archi-kind": "system" },
        unknownTop: true,
      }),
      "archi-input-invalid",
      "/unknownTop",
    );
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({
        archimateTypeId: "grouping",
        properties: { "archi-kind": "system", extraProp: "x" },
      }),
      "archi-input-invalid",
      "/properties/extraProp",
    );

    // 3. Bad refs, ids, viewRefs, and collapsed ordering (incl. UTF-16 vs EID order flip N6)
    expectArchimateRefusal(archimateIdOf(42), "archi-input-invalid", "");
    expectArchimateRefusal(archimateIdOf("sys-h2a"), "archi-input-invalid", "");
    expectArchimateRefusal(archimateIdOf("view:roles"), "archi-input-invalid", "");
    expectArchimateRefusal(archimateIdOf("entity:sys_h2a"), "archi-input-invalid", "");
    expectArchimateRefusal(archimateIdOf(`entity:a${"0".repeat(40)}`), "archi-input-invalid", "");

    expectArchimateRefusal(archiRefOfArchimateId(null), "archi-input-invalid", "");
    expectArchimateRefusal(archiRefOfArchimateId("entity:sys-h2a"), "archi-input-invalid", "");
    expectArchimateRefusal(archiRefOfArchimateId("view_roles.-"), "archi-input-invalid", "");

    expectArchimateRefusal(archimateViewIdOf("entity:sys-h2a", []), "archi-input-invalid", "/viewRef");
    expectArchimateRefusal(archimateViewIdOf("view:roles", "not-array"), "archi-input-invalid", "/collapsed");
    expectArchimateRefusal(
      archimateViewIdOf("view:roles", ["sys-h2a"]),
      "archi-input-invalid",
      "/collapsed/0",
    );
    expectArchimateRefusal(
      archimateViewIdOf("view:roles", ["entity:sys-h2a", "entity:sys-h2a"]),
      "archi-input-invalid",
      "/collapsed/1",
    );
    // N6: ["entity:sys-a1", "entity:sys-a-b"] is sorted in EID order but unsorted in UTF-16 order ('1' > '-')
    expectArchimateRefusal(
      archimateViewIdOf("view:roles", ["entity:sys-a1", "entity:sys-a-b"]),
      "archi-input-invalid",
      "/collapsed/1",
    );
    // N6: "view_roles.e_sys_a_b.e_sys_a1" is sorted in UTF-16 model order but unsorted in EID byte order ('_' > '1')
    expectArchimateRefusal(
      archiViewOfArchimateId("view_roles.e_sys_a_b.e_sys_a1"),
      "archi-input-invalid",
      "",
    );
    expectArchimateRefusal(
      archiViewOfArchimateId("view_roles.e_sys_a1.e_sys_a1"),
      "archi-input-invalid",
      "",
    );
    expectArchimateRefusal(archiViewOfArchimateId("view_roles"), "archi-input-invalid", "");

    // 4. Element & relationship forward validation (forms, matrix tuples, mode, trigger, event)
    expectArchimateRefusal(archimateElementOf({ kind: "unknown" }), "archi-input-invalid", "/kind");
    const protoKindNames = Array.from(
      new Set([...Object.getOwnPropertyNames(Object.prototype), "toString", "constructor", "__proto__"]),
    );
    for (const name of protoKindNames) {
      expectArchimateRefusal(archimateElementOf({ kind: name }), "archi-input-invalid", "/kind");
      expectArchimateRefusal(
        archiEntityTypeOfArchimate({
          archimateTypeId: "grouping",
          properties: { "archi-kind": name },
        }),
        "archi-input-invalid",
        "/properties/archi-kind",
      );
      expectArchimateRefusal(
        archimatePropertiesOf({
          ref: "entity:x",
          kind: name,
          attributes: {
            lifecycle: { kind: "enum", value: "current" },
            evidence: { kind: "collection", items: [{ kind: "text", value: "p" }] },
          },
        }),
        "archi-input-invalid",
        "/kind",
      );
      expectArchimateRefusal(
        archiAttributesOfArchimate({
          "archi-ref": "entity:x",
          "archi-kind": name,
          "archi-lifecycle": "current",
          "archi-evidence-1": "p",
        }),
        "archi-input-invalid",
        "/properties/archi-kind",
      );
      expectArchimateRefusal(
        archimateRelationshipOf({
          relationType: "uses",
          source: { kind: name },
          target: { kind: "system" },
        }),
        "archi-input-invalid",
        "/source/kind",
      );
    }
    expectArchimateRefusal(archimateElementOf({ kind: "package" }), "archi-input-invalid", "/form");
    expectArchimateRefusal(
      archimateElementOf({ kind: "system", form: "cli" }),
      "archi-input-invalid",
      "/form",
    );
    expectArchimateRefusal(
      archimateElementOf({ kind: "actor", form: "cli" }),
      "archi-input-invalid",
      "/form",
    );

    const sysEl = archimateElementOf({ kind: "system" });
    const rtEl = archimateElementOf({ kind: "runtime", form: "cli" });
    const stEl = archimateElementOf({ kind: "store", form: "jsonl" });
    const actEl = archimateElementOf({ kind: "actor", form: "human" });
    expect(sysEl.ok && rtEl.ok && stEl.ok && actEl.ok).toBe(true);
    if (!sysEl.ok || !rtEl.ok || !stEl.ok || !actEl.ok) return;

    // Matrix violation: actor -> store is not in ARCHI1_TUPLES for uses
    expectArchimateRefusal(
      archimateRelationshipOf({
        relationType: "uses",
        source: { kind: "actor", form: "human" },
        target: { kind: "store", form: "jsonl" },
      }),
      "archi-input-invalid",
      "/target",
    );
    // mode outside accesses, missing mode on accesses
    expectArchimateRefusal(
      archimateRelationshipOf({
        relationType: "uses",
        mode: "read",
        source: { kind: "actor", form: "human" },
        target: { kind: "system" },
      }),
      "archi-input-invalid",
      "/mode",
    );
    expectArchimateRefusal(
      archimateRelationshipOf({
        relationType: "accesses",
        source: { kind: "runtime", form: "cli" },
        target: { kind: "store", form: "jsonl" },
      }),
      "archi-input-invalid",
      "/mode",
    );
    // trigger / event outside invokes, missing trigger on invokes
    expectArchimateRefusal(
      archimateRelationshipOf({
        relationType: "uses",
        trigger: "hook",
        source: { kind: "actor", form: "human" },
        target: { kind: "system" },
      }),
      "archi-input-invalid",
      "/trigger",
    );
    expectArchimateRefusal(
      archimateRelationshipOf({
        relationType: "uses",
        event: "ev",
        source: { kind: "actor", form: "human" },
        target: { kind: "system" },
      }),
      "archi-input-invalid",
      "/event",
    );
    expectArchimateRefusal(
      archimateRelationshipOf({
        relationType: "invokes",
        source: { kind: "runtime", form: "cli" },
        target: { kind: "runtime", form: "cli" },
      }),
      "archi-input-invalid",
      "/trigger",
    );

    // 5. Reverse element & relationship checks: missing archimateTypeId/directed, absent archi-relation-type, retyped element/relationship
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({ properties: { "archi-kind": "system" } }),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    // Foreign ArchiMate type (outside the 8 mapped types) checked before archi-kind
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({
        archimateTypeId: "business-role",
        properties: { "archi-kind": "actor" },
      }),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({
        archimateTypeId: "business-role",
        properties: {},
      }),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    // Retyped element: actor retyped from business-actor to application-component
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({
        archimateTypeId: "application-component",
        properties: { "archi-kind": "actor" },
      }),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    // Optional field disagreement on element
    expectArchimateRefusal(
      archiEntityTypeOfArchimate({
        ...sysEl.value,
        manyToOne: false,
      }),
      "archi-input-invalid",
      "/manyToOne",
    );

    const usesFwd = archimateRelationshipOf({
      relationType: "uses",
      source: { kind: "actor", form: "human" },
      target: { kind: "system" },
    });
    const managedInFwd = archimateRelationshipOf({
      relationType: "managedIn",
      source: { kind: "system" },
      target: { kind: "repo" },
    });
    expect(usesFwd.ok && managedInFwd.ok).toBe(true);
    if (!usesFwd.ok || !managedInFwd.ok) return;

    // Missing archimateTypeId on relationship
    const { archimateTypeId: _omitType, ...usesWithoutTypeId } = usesFwd.value;
    void _omitType;
    expectArchimateRefusal(
      archiRelationTypeOfArchimate(usesWithoutTypeId),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    // Missing directed: true on association
    const { directed: _omitDirected, ...managedInWithoutDirected } = managedInFwd.value;
    void _omitDirected;
    expectArchimateRefusal(
      archiRelationTypeOfArchimate(managedInWithoutDirected),
      "archi-input-invalid",
      "/directed",
    );
    // Absent or empty archi-relation-type at "/properties/archi-relation-type" (N4)
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        properties: {},
      }),
      "archi-input-invalid",
      "/properties/archi-relation-type",
    );
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        properties: { "archi-relation-type": "" },
      }),
      "archi-input-invalid",
      "/properties/archi-relation-type",
    );
    // Retyped relationship: uses retyped from serving to flow (or association without directed) while keeping archi-relation-type="uses" (N4)
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        archimateTypeId: "flow",
      }),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        archimateTypeId: "association",
      }),
      "archi-input-invalid",
      "/archimateTypeId",
    );
    // Precedence: absent archi-relation-type checked before directed equality on association
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...managedInWithoutDirected,
        properties: {},
      }),
      "archi-input-invalid",
      "/properties/archi-relation-type",
    );
    // Endpoint missing archi-kind inside archiRelationTypeOfArchimate propagates archimate-kind-missing
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        archimateSource: { archimateTypeId: "grouping", properties: {} },
      }),
      "archimate-kind-missing",
      "/archimateSource/properties/archi-kind",
    );
    // Access relationship missing or mismatched accessMode
    const accAppendFwd = archimateRelationshipOf({
      relationType: "accesses",
      mode: "append",
      source: { kind: "runtime", form: "cli" },
      target: { kind: "store", form: "jsonl" },
    });
    expect(accAppendFwd.ok).toBe(true);
    if (accAppendFwd.ok) {
      const { accessMode: _omitAcc, ...accWithoutMode } = accAppendFwd.value;
      void _omitAcc;
      expectArchimateRefusal(
        archiRelationTypeOfArchimate(accWithoutMode),
        "archi-input-invalid",
        "/accessMode",
      );
      expectArchimateRefusal(
        archiRelationTypeOfArchimate({
          ...accAppendFwd.value,
          accessMode: "read",
        }),
        "archi-input-invalid",
        "/accessMode",
      );
    }
    // Optional field disagreement on relationship (nominalTypeId mismatch)
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        nominalTypeId: "flow",
      }),
      "archi-input-invalid",
      "/nominalTypeId",
    );
    // archi-mode outside accesses on reverse relationship
    expectArchimateRefusal(
      archiRelationTypeOfArchimate({
        ...usesFwd.value,
        properties: { "archi-relation-type": "uses", "archi-mode": "read" },
      }),
      "archi-input-invalid",
      "/properties/archi-mode",
    );

    // 6. Identifier vs archi-ref mismatch ("/identifier"), evidence-slot gaps, and out-of-scope / out-of-appliesTo properties
    expectArchimateRefusal(
      archiAttributesOfArchimate(
        { "archi-ref": "document:archi-joint" },
        { identifier: "document_other" },
      ),
      "archi-input-invalid",
      "/identifier",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate(
        {
          "archi-ref": "entity:sys-h2a",
          "archi-kind": "system",
          "archi-lifecycle": "current",
          "archi-evidence-1": "proof",
        },
        { identifier: "entity_sys-other" },
      ),
      "archi-input-invalid",
      "/identifier",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate(
        {
          "archi-ref": "relation:ro-h2a",
          "archi-relation-type": "runsOn",
          "archi-lifecycle": "current",
          "archi-evidence-1": "proof",
        },
        { identifier: "relation_other" },
      ),
      "archi-input-invalid",
      "/identifier",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate(
        {
          "archi-ref": "relation:ro-h2a",
          "archi-relation-type": "runsOn",
          "archi-lifecycle": "current",
          "archi-evidence-1": "proof",
        },
        { identifier: "entity_ro-h2a" },
      ),
      "archi-input-invalid",
      "/identifier",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate({ "archi-ref": "view:roles", "archi-kind": "" }),
      "archi-input-invalid",
      "/properties/archi-kind",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate(
        {
          "archi-ref": "relation:ro-h2a",
          "archi-relation-type": "runsOn",
          "archi-lifecycle": "current",
          "archi-evidence-1": "proof",
        },
        { kind: "runtime" },
      ),
      "archi-input-invalid",
      "/context/kind",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate(
        { "archi-ref": "view:roles" },
        { identifier: "view_deploiement.-" },
      ),
      "archi-input-invalid",
      "/identifier",
    );
    // Foreign XML identifier matching neither ARCHIMATE_ID_RE nor ARCHIMATE_VIEW_ID_RE is ignored (§3 rule (a))
    const foreignIdOk = archiAttributesOfArchimate(
      { "archi-ref": "view:roles" },
      { identifier: "id-foreign-tool-123" },
    );
    expect(foreignIdOk).toEqual({
      ok: true,
      value: { ref: "view:roles", attributes: {} },
    });

    // Evidence-slot gap: archi-evidence-1 and archi-evidence-3 without archi-evidence-2
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-kind": "system",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof-1",
        "archi-evidence-3": "proof-3",
      }),
      "archi-input-invalid",
      "/properties/archi-evidence-3",
    );
    // Missing required archi-evidence-1
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-kind": "system",
        "archi-lifecycle": "current",
        "archi-evidence-2": "proof-2",
      }),
      "archi-input-invalid",
      "/properties/archi-evidence-1",
    );

    // Out-of-scope properties
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-kind": "system",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof",
        "archi-relation-type": "partOf",
      }),
      "archi-input-invalid",
      "/properties/archi-relation-type",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "view:roles",
        "archi-lifecycle": "current",
      }),
      "archi-input-invalid",
      "/properties/archi-lifecycle",
    );

    // Out-of-appliesTo properties
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-kind": "system",
        "archi-form": "cli",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof",
      }),
      "archi-input-invalid",
      "/properties/archi-form",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "entity:sys-h2a",
        "archi-kind": "system",
        "archi-url": "https://example.com",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof",
      }),
      "archi-input-invalid",
      "/properties/archi-url",
    );
    expectArchimateRefusal(
      archiAttributesOfArchimate({
        "archi-ref": "relation:po-1",
        "archi-relation-type": "partOf",
        "archi-mode": "read",
        "archi-lifecycle": "current",
        "archi-evidence-1": "proof",
      }),
      "archi-input-invalid",
      "/properties/archi-mode",
    );
    expectArchimateRefusal(
      archimatePropertiesOf({
        ref: "entity:sys-h2a",
        kind: "system",
        attributes: {
          url: { kind: "text", value: "https://example.com" },
          lifecycle: { kind: "enum", value: "current" },
          evidence: { kind: "collection", items: [{ kind: "text", value: "proof" }] },
        },
      }),
      "archi-input-invalid",
      "/attributes/url",
    );

    // 7. Recursive Object.isFrozen check on all exported tables and rows
    assertRecursivelyFrozen(ARCHI_ARCHIMATE_DIAGNOSTIC_CODES);
    assertRecursivelyFrozen(ARCHI_ARCHIMATE_ELEMENT_TABLE);
    assertRecursivelyFrozen(ARCHI_ARCHIMATE_RELATIONSHIP_TABLE);
    assertRecursivelyFrozen(ARCHI_ARCHIMATE_PROPERTIES);

    // 8. 38-code value and type drift guards
    expect(ARCHI_DIAGNOSTIC_CODES.filter((c) => c.startsWith("archimate-"))).toEqual([
      ...ARCHI_ARCHIMATE_DIAGNOSTIC_CODES,
    ]);
    expectTypeOf<ArchiArchimateDiagnosticCode>().toEqualTypeOf<
      Extract<ArchiDiagnosticCode, "archimate-kind-missing">
    >();
  });
});
