// archi-cards@1 fold summaries (J1), V5 archi-summary-missing, 204 ported fold states and H1 hosts-r3 fold states
// (spec/SPEC_EVOL_ARCHI_CARDS.md §3.8, §6.1–§6.2; EV:20-21, :48-56, :124, :130-139, :162-163, :188).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NativeDiagramPresentation, NativeSemanticDocument, NativeViewDocument } from "../src/ontology-guardian/diagram-native-types.js";
import { GENERIC_V2 } from "../src/ontology-guardian/diagram-profiles.js";
import { CONTRACT_PIN } from "../src/ontology-guardian/diagram-registry.js";
import { ARCHI_V1 } from "../src/ontology-guardian/archi-profile.js";
import { ARCHI_CARDS_CONTENT } from "../src/ontology-guardian/archi-cards-data.js";
import {
  projectArchiCards,
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

function sourceOf(doc: NativeSemanticDocument, spec: ArchiViewSpec): NativeViewDocument {
  const raw = buildArchiSourceView(doc, spec);
  const proj = projectArchiCards(doc, raw, bindingFor(spec), ARCHI_CARDS_CONTENT);
  if (proj.outcome !== "ok") {
    throw new Error(`Unexpected projection refusal on ${spec.viewId}: ${JSON.stringify(proj.diagnostics)}`);
  }
  return {
    ...raw,
    presentation: {
      ...raw.presentation,
      diagram: proj.diagram as unknown as NativeDiagramPresentation,
    },
  };
}

function foldTo(ds: ArchiDsPort, doc: NativeSemanticDocument, source: NativeViewDocument, collapsedIds: readonly string[]): NativeViewDocument {
  const summaryLabels = archiSummaries(doc, source, collapsedIds, ds);
  const { summaryLabels: _old, ...bare } = source;
  void _old;
  return ds.projectView(
    doc,
    Object.keys(summaryLabels).length ? { ...bare, summaryLabels } : bare,
    collapsedIds,
  );
}

function formatActiveSummaries(
  ds: Record<string, any>,
  doc: NativeSemanticDocument,
  view: NativeViewDocument,
  registry: unknown,
): string[] {
  const actives = ds.analyzeSummaries(view, doc, { registry }).actives as Map<
    string,
    { key: string; label: string; relationIds: string[] }
  >;
  return [...actives.values()].map(
    (s) =>
      `${s.key.replaceAll("occurrence:o-", "")} ${JSON.stringify(s.label)} ${s.relationIds
        .map((x) => x.replace("relation:", ""))
        .join(",")}`,
  );
}

function dsCodes(list: readonly { readonly severity?: string; readonly code: string; readonly details?: { readonly check?: string } }[]): string[] {
  return [...new Set(list.map((x) => `${x.severity === "warning" ? "W:" : ""}${x.code}${x.details?.check ? `/${x.details.check}` : ""}`))];
}

describe.skipIf(!dsCloneAvailable())(`archi-cards@1 fold summaries, RJ1, N12, 204 states and H1 (tier DS)${dsSkipReason()}`, () => {
  it("reproduces default fold summaries of view:roles, view:roles-replie and view:roles-teintes (EV:20-21, :48-56, :162-163)", async () => {
    const ds = await loadDsDiagramCore();
    const dsPort = ds as unknown as ArchiDsPort;
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);

    // EV:20-21 view:roles
    const rolesSource = sourceOf(FIX_DOC, ROLES_SPEC);
    const rolesFolded = foldTo(dsPort, FIX_DOC, rolesSource, ROLES_SPEC.collapsed.map(archiOccurrenceRef));
    expect(checkArchiView(FIX_DOC, rolesFolded, bindingFor(ROLES_SPEC), dsPort)).toEqual([]);
    expect(formatActiveSummaries(ds, FIX_DOC, rolesFolded, reg1)).toEqual([
      '(rt-h2a,sys-engram,dashed) "appelle · propositions et questions" ca-h2a-memory',
    ]);

    // EV:48-56 view:roles-replie
    const replieSource = sourceOf(FIX_DOC, ROLES_REPLIE_SPEC);
    const replieFolded = foldTo(dsPort, FIX_DOC, replieSource, ROLES_REPLIE_SPEC.collapsed.map(archiOccurrenceRef));
    expect(checkArchiView(FIX_DOC, replieFolded, bindingFor(ROLES_REPLIE_SPEC), dsPort)).toEqual([]);
    expect(formatActiveSummaries(ds, FIX_DOC, replieFolded, reg1)).toEqual([
      '(rt-claude,sys-h2a,solid) "lance · appelle · 3 liaisons" ca-claude,in-hooks,in-mcp-claude',
      '(rt-claude,sys-track,solid) "lance · écritures du suivi" in-track',
      '(rt-codex,sys-h2a,solid) "lance · mcp-serve" in-mcp-codex',
      '(sys-h2a,rt-claude,solid) "chargé par" lb-plugin-claude',
      '(sys-h2a,rt-codex,solid) "chargé par" lb-plugin-codex',
      '(sys-h2a,sys-engram,dashed) "appelle · propositions et questions" ca-h2a-memory',
      '(sys-h2a,sys-track,solid) "dépend de" do-h2a-track',
      '(sys-track,sys-h2a,solid) "exécuté par" eb-track-in-h2a',
    ]);

    // EV:162-163 view:roles-teintes
    const reg2 = ds.createProfileRegistry([ARCHI_V1.declaration, GENERIC_V2.declaration]);
    const teintesSource = sourceOf(TINT_DOC, ROLES_TEINTES_SPEC);
    const teintesFolded = foldTo(dsPort, TINT_DOC, teintesSource, ROLES_TEINTES_SPEC.collapsed.map(archiOccurrenceRef));
    expect(checkArchiView(TINT_DOC, teintesFolded, bindingFor(ROLES_TEINTES_SPEC), dsPort)).toEqual([]);
    expect(formatActiveSummaries(ds, TINT_DOC, teintesFolded, reg2)).toEqual([
      '(rt-h2a,sys-engram,dashed) "appelle · propositions et questions" ca-h2a-memory',
    ]);
  });

  it("N12: per-type summaries on one DS aggregate key refuse with summary-constituents-mismatch and summary-duplicate-key (EV:124)", async () => {
    const ds = await loadDsDiagramCore();
    const dsPort = ds as unknown as ArchiDsPort;
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bind1 = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    const opts1 = { registry: reg1, bindings: bind1 };

    const replieSource = sourceOf(FIX_DOC, ROLES_REPLIE_SPEC);
    const v = clone(foldTo(dsPort, FIX_DOC, replieSource, ROLES_REPLIE_SPEC.collapsed.map(archiOccurrenceRef)));
    const summaries = v.summaryLabels as Record<string, any>;
    const multi = Object.values(summaries).find((x) => (x["relationIds"] as string[]).length > 1)!;
    const { relationOccurrences: _ro, ...plain } = multi;
    void _ro;
    const [firstRel] = multi["relationIds"] as string[];
    summaries[multi["id"]] = { ...plain, relationIds: [firstRel], label: "lance · x" };
    summaries["summary:split"] = {
      ...plain,
      id: "summary:split",
      relationIds: (multi["relationIds"] as string[]).filter((x) => x !== firstRel),
      label: "appelle · y",
    };

    expect(dsCodes(ds.validateView(v, FIX_DOC, opts1))).toEqual([
      "occurrence-endpoint-mismatch/summary-constituents-mismatch",
      "occurrence-endpoint-mismatch/summary-duplicate-key",
    ]);
    expect(ds.analyzeSummaries(v, FIX_DOC, { registry: reg1 }).sourceIssues.map((x: { check: string }) => x.check)).toEqual([
      "summary-constituents-mismatch",
      "summary-duplicate-key",
    ]);
  });

  it("RJ1 T1–T3 and kept definitions → archi-summary-missing × 7 (EV:130-136)", async () => {
    const ds = await loadDsDiagramCore();
    const dsPort = ds as unknown as ArchiDsPort;
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bind1 = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    const opts1 = { registry: reg1, bindings: bind1 };

    const source = sourceOf(FIX_DOC, ROLES_SPEC);

    // RJ1 T1: Rôles + pkg-track (EV:131-133)
    const T1 = [...ROLES_SPEC.collapsed.map(archiOccurrenceRef), archiOccurrenceRef("entity:pkg-track")];
    const greenT1 = foldTo(dsPort, FIX_DOC, source, T1);
    expect(ds.validateView(greenT1, FIX_DOC, opts1)).toEqual([]);
    expect(checkArchiView(FIX_DOC, greenT1, bindingFor(ROLES_SPEC), dsPort)).toEqual([]);
    expect(formatActiveSummaries(ds, FIX_DOC, greenT1, reg1)).toEqual([
      '(pkg-track,rt-track,solid) "déployé comme · documente · 3 liaisons" da-track,dc-branch,dc-track-op',
      '(rt-h2a,sys-engram,dashed) "appelle · propositions et questions" ca-h2a-memory',
    ]);

    // RJ1 T2 kept definitions: Rôles -> tout replié without recomputing summaries (EV:134)
    const T2 = ROLES_REPLIE_SPEC.collapsed.map(archiOccurrenceRef);
    const stale = ds.projectView(
      FIX_DOC,
      { ...source, summaryLabels: archiSummaries(FIX_DOC, source, ROLES_SPEC.collapsed.map(archiOccurrenceRef), dsPort) },
      T2,
    );
    expect(ds.validateView(stale, FIX_DOC, opts1)).toEqual([]);
    const staleDiags = checkArchiView(FIX_DOC, stale, bindingFor(ROLES_SPEC), dsPort);
    expect(staleDiags).toHaveLength(7);
    expect([...new Set(staleDiags.map((d) => d.code))]).toEqual(["archi-summary-missing"]);
    for (const d of staleDiags) {
      expect(d.path).toBe("/summaryLabels");
      expect(d.nodeId).toBeUndefined();
      expect(d.subjectRef).toMatch(/^\(occurrence:o-[a-z0-9-]+,occurrence:o-[a-z0-9-]+,(solid|dashed)\)$/);
    }

    // RJ1 T2 recomputed (EV:135)
    const greenT2 = foldTo(dsPort, FIX_DOC, source, T2);
    expect(ds.validateView(greenT2, FIX_DOC, opts1)).toEqual([]);
    expect(checkArchiView(FIX_DOC, greenT2, bindingFor(ROLES_SPEC), dsPort)).toEqual([]);
    expect(Object.keys(greenT2.summaryLabels ?? {})).toHaveLength(8);

    // RJ1 T3 DS collapse-all set (EV:136)
    const withChild = [
      ...new Set(
        Object.keys(source.entityOccurrences)
          .map((o) => ds.parentOccurrenceOf(source, o) as string | undefined)
          .filter((x): x is string => Boolean(x)),
      ),
    ].sort();
    expect(withChild.map((x) => x.replace("occurrence:o-", ""))).toEqual([
      "pkg-track",
      "sys-engram",
      "sys-h2a",
      "sys-track",
    ]);
    const greenT3 = foldTo(dsPort, FIX_DOC, source, withChild);
    expect(ds.validateView(greenT3, FIX_DOC, opts1)).toEqual([]);
    expect(checkArchiView(FIX_DOC, greenT3, bindingFor(ROLES_SPEC), dsPort)).toEqual([]);
    expect(Object.keys(greenT3.summaryLabels ?? {})).toHaveLength(8);
  });

  it("proves all 204 fold states across the 4 distinct views: 960/960 aggregates labelled, 0 refusals, tints unchanged (EV:137-139, :188)", async () => {
    const ds = await loadDsDiagramCore();
    const dsPort = ds as unknown as ArchiDsPort;
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

    function runAllFoldStates(doc: NativeSemanticDocument, spec: ArchiViewSpec, opts: { registry: unknown; bindings: unknown }) {
      const source = sourceOf(doc, spec);
      const containers = Object.keys(source.entityOccurrences)
        .filter((x) => source.groups[archiGroupId(x)] !== undefined)
        .sort();
      const tints = (v: NativeViewDocument) => {
        const dg = v.presentation.diagram as Record<string, any> | undefined;
        return canon({
          legends: dg?.["legends"],
          categoryTokens: dg?.["categoryTokens"],
          legendFaces: Object.fromEntries(
            Object.entries((dg?.["entities"] ?? {}) as Record<string, any>).filter(
              ([, e]) => e["form"] === "legend" || e["form"] === "legend-key",
            ),
          ),
        });
      };
      const t0 = tints(source);
      const stats = {
        containers: containers.length,
        states: 0,
        validateView: 0,
        presentation: 0,
        archiView: 0,
        projectedAggregates: 0,
        labelled: 0,
        tintChanged: 0,
      };
      for (let mask = 0; mask < 1 << containers.length; mask += 1) {
        const F = containers.filter((_, i) => mask & (1 << i));
        const v = foldTo(dsPort, doc, source, F);
        stats.states += 1;
        if (ds.validateView(v, doc, opts).length > 0) stats.validateView += 1;
        if (ds.validateDiagramPresentation(doc, v, opts).length > 0) stats.presentation += 1;
        if (checkArchiView(doc, v, bindingFor(spec), dsPort).length > 0) stats.archiView += 1;
        const actives = (ds.analyzeSummaries(v, doc, { registry: opts.registry }).actives as Map<string, unknown>).size;
        const summaryCount = Object.keys(v.summaryLabels ?? {}).length;
        stats.projectedAggregates += summaryCount;
        stats.labelled += actives;
        if (tints(v) !== t0) stats.tintChanged += 1;
      }
      return stats;
    }

    const rolesStats = runAllFoldStates(FIX_DOC, ROLES_SPEC, opts1);
    const depStats = runAllFoldStates(FIX_DOC, DEPLOIEMENT_SPEC, opts1);
    const repoStats = runAllFoldStates(FIX_DOC, H2A_REPO_SPEC, opts1);
    const tintStats = runAllFoldStates(TINT_DOC, ROLES_TEINTES_SPEC, opts2);

    // EV:137-139, :188
    expect(rolesStats).toEqual({
      containers: 6,
      states: 64,
      validateView: 0,
      presentation: 0,
      archiView: 0,
      projectedAggregates: 320,
      labelled: 320,
      tintChanged: 0,
    });
    expect(depStats).toEqual({
      containers: 2,
      states: 4,
      validateView: 0,
      presentation: 0,
      archiView: 0,
      projectedAggregates: 0,
      labelled: 0,
      tintChanged: 0,
    });
    expect(repoStats).toEqual({
      containers: 3,
      states: 8,
      validateView: 0,
      presentation: 0,
      archiView: 0,
      projectedAggregates: 0,
      labelled: 0,
      tintChanged: 0,
    });
    expect(tintStats).toEqual({
      containers: 7,
      states: 128,
      validateView: 0,
      presentation: 0,
      archiView: 0,
      projectedAggregates: 640,
      labelled: 640,
      tintChanged: 0,
    });
    expect(rolesStats.states + depStats.states + repoStats.states + tintStats.states).toBe(204);
    expect(rolesStats.labelled + depStats.labelled + repoStats.labelled + tintStats.labelled).toBe(960);
  });

  it("H1: proves hosts-r3 default summaries and all fold states of roles-hosts (128 states) and deploiement-hosts (4 states) (§3.8, §6.2)", async () => {
    const ds = await loadDsDiagramCore();
    const dsPort = ds as unknown as ArchiDsPort;
    const reg1 = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bind1 = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    const opts1 = { registry: reg1, bindings: bind1 };

    const rolesHostsSource = sourceOf(HO_DOC, ROLES_HOSTS_SPEC);
    const rolesHostsDefault = foldTo(
      dsPort,
      HO_DOC,
      rolesHostsSource,
      ROLES_HOSTS_SPEC.collapsed.map(archiOccurrenceRef),
    );
    expect(ds.validateView(rolesHostsDefault, HO_DOC, opts1)).toEqual([]);
    expect(ds.validateDiagramPresentation(HO_DOC, rolesHostsDefault, opts1)).toEqual([]);
    expect(checkArchiView(HO_DOC, rolesHostsDefault, bindingFor(ROLES_HOSTS_SPEC), dsPort)).toEqual([]);

    const defaultSummaries = formatActiveSummaries(ds, HO_DOC, rolesHostsDefault, reg1);
    expect(defaultSummaries).toContain(
      '(host-poste,rt-h2a,solid) "lance · sondage · 8 liaisons" host-agy,host-claude,host-codex,host-gemini,host-hermes,host-muse,host-opencode,host-vibe',
    );
    expect(defaultSummaries).toContain('(host-poste,api-h2a,solid) "appelle · outils h2a_*" ca-claude');
    expect(defaultSummaries).toContain('(host-poste,rt-track,solid) "lance · écritures du suivi" in-track');
    expect(defaultSummaries).toContain(
      '(rt-h2a,sys-engram,dashed) "appelle · propositions et questions" ca-h2a-memory',
    );

    // Exhaustive fold states of both HO views
    for (const [spec, expectedContainers, expectedStates] of [
      [ROLES_HOSTS_SPEC, 7, 128],
      [DEPLOIEMENT_HOSTS_SPEC, 2, 4],
    ] as const) {
      const source = sourceOf(HO_DOC, spec);
      const containers = Object.keys(source.entityOccurrences)
        .filter((x) => source.groups[archiGroupId(x)] !== undefined)
        .sort();
      expect(containers).toHaveLength(expectedContainers);
      let states = 0;
      let projectedAggregates = 0;
      let labelled = 0;
      for (let mask = 0; mask < 1 << containers.length; mask += 1) {
        const F = containers.filter((_, i) => mask & (1 << i));
        const v = foldTo(dsPort, HO_DOC, source, F);
        states += 1;
        expect(ds.validateView(v, HO_DOC, opts1), `${spec.viewId}#${mask}`).toEqual([]);
        expect(ds.validateDiagramPresentation(HO_DOC, v, opts1), `${spec.viewId}#${mask}`).toEqual([]);
        expect(checkArchiView(HO_DOC, v, bindingFor(spec), dsPort), `${spec.viewId}#${mask}`).toEqual([]);
        const actives = (ds.analyzeSummaries(v, HO_DOC, { registry: reg1 }).actives as Map<string, unknown>).size;
        const summaryCount = Object.keys(v.summaryLabels ?? {}).length;
        projectedAggregates += summaryCount;
        labelled += actives;
      }
      expect(states).toBe(expectedStates);
      expect(labelled).toBe(projectedAggregates);
    }
  });
});
