/**
 * WP9 agent-stats — h2a instance registry loader + matcher.
 *
 * `.h2a/registry/instances.jsonl` lines (verified):
 *   { id:"host:name:hash12", workspace:{ path, host, label }, name, ... }
 * The `id` is the agent identity we want to attribute work to. We match a
 * session to an instance by (host, workspace.path) — the session's cwd (or a
 * worktree under it) lands inside the registered workspace path.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
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

/** Compare strings by Unicode code point rather than locale-specific collation. */
function codePointCompare(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let i = 0; i < left.length && i < right.length; i++) {
    const delta = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (delta !== 0) return delta;
  }
  return left.length - right.length;
}

/** Expand only the tilde form the registry is already documented to accept. */
function expandWorkspacePath(path: string, home: string): string | null {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return isAbsolute(path) ? path : null;
}

/**
 * Read instance records that are safe to expose as *workspace-local* evidence.
 *
 * This is deliberately stricter than {@link loadH2aInstances}, which supports
 * general agent-stats attribution by workspace-prefix matching. Coordination
 * evidence may only come from the current project's own, non-symlinked
 * registry file and from records whose declared workspace resolves exactly to
 * that project root. It returns no raw registry fields beyond the existing
 * in-memory identity record and does not write to `.h2a`.
 */
export function filterWorkspaceLocalH2aInstances(
  repoRoot: string,
  instances: H2aInstance[],
  home = homedir(),
): H2aInstance[] {
  let root: string;
  let registryFile: string;
  try {
    root = realpathSync(repoRoot);
    registryFile = join(root, ".h2a", "registry", "instances.jsonl");
    // Fail closed when `.h2a`, its registry directory, or the file points
    // outside this workspace. A shared h2a root is coordination input, not
    // workspace-local evidence.
    if (realpathSync(registryFile) !== registryFile) return [];
  } catch {
    return [];
  }

  const seen = new Set<string>();
  return instances
    .filter((instance) => {
      if (!instance.id || instance.host !== instance.id.split(":")[0]) return false;
      const workspacePath = expandWorkspacePath(instance.workspacePath, home);
      if (!workspacePath) return false;
      try {
        if (realpathSync(workspacePath) !== root || seen.has(instance.id)) return false;
      } catch {
        return false;
      }
      seen.add(instance.id);
      return true;
    })
    .sort((a, b) => codePointCompare(a.id, b.id));
}

/** Read and then strictly filter the local registry for standalone consumers. */
export function loadWorkspaceLocalH2aInstances(repoRoot: string, home = homedir()): H2aInstance[] {
  return filterWorkspaceLocalH2aInstances(repoRoot, loadH2aInstances(repoRoot), home);
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
