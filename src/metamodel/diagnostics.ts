import type { LineageId } from "../metamodel-contracts.js";

/**
 * Closed, machine-stable diagnostic catalog for Metamodel v1 validation
 * (Spec 0 §3.2 and §2.5 overlay non-interference).
 */
export const METAMODEL_DIAGNOSTIC_CODES = [
  "MM_SYNTAX_PARSE_ERROR",
  "MM_SYNTAX_NON_PLAIN_OBJECT",
  "MM_SYNTAX_FORBIDDEN_PROTO_KEY",
  "MM_IDENTITY_MISSING_REQUIRED",
  "MM_IDENTITY_UNKNOWN_METAMODEL_VERSION",
  "MM_AUTH_MANDATE_MISSING_OR_INVALID",
  "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
  "MM_VERSION_NOT_EXACT_SEMVER",
  "MM_VERSION_IMMUTABLE_CONFLICT",
  "MM_VERSION_PARENT_PIN_MISSING_OR_MISMATCH",
  "MM_VERSION_REGRESSION",
  "MM_VERSION_MINOR_REQUIRED_FOR_ADDITIVE",
  "MM_VERSION_MAJOR_REQUIRED_FOR_BREAKING",
  "MM_VERSION_UNMAPPED_BREAKING_RENAME",
  "MM_DIGEST_MISMATCH",
  "MM_NODE_EMPTY_SET",
  "MM_NODE_INVALID_IDENTIFIER",
  "MM_NODE_INVALID_REGISTRY_REF",
  "MM_NODE_UNSUPPORTED_LINKING_FN",
  "MM_NODE_INVALID_VISUAL_ENCODING",
  "MM_ATTR_INVALID_DECLARATION",
  "MM_REL_MISSING_ENDPOINTS",
  "MM_REL_UNKNOWN_ENDPOINT_TYPE",
  "MM_REL_INVALID_CARDINALITY",
  "MM_REL_INVALID_HIERARCHY",
  "MM_STATE_INVALID_MACHINE",
  "MM_DOMAIN_POLICY_INVALID",
  "MM_FILE_SHAPE_LINEAGE_FORBIDDEN",
  "MM_FILE_SHAPE_PATH_ESCAPE",
  "MM_FILE_SHAPE_INCOMPLETE_D29_PAIR",
  "MM_COMPOSE_FLOATING_VERSION",
  "MM_COMPOSE_INVALID_DIGEST",
  "MM_COMPOSE_TARGET_NOT_REGISTERED",
  "MM_COMPOSE_DIGEST_MISMATCH",
  "MM_COMPOSE_UNKNOWN_EXTERNAL_TYPE",
  "MM_COMPOSE_EXTERNAL_TYPE_REDEFINITION",
  "MM_COMPOSE_CYCLE_DETECTED",
  "MM_OVERLAY_CROSS_LINEAGE_MUTATION_FORBIDDEN",
  "MM_PRIVACY_DENYLIST_VIOLATION",
  "MM_REGEX_INVALID_UNICODE",
] as const;

/** Stable Metamodel v1 diagnostic code identifier. */
export type MetamodelDiagnosticCode = (typeof METAMODEL_DIAGNOSTIC_CODES)[number];

/** Severity level of a metamodel validation diagnostic. */
export type MetamodelDiagnosticSeverity = "error" | "warning";

/** Structured metamodel diagnostic returned on refusal or warning (Spec 0 §3.2). */
export interface MetamodelDiagnostic {
  readonly code: MetamodelDiagnosticCode;
  readonly severity: MetamodelDiagnosticSeverity;
  readonly path: string;
  readonly lineage: LineageId | null;
  readonly subject: string;
  readonly message: string;
}

const DIAGNOSTIC_CODE_SET: ReadonlySet<string> = new Set(METAMODEL_DIAGNOSTIC_CODES);

/** Returns true when `value` is a recognized `MetamodelDiagnosticCode`. */
export function isMetamodelDiagnosticCode(value: unknown): value is MetamodelDiagnosticCode {
  return typeof value === "string" && DIAGNOSTIC_CODE_SET.has(value);
}

/** Creates an immutable `MetamodelDiagnostic` entry. */
export function createMetamodelDiagnostic(input: MetamodelDiagnostic): MetamodelDiagnostic {
  return Object.freeze({
    code: input.code,
    severity: input.severity,
    path: input.path,
    lineage: input.lineage,
    subject: input.subject,
    message: input.message,
  });
}
