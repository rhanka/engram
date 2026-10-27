/**
 * Diagnostics: every refusal in this package names itself.
 *
 * The rule the whole package follows is that a rejection is USELESS unless the
 * caller can tell WHY, WHERE and ABOUT WHAT. So there is no boolean validity
 * anywhere: validation returns diagnostics, and a transaction that refuses
 * returns the diagnostics that made it refuse. The nine named rejected cases of
 * SPEC 3.7 are nine codes below, and each one is asserted by a test against a
 * fixture - the test asserts the CODE, not merely the failure.
 */

/** Stable, machine-readable refusal codes. Additive; never renamed in place. */
export type DiagnosticCode =
  // --- The nine named rejected cases of SPEC 3.7 -------------------------
  /** A reference resolves to nothing in its namespace. */
  | "dangling-reference"
  /** A well-formed reference of the wrong namespace (occurrence where entity was required, …). */
  | "reference-type-mismatch"
  /** A relation type declared `shape: "tree"` closes a cycle. */
  | "hierarchy-cycle"
  /** An attribute name absent from the effective schema of the element's type. */
  | "attribute-not-in-schema"
  /** A quantity without its unit. A number alone is not a quantity. */
  | "quantity-unit-missing"
  /** A bounded collection above its `maxItems` or below its `minItems`. */
  | "collection-bound-exceeded"
  /** A stored schema major this build does not know: refused for WRITE, kept for inspection. */
  | "unknown-schema-major"
  /** A command's `baseRevision` is not the state's revision. Carries expected and seen. */
  | "revision-conflict"
  /** An extension at validation level `unsupported`: preserved on import, never promoted. */
  | "extension-unsupported"
  // --- Structure and identity -------------------------------------------
  | "malformed-ref"
  | "duplicate-id"
  | "record-key-mismatch"
  | "schema-version-malformed"
  | "schema-migration-required"
  | "document-not-an-object"
  // --- Profiles and types -----------------------------------------------
  | "unknown-profile"
  | "profile-not-declared"
  | "unknown-entity-type"
  | "unknown-relation-type"
  | "unknown-port-type"
  | "type-definition-conflict"
  // --- Attributes --------------------------------------------------------
  | "attribute-type-mismatch"
  | "attribute-required-missing"
  | "enum-value-not-allowed"
  | "quantity-unit-not-allowed"
  | "text-too-long"
  | "date-not-iso8601"
  | "unique-attribute-violation"
  // --- Relations and ports ----------------------------------------------
  | "endpoint-role-unknown"
  | "endpoint-cardinality-violation"
  | "endpoint-target-not-allowed"
  | "hierarchy-multiple-parents"
  | "port-direction-not-allowed"
  | "port-owner-mismatch"
  // --- Views and occurrences --------------------------------------------
  | "view-document-mismatch"
  | "revision-divergence"
  | "occurrence-endpoint-mismatch"
  | "value-not-finite"
  | "value-not-serialisable"
  // --- Limits and constraints -------------------------------------------
  | "limit-exceeded"
  // --- Commands ----------------------------------------------------------
  | "unknown-command"
  | "target-already-exists"
  | "target-missing"
  | "delete-policy-required"
  | "delete-policy-refused"
  | "placement-kind-mismatch"
  | "inverse-budget-exceeded"
  | "extension-hash-mismatch"
  | "extension-source-not-retained"
  | "view-already-exists";

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  /** Where, as a dotted path into the document or view (`entities.entity:n1.attributes.size`). */
  readonly path: string;
  readonly message: string;
  /** The references the diagnostic is about, raw, so a caller can highlight them. */
  readonly refs?: readonly string[];
  /** Scalar facts a caller may act on (expected/seen revisions, bounds, kinds). */
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface DiagnosticInput {
  readonly code: DiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly severity?: DiagnosticSeverity;
  readonly refs?: readonly string[];
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * `severity` defaults to `error` because a diagnostic that does not block is the
 * exception here, not the rule.
 */
export function diagnostic(input: DiagnosticInput): Diagnostic {
  return {
    code: input.code,
    severity: input.severity ?? "error",
    path: input.path,
    message: input.message,
    ...(input.refs === undefined ? {} : { refs: input.refs }),
    ...(input.details === undefined ? {} : { details: input.details }),
  };
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((entry) => entry.severity === "error");

export const errorsOf = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
  diagnostics.filter((entry) => entry.severity === "error");

export const codesOf = (diagnostics: readonly Diagnostic[]): readonly DiagnosticCode[] =>
  diagnostics.map((entry) => entry.code);

/** One line per diagnostic, for a message a human reads in a failed gate. */
export const formatDiagnostics = (diagnostics: readonly Diagnostic[]): string =>
  diagnostics.map((entry) => `${entry.severity} ${entry.code} at ${entry.path}: ${entry.message}`).join("\n");
