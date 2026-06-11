/**
 * WP9 agent-stats — h2a instance registry loader + matcher.
 *
 * `.h2a/registry/instances.jsonl` lines (verified):
 *   { id:"host:name:hash12", workspace:{ path, host, label }, name, ... }
 * The `id` is the agent identity we want to attribute work to. We match a
 * session to an instance by (host, workspace.path) — the session's cwd (or a
 * worktree under it) lands inside the registered workspace path.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToTilde } from "./normalize.js";
import type { AgentHost } from "./types.js";

export interface H2aInstance {
  id: string;
  host: string;
  name: string;
  workspacePath: string;
  label: string;
}

/** Load registered h2a instances for a repo root (returns [] if none). */
export function loadH2aInstances(repoRoot: string): H2aInstance[] {
  const file = join(repoRoot, ".h2a", "registry", "instances.jsonl");
  if (!existsSync(file)) return [];
  const out: H2aInstance[] = [];
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let r: any;
    try {
      r = JSON.parse(t);
    } catch {
      continue;
    }
    const ws = r?.workspace ?? {};
    if (typeof r?.id === "string") {
      out.push({
        id: r.id,
        host: typeof ws.host === "string" ? ws.host : r.id.split(":")[0],
        name: typeof r.name === "string" ? r.name : r.id.split(":")[1] ?? r.id,
        workspacePath: typeof ws.path === "string" ? ws.path : "",
        label: typeof ws.label === "string" ? ws.label : "",
      });
    }
  }
  return out;
}

/**
 * Find the registered instance for a (host, cwds) pair. A session matches when
 * any of its cwds is at or under a registered workspace path AND the host
 * matches. Returns the most-specific (longest workspacePath) match, or null.
 */
export function matchInstance(
  instances: H2aInstance[],
  host: AgentHost,
  cwds: string[],
  home = homedir(),
): H2aInstance | null {
  // Session cwds are stored tilde-normalized for privacy; normalize the
  // registered workspace path the same way before comparing.
  const normCwds = cwds.map((c) => pathToTilde(c, home));
  let best: H2aInstance | null = null;
  let bestWsLen = -1;
  for (const inst of instances) {
    if (inst.host !== host) continue;
    if (!inst.workspacePath) continue;
    const ws = pathToTilde(inst.workspacePath, home);
    for (const cwd of normCwds) {
      if (cwd === ws || cwd.startsWith(ws + "/")) {
        if (!best || ws.length > bestWsLen) {
          best = inst;
          bestWsLen = ws.length;
        }
      }
    }
  }
  return best;
}
