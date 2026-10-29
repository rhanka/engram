// Run from the candidate worktree: node tests/fixtures/l4-full-suite-evidence/setup.mjs
// Node only. A lock delta requires an explicit owner exception; default is STOP.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
assert.equal(process.cwd(), root);
const pin = '8b93ba6b834f83fddbcf76091054efea2e188cf1';
const baseline = path.join(root, '.baseline');
const scratch = path.join(root, '.graphify/scratch/l4-r3-compare');
fs.mkdirSync(scratch, { recursive: true });
const env = { ...process.env, ENV: 'test-l4-r3', npm_config_cache: path.join(scratch, 'npm-cache') };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, env });
const setupFile = path.join(scratch, 'setup.json');
const setup = { format: 'l4-shared-suite-setup/1', baseCommit: pin,
  branchCommit: git('rev-parse', 'HEAD').toString().trim(),
  method: 'Detached .baseline at exact 8b93ba6b; node_modules, engram-memory/node_modules and studio/node_modules shared by symlinks. Same Node, environment, npm cache, builds and Vitest command. No native rebuild.',
  environment: { node: process.version, nodeBinary: process.execPath, platform: process.platform, arch: process.arch,
    npm: execFileSync('npm', ['--version'], { env, encoding: 'utf8' }).trim(),
    ENV: env.ENV, npmCache: env.npm_config_cache, pathGuard: env.PATH.split(path.delimiter)[0],
    variablesSha256: hash(JSON.stringify(Object.fromEntries(Object.entries(env).sort()))) },
  lockfiles: {}, symlinks: {}, commands: [], logs: [], diskChecks: [] };
const save = () => fs.writeFileSync(setupFile, JSON.stringify(setup, null, 2) + '\n');
async function run(label, executable, args, cwd = root, allowFailure = false) {
  const log = path.join(scratch, label + '.log');
  const fd = fs.openSync(log, 'w');
  const entry = { label, executable, args, cwd, startedAt: new Date().toISOString(),
    retainedLog: 'tests/fixtures/l4-full-suite-evidence/' + label + '.log.gz' };
  setup.commands.push(entry); if (label !== 'comparison') setup.logs.push(path.relative(root, log)); save();
  console.log(label + ': ' + executable + ' ' + args.join(' '));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['ignore', fd, fd] });
    child.once('error', reject); child.once('exit', resolve);
  }).finally(() => fs.closeSync(fd));
  entry.exitCode = code; entry.finishedAt = new Date().toISOString(); save();
  console.log(label + ': exit ' + code);
  assert.ok(code === 0 || allowFailure, label + ' failed: see ' + log);
  return code;
}
function diskFloor() {
  const stats = fs.statfsSync('/', { bigint: true });
  const available = stats.bavail * stats.bsize;
  setup.diskChecks.push({ at: new Date().toISOString(), availableBytes: String(available), minimumBytes: String(15n * 1024n ** 3n) });
  save(); assert.ok(available >= 15n * 1024n ** 3n, 'disk below 15 GiB: STOP');
}
for (const file of ['package-lock.json', 'engram-memory/package-lock.json', 'studio/package-lock.json']) {
  const expected = git('show', pin + ':' + file), actual = fs.readFileSync(path.join(root, file));
  const identical = expected.equals(actual);
  setup.lockfiles[file] = { identical, baseSha256: hash(expected), branchSha256: hash(actual) };
  if (!identical) {
    const delta = git('diff', '--no-ext-diff', pin, '--', file);
    fs.writeFileSync(path.join(scratch, 'lock-delta.log'), delta);
    setup.logs.push(path.relative(root, path.join(scratch, 'lock-delta.log')));
    setup.lockfiles[file].deltaSha256 = hash(delta);
    save();
    assert.equal(file, 'package-lock.json', file + ' differs: STOP');
    assert.equal(hash(delta), '3e1b88ef29bd3af25b0b7cdd668ac200209ff536de8b02a66b4dc35ae8deed48', 'unexpected lock delta: STOP');
    assert.equal(env.L4_ACCEPT_LOCK_DELTA, '1', 'root lock differs; explicit owner exception required: STOP');
    setup.lockfileException = 'Owner authorized the exact retained L4 version/SDK/optional-peer delta with one shared installation.';
  }
}
// Existing native addons are reused. This script never copies or rebuilds them.
setup.nativeBinaries = {};
for (const file of ['fs-ext/build/Release/fs_ext.node', 'better-sqlite3/build/Release/better_sqlite3.node']) {
  const location = path.join(root, 'engram-memory/node_modules', file);
  assert.ok(fs.existsSync(location), 'native addon missing; cmp locks before any cp -a repair: ' + file);
  setup.nativeBinaries[file] = { path: location, sha256: hash(fs.readFileSync(location)) };
}
const packedPaths = execFileSync('tar', ['-tzf', '.graphify/scratch/l4-r5-artifacts/sentropic-engram-0.22.0.tgz'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(file => !file.endsWith('/')).map(file => file.replace(/^package\//, ''));
const packedBefore = Object.fromEntries(packedPaths.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
setup.packedBefore = packedBefore;
assert.ok(!fs.existsSync(baseline), '.baseline already exists: STOP');
let created = false;
try {
  diskFloor();
  await run('baseline-create', 'git', ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', baseline, pin]);
  created = true;
  for (const subdir of ['node_modules', 'engram-memory/node_modules', 'studio/node_modules']) {
    const target = path.join(root, subdir), link = path.join(baseline, subdir);
    fs.symlinkSync(target, link, 'dir');
    assert.equal(fs.realpathSync(link), fs.realpathSync(target));
    setup.symlinks[subdir] = { baseline: link, sharedRealpath: fs.realpathSync(target) };
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/substrate-consumer/package-lock.json')));
  const tarballs = [...new Set(Object.values(lock.packages).map(pkg => pkg.resolved).filter(url => url?.startsWith('https://')))].sort();
  await run('shared-offline-cache', 'npm', ['cache', 'add', ...tarballs, '--ignore-scripts']);
  const receiptPath = path.join(root, 'registry/publisher-assets.v1.json');
  const receipt = fs.readFileSync(receiptPath);
  for (const [side, cwd] of [['base', baseline], ['branch', root]]) {
    const tokenFile = path.join(cwd, 'src/workspace/tokens-st-css.generated.ts');
    const tokens = fs.readFileSync(tokenFile);
    await run(side + '-native-probe', process.execPath, ['--input-type=module', '-e',
      'import {createRequire} from "node:module";import path from "node:path";const require=createRequire(path.join(process.cwd(),"engram-memory/package.json"));const f=require("fs-ext");const DB=require("better-sqlite3");const db=new DB(":memory:");console.log(JSON.stringify({fsExt:typeof f.flockSync,sqlite:db.prepare("select 1 as ok").get()}));db.close();'], cwd);
    await run(side + '-build', 'npm', ['run', 'build'], cwd);
    await run(side + '-engram-memory-build', 'npm', ['--prefix', 'engram-memory', 'run', 'build'], cwd);
    const generated = fs.readFileSync(tokenFile);
    setup.generatedTokens ??= {};
    setup.generatedTokens[side] = { generatedSha256: hash(generated), pinnedSha256: hash(tokens), restoredBeforeSuite: true };
    fs.writeFileSync(tokenFile, tokens);
    for (const file of ['dist/cli.js', 'dist/memory-substrate.js', 'dist/memory-substrate.d.ts', 'engram-memory/dist/index.js', 'engram-memory/dist/sqlite.js']) {
      assert.ok(fs.statSync(path.join(cwd, file)).size > 0, 'build missing: ' + file);
    }
    if (side === 'branch') {
      // The external receipt is unpacked metadata; retain and restore its build provenance churn.
      fs.writeFileSync(path.join(scratch, 'generated-publisher-receipt.log'), fs.readFileSync(receiptPath));
      setup.logs.push(path.relative(root, path.join(scratch, 'generated-publisher-receipt.log')));
      fs.writeFileSync(receiptPath, receipt);
      setup.changedPackedFiles = packedPaths.filter(file => hash(fs.readFileSync(path.join(root, file))) !== packedBefore[file]);
      save(); assert.deepEqual(setup.changedPackedFiles, [], 'packed file changed: STOP; no repack');
    }
  }
  await run('detector-mutants', process.execPath, ['tests/mcp-memory-l4-disabled-detector.mutants.mjs']);
  await run('comparator-self-test', process.execPath, ['--test', 'tests/compare-l4-full-suite.self-test.mjs']);
  for (const [side, cwd] of [['base', baseline], ['branch', root]]) {
    diskFloor();
    await run(side + '-suite', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--configLoader', 'runner', '--reporter=json',
      '--outputFile=' + path.join(scratch, side + '-vitest.json')], cwd, true);
  }
} finally {
  if (created) {
    await run('baseline-remove', 'git', ['-c', 'core.hooksPath=/dev/null', 'worktree', 'remove', '--force', baseline]);
    setup.baselineRemoved = !fs.existsSync(baseline); save();
  }
}
process.exitCode = await run('comparison', process.execPath, ['tests/compare-l4-full-suite.mjs', path.join(scratch, 'base-vitest.json'),
  path.join(scratch, 'branch-vitest.json'), setupFile, path.join(scratch, 'comparison.json')], root, true);
