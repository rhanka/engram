// Qualified DS adapter/renderer pinned references for diagram-presentation@1
// (frozen spec M3-R4 deb64b75, §3.2.1). Engram catalog side of the
// application pin equalities: input.adapterPin MUST equal the contract
// catalog ontology.compatibility.adapter exact pinned reference, and the
// adapter's bound schema asset MUST equal artifactBinding.schemaPin.
// Entry-byte resolution and view application stay DS execution (U-QUAL:
// no receipt exists, so the qualified entry below is still draft).
//
// Reference format (defined here; the spec prescribes the shape only through
// its A.3 fixture precedent `fixture:adapter@1#sha256=<hex>`):
//   ds:<repository>/<path>@<commit>#sha256=<sha256>
// where <repository> is the lot's qualified source repository
// (rhanka/sent-tech-design-system), <path> the entry file, <commit> the
// immutable 40-hex commit pinning the transitive sources, and <sha256> the
// 64-hex SHA-256 of the entry file bytes at that commit. parsePinnedDsRef
// refuses anything not matching, including every "transitional:" value.
//
// Canonical repository-relative POSIX path grammar for <path>:
// - nonempty segments separated by "/"; no empty segment (no leading,
//   trailing or doubled "/"), no "." or ".." segment;
// - no backslash, no control character (incl. NUL, \x00-\x1F, \x7F),
//   no "#" (fragment delimiter);
// - required entry-file suffix ".ts".
// Whitespace anywhere in the reference also refuses (transitional values
// included). Failures report presentation-pin-mismatch.
import type { Pin } from "./types.js";

/** Spec §3.2.1/C.3 refusal code for pin-equality failures. */
export const PRESENTATION_PIN_MISMATCH = "presentation-pin-mismatch" as const;

/** Qualified DS source repository (conductor-verified). */
export const DS_REPOSITORY = "rhanka/sent-tech-design-system" as const;
/** Immutable commit pinning the transitive DS sources (conductor-verified). */
export const DS_COMMIT = "e3bc10cc9e59d48bb807afc41173ba83f6698940" as const;

/** Schema adapter entry file (bound to schemaPin f13d5957…). */
export const DS_ADAPTER_PATH = "packages/diagram-core/src/presentation-validate.ts" as const;
/** Schema adapter entry bytes SHA-256 at DS_COMMIT (conductor-verified). */
export const DS_ADAPTER_SHA256 =
  "488d8499b8f4e624af56d0c4f4c07496cc09863ec1e65e9f522c6fc05a4db06e" as const;
/** Executor entry file. */
export const DS_RENDERER_PATH = "packages/diagram-core/src/presentation-apply.ts" as const;
/** Executor entry bytes SHA-256 at DS_COMMIT (conductor-verified). */
export const DS_RENDERER_SHA256 =
  "28c3607e5c4868d44c137b66fe8e6f6ed99cb578fc52a52f67442cca41802cd8" as const;

/** Qualified compatibility.adapter pinned reference (one per role). */
export const PINNED_ADAPTER_REF =
  `ds:${DS_REPOSITORY}/${DS_ADAPTER_PATH}@${DS_COMMIT}#sha256=${DS_ADAPTER_SHA256}` as const;
/** Qualified compatibility.renderer pinned reference (one per role). */
export const PINNED_RENDERER_REF =
  `ds:${DS_REPOSITORY}/${DS_RENDERER_PATH}@${DS_COMMIT}#sha256=${DS_RENDERER_SHA256}` as const;

/** Qualified compatibility carrier replacing the transitional strings. */
export const QUALIFIED_COMPATIBILITY = {
  renderer: PINNED_RENDERER_REF,
  adapter: PINNED_ADAPTER_REF,
} as const;

/** Parsed pinned DS reference. */
export interface PinnedDsRef {
  readonly repository: string;
  readonly commit: string;
  readonly path: string;
  readonly sha256: string;
}

const COMMIT_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REPO_PREFIX = `ds:${DS_REPOSITORY}/` as const;

function mismatch(reason: string): Error {
  return new Error(`${PRESENTATION_PIN_MISMATCH}:${reason}`);
}

/** Canonical entry-path check (see grammar above). Throws presentation-pin-mismatch. */
function assertCanonicalEntryPath(path: string): void {
  if (path.length === 0) throw mismatch("path");
  if (path.startsWith("/") || path.endsWith("/")) throw mismatch("path");
  if (path.includes("\\")) throw mismatch("path");
  if (path.includes("#")) throw mismatch("path");
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(path)) throw mismatch("path");
  if (!path.endsWith(".ts")) throw mismatch("path");
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0) throw mismatch("path");
    if (segment === "." || segment === "..") throw mismatch("path");
  }
}

/**
 * Parse an exact pinned DS reference. Refuses with
 * presentation-pin-mismatch on any non-matching value, including every
 * "transitional:" reference.
 */
export function parsePinnedDsRef(value: unknown): PinnedDsRef {
  if (typeof value !== "string") throw mismatch("not-a-string");
  if (value.startsWith("transitional:")) throw mismatch("transitional-reference");
  if (!value.startsWith(REPO_PREFIX)) throw mismatch("unknown-repository");
  if (/\s/.test(value)) throw mismatch("whitespace");
  const fragment = "#sha256=";
  const hashIndex = value.indexOf(fragment);
  if (hashIndex < 0 || value.indexOf(fragment, hashIndex + 1) >= 0) throw mismatch("sha256-fragment");
  const sha256 = value.slice(hashIndex + fragment.length);
  if (!SHA256_RE.test(sha256)) throw mismatch("sha256");
  const head = value.slice(REPO_PREFIX.length, hashIndex);
  const atIndex = head.indexOf("@");
  if (atIndex < 0 || head.indexOf("@", atIndex + 1) >= 0) throw mismatch("commit-separator");
  const path = head.slice(0, atIndex);
  const commit = head.slice(atIndex + 1);
  assertCanonicalEntryPath(path);
  if (!COMMIT_RE.test(commit)) throw mismatch("commit");
  return { repository: DS_REPOSITORY, commit, path, sha256 };
}

/**
 * Project a parsed pinned DS reference onto the Pin shape the DS executor
 * compares (DS presentation.ts `parsePinnedAdapterReference` at e3bc10cc):
 * id `ds:<repository>/<path>`, version `<commit>`, contentDigest `<sha256>`.
 */
export function pinnedRefToAdapterPin(ref: PinnedDsRef): Pin {
  return {
    id: `ds:${ref.repository}/${ref.path}`,
    version: ref.commit,
    contentDigest: ref.sha256,
  };
}

function isPinLike(value: unknown): value is Pin {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["id"] === "string" &&
    (record["id"] as string).length > 0 &&
    typeof record["version"] === "string" &&
    (record["version"] as string).length > 0 &&
    typeof record["contentDigest"] === "string" &&
    SHA256_RE.test(record["contentDigest"] as string)
  );
}

/** Pin equality means equality of id, version and contentDigest (spec §3.2.1). */
export function isExactPin(a: Pin, b: Pin): boolean {
  return a.id === b.id && a.version === b.version && a.contentDigest === b.contentDigest;
}

export type PresentationPinCheck =
  | { readonly outcome: "ok" }
  | { readonly outcome: "refused"; readonly code: typeof PRESENTATION_PIN_MISMATCH; readonly path: string };

/**
 * Engram catalog side of the spec §3.2.1 application pin equalities:
 * input.contractPin MUST equal the resolved contract pin, and input.adapterPin
 * (frozen M3 §3.2.1 Pin { id, version, contentDigest }) MUST equal the Pin
 * projected from the contract catalog ontology.compatibility.adapter exact
 * pinned reference (DS parsePinnedAdapterReference shape at e3bc10cc: id
 * `ds:<repository>/<path>`, version `<commit>`, contentDigest `<sha256>`).
 * (The adapter schema-binding equality against artifactBinding.schemaPin is
 * carried by the qualified catalog entry itself and asserted where that entry
 * is built.) Unknown, transitional, malformed or non-matching pins refuse
 * with presentation-pin-mismatch; no candidate view is produced here.
 */
export function checkPresentationPins(
  input: { readonly contractPin: Pin; readonly adapterPin: Pin },
  resolved: { readonly contractPin: Pin; readonly adapterRef: string },
): PresentationPinCheck {
  if (!isExactPin(input.contractPin, resolved.contractPin)) {
    return { outcome: "refused", code: PRESENTATION_PIN_MISMATCH, path: "input.contractPin" };
  }
  let expectedAdapterPin: Pin;
  try {
    expectedAdapterPin = pinnedRefToAdapterPin(parsePinnedDsRef(resolved.adapterRef));
  } catch {
    return { outcome: "refused", code: PRESENTATION_PIN_MISMATCH, path: "input.adapterPin" };
  }
  if (!isPinLike(input.adapterPin) || !isExactPin(input.adapterPin, expectedAdapterPin)) {
    return { outcome: "refused", code: PRESENTATION_PIN_MISMATCH, path: "input.adapterPin" };
  }
  return { outcome: "ok" };
}
