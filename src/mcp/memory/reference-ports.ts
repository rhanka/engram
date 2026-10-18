import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cursor, Digest } from '../../../engram-memory/dist/contracts/index.js';
import type { PublicMemoryErrorCode } from './contracts.js';
import {
  computeMemoryMutationOperationDigestV1,
  extractMemoryMutationLookupKeyV1,
  projectMemoryMutationPolicyVersionsV1,
  validateMemoryMutationPreimageV1,
  type MemoryMutationBindingV1,
  type MemoryMutationLookupKeyV1,
  type MemoryMutationPreimageV1,
  type MemoryMutationRecoveryPortV1,
  type MutatingMemoryToolName,
} from './policy.js';
import { isValidCursor, isValidInstant, isValidOpaqueRef, isValidSha256Digest } from './schemas.js';

export interface ReferenceWritePortsOptions {
  directory: string;
  clock?: { now(): string };
  retention?: { max_retention_days: number; allow_retain_derivative_rule: boolean; default_expires_at?: string };
  reconciliation?: { consented_family_refs: string[] };
  anchorKindRef?: string;
  provenanceDigest?: Digest;
}

interface StoredFile {
  bindings: Array<MemoryMutationBindingV1<unknown>>;
  versions: { capture: string; admission: string };
  approvals: Array<{ capability: string; target_ref: string; operation_digest: string; reservation_ref: string; expires_at: string }>;
  destroyed: string[];
  acked: Array<{ cursor: string; coverage_digest?: string }>;
  sourceSeq: Record<string, string>;
  auditCount: number;
}

/** M14 B-2 reference: a named, non-mock durable host-port set. File-backed with an atomic mkdir lock and fsync; no mock, no network, no new dependency. */
export function createReferenceWriteHostPortsV1(options: ReferenceWritePortsOptions) {
  const clock = options.clock ?? { now: () => new Date().toISOString() };
  const directory = options.directory;
  mkdirSync(directory, { recursive: true });
  const files = {
    state: join(directory, 'reservations.json'),
    audit: join(directory, 'audit.jsonl'),
    lock: join(directory, 'lock'),
  };

  const blank: StoredFile = {
    bindings: [], versions: { capture: 'capture-policy/v1', admission: 'admission-policy/v1' },
    approvals: [], destroyed: [], acked: [], sourceSeq: {}, auditCount: 0,
  };

  function load(): StoredFile {
    try {
      if (!existsSync(files.state)) return structuredClone(blank);
      const parsed = JSON.parse(readFileSync(files.state, 'utf8')) as Partial<StoredFile>;
      if (!parsed || !Array.isArray(parsed.bindings)) throw Error('corrupt reservation file');
      return { ...structuredClone(blank), ...parsed };
    } catch {
      throw Error('STORE_UNAVAILABLE');
    }
  }

  function persist(state: StoredFile): void {
    const tmp = `${files.state}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    const fd = openSync(tmp, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, files.state);
    try {
      const dir = openSync(directory, 'r');
      try { fsyncSync(dir); } finally { closeSync(dir); }
    } catch { /* directory fsync is best-effort on some filesystems */ }
  }

  function withLock<T>(task: (state: StoredFile) => T): T {
    const deadline = Date.now() + 5000;
    while (true) {
      try { mkdirSync(files.lock); break; } catch {
        if (Date.now() > deadline) throw Error('STORE_UNAVAILABLE');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    }
    try {
      const state = load();
      const result = task(state);
      persist(state);
      return result;
    } finally {
      try { rmdirSync(files.lock); } catch { /* lock already released */ }
    }
  }

  const fail = (error_code: PublicMemoryErrorCode, message: string) => ({ ok: false as const, error_code, message });
  const findRef = (state: StoredFile, ref: string) => state.bindings.find((entry) => entry.preimage.reservation_ref === ref);
  function replaceBinding(state: StoredFile, current: MemoryMutationBindingV1<unknown>, next: MemoryMutationBindingV1<unknown>): void {
    const index = state.bindings.indexOf(current);
    if (index >= 0) state.bindings[index] = next;
  }

  const reservation: MemoryMutationRecoveryPortV1<unknown> = {
    async reserveOrLoad(lookupKey: MemoryMutationLookupKeyV1, candidatePreimage: MemoryMutationPreimageV1) {
      try {
        return withLock((state) => {
          const key = JSON.stringify(lookupKey);
          const existing = state.bindings.find((entry) => JSON.stringify(entry.lookup_key) === key);
          if (existing) return { ok: true as const, value: existing };
          if (!validateMemoryMutationPreimageV1(candidatePreimage).ok) return fail('INVALID_SCHEMA', 'candidate preimage is not closed');
          if (JSON.stringify(extractMemoryMutationLookupKeyV1(candidatePreimage)) !== key) {
            return fail('INVALID_SCHEMA', 'lookup key does not match the candidate preimage');
          }
          const digest = computeMemoryMutationOperationDigestV1(candidatePreimage);
          if (!digest.ok) return fail(digest.error_code, 'candidate digest failed');
          const versions = projectMemoryMutationPolicyVersionsV1(candidatePreimage.effective_input);
          if (!versions.ok) return fail(versions.error_code, 'candidate policy versions failed');
          const needsConfirm = candidatePreimage.tool_name === 'engram_memory_withdraw' || candidatePreimage.tool_name === 'engram_memory_forget';
          const binding: MemoryMutationBindingV1<unknown> = {
            lookup_key: lookupKey, preimage: candidatePreimage, operation_digest: digest.value.operation_digest,
            policy_versions: versions.value, recovery_state: needsConfirm ? 'pending_confirmation' : 'authorized_uncommitted',
            audit_id: `reservation-audit:${candidatePreimage.reservation_ref}`, execution_generation: '0',
          };
          state.bindings.push(binding);
          return { ok: true as const, value: binding };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async attachConfirmation(reservationRef: string, confirmationRef: string, operationDigest: Digest) {
      try {
        return withLock((state) => {
          const binding = findRef(state, reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (binding.operation_digest !== operationDigest) return fail('INVALID_SCHEMA', 'confirmation digest mismatch');
          if (!isValidOpaqueRef(confirmationRef)) return fail('INVALID_SCHEMA', 'confirmation ref is not opaque');
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, confirmation_ref: confirmationRef,
            recovery_state: binding.recovery_state === 'pending_confirmation' ? 'authorized_uncommitted' : binding.recovery_state,
          };
          replaceBinding(state, binding, next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async claimFencedExecution(reservationRef: string, executionGeneration: string) {
      try {
        return withLock((state) => {
          const binding = findRef(state, reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (!isValidCursor(executionGeneration)) return fail('INVALID_SCHEMA', 'execution generation is not a cursor');
          if (binding.recovery_state !== 'authorized_uncommitted') {
            return fail(binding.recovery_state === 'executing_unknown_outcome' ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_SCHEMA', 'reservation is not claimable');
          }
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration,
          };
          replaceBinding(state, binding, next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async reconcileCanonicalOutcome(reservationRef: string, canonicalReplayRef: string) {
      try {
        return withLock((state) => {
          const binding = findRef(state, reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (!isValidOpaqueRef(canonicalReplayRef)) return fail('INVALID_SCHEMA', 'replay ref is not opaque');
          if (binding.recovery_state !== 'executing_unknown_outcome' && binding.recovery_state !== 'canonical_committed_receipt') {
            return fail('INVALID_SCHEMA', 'reservation has no canonical commitment to reconcile');
          }
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: canonicalReplayRef,
          };
          replaceBinding(state, binding, next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async recordCompletion(reservationRef: string, output: unknown) {
      try {
        return withLock((state) => {
          const binding = findRef(state, reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (binding.recovery_state !== 'executing_unknown_outcome' && binding.recovery_state !== 'canonical_committed_receipt') {
            return fail('INVALID_SCHEMA', 'reservation has no canonical commitment to complete');
          }
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, recovery_state: 'completed_response', stored_output: output,
          };
          replaceBinding(state, binding, next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
  };

  const audit = {
    async append(entry: Record<string, unknown>): Promise<void> {
      const line = `${JSON.stringify({ at: clock.now(), ...entry })}\n`;
      withLock((state) => { state.auditCount += 1; });
      const fd = openSync(files.audit, 'a');
      try { writeFileSync(fd, line); fsyncSync(fd); } finally { closeSync(fd); }
    },
  };

  function auditLog(): Array<Record<string, unknown> & { decision?: string }> {
    try {
      if (!existsSync(files.audit)) return [];
      return readFileSync(files.audit, 'utf8').split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line));
    } catch { return []; }
  }

  const policy = {
    retention: options.retention ?? { max_retention_days: 30, allow_retain_derivative_rule: false },
    reconciliation: options.reconciliation ?? { consented_family_refs: [] },
    anchorKindRef: options.anchorKindRef ?? 'memory:lifecycle',
    provenanceDigest: async (): Promise<Digest> => options.provenanceDigest ?? `sha256:${createHash('sha256').update('reference-provenance', 'utf8').digest('hex')}`,
    async capturePolicyVersion(): Promise<string> {
      return withLock((state) => state.versions.capture);
    },
    async admissionPolicyVersion(): Promise<string> {
      return withLock((state) => state.versions.admission);
    },
    async rotate(tool: MutatingMemoryToolName): Promise<string> {
      return withLock((state) => {
        if (tool === 'engram_memory_capture') state.versions.capture = `${state.versions.capture}+r${state.auditCount}`;
        else state.versions.admission = `${state.versions.admission}+r${state.auditCount}`;
        return tool === 'engram_memory_capture' ? state.versions.capture : state.versions.admission;
      });
    },
    async nextSourceOrder(): Promise<{ source_ref: string; sequence: string }> {
      return withLock((state) => {
        const next = String((state.sourceSeq['source:host'] === undefined ? 0 : Number(state.sourceSeq['source:host'])) + 1);
        state.sourceSeq['source:host'] = next;
        return { source_ref: 'source:host', sequence: next };
      });
    },
  };

  function grantConfirmation(binding: { capability: string; target_ref: string; operation_digest: string; reservation_ref: string }, expires_at: string): void {
    withLock((state) => {
      state.approvals.push({ ...binding, expires_at });
    });
  }

  async function confirm(binding: { capability: string; target_ref: string; operation_digest: string; reservation_ref: string }): Promise<boolean> {
    if (!isValidSha256Digest(binding.operation_digest) || !isValidOpaqueRef(binding.target_ref) || !isValidOpaqueRef(binding.reservation_ref)) return false;
    const now = clock.now();
    if (!isValidInstant(now)) return false;
    return withLock((state) => state.approvals.some((approval) =>
      approval.capability === binding.capability && approval.target_ref === binding.target_ref
      && approval.operation_digest === binding.operation_digest && approval.reservation_ref === binding.reservation_ref
      && approval.expires_at > now,
    ));
  }

  const keyCustody = {
    recordDestroyed(candidate_id: string): void {
      withLock((state) => {
        if (!state.destroyed.includes(candidate_id)) state.destroyed.push(candidate_id);
      });
    },
    async confirmDestroyed(candidate_id: string): Promise<boolean> {
      return withLock((state) => state.destroyed.includes(candidate_id));
    },
  };

  const coverage = {
    acknowledge(cursor: string, coverage_digest?: string): void {
      withLock((state) => {
        if (!state.acked.some((entry) => entry.cursor === cursor)) state.acked.push({ cursor, coverage_digest });
      });
    },
    async verify(through_cursor: Cursor): Promise<{ complete: boolean; coverage_digest?: Digest }> {
      const found = withLock((state) => state.acked.find((entry) => entry.cursor === through_cursor));
      if (!found) return { complete: false };
      return found.coverage_digest === undefined ? { complete: true } : { complete: true, coverage_digest: found.coverage_digest as Digest };
    },
  };

  function reservations(): Array<MemoryMutationBindingV1<unknown>> {
    return withLock((state) => structuredClone(state.bindings));
  }

  return { reservation, audit, auditLog, policy, grantConfirmation, confirm, keyCustody, coverage, reservations };
}

export type ReferenceWriteHostPortsV1 = ReturnType<typeof createReferenceWriteHostPortsV1>;
