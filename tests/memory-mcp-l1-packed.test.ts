import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
it('M13/M14 B should preserve real packed in-process guards without MCP, brokers, sibling aliases or activation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'memory-l1-packed-'));
  const product = join(directory, 'product');
  const consumer = join(directory, 'consumer');
  const env = { ...process.env, npm_config_offline: 'true', npm_config_ignore_scripts: 'true', GIT_NO_LAZY_FETCH: '1' };
  try {
    mkdirSync(join(product, 'dist'), { recursive: true });
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(manifest.exports['./memory-tools']).toEqual({ types: './dist/memory-tools.d.ts', import: './dist/memory-tools.js' });
    expect(manifest.exports['./mcp-memory']).toBeUndefined();
    expect(readFileSync(join(root, 'tsup.config.ts'), 'utf8')).toContain('"memory-tools": "src/memory-tools/index.ts"');
    writeFileSync(join(product, 'package.json'), JSON.stringify(manifest));
    execFileSync(process.execPath, ['--input-type=module', '-e', `import { build } from 'tsup'; await build({ config: false, entry: { 'memory-tools': 'src/memory-tools/index.ts' }, outDir: process.argv[1], format: ['esm'], dts: { compilerOptions: { types: ['node'] } }, splitting: false, target: 'node20', silent: true });`, join(product, 'dist')], { cwd: root, env, stdio: 'pipe' });
    const built = readFileSync(join(product, 'dist', 'memory-tools.js'), 'utf8');
    const imports = [...built.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)/g)].map(match => match[1]);
    expect(imports.filter(specifier => !['crypto', 'node:crypto'].includes(specifier!))).toEqual([]);
    const declarations = readFileSync(join(product, 'dist', 'memory-tools.d.ts'), 'utf8');
    expect([...declarations.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)/g)].map(match => match[1])).toEqual([]);
    const packed = JSON.parse(execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: product, env, encoding: 'utf8' }));
    const installed = join(consumer, 'node_modules', '@sentropic', 'engram');
    mkdirSync(installed, { recursive: true });
    execFileSync('tar', ['-xf', join(directory, packed[0].filename), '--strip-components=1', '-C', installed], { env });
    writeFileSync(join(consumer, 'package.json'), '{"type":"module"}');
    const probe = `
      import assert from 'node:assert/strict';
      import { createMemoryReadToolsV1, createMemoryReadPageStoreV1 } from '@sentropic/engram/memory-tools';
      assert.equal(typeof createMemoryReadToolsV1, 'function');
      const now = '2026-08-16T12:34:56.789Z';
      let calls = 0;
      const fail = async () => { calls++; throw Error('SECRET /private/store'); };
      const facets = { scope_ref: 'scope:one', store_id: 'store:one', recallPort: { version: 3, recall: fail }, readPort: { version: 1, readCurrent: fail } };
      const host = { clock: { now: () => now }, authenticate: async () => true, authorize: async () => true, authorizeContinuation: async () => undefined, pages: createMemoryReadPageStoreV1({ clock: { now: () => now }, ttl_ms: 1000, max_entries: 2 }) };
      const api = createMemoryReadToolsV1({ facets, host });
      const input = { query: 'needle', purpose_ref: 'purpose:one' };
      const ctx = { auditId: 'audit:packed', authorization: { credential: 'credential:one' }, scope_ref: 'scope:one', store_id: 'store:one', principal_namespace: 'ns:one', principal_id: 'alice', tenant_id: 'tenant:one', connector_instance_id: 'connector:one', agent_id: 'agent:one', session_id: 'session:one', generation: '1', policy_id: 'policy:one', policy_version: '1', authorization_epoch: '0', deadline_at: '2026-08-16T12:35:16.789Z' };
      assert.equal(calls, 0);
      await assert.rejects(api.search(input, undefined), { code: -32603 });
      assert.equal(calls, 0);
      const invalid = await api.search({ ...input, scope_ref: 'forged' }, ctx);
      assert.equal(invalid.error.code, 'INVALID_SCHEMA'); assert.equal(calls, 0);
      for (const verdict of [undefined, false, null, 'true', 1]) {
        const denied = createMemoryReadToolsV1({ facets, host: { ...host, authorize: async () => verdict } });
        assert.equal((await denied.search(input, ctx)).error.code, 'UNAUTHORIZED');
      }
      assert.equal(calls, 0);
      const wrong = createMemoryReadToolsV1({ facets: { ...facets, recallPort: { version: 2, recall: fail } }, host });
      assert.equal((await wrong.search(input, ctx)).error.code, 'CAPABILITY_UNAVAILABLE'); assert.equal(calls, 0);
      const handle = await host.pages.issue({ binding_digest: 'wrong', internal_engine_cursor: 'raw:engine', selected_profile: 'offline_lexical_v1', profile_version: '1', valid_as_of: 1, system_as_of: '0' });
      assert.equal((await api.search({ ...input, page_cursor: handle }, ctx)).error.code, 'STALE_PAGE'); assert.equal(calls, 0);
      const failed = await api.search(input, ctx);
      assert.equal(failed.error.code, 'STORE_UNAVAILABLE'); assert.equal(failed.auditId, 'audit:packed');
      assert.equal(JSON.stringify(failed).includes('SECRET'), false); assert.equal(calls, 1);
      console.log('packed guards passed');
    `;
    writeFileSync(join(consumer, 'probe.mjs'), probe);
    expect(execFileSync(process.execPath, ['probe.mjs'], { cwd: consumer, env, encoding: 'utf8' })).toContain('packed guards passed');
    writeFileSync(join(consumer, 'probe.ts'), `
      import { createMemoryReadToolsV1, type MemoryReadFacetsV1, type MemoryReadHostV1 } from '@sentropic/engram/memory-tools';
      declare const facets: MemoryReadFacetsV1;
      declare const host: MemoryReadHostV1;
      const api = createMemoryReadToolsV1({ facets, host });
      // @ts-expect-error trusted host invocation is mandatory in the installed types too
      api.search({ query: 'needle', purpose_ref: 'purpose:one' });
    `);
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--strict', '--skipLibCheck', join(consumer, 'probe.ts')], { cwd: root, env, stdio: 'pipe' });
    // No source aliases, node_modules links, install scripts or network were needed.
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30_000);
