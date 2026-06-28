import type { CitedSourceRef, OntologyCitation } from "./types.js";

export interface CitedSourceRefValidation {
  ok: boolean;
  errors: string[];
}

function asNumberPage(page: number | string | undefined): number | undefined {
  if (typeof page === "number" && Number.isFinite(page)) return page;
  if (typeof page !== "string") return undefined;
  const parsed = Number.parseInt(page, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Project Graphify's OntologyCitation contract to the cited-source reference
 * shape consumed by Radar/immo and shared source viewers.
 *
 * Pure/additive: it does not mutate citations and it preserves page+excerpt
 * fallback even when precise bbox coordinates are unavailable.
 */
export function citationToCitedSourceRef(citation: OntologyCitation): CitedSourceRef {
  const sourceUrl = citation.sourceUrl ?? citation.source_url;
  const excerpt = citation.excerpt ?? citation.quote;
  return {
    ...(citation.docSha ? { docSha: citation.docSha } : {}),
    ...(citation.rawRef ? { rawRef: citation.rawRef } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(asNumberPage(citation.page) != null ? { page: asNumberPage(citation.page)! } : {}),
    ...(citation.region ? { bbox: citation.region } : citation.bbox ? { bbox: citation.bbox } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(citation.quote ? { citation: citation.quote } : {}),
    ...(citation.quoteSpan ? { quoteSpan: citation.quoteSpan } : {}),
  };
}

export function citationsToCitedSourceRefs(citations: readonly OntologyCitation[] | undefined): CitedSourceRef[] {
  if (!Array.isArray(citations)) return [];
  return citations.map(citationToCitedSourceRef);
}

function hasLocator(ref: CitedSourceRef): boolean {
  return Boolean(ref.rawRef || ref.sourceUrl || ref.docSha);
}

function hasEvidenceText(ref: CitedSourceRef): boolean {
  return Boolean(ref.excerpt || ref.citation);
}

function isNormalizedBbox(bbox: [number, number, number, number]): boolean {
  return bbox.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];
}

/**
 * Validate the Radar/immo minimum cited-source contract.
 *
 * Complete proof requires a document locator, a 1-based page integer, and an
 * excerpt/citation. Bbox is optional; when present it must use Radar's normalized
 * page-fraction convention [x0,y0,x1,y1] with top-left origin.
 */
export function validateCitedSourceRef(ref: CitedSourceRef): CitedSourceRefValidation {
  const errors: string[] = [];
  if (!hasLocator(ref)) errors.push("missing locator: expected rawRef, sourceUrl, or docSha");
  if (!Number.isInteger(ref.page) || (ref.page ?? 0) < 1) errors.push("page must be a 1-based integer");
  if (!hasEvidenceText(ref)) errors.push("missing evidence text: expected excerpt or citation");
  if (ref.bbox && !isNormalizedBbox(ref.bbox)) {
    errors.push("bbox must be normalized [x0,y0,x1,y1] page fractions with finite 0..1 values");
  }
  return { ok: errors.length === 0, errors };
}
