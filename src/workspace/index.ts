/**
 * Track G Lot 1 — workspace public surface.
 *
 * Re-exports the workspace token contract, the local fallback, and the
 * optional design-system adapter. The shell module (G2, follow-up) will
 * add `renderWorkspaceShell` here.
 */
export type {
  WorkspaceColourTokens,
  WorkspaceTypographyTokens,
  WorkspaceSpacingTokens,
  WorkspaceRadiusTokens,
  WorkspaceElevationTokens,
  WorkspaceFocusRingTokens,
  WorkspaceTokens,
  WorkspaceThemedTokens,
  WorkspaceTokenSource,
  WorkspaceTheme,
  ResolvedWorkspaceTokens,
  WorkspaceTokenGroup,
} from "./tokens.js";
export { DEFAULT_WORKSPACE_THEME, WORKSPACE_TOKEN_GROUPS } from "./tokens.js";
export {
  getWorkspaceTokens,
  getWorkspaceTokensFallback,
  resolveWorkspaceTokens,
  serialiseTokensToCss,
} from "./tokens-fallback.js";
export { normaliseDesignSystemTokens, tryGetDsTokens } from "./tokens-ds.js";

export type {
  RenderWorkspaceShellOptions,
  WorkspaceDescriptionSidecar,
  WorkspaceEntityLayout,
} from "./shell.js";
export { renderWorkspaceShell } from "./shell.js";

export type { RenderRailOptions, WorkspaceRailLayout } from "./rail.js";
export { renderWorkspaceRail, workspaceRailStyles } from "./rail.js";

export type {
  WorkspaceSelectionState,
  WorkspaceGraphPanelState,
  WorkspaceEvidencePanelState,
  WorkspaceViewState,
  WorkspaceViewerState,
  WorkspaceQuery,
  WorkspaceAction,
} from "./viewer-state.js";
export {
  createDefaultViewerState,
  normalizeViewerState,
  viewerStateToQuery,
  viewerStateFromQuery,
  workspaceReducer,
} from "./viewer-state.js";

export type {
  GraphNodeLike,
  GraphEdgeLike,
  GraphLike,
  FocusSubgraphMetrics,
  FocusSubgraph,
} from "./graph-selection.js";
export { computeFocusSubgraph } from "./graph-selection.js";

export type { RenderGraphPanelOptions } from "./graph-panel.js";
export { renderGraphPanel } from "./graph-panel.js";

export type {
  WorkspaceSearchRecord,
  WorkspaceSearchIndex,
} from "./search-index.js";
export {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  searchWorkspace,
} from "./search-index.js";

export type {
  WorkspaceFacet,
  WorkspaceFacetRecord,
  WorkspaceFacetValue,
  DiscoverFacetsOptions,
} from "./facet-panel.js";
export { discoverWorkspaceFacets, recordMatchesFacets } from "./facet-panel.js";

export type {
  WorkspaceResultRecord,
  WorkspaceResultEntry,
  WorkspaceResultGroup,
  GroupRecordsOptions,
} from "./result-groups.js";
export { groupRecordsByType, countMatchingRecords } from "./result-groups.js";
