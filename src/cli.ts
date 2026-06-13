/**
 * graphify CLI - `graphify install` sets up the AI coding assistant skill.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, extname, basename } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type Graph from "graphology";
import type {
  DetectionResult,
  Extraction,
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
import { communitiesFromGraph, communityLabelsFromGraph } from "./graph-communities.js";
import { safeExecGit } from "./git.js";
import { safeGitRevParse } from "./git.js";
import { discoverProjectConfig, loadProjectConfig } from "./project-config.js";
import { defaultManifestPath, resolveGraphInputPath, resolveGraphifyPaths } from "./paths.js";
import { normalizeSearchText, scoreSearchText } from "./search.js";
import { makeGraphPortable, projectRootLabel, scanPortableGraphifyArtifacts } from "./portable-artifacts.js";
import { loadOntologyPatchContext } from "./ontology-patch-context.js";
import { persistCommunityLabels, resolveCommunityLabels } from "./community-labels.js";
import type { WikiDescriptionSidecarIndex } from "./wiki-descriptions.js";
import { replaceOrAppendSection } from "./skill-install.js";

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

/**
 * Commander.js accumulator callback for repeatable `--exclude <glob>` flags.
 * Used by `detect`, `detect-incremental`, and `extract` to forward CLI-supplied
 * ignore patterns into `DetectOptions.extraExcludes` (port of upstream PR #947,
 * commit 9e6192a).
 */
function collectExclude(value: string, previous: string[] = []): string[] {
  if (!value) return previous;
  return [...previous, value];
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

function communitiesFromCliGraph(G: Graph): Map<number, string[]> {
  return communitiesFromGraph(G);
}

function communityLabelsFromCliGraph(
  G: Graph,
  communities: Map<number, string[]>,
): Map<number, string> {
  return communityLabelsFromGraph(G, communities);
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

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadWikiDescriptionSidecarIndex(inputPath?: string): WikiDescriptionSidecarIndex | undefined {
  if (!inputPath) return undefined;
  const value = readJson<unknown>(inputPath);
  if (!isJsonRecord(value)) {
    throw new Error("wiki description sidecar index must be a JSON object");
  }
  if (value.schema !== "graphify_wiki_description_index_v1") {
    throw new Error("wiki description sidecar index schema must be graphify_wiki_description_index_v1");
  }
  if (!isJsonRecord(value.nodes)) {
    throw new Error("wiki description sidecar index nodes must be an object");
  }
  if (value.communities !== undefined && !isJsonRecord(value.communities)) {
    throw new Error("wiki description sidecar index communities must be an object when present");
  }
  return value as unknown as WikiDescriptionSidecarIndex;
}

async function loadFreshWikiDescriptionSidecarIndex(
  inputPath: string | undefined,
  graphPath: string,
): Promise<WikiDescriptionSidecarIndex | undefined> {
  const index = loadWikiDescriptionSidecarIndex(inputPath);
  if (!index) return undefined;
  const { selectFreshWikiDescriptions, WIKI_DESCRIPTION_PROMPT_VERSION } = await import("./wiki-descriptions.js");
  const currentGraphHash = graphContentHash(graphPath);
  const { fresh, stale } = selectFreshWikiDescriptions(index, {
    graph_hash: currentGraphHash,
    prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
  });
  if (stale.nodes.length > 0 || stale.communities.length > 0) {
    console.warn(
      `Skipping ${stale.nodes.length} node and ${stale.communities.length} community description(s) ` +
      `that are stale under graph_hash=${currentGraphHash.slice(0, 12)} ` +
      `prompt_version=${WIKI_DESCRIPTION_PROMPT_VERSION}. Re-generate with graphify wiki describe.`,
    );
  }
  return fresh;
}

function writeJson(path: string, value: unknown): void {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Track C-3.5: best-effort loader for the ontology profile used by HTML
 * export visual encoding overrides. Returns undefined if no graphify.yaml
 * project config exists, or if the profile cannot be loaded — this is a
 * cosmetic-only enhancement, so a missing or broken profile must NEVER
 * fail the surrounding HTML export. If `explicitPath` is provided we honor
 * --profile; otherwise we auto-discover graphify.yaml under `root`.
 */
async function tryLoadHtmlOntologyProfile(
  root: string,
  explicitPath?: string,
): Promise<import("./types.js").NormalizedOntologyProfile | undefined> {
  try {
    const { loadOntologyProfile } = await import("./ontology-profile.js");
    if (explicitPath) {
      return loadOntologyProfile(resolve(explicitPath));
    }
    const discovery = discoverProjectConfig(root);
    if (!discovery.found || !discovery.path) return undefined;
    const projectConfig = loadProjectConfig(discovery.path);
    return loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
  } catch {
    return undefined;
  }
}

function parsePositiveIntegerOption(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function graphContentHash(graphPath: string): string {
  return createHash("sha256").update(readFileSync(graphPath)).digest("hex");
}

function parseWikiDescriptionTargets(value: unknown): {
  includeNodeTargets: boolean;
  includeCommunityTargets: boolean;
} {
  const target = String(value ?? "nodes").trim().toLowerCase();
  if (target === "nodes") {
    return { includeNodeTargets: true, includeCommunityTargets: false };
  }
  if (target === "communities") {
    return { includeNodeTargets: false, includeCommunityTargets: true };
  }
  if (target === "all") {
    return { includeNodeTargets: true, includeCommunityTargets: true };
  }
  throw new Error("--targets must be one of: nodes, communities, all");
}

function writeFileAtomic(path: string, content: string): void {
  const tmpPath = `${path}.tmp`;
  try {
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, path);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best effort cleanup; preserve the original write failure.
    }
    throw error;
  }
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

function printOntologyPatchResult(result: {
  valid: boolean;
  issues: Array<{ severity: string; message: string }>;
  changed_files?: Array<{ kind: string; path: string; action: string }>;
  dry_run?: boolean;
}): void {
  console.log(`Ontology patch ${result.valid ? "valid" : "invalid"}`);
  if (result.dry_run !== undefined) console.log(`Dry run: ${result.dry_run}`);
  for (const issue of result.issues) {
    const line = `${issue.severity}: ${issue.message}`;
    if (issue.severity === "warning") console.warn(line);
    else console.log(line);
  }
  for (const file of result.changed_files ?? []) {
    console.log(`${file.action}: ${file.kind} ${file.path}`);
  }
}

function ensureCliExtractionShape(value?: Partial<Extraction> | null): Extraction {
  return {
    nodes: value?.nodes ?? [],
    edges: value?.edges ?? [],
    hyperedges: value?.hyperedges ?? [],
    input_tokens: value?.input_tokens ?? 0,
    output_tokens: value?.output_tokens ?? 0,
  };
}

function mergeCliAstAndSemantic(
  astInput: Partial<Extraction> | null | undefined,
  semanticInput: Partial<Extraction> | null | undefined,
): Extraction {
  const ast = ensureCliExtractionShape(astInput);
  const semantic = ensureCliExtractionShape(semanticInput);
  const mergedNodes: Extraction["nodes"] = [...ast.nodes];
  const seen = new Set(ast.nodes.map((node) => node.id));
  for (const node of semantic.nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    mergedNodes.push(node);
  }
  return {
    nodes: mergedNodes,
    edges: [...ast.edges, ...semantic.edges],
    hyperedges: semantic.hyperedges ?? [],
    input_tokens: (ast.input_tokens ?? 0) + (semantic.input_tokens ?? 0),
    output_tokens: (ast.output_tokens ?? 0) + (semantic.output_tokens ?? 0),
  };
}

function findBestMatchingNode(G: Graph, query: string): string | null {
  const terms = normalizeSearchText(query)
    .split(/\s+/)
    .filter((term) => term.length > 1);
  let bestScore = 0;
  let bestNodeId: string | null = null;
  G.forEachNode((nodeId, data) => {
    const label = (data.label as string) ?? nodeId;
    const source = (data.source_file as string) ?? "";
    const score = scoreSearchText(label, source, terms);
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
  /** Relative path used for the global (home-dir) skill destination. */
  skill_dst: string;
  /**
   * Override relative path for the *project-scoped* skill destination.
   * When absent, `skill_dst` is used for both scopes.
   * Example: OpenCode uses `.config/opencode/...` globally but
   * `.opencode/...` at project scope (upstream fix #1040).
   */
  project_skill_dst?: string;
  claude_md: boolean;
}

export const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
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
    // Global scope: ~/.config/opencode/skills/graphify/SKILL.md (XDG standard path)
    skill_dst: join(".config", "opencode", "skills", "graphify", "SKILL.md"),
    // Project scope: .opencode/skills/graphify/SKILL.md (discoverable by OpenCode)
    // Fix for upstream #1040: the project path was incorrectly using .config/opencode/
    // instead of .opencode/ when --project was passed.
    project_skill_dst: join(".opencode", "skills", "graphify", "SKILL.md"),
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
  kimi: {
    skill_file: "skill.md",
    skill_dst: join(".kimi", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  kiro: {
    skill_file: "skill-kiro.md",
    skill_dst: join(".kiro", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  antigravity: {
    skill_file: "skill.md",
    // Global Antigravity skill dir: ~/.gemini/config/skills/ (port of upstream
    // 9985940 #1079 — was incorrectly ~/.agents/skills/ before this fix).
    skill_dst: join(".gemini", "config", "skills", "graphify", "SKILL.md"),
    // Project-scoped skill stays in .agents/skills/ (the per-project Antigravity dir).
    project_skill_dst: join(".agents", "skills", "graphify", "SKILL.md"),
    claude_md: false,
  },
  "antigravity-windows": {
    skill_file: "skill-windows.md",
    skill_dst: join(".gemini", "config", "skills", "graphify", "SKILL.md"),
    project_skill_dst: join(".agents", "skills", "graphify", "SKILL.md"),
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

function runtimeGlobalSkillPlatformName(platformName: string): string {
  const canonical = canonicalPlatformName(platformName);
  if (canonical === "antigravity" && process.platform === "win32") {
    return "antigravity-windows";
  }
  return canonical;
}

function platformNamesForError(): string {
  return [...Object.keys(PLATFORM_CONFIG), ...Object.keys(PLATFORM_ALIASES)].join(", ");
}

function resolveGlobalSkillDestination(platformName: string): string {
  const canonical = runtimeGlobalSkillPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[canonical];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  if ((canonical === "claude" || canonical === "windows") && claudeConfigDir) {
    return resolve(claudeConfigDir, "skills", "graphify", "SKILL.md");
  }
  return join(homedir(), cfg.skill_dst);
}

function isGraphifyClaudeHook(hook: Record<string, unknown>): boolean {
  const matcher = typeof hook.matcher === "string" ? hook.matcher : "";
  if (matcher !== "Glob|Grep" && matcher !== "Bash" && matcher !== "Read|Glob") {
    return false;
  }
  return JSON.stringify(hook).includes("graphify");
}

const SETTINGS_HOOK = {
  matcher: "Bash",
  hooks: [
    {
      type: "command",
      command:
        '[ -f .graphify/graph.json ] && ' +
        "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"graphify: knowledge graph at .graphify/. For focused questions, run `graphify query \\\"<question>\\\"` (scoped subgraph, usually much smaller than GRAPH_REPORT.md) instead of grepping raw files. Read GRAPH_REPORT.md only for broad architecture context.\"}}' " +
        '|| true',
    },
  ],
};

// Read/Glob PreToolUse hook: nudges the agent to use the graph instead of
// reading source files one by one to answer codebase questions (port of
// upstream 5cc7ec8 #1114).  Fires only when .graphify/graph.json exists and
// the target path looks like a source/doc file outside .graphify/.  Every
// branch fails open so legitimate reads always go through.
const READ_SETTINGS_HOOK = {
  matcher: "Read|Glob",
  hooks: [
    {
      type: "command",
      // Uses npx graphify hook-check to stay in the graphify binary; the
      // real check is a lightweight shell expression: capture stdin, extract
      // file_path/pattern via node, and emit the additionalContext JSON only
      // when a graph exists and the target is a source/doc file outside .graphify/.
      command:
        "HIT=$(node -e \"" +
        "var chunks=[];process.stdin.on('data',function(c){chunks.push(c);});process.stdin.on('end',function(){" +
        "try{" +
        "var d=JSON.parse(Buffer.concat(chunks).toString());" +
        "var t=d.tool_input||d;" +
        "var s=(String(t.file_path||'')+' '+String(t.pattern||'')+String(t.path||'')).toLowerCase().replace(/\\\\\\\\\\\\\\\\/g,'/');" +
        "var exts=['.py','.js','.ts','.tsx','.jsx','.go','.rs','.java','.rb','.c','.h','.cpp','.hpp','.cs','.kt','.swift','.php','.lua','.sh','.md','.rst','.txt','.mdx'];" +
        "if(!s.includes('.graphify/')&&!s.includes('graphify-out/')&&exts.some(function(e){return s.includes(e);})){process.stdout.write('1');}" +
        "}catch(e){}});\" 2>/dev/null || true); " +
        "if [ \"$HIT\" = 1 ] && [ -f .graphify/graph.json ]; then " +
        "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"graphify: knowledge graph at .graphify/. For codebase questions, run `graphify query \\\"<question>\\\"` (scoped subgraph) instead of reading source files one by one. Read raw files to modify specific code or debug.\"}}'; " +
        "fi || true",
    },
  ],
};

const SKILL_REGISTRATION =
  "\n# graphify\n" +
  "- **graphify** (`~/.claude/skills/graphify/SKILL.md`) " +
  "- any input to knowledge graph. Trigger: `/graphify`\n" +
  "When the user types `/graphify`, invoke the Skill tool " +
  'with `skill: "graphify"` before doing anything else.\n';

const PORTABLE_GRAPHIFY_RULE =
  "- Before proposing or committing .graphify artifacts, run `graphify portable-check .graphify`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose `git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update` and `git rm -r --cached .graphify/cache`; never mutate git state without asking";

const CLAUDE_MD_SECTION = `## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when \`.graphify/graph.json\` exists, first run \`graphify query "<question>"\` (or \`graphify path "<A>" "<B>"\` / \`graphify explain "<concept>"\`); these return a scoped subgraph, usually much smaller than \`GRAPH_REPORT.md\` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` first; if tracked legacy artifacts are reported, ask before using the recommended \`git mv -f graphify-out .graphify\` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- Before proposing or committing .graphify artifacts, run \`graphify portable-check .graphify\`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose \`git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update\` and \`git rm -r --cached .graphify/cache\`; never mutate git state without asking
- Before deep graph traversal, prefer \`graphify summary --graph .graphify/graph.json\` for compact first-hop orientation
- For review impact on changed files, use \`graphify review-delta --graph .graphify/graph.json\` instead of generic traversal
- Read \`.graphify/GRAPH_REPORT.md\` only for broad architecture review or when \`query\` / \`path\` / \`explain\` do not surface enough context
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const GEMINI_MD_SECTION = `## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when \`.graphify/graph.json\` exists, first run \`graphify query "<question>"\` (or \`graphify path "<A>" "<B>"\` / \`graphify explain "<concept>"\`); these return a scoped subgraph, usually much smaller than \`GRAPH_REPORT.md\` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` first; if tracked legacy artifacts are reported, ask before using the recommended \`git mv -f graphify-out .graphify\` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- In Gemini CLI, the reliable explicit custom command is \`/graphify ...\`
- If the user asks to build, update, query, path, or explain the graph, use the installed \`/graphify\` custom command or the configured \`graphify\` MCP server instead of ad-hoc file traversal
- Before proposing or committing .graphify artifacts, run \`graphify portable-check .graphify\`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose \`git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update\` and \`git rm -r --cached .graphify/cache\`; never mutate git state without asking
- Before deep graph traversal, prefer \`graphify summary --graph .graphify/graph.json\` or MCP \`first_hop_summary\` for compact first-hop orientation
- For review impact on changed files, use \`graphify review-delta --graph .graphify/graph.json\` or MCP \`review_delta\` instead of generic traversal
- Read \`.graphify/GRAPH_REPORT.md\` only for broad architecture review or when \`query\` / \`path\` / \`explain\` do not surface enough context
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
          'echo "[graphify] Knowledge graph at .graphify/. For focused questions, run graphify query \\"<question>\\" (scoped subgraph, usually much smaller than GRAPH_REPORT.md) instead of grepping raw files. Read GRAPH_REPORT.md only for broad architecture context." && ' +
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
    preview.hooks.push(".claude/settings.json: PreToolUse Bash graphify reminder");
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
      previewPath(projectDir, ".agents/rules/graphify.md"),
      previewPath(projectDir, ".agents/workflows/graphify.md"),
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
    preview.hooks.push(".codex/hooks.json: PreToolUse Bash graphify hook-check");
  } else if (platformName === "opencode") {
    preview.writes.push(previewPath(projectDir, OPENCODE_PLUGIN_ENTRY), previewPath(projectDir, OPENCODE_CONFIG_ENTRY));
    preview.hooks.push(".opencode/opencode.json: tool.execute.before graphify plugin");
  } else {
    preview.notes.push("No platform hook equivalent; AGENTS.md is the always-on mechanism.");
  }
  return preview;
}

export function globalSkillInstallPreview(platformName: string): InstallMutationPreview {
  const requestedPlatformName = canonicalPlatformName(platformName);
  const runtimePlatformName = runtimeGlobalSkillPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[runtimePlatformName];
  const preview = emptyPreview(requestedPlatformName, "install");
  if (!cfg) return preview;
  const skillDst = resolveGlobalSkillDestination(runtimePlatformName);
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

- For codebase or architecture questions, when \`.graphify/graph.json\` exists, first run \`graphify query "<question>"\` (or \`graphify path "<A>" "<B>"\` / \`graphify explain "<concept>"\`); these return a scoped subgraph, usually much smaller than \`GRAPH_REPORT.md\` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` first; if tracked legacy artifacts are reported, ask before using the recommended \`git mv -f graphify-out .graphify\` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- Read \`.graphify/GRAPH_REPORT.md\` only for broad architecture review or when \`query\` / \`path\` / \`explain\` do not surface enough context
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const ANTIGRAVITY_RULE_PATH = join(".agents", "rules", "graphify.md");
const ANTIGRAVITY_WORKFLOW_PATH = join(".agents", "workflows", "graphify.md");
const ANTIGRAVITY_RULE = `---
description: graphify knowledge graph context
---

## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when \`.graphify/graph.json\` exists, first run \`graphify query "<question>"\` (or \`graphify path "<A>" "<B>"\` / \`graphify explain "<concept>"\`); these return a scoped subgraph, usually much smaller than \`GRAPH_REPORT.md\` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run \`graphify migrate-state --dry-run\` before relying on legacy state
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- If the graphify MCP server is active, prefer graph tools like \`query_graph\`, \`get_node\`, and \`shortest_path\` for architecture navigation
- Read \`.graphify/GRAPH_REPORT.md\` only for broad architecture review or when \`query\` / \`path\` / \`explain\` do not surface enough context
- After modifying code files in this session, run \`npx graphify hook-rebuild\` to keep the graph current
`;

const ANTIGRAVITY_WORKFLOW = `---
command: /graphify
description: Turn any folder of files into a navigable knowledge graph
---

# Workflow: graphify

## Steps
Follow the graphify skill installed at ~/.gemini/config/skills/graphify/SKILL.md to run the full TypeScript-backed pipeline.

If no path argument is given, use \`.\` (current directory).
`;

const KIRO_STEERING = `---
inclusion: always
---

graphify: A knowledge graph of this project lives in \`.graphify/\`. For codebase or architecture questions, when \`.graphify/graph.json\` exists, first run \`graphify query "<question>"\` (or \`graphify path "<A>" "<B>"\` / \`graphify explain "<concept>"\`); these return a scoped subgraph, usually much smaller than \`GRAPH_REPORT.md\` or raw grep output. If \`.graphify/wiki/index.md\` exists, navigate it for deep questions. Read \`.graphify/GRAPH_REPORT.md\` only for broad architecture review or when \`query\` / \`path\` / \`explain\` do not surface enough context. Prefer graph structure over raw grep when graph context is current.
`;

const KIRO_STEERING_MARKER = "graphify: A knowledge graph of this project";

const VSCODE_INSTRUCTIONS_SECTION = `## graphify

For codebase or architecture questions, when \`.graphify/graph.json\` exists, first run \`graphify query "<question>"\` (or \`graphify path "<A>" "<B>"\` / \`graphify explain "<concept>"\`); these return a scoped subgraph, usually much smaller than \`GRAPH_REPORT.md\` or raw grep output.
If \`.graphify/wiki/index.md\` exists, navigate it for deep questions.
If \`.graphify/graph.json\` is missing but \`graphify-out/graph.json\` exists, run \`graphify migrate-state --dry-run\` before relying on legacy state.
Read \`.graphify/GRAPH_REPORT.md\` only for broad architecture review or when \`query\` / \`path\` / \`explain\` do not surface enough context.
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
const { checkSemanticCache } = require('@sentropic/graphify');

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
const { saveSemanticCache } = require('@sentropic/graphify');

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
  platformName = runtimeGlobalSkillPlatformName(platformName);
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
  platformName = runtimeGlobalSkillPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[platformName];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }

  const skillDst = resolveGlobalSkillDestination(platformName);
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

export function uninstallAll(projectDir: string = ".", options: { purge?: boolean } = {}): void {
  console.log("Uninstalling graphify from all detected platforms...");

  // skipSkillTree=true: the for-loop below removes all skills including claude.
  claudeUninstall(projectDir, { skipSkillTree: true });
  uninstallClaudeHook(projectDir);
  geminiUninstall(projectDir);
  vscodeUninstall(projectDir);
  cursorUninstall(projectDir);
  kiroUninstall(projectDir);
  antigravityUninstall(projectDir);

  agentsUninstall(projectDir, "codex");
  agentsUninstall(projectDir, "opencode");
  for (const platformName of Object.keys(PLATFORM_CONFIG)) {
    uninstallSkill(platformName);
  }

  if (options.purge === true) {
    for (const relativePath of [".graphify", "graphify-out"]) {
      const target = join(projectDir, relativePath);
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
        console.log(`  ${relativePath}/  ->  deleted (--purge)`);
      } else {
        console.log(`  ${relativePath}/  ->  not found (nothing to purge)`);
      }
    }
  }

  console.log("Done. Run `npm uninstall -g @sentropic/graphify` to remove the package itself.");
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
    "- For codebase or architecture questions, when `.graphify/graph.json` exists, first run `graphify query \"<question>\"` (or `graphify path \"<A>\" \"<B>\"` / `graphify explain \"<concept>\"`); these return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output",
    "- If .graphify/wiki/index.md exists, navigate it instead of reading raw files",
    "- If .graphify/graph.json is missing but graphify-out/graph.json exists, run `graphify migrate-state --dry-run` first; if tracked legacy artifacts are reported, ask before using the recommended `git mv -f graphify-out .graphify` and commit message",
    "- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run the graphify skill with --update when appropriate",
    "- If the user asks to build, update, query, path, or explain the graph, use the installed `graphify` skill instead of ad-hoc file traversal",
    PORTABLE_GRAPHIFY_RULE,
    "- Before deep graph traversal, prefer `graphify summary --graph .graphify/graph.json` for compact first-hop orientation",
    "- For review impact on changed files, use `graphify review-delta --graph .graphify/graph.json` instead of generic traversal",
    "- Read `.graphify/GRAPH_REPORT.md` only for broad architecture review or when `query` / `path` / `explain` do not surface enough context",
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
    const content = readFileSync(rulePath, "utf-8");
    if (content === CURSOR_RULE) {
      console.log(`graphify rule already current at ${resolve(rulePath)} (no change)`);
    } else {
      writeFileSync(rulePath, CURSOR_RULE, "utf-8");
      console.log(`graphify rule refreshed at ${resolve(rulePath)}`);
    }
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

/**
 * Write Antigravity rules and workflow files into `projectDir/.agents/`.
 * Extracted from antigravityInstall so the project-scoped install path can
 * call it too (port of upstream 9a298c5 — `_antigravity_finalize`).
 */
function _antigravityWriteRulesWorkflows(projectDir: string): void {
  const rulePath = join(projectDir, ANTIGRAVITY_RULE_PATH);
  mkdirSync(dirname(rulePath), { recursive: true });
  if (existsSync(rulePath)) {
    const content = readFileSync(rulePath, "utf-8");
    if (content === ANTIGRAVITY_RULE) {
      console.log(`graphify Antigravity rule already current at ${resolve(rulePath)} (no change)`);
    } else {
      writeFileSync(rulePath, ANTIGRAVITY_RULE, "utf-8");
      console.log(`graphify Antigravity rule refreshed at ${resolve(rulePath)}`);
    }
  } else {
    writeFileSync(rulePath, ANTIGRAVITY_RULE, "utf-8");
    console.log(`graphify Antigravity rule written to ${resolve(rulePath)}`);
  }

  const workflowPath = join(projectDir, ANTIGRAVITY_WORKFLOW_PATH);
  mkdirSync(dirname(workflowPath), { recursive: true });
  if (existsSync(workflowPath)) {
    const content = readFileSync(workflowPath, "utf-8");
    if (content === ANTIGRAVITY_WORKFLOW) {
      console.log(`graphify Antigravity workflow already current at ${resolve(workflowPath)} (no change)`);
    } else {
      writeFileSync(workflowPath, ANTIGRAVITY_WORKFLOW, "utf-8");
      console.log(`graphify Antigravity workflow refreshed at ${resolve(workflowPath)}`);
    }
  } else {
    writeFileSync(workflowPath, ANTIGRAVITY_WORKFLOW, "utf-8");
    console.log(`graphify Antigravity workflow written to ${resolve(workflowPath)}`);
  }
}

export function antigravityInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "antigravity"));
  printMutationPreview(globalSkillInstallPreview("antigravity"));
  writeGlobalSkill("antigravity");
  _antigravityWriteRulesWorkflows(projectDir);

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
  if (existsSync(steeringPath)) {
    const content = readFileSync(steeringPath, "utf-8");
    if (content === KIRO_STEERING) {
      console.log("  .kiro/steering/graphify.md  ->  already current");
    } else if (content.includes(KIRO_STEERING_MARKER)) {
      writeFileSync(steeringPath, KIRO_STEERING, "utf-8");
      console.log("  .kiro/steering/graphify.md  ->  graphify steering refreshed");
    } else {
      writeFileSync(steeringPath, KIRO_STEERING, "utf-8");
      console.log("  .kiro/steering/graphify.md  ->  always-on steering written");
    }
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
    const updated = replaceOrAppendSection(content, MD_MARKER, VSCODE_INSTRUCTIONS_SECTION);
    writeFileSync(instructionsPath, updated, "utf-8");
    if (updated === content) {
      console.log(`  .github/copilot-instructions.md  ->  already current (no change)`);
    } else if (content.includes(MD_MARKER)) {
      console.log(`  .github/copilot-instructions.md  ->  graphify section refreshed`);
    } else {
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
  platformName = runtimeGlobalSkillPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[platformName];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }

  const skillDst = resolveGlobalSkillDestination(platformName);
  mkdirSync(dirname(skillDst), { recursive: true });
  writeFileAtomic(skillDst, loadSkillContent(platformName));
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

// ---------------------------------------------------------------------------
// Project-scoped install (`graphify install --project`).
//
// Ported from upstream PR #931 (safishamsi/graphify commit b347492):
// instead of installing the skill into the user's home directory, write it
// into the *current project* (e.g. `<repo>/.claude/skills/graphify/SKILL.md`
// or `<repo>/.agents/skills/graphify/SKILL.md`) so the install travels with
// the repo for all collaborators.
//
// Notes on the TS port:
// - `--project` is the upstream flag name; do not rename.
// - The `windows` platform shares its config with `claude` (per CLAUDE_CONFIG
//   already in PLATFORM_CONFIG); both use `.claude/skills/...` project-scoped.
// - Path collapsing on uninstall is bounded by `projectDir` so we never rmdir
//   anything above the project root.
// ---------------------------------------------------------------------------

const PROJECT_SCOPE_SKILL_PLATFORMS = new Set<string>([
  "claude",
  "windows",
  "codex",
  "opencode",
  "aider",
  "claw",
  "droid",
  "trae",
  "trae-cn",
  "hermes",
  "kimi",
  "copilot",
  "pi",
  "antigravity",
]);

function resolveProjectSkillDestination(platformName: string, projectDir: string): string {
  const canonical = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[canonical];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }
  return join(projectDir, cfg.project_skill_dst ?? cfg.skill_dst);
}

function projectScopeRoot(skillPath: string, projectDir: string): string {
  const absoluteProject = resolve(projectDir);
  const absoluteSkill = resolve(skillPath);
  if (!absoluteSkill.startsWith(absoluteProject + "/") && absoluteSkill !== absoluteProject) {
    return absoluteSkill;
  }
  const relative = absoluteSkill.slice(absoluteProject.length + 1);
  if (!relative) return absoluteSkill;
  const firstSegment = relative.split("/")[0] ?? "";
  return firstSegment ? join(projectDir, firstSegment) : absoluteSkill;
}

function printProjectGitAddHint(paths: string[]): void {
  const unique: string[] = [];
  for (const p of paths) {
    let text = p.replace(/\/+$/, "");
    if (existsSync(p) && statSync(p).isDirectory()) {
      text += "/";
    }
    if (!unique.includes(text)) unique.push(text);
  }
  if (unique.length === 0) return;
  console.log();
  console.log("Project-scoped install. Add to version control:");
  console.log(`  git add ${unique.join(" ")}`);
}

function writeProjectSkill(platformName: string, projectDir: string): string {
  const canonical = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[canonical];
  if (!cfg) {
    console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
    process.exit(1);
  }
  const skillDst = resolveProjectSkillDestination(canonical, projectDir);
  mkdirSync(dirname(skillDst), { recursive: true });
  writeFileAtomic(skillDst, loadSkillContent(canonical));
  writeFileSync(join(dirname(skillDst), ".graphify_version"), VERSION, "utf-8");
  console.log(`  skill installed  ->  ${skillDst}`);
  return skillDst;
}

function removeProjectSkill(platformName: string, projectDir: string): boolean {
  const canonical = canonicalPlatformName(platformName);
  const cfg = PLATFORM_CONFIG[canonical];
  if (!cfg) return false;
  const skillDst = resolveProjectSkillDestination(canonical, projectDir);
  let removed = false;
  if (existsSync(skillDst)) {
    unlinkSync(skillDst);
    console.log(`  skill removed    ->  ${skillDst}`);
    removed = true;
  }
  const versionFile = join(dirname(skillDst), ".graphify_version");
  if (existsSync(versionFile)) {
    unlinkSync(versionFile);
    removed = true;
  }
  // Collapse empty parent dirs, bounded by projectDir.
  const stopAt = resolve(projectDir);
  for (let dir = dirname(skillDst); resolve(dir).startsWith(stopAt) && resolve(dir) !== stopAt; dir = dirname(dir)) {
    try {
      rmdirSync(dir);
    } catch {
      break;
    }
  }
  return removed;
}

function removeProjectClaudeMdRegistration(projectDir: string): void {
  const claudeMd = join(projectDir, ".claude", "CLAUDE.md");
  if (!existsSync(claudeMd)) return;
  const content = readFileSync(claudeMd, "utf-8");
  if (!content.includes("# graphify")) return;
  const cleaned = content.replace(/\n*# graphify\n[\s\S]*?(?=\n# |\s*$)/, "").trimEnd();
  if (cleaned) {
    writeFileSync(claudeMd, cleaned + "\n", "utf-8");
    console.log(`  CLAUDE.md        ->  graphify skill registration removed from ${claudeMd}`);
  } else {
    unlinkSync(claudeMd);
    console.log(`  CLAUDE.md        ->  deleted ${claudeMd}`);
  }
}

function writeProjectClaudeSkillRegistration(projectDir: string): void {
  // Mirrors upstream `_skill_registration(".claude/skills/graphify/SKILL.md")`.
  const projectRegistration =
    "\n# graphify\n" +
    "- **graphify** (`.claude/skills/graphify/SKILL.md`) " +
    "- any input to knowledge graph. Trigger: `/graphify`\n" +
    "When the user types `/graphify`, invoke the Skill tool " +
    'with `skill: "graphify"` before doing anything else.\n';

  const claudeMd = join(projectDir, ".claude", "CLAUDE.md");
  if (existsSync(claudeMd)) {
    const content = readFileSync(claudeMd, "utf-8");
    if (content.includes("graphify")) {
      console.log(`  CLAUDE.md        ->  already registered (no change)`);
    } else {
      writeFileSync(claudeMd, content.trimEnd() + projectRegistration, "utf-8");
      console.log(`  CLAUDE.md        ->  skill registered in ${claudeMd}`);
    }
  } else {
    mkdirSync(dirname(claudeMd), { recursive: true });
    writeFileSync(claudeMd, projectRegistration.trimStart(), "utf-8");
    console.log(`  CLAUDE.md        ->  created at ${claudeMd}`);
  }
}

export function projectInstall(platformName: string, projectDir: string = "."): void {
  const canonical = canonicalPlatformName(platformName);
  if (canonical === "claude" || canonical === "windows") {
    writeProjectSkill(canonical, projectDir);
    writeProjectClaudeSkillRegistration(projectDir);
    claudeInstall(projectDir);
    printProjectGitAddHint([
      projectScopeRoot(resolveProjectSkillDestination(canonical, projectDir), projectDir),
      join(projectDir, "CLAUDE.md"),
    ]);
    return;
  }
  if (canonical === "gemini") {
    // Gemini's "skill" file is a TOML command, not a global SKILL.md. Reuse
    // the project Gemini install path (writes GEMINI.md + .gemini/ MCP config)
    // and additionally drop the project-scoped TOML command into .gemini/.
    const skillDst = writeProjectSkill(canonical, projectDir);
    geminiInstall(projectDir);
    printProjectGitAddHint([
      projectScopeRoot(skillDst, projectDir),
      join(projectDir, "GEMINI.md"),
      join(projectDir, ".gemini"),
    ]);
    return;
  }
  if (canonical === "cursor") {
    cursorInstall(projectDir);
    printProjectGitAddHint([join(projectDir, ".cursor")]);
    return;
  }
  if (canonical === "kiro") {
    kiroInstall(projectDir);
    printProjectGitAddHint([join(projectDir, ".kiro")]);
    return;
  }
  if (canonical === "vscode-copilot-chat") {
    vscodeInstall(projectDir);
    printProjectGitAddHint([join(projectDir, ".github")]);
    return;
  }
  if (["aider", "codex", "opencode", "claw", "droid", "trae", "trae-cn", "hermes"].includes(canonical)) {
    const skillDst = writeProjectSkill(canonical, projectDir);
    agentsInstall(projectDir, canonical);
    const hintPaths = [
      projectScopeRoot(skillDst, projectDir),
      join(projectDir, "AGENTS.md"),
    ];
    if (canonical === "opencode") hintPaths.push(join(projectDir, ".opencode"));
    else if (canonical === "codex") hintPaths.push(join(projectDir, ".codex"));
    printProjectGitAddHint(hintPaths);
    return;
  }
  if (canonical === "antigravity") {
    // Project-scoped Antigravity install: write project SKILL.md + rules +
    // workflows (port of upstream 9a298c5 — project path was skill-only before).
    const skillDst = writeProjectSkill(canonical, projectDir);
    _antigravityWriteRulesWorkflows(projectDir);
    printProjectGitAddHint([
      projectScopeRoot(skillDst, projectDir),
      join(projectDir, ".agents"),
    ]);
    return;
  }
  if (["copilot", "pi", "kimi"].includes(canonical)) {
    const skillDst = writeProjectSkill(canonical, projectDir);
    printProjectGitAddHint([projectScopeRoot(skillDst, projectDir)]);
    return;
  }
  // Fallback: skill-only platforms not enumerated above.
  if (PLATFORM_CONFIG[canonical]) {
    const skillDst = writeProjectSkill(canonical, projectDir);
    printProjectGitAddHint([projectScopeRoot(skillDst, projectDir)]);
    return;
  }
  console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
  process.exit(1);
}

export function projectUninstall(platformName: string, projectDir: string = "."): void {
  const canonical = canonicalPlatformName(platformName);
  if (canonical === "claude" || canonical === "windows") {
    removeProjectSkill(canonical, projectDir);
    removeProjectClaudeMdRegistration(projectDir);
    claudeUninstall(projectDir);
    return;
  }
  if (canonical === "gemini") {
    removeProjectSkill(canonical, projectDir);
    geminiUninstall(projectDir);
    return;
  }
  if (canonical === "cursor") {
    cursorUninstall(projectDir);
    return;
  }
  if (canonical === "kiro") {
    kiroUninstall(projectDir);
    return;
  }
  if (canonical === "vscode-copilot-chat") {
    vscodeUninstall(projectDir);
    return;
  }
  if (["aider", "codex", "opencode", "claw", "droid", "trae", "trae-cn", "hermes"].includes(canonical)) {
    removeProjectSkill(canonical, projectDir);
    agentsUninstall(projectDir, canonical);
    return;
  }
  if (canonical === "antigravity") {
    removeProjectSkill(canonical, projectDir);
    antigravityUninstall(projectDir);
    return;
  }
  if (["copilot", "pi", "kimi"].includes(canonical)) {
    const removed = removeProjectSkill(canonical, projectDir);
    if (!removed) console.log("nothing to remove");
    return;
  }
  if (PLATFORM_CONFIG[canonical]) {
    removeProjectSkill(canonical, projectDir);
    return;
  }
  console.error(`error: unknown platform '${platformName}'. Choose from: ${platformNamesForError()}`);
  process.exit(1);
}

export function projectUninstallAll(projectDir: string = "."): void {
  console.log("Uninstalling project-scoped graphify files...\n");
  for (const platformName of Object.keys(PLATFORM_CONFIG)) {
    projectUninstall(platformName, projectDir);
  }
  for (const platformName of ["gemini", "cursor", "kiro", "vscode-copilot-chat"]) {
    projectUninstall(platformName, projectDir);
  }
  console.log("\nDone.");
}

// Suppress unused-var warning during incremental implementation.
void PROJECT_SCOPE_SKILL_PLATFORMS;

function resolveInstallCommandPlatform(
  positionalPlatform: string | undefined,
  optionPlatform: string | undefined,
): string {
  const defaultPlatform = platform() === "win32" ? "windows" : "claude";
  const positional = positionalPlatform
    ? canonicalPlatformName(positionalPlatform)
    : undefined;
  const option = optionPlatform
    ? canonicalPlatformName(optionPlatform)
    : undefined;

  if (positional && option && positional !== option) {
    console.error("error: specify install platform only once");
    process.exit(1);
  }

  return option ?? positional ?? defaultPlatform;
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
  const filtered = preTool.filter((h) => !isGraphifyClaudeHook(h));

  // Register both hooks idempotently: Bash (grep/find/rg bypass) and
  // Read|Glob (direct file-read bypass, port of upstream 5cc7ec8 #1114).
  filtered.push(SETTINGS_HOOK);
  filtered.push(READ_SETTINGS_HOOK);
  hooks.PreToolUse = filtered;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log(`  .claude/settings.json  ->  PreToolUse hooks registered (Bash search + Read/Glob)`);
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
  const filtered = preTool.filter((h) => !isGraphifyClaudeHook(h));
  if (filtered.length === preTool.length) return;
  (hooks as Record<string, unknown>).PreToolUse = filtered;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log(`  .claude/settings.json  ->  PreToolUse hook removed`);
}

function claudeInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "claude"));
  const target = join(projectDir, "CLAUDE.md");
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    const updated = replaceOrAppendSection(content, MD_MARKER, CLAUDE_MD_SECTION);
    writeFileSync(target, updated, "utf-8");
    if (updated === content) {
      console.log(`graphify section already current in ${resolve(target)}`);
    } else if (content.includes(MD_MARKER)) {
      console.log(`graphify section refreshed in ${resolve(target)}`);
    } else {
      console.log(`graphify section written to ${resolve(target)}`);
    }
  } else {
    writeFileSync(target, CLAUDE_MD_SECTION, "utf-8");
    console.log(`graphify section written to ${resolve(target)}`);
  }
  installClaudeHook(projectDir);
  console.log();
  console.log("Claude Code will now check the knowledge graph before answering");
  console.log("codebase questions and rebuild it after code changes.");
}

function claudeUninstall(projectDir: string = ".", { skipSkillTree = false }: { skipSkillTree?: boolean } = {}): void {
  const target = join(projectDir, "CLAUDE.md");
  if (!existsSync(target)) {
    console.log("No CLAUDE.md found in current directory - nothing to do");
  } else {
    const content = readFileSync(target, "utf-8");
    if (!content.includes(MD_MARKER)) {
      console.log("graphify section not found in CLAUDE.md - nothing to do");
    } else {
      const cleaned = content.replace(/\n*## graphify\n[\s\S]*?(?=\n## |\s*$)/, "").trim();
      if (cleaned) {
        writeFileSync(target, cleaned + "\n", "utf-8");
        console.log(`graphify section removed from ${resolve(target)}`);
      } else {
        const { unlinkSync } = require("node:fs");
        unlinkSync(target);
        console.log(`CLAUDE.md was empty after removal - deleted ${resolve(target)}`);
      }
    }
  }
  uninstallClaudeHook(projectDir);
  // Remove the global skill tree (~/.claude/skills/graphify/) so the whole
  // installed skill is cleaned up, not just the CLAUDE.md section (port of
  // upstream e35b0ac — claude_uninstall was orphaning the skill tree before).
  // skipSkillTree=true is used by uninstallAll which removes all skills via
  // its own loop to avoid double-removal.
  if (!skipSkillTree) {
    uninstallSkill("claude");
  }
}

export function geminiInstall(projectDir: string = "."): void {
  printMutationPreview(platformInstallPreview(projectDir, "gemini"));
  const target = join(projectDir, "GEMINI.md");
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    const updated = replaceOrAppendSection(content, MD_MARKER, GEMINI_MD_SECTION);
    writeFileSync(target, updated, "utf-8");
    if (updated === content) {
      console.log(`graphify section already current in ${resolve(target)}`);
    } else if (content.includes(MD_MARKER)) {
      console.log(`graphify section refreshed in ${resolve(target)}`);
    } else {
      console.log(`graphify section written to ${resolve(target)}`);
    }
  } else {
    writeFileSync(target, GEMINI_MD_SECTION, "utf-8");
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
        command: "graphify hook-check",
      },
    ],
  });
  hooks.PreToolUse = filtered;
  existing.hooks = hooks;
  writeFileSync(hooksPath, JSON.stringify(existing, null, 2), "utf-8");
  console.log(`  .codex/hooks.json  ->  PreToolUse hook registered (graphify hook-check)`);
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
  const target = join(projectDir, "AGENTS.md");
  const section = getAgentsMdSection(platformName);
  if (existsSync(target)) {
    const content = readFileSync(target, "utf-8");
    const updated = replaceOrAppendSection(content, MD_MARKER, section);
    writeFileSync(target, updated, "utf-8");
    if (updated === content) {
      console.log(`graphify section already current in ${resolve(target)}`);
    } else if (content.includes(MD_MARKER)) {
      console.log(`graphify section refreshed in ${resolve(target)}`);
    } else {
      console.log(`graphify section written to ${resolve(target)}`);
    }
  } else {
    writeFileSync(target, section, "utf-8");
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
  if (!existsSync(skillDst)) {
    console.log("  warning: skill dir exists but SKILL.md is missing. Run 'graphify install' to repair.");
    return;
  }
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

  if (argv[0] === "install") {
    for (let i = 1; i < argv.length; i += 1) {
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
    return [platform() === "win32" ? "windows" : "claude"];
  }

  if (argv[1] === "install" || argv[1] === "uninstall") {
    add(argv[0]);
    if (seen.size > 0) {
      return [...seen];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Main CLI
// ---------------------------------------------------------------------------

/**
 * Load a project-local `.env` (current working directory) into process.env so
 * configured LLM credentials (e.g. MISTRAL_API_KEY, used by community labelling
 * and WP11 node descriptions) are picked up without the user having to export
 * them by hand. Non-overriding: an already-set env var (exported shell / CI
 * secret) always wins. Best-effort: a missing or malformed `.env` never breaks
 * the CLI.
 */
function loadProjectDotEnv(): void {
  try {
    if (!existsSync(".env")) return;
    for (const rawLine of readFileSync(".env", "utf-8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // best-effort: never fail the CLI on a .env read/parse issue
  }
}

export async function main(): Promise<void> {
  loadProjectDotEnv();
  // Only warn for the platform(s) relevant to the current command.
  for (const platformName of getPlatformsToCheck(process.argv.slice(2))) {
    const cfg = PLATFORM_CONFIG[platformName];
    if (!cfg) continue;
    checkSkillVersion(resolveGlobalSkillDestination(platformName));
  }

  const program = new Command();
  program
    .name("graphify")
    .description("AI coding assistant skill - turn any folder into a queryable knowledge graph")
    .version(VERSION);

  program
    .command("install")
    .description("Copy skill to platform config dir")
    .argument("[platform]", "Target platform")
    .option("--platform <platform>", "Target platform")
    .option("--project", "Install into the current project (.claude/, .agents/, ...) instead of the user home")
    .action((platformArg: string | undefined, opts) => {
      const chosen = resolveInstallCommandPlatform(platformArg, opts.platform);
      if (opts.project === true) {
        projectInstall(chosen, ".");
      } else {
        installSkill(chosen);
      }
    });

  program
    .command("uninstall")
    .description("Remove graphify from all detected platform integrations")
    .option("--purge", "Also delete .graphify/ and graphify-out/")
    .option("--project", "Remove only project-scoped install files")
    .option("--platform <platform>", "Target platform (project-scoped uninstall)")
    .action((opts) => {
      if (opts.project === true) {
        if (opts.platform) {
          projectUninstall(opts.platform, ".");
        } else {
          projectUninstallAll(".");
        }
        return;
      }
      uninstallAll(".", { purge: opts.purge === true });
    });

  // Platform-specific install/uninstall commands
  for (const cmd of ["claude"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install")
      .description(`Write graphify section to CLAUDE.md + PreToolUse hook`)
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("claude", ".");
        else claudeInstall();
      });
    sub.command("uninstall")
      .description(`Remove graphify section from CLAUDE.md + PreToolUse hook`)
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("claude", ".");
        else claudeUninstall();
      });
  }

  for (const cmd of ["gemini"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install")
      .description("Write graphify section to GEMINI.md + project MCP config")
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("gemini", ".");
        else geminiInstall();
      });
    sub.command("uninstall")
      .description("Remove graphify section from GEMINI.md + project MCP config")
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("gemini", ".");
        else geminiUninstall();
      });
  }

  {
    const sub = program.command("cursor").description("cursor skill management");
    sub.command("install")
      .description("Write .cursor/rules/graphify.mdc")
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("cursor", ".");
        else cursorInstall();
      });
    sub.command("uninstall")
      .description("Remove .cursor/rules/graphify.mdc")
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("cursor", ".");
        else cursorUninstall();
      });
  }

  {
    const sub = program.command("copilot").description("copilot skill management");
    sub.command("install")
      .description("Copy graphify skill to ~/.copilot/skills")
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("copilot", ".");
        else installSkill("copilot");
      });
    sub.command("uninstall")
      .description("Remove graphify skill from ~/.copilot/skills")
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("copilot", ".");
        else uninstallSkill("copilot");
      });
  }

  {
    const sub = program.command("vscode").description("VS Code Copilot Chat skill management");
    sub.command("install")
      .description("Configure VS Code Copilot Chat skill + instructions")
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("vscode-copilot-chat", ".");
        else vscodeInstall();
      });
    sub.command("uninstall")
      .description("Remove VS Code Copilot Chat configuration")
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("vscode-copilot-chat", ".");
        else vscodeUninstall();
      });
  }

  {
    const sub = program.command("kiro").description("Kiro skill management");
    sub.command("install")
      .description("Write .kiro skill + always-on steering file")
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("kiro", ".");
        else kiroInstall();
      });
    sub.command("uninstall")
      .description("Remove .kiro skill + steering file")
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("kiro", ".");
        else kiroUninstall();
      });
  }

  {
    const sub = program.command("antigravity").description("Google Antigravity skill management");
    sub.command("install")
      .description("Write .agents rules/workflow + global skill")
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) projectInstall("antigravity", ".");
        else antigravityInstall();
      });
    sub.command("uninstall")
      .description("Remove .agents rules/workflow + global skill")
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) projectUninstall("antigravity", ".");
        else antigravityUninstall();
      });
  }

  for (const cmd of ["aider", "codex", "opencode", "claw", "droid", "trae", "trae-cn", "hermes"]) {
    const sub = program.command(cmd).description(`${cmd} skill management`);
    sub.command("install")
      .description(
        cmd === "codex"
          ? "Write graphify section to AGENTS.md + PreToolUse hook"
          : cmd === "opencode"
            ? "Write graphify section to AGENTS.md + tool.execute.before plugin"
            : "Write graphify section to AGENTS.md",
      )
      .option("--project", "Install into the current project")
      .action((opts) => {
        if (opts.project === true) {
          projectInstall(cmd, ".");
          return;
        }
        if (cmd === "hermes") installSkill("hermes");
        agentsInstall(".", cmd);
      });
    sub.command("uninstall")
      .description(
        cmd === "codex"
          ? "Remove graphify section from AGENTS.md + PreToolUse hook"
          : cmd === "opencode"
            ? "Remove graphify section from AGENTS.md + plugin"
            : "Remove graphify section from AGENTS.md",
      )
      .option("--project", "Remove only project-scoped install files")
      .action((opts) => {
        if (opts.project === true) {
          projectUninstall(cmd, ".");
          return;
        }
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

  // WP9 agent-stats: per-agent stats derived from agentic CLI transcripts.
  // Attribution comes from SESSION EVIDENCE (commit shas the session printed,
  // h2a registry identity, worktree×branch×time), never from git authorship.
  function resolveAgentStatsRepoRoot(): string {
    // Transcripts and the h2a registry key off the MAIN repository checkout, not
    // a per-worktree path. Derive the main worktree from the common git dir.
    const commonDir = safeGitRevParse(".", ["--git-common-dir"]);
    if (commonDir) {
      const abs = resolve(".", commonDir);
      // <repo>/.git → <repo>
      const root = abs.replace(/\/\.git\/?$/, "");
      if (root && root !== abs) return root;
      // Bare/linked layouts: fall back to toplevel.
    }
    const top = safeGitRevParse(".", ["--show-toplevel"]);
    return top ?? resolve(".");
  }

  const agentStats = program
    .command("agent-stats")
    .description("Per-agent stats from agentic CLI transcripts (evidence-based attribution, not git authorship)");
  agentStats
    .option("--json", "Emit JSON (alias for --format json)")
    .option("--format <fmt>", "Output format: text | json | md", "text")
    .action(async (opts) => {
      const { computeAgentStats, formatStatsTable, buildReport, formatReportMarkdown } = await import(
        "./agent-stats/index.js"
      );
      const repoRoot = resolveAgentStatsRepoRoot();
      const result = computeAgentStats(repoRoot);
      const format = opts.json ? "json" : opts.format;
      if (format === "json") {
        // Stable schema graphify.agent-stats/v1 — see src/agent-stats/report.ts.
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
    .action(async (opts) => {
      const { computeAgentStats, buildReport, filterReportAgents, formatReportMarkdown, formatReportText } =
        await import("./agent-stats/index.js");
      const repoRoot = resolveAgentStatsRepoRoot();
      const report = filterReportAgents(buildReport(computeAgentStats(repoRoot)), opts.agent);
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
    .action(async (opts) => {
      const { syncAgentStats } = await import("./agent-stats/index.js");
      const repoRoot = resolveAgentStatsRepoRoot();
      const result = syncAgentStats({ repoRoot, full: Boolean(opts.full) });
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
    .action(async (opts) => {
      const { listSessions, formatSessionsTable, buildSessionsReport } = await import("./agent-stats/index.js");
      const repoRoot = resolveAgentStatsRepoRoot();
      const { facts, instances } = listSessions(repoRoot, {
        agent: opts.agent,
        branch: opts.branch,
        since: opts.since,
      });
      if (opts.json || opts.format === "json") {
        // Stable schema graphify.agent-stats.sessions/v1 — see report.ts.
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
    .action(async (trackItemId, opts) => {
      const { wpAgentStats, formatWpView } = await import("./agent-stats/index.js");
      const repoRoot = resolveAgentStatsRepoRoot();
      const result = wpAgentStats(repoRoot, trackItemId, { skipPrMerges: opts.pr === false });
      if (opts.json) {
        console.log(JSON.stringify({
          item: result.item,
          links: result.links,
          sessions: result.sessions.map((s) => ({ factId: s.fact.factId, agentId: s.agentId, rule: s.rule })),
          evidenced: result.evidenced.map((s) => ({ factId: s.fact.factId, agentId: s.agentId, via: s.via })),
          mismatch: result.mismatch,
          rollup: result.rollup,
        }, null, 2));
        return;
      }
      console.log(formatWpView(result, trackItemId));
    });

  function registerPrCommands(name: "pr" | "prs"): void {
    program.command(`${name} [selector]`)
      .description("Inspect local GitHub pull requests through gh and git worktree data")
      .option("--limit <n>", "Maximum PRs to list", String(30))
      .option("--state <state>", "PR state for list/conflicts/worktrees", "open")
      .action(async (selector: string | undefined, opts) => {
        const {
          formatPrWorktrees,
          formatPullRequestConflicts,
          formatPullRequestDetails,
          formatPullRequestList,
          getPullRequest,
          listConflictingPullRequests,
          listPrWorktrees,
          listPullRequests,
        } = await import("./pr.js");
        const limit = parsePositiveIntegerOption(opts.limit, "--limit") ?? 30;
        const state = opts.state;
        const command = selector ?? "list";
        if (command === "list") {
          console.log(formatPullRequestList(listPullRequests({ limit, state })));
          return;
        }
        if (command === "conflicts") {
          console.log(formatPullRequestConflicts(listConflictingPullRequests({ limit, state })));
          return;
        }
        if (command === "worktrees") {
          console.log(formatPrWorktrees(listPrWorktrees({ limit, state })));
          return;
        }
        const parsedNumber = Number.parseInt(command, 10);
        if (!Number.isFinite(parsedNumber) || String(parsedNumber) !== command || parsedNumber <= 0) {
          console.error("error: PR selector must be one of list, conflicts, worktrees, or a positive PR number");
          process.exit(1);
        }
        console.log(formatPullRequestDetails(getPullRequest(parsedNumber)));
      });
  }

  registerPrCommands("pr");
  registerPrCommands("prs");

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
    .command("discover")
    .description("Sample profile inputs and write assistant discovery proposals instructions")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--out <path>", "Discovery sample JSON output path")
    .requiredOption("--prompt-out <path>", "Discovery prompt markdown output path")
    .option("--max-files <n>", "Maximum semantic files to sample")
    .option("--max-chars-per-file <n>", "Maximum excerpt characters per sampled file")
    .option("--max-registry-records <n>", "Maximum records sampled per registry")
    .option("--json", "Print JSON summary")
    .action(async (opts) => {
      const { buildProfileDiscoveryPrompt } = await import("./profile-prompts.js");
      const {
        buildOntologyDiscoverySample,
        loadOntologyDiscoveryContext,
        writeOntologyDiscoverySample,
      } = await import("./ontology-discovery.js");
      const context = loadOntologyDiscoveryContext(opts.profileState);
      const sample = buildOntologyDiscoverySample(context, {
        ...(opts.maxFiles ? { maxFiles: Number.parseInt(opts.maxFiles, 10) } : {}),
        ...(opts.maxCharsPerFile ? { maxCharsPerFile: Number.parseInt(opts.maxCharsPerFile, 10) } : {}),
        ...(opts.maxRegistryRecords ? { maxRegistryRecords: Number.parseInt(opts.maxRegistryRecords, 10) } : {}),
      });
      writeOntologyDiscoverySample(opts.out, sample);
      mkdirSync(dirname(resolve(opts.promptOut)), { recursive: true });
      writeFileSync(resolve(opts.promptOut), buildProfileDiscoveryPrompt(context, sample), "utf-8");
      if (opts.json) {
        console.log(JSON.stringify({ sample: resolve(opts.out), prompt: resolve(opts.promptOut), sample_hash: sample.sample_hash }, null, 2));
      } else {
        console.log(`Profile discovery sample written to ${resolve(opts.out)}`);
        console.log(`Profile discovery prompt written to ${resolve(opts.promptOut)}`);
      }
    });

  profile
    .command("discovery-diff")
    .description("Validate assistant discovery proposals and emit a reviewable profile diff")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--proposals <path>", "Discovery proposals JSON")
    .requiredOption("--out <path>", "Profile diff JSON output path")
    .requiredOption("--report <path>", "Profile diff markdown report path")
    .option("--sample <path>", "Discovery sample JSON for evidence_ref validation")
    .option("--json", "Print JSON diff")
    .action(async (opts) => {
      const {
        buildOntologyDiscoveryDiff,
        loadOntologyDiscoveryContext,
        ontologyDiscoveryDiffToMarkdown,
        writeOntologyDiscoveryDiff,
      } = await import("./ontology-discovery.js");
      const context = loadOntologyDiscoveryContext(opts.profileState);
      const proposals = readJson<import("./ontology-discovery.js").OntologyDiscoveryProposalsFile>(opts.proposals);
      const sample = opts.sample ? readJson<import("./ontology-discovery.js").OntologyDiscoverySample>(opts.sample) : undefined;
      const diff = buildOntologyDiscoveryDiff(context.profile, proposals, sample);
      writeOntologyDiscoveryDiff(opts.out, diff);
      mkdirSync(dirname(resolve(opts.report)), { recursive: true });
      writeFileSync(resolve(opts.report), ontologyDiscoveryDiffToMarkdown(diff), "utf-8");
      if (opts.json) {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(`Profile discovery diff written to ${resolve(opts.out)}`);
        console.log(`Profile discovery report written to ${resolve(opts.report)}`);
      }
      if (!diff.valid) process.exit(1);
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
    .option("--descriptions <path>", "Path to wiki description sidecar index JSON")
    .action(async (opts) => {
      const { compileOntologyOutputs } = await import("./ontology-output.js");
      const context = loadCliProfileContext(opts.profileState);
      const descriptions = loadWikiDescriptionSidecarIndex(opts.descriptions);
      const result = compileOntologyOutputs({
        outputDir: resolve(opts.outDir),
        extraction: readJson(opts.input),
        profile: context.profile,
        config: context.profile.outputs.ontology,
        ...(descriptions ? { descriptions } : {}),
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

  profile
    .command("build [path]")
    .description(
      "Chain non-LLM profile steps: validate -> dataprep -> ontology-output (only if an extraction JSON already exists). " +
      "Never runs semantic extraction (LLM-backed); prints the exact next command to run for that step.",
    )
    .option("--config <path>", "Explicit graphify.yaml path")
    .option("--out-dir <path>", "State output directory relative to root or absolute")
    .option("--extraction <path>", "Override extraction JSON path used by the ontology-output step")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (profilePath = ".", opts) => {
      const root = resolve(profilePath);
      if (!existsSync(root)) {
        console.error(`error: path not found: ${root}`);
        process.exit(1);
      }
      const configPath = opts.config
        ? resolve(opts.config)
        : discoverProjectConfig(root).path;
      if (!configPath) {
        console.error(
          `error: no graphify project config found under ${root}. ` +
          `Create graphify.yaml (or .graphify/config.yaml) first, or pass --config <path>.`,
        );
        process.exit(1);
      }

      const { loadOntologyProfile } = await import("./ontology-profile.js");
      const { runConfiguredDataprep } = await import("./configured-dataprep.js");
      const { compileOntologyOutputs } = await import("./ontology-output.js");

      // Step 1 - validate / normalize project config + ontology profile (no LLM)
      const projectConfig = loadProjectConfig(configPath);
      const ontologyProfile = loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
      console.log(`[profile build] validate: profile ${ontologyProfile.id} (v${ontologyProfile.version})`);

      // Step 2 - dataprep (deterministic: detection + PDF/transcript prep + registries)
      const scopeSelection = resolveConfiguredInputScopeSelection(projectConfig, opts);
      const dataprepResult = await runConfiguredDataprep(root, {
        ...(opts.config ? { configPath: resolve(opts.config) } : {}),
        ...(opts.outDir ? { stateDir: opts.outDir } : {}),
        scope: scopeSelection.mode,
        scopeSource: scopeSelection.source,
      });
      console.log(
        `[profile build] dataprep: ${dataprepResult.semanticDetection.total_files} semantic file(s), ` +
        `${dataprepResult.registryExtraction.nodes.length} registry node(s)`,
      );

      // Step 3 - ontology-output (only if an extraction already exists; semantic extraction is LLM-backed and stays explicit)
      const ontologyConfig = ontologyProfile.outputs.ontology;
      const extractionCandidate = opts.extraction
        ? resolve(opts.extraction)
        : dataprepResult.paths.profile.registryExtraction;
      const usingRegistryFallback = !opts.extraction;
      const ontologyOutputDir = dataprepResult.paths.ontologyOutput.dir;
      let ontologyRan = false;
      if (ontologyConfig.enabled && existsSync(extractionCandidate)) {
        const extraction = JSON.parse(readFileSync(extractionCandidate, "utf-8"));
        const result = compileOntologyOutputs({
          outputDir: ontologyOutputDir,
          extraction,
          profile: ontologyProfile,
          config: ontologyConfig,
        });
        if (result.enabled) {
          ontologyRan = true;
          const sourceLabel = usingRegistryFallback ? "registry-only extraction" : extractionCandidate;
          console.log(
            `[profile build] ontology-output: ${result.nodeCount} node(s), ${result.relationCount} relation(s), ` +
            `${result.wikiPageCount} wiki page(s) (source: ${sourceLabel})`,
          );
        }
      } else if (ontologyConfig.enabled) {
        console.log(
          `[profile build] ontology-output: skipped (no extraction JSON at ${extractionCandidate})`,
        );
      } else {
        console.log(`[profile build] ontology-output: disabled by profile config`);
      }

      // Final hint - never silently chain into semantic extraction (LLM cost)
      const semanticFiles = dataprepResult.semanticDetection.total_files;
      console.log("");
      console.log("[profile build] Done (non-LLM steps only).");
      if (semanticFiles > 0) {
        const relRoot = profilePath === "." ? "." : profilePath;
        console.log(
          `Next step (LLM, opt-in): run semantic extraction explicitly, for example:\n` +
          `  graphify extract ${relRoot} --semantic <extraction.json>\n` +
          `or, for a direct backend (costs tokens):\n` +
          `  graphify extract ${relRoot} --backend anthropic|openai|gemini|mistral|cohere|ollama\n` +
          `Then rerun: graphify profile ontology-output --profile-state ${dataprepResult.paths.profile.state} --input <extraction.json> --out-dir ${ontologyOutputDir}`,
        );
      } else if (!ontologyRan && ontologyConfig.enabled) {
        console.log(
          `No corpus files detected for semantic extraction. Review inputs.corpus in ${configPath}.`,
        );
      }
    });

  const ontology = program.command("ontology").description("Ontology lifecycle and reconciliation commands");
  ontology
    .command("candidates")
    .description("Generate a deterministic ontology reconciliation candidate queue")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--out <path>", "Candidate queue JSON output path")
    .option("--json", "Print JSON result")
    .action(async (opts) => {
      const {
        generateOntologyReconciliationCandidates,
        writeOntologyReconciliationCandidates,
      } = await import("./ontology-reconciliation.js");
      const context = loadOntologyPatchContext(opts.profileState);
      const queue = generateOntologyReconciliationCandidates(context);
      writeOntologyReconciliationCandidates(opts.out, queue);
      if (opts.json) {
        console.log(JSON.stringify(queue, null, 2));
      } else {
        console.log(`Ontology reconciliation candidates: ${queue.candidate_count} written to ${resolve(opts.out)}`);
      }
    });

  ontology
    .command("decision-log")
    .description("Preview ontology reconciliation decision logs without mutating files")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .option("--source <source>", "Decision source: authoritative, audit, or both")
    .option("--status <status>", "Patch status filter: applied, rejected, or all")
    .option("--operation <operation>", "Patch operation filter")
    .option("--node-id <id>", "Filter decisions touching a node id")
    .option("--from <value>", "Filter by from/source id or status")
    .option("--to <value>", "Filter by to/target id or status")
    .option("--limit <n>", "Maximum records to return")
    .option("--offset <n>", "Records to skip")
    .option("--json", "Print JSON result")
    .action(async (opts) => {
      const { previewOntologyDecisionLog } = await import("./ontology-reconciliation-api.js");
      const context = loadOntologyPatchContext(opts.profileState);
      const result = previewOntologyDecisionLog(context, {
        ...(opts.source ? { source: opts.source } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.operation ? { operation: opts.operation } : {}),
        ...(opts.nodeId ? { node_id: opts.nodeId } : {}),
        ...(opts.from ? { from: opts.from } : {}),
        ...(opts.to ? { to: opts.to } : {}),
        ...(opts.limit ? { limit: Number.parseInt(opts.limit, 10) } : {}),
        ...(opts.offset ? { offset: Number.parseInt(opts.offset, 10) } : {}),
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Ontology decision log: ${result.total} record(s)`);
        for (const item of result.items) {
          const patch = item.patch as { id?: unknown; operation?: unknown; status?: unknown };
          console.log(`- ${item.source}: ${String(patch.id ?? "(no id)")} ${String(patch.operation ?? "")} ${String(patch.status ?? "")}`.trimEnd());
        }
        for (const issue of result.issues) console.warn(`${issue.severity}: ${issue.message}`);
      }
    });

  const ontologyPatch = ontology.command("patch").description("Validate and apply ontology reconciliation patches");
  ontologyPatch
    .command("validate")
    .description("Validate an ontology patch without mutating files")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--patch <path>", "Ontology patch JSON")
    .option("--json", "Print JSON result")
    .action(async (opts) => {
      const { validateOntologyPatch } = await import("./ontology-patch.js");
      const context = loadOntologyPatchContext(opts.profileState);
      const result = validateOntologyPatch(readJson(opts.patch), context);
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else printOntologyPatchResult(result);
      if (!result.valid) process.exit(1);
    });

  ontologyPatch
    .command("apply")
    .description("Dry-run or write-apply an ontology patch through configured authoritative paths")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--patch <path>", "Ontology patch JSON")
    .option("--dry-run", "Preview changed files without mutating them")
    .option("--write", "Append to configured authoritative decision logs and local audit logs")
    .option("--json", "Print JSON result")
    .action(async (opts) => {
      const { applyOntologyPatch } = await import("./ontology-patch.js");
      const context = loadOntologyPatchContext(opts.profileState);
      const result = applyOntologyPatch(readJson(opts.patch), context, {
        dryRun: opts.dryRun === true,
        write: opts.write === true,
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else printOntologyPatchResult(result);
      if (!result.valid) process.exit(1);
    });

  ontology
    .command("serve")
    .description("Start an ontology MCP server; write tools require explicit --write")
    .requiredOption("--config <path>", "Graphify project config path")
    .option("--write", "Enable ontology mutation tools")
    .option("--graph <path>", "Graph JSON path; defaults to <state_dir>/graph.json")
    .action(async (opts) => {
      const projectConfig = loadProjectConfig(resolve(opts.config));
      const profileStatePath = join(projectConfig.outputs.state_dir, "profile", "profile-state.json");
      const graphPath = opts.graph ? resolve(opts.graph) : join(projectConfig.outputs.state_dir, "graph.json");
      if (!existsSync(profileStatePath)) {
        console.error(`error: profile state not found: ${profileStatePath}. Run graphify profile dataprep first.`);
        process.exit(1);
      }
      const { serve } = await import("./serve.js");
      await serve(graphPath, undefined, {
        ontology: {
          write: opts.write === true,
          profileStatePath,
        },
      });
    });

  ontology
    .command("studio")
    .description("Start a local ontology reconciliation studio API; --write enables patch mutation routes (loopback only)")
    .requiredOption("--config <path>", "Graphify project config path")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option("--port <port>", "Port to bind; defaults to an ephemeral port")
    .option("--write", "Enable POST /api/ontology/patch/{validate,dry-run,apply} routes (loopback only)")
    .option("--token <token>", "Bearer token for write routes (default: random hex24 generated at startup)")
    .action(async (opts) => {
      const projectConfig = loadProjectConfig(resolve(opts.config));
      const profileStatePath = join(projectConfig.outputs.state_dir, "profile", "profile-state.json");
      if (!existsSync(profileStatePath)) {
        console.error(`error: profile state not found: ${profileStatePath}. Run graphify profile dataprep first.`);
        process.exit(1);
      }
      const { startOntologyStudioServer } = await import("./ontology-studio.js");
      try {
        const started = await startOntologyStudioServer({
          profileStatePath,
          host: opts.host,
          ...(opts.port ? { port: Number.parseInt(opts.port, 10) } : {}),
          ...(opts.write ? { write: true } : {}),
          ...(opts.token ? { token: String(opts.token) } : {}),
        });
        if (started.writeEnabled) {
          console.log(`Ontology studio (write-enabled) listening at ${started.url}`);
          console.log(`  Bearer token: ${started.token}`);
          console.log(`  POST routes: /api/ontology/patch/{validate,dry-run,apply}`);
          console.log(`  Send: Authorization: Bearer ${started.token}`);
        } else {
          console.log(`Ontology studio read-only API listening at ${started.url}`);
        }
        const { resolveStudioAppDir } = await import("./studio-assets.js");
        if (resolveStudioAppDir()) {
          console.log(`  Svelte studio SPA: ${started.url}/studio/`);
        } else {
          console.log(`  Svelte studio SPA: not built (run \`npm --prefix studio run build\`)`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`error: ${message}`);
        process.exit(1);
      }
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
    .option(
      "--exclude <pattern>",
      "Extra .graphifyignore-style pattern to skip (repeatable; port of upstream PR #947)",
      collectExclude,
      [] as string[],
    )
    .action(async (inputPath, opts) => {
      const { detect } = await import("./detect.js");
      const root = resolve(inputPath);
      const scopeSelection = resolveCliScopeSelection(opts);
      const inventory = inspectInputScope(root, scopeSelection);
      const result = detect(root, {
        candidateFiles: inventory.candidateFiles,
        candidateRoot: inventory.scope.git_root ?? root,
        scope: inventory.scope,
        extraExcludes: Array.isArray(opts.exclude) ? opts.exclude : [],
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
    .option(
      "--exclude <pattern>",
      "Extra .graphifyignore-style pattern to skip (repeatable; port of upstream PR #947)",
      collectExclude,
      [] as string[],
    )
    .action(async (inputPath, opts) => {
      const { detectIncremental } = await import("./detect.js");
      const root = resolve(inputPath);
      const scopeSelection = resolveCliScopeSelection(opts);
      const inventory = inspectInputScope(root, scopeSelection);
      const result = detectIncremental(root, resolve(opts.manifest), {
        candidateFiles: inventory.candidateFiles,
        candidateRoot: inventory.scope.git_root ?? root,
        scope: inventory.scope,
        extraExcludes: Array.isArray(opts.exclude) ? opts.exclude : [],
      });
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`${result.new_total ?? 0} new/changed file(s) under ${root}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command("extract")
    .description("Headless extraction for CI/scripts using AST plus optional semantic JSON or direct LLM backend")
    .argument("<inputPath>")
    .option("--semantic <path>", "Path to a provided semantic extraction JSON to merge")
    .option("--out <path>", "Output workspace root for the generated .graphify state")
    .option("--backend <name>", "Direct semantic backend: anthropic, openai, gemini, mistral, cohere, ollama, or claude-cli (no API key; writes instructions for the assistant skill)")
    .option("--model <id>", "Direct backend model override")
    .option("--concurrency <n>", "Direct backend semantic chunk concurrency", "4")
    .option("--token-budget <n>", "Approximate direct backend token budget per semantic chunk", "60000")
    .option("--no-cluster", "Write the raw merged extraction and skip graph clustering/reporting")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .option(
      "--exclude <pattern>",
      "Extra .graphifyignore-style pattern to skip (repeatable; port of upstream PR #947)",
      collectExclude,
      [] as string[],
    )
    .action(async (inputPath, opts) => {
      try {
        const root = resolve(inputPath);
        if (!existsSync(root)) {
          console.error(`error: path not found: ${root}`);
          process.exit(1);
        }

        const outputRoot = resolve(opts.out ?? root);
        const paths = resolveGraphifyPaths({ root: outputRoot });
        mkdirSync(paths.stateDir, { recursive: true });

        const scopeSelection = resolveCliScopeSelection(opts, "all");
        const inventory = inspectInputScope(root, scopeSelection);
        const [{ detect, saveManifest }, { extractWithDiagnostics }, { makeDetectionPortable, makeExtractionPortable }] = await Promise.all([
          import("./detect.js"),
          import("./extract.js"),
          import("./portable-artifacts.js"),
        ]);

        console.log(`[graphify extract] scanning ${root}`);
        const rawDetection = detect(root, {
          candidateFiles: inventory.candidateFiles,
          candidateRoot: inventory.scope.git_root ?? root,
          scope: inventory.scope,
          extraExcludes: Array.isArray(opts.exclude) ? opts.exclude : [],
        });
        const originalDocumentFiles = [...(rawDetection.files.document ?? [])];

        const { GOOGLE_WORKSPACE_EXTENSIONS: GWS_EXTENSIONS, googleWorkspaceEnabled, convertGoogleWorkspaceFile } = await import("./google-workspace.js");
        if (googleWorkspaceEnabled()) {
          const stubs = (rawDetection.files.document ?? []).filter((file: string) =>
            GWS_EXTENSIONS.has(extname(file).toLowerCase()),
          );
          if (stubs.length > 0) {
            console.log(`[graphify extract] converting ${stubs.length} Google Workspace shortcut(s)...`);
            const replacements = new Map<string, string>();
            for (const stub of stubs) {
              try {
                const sidecar = await convertGoogleWorkspaceFile(stub, paths.convertedDir);
                if (sidecar) replacements.set(stub, sidecar);
              } catch (err) {
                console.warn(
                  `[graphify extract] Google Workspace conversion skipped for ${stub}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }
            if (replacements.size > 0) {
              rawDetection.files.document = (rawDetection.files.document ?? []).map((file: string) =>
                replacements.get(file) ?? file,
              );
            }
          }
        }

        const detection = makeDetectionPortable(rawDetection as DetectionResult, root);
        writeJson(paths.scratch.detect, detection);
        if (detection.scope) writeJson(paths.scope, detection.scope);
        saveManifest({ ...rawDetection.files, document: originalDocumentFiles }, paths.manifest, { root });

        const codeFiles = rawDetection.files.code ?? [];
        const semanticFileCount =
          (rawDetection.files.document?.length ?? 0) +
          (rawDetection.files.paper?.length ?? 0) +
          (rawDetection.files.image?.length ?? 0) +
          (rawDetection.files.video?.length ?? 0);

        let astExtraction = ensureCliExtractionShape();
        let diagnostics: Array<{ filePath: string; error: string }> = [];
        if (codeFiles.length > 0) {
          console.log(`[graphify extract] AST extraction on ${codeFiles.length} code file(s)...`);
          const astResult = await extractWithDiagnostics(codeFiles);
          diagnostics = astResult.diagnostics;
          astExtraction = makeExtractionPortable(astResult.extraction, root);
          writeJson(paths.scratch.ast, astExtraction);
          if (diagnostics.length > 0) {
            console.warn(
              `[graphify extract] AST extraction diagnostics for ${diagnostics.length}/${codeFiles.length} file(s): ` +
              diagnostics.slice(0, 3).map((entry) => `${entry.filePath}: ${entry.error}`).join(" | "),
            );
          }
        }

        let semanticExtraction = ensureCliExtractionShape();
        if (opts.semantic) {
          semanticExtraction = makeExtractionPortable(ensureCliExtractionShape(readJson<Partial<Extraction>>(opts.semantic)), root);
          writeJson(paths.scratch.semantic, semanticExtraction);
        } else if (opts.backend) {
          const backend = String(opts.backend).trim().toLowerCase();
          const [{ isDirectLlmProvider }, { createDirectSemanticExtractionClient, extractSemanticFilesDirectParallel }] = await Promise.all([
            import("./llm-execution.js"),
            import("./direct-llm-extract.js"),
          ]);

          // claude-cli backend (upstream Python Graphify v0.7.17, #855):
          // routes semantic extraction through Claude Code itself rather than
          // a direct provider API key. In the TypeScript fork this is exactly
          // what the assistant skill already does, so the --backend alias
          // writes a standard instructions file under .graphify/scratch/ and
          // exits cleanly so the calling Claude Code session (or any other
          // assistant harness) can complete the semantic step without
          // mixing API key paths.
          if (backend === "claude-cli") {
            const textSemanticFiles = [
              ...(rawDetection.files.document ?? []),
              ...(rawDetection.files.paper ?? []),
            ];
            const unsupportedSemanticFiles = [
              ...(rawDetection.files.image ?? []),
              ...(rawDetection.files.video ?? []),
            ];
            const instructionsPath = join(paths.stateDir, "scratch", "assistant-extract-instructions.md");
            mkdirSync(dirname(instructionsPath), { recursive: true });
            const lines = [
              `# Graphify assistant extraction instructions`,
              ``,
              `Generated by \`graphify extract --backend claude-cli\` for ${root}.`,
              ``,
              `No provider API key was read or persisted: this backend defers semantic`,
              `extraction to the calling Claude Code session (or any other graphify`,
              `assistant skill harness) so the same security boundary as the assistant`,
              `mode applies.`,
              ``,
              `## Next step`,
              ``,
              `Run the graphify skill so it can read the detection roots below, write`,
              `the merged extraction JSON to \`${paths.scratch.semantic}\`, then call`,
              `\`graphify extract --semantic <that path>\` (or finish the assemble /`,
              `cluster steps directly).`,
              ``,
              `## Text semantic files (${textSemanticFiles.length})`,
              ``,
              ...(textSemanticFiles.length > 0
                ? textSemanticFiles.map((file) => `- ${file}`)
                : ["- none"]),
              ``,
              ...(unsupportedSemanticFiles.length > 0
                ? [
                  `## Non-text semantic files (${unsupportedSemanticFiles.length})`,
                  ``,
                  `These require the PDF/OCR/transcription pipeline before the assistant skill consumes them:`,
                  ``,
                  ...unsupportedSemanticFiles.map((file) => `- ${file}`),
                  ``,
                ]
                : []),
            ];
            writeFileSync(instructionsPath, lines.join("\n"), "utf-8");
            console.log(
              `[graphify extract] --backend claude-cli: no provider API key read; ` +
              `wrote assistant instructions to ${instructionsPath}.`,
            );
            console.log(
              `[graphify extract] Run the graphify skill to complete semantic extraction, ` +
              `then re-run extract with --semantic <output>.`,
            );
            // Return cleanly rather than process.exit so the surrounding
            // try/catch and the test harness's interceptExit see a normal
            // success exit.
            return;
          }

          if (!isDirectLlmProvider(backend)) {
            console.error("error: --backend must be one of anthropic, openai, gemini, mistral, cohere, ollama, claude-cli");
            process.exit(1);
          }
          const textSemanticFiles = [
            ...(rawDetection.files.document ?? []),
            ...(rawDetection.files.paper ?? []),
          ];
          const unsupportedSemanticFiles = [
            ...(rawDetection.files.image ?? []),
            ...(rawDetection.files.video ?? []),
          ];
          if (unsupportedSemanticFiles.length > 0) {
            console.error(
              "error: direct --backend currently extracts text semantic files only. " +
              "Run the assistant/runtime PDF/OCR/transcription pipeline first, or provide --semantic for image/video extraction.",
            );
            process.exit(1);
          }
          if (textSemanticFiles.length > 0) {
            const tokenBudget = Number.parseInt(String(opts.tokenBudget), 10);
            const maxConcurrency = Number.parseInt(String(opts.concurrency), 10);
            console.log(
              `[graphify extract] direct semantic extraction on ${textSemanticFiles.length} file(s) with ${backend}...`,
            );
            semanticExtraction = makeExtractionPortable(
              await extractSemanticFilesDirectParallel(textSemanticFiles, {
                root,
                client: createDirectSemanticExtractionClient({
                  provider: backend,
                  model: typeof opts.model === "string" ? opts.model : undefined,
                }),
                tokenBudget: Number.isFinite(tokenBudget) && tokenBudget > 0 ? tokenBudget : 60_000,
                maxConcurrency: Number.isFinite(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : 4,
              }),
              root,
            );
            writeJson(paths.scratch.semantic, semanticExtraction);
          }
        }

        if (semanticFileCount > 0 && !opts.semantic && !opts.backend) {
          console.error(
            "error: detected non-code corpus files that require semantic extraction; " +
            "provide --semantic <path>, pass --backend <provider>, or use the graphify assistant skill/runtime pipeline.",
          );
          process.exit(1);
        }

        const merged = makeExtractionPortable(mergeCliAstAndSemantic(astExtraction, semanticExtraction), root);
        if (opts.cluster === false) {
          writeJson(paths.scratch.extract, merged);
          console.log(
            `[graphify extract] wrote ${paths.scratch.extract} — ` +
            `${merged.nodes.length} nodes, ${merged.edges.length} edges (no clustering)`,
          );
          return;
        }

        const [{ buildFromJson }, { cluster, scoreAll }, { godNodes, surprisingConnections, suggestQuestions }, { generate }, { toJson }, { safeToHtml }] = await Promise.all([
          import("./build.js"),
          import("./cluster.js"),
          import("./analyze.js"),
          import("./report.js"),
          import("./export.js"),
          import("./html-export.js"),
        ]);

        const G = buildFromJson(merged);
        if (G.order === 0) {
          console.error(
            "[graphify extract] graph is empty — extraction produced no nodes. " +
            "Possible causes: all files were skipped or the provided semantic extraction was empty.",
          );
          process.exit(1);
        }

        const communities = cluster(G);
        const cohesion = scoreAll(G, communities);
        const gods = godNodes(G);
        const surprises = surprisingConnections(G, communities);
        const labels = resolveCommunityLabels(communities, {
          labelsPath: paths.scratch.labels,
          graph: G,
        });
        const questions = suggestQuestions(G, communities, labels);
        const tokenCost = { input: merged.input_tokens ?? 0, output: merged.output_tokens ?? 0 };
        const report = generate(
          G,
          communities,
          cohesion,
          labels,
          gods,
          surprises,
          detection,
          tokenCost,
          projectRootLabel(root),
          {
            suggestedQuestions: questions,
            freshness: { builtFromCommit: safeGitRevParse(root, ["HEAD"]) },
          },
        );

        writeFileSync(paths.report, report, "utf-8");
        toJson(G, communities, paths.graph, { communityLabels: labels, force: true });
        // Track C-3.5: pick up ontology profile for visual encoding override
        // when a graphify.yaml + ontology-profile is present in the project.
        const ontologyProfileForExtractHtml = await tryLoadHtmlOntologyProfile(root);
        safeToHtml(
          G,
          communities,
          paths.html,
          {
            communityLabels: labels,
            ...(ontologyProfileForExtractHtml ? { profile: ontologyProfileForExtractHtml } : {}),
          },
          {
            onWarning: (message) => console.warn(message),
          },
        );
        persistCommunityLabels(labels, paths.scratch.labels);
        writeJson(paths.scratch.analysis, {
          communities: Object.fromEntries([...communities.entries()].map(([key, value]) => [String(key), value])),
          cohesion: Object.fromEntries([...cohesion.entries()].map(([key, value]) => [String(key), value])),
          gods,
          surprises,
          questions,
          labels: Object.fromEntries([...labels.entries()].map(([key, value]) => [String(key), value])),
          tokens: tokenCost,
        });

        console.log(
          `[graphify extract] wrote ${paths.graph}: ${G.order} nodes, ${G.size} edges, ${communities.size} communities`,
        );
        console.log(`[graphify extract] wrote ${paths.scratch.analysis}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
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
    .option("--force", "Overwrite graph.json even when the rebuild has fewer nodes")
    .option("--no-cluster", "Skip Louvain clustering and report regeneration (writes graph.json without community labels)")
    // WP11: node descriptions (entity + code) are generated by DEFAULT.
    // --no-description opts out; when no LLM backend is configured the step
    // degrades gracefully to a no-op (warns, never fails the rebuild).
    .option("--no-description", "Skip generating per-node descriptions (entity + code symbols)")
    .option("--description-backend <provider>", "Description LLM provider (default: auto-detect from API keys)")
    .option("--description-model <id>", "Description LLM model override")
    .option("--description-mode <mode>", "Description execution mode: assistant (default, no key) or direct (API key)", "")
    .option("--fill-missing", "Only describe nodes whose description is empty/absent (idempotent gap-fill)")
    // WP12: salient community labels are generated by DEFAULT after clustering.
    // --no-label opts out; --no-cluster also implies no labels. Without an LLM
    // backend the step emits an instruction file for the host assistant to fill.
    .option("--no-label", "Skip generating salient community labels (keep generic \"Community N\")")
    .option("--label-backend <provider>", "Community-label LLM provider (default: auto-detect from API keys)")
    .option("--label-model <id>", "Community-label LLM model override")
    .option("--label-mode <mode>", "Label execution mode: assistant (default, no key) or direct (API key)", "")
    .option("--scope <mode>", scopeOptionDescription())
    .option("--all", "Alias for --scope all")
    .action(async (updatePath = ".", opts) => {
      if (!existsSync(updatePath)) {
        console.error(`error: path not found: ${updatePath}`);
        process.exit(1);
      }
      const { rebuildCode } = await import("./watch.js");
      const scopeSelection = resolveCliScopeSelection(opts);
      const projectConfigDiscovery = discoverProjectConfig(updatePath);
      if (projectConfigDiscovery.found) {
        console.warn(
          `WARNING: ${projectConfigDiscovery.path} detected — \`graphify update\` only rebuilds the code-mode graph and ignores profile inputs (corpus, registries, ontology). ` +
          `For profile mode run \`graphify profile build ${updatePath}\` (deterministic, no LLM), then \`graphify extract --semantic <path> --backend …\` for semantic extraction. Continuing in code-only mode.`,
        );
      }
      const describe = opts.description !== false;
      const labelOn = opts.label !== false && opts.cluster !== false;
      const llmNote = describe && labelOn
        ? " (descriptions + salient community labels on by default; --no-description / --no-label to skip)..."
        : describe
          ? " (descriptions on by default; --no-description to skip)..."
          : labelOn
            ? " (salient community labels on by default; --no-label to skip)..."
            : " (no LLM needed)...";
      console.log(`Re-extracting code files in ${updatePath}${llmNote}`);
      const ok = await rebuildCode(updatePath, false, {
        force: Boolean(opts.force),
        noCluster: opts.cluster === false,
        describe,
        ...(typeof opts.descriptionBackend === "string" && opts.descriptionBackend.trim()
          ? { descriptionBackend: opts.descriptionBackend.trim() }
          : {}),
        ...(typeof opts.descriptionModel === "string" && opts.descriptionModel.trim()
          ? { descriptionModel: opts.descriptionModel.trim() }
          : {}),
        ...(opts.fillMissing ? { descriptionOnlyMissing: true } : {}),
        ...(typeof opts.descriptionMode === "string" && (opts.descriptionMode === "assistant" || opts.descriptionMode === "direct")
          ? { descriptionMode: opts.descriptionMode as "assistant" | "direct" }
          : {}),
        label: opts.label !== false,
        ...(typeof opts.labelBackend === "string" && opts.labelBackend.trim()
          ? { labelBackend: opts.labelBackend.trim() }
          : {}),
        ...(typeof opts.labelModel === "string" && opts.labelModel.trim()
          ? { labelModel: opts.labelModel.trim() }
          : {}),
        ...(typeof opts.labelMode === "string" && (opts.labelMode === "assistant" || opts.labelMode === "direct")
          ? { labelMode: opts.labelMode as "assistant" | "direct" }
          : {}),
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

      // Track F F-0816-P2 row 15 (port safishamsi 076e6b7 / #934):
      // Re-clustering must survive the case where the output directory
      // around graph.json was partially archived. Recreating the state
      // dir (idempotent on the happy path) keeps writeFileSync(...)
      // from blowing up with ENOENT before any side-effect.
      mkdirSync(paths.stateDir, { recursive: true });

      const rawGraphText = readFileSync(paths.graph, "utf-8");
      const rawGraphParsed = JSON.parse(rawGraphText) as {
        nodes?: Array<Record<string, unknown>>;
      };
      const G = makeGraphPortable(loadGraphFromData(JSON.parse(rawGraphText)), root);
      const { cluster, scoreAll, remapCommunitiesToPrevious } = await import("./cluster.js");
      const { godNodes, surprisingConnections, suggestQuestions } = await import("./analyze.js");
      const { generate } = await import("./report.js");
      const { toJson } = await import("./export.js");
      const { safeToHtml } = await import("./html-export.js");

      let communities = cluster(G);
      // Mirror the watch/update path (upstream #822): map new cids to prior ones
      // by node-overlap so the existing .graphify_labels.json keeps attaching to
      // the same conceptual community after re-clustering. Without this, labels
      // follow raw cid index and become misaligned whenever the graph has changed
      // between labeling and cluster-only (#1027, port of 9abaa77).
      const previousNodeCommunity: Record<string, number> = {};
      for (const n of (rawGraphParsed.nodes ?? [])) {
        const nodeId = typeof n["id"] === "string" ? n["id"] : undefined;
        const nodeCommunity = typeof n["community"] === "number" ? n["community"] : undefined;
        if (nodeId !== undefined && nodeCommunity !== undefined) {
          previousNodeCommunity[nodeId] = nodeCommunity;
        }
      }
      if (Object.keys(previousNodeCommunity).length > 0) {
        communities = remapCommunitiesToPrevious(communities, previousNodeCommunity);
      }
      const cohesion = scoreAll(G, communities);
      const gods = godNodes(G);
      const surprises = surprisingConnections(G, communities);
      const labels = resolveCommunityLabels(communities, {
        labelsPath: paths.scratch.labels,
        graph: G,
      });
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
      const report = generate(
        G,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        { input: 0, output: 0 },
        projectRootLabel(root),
        {
          suggestedQuestions: questions,
          freshness: { builtFromCommit: safeGitRevParse(root, ["HEAD"]) },
        },
      );
      writeFileSync(paths.report, report, "utf-8");
      toJson(G, communities, paths.graph, { communityLabels: labels });
      // Track C-3.5: opportunistically load the ontology profile so HTML
      // export can override shape/color per node_type when declared.
      const ontologyProfileForHtml = await tryLoadHtmlOntologyProfile(root);
      safeToHtml(
        G,
        communities,
        paths.html,
        {
          communityLabels: labels,
          ...(ontologyProfileForHtml ? { profile: ontologyProfileForHtml } : {}),
        },
        {
          onWarning: (message) => console.warn(message),
        },
      );
      persistCommunityLabels(labels, paths.scratch.labels);
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

  // ---------------------------------------------------------------------------
  // graphify label <path>
  // Force-regenerate community names with the configured LLM backend and
  // refresh the report/HTML. Mirrors upstream c8b329d `graphify label`.
  // ---------------------------------------------------------------------------
  program
    .command("label [path]")
    .description("(Re)name communities with the configured LLM backend and regenerate report")
    .option("--backend <provider>", "LLM provider (default: auto-detect from API keys)")
    .option("--model <id>", "LLM model override")
    .option("--label-mode <mode>", "Execution mode: assistant (default, no key) or direct (API key)", "")
    .action(async (labelPath = ".", opts) => {
      const root = resolve(labelPath);
      const paths = resolveGraphifyPaths({ root });
      if (!existsSync(paths.graph)) {
        console.error(`error: no graph found at ${paths.graph} - run /graphify first`);
        process.exit(1);
      }

      mkdirSync(paths.stateDir, { recursive: true });

      const rawGraphText = readFileSync(paths.graph, "utf-8");
      const rawGraphParsed = JSON.parse(rawGraphText) as {
        nodes?: Array<Record<string, unknown>>;
      };
      const G = makeGraphPortable(loadGraphFromData(JSON.parse(rawGraphText)), root);
      const { cluster, scoreAll, remapCommunitiesToPrevious } = await import("./cluster.js");
      const { godNodes, surprisingConnections, suggestQuestions } = await import("./analyze.js");
      const { generate } = await import("./report.js");
      const { toJson } = await import("./export.js");
      const { safeToHtml } = await import("./html-export.js");
      const { generateCommunityLabels } = await import("./community-labeling.js");

      let communities = cluster(G);
      const previousNodeCommunity: Record<string, number> = {};
      for (const n of (rawGraphParsed.nodes ?? [])) {
        const nodeId = typeof n["id"] === "string" ? n["id"] : undefined;
        const nodeCommunity = typeof n["community"] === "number" ? n["community"] : undefined;
        if (nodeId !== undefined && nodeCommunity !== undefined) {
          previousNodeCommunity[nodeId] = nodeCommunity;
        }
      }
      if (Object.keys(previousNodeCommunity).length > 0) {
        communities = remapCommunitiesToPrevious(communities, previousNodeCommunity);
      }

      const cohesion = scoreAll(G, communities);
      const gods = godNodes(G);
      const surprises = surprisingConnections(G, communities);

      const backendArg = typeof opts.backend === "string" ? opts.backend.trim() || undefined : undefined;
      const modelArg = typeof opts.model === "string" ? opts.model.trim() || undefined : undefined;

      const labelModeArg = typeof opts.labelMode === "string" && (opts.labelMode === "assistant" || opts.labelMode === "direct")
        ? opts.labelMode as "assistant" | "direct"
        : undefined;

      console.log("Labeling communities...");
      const { labels, source } = await generateCommunityLabels(G, communities, {
        provider: backendArg ?? null,
        model: modelArg,
        gods,
        ...(labelModeArg ? { mode: labelModeArg } : {}),
        instructionDir: join(paths.stateDir, "label-instructions"),
      });

      if (source === "llm" || source === "assistant") {
        persistCommunityLabels(labels, paths.scratch.labels);
      }

      const questions = suggestQuestions(G, communities, labels);
      const detection = {
        files: { code: [], document: [], paper: [], image: [], video: [] },
        total_files: 0,
        total_words: 0,
        needs_graph: true,
        warning: "label mode - file stats not available",
        skipped_sensitive: [],
        graphifyignore_patterns: 0,
      };
      const report = generate(
        G,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        { input: 0, output: 0 },
        projectRootLabel(root),
        {
          suggestedQuestions: questions,
          freshness: { builtFromCommit: safeGitRevParse(root, ["HEAD"]) },
        },
      );
      writeFileSync(paths.report, report, "utf-8");
      toJson(G, communities, paths.graph, { communityLabels: labels });
      const ontologyProfileForHtml = await tryLoadHtmlOntologyProfile(root);
      safeToHtml(
        G,
        communities,
        paths.html,
        {
          communityLabels: labels,
          ...(ontologyProfileForHtml ? { profile: ontologyProfileForHtml } : {}),
        },
        {
          onWarning: (message) => console.warn(message),
        },
      );
      const analysis = {
        communities: Object.fromEntries([...communities.entries()].map(([key, value]) => [String(key), value])),
        cohesion: Object.fromEntries([...cohesion.entries()].map(([key, value]) => [String(key), value])),
        gods,
        surprises,
        labels: Object.fromEntries([...labels.entries()].map(([key, value]) => [String(key), value])),
        questions,
      };
      writeFileSync(paths.scratch.analysis, JSON.stringify(analysis, null, 2), "utf-8");
      const sourceMsg = source === "llm"
        ? "LLM-generated"
        : source === "assistant"
          ? "assistant/skill mode (instructions emitted or ingested)"
          : "placeholder (no LLM backend)";
      console.log(
        `Done - ${communities.size} communities labeled (${sourceMsg}). ` +
          "GRAPH_REPORT.md, graph.json and graph.html updated.",
      );
    });

  const wikiCommand = program
    .command("wiki")
    .description("Generate and maintain Graphify wiki artifacts");

  wikiCommand
    .command("describe")
    .description("Generate wiki description sidecars for nodes and communities")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--mode <mode>", "Generation mode: assistant or direct", "assistant")
    .option("--backend <provider>", "Direct LLM provider for --mode direct")
    .option("--model <id>", "Direct LLM model override")
    .option("--targets <scope>", "Targets to describe: nodes, communities, all", "nodes")
    .option("--out <dir>", "Directory to write sidecar JSON files")
    .option("--instructions-dir <dir>", "Directory to write assistant instruction files")
    .option("--max-nodes <count>", "Maximum node targets")
    .option("--max-communities <count>", "Maximum community targets")
    .option("--max-neighbors <count>", "Maximum node neighbors in each prompt")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const mode = String(opts.mode ?? "assistant").trim().toLowerCase();
        if (!["assistant", "direct", "batch", "mesh"].includes(mode)) {
          throw new Error("--mode must be one of: assistant, direct, batch, mesh");
        }
        if (mode === "batch" || mode === "mesh") {
          throw new Error(`wiki describe --mode ${mode} is not implemented yet; use assistant or direct`);
        }

        const outputDir = resolve(opts.out ?? join(dirname(graphPath), "wiki", "descriptions"));
        const instructionsDir = resolve(opts.instructionsDir ?? join(dirname(graphPath), "wiki", "description-instructions"));
        const targetOptions = parseWikiDescriptionTargets(opts.targets);
        const maxNodeTargets = parsePositiveIntegerOption(opts.maxNodes, "--max-nodes");
        const maxCommunityTargets = parsePositiveIntegerOption(opts.maxCommunities, "--max-communities");
        const maxNeighbors = parsePositiveIntegerOption(opts.maxNeighbors, "--max-neighbors");

        const G = loadCliGraph(graphPath);
        const communities = communitiesFromCliGraph(G);
        const labels = communityLabelsFromCliGraph(G, communities);
        const [
          { generateWikiDescriptionSidecars },
          {
            createAssistantTextJsonClient,
            createDirectTextJsonClient,
            isDirectLlmProvider,
          },
        ] = await Promise.all([
          import("./wiki-description-generation.js"),
          import("./llm-execution.js"),
        ]);

        const clients: Parameters<typeof generateWikiDescriptionSidecars>[1]["clients"] = {};
        if (mode === "assistant") {
          clients.assistant = createAssistantTextJsonClient({ instructionDir: instructionsDir });
        } else {
          const provider = String(opts.backend ?? "").trim();
          if (!provider) {
            throw new Error("--backend is required when using wiki describe --mode direct");
          }
          if (!isDirectLlmProvider(provider)) {
            throw new Error(`unsupported direct LLM provider: ${provider}`);
          }
          clients.direct = createDirectTextJsonClient({
            provider,
            ...(opts.model ? { model: String(opts.model) } : {}),
          });
        }

        const result = await generateWikiDescriptionSidecars(G, {
          graphHash: graphContentHash(graphPath),
          mode: mode as "assistant" | "direct",
          clients,
          communities,
          communityLabels: labels,
          outputDir,
          ...targetOptions,
          ...(maxNodeTargets !== undefined ? { maxNodeTargets } : {}),
          ...(maxCommunityTargets !== undefined ? { maxCommunityTargets } : {}),
          ...(maxNeighbors !== undefined ? { maxNeighbors } : {}),
        });

        console.log(`wiki descriptions: ${result.targets.length} target(s), status=${result.status}, index=${result.indexPath ?? "not written"}`);
        const instructionCount = result.targets.filter((target) => target.instructionPath).length;
        if (instructionCount > 0) {
          console.log(`assistant instructions: ${instructionCount} file(s) written to ${instructionsDir}`);
        }
        if (result.status === "failed") {
          process.exit(1);
        }
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  const exportCommand = program
    .command("export")
    .description("Export an existing graph into HTML, wiki, Obsidian, SVG, GraphML, or Neo4j Cypher artifacts");

  exportCommand
    .command("html")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--out <path>", "Path to write graph.html")
    .option("--no-viz", "Skip HTML export and remove any stale output")
    .option(
      "--profile <path>",
      "Optional ontology profile YAML for per-node-type visual encoding (Track C-3.5)",
    )
    .option(
      "--descriptions <path>",
      "Optional wiki description sidecar index JSON; node descriptions render in the node-info panel (Track G G-studio-lot4)",
    )
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outPath = resolve(opts.out ?? join(dirname(graphPath), "graph.html"));
        if (opts.viz === false) {
          if (existsSync(outPath)) unlinkSync(outPath);
          console.log(`HTML export skipped (--no-viz): ${outPath}`);
          return;
        }
        const G = loadCliGraph(graphPath);
        const communities = communitiesFromCliGraph(G);
        const labels = communityLabelsFromCliGraph(G, communities);
        // Track C-3.5: --profile wins over graphify.yaml auto-discovery,
        // but auto-discovery still happens relative to the graph dir when
        // --profile is omitted, so an existing graphify.yaml is honored.
        const ontologyProfileForHtml = await tryLoadHtmlOntologyProfile(
          dirname(graphPath),
          typeof opts.profile === "string" ? opts.profile : undefined,
        );
        // Track G G-studio-lot4: --descriptions wires the wiki sidecar so node
        // descriptions render in the node-info panel. Stale entries (graph_hash
        // / prompt_version mismatch) are dropped with a warning.
        const descriptions = await loadFreshWikiDescriptionSidecarIndex(
          typeof opts.descriptions === "string" ? opts.descriptions : undefined,
          graphPath,
        );
        const { safeToHtml } = await import("./html-export.js");
        const written = safeToHtml(
          G,
          communities,
          outPath,
          {
            communityLabels: labels,
            ...(ontologyProfileForHtml ? { profile: ontologyProfileForHtml } : {}),
            ...(descriptions ? { descriptions } : {}),
          },
          {
            onWarning: (message) => console.warn(message),
          },
        );
        if (!written) {
          process.exit(1);
        }
        console.log(`graph.html written - open in any browser: ${outPath}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  exportCommand
    .command("wiki")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--dir <path>", "Directory to write wiki pages")
    .option("--descriptions <path>", "Path to wiki description sidecar index JSON")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outDir = resolve(opts.dir ?? join(dirname(graphPath), "wiki"));
        const G = loadCliGraph(graphPath);
        const communities = communitiesFromCliGraph(G);
        const labels = communityLabelsFromCliGraph(G, communities);
        const descriptions = await loadFreshWikiDescriptionSidecarIndex(opts.descriptions, graphPath);
        const { toWiki } = await import("./wiki.js");
        const count = toWiki(G, communities, outDir, { communityLabels: labels, descriptions });
        console.log(`Wiki export: ${count} page(s) written to ${outDir}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  exportCommand
    .command("obsidian")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--dir <path>", "Directory to write the Obsidian vault")
    .option("--descriptions <path>", "Path to wiki description sidecar index JSON")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outDir = resolve(opts.dir ?? join(dirname(graphPath), "obsidian"));
        const G = loadCliGraph(graphPath);
        const communities = communitiesFromCliGraph(G);
        const labels = communityLabelsFromCliGraph(G, communities);
        const descriptions = await loadFreshWikiDescriptionSidecarIndex(opts.descriptions, graphPath);
        const [{ toCanvas }, { toWiki }] = await Promise.all([
          import("./export.js"),
          import("./wiki.js"),
        ]);
        const count = toWiki(G, communities, outDir, { communityLabels: labels, descriptions });
        toCanvas(G, communities, join(outDir, "graph.canvas"), { communityLabels: labels });
        console.log(`Obsidian vault: ${count} note(s) written to ${outDir}`);
        console.log(`Canvas: ${join(outDir, "graph.canvas")} - open in Obsidian for structured community layout`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  exportCommand
    .command("svg")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--out <path>", "Path to write graph.svg")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outPath = resolve(opts.out ?? join(dirname(graphPath), "graph.svg"));
        const G = loadCliGraph(graphPath);
        const communities = communitiesFromCliGraph(G);
        const labels = communityLabelsFromCliGraph(G, communities);
        const { toSvg } = await import("./export.js");
        toSvg(G, communities, outPath, labels);
        console.log(`graph.svg written - embeds in Obsidian, Notion, GitHub READMEs: ${outPath}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  exportCommand
    .command("graphml")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--out <path>", "Path to write graph.graphml")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outPath = resolve(opts.out ?? join(dirname(graphPath), "graph.graphml"));
        const G = loadCliGraph(graphPath);
        const communities = communitiesFromCliGraph(G);
        const { toGraphml } = await import("./export.js");
        toGraphml(G, communities, outPath);
        console.log(`graph.graphml written - open in Gephi, yEd, or any GraphML tool: ${outPath}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  exportCommand
    .command("neo4j")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--out <path>", "Path to write cypher.txt")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outPath = resolve(opts.out ?? join(dirname(graphPath), "cypher.txt"));
        const G = loadCliGraph(graphPath);
        const { toCypher } = await import("./export.js");
        toCypher(G, outPath);
        console.log(`cypher.txt written - import with: cypher-shell < ${outPath}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  exportCommand
    .command("spanner")
    .description("Export graph as Google Cloud Spanner DDL/DML property-graph artifacts (file-only, no driver required)")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--dir <path>", "Directory to write spanner.ddl.sql and spanner.dml.sql")
    .action(async (opts) => {
      try {
        const graphPath = resolveGraphInputPath(opts.graph);
        const outDir = resolve(opts.dir ?? join(dirname(graphPath), "spanner"));
        const G = loadCliGraph(graphPath);
        const { toSpanner } = await import("./export.js");
        toSpanner(G, outDir);
        console.log(`Spanner artifacts written to ${outDir}`);
        console.log(`  DDL: ${join(outDir, "spanner.ddl.sql")}`);
        console.log(`  DML: ${join(outDir, "spanner.dml.sql")}`);
      } catch (err) {
        console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
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
        if (source === target) {
          console.error(
            `'${sourceLabel}' and '${targetLabel}' both resolved to the same node '${source}'. Use a more specific label or the exact node ID.`,
          );
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
    .command("tree")
    .description("Compact tree view from one graph node")
    .argument("<node>")
    .option("--graph <path>", "Path to graph.json", resolveGraphInputPath())
    .option("--depth <n>", "Traversal depth", "2")
    .option("--max-children <n>", "Maximum children per node", "12")
    .action(async (nodeLabel, opts) => {
      try {
        const G = loadCliGraph(opts.graph);
        const nodeId = findBestMatchingNode(G, nodeLabel);
        if (!nodeId) {
          console.log(`No node matching '${nodeLabel}' found.`);
          return;
        }
        const { renderTree } = await import("./tree.js");
        console.log(renderTree(G, nodeId, {
          depth: Number(opts.depth),
          maxChildren: Number(opts.maxChildren),
        }));
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
    .option("--depth <n>", "BFS depth on the import graph (1..5, default 1)", "1")
    .option("--affected", "Emit only the affected-files list (one path per line); equivalent to upstream `graphify affected` on the review-delta surface")
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
      const depth = Number.parseInt(String(opts.depth ?? "1"), 10);
      if (opts.affected) {
        const { computeAffectedFiles, affectedFilesToText } = await import("./review.js");
        const affected = computeAffectedFiles(G, resolvedChangedFiles, {
          depth,
          maxNodes: Number(opts.maxNodes),
        });
        console.log(affectedFilesToText(affected));
        return;
      }
      const { buildReviewDelta, reviewDeltaToText } = await import("./review.js");
      const delta = buildReviewDelta(G, resolvedChangedFiles, {
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
        depth,
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
      const { scoreSearchText } = await import("./search.js");
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
          const score = scoreSearchText(
            (data.label as string) ?? "",
            (data.source_file as string) ?? "",
            terms,
          );
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
        // Phase 4 decision: the automatic git-hook rebuild MUST stay fast and
        // LLM-free — running descriptions + salient labels on every commit means
        // a blocking network round-trip per commit and a hard API-key dependency
        // in the commit path (egregiously slow). So we disable BOTH LLM passes
        // here: `describe: false` AND `label: false`. Without the label opt-out,
        // `applySalientCommunityLabels` (gated on `options.label !== false`)
        // would still fire a live label LLM round-trip on every commit whenever
        // an API key is in env. `markDescribePending: true` then writes a
        // `.graphify_describe_pending` marker so the next describe+label-producing
        // `graphify update` (default-on) fills them in, and `check-update`
        // surfaces the marker as a nudge. This still honours "descriptions +
        // labels on EVERY graph": the hook-rebuilt graph is guaranteed a
        // follow-up fill rather than shipping silently bare.
        describe: false,
        label: false,
        markDescribePending: true,
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

  program
    .command("merge-driver <ancestor> <current> <other>", { hidden: true })
    .description("Internal: merge graph.json files for Git merge-driver support")
    .action(async (ancestor, current, other) => {
      const { mergeGraphJsonFiles } = await import("./merge-driver.js");
      mergeGraphJsonFiles(ancestor, current, other);
    });

  program
    .command("hook-check", { hidden: true })
    .description("Internal: shell-agnostic no-op for Codex PreToolUse hooks")
    .action(() => {
      process.exit(0);
    });

  // Upstream 2209a9c: treat `graphify <path>` (bare path with no subcommand)
  // as `graphify extract <path>`. Common when following the PowerShell note
  // in README (`graphify .`) or copy-pasting skill invocations.
  // Only rewrite when the first positional arg looks like a filesystem path
  // and is not a registered subcommand — we leave other unknown commands to
  // commander's normal "unknown command" error.
  const argv0 = process.argv[2];
  if (argv0 && !argv0.startsWith("-")) {
    const looksLikePath = argv0 === "." || argv0 === ".."
      || argv0.startsWith("./") || argv0.startsWith("../")
      || argv0.startsWith("/") || argv0.startsWith("~/")
      || argv0.startsWith("~\\")
      || /^[A-Za-z]:[\\/]/.test(argv0); // Windows drive letter
    const registered = program.commands.some((c) => c.name() === argv0);
    if (looksLikePath && !registered) {
      // Rewrite argv so commander sees `extract <path> ...rest`.
      process.argv.splice(2, 0, "extract");
    } else if (!registered && existsSync(argv0)) {
      // Fallback for relative paths like `foo/bar` that exist but don't start with .
      process.argv.splice(2, 0, "extract");
    }
  }

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
