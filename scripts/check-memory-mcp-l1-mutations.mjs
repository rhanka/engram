/** Serial local mutations. Restores sources in finally; no install or network. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const suite = 'tests/memory-mcp-l1-reads.test.ts';
const directory = mkdtempSync(join(tmpdir(), 'memory-l1-mutations-'));
const env = { ...process.env, npm_config_offline: 'true', GIT_NO_LAZY_FETCH: '1' };
const cases = [
  {
    id: 'M2-search-reserves-success-envelope', file: 'src/memory-tools/reads.ts',
    from: 'max_packet_bytes: max_packet_bytes - envelopeOverhead - 2',
    to: 'max_packet_bytes', pattern: 'M2/M3 should reserve the success envelope',
  },
  {
    id: 'M6-get-invocation-is-not-target-denial', file: 'src/mcp/memory/errors.ts',
    from: 'ctx.invocationAuthorized !== false &&', to: '',
    pattern: 'M4/M6 should preserve get invocation UNAUTHORIZED',
  },
  {
    id: 'M6-get-preserves-target-authorized-errors', file: 'src/memory-tools/reads.ts',
    from: "targetAuthorized: tool === 'engram_memory_get' && facets.isTargetAuthorizedError?.(error) === true",
    to: 'targetAuthorized: false', pattern: 'M4/M6 should preserve get (finalCheck|BLOB_MISSING)',
  },
  {
    id: 'M4-get-target-authorization-provenance', file: 'engram-memory/reads.ts',
    from: 'target.authorized = true;', to: '',
    pattern: 'M4/M6 should preserve get (finalCheck|BLOB_MISSING)',
  },
  {
    id: 'M6-preserve-projection-oversized', file: 'src/memory-tools/reads.ts',
    from: 'mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, error,',
    to: "error.code === 'PROJECTION_OVERSIZED' ? failure(tool, ctx, 'RESULT_TOO_LARGE') : mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, error,",
    pattern: 'M6 should preserve PROJECTION_OVERSIZED',
  },
  {
    id: 'M3-scope-before-corpus', file: 'engram-memory/memory-store.ts',
    from: '.filter((record) => scope_ref === undefined || record.scope_ref === scope_ref)',
    to: '.filter(() => true)', pattern: 'M3 should isolate the corpus before candidate caps',
  },
  {
    id: 'M4-continuation-absence-is-not-approval', file: 'src/memory-tools/reads.ts',
    from: 'await host.authorizeContinuation(structuredClone(state), structuredClone(ctx)) !== true',
    to: 'await host.authorizeContinuation(structuredClone(state), structuredClone(ctx)) === false',
    all: true, pattern: 'M4 should refuse nonliteral invocation and continuation verdict',
  },
  {
    id: 'M3-canonical-check-after-host-await', file: 'src/memory-tools/reads.ts',
    from: 'const final = await facets.recallPort.recall({ ...request, as_of: { valid_time: packet.rank_receipt.valid_as_of, system_cursor: packet.rank_receipt.system_as_of } });',
    to: 'const final = result;', pattern: 'M3 should check canonical eligibility after the last asynchronous host callback',
  },
  {
    id: 'M6-trust-infrastructure-is-not-empty-success', file: 'engram-memory/reads.ts',
    from: "if (!result.ok) return { ok: false, error: { ...result.error, operation: 'recall_current' } };",
    to: 'if (!result.ok) return { ok: true, value: false };',
    pattern: 'M6 should preserve trust infrastructure failure',
  },
  {
    id: 'M3-cursor-advance-during-final-check', file: 'engram-memory/reads.ts',
    from: "if (value.cursor !== current.value.high_water_cursor) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');",
    to: '', pattern: 'if the cursor advances inside final revalidation',
  },
];
const results = [];
try {
  const baseline = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', suite], { env, encoding: 'utf8' });
  if (baseline.status !== 0) throw Error('Baseline failed:\n' + baseline.stdout + baseline.stderr);
  for (const c of cases) {
    const original = readFileSync(c.file, 'utf8');
    if (!original.includes(c.from)) throw Error('Missing mutation anchor: ' + c.id);
    const report = join(directory, 'results.json');
    try {
      writeFileSync(c.file, c.all ? original.replaceAll(c.from, c.to) : original.replace(c.from, c.to));
      const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', suite, '-t', c.pattern, '--reporter=json', '--outputFile', report], { env, encoding: 'utf8' });
      const json = JSON.parse(readFileSync(report, 'utf8'));
      const failures = json.testResults.flatMap(f => f.assertionResults.filter(t => t.status === 'failed').map(t => t.fullName));
      const killed = result.status !== 0 && failures.length > 0;
      results.push({ id: c.id, killed, failures });
      process.stdout.write(`${killed ? 'KILLED' : 'SURVIVED'} ${c.id}: ${failures[0] ?? 'no failed assertion'}\n`);
    } finally { writeFileSync(c.file, original); }
  }
  if (results.some(r => !r.killed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
