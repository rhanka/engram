import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "commander";

import { safeGitRevParse } from "../../../src/git.js";
import { buildStaticStudio } from "../../../src/studio-export.js";
import {
  buildProjectGraphForIdentity,
  buildReport,
  buildSessionsReport,
  computeAgentStats,
  filterReportAgents,
  formatReportMarkdown,
  formatReportText,
  formatSessionsTable,
  formatStatsTable,
  listSessions,
  syncAgentStats,
  wpAgentStats,
  formatWpView,
} from "./index.js";

/** Resolve the main checkout shared by worktrees, which owns h2a registry data. */
export function resolveAgentStatsRepoRoot(cwd = "."): string {
  const commonDir = safeGitRevParse(cwd, ["--git-common-dir"]);
  if (commonDir) {
    const absolute = resolve(cwd, commonDir);
    const root = absolute.replace(/\/\.git\/?$/, "");
    if (root && root !== absolute) return root;
  }
  return safeGitRevParse(cwd, ["--show-toplevel"]) ?? resolve(cwd);
}

/** Register the extracted activity CLI with an h2a-owned Commander program. */
export function registerAgentStatsCommands(program: Command): void {
  const agentStats = program
    .command("agent-stats")
    .description("Per-agent stats from agentic CLI transcripts (evidence-based attribution, not git authorship)");

  agentStats
    .option("--json", "Emit JSON (alias for --format json)")
    .option("--format <fmt>", "Output format: text | json | md", "text")
    .action((opts) => {
      const result = computeAgentStats(resolveAgentStatsRepoRoot());
      const format = opts.json ? "json" : opts.format;
      if (format === "json") {
        console.log(JSON.stringify(buildReport(result), null, 2));
        return;
      }
      if (format === "md") {
        console.log(formatReportMarkdown(buildReport(result)));
        return;
      }
      console.log(formatStatsTable(result.rows, result.residual, result.conflicts));
    });

  agentStats
    .command("report")
    .description("Per-agent detail: branches, commits, features, token cost, confidence, anonymized citations")
    .option("--agent <id>", "Filter by agent id substring")
    .option("--format <fmt>", "Output format: text | json | md", "text")
    .action((opts) => {
      const report = filterReportAgents(buildReport(computeAgentStats(resolveAgentStatsRepoRoot())), opts.agent);
      if (opts.format === "json") {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      if (opts.format === "md") {
        console.log(formatReportMarkdown(report));
        return;
      }
      console.log(formatReportText(report));
    });

  agentStats
    .command("sync")
    .description("Parse/refresh transcripts into .graphify/agents/facts.jsonl (incremental)")
    .option("--full", "Force a full re-parse, ignoring cursors")
    .action((opts) => {
      const result = syncAgentStats({ repoRoot: resolveAgentStatsRepoRoot(), full: Boolean(opts.full) });
      console.log(
        `agent-stats sync: scanned ${result.scanned} transcripts, parsed ${result.parsed}, ` +
          `skipped ${result.skipped} (header pre-filter), ${result.inRepo} in-repo; ` +
          `${result.factsTotal} facts total.`,
      );
    });

  agentStats
    .command("sessions")
    .description("List parsed sessions with their evidence-based agent identity")
    .option("--agent <id>", "Filter by agent id substring")
    .option("--branch <branch>", "Filter by observed/ground-truth branch")
    .option("--since <iso>", "Only sessions on/after this ISO date")
    .option("--json", "Emit JSON (alias for --format json)")
    .option("--format <fmt>", "Output format: text | json", "text")
    .action((opts) => {
      const { facts, instances } = listSessions(resolveAgentStatsRepoRoot(), {
        agent: opts.agent,
        branch: opts.branch,
        since: opts.since,
      });
      if (opts.json || opts.format === "json") {
        console.log(JSON.stringify(buildSessionsReport(facts, instances), null, 2));
        return;
      }
      console.log(formatSessionsTable(facts, instances));
    });

  agentStats
    .command("wp <trackItemId>")
    .description("Conductor view: agents/sessions joined to a Track work-package (by id or WP label)")
    .option("--no-pr", "Skip the live `gh` PR-merge attribution step (offline)")
    .option("--json", "Emit JSON instead of a text view")
    .action((trackItemId, opts) => {
      const result = wpAgentStats(resolveAgentStatsRepoRoot(), trackItemId, { skipPrMerges: opts.pr === false });
      if (opts.json) {
        console.log(JSON.stringify({
          item: result.item,
          links: result.links,
          sessions: result.sessions.map((session) => ({ factId: session.fact.factId, agentId: session.agentId, rule: session.rule })),
          evidenced: result.evidenced.map((session) => ({ factId: session.fact.factId, agentId: session.agentId, via: session.via })),
          mismatch: result.mismatch,
          rollup: result.rollup,
        }, null, 2));
        return;
      }
      console.log(formatWpView(result, trackItemId));
    });

  agentStats
    .command("project-graph")
    .description("Build a rename-aware project conversation graph from extracted h2a activity evidence")
    .option("--config <file>", "JSON ProjectIdentity { canonicalId, label, aliases:[{name,pathPrefixes,remote?}] }")
    .option("--out <path>", "Output graph.json path", ".graphify/project-graph/graph.json")
    .option("--no-commits", "Omit commit nodes")
    .option("--no-branches", "Omit branch nodes")
    .option("--git-since <date>", "Hybrid git skeleton window (git --since); use 'all' for full history", "6 months ago")
    .option("--git-max-count <n>", "Hybrid git skeleton max commits", "2000")
    .option("--hub-edges", "Also emit legacy worked-in/conducted-by/belongs-to hub edges")
    .option("--studio", "Also export a static studio next to the graph.json")
    .action(async (opts) => {
      const repoRoot = resolveAgentStatsRepoRoot();
      const defaultIdentity = {
        canonicalId: "sentropic",
        label: "Sentropic / Graphify",
        aliases: [
          { name: "sentropic", pathPrefixes: ["~/src/sentropic"], remote: "rhanka/sentropic" },
          { name: "graphify", pathPrefixes: ["~/src/graphify"], remote: "rhanka/graphify" },
          { name: "regraphify", pathPrefixes: ["/tmp/regraphify", "/tmp/regraphify-brigham"] },
        ],
        repoRootForRegistry: repoRoot,
      };
      const identity = opts.config
        ? { repoRootForRegistry: repoRoot, ...JSON.parse(readFileSync(opts.config, "utf-8")) }
        : defaultIdentity;
      const { graph, sessions } = buildProjectGraphForIdentity(identity, {
        includeCommits: opts.commits !== false,
        includeBranches: opts.branches !== false,
        gitSince: opts.gitSince,
        gitMaxCount: Number.parseInt(opts.gitMaxCount, 10),
        includeHubEdges: opts.hubEdges === true,
      });
      const outPath = resolve(opts.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(graph, null, 2));
      console.error(
        `project-graph: ${graph.nodes.length} nodes, ${graph.links.length} edges from ${sessions} session(s) ` +
          `across ${identity.aliases.length} rename-alias(es) → ${outPath}`,
      );
      if (opts.studio) {
        const stateDir = dirname(outPath);
        const studioOut = resolve(stateDir, "studio");
        await buildStaticStudio({ stateDir, outDir: studioOut });
        console.error(`project-graph: static studio exported to ${studioOut}`);
      }
    });
}
