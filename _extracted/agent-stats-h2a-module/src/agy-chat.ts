/**
 * WP9 agent-stats — agy / Antigravity ("Gemini") chat parser.
 *
 * Shape (verified against a real file):
 *   ~/.gemini/tmp/<projectHash>/chats/session-<ts>-<hash>.jsonl
 * Header line: { sessionId, projectHash, startTime, lastUpdated, kind }.
 * Then typed records ({ type:"user" | "gemini", content, timestamp, tokens })
 * interleaved with `{ "$set": { lastUpdated, messages? } }` patch records.
 *
 * Phase 2 hardening — the host's transcript shape drifts across versions and
 * the MVP parser dropped everything except tokens. This parser is TOLERANT:
 *   - multi-session files: a new header line starts a new logical session;
 *   - `$set.messages` patches: embedded message arrays are walked like records;
 *   - partial/corrupt lines are skipped, never thrown;
 *   - tool calls are recognized across the shapes observed in the wild
 *     (`type:"tool"|"toolCall"|"tool_call"|"tool_use"`, a `toolCall` object
 *     field, or a `toolCalls` array on a gemini record) and their shell
 *     commands are git-verb classified exactly like Claude/Codex;
 *   - GROUND TRUTH parity: a tool OUTPUT is only scraped for commit shas /
 *     PR urls when its OWN command classified as a mutating git verb
 *     (spoof-resistance — `cat`/`grep` output never becomes evidence);
 *   - tokens come from `tokens {input,output,cached,total}` or the Gemini API
 *     `usageMetadata {promptTokenCount,candidatesTokenCount,…}` form;
 *   - cwd/branch hints (`cwd`/`workdir`/`projectPath`, `gitBranch`/`branch`)
 *     are captured when present so repo scoping/identity can use them.
 *
 * Evidence excerpts pass through redact.ts before they are stored.
 */

import { classifyGitVerb, emptyGroundTruth, isGroundTruthVerb, scrapeGroundTruth } from "./git-evidence.js";
import { redactExcerpt } from "./redact.js";
import type { EvidenceSnippet, GitAction, GroundTruth, TokenTotals } from "./types.js";

export interface AgyParseOptions {
  /**
   * Repo root for cross-repo segmentation. agy rarely records a cwd; when a
   * record carries none the evidence is kept (conservative, like the other
   * hosts), but a record with a FOREIGN cwd is excluded.
   */
  scopeRoot?: string;
  /** Origin repo ("owner/name") used to scope scraped PR urls. */
  originRepo?: string;
}

export interface RawAgySession {
  host: "agy";
  sessionId: string;
  projectHash?: string;
  cwds: string[];
  branches: string[];
  startedAt?: string;
  endedAt?: string;
  models: string[];
  tokens: TokenTotals;
  gitActions: GitAction[];
  groundTruth: GroundTruth;
  filesTouched: string[];
  evidence: EvidenceSnippet[];
}

function pushUnique(arr: string[], v: unknown): void {
  if (typeof v === "string" && v && !arr.includes(v)) arr.push(v);
}

function emptySession(sessionId: string): RawAgySession {
  return {
    host: "agy",
    sessionId,
    cwds: [],
    branches: [],
    models: [],
    tokens: { input: 0, output: 0, cached: 0, total: 0, note: "agy: summed gemini-record tokens (best effort)" },
    gitActions: [],
    groundTruth: emptyGroundTruth(),
    filesTouched: [],
    evidence: [],
  };
}

/** A header record opens a (new) session: sessionId + session-level metadata. */
function isHeader(r: any): boolean {
  return (
    r &&
    typeof r === "object" &&
    typeof r.sessionId === "string" &&
    ("projectHash" in r || "startTime" in r || "kind" in r)
  );
}

function firstString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) if (typeof c === "string" && c) return c;
  return undefined;
}

/** Extract a shell command string from the various tool-call arg shapes. */
function commandFromToolArgs(args: any): string {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return args;
    }
  }
  if (!args || typeof args !== "object") return "";
  const cmd = args.command ?? args.cmd ?? args.input ?? args.CommandLine ?? args.commandLine;
  if (typeof cmd === "string") return cmd;
  if (Array.isArray(cmd)) return cmd.filter((x) => typeof x === "string").join(" ");
  return "";
}

/** Extract a file path from edit/write-style tool-call args. */
function filePathFromToolArgs(args: any): string | undefined {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return undefined;
    }
  }
  if (!args || typeof args !== "object") return undefined;
  return firstString(args.file_path, args.filePath, args.path, args.AbsolutePath, args.absolutePath);
}

function textFromOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    return output
      .map((c) => (c && typeof c === "object" && typeof (c as any).text === "string" ? (c as any).text : ""))
      .join("\n");
  }
  if (output && typeof output === "object") {
    const o = output as any;
    return firstString(o.text, o.content, o.stdout, o.output, o.result) ?? "";
  }
  return "";
}

/** Normalize one tool-call-ish object into { name, args, output }. */
function asToolCall(r: any): { name: string; args: any; output: unknown } | null {
  if (!r || typeof r !== "object") return null;
  const type = typeof r.type === "string" ? r.type.toLowerCase() : "";
  if (type === "tool" || type === "toolcall" || type === "tool_call" || type === "tool_use") {
    return {
      name: firstString(r.name, r.toolName, r.tool_name, r.tool) ?? "",
      args: r.args ?? r.input ?? r.parameters ?? r.arguments,
      output: r.output ?? r.result ?? r.response ?? r.toolOutput,
    };
  }
  const nested = r.toolCall ?? r.tool_call;
  if (nested && typeof nested === "object") {
    return {
      name: firstString(nested.name, nested.toolName, nested.tool_name) ?? "",
      args: nested.args ?? nested.input ?? nested.parameters ?? nested.arguments,
      output: nested.output ?? nested.result ?? nested.response ?? r.output ?? r.result,
    };
  }
  return null;
}

/** True when `cwd` is unknown or sits at/under `scopeRoot` (none → in scope). */
function cwdInScope(cwd: string | undefined, scopeRoot?: string): boolean {
  if (!scopeRoot) return true;
  if (!cwd) return true; // unknown cwd: keep (conservative, like claude/codex)
  return cwd === scopeRoot || cwd.startsWith(scopeRoot + "/");
}

const EDIT_TOOL_RE = /(?:^|[._-])(edit|write|create|replace|patch)(?:[._-]|$)|^(write_to_file|replace_file_content|edit_file)$/i;

/**
 * Parse one agy chat's JSONL content into one session PER HEADER (some files
 * hold several logical sessions back-to-back). Corrupt/partial lines are
 * skipped, never thrown.
 */
export function parseAgyChats(content: string, sessionIdHint: string, home = "", opts: AgyParseOptions = {}): RawAgySession[] {
  const sessions: RawAgySession[] = [];
  let session: RawAgySession | null = null;
  let headerSeen = false;
  const ensure = (): RawAgySession => {
    if (!session) {
      session = emptySession(sessionIdHint);
      headerSeen = false;
      sessions.push(session);
    }
    return session;
  };

  const visit = (r: any, inheritedTs?: string): void => {
    if (!r || typeof r !== "object") return;

    // Patch records: walk any embedded message array, ignore the rest.
    if ("$set" in r) {
      const set = (r as any).$set;
      if (set && typeof set === "object" && Array.isArray(set.messages)) {
        for (const m of set.messages) visit(m, typeof set.lastUpdated === "string" ? set.lastUpdated : inheritedTs);
      }
      return;
    }

    if (isHeader(r)) {
      // A SECOND header with a different sessionId starts a new logical
      // session; the first header just names the implicit one.
      if (session && headerSeen && session.sessionId !== r.sessionId) {
        session = emptySession(r.sessionId);
        sessions.push(session);
      }
      const s = ensure();
      headerSeen = true;
      s.sessionId = r.sessionId;
      if (typeof r.projectHash === "string") s.projectHash = r.projectHash;
      pushUnique(s.cwds, firstString(r.projectPath, r.project_path, r.workspaceRoot, r.cwd));
    }

    const s = ensure();
    const ts = firstString(r.startTime, r.timestamp, r.lastUpdated) ?? inheritedTs;
    if (ts) {
      if (!s.startedAt || ts < s.startedAt) s.startedAt = ts;
      if (!s.endedAt || ts > s.endedAt) s.endedAt = ts;
    }
    pushUnique(s.branches, firstString(r.gitBranch, r.branch));
    const recordCwd = firstString(r.cwd, r.workdir, r.projectPath, r.workspaceRoot);
    pushUnique(s.cwds, recordCwd);

    if (r.type === "gemini") {
      pushUnique(s.models, firstString(r.model, r.modelVersion));
      addTokens(s.tokens, r.tokens ?? r.usageMetadata ?? r.usage);
      if (Array.isArray(r.toolCalls)) {
        for (const tc of r.toolCalls) {
          if (tc && typeof tc === "object") handleToolCall(s, { type: "toolCall", ...tc }, recordCwd, ts, home, opts);
        }
      }
    }

    handleToolCall(s, r, recordCwd, ts, home, opts);
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue; // partial/corrupt line: skip, never throw
    }
    try {
      visit(r);
    } catch {
      /* a malformed record must never abort the whole transcript */
    }
  }
  return sessions.length > 0 ? sessions : [emptySession(sessionIdHint)];
}

function addTokens(acc: TokenTotals, t: any): void {
  if (!t || typeof t !== "object") return;
  if ("input" in t || "output" in t || "total" in t || "cached" in t) {
    acc.input += Number(t.input) || 0;
    acc.output += Number(t.output) || 0;
    acc.cached += Number(t.cached) || 0;
    acc.total += Number(t.total) || 0;
    return;
  }
  // Gemini API usageMetadata form.
  const input = Number(t.promptTokenCount) || 0;
  const output = Number(t.candidatesTokenCount) || 0;
  const cached = Number(t.cachedContentTokenCount) || 0;
  const total = Number(t.totalTokenCount) || input + output;
  acc.input += input;
  acc.output += output;
  acc.cached += cached;
  acc.total += total;
}

function handleToolCall(
  s: RawAgySession,
  record: any,
  recordCwd: string | undefined,
  ts: string | undefined,
  home: string,
  opts: AgyParseOptions,
): void {
  const call = asToolCall(record);
  if (!call) return;
  const argCwd = (() => {
    let a = call.args;
    if (typeof a === "string") {
      try {
        a = JSON.parse(a);
      } catch {
        a = undefined;
      }
    }
    return a && typeof a === "object" ? firstString(a.workdir, a.cwd, a.Cwd, a.directory) : undefined;
  })();
  pushUnique(s.cwds, argCwd);
  const inScope = cwdInScope(argCwd ?? recordCwd, opts.scopeRoot);

  // File-touch extraction (edit/write-style tools).
  if (EDIT_TOOL_RE.test(call.name) && inScope) {
    const path = filePathFromToolArgs(call.args);
    if (path) pushUnique(s.filesTouched, path);
  }

  const command = commandFromToolArgs(call.args);
  if (!command) return;
  const verb = classifyGitVerb(command);
  if (verb && inScope) {
    s.gitActions.push({ verb, command: redactExcerpt(command, home, 160), timestamp: ts });
    if (verb === "checkout-b") {
      s.evidence.push({ kind: "git-checkout", text: redactExcerpt(command, home, 120), timestamp: ts });
    } else if (verb === "push") {
      s.evidence.push({ kind: "git-push", text: redactExcerpt(command, home, 120), timestamp: ts });
    }
  }

  // SPOOF-RESISTANCE (parity with claude/codex): the output is only scraped
  // when this call's OWN command classified as a mutating git verb in scope.
  if (!inScope || !isGroundTruthVerb(verb)) return;
  const output = textFromOutput(call.output);
  if (!output) return;
  const before = s.groundTruth.commitShas.length + s.groundTruth.prUrls.length;
  scrapeGroundTruth(output, s.groundTruth, opts.originRepo);
  const after = s.groundTruth.commitShas.length + s.groundTruth.prUrls.length;
  if (after > before) {
    s.evidence.push({
      kind: /pull\//.test(output) ? "pr-url" : "git-commit",
      text: redactExcerpt(`${command} => ${output}`, home),
      timestamp: ts,
    });
  }
}

/** Back-compat single-session view: the first (primary) session in the file. */
export function parseAgyChat(content: string, sessionIdHint: string, home = "", opts: AgyParseOptions = {}): RawAgySession {
  return parseAgyChats(content, sessionIdHint, home, opts)[0] ?? emptySession(sessionIdHint);
}
