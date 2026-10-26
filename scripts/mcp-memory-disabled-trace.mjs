import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Runs before npm and is inherited by every lifecycle Node process. Both
 * module systems instrument the same concrete initialization boundaries. */
export function createDisabledTrace(directory) {
  const common = String.raw`
const fs = require('node:fs');
const trace = (kind, detail) => fs.appendFileSync(process.env.MCP_L4_TRACE, JSON.stringify({ kind, detail }) + '\n');
const memoryModule = file => /(?:mcp-memory\.(?:js|cjs)|engram-memory\/(?:dist\/)?(?:engine|memory-store|sqlite|postgres|module-storage)|(?:better-sqlite3|fs-ext)(?:\/|$))/.test(file);
const transform = (source, file) => {
  if (!/[/\\]@sentropic[/\\]engram[/\\]/.test(file)) return source;
  const record = (kind, name) => 'require("node:fs").appendFileSync(process.env.MCP_L4_TRACE, JSON.stringify({kind:' + JSON.stringify(kind) + ',detail:' + JSON.stringify(name) + '}) + "\\n");';
  source = source.replace(/(function (openFencedSqliteCanonicalMemoryStoreV1|openReferenceSqliteHandleV1|openModuleStorageCanonicalMemoryStoreV1|openPostgresCanonicalMemoryStoreV1|createInMemoryCanonicalMemoryStoreV1|createCanonicalMemoryStoreFactoryV1)\([^)]*\)\s*\{)/g,
    (whole, _head, name) => whole + record('store-open', name));
  source = source.replace(/(if \(operation\.operation === "bootstrap"\) \{)/g, whole => whole + record('identity-bootstrap', 'admin.bootstrap'));
  return source;
};
`;
  const preload = join(directory, 'trace-preload.cjs');
  writeFileSync(preload, common + String.raw`
const Module = require('node:module');
const child = require('node:child_process');
const compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  trace('cjs-compile', filename);
  return compile.call(this, transform(content, filename), filename);
};
const load = Module._load;
Module._load = function (request, parent, main) {
  const resolved = Module._resolveFilename(request, parent, main);
  trace('cjs-load', resolved);
  if (memoryModule(resolved)) trace('provider-load', resolved);
  return load.apply(this, arguments);
};
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  const original = child[method];
  child[method] = function (...args) {
    const command = JSON.stringify(args.slice(0, 2));
    const options = args.find(x => x && typeof x === 'object' && !Array.isArray(x)) ?? {};
    const context = String(options.cwd ?? process.cwd()) + ' ' + (options.env?.npm_package_name ?? process.env.npm_package_name ?? '');
    trace('lifecycle', context + ' ' + command);
    if (/node-gyp|prebuild-install|build-from-source|cmake-js/.test(command) && /fs-ext|better-sqlite3|engram-memory/.test(context + ' ' + command)) trace('native-build', context + ' ' + command);
    return original.apply(this, args);
  };
}
require('node:module').syncBuiltinESMExports();
`);
  // A loader thread sees ESM sources before evaluation. Inject an ESM-safe
  // require only when a measured function body was actually instrumented.
  const loader = join(directory, 'trace-loader.mjs');
  writeFileSync(loader, "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n" + common + String.raw`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  trace('esm-load', url);
  if (memoryModule(url)) trace('provider-load', url);
  if (result.format === 'module' && result.source != null) {
    const source = result.source.toString();
    const changed = transform(source, url);
    if (changed !== source) return { ...result, source: 'import {createRequire as __l4Require} from "node:module";const __l4TraceRequire = __l4Require(import.meta.url);\n' + changed.replaceAll('require("node:fs").appendFileSync', '__l4TraceRequire("node:fs").appendFileSync') };
  }
  return result;
}
`);
  const registration = join(directory, 'trace-register.mjs');
  writeFileSync(registration, "import { register } from 'node:module';\nregister(" + JSON.stringify(loader) + ", import.meta.url);\n");
  const tracePath = join(directory, 'disabled-trace.jsonl');
  writeFileSync(tracePath, '');
  return {
    env: {
      MCP_L4_TRACE: tracePath,
      NODE_OPTIONS: [process.env.NODE_OPTIONS ?? '', '--require=' + preload, '--import=' + registration].join(' ').trim(),
    },
    read: () => readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
    reset: () => writeFileSync(tracePath, ''),
  };
}
