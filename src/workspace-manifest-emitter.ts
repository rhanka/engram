/**
 * workspace-bundle-contract-v1 (WP4 / F3) — workspace-manifest.json emitter.
 *
 * Writes the bundle descriptor `workspace-manifest.json` (schema
 * `engram_workspace_manifest_v1`) into the bundle root, alongside the scene
 * + its sidecars. The aclp-am peer consumes the manifest first: it discovers
 * the bundle's artifacts, validates their schema ids, and verifies integrity
 * via the per-artifact sha256 + size_bytes — without out-of-band knowledge of
 * which files a given build emitted.
 *
 * The bundle (per the signed contract's `bundle_artifacts`) is:
 *   - scene                  scene.json                     (OPTIONAL, F1)
 *   - scene-hierarchies      scene-hierarchies.json         (CORE,
 *                            engram_scene_hierarchies_v1)
 *   - reconciliation-candidates
 *                            reconciliation-candidates.json
 *                            (engram_ontology_reconciliation_candidates_v1)
 *   - graph                  graph.json                     (canonical graph)
 *   - entities               entities.json                  (entity sidecars)
 *
 * Design (mirrors `scene-hierarchies-emitter.ts`):
 *   - The PURE manifest shape lives in `workspace-manifest.ts`; this module
 *     owns ALL the I/O. It reads the REAL bytes of each candidate artifact
 *     from disk and hands them to the builder, so the recorded sha256/size
 *     describe exactly what is on disk.
 *   - An artifact that is not on disk is recorded as `present: false` (NOT
 *     dropped): the consumer can distinguish "the producer chose not to emit
 *     this" from "this build is malformed".
 *   - Deterministic: two runs over a byte-identical bundle produce a
 *     byte-identical manifest except for `generated_at`. `generated_at` is
 *     overridable for reproducible builds / tests.
 *   - The manifest does NOT list itself (it cannot hash a file that does not
 *     exist yet, and a self-referential hash is meaningless).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  WORKSPACE_MANIFEST_FILENAME,
  buildWorkspaceManifest,
  type WorkspaceManifest,
  type WorkspaceManifestArtifactInput,
  type WorkspaceManifestCounts,
} from "./workspace-manifest.js";

export { WORKSPACE_MANIFEST_FILENAME } from "./workspace-manifest.js";

import { SCENE_HIERARCHIES_SCHEMA } from "./scene-hierarchies.js";
import { ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA } from "./ontology-reconciliation.js";

/**
 * A candidate bundle artifact: its logical name, on-disk filename (relative to
 * the bundle root), and the schema id it claims. The emitter probes the file
 * and records present/absent + hash.
 */
interface BundleArtifactSpec {
  name: string;
  filename: string;
  schema: string | null;
  role?: string;
}

/**
 * The canonical bundle layout the aclp-am peer consumes. Order here is
 * irrelevant (the builder sorts by name); this is the closed set the emitter
 * always reports on, so a missing artifact surfaces as `present: false`.
 */
const BUNDLE_ARTIFACTS: readonly BundleArtifactSpec[] = [
  { name: "scene", filename: "scene.json", schema: null, role: "scene" },
  {
    name: "scene-hierarchies",
    filename: "scene-hierarchies.json",
    schema: SCENE_HIERARCHIES_SCHEMA,
    role: "hierarchy",
  },
  {
    name: "reconciliation-candidates",
    filename: "reconciliation-candidates.json",
    schema: ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
    role: "reconciliation",
  },
  { name: "graph", filename: "graph.json", schema: null, role: "graph" },
  { name: "entities", filename: "entities.json", schema: null, role: "entities" },
];

export interface EmitWorkspaceManifestOptions {
  /** Bundle root: where the artifacts live and where the manifest is written. */
  bundleDir: string;
  /**
   * Optional override of the artifact set (tests / non-default layouts). When
   * omitted the canonical {@link BUNDLE_ARTIFACTS} layout is used.
   */
  artifacts?: readonly BundleArtifactSpec[];
  /** Optional graph hash stamped on the manifest envelope. */
  graphHash?: string | null;
  /** Override the timestamp (reproducible builds / tests). */
  generatedAt?: string;
  /**
   * Measured node counts to stamp (`counts`). The producer supplies them — it
   * already holds the parsed artifacts, so the emitter never re-parses them.
   */
  counts?: Omit<WorkspaceManifestCounts, "coherent">;
}

export interface EmitWorkspaceManifestResult {
  /** Absolute path of the written manifest. */
  path: string;
  /** The manifest that was written. */
  manifest: WorkspaceManifest;
}

/**
 * Build and write `workspace-manifest.json` into `bundleDir`, hashing the REAL
 * bytes of each bundle artifact present on disk. Always writes the manifest
 * (the manifest itself is the descriptor of record); a missing artifact is
 * reported as `present: false` rather than omitted.
 */
export function emitWorkspaceManifest(
  options: EmitWorkspaceManifestOptions,
): EmitWorkspaceManifestResult {
  const specs = options.artifacts ?? BUNDLE_ARTIFACTS;

  const inputs: WorkspaceManifestArtifactInput[] = specs.map((spec) => {
    const filePath = join(options.bundleDir, spec.filename);
    // Read the real bytes IFF the artifact is a regular file on disk. A
    // directory or a missing path yields present:false (no hash).
    let bytes: Buffer | null = null;
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      bytes = readFileSync(filePath);
    }
    const input: WorkspaceManifestArtifactInput = {
      name: spec.name,
      path: spec.filename,
      schema: spec.schema,
      bytes,
    };
    if (spec.role !== undefined) input.role = spec.role;
    return input;
  });

  const manifest = buildWorkspaceManifest({
    artifacts: inputs,
    ...(options.graphHash !== undefined ? { graphHash: options.graphHash } : {}),
    ...(options.generatedAt !== undefined ? { generatedAt: options.generatedAt } : {}),
    ...(options.counts !== undefined ? { counts: options.counts } : {}),
  });

  const targetPath = join(options.bundleDir, WORKSPACE_MANIFEST_FILENAME);
  mkdirSync(options.bundleDir, { recursive: true });
  writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  return { path: targetPath, manifest };
}
