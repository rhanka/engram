/**
 * GraphStore port — narrow interface for opt-in graph mirrors
 * (SPEC_STORAGE_BACKENDS.md, "GraphStore Port"). `.graphify/graph.json`
 * stays the source of truth; every backend is a pushed projection, never a
 * source. Signatures here are normative for the storage layer.
 */
import type Graph from "graphology";

export interface GraphStoreCapabilities {
  push: true;
  query: boolean;
  clear: boolean;
  snapshotMeta: boolean;
}

export interface GraphPushOptions {
  /** merge = idempotent upsert (default); replace = clear namespace then load */
  mode?: "merge" | "replace";
  /** statements batched per request; default 500 */
  batchSize?: number;
  /** plan and report without writing to the backend */
  dryRun?: boolean;
  /** target namespace; default derived from the project */
  namespace?: string;
}

export interface GraphPushResult {
  nodes: number;
  edges: number;
  warnings: string[];
  durationMs: number;
}

export interface GraphStoreSnapshotMeta {
  topologySignature: string;
  pushedAt: string;
  toolVersion: string;
}

export interface GraphStore {
  readonly id: string;
  readonly capabilities: GraphStoreCapabilities;
  verifyConnection(): Promise<void>;
  pushGraph(
    G: Graph,
    communities: Map<number, string[]>,
    options?: GraphPushOptions,
  ): Promise<GraphPushResult>;
  readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined>;
  clear?(namespace?: string): Promise<void>;
  query?(statement: string): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Minimal store configuration for PR2. The full `storage:` YAML schema and
 * env resolution land in PR4; until then the port only needs a backend
 * target and a default namespace. Credentials are environment-only and never
 * part of this object (SPEC_STORAGE_BACKENDS.md, "Secret Handling").
 */
export interface GraphStoreConfig {
  /** Backend-specific target: a file path for `file`, a URI for live backends. */
  target?: string;
  /** Default namespace for pushes; derived from the project when omitted. */
  namespace?: string;
}

/**
 * Test-only injection point: a fake driver module used instead of the
 * dynamic import of `GraphStoreFactory.requiredPackage`, mirroring the LLM
 * execution ports injection pattern. Production code never passes this.
 */
export interface StoreTestDeps {
  driverModule?: unknown;
}
