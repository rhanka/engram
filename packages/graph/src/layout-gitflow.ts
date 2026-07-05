/**
 * GIT-FLOW layout (display lot — git-flow renderer).
 *
 * Deterministic left→right git-graph placement of the agent-stats project-graph
 * scene model (#257): node types `Commit` / `Branch` / `Session` connected by
 * `commit-parent` (child→parent), `branch-head` (branch→tip commit),
 * `produced` (session→commit), `touched-branch` (session→branch),
 * `derived-from` (session→session) and `merged-as` (branch tip commit → the
 * merge/squash commit it landed as on its base branch).
 *
 * Per REPO (one horizontal band per repo, bands stacked with a gap; the repo is
 * a colour community, never a rendered hub):
 *
 *   • TRUNK — the branch named `main` / `master` / `develop` (that priority),
 *     else the branch with the longest first-parent chain. Its first-parent
 *     chain is LANE 0; x = topological rank (oldest left → newest RIGHT).
 *   • EVERY OTHER BRANCH — an exclusive first-parent walk from its tip (capped
 *     at `maxBranchLen` commits) down to the first already-placed commit = the
 *     FORK. Branch commits rank `forkRank+1 …`; branches forking before the
 *     display window (or with no resolvable fork) ATTACH AT THE WINDOW LEFT
 *     EDGE with a dashed/soft entry.
 *   • LANE-REUSE (gitk-style interval colouring) — each branch occupies a lane
 *     over its [forkRank, tipRank] interval only (a MERGED branch's interval
 *     extends to — and ENDS at — its `merged-as` commit's rank); a lane frees
 *     once the previous interval ends (+`laneReuseGap` ranks), so hundreds of
 *     branches stay compact. ALL branches are placed — there is no top-K.
 *   • DISPLAY WINDOW — sized to enclose the kept forks, capped at `maxWindow`
 *     ranks; trunk commits older than the window PARK (placed=0) one rank left
 *     of the window edge, so the window-left dashed entries visibly continue.
 *   • SESSIONS — sub-positioned under the commit they `produced` (else near
 *     their touched branch's tip), so the app can colour them by `agent_kind`.
 *
 * The layout also emits PER-EDGE ROUTE HINTS so the renderer draws git-flow
 * edges port-to-port with the REFERENCE ARROW GRAMMAR (GitHub network graph /
 * nvie git-flow): lane segments are arrowed `flow-port-reverse`; FORK descents
 * (fork commit → first branch commit) are the SAME S but BARE (`arrow: false`
 * — a descending arrow reads as an inverted merge); `merged-as` MERGE
 * connectors are ascending `flow-port` S WITH the arrow pointing into the base
 * commit; window-left entries are dashed; structural edges (`branch-head` /
 * `touched-branch`) are hidden; session edges are short subtle `session-link`s.
 *
 * Pure & deterministic — no randomness, no renderer/camera/shader coupling.
 */

import type { LayoutFn } from "./layout-registry";

// ---------------------------------------------------------------------------
// Input / output contracts.
// ---------------------------------------------------------------------------

export interface GitFlowNodeInput {
  id: string;
  /** `node_type` — `Commit` / `Branch` / `Session`; anything else is off-lane. */
  type?: string | null;
  /** Repo band key (`repo` attr; falls back to `project` upstream). */
  repo?: string | null;
  /** Branch NAME (Branch nodes) — trunk pick + deterministic ordering. */
  name?: string | null;
  /** Optional temporal stamp (RESERVED — carried through, not consulted yet). */
  t?: number | null;
}

export interface GitFlowEdgeInput {
  source: string;
  target: string;
  relation?: string | null;
}

export interface GitFlowInput {
  nodes: readonly GitFlowNodeInput[];
  edges: readonly GitFlowEdgeInput[];
}

/** Tuning for {@link computeGitFlowPositions}. */
export interface GitFlowLayoutOptions {
  /** Horizontal distance between adjacent RANKS (default 60). */
  rankGap?: number;
  /** Vertical distance between adjacent LANES within a band (default 44). */
  laneGap?: number;
  /** Vertical gap between repo BANDS (default 140). */
  bandGap?: number;
  /** Vertical offset of a session below its commit (default 16). */
  sessionGap?: number;
  /** Per-branch exclusive first-parent walk cap (default 40 commits). */
  maxBranchLen?: number;
  /** Display window cap in ranks (default 400). */
  maxWindow?: number;
  /** Ranks a lane stays reserved after a branch interval ends (default 1). */
  laneReuseGap?: number;
}

/** Per-edge ROUTE hint emitted by the layout (edge-order keyed). */
export interface GitFlowEdgeHint {
  /**
   * • `"flow-port"` — `merged-as` MERGE connector (branch tip commit → the
   *   merge/squash commit on its base): drawn right-port → left-port as-is
   *   (the tip is older/left of the merge commit), ALWAYS with the arrowhead
   *   pointing INTO the base commit — the git-flow grammar's arrowed ascent.
   * • `"flow-port-reverse"` — git `commit-parent` edge between placed commits:
   *   drawn right-port → left-port with the endpoints swapped (old→new).
   *   Lane segments carry the arrowhead (`arrow: true`); FORK descents (the
   *   fork commit → a branch's first exclusive commit) are BARE
   *   (`arrow: false`) — in the reference grammar only merges are arrowed.
   * • `"session-link"` — session attachment (`produced` / `derived-from`):
   *   short & subtle, centre-routed (the ONE style allowed to break the
   *   left→right invariant).
   * • `"hidden"` — structural edge the flow view does not draw
   *   (`branch-head`, `touched-branch`, edges into parked/off-lane nodes).
   * • `"default"` — any other relation between placed nodes.
   */
  style: "flow-port" | "flow-port-reverse" | "session-link" | "hidden" | "default";
  /** `"dashed"` marks a WINDOW-LEFT soft entry (fork outside the window). */
  dash?: "solid" | "dashed";
  /**
   * Whether the flow-port edge carries an arrowhead. `false` ⇒ map to the
   * `*-no-arrow` edge_style (fork descents); `true`/absent ⇒ arrowed. Only
   * meaningful on the `flow-port*` styles.
   */
  arrow?: boolean;
}

/** Branch label anchor (lane start) for the app's label pass. */
export interface GitFlowBranchLabel {
  /** Index of the Branch node in the INPUT node order. */
  nodeIndex: number;
  name: string;
  repo: string;
  /** 0 = trunk lane. −1 for tip-only labels (branch head sits on another lane). */
  lane: number;
  x: number;
  y: number;
  /** How the branch enters the window (window-left entries draw dashed). */
  entry: "in-window" | "window-left" | "tip-only";
  /**
   * World x of the branch TIP commit (label-policy extras: recency weighting
   * + the fork→tip anchor fallback). Equals `x` for tip-only labels.
   */
  tipX?: number;
  /**
   * World y of the branch's LANE LINE (the label anchor `y` floats ABOVE it
   * by the lane lift). Interaction hit targets cover the lane interval
   * `[x, tipX]` at this y — not just the label pill (P1.3).
   */
  laneY?: number;
}

export interface GitFlowLayout {
  /** Node-order-keyed positions, `2 * nodes.length` floats — setPositions shape. */
  positions: Float32Array;
  /** 1 = node is meaningfully placed on a band; 0 = parked (off-lane / pre-window). */
  placed: Uint8Array;
  /** Edge-order-keyed route hints (parallel to `input.edges`). */
  edgeHints: GitFlowEdgeHint[];
  branchLabels: GitFlowBranchLabel[];
  /** Repo → number of lanes used (including lane 0). Lane-reuse compactness gauge. */
  laneCounts: Map<string, number>;
  /** Repo → first displayed trunk rank (window left edge). */
  windowStarts: Map<string, number>;
}

const DEFAULT_RANK_GAP = 60;
const DEFAULT_LANE_GAP = 44;
const DEFAULT_BAND_GAP = 140;
const DEFAULT_SESSION_GAP = 16;
const DEFAULT_MAX_BRANCH_LEN = 40;
const DEFAULT_MAX_WINDOW = 400;
const DEFAULT_LANE_REUSE_GAP = 1;

/** Trunk name priority (first match wins). */
const TRUNK_NAMES = ["main", "master", "develop"];

/** Branch-label anchor sits this fraction of a rank LEFT of the first commit. */
const LABEL_RANK_INSET = 0.6;
/**
 * Branch-label anchor floats this fraction of a lane ABOVE its lane line, so a
 * label glyph (e.g. a text pill) never covers the entry S, the first commit's
 * left port, or its arrowhead (GitHub network-graph label placement).
 */
const LABEL_LANE_LIFT = 0.4;
/** Tip-only branch labels sit this fraction of a lane below their tip commit. */
const TIP_LABEL_LANE_FRACTION = 0.35;

function norm(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Core.
// ---------------------------------------------------------------------------

export function computeGitFlowPositions(
  input: GitFlowInput,
  options: GitFlowLayoutOptions = {},
): GitFlowLayout {
  const rankGap = options.rankGap ?? DEFAULT_RANK_GAP;
  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const bandGap = options.bandGap ?? DEFAULT_BAND_GAP;
  const sessionGap = options.sessionGap ?? DEFAULT_SESSION_GAP;
  const maxBranchLen = Math.max(1, options.maxBranchLen ?? DEFAULT_MAX_BRANCH_LEN);
  const maxWindow = Math.max(1, options.maxWindow ?? DEFAULT_MAX_WINDOW);
  const laneReuseGap = Math.max(0, options.laneReuseGap ?? DEFAULT_LANE_REUSE_GAP);

  const n = input.nodes.length;
  const positions = new Float32Array(n * 2);
  const placed = new Uint8Array(n);
  const edgeHints: GitFlowEdgeHint[] = new Array(input.edges.length);
  const branchLabels: GitFlowBranchLabel[] = [];
  const laneCounts = new Map<string, number>();
  const windowStarts = new Map<string, number>();

  const result: GitFlowLayout = { positions, placed, edgeHints, branchLabels, laneCounts, windowStarts };
  if (n === 0) {
    for (let e = 0; e < input.edges.length; e += 1) edgeHints[e] = { style: "hidden" };
    return result;
  }

  const idToIndex = new Map<string, number>();
  input.nodes.forEach((node, i) => {
    if (!idToIndex.has(node.id)) idToIndex.set(node.id, i);
  });

  const typeOf = (i: number): string => norm(input.nodes[i]?.type);
  const repoOf = (i: number): string => norm(input.nodes[i]?.repo);

  // --- Index the git relations once (edge input order preserved). -----------
  const parentsOf = new Map<number, number[]>(); // child commit → parents (first = first-parent)
  const branchTip = new Map<number, number>(); // branch → tip commit
  const producedOf = new Map<number, number[]>(); // session → commits (input order)
  const sessionsOfCommit = new Map<number, number[]>(); // commit → sessions (input order)
  const touchedOf = new Map<number, number>(); // session → first touched branch
  const mergedAs = new Map<number, number>(); // branch TIP commit → merge/squash commit

  input.edges.forEach((edge, e) => {
    const s = idToIndex.get(edge.source);
    const t = idToIndex.get(edge.target);
    edgeHints[e] = { style: "hidden" }; // refined in the final hint pass
    if (s === undefined || t === undefined) return;
    const relation = norm(edge.relation);
    if (relation === "commit-parent" && typeOf(s) === "Commit" && typeOf(t) === "Commit") {
      const list = parentsOf.get(s);
      if (list) list.push(t);
      else parentsOf.set(s, [t]);
    } else if (relation === "branch-head" && typeOf(s) === "Branch" && typeOf(t) === "Commit") {
      if (!branchTip.has(s)) branchTip.set(s, t);
    } else if (relation === "produced" && typeOf(s) === "Session" && typeOf(t) === "Commit") {
      const list = producedOf.get(s);
      if (list) list.push(t);
      else producedOf.set(s, [t]);
      const sessions = sessionsOfCommit.get(t);
      if (sessions) sessions.push(s);
      else sessionsOfCommit.set(t, [s]);
    } else if (relation === "touched-branch" && typeOf(s) === "Session" && typeOf(t) === "Branch") {
      if (!touchedOf.has(s)) touchedOf.set(s, t);
    } else if (relation === "merged-as" && typeOf(s) === "Commit" && typeOf(t) === "Commit") {
      // MERGE hint: the branch tip `s` was merged/squashed into commit `t`.
      if (!mergedAs.has(s)) mergedAs.set(s, t);
    }
  });

  // --- Group the git nodes into repo bands (deterministic alpha order). -----
  const bandNodes = new Map<string, { commits: number[]; branches: number[]; sessions: number[] }>();
  const offLane: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const type = typeOf(i);
    if (type !== "Commit" && type !== "Branch" && type !== "Session") {
      offLane.push(i);
      continue;
    }
    const repo = repoOf(i);
    let band = bandNodes.get(repo);
    if (!band) bandNodes.set(repo, (band = { commits: [], branches: [], sessions: [] }));
    if (type === "Commit") band.commits.push(i);
    else if (type === "Branch") band.branches.push(i);
    else band.sessions.push(i);
  }
  const repoKeys = [...bandNodes.keys()].sort();

  // First-parent walk from `tip`, stopping BEFORE `stop(commit)` says so.
  const firstParentWalk = (tip: number, cap: number, stop: (c: number) => boolean): number[] => {
    const chain: number[] = [];
    const visited = new Set<number>();
    let cur: number | undefined = tip;
    while (cur !== undefined && !visited.has(cur) && !stop(cur) && chain.length < cap) {
      chain.push(cur);
      visited.add(cur);
      cur = parentsOf.get(cur)?.[0];
    }
    return chain;
  };

  // Global display-rank map (per repo bands never share commits, so one map).
  const displayRank = new Map<number, number>();
  // FIRST exclusive commit of every placed branch: its first-parent edge is
  // the FORK descent — drawn as a BARE S (no arrowhead) per the git-flow
  // grammar (only merges and lane segments are arrowed).
  const forkEntryCommits = new Set<number>();

  let bandTop = 0;
  for (const repo of repoKeys) {
    const band = bandNodes.get(repo)!;
    const commitSet = new Set(band.commits);

    // ---- 1. Pick the trunk. ------------------------------------------------
    const headedBranches = band.branches.filter((b) => {
      const tip = branchTip.get(b);
      return tip !== undefined && commitSet.has(tip);
    });
    const branchName = (b: number): string => norm(input.nodes[b]?.name) || norm(input.nodes[b]?.id);

    let trunkBranch: number | undefined;
    for (const trunkName of TRUNK_NAMES) {
      trunkBranch = headedBranches.find((b) => branchName(b).toLowerCase() === trunkName);
      if (trunkBranch !== undefined) break;
    }
    const chainLen = (tip: number): number => firstParentWalk(tip, n + 1, () => false).length;
    if (trunkBranch === undefined && headedBranches.length > 0) {
      // Longest first-parent chain, tie-broken by name — deterministic.
      trunkBranch = [...headedBranches].sort((a, b) => {
        const la = chainLen(branchTip.get(a)!);
        const lb = chainLen(branchTip.get(b)!);
        if (la !== lb) return lb - la;
        return branchName(a) < branchName(b) ? -1 : 1;
      })[0];
    }

    let trunkTip: number | undefined =
      trunkBranch !== undefined ? branchTip.get(trunkBranch) : undefined;
    if (trunkTip === undefined && band.commits.length > 0) {
      // No branch heads at all: the childless commit with the longest chain.
      const hasChild = new Set<number>();
      for (const parents of parentsOf.values()) for (const p of parents) hasChild.add(p);
      const tips = band.commits.filter((c) => !hasChild.has(c));
      const candidates = tips.length > 0 ? tips : band.commits;
      trunkTip = [...candidates].sort((a, b) => {
        const la = chainLen(a);
        const lb = chainLen(b);
        if (la !== lb) return lb - la;
        return (input.nodes[a]?.id ?? "") < (input.nodes[b]?.id ?? "") ? -1 : 1;
      })[0];
    }

    // ---- 2. Rank the trunk first-parent chain (oldest = rank 0). ----------
    const rank = new Map<number, number>();
    const trunkChain = trunkTip !== undefined ? firstParentWalk(trunkTip, n + 1, () => false) : [];
    trunkChain.reverse(); // oldest first
    trunkChain.forEach((c, r) => rank.set(c, r));
    const tipRank = trunkChain.length - 1;

    // ---- 3. Resolve every other branch (exclusive first-parent walks). ----
    interface BranchRecord {
      branch: number;
      forkCommit: number | null; // null ⇒ no resolvable fork (root / cap)
      forkRank: number; // absolute rank of the fork (−1 when unresolvable)
      exclusive: number[]; // OLDEST-first exclusive commits (≤ maxBranchLen)
    }
    const others = headedBranches
      .filter((b) => b !== trunkBranch)
      .sort((a, b) => {
        const na = branchName(a);
        const nb = branchName(b);
        if (na !== nb) return na < nb ? -1 : 1;
        return a - b;
      });
    const records: BranchRecord[] = [];
    const tipOnly: number[] = [];
    let pending = others;
    for (let pass = 0; pass < 5 && pending.length > 0; pass += 1) {
      const next: number[] = [];
      let progress = false;
      for (const b of pending) {
        const tip = branchTip.get(b)!;
        const walk = firstParentWalk(tip, maxBranchLen, (c) => rank.has(c));
        const beyond = walk.length > 0 ? parentsOf.get(walk[walk.length - 1]!)?.[0] : tip;
        const fork =
          walk.length === 0 ? tip : beyond !== undefined && rank.has(beyond) ? beyond : undefined;
        if (fork === undefined) {
          next.push(b); // root reached or cap hit — retry / window-left later
          continue;
        }
        if (walk.length === 0) {
          tipOnly.push(b); // tip already on a placed lane: label-only branch
          progress = true;
          continue;
        }
        const exclusive = [...walk].reverse(); // oldest first
        const forkRank = rank.get(fork)!;
        exclusive.forEach((c, k) => rank.set(c, forkRank + 1 + k));
        records.push({ branch: b, forkCommit: fork, forkRank, exclusive });
        progress = true;
      }
      pending = next;
      if (!progress) break;
    }
    // Whatever is still pending has NO resolvable fork: window-left attach.
    for (const b of pending) {
      const tip = branchTip.get(b)!;
      const walk = firstParentWalk(tip, maxBranchLen, (c) => rank.has(c));
      if (walk.length === 0) {
        tipOnly.push(b);
        continue;
      }
      records.push({ branch: b, forkCommit: null, forkRank: -1, exclusive: [...walk].reverse() });
    }

    // ---- 4. Display window: enclose kept forks, cap at maxWindow ranks. ---
    let minFork = Number.POSITIVE_INFINITY;
    for (const rec of records) if (rec.forkCommit !== null) minFork = Math.min(minFork, rec.forkRank);
    const ideal = Number.isFinite(minFork) ? Math.max(0, minFork - 2) : 0;
    const windowStart = Math.max(ideal, tipRank - maxWindow + 1, 0);
    windowStarts.set(repo, windowStart);

    // Display ranks: trunk keeps absolute ranks; branch commits follow their
    // (possibly shifted) fork so window-left attaches re-anchor at the edge.
    for (const c of trunkChain) displayRank.set(c, rank.get(c)!);
    interface PlacedBranch extends BranchRecord {
      displayFork: number; // windowStart−1 for window-left attaches
      windowLeft: boolean;
    }
    const placedBranches: PlacedBranch[] = [];
    // Ascending fork rank ⇒ a parent branch shifts before any branch forked
    // off its exclusive commits (the child's fork rank is always deeper).
    const byFork = [...records].sort((a, b) => {
      if (a.forkRank !== b.forkRank) return a.forkRank - b.forkRank;
      const na = branchName(a.branch);
      const nb = branchName(b.branch);
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    for (const rec of byFork) {
      const forkDisplay =
        rec.forkCommit !== null ? displayRank.get(rec.forkCommit) : undefined;
      const windowLeft = forkDisplay === undefined || forkDisplay < windowStart;
      const displayFork = windowLeft ? windowStart - 1 : forkDisplay!;
      rec.exclusive.forEach((c, k) => displayRank.set(c, displayFork + 1 + k));
      if (rec.exclusive.length > 0) forkEntryCommits.add(rec.exclusive[0]!);
      placedBranches.push({ ...rec, displayFork, windowLeft });
    }

    // ---- 5. LANE-REUSE interval colouring over [displayFork, laneEnd]. -----
    // Greedy smallest-free-lane over intervals sorted by start (gitk-style):
    // overlapping intervals get distinct lanes; a lane frees `laneReuseGap`
    // ranks after the previous interval ends and is then REUSED. A MERGED
    // branch (`merged-as` from its tip) keeps its lane reserved up to the
    // MERGE commit's rank — the ascending merge connector spans that far — and
    // frees it exactly there (the merge ENDS the interval).
    const laneLastEnd: number[] = []; // per lane (1-based below), last occupied rank
    const laneOf = new Map<number, number>(); // branch → lane (≥ 1)
    const byInterval = [...placedBranches].sort((a, b) => {
      if (a.displayFork !== b.displayFork) return a.displayFork - b.displayFork;
      const na = branchName(a.branch);
      const nb = branchName(b.branch);
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    for (const rec of byInterval) {
      const start = rec.displayFork;
      let end = rec.displayFork + rec.exclusive.length;
      // merged-as: the interval ends AT the merge commit's display rank.
      const tip = branchTip.get(rec.branch);
      const mergeCommit = tip !== undefined ? mergedAs.get(tip) : undefined;
      const mergeDisplay = mergeCommit !== undefined ? displayRank.get(mergeCommit) : undefined;
      if (mergeDisplay !== undefined) end = Math.max(end, mergeDisplay);
      let lane = -1;
      for (let l = 0; l < laneLastEnd.length; l += 1) {
        if (laneLastEnd[l]! + laneReuseGap < start) {
          lane = l;
          break;
        }
      }
      if (lane === -1) {
        lane = laneLastEnd.length;
        laneLastEnd.push(end);
      } else {
        laneLastEnd[lane] = end;
      }
      laneOf.set(rec.branch, lane + 1); // lane 0 is the trunk
    }
    const laneCount = 1 + laneLastEnd.length;
    laneCounts.set(repo, laneCount);

    // ---- 6. Positions. -----------------------------------------------------
    const xOf = (display: number): number => (display - windowStart) * rankGap;
    const laneY = (lane: number): number => bandTop + lane * laneGap;

    // Trunk commits: in-window at their rank; pre-window PARKED one rank left.
    for (const c of trunkChain) {
      const r = rank.get(c)!;
      if (r >= windowStart) {
        positions[c * 2] = xOf(r);
        positions[c * 2 + 1] = laneY(0);
        placed[c] = 1;
      } else {
        positions[c * 2] = -rankGap;
        positions[c * 2 + 1] = laneY(0);
        placed[c] = 0;
      }
    }
    // Branch commits on their reused lane.
    for (const rec of placedBranches) {
      const lane = laneOf.get(rec.branch)!;
      for (const c of rec.exclusive) {
        positions[c * 2] = xOf(displayRank.get(c)!);
        positions[c * 2 + 1] = laneY(lane);
        placed[c] = 1;
      }
    }
    // Commits reachable from NO branch walk (orphans / beyond caps): park.
    for (const c of band.commits) {
      if (displayRank.has(c) || placed[c] === 1) continue;
      positions[c * 2] = -rankGap;
      positions[c * 2 + 1] = laneY(0);
      placed[c] = 0;
    }

    // Branch nodes = label carriers at the LANE START.
    if (trunkBranch !== undefined && trunkChain.length > 0) {
      const x = xOf(windowStart) - LABEL_RANK_INSET * rankGap;
      const y = laneY(0) - LABEL_LANE_LIFT * laneGap;
      positions[trunkBranch * 2] = x;
      positions[trunkBranch * 2 + 1] = y;
      placed[trunkBranch] = 1;
      branchLabels.push({
        nodeIndex: trunkBranch,
        name: branchName(trunkBranch),
        repo,
        lane: 0,
        x,
        y,
        entry: "in-window",
        tipX: xOf(tipRank),
        laneY: laneY(0),
      });
    }
    for (const rec of placedBranches) {
      const lane = laneOf.get(rec.branch)!;
      const firstDisplay = rec.displayFork + 1;
      const x = xOf(firstDisplay) - LABEL_RANK_INSET * rankGap;
      const y = laneY(lane) - LABEL_LANE_LIFT * laneGap;
      positions[rec.branch * 2] = x;
      positions[rec.branch * 2 + 1] = y;
      placed[rec.branch] = 1;
      branchLabels.push({
        nodeIndex: rec.branch,
        name: branchName(rec.branch),
        repo,
        lane,
        x,
        y,
        entry: rec.windowLeft ? "window-left" : "in-window",
        tipX: xOf(rec.displayFork + rec.exclusive.length),
        laneY: laneY(lane),
      });
    }
    // Tip-only branches: a small label just below their (already placed) tip.
    const tipOnlyStack = new Map<number, number>();
    for (const b of tipOnly.sort((a, b2) => (branchName(a) < branchName(b2) ? -1 : 1))) {
      const tip = branchTip.get(b)!;
      const k = tipOnlyStack.get(tip) ?? 0;
      tipOnlyStack.set(tip, k + 1);
      const x = positions[tip * 2] ?? 0;
      const y = (positions[tip * 2 + 1] ?? bandTop) + TIP_LABEL_LANE_FRACTION * laneGap * (k + 1);
      positions[b * 2] = x;
      positions[b * 2 + 1] = y;
      placed[b] = placed[tip] ?? 0;
      branchLabels.push({
        nodeIndex: b,
        name: branchName(b),
        repo,
        lane: -1,
        x,
        y,
        entry: "tip-only",
        tipX: x,
        laneY: positions[tip * 2 + 1] ?? bandTop,
      });
    }
    // Headless branch nodes: off-lane.
    for (const b of band.branches) {
      if (branchTip.has(b) && commitSet.has(branchTip.get(b)!)) continue;
      offLane.push(b);
    }

    // ---- 7. Sessions: sub-positioned under the commit they produced. ------
    const sessionStack = new Map<number, number>(); // anchor node → stacked count
    for (const s of band.sessions) {
      let anchor: number | undefined;
      for (const c of producedOf.get(s) ?? []) {
        if (placed[c] === 1) {
          anchor = c;
          break;
        }
      }
      if (anchor === undefined) {
        // No placed produced commit: near the touched branch's tip (else off-lane).
        const branch = touchedOf.get(s);
        const tip = branch !== undefined ? branchTip.get(branch) : undefined;
        if (tip !== undefined && placed[tip] === 1) anchor = tip;
        else if (branch !== undefined && placed[branch] === 1) anchor = branch;
      }
      if (anchor === undefined) {
        offLane.push(s);
        continue;
      }
      const k = sessionStack.get(anchor) ?? 0;
      sessionStack.set(anchor, k + 1);
      positions[s * 2] = positions[anchor * 2] ?? 0;
      positions[s * 2 + 1] = (positions[anchor * 2 + 1] ?? bandTop) + sessionGap * (1 + 0.6 * k);
      placed[s] = 1;
    }

    // Advance the band cursor: lanes + the session sub-strip + the band gap.
    bandTop += (laneCount - 1) * laneGap + sessionGap + bandGap;
  }

  // --- Off-lane strip: everything the flow view ignores, parked ABOVE. ------
  offLane.forEach((node, k) => {
    positions[node * 2] = k * rankGap * 0.5;
    positions[node * 2 + 1] = -bandGap;
    placed[node] = 0;
  });

  // --- Per-edge route hints. -------------------------------------------------
  input.edges.forEach((edge, e) => {
    const s = idToIndex.get(edge.source);
    const t = idToIndex.get(edge.target);
    if (s === undefined || t === undefined) {
      edgeHints[e] = { style: "hidden" };
      return;
    }
    const relation = norm(edge.relation);
    if (relation === "commit-parent") {
      const childPlaced = placed[s] === 1;
      const parentPlaced = placed[t] === 1;
      // FORK descent = the first-parent edge INTO a branch's first exclusive
      // commit: a bare S, NO arrowhead (only merges / lane segments arrow).
      const isForkEntry = forkEntryCommits.has(s) && parentsOf.get(s)?.[0] === t;
      if (childPlaced && parentPlaced) {
        edgeHints[e] = { style: "flow-port-reverse", dash: "solid", arrow: !isForkEntry };
      } else if (childPlaced && !parentPlaced && typeOf(t) === "Commit") {
        // WINDOW-LEFT soft entry: the parent is parked at the window edge.
        edgeHints[e] = { style: "flow-port-reverse", dash: "dashed", arrow: !isForkEntry };
      } else {
        edgeHints[e] = { style: "hidden" };
      }
      return;
    }
    if (relation === "merged-as") {
      // MERGE connector: branch tip → merge/squash commit, ascending S with
      // the arrowhead pointing INTO the base commit (drawn as-is: the tip is
      // older, so the edge already flows left→right).
      edgeHints[e] =
        placed[s] === 1 && placed[t] === 1
          ? { style: "flow-port", dash: "solid", arrow: true }
          : { style: "hidden" };
      return;
    }
    if (relation === "branch-head" || relation === "touched-branch") {
      edgeHints[e] = { style: "hidden" };
      return;
    }
    if (relation === "produced" || relation === "derived-from") {
      edgeHints[e] = placed[s] === 1 && placed[t] === 1 ? { style: "session-link" } : { style: "hidden" };
      return;
    }
    edgeHints[e] = placed[s] === 1 && placed[t] === 1 ? { style: "default" } : { style: "hidden" };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Registry adapter — `git-flow` as a LayoutFn (positions only; callers needing
// the edge hints / branch labels call computeGitFlowPositions directly).
// ---------------------------------------------------------------------------

/**
 * Git-flow as a {@link LayoutFn}. Reads per-node types / repo band keys /
 * branch names from {@link LayoutOptions} (`nodeTypes` / `nodeLanes` /
 * `nodeNames`, node-order keyed) and per-edge relations from `edgeRelations`
 * (edge-order keyed). Length always matches `graph.nodeIds.length`.
 */
export const gitFlowLayout: LayoutFn = (graph, options) => {
  const nodes: GitFlowNodeInput[] = graph.nodeIds.map((id, i) => ({
    id,
    type: options?.nodeTypes?.[i] ?? null,
    repo: options?.nodeLanes?.[i] ?? null,
    name: options?.nodeNames?.[i] ?? null,
    t: options?.nodeTimes?.[i] ?? null,
  }));
  const edges: GitFlowEdgeInput[] = [];
  const edgeCount = graph.edges.length / 2;
  for (let e = 0; e < edgeCount; e += 1) {
    edges.push({
      source: graph.nodeIds[graph.edges[e * 2] ?? 0] ?? "",
      target: graph.nodeIds[graph.edges[e * 2 + 1] ?? 0] ?? "",
      relation: options?.edgeRelations?.[e] ?? null,
    });
  }
  return computeGitFlowPositions({ nodes, edges }).positions;
};
