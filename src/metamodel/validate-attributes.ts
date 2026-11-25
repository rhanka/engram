import { isRecord } from "../profile-validate.js";
import {
  addError,
  hasUniqueStrings,
  IDENTIFIER_RE,
  isStringArray,
  validateRegexPattern,
  type ValidationSink,
} from "./validate-common.js";
import { validateExternalTypeRef, type CompositionContext } from "./validate-composition.js";

const ATTRIBUTE_SCALAR_KINDS = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "enum",
  "timestamp",
  "digest",
  "ref",
]);
const STRING_LIKE_KINDS = new Set(["string", "timestamp", "digest"]);
const NUMERIC_KINDS = new Set(["number", "integer"]);

const COMMON_ATTR_KEYS = ["kind", "required", "description"] as const;
const ALLOWED_ATTR_KEYS_BY_KIND: Readonly<Record<string, ReadonlySet<string>>> = {
  string: new Set([...COMMON_ATTR_KEYS, "pattern", "minLength", "maxLength"]),
  timestamp: new Set([...COMMON_ATTR_KEYS, "pattern", "minLength", "maxLength"]),
  digest: new Set([...COMMON_ATTR_KEYS, "pattern", "minLength", "maxLength"]),
  number: new Set([...COMMON_ATTR_KEYS, "min", "max"]),
  integer: new Set([...COMMON_ATTR_KEYS, "min", "max"]),
  boolean: new Set([...COMMON_ATTR_KEYS]),
  enum: new Set([...COMMON_ATTR_KEYS, "values"]),
  ref: new Set([...COMMON_ATTR_KEYS, "targetTypes"]),
  collection: new Set([...COMMON_ATTR_KEYS, "minItems", "maxItems", "item"]),
  record: new Set([...COMMON_ATTR_KEYS, "attributes"]),
};

function validateCollectionAttr(
  rawAttr: Record<string, unknown>,
  path: string,
  knownNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  sink: ValidationSink,
  depth: number,
): void {
  if (rawAttr.minItems !== undefined && (!Number.isInteger(rawAttr.minItems) || Number(rawAttr.minItems) < 0)) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.minItems`, "minItems must be an integer >= 0");
  }
  if (rawAttr.maxItems !== undefined && (!Number.isInteger(rawAttr.maxItems) || Number(rawAttr.maxItems) < 0)) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.maxItems`, "maxItems must be an integer >= 0");
  }
  if (
    typeof rawAttr.minItems === "number" &&
    typeof rawAttr.maxItems === "number" &&
    rawAttr.minItems > rawAttr.maxItems
  ) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", path, "minItems must be <= maxItems");
  }
  if (rawAttr.item === undefined) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.item`, "Collection attribute requires an item declaration");
  } else {
    validateAttributeDecl(rawAttr.item, `${path}.item`, knownNodeTypes, composition, sink, depth + 1);
  }
}

function validateRecordAttr(
  rawAttr: Record<string, unknown>,
  path: string,
  knownNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  sink: ValidationSink,
  depth: number,
): void {
  if (!isRecord(rawAttr.attributes) || Object.keys(rawAttr.attributes).length === 0) {
    addError(
      sink,
      "MM_ATTR_INVALID_DECLARATION",
      `${path}.attributes`,
      "Record attribute requires a non-empty attributes map",
    );
    return;
  }
  for (const [fieldName, fieldDecl] of Object.entries(rawAttr.attributes)) {
    if (!IDENTIFIER_RE.test(fieldName)) {
      addError(
        sink,
        "MM_ATTR_INVALID_DECLARATION",
        `${path}.attributes.${fieldName}`,
        `Invalid record attribute identifier ${fieldName}`,
      );
    }
    validateAttributeDecl(
      fieldDecl,
      `${path}.attributes.${fieldName}`,
      knownNodeTypes,
      composition,
      sink,
      depth + 1,
    );
  }
}

function validateScalarStringConstraints(
  rawAttr: Record<string, unknown>,
  kind: string,
  path: string,
  sink: ValidationSink,
): void {
  if (!STRING_LIKE_KINDS.has(kind)) return;
  if (rawAttr.pattern !== undefined) {
    validateRegexPattern(rawAttr.pattern, "MM_ATTR_INVALID_DECLARATION", `${path}.pattern`, sink);
  }
  for (const [key, val] of Object.entries(rawAttr)) {
    if (key !== "minLength" && key !== "maxLength") continue;
    if (!Number.isInteger(val) || Number(val) < 0) {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.${key}`, `${key} must be an integer >= 0`);
    }
  }
  if (
    typeof rawAttr.minLength === "number" &&
    typeof rawAttr.maxLength === "number" &&
    rawAttr.minLength > rawAttr.maxLength
  ) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", path, "minLength must be <= maxLength");
  }
}

function validateScalarNumericConstraints(
  rawAttr: Record<string, unknown>,
  kind: string,
  path: string,
  sink: ValidationSink,
): void {
  if (!NUMERIC_KINDS.has(kind)) return;
  for (const [key, bound] of Object.entries(rawAttr)) {
    if (key !== "min" && key !== "max") continue;
    if (typeof bound !== "number" || !Number.isFinite(bound) || (kind === "integer" && !Number.isInteger(bound))) {
      addError(
        sink,
        "MM_ATTR_INVALID_DECLARATION",
        `${path}.${key}`,
        `${key} must be a finite ${kind === "integer" ? "integer" : "number"}`,
      );
    }
  }
  if (typeof rawAttr.min === "number" && typeof rawAttr.max === "number" && rawAttr.min > rawAttr.max) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", path, "min must be <= max");
  }
}

function validateScalarEnumAndRef(
  rawAttr: Record<string, unknown>,
  kind: string,
  path: string,
  knownNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  sink: ValidationSink,
): void {
  if (kind === "enum") {
    if (!isStringArray(rawAttr.values) || rawAttr.values.length === 0 || !hasUniqueStrings(rawAttr.values)) {
      addError(
        sink,
        "MM_ATTR_INVALID_DECLARATION",
        `${path}.values`,
        "Enum attribute requires a non-empty array of unique non-empty strings",
      );
    }
  }

  if (kind === "ref") {
    if (!isStringArray(rawAttr.targetTypes) || rawAttr.targetTypes.length === 0) {
      addError(
        sink,
        "MM_ATTR_INVALID_DECLARATION",
        `${path}.targetTypes`,
        "Ref attribute requires a non-empty targetTypes array",
      );
    } else {
      rawAttr.targetTypes.forEach((target, idx) => {
        const targetPath = `${path}.targetTypes[${idx}]`;
        if (target.includes(":")) {
          validateExternalTypeRef(target, targetPath, composition, sink);
        } else if (!knownNodeTypes.has(target)) {
          addError(
            sink,
            "MM_ATTR_INVALID_DECLARATION",
            targetPath,
            `Ref attribute references unknown local node type ${target}`,
          );
        }
      });
    }
  }
}

export function validateAttributeDecl(
  rawAttr: unknown,
  path: string,
  knownNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  sink: ValidationSink,
  depth = 0,
): void {
  if (depth > 16 || !isRecord(rawAttr)) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", path, "Attribute declaration must be a plain object");
    return;
  }
  const kind = rawAttr.kind;
  if (typeof kind !== "string") {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.kind`, "Attribute kind is required");
    return;
  }
  const allowedKeys = ALLOWED_ATTR_KEYS_BY_KIND[kind];
  if (!allowedKeys) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.kind`, `Unsupported attribute kind ${kind}`);
    return;
  }
  for (const [key] of Object.entries(rawAttr)) {
    if (!allowedKeys.has(key)) {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.${key}`, `${key} is not permitted on kind '${kind}'`);
    }
  }
  if (rawAttr.required !== undefined && typeof rawAttr.required !== "boolean") {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.required`, "Attribute required must be a boolean");
  }
  if (rawAttr.description !== undefined && typeof rawAttr.description !== "string") {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.description`, "Attribute description must be a string");
  }

  if (kind === "collection") {
    validateCollectionAttr(rawAttr, path, knownNodeTypes, composition, sink, depth);
    return;
  }
  if (kind === "record") {
    validateRecordAttr(rawAttr, path, knownNodeTypes, composition, sink, depth);
    return;
  }
  if (!ATTRIBUTE_SCALAR_KINDS.has(kind)) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.kind`, `Unsupported attribute kind ${kind}`);
    return;
  }

  validateScalarEnumAndRef(rawAttr, kind, path, knownNodeTypes, composition, sink);
  validateScalarStringConstraints(rawAttr, kind, path, sink);
  validateScalarNumericConstraints(rawAttr, kind, path, sink);
}

export function validateAttributeMap(
  rawMap: unknown,
  path: string,
  knownNodeTypes: ReadonlySet<string>,
  composition: CompositionContext,
  sink: ValidationSink,
): void {
  if (!isRecord(rawMap)) {
    addError(sink, "MM_ATTR_INVALID_DECLARATION", path, "attributes must be a plain object");
    return;
  }
  for (const [attrName, attrDecl] of Object.entries(rawMap)) {
    if (!IDENTIFIER_RE.test(attrName)) {
      addError(sink, "MM_ATTR_INVALID_DECLARATION", `${path}.${attrName}`, `Invalid attribute identifier ${attrName}`);
    }
    validateAttributeDecl(attrDecl, `${path}.${attrName}`, knownNodeTypes, composition, sink);
  }
}
