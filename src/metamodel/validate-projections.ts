import { posix } from "node:path";
import type { JsonValue } from "../json-value.js";
import type { LineageId } from "../metamodel-contracts.js";
import { isRecord } from "../profile-validate.js";
import type { MetamodelValidationContext } from "./types.js";
import {
  addError,
  exactStringTuple,
  isNonEmptyString,
  isStringArray,
  rejectUnknownKeys,
  type ValidationSink,
} from "./validate-common.js";

const TRACK_CORE_FIELDS = ["id", "type", "aggregate", "aggregateId", "at", "by", "payload"] as const;
const TRACK_OPTIONAL_CORE_FIELDS = ["prov", "clientToken", "cmdId", "cmd"] as const;
const TRACK_FRAME_FIELDS = ["seq", "prevHash", "contentHash"] as const;

const CONTROL_OR_WHITESPACE_RE = /[\s\x00-\x1f\x7f]/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:/;
const PLACEHOLDER_TOKEN_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const H2A_OVERLAY_TIERS: ReadonlySet<string> = new Set(["repo", "workspace", "worktree"]);
const TRACK_PROJECTION_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "content_mode",
  "root_dir",
  "event_journal",
  "head_anchor",
  "state_snapshot",
  "owner_table_inputs",
  "link_fingerprint_sidecar",
]);
const TRACK_EVENT_JOURNAL_KEYS: ReadonlySet<string> = new Set([
  "relative_path_template",
  "format",
  "forbid_header_lines",
  "aggregates",
  "event_types",
  "order_by",
  "frame_integrity",
  "envelope_contract",
]);
const TRACK_ENVELOPE_CONTRACT_KEYS: ReadonlySet<string> = new Set([
  "core_fields",
  "optional_core_fields",
  "frame_fields",
]);
const TRACK_STATE_SNAPSHOT_KEYS: ReadonlySet<string> = new Set([
  "relative_path_template",
  "schema",
  "include_collections",
  "report_sections",
  "status_vocabulary",
  "stage_vocabulary",
  "remaining_work_realizations",
]);
const TRACK_HEAD_ANCHOR_KEYS: ReadonlySet<string> = new Set(["relative_path_template", "format"]);
const TRACK_OWNER_TABLE_INPUTS_KEYS: ReadonlySet<string> = new Set([
  "required_folded_collections",
  "required_event_stream_lookbacks",
  "options_fields",
  "confidentiality_policy_contract",
]);
const TRACK_LINK_FINGERPRINT_SIDECAR_KEYS: ReadonlySet<string> = new Set([
  "relative_path_template",
  "schema",
  "hash_algorithm",
]);
const H2A_PROJECTION_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "root_dir",
  "relative_path_template",
  "relative_path_templates",
  "precedence",
  "format",
  "include_node_types",
  "order_by",
  "projected_fields",
]);

export interface CanonicalConfinedPath {
  readonly normalized: string;
  readonly touchesTrack: boolean;
  readonly safe: boolean;
}

function isHexCharCode(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

/** Single-pass O(n) stack decoder resolving percent-encoding to its exact fixpoint at arbitrary depth. */
function decodePercentToFixpoint(rawPath: string): { readonly decoded: string; readonly hadEncoding: boolean } {
  const stack: string[] = [];
  let hadEncoding = false;
  for (let i = 0; i < rawPath.length; i += 1) {
    stack.push(rawPath[i]!);
    while (
      stack.length >= 3 &&
      stack[stack.length - 3] === "%" &&
      isHexCharCode(stack[stack.length - 2]!.charCodeAt(0)) &&
      isHexCharCode(stack[stack.length - 1]!.charCodeAt(0))
    ) {
      const lo = stack.pop()!;
      const hi = stack.pop()!;
      stack.pop();
      hadEncoding = true;
      stack.push(String.fromCharCode(Number.parseInt(hi + lo, 16)));
    }
  }
  return { decoded: stack.join(""), hadEncoding };
}

function hasTrackPathSegment(separatorNormalizedPath: string): boolean {
  return separatorNormalizedPath.split("/").some((seg) => {
    const lower = seg.trim().toLowerCase();
    if (lower === ".track" || lower === "track.ontology.yaml") return true;
    const stripped = lower.replace(/\{[^{}]*\}/g, "");
    return stripped === ".track" || stripped === "track.ontology.yaml";
  });
}

function hasUnsafePlaceholderInSegment(segment: string): boolean {
  let depth = 0;
  let start = -1;
  let placeholderCount = 0;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === "{") {
      if (depth > 0) return true;
      depth = 1;
      start = i + 1;
    } else if (ch === "}") {
      if (depth === 0) return true;
      const token = segment.slice(start, i);
      if (!PLACEHOLDER_TOKEN_RE.test(token)) return true;
      placeholderCount += 1;
      depth = 0;
    }
  }
  if (depth !== 0) return true;
  if (placeholderCount === 0) return false;
  if (segment.includes("}{")) return true;
  const staticChars = segment.replace(/\{[^{}]*\}/g, "");
  return staticChars === "." || staticChars === ".." || staticChars.includes("..");
}

/**
 * Single canonical path confinement analyzer used by every path & cross-lineage guard:
 * fixpoint percent-decode -> separator normalise -> posix.normalize -> refuse absolute,
 * refuse any "", ".", or ".." segment after normalisation, and refuse unsafe placeholders.
 */
export function canonicalizeConfinedPath(rawPath: string): CanonicalConfinedPath {
  const { decoded, hadEncoding } = decodePercentToFixpoint(rawPath);
  const hasControlOrWs = CONTROL_OR_WHITESPACE_RE.test(rawPath) || CONTROL_OR_WHITESPACE_RE.test(decoded);
  const separatorNormalized = decoded.replace(/[\x00-\x1f\x7f]/g, "").replace(/\\/g, "/").trim();
  const normalized = posix.normalize(separatorNormalized);
  const touchesTrack = hasTrackPathSegment(separatorNormalized);

  if (hasControlOrWs || hadEncoding || decoded.includes("%") || rawPath.includes("\\")) {
    return { normalized, touchesTrack, safe: false };
  }
  if (normalized.startsWith("/") || WINDOWS_DRIVE_RE.test(normalized)) {
    return { normalized, touchesTrack, safe: false };
  }
  const segments = normalized.split("/");
  if (segments.some((seg) => seg === "" || seg === "." || seg === "..")) {
    return { normalized, touchesTrack, safe: false };
  }
  if (normalized !== separatorNormalized) {
    return { normalized, touchesTrack, safe: false };
  }
  if (segments.some((seg) => hasUnsafePlaceholderInSegment(seg))) {
    return { normalized, touchesTrack, safe: false };
  }
  return { normalized, touchesTrack, safe: true };
}

function checkConfinedRootDir(
  rawRoot: unknown,
  expectedRoot: ".track" | ".h2a",
  diagPath: string,
  sink: ValidationSink,
  forbidTrackCrossMutation = false,
): void {
  if (rawRoot === expectedRoot) return;
  if (forbidTrackCrossMutation && typeof rawRoot === "string" && canonicalizeConfinedPath(rawRoot).touchesTrack) {
    addError(
      sink,
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      diagPath,
      `h2a-harness-overlay root_dir must not target Track path ${rawRoot}`,
    );
    return;
  }
  addError(sink, "MM_FILE_SHAPE_PATH_ESCAPE", diagPath, `root_dir must be '${expectedRoot}'`);
}

function checkScopedRelativePath(
  rawPath: unknown,
  rootDir: ".track" | ".h2a",
  diagPath: string,
  sink: ValidationSink,
  forbidTrackCrossMutation = false,
): void {
  if (!isNonEmptyString(rawPath)) {
    addError(sink, "MM_FILE_SHAPE_PATH_ESCAPE", diagPath, "relative_path_template must be a non-empty string");
    return;
  }
  const canonical = canonicalizeConfinedPath(rawPath);
  if (forbidTrackCrossMutation && canonical.touchesTrack) {
    addError(
      sink,
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      diagPath,
      `h2a harness overlay must never target Track path ${rawPath}`,
    );
    return;
  }
  if (!canonical.safe || !canonical.normalized.startsWith(`${rootDir}/`)) {
    addError(
      sink,
      "MM_FILE_SHAPE_PATH_ESCAPE",
      diagPath,
      `Path template ${rawPath} escapes confined root_dir ${rootDir}/`,
    );
  }
}

function validateTrackEventJournal(journal: unknown, pPath: string, sink: ValidationSink): void {
  const jPath = `${pPath}.event_journal`;
  if (!isRecord(journal)) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", jPath, "event_journal is required for D29");
    return;
  }
  rejectUnknownKeys(journal, TRACK_EVENT_JOURNAL_KEYS, "MM_FILE_SHAPE_PATH_ESCAPE", jPath, "event_journal", sink);
  checkScopedRelativePath(journal.relative_path_template, ".track", `${jPath}.relative_path_template`, sink);
  if (journal.format !== "track-events-jsonl/v1") {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${jPath}.format`, "event_journal.format must be 'track-events-jsonl/v1'");
  }
  if (journal.forbid_header_lines !== true) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${jPath}.forbid_header_lines`, "event_journal.forbid_header_lines must be true");
  }
  if (!isStringArray(journal.aggregates) || journal.aggregates.length === 0) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${jPath}.aggregates`, "event_journal.aggregates must be a non-empty string array");
  }
  if (!isStringArray(journal.event_types) || journal.event_types.length === 0) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${jPath}.event_types`, "event_journal.event_types must be a non-empty string array");
  }
  if (!exactStringTuple(journal.order_by, ["stream_seq"])) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${jPath}.order_by`, "event_journal.order_by must equal ['stream_seq']");
  }
  if (journal.frame_integrity !== "positional-prevhash-and-aggregate-seq") {
    addError(
      sink,
      "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
      `${jPath}.frame_integrity`,
      "event_journal.frame_integrity must be 'positional-prevhash-and-aggregate-seq'",
    );
  }
  const env = journal.envelope_contract;
  if (!isRecord(env)) {
    addError(
      sink,
      "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
      `${jPath}.envelope_contract`,
      "event_journal.envelope_contract must declare the exact TrackEvent core, optional, and frame fields",
    );
    return;
  }
  rejectUnknownKeys(
    env,
    TRACK_ENVELOPE_CONTRACT_KEYS,
    "MM_FILE_SHAPE_PATH_ESCAPE",
    `${jPath}.envelope_contract`,
    "envelope_contract",
    sink,
  );
  if (
    !exactStringTuple(env.core_fields, TRACK_CORE_FIELDS) ||
    !exactStringTuple(env.optional_core_fields, TRACK_OPTIONAL_CORE_FIELDS) ||
    !exactStringTuple(env.frame_fields, TRACK_FRAME_FIELDS)
  ) {
    addError(
      sink,
      "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
      `${jPath}.envelope_contract`,
      "event_journal.envelope_contract must declare the exact TrackEvent core, optional, and frame fields",
    );
  }
}

function validateTrackStateSnapshot(snapshot: unknown, pPath: string, sink: ValidationSink): void {
  const sPath = `${pPath}.state_snapshot`;
  if (!isRecord(snapshot)) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", sPath, "state_snapshot is required for D29");
    return;
  }
  rejectUnknownKeys(snapshot, TRACK_STATE_SNAPSHOT_KEYS, "MM_FILE_SHAPE_PATH_ESCAPE", sPath, "state_snapshot", sink);
  checkScopedRelativePath(snapshot.relative_path_template, ".track", `${sPath}.relative_path_template`, sink);
  if (snapshot.schema !== "track.state-snapshot/v1" && snapshot.schema !== "track.snapshot/v1") {
    addError(
      sink,
      "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
      `${sPath}.schema`,
      "state_snapshot.schema must be 'track.state-snapshot/v1' or 'track.snapshot/v1'",
    );
  }
  if (!isStringArray(snapshot.include_collections) || snapshot.include_collections.length === 0) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${sPath}.include_collections`, "state_snapshot.include_collections must be a non-empty array");
  }
  if (snapshot.report_sections !== undefined && (!isStringArray(snapshot.report_sections) || snapshot.report_sections.length === 0)) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${sPath}.report_sections`, "state_snapshot.report_sections must be a non-empty string array");
  }
  if (!isStringArray(snapshot.status_vocabulary) || snapshot.status_vocabulary.length === 0) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${sPath}.status_vocabulary`, "state_snapshot.status_vocabulary must be a non-empty array");
  }
  if (!isStringArray(snapshot.stage_vocabulary) || snapshot.stage_vocabulary.length === 0) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${sPath}.stage_vocabulary`, "state_snapshot.stage_vocabulary must be a non-empty array");
  }
  if (!isStringArray(snapshot.remaining_work_realizations) || snapshot.remaining_work_realizations.length === 0) {
    addError(
      sink,
      "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
      `${sPath}.remaining_work_realizations`,
      "state_snapshot.remaining_work_realizations must be a non-empty array",
    );
  }
}

function validateTrackHeadAndSidecar(rawProj: Record<string, JsonValue>, pPath: string, sink: ValidationSink): void {
  const head = rawProj.head_anchor;
  if (!isRecord(head)) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${pPath}.head_anchor`, "head_anchor is required for D29");
  } else {
    rejectUnknownKeys(head, TRACK_HEAD_ANCHOR_KEYS, "MM_FILE_SHAPE_PATH_ESCAPE", `${pPath}.head_anchor`, "head_anchor", sink);
    checkScopedRelativePath(head.relative_path_template, ".track", `${pPath}.head_anchor.relative_path_template`, sink);
    if (head.format !== "track-head/v1") {
      addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${pPath}.head_anchor.format`, "head_anchor.format must be 'track-head/v1'");
    }
  }

  if (rawProj.owner_table_inputs !== undefined) {
    const oti = rawProj.owner_table_inputs;
    if (!isRecord(oti)) {
      addError(
        sink,
        "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
        `${pPath}.owner_table_inputs`,
        "owner_table_inputs must declare non-empty inputs and confidentiality_policy_contract 'track-owner-table-policy/v1'",
      );
    } else {
      rejectUnknownKeys(
        oti,
        TRACK_OWNER_TABLE_INPUTS_KEYS,
        "MM_FILE_SHAPE_PATH_ESCAPE",
        `${pPath}.owner_table_inputs`,
        "owner_table_inputs",
        sink,
      );
      if (
        !isStringArray(oti.required_folded_collections) ||
        oti.required_folded_collections.length === 0 ||
        !isStringArray(oti.required_event_stream_lookbacks) ||
        oti.required_event_stream_lookbacks.length === 0 ||
        !isStringArray(oti.options_fields) ||
        oti.options_fields.length === 0 ||
        oti.confidentiality_policy_contract !== "track-owner-table-policy/v1"
      ) {
        addError(
          sink,
          "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
          `${pPath}.owner_table_inputs`,
          "owner_table_inputs must declare non-empty inputs and confidentiality_policy_contract 'track-owner-table-policy/v1'",
        );
      }
    }
  }

  const sidecar = rawProj.link_fingerprint_sidecar;
  if (!isRecord(sidecar)) {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${pPath}.link_fingerprint_sidecar`, "link_fingerprint_sidecar is required for D29");
  } else {
    rejectUnknownKeys(
      sidecar,
      TRACK_LINK_FINGERPRINT_SIDECAR_KEYS,
      "MM_FILE_SHAPE_PATH_ESCAPE",
      `${pPath}.link_fingerprint_sidecar`,
      "link_fingerprint_sidecar",
      sink,
    );
    checkScopedRelativePath(sidecar.relative_path_template, ".track", `${pPath}.link_fingerprint_sidecar.relative_path_template`, sink);
    if (sidecar.schema !== "engram.track-pr-link-fingerprint/v1") {
      addError(
        sink,
        "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
        `${pPath}.link_fingerprint_sidecar.schema`,
        "link_fingerprint_sidecar.schema must be 'engram.track-pr-link-fingerprint/v1'",
      );
    }
    if (sidecar.hash_algorithm !== "sha256-rfc8785") {
      addError(
        sink,
        "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
        `${pPath}.link_fingerprint_sidecar.hash_algorithm`,
        "link_fingerprint_sidecar.hash_algorithm must be 'sha256-rfc8785'",
      );
    }
  }
}

function validateTrackFileProjection(
  rawProj: Record<string, JsonValue>,
  pPath: string,
  lineage: LineageId | null,
  sink: ValidationSink,
): void {
  if (lineage !== "track") {
    addError(
      sink,
      "MM_FILE_SHAPE_LINEAGE_FORBIDDEN",
      `${pPath}.kind`,
      `track-pr-slice projection is only permitted in lineage 'track' (got ${String(lineage)})`,
    );
    return;
  }
  if (rawProj.content_mode !== "both") {
    addError(sink, "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR", `${pPath}.content_mode`, "D29 requires content_mode === 'both'");
  }
  checkConfinedRootDir(rawProj.root_dir, ".track", `${pPath}.root_dir`, sink);
  for (const [key] of Object.entries(rawProj)) {
    if (!TRACK_PROJECTION_KEYS.has(key)) {
      addError(sink, "MM_FILE_SHAPE_PATH_ESCAPE", `${pPath}.${key}`, `Unknown track-pr-slice key ${key}`);
    }
  }

  validateTrackEventJournal(rawProj.event_journal, pPath, sink);
  validateTrackStateSnapshot(rawProj.state_snapshot, pPath, sink);
  validateTrackHeadAndSidecar(rawProj, pPath, sink);
}

function containsTrackTarget(value: unknown): boolean {
  if (typeof value === "string") return canonicalizeConfinedPath(value).touchesTrack;
  if (Array.isArray(value)) return value.some((item) => containsTrackTarget(item));
  if (isRecord(value)) return Object.entries(value).some(([, entryVal]) => containsTrackTarget(entryVal));
  return false;
}

function validateH2aRelativePathTemplates(rawTemplates: unknown, pPath: string, sink: ValidationSink): void {
  if (rawTemplates === undefined) return;
  if (!isRecord(rawTemplates)) {
    addError(sink, "MM_FILE_SHAPE_PATH_ESCAPE", `${pPath}.relative_path_templates`, "relative_path_templates must be an object");
    return;
  }
  for (const requiredTier of H2A_OVERLAY_TIERS) {
    if (!Object.hasOwn(rawTemplates, requiredTier)) {
      addError(
        sink,
        "MM_FILE_SHAPE_PATH_ESCAPE",
        `${pPath}.relative_path_templates.${requiredTier}`,
        `relative_path_templates requires tier '${requiredTier}'`,
      );
    }
  }
  for (const [tier, templatePath] of Object.entries(rawTemplates)) {
    const tierPath = `${pPath}.relative_path_templates.${tier}`;
    if (!H2A_OVERLAY_TIERS.has(tier)) {
      const isTrackTarget = containsTrackTarget(templatePath);
      addError(
        sink,
        isTrackTarget ? "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN" : "MM_FILE_SHAPE_PATH_ESCAPE",
        tierPath,
        isTrackTarget
          ? `h2a harness overlay must never target Track path ${String(templatePath)}`
          : `Unknown h2a relative_path_templates tier ${tier}`,
      );
    } else {
      checkScopedRelativePath(templatePath, ".h2a", tierPath, sink, true);
    }
  }
}

function validateH2aFileProjection(
  rawProj: Record<string, JsonValue>,
  pPath: string,
  lineage: LineageId | null,
  knownNodeTypes: ReadonlySet<string>,
  sink: ValidationSink,
): void {
  if (lineage !== "h2a") {
    addError(
      sink,
      "MM_FILE_SHAPE_LINEAGE_FORBIDDEN",
      `${pPath}.kind`,
      `h2a-harness-overlay projection is only permitted in lineage 'h2a' (got ${String(lineage)})`,
    );
    return;
  }
  checkConfinedRootDir(rawProj.root_dir, ".h2a", `${pPath}.root_dir`, sink, true);
  for (const [key, val] of Object.entries(rawProj)) {
    if (!H2A_PROJECTION_KEYS.has(key)) {
      const isTrackTarget = containsTrackTarget(val);
      addError(
        sink,
        isTrackTarget ? "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN" : "MM_FILE_SHAPE_PATH_ESCAPE",
        `${pPath}.${key}`,
        isTrackTarget
          ? `h2a-harness-overlay key ${key} must never target Track path ${String(val)}`
          : `Unknown h2a-harness-overlay key ${key}`,
      );
    }
  }
  if (rawProj.precedence !== undefined && rawProj.precedence !== "tighten-only") {
    addError(sink, "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN", `${pPath}.precedence`, "h2a-harness-overlay precedence must be 'tighten-only'");
  }

  checkScopedRelativePath(rawProj.relative_path_template, ".h2a", `${pPath}.relative_path_template`, sink, true);
  validateH2aRelativePathTemplates(rawProj.relative_path_templates, pPath, sink);

  if (rawProj.format !== "json" && rawProj.format !== "yaml") {
    addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", `${pPath}.format`, "h2a-harness-overlay format must be 'json' or 'yaml'");
  }
  if (!isStringArray(rawProj.include_node_types) || rawProj.include_node_types.length === 0) {
    addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", `${pPath}.include_node_types`, "include_node_types must be a non-empty array");
  } else {
    rawProj.include_node_types.forEach((nt, idx) => {
      if (nt.includes(":")) {
        addError(
          sink,
          "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
          `${pPath}.include_node_types[${idx}]`,
          `file_projections must not project external lineage type ${nt}`,
        );
      } else if (!knownNodeTypes.has(nt)) {
        addError(
          sink,
          "MM_REL_UNKNOWN_ENDPOINT_TYPE",
          `${pPath}.include_node_types[${idx}]`,
          `include_node_types references unknown local node type ${nt}`,
        );
      }
    });
  }
  if (!exactStringTuple(rawProj.order_by, ["entity_id"])) {
    addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", `${pPath}.order_by`, "order_by must equal ['entity_id']");
  }
  if (!isStringArray(rawProj.projected_fields) || rawProj.projected_fields.length === 0) {
    addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", `${pPath}.projected_fields`, "projected_fields must be a non-empty array");
  }
}

export function validateFileProjectionsAndOverlay(
  doc: Record<string, JsonValue>,
  lineage: LineageId | null,
  knownNodeTypes: ReadonlySet<string>,
  context: MetamodelValidationContext | undefined,
  sink: ValidationSink,
): void {
  if (doc.file_projections !== undefined) {
    if (!isRecord(doc.file_projections)) {
      addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", "file_projections", "file_projections must be a plain object");
    } else {
      for (const [projId, rawProj] of Object.entries(doc.file_projections)) {
        const pPath = `file_projections.${projId}`;
        if (!isRecord(rawProj)) {
          addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", pPath, "File projection entry must be a plain object");
          continue;
        }
        if (rawProj.kind === "track-pr-slice") {
          validateTrackFileProjection(rawProj, pPath, lineage, sink);
        } else if (rawProj.kind === "h2a-harness-overlay") {
          validateH2aFileProjection(rawProj, pPath, lineage, knownNodeTypes, sink);
        } else {
          addError(sink, "MM_FILE_SHAPE_LINEAGE_FORBIDDEN", `${pPath}.kind`, `Unsupported file projection kind ${String(rawProj.kind)}`);
        }
      }
    }
  }

  const overlayCheck = context?.overlayCheck;
  if (!overlayCheck) return;
  if (overlayCheck.relaxesCeilings === true) {
    addError(
      sink,
      "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
      "overlayCheck.relaxesCeilings",
      "Harness overlay must not relax master-harness or Track control ceilings",
    );
  }
  for (const targetPath of overlayCheck.targetPaths ?? []) {
    checkScopedRelativePath(targetPath, ".h2a", "overlayCheck.targetPaths", sink, true);
  }
  for (const mutatedLineage of overlayCheck.mutatesLineages ?? []) {
    if (mutatedLineage !== "h2a") {
      addError(
        sink,
        "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
        "overlayCheck.mutatesLineages",
        `Harness overlay must not mutate lineage ${mutatedLineage}`,
      );
    }
  }
}
