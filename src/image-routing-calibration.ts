import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { ImageDataprepManifest } from "./image-dataprep.js";

export type ImageRoutingLabel =
  | "primary_sufficient"
  | "deep_useful_for_retrieval"
  | "deep_useful_for_wiki"
  | "deep_required"
  | "ambiguous";

export type ImageRoute = "skip" | "primary" | "deep";
export type ImageRoutingCalibrationDecision = "accept_matrix" | "revise_matrix" | "reject_cascade" | "pending_labels";

export interface ImageRoutingLabelEntry {
  artifact_id: string;
  label: ImageRoutingLabel;
  rationale?: string;
}

export interface ImageRoutingLabelsFile {
  schema: "graphify_image_routing_labels_v1";
  labels: ImageRoutingLabelEntry[];
}

export interface ImageRoutingRuleBucket {
  visual_content_types?: string[];
  when?: {
    min_relationship_candidates?: number;
    min_entity_candidates?: number;
  };
}

export interface ImageRoutingRulesFile {
  schema: "graphify_image_routing_rules_v1";
  decision: ImageRoutingCalibrationDecision;
  routes: {
    skip?: ImageRoutingRuleBucket;
    primary?: ImageRoutingRuleBucket;
    deep?: ImageRoutingRuleBucket;
  };
}

export interface ImageRoutingSample {
  artifact_id: string;
  visual_content_type: string;
  entity_count: number;
  relationship_count: number;
}

export interface ImageRoutingDecision {
  route: ImageRoute;
  reasons: string[];
}

export interface ImageRoutingCalibrationInput {
  labels: ImageRoutingLabelsFile;
  rules: ImageRoutingRulesFile;
  samples: ImageRoutingSample[];
}

export interface ImageRoutingCalibrationResult {
  decision: ImageRoutingCalibrationDecision;
  metrics: {
    total: number;
    routed_skip: number;
    routed_primary: number;
    routed_deep: number;
    false_primary: number;
    false_deep: number;
    missing_labels: number;
    ambiguous_labels: number;
    deep_ratio: number;
  };
  comparisons: Array<{
    artifact_id: string;
    label: ImageRoutingLabel | null;
    route: ImageRoute;
    outcome: "match" | "false_primary" | "false_deep" | "pending_label";
    reasons: string[];
  }>;
}

export interface ImageRoutingSamplesFile {
  schema: "graphify_image_routing_samples_v1";
  run_id: string;
  sample_count: number;
  samples: ImageRoutingSample[];
}

export interface WriteImageRoutingCalibrationSamplesOptions {
  manifest: ImageDataprepManifest;
  captionsDir: string;
  outputDir: string;
  runId: string;
  maxSamples?: number;
}

export interface WriteImageRoutingCalibrationSamplesResult {
  runDir: string;
  samplesPath: string;
  sampleCount: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseFile(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  return path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function imageRoutingSampleFromCaption(artifactId: string, caption: unknown): ImageRoutingSample {
  const record = asRecord(caption);
  const visualType = typeof record.visual_content_type === "string" && record.visual_content_type.trim()
    ? record.visual_content_type
    : "unknown";
  return {
    artifact_id: artifactId,
    visual_content_type: visualType,
    entity_count: countArray(record.entity_candidates),
    relationship_count: countArray(record.relationship_candidates),
  };
}

function normalizeBucket(value: unknown): ImageRoutingRuleBucket {
  const record = asRecord(value);
  const when = asRecord(record.when);
  return {
    visual_content_types: stringArray(record.visual_content_types),
    when: {
      min_relationship_candidates: numberValue(when.min_relationship_candidates),
      min_entity_candidates: numberValue(when.min_entity_candidates),
    },
  };
}

export function loadImageRoutingLabels(path: string): ImageRoutingLabelsFile {
  const record = asRecord(parseFile(path));
  if (record.schema !== "graphify_image_routing_labels_v1") {
    throw new Error("Image routing labels schema must be graphify_image_routing_labels_v1");
  }
  return {
    schema: "graphify_image_routing_labels_v1",
    labels: Array.isArray(record.labels)
      ? record.labels.map((item) => {
        const label = asRecord(item);
        return {
          artifact_id: String(label.artifact_id ?? ""),
          label: String(label.label ?? "") as ImageRoutingLabel,
          rationale: typeof label.rationale === "string" ? label.rationale : undefined,
        };
      })
      : [],
  };
}

export function loadImageRoutingRules(path: string): ImageRoutingRulesFile {
  const record = asRecord(parseFile(path));
  if (record.schema !== "graphify_image_routing_rules_v1") {
    throw new Error("Image routing rules schema must be graphify_image_routing_rules_v1");
  }
  const routes = asRecord(record.routes);
  return {
    schema: "graphify_image_routing_rules_v1",
    decision: String(record.decision ?? "pending_labels") as ImageRoutingCalibrationDecision,
    routes: {
      skip: routes.skip === undefined ? undefined : normalizeBucket(routes.skip),
      primary: routes.primary === undefined ? undefined : normalizeBucket(routes.primary),
      deep: routes.deep === undefined ? undefined : normalizeBucket(routes.deep),
    },
  };
}

export function assertAcceptedImageRoutingRules(rules: ImageRoutingRulesFile): void {
  if (rules.decision !== "accept_matrix") {
    throw new Error("Image routing production cascade requires an accepted routing matrix (decision: accept_matrix)");
  }
}

export function writeImageRoutingCalibrationSamples(
  options: WriteImageRoutingCalibrationSamplesOptions,
): WriteImageRoutingCalibrationSamplesResult {
  const maxSamples = Math.max(0, Math.floor(options.maxSamples ?? options.manifest.artifacts.length));
  const allSamples = options.manifest.artifacts
    .map((artifact) => {
      const caption = parseFile(join(options.captionsDir, `${artifact.id}.caption.json`));
      return imageRoutingSampleFromCaption(artifact.id, caption);
    })
    .sort((left, right) => left.visual_content_type.localeCompare(right.visual_content_type) ||
      left.artifact_id.localeCompare(right.artifact_id));

  const selected = new Map<string, ImageRoutingSample>();
  const seenTypes = new Set<string>();
  for (const sample of allSamples) {
    if (selected.size >= maxSamples) break;
    if (seenTypes.has(sample.visual_content_type)) continue;
    selected.set(sample.artifact_id, sample);
    seenTypes.add(sample.visual_content_type);
  }
  for (const sample of allSamples.sort((left, right) => left.artifact_id.localeCompare(right.artifact_id))) {
    if (selected.size >= maxSamples) break;
    selected.set(sample.artifact_id, sample);
  }

  const samples = [...selected.values()].sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  const runDir = join(options.outputDir, options.runId);
  const samplesPath = join(runDir, "samples.json");
  const payload: ImageRoutingSamplesFile = {
    schema: "graphify_image_routing_samples_v1",
    run_id: options.runId,
    sample_count: samples.length,
    samples,
  };
  mkdirSync(runDir, { recursive: true });
  writeFileSync(samplesPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  return { runDir, samplesPath, sampleCount: samples.length };
}

function bucketMatches(bucket: ImageRoutingRuleBucket | undefined, sample: ImageRoutingSample): boolean {
  if (!bucket) return false;
  const types = bucket.visual_content_types ?? [];
  if (types.length > 0 && !types.includes(sample.visual_content_type)) return false;
  const minRelationships = bucket.when?.min_relationship_candidates;
  if (minRelationships !== undefined && sample.relationship_count < minRelationships) return false;
  const minEntities = bucket.when?.min_entity_candidates;
  if (minEntities !== undefined && sample.entity_count < minEntities) return false;
  return types.length > 0 || minRelationships !== undefined || minEntities !== undefined;
}

export function routeImageWithRules(rules: ImageRoutingRulesFile, sample: ImageRoutingSample): ImageRoutingDecision {
  for (const route of ["deep", "primary", "skip"] as const) {
    const bucket = rules.routes[route];
    if (bucketMatches(bucket, sample)) {
      const reasons = [`visual_content_type=${sample.visual_content_type} matched ${route}`];
      if (bucket?.when?.min_relationship_candidates !== undefined) {
        reasons.push(`relationship_count>=${bucket.when.min_relationship_candidates}`);
      }
      if (bucket?.when?.min_entity_candidates !== undefined) {
        reasons.push(`entity_count>=${bucket.when.min_entity_candidates}`);
      }
      return { route, reasons };
    }
  }
  return { route: "primary", reasons: ["no explicit rule matched; default primary"] };
}

function requiresDeep(label: ImageRoutingLabel | null): boolean {
  return label === "deep_required" || label === "deep_useful_for_wiki" || label === "deep_useful_for_retrieval";
}

export function calibrateImageRouting(input: ImageRoutingCalibrationInput): ImageRoutingCalibrationResult {
  const labels = new Map(input.labels.labels.map((entry) => [entry.artifact_id, entry.label]));
  const comparisons: ImageRoutingCalibrationResult["comparisons"] = [];
  let falsePrimary = 0;
  let falseDeep = 0;
  let missingLabels = 0;
  let ambiguousLabels = 0;
  let routedSkip = 0;
  let routedPrimary = 0;
  let routedDeep = 0;

  for (const sample of input.samples) {
    const label = labels.get(sample.artifact_id) ?? null;
    const routing = routeImageWithRules(input.rules, sample);
    if (routing.route === "skip") routedSkip++;
    if (routing.route === "primary") routedPrimary++;
    if (routing.route === "deep") routedDeep++;

    let outcome: ImageRoutingCalibrationResult["comparisons"][number]["outcome"] = "match";
    if (!label) {
      missingLabels++;
      outcome = "pending_label";
    } else if (label === "ambiguous") {
      ambiguousLabels++;
      outcome = "pending_label";
    } else if (requiresDeep(label) && routing.route !== "deep") {
      falsePrimary++;
      outcome = "false_primary";
    } else if (label === "primary_sufficient" && routing.route === "deep") {
      falseDeep++;
      outcome = "false_deep";
    }

    comparisons.push({
      artifact_id: sample.artifact_id,
      label,
      route: routing.route,
      outcome,
      reasons: routing.reasons,
    });
  }

  const decision: ImageRoutingCalibrationDecision = missingLabels > 0 || ambiguousLabels > 0
    ? "pending_labels"
    : falsePrimary > 0
      ? "revise_matrix"
      : input.samples.length === 0
        ? "pending_labels"
        : "accept_matrix";

  return {
    decision,
    metrics: {
      total: input.samples.length,
      routed_skip: routedSkip,
      routed_primary: routedPrimary,
      routed_deep: routedDeep,
      false_primary: falsePrimary,
      false_deep: falseDeep,
      missing_labels: missingLabels,
      ambiguous_labels: ambiguousLabels,
      deep_ratio: input.samples.length === 0 ? 0 : routedDeep / input.samples.length,
    },
    comparisons,
  };
}
