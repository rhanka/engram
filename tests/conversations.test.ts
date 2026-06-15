import { describe, expect, it } from "vitest";

import {
  buildConversationsExtraction,
  CONVERSATIONS_ONTOLOGY_PROFILE,
  resolveClaudeCommit,
  type ConversationsCore,
  type ConversationsSessionEvent,
} from "../src/conversations.js";
import { validateExtraction } from "../src/validate.js";
import { validateOntologyProfile } from "../src/ontology-profile.js";

const repoRoot = "/home/u/src/demo";
const repoKeyValue = "repo:github.com/acme/demo";
const codexSha = "abcdef1234567890abcdef1234567890abcdef12";
const claudeSha = "bbbbbb1234567890bbbbbb1234567890bbbbbb12";

const events: ConversationsSessionEvent[] = [
  {
    kind: "session_start",
    ts: "2026-05-18T10:00:00.000Z",
    tool: "codex",
    sessionId: "codex-session",
    projectCwd: repoRoot,
    model: "gpt-5.1-codex",
    gitBranch: "wp5-conversations",
    gitCommit: codexSha,
    repoUrl: "https://github.com/acme/demo.git",
    isSubagent: false,
    surface: "cli",
  },
  {
    kind: "user_prompt",
    ts: "2026-05-18T10:00:02.000Z",
    tool: "codex",
    sessionId: "codex-session",
    projectCwd: repoRoot,
    textLength: 45,
    textHash: "1111111111111111",
  },
  {
    kind: "turn",
    ts: "2026-05-18T10:00:10.000Z",
    tool: "codex",
    sessionId: "codex-session",
    projectCwd: repoRoot,
    model: "gpt-5.1-codex",
    usage: {
      newInputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteTokens: 0,
      outputTokens: 50,
      reasoningTokens: 5,
    },
  },
  {
    kind: "tool_call",
    ts: "2026-05-18T10:00:20.000Z",
    tool: "codex",
    sessionId: "codex-session",
    projectCwd: repoRoot,
    name: "exec_command",
    category: "bash",
    inputBytes: 12,
    outputBytes: 8,
  },
  {
    kind: "skill_invoke",
    ts: "2026-05-18T10:00:25.000Z",
    tool: "codex",
    sessionId: "codex-session",
    projectCwd: repoRoot,
    name: "test-driven-development",
  },
  {
    kind: "session_end",
    ts: "2026-05-18T10:01:00.000Z",
    tool: "codex",
    sessionId: "codex-session",
    projectCwd: repoRoot,
  },
  {
    kind: "session_start",
    ts: "2026-05-18T10:04:00.000Z",
    tool: "claude",
    sessionId: "claude-session",
    projectCwd: repoRoot,
    model: "claude-fable-5",
    gitBranch: "wp5-conversations",
    isSubagent: false,
  },
  {
    kind: "user_prompt",
    ts: "2026-05-18T10:04:02.000Z",
    tool: "claude",
    sessionId: "claude-session",
    projectCwd: repoRoot,
    textLength: 49,
    textHash: "2222222222222222",
  },
  {
    kind: "turn",
    ts: "2026-05-18T10:04:10.000Z",
    tool: "claude",
    sessionId: "claude-session",
    projectCwd: repoRoot,
    model: "claude-fable-5",
    usage: {
      newInputTokens: 200,
      cachedInputTokens: 30,
      cacheWriteTokens: 10,
      outputTokens: 80,
      reasoningTokens: 0,
    },
  },
  {
    kind: "tool_call",
    ts: "2026-05-18T10:04:30.000Z",
    tool: "claude",
    sessionId: "claude-session",
    projectCwd: repoRoot,
    name: "Read",
    category: "native",
  },
  {
    kind: "session_end",
    ts: "2026-05-18T10:05:00.000Z",
    tool: "claude",
    sessionId: "claude-session",
    projectCwd: repoRoot,
  },
];

function fakeCore(): ConversationsCore {
  return {
    async *collect() {
      yield* events;
    },
    async aggregateSessions(collected) {
      const bySession = new Map<string, typeof events>();
      for await (const event of collected) {
        bySession.set(event.sessionId, [...(bySession.get(event.sessionId) ?? []), event]);
      }
      return [...bySession.values()].map((sessionEvents) => {
        const start = sessionEvents.find((event) => event.kind === "session_start")!;
        const end = sessionEvents[sessionEvents.length - 1]!;
        const toolCalls = sessionEvents.filter((event) => event.kind === "tool_call");
        const skills = sessionEvents.filter((event) => event.kind === "skill_invoke");
        const turns = sessionEvents.filter((event) => event.kind === "turn");
        const totalUsage = turns.reduce(
          (acc, event) => ({
            newInputTokens: acc.newInputTokens + event.usage.newInputTokens,
            cachedInputTokens: acc.cachedInputTokens + event.usage.cachedInputTokens,
            cacheWriteTokens: acc.cacheWriteTokens + event.usage.cacheWriteTokens,
            outputTokens: acc.outputTokens + event.usage.outputTokens,
            reasoningTokens: acc.reasoningTokens + event.usage.reasoningTokens,
          }),
          { newInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 },
        );
        return {
          sessionId: start.sessionId,
          tool: start.tool,
          surface: start.surface,
          projectCwd: start.projectCwd,
          model: start.model ?? "unknown",
          startTs: start.ts,
          endTs: end.ts,
          durationMs: Date.parse(end.ts) - Date.parse(start.ts),
          turns: turns.length,
          totalUsage,
          gitBranch: start.gitBranch,
          gitCommit: start.gitCommit,
          repoUrl: start.repoUrl,
          isSubagent: start.isSubagent,
          toolCalls: toolCalls.length,
          toolCallsByCategory: Object.fromEntries(toolCalls.map((event) => [event.category, 1])),
          toolCallsByName: Object.fromEntries(toolCalls.map((event) => [event.name, 1])),
          skillInvocations: skills.length,
          skillsByName: Object.fromEntries(skills.map((event) => [event.name, 1])),
          compactions: 0,
          estimatedCost: { codexCredits: 0, claudeUsdCents: 0, unknown: 0 },
        };
      });
    },
  };
}

describe("conversations connector", () => {
  it("declares a conversations ontology profile for Conversation and AgentSession", () => {
    expect(validateOntologyProfile(CONVERSATIONS_ONTOLOGY_PROFILE)).toEqual([]);
    expect(Object.keys(CONVERSATIONS_ONTOLOGY_PROFILE.node_types).sort()).toEqual([
      "AgentSession",
      "Conversation",
    ]);
  });

  it("builds a validateExtraction-compatible fragment with commit edges and redacted aggregates", async () => {
    const extraction = await buildConversationsExtraction({
      projectCwd: repoRoot,
      repoRoot,
      core: fakeCore(),
      repoKey: () => repoKeyValue,
      claudeCommitResolver: () => claudeSha,
      observedAt: "2026-05-18T11:00:00.000Z",
    });

    expect(validateExtraction(extraction)).toEqual([]);
    expect(extraction.provenance).toMatchObject({
      source_owner: "conversations",
      source_id: repoRoot,
      observed_at: "2026-05-18T11:00:00.000Z",
      adapter_version: "graphify-conversations/0.1.0; agent-stats-core/0.3.0",
    });

    const nodeTypes = extraction.nodes.map((node) => node.node_type).sort();
    expect(nodeTypes).toEqual(["AgentSession", "AgentSession", "Conversation"]);
    expect(extraction.nodes.every((node) => node.file_type === "rationale")).toBe(true);

    const conversation = extraction.nodes.find((node) => node.node_type === "Conversation")!;
    expect(conversation.session_count).toBe(2);
    expect(conversation.tool_call_count).toBe(2);
    expect(conversation.skill_invocation_count).toBe(1);

    const codex = extraction.nodes.find((node) => node.id === "agent-session:codex:codex-session")!;
    expect(codex.tool_call_count).toBe(1);
    expect(codex.tool_calls_by_name).toEqual({ exec_command: 1 });
    expect(codex.skill_invocation_count).toBe(1);
    expect(codex.skills_by_name).toEqual({ "test-driven-development": 1 });
    expect(codex.text_length_total).toBe(45);
    expect(codex.text_hashes).toEqual(["1111111111111111"]);

    const targets = extraction.edges.map((edge) => edge.target).sort();
    expect(targets).toContain(`commit:${repoKeyValue}@${codexSha}`);
    expect(targets).toContain(`commit:${repoKeyValue}@${claudeSha}`);

    const json = JSON.stringify(extraction);
    expect(json).not.toContain("Bonjour Claude");
    expect(json).not.toContain("peux-tu");
    expect(json).not.toContain("lister les fichiers");
    expect(json).not.toContain("rawText");
    expect(json).not.toContain("prompt");
  });

  it("requires projectCwd to avoid global agent log ingestion", async () => {
    await expect(
      buildConversationsExtraction({ repoRoot, core: fakeCore(), repoKey: () => repoKeyValue }),
    ).rejects.toThrow(/projectCwd is required/i);
  });

  it("resolves Claude branch-only sessions from a time-windowed local git log", () => {
    const sha = resolveClaudeCommit({
      branch: "wp5-conversations",
      sessionStart: "2026-05-18T10:04:00.000Z",
      sessionEnd: "2026-05-18T10:05:00.000Z",
      runner: () => [
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2026-05-18T09:00:00+00:00",
        `${claudeSha} 2026-05-18T10:04:30+00:00`,
      ].join("\n"),
      repoRoot,
    });

    expect(sha).toBe(claudeSha);
  });
});
