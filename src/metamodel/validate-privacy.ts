import {
  createConfidentialityDenyListV1,
  PII_CATEGORY_RULES_V1,
  screenForDenyListV1,
  type ConfidentialityDenyListV1,
} from "../../engram-memory/dist/privacy/deny-list.js";
import type { JsonValue } from "../json-value.js";
import { isDigest } from "../ontology-guardian/types.js";
import type { MetamodelValidationContext } from "./types.js";
import { addError, isSha256Digest, type ValidationSink } from "./validate-common.js";

const COMPOSED_PIN_DIGEST_PATH_RE = /^composed_lineage_pins\[\d+\]\.templateDigestSha256$/;

const DEFAULT_D7_DENY_LIST: ConfidentialityDenyListV1 = (() => {
  const created = createConfidentialityDenyListV1({
    version: "engram.metamodel.d7-default/v1",
    saltedTermHashes: [],
    deterministicPatterns: [],
    piiCategoryRules: [...PII_CATEGORY_RULES_V1],
  });
  if (!created.ok) {
    throw new Error(`Failed to initialize default D7 deny-list: ${created.error.message}`);
  }
  return created.value;
})();

interface ScreenableEntry {
  readonly path: string;
  readonly text: string;
}

/**
 * Exempts a cryptographic digest ONLY at its exact declared metamodel path AND ONLY
 * when its value actually conforms to the expected digest format (MAJOR-02).
 */
function isExemptDigestPath(path: string, value: string): boolean {
  if (path === "presentation_hash") return isSha256Digest(value);
  if (path === "profile_hash") return isSha256Digest(value) || isDigest(value);
  if (path === "parent_pin.contentDigest" || path === "mapping_pin.contentDigest") {
    return isDigest(value) || isSha256Digest(value);
  }
  if (COMPOSED_PIN_DIGEST_PATH_RE.test(path)) return isSha256Digest(value);
  return false;
}

function collectScreenableEntries(value: JsonValue, path: string, out: ScreenableEntry[]): void {
  if (typeof value === "string") {
    if (!isExemptDigestPath(path, value)) {
      out.push({ path: path || "template", text: value });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectScreenableEntries(item, `${path}[${idx}]`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      const nextPath = path ? `${path}.${key}` : key;
      out.push({ path: nextPath, text: key });
      collectScreenableEntries((value as Record<string, JsonValue>)[key]!, nextPath, out);
    }
  }
}

/**
 * Screens all non-exempt template strings in a single `screenForDenyListV1` pass (MINOR-07),
 * then localizes exact paths ONLY on a deny-list hit.
 */
export function validatePrivacyDenylist(
  doc: Record<string, JsonValue>,
  context: MetamodelValidationContext | undefined,
  sink: ValidationSink,
): void {
  const denyList = context?.privacy?.denyList ?? DEFAULT_D7_DENY_LIST;
  const termSalt = context?.privacy?.termSalt;
  const customMatcher = context?.privacy?.customMatcher;
  const screenOptions = termSalt === undefined ? undefined : { termSalt };

  const entries: ScreenableEntry[] = [];
  collectScreenableEntries(doc, "", entries);

  const wholeDoc = screenForDenyListV1(
    denyList,
    entries.map((entry) => entry.text),
    screenOptions,
  );
  if (!wholeDoc.ok) {
    addError(
      sink,
      "MM_PRIVACY_DENYLIST_VIOLATION",
      "template",
      `D7 confidentiality deny-list screening failed closed: ${wholeDoc.error.code}`,
    );
  } else if (!wholeDoc.value.allowed) {
    let localized = 0;
    for (const entry of entries) {
      const single = screenForDenyListV1(denyList, entry.text, screenOptions);
      if (!single.ok) {
        addError(
          sink,
          "MM_PRIVACY_DENYLIST_VIOLATION",
          entry.path,
          `D7 confidentiality deny-list screening failed closed: ${single.error.code}`,
        );
        localized += 1;
      } else if (!single.value.allowed) {
        addError(
          sink,
          "MM_PRIVACY_DENYLIST_VIOLATION",
          entry.path,
          `Template value violates D7 confidentiality deny-list (${single.value.matchedRules.join(", ")})`,
        );
        localized += 1;
      }
    }
    if (localized === 0) {
      addError(
        sink,
        "MM_PRIVACY_DENYLIST_VIOLATION",
        "template",
        `Template violates D7 confidentiality deny-list (${wholeDoc.value.matchedRules.join(", ")})`,
      );
    }
  }

  if (customMatcher) {
    for (const entry of entries) {
      const hit = customMatcher(entry.text, entry.path);
      if (hit !== null) {
        addError(
          sink,
          "MM_PRIVACY_DENYLIST_VIOLATION",
          entry.path,
          `Template value violates D7 confidentiality deny-list (${hit})`,
        );
      }
    }
  }
}
