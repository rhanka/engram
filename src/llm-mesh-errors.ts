/**
 * Mesh-free error helpers and attempt-tracking WeakMap shared between
 * `src/llm-mesh-core.ts`, `src/llm-mesh-bridge.ts`, and `src/scrap/extract.ts`
 * without pulling `@sentropic/llm-mesh` into mesh-free callers.
 */

export interface MeshAttemptCall {
  providerId: string;
  modelId: string;
}

const meshErrorAttempts = new WeakMap<object, MeshAttemptCall[]>();

export function recordMeshErrorAttempts(
  error: unknown,
  attempts: MeshAttemptCall[],
): void {
  if (error && typeof error === "object") {
    meshErrorAttempts.set(error, attempts);
  }
}

export const getMeshErrorAttempts = (
  error: unknown,
): MeshAttemptCall[] | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const tracked = meshErrorAttempts.get(error);
  if (tracked !== undefined) return tracked;
  const audit = (error as { audit?: unknown }).audit;
  if (
    audit &&
    typeof audit === "object" &&
    !Array.isArray(audit) &&
    (audit as { mesh?: unknown }).mesh === true &&
    Array.isArray((audit as { attempts?: unknown }).attempts)
  ) {
    return (audit as { attempts: MeshAttemptCall[] }).attempts;
  }
  return undefined;
};

export const isRoutePlanError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    !Array.isArray(error) &&
    (error as { name?: unknown }).name === "RoutePlanError",
  );

export function isSeatAcquisitionError(error: unknown): boolean {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return (
    code === "no_account" ||
    code === "no_active_account" ||
    code === "access-unavailable" ||
    /AccountTransportAcquireError|RefreshDeferredError|Token refresh (deferred|failed)|reauthentication required/i.test(
      error instanceof Error ? error.message : String(error),
    )
  );
}
