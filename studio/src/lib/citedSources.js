/**
 * Studio-side (IMPURE) glue for the cited-source viewer.
 *
 * Everything graphify-specific lives HERE, outside the pure
 * CitedSourceViewer component (rebase contract, SPEC_WP_CITED_SOURCE_VIZ
 * §S.3 "per-consumer adapter"):
 *   - node.citations (OntologyCitation[]) -> CitedSourceRef[] via the FROZEN
 *     public converters (src/cited-source-refs.ts, exported since PR #260);
 *   - the studio's ResolveSource: fetch the cited file's bytes from the
 *     `sources/` directory the exporter emits with `--include-sources`.
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
