import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  candidateSubgraph,
  RECON_SUBGRAPH_DEPTH,
  RECON_SUBGRAPH_MAX_NODES,
} from "../lib/graphAdapter.js";

/**
 * TRACKED #4 / #4.1 — Reconciliation view redesign.
 *
 * The studio's component tests assert against the .svelte SOURCE (jsdom has no
 * Canvas2D, so we don't mount the GraphCanvas-bearing component — see
 * appHeader.test.js / entityPanel.test.js for the same source-assertion style).
 * The behavioural half (#4.1 depth + fan-out cap) is proven against the real
 * graphAdapter functions with a deterministic synthetic graph.
 */
const viewSource = readFileSync(
  resolve(process.cwd(), "src/components/ReconciliationView.svelte"),
  "utf8",
);

describe("ReconciliationView rail redesign (TRACKED #4)", () => {
  it("(a) groups candidates by entity TYPE with type headers", () => {
    // Derived buckets keyed by the candidate node's type (typeOf), header markup.
    expect(viewSource).toMatch(/const grouped = \$derived\.by/);
    expect(viewSource).toMatch(/typeOf\(c\.candidate_id\) \?\? typeOf\(c\.canonical_id\) \?\? "Other"/);
    expect(viewSource).toMatch(/{#each grouped as group/);
    expect(viewSource).toMatch(/class="recon-group-head"/);
    expect(viewSource).toMatch(/class="recon-group-type">{group\.type}/);
  });

  it("(b) renders the match score as a % bubble on the RIGHT of each row", () => {
    expect(viewSource).toMatch(/class="recon-score-bubble"/);
    expect(viewSource).toMatch(/Math\.round\(\(c\.score \?\? 0\) \* 100\)}%/);
    // The bubble sits after the two-line pair in the row (i.e. to its right) and
    // is non-shrinking, pinned right via justify-content: space-between.
    const rowStart = viewSource.indexOf('class="recon-rail-pair"');
    const bubbleStart = viewSource.indexOf('class="recon-score-bubble"');
    expect(rowStart).toBeGreaterThan(-1);
    expect(bubbleStart).toBeGreaterThan(rowStart);
    expect(viewSource).toMatch(/\.recon-score-bubble\s*{[\s\S]*flex:\s*none;[\s\S]*}/);
    expect(viewSource).toMatch(/\.recon-rail-row\s*{[\s\S]*justify-content:\s*space-between;[\s\S]*}/);
  });

  it("(c) shows the two entities on TWO separate lines", () => {
    expect(viewSource).toMatch(/class="recon-rail-pair"/);
    // Two distinct line spans: candidate, then canonical.
    expect(viewSource).toMatch(
      /class="recon-rail-line"[^>]*>{label\(c\.candidate_id\)}/,
    );
    expect(viewSource).toMatch(
      /class="recon-rail-line recon-rail-canon"[^>]*>{label\(c\.canonical_id\)}/,
    );
    // The pair container is a vertical flex column (the two lines stack).
    expect(viewSource).toMatch(/\.recon-rail-pair\s*{[\s\S]*flex-direction:\s*column;[\s\S]*}/);
  });

  it("(d) gives each candidate a checkbox and supports batch validate/reject", () => {
    // Per-row checkbox bound to a reactive selection set.
    expect(viewSource).toMatch(/import { SvelteSet } from "svelte\/reactivity";/);
    expect(viewSource).toMatch(/let selected = \$state\(new SvelteSet\(\)\)/);
    expect(viewSource).toMatch(/class="recon-rail-check"\s*\n?\s*type="checkbox"/);
    expect(viewSource).toMatch(/onchange={\(\) => toggleSelected\(c\.id\)}/);
    // Select-all + bulk action buttons wired to decideBulk.
    expect(viewSource).toMatch(/onchange={toggleSelectAll}/);
    expect(viewSource).toMatch(/onclick={\(\) => decideBulk\("accept"\)}/);
    expect(viewSource).toMatch(/onclick={\(\) => decideBulk\("reject"\)}/);
    expect(viewSource).toMatch(/async function decideBulk\(decision\)/);
  });
});

describe("ReconciliationView focal-pair depth (TRACKED #4.1)", () => {
  it("calls candidateSubgraph at depth reconDepth (default 3), not 1", () => {
    expect(viewSource).toMatch(/reconDepth = RECON_SUBGRAPH_DEPTH/);
    expect(viewSource).toMatch(
      /candidateSubgraph\(graph, active\.candidate_id, active\.canonical_id, reconDepth/,
    );
    // No lingering hard-coded 1-hop call.
    expect(viewSource).not.toMatch(/candidateSubgraph\(graph, active\.candidate_id, active\.canonical_id, 1\)/);
    expect(RECON_SUBGRAPH_DEPTH).toBe(3);
  });

  it("depth 3 expands the neighbourhood beyond 1 hop on a real chain", () => {
    // A → n1 → n2 → n3 → n4 chain off the candidate; B isolated.
    const graph = {
      nodes: [
        { id: "A" }, { id: "B" },
        { id: "n1" }, { id: "n2" }, { id: "n3" }, { id: "n4" },
      ],
      links: [
        { source: "A", target: "n1" },
        { source: "n1", target: "n2" },
        { source: "n2", target: "n3" },
        { source: "n3", target: "n4" },
      ],
    };
    const d1 = candidateSubgraph(graph, "A", "B", 1).nodes.map((n) => n.id).sort();
    const d3 = candidateSubgraph(graph, "A", "B", 3).nodes.map((n) => n.id).sort();
    expect(d1).toEqual(["A", "B", "n1"]); // 1 hop: only the immediate neighbour.
    expect(d3).toEqual(["A", "B", "n1", "n2", "n3"]); // 3 hops reach n3, not n4.
    expect(d3.length).toBeGreaterThan(d1.length);
  });

  it("caps fan-out at maxNodes while always keeping both seed twins", () => {
    // A hub with 500 leaves; depth 1 alone would pull all 500 + B.
    const nodes = [{ id: "A" }, { id: "B" }];
    const links = [];
    for (let i = 0; i < 500; i++) {
      nodes.push({ id: `leaf${i}` });
      links.push({ source: "A", target: `leaf${i}` });
    }
    const sub = candidateSubgraph({ nodes, links }, "A", "B", 3, { maxNodes: 50 });
    const ids = sub.nodes.map((n) => n.id);
    expect(ids.length).toBeLessThanOrEqual(50);
    // The two twins under comparison are never dropped by the cap.
    expect(ids).toContain("A");
    expect(ids).toContain("B");
    expect(RECON_SUBGRAPH_MAX_NODES).toBe(160);
  });
});
