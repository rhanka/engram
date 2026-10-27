/**
 * Typed attributes. SPEC 3.3: "attributs typés selon le schéma du profil
 * (quantité+unité, énumération, référence, texte, date, booléen, collection
 * bornée) - jamais un dictionnaire libre."
 *
 * Two consequences that shape everything below:
 *   - a VALUE carries its kind, so a number is never silently read as a
 *     quantity: a quantity without a unit is `quantity-unit-missing`, which is
 *     one of the nine named rejected cases;
 *   - a SCHEMA is required to read a value. There is no "any attribute"
 *     escape. Content a profile does not declare is not an attribute; it is an
 *     extension (see extensions in `document.ts`), preserved with its hash and
 *     never promoted to a business fact (decision D3-C).
 */

import { type Diagnostic, diagnostic } from "./diagnostics.js";
import { type RefKind, refKindOf } from "./refs.js";

export type ScalarAttributeKind = "text" | "boolean" | "date" | "quantity" | "enum" | "reference";
export type AttributeKind = ScalarAttributeKind | "collection";

export type ScalarAttributeValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  /** ISO-8601 calendar date or date-time, as text. No date object: the model stays serialisable. */
  | { readonly kind: "date"; readonly value: string }
  /** A magnitude AND its unit. Neither half is optional. */
  | { readonly kind: "quantity"; readonly value: number; readonly unit: string }
  | { readonly kind: "enum"; readonly value: string }
  /** A raw reference string; the namespace it must carry is declared by the schema. */
  | { readonly kind: "reference"; readonly value: string };

export type AttributeValue =
  | ScalarAttributeValue
  | { readonly kind: "collection"; readonly items: readonly ScalarAttributeValue[] };

export type ScalarSchema =
  | { readonly kind: "text"; readonly maxLength?: number }
  | { readonly kind: "boolean" }
  | { readonly kind: "date" }
  /** The units a quantity may use. A one-unit list is how a profile pins a unit. */
  | { readonly kind: "quantity"; readonly units: readonly string[] }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "reference"; readonly refKind: RefKind };

/**
 * A collection is ALWAYS bounded: `maxItems` is required, because "collection
 * bornée" is the contract and an unbounded list is how a schema becomes a bag.
 */
export type CollectionSchema = {
  readonly kind: "collection";
  readonly item: ScalarSchema;
  readonly maxItems: number;
  readonly minItems?: number;
};

export type AttributeSchema = { readonly name: string; readonly required?: boolean } & (ScalarSchema | CollectionSchema);

/** ISO-8601 date or date-time, with optional offset. Deliberately strict. */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function isRealDate(text: string): boolean {
  if (!ISO_8601.test(text)) return false;
  // Rejects 2026-02-30: the regexp only proves the shape.
  const [year, month, day] = text.slice(0, 10).split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function validateScalar(schema: ScalarSchema, value: ScalarAttributeValue, path: string): readonly Diagnostic[] {
  if (value.kind !== schema.kind) {
    return [
      diagnostic({
        code: "attribute-type-mismatch",
        path,
        message: `expected a ${schema.kind} value, got ${value.kind}`,
        details: { expectedKind: schema.kind, seenKind: value.kind },
      }),
    ];
  }

  switch (schema.kind) {
    case "text": {
      const text = (value as { readonly value: string }).value;
      if (schema.maxLength !== undefined && text.length > schema.maxLength) {
        return [
          diagnostic({
            code: "text-too-long",
            path,
            message: `text is ${text.length} characters, the schema allows ${schema.maxLength}`,
            details: { length: text.length, maxLength: schema.maxLength },
          }),
        ];
      }
      return [];
    }
    case "boolean":
      return [];
    case "date": {
      const text = (value as { readonly value: string }).value;
      if (!isRealDate(text)) {
        return [
          diagnostic({
            code: "date-not-iso8601",
            path,
            message: `${JSON.stringify(text)} is not an ISO-8601 date or date-time`,
          }),
        ];
      }
      return [];
    }
    case "quantity": {
      const quantity = value as { readonly value: number; readonly unit?: string };
      const diagnostics: Diagnostic[] = [];
      // Order matters: report the missing unit even when the magnitude is also
      // wrong, because the unit is the named rejected case.
      if (typeof quantity.unit !== "string" || quantity.unit.length === 0) {
        diagnostics.push(
          diagnostic({
            code: "quantity-unit-missing",
            path,
            message: "a quantity carries a unit; none was given",
            details: { allowedUnits: schema.units.join(",") },
          }),
        );
      } else if (!schema.units.includes(quantity.unit)) {
        diagnostics.push(
          diagnostic({
            code: "quantity-unit-not-allowed",
            path,
            message: `unit ${JSON.stringify(quantity.unit)} is not one of ${schema.units.join(", ")}`,
            details: { unit: quantity.unit, allowedUnits: schema.units.join(",") },
          }),
        );
      }
      if (!Number.isFinite(quantity.value)) {
        diagnostics.push(
          diagnostic({
            code: "value-not-finite",
            path,
            message: `quantity magnitude is not finite (${String(quantity.value)})`,
          }),
        );
      }
      return diagnostics;
    }
    case "enum": {
      const text = (value as { readonly value: string }).value;
      if (!schema.values.includes(text)) {
        return [
          diagnostic({
            code: "enum-value-not-allowed",
            path,
            message: `${JSON.stringify(text)} is not one of ${schema.values.join(", ")}`,
            details: { value: text, allowedValues: schema.values.join(",") },
          }),
        ];
      }
      return [];
    }
    case "reference": {
      const raw = (value as { readonly value: string }).value;
      const seen = refKindOf(raw);
      if (seen === undefined) {
        return [
          diagnostic({
            code: "malformed-ref",
            path,
            message: `${JSON.stringify(raw)} carries no identity namespace`,
            details: { expectedKind: schema.refKind },
          }),
        ];
      }
      if (seen !== schema.refKind) {
        return [
          diagnostic({
            code: "reference-type-mismatch",
            path,
            message: `expected a ${schema.refKind} reference, got a ${seen} reference`,
            refs: [raw],
            details: { expectedKind: schema.refKind, seenKind: seen },
          }),
        ];
      }
      return [];
    }
  }
}

/**
 * Validate ONE attribute value against its schema. Resolution of reference
 * values against the document is NOT done here (this module knows nothing about
 * documents); `validate.ts` resolves them and reports `dangling-reference`.
 */
export function validateAttributeValue(
  schema: AttributeSchema,
  value: AttributeValue,
  path: string,
): readonly Diagnostic[] {
  if (schema.kind === "collection") {
    if (value.kind !== "collection") {
      return [
        diagnostic({
          code: "attribute-type-mismatch",
          path,
          message: `expected a collection of ${schema.item.kind}, got ${value.kind}`,
          details: { expectedKind: "collection", seenKind: value.kind },
        }),
      ];
    }
    const diagnostics: Diagnostic[] = [];
    const minItems = schema.minItems ?? 0;
    if (value.items.length > schema.maxItems) {
      diagnostics.push(
        diagnostic({
          code: "collection-bound-exceeded",
          path,
          message: `collection holds ${value.items.length} items, the bound is ${schema.maxItems}`,
          details: { bound: "max", items: value.items.length, maxItems: schema.maxItems },
        }),
      );
    }
    if (value.items.length < minItems) {
      diagnostics.push(
        diagnostic({
          code: "collection-bound-exceeded",
          path,
          message: `collection holds ${value.items.length} items, the minimum is ${minItems}`,
          details: { bound: "min", items: value.items.length, minItems },
        }),
      );
    }
    value.items.forEach((item, index) => {
      diagnostics.push(...validateScalar(schema.item, item, `${path}[${index}]`));
    });
    return diagnostics;
  }

  if (value.kind === "collection") {
    return [
      diagnostic({
        code: "attribute-type-mismatch",
        path,
        message: `expected a ${schema.kind} value, got a collection`,
        details: { expectedKind: schema.kind, seenKind: "collection" },
      }),
    ];
  }

  return validateScalar(schema, value, path);
}

/** Every reference a value carries, with the namespace its schema requires. */
export function referencesOf(
  schema: AttributeSchema,
  value: AttributeValue,
): readonly { readonly raw: string; readonly refKind: RefKind; readonly index?: number }[] {
  if (schema.kind === "collection") {
    if (value.kind !== "collection" || schema.item.kind !== "reference") return [];
    const refKind = schema.item.refKind;
    const found: { readonly raw: string; readonly refKind: RefKind; readonly index: number }[] = [];
    value.items.forEach((item, index) => {
      if (item.kind === "reference") found.push({ raw: item.value, refKind, index });
    });
    return found;
  }
  if (schema.kind !== "reference" || value.kind !== "reference") return [];
  return [{ raw: value.value, refKind: schema.refKind }];
}

/** Convenience constructors, so fixtures and tests read as data, not as casts. */
export const text = (value: string): AttributeValue => ({ kind: "text", value });
export const boolean = (value: boolean): AttributeValue => ({ kind: "boolean", value });
export const date = (value: string): AttributeValue => ({ kind: "date", value });
export const quantity = (value: number, unit: string): AttributeValue => ({ kind: "quantity", value, unit });
export const enumeration = (value: string): AttributeValue => ({ kind: "enum", value });
export const reference = (value: string): AttributeValue => ({ kind: "reference", value });
export const collection = (items: readonly ScalarAttributeValue[]): AttributeValue => ({ kind: "collection", items });
