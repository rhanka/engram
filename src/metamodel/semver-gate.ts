import { toJsonValue, type JsonValue } from "../json-value.js";
import { canonicalBytes } from "../ontology-guardian/canonical.js";
import type { MappingFile } from "../ontology-guardian/types.js";
import { isRecord } from "../profile-validate.js";
import type { MetamodelDiagnostic, MetamodelDiagnosticCode } from "./diagnostics.js";
import type {
  DeclaredBreakingRename,
  MetamodelTemplateDocument,
  RegisteredTemplateRecord,
} from "./types.js";
import {
  addError,
  compareSemVer,
  isNonEmptyString,
  isStringArray,
  parseSemVer,
  type ValidationSink,
} from "./validate-common.js";
import { parseAndProjectInput, validateIdentity } from "./validate-syntax.js";

/** Explicit total order of transition authorities from least restrictive (0) to most restrictive (5) (m-4 / Ruling d). */
export const AUTHORITY_ORDER = [
  "author",
  "third-party-reviewer",
  "track-control",
  "h2a-mandate",
  "mandated-act",
  "own-act-human",
] as const;

export const AUTHORITY_RANK: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(AUTHORITY_ORDER.map((authority, rank) => [authority, rank])),
);

const ADMISSION_MODE_RANK: Readonly<Record<string, number>> = {
  "bounded-auto": 0, "promotion-third-party-review": 1, "mandate-gated": 2, "mandated-act": 3, "own-act-human": 4,
};

const COMPOSED_PIN_KEYS = new Set(["importAlias", "lineage", "templateId", "templateVersion", "templateDigestSha256"]);
const REGISTRY_KEYS = new Set(["source", "id_column", "label_column", "alias_columns", "partition_column", "node_type", "bound_source_path"]);
const NODE_KNOWN_KEYS = new Set([
  "definition", "id_prefix", "aliases", "source_backed", "registry", "status_policy", "linking",
  "visual_encoding", "attributes", "properties", "state_machine", "state_machines", "admission_policy",
]);
const REL_KNOWN_KEYS = new Set([
  "description", "source", "target", "source_types", "target_types", "cardinality",
  "requires_evidence", "assertion_basis", "derivation_method", "derivation_methods", "attributes", "hierarchy",
]);
const REL_HIERARCHY_KEYS = new Set(["id", "shape", "parent_role", "child_role"]);
const ATTR_DECL_KNOWN_KEYS = new Set([
  "kind", "required", "description", "values", "targetTypes",
  "minLength", "maxLength", "pattern", "min", "max", "minItems", "maxItems", "item", "attributes",
]);
const STATE_MACHINE_KEYS = new Set(["states", "initial_state", "terminal_states", "transitions"]);
const TRANSITION_NORM_KEYS = new Set(["requires", "authority"]);
const HARDENING_KEYS = new Set(["statuses", "default_status", "promotion_requires", "status_transitions"]);
const ADMISSION_POLICY_KEYS = new Set(["mode", "third_party_distinct_from_author", "by_rank", "by_operation", "by_transition"]);

const rankIn = (table: Readonly<Record<string, number>>, val: unknown): number | undefined => typeof val === "string" && Object.hasOwn(table, val) ? table[val] : undefined;
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const hasOnlyKeys = (val: unknown, allowed: ReadonlySet<string>): val is Record<string, unknown> => isRecord(val) && Object.keys(val).every((k) => allowed.has(k));
const normStrSet = (val: unknown): unknown => (isStringArray(val) ? [...new Set(val)].sort() : val);
const isSetSuperset = (o: unknown, n: unknown): boolean => Array.isArray(o) && Array.isArray(n) && o.every((x) => typeof x === "string") && n.every((x) => typeof x === "string") && new Set(n).size >= 0 && (() => { const ns = new Set(n); return o.every((x) => ns.has(x)); })();
const isSetSubset = (o: unknown, n: unknown): boolean => isSetSuperset(n, o);
const isWidenedUpper = (o: unknown, n: unknown): boolean => (isFiniteNum(o) && isFiniteNum(n) && n > o) || (isFiniteNum(o) && n === undefined);
const isWidenedLower = (o: unknown, n: unknown, defMin: number): boolean => (isFiniteNum(n) ? n : defMin) < (isFiniteNum(o) ? o : defMin);

/*
 * Entry of the gate. Every document a public API receives crosses it exactly once: the Lot 0.2 projector turns it
 * into plain JSON, the closed schema below type-checks every field the gate reads, and only then does the document
 * carry the `Projected` brand that every function past the entry requires. A raw document does not type-check
 * anywhere else in this file. The entry is total: a value it cannot read is refused like a malformed one.
 * The Lot 0.2 helpers reused past it (`validateVersionProgression`, `diffMetamodelDocuments`,
 * `isMappingFileCoveringRenames`) take unbranded records and throw on a raw one: this module imports them and never
 * re-exports them, so each function it exports either is an entry or takes a branded document.
 */
declare const PROJECTED: unique symbol;
declare const ADMITTED: unique symbol;
declare const NORMALIZED: unique symbol;

type Code = MetamodelDiagnosticCode;
type JsonRecord = { readonly [key: string]: JsonValue };
/** A root field of the closed schema: one of the model's, or one of the two members a loaded profile adds to them. */
export type RootField = keyof MetamodelTemplateDocument | "profile_hash" | "sourcePath";

/**
 * A document projected to plain JSON exactly once. `Checked` names the root fields the closed schema has
 * type-checked: none right after projection, every one of them once the document is fully admitted. A document
 * checked on fewer fields does not pass for one checked on more, whichever fields the model makes optional.
 */
export type Projected<Checked extends RootField = never> = JsonRecord & { readonly [PROJECTED]: { readonly [Field in Checked]: true } };
/** A document the whole closed schema has checked. The check over every field grants it; no list of fields does, however the list is typed. */
export type ProjectedDocument = Projected<RootField> & { readonly [ADMITTED]: true };
type NormalizedDocument = Readonly<Record<string, unknown>> & { readonly [NORMALIZED]: true };

/** One field of a closed object: its type, whether the gate needs it, and what the diff uses when it is absent. */
interface Field {
  readonly spec: Spec;
  readonly required?: true;
  /** Used by the diff when the field is ABSENT. A malformed value is refused, never replaced by this. */
  readonly fallback?: JsonValue;
  /** The diff interprets (normalises, defaults) the field only on holders satisfying this; the type check is unconditional. */
  readonly when?: (holder: JsonRecord) => boolean;
  /** Stable refusal code of the field and of its subtree; inherited from the holder otherwise. */
  readonly code?: Code;
  /** A malformed value is reported on the holder (a cardinality bound, a score band): one refusal for the group. */
  readonly atHolder?: true;
}

/** One node of the closed schema: the JSON type the gate requires at a path. Keys it does not list stay opaque JSON. */
type Spec =
  | { readonly is: "json" | "number" | "boolean" }
  | { readonly is: "string"; readonly nonEmpty?: true }
  | { readonly is: "literal"; readonly values: readonly string[] }
  | { readonly is: "strings"; readonly order: "set" | "tuple"; readonly nonEmpty?: true; readonly unique?: true }
  | { readonly is: "numbers"; readonly nonEmpty?: true }
  | { readonly is: "list"; readonly of: Spec }
  | ObjectSpec
  | { readonly is: "map"; readonly of: Spec; readonly code?: Code }
  | { readonly is: "keyed"; readonly of: ObjectSpec; readonly key: (entry: JsonRecord) => string }
  | { readonly is: "oneOf"; readonly specs: readonly Spec[] }
  | { readonly is: "byTag"; readonly tag: string; readonly cases: Readonly<Record<string, TaggedCase>>; readonly otherwise: ObjectSpec }
  | { readonly is: "lazy"; readonly spec: () => Spec }
  | TransitionsSpec;
interface ObjectSpec {
  readonly is: "object";
  readonly fields: Readonly<Record<string, Field>>;
  readonly orNull?: true;
  /** Last normalisation step of the object, on its already-normalised fields. */
  readonly settle?: (out: Record<string, unknown>) => void;
}
interface TaggedCase { readonly spec: ObjectSpec; readonly code?: Code }
/** Array of transitions; the diff keys each one by its `from->to` edges. */
interface TransitionsSpec { readonly is: "transitions"; readonly from: string; readonly to: string; readonly scalarEndpoints: boolean }

const own = (holder: object, key: string): unknown => (Object.hasOwn(holder, key) ? (holder as Record<string, unknown>)[key] : undefined);

/** Null-prototype record: a key the document does not declare reads `undefined`, never an `Object.prototype` member. */
function bare(entries: Iterable<readonly [string, unknown]>): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of entries) out[key] = value;
  return out;
}

const TEXT: Spec = { is: "string" };
const NAME: Spec = { is: "string", nonEmpty: true };
const NUMBER: Spec = { is: "number" };
const FLAG: Spec = { is: "boolean" };
const SET: Spec = { is: "strings", order: "set" };
const TUPLE: Spec = { is: "strings", order: "tuple" };
const object = (fields: Readonly<Record<string, Field>>, settle?: ObjectSpec["settle"]): ObjectSpec => ({ is: "object", fields, settle });
const map = (of: Spec, code?: Code): Spec => ({ is: "map", of, code });
const list = (of: Spec): Spec => ({ is: "list", of });
const keyed = (of: ObjectSpec, key: (entry: JsonRecord) => string): Spec => ({ is: "keyed", of, key });
const oneOf = (...specs: readonly Spec[]): Spec => ({ is: "oneOf", specs });
const opt = (spec: Spec, code?: Code): Field => ({ spec, code });
const req = (spec: Spec, code?: Code): Field => ({ spec, required: true, code });
const def = (spec: Spec, fallback: JsonValue, code?: Code): Field => ({ spec, fallback, code });
const kindIs = (...kinds: readonly string[]) => (holder: JsonRecord): boolean => kinds.includes(own(holder, "kind") as string);

const ATTR_CODE: Code = "MM_ATTR_INVALID_DECLARATION";
const STATE_CODE: Code = "MM_STATE_INVALID_MACHINE";
const PATH_CODE: Code = "MM_FILE_SHAPE_PATH_ESCAPE";
const IDENTITY_CODE: Code = "MM_IDENTITY_MISSING_REQUIRED";
const PIN_TARGET_CODE: Code = "MM_COMPOSE_TARGET_NOT_REGISTERED";
const CONTEXT_CODE: Code = "MM_SYNTAX_NON_PLAIN_OBJECT";

const ATTRIBUTE: ObjectSpec = object({
  kind: opt(TEXT),
  required: def(FLAG, false),
  description: opt(TEXT),
  values: { spec: SET, when: kindIs("enum") },
  targetTypes: { spec: SET, when: kindIs("ref") },
  pattern: opt(TEXT),
  minLength: { spec: NUMBER, fallback: 0, when: kindIs("string", "timestamp", "digest") },
  maxLength: opt(NUMBER),
  min: opt(NUMBER),
  max: opt(NUMBER),
  minItems: { spec: NUMBER, fallback: 0, when: kindIs("collection") },
  maxItems: opt(NUMBER),
  item: { spec: { is: "lazy", spec: () => ATTRIBUTE }, when: kindIs("collection") },
  attributes: { spec: { is: "lazy", spec: () => ATTRIBUTES }, when: kindIs("record") },
});
const ATTRIBUTES: Spec = map(ATTRIBUTE);

const TRANSITION: ObjectSpec = object({ requires: def(SET, []), authority: opt(TEXT) });
const STATE_MACHINE: ObjectSpec = object({
  states: def(SET, []),
  initial_state: opt(TEXT),
  terminal_states: def(SET, []),
  transitions: def({ is: "transitions", from: "from", to: "to", scalarEndpoints: false }, {}),
});
const HARDENING: ObjectSpec = object({
  statuses: def({ is: "strings", order: "set", unique: true }, []),
  default_status: opt(TEXT),
  promotion_requires: def(SET, []),
  status_transitions: def({ is: "transitions", from: "from_statuses", to: "to_statuses", scalarEndpoints: true }, {}),
});

const ADMISSION_SCOPES = ["by_rank", "by_operation", "by_transition"] as const;
/** An override equal to the policy mode changes nothing: the diff drops it so that adding or removing it is no change. */
const ADMISSION: ObjectSpec = object({
  mode: opt(TEXT),
  third_party_distinct_from_author: def(FLAG, false),
  by_rank: def(map(TEXT), {}),
  by_operation: def(map(TEXT), {}),
  by_transition: def(map(TEXT), {}),
}, (out) => {
  if (rankIn(ADMISSION_MODE_RANK, out.mode) === undefined) return;
  for (const scope of ADMISSION_SCOPES) {
    out[scope] = bare(Object.entries(out[scope] as Record<string, unknown>).filter(([, mode]) => mode !== out.mode));
  }
});

const LINK_PATTERN: ObjectSpec = object({ form: opt(TEXT), flags: opt(TEXT), membership: opt(TEXT), expand: opt(object({ ranges: opt(TEXT) })) });
const LINK_LLM: ObjectSpec = object({ trigger: opt(TEXT), budget_usd: opt(NUMBER), dry_run: opt(FLAG), min_candidates: opt(NUMBER) });
const LINKING: ObjectSpec = object({
  preset: opt(TEXT),
  normalize: opt(object({ builtin: opt(TUPLE), fn: opt(TEXT) })),
  partition_from: opt(object({ source_frontmatter: opt(TEXT), else: opt(object({ path_segment: opt(NUMBER) })) })),
  detect: opt(list(oneOf(TEXT, object({ pattern: opt(LINK_PATTERN), llm: opt(LINK_LLM) })))),
  patterns: opt(list(LINK_PATTERN)),
  resolve: opt(oneOf(TEXT, object({ mode: opt(TEXT) }))),
  evidence: opt(object({ verbatim: opt(TEXT), context_window: opt(NUMBER) })),
});
const VISUAL_ENCODING: ObjectSpec = { is: "object", orNull: true, fields: { shape: opt(TEXT), color_hex: opt(TEXT), fill: opt(TEXT), border: opt(TEXT) } };

const NODE: ObjectSpec = object({
  definition: opt(TEXT),
  id_prefix: opt(TEXT),
  aliases: def(SET, []),
  source_backed: def(FLAG, false),
  registry: opt(TEXT, "MM_NODE_INVALID_REGISTRY_REF"),
  status_policy: opt(TEXT),
  linking: opt(LINKING),
  visual_encoding: opt(VISUAL_ENCODING, "MM_NODE_INVALID_VISUAL_ENCODING"),
  attributes: def(ATTRIBUTES, {}, ATTR_CODE),
  properties: def(ATTRIBUTES, {}, ATTR_CODE),
  state_machine: opt(STATE_MACHINE, STATE_CODE),
  state_machines: def(map(STATE_MACHINE), {}, STATE_CODE),
  admission_policy: opt(ADMISSION, STATE_CODE),
});

const UNBOUNDED: JsonValue = { min: 0, max: "many" };
const BOUND: ObjectSpec = object({
  min: { spec: NUMBER, fallback: 0, atHolder: true },
  max: { spec: oneOf(NUMBER, { is: "literal", values: ["many"] }), fallback: "many", atHolder: true },
});
const SCORE: Field = { spec: NUMBER, required: true, atHolder: true };
const NAMES: Spec = oneOf(TEXT, TUPLE);
const RELATION: ObjectSpec = object({
  description: opt(TEXT, ATTR_CODE),
  source: opt(NAMES),
  target: opt(NAMES),
  source_types: def(SET, []),
  target_types: def(SET, []),
  cardinality: def(object({ out: def(BOUND, UNBOUNDED), in: def(BOUND, UNBOUNDED) }), { out: UNBOUNDED, in: UNBOUNDED }, "MM_REL_INVALID_CARDINALITY"),
  requires_evidence: def(FLAG, false, ATTR_CODE),
  assertion_basis: def(SET, [], ATTR_CODE),
  derivation_method: opt(NAMES, ATTR_CODE),
  derivation_methods: def(SET, [], ATTR_CODE),
  attributes: def(ATTRIBUTES, {}, ATTR_CODE),
  hierarchy: opt(object({ id: opt(TEXT), shape: opt(TEXT), parent_role: opt(TEXT), child_role: opt(TEXT) }), "MM_REL_INVALID_HIERARCHY"),
});

const REGISTRY: ObjectSpec = object({
  source: opt(TEXT),
  id_column: opt(TEXT),
  label_column: opt(TEXT),
  alias_columns: def(SET, []),
  node_type: opt(TEXT),
  partition_column: def(TEXT, null),
  bound_source_path: opt(TEXT),
});
/** The three members that designate a pin's target are required: Lot 0.2 follows a registered target's pins by them. */
const COMPOSED_PIN: ObjectSpec = object({
  importAlias: req(NAME),
  lineage: req(TEXT, PIN_TARGET_CODE),
  templateId: req(TEXT, PIN_TARGET_CODE),
  templateVersion: req(TEXT, "MM_COMPOSE_FLOATING_VERSION"),
  templateDigestSha256: opt(TEXT, "MM_COMPOSE_INVALID_DIGEST"),
});
/**
 * A parent or mapping pin states its three members. One left out, or of another type, is reported on the pin, where
 * Lot 0.2 reports a malformed one.
 */
const PIN_MEMBER: Field = { spec: TEXT, required: true, atHolder: true };
const PIN: ObjectSpec = object({ id: PIN_MEMBER, version: PIN_MEMBER, contentDigest: PIN_MEMBER });

/** Identity of a nesting rule: every member that scopes it, `parent_modes` included (two rules may differ by modes only). */
function nestingKey(rule: JsonRecord): string {
  const when = isRecord(rule.when_attributes)
    ? Object.fromEntries(Object.entries(rule.when_attributes).map(([attribute, values]) => [attribute, normStrSet(values)]))
    : null;
  return canonicalBytes([rule.parent_level, rule.parent_modes === undefined ? null : normStrSet(rule.parent_modes), rule.child_subkind ?? null, when]);
}
const timeboxKey = (timebox: JsonRecord): string => `${String(timebox.applies_to_level)}\0${String(timebox.subkind ?? "")}`;
const idKey = (entry: JsonRecord): string => String(entry.id);

const SCALE: Spec = { is: "numbers", nonEmpty: true };
const DOMAIN_POLICIES: ObjectSpec = object({
  levels: opt(keyed(object({
    id: req(NAME),
    rank: req(NUMBER),
    modes: def(SET, []),
    requires_parent: def(FLAG, false),
    rollup: opt(FLAG),
    closure_gate_ref: opt(TEXT),
  }), idKey)),
  cross_cutting_axes: def(map(object({ attribute: opt(TEXT), pattern: opt(TEXT), inherited_downward: opt(FLAG) })), {}),
  nesting_matrix: opt(keyed(object({
    parent_level: req(NAME),
    parent_modes: opt({ is: "strings", order: "set", nonEmpty: true }),
    allowed_child_levels: req(SET),
    child_subkind: opt(TEXT),
    when_attributes: opt(map(SET)),
  }), nestingKey)),
  stage_refinements: opt(keyed(object({ parent_stage: req(NAME), sub_stages: req(SET), witness_link_kinds: def(SET, []) }), (ref) => String(ref.parent_stage))),
  autonomy_policy: opt(object({
    actor_classes: def(SET, []),
    max_autonomous_create_rank: opt(NUMBER),
    max_autonomous_create_level: opt(TEXT),
    autonomous_stage_ceiling_by_level: def(map(TEXT), {}),
    mandated_act_operations: def(SET, []),
    mandated_act_proof_sources: def(SET, []),
    own_act_human_operations: def(SET, []),
    overlay_precedence: opt(TEXT),
  })),
  acceptance_gates: def(map(object({
    applies_to_levels: def(SET, []),
    authority: opt(TEXT),
    designated_owner_attribute: opt(TEXT),
    required_actor_class: opt(TEXT),
    non_waivable_evidence_kinds: def(SET, []),
    require_all_children_terminal: def(FLAG, false),
    freshness_anchor_equality: opt(object({ receipt_field: opt(TEXT), target_field: opt(TEXT) })),
  })), {}),
  timeboxes: opt(keyed(object({
    applies_to_level: req(NAME),
    subkind: opt(TEXT),
    target_days: opt(NUMBER),
    hard_ceiling_days: req(NUMBER),
    clock_start_trigger: opt(TEXT),
    clock_stop_triggers: def(SET, []),
    rebaseline_decision_kind: opt(TEXT),
    overdue_escalation: opt(TEXT),
  }), timeboxKey)),
  eta_policy: opt(object({
    eligible_ranks: opt({ is: "numbers" }),
    max_active_slots_per_item: opt(NUMBER),
    source_kinds: def(SET, []),
    measured_provenance_required_fields: def(SET, []),
    append_only_slip_journal: opt(FLAG),
    rebaseline_requires_decision: opt(FLAG),
  })),
  risk_policy: opt(object({
    likelihood_scale: req(SCALE),
    impact_scale: req(SCALE),
    severity_bands: req(keyed(object({ id: req(NAME), min_score: SCORE, max_score: SCORE }), idKey)),
    categories: def(SET, []),
    responses: def(SET, []),
    forbid_actor_classes_by_response: def(map(SET), {}),
    max_review_validity_days_by_band: def(map(NUMBER), {}),
    external_register_max_age_days: opt(NUMBER),
    sensitivity_impact_floors: def(map(NUMBER), {}),
  })),
  legacy_role_remap: def(map(object({ target_level: opt(TEXT), subkind: opt(TEXT), read_only: opt(FLAG) })), {}),
  invariants: opt(keyed(object({ id: req(NAME), summary: opt(TEXT), scope: opt(TEXT), severity: opt(TEXT) }), idKey)),
});

/**
 * The vocabularies of a projection. The rules and the composition check read them whatever its `kind`, so they are
 * typed whatever its `kind`: on the other kind (`OVERLAY_VOCABULARIES` on a slice, `SLICE_VOCABULARIES` on an
 * overlay) and on a kind the model does not know. Each kind restates its own, required where the model requires them.
 */
const OVERLAY_VOCABULARIES: Readonly<Record<string, Field>> = { include_node_types: opt(SET), projected_fields: opt(SET) };
const SLICE_VOCABULARIES: Readonly<Record<string, Field>> = {
  event_journal: opt(object({ aggregates: opt(SET), event_types: opt(SET) })),
  state_snapshot: opt(object({
    include_collections: opt(SET),
    report_sections: opt(SET),
    status_vocabulary: opt(SET),
    stage_vocabulary: opt(SET),
    remaining_work_realizations: opt(SET),
  })),
};
const TRACK_SLICE: ObjectSpec = object({
  kind: opt(TEXT),
  content_mode: opt(TEXT),
  root_dir: opt(TEXT, PATH_CODE),
  event_journal: req(object({
    relative_path_template: opt(TEXT, PATH_CODE),
    format: opt(TEXT),
    forbid_header_lines: opt(FLAG),
    aggregates: req(SET),
    event_types: req(SET),
    order_by: opt(TUPLE),
    frame_integrity: opt(TEXT),
    envelope_contract: opt(object({ core_fields: opt(TUPLE), optional_core_fields: opt(TUPLE), frame_fields: opt(TUPLE) })),
  })),
  head_anchor: opt(object({ relative_path_template: opt(TEXT, PATH_CODE), format: opt(TEXT) })),
  state_snapshot: req(object({
    relative_path_template: opt(TEXT, PATH_CODE),
    schema: opt(TEXT),
    include_collections: req(SET),
    report_sections: def(SET, []),
    status_vocabulary: req(SET),
    stage_vocabulary: req(SET),
    remaining_work_realizations: req(SET),
  })),
  owner_table_inputs: opt(object({
    required_folded_collections: opt(TUPLE),
    required_event_stream_lookbacks: opt(TUPLE),
    options_fields: opt(TUPLE),
    confidentiality_policy_contract: opt(TEXT),
  })),
  link_fingerprint_sidecar: opt(object({ relative_path_template: opt(TEXT, PATH_CODE), schema: opt(TEXT), hash_algorithm: opt(TEXT) })),
  ...OVERLAY_VOCABULARIES,
});
const H2A_OVERLAY: ObjectSpec = object({
  kind: opt(TEXT),
  root_dir: opt(TEXT, PATH_CODE),
  relative_path_template: opt(TEXT, PATH_CODE),
  relative_path_templates: opt(map(TEXT), PATH_CODE),
  precedence: opt(TEXT, "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN"),
  format: opt(TEXT),
  include_node_types: req(SET),
  order_by: opt(TUPLE),
  projected_fields: req(SET),
  ...SLICE_VOCABULARIES,
});
const FILE_PROJECTION: Spec = {
  is: "byTag",
  tag: "kind",
  cases: {
    "track-pr-slice": { spec: TRACK_SLICE, code: "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR" },
    "h2a-harness-overlay": { spec: H2A_OVERLAY },
  },
  otherwise: object({ kind: opt(TEXT), ...OVERLAY_VOCABULARIES, ...SLICE_VOCABULARIES }),
};

/** The root of the closed schema: one field per `RootField`, no more and no fewer, which the compiler holds it to. */
const ROOT: Readonly<Record<RootField, Field>> = {
  metamodel_version: opt(TEXT, IDENTITY_CODE),
  lineage: opt(TEXT, IDENTITY_CODE),
  id: opt(TEXT, IDENTITY_CODE),
  version: opt(TEXT, IDENTITY_CODE),
  default_language: opt(TEXT, IDENTITY_CODE),
  parent_pin: opt(PIN, "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH"),
  mapping_pin: opt(PIN, "MM_VERSION_UNMAPPED_BREAKING_RENAME"),
  presentation: opt(map({ is: "json" }), "MM_SYNTAX_NON_PLAIN_OBJECT"),
  presentation_hash: opt(TEXT, "MM_DIGEST_MISMATCH"),
  profile_hash: opt(TEXT, "MM_DIGEST_MISMATCH"),
  sourcePath: opt(TEXT),
  composed_lineage_pins: def(keyed(COMPOSED_PIN, (pin) => String(pin.importAlias)), {}, "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE"),
  registries: def(map(REGISTRY), {}, "MM_NODE_INVALID_REGISTRY_REF"),
  node_types: opt(map(NODE, "MM_NODE_INVALID_IDENTIFIER"), "MM_NODE_EMPTY_SET"),
  relation_types: def(map(RELATION), {}, "MM_REL_MISSING_ENDPOINTS"),
  hardening: opt(HARDENING, STATE_CODE),
  domain_policies: opt(DOMAIN_POLICIES, "MM_DOMAIN_POLICY_INVALID"),
  file_projections: opt(map(FILE_PROJECTION), "MM_FILE_SHAPE_LINEAGE_FORBIDDEN"),
};
/** Every root field of the schema, for a check that covers all of them but those it leaves to another. */
export const ROOT_FIELDS: readonly RootField[] = Object.freeze(Object.keys(ROOT) as RootField[]);

/** The closed schema of what the gate reads from its context: registry record envelopes, renames, the mapping file. */
const REGISTRY_RECORD: ObjectSpec = object({
  lineage: req(NAME),
  templateId: req(NAME),
  templateVersion: req(NAME),
  templateDigestSha256: req(TEXT),
  presentationDigest: opt(TEXT),
  nodeTypeIds: opt(TUPLE),
  composedLineagePins: opt(list(object({ lineage: req(TEXT), templateId: req(TEXT), templateVersion: req(TEXT) }))),
});
const DECLARED_RENAMES: Spec = list(object({ from: req(TEXT), to: req(TEXT) }));
const MAPPING_FILE: ObjectSpec = object({
  mappingId: opt(TEXT),
  version: opt(TEXT),
  contentDigest: opt(TEXT),
  entries: req(list(object({ kind: opt(TEXT), from: opt(TEXT), to: opt(TEXT) }))),
});

/** Whether `value` has the JSON type `spec` starts with: selects the alternative of a `oneOf`. */
function fits(spec: Spec, value: unknown): boolean {
  switch (spec.is) {
    case "json":
      return true;
    case "string":
    case "number":
    case "boolean":
      return typeof value === spec.is;
    case "literal":
      return typeof value === "string";
    case "object":
      return isRecord(value) || (value === null && spec.orNull === true);
    case "map":
    case "byTag":
      return isRecord(value);
    case "oneOf":
      return spec.specs.some((alternative) => fits(alternative, value));
    case "lazy":
      return fits(spec.spec(), value);
    default:
      return Array.isArray(value);
  }
}

function taggedCase(spec: Extract<Spec, { readonly is: "byTag" }>, holder: Record<string, unknown>): TaggedCase {
  const tag = own(holder, spec.tag);
  return (typeof tag === "string" ? (own(spec.cases, tag) as TaggedCase | undefined) : undefined) ?? { spec: spec.otherwise };
}

/** The member that names one side of a transition: the spec's own name, or the bare `from` / `to` when it is absent. */
function endpointKey(spec: TransitionsSpec, transition: Record<string, unknown>, side: "from" | "to"): string {
  return own(transition, spec[side]) !== undefined ? spec[side] : side;
}

/** The states one side of a transition names, or `null` when that side is not a non-empty list of state names. */
function transitionEndpoints(spec: TransitionsSpec, transition: Record<string, unknown>, side: "from" | "to"): string[] | null {
  const raw = own(transition, endpointKey(spec, transition, side));
  if (spec.scalarEndpoints && isNonEmptyString(raw)) return [raw];
  return isStringArray(raw) && raw.length > 0 ? raw : null;
}

function refuse(sink: ValidationSink, code: Code, path: string, expected: string): void {
  addError(sink, code, path, `${path} must ${expected}`);
}

/** A sink of its own for one check: what the check finds does not depend on what another document already reported. */
const apart = (sink: ValidationSink): ValidationSink => ({ diagnostics: [], lineage: sink.lineage, subject: sink.subject });

/**
 * Hands the findings of one check to the caller's sink and tells whether the check passed. One refusal per
 * malformed site: a second one with the same code and path, from the same document or another, would say nothing more.
 */
function report(local: ValidationSink, sink: ValidationSink): boolean {
  for (const found of local.diagnostics) {
    if (!sink.diagnostics.some((d) => d.code === found.code && d.path === found.path)) addError(sink, found.code, found.path, found.message);
  }
  return local.diagnostics.length === 0;
}

function checkFields(spec: ObjectSpec, holder: Record<string, unknown>, path: string, code: Code, sink: ValidationSink): void {
  for (const [name, field] of Object.entries(spec.fields)) {
    const at = field.atHolder === true ? path : path === "" ? name : `${path}.${name}`;
    const value = own(holder, name);
    if (value !== undefined) checkValue(field.spec, value, at, field.code ?? code, sink);
    else if (field.required === true) refuse(sink, field.code ?? code, at, field.atHolder === true ? `state ${name}` : "be present");
  }
}

function checkTransitions(spec: TransitionsSpec, value: unknown, path: string, code: Code, sink: ValidationSink): void {
  if (!Array.isArray(value)) {
    refuse(sink, code, path, "be an array");
    return;
  }
  const seen = new Set<string>();
  value.forEach((transition, idx) => {
    const at = `${path}[${idx}]`;
    if (!isRecord(transition)) {
      refuse(sink, code, at, "be a plain object");
      return;
    }
    const before = sink.diagnostics.length;
    checkFields(TRANSITION, transition, at, code, sink);
    const froms = transitionEndpoints(spec, transition, "from");
    const tos = transitionEndpoints(spec, transition, "to");
    if (froms === null || tos === null) refuse(sink, code, at, `name its endpoints as non-empty ${spec.scalarEndpoints ? "" : "arrays of "}state names`);
    if (froms === null || tos === null || sink.diagnostics.length !== before) return;
    for (const from of froms) {
      for (const to of tos) {
        if (seen.has(`${from}->${to}`)) {
          refuse(sink, code, at, `not repeat the edge ${from}->${to}`);
          return;
        }
        seen.add(`${from}->${to}`);
      }
    }
  });
}

/** Type-checks `value` against `spec`; every mismatch is one refusal carrying the stable code of its area. */
function checkValue(spec: Spec, value: unknown, path: string, code: Code, sink: ValidationSink): void {
  switch (spec.is) {
    case "json":
      return;
    case "string":
      if (typeof value !== "string" || (spec.nonEmpty === true && value.trim().length === 0)) {
        refuse(sink, code, path, spec.nonEmpty === true ? "be a non-empty string" : "be a string");
      }
      return;
    case "number":
      if (!isFiniteNum(value)) refuse(sink, code, path, "be a finite number");
      return;
    case "boolean":
      if (typeof value !== "boolean") refuse(sink, code, path, "be a boolean");
      return;
    case "literal":
      if (typeof value !== "string" || !spec.values.includes(value)) refuse(sink, code, path, `be one of: ${spec.values.join(", ")}`);
      return;
    case "strings":
      if (!isStringArray(value) || (spec.nonEmpty === true && value.length === 0)) {
        refuse(sink, code, path, spec.nonEmpty === true ? "be a non-empty string array" : "be a string array");
      } else if (spec.unique === true && new Set(value).size !== value.length) {
        refuse(sink, code, path, "not repeat an entry");
      }
      return;
    case "numbers":
      if (!Array.isArray(value) || !value.every(isFiniteNum) || (spec.nonEmpty === true && value.length === 0)) {
        refuse(sink, code, path, spec.nonEmpty === true ? "be a non-empty array of finite numbers" : "be an array of finite numbers");
      }
      return;
    case "list":
      if (!Array.isArray(value)) refuse(sink, code, path, "be an array");
      else value.forEach((item, idx) => checkValue(spec.of, item, `${path}[${idx}]`, code, sink));
      return;
    case "object":
      if (value === null && spec.orNull === true) return;
      if (!isRecord(value)) refuse(sink, code, path, "be a plain object");
      else checkFields(spec, value, path, code, sink);
      return;
    case "map":
      if (!isRecord(value)) refuse(sink, code, path, "be a plain object");
      else for (const [key, entry] of Object.entries(value)) checkValue(spec.of, entry, `${path}.${key}`, spec.code ?? code, sink);
      return;
    case "keyed": {
      if (!Array.isArray(value)) {
        refuse(sink, code, path, "be an array");
        return;
      }
      const seen = new Set<string>();
      value.forEach((entry, idx) => {
        const at = `${path}[${idx}]`;
        const before = sink.diagnostics.length;
        checkValue(spec.of, entry, at, code, sink);
        if (sink.diagnostics.length !== before) return;
        const key = spec.key(entry as JsonRecord);
        if (seen.has(key)) refuse(sink, code, at, `not repeat the key of an earlier entry of ${path}`);
        seen.add(key);
      });
      return;
    }
    case "oneOf": {
      const alternative = spec.specs.find((candidate) => fits(candidate, value));
      if (alternative === undefined) refuse(sink, code, path, "be of a supported type");
      else checkValue(alternative, value, path, code, sink);
      return;
    }
    case "byTag":
      if (!isRecord(value)) {
        refuse(sink, code, path, "be a plain object");
      } else {
        const chosen = taggedCase(spec, value);
        checkFields(chosen.spec, value, path, chosen.code ?? code, sink);
      }
      return;
    case "lazy":
      checkValue(spec.spec(), value, path, code, sink);
      return;
    case "transitions":
      checkTransitions(spec, value, path, code, sink);
      return;
  }
}

/**
 * Entry step 1 of 2: the Lot 0.2 projector, the same for every document (candidate, registered parent, either side
 * of a pair). Text or object in, plain JSON out: explicit `undefined` dropped, unserialisable values and `__proto__`
 * keys refused, and so is a value the projector cannot walk, one nested beyond `MAX_DEPTH`, one larger than
 * `MAX_SIZE` or one holding a text longer than `MAX_TEXT`. `root` names the document in a root-level refusal;
 * `prefixed` qualifies nested paths with it.
 */
export function projectDocument(raw: unknown, sink: ValidationSink, root = "template", prefixed = false): Projected | null {
  const found = apart(sink);
  const doc = projectApart(raw, found, root, prefixed);
  report(found, sink);
  return doc;
}

function projectApart(raw: unknown, sink: ValidationSink, root: string, prefixed: boolean): Projected | null {
  const local = apart(sink);
  const located = (path: string): string => (path === "template" ? root : prefixed ? `${root}.${path}` : path);
  let doc: JsonRecord | null;
  try {
    doc = parseAndProjectInput(raw, local)?.doc ?? null;
  } catch {
    // The projector is the one reader of a caller's value. A value it cannot even walk (a proxy whose trap throws,
    // nesting that exhausts the stack) is not plain JSON: a refusal like any other, never an exception.
    refuse(sink, CONTEXT_CODE, root, "be readable as plain JSON");
    return null;
  }
  for (const diagnostic of local.diagnostics) addError(sink, diagnostic.code, located(diagnostic.path), diagnostic.message);
  const bound = doc === null ? null : boundExceeded(doc);
  if (bound !== null) refuse(sink, CONTEXT_CODE, root, bound);
  const beyond = doc === null || bound !== null ? null : tooDeepAt(doc);
  if (beyond !== null) refuse(sink, CONTEXT_CODE, located(beyond), `not nest deeper than ${MAX_DEPTH} levels`);
  return doc === null || bound !== null || beyond !== null ? null : (doc as Projected);
}

/** The deepest nesting the gate reads below a document root: every recursion past the entry stays within it. */
const MAX_DEPTH = 256;
/**
 * The most the gate reads in one document. Every value counts 8, the length of its path and, for a string, its own
 * length: what the gate may write about it. All that a transition holds counts once per edge it names. What is
 * computed past the entry (canonical bytes, digests, the tags and paths of a report, a message naming every change)
 * then fits in one string of the runtime, whatever the escaping.
 */
const MAX_SIZE = 2 ** 23;

/** The edges a transition names: its `from` states times its `to` states, under either spelling. 1 for any other object. */
function edgesOf(holder: JsonRecord): number {
  const states = (...names: readonly string[]): number => Math.max(1, ...names.map((name) => {
    const stated = own(holder, name);
    return Array.isArray(stated) ? stated.length : 1;
  }));
  return states("from", "from_statuses") * states("to", "to_statuses");
}

/** The longest string or member name the gate reads: Lot 0.2 matches some against expressions that recurse on length. */
const MAX_TEXT = 2 ** 16;
const SIZE_BOUND = `not exceed a size of ${MAX_SIZE}: 8 per value, plus the length of its path and of its string`;
const TEXT_BOUND = `not hold a string or a member name longer than ${MAX_TEXT} characters`;

/**
 * The bound a projected value exceeds, if any: a document, or a member of the context. A value referenced a hundred
 * times counts a hundred times: that is how often it is serialised. The loop stops at a bound and queues containers only.
 */
function boundExceeded(root: JsonValue): string | null {
  if (typeof root !== "object" || root === null) return typeof root === "string" && root.length > MAX_TEXT ? TEXT_BOUND : null;
  const pending: Array<readonly [container: readonly JsonValue[] | JsonRecord, path: number, times: number]> = [[root, 0, 1]];
  let size = 8;
  while (pending.length > 0) {
    const [container, path, times] = pending.pop()!;
    const names = Array.isArray(container) ? null : Object.keys(container);
    const each = names === null ? times : times * edgesOf(container as JsonRecord);
    const count = names === null ? (container as readonly JsonValue[]).length : names.length;
    for (let idx = 0; idx < count; idx += 1) {
      const name = names === null ? `[${idx}]` : names[idx]!;
      const member = names === null ? (container as readonly JsonValue[])[idx]! : (container as JsonRecord)[name]!;
      const text = typeof member === "string" ? member.length : 0;
      if (name.length > MAX_TEXT || text > MAX_TEXT) return TEXT_BOUND;
      const at = path + 1 + name.length;
      size += each * (8 + at + text);
      if (size > MAX_SIZE) return SIZE_BOUND;
      if (typeof member === "object" && member !== null) pending.push([member, at, each]);
    }
  }
  return null;
}

/** The path of a container nested deeper than `MAX_DEPTH`, if any. A loop, not the recursion it is there to bound. */
function tooDeepAt(root: JsonValue): string | null {
  const pending: Array<readonly [value: JsonValue, path: string, depth: number]> = [[root, "", 0]];
  while (pending.length > 0) {
    const [value, path, depth] = pending.pop()!;
    if (typeof value !== "object" || value === null) continue;
    if (depth > MAX_DEPTH) return path;
    for (const [key, member] of Object.entries(value)) {
      pending.push([member, Array.isArray(value) ? `${path}[${key}]` : path === "" ? key : `${path}.${key}`, depth + 1]);
    }
  }
  return null;
}

/**
 * Entry step 2 of 2, and the only place a typed brand is granted: the closed schema over the whole document, or
 * over the root fields `only` when an API reads no more than those.
 */
export function checkDocument(doc: Projected, sink: ValidationSink): ProjectedDocument | null;
export function checkDocument<Field extends RootField>(doc: Projected, sink: ValidationSink, only: readonly Field[], prefix?: string): Projected<Field> | null;
export function checkDocument(doc: Projected, sink: ValidationSink, only?: readonly RootField[], prefix = ""): ProjectedDocument | null {
  const local = apart(sink);
  const fields = only === undefined ? ROOT : Object.fromEntries(only.map((key) => [key, ROOT[key]]));
  checkFields({ is: "object", fields }, doc, prefix, CONTEXT_CODE, local);
  return report(local, sink) ? (doc as ProjectedDocument) : null;
}

/** What an API may read of its context once admitted: typed record envelopes, and record documents still opaque. */
export interface AdmittedContext {
  /** Registry records without their `document`; `undefined` when the caller supplied no registry. */
  readonly registry: readonly RegisteredTemplateRecord[] | undefined;
  /** The record documents, by registry index. Opaque: `projectDocument` is the only reader. */
  readonly documents: readonly unknown[];
  /** The caller's own record objects, by registry index: handed back, never read again. */
  readonly entries: readonly RegisteredTemplateRecord[];
  readonly declaredRenames: readonly DeclaredBreakingRename[] | undefined;
  readonly mappingFile: MappingFile | undefined;
}

const CONTEXT_MEMBERS = ["registry", "declaredRenames", "mappingFile"] as const;

const ownData = (holder: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(holder, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
};

/**
 * The named own members of a caller's object, read as data: an absent one is left out, an accessor is refused and
 * never run. `null` when the holder is not a plain object.
 */
function dataMembers(holder: unknown, names: readonly string[], at: string, sink: ValidationSink): Record<string, unknown> | null {
  if (!isRecord(holder)) {
    refuse(sink, CONTEXT_CODE, at, "be a plain object");
    return null;
  }
  const members: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    if (descriptor === undefined) continue;
    if ("value" in descriptor) members[name] = descriptor.value;
    else refuse(sink, CONTEXT_CODE, `${at}.${name}`, "be a data property");
  }
  return members;
}

function plainJson(value: unknown, at: string, sink: ValidationSink): JsonValue | undefined {
  const projected = toJsonValue(value);
  if (projected.ok) {
    const bound = boundExceeded(projected.value);
    if (bound !== null) refuse(sink, CONTEXT_CODE, at, bound);
    return bound === null ? projected.value : undefined;
  }
  const path = projected.path === "" ? at : projected.path.startsWith("[") ? `${at}${projected.path}` : `${at}.${projected.path}`;
  addError(sink, CONTEXT_CODE, path, `Plain-JSON projection failed at ${path}: ${projected.reason}`);
  return undefined;
}

/** Reads the context as data: no accessor run, each record envelope projected. Reading may throw: see `admitContext`. */
function readContext(context: unknown, sink: ValidationSink): AdmittedContext | null {
  const stated = context === undefined ? {} : dataMembers(context, CONTEXT_MEMBERS, "context", sink);
  if (stated === null) return null;
  const records: RegisteredTemplateRecord[] = [];
  const documents: unknown[] = [];
  const entries: RegisteredTemplateRecord[] = [];
  const registry = stated.registry;
  if (registry !== undefined && !Array.isArray(registry)) refuse(sink, CONTEXT_CODE, "context.registry", "be an array");
  for (let idx = 0; Array.isArray(registry) && idx < registry.length; idx += 1) {
    const at = `context.registry[${idx}]`;
    const entry = ownData(registry, String(idx));
    const members = dataMembers(entry, [...Object.keys(REGISTRY_RECORD.fields), "document"], at, sink);
    // The first entry that is no record ends the reading: a sparse array may claim billions of them.
    if (members === null) break;
    const { document, ...envelopeMembers } = members;
    const envelope = plainJson(envelopeMembers, at, sink);
    if (envelope === undefined) continue;
    checkFields(REGISTRY_RECORD, envelope as JsonRecord, at, CONTEXT_CODE, sink);
    records.push(envelope as unknown as RegisteredTemplateRecord);
    documents.push(document);
    entries.push(entry as RegisteredTemplateRecord);
  }
  const renames = stated.declaredRenames === undefined ? undefined : plainJson(stated.declaredRenames, "context.declaredRenames", sink);
  if (renames !== undefined) checkValue(DECLARED_RENAMES, renames, "context.declaredRenames", CONTEXT_CODE, sink);
  const mappingFile = stated.mappingFile === undefined ? undefined : plainJson(stated.mappingFile, "context.mappingFile", sink);
  if (mappingFile !== undefined) checkValue(MAPPING_FILE, mappingFile, "context.mappingFile", CONTEXT_CODE, sink);
  return {
    registry: registry === undefined ? undefined : records,
    documents,
    entries,
    declaredRenames: renames as unknown as DeclaredBreakingRename[] | undefined,
    mappingFile: mappingFile as unknown as MappingFile | undefined,
  };
}

/**
 * Entry of the validation context: everything the gate reads from it, projected and type-checked once. `undefined`
 * alone means "no context"; a context that cannot be read as data is refused, like a document that cannot.
 */
export function admitContext(context: unknown, sink: ValidationSink): AdmittedContext | null {
  const local = apart(sink);
  let admitted: AdmittedContext | null = null;
  try {
    admitted = readContext(context, local);
  } catch {
    refuse(local, CONTEXT_CODE, "context", "be readable as plain data");
  }
  return report(local, sink) ? admitted : null;
}

/** What a rule may read beside the two values it compares. The two documents are normalised ones: no raw document fits. */
interface WalkContext {
  readonly oldDoc: NormalizedDocument;
  readonly newDoc: NormalizedDocument;
  readonly oldParent: unknown;
  readonly newParent: unknown;
  readonly oldLevelRankById: ReadonlyMap<string, number>;
  readonly newLevelRankById: ReadonlyMap<string, number>;
  readonly oldBandIds: ReadonlySet<string>;
  readonly newBandIds: ReadonlySet<string>;
}

export interface RuleContext extends WalkContext {
  readonly segments: readonly string[];
  readonly path: string;
}

export interface PresentationRule {
  readonly id: string;
  readonly patterns: readonly string[];
  readonly docOnly: boolean;
  readonly code: string;
  readonly inBundle: boolean | ((segments: readonly string[]) => boolean);
  readonly formatTag: (segments: readonly string[]) => string;
}

export interface WideningRule {
  readonly id: string;
  readonly patterns: readonly string[];
  readonly additiveCode: string;
  readonly breakingCode?: string;
  readonly inBundle: boolean | ((outcome: "additive" | "breaking", ctx: RuleContext) => boolean);
  readonly edgeOnly?: boolean;
  readonly classify?: (oldVal: unknown, newVal: unknown, ctx: RuleContext) => "additive" | "breaking" | "noop";
  readonly canWiden: (oldVal: unknown, newVal: unknown, ctx: RuleContext) => boolean;
  readonly formatTag?: (outcome: "additive" | "breaking", code: string, ctx: RuleContext) => string;
  readonly formatPath?: (outcome: "additive" | "breaking", ctx: RuleContext) => string;
  readonly formatSubject?: (outcome: "additive" | "breaking", ctx: RuleContext) => string;
}

function attrPrefixLength(segments: readonly string[]): number | null {
  const isNode = segments[0] === "node_types" && (segments[2] === "attributes" || segments[2] === "properties") && segments.length >= 4;
  const isRel = segments[0] === "relation_types" && segments[2] === "attributes" && segments.length >= 4;
  if (!isNode && !isRel) return null;
  let i = 4;
  while (i < segments.length) {
    if (segments[i] === "item") i += 1;
    else if (segments[i] === "attributes" && i + 1 < segments.length) i += 2;
    else break;
  }
  return i;
}

function attrOwnerSubject(segments: readonly string[]): string {
  const attrLen = attrPrefixLength(segments) ?? segments.length;
  const parts = [segments[1]!, segments[3]!];
  for (let i = 4; i < attrLen;) {
    if (segments[i] === "item") { parts.push("item"); i += 1; }
    else if (segments[i] === "attributes" && i + 1 < attrLen) { parts.push(segments[i + 1]!); i += 2; }
    else break;
  }
  return parts.join(".");
}

const attrDeclPath = (segments: readonly string[]): string => segments.slice(0, attrPrefixLength(segments) ?? segments.length).join(".");
const isNodeProp = (segments: readonly string[]): boolean => segments[0] === "node_types" && segments[2] === "properties";
const smSubject = (segments: readonly string[]): string => segments[0] === "hardening" ? "hardening" : (segments[2] === "state_machine" ? segments[1]! : `${segments[1]!}.${segments[3]!}`);
const trBundlePath = (segments: readonly string[]): string => segments[0] === "hardening" ? "hardening.status_transitions" : segments.slice(0, -2).join(".");
const trEdge = (segments: readonly string[]): string => segments[0] === "hardening" ? segments[2]! : (segments[2] === "state_machine" ? segments[4]! : segments[5]!);

function isValidAttrDeclDeep(raw: unknown, depth = 0): boolean {
  if (depth > 16 || !hasOnlyKeys(raw, ATTR_DECL_KNOWN_KEYS) || (raw.required !== undefined && typeof raw.required !== "boolean")) return false;
  if (raw.kind === "collection") return isValidAttrDeclDeep(raw.item, depth + 1);
  if (raw.kind === "record") return isRecord(raw.attributes) && Object.values(raw.attributes).every((v) => isValidAttrDeclDeep(v, depth + 1));
  return true;
}

const isValidNormTransition = (raw: unknown): boolean => hasOnlyKeys(raw, TRANSITION_NORM_KEYS) && (raw.authority === undefined || rankIn(AUTHORITY_RANK, raw.authority) !== undefined);
const isValidNormStateMachine = (raw: unknown): boolean => hasOnlyKeys(raw, STATE_MACHINE_KEYS) && (raw.transitions === undefined || (isRecord(raw.transitions) && Object.values(raw.transitions).every(isValidNormTransition)));
const isValidNormAdmission = (raw: unknown): boolean => hasOnlyKeys(raw, ADMISSION_POLICY_KEYS) && (raw.third_party_distinct_from_author === undefined || typeof raw.third_party_distinct_from_author === "boolean") && rankIn(ADMISSION_MODE_RANK, raw.mode) !== undefined && (["by_rank", "by_operation", "by_transition"] as const).every((k) => raw[k] === undefined || (isRecord(raw[k]) && Object.values(raw[k]).every((m) => rankIn(ADMISSION_MODE_RANK, m) !== undefined)));
const isValidNormNode = (raw: unknown): boolean => hasOnlyKeys(raw, NODE_KNOWN_KEYS) && (raw.source_backed === undefined || typeof raw.source_backed === "boolean") && (!isRecord(raw.attributes) || Object.values(raw.attributes).every((v) => isValidAttrDeclDeep(v))) && (!isRecord(raw.properties) || Object.values(raw.properties).every((v) => isValidAttrDeclDeep(v))) && (raw.state_machine === undefined || isValidNormStateMachine(raw.state_machine)) && (!isRecord(raw.state_machines) || Object.values(raw.state_machines).every(isValidNormStateMachine)) && (raw.admission_policy === undefined || isValidNormAdmission(raw.admission_policy));
const isValidNormRelation = (raw: unknown): boolean => hasOnlyKeys(raw, REL_KNOWN_KEYS) && (raw.requires_evidence === undefined || typeof raw.requires_evidence === "boolean") && (!isRecord(raw.attributes) || Object.values(raw.attributes).every((v) => isValidAttrDeclDeep(v))) && (raw.hierarchy === undefined || hasOnlyKeys(raw.hierarchy, REL_HIERARCHY_KEYS)) && (raw.cardinality === undefined || (isRecord(raw.cardinality) && Object.keys(raw.cardinality).every((k) => k === "in" || k === "out") && (["in", "out"] as const).every((d) => raw.cardinality![d] === undefined || (isRecord(raw.cardinality![d]) && Object.keys(raw.cardinality![d] as object).every((k) => k === "min" || k === "max")))));
const isValidNormHardening = (raw: unknown): boolean => hasOnlyKeys(raw, HARDENING_KEYS) && (raw.status_transitions === undefined || (isRecord(raw.status_transitions) && Object.values(raw.status_transitions).every(isValidNormTransition)));

function setRule(
  id: string, patterns: readonly string[], additiveCode: string, breakingCode: string, subsetWidens: boolean,
  inBundle: WideningRule["inBundle"], formatSubject?: WideningRule["formatSubject"], formatTag?: WideningRule["formatTag"], formatPath?: WideningRule["formatPath"],
): WideningRule {
  return { id, patterns, additiveCode, breakingCode, inBundle, canWiden: (o, n) => (subsetWidens ? isSetSubset(o, n) : isSetSuperset(o, n)), formatSubject, formatTag, formatPath };
}

function boolOffRule(
  id: string, patterns: readonly string[], additiveCode: string, breakingCode: string,
  inBundle: WideningRule["inBundle"], formatSubject?: WideningRule["formatSubject"],
): WideningRule {
  return { id, patterns, additiveCode, breakingCode, inBundle, canWiden: (o, n) => o === true && n === false, formatSubject };
}

function addedRule(
  id: string, patterns: readonly string[], additiveCode: string, breakingCode: string,
  inBundle: WideningRule["inBundle"], checkNew: (n: unknown, ctx: RuleContext) => boolean,
  formatSubject?: WideningRule["formatSubject"], formatTag?: WideningRule["formatTag"], formatPath?: WideningRule["formatPath"],
): WideningRule {
  return {
    id, patterns, additiveCode, breakingCode, inBundle, edgeOnly: true,
    canWiden: (o, n, c) => o === undefined && checkNew(n, c),
    formatTag: formatTag ?? ((out, code, c) => {
      const subj = formatSubject ? formatSubject(out, c) : (c.segments.at(-1) ?? "template");
      const seg = c.segments.at(-1)!;
      if (out === "breaking" && (!isRecord(c.oldParent) || !Object.hasOwn(c.oldParent, seg)) && isRecord(c.newParent) && Object.hasOwn(c.newParent, seg)) {
        return `added_invalid_${additiveCode.replace(/^added_/, "")}:${subj}`;
      }
      return `${code}:${subj}`;
    }),
    formatSubject, formatPath,
  };
}

function pinUpgradeIsValidMinor(c: RuleContext): boolean {
  if (!isRecord(c.oldParent) || !isRecord(c.newParent)) return false;
  const ov = typeof c.oldParent.templateVersion === "string" ? parseSemVer(c.oldParent.templateVersion) : null;
  const nv = typeof c.newParent.templateVersion === "string" ? parseSemVer(c.newParent.templateVersion) : null;
  return Boolean(ov && nv && nv.major === ov.major && compareSemVer(nv, ov) > 0);
}

function admissionOverrideRanks(o: unknown, n: unknown, c: RuleContext): readonly [number | undefined, number | undefined] {
  const oAp = (c.oldDoc.node_types as Record<string, Record<string, Record<string, unknown>>> | undefined)?.[c.segments[1]!]?.admission_policy;
  const nAp = (c.newDoc.node_types as Record<string, Record<string, Record<string, unknown>>> | undefined)?.[c.segments[1]!]?.admission_policy;
  return [rankIn(ADMISSION_MODE_RANK, o ?? oAp?.mode), rankIn(ADMISSION_MODE_RANK, n ?? nAp?.mode)];
}

const segAt = (idx: number) => (_out: "additive" | "breaking", c: RuleContext) => c.segments[idx]!;
const attrInBundle = (_out: "additive" | "breaking", c: RuleContext) => !isNodeProp(c.segments);
const attrTag = (_out: "additive" | "breaking", code: string, c: RuleContext) => `${code}:${attrOwnerSubject(c.segments)}`;
const attrSubj = (_out: "additive" | "breaking", c: RuleContext) => attrOwnerSubject(c.segments);
const attrP = (_out: "additive" | "breaking", c: RuleContext) => attrDeclPath(c.segments);
const trSubj = (_out: "additive" | "breaking", c: RuleContext) => `${smSubject(c.segments)}:${trEdge(c.segments)}`;
const trTag = (_out: "additive" | "breaking", code: string, c: RuleContext) => `${code}:${smSubject(c.segments)}:${trEdge(c.segments)}`;
const trPath = (_out: "additive" | "breaking", c: RuleContext) => trBundlePath(c.segments);
const smTag = (_out: "additive" | "breaking", code: string, c: RuleContext) => `${code}:${smSubject(c.segments)}`;
const smSubj = (_out: "additive" | "breaking", c: RuleContext) => smSubject(c.segments);
const noSubjTag = (_out: "additive" | "breaking", code: string) => code;

/** Explicit table of paths downgraded to PATCH (doc-only / presentation / envelope metadata). */
export const PRESENTATION_ONLY_RULES: readonly PresentationRule[] = [
  { id: "envelope-version", patterns: ["version"], docOnly: false, code: "bumped_profile_version", inBundle: false, formatTag: () => "version" },
  { id: "envelope-metadata", patterns: ["{parent_pin,mapping_pin,profile_hash,presentation_hash,sourcePath}"], docOnly: false, code: "envelope_metadata", inBundle: false, formatTag: (s) => s[0]! },
  { id: "registry-bound-source-path", patterns: ["registries.*.bound_source_path"], docOnly: false, code: "registry_bound_source_path", inBundle: false, formatTag: (s) => s[1]! },
  { id: "top-presentation", patterns: ["presentation"], docOnly: true, code: "changed_presentation", inBundle: false, formatTag: () => "changed_presentation" },
  { id: "node-definition", patterns: ["node_types.*.definition"], docOnly: true, code: "changed_node_definition", inBundle: false, formatTag: (s) => `changed_node_definition:${s[1]!}` },
  { id: "node-visual-encoding", patterns: ["node_types.*.visual_encoding"], docOnly: true, code: "changed_node_visual_encoding", inBundle: false, formatTag: (s) => `changed_node_visual_encoding:${s[1]!}` },
  { id: "relation-description", patterns: ["relation_types.*.description"], docOnly: true, code: "changed_relation_description", inBundle: false, formatTag: (s) => `changed_relation_description:${s[1]!}` },
  { id: "attr-description", patterns: ["@attr.description"], docOnly: true, code: "changed_attr_description", inBundle: (s) => !isNodeProp(s), formatTag: (s) => `changed_attr_description:${attrOwnerSubject(s)}` },
  { id: "invariant-summary", patterns: ["domain_policies.invariants.*.summary"], docOnly: true, code: "changed_domain_invariant_summary", inBundle: true, formatTag: (s) => `changed_domain_invariant_summary:${s[2]!}` },
];

/** Explicit table of paths downgraded from BREAKING to ADDITIVE (MINOR) when their widening predicate holds. */
export const WIDENING_RULES: readonly WideningRule[] = [
  addedRule("added-composed-pin", ["composed_lineage_pins.*"], "added_composed_lineage_pin", "removed_composed_lineage_pin", true, (n) => hasOnlyKeys(n, COMPOSED_PIN_KEYS), segAt(1)),
  {
    id: "updated-composed-pin-version", patterns: ["composed_lineage_pins.*.templateVersion"], additiveCode: "updated_composed_lineage_pin", breakingCode: "incompatible_composed_lineage_pin", inBundle: true,
    canWiden: (o, n) => { const ov = typeof o === "string" ? parseSemVer(o) : null, nv = typeof n === "string" ? parseSemVer(n) : null; return Boolean(ov && nv && nv.major === ov.major && compareSemVer(nv, ov) > 0); },
    formatSubject: segAt(1), formatTag: (_out, code, c) => `${code}:${c.segments[1]!}`,
  },
  {
    id: "updated-composed-pin-digest", patterns: ["composed_lineage_pins.*.templateDigestSha256"], additiveCode: "updated_composed_lineage_pin", breakingCode: "changed_composed_lineage_pin_digest", inBundle: true,
    canWiden: (_o, _n, c) => pinUpgradeIsValidMinor(c),
    classify: (_o, _n, c) => pinUpgradeIsValidMinor(c) ? "noop" : "breaking",
    formatSubject: segAt(1), formatTag: (_out, code, c) => `${code}:${c.segments[1]!}`,
  },
  addedRule("added-registry", ["registries.*"], "added_registry", "removed_registry", false, (n) => hasOnlyKeys(n, REGISTRY_KEYS), segAt(1)),
  addedRule("added-node-type", ["node_types.*"], "added_node_type", "removed_node_type", false, isValidNormNode, segAt(1)),
  setRule("added-node-aliases", ["node_types.*.aliases"], "added_node_alias", "removed_node_alias", false, false, segAt(1)),
  boolOffRule("relaxed-node-source-backed", ["node_types.*.source_backed"], "relaxed_node_source_backed", "tightened_node_source_backed", false, segAt(1)),
  {
    id: "added-optional-attr", patterns: ["@attr"], edgeOnly: true, additiveCode: "added_optional_attr", breakingCode: "removed_attr",
    inBundle: (out, c) => !isNodeProp(c.segments) || (out === "breaking" && isRecord(c.newParent) && isRecord((c.newParent as Record<string, unknown>)[c.segments.at(-1)!]) && isRecord(c.oldParent) && !Object.hasOwn(c.oldParent, c.segments.at(-1)!)),
    canWiden: (o, n) => o === undefined && isValidAttrDeclDeep(n) && (n as Record<string, unknown>).required !== true,
    formatTag: (out, code, c) => {
      if (out === "breaking" && isRecord(c.newParent) && Object.hasOwn(c.newParent, c.segments.at(-1)!)) {
        const entry = c.newParent[c.segments.at(-1)!];
        return `${isRecord(entry) && entry.required === true ? "added_required_attr" : "added_invalid_attr"}:${attrOwnerSubject(c.segments)}`;
      }
      return `${code}:${attrOwnerSubject(c.segments)}`;
    },
    formatSubject: attrSubj, formatPath: attrP,
  },
  {
    id: "relaxed-attr-required", patterns: ["@attr.required"], additiveCode: "relaxed_attr_required", breakingCode: "tightened_attr_required", inBundle: attrInBundle,
    canWiden: (o, n) => o === true && n === false,
    formatSubject: attrSubj, formatPath: (out, c) => out === "breaking" ? attrDeclPath(c.segments) : `${attrDeclPath(c.segments)}.required`, formatTag: attrTag,
  },
  { id: "widened-attr-enum", patterns: ["@attr.values"], additiveCode: "widened_attr_enum", breakingCode: "narrowed_attr_enum", inBundle: attrInBundle, canWiden: (o, n, c) => isRecord(c.oldParent) && isRecord(c.newParent) && c.oldParent.kind === "enum" && c.newParent.kind === "enum" && isSetSuperset(o, n), formatSubject: attrSubj, formatTag: attrTag },
  { id: "widened-attr-ref-targets", patterns: ["@attr.targetTypes"], additiveCode: "widened_attr_ref_targets", breakingCode: "narrowed_attr_ref_targets", inBundle: attrInBundle, canWiden: (o, n, c) => isRecord(c.oldParent) && isRecord(c.newParent) && c.oldParent.kind === "ref" && c.newParent.kind === "ref" && isSetSuperset(o, n), formatSubject: attrSubj, formatTag: attrTag },
  { id: "widened-attr-length", patterns: ["@attr.{minLength,maxLength}"], additiveCode: "widened_attr_length", breakingCode: "narrowed_attr_length", inBundle: attrInBundle, canWiden: (o, n, c) => isRecord(c.oldParent) && isRecord(c.newParent) && c.oldParent.kind === c.newParent.kind && (c.oldParent.kind === "string" || c.oldParent.kind === "timestamp" || c.oldParent.kind === "digest") && (c.segments.at(-1) === "minLength" ? isWidenedLower(o, n, 0) : isWidenedUpper(o, n)), formatSubject: attrSubj, formatPath: attrP, formatTag: attrTag },
  { id: "widened-attr-range", patterns: ["@attr.{min,max}"], additiveCode: "widened_attr_range", breakingCode: "narrowed_attr_range", inBundle: attrInBundle, canWiden: (o, n, c) => isRecord(c.oldParent) && isRecord(c.newParent) && c.oldParent.kind === c.newParent.kind && (c.oldParent.kind === "number" || c.oldParent.kind === "integer") && (c.segments.at(-1) === "min" ? (isFiniteNum(o) && n === undefined) || isWidenedLower(o, n, -Infinity) : isWidenedUpper(o, n)), formatSubject: attrSubj, formatPath: attrP, formatTag: attrTag },
  { id: "widened-attr-items", patterns: ["@attr.{minItems,maxItems}"], additiveCode: "widened_attr_items", breakingCode: "narrowed_attr_items", inBundle: attrInBundle, canWiden: (o, n, c) => isRecord(c.oldParent) && isRecord(c.newParent) && c.oldParent.kind === "collection" && c.newParent.kind === "collection" && (c.segments.at(-1) === "minItems" ? isWidenedLower(o, n, 0) : isWidenedUpper(o, n)), formatSubject: attrSubj, formatPath: attrP, formatTag: attrTag },
  { id: "relaxed-attr-pattern", patterns: ["@attr.pattern"], additiveCode: "relaxed_attr_pattern", breakingCode: "changed_attr_pattern", inBundle: attrInBundle, canWiden: (o, n, c) => isRecord(c.oldParent) && isRecord(c.newParent) && c.oldParent.kind === c.newParent.kind && typeof o === "string" && n === undefined, formatSubject: attrSubj, formatTag: attrTag },
  addedRule("added-state-machine", ["node_types.*.state_machine", "node_types.*.state_machines.*"], "added_state_machine", "removed_state_machine", true, isValidNormStateMachine, smSubj, smTag),
  setRule("added-state", ["node_types.*.state_machine.states", "node_types.*.state_machines.*.states", "hardening.statuses"], "added_state", "removed_state", false, (_o, c) => c.segments[0] !== "hardening", smSubj, smTag),
  setRule("added-terminal-state", ["node_types.*.state_machine.terminal_states", "node_types.*.state_machines.*.terminal_states"], "added_terminal_state", "removed_terminal_state", false, true, smSubj, smTag),
  addedRule("added-transition", ["node_types.*.state_machine.transitions.*", "node_types.*.state_machines.*.transitions.*", "hardening.status_transitions.*"], "added_transition", "removed_transition", (_o, c) => c.segments[0] !== "hardening", isValidNormTransition, trSubj, trTag, trPath),
  {
    id: "relaxed-transition-authority", patterns: ["node_types.*.state_machine.transitions.*.authority", "node_types.*.state_machines.*.transitions.*.authority", "hardening.status_transitions.*.authority"],
    additiveCode: "relaxed_transition_authority", breakingCode: "tightened_transition_authority", inBundle: true,
    canWiden: (o, n) => { const or = rankIn(AUTHORITY_RANK, o), nr = rankIn(AUTHORITY_RANK, n); return or !== undefined && nr !== undefined && nr < or; },
    formatSubject: trSubj, formatPath: trPath, formatTag: trTag,
  },
  setRule("relaxed-transition-requires", ["node_types.*.state_machine.transitions.*.requires", "node_types.*.state_machines.*.transitions.*.requires", "hardening.status_transitions.*.requires"], "relaxed_transition_requires", "tightened_transition_requires", true, (_o, c) => c.segments[0] !== "hardening", trSubj, trTag, trPath),
  addedRule("added-hardening", ["hardening"], "added_hardening", "removed_hardening", false, isValidNormHardening, undefined, noSubjTag),
  setRule("relaxed-hardening-promotion", ["hardening.promotion_requires"], "relaxed_hardening_promotion", "tightened_hardening_promotion", true, false, undefined, noSubjTag),
  { id: "removed-admission-policy", patterns: ["node_types.*.admission_policy"], edgeOnly: true, additiveCode: "removed_admission_policy", breakingCode: "added_admission_policy", inBundle: true, canWiden: (o, n) => o !== undefined && n === undefined, formatSubject: segAt(1) },
  {
    id: "relaxed-admission-mode", patterns: ["node_types.*.admission_policy.mode"], additiveCode: "relaxed_admission_mode", breakingCode: "tightened_admission_mode", inBundle: true,
    canWiden: (o, n) => { const or = rankIn(ADMISSION_MODE_RANK, o), nr = rankIn(ADMISSION_MODE_RANK, n); return or !== undefined && nr !== undefined && nr < or; },
    formatSubject: segAt(1),
  },
  boolOffRule("relaxed-admission-distinct", ["node_types.*.admission_policy.third_party_distinct_from_author"], "relaxed_admission_distinct", "tightened_admission_distinct", true, segAt(1)),
  {
    id: "relaxed-admission-override", patterns: ["node_types.*.admission_policy.{by_rank,by_operation,by_transition}.*"], additiveCode: "relaxed_admission_override", breakingCode: "tightened_admission_override", inBundle: true,
    canWiden: (o, n, c) => { const [or, nr] = admissionOverrideRanks(o, n, c); return or !== undefined && nr !== undefined && nr < or; },
    classify: (o, n, c) => { const [or, nr] = admissionOverrideRanks(o, n, c); return or !== undefined && nr !== undefined && nr === or ? "noop" : (or !== undefined && nr !== undefined && nr < or ? "additive" : "breaking"); },
    formatSubject: (_out, c) => `${c.segments[1]!}.${c.segments[4]!}`,
    formatTag: (out, _code, c) => `${out === "additive" ? "relaxed" : "tightened"}_admission_${c.segments[3]!}:${c.segments[1]!}.${c.segments[4]!}`,
  },
  addedRule("added-relation", ["relation_types.*"], "added_relation", "removed_relation", false, isValidNormRelation, segAt(1)),
  setRule("widened-relation-endpoints", ["relation_types.*.{source_types,target_types}"], "added_relation_endpoint", "removed_relation_endpoint", false, false, segAt(1), (out, _c, c) => `${out === "additive" ? "added" : "removed"}_${c.segments[2]!}:${c.segments[1]!}`),
  {
    id: "widened-relation-cardinality", patterns: ["relation_types.*.cardinality.{in,out}.{min,max}"], additiveCode: "widened_cardinality", breakingCode: "narrowed_cardinality", inBundle: false,
    canWiden: (o, n, c) => c.segments[4] === "min" ? (isFiniteNum(o) && isFiniteNum(n) && n < o) : (() => { const r = (v: unknown) => (v === "many" ? Infinity : isFiniteNum(v) ? v : -1); return r(o) >= 0 && r(n) >= 0 && r(n) > r(o); })(),
    formatSubject: (_out, c) => `${c.segments[1]!}.${c.segments[3]!}`, formatTag: (_out, code, c) => `${code}:${c.segments[1]!}.${c.segments[3]!}`,
  },
  boolOffRule("relaxed-relation-requires-evidence", ["relation_types.*.requires_evidence"], "relaxed_relation_requires_evidence", "tightened_relation_requires_evidence", false, segAt(1)),
  setRule("added-relation-basis-or-method", ["relation_types.*.{assertion_basis,derivation_methods}"], "added_relation_basis", "removed_relation_basis", false, false, segAt(1), (out, _c, c) => `${out === "additive" ? "added" : "removed"}_relation_${c.segments[2]!}:${c.segments[1]!}`),
];
