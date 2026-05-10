/**
 * Community label persistence helpers.
 *
 * Mirrors upstream Python Graphify behavior (commits b3c99ec, e22a189): community
 * labels live in `.graphify_labels.json` next to graph.json, and survive
 * cluster-only / hook-rebuild / update flows even when the graph is rebuilt
 * from scratch.
 *
 * Resolution priority for an active label set:
 *   1. `<stateDir>/.graphify_labels.json` (canonical project-owned source)
 *   2. `community_labels` graph attribute embedded in the loaded graph
 *   3. `Community <id>` defaults
 *
 * After every rebuild we write the active label set back to the JSON file,
 * so renames performed by an assistant skill or by editing the file directly
 * are not lost on the next rebuild.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type Graph from "graphology";

function readLabelsJson(filePath: string): Map<number, string> {
  if (!existsSync(filePath)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    const out = new Map<number, string>();
    for (const [key, value] of Object.entries(raw)) {
      const cid = Number(key);
      if (!Number.isFinite(cid) || Number.isNaN(cid)) continue;
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      out.set(cid, trimmed);
    }
    return out;
  } catch {
    return new Map();
  }
}

function readGraphAttributeLabels(G: Graph | undefined): Map<number, string> {
  if (!G) return new Map();
  const attr = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  const out = new Map<number, string>();
  if (!attr || typeof attr !== "object") return out;
  for (const [key, value] of Object.entries(attr)) {
    const cid = Number(key);
    if (!Number.isFinite(cid) || Number.isNaN(cid)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    out.set(cid, trimmed);
  }
  return out;
}

/**
 * Resolve the active label set for the given communities, applying
 * `Community <id>` defaults to anything not covered by the persisted
 * label file or the graph attribute.
 */
export function resolveCommunityLabels(
  communities: Map<number, string[]>,
  options: {
    labelsPath?: string;
    graph?: Graph;
  } = {},
): Map<number, string> {
  const fileLabels = options.labelsPath ? readLabelsJson(options.labelsPath) : new Map<number, string>();
  const graphLabels = readGraphAttributeLabels(options.graph);

  const labels = new Map<number, string>();
  for (const cid of communities.keys()) {
    const fromFile = fileLabels.get(cid);
    if (fromFile) {
      labels.set(cid, fromFile);
      continue;
    }
    const fromGraph = graphLabels.get(cid);
    if (fromGraph) {
      labels.set(cid, fromGraph);
      continue;
    }
    labels.set(cid, `Community ${cid}`);
  }
  return labels;
}

/**
 * Persist the active label set to `.graphify_labels.json` so subsequent
 * cluster-only / hook-rebuild / update runs can reuse user-renamed labels.
 *
 * Always writes (even when only defaults are present) so the file is a
 * stable record of the latest community ID set; this matches the upstream
 * Python persistence contract.
 */
export function persistCommunityLabels(
  labels: Map<number, string>,
  labelsPath: string,
): void {
  mkdirSync(dirname(labelsPath), { recursive: true });
  const payload: Record<string, string> = {};
  for (const [cid, label] of [...labels.entries()].sort((a, b) => a[0] - b[0])) {
    payload[String(cid)] = label;
  }
  writeFileSync(labelsPath, JSON.stringify(payload, null, 2), "utf-8");
}
