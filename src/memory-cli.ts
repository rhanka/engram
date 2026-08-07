/**
 * `graphify memory admit|recall` runner logic (operational slice item-3b). The
 * store, source resolver, and clock are INJECTED so the runner is unit-testable
 * offline; the CLI command supplies the real Postgres operational store + a
 * file-path source resolver. graphify-INTERNAL glue: it may import storage +
 * factory, but NEVER h2a (anti-cycle — graphify never imports h2a).
 *
 * Deterministic, provider-neutral, no LLM. graphify authors NO memory — it admits
 * a caller-built note and recalls what the store holds (§3.2).
 */
import { createMemoryPortForStore, type MemoryOperationalStore } from "./memory-factory.js";
import type { MemoryContext, MemoryNoteInput, MemoryRecallQuery } from "./memory-producer-port.js";
import type { GraphStore } from "./storage/types.js";

export interface MemoryCliDeps {
  /** The operational store (append + read-back) memory reads/writes through. */
  store: MemoryOperationalStore;
  /** Resolve a cited source locator to its raw text for verifyVerbatim (§4). */
  resolveSource: (ref: string) => string | null;
  /** Clock for promotion stamps (injected for determinism/tests). */
  now?: () => number;
}

export interface MemoryCliResult {
  /** false ⇒ the operation was refused (admission failed); the CLI exits non-zero. */
  ok: boolean;
  /** Human-readable one-liner(s). */
  text: string;
  /** Machine payload for `--json`. */
  json: unknown;
}

/** Admit ONE caller-built note through the operational port (writes to the store). */
export async function runMemoryAdmit(
  note: MemoryNoteInput,
  ctx: MemoryContext,
  deps: MemoryCliDeps,
): Promise<MemoryCliResult> {
  const port = createMemoryPortForStore(deps.store, { resolveSource: deps.resolveSource, now: deps.now });
  const out = await port.admitMemoryNote(note, ctx);
  return out.admitted
    ? { ok: true, text: `admitted ${out.id} (review_status: pending)`, json: { admitted: true, id: out.id } }
    : { ok: false, text: `refused: ${out.reason}`, json: { admitted: false, reason: out.reason } };
}

/** Recall the notes VISIBLE to ctx at the requested instant/window (§3.6 filtered). */
export async function runMemoryRecall(
  query: MemoryRecallQuery,
  ctx: MemoryContext,
  deps: MemoryCliDeps,
): Promise<MemoryCliResult> {
  const port = createMemoryPortForStore(deps.store, { resolveSource: deps.resolveSource, now: deps.now });
  const res = await port.recallMemory(query, ctx);
  const lines = res.notes.map((n) => {
    const r = n as Record<string, unknown>;
    return `${String(r.id)}  [${String(r.memory_kind ?? "?")}]  ${String(r.subject ?? "")}  trust=${String(r.trust)}  review=${String(r.review_status)}`;
  });
  return { ok: true, text: lines.length > 0 ? lines.join("\n") : "(no notes recalled)", json: res };
}

// ---------------------------------------------------------------------------
// CLI command wiring — resolve the live Postgres operational store from
// flags/env/config (mirrors the `recall` command's resolution) and a file-path
// source resolver, then delegate to the pure runners above. Store construction +
// fs live here; the runners stay pure + unit-tested.
// ---------------------------------------------------------------------------

/** Resolve the operational store from --store / GRAPHIFY_STORE / config, guarding
 *  the memory capabilities (append + read-back v1). Returns the GraphStore so the
 *  caller can close() it. */
async function openMemoryStore(opts: { store?: string; config?: string }): Promise<GraphStore> {
  const { resolve } = await import("node:path");
  const { loadProjectConfig } = await import("./project-config.js");
  const { resolveStoreConfig } = await import("./storage/config.js");
  const { resolveGraphStore } = await import("./storage/registry.js");
  const env = process.env;
  const projectConfig = opts.config ? loadProjectConfig(resolve(opts.config)) : undefined;
  const storeId = opts.store ?? env.GRAPHIFY_STORE ?? projectConfig?.storage?.mirrors?.[0]?.backend;
  if (!storeId) {
    throw new Error(
      "memory needs a store: set GRAPHIFY_STORE (and GRAPHIFY_POSTGRES_URL for postgres) or pass --store <id>",
    );
  }
  const storeConfig = resolveStoreConfig(storeId, { projectConfig, env });
  const store = await resolveGraphStore(storeId, storeConfig);
  if (store.capabilities.append?.version !== 1 || store.capabilities.readback?.version !== 1) {
    throw new Error(
      `store '${storeId}' lacks the memory capabilities (append + read-back v1) — ` +
        "agent memory requires a Postgres backend (§9.5).",
    );
  }
  return store;
}

/** provenance.source is a FILE path; verifyVerbatim (§4) checks the cited string
 *  appears in its text. Unreadable → null (admission refuses the note). */
function fileResolveSource(readFileSync: (p: string, enc: "utf8") => string): (ref: string) => string | null {
  return (ref) => {
    try {
      return readFileSync(ref, "utf8");
    } catch {
      return null;
    }
  };
}

/** `graphify memory admit` — read ONE note JSON (--file or stdin), admit it. */
export async function runMemoryAdmitCommand(opts: {
  file?: string;
  store?: string;
  config?: string;
}): Promise<MemoryCliResult> {
  const { readFileSync } = await import("node:fs");
  const raw = opts.file ? readFileSync(String(opts.file), "utf8") : readFileSync(0, "utf8");
  const note = JSON.parse(raw) as MemoryNoteInput;
  const principal = String((note as { principal_owner?: unknown }).principal_owner ?? "");
  const store = await openMemoryStore(opts);
  try {
    return await runMemoryAdmit(note, { principal_owner: principal }, {
      store: store as unknown as MemoryOperationalStore,
      resolveSource: fileResolveSource(readFileSync),
    });
  } finally {
    await store.close();
  }
}

/** `graphify memory recall` — recall the notes visible to --principal at --as-of / window. */
export async function runMemoryRecallCommand(opts: {
  principal: string;
  asOf?: string;
  since?: string;
  until?: string;
  store?: string;
  config?: string;
}): Promise<MemoryCliResult> {
  const { parseRecallTimestamp } = await import("./temporal-recall.js");
  const query: MemoryRecallQuery =
    opts.asOf !== undefined
      ? { asOf: parseRecallTimestamp(opts.asOf) }
      : {
          window: {
            sinceMs: opts.since !== undefined ? parseRecallTimestamp(opts.since) : null,
            untilMs: opts.until !== undefined ? parseRecallTimestamp(opts.until) : null,
          },
        };
  const store = await openMemoryStore(opts);
  try {
    return await runMemoryRecall(query, { principal_owner: opts.principal }, {
      store: store as unknown as MemoryOperationalStore,
      resolveSource: () => null,
    });
  } finally {
    await store.close();
  }
}
