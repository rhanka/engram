// Proposed archi-cards@1 slot projection, status marks, detail fitting, footer derivation and legend carriage
// (spec/SPEC_EVOL_ARCHI_CARDS.md §3.2–§3.7, §3.9, §5.5; PROTO:44-200, :224-266, :333-376).
import { digestOfPreimage } from "./canonical.js";
import { sortDiagnostics, type EngramDiagnostic } from "./diagnostics.js";
import type { NativeSemanticDocument, NativeViewDocument } from "./diagram-native-types.js";
import { CONTRACT_PIN } from "./diagram-registry.js";
import type { Pin } from "./types.js";
import type { ArchiLanguage } from "./archi-check.js";
import {
  ARCHI_CARDS_CONTENT,
  type ArchiCardKind,
  type ArchiCardsContent,
  type ArchiIconName,
  type ArchiKind,
  type ArchiLanguageLabels,
  type ArchiLifecycle,
} from "./archi-cards-data.js";
import {
  layoutArchiLines,
  measureArchiText,
  type ArchiMeasuredSlotName,
  type ArchiSlotMeasurement,
} from "./archi-metrics.js";

type NativeEntity = NativeSemanticDocument["entities"][string];
type NativeRelation = NativeSemanticDocument["relations"][string];

const FAMILY = "archi@1";
const LEGEND_FAMILY = "generic@2";
const esc = (t: string): string => t.replace(/~/g, "~0").replace(/\//g, "~1");

/** proposed: container kinds in archi@1 (§2.1, §3.2; PROTO:28). */
export const ARCHI_CONTAINER_KINDS: ReadonlySet<string> = new Set(["system", "repo", "package", "host"]);

/** proposed: the four active hierarchies supported by archi@1 views (§2.4, §5.2). */
export type ArchiActiveHierarchy =
  | "archi-composition"
  | "archi-source"
  | "archi-deployment"
  | "archi-dossier-hosts";

/** proposed: text slots on an archi-cards@1 projected entity (§3.2). */
export interface ArchiEntityTextSlots {
  /** Absent when status === "current" and shortName is unset; consumer resolves text.title ?? entity.attributes.name.value (§3.2, m-r2-1). */
  readonly title?: string;
  readonly kicker?: string;
  readonly body?: string;
  readonly detail?: string;
  readonly subtitle?: string;
  readonly footer?: string;
}

/** proposed: resolved render-facing text slots on an archi-cards@1 projected entity where title is always a string (`text.title ?? entity.attributes.name.value`; §3.2, m-r2-1). */
export interface ArchiRenderEntityTextSlots extends ArchiEntityTextSlots {
  readonly title: string;
}

/** proposed: single entity entry inside view.presentation.diagram.entities (§3.2, §3.7). */
export interface ArchiPresentationEntity {
  readonly form: "card" | "container" | "legend" | "legend-key";
  readonly text: ArchiEntityTextSlots;
  readonly icon?: ArchiIconName | string;
  readonly categoryRef?: string;
}

/** proposed: diagram-presentation@1 payload produced by projectArchiCards (§3.1, §3.2, §3.7). */
export interface ArchiDiagramPresentation {
  readonly contractPin: Pin;
  readonly entities: Readonly<Record<string, ArchiPresentationEntity>>;
  readonly legends: Readonly<Record<string, { readonly order: readonly string[] }>>;
  readonly categoryTokens: readonly {
    readonly legendRef: string;
    readonly category: string;
    readonly token: string;
  }[];
}

/** proposed: per-slot line measurements for one occurrence, keyed by "<state>.<slot>" (§3.9). */
export type ArchiOccurrenceMeasures = Readonly<Record<string, ArchiSlotMeasurement>>;

/** proposed: per-occurrence line measurements for a view (§3.9). */
export type ArchiViewMeasures = Readonly<Record<string, ArchiOccurrenceMeasures>>;

/** proposed: DS render options for one archi occurrence (P-2 r3 §3.1, §6). */
export interface ArchiOccurrenceRenderOptions {
  readonly proposed?: true;
  readonly toggleLabel?: string;
}

/** proposed: per-occurrence DS render options for a view, emitted beside diagram and measures (P-2 r3 §6, §10 A4). */
export type ArchiViewRenderOptions = Readonly<Record<string, ArchiOccurrenceRenderOptions>>;

/** proposed: view binding input for projectArchiCards and checkArchiView (§2.4, §3.2, §3.7, §5.4). */
export interface ArchiProjectionBinding {
  readonly activeHierarchy: ArchiActiveHierarchy;
  readonly language: ArchiLanguage;
  readonly contractPin?: Pin;
  readonly presentationContractPin?: Pin;
  readonly cardsPin?: Pin;
  readonly legendRef?: string;
}

/** proposed: discriminated result of projectArchiCards (§3.2; P-2 r3 §6). */
export type ArchiCardsProjectionResult =
  | {
      readonly outcome: "ok";
      readonly diagram: ArchiDiagramPresentation;
      readonly measures: ArchiViewMeasures;
      readonly renderOptions: ArchiViewRenderOptions;
    }
  | {
      readonly outcome: "refused";
      readonly diagnostics: readonly EngramDiagnostic[];
    };

/** proposed: worst lifecycle helper (retired > proposed > current; §3.6, PROTO:44). */
export function worstArchiLifecycle(...values: readonly (ArchiLifecycle | string | undefined)[]): ArchiLifecycle {
  if (values.includes("retired")) return "retired";
  if (values.includes("proposed")) return "proposed";
  return "current";
}

/** proposed: append status marker « (cible) » / « (retiré) » when status !== "current" (§3.6, PROTO:45). */
export function markArchiStatus(
  text: string,
  status: ArchiLifecycle,
  language: ArchiLanguage = "fr",
  cards: ArchiCardsContent = ARCHI_CARDS_CONTENT,
): string {
  if (status === "current") return text;
  return `${text} (${cards.labels[language].status[status]})`;
}

/** Internal semantic model of the archi@1 family only (J3: other families are never read by archi checks; PROTO:48-81). */
export function buildArchiSemanticModel(doc: NativeSemanticDocument) {
  const ents: Record<string, NativeEntity> = {};
  for (const [id, e] of Object.entries(doc.entities)) {
    if (e.profile === FAMILY) ents[id] = e;
  }
  const rels = Object.values(doc.relations).filter((r) => r.profile === FAMILY);
  const end = (r: NativeRelation, role: string): string | undefined =>
    r.endpoints.find((p) => p.role === role)?.target;
  const outRel = (type: string, id: string): NativeRelation[] =>
    rels.filter((r) => r.type === type && end(r, "source") === id);
  const intoRel = (type: string, id: string): NativeRelation[] =>
    rels.filter((r) => r.type === type && end(r, "target") === id);
  const out = (type: string, id: string): string[] =>
    outRel(type, id).map((r) => end(r, "target")).filter((x): x is string => Boolean(x));
  const into = (type: string, id: string): string[] =>
    intoRel(type, id).map((r) => end(r, "source")).filter((x): x is string => Boolean(x));
  const attr = (id: string, name: string): string | undefined => {
    const a = ents[id]?.attributes[name] as { readonly value?: unknown } | undefined;
    return typeof a?.value === "string" ? a.value : undefined;
  };
  const kindOf = (id: string): string | undefined => ents[id]?.type;
  const isArchi = (id: string): boolean => ents[id] !== undefined;
  const life = (r: NativeRelation): ArchiLifecycle => {
    const v = (r.attributes["lifecycle"] as { readonly value?: unknown } | undefined)?.value;
    return v === "proposed" || v === "retired" ? v : "current";
  };
  const lifeE = (id: string): ArchiLifecycle => {
    const v = attr(id, "lifecycle");
    return v === "proposed" || v === "retired" ? v : "current";
  };
  const parent = (id: string): string | undefined => out("partOf", id)[0];
  const repoPath = (
    id: string,
    seen = new Set<string>(),
  ): { readonly repo: string; readonly rels: readonly NativeRelation[] } | undefined => {
    if (seen.has(id)) return undefined;
    seen.add(id);
    const mi = outRel("managedIn", id)[0];
    if (mi) {
      const tgt = end(mi, "target");
      return tgt ? { repo: tgt, rels: [mi] } : undefined;
    }
    const po = outRel("partOf", id)[0];
    if (!po) return undefined;
    const tgt = end(po, "target");
    const up = tgt ? repoPath(tgt, seen) : undefined;
    return up ? { repo: up.repo, rels: [po, ...up.rels] } : undefined;
  };
  const repo = (id: string): string | undefined => repoPath(id)?.repo;
  const title = (id: string): string => attr(id, "shortName") ?? attr(id, "name") ?? id;
  const mode = (r: NativeRelation): string | undefined => {
    const a = r.attributes["mode"] as { readonly value?: unknown } | undefined;
    return typeof a?.value === "string" ? a.value : undefined;
  };
  const writerRels = (id: string): NativeRelation[] =>
    rels.filter(
      (r) =>
        r.type === "accesses" &&
        end(r, "target") === id &&
        ["append", "write"].includes(mode(r) ?? ""),
    );
  const writers = (id: string): string[] => [
    ...new Set(writerRels(id).map((r) => end(r, "source")).filter((x): x is string => Boolean(x))),
  ];
  const rootSystem = (id: string): string => {
    let x = id;
    while (parent(x) && kindOf(parent(x)!) === "system") x = parent(x)!;
    return x;
  };
  return {
    doc,
    ents,
    rels,
    end,
    outRel,
    intoRel,
    out,
    into,
    attr,
    kindOf,
    isArchi,
    life,
    lifeE,
    parent,
    repoPath,
    repo,
    title,
    mode,
    writerRels,
    writers,
    rootSystem,
  };
}

export type ArchiSemanticModel = ReturnType<typeof buildArchiSemanticModel>;

/** Relation drawing policy: one encoding per (relation, source kind) (§2.3; PROTO:84-96). */
export function archiRelationEncoding(
  m: ArchiSemanticModel,
  r: NativeRelation,
): "structure" | "detail" | "arrow" {
  const s = m.end(r, "source");
  const t = m.end(r, "target");
  const sk = s ? m.kindOf(s) : undefined;
  if (
    r.type === "partOf" ||
    r.type === "managedIn" ||
    r.type === "runsOn" ||
    r.type === "ownedBy" ||
    r.type === "operatedBy"
  ) {
    return "structure";
  }
  if (r.type === "executedBy" && sk === "component") return "detail";
  if (r.type === "loadedBy" && sk === "artifact") return "detail";
  if (r.type === "providesApi" || r.type === "uses") return "detail";
  if (r.type === "accesses") {
    const md = m.mode(r);
    if (md === "read") return "detail";
    return (t ? m.attr(t, "writerPolicy") : undefined) === "single-writer" ? "structure" : "arrow";
  }
  return "arrow";
}

/** Nearest drawn ancestor in the active tree, with the relations that place it (§2.4, §3.6; PROTO:224-251, KR7:150-160). */
export function archiPlacement(
  m: ArchiSemanticModel,
  id: string,
  active: ArchiActiveHierarchy,
  drawn: ReadonlySet<string>,
): { readonly parent: string | undefined; readonly rels: readonly NativeRelation[] } {
  let effectiveActive: ArchiActiveHierarchy = active;
  if (effectiveActive === "archi-dossier-hosts") {
    if (!m.parent(id) && m.kindOf(id) === "runtime" && m.attr(id, "form") === "cli") {
      const ro = m.outRel("runsOn", id)[0];
      const host = ro ? m.end(ro, "target") : undefined;
      if (ro && host && drawn.has(host)) {
        return { parent: host, rels: [ro] };
      }
    }
    effectiveActive = "archi-composition";
  }
  if (effectiveActive === "archi-source") {
    if (m.kindOf(id) === "repo") return { parent: undefined, rels: [] };
    const path = m.repoPath(id);
    const r = path?.repo;
    const rels: NativeRelation[] = [];
    for (let x = id; ; ) {
      const po = m.outRel("partOf", x)[0];
      if (!po) break;
      const p = m.end(po, "target");
      if (!p || m.repo(p) !== r) break;
      rels.push(po);
      if (drawn.has(p)) return { parent: p, rels };
      x = p;
    }
    return r && drawn.has(r) && path ? { parent: r, rels: path.rels } : { parent: undefined, rels: [] };
  }
  const relType = effectiveActive === "archi-deployment" ? "runsOn" : "partOf";
  const rels: NativeRelation[] = [];
  for (let x = id; ; ) {
    const h = m.outRel(relType, x)[0];
    if (!h) break;
    rels.push(h);
    const p = m.end(h, "target");
    if (!p) break;
    if (drawn.has(p)) return { parent: p, rels };
    x = p;
  }
  return { parent: undefined, rels: [] };
}

/** generic@2 legend keys of one legend: category → key entity (§3.7; PROTO:257-266). */
export function legendKeys(doc: NativeSemanticDocument, legendRef: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const r of Object.values(doc.relations)) {
    if (r.profile !== LEGEND_FAMILY || r.type !== "contains") continue;
    const p = r.endpoints.find((e) => e.role === "parent")?.target;
    const c = r.endpoints.find((e) => e.role === "child")?.target;
    const key = c ? doc.entities[c] : undefined;
    const cat = (key?.attributes["category"] as { readonly value?: unknown } | undefined)?.value;
    if (p === legendRef && key?.profile === LEGEND_FAMILY && key.type === "legend-key" && typeof cat === "string" && c) {
      keys.set(cat, c);
    }
  }
  return keys;
}

function itemText(
  m: ArchiSemanticModel,
  id: string,
  relsToIt: readonly NativeRelation[],
  language: ArchiLanguage,
  cards: ArchiCardsContent,
): string {
  return markArchiStatus(m.title(id), worstArchiLifecycle(m.lifeE(id), ...relsToIt.map(m.life)), language, cards);
}

function deriveFooter(
  m: ArchiSemanticModel,
  id: string,
  language: ArchiLanguage,
  cards: ArchiCardsContent,
): { readonly absent?: true; readonly text?: string; readonly code?: "archi-footer-missing" | "archi-single-writer" } {
  const L = cards.labels[language].footer;
  const k = m.kindOf(id);
  if (k === "actor") return { absent: true };
  if (k === "store") {
    const w = m.writers(id);
    if (w.length === 0) return { code: "archi-footer-missing" };
    if (m.attr(id, "writerPolicy") === "single-writer") {
      return w.length === 1
        ? { text: `${L.writtenBy}: ${itemText(m, w[0]!, m.writerRels(id), language, cards)}` }
        : { code: "archi-single-writer" };
    }
    return { text: `${L.writtenBy}: ${L.several}` };
  }
  if (k === "service" || k === "host") {
    const r = m.outRel("operatedBy", id)[0];
    const tgt = r ? m.end(r, "target") : undefined;
    return r && tgt ? { text: `${L.operatedBy}: ${itemText(m, tgt, [r], language, cards)}` } : { code: "archi-footer-missing" };
  }
  if (k === "repo") {
    const r = m.outRel("ownedBy", id)[0];
    const tgt = r ? m.end(r, "target") : undefined;
    return r && tgt ? { text: `${L.owner}: ${itemText(m, tgt, [r], language, cards)}` } : { code: "archi-footer-missing" };
  }
  const path = m.repoPath(id);
  if (path) {
    const pk: [string, NativeRelation][] =
      k === "component" || k === "artifact"
        ? m
            .outRel("partOf", id)
            .map((r) => [m.end(r, "target"), r] as const)
            .filter((pair): pair is [string, NativeRelation] => Boolean(pair[0] && m.kindOf(pair[0]) === "package"))
        : k === "runtime"
          ? m
              .intoRel("deployedAs", id)
              .map((r) => [m.end(r, "source"), r] as const)
              .filter((pair): pair is [string, NativeRelation] => Boolean(pair[0]))
          : [];
    pk.sort((a, b) => (m.title(a[0]) < m.title(b[0]) ? -1 : m.title(a[0]) > m.title(b[0]) ? 1 : 0));
    return {
      text: `${L.repo}: ${[
        itemText(m, path.repo, path.rels, language, cards),
        ...pk.map(([p, r]) => itemText(m, p, [r], language, cards)),
      ].join(" · ")}`,
    };
  }
  const r = m.outRel("ownedBy", id)[0];
  const tgt = r ? m.end(r, "target") : undefined;
  if (r && tgt) return { text: `${L.owner}: ${itemText(m, tgt, [r], language, cards)}` };
  return { code: "archi-footer-missing" };
}

function deriveDetailItems(
  m: ArchiSemanticModel,
  id: string,
  language: ArchiLanguage,
  cards: ArchiCardsContent,
): { readonly prefix: string; readonly items: readonly { readonly title: string; readonly status: ArchiLifecycle }[] } | null {
  const k = m.kindOf(id) as ArchiCardKind | undefined;
  const spec = k ? cards.detail[k] : undefined;
  if (!spec) return null;
  const links =
    spec.relation === "accesses.read" || spec.relation === "accesses-read"
      ? m.rels.filter((r) => r.type === "accesses" && m.end(r, "target") === id && m.mode(r) === "read")
      : spec.direction === "out"
        ? m.outRel(spec.relation, id)
        : m.intoRel(spec.relation, id);
  const far = (r: NativeRelation): string | undefined => m.end(r, spec.direction === "out" ? "target" : "source");
  const byEntity = new Map<string, NativeRelation[]>();
  for (const r of links) {
    const f = far(r);
    if (f) byEntity.set(f, [...(byEntity.get(f) ?? []), r]);
  }
  const collator = new Intl.Collator(language);
  const items = [...byEntity].map(([e, rs]) => ({
    title: m.title(e),
    status: worstArchiLifecycle(m.lifeE(e), ...rs.map(m.life)),
  }));
  items.sort((a, b) => collator.compare(a.title, b.title));
  return { prefix: spec.prefix[language], items };
}

function fitDetailItems(
  prefix: string,
  items: readonly { readonly title: string; readonly status: ArchiLifecycle }[],
  available: number,
  language: ArchiLanguage,
  cards: ArchiCardsContent,
): { readonly text: string; readonly shown?: number; readonly overflow?: true } {
  const collator = new Intl.Collator(language);
  const label = (it: { readonly title: string; readonly status: ArchiLifecycle }): string =>
    markArchiStatus(it.title, it.status, language, cards);
  const keep = items.filter((it) => it.status !== "current");
  const rest = items.filter((it) => it.status === "current");
  const textOf = (shown: readonly { readonly title: string; readonly status: ArchiLifecycle }[]): string => {
    const sorted = [...shown].sort((a, b) => collator.compare(a.title, b.title));
    const hidden = items.length - shown.length;
    return `${prefix}: ${sorted.map(label).join(" · ")}${hidden ? ` · +${hidden}` : ""}`;
  };
  for (let n = rest.length; n >= 0; n -= 1) {
    const shown = [...keep, ...rest.slice(0, n)];
    if (shown.length === 0) continue;
    const s = textOf(shown);
    if (measureArchiText(s, 24, "body", cards.metrics.table) <= available) {
      return { text: s, shown: shown.length };
    }
  }
  return { text: textOf(keep.length ? keep : rest.slice(0, 1)), overflow: true };
}

function deriveKicker(m: ArchiSemanticModel, id: string, L: ArchiLanguageLabels): string {
  const k = m.kindOf(id) as ArchiKind;
  const form = m.attr(id, "form");
  if (k === "system") {
    const root = m.rootSystem(id);
    return root === id ? L.kind.system : `${L.kind.system} · ${m.title(root)}`;
  }
  const fl = k === "api" && form === "cli" ? L.form["api.cli"] : form ? L.form[form] : undefined;
  return fl ? `${L.kind[k]} · ${fl}` : L.kind[k];
}

/**
 * proposed: pure archi-cards@1 slot projection over a retained source view (§3.2–§3.7, §3.9; PROTO:336-376).
 *
 * Note on `text.title`: omitted when `status === "current"` and `shortName` is unset; consumers resolve
 * `text.title ?? entity.attributes.name.value` into {@link ArchiRenderEntityTextSlots} (§3.2, m-r2-1).
 *
 * Diagnostic pointers are rooted at the `{ view, measures }` scope (`/view/presentation/diagram/...` and
 * `/measures/<occ>/<state>.<slot>`), plus `/cardsPin` for binding pin verification.
 */
export function projectArchiCards(
  document: NativeSemanticDocument,
  sourceView: NativeViewDocument,
  binding: ArchiProjectionBinding,
  cards: ArchiCardsContent = ARCHI_CARDS_CONTENT,
): ArchiCardsProjectionResult {
  const language = binding.language;
  if (language !== "fr" && language !== "en") {
    return {
      outcome: "refused",
      diagnostics: [
        {
          origin: "engram",
          severity: "error",
          code: "archi-input-invalid",
          nativeCode: "archi-input-invalid",
          message: `Binding language "${String(language)}" is invalid (expected "fr" or "en").`,
          path: "/language",
          subjectRef: sourceView.viewId,
        },
      ],
    };
  }
  const L = cards.labels[language];
  const togglePrefix = L.toggle ?? (language === "fr" ? "Replier ou déplier" : "Collapse or expand");
  const expectedContractPin = binding.presentationContractPin ?? binding.contractPin ?? CONTRACT_PIN;
  const m = buildArchiSemanticModel(document);
  const entities: Record<string, ArchiPresentationEntity> = {};
  const measures: Record<string, ArchiOccurrenceMeasures> = {};
  const renderOptions: Record<string, ArchiOccurrenceRenderOptions> = {};
  const diagnostics: EngramDiagnostic[] = [];

  if (binding.cardsPin !== undefined) {
    const expectedCardsDigest = digestOfPreimage(cards);
    if (
      binding.cardsPin.id !== "archi-cards" ||
      binding.cardsPin.version !== "1" ||
      binding.cardsPin.contentDigest !== expectedCardsDigest
    ) {
      diagnostics.push({
        origin: "engram",
        severity: "error",
        code: "archi-pin-mismatch",
        nativeCode: "archi-pin-mismatch",
        message: `Binding cardsPin does not match archi-cards@1 contentDigest (${expectedCardsDigest}).`,
        path: "/cardsPin",
        subjectRef: "archi-cards@1",
      });
    }
  }

  const governed = sourceView.presentation?.diagram;
  if (
    governed &&
    (governed.contractPin.id !== expectedContractPin.id ||
      governed.contractPin.version !== expectedContractPin.version ||
      governed.contractPin.contentDigest !== expectedContractPin.contentDigest)
  ) {
    diagnostics.push({
      origin: "engram",
      severity: "error",
      code: "archi-pin-mismatch",
      nativeCode: "archi-pin-mismatch",
      message: `Source view ${sourceView.viewId} presentation.diagram.contractPin does not match binding contractPin.`,
      path: "/view/presentation/diagram/contractPin",
      subjectRef: sourceView.viewId,
    });
  }

  const drawn = new Set(Object.values(sourceView.entityOccurrences).map((o) => o.entity).filter(m.isArchi));
  const zonesWithDrawnChild = new Set<string>();
  for (const childId of drawn) {
    const parentId = archiPlacement(m, childId, binding.activeHierarchy, drawn).parent;
    if (parentId !== undefined) {
      zonesWithDrawnChild.add(parentId);
    }
  }
  const keys = binding.legendRef ? legendKeys(document, binding.legendRef) : new Map<string, string>();

  for (const [o, oc] of Object.entries(sourceView.entityOccurrences).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const id = oc.entity;
    if (!m.isArchi(id)) {
      if (governed?.entities?.[o] !== undefined) {
        entities[o] = governed.entities[o] as ArchiPresentationEntity;
      }
      continue;
    }
    const k = m.kindOf(id)! as ArchiKind;
    const container = ARCHI_CONTAINER_KINDS.has(k);
    const status = worstArchiLifecycle(m.lifeE(id), ...archiPlacement(m, id, binding.activeHierarchy, drawn).rels.map(m.life));
    const text: {
      kicker: string;
      title?: string;
      body?: string;
      detail?: string;
      subtitle?: string;
      footer?: string;
    } = { kicker: deriveKicker(m, id, L) };
    const titled = markArchiStatus(m.title(id), status, language, cards);
    if (m.attr(id, "shortName") !== undefined || status !== "current") {
      text.title = titled;
    }
    const role = m.attr(id, "role");
    const f = deriveFooter(m, id, language, cards);
    if (f.code) {
      diagnostics.push({
        origin: "engram",
        severity: "error",
        code: f.code,
        nativeCode: f.code,
        message: `Occurrence ${o} (${id}) failed footer derivation (${f.code}).`,
        path: `/view/presentation/diagram/entities/${esc(o)}/text/footer`,
        nodeId: o,
        subjectRef: o,
      });
    } else if (f.text !== undefined) {
      text.footer = f.text;
    }

    if (container) {
      if (role) {
        text.subtitle = role;
      } else {
        diagnostics.push({
          origin: "engram",
          severity: "error",
          code: "archi-slot-missing",
          nativeCode: "archi-slot-missing",
          message: `Container occurrence ${o} (${id}) is missing required role for subtitle.`,
          path: `/view/presentation/diagram/entities/${esc(o)}/text/subtitle`,
          nodeId: o,
          subjectRef: o,
        });
      }
    } else {
      if (role) {
        text.body = role;
      } else {
        diagnostics.push({
          origin: "engram",
          severity: "error",
          code: "archi-slot-missing",
          nativeCode: "archi-slot-missing",
          message: `Card occurrence ${o} (${id}) is missing required role for body.`,
          path: `/view/presentation/diagram/entities/${esc(o)}/text/body`,
          nodeId: o,
          subjectRef: o,
        });
      }
      const di = deriveDetailItems(m, id, language, cards);
      if (!di || di.items.length === 0) {
        diagnostics.push({
          origin: "engram",
          severity: "error",
          code: "archi-detail-missing",
          nativeCode: "archi-detail-missing",
          message: `Card occurrence ${o} (${id}) has no detail items.`,
          path: `/view/presentation/diagram/entities/${esc(o)}/text/detail`,
          nodeId: o,
          subjectRef: o,
        });
      } else {
        const ft = fitDetailItems(di.prefix, di.items, cards.allocation.card.detail[0], language, cards);
        text.detail = ft.text;
      }
    }

    const slots: Record<string, string | undefined> = {
      kicker: text.kicker,
      title: titled,
      body: text.body,
      detail: text.detail,
      subtitle: text.subtitle,
      footer: text.footer,
    };
    const ms: Record<string, ArchiSlotMeasurement> = {};
    for (const state of container ? (["folded", "expanded"] as const) : (["card"] as const)) {
      for (const [slot, [avail, lines]] of Object.entries(cards.allocation[state]) as [
        ArchiMeasuredSlotName,
        readonly [number, number],
      ][]) {
        const slotText = slots[slot];
        if (slotText === undefined) continue;
        const measured = layoutArchiLines(slotText, slot, avail, lines, language, cards.metrics.table);
        ms[`${state}.${slot}`] = measured;
        if (measured.overflow) {
          const code = container ? "zone-overflow" : "card-overflow";
          const rounded = measured.widths.map((x) => Math.round(x * 10) / 10);
          diagnostics.push({
            origin: "engram",
            severity: "error",
            code,
            nativeCode: code,
            message: `${o} ${state}.${slot} overflows (${measured.lines.length}/${lines} lines, widths [${rounded.join(", ")}] px > ${avail} px).`,
            path: `/measures/${esc(o)}/${state}.${slot}`,
            nodeId: o,
            subjectRef: o,
          });
        }
      }
    }

    const icon: ArchiIconName =
      k === "actor"
        ? m.attr(id, "form") === "agent"
          ? cards.icons.actor.agent
          : cards.icons.actor.default
        : cards.icons[k];
    const entry: {
      form: "card" | "container";
      text: ArchiEntityTextSlots;
      icon: ArchiIconName;
      categoryRef?: string;
    } = {
      form: container ? "container" : "card",
      text,
      icon,
    };
    const cat = m.attr(id, "category");
    if (cat !== undefined) {
      if (keys.has(cat)) {
        entry.categoryRef = keys.get(cat);
      } else {
        diagnostics.push({
          origin: "engram",
          severity: "error",
          code: "archi-category-unbound",
          nativeCode: "archi-category-unbound",
          message: `Occurrence ${o} (${id}) category "${cat}" is not bound in legend ${binding.legendRef ?? "<none>"}.`,
          path: `/view/presentation/diagram/entities/${esc(o)}/categoryRef`,
          nodeId: o,
          subjectRef: o,
        });
      }
    }
    entities[o] = entry;
    measures[o] = ms;
    const ro: { proposed?: true; toggleLabel?: string } = {};
    if (status !== "current") {
      ro.proposed = true;
    }
    if (container && zonesWithDrawnChild.has(id)) {
      ro.toggleLabel = `${togglePrefix} ${m.title(id)}`;
    }
    renderOptions[o] = ro;
  }

  if (diagnostics.length > 0) {
    return {
      outcome: "refused",
      diagnostics: sortDiagnostics(diagnostics) as EngramDiagnostic[],
    };
  }
  return {
    outcome: "ok",
    diagram: {
      contractPin: expectedContractPin,
      entities,
      legends: governed?.legends ?? {},
      categoryTokens: governed?.categoryTokens ?? [],
    },
    measures,
    renderOptions,
  };
}
