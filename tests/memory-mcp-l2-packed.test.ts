import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createReferenceWriteHostPortsV1 } from '../src/mcp/memory/reference-ports.js';
import { captureRequest } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M14 §B-2 (packed-install gate
// runs the mutation tools against the reference durable host-port set) and
// the M13 closure table (crypto/node:crypto-only packed bundle).
function buildPackedBundle(directory: string): string {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const env = { ...process.env, PATH: `${root}/node_modules/.bin:${process.env.PATH ?? ''}` };
  execFileSync(process.execPath, ['--input-type=module', '-e', `import { build } from 'tsup'; await build({ config: false, entry: { 'memory-tools': 'src/memory-tools/index.ts' }, outDir: process.argv[1], format: ['esm'], dts: { compilerOptions: { types: ['node'] } }, splitting: false, target: 'node20', silent: true });`, join(directory, 'dist')], {
    cwd: root, env, stdio: 'pipe',
  });
  return readFileSync(join(directory, 'dist', 'memory-tools.js'), 'utf8');
}

describe('MCP-L2 packed write tools against reference ports', () => {
  it('M13 should ship a crypto-only bundle whose tools refuse closed-world and commit through reference ports', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-packed-'));
    try {
      const source = buildPackedBundle(directory);
      const imports = [...source.matchAll(/(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
      expect(imports.filter((spec) => spec !== 'crypto' && spec !== 'node:crypto')).toEqual([]);
      const bundle = await import(join(directory, 'dist', 'memory-tools.js'));
      const ports = await createReferenceWriteHostPortsV1({ directory: join(directory, 'ports') });
      const fixture = buildMemory({ scope: 'scope:l3' });
      const facets = { scope_ref: 'scope:l3', store_id: 'memory:canonical', engine: fixture.memory };
      const hostBase = {
        clock: { now: () => new Date().toISOString() },
        authenticate: async () => true,
        authorize: async () => true,
        reservation: ports.reservation,
        audit: ports.audit,
        policy: ports.policy,
        confirm: async () => true,
        keyCustody: ports.keyCustody,
        coverage: ports.coverage,
      };
      const ctx = {
        auditId: 'audit:l2-packed', authorization: { credential: 'credential:l7' }, scope_ref: 'scope:l3', store_id: 'memory:canonical',
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', connector_instance_ref: 'connector:one',
        agent_id: 'agent:one', session_id: 'session:one', generation: '1', deadline_at: new Date(Date.now() + 20000).toISOString(),
      };
      const disabled = bundle.createMemoryWriteToolsV1({ facets });
      const request = captureRequest('l2-packed-key-00000001', '1', 'packed body');
      const { scope_ref: _scope, retention: _retention, ...payload } = request.payload;
      const input = { idempotency_key: request.idempotency_key, payload, evidence: request.evidence };
      await expect(disabled.capture(input, ctx)).resolves.toMatchObject({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE' } });
      const tools = bundle.createMemoryWriteToolsV1({ facets, host: hostBase });
      const first = await tools.capture(input, ctx);
      expect(first).toMatchObject({ ok: true, output: { value: { status: 'committed_pending' } } });
      const second = await tools.capture(input, ctx);
      expect(second).toMatchObject({ ok: true, output: { value: { status: 'duplicate_exact' } } });
      const candidateId = (first as { output: { value: { candidate_id: string } } }).output.value.candidate_id;
      const admitted = await tools.requestAdmission({ candidate_id: candidateId, idempotency_key: 'l2-packed-key-0002-0000' }, ctx);
      expect(admitted.ok).toBe(true);
      const recordId = (admitted as { output: { value: { outcome: { record_id: string } } } }).output.value.outcome.record_id;
      const forgotten = await tools.forget({ record_id: recordId, idempotency_key: 'l2-packed-key-0003-0000', reason_ref: 'reason:packed' }, ctx);
      expect((forgotten as { ok: boolean }).ok).toBe(true);
      await ports.coverage.acknowledge('7', undefined);
      await expect(ports.coverage.verify('7')).resolves.toMatchObject({ complete: true });
      await ports.keyCustody.recordDestroyed(candidateId);
      await expect(ports.keyCustody.confirmDestroyed(candidateId)).resolves.toBe(true);
      ports.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 300000);
});
