const root = '/fixture/node_modules/';
const spawn = name => ({ kind: 'native-build', detail: { method: 'spawn', executable: '/tools/node-gyp', cwd: root + name } });
const fixture = (name, log, builds = false, trace = [], outputs = []) => ({ name, log, builds, trace, outputs });
export const detectorCases = [
  // The nine round-2 scenarios remain; positive cases now supply execution proof.
  fixture('round-1 tree-sitter warning', 'npm warn install-scripts   tree-sitter-lua@2.1.3 (install: node-gyp rebuild)'),
  fixture('warning naming fs-ext', 'npm warn install-scripts   fs-ext@2.0.1 (install: node-gyp rebuild)'),
  fixture('unrelated addon build', '> tree-sitter-lua@2.1.3 install\n> node-gyp rebuild\ngyp info build done', false,
    [{ kind: 'native-build', detail: { method: 'spawn', executable: 'node-gyp', cwd: root + 'tree-sitter-lua' } }]),
  fixture('executed fs-ext with lifecycle records', '> fs-ext@2.0.1 install\n> node-gyp rebuild\ngyp info ok', true, [spawn('fs-ext')]),
  fixture('executed better-sqlite3 with attributable log', 'gyp info build with better-sqlite3@12.2.0 at node_modules/better-sqlite3', true, [spawn('better-sqlite3')]),
  fixture('executed fs-ext spawn', 'added 100 packages in 10s', true, [spawn('fs-ext')]),
  fixture('executed better-sqlite3 spawn', 'added 100 packages in 10s', true, [spawn('better-sqlite3')]),
  fixture('non-build and unattributed rows', '', false, [
    { kind: 'lifecycle', detail: 'fs-ext node-gyp rebuild' },
    { kind: 'native-build', detail: { method: 'spawn', executable: 'node-gyp', cwd: root + 'engram-memory' } },
  ]),
  fixture('ordinary install', 'added 312 packages in 12s'),
  fixture('successful prebuild lifecycle banner', '> better-sqlite3@12.11.1 install\n> prebuild-install || node-gyp rebuild --release\nprebuild-install info install Successfully installed prebuilt binary!'),
  fixture('successful prebuild npm info echo', 'npm info run better-sqlite3@12.11.1 install node_modules/better-sqlite3 prebuild-install || node-gyp rebuild --release\nnpm info run better-sqlite3@12.11.1 install { code: 0, signal: null }'),
  fixture('log-only fs-ext lifecycle', '> fs-ext@2.0.1 install\n> node-gyp rebuild\ngyp info ok'),
  fixture('log-only better-sqlite3 build marker', 'gyp info build with better-sqlite3 at node_modules/better-sqlite3'),
  fixture('prebuilt-only filesystem', '', false, [], [root + 'better-sqlite3/build/Release/better_sqlite3.node', root + 'fs-ext/build/Release/fs_ext.node']),
  ...['better-sqlite3', 'fs-ext'].flatMap(name => [
    fixture(name + ' obj.target output', '', true, [], [root + name + '/build/Release/obj.target']),
    fixture(name + ' config.gypi output', '', true, [], [root + name + '/build/config.gypi']),
  ]),
  fixture('shell dispatch is not execution proof', '', false, [{ kind: 'native-build', detail: { method: 'spawn', executable: '/bin/sh', cwd: root + 'better-sqlite3' } }]),
  fixture('prebuild spawn is not execution proof', '', false, [{ kind: 'native-build', detail: { method: 'spawn', executable: 'prebuild-install', cwd: root + 'better-sqlite3' } }]),
];
export const detectorOptions = test => ({
  moduleDirectories: ['better-sqlite3', 'fs-ext'].map(name => root + name),
  pathExists: file => test.outputs.includes(file),
});
