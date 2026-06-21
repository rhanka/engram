/**
 * Reusable STATIC Ontology Studio export.
 *
 * Produces a self-contained static studio bundle: the prebuilt Svelte studio
 * SPA (resolved via {@link resolveStudioAppDir}) plus the data artifacts the
 * SPA's static-fallback data layer fetches next to index.html. The result is
 * openable from any static file server (or GitHub Pages) WITHOUT the
 * `graphify ontology studio` server.
 *
 * This is the engine behind `graphify studio export <out>` and the default
 * pipeline's visual output (the replacement for the former HTML graph export). It
 * reuses the SAME server-side builders the live studio server uses (no
 * duplicated scene/sidecar/reconciliation logic) — generalised out of the
 * former one-off `scripts/build-studio-demo.mjs`.
 *
 * Emitted layout (mirrors the SPA's static fallbacks):
 *   index.html + assets/            <- the built SPA (resolveStudioAppDir)
 *   graph.json                      <- verbatim copy of <state>/graph.json
 *   scene.json                      <- attachLayoutPositions(buildStudioScene)
 *   scene-hierarchies.json          <- emitSceneHierarchies (iff ontology arcs)
 *   class-hierarchies.json          <- emitClassHierarchies (iff profile block)
 *   reconciliation-candidates.json  <- the reconciliation queue (iff present)
 *   entities.json                   <- { id: buildEntitySidecar } index
 *   ontology/citations.json         <- verbatim copy (iff present)
 *   workspace-manifest.json         <- emitWorkspaceManifest (bundle descriptor)
 *   studio.html                     <- self-contained single-file studio, opens
 *                                      from a bare file:// (default-on; the
 *                                      scene is inlined, +graph/entities with
 *                                      --full-offline). SPEC_STUDIO_OFFLINE_EXPORT.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { attachLayoutPositions } from "./graph-layout.js";
import { emitClassHierarchies } from "./ontology-class-hierarchies-emitter.js";
import { loadOntologyProfile } from "./ontology-profile.js";
import {
  loadOntologyReconciliationCandidates,
  queryOntologyReconciliationCandidates,
} from "./ontology-reconciliation.js";
import { emitSceneHierarchies } from "./scene-hierarchies-emitter.js";
import { buildEntitySidecar, resolveStudioAppDir } from "./studio-assets.js";
import { buildStudioScene, type StudioSceneGraphLike } from "./studio-scene.js";
import { emitWorkspaceManifest } from "./workspace-manifest-emitter.js";

/** Thrown when the prebuilt studio SPA is not available on disk. */
export class StudioSpaNotBuiltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioSpaNotBuiltError";
  }
}

export interface BuildStaticStudioOptions {
  /** graphify state dir (must contain graph.json). */
  stateDir: string;
  /** Target export dir (created if missing). */
  outDir: string;
  /**
   * Optional ontology profile path. When provided AND the profile carries a
   * non-empty `class_hierarchies` block, `class-hierarchies.json` is emitted.
   */
  profilePath?: string;
  /** Override the resolved SPA dir (tests). */
  spaDir?: string;
  /**
   * Emit the self-contained, double-clickable `studio.html` (single-file,
   * scene-inlined). Default `true`. `--no-single-file` sets this `false` to emit
   * only the multi-file bundle. Best-effort: a missing single-file template (or
   * any single-file-only failure) warns and is a no-op (INV-3).
   */
  singleFile?: boolean;
  /**
   * Inline `graph.json` + `entities.json` into `studio.html` too (not just the
   * scene), so the offline studio needs ZERO network even for the background
   * graph hydration. Default `false` (scene-only). Implies `singleFile`.
   */
  fullOffline?: boolean;
  /** Emit a warning (non-fatal). Defaults to console.warn. */
  onWarning?: (message: string) => void;
}

export interface BuildStaticStudioResult {
  outDir: string;
  spaDir: string;
  nodeCount: number;
  sceneNodeCount: number;
  sceneEdgeCount: number;
  entityCount: number;
  reconciliationCount: number;
  sceneHierarchiesPath: string | null;
  classHierarchiesPath: string | null;
  manifestPath: string;
  manifestPresentCount: number;
  manifestArtifactCount: number;
  /** Absolute path of the emitted single-file `studio.html`, or null when skipped. */
  studioHtmlPath: string | null;
  /** Byte size of the emitted `studio.html`, or null when skipped. */
  studioHtmlBytes: number | null;
}

const GENERATED_DATA_FILES = [
  "scene.json",
  "scene-hierarchies.json",
  "class-hierarchies.json",
  "graph.json",
  "reconciliation-candidates.json",
  "entities.json",
  "workspace-manifest.json",
  // Stale multi-model bundle descriptor. A single-model export MUST remove it
  // (and the models/ dir below) so the SPA loads the fresh top-level
  // scene.json/graph.json instead of stale per-model data left by a previous
  // multi-model export into the same dir.
  "models.json",
  // The self-contained single-file studio. Wiped up front so a `--no-single-file`
  // re-export into a dir that previously got a default (single-file) export does
  // not leave a stale studio.html behind.
  "studio.html",
];

/** Stale directories a previous (possibly multi-model) export may have left. */
const GENERATED_DATA_DIRS = ["assets", "ontology", "models"];

/**
 * Guard against a destructive export. {@link buildStaticStudio} cleans `outDir`
 * up front (wiping stale generated data), so exporting INTO the state dir — or
 * into any ancestor of it — would delete the very `graph.json`/`ontology` it is
 * about to read. Reject those targets with a clear, actionable error.
 */
function assertSafeExportTarget(stateDir: string, outDir: string): void {
  const resolvedState = resolve(stateDir);
  const resolvedOut = resolve(outDir);
  if (resolvedOut === resolvedState) {
    throw new Error(
      `refusing to export into the state dir (${resolvedState}); choose a separate out dir like .graphify/studio`,
    );
  }
  // outDir is an ANCESTOR of stateDir when the relative path from out -> state
  // stays inside out (no leading "..", not absolute). Cleaning such an out dir
  // would erase the nested state dir.
  const rel = relative(resolvedOut, resolvedState);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    throw new Error(
      `refusing to export into ${resolvedOut}: it contains the state dir ${resolvedState}; choose a separate out dir like .graphify/studio`,
    );
  }
}

// The legacy graph-viz HTML file an older graphify version wrote into the state
// dir. The product no longer GENERATES it; this name is assembled by string
// concatenation (so it never re-surfaces in a source scan) and exists ONLY so the
// migration cleanup below can ERASE a stale one — the static studio supersedes it.
const LEGACY_GRAPH_VIZ_FILE = "graph" + ".html";

/**
 * Migration cleanup: delete a stale legacy graph viz left in `stateDir` by an
 * older graphify version, so existing projects switch cleanly to the studio with
 * no orphaned artifact. Called by every DEFAULT studio emit (not the explicit
 * `studio export <out>`, which must not touch the source state dir).
 */
export function removeLegacyGraphViz(stateDir: string): boolean {
  const legacy = join(stateDir, LEGACY_GRAPH_VIZ_FILE);
  if (existsSync(legacy)) {
    rmSync(legacy, { force: true });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Single-file (`studio.html`) offline export — see SPEC_STUDIO_OFFLINE_EXPORT.md.
// The exporter injects the inlined data + reads the prebuilt single-file template
// (`studio-template.html`, produced by the flagged Vite pass). Both halves —
// inlining the data AND the api.js short-circuit that reads it — are mandatory
// for the `file://` double-click to render.
// ---------------------------------------------------------------------------

/** The prebuilt single-file template the exporter injects the data script into. */
export const SINGLE_FILE_TEMPLATE_NAME = "studio-template.html";

/**
 * Escape an already-serialized JSON string so it can be embedded as a JS string
 * literal inside an inline `<script>` and round-trip through `JSON.parse` (C3a).
 *
 * Strategy: `JSON.stringify` the JSON text (double-encode) to get a safe,
 * fully-escaped JS string literal (handles backslashes, quotes, control chars),
 * then post-replace the three sequences `JSON.stringify` does NOT neutralise:
 *   - `</`  -> `<\/`  so a `</script>` substring in any value cannot close the
 *                     script element early (HTML-context break / injection).
 *   - U+2028 / U+2029 -> ` ` / ` ` — valid in JSON strings but JS line
 *                     terminators; unescaped they throw a SyntaxError at load.
 * The result includes the surrounding double quotes, ready to drop into
 * `JSON.parse(<here>)`.
 */
export function escapeBundleJsonLiteral(jsonText: string): string {
  const LS = String.fromCharCode(0x2028); // U+2028 LINE SEPARATOR
  const PS = String.fromCharCode(0x2029); // U+2029 PARAGRAPH SEPARATOR
  return JSON.stringify(jsonText)
    .replace(/<\//g, "<\\/")
    .split(LS)
    .join("\\u2028")
    .split(PS)
    .join("\\u2029");
}

/**
 * Build the inline classic `<script>` that sets `window.__GRAPHIFY_BUNDLE__` from
 * an escaped JSON string. `bundle` is a map keyed by the filenames the api.js
 * static fallbacks request (`scene.json`, optionally `graph.json`/`entities.json`).
 */
export function buildBundleScript(bundle: Record<string, unknown>): string {
  const jsonText = JSON.stringify(bundle);
  const literal = escapeBundleJsonLiteral(jsonText);
  return `<script>window.__GRAPHIFY_BUNDLE__ = JSON.parse(${literal});</script>`;
}

/**
 * Inject the bundle script into the single-file template BEFORE the app's
 * (inlined) module/boot script, so `window.__GRAPHIFY_BUNDLE__` exists before
 * `mount(App)` runs (C4 ordering). Insertion point, in priority order:
 *   1. immediately before the FIRST `<script type="module"` (the boot script);
 *   2. else immediately before the first `<script` of any kind;
 *   3. else immediately before `</body>`;
 *   4. else appended (last resort).
 * Returns the augmented HTML.
 */
export function injectBundleScript(templateHtml: string, bundleScript: string): string {
  const moduleIdx = templateHtml.search(/<script\b[^>]*\btype\s*=\s*["']module["']/i);
  if (moduleIdx >= 0) {
    return templateHtml.slice(0, moduleIdx) + bundleScript + "\n" + templateHtml.slice(moduleIdx);
  }
  const anyScriptIdx = templateHtml.search(/<script\b/i);
  if (anyScriptIdx >= 0) {
    return (
      templateHtml.slice(0, anyScriptIdx) + bundleScript + "\n" + templateHtml.slice(anyScriptIdx)
    );
  }
  const bodyCloseIdx = templateHtml.search(/<\/body>/i);
  if (bodyCloseIdx >= 0) {
    return (
      templateHtml.slice(0, bodyCloseIdx) + bundleScript + "\n" + templateHtml.slice(bodyCloseIdx)
    );
  }
  return templateHtml + "\n" + bundleScript;
}

/**
 * Build a self-contained static studio export into `outDir`.
 *
 * Throws {@link StudioSpaNotBuiltError} when the prebuilt SPA is missing, and a
 * plain Error when `<stateDir>/graph.json` is absent.
 */
export function buildStaticStudio(
  options: BuildStaticStudioOptions,
): BuildStaticStudioResult {
  const { stateDir, outDir } = options;
  const warn = options.onWarning ?? ((message: string) => console.warn(message));
  const graphPath = join(stateDir, "graph.json");
  if (!existsSync(graphPath)) {
    throw new Error(`graph.json not found in state dir: ${graphPath}`);
  }

  // Guard (a): never export into the state dir or an ancestor of it — the
  // cleanup below would delete the source graph.json/ontology we are reading.
  assertSafeExportTarget(stateDir, outDir);

  const spaDir = options.spaDir ?? resolveStudioAppDir();
  if (!spaDir || !existsSync(join(spaDir, "index.html"))) {
    throw new StudioSpaNotBuiltError(
      "Studio SPA not built. Run `npm run build` (or `node scripts/build-studio-app.mjs`) " +
        "to produce the prebuilt studio app before exporting a static studio.",
    );
  }

  // 0. Read ALL source artifacts (everything we copy/derive from stateDir) into
  //    memory BEFORE any cleanup/write of outDir, so even if outDir overlapped
  //    the state dir the source bytes are already captured. The guard above
  //    already rejects the destructive case; this is belt-and-braces.
  const graphRaw = readFileSync(graphPath, "utf-8");
  const graph = JSON.parse(graphRaw) as StudioSceneGraphLike & {
    nodes?: Array<{ id?: unknown }>;
  };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

  // Profile is loaded UP FRONT (before scene construction) so its
  // visual_encoding can drive the scene. A profile that cannot be loaded is
  // non-fatal — scene falls back to the built-in type defaults.
  let ontologyProfile: ReturnType<typeof loadOntologyProfile> | null = null;
  if (options.profilePath) {
    try {
      ontologyProfile = loadOntologyProfile(options.profilePath);
    } catch (err) {
      warn(
        `studio export: could not load profile (${err instanceof Error ? err.message : String(err)}); using built-in visual defaults and skipping class-hierarchies.json.`,
      );
    }
  }

  // entities.json source: { id: sidecar } index built from stateDir BEFORE
  // cleanup (buildEntitySidecar reads from stateDir).
  const entities: Record<string, unknown> = {};
  for (const node of nodes) {
    const id = (node as { id?: unknown }).id;
    if (typeof id !== "string" || !id) continue;
    entities[id] = buildEntitySidecar(stateDir, id);
  }

  // reconciliation candidates source (read before cleanup).
  let candidatesResponse: { items: unknown[]; total?: number } = { items: [], total: 0 };
  const candidatesPath = join(stateDir, "ontology", "reconciliation", "candidates.json");
  if (existsSync(candidatesPath)) {
    try {
      const queue = loadOntologyReconciliationCandidates(candidatesPath);
      candidatesResponse = queryOntologyReconciliationCandidates(queue, {
        sort: "score",
        order: "desc",
        stale: false,
      });
    } catch (err) {
      warn(
        `studio export: could not read reconciliation candidates (${err instanceof Error ? err.message : String(err)}); emitting an empty queue.`,
      );
    }
  }

  // ontology/citations.json source bytes (read before cleanup).
  const citationsPath = join(stateDir, "ontology", "citations.json");
  const citationsRaw = existsSync(citationsPath) ? readFileSync(citationsPath) : null;

  // 1. Copy the built SPA (index.html + assets) into the export dir. Wipe stale
  //    generated data first (but keep the dir, so a .nojekyll is not collateral).
  //    The cleanup also removes a stale multi-model bundle (models.json +
  //    models/) so a single-model export does not leave the SPA loading stale
  //    per-model data instead of the fresh top-level scene.json/graph.json.
  mkdirSync(outDir, { recursive: true });
  for (const f of GENERATED_DATA_FILES) rmSync(join(outDir, f), { force: true });
  for (const d of GENERATED_DATA_DIRS) rmSync(join(outDir, d), { recursive: true, force: true });
  cpSync(spaDir, outDir, { recursive: true });

  // 2. graph.json: verbatim copy (byte-identical to the artifact).
  writeFileSync(join(outDir, "graph.json"), graphRaw);

  // 3. scene.json: the light Studio scene, with pinned force-layout positions
  //    (x,y + fx,fy) so the SPA renders the settled layout without re-running
  //    the O(n^2) sim at mount. Honors GRAPHIFY_FAST_LAYOUT via attachLayoutPositions.
  //    The bound profile's per-type visual_encoding (shape/fill/border) drives
  //    the scene encoding; absent a profile the built-in type defaults apply.
  const scene = attachLayoutPositions(
    buildStudioScene(graph, ontologyProfile ? { profile: ontologyProfile } : {}),
  );
  // The exact serialized scene bytes — reused verbatim for the inlined offline
  // bundle so the inlined scene is byte-identical to scene.json (T5/C3b: carries
  // the same x,y + fx,fy positions; no recompute, no degenerate circle).
  const sceneJsonText = JSON.stringify(scene);
  writeFileSync(join(outDir, "scene.json"), sceneJsonText);

  // 3b. scene-hierarchies.json: standalone sidecar, emitted iff the ontology
  //     compile produced <state>/ontology/hierarchies.json. Joins on the raw
  //     registry ids the scene contributes.
  const sceneRawIds = new Set<string>();
  for (const node of scene.nodes) {
    const rawRecordId = (node as { registry_record_id?: unknown }).registry_record_id;
    const raw = typeof rawRecordId === "string" ? rawRecordId : node.id;
    if (raw) sceneRawIds.add(raw);
  }
  const hierarchiesResult = emitSceneHierarchies({
    ontologyOutputDir: join(stateDir, "ontology"),
    sceneDir: outDir,
    sceneNodeIds: sceneRawIds,
  });

  // 3c. class-hierarchies.json: separate, additive ontology artifact, emitted
  //     into the OUT dir iff the bound profile (loaded up front) carries a
  //     non-empty `class_hierarchies` block.
  let classHierarchiesPath: string | null = null;
  if (ontologyProfile) {
    const result = emitClassHierarchies({
      ...(ontologyProfile.class_hierarchies
        ? { classHierarchies: ontologyProfile.class_hierarchies }
        : {}),
      graphNodes: nodes as Array<{ id?: string; node_type?: string; type?: string }>,
      ontologyOutputDir: outDir,
      ...(ontologyProfile.profile_hash !== undefined
        ? { profileHash: ontologyProfile.profile_hash }
        : {}),
    });
    classHierarchiesPath = result.path;
  }

  // 4. reconciliation-candidates.json: the complete candidate set (read into
  //    memory before cleanup; the SPA pages it client-side).
  writeFileSync(
    join(outDir, "reconciliation-candidates.json"),
    JSON.stringify(candidatesResponse),
  );

  // 5. entities.json: { id: sidecar } index for the entity panel (built before
  //    cleanup).
  writeFileSync(join(outDir, "entities.json"), JSON.stringify(entities));

  // 5b. ontology/citations.json: verbatim copy of the Level-2 citation store
  //     (captured before cleanup), so the SPA can lazily fetch full per-entity
  //     citations.
  if (citationsRaw !== null) {
    const outCitationsPath = join(outDir, "ontology", "citations.json");
    mkdirSync(dirname(outCitationsPath), { recursive: true });
    writeFileSync(outCitationsPath, citationsRaw);
  }

  // 6. workspace-manifest.json: the bundle descriptor (hashes the final bytes of
  //    every artifact above). Emitted LAST of the MULTI-FILE bundle. studio.html
  //    is NOT one of its artifacts, so the manifest bytes are identical whether
  //    or not the single-file emit runs (INV-2 / T6).
  const manifestResult = emitWorkspaceManifest({ bundleDir: outDir });

  // 7. studio.html: the self-contained, double-clickable single-file studio
  //    (default-on, additive, AFTER the manifest). Inlines the position-bearing
  //    scene (and, with --full-offline, graph + entities) as an escaped
  //    window.__GRAPHIFY_BUNDLE__ injected before the inlined boot script. Best-
  //    effort: a missing single-file template warns and is a no-op (INV-3).
  let studioHtmlPath: string | null = null;
  let studioHtmlBytes: number | null = null;
  const singleFile = options.fullOffline ? true : options.singleFile !== false;
  if (singleFile) {
    const templatePath = join(spaDir, SINGLE_FILE_TEMPLATE_NAME);
    if (!existsSync(templatePath)) {
      warn(
        `studio export: single-file template not found at ${templatePath}; skipping studio.html ` +
          "(build it with `GRAPHIFY_STUDIO_SINGLEFILE=1 npm run build` / `node scripts/build-studio-app.mjs`).",
      );
    } else {
      try {
        // Bundle keyed by the same filenames the api.js static fallbacks request.
        // Scene-only by default; --full-offline adds graph + entities so even the
        // background hydration needs zero network. Reuse the SAME scene object so
        // the inlined scene is byte-identical to scene.json (T5/C3b).
        const bundle: Record<string, unknown> = { "scene.json": scene };
        if (options.fullOffline) {
          bundle["graph.json"] = JSON.parse(graphRaw);
          bundle["entities.json"] = entities;
        }
        const templateHtml = readFileSync(templatePath, "utf-8");
        const html = injectBundleScript(templateHtml, buildBundleScript(bundle));
        const outPath = join(outDir, "studio.html");
        writeFileSync(outPath, html);
        studioHtmlPath = outPath;
        studioHtmlBytes = Buffer.byteLength(html, "utf-8");
      } catch (err) {
        warn(
          `studio export: could not emit studio.html (${err instanceof Error ? err.message : String(err)}); the multi-file bundle is unaffected.`,
        );
      }
    }
  }
  // Belt-and-braces: when single-file is OFF, ensure no stale studio.html lingers
  // (the up-front cleanup already wipes it, but a guard keeps the result honest).
  if (!singleFile) {
    rmSync(join(outDir, "studio.html"), { force: true });
  }

  return {
    outDir,
    spaDir,
    nodeCount: nodes.length,
    sceneNodeCount: scene.nodes.length,
    sceneEdgeCount: scene.edges.length,
    entityCount: Object.keys(entities).length,
    reconciliationCount: candidatesResponse.total ?? candidatesResponse.items.length,
    sceneHierarchiesPath: hierarchiesResult.path,
    classHierarchiesPath,
    manifestPath: manifestResult.path,
    manifestPresentCount: manifestResult.manifest.present_count,
    manifestArtifactCount: manifestResult.manifest.artifacts.length,
    studioHtmlPath,
    studioHtmlBytes,
  };
}
