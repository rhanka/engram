import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Cursor, Digest } from '../../../engram-memory/dist/contracts/index.js';
import { openReferenceSqliteHandleV1 } from '../../../engram-memory/dist/sqlite.js';
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

/**
 * M14 round-2 closure: a named, non-mock durable host-port set. Backed by the
 * existing engram SQLite stack (engram-memory/sqlite.ts and its declared
 * better-sqlite3 driver) — no mock, no network, no new dependency, no JSON
 * files. Every read-modify-write runs inside a real SQLite transaction with
 * WAL + synchronous FULL, so the bindings survive process termination and
 * close/reopen. The test-only confirmation verifier binds the operation
 * digest, but it is not an OIDC/2FA production binding.
 */
export async function createReferenceWriteHostPortsV1(options: ReferenceWritePortsOptions) {
  const clock = options.clock ?? { now: () => new Date().toISOString() };
  const db = await openReferenceSqliteHandleV1(join(options.directory, 'reference.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS ref_binding (reservation_ref TEXT PRIMARY KEY, lookup_key TEXT UNIQUE NOT NULL, binding_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ref_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ref_approval (seq INTEGER PRIMARY KEY AUTOINCREMENT, reservation_ref TEXT NOT NULL, capability TEXT NOT NULL, target_ref TEXT NOT NULL, operation_digest TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ref_approval_ref ON ref_approval (reservation_ref);
    CREATE TABLE IF NOT EXISTS ref_destroyed (candidate_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS ref_coverage (cursor TEXT PRIMARY KEY, coverage_digest TEXT);
    CREATE TABLE IF NOT EXISTS ref_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, entry_json TEXT NOT NULL);
  `);
  const kv = (key: string, fallback: string): string => {
    const row = db.prepare('SELECT value FROM ref_kv WHERE key = ?').get(key) as { value?: unknown } | undefined;
    if (typeof row?.value === 'string') return row.value;
    db.prepare('INSERT OR IGNORE INTO ref_kv (key, value) VALUES (?, ?)').run(key, fallback);
    return fallback;
  };
  kv('versions_capture', 'capture-policy/v1');
  kv('versions_admission', 'admission-policy/v1');
  kv('source_seq', '{}');
  kv('audit_count', '0');

  const fail = (error_code: PublicMemoryErrorCode, message: string) => ({ ok: false as const, error_code, message });

  function parseBinding(value: unknown): MemoryMutationBindingV1<unknown> {
    const binding = JSON.parse(value as string) as MemoryMutationBindingV1<unknown>;
    if (!binding || typeof binding !== 'object' || !binding.preimage || typeof binding.preimage.reservation_ref !== 'string') {
      throw Error('corrupt reservation row');
    }
    return binding;
  }

  function findRef(reservationRef: string): MemoryMutationBindingV1<unknown> | undefined {
    try {
      const row = db.prepare('SELECT binding_json FROM ref_binding WHERE reservation_ref = ?').get(reservationRef) as { binding_json?: unknown } | undefined;
      return row === undefined ? undefined : parseBinding(row.binding_json);
    } catch {
      throw Error('STORE_UNAVAILABLE');
    }
  }

  function saveBinding(binding: MemoryMutationBindingV1<unknown>): void {
    db.prepare('INSERT OR REPLACE INTO ref_binding (reservation_ref, lookup_key, binding_json) VALUES (?, ?, ?)')
      .run(binding.preimage.reservation_ref, JSON.stringify(binding.lookup_key), JSON.stringify(binding));
  }

  function atomic<T>(task: () => T): T {
    try {
      return db.transaction(task)();
    } catch {
      throw Error('STORE_UNAVAILABLE');
    }
  }

  const reservation: MemoryMutationRecoveryPortV1<unknown> = {
    async reserveOrLoad(lookupKey: MemoryMutationLookupKeyV1, candidatePreimage: MemoryMutationPreimageV1) {
      try {
        return atomic(() => {
          const key = JSON.stringify(lookupKey);
          const row = db.prepare('SELECT binding_json FROM ref_binding WHERE lookup_key = ?').get(key) as { binding_json?: unknown } | undefined;
          if (row !== undefined) return { ok: true as const, value: parseBinding(row.binding_json) };
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
          saveBinding(binding);
          return { ok: true as const, value: binding };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async attachConfirmation(reservationRef: string, confirmationRef: string, operationDigest: Digest) {
      try {
        return atomic(() => {
          const binding = findRef(reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (binding.operation_digest !== operationDigest) return fail('INVALID_SCHEMA', 'confirmation digest mismatch');
          if (!isValidOpaqueRef(confirmationRef)) return fail('INVALID_SCHEMA', 'confirmation ref is not opaque');
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, confirmation_ref: confirmationRef,
            recovery_state: binding.recovery_state === 'pending_confirmation' ? 'authorized_uncommitted' : binding.recovery_state,
          };
          saveBinding(next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async claimFencedExecution(reservationRef: string, executionGeneration: string) {
      try {
        return atomic(() => {
          const binding = findRef(reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (!isValidCursor(executionGeneration)) return fail('INVALID_SCHEMA', 'execution generation is not a cursor');
          if (binding.recovery_state !== 'authorized_uncommitted') {
            return fail(binding.recovery_state === 'executing_unknown_outcome' ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_SCHEMA', 'reservation is not claimable');
          }
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration,
          };
          saveBinding(next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async reconcileCanonicalOutcome(reservationRef: string, canonicalReplayRef: string) {
      try {
        return atomic(() => {
          const binding = findRef(reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          if (!isValidOpaqueRef(canonicalReplayRef)) return fail('INVALID_SCHEMA', 'replay ref is not opaque');
          if (binding.recovery_state !== 'executing_unknown_outcome' && binding.recovery_state !== 'canonical_committed_receipt') {
            return fail('INVALID_SCHEMA', 'reservation has no canonical commitment to reconcile');
          }
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: canonicalReplayRef,
          };
          saveBinding(next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
    async recordCompletion(reservationRef: string, output: unknown) {
      try {
        return atomic(() => {
          const binding = findRef(reservationRef);
          if (!binding) return fail('NOT_FOUND', 'unknown reservation');
          // M5 l.708, l.744: completion requires the reconciled canonical
          // replay reference first — never a completion without one.
          if (!isValidOpaqueRef(binding.canonical_replay_ref)
            || binding.recovery_state !== 'canonical_committed_receipt') {
            return fail('INVALID_SCHEMA', 'reservation has no canonical commitment to complete');
          }
          const next: MemoryMutationBindingV1<unknown> = {
            ...binding, recovery_state: 'completed_response', stored_output: output,
          };
          saveBinding(next);
          return { ok: true as const, value: next };
        });
      } catch { return fail('STORE_UNAVAILABLE', 'durable reservation is unavailable'); }
    },
  };

  const audit = {
    async append(entry: Record<string, unknown>): Promise<void> {
      atomic(() => {
        const count = Number(kv('audit_count', '0')) + 1;
        db.prepare('UPDATE ref_kv SET value = ? WHERE key = ?').run(String(count), 'audit_count');
        db.prepare('INSERT INTO ref_audit (entry_json) VALUES (?)').run(JSON.stringify({ at: clock.now(), ...entry }));
      });
    },
  };

  function auditLog(): Array<Record<string, unknown> & { decision?: string }> {
    try {
      const rows = db.prepare('SELECT entry_json FROM ref_audit ORDER BY seq').all() as Array<{ entry_json: string }>;
      return rows.map((row) => JSON.parse(row.entry_json));
    } catch { return []; }
  }

  const policy = {
    retention: options.retention ?? { max_retention_days: 30, allow_retain_derivative_rule: false },
    reconciliation: options.reconciliation ?? { consented_family_refs: [] },
    anchorKindRef: options.anchorKindRef ?? 'memory:lifecycle',
    provenanceDigest: async (): Promise<Digest> => options.provenanceDigest ?? `sha256:${createHash('sha256').update('reference-provenance', 'utf8').digest('hex')}`,
    async capturePolicyVersion(): Promise<string> {
      return kv('versions_capture', 'capture-policy/v1');
    },
    async admissionPolicyVersion(): Promise<string> {
      return kv('versions_admission', 'admission-policy/v1');
    },
    async rotate(tool: MutatingMemoryToolName): Promise<string> {
      return atomic(() => {
        const count = kv('audit_count', '0');
        if (tool === 'engram_memory_capture') {
          const next = `${kv('versions_capture', 'capture-policy/v1')}+r${count}`;
          db.prepare('UPDATE ref_kv SET value = ? WHERE key = ?').run(next, 'versions_capture');
          return next;
        }
        const next = `${kv('versions_admission', 'admission-policy/v1')}+r${count}`;
        db.prepare('UPDATE ref_kv SET value = ? WHERE key = ?').run(next, 'versions_admission');
        return next;
      });
    },
    async nextSourceOrder(): Promise<{ source_ref: string; sequence: string }> {
      return atomic(() => {
        const parsed = JSON.parse(kv('source_seq', '{}')) as Record<string, string>;
        const next = String((parsed['source:host'] === undefined ? 0 : Number(parsed['source:host'])) + 1);
        db.prepare('UPDATE ref_kv SET value = ? WHERE key = ?').run(JSON.stringify({ ...parsed, 'source:host': next }), 'source_seq');
        return { source_ref: 'source:host', sequence: next };
      });
    },
  };

  async function grantConfirmation(binding: { capability: string; target_ref: string; operation_digest: string; reservation_ref: string }, expires_at: string): Promise<void> {
    atomic(() => {
      db.prepare('INSERT INTO ref_approval (reservation_ref, capability, target_ref, operation_digest, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(binding.reservation_ref, binding.capability, binding.target_ref, binding.operation_digest, expires_at);
    });
  }

  async function confirm(binding: { capability: string; target_ref: string; operation_digest: string; reservation_ref: string }): Promise<boolean> {
    if (!isValidSha256Digest(binding.operation_digest) || !isValidOpaqueRef(binding.target_ref) || !isValidOpaqueRef(binding.reservation_ref)) return false;
    const now = clock.now();
    if (!isValidInstant(now)) return false;
    const rows = db.prepare(
      'SELECT expires_at FROM ref_approval WHERE reservation_ref = ? AND capability = ? AND target_ref = ? AND operation_digest = ?',
    ).all(binding.reservation_ref, binding.capability, binding.target_ref, binding.operation_digest) as Array<{ expires_at: string }>;
    return rows.some((row) => row.expires_at > now);
  }

  const keyCustody = {
    async recordDestroyed(candidate_id: string): Promise<void> {
      atomic(() => {
        db.prepare('INSERT OR IGNORE INTO ref_destroyed (candidate_id) VALUES (?)').run(candidate_id);
      });
    },
    async confirmDestroyed(candidate_id: string): Promise<boolean> {
      const row = db.prepare('SELECT candidate_id FROM ref_destroyed WHERE candidate_id = ?').get(candidate_id);
      return row !== undefined;
    },
  };

  const coverage = {
    async acknowledge(cursor: string, coverage_digest?: string): Promise<void> {
      atomic(() => {
        db.prepare('INSERT OR IGNORE INTO ref_coverage (cursor, coverage_digest) VALUES (?, ?)').run(cursor, coverage_digest ?? null);
      });
    },
    async verify(through_cursor: Cursor): Promise<{ complete: boolean; coverage_digest?: Digest }> {
      const row = db.prepare('SELECT coverage_digest FROM ref_coverage WHERE cursor = ?').get(through_cursor) as { coverage_digest?: string | null } | undefined;
      if (row === undefined) return { complete: false };
      return row.coverage_digest == null ? { complete: true } : { complete: true, coverage_digest: row.coverage_digest as Digest };
    },
  };

  async function reservations(): Promise<Array<MemoryMutationBindingV1<unknown>>> {
    const rows = db.prepare('SELECT binding_json FROM ref_binding ORDER BY reservation_ref').all() as Array<{ binding_json: string }>;
    return rows.map((row) => parseBinding(row.binding_json));
  }

  function close(): void {
    db.close();
  }

  return { reservation, audit, auditLog, policy, grantConfirmation, confirm, keyCustody, coverage, reservations, close };
}

export type ReferenceWriteHostPortsV1 = Awaited<ReturnType<typeof createReferenceWriteHostPortsV1>>;
