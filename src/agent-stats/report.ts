/**
 * WP9 agent-stats — structured report: the STABLE output contract for
 * downstream tools (`graphify agent-stats --format json`).
 *
 * SCHEMA `graphify.agent-stats/v1`
 * ────────────────────────────────
 *   schema       "graphify.agent-stats/v1" — bump only on breaking change.
 *   generatedAt  ISO-8601 timestamp of report generation.
 *   agents[]     One entry per evidence-resolved agent identity:
 *     agentId      h2a instance id (`host:name:hash12`) or synthetic
 *                  `host:<label>:unregistered`. NEVER a git author/email.
 *     host         "claude" | "codex" | "agy".
 *     registered   true when matched to a registered h2a instance.
 *     sessions     Number of parsed transcript sessions for this agent.
 *     tokens       { raw, weighted } — raw face-value total and the
 *                  cost-weighted total (cache reads discounted to ~10%).
 *     confidence   Best evidence band backing this agent's links
 *                  ("high" | "medium" | "low" | "-").
 *     lastActive   ISO-8601 end of the agent's most recent session.
 *     branches[]   Distinct branches attributed by evidence (never just
 *                  "observed": committed-on, created, or PR-merged).
 *     wps[]        Distinct work-package labels touched (e.g. "WP9").
 *     features[]   Heuristic feature labels derived from branch names
 *                  (`feat/x` → "x", `wp9-agent-stats` → "agent-stats").
 *     commits[]    Evidence-backed commits: { sha, branch?, rule,
 *                  confidence, evidence } — `evidence` is an ANONYMIZED
 *                  justification string (redacted upstream).
 *     citations[]  Up to {@link MAX_CITATIONS} anonymized evidence snippets
 *                  ({ kind, text, timestamp? }) proving the attribution.
 *   residual     { totalCommits, unattributedCommits } — commits in git log
 *                no agent claimed (honest coverage; includes human commits).
 *   conflicts[]  Commits claimed by MORE THAN ONE agent — a data-quality /
 *                spoofing signal, surfaced instead of silently picking one.
 *
 * PRIVACY: every string placed in this report has already passed through
 * redact.ts (no raw prompts, no secrets/PII, home paths as `~`).
 */

import { parseWpLabel } from "./git-evidence.js";
import { resolveIdentity } from "./identity.js";
import { matchInstance, type H2aInstance } from "./registry.js";
import type { CommitConflict } from "./correlate.js";
import type {
  AgentStatsRow,
  AttributionResidual,
  Confidence,
  CorrelationLink,
  SessionFact,
} from "./types.js";

export const AGENT_STATS_SCHEMA = "graphify.agent-stats/v1" as const;
export const SESSIONS_SCHEMA = "graphify.agent-stats.sessions/v1" as const;

/** Max anonymized citations kept per agent in the report. */
export const MAX_CITATIONS = 5;

export interface ReportCitation {
  kind: string;
  /** Anonymized excerpt (already redacted upstream). */
  text: string;
  timestamp?: string;
}

export interface ReportCommit {
  /** Sha as known to git log (may be abbreviated when only observed). */
  sha: string;
  branch?: string;
  /** Correlation rule that produced this attribution. */
  rule: CorrelationLink["rule"];
  confidence: Confidence;
  /** Anonymized human-readable justification. */
  evidence: string;
}

export interface AgentReport {
  agentId: string;
  host: SessionFact["host"];
  registered: boolean;
  sessions: number;
  tokens: { raw: number; weighted: number };
  confidence: Confidence | "-";
  lastActive?: string;
  branches: string[];
  wps: string[];
  features: string[];
  commits: ReportCommit[];
  citations: ReportCitation[];
}

export interface AgentStatsReport {
  schema: typeof AGENT_STATS_SCHEMA;
  generatedAt: string;
  agents: AgentReport[];
  residual?: AttributionResidual;
  /** Commits claimed by more than one agent (spoof / data-quality signal). */
  conflicts: CommitConflict[];
}

/** Everything {@link buildReport} needs (structurally ⊆ ComputeResult). */
export interface ReportInput {
  rows: AgentStatsRow[];
  links: CorrelationLink[];
  facts: SessionFact[];
  instances: H2aInstance[];
  residual?: AttributionResidual;
  conflicts?: CommitConflict[];
}

/** Heuristic feature label from a branch name (`feat/x` → `x`). */
export function featureFromBranch(branch: string): string | null {
  if (typeof branch !== "string" || !branch) return null;
  const m = branch.match(/^(?:feat|fix|feature)[/-](.+)$/) ?? branch.match(/^wp\d+-(.+)$/i);
  return m && m[1] ? m[1] : null;
}

/**
 * Build the stable report from a compute result. Counts mirror the table
 * aggregation in stats.ts (incl. the squash dedupe: a pr-merge commit for a
 * branch the agent already proved via rank-1 is the same unit of work).
 */
export function buildReport(input: ReportInput): AgentStatsReport {
  // factId → resolved agentId, for citation grouping.
  const factAgent = new Map<string, string>();
  const factById = new Map<string, SessionFact>();
  for (const fact of input.facts) {
    const inst = matchInstance(input.instances, fact.host, fact.cwds);
    factAgent.set(fact.factId, resolveIdentity(fact, inst).agentId);
    factById.set(fact.factId, fact);
  }

  // Branches each agent proved via rank-1 commit output (squash dedupe).
  const rank1Branches = new Map<string, Set<string>>();
  for (const link of input.links) {
    if (link.rule !== "commit-sha-output" || link.target.kind !== "commit" || !link.target.branch) continue;
    let set = rank1Branches.get(link.agentId);
    if (!set) rank1Branches.set(link.agentId, (set = new Set()));
    set.add(link.target.branch);
  }

  interface Detail {
    branches: Set<string>;
    wps: Set<string>;
    commits: Map<string, ReportCommit>; // keyed by sha7
  }
  const details = new Map<string, Detail>();
  const detailFor = (agentId: string): Detail => {
    let d = details.get(agentId);
    if (!d) details.set(agentId, (d = { branches: new Set(), wps: new Set(), commits: new Map() }));
    return d;
  };

  for (const link of input.links) {
    const d = detailFor(link.agentId);
    if (link.target.kind === "commit") {
      const isDupSquash =
        link.rule === "pr-merge" &&
        Boolean(link.target.branch) &&
        rank1Branches.get(link.agentId)?.has(link.target.branch!) === true;
      const key = link.target.sha.slice(0, 7).toLowerCase();
      if (!isDupSquash && !d.commits.has(key)) {
        d.commits.set(key, {
          sha: link.target.sha,
          branch: link.target.branch,
          rule: link.rule,
          confidence: link.confidence,
          evidence: link.evidence,
        });
      }
      if (link.target.branch) {
        d.branches.add(link.target.branch);
        const wp = parseWpLabel(link.target.branch);
        if (wp) d.wps.add(wp);
      }
    } else if (link.target.kind === "branch") {
      if (link.target.branch && link.target.branch !== "(workspace)") {
        d.branches.add(link.target.branch);
        const wp = parseWpLabel(link.target.branch);
        if (wp) d.wps.add(wp);
      }
    } else if (link.target.kind === "wp") {
      const wp = link.target.wp ?? parseWpLabel(link.target.trackItemId);
      if (wp) d.wps.add(wp);
    }
  }

  // Citations: anonymized evidence snippets from the agent's own sessions,
  // strongest kinds first (git-commit > pr-url > checkout/push).
  const KIND_ORDER: Record<string, number> = { "git-commit": 0, "pr-url": 1, "git-checkout": 2, "git-push": 3 };
  const citationsByAgent = new Map<string, ReportCitation[]>();
  for (const fact of input.facts) {
    const agentId = factAgent.get(fact.factId);
    if (!agentId) continue;
    let list = citationsByAgent.get(agentId);
    if (!list) citationsByAgent.set(agentId, (list = []));
    for (const e of fact.evidence) list.push({ kind: e.kind, text: e.text, timestamp: e.timestamp });
  }
  for (const list of citationsByAgent.values()) {
    list.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    list.splice(MAX_CITATIONS);
  }

  const agents: AgentReport[] = input.rows.map((row) => {
    const d = details.get(row.agentId);
    return {
      agentId: row.agentId,
      host: row.host,
      registered: row.registered,
      sessions: row.sessions,
      tokens: { raw: row.tokens, weighted: row.tokensWeighted },
      confidence: row.confidence,
      lastActive: row.lastActive,
      branches: d ? Array.from(d.branches).sort() : [],
      wps: row.wpsTouched,
      features: d
        ? Array.from(
            new Set(Array.from(d.branches).map(featureFromBranch).filter((f): f is string => f !== null)),
          ).sort()
        : [],
      commits: d ? Array.from(d.commits.values()) : [],
      citations: citationsByAgent.get(row.agentId) ?? [],
    };
  });

  return {
    schema: AGENT_STATS_SCHEMA,
    generatedAt: new Date().toISOString(),
    agents,
    residual: input.residual,
    conflicts: input.conflicts ?? [],
  };
}

/* ────────────────────────── sessions report ────────────────────────── */

export interface SessionEntry {
  factId: string;
  host: SessionFact["host"];
  sessionId: string;
  /** Evidence-resolved agent identity (never a git author). */
  agentId: string;
  registered: boolean;
  startedAt?: string;
  endedAt?: string;
  models: string[];
  branches: string[];
  /** Commit shas this session's own git output proved. */
  commitShas: string[];
  prUrls: string[];
  tokens: SessionFact["tokens"];
  filesTouched: number;
  citations: ReportCitation[];
}

export interface SessionsReport {
  schema: typeof SESSIONS_SCHEMA;
  generatedAt: string;
  sessions: SessionEntry[];
}

/** Build the stable `sessions --format json` report. */
export function buildSessionsReport(facts: SessionFact[], instances: H2aInstance[]): SessionsReport {
  const sessions: SessionEntry[] = facts.map((f) => {
    const inst = matchInstance(instances, f.host, f.cwds);
    const id = resolveIdentity(f, inst);
    return {
      factId: f.factId,
      host: f.host,
      sessionId: f.sessionId,
      agentId: id.agentId,
      registered: id.registered,
      startedAt: f.startedAt,
      endedAt: f.endedAt,
      models: f.models,
      branches: Array.from(new Set([...f.branchesObserved, ...f.groundTruth.branches])).filter(
        (b) => b && b !== "HEAD",
      ),
      commitShas: f.groundTruth.commitShas,
      prUrls: f.groundTruth.prUrls,
      tokens: f.tokens,
      filesTouched: f.filesTouched.length,
      citations: f.evidence.slice(0, MAX_CITATIONS).map((e) => ({ kind: e.kind, text: e.text, timestamp: e.timestamp })),
    };
  });
  return { schema: SESSIONS_SCHEMA, generatedAt: new Date().toISOString(), sessions };
}

/** Keep only agents whose id contains `agentFilter` (case-insensitive). */
export function filterReportAgents(report: AgentStatsReport, agentFilter?: string): AgentStatsReport {
  if (!agentFilter) return report;
  const needle = agentFilter.toLowerCase();
  return { ...report, agents: report.agents.filter((a) => a.agentId.toLowerCase().includes(needle)) };
}

/* ─────────────────────────── text rendering ─────────────────────────── */

/**
 * Render the per-agent detail report as plain text — the "which agent did
 * what" view (`graphify agent-stats report`).
 */
export function formatReportText(report: AgentStatsReport): string {
  const lines: string[] = [`Agent stats report — generated ${report.generatedAt}`];
  if (report.residual) {
    const attributed = report.residual.totalCommits - report.residual.unattributedCommits;
    lines.push(
      `Coverage: ${attributed}/${report.residual.totalCommits} commits attributed (${report.residual.unattributedCommits} unattributed/human)`,
    );
  }
  if (report.agents.length === 0) {
    lines.push("", "No agents matched. Run `graphify agent-stats sync` first.");
    return lines.join("\n");
  }
  for (const a of report.agents) {
    lines.push(
      "",
      `AGENT ${a.agentId}  [${a.host}, ${a.registered ? "registered" : "unregistered"}]`,
      `  sessions: ${a.sessions}   tokens: ${fmtTokens(a.tokens.raw)} raw / ${fmtTokens(a.tokens.weighted)} weighted   confidence: ${a.confidence}   last active: ${a.lastActive?.slice(0, 10) ?? "-"}`,
    );
    if (a.branches.length) lines.push(`  branches: ${a.branches.join(", ")}`);
    if (a.features.length) lines.push(`  features: ${a.features.join(", ")}`);
    if (a.wps.length) lines.push(`  WPs:      ${a.wps.join(", ")}`);
    if (a.commits.length) {
      lines.push(`  commits (${a.commits.length}):`);
      for (const c of a.commits) {
        lines.push(`    ${c.sha.slice(0, 7)}  ${c.branch ?? "?"}  ${c.rule} (${c.confidence})`);
      }
    }
    if (a.citations.length) {
      lines.push("  citations (anonymized):");
      for (const cit of a.citations) lines.push(`    [${cit.kind}] ${cit.text}`);
    }
  }
  if (report.conflicts.length) {
    lines.push("", `WARNING: ${report.conflicts.length} commit(s) claimed by more than one agent:`);
    for (const c of report.conflicts) {
      lines.push(
        `  ${c.sha.slice(0, 7)}${c.branch ? ` (${c.branch})` : ""}: ${c.agents.map((x) => `${x.agentId} via ${x.rule}`).join(" AND ")}`,
      );
    }
  }
  return lines.join("\n");
}

/* ───────────────────────── markdown rendering ───────────────────────── */

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Render the report as Markdown (`--format md`). */
export function formatReportMarkdown(report: AgentStatsReport): string {
  const lines: string[] = [
    "# Agent stats — evidence-based attribution",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Agent | Sess | Tokens(w) | Conf | Commits | Branches | WPs | Last active |",
    "| --- | ---: | ---: | --- | ---: | ---: | --- | --- |",
  ];
  for (const a of report.agents) {
    lines.push(
      `| \`${a.agentId}\` | ${a.sessions} | ${fmtTokens(a.tokens.weighted)} | ${a.confidence} | ${a.commits.length} | ${a.branches.length} | ${a.wps.join(", ") || "-"} | ${a.lastActive?.slice(0, 10) ?? "-"} |`,
    );
  }
  if (report.residual) {
    lines.push(
      `| (unattributed/human) | - | - | - | ${report.residual.unattributedCommits}/${report.residual.totalCommits} | - | - | - |`,
    );
  }
  for (const a of report.agents) {
    lines.push("", `## ${a.agentId}`, "");
    lines.push(`- host: ${a.host} (${a.registered ? "registered" : "unregistered"})`);
    lines.push(`- sessions: ${a.sessions}, tokens: ${fmtTokens(a.tokens.raw)} raw / ${fmtTokens(a.tokens.weighted)} weighted`);
    if (a.branches.length) lines.push(`- branches: ${a.branches.join(", ")}`);
    if (a.features.length) lines.push(`- features: ${a.features.join(", ")}`);
    if (a.wps.length) lines.push(`- work-packages: ${a.wps.join(", ")}`);
    if (a.commits.length) {
      lines.push("- commits:");
      for (const c of a.commits) {
        lines.push(`  - \`${c.sha.slice(0, 7)}\` on \`${c.branch ?? "?"}\` (${c.rule}, ${c.confidence})`);
      }
    }
    if (a.citations.length) {
      lines.push("- citations (anonymized):");
      for (const cit of a.citations) lines.push(`  - [${cit.kind}] ${cit.text}`);
    }
  }
  if (report.conflicts.length) {
    lines.push("", "## Conflicts (same commit claimed by several agents)", "");
    for (const c of report.conflicts) {
      lines.push(`- \`${c.sha.slice(0, 7)}\`${c.branch ? ` on \`${c.branch}\`` : ""}: ${c.agents.map((x) => `${x.agentId} (${x.rule})`).join(" vs ")}`);
    }
  }
  return lines.join("\n");
}
