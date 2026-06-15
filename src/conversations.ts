import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { commitId, repoKey as defaultRepoKey } from "./repo-key.js";
import type { Extraction, GraphEdge, GraphNode, OntologyProfile } from "./types.js";

export const CONVERSATIONS_ADAPTER_VERSION = "graphify-conversations/0.1.0";
export const AGENT_STATS_CORE_VERSION = "0.3.0";

export type ConversationTool = "claude" | "codex" | "cursor" | "gemini";
export type ConversationSurface = "cli" | "vscode" | "exec" | "cursor";

export interface ConversationUsage {
  newInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

interface ConversationEventBase {
  ts: string;
  tool: ConversationTool;
  sessionId: string;
  projectCwd: string;
}

export interface ConversationSessionStartEvent extends ConversationEventBase {
  kind: "session_start";
  model?: string;
  gitBranch?: string;
  gitCommit?: string;
  repoUrl?: string;
  forkedFromId?: string;
  agentNickname?: string;
  cliVersion?: string;
  surface?: ConversationSurface;
  isSubagent: boolean;
}

export interface ConversationSessionEndEvent extends ConversationEventBase {
  kind: "session_end";
}

export interface ConversationTurnEvent extends ConversationEventBase {
  kind: "turn";
  model: string;
  usage: ConversationUsage;
}

export interface ConversationUserPromptEvent extends ConversationEventBase {
  kind: "user_prompt";
  textLength: number;
  textHash: string;
}

export interface ConversationToolCallEvent extends ConversationEventBase {
  kind: "tool_call";
  name: string;
  category: "bash" | "mcp" | "native" | "function" | "unknown";
  durationMs?: number;
  inputBytes?: number;
  outputBytes?: number;
  error?: boolean;
}

export interface ConversationSkillInvokeEvent extends ConversationEventBase {
  kind: "skill_invoke";
  name: string;
}

export interface ConversationCompactionEvent extends ConversationEventBase {
  kind: "compaction";
}

export type ConversationsSessionEvent =
  | ConversationSessionStartEvent
  | ConversationSessionEndEvent
  | ConversationTurnEvent
  | ConversationUserPromptEvent
  | ConversationToolCallEvent
  | ConversationSkillInvokeEvent
  | ConversationCompactionEvent;

export interface ConversationSessionAggregate {
  sessionId: string;
  tool: ConversationTool;
  surface?: ConversationSurface;
  projectCwd: string;
  model: string;
  startTs: string;
  endTs: string;
  durationMs: number;
  turns: number;
  totalUsage: ConversationUsage;
  gitBranch?: string;
  gitCommit?: string;
  repoUrl?: string;
  isSubagent: boolean;
  forkedFromId?: string;
  agentNickname?: string;
  toolCalls: number;
  toolCallsByCategory: Record<string, number>;
  toolCallsByName: Record<string, number>;
  skillInvocations: number;
  skillsByName: Record<string, number>;
  compactions: number;
  estimatedCost?: { codexCredits: number; claudeUsdCents: number; unknown: number };
}

export interface ConversationsCore {
  VERSION?: string;
  collect(opts: {
    sources?: { claude?: boolean; codex?: boolean; cursor?: boolean; gemini?: boolean };
    since?: Date;
    until?: Date;
    projectCwd?: string;
    claudeProjectsDir?: string;
    codexDbPath?: string;
    cursorStateDir?: string;
    geminiTmpDir?: string;
  }): AsyncGenerator<ConversationsSessionEvent, void, unknown>;
  aggregateSessions(
    events: AsyncIterable<ConversationsSessionEvent> | Iterable<ConversationsSessionEvent>,
  ): Promise<ConversationSessionAggregate[]>;
}

export interface ClaudeCommitResolveOptions {
  repoRoot: string;
  branch: string;
  sessionStart: string;
  sessionEnd: string;
  windowMs?: number;
  runner?: (repoRoot: string, args: string[]) => string;
}

export interface BuildConversationsExtractionOptions {
  projectCwd?: string;
  repoRoot: string;
  sources?: { claude?: boolean; codex?: boolean; cursor?: boolean; gemini?: boolean };
  since?: Date;
  until?: Date;
  claudeProjectsDir?: string;
  codexDbPath?: string;
  cursorStateDir?: string;
  geminiTmpDir?: string;
  observedAt?: string;
  core?: ConversationsCore;
  repoKey?: (repoRoot: string) => string;
  claudeCommitResolver?: (session: ConversationSessionAggregate) => string | undefined;
}

export const CONVERSATIONS_ONTOLOGY_PROFILE: OntologyProfile = {
  id: "conversations",
  version: "1",
  node_types: {
    Conversation: {
      aliases: ["conversation", "agent conversation"],
      source_backed: true,
    },
    AgentSession: {
      aliases: ["agent session", "assistant session"],
      source_backed: true,
    },
  },
  relation_types: {
    contains_session: {
      source: "Conversation",
      target: "AgentSession",
      requires_evidence: false,
      assertion_basis: ["agent_stats_core"],
      derivation_method: "session_aggregation",
    },
  },
};

function sha256short(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function loadAgentStatsCore(): Promise<ConversationsCore> {
  try {
    return await import("@sentropic/agent-stats-core") as ConversationsCore;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      "Conversations extraction requires the optional peer dependency " +
        "@sentropic/agent-stats-core. Install it in the host project, for example: " +
        "npm install @sentropic/agent-stats-core. Original import error: " + message,
    );
  }
}

function sumUsage(sessions: ConversationSessionAggregate[]): ConversationUsage {
  return sessions.reduce(
    (acc, session) => ({
      newInputTokens: acc.newInputTokens + session.totalUsage.newInputTokens,
      cachedInputTokens: acc.cachedInputTokens + session.totalUsage.cachedInputTokens,
      cacheWriteTokens: acc.cacheWriteTokens + session.totalUsage.cacheWriteTokens,
      outputTokens: acc.outputTokens + session.totalUsage.outputTokens,
      reasoningTokens: acc.reasoningTokens + session.totalUsage.reasoningTokens,
    }),
    { newInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  );
}

function mergeCounts(sessions: ConversationSessionAggregate[], field: "toolCallsByCategory" | "toolCallsByName" | "skillsByName"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const session of sessions) {
    for (const [key, value] of Object.entries(session[field])) {
      counts[key] = (counts[key] ?? 0) + value;
    }
  }
  return counts;
}

function sessionSourceFile(session: ConversationSessionAggregate): string {
  return `conversations/${session.tool}/${session.sessionId}`;
}

function conversationId(projectCwd: string): string {
  return `conversation:${sha256short(projectCwd)}`;
}

function sessionId(session: ConversationSessionAggregate): string {
  return `agent-session:${session.tool}:${session.sessionId}`;
}

function collectPromptStats(events: ConversationsSessionEvent[]): Map<string, { textLength: number; textHashes: string[] }> {
  const stats = new Map<string, { textLength: number; textHashes: string[] }>();
  for (const event of events) {
    if (event.kind !== "user_prompt") continue;
    const current = stats.get(event.sessionId) ?? { textLength: 0, textHashes: [] };
    current.textLength += event.textLength;
    current.textHashes.push(event.textHash);
    stats.set(event.sessionId, current);
  }
  return stats;
}

function runGitLog(repoRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Claude sessions expose branch + cwd but not a commit SHA. This helper keeps
 * the heuristic explicit: choose the closest branch commit whose committer date
 * falls inside the session time window plus a bounded tolerance.
 */
export function resolveClaudeCommit(opts: ClaudeCommitResolveOptions): string | undefined {
  const windowMs = opts.windowMs ?? 15 * 60 * 1000;
  const startMs = Date.parse(opts.sessionStart);
  const endMs = Date.parse(opts.sessionEnd);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || opts.branch.trim().length === 0) {
    return undefined;
  }
  const since = new Date(Math.max(0, startMs - windowMs)).toISOString();
  const until = new Date(endMs + windowMs).toISOString();
  let output = "";
  try {
    output = (opts.runner ?? runGitLog)(opts.repoRoot, [
      "log",
      opts.branch,
      "--format=%H %cI",
      "--since",
      since,
      "--until",
      until,
    ]);
  } catch {
    return undefined;
  }
  let best: { sha: string; distance: number } | undefined;
  for (const line of output.split("\n")) {
    const [sha, date] = line.trim().split(/\s+/, 2);
    if (!sha || !date) continue;
    const commitMs = Date.parse(date);
    if (Number.isNaN(commitMs)) continue;
    const distance = commitMs < startMs ? startMs - commitMs : commitMs > endMs ? commitMs - endMs : 0;
    if (!best || distance < best.distance) best = { sha, distance };
  }
  return best?.sha;
}

function resolveSessionCommit(
  session: ConversationSessionAggregate,
  repoKeyValue: string,
  opts: Pick<BuildConversationsExtractionOptions, "repoRoot" | "claudeCommitResolver">,
): string | undefined {
  if (session.gitCommit) return commitId(repoKeyValue, session.gitCommit);
  if (session.tool !== "claude" || !session.gitBranch) return undefined;
  const sha = opts.claudeCommitResolver
    ? opts.claudeCommitResolver(session)
    : resolveClaudeCommit({
      repoRoot: opts.repoRoot,
      branch: session.gitBranch,
      sessionStart: session.startTs,
      sessionEnd: session.endTs,
    });
  return sha ? commitId(repoKeyValue, sha) : undefined;
}

export async function buildConversationsExtraction(
  opts: BuildConversationsExtractionOptions,
): Promise<Extraction> {
  if (!opts.projectCwd) {
    throw new Error("projectCwd is required for conversations extraction to avoid global agent log ingestion.");
  }

  const core = opts.core ?? await loadAgentStatsCore();
  const collected: ConversationsSessionEvent[] = [];
  for await (const event of core.collect({
    sources: opts.sources,
    since: opts.since,
    until: opts.until,
    projectCwd: opts.projectCwd,
    claudeProjectsDir: opts.claudeProjectsDir,
    codexDbPath: opts.codexDbPath,
    cursorStateDir: opts.cursorStateDir,
    geminiTmpDir: opts.geminiTmpDir,
  })) {
    if (event.projectCwd !== opts.projectCwd && !opts.projectCwd.endsWith("/")) continue;
    if (opts.projectCwd.endsWith("/") && !event.projectCwd.startsWith(opts.projectCwd)) continue;
    collected.push(event);
  }

  const sessions = await core.aggregateSessions(collected);
  const promptStats = collectPromptStats(collected);
  const repoKeyValue = (opts.repoKey ?? defaultRepoKey)(opts.repoRoot);
  const convId = conversationId(opts.projectCwd);
  const observedAt = opts.observedAt ?? new Date().toISOString();
  const sourceHash = sha256short(JSON.stringify({
    projectCwd: opts.projectCwd,
    since: opts.since?.toISOString(),
    until: opts.until?.toISOString(),
    sessions: sessions.map((session) => [session.tool, session.sessionId, session.startTs, session.endTs]),
  }));

  const conversationNode: GraphNode = {
    id: convId,
    label: `Conversations ${opts.projectCwd}`,
    file_type: "rationale",
    source_file: "conversations",
    confidence: "EXTRACTED",
    node_type: "Conversation",
    profile_id: "conversations",
    project_cwd: opts.projectCwd,
    session_count: sessions.length,
    tools: [...new Set(sessions.map((session) => session.tool))].sort(),
    start_ts: sessions.map((session) => session.startTs).sort()[0] ?? observedAt,
    end_ts: sessions.map((session) => session.endTs).sort().at(-1) ?? observedAt,
    total_duration_ms: sessions.reduce((acc, session) => acc + session.durationMs, 0),
    turns: sessions.reduce((acc, session) => acc + session.turns, 0),
    total_usage: sumUsage(sessions),
    tool_call_count: sessions.reduce((acc, session) => acc + session.toolCalls, 0),
    tool_calls_by_category: mergeCounts(sessions, "toolCallsByCategory"),
    tool_calls_by_name: mergeCounts(sessions, "toolCallsByName"),
    skill_invocation_count: sessions.reduce((acc, session) => acc + session.skillInvocations, 0),
    skills_by_name: mergeCounts(sessions, "skillsByName"),
    compaction_count: sessions.reduce((acc, session) => acc + session.compactions, 0),
  };

  const nodes: GraphNode[] = [conversationNode];
  const edges: GraphEdge[] = [];
  const commitTargets = new Set<string>();

  for (const session of sessions) {
    const prompts = promptStats.get(session.sessionId) ?? { textLength: 0, textHashes: [] };
    const sid = sessionId(session);
    nodes.push({
      id: sid,
      label: `${session.tool} ${session.sessionId}`,
      file_type: "rationale",
      source_file: sessionSourceFile(session),
      confidence: "EXTRACTED",
      node_type: "AgentSession",
      profile_id: "conversations",
      vendor: session.tool,
      surface: session.surface,
      session_id: session.sessionId,
      project_cwd: session.projectCwd,
      model: session.model,
      start_ts: session.startTs,
      end_ts: session.endTs,
      duration_ms: session.durationMs,
      turns: session.turns,
      total_usage: session.totalUsage,
      git_branch: session.gitBranch,
      repo_url_hash: session.repoUrl ? sha256short(session.repoUrl) : undefined,
      is_subagent: session.isSubagent,
      forked_from_id_hash: session.forkedFromId ? sha256short(session.forkedFromId) : undefined,
      agent_nickname: session.agentNickname,
      tool_call_count: session.toolCalls,
      tool_calls_by_category: session.toolCallsByCategory,
      tool_calls_by_name: session.toolCallsByName,
      skill_invocation_count: session.skillInvocations,
      skills_by_name: session.skillsByName,
      compaction_count: session.compactions,
      text_length_total: prompts.textLength,
      text_hashes: prompts.textHashes,
      estimated_cost: session.estimatedCost,
    });
    edges.push({
      source: convId,
      target: sid,
      relation: "contains_session",
      confidence: "EXTRACTED",
      source_file: sessionSourceFile(session),
      node_type: "Conversation",
      target_node_type: "AgentSession",
    });

    const target = resolveSessionCommit(session, repoKeyValue, opts);
    if (target) {
      commitTargets.add(target);
      edges.push({
        source: sid,
        target,
        relation: "references_commit",
        confidence: session.gitCommit ? "EXTRACTED" : "INFERRED",
        source_file: sessionSourceFile(session),
        assertion_basis: session.gitCommit ? "agent_stats_core_git_commit" : "claude_git_log_time_window",
        derivation_method: session.gitCommit ? "codex_session_meta_git" : "claude_branch_time_window_git_log",
      });
    }
  }

  for (const target of commitTargets) {
    edges.push({
      source: convId,
      target,
      relation: "references_commit",
      confidence: "INFERRED",
      source_file: "conversations",
      assertion_basis: "session_commit_aggregation",
      derivation_method: "conversation_commit_rollup",
    });
  }

  return {
    provenance: {
      source_owner: "conversations",
      source_id: opts.projectCwd,
      observed_at: observedAt,
      source_hash: sourceHash,
      adapter_version: `${CONVERSATIONS_ADAPTER_VERSION}; agent-stats-core/${core.VERSION ?? AGENT_STATS_CORE_VERSION}`,
    },
    nodes,
    edges,
    input_tokens: 0,
    output_tokens: 0,
  };
}
