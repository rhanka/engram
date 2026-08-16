/**
 * WP9 agent-stats — on-disk store.
 *
 *   .graphify/agents/facts.jsonl   append-only normalized SessionFacts (incl.
 *                                  anonymized evidence). Re-running `sync`
 *                                  replaces a fact in place by factId.
 *   .graphify/agents/cursors.json  per-transcript byte offset + size + mtime so
 *                                  incremental re-parse can skip unchanged files.
 *
 * `.graphify/agents/` is covered by the `.graphify/*` gitignore rule, so nothing
 * here is ever committed. Privacy is enforced upstream by redact.ts — this
 * module persists whatever it is handed.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CorrelationLink, FileCursor, SessionFact } from "./types.js";

export interface AgentStore {
  dir: string;
  factsPath: string;
  cursorsPath: string;
  /** Append-only resolved attribution links (re-derivable; survives branch GC). */
  linksPath: string;
}

export function resolveStore(repoRoot: string): AgentStore {
  const dir = join(repoRoot, ".graphify", "agents");
  return {
    dir,
    factsPath: join(dir, "facts.jsonl"),
    cursorsPath: join(dir, "cursors.json"),
    linksPath: join(dir, "links.jsonl"),
  };
}

export function ensureStore(store: AgentStore): void {
  if (!existsSync(store.dir)) mkdirSync(store.dir, { recursive: true });
}

/** Load all persisted facts (latest record per factId wins). */
export function loadFacts(store: AgentStore): Map<string, SessionFact> {
  const out = new Map<string, SessionFact>();
  if (!existsSync(store.factsPath)) return out;
  for (const line of readFileSync(store.factsPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const fact = JSON.parse(t) as SessionFact;
      if (fact?.factId) out.set(fact.factId, fact);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

/**
 * Persist facts. The file is append-only in spirit but we collapse duplicates by
 * factId on write so re-syncing the same transcript does not grow it unbounded.
 */
export function saveFacts(store: AgentStore, facts: Map<string, SessionFact>): void {
  ensureStore(store);
  const lines = Array.from(facts.values())
    .sort((a, b) => a.factId.localeCompare(b.factId))
    .map((f) => JSON.stringify(f));
  writeFileSync(store.factsPath, lines.length ? lines.join("\n") + "\n" : "");
}

/** Exact-home tilde encoding for cursor paths (round-trips losslessly). */
function encodeCursorPath(p: string, home: string): string {
  return home && (p === home || p.startsWith(home + "/")) ? "~" + p.slice(home.length) : p;
}

function decodeCursorPath(p: string, home: string): string {
  return home && (p === "~" || p.startsWith("~/")) ? home + p.slice(1) : p;
}

export function loadCursors(store: AgentStore, home = homedir()): Map<string, FileCursor> {
  const out = new Map<string, FileCursor>();
  if (!existsSync(store.cursorsPath)) return out;
  try {
    const arr = JSON.parse(readFileSync(store.cursorsPath, "utf-8"));
    if (Array.isArray(arr)) {
      for (const c of arr) {
        if (!c?.path) continue;
        const abs = decodeCursorPath(c.path, home);
        out.set(abs, { ...c, path: abs });
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Persist cursors. PRIVACY: transcript paths live under the user's home dir;
 * they are stored `~`-relative so no raw home path lands in cursors.json.
 */
export function saveCursors(store: AgentStore, cursors: Map<string, FileCursor>, home = homedir()): void {
  ensureStore(store);
  const arr = Array.from(cursors.values())
    .map((c) => ({ ...c, path: encodeCursorPath(c.path, home) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(store.cursorsPath, JSON.stringify(arr, null, 2) + "\n");
}

/** Stable identity of a correlation link (factId + rule + target). */
export function linkKey(link: CorrelationLink): string {
  const t = link.target;
  const tail =
    t.kind === "commit"
      ? `${t.sha}|${t.branch ?? ""}`
      : t.kind === "branch"
        ? t.branch
        : t.kind === "pr"
          ? `${t.url ?? ""}|${t.number ?? ""}`
          : `${t.trackItemId}|${t.wp ?? ""}`;
  return `${link.factId}|${link.rule}|${t.kind}|${tail}`;
}

/** Load persisted attribution links (deduped by {@link linkKey}). */
export function loadLinks(store: AgentStore): CorrelationLink[] {
  if (!existsSync(store.linksPath)) return [];
  const seen = new Set<string>();
  const out: CorrelationLink[] = [];
  for (const line of readFileSync(store.linksPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const link = JSON.parse(t) as CorrelationLink;
      if (!link?.factId || !link?.target) continue;
      const key = linkKey(link);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(link);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

/**
 * APPEND-ONLY: persist any link not already on disk. Resolved attribution thus
 * survives branch GC / squash cleanup — the numbers do not decay when the
 * evidence can no longer be re-derived from `git log`.
 */
export function appendLinks(store: AgentStore, links: CorrelationLink[]): number {
  const existing = new Set(loadLinks(store).map(linkKey));
  const fresh = links.filter((l) => {
    const key = linkKey(l);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (fresh.length === 0) return 0;
  ensureStore(store);
  appendFileSync(store.linksPath, fresh.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return fresh.length;
}
