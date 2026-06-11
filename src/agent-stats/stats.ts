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
import type { AgentStatsRow, CorrelationLink, SessionFact } from "./types.js";

export interface AggregateInput {
  facts: SessionFact[];
  links: CorrelationLink[];
  instances: H2aInstance[];
}

interface Acc {
  agentId: string;
  host: SessionFact["host"];
  registered: boolean;
  sessions: Set<string>;
  tokens: number;
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
    if (fact.endedAt && (!a.lastActive || fact.endedAt > a.lastActive)) a.lastActive = fact.endedAt;
  }

  // Evidence-backed commits/branches/WPs from correlation links.
  for (const link of input.links) {
    const a = accs.get(link.agentId);
    if (!a) continue;
    if (link.target.kind === "commit") {
      a.commits.add(link.target.sha.slice(0, 7));
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

/** Render the per-agent stats table as a fixed-width string. */
export function formatStatsTable(rows: AgentStatsRow[]): string {
  if (rows.length === 0) return "No agent sessions found for this repo. Run `graphify agent-stats sync` first.";
  const headers = ["AGENT", "SESS", "TOKENS", "COMMITS", "BRANCHES", "WPS", "LAST-ACTIVE"];
  const data = rows.map((r) => [
    r.agentId,
    String(r.sessions),
    fmtTokens(r.tokens),
    String(r.commits),
    String(r.branches),
    r.wpsTouched.length ? r.wpsTouched.join(",") : "-",
    fmtDate(r.lastActive),
  ]);
  return renderTable(headers, data);
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
