/**
 * GIT-FLOW demo — full-pipeline golden gate + screenshot artifact.
 *
 * Proves the NEW git-flow pipeline end-to-end on a synthetic repo (main +
 * 8 branches with overlapping intervals + sessions):
 *
 *   computeGitFlowPositions  →  fixture (positions + edge_style hints)
 *                            →  renderer (flow-port edges, Canvas2D + WebGL)
 *
 * Assertions follow the harness's A/B golden model (no stored baselines):
 *   • DETERMINISM floor — the demo re-captures byte-identical;
 *   • PORT probes — ink on the straight lane segment; NO ink below a fork
 *     commit (the old centre-to-centre "bottom exit" the git-flow lot fixes);
 *     ink arriving HORIZONTALLY at a branch's first-commit LEFT port (S entry
 *     + arrow);
 *   • every branch colour present (ALL branches drawn — no top-K).
 *
 * Artifact: writes `__out__/gitflow-demo.png` (CDP capture when Chrome is up,
 * else the napi Canvas2D smoke render — same renderer, different AA) and
 * `__out__/gitflow-demo-webgl.png` when a WebGL2 context exists.
 *
 * Existing goldens untouched: this file only ADDS a fixture; no historical
 * fixture carries `edge_style`, so their buffers are byte-identical.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeGitFlowPositions,
  type GitFlowEdgeInput,
  type GitFlowNodeInput,
} from "../../src/layout-gitflow";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import { diffPixels, samplePixel, countColorPixels, worldToDevice } from "./diff.mjs";
// @ts-expect-error
import { napiAvailable, smokeCapture } from "./smoke.mjs";
// @ts-expect-error
import { encodePng } from "./png.mjs";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__out__");

// ---------------------------------------------------------------------------
// The demo scene: main (12 commits) + 8 branches (overlapping intervals that
// force lane REUSE: 8 branches fit in 4 branch lanes) + 4 sessions. Node /
// edge model mirrors `graphify agent-stats project-graph` (#257):
// commit-parent child→parent, branch-head branch→tip, produced session→commit.
// ---------------------------------------------------------------------------

const TRUNK_COLOR = "#3b82f6";
const BRANCH_COLORS: Record<string, string> = {
  "feat/alpha": "#22c55e",
  "feat/beta": "#ef4444",
  "feat/gamma": "#f59e0b",
  "hotfix/delta": "#a855f7",
  "feat/epsilon": "#06b6d4",
  "fix/zeta": "#ec4899",
  "feat/eta": "#84cc16",
  "chore/theta": "#f97316",
};
const AGENT_COLORS: Record<string, string> = {
  claude: "#d97706",
  codex: "#0ea5e9",
  gemini: "#10b981",
};
const SESSION_LINK_COLOR = "#94a3b8";

const LAYOUT_OPTS = { rankGap: 60, laneGap: 44, sessionGap: 16 };

interface Demo {
  fixture: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  /** World position per node id (from the git-flow layout). */
  world: Map<string, [number, number]>;
  layout: ReturnType<typeof computeGitFlowPositions>;
}

export function buildGitFlowDemo(): Demo {
  const nodes: GitFlowNodeInput[] = [];
  const edges: GitFlowEdgeInput[] = [];
  const colorOf = new Map<string, string>();
  const agentOf = new Map<string, string>();
  const repo = "demo";

  // Trunk m0 … m11.
  for (let i = 0; i < 12; i += 1) {
    nodes.push({ id: `m${i}`, type: "Commit", repo });
    colorOf.set(`m${i}`, TRUNK_COLOR);
    if (i > 0) edges.push({ source: `m${i}`, target: `m${i - 1}`, relation: "commit-parent" });
  }
  nodes.push({ id: "branch-main", type: "Branch", repo, name: "main" });
  colorOf.set("branch-main", TRUNK_COLOR);
  edges.push({ source: "branch-main", target: "m11", relation: "branch-head" });

  // 8 branches; overlapping [fork, tip] intervals force distinct lanes AND
  // freed-lane reuse. FOUR branches are MERGED BACK into main (`merged-as`
  // tip → merge commit — their lane stays reserved to the merge rank), four
  // stay OPEN, so both connector grammars show: bare descending fork Ss and
  // arrowed ascending merge Ss. Expected intervals (merge-extended):
  // alpha[1,5] beta[2,8] gamma[3,5] delta[6,10] epsilon[7,10] zeta[8,11]
  // eta[9,11] theta[10,11] ⇒ lanes: alpha 1, beta 2, gamma 3, delta 4,
  // epsilon reuses 1, zeta reuses 3, eta 5, theta reuses 2 — 8 branches in 5.
  const branches: Array<{ name: string; fork: number; len: number; mergedAt?: number }> = [
    { name: "feat/alpha", fork: 1, len: 3, mergedAt: 5 },
    { name: "feat/beta", fork: 2, len: 4, mergedAt: 8 },
    { name: "feat/gamma", fork: 3, len: 2 },
    { name: "hotfix/delta", fork: 6, len: 2, mergedAt: 10 },
    { name: "feat/epsilon", fork: 7, len: 3 },
    { name: "fix/zeta", fork: 8, len: 2, mergedAt: 11 },
    { name: "feat/eta", fork: 9, len: 2 },
    { name: "chore/theta", fork: 10, len: 1 },
  ];
  const slug = (name: string): string => name.replace(/\W+/g, "-");
  for (const b of branches) {
    const ids = Array.from({ length: b.len }, (_, k) => `${slug(b.name)}-${k}`);
    ids.forEach((id, k) => {
      nodes.push({ id, type: "Commit", repo });
      colorOf.set(id, BRANCH_COLORS[b.name]!);
      edges.push({
        source: id,
        target: k === 0 ? `m${b.fork}` : ids[k - 1]!,
        relation: "commit-parent",
      });
    });
    const branchNode = `branch-${slug(b.name)}`;
    nodes.push({ id: branchNode, type: "Branch", repo, name: b.name });
    colorOf.set(branchNode, BRANCH_COLORS[b.name]!);
    edges.push({ source: branchNode, target: ids[ids.length - 1]!, relation: "branch-head" });
  }

  // Sessions: two stacked on feat/alpha's 2nd commit, one on fix/zeta's tip,
  // one attached to feat/eta by touched-branch only (tip-anchored).
  const sessions: Array<{ id: string; agent: string; produced?: string; touched?: string }> = [
    { id: "sess-a1", agent: "claude", produced: "feat-alpha-1" },
    { id: "sess-a2", agent: "codex", produced: "feat-alpha-1" },
    { id: "sess-z", agent: "gemini", produced: "fix-zeta-1" },
    { id: "sess-e", agent: "claude", touched: "branch-feat-eta" },
  ];
  for (const s of sessions) {
    nodes.push({ id: s.id, type: "Session", repo });
    agentOf.set(s.id, s.agent);
    if (s.produced) edges.push({ source: s.id, target: s.produced, relation: "produced" });
    if (s.touched) edges.push({ source: s.id, target: s.touched, relation: "touched-branch" });
  }
  edges.push({ source: "sess-a2", target: "sess-a1", relation: "derived-from" });

  // MERGE-BACK connectors LAST so they draw ON TOP of the trunk lane arrows
  // that share the merge commits' left ports.
  for (const b of branches) {
    if (b.mergedAt === undefined) continue;
    edges.push({
      source: `${slug(b.name)}-${b.len - 1}`, // branch TIP commit
      target: `m${b.mergedAt}`, // the merge/squash commit on main
      relation: "merged-as",
    });
  }

  // ---- Layout, then map to a harness fixture. -----------------------------
  const layout = computeGitFlowPositions({ nodes, edges }, LAYOUT_OPTS);
  const world = new Map<string, [number, number]>();
  nodes.forEach((node, i) => {
    world.set(node.id, [layout.positions[i * 2]!, layout.positions[i * 2 + 1]!]);
  });

  const fixtureNodes = nodes.map((node, i) => {
    const [x, y] = world.get(node.id)!;
    if (node.type === "Branch") {
      return { id: node.id, x, y, size: 10, shape: "box", label: node.name, color: colorOf.get(node.id) };
    }
    if (node.type === "Session") {
      return { id: node.id, x, y, size: 4, shape: "triangle", color: AGENT_COLORS[agentOf.get(node.id)!]! };
    }
    return { id: node.id, x, y, size: 5, shape: "dot", color: colorOf.get(node.id) };
  });

  const fixtureEdges = edges.map((edge, e) => {
    const hint = layout.edgeHints[e]!;
    if (hint.style === "flow-port" || hint.style === "flow-port-reverse") {
      // ARROW GRAMMAR: hints with arrow:false (fork descents) map to the
      // *-no-arrow edge_style; merges / lane segments keep the arrowhead.
      const edgeStyle = hint.arrow === false ? `${hint.style}-no-arrow` : hint.style;
      return {
        source: edge.source,
        target: edge.target,
        width: 2,
        // Lane colour = the branch-side commit's colour: the CHILD of a
        // child→parent data edge, which is the SOURCE for both commit-parent
        // (child→parent) and merged-as (tip→merge) edges.
        color: colorOf.get(edge.source) ?? TRUNK_COLOR,
        edge_style: edgeStyle,
        ...(hint.dash === "dashed" ? { dash: "dashed" } : {}),
      };
    }
    if (hint.style === "session-link") {
      return { source: edge.source, target: edge.target, width: 1, color: SESSION_LINK_COLOR, dash: "dotted" };
    }
    if (hint.style === "hidden") {
      // Fully transparent (#rrggbbaa with a=0): the structural edge exists in
      // the buffers but draws nothing — the flow view hides it.
      return { source: edge.source, target: edge.target, width: 1, color: "#00000000" };
    }
    return { source: edge.source, target: edge.target, width: 1 };
  });

  return { fixture: { nodes: fixtureNodes, edges: fixtureEdges }, world, layout };
}

// Camera framing the whole band: world x ∈ [−36, ~660], y ∈ [0, ~215].
const DEMO_OPTS = {
  dpr: 1,
  cssWidth: 900,
  cssHeight: 340,
  camera: { x: 310, y: 100, zoom: 1 },
};
const VIEW = { width: 900, height: 340, zoom: 1, camera: DEMO_OPTS.camera };

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** True when any pixel within `r` of (x, y) matches `rgb` (AA-tolerant). */
function inkNear(
  cap: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
  y: number,
  rgb: [number, number, number],
  r = 2,
  tolerance = 60,
): boolean {
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const p = samplePixel(cap, Math.round(x + dx), Math.round(y + dy));
      if (!p) continue;
      if (
        Math.abs(p[0] - rgb[0]) <= tolerance &&
        Math.abs(p[1] - rgb[1]) <= tolerance &&
        Math.abs(p[2] - rgb[2]) <= tolerance
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Background test: the Canvas2D harness page composites onto WHITE, the WebGL
 * readback clears to TRANSPARENT — accept either as "nothing drawn here".
 */
function isBackground(p: number[]): boolean {
  return p[3]! <= 10 || (p[0]! >= 245 && p[1]! >= 245 && p[2]! >= 245);
}

function writePng(
  cap: { width: number; height: number; data: Uint8ClampedArray },
  file: string,
): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, file);
  fs.writeFileSync(outPath, encodePng(cap));
  return outPath;
}

// ---------------------------------------------------------------------------

let oracle: Awaited<ReturnType<typeof openOracle>> | null = null;
let chromeUp = false;

beforeAll(async () => {
  try {
    oracle = await openOracle();
    chromeUp = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[gitflow-golden] Chrome/CDP oracle unavailable, CDP blocks skip:", String(err));
    chromeUp = false;
  }
}, 60_000);

afterAll(async () => {
  if (oracle) await oracle.close();
});

describe("git-flow demo — layout sanity (pure, always runs)", () => {
  const demo = buildGitFlowDemo();

  it("8 branches fit in 5 reused lanes + trunk; every branch placed", () => {
    expect(demo.layout.laneCounts.get("demo")).toBe(6);
    for (const name of Object.keys(BRANCH_COLORS)) {
      const label = demo.layout.branchLabels.find((l) => l.name === name);
      expect(label, name).toBeDefined();
    }
    // Freed-lane REUSE pairs share a y (merged branches hold their lane up to
    // the MERGE rank, so reuse only happens after the merge-extended interval).
    const y = (id: string): number => demo.world.get(id)![1];
    expect(y("feat-epsilon-0")).toBe(y("feat-alpha-0")); // alpha merged@5, epsilon forks 7
    expect(y("fix-zeta-0")).toBe(y("feat-gamma-0")); // gamma open to 5, zeta forks 8
    expect(y("chore-theta-0")).toBe(y("feat-beta-0")); // beta merged@8, theta forks 10
    // Overlapping / merge-extended intervals on distinct lanes.
    expect(y("feat-alpha-0")).not.toBe(y("feat-beta-0"));
    expect(y("feat-beta-0")).not.toBe(y("feat-gamma-0"));
    // delta forks at 6 — alpha's lane is NOT free (alpha merged at rank 5,
    // 5+gap ≥ 6), so delta must sit on a fresh lane: the merge EXTENDS reuse.
    expect(y("hotfix-delta-0")).not.toBe(y("feat-alpha-0"));
  });

  it("merged branches emit ARROWED flow-port merge hints; forks are BARE", () => {
    const hintOf = (src: string, tgt: string) => {
      const e = demo.layout.edgeHints[
        // Find the edge index by scanning the demo's input order.
        (demo.fixture.edges as Array<{ source: string; target: string }>).findIndex(
          (edge) => edge.source === src && edge.target === tgt,
        )
      ];
      return e;
    };
    // Merge connectors: tip → merge commit, style flow-port, arrowed.
    for (const [tip, merge] of [
      ["feat-alpha-2", "m5"],
      ["feat-beta-3", "m8"],
      ["hotfix-delta-1", "m10"],
      ["fix-zeta-1", "m11"],
    ] as const) {
      const hint = hintOf(tip, merge)!;
      expect(hint.style, `${tip}→${merge}`).toBe("flow-port");
      expect(hint.arrow, `${tip}→${merge}`).toBe(true);
    }
    // Fork descents: first branch commit → fork commit, bare.
    const fork = hintOf("feat-alpha-0", "m1")!;
    expect(fork.style).toBe("flow-port-reverse");
    expect(fork.arrow).toBe(false);
  });

  it("sessions sit under their produced commit, tagged by agent colour in the fixture", () => {
    const [cx, cy] = demo.world.get("feat-alpha-1")!;
    const [s1x, s1y] = demo.world.get("sess-a1")!;
    const [s2x, s2y] = demo.world.get("sess-a2")!;
    expect(s1x).toBe(cx);
    expect(s2x).toBe(cx);
    expect(s1y).toBeGreaterThan(cy);
    expect(s2y).toBeGreaterThan(s1y);
  });
});

describe("git-flow demo — golden capture (Chrome/CDP; skips without Chrome)", () => {
  it("re-captures byte-identical (A/B determinism floor)", async () => {
    if (!chromeUp || !oracle) return;
    const { fixture } = buildGitFlowDemo();
    const a = await oracle.capture(fixture, DEMO_OPTS);
    const b = await oracle.capture(fixture, DEMO_OPTS);
    const d = diffPixels(a, b, { channelTolerance: 0, maxFailingPixels: 0 });
    expect(d.dimsMatch).toBe(true);
    expect(d.maxChannelDelta).toBe(0);
    expect(d.failingPixels).toBe(0);
  }, 60_000);

  it("PORTS: lane ink between commits, NO bottom exit at a fork, horizontal left-port arrival", async () => {
    if (!chromeUp || !oracle) return;
    const demo = buildGitFlowDemo();
    const cap = await oracle.capture(demo.fixture, DEMO_OPTS);

    // 1. Straight LANE SEGMENT: trunk ink midway between m4 and m5 (port-to-port).
    const [m4x] = demo.world.get("m4")!;
    const [m5x] = demo.world.get("m5")!;
    const [midX, midY] = worldToDevice([(m4x + m5x) / 2, 0], VIEW);
    expect(inkNear(cap, midX, midY, hexToRgb(TRUNK_COLOR), 2), "lane segment ink").toBe(true);

    // 2. NO BOTTOM EXIT at the fork commit m1 (size 5 ⇒ radius 5): the alpha
    //    branch-off must LEAVE THROUGH THE RIGHT PORT, so 10 px below the
    //    commit centre there is NOTHING — the exact centre-to-centre failure
    //    ("edges leave from the bottom of the commit") this lot fixes.
    const [m1x, m1y] = demo.world.get("m1")!;
    const [belowX, belowY] = worldToDevice([m1x, m1y + 10], VIEW);
    const below = samplePixel(cap, Math.round(belowX), Math.round(belowY));
    expect(isBackground(below), `no ink below the fork commit (got rgba ${below})`).toBe(true);

    // 3. HORIZONTAL ARRIVAL at feat/alpha's first commit LEFT port: the BARE
    //    fork S arrives level (edge ink up to and just left of the port) —
    //    arrowhead ABSENCE is pinned by the dedicated asymmetry capture below.
    const alpha = hexToRgb(BRANCH_COLORS["feat/alpha"]!);
    const [a0x, a0y] = demo.world.get("feat-alpha-0")!;
    const [portX, portY] = worldToDevice([a0x - 5, a0y], VIEW); // left border (radius 5)
    expect(inkNear(cap, portX - 3, portY, alpha, 2), "fork S reaches the left port").toBe(true);
    expect(inkNear(cap, portX - 9, portY, alpha, 3), "level S arrival ink").toBe(true);
    // …and the approach is NOT from below: no alpha ink well under the port.
    expect(inkNear(cap, portX - 3, portY + 12, alpha, 2), "no under-port approach").toBe(false);

    // 4. MERGE-BACK connector (feat/alpha tip → m5): an ASCENDING S in the
    //    branch colour that ARRIVES ARROWED at the merge commit's LEFT port.
    const [m5wx, m5wy] = demo.world.get("m5")!;
    const [mergePortX, mergePortY] = worldToDevice([m5wx - 5, m5wy], VIEW);
    expect(inkNear(cap, mergePortX - 3, mergePortY, alpha, 2), "merge arrow into m5 left port").toBe(true);
    const [tipX, tipY] = demo.world.get("feat-alpha-2")!;
    const [midMx, midMy] = worldToDevice([(tipX + 5 + (m5wx - 5)) / 2, (tipY + m5wy) / 2], VIEW);
    expect(inkNear(cap, midMx, midMy, alpha, 3), "ascending merge S mid-path ink").toBe(true);
    // The merge S RISES: no alpha ink lingering at the tip's lane level
    // directly below the merge commit (the connector has already climbed).
    expect(inkNear(cap, mergePortX - 3, mergePortY + 12, alpha, 2), "merge approach not from below-lane").toBe(false);

    // 5. ALL branches drawn (no top-K): every branch colour has pixels.
    for (const [name, colorHex] of Object.entries(BRANCH_COLORS)) {
      expect(countColorPixels(cap, hexToRgb(colorHex), 24), name).toBeGreaterThan(0);
    }

    const png = writePng(cap, "gitflow-demo.png");
    // eslint-disable-next-line no-console
    console.log(`[gitflow-golden] canvas2d demo screenshot: ${png}`);
  }, 60_000);

  it("ARROW ASYMMETRY: an arrowed flow edge deposits measurably MORE ink at the left port than a bare one", async () => {
    if (!chromeUp || !oracle) return;
    // Same two nodes + same S geometry, width 6 (arrow length 15): the ONLY
    // difference is edge_style. The rect just left of the target port must
    // hold clearly more ink when the arrowhead is present. This is the
    // fork-has-NO-arrowhead gate: bare == no triangle fill.
    const mk = (edgeStyle: string) => ({
      nodes: [
        { id: "a", x: 0, y: 0, size: 8, shape: "dot", color: "#22c55e" },
        { id: "b", x: 120, y: 60, size: 8, shape: "dot", color: "#22c55e" },
      ],
      edges: [{ source: "a", target: "b", width: 6, color: "#22c55e", edge_style: edgeStyle }],
    });
    const opts = { dpr: 1, cssWidth: 300, cssHeight: 200, camera: { x: 60, y: 30, zoom: 1 } };
    const view = { width: 300, height: 200, zoom: 1, camera: opts.camera };
    const arrowed = await oracle.capture(mk("flow-port"), opts);
    const bare = await oracle.capture(mk("flow-port-no-arrow"), opts);

    const [portX, portY] = worldToDevice([120 - 8, 60], view); // b's left port
    const rectInk = (cap: { width: number; height: number; data: Uint8ClampedArray }): number => {
      let ink = 0;
      for (let y = Math.round(portY - 9); y <= Math.round(portY + 9); y += 1) {
        for (let x = Math.round(portX - 16); x <= Math.round(portX); x += 1) {
          if (!isBackground(samplePixel(cap, x, y))) ink += 1;
        }
      }
      return ink;
    };
    const inkArrowed = rectInk(arrowed);
    const inkBare = rectInk(bare);
    expect(inkBare, "bare S still reaches the port").toBeGreaterThan(0);
    expect(inkArrowed, `arrowed=${inkArrowed} bare=${inkBare}`).toBeGreaterThan(inkBare + 25);
  }, 60_000);

  it("WebGL2 instanced path draws the same demo (skips without a GL context)", async () => {
    if (!chromeUp || !oracle) return;
    const hasGL = await oracle.hasWebGL();
    if (!hasGL) {
      // eslint-disable-next-line no-console
      console.warn("[gitflow-golden] no WebGL2 context — GL capture skipped (explicit)");
      return;
    }
    const demo = buildGitFlowDemo();
    const cap = await oracle.capture(demo.fixture, {
      ...DEMO_OPTS,
      backend: "webgl",
      instancedShapes: true,
    });
    // Same port probes as Canvas2D — the flow-port geometry is single-sourced.
    const [m1x, m1y] = demo.world.get("m1")!;
    const [belowX, belowY] = worldToDevice([m1x, m1y + 10], VIEW);
    const below = samplePixel(cap, Math.round(belowX), Math.round(belowY));
    expect(isBackground(below), `no ink below the fork commit (GL, got rgba ${below})`).toBe(true);
    // Merge-back connector arrives (arrowed) at m5's left port in alpha green.
    const alphaGL = hexToRgb(BRANCH_COLORS["feat/alpha"]!);
    const [m5wx, m5wy] = demo.world.get("m5")!;
    const [mergePortX, mergePortY] = worldToDevice([m5wx - 5, m5wy], VIEW);
    expect(inkNear(cap, mergePortX - 3, mergePortY, alphaGL, 2), "merge arrow into m5 (GL)").toBe(true);
    for (const [name, colorHex] of Object.entries(BRANCH_COLORS)) {
      expect(countColorPixels(cap, hexToRgb(colorHex), 24), `${name} (GL)`).toBeGreaterThan(0);
    }
    const png = writePng(cap, "gitflow-demo-webgl.png");
    // eslint-disable-next-line no-console
    console.log(`[gitflow-golden] webgl demo screenshot: ${png}`);
  }, 60_000);
});

describe("git-flow demo — napi smoke screenshot (always where napi is present)", () => {
  it("renders the demo via the napi Canvas2D path and writes the PNG artifact", async () => {
    if (!napiAvailable()) return;
    const { fixture } = buildGitFlowDemo();
    const cap = await smokeCapture(fixture, DEMO_OPTS);
    expect(cap.width).toBe(900);
    expect(cap.height).toBe(340);
    // The demo actually drew: trunk + at least one branch colour present.
    expect(countColorPixels(cap, hexToRgb(TRUNK_COLOR), 24)).toBeGreaterThan(0);
    expect(countColorPixels(cap, hexToRgb(BRANCH_COLORS["feat/alpha"]!), 24)).toBeGreaterThan(0);
    const png = writePng(cap, chromeUp ? "gitflow-demo-napi.png" : "gitflow-demo.png");
    // eslint-disable-next-line no-console
    console.log(`[gitflow-golden] napi demo screenshot: ${png}`);
  }, 60_000);
});
