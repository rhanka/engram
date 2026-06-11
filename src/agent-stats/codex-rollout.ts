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

import { classifyGitVerb, emptyGroundTruth, scrapeGroundTruth } from "./git-evidence.js";
import { redactExcerpt } from "./redact.js";
import type { EvidenceSnippet, GitAction, GroundTruth, SessionParent, TokenTotals } from "./types.js";

export interface RawCodexSession {
  host: "codex";
  sessionId: string;
  cwds: string[];
  branches: string[];
  models: string[];
  version?: string;
  startedAt?: string;
  endedAt?: string;
  tokens: TokenTotals;
  parent?: SessionParent;
  gitActions: GitAction[];
  groundTruth: GroundTruth;
  filesTouched: string[];
  prUrls: string[];
  evidence: EvidenceSnippet[];
  /** Transient: last git command seen, to tie the next output to it. */
  _lastGitCommand?: string;
  _lastGitTs?: string;
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

/** Parse one Codex rollout's JSONL content into a single RawCodexSession. */
export function parseCodexRollout(content: string, sessionIdHint: string, home = ""): RawCodexSession {
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
    const type = r?.type;
    const payload = r?.payload ?? {};
    if (typeof r?.timestamp === "string") {
      if (!session.startedAt || r.timestamp < session.startedAt) session.startedAt = r.timestamp;
      if (!session.endedAt || r.timestamp > session.endedAt) session.endedAt = r.timestamp;
    }

    if (type === "session_meta") {
      if (typeof payload.id === "string") session.sessionId = payload.id;
      pushUnique(session.cwds, payload.cwd);
      if (typeof payload.cli_version === "string") session.version = payload.cli_version;
      const git = payload.git;
      if (git && typeof git === "object") pushUnique(session.branches, git.branch);
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
      continue;
    }

    if (type === "response_item" && payload.type === "function_call") {
      const command = commandFromArgs(payload.arguments);
      pushUnique(session.cwds, workdirFromArgs(payload.arguments));
      // apply_patch tool — record touched files heuristically.
      if (payload.name === "apply_patch" || /apply_patch/.test(command)) {
        for (const m of command.matchAll(/\*\*\* (?:Add|Update|Delete) File: (.+)/g)) {
          if (m[1]) pushUnique(session.filesTouched, m[1].trim());
        }
      }
      const verb = classifyGitVerb(command);
      if (verb) {
        session.gitActions.push({ verb, command: redactExcerpt(command, home, 160), timestamp: r?.timestamp });
        if (verb === "checkout-b") {
          session.evidence.push({ kind: "git-checkout", text: redactExcerpt(command, home, 120), timestamp: r?.timestamp });
        } else if (verb === "push") {
          session.evidence.push({ kind: "git-push", text: redactExcerpt(command, home, 120), timestamp: r?.timestamp });
        }
        // Remember the last git command so the next output can be tied to it.
        session._lastGitCommand = command;
        session._lastGitTs = r?.timestamp;
      } else {
        session._lastGitCommand = undefined;
      }
      continue;
    }

    if (type === "response_item" && payload.type === "function_call_output") {
      const output = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output ?? "");
      const before = session.groundTruth.commitShas.length + session.groundTruth.prUrls.length;
      scrapeGroundTruth(output, session.groundTruth);
      const after = session.groundTruth.commitShas.length + session.groundTruth.prUrls.length;
      if (after > before) {
        session.evidence.push({
          kind: /pull\//.test(output) ? "pr-url" : "git-commit",
          text: redactExcerpt(`${session._lastGitCommand ?? "git"} => ${output}`, home),
          timestamp: session._lastGitTs,
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
