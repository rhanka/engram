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
  WorkspaceTokenGroup,
} from "./tokens.js";
export { WORKSPACE_TOKEN_GROUPS } from "./tokens.js";
export {
  getWorkspaceTokens,
  getWorkspaceTokensFallback,
  serialiseTokensToCss,
} from "./tokens-fallback.js";
export { tryGetDsTokens } from "./tokens-ds.js";

export type { RenderWorkspaceShellOptions } from "./shell.js";
export { renderWorkspaceShell } from "./shell.js";

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
