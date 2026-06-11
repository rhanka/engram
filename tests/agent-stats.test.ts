import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { parseClaudeTranscript } from "../src/agent-stats/claude-transcript.js";
import { parseCodexRollout } from "../src/agent-stats/codex-rollout.js";
import { parseAgyChat } from "../src/agent-stats/agy-chat.js";
import { normalizeClaude, pathToTilde } from "../src/agent-stats/normalize.js";
import { correlate } from "../src/agent-stats/correlate.js";
import { redact, redactExcerpt } from "../src/agent-stats/redact.js";
import { classifyGitVerb, scrapeGroundTruth, emptyGroundTruth, parseWpLabel } from "../src/agent-stats/git-evidence.js";
import { matchInstance, type H2aInstance } from "../src/agent-stats/registry.js";
import { resolveIdentity } from "../src/agent-stats/identity.js";
import {
  computeAgentStats,
  listSessions,
  syncAgentStats,
  formatStatsTable,
} from "../src/agent-stats/index.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/agent-stats/${name}`, import.meta.url), "utf-8");
}

describe("agent-stats redaction (privacy)", () => {
  it("strips emails, tokens, and home paths from evidence", () => {
    const home = "/home/antoinefa";
    const raw = "git commit by fabien.antoine@gmail.com token=ghp_ABCDEFGHIJKLMNOPQRSTUVWX in /home/antoinefa/src/graphify";
    const out = redact(raw, home);
    expect(out).not.toContain("fabien.antoine@gmail.com");
    expect(out).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(out).not.toContain("/home/antoinefa");
    expect(out).toContain("<email>");
    expect(out).toContain("~");
  });

  it("clamps long excerpts", () => {
    const long = "x".repeat(500);
    expect(redactExcerpt(long, "", 50).length).toBeLessThanOrEqual(51);
  });

  it("normalizes absolute home paths to ~ for on-disk privacy", () => {
    expect(pathToTilde("/home/antoinefa/src/graphify", "/home/antoinefa")).toBe("~/src/graphify");
    // Even without the exact home passed, generic /home/<user> and /Users/<user> are stripped.
    expect(pathToTilde("/home/someone/x/y", "/nonmatch")).toBe("~/x/y");
    expect(pathToTilde("/Users/bob/proj", "/nonmatch")).toBe("~/proj");
    expect(pathToTilde("/tmp/repo", "/home/antoinefa")).toBe("/tmp/repo");
  });
});

describe("agent-stats git evidence", () => {
  it("classifies git verbs from command inputs", () => {
    expect(classifyGitVerb("git checkout -b feat/x")).toBe("checkout-b");
    expect(classifyGitVerb("git add -A && git commit -m 'x'")).toBe("commit");
    expect(classifyGitVerb("git push origin HEAD")).toBe("push");
    expect(classifyGitVerb("gh pr create --head x")).toBe("pr-create");
    expect(classifyGitVerb("gh pr merge 119 --merge")).toBe("pr-merge");
    expect(classifyGitVerb("ls -la")).toBeNull();
  });

  it("scrapes ground truth (commit shas + PR urls) from tool outputs", () => {
    const acc = emptyGroundTruth();
    scrapeGroundTruth("[wp1-repo-keys 37fbdee] feat: x\n 2 files changed", acc);
    scrapeGroundTruth("https://github.com/rhanka/graphify/pull/119", acc);
    expect(acc.commitShas).toContain("37fbdee");
    expect(acc.branches).toContain("wp1-repo-keys");
    expect(acc.prUrls).toContain("https://github.com/rhanka/graphify/pull/119");
  });

  it("parses WP labels from branches and subjects", () => {
    expect(parseWpLabel("wp1-repo-keys")).toBe("WP1");
    expect(parseWpLabel("feat: WP9 agent-stats")).toBe("WP9");
    expect(parseWpLabel("feat/ontology")).toBeNull();
  });
});

describe("agent-stats host parsers", () => {
  it("parses a Codex rollout: subagent lineage, cwd, git verbs, ground truth", () => {
    const lines = [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-05-01T10:00:00.000Z",
        payload: {
          id: "codex-sess-1",
          cwd: "/tmp/repo",
          cli_version: "0.133.0",
          source: { subagent: { thread_spawn: { parent_thread_id: "p-1", agent_nickname: "Galileo", agent_role: "explorer" } } },
          git: { branch: "feat/codex-x" },
        },
      }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-05-01T10:00:01.000Z", payload: { model: "gpt-x", cwd: "/tmp/repo" } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-05-01T10:01:00.000Z", payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "git commit -m wip", workdir: "/tmp/repo" }) } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-05-01T10:01:01.000Z", payload: { type: "function_call_output", call_id: "c1", output: "[feat/codex-x deadbee] wip\n 1 file changed" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-05-01T10:02:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 5, total_tokens: 125 } } } }),
    ].join("\n");
    const s = parseCodexRollout(lines, "codex-sess-1");
    expect(s.parent?.nickname).toBe("Galileo");
    expect(s.parent?.role).toBe("explorer");
    expect(s.cwds).toContain("/tmp/repo");
    expect(s.gitActions.some((a) => a.verb === "commit")).toBe(true);
    expect(s.groundTruth.commitShas).toContain("deadbee");
    expect(s.tokens.total).toBe(125);
  });

  it("parses an agy chat: sparse tokens + projectHash", () => {
    const lines = [
      JSON.stringify({ sessionId: "agy-1", projectHash: "abc123", startTime: "2026-05-02T10:00:00.000Z", kind: "main" }),
      JSON.stringify({ $set: { lastUpdated: "2026-05-02T10:00:01.000Z" } }),
      JSON.stringify({ type: "user", content: [{ text: "hi" }], timestamp: "2026-05-02T10:00:02.000Z" }),
      JSON.stringify({ type: "gemini", model: "gemini-3.5-flash", tokens: { input: 11, output: 2, cached: 0, total: 13 }, timestamp: "2026-05-02T10:00:03.000Z" }),
    ].join("\n");
    const s = parseAgyChat(lines, "agy-1");
    expect(s.projectHash).toBe("abc123");
    expect(s.models).toContain("gemini-3.5-flash");
    expect(s.tokens.total).toBe(13);
  });
});

describe("agent-stats end-to-end attribution (WP1 acceptance)", () => {
  function setupRepo(): { repoRoot: string; commitSha: string } {
    const root = mkdtempSync(join(tmpdir(), "agentstats-repo-"));
    tempDirs.push(root);
    // h2a registry: a registered claude instance whose workspace IS this repo.
    const regDir = join(root, ".h2a", "registry");
    mkdirSync(regDir, { recursive: true });
    writeFileSync(
      join(regDir, "instances.jsonl"),
      JSON.stringify({
        id: "claude:graphify:17bddf135979",
        name: "graphify",
        workspace: { path: root, host: "claude", label: "graphify" },
      }) + "\n",
    );
    return { repoRoot: root, commitSha: "37fbdee0000000000000000000000000000000ab" };
  }

  it("attributes the wp1-repo-keys commit to the agent SESSION, never to a git author", () => {
    const { repoRoot, commitSha } = setupRepo();
    const fixture = loadFixture("claude-wp1-repo-keys.jsonl").split("__REPO__").join(repoRoot);

    // parse → normalize
    const fact = normalizeClaude(parseClaudeTranscript(fixture, "fixture-wp1-0001"));
    expect(fact.cwds[0]).toBe(`${repoRoot}/.claude/worktrees/agent-wp1abc`);
    expect(fact.groundTruth.commitShas).toContain("37fbdee");
    expect(fact.groundTruth.prUrls).toContain("https://github.com/rhanka/graphify/pull/119");
    expect(fact.gitActions.some((a) => a.verb === "checkout-b")).toBe(true);

    // correlate against an injected git log containing the real wp1 commit.
    const instances: H2aInstance[] = [
      { id: "claude:graphify:17bddf135979", host: "claude", name: "graphify", workspacePath: repoRoot, label: "graphify" },
    ];
    const links = correlate({
      facts: [fact],
      instances,
      commits: [{ sha: commitSha, subject: "feat(merge): repo-key cross-repo identity keys, fix homonym-repo tag collision (WP1)" }],
    });

    // rank-1 commit-sha-output link must exist and resolve to the registered agent id.
    const rank1 = links.find((l) => l.rule === "commit-sha-output");
    expect(rank1).toBeDefined();
    expect(rank1!.target).toMatchObject({ kind: "commit", branch: "wp1-repo-keys" });
    expect(rank1!.agentId).toBe("claude:graphify:17bddf135979");
    expect(rank1!.agentId).not.toBe("antoinefa");
    expect(rank1!.confidence).toBe("high");

    // identity never derives from a git author/email.
    const inst = matchInstance(instances, fact.host, fact.cwds);
    expect(resolveIdentity(fact, inst).registered).toBe(true);
  });

  it("syncs from a discovered transcript and re-derives the stats table", () => {
    const { repoRoot, commitSha } = setupRepo();
    // Lay the fixture out exactly where the Claude host would store it:
    //   <home>/.claude/projects/<repo-slug>/<session>.jsonl
    const home = mkdtempSync(join(tmpdir(), "agentstats-home-"));
    tempDirs.push(home);
    const slug = repoRoot.replace(/\//g, "-");
    const projDir = join(home, ".claude", "projects", slug);
    mkdirSync(projDir, { recursive: true });
    const fixture = loadFixture("claude-wp1-repo-keys.jsonl").split("__REPO__").join(repoRoot);
    writeFileSync(join(projDir, "fixture-wp1-0001.jsonl"), fixture);

    const result = syncAgentStats({ repoRoot, home });
    expect(result.parsed).toBeGreaterThanOrEqual(1);
    expect(result.inRepo).toBeGreaterThanOrEqual(1);
    expect(result.factsTotal).toBeGreaterThanOrEqual(1);

    // facts.jsonl is written under .graphify/agents and contains NO raw prompt text.
    const factsRaw = readFileSync(join(repoRoot, ".graphify", "agents", "facts.jsonl"), "utf-8");
    expect(factsRaw).toContain("fixture-wp1-0001");
    expect(factsRaw).not.toContain("Implement WP1 repo-key cross-repo identity keys");
    // PRIVACY: no absolute home paths persisted (redacted to ~).
    expect(factsRaw).not.toMatch(/\/home\/[A-Za-z0-9._-]+\//);
    expect(factsRaw).not.toMatch(/\/Users\/[A-Za-z0-9._-]+\//);

    // compute with an injected git log → table attributes WP1 to the agent, with a commit.
    const { rows, links } = computeAgentStats(repoRoot, [
      { sha: commitSha, subject: "feat(merge): repo-key cross-repo identity keys (WP1)" },
    ]);
    expect(links.some((l) => l.rule === "commit-sha-output")).toBe(true);
    const agentRow = rows.find((r) => r.agentId === "claude:graphify:17bddf135979");
    expect(agentRow).toBeDefined();
    expect(agentRow!.commits).toBeGreaterThanOrEqual(1);
    expect(agentRow!.branches).toBeGreaterThanOrEqual(1);
    expect(agentRow!.wpsTouched).toContain("WP1");

    const table = formatStatsTable(rows);
    expect(table).toContain("claude:graphify:17bddf135979");
    expect(table).not.toContain("antoinefa");

    // sessions listing + branch filter
    const { facts } = listSessions(repoRoot, { branch: "wp1-repo-keys" });
    expect(facts.length).toBe(1);
    expect(facts[0]!.sessionId).toBe("fixture-wp1-0001");
  });

  it("falls back to a synthetic unregistered id when no h2a instance matches", () => {
    const root = mkdtempSync(join(tmpdir(), "agentstats-noreg-"));
    tempDirs.push(root);
    const fixture = loadFixture("claude-wp1-repo-keys.jsonl").split("__REPO__").join(root);
    const fact = normalizeClaude(parseClaudeTranscript(fixture, "fixture-wp1-0001"));
    const inst = matchInstance([], fact.host, fact.cwds);
    const id = resolveIdentity(fact, inst);
    expect(id.registered).toBe(false);
    expect(id.agentId).toMatch(/^claude:.*:unregistered$/);
    expect(id.agentId).not.toBe("antoinefa");
  });
});
