/** Deterministic, $0 typed entity-linking pass behind `graphify link`. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { compileNormalizerByNodeType, type EntityNormalizer } from "./entity-normalizer.js";
import {
  buildNormToRawMap,
  detectModality,
  normalizeForMatch,
  parseSource,
  verifyVerbatim,
  type ParsedSource,
  type SourceUnit,
} from "./source-grounding.js";
import type {
  LinkValidationIssue,
  NormalizedOntologyNodeTypeLinking,
  NormalizedOntologyProfile,
  OntologyLinkDetector,
  RegistryRecord,
  TypedEntityOccurrenceV1,
} from "./types.js";

const DETECTOR_PRIORITY: Record<TypedEntityOccurrenceV1["detector"], number> = {
  lexicon: 0,
  pattern: 1,
  llm: 2,
};

export interface RawCandidate {
  node_type: string;
  detector: TypedEntityOccurrenceV1["detector"];
  raw_span: string;
  source_file: string;
  page: number | null;
  offsets: { start: number; end: number };
  registry_record_id?: string;
}

export interface RegistryIndex {
  registryId: string;
  partition: string | null;
  normalizerHash: string;
  /** One compiled surface scan rather than document × registry-record loops. */
  surfaceMatcher: RegExp | null;
  labelIds: Map<string, Set<string>>;
  aliasIds: Map<string, Set<string>>;
  membership: Set<string>;
  ids: Set<string>;
}

export interface DetectorContext {
  rawSource: string;
  sourceFile: string;
  normalizer: EntityNormalizer;
  registryIndex: RegistryIndex;
}

export type EntityDetector = (units: SourceUnit[], context: DetectorContext) => RawCandidate[];

interface LinkingType {
  nodeType: string;
  registryId: string;
  registryPartitioned: boolean;
  linking: NormalizedOntologyNodeTypeLinking;
  normalizer: EntityNormalizer;
}

export interface EntityLinkingInput {
  root: string;
  profile: NormalizedOntologyProfile;
  registries: Record<string, RegistryRecord[]>;
  sourceFiles: string[];
  nodeTypes?: string[];
  preset?: string;
}

export interface EntityLinkingResult {
  occurrences: TypedEntityOccurrenceV1[];
  issues: LinkValidationIssue[];
  scannedDocuments: number;
  noOp: boolean;
}

export interface EntityOccurrenceSummary {
  total: number;
  documents: Record<string, number>;
  snippets: string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isWordChar(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function validSurfaceBoundary(normalized: string, start: number, term: string): boolean {
  const before = normalized[start - 1];
  const after = normalized[start + term.length];
  return !(isWordChar(term[0]) && isWordChar(before)) && !(isWordChar(term.at(-1)) && isWordChar(after));
}

function codeUnitLengthAt(source: string, offset: number): number {
  const point = source.codePointAt(offset);
  return point !== undefined && point > 0xffff ? 2 : 1;
}

function rawEndForNormalizedSpan(unit: SourceUnit, rawSource: string, start: number, length: number): number | null {
  if (!unit.normToRaw || unit.documentEnd === undefined) return null;
  const rawStart = unit.normToRaw[start];
  const rawLast = unit.normToRaw[start + length - 1];
  if (rawStart === undefined || rawLast === undefined) return null;
  let end = rawLast + codeUnitLengthAt(rawSource, rawLast);
  // Keep a decomposed combining tail inside the raw source span.
  while (end < unit.documentEnd && /\p{M}/u.test(rawSource[end] ?? "")) end += codeUnitLengthAt(rawSource, end);
  return end;
}

function candidateFromNormalizedMatch(
  unit: SourceUnit,
  context: DetectorContext,
  detector: RawCandidate["detector"],
  index: number,
  normalizedTerm: string,
): RawCandidate | null {
  const start = unit.normToRaw?.[index];
  const end = rawEndForNormalizedSpan(unit, context.rawSource, index, normalizedTerm.length);
  if (start === undefined || end === null || start >= end) return null;
  const rawSpan = context.rawSource.slice(start, end);
  if (normalizeForMatch(rawSpan) !== normalizedTerm) return null;
  return {
    node_type: "",
    detector,
    raw_span: rawSpan,
    source_file: context.sourceFile,
    page: unit.page,
    offsets: { start, end },
  };
}

/** Hard occurrence gate: offsets must resolve to the exact raw candidate span. */
export function verifyRawCandidate(rawSource: string, candidate: Pick<RawCandidate, "raw_span" | "offsets">): boolean {
  return rawSource.slice(candidate.offsets.start, candidate.offsets.end) === candidate.raw_span
    && verifyVerbatim(candidate.raw_span, normalizeForMatch(rawSource));
}

/** A single-regex lexical scan against a partition-scoped surface index. */
export const detectLexicon: EntityDetector = (units, context) => {
  const matcher = context.registryIndex.surfaceMatcher;
  if (!matcher) return [];
  const candidates: RawCandidate[] = [];
  for (const unit of units) {
    if (!unit.normalizedText) continue;
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(unit.normalizedText)) !== null) {
      const term = match[0] ?? "";
      if (!term || !validSurfaceBoundary(unit.normalizedText, match.index, term)) continue;
      const candidate = candidateFromNormalizedMatch(unit, context, "lexicon", match.index, term);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
};

function patternDetectors(detectors: OntologyLinkDetector[]): Array<{ form: string; flags?: string }> {
  const patterns: Array<{ form: string; flags?: string }> = [];
  for (const detector of detectors) {
    if (detector === "pattern") continue; // The preset macro has no consumer form by itself.
    if (typeof detector === "object" && "pattern" in detector) {
      patterns.push({ form: detector.pattern.form, ...(detector.pattern.flags ? { flags: detector.pattern.flags } : {}) });
    }
  }
  return patterns;
}

/** Regex-form detector; membership is required before a candidate can exist. */
export function detectPattern(units: SourceUnit[], context: DetectorContext, detectors: OntologyLinkDetector[]): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  for (const pattern of patternDetectors(detectors)) {
    const flags = `${pattern.flags ?? ""}`.replace(/y/gu, "").includes("g")
      ? `${pattern.flags ?? ""}`.replace(/y/gu, "")
      : `${pattern.flags ?? ""}`.replace(/y/gu, "") + "g";
    const regex = new RegExp(pattern.form, flags);
    for (const unit of units) {
      if (unit.documentStart === undefined || unit.documentEnd === undefined) continue;
      const source = context.rawSource.slice(unit.documentStart, unit.documentEnd);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(source)) !== null) {
        const rawSpan = match[0] ?? "";
        if (!rawSpan) {
          regex.lastIndex += 1;
          continue;
        }
        const normalized = context.normalizer(rawSpan);
        // This is the non-negotiable range/enum anti-invention gate.
        if (!context.registryIndex.membership.has(normalized)) continue;
        const start = unit.documentStart + match.index;
        const end = start + rawSpan.length;
        candidates.push({
          node_type: "",
          detector: "pattern",
          raw_span: rawSpan,
          source_file: context.sourceFile,
          page: unit.page,
          offsets: { start, end },
        });
      }
    }
  }
  return candidates;
}

function registryIndexKey(registryId: string, partition: string | null, normalizerHash: string): string {
  return `${registryId}\0${partition ?? ""}\0${normalizerHash}`;
}

function addKey(index: Map<string, Set<string>>, key: string, id: string): void {
  const ids = index.get(key) ?? new Set<string>();
  ids.add(id);
  index.set(key, ids);
}

export function buildRegistryIndex(
  registryId: string,
  partition: string | null,
  normalizerHash: string,
  normalizer: EntityNormalizer,
  records: RegistryRecord[],
): RegistryIndex {
  const labelIds = new Map<string, Set<string>>();
  const aliasIds = new Map<string, Set<string>>();
  const membership = new Set<string>();
  const ids = new Set<string>();
  const surfaceTerms = new Set<string>();
  for (const record of records) {
    if ((record.partition ?? null) !== partition) continue;
    ids.add(record.id);
    const label = normalizer(record.label);
    addKey(labelIds, label, record.id);
    membership.add(label);
    const labelSurface = normalizeForMatch(record.label);
    if (labelSurface) surfaceTerms.add(labelSurface);
    for (const alias of record.aliases) {
      const normalized = normalizer(alias);
      addKey(aliasIds, normalized, record.id);
      membership.add(normalized);
      const aliasSurface = normalizeForMatch(alias);
      if (aliasSurface) surfaceTerms.add(aliasSurface);
    }
  }
  const terms = Array.from(surfaceTerms).sort((left, right) => right.length - left.length || left.localeCompare(right));
  return {
    registryId,
    partition,
    normalizerHash,
    surfaceMatcher: terms.length > 0 ? new RegExp(terms.map(escapeRegExp).join("|"), "gu") : null,
    labelIds,
    aliasIds,
    membership,
    ids,
  };
}

export function resolveEntityCandidate(
  candidate: RawCandidate,
  registryIndex: RegistryIndex,
  normalizer: EntityNormalizer,
  mode: "exact" | "none",
): { resolution: TypedEntityOccurrenceV1["resolution"]; registryRecordId?: string; candidateIds: string[] } {
  if (mode === "none") return { resolution: "unlinked", candidateIds: [] };
  if (candidate.registry_record_id && registryIndex.ids.has(candidate.registry_record_id)) {
    return { resolution: "linked", registryRecordId: candidate.registry_record_id, candidateIds: [candidate.registry_record_id] };
  }
  const normalized = normalizer(candidate.raw_span);
  const labels = registryIndex.labelIds.get(normalized);
  if (labels && labels.size === 1) {
    const id = Array.from(labels)[0]!;
    return { resolution: "linked", registryRecordId: id, candidateIds: [id] };
  }
  if (labels && labels.size > 1) return { resolution: "ambiguous", candidateIds: Array.from(labels).sort() };
  const aliases = registryIndex.aliasIds.get(normalized);
  if (aliases && aliases.size === 1) {
    const id = Array.from(aliases)[0]!;
    return { resolution: "linked", registryRecordId: id, candidateIds: [id] };
  }
  if (aliases && aliases.size > 1) return { resolution: "ambiguous", candidateIds: Array.from(aliases).sort() };
  return { resolution: "unlinked", candidateIds: [] };
}

function sourceLabel(root: string, sourceFile: string): string {
  const rel = relative(root, sourceFile);
  return rel && !rel.startsWith(`..${sep}`) && rel !== ".." ? rel.split(sep).join("/") : resolve(sourceFile);
}

function partitionFor(
  linking: NormalizedOntologyNodeTypeLinking,
  sourceFile: string,
  parsed: ParsedSource,
  root: string,
): string | null {
  const binding = linking.partition_from;
  if (!binding) return null;
  const frontMatter = parsed.frontMatter?.[binding.source_frontmatter];
  if (frontMatter && frontMatter.trim()) return frontMatter.trim();
  const segment = binding.else?.path_segment;
  if (segment === undefined) return null;
  const parts = sourceLabel(root, sourceFile).split("/").filter(Boolean);
  return parts[segment]?.trim() || null;
}

function linkingTypes(
  profile: NormalizedOntologyProfile,
  requestedNodeTypes: string[] | undefined,
  normalizers: Record<string, EntityNormalizer>,
  preset: string | undefined,
): LinkingType[] {
  const allowed = requestedNodeTypes && requestedNodeTypes.length > 0 ? new Set(requestedNodeTypes) : null;
  return Object.entries(profile.node_types)
    .filter(([nodeType, config]) => Boolean(config.linking) && (!allowed || allowed.has(nodeType)))
    .flatMap(([nodeType, config]) => {
      const registryId = config.registry;
      const linking = config.linking;
      const normalizer = normalizers[nodeType];
      if (!registryId || !linking || !normalizer) return [];
      const registryPartitioned = Boolean(profile.registries[registryId]?.partition_column);
      if (!preset) return [{ nodeType, registryId, registryPartitioned, linking, normalizer }];
      const detectors: OntologyLinkDetector[] = preset === "gazetteer-exact"
        ? ["lexicon", "pattern"]
        : preset === "open-extraction"
          ? ["llm"]
          : preset === "hybrid-recall"
            ? ["lexicon", "pattern", "llm"]
            : [];
      if (detectors.length === 0) throw new Error(`unknown link preset ${preset}`);
      return [{
        nodeType,
        registryId,
        registryPartitioned,
        normalizer,
        linking: {
          ...linking,
          preset,
          detect: [...detectors, ...linking.detect.filter((detector) => typeof detector === "object" && "pattern" in detector)],
          resolve: { mode: preset === "open-extraction" ? "none" : "exact" },
        },
      }];
    });
}

function hasLlmDetector(detectors: OntologyLinkDetector[]): boolean {
  return detectors.some((detector) => detector === "llm" || (typeof detector === "object" && "llm" in detector));
}

function compareOccurrences(left: TypedEntityOccurrenceV1, right: TypedEntityOccurrenceV1): number {
  return left.source_file.localeCompare(right.source_file)
    || left.offsets.start - right.offsets.start
    || left.offsets.end - right.offsets.end
    || left.node_type.localeCompare(right.node_type)
    || left.id.localeCompare(right.id);
}

function issue(code: string, severity: LinkValidationIssue["severity"], nodeType: string | null, message: string, refs: string[]): LinkValidationIssue {
  return { code, severity, node_type: nodeType, message, refs };
}

/** Execute the deterministic producer pass without writing artifacts. */
export function linkEntities(input: EntityLinkingInput): EntityLinkingResult {
  const normalizers = compileNormalizerByNodeType(input.profile);
  const types = linkingTypes(input.profile, input.nodeTypes, normalizers, input.preset);
  if (types.length === 0) return { occurrences: [], issues: [], scannedDocuments: 0, noOp: true };

  const issues: LinkValidationIssue[] = [];
  const deduped = new Map<string, RawCandidate & { nodeType: LinkingType; partition: string | null }>();
  const indexCache = new Map<string, RegistryIndex>();
  let scannedDocuments = 0;

  for (const nodeType of types) {
    if (!hasLlmDetector(nodeType.linking.detect)) continue;
    issues.push(issue(
      "LINK_LLM_DETECTOR_UNAVAILABLE",
      "warning",
      nodeType.nodeType,
      `preset ${nodeType.linking.preset ?? "custom"} requires L4b / llm detector not yet available`,
      [`registry:${nodeType.registryId}`],
    ));
  }

  for (const rawPath of Array.from(new Set(input.sourceFiles.map((file) => resolve(file)))).sort()) {
    let rawSource: string;
    try {
      rawSource = readFileSync(rawPath, "utf-8");
    } catch (error) {
      issues.push(issue("LINK_SOURCE_UNREADABLE", "warning", null, `could not read ${rawPath}: ${error instanceof Error ? error.message : String(error)}`, [`source:${rawPath}`]));
      continue;
    }
    const parsed = parseSource(rawSource, detectModality(rawPath));
    const label = sourceLabel(input.root, rawPath);
    scannedDocuments += 1;
    for (const nodeType of types) {
      const partition = partitionFor(nodeType.linking, rawPath, parsed, input.root);
      if (nodeType.registryPartitioned && !partition) {
        // Fail closed before a registry index or detector is constructed.
        issues.push(issue(
          "LINK_PARTITION_UNRESOLVED",
          "error",
          nodeType.nodeType,
          `partitioned registry ${nodeType.registryId} has no resolved partition for ${label}; detection skipped`,
          [`source:${label}`, `registry:${nodeType.registryId}`],
        ));
        continue;
      }
      const key = registryIndexKey(nodeType.registryId, partition, nodeType.linking.normalizer.normalizer_hash);
      let registryIndex = indexCache.get(key);
      if (!registryIndex) {
        registryIndex = buildRegistryIndex(
          nodeType.registryId,
          partition,
          nodeType.linking.normalizer.normalizer_hash,
          nodeType.normalizer,
          input.registries[nodeType.registryId] ?? [],
        );
        indexCache.set(key, registryIndex);
      }
      const context: DetectorContext = { rawSource, sourceFile: label, normalizer: nodeType.normalizer, registryIndex };
      const candidates: RawCandidate[] = [];
      if (nodeType.linking.detect.some((detector) => detector === "lexicon")) candidates.push(...detectLexicon(parsed.units, context));
      if (nodeType.linking.detect.some((detector) => detector === "pattern" || (typeof detector === "object" && "pattern" in detector))) {
        candidates.push(...detectPattern(parsed.units, context, nodeType.linking.detect));
      }
      for (const candidate of candidates) {
        candidate.node_type = nodeType.nodeType;
        // The source slice check is stronger than the normalised verifier and
        // keeps the occurrence coordinate system pinned to the raw file.
        if (
          !verifyRawCandidate(rawSource, candidate)
        ) {
          issues.push(issue(
            "LINK_VERBATIM_UNRELOCATABLE",
            "warning",
            nodeType.nodeType,
            `candidate ${JSON.stringify(candidate.raw_span)} could not be verified verbatim in ${label}`,
            [`source:${label}`],
          ));
          continue;
        }
        const keyForCandidate = [input.profile.profile_hash, label, nodeType.nodeType, candidate.offsets.start, candidate.offsets.end].join("|");
        const previous = deduped.get(keyForCandidate);
        if (!previous || DETECTOR_PRIORITY[candidate.detector] < DETECTOR_PRIORITY[previous.detector]) {
          deduped.set(keyForCandidate, { ...candidate, nodeType, partition });
        }
      }
    }
  }

  const occurrences: TypedEntityOccurrenceV1[] = [];
  for (const candidate of deduped.values()) {
    const type = candidate.nodeType;
    const key = registryIndexKey(type.registryId, candidate.partition, type.linking.normalizer.normalizer_hash);
    const registryIndex = indexCache.get(key)!;
    const resolution = resolveEntityCandidate(candidate, registryIndex, type.normalizer, type.linking.resolve.mode);
    const id = sha256([input.profile.profile_hash, candidate.source_file, type.nodeType, candidate.offsets.start, candidate.offsets.end].join("|")).slice(0, 24);
    const occurrence: TypedEntityOccurrenceV1 = {
      id,
      node_type: type.nodeType,
      raw_span: candidate.raw_span,
      normalized: type.normalizer(candidate.raw_span),
      source_file: candidate.source_file,
      page: candidate.page,
      offsets: candidate.offsets,
      detector: candidate.detector,
      resolution: resolution.resolution,
      registry_partition: type.registryPartitioned ? candidate.partition : null,
      ...(resolution.registryRecordId ? { registry_record_id: resolution.registryRecordId } : {}),
    };
    occurrences.push(occurrence);
    if (resolution.resolution === "ambiguous") {
      issues.push(issue(
        "LINK_RESOLUTION_AMBIGUOUS",
        "warning",
        type.nodeType,
        `${occurrence.raw_span} resolves to multiple registry records`,
        [`occurrence:${id}`, ...resolution.candidateIds.map((recordId) => `record:${recordId}`)],
      ));
    }
  }
  const allowedOccurrenceTypes = new Set(input.profile.outputs.ontology.occurrence_node_types);
  return {
    occurrences: occurrences.filter((occurrence) => allowedOccurrenceTypes.has(occurrence.node_type)).sort(compareOccurrences),
    issues,
    scannedDocuments,
    noOp: false,
  };
}

function readNodeIdentityMap(outputDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const path = join(outputDir, "nodes.json");
  if (!existsSync(path)) return map;
  try {
    const nodes = JSON.parse(readFileSync(path, "utf-8")) as Array<Record<string, unknown>>;
    if (!Array.isArray(nodes)) return map;
    for (const node of nodes) {
      const nodeId = typeof node.id === "string" ? node.id : "";
      const registryId = typeof node.registry_id === "string" ? node.registry_id : "";
      const recordId = typeof node.registry_record_id === "string" ? node.registry_record_id : "";
      const partition = typeof node.registry_partition === "string" ? node.registry_partition : "";
      if (nodeId && registryId && recordId) map.set(`${registryId}\0${partition}\0${recordId}`, nodeId);
    }
  } catch {
    // The Studio sidecar is best-effort; a later ontology output can supply nodes.
  }
  return map;
}

function registrySeedNodeId(registryId: string, recordId: string): string {
  const safe = (value: string) => value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `registry_${safe(registryId)}_${safe(recordId)}`;
}

/** Aggregate linked mention occurrences into the legacy Studio node-id view. */
export function summarizeEntityOccurrences(
  occurrences: TypedEntityOccurrenceV1[],
  profile: NormalizedOntologyProfile,
  outputDir: string,
): Record<string, EntityOccurrenceSummary> {
  const nodeIds = readNodeIdentityMap(outputDir);
  const summary = new Map<string, { total: number; documents: Map<string, number>; snippets: string[] }>();
  for (const occurrence of occurrences) {
    if (occurrence.resolution !== "linked" || !occurrence.registry_record_id) continue;
    const registryId = profile.node_types[occurrence.node_type]?.registry;
    if (!registryId) continue;
    const key = `${registryId}\0${occurrence.registry_partition ?? ""}\0${occurrence.registry_record_id}`;
    // Registry extraction owns this stable seed id. The fallback lets link emit
    // the Studio summary before a subsequent ontology-output compile materializes
    // nodes.json, while an existing compiled node remains authoritative.
    const nodeId = nodeIds.get(key) ?? registrySeedNodeId(registryId, occurrence.registry_record_id);
    const entry = summary.get(nodeId) ?? { total: 0, documents: new Map<string, number>(), snippets: [] as string[] };
    entry.total += 1;
    entry.documents.set(occurrence.source_file, (entry.documents.get(occurrence.source_file) ?? 0) + 1);
    if (entry.snippets.length < 3 && !entry.snippets.includes(occurrence.raw_span)) entry.snippets.push(occurrence.raw_span);
    summary.set(nodeId, entry);
  }
  return Object.fromEntries(Array.from(summary.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([nodeId, entry]) => [
    nodeId,
    {
      total: entry.total,
      documents: Object.fromEntries(Array.from(entry.documents.entries()).sort(([left], [right]) => left.localeCompare(right))),
      snippets: entry.snippets,
    },
  ]));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/** Write the canonical list and derived Studio sidecar after a non-dry link run. */
export function writeEntityLinkingArtifacts(
  outputDir: string,
  profile: NormalizedOntologyProfile,
  result: EntityLinkingResult,
): void {
  writeJson(join(outputDir, "occurrences.json"), result.occurrences);
  writeJson(join(outputDir, "entity-occurrence-summary.json"), summarizeEntityOccurrences(result.occurrences, profile, outputDir));
  writeJson(join(outputDir, "validation.json"), {
    schema: "graphify_ontology_validation_v1",
    issues: result.issues,
  });
}
