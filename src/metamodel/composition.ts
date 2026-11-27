import type { CrossLineageCompositionPin, LineageId, Sha256Digest } from "../metamodel-contracts.js";
import { semanticProfileDigest } from "../ontology-guardian/digests.js";
import { deepFreeze } from "../ontology-profile.js";
import { isRecord } from "../profile-validate.js";
import type { MetamodelDiagnostic } from "./diagnostics.js";
import { admitContext, checkDocument, projectDocument, ROOT_FIELDS, unfailing, type Projected, type RootField } from "./semver-gate.js";
import type { MetamodelTemplateDocument, MetamodelValidationContext, RegisteredTemplateRecord } from "./types.js";
import { addError, registryKey, type ValidationSink } from "./validate-common.js";
import { validateComposedLineagePins, validateExternalTypeRef, type CompositionContext } from "./validate-composition.js";
import { validateIdentity } from "./validate-syntax.js";

const FORBIDDEN_OVERRIDE_KEYS = ["extends", "inherits", "override_node_types", "external_overrides"] as const;
/** Every root field but `composed_lineage_pins`, which Lot 0.2 type-checks itself with its own codes. */
type CandidateField = Exclude<RootField, "composed_lineage_pins">;
/**
 * Root fields type-checked on the candidate: all those of the schema but the pins, taken from the schema so that
 * none is left out. The check reads four of them; the template it hands back is checked on all.
 */
const CANDIDATE_FIELDS = ROOT_FIELDS.filter((field): field is CandidateField => field !== "composed_lineage_pins");
/** Root fields it reads from a registered target whose record states no `nodeTypeIds` or `composedLineagePins`. */
const TARGET_FIELDS = ["node_types", "composed_lineage_pins"] as const;

/** A candidate that crossed the composition entry: projected once, the fields above type-checked. */
type CompositionDocument = Projected<CandidateField>;

interface CompositionDiagnostics {
  readonly diagnostics: readonly MetamodelDiagnostic[];
  readonly warnings: readonly MetamodelDiagnostic[];
}

export type CompositionValidationResult =
  | (CompositionDiagnostics & {
      readonly status: "accepted";
      readonly template: MetamodelTemplateDocument;
      readonly templateDigestSha256: Sha256Digest;
      readonly pins: readonly CrossLineageCompositionPin[];
      readonly resolvedTargets: Readonly<Record<string, RegisteredTemplateRecord>>;
      readonly externalEndpoints: readonly string[];
    })
  | (CompositionDiagnostics & {
      readonly status: "refused-metamodel-invalid";
    });

function rejectOverrideKeys(obj: Record<string, unknown>, prefix: string, sink: ValidationSink): void {
  for (const key of FORBIDDEN_OVERRIDE_KEYS) {
    if (!Object.hasOwn(obj, key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    addError(sink, "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION", path, `Template must not declare external override key ${key}`);
  }
}

function rejectExternalColon(val: unknown, path: string, label: string, sink: ValidationSink): boolean {
  if (typeof val !== "string" || !val.includes(":")) return false;
  addError(sink, "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION", path, `${label} ${val}`);
  return true;
}

function recordExternalRefs(items: unknown, pathPrefix: string, composition: CompositionContext, externalEndpoints: Set<string>, sink: ValidationSink): void {
  if (!Array.isArray(items)) return;
  items.forEach((ep, idx) => {
    if (typeof ep !== "string" || !ep.includes(":")) return;
    externalEndpoints.add(ep);
    validateExternalTypeRef(ep, `${pathPrefix}[${idx}]`, composition, sink);
  });
}

/** Every nested declaration is read: the nesting bound of the entry is what bounds this recursion. */
function checkAttrExternalRefs(attr: unknown, path: string, composition: CompositionContext, externalEndpoints: Set<string>, sink: ValidationSink): void {
  if (!isRecord(attr)) return;
  if (attr.kind === "ref") {
    recordExternalRefs(attr.targetTypes, `${path}.targetTypes`, composition, externalEndpoints, sink);
  } else if (attr.kind === "collection") {
    checkAttrExternalRefs(attr.item, `${path}.item`, composition, externalEndpoints, sink);
  } else if (attr.kind === "record" && isRecord(attr.attributes)) {
    for (const [f, child] of Object.entries(attr.attributes)) checkAttrExternalRefs(child, `${path}.attributes.${f}`, composition, externalEndpoints, sink);
  }
}

function walkAttrExternalRefs(rawMap: unknown, basePath: string, composition: CompositionContext, externalEndpoints: Set<string>, sink: ValidationSink): void {
  if (!isRecord(rawMap)) return;
  for (const [name, attr] of Object.entries(rawMap)) checkAttrExternalRefs(attr, `${basePath}.${name}`, composition, externalEndpoints, sink);
}

function checkExternalRedefinitions(doc: CompositionDocument, sink: ValidationSink): void {
  rejectOverrideKeys(doc, "", sink);
  if (isRecord(doc.node_types)) {
    for (const [nodeId, rawNode] of Object.entries(doc.node_types)) {
      const nPath = `node_types.${nodeId}`;
      if (rejectExternalColon(nodeId, nPath, "Cannot declare external type", sink) || !isRecord(rawNode)) continue;
      rejectOverrideKeys(rawNode, nPath, sink);
      rejectExternalColon(rawNode.registry, `${nPath}.registry`, "Must not bind external registry", sink);
    }
  }
  if (isRecord(doc.registries)) {
    for (const [regId, rawReg] of Object.entries(doc.registries)) {
      if (isRecord(rawReg)) rejectExternalColon(rawReg.node_type, `registries.${regId}.node_type`, "Must not target external type", sink);
    }
  }
  if (isRecord(doc.file_projections)) {
    for (const [projId, rawProj] of Object.entries(doc.file_projections)) {
      if (isRecord(rawProj) && Array.isArray(rawProj.include_node_types)) {
        rawProj.include_node_types.forEach((nt, idx) => rejectExternalColon(nt, `file_projections.${projId}.include_node_types[${idx}]`, "Must not project external type", sink));
      }
    }
  }
}

function checkExternalEndpointRefs(doc: CompositionDocument, composition: CompositionContext, sink: ValidationSink): string[] {
  const endpoints = new Set<string>();
  if (isRecord(doc.node_types)) {
    for (const [nodeId, rawNode] of Object.entries(doc.node_types)) {
      if (nodeId.includes(":") || !isRecord(rawNode)) continue;
      walkAttrExternalRefs(rawNode.attributes, `node_types.${nodeId}.attributes`, composition, endpoints, sink);
      walkAttrExternalRefs(rawNode.properties, `node_types.${nodeId}.properties`, composition, endpoints, sink);
    }
  }
  if (isRecord(doc.relation_types)) {
    for (const [relId, rawRel] of Object.entries(doc.relation_types)) {
      if (!isRecord(rawRel)) continue;
      for (const field of ["source_types", "target_types"] as const) recordExternalRefs(rawRel[field], `relation_types.${relId}.${field}`, composition, endpoints, sink);
      walkAttrExternalRefs(rawRel.attributes, `relation_types.${relId}.attributes`, composition, endpoints, sink);
    }
  }
  return [...endpoints].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function refuseComposition(diagnostics: readonly MetamodelDiagnostic[], warnings: readonly MetamodelDiagnostic[]): CompositionValidationResult {
  return Object.freeze({ status: "refused-metamodel-invalid" as const, diagnostics: Object.freeze([...diagnostics]), warnings: Object.freeze([...warnings]) });
}

const recordKey = (record: RegisteredTemplateRecord): string => registryKey(record.lineage, record.templateId, record.templateVersion);

/** The most registered targets the check reads through the candidate's pins: Lot 0.2 follows them recursively. */
const MAX_REACHED_TARGETS = 1024;

/** Registry keys a pin list designates; a pin that is not three strings designates nothing (Lot 0.2 diagnoses it). */
function pinnedKeys(pins: unknown): string[] {
  if (!Array.isArray(pins)) return [];
  return pins.flatMap((pin) => {
    if (!isRecord(pin) || typeof pin.lineage !== "string" || typeof pin.templateId !== "string" || typeof pin.templateVersion !== "string") return [];
    return [registryKey(pin.lineage, pin.templateId, pin.templateVersion)];
  });
}

/**
 * A registered target as Lot 0.2 may read it: an envelope stating its node type ids and its own pins. When the
 * record leaves either to its document, that document crosses the entry here and the fact is read off the projection.
 */
function resolveTarget(record: RegisteredTemplateRecord, rawDocument: unknown, at: string, sink: ValidationSink): RegisteredTemplateRecord {
  if (rawDocument === undefined || (record.nodeTypeIds !== undefined && record.composedLineagePins !== undefined)) return record;
  const projected = projectDocument(rawDocument, sink, at, true);
  const target = projected === null ? null : checkDocument(projected, sink, TARGET_FIELDS, at);
  if (target === null) return record;
  const declaredPins = (target.composed_lineage_pins ?? []) as unknown as readonly CrossLineageCompositionPin[];
  return {
    ...record,
    nodeTypeIds: record.nodeTypeIds ?? (isRecord(target.node_types) ? Object.keys(target.node_types) : undefined),
    composedLineagePins: record.composedLineagePins ?? declaredPins,
  };
}

/** Everything the composition check works on past its entry: no raw document, no raw registry record. */
interface CompositionInputs {
  readonly doc: CompositionDocument;
  readonly lineage: LineageId | null;
  readonly id: string | null;
  readonly identityDiagnostics: readonly MetamodelDiagnostic[];
  /** Envelope-only records by registry key: Lot 0.2 reads ids and pins from them and never a document. */
  readonly registryIndex: Map<string, RegisteredTemplateRecord>;
  readonly hasRegistry: boolean;
  /** The caller's own records by registry key, handed back untouched in `resolvedTargets`. */
  readonly callerRecords: ReadonlyMap<string, RegisteredTemplateRecord>;
}

type CompositionEntry =
  | { readonly ok: false; readonly diagnostics: readonly MetamodelDiagnostic[] }
  | { readonly ok: true; readonly inputs: CompositionInputs };

/**
 * Entry of `validateCrossLineageComposition`: the candidate projected once and type-checked on the fields the check
 * reads, the context admitted, and every registered target the pins reach (transitively) resolved to an envelope.
 * The walk is a loop over at most `MAX_REACHED_TARGETS` targets: a candidate reaching more is refused, never thrown on.
 */
function enterComposition(rawInput: unknown, context: MetamodelValidationContext | undefined): CompositionEntry {
  const sink: ValidationSink = { diagnostics: [], lineage: null, subject: "template" };
  const projected = projectDocument(rawInput, sink);
  if (projected === null) return { ok: false, diagnostics: sink.diagnostics };
  const { lineage, id } = validateIdentity(projected, sink);
  const refusals: ValidationSink = { diagnostics: [], lineage, subject: id ?? "template" };
  const doc = checkDocument(projected, refusals, CANDIDATE_FIELDS);
  const admitted = admitContext(context, refusals);
  // One refusal per site: what Lot 0.2 already said of the identity is not said again.
  const refused = (): CompositionEntry => {
    const reported = new Set(sink.diagnostics.map((d) => `${d.code}\0${d.path}`));
    return { ok: false, diagnostics: [...sink.diagnostics, ...refusals.diagnostics.filter((d) => !reported.has(`${d.code}\0${d.path}`))] };
  };
  if (doc === null || admitted === null) return refused();

  const records = admitted.registry ?? [];
  const indexByKey = new Map(records.map((record, index) => [recordKey(record), index] as const));
  const registryIndex = new Map(records.map((record) => [recordKey(record), record] as const));
  const callerRecords = new Map<string, RegisteredTemplateRecord>();
  const pending = pinnedKeys(projected.composed_lineage_pins);
  const resolved = new Set<string>();
  while (pending.length > 0) {
    const key = pending.pop()!;
    const index = indexByKey.get(key);
    if (index === undefined || resolved.has(key)) continue;
    if (resolved.size === MAX_REACHED_TARGETS) {
      const at = `context.registry[${index}]`;
      addError(refusals, "MM_SYNTAX_NON_PLAIN_OBJECT", at, `${at} must stay within ${MAX_REACHED_TARGETS} registered targets reached from the candidate's pins`);
      break;
    }
    resolved.add(key);
    const target = resolveTarget(records[index]!, admitted.documents[index], `context.registry[${index}].document`, refusals);
    registryIndex.set(key, target);
    callerRecords.set(key, admitted.entries[index]!);
    // One push per key: a list of any length is read, where a spread into the call would exhaust the stack.
    for (const next of pinnedKeys(target.composedLineagePins)) pending.push(next);
  }
  if (refusals.diagnostics.length > 0) return refused();
  const inputs: CompositionInputs = {
    doc, lineage, id, registryIndex, callerRecords,
    identityDiagnostics: sink.diagnostics,
    hasRegistry: admitted.registry !== undefined,
  };
  return { ok: true, inputs };
}

/**
 * Pure Lot 0.3 cross-lineage composition gate (Spec 0 §2.5, §3.2, §6 Lot 0.3).
 * Reuses Lot 0.2 `validateComposedLineagePins` and `validateExternalTypeRef`.
 */
export function validateCrossLineageComposition(
  rawInput: unknown,
  context?: MetamodelValidationContext,
): CompositionValidationResult {
  return unfailing(() => checkComposition(rawInput, context), (failure) => refuseComposition([failure], []));
}

function checkComposition(rawInput: unknown, context: MetamodelValidationContext | undefined): CompositionValidationResult {
  const entered = enterComposition(rawInput, context);
  if (!entered.ok) return refuseComposition(entered.diagnostics, []);
  const { doc, lineage, id, registryIndex, hasRegistry, callerRecords } = entered.inputs;
  const sink: ValidationSink = { diagnostics: [...entered.inputs.identityDiagnostics], lineage, subject: id ?? "template" };
  const composition = validateComposedLineagePins(doc, lineage, id, registryIndex, hasRegistry, sink);
  checkExternalRedefinitions(doc, sink);
  const externalEndpoints = checkExternalEndpointRefs(doc, composition, sink);
  const warnings = sink.diagnostics.filter((d) => d.severity === "warning");
  if (sink.diagnostics.some((d) => d.severity === "error")) return refuseComposition(sink.diagnostics, warnings);
  const resolvedTargets = [...composition.targetByAlias].map(([alias, target]) => [alias, callerRecords.get(recordKey(target)) ?? target] as const);
  return Object.freeze({
    status: "accepted" as const,
    template: deepFreeze(structuredClone(doc)) as unknown as MetamodelTemplateDocument,
    templateDigestSha256: semanticProfileDigest(doc),
    pins: Object.freeze([...composition.pinByAlias.values()]),
    resolvedTargets: Object.freeze(Object.fromEntries(resolvedTargets)),
    externalEndpoints: Object.freeze(externalEndpoints),
    diagnostics: Object.freeze([...sink.diagnostics]),
    warnings: Object.freeze(warnings),
  });
}
