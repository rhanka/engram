/**
 * pdf.js engine for the cited-source viewer: lazy module + worker singleton,
 * page rendering, and text-layer highlight-rect computation.
 *
 * NO graphify import (liftable into `@sentropic/cited-source-viewer`). Seeded
 * from radar-immobilier `SignalPdfOverlay.svelte` (#82/#89 lessons kept):
 *   - pdf.js + its worker are imported ONCE and memoized (module-level), so
 *     reopening the viewer never re-imports nor re-wires the worker;
 *   - highlight rect POSITION is projected through viewport.transform (which
 *     already carries the render scale) while DIMENSIONS (item transform b/d +
 *     item.width) are in PDF space and must be multiplied by the render scale
 *     (radar bug #82 — mixing the two spaces skews highlights when zooming).
 *
 * Worker note: the worker is bundled by Vite via the `?url` asset import, so it
 * works when the studio bundle is SERVED (http/https, dev or static export).
 * Over `file://` (single-file studio.html) module workers cannot load — the
 * caller should treat PDF rendering as unavailable there (the viewer surfaces
 * the load error; sources are not inlined in single-file bundles anyway).
 */

import { buildPageText, findCitationInPage } from "./quoteMatch.js";

/** @type {Promise<typeof import("pdfjs-dist")>|null} */
let pdfjsPromise = null;

/** Memoized pdf.js module with the bundled worker wired once. */
export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Worker served by Vite as a bundled asset URL (no CDN).
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
    // Do not memoize a failed import (lets a transient failure retry).
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

/**
 * Load a PDF document from raw bytes.
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {Promise<import("pdfjs-dist").PDFDocumentProxy>}
 */
export async function loadPdfDocument(data) {
  const pdfjs = await getPdfjs();
  // pdf.js transfers the buffer to the worker; clone so callers can reuse it
  // (e.g. re-render after an error or page a cached payload).
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  return task.promise;
}

/**
 * Render one page into a canvas at fit-width scale and return the geometry
 * needed by the highlight pass.
 * @param {import("pdfjs-dist").PDFPageProxy} pdfPage
 * @param {HTMLCanvasElement} canvas
 * @param {{ containerWidth?: number, minScale?: number, maxScale?: number }} [options]
 * @returns {Promise<{ viewport: object, scale: number }>}
 */
export async function renderPdfPage(pdfPage, canvas, options = {}) {
  const minScale = options.minScale ?? 0.4;
  const maxScale = options.maxScale ?? 4;
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const available = Math.max(120, options.containerWidth ?? baseViewport.width);
  const scale = Math.max(minScale, Math.min(maxScale, available / baseViewport.width));
  const viewport = pdfPage.getViewport({ scale });

  const ctx = canvas.getContext("2d");
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  return { viewport, scale };
}

/**
 * Compute the highlight rectangles for a quote on a page's text content.
 * Pure geometry (testable with plain objects): locate the quote in the
 * concatenated page text, then emit one CSS-pixel rect per overlapping item.
 *
 * @param {{ items: Array<object> }} content  pdf.js `getTextContent()` result.
 * @param {{ transform: number[], width: number, height: number }} viewport
 * @param {number} renderScale  The scale the page was rendered at.
 * @param {string} quote  Verbatim quote (excerpt) to locate.
 * @param {{ minWords?: number, minCoverage?: number }} [matchOptions]
 * @returns {{ rects: { left: number, top: number, width: number, height: number }[], coverage: number }}
 */
export function computeHighlightRects(content, viewport, renderScale, quote, matchOptions = {}) {
  const { pageText, offsets } = buildPageText(content?.items ?? []);
  const match = findCitationInPage(pageText, quote ?? "", matchOptions);
  if (!match) return { rects: [], coverage: 0 };

  const vt = viewport.transform;
  const rects = [];
  for (const { start, end, item } of offsets) {
    if (end <= match.start || start >= match.end) continue;
    const [, b, , d, e, f] = item.transform;
    // POSITION: projected into viewport space via viewport.transform (already
    // carries renderScale). DIMENSIONS: item.transform (b, d) and item.width
    // are PDF-space (scale 1) and MUST be multiplied by renderScale (radar #82).
    const tx = vt[0] * e + vt[2] * f + vt[4];
    const ty = vt[1] * e + vt[3] * f + vt[5];
    const fontHeight = (Math.hypot(b, d) || item.height || 10) * renderScale;
    const width = Math.max(item.width * renderScale, 4);
    rects.push({
      left: tx,
      top: ty - fontHeight,
      width,
      height: fontHeight * 1.15,
    });
  }
  return { rects, coverage: match.coverage };
}
