export type ResolvedDescriptionSource = "inline" | "legacy_inline" | "sidecar";

export interface ResolvedDescription {
  status: "generated" | "insufficient_evidence";
  description: string | null;
  source: ResolvedDescriptionSource;
}

export interface ResolveNodeDescriptionInput {
  node?: Record<string, unknown> | null;
  sidecar?: Record<string, unknown> | null;
  expectedContextHash?: string | null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sidecarContextHash(sidecar: Record<string, unknown>): string | null {
  return (
    nonEmptyString(sidecar.description_context_hash) ??
    nonEmptyString(sidecar.context_hash) ??
    nonEmptyString(record(sidecar.generator)?.description_context_hash)
  );
}

function isSidecarFresh(sidecar: Record<string, unknown>, expectedContextHash?: string | null): boolean {
  if (!expectedContextHash) return true;
  const actual = sidecarContextHash(sidecar);
  return actual === null || actual === expectedContextHash;
}

export function resolveNodeDescription(input: ResolveNodeDescriptionInput): ResolvedDescription | null {
  const node = input.node ?? undefined;
  const inline = node ? nonEmptyString(node.description) : null;
  if (inline) {
    const status = nonEmptyString(node?.description_status);
    if (status !== "pending" && status !== "stale" && status !== "insufficient_evidence") {
      return {
        status: "generated",
        description: inline,
        source: record(node?.description_meta) ? "inline" : "legacy_inline",
      };
    }
  }

  const sidecar = input.sidecar ?? undefined;
  if (!sidecar) return null;
  const status = nonEmptyString(sidecar.status);
  if (status === "pending") return null;
  if (status === "insufficient_evidence") {
    return { status: "insufficient_evidence", description: null, source: "sidecar" };
  }
  if (status !== "generated" || !isSidecarFresh(sidecar, input.expectedContextHash)) return null;
  const sidecarDescription = nonEmptyString(sidecar.description);
  return sidecarDescription
    ? { status: "generated", description: sidecarDescription, source: "sidecar" }
    : null;
}

export function resolveNodeDescriptionText(input: ResolveNodeDescriptionInput): string | null {
  const resolved = resolveNodeDescription(input);
  return resolved?.status === "generated" ? resolved.description : null;
}
