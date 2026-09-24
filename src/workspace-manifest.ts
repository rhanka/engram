/**
 * workspace-bundle-contract-v1 (WP4 / F3) — workspace-manifest builder.
 *
 * The aclp-am peer consumes a *bundle* of graphify outputs (the scene plus its
 * ontology / hierarchy sidecars). Until now each artifact was emitted
 * independently and there was no single descriptor letting the consumer
 * discover and validate the bundle as a whole. This module produces that
 * descriptor: `workspace-manifest.json` (schema `engram_workspace_manifest_v1`).
 *
 * Design constraints (mirrors the signed `workspace-bundle-contract-v1`):
 *   - Pure & deterministic: the builder takes the artifact descriptors and
 *     their bytes; it does no I/O. The emitter (`workspace-manifest-emitter.ts`)
 *     owns the filesystem.
 *   - Additive & honest: every artifact carries an explicit `present` flag and,
 *     when present, a `sha256` content hash + `size_bytes`. A missing artifact
 *     is recorded as `present: false` (NOT silently dropped) so the consumer
 *     can distinguish "not produced" from "I forgot to look".
 *   - Stable ordering: artifacts are sorted by logical `name` so two builds of
 *     the same bundle produce a byte-identical manifest (modulo `generated_at`).
 *   - Schema-pinned: each artifact records the schema id it claims to satisfy,
 *     so the consumer can refuse a bundle whose schema it does not understand.
 *
 * The manifest is a *discovery + integrity* descriptor, not a replacement for
 * any artifact. It carries no graph data of its own.
 */

import { createHash } from "node:crypto";

export const WORKSPACE_MANIFEST_SCHEMA = "engram_workspace_manifest_v1";
export const WORKSPACE_MANIFEST_FILENAME = "workspace-manifest.json";

/**
 * Numeric schema version, separate from the string schema id. The signed
 * contract annotates the manifest with "+schema_version" so the consumer can
 * gate on a monotonic integer (additive bumps) without parsing the schema id.
 */
export const WORKSPACE_MANIFEST_SCHEMA_VERSION = 1 as const;

/**
 * The bundle contract this manifest stamps. `workspace-bundle-contract-v1` is
 * the negotiated contract with the aclp-am peer — signed by both parties and
 * stabilized 2026-06-12 (h2a negotiation `workspace-bundle-contract-v1`,
 * artifactHash sha256:5b08e19d…; the `graphify_principal:"pending"` field inside
 * the proposed contract body is a frozen propose-time snapshot, superseded by
 * graphify's own signature at journal seq2). Stamping the
 * contract id lets the consumer assert WHICH bundle shape it is reading — the
 * artifact set + the join semantics defined by the contract (join on
 * `registry_record_id`; the scene-hierarchies sidecar is authoritative for
 * traversal). The manifest itself carries only discovery + integrity data; the
 * join keys live in the artifacts it lists, not here.
 */
export const WORKSPACE_BUNDLE_CONTRACT = "workspace-bundle-contract-v1";

/** A single bundle artifact as supplied to the builder. */
export interface WorkspaceManifestArtifactInput {
  /** Stable logical name, e.g. "scene", "scene-hierarchies", "hierarchies". */
  name: string;
  /** Path relative to the bundle root (POSIX separators), e.g. "scene.json". */
  path: string;
  /** Schema id the artifact claims, or null when the artifact is schemaless. */
  schema: string | null;
  /**
   * Raw bytes of the artifact, or null/undefined when the artifact was not
   * produced. A null value yields `present: false` with no hash.
   */
  bytes?: Buffer | string | null;
  /** Optional free-form role hint for the consumer (e.g. "consumption"). */
  role?: string;
}

/** A single artifact entry as written into the manifest. */
export interface WorkspaceManifestArtifact {
  name: string;
  path: string;
  schema: string | null;
  present: boolean;
  /** sha256 hex of the bytes, or null when absent. */
  sha256: string | null;
  /** Byte length, or null when absent. */
  size_bytes: number | null;
  /** Present only when supplied. */
  role?: string;
}

export interface WorkspaceManifest {
  schema: typeof WORKSPACE_MANIFEST_SCHEMA;
  /** Monotonic integer schema version (contract "+schema_version"). */
  schema_version: typeof WORKSPACE_MANIFEST_SCHEMA_VERSION;
  contract: typeof WORKSPACE_BUNDLE_CONTRACT;
  generated_at: string;
  /** Optional graph hash linking the bundle to a graph.json snapshot. */
  graph_hash: string | null;
  /** Count of artifacts with `present: true`. */
  present_count: number;
  /**
   * Node-count coherence stamp. The bundle's three node-bearing artifacts must
   * describe the SAME entity set; recording each count makes a divergence
   * auditable from the manifest alone, without re-parsing 100+ MB of JSON.
   * Omitted when the producer did not measure them.
   */
  counts?: WorkspaceManifestCounts;
  /** Artifacts, sorted by `name`. */
  artifacts: WorkspaceManifestArtifact[];
}

/** Per-artifact node counts stamped on the manifest (coherence gate). */
export interface WorkspaceManifestCounts {
  /** `graph.json` → `nodes.length`. */
  graph_nodes: number;
  /** `scene.json` → `nodes.length`. */
  scene_nodes: number;
  /** `entities.json` → number of indexed entity ids. */
  entities: number;
  /** True when all three agree — the invariant the build gate enforces. */
  coherent: boolean;
}

export interface BuildWorkspaceManifestOptions {
  artifacts: WorkspaceManifestArtifactInput[];
  /** Optional graph hash stamped on the envelope. */
  graphHash?: string | null;
  /** Override the timestamp (tests / reproducible builds). */
  generatedAt?: string;
  /**
   * Measured node counts. `coherent` is DERIVED here (never trusted from the
   * caller) so the manifest cannot claim coherence its own numbers refute.
   */
  counts?: Omit<WorkspaceManifestCounts, "coherent">;
}

function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function byteLength(bytes: Buffer | string): number {
  return Buffer.isBuffer(bytes) ? bytes.length : Buffer.byteLength(bytes, "utf-8");
}

/**
 * Build the `engram_workspace_manifest_v1` descriptor. Pure and
 * deterministic: identical artifact inputs (same names/paths/schemas/bytes)
 * produce an identical manifest, except for `generated_at` when not pinned.
 *
 * Throws on a duplicate logical `name` so the bundle cannot silently shadow an
 * artifact (the consumer indexes by name).
 */
export function buildWorkspaceManifest(
  options: BuildWorkspaceManifestOptions,
): WorkspaceManifest {
  const seen = new Set<string>();
  const artifacts: WorkspaceManifestArtifact[] = options.artifacts.map((input) => {
    if (seen.has(input.name)) {
      throw new Error(`workspace-manifest: duplicate artifact name "${input.name}"`);
    }
    seen.add(input.name);

    const present = input.bytes !== undefined && input.bytes !== null;
    const entry: WorkspaceManifestArtifact = {
      name: input.name,
      path: input.path,
      schema: input.schema,
      present,
      sha256: present ? sha256Hex(input.bytes as Buffer | string) : null,
      size_bytes: present ? byteLength(input.bytes as Buffer | string) : null,
    };
    if (input.role !== undefined) entry.role = input.role;
    return entry;
  });

  // Deterministic order: by logical name (stable across builds).
  artifacts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    schema: WORKSPACE_MANIFEST_SCHEMA,
    schema_version: WORKSPACE_MANIFEST_SCHEMA_VERSION,
    contract: WORKSPACE_BUNDLE_CONTRACT,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    graph_hash: options.graphHash ?? null,
    present_count: artifacts.filter((a) => a.present).length,
    ...(options.counts
      ? {
          counts: {
            ...options.counts,
            coherent:
              options.counts.graph_nodes === options.counts.scene_nodes &&
              options.counts.scene_nodes === options.counts.entities,
          },
        }
      : {}),
    artifacts,
  };
}
