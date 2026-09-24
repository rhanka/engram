import type { AdminEpochReceiptV1, AdminProviderPort, Result } from "./contracts/index.js";

export interface AdminProviderConformanceCasesV1 {
  /** Invoke the provider so it refuses the operation as an authorization DENIAL. */
  authorizationDenial(provider: AdminProviderPort): Promise<Result<AdminEpochReceiptV1>>;
  /** Invoke the provider so it fails for a reason that is NOT an authorization decision. */
  nonAuthorizationFailure(provider: AdminProviderPort): Promise<Result<AdminEpochReceiptV1>>;
  /**
   * REQUIRED. Drive the provider through bootstrap (⇒ receipt R1), then a rotation (⇒ a new authorization epoch,
   * R2), then an operation authorized by the SUPERSEDED R1 epoch. §5.10 requires rotation to invalidate earlier
   * receipts atomically, so this last attempt MUST fail as an authorization denial. Only the caller can drive its
   * own provider through the sequence; the harness invokes it and inspects the third (stale-authorized) attempt.
   * This re-covers the property the retired built-in administrator once held ("old receipts fail after rotation"),
   * now placed where the V2 contract puts credential/epoch semantics: the provider. It is mandatory on purpose — a
   * conformance verdict must never certify a provider whose rotation behavior was never exercised.
   */
  staleReceiptAfterRotation(provider: AdminProviderPort): Promise<Result<AdminEpochReceiptV1>>;
}

function nonConformant(message: string): Result<{ conformant: true }> {
  return { ok: false, error: { code: "INVALID_SCHEMA", operation: "admin", message, retryable: false } };
}

/**
 * §10 conformance for a host-supplied AdminProviderPort (§5.10). The caller supplies scenarios because only it
 * knows how to drive its own provider to each outcome; the harness invokes them and verifies, in BOTH directions:
 * (1) an authorization denial sets `error.denial === true` and a non-authorization failure does NOT; (2) a receipt
 * superseded by a rotation is refused as an authorization denial. This tests the PROVIDER (the engine-side mapping
 * of §5.5(d) is a separate, unconditional guarantee in the engine; the engine has no admin-receipt-validation
 * entry — credential/epoch semantics are the provider's, so this is where the rotation guard lives).
 *
 * All three cases are REQUIRED: a passing verdict certifies the denial invariant AND rotation-invalidation, never a
 * subset — an optional case would let a caller receive `{ conformant: true }` without ever exercising rotation.
 */
export async function assertAdminProviderConformance(
  provider: AdminProviderPort,
  cases: AdminProviderConformanceCasesV1,
): Promise<Result<{ conformant: true }>> {
  // Runtime guard: refuse rather than silently skip if a JS caller bypassed the type and omitted the case.
  if (typeof cases.staleReceiptAfterRotation !== "function") {
    return nonConformant("a full §5.10 certification MUST supply the staleReceiptAfterRotation case (rotation-invalidation is not optional)");
  }
  const denied = await cases.authorizationDenial(provider);
  if (denied.ok) return nonConformant("the authorization-denial scenario must fail, not succeed");
  if (denied.error.denial !== true) return nonConformant("an authorization denial MUST set error.denial === true (§5.10)");
  const failure = await cases.nonAuthorizationFailure(provider);
  if (failure.ok) return nonConformant("the non-authorization-failure scenario must fail, not succeed");
  if (failure.error.denial === true) return nonConformant("a non-authorization failure MUST NOT set error.denial (§5.10)");
  const stale = await cases.staleReceiptAfterRotation(provider);
  if (stale.ok) return nonConformant("an operation authorized by a receipt superseded by rotation MUST fail, not succeed (§5.10: rotation invalidates earlier receipts atomically)");
  if (stale.error.denial !== true) return nonConformant("a refusal of a rotation-superseded receipt MUST be an authorization denial (error.denial === true) (§5.10)");
  return { ok: true, value: { conformant: true } };
}
