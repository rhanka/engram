/**
 * EVOL 2.c — class-hierarchies.json emitter.
 *
 * Writes the STANDALONE `class-hierarchies.json` artifact (schema
 * `engram_ontology_class_hierarchies_v1`) into the ontology output dir,
 * mirroring `scene-hierarchies-emitter.ts`:
 *
 *   - The artifact is emitted IFF the profile carries a NON-EMPTY
 *     `class_hierarchies` block. When the block is absent / empty, NO file is
 *     written (not a `null` placeholder) — absent block => byte-identical to
 *     today.
 *   - Never embedded in scene.json / graph.json — it is a standalone sidecar.
 *   - Cache-key = identity of the inputs (the normalized class_hierarchies
 *     block + the graph node id/node_type projection + the stamped hashes): the
 *     artifact is only rebuilt when its inputs change, mirroring the scene
 *     sidecar cache. (There is no on-disk source file to stat — the block lives
 *     in the profile — so the key is a content hash, the equivalent of the
 *     scene emitter's path+mtime+size source key.)
 *
 * The pure builder lives in `ontology-class-hierarchies.ts`; this module owns
 * all the I/O.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildClassHierarchies,
  type ClassHierarchyGraphNode,
} from "./ontology-class-hierarchies.js";
import type {
  ClassHierarchiesArtifact,
  NormalizedClassHierarchySpec,
} from "./types.js";

export const CLASS_HIERARCHIES_FILENAME = "class-hierarchies.json";

export interface EmitClassHierarchiesOptions {
  /**
   * Normalized profile `class_hierarchies` block. When absent / empty, no file
   * is written (the gate — absent block => byte-identical to today).
   */
  classHierarchies?: Record<string, NormalizedClassHierarchySpec>;
  /** Graph nodes (entities are joined to leaf classes by their `id`). */
  graphNodes: ClassHierarchyGraphNode[];
  /** Ontology output dir — `class-hierarchies.json` is written there. */
  ontologyOutputDir: string;
  /** Optional graph hash stamped on the envelope. */
  graphHash?: string | null;
  /** Optional profile hash stamped on the envelope. */
  profileHash?: string | null;
}

export interface EmitClassHierarchiesResult {
  /** True when class-hierarchies.json was (re)written on this call. */
  written: boolean;
  /** Absolute target path, or null when the profile block is absent / empty. */
  path: string | null;
  /** The emitted artifact, or null when the profile block is absent / empty. */
  artifact: ClassHierarchiesArtifact | null;
  /** True when the cached artifact was reused (inputs unchanged). */
  cached: boolean;
}

interface EmitterCacheEntry {
  /** Identity of the inputs that shape the artifact. */
  sourceKey: string;
  artifact: ClassHierarchiesArtifact;
}

/** Cache keyed by target path (one entry per ontology output dir). */
const emitterCache = new Map<string, EmitterCacheEntry>();

/** Test hook: drop the cache (e.g. between fixture roots). */
export function clearClassHierarchiesEmitterCache(): void {
  emitterCache.clear();
}

function hasClassHierarchies(
  block: Record<string, NormalizedClassHierarchySpec> | undefined,
): block is Record<string, NormalizedClassHierarchySpec> {
  return block !== undefined && Object.keys(block).length > 0;
}

/**
 * Content key over the inputs. Deterministic (sorted): a byte-identical block +
 * node projection + hashes yields the same key, so an unchanged build skips the
 * rebuild and the rewrite. The node projection only carries the fields the
 * builder reads (id + node_type/type) so unrelated node mutations do not bust
 * the cache.
 */
function sourceKeyFor(options: EmitClassHierarchiesOptions): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(options.classHierarchies ?? {}));
  const nodeProjection = options.graphNodes
    .map((node) => {
      const id = typeof node.id === "string" ? node.id : "";
      const nt = typeof node.node_type === "string" ? node.node_type : "";
      const t = typeof node.type === "string" ? node.type : "";
      return `${id}${nt}${t}`;
    })
    .sort()
    .join("\u0000");
  hash.update("\u0000");
  hash.update(nodeProjection);
  hash.update("\u0000");
  hash.update(options.graphHash ?? "");
  hash.update("\u0000");
  hash.update(options.profileHash ?? "");
  return hash.digest("hex");
}

/**
 * Emit `class-hierarchies.json` into `ontologyOutputDir` IFF the profile
 * carries a non-empty `class_hierarchies` block. Idempotent and cached on the
 * inputs' content: unchanged inputs skip both the rebuild and the rewrite
 * (unless the target file is missing).
 */
export function emitClassHierarchies(
  options: EmitClassHierarchiesOptions,
): EmitClassHierarchiesResult {
  if (!hasClassHierarchies(options.classHierarchies)) {
    // Gate: no class_hierarchies block => no file (byte-identical to today).
    return { written: false, path: null, artifact: null, cached: false };
  }

  const targetPath = join(options.ontologyOutputDir, CLASS_HIERARCHIES_FILENAME);
  const sourceKey = sourceKeyFor(options);
  const cachedEntry = emitterCache.get(targetPath);
  const cached = cachedEntry !== undefined && cachedEntry.sourceKey === sourceKey;

  let artifact: ClassHierarchiesArtifact;
  if (cached) {
    artifact = cachedEntry.artifact;
  } else {
    artifact = buildClassHierarchies(options.classHierarchies, options.graphNodes, {
      ...(options.graphHash !== undefined ? { graphHash: options.graphHash } : {}),
      ...(options.profileHash !== undefined ? { profileHash: options.profileHash } : {}),
    });
    emitterCache.set(targetPath, { sourceKey, artifact });
  }

  // Rewrite only when the artifact was rebuilt or the target vanished.
  const mustWrite = !cached || !existsSync(targetPath);
  if (mustWrite) {
    mkdirSync(options.ontologyOutputDir, { recursive: true });
    writeFileSync(targetPath, JSON.stringify(artifact, null, 2) + "\n", "utf-8");
  }

  return { written: mustWrite, path: targetPath, artifact, cached };
}
