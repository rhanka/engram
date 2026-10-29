import assert from 'node:assert/strict';
import { assertNoNativeBuildAttempts } from '../scripts/mcp-memory-l4-packed-acceptance.mjs';
import { detectorCases, detectorOptions } from './fixtures/l4-disabled-detector-cases.mjs';
// Exact round-1 log predicate, retained as a mutation control.
const oldPredicate = log => {
  if (log.split('\n').some(line => /node-gyp rebuild|gyp info .*build|build-from-source/i.test(line) &&
    /fs-ext|better-sqlite3|node-gyp/i.test(line))) throw new Error('native build attempts observed');
};
const failedCases = detector => detectorCases.filter(test => {
  let throws = false;
  try { detector(test.log, 'disabled install', test.trace, detectorOptions(test)); } catch { throws = true; }
  return throws !== test.builds;
}).map(test => test.name);
const actual = failedCases(assertNoNativeBuildAttempts), old = failedCases(oldPredicate), noop = failedCases(() => {});
assert.deepEqual(actual, []);
for (const name of ['round-1 tree-sitter warning', 'successful prebuild lifecycle banner', 'successful prebuild npm info echo']) assert.ok(old.includes(name), name);
for (const name of ['executed fs-ext spawn', 'executed better-sqlite3 spawn', 'fs-ext obj.target output', 'better-sqlite3 obj.target output']) assert.ok(noop.includes(name), name);
console.log(JSON.stringify({ cases: detectorCases.length, negatives: detectorCases.filter(test => !test.builds).length,
  positives: detectorCases.filter(test => test.builds).length, actualFailures: actual, oldPredicateFailures: old, noopFailures: noop }, null, 2));
