import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCorpus, buildLineAttributionFixture, detectGitCapabilities, inventoryDigest, LiveGitSandbox, nativeLineOracle } from "./helpers/live-git-fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = join(root, "engram-live");
const buildScript = join(root, "scripts", "build-live.mjs");
const rootPackageJson = join(root, "package.json");

const productionSnippets = {
  c: "int probe(void) { return 0; }\n",
  cpp: "int probe() { return 0; }\n",
  go: "package main\nfunc probe() {}\n",
  java: "class Probe { void probe() {} }\n",
  javascript: "function probe() {}\n",
  php: "<?php function probe() {}\n",
  python: "def probe():\n    pass\n",
  ruby: "def probe\nend\n",
  rust: "fn probe() {}\n",
  typescript: "function probe(): void {}\n",
  tsx: "function probe() { return <div />; }\n",
};

const PRODUCTION_PARSE_PROBE = String.raw`
  import assert from 'node:assert/strict';
  import { createHash } from 'node:crypto';
  import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
  import { resolve } from 'node:path';
  import runtime from './host-runtime/web-tree-sitter.cjs';
  import * as live from '@sentropic/engram-live';
  import { ADVERTISED_LANGUAGES, describeCapabilities } from '@sentropic/engram-live/contracts';
  import { createLiveFactory } from '@sentropic/engram-live/integration';

  const mode = process.argv[2];
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  const installed = resolve('node_modules/@sentropic/engram-live');
  assert.throws(() => readFileSync(resolve(process.argv[3], 'package.json')), { code: 'ERR_ACCESS_DENIED' });
  assert.equal(process.permission.has('fs.read', resolve(process.argv[3], 'node_modules')), false);
  const manifest = JSON.parse(readFileSync(resolve(installed, 'grammar-manifest.json'), 'utf8'));
  const grammarRuntime = {
    init: () => runtime.Parser.init(),
    loadLanguage: (bytes) => runtime.Language.load(bytes),
    createParser(grammar) {
      const parser = new runtime.Parser();
      parser.setLanguage(grammar);
      return parser;
    },
  };
  const scope = { tenant: 'packed-owner', clone: 'clone:packed' };
  const worktreeId = 'wt:packed';
  let grammarReads = 0;
  const factory = createLiveFactory({
    declaration: {
      tenant: scope.tenant, principal: 'packed-principal', cloneId: scope.clone, worktreeId,
      hostFingerprint: 'packed-host', identityUncertainty: [], declarationId: 'decl:packed',
      authorizedRoots: ['/packed/worktree'], liveCapability: 'live', policyVersion: live.POLICY_VERSION, declarationRevision: 1,
    },
    ports: {
      git: {}, clock: { now: () => 0 }, content: {}, cache: {}, grammarRuntime,
      filesystem: { async readFileBytes(path) { grammarReads++; return readFileSync(path); } },
      factSink: { deliver() { assert.fail('analysis wrote to the fact sink'); } },
    },
  });
  globalThis.fetch = () => assert.fail('analysis requested network access');

  const entries = new Map();
  const authorizations = [];
  const cache = {
    authorize(scope) { authorizations.push(scope); },
    async load(key) { return entries.get(key) ?? null; },
    async store(key, value) { entries.set(key, value); },
  };
  function request(language, content, path = 'fixture.' + (language === 'typescript' ? 'ts' : language)) {
    const retained = new Map();
    function object(type, value) {
      const body = Buffer.from(value);
      const oid = createHash('sha1').update(type + ' ' + body.length + '\0').update(body).digest('hex');
      retained.set(oid, { type, body });
      return oid;
    }
    const blob = object('blob', content);
    const treeOid = object('tree', Buffer.concat([Buffer.from('100644 ' + path + '\0'), Buffer.from(blob, 'hex')]));
    const head = object('commit', 'tree ' + treeOid + '\nauthor Test <test@example.test> 0 +0000\n'
      + 'committer Test <test@example.test> 0 +0000\n\npacked parse\n');
    return {
      input: { scope, content, path, language, treeOid, configHash: hash('config'), dependencyHash: hash('dependencies'),
        historicalBounds: { known: true, heads: [{ algorithm: 'sha1', oid: head }] } },
      objects: { async loadObject(oid) { return retained.get(oid) ?? null; },
        async loadBlob(oid) { return retained.get(oid)?.body ?? null; } },
      cache,
    };
  }
  const source = 'export class Child extends MissingType {}\nexport function probe() { missingCall(); return 1; }\n';
  async function analyze(input) {
    const result = await factory.runCapability('code-analysis', input);
    assert.equal(result.state, 'available', JSON.stringify(result));
    assert.equal(result.delivered, true);
    assert.ok(result.analysis);
    return result;
  }
  if (mode === 'repair') {
    assert.equal(typeof live.createProductionParseAdapter, 'function', 'the packed entry must export the production adapter');
    assert.equal(typeof live.repairAffectedCalls, 'function', 'the packed entry must export receipt-checked repair');
    const adapter = live.createProductionParseAdapter(grammarRuntime);
    const grammar = await factory.loadGrammar('typescript');
    assert.equal(grammar.state, 'available');
    async function analyzeUnit(content) {
      const result = await analyze(request('typescript', content));
      const unit = await adapter.parse({ bytes: Buffer.from(content), content, language: 'typescript', dialect: 'typescript',
        grammarHandle: grammar.grammar, syntaxOptions: {} });
      return { unit, analysis: result.analysis };
    }
    const before = await analyzeUnit(source);
    const after = await analyzeUnit(source.replace('return 1', 'return 2'));
    const broken = await analyzeUnit(source + 'function broken( {\n');
    const input = { before: before.unit, after: after.unit, externalCallers: [],
      deletionEvidence: { before: before.analysis.declarationInventory, after: after.analysis.declarationInventory } };
    console.log(JSON.stringify({ before, after, broken, repair: live.repairAffectedCalls(input),
      forged: live.repairAffectedCalls({ ...input, deletionEvidence: structuredClone(input.deletionEvidence) }) }));
  } else if (mode === 'factory') {
    const input = request('typescript', source);
    const initial = await analyze(input);
    const warm = await analyze(input);
    const grammar = resolve(installed, 'dist/grammars', manifest.languages.typescript.file);
    const bytes = readFileSync(grammar);
    unlinkSync(grammar);
    let missing;
    try { missing = await factory.runCapability('code-analysis', input); }
    finally { writeFileSync(grammar, bytes); }
    const recovered = await analyze(input);
    const unsupported = await analyze(request('lua', 'function probe() end'));
    input.input.scope = { ...scope, clone: 'clone:foreign' };
    await assert.rejects(() => factory.runCapability('code-analysis', input), /scope does not match/);
    console.log(JSON.stringify({ described: describeCapabilities(), factory: factory.describeCapabilities(),
      initial, warm, missing, recovered, unsupported }));
  } else if (mode === 'malformed') {
    for (const input of [undefined, null, [], new Date(), 'typescript']) {
      await assert.rejects(() => factory.runCapability('code-analysis', { input }), /input must be a plain object/);
    }
    console.log(JSON.stringify({ grammarReads, authorizations }));
  } else if (mode === 'worktree') {
    const committed = request('typescript', source);
    const snapshot = { ...committed, input: { ...committed.input, treeOid: null, snapshotId: 'snap:packed' } };
    for (const [operation, scopeWorktree, inputWorktreeId] of [
      [snapshot, 'wt:foreign', undefined],
      [snapshot, undefined, 'wt:foreign'],
      [committed, worktreeId, undefined],
      [committed, undefined, worktreeId],
    ]) {
      const input = { ...operation.input, scope: { ...scope, worktree: scopeWorktree }, worktreeId: inputWorktreeId };
      await assert.rejects(() => factory.runCapability('code-analysis', { ...operation, input }), /scope does not match/);
    }
    assert.equal(grammarReads, 0);
    assert.deepEqual(authorizations, []);
    const boundScope = { ...scope, worktree: worktreeId };
    const explicit = await analyze({ ...snapshot, input: { ...snapshot.input, scope: boundScope, worktreeId } });
    const implicit = await analyze(snapshot);
    assert.deepEqual(authorizations, [boundScope, boundScope]);
    const cloneOnly = await analyze({ ...committed, input: { ...committed.input, scope: { ...scope, worktree: null }, worktreeId: null } });
    const committedAuthorizations = authorizations.slice(2);
    assert.ok(committedAuthorizations.length > 0);
    for (const authorized of committedAuthorizations) assert.deepEqual(authorized, scope);
    console.log(JSON.stringify({ explicit: explicit.analysis, implicit: implicit.analysis, cloneOnly: cloneOnly.analysis }));
  } else if (mode === 'coverage') {
    const failed = await analyze(request('typescript', 'export const x = "\uD800";', 'private/secret-path.ts'));
    console.log(JSON.stringify({ failed, grammar: factory.grammarCoverage('typescript'),
      report: factory.grammarCoverageReport('typescript') }));
  } else if (mode === 'references') {
    const cpp = await analyze(request('cpp', 'class Child : public virtual Base, protected ns::Other, private Tmpl<int> {};'));
    const php = await analyze(request('php', '<?php class Child extends \\Ns\\Base { function p() { Foo::bar(); \\Ns\\baz(); } }'));
    console.log(JSON.stringify({ cpp: cpp.analysis, php: php.analysis }));
  } else {
    const snippets = ${JSON.stringify(productionSnippets)};
    const matrix = {};
    for (const language of ADVERTISED_LANGUAGES) {
      assert.ok(Object.hasOwn(snippets, language));
      const { analysis, languages } = await analyze(request(language, snippets[language]));
      matrix[language] = { analysis, coverage: languages.find((entry) => entry.language === language) };
    }
    console.log(JSON.stringify(matrix));
  }
`;

const REUSED_EXTRACTION_PROBE = String.raw`
  import assert from 'node:assert/strict';
  import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
  import { resolve, join } from 'node:path';
  import runtime from './host-runtime/web-tree-sitter.cjs';
  import * as live from '@sentropic/engram-live';

  const mode = process.argv[2];
  assert.throws(() => readFileSync(resolve(process.argv[3], 'package.json')), { code: 'ERR_ACCESS_DENIED' });
  assert.equal(process.permission.has('fs.read', resolve(process.argv[3], 'node_modules')), false);
  assert.equal(typeof live.bindReusedExtractionRuntime, 'function', 'the packed entry must export the runtime binder');
  assert.equal(typeof live.extractReused, 'function', 'the packed entry must export extractReused');
  assert.equal(typeof live.extractReusedWithDiagnostics, 'function', 'the packed entry must export live extraction');
  assert.equal(typeof live.resolveReusedLiveLanguage, 'function', 'the packed entry must export language resolution');
  assert.equal(live.REUSED_LIVE_DIALECT_VERSION, 'live-dialect/1');
  assert.equal(live.REUSED_LIVE_GRAMMAR_ABI, 'web-tree-sitter-abi/1');
  for (const malformed of [undefined, null, {}, { loadLanguage: () => Promise.resolve({}) }, { createParser: () => ({}) }]) {
    assert.throws(() => live.bindReusedExtractionRuntime(malformed), TypeError, 'malformed runtime must be rejected eagerly');
  }
  const installed = resolve('node_modules/@sentropic/engram-live');
  const grammarFile = (lang) => join(installed, 'dist', 'grammars', 'tree-sitter-' + lang + '.wasm');
  const liveGrammarWasm = {
    bytesFor(language) {
      const file = grammarFile(language);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
    },
  };
  const grammarRuntime = {
    init: () => runtime.Parser.init(),
    loadLanguage: (bytes) => runtime.Language.load(bytes),
    createParser(grammar) {
      const parser = new runtime.Parser();
      parser.setLanguage(grammar);
      return parser;
    },
  };
  live.bindReusedExtractionRuntime(grammarRuntime);
  globalThis.fetch = () => assert.fail('reused extraction requested network access');
  const resolved = live.resolveReusedLiveLanguage('/reused/probe/app.ts');
  assert.ok(resolved && resolved.language === 'typescript', 'context language resolves to typescript, got ' + JSON.stringify(resolved));
  function virtualRead(files) {
    const present = (p) => files.has(p) || [...files.keys()].some((name) => name.startsWith(p + '/'));
    return {
      context: { kind: 'tree', treeOid: 'a'.repeat(40) },
      existsSync: (p) => present(String(p)),
      readFileSync: (p, options) => {
        const value = files.get(String(p));
        if (value === undefined) throw new Error('not in pinned tree: ' + p);
        return options ? value : Buffer.from(value);
      },
      lstatSync: (p) => {
        if (!present(String(p))) throw new Error('not in pinned tree: ' + p);
        const file = files.has(String(p));
        return { mode: file ? 33188 : 16877, isFile: () => file, isDirectory: () => !file, isSymbolicLink: () => false };
      },
      realpathSync: (p) => String(p),
      readdirSync: () => [],
    };
  }
  function memoryStore(counters) {
    const entries = new Map();
    return {
      entries,
      authorize() {},
      load(key) { counters.loads.push(key); return entries.get(key) || null; },
      store(key, value) { counters.stores.push(key); entries.set(key, value); },
    };
  }
  if (mode === 'extract') {
    const files = new Map([
      ['/reused/probe/app.ts', 'import { dep } from "@dep";\nexport function probe() { return dep(); }\n'],
      ['/reused/probe/lib/dep.ts', 'export function dep() { return 1; }\n'],
      ['/reused/probe/tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@dep': ['lib/dep'] } } })],
    ]);
    const counters = { loads: [], stores: [] };
    const cacheStore = memoryStore(counters);
    const ports = {
      cacheStore,
      grammarWasm: liveGrammarWasm,
      scope: { tenant: 'packed-owner', clone: 'clone:packed' },
      read: virtualRead(files),
    };
    const first = await live.extractReusedWithDiagnostics(['/reused/probe/app.ts', '/reused/probe/lib/dep.ts'], ports);
    assert.ok(first.extraction.nodes.length > 0, 'packaged reused extraction yields nodes, got ' + first.extraction.nodes.length);
    assert.ok(first.extraction.edges.length > 0, 'packaged reused extraction yields edges, got ' + first.extraction.edges.length);
    assert.deepEqual(first.diagnostics, [], 'no diagnostics on valid pinned tree, got ' + JSON.stringify(first.diagnostics));
    const resolvedImportEdge = first.extraction.edges.some(
      (e) => e.source === 'app' && e.target === 'lib_dep' && e.relation === 'imports_from',
    );
    const unresolvedImportEdge = first.extraction.edges.some(
      (e) => e.relation === 'imports_from' && e.target === 'ref_dep',
    );
    assert.equal(resolvedImportEdge, true, 'tsconfig alias must resolve app -> lib_dep imports_from edge, edges=' + JSON.stringify(first.extraction.edges));
    assert.equal(unresolvedImportEdge, false, 'tsconfig alias must not leave an unresolved ref_dep imports_from edge, edges=' + JSON.stringify(first.extraction.edges));
    // Negative control: without tsconfig.json, the alias must stay unresolved
    // (ref_dep) and must not produce app -> lib_dep imports_from.
    const filesWithoutTsconfig = new Map([
      ['/reused/probe/app.ts', files.get('/reused/probe/app.ts')],
      ['/reused/probe/lib/dep.ts', files.get('/reused/probe/lib/dep.ts')],
    ]);
    const withoutTsconfig = await live.extractReusedWithDiagnostics(['/reused/probe/app.ts', '/reused/probe/lib/dep.ts'], {
      cacheStore: memoryStore({ loads: [], stores: [] }),
      grammarWasm: liveGrammarWasm,
      scope: { tenant: 'packed-owner', clone: 'clone:packed-no-tsconfig' },
      read: virtualRead(filesWithoutTsconfig),
    });
    assert.equal(
      withoutTsconfig.extraction.edges.some((e) => e.source === 'app' && e.target === 'lib_dep' && e.relation === 'imports_from'),
      false,
      'without tsconfig.json, @dep must not resolve to lib_dep',
    );
    assert.equal(
      withoutTsconfig.extraction.edges.some((e) => e.source === 'app' && e.target === 'ref_dep' && e.relation === 'imports_from'),
      true,
      'without tsconfig.json, @dep must emit unresolved ref_dep imports_from edge',
    );
    const second = await live.extractReused(['/reused/probe/app.ts'], ports);
    assert.ok(second.nodes.length > 0, 'packaged single-file extraction yields nodes');
    console.log(JSON.stringify({
      nodes: first.extraction.nodes.length,
      edges: first.extraction.edges.length,
      resolvedImportEdge,
      unresolvedWithoutTsconfig: true,
      single: second.nodes.length,
    }));
  } else if (mode === 'warm') {
    const files = new Map([['/reused/warm/app.ts', 'export function probe(): string {\n  return "probe";\n}\n']]);
    const counters = { loads: [], stores: [] };
    const cacheStore = memoryStore(counters);
    const ports = {
      cacheStore,
      grammarWasm: liveGrammarWasm,
      scope: { tenant: 'packed-owner', clone: 'clone:warm' },
      read: virtualRead(files),
    };
    const first = await live.extractReusedWithDiagnostics(['/reused/warm/app.ts'], ports);
    assert.ok(first.extraction.nodes.length > 0, 'warm probe cold run yields nodes');
    // Cold run for 1 file: loadFromLiveStore misses (1 load), then saveToLiveStore
    // checks for existing envelope (1 load) and persists the new envelope (1 store).
    assert.equal(counters.loads.length, 2, 'cold run must perform exactly 2 store loads (lookup + pre-write check), got ' + counters.loads.length);
    assert.equal(counters.stores.length, 1, 'cold run must store exactly 1 envelope, got ' + counters.stores.length);
    assert.equal(cacheStore.entries.size, 1, 'warm cache store holds the persisted entry');
    const coldLoads = counters.loads.length;
    const coldStores = counters.stores.length;

    const second = await live.extractReusedWithDiagnostics(['/reused/warm/app.ts'], ports);
    assert.deepEqual(second.extraction.nodes, first.extraction.nodes, 'second run is a warm hit with identical nodes');
    // Warm hit: loadFromLiveStore returns the cached entry (+1 load) and
    // skips saveToLiveStore completely (+0 loads, +0 stores). A missed or
    // bypassed warm load would perform +2 loads (lookup miss + save check).
    assert.equal(counters.loads.length, coldLoads + 1, 'warm hit must perform exactly 1 additional store load (total 3), got ' + counters.loads.length);
    assert.equal(counters.stores.length, coldStores, 'warm hit stores nothing more');
    const warmLoads = counters.loads.length;
    const warmStores = counters.stores.length;

    // Remove the packaged grammar while keeping the ALREADY-POPULATED warm
    // cacheStore and the live grammarWasm port reading grammarFile('typescript').
    const grammarPath = grammarFile('typescript');
    const bytes = readFileSync(grammarPath);
    unlinkSync(grammarPath);
    let missing;
    try {
      missing = await live.extractReusedWithDiagnostics(['/reused/warm/app.ts'], ports);
    } finally {
      writeFileSync(grammarPath, bytes);
    }
    assert.equal(cacheStore.entries.size, 1, 'populated warm entry remained in cacheStore during grammar removal');
    assert.equal(missing.extraction.nodes.length, 0, 'missing grammar refuses warm entry and yields no nodes, got ' + missing.extraction.nodes.length);
    assert.ok(missing.diagnostics.some((d) => String(d.error).includes('grammar-unavailable')), 'missing grammar is explicit, got ' + JSON.stringify(missing.diagnostics));
    assert.equal(counters.loads.length, warmLoads, 'missing grammar fails closed before loading from warm cacheStore');
    assert.equal(counters.stores.length, warmStores, 'missing grammar stores nothing');
    const missingLoads = counters.loads.length;

    // Restoring the grammar resumes warm hits from the preserved cacheStore.
    const recovered = await live.extractReusedWithDiagnostics(['/reused/warm/app.ts'], ports);
    assert.deepEqual(recovered.extraction.nodes, first.extraction.nodes, 'restoring grammar resumes warm hit');
    assert.equal(counters.loads.length, warmLoads + 1, 'post-restore warm hit adds 1 load');
    assert.equal(counters.stores.length, warmStores, 'post-restore warm hit stores nothing');

    // Refuse root/legacy fallback when live ports are omitted (both entry points, undefined and null).
    let fallbackRejected = 0;
    for (const omitted of [undefined, null]) {
      await assert.rejects(() => live.extractReused(['/reused/warm/app.ts'], omitted), /explicit live operation/);
      fallbackRejected++;
      await assert.rejects(() => live.extractReusedWithDiagnostics(['/reused/warm/app.ts'], omitted), /explicit live operation/);
      fallbackRejected++;
    }
    console.log(JSON.stringify({
      cold: first.extraction.nodes.length,
      coldLoads,
      coldStores,
      warmLoads,
      warmStores,
      missingNodes: missing.extraction.nodes.length,
      missingLoads,
      missingDiagnostics: missing.diagnostics.length,
      recoveredLoads: counters.loads.length,
      fallbackRejected,
    }));
  } else {
    assert.fail('unknown reused probe mode: ' + mode);
  }
`;

const EASM1_NEWLY_PACKED_MODULES = [
  "git-stream",
  "git-protocol",
  "history",
  "refs",
  "repository",
  "retention",
  "pr-sync",
  "pr-attribution",
  "worktree",
  "attributes",
  "filesystem",
  "diffs",
  "snapshots",
  "content-policy",
  "scheduler",
  "watch",
  "reconcile",
  "coverage",
] as const;

const ALL_MODULES_PROBE = String.raw`
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { join, resolve } from 'node:path';
  import { pathToFileURL } from 'node:url';
  import * as live from '@sentropic/engram-live';

  const rootDir = process.argv[2];
  const moduleNames = JSON.parse(process.argv[3]);
  assert.throws(() => readFileSync(resolve(rootDir, 'package.json')), { code: 'ERR_ACCESS_DENIED' });
  assert.equal(process.permission.has('fs.read', resolve(rootDir, 'node_modules')), false);
  globalThis.fetch = () => assert.fail('offline module import requested network access');

  const expectedRootExports = {
    // git-protocol
    GIT_PROTOCOL_VERSION: 'string',
    DEFAULT_COMMIT_BATCH: 'number',
    MAX_CONCURRENT_GIT_CHILDREN: 'number',
    RENAME_DETECTION_ARGUMENT: 'string',
    MAX_OBJECT_BYTES: 'number',
    MAX_FIELD_BYTES: 'number',
    MAX_DIFF_BLOCK_BYTES: 'number',
    DIFF_RECORD_STRUCTURAL_BYTES: 'number',
    GitProtocolError: 'function',
    revListArguments: 'function',
    revListCountArguments: 'function',
    catFileArguments: 'function',
    diffTreeArguments: 'function',
    RevListParser: 'function',
    CatFileParser: 'function',
    DiffTreeParser: 'function',
    protocolAsciiBytes: 'function',
    // git-stream
    GIT_STREAM_EXTRACTOR_VERSION: 'string',
    GitStreamError: 'function',
    identityIsoDate: 'function',
    streamGitHistory: 'function',
    // history
    HISTORY_EXTRACTOR_VERSION: 'string',
    HistoryError: 'function',
    runHistoryPass: 'function',
    deriveReachability: 'function',
    MAX_DERIVED_MEMBERSHIPS: 'number',
    DerivedReachabilityCache: 'function',
    // refs
    classifyRefName: 'function',
    trackRef: 'function',
    selectHistoryRoots: 'function',
    // repository
    observeRepository: 'function',
    // retention
    RetentionError: 'function',
    deriveRetentionRequests: 'function',
    runRetentionPass: 'function',
    // pr-sync
    PR_SYNC_EXTRACTOR_VERSION: 'string',
    PR_SYNC_OVERLAP_MS: 'number',
    PrSyncError: 'function',
    observationIdentityKey: 'function',
    objectJobIdentityKey: 'function',
    deduplicatePrObservations: 'function',
    deduplicatePrPageItems: 'function',
    assertSameRepository: 'function',
    etagPositionKey: 'function',
    requireEndOfListProof: 'function',
    canAcknowledgePrObjects: 'function',
    runPrSyncPass: 'function',
    // pr-attribution
    pinPrAttribution: 'function',
    applyPrHeadUpdate: 'function',
    classifyMergeStrategy: 'function',
    // worktree
    BorrowedIndexError: 'function',
    captureWorktree: 'function',
    // attributes
    ATTR_UNSPECIFIED: 'string',
    ATTR_UNSET: 'string',
    ATTR_SET: 'string',
    isFiltered: 'function',
    hasTextconvDriver: 'function',
    defaultAttributes: 'function',
    sameAttributes: 'function',
    parseCheckAttrZ: 'function',
    readAttributes: 'function',
    readAttributesIndex: 'function',
    fingerprintAttributes: 'function',
    // filesystem
    DEFAULT_MAX_FILE_BYTES: 'number',
    ForbiddenPathError: 'function',
    ParentSymlinkError: 'function',
    UnstableReadError: 'function',
    OversizedFileError: 'function',
    SafeReadUnavailableError: 'function',
    safeReadCapability: 'function',
    toPathBytes: 'function',
    toPathKey: 'function',
    fromPathKey: 'function',
    fingerprintBytes: 'function',
    isGitInternalPath: 'function',
    splitNulBytes: 'function',
    resolveLinkWithinRoot: 'function',
    defaultReadFileBytes: 'function',
    readLinkTarget: 'function',
    // diffs
    DiffError: 'function',
    deriveLocalDiff: 'function',
    // snapshots
    SNAPSHOT_ERROR_CODES: 'object',
    SnapshotError: 'function',
    digestLocalDiff: 'function',
    stageLocalSnapshot: 'function',
    runUnregisterPurge: 'function',
    // content-policy
    ContentPolicyError: 'function',
    classifyPath: 'function',
    protectedPathRef: 'function',
    SECRET_PATTERNS: 'object',
    containsSecretText: 'function',
    matchSecretRule: 'function',
    screenBatchSurfaces: 'function',
    scanValuesForLeak: 'function',
    // scheduler
    scopeIdentity: 'function',
    Scheduler: 'function',
    // watch
    createWatchHub: 'function',
    createNativeWatchHub: 'function',
    // reconcile
    Reconciler: 'function',
    // coverage
    DEFAULT_MAX_DELTA_PATHS_PER_AXIS: 'number',
    sourceVectorsEqual: 'function',
    initialCoverage: 'function',
    certifyAxis: 'function',
    invalidateAxes: 'function',
    markReconciled: 'function',
    markAxis: 'function',
    allCurrent: 'function',
    deriveReadiness: 'function',
    toContractState: 'function',
  };
  for (const [name, expectedType] of Object.entries(expectedRootExports)) {
    assert.equal(typeof live[name], expectedType, 'public entry must export ' + name + ' as ' + expectedType + ', got ' + typeof live[name]);
  }

  // Offline smoke execution of packed engine and L6b scheduler/watch/coverage entries.
  assert.equal(live.classifyRefName('refs/heads/main'), 'local-branch');
  assert.deepEqual(live.revListArguments(['HEAD']).slice(-2), ['--parents', 'HEAD']);
  assert.equal(live.identityIsoDate({ name: 'Test', email: 'test@example.test', unixSeconds: 0, offsetMinutes: 0 }), '1970-01-01T00:00:00Z');
  assert.equal(live.classifyMergeStrategy({ strategy: 'squash' }), 'squash');
  const reach = live.deriveReachability(
    [{ oid: 'a'.repeat(40), parents: [] }],
    [{ name: 'r1', qualifiedOid: { algorithm: 'sha1', oid: 'a'.repeat(40) } }],
  );
  assert.equal(reach.get('r1')?.has('a'.repeat(40)), true);
  assert.equal(live.isFiltered(live.defaultAttributes()), false);
  assert.equal(live.isGitInternalPath('.git/config'), true);
  assert.equal(live.isGitInternalPath('.github/workflows/ci.yml'), false);
  assert.equal(live.fingerprintBytes(live.toPathBytes('probe.ts')).length, 64);
  assert.equal(live.classifyPath('.env').allowed, false);
  assert.equal(live.containsSecretText('plain source code'), false);
  const cov = live.initialCoverage(['working-tree', 'index', 'refs'], 1000);
  assert.equal(live.deriveReadiness(cov).localReady, false);
  assert.equal(live.toContractState('unknown'), 'unavailable');
  assert.equal(live.toContractState('current'), 'current');
  const fakeToken = {
    tokenId: 'tok:1',
    scope: { tenant: 't', clone: 'c', worktree: 'w' },
    epoch: 1,
    epochId: 'ep:1',
    declarationRevision: 1,
    projectionIncarnation: 'inc:1',
    issuedAt: 0,
    expiresAt: 10_000,
  };
  assert.equal(typeof live.scopeIdentity(fakeToken), 'string');
  const scheduler = new live.Scheduler(
    {
      clock: { now: () => 0, schedule: () => ({ cancel() {} }) },
      validateToken: () => true,
      park: () => {},
      readProgress: () => undefined,
      writeProgress: () => {},
      backlogSize: () => 0,
    },
    {
      maxPendingPaths: 16,
      maxPendingBytes: 1024 * 1024,
      maxConcurrency: 2,
      maxActiveOperationsPerScope: 1,
      maxRetries: 1,
      retryBaseMs: 10,
      maxBackoffMs: 100,
      maxFailedKept: 4,
      maxConsumers: 4,
      maxFileSizeBytes: 65536,
      maxPathBytes: 256,
      readMarginBytes: 64,
      maxDiscoveryBytes: 4096,
      maxBatchBytes: 65536,
      maxGitChildren: 2,
      attemptDeadlineMs: 1000,
      cancellationDeadlineMs: 50,
      interactiveQuantum: 3,
      backfillQuantum: 1,
      backfillReserveBytes: 65536,
      durableBacklogQuota: 100,
    },
  );
  const watchHub = live.createWatchHub(
    { start: async () => {}, stop: async () => {}, onSignal: () => () => {} },
    { now: () => 0 },
    { scheduler, debounceMs: 500, maxPendingPaths: 16 },
  );
  assert.equal(watchHub.state, 'starting');
  await watchHub.dispose();

  // Direct offline import of every emitted neutral source module in dist/.
  const installed = resolve('node_modules/@sentropic/engram-live');
  const loadedModules = [];
  for (const name of moduleNames) {
    const mod = await import(pathToFileURL(join(installed, 'dist', name + '.js')).href);
    assert.equal(typeof mod, 'object', 'dist/' + name + '.js must import cleanly');
    loadedModules.push({ name, exportCount: Object.keys(mod).length });
  }
  console.log(JSON.stringify({
    checkedRootExports: Object.keys(expectedRootExports).length,
    loadedModules,
  }));
`;

// No-Python proof, phase by phase: build, packing, installation, imports and
// exercises each run in an ISOLATED child process whose PATH starts with
// python/python2/python3/python2.7/py tripwires that record any invocation
// and fail. The marker is verified after every phase; if Python ever ran,
// its recorded command line is the failure trace. Nothing is checked only
// "before" an import: the imports themselves run in the protected child.

interface PhaseMarker {
  phase: string;
  marker: string | null;
}

interface PackedInstall {
  tmpRoot: string;
  installDir: string;
  tripwireBin: string;
  pythonMarker: string;
  tarball: string;
  packedPaths: string[];
  phaseTrace: PhaseMarker[];
}

const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function withLiveBuildLock<T>(fn: () => T): T {
  const lockPath = join(tmpdir(), "engram-live-build.lock");
  for (let attempt = 0; ; attempt++) {
    let handle: number | undefined;
    try {
      handle = openSync(lockPath, "wx");
    } catch {
      try {
        if (statSync(lockPath).mtimeMs < Date.now() - 180_000) unlinkSync(lockPath);
      } catch {
        continue;
      }
      if (attempt > 900) throw new Error("engram-live build lock is stuck (L1b bootstrap).");
      sleep(100);
      continue;
    }
    try {
      return fn();
    } finally {
      try {
        closeSync(handle);
      } catch {
        /* fd already closed */
      }
      try {
        unlinkSync(lockPath);
      } catch {
        /* already gone */
      }
    }
  }
}

function runProtectedBuild(env: NodeJS.ProcessEnv): void {
  if (!existsSync(buildScript)) {
    throw new Error("L1b is not implemented: scripts/build-live.mjs is missing (build the engram-live package).");
  }
  // Build it even when a bootstrap left it fresh: this lane proves the
  // build phase itself, inside the protected environment.
  execFileSync(process.execPath, [buildScript], { cwd: root, env, stdio: "inherit" });
}

let packed: PackedInstall;

type ProductionProbeMode = "repair" | "factory" | "matrix" | "malformed" | "worktree" | "coverage" | "references";

type ReusedProbeMode = "extract" | "warm";

// Builds the Node permission-model spawn for the production probe. Node
// 22.13/23.5 stabilised the flag as `--permission`; Node 20 only accepts
// the legacy `--experimental-permission` spelling, while Node 24 rejects
// it (`bad option`). Node 22.13+ accepts both spellings.
function resolveProductionProbePermissionFlag(nodeVersion: string = process.versions.node): "--permission" | "--experimental-permission" {
  const [majorRaw, minorRaw] = nodeVersion.split(".");
  const major = Number.parseInt(majorRaw ?? "", 10);
  const minor = Number.parseInt((minorRaw ?? "").replace(/[^0-9].*$/, ""), 10);
  if (Number.isNaN(major) || Number.isNaN(minor)) return "--experimental-permission";
  if (major > 23) return "--permission";
  if (major === 23) return minor >= 5 ? "--permission" : "--experimental-permission";
  if (major === 22) return minor >= 13 ? "--permission" : "--experimental-permission";
  return "--experimental-permission";
}

function buildProductionProbeArgs(mode: ProductionProbeMode, tmpRoot: string, installDir: string, rootDir: string, nodeVersion: string = process.versions.node): string[] {
  return [
    resolveProductionProbePermissionFlag(nodeVersion),
    "--allow-fs-read=" + tmpRoot,
    ...(mode === "factory"
      ? ["--allow-fs-write=" + join(installDir, "node_modules", "@sentropic", "engram-live", "dist", "grammars")]
      : []),
    "production-parse-probe.mjs",
    mode,
    rootDir,
  ];
}

function buildReusedProbeArgs(mode: ReusedProbeMode, tmpRoot: string, installDir: string, rootDir: string, nodeVersion: string = process.versions.node): string[] {
  return [
    resolveProductionProbePermissionFlag(nodeVersion),
    "--allow-fs-read=" + tmpRoot,
    ...(mode === "warm"
      ? ["--allow-fs-write=" + join(installDir, "node_modules", "@sentropic", "engram-live", "dist", "grammars")]
      : []),
    "reused-extraction-probe.mjs",
    mode,
    rootDir,
  ];
}

function buildAllModulesProbeArgs(tmpRoot: string, rootDir: string, moduleNames: readonly string[], nodeVersion: string = process.versions.node): string[] {
  return [
    resolveProductionProbePermissionFlag(nodeVersion),
    "--allow-fs-read=" + tmpRoot,
    "all-modules-probe.mjs",
    rootDir,
    JSON.stringify(moduleNames),
  ];
}

describe("production probe permission flag", () => {
  it("maps the Node version to the supported permission flag", () => {
    expect(resolveProductionProbePermissionFlag("20.19.0")).toBe("--experimental-permission");
    expect(resolveProductionProbePermissionFlag("22.12.0")).toBe("--experimental-permission");
    expect(resolveProductionProbePermissionFlag("22.13.0")).toBe("--permission");
    expect(resolveProductionProbePermissionFlag("24.0.0")).toBe("--permission");
    const modes: ProductionProbeMode[] = ["repair", "factory", "matrix", "malformed", "worktree", "coverage", "references"];
    for (const mode of modes) {
      const legacy = buildProductionProbeArgs(mode, "/tmp/probe-tmp", "/tmp/probe-tmp/install", "/repo", "20.19.0");
      expect(legacy[0]).toBe("--experimental-permission");
      expect(legacy).toContain("--allow-fs-read=/tmp/probe-tmp");
      const stable = buildProductionProbeArgs(mode, "/tmp/probe-tmp", "/tmp/probe-tmp/install", "/repo", "24.0.0");
      expect(stable[0]).toBe("--permission");
      expect(stable).toContain("--allow-fs-read=/tmp/probe-tmp");
    }
    expect(buildProductionProbeArgs("factory", "/tmp/probe-tmp", "/tmp/probe-tmp/install", "/repo", "20.19.0")).toContain(
      "--allow-fs-write=/tmp/probe-tmp/install/node_modules/@sentropic/engram-live/dist/grammars",
    );
    expect(buildProductionProbeArgs("factory", "/tmp/probe-tmp", "/tmp/probe-tmp/install", "/repo", "24.0.0")).toContain(
      "--allow-fs-write=/tmp/probe-tmp/install/node_modules/@sentropic/engram-live/dist/grammars",
    );
    expect(
      buildProductionProbeArgs("repair", "/tmp/probe-tmp", "/tmp/probe-tmp/install", "/repo", "24.0.0").some((arg) =>
        arg.startsWith("--allow-fs-write="),
      ),
    ).toBe(false);
  });
});

// Packs the deliverable exactly as shipped, inside the protected
// environment; returns the tarball path and the exact packed file list.
function packTarball(destination: string, env: NodeJS.ProcessEnv): { tarball: string; packedPaths: string[] } {
  const raw = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", destination],
    { cwd: liveRoot, env, encoding: "utf8" },
  );
  const parsed = JSON.parse(raw) as [{ filename: string; files: { path: string }[] }];
  return {
    tarball: join(destination, parsed[0].filename),
    packedPaths: parsed[0].files.map((file) => file.path),
  };
}

function writePythonTripwires(binDir: string, marker: string): void {
  mkdirSync(binDir, { recursive: true });
  for (const name of ["python", "python3", "python2", "python2.7", "py"]) {
    const shim = join(binDir, name);
    const script = `#!/bin/sh\nprintf '%s %s\\n' "$0" "$*" >> ${JSON.stringify(marker)}\nexit 127\n`;
    writeFileShim(shim, script);
  }
}

function writeFileShim(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o755 });
  chmodSync(path, 0o755);
}

// Records the tripwire marker AFTER a phase completed; the check never
// precedes the phase it guards. A non-null marker carries the recorded
// Python command line — the forbidden-load trace.
function recordPhaseMarker(phaseTrace: PhaseMarker[], phase: string, pythonMarker: string): void {
  phaseTrace.push({
    phase,
    marker: existsSync(pythonMarker) ? readFileSync(pythonMarker, "utf8") : null,
  });
}

function expectNoPython(phaseTrace: PhaseMarker[]): void {
  for (const phase of phaseTrace) {
    expect(
      phase.marker,
      `Python was evaluated during the "${phase.phase}" phase (recorded tripwire trace: ${phase.marker ?? ""})`,
    ).toBeNull();
  }
}

// Runs one protected phase: an isolated child process with the tripwire PATH.
function runProtectedPhase(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): string {
  return execFileSync(command, args, { ...options, encoding: "utf8" });
}

// Protected child probe: imports all three public entries (., /contracts,
// /integration) from inside the install and reports the delivered surface.
const IMPORT_PROBE = [
  'import * as rootEntry from "@sentropic/engram-live";',
  'import * as contracts from "@sentropic/engram-live/contracts";',
  'import * as integration from "@sentropic/engram-live/integration";',
  "const report = {",
  "  rootKeys: Object.keys(rootEntry).sort(),",
  "  contractsKeys: Object.keys(contracts).sort(),",
  "  integrationKeys: Object.keys(integration).sort(),",
  "  hasFactory: typeof integration.createLiveFactory === \"function\" && typeof rootEntry.createLiveFactory === \"function\",",
  "  languages: contracts.ADVERTISED_LANGUAGES.slice().sort(),",
  "  policyVersion: contracts.POLICY_VERSION,",
  "};",
  "console.log(JSON.stringify(report));",
  "",
].join("\n");

// Protected child probe: runs the executable factory with fake ports and
// checks the delivered capability listing, an unavailable operation, an
// unknown operation and the absence of fact-sink writes.
const EXERCISE_PROBE = [
  'import * as integration from "@sentropic/engram-live/integration";',
  'import * as contracts from "@sentropic/engram-live/contracts";',
  "const factSinkCalls = [];",
  "const factory = integration.createLiveFactory({",
  "  ports: {",
  "    git: {},",
  "    filesystem: { readFileBytes: async (path) => { throw new Error(\"no filesystem access expected: \" + path); } },",
  "    clock: { now: () => 1700000000000 },",
  "    content: {},",
  "    factSink: { deliver: async (batch) => { factSinkCalls.push(batch); return { received: true, batchId: \"probe-batch\" }; } },",
  "    cache: {},",
  "    grammarRuntime: { loadLanguage: async () => { throw new Error(\"no grammar load expected\"); } },",
  "  },",
  "  declaration: {",
  "    tenant: \"local:probe-owner\",",
  "    principal: \"local:probe-principal\",",
  "    hostFingerprint: \"probe-fingerprint\",",
  "    identityUncertainty: [],",
  "    declarationId: \"decl:probe\",",
  "    cloneId: \"clone:probe\",",
  "    worktreeId: \"wt:probe\",",
  "    authorizedRoots: [\"/probe/worktree\"],",
  "    liveCapability: \"live\",",
  "    policyVersion: contracts.POLICY_VERSION,",
  "    declarationRevision: 1,",
  "  },",
  "});",
  "const capabilities = factory.describeCapabilities();",
  "let unknownCapabilityError = null;",
  "try {",
  "  await factory.runCapability(\"not-a-capability\");",
  "} catch (error) {",
  "  unknownCapabilityError = String(error && error.message ? error.message : error);",
  "}",
  "const refs = await factory.runCapability(\"refs\");",
  "const report = {",
  "  capabilityCount: capabilities.length,",
  "  available: capabilities.filter((entry) => entry.state === \"available\").map((entry) => entry.capability),",
  "  reasoned: capabilities.every((capability) => typeof capability.reason === \"string\" && capability.reason.length > 0),",
  "  plannedLots: capabilities.every((capability) => typeof capability.plannedLot === \"string\" && capability.plannedLot.length > 0),",
  "  refs: { state: refs.state, delivered: refs.delivered, reasonLength: refs.reason.length },",
  "  factSinkCalls: factSinkCalls.length,",
  "  unknownCapabilityError,",
  "};",
  "console.log(JSON.stringify(report));",
  "",
].join("\n");

// Protected child probe: the grammar matrix. Every advertised language loads
// its packaged WASM through an injected grammar runtime (test-local
// web-tree-sitter, resolved from the repository devDependency tree) and
// parses a smoke snippet; a tampered byte is rejected by the pinned digest;
// an absent WASM, an absent manifest, an invalid manifest and the inherited
// names "constructor"/"toString" all report explicit unavailable coverage.
const GRAMMAR_PROBE = [
  'import { createRequire } from "node:module";',
  'import { readFileSync } from "node:fs";',
  'import { join } from "node:path";',
  'import * as integration from "@sentropic/engram-live/integration";',
  'import * as contracts from "@sentropic/engram-live/contracts";',
  "const rootRequire = createRequire(process.argv[2]);",
  "const TreeSitter = rootRequire(\"web-tree-sitter\");",
  "const installedRoot = process.argv[3];",
  "const manifest = JSON.parse(readFileSync(join(installedRoot, \"grammar-manifest.json\"), \"utf8\"));",
  "const realRead = async (path) => new Uint8Array(readFileSync(path));",
  "const declaration = {",
  "  tenant: \"local:probe-owner\",",
  "  principal: \"local:probe-principal\",",
  "  hostFingerprint: \"probe-fingerprint\",",
  "  identityUncertainty: [],",
  "  declarationId: \"decl:probe\",",
  "  cloneId: \"clone:probe\",",
  "  worktreeId: \"wt:probe\",",
  "  authorizedRoots: [\"/probe/worktree\"],",
  "  liveCapability: \"live\",",
  "  policyVersion: contracts.POLICY_VERSION,",
  "  declarationRevision: 1,",
  "};",
  "const makeFactory = (filesystem) => integration.createLiveFactory({",
  "  ports: {",
  "    git: {},",
  "    filesystem,",
  "    clock: { now: () => 0 },",
  "    content: {},",
  "    factSink: { deliver: async () => ({ received: true, batchId: \"probe-batch\" }) },",
  "    cache: {},",
  "    grammarRuntime: { loadLanguage: (wasm) => TreeSitter.Language.load(new Uint8Array(wasm)) },",
  "  },",
  "  declaration,",
  "});",
  "const factory = makeFactory({ readFileBytes: realRead });",
  "await TreeSitter.Parser.init();",
  "const parser = new TreeSitter.Parser();",
  "const snippets = {",
  "  c: \"int main(void) { return 0; }\",",
  "  cpp: \"int main() { return 0; }\",",
  "  go: \"package main\\n\\nfunc main() {}\",",
  "  java: \"class Probe {}\",",
  "  javascript: \"const probe = 1;\",",
  "  php: \"<?php $probe = 1;\",",
  "  python: \"probe = 1\",",
  "  ruby: \"probe = 1\",",
  "  rust: \"fn main() {}\",",
  "  typescript: \"const probe: number = 1;\",",
  "  tsx: \"const probe = <div />;\",",
  "};",
  "const loaded = {};",
  "for (const language of contracts.ADVERTISED_LANGUAGES) {",
  "  const result = await factory.loadGrammar(language);",
  "  const coverage = factory.grammarCoverage(language);",
  "  let smoke = null;",
  "  if (result.state === \"available\") {",
  "    parser.setLanguage(result.grammar);",
  "    const tree = parser.parse(snippets[language] || \"1 + 1\");",
  "    smoke = tree === null ? null : tree.rootNode.type;",
  "  }",
  "  loaded[language] = {",
  "    state: result.state,",
  "    bytesSha256: result.bytesSha256,",
  "    coverageState: coverage.state,",
  "    smoke,",
  "    pinnedSha256: manifest.languages[language].sha256,",
  "  };",
  "}",
  "const manifestPath = join(installedRoot, \"grammar-manifest.json\");",
  "const tamperedFactory = makeFactory({ readFileBytes: async (path) => {",
  "  const bytes = readFileSync(path);",
  "  if (!path.includes(join(\"dist\", \"grammars\"))) return new Uint8Array(bytes);",
  "  const out = new Uint8Array(bytes.byteLength + 1);",
  "  out.set(bytes, 0);",
  "  out[out.byteLength - 1] = 0;",
  "  return out;",
  "} });",
  "const tampered = {};",
  "for (const language of contracts.ADVERTISED_LANGUAGES) {",
  "  const result = await tamperedFactory.loadGrammar(language);",
  "  tampered[language] = { state: result.state, reason: result.reason };",
  "}",
  "const absentWasmFactory = makeFactory({ readFileBytes: async (path) => {",
  "  if (path === manifestPath) return realRead(path);",
  "  const error = new Error(\"ENOENT: no such file or directory, open '\" + path + \"'\");",
  "  error.code = \"ENOENT\";",
  "  throw error;",
  "} });",
  "const absentWasm = await absentWasmFactory.loadGrammar(\"typescript\");",
  "const missingManifestFactory = makeFactory({ readFileBytes: async (path) => {",
  "  if (path !== manifestPath) return realRead(path);",
  "  const error = new Error(\"ENOENT: no such file or directory, open '\" + path + \"'\");",
  "  error.code = \"ENOENT\";",
  "  throw error;",
  "} });",
  "const missingManifest = await missingManifestFactory.loadGrammar(\"c\");",
  "const invalidManifestFactory = makeFactory({ readFileBytes: async (path) => {",
  "  if (path === manifestPath) return new TextEncoder().encode(\"this is not the manifest\");",
  "  return realRead(path);",
  "} });",
  "const invalidManifest = await invalidManifestFactory.loadGrammar(\"c\");",
  "const inherited = {};",
  "for (const name of [\"constructor\", \"toString\"]) {",
  "  const result = await factory.loadGrammar(name);",
  "  const coverage = factory.grammarCoverage(name);",
  "  inherited[name] = { state: result.state, reason: result.reason, coverageState: coverage.state, coverageReason: coverage.reason };",
  "}",
  "const absent = {};",
  "for (const name of [\"lua\", \"julia\", \"not-a-language\"]) {",
  "  const result = await factory.loadGrammar(name);",
  "  const coverage = factory.grammarCoverage(name);",
  "  absent[name] = { state: result.state, reason: result.reason, coverageState: coverage.state, coverageReason: coverage.reason };",
  "}",
  "console.log(JSON.stringify({ loaded, tampered, absentWasm, missingManifest, invalidManifest, inherited, absent }));",
  "",
].join("\n");

// Protected child probe: the canonical identity derivation (L6a) must be
// importable from the PUBLIC entries of the installed package — h2a and
// cluster-mesh call exactly this surface, never an internal path. The
// probe derives clone/worktree/declaration identities through
// @sentropic/engram-live/integration and "." and proves determinism and
// the per-worktree declaration split.
const DERIVATION_PROBE = [
  'import * as rootEntry from "@sentropic/engram-live";',
  'import * as integration from "@sentropic/engram-live/integration";',
  'const components = {',
  '  hostScope: "host:probe",',
  '  commonDirRealpath: "/srv/probe/.git",',
  '  commonDirProjectFingerprint: "probe-fingerprint",',
  "  identityUncertainty: [],",
  '  oidAlgorithm: "sha1",',
  "};",
  'const deriveNames = ["deriveCloneIdentity", "deriveWorktreeIdentity", "deriveDeclarationIdentity"];',
  "const deriveTypes = deriveNames.map((name) => typeof integration[name]);",
  "const rootDerives = deriveNames.every((name) => typeof rootEntry[name] === \"function\");",
  "const clone = integration.deriveCloneIdentity(components);",
  "const cloneAgain = integration.deriveCloneIdentity(components);",
  "const worktree = integration.deriveWorktreeIdentity({",
  '  hostScope: "host:probe",',
  "  clone,",
  '  worktreePath: "/work/probe",',
  '  gitDir: "/srv/probe/.git",',
  '  worktreeFingerprint: "ws:probe",',
  "  identityUncertainty: [],",
  "});",
  "const sibling = integration.deriveWorktreeIdentity({",
  '  hostScope: "host:probe",',
  "  clone,",
  '  worktreePath: "/work/probe-wt",',
  '  gitDir: "/srv/probe/.git/worktrees/wt",',
  '  worktreeFingerprint: "ws:probe",',
  "  identityUncertainty: [],",
  "});",
  'const declaration = integration.deriveDeclarationIdentity({ hostScope: "host:probe", clone, worktree });',
  'const declarationAgain = integration.deriveDeclarationIdentity({ hostScope: "host:probe", clone, worktree });',
  "const report = {",
  "  deriveTypes,",
  "  rootDerives,",
  "  deterministicClone: cloneAgain.cloneId === clone.cloneId,",
  "  deterministicDeclaration: declarationAgain.declarationId === declaration.declarationId,",
  '  cloneIdPrefixed: clone.cloneId.startsWith("clone:"),',
  '  worktreeIdPrefixed: worktree.worktreeId.startsWith("wt:"),',
  '  declarationIdPrefixed: declaration.declarationId.startsWith("decl:"),',
  "  declarationBindsTriangle:",
  "    declaration.cloneId === clone.cloneId && declaration.worktreeId === worktree.worktreeId,",
  "  distinctWorktrees: sibling.worktreeId !== worktree.worktreeId,",
  "};",
  "console.log(JSON.stringify(report));",
  "",
].join("\n");

// Protected child probe (mutation canary): imports and exercises the
// delivered surface FIRST, then attempts to evaluate Python through
// node:child_process — the exact escape the review demonstrated. Inside
// the shared protected environment the tripwire shims must intercept every
// attempt: nothing is executed, the call fails with exit 127 and the
// invocation is recorded in the marker.
// Packs and installs the deliverable exactly as shipped, inside the SAME
// protected environment (tmpRoot/tripwireBin) the build phase already ran
// in: pack, install and every later probe phase share one tripwire
// directory and one marker, so no phase can fall back to the system PATH.
function packAndInstall(
  env: NodeJS.ProcessEnv,
  pythonMarker: string,
  phaseTrace: PhaseMarker[],
  tmpRoot: string,
  tripwireBin: string,
): PackedInstall {
  const { tarball, packedPaths } = withLiveBuildLock(() => {
    // Phase 1: build the deliverable inside the protected environment.
    runProtectedBuild(env);
    recordPhaseMarker(phaseTrace, "build", pythonMarker);
    // Phase 2: pack inside the same build lock and protected environment
    // so no concurrent reader or rebuild races on engram-live/dist.
    const packedResult = packTarball(tmpRoot, env);
    recordPhaseMarker(phaseTrace, "pack", pythonMarker);
    return packedResult;
  });
  const installDir = join(tmpRoot, "install");
  mkdirSync(installDir);
  writeFileSync(join(installDir, "package.json"), `${JSON.stringify({ name: "live-install-probe", version: "0.0.0", private: true }, null, 2)}\n`);
  // Owner 2026-10-14: no npm install/ci, even in fixtures. Verify the exact tarball locally.
  const packageDir = join(installDir, "node_modules", "@sentropic", "engram-live");
  mkdirSync(packageDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", packageDir, "--strip-components=1"], { cwd: installDir, env });
  recordPhaseMarker(phaseTrace, "install", pythonMarker);
  // Protected child probes: they import the three public entries and
  // exercise the factory inside the tripwire environment; the canary probe
  // additionally attempts a Python call, which the tripwires must reject.
  writeFileShim(join(installDir, "import-probe.mjs"), IMPORT_PROBE);
  writeFileShim(join(installDir, "exercise-probe.mjs"), EXERCISE_PROBE);
  writeFileShim(join(installDir, "grammar-probe.mjs"), GRAMMAR_PROBE);
  writeFileShim(join(installDir, "derivation-probe.mjs"), DERIVATION_PROBE);
  writeFileShim(join(installDir, "reused-extraction-probe.mjs"), REUSED_EXTRACTION_PROBE);

  return { tmpRoot, installDir, tripwireBin, pythonMarker, tarball, packedPaths, phaseTrace };
}

function listFilesRecursively(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...listFilesRecursively(join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

interface ImportReport {
  rootKeys: string[];
  contractsKeys: string[];
  integrationKeys: string[];
  hasFactory: boolean;
  languages: string[];
  policyVersion: string;
}

interface ExerciseReport {
  capabilityCount: number;
  available: string[];
  reasoned: boolean;
  plannedLots: boolean;
  refs: { state: string; delivered: boolean; reasonLength: number };
  factSinkCalls: number;
  unknownCapabilityError: string | null;
}

interface GrammarReport {
  loaded: Record<string, { state: string; bytesSha256?: string; coverageState: string; smoke: string | null; pinnedSha256: string }>;
  tampered: Record<string, { state: string; reason?: string }>;
  absentWasm: { state: string; reason?: string };
  missingManifest: { state: string; reason?: string };
  invalidManifest: { state: string; reason?: string };
  inherited: Record<string, { state: string; reason?: string; coverageState: string; coverageReason: string }>;
  absent: Record<string, { state: string; reason?: string; coverageState: string; coverageReason: string }>;
}

interface DerivationReport {
  deriveTypes: string[];
  rootDerives: boolean;
  deterministicClone: boolean;
  deterministicDeclaration: boolean;
  cloneIdPrefixed: boolean;
  worktreeIdPrefixed: boolean;
  declarationIdPrefixed: boolean;
  declarationBindsTriangle: boolean;
  distinctWorktrees: boolean;
}

// The protected environment every phase runs in — ONE environment, created
// once and reused by every phase: the tripwire directory is first on PATH,
// so any python/python2/python3/python2.7/py invocation is recorded by the
// shim and fails with exit 127. A missing tripwire directory would silently
// hand control back to the system PATH, so it is a hard error, never a
// silent degradation.
function tripwireEnv(binDir: string): NodeJS.ProcessEnv {
  if (!existsSync(binDir)) {
    throw new Error(`protected environment is broken: tripwire directory ${binDir} does not exist`);
  }
  return {
    ...process.env,
    PATH: `${binDir}${process.env.PATH ? `:${process.env.PATH}` : ""}`,
    npm_config_cache: join(dirname(binDir), "npm-cache"),
    npm_config_update_notifier: "false",
    npm_config_offline: "true",
  };
}

describe("live package", () => {
  // Heavyweight setup (tsc build + npm pack + offline install in an
  // isolated tmpRoot): needs headroom under parallel gate load.
  let tmpRoot: string;
  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "engram-live-package-"));
    const binDir = join(tmpRoot, "tripwire-bin");
    const pythonMarker = join(tmpRoot, "python-invoked.marker");
    writePythonTripwires(binDir, pythonMarker);
    const env = tripwireEnv(binDir);
    const phaseTrace: PhaseMarker[] = [];
    // Phases 1-3: build, pack exactly as delivered, and install the real
    // tarball offline — all protected, markers recorded after each phase,
    // inside the SAME protected environment (one tmpRoot, one tripwire
    // directory, one marker for every phase).
    packed = packAndInstall(env, pythonMarker, phaseTrace, tmpRoot, binDir);
    const runtimeDir = join(packed.installDir, "host-runtime");
    mkdirSync(runtimeDir);
    for (const file of ["web-tree-sitter.cjs", "web-tree-sitter.wasm"]) {
      copyFileSync(join(root, "node_modules", "web-tree-sitter", file), join(runtimeDir, file));
    }
    writeFileSync(join(packed.installDir, "production-parse-probe.mjs"), PRODUCTION_PARSE_PROBE);
    writeFileSync(join(packed.installDir, "reused-extraction-probe.mjs"), REUSED_EXTRACTION_PROBE);
    writeFileSync(join(packed.installDir, "all-modules-probe.mjs"), ALL_MODULES_PROBE);
  }, 120000);

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { force: true, recursive: true });
  });

  function productionProbe(mode: ProductionProbeMode) {
    const output = runProtectedPhase(process.execPath,
      buildProductionProbeArgs(mode, packed.tmpRoot, packed.installDir, root),
      { cwd: packed.installDir, env: { ...tripwireEnv(packed.tripwireBin), NODE_PATH: "" } });
    recordPhaseMarker(packed.phaseTrace, "production-parse-" + mode, packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    return JSON.parse(output);
  }

  function reusedProbe(mode: ReusedProbeMode) {
    const output = runProtectedPhase(process.execPath,
      buildReusedProbeArgs(mode, packed.tmpRoot, packed.installDir, root),
      { cwd: packed.installDir, env: { ...tripwireEnv(packed.tripwireBin), NODE_PATH: "" } });
    recordPhaseMarker(packed.phaseTrace, "reused-extraction-" + mode, packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    return JSON.parse(output);
  }

  it("packaged production parse adapter emits nonempty syntax-local facts and verified repair receipts", () => {
    const { before, after, broken, repair, forged } = productionProbe("repair");
    expect(before.unit.symbols.map(({ name }: { name: string }) => name)).toEqual(["Child", "probe"]);
    expect(before.unit.calls).toHaveLength(1);
    expect(before.unit.inheritances).toHaveLength(1);
    expect(before.analysis.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unresolved-call", name: "missingCall" }),
      expect.objectContaining({ kind: "unresolved-type", name: "MissingType" }),
    ]));
    expect(after.analysis.declarationInventory).toMatchObject({ kind: "verified-declaration-inventory" });
    expect(repair.publishable).toBe(true);
    expect(forged.publishable).toBe(false);
    expect(broken.analysis.coverage.reason).toContain("syntax-incomplete");
    expect(broken.analysis.declarationInventory).toBeUndefined();
  });

  it("the installed factory runs code-analysis on packaged grammars with a host-injected runtime and reports it available", () => {
    const { described, factory, initial, warm, missing, recovered, unsupported } = productionProbe("factory");
    expect(factory).toEqual(described);
    expect(factory.filter((entry: { state: string }) => entry.state === "available").map((entry: { capability: string }) => entry.capability))
      .toEqual([
        "refs",
        "history-dag",
        "github-pr",
        "index-snapshot",
        "working-tree",
        "diffs",
        "code-analysis",
        "retention-requests",
        "reconciliation",
        "publication",
      ]);
    expect(initial.analysis).toMatchObject({ state: "complete", cacheHit: false });
    expect(initial.analysis.symbols).toHaveLength(2);
    expect(warm.analysis).toMatchObject({ state: "complete", cacheHit: true });
    expect(missing.analysis).toMatchObject({ state: "unavailable", symbols: [], cacheHit: false });
    expect(missing.languages.find((entry: { language: string }) => entry.language === "typescript"))
      .toMatchObject({ state: "unavailable", reason: expect.stringContaining("cannot be read") });
    expect(recovered.analysis).toMatchObject({ state: "complete", cacheHit: true });
    expect(unsupported.analysis).toMatchObject({ state: "unavailable", symbols: [],
      coverage: { reason: expect.stringContaining('no production parse adapter is available for "lua"') } });
  });

  it("L5-P1 review rejects malformed packed code-analysis input before grammar or cache access", () => {
    expect(productionProbe("malformed")).toEqual({ grammarReads: 0, authorizations: [] });
  });

  it("L5-P1 review fences packed code analysis to the declared worktree for snapshots and clone scope for commits", () => {
    const { explicit, implicit, cloneOnly } = productionProbe("worktree");
    expect(explicit).toMatchObject({ state: "partial", cacheMode: "no-cache",
      coverage: { reason: expect.stringContaining("unstable-capture") } });
    expect(explicit.symbols).toHaveLength(2);
    expect(implicit.symbols).toEqual(explicit.symbols);
    expect(cloneOnly).toMatchObject({ state: "complete", cacheMode: "host-cache" });
  });

  it("L5-P1 review keeps a failed packed parse off grammar coverage and reports", () => {
    const { failed, grammar, report } = productionProbe("coverage");
    expect(failed.analysis.coverage).toMatchObject({ state: "unavailable",
      reason: expect.stringMatching(/parser-unavailable:.*private\/secret-path\.ts/) });
    expect(grammar).toMatchObject({ language: "typescript", state: "current",
      reason: expect.stringMatching(/^packaged grammar verified \(sha256 [a-f0-9]{64}\)$/) });
    expect(failed.languages).toContainEqual(grammar);
    expect(report).toEqual({ ...grammar, checkedAt: 0 });
  });

  it("L5-P1 review preserves inheritance and qualified calls through the packed production parser", () => {
    const { cpp, php } = productionProbe("references");
    expect(cpp).toMatchObject({ state: "complete", unresolved: ["Base", "ns::Other", "Tmpl"]
      .map(name => expect.objectContaining({ kind: "unresolved-type", name })) });
    expect(php).toMatchObject({ state: "complete", unresolved: [
      expect.objectContaining({ kind: "unresolved-call", name: "Foo.bar" }),
      expect.objectContaining({ kind: "unresolved-call", name: "Ns::baz" }),
      expect.objectContaining({ kind: "unresolved-type", name: "Ns::Base" }),
    ] });
  });

  it("each of the eleven advertised languages either yields a nonempty parsed unit from the production parse adapter or is reported unavailable with its reason and none is skipped silently", () => {
    const matrix = productionProbe("matrix");
    const results: string[] = [];
    expect(Object.keys(matrix).sort()).toEqual(Object.keys(productionSnippets).sort());
    for (const language of Object.keys(productionSnippets)) {
      const { analysis, coverage } = matrix[language];
      if (coverage?.state === "unavailable") {
        expect(coverage.reason, language).toEqual(expect.stringMatching(/\S/));
        expect(analysis, language).toMatchObject({ state: "unavailable", symbols: [] });
        results.push(language + " unavailable (" + coverage.reason + ")");
      } else {
        expect(coverage, language).toMatchObject({ language, state: "current" });
        expect(analysis, language).toMatchObject({ state: "complete" });
        expect(analysis.symbols, language).toContainEqual(expect.objectContaining({ name: "probe" }));
        results.push(language + " parsed");
      }
    }
    const integrity = createHash("sha512").update(readFileSync(packed.tarball)).digest("base64");
    const runtimePackage = JSON.parse(readFileSync(join(root, "node_modules", "web-tree-sitter", "package.json"), "utf8"));
    console.info("L5-P1 tarball", packed.tarball.split("/").at(-1), "sha512-" + integrity, "host web-tree-sitter", runtimePackage.version);
    console.info("L5-P1 production language matrix", results.join(", "));
  });

  it("installing and importing the delivered live surface without Python evaluates no database driver or root CLI", async () => {
    // No Python evaluated: the build, pack and install phases each ran in
    // an isolated child with the tripwire PATH, and every marker was
    // verified AFTER its phase.
    expectNoPython(packed.phaseTrace);

    // The install closure contains exactly the neutral package: no database
    // driver package, no root CLI package, no model SDK, no native addon.
    const modulesRoot = join(packed.installDir, "node_modules");
    // ".package-lock.json" is npm's own lockfile marker, not an installed
    // package; every real entry must be the neutral package's scope.
    expect(readdirSync(modulesRoot).filter((entry) => !entry.startsWith(".")).sort()).toEqual(["@sentropic"]);
    expect(readdirSync(join(modulesRoot, "@sentropic")).sort()).toEqual(["engram-live"]);
    const installedRoot = join(modulesRoot, "@sentropic", "engram-live");
    const installedFiles = listFilesRecursively(installedRoot).sort();
    expect(installedFiles.some((file) => /\.(py|pyc|pyo|node|gyp|tar|gz)$/i.test(file))).toBe(false);
    // The installed tree is exactly the packed surface — nothing more.
    expect(installedFiles).toEqual(packed.packedPaths.slice().sort());
    expect(installedFiles).toContain("dist/integration.js");
    expect(installedFiles).toContain("dist/contracts.js");
    expect(installedFiles).toContain("grammar-manifest.json");

    // The delivered metadata carries no install script, dependency or CLI,
    // pins the exact exports targets, and bounds the advertised support to
    // the qualified runtimes and platform.
    const installedPackageJson = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")) as Record<string, unknown>;
    expect(installedPackageJson.name).toBe("@sentropic/engram-live");
    expect(installedPackageJson.dependencies).toBeUndefined();
    expect(installedPackageJson.optionalDependencies).toBeUndefined();
    expect(installedPackageJson.peerDependencies).toBeUndefined();
    expect(installedPackageJson.bin).toBeUndefined();
    const scripts = installedPackageJson.scripts as Record<string, unknown> | undefined;
    for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
      expect(scripts?.[lifecycle]).toBeUndefined();
    }
    expect(installedPackageJson.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./contracts": { types: "./dist/contracts.d.ts", import: "./dist/contracts.js" },
      "./integration": { types: "./dist/integration.d.ts", import: "./dist/integration.js" },
    });
    expect(installedPackageJson.engines).toEqual({ node: "^20.0.0 || ^22.0.0 || ^24.0.0" });
    expect(installedPackageJson.os).toEqual(["linux"]);

    // Phase 4: import all three public entries (., /contracts, /integration)
    // from inside the install, in the protected child process; the marker is
    // verified after the imports — never before them.
    const importOutput = runProtectedPhase(process.execPath, ["import-probe.mjs"], {
      cwd: packed.installDir,
      env: tripwireEnv(packed.tripwireBin),
    });
    recordPhaseMarker(packed.phaseTrace, "import", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const report = JSON.parse(importOutput) as ImportReport;
    expect(report.hasFactory).toBe(true);
    expect(report.integrationKeys).toContain("createLiveFactory");
    expect(report.contractsKeys).toContain("ADVERTISED_LANGUAGES");
    expect(report.rootKeys).toContain("createLiveFactory");
    expect(report.rootKeys).toContain("ADVERTISED_LANGUAGES");
    expect(report.policyVersion.length).toBeGreaterThan(0);
    const manifestLanguages = Object.keys(
      (JSON.parse(readFileSync(join(installedRoot, "grammar-manifest.json"), "utf8")) as { languages: Record<string, unknown> }).languages,
    ).sort();
    expect(report.languages).toEqual(manifestLanguages);

    // Phase 5: exercise the executable factory with fake ports inside the
    // protected child and check which capability is delivered.
    const exerciseOutput = runProtectedPhase(process.execPath, ["exercise-probe.mjs"], {
      cwd: packed.installDir,
      env: tripwireEnv(packed.tripwireBin),
    });
    recordPhaseMarker(packed.phaseTrace, "exercise", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const exercise = JSON.parse(exerciseOutput) as ExerciseReport;
    expect(exercise.capabilityCount).toBe(10);
    expect(exercise.available).toEqual([
      "refs",
      "history-dag",
      "github-pr",
      "index-snapshot",
      "working-tree",
      "diffs",
      "code-analysis",
      "retention-requests",
      "reconciliation",
      "publication",
    ]);
    expect(exercise.reasoned).toBe(true);
    expect(exercise.plannedLots).toBe(true);
    expect(exercise.refs.state).toBe("unavailable");
    expect(exercise.refs.delivered).toBe(false);
    expect(exercise.refs.reasonLength).toBeGreaterThan(0);
    expect(exercise.unknownCapabilityError ?? "").toMatch(/unknown capability/i);
    expect(exercise.factSinkCalls).toBe(0);
  });

  it("every advertised language loads its packaged WASM and an absent grammar reports unavailable coverage", () => {
    // Phase 6: the grammar matrix runs entirely inside a protected child
    // process (tripwire PATH); the marker is verified after the phase.
    const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
    const output = runProtectedPhase(
      process.execPath,
      ["grammar-probe.mjs", rootPackageJson, installedRoot],
      { cwd: packed.installDir, env: tripwireEnv(packed.tripwireBin) },
    );
    recordPhaseMarker(packed.phaseTrace, "grammar", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);

    const report = JSON.parse(output) as GrammarReport;
    const manifest = JSON.parse(readFileSync(join(installedRoot, "grammar-manifest.json"), "utf8")) as {
      languages: Record<string, { file: string; sha256: string }>;
    };
    // Every advertised language: available, pinned to the packaged digest,
    // covered, and able to parse its smoke snippet.
    for (const language of Object.keys(manifest.languages)) {
      const entry = report.loaded[language];
      expect(entry, `grammar probe is missing language "${language}"`).toBeDefined();
      expect(entry.state).toBe("available");
      expect(entry.bytesSha256).toBe(manifest.languages[language].sha256);
      expect(entry.pinnedSha256).toBe(manifest.languages[language].sha256);
      expect(entry.coverageState).toBe("current");
      expect(entry.smoke, `grammar for "${language}" failed to parse its smoke snippet`).not.toBeNull();
    }
    expect(Object.keys(report.loaded).sort()).toEqual(Object.keys(manifest.languages).sort());
    // A tampered byte is rejected by the pinned digest, never silently loaded.
    for (const language of Object.keys(report.tampered)) {
      expect(report.tampered[language].state).toBe("unavailable");
      expect(report.tampered[language].reason ?? "").toMatch(/digest/);
    }
    // An absent WASM (ENOENT on the filesystem port) is explicit, and the
    // reason names the language and the failing port.
    expect(report.absentWasm.state).toBe("unavailable");
    expect(report.absentWasm.reason ?? "").toContain("typescript");
    expect(report.absentWasm.reason ?? "").toMatch(/filesystem port/);
    // Absent and invalid manifests degrade to explicit unavailability.
    expect(report.missingManifest.state).toBe("unavailable");
    expect(report.missingManifest.reason ?? "").toMatch(/manifest/);
    expect(report.missingManifest.reason ?? "").toMatch(/filesystem port/);
    expect(report.invalidManifest.state).toBe("unavailable");
    expect(report.invalidManifest.reason ?? "").toMatch(/manifest/);
    expect(report.invalidManifest.reason ?? "").toMatch(/is not valid JSON/);
    // Inherited property names are refused, not resolved through the
    // prototype chain.
    for (const name of ["constructor", "toString"]) {
      const inherited = report.inherited[name];
      expect(inherited.state).toBe("unavailable");
      expect(inherited.reason ?? "").toContain(name);
      expect(inherited.coverageState).toBe("unavailable");
      expect(inherited.coverageReason ?? "").toContain(name);
    }
    // Absent grammars (repository grammars not packaged, unknown names)
    // report unavailable coverage that names the missing language.
    for (const name of ["lua", "julia", "not-a-language"]) {
      const absent = report.absent[name];
      expect(absent.state).toBe("unavailable");
      expect(absent.reason ?? "").toContain(name);
      expect(absent.coverageState).toBe("unavailable");
      expect(absent.coverageReason ?? "").toContain(name);
    }
  });

  it("the canonical identity derivation is exported by the public entries of the built package", () => {
    // A protected child imports the derivation from the PUBLIC entries
    // (., /integration) of the installed package — never from an internal
    // path — and derives every opaque id through exactly that surface.
    const output = runProtectedPhase(process.execPath, ["derivation-probe.mjs"], {
      cwd: packed.installDir,
      env: tripwireEnv(packed.tripwireBin),
    });
    recordPhaseMarker(packed.phaseTrace, "derivation", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const report = JSON.parse(output) as DerivationReport;
    expect(report.deriveTypes).toEqual(["function", "function", "function"]);
    expect(report.rootDerives).toBe(true);
    expect(report.deterministicClone).toBe(true);
    expect(report.deterministicDeclaration).toBe(true);
    expect(report.cloneIdPrefixed).toBe(true);
    expect(report.worktreeIdPrefixed).toBe(true);
    expect(report.declarationIdPrefixed).toBe(true);
    expect(report.declarationBindsTriangle).toBe(true);
    expect(report.distinctWorktrees).toBe(true);
  });

  it("packaged reused extraction and context resolution execute without the root install closure", () => {
    // L5-P2b RED (plan/09 L5-P): from the offline packed installation alone,
    // with the root installation inaccessible, execute nonempty reused
    // extraction and context-dependent resolution. The probe denies every
    // filesystem read outside the install tree, binds only the parser
    // runtime, and extracts through the injected read/cache/grammar ports.
    const report = reusedProbe("extract") as {
      nodes: number;
      edges: number;
      resolvedImportEdge: boolean;
      unresolvedWithoutTsconfig: boolean;
      single: number;
    };
    expect(report.nodes, "packaged reused extraction yields nonempty nodes").toBeGreaterThan(0);
    expect(report.edges, "packaged reused extraction yields nonempty edges").toBeGreaterThan(0);
    expect(report.resolvedImportEdge, "tsconfig alias resolves app -> lib_dep imports_from edge").toBe(true);
    expect(report.unresolvedWithoutTsconfig, "removing tsconfig leaves alias unresolved as ref_dep").toBe(true);
    expect(report.single, "packaged single-file extraction yields nonempty nodes").toBeGreaterThan(0);
    const integrity = createHash("sha512").update(readFileSync(packed.tarball)).digest("base64");
    const runtimePackage = JSON.parse(readFileSync(join(root, "node_modules", "web-tree-sitter", "package.json"), "utf8"));
    console.info("L5-P2b tarball", packed.tarball.split("/").at(-1), "sha512-" + integrity, "node", process.versions.node, "host web-tree-sitter", runtimePackage.version);
    console.info("L5-P2b packaged reused extraction", `nodes=${report.nodes} edges=${report.edges} single=${report.single}`);
  });

  it("a warm packaged extraction refuses missing grammar and root fallback", () => {
    // L5-P2b RED (plan/09 L5-P): a warm packaged extraction is served from
    // the injected store (pinned exact cold/warm load+store counts), then a
    // removed grammar after the warm hit refuses the warm store with explicit
    // unavailability and both entry points refuse missing live ports.
    const report = reusedProbe("warm") as {
      cold: number;
      coldLoads: number;
      coldStores: number;
      warmLoads: number;
      warmStores: number;
      missingNodes: number;
      missingLoads: number;
      missingDiagnostics: number;
      recoveredLoads: number;
      fallbackRejected: number;
    };
    expect(report.cold, "warm probe cold run yields nonempty nodes").toBeGreaterThan(0);
    expect(report.coldLoads, "cold run performs 2 store loads (lookup + pre-write check)").toBe(2);
    expect(report.coldStores, "cold run stores 1 envelope").toBe(1);
    expect(report.warmLoads, "warm hit performs exactly 1 additional store load").toBe(3);
    expect(report.warmStores, "warm hit stores nothing more").toBe(1);
    expect(report.missingNodes, "missing grammar returns zero nodes even with warm cache populated").toBe(0);
    expect(report.missingLoads, "missing grammar fails closed before loading warm cache").toBe(3);
    expect(report.missingDiagnostics, "missing grammar reports explicit diagnostics").toBeGreaterThan(0);
    expect(report.recoveredLoads, "restoring grammar resumes warm hit (+1 load)").toBe(4);
    expect(report.fallbackRejected, "extractReused and extractReusedWithDiagnostics reject undefined/null live ports").toBe(4);
    console.info(
      "L5-P2b warm packaged extraction",
      `cold=${report.cold} loads=${report.coldLoads}->${report.warmLoads}->${report.missingLoads}->${report.recoveredLoads} stores=${report.coldStores}->${report.warmStores} missingDiagnostics=${report.missingDiagnostics} fallbackRejected=${report.fallbackRejected}`,
    );
  });

  it("installed declarations typecheck strictly for external consumers without leaking internal reused modules or collapsing to any", () => {
    // L5-P2b F-02 / F-06 RED: compiling an external strict consumer against
    // the extracted tarball must succeed with skipLibCheck: false (no TS7016
    // on unshipped ./reused/extract-core.js) and preserve exact public types
    // under skipLibCheck: true (no silent collapse to any; no spurious error
    // property on ReusedExtractionResult).
    const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");
    const typeRoots = join(root, "node_modules", "@types");
    const consumerDir = mkdtempSync(join(packed.installDir, ".tsc-consumer-"));
    const runTsc = (filePath: string, skipLibCheck: boolean) => spawnSync(
      process.execPath,
      [
        tscBin,
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--target", "ES2022",
        "--module", "NodeNext",
        "--moduleResolution", "NodeNext",
        "--skipLibCheck", skipLibCheck ? "true" : "false",
        "--typeRoots", typeRoots,
        "--types", "node",
        filePath,
      ],
      { cwd: packed.installDir, env: tripwireEnv(packed.tripwireBin), encoding: "utf8" },
    );
    try {
      const validFile = join(consumerDir, "valid.mts");
      writeFileSync(
        validFile,
        [
          'import {',
          '  bindReusedExtractionRuntime,',
          '  extractReused,',
          '  extractReusedWithDiagnostics,',
          '  resolveReusedLiveLanguage,',
          '  REUSED_EXTRACTION_VERSION,',
          '  REUSED_LIVE_DIALECT_VERSION,',
          '  REUSED_LIVE_GRAMMAR_ABI,',
          '  type ReusedExtractionResult,',
          '  type ReusedExtractWithDiagnosticsResult,',
          '  type ReusedLiveExtractionPorts,',
          '} from "@sentropic/engram-live";',
          'const lang = resolveReusedLiveLanguage("/repo/app.ts");',
          'const version: string = REUSED_EXTRACTION_VERSION + REUSED_LIVE_DIALECT_VERSION + REUSED_LIVE_GRAMMAR_ABI;',
          'const ports: ReusedLiveExtractionPorts = { scope: { tenant: "t", clone: "c" } };',
          'export async function run(): Promise<[ReusedExtractionResult, ReusedExtractWithDiagnosticsResult, string]> {',
          '  bindReusedExtractionRuntime({ init: () => {}, loadLanguage: async () => ({}), createParser: () => ({ parse: () => null, delete: () => {} }) });',
          '  const a = await extractReused(["/repo/app.ts"], ports);',
          '  const b = await extractReusedWithDiagnostics(["/repo/app.ts"], ports);',
          '  return [a, b, lang ? lang.dialect : version];',
          '}',
          "",
        ].join("\n"),
      );
      const valid = runTsc(validFile, false);
      expect(valid.status, `strict consumer with skipLibCheck:false failed:\n${valid.stdout}\n${valid.stderr}`).toBe(0);

      const badPortsFile = join(consumerDir, "bad-ports.mts");
      writeFileSync(
        badPortsFile,
        'import type { ReusedLiveExtractionPorts } from "@sentropic/engram-live";\nexport const badPorts: ReusedLiveExtractionPorts = 12345;\n',
      );
      const badPorts = runTsc(badPortsFile, true);
      expect(badPorts.status, "ReusedLiveExtractionPorts must not collapse to any under skipLibCheck:true").not.toBe(0);
      expect(badPorts.stdout + badPorts.stderr).toContain("TS2559");

      const badLangFile = join(consumerDir, "bad-lang.mts");
      writeFileSync(
        badLangFile,
        'import { resolveReusedLiveLanguage } from "@sentropic/engram-live";\nexport const badLang: number = resolveReusedLiveLanguage("a.ts");\n',
      );
      const badLang = runTsc(badLangFile, true);
      expect(badLang.status, "resolveReusedLiveLanguage return type must not collapse to any").not.toBe(0);
      expect(badLang.stdout + badLang.stderr).toContain("TS2322");

      const badResultFile = join(consumerDir, "bad-result.mts");
      writeFileSync(
        badResultFile,
        'import type { ReusedExtractionResult } from "@sentropic/engram-live";\nexport const badResult: ReusedExtractionResult = { nodes: [], edges: [], input_tokens: 0, output_tokens: 0, error: "spurious" };\n',
      );
      const badResult = runTsc(badResultFile, true);
      expect(badResult.status, "ReusedExtractionResult must not declare a spurious error property (F-06)").not.toBe(0);
      expect(badResult.stdout + badResult.stderr).toContain("TS2353");
    } finally {
      rmSync(consumerDir, { recursive: true, force: true });
    }
    recordPhaseMarker(packed.phaseTrace, "consumer-tsc", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
  });

  it("installed L5 closure has no model Python database host or root-package dependency", () => {
    // L5-P2b GUARD R13 (plan/09 L5-P): the installed closure carries no
    // model, Python, database, host or root-package edge. Static scan of
    // every installed executable plus packed-surface and metadata checks.
    const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
    const installedFiles = listFilesRecursively(installedRoot).sort();
    expect(installedFiles.some((file) => /\.(py|pyc|pyo|node|gyp|tar|gz)$/i.test(file))).toBe(false);
    expect(installedFiles).toEqual(packed.packedPaths.slice().sort());
    for (const name of ["reused-extraction", "reused/extract-core", "reused/live-cache-keys", "reused/node-id", "reused/relation-remap"] as const) {
      const js = `dist/${name}.js`;
      expect(packed.packedPaths, `packed surface contains ${js}`).toContain(js);
    }
    const importFromRe = /^\s*import\s[^;]*?from\s*["']([^"']+)["']/gm;
    const exportFromRe = /^\s*export\s[^;]*?from\s*["']([^"']+)["']/gm;
    const forbiddenBare = new Set([
      "openai", "@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/mistral", "@mistralai/sdk",
      "mistral-ocr", "ollama", "ollama-ai-provider", "cohere-ai", "langchain",
      "@google/generative-ai", "ai",
      "better-sqlite3", "sqlite3", "pg", "pg-pool", "libsql", "@libsql/client",
      "node:sqlite", "node:module",
    ]);
    for (const file of installedFiles.filter((f) => /\.(js|mjs|cjs)$/.test(f))) {
      const content = readFileSync(join(installedRoot, file), "utf8");
      expect(content, `${file} builds no loader`).not.toContain("createRequire");
      expect(content, `${file} builds no loader`).not.toContain("getBuiltinModule");
      const specs = [
        ...content.matchAll(importFromRe),
        ...content.matchAll(exportFromRe),
      ].map((m) => m[1] as string);
      for (const spec of specs) {
        expect(forbiddenBare.has(spec), `${file} imports forbidden bare module "${spec}"`).toBe(false);
        expect(spec === "@sentropic/engram" || spec.startsWith("@sentropic/engram/"), `${file} reaches the root package via "${spec}"`).toBe(false);
        expect(spec === "../src/cli.js" || spec.includes("../src/"), `${file} escapes to the root sources via "${spec}"`).toBe(false);
        expect(/^h2a(-|\/|$)/.test(spec) || spec.startsWith("@sentropic/h2a"), `${file} reaches the h2a host via "${spec}"`).toBe(false);
        if (!(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("node:"))) {
          expect(`installed executable ${file} imports bare "${spec}"`).toBe("in-package relative or node: builtin");
        }
      }
    }
    const installedPackageJson = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")) as Record<string, unknown>;
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      expect(installedPackageJson[field], `installed package declares no ${field}`).toBeUndefined();
    }
  });

  it("L5 source audit and packaged grammar inventory", () => {
    // L5 GUARD (plan/09 L5): the reused root extraction exposes the injected
    // host seam instead of a source-root default, and the isolated build
    // audits it. No src/* import here: this file stays inside the neutral
    // test closure; the runtime seam behavior is covered by
    // tests/live-code-version.test.ts. Since L5-P2a the seam lives in the
    // closed core (src/extract-core.ts, src/live-cache-keys.ts) and the root
    // host module (src/extract.ts) binds it.
    const coreSource = readFileSync(join(root, "src", "extract-core.ts"), "utf8");
    // Boundary-precise markers: a bare "cacheStore" substring would also
    // match a renamed field, so the guard requires the exact declarations.
    for (const symbol of ["LiveExtractionPorts", "readonly cacheStore?:", "readonly grammarWasm?:", "liveOperationScope"]) {
      expect(coreSource, `closed core exposes the injected seam "${symbol}"`).toContain(symbol);
    }
    const extractSource = readFileSync(join(root, "src", "extract.ts"), "utf8");
    for (const symbol of ["bindExtractCoreHost", "./extract-core.js"]) {
      expect(extractSource, `root host module binds the closed core "${symbol}"`).toContain(symbol);
    }
    const liveCacheKeysSource = readFileSync(join(root, "src", "live-cache-keys.ts"), "utf8");
    for (const symbol of ["InjectedCacheStore", "liveExtractionKey"]) {
      expect(liveCacheKeysSource, `closed cache leaf exposes the injected seam "${symbol}"`).toContain(symbol);
    }
    const cacheSource = readFileSync(join(root, "src", "cache.ts"), "utf8");
    for (const symbol of ["liveContentKey"]) {
      expect(cacheSource, `reused cache exposes the injected seam "${symbol}"`).toContain(symbol);
    }
    // Isolated-build audit, fast mode (no compile): exit 0 and names the
    // audited neutral modules.
    let auditOutput: string;
    try {
      auditOutput = execFileSync(process.execPath, [buildScript, "--audit-only"], { cwd: root, encoding: "utf8" });
    } catch (error) {
      throw new Error(`L5 isolated-build audit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const name of ["analysis-cache", "code-analysis", "comparisons"]) {
      expect(auditOutput, `isolated-build audit covers ${name}`).toContain(name);
    }
    // No root install closure on the reused path: the neutral L5 modules
    // carry no source-root, driver, loader or model edge.
    for (const name of ["analysis-cache.ts", "code-analysis.ts", "comparisons.ts"]) {
      const content = readFileSync(join(liveRoot, name), "utf8");
      for (const edge of ["../src/", "node:sqlite", "node:module", "createRequire", "better-sqlite3", "mistral-ocr"]) {
        expect(content, `${name} carries no root-closure edge "${edge}"`).not.toContain(edge);
      }
    }
    // Only verified grammar assets are bundled: every dist grammar file is
    // pinned by the manifest, no unpinned bundled code.
    const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
    const manifest = JSON.parse(readFileSync(join(installedRoot, "grammar-manifest.json"), "utf8")) as {
      languages: Record<string, { file: string }>;
    };
    const pinnedFiles = new Set(Object.values(manifest.languages).map((entry) => entry.file));
    for (const file of readdirSync(join(installedRoot, "dist", "grammars"))) {
      expect(pinnedFiles.has(file), `bundled grammar asset "${file}" is pinned by the manifest`).toBe(true);
    }
    expect(pinnedFiles.size).toBeGreaterThan(0);
  });

  it("Python tripwire declarations are fail closed without launching an interpreter", () => {
    // Owner forbids interpreter-name canaries. This checks declarations only;
    // runtime interception of a forbidden launch is deliberately not claimed.
    expectNoPython(packed.phaseTrace);
    for (const name of ["python", "python3", "python2", "python2.7", "py"]) {
      const script = readFileSync(join(packed.tripwireBin, name), "utf8");
      expect(script).toContain("exit 127");
      expect(script).toContain(packed.pythonMarker);
    }
  });

  it("the packed line attribution producer executes offline on authorized R1 objects through its public entry", () => {
    const box = new LiveGitSandbox();
    try {
      const fixture = buildLineAttributionFixture(box);
      const before = inventoryDigest(fixture);
      const retainedBefore = inventoryDigest({ root: fixture.privateRoot });
      const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
      for (const name of ["line-attribution", "git-executor"]) {
        for (const extension of ["js", "d.ts", "d.ts.map"]) {
          expect(packed.packedPaths).toContain(`dist/${name}.${extension}`);
        }
      }
      const input = { scope: { tenant: "package-g1", clone: "clone-g1" }, generationId: "packed-generation",
        target: { algorithm: "sha1", oid: fixture.commits.merge }, pathHex: fixture.rawPath.toString("hex"),
        ranges: [{ start: 1, end: 10 }] };
      const probe = `
        import { attributeLines, createSafeGitExecutor, POLICY_VERSION } from '@sentropic/engram-live';
        import { readFileSync } from 'node:fs';
        const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
        // No checkout/module fallback: this child imports only the extracted
        // package and Node builtins, with no root installation in its path.
        let networkCalls = 0;
        globalThis.fetch = () => { networkCalls++; throw new Error('offline'); };
        const request = { ...data.input, path: Buffer.from(data.input.pathHex, 'hex'), policyVersion: POLICY_VERSION,
          options: { version: 'native-blame-options/1', algorithm: 'myers', moveMinCharacters: 1, copyMinCharacters: 1, copySearch: 'all' } };
        delete request.pathHex;
        const ports = { git: createSafeGitExecutor({ gitPath: data.gitPath, disabledHooksDir: data.hooks }),
          async authorize() { return 'authorized'; },
          async openRetained(q) { return { cwd: data.cwd, configPaths: [data.cwd + '/.git/config'],
            receipt: { scope: q.scope, ...q.target, receivedAt: 1700000000000, backupRef: 'packed-backup' } }; } };
        const result = await attributeLines(request, ports);
        const denied = await attributeLines(request, { ...ports, async authorize() { return 'unauthorized'; } });
        const lines = result.origins.flatMap(o => Array.from({ length: o.finalRange.end - o.finalRange.start + 1 }, (_, i) => ({
          commit: o.commit.oid, original: o.originalRange.start + i, final: o.finalRange.start + i,
          pathHex: Buffer.from(o.path).toString('hex'), author: o.author.name,
        })));
        console.log(JSON.stringify({ state: result.state, version: result.calculationVersion, lines,
          denied: denied.state, deniedOrigins: denied.origins.length, networkCalls }));
      `;
      writeFileShim(join(packed.installDir, "line-attribution-probe.mjs"), probe);
      const dataPath = join(packed.installDir, "line-attribution-input.json");
      writeFileSync(dataPath, JSON.stringify({ input, cwd: fixture.stores.complete, gitPath: box.trace.executable,
        hooks: join(box.root, "disabled-hooks") }));
      const output = runProtectedPhase(process.execPath, ["line-attribution-probe.mjs", dataPath], {
        cwd: packed.installDir, env: { ...tripwireEnv(packed.tripwireBin), NODE_PATH: "", npm_config_offline: "true" },
      });
      recordPhaseMarker(packed.phaseTrace, "line-attribution", packed.pythonMarker);
      expectNoPython(packed.phaseTrace);
      const report = JSON.parse(output);
      expect(report.state).toBe("complete");
      expect(report.version).toBe("live-line-attribution/1");
      expect(report.lines).toEqual(nativeLineOracle(box, fixture.repo, input.target.oid, fixture.rawPath, input.ranges, ["-M1", "-C1", "-C1", "-C1"]));
      expect(report.denied).toBe("partial");
      expect(report.deniedOrigins).toBe(0);
      expect(report.networkCalls).toBe(0);
      expect(inventoryDigest(fixture)).toBe(before);
      expect(inventoryDigest({ root: fixture.privateRoot })).toBe(retainedBefore);
      // The producer carries only internal and builtin edges in the actual
      // tarball, including its declaration's injected executor contract.
      for (const name of ["line-attribution.js", "git-executor.js"]) {
        const source = readFileSync(join(installedRoot, "dist", name), "utf8");
        for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
          expect(match[1].startsWith("./") || match[1].startsWith("node:"), match[1]).toBe(true);
        }
      }
    } finally { box.dispose(); }
  });

  it("the packed symbol correspondence producer reuses L5 receipts offline through the public entry", () => {
    const box = new LiveGitSandbox();
    try {
      const repo = box.init(join(box.root, "g2-retained"));
      const commit = (path: string, content: string, parent?: string) => {
        const blob = box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], content).toString().trim();
        const tree = box.git(repo, ["mktree", "-z"], `100644 blob ${blob}\t${path}\0`).toString().trim();
        return box.git(repo, ["commit-tree", tree, ...(parent ? ["-p", parent] : [])], "G2 packed fixture\n").toString().trim();
      };
      const before = commit("old.ts", "export function oldName() { return 42; }\n");
      const after = commit("new.ts", "export function newName() { return 42; }\n", before);
      expect(box.read(repo, ["diff-tree", "-p", "-r", before, after]).toString()).toContain("+export function newName() { return 42; }");
      const digestBefore = inventoryDigest({ root: repo });
      for (const name of ["symbol-history", "code-analysis", "analysis-cache", "comparisons"]) {
        for (const extension of ["js", "d.ts", "d.ts.map"]) expect(packed.packedPaths).toContain(`dist/${name}.${extension}`);
      }
      const probe = `
        import { correspondSymbols, analyzeCode, createSafeGitExecutor, SYMBOL_HISTORY_OPTIONS, POLICY_VERSION } from '@sentropic/engram-live';
        import { createHash } from 'node:crypto';
        import { readFileSync } from 'node:fs';
        const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
        let networkCalls = 0;
        globalThis.fetch = () => { networkCalls++; throw new Error('offline'); };
        const git = createSafeGitExecutor({ gitPath: data.gitPath, disabledHooksDir: data.hooks });
        const objects = { async loadBlob(oid) { return git.run(data.cwd, ['cat-file', 'blob', oid]); },
          async loadObject(oid) { const bytes = git.run(data.cwd, ['cat-file', '--batch'], oid + '\\n');
            const end = bytes.indexOf(10), fields = bytes.subarray(0, end).toString().split(' ');
            return fields[1] === 'missing' ? null : { type: fields[1], body: bytes.subarray(end + 1, end + 1 + Number(fields[2])) }; },
          async isShallowBoundary() { return false; } };
        const hash = text => createHash('sha256').update(text).digest('hex');
        const request = { scope: { tenant: 'packed-g2', clone: 'clone:packed' }, generationId: 'packed-g2-generation',
          before: { algorithm: 'sha1', oid: data.before }, after: { algorithm: 'sha1', oid: data.after },
          options: SYMBOL_HISTORY_OPTIONS, policyVersion: POLICY_VERSION };
        const ports = { async authorize() { return 'authorized'; },
          async openRetained(q, endpoint) { git.assertNoConfigIncludes([data.cwd + '/.git/config'], true);
            return { objects, receipt: { scope: q.scope, ...endpoint, receivedAt: 1700000000000, backupRef: 'packed-g2' } }; },
          async inventory(q) { const content = Buffer.from((await objects.loadObject(q.blob.oid)).body).toString();
            const result = await analyzeCode({ scope: q.scope, path: Buffer.from(q.path).toString(), treeOid: q.tree.oid,
              content, language: 'typescript', configHash: hash('config'), dependencyHash: hash('dependencies'),
              historicalBounds: { known: true, heads: [q.commit] } }, { objects,
              grammar: { status() { const bytes = Uint8Array.from([0,97,115,109,1,0,0,0]);
                return { state: 'available', version: 'fixture/1', bytes, digest: createHash('sha256').update(bytes).digest('hex'), abi: 'fixture/1', grammarId: 'fixture-ts' }; }, load() { return {}; } },
              extractor: { parse({ content }) { return { symbols: [{ slot: 'function:0', kind: 'function',
                name: content.includes('oldName') ? 'oldName' : 'newName', bodyHash: hash('return 42;') }],
                calls: [], inheritances: [], topologyHash: hash(content),
                syntax: { rootSpansBytes: true, walkComplete: true, hasError: false, hasMissing: false } }; } }
            }); return result.declarationInventory; } };
        const result = await correspondSymbols(request, ports);
        const denied = await correspondSymbols(request, { ...ports, async authorize() { return 'unauthorized'; } });
        console.log(JSON.stringify({ result, denied, networkCalls }));
      `;
      writeFileShim(join(packed.installDir, "symbol-history-probe.mjs"), probe);
      const dataPath = join(packed.installDir, "symbol-history-input.json");
      writeFileSync(dataPath, JSON.stringify({ cwd: repo, before, after, gitPath: box.trace.executable, hooks: join(box.root, "disabled-hooks") }));
      const output = runProtectedPhase(process.execPath, ["symbol-history-probe.mjs", dataPath], {
        cwd: packed.installDir, env: { ...tripwireEnv(packed.tripwireBin), NODE_PATH: "" },
      });
      recordPhaseMarker(packed.phaseTrace, "symbol-history", packed.pythonMarker);
      expectNoPython(packed.phaseTrace);
      const { result, denied, networkCalls } = JSON.parse(output);
      expect(result.state, JSON.stringify(result.coverage)).toBe("complete");
      expect(result.calculationVersion).toBe("live-symbol-history/1");
      expect(result.correspondences).toHaveLength(1);
      expect(result.correspondences[0]).toMatchObject({ relation: "renamed-and-moved", reason: "unique-exact-body", similarity: 100 });
      expect(result.correspondences[0].before[0]).toMatchObject({ name: "oldName", commit: { oid: before } });
      expect(result.correspondences[0].after[0]).toMatchObject({ name: "newName", commit: { oid: after } });
      expect(denied.state).toBe("partial");
      expect(denied.correspondences).toEqual([]);
      expect(networkCalls).toBe(0);
      expect(inventoryDigest({ root: repo })).toBe(digestBefore);
    } finally { box.dispose(); }
  });

  it("every neutral source module is delivered in the installed tarball and imports without the root package", () => {
    // E-ASM1 RED (plan/09 E-ASM): every neutral .ts source module directly in
    // engram-live/ (the 15 previously packed modules plus the 18 engine and
    // L6b modules) is compiled, emitted (.js/.d.ts/.d.ts.map), packed in the
    // tarball, exported from "." without adding an export subpath, and imports
    // offline inside a root-denied child process without the root package.
    const neutralSourceModules = readdirSync(liveRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
      .map((entry) => entry.name.slice(0, -3))
      .sort();
    expect(neutralSourceModules).toHaveLength(35);
    expect(neutralSourceModules).toContain("factory-history");
    expect(neutralSourceModules).toContain("factory-local");
    for (const name of EASM1_NEWLY_PACKED_MODULES) {
      expect(neutralSourceModules, `source directory contains ${name}.ts`).toContain(name);
    }

    const installedRoot = join(packed.installDir, "node_modules", "@sentropic", "engram-live");
    const installedFiles = new Set(listFilesRecursively(installedRoot));
    for (const name of neutralSourceModules) {
      for (const extension of ["js", "d.ts", "d.ts.map"]) {
        const rel = `dist/${name}.${extension}`;
        expect(packed.packedPaths, `packed tarball must contain ${rel}`).toContain(rel);
        expect(installedFiles.has(rel), `installed tree must contain ${rel}`).toBe(true);
      }
    }

    // No new export subpath, no dependency, no lifecycle script, no bin.
    const installedPackageJson = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")) as Record<string, unknown>;
    expect(installedPackageJson.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./contracts": { types: "./dist/contracts.d.ts", import: "./dist/contracts.js" },
      "./integration": { types: "./dist/integration.d.ts", import: "./dist/integration.js" },
    });
    expect(installedPackageJson.dependencies).toBeUndefined();
    expect(installedPackageJson.optionalDependencies).toBeUndefined();
    expect(installedPackageJson.peerDependencies).toBeUndefined();
    expect(installedPackageJson.bin).toBeUndefined();

    // Offline, root-denied child process: imports @sentropic/engram-live,
    // verifies all 18 modules' public exports and smoke-runs them, then
    // directly imports every one of the 33 delivered dist/<module>.js files.
    const output = runProtectedPhase(
      process.execPath,
      buildAllModulesProbeArgs(packed.tmpRoot, root, neutralSourceModules),
      { cwd: packed.installDir, env: { ...tripwireEnv(packed.tripwireBin), NODE_PATH: "" } },
    );
    recordPhaseMarker(packed.phaseTrace, "all-modules", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    const report = JSON.parse(output) as {
      checkedRootExports: number;
      loadedModules: { name: string; exportCount: number }[];
    };
    expect(report.checkedRootExports).toBeGreaterThanOrEqual(100);
    expect(report.loadedModules.map((entry) => entry.name)).toEqual(neutralSourceModules);

    // Strict external consumer typecheck (skipLibCheck: false) against the
    // installed tarball covering symbols and types from all 18 new modules.
    const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");
    const typeRoots = join(root, "node_modules", "@types");
    const consumerDir = mkdtempSync(join(packed.installDir, ".tsc-easm1-"));
    try {
      const consumerFile = join(consumerDir, "all-18.mts");
      writeFileSync(
        consumerFile,
        [
          'import {',
          '  GIT_PROTOCOL_VERSION, revListArguments, GitProtocolError, type GitProcessPort,',
          '  GIT_STREAM_EXTRACTOR_VERSION, streamGitHistory, GitStreamError, type StreamedCommit,',
          '  HISTORY_EXTRACTOR_VERSION, runHistoryPass, deriveReachability, type HistoryPassOutcome,',
          '  classifyRefName, trackRef, selectHistoryRoots, type SelectHistoryRootsInput,',
          '  observeRepository, type RepositoryObservationDto,',
          '  RetentionError, deriveRetentionRequests, runRetentionPass, type RetentionPassOutcome,',
          '  PR_SYNC_EXTRACTOR_VERSION, runPrSyncPass, PrSyncError, type PrSyncOutcome,',
          '  pinPrAttribution, applyPrHeadUpdate, classifyMergeStrategy, type PinPrAttributionInput,',
          '  BorrowedIndexError, captureWorktree, type CaptureResult,',
          '  ATTR_UNSPECIFIED, defaultAttributes, isFiltered, type PathAttributes,',
          '  DEFAULT_MAX_FILE_BYTES, toPathBytes, fingerprintBytes, type SafeFileBytes,',
          '  DiffError, deriveLocalDiff, type DeriveLocalDiffInput,',
          '  SNAPSHOT_ERROR_CODES, digestLocalDiff, stageLocalSnapshot, runUnregisterPurge, type StageLocalSnapshotOutcome,',
          '  ContentPolicyError, classifyPath, containsSecretText, type PathClassification,',
          '  scopeIdentity, Scheduler, type SchedulerBudgets,',
          '  createWatchHub, createNativeWatchHub, type WatchHub,',
          '  Reconciler, type ReconcilerPorts,',
          '  DEFAULT_MAX_DELTA_PATHS_PER_AXIS, initialCoverage, deriveReadiness, toContractState, type CoverageMap,',
          '} from "@sentropic/engram-live";',
          'export const summary = {',
          '  proto: GIT_PROTOCOL_VERSION, rev: revListArguments(["HEAD"]), pErr: GitProtocolError,',
          '  stream: GIT_STREAM_EXTRACTOR_VERSION, streamFn: streamGitHistory, sErr: GitStreamError,',
          '  hist: HISTORY_EXTRACTOR_VERSION, histFn: runHistoryPass, reach: deriveReachability,',
          '  refs: [classifyRefName, trackRef, selectHistoryRoots],',
          '  repo: observeRepository,',
          '  ret: [RetentionError, deriveRetentionRequests, runRetentionPass],',
          '  pr: [PR_SYNC_EXTRACTOR_VERSION, runPrSyncPass, PrSyncError, pinPrAttribution, applyPrHeadUpdate, classifyMergeStrategy],',
          '  wt: [BorrowedIndexError, captureWorktree],',
          '  attr: [ATTR_UNSPECIFIED, defaultAttributes, isFiltered],',
          '  fs: [DEFAULT_MAX_FILE_BYTES, toPathBytes, fingerprintBytes],',
          '  diff: [DiffError, deriveLocalDiff],',
          '  snap: [SNAPSHOT_ERROR_CODES, digestLocalDiff, stageLocalSnapshot, runUnregisterPurge],',
          '  pol: [ContentPolicyError, classifyPath, containsSecretText],',
          '  sched: [scopeIdentity, Scheduler],',
          '  watch: [createWatchHub, createNativeWatchHub],',
          '  rec: Reconciler,',
          '  cov: [DEFAULT_MAX_DELTA_PATHS_PER_AXIS, initialCoverage, deriveReadiness, toContractState],',
          '};',
          'export type AllTypes = [',
          '  GitProcessPort, StreamedCommit, HistoryPassOutcome, SelectHistoryRootsInput,',
          '  RepositoryObservationDto, RetentionPassOutcome, PrSyncOutcome, PinPrAttributionInput,',
          '  CaptureResult, PathAttributes, SafeFileBytes, DeriveLocalDiffInput,',
          '  StageLocalSnapshotOutcome, PathClassification, SchedulerBudgets, WatchHub,',
          '  ReconcilerPorts, CoverageMap,',
          '];',
          'import {',
          '  createLiveFactory, composeFactoryGitExecutor, validateHostHooksIsolationDir,',
          '  buildVerifiedCaptureEvidence, captureForLocalCodeAnalysis, createLocalSchedulingController,',
          '  DEFAULT_FACTORY_SCHEDULER_BUDGETS, DEFAULT_FACTORY_WATCH_BUDGETS, DEFAULT_FACTORY_RECONCILE_BUDGETS,',
          '  type GitPort, type ContentPort, type CachePort, type SchedulingPort, type VerifiedCaptureEvidenceDto,',
          '  type RefsCapabilityRequest, type HistoryDagCapabilityRequest,',
          '  type GithubPrCapabilityRequest, type RetentionRequestsCapabilityRequest,',
          '  type IndexSnapshotCapabilityRequest, type WorkingTreeCapabilityRequest,',
          '  type DiffsCapabilityRequest, type ReconciliationCapabilityRequest, type PublicationCapabilityRequest,',
          '  type DeliveredBatchSummary, type CapabilityResult,',
          '} from "@sentropic/engram-live/integration";',
          'export const easm2Integration = [',
          '  createLiveFactory, composeFactoryGitExecutor, validateHostHooksIsolationDir,',
          '  buildVerifiedCaptureEvidence, captureForLocalCodeAnalysis, createLocalSchedulingController,',
          '  DEFAULT_FACTORY_SCHEDULER_BUDGETS, DEFAULT_FACTORY_WATCH_BUDGETS, DEFAULT_FACTORY_RECONCILE_BUDGETS,',
          '];',
          'export type Easm2Types = [',
          '  GitPort, ContentPort, CachePort, SchedulingPort, VerifiedCaptureEvidenceDto,',
          '  RefsCapabilityRequest, HistoryDagCapabilityRequest, GithubPrCapabilityRequest, RetentionRequestsCapabilityRequest,',
          '  IndexSnapshotCapabilityRequest, WorkingTreeCapabilityRequest, DiffsCapabilityRequest,',
          '  ReconciliationCapabilityRequest, PublicationCapabilityRequest, DeliveredBatchSummary, CapabilityResult,',
          '];',
          "",
        ].join("\n"),
      );
      const checked = spawnSync(
        process.execPath,
        [
          tscBin,
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--target", "ES2022",
          "--module", "NodeNext",
          "--moduleResolution", "NodeNext",
          "--skipLibCheck", "false",
          "--typeRoots", typeRoots,
          "--types", "node",
          consumerFile,
        ],
        { cwd: packed.installDir, env: tripwireEnv(packed.tripwireBin), encoding: "utf8" },
      );
      expect(checked.status, `strict external consumer tsc failed:\n${checked.stdout}\n${checked.stderr}`).toBe(0);
    } finally {
      rmSync(consumerDir, { recursive: true, force: true });
    }
    recordPhaseMarker(packed.phaseTrace, "all-modules-tsc", packed.pythonMarker);
    expectNoPython(packed.phaseTrace);
    console.info("E-ASM1 packed surface", `files=${packed.packedPaths.length} neutralModules=${neutralSourceModules.length} newlyPacked=${EASM1_NEWLY_PACKED_MODULES.length}`);
  });

  it("the installed tarball executes refs history-dag github-pr and retention-requests offline with the root installation inaccessible", () => {
    // E-ASM2 RED (plan/09 E-ASM2): from the offline packed installation alone,
    // with the root checkout and root node_modules denied via Node's permission
    // model, execute refs, history-dag, github-pr and retention-requests
    // through createLiveFactory(...).runCapability(...) on L0 + P1 fixtures and
    // verify typed canonical fenced batches delivered to a fake sink, zero
    // network/Python/OS-tmpdir writes, and whole-worktree immutability.
    const box = new LiveGitSandbox();
    try {
      const capabilities = detectGitCapabilities(box);
      const format = capabilities.objectFormats.includes("sha1") ? ("sha1" as const) : capabilities.objectFormats[0]!;
      const corpus = buildCorpus(box, format, "files");
      const digestBefore = inventoryDigest(corpus);
      const commonDir = realpathSync(join(corpus.repo, ".git"));
      const mainGitDir = box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
      const detachedGitDir = box.git(corpus.detached, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();

      const isolatedTmp = join(box.root, "isolated-os-tmp");
      mkdirSync(isolatedTmp);
      const fixtureCopy = join(box.root, "live-github-pages.json");
      copyFileSync(join(root, "tests", "fixtures", "live-github-pages.json"), fixtureCopy);

      const probe = String.raw`
        import assert from "node:assert/strict";
        import { spawn } from "node:child_process";
        import { createHash } from "node:crypto";
        import { readdirSync, readFileSync } from "node:fs";
        import { tmpdir } from "node:os";
        import { delimiter, dirname, resolve } from "node:path";
        import * as live from "@sentropic/engram-live";
        import * as contracts from "@sentropic/engram-live/contracts";
        import * as integration from "@sentropic/engram-live/integration";

        const [rootDir, dataPath] = process.argv.slice(2);
        assert.throws(() => readFileSync(resolve(rootDir, "package.json")), { code: "ERR_ACCESS_DENIED" });
        assert.equal(process.permission.has("fs.read", resolve(rootDir, "node_modules")), false);
        globalThis.fetch = () => assert.fail("offline tarball factory execution requested network access");

        const data = JSON.parse(readFileSync(dataPath, "utf8"));
        assert.equal(tmpdir(), data.isolatedTmp, "TMPDIR must point to isolated probe dir");

        const repository = live.observeRepository({
          hostScope: "host:packed-easm2",
          commonDirRealpath: data.commonDir,
          commonDirProjectFingerprint: "ws:packed-easm2",
          oidAlgorithm: data.format,
          worktrees: [
            { worktreePath: data.repo, gitDir: data.mainGitDir, worktreeFingerprint: "wtfp:main", head: { kind: "branch", refName: "refs/heads/main" } },
            { worktreePath: data.detached, gitDir: data.detachedGitDir, worktreeFingerprint: "wtfp:detached", head: { kind: "detached", oid: data.mergeOid } },
          ],
        });
        const mainWt = repository.worktrees[0].identity;
        const declId = integration.deriveDeclarationIdentity({
          hostScope: "host:packed-easm2",
          clone: repository.clone,
          worktree: mainWt,
        });
        const declaration = {
          tenant: "local:packed-easm2",
          principal: "local:packed-principal",
          hostFingerprint: "hostfp:packed",
          identityUncertainty: [],
          declarationId: declId.declarationId,
          cloneId: repository.clone.cloneId,
          worktreeId: mainWt.worktreeId,
          authorizedRoots: [data.corpusRoot],
          liveCapability: "live",
          policyVersion: contracts.POLICY_VERSION,
          declarationRevision: 1,
        };
        const cloneScope = { tenant: declaration.tenant, clone: declaration.cloneId };
        const fencingToken = {
          tokenId: "tok:packed-easm2-001",
          scope: cloneScope,
          epoch: 1,
          epochId: "epoch:packed-001",
          declarationRevision: declaration.declarationRevision,
          projectionIncarnation: "inc:packed-001",
          issuedAt: data.now - 10_000,
          expiresAt: data.now + 60_000,
        };

        const gitProcessPort = {
          async start(launch) {
            const child = spawn(data.gitPath, launch.args, {
              cwd: launch.cwd,
              env: {
                PATH: [dirname(data.gitPath), "/usr/bin", "/bin"].join(delimiter),
                HOME: data.hooksDir,
                XDG_CONFIG_HOME: data.hooksDir,
                TMPDIR: data.isolatedTmp,
                LANG: "C",
                LC_ALL: "C",
                TZ: "UTC",
                GIT_CONFIG_NOSYSTEM: "1",
                GIT_CONFIG_GLOBAL: "/dev/null",
                GIT_ATTR_NOSYSTEM: "1",
                GIT_OPTIONAL_LOCKS: "0",
                GIT_NO_LAZY_FETCH: "1",
                GIT_NO_REPLACE_OBJECTS: "1",
                GIT_TERMINAL_PROMPT: "0",
              },
              shell: false,
              stdio: ["pipe", "pipe", "pipe"],
            });
            const stderr = [];
            child.stderr.on("data", (chunk) => stderr.push(chunk));
            const exit = new Promise((res, rej) => {
              child.once("error", rej);
              child.once("close", (code) => res({ code: code ?? -1, stderr: Buffer.concat(stderr) }));
            });
            child.stdin.on("error", () => undefined);
            const chunks = [];
            let ended = false;
            const wakeups = [];
            child.stdout.pause();
            child.stdout.on("data", (chunk) => {
              chunks.push(chunk);
              child.stdout.pause();
              for (const wake of wakeups.splice(0)) wake();
            });
            const finish = () => { ended = true; for (const wake of wakeups.splice(0)) wake(); };
            child.stdout.once("end", finish);
            child.stdout.once("close", finish);
            child.stdout.once("error", finish);
            const stdout = (async function* () {
              for (;;) {
                while (chunks.length === 0 && !ended) {
                  child.stdout.resume();
                  await new Promise((res) => wakeups.push(res));
                }
                if (chunks.length === 0) return;
                yield chunks.shift();
              }
            })();
            return {
              stdout,
              stdin: {
                async write(chunk) {
                  await new Promise((res, rej) => {
                    const onErr = (err) => rej(err);
                    child.stdin.once("error", onErr);
                    const done = () => { child.stdin.removeListener("error", onErr); res(); };
                    if (child.stdin.write(chunk)) done();
                    else child.stdin.once("drain", done);
                  });
                },
                async close() { await new Promise((res) => child.stdin.end(res)); },
              },
              exit,
              async abort() { child.kill("SIGKILL"); await exit.catch(() => undefined); },
            };
          },
        };

        const rawPrFixture = JSON.parse(readFileSync(data.prFixturePath, "utf8"));
        const ghRepo = { owner: rawPrFixture.repository.owner, repo: rawPrFixture.repository.repo };
        const prPages = rawPrFixture.pages.map((page) => ({
          items: page.items.map((item) => ({
            repositoryOwner: ghRepo.owner,
            repositoryRepo: ghRepo.repo,
            number: item.number,
            state: item.state,
            isDraft: item.isDraft,
            updatedAt: item.updatedAt,
            headOid: { algorithm: "sha1", oid: item.headOid },
            headRef: item.headRef,
            baseOid: { algorithm: "sha1", oid: item.baseOid },
            baseRef: item.baseRef,
          })),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          ...(page.endProof !== undefined ? { endProof: page.endProof } : {}),
        }));
        let pageIdx = 0;
        const githubPr = {
          async fetchPage() {
            const page = prPages[pageIdx++];
            if (!page) return { ok: false, kind: "unavailable", message: "no more fixture pages" };
            return { ok: true, page: { ...page, items: [...page.items] } };
          },
        };

        const histFacts = new Map();
        const histCheckpoints = new Map();
        const histRoots = new Map();
        const historyPersistence = {
          async loadCompletion(q) {
            const cps = [...histCheckpoints.values()].filter((c) => c.cloneId === q.cloneId && c.algorithm === q.algorithm);
            return {
              knownComplete: cps.map((c) => c.oid),
              checkpoints: cps,
              retainedRoots: [...histRoots.values()].filter((r) => r.cloneId === q.cloneId && r.algorithm === q.algorithm),
            };
          },
          async persistCommitFact(f) { histFacts.set(f.oid, f); return { received: true }; },
          async recordCompletion(c) { histCheckpoints.set(c.oid, c); return { received: true }; },
          async recordRetainedRoot(r) { histRoots.set(r.oid, r); return { received: true }; },
        };

        let prCursor = null;
        const prObs = new Map();
        const prJobs = new Map();
        const prPersistence = {
          async loadCursor() { return prCursor; },
          async saveCursor(c) { prCursor = c; },
          async saveObservation(f) { const k = live.observationIdentityKey(f); if (!prObs.has(k)) prObs.set(k, f); },
          async listObservations() { return [...prObs.values()].sort((a, b) => a.number - b.number || a.updatedAt - b.updatedAt); },
          async recordObjectJob(j) { prJobs.set(live.objectJobIdentityKey(j), j); },
          async updateObjectJob(j) { prJobs.set(live.objectJobIdentityKey(j), j); },
          async listObjectJobs() { return [...prJobs.values()]; },
        };

        const retReqs = new Map();
        const retRcpts = new Map();
        const retention = {
          async recordRequest(req) {
            retReqs.set(req.oid, req);
            // Host acquires object and records durable receipt immediately in this offline probe.
            retRcpts.set(req.oid, {
              scope: req.scope,
              algorithm: req.algorithm,
              oid: req.oid,
              receivedAt: data.now + 50,
              backupRef: "backup:" + createHash("sha256").update(req.oid).digest("hex").slice(0, 16),
            });
            return { received: true };
          },
          async recordReceipt(r) { retRcpts.set(r.oid, r); return { received: true }; },
          async loadReceipts(q) {
            return {
              receipts: [...retRcpts.values()].filter((r) =>
                r.scope.tenant === q.scope.tenant && r.scope.clone === q.scope.clone && r.algorithm === q.algorithm),
            };
          },
        };

        const deliveries = [];
        const factSink = {
          async deliver(batch, token) {
            assert.deepEqual(token, fencingToken, "every sink delivery must carry the clone-scoped fencing token");
            assert.deepEqual(contracts.validateFactBatch(batch), { ok: true, errors: [] });
            const encoded = live.encodeFactBatch(batch);
            const decoded = live.decodeFactBatch(encoded.bytes);
            assert.equal(decoded.batchDigest, batch.batchDigest);
            deliveries.push({ batchId: batch.batchId, generationId: batch.generationId, factKinds: batch.facts.map((f) => live.classifyLiveFactKind(f)) });
            return { received: true, batchId: batch.batchId, receiptId: "rcpt:" + deliveries.length };
          },
        };

        const factory = integration.createLiveFactory({
          declaration,
          ports: {
            git: { gitPath: data.gitPath, disabledHooksDir: data.hooksDir, process: gitProcessPort },
            filesystem: { async readFileBytes() { throw new Error("unused"); } },
            clock: { now: () => data.now },
            factSink,
            grammarRuntime: { init() {}, async loadLanguage() { throw new Error("unused"); }, createParser() { throw new Error("unused"); } },
            historyPersistence,
            githubPr,
            prPersistence,
            retention,
          },
        });

        const refsRes = await factory.runCapability("refs", {
          cwd: data.repo,
          defaultBranch: "refs/heads/main",
          generationId: live.formatProducerGenerationId(1),
          fencingToken,
        });
        assert.equal(refsRes.state, "available", JSON.stringify(refsRes));
        assert.equal(refsRes.delivered, true);

        const histRes = await factory.runCapability("history-dag", {
          cwd: data.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: live.formatProducerGenerationId(2),
          fencingToken,
        });
        assert.equal(histRes.state, "available", JSON.stringify(histRes));
        assert.equal(histRes.delivered, true);
        assert.equal(histRes.outcome.state, "complete");

        const prRes = await factory.runCapability("github-pr", {
          repository: ghRepo,
          sweepKind: "full",
          generationId: live.formatProducerGenerationId(3),
          fencingToken,
        });
        assert.equal(prRes.state, "available", JSON.stringify(prRes));
        assert.equal(prRes.delivered, true);
        assert.equal(prRes.outcome.state, "complete");

        const retRes = await factory.runCapability("retention-requests", {
          roots: histRes.outcome.roots,
          generationId: live.formatProducerGenerationId(4),
          fencingToken,
        });
        assert.equal(retRes.state, "available", JSON.stringify(retRes));
        assert.equal(retRes.delivered, true);
        assert.equal(retRes.outcome.state, "complete");

        assert.deepEqual(readdirSync(tmpdir()), [], "offline tarball execution must create nothing under OS tmpdir");
        console.log(JSON.stringify({
          availableCapabilities: factory.describeCapabilities().filter((c) => c.state === "available").map((c) => c.capability),
          refsTracked: refsRes.trackedRefs.length,
          refsRoots: refsRes.roots.length,
          commitsExtracted: histRes.outcome.stats.commitsExtracted,
          prObservations: prRes.outcome.observations.length,
          retentionReceipts: retRes.receipts.length,
          deliveriesCount: deliveries.length,
          factKinds: [...new Set(deliveries.flatMap((d) => d.factKinds))].sort(),
          tmpEntries: readdirSync(tmpdir()),
        }));
      `;

      const probePath = join(packed.installDir, "factory-history-probe.mjs");
      const dataPath = join(box.root, "factory-history-input.json");
      writeFileShim(probePath, probe);
      writeFileSync(
        dataPath,
        JSON.stringify({
          format,
          corpusRoot: corpus.root,
          repo: corpus.repo,
          detached: corpus.detached,
          commonDir,
          mainGitDir,
          detachedGitDir,
          mergeOid: corpus.commits.merge,
          gitPath: box.trace.executable,
          hooksDir: join(box.root, "disabled-hooks"),
          isolatedTmp,
          prFixturePath: fixtureCopy,
          now: 1_700_000_000_000 + 5 * 86_400_000,
        }),
      );

      const output = runProtectedPhase(
        process.execPath,
        [
          resolveProductionProbePermissionFlag(),
          "--allow-fs-read=" + packed.tmpRoot,
          "--allow-fs-read=" + box.root,
          "--allow-child-process",
          "factory-history-probe.mjs",
          root,
          dataPath,
        ],
        {
          cwd: packed.installDir,
          env: {
            ...tripwireEnv(packed.tripwireBin),
            NODE_PATH: "",
            TMPDIR: isolatedTmp,
            TMP: isolatedTmp,
            TEMP: isolatedTmp,
          },
        },
      );
      recordPhaseMarker(packed.phaseTrace, "factory-history", packed.pythonMarker);
      expectNoPython(packed.phaseTrace);

      const report = JSON.parse(output) as {
        availableCapabilities: string[];
        refsTracked: number;
        refsRoots: number;
        commitsExtracted: number;
        prObservations: number;
        retentionReceipts: number;
        deliveriesCount: number;
        factKinds: string[];
        tmpEntries: string[];
      };
      expect(report.availableCapabilities).toEqual([
        "refs",
        "history-dag",
        "github-pr",
        "index-snapshot",
        "working-tree",
        "diffs",
        "code-analysis",
        "retention-requests",
        "reconciliation",
        "publication",
      ]);
      expect(report.refsTracked).toBeGreaterThanOrEqual(4);
      expect(report.refsRoots).toBeGreaterThanOrEqual(2);
      expect(report.commitsExtracted).toBeGreaterThanOrEqual(6);
      expect(report.prObservations).toBe(36);
      expect(report.retentionReceipts).toBeGreaterThanOrEqual(2);
      expect(report.deliveriesCount).toBeGreaterThanOrEqual(4);
      expect(report.factKinds).toEqual(
        expect.arrayContaining([
          "ref-observation",
          "ref-state",
          "commit",
          "changed-file",
          "pr-observation",
          "retention-receipt",
          "progress",
          "coverage",
        ]),
      );
      expect(report.tmpEntries).toEqual([]);
      expect(readdirSync(isolatedTmp)).toEqual([]);
      expect(inventoryDigest(corpus)).toBe(digestBefore);
    } finally {
      box.dispose();
    }
  });

  it("each of the ten capabilities executes from the installed tarball and none is reported unavailable when its ports are present", () => {
    // E-ASM3 RED (plan/09 E-ASM3): from the offline installed tarball alone,
    // with the root checkout and root node_modules denied via Node's permission
    // model, execute all ten advertised capabilities through
    // createLiveFactory(...).runCapability(...) with injected host ports and
    // verify none reports unavailable, zero plaintext leaks, zero Python/network
    // use, zero OS tmpdir writes, and whole-worktree immutability.
    const box = new LiveGitSandbox();
    try {
      const capabilities = detectGitCapabilities(box);
      const format = capabilities.objectFormats.includes("sha1") ? ("sha1" as const) : capabilities.objectFormats[0]!;
      const corpus = buildCorpus(box, format, "files");
      const digestBefore = inventoryDigest(corpus);
      const commonDir = realpathSync(join(corpus.repo, ".git"));
      const mainGitDir = box.git(corpus.repo, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();
      const detachedGitDir = box.git(corpus.detached, ["rev-parse", "--absolute-git-dir"], undefined, "oracle").toString().trim();

      // Separate benign worktree inside box.root for local index/working-tree/code-analysis
      // so the L0 tripwire corpus stays 100% untouched.
      const localRepo = box.init(join(box.root, "local-worktree"));
      writeFileSync(join(localRepo, "app.ts"), "export function baseFn() { return 1; }\n");
      box.git(localRepo, ["add", "--", "app.ts"]);
      box.git(localRepo, ["commit", "-q", "-m", "base"]);
      writeFileSync(join(localRepo, "app.ts"), "export function stagedFn() { return 2; }\n");
      box.git(localRepo, ["add", "--", "app.ts"]);
      const localWorkingCode = "export function workingFn() { return 3; }\n";
      writeFileSync(join(localRepo, "app.ts"), localWorkingCode);
      const localDigestBefore = inventoryDigest({ root: localRepo });

      const isolatedTmp = join(box.root, "isolated-os-tmp");
      mkdirSync(isolatedTmp);
      const fixtureCopy = join(box.root, "live-github-pages.json");
      copyFileSync(join(root, "tests", "fixtures", "live-github-pages.json"), fixtureCopy);

      const probe = String.raw`
        import assert from "node:assert/strict";
        import { spawn } from "node:child_process";
        import { createHash } from "node:crypto";
        import { readdirSync, readFileSync } from "node:fs";
        import { tmpdir } from "node:os";
        import { delimiter, dirname, resolve } from "node:path";
        import runtime from "./host-runtime/web-tree-sitter.cjs";
        import * as live from "@sentropic/engram-live";
        import * as contracts from "@sentropic/engram-live/contracts";
        import * as integration from "@sentropic/engram-live/integration";

        const [rootDir, dataPath] = process.argv.slice(2);
        assert.throws(() => readFileSync(resolve(rootDir, "package.json")), { code: "ERR_ACCESS_DENIED" });
        assert.equal(process.permission.has("fs.read", resolve(rootDir, "node_modules")), false);
        globalThis.fetch = () => assert.fail("offline tarball execution requested network access");

        const data = JSON.parse(readFileSync(dataPath, "utf8"));
        assert.equal(tmpdir(), data.isolatedTmp, "TMPDIR must point to isolated probe dir");

        const enc = (t) => new TextEncoder().encode(t);
        const sha256 = (t) => createHash("sha256").update(t, "utf8").digest("hex");

        const described = contracts.describeCapabilities();
        assert.equal(contracts.CAPABILITY_IDS.length, 10, "capability count must be exactly ten");
        assert.equal(described.length, 10, "describeCapabilities must describe all ten capabilities");
        assert.deepEqual(
          described.filter((c) => c.state === "available").map((c) => c.capability),
          [...contracts.CAPABILITY_IDS],
          "all ten capabilities must be reported available in contracts",
        );

        const repository = live.observeRepository({
          hostScope: "host:packed-easm3",
          commonDirRealpath: data.commonDir,
          commonDirProjectFingerprint: "ws:packed-easm3",
          oidAlgorithm: data.format,
          worktrees: [
            { worktreePath: data.repo, gitDir: data.mainGitDir, worktreeFingerprint: "wtfp:main", head: { kind: "branch", refName: "refs/heads/main" } },
            { worktreePath: data.detached, gitDir: data.detachedGitDir, worktreeFingerprint: "wtfp:detached", head: { kind: "detached", oid: data.mergeOid } },
          ],
        });
        const mainWt = repository.worktrees[0].identity;
        const declId = integration.deriveDeclarationIdentity({
          hostScope: "host:packed-easm3",
          clone: repository.clone,
          worktree: mainWt,
        });
        const declaration = {
          tenant: "local:packed-easm3",
          principal: "local:packed-principal",
          hostFingerprint: "hostfp:packed-easm3",
          identityUncertainty: [],
          declarationId: declId.declarationId,
          cloneId: repository.clone.cloneId,
          worktreeId: mainWt.worktreeId,
          authorizedRoots: [data.corpusRoot, data.localRepo],
          liveCapability: "live",
          policyVersion: contracts.POLICY_VERSION,
          declarationRevision: 1,
        };
        const cloneScope = { tenant: declaration.tenant, clone: declaration.cloneId };
        const worktreeScope = { tenant: declaration.tenant, clone: declaration.cloneId, worktree: declaration.worktreeId };
        const cloneToken = {
          tokenId: "tok:packed-clone-001",
          scope: cloneScope,
          epoch: 1,
          epochId: "epoch:packed-001",
          declarationRevision: declaration.declarationRevision,
          projectionIncarnation: "inc:packed-easm3-001",
          issuedAt: data.now - 10_000,
          expiresAt: data.now + 60_000,
        };
        const worktreeToken = {
          tokenId: "tok:packed-wt-001",
          scope: worktreeScope,
          epoch: 1,
          epochId: "epoch:packed-wt-001",
          declarationRevision: declaration.declarationRevision,
          projectionIncarnation: "inc:packed-easm3-001",
          issuedAt: data.now - 10_000,
          expiresAt: data.now + 60_000,
        };

        // Host-injected clock with schedule().
        let nowMs = data.now;
        const timers = new Set();
        const clock = {
          now: () => nowMs,
          schedule(ms, cb) {
            const entry = { at: nowMs + ms, cb };
            timers.add(entry);
            return () => timers.delete(entry);
          },
        };

        // Host-injected streaming GitProcessPort.
        const gitProcessPort = {
          async start(launch) {
            const child = spawn(data.gitPath, launch.args, {
              cwd: launch.cwd,
              env: {
                PATH: [dirname(data.gitPath), "/usr/bin", "/bin"].join(delimiter),
                HOME: data.hooksDir,
                XDG_CONFIG_HOME: data.hooksDir,
                TMPDIR: data.isolatedTmp,
                LANG: "C",
                LC_ALL: "C",
                TZ: "UTC",
                GIT_CONFIG_NOSYSTEM: "1",
                GIT_CONFIG_GLOBAL: "/dev/null",
                GIT_ATTR_NOSYSTEM: "1",
                GIT_OPTIONAL_LOCKS: "0",
                GIT_NO_LAZY_FETCH: "1",
                GIT_NO_REPLACE_OBJECTS: "1",
                GIT_TERMINAL_PROMPT: "0",
              },
              shell: false,
              stdio: ["pipe", "pipe", "pipe"],
            });
            const stderr = [];
            child.stderr.on("data", (chunk) => stderr.push(chunk));
            const exit = new Promise((res, rej) => {
              child.once("error", rej);
              child.once("close", (code) => res({ code: code ?? -1, stderr: Buffer.concat(stderr) }));
            });
            child.stdin.on("error", () => undefined);
            const chunks = [];
            let ended = false;
            const wakeups = [];
            child.stdout.pause();
            child.stdout.on("data", (chunk) => {
              chunks.push(chunk);
              child.stdout.pause();
              for (const wake of wakeups.splice(0)) wake();
            });
            const finish = () => { ended = true; for (const wake of wakeups.splice(0)) wake(); };
            child.stdout.once("end", finish);
            child.stdout.once("close", finish);
            child.stdout.once("error", finish);
            const stdout = (async function* () {
              for (;;) {
                while (chunks.length === 0 && !ended) {
                  child.stdout.resume();
                  await new Promise((res) => wakeups.push(res));
                }
                if (chunks.length === 0) return;
                yield chunks.shift();
              }
            })();
            return {
              stdout,
              stdin: {
                async write(chunk) {
                  await new Promise((res, rej) => {
                    const onErr = (err) => rej(err);
                    child.stdin.once("error", onErr);
                    const done = () => { child.stdin.removeListener("error", onErr); res(); };
                    if (child.stdin.write(chunk)) done();
                    else child.stdin.once("drain", done);
                  });
                },
                async close() { await new Promise((res) => child.stdin.end(res)); },
              },
              exit,
              async abort() { child.kill("SIGKILL"); await exit.catch(() => undefined); },
            };
          },
        };

        // Host-injected GitHub PR transport & persistence.
        const rawPrFixture = JSON.parse(readFileSync(data.prFixturePath, "utf8"));
        const ghRepo = { owner: rawPrFixture.repository.owner, repo: rawPrFixture.repository.repo };
        const prPages = rawPrFixture.pages.map((page) => ({
          items: page.items.map((item) => ({
            repositoryOwner: ghRepo.owner,
            repositoryRepo: ghRepo.repo,
            number: item.number,
            state: item.state,
            isDraft: item.isDraft,
            updatedAt: item.updatedAt,
            headOid: { algorithm: "sha1", oid: item.headOid },
            headRef: item.headRef,
            baseOid: { algorithm: "sha1", oid: item.baseOid },
            baseRef: item.baseRef,
          })),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          ...(page.endProof !== undefined ? { endProof: page.endProof } : {}),
        }));
        let pageIdx = 0;
        const githubPr = {
          async fetchPage() {
            const page = prPages[pageIdx++];
            if (!page) return { ok: false, kind: "unavailable", message: "no more pages" };
            return { ok: true, page: { ...page, items: [...page.items] } };
          },
        };
        let prCursor = null;
        const prObs = new Map();
        const prJobs = new Map();
        const prPersistence = {
          async loadCursor() { return prCursor; },
          async saveCursor(c) { prCursor = c; },
          async saveObservation(f) { const k = live.observationIdentityKey(f); if (!prObs.has(k)) prObs.set(k, f); },
          async listObservations() { return [...prObs.values()]; },
          async recordObjectJob(j) { prJobs.set(live.objectJobIdentityKey(j), j); },
          async updateObjectJob(j) { prJobs.set(live.objectJobIdentityKey(j), j); },
          async listObjectJobs() { return [...prJobs.values()]; },
        };

        // History persistence & retention ports.
        const histFacts = new Map();
        const histCps = new Map();
        const histRoots = new Map();
        const historyPersistence = {
          async loadCompletion(q) {
            const cps = [...histCps.values()].filter((c) => c.cloneId === q.cloneId && c.algorithm === q.algorithm);
            return {
              knownComplete: cps.map((c) => c.oid),
              checkpoints: cps,
              retainedRoots: [...histRoots.values()].filter((r) => r.cloneId === q.cloneId && r.algorithm === q.algorithm),
            };
          },
          async persistCommitFact(f) { histFacts.set(f.oid, f); return { received: true }; },
          async recordCompletion(c) { histCps.set(c.oid, c); return { received: true }; },
          async recordRetainedRoot(r) { histRoots.set(r.oid, r); return { received: true }; },
        };
        const retRcpts = new Map();
        const retention = {
          async recordRequest(req) {
            retRcpts.set(req.oid, {
              scope: req.scope,
              algorithm: req.algorithm,
              oid: req.oid,
              receivedAt: nowMs + 50,
              backupRef: "backup:" + sha256(req.oid).slice(0, 16),
            });
            return { received: true };
          },
          async recordReceipt(r) { retRcpts.set(r.oid, r); return { received: true }; },
          async loadReceipts(q) {
            return {
              receipts: [...retRcpts.values()].filter((r) => r.scope.tenant === q.scope.tenant && r.scope.clone === q.scope.clone && r.algorithm === q.algorithm),
            };
          },
        };

        // L4b content protection, key provider and latest-only store.
        const protection = {
          async protect(plaintext) {
            return {
              state: "sealed",
              algorithm: "fake-seal/1",
              keyRef: "packed-key-001",
              ciphertext: enc("sealed:" + sha256(new TextDecoder().decode(plaintext))),
            };
          },
        };
        const keyProvider = {
          async currentKeyRef() { return { state: "available", keyRef: "packed-key-001" }; },
        };
        const latestMap = new Map();
        const latestSnapshots = {
          async loadLatest(q) {
            return latestMap.get([q.scope.tenant, q.scope.clone, q.scope.worktree ?? "", q.worktreeId, q.kind, q.diffKind].join("|")) ?? null;
          },
          async replaceLatest(snap, expectedSupersededId) {
            const key = [snap.scope.tenant, snap.scope.clone, snap.scope.worktree ?? "", snap.worktreeId, snap.kind, snap.diffKind].join("|");
            const prev = latestMap.get(key) ?? null;
            if ((prev?.snapshotId ?? null) !== expectedSupersededId) throw new Error("conflict");
            latestMap.set(key, snap);
            return { received: true, retiredPrevious: prev !== null, revokedDecryptability: true, blockedStaleWork: true };
          },
          async purgePrivate() {
            latestMap.clear();
            return { purgedPrivate: true, blockedOldWork: true, revokedDecryptability: true };
          },
        };

        // L5 analysis cache + grammar runtime + filesystem.
        const cacheEntries = new Map();
        const cachePort = {
          authorize() {},
          async load(k) { return cacheEntries.get(k) ?? null; },
          async store(k, v) { cacheEntries.set(k, v); },
        };
        const grammarRuntime = {
          init: () => runtime.Parser.init(),
          loadLanguage: (bytes) => runtime.Language.load(bytes),
          createParser(grammar) {
            const parser = new runtime.Parser();
            parser.setLanguage(grammar);
            return parser;
          },
        };

        // L6b watch, writer authority, marker store, scan, durability.
        let watchListener;
        const watchPort = {
          async start() {},
          async stop() {},
          onSignal(listener) { watchListener = listener; return () => { watchListener = undefined; }; },
        };
        const incarnationId = "inc:packed-easm3-001";
        let schedEpoch = 1;
        let activeSchedToken;
        const revokedIds = new Set();
        const writer = {
          async acquire(req) {
            schedEpoch = Math.max(schedEpoch + 1, req.minEpoch);
            activeSchedToken = {
              tokenId: "tok:packed-sched:" + schedEpoch,
              scope: worktreeScope,
              epoch: schedEpoch,
              epochId: "epoch:" + schedEpoch,
              declarationRevision: req.declarationRevision,
              projectionIncarnation: req.projectionIncarnation,
              issuedAt: nowMs,
              expiresAt: nowMs + 60_000,
            };
            return activeSchedToken;
          },
          async renew(tok) { return tok; },
          validate(tok) { return !!tok && !revokedIds.has(tok.tokenId) && tok.projectionIncarnation === incarnationId && nowMs < tok.expiresAt; },
          revoke(tok) { revokedIds.add(tok.tokenId); },
          async release(tok) { revokedIds.add(tok.tokenId); },
        };
        const srcFiles = new Map([["app.ts", data.localWorkingCode]]);
        const projFiles = new Map();
        const markers = new Map();
        const pubGens = new Set();
        const progMap = new Map();
        const vector = () => ({
          refsFingerprint: sha256("refs:main"),
          headOid: "a".repeat(40),
          indexFingerprint: sha256("idx:app.ts"),
          pathMembershipFingerprint: sha256("paths:app.ts"),
          contentFingerprint: sha256(data.localWorkingCode),
          configAttributesFingerprint: sha256("cfg:1"),
          lockStateValid: true,
        });
        const markerStore = {
          get: (k) => markers.get(k),
          set: (k, v) => { markers.set(k, v); },
          delete: (k) => { markers.delete(k); },
          incarnation: () => incarnationId,
          hasGeneration: (inc, g) => inc === incarnationId && pubGens.has(g),
        };
        const scan = {
          async discoverPage(cursor) {
            if (cursor !== undefined) return { entries: [], deletedPaths: [], nextCursor: undefined, done: true, complete: true };
            return {
              entries: [{ path: "app.ts", statSize: Buffer.byteLength(data.localWorkingCode), contentFingerprint: sha256(data.localWorkingCode) }],
              deletedPaths: [],
              nextCursor: undefined,
              done: true,
              complete: true,
            };
          },
          async collectPaths(paths) {
            for (const p of paths) projFiles.set(p, srcFiles.get(p));
            return { collected: [...paths], complete: true, receiptId: "collect:1" };
          },
          async repairRelations() { return { complete: true, receiptId: "repair:1" }; },
          async validateSource() {
            const axes = {};
            for (const a of contracts.COVERAGE_AXES) axes[a] = { complete: true };
            return { valid: true, projectionMatches: projFiles.get("app.ts") === data.localWorkingCode, sourceVector: vector(), validatedAt: nowMs, axes };
          },
          async publishGeneration(req) {
            pubGens.add(req.generationId);
            return { published: true, generationId: req.generationId, incarnation: incarnationId, receiptId: "pub:1" };
          },
          currentSourceVector: vector,
          pathFingerprint: (p) => sha256(srcFiles.get(p) ?? ""),
        };
        const durability = {
          sleep: (ms) => new Promise((r) => clock.schedule(ms, r)),
          park() {},
          readProgress: (item) => progMap.get(item.id),
          writeProgress: (item, p) => progMap.set(item.id, { ...p, digest: item.idempotencyDigest, scopeId: item.scopeId }),
          backlogSize: () => 0,
        };

        const deliveries = [];
        const factSink = {
          async deliver(batch) {
            assert.deepEqual(contracts.validateFactBatch(batch), { ok: true, errors: [] });
            const encoded = live.encodeFactBatch(batch);
            const decoded = live.decodeFactBatch(encoded.bytes);
            assert.equal(decoded.batchDigest, batch.batchDigest);
            deliveries.push({ batchId: batch.batchId, generationId: batch.generationId, facts: batch.facts.length });
            return { received: true, batchId: batch.batchId, receiptId: "rcpt:" + deliveries.length, retiredSuperseded: true, revokedDecryptability: true };
          },
        };

        const factory = integration.createLiveFactory({
          declaration,
          ports: {
            git: { gitPath: data.gitPath, disabledHooksDir: data.hooksDir, process: gitProcessPort },
            filesystem: { async readFileBytes(p) { return new Uint8Array(readFileSync(p)); } },
            clock,
            content: { protection, keyProvider, latestSnapshots },
            factSink,
            cache: cachePort,
            grammarRuntime,
            historyPersistence,
            githubPr,
            prPersistence,
            retention,
            watch: watchPort,
            scheduling: {
              writer,
              markerStore,
              scan,
              pollRefs: async () => [{ ref: "refs/heads/main", oid: "a".repeat(40) }],
              durability,
            },
          },
        });

        const results = {};
        const record = (cap, res) => {
          assert.equal(res.capability, cap);
          assert.equal(res.state, "available", cap + " must be available, got: " + JSON.stringify(res));
          assert.equal(res.delivered, true, cap + " must report delivered: true");
          results[cap] = { state: res.state, delivered: res.delivered };
        };

        // 1. refs
        record("refs", await factory.runCapability("refs", {
          cwd: data.repo,
          defaultBranch: "refs/heads/main",
          generationId: live.formatProducerGenerationId(1),
          fencingToken: cloneToken,
        }));
        // 2. history-dag
        const histRes = await factory.runCapability("history-dag", {
          cwd: data.repo,
          repository,
          defaultBranch: "refs/heads/main",
          generationId: live.formatProducerGenerationId(2),
          fencingToken: cloneToken,
        });
        record("history-dag", histRes);
        // 3. github-pr
        record("github-pr", await factory.runCapability("github-pr", {
          repository: ghRepo,
          sweepKind: "full",
          generationId: live.formatProducerGenerationId(3),
          fencingToken: cloneToken,
        }));
        // 4. retention-requests
        record("retention-requests", await factory.runCapability("retention-requests", {
          roots: histRes.outcome.roots,
          generationId: live.formatProducerGenerationId(4),
          fencingToken: cloneToken,
        }));
        // 5. index-snapshot
        record("index-snapshot", await factory.runCapability("index-snapshot", {
          cwd: data.localRepo,
          generationId: live.formatProducerGenerationId(5),
          fencingToken: worktreeToken,
        }));
        // 6. working-tree
        const wtRes = await factory.runCapability("working-tree", {
          cwd: data.localRepo,
          generationId: live.formatProducerGenerationId(6),
          fencingToken: worktreeToken,
        });
        record("working-tree", wtRes);
        // 7. diffs
        record("diffs", await factory.runCapability("diffs", {
          kind: "staged",
          base: { label: "HEAD", oid: "1".repeat(40) },
          tip: { label: "index", oid: "2".repeat(40) },
          baseEntries: [{ path: enc("app.ts"), mode: "100644", oid: "3".repeat(40), stage: 0, kind: "file", size: 32, isBinary: false }],
          tipEntries: [{ path: enc("app.ts"), mode: "100644", oid: "4".repeat(40), stage: 0, kind: "file", size: 36, isBinary: false }],
          generationId: live.formatProducerGenerationId(7),
          fencingToken: worktreeToken,
        }));
        // 8. code-analysis (local stable verified capture reaching complete!)
        const codeRes = await factory.runCapability("code-analysis", {
          input: {
            scope: worktreeScope,
            language: "typescript",
            path: "app.ts",
            content: data.localWorkingCode,
            treeOid: null,
            snapshotId: wtRes.snapshot.snapshotId,
            snapshotKind: "working-tree",
            worktreeId: declaration.worktreeId,
            configHash: sha256("tsconfig:v1"),
            dependencyHash: sha256("deps:v1"),
            historicalBounds: null,
          },
          objects: { async loadObject() { return null; }, async loadBlob() { return null; } },
          capture: { cwd: data.localRepo, snapshotKind: "working-tree" },
        });
        record("code-analysis", codeRes);
        assert.equal(codeRes.analysis.state, "complete", "local analysis with stable capture must reach complete");
        // 9. reconciliation
        const recRes = await factory.runCapability("reconciliation", {
          generationId: live.formatProducerGenerationId(8),
          action: "converge",
        });
        record("reconciliation", recRes);
        assert.equal(recRes.converged, true);
        // 10. publication
        const pubRes = await factory.runCapability("publication", {
          generationId: live.formatProducerGenerationId(9),
          fencingToken: activeSchedToken,
          expectedIncarnation: incarnationId,
        });
        record("publication", pubRes);
        assert.equal(pubRes.published, true);

        await factory.runCapability("reconciliation", {
          generationId: live.formatProducerGenerationId(10),
          action: "shutdown",
        });

        assert.equal(Object.keys(results).length, 10);
        assert.deepEqual(readdirSync(tmpdir()), [], "offline tarball execution must create nothing under OS tmpdir");
        console.log(JSON.stringify({
          nodeVersion: process.version,
          capabilityCount: Object.keys(results).length,
          capabilities: results,
          codeAnalysisState: codeRes.analysis.state,
          deliveriesCount: deliveries.length,
          tmpEntries: readdirSync(tmpdir()),
        }));
      `;

      const probePath = join(packed.installDir, "all-ten-capabilities-probe.mjs");
      const dataPath = join(box.root, "all-ten-capabilities-input.json");
      writeFileShim(probePath, probe);
      writeFileSync(
        dataPath,
        JSON.stringify({
          format,
          corpusRoot: corpus.root,
          repo: corpus.repo,
          detached: corpus.detached,
          localRepo,
          localWorkingCode,
          commonDir,
          mainGitDir,
          detachedGitDir,
          mergeOid: corpus.commits.merge,
          gitPath: box.trace.executable,
          hooksDir: join(box.root, "disabled-hooks"),
          isolatedTmp,
          prFixturePath: fixtureCopy,
          now: 1_700_000_000_000 + 5 * 86_400_000,
        }),
      );

      const output = runProtectedPhase(
        process.execPath,
        [
          resolveProductionProbePermissionFlag(),
          "--allow-fs-read=" + packed.tmpRoot,
          "--allow-fs-read=" + box.root,
          "--allow-fs-read=/proc/self/fd",
          "--allow-fs-write=" + isolatedTmp,
          "--allow-child-process",
          "all-ten-capabilities-probe.mjs",
          root,
          dataPath,
        ],
        {
          cwd: packed.installDir,
          env: {
            ...tripwireEnv(packed.tripwireBin),
            NODE_PATH: "",
            TMPDIR: isolatedTmp,
            TMP: isolatedTmp,
            TEMP: isolatedTmp,
          },
        },
      );
      recordPhaseMarker(packed.phaseTrace, "all-ten-capabilities", packed.pythonMarker);
      expectNoPython(packed.phaseTrace);

      const report = JSON.parse(output) as {
        nodeVersion: string;
        capabilityCount: number;
        capabilities: Record<string, { state: string; delivered: boolean }>;
        codeAnalysisState: string;
        deliveriesCount: number;
        tmpEntries: string[];
      };
      expect(report.capabilityCount).toBe(10);
      for (const capability of [
        "refs",
        "history-dag",
        "github-pr",
        "index-snapshot",
        "working-tree",
        "diffs",
        "code-analysis",
        "retention-requests",
        "reconciliation",
        "publication",
      ]) {
        expect(report.capabilities[capability], capability).toEqual({ state: "available", delivered: true });
      }
      expect(report.codeAnalysisState).toBe("complete");
      expect(report.deliveriesCount).toBeGreaterThanOrEqual(9);
      expect(report.tmpEntries).toEqual([]);
      expect(readdirSync(isolatedTmp)).toEqual([]);
      expect(inventoryDigest(corpus)).toBe(digestBefore);
      expect(inventoryDigest({ root: localRepo })).toBe(localDigestBefore);

      const tarballBytes = readFileSync(packed.tarball);
      const tarballSha512 = "sha512-" + createHash("sha512").update(tarballBytes).digest("base64");
      const tarballSha256 = createHash("sha256").update(tarballBytes).digest("hex");
      console.info(
        "E-ASM3 installed tarball",
        packed.tarball.split("/").at(-1),
        `integrity=${tarballSha512}`,
        `sha256=${tarballSha256}`,
        `node=${report.nodeVersion}`,
        `capabilities=${report.capabilityCount}`,
        "python=0 network=0",
      );
    } finally {
      box.dispose();
    }
  });
});

describe("L5-P2a closed core of the reused extraction", () => {
  it("the closed core of the reused extraction imports only node builtins and modules of its enumerated set and builds no loader", () => {
    // L5-P2a RED (plan/09 L5-P): the closure audit of the build walks the
    // static value-import closure from src/extract-core.ts and refuses any
    // edge outside the enumerated set. It fails on the receiving base: no
    // closed core exists there.
    let output: string;
    try {
      output = execFileSync(process.execPath, [buildScript, "--audit-only"], { cwd: root, encoding: "utf8" });
    } catch (error) {
      const detail = error instanceof Error ? (error as { stderr?: unknown }).stderr ?? error.message : String(error);
      throw new Error(`closed-core closure audit failed: ${String(detail)}`);
    }
    expect(output, "closure audit names the closed core").toContain("closed core");
  });

  it("the closure audit rejects an injected bare module a loader reference and an edge that leaves the enumerated set", () => {
    // L5-P2a GUARD (plan/09 L5-P): three mutations on an isolated copy of
    // the core, each rejected by the audit. The copy is read from an
    // isolated tree (never from the repository), so a rejected mutation
    // cannot touch the delivered sources.
    const closedSet = ["extract-core.ts", "live-cache-keys.ts", "node-id.ts", "relation-remap.ts"];
    const neutralModules = ["analysis-cache.ts", "code-analysis.ts", "comparisons.ts", "parse-adapter.ts", "symbol-history.ts"];
    const readCore = (): string => readFileSync(join(root, "src", "extract-core.ts"), "utf8");
    const trees: string[] = [];
    const isolatedTree = (mutatedCore: string | null): string => {
      const tree = mkdtempSync(join(tmpdir(), "live-closed-core-"));
      trees.push(tree);
      mkdirSync(join(tree, "src"), { recursive: true });
      mkdirSync(join(tree, "engram-live"), { recursive: true });
      for (const name of [...closedSet, "extract.ts", "cache.ts"]) {
        copyFileSync(join(root, "src", name), join(tree, "src", name));
      }
      for (const name of neutralModules) {
        copyFileSync(join(liveRoot, name), join(tree, "engram-live", name));
      }
      if (mutatedCore !== null) writeFileSync(join(tree, "src", "extract-core.ts"), mutatedCore);
      return tree;
    };
    const auditTree = (tree: string): { status: number; output: string } => {
      try {
        const out = execFileSync(process.execPath, [buildScript, "--audit-only"], {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, ENGRAM_BUILD_LIVE_ROOT: tree },
        });
        return { status: 0, output: out };
      } catch (error) {
        const detail = error instanceof Error ? (error as { stderr?: unknown }).stderr ?? error.message : String(error);
        return { status: 1, output: String(detail) };
      }
    };
    try {
      const valid = auditTree(isolatedTree(null));
      expect(valid.status, `valid closed core passes the audit: ${valid.output}`).toBe(0);
      const base = readCore();
      const mutations: Array<[string, string]> = [
        ["bare module", `${base}\nimport graphologyDefault from "graphology";\nexport const leakedGraphology = graphologyDefault;\n`],
        ["loader reference", `${base}\nimport { createRequire } from "node:module";\nexport const leakedRequire = createRequire;\n`],
        ["edge outside the enumerated set", `${base}\nimport { sanitizeLabel as movedSanitize } from "./security.js";\nexport const movedLabel = movedSanitize;\n`],
        ["default bare-module import", `${base}\nimport pkg from "evil-pkg";\nexport const leakedPkg = pkg;\n`],
        ["default import starting with t", `${base}\nimport ts from "typescript";\nexport const leakedTs = ts;\n`],
        ["default relative import", `${base}\nimport parse from "./security.js";\nexport const leakedParse = parse;\n`],
        ["mixed default and named import", `${base}\nimport def, { sanitizeLabel as namedSanitize } from "./security.js";\nexport const leakedMixed = [def, namedSanitize];\n`],
        ["export-star re-export", `${base}\nexport * from "./security.js";\n`],
        ["named re-export", `${base}\nexport { sanitizeLabel } from "./security.js";\n`],
      ];
      for (const [label, mutated] of mutations) {
        const result = auditTree(isolatedTree(mutated));
        expect(result.status, `closure audit rejects an injected ${label}: ${result.output}`).not.toBe(0);
      }
    } finally {
      for (const tree of trees) rmSync(tree, { recursive: true, force: true });
    }
  });
});
