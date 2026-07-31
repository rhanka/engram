/**
 * The LIVE `sources/` route — the served twin of the static export's `sources/`
 * directory.
 *
 * `buildStaticStudio` emits a bundle in which the cited documents sit at
 * `sources/<project-relative path>` next to a `sources/provenance.json` chain,
 * and the SPA's cited-source adapter (studio/src/lib/citedSources.js) fetches
 * exactly those two things. `graphify ontology studio` served the same SPA from
 * the same mount but had no such route, so every one of those fetches 404'd:
 * the provenance chain worked in an exported bundle and nowhere else, which is
 * the reverse of what a reader expects — the LIVE studio is the one running next
 * to the actual corpus.
 *
 * Serving is strictly cheaper here than bundling. The static exporter must COPY
 * an original before it can honestly claim it (`--include-original-sources`,
 * opt-in because a PDF corpus runs to tens of gigabytes); the live server is
 * already sitting on that corpus, so an original that exists under a root is
 * openable with no copy at all. `bundled: true` therefore means "this route can
 * serve it" — the same promise the flag makes in an export, kept a cheaper way.
 * The practical consequence is that the live studio hops to the ORIGINAL PDF by
 * default, where a default export still shows the OCR markdown.
 *
 * Nothing here can escape its roots: every path is normalized and re-checked to
 * live under a root after resolution, and a locator that does not is refused
 * rather than resolved.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

import {
  buildCitedSourceProvenance,
  PROVENANCE_SIDECAR_RELPATH,
} from "./converted-provenance.js";
import { collectCitedSourceFiles, normalizeSourceRelPath } from "./studio-export.js";
import type { StudioAssetResult } from "./studio-assets.js";

/**
 * Bundle/route prefix the cited-source adapter fetches under. The SPA resolves
 * `./sources/...` against its own document, so under the `/studio/` mount the
 * request arrives as `/studio/sources/...`; the handler also accepts it at the
 * server root so the route is identical whichever way the SPA is mounted.
 */
export const SOURCES_ROUTE_PREFIX = "/sources/";

/** Route path of the provenance sidecar, relative to the SPA mount. */
export const PROVENANCE_ROUTE = `/${PROVENANCE_SIDECAR_RELPATH}`;

/**
 * Content types for CITED documents. Deliberately separate from the SPA asset
 * map: what a corpus cites (PDF, DOCX, markdown, CSV) barely overlaps what a
 * Vite build emits, and a cited document must never inherit `text/html` — the
 * adapter treats an HTML content-type on a non-HTML locator as proof that a
 * server fell back to the SPA shell and refuses to render it (commit ce003c1b).
 */
const SOURCE_MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".xhtml": "application/xhtml+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".doc": "application/msword",
  ".ppt": "application/vnd.ms-powerpoint",
  ".xls": "application/vnd.ms-excel",
};

export function sourceMimeFor(relPath: string): string {
  const dot = relPath.lastIndexOf(".");
  const ext = dot >= 0 ? relPath.slice(dot).toLowerCase() : "";
  return SOURCE_MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * The roots a cited locator resolves against, in priority order — the project
 * root (the parent of the state dir, overridable) then the state dir itself.
 * Identical to the exporter's, so a locator resolves to the same file whether it
 * is served or bundled.
 */
export function studioSourceRoots(stateDir: string, sourcesRoot?: string): string[] {
  const state = resolve(stateDir);
  return [resolve(sourcesRoot ?? join(state, "..")), state];
}

/** True when `target` is inside `root` (or is `root`). */
function isUnder(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

/**
 * Resolve a bundle-relative `sources/` path to a real file under one of the
 * roots, or null. Traversal is refused twice over: {@link normalizeSourceRelPath}
 * rejects `..`/absolute/URL locators up front, and the resolved path is then
 * re-checked to still live under the root it was joined to — so a symlinked or
 * unicode-normalized escape cannot slip through the string check.
 */
export function resolveSourceFile(relPath: string, roots: string[]): string | null {
  const rel = normalizeSourceRelPath(relPath);
  if (!rel) return null;
  for (const root of roots) {
    const candidate = resolve(join(root, rel));
    if (!isUnder(root, candidate)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Serve one cited document. Returns a 404 result (never null) so the caller
 * cannot accidentally fall through to the SPA shell — answering an asset request
 * with `index.html` at HTTP 200 is exactly the failure that made the viewer
 * render the studio's own chrome as "the cited source".
 */
export function serveCitedSourceFile(relPath: string, roots: string[]): StudioAssetResult {
  const file = resolveSourceFile(relPath, roots);
  if (!file) {
    return {
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: `cited source not found: ${relPath}`,
    };
  }
  return { status: 200, contentType: sourceMimeFor(file), body: readFileSync(file) };
}

// ---------------------------------------------------------------------------
// sources/provenance.json, served live.
// ---------------------------------------------------------------------------

/** Identity of the inputs a provenance map is derived from (for cache keying). */
function statKey(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "-";
  }
}

interface ProvenanceCacheEntry {
  key: string;
  json: string;
  count: number;
}

const provenanceCache = new Map<string, ProvenanceCacheEntry>();

/** Test seam: drop the memoized live provenance maps. */
export function __resetLiveProvenanceCache(): void {
  provenanceCache.clear();
}

/**
 * Build (and memoize) the live `sources/provenance.json` payload for a state dir.
 *
 * The map is derived from the same two artifacts the exporter reads — the
 * graph's inline citations and the Level-2 `ontology/citations.json` store — so
 * the served chain and an exported one describe the same documents. Both can be
 * large (the PROCESS_STD corpus: 127 MB and 65 MB), and the walk is O(citations), so the
 * result is cached on the identity (mtime + size) of both inputs: only the first
 * fetch after a rebuild pays for it.
 *
 * `bundled` is decided by whether {@link resolveSourceFile} can serve the
 * original, which is what this route will actually do when asked — so the flag
 * can never promise a document the route would 404.
 */
export function buildLiveProvenance(
  stateDir: string,
  roots: string[],
): { json: string; count: number } {
  const state = resolve(stateDir);
  const graphPath = join(state, "graph.json");
  const citationsPath = join(state, "ontology", "citations.json");
  const key = `${statKey(graphPath)}|${statKey(citationsPath)}|${roots.join("\0")}`;
  const cached = provenanceCache.get(state);
  if (cached && cached.key === key) return { json: cached.json, count: cached.count };

  let nodes: Array<Record<string, unknown>> = [];
  if (existsSync(graphPath)) {
    try {
      const graph = JSON.parse(readFileSync(graphPath, "utf-8")) as {
        nodes?: Array<Record<string, unknown>>;
      };
      if (Array.isArray(graph.nodes)) nodes = graph.nodes;
    } catch {
      // A corrupt graph.json is the graph route's problem to report, not this
      // one's: provenance degrades to the sidecar alone rather than 500ing.
    }
  }
  let citationsSidecarJson: unknown = null;
  if (existsSync(citationsPath)) {
    try {
      citationsSidecarJson = JSON.parse(readFileSync(citationsPath, "utf-8"));
    } catch {
      /* best-effort: inline citations still carry most locators */
    }
  }

  const citedFiles = collectCitedSourceFiles(nodes, citationsSidecarJson);
  const provenance = buildCitedSourceProvenance(citedFiles, {
    roots,
    // Live, "bundled" == "this route can serve it". No copy is needed: the
    // server is running next to the corpus the originals belong to.
    isBundled: (originalRel) => resolveSourceFile(originalRel, roots) !== null,
  });
  const json = JSON.stringify(provenance);
  const count = Object.keys(provenance.documents).length;
  provenanceCache.set(state, { key, json, count });
  return { json, count };
}

/**
 * Route entry point: handle any request under `sources/`.
 *
 * `relPath` is the path AFTER the `sources/` prefix (already URL-decoded).
 * `provenance.json` is synthesized; everything else is a cited document read
 * from disk. Returns a result for every input — a miss is a 404, never a
 * fall-through to the SPA.
 */
export function serveStudioSource(
  relPath: string,
  stateDir: string,
  sourcesRoot?: string,
): StudioAssetResult {
  const roots = studioSourceRoots(stateDir, sourcesRoot);
  if (relPath === "provenance.json") {
    const { json } = buildLiveProvenance(stateDir, roots);
    return { status: 200, contentType: "application/json; charset=utf-8", body: json };
  }
  return serveCitedSourceFile(relPath, roots);
}

/**
 * The state dir a studio server is serving, read from `profile-state.json`
 * ALONE.
 *
 * Deliberately not `loadOntologyPatchContext`: that also parses the normalized
 * ontology profile and every registry, and THROWS when the profile compile has
 * not run. Serving a cited PDF has nothing to do with the ontology profile, and
 * a studio pointed at a state dir whose profile is incomplete must still be able
 * to open the corpus — coupling the two turned a missing
 * `ontology-profile.normalized.json` into an unhandled throw in the async
 * request handler, i.e. a crashed server process.
 *
 * A relative `state_dir` is resolved against the project root recorded next to
 * it, then against the profile dir's parent, mirroring how the state dir sits at
 * `<root>/.graphify` with the profile inside it.
 */
export function resolveStudioStateDir(profileStatePath: string): string {
  const statePath = resolve(profileStatePath);
  const raw = JSON.parse(readFileSync(statePath, "utf-8")) as {
    state_dir?: unknown;
    project_config_path?: unknown;
  };
  const stateDir = typeof raw.state_dir === "string" ? raw.state_dir.trim() : "";
  if (!stateDir) {
    throw new Error(`profile state carries no state_dir: ${statePath}`);
  }
  if (isAbsolute(stateDir)) return resolve(stateDir);
  const projectConfigPath =
    typeof raw.project_config_path === "string" ? raw.project_config_path : "";
  const base = projectConfigPath
    ? resolve(projectConfigPath, "..")
    : resolve(statePath, "..", "..", "..");
  return resolve(base, stateDir);
}

/**
 * Split a request pathname into the `sources/`-relative remainder, or null when
 * the request is not for this route. Accepts the SPA-mounted form
 * (`/studio/sources/x.pdf`, already stripped to `/sources/x.pdf` by the caller)
 * and the bare root form.
 */
export function studioSourcePathname(pathname: string): string | null {
  if (!pathname.startsWith(SOURCES_ROUTE_PREFIX)) return null;
  const rest = pathname.slice(SOURCES_ROUTE_PREFIX.length);
  if (!rest || isAbsolute(rest)) return null;
  return rest;
}
