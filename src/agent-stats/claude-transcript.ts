/**
 * WP9 agent-stats — Claude Code transcript parser (dumb, host-specific).
 *
 * Shape (verified against a real file):
 *   ~/.claude/projects/<slug-of-cwd>/<sessionUuid>.jsonl
 * JSONL records carry { uuid, parentUuid, isSidechain, timestamp, cwd,
 * sessionId, gitBranch, version, message{ model, usage, content[] } }.
 * Tool calls are `assistant.message.content[]` blocks of type `tool_use`
 * (name=Bash|Edit|Write|…, input). Tool results are `user.message.content[]`
 * blocks of type `tool_result` (content = string or [{type:text,text}]).
 * The host also emits typed sidecar records: `pr-link` { prUrl, prNumber }.
 *
 * This parser is intentionally dumb: it walks records and accumulates raw
 * signals. Cross-host semantics live in normalize.ts.
 */

import { classifyGitVerb, emptyGroundTruth, isGroundTruthVerb, prUrlInRepo, scrapeGroundTruth } from "./git-evidence.js";
import { redactExcerpt } from "./redact.js";
import type { EvidenceSnippet, GitAction, GroundTruth, TokenTotals } from "./types.js";

export interface ClaudeParseOptions {
  /**
   * Repo root for cross-repo segmentation. When set, git evidence, branches,
   * files and token usage only accumulate from records whose cwd is at or
   * under this root — a session's foreign-repo work is not counted.
   */
  scopeRoot?: string;
  /** Origin repo ("owner/name") used to scope scraped PR urls. */
  originRepo?: string;
}

interface PendingTool {
  name: string;
  command: string;
  verb: GitAction["verb"] | null;
  inScope: boolean;
  timestamp?: string;
}

export interface RawClaudeSession {
  host: "claude";
  sessionId: string;
  cwds: string[];
  branches: string[];
  models: string[];
  version?: string;
  startedAt?: string;
  endedAt?: string;
  tokens: TokenTotals;
  gitActions: GitAction[];
  groundTruth: GroundTruth;
  filesTouched: string[];
  prUrls: string[];
  evidence: EvidenceSnippet[];
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && typeof (c as any).text === "string" ? (c as any).text : ""))
      .join("\n");
  }
  return "";
}

function emptySession(sessionId: string): RawClaudeSession {
  return {
    host: "claude",
    sessionId,
    cwds: [],
    branches: [],
    models: [],
    tokens: { input: 0, output: 0, cached: 0, total: 0, note: "claude: summed message usage" },
    gitActions: [],
    groundTruth: emptyGroundTruth(),
    filesTouched: [],
    prUrls: [],
    evidence: [],
  };
}

function pushUnique(arr: string[], v: unknown): void {
  if (typeof v === "string" && v && !arr.includes(v)) arr.push(v);
}

/** True when `cwd` is unknown or sits at/under `scopeRoot` (none → in scope). */
function cwdInScope(cwd: unknown, scopeRoot?: string): boolean {
  if (!scopeRoot) return true;
  if (typeof cwd !== "string" || !cwd) return true; // unknown cwd: keep (conservative)
  return cwd === scopeRoot || cwd.startsWith(scopeRoot + "/");
}

/**
 * Parse one Claude transcript's JSONL content into a single RawClaudeSession.
 * `home` is the user's home dir, used to redact stored excerpts.
 */
export function parseClaudeTranscript(
  content: string,
  sessionIdHint: string,
  home = "",
  opts: ClaudeParseOptions = {},
): RawClaudeSession {
  const session = emptySession(sessionIdHint);
  // tool_use id -> paired input so a later tool_result can be verb-gated.
  const pendingTools = new Map<string, PendingTool>();

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    const type = r?.type;
    const inScope = cwdInScope(r?.cwd, opts.scopeRoot);
    if (typeof r?.sessionId === "string") session.sessionId = r.sessionId;
    pushUnique(session.cwds, r?.cwd);
    if (inScope) pushUnique(session.branches, r?.gitBranch);
    if (typeof r?.version === "string") session.version = r.version;
    if (typeof r?.timestamp === "string") {
      if (!session.startedAt || r.timestamp < session.startedAt) session.startedAt = r.timestamp;
      if (!session.endedAt || r.timestamp > session.endedAt) session.endedAt = r.timestamp;
    }

    if (type === "pr-link" && typeof r?.prUrl === "string" && inScope && prUrlInRepo(r.prUrl, opts.originRepo)) {
      pushUnique(session.prUrls, r.prUrl);
      pushUnique(session.groundTruth.prUrls, r.prUrl);
      session.evidence.push({ kind: "pr-url", text: redactExcerpt(r.prUrl, home), timestamp: r.timestamp });
    }

    const message = r?.message;
    if (type === "assistant" && message && typeof message === "object") {
      pushUnique(session.models, message.model);
      const usage = message.usage;
      if (usage && typeof usage === "object" && inScope) {
        const inTok = Number(usage.input_tokens) || 0;
        const outTok = Number(usage.output_tokens) || 0;
        const cacheRead = Number(usage.cache_read_input_tokens) || 0;
        const cacheCreate = Number(usage.cache_creation_input_tokens) || 0;
        session.tokens.input += inTok;
        session.tokens.output += outTok;
        session.tokens.cached += cacheRead;
        session.tokens.total += inTok + outTok + cacheRead + cacheCreate;
      }
      const blocks = Array.isArray(message.content) ? message.content : [];
      for (const b of blocks) {
        if (b && typeof b === "object" && b.type === "tool_use") {
          recordToolUse(session, pendingTools, b, r?.timestamp, home, inScope);
        }
      }
    }

    if (type === "user" && message && typeof message === "object") {
      const blocks = Array.isArray(message.content) ? message.content : [];
      for (const b of blocks) {
        if (b && typeof b === "object" && b.type === "tool_result") {
          const tool = pendingTools.get(b.tool_use_id);
          // SPOOF-RESISTANCE: only scrape ground truth from the output of a
          // Bash command whose PAIRED INPUT classified as a mutating git verb
          // and ran inside the repo scope. A `cat`/`grep` of a foreign
          // transcript or CI log never acquires its shas / PR urls.
          if (tool && tool.name === "Bash" && tool.inScope && isGroundTruthVerb(tool.verb)) {
            const before = session.groundTruth.commitShas.length + session.groundTruth.prUrls.length;
            scrapeGroundTruth(toText(b.content), session.groundTruth, opts.originRepo);
            const after = session.groundTruth.commitShas.length + session.groundTruth.prUrls.length;
            if (after > before) {
              session.evidence.push({
                kind: /pull\//.test(toText(b.content)) ? "pr-url" : "git-commit",
                text: redactExcerpt(`${tool.command} => ${toText(b.content)}`, home),
                timestamp: tool.timestamp,
              });
            }
          }
        }
      }
    }
  }
  return session;
}

function recordToolUse(
  session: RawClaudeSession,
  pendingTools: Map<string, PendingTool>,
  block: any,
  timestamp: string | undefined,
  home: string,
  inScope: boolean,
): void {
  const name: string = block.name ?? "";
  const input = block.input ?? {};
  if ((name === "Edit" || name === "Write" || name === "NotebookEdit") && inScope) {
    pushUnique(session.filesTouched, input.file_path ?? input.notebook_path);
  }
  if (name === "Bash" && typeof input.command === "string") {
    const verb = classifyGitVerb(input.command);
    pendingTools.set(block.id, { name, command: input.command, verb, inScope, timestamp });
    if (verb && inScope) {
      session.gitActions.push({ verb, command: redactExcerpt(input.command, home, 160), timestamp });
      if (verb === "checkout-b") {
        session.evidence.push({ kind: "git-checkout", text: redactExcerpt(input.command, home, 120), timestamp });
      } else if (verb === "push") {
        session.evidence.push({ kind: "git-push", text: redactExcerpt(input.command, home, 120), timestamp });
      }
    }
  } else {
    pendingTools.set(block.id, { name, command: "", verb: null, inScope, timestamp });
  }
}
