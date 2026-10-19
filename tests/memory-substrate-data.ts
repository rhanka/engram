// Data-only inputs shared by checkout and installed-package acceptance.
export const NOW = "2026-08-16T12:34:56.789Z";
const DEADLINE = "2026-08-16T12:40:00.000Z";
export const DIGEST = `sha256:${"a".repeat(64)}` as const;
export function lifecycleCommand(operation: "dispute" | "resolve_dispute" | "expire" | "mark_non_current" | "trust_invalidate" | "tombstone", record_id: string, event_id = `event:${operation}`) {
  return {
    operation, event_id, record_id, reason_ref: `reason:${operation}`,
    event_anchor: { occurred_at: NOW, kind_ref: `kind:${operation}`, provenance_ref: "citation:l3", provenance_digest: DIGEST },
    authorization: { credential: "credential:l3" }, deadline_at: DEADLINE,
  } as const;
}
