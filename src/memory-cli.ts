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
