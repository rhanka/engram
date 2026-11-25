import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { toJsonValue, type JsonValue } from "../json-value.js";
import type { LineageId, Sha256Digest } from "../metamodel-contracts.js";
import { sha256Hex } from "../ontology-guardian/canonical.js";
import { fromInternalDigest } from "../ontology-guardian/digests.js";
import { parseOntologyProfile } from "../ontology-profile.js";
import { isRecord } from "../profile-validate.js";
import type { MetamodelValidationContext } from "./types.js";
import {
  addError,
  isExactSemVer,
  isNonEmptyString,
  isSha256Digest,
  SUPPORTED_METAMODEL_VERSION,
  TEMPLATE_ID_RE,
  VALID_LINEAGES,
  type ValidationSink,
} from "./validate-common.js";

function findYamlProtoPaths(node: unknown, path = ""): string[] {
  if (isMap(node)) {
    const out: string[] = [];
    for (const item of node.items) {
      const name = isScalar(item.key) ? String(item.key.value) : String(item.key);
      const next = path ? `${path}.${name}` : name;
      if (name === "__proto__") out.push(next);
      out.push(...findYamlProtoPaths(item.value, next));
    }
    return out;
  }
  if (isSeq(node)) {
    const out: string[] = [];
    for (let i = 0; i < node.items.length; i += 1) {
      out.push(...findYamlProtoPaths(node.items[i], `${path}[${i}]`));
    }
    return out;
  }
  return [];
}

function findJsonProtoPaths(value: JsonValue, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findJsonProtoPaths(item, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    const out: string[] = [];
    for (const key of Object.keys(value).sort()) {
      const next = path ? `${path}.${key}` : key;
      if (key === "__proto__") out.push(next);
      out.push(...findJsonProtoPaths((value as Record<string, JsonValue>)[key]!, next));
    }
    return out;
  }
  return [];
}

function parseRawTextInput(
  rawInput: string,
  sink: ValidationSink,
): { readonly rawObject: unknown; readonly rawSha256: Sha256Digest } | null {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    addError(sink, "MM_SYNTAX_PARSE_ERROR", "template", "Template input string must not be empty");
    return null;
  }
  const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (isJson) {
    try {
      JSON.parse(trimmed);
    } catch (error) {
      addError(
        sink,
        "MM_SYNTAX_PARSE_ERROR",
        "template",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
  const yamlDoc = parseDocument(trimmed, {
    uniqueKeys: false,
    ...(isJson ? { schema: "json" } : {}),
  });
  if (!isJson && yamlDoc.errors.length > 0) {
    addError(sink, "MM_SYNTAX_PARSE_ERROR", "template", yamlDoc.errors[0]!.message);
    return null;
  }
  const astProtoPaths = findYamlProtoPaths(yamlDoc.contents);
  if (astProtoPaths.length > 0) {
    for (const protoPath of astProtoPaths) {
      addError(sink, "MM_SYNTAX_FORBIDDEN_PROTO_KEY", protoPath, `Forbidden __proto__ key at ${protoPath}`);
    }
    return null;
  }
  if (!isMap(yamlDoc.contents)) {
    addError(sink, "MM_SYNTAX_NON_PLAIN_OBJECT", "template", "Template root document must be a plain object");
    return null;
  }
  try {
    return { rawObject: parseOntologyProfile(rawInput), rawSha256: fromInternalDigest(sha256Hex(rawInput)) };
  } catch (error) {
    const errPath = typeof (error as { path?: unknown })?.path === "string"
      ? (error as { path: string }).path
      : "template";
    addError(
      sink,
      "MM_SYNTAX_PARSE_ERROR",
      errPath,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export function parseAndProjectInput(
  rawInput: unknown,
  sink: ValidationSink,
): { readonly doc: Record<string, JsonValue>; readonly rawSha256: Sha256Digest | null } | null {
  let rawObject: unknown;
  let rawSha256: Sha256Digest | null = null;

  if (typeof rawInput === "string") {
    const parsedText = parseRawTextInput(rawInput, sink);
    if (!parsedText) return null;
    rawObject = parsedText.rawObject;
    rawSha256 = parsedText.rawSha256;
  } else {
    if (!isRecord(rawInput)) {
      addError(sink, "MM_SYNTAX_NON_PLAIN_OBJECT", "template", "Template input must be a plain object or YAML/JSON text");
      return null;
    }
    rawObject = rawInput;
  }

  const projected = toJsonValue(rawObject);
  if (!projected.ok || !isRecord(projected.value)) {
    const path = projected.ok ? "template" : projected.path || "template";
    const reason = projected.ok ? "non_plain_object" : projected.reason;
    addError(sink, "MM_SYNTAX_NON_PLAIN_OBJECT", path, `Plain-JSON projection failed at ${path}: ${reason}`);
    return null;
  }

  const protoPaths = findJsonProtoPaths(projected.value);
  if (protoPaths.length > 0) {
    for (const protoPath of protoPaths) {
      addError(sink, "MM_SYNTAX_FORBIDDEN_PROTO_KEY", protoPath, `Forbidden __proto__ key at ${protoPath}`);
    }
    return null;
  }

  return { doc: projected.value as Record<string, JsonValue>, rawSha256 };
}

export function validateIdentity(
  doc: Record<string, JsonValue>,
  sink: ValidationSink,
): {
  readonly lineage: LineageId | null;
  readonly id: string | null;
  readonly version: string | null;
} {
  let lineage: LineageId | null = null;
  if (!isNonEmptyString(doc.lineage)) {
    addError(sink, "MM_IDENTITY_MISSING_REQUIRED", "lineage", "lineage is required");
  } else if (!VALID_LINEAGES.has(doc.lineage)) {
    addError(
      sink,
      "MM_IDENTITY_MISSING_REQUIRED",
      "lineage",
      `lineage must be one of archi, h2a, track, engram (got ${doc.lineage})`,
    );
  } else {
    lineage = doc.lineage as LineageId;
    sink.lineage = lineage;
  }

  let id: string | null = null;
  if (!isNonEmptyString(doc.id) || !TEMPLATE_ID_RE.test(doc.id)) {
    addError(sink, "MM_IDENTITY_MISSING_REQUIRED", "id", "id must be a non-empty template identifier");
  } else {
    id = doc.id;
    sink.subject = id;
  }

  if (!isNonEmptyString(doc.metamodel_version)) {
    addError(sink, "MM_IDENTITY_MISSING_REQUIRED", "metamodel_version", "metamodel_version is required");
  } else if (doc.metamodel_version !== SUPPORTED_METAMODEL_VERSION) {
    addError(
      sink,
      "MM_IDENTITY_UNKNOWN_METAMODEL_VERSION",
      "metamodel_version",
      `Unsupported metamodel_version ${doc.metamodel_version}; expected ${SUPPORTED_METAMODEL_VERSION}`,
    );
  }

  let version: string | null = null;
  if (!isNonEmptyString(doc.version)) {
    addError(sink, "MM_IDENTITY_MISSING_REQUIRED", "version", "version is required");
  } else if (!isExactSemVer(doc.version)) {
    addError(
      sink,
      "MM_VERSION_NOT_EXACT_SEMVER",
      "version",
      `version must be exact SemVer MAJOR.MINOR.PATCH (got ${doc.version})`,
    );
  } else {
    version = doc.version;
  }

  if (doc.default_language !== undefined && !isNonEmptyString(doc.default_language)) {
    addError(sink, "MM_IDENTITY_MISSING_REQUIRED", "default_language", "default_language must be a non-empty string");
  }

  if (doc.presentation !== undefined && !isRecord(doc.presentation)) {
    addError(sink, "MM_SYNTAX_NON_PLAIN_OBJECT", "presentation", "presentation must be a plain object");
  }

  return { lineage, id, version };
}

export function validateDigests(
  doc: Record<string, JsonValue>,
  computedTemplateDigest: Sha256Digest,
  computedPresentationDigest: Sha256Digest,
  rawSha256: Sha256Digest | null,
  context: MetamodelValidationContext | undefined,
  sink: ValidationSink,
): void {
  if (doc.presentation_hash !== undefined) {
    if (!isSha256Digest(doc.presentation_hash) || doc.presentation_hash !== computedPresentationDigest) {
      addError(
        sink,
        "MM_DIGEST_MISMATCH",
        "presentation_hash",
        "Declared presentation_hash does not match recomputed RFC 8785 presentation digest",
      );
    }
  }

  const expected = context?.expectedDigests;
  if (!expected) return;

  if (expected.templateDigestSha256 !== undefined) {
    if (!isSha256Digest(expected.templateDigestSha256) || expected.templateDigestSha256 !== computedTemplateDigest) {
      addError(
        sink,
        "MM_DIGEST_MISMATCH",
        "templateDigestSha256",
        "Supplied templateDigestSha256 is malformed or disagrees with recomputed RFC 8785 JCS SHA-256",
      );
    }
  }
  if (expected.presentationDigest !== undefined) {
    if (!isSha256Digest(expected.presentationDigest) || expected.presentationDigest !== computedPresentationDigest) {
      addError(
        sink,
        "MM_DIGEST_MISMATCH",
        "presentationDigest",
        "Supplied presentationDigest is malformed or disagrees with recomputed RFC 8785 SHA-256",
      );
    }
  }
  if (expected.rawSha256 !== undefined) {
    if (!isSha256Digest(expected.rawSha256) || rawSha256 === null || expected.rawSha256 !== rawSha256) {
      addError(
        sink,
        "MM_DIGEST_MISMATCH",
        "rawSha256",
        "Supplied rawSha256 is malformed or disagrees with raw template UTF-8 SHA-256",
      );
    }
  }
}
