import type { CanonicalJsonValue } from "../canonical-json.js";
import type { Digest, Result } from "../contracts/index.js";
import { receiptDigest } from "../digests.js";
import type { SessionFrontDispositionV1 } from "../session-front-engine.js";
import {
  assertDigest,
  assertOpaque,
  assertString,
  SchemaFailure,
} from "../validation.js";
import {
  decodeStrictJsonValue,
  decodeStrictObject,
  privacyRefusal,
} from "./pseudonym.js";

export const PII_CATEGORY_RULES_V1 = [
  "email",
  "phone",
  "national-id",
  "iban",
  "secret-token",
  "private-key",
  "client-program-code",
] as const;

export type PiiCategoryRuleV1 = (typeof PII_CATEGORY_RULES_V1)[number];

export interface ConfidentialityDenyListV1 {
  readonly version: string;
  readonly digestSha256: Digest;
  readonly saltedTermHashes: readonly Digest[];
  readonly deterministicPatterns: readonly string[];
  readonly piiCategoryRules: readonly PiiCategoryRuleV1[];
}

export interface DenyListScreeningResultV1 {
  readonly allowed: boolean;
  readonly disposition: "allow" | Extract<SessionFrontDispositionV1, "withheld_d7">;
  readonly engineVerdict: "allow" | "withheld";
  readonly denyListVersion: string;
  readonly denyListDigest: Digest;
  readonly matchedRules: readonly string[];
  readonly receiptDigest: Digest;
}

const MAX_SALTED_TERMS = 4_096;
const MAX_PATTERNS = 256;
const MAX_PATTERN_BYTES = 256;

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_CANDIDATE_PATTERN = new RegExp(
  [
    "(?<![A-Za-z0-9_])",
    "(?:\\+[1-9]\\d{0,2}[\\s.-]?)?",
    "(?:\\(\\d{1,4}\\)[\\s.-]?|\\d{1,4}[\\s.-])",
    "(?:\\d{2,4}[\\s.-]){1,4}\\d{2,4}",
    "(?![A-Za-z0-9_])",
  ].join(""),
  "g",
);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const SSN_PATTERN = /(?<![A-Za-z0-9])\d{3}-\d{2}-\d{4}(?![A-Za-z0-9])/;
const FR_NIR_PATTERN = new RegExp(
  [
    "(?<![A-Za-z0-9])[12]\\s?\\d{2}\\s?",
    "(?:0[1-9]|1[0-2]|[23]\\d)\\s?",
    "(?:\\d{2}|2[AB])\\s?\\d{3}\\s?\\d{3}(?:\\s?\\d{2})?",
    "(?![A-Za-z0-9])",
  ].join(""),
);
const LABELED_NATIONAL_ID_PATTERN =
  /\b(?:ssn|nir|insee|national[_ -]?id|passport)\s*[:=#]\s*[A-Za-z0-9-]{6,}\b/i;
const IBAN_CANDIDATE_PATTERN =
  /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]{4}){2,7}(?:[ \t]?[A-Z0-9]{1,4})?(?![A-Za-z0-9])/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const CLIENT_PROGRAM_CODE_PATTERN =
  /\b(?:CLIENT|PROG|PRG|PROJ|CONFIDENTIAL)[_-][A-Z0-9]{2,}(?:[_-][A-Z0-9]{2,})*\b/;

const SECRET_TOKEN_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9]{20,}/,
  /\b(?:sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,})\b/,
  /(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*\S+/i,
  /:\/\/[^/\s:]+:[^/\s@]+@/,
];

function isPiiCategoryRule(value: unknown): value is PiiCategoryRuleV1 {
  return typeof value === "string" && (PII_CATEGORY_RULES_V1 as readonly string[]).includes(value);
}

function matchesPhone(text: string): boolean {
  PHONE_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(PHONE_CANDIDATE_PATTERN)) {
    const raw = match[0];
    if (ISO_DATE_PATTERN.test(raw) || SEMVER_PATTERN.test(raw)) {
      continue;
    }
    const digits = raw.replace(/\D/g, "");
    const minDigits = raw.startsWith("+") ? 9 : 10;
    if (digits.length >= minDigits && digits.length <= 15) {
      return true;
    }
  }
  return false;
}

function matchesIban(text: string): boolean {
  IBAN_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(IBAN_CANDIDATE_PATTERN)) {
    const compact = match[0].replace(/[ \t]/g, "");
    if (compact.length >= 15 && compact.length <= 34) {
      return true;
    }
  }
  return false;
}

function matchesPiiCategory(category: PiiCategoryRuleV1, text: string): boolean {
  switch (category) {
    case "email":
      return EMAIL_PATTERN.test(text);
    case "phone":
      return matchesPhone(text);
    case "national-id":
      return (
        SSN_PATTERN.test(text)
        || FR_NIR_PATTERN.test(text)
        || LABELED_NATIONAL_ID_PATTERN.test(text)
      );
    case "iban":
      return matchesIban(text);
    case "secret-token":
      return SECRET_TOKEN_PATTERNS.some((pattern) => pattern.test(text));
    case "private-key":
      return PRIVATE_KEY_PATTERN.test(text);
    case "client-program-code":
      return CLIENT_PROGRAM_CODE_PATTERN.test(text);
  }
}

function computeSaltedTermDigest(normalizedLowerTerm: string, salt: string): Digest {
  return receiptDigest("d7-salted-term", { salt, term: normalizedLowerTerm });
}

function computeDenyListDigest(body: Omit<ConfidentialityDenyListV1, "digestSha256">): Digest {
  return receiptDigest(
    "confidentiality-deny-list",
    {
      version: body.version,
      saltedTermHashes: [...body.saltedTermHashes],
      deterministicPatterns: [...body.deterministicPatterns],
      piiCategoryRules: [...body.piiCategoryRules],
    },
    "digestSha256",
  );
}

interface CompiledDenyList {
  readonly list: ConfidentialityDenyListV1;
  readonly saltedSet: ReadonlySet<Digest>;
  readonly compiledPatterns: readonly RegExp[];
}

function decodeDenyListFields(
  obj: Record<string, CanonicalJsonValue>,
): {
  readonly body: Omit<ConfidentialityDenyListV1, "digestSha256">;
  readonly compiledPatterns: readonly RegExp[];
} {
  assertOpaque(obj.version, "version");
  if (!Array.isArray(obj.saltedTermHashes) || obj.saltedTermHashes.length > MAX_SALTED_TERMS) {
    throw new SchemaFailure("saltedTermHashes must be a bounded array");
  }
  const saltedTermHashes: Digest[] = [];
  for (let i = 0; i < obj.saltedTermHashes.length; i += 1) {
    const item = obj.saltedTermHashes[i];
    assertDigest(item, `saltedTermHashes[${i}]`);
    saltedTermHashes.push(item);
  }
  if (!Array.isArray(obj.deterministicPatterns) || obj.deterministicPatterns.length > MAX_PATTERNS) {
    throw new SchemaFailure("deterministicPatterns must be a bounded array");
  }
  const deterministicPatterns: string[] = [];
  const compiledPatterns: RegExp[] = [];
  for (let i = 0; i < obj.deterministicPatterns.length; i += 1) {
    const pattern = obj.deterministicPatterns[i];
    assertString(pattern, `deterministicPatterns[${i}]`, 1, MAX_PATTERN_BYTES);
    try {
      compiledPatterns.push(new RegExp(pattern, "u"));
    } catch {
      throw new SchemaFailure(`deterministicPatterns[${i}] is not a valid RegExp`);
    }
    deterministicPatterns.push(pattern);
  }
  if (!Array.isArray(obj.piiCategoryRules)) {
    throw new SchemaFailure("piiCategoryRules must be an array");
  }
  const seenCategories = new Set<PiiCategoryRuleV1>();
  const piiCategoryRules: PiiCategoryRuleV1[] = [];
  for (let i = 0; i < obj.piiCategoryRules.length; i += 1) {
    const category = obj.piiCategoryRules[i];
    if (!isPiiCategoryRule(category) || seenCategories.has(category)) {
      throw new SchemaFailure(`piiCategoryRules[${i}] is invalid or duplicated`);
    }
    seenCategories.add(category);
    piiCategoryRules.push(category);
  }
  if (
    saltedTermHashes.length === 0
    && deterministicPatterns.length === 0
    && piiCategoryRules.length === 0
  ) {
    throw new SchemaFailure("confidentiality deny-list must declare at least one rule");
  }
  return {
    body: {
      version: obj.version,
      saltedTermHashes,
      deterministicPatterns,
      piiCategoryRules,
    },
    compiledPatterns,
  };
}

function compileValidatedDenyList(input: unknown): Result<CompiledDenyList> {
  if (input === undefined || input === null) {
    return privacyRefusal("capture", "POLICY_UNAVAILABLE", "confidentiality deny-list is unavailable");
  }
  let body: Omit<ConfidentialityDenyListV1, "digestSha256">;
  let compiledPatterns: readonly RegExp[];
  let digestSha256: Digest;
  try {
    const obj = decodeStrictObject(
      input,
      "confidentialityDenyList",
      ["version", "digestSha256", "saltedTermHashes", "deterministicPatterns", "piiCategoryRules"],
      ["version", "digestSha256", "saltedTermHashes", "deterministicPatterns", "piiCategoryRules"],
    );
    assertDigest(obj.digestSha256, "digestSha256");
    digestSha256 = obj.digestSha256;
    const parsed = decodeDenyListFields(obj);
    body = parsed.body;
    compiledPatterns = parsed.compiledPatterns;
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "confidentiality deny-list is invalid",
    );
  }
  const expected = computeDenyListDigest(body);
  if (digestSha256 !== expected) {
    return privacyRefusal(
      "capture",
      "INVALID_DIGEST",
      "confidentiality deny-list digest does not bind its rules",
    );
  }
  return {
    ok: true,
    value: {
      list: { ...body, digestSha256 },
      saltedSet: new Set(body.saltedTermHashes),
      compiledPatterns,
    },
  };
}

export function hashConfidentialTermV1(input: {
  readonly term: string;
  readonly salt: string;
}): Result<Digest> {
  try {
    const obj = decodeStrictObject(input, "saltedTerm", ["term", "salt"], ["term", "salt"]);
    assertOpaque(obj.term, "term");
    assertOpaque(obj.salt, "salt");
    const normalized = obj.term.trim().toLowerCase();
    if (normalized.length === 0) {
      throw new SchemaFailure("term must not be blank");
    }
    return { ok: true, value: computeSaltedTermDigest(normalized, obj.salt) };
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "salted term input is invalid",
    );
  }
}

export function createConfidentialityDenyListV1(
  input: Omit<ConfidentialityDenyListV1, "digestSha256">,
): Result<ConfidentialityDenyListV1> {
  try {
    const obj = decodeStrictObject(
      input,
      "confidentialityDenyListInput",
      ["version", "saltedTermHashes", "deterministicPatterns", "piiCategoryRules"],
      ["version", "saltedTermHashes", "deterministicPatterns", "piiCategoryRules"],
    );
    const { body } = decodeDenyListFields(obj);
    return {
      ok: true,
      value: {
        ...body,
        digestSha256: computeDenyListDigest(body),
      },
    };
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "confidentiality deny-list input is invalid",
    );
  }
}

export function validateConfidentialityDenyListV1(
  input: unknown,
): Result<ConfidentialityDenyListV1> {
  const compiled = compileValidatedDenyList(input);
  if (!compiled.ok) {
    return compiled;
  }
  return { ok: true, value: compiled.value.list };
}

function matchesSaltedTerm(
  text: string,
  saltedSet: ReadonlySet<Digest>,
  termSalt: string,
): boolean {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length === 0) {
    return false;
  }
  const checked = new Set<string>();
  const testCandidate = (candidate: string): boolean => {
    if (candidate.length === 0 || checked.has(candidate)) {
      return false;
    }
    checked.add(candidate);
    return saltedSet.has(computeSaltedTermDigest(candidate, termSalt));
  };
  if (testCandidate(trimmed)) {
    return true;
  }
  let prev2: string | undefined;
  let prev1: string | undefined;
  for (const match of trimmed.matchAll(/\S+/g)) {
    const cleaned = match[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (cleaned.length === 0) {
      continue;
    }
    if (testCandidate(cleaned)) {
      return true;
    }
    if (prev1 !== undefined && testCandidate(`${prev1} ${cleaned}`)) {
      return true;
    }
    if (prev2 !== undefined && prev1 !== undefined && testCandidate(`${prev2} ${prev1} ${cleaned}`)) {
      return true;
    }
    prev2 = prev1;
    prev1 = cleaned;
  }
  for (const match of trimmed.matchAll(/[\p{L}\p{N}]+(?:[_-][\p{L}\p{N}]+)*/gu)) {
    if (testCandidate(match[0])) {
      return true;
    }
  }
  return false;
}

function collectStrings(root: CanonicalJsonValue, out: string[]): void {
  const stack: CanonicalJsonValue[] = [root];
  while (stack.length > 0) {
    const value = stack.pop()!;
    if (typeof value === "string") {
      out.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push(value[index]!);
      }
      continue;
    }
    if (value !== null && typeof value === "object") {
      const keys = Object.keys(value);
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]!;
        out.push(key);
        stack.push(value[key]!);
      }
    }
  }
}

export function screenForDenyListV1(
  denyList: ConfidentialityDenyListV1,
  surface: unknown,
  options?: { readonly termSalt?: string },
): Result<DenyListScreeningResultV1> {
  const compiled = compileValidatedDenyList(denyList);
  if (!compiled.ok) {
    return compiled;
  }
  let termSalt: string | undefined;
  const strings: string[] = [];
  try {
    const decodedSurface = decodeStrictJsonValue(surface);
    if (options !== undefined) {
      const optObj = decodeStrictObject(options, "screenOptions", ["termSalt"], []);
      if (Object.hasOwn(optObj, "termSalt")) {
        assertOpaque(optObj.termSalt, "screenOptions.termSalt");
        termSalt = optObj.termSalt;
      }
    }
    collectStrings(decodedSurface, strings);
  } catch (error) {
    return privacyRefusal(
      "capture",
      "INVALID_SCHEMA",
      error instanceof SchemaFailure ? error.message : "screening surface is invalid",
    );
  }

  const hits = new Set<string>();
  const { list, saltedSet, compiledPatterns } = compiled.value;
  if (saltedSet.size > 0 && termSalt === undefined) {
    return privacyRefusal(
      "capture",
      "POLICY_UNAVAILABLE",
      "termSalt is required when confidentiality deny-list declares saltedTermHashes",
    );
  }
  for (const text of strings) {
    if (saltedSet.size > 0 && termSalt !== undefined && !hits.has("salted-term")) {
      if (matchesSaltedTerm(text, saltedSet, termSalt)) {
        hits.add("salted-term");
      }
    }
    for (let index = 0; index < compiledPatterns.length; index += 1) {
      const ruleId = `pattern:${index}`;
      if (!hits.has(ruleId) && compiledPatterns[index]!.test(text)) {
        hits.add(ruleId);
      }
    }
    for (const category of list.piiCategoryRules) {
      const ruleId = `pii:${category}`;
      if (!hits.has(ruleId) && matchesPiiCategory(category, text)) {
        hits.add(ruleId);
      }
    }
  }

  const matchedRules = [...hits].sort();
  const allowed = matchedRules.length === 0;
  const disposition = allowed ? ("allow" as const) : ("withheld_d7" as const);
  const engineVerdict = allowed ? ("allow" as const) : ("withheld" as const);
  const body = {
    allowed,
    disposition,
    engineVerdict,
    denyListVersion: list.version,
    denyListDigest: list.digestSha256,
    matchedRules,
  };
  return {
    ok: true,
    value: {
      ...body,
      receiptDigest: receiptDigest("d7-screening", body, "receiptDigest"),
    },
  };
}
