import type { JsonValue } from "../json-value.js";
import { INVALID_RELATION_CARDINALITY, isRecord, validateRelationCardinality } from "../profile-validate.js";
import { validateAttributeMap } from "./validate-attributes.js";
import {
  addError,
  ID_PREFIX_RE,
  IDENTIFIER_RE,
  isNonEmptyString,
  isStringArray,
  rejectUnknownKeys,
  validateRegexPattern,
  type ValidationSink,
} from "./validate-common.js";
import { validateExternalTypeRef, type CompositionContext } from "./validate-composition.js";
import { validateAdmissionPolicy, validateStateMachine } from "./validate-state-machines.js";

const VISUAL_ENCODING_KEYS = new Set(["shape", "color_hex", "fill", "border"]);
const VISUAL_ENCODING_SHAPES = new Set(["dot", "square", "triangle", "box", "diamond", "star", "hexagon"]);
const VISUAL_ENCODING_FILLS = new Set(["solid", "hollow"]);
const VISUAL_ENCODING_BORDERS = new Set(["normal", "bold"]);
const VISUAL_ENCODING_COLOR_HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const LINKING_KEYS = new Set(["preset", "normalize", "partition_from", "detect", "patterns", "resolve", "evidence"]);
const LINKING_PRESETS = new Set(["gazetteer-exact", "open-extraction", "hybrid-recall"]);
const LINKING_NORMALIZE_KEYS = new Set(["builtin", "fn"]);
const LINKING_PARTITION_KEYS = new Set(["source_frontmatter", "else"]);
const LINKING_PARTITION_ELSE_KEYS = new Set(["path_segment"]);
const LINKING_PATTERN_KEYS = new Set(["form", "flags", "expand", "membership"]);
const LINKING_PATTERN_EXPAND_KEYS = new Set(["ranges"]);
const LINKING_DETECTOR_STRINGS = new Set(["lexicon", "pattern", "llm"]);
const LINKING_DETECTOR_KEYS = new Set(["pattern", "llm"]);
const LINKING_LLM_KEYS = new Set(["trigger", "budget_usd", "dry_run", "min_candidates"]);
const LINKING_LLM_TRIGGERS = new Set(["zero_candidates", "unresolved_candidates", "below_min_candidates"]);
const LINKING_RESOLVE_MODES = new Set(["exact", "none"]);
const LINKING_RESOLVE_KEYS = new Set(["mode"]);
const LINKING_EVIDENCE_KEYS = new Set(["verbatim", "context_window"]);
const RELATION_HIERARCHY_KEYS = new Set(["id", "shape", "parent_role", "child_role"]);

const FORBIDDEN_EXTERNAL_OVERRIDE_KEYS = new Set([
  "extends",
  "inherits",
  "override_node_types",
  "external_overrides",
]);

function validateVisualEncoding(rawVisual: unknown, path: string, sink: ValidationSink): void {
  if (rawVisual === undefined || rawVisual === null) return;
  if (!isRecord(rawVisual)) {
    addError(sink, "MM_NODE_INVALID_VISUAL_ENCODING", path, "visual_encoding must be a plain object");
    return;
  }
  for (const [key, value] of Object.entries(rawVisual)) {
    if (!VISUAL_ENCODING_KEYS.has(key)) {
      addError(sink, "MM_NODE_INVALID_VISUAL_ENCODING", `${path}.${key}`, `Unknown visual_encoding key ${key}`);
      continue;
    }
    if (value === undefined) continue;
    if (key === "shape" && (typeof value !== "string" || !VISUAL_ENCODING_SHAPES.has(value))) {
      addError(sink, "MM_NODE_INVALID_VISUAL_ENCODING", `${path}.shape`, `Invalid visual_encoding shape ${String(value)}`);
    } else if (key === "fill" && (typeof value !== "string" || !VISUAL_ENCODING_FILLS.has(value))) {
      addError(sink, "MM_NODE_INVALID_VISUAL_ENCODING", `${path}.fill`, `Invalid visual_encoding fill ${String(value)}`);
    } else if (key === "border" && (typeof value !== "string" || !VISUAL_ENCODING_BORDERS.has(value))) {
      addError(sink, "MM_NODE_INVALID_VISUAL_ENCODING", `${path}.border`, `Invalid visual_encoding border ${String(value)}`);
    } else if (key === "color_hex" && (typeof value !== "string" || !VISUAL_ENCODING_COLOR_HEX_RE.test(value))) {
      addError(sink, "MM_NODE_INVALID_VISUAL_ENCODING", `${path}.color_hex`, `Invalid visual_encoding color_hex ${String(value)}`);
    }
  }
}

function validateNodeIdentityAndAliases(
  nodeTypeId: string,
  nodePath: string,
  rawNode: Record<string, unknown>,
  seenLowerNames: ReadonlySet<string>,
  seenPrefixes: Set<string>,
  seenAliases: Map<string, string>,
  registries: Record<string, unknown>,
  sink: ValidationSink,
): void {
  if (rawNode.id_prefix !== undefined) {
    if (!isNonEmptyString(rawNode.id_prefix) || !ID_PREFIX_RE.test(rawNode.id_prefix)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${nodePath}.id_prefix`, `Invalid id_prefix ${String(rawNode.id_prefix)}`);
    } else {
      const lowerPrefix = rawNode.id_prefix.toLowerCase();
      if (seenPrefixes.has(lowerPrefix)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${nodePath}.id_prefix`, `Duplicate case-insensitive id_prefix ${rawNode.id_prefix}`);
      } else {
        seenPrefixes.add(lowerPrefix);
      }
    }
  }

  if (rawNode.aliases !== undefined) {
    if (!Array.isArray(rawNode.aliases)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${nodePath}.aliases`, "aliases must be an array of strings");
    } else {
      rawNode.aliases.forEach((alias, idx) => {
        const aliasPath = `${nodePath}.aliases[${idx}]`;
        if (!isNonEmptyString(alias) || /[\0\r\n]/.test(alias) || alias.includes(":")) {
          addError(sink, "MM_NODE_INVALID_IDENTIFIER", aliasPath, `Invalid node alias ${String(alias)}`);
          return;
        }
        const lowerAlias = alias.trim().toLowerCase();
        if (seenLowerNames.has(lowerAlias) && lowerAlias !== nodeTypeId.toLowerCase()) {
          addError(sink, "MM_NODE_INVALID_IDENTIFIER", aliasPath, `Alias ${alias} collides case-insensitively with a declared node type`);
        } else if (seenAliases.has(lowerAlias)) {
          addError(sink, "MM_NODE_INVALID_IDENTIFIER", aliasPath, `Alias ${alias} collides case-insensitively with alias on ${seenAliases.get(lowerAlias)}`);
        } else {
          seenAliases.set(lowerAlias, nodeTypeId);
        }
      });
    }
  }

  if (rawNode.registry !== undefined) {
    const regId = isNonEmptyString(rawNode.registry) ? rawNode.registry : "";
    const reg = regId && Object.hasOwn(registries, regId) ? registries[regId] : undefined;
    if (!isRecord(reg)) {
      addError(sink, "MM_NODE_INVALID_REGISTRY_REF", `${nodePath}.registry`, `References undeclared registry ${String(rawNode.registry)}`);
    } else if (reg.node_type !== nodeTypeId) {
      addError(
        sink,
        "MM_NODE_INVALID_REGISTRY_REF",
        `${nodePath}.registry`,
        `Registry ${regId} binds node_type ${String(reg.node_type)}, expected ${nodeTypeId}`,
      );
    }
  }
}

function validateLinkingPattern(rawPattern: unknown, path: string, sink: ValidationSink): void {
  if (!isRecord(rawPattern)) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", path, "linking pattern must be a plain object");
    return;
  }
  rejectUnknownKeys(rawPattern, LINKING_PATTERN_KEYS, "MM_NODE_INVALID_IDENTIFIER", path, "linking pattern", sink);
  validateRegexPattern(rawPattern.form, "MM_NODE_INVALID_IDENTIFIER", `${path}.form`, sink);
  if (rawPattern.flags !== undefined && rawPattern.flags !== "u") {
    addError(
      sink,
      "MM_NODE_INVALID_IDENTIFIER",
      `${path}.flags`,
      "linking pattern flags must be omitted or 'u' (Unicode mode only)",
    );
  }
  if (rawPattern.membership !== undefined && rawPattern.membership !== "required") {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.membership`, "linking pattern membership must be 'required'");
  }
  if (rawPattern.expand !== undefined) {
    if (!isRecord(rawPattern.expand)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.expand`, "linking pattern expand must be a plain object");
    } else {
      rejectUnknownKeys(
        rawPattern.expand,
        LINKING_PATTERN_EXPAND_KEYS,
        "MM_NODE_INVALID_IDENTIFIER",
        `${path}.expand`,
        "linking pattern expand",
        sink,
      );
      if (rawPattern.expand.ranges !== undefined && !isNonEmptyString(rawPattern.expand.ranges)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.expand.ranges`, "expand.ranges must be a non-empty string");
      }
    }
  }
}

function validateLinkingLlm(rawLlm: unknown, path: string, sink: ValidationSink): void {
  if (!isRecord(rawLlm)) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", path, "linking llm detector config must be a plain object");
    return;
  }
  rejectUnknownKeys(rawLlm, LINKING_LLM_KEYS, "MM_NODE_INVALID_IDENTIFIER", path, "linking llm", sink);
  if (typeof rawLlm.trigger !== "string" || !LINKING_LLM_TRIGGERS.has(rawLlm.trigger)) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.trigger`, `Invalid linking llm trigger ${String(rawLlm.trigger)}`);
  }
  if (
    rawLlm.budget_usd !== undefined &&
    (typeof rawLlm.budget_usd !== "number" || !Number.isFinite(rawLlm.budget_usd) || rawLlm.budget_usd < 0)
  ) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.budget_usd`, "budget_usd must be a non-negative finite number");
  }
  if (rawLlm.dry_run !== undefined && typeof rawLlm.dry_run !== "boolean") {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.dry_run`, "dry_run must be a boolean");
  }
  if (
    rawLlm.min_candidates !== undefined &&
    (!Number.isInteger(rawLlm.min_candidates) || Number(rawLlm.min_candidates) < 0)
  ) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${path}.min_candidates`, "min_candidates must be a non-negative integer");
  }
}

function validateLinkingDetector(detector: unknown, path: string, sink: ValidationSink): void {
  if (typeof detector === "string" && LINKING_DETECTOR_STRINGS.has(detector)) return;
  if (!isRecord(detector)) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", path, "linking detector must be 'lexicon', 'pattern', 'llm', or a detector object");
    return;
  }
  rejectUnknownKeys(detector, LINKING_DETECTOR_KEYS, "MM_NODE_INVALID_IDENTIFIER", path, "linking detector", sink);
  const hasPattern = Object.hasOwn(detector, "pattern");
  const hasLlm = Object.hasOwn(detector, "llm");
  if (hasPattern === hasLlm) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", path, "linking detector object must declare exactly one of 'pattern' or 'llm'");
    return;
  }
  if (hasPattern) validateLinkingPattern(detector.pattern, `${path}.pattern`, sink);
  if (hasLlm) validateLinkingLlm(detector.llm, `${path}.llm`, sink);
}

function validateLinkingAuxiliaryOptions(rawLinking: Record<string, unknown>, lPath: string, sink: ValidationSink): void {
  if (rawLinking.preset !== undefined && (typeof rawLinking.preset !== "string" || !LINKING_PRESETS.has(rawLinking.preset))) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.preset`, `Unsupported linking preset ${String(rawLinking.preset)}`);
  }
  if (rawLinking.partition_from !== undefined) {
    const pf = rawLinking.partition_from;
    if (!isRecord(pf)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.partition_from`, "partition_from must be a plain object");
    } else {
      rejectUnknownKeys(pf, LINKING_PARTITION_KEYS, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.partition_from`, "partition_from", sink);
      if (!isNonEmptyString(pf.source_frontmatter)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.partition_from.source_frontmatter`, "source_frontmatter must be a non-empty string");
      }
      if (pf.else !== undefined) {
        if (!isRecord(pf.else)) {
          addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.partition_from.else`, "partition_from.else must be a plain object");
        } else {
          rejectUnknownKeys(pf.else, LINKING_PARTITION_ELSE_KEYS, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.partition_from.else`, "partition_from.else", sink);
          if (!Number.isInteger(pf.else.path_segment) || Number(pf.else.path_segment) < 0) {
            addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.partition_from.else.path_segment`, "path_segment must be a non-negative integer");
          }
        }
      }
    }
  }
  if (rawLinking.resolve !== undefined) {
    const res = rawLinking.resolve;
    if (typeof res === "string") {
      if (!LINKING_RESOLVE_MODES.has(res)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.resolve`, `Invalid linking resolve mode ${res}`);
      }
    } else if (isRecord(res)) {
      rejectUnknownKeys(res, LINKING_RESOLVE_KEYS, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.resolve`, "linking resolve", sink);
      if (typeof res.mode !== "string" || !LINKING_RESOLVE_MODES.has(res.mode)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.resolve.mode`, `Invalid linking resolve mode ${String(res.mode)}`);
      }
    } else {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.resolve`, "linking resolve must be 'exact', 'none', or { mode }");
    }
  }
  if (rawLinking.evidence !== undefined) {
    const ev = rawLinking.evidence;
    if (!isRecord(ev)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.evidence`, "linking evidence must be a plain object");
    } else {
      rejectUnknownKeys(ev, LINKING_EVIDENCE_KEYS, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.evidence`, "linking evidence", sink);
      if (ev.verbatim !== undefined && ev.verbatim !== "required") {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.evidence.verbatim`, "evidence.verbatim must be 'required'");
      }
      if (ev.context_window !== undefined && (!Number.isInteger(ev.context_window) || Number(ev.context_window) < 0)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.evidence.context_window`, "evidence.context_window must be a non-negative integer");
      }
    }
  }
}

function validateNodeLinking(rawLinking: unknown, nodePath: string, sink: ValidationSink): void {
  const lPath = `${nodePath}.linking`;
  if (!isRecord(rawLinking)) {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", lPath, "linking must be a plain object");
    return;
  }
  rejectUnknownKeys(rawLinking, LINKING_KEYS, "MM_NODE_INVALID_IDENTIFIER", lPath, "linking", sink);
  if (rawLinking.normalize !== undefined) {
    if (!isRecord(rawLinking.normalize)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.normalize`, "linking.normalize must be a plain object");
    } else {
      rejectUnknownKeys(rawLinking.normalize, LINKING_NORMALIZE_KEYS, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.normalize`, "linking.normalize", sink);
      if (rawLinking.normalize.fn !== undefined) {
        addError(
          sink,
          "MM_NODE_UNSUPPORTED_LINKING_FN",
          `${lPath}.normalize.fn`,
          "Portable metamodel templates forbid local code execution via linking.normalize.fn",
        );
      }
      if (rawLinking.normalize.builtin !== undefined && !isStringArray(rawLinking.normalize.builtin)) {
        addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.normalize.builtin`, "linking.normalize.builtin must be an array of non-empty strings");
      }
    }
  }
  validateLinkingAuxiliaryOptions(rawLinking, lPath, sink);
  if (rawLinking.patterns !== undefined) {
    if (!Array.isArray(rawLinking.patterns)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.patterns`, "linking.patterns must be an array");
    } else {
      rawLinking.patterns.forEach((entry, idx) => validateLinkingPattern(entry, `${lPath}.patterns[${idx}]`, sink));
    }
  }
  if (rawLinking.detect !== undefined) {
    if (!Array.isArray(rawLinking.detect)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${lPath}.detect`, "linking.detect must be an array");
    } else {
      rawLinking.detect.forEach((detector, idx) => validateLinkingDetector(detector, `${lPath}.detect[${idx}]`, sink));
    }
  }
}

function validateNodeBody(
  nodeTypeId: string,
  rawNode: Record<string, unknown>,
  validLocalNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  collectedStates: Set<string>,
  sink: ValidationSink,
): void {
  const nodePath = `node_types.${nodeTypeId}`;
  for (const [key] of Object.entries(rawNode)) {
    if (FORBIDDEN_EXTERNAL_OVERRIDE_KEYS.has(key)) {
      addError(
        sink,
        "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
        `${nodePath}.${key}`,
        `Node type ${nodeTypeId} must not declare external inheritance or override key ${key}`,
      );
    }
  }
  if (rawNode.definition !== undefined && typeof rawNode.definition !== "string") {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${nodePath}.definition`, "definition must be a string");
  }
  if (rawNode.source_backed !== undefined && typeof rawNode.source_backed !== "boolean") {
    addError(sink, "MM_NODE_INVALID_IDENTIFIER", `${nodePath}.source_backed`, "source_backed must be a boolean");
  }
  if (rawNode.linking !== undefined) {
    validateNodeLinking(rawNode.linking, nodePath, sink);
  }

  validateVisualEncoding(rawNode.visual_encoding, `${nodePath}.visual_encoding`, sink);

  if (rawNode.attributes !== undefined) {
    validateAttributeMap(rawNode.attributes, `${nodePath}.attributes`, validLocalNodeTypes, composition, sink);
  }
  if (rawNode.properties !== undefined) {
    validateAttributeMap(rawNode.properties, `${nodePath}.properties`, validLocalNodeTypes, composition, sink);
  }
  if (rawNode.state_machine !== undefined) {
    validateStateMachine(rawNode.state_machine, `${nodePath}.state_machine`, sink, collectedStates);
  }
  if (rawNode.state_machines !== undefined) {
    if (!isRecord(rawNode.state_machines) || Object.keys(rawNode.state_machines).length === 0) {
      addError(
        sink,
        "MM_STATE_INVALID_MACHINE",
        `${nodePath}.state_machines`,
        "state_machines must declare at least one named state axis",
      );
    } else {
      for (const [axis, machine] of Object.entries(rawNode.state_machines)) {
        if (!IDENTIFIER_RE.test(axis)) {
          addError(sink, "MM_STATE_INVALID_MACHINE", `${nodePath}.state_machines.${axis}`, `Invalid state axis identifier ${axis}`);
        }
        validateStateMachine(machine, `${nodePath}.state_machines.${axis}`, sink, collectedStates);
      }
    }
  }
  if (rawNode.admission_policy !== undefined) {
    validateAdmissionPolicy(rawNode.admission_policy, `${nodePath}.admission_policy`, sink);
  }
}

export function validateNodeTypes(
  doc: Record<string, JsonValue>,
  composition: CompositionContext,
  sink: ValidationSink,
  collectedStates: Set<string>,
): Set<string> {
  for (const [key] of Object.entries(doc)) {
    if (FORBIDDEN_EXTERNAL_OVERRIDE_KEYS.has(key)) {
      addError(
        sink,
        "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
        key,
        `Template must not declare external inheritance or override block ${key}`,
      );
    }
  }

  const rawNodeTypes = doc.node_types;
  if (!isRecord(rawNodeTypes) || Object.keys(rawNodeTypes).length === 0) {
    addError(sink, "MM_NODE_EMPTY_SET", "node_types", "node_types must declare at least one node type");
    return new Set();
  }

  const registries = isRecord(doc.registries) ? doc.registries : {};
  const validLocalNodeTypes = new Set<string>();
  const seenLowerNames = new Set<string>();
  const seenPrefixes = new Set<string>();
  const seenAliases = new Map<string, string>();

  for (const nodeTypeId of Object.keys(rawNodeTypes)) {
    const nodePath = `node_types.${nodeTypeId}`;
    if (nodeTypeId.includes(":")) {
      addError(
        sink,
        "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
        nodePath,
        `Cannot declare or redefine external lineage type ${nodeTypeId} inside node_types`,
      );
      continue;
    }
    if (!IDENTIFIER_RE.test(nodeTypeId)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", nodePath, `Node type identifier ${nodeTypeId} violates /^[A-Za-z][A-Za-z0-9_-]{0,63}$/`);
      continue;
    }
    const lower = nodeTypeId.toLowerCase();
    if (seenLowerNames.has(lower)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", nodePath, `Node type identifier ${nodeTypeId} collides case-insensitively with another node type`);
    } else {
      seenLowerNames.add(lower);
    }
    validLocalNodeTypes.add(nodeTypeId);
  }

  for (const [nodeTypeId, rawNode] of Object.entries(rawNodeTypes)) {
    if (nodeTypeId.includes(":")) continue;
    const nodePath = `node_types.${nodeTypeId}`;
    if (!isRecord(rawNode)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", nodePath, "Node type declaration must be a plain object");
      continue;
    }
    validateNodeIdentityAndAliases(
      nodeTypeId,
      nodePath,
      rawNode,
      seenLowerNames,
      seenPrefixes,
      seenAliases,
      registries,
      sink,
    );
    validateNodeBody(nodeTypeId, rawNode, validLocalNodeTypes, composition, collectedStates, sink);
  }

  return validLocalNodeTypes;
}

function validateRelationHierarchy(rawHierarchy: unknown, hPath: string, sink: ValidationSink): void {
  if (!isRecord(rawHierarchy)) {
    addError(sink, "MM_REL_INVALID_HIERARCHY", hPath, "Relation hierarchy must be a plain object");
    return;
  }
  rejectUnknownKeys(rawHierarchy, RELATION_HIERARCHY_KEYS, "MM_REL_INVALID_HIERARCHY", hPath, "hierarchy", sink);
  if (!isNonEmptyString(rawHierarchy.id)) {
    addError(sink, "MM_REL_INVALID_HIERARCHY", `${hPath}.id`, "Hierarchy id must be a non-empty string");
  }
  if (rawHierarchy.shape !== "tree" && rawHierarchy.shape !== "dag") {
    addError(sink, "MM_REL_INVALID_HIERARCHY", `${hPath}.shape`, "Hierarchy shape must be 'tree' or 'dag'");
  }
  if (rawHierarchy.parent_role !== "source" && rawHierarchy.parent_role !== "target") {
    addError(sink, "MM_REL_INVALID_HIERARCHY", `${hPath}.parent_role`, "parent_role must be 'source' or 'target'");
  }
  if (rawHierarchy.child_role !== "source" && rawHierarchy.child_role !== "target") {
    addError(sink, "MM_REL_INVALID_HIERARCHY", `${hPath}.child_role`, "child_role must be 'source' or 'target'");
  }
  if (rawHierarchy.parent_role === rawHierarchy.child_role) {
    addError(sink, "MM_REL_INVALID_HIERARCHY", hPath, "parent_role and child_role must be distinct");
  }
}

export function validateRelationTypes(
  doc: Record<string, JsonValue>,
  knownNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  sink: ValidationSink,
): void {
  if (doc.relation_types === undefined) return;
  if (!isRecord(doc.relation_types)) {
    addError(sink, "MM_REL_MISSING_ENDPOINTS", "relation_types", "relation_types must be a plain object");
    return;
  }

  for (const [relId, rawRel] of Object.entries(doc.relation_types)) {
    const relPath = `relation_types.${relId}`;
    if (!IDENTIFIER_RE.test(relId)) {
      addError(sink, "MM_NODE_INVALID_IDENTIFIER", relPath, `Relation identifier ${relId} violates /^[A-Za-z][A-Za-z0-9_-]{0,63}$/`);
    }
    if (!isRecord(rawRel)) {
      addError(sink, "MM_REL_MISSING_ENDPOINTS", relPath, "Relation declaration must be a plain object");
      continue;
    }

    if (rawRel.description !== undefined && typeof rawRel.description !== "string") {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${relPath}.description`, "Relation description must be a string");
    }
    if (rawRel.requires_evidence !== undefined && typeof rawRel.requires_evidence !== "boolean") {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${relPath}.requires_evidence`, "requires_evidence must be a boolean");
    }
    if (rawRel.assertion_basis !== undefined && !isStringArray(rawRel.assertion_basis)) {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${relPath}.assertion_basis`, "assertion_basis must be an array of non-empty strings");
    }
    if (rawRel.derivation_methods !== undefined && !isStringArray(rawRel.derivation_methods)) {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${relPath}.derivation_methods`, "derivation_methods must be an array of non-empty strings");
    }

    const sourceTypes = isStringArray(rawRel.source_types) ? rawRel.source_types : [];
    const targetTypes = isStringArray(rawRel.target_types) ? rawRel.target_types : [];
    if (sourceTypes.length === 0) {
      addError(sink, "MM_REL_MISSING_ENDPOINTS", `${relPath}.source_types`, "Relation requires non-empty source_types");
    }
    if (targetTypes.length === 0) {
      addError(sink, "MM_REL_MISSING_ENDPOINTS", `${relPath}.target_types`, "Relation requires non-empty target_types");
    }

    for (const [field, eps] of [
      ["source_types", sourceTypes],
      ["target_types", targetTypes],
    ] as const) {
      eps.forEach((ep, idx) => {
        const epPath = `${relPath}.${field}[${idx}]`;
        if (ep.includes(":")) {
          validateExternalTypeRef(ep, epPath, composition, sink);
        } else if (!knownNodeTypes.has(ep)) {
          addError(sink, "MM_REL_UNKNOWN_ENDPOINT_TYPE", epPath, `Unknown ${field === "source_types" ? "source" : "target"} node type ${ep}`);
        }
      });
    }

    const cardErrors = validateRelationCardinality(rawRel.cardinality, `${relPath}.cardinality`);
    for (const msg of cardErrors) {
      const marker = msg.lastIndexOf(` ${INVALID_RELATION_CARDINALITY}:`);
      const errPath = marker >= 0 ? msg.slice(0, marker) : `${relPath}.cardinality`;
      addError(sink, "MM_REL_INVALID_CARDINALITY", errPath, msg);
    }

    if (rawRel.attributes !== undefined) {
      validateAttributeMap(rawRel.attributes, `${relPath}.attributes`, knownNodeTypes, composition, sink);
    }
    if (rawRel.hierarchy !== undefined) {
      validateRelationHierarchy(rawRel.hierarchy, `${relPath}.hierarchy`, sink);
    }
  }
}
