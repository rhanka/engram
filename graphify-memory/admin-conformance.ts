import type { AdminEpochReceiptV1, AdminProviderPort, Result } from "./contracts/index.js";

export interface AdminProviderConformanceCasesV1 {
  /** Invoke the provider so it refuses the operation as an authorization DENIAL. */
  authorizationDenial(provider: AdminProviderPort): Promise<Result<AdminEpochReceiptV1>>;
  /** Invoke the provider so it fails for a reason that is NOT an authorization decision. */
  nonAuthorizationFailure(provider: AdminProviderPort): Promise<Result<AdminEpochReceiptV1>>;
}

function nonConformant(message: string): Result<{ conformant: true }> {
  return { ok: false, error: { code: "INVALID_SCHEMA", operation: "admin", message, retryable: false } };
}

/**
 * §10 conformance for a host-supplied AdminProviderPort (§5.10): the provider MUST set `error.denial === true`
 * on an authorization denial and MUST NOT set it on any failure that is not an authorization decision. The
 * caller supplies the two scenarios because only it knows how to drive its own provider to each outcome; the
 * harness invokes them and verifies the `denial` invariant in BOTH directions. This tests the PROVIDER (the
 * engine-side mapping of §5.5(d) is a separate, unconditional guarantee in the engine).
 */
export async function assertAdminProviderConformance(
  provider: AdminProviderPort,
  cases: AdminProviderConformanceCasesV1,
): Promise<Result<{ conformant: true }>> {
  const denied = await cases.authorizationDenial(provider);
  if (denied.ok) return nonConformant("the authorization-denial scenario must fail, not succeed");
  if (denied.error.denial !== true) return nonConformant("an authorization denial MUST set error.denial === true (§5.10)");
  const failure = await cases.nonAuthorizationFailure(provider);
  if (failure.ok) return nonConformant("the non-authorization-failure scenario must fail, not succeed");
  if (failure.error.denial === true) return nonConformant("a non-authorization failure MUST NOT set error.denial (§5.10)");
  return { ok: true, value: { conformant: true } };
}
