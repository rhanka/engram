import type { CitationModality, CitedSourceRef, OntologyCitation } from "./types.js";

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

/** Section / paragraph anchor used in place of a page for non-page modalities. */
function hasAnchor(ref: CitedSourceRef): boolean {
  return Boolean(ref.section || ref.paragraph_id);
}

function isNormalizedBbox(bbox: [number, number, number, number]): boolean {
  return bbox.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];
}

/**
 * Page-addressable modalities: a `page` (or, for image, the page-as-frame) is the
 * meaningful positional anchor, and `bbox`/`region` overlays apply only here.
 */
const PAGE_ADDRESSABLE_MODALITIES: ReadonlySet<CitationModality> = new Set<CitationModality>(["pdf", "pptx", "image"]);

function isPageAddressable(modality: CitationModality | undefined): boolean {
  // Absent modality → lenient (non-page) path per the multisource contract.
  return modality != null && PAGE_ADDRESSABLE_MODALITIES.has(modality);
}

/**
 * Derive a modality from the locator suffix when the ref does not carry an
 * explicit `modality`. Unknown / extension-less locators yield `undefined`, which
 * the validator treats as the lenient (non-page) path.
 */
function deriveModality(ref: CitedSourceRef): CitationModality | undefined {
  const locator = (ref.rawRef ?? ref.sourceUrl ?? ref.docSha ?? "").toLowerCase();
  const path = locator.split(/[?#]/, 1)[0] ?? "";
  const dot = path.lastIndexOf(".");
  if (dot < 0) return undefined;
  switch (path.slice(dot + 1)) {
    case "pdf":
      return "pdf";
    case "ppt":
    case "pptx":
      return "pptx";
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
    case "tif":
    case "tiff":
    case "bmp":
      return "image";
    case "md":
    case "markdown":
      return "markdown";
    case "txt":
    case "text":
      return "plain-text";
    case "csv":
      return "csv";
    case "doc":
    case "docx":
      return "docx";
    default:
      return undefined;
  }
}

/**
 * Validate the Radar/immo minimum cited-source contract — modality-aware.
 *
 * Every ref needs a document locator (`rawRef`/`sourceUrl`/`docSha`) and evidence
 * text (`excerpt`/`citation`). The positional anchor is modality-dependent:
 * - page-addressable modalities (pdf, pptx, image): a 1-based `page` integer;
 * - non-page modalities (markdown, plain-text, csv, web, docx): a `section` or
 *   `paragraph_id` anchor — `page` is neither required nor meaningful.
 *
 * The modality is read from `ref.modality`, otherwise derived from the locator
 * suffix, otherwise treated as the lenient (non-page) path. `bbox` stays optional
 * and, when present, must use Radar's normalized page-fraction convention
 * [x0,y0,x1,y1] with top-left origin (overlays are meaningful for pdf/image/pptx).
 */
export function validateCitedSourceRef(ref: CitedSourceRef): CitedSourceRefValidation {
  const errors: string[] = [];
  const modality = ref.modality ?? deriveModality(ref);

  if (!hasLocator(ref)) errors.push("missing locator: expected rawRef, sourceUrl, or docSha");

  if (isPageAddressable(modality)) {
    if (!Number.isInteger(ref.page) || (ref.page ?? 0) < 1) errors.push("page must be a 1-based integer");
  } else if (!hasAnchor(ref)) {
    errors.push("missing anchor: expected section or paragraph_id for non-page modalities");
  }

  if (!hasEvidenceText(ref)) errors.push("missing evidence text: expected excerpt or citation");
  if (ref.bbox && !isNormalizedBbox(ref.bbox)) {
    errors.push("bbox must be normalized [x0,y0,x1,y1] page fractions with finite 0..1 values");
  }
  return { ok: errors.length === 0, errors };
}
