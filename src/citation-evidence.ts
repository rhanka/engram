/**
 * `graphify_citation_evidence_v1` — the grounding audit trail.
 *
 * When `groundNodeCitations` emits a citation it has already established four
 * things: which term hit, which matcher fired, that the verbatim gate passed,
 * and where in the source the quote sits. All of it is thrown away the instant
 * the `OntologyCitation` is built, so a reader of `citations.json` can see WHAT
 * was cited but never WHY it was believed.
 *
 * This module names that reasoning and gives it a shape. It is deliberately
 * DESCRIPTIVE: every field mirrors state the engine already computes. It
 * introduces no new policy, no new confidence notion, and no judgement the
 * engine does not already make.
 *
 * SCOPE — local. Publishing this as a shared cross-repo contract is a separate,
 * parked decision. Nothing here writes a file or joins the pipeline yet; the
 * schema and its guard land first so the shape is pinned before anything
 * depends on it.
 */
import { citationKey } from "./citations.js";
import type { CitationConfidence, OntologyCitation } from "./types.js";

/** Schema tag for the evidence store. */
export const CITATION_EVIDENCE_SCHEMA = "graphify_citation_evidence_v1";

/** Relative path (under the graph dir) of the evidence store. */
export const CITATION_EVIDENCE_RELPATH = "ontology/citation-evidence.json";

/**
 * The matchers `selectNodeTerms` + `groundNodeCitations` can actually fire.
 * This vocabulary is closed on purpose: an evidence record whose matcher is not
 * one of these describes a grounding path that does not exist.
 */
export const CITATION_MATCHERS = [
  "label",
  "alias",
  "surname",
  "reference-marker",
  "acronym",
  "content-word",
  "image-context",
] as const;

export type CitationMatcher = (typeof CITATION_MATCHERS)[number];

/**
 * The runtime field surface. TypeScript interfaces are erased at build time, so
 * the drift guard needs the surface as data — these two arrays ARE the
 * contract, and the guard asserts the builder's real output against them.
 */
export const CITATION_EVIDENCE_REQUIRED_FIELDS = [
  "citation_key",
  "matched_term",
  "matcher",
  "verbatim",
  "confidence",
  "locator",
] as const;

export const CITATION_EVIDENCE_OPTIONAL_FIELDS = ["quote_span"] as const;

export interface CitationEvidenceLocator {
  page?: number | string;
  section?: string;
  paragraph_id?: string;
}

export interface CitationEvidence {
  /** Identity of the citation this evidences, via the repo's own `citationKey`. */
  citation_key: string;
  /** The normalized term that actually hit the source. */
  matched_term: string;
  /** Which grounding path fired. */
  matcher: CitationMatcher;
  /** The verbatim gate verdict. Always true for an emitted citation. */
  verbatim: boolean;
  confidence: CitationConfidence;
  locator: CitationEvidenceLocator;
  /** Source-text span of the quote, when the engine resolved one. */
  quote_span?: [number, number];
}

export interface CitationEvidenceStore {
  schema: typeof CITATION_EVIDENCE_SCHEMA;
  graph_signature: string;
  /** Keyed by node id, mirroring `citations.json`. */
  evidence: Record<string, CitationEvidence[]>;
}

export interface BuildCitationEvidenceInput {
  matchedTerm: string;
  matcher: CitationMatcher;
  verbatim: boolean;
  confidence: CitationConfidence;
  quoteSpan?: [number, number];
}

/** Derive the evidence record for one grounded citation. */
export function buildCitationEvidence(
  citation: OntologyCitation,
  input: BuildCitationEvidenceInput,
): CitationEvidence {
  const locator: CitationEvidenceLocator = {};
  if (citation.page != null) locator.page = citation.page;
  if (citation.section != null) locator.section = citation.section;
  if (citation.paragraph_id != null) locator.paragraph_id = citation.paragraph_id;

  const evidence: CitationEvidence = {
    citation_key: citationKey(citation),
    matched_term: input.matchedTerm,
    matcher: input.matcher,
    verbatim: input.verbatim,
    confidence: input.confidence,
    locator,
  };
  if (input.quoteSpan) evidence.quote_span = input.quoteSpan;
  return evidence;
}

export interface CitationEvidenceValidation {
  ok: boolean;
  problems: string[];
}

const CONFIDENCES: ReadonlySet<string> = new Set<CitationConfidence>(["EXTRACTED", "INFERRED"]);
const KNOWN_FIELDS: ReadonlySet<string> = new Set<string>([
  ...CITATION_EVIDENCE_REQUIRED_FIELDS,
  ...CITATION_EVIDENCE_OPTIONAL_FIELDS,
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRecord(record: unknown, where: string, problems: string[]): void {
  if (!isPlainObject(record)) {
    problems.push(`${where}: expected an object`);
    return;
  }

  for (const field of CITATION_EVIDENCE_REQUIRED_FIELDS) {
    if (!(field in record)) problems.push(`${where}: missing required field \`${field}\``);
  }
  // Additive drift is the failure mode this store exists to catch: a field that
  // nobody declared travels silently to every consumer.
  for (const field of Object.keys(record)) {
    if (!KNOWN_FIELDS.has(field)) problems.push(`${where}: unknown field \`${field}\``);
  }

  if ("matcher" in record && !CITATION_MATCHERS.includes(record.matcher as CitationMatcher)) {
    problems.push(`${where}: matcher \`${String(record.matcher)}\` is outside the declared vocabulary`);
  }
  if ("confidence" in record && !CONFIDENCES.has(String(record.confidence))) {
    problems.push(`${where}: confidence \`${String(record.confidence)}\` is outside CitationConfidence`);
  }
  if ("verbatim" in record && record.verbatim !== true) {
    problems.push(`${where}: verbatim must be true — an unverified quote is not evidence`);
  }
  if ("citation_key" in record && typeof record.citation_key !== "string") {
    problems.push(`${where}: citation_key must be a string`);
  }
  if ("matched_term" in record && typeof record.matched_term !== "string") {
    problems.push(`${where}: matched_term must be a string`);
  }
  if ("locator" in record && !isPlainObject(record.locator)) {
    problems.push(`${where}: locator must be an object`);
  }
}

/** Validate an evidence store, reporting every problem rather than the first. */
export function validateCitationEvidenceStore(value: unknown): CitationEvidenceValidation {
  const problems: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, problems: ["store: expected an object"] };
  }
  if (value.schema !== CITATION_EVIDENCE_SCHEMA) {
    problems.push(`store: schema must be \`${CITATION_EVIDENCE_SCHEMA}\`, got \`${String(value.schema)}\``);
  }
  if (typeof value.graph_signature !== "string") {
    problems.push("store: graph_signature must be a string");
  }
  if (!isPlainObject(value.evidence)) {
    problems.push("store: evidence must be an object keyed by node id");
    return { ok: false, problems };
  }

  for (const [nodeId, records] of Object.entries(value.evidence)) {
    if (!Array.isArray(records)) {
      problems.push(`evidence[${nodeId}]: expected an array`);
      continue;
    }
    records.forEach((record, index) => validateRecord(record, `evidence[${nodeId}][${index}]`, problems));
  }

  return { ok: problems.length === 0, problems };
}
