/**
 * WP9 agent-stats — shared types.
 *
 * The hard constraint of WP9: git authorship does NOT identify the agent.
 * Every commit in this repo is authored by the same human; there are no
 * trailers. Attribution therefore comes from SESSION EVIDENCE captured in the
 * agentic CLI transcripts (Claude Code, Codex, agy/Antigravity), never from
 * `git log` authors/emails.
 */

export type AgentHost = "claude" | "codex" | "agy";

/** A single git-relevant action a session performed, parsed from tool INPUT. */
export interface GitAction {
  /** Coarse verb classification of the command. */
  verb: "commit" | "checkout-b" | "push" | "pr-create" | "pr-merge" | "other";
  /** Anonymized git/gh command excerpt (home paths/tokens/emails redacted). */
  command: string;
  /** Wall-clock timestamp of the tool call, if known. */
  timestamp?: string;
}

/**
 * Ground truth scraped from a tool OUTPUT (not the command we asked for, but
 * what git/gh actually reported back). This is the strongest evidence we have.
 */
export interface GroundTruth {
  /** Commit shas observed in `git commit` output lines `[branch abc1234]`. */
  commitShas: string[];
  /** Branch labels seen in those same commit-output lines. */
  branches: string[];
  /** Map of abbreviated sha → branch label, paired from each `[branch sha]` line. */
  shaBranch: Record<string, string>;
  /** PR URLs observed in `gh pr create` output. */
  prUrls: string[];
}

/** A normalized per-session fact record (one transcript session → one fact). */
export interface SessionFact {
  /** Stable key: `${host}:${sessionId}`. */
  factId: string;
  host: AgentHost;
  sessionId: string;
  /** Distinct cwds the session touched (may include worktrees). */
  cwds: string[];
  /** First and last observed timestamps (ISO-8601). */
  startedAt?: string;
  endedAt?: string;
  /** Model id(s) observed for this session. */
  models: string[];
  /** CLI version string, if the host records one. */
  cliVersion?: string;
  /** Token totals (best effort; semantics differ per host — see tokens.note). */
  tokens: TokenTotals;
  /** Parentage / sub-agent lineage when the host records it. */
  parent?: SessionParent;
  /** git verbs parsed from tool INPUTS. */
  gitActions: GitAction[];
  /** GROUND TRUTH parsed from tool OUTPUTS. */
  groundTruth: GroundTruth;
  /** Branches the session was observed working on (host branch metadata). */
  branchesObserved: string[];
  /** Distinct files touched via Edit/Write/apply_patch (repo-relative-ish). */
  filesTouched: string[];
  /** Anonymized evidence snippets retained for audit (never raw prompts). */
  evidence: EvidenceSnippet[];
}

export interface TokenTotals {
  input: number;
  output: number;
  /** Cache-read / cached input tokens, where the host distinguishes them. */
  cached: number;
  total: number;
  /** Free-form note on how totals were derived for this host. */
  note?: string;
}

export interface SessionParent {
  /** Parent thread/session id when this is a sub-agent. */
  parentThreadId?: string;
  /** Human nickname assigned by the host (codex sub-agents). */
  nickname?: string;
  /** Role label (codex sub-agents: explorer/guardian/…). */
  role?: string;
}

export interface EvidenceSnippet {
  kind: "git-commit" | "pr-url" | "git-checkout" | "git-push";
  /** Anonymized text excerpt (the command and/or its sha output). */
  text: string;
  timestamp?: string;
}

/** Confidence band for a correlation link. */
export type Confidence = "high" | "medium" | "low";

/** A correlation linking a SessionFact to a git artifact (commit/branch/PR/WP). */
export interface CorrelationLink {
  factId: string;
  agentId: string;
  /** What the session is being linked to. */
  target:
    | { kind: "commit"; sha: string; branch?: string }
    | { kind: "branch"; branch: string }
    | { kind: "pr"; url?: string; number?: number }
    | { kind: "wp"; trackItemId: string; wp?: string };
  /** Ranked evidence rule that produced this link (rank 1 = strongest). */
  rank: number;
  /** Short machine label for the rule. */
  rule:
    | "commit-sha-output"
    | "pr-merge"
    | "track-wp-thread-id"
    | "track-wp-h2a-id"
    | "h2a-registry"
    | "worktree-branch-window";
  confidence: Confidence;
  /** Anonymized human-readable justification. */
  evidence: string;
}

/** Resolved agent identity for a session. */
export interface AgentIdentity {
  /** h2a instance id (`host:name:hash12`) when matched, else synthetic. */
  agentId: string;
  host: AgentHost;
  /** Workspace label (registry label or worktree-derived). */
  label: string;
  /** True when matched to a registered h2a instance. */
  registered: boolean;
}

/** Per-agent aggregated stats row (the `graphify agent-stats` table). */
export interface AgentStatsRow {
  agentId: string;
  host: AgentHost;
  registered: boolean;
  sessions: number;
  tokens: number;
  /** Distinct commit shas attributed by ground-truth correlation. */
  commits: number;
  /** Distinct branches attributed. */
  branches: number;
  /** Distinct WP labels touched (parsed from branches / commit subjects). */
  wpsTouched: string[];
  lastActive?: string;
}

/** Incremental re-parse cursor: byte offset already consumed per file. */
export interface FileCursor {
  /** Absolute transcript path. */
  path: string;
  /** Byte offset consumed so far. */
  offset: number;
  /** File size at last parse (cheap change-detect). */
  size: number;
  /** mtime ms at last parse. */
  mtimeMs: number;
}
