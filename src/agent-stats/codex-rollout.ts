/**
 * WP9 agent-stats — Codex rollout parser (dumb, host-specific).
 *
 * Shape (verified against a real file):
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<thread_uuid>.jsonl
 * First line: { type:"session_meta", payload:{ id, cwd, cli_version,
 *   model_provider, source:{ subagent:{ thread_spawn:{ parent_thread_id,
 *   agent_nickname, agent_role } | other } }, git:{ commit_hash, branch,
 *   repository_url } } }.
 * Then records: { type:"response_item", payload:{ type:"function_call",
 *   name, arguments(JSON string), call_id } }, the matching
 *   { type:"response_item", payload:{ type:"function_call_output", call_id,
 *   output } }, { type:"turn_context", payload:{ model, cwd } }, and
 *   { type:"event_msg", payload:{ type:"token_count", info:{ total_token_usage:
 *   { input_tokens, cached_input_tokens, output_tokens, total_tokens } } } }.
 *
 * Codex tool calls are `exec_command` / `shell` style: arguments carry a `cmd`
 * (string or argv array) and `workdir`.
 */

import { classifyGitVerb, emptyGroundTruth, isGroundTruthVerb, scrapeGroundTruth } from "./git-evidence.js";
import { redactExcerpt } from "./redact.js";
import type { CodexOrigin, EvidenceSnippet, GitAction, GroundTruth, SessionParent, TokenTotals } from "./types.js";

export interface CodexParseOptions {
  /**
   * Repo root for cross-repo segmentation. When set, git evidence only
   * accumulates from calls whose effective workdir is at or under this root.
   */
  scopeRoot?: string;
  /** Origin repo ("owner/name") used to scope scraped PR urls. */
  originRepo?: string;
}

interface PendingCall {
  command: string;
  verb: GitAction["verb"] | null;
  inScope: boolean;
  timestamp?: string;
}

export interface RawCodexSession {
  host: "codex";
  sessionId: string;
  cwds: string[];
  branches: string[];
  models: string[];
  version?: string;
  /** Invocation origin (tui / exec-headless / vscode), from session_meta. */
  origin?: CodexOrigin;
  startedAt?: string;
  endedAt?: string;
  tokens: TokenTotals;
  parent?: SessionParent;
  gitActions: GitAction[];
  groundTruth: GroundTruth;
  filesTouched: string[];
  prUrls: string[];
  evidence: EvidenceSnippet[];
}

function pushUnique(arr: string[], v: unknown): void {
  if (typeof v === "string" && v && !arr.includes(v)) arr.push(v);
}

function commandFromArgs(args: any): string {
  // exec_command/shell: { cmd: string | string[], workdir }
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return args;
    }
  }
  if (!args || typeof args !== "object") return "";
  const cmd = args.cmd ?? args.command ?? args.input;
  if (typeof cmd === "string") return cmd;
  if (Array.isArray(cmd)) return cmd.join(" ");
  return "";
}

function workdirFromArgs(args: any): string | undefined {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return undefined;
    }
  }
  if (args && typeof args === "object" && typeof args.workdir === "string") return args.workdir;
  return undefined;
}

/**
 * Classify a Codex session's invocation origin from its `session_meta`.
 *
 * Observed on real rollouts (all in `~/.codex/sessions`, same JSONL shape):
 *   - interactive TUI:    originator `codex-tui` (or older `codex_cli_rs`), source `{ subagent | cli }`.
 *   - headless exec:      originator `codex_exec`, source `"exec"` (a STRING).
 *   - IDE extension:      originator `codex_vscode` (or `Claude Code`), source `"vscode"`.
 * `source` is preferred (it directly names the surface); originator is the
 * fallback. Returns `undefined` only when neither field is present, so a
 * malformed header does not invent an origin.
 * (Originator literals verified against all 2427 rollouts on disk, 2026-02→06.)
 */
export function codexOrigin(originator: unknown, source: unknown): CodexOrigin | undefined {
  const src = typeof source === "string" ? source.toLowerCase() : "";
  if (src === "exec") return "exec";
  if (src === "vscode") return "vscode";
  if (src === "cli" || src === "subagent") return "tui";
  const orig = typeof originator === "string" ? originator.toLowerCase() : "";
  if (orig === "codex_exec") return "exec";
  if (orig === "codex-tui" || orig === "codex_cli_rs") return "tui";
  if (orig === "vscode" || orig === "codex_vscode" || orig === "claude code") return "vscode";
  if (!orig && (source === undefined || source === null)) return undefined;
  return "other";
}

function emptySession(sessionId: string): RawCodexSession {
  return {
    host: "codex",
    sessionId,
    cwds: [],
    branches: [],
    models: [],
    tokens: { input: 0, output: 0, cached: 0, total: 0, note: "codex: last total_token_usage" },
    gitActions: [],
    groundTruth: emptyGroundTruth(),
    filesTouched: [],
    prUrls: [],
    evidence: [],
  };
}

/** True when `cwd` is unknown or sits at/under `scopeRoot` (none → in scope). */
function cwdInScope(cwd: string | undefined, scopeRoot?: string): boolean {
  if (!scopeRoot) return true;
  if (!cwd) return true; // unknown workdir: keep (conservative)
  return cwd === scopeRoot || cwd.startsWith(scopeRoot + "/");
}

/** Parse one Codex rollout's JSONL content into a single RawCodexSession. */
export function parseCodexRollout(
  content: string,
  sessionIdHint: string,
  home = "",
  opts: CodexParseOptions = {},
): RawCodexSession {
  const session = emptySession(sessionIdHint);
  // call_id -> paired input so a later function_call_output can be verb-gated.
  const pendingCalls = new Map<string, PendingCall>();
  let currentCwd: string | undefined;
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
    const payload = r?.payload ?? {};
    if (typeof r?.timestamp === "string") {
      if (!session.startedAt || r.timestamp < session.startedAt) session.startedAt = r.timestamp;
      if (!session.endedAt || r.timestamp > session.endedAt) session.endedAt = r.timestamp;
    }

    if (type === "session_meta") {
      if (typeof payload.id === "string") session.sessionId = payload.id;
      pushUnique(session.cwds, payload.cwd);
      if (typeof payload.cwd === "string") currentCwd = payload.cwd;
      if (typeof payload.cli_version === "string") session.version = payload.cli_version;
      session.origin = codexOrigin(payload.originator, payload.source);
      const git = payload.git;
      if (git && typeof git === "object") pushUnique(session.branches, git.branch);
      // `payload.source` may be a STRING ("exec"/"vscode"/"cli") for headless /
      // IDE runs, in which case `.subagent` is undefined and no parent is set.
      const sub = payload.source?.subagent;
      if (sub && typeof sub === "object") {
        const spawn = sub.thread_spawn;
        if (spawn && typeof spawn === "object") {
          session.parent = {
            parentThreadId: typeof spawn.parent_thread_id === "string" ? spawn.parent_thread_id : undefined,
            nickname: typeof spawn.agent_nickname === "string" ? spawn.agent_nickname : undefined,
            role: typeof spawn.agent_role === "string" ? spawn.agent_role : undefined,
          };
        } else if (typeof sub.other === "string") {
          session.parent = { role: sub.other };
        }
      }
      continue;
    }

    if (type === "turn_context") {
      pushUnique(session.models, payload.model);
      pushUnique(session.cwds, payload.cwd);
      if (typeof payload.cwd === "string") currentCwd = payload.cwd;
      continue;
    }

    if (type === "response_item" && payload.type === "function_call") {
      const command = commandFromArgs(payload.arguments);
      const workdir = workdirFromArgs(payload.arguments);
      pushUnique(session.cwds, workdir);
      const inScope = cwdInScope(workdir ?? currentCwd, opts.scopeRoot);
      // apply_patch tool — record touched files heuristically.
      if ((payload.name === "apply_patch" || /apply_patch/.test(command)) && inScope) {
        for (const m of command.matchAll(/\*\*\* (?:Add|Update|Delete) File: (.+)/g)) {
          if (m[1]) pushUnique(session.filesTouched, m[1].trim());
        }
      }
      const verb = classifyGitVerb(command);
      if (typeof payload.call_id === "string") {
        pendingCalls.set(payload.call_id, { command, verb, inScope, timestamp: r?.timestamp });
      }
      if (verb && inScope) {
        session.gitActions.push({ verb, command: redactExcerpt(command, home, 160), timestamp: r?.timestamp });
        if (verb === "checkout-b") {
          session.evidence.push({ kind: "git-checkout", text: redactExcerpt(command, home, 120), timestamp: r?.timestamp });
        } else if (verb === "push") {
          session.evidence.push({ kind: "git-push", text: redactExcerpt(command, home, 120), timestamp: r?.timestamp });
        }
      }
      continue;
    }

    if (type === "response_item" && payload.type === "function_call_output") {
      // SPOOF-RESISTANCE: pair the output to its call_id and only scrape when
      // the PAIRED INPUT classified as a mutating git verb inside the repo
      // scope. Outputs of `cat`/`grep`/read-only git never feed ground truth.
      const call = typeof payload.call_id === "string" ? pendingCalls.get(payload.call_id) : undefined;
      if (!call || !call.inScope || !isGroundTruthVerb(call.verb)) continue;
      const output = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output ?? "");
      const before = session.groundTruth.commitShas.length + session.groundTruth.prUrls.length;
      scrapeGroundTruth(output, session.groundTruth, opts.originRepo);
      const after = session.groundTruth.commitShas.length + session.groundTruth.prUrls.length;
      if (after > before) {
        session.evidence.push({
          kind: /pull\//.test(output) ? "pr-url" : "git-commit",
          text: redactExcerpt(`${call.command} => ${output}`, home),
          timestamp: call.timestamp,
        });
        for (const u of session.groundTruth.prUrls) pushUnique(session.prUrls, u);
      }
      continue;
    }

    if (type === "event_msg" && payload.type === "token_count") {
      const total = payload.info?.total_token_usage;
      if (total && typeof total === "object") {
        // total_token_usage is cumulative; take the latest snapshot.
        session.tokens.input = Number(total.input_tokens) || session.tokens.input;
        session.tokens.output = Number(total.output_tokens) || session.tokens.output;
        session.tokens.cached = Number(total.cached_input_tokens) || session.tokens.cached;
        session.tokens.total = Number(total.total_tokens) || session.tokens.total;
      }
      continue;
    }
  }
  return session;
}
