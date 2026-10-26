// §7 digest preimages and digest functions. Each digest computes its exact
// preimage, then RFC 8785 canonical bytes, then SHA-256. No digest derives
// from another; equal values are never used as a check.
import { createHash } from "node:crypto";
import { canonicalBytes, sha256Hex } from "./canonical.js";
import type { Digest, MappingEntry, Pin } from "./types.js";

// --- P-CONTENT-DIAGRAM (§7.2): projection of a diagram profile's declarations ---

export interface DiagramProfileProjection {
  readonly profile: string;
  readonly completeness: "skeleton" | "complete";
  readonly entityTypes: readonly unknown[];
  readonly portTypes: readonly unknown[];
  readonly relationTypes: readonly unknown[];
  readonly constraints: readonly unknown[];
  readonly limits: {
    readonly maxEntities?: number | null;
    readonly maxRelations?: number | null;
    readonly maxEndpointsPerRelation?: number | null;
  };
}

function nullOf(value: number | null | undefined): number | null {
  return value ?? null;
}

/** P-CONTENT-DIAGRAM preimage: omitted limits hash as null (never 0, never dropped). */
export function contentDiagramPreimage(profile: DiagramProfileProjection): Record<string, unknown> {
  return {
    completeness: profile.completeness,
    constraints: [...profile.constraints],
    entityTypes: [...profile.entityTypes],
    limits: {
      maxEntities: nullOf(profile.limits.maxEntities),
      maxRelations: nullOf(profile.limits.maxRelations),
      maxEndpointsPerRelation: nullOf(profile.limits.maxEndpointsPerRelation),
    },
    portTypes: [...profile.portTypes],
    profile: profile.profile,
    relationTypes: [...profile.relationTypes],
  };
}

export function contentDiagramDigest(profile: DiagramProfileProjection): Digest {
  return sha256Hex(canonicalBytes(contentDiagramPreimage(profile)));
}

// --- P-PINS (§7.2): pin preimage for pinsDigest (all shapes) ---

export interface PinsPreimageInput {
  readonly layers: readonly Pin[];
  readonly ruleSheets?: readonly Pin[];
  readonly deltaDigest?: Digest | null;
  readonly mappingDigest?: Digest | null;
}

export function pinsPreimage(input: PinsPreimageInput): Record<string, unknown> {
  return {
    deltaDigest: input.deltaDigest ?? null,
    layers: input.layers.map((p) => ({ contentDigest: p.contentDigest, id: p.id, version: p.version })),
    mappingDigest: input.mappingDigest ?? null,
    ruleSheets: (input.ruleSheets ?? []).map((p) => ({
      contentDigest: p.contentDigest,
      id: p.id,
      version: p.version,
    })),
  };
}

export function pinsDigestOf(input: PinsPreimageInput): Digest {
  return sha256Hex(canonicalBytes(pinsPreimage(input)));
}

// --- P-DELTA (§7.2): single-value declaration digests, never whole profiles ---

/** stableForHash replica of S-ENGRAMHASH ([ENG] src/ontology-profile.ts:69–83). */
export function stableForHash(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((item, index) => stableForHash(item, [...path, String(index)]));
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === "sourcePath" || key === "profile_hash" || key === "bound_source_path") continue;
      if (key === "fn" && path.at(-1) === "normalize" && path.at(-2) === "linking") continue;
      result[key] = stableForHash((value as Record<string, unknown>)[key], [...path, key]);
    }
    return result;
  }
  return value;
}

/** Single declaration value via diagram canonical bytes (RFC 8785). */
export function declarationDigestDiagram(declaration: unknown): Digest {
  return sha256Hex(canonicalBytes(declaration));
}

/** Single declaration value via engram stable serialization. */
export function declarationDigestEngram(declaration: unknown): Digest {
  return createHash("sha256").update(JSON.stringify(stableForHash(declaration)), "utf8").digest("hex");
}

/** Single declaration value via owner d2d bytes (already canonical). */
export function declarationDigestOwnerBytes(canonicalDeclarationBytes: string): Digest {
  return sha256Hex(canonicalDeclarationBytes);
}

/**
 * Single rename/deprecate payload digest: rename hashes {from,kind,to};
 * deprecate-term hashes {reason,subject}.
 */
export function declarationDigestRename(from: string, to: string): Digest {
  return sha256Hex(canonicalBytes({ from, kind: "rename", to }));
}

export function declarationDigestDeprecateTerm(subject: string, reason: string): Digest {
  return sha256Hex(canonicalBytes({ reason, subject }));
}

export interface DeltaOperationDigest {
  readonly op: "add" | "narrow" | "rename-with-mapping" | "deprecate-term";
  readonly subject: string;
  readonly declarationDigest: Digest;
  readonly newName?: string;
}

export interface DeltaPreimageInput {
  readonly base: Pin;
  readonly mappingRef?: Pin | null;
  readonly operations: readonly DeltaOperationDigest[];
  readonly retiredFixtures: readonly { readonly fixtureRef: string; readonly reason: string }[];
  readonly retiredRules: readonly { readonly ruleId: string; readonly reason: string }[];
}

export function deltaPreimage(input: DeltaPreimageInput): Record<string, unknown> {
  return {
    base: { contentDigest: input.base.contentDigest, id: input.base.id, version: input.base.version },
    mappingRef:
      input.mappingRef === undefined || input.mappingRef === null
        ? null
        : {
            contentDigest: input.mappingRef.contentDigest,
            id: input.mappingRef.id,
            version: input.mappingRef.version,
          },
    operations: input.operations.map((op) =>
      op.newName === undefined
        ? { declarationDigest: op.declarationDigest, op: op.op, subject: op.subject }
        : { declarationDigest: op.declarationDigest, newName: op.newName, op: op.op, subject: op.subject },
    ),
    retiredFixtures: input.retiredFixtures.map((r) => ({ fixtureRef: r.fixtureRef, reason: r.reason })),
    retiredRules: input.retiredRules.map((r) => ({ reason: r.reason, ruleId: r.ruleId })),
  };
}

export function deltaDigestOf(input: DeltaPreimageInput): Digest {
  return sha256Hex(canonicalBytes(deltaPreimage(input)));
}

// --- P-MAPPING (§7.2): mapping file preimage (own contentDigest excluded) ---

export interface MappingPreimageInput {
  readonly mappingId: string;
  readonly version: string;
  readonly entries: readonly MappingEntry[];
}

export function mappingPreimage(input: MappingPreimageInput): Record<string, unknown> {
  return {
    entries: input.entries.map((e) => ({ ...e })),
    mappingId: input.mappingId,
    version: input.version,
  };
}

export function mappingDigestOf(input: MappingPreimageInput): Digest {
  return sha256Hex(canonicalBytes(mappingPreimage(input)));
}

// --- P-RESULT (§7.2): resolved-result preimage ---

export interface EffectiveRuleRow {
  readonly classification: string;
  readonly code: string;
  readonly messageKey: string;
  readonly ruleBody: unknown;
  readonly ruleId: string;
  readonly severity: string;
}

export interface ResultPreimageInput {
  /** P-CONTENT-DIAGRAM object (diagram) or stableForHash value (engram). */
  readonly effectiveDeclarations: unknown;
  readonly effectiveRuleSet: readonly EffectiveRuleRow[];
  readonly severityPolicyDigest: Digest | null;
}

export function resultPreimage(input: ResultPreimageInput): Record<string, unknown> {
  return {
    effectiveDeclarations: input.effectiveDeclarations,
    effectiveRuleSet: input.effectiveRuleSet.map((r) => ({
      classification: r.classification,
      code: r.code,
      messageKey: r.messageKey,
      ruleBody: r.ruleBody,
      ruleId: r.ruleId,
      severity: r.severity,
    })),
    severityPolicyDigest: input.severityPolicyDigest,
  };
}

/** Guardian-computable scopes (diagram/engram): SHA-256 over P-RESULT bytes. */
export function resultDigestOf(input: ResultPreimageInput): Digest {
  return sha256Hex(canonicalBytes(resultPreimage(input)));
}

/** Owner scope (d2d/private): SHA-256 over the complete native document bytes. */
export function ownerResultDigestOfDocument(completeCanonicalBytes: string): Digest {
  return sha256Hex(completeCanonicalBytes);
}

// --- Selection digest: SHA-256 of canonical {phase, readinessPolicy, settings} ---

export function severityPolicyDigestOf(
  phase: string,
  readinessPolicy: string,
  settings: readonly Record<string, unknown>[],
): Digest {
  return sha256Hex(canonicalBytes({ phase, readinessPolicy, settings: [...settings] }));
}

// --- P-ENTRY (§7.2): whole catalog entry, computed externally, never self-embedded ---

export function entryDigestOf(entry: Record<string, unknown>): Digest {
  if ("entryDigest" in entry) throw new Error("entry-digest-self-embedded");
  return sha256Hex(canonicalBytes(entry));
}
