/**
 * workspace-bundle-contract-v1 (WP4 G2) — scene-hierarchies.json emitter.
 *
 * Writes the STANDALONE `scene-hierarchies.json` artifact (schema
 * `graphify_scene_hierarchies_v1`) next to `scene.json`, decoupled from the
 * (optional) scene per frozen Decision 1:
 *
 *   - The sidecar is emitted IFF `<ontologyOutputDir>/hierarchies.json`
 *     exists (the increment-A artifact produced by compileOntologyOutputs).
 *     When it is absent, NO file is written (not a `null` placeholder).
 *   - `buildStudioScene` never embeds the sidecar; scene.json stays
 *     byte-identical with or without hierarchies.
 *   - Cache-key = identity of hierarchies.json (path + mtime + size): the
 *     sidecar is only rebuilt when the source artifact changes, mirroring
 *     the scene cache in ontology-studio.ts.
 *
 * The pure builder lives in `scene-hierarchies.ts`; this module owns all
 * the I/O.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildSceneHierarchySidecar,
  type SceneHierarchySidecar,
} from "./scene-hierarchies.js";
import type { OntologyHierarchyArc } from "./types.js";

export const SCENE_HIERARCHIES_FILENAME = "scene-hierarchies.json";

export interface EmitSceneHierarchiesOptions {
  /** Ontology output dir containing `hierarchies.json` (e.g. <state>/ontology). */
  ontologyOutputDir: string;
  /** Dir where scene.json lives — `scene-hierarchies.json` is written there. */
  sceneDir: string;
  /**
   * RAW registry ids present in the consuming scene (the verbatim
   * `registry_record_id` values, D2). Optional: when omitted (e.g. the scene
   * is absent — it is OPTIONAL per F1) every arc endpoint is considered
   * present, so no orphan promotion / dangling pruning is applied.
   */
  sceneNodeIds?: Set<string>;
  /** Optional per-hierarchy relation_type overrides. */
  specs?: Record<string, { relation_type?: string }>;
  /** Optional graph hash stamped on the envelope. */
  graphHash?: string;
}

export interface EmitSceneHierarchiesResult {
  /** True when scene-hierarchies.json was (re)written on this call. */
  written: boolean;
  /** Absolute target path, or null when hierarchies.json is absent. */
  path: string | null;
  /** The emitted sidecar, or null when hierarchies.json is absent. */
  sidecar: SceneHierarchySidecar | null;
  /** True when the cached sidecar was reused (source mtime unchanged). */
  cached: boolean;
}

interface EmitterCacheEntry {
  /** Identity of hierarchies.json + the inputs that shape the sidecar. */
  sourceKey: string;
  sidecar: SceneHierarchySidecar;
}

/** Cache keyed by target path (one entry per export/scene dir). */
const emitterCache = new Map<string, EmitterCacheEntry>();

/** Test hook: drop the mtime cache (e.g. between fixture roots). */
export function clearSceneHierarchiesEmitterCache(): void {
  emitterCache.clear();
}

function sourceKeyFor(
  hierarchiesPath: string,
  options: EmitSceneHierarchiesOptions,
): string {
  const stat = statSync(hierarchiesPath);
  const sceneIdsKey = options.sceneNodeIds
    ? [...options.sceneNodeIds].sort().join("")
    : "*";
  return [
    hierarchiesPath,
    String(stat.mtimeMs),
    String(stat.size),
    options.graphHash ?? "",
    sceneIdsKey,
  ].join("\u0000");
}

function readArcs(hierarchiesPath: string): OntologyHierarchyArc[] {
  const raw: unknown = JSON.parse(readFileSync(hierarchiesPath, "utf-8"));
  return Array.isArray(raw) ? (raw as OntologyHierarchyArc[]) : [];
}

/** All raw ids referenced by the arcs (default scene universe, F1). */
function arcNodeIds(arcs: OntologyHierarchyArc[]): Set<string> {
  const ids = new Set<string>();
  for (const arc of arcs) {
    ids.add(arc.parent_id);
    ids.add(arc.child_id);
  }
  return ids;
}

/**
 * Emit `scene-hierarchies.json` into `sceneDir` IFF
 * `<ontologyOutputDir>/hierarchies.json` exists. Idempotent and cached on
 * the source artifact's mtime: an unchanged source skips both the rebuild
 * and the rewrite (unless the target file is missing).
 */
export function emitSceneHierarchies(
  options: EmitSceneHierarchiesOptions,
): EmitSceneHierarchiesResult {
  const hierarchiesPath = join(options.ontologyOutputDir, "hierarchies.json");
  if (!existsSync(hierarchiesPath)) {
    // D1: the sidecar is core but source-gated — no hierarchies, no file.
    return { written: false, path: null, sidecar: null, cached: false };
  }

  const targetPath = join(options.sceneDir, SCENE_HIERARCHIES_FILENAME);
  const sourceKey = sourceKeyFor(hierarchiesPath, options);
  const cachedEntry = emitterCache.get(targetPath);
  const cached = cachedEntry !== undefined && cachedEntry.sourceKey === sourceKey;

  let sidecar: SceneHierarchySidecar;
  if (cached) {
    sidecar = cachedEntry.sidecar;
  } else {
    const arcs = readArcs(hierarchiesPath);
    sidecar = buildSceneHierarchySidecar({
      arcs,
      sceneNodeIds: options.sceneNodeIds ?? arcNodeIds(arcs),
      ...(options.specs !== undefined ? { specs: options.specs } : {}),
      ...(options.graphHash !== undefined ? { graphHash: options.graphHash } : {}),
    });
    emitterCache.set(targetPath, { sourceKey, sidecar });
  }

  // Rewrite only when the sidecar was rebuilt or the artifact vanished.
  const mustWrite = !cached || !existsSync(targetPath);
  if (mustWrite) {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(sidecar, null, 2) + "\n", "utf-8");
  }

  return { written: mustWrite, path: targetPath, sidecar, cached };
}
