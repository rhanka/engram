import { semanticProfileDigest } from "../ontology-guardian/digests.js";
import { deepFreeze } from "../ontology-profile.js";
import type {
  MetamodelTemplateDocument,
  MetamodelValidationContext,
  MetamodelValidationResult,
  RegisteredTemplateRecord,
} from "./types.js";
import { validateAuth } from "./validate-auth.js";
import { computePresentationDigest, registryKey, type ValidationSink } from "./validate-common.js";
import { validateComposedLineagePins } from "./validate-composition.js";
import { collectProjectedStages, validateDomainPolicies } from "./validate-domain-policies.js";
import { validateNodeTypes, validateRelationTypes } from "./validate-nodes.js";
import { validatePrivacyDenylist } from "./validate-privacy.js";
import { validateFileProjectionsAndOverlay } from "./validate-projections.js";
import { validateHardening } from "./validate-state-machines.js";
import { parseAndProjectInput, validateDigests, validateIdentity } from "./validate-syntax.js";
import { validateVersionProgression } from "./validate-versioning.js";

/**
 * Pure Metamodel v1 acceptor/refuser (Spec 0 §3.1).
 *
 * Accepts raw YAML/JSON text or a plain JS object (including recursively frozen objects).
 * Never mutates, synthesizes defaults into, or repairs `rawInput`.
 */
export function validateTemplateAgainstMetamodel(
  rawInput: unknown,
  context?: MetamodelValidationContext,
): MetamodelValidationResult {
  const sink: ValidationSink = {
    diagnostics: [],
    lineage: null,
    subject: "template",
  };

  const parsed = parseAndProjectInput(rawInput, sink);
  if (!parsed) {
    return Object.freeze({
      status: "refused-metamodel-invalid" as const,
      diagnostics: Object.freeze([...sink.diagnostics]),
      warnings: Object.freeze([]),
    });
  }

  const { doc, rawSha256 } = parsed;
  const { lineage, id, version } = validateIdentity(doc, sink);

  const registryIndex = new Map<string, RegisteredTemplateRecord>();
  const hasRegistry = context?.registry !== undefined;
  for (const entry of context?.registry ?? []) {
    registryIndex.set(registryKey(entry.lineage, entry.templateId, entry.templateVersion), entry);
  }

  if (context?.auth !== undefined) {
    validateAuth(lineage, id, version, context.auth, sink);
  }

  const composition = validateComposedLineagePins(doc, lineage, id, registryIndex, hasRegistry, sink);
  const collectedStates = new Set<string>();
  const knownNodeTypes = validateNodeTypes(doc, composition, sink, collectedStates);
  validateHardening(doc.hardening, sink, collectedStates);
  validateRelationTypes(doc, knownNodeTypes, composition, sink);
  collectProjectedStages(doc, collectedStates);
  validateDomainPolicies(doc.domain_policies, collectedStates, sink);
  validateFileProjectionsAndOverlay(doc, lineage, knownNodeTypes, context, sink);
  validatePrivacyDenylist(doc, context, sink);

  const templateDigestSha256 = semanticProfileDigest(doc);
  const presentationDigest = computePresentationDigest(doc);
  validateDigests(doc, templateDigestSha256, presentationDigest, rawSha256, context, sink);
  validateVersionProgression(doc, lineage, id, version, templateDigestSha256, presentationDigest, context, sink);

  const warnings = sink.diagnostics.filter((diag) => diag.severity === "warning");
  const hasErrors = sink.diagnostics.some((diag) => diag.severity === "error");

  if (hasErrors) {
    return Object.freeze({
      status: "refused-metamodel-invalid" as const,
      diagnostics: Object.freeze([...sink.diagnostics]),
      warnings: Object.freeze(warnings),
    });
  }

  return Object.freeze({
    status: "accepted" as const,
    template: deepFreeze(structuredClone(doc)) as unknown as MetamodelTemplateDocument,
    templateDigestSha256,
    presentationDigest,
    rawSha256,
    diagnostics: Object.freeze([...sink.diagnostics]),
    warnings: Object.freeze(warnings),
  });
}
