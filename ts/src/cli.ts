/**
 * graphify CLI - `graphify install` sets up the AI coding assistant skill.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const VERSION = getVersion();

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------

interface PlatformConfig {
  skill_file: string;
  skill_dst: string;
  claude_md: boolean;
}

const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  claude: {
    skill_file: "skill.md",
    skill_dst: join(".claude", "skills", "graphify", "SKILL.md"),
    claude_md: true,
  },
  codex: {
    skill_file: "skill-codex.md",
    skill_dst: join(".agents", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  opencode: {
    skill_file: "skill-opencode.md",
    skill_dst: join(".config", "opencode", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  claw: {
    skill_file: "skill-claw.md",
    skill_dst: join(".claw", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  droid: {
    skill_file: "skill-droid.md",
    skill_dst: join(".factory", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  trae: {
    skill_file: "skill-trae.md",
    skill_dst: join(".trae", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  "trae-cn": {
    skill_file: "skill-trae.md",
    skill_dst: join(".trae-cn", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  windows: {
    skill_file: "skill-windows.md",
    skill_dst: join(".claude", "skills", "graphify", "SKILL.md"),
    claude_md: true,
  },
};

const SETTINGS_HOOK = {
  matcher: "Glob|Grep",
  hooks: [
    {
      type: "command",
      command:
        '[ -f graphify-out/graph.json ] && ' +
        "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"graphify: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md for god nodes and community structure before searching raw files.\"}}' " +
        '|| true',
    },
  ],
};

const SKILL_REGISTRATION =
  "\n# graphify\n" +
  "- **graphify** (`~/.claude/skills/graphify/SKILL.md`) " +
  "- any input to knowledge graph. Trigger: `/graphify`\n" +
  "When the user types `/graphify`, invoke the Skill tool " +
  'with `skill: "graphify"` before doing anything else.\n';

const CLAUDE_MD_SECTION = `## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const MD_MARKER = "## graphify";

// ---------------------------------------------------------------------------
// Skill resolution
// ---------------------------------------------------------------------------

function findSkillFile(filename: string): string | null {
  // Check relative to this module (dist/cli.js → ../src/skills/)
  const paths = [
    join(__dirname, "..", "src", "skills", filename),
    join(__dirname, "skills", filename),
    join(__dirname, "..", "skills", filename),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function getInvocationExample(platformName: string): string {
  return platformName === "codex" ? "$graphify ." : "/graphify .";
}

export function getAgentsMdSection(platformName: string): string {
  const lines = [
    "## graphify",
    "",
    "This project has a graphify knowledge graph at graphify-out/.",
    "",
    "Rules:",
    "- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure",
    "- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files",
    "- If the user asks to build, update, query, path, or explain the graph, use the installed `graphify` skill instead of ad-hoc file traversal",
    "- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current",
  ];
  if (platformName === "codex") {
    lines.splice(
      7,
      0,
      "- In Codex, the reliable explicit skill invocation is `$graphify ...`; do not rely on `/graphify ...`",
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Install commands
// ---------------------------------------------------------------------------

function installSkill(platformName: string): void {
  const cfg = PLATFORM_CONFIG[platformName];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${Object.keys(PLATFORM_CONFIG).join(", ")}`);
    process.exit(1);
  }

  const skillSrc = findSkillFile(cfg.skill_file);
  if (!skillSrc) {
    console.error(`error: ${cfg.skill_file} not found in package - reinstall graphify`);
    process.exit(1);
  }

  const skillDst = join(homedir(), cfg.skill_dst);
  mkdirSync(dirname(skillDst), { recursive: true });
  copyFileSync(skillSrc, skillDst);
  writeFileSync(join(dirname(skillDst), ".graphify_version"), VERSION, "utf-8");
  console.log(`  skill installed  ->  ${skillDst}`);

  if (cfg.claude_md) {
    const claudeMd = join(homedir(), ".claude", "CLAUDE.md");
    if (existsSync(claudeMd)) {
      const content = readFileSync(claudeMd, "utf-8");
      if (content.includes("graphify")) {
        console.log(`  CLAUDE.md        ->  already registered (no change)`);
      } else {
        writeFileSync(claudeMd, content.trimEnd() + SKILL_REGISTRATION, "utf-8");
        console.log(`  CLAUDE.md        ->  skill registered in ${claudeMd}`);
      }
    } else {
      mkdirSync(dirname(claudeMd), { recursive: true });
      writeFileSync(claudeMd, SKILL_REGISTRATION.trimStart(), "utf-8");
      console.log(`  CLAUDE.md        ->  created at ${claudeMd}`);
    }
  }

  console.log();
  console.log("Done. Open your AI coding assistant and type:");
  console.log();
  console.log(`  ${getInvocationExample(platformName)}`);
  if (platformName === "codex") {
    console.log();
    console.log("Codex explicit skill calls use `$graphify`, not `/graphify`.");
  }
  console.log();
}

function installClaudeHook(projectDir: string): void {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  mkdirSync(dirname(settingsPath), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch { /* ignore */ }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preTool = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;

  if (preTool.some((h) => h.matcher === "Glob|Grep" && JSON.stringify(h).includes("graphify"))) {
    console.log(`  .claude/settings.json  ->  hook already registered (no change)`);
    return;
  }

  preTool.push(SETTINGS_HOOK);
  hooks.PreToolUse = preTool;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log(`  .claude/settings.json  ->  PreToolUse hook registered`);
}

function uninstallClaudeHook(projectDir: string): void {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return;
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch { return; }
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preTool = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;
  const filtered = preTool.filter(
    (h) => !(h.matcher === "Glob|Grep" && JSON.stringify(h).includes("graphify")),
  );
  if (filtered.length === preTool.length) return;
  (hooks as Record<string, unknown>).PreToolUse = filtered;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log(`  .claude/settings.json  ->  PreToolUse hook removed`);
}

function claudeInstall(projectDir: string = "."): void {
  const target = join(projectDir, "CLAUDE.md");
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    if (content.includes(MD_MARKER)) {
      console.log("graphify already configured in CLAUDE.md");
      return;
    }
    writeFileSync(target, content.trimEnd() + "\n\n" + CLAUDE_MD_SECTION, "utf-8");
  } else {
    writeFileSync(target, CLAUDE_MD_SECTION, "utf-8");
  }
  console.log(`graphify section written to ${resolve(target)}`);
  installClaudeHook(projectDir);
  console.log();
  console.log("Claude Code will now check the knowledge graph before answering");
  console.log("codebase questions and rebuild it after code changes.");
}

function claudeUninstall(projectDir: string = "."): void {
  const target = join(projectDir, "CLAUDE.md");
  if (!existsSync(target)) {
    console.log("No CLAUDE.md found in current directory - nothing to do");
    return;
  }
  const content = readFileSync(target, "utf-8");
  if (!content.includes(MD_MARKER)) {
    console.log("graphify section not found in CLAUDE.md - nothing to do");
    return;
  }
  const cleaned = content.replace(/\n*## graphify\n[\s\S]*?(?=\n## |\s*$)/, "").trim();
  if (cleaned) {
    writeFileSync(target, cleaned + "\n", "utf-8");
    console.log(`graphify section removed from ${resolve(target)}`);
  } else {
    const { unlinkSync } = require("node:fs");
    unlinkSync(target);
    console.log(`CLAUDE.md was empty after removal - deleted ${resolve(target)}`);
  }
  uninstallClaudeHook(projectDir);
}

function installCodexHook(projectDir: string): void {
  const hooksPath = join(projectDir, ".codex", "hooks.json");
  mkdirSync(dirname(hooksPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(hooksPath)) {
    try { existing = JSON.parse(readFileSync(hooksPath, "utf-8")); } catch { /* ignore */ }
  }

  const hooks = (existing.hooks ?? {}) as Record<string, unknown>;
  const preTool = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;

  if (preTool.some((h) => JSON.stringify(h).includes("graphify"))) {
    console.log(`  .codex/hooks.json  ->  hook already registered (no change)`);
    return;
  }

  preTool.push({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command:
          '[ -f graphify-out/graph.json ] && ' +
          "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"graphify: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md for god nodes and community structure before searching raw files.\"}}' " +
          '|| true',
      },
    ],
  });
  hooks.PreToolUse = preTool;
  existing.hooks = hooks;
  writeFileSync(hooksPath, JSON.stringify(existing, null, 2), "utf-8");
  console.log(`  .codex/hooks.json  ->  PreToolUse hook registered`);
}

function uninstallCodexHook(projectDir: string): void {
  const hooksPath = join(projectDir, ".codex", "hooks.json");
  if (!existsSync(hooksPath)) return;
  let existing: Record<string, unknown>;
  try { existing = JSON.parse(readFileSync(hooksPath, "utf-8")); } catch { return; }
  const hooks = (existing.hooks ?? {}) as Record<string, unknown>;
  const preTool = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;
  const filtered = preTool.filter((h) => !JSON.stringify(h).includes("graphify"));
  (hooks as Record<string, unknown>).PreToolUse = filtered;
  existing.hooks = hooks;
  writeFileSync(hooksPath, JSON.stringify(existing, null, 2), "utf-8");
  console.log(`  .codex/hooks.json  ->  PreToolUse hook removed`);
}

function agentsInstall(projectDir: string, platformName: string): void {
  const target = join(projectDir, "AGENTS.md");
  const section = getAgentsMdSection(platformName);
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    if (content.includes(MD_MARKER)) {
      console.log(`graphify already configured in AGENTS.md`);
      return;
    }
    writeFileSync(target, content.trimEnd() + "\n\n" + section, "utf-8");
  } else {
    writeFileSync(target, section, "utf-8");
  }
  console.log(`graphify section written to ${resolve(target)}`);

  if (platformName === "codex") {
    installCodexHook(projectDir);
  }

  console.log();
  console.log(`${platformName.charAt(0).toUpperCase() + platformName.slice(1)} will now check the knowledge graph before answering`);
  console.log("codebase questions and rebuild it after code changes.");
  if (platformName !== "codex") {
    console.log();
    console.log("Note: unlike Claude Code, there is no PreToolUse hook equivalent for");
    console.log(`${platformName.charAt(0).toUpperCase() + platformName.slice(1)} — the AGENTS.md rules are the always-on mechanism.`);
  }
}

function agentsUninstall(projectDir: string, platformName: string): void {
  const target = join(projectDir, "AGENTS.md");
  if (!existsSync(target)) {
    console.log("No AGENTS.md found in current directory - nothing to do");
    return;
  }
  const content = readFileSync(target, "utf-8");
  if (!content.includes(MD_MARKER)) {
    console.log("graphify section not found in AGENTS.md - nothing to do");
    return;
  }
  const cleaned = content.replace(/\n*## graphify\n[\s\S]*?(?=\n## |\s*$)/, "").trim();
  if (cleaned) {
    writeFileSync(target, cleaned + "\n", "utf-8");
    console.log(`graphify section removed from ${resolve(target)}`);
  } else {
    const { unlinkSync } = require("node:fs");
    unlinkSync(target);
    console.log(`AGENTS.md was empty after removal - deleted ${resolve(target)}`);
  }
  if (platformName === "codex") {
    uninstallCodexHook(projectDir);
  }
}

// ---------------------------------------------------------------------------
// Check skill versions
// ---------------------------------------------------------------------------

function checkSkillVersion(skillDst: string): void {
  const versionFile = join(dirname(skillDst), ".graphify_version");
  if (!existsSync(versionFile)) return;
  const installed = readFileSync(versionFile, "utf-8").trim();
  if (installed !== VERSION) {
    console.log(
      `  warning: skill is from graphify ${installed}, package is ${VERSION}. Run 'graphify install' to update.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main CLI
// ---------------------------------------------------------------------------

export function main(): void {
  // Check installed skill versions
  for (const cfg of Object.values(PLATFORM_CONFIG)) {
    checkSkillVersion(join(homedir(), cfg.skill_dst));
  }

  const program = new Command();
  program
    .name("graphify")
    .description("AI coding assistant skill - turn any folder into a queryable knowledge graph")
    .version(VERSION);

  program
    .command("install")
    .description("Copy skill to platform config dir")
    .option("--platform <platform>", "Target platform", platform() === "win32" ? "windows" : "claude")
    .action((opts) => {
      installSkill(opts.platform);
    });

  // Platform-specific install/uninstall commands
  for (const cmd of ["claude"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install").description(`Write graphify section to CLAUDE.md + PreToolUse hook`).action(() => claudeInstall());
    sub.command("uninstall").description(`Remove graphify section from CLAUDE.md + PreToolUse hook`).action(() => claudeUninstall());
  }

  for (const cmd of ["codex", "opencode", "claw", "droid", "trae", "trae-cn"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install").description(
      cmd === "codex"
        ? "Write graphify section to AGENTS.md + PreToolUse hook"
        : "Write graphify section to AGENTS.md",
    ).action(() => agentsInstall(".", cmd));
    sub.command("uninstall").description(
      cmd === "codex"
        ? "Remove graphify section from AGENTS.md + PreToolUse hook"
        : "Remove graphify section from AGENTS.md",
    ).action(() => {
      agentsUninstall(".", cmd);
    });
  }

  // Hook management
  const hook = program.command("hook").description("Git hook management");
  hook.command("install").description("Install post-commit/post-checkout git hooks").action(async () => {
    const { install } = await import("./hooks.js");
    console.log(install("."));
  });
  hook.command("uninstall").description("Remove git hooks").action(async () => {
    const { uninstall } = await import("./hooks.js");
    console.log(uninstall("."));
  });
  hook.command("status").description("Check if git hooks are installed").action(async () => {
    const { status } = await import("./hooks.js");
    console.log(status("."));
  });

  // MCP server
  program
    .command("serve [graph]")
    .description("Start a stdio MCP server for graph.json")
    .action(async (graphPath) => {
      const { serve } = await import("./serve.js");
      await serve(graphPath ?? "graphify-out/graph.json");
    });

  // Watcher
  program
    .command("watch [path]")
    .description("Watch a folder and auto-rebuild graph outputs on code changes")
    .option("--debounce <seconds>", "Wait time before rebuild", "3")
    .action(async (watchPath, opts) => {
      const { watch } = await import("./watch.js");
      const debounce = Number.parseFloat(opts.debounce);
      await watch(watchPath ?? ".", Number.isFinite(debounce) ? debounce : 3);
    });

  // Query command
  program
    .command("query <question>")
    .description("BFS traversal of graph.json for a question")
    .option("--dfs", "Use depth-first instead of breadth-first")
    .option("--budget <n>", "Cap output at N tokens", "2000")
    .option("--graph <path>", "Path to graph.json", "graphify-out/graph.json")
    .action(async (question, opts) => {
      const { readFileSync: rf } = await import("node:fs");
      const { resolve: res } = await import("node:path");
      const gp = res(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      if (!gp.endsWith(".json")) {
        console.error(`error: graph file must be a .json file`);
        process.exit(1);
      }

      try {
        const Graph = (await import("graphology")).default;
        const raw = JSON.parse(rf(gp, "utf-8"));
        const G = new Graph({ type: "undirected" });

        for (const node of raw.nodes ?? []) {
          const { id, ...attrs } = node;
          G.mergeNode(id, attrs);
        }
        for (const link of raw.links ?? []) {
          const { source, target, ...attrs } = link;
          if (G.hasNode(source) && G.hasNode(target)) {
            try { G.mergeEdge(source, target, attrs); } catch { /* ignore */ }
          }
        }

        const terms = question.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
        const scored: [number, string][] = [];
        G.forEachNode((nid: string, data: Record<string, unknown>) => {
          const label = ((data.label as string) ?? "").toLowerCase();
          const score = terms.filter((t: string) => label.includes(t)).length;
          if (score > 0) scored.push([score, nid]);
        });
        scored.sort((a, b) => b[0] - a[0]);

        if (scored.length === 0) {
          console.log("No matching nodes found.");
          process.exit(0);
        }

        const startNodes = scored.slice(0, 5).map(([, nid]) => nid);
        const budget = parseInt(opts.budget, 10) || 2000;
        const useDfs = opts.dfs ?? false;

        // BFS/DFS traversal
        const visited = new Set(startNodes);
        const edgesSeen: [string, string][] = [];

        if (useDfs) {
          const stack = startNodes.map((n) => [n, 0] as [string, number]).reverse();
          while (stack.length > 0) {
            const [node, d] = stack.pop()!;
            if (d > 2) continue;
            if (d > 0 && visited.has(node)) continue;
            visited.add(node);
            G.forEachNeighbor(node, (neighbor: string) => {
              if (!visited.has(neighbor)) {
                stack.push([neighbor, d + 1]);
                edgesSeen.push([node, neighbor]);
              }
            });
          }
        } else {
          let frontier = new Set(startNodes);
          for (let depth = 0; depth < 2; depth++) {
            const nextFrontier = new Set<string>();
            for (const n of frontier) {
              G.forEachNeighbor(n, (neighbor: string) => {
                if (!visited.has(neighbor)) {
                  nextFrontier.add(neighbor);
                  edgesSeen.push([n, neighbor]);
                }
              });
            }
            for (const n of nextFrontier) visited.add(n);
            frontier = nextFrontier;
          }
        }

        // Render output
        const { sanitizeLabel } = await import("./security.js");
        const charBudget = budget * 3;
        const lines: string[] = [];
        const sortedNodes = [...visited].sort((a, b) => G.degree(b) - G.degree(a));
        for (const nid of sortedNodes) {
          const d = G.getNodeAttributes(nid);
          lines.push(
            `NODE ${sanitizeLabel((d.label as string) ?? nid)} [src=${d.source_file ?? ""} loc=${d.source_location ?? ""} community=${d.community ?? ""}]`,
          );
        }
        for (const [u, v] of edgesSeen) {
          if (visited.has(u) && visited.has(v)) {
            const edge = G.edge(u, v);
            if (edge) {
              const d = G.getEdgeAttributes(edge);
              lines.push(
                `EDGE ${sanitizeLabel((G.getNodeAttribute(u, "label") as string) ?? u)} --${d.relation ?? ""} [${d.confidence ?? ""}]--> ${sanitizeLabel((G.getNodeAttribute(v, "label") as string) ?? v)}`,
              );
            }
          }
        }
        let output = lines.join("\n");
        if (output.length > charBudget) {
          output = output.slice(0, charBudget) + `\n... (truncated to ~${budget} token budget)`;
        }
        console.log(output);
      } catch (e) {
        console.error(`error: could not load graph: ${e}`);
        process.exit(1);
      }
    });

  // Benchmark command
  program
    .command("benchmark [graph]")
    .description("Measure token reduction vs naive full-corpus approach")
    .action(async (graphPath) => {
      const { runBenchmark, printBenchmark } = await import("./benchmark.js");
      const gp = graphPath ?? "graphify-out/graph.json";
      let corpusWords: number | undefined;
      if (existsSync(".graphify_detect.json")) {
        try {
          const data = JSON.parse(readFileSync(".graphify_detect.json", "utf-8"));
          corpusWords = data.total_words;
        } catch { /* ignore */ }
      }
      const result = runBenchmark(gp, corpusWords);
      printBenchmark(result);
    });

  // Hook-rebuild (internal command used by git hooks)
  program
    .command("hook-rebuild", { hidden: true })
    .description("Internal: rebuild graph from code files (called by git hooks)")
    .action(async () => {
      const { rebuildCode } = await import("./watch.js");
      await rebuildCode(".");
    });

  program.parse();
}

function isDirectCliExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === __filename;
  } catch {
    return resolve(process.argv[1]) === __filename;
  }
}

if (isDirectCliExecution()) {
  main();
}
