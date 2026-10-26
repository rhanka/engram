// §6 application receipt (closed; data only).
import type { Digest } from "./types.js";

export type ValidatorRole = "transitional-oracle" | "retained-check" | "qualified-ds-execution";

export type TargetKind = "repo" | "graph" | "diagram" | "view";

export type ApplicationResult = "valid" | "invalid" | "preserved-unvalidated";

export interface ApplicationReceipt {
  readonly ontologyId: string;
  readonly version: string;
  readonly contentDigest: Digest;
  readonly pinsDigest: Digest;
  readonly resultDigest: Digest;
  readonly targetKind: TargetKind;
  readonly targetRef: string;
  readonly targetDigest: Digest;
  readonly validator: {
    readonly role: ValidatorRole;
    readonly implementationId: string;
    readonly implementationVersion: string;
  };
  readonly result: ApplicationResult;
  readonly diagnostics: readonly import("./diagnostics.js").Diagnostic[];
  /** S-REPORT2 Report whole, unchanged; absent where no Report/2 run produced one. */
  readonly report?: import("./diagnostics.js").NativeReport;
}

export interface ApplyPreview {
  readonly effectiveProfile: unknown;
  readonly bindingChanges: readonly string[];
  readonly staleArtifacts: readonly string[];
  readonly nextRebuild: string;
}

/** §6.1 does not freeze the private pins/digests/receipts container's keys.
 * That representation is unverified and cannot be constructed here. */
export type PrivateApplyPreview = never;

