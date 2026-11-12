import { createHash } from "node:crypto";
import { canonicalBytes } from "../ontology-guardian/canonical.js";
import type { AppContextNodeType } from "./types.js";

export const APP_CONTEXT_ID_PREFIX: Readonly<Record<AppContextNodeType | "Diagnostic", string>> = {
  Spec: "spec:",
  SpecSection: "specsec:",
  Requirement: "req:",
  TrackWorkpackage: "twp:",
  TrackItem: "titem:",
  TrackDecision: "tdec:",
  DataEntity: "entity:",
  DataField: "field:",
  Route: "route:",
  Component: "comp:",
  ApiEndpoint: "ep:",
  CodeSymbol: "sym:",
  File: "file:",
  Commit: "commit:",
  Branch: "branch:",
  mcp_config_file: "mcpcfg:",
  mcp_server: "mcpsrv:",
  mcp_command: "mcpcmd:",
  mcp_package: "mcppkg:",
  env_var: "env:",
  Diagnostic: "diag:",
};

/**
 * Deterministic, delimiter-collision-free node ID for `app-context@1` (§2.2).
 *
 * Uses RFC 8785 / JCS canonical JSON over the tuple
 * `["app-context@1", repoKey, nodeType, ...seedTuple]`, hashes the UTF-8
 * canonical bytes with SHA-256, and takes the first 32 hex chars (128 bits)
 * prefixed by the node type's human-readable prefix.
 */
export function appContextNodeId(
  repoKey: string,
  nodeType: AppContextNodeType | "Diagnostic",
  seedTuple: readonly string[],
): string {
  const payload = canonicalBytes(["app-context@1", repoKey, nodeType, ...seedTuple]);
  const hex = createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
  return `${APP_CONTEXT_ID_PREFIX[nodeType]}${hex}`;
}
