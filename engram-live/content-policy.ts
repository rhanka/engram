// @sentropic/engram-live/content-policy — deterministic pre-persistence secret/path policy
// (spec/SPEC_LIVE_GIT_INDEXING.md §§8, 10; plan/09 L4b; owner Q2 B).
//
// Policy BEFORE persistence: every surface — patch text, symbol names,
// citation quotes, search snippets, context excerpts — is screened before
// any batch is assembled or stored. Persist-then-mask is structurally
// refused (contracts.validateSealedLocalDiff rejects transient open hunk
// lines at the sink/store boundary). Ambiguous content is excluded rather
// than stored and then masked; secret detection never claims the absence
// of unknown secrets and is not the sole protection (host encryption and
// key custody complete it).
//
// .gitignore is never a secrecy guarantee: no gitignore input exists
// anywhere in this module — neither a path, nor content, nor a negation
// list — so a negation cannot unblock a protected path by construction.
//
// Neutrality: this module imports ONLY ./contracts.js (data-pure DTOs and
// constants). No h2a, no cluster-mesh, no sentropic, no storage driver, no
// network, no filesystem, no clock.
//
// Host contract (S: protected-payload.ts + sqlite.ts, H: live-key-provider.ts
// — NOT implemented here): S encrypts-at-rest through the injected
// ContentProtectionPort (see ./snapshots.js), proves no fixture plaintext in
// real DB/WAL/search/temp/log/backup, and purges on unregister; H keeps keys
// outside the database and denies decryption on missing/revoked keys. The
// neutral KeyProviderPort below is the contract H implements.

import {
  CONTENT_POLICY_VERSION,
} from "./contracts.js";
import { createHash } from "node:crypto";

export class ContentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentPolicyError";
  }
}

/**
 * THE neutral key-provider port (plan/09 L4b: a port, never a base). Engram
 * defines the contract only; h2a implements key custody behind it (keys
 * outside the database; missing or revoked keys deny decryption). A fake
 * unavailable provider drives the metadata-only downgrade in tests.
 */
export interface KeyProviderPort {
  currentKeyRef(): Promise<
    { readonly state: "available"; readonly keyRef: string } |
    { readonly state: "unavailable"; readonly reason: string }
  >;
}

// — Deterministic path rules (CONTENT_POLICY_VERSION).
//
// A protected path is withheld (replaced by a stable derived reference,
// never kept) before persistence. The rules name known secret carriers;
// anything ambiguous is excluded rather than stored.

const PROTECTED_BASENAME_PREFIXES: readonly string[] = [".env"];

const PROTECTED_BASENAME_SUFFIXES: readonly string[] = [".pem", ".key"];

const PROTECTED_BASENAMES: readonly string[] = [
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "credentials.json",
  "secrets.json",
  "service-account.json",
];

const PROTECTED_PATH_SEGMENTS: readonly string[] = ["secret", "secrets", "credentials"];

function asciiLatin1(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export interface PathClassification {
  readonly allowed: boolean;
  readonly reason: string;
}

/**
 * Deterministic path classification over raw path bytes. Pure and total:
 * no filesystem read, no .gitignore consult, no network. A non-UTF-8 or
 * control-character path is classified on its bytes, never decoded then
 * re-encoded.
 */
export function classifyPath(path: string | Uint8Array): PathClassification {
  if (typeof path !== "string" && !(path instanceof Uint8Array)) {
    throw new ContentPolicyError("classifyPath requires a string or raw path bytes");
  }
  const raw = typeof path === "string" ? path : asciiLatin1(path);
  // Opaque refusals: reasons name the matched deterministic rule only.
  // Rejected path bytes are caller-supplied data and may themselves carry
  // private text, so they are never interpolated into a reason that can
  // reach a batch, a diagnostic or an error surface.
  const segments = raw.split("/");
  const base = segments[segments.length - 1] ?? "";
  for (const prefix of PROTECTED_BASENAME_PREFIXES) {
    if (base.startsWith(prefix)) {
      return { allowed: false, reason: `protected secret-carrying basename prefix (${CONTENT_POLICY_VERSION})` };
    }
  }
  for (const suffix of PROTECTED_BASENAME_SUFFIXES) {
    if (base.endsWith(suffix) && base.length > suffix.length) {
      return { allowed: false, reason: `protected key-material basename suffix (${CONTENT_POLICY_VERSION})` };
    }
  }
  if ((PROTECTED_BASENAMES as readonly string[]).includes(base)) {
    return { allowed: false, reason: `protected credential basename (${CONTENT_POLICY_VERSION})` };
  }
  for (const segment of segments) {
    if ((PROTECTED_PATH_SEGMENTS as readonly string[]).includes(segment)) {
      return { allowed: false, reason: `protected secret-carrying path segment (${CONTENT_POLICY_VERSION})` };
    }
  }
  if (containsSecretText(raw)) {
    return { allowed: false, reason: `protected secret-bearing path bytes (${CONTENT_POLICY_VERSION})` };
  }
  return { allowed: true, reason: "no deterministic secret-carrier signal" };
}

/**
 * Stable opaque reference replacing a withheld protected path before any
 * persistence: the raw bytes (which may carry private text) never reach a
 * batch. The derivation is deterministic over the exact bytes, so repeated
 * derivations of one path stay joinable without revealing it.
 */
export function protectedPathRef(path: Uint8Array): Uint8Array {
  const digest = createHash("sha256").update(path).digest("hex");
  return new TextEncoder().encode(`withheld-path:${digest}`);
}

// — Deterministic secret-text rules (CONTENT_POLICY_VERSION).
//
// Known secret formats and risk signals only. A match withholds the whole
// surface line/entry; a non-match is not proof of safety (host encryption
// still applies to everything retained).

export const SECRET_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "github-token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9]{20,}/ },
  { id: "private-key-block", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { id: "credential-assignment", pattern: /(password|passwd|pwd|secret|api[_-]?key)\s*[:=]\s*\S+/i },
  { id: "credentialed-url", pattern: /:\/\/[^/\s:]+:[^/\s@]+@/ },
];

/** True when the text carries a known secret format or risk signal. */
export function containsSecretText(text: string): boolean {
  if (typeof text !== "string") {
    throw new ContentPolicyError("containsSecretText requires a string");
  }
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(text));
}

/** Which deterministic rule matched first, for explicit diagnostics (the secret itself is never echoed). */
export function matchSecretRule(text: string): string | null {
  for (const { id, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) return id;
  }
  return null;
}

// — Every-surface screening (spec §10: hunks, context, citations, derived
// symbols, search indexes, diagnostics and reader responses).

export interface BatchSurfacesInput {
  readonly patchText: string | null;
  readonly symbolNames: readonly string[];
  readonly citationQuotes: readonly string[];
  readonly searchSnippets: readonly string[];
  readonly contextExcerpts: readonly string[];
}

export interface ScreenedSurfaces {
  /** Null when every patch line is withheld: metadata/ranges alone survive. */
  readonly patchText: string | null;
  readonly symbolNames: readonly string[];
  readonly citationQuotes: readonly string[];
  readonly searchSnippets: readonly string[];
  readonly contextExcerpts: readonly string[];
  readonly policyVersion: string;
  /** Entries removed by screening: withheld patch (1 when withheld) plus dropped list entries. */
  readonly removedEntries: number;
}

/**
 * Patch-level granularity: when ANY line carries a known secret signal the
 * whole patch surface is withheld (null). Line-level salvage would keep
 * surrounding context attributable to the secret, so ambiguous content is
 * excluded rather than stored (spec §10).
 */
function screenLines(text: string): string | null {
  return text.split("\n").some((line) => containsSecretText(line)) ? null : text;
}

/**
 * Screen every derived surface before batch assembly. Secret lines/entries
 * are dropped (patch lines) or removed (list entries); an emptied surface
 * becomes null/[] with the policy version stamped — never a silent pass.
 */
export function screenBatchSurfaces(input: BatchSurfacesInput): ScreenedSurfaces {
  if (input.patchText !== null && typeof input.patchText !== "string") {
    throw new ContentPolicyError("screenBatchSurfaces requires patchText to be a string or null");
  }
  for (const list of [
    input.symbolNames,
    input.citationQuotes,
    input.searchSnippets,
    input.contextExcerpts,
  ] as const) {
    if (!Array.isArray(list) || list.some((entry) => typeof entry !== "string")) {
      throw new ContentPolicyError("screenBatchSurfaces requires every list surface to be an array of strings");
    }
  }
  const patchText = input.patchText === null ? null : screenLines(input.patchText);
  const symbolNames = input.symbolNames.filter((name) => !containsSecretText(name));
  const citationQuotes = input.citationQuotes.filter((quote) => !containsSecretText(quote));
  const searchSnippets = input.searchSnippets.filter((snippet) => !containsSecretText(snippet));
  const contextExcerpts = input.contextExcerpts.filter((excerpt) => !containsSecretText(excerpt));
  const removedEntries =
    (input.patchText !== null && patchText === null ? 1 : 0) +
    (input.symbolNames.length - symbolNames.length) +
    (input.citationQuotes.length - citationQuotes.length) +
    (input.searchSnippets.length - searchSnippets.length) +
    (input.contextExcerpts.length - contextExcerpts.length);
  return {
    patchText,
    symbolNames,
    citationQuotes,
    searchSnippets,
    contextExcerpts,
    policyVersion: CONTENT_POLICY_VERSION,
    removedEntries,
  };
}

/**
 * Leak scanner for producer batches, sink calls and diagnostics: returns
 * the subset of known secrets found verbatim in the given values. Tests
 * and producer diagnostics use the same function, so the check the gate
 * runs is the check the producer runs.
 */
export function scanValuesForLeak(values: readonly string[], secrets: readonly string[]): string[] {
  const hit: string[] = [];
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    if (values.some((value) => value.includes(secret)) && !hit.includes(secret)) {
      hit.push(secret);
    }
  }
  return hit;
}
