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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileCursor, SessionFact } from "./types.js";

export interface AgentStore {
  dir: string;
  factsPath: string;
  cursorsPath: string;
}

export function resolveStore(repoRoot: string): AgentStore {
  const dir = join(repoRoot, ".graphify", "agents");
  return { dir, factsPath: join(dir, "facts.jsonl"), cursorsPath: join(dir, "cursors.json") };
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

export function loadCursors(store: AgentStore): Map<string, FileCursor> {
  const out = new Map<string, FileCursor>();
  if (!existsSync(store.cursorsPath)) return out;
  try {
    const arr = JSON.parse(readFileSync(store.cursorsPath, "utf-8"));
    if (Array.isArray(arr)) for (const c of arr) if (c?.path) out.set(c.path, c);
  } catch {
    /* ignore */
  }
  return out;
}

export function saveCursors(store: AgentStore, cursors: Map<string, FileCursor>): void {
  ensureStore(store);
  const arr = Array.from(cursors.values()).sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(store.cursorsPath, JSON.stringify(arr, null, 2) + "\n");
}
