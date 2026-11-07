// archi@1 + archi-cards@1 view checks V1–V4, active-tree placement, legend conservation and DS presentation tests
// (spec/SPEC_EVOL_ARCHI_CARDS.md §2.4, §3.7, §6.1–§6.2; EV:12-19, :40-47, :75-82, :91-98, :118-123, :126-128, :154-161, :186-192).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { NativeDiagramPresentation, NativeSemanticDocument, NativeViewDocument } from "../src/ontology-guardian/diagram-native-types.js";
import { GENERIC_V2 } from "../src/ontology-guardian/diagram-profiles.js";
import { CONTRACT_PIN } from "../src/ontology-guardian/diagram-registry.js";
import { checkViewShapeV2 } from "../src/ontology-guardian/diagram-view-shape.js";
import { ARCHI_V1 } from "../src/ontology-guardian/archi-profile.js";
import { ARCHI_CARDS_CONTENT } from "../src/ontology-guardian/archi-cards-data.js";
import {
  projectArchiCards,
  type ArchiDiagramPresentation,
  type ArchiProjectionBinding,
} from "../src/ontology-guardian/archi-cards.js";
import {
  archiGroupId,
  archiOccurrenceRef,
  archiSummaries,
  buildArchiSourceView,
  checkArchiView,
  type ArchiDsPort,
  type ArchiViewSpec,
} from "../src/ontology-guardian/archi-view.js";
import { dsCloneAvailable, dsSkipReason, loadDsDiagramCore } from "./helpers/ds-executor.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const readDoc = (rel: string): NativeSemanticDocument =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as NativeSemanticDocument;
const readViewSpec = (rel: string): ArchiViewSpec =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as ArchiViewSpec;

const FIX_DOC = readDoc("joint-r2/document.json");
const TINT_DOC = readDoc("joint-r2-teintes/document.json");
const HO_DOC = readDoc("hosts-r3/document.json");

const ROLES_SPEC = readViewSpec("joint-r2/view-specs/roles.json");
const ROLES_REPLIE_SPEC = readViewSpec("joint-r2/view-specs/roles-replie.json");
const DEPLOIEMENT_SPEC = readViewSpec("joint-r2/view-specs/deploiement.json");
const H2A_REPO_SPEC = readViewSpec("joint-r2/view-specs/h2a-repo.json");
const ROLES_TEINTES_SPEC = readViewSpec("joint-r2-teintes/view-specs/roles-teintes.json");
const ROLES_HOSTS_SPEC = readViewSpec("hosts-r3/view-specs/roles-hosts.json");
const DEPLOIEMENT_HOSTS_SPEC = readViewSpec("hosts-r3/view-specs/deploiement-hosts.json");

const clone = <T>(x: T): T => structuredClone(x);
const canon = (x: unknown): string =>
  JSON.stringify(x, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort())
      : v,
  );

function bindingFor(spec: ArchiViewSpec): ArchiProjectionBinding {
  return {
    activeHierarchy: spec.activeHierarchy,
    language: "fr",
    contractPin: CONTRACT_PIN,
    ...(spec.legend ? { legendRef: spec.legend.legendRef } : {}),
  };
}

function buildProjectedSource(doc: NativeSemanticDocument, spec: ArchiViewSpec): {
  source: NativeViewDocument;
  diagram: ArchiDiagramPresentation;
} {
  const raw = buildArchiSourceView(doc, spec);
  const proj = projectArchiCards(doc, raw, bindingFor(spec), ARCHI_CARDS_CONTENT);
  if (proj.outcome !== "ok") {
    throw new Error(`Unexpected projection refusal on ${spec.viewId}: ${JSON.stringify(proj.diagnostics)}`);
  }
  const source: NativeViewDocument = {
    ...raw,
    presentation: {
      ...raw.presentation,
      diagram: proj.diagram as unknown as NativeDiagramPresentation,
    },
  };
  return { source, diagram: proj.diagram };
}

function dsCodes(list: readonly { readonly severity?: string; readonly code: string; readonly details?: { readonly check?: string } }[]): string[] {
  return [...new Set(list.map((x) => `${x.severity === "warning" ? "W:" : ""}${x.code}${x.details?.check ? `/${x.details.check}` : ""}`))];
}

describe("archi@1 view derivation and V1–V4 checks (tier E, §2.4, §6.1–§6.2)", () => {
  it("builds the 5 ported views and 2 HO views with valid shape, 0 archi diagnostics and exact groups/arrows (EV:12-19, :40-47, :75-82, :91-98, :154-161, H1)", () => {
    const cases: readonly [NativeSemanticDocument, ArchiViewSpec][] = [
      [FIX_DOC, ROLES_SPEC],
      [FIX_DOC, ROLES_REPLIE_SPEC],
      [FIX_DOC, DEPLOIEMENT_SPEC],
      [FIX_DOC, H2A_REPO_SPEC],
      [TINT_DOC, ROLES_TEINTES_SPEC],
      [HO_DOC, ROLES_HOSTS_SPEC],
      [HO_DOC, DEPLOIEMENT_HOSTS_SPEC],
    ];
    for (const [doc, spec] of cases) {
      const { source } = buildProjectedSource(doc, spec);
      expect(checkViewShapeV2(source), spec.viewId).toBeNull();
      expect(checkArchiView(doc, source, bindingFor(spec)), spec.viewId).toEqual([]);
    }

    // EV:18-19 groups and arrows for view:roles
    const roles = buildProjectedSource(FIX_DOC, ROLES_SPEC).source;
    const rolesGroups = Object.fromEntries(
      Object.values(roles.entityOccurrences).map((x) => [x.id.replace("occurrence:o-", ""), x.group ?? null]),
    );
    expect(rolesGroups).toEqual({
      "sys-h2a": null,
      "pkg-plugin": "grp.9.o-sys-h2a",
      "pkg-h2a": "grp.9.o-sys-h2a",
      "rt-h2a": "grp.9.o-sys-h2a",
      "api-h2a": "grp.9.o-sys-h2a",
      "sys-track": null,
      "pkg-track": "grp.11.o-sys-track",
      "cmp-control": "grp.11.o-pkg-track",
      "art-track-op": "grp.11.o-pkg-track",
      "art-branch": "grp.11.o-pkg-track",
      "rt-track": "grp.11.o-sys-track",
      "api-track": "grp.11.o-sys-track",
      "sys-engram": null,
      "api-memory": "grp.12.o-sys-engram",
      "svc-live": "grp.12.o-sys-engram",
      "rt-claude": null,
      "rt-codex": null,
      "st-events": null,
    });
    const rolesArrows = Object.values(roles.relationOccurrences)
      .map((r) => r.relation.replace("relation:", "") + ((r.strokeStyle ?? "solid") === "dashed" ? "(dashed)" : ""))
      .sort();
    expect(rolesArrows).toEqual([
      "ca-claude",
      "ca-h2a-memory(dashed)",
      "da-h2a",
      "da-track",
      "dc-branch",
      "dc-track-op",
      "do-h2a-track",
      "eb-track-in-h2a",
      "in-hooks",
      "in-mcp-claude",
      "in-mcp-codex",
      "in-track",
      "lb-plugin-claude",
      "lb-plugin-codex",
    ]);

    // EV:81-82 groups and arrows for view:deploiement
    const dep = buildProjectedSource(FIX_DOC, DEPLOIEMENT_SPEC).source;
    expect(
      Object.fromEntries(Object.values(dep.entityOccurrences).map((x) => [x.id.replace("occurrence:o-", ""), x.group ?? null])),
    ).toEqual({
      "host-poste": null,
      "rt-claude": "grp.12.o-host-poste",
      "rt-codex": "grp.12.o-host-poste",
      "rt-h2a": "grp.12.o-host-poste",
      "rt-guard": "grp.12.o-host-poste",
      "rt-track": "grp.12.o-host-poste",
      "host-cluster": null,
      "svc-live": "grp.14.o-host-cluster",
    });

    // EV:97-98 groups and arrows for view:h2a-repo
    const repoView = buildProjectedSource(FIX_DOC, H2A_REPO_SPEC).source;
    expect(
      Object.fromEntries(Object.values(repoView.entityOccurrences).map((x) => [x.id.replace("occurrence:o-", ""), x.group ?? null])),
    ).toEqual({
      "repo-h2a": null,
      "sys-track": "grp.10.o-repo-h2a",
      "pkg-track": "grp.11.o-sys-track",
      "cmp-control": "grp.11.o-pkg-track",
      "rt-track": "grp.11.o-sys-track",
      "api-track": "grp.11.o-sys-track",
      "st-events": null,
    });
    expect(Object.values(repoView.relationOccurrences).map((r) => r.relation.replace("relation:", ""))).toEqual(["da-track"]);

    // H1 (§6.2): in roles-hosts under archi-dossier-hosts, all 8 CLI roots sit in grp.12.o-host-poste
    const rolesHosts = buildProjectedSource(HO_DOC, ROLES_HOSTS_SPEC).source;
    for (const cli of ["rt-agy", "rt-claude", "rt-codex", "rt-gemini", "rt-hermes", "rt-muse", "rt-opencode", "rt-vibe"]) {
      expect(rolesHosts.entityOccurrences[`occurrence:o-${cli}`]?.group, cli).toBe("grp.12.o-host-poste");
    }
    expect(rolesHosts.entityOccurrences["occurrence:o-rt-h2a"]?.group).toBe("grp.9.o-sys-h2a");
    expect(rolesHosts.entityOccurrences["occurrence:o-rt-track"]?.group).toBe("grp.11.o-sys-track");
  });

  it("N8: detail relation drawn as arrow refuses with archi-edge-policy (EV:120)", () => {
    const { source } = buildProjectedSource(FIX_DOC, ROLES_SPEC);
    const v = clone(source);
    (v.relationOccurrences as Record<string, unknown>)["occurrence:e-pa-h2a"] = {
      id: "occurrence:e-pa-h2a",
      relation: "relation:pa-h2a",
      endpoints: [
        { role: "source", occurrence: archiOccurrenceRef("entity:rt-h2a") },
        { role: "target", occurrence: archiOccurrenceRef("entity:api-h2a") },
      ],
    };
    const diags = checkArchiView(FIX_DOC, v, bindingFor(ROLES_SPEC));
    expect(diags.map((d) => d.code)).toEqual(["archi-edge-policy"]);
    expect(diags[0]!.path).toBe("/relationOccurrences/occurrence:e-pa-h2a");
    expect(diags[0]!.nodeId).toBe("occurrence:e-pa-h2a");
    expect(diags[0]!.subjectRef).toBe("occurrence:e-pa-h2a");
    expect(validPointer(diags[0]!.path!)).toBe(true);
  });

  it("N9: runtime nested in package zone refuses with archi-zone-mismatch (EV:121)", () => {
    const { source } = buildProjectedSource(FIX_DOC, ROLES_SPEC);
    const v = clone(source);
    (v.entityOccurrences[archiOccurrenceRef("entity:rt-track")] as { group?: string }).group = archiGroupId(
      archiOccurrenceRef("entity:pkg-track"),
    );
    const diags = checkArchiView(FIX_DOC, v, bindingFor(ROLES_SPEC));
    expect(diags.map((d) => d.code)).toEqual(["archi-zone-mismatch"]);
    expect(diags[0]!.path).toBe("/entityOccurrences/occurrence:o-rt-track");
    expect(diags[0]!.nodeId).toBe("occurrence:o-rt-track");
    expect(diags[0]!.subjectRef).toBe("occurrence:o-rt-track");
  });

  it("N10: proposed relation drawn solid refuses with archi-stroke-status (EV:122)", () => {
    const { source } = buildProjectedSource(FIX_DOC, ROLES_SPEC);
    const v = clone(source);
    delete (v.relationOccurrences["occurrence:e-ca-h2a-memory"] as { strokeStyle?: string }).strokeStyle;
    const diags = checkArchiView(FIX_DOC, v, bindingFor(ROLES_SPEC));
    expect(diags.map((d) => d.code)).toEqual(["archi-stroke-status"]);
    expect(diags[0]!.path).toBe("/relationOccurrences/occurrence:e-ca-h2a-memory");
    expect(diags[0]!.nodeId).toBe("occurrence:e-ca-h2a-memory");
    expect(diags[0]!.subjectRef).toBe("occurrence:e-ca-h2a-memory");
  });

  it("N11: second occurrence of one entity refuses with archi-occurrence-duplicate (EV:123)", () => {
    const { source } = buildProjectedSource(FIX_DOC, ROLES_SPEC);
    const v = clone(source);
    (v.entityOccurrences as Record<string, unknown>)["occurrence:o-dup"] = {
      ...v.entityOccurrences[archiOccurrenceRef("entity:rt-track")],
      id: "occurrence:o-dup",
    };
    const diags = checkArchiView(FIX_DOC, v, bindingFor(ROLES_SPEC));
    expect(diags.map((d) => d.code)).toEqual(["archi-occurrence-duplicate"]);
    expect(diags[0]!.nodeId).toBe("occurrence:o-dup");
    expect(diags[0]!.subjectRef).toBe("occurrence:o-dup");
  });

  it("N14 (positive) & N14b (negative): component without drawn package nests in system zone; left at root refuses with archi-zone-mismatch (EV:126-128)", () => {
    const spec: ArchiViewSpec = {
      format: "engram.archi-view/1",
      viewId: "view:n14",
      activeHierarchy: "archi-composition",
      draw: ["entity:cmp-control", "entity:rt-track", "entity:sys-track"],
      collapsed: [],
    };
    const { source } = buildProjectedSource(FIX_DOC, spec);
    expect(source.entityOccurrences[archiOccurrenceRef("entity:cmp-control")]?.group).toBe("grp.11.o-sys-track");
    expect(checkArchiView(FIX_DOC, source, bindingFor(spec))).toEqual([]);

    const v = clone(source);
    delete (v.entityOccurrences[archiOccurrenceRef("entity:cmp-control")] as { group?: string }).group;
    const diags = checkArchiView(FIX_DOC, v, bindingFor(spec));
    expect(diags.map((d) => d.code)).toEqual(["archi-zone-mismatch"]);
    expect(diags[0]!.subjectRef).toBe("occurrence:o-cmp-control");
  });

  it("N25: root runtime given a zone group refuses with archi-zone-mismatch (§6.2, AR M-3)", () => {
    const { source } = buildProjectedSource(FIX_DOC, ROLES_SPEC);
    const v = clone(source);
    // rt-claude has no partOf ancestor in archi-composition (expected parent === undefined)
    (v.entityOccurrences[archiOccurrenceRef("entity:rt-claude")] as { group?: string }).group = archiGroupId(
      archiOccurrenceRef("entity:sys-h2a"),
    );
    const diags = checkArchiView(FIX_DOC, v, bindingFor(ROLES_SPEC));
    expect(diags.map((d) => d.code)).toEqual(["archi-zone-mismatch"]);
    expect(diags[0]!.path).toBe("/entityOccurrences/occurrence:o-rt-claude");
    expect(diags[0]!.nodeId).toBe("occurrence:o-rt-claude");
    expect(diags[0]!.subjectRef).toBe("occurrence:o-rt-claude");
  });
});

describe.skipIf(!dsCloneAvailable())(`archi@1 view & presentation DS qualification: N6, N7, N14, N16–N19, RJ3 (tier DS)${dsSkipReason()}`, () => {
  it("validates all 5 ported views, N14 and both HO views with DS validateView [] and validateDiagramPresentation [] (EV:14-15, :42-43, :77-78, :93-94, :127, :156-157, H1)", async () => {
    const ds = await loadDsDiagramCore();
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bind1 = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    const opts1 = { registry: reg1, bindings: bind1 };

    const reg2 = ds.createProfileRegistry([ARCHI_V1.declaration, GENERIC_V2.declaration]);
    const bind2 = {
      schemaVersion: "1",
      rows: [
        ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1"),
        ds.bindingRowFor(GENERIC_V2.declaration, "scoped-constraints@1"),
      ],
    };
    const opts2 = { registry: reg2, bindings: bind2 };

    for (const [doc, spec, opts] of [
      [FIX_DOC, ROLES_SPEC, opts1],
      [FIX_DOC, ROLES_REPLIE_SPEC, opts1],
      [FIX_DOC, DEPLOIEMENT_SPEC, opts1],
      [FIX_DOC, H2A_REPO_SPEC, opts1],
      [TINT_DOC, ROLES_TEINTES_SPEC, opts2],
      [HO_DOC, ROLES_HOSTS_SPEC, opts1],
      [HO_DOC, DEPLOIEMENT_HOSTS_SPEC, opts1],
    ] as const) {
      const { source } = buildProjectedSource(doc, spec);
      const collapsedIds = spec.collapsed.map(archiOccurrenceRef);
      const summaryLabels = collapsedIds.length
        ? archiSummaries(doc, source, collapsedIds, ds as unknown as ArchiDsPort)
        : {};
      const withSums = Object.keys(summaryLabels).length ? { ...source, summaryLabels } : source;
      const displayed = collapsedIds.length ? ds.projectView(doc, withSums, collapsedIds) : source;

      expect(ds.validateView(displayed, doc, opts), spec.viewId).toEqual([]);
      expect(ds.validateDiagramPresentation(doc, displayed, opts), spec.viewId).toEqual([]);
      expect(checkArchiView(doc, displayed, bindingFor(spec), ds as unknown as ArchiDsPort), spec.viewId).toEqual([]);
    }

    // N14 DS validation (EV:127)
    const n14Spec: ArchiViewSpec = {
      format: "engram.archi-view/1",
      viewId: "view:n14",
      activeHierarchy: "archi-composition",
      draw: ["entity:cmp-control", "entity:rt-track", "entity:sys-track"],
      collapsed: [],
    };
    const { source: n14View } = buildProjectedSource(FIX_DOC, n14Spec);
    expect(ds.validateView(n14View, FIX_DOC, opts1)).toEqual([]);
  });

  it("RJ3 conservation: governed tint input = projected source = displayed folded view (EV:186)", async () => {
    const ds = await loadDsDiagramCore();
    const rawGov = buildArchiSourceView(TINT_DOC, ROLES_TEINTES_SPEC).presentation.diagram as Record<string, any>;
    const { source } = buildProjectedSource(TINT_DOC, ROLES_TEINTES_SPEC);
    const collapsedIds = ROLES_TEINTES_SPEC.collapsed.map(archiOccurrenceRef);
    const summaryLabels = archiSummaries(TINT_DOC, source, collapsedIds, ds as unknown as ArchiDsPort);
    const folded = ds.projectView(TINT_DOC, { ...source, summaryLabels }, collapsedIds);

    const pick = (dg: Record<string, any>) =>
      canon({
        legends: dg["legends"],
        categoryTokens: dg["categoryTokens"],
        legendFaces: Object.fromEntries(
          Object.entries(dg["entities"] as Record<string, any>).filter(
            ([, e]) => e["form"] === "legend" || e["form"] === "legend-key",
          ),
        ),
      });

    expect({
      projected: pick(rawGov) === pick(source.presentation.diagram as Record<string, any>),
      folded: pick(rawGov) === pick(folded.presentation.diagram as Record<string, any>),
    }).toEqual({ projected: true, folded: true });
  });

  it("N6 & N7: container drawn as card and service drawn as zone refuse with occurrence-endpoint-mismatch/form-selector-mismatch (EV:118-119)", async () => {
    const ds = await loadDsDiagramCore();
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bind1 = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    const opts1 = { registry: reg1, bindings: bind1 };

    const { source } = buildProjectedSource(FIX_DOC, ROLES_SPEC);

    // N6 (EV:118)
    const v6 = clone(source);
    ((v6.presentation.diagram as Record<string, any>)["entities"][archiOccurrenceRef("entity:sys-track")] as Record<string, unknown>)["form"] = "card";
    expect(dsCodes(ds.validateDiagramPresentation(FIX_DOC, v6, opts1))).toEqual([
      "occurrence-endpoint-mismatch/form-selector-mismatch",
    ]);

    // N7 (EV:119)
    const v7 = clone(source);
    ((v7.presentation.diagram as Record<string, any>)["entities"][archiOccurrenceRef("entity:svc-live")] as Record<string, unknown>)["form"] = "container";
    expect(dsCodes(ds.validateDiagramPresentation(FIX_DOC, v7, opts1))).toEqual([
      "occurrence-endpoint-mismatch/form-selector-mismatch",
    ]);
  });

  it("N16–N19: tint witness negative cases refuse with expected DS codes (EV:189-192)", async () => {
    const ds = await loadDsDiagramCore();
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bind1 = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    const opts1 = { registry: reg1, bindings: bind1 };

    const reg2 = ds.createProfileRegistry([ARCHI_V1.declaration, GENERIC_V2.declaration]);
    const bind2 = {
      schemaVersion: "1",
      rows: [
        ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1"),
        ds.bindingRowFor(GENERIC_V2.declaration, "scoped-constraints@1"),
      ],
    };
    const opts2 = { registry: reg2, bindings: bind2 };

    const { source } = buildProjectedSource(TINT_DOC, ROLES_TEINTES_SPEC);
    const collapsedIds = ROLES_TEINTES_SPEC.collapsed.map(archiOccurrenceRef);
    const view = ds.projectView(
      TINT_DOC,
      { ...source, summaryLabels: archiSummaries(TINT_DOC, source, collapsedIds, ds as unknown as ArchiDsPort) },
      collapsedIds,
    );

    // N16 (EV:189): r1-shaped presentation on the witness
    const v16 = clone(view);
    const dg16 = v16.presentation.diagram as Record<string, any>;
    dg16["legends"] = {};
    dg16["categoryTokens"] = [];
    for (const [o, e] of Object.entries(dg16["entities"] as Record<string, any>)) {
      delete e["categoryRef"];
      if (e["form"] === "legend" || e["form"] === "legend-key") delete dg16["entities"][o];
    }
    const d16 = ds.validateDiagramPresentation(TINT_DOC, v16, opts2);
    expect(dsCodes(d16)).toEqual(["tone-category-unknown"]);
    expect(d16).toHaveLength(6);

    // N17 (EV:190): generic@2 pin omitted, categoryRef kept
    const doc17 = { ...clone(TINT_DOC), profileRefs: ["archi@1"] };
    expect(dsCodes(ds.validateDocument(doc17, opts1))).toEqual(["profile-not-declared"]);
    expect(dsCodes(ds.validateDiagramPresentation(doc17, view, opts1))).toEqual([
      "tone-category-unknown",
      "reference-type-mismatch",
      "occurrence-endpoint-mismatch/form-selector-mismatch",
    ]);

    // N18 (EV:191): two token rows for one (legendRef, category)
    const v18 = clone(view);
    const dg18 = v18.presentation.diagram as Record<string, any>;
    dg18["categoryTokens"].push({ ...dg18["categoryTokens"][0], token: "st-feedback-warning" });
    expect(dsCodes(ds.validateDiagramPresentation(TINT_DOC, v18, opts2))).toEqual([
      "occurrence-endpoint-mismatch/token-binding-conflict",
    ]);

    // N19 (EV:192): cross-family contains (legend -> archi runtime)
    const doc19 = clone(TINT_DOC);
    (doc19.relations as Record<string, unknown>)["relation:ct-cross"] = {
      id: "relation:ct-cross",
      profile: "generic@2",
      type: "contains",
      endpoints: [
        { role: "parent", target: "entity:legend-memoire" },
        { role: "child", target: "entity:rt-h2a" },
      ],
      attributes: {},
    };
    expect(dsCodes(ds.validateDocument(doc19, opts2))).toEqual([
      "endpoint-without-join",
      "legend-key-parent-invalid",
    ]);
  });
});
