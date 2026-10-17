/**
 * @experimental — provisional elicitation policy + manifest extension (F8).
 *
 * R1b (BR-42l): relocated OUT of the frozen `manifest.ts`. `ElicitationPolicy` is
 * ARCHITECT-GATED and provisional (F8), so a read-only frozen `AppMcpProviderManifest`
 * never declares elicitation policy. Mutation-capable hosts re-attach it here via
 * `AppMcpProviderManifestWithElicitation` — an experimental extension, NOT frozen.
 */
import type { AppMcpProviderManifest } from '../manifest.js';

// Elicitation interaction modes (mirrors src/elicitation.ts ElicitationMode).
export type ElicitationPolicyMode = 'form' | 'confirm' | 'consent' | 'url' | 'credential';

/**
 * Elicitation policy declared at manifest level (§4.2 `elicitation?`). Closed
 * shape: a discovery-time default that links a capability to a typed elicitation
 * mode/TTL + the §5 typed request/response and §5.2(b) secret-safety metadata.
 * Per-capability `gates.requiresElicitation` remains authoritative; a policy here
 * never relaxes a stricter per-capability gate.
 *
 * PROVISIONAL (fix F8): the FINAL canonical ElicitationPolicy shape is
 * ARCHITECT-GATED and parked. The §5 fields below are strengthened provisionally
 * to capture typed request/response and secret-safety; they are NOT a frozen
 * contract and MAY change when the architect ratifies the canonical shape.
 */
export type ElicitationPolicy = {
  capabilityRef: string; // capability name within the manifest
  mode: ElicitationPolicyMode;
  ttlSeconds: number;
  required: boolean;
  // §5 typed request/response payloads (JSON Schema, closed at the adapter).
  requestSchema?: unknown;
  responseSchema?: unknown;
  // §5.2(b) secret-safety: `form` mode MUST NOT carry secrets — sensitive
  // credential entry MUST use `url`/`credential` mode (which does not transit the
  // MCP client). `carriesSecrets` MUST be false/omitted for `form` mode.
  carriesSecrets?: boolean;
  // §5.2(a) anti-phishing binding hints (bind to BOTH MCP client and sub).
  bindToClient?: boolean;
  bindToSub?: boolean;
};

/**
 * Experimental manifest extension that re-adds `elicitation?` for mutation-capable
 * hosts (§4.2). The frozen `AppMcpProviderManifest` (root `.`) carries NO
 * `elicitation?`; hosts that declare elicitation policy widen to this type. Stays
 * `@experimental` until the architect ratifies the canonical `ElicitationPolicy`.
 */
export type AppMcpProviderManifestWithElicitation = AppMcpProviderManifest & {
  elicitation?: ElicitationPolicy[];
};

/**
 * Provisional §5.2(b) invariant check: a `form`-mode elicitation MUST NOT carry
 * secrets. Returns false for any policy that violates the secret-safety rule.
 * (Provisional — final canonical validation is architect-gated, see F8.)
 */
export function elicitationPolicyIsSecretSafe(policy: ElicitationPolicy): boolean {
  return !(policy.mode === 'form' && policy.carriesSecrets === true);
}
