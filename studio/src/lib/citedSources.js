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
export function sourceHrefFor(ref) {
  const locator = ref?.rawRef ?? ref?.sourceUrl ?? null;
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
  const locator = ref?.rawRef ?? ref?.sourceUrl ?? null;
  if (!locator) {
    throw new Error("citation carries no source locator (rawRef/sourceUrl)");
  }
  const url = bundleSourcePath(locator);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} — ${url}. ` +
        "Re-export with `graphify studio export <out> --include-sources` to bundle cited files.",
    );
  }
  if ((ref?.modality === "pdf") || (!ref?.modality && looksLikePdf(locator))) {
    return { kind: "pdf", data: await res.arrayBuffer() };
  }
  return { kind: "markdown", text: await res.text() };
}
