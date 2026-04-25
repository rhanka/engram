/**
 * graphify CLI - `graphify install` sets up the AI coding assistant skill.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { join, resolve, dirname, extname, basename } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type Graph from "graphology";
import type {
  GraphifyInputScopeMode,
  InputScopeSource,
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
} from "./types.js";
import type { ProfileState } from "./configured-dataprep.js";
import {
  inspectInputScope,
  resolveCliInputScopeSelection,
  resolveConfiguredInputScopeSelection,
} from "./input-scope.js";
import { forEachTraversalNeighbor, loadGraphFromData } from "./graph.js";
import { safeExecGit } from "./git.js";
import { discoverProjectConfig, loadProjectConfig } from "./project-config.js";
import { defaultManifestPath, resolveGraphInputPath, resolveGraphifyPaths } from "./paths.js";
import { normalizeSearchText } from "./search.js";
import { makeGraphPortable, projectRootLabel, scanPortableGraphifyArtifacts } from "./portable-artifacts.js";

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

function splitFiles(value?: string): string[] {
  return (value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function changedFilesFromGit(options: { base?: string; head?: string; staged?: boolean }): string[] {
  if (options.staged) {
    return splitFiles(safeExecGit(".", ["diff", "--name-only", "--cached", "--"]) ?? "");
  }
  if (options.base) {
    return splitFiles(safeExecGit(".", ["diff", "--name-only", `${options.base}...${options.head ?? "HEAD"}`, "--"]) ?? "");
  }
  const tracked = splitFiles(safeExecGit(".", ["diff", "--name-only", "HEAD", "--"]) ?? "");
  const untracked = splitFiles(safeExecGit(".", ["ls-files", "--others", "--exclude-standard"]) ?? "");
  return [...new Set([...tracked, ...untracked])].sort();
}

function loadCliGraph(graphPath: string): Graph {
  const gp = resolveGraphInputPath(graphPath);
  if (!existsSync(gp)) {
    throw new Error(`graph file not found: ${gp}`);
  }
  return loadGraphFromData(JSON.parse(readFileSync(gp, "utf-8")));
}

function resolvePortableCheckDir(inputPath: string = ".graphify"): string {
  const resolved = resolve(inputPath);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    if (basename(resolved) === ".graphify") return resolved;
    const nested = join(resolved, ".graphify");
    if (existsSync(nested) && statSync(nested).isDirectory()) return nested;
    return resolved;
  }
  if (existsSync(resolved) && statSync(resolved).isFile()) return dirname(resolved);
  return resolved;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as T;
}

function writeJson(path: string, value: unknown): void {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(value, null, 2), "utf-8");
}

function scopeOptionDescription(): string {
  return "Input scope: auto, committed, tracked, all";
}

function resolveCliScopeSelection(
  opts: { scope?: string; all?: boolean },
  fallback: GraphifyInputScopeMode = "auto",
): { mode: GraphifyInputScopeMode; source: InputScopeSource } {
  return resolveCliInputScopeSelection(opts, fallback);
}

function printScopeInspection(
  inventory: ReturnType<typeof inspectInputScope>,
  options: { json?: boolean } = {},
): void {
  if (options.json) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }
  const scope = inventory.scope;
  console.log([
    `Input scope for ${scope.root}`,
    `- requested: ${scope.requested_mode}`,
    `- resolved: ${scope.resolved_mode} (${scope.source})`,
    `- included: ${scope.included_count ?? "n/a"} / candidates: ${scope.candidate_count ?? "recursive"}`,
    `- excluded: ${scope.excluded_untracked_count} untracked, ${scope.excluded_ignored_count} ignored, ${scope.excluded_sensitive_count} sensitive, ${scope.missing_committed_count} missing committed`,
    ...scope.warnings.map((warning) => `- warning: ${warning}`),
    ...(scope.recommendation ? [`- recommendation: ${scope.recommendation}`] : []),
  ].join("\n"));
}

function loadCliProfileContext(profileStatePath: string): {
  profileState: ProfileState;
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
} {
  const profileDir = dirname(resolve(profileStatePath));
  const projectConfigPath = join(profileDir, "project-config.normalized.json");
  return {
    profileState: readJson<ProfileState>(profileStatePath),
    profile: readJson<NormalizedOntologyProfile>(join(profileDir, "ontology-profile.normalized.json")),
    ...(existsSync(projectConfigPath) ? { projectConfig: readJson<NormalizedProjectConfig>(projectConfigPath) } : {}),
  };
}

function findBestMatchingNode(G: Graph, query: string): string | null {
  const terms = normalizeSearchText(query)
    .split(/\s+/)
    .filter((term) => term.length > 1);
  let bestScore = 0;
  let bestNodeId: string | null = null;
  G.forEachNode((nodeId, data) => {
    const label = normalizeSearchText((data.label as string) ?? nodeId);
    const source = normalizeSearchText((data.source_file as string) ?? "");
    const score = terms.filter((term) => label.includes(term) || source.includes(term)).length;
    if (score > 0 && (!bestNodeId || score > bestScore || (score === bestScore && G.degree(nodeId) > G.degree(bestNodeId)))) {
      bestScore = score;
      bestNodeId = nodeId;
    }
  });
  return bestNodeId;
}

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
  gemini: {
    skill_file: "skill-gemini.toml",
    skill_dst: join(".gemini", "commands", "graphify.toml"),
    claude_md: false,
  },
  opencode: {
    skill_file: "skill-opencode.md",
    skill_dst: join(".config", "opencode", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  aider: {
    skill_file: "skill.md",
    skill_dst: join(".aider", "graphify", "SKILL.md"),
    claude_md: false,
  },
  copilot: {
    skill_file: "skill.md",
    skill_dst: join(".copilot", "skills", "graphify", "SKILL.md"),
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
  hermes: {
    skill_file: "skill-claw.md",
    skill_dst: join(".hermes", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  kiro: {
    skill_file: "skill-kiro.md",
    skill_dst: join(".kiro", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  antigravity: {
    skill_file: "skill.md",
    skill_dst: join(".agent", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  "vscode-copilot-chat": {
    skill_file: "skill-vscode.md",
    skill_dst: join(".copilot", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  windows: {
    skill_file: "skill-windows.md",
    skill_dst: join(".claude", "skills", "graphify", "SKILL.md"),
    claude_md: true,
  },
};

const PLATFORM_ALIASES: Record<string, string> = {
  vscode: "vscode-copilot-chat",
};

function canonicalPlatformName(platformName: string): string {
  return PLATFORM_ALIASES[platformName] ?? platformName;
}

function platformNamesForError(): string {
  return [...Object.keys(PLATFORM_CONFIG), ...Object.keys(PLATFORM_ALIASES)].join(", ");
}

const SETTINGS_HOOK = {
  matcher: "Glob|Grep",
  hooks: [
    {
      type: "command",
      command:
        '[ -f .graphify/graph.json ] && ' +
        "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"graphify: Knowledge graph exists. Read .graphify/GRAPH_REPORT.md for god nodes and community structure before searching raw files.\"}}' " +
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

This project has a graphify knowledge graph at .graphify/.

Rules:
- Before answering architecture or codebase questions, read .graphify/GRAPH_REPORT.md for god nodes and community structure
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` first; if tracked legacy artifacts are reported, ask before using the recommended \`git mv -f graphify-out .graphify\` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- Before proposing or committing .graphify artifacts, run \`graphify portable-check .graphify\`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, or .graphify/needs_update
- Before deep graph traversal, prefer \`graphify summary --graph .graphify/graph.json\` for compact first-hop orientation
- For review impact on changed files, use \`graphify review-delta --graph .graphify/graph.json\` instead of generic traversal
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const GEMINI_MD_SECTION = `## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- Before answering architecture or codebase questions, read .graphify/GRAPH_REPORT.md for god nodes and community structure
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` first; if tracked legacy artifacts are reported, ask before using the recommended \`git mv -f graphify-out .graphify\` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- In Gemini CLI, the reliable explicit custom command is \`/graphify ...\`
- If the user asks to build, update, query, path, or explain the graph, use the installed \`/graphify\` custom command or the configured \`graphify\` MCP server instead of ad-hoc file traversal
- Before proposing or committing .graphify artifacts, run \`graphify portable-check .graphify\`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, or .graphify/needs_update
- Before deep graph traversal, prefer \`graphify summary --graph .graphify/graph.json\` or MCP \`first_hop_summary\` for compact first-hop orientation
- For review impact on changed files, use \`graphify review-delta --graph .graphify/graph.json\` or MCP \`review_delta\` instead of generic traversal
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const GEMINI_MCP_SERVER = {
  command: "graphify",
  args: ["serve", ".graphify/graph.json"],
  trust: false,
  description: "graphify knowledge graph MCP server",
};

const OPENCODE_PLUGIN_ENTRY = ".opencode/plugins/graphify.js";
const OPENCODE_CONFIG_ENTRY = ".opencode/opencode.json";
const OPENCODE_PLUGIN_JS = `// graphify OpenCode plugin
// Injects a knowledge graph reminder before bash tool calls when the graph exists.
import { existsSync } from "fs";
import { join } from "path";

export const GraphifyPlugin = async ({ directory }) => {
  let reminded = false;

  return {
    "tool.execute.before": async (input, output) => {
      if (reminded) return;
      if (!existsSync(join(directory, ".graphify", "graph.json"))) return;

      if (input.tool === "bash") {
        output.args.command =
          'echo "[graphify] Knowledge graph available. Read .graphify/GRAPH_REPORT.md for god nodes and architecture context before searching files." && ' +
          output.args.command;
        reminded = true;
      }
    },
  };
};
`;

export interface InstallMutationPreview {
  platform: string;
  action: "install" | "uninstall";
  writes: string[];
  hooks: string[];
  removes: string[];
  notes: string[];
}

function opencodeConfigPath(projectDir: string): string {
  return join(projectDir, ".opencode", "opencode.json");
}

function legacyOpencodeConfigPath(projectDir: string): string {
  return join(projectDir, "opencode.json");
}

function loadOpenCodeConfig(projectDir: string): {
  config: Record<string, unknown>;
  sourcePath: string | null;
} {
  const primaryPath = opencodeConfigPath(projectDir);
  const legacyPath = legacyOpencodeConfigPath(projectDir);
  for (const candidate of [primaryPath, legacyPath]) {
    if (!existsSync(candidate)) continue;
    try {
      return {
        config: JSON.parse(readFileSync(candidate, "utf-8")) as Record<string, unknown>,
        sourcePath: candidate,
      };
    } catch {
      return { config: {}, sourcePath: candidate };
    }
  }
  return { config: {}, sourcePath: null };
}

function previewPath(base: string, relativePath: string): string {
  return resolve(join(base, relativePath));
}

function emptyPreview(platformName: string, action: "install" | "uninstall"): InstallMutationPreview {
  return { platform: platformName, action, writes: [], hooks: [], removes: [], notes: [] };
}

export function platformInstallPreview(projectDir: string = ".", platformName: string): InstallMutationPreview {
  platformName = canonicalPlatformName(platformName);
  const preview = emptyPreview(platformName, "install");
  if (platformName === "claude" || platformName === "windows") {
    preview.writes.push(previewPath(projectDir, "CLAUDE.md"), previewPath(projectDir, ".claude/settings.json"));
    preview.hooks.push(".claude/settings.json: PreToolUse Glob|Grep graphify reminder");
    return preview;
  }
  if (platformName === "gemini") {
    preview.writes.push(previewPath(projectDir, "GEMINI.md"), previewPath(projectDir, ".gemini/settings.json"));
    preview.hooks.push(".gemini/settings.json: mcpServers.graphify stdio server");
    return preview;
  }
  if (platformName === "cursor") {
    preview.writes.push(previewPath(projectDir, ".cursor/rules/graphify.mdc"));
    return preview;
  }
  if (platformName === "antigravity") {
    preview.writes.push(
      previewPath(projectDir, ".agent/rules/graphify.md"),
      previewPath(projectDir, ".agent/workflows/graphify.md"),
    );
    preview.notes.push("No platform hook equivalent; Antigravity rules are the always-on mechanism.");
    return preview;
  }
  if (platformName === "kiro") {
    preview.writes.push(
      previewPath(projectDir, ".kiro/skills/graphify/SKILL.md"),
      previewPath(projectDir, ".kiro/skills/graphify/.graphify_version"),
      previewPath(projectDir, ".kiro/steering/graphify.md"),
    );
    preview.notes.push("Kiro steering is always-on; /graphify invokes the project skill.");
    return preview;
  }
  if (platformName === "vscode-copilot-chat") {
    preview.writes.push(previewPath(projectDir, ".github/copilot-instructions.md"));
    preview.notes.push("VS Code Copilot Chat reads copilot-instructions.md automatically.");
    return preview;
  }

  preview.writes.push(previewPath(projectDir, "AGENTS.md"));
  if (platformName === "codex") {
    preview.writes.push(previewPath(projectDir, ".codex/hooks.json"));
    preview.hooks.push(".codex/hooks.json: PreToolUse Bash graphify reminder");
  } else if (platformName === "opencode") {
    preview.writes.push(previewPath(projectDir, OPENCODE_PLUGIN_ENTRY), previewPath(projectDir, OPENCODE_CONFIG_ENTRY));
    preview.hooks.push(".opencode/opencode.json: tool.execute.before graphify plugin");
  } else {
    preview.notes.push("No platform hook equivalent; AGENTS.md is the always-on mechanism.");
  }
  return preview;
}

export function globalSkillInstallPreview(platformName: string): InstallMutationPreview {
  platformName = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[platformName];
  const preview = emptyPreview(platformName, "install");
  if (!cfg) return preview;
  const skillDst = join(homedir(), cfg.skill_dst);
  preview.writes.push(skillDst, join(dirname(skillDst), ".graphify_version"));
  if (cfg.claude_md) {
    preview.writes.push(join(homedir(), ".claude", "CLAUDE.md"));
  }
  return preview;
}

function printMutationPreview(preview: InstallMutationPreview): void {
  console.log("Preview: graphify " + preview.platform + " " + preview.action + " will touch:");
  if (preview.writes.length > 0) {
    console.log("  writes:");
    for (const item of preview.writes) console.log("  - " + item);
  }
  if (preview.hooks.length > 0) {
    console.log("  hooks/config:");
    for (const item of preview.hooks) console.log("  - " + item);
  }
  if (preview.removes.length > 0) {
    console.log("  removes:");
    for (const item of preview.removes) console.log("  - " + item);
  }
  if (preview.notes.length > 0) {
    console.log("  notes:");
    for (const item of preview.notes) console.log("  - " + item);
  }
}

const MD_MARKER = "## graphify";
const CURSOR_RULE_ENTRY = ".cursor/rules/graphify.mdc";
const CURSOR_RULE = `---
description: graphify knowledge graph context
alwaysApply: true
---

This project has a graphify knowledge graph at .graphify/.

- Before answering architecture or codebase questions, read .graphify/GRAPH_REPORT.md for god nodes and community structure
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` first; if tracked legacy artifacts are reported, ask before using the recommended \`git mv -f graphify-out .graphify\` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const ANTIGRAVITY_RULE_PATH = join(".agent", "rules", "graphify.md");
const ANTIGRAVITY_WORKFLOW_PATH = join(".agent", "workflows", "graphify.md");
const ANTIGRAVITY_RULE = `## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- Before answering architecture or codebase questions, read .graphify/GRAPH_REPORT.md for god nodes and community structure
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` before relying on legacy state
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- If the graphify MCP server is active, prefer graph tools like \`query_graph\`, \`get_node\`, and \`shortest_path\` for architecture navigation
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const ANTIGRAVITY_WORKFLOW = `# Workflow: graphify
**Command:** /graphify
**Description:** Turn any folder of files into a navigable knowledge graph

## Steps
Follow the graphify skill installed at ~/.agent/skills/graphify/SKILL.md to run the full TypeScript-backed pipeline.

If no path argument is given, use \`.\` (current directory).
`;

const KIRO_STEERING = `---
inclusion: always
---

graphify: A knowledge graph of this project lives in \`.graphify/\`. If \`.graphify/GRAPH_REPORT.md\` exists, read it before answering architecture questions, tracing dependencies, or searching files. If \`.graphify/wiki/index.md\` exists, navigate it for deep questions. Prefer graph structure over raw grep when graph context is current.
`;

const KIRO_STEERING_MARKER = "graphify: A knowledge graph of this project";

const VSCODE_INSTRUCTIONS_SECTION = `## graphify

Before answering architecture or codebase questions, read \`.graphify/GRAPH_REPORT.md\` if it exists.
If \`.graphify/wiki/index.md\` exists, navigate it for deep questions.
If \`.graphify/graph.json\` is missing but \`graphify-out/graph.json\` exists, run \`graphify migrate-state --dry-run\` before relying on legacy state.
Type \`/graphify\` in Copilot Chat to build or update the knowledge graph.
`;

const AIDER_SEMANTIC_SECTION = `#### Part B - Semantic extraction (sequential extraction on Aider)

**Fast path:** If detection found zero docs, papers, and images (code-only corpus), skip Part B entirely and go straight to Part C. AST handles code - there is nothing for semantic extraction to do.

> **Aider platform:** Multi-agent support is still early on Aider. Extraction runs sequentially - read and extract each uncached file yourself instead of dispatching parallel Agent calls.

Print: \`Semantic extraction: N files (sequential - Aider)\`

**Step B0 - Check extraction cache first**

Before reading any docs, papers, or images, check which files already have cached semantic extraction results:

\`\`\`bash
node -e "
const fs = require('fs');
const { checkSemanticCache } = require('graphifyy');

const detect = JSON.parse(fs.readFileSync('.graphify/.graphify_detect.json', 'utf-8'));
const allFiles = Object.values(detect.files).flat();

const [cachedNodes, cachedEdges, cachedHyperedges, uncached] = checkSemanticCache(allFiles);

if (cachedNodes.length || cachedEdges.length || cachedHyperedges.length) {
    fs.writeFileSync('.graphify/.graphify_cached.json', JSON.stringify({nodes: cachedNodes, edges: cachedEdges, hyperedges: cachedHyperedges}));
}
fs.writeFileSync('.graphify/.graphify_uncached.txt', uncached.join('\\n'));
console.log(\`Cache: \${allFiles.length - uncached.length} files hit, \${uncached.length} files need extraction\`);
"
\`\`\`

Only extract files listed in \`.graphify/.graphify_uncached.txt\`. If all files are cached, skip to Part C directly.

**Step B1 - Split into chunks**

Load files from \`.graphify/.graphify_uncached.txt\`. Split them into logical batches of 20-25 files, but process them sequentially on Aider. Keep files from the same directory together. Each image still deserves focused attention because vision context is expensive.

**Step B2 - Sequential extraction (Aider)**

Process each uncached file one at a time. For each file:

1. Read the file contents.
2. Extract nodes, edges, and hyperedges using the same graphify rules:
   - EXTRACTED: relationship explicit in source (import, call, citation, "see section 3.2")
   - INFERRED: reasonable inference (shared structure, implied dependency)
   - AMBIGUOUS: uncertain - flag it instead of omitting it
   - Code files: only add semantic edges AST cannot find. Do not re-extract imports.
   - Doc/paper files: extract named concepts, entities, citations, and rationale nodes (WHY decisions were made -> \`rationale_for\` edges)
   - Image files: use vision to understand what the image is, not just OCR
   - If \`--mode deep\` was given, be more aggressive with INFERRED edges
   - Add \`semantically_similar_to\` only for genuinely non-obvious cross-cutting similarities
   - Add hyperedges only when 3+ nodes clearly participate in one shared concept or flow
   - \`confidence_score\` is REQUIRED on every edge: EXTRACTED=1.0, INFERRED=0.6-0.9, AMBIGUOUS=0.1-0.3
3. Accumulate the results across all files.

Write the accumulated result to \`.graphify/.graphify_semantic_new.json\` using this exact schema:

\`\`\`json
{"nodes":[{"id":"filestem_entityname","label":"Human Readable Name","file_type":"code|document|paper|image","source_file":"relative/path","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null}],"edges":[{"source":"node_id","target":"node_id","relation":"calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to|rationale_for","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","confidence_score":1.0,"source_file":"relative/path","source_location":null,"weight":1.0}],"hyperedges":[{"id":"snake_case_id","label":"Human Readable Label","nodes":["node_id1","node_id2","node_id3"],"relation":"participate_in|implement|form","confidence":"EXTRACTED|INFERRED","confidence_score":0.75,"source_file":"relative/path"}],"input_tokens":0,"output_tokens":0}
\`\`\`

**Step B3 - Cache and merge**

If more than half the sequential batches failed, stop and tell the user.

Save new results to cache:

\`\`\`bash
node -e "
const fs = require('fs');
const { saveSemanticCache } = require('graphifyy');

const raw = fs.existsSync('.graphify/.graphify_semantic_new.json') ? JSON.parse(fs.readFileSync('.graphify/.graphify_semantic_new.json', 'utf-8')) : {nodes:[],edges:[],hyperedges:[]};
const saved = saveSemanticCache(raw.nodes || [], raw.edges || [], raw.hyperedges || []);
console.log(\`Cached \${saved} files\`);
"
\`\`\`

Merge cached + new results into \`.graphify/.graphify_semantic.json\`:

\`\`\`bash
node -e "
const fs = require('fs');

const cached = fs.existsSync('.graphify/.graphify_cached.json') ? JSON.parse(fs.readFileSync('.graphify/.graphify_cached.json', 'utf-8')) : {nodes:[],edges:[],hyperedges:[]};
const fresh = fs.existsSync('.graphify/.graphify_semantic_new.json') ? JSON.parse(fs.readFileSync('.graphify/.graphify_semantic_new.json', 'utf-8')) : {nodes:[],edges:[],hyperedges:[]};

const allNodes = [...cached.nodes, ...(fresh.nodes || [])];
const allEdges = [...cached.edges, ...(fresh.edges || [])];
const allHyperedges = [...(cached.hyperedges || []), ...(fresh.hyperedges || [])];

const seen = new Set();
const dedupedNodes = [];
for (const node of allNodes) {
  if (seen.has(node.id)) continue;
  seen.add(node.id);
  dedupedNodes.push(node);
}

fs.writeFileSync('.graphify/.graphify_semantic.json', JSON.stringify({
  nodes: dedupedNodes,
  edges: allEdges,
  hyperedges: allHyperedges,
  input_tokens: fresh.input_tokens || 0,
  output_tokens: fresh.output_tokens || 0
}, null, 2));

console.log(\`Extraction complete - \${dedupedNodes.length} nodes, \${allEdges.length} edges (\${cached.nodes.length} from cache, \${(fresh.nodes || []).length} new)\`);
"
\`\`\`

Clean up temp files: \`rm -f .graphify/.graphify_cached.json .graphify/.graphify_uncached.txt .graphify/.graphify_semantic_new.json\``;

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

function renderAiderSkill(baseSkill: string): string {
  return baseSkill.replace(
    /#### Part B - Semantic extraction \(parallel subagents\)[\s\S]*?(?=\n#### Part C - Merge AST \+ semantic into final extraction)/,
    AIDER_SEMANTIC_SECTION,
  );
}

function loadSkillContent(platformName: string): string {
  platformName = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[platformName];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }

  const skillSrc = findSkillFile(cfg.skill_file);
  if (!skillSrc) {
    console.error(`error: ${cfg.skill_file} not found in package - reinstall graphify`);
    process.exit(1);
  }

  const baseSkill = readFileSync(skillSrc, "utf-8");
  if (platformName === "aider") {
    const rendered = renderAiderSkill(baseSkill);
    if (rendered === baseSkill) {
      throw new Error("failed to render Aider skill overrides");
    }
    return rendered;
  }
  return baseSkill;
}

function uninstallSkill(platformName: string): void {
  platformName = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[platformName];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }

  const skillDst = join(homedir(), cfg.skill_dst);
  const removed: string[] = [];
  if (existsSync(skillDst)) {
    unlinkSync(skillDst);
    removed.push(`skill removed: ${skillDst}`);
  }
  const versionFile = join(dirname(skillDst), ".graphify_version");
  if (existsSync(versionFile)) {
    unlinkSync(versionFile);
  }
  for (let dir = dirname(skillDst); dir !== dirname(dir); dir = dirname(dir)) {
    try {
      rmdirSync(dir);
    } catch {
      break;
    }
  }
  console.log(removed.length > 0 ? removed.join("; ") : "nothing to remove");
}

export function getInvocationExample(platformName: string): string {
  return platformName === "codex" ? "$graphify ." : "/graphify .";
}

export function getAgentsMdSection(platformName: string): string {
  const lines = [
    "## graphify",
    "",
    "This project has a graphify knowledge graph at .graphify/.",
    "",
    "Rules:",
    "- Before answering architecture or codebase questions, read .graphify/GRAPH_REPORT.md for god nodes and community structure",
    "- If .graphify/wiki/index.md exists, navigate it instead of reading raw files",
    "- If .graphify/graph.json is missing but graphify-out/graph.json exists, run `graphify migrate-state --dry-run` first; if tracked legacy artifacts are reported, ask before using the recommended `git mv -f graphify-out .graphify` and commit message",
    "- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run the graphify skill with --update when appropriate",
    "- If the user asks to build, update, query, path, or explain the graph, use the installed `graphify` skill instead of ad-hoc file traversal",
    "- Before deep graph traversal, prefer `graphify summary --graph .graphify/graph.json` for compact first-hop orientation",
    "- For review impact on changed files, use `graphify review-delta --graph .graphify/graph.json` instead of generic traversal",
    "- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current",
  ];
  if (platformName === "codex") {
    lines.splice(
      7,
      0,
      "- In Codex, the reliable explicit skill invocation is `$graphify ...`; do not rely on `/graphify ...`",
      "- `$graphify ...` is a Codex skill trigger, not a Bash subcommand like `graphify .`",
      "- A successful TypeScript-backed Codex build should leave `.graphify/.graphify_runtime.json` with `runtime: typescript`",
    );
  }
  return lines.join("\n") + "\n";
}

function installGeminiMcp(projectDir: string): void {
  const geminiDir = join(projectDir, ".gemini");
  if (existsSync(geminiDir) && !statSync(geminiDir).isDirectory()) {
    console.log("  .gemini/settings.json  ->  skipped (cannot create config dir because .gemini is a file)");
    return;
  }

  const settingsPath = join(geminiDir, "settings.json");
  mkdirSync(dirname(settingsPath), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch { /* ignore */ }
  }

  const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
  const existing = mcpServers.graphify as Record<string, unknown> | undefined;
  if (JSON.stringify(existing) === JSON.stringify(GEMINI_MCP_SERVER)) {
    console.log("  .gemini/settings.json  ->  graphify MCP already registered (no change)");
    return;
  }

  mcpServers.graphify = GEMINI_MCP_SERVER;
  settings.mcpServers = mcpServers;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log("  .gemini/settings.json  ->  graphify MCP server registered");
}

function uninstallGeminiMcp(projectDir: string): void {
  const settingsPath = join(projectDir, ".gemini", "settings.json");
  if (!existsSync(settingsPath)) return;

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return;
  }

  const mcpServers = { ...((settings.mcpServers ?? {}) as Record<string, unknown>) };
  if (!("graphify" in mcpServers)) return;

  delete mcpServers.graphify;
  if (Object.keys(mcpServers).length === 0) {
    delete settings.mcpServers;
  } else {
    settings.mcpServers = mcpServers;
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log("  .gemini/settings.json  ->  graphify MCP server removed");
}

export function cursorInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "cursor"));
  const rulePath = join(projectDir, ".cursor", "rules", "graphify.mdc");
  mkdirSync(dirname(rulePath), { recursive: true });
  if (existsSync(rulePath)) {
    console.log(`graphify rule already exists at ${resolve(rulePath)} (no change)`);
  } else {
    writeFileSync(rulePath, CURSOR_RULE, "utf-8");
    console.log(`graphify rule written to ${resolve(rulePath)}`);
  }
  console.log();
  console.log("Cursor will now always include the knowledge graph context.");
  console.log("Run `$graphify .` or `/graphify .` in your assistant first if you have not built the graph yet.");
}

export function cursorUninstall(projectDir: string = "."): void {
  const rulePath = join(projectDir, ".cursor", "rules", "graphify.mdc");
  if (!existsSync(rulePath)) {
    console.log("No graphify Cursor rule found - nothing to do");
    return;
  }
  const { unlinkSync } = require("node:fs");
  unlinkSync(rulePath);
  console.log(`graphify Cursor rule removed from ${resolve(rulePath)}`);
}

export function antigravityInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "antigravity"));
  printMutationPreview(globalSkillInstallPreview("antigravity"));
  writeGlobalSkill("antigravity");

  const rulePath = join(projectDir, ANTIGRAVITY_RULE_PATH);
  mkdirSync(dirname(rulePath), { recursive: true });
  if (existsSync(rulePath)) {
    console.log(`graphify Antigravity rule already exists at ${resolve(rulePath)} (no change)`);
  } else {
    writeFileSync(rulePath, ANTIGRAVITY_RULE, "utf-8");
    console.log(`graphify Antigravity rule written to ${resolve(rulePath)}`);
  }

  const workflowPath = join(projectDir, ANTIGRAVITY_WORKFLOW_PATH);
  mkdirSync(dirname(workflowPath), { recursive: true });
  if (existsSync(workflowPath)) {
    console.log(`graphify Antigravity workflow already exists at ${resolve(workflowPath)} (no change)`);
  } else {
    writeFileSync(workflowPath, ANTIGRAVITY_WORKFLOW, "utf-8");
    console.log(`graphify Antigravity workflow written to ${resolve(workflowPath)}`);
  }

  console.log();
  console.log("Antigravity will now check the knowledge graph before answering codebase questions.");
  console.log("Run /graphify first to build or update the graph.");
}

export function antigravityUninstall(projectDir: string = "."): void {
  for (const relativePath of [ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH]) {
    const target = join(projectDir, relativePath);
    if (existsSync(target)) {
      unlinkSync(target);
      console.log(`graphify Antigravity file removed from ${resolve(target)}`);
    }
  }
  uninstallSkill("antigravity");
}

export function kiroInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "kiro"));

  const skillPath = join(projectDir, ".kiro", "skills", "graphify", "SKILL.md");
  mkdirSync(dirname(skillPath), { recursive: true });
  writeFileSync(skillPath, loadSkillContent("kiro"), "utf-8");
  writeFileSync(join(dirname(skillPath), ".graphify_version"), VERSION, "utf-8");
  console.log(`  .kiro/skills/graphify/SKILL.md  ->  /graphify skill`);

  const steeringPath = join(projectDir, ".kiro", "steering", "graphify.md");
  mkdirSync(dirname(steeringPath), { recursive: true });
  if (existsSync(steeringPath) && readFileSync(steeringPath, "utf-8").includes(KIRO_STEERING_MARKER)) {
    console.log("  .kiro/steering/graphify.md  ->  already configured");
  } else {
    writeFileSync(steeringPath, KIRO_STEERING, "utf-8");
    console.log("  .kiro/steering/graphify.md  ->  always-on steering written");
  }

  console.log();
  console.log("Kiro will now read the knowledge graph before every conversation.");
  console.log("Use /graphify to build or update the graph.");
}

export function kiroUninstall(projectDir: string = "."): void {
  const targets = [
    join(projectDir, ".kiro", "skills", "graphify", "SKILL.md"),
    join(projectDir, ".kiro", "skills", "graphify", ".graphify_version"),
    join(projectDir, ".kiro", "steering", "graphify.md"),
  ];
  let removed = 0;
  for (const target of targets) {
    if (existsSync(target)) {
      unlinkSync(target);
      removed += 1;
      console.log(`  removed ${resolve(target)}`);
    }
  }
  for (const dir of [
    join(projectDir, ".kiro", "skills", "graphify"),
    join(projectDir, ".kiro", "skills"),
    join(projectDir, ".kiro", "steering"),
    join(projectDir, ".kiro"),
  ]) {
    try {
      rmdirSync(dir);
    } catch {
      // Keep non-empty platform directories.
    }
  }
  if (removed === 0) console.log("No graphify Kiro files found - nothing to do");
}

export function vscodeInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "vscode-copilot-chat"));
  printMutationPreview(globalSkillInstallPreview("vscode-copilot-chat"));
  writeGlobalSkill("vscode-copilot-chat");

  const instructionsPath = join(projectDir, ".github", "copilot-instructions.md");
  mkdirSync(dirname(instructionsPath), { recursive: true });
  if (existsSync(instructionsPath)) {
    const content = readFileSync(instructionsPath, "utf-8");
    if (content.includes(MD_MARKER)) {
      console.log(`  .github/copilot-instructions.md  ->  already configured (no change)`);
    } else {
      writeFileSync(instructionsPath, content.trimEnd() + "\n\n" + VSCODE_INSTRUCTIONS_SECTION, "utf-8");
      console.log(`  .github/copilot-instructions.md  ->  graphify section added`);
    }
  } else {
    writeFileSync(instructionsPath, VSCODE_INSTRUCTIONS_SECTION, "utf-8");
    console.log(`  .github/copilot-instructions.md  ->  created`);
  }

  console.log();
  console.log("VS Code Copilot Chat configured. Type /graphify in the chat panel to build the graph.");
  console.log("For GitHub Copilot CLI in a terminal, use: graphify copilot install");
}

export function vscodeUninstall(projectDir: string = "."): void {
  uninstallSkill("vscode-copilot-chat");
  const instructionsPath = join(projectDir, ".github", "copilot-instructions.md");
  if (!existsSync(instructionsPath)) return;
  const content = readFileSync(instructionsPath, "utf-8");
  if (!content.includes(MD_MARKER)) return;
  const cleaned = content.replace(/\n*## graphify\n[\s\S]*?(?=\n## |\s*$)/, "").trim();
  if (cleaned) {
    writeFileSync(instructionsPath, cleaned + "\n", "utf-8");
    console.log(`  graphify section removed from ${resolve(instructionsPath)}`);
  } else {
    unlinkSync(instructionsPath);
    console.log(`  ${resolve(instructionsPath)}  ->  deleted (was empty after removal)`);
  }
}

function installOpenCodePlugin(projectDir: string): void {
  const opencodeDir = join(projectDir, ".opencode");
  if (existsSync(opencodeDir) && !statSync(opencodeDir).isDirectory()) {
    console.log(`  ${OPENCODE_PLUGIN_ENTRY}  ->  skipped (cannot create plugin dir because .opencode is a file)`);
    return;
  }

  const pluginPath = join(projectDir, ".opencode", "plugins", "graphify.js");
  mkdirSync(dirname(pluginPath), { recursive: true });
  writeFileSync(pluginPath, OPENCODE_PLUGIN_JS, "utf-8");
  console.log(`  ${OPENCODE_PLUGIN_ENTRY}  ->  tool.execute.before hook written`);

  const { config, sourcePath } = loadOpenCodeConfig(projectDir);
  const plugins = Array.isArray(config.plugin) ? [...config.plugin] : [];
  const alreadyRegistered = plugins.includes(OPENCODE_PLUGIN_ENTRY);
  if (!alreadyRegistered) {
    plugins.push(OPENCODE_PLUGIN_ENTRY);
  }
  config.plugin = plugins;
  const configPath = opencodeConfigPath(projectDir);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  if (sourcePath && sourcePath !== configPath && existsSync(sourcePath)) {
    console.log(`  ${OPENCODE_CONFIG_ENTRY}  ->  migrated from legacy root config`);
  }
  if (alreadyRegistered) {
    console.log(`  ${OPENCODE_CONFIG_ENTRY}  ->  plugin already registered (no change)`);
  } else {
    console.log(`  ${OPENCODE_CONFIG_ENTRY}  ->  plugin registered`);
  }
}

function uninstallOpenCodePlugin(projectDir: string): void {
  const pluginPath = join(projectDir, ".opencode", "plugins", "graphify.js");
  if (existsSync(pluginPath)) {
    unlinkSync(pluginPath);
    console.log(`  ${OPENCODE_PLUGIN_ENTRY}  ->  removed`);
  }

  const configPath = existsSync(opencodeConfigPath(projectDir))
    ? opencodeConfigPath(projectDir)
    : legacyOpencodeConfigPath(projectDir);
  if (!existsSync(configPath)) return;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return;
  }

  const plugins = Array.isArray(config.plugin) ? [...config.plugin] : [];
  if (!plugins.includes(OPENCODE_PLUGIN_ENTRY)) return;

  const filtered = plugins.filter((entry) => entry !== OPENCODE_PLUGIN_ENTRY);
  if (filtered.length === 0) {
    delete config.plugin;
  } else {
    config.plugin = filtered;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  const entry = configPath === opencodeConfigPath(projectDir)
    ? OPENCODE_CONFIG_ENTRY
    : "opencode.json";
  console.log(`  ${entry}  ->  plugin deregistered`);
}

// ---------------------------------------------------------------------------
// Install commands
// ---------------------------------------------------------------------------

function writeGlobalSkill(platformName: string): string {
  platformName = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[platformName];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }

  const skillDst = join(homedir(), cfg.skill_dst);
  mkdirSync(dirname(skillDst), { recursive: true });
  writeFileSync(skillDst, loadSkillContent(platformName), "utf-8");
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

  return skillDst;
}

function installSkill(platformName: string): void {
  platformName = canonicalPlatformName(platformName);
  printMutationPreview(globalSkillInstallPreview(platformName));
  writeGlobalSkill(platformName);

  console.log();
  console.log("Done. Open your AI coding assistant and type:");
  console.log();
  console.log(`  ${getInvocationExample(platformName)}`);
  if (platformName === "codex") {
    console.log();
    console.log("Codex explicit skill calls use `$graphify`, not `/graphify`.");
    console.log("`$graphify ...` is a Codex skill trigger, not a Bash command like `graphify .`.");
    console.log("A successful TypeScript Codex run should leave .graphify/.graphify_runtime.json");
    console.log("with runtime=typescript.");
  }
  console.log();
}

export function installClaudeHook(projectDir: string): void {
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
  const filtered = preTool.filter(
    (h) => !(h.matcher === "Glob|Grep" && JSON.stringify(h).includes("graphify")),
  );

  filtered.push(SETTINGS_HOOK);
  hooks.PreToolUse = filtered;
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
  printMutationPreview(platformInstallPreview(projectDir, "claude"));
  let alreadyConfigured = false;
  const target = join(projectDir, "CLAUDE.md");
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    if (content.includes(MD_MARKER)) {
      alreadyConfigured = true;
      console.log("graphify already configured in CLAUDE.md");
    } else {
      writeFileSync(target, content.trimEnd() + "\n\n" + CLAUDE_MD_SECTION, "utf-8");
    }
  } else {
    writeFileSync(target, CLAUDE_MD_SECTION, "utf-8");
  }

  if (!alreadyConfigured) {
    console.log(`graphify section written to ${resolve(target)}`);
  }
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

export function geminiInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "gemini"));
  let alreadyConfigured = false;
  const target = join(projectDir, "GEMINI.md");
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    if (content.includes(MD_MARKER)) {
      alreadyConfigured = true;
      console.log("graphify already configured in GEMINI.md");
    } else {
      writeFileSync(target, content.trimEnd() + "\n\n" + GEMINI_MD_SECTION, "utf-8");
    }
  } else {
    writeFileSync(target, GEMINI_MD_SECTION, "utf-8");
  }

  if (!alreadyConfigured) {
    console.log(`graphify section written to ${resolve(target)}`);
  }
  installGeminiMcp(projectDir);
  console.log();
  console.log("Gemini CLI will now check the knowledge graph before answering");
  console.log("codebase questions and can access graphify via the configured MCP server.");
  console.log();
  console.log("Note: install the `/graphify` custom command globally with");
  console.log("`graphify install --platform gemini` if you have not done that yet.");
}

export function geminiUninstall(projectDir: string = "."): void {
  const target = join(projectDir, "GEMINI.md");
  if (!existsSync(target)) {
    console.log("No GEMINI.md found in current directory - nothing to do");
  } else {
    const content = readFileSync(target, "utf-8");
    if (!content.includes(MD_MARKER)) {
      console.log("graphify section not found in GEMINI.md - nothing to do");
    } else {
      const cleaned = content.replace(/\n*## graphify\n[\s\S]*?(?=\n## |\s*$)/, "").trim();
      if (cleaned) {
        writeFileSync(target, cleaned + "\n", "utf-8");
        console.log(`graphify section removed from ${resolve(target)}`);
      } else {
        const { unlinkSync } = require("node:fs");
        unlinkSync(target);
        console.log(`GEMINI.md was empty after removal - deleted ${resolve(target)}`);
      }
    }
  }
  uninstallGeminiMcp(projectDir);
}

export function installCodexHook(projectDir: string): void {
  const hooksDir = join(projectDir, ".codex");
  if (existsSync(hooksDir) && !statSync(hooksDir).isDirectory()) {
    console.log("  .codex/hooks.json  ->  skipped (cannot create hook dir because .codex is a file)");
    return;
  }

  const hooksPath = join(hooksDir, "hooks.json");
  mkdirSync(hooksDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(hooksPath)) {
    try { existing = JSON.parse(readFileSync(hooksPath, "utf-8")); } catch { /* ignore */ }
  }

  const hooks = (existing.hooks ?? {}) as Record<string, unknown>;
  const preTool = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;
  const filtered = preTool.filter((h) => !JSON.stringify(h).includes("graphify"));

  filtered.push({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command:
          '[ -f .graphify/graph.json ] && ' +
          "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\"},\"systemMessage\":\"graphify: Knowledge graph exists. Read .graphify/GRAPH_REPORT.md for god nodes and community structure before searching raw files.\"}' " +
          '|| true',
      },
    ],
  });
  hooks.PreToolUse = filtered;
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

export function agentsInstall(projectDir: string, platformName: string): void {
  printMutationPreview(platformInstallPreview(projectDir, platformName));
  let alreadyConfigured = false;
  const target = join(projectDir, "AGENTS.md");
  const section = getAgentsMdSection(platformName);
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    if (content.includes(MD_MARKER)) {
      alreadyConfigured = true;
      console.log(`graphify already configured in AGENTS.md`);
    } else {
      writeFileSync(target, content.trimEnd() + "\n\n" + section, "utf-8");
    }
  } else {
    writeFileSync(target, section, "utf-8");
  }

  if (!alreadyConfigured) {
    console.log(`graphify section written to ${resolve(target)}`);
  }

  if (platformName === "codex") {
    installCodexHook(projectDir);
  } else if (platformName === "opencode") {
    installOpenCodePlugin(projectDir);
  }

  console.log();
  console.log(`${platformName.charAt(0).toUpperCase() + platformName.slice(1)} will now check the knowledge graph before answering`);
  console.log("codebase questions and rebuild it after code changes.");
  if (!["codex", "opencode"].includes(platformName)) {
    console.log();
    console.log("Note: unlike Claude Code, there is no PreToolUse hook equivalent for");
    console.log(`${platformName.charAt(0).toUpperCase() + platformName.slice(1)} — the AGENTS.md rules are the always-on mechanism.`);
  }
}

function agentsUninstall(projectDir: string, platformName: string): void {
  const target = join(projectDir, "AGENTS.md");
  if (!existsSync(target)) {
    console.log("No AGENTS.md found in current directory - nothing to do");
  } else {
    const content = readFileSync(target, "utf-8");
    if (!content.includes(MD_MARKER)) {
      console.log("graphify section not found in AGENTS.md - nothing to do");
    } else {
      const cleaned = content.replace(/\n*## graphify\n[\s\S]*?(?=\n## |\s*$)/, "").trim();
      if (cleaned) {
        writeFileSync(target, cleaned + "\n", "utf-8");
        console.log(`graphify section removed from ${resolve(target)}`);
      } else {
        const { unlinkSync } = require("node:fs");
        unlinkSync(target);
        console.log(`AGENTS.md was empty after removal - deleted ${resolve(target)}`);
      }
    }
  }
  if (platformName === "codex") {
    uninstallCodexHook(projectDir);
  } else if (platformName === "opencode") {
    uninstallOpenCodePlugin(projectDir);
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

export function getPlatformsToCheck(argv: string[]): string[] {
  const seen = new Set<string>();
  const add = (platformName: string | undefined): void => {
    if (!platformName) return;
    const canonical = canonicalPlatformName(platformName);
    if (!(canonical in PLATFORM_CONFIG)) return;
    seen.add(canonical);
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token in PLATFORM_CONFIG || token in PLATFORM_ALIASES) {
      add(token);
      continue;
    }
    if (token === "--platform") {
      add(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token.startsWith("--platform=")) {
      add(token.slice("--platform=".length));
    }
  }

  if (seen.size > 0) {
    return [...seen];
  }

  if (argv[0] === "install") {
    return [platform() === "win32" ? "windows" : "claude"];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Main CLI
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  // Only warn for the platform(s) relevant to the current command.
  for (const platformName of getPlatformsToCheck(process.argv.slice(2))) {
    const cfg = PLATFORM_CONFIG[platformName];
    if (!cfg) continue;
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

  for (const cmd of ["gemini"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install").description("Write graphify section to GEMINI.md + project MCP config").action(() => geminiInstall());
    sub.command("uninstall").description("Remove graphify section from GEMINI.md + project MCP config").action(() => geminiUninstall());
  }

  {
    const sub = program.command("cursor").description("cursor skill management");
    sub.command("install").description("Write .cursor/rules/graphify.mdc").action(() => cursorInstall());
    sub.command("uninstall").description("Remove .cursor/rules/graphify.mdc").action(() => cursorUninstall());
  }

  {
    const sub = program.command("copilot").description("copilot skill management");
    sub.command("install").description("Copy graphify skill to ~/.copilot/skills").action(() => installSkill("copilot"));
    sub.command("uninstall").description("Remove graphify skill from ~/.copilot/skills").action(() => uninstallSkill("copilot"));
  }

  {
    const sub = program.command("vscode").description("VS Code Copilot Chat skill management");
    sub.command("install").description("Configure VS Code Copilot Chat skill + instructions").action(() => vscodeInstall());
    sub.command("uninstall").description("Remove VS Code Copilot Chat configuration").action(() => vscodeUninstall());
  }

  {
    const sub = program.command("kiro").description("Kiro skill management");
    sub.command("install").description("Write .kiro skill + always-on steering file").action(() => kiroInstall());
    sub.command("uninstall").description("Remove .kiro skill + steering file").action(() => kiroUninstall());
  }

  {
    const sub = program.command("antigravity").description("Google Antigravity skill management");
    sub.command("install").description("Write .agent rules/workflow + global skill").action(() => antigravityInstall());
    sub.command("uninstall").description("Remove .agent rules/workflow + global skill").action(() => antigravityUninstall());
  }

  for (const cmd of ["aider", "codex", "opencode", "claw", "droid", "trae", "trae-cn", "hermes"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install").description(
      cmd === "codex"
        ? "Write graphify section to AGENTS.md + PreToolUse hook"
        : cmd === "opencode"
          ? "Write graphify section to AGENTS.md + tool.execute.before plugin"
          : "Write graphify section to AGENTS.md",
    ).action(() => {
      if (cmd === "hermes") installSkill("hermes");
      agentsInstall(".", cmd);
    });
    sub.command("uninstall").description(
      cmd === "codex"
        ? "Remove graphify section from AGENTS.md + PreToolUse hook"
        : cmd === "opencode"
          ? "Remove graphify section from AGENTS.md + plugin"
          : "Remove graphify section from AGENTS.md",
    ).action(() => {
      agentsUninstall(".", cmd);
      if (cmd === "hermes") uninstallSkill("hermes");
    });
  }

  program
    .command("migrate-state")
    .description("Migrate legacy graphify-out state into .graphify")
    .option("--root <path>", "Workspace root", ".")
    .option("--dry-run", "Print the migration plan without writing files")
    .option("--force", "Overwrite existing files under .graphify")
    .option("--json", "Print JSON output")
    .action(async (opts) => {
      const { migrateGraphifyOut, migrationResultToText } = await import("./migrate-state.js");
      const result = migrateGraphifyOut({ root: opts.root, dryRun: opts.dryRun, force: opts.force });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(migrationResultToText(result));
      }
    });

  // Hook management
  const hook = program.command("hook").description("Git hook management");
  hook.command("install").description("Install post-commit/post-checkout/post-merge/post-rewrite git hooks").action(async () => {
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

  const state = program.command("state").description("Graphify local state metadata");
  state.command("status").description("Print branch/worktree lifecycle metadata").action(async () => {
    const { readLifecycleMetadata, refreshLifecycleMetadata } = await import("./lifecycle.js");
    const metadata = readLifecycleMetadata(".") ?? refreshLifecycleMetadata(".");
    console.log(JSON.stringify(metadata, null, 2));
  });
  state.command("prune").description("Plan stale lifecycle cleanup without deleting files").action(async () => {
    const { planLifecyclePrune } = await import("./lifecycle.js");
    console.log(JSON.stringify(planLifecyclePrune("."), null, 2));
  });

  const profile = program.command("profile").description("Configured ontology dataprep profile commands");
  profile
    .command("validate")
    .description("Validate and normalize graphify.yaml plus its ontology profile")
    .option("--root <path>", "Workspace root", ".")
    .option("--config <path>", "Explicit graphify.yaml path")
    .option("--out <path>", "Optional normalized project config output")
    .option("--profile-out <path>", "Optional normalized ontology profile output")
    .action(async (opts) => {
      const { discoverProjectConfig, loadProjectConfig } = await import("./project-config.js");
      const { loadOntologyProfile } = await import("./ontology-profile.js");
      const root = resolve(opts.root);
      const configPath = opts.config ? resolve(opts.config) : discoverProjectConfig(root).path;
      if (!configPath) {
        console.error(`error: no graphify project config found under ${root}`);
        process.exit(1);
      }
      const projectConfig = loadProjectConfig(configPath);
      const ontologyProfile = loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
      if (opts.out) writeJson(opts.out, projectConfig);
      if (opts.profileOut) writeJson(opts.profileOut, ontologyProfile);
      console.log(`Profile config valid: ${ontologyProfile.id}`);
    });

  profile
    .command("dataprep [path]")
    .description("Run deterministic local dataprep for a configured ontology profile")
    .option("--config <path>", "Explicit graphify.yaml path")
    .option("--out-dir <path>", "State output directory relative to root or absolute")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (profilePath = ".", opts) => {
      const { runConfiguredDataprep } = await import("./configured-dataprep.js");
      const root = resolve(profilePath);
      const configPath = opts.config
        ? resolve(opts.config)
        : discoverProjectConfig(root).path;
      if (!configPath) {
        console.error(`error: no graphify project config found under ${root}`);
        process.exit(1);
      }
      const config = loadProjectConfig(configPath);
      const scopeSelection = resolveConfiguredInputScopeSelection(config, opts);
      const result = await runConfiguredDataprep(root, {
        ...(opts.config ? { configPath: resolve(opts.config) } : {}),
        ...(opts.outDir ? { stateDir: opts.outDir } : {}),
        scope: scopeSelection.mode,
        scopeSource: scopeSelection.source,
      });
      console.log(
        `Profile dataprep: ${result.semanticDetection.total_files} semantic file(s), ` +
        `${result.registryExtraction.nodes.length} registry node(s)`,
      );
    });

  profile
    .command("validate-extraction")
    .description("Validate an extraction JSON against profile artifacts")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--input <path>", "Extraction JSON to validate")
    .option("--json", "Print JSON instead of markdown")
    .action(async (opts) => {
      const { validateProfileExtraction, profileValidationResultToMarkdown } = await import("./profile-validate.js");
      const context = loadCliProfileContext(opts.profileState);
      const extraction = readJson<unknown>(opts.input);
      const result = validateProfileExtraction(extraction, { profile: context.profile });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(profileValidationResultToMarkdown(result));
      }
      if (!result.valid) process.exit(1);
    });

  profile
    .command("report")
    .description("Write an additive profile report")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--graph <path>", "Graph JSON path")
    .requiredOption("--out <path>", "Report markdown output path")
    .action(async (opts) => {
      const { buildProfileReport } = await import("./profile-report.js");
      const context = loadCliProfileContext(opts.profileState);
      const report = buildProfileReport({
        profileState: context.profileState,
        profile: context.profile,
        ...(context.projectConfig ? { projectConfig: context.projectConfig } : {}),
        graph: readJson<{ nodes?: unknown[]; links?: unknown[] }>(opts.graph),
      });
      mkdirSync(dirname(resolve(opts.out)), { recursive: true });
      writeFileSync(resolve(opts.out), report, "utf-8");
      console.log(`Profile report written to ${resolve(opts.out)}`);
    });

  profile
    .command("ontology-output")
    .description("Compile optional profile-declared ontology output artifacts")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--input <path>", "Extraction JSON to compile")
    .requiredOption("--out-dir <path>", "Ontology output directory")
    .action(async (opts) => {
      const { compileOntologyOutputs } = await import("./ontology-output.js");
      const context = loadCliProfileContext(opts.profileState);
      const result = compileOntologyOutputs({
        outputDir: resolve(opts.outDir),
        extraction: readJson(opts.input),
        profile: context.profile,
        config: context.profile.outputs.ontology,
      });
      if (!result.enabled) {
        console.log("Ontology outputs disabled by profile config");
        return;
      }
      console.log(
        `Ontology outputs: ${result.nodeCount} node(s), ${result.relationCount} relation(s), ` +
        `${result.wikiPageCount} wiki page(s)`,
      );
    });

  program
    .command("clone <url>")
    .description("Clone a repository locally and print its resolved path")
    .option("--branch <branch>", "Checkout a specific branch")
    .option("--out <dir>", "Clone into a custom directory")
    .action(async (url, opts) => {
      try {
        const { cloneRepo } = await import("./repo-clone.js");
        const result = cloneRepo({
          url,
          ...(opts.branch ? { branch: opts.branch } : {}),
          ...(opts.out ? { outDir: opts.out } : {}),
        });
        console.log(result.path);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command("merge-graphs <graphs...>")
    .description("Merge two or more graph.json files into one cross-repo graph")
    .option("--out <path>", "Merged graph output path", ".graphify/merged-graph.json")
    .action(async (graphs: string[], opts) => {
      try {
        const { mergeGraphsFromFiles } = await import("./merge-graphs.js");
        const result = mergeGraphsFromFiles({ inputs: graphs, out: opts.out });
        console.log(`Merged ${result.graphCount} graphs -> ${result.nodeCount} nodes, ${result.edgeCount} edges`);
        console.log(`Written to: ${result.out}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command("detect")
    .argument("<inputPath>")
    .option("--out <path>")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (inputPath, opts) => {
      const { detect } = await import("./detect.js");
      const root = resolve(inputPath);
      const scopeSelection = resolveCliScopeSelection(opts);
      const inventory = inspectInputScope(root, scopeSelection);
      const result = detect(root, {
        candidateFiles: inventory.candidateFiles,
        candidateRoot: inventory.scope.git_root ?? root,
        scope: inventory.scope,
      });
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`Detected ${result.total_files} files in ${root}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command("detect-incremental")
    .argument("<inputPath>")
    .option("--manifest <path>", "Path to manifest.json", defaultManifestPath())
    .option("--out <path>")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (inputPath, opts) => {
      const { detectIncremental } = await import("./detect.js");
      const root = resolve(inputPath);
      const scopeSelection = resolveCliScopeSelection(opts);
      const inventory = inspectInputScope(root, scopeSelection);
      const result = detectIncremental(root, resolve(opts.manifest), {
        candidateFiles: inventory.candidateFiles,
        candidateRoot: inventory.scope.git_root ?? root,
        scope: inventory.scope,
      });
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`${result.new_total ?? 0} new/changed file(s) under ${root}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  const scopeProgram = program.command("scope").description("Inspect resolved Graphify input scope");
  scopeProgram
    .command("inspect [path]")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .option("--json", "Print JSON output")
    .action((scopePath = ".", opts) => {
      const root = resolve(scopePath);
      const inventory = inspectInputScope(root, resolveCliScopeSelection(opts));
      printScopeInspection(inventory, { json: opts.json });
    });

  // MCP server
  program
    .command("serve [graph]")
    .description("Start a stdio MCP server for graph.json")
    .action(async (graphPath) => {
      const { serve } = await import("./serve.js");
      await serve(resolveGraphInputPath(graphPath));
    });

  // Watcher
  program
    .command("watch [path]")
    .description("Watch a folder and auto-rebuild graph outputs on code changes")
    .option("--debounce <seconds>", "Wait time before rebuild", "3")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (watchPath, opts) => {
      const { watch } = await import("./watch.js");
      const debounce = Number.parseFloat(opts.debounce);
      const scopeSelection = resolveCliScopeSelection(opts);
      await watch(watchPath ?? ".", Number.isFinite(debounce) ? debounce : 3, {
        scope: scopeSelection.mode,
        scopeSource: scopeSelection.source,
      });
    });

  program
    .command("check-update [path]")
    .description("Report whether .graphify has pending semantic or lifecycle refresh signals")
    .action(async (checkPath = ".") => {
      const { checkUpdate } = await import("./watch.js");
      const result = checkUpdate(checkPath);
      if (result.current) {
        console.log(`[graphify check-update] Graph state looks current for ${resolve(checkPath)}.`);
        return;
      }
      console.log(`[graphify check-update] Pending semantic updates in ${resolve(checkPath)}.`);
      for (const reason of result.reasons) {
        console.log(`[graphify check-update] ${reason}`);
      }
      console.log(`[graphify check-update] ${result.recommendedCommand}`);
    });

  program
    .command("update [path]")
    .description("One-shot code-only graph rebuild")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (updatePath = ".", opts) => {
      if (!existsSync(updatePath)) {
        console.error(`error: path not found: ${updatePath}`);
        process.exit(1);
      }
      const { rebuildCode } = await import("./watch.js");
      const scopeSelection = resolveCliScopeSelection(opts);
      console.log(`Re-extracting code files in ${updatePath} (no LLM needed)...`);
      const ok = await rebuildCode(updatePath, false, {
        scope: scopeSelection.mode,
        scopeSource: scopeSelection.source,
      });
      if (!ok) {
        console.error("Nothing to update or rebuild failed - check output above.");
        process.exit(1);
      }
      console.log("Code graph updated. For doc/paper/image changes run the graphify skill with --update.");
    });

  program
    .command("portable-check [path]")
    .description("Fail if commit-safe .graphify artifacts contain absolute or escaped paths")
    .option("--json", "Print machine-readable JSON")
    .action((checkPath = ".graphify", opts) => {
      const graphifyDir = resolvePortableCheckDir(checkPath);
      if (!existsSync(graphifyDir)) {
        console.error(`error: path not found: ${graphifyDir}`);
        process.exit(1);
      }
      const result = scanPortableGraphifyArtifacts(graphifyDir);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      }
      if (!result.ok) {
        if (!opts.json) {
          console.error(
            `Portable artifact check failed: ${result.issues.length} issue(s) in ${graphifyDir}`,
          );
          for (const issue of result.issues) {
            const location = issue.jsonPath ? `${issue.path}:${issue.jsonPath}` : issue.path;
            console.error(`- ${location}: ${issue.kind}: ${issue.value}`);
          }
        }
        process.exit(1);
      }
      if (!opts.json) {
        const ignored = result.ignoredLocalFiles.length > 0
          ? `; ignored ${result.ignoredLocalFiles.length} local lifecycle file(s)`
          : "";
        console.log(`Portable artifacts OK: ${result.checkedFiles.length} file(s) checked${ignored}`);
      }
    });

  program
    .command("cluster-only [path]")
    .description("Rerun clustering/report/HTML on an existing .graphify/graph.json")
    .action(async (clusterPath = ".") => {
      const root = resolve(clusterPath);
      const paths = resolveGraphifyPaths({ root });
      if (!existsSync(paths.graph)) {
        console.error(`error: no graph found at ${paths.graph} - run /graphify first`);
        process.exit(1);
      }

      const G = makeGraphPortable(loadGraphFromData(JSON.parse(readFileSync(paths.graph, "utf-8"))), root);
      const { cluster, scoreAll } = await import("./cluster.js");
      const { godNodes, surprisingConnections, suggestQuestions } = await import("./analyze.js");
      const { generate } = await import("./report.js");
      const { toJson } = await import("./export.js");
      const { safeToHtml } = await import("./html-export.js");

      const communities = cluster(G);
      const cohesion = scoreAll(G, communities);
      const gods = godNodes(G);
      const surprises = surprisingConnections(G, communities);
      const labels = new Map<number, string>();
      for (const cid of communities.keys()) labels.set(cid, `Community ${cid}`);
      const questions = suggestQuestions(G, communities, labels);
      const detection = {
        files: { code: [], document: [], paper: [], image: [], video: [] },
        total_files: 0,
        total_words: 0,
        needs_graph: true,
        warning: "cluster-only mode - file stats not available",
        skipped_sensitive: [],
        graphifyignore_patterns: 0,
      };
      const report = generate(G, communities, cohesion, labels, gods, surprises, detection, { input: 0, output: 0 }, projectRootLabel(root), questions);
      writeFileSync(paths.report, report, "utf-8");
      toJson(G, communities, paths.graph, { communityLabels: labels });
      safeToHtml(G, communities, paths.html, { communityLabels: labels }, {
        onWarning: (message) => console.warn(message),
      });
      const analysis = {
        communities: Object.fromEntries([...communities.entries()].map(([key, value]) => [String(key), value])),
        cohesion: Object.fromEntries([...cohesion.entries()].map(([key, value]) => [String(key), value])),
        gods,
        surprises,
        labels: Object.fromEntries([...labels.entries()].map(([key, value]) => [String(key), value])),
        questions,
      };
      writeFileSync(paths.scratch.analysis, JSON.stringify(analysis, null, 2), "utf-8");
      console.log(`Done - ${communities.size} communities. GRAPH_REPORT.md, graph.json and graph.html updated.`);
    });

  program
    .command("path")
    .description("Shortest path between two graph nodes")
    .argument("<source>")
    .argument("<target>")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .action(async (sourceLabel, targetLabel, opts) => {
      try {
        const G = loadCliGraph(opts.graph);
        const source = findBestMatchingNode(G, sourceLabel);
        const target = findBestMatchingNode(G, targetLabel);
        if (!source) {
          console.error(`No node matching '${sourceLabel}' found.`);
          process.exit(1);
        }
        if (!target) {
          console.error(`No node matching '${targetLabel}' found.`);
          process.exit(1);
        }
        const shortestPath = await import("graphology-shortest-path/unweighted.js");
        const path = shortestPath.bidirectional(G, source, target) ?? [];
        if (path.length === 0) {
          console.log(`No path found between '${sourceLabel}' and '${targetLabel}'.`);
          return;
        }
        const segments: string[] = [];
        for (let i = 0; i < path.length - 1; i += 1) {
          const nodeId = path[i]!;
          const nextNode = path[i + 1]!;
          const edgeId = G.edge(nodeId, nextNode);
          const edge = edgeId ? G.getEdgeAttributes(edgeId) : {};
          if (i === 0) segments.push((G.getNodeAttribute(nodeId, "label") as string) ?? nodeId);
          const label = (G.getNodeAttribute(nextNode, "label") as string) ?? nextNode;
          const confidence = edge.confidence ? ` [${edge.confidence}]` : "";
          segments.push(`--${edge.relation ?? ""}${confidence}--> ${label}`);
        }
        console.log(`Shortest path (${path.length - 1} hops):\n  ${segments.join(" ")}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command("explain")
    .description("Plain-language details for one graph node")
    .argument("<node>")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .action((nodeLabel, opts) => {
      try {
        const G = loadCliGraph(opts.graph);
        const nodeId = findBestMatchingNode(G, nodeLabel);
        if (!nodeId) {
          console.log(`No node matching '${nodeLabel}' found.`);
          return;
        }
        const attrs = G.getNodeAttributes(nodeId);
        console.log(`Node: ${(attrs.label as string) ?? nodeId}`);
        console.log(`  ID:        ${nodeId}`);
        console.log(`  Source:    ${(attrs.source_file as string) ?? ""} ${(attrs.source_location as string) ?? ""}`.trimEnd());
        console.log(`  Type:      ${(attrs.file_type as string) ?? ""}`);
        console.log(`  Community: ${attrs.community ?? ""}`);
        console.log(`  Degree:    ${G.degree(nodeId)}`);
        const neighbors: string[] = [];
        forEachTraversalNeighbor(G, nodeId, (neighbor) => neighbors.push(neighbor));
        if (neighbors.length > 0) {
          console.log(`\nConnections (${neighbors.length}):`);
          for (const neighbor of neighbors.sort((a, b) => G.degree(b) - G.degree(a)).slice(0, 20)) {
            const edgeId = G.edge(nodeId, neighbor);
            const edge = edgeId ? G.getEdgeAttributes(edgeId) : {};
            const label = (G.getNodeAttribute(neighbor, "label") as string) ?? neighbor;
            console.log(`  --> ${label} [${edge.relation ?? ""}] [${edge.confidence ?? ""}]`);
          }
          if (neighbors.length > 20) console.log(`  ... and ${neighbors.length - 20} more`);
        }
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  program
    .command("add")
    .description("Fetch a URL into ./raw for the next graph update")
    .argument("<url>")
    .option("--dir <path>", "Directory to save fetched content", "./raw")
    .option("--target-dir <path>", "Alias for --dir")
    .option("--author <name>")
    .option("--contributor <name>")
    .action(async (url, opts) => {
      try {
        const { ingest } = await import("./ingest.js");
        const outPath = await ingest(url, resolve(opts.targetDir ?? opts.dir), {
          author: opts.author ?? null,
          contributor: opts.contributor ?? null,
        });
        console.log(`Saved to ${outPath}`);
        console.log("Run the graphify skill with --update to update the graph.");
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // Query command
  program
    .command("summary [graph]")
    .description("Compact first-hop orientation for graph-guided assistant work")
    .option("--graph <path>", "Path to graph.json")
    .option("--top-hubs <n>", "Number of hubs to include", "5")
    .option("--top-communities <n>", "Number of communities to include", "5")
    .option("--nodes-per-community <n>", "Number of representative nodes per community", "3")
    .action(async (graphPath, opts) => {
      const { readFileSync: rf } = await import("node:fs");
      const { resolve: res } = await import("node:path");
      const gp = res(resolveGraphInputPath(opts.graph ?? graphPath));
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const raw = JSON.parse(rf(gp, "utf-8"));
      const G = loadGraphFromData(raw);
      const { buildFirstHopSummary, firstHopSummaryToText } = await import("./summary.js");
      const summary = buildFirstHopSummary(G, {
        topHubs: Number(opts.topHubs),
        topCommunities: Number(opts.topCommunities),
        nodesPerCommunity: Number(opts.nodesPerCommunity),
      });
      console.log(firstHopSummaryToText(summary));
    });

  const flows = program.command("flows").description("Execution flow analysis derived from graph CALLS edges");

  flows
    .command("build")
    .description("Build .graphify/flows.json from graph.json")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--out <path>", "Path to write flows.json", resolveGraphifyPaths().flows)
    .option("--max-depth <n>", "Maximum CALLS depth", "15")
    .option("--include-tests", "Include tests as possible entry points")
    .option("--json", "Print the generated artifact as JSON")
    .action(async (opts) => {
      const gp = resolveGraphInputPath(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const raw = JSON.parse(readFileSync(gp, "utf-8"));
      const G = loadGraphFromData(raw);
      const { createReviewGraphStore } = await import("./review-store.js");
      const { buildFlowArtifact, writeFlowArtifact } = await import("./flows.js");
      const artifact = buildFlowArtifact(createReviewGraphStore(G), {
        graphPath: gp,
        maxDepth: Number(opts.maxDepth),
        includeTests: opts.includeTests === true,
      });
      writeFlowArtifact(artifact, opts.out);
      if (opts.json) {
        console.log(JSON.stringify(artifact, null, 2));
        return;
      }
      console.log(`Execution flows: ${artifact.flows.length} written to ${opts.out}`);
      for (const warning of artifact.warnings) console.warn(warning);
    });

  flows
    .command("list")
    .description("List execution flows from .graphify/flows.json")
    .option("--flows <path>", "Path to flows.json", resolveGraphifyPaths().flows)
    .option("--sort <key>", "criticality|depth|node-count|file-count|name", "criticality")
    .option("--limit <n>", "Maximum flows to show", "50")
    .option("--json", "Print JSON")
    .action(async (opts) => {
      const { flowListToText, listFlows, readFlowArtifact } = await import("./flows.js");
      const artifact = readFlowArtifact(opts.flows);
      const sortBy = ["criticality", "depth", "node-count", "file-count", "name"].includes(String(opts.sort))
        ? String(opts.sort) as "criticality" | "depth" | "node-count" | "file-count" | "name"
        : "criticality";
      const listOptions = {
        sortBy,
        limit: Number(opts.limit),
      };
      if (opts.json) {
        console.log(JSON.stringify(listFlows(artifact, listOptions), null, 2));
        return;
      }
      console.log(flowListToText(artifact, listOptions));
    });

  flows
    .command("get")
    .description("Show execution flow details")
    .argument("<flow-id>")
    .option("--flows <path>", "Path to flows.json", resolveGraphifyPaths().flows)
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--json", "Print JSON")
    .action(async (flowId, opts) => {
      const gp = resolveGraphInputPath(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(readFileSync(gp, "utf-8")));
      const { createReviewGraphStore } = await import("./review-store.js");
      const { flowDetailToText, getFlowById, readFlowArtifact } = await import("./flows.js");
      const detail = getFlowById(readFlowArtifact(opts.flows), flowId, createReviewGraphStore(G));
      if (!detail) {
        console.error(`error: flow not found: ${flowId}`);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(detail, null, 2));
        return;
      }
      console.log(flowDetailToText(detail));
    });

  program
    .command("affected-flows [files...]")
    .description("Find execution flows affected by changed files")
    .option("--flows <path>", "Path to flows.json", resolveGraphifyPaths().flows)
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--json", "Print JSON")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      const gp = resolveGraphInputPath(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      if (!existsSync(opts.flows)) {
        console.error(`error: flow artifact not found: ${opts.flows}. Run graphify flows build first.`);
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(readFileSync(gp, "utf-8")));
      const { createReviewGraphStore } = await import("./review-store.js");
      const { affectedFlowsToText, getAffectedFlows, readFlowArtifact } = await import("./flows.js");
      const result = getAffectedFlows(readFlowArtifact(opts.flows), resolvedChangedFiles, createReviewGraphStore(G));
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(affectedFlowsToText(result));
    });

  program
    .command("review-context [files...]")
    .description("Focused CRG-style review context for changed files")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--detail-level <level>", "minimal|standard", "standard")
    .option("--include-source", "Include capped source snippets")
    .option("--max-depth <n>", "Impact radius depth", "2")
    .option("--max-lines-per-file <n>", "Maximum full-file snippet lines", "200")
    .option("--json", "Print JSON")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      const gp = resolveGraphInputPath(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(readFileSync(gp, "utf-8")));
      const { createReviewGraphStore } = await import("./review-store.js");
      const { buildReviewContext, reviewContextToText } = await import("./review-context.js");
      const result = buildReviewContext(createReviewGraphStore(G), resolvedChangedFiles, {
        detailLevel: opts.detailLevel === "minimal" ? "minimal" : "standard",
        includeSource: opts.includeSource === true,
        maxDepth: Number(opts.maxDepth),
        maxLinesPerFile: Number(opts.maxLinesPerFile),
        repoRoot: ".",
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(reviewContextToText(result));
    });

  program
    .command("detect-changes [files...]")
    .description("CRG-style line-aware risk scoring for changed files")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--flows <path>", "Optional path to flows.json")
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--detail-level <level>", "minimal|standard", "standard")
    .option("--json", "Print JSON")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      const gp = resolveGraphInputPath(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(readFileSync(gp, "utf-8")));
      const { createReviewGraphStore } = await import("./review-store.js");
      const { readFlowArtifact } = await import("./flows.js");
      const { analyzeChanges, detectChangesToMinimal, detectChangesToText } = await import("./detect-changes.js");
      const flowsArtifact = opts.flows && existsSync(opts.flows) ? readFlowArtifact(opts.flows) : null;
      const result = analyzeChanges(createReviewGraphStore(G), resolvedChangedFiles, {
        flows: flowsArtifact,
      });
      const output = opts.detailLevel === "minimal" ? detectChangesToMinimal(result) : result;
      if (opts.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }
      console.log(detectChangesToText(output));
    });

  program
    .command("minimal-context [files...]")
    .description("Compact first-call CRG context and next-tool routing")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--flows <path>", "Optional path to flows.json")
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--task <text>", "Task intent used to route next graph tools", "")
    .option("--json", "Print JSON")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      const gp = resolveGraphInputPath(opts.graph);
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(readFileSync(gp, "utf-8")));
      const { createReviewGraphStore } = await import("./review-store.js");
      const { readFlowArtifact } = await import("./flows.js");
      const { buildMinimalContext, minimalContextToText } = await import("./minimal-context.js");
      const flowsArtifact = opts.flows && existsSync(opts.flows) ? readFlowArtifact(opts.flows) : null;
      const result = buildMinimalContext(createReviewGraphStore(G), {
        changedFiles: resolvedChangedFiles,
        flows: flowsArtifact,
        task: opts.task,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(minimalContextToText(result));
    });

  program
    .command("review-delta [files...]")
    .description("Review-oriented graph impact for changed files")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--max-nodes <n>", "Maximum impacted nodes", "80")
    .option("--max-chains <n>", "Maximum high-risk chains", "8")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      if (resolvedChangedFiles.length === 0) {
        console.log("No changed files found for review-delta.");
        return;
      }
      const { readFileSync: rf } = await import("node:fs");
      const { resolve: res } = await import("node:path");
      const gp = res(resolveGraphInputPath(opts.graph));
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const raw = JSON.parse(rf(gp, "utf-8"));
      const G = loadGraphFromData(raw);
      const { buildReviewDelta, reviewDeltaToText } = await import("./review.js");
      const delta = buildReviewDelta(G, resolvedChangedFiles, {
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
      });
      console.log(reviewDeltaToText(delta));
    });

  program
    .command("review-analysis [files...]")
    .description("Actionable review analysis: blast radius, communities, bridges, test gaps, multimodal safety")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--max-nodes <n>", "Maximum impacted nodes", "120")
    .option("--max-chains <n>", "Maximum high-risk chains", "12")
    .option("--max-communities <n>", "Maximum impacted communities", "8")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      if (resolvedChangedFiles.length === 0) {
        console.log("No changed files found for review-analysis.");
        return;
      }
      const { readFileSync: rf } = await import("node:fs");
      const { resolve: res } = await import("node:path");
      const gp = res(resolveGraphInputPath(opts.graph));
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(rf(gp, "utf-8")));
      const { buildReviewAnalysis, reviewAnalysisToText } = await import("./review-analysis.js");
      const analysis = buildReviewAnalysis(G, resolvedChangedFiles, {
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
        maxCommunities: Number(opts.maxCommunities),
      });
      console.log(reviewAnalysisToText(analysis));
    });

  program
    .command("review-eval")
    .description("Evaluate review-analysis cases against expected impacted files and summary terms")
    .requiredOption("--cases <path>", "JSON file: array of cases or {cases:[...]}")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--default-file-tokens <n>", "Fallback naive token estimate per file", "800")
    .action(async (opts) => {
      const { readFileSync: rf } = await import("node:fs");
      const { resolve: res } = await import("node:path");
      const gp = res(resolveGraphInputPath(opts.graph));
      if (!existsSync(gp)) {
        console.error(`error: graph file not found: ${gp}`);
        process.exit(1);
      }
      const rawCases = JSON.parse(rf(res(opts.cases), "utf-8"));
      const cases = Array.isArray(rawCases) ? rawCases : rawCases.cases;
      if (!Array.isArray(cases)) {
        console.error("error: --cases must contain an array or an object with a cases array");
        process.exit(1);
      }
      const G = loadGraphFromData(JSON.parse(rf(gp, "utf-8")));
      const { evaluateReviewAnalysis, reviewEvaluationToText } = await import("./review-analysis.js");
      const evaluation = evaluateReviewAnalysis(G, cases, {
        defaultFileTokens: Number(opts.defaultFileTokens),
      });
      console.log(reviewEvaluationToText(evaluation));
    });

  program
    .command("recommend-commits [files...]")
    .description("Advisory-only commit grouping for changed files")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--files <csv>", "Comma or newline separated changed files")
    .option("--base <ref>", "Git base ref; when omitted, compare working tree to HEAD")
    .option("--head <ref>", "Git head ref to compare with --base", "HEAD")
    .option("--staged", "Use staged changes only")
    .option("--max-groups <n>", "Maximum commit groups", "6")
    .option("--max-nodes <n>", "Maximum impacted nodes per group", "60")
    .option("--max-chains <n>", "Maximum high-risk chains per group", "4")
    .action(async (files, opts) => {
      const changedFiles = [
        ...files,
        ...splitFiles(opts.files),
      ];
      const resolvedChangedFiles = changedFiles.length > 0
        ? [...new Set(changedFiles)].sort()
        : changedFilesFromGit({ base: opts.base, head: opts.head, staged: opts.staged });
      if (resolvedChangedFiles.length === 0) {
        console.log("No changed files found for recommend-commits.");
        return;
      }

      const { readFileSync: rf } = await import("node:fs");
      const { resolve: res } = await import("node:path");
      const gp = res(resolveGraphInputPath(opts.graph));
      const graphAvailable = existsSync(gp);
      let G;
      if (graphAvailable) {
        G = loadGraphFromData(JSON.parse(rf(gp, "utf-8")));
      } else {
        const { default: Graph } = await import("graphology");
        G = new Graph({ type: "undirected" });
      }
      const paths = resolveGraphifyPaths();
      const { readLifecycleMetadata } = await import("./lifecycle.js");
      const { buildCommitRecommendation, commitRecommendationToText } = await import("./recommend.js");
      const recommendation = buildCommitRecommendation(G, resolvedChangedFiles, {
        lifecycle: readLifecycleMetadata("."),
        needsUpdate: existsSync(paths.needsUpdate),
        graphAvailable,
        maxGroups: Number(opts.maxGroups),
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
      });
      console.log(commitRecommendationToText(recommendation));
    });

  program
    .command("query <question>")
    .description("BFS traversal of graph.json for a question")
    .option("--dfs", "Use depth-first instead of breadth-first")
    .option("--budget <n>", "Cap output at N tokens", "2000")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
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
        const raw = JSON.parse(rf(gp, "utf-8"));
        const G = loadGraphFromData(raw);

        const terms = normalizeSearchText(question).split(/\s+/).filter((t: string) => t.length > 2);
        const scored: [number, string][] = [];
        G.forEachNode((nid: string, data: Record<string, unknown>) => {
          const label = normalizeSearchText((data.label as string) ?? "");
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
            forEachTraversalNeighbor(G, node, (neighbor: string) => {
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
              forEachTraversalNeighbor(G, n, (neighbor: string) => {
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
      const gp = resolveGraphInputPath(graphPath);
      let corpusWords: number | undefined;
      const paths = resolveGraphifyPaths();
      const detectPath = existsSync(paths.scratch.detect)
        ? paths.scratch.detect
        : paths.legacyRootScratch.detect;
      if (existsSync(detectPath)) {
        try {
          const data = JSON.parse(readFileSync(detectPath, "utf-8"));
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
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (opts) => {
      const { rebuildCode } = await import("./watch.js");
      const changedFiles = (process.env.GRAPHIFY_CHANGED ?? "")
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      let clearStale = true;
      if (changedFiles.length > 0) {
        const { CODE_EXTENSIONS } = await import("./detect.js");
        const hasCodeChange = changedFiles.some((p) => CODE_EXTENSIONS.has(extname(p).toLowerCase()));
        if (!hasCodeChange) {
          return;
        }
        clearStale = changedFiles.every((p) => CODE_EXTENSIONS.has(extname(p).toLowerCase()));
      }
      const scopeSelection = resolveCliScopeSelection(opts);
      await rebuildCode(".", false, {
        clearStale,
        scope: scopeSelection.mode,
        scopeSource: scopeSelection.source,
      });
    });

  program
    .command("hook-mark-stale [reason]", { hidden: true })
    .description("Internal: mark graphify lifecycle state stale (called by git hooks)")
    .action(async (reason) => {
      const { markLifecycleStale } = await import("./lifecycle.js");
      markLifecycleStale(".", reason ?? "hook");
    });

  await program.parseAsync();
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
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
