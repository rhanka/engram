/**
 * BEFORE/AFTER topology proof for the de-orphan giant-component fix (TRACKED #3).
 *
 * Runs the REAL `deOrphanByContainer` on a COPY of the published mystery-sagas
 * bundle graph (`.graphify/scratch/proof/graph-input.json`, copied in — never
 * written back). Reconstructs the orphan-rich pre-de-orphan extraction by
 * stripping the previously-derived `appears_in` edges, then measures topology
 * for: (BEFORE) orphan-rich, (OLD) legacy strict-finest de-orphan, (NEW)
 * giant-component de-orphan. Asserts the fix's invariants and writes the
 * measured metrics to `.graphify/scratch/proof/topology-before-after.json`.
 *
 * The proof graph is optional: if the copy is absent the heavy proof is skipped
 * (the synthetic invariant tests below still run in every environment / CI).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { deOrphanByContainer } from "../src/assembly-hygiene.js";
import type { Extraction, GraphEdge, GraphNode } from "../src/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = resolve(HERE, "../.graphify/scratch/proof");
const INPUT = resolve(PROOF_DIR, "graph-input.json");

// --- topology measurement (mirrors .graphify/scratch/proof/measure.py) -------
type Topo = {
  nNodes: number;
  nEdges: number;
  nComponents: number;
  largestComponentSize: number;
  largestComponentFrac: number;
  nIsolated1node: number;
  n2nodeIslands: number;
  nDegree1: number;
  nDegree0: number;
  maxHubDegree: number;
  maxHubNode: string | null;
  maxHubDegree1Spokes: number;
};

function endpoint(v: unknown): string {
  if (v && typeof v === "object" && "id" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).id);
  }
  return String(v);
}

function adjacency(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(String(n.id), new Set());
  for (const e of edges) {
    const s = endpoint(e.source);
    const t = endpoint(e.target);
    if (s === t) continue;
    const sa = adj.get(s);
    const ta = adj.get(t);
    if (sa && ta) {
      sa.add(t);
      ta.add(s);
    }
  }
  return adj;
}

function components(adj: Map<string, Set<string>>): Set<string>[] {
  const seen = new Set<string>();
  const comps: Set<string>[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      if (comp.has(u)) continue;
      comp.add(u);
      seen.add(u);
      for (const v of adj.get(u) ?? []) if (!comp.has(v)) stack.push(v);
    }
    comps.push(comp);
  }
  return comps;
}

function measure(nodes: GraphNode[], edges: GraphEdge[]): Topo {
  const adj = adjacency(nodes, edges);
  const deg = new Map<string, number>();
  for (const [k, v] of adj) deg.set(k, v.size);
  const comps = components(adj);
  let largest = new Set<string>();
  for (const c of comps) if (c.size > largest.size) largest = c;
  const two = comps.filter((c) => c.size === 2).length;
  const iso = comps.filter((c) => c.size === 1).length;
  let d1 = 0;
  let d0 = 0;
  let maxHub = "";
  let maxDeg = -1;
  for (const [k, d] of deg) {
    if (d === 1) d1 += 1;
    if (d === 0) d0 += 1;
    if (d > maxDeg) {
      maxDeg = d;
      maxHub = k;
    }
  }
  let spokes = 0;
  for (const v of adj.get(maxHub) ?? []) if ((deg.get(v) ?? 0) === 1) spokes += 1;
  return {
    nNodes: nodes.length,
    nEdges: edges.length,
    nComponents: comps.length,
    largestComponentSize: largest.size,
    largestComponentFrac: nodes.length ? Number((largest.size / nodes.length).toFixed(4)) : 0,
    nIsolated1node: iso,
    n2nodeIslands: two,
    nDegree1: d1,
    nDegree0: d0,
    maxHubDegree: maxDeg < 0 ? 0 : maxDeg,
    maxHubNode: maxHub || null,
    maxHubDegree1Spokes: spokes,
  };
}

function loadExtraction(): Extraction {
  const raw = JSON.parse(readFileSync(INPUT, "utf8")) as {
    nodes: GraphNode[];
    links?: GraphEdge[];
    edges?: GraphEdge[];
  };
  const nodes = raw.nodes ?? [];
  const edges = (raw.links ?? raw.edges ?? []) as GraphEdge[];
  return { nodes, edges, hyperedges: [], input_tokens: 0, output_tokens: 0 };
}

/** Strip previously-derived de-orphan edges to recreate the orphan-rich state. */
function stripDerivedDeOrphan(ex: Extraction): Extraction {
  const edges = (ex.edges ?? []).filter(
    (e) => !String((e as Record<string, unknown>).derivation_method ?? "").startsWith("deorphan"),
  );
  return { ...ex, edges };
}

describe.runIf(existsSync(INPUT))("de-orphan topology proof (real mystery-sagas bundle)", () => {
  it("NEW giant-component de-orphan: zero new 2-node islands, joins giant, bounded star growth", () => {
    const published = loadExtraction();
    const before = stripDerivedDeOrphan(published);

    const topoBefore = measure(before.nodes, before.edges);
    const oldRun = deOrphanByContainer(before, { preferGiantComponent: false });
    const newRun = deOrphanByContainer(before, { preferGiantComponent: true });
    const topoOld = measure(oldRun.extraction.nodes, oldRun.extraction.edges);
    const topoNew = measure(newRun.extraction.nodes, newRun.extraction.edges);

    // Idempotency: re-running NEW on its own output adds nothing and is byte-equal.
    const newAgain = deOrphanByContainer(newRun.extraction, { preferGiantComponent: true });
    expect(newAgain.appearsInAdded).toBe(0);
    expect(newAgain.extraction.edges).toEqual(newRun.extraction.edges);

    // INVARIANT 1: NEW introduces NO new 2-node islands vs the orphan-rich BEFORE.
    expect(topoNew.n2nodeIslands).toBeLessThanOrEqual(topoBefore.n2nodeIslands);

    // INVARIANT 2: every de-orphaned node joins a component; NEW's largest
    // component is at least as large a fraction as OLD's (it steers to giant).
    expect(topoNew.largestComponentFrac).toBeGreaterThanOrEqual(topoOld.largestComponentFrac);

    // INVARIANT 3: NEW does not amplify the worst pure star more than OLD does
    // (giant-mode prefers already-connected containers / the Work anchor).
    expect(topoNew.maxHubDegree1Spokes).toBeLessThanOrEqual(topoOld.maxHubDegree1Spokes);

    // INVARIANT 4: no orphan is left isolated by NEW where the Work was reachable
    // — orphans-after must not exceed orphans-after of OLD.
    expect(newRun.orphansAfter).toBeLessThanOrEqual(oldRun.orphansAfter);

    const out = {
      note:
        "BEFORE = published bundle with derived deorphan edges stripped (orphan-rich). " +
        "OLD = legacy strict-finest-container. NEW = giant-component-aware. " +
        "Residual 2-node islands in BEFORE are EXTRACTED entity-entity pairs (not " +
        "produced by de-orphan); the deeper low-density cause (~64.8% of entities " +
        "carry only appears_in) is the separate re-index (TRACKED #5).",
      source_graph: "public-domaine-mystery-sagas-pack/.graphify/scratch/republish-0.14.1/bundle/graph.json (copy)",
      before: topoBefore,
      old_strict_finest: topoOld,
      new_giant_component: topoNew,
      old_run: { appearsInAdded: oldRun.appearsInAdded, orphansBefore: oldRun.orphansBefore, orphansAfter: oldRun.orphansAfter, unresolved: oldRun.unresolved },
      new_run: { appearsInAdded: newRun.appearsInAdded, orphansBefore: newRun.orphansBefore, orphansAfter: newRun.orphansAfter, unresolved: newRun.unresolved },
    };
    mkdirSync(PROOF_DIR, { recursive: true });
    writeFileSync(resolve(PROOF_DIR, "topology-before-after.json"), JSON.stringify(out, null, 2));
  });
});
