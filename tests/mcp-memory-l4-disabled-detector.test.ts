import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { assertNoNativeBuildAttempts } from '../scripts/mcp-memory-l4-packed-acceptance.mjs';
import { createDisabledTrace, isMemoryNativeBuildProcess } from '../scripts/mcp-memory-disabled-trace.mjs';
import { detectorCases, detectorOptions } from './fixtures/l4-disabled-detector-cases.mjs';

describe('disabled-install native-build detector', () => {
  for (const test of detectorCases) it(test.name, () => {
    const detect = () => assertNoNativeBuildAttempts(test.log, 'disabled install', test.trace, detectorOptions(test));
    if (test.builds) expect(detect).toThrow(/native build attempts observed/);
    else expect(detect).not.toThrow();
  });

  it('classifies the actual successful-prebuild preload dispatch entirely in memory', () => {
    const files = new Map<string, string>();
    createDisabledTrace('/memory', {
      writeFile: (file, bytes) => files.set(file, String(bytes)),
      readFile: file => files.get(file) ?? '',
    });
    const rows: any[] = [];
    const child = Object.fromEntries(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']
      .map(method => [method, () => ({ status: 0 })]));
    class Module { static _load() {} static _resolveFilename(file) { return file; } _compile() {} }
    runInNewContext(files.get('/memory/trace-preload.cjs')!, {
      require: name => ({
        'node:fs': { appendFileSync: (_file, line) => rows.push(JSON.parse(line)) },
        'node:module': Object.assign(Module, { syncBuiltinESMExports() {} }),
        'node:child_process': child,
      })[name],
      process: { env: { MCP_L4_TRACE: '/memory/trace' }, cwd: () => '/fixture/node_modules/better-sqlite3' },
    });
    child.spawn('/bin/sh', ['-c', 'prebuild-install || node-gyp rebuild --release']);
    child.spawn('/tools/prebuild-install', []);
    child.spawn('node-gyp', ['rebuild'], { shell: true });
    child.exec('node-gyp rebuild');
    expect(rows.filter(row => row.kind === 'lifecycle')).toHaveLength(4);
    expect(rows.filter(row => row.kind === 'native-build')).toEqual([]);
    expect(() => assertNoNativeBuildAttempts('', 'disabled install', rows)).not.toThrow();
    for (const name of ['fs-ext', 'better-sqlite3']) {
      child.spawn('/tools/node-gyp', ['rebuild'], { cwd: join('/fixture/node_modules', name) });
      expect(() => assertNoNativeBuildAttempts('', 'disabled install', rows)).toThrow(/native build attempts observed/);
    }
    expect(rows.filter(row => row.kind === 'native-build')).toHaveLength(2);
  });

  it('attributes only the specified compiler executables to a memory module cwd', () => {
    for (const executable of ['node-gyp', 'make', 'cc', 'c++', 'g++', 'gcc', 'clang', 'clang++', 'clang-18']) {
      expect(isMemoryNativeBuildProcess('/tools/' + executable, '/fixture/node_modules/fs-ext')).toBe(true);
      expect(isMemoryNativeBuildProcess(executable, '/fixture/node_modules/better-sqlite3/build')).toBe(true);
      expect(isMemoryNativeBuildProcess(executable, '/fixture/node_modules/tree-sitter-lua')).toBe(false);
    }
    for (const executable of ['sh', 'prebuild-install', 'node', 'not-node-gyp', 'gcc-wrapper']) {
      expect(isMemoryNativeBuildProcess(executable, '/fixture/node_modules/fs-ext')).toBe(false);
    }
    expect(isMemoryNativeBuildProcess('make', '/fixture/node_modules/fs-ext-other')).toBe(false);
  });
});
