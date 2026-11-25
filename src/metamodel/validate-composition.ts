import type { JsonValue } from "../json-value.js";
import type { CrossLineageCompositionPin, LineageId } from "../metamodel-contracts.js";
import { isRecord } from "../profile-validate.js";
import type { RegisteredTemplateRecord } from "./types.js";
import {
  addError,
  IDENTIFIER_RE,
  isExactSemVer,
  isNonEmptyString,
  isSha256Digest,
  registryKey,
  rejectUnknownKeys,
  streamKey,
  TEMPLATE_ID_RE,
  VALID_LINEAGES,
  type ValidationSink,
} from "./validate-common.js";

const COMPOSITION_PIN_KEYS: ReadonlySet<string> = new Set([
  "importAlias",
  "lineage",
  "templateId",
  "templateVersion",
  "templateDigestSha256",
]);

export interface CompositionContext {
  readonly pinByAlias: Map<string, CrossLineageCompositionPin>;
  readonly targetByAlias: Map<string, RegisteredTemplateRecord>;
}

function validateSingleCompositionPin(
  rawPin: unknown,
  path: string,
  pinByAlias: Map<string, CrossLineageCompositionPin>,
  targetByAlias: Map<string, RegisteredTemplateRecord>,
  registryIndex: Map<string, RegisteredTemplateRecord>,
  hasRegistry: boolean,
  sink: ValidationSink,
): CrossLineageCompositionPin | null {
  if (!isRecord(rawPin)) {
    addError(sink, "MM_COMPOSE_FLOATING_VERSION", path, "Composition pin must be a plain object");
    return null;
  }

  const { importAlias, lineage: pinLineage, templateId, templateVersion, templateDigestSha256 } = rawPin;
  let valid = !rejectUnknownKeys(
    rawPin,
    COMPOSITION_PIN_KEYS,
    "MM_COMPOSE_FLOATING_VERSION",
    path,
    "composed_lineage_pins entry",
    sink,
  );

  if (!isNonEmptyString(importAlias) || !IDENTIFIER_RE.test(importAlias)) {
    addError(sink, "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE", `${path}.importAlias`, "Invalid composition importAlias");
    valid = false;
  } else if (pinByAlias.has(importAlias)) {
    addError(
      sink,
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      `${path}.importAlias`,
      `Duplicate composition importAlias ${importAlias}`,
    );
    valid = false;
  }

  if (!isNonEmptyString(pinLineage) || !VALID_LINEAGES.has(pinLineage)) {
    addError(sink, "MM_COMPOSE_TARGET_NOT_REGISTERED", `${path}.lineage`, "Invalid composition lineage");
    valid = false;
  }
  if (!isNonEmptyString(templateId) || !TEMPLATE_ID_RE.test(templateId)) {
    addError(sink, "MM_COMPOSE_TARGET_NOT_REGISTERED", `${path}.templateId`, "Invalid composition templateId");
    valid = false;
  }
  if (!isExactSemVer(templateVersion)) {
    addError(
      sink,
      "MM_COMPOSE_FLOATING_VERSION",
      `${path}.templateVersion`,
      `Composition pin version must be exact SemVer (got ${String(templateVersion)})`,
    );
    valid = false;
  }
  if (!isSha256Digest(templateDigestSha256)) {
    addError(
      sink,
      "MM_COMPOSE_INVALID_DIGEST",
      `${path}.templateDigestSha256`,
      "Composition pin templateDigestSha256 must match /^sha256:[0-9a-f]{64}$/",
    );
    valid = false;
  }

  if (!valid) return null;

  const pin: CrossLineageCompositionPin = {
    importAlias: importAlias as string,
    lineage: pinLineage as LineageId,
    templateId: templateId as string,
    templateVersion: templateVersion as string,
    templateDigestSha256: templateDigestSha256 as CrossLineageCompositionPin["templateDigestSha256"],
  };
  pinByAlias.set(pin.importAlias, pin);

  if (hasRegistry) {
    const target = registryIndex.get(registryKey(pin.lineage, pin.templateId, pin.templateVersion));
    if (!target) {
      addError(
        sink,
        "MM_COMPOSE_TARGET_NOT_REGISTERED",
        path,
        `Composed target ${pin.lineage}:${pin.templateId}@${pin.templateVersion} is not registered`,
      );
    } else {
      if (target.templateDigestSha256 !== pin.templateDigestSha256) {
        addError(
          sink,
          "MM_COMPOSE_DIGEST_MISMATCH",
          `${path}.templateDigestSha256`,
          `Composed target ${pin.lineage}:${pin.templateId}@${pin.templateVersion} digest mismatch`,
        );
      }
      targetByAlias.set(pin.importAlias, target);
    }
  }

  return pin;
}

function detectCompositionCycles(
  parsedPins: ReadonlyArray<{ readonly index: number; readonly pin: CrossLineageCompositionPin }>,
  lineage: LineageId | null,
  id: string | null,
  registryIndex: Map<string, RegisteredTemplateRecord>,
  sink: ValidationSink,
): void {
  const selfStream = lineage !== null && id !== null ? streamKey(lineage, id) : null;
  for (const { index, pin } of parsedPins) {
    const pinStream = streamKey(pin.lineage, pin.templateId);
    if (selfStream !== null && pinStream === selfStream) {
      addError(
        sink,
        "MM_COMPOSE_CYCLE_DETECTED",
        `composed_lineage_pins[${index}]`,
        `Self-referencing composition cycle detected on ${pin.lineage}:${pin.templateId}`,
      );
      continue;
    }
    const active = new Set<string>(selfStream ? [selfStream] : []);
    const visited = new Set<string>();
    const hasCycle = (current: CrossLineageCompositionPin): boolean => {
      const curStream = streamKey(current.lineage, current.templateId);
      if (active.has(curStream)) return true;
      const key = registryKey(current.lineage, current.templateId, current.templateVersion);
      if (visited.has(key)) return false;
      visited.add(key);
      const record = registryIndex.get(key);
      const nextPins = record?.composedLineagePins ?? record?.document?.composed_lineage_pins ?? [];
      if (nextPins.length === 0) return false;
      active.add(curStream);
      for (const nextPin of nextPins) {
        if (hasCycle(nextPin)) {
          active.delete(curStream);
          return true;
        }
      }
      active.delete(curStream);
      return false;
    };
    if (hasCycle(pin)) {
      addError(
        sink,
        "MM_COMPOSE_CYCLE_DETECTED",
        `composed_lineage_pins[${index}]`,
        `Cross-lineage composition cycle detected through ${pin.lineage}:${pin.templateId}@${pin.templateVersion}`,
      );
    }
  }
}

export function validateComposedLineagePins(
  doc: Record<string, JsonValue>,
  lineage: LineageId | null,
  id: string | null,
  registryIndex: Map<string, RegisteredTemplateRecord>,
  hasRegistry: boolean,
  sink: ValidationSink,
): CompositionContext {
  const pinByAlias = new Map<string, CrossLineageCompositionPin>();
  const targetByAlias = new Map<string, RegisteredTemplateRecord>();

  if (doc.composed_lineage_pins === undefined) {
    return { pinByAlias, targetByAlias };
  }
  if (!Array.isArray(doc.composed_lineage_pins)) {
    addError(
      sink,
      "MM_COMPOSE_FLOATING_VERSION",
      "composed_lineage_pins",
      "composed_lineage_pins must be an array",
    );
    return { pinByAlias, targetByAlias };
  }

  const parsedPins: Array<{ readonly index: number; readonly pin: CrossLineageCompositionPin }> = [];
  for (let i = 0; i < doc.composed_lineage_pins.length; i += 1) {
    const pin = validateSingleCompositionPin(
      doc.composed_lineage_pins[i],
      `composed_lineage_pins[${i}]`,
      pinByAlias,
      targetByAlias,
      registryIndex,
      hasRegistry,
      sink,
    );
    if (pin !== null) parsedPins.push({ index: i, pin });
  }

  detectCompositionCycles(parsedPins, lineage, id, registryIndex, sink);
  return { pinByAlias, targetByAlias };
}

export function validateExternalTypeRef(
  ref: string,
  path: string,
  composition: CompositionContext,
  sink: ValidationSink,
): void {
  const parts = ref.split(":");
  if (parts.length !== 2 || !IDENTIFIER_RE.test(parts[0]!) || !IDENTIFIER_RE.test(parts[1]!)) {
    addError(
      sink,
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      path,
      `Malformed external type reference ${ref}; expected <importAlias>:<TypeId>`,
    );
    return;
  }
  const [alias, externalTypeId] = parts as [string, string];
  if (!composition.pinByAlias.has(alias)) {
    addError(
      sink,
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      path,
      `External type reference ${ref} cites undeclared importAlias ${alias}`,
    );
    return;
  }
  const target = composition.targetByAlias.get(alias);
  if (!target) return;
  const targetNodeTypes =
    target.nodeTypeIds ?? (target.document ? Object.keys(target.document.node_types) : undefined);
  if (targetNodeTypes === undefined || !targetNodeTypes.includes(externalTypeId)) {
    addError(
      sink,
      "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
      path,
      `External type ${externalTypeId} does not exist in pinned target ${target.lineage}:${target.templateId}@${target.templateVersion}`,
    );
  }
}
