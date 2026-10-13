// @sentropic/engram-live/snapshots — latest-only encrypted local snapshots
// (spec/SPEC_LIVE_GIT_INDEXING.md §§8, 10; plan/09 L4b; owner Q2 B).
//
// Only the last authorized local state is retained, sealed by the host
// protection BEFORE any persistent write; no local history exists. The
// store port atomically replaces the single latest state per target, and
// the sink port keeps only the highest accepted generation per target
// (L4b M2: replacement indexed by target and generation, never by a
// predecessor pointer). Without a protection key the engine emits allowed
// metadata/ranges only with explicit content_unavailable coverage and never
// calls protect; on unregister it stops work, rejects delayed jobs and
// requests the private purge while preserving authorized committed history
// (no committed-history deletion exists on any port here, by construction).
//
// Neutrality: this module imports ONLY ./contracts.js (data-pure DTOs,
// constants and validators) plus node:crypto for digests and snapshot ids.
// No h2a, no cluster-mesh, no sentropic, no storage driver, no network, no
// filesystem, no clock read — the capture time is injected.
//
// Host contract (S: protected-payload.ts + sqlite.ts, H: live-key-provider.ts
// — NOT implemented here): S seals at rest, proves no fixture plaintext in
// real DB/WAL/search/temp/log/backup, purges on unregister and revokes
// decryptability; H keeps keys outside the database and denies decryption
// on missing/revoked keys. Engram defines the three ports below; S and H
// implement the durable and cryptographic sides.

import { createHash } from "node:crypto";
import { classifyPath, containsSecretText, matchSecretRule, protectedPathRef } from "./content-policy.js";
import {
  CONTENT_POLICY_VERSION,
  CONTRACT_VERSION,
  PRODUCER_NAME,
  isLocalSealAlgorithm,
  isStrictBatchId,
  isStrictGenerationId,
  isStrictKeyRef,
  validateDeclarationRevocation,
  validateFactBatch,
  validateLiveScope,
  validateLocalCoverage,
  validateLocalDiff,
  validateLocalSnapshot,
  validateSealedLocalDiff,
  withheldReasonForSecretRule,
  type DeclarationRevocationDto,
  type FactBatchDto,
  type LiveScope,
  type LocalCoverageReportDto,
  type LocalDiffDto,
  type LocalDiffKind,
  type LocalSnapshotDto,
} from "./contracts.js";

/**
 * Closed refusal codes (conducteur mineur: every SnapshotError message is
 * one of these constants). Caller-supplied details never reach the message:
 * they travel in `details` as enumerated codes and numeric indices only,
 * never as joined strings.
 */
export const SNAPSHOT_ERROR_CODES = [
  "sink-admission-secret-signal",
  "sink-admission-protected-path",
  "sink-admission-shape",
  "sink-delivery-refused",
  "sink-receipt-mismatch",
  "invalid-scope",
  "invalid-worktree-id",
  "invalid-kind",
  "invalid-captured-at",
  "invalid-diff",
  "stale-policy",
  "invalid-batch-id",
  "invalid-generation-id",
  "foreign-tenant-clone",
  "foreign-worktree-scope",
  "foreign-worktree",
  "foreign-kind",
  "store-load-refused",
  "protection-hunk-refused",
  "protection-envelope-shape",
  "protection-snapshot-refused",
  "sealed-shape",
  "sealed-unproven",
  "invalid-snapshot",
  "invalid-coverage",
  "store-conflict",
  "store-receipt-incomplete",
  "sink-receipt-incomplete",
  "invalid-revocation",
  "revocation-shape",
  "purge-refused",
  "purge-incomplete",
] as const;

export type SnapshotErrorCode = (typeof SNAPSHOT_ERROR_CODES)[number];

export interface SnapshotErrorDetails {
  readonly codes: readonly SnapshotErrorCode[];
  readonly indices: readonly number[];
}

export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;
  readonly details: SnapshotErrorDetails;
  constructor(code: SnapshotErrorCode, details?: Partial<SnapshotErrorDetails>) {
    super(code);
    this.name = "SnapshotError";
    this.code = code;
    this.details = {
      codes: details?.codes ?? [code],
      indices: details?.indices ?? [],
    };
  }
}

/**
 * THE injected content-protection port (plan/09 L4b: a port, never a
 * base). Engram defines the contract only; cluster-mesh implements the
 * sealed envelope and SQLite placement behind it. Plaintext enters only
 * as the call argument and never reaches the store or the sink except
 * through the returned ciphertext.
 */
export interface ContentProtectionPort {
  protect(plaintext: Uint8Array): Promise<SealedSnapshotPayload>;
}

/** The sealed envelope the host protection returns (ciphertext only). */
export interface SealedSnapshotPayload {
  readonly state: "sealed";
  readonly algorithm: string;
  readonly keyRef: string;
  readonly ciphertext: Uint8Array;
}

/** Alias kept for the injected-port signature readability. */
export type SealedPayload = SealedSnapshotPayload;

/**
 * THE injected latest-only store port (a port, never a base). The port
 * exposes no list/history accessor by construction: only the newest state
 * per (scope, worktreeId, kind, diffKind) is loadable — staged, unstaged
 * et conflict (toutes ses étapes) hold distinct targets — which is what
 * makes "no local history" structural rather than promised. No committed-history
 * deletion exists on this port: purge removes private snapshots only.
 *
 * Replacement is atomic by contract: replaceLatest stores the new snapshot
 * and withdraws the expected superseded one from EVERY persistent surface
 * (payload bytes, derived indexes, decryptability) in one operation, then
 * attests the withdrawal in its receipt. A store-then-delete pair is NOT
 * a valid implementation: when the receipt reports a surviving predecessor,
 * engram refuses success and delivers nothing. An expected-superseded id
 * that no longer names the current latest (two captures racing on one
 * predecessor) is a conflict the host refuses by throwing: the loser never
 * persists, so concurrent captures can never leave two latest states.
 */
export interface LatestSnapshotPort {
  loadLatest(query: LatestSnapshotQuery): Promise<LocalSnapshotDto | null>;
  replaceLatest(
    snapshot: LocalSnapshotDto,
    expectedSupersededId: string | null,
    generationId: string,
  ): Promise<ReplaceLatestReceipt>;
  purgePrivate(query: LatestSnapshotScope): Promise<PurgePrivateReceipt>;
}

export interface LatestSnapshotQuery {
  readonly scope: LiveScope;
  readonly worktreeId: string;
  readonly kind: "index" | "working-tree";
  /** Which local comparison is queried: staged and conflict are distinct index targets (L4b-2). */
  readonly diffKind: LocalDiffKind;
  /** Capture generation that observed this state: lets the host block work predating a purge. */
  readonly generationId: string;
}

export interface LatestSnapshotScope {
  readonly scope: LiveScope;
  readonly worktreeId: string;
  readonly declarationId: string;
  readonly declarationRevision: number;
}

/** Atomic-replacement receipt: proves one latest state, never a history. */
export interface ReplaceLatestReceipt {
  readonly received: true;
  /** The expected predecessor is withdrawn from every persistent surface. */
  readonly retiredPrevious: boolean;
  /** The predecessor payload can no longer be decrypted. */
  readonly revokedDecryptability: boolean;
  /** No task older than this replacement may persist afterwards. */
  readonly blockedStaleWork: boolean;
}

/** Unregister-purge receipt: proves bounded work, not bare constants. */
export interface PurgePrivateReceipt {
  readonly purgedPrivate: boolean;
  /** Every pre-purge capture/generation is blocked from persisting. */
  readonly blockedOldWork: boolean;
  /** Purged payloads can no longer be decrypted. */
  readonly revokedDecryptability: boolean;
}

/**
 * THE injected fact-sink port: durable receipt of one batch, separate from
 * publication (spec §3). Replacement is indexed by target and generation
 * (L4b M2), never by a predecessor pointer: the target is (scope tenant,
 * scope clone, scope worktree, worktreeId, snapshot kind, snapshot
 * diffKind — staged, unstaged and conflict each hold their own target,
 * L4b-2; sans snapshot : kind = coverage.axis, diffKind = diff.kind)
 * and every delivery carries its batch.generationId, which producers
 * mint fixed-width zero-padded numeric and monotone per target (L4b-2 m9:
 * lexicographic order is numeric order). The host MUST keep only the
 * highest accepted generation per target: it durably rejects (throws,
 * persists nothing) any delivery whose generationId is less than or equal
 * to the held generation for that target, and accepting a generation G
 * withdraws every older generation for that target from every sink surface
 * (payload bytes, derived indexes, decryptability) in the same operation.
 * A suspended B followed by a delivered C then an arriving B is therefore
 * rejected, keeping the single state C whichever order B and C arrive in.
 *
 * Unstable captures (L4b-2 m8): the store and the sink deliberately
 * diverge. The store keeps the previous valid state untouched (an unstable
 * capture never replaces the last valid state) while the sink accepts the
 * unstable lot for its target — retiring the previous holding — so the
 * instability itself is durably visible with explicit unavailable coverage.
 * Both sides stay explicit: nothing is silently lost on either.
 */
export interface FactSinkPort {
  deliver(batch: FactBatchDto): Promise<FactSinkReceipt>;
}

export interface FactSinkReceipt {
  readonly received: true;
  readonly batchId: string;
  /** Every older generation for this target is withdrawn from sink surfaces (vacuously true on a first delivery). */
  readonly retiredSuperseded: boolean;
  /** Withdrawn payloads can no longer be decrypted. */
  readonly revokedDecryptability: boolean;
}

export interface StageLocalSnapshotInput {
  readonly scope: LiveScope;
  readonly worktreeId: string;
  readonly kind: "index" | "working-tree";
  /** Injected capture time for capturedAt (ms); the engine reads no clock. */
  readonly capturedAt: number;
  readonly diff: LocalDiffDto;
  /** Latest-state payload to seal (hunks/state bytes); dropped unsealed, never stored raw. */
  readonly plaintextPayload: Uint8Array | null;
  /** Null drives the metadata-only downgrade: no protect call, no plaintext anywhere downstream. */
  readonly protection: ContentProtectionPort | null;
  readonly store: LatestSnapshotPort;
  readonly sink: FactSinkPort;
  readonly batchId: string;
  readonly generationId: string;
}

export interface StageLocalSnapshotOutcome {
  readonly snapshot: LocalSnapshotDto;
  readonly coverage: LocalCoverageReportDto;
  readonly diagnostics: readonly string[];
  readonly batch: FactBatchDto;
}

export interface UnregisterPurgeInput {
  readonly revocation: DeclarationRevocationDto;
  readonly store: LatestSnapshotPort;
}

export interface UnregisterPurgeOutcome {
  readonly stoppedWork: true;
  readonly rejectedDelayedJobs: true;
  readonly purgedPrivate: boolean;
  readonly preservedCommittedHistory: true;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function toJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, (_key, node: unknown) =>
    node instanceof Uint8Array ? { $bytes: bytesToHex(node) } : node,
  ));
}

/** Canonical digest of the screened diff: binds the snapshot to exactly what policy allowed. */
export function digestLocalDiff(diff: LocalDiffDto): string {
  return sha256Hex(toJsonBytes(diff));
}

/**
 * Registre privé des charges scellées admises (L4b-sol5 Majeur 1) : chaque
 * objet `sealed` produit par le port de protection au cours d'une admission
 * y est enregistré par identité. Un contenu `sealed` fourni par l'appelant
 * dans un DTO direct n'y figure jamais et est refusé par la porte du sink.
 * Non exporté : l'appelant ne peut ni le lire ni y inscrire.
 */
const admittedSeals = new WeakSet<object>();

/** Copie d'octets privée : duplique la vue en préservant le type Buffer. */
function copyBytesPrivate(bytes: Uint8Array): Uint8Array {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)) return Buffer.from(bytes);
  return Uint8Array.from(bytes);
}

/** Clés propres refusées à l'admission (code constant, jamais interpolées). */
const FORBIDDEN_OWN_KEYS: readonly string[] = ["__proto__", "constructor", "prototype"];

function assertNoForbiddenOwnKey(node: object): void {
  for (const key of Object.getOwnPropertyNames(node)) {
    if ((FORBIDDEN_OWN_KEYS as readonly string[]).includes(key)) throw new SnapshotError("invalid-diff");
  }
}

/**
 * Copie profonde d'admission : objets SANS prototype (aucune clé propre
 * `__proto__`/`constructor`/`prototype` ne devient un prototype), vues
 * d'octets dupliquées en copies privées. Toute clé propre interdite est
 * refusée (code constant), que l'original soit par ailleurs valide ou non.
 */
function deepCloneAdmitted(value: unknown): unknown {
  if (value instanceof Uint8Array) return copyBytesPrivate(value);
  if (Array.isArray(value)) {
    assertNoForbiddenOwnKey(value);
    return value.map(deepCloneAdmitted);
  }
  if (value !== null && typeof value === "object") {
    assertNoForbiddenOwnKey(value);
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(value)) out[key] = deepCloneAdmitted(item);
    return out;
  }
  return value;
}

/**
 * Copie privée de livraison : duplique le lot (octets copiés, objets neufs)
 * en propageant l'enregistrement des scellés — la copie d'un scellé admis
 * est enregistrée, un scellé non admis reste non prouvé et la porte le
 * refuse. Le lot livré ne partage AUCUNE référence avec l'appelant, le port
 * de protection, le magasin, ni les objets retournés.
 */
function deepCopyForDelivery(value: unknown, seen: Map<object, unknown> = new Map()): unknown {
  if (value instanceof Uint8Array) return copyBytesPrivate(value);
  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached !== undefined) return cached;
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) out.push(deepCopyForDelivery(item, seen));
    if (admittedSeals.has(value)) admittedSeals.add(out);
    return out;
  }
  if (value !== null && typeof value === "object") {
    const cached = seen.get(value);
    if (cached !== undefined) return cached;
    const out: Record<string, unknown> = {};
    seen.set(value, out);
    for (const [key, item] of Object.entries(value)) out[key] = deepCopyForDelivery(item, seen);
    if (admittedSeals.has(value)) admittedSeals.add(out);
    return out;
  }
  return value;
}

/** Gel récursif d'admission (les vues typées, déjà copiées, sont détachées). */
function deepFreezeAdmitted(value: unknown, seen: Set<object> = new Set()): void {
  if (value === null || typeof value !== "object") return;
  if (value instanceof Uint8Array) return;
  const node = value as object;
  if (seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeAdmitted(item, seen);
  } else {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreezeAdmitted(item, seen);
  }
  Object.freeze(node);
}

/** Refus d'entrée : aucun hunk du DTO appelant ne porte un état scellé. */
function assertNoCallerSeal(diff: LocalDiffDto): void {
  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      if ((hunk.payload as { state?: unknown }).state === "sealed") {
        throw new SnapshotError("sealed-unproven");
      }
    }
  }
}

/**
 * Preuve de scellement à la porte du sink : chaque objet `sealed` du lot
 * est enregistré dans le registre privé, donc produit par le port de
 * protection au cours d'une admission. Tout autre objet scellé est un
 * contenu fourni par l'appelant et est refusé (code constant).
 */
function assertSealedProvenance(batch: FactBatchDto): void {
  for (const fact of batch.facts) {
    const files = (fact as { files?: unknown }).files;
    if (Array.isArray(files)) {
      for (const file of files) {
        const hunks = (file as { hunks?: unknown }).hunks;
        if (!Array.isArray(hunks)) continue;
        for (const hunk of hunks) {
          const payload = (hunk as { payload?: unknown }).payload;
          if (payload !== null && typeof payload === "object" &&
            (payload as { state?: unknown }).state === "sealed" &&
            !admittedSeals.has(payload)) {
            throw new SnapshotError("sealed-unproven");
          }
        }
      }
    }
    const sealed = (fact as { sealed?: unknown }).sealed;
    if (sealed !== null && typeof sealed === "object" &&
      (sealed as { state?: unknown }).state === "sealed" &&
      !admittedSeals.has(sealed)) {
      throw new SnapshotError("sealed-unproven");
    }
  }
}

/**
 * THE single sink gate: every delivery to the fact sink leaves through
 * this function, whatever the entry path (derived diff, direct DTO,
 * replacement, unstable preservation). No free text reaches the sink:
 * every emitted string is either a closed-enumeration value
 * (withheld/coverage/exclusion/algorithm), a strict opaque identifier
 * (keyRef, qualified OID, state id, batch/generation id), a
 * path-protection-screened path, or protection-sealed bytes. The gate
 * enforces this in two layers: the closed structural schema
 * (validateFactBatch: unknown keys refused, every string field against its
 * enumeration or strict pattern) then a generic walk over all string and
 * byte fields — never a hardcoded field list, so a field added later is
 * screened too — refusing the batch when a known secret signal or a
 * protected carrier subsists.
 */
function assertSinkAdmissible(value: unknown): void {
  // m5: sealed ciphertext of an admitted seal is opaque host output, never
  // cleartext — it is skipped, so random seal bytes can never false-positive
  // as a secret signal or a protected path. Protected-path screening
  // applies to path fields only (`path` / `previousPath`); every other
  // string/byte field keeps the secret-signal scan.
  const visit = (node: unknown, key: string | null): void => {
    if (typeof node === "string") {
      if (containsSecretText(node)) {
        throw new SnapshotError("sink-admission-secret-signal");
      }
      return;
    }
    if (node instanceof Uint8Array) {
      if (node.length > 0) {
        if (containsSecretText(new TextDecoder().decode(node))) {
          throw new SnapshotError("sink-admission-secret-signal");
        }
        if ((key === "path" || key === "previousPath") && classifyPath(node).allowed === false) {
          throw new SnapshotError("sink-admission-protected-path");
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, null);
      return;
    }
    if (node !== null && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (record["state"] === "sealed" && admittedSeals.has(node)) {
        for (const [entryKey, item] of Object.entries(record)) {
          if (entryKey === "ciphertext") continue;
          visit(item, entryKey);
        }
        return;
      }
      for (const [entryKey, item] of Object.entries(record)) visit(item, entryKey);
    }
  };
  visit(value, null);
}

async function admitToSink(batch: FactBatchDto, sink: FactSinkPort): Promise<FactSinkReceipt> {
  // Livraison depuis une copie privée jamais exposée : le sink ne détient
  // aucune référence partagée avec l'appelant, le port, le magasin, ni les
  // objets retournés (un tampon ne pouvant pas être gelé, seule la copie
  // protège). L'enregistrement des scellés suit la copie.
  const privateBatch = deepCopyForDelivery(batch) as FactBatchDto;
  const batchChecked = validateFactBatch(privateBatch);
  if (!batchChecked.ok) {
    throw new SnapshotError("sink-admission-shape");
  }
  assertSealedProvenance(privateBatch);
  assertSinkAdmissible(privateBatch);
  // m1: receipt fields are port-owned data and may throw through accessors;
  // every read stays inside the try and maps to a constant code.
  let receipt: FactSinkReceipt;
  try {
    receipt = await sink.deliver(privateBatch);
    if (receipt.batchId !== privateBatch.batchId) {
      throw new SnapshotError("sink-receipt-mismatch");
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError("sink-delivery-refused");
  }
  return receipt;
}

function checkScope(scope: LiveScope): LiveScope {
  const checked = validateLiveScope(scope);
  if (!checked.ok) {
    throw new SnapshotError("invalid-scope", { indices: [checked.errors.length] });
  }
  return {
    tenant: scope.tenant,
    clone: scope.clone,
    ...(scope.worktree === undefined ? {} : { worktree: scope.worktree }),
  };
}

/**
 * Stage the latest authorized local state: seal through the injected
 * protection, store the replacement, delete the superseded snapshot, then
 * deliver exactly one batch. Plaintext is sealed before the first
 * persistent write; without a key only metadata is emitted.
 */
/**
 * Pre-persistence secret screening of an admitted diff (L4b-2 MAJEUR 1):
 * runs synchronously at admission, before any protect call. Open hunk
 * lines carrying a detected secret become explicit `withheld` facts;
 * secret-bearing paths become protected exclusions with a stable opaque
 * reference (mirroring derivation); anything else is untouched. The secret
 * itself never reaches the protection port, the store or the sink.
 */
function prescreenAdmittedDiff(admittedDiff: LocalDiffDto): void {
  const mutable = admittedDiff as unknown as {
    files: {
      path: Uint8Array;
      previousPath: Uint8Array | null;
      exclusion?: unknown;
      added: unknown;
      deleted: unknown;
      hunks: { payload: unknown }[];
    }[];
  };
  for (const file of mutable.files) {
    // MAJEUR 2 (Opus tour 1): the current path AND the previous path
    // (rename) are screened — when either is protected or carries a
    // secret signal the whole file content is excluded with explicit
    // coverage, never transmitted to protect. Both present paths become
    // opaque references so the protected bound never persists raw.
    // MINEUR 1 (Opus tour 2): shape validation runs before this screen —
    // only byte views are screened here; any other shape (string, number,
    // absent) is left for validateLocalDiff, which refuses it as
    // `invalid-diff`.
    const pathBlocked =
      file.path instanceof Uint8Array && classifyPath(file.path).allowed === false;
    const previousBlocked =
      file.previousPath instanceof Uint8Array &&
      classifyPath(file.previousPath).allowed === false;
    if (pathBlocked || previousBlocked) {
      file.path = protectedPathRef(file.path);
      if (file.previousPath !== null) {
        file.previousPath = protectedPathRef(file.previousPath);
      }
      file.exclusion = file.exclusion ?? "protected";
      file.added = null;
      file.deleted = null;
      file.hunks = [];
      continue;
    }
    for (const hunk of file.hunks) {
      const payload = hunk.payload as { state?: unknown; lines?: unknown };
      if (payload.state !== "open-lines" || !Array.isArray(payload.lines)) continue;
      const secretLine = (payload.lines as unknown[]).find(
        (line) => typeof line === "string" && containsSecretText(line),
      );
      if (secretLine !== undefined) {
        hunk.payload = {
          state: "withheld",
          reason: withheldReasonForSecretRule(matchSecretRule(secretLine as string)),
        };
      }
    }
  }
}

export async function stageLocalSnapshot(input: StageLocalSnapshotInput): Promise<StageLocalSnapshotOutcome> {
  // Admission synchrone (L4b-sol5 Majeur 2) : le lot appelant est copié en
  // profondeur (vues d'octets dupliquées) puis gelé AVANT toute suspension.
  // La validation, le scellement et la livraison portent sur CETTE copie
  // uniquement ; aucune référence de l'appelant n'atteint le sink, et une
  // mutation du DTO d'origine après admission ne traverse jamais.
  // Majeur 1 : tout contenu `sealed` fourni par l'appelant est refusé ici,
  // avec et sans clé — seul le port de protection scelle, pendant
  // l'admission, et chaque objet scellé est enregistré au registre privé.
  // m2 : every entry field is frozen into a local before the first await,
  // so a caller mutating its own input across a suspension changes nothing.
  const admittedDiff = deepCloneAdmitted(input.diff) as LocalDiffDto;
  assertNoCallerSeal(admittedDiff);
  prescreenAdmittedDiff(admittedDiff);
  deepFreezeAdmitted(admittedDiff);
  const admittedPayload = input.plaintextPayload === null ? null : copyBytesPrivate(input.plaintextPayload);
  const scope = checkScope(input.scope);
  const worktreeId = input.worktreeId;
  const snapshotKind = input.kind;
  const capturedAt = input.capturedAt;
  const batchId = input.batchId;
  const generationId = input.generationId;
  const protection = input.protection;
  const store = input.store;
  const sink = input.sink;
  // L4b-2 MAJEUR 1: a secret-bearing payload is never transmitted to
  // protect, even sealed. Detection runs here, before the first host call.
  const payloadWithheldByPolicy =
    admittedPayload !== null && containsSecretText(new TextDecoder().decode(admittedPayload));
  if (!isStrictBatchId(worktreeId, "wt:")) {
    throw new SnapshotError("invalid-worktree-id");
  }
  if (snapshotKind !== "index" && snapshotKind !== "working-tree") {
    throw new SnapshotError("invalid-kind");
  }
  if (typeof capturedAt !== "number" || !Number.isSafeInteger(capturedAt) || capturedAt <= 0) {
    throw new SnapshotError("invalid-captured-at");
  }
  const diffChecked = validateLocalDiff(admittedDiff);
  if (!diffChecked.ok) {
    throw new SnapshotError("invalid-diff", { indices: [diffChecked.errors.length] });
  }
  if (admittedDiff.policyVersion !== CONTENT_POLICY_VERSION) {
    throw new SnapshotError("stale-policy");
  }
  if (!isStrictBatchId(batchId, "batch:")) {
    throw new SnapshotError("invalid-batch-id");
  }
  if (!isStrictGenerationId(generationId)) {
    throw new SnapshotError("invalid-generation-id");
  }

  // Scope/kind binding (spec §8): a diff never changes scope or
  // comparison kind on its way into a snapshot. Opaque refusals: tenant,
  // clone and worktree names are caller data and are never echoed.
  if (admittedDiff.scope.tenant !== scope.tenant || admittedDiff.scope.clone !== scope.clone) {
    throw new SnapshotError("foreign-tenant-clone");
  }
  if ((admittedDiff.scope.worktree ?? null) !== (scope.worktree ?? null)) {
    throw new SnapshotError("foreign-worktree-scope");
  }
  if (admittedDiff.worktreeId !== worktreeId) {
    throw new SnapshotError("foreign-worktree");
  }
  const kindMatches =
    (admittedDiff.kind === "staged" && snapshotKind === "index") ||
    (admittedDiff.kind === "unstaged" && snapshotKind === "working-tree") ||
    (admittedDiff.kind === "conflict" && snapshotKind === "index");
  if (!kindMatches) {
    throw new SnapshotError("foreign-kind");
  }
  const diffKind: LocalDiffKind = admittedDiff.kind;

  // Generation binding BEFORE any suspendable host call: the capture
  // generation is registered through loadLatest before hunk encryption, so
  // a purge across a suspended protect blocks this generation and the
  // resumed capture can never persist afterwards.
  // m4 + m1-bis: the store-owned previous state is validated and
  // privately copied inside the try: malformed states, foreign-target
  // states and throwing accessors are refused with a constant code, and
  // the caller never shares a reference with the store through the
  // returned snapshot or the diagnostics.
  let previous: LocalSnapshotDto | null;
  try {
    previous = await store.loadLatest({
      scope,
      worktreeId,
      kind: snapshotKind,
      diffKind,
      generationId,
    });
    if (previous !== null) {
      const previousChecked = validateLocalSnapshot(previous);
      if (!previousChecked.ok) {
        throw new SnapshotError("store-load-refused");
      }
      // MAJEUR 1 (Opus tour 1): the store holds one latest per full
      // target (scope, worktreeId, kind, diffKind) — staged, unstaged
      // et conflict (toutes ses étapes) are distinct tenues. A previous
      // from another target is refused, never silently retired or
      // preserved.
      if (previous.worktreeId !== worktreeId ||
        previous.kind !== snapshotKind ||
        previous.diffKind !== diffKind ||
        previous.scope.tenant !== scope.tenant ||
        previous.scope.clone !== scope.clone ||
        ((previous.scope.worktree ?? null) !== (scope.worktree ?? null))) {
        throw new SnapshotError("store-load-refused");
      }
      previous = deepCopyForDelivery(previous) as LocalSnapshotDto;
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError("store-load-refused");
  }
  // Seal every transient open hunk through the host protection, one call
  // per hunk, before anything persistent is written. Without a key the
  // metadata-only downgrade withholds open lines explicitly (bounds kept,
  // explicit content_unavailable coverage) instead of throwing: text is
  // dropped here, never stored. Host protect refusals carry constant codes
  // only: messages from the port never reach the error surface.
  const sealedFiles = [];
  let sealedHunks = 0;
  let withheldHunks = 0;
  for (const file of admittedDiff.files) {
    const hunks = [];
    for (const hunk of file.hunks) {
      if (hunk.payload.state === "withheld") {
        withheldHunks += 1;
        hunks.push(hunk);
      } else if (hunk.payload.state === "open-lines") {
        if (protection === null) {
          withheldHunks += 1;
          hunks.push({
            startBefore: hunk.startBefore,
            countBefore: hunk.countBefore,
            startAfter: hunk.startAfter,
            countAfter: hunk.countAfter,
            payload: {
              state: "withheld" as const,
              reason: "withheld-no-protection-key" as const,
            },
          });
          continue;
        }
        // m1: the envelope fields are port-owned data; every read stays
        // inside the try and maps to a constant code.
        let hunkSeal: { readonly state: "sealed"; readonly algorithm: string; readonly keyRef: string; readonly ciphertext: Uint8Array };
        try {
          const sealed = await protection.protect(
            new TextEncoder().encode(JSON.stringify({ lines: [...hunk.payload.lines] })),
          );
          if (!isLocalSealAlgorithm(sealed.algorithm) || !isStrictKeyRef(sealed.keyRef)) {
            throw new SnapshotError("protection-envelope-shape");
          }
          hunkSeal = {
            state: "sealed" as const,
            algorithm: sealed.algorithm,
            keyRef: sealed.keyRef,
            ciphertext: copyBytesPrivate(sealed.ciphertext),
          };
        } catch (error) {
          if (error instanceof SnapshotError) throw error;
          throw new SnapshotError("protection-hunk-refused");
        }
        sealedHunks += 1;
        admittedSeals.add(hunkSeal);
        hunks.push({
          startBefore: hunk.startBefore,
          countBefore: hunk.countBefore,
          startAfter: hunk.startAfter,
          countAfter: hunk.countAfter,
          payload: hunkSeal,
        });
      } else {
        hunks.push(hunk);
      }
    }
    sealedFiles.push({ ...file, hunks });
  }
  const sealedDiff: LocalDiffDto = { ...admittedDiff, files: sealedFiles };
  const sinkShape = validateSealedLocalDiff(sealedDiff);
  if (!sinkShape.ok) {
    throw new SnapshotError("sealed-shape", { indices: [sinkShape.errors.length] });
  }

  const diffDigest = digestLocalDiff(sealedDiff);
  const unstable = sealedDiff.coverage?.cause === "unstable-capture";

  const snapshotId = `lsnap:${sha256Hex(new TextEncoder().encode(JSON.stringify([
    scope.tenant,
    scope.clone,
    worktreeId,
    snapshotKind,
    diffKind,
    capturedAt,
    diffDigest,
  ])))}`;
  const excluded = sealedDiff.files.filter((file) => file.exclusion !== undefined).length;

  // An unstable capture never replaces the last valid state: the previous
  // snapshot (when any) is preserved untouched, nothing is stored, and the
  // lot carries the instability explicitly (sealed diff plus unavailable
  // coverage). Without a previous state the unavailable snapshot is stored
  // as the first latest, superseded by the next valid capture.
  if (unstable && previous !== null) {
    const coverage: LocalCoverageReportDto = {
      axis: snapshotKind,
      state: "unavailable",
      reason: "content_unavailable:unstable-capture",
      cause: "unstable-capture",
    };
    const diagnostics = [
      `local ${snapshotKind} capture unstable: preserved ${previous.snapshotId}, ` +
      `${sealedDiff.files.length} file fact(s) withheld (${CONTENT_POLICY_VERSION})`,
    ];
    const batch: FactBatchDto = {
      scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: CONTENT_POLICY_VERSION,
      generationId,
      batchId,
      batchDigest: sha256Hex(toJsonBytes([generationId, batchId, sealedDiff, coverage])),
      facts: [sealedDiff, coverage],
    };
    await admitToSink(batch, sink);
    return { snapshot: previous, coverage, diagnostics, batch };
  }

  let sealed: LocalSnapshotDto["sealed"];
  let coverage: LocalCoverageReportDto;
  if (payloadWithheldByPolicy) {
    // L4b-2 MAJEUR 1: the payload carried a detected secret — it was never
    // transmitted to protect. Metadata only, with explicit
    // policy-withheld coverage; zero protect calls downstream either.
    sealed = { state: "metadata-only", reason: "metadata:policy-withheld" as const };
    coverage = {
      axis: snapshotKind,
      state: "unavailable",
      reason: "content_unavailable:policy-withheld" as const,
      cause: "policy-withheld" as const,
    };
  } else if (unstable || protection === null) {
    // Metadata-only downgrade: ranges and exclusions alone, explicit
    // content_unavailable coverage, zero protect calls, zero plaintext
    // downstream (the payload is dropped here, never stored).
    sealed = unstable
      ? { state: "metadata-only", reason: "metadata:unstable-capture" as const }
      : { state: "metadata-only", reason: "metadata:no-key" as const };
    coverage = unstable
      ? {
        axis: snapshotKind,
        state: "unavailable",
        reason: "content_unavailable:unstable-capture" as const,
        cause: "unstable-capture" as const,
      }
      : {
        axis: snapshotKind,
        state: "unavailable",
        reason: "content_unavailable:no-key" as const,
        cause: "missing-key" as const,
      };
  } else {
    let envelope: SealedSnapshotPayload | null;
    if (admittedPayload === null) {
      envelope = null;
    } else {
      // m1: the envelope fields are port-owned data; every read stays
      // inside the try and maps to a constant code.
      try {
        const returned = await (protection as ContentProtectionPort).protect(admittedPayload);
        if (!isLocalSealAlgorithm(returned.algorithm) || !isStrictKeyRef(returned.keyRef)) {
          throw new SnapshotError("protection-envelope-shape");
        }
        envelope = {
          state: "sealed",
          algorithm: returned.algorithm,
          keyRef: returned.keyRef,
          ciphertext: copyBytesPrivate(returned.ciphertext),
        };
      } catch (error) {
        if (error instanceof SnapshotError) throw error;
        throw new SnapshotError("protection-snapshot-refused");
      }
    }
    if (envelope === null) {
      sealed = { state: "metadata-only", reason: "metadata:no-payload" as const };
      coverage = {
        axis: snapshotKind,
        state: "partial",
        reason: "partial:no-snapshot-payload" as const,
      };
    } else {
      sealed = { state: "sealed", algorithm: envelope.algorithm, keyRef: envelope.keyRef, ciphertext: copyBytesPrivate(envelope.ciphertext) };
      admittedSeals.add(sealed);
      coverage = {
        axis: snapshotKind,
        state: "current",
        reason: "current:sealed-latest" as const,
      };
    }
    // Missing file metadata is explicitly unavailable: a file excluded for
    // unknown-size never yields a current coverage claim.
    if (coverage.state === "current" && sealedDiff.files.some((file) => file.exclusion === "unknown-size")) {
      coverage = {
        axis: snapshotKind,
        state: "unavailable",
        reason: "content_unavailable:unknown-size" as const,
      };
    }
  }

  // No predecessor pointer (L4b M2): replacement is indexed by target
  // and generation at the sink, so concurrent captures never each retire
  // only their own predecessor. The batch generationId is the replacement
  // key; the sink durably rejects anything at or below what it holds.
  const snapshot: LocalSnapshotDto = {
    scope,
    worktreeId,
    snapshotId,
    kind: snapshotKind,
    diffKind,
    capturedAt,
    diffDigest,
    sealed,
    policyVersion: CONTENT_POLICY_VERSION,
  };
  const snapshotChecked = validateLocalSnapshot(snapshot);
  if (!snapshotChecked.ok) {
    throw new SnapshotError("invalid-snapshot", { indices: [snapshotChecked.errors.length] });
  }

  // Policy before persistence: the sealed facts are screened before the
  // first store write, so a refused batch never reaches any surface.
  // Closed schema before screening: every emitted string is already an
  // enumeration value, a strict opaque id, a protected path or sealed bytes.
  const coverageChecked = validateLocalCoverage(coverage);
  if (!coverageChecked.ok) {
    throw new SnapshotError("invalid-coverage");
  }
  assertSinkAdmissible([sealedDiff, snapshot, coverage]);

  // Latest-only atomic replacement: one latest state per target, never a
  // history. A receipt that leaves the predecessor behind refuses success:
  // nothing is delivered and the error (not a success) is announced.
  const sameId = previous !== null && previous.snapshotId === snapshot.snapshotId;
  // m1: the store receipt fields are port-owned data; every read stays
  // inside the try and maps to a constant code.
  let replacement: ReplaceLatestReceipt;
  try {
    // Le magasin reçoit une copie privée : il ne partage aucune référence
    // avec le lot livré au sink ni avec le snapshot retourné à l'appelant.
    replacement = await store.replaceLatest(
      deepCopyForDelivery(snapshot) as LocalSnapshotDto,
      previous?.snapshotId ?? null,
      generationId,
    );
    if (!sameId && previous !== null &&
      (!replacement.retiredPrevious || !replacement.revokedDecryptability || !replacement.blockedStaleWork)) {
      throw new SnapshotError("store-receipt-incomplete");
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError("store-conflict");
  }

  const diagnostics = [
    `local ${snapshotKind} snapshot ${snapshotId}: ${sealedDiff.files.length} file(s), ${excluded} excluded, ` +
    `${sealedHunks} sealed hunk(s), ${withheldHunks} withheld, coverage ${coverage.state} (${CONTENT_POLICY_VERSION})`,
  ];
  // The lot is reconstructible: the sealed diff (authorized facts, bounds,
  // exclusions, sealed hunks), the snapshot and the propagated coverage.
  const batch: FactBatchDto = {
    scope,
    producerName: PRODUCER_NAME,
    contractVersion: CONTRACT_VERSION,
    policyVersion: CONTENT_POLICY_VERSION,
    generationId,
    batchId,
    batchDigest: sha256Hex(toJsonBytes([generationId, batchId, sealedDiff, snapshot, coverage])),
    facts: [sealedDiff, snapshot, coverage],
  };
  const receipt = await admitToSink(batch, sink);
  // m1: the sink receipt fields are port-owned data; the read stays inside
  // a try and maps to a constant code.
  try {
    if (!receipt.retiredSuperseded || !receipt.revokedDecryptability) {
      throw new SnapshotError("sink-receipt-incomplete");
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError("sink-receipt-incomplete");
  }
  return { snapshot, coverage, diagnostics, batch };
}

/**
 * Unregister purge: stop work, reject delayed jobs, purge private
 * snapshots, derived indexes and decryptability through the injected
 * store port, while preserving authorized committed history. The port
 * exposes no committed-history deletion, so preservation is structural.
 *
 * The purge is bounded, not asserted: the revocation identities
 * (worktree, declaration, revision) travel to the host, and the host
 * receipt must prove pre-purge work blocked, private payloads purged and
 * decryptability revoked before the purge confirms. A capture suspended
 * in protect across the purge carries a blocked generation and can never
 * persist afterwards.
 */
export async function runUnregisterPurge(input: UnregisterPurgeInput): Promise<UnregisterPurgeOutcome> {
  // m3: the caller-owned revocation is deeply copied and frozen before
  // validation; the host receives the admitted copy only, so a caller
  // mutating (or accessor-throwing) its own object across the suspension
  // changes nothing downstream. A throwing accessor maps to a constant.
  let revocation: DeclarationRevocationDto;
  try {
    revocation = deepCloneAdmitted(input.revocation) as DeclarationRevocationDto;
  } catch {
    throw new SnapshotError("invalid-revocation");
  }
  deepFreezeAdmitted(revocation);
  const checked = validateDeclarationRevocation(revocation);
  if (!checked.ok) {
    throw new SnapshotError("invalid-revocation", { indices: [checked.errors.length] });
  }
  const purge = revocation.requestPrivatePurge;
  if (purge.purgePrivateSnapshots !== true || purge.purgeDerivedIndexes !== true ||
    purge.revokeDecryptability !== true || purge.preserveCommittedHistory !== true) {
    throw new SnapshotError("revocation-shape");
  }
  const scope = checkScope({ tenant: revocation.tenant, clone: revocation.cloneId });
  const store = input.store;
  // m1: the purge receipt fields are port-owned data; every read stays
  // inside the try and maps to a constant code.
  let result: PurgePrivateReceipt;
  try {
    result = await store.purgePrivate({
      scope,
      worktreeId: revocation.worktreeId,
      declarationId: revocation.declarationId,
      declarationRevision: revocation.declarationRevision,
    });
    if (!result.purgedPrivate || !result.blockedOldWork || !result.revokedDecryptability) {
      throw new SnapshotError("purge-incomplete");
    }
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError("purge-refused");
  }
  return {
    stoppedWork: true,
    rejectedDelayedJobs: true,
    purgedPrivate: result.purgedPrivate,
    preservedCommittedHistory: true,
  };
}
