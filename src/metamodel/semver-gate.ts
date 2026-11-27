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
  isNonEmptyString,
  isStringArray,
  type ValidationSink,
} from "./validate-common.js";
import { parseAndProjectInput, validateIdentity } from "./validate-syntax.js";

const ADMISSION_MODE_RANK: Readonly<Record<string, number>> = {
  "bounded-auto": 0, "promotion-third-party-review": 1, "mandate-gated": 2, "mandated-act": 3, "own-act-human": 4,
};

const rankIn = (table: Readonly<Record<string, number>>, val: unknown): number | undefined => typeof val === "string" && Object.hasOwn(table, val) ? table[val] : undefined;
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const normStrSet = (val: unknown): unknown => (isStringArray(val) ? [...new Set(val)].sort() : val);

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
