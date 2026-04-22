import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type {
  ReviewGraphNode,
  ReviewGraphNodeKind,
  ReviewGraphStoreLike,
} from "./review-store.js";

export interface DetectEntryPointsOptions {
  includeTests?: boolean;
}

export interface TraceFlowsOptions extends DetectEntryPointsOptions {
  maxDepth?: number;
}

export interface BuildFlowArtifactOptions extends TraceFlowsOptions {
  graphPath?: string | null;
  generatedAt?: string;
}

export interface ReviewFlow {
  id: string;
  name: string;
  entryPoint: string;
  entryPointId: string;
  path: string[];
  qualifiedPath: string[];
  depth: number;
  nodeCount: number;
  fileCount: number;
  files: string[];
  criticality: number;
  warnings: string[];
}

export interface ReviewFlowStep {
  nodeId: string;
  name: string;
  kind: ReviewGraphNodeKind;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  qualifiedName: string;
}

export interface ReviewFlowDetail extends ReviewFlow {
  steps: ReviewFlowStep[];
}

export interface ReviewFlowArtifact {
  version: 1;
  generatedAt: string;
  graphPath: string | null;
  maxDepth: number;
  includeTests: boolean;
  warnings: string[];
  flows: ReviewFlow[];
}

export interface AffectedFlowsResult {
  changedFiles: string[];
  matchedNodeIds: string[];
  unmatchedFiles: string[];
  affectedFlows: ReviewFlowDetail[];
  total: number;
}

export interface ListFlowsOptions {
  sortBy?: "criticality" | "depth" | "node-count" | "file-count" | "name";
  limit?: number;
}

const FLOW_ARTIFACT_VERSION = 1 as const;
const DEFAULT_MAX_DEPTH = 15;

const FRAMEWORK_DECORATOR_PATTERNS: RegExp[] = [
  /app\.(get|post|put|delete|patch|route|websocket|on_event)/iu,
  /router\.(get|post|put|delete|patch|route)/iu,
  /blueprint\.(route|before_request|after_request)/iu,
  /(before|after)_(request|response)/iu,
  /click\.(command|group)/iu,
  /\w+\.(command|group)\b/iu,
  /(field|model)_(serializer|validator)/iu,
  /(celery\.)?(task|shared_task|periodic_task)/iu,
  /receiver/iu,
  /api_view/iu,
  /\baction\b/iu,
  /pytest\.(fixture|mark)/u,
  /(override_settings|modify_settings)/iu,
  /(event\.)?listens_for/iu,
  /(Get|Post|Put|Delete|Patch|RequestMapping)Mapping/iu,
  /(Scheduled|EventListener|Bean|Configuration)/iu,
  /(Component|Injectable|Controller|Module|Guard|Pipe)/iu,
  /(Subscribe|Mutation|Query|Resolver)/iu,
  /(app|router)\.(get|post|put|delete|patch|use|all)\b/u,
  /@(Override|OnLifecycleEvent|Composable)/iu,
  /(HiltViewModel|AndroidEntryPoint|Inject)/iu,
  /\w+\.(tool|tool_plain|system_prompt|result_validator)\b/iu,
  /^tool\b/iu,
  /\w+\.(middleware|exception_handler|on_exception)\b/iu,
  /\w+\.route\b/iu,
];

const ENTRY_NAME_PATTERNS: RegExp[] = [
  /^main$/u,
  /^__main__$/u,
  /^test_/u,
  /^Test[A-Z]/u,
  /^on_/u,
  /^handle_/u,
  /^handler$/u,
  /^handle$/u,
  /^lambda_handler$/u,
  /^upgrade$/u,
  /^downgrade$/u,
  /^lifespan$/u,
  /^get_db$/u,
  /^on(Create|Start|Resume|Pause|Stop|Destroy|Bind|Receive)/u,
  /^do(Get|Post|Put|Delete)$/u,
  /^do_(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/u,
  /^log_message$/u,
  /^(middleware|errorHandler)$/u,
  /^ng(OnInit|OnChanges|OnDestroy|DoCheck|AfterContentInit|AfterContentChecked|AfterViewInit|AfterViewChecked)$/u,
  /^(transform|writeValue|registerOnChange|registerOnTouched|setDisabledState)$/u,
  /^(canActivate|canDeactivate|canActivateChild|canLoad|canMatch|resolve)$/u,
  /^(componentDidMount|componentDidUpdate|componentWillUnmount|shouldComponentUpdate|render)$/u,
];

const TEST_FILE_RE = /([\\/]__tests__[\\/]|\.spec\.[jt]sx?$|\.test\.[jt]sx?$|[\\/]test_[^/\\]*\.py$)/u;

const SECURITY_KEYWORDS = [
  "auth",
  "login",
  "password",
  "token",
  "session",
  "crypt",
  "secret",
  "credential",
  "permission",
  "sql",
  "query",
  "execute",
  "connect",
  "socket",
  "request",
  "http",
  "sanitize",
  "validate",
  "encrypt",
  "decrypt",
  "hash",
  "sign",
  "verify",
  "admin",
  "privilege",
];

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isTestFile(filePath: string | null): boolean {
  return !!filePath && TEST_FILE_RE.test(filePath);
}

function decoratorsOf(node: ReviewGraphNode): string[] {
  const decorators = node.extra.decorators;
  if (typeof decorators === "string") return [decorators];
  if (Array.isArray(decorators)) return decorators.filter((item): item is string => typeof item === "string");
  return [];
}

function hasFrameworkDecorator(node: ReviewGraphNode): boolean {
  return decoratorsOf(node).some((decorator) => FRAMEWORK_DECORATOR_PATTERNS.some((pattern) => pattern.test(decorator)));
}

function matchesEntryName(node: ReviewGraphNode): boolean {
  return ENTRY_NAME_PATTERNS.some((pattern) => pattern.test(node.name));
}

function sanitizeFlowName(name: string): string {
  return name.replace(/[^\w.:-]+/gu, "_").replace(/^_+|_+$/gu, "") || "flow";
}

function flowIdFor(entryPointId: string, seen: Set<string>): string {
  const base = `flow:${sanitizeFlowName(entryPointId)}`;
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base}:${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function stableFiles(nodes: ReviewGraphNode[]): string[] {
  return [...new Set(nodes.map((node) => node.filePath).filter((file): file is string => !!file))].sort(compareStrings);
}

export function detectEntryPoints(
  store: ReviewGraphStoreLike,
  options: DetectEntryPointsOptions = {},
): ReviewGraphNode[] {
  const calledQualifiedNames = store.getAllCallTargets();
  const candidates = store.getNodesByKind(["Function", "Test"]);
  const entryPoints: ReviewGraphNode[] = [];
  const seen = new Set<string>();

  for (const node of candidates) {
    if (!options.includeTests && (node.isTest || isTestFile(node.filePath))) continue;
    const isEntry = !calledQualifiedNames.has(node.qualifiedName) || hasFrameworkDecorator(node) || matchesEntryName(node);
    if (!isEntry || seen.has(node.qualifiedName)) continue;
    entryPoints.push(node);
    seen.add(node.qualifiedName);
  }
  return entryPoints;
}

interface TraceResult {
  flows: ReviewFlow[];
  warnings: string[];
}

function traceSingleFlow(
  store: ReviewGraphStoreLike,
  entryPoint: ReviewGraphNode,
  id: string,
  maxDepth: number,
  warnings: string[],
): ReviewFlow | null {
  const pathIds: string[] = [entryPoint.id];
  const qualifiedPath: string[] = [entryPoint.qualifiedName];
  const visited = new Set<string>([entryPoint.qualifiedName]);
  const queue: Array<{ qualifiedName: string; depth: number }> = [{ qualifiedName: entryPoint.qualifiedName, depth: 0 }];
  const flowWarnings: string[] = [];
  let actualDepth = 0;
  let skippedUndirectedCalls = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    actualDepth = Math.max(actualDepth, current.depth);
    if (current.depth >= maxDepth) continue;

    for (const edge of store.getEdgesBySource(current.qualifiedName, "CALLS")) {
      if (edge.direction === "undirected") {
        skippedUndirectedCalls += 1;
        continue;
      }
      if (visited.has(edge.targetQualified)) continue;
      const target = store.getNode(edge.targetQualified);
      if (!target) continue;
      visited.add(target.qualifiedName);
      pathIds.push(target.id);
      qualifiedPath.push(target.qualifiedName);
      queue.push({ qualifiedName: target.qualifiedName, depth: current.depth + 1 });
    }
  }

  if (skippedUndirectedCalls > 0) {
    const warning = `Skipped ${skippedUndirectedCalls} CALLS edge(s) without preserved direction while tracing ${entryPoint.qualifiedName}.`;
    flowWarnings.push(warning);
    warnings.push(warning);
  }

  if (pathIds.length < 2) return null;

  const nodes = qualifiedPath.map((qualifiedName) => store.getNode(qualifiedName)).filter((node): node is ReviewGraphNode => !!node);
  const flow: ReviewFlow = {
    id,
    name: sanitizeFlowName(entryPoint.name),
    entryPoint: entryPoint.qualifiedName,
    entryPointId: entryPoint.id,
    path: pathIds,
    qualifiedPath,
    depth: actualDepth,
    nodeCount: pathIds.length,
    fileCount: stableFiles(nodes).length,
    files: stableFiles(nodes),
    criticality: 0,
    warnings: flowWarnings,
  };
  flow.criticality = computeFlowCriticality(flow, store);
  return flow;
}

function traceFlowsWithWarnings(
  store: ReviewGraphStoreLike,
  options: TraceFlowsOptions = {},
): TraceResult {
  const warnings: string[] = [];
  const maxDepth = Math.max(0, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const flowIds = new Set<string>();
  const flows = detectEntryPoints(store, { includeTests: options.includeTests }).flatMap((entryPoint) => {
    const flow = traceSingleFlow(store, entryPoint, flowIdFor(entryPoint.id, flowIds), maxDepth, warnings);
    return flow ? [flow] : [];
  });
  return {
    flows: listFlows({ version: FLOW_ARTIFACT_VERSION, generatedAt: "", graphPath: null, maxDepth, includeTests: options.includeTests === true, warnings, flows }),
    warnings,
  };
}

export function traceFlows(store: ReviewGraphStoreLike, options: TraceFlowsOptions = {}): ReviewFlow[] {
  return traceFlowsWithWarnings(store, options).flows;
}

export function computeFlowCriticality(flow: ReviewFlow, store: ReviewGraphStoreLike): number {
  const nodes = flow.path.map((nodeId) => store.getNodeById(nodeId)).filter((node): node is ReviewGraphNode => !!node);
  if (nodes.length === 0) return 0;

  const fileSpread = flow.fileCount > 1 ? Math.min((flow.fileCount - 1) / 4, 1) : 0;
  let externalCount = 0;
  for (const node of nodes) {
    for (const edge of store.getEdgesBySource(node.qualifiedName, "CALLS")) {
      if (!store.getNode(edge.targetQualified)) externalCount += 1;
    }
  }
  const externalScore = Math.min(externalCount / 5, 1);
  let securityHits = 0;
  for (const node of nodes) {
    const name = node.name.toLowerCase();
    const qualified = node.qualifiedName.toLowerCase();
    if (SECURITY_KEYWORDS.some((keyword) => name.includes(keyword) || qualified.includes(keyword))) {
      securityHits += 1;
    }
  }
  const securityScore = Math.min(securityHits / Math.max(nodes.length, 1), 1);
  const testedCount = nodes.filter((node) => store.getEdgesByTarget(node.qualifiedName, "TESTED_BY").length > 0).length;
  const testGap = 1 - testedCount / Math.max(nodes.length, 1);
  const depthScore = Math.min(flow.depth / 10, 1);
  const criticality = fileSpread * 0.30 + externalScore * 0.20 + securityScore * 0.25 + testGap * 0.15 + depthScore * 0.10;
  return Math.round(Math.min(Math.max(criticality, 0), 1) * 10000) / 10000;
}

export function buildFlowArtifact(
  store: ReviewGraphStoreLike,
  options: BuildFlowArtifactOptions = {},
): ReviewFlowArtifact {
  const maxDepth = Math.max(0, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const result = traceFlowsWithWarnings(store, {
    includeTests: options.includeTests,
    maxDepth,
  });
  return {
    version: FLOW_ARTIFACT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    graphPath: options.graphPath ?? null,
    maxDepth,
    includeTests: options.includeTests === true,
    warnings: [...new Set(result.warnings)].sort(compareStrings),
    flows: result.flows,
  };
}

export function writeFlowArtifact(artifact: ReviewFlowArtifact, path: string): void {
  const out = resolve(path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
}

export function readFlowArtifact(path: string): ReviewFlowArtifact {
  const artifact = JSON.parse(readFileSync(resolve(path), "utf-8")) as ReviewFlowArtifact;
  if (artifact.version !== FLOW_ARTIFACT_VERSION || !Array.isArray(artifact.flows)) {
    throw new Error(`Invalid graphify flow artifact: ${path}`);
  }
  return artifact;
}

export function listFlows(artifact: ReviewFlowArtifact, options: ListFlowsOptions = {}): ReviewFlow[] {
  const limit = Math.max(0, options.limit ?? artifact.flows.length);
  const sortBy = options.sortBy ?? "criticality";
  return [...artifact.flows]
    .sort((a, b) => {
      switch (sortBy) {
        case "depth":
          return b.depth - a.depth || compareStrings(a.name, b.name);
        case "node-count":
          return b.nodeCount - a.nodeCount || compareStrings(a.name, b.name);
        case "file-count":
          return b.fileCount - a.fileCount || compareStrings(a.name, b.name);
        case "name":
          return compareStrings(a.name, b.name);
        case "criticality":
        default:
          return b.criticality - a.criticality || compareStrings(a.name, b.name);
      }
    })
    .slice(0, limit);
}

export function flowToSteps(flow: ReviewFlow, store: ReviewGraphStoreLike): ReviewFlowStep[] {
  return flow.path
    .map((nodeId) => store.getNodeById(nodeId))
    .filter((node): node is ReviewGraphNode => !!node)
    .map((node) => ({
      nodeId: node.id,
      name: node.name,
      kind: node.kind,
      file: node.filePath,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      qualifiedName: node.qualifiedName,
    }));
}

export function getFlowById(
  artifact: ReviewFlowArtifact,
  flowId: string,
  store?: ReviewGraphStoreLike,
): ReviewFlowDetail | ReviewFlow | null {
  const flow = artifact.flows.find((item) => item.id === flowId);
  if (!flow) return null;
  if (!store) return flow;
  return {
    ...flow,
    steps: flowToSteps(flow, store),
  };
}

export function getAffectedFlows(
  artifact: ReviewFlowArtifact,
  changedFiles: string[],
  store: ReviewGraphStoreLike,
): AffectedFlowsResult {
  const normalizedFiles = [...new Set(changedFiles.map((file) => file.trim()).filter(Boolean))].sort(compareStrings);
  if (normalizedFiles.length === 0) {
    return {
      changedFiles: [],
      matchedNodeIds: [],
      unmatchedFiles: [],
      affectedFlows: [],
      total: 0,
    };
  }

  const matchedNodeIds = new Set<string>();
  const unmatchedFiles: string[] = [];
  for (const file of normalizedFiles) {
    const nodes = store.getNodesByFile(file);
    if (nodes.length === 0) {
      unmatchedFiles.push(file);
      continue;
    }
    for (const node of nodes) matchedNodeIds.add(node.id);
  }

  const matched = [...matchedNodeIds].sort(compareStrings);
  if (matched.length === 0) {
    return {
      changedFiles: normalizedFiles,
      matchedNodeIds: [],
      unmatchedFiles,
      affectedFlows: [],
      total: 0,
    };
  }

  const matchedSet = new Set(matched);
  const affectedFlows = artifact.flows
    .filter((flow) => flow.path.some((nodeId) => matchedSet.has(nodeId)))
    .map((flow) => getFlowById(artifact, flow.id, store))
    .filter((flow): flow is ReviewFlowDetail => !!flow && "steps" in flow)
    .sort((a, b) => b.criticality - a.criticality || compareStrings(a.name, b.name));

  return {
    changedFiles: normalizedFiles,
    matchedNodeIds: matched,
    unmatchedFiles,
    affectedFlows,
    total: affectedFlows.length,
  };
}

export function flowListToText(artifact: ReviewFlowArtifact, options: ListFlowsOptions = {}): string {
  const flows = listFlows(artifact, options);
  const lines = [
    `Execution flows: ${flows.length}/${artifact.flows.length}`,
  ];
  if (artifact.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of artifact.warnings) lines.push(`- ${warning}`);
  }
  for (const flow of flows) {
    lines.push(
      `- ${flow.id} entry=${flow.entryPoint} criticality=${flow.criticality.toFixed(4)} ` +
      `depth=${flow.depth} nodes=${flow.nodeCount} files=${flow.fileCount}`,
    );
  }
  return lines.join("\n");
}

export function affectedFlowsToText(result: AffectedFlowsResult): string {
  const lines = [
    `Affected flows: ${result.total}`,
    `Changed files: ${result.changedFiles.length}`,
    `Matched nodes: ${result.matchedNodeIds.length}`,
  ];
  if (result.unmatchedFiles.length > 0) {
    lines.push(`Unmatched files: ${result.unmatchedFiles.join(", ")}`);
  }
  for (const flow of result.affectedFlows) {
    lines.push(
      `- ${flow.id} entry=${flow.entryPoint} criticality=${flow.criticality.toFixed(4)} ` +
      `depth=${flow.depth} nodes=${flow.nodeCount} files=${flow.fileCount}`,
    );
    for (const step of flow.steps) lines.push(`  - ${step.qualifiedName}`);
  }
  return lines.join("\n");
}

export function flowDetailToText(flow: ReviewFlowDetail | ReviewFlow): string {
  const lines = [
    `Flow: ${flow.id}`,
    `Entry: ${flow.entryPoint}`,
    `Criticality: ${flow.criticality.toFixed(4)}`,
    `Depth: ${flow.depth}`,
    `Nodes: ${flow.nodeCount}`,
    `Files: ${flow.files.join(", ") || "none"}`,
  ];
  if (flow.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of flow.warnings) lines.push(`- ${warning}`);
  }
  if ("steps" in flow) {
    lines.push("Steps:");
    for (const step of flow.steps) {
      const location = step.file ? `${step.file}${step.lineStart ? `:${step.lineStart}` : ""}` : "unknown";
      lines.push(`- ${step.qualifiedName} (${step.kind}) ${location}`);
    }
  } else {
    lines.push("Path:");
    for (const qualifiedName of flow.qualifiedPath) lines.push(`- ${qualifiedName}`);
  }
  return lines.join("\n");
}
