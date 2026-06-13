/**
 * WP9 agent-stats — aggregation into the per-agent table.
 *
 * Counts (commits/branches/WPs) come from CORRELATION LINKS, so they reflect
 * evidence-backed attribution, not git authorship. Sessions/tokens/last-active
 * come from the facts themselves.
 */

import { parseWpLabel } from "./git-evidence.js";
import { matchInstance, type H2aInstance } from "./registry.js";
import { resolveIdentity } from "./identity.js";
import type {
  AgentHost,
  AgentStatsRow,
  AttributionResidual,
  Confidence,
  CorrelationLink,
  SessionFact,
  TokenTotals,
} from "./types.js";

export interface AggregateInput {
  facts: SessionFact[];
  links: CorrelationLink[];
  instances: H2aInstance[];
}

/**
 * Cost-weighted tokens: cache READS are billed at roughly 10% of a fresh
 * input token, so a cache-heavy session must not look 10× more expensive than
 * it was. Hosts report usage differently:
 *   - claude: `input` EXCLUDES cache reads; `total` additionally includes
 *     cache-creation tokens (counted at face value here).
 *   - codex: `input` INCLUDES cached input tokens.
 *   - agy: no cache split — weighted ≈ total.
 * This is a comparable-effort heuristic, not an exact invoice.
 */
export function costWeightedTokens(tokens: TokenTotals, host: AgentHost): number {
  const input = tokens.input || 0;
  const output = tokens.output || 0;
  const cached = tokens.cached || 0;
  const total = tokens.total || 0;
  if (host === "codex") {
    const fresh = Math.max(0, input - cached);
    return Math.round(fresh + output + 0.1 * cached);
  }
  const creation = Math.max(0, total - input - output - cached);
  return Math.round(input + output + creation + 0.1 * cached);
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

interface Acc {
  agentId: string;
  host: SessionFact["host"];
  registered: boolean;
  sessions: Set<string>;
  tokens: number;
  tokensWeighted: number;
  confidence: Confidence | "-";
  commits: Set<string>;
  branches: Set<string>;
  wps: Set<string>;
  lastActive?: string;
}

export function aggregate(input: AggregateInput): AgentStatsRow[] {
  const accs = new Map<string, Acc>();

  function accFor(agentId: string, host: SessionFact["host"], registered: boolean): Acc {
    let a = accs.get(agentId);
    if (!a) {
      a = {
        agentId,
        host,
        registered,
        sessions: new Set(),
        tokens: 0,
        tokensWeighted: 0,
        confidence: "-",
        commits: new Set(),
        branches: new Set(),
        wps: new Set(),
      };
      accs.set(agentId, a);
    }
    return a;
  }

  // Sessions + tokens, keyed by each fact's resolved identity.
  for (const fact of input.facts) {
    const inst = matchInstance(input.instances, fact.host, fact.cwds);
    const id = resolveIdentity(fact, inst);
    const a = accFor(id.agentId, fact.host, id.registered);
    a.sessions.add(fact.factId);
    a.tokens += fact.tokens.total || 0;
    a.tokensWeighted += costWeightedTokens(fact.tokens, fact.host);
    if (fact.endedAt && (!a.lastActive || fact.endedAt > a.lastActive)) a.lastActive = fact.endedAt;
  }

  // SQUASH DEDUPE: branches an agent already proved via rank-1 commit output.
  // A pr-merge squash commit for such a branch is the SAME unit of work as
  // the branch commits — counting both would inflate every PR by one (N+1).
  const rank1Branches = new Map<string, Set<string>>();
  for (const link of input.links) {
    if (link.rule !== "commit-sha-output" || link.target.kind !== "commit" || !link.target.branch) continue;
    let set = rank1Branches.get(link.agentId);
    if (!set) {
      set = new Set();
      rank1Branches.set(link.agentId, set);
    }
    set.add(link.target.branch);
  }

  // Evidence-backed commits/branches/WPs from correlation links.
  for (const link of input.links) {
    const a = accs.get(link.agentId);
    if (!a) continue;
    if (link.confidence !== a.confidence && a.confidence !== "high") {
      const cur = a.confidence === "-" ? 0 : CONFIDENCE_ORDER[a.confidence];
      if (CONFIDENCE_ORDER[link.confidence] > cur) a.confidence = link.confidence;
    }
    if (link.target.kind === "commit") {
      const isDupSquash =
        link.rule === "pr-merge" &&
        Boolean(link.target.branch) &&
        rank1Branches.get(link.agentId)?.has(link.target.branch!) === true;
      if (!isDupSquash) a.commits.add(link.target.sha.slice(0, 7));
      if (link.target.branch) {
        a.branches.add(link.target.branch);
        const wp = parseWpLabel(link.target.branch);
        if (wp) a.wps.add(wp);
      }
    } else if (link.target.kind === "branch") {
      if (link.target.branch && link.target.branch !== "(workspace)") {
        a.branches.add(link.target.branch);
        const wp = parseWpLabel(link.target.branch);
        if (wp) a.wps.add(wp);
      }
    } else if (link.target.kind === "wp") {
      // Track-ledger WP join: the WP label is authoritative (mandated), so add it
      // even when no branch carried the label.
      const wp = link.target.wp ?? parseWpLabel(link.target.trackItemId);
      if (wp) a.wps.add(wp);
    }
  }

  return Array.from(accs.values())
    .map((a) => ({
      agentId: a.agentId,
      host: a.host,
      registered: a.registered,
      sessions: a.sessions.size,
      tokens: a.tokens,
      tokensWeighted: a.tokensWeighted,
      confidence: a.confidence,
      commits: a.commits.size,
      branches: a.branches.size,
      wpsTouched: Array.from(a.wps).sort(),
      lastActive: a.lastActive,
    }))
    .sort((x, y) => y.commits - x.commits || y.sessions - x.sessions || x.agentId.localeCompare(y.agentId));
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : "-";
}

/** Render a fixed-width text table from headers + row cells. */
function renderTable(headers: string[], data: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...data.map((row) => (row[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => pad(c ?? "", widths[i] ?? 0)).join("  ").trimEnd();
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...data.map(line)].join("\n");
}

/**
 * Render the per-agent stats table as a fixed-width string. TOKENS(W) is the
 * cost-weighted total (cache reads discounted); CONF is the best evidence
 * confidence backing the row. When `residual` is given, an explicit
 * "(unattributed/human)" row reports the commits no agent claimed — honest
 * coverage instead of silently implying 100% attribution.
 */
export function formatStatsTable(
  rows: AgentStatsRow[],
  residual?: AttributionResidual,
  conflicts?: { sha: string; branch?: string; agents: { agentId: string; rule: string }[] }[],
): string {
  if (rows.length === 0 && !residual) {
    return "No agent sessions found for this repo. Run `graphify agent-stats sync` first.";
  }
  const headers = ["AGENT", "SESS", "TOKENS(W)", "CONF", "COMMITS", "BRANCHES", "WPS", "LAST-ACTIVE"];
  const data = rows.map((r) => [
    r.agentId,
    String(r.sessions),
    fmtTokens(r.tokensWeighted),
    r.confidence,
    String(r.commits),
    String(r.branches),
    r.wpsTouched.length ? r.wpsTouched.join(",") : "-",
    fmtDate(r.lastActive),
  ]);
  if (residual) {
    data.push([
      "(unattributed/human)",
      "-",
      "-",
      "-",
      `${residual.unattributedCommits}/${residual.totalCommits}`,
      "-",
      "-",
      "-",
    ]);
  }
  let out = renderTable(headers, data);
  if (conflicts && conflicts.length > 0) {
    const lines = conflicts.map(
      (c) =>
        `  ${c.sha.slice(0, 7)}${c.branch ? ` (${c.branch})` : ""}: claimed by ${c.agents
          .map((a) => `${a.agentId} via ${a.rule}`)
          .join(" AND ")}`,
    );
    out += `\n\nWARNING: ${conflicts.length} commit(s) claimed by more than one agent:\n${lines.join("\n")}`;
  }
  return out;
}

/** Render a session list (for `agent-stats sessions`). */
export function formatSessionsTable(facts: SessionFact[], instances: H2aInstance[]): string {
  if (facts.length === 0) return "No sessions match the given filters.";
  const headers = ["AGENT", "HOST", "SESSION", "BRANCHES", "COMMITS", "TOKENS", "ENDED"];
  const data = facts.map((f) => {
    const inst = matchInstance(instances, f.host, f.cwds);
    const id = resolveIdentity(f, inst);
    return [
      id.agentId,
      f.host,
      f.sessionId.slice(0, 8),
      f.branchesObserved.filter((b) => b && b !== "HEAD").slice(0, 2).join(",") || "-",
      String(f.groundTruth.commitShas.length),
      fmtTokens(f.tokens.total || 0),
      fmtDate(f.endedAt),
    ];
  });
  return renderTable(headers, data);
}
