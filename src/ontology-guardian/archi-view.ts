// Proposed archi@1 source-view builder, DS fold summaries and view checks V1–V5 over the four active trees
// (spec/SPEC_EVOL_ARCHI_CARDS.md §2.4, §3.8, §5.2, §5.5; PROTO:223-331, :378-426).
import { sortDiagnostics, type EngramDiagnostic } from "./diagnostics.js";
import type {
  NativeDiagramPresentation,
  NativeEntityOccurrence,
  NativeSemanticDocument,
  NativeViewDocument,
} from "./diagram-native-types.js";
import { GENERIC_V2 } from "./diagram-profiles.js";
import { CONTRACT_PIN } from "./diagram-registry.js";
import type { Pin } from "./types.js";
import type { ArchiLanguage, ArchiVerbKey } from "./archi-check.js";
import { ARCHI_V1 } from "./archi-profile.js";
import { ARCHI_CARDS_CONTENT, type ArchiCardsContent } from "./archi-cards-data.js";
import {
  ARCHI_CONTAINER_KINDS,
  archiPlacement,
  archiRelationEncoding,
  buildArchiSemanticModel,
  type ArchiActiveHierarchy,
  type ArchiProjectionBinding,
} from "./archi-cards.js";

type NativeRelation = NativeSemanticDocument["relations"][string];
type NativeRelationOccurrence = NativeViewDocument["relationOccurrences"][string];

const FAMILY = "archi@1";
const esc = (t: string): string => t.replace(/~/g, "~0").replace(/\//g, "~1");

const ROLE_ORDER_BY_PROFILE_TYPE: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["generic@2::contains", ["parent", "child"]],
]);

const REGISTRY_CACHE = new WeakMap<object, unknown>();
function registryForDs(ds: ArchiDsPort): unknown {
  if (!ds.createProfileRegistry) return undefined;
  let cached = REGISTRY_CACHE.get(ds);
  if (cached === undefined) {
    cached = ds.createProfileRegistry([ARCHI_V1.declaration, GENERIC_V2.declaration]);
    REGISTRY_CACHE.set(ds, cached);
  }
  return cached;
}

/** proposed: single summary label entry in view.summaryLabels (§3.8). */
export type ArchiSummaryDefinition = NonNullable<NativeViewDocument["summaryLabels"]>[string];

/** proposed: authored legend token row in an ArchiViewSpec (§5.2). */
export interface ArchiViewSpecLegendToken {
  readonly category: string;
  readonly token: string;
}

/** proposed: authored legend block in an ArchiViewSpec (§5.2). */
export interface ArchiViewSpecLegend {
  readonly legendRef: string;
  readonly title?: string;
  readonly order: readonly string[];
  readonly tokens: readonly ArchiViewSpecLegendToken[];
}

/** proposed: authored ArchiViewSpec shape (§5.2). */
export interface ArchiViewSpec {
  readonly format: "engram.archi-view/1";
  readonly viewId: string;
  readonly activeHierarchy: ArchiActiveHierarchy;
  readonly draw: readonly string[];
  readonly collapsed: readonly string[];
  readonly legend?: ArchiViewSpecLegend;
}

/** proposed: injected DS port for fold projection and summary analysis (§3.8, §6). */
export interface ArchiDsPort {
  projectView(
    document: NativeSemanticDocument,
    view: NativeViewDocument,
    collapsedIds: readonly string[],
  ): NativeViewDocument;
  classifyInternalRelations(
    view: NativeViewDocument,
    document: NativeSemanticDocument,
    collapsedSet: ReadonlySet<string>,
  ): ReadonlySet<string>;
  analyzeSummaries?(
    view: NativeViewDocument,
    document: NativeSemanticDocument,
    options?: { readonly registry?: unknown },
  ): {
    readonly actives: ReadonlyMap<string, unknown>;
    readonly sourceIssues: readonly { readonly id: string; readonly check: string }[];
    readonly conflicts: readonly { readonly id: string; readonly check: string }[];
  };
  createProfileRegistry?(profiles: readonly unknown[]): unknown;
}

/** proposed: derived entity occurrence ref `occurrence:o-<local>` (§5.2; PROTO:253). */
export function archiOccurrenceRef(entityRef: string): string {
  return `occurrence:o-${entityRef.slice(entityRef.indexOf(":") + 1)}`;
}

/** proposed: derived fold group id `grp.<len>.<local>` (§5.2; PROTO:254). */
export function archiGroupId(occurrenceRef: string): string {
  const local = occurrenceRef.slice(occurrenceRef.indexOf(":") + 1);
  return `grp.${local.length}.${local}`;
}

/** proposed: derive the retained source view from an authored ArchiViewSpec (§5.2; PROTO:269-308). */
export function buildArchiSourceView(
  document: NativeSemanticDocument,
  spec: ArchiViewSpec,
  contractPin: Pin = CONTRACT_PIN,
): NativeViewDocument {
  const m = buildArchiSemanticModel(document);
  const drawnSet = new Set(spec.draw.filter(m.isArchi));
  const entityOccurrences: Record<string, NativeEntityOccurrence> = {};
  const groups: Record<string, NativeViewDocument["groups"][string]> = {};
  const govEntities: Record<string, NativeDiagramPresentation["entities"][string]> = {};
  const legends: Record<string, { readonly order: readonly string[] }> = {};
  const categoryTokens: { readonly legendRef: string; readonly category: string; readonly token: string }[] = [];

  spec.draw.forEach((id, i) => {
    const occ = archiOccurrenceRef(id);
    const k = m.kindOf(id);
    const p = archiPlacement(m, id, spec.activeHierarchy, drawnSet).parent;
    const group = p ? archiGroupId(archiOccurrenceRef(p)) : undefined;
    entityOccurrences[occ] = {
      id: occ,
      entity: id,
      geometry: {
        x: 40 + (i % 5) * 320,
        y: 40 + Math.floor(i / 5) * 200,
        width: 280,
        height: 140,
      },
      ...(group ? { group } : {}),
    };
    if (k && ARCHI_CONTAINER_KINDS.has(k)) {
      const gid = archiGroupId(occ);
      groups[gid] = { id: gid, label: m.title(id), collapsed: false, occurrence: occ };
    }
  });

  if (spec.legend) {
    const lg = spec.legend;
    const lo = archiOccurrenceRef(lg.legendRef);
    const gid = archiGroupId(lo);
    entityOccurrences[lo] = {
      id: lo,
      entity: lg.legendRef,
      geometry: { x: 40, y: 760, width: 320, height: 160 },
    };
    groups[gid] = {
      id: gid,
      label: lg.title ?? lg.legendRef,
      collapsed: false,
      occurrence: lo,
    };
    govEntities[lo] = {
      form: "legend",
      text: lg.title ? { title: lg.title } : {},
    };
    lg.order.forEach((ke, idx) => {
      const ko = archiOccurrenceRef(ke);
      entityOccurrences[ko] = {
        id: ko,
        entity: ke,
        geometry: { x: 60 + idx * 90, y: 800, width: 80, height: 32 },
        group: gid,
      };
      govEntities[ko] = {
        form: "legend-key",
        text: {},
      };
    });
    legends[lo] = { order: [...lg.order] };
    for (const row of lg.tokens) {
      categoryTokens.push({ legendRef: lg.legendRef, category: row.category, token: row.token });
    }
  }

  const relationOccurrences: Record<string, NativeRelationOccurrence> = {};
  for (const r of m.rels) {
    const s = m.end(r, "source");
    const t = m.end(r, "target");
    if (!s || !t || !drawnSet.has(s) || !drawnSet.has(t)) continue;
    if (archiRelationEncoding(m, r) !== "arrow") continue;
    const id = `occurrence:e-${r.id.slice(r.id.indexOf(":") + 1)}`;
    relationOccurrences[id] = {
      id,
      relation: r.id,
      endpoints: [
        { role: "source", occurrence: archiOccurrenceRef(s) },
        { role: "target", occurrence: archiOccurrenceRef(t) },
      ],
      ...(m.life(r) !== "current" ? { strokeStyle: "dashed" as const } : {}),
    };
  }

  return {
    viewId: spec.viewId,
    semanticDocumentId: document.documentId,
    revision: document.revision,
    entityOccurrences,
    relationOccurrences,
    portOccurrences: {},
    groups,
    filters: [],
    presentation: {
      camera: { x: 0, y: 0, zoom: 1 },
      ...(spec.legend
        ? {
            diagram: {
              contractPin,
              entities: govEntities,
              legends,
              categoryTokens,
            },
          }
        : {}),
    },
  };
}

interface ProjectedAggregate {
  readonly key: string;
  readonly source: string;
  readonly target: string;
  readonly style: "solid" | "dashed";
  readonly members: NativeRelationOccurrence[];
  readonly rels: NativeRelation[];
  projected: boolean;
}

/** DS aggregate keys (source, target, style) on a projected view (§3.8; PROTO:379-394). */
function projectedAggregates(
  view: NativeViewDocument,
  document: NativeSemanticDocument,
  collapsedIds: readonly string[],
  ds: ArchiDsPort,
): ProjectedAggregate[] {
  const internal = ds.classifyInternalRelations(view, document, new Set(collapsedIds));
  const map = new Map<string, ProjectedAggregate>();
  for (const ro of Object.values(view.relationOccurrences)) {
    if (internal.has(ro.id)) continue;
    const r = document.relations[ro.relation];
    if (!r || ro.endpoints.length !== 2) continue;
    const roles = ROLE_ORDER_BY_PROFILE_TYPE.get(`${r.profile}::${r.type}`) ?? ["source", "target"];
    const first = ro.endpoints.find((e) => e.role === roles[0]);
    const second = ro.endpoints.find((e) => e.role === roles[1]);
    const [s, t] =
      first && second
        ? [first.occurrence, second.occurrence]
        : [ro.endpoints[0]!.occurrence, ro.endpoints[1]!.occurrence];
    const style: "solid" | "dashed" = ro.strokeStyle ?? "solid";
    const key = `(${s},${t},${style})`;
    const cur: ProjectedAggregate = map.get(key) ?? {
      key,
      source: s,
      target: t,
      style,
      members: [],
      rels: [],
      projected: false,
    };
    cur.members.push(ro);
    cur.rels.push(r);
    if (ro.endpoints.some((e) => e.semanticTarget !== undefined)) cur.projected = true;
    map.set(key, cur);
  }
  return [...map.values()].filter((x) => x.projected);
}

function verbKeyForRelation(r: NativeRelation): ArchiVerbKey {
  if (r.type === "accesses") {
    const mode = (r.attributes["mode"] as { readonly value?: unknown } | undefined)?.value;
    return mode === "append" ? "accesses.append" : "accesses.write";
  }
  if (r.type === "invokes") {
    const trig = (r.attributes["trigger"] as { readonly value?: unknown } | undefined)?.value;
    return trig === "poll" ? "invokes.poll" : "invokes";
  }
  return r.type as ArchiVerbKey;
}

/** proposed: recompute fold summary definitions per DS aggregate key (source, target, style) (§3.8; PROTO:396-412). */
export function archiSummaries(
  document: NativeSemanticDocument,
  sourceView: NativeViewDocument,
  collapsed: readonly string[],
  ds: ArchiDsPort,
  cards: ArchiCardsContent = ARCHI_CARDS_CONTENT,
  language: ArchiLanguage = "fr",
): Readonly<Record<string, ArchiSummaryDefinition>> {
  const { summaryLabels: _old, ...bare } = sourceView;
  void _old;
  const projected = ds.projectView(document, bare, collapsed);
  const V = cards.labels[language].verb;
  const verbOrder = cards.verbOrder;
  const out: Record<string, ArchiSummaryDefinition> = {};
  let i = 0;
  for (const x of projectedAggregates(projected, document, collapsed, ds).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  )) {
    i += 1;
    const ids = [...new Set(x.rels.map((r) => r.id))].sort();
    const verbs = [...new Set(x.rels.map(verbKeyForRelation))]
      .sort((a, b) => verbOrder.indexOf(a) - verbOrder.indexOf(b))
      .map((k) => V[k]);
    const singleLabel = (x.rels[0]?.attributes["label"] as { readonly value?: unknown } | undefined)?.value;
    const label =
      ids.length === 1 && typeof singleLabel === "string"
        ? singleLabel
        : `${verbs.join(" · ")} · ${ids.length} ${cards.labels[language].links}`;
    const id = `summary:s-${i}`;
    out[id] = {
      id,
      sourceOccurrence: x.source,
      targetOccurrence: x.target,
      label,
      relationIds: ids,
      relationOccurrences: x.members.map((ro) => ro.id).sort(),
      ...(x.style === "dashed" ? { strokeStyle: "dashed" as const } : {}),
    };
  }
  return out;
}

/** proposed: check an archi view for V1–V5 over the four active trees (§2.4, §3.8, §5.5; PROTO:311-331, :420-426). */
export function checkArchiView(
  document: NativeSemanticDocument,
  view: NativeViewDocument,
  binding: ArchiProjectionBinding,
  ds?: ArchiDsPort,
): readonly EngramDiagnostic[] {
  const m = buildArchiSemanticModel(document);
  const diagnostics: EngramDiagnostic[] = [];
  const byEnt = new Map<string, string>();

  // V1: at most one entityOccurrence per archi@1 entity
  for (const o of Object.values(view.entityOccurrences)) {
    if (!m.isArchi(o.entity)) continue;
    if (byEnt.has(o.entity)) {
      diagnostics.push({
        origin: "engram",
        severity: "error",
        code: "archi-occurrence-duplicate",
        nativeCode: "archi-occurrence-duplicate",
        message: `Entity ${o.entity} has duplicate occurrence ${o.id} (already drawn as ${byEnt.get(o.entity)}).`,
        path: `/entityOccurrences/${esc(o.id)}`,
        nodeId: o.id,
        subjectRef: o.id,
      });
    }
    byEnt.set(o.entity, o.id);
  }

  // V2: occurrence.group must match nearest drawn ancestor in activeHierarchy
  const drawn = new Set(byEnt.keys());
  for (const o of Object.values(view.entityOccurrences)) {
    if (!m.isArchi(o.entity)) continue;
    const expected = archiPlacement(m, o.entity, binding.activeHierarchy, drawn).parent;
    const groupOcc = o.group ? view.groups[o.group]?.occurrence : undefined;
    const actual = groupOcc ? view.entityOccurrences[groupOcc]?.entity : undefined;
    if (expected !== actual) {
      diagnostics.push({
        origin: "engram",
        severity: "error",
        code: "archi-zone-mismatch",
        nativeCode: "archi-zone-mismatch",
        message: `Occurrence ${o.id} (${o.entity}) group parent ${actual ?? "<root>"} does not match nearest drawn ${binding.activeHierarchy} ancestor ${expected ?? "<root>"}.`,
        path: `/entityOccurrences/${esc(o.id)}`,
        nodeId: o.id,
        subjectRef: o.id,
      });
    }
  }

  // V3 & V4: arrow encoding policy and strokeStyle <-> lifecycle
  for (const ro of Object.values(view.relationOccurrences)) {
    const r = document.relations[ro.relation];
    if (!r || r.profile !== FAMILY) continue;
    if (archiRelationEncoding(m, r) !== "arrow") {
      diagnostics.push({
        origin: "engram",
        severity: "error",
        code: "archi-edge-policy",
        nativeCode: "archi-edge-policy",
        message: `Relation occurrence ${ro.id} (${ro.relation}) has encoding "${archiRelationEncoding(m, r)}" and must not be drawn as an arrow.`,
        path: `/relationOccurrences/${esc(ro.id)}`,
        nodeId: ro.id,
        subjectRef: ro.id,
      });
    }
    const dashed = (ro.strokeStyle ?? "solid") === "dashed";
    if (dashed !== (m.life(r) !== "current")) {
      diagnostics.push({
        origin: "engram",
        severity: "error",
        code: "archi-stroke-status",
        nativeCode: "archi-stroke-status",
        message: `Relation occurrence ${ro.id} (${ro.relation}) strokeStyle "${ro.strokeStyle ?? "solid"}" does not match relation lifecycle "${m.life(r)}".`,
        path: `/relationOccurrences/${esc(ro.id)}`,
        nodeId: ro.id,
        subjectRef: ro.id,
      });
    }
  }

  // V5: every projected aggregate edge in a folded view must have an active summaryLabel
  if (ds) {
    const collapsedIds = Object.values(view.groups)
      .filter((g) => g.collapsed && g.occurrence)
      .map((g) => g.occurrence!);
    const registry = registryForDs(ds);
    const activeKeys: ReadonlySet<string> = ds.analyzeSummaries
      ? new Set(
          ds
            .analyzeSummaries(view, document, { registry })
            .actives.keys(),
        )
      : new Set(
          Object.values(view.summaryLabels ?? {}).map(
            (s) => `(${s.sourceOccurrence},${s.targetOccurrence},${s.strokeStyle ?? "solid"})`,
          ),
        );
    for (const x of projectedAggregates(view, document, collapsedIds, ds)) {
      if (!activeKeys.has(x.key)) {
        diagnostics.push({
          origin: "engram",
          severity: "error",
          code: "archi-summary-missing",
          nativeCode: "archi-summary-missing",
          message: `Projected aggregate ${x.key} has no active summaryLabel definition.`,
          path: "/summaryLabels",
          subjectRef: x.key,
        });
      }
    }
  }

  return sortDiagnostics(diagnostics) as EngramDiagnostic[];
}
