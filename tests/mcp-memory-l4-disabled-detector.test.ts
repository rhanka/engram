import { describe, expect, it } from 'vitest';
import { assertNoNativeBuildAttempts } from '../scripts/mcp-memory-l4-packed-acceptance.mjs';

// Regression for the review finding: the disabled-install detector used to
// reject an unrelated npm warning as a memory-native compilation attempt.
describe('disabled-install native-build detector', () => {
  it('ignores the warning-only tree-sitter-lua script description', () => {
    const log = 'npm warn install-scripts   tree-sitter-lua@2.1.3 (install: node-gyp rebuild)';
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', [])).not.toThrow();
  });

  it('ignores warning-only lines even when they name a memory native module', () => {
    const log = [
      'npm warn install-scripts   fs-ext@2.0.1 (install: node-gyp rebuild)',
      'added 10 packages in 3s',
    ].join('\n');
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', [])).not.toThrow();
  });

  it('ignores executed builds of unrelated addons', () => {
    const log = [
      '> tree-sitter-lua@2.1.3 install',
      '> node-gyp rebuild',
      'gyp info build done',
    ].join('\n');
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', [])).not.toThrow();
  });

  it('flags an executed fs-ext build via adjacent lifecycle records', () => {
    const log = [
      '> fs-ext@2.0.1 install',
      '> node-gyp rebuild',
      'gyp info ok',
    ].join('\n');
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', [])).toThrow(
      /native build attempts observed/,
    );
  });

  it('flags an executed better-sqlite3 build on one attributable line', () => {
    const log = 'gyp info build with better-sqlite3@12.2.0 at node_modules/better-sqlite3';
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', [])).toThrow(
      /native build attempts observed/,
    );
  });

  it('flags instrumented native-build trace rows for memory modules', () => {
    const log = 'added 100 packages in 10s';
    const traceRows = [
      { kind: 'native-build', detail: '/tmp/l4/disabled/node_modules/fs-ext fs-ext ["node-gyp","rebuild"]' },
    ];
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', traceRows)).toThrow(
      /native build attempts observed/,
    );
  });

  it('flags instrumented native-build trace rows for better-sqlite3', () => {
    const log = 'added 100 packages in 10s';
    const traceRows = [
      { kind: 'native-build', detail: '/tmp/l4/disabled better-sqlite3 ["prebuild-install","--build-from-source"]' },
    ];
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', traceRows)).toThrow(
      /native build attempts observed/,
    );
  });

  it('ignores non-build trace rows and unattributed native-build rows', () => {
    const log = 'added 100 packages in 10s';
    const traceRows = [
      { kind: 'lifecycle', detail: '/tmp/l4/disabled fs-ext ["node","-e",""]' },
      { kind: 'native-build', detail: '/tmp/l4/disabled/node_modules/engram-memory engram-memory ["node-gyp","rebuild"]' },
    ];
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', traceRows)).not.toThrow();
  });

  it('accepts a clean ordinary install log', () => {
    const log = 'added 312 packages in 12s';
    expect(() => assertNoNativeBuildAttempts(log, 'disabled install', [])).not.toThrow();
  });
});
