/**
 * FileGraphStore — reference GraphStore implementation
 * (SPEC_STORAGE_BACKENDS.md, "Store Registry And Driver Loading"). It
 * "pushes" the graph to a JSON file through the canonical graph.json
 * serialization, so contract tests and dryRun/staleness logic run without
 * any backend driver.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Graph from "graphology";
import { toJson } from "../export.js";
import type {
  GraphPushOptions,
  GraphPushResult,
  GraphStore,
  GraphStoreConfig,
  GraphStoreSnapshotMeta,
} from "./types.js";

function moduleDir(): string {
  if (typeof __dirname === "string") return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

function resolveToolVersion(): string {
  // Source layout: src/storage -> ../../package.json; bundled layout:
  // dist -> ../package.json. The name check guards against picking up an
  // unrelated package.json.
  const baseDir = moduleDir();
  for (const rel of [join("..", ".."), ".."]) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(baseDir, rel, "package.json"), "utf-8"),
      ) as { name?: string; version?: string };
      if (pkg.name === "@sentropic/graphify" && pkg.version) return pkg.version;
    } catch {
      /* try the next layout */
    }
  }
  return "unknown";
}

export interface FileStoreClearOptions {
  namespace?: string;
  force?: boolean;
}

/**
 * File store with the port-mandated surface plus a force-gated clear:
 * deleting the mirror is destructive, so `clear` refuses unless the caller
 * passes `{ force: true }` (a bare namespace string never forces).
 */
export interface FileGraphStore extends GraphStore {
  clear(namespaceOrOptions?: string | FileStoreClearOptions): Promise<void>;
}

export function createFileGraphStore(config: GraphStoreConfig): FileGraphStore {
  const target = config.target;
  if (!target) {
    throw new Error("file store requires config.target (path of the graph.json mirror)");
  }

  return {
    id: "file",
    capabilities: { push: true, query: false, clear: true, snapshotMeta: true },

    async verifyConnection(): Promise<void> {
      if (existsSync(target) && statSync(target).isDirectory()) {
        throw new Error(
          `file store target '${target}' is a directory, expected a JSON file path`,
        );
      }
    },

    async pushGraph(
      G: Graph,
      communities: Map<number, string[]>,
      options: GraphPushOptions = {},
    ): Promise<GraphPushResult> {
      const start = Date.now();
      // The file backend has a single write primitive: rewriting the target
      // file. A push therefore always has replace semantics; mode "merge" is
      // accepted and equivalent, because rewriting the same data is exactly
      // the idempotent upsert the port requires.
      const nodes = G.order;
      const edges = G.size;
      if (!options.dryRun) {
        mkdirSync(dirname(target), { recursive: true });
        // Delegate to the canonical graph.json serialization (same writer the
        // build pipeline uses); force bypasses the shrink guard because a
        // store push is an explicit mirror write.
        toJson(G, communities, target, { force: true });
      }
      return { nodes, edges, warnings: [], durationMs: Date.now() - start };
    },

    async readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined> {
      if (!existsSync(target)) return undefined;
      let signature: unknown;
      try {
        const parsed = JSON.parse(readFileSync(target, "utf-8")) as {
          topology_signature?: unknown;
        };
        signature = parsed.topology_signature;
      } catch {
        return undefined;
      }
      if (typeof signature !== "string" || signature.length === 0) return undefined;
      // The mirror file is its own GraphifyMeta record: the embedded
      // topology_signature identifies the snapshot, the file mtime is the
      // push time, and this tool is the writer.
      return {
        topologySignature: signature,
        pushedAt: statSync(target).mtime.toISOString(),
        toolVersion: resolveToolVersion(),
      };
    },

    async clear(namespaceOrOptions?: string | FileStoreClearOptions): Promise<void> {
      const options = typeof namespaceOrOptions === "string"
        ? { namespace: namespaceOrOptions }
        : namespaceOrOptions ?? {};
      if (!options.force) {
        throw new Error(
          `refusing to clear file store '${target}'; pass { force: true } to delete the mirror`,
        );
      }
      // Single-file backend: every namespace maps onto the one target file.
      rmSync(target, { force: true });
    },

    async close(): Promise<void> {
      // Nothing to release; safe to call multiple times.
    },
  };
}
