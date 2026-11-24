// Lot 1: annotation-trust-feedback@0.2.2 base declaration (§§1,6,7 row 1).
import { assertExactKeys } from "../../engram-memory/dist/validation.js";
import type { OntologyTemplateEnvelopeRef } from "../metamodel-contracts.js";
import { deepFreeze, hashOntologyProfile, normalizeOntologyProfile } from "../ontology-profile.js";
import { pinProblem, pinsEqual } from "../ontology-guardian/admission.js";
import { semanticProfileDigest } from "../ontology-guardian/digests.js";
import type { Pin } from "../ontology-guardian/types.js";
import type { OntologyProfile } from "../types.js";
export const PROFILE_ID = "annotation-trust-feedback";
export const PROFILE_VERSION = "0.2.2";
export const PREFIXES = deepFreeze({ oa: "http://www.w3.org/ns/oa#", prov: "http://www.w3.org/ns/prov#", dcterms: "http://purl.org/dc/terms/", as: "http://www.w3.org/ns/activitystreams#", rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#" });
export const standardTerms: Record<string, readonly string[]> = deepFreeze({ Annotation: ["oa:Annotation", "prov:Entity"], motivation: ["oa:assessing", "oa:classifying", "oa:commenting", "oa:motivatedBy", "oa:questioning"], value: ["oa:TextualBody", "oa:hasBody", "rdf:value"], SubjectVersion: ["oa:SpecificResource", "prov:Entity"], targets: ["oa:hasTarget"], version_of: ["oa:hasSource"], Subject: ["prov:Entity"], SourceRow: ["prov:Entity"], Actor: ["prov:Agent", "prov:Person", "prov:SoftwareAgent"], authored_by: ["dcterms:creator", "prov:wasAttributedTo"], recorded_by: ["as:generator"], recordedAt: ["dcterms:created", "prov:generatedAtTime"], Activity: ["prov:Activity", "prov:wasGeneratedBy"], associated_with: ["prov:Association", "prov:agent", "prov:hadRole", "prov:qualifiedAssociation", "prov:wasAssociatedWith"], PromptTemplate: ["prov:Association", "prov:Plan", "prov:hadPlan"], displayed: ["prov:Usage", "prov:entity", "prov:hadRole", "prov:qualifiedUsage", "prov:used"], derived_from: ["prov:wasDerivedFrom"], invalidated_by: ["prov:wasInvalidatedBy"], slot: [], scopeRef: [], revision: [], contentDigest: [], promptDigest: [], channel: [], exposure: [], validation: [], trust: [], evaluationRole: [], Selection: [], EvaluationPair: [], selects: [], pairs: [] });
const open = ["unreviewed", "uncertain", "awaiting-elicitation"] as const;
const decidable = [...open, "human-asserted", "confirmed"] as const;
export const validation = {
  states: [...decidable, "corrected", "rejected"], initial_state: "unreviewed",
  terminal_states: ["corrected", "rejected"],
  transitions: [
    { from: ["unreviewed"], to: ["human-asserted"], requires: ["new-human-value"], authority: "own-act-human" },
    { from: open, to: ["awaiting-elicitation"], requires: ["needs-elicitation"] },
    { from: open, to: ["uncertain"], requires: ["uncertain-or-ambiguous-assert"] },
    { from: [...open, "human-asserted"], to: ["confirmed"], requires: ["confirm"], authority: "own-act-human" },
    { from: decidable, to: ["corrected"], requires: ["correct"], authority: "own-act-human" },
    { from: decidable, to: ["rejected"], requires: ["reject"], authority: "own-act-human" }
  ]
} as const;
const RELATIONS: Record<string, { source_types: string[]; target_types: string[] }> = { targets: { source_types: ["Annotation"], target_types: ["SubjectVersion", "Annotation"] }, version_of: { source_types: ["SubjectVersion"], target_types: ["Subject"] }, authored_by: { source_types: ["Annotation"], target_types: ["Actor"] }, recorded_by: { source_types: ["Annotation"], target_types: ["Actor"] }, displayed: { source_types: ["Annotation"], target_types: ["Annotation"] }, derived_from: { source_types: ["Annotation"], target_types: ["Annotation", "SourceRow"] }, selects: { source_types: ["Selection"], target_types: ["Annotation"] }, pairs: { source_types: ["EvaluationPair"], target_types: ["Annotation"] } };
export const template = {
  metamodel_version: "engram.metamodel/v1" as const, lineage: "engram" as const, id: PROFILE_ID, version: PROFILE_VERSION,
  node_types: { Subject: {}, SubjectVersion: {}, Actor: {}, SourceRow: {}, Annotation: { state_machines: { validation } }, Selection: {}, EvaluationPair: {} },
  relation_types: RELATIONS, standard_terms: standardTerms
};
export function baseProfile(): OntologyProfile {
  return {
    id: template.id, version: template.version, relation_types: template.relation_types,
    node_types: Object.fromEntries(Object.keys(template.node_types).map((name) => [name, {}])),
    hardening: {
      statuses: [...validation.states], default_status: validation.initial_state,
      status_transitions: validation.transitions.map(({ from, to, requires }) => ({ from: [...from], to: [...to], requires: [...requires] }))
    },
    citation_policy: { minimum_granularity: "file", require_source_file: false }
  };
}
/** Draft profile pin derived from the declared content with the G0 helpers, as app-context-registry.ts does; not the published pin (§7). */
export const PROFILE_PIN: Pin = deepFreeze({ id: PROFILE_ID, version: PROFILE_VERSION, contentDigest: hashOntologyProfile(normalizeOntologyProfile(baseProfile())) });
/** UNVERIFIED placeholder, not a published pin: replaced at the publication step after lots 1-5 (§7). Provisional id: the §3/§4 rule sheet is built in later lots. */
export const UNVERIFIED_RULE_SHEET_PIN: Pin = deepFreeze({ id: "annotation-trust-feedback-rules", version: PROFILE_VERSION, contentDigest: "b".repeat(64) });
/** Draft neutral template pin (lineage, templateId, templateVersion, templateDigestSha256); digest is the semantic profile digest, so presentation-only changes leave it unchanged. */
export const TEMPLATE_REF: import("./types.js").TemplateRef = deepFreeze({
  lineage: "engram", templateId: PROFILE_ID, templateVersion: PROFILE_VERSION,
  templateDigestSha256: semanticProfileDigest(template)
});
export const TEMPLATE_REF_KEYS = ["lineage", "templateId", "templateVersion", "templateDigestSha256"] as const;
export function verifyPins(templateRef: OntologyTemplateEnvelopeRef, ruleSheetPin: Pin): void {
  assertExactKeys(templateRef, "templateRef", TEMPLATE_REF_KEYS, TEMPLATE_REF_KEYS);
  if (TEMPLATE_REF_KEYS.some((k) => templateRef[k] !== TEMPLATE_REF[k])) throw new Error("template pin mismatch");
  const problem = pinProblem(ruleSheetPin, "rule-sheet");
  if (problem !== null) throw new Error(problem);
  if (!pinsEqual([ruleSheetPin], [UNVERIFIED_RULE_SHEET_PIN])) throw new Error("rule-sheet pin mismatch");
}
export function validateStandardTerms(candidate: Record<string, readonly string[]>): string[] {
  const errors: string[] = [];
  for (const [term, iris] of Object.entries(standardTerms)) {
    const got = candidate[term];
    if (got === undefined) { errors.push(`missing standard_term ${term}`); continue; }
    if ([...got].sort().join(",") !== [...iris].sort().join(",")) errors.push(`standard_term ${term} differs from §1`);
    for (const iri of got) { const prefix = iri.split(":")[0] ?? ""; if (!Object.hasOwn(PREFIXES, prefix)) errors.push(`standard_term ${term} uses undeclared prefix ${prefix}`); }
  }
  for (const term of Object.keys(candidate)) if (!Object.hasOwn(standardTerms, term)) errors.push(`unknown standard_term ${term}`);
  return errors;
}
