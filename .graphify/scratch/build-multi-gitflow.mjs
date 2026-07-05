#!/usr/bin/env node
// build-multi-gitflow.mjs — ALL-projects real-mode graph for the git-flow live page.
//
// For EVERY git repo under ~/src (mechanical rule: <dir>/.git exists — nothing
// else skipped), this script:
//   1. writes a ProjectIdentity cfg (.graphify/scratch/multi/cfg-<repo>.json,
//      pathPrefixes in TILDE form — the facts store normalizes cwds to ~),
//   2. runs the BRANCH-built CLI (feat/gitflow-labels worktree dist):
//        agent-stats sync                      (cwd = the repo)
//        agent-stats project-graph --config …  (cwd = the repo)
//      with --git-since all --git-max-count 3000,
//   3. keeps repos yielding >0 Session or >0 Commit nodes,
//   4. de-collides Commit node ids across keepers (commit_<sha7> is NOT
//      repo-prefixed upstream; 7-hex prefixes can collide across ~40 repos),
//   5. `merge-graphs` the keepers, slims to the live-page shape
//      (nodes {id,type,repo,name?,agent?,t?} — t = commit committer-date
//       epoch-ms, needed by the xMode:"time" axis; edges {source,target,relation})
//      and overwrites .graphify/uat/gitflow-live/real-graph.json,
//   6. prints an honest per-repo summary table (also saved to
//      .graphify/scratch/multi/summary.txt).
//
// Usage: node .graphify/scratch/build-multi-gitflow.mjs [--only repoA,repoB]
//        (--only = debug subset; the default is EVERY repo)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileP = promisify(execFile);

const SRC_DIR = path.join(os.homedir(), "src");
const MAIN = path.join(SRC_DIR, "graphify");
const CLI = path.join(MAIN, ".claude/worktrees/gitflow-labels/dist/cli.js");
const MULTI_DIR = path.join(MAIN, ".graphify/scratch/multi");
const OUT_REAL = path.join(MAIN, ".graphify/uat/gitflow-live/real-graph.json");
const GIT_SINCE = "all";
const GIT_MAX_COUNT = "3000";
const CONCURRENCY = 3;
// Relations the live page consumes (see .graphify/uat/gitflow-live/index.html).
const LIVE_RELATIONS = new Set([
  "commit-parent", "branch-head", "produced", "touched-branch", "merged-as", "derived-from",
]);

const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg !== -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;

fs.mkdirSync(MULTI_DIR, { recursive: true });

// ---------- 1. discover candidate repos (mechanical: has .git) ----------
const repos = fs.readdirSync(SRC_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((name) => fs.existsSync(path.join(SRC_DIR, name, ".git")))
  .filter((name) => (ONLY ? ONLY.has(name) : true))
  .sort();

console.log(`[multi-gitflow] ${repos.length} candidate repos under ${SRC_DIR}`);

// ---------- 2. per-repo sync + project-graph (bounded pool) ----------
const results = new Map(); // repo -> row

async function processRepo(repo) {
  const t0 = Date.now();
  const repoDir = path.join(SRC_DIR, repo);
  const cfgPath = path.join(MULTI_DIR, `cfg-${repo}.json`);
  const outPath = path.join(MULTI_DIR, `${repo}-all.json`);
  const logPath = path.join(MULTI_DIR, `log-${repo}.txt`);
  const row = {
    repo, sessions: 0, branches: 0, commits: 0, commitsWithT: 0,
    kept: false, reason: "", secs: 0,
  };
  const log = [];
  try {
    fs.writeFileSync(cfgPath, JSON.stringify({
      canonicalId: repo,
      label: repo,
      aliases: [{ name: repo, pathPrefixes: [`~/src/${repo}`] }],
    }, null, 2));

    const sync = await execFileP("node", [CLI, "agent-stats", "sync"], {
      cwd: repoDir, maxBuffer: 64 * 1024 * 1024,
    });
    log.push("--- sync ---", sync.stdout, sync.stderr);

    const pg = await execFileP("node", [
      CLI, "agent-stats", "project-graph",
      "--config", cfgPath, "--out", outPath,
      "--git-since", GIT_SINCE, "--git-max-count", GIT_MAX_COUNT,
    ], { cwd: repoDir, maxBuffer: 256 * 1024 * 1024 });
    log.push("--- project-graph ---", pg.stdout, pg.stderr);

    const graph = JSON.parse(fs.readFileSync(outPath, "utf8"));
    for (const n of graph.nodes) {
      if (n.node_type === "Session") row.sessions += 1;
      else if (n.node_type === "Branch") row.branches += 1;
      else if (n.node_type === "Commit") {
        row.commits += 1;
        if (Number.isFinite(n.t)) row.commitsWithT += 1;
      }
    }
    row.kept = row.sessions > 0 || row.commits > 0;
    row.reason = row.kept ? "kept" : "skipped (0 sessions, 0 commits)";
  } catch (err) {
    row.reason = `FAILED (${String(err.message || err).split("\n")[0].slice(0, 120)})`;
    log.push("--- error ---", String(err.stack || err));
  }
  row.secs = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(logPath, log.join("\n"));
  results.set(repo, row);
  console.log(`[multi-gitflow] ${repo}: ${row.reason} — S=${row.sessions} B=${row.branches} C=${row.commits} (${row.secs}s)`);
}

const queue = [...repos];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) await processRepo(queue.shift());
}));

const keepers = repos.filter((r) => results.get(r)?.kept);

// ---------- 3. commit-id de-collision across keepers ----------
// commit_<sha7> ids are not repo-prefixed upstream; across ~40 repos 7-hex
// prefixes CAN collide, and merge-graphs would silently fuse those nodes.
const idOwner = new Map(); // commit id -> first repo
const collisions = new Map(); // repo -> Set(ids to rewrite)
for (const repo of keepers) {
  const graph = JSON.parse(fs.readFileSync(path.join(MULTI_DIR, `${repo}-all.json`), "utf8"));
  for (const n of graph.nodes) {
    if (n.node_type !== "Commit") continue;
    if (!idOwner.has(n.id)) idOwner.set(n.id, repo);
    else if (idOwner.get(n.id) !== repo) {
      if (!collisions.has(repo)) collisions.set(repo, new Set());
      collisions.get(repo).add(n.id);
    }
  }
}
let collisionCount = 0;
const mergeInputs = keepers.map((repo) => {
  const inPath = path.join(MULTI_DIR, `${repo}-all.json`);
  const ids = collisions.get(repo);
  if (!ids || ids.size === 0) return inPath;
  collisionCount += ids.size;
  const graph = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const rename = (id) => (ids.has(id) ? `commit_${repo}__${id.slice("commit_".length)}` : id);
  for (const n of graph.nodes) n.id = rename(n.id);
  for (const l of graph.links) { l.source = rename(l.source); l.target = rename(l.target); }
  const dedupPath = path.join(MULTI_DIR, `${repo}-all.dedup.json`);
  fs.writeFileSync(dedupPath, JSON.stringify(graph));
  return dedupPath;
});

// ---------- 4. merge-graphs ----------
const mergedPath = path.join(MULTI_DIR, "merged-all-graph.json");
if (keepers.length === 0) {
  console.error("[multi-gitflow] no keeper repos — aborting before overwrite");
  process.exit(1);
}
const merge = await execFileP("node", [CLI, "merge-graphs", ...mergeInputs, "--out", mergedPath], {
  cwd: MAIN, maxBuffer: 1024 * 1024 * 1024,
});
console.log(merge.stdout.trim());

// ---------- 5. slim to the live-page shape ----------
const merged = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
const slimNodes = [];
const keptIds = new Set();
for (const n of merged.nodes) {
  const type = n.node_type;
  if (type !== "Commit" && type !== "Branch" && type !== "Session") continue;
  const slim = { id: n.id, type, repo: n.project ?? "unknown" };
  if (type === "Branch" && n.label) slim.name = n.label;
  if (type === "Session" && n.host) slim.agent = n.host;
  if (type === "Commit" && Number.isFinite(n.t)) slim.t = n.t; // committer-date epoch-ms (xMode:"time")
  slimNodes.push(slim);
  keptIds.add(n.id);
}
const slimEdges = [];
for (const l of merged.links) {
  if (!LIVE_RELATIONS.has(l.relation)) continue;
  if (!keptIds.has(l.source) || !keptIds.has(l.target)) continue;
  slimEdges.push({ source: l.source, target: l.target, relation: l.relation });
}
fs.writeFileSync(OUT_REAL, JSON.stringify({ nodes: slimNodes, edges: slimEdges }));

// ---------- 6. honest per-repo summary table ----------
const cols = ["repo", "sessions", "branches", "commits", "commits+t", "status", "secs"];
const rows = repos.map((r) => {
  const w = results.get(r);
  return [r, String(w.sessions), String(w.branches), String(w.commits), String(w.commitsWithT), w.reason, String(w.secs)];
});
const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((row) => row[i].length)));
const fmt = (row) => row.map((v, i) => v.padEnd(widths[i])).join("  ");
const totalCommits = [...results.values()].reduce((a, r) => a + r.commits, 0);
const totalWithT = [...results.values()].reduce((a, r) => a + r.commitsWithT, 0);
const lines = [
  fmt(cols), fmt(widths.map((w) => "-".repeat(w))),
  ...rows.map(fmt),
  "",
  `kept ${keepers.length}/${repos.length} repos — real-graph: ${slimNodes.length} nodes, ${slimEdges.length} edges → ${OUT_REAL}`,
  `commit-id collisions rewritten across repos: ${collisionCount}`,
  `undated commits: ${totalCommits - totalWithT}/${totalCommits} (${totalCommits ? (100 * (totalCommits - totalWithT) / totalCommits).toFixed(1) : "0"}%)`,
];
const summary = lines.join("\n");
console.log(`\n${summary}`);
fs.writeFileSync(path.join(MULTI_DIR, "summary.txt"), summary);
