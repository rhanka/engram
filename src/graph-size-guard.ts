/**
 * graph.json memory-bomb cap.
 *
 * Port of `graphify.security._MAX_GRAPH_FILE_BYTES` + `check_graph_file_size_cap`
 * from upstream `safishamsi/graphify` commit `b6127aa` (PR #956).
 *
 * Reject `.graphify/graph.json` payloads larger than the cap before they are
 * JSON-parsed (read) or serialized (write). Without this, a multi-gigabyte
 * graph.json can exhaust process memory during `JSON.parse` + graphology
 * rehydration, or during `JSON.stringify` for very large outputs.
 *
 * The `merge-driver.ts` 50 MiB cap is left intentionally tighter and is not
 * affected by this guard.
 */

import { statSync } from "node:fs";

/** Maximum allowed `graph.json` size on read or write, in bytes. */
export const GRAPH_JSON_MAX_BYTES = 512 * 1024 * 1024; // 512 MiB

export type GraphSizeMode = "read" | "write";

/**
 * Throw if `bytes` exceeds {@link GRAPH_JSON_MAX_BYTES}.
 *
 * The error message mirrors upstream's wording so cross-language operators
 * can pattern-match on it: `graph file <path?> is <bytes> bytes, exceeds
 * <cap> byte cap (<mode>)`. The trailing `(<mode>)` discriminator lets
 * callers tell read-time bombs from write-time bombs in logs.
 */
export function assertGraphJsonSize(
  bytes: number,
  mode: GraphSizeMode,
  path?: string,
): void {
  if (bytes <= GRAPH_JSON_MAX_BYTES) return;
  const target = path ? ` ${path}` : "";
  throw new Error(
    `graph file${target} is ${bytes} bytes, ` +
      `exceeds ${GRAPH_JSON_MAX_BYTES} byte cap (${mode})`,
  );
}

/**
 * Stat `path` and assert its size against {@link GRAPH_JSON_MAX_BYTES}.
 *
 * Silently returns when `statSync` fails (e.g. missing file) — the caller's
 * own existence/path check is expected to surface a clearer error.
 */
export function assertGraphJsonFileSize(
  path: string,
  mode: GraphSizeMode,
): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  assertGraphJsonSize(size, mode, path);
}
