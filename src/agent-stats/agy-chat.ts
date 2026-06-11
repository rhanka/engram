/**
 * WP9 agent-stats — agy / Antigravity ("Gemini") chat parser (dumb, sparse).
 *
 * Shape (verified against a real file):
 *   ~/.gemini/tmp/<projectHash>/chats/session-<ts>-<hash>.jsonl
 * Header line: { sessionId, projectHash, startTime, lastUpdated, kind }.
 * Then typed records ({ type:"user" | "gemini", content, timestamp, tokens })
 * interleaved with `{ "$set": { lastUpdated, messages? } }` patch records.
 *
 * agy is SPARSE: no cwd, no git branch/commit, no tool outputs we can scrape
 * for ground truth in the MVP — the project is only identified by the
 * `projectHash` (which we map to this repo via the directory layout in
 * normalize.ts). Tokens live on `gemini` records ({ input, output, cached,
 * total }). Best effort only.
 */

import { emptyGroundTruth } from "./git-evidence.js";
import type { GitAction, GroundTruth, TokenTotals } from "./types.js";

export interface RawAgySession {
  host: "agy";
  sessionId: string;
  projectHash?: string;
  startedAt?: string;
  endedAt?: string;
  models: string[];
  tokens: TokenTotals;
  gitActions: GitAction[];
  groundTruth: GroundTruth;
}

function pushUnique(arr: string[], v: unknown): void {
  if (typeof v === "string" && v && !arr.includes(v)) arr.push(v);
}

function emptySession(sessionId: string): RawAgySession {
  return {
    host: "agy",
    sessionId,
    models: [],
    tokens: { input: 0, output: 0, cached: 0, total: 0, note: "agy: summed gemini-record tokens (best effort)" },
    gitActions: [],
    groundTruth: emptyGroundTruth(),
  };
}

/** Parse one agy chat's JSONL content into a single RawAgySession. */
export function parseAgyChat(content: string, sessionIdHint: string): RawAgySession {
  const session = emptySession(sessionIdHint);
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r && typeof r === "object" && "$set" in r) continue; // patch record, ignore
    if (typeof r?.sessionId === "string") session.sessionId = r.sessionId;
    if (typeof r?.projectHash === "string") session.projectHash = r.projectHash;
    const ts = r?.startTime ?? r?.timestamp;
    if (typeof ts === "string") {
      if (!session.startedAt || ts < session.startedAt) session.startedAt = ts;
      if (!session.endedAt || ts > session.endedAt) session.endedAt = ts;
    }
    if (r?.type === "gemini") {
      pushUnique(session.models, r.model);
      const t = r.tokens;
      if (t && typeof t === "object") {
        session.tokens.input += Number(t.input) || 0;
        session.tokens.output += Number(t.output) || 0;
        session.tokens.cached += Number(t.cached) || 0;
        session.tokens.total += Number(t.total) || 0;
      }
    }
  }
  return session;
}
