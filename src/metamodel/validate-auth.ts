import type { H2AMandateEnvelope, LineageId } from "../metamodel-contracts.js";
import { isRecord } from "../profile-validate.js";
import type { MetamodelAuthContext } from "./types.js";
import { addError, isNonEmptyString, isSha256Digest, type ValidationSink } from "./validate-common.js";

const VALID_MANDATE_SIGNER_ROLES = new Set(["PRINCIPAL", "EXECUTIF"]);

const DEFAULT_LOCKED_TEMPLATES: ReadonlyArray<{
  readonly lineage: LineageId;
  readonly templateId: string;
  readonly templateVersion: string;
}> = [{ lineage: "archi", templateId: "archi", templateVersion: "1.0.0" }];

function checkLockedTemplate(
  lineage: LineageId | null,
  id: string | null,
  version: string | null,
  auth: MetamodelAuthContext,
  sink: ValidationSink,
): void {
  if (lineage === null || id === null || version === null) return;
  const locked = [...DEFAULT_LOCKED_TEMPLATES, ...(auth.lockedTemplates ?? [])];
  if (locked.some((entry) => entry.lineage === lineage && entry.templateId === id && entry.templateVersion === version)) {
    addError(
      sink,
      "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
      "version",
      `Template ${lineage}:${id}@${version} is locked immutable`,
    );
  }
}

function validateMandateShape(
  typedMandate: H2AMandateEnvelope,
  auth: MetamodelAuthContext,
  sink: ValidationSink,
): void {
  if (auth.artifactKind !== undefined && auth.artifactKind !== "MANDATE") {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.artifactKind",
      `Expected MANDATE artifactKind (got ${auth.artifactKind})`,
    );
  }
  if (auth.bodyKind !== undefined && auth.bodyKind !== "MANDATE") {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.bodyKind",
      `Expected MANDATE bodyKind (got ${auth.bodyKind})`,
    );
  }
  if (
    !isNonEmptyString(typedMandate.mandateId) ||
    !isNonEmptyString(typedMandate.instance) ||
    !isNonEmptyString(typedMandate.scope) ||
    !isSha256Digest(typedMandate.envelopeDigest)
  ) {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate",
      "writerMandate is missing required identity or Sha256Digest fields",
    );
  }
  if (typeof typedMandate.role !== "string" || !VALID_MANDATE_SIGNER_ROLES.has(typedMandate.role)) {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.role",
      `writerMandate role must be PRINCIPAL or EXECUTIF (got ${String(typedMandate.role)})`,
    );
  }
  if (
    !Array.isArray(typedMandate.signatures) ||
    typedMandate.signatures.length === 0 ||
    typedMandate.signatures.some(
      (sig) => !isRecord(sig) || !isNonEmptyString(sig.by) || !isNonEmptyString(sig.alg) || !isNonEmptyString(sig.value),
    )
  ) {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.signatures",
      "writerMandate requires at least one well-formed signature",
    );
  }
}

function validateMandateExpiryAndSignature(
  typedMandate: H2AMandateEnvelope,
  auth: MetamodelAuthContext,
  sink: ValidationSink,
): void {
  if (typedMandate.expiresAt !== undefined) {
    const expiresMs = typeof typedMandate.expiresAt === "string" ? Date.parse(typedMandate.expiresAt) : Number.NaN;
    const nowMs =
      auth.now === undefined
        ? Date.now()
        : typeof auth.now === "number"
          ? auth.now
          : Date.parse(auth.now);
    if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs) || expiresMs <= nowMs) {
      addError(
        sink,
        "MM_AUTH_MANDATE_MISSING_OR_INVALID",
        "auth.writerMandate.expiresAt",
        "writerMandate is expired or carries an invalid expiresAt timestamp",
      );
    }
  }
  if (auth.verifySignature !== undefined) {
    let verified = false;
    try {
      verified = auth.verifySignature(typedMandate) === true;
    } catch {
      verified = false;
    }
    if (!verified) {
      addError(
        sink,
        "MM_AUTH_MANDATE_MISSING_OR_INVALID",
        "auth.writerMandate.signatures",
        "writerMandate cryptographic signature verification failed",
      );
    }
  }
}

function validateMandateLineageRights(
  lineage: LineageId | null,
  typedMandate: H2AMandateEnvelope,
  auth: MetamodelAuthContext,
  sink: ValidationSink,
): void {
  if (!Array.isArray(typedMandate.rights) || !typedMandate.rights.every((right) => isNonEmptyString(right))) {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.rights",
      "writerMandate rights must be an array of non-empty strings",
    );
    return;
  }

  if (lineage !== "track" && lineage !== "h2a") return;

  const requiredRight = `engram:register-template:${lineage}`;
  const expectedProvider = lineage === "track" ? "sentropic.track" : "sentropic.h2a";
  const registrationRights = typedMandate.rights.filter((r) => r.startsWith("engram:register-template:"));
  if (registrationRights.length === 0) {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate.rights",
      `writerMandate lacks template registration right ${requiredRight}`,
    );
  } else if (!registrationRights.includes(requiredRight)) {
    addError(
      sink,
      "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
      "auth.writerMandate.rights",
      `writerMandate right does not authorize sole-author registration for lineage ${lineage}`,
    );
  }
  if (auth.callerProvider !== undefined && auth.callerProvider !== expectedProvider) {
    addError(
      sink,
      "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
      "auth.callerProvider",
      `Caller provider ${auth.callerProvider} is not sole author ${expectedProvider} for lineage ${lineage}`,
    );
  }
}

export function validateAuth(
  lineage: LineageId | null,
  id: string | null,
  version: string | null,
  auth: MetamodelAuthContext,
  sink: ValidationSink,
): void {
  checkLockedTemplate(lineage, id, version, auth, sink);

  if (lineage === "archi" || lineage === "engram") {
    if (
      auth.callerProvider !== undefined &&
      auth.callerProvider !== "engram" &&
      auth.callerProvider !== "@sentropic/engram"
    ) {
      addError(
        sink,
        "MM_AUTH_LINEAGE_SOLE_AUTHOR_VIOLATION",
        "lineage",
        `Caller provider ${auth.callerProvider} is not the sole author of lineage ${lineage}`,
      );
    }
    if (auth.writerMandate === undefined) return;
  }

  const mandate = auth.writerMandate;
  if (!isRecord(mandate)) {
    addError(
      sink,
      "MM_AUTH_MANDATE_MISSING_OR_INVALID",
      "auth.writerMandate",
      "Signed H2AMandateEnvelope is required for template registration",
    );
    return;
  }

  const typedMandate = mandate as unknown as H2AMandateEnvelope;
  validateMandateShape(typedMandate, auth, sink);
  validateMandateExpiryAndSignature(typedMandate, auth, sink);
  validateMandateLineageRights(lineage, typedMandate, auth, sink);
}
