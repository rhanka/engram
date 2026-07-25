/**
 * Studio-side (IMPURE) glue for the cited-source viewer — the per-consumer
 * ADAPTER the published @sentropic/cited-source-viewer deliberately does NOT
 * ship (its API takes pure props + resolver/href callbacks, SPEC_WP_
 * CITED_SOURCE_VIZ §S.3). None of this is provided by the lib: it is all
 * graphify-specific and stays local by design.
 *
 * Everything graphify-specific lives HERE, outside the pure library
 * CitedSourceViewer component (frozen seam, §S.3 "per-consumer adapter"):
 *   - node.citations (OntologyCitation[]) -> CitedSourceRef[] via the FROZEN
 *     public converters (src/cited-source-refs.ts, exported since PR #260);
 *   - the selection-thread builder (selection -> document -> page ordering);
 *   - the studio's ResolveSource + Ouvrir href: fetch/link the cited file from
 *     the `sources/` directory the exporter emits with `--include-sources`.
 */

import { citationsToCitedSourceRefs } from "@graphify/cited-source-refs";

/**
 * Convert a node's citations to viewer refs.
 *
 * Adapter enrichment (consumer-owned, does NOT touch the frozen converter):
 *   - locator: graphify citations usually carry only `source_file` (not the
 *     Radar `rawRef`/`sourceUrl`), which the projection intentionally leaves to
 *     the consumer. Fill `rawRef` from `source_file` (else the panel-level
 *     fallback) so every ref resolves against the bundle's `sources/` dir.
 *   - anchors: carry `modality` / `section` / `paragraph_id` over for display +
 *     routing when present on the citation.
 *
 * @param {Array<object>|null|undefined} citations  OntologyCitation[]
 * @param {string|null} [fallbackSourceFile]        node.source_file fallback
 * @returns {Array<object>} CitedSourceRef[] (parallel to `citations`)
 */
export function refsForCitations(citations, fallbackSourceFile = null) {
  const list = Array.isArray(citations) ? citations : [];
  const refs = citationsToCitedSourceRefs(list);
  return refs.map((ref, i) => {
    const c = list[i] ?? {};
    const out = { ...ref };
    if (!out.rawRef && !out.sourceUrl && !out.docSha) {
      const locator = typeof c.source_file === "string" && c.source_file ? c.source_file : fallbackSourceFile;
      if (locator) out.rawRef = locator;
    }
    if (!out.modality && typeof c.modality === "string") out.modality = c.modality;
    if (!out.section && typeof c.section === "string") out.section = c.section;
    if (!out.paragraph_id && typeof c.paragraph_id === "string") out.paragraph_id = c.paragraph_id;
    return out;
  });
}

/**
 * Increment 2 (selection-scope navigation, §S.6.1): build the GROUPED citation
 * thread for the CURRENT multi-selection.
 *
 * One group per selected entity WITH at least one citation, in SELECTION ORDER
 * (the caller passes entities in `viewerState.selection.entities` order).
 * Within a group the refs are ordered DOCUMENT-first (documents in first-
 * appearance order of the entity's citation list), then PAGE ascending
 * (page-less refs keep their relative order after paged ones of the same doc
 * are sorted; the sort is stable). This is the approved thread order:
 * selection → document → page.
 *
 * Returns BOTH the pure viewer input (`groups`, shape
 * `{ id, label, refs: CitedSourceRef[] }` — the CitedSourceViewer prop) and a
 * PARALLEL `meta` array (`{ id, citations }`, citations[i] is the RAW
 * OntologyCitation behind groups[g].refs[i]) so the impure consumer can map an
 * `onFocusChange(groupId, refIndex)` back to the exact citation object for the
 * right-panel sync. The component itself never sees `meta` (purity seam).
 *
 * @param {Array<{id: string, label?: string|null, citations?: Array<object>|null, fallbackSourceFile?: string|null}>} entities
 * @returns {{ groups: Array<{id: string, label: string|null, refs: Array<object>}>, meta: Array<{id: string, citations: Array<object>}> }}
 */
export function buildSelectionThread(entities) {
  const groups = [];
  const meta = [];
  for (const entity of Array.isArray(entities) ? entities : []) {
    if (!entity || entity.id == null) continue;
    const citations = Array.isArray(entity.citations) ? entity.citations : [];
    if (citations.length === 0) continue;
    const refs = refsForCitations(citations, entity.fallbackSourceFile ?? null);
    // Pair each ref with its raw citation, then order document → page.
    const docOrder = new Map();
    for (const ref of refs) {
      const doc = threadDocKey(ref);
      if (!docOrder.has(doc)) docOrder.set(doc, docOrder.size);
    }
    const pairs = refs.map((ref, i) => ({ ref, citation: citations[i] }));
    pairs.sort((a, b) => {
      const docDelta = docOrder.get(threadDocKey(a.ref)) - docOrder.get(threadDocKey(b.ref));
      if (docDelta !== 0) return docDelta;
      return threadPageRank(a.ref) - threadPageRank(b.ref);
    });
    groups.push({
      id: entity.id,
      label: entity.label ?? null,
      refs: pairs.map((p) => p.ref),
    });
    meta.push({ id: entity.id, citations: pairs.map((p) => p.citation) });
  }
  return { groups, meta };
}

/** Document identity for the thread order (mirrors the viewer's locatorOf). */
function threadDocKey(ref) {
  return ref?.rawRef ?? ref?.sourceUrl ?? ref?.docSha ?? "";
}

/** Page sort rank: numeric pages ascending, page-less refs last (stable). */
function threadPageRank(ref) {
  const page = Number(ref?.page);
  return Number.isFinite(page) ? page : Number.POSITIVE_INFINITY;
}

/**
 * Loose citation identity for the panel↔viewer sync fallback (used when the
 * object reference does not match because a list was re-fetched): same source
 * file, page, section and quote text.
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 */
export function sameCitation(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const norm = (v) => (v == null ? null : String(v));
  return (
    norm(a.source_file) === norm(b.source_file) &&
    norm(a.page) === norm(b.page) &&
    norm(a.section) === norm(b.section) &&
    norm(a.quote ?? a.excerpt) === norm(b.quote ?? b.excerpt)
  );
}

/** File-suffix modality sniff for the resolver's binary/text routing. */
function looksLikePdf(locator) {
  return /\.pdf(?:[?#]|$)/i.test(locator);
}

/* ---------------------------------------------------------------------------
 * PROVENANCE CHAIN: original document → converted markdown → citation.
 *
 * A PDF corpus is OCR'd to markdown before extraction, so a citation's
 * `source_file` is the CONVERTED artifact — e.g.
 * `.graphify/converted/pdf/AM10014.02.01.09_R19.page-images_7668479ef707.md`.
 * That is a true provenance step, but it is NOT the document the reader wants
 * to see: showing it presents a machine intermediate as if it were the source,
 * with none of the original's pagination, figures or layout.
 *
 * The exporter records the chain in `sources/provenance.json`
 * (`graphify_cited_source_provenance_v1`), mapping each cited locator to its
 * original. When the original is bundled we open THAT, at the citation's page;
 * the markdown stays as the intermediate breadcrumb rather than the presented
 * artifact. When it is not bundled (a PDF corpus can run to tens of GB — the
 * PROCESS_STD one is 28 GB across 2230 files) we fall back to the markdown, and the
 * caller can still surface the original's path as provenance.
 * ------------------------------------------------------------------------ */

const PROVENANCE_URL = "./sources/provenance.json";
let provenancePromise = null;

/** Reset the memoized provenance sidecar (tests / bundle reload). */
export function resetProvenanceCache() {
  provenancePromise = null;
}

/**
 * Load + memoize the bundle's provenance sidecar. A bundle exported without it
 * is the normal case, not an error: resolve to an empty map and let every
 * locator resolve directly.
 * @returns {Promise<Record<string, {original: string, conversion?: string, via?: string, bundled?: boolean}>>}
 */
export function loadCitedSourceProvenance() {
  if (!provenancePromise) {
    provenancePromise = (async () => {
      try {
        const res = await fetch(PROVENANCE_URL);
        if (!res.ok) return {};
        // A static server that SPA-falls-back would hand us index.html here;
        // parsing it as JSON throws, and the catch below yields the empty map.
        const json = await res.json();
        const docs = json?.documents;
        return docs && typeof docs === "object" ? docs : {};
      } catch {
        return {};
      }
    })();
  }
  return provenancePromise;
}

/** The locator a ref cites, before any provenance hop. */
function citedLocator(ref) {
  return ref?.rawRef ?? ref?.sourceUrl ?? null;
}

/**
 * Resolve a ref to the document that should actually be PRESENTED, plus the
 * chain that led there.
 *
 * @param {object} ref  CitedSourceRef
 * @param {Record<string, object>} provenance  the sidecar's `documents` map
 * @returns {{locator: string, original: string|null, via: string|null}|null}
 *   `locator` is what to fetch; `via` is the converted intermediate when the
 *   original superseded it (null when the citation already pointed at the
 *   original); `original` is the original's path whether or not it is bundled.
 */
export function resolveSourceChain(ref, provenance) {
  const cited = citedLocator(ref);
  if (!cited) return null;
  const entry = provenance?.[cited] ?? provenance?.[String(cited).replace(/^\.\//, "")] ?? null;
  const original = typeof entry?.original === "string" && entry.original ? entry.original : null;
  // Only HOP when the original is actually in the bundle; otherwise the
  // markdown intermediate is the best artifact we can show, and the original
  // stays a breadcrumb.
  if (original && entry?.bundled === true) {
    return { locator: original, original, via: cited };
  }
  return { locator: cited, original, via: null };
}

/**
 * Normalize a citation locator (usually a project-relative `source_file` such
 * as `corpus/report.pdf` or `.graphify/converted/pdf/report.md`) into the
 * bundle-relative path under `sources/`. Mirrors the exporter's layout
 * (src/studio-export.ts, `--include-sources`): the file keeps its
 * project-relative path, minus any leading `./`.
 * @param {string} locator
 */
export function bundleSourcePath(locator) {
  const rel = String(locator).replace(/^\.\//, "");
  return `./sources/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Href for the viewer's "Ouvrir ↗" raw-source link (qualified toolbar).
 * Consumer-owned URL scheme (§S.3): the bundle-relative `sources/` copy.
 * Returns null when the ref carries no resolvable locator (the toolbar then
 * hides the button).
 * @param {object} ref  CitedSourceRef
 * @returns {string|null}
 */
export function sourceHrefFor(ref, provenance = null) {
  // With the provenance sidecar loaded, "Ouvrir ↗" points at the ORIGINAL
  // document when it is bundled — the reader wants the PDF, not the OCR dump.
  const chain = provenance ? resolveSourceChain(ref, provenance) : null;
  const locator = chain?.locator ?? citedLocator(ref);
  return locator ? bundleSourcePath(locator) : null;
}

/**
 * The studio's ResolveSource (frozen seam §S.3): fetch the cited file relative
 * to the export bundle.
 *
 * Works when the bundle is SERVED (any static file server over the exporter's
 * multi-file output, e.g. `graphify studio export out --include-sources` +
 * `npx serve out`). Over bare `file://` (double-clicked studio.html or
 * index.html) sibling fetches are blocked by the browser (opaque origin), so
 * the viewer shows its explicit "Source unavailable" state — same constraint
 * as every other static artifact, documented in SPEC_STUDIO_OFFLINE_EXPORT.
 *
 * @param {object} ref  CitedSourceRef
 * @returns {Promise<{kind:"pdf",data:ArrayBuffer}|{kind:"markdown",text:string}>}
 */
export async function resolveBundleSource(ref) {
  if (!citedLocator(ref)) {
    throw new Error("citation carries no source locator (rawRef/sourceUrl)");
  }
  const chain = resolveSourceChain(ref, await loadCitedSourceProvenance());
  const locator = chain.locator;
  const url = bundleSourcePath(locator);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} — ${url}. ` +
        "Re-export with `graphify studio export <out> --include-sources` to bundle cited files.",
    );
  }
  // A missing file must FAIL, never render as a document. Most static servers
  // (and graphify's own studio route) SPA-fall-back an unknown deep path to
  // index.html with HTTP 200, so `res.ok` alone is not evidence that we got the
  // cited file — it is exactly how the viewer ended up displaying the studio's
  // own shell as the "cited source". An HTML content-type for a locator that is
  // not itself an HTML file is proof of that fallback, not a document.
  const contentType = res.headers?.get?.("content-type") ?? "";
  if (/\btext\/html\b/i.test(contentType) && !/\.x?html?(?:[?#]|$)/i.test(locator)) {
    throw new Error(
      `${url} returned HTML, not the cited source — the server fell back to the ` +
        "SPA shell, which means the file is not in the bundle. Re-export with " +
        "`graphify studio export <out> --include-sources`.",
    );
  }
  // Modality follows the RESOLVED file. After a provenance hop the citation's
  // own modality describes the markdown intermediate ("ocr-markdown"), not the
  // original we just fetched — trusting it would hand PDF bytes to the markdown
  // renderer. The locator's own suffix is authoritative once we have hopped.
  const isPdf = chain.via
    ? looksLikePdf(locator)
    : ref?.modality === "pdf" || (!ref?.modality && looksLikePdf(locator));
  if (isPdf) {
    return { kind: "pdf", data: await res.arrayBuffer() };
  }
  return { kind: "markdown", text: await res.text() };
}
