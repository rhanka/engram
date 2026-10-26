// §6 application receipt (closed; data only).
import type { Digest, GuardianDiagnostic } from "./types.js";

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
  readonly effectiveProfile?: unknown;
  readonly pins?: import("./types.js").PinList;
  readonly pinsDigest?: Digest;
  readonly resultDigest?: Digest;
  readonly bindingChanges: readonly string[];
  readonly staleArtifacts: readonly string[];
  readonly nextRebuild: string;
}

