/**
 * WP9 agent-stats — agent identity resolution.
 *
 * Identity = the h2a instance id (`host:name:hash12`) when the session matches a
 * registered instance, otherwise a SYNTHETIC id `host:<workspace-label>:unregistered`.
 * We NEVER use git author/email for identity — that is the whole WP9 constraint.
 */

import { basename } from "node:path";
import type { H2aInstance } from "./registry.js";
import type { AgentIdentity, SessionFact } from "./types.js";

/** Derive a short workspace label from a session's cwds (best effort). */
function workspaceLabel(fact: SessionFact): string {
  const cwd = fact.cwds[0];
  if (cwd) {
    const base = basename(cwd);
    // Worktree dirs are noisy (agent-<hash>) — fall back to a branch hint.
    if (/^agent-[0-9a-f]+$/.test(base) && fact.branchesObserved[0]) {
      return fact.branchesObserved[0].replace(/[^A-Za-z0-9._-]+/g, "-");
    }
    return base;
  }
  if (fact.host === "agy") return "antigravity";
  return "workspace";
}

/** Resolve the agent identity for a session given an optional registry match. */
export function resolveIdentity(fact: SessionFact, instance: H2aInstance | null): AgentIdentity {
  if (instance) {
    return { agentId: instance.id, host: fact.host, label: instance.label || instance.name, registered: true };
  }
  const label = workspaceLabel(fact);
  return { agentId: `${fact.host}:${label}:unregistered`, host: fact.host, label, registered: false };
}
