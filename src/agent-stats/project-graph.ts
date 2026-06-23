/**
 * WP9 agent-stats → PROJECT/CONVERSATION graph.
 *
 * Turns agent-stats session facts into a graphify `graph.json` (node-link
 * format) the studio can render: nodes = project / repos / sessions / agents /
 * branches / commits; edges = rename-lineage, belongs-to, worked-in,
 * conducted-by, touched-branch, produced, derived-from.
 *
 * RENAME RECONCILIATION (the core of this module):
 *   agent-stats keys repo identity off the cwd *path* and does not persist the
 *   git remote, so a repo that was renamed/moved on disk fragments into several
 *   path identities (e.g. `~/src/sentropic` → `~/src/graphify` → `/tmp/regraphify`).
 *   This builder reconciles those fragments into ONE canonical project node via
 *   a `ProjectIdentity` (a canonical id + an ordered list of path/remote
 *   aliases). Each distinct cwd root becomes a `repo` node; repo nodes that
 *   match an alias of the same identity are linked `belongs-to` the single
 *   project node, and consecutive aliases are chained with `rename-lineage`
 *   edges so the rename history is itself visible in the graph.
 *
 * This module is pure (no fs/network): it takes already-parsed `SessionFact`s
 * (or the equivalent sessions-report rows) plus a `ProjectIdentity`, and returns
 * a `SerializedGraphData` object ready to be JSON-stringified to a graph.json.
 */

import type { SessionFact } from "./types.js";

export const PROJECT_GRAPH_SCHEMA = "graphify.agent-stats.project-graph/v1";

/** One project's identity, reconciling every disk path it has lived at. */
export interface ProjectIdentity {
  /** Stable canonical id for the reconciled project (e.g. "sentropic"). */
  canonicalId: string;
  /** Human label for the project node. */
  label: string;
  /**
   * Ordered rename lineage. Each alias is a path PREFIX (tilde- or
   * absolute-form, as stored on the facts' `cwds`) or a remote "owner/name".
   * Order is chronological (oldest first) so `rename-lineage` edges chain the
   * history. The FIRST alias whose prefix a cwd matches wins.
   */
  aliases: ProjectAlias[];
}

export interface ProjectAlias {
  /** Display name for this incarnation (e.g. "sentropic", "graphify"). */
  name: string;
  /**
   * cwd path prefixes that identify this incarnation. A session whose cwd
   * equals or sits under any of these prefixes is attributed to this alias.
   * Tilde-form (`~/src/sentropic`) and absolute-form both accepted.
   */
  pathPrefixes: string[];
  /** Optional git remote "owner/name" for this incarnation (cross-path key). */
  remote?: string;
}

/** Minimal session shape the builder needs (subset of SessionFact). */
export interface SessionInput {
  factId: string;
  host: string;
  sessionId: string;
  agentId: string;
  cwds: string[];
  startedAt?: string;
  endedAt?: string;
  branches: string[];
  commitShas: string[];
  prUrls: string[];
  tokensTotal: number;
  filesTouched: number;
  parentThreadId?: string;
}

/** Node in the node-link graph (matches graphify GraphNode minimal subset). */
interface GraphNodeOut {
  id: string;
  label: string;
  file_type: "code" | "document" | "concept" | "rationale";
  source_file: string;
  community: number;
  community_name: string;
  node_type: string;
  [key: string]: unknown;
}

interface GraphEdgeOut {
  source: string;
  target: string;
  relation: string;
  confidence: "EXTRACTED" | "INFERRED";
  source_file: string;
  weight?: number;
  [key: string]: unknown;
}

export interface ProjectGraph {
  directed: boolean;
  multigraph: false;
  graph: { provenance?: unknown; community_labels: Record<string, string> };
  topology_signature: string;
  nodes: GraphNodeOut[];
  links: GraphEdgeOut[];
  hyperedges: never[];
}

export interface BuildProjectGraphOptions {
  identity: ProjectIdentity;
  sessions: SessionInput[];
  /** Include commit nodes (one per distinct attributed sha). Default true. */
  includeCommits?: boolean;
  /** Include branch nodes. Default true. */
  includeBranches?: boolean;
  /** Provenance to stamp on graph.graph.provenance. */
  provenance?: unknown;
}

/** Project the rich SessionFact onto the minimal SessionInput. */
export function sessionFactToInput(fact: SessionFact, agentId: string): SessionInput {
  const branches = new Set<string>();
  for (const b of fact.branchesObserved) if (b && b !== "HEAD") branches.add(b);
  for (const b of fact.groundTruth.branches) if (b && b !== "HEAD") branches.add(b);
  return {
    factId: fact.factId,
    host: fact.host,
    sessionId: fact.sessionId,
    agentId,
    cwds: fact.cwds,
    startedAt: fact.startedAt,
    endedAt: fact.endedAt,
    branches: Array.from(branches).sort(),
    commitShas: Array.from(new Set(fact.groundTruth.commitShas.map((s) => s.slice(0, 7)))).sort(),
    prUrls: Array.from(new Set(fact.groundTruth.prUrls)),
    tokensTotal: fact.tokens.total ?? 0,
    filesTouched: fact.filesTouched.length,
    parentThreadId: fact.parent?.parentThreadId,
  };
}

/** Normalize tilde and trailing slashes for prefix comparison. */
function normPath(p: string): string {
  return p.replace(/\/+$/, "");
}

/**
 * Resolve which rename-lineage alias a cwd belongs to. Returns the alias index
 * (into identity.aliases) of the first alias whose prefix the cwd matches, or
 * -1 if none. Worktree subpaths (`<root>/.worktrees/x`, `<root>/.claude/...`)
 * resolve to the alias whose prefix is the longest match.
 */
export function aliasForCwd(identity: ProjectIdentity, cwd: string): number {
  const c = normPath(cwd);
  let best = -1;
  let bestLen = -1;
  identity.aliases.forEach((alias, i) => {
    for (const prefix of alias.pathPrefixes) {
      const p = normPath(prefix);
      if ((c === p || c.startsWith(p + "/")) && p.length > bestLen) {
        best = i;
        bestLen = p.length;
      }
    }
  });
  return best;
}

/** A session's primary alias = the alias of its first matching cwd. */
function sessionAlias(identity: ProjectIdentity, session: SessionInput): number {
  for (const cwd of session.cwds) {
    const i = aliasForCwd(identity, cwd);
    if (i >= 0) return i;
  }
  return -1;
}

const PROJECT_COMMUNITY = 0;
const COMMUNITY = {
  project: 0,
  repo: 1,
  agent: 2,
  session: 3,
  branch: 4,
  commit: 5,
} as const;

const COMMUNITY_LABELS: Record<string, string> = {
  "0": "Project",
  "1": "Repo (rename lineage)",
  "2": "Agent",
  "3": "Conversation / session",
  "4": "Branch",
  "5": "Commit",
};

function nodeId(kind: string, key: string): string {
  // Deterministic, filesystem-safe id.
  return `${kind}_${key}`.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
}

/**
 * Build the project/conversation graph from reconciled session inputs.
 *
 * Only sessions that match an alias of the given identity are included — this is
 * what "start with just the sentropic repo, rename-aware" means: feed the
 * sentropic identity (with its sentropic/graphify/regraphify aliases) and every
 * session across those paths collapses into one project.
 */
export function buildProjectGraph(opts: BuildProjectGraphOptions): ProjectGraph {
  const { identity } = opts;
  const includeCommits = opts.includeCommits !== false;
  const includeBranches = opts.includeBranches !== false;

  const nodes = new Map<string, GraphNodeOut>();
  const links: GraphEdgeOut[] = [];
  const linkSeen = new Set<string>();

  const addNode = (n: GraphNodeOut) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return n.id;
  };
  const addEdge = (e: GraphEdgeOut) => {
    const k = `${e.source}|${e.target}|${e.relation}`;
    if (linkSeen.has(k)) return;
    linkSeen.add(k);
    links.push(e);
  };

  // 1. The single canonical PROJECT node.
  const projectNodeId = addNode({
    id: nodeId("project", identity.canonicalId),
    label: identity.label,
    file_type: "concept",
    source_file: `agent-stats://project/${identity.canonicalId}`,
    community: PROJECT_COMMUNITY,
    community_name: COMMUNITY_LABELS["0"]!,
    node_type: "Project",
    canonical_id: identity.canonicalId,
    aliases: identity.aliases.map((a) => a.name),
  });

  // 2. REPO nodes, one per rename-lineage alias, chained by rename-lineage.
  const repoNodeIds: string[] = [];
  identity.aliases.forEach((alias) => {
    const id = addNode({
      id: nodeId("repo", alias.name),
      label: alias.name,
      file_type: "concept",
      source_file: alias.pathPrefixes[0] ?? `agent-stats://repo/${alias.name}`,
      community: COMMUNITY.repo,
      community_name: COMMUNITY_LABELS["1"]!,
      node_type: "Repo",
      path_prefixes: alias.pathPrefixes,
      remote: alias.remote,
    });
    repoNodeIds.push(id);
    // Each incarnation belongs to the one reconciled project.
    addEdge({
      source: id,
      target: projectNodeId,
      relation: "belongs-to",
      confidence: "EXTRACTED",
      source_file: "agent-stats://reconcile",
      weight: 1,
    });
  });
  // Chain the rename history: alias[i] --rename-lineage--> alias[i+1].
  for (let i = 0; i + 1 < repoNodeIds.length; i++) {
    addEdge({
      source: repoNodeIds[i]!,
      target: repoNodeIds[i + 1]!,
      relation: "rename-lineage",
      confidence: "INFERRED",
      source_file: "agent-stats://reconcile",
      weight: 2,
      lineage_order: i,
    });
  }

  // 3. SESSION / AGENT / BRANCH / COMMIT nodes from each in-identity session.
  const agentSessions = new Map<string, number>();
  const sessionNodeBySessionId = new Map<string, string>();

  for (const s of opts.sessions) {
    const aliasIdx = sessionAlias(identity, s);
    if (aliasIdx < 0) continue; // not part of this project's lineage
    const repoNodeId = repoNodeIds[aliasIdx]!;

    // session node
    const sessId = addNode({
      id: nodeId("session", s.factId),
      label: `${s.host}:${s.sessionId.slice(0, 8)}`,
      file_type: "document",
      source_file: `agent-stats://session/${s.factId}`,
      community: COMMUNITY.session,
      community_name: COMMUNITY_LABELS["3"]!,
      node_type: "Session",
      host: s.host,
      session_id: s.sessionId,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      tokens_total: s.tokensTotal,
      files_touched: s.filesTouched,
      commit_count: s.commitShas.length,
      branch_count: s.branches.length,
    });
    sessionNodeBySessionId.set(s.sessionId, sessId);

    // session worked-in repo (incarnation)
    addEdge({
      source: sessId,
      target: repoNodeId,
      relation: "worked-in",
      confidence: "EXTRACTED",
      source_file: "agent-stats://session",
      weight: 1,
    });

    // agent node + conducted-by edge
    const agentId = addNode({
      id: nodeId("agent", s.agentId),
      label: s.agentId,
      file_type: "concept",
      source_file: `agent-stats://agent/${s.agentId}`,
      community: COMMUNITY.agent,
      community_name: COMMUNITY_LABELS["2"]!,
      node_type: "Agent",
      host: s.host,
    });
    agentSessions.set(agentId, (agentSessions.get(agentId) ?? 0) + 1);
    addEdge({
      source: sessId,
      target: agentId,
      relation: "conducted-by",
      confidence: "EXTRACTED",
      source_file: "agent-stats://session",
      weight: 1,
    });

    // branches
    if (includeBranches) {
      for (const b of s.branches) {
        const bId = addNode({
          id: nodeId("branch", `${identity.canonicalId}__${b}`),
          label: b,
          file_type: "rationale",
          source_file: `agent-stats://branch/${b}`,
          community: COMMUNITY.branch,
          community_name: COMMUNITY_LABELS["4"]!,
          node_type: "Branch",
        });
        addEdge({
          source: sessId,
          target: bId,
          relation: "touched-branch",
          confidence: "EXTRACTED",
          source_file: "agent-stats://session",
          weight: 1,
        });
      }
    }

    // commits (ground-truth shas the session printed)
    if (includeCommits) {
      for (const sha of s.commitShas) {
        const cId = addNode({
          id: nodeId("commit", sha),
          label: sha,
          file_type: "code",
          source_file: `agent-stats://commit/${sha}`,
          community: COMMUNITY.commit,
          community_name: COMMUNITY_LABELS["5"]!,
          node_type: "Commit",
          sha,
        });
        addEdge({
          source: sessId,
          target: cId,
          relation: "produced",
          confidence: "EXTRACTED",
          source_file: "agent-stats://ground-truth",
          weight: 1,
        });
      }
    }
  }

  // 4. derived-from edges between sessions (codex sub-agent lineage).
  for (const s of opts.sessions) {
    if (!s.parentThreadId) continue;
    const childNode = sessionNodeBySessionId.get(s.sessionId);
    const parentNode = sessionNodeBySessionId.get(s.parentThreadId);
    if (childNode && parentNode && childNode !== parentNode) {
      addEdge({
        source: childNode,
        target: parentNode,
        relation: "derived-from",
        confidence: "INFERRED",
        source_file: "agent-stats://parentage",
        weight: 1,
      });
    }
  }

  const nodeList = Array.from(nodes.values());
  const topology = `n=${nodeList.length};e=${links.length}`;

  return {
    directed: true,
    multigraph: false,
    graph: {
      provenance: opts.provenance,
      community_labels: COMMUNITY_LABELS,
    },
    topology_signature: topology,
    nodes: nodeList,
    links,
    hyperedges: [],
  };
}
