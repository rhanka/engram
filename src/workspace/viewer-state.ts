/**
 * Track G Lot 1 / G3 — generic workspace viewer state model.
 *
 * Strips process-std-am domain specifics (no `framework`, no
 * `processes.activeTree="abp"`, no `evidence_modes` hard-coded) and
 * exposes a profile-neutral state. Profile-declared sub-states arrive
 * through a separate adapter (cf SPEC_TRACK_G_WORKSPACE.md > "Resolved
 * decisions" #1: `outputs.workspace.view_state` slot in
 * `ontology-profile.yaml`).
 */

export interface WorkspaceSelectionState {
  /**
   * Selection kind. Free-form so profiles can extend, but the core
   * branches are "overview" | "type" | "members" | "candidate-queue".
   */
  kind: string;
  /** Reference key for the selection (e.g. `selection:all`, `type:Character`). */
  ref: string;
  /** Member entity ids (e.g. for `members` and `candidate-queue`). */
  entityIds: string[];
}

export interface WorkspaceGraphPanelState {
  /** "selection" | "focus" | "overview" — generic enough for any node type. */
  mode: "selection" | "focus" | "overview";
  /** Toggle for INFERRED/AMBIGUOUS edges. */
  showWeakLinks: boolean;
  /** Aggregation strategy ("type" | "community" | "none"). */
  aggregation: "type" | "community" | "none";
  /** BFS radius around `focusEntityId`. Integer ≥ 0. */
  focusHops: number;
}

export interface WorkspaceEvidencePanelState {
  /** Evidence drawer mode ("focus" = only for current focus, "all" = global). */
  mode: "focus" | "all";
}

export interface WorkspaceViewState {
  graph: WorkspaceGraphPanelState;
  evidence: WorkspaceEvidencePanelState;
  /**
   * Free-form, profile-declared extension keys. Graphify core does not
   * interpret these — a profile adapter does. Reserved root keys
   * `graph` and `evidence` are owned by core and cannot be overridden
   * via this slot.
   */
  profileExtensions: Record<string, unknown>;
}

export interface WorkspaceViewerState {
  /** Free-form active view name (default "workspace"). */
  activeView: string;
  /** Active type filter (`"all"` or an ontology node_type id). */
  activeType: string;
  /** Free-form facet state. Keys come from the profile, not Graphify. */
  facetState: Record<string, string>;
  /** Selected node_type ids retained in the workbench memory. */
  selectedTypes: string[];
  /** Selected entity ids retained in the workbench memory. */
  selectedEntities: string[];
  /**
   * What the central display panel renders.
   * Canonical scheme:
   *   "entity:<id>" | "type:<id>" | "taxonomy:<id>" | "candidate:<id>"
   *   | "overview" | null
   * Profiles MAY extend; the resolver decides. Cf SPEC_TRACK_G_WORKSPACE
   * "Resolved decisions" #2 for the candidate fallback policy.
   */
  displayRef: string | null;
  selectionState: WorkspaceSelectionState;
  /** Single-entity focus for the graph panel and the detail drawer. */
  focusEntityId: string | null;
  /** Whether the detail drawer is open. */
  drawerOpen: boolean;
  viewState: WorkspaceViewState;
}

const DEFAULT_FACET_STATE: Record<string, string> = Object.freeze({});

const DEFAULT_GRAPH_PANEL_STATE: WorkspaceGraphPanelState = Object.freeze({
  mode: "selection",
  showWeakLinks: false,
  aggregation: "type",
  focusHops: 1,
});

const DEFAULT_EVIDENCE_PANEL_STATE: WorkspaceEvidencePanelState = Object.freeze({
  mode: "focus",
});

const DEFAULT_SELECTION_STATE: WorkspaceSelectionState = Object.freeze({
  kind: "overview",
  ref: "selection:all",
  entityIds: Object.freeze([]) as unknown as string[],
});

/** Returns a fresh deep copy of the default workspace state. */
export function createDefaultViewerState(): WorkspaceViewerState {
  return {
    activeView: "workspace",
    activeType: "all",
    facetState: { ...DEFAULT_FACET_STATE },
    selectedTypes: [],
    selectedEntities: [],
    displayRef: null,
    selectionState: {
      kind: DEFAULT_SELECTION_STATE.kind,
      ref: DEFAULT_SELECTION_STATE.ref,
      entityIds: [],
    },
    focusEntityId: null,
    drawerOpen: false,
    viewState: {
      graph: { ...DEFAULT_GRAPH_PANEL_STATE },
      evidence: { ...DEFAULT_EVIDENCE_PANEL_STATE },
      profileExtensions: {},
    },
  };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && Number.isFinite(value);
}

function isGraphMode(value: unknown): value is WorkspaceGraphPanelState["mode"] {
  return value === "selection" || value === "focus" || value === "overview";
}

function isGraphAggregation(value: unknown): value is WorkspaceGraphPanelState["aggregation"] {
  return value === "type" || value === "community" || value === "none";
}

function isEvidenceMode(value: unknown): value is WorkspaceEvidencePanelState["mode"] {
  return value === "focus" || value === "all";
}

/** Coerces an arbitrary partial into a valid WorkspaceViewerState, applying defaults for missing/invalid fields. */
export function normalizeViewerState(partial: unknown = {}): WorkspaceViewerState {
  const base = createDefaultViewerState();
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return base;
  const p = partial as Partial<WorkspaceViewerState> & Record<string, unknown>;

  if (typeof p.activeView === "string") base.activeView = p.activeView;
  if (typeof p.activeType === "string") base.activeType = p.activeType;

  if (p.facetState && typeof p.facetState === "object" && !Array.isArray(p.facetState)) {
    for (const [k, v] of Object.entries(p.facetState as Record<string, unknown>)) {
      if (typeof v === "string") base.facetState[k] = v;
    }
  }

  base.selectedTypes = uniqueStrings(p.selectedTypes);
  base.selectedEntities = uniqueStrings(p.selectedEntities);

  if (typeof p.displayRef === "string" && p.displayRef.trim()) {
    base.displayRef = p.displayRef.trim();
  } else if (p.displayRef === null) {
    base.displayRef = null;
  }

  if (p.selectionState && typeof p.selectionState === "object") {
    const s = p.selectionState as Partial<WorkspaceSelectionState>;
    if (typeof s.kind === "string" && s.kind) base.selectionState.kind = s.kind;
    if (typeof s.ref === "string" && s.ref) base.selectionState.ref = s.ref;
    base.selectionState.entityIds = uniqueStrings(s.entityIds);
  }

  if (typeof p.focusEntityId === "string" && p.focusEntityId.trim()) {
    base.focusEntityId = p.focusEntityId.trim();
  } else if (p.focusEntityId === null) {
    base.focusEntityId = null;
  }

  base.drawerOpen = Boolean(p.drawerOpen);

  if (p.viewState && typeof p.viewState === "object") {
    const vs = p.viewState as Partial<WorkspaceViewState>;
    if (vs.graph && typeof vs.graph === "object") {
      const g = vs.graph as Partial<WorkspaceGraphPanelState>;
      if (isGraphMode(g.mode)) base.viewState.graph.mode = g.mode;
      if (typeof g.showWeakLinks === "boolean") base.viewState.graph.showWeakLinks = g.showWeakLinks;
      if (isGraphAggregation(g.aggregation)) base.viewState.graph.aggregation = g.aggregation;
      if (isFiniteNonNegativeInt(g.focusHops)) base.viewState.graph.focusHops = g.focusHops;
    }
    if (vs.evidence && typeof vs.evidence === "object") {
      const e = vs.evidence as Partial<WorkspaceEvidencePanelState>;
      if (isEvidenceMode(e.mode)) base.viewState.evidence.mode = e.mode;
    }
    if (vs.profileExtensions && typeof vs.profileExtensions === "object" && !Array.isArray(vs.profileExtensions)) {
      base.viewState.profileExtensions = { ...(vs.profileExtensions as Record<string, unknown>) };
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// URL serialisation
// ---------------------------------------------------------------------------

/**
 * Compact URL query map. Keys are stable; missing values mean "use the
 * default". Inspired by process-std-am viewerStateToQuery but stripped of
 * domain-specific keys (framework/media/docs/tree/expanded/evidence).
 * Profile-declared facet keys are preserved verbatim under a `facet.*`
 * prefix so the round-trip survives without core knowing the schema.
 */
export type WorkspaceQuery = Record<string, string>;

export function viewerStateToQuery(state: WorkspaceViewerState): WorkspaceQuery {
  const n = normalizeViewerState(state);
  const out: WorkspaceQuery = {};
  if (n.activeView !== "workspace") out.view = n.activeView;
  if (n.activeType !== "all") out.type = n.activeType;
  if (n.selectionState.ref !== "selection:all") out.selection = n.selectionState.ref;
  if (n.selectionState.kind !== "overview") out.skind = n.selectionState.kind;
  if (n.selectionState.entityIds.length > 0) out.members = n.selectionState.entityIds.join(",");
  if (n.selectedTypes.length > 0) out.selectedTypes = n.selectedTypes.join(",");
  if (n.selectedEntities.length > 0) out.selectedEntities = n.selectedEntities.join(",");
  if (n.displayRef) out.display = n.displayRef;
  if (n.focusEntityId) out.focus = n.focusEntityId;
  if (n.drawerOpen) out.drawer = "1";
  if (n.viewState.graph.mode !== "selection") out.graph = n.viewState.graph.mode;
  if (n.viewState.graph.showWeakLinks) out.weak = "1";
  if (n.viewState.graph.focusHops !== 1) out.hops = String(n.viewState.graph.focusHops);
  if (n.viewState.graph.aggregation !== "type") out.agg = n.viewState.graph.aggregation;
  if (n.viewState.evidence.mode !== "focus") out.evidence = n.viewState.evidence.mode;
  for (const [k, v] of Object.entries(n.facetState)) {
    if (v && v !== "all") out[`facet.${k}`] = v;
  }
  return out;
}

export function viewerStateFromQuery(query: WorkspaceQuery): WorkspaceViewerState {
  const state = createDefaultViewerState();
  if (query.view) state.activeView = query.view;
  if (query.type) state.activeType = query.type;
  if (query.selection) state.selectionState.ref = query.selection;
  if (query.skind) state.selectionState.kind = query.skind;
  if (query.members) state.selectionState.entityIds = uniqueStrings(query.members.split(","));
  if (query.selectedTypes) state.selectedTypes = uniqueStrings(query.selectedTypes.split(","));
  if (query.selectedEntities) state.selectedEntities = uniqueStrings(query.selectedEntities.split(","));
  if (query.display) state.displayRef = query.display;
  if (query.focus) state.focusEntityId = query.focus;
  if (query.drawer === "1") state.drawerOpen = true;
  if (isGraphMode(query.graph)) state.viewState.graph.mode = query.graph;
  if (query.weak === "1") state.viewState.graph.showWeakLinks = true;
  if (query.hops) {
    const hops = Number.parseInt(query.hops, 10);
    if (isFiniteNonNegativeInt(hops)) state.viewState.graph.focusHops = hops;
  }
  if (isGraphAggregation(query.agg)) state.viewState.graph.aggregation = query.agg;
  if (isEvidenceMode(query.evidence)) state.viewState.evidence.mode = query.evidence;
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith("facet.") && typeof v === "string" && v) {
      state.facetState[k.slice("facet.".length)] = v;
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type WorkspaceAction =
  | { type: "SET_ACTIVE_TYPE"; activeType: string }
  | { type: "SET_DISPLAY_REF"; displayRef: string | null }
  | { type: "SET_FOCUS_ENTITY"; focusEntityId: string | null }
  | { type: "TOGGLE_DRAWER" }
  | { type: "SET_DRAWER_OPEN"; open: boolean }
  | { type: "SET_SELECTION"; kind: string; ref: string; entityIds?: string[] }
  | { type: "SET_GRAPH_MODE"; mode: WorkspaceGraphPanelState["mode"] }
  | { type: "TOGGLE_WEAK_LINKS" }
  | { type: "SET_FOCUS_HOPS"; hops: number }
  | { type: "SET_GRAPH_AGGREGATION"; aggregation: WorkspaceGraphPanelState["aggregation"] }
  | { type: "SET_EVIDENCE_MODE"; mode: WorkspaceEvidencePanelState["mode"] }
  | { type: "SET_FACET"; key: string; value: string }
  | { type: "CLEAR_FACET"; key: string }
  | { type: "PIN_ENTITY"; entityId: string }
  | { type: "UNPIN_ENTITY"; entityId: string }
  | { type: "PIN_TYPE"; typeId: string }
  | { type: "UNPIN_TYPE"; typeId: string }
  | { type: "RESET" };

export function workspaceReducer(
  state: WorkspaceViewerState,
  action: WorkspaceAction,
): WorkspaceViewerState {
  switch (action.type) {
    case "SET_ACTIVE_TYPE":
      return { ...state, activeType: action.activeType };
    case "SET_DISPLAY_REF":
      return { ...state, displayRef: action.displayRef };
    case "SET_FOCUS_ENTITY":
      return { ...state, focusEntityId: action.focusEntityId };
    case "TOGGLE_DRAWER":
      return { ...state, drawerOpen: !state.drawerOpen };
    case "SET_DRAWER_OPEN":
      return { ...state, drawerOpen: action.open };
    case "SET_SELECTION":
      return {
        ...state,
        selectionState: {
          kind: action.kind,
          ref: action.ref,
          entityIds: uniqueStrings(action.entityIds ?? []),
        },
      };
    case "SET_GRAPH_MODE":
      return {
        ...state,
        viewState: {
          ...state.viewState,
          graph: { ...state.viewState.graph, mode: action.mode },
        },
      };
    case "TOGGLE_WEAK_LINKS":
      return {
        ...state,
        viewState: {
          ...state.viewState,
          graph: {
            ...state.viewState.graph,
            showWeakLinks: !state.viewState.graph.showWeakLinks,
          },
        },
      };
    case "SET_FOCUS_HOPS":
      if (!isFiniteNonNegativeInt(action.hops)) return state;
      return {
        ...state,
        viewState: {
          ...state.viewState,
          graph: { ...state.viewState.graph, focusHops: action.hops },
        },
      };
    case "SET_GRAPH_AGGREGATION":
      return {
        ...state,
        viewState: {
          ...state.viewState,
          graph: { ...state.viewState.graph, aggregation: action.aggregation },
        },
      };
    case "SET_EVIDENCE_MODE":
      return {
        ...state,
        viewState: {
          ...state.viewState,
          evidence: { ...state.viewState.evidence, mode: action.mode },
        },
      };
    case "SET_FACET":
      return {
        ...state,
        facetState: { ...state.facetState, [action.key]: action.value },
      };
    case "CLEAR_FACET": {
      const next = { ...state.facetState };
      delete next[action.key];
      return { ...state, facetState: next };
    }
    case "PIN_ENTITY": {
      const id = typeof action.entityId === "string" ? action.entityId.trim() : "";
      if (!id || state.selectedEntities.includes(id)) return state;
      return { ...state, selectedEntities: [...state.selectedEntities, id] };
    }
    case "UNPIN_ENTITY": {
      const id = typeof action.entityId === "string" ? action.entityId.trim() : "";
      if (!id) return state;
      const next = state.selectedEntities.filter((existing) => existing !== id);
      if (next.length === state.selectedEntities.length) return state;
      return { ...state, selectedEntities: next };
    }
    case "PIN_TYPE": {
      const id = typeof action.typeId === "string" ? action.typeId.trim() : "";
      if (!id || state.selectedTypes.includes(id)) return state;
      return { ...state, selectedTypes: [...state.selectedTypes, id] };
    }
    case "UNPIN_TYPE": {
      const id = typeof action.typeId === "string" ? action.typeId.trim() : "";
      if (!id) return state;
      const next = state.selectedTypes.filter((existing) => existing !== id);
      if (next.length === state.selectedTypes.length) return state;
      return { ...state, selectedTypes: next };
    }
    case "RESET":
      return createDefaultViewerState();
    default: {
      // Exhaustiveness check — TS compile error if a case is added without a handler.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
