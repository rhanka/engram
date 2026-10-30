/**
 * Isolated tarball acceptance for the public memory substrate entry
 * (amendment §5, binding §10.3; design note class A, M2/M10).
 *
 * - Node only, no new dependency. Existing TypeScript/Vitest are test tools;
 *   local pack and locked offline ci never contact the registry.
 * - `npm` means `process.env.SUBSTRATE_NPM_BIN ?? "npm"` and must be >= 10
 *   (the root manifest uses `npm:` alias overrides, which older npm cannot
 *   parse for `pack`). In this checkout the gate exports SUBSTRATE_NPM_BIN
 *   to a modern npm; elsewhere the default applies.
 * - Acceptance and closure checks run against the packed tarball installed
 *   in an isolated consumer directory: the two public values are imported
 *   from the installed PUBLIC SPECIFIER. The semantic corpus, exact type
 *   inventory and strict compilation run in that consumer.
 * - The guard walks every published entry and every statically resolved
 *   dependency of the installed consumer. Fatal findings (native database
 *   drivers, `.node` addons, `binding.gyp`/lifecycle scripts, cluster-mesh
 *   references, gypfile:true and unresolved computed imports) fail the run
 *   for every entry, including CommonJS exports and executable entries.
 * - The inline backend below is ACCEPTANCE TEST COLLATERAL, not the C6
 *   neutral-contract asset and not a production driver: it implements the
 *   vendored neutral contract for this acceptance only. M5 stays
 *   `source-gap` (cluster-mesh asset unavailable at a pinned revision).
 * - The runner removes its tarball and consumer directories even on failure.
 *
 * Wired as `npm run test:substrate-tarball`, executed by
 * `tests/memory-substrate-tarball.test.ts`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { builtinModules } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyInstalledSemantics, verifyInstalledTypes, verifyLockedClosure } from "./substrate-installed-acceptance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
const PACKAGE_NAME = "@sentropic/engram";
const EXPECTED_VERSION = "0.22.1";
const EXPECTED_VALUES = ["createMemoryPortV2", "openModuleStorageCanonicalMemoryStoreV1"];

/** Known native database drivers: any static edge to one fails the run. */
const NATIVE_PACKAGE_NAMES = new Set(["better-sqlite3", "fs-ext", "pg-native", "sqlite3"]);
const LIFECYCLE_SCRIPTS = new Set(["install", "postinstall", "preinstall"]);
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => name.replace(/^node:/, ""))]);

function packageRoot(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Parse real syntax: string-prefixed expressions are computed too. */
export function staticEdges(content) {
  const ts = createRequire(import.meta.url)("typescript");
  const source = ts.createSourceFile("closure.js", content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const edges = [];
  const add = (target, condition) => edges.push({
    specifier: target && ts.isStringLiteralLike(target) ? target.text : target?.getText(source) ?? "(computed-target)",
    dynamic: !target || !ts.isStringLiteralLike(target),
    condition,
  });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier, "import");
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], "import");
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require") add(node.arguments[0], "require");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function nearestPackageDir(file, stopAt) {
  let dir = dirname(file);
  while (dir.startsWith(stopAt) && dir !== stopAt) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Walks the statically resolved closure of installed entry files.
 * External (node_modules) packages ARE traversed, unlike the checkout-only
 * scan: every resolved dependency file is read and followed. Returns
 * findings; callers decide the verdict per entry (see header).
 */
export function scanInstalledClosure(entryFiles, consumerDir) {
  // Node's parent-aware ESM resolver requires this flag on Node 20/22.
  // One worker owns the whole walk; resolution never falls back to the consumer root.
  return JSON.parse(execFileSync(process.execPath, ["--experimental-import-meta-resolve", fileURLToPath(import.meta.url), "--scan-closure"], {
    input: JSON.stringify({ entryFiles, consumerDir }), encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  }));
}

function scanClosure(entryFiles, consumerDir) {
  const findings = [];
  const seenFiles = new Set();
  const seenPackages = new Set();
  // The distribution's own package lifecycle (here: the packed engram
  // manifest) is the release's reviewed surface, not a hidden dependency
  // build step: its reviewed lifecycle is exempt; native metadata is not.
  const ownedPackages = new Set(
    entryFiles.map((entry) => nearestPackageDir(entry, consumerDir)).filter((dir) => dir !== undefined),
  );
  const queue = [...entryFiles];
  for (const packageDir of ownedPackages) {
    const metadata = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    if (metadata.gypfile === true) findings.push({ file: join(packageDir, "package.json"), specifier: packageDir, kind: "gypfile" });
    if (existsSync(join(packageDir, "binding.gyp"))) findings.push({ file: join(packageDir, "binding.gyp"), specifier: packageDir, kind: "lifecycle-scripts" });
  }
  let steps = 0;
  while (queue.length > 0) {
    const file = queue.pop();
    if (seenFiles.has(file)) continue;
    seenFiles.add(file);
    if (file.endsWith(".node")) {
      findings.push({ file, specifier: file, kind: "native-addon" });
      continue;
    }
    if (!/\.(?:js|cjs|mjs)$/.test(file)) continue;
    if (++steps > 20000) {
      findings.push({ file, specifier: "(traversal-cap)", kind: "computed-target" });
      break;
    }
    const content = readText(file);
    if (content === undefined) continue;
    for (const edge of staticEdges(content)) {
      if (edge.dynamic) {
        findings.push({ file, specifier: edge.specifier, kind: "computed-target" });
        continue;
      }
      const specifier = edge.specifier;
      if (specifier.includes("cluster-mesh")) {
        findings.push({ file, specifier, kind: "cluster-mesh" });
        continue;
      }
      if (NATIVE_PACKAGE_NAMES.has(packageRoot(specifier)) || specifier.endsWith(".node")) {
        findings.push({
          file,
          specifier,
          kind: specifier.endsWith(".node") ? "native-addon" : "forbidden-package",
        });
        continue;
      }
      let resolved;
      if (BUILTINS.has(specifier) || BUILTINS.has(specifier.split("/")[0])) continue;
      try {
        resolved = edge.condition === "require"
          ? createRequire(file).resolve(specifier)
          : fileURLToPath(import.meta.resolve(specifier, pathToFileURL(file).href));
      } catch {
        continue;
      }
      if (resolved === undefined) continue;
      if (resolved.endsWith(".node")) {
        findings.push({ file, specifier: resolved, kind: "native-addon" });
        continue;
      }
      const packageDir = nearestPackageDir(resolved, consumerDir);
      if (packageDir !== undefined && !seenPackages.has(packageDir) && !ownedPackages.has(packageDir)) {
        seenPackages.add(packageDir);
        const manifest = readText(join(packageDir, "package.json"));
        if (manifest !== undefined) {
          try {
            const metadata = JSON.parse(manifest);
            if (metadata.gypfile === true) findings.push({ file: join(packageDir, "package.json"), specifier: packageDir, kind: "gypfile" });
            const scripts = metadata.scripts ?? {};
            for (const name of Object.keys(scripts)) {
              if (LIFECYCLE_SCRIPTS.has(name)) {
                findings.push({ file: join(packageDir, "package.json"), specifier: `${packageDir}#${name}`, kind: "lifecycle-scripts" });
              }
            }
          } catch {
            continue;
          }
        }
        if (existsSync(join(packageDir, "binding.gyp"))) {
          findings.push({ file: join(packageDir, "binding.gyp"), specifier: packageDir, kind: "lifecycle-scripts" });
        }
      }
      queue.push(resolved);
    }
  }
  return findings;
}

/** Findings that fail the run for every published entry. */
export function fatalFindings(findings) {
  return findings.filter((finding) =>
    finding.kind === "forbidden-package"
    || finding.kind === "native-addon"
    || finding.kind === "cluster-mesh"
    || finding.kind === "lifecycle-scripts"
    || finding.kind === "gypfile"
    || finding.kind === "computed-target",
  );
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function storageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const MAX_U64 = 18446744073709551615n;

/**
 * Minimal in-memory neutral backend for this acceptance only (see header).
 * Implements the units, guards, limits, idempotency, named queries, and
 * fencing the installed adapter exercises; nothing more.
 */
export function createTarballAcceptanceBackend({ scope, contractDigest }) {
  const core = {
    allocation: "0",
    head: ZERO_HASH,
    eventsById: new Map(),
    order: [],
    records: new Map(),
    aggregates: new Map(),
    indexes: new Map(),
    commitResults: new Map(),
    holder: undefined,
    epochCounter: 0n,
    boundStore: undefined,
  };
  const grant = {
    token: "tarball-acceptance-grant",
    moduleId: "engram-memory",
    scope: { ...scope },
    principalId: "tarball-acceptance",
    operations: ["read", "write"],
    issuer: "tarball-acceptance",
    authorityRevision: "1",
    policyRevision: "1",
    lifetime: { kind: "lease", expiresAt: "2030-01-01T00:00:00.000Z" },
  };

  function checkGrant(presented, operation) {
    if (presented?.token !== grant.token) throw storageError("unauthorized", "unknown grant token");
    if (presented.moduleId !== "engram-memory") throw storageError("unauthorized", "grant names another module");
    if (presented.scope.tenantId !== scope.tenantId || presented.scope.workspaceId !== scope.workspaceId) {
      throw storageError("unauthorized", "grant names another scope");
    }
    if (!presented.operations.includes(operation)) throw storageError("unauthorized", `grant lacks ${operation}`);
  }

  function checkHolder(fence) {
    if (core.holder === undefined) throw storageError("fence-lost", "no live canonical fence");
    if (fence !== undefined && (core.holder.fenceId !== fence.fenceId || core.holder.epoch !== fence.epoch)) {
      throw storageError("fence-lost", "stale writer acquisition epoch");
    }
  }

  function unitHash(unit) {
    return stableStringify({
      records: unit.records,
      appends: unit.appends,
      updates: unit.updates,
      indexWrites: unit.indexWrites,
      moduleResult: unit.moduleResult ?? null,
    });
  }

  function encodedBytes(unit) {
    let bytes = 0;
    for (const item of [...unit.records, ...unit.appends, ...unit.updates]) {
      bytes += Buffer.byteLength(item.value.data, "utf8");
    }
    return bytes;
  }

  function applyUnit(options, unit) {
    if (unit.appends.length > options.limits.maxAppends) throw storageError("limit-exceeded", "unit exceeds maxAppends");
    if (unit.records.length > options.limits.maxRecords) throw storageError("limit-exceeded", "unit exceeds maxRecords");
    if (encodedBytes(unit) > options.limits.maxEncodedBytes) throw storageError("limit-exceeded", "unit exceeds maxEncodedBytes");
    if (options.idempotencyKey !== undefined) {
      const prior = core.commitResults.get(options.idempotencyKey);
      if (prior !== undefined) {
        if (prior.unitHash !== unitHash(unit)) throw storageError("digest-conflict", "commit identity bound to a different unit");
        return { commitId: options.idempotencyKey, journalCursor: core.allocation };
      }
    }
    for (const guard of unit.guards) {
      if (guard.kind === "chain-head") {
        if (guard.hash !== core.head) throw storageError("cas-conflict", "stale chain-head guard");
      } else if (guard.kind === "chain-absent") {
        if (core.order.length !== 0) throw storageError("cas-conflict", "chain-absent guard on a non-empty chain");
      } else if (guard.kind === "aggregate-version") {
        const current = core.aggregates.get(`${guard.aggregateKind}\0${guard.aggregateKey}`);
        if (current !== undefined && BigInt(guard.version ?? "0") <= BigInt(current.version)) {
          throw storageError("cas-conflict", "stale aggregate guard version");
        }
      }
    }
    const rollback = {
      records: new Map(core.records),
      eventsById: new Map(core.eventsById),
      order: [...core.order],
      allocation: core.allocation,
      head: core.head,
      aggregates: new Map(core.aggregates),
      indexes: new Map(core.indexes),
      commitResults: new Map(core.commitResults),
    };
    let cursor = core.allocation;
    try {
      for (const record of unit.records) {
        const mapKey = `${record.kind}\0${record.key}`;
        const prior = core.records.get(mapKey);
        if (prior !== undefined) {
          if (prior.value.data !== record.value.data || prior.contentHash !== record.contentHash) {
            throw storageError("digest-conflict", "immutable record bound to different bytes");
          }
          continue;
        }
        core.records.set(mapKey, { kind: record.kind, key: record.key, value: record.value, contentHash: record.contentHash });
      }
      for (const append of unit.appends) {
        if (append.chain !== "memory-journal") throw storageError("invalid-schema", "unknown chain");
        if (append.expectation.kind === "absent") {
          if (core.order.length !== 0 || append.expectation.allocation !== core.allocation) {
            throw storageError("cas-conflict", "genesis expectation does not hold");
          }
        } else if (append.expectation.hash !== core.head) {
          throw storageError("cas-conflict", "stale chain head");
        }
        const prior = core.eventsById.get(append.id);
        if (prior !== undefined) {
          if (prior.hash !== append.hash || prior.value.data !== append.value.data) {
            throw storageError("digest-conflict", "event identity bound to a different hash");
          }
          continue;
        }
        const body = JSON.parse(append.value.data);
        const next = BigInt(core.allocation) + 1n;
        if (next > MAX_U64) throw storageError("limit-exceeded", "journal cursor is exhausted");
        if (body.cursor !== next.toString()) throw storageError("cas-conflict", "append cursor does not extend the allocation");
        core.allocation = next.toString();
        core.head = append.hash;
        core.eventsById.set(append.id, { hash: append.hash, value: append.value, cursor: body.cursor });
        core.order.push(append.id);
        cursor = core.allocation;
      }
      for (const update of unit.updates) {
        const mapKey = `${update.kind}\0${update.key}`;
        const prior = core.aggregates.get(mapKey);
        if (prior !== undefined && BigInt(update.version) <= BigInt(prior.version)) {
          throw storageError("cas-conflict", "stale aggregate version");
        }
        core.aggregates.set(mapKey, { kind: update.kind, key: update.key, version: update.version, value: update.value });
      }
      for (const write of unit.indexWrites) {
        core.indexes.set(`${write.index}\0${write.key}`, write.value);
      }
      if (unit.moduleResult !== undefined && options.idempotencyKey !== undefined) {
        // The host persists the Engram-carried intent hash verbatim and
        // returns it byte for byte from findIdempotency; it never recomputes it.
        const entry = { intentHash: unit.intentHash, moduleResult: unit.moduleResult, unitHash: unitHash(unit) };
        core.commitResults.set(options.idempotencyKey, entry);
        for (const append of unit.appends) core.commitResults.set(append.id, entry);
      }
    } catch (error) {
      core.records = rollback.records;
      core.eventsById = rollback.eventsById;
      core.order = rollback.order;
      core.allocation = rollback.allocation;
      core.head = rollback.head;
      core.aggregates = rollback.aggregates;
      core.indexes = rollback.indexes;
      core.commitResults = rollback.commitResults;
      throw error;
    }
    return { commitId: options.idempotencyKey ?? "commit:empty", journalCursor: cursor };
  }

  const handle = {
    moduleId: "engram-memory",
    descriptor: {
      contractVersion: "memory-binding-v1",
      contractDigest,
      schemaVersions: ["memory-journal-1", "memory-record-2", "memory-lifecycle-event-2", "memory-checkpoint-1"],
      requiredProfiles: ["atomic-units-v1", "immutable-chains-v1", "immutable-boundaries-v1", "scope-outbox-v1", "fenced-writers-v1"],
      optionalProfiles: ["leased-snapshots-v1"],
      chainKinds: ["memory-journal"],
      queryNames: ["memory-journal-page", "memory-record-by-id", "memory-accepted-snapshot", "memory-outbox-page", "scope-chain-index"],
      boundaries: ["scope-root", "exact-cursor"],
      pageLimits: { maxRecords: 2000, maxEncodedBytes: 1048576 },
    },
    backend: "memory",
    profiles: ["atomic-units-v1", "immutable-chains-v1", "immutable-boundaries-v1", "scope-outbox-v1", "fenced-writers-v1", "leased-snapshots-v1"]
      .map((name) => ({ name, version: "1", digest: profileDigest(name) })),
    async transact(options, operation) {
      checkGrant(options.grant, "write");
      checkHolder(options.fence);
      const staged = [];
      const value = await operation({
        readAggregate: async (kind, key) => {
          const found = core.aggregates.get(`${kind}\0${key}`);
          return found === undefined ? null : { kind, key, version: found.version, value: found.value };
        },
        readRecords: async (kind, keys) => {
          const out = [];
          for (const key of keys) {
            const found = core.records.get(`${kind}\0${key}`);
            if (found !== undefined) out.push({ kind, key, value: found.value, contentHash: found.contentHash });
          }
          return out;
        },
        readChain: async (input) => {
          const records = [];
          for (const id of core.order) {
            const stored = core.eventsById.get(id);
            if (stored === undefined) continue;
            if (input.afterAllocation !== undefined && BigInt(stored.cursor) <= BigInt(input.afterAllocation)) continue;
            records.push({ id, hash: stored.hash, value: stored.value });
            if (records.length >= input.limit) break;
          }
          return { chain: input.chain, records };
        },
        findIdempotency: async (selector) => {
          const found = core.commitResults.get(selector.commitIdentity);
          return found === undefined ? null : { key: selector.commitIdentity, intentHash: found.intentHash, moduleResult: found.moduleResult };
        },
        apply: async (unit) => {
          staged.push(unit);
        },
      });
      checkGrant(options.grant, "write");
      checkHolder(options.fence);
      const snapshot = {
        records: new Map(core.records),
        eventsById: new Map(core.eventsById),
        order: [...core.order],
        allocation: core.allocation,
        head: core.head,
        aggregates: new Map(core.aggregates),
        indexes: new Map(core.indexes),
        commitResults: new Map(core.commitResults),
      };
      let receipt = { commitId: options.idempotencyKey ?? "commit:empty", journalCursor: core.allocation };
      try {
        for (const unit of staged) receipt = applyUnit(options, unit);
      } catch (error) {
        core.records = snapshot.records;
        core.eventsById = snapshot.eventsById;
        core.order = snapshot.order;
        core.allocation = snapshot.allocation;
        core.head = snapshot.head;
        core.aggregates = snapshot.aggregates;
        core.indexes = snapshot.indexes;
        core.commitResults = snapshot.commitResults;
        throw error;
      }
      return { value, receipt };
    },
    async query(name, input, presentedGrant) {
      checkGrant(presentedGrant, "read");
      const body = JSON.parse(input.data);
      switch (name) {
        case "memory-journal-page": {
          const records = [];
          for (const id of core.order) {
            const stored = core.eventsById.get(id);
            if (stored === undefined) continue;
            if (BigInt(stored.cursor) <= BigInt(body.after)) continue;
            records.push({ id, hash: stored.hash, value: stored.value });
            if (records.length >= Math.max(1, Math.min(Math.floor(body.limit), 2000))) break;
          }
          return { format: "utf8", data: JSON.stringify(records) };
        }
        case "memory-record-by-id": {
          const found = [...core.records.values()].find((record) => record.key === JSON.stringify(["memory-record-v1", body.record_id]));
          return { format: "utf8", data: JSON.stringify(found === undefined ? { found: false } : { found: true, value: found.value }) };
        }
        case "memory-accepted-snapshot": {
          const documents = [];
          for (const [mapKey, value] of core.indexes) {
            if (!mapKey.startsWith("memory-accepted-lexical\0")) continue;
            const document = JSON.parse(value.data);
            if (document === null) continue;
            documents.push(document);
            if (documents.length >= 2000) break;
          }
          documents.sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)));
          return { format: "utf8", data: JSON.stringify(documents) };
        }
        case "memory-outbox-page": {
          const batches = [];
          for (const record of core.records.values()) {
            if (record.kind !== "memory-projection-outbox") continue;
            const batch = JSON.parse(record.value.data);
            if (BigInt(batch.through_cursor_inclusive) <= BigInt(body.after)) continue;
            batches.push(batch);
            if (batches.length >= 2000) break;
          }
          batches.sort((a, b) => (BigInt(a.through_cursor_inclusive) === BigInt(b.through_cursor_inclusive) ? 0 : BigInt(a.through_cursor_inclusive) < BigInt(b.through_cursor_inclusive) ? -1 : 1));
          return { format: "utf8", data: JSON.stringify(batches) };
        }
        case "scope-chain-index": {
          return { format: "utf8", data: JSON.stringify({ chain: "memory-journal", head: core.head, allocation: core.allocation }) };
        }
        default:
          throw storageError("capability-unavailable", `unknown query ${name}`);
      }
    },
    async readAggregate(kind, key, presentedGrant) {
      checkGrant(presentedGrant, "read");
      const found = core.aggregates.get(`${kind}\0${key}`);
      return found === undefined ? null : { kind, key, version: found.version, value: found.value };
    },
    async readCommitResult(commitIdentity, presentedGrant) {
      checkGrant(presentedGrant, "read");
      checkHolder();
      const found = core.commitResults.get(commitIdentity);
      return found === undefined ? null : found.moduleResult;
    },
    async acquireFence(input) {
      checkGrant(input.grant, "write");
      if (input.scope.tenantId !== scope.tenantId || input.scope.workspaceId !== scope.workspaceId) {
        throw storageError("unauthorized", "fence scope is not this handle scope");
      }
      if (core.boundStore !== undefined && core.boundStore !== input.store_id) {
        throw storageError("fence-conflict", "scope journal is bound to another store_id");
      }
      if (core.holder !== undefined) throw storageError("fence-conflict", "a live canonical holder already owns this journal");
      core.boundStore = input.store_id;
      core.epochCounter += 1n;
      const epoch = core.epochCounter.toString();
      core.holder = { fenceId: `fence-${epoch}`, epoch };
      return { fenceId: core.holder.fenceId, epoch };
    },
    async checkFence(presentedGrant, fence) {
      checkGrant(presentedGrant, "read");
      checkHolder(fence);
    },
    async releaseFence(fence) {
      if (core.holder === undefined) return;
      if (fence !== undefined && (core.holder.fenceId !== fence.fenceId || core.holder.epoch !== fence.epoch)) {
        throw storageError("fence-lost", "stale acquisition cannot release a successor holder");
      }
      if (fence === undefined) return;
      core.holder = undefined;
    },
  };

  return { handle, grant };
}

export function profileDigest(name) {
  const hash = createHash("sha256");
  hash.update("graphify-memory/l3a-profile/v1\0", "utf8");
  hash.update(name, "utf8");
  hash.update("\0", "utf8");
  hash.update("1", "utf8");
  return `sha256:${hash.digest("hex")}`;
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const NOW = "2026-08-16T12:34:56.789Z";
const SCOPE = { tenantId: "tenant:tarball", workspaceId: "workspace:tarball" };
const SCOPE_REF = "scope:tarball";

/** Pinned contract digest, read from the freeze literal the suite maintains. */
export function pinnedContractDigest(repoRoot) {
  const testSource = readText(join(repoRoot, "tests", "memory-substrate.test.ts"));
  const match = testSource?.match(/MEMORY_CONTRACT_DIGEST\)\.toBe\("(sha256:[0-9a-f]{64})"\)/);
  if (!match) throw new Error("pinned MEMORY_CONTRACT_DIGEST literal not found in tests/memory-substrate.test.ts");
  return match[1];
}

/**
 * Pristine backend factory + companion sources, sliced from the on-disk text
 * with a real parser for hermetic packed probes. A runtime
 * `fn.toString()` is unusable here: under the test runner's SSR transform it
 * returns rewritten source (`__vite_ssr_import_*` references) that crashes in
 * the plain-node consumer.
 */
export function tarballAcceptanceBackendSources(repoRoot) {
  const ts = createRequire(import.meta.url)("typescript");
  const text = readText(join(repoRoot, "scripts", "substrate-tarball-acceptance.mjs"));
  if (text === undefined) throw new Error("backend source unreadable");
  const source = ts.createSourceFile("tarball-acceptance-backend.mjs", text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const out = {};
  for (const name of ["storageError", "stableStringify", "profileDigest", "createTarballAcceptanceBackend"]) {
    const statement = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (statement === undefined) throw new Error(`backend source function not found: ${name}`);
    out[name] = text.slice(statement.getStart(source), statement.getEnd()).replace(/^export\s+/, "");
  }
  return out;
}

function manualCapture() {
  return {
    control: {
      candidate_id: "candidate:tarball-1",
      envelope_digest: DIGEST,
      state: "pending",
      created_cursor: "0",
      policy_id: "policy:tarball",
      policy_version: "1",
      capture_content_digest: DIGEST,
      capture_receipt_digest: DIGEST,
    },
    sealed: {
      candidate_id: "candidate:tarball-1",
      envelope_ref: "envelope:tarball:1",
      envelope_digest: DIGEST,
      key_ref: "key:tarball:1",
      ciphertext: "tarball-ciphertext",
    },
    capture_event: {
      schema_version: 2,
      event_id: "event:tarball-capture-1",
      cursor: "0",
      recorded_at: NOW,
      operation: "capture",
      candidate_id: "candidate:tarball-1",
      to_state: "pending",
      authorization_receipt_digest: DIGEST,
      previous_event_digest: DIGEST,
      event_digest: DIGEST,
    },
  };
}

function npmCommand() {
  return process.env.SUBSTRATE_NPM_BIN ?? "npm";
}

function checkNpm(npmBin) {
  const version = execFileSync(npmBin, ["--version"], { encoding: "utf8" }).trim();
  const major = Number.parseInt(version.split(".")[0], 10);
  if (!Number.isSafeInteger(major) || major < 10) {
    throw new Error(`tarball acceptance requires npm >= 10 (got ${version}); set SUBSTRATE_NPM_BIN to a modern npm`);
  }
  return version;
}

function publishedEntryFiles(installedDir, manifest) {
  const entries = [];
  const add = (entry, mapping) => {
    if (typeof mapping === "string") entries.push({ entry, file: join(installedDir, mapping) });
    else if (mapping !== null && typeof mapping === "object") {
      for (const [condition, target] of Object.entries(mapping)) if (condition !== "types") add(condition === "import" ? entry : `${entry}#${condition}`, target);
    }
  };
  for (const [entry, mapping] of Object.entries(manifest.exports)) add(entry, mapping);
  for (const [name, target] of Object.entries(manifest.bin ?? {})) add(`bin:${name}`, target);
  return entries;
}

/**
 * Runs the isolated tarball acceptance. Returns a summary; throws on any
 * failure. Removes its tarball and consumer directories itself unless
 * KEEP_SUBSTRATE_TEMP=1.
 */
export async function runTarballAcceptance({ repoRoot = REPO_ROOT } = {}) {
  const npmBin = npmCommand();
  const npmVersion = checkNpm(npmBin);
  const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  if (manifest.name !== PACKAGE_NAME) throw new Error(`unexpected package ${manifest.name}`);
  if (manifest.version !== EXPECTED_VERSION) {
    throw new Error(`tarball acceptance pins ${EXPECTED_VERSION}, checkout is ${manifest.version}`);
  }
  const contractDigest = pinnedContractDigest(repoRoot);
  const packDir = mkdtempSync(join(tmpdir(), "substrate-tarball-"));
  const consumerDir = mkdtempSync(join(tmpdir(), "substrate-consumer-"));
  try {
    const packOutput = execFileSync(npmBin, ["pack", "--offline", "--ignore-scripts", "--silent", "--pack-destination", packDir], { cwd: repoRoot, encoding: "utf8" });
    const tarballName = packOutput.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".tgz")).pop();
    if (!tarballName) throw new Error("npm pack printed no tarball name");
    const tarball = join(packDir, tarballName);
    writeFileSync(join(consumerDir, "package.json"), JSON.stringify({ name: "substrate-acceptance-consumer", version: "0.0.0", type: "module" }));
    copyFileSync(tarball, join(consumerDir, "engram.tgz"));
    copyFileSync(join(repoRoot, "scripts/fixtures/substrate-consumer/package.json"), join(consumerDir, "package.json"));
    const lock = JSON.parse(readFileSync(join(repoRoot, "scripts/fixtures/substrate-consumer/package-lock.json"), "utf8"));
    // Only the local artifact changes per build. Every third-party version,
    // nested placement and integrity is committed, independent of cache contents.
    lock.packages[`node_modules/${PACKAGE_NAME}`].integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
    writeFileSync(join(consumerDir, "package-lock.json"), JSON.stringify(lock));
    execFileSync(npmBin, ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: consumerDir, stdio: "pipe" });
    verifyLockedClosure(consumerDir, lock);
    console.log("locked consumer: npm ci --offline (lifecycle scripts disabled)");
    const installedDir = join(consumerDir, "node_modules", PACKAGE_NAME);
    const installedManifest = JSON.parse(readFileSync(join(installedDir, "package.json"), "utf8"));
    if (installedManifest.version !== EXPECTED_VERSION) throw new Error("installed version mismatch");
    const consumerEntry = join(consumerDir, "public-entry.mjs");
    writeFileSync(consumerEntry, `export * from "${PACKAGE_NAME}/memory-substrate";`);
    const namespace = await import(pathToFileURL(consumerEntry).href);
    const values = Object.keys(namespace).sort();
    if (JSON.stringify(values) !== JSON.stringify([...EXPECTED_VALUES].sort())) {
      throw new Error(`installed entry values differ: ${values.join(",")}`);
    }
    const backend = createTarballAcceptanceBackend({ scope: SCOPE, contractDigest });
    const opened = await namespace.openModuleStorageCanonicalMemoryStoreV1({
      handle: backend.handle,
      scope_binding: {
        scope: { ...SCOPE },
        store_id: "store:tarball-acceptance",
        resolveScope: (scopeRef) => (scopeRef === SCOPE_REF ? { ...SCOPE } : null),
      },
      grant: backend.grant,
      clock: { now: () => NOW },
      deadline_at: "2026-08-16T12:40:00.000Z",
    });
    if (!opened.ok) throw new Error(`installed store refused: ${opened.error.code} ${opened.error.message}`);
    const committed = await opened.value.commitPending(manualCapture());
    if (!committed.ok) throw new Error(`installed commit refused: ${committed.error.code} ${committed.error.message}`);
    if (committed.value.cursor !== "1") throw new Error(`installed commit cursor is ${committed.value.cursor}`);
    const persisted = await backend.handle.readCommitResult("event:tarball-capture-1", backend.grant);
    if (persisted === null) throw new Error("installed commit left no recoverable receipt");
    const persistedBody = JSON.parse(persisted.data);
    if (committed.value.receipt_digest !== persistedBody.receipt_digest) {
      throw new Error("installed returned digest differs from persisted receipt bytes");
    }
    if (committed.value.committed_at !== persistedBody.committed_at) {
      throw new Error("installed returned instant differs from persisted receipt bytes");
    }
    const journal = await opened.value.readJournal({ after: "0", limit: 2000 });
    if (!journal.ok || journal.value.length !== 1) throw new Error("installed journal does not hold the committed event");
    await opened.value.close();

    verifyInstalledTypes(consumerDir);
    verifyInstalledSemantics(consumerDir, repoRoot);

    const entries = publishedEntryFiles(installedDir, installedManifest);
    const report = [];
    for (const { entry, file } of entries) {
      const findings = scanInstalledClosure([file], consumerDir);
      const fatal = fatalFindings(findings);
      const computed = findings.filter((finding) => finding.kind === "computed-target");
      report.push({ entry, files: file, computedTargets: computed.length, fatal });
      console.log(`tarball-acceptance closure ${entry}: ${fatal.length ? `${fatal.length} fatal findings` : "no fatal findings"}, computed-targets=${computed.length}`);
    }
    const blocked = report.filter((row) => row.fatal.length > 0);
    if (blocked.length) throw new Error(`installed closure refused: ${JSON.stringify(blocked.map(({ entry, fatal }) => ({ entry, findings: fatal.slice(0, 3) })))}`);
    const summary = {
      package: `${PACKAGE_NAME}@${EXPECTED_VERSION}`,
      npm: npmVersion,
      tarball: tarballName,
      values,
      commitCursor: committed.value.cursor,
      receiptDigest: committed.value.receipt_digest,
      report,
    };
    console.log(`tarball-acceptance OK ${summary.package} values=${values.join(",")} cursor=1`);
    return summary;
  } finally {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(consumerDir, { recursive: true, force: true });
  }
}

const invokedAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript && process.argv[2] === "--scan-closure") {
  const { entryFiles, consumerDir } = JSON.parse(readFileSync(0, "utf8"));
  console.log(JSON.stringify(scanClosure(entryFiles, consumerDir)));
} else if (invokedAsScript) {
  runTarballAcceptance().then(
    () => {},
    (error) => {
      console.error(`tarball-acceptance FAIL ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
