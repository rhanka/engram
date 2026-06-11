/**
 * WP9 agent-stats — normalization + repo-scope filtering.
 *
 * Turns host-specific raw sessions (claude/codex/agy) into a common
 * {@link SessionFact} and decides whether a session belongs to THIS repo.
 *
 * Repo membership:
 *   - claude/codex: a cwd equals the repo root OR sits under it (covers both
 *     `<root>/.claude/worktrees/*` and `<root>/.worktrees/*`).
 *   - agy: matched by `projectHash` only (agy stores no cwd). The projectHash
 *     is a sha256 the host derives from the project path; we compute the same
 *     for the repo root and compare (best effort).
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import type { RawAgySession } from "./agy-chat.js";
import type { RawClaudeSession } from "./claude-transcript.js";
import type { RawCodexSession } from "./codex-rollout.js";
import type { SessionFact } from "./types.js";

/**
 * Normalize an absolute path to home-relative `~` form for on-disk privacy.
 * PRIVACY (decided): absolute home paths must never land in facts.jsonl.
 * Matching (cwdInRepo / matchInstance) runs on this same normalized form so the
 * redaction does not lose correlation power.
 */
export function pathToTilde(p: string, home = homedir()): string {
  if (typeof p !== "string" || !p) return p;
  if (home && (p === home || p.startsWith(home + "/"))) return "~" + p.slice(home.length);
  return p.replace(/^\/(?:home|Users)\/[A-Za-z0-9._-]+(?=\/|$)/, "~");
}

/** Compute the agy/Antigravity projectHash for a given absolute project path. */
export function agyProjectHash(projectPath: string): string {
  return createHash("sha256").update(projectPath).digest("hex");
}

/**
 * Does any cwd belong to the repo rooted at `repoRoot`? Both sides are
 * tilde-normalized so a `~`-redacted cwd still matches a real repo root.
 */
export function cwdInRepo(cwds: string[], repoRoot: string, home = homedir()): boolean {
  const root = pathToTilde(repoRoot, home);
  return cwds.some((raw) => {
    const c = pathToTilde(raw, home);
    return c === root || c.startsWith(root + "/");
  });
}

export interface RepoScope {
  repoRoot: string;
  /** Pre-computed agy projectHash candidates that map to this repo. */
  agyHashes: Set<string>;
}

export function makeRepoScope(repoRoot: string, extraAgyHashes: string[] = []): RepoScope {
  // agy projectHash is derived from the REAL absolute path, so hash that form.
  const agyHashes = new Set<string>([agyProjectHash(repoRoot), ...extraAgyHashes]);
  return { repoRoot, agyHashes };
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((x) => typeof x === "string" && x)));
}

/** Dedup + tilde-normalize a list of absolute paths (privacy + matching). */
function dedupPaths(arr: string[], home = homedir()): string[] {
  return Array.from(new Set(arr.filter((x) => typeof x === "string" && x).map((p) => pathToTilde(p, home))));
}

export function normalizeClaude(raw: RawClaudeSession): SessionFact {
  return {
    factId: `claude:${raw.sessionId}`,
    host: "claude",
    sessionId: raw.sessionId,
    cwds: dedupPaths(raw.cwds),
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    models: dedup(raw.models),
    cliVersion: raw.version,
    tokens: raw.tokens,
    gitActions: raw.gitActions,
    groundTruth: raw.groundTruth,
    branchesObserved: dedup(raw.branches),
    filesTouched: dedupPaths(raw.filesTouched),
    evidence: raw.evidence,
  };
}

export function normalizeCodex(raw: RawCodexSession): SessionFact {
  return {
    factId: `codex:${raw.sessionId}`,
    host: "codex",
    sessionId: raw.sessionId,
    cwds: dedupPaths(raw.cwds),
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    models: dedup(raw.models),
    cliVersion: raw.version,
    tokens: raw.tokens,
    parent: raw.parent,
    gitActions: raw.gitActions,
    groundTruth: raw.groundTruth,
    branchesObserved: dedup(raw.branches),
    filesTouched: dedupPaths(raw.filesTouched),
    evidence: raw.evidence,
  };
}

export function normalizeAgy(raw: RawAgySession): SessionFact {
  return {
    factId: `agy:${raw.sessionId}`,
    host: "agy",
    sessionId: raw.sessionId,
    cwds: [],
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    models: dedup(raw.models),
    tokens: raw.tokens,
    gitActions: raw.gitActions,
    groundTruth: raw.groundTruth,
    branchesObserved: [],
    filesTouched: [],
    evidence: [],
  };
}

/** True when a normalized session belongs to the repo described by `scope`. */
export function factInRepo(fact: SessionFact, scope: RepoScope, agyProjectHashForSession?: string): boolean {
  if (fact.host === "agy") {
    return agyProjectHashForSession ? scope.agyHashes.has(agyProjectHashForSession) : false;
  }
  return cwdInRepo(fact.cwds, scope.repoRoot);
}
