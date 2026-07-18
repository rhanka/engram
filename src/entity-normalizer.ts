import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import { normalizeForMatch } from "./cite-grounding.js";
import type {
  EntityNormalizerDescriptor,
  NormalizedOntologyNodeType,
  NormalizedOntologyProfile,
  OntologyNodeTypeLinking,
  OntologyNodeTypeNormalize,
  RegistryRecord,
} from "./types.js";

/** Contract identifier written into the normalized profile and profile hash. */
export const ENTITY_NORMALIZER_CONTRACT = "graphify_entity_normalizer_v1" as const;

/** A synchronous entity-key normalizer compiled for one node type. */
export type EntityNormalizer = (value: string) => string;

/** Runtime-only lookup table. It is deliberately not serialized into profiles. */
export type NormalizerByNodeType = Record<string, EntityNormalizer>;

type BuiltinName = "case_fold" | "dash_fold" | "collapse_ws";

const BUILTIN_VERSIONS: Record<BuiltinName, string> = {
  case_fold: "case_fold@1",
  dash_fold: "dash_fold@1",
  collapse_ws: "collapse_ws@1",
};

const DEFAULT_NORMALIZER_VERSION = "normalize_for_match@1";

const DASH_VARIANTS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu;

const BUILTINS: Record<BuiltinName, EntityNormalizer> = {
  case_fold: (value) => value.toLowerCase(),
  dash_fold: (value) => value.replace(DASH_VARIANTS, "-"),
  collapse_ws: (value) => value.trim().replace(/\s+/gu, " "),
};

interface FnReference {
  moduleSpecifier: string;
  exportName: string;
}

interface ResolvedFn extends FnReference {
  modulePath: string;
  moduleBytes: Buffer;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasThen(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

function normalizeBuiltins(
  normalize: OntologyNodeTypeNormalize | undefined,
  context: string,
): BuiltinName[] | undefined {
  if (normalize?.builtin === undefined) return undefined;
  if (!Array.isArray(normalize.builtin)) {
    throw new Error(`${context}.builtin must be an array of built-in normalizer names`);
  }
  return normalize.builtin.map((value, index) => {
    if (typeof value !== "string" || !(value in BUILTINS)) {
      throw new Error(
        `${context}.builtin[${index}] must be one of ${Object.keys(BUILTINS).join(", ")} (got ${String(value)})`,
      );
    }
    return value as BuiltinName;
  });
}

function parseFnReference(value: string, context: string): FnReference {
  const trimmed = value.trim();
  const firstHash = trimmed.indexOf("#");
  if (firstHash <= 0 || firstHash !== trimmed.lastIndexOf("#") || firstHash === trimmed.length - 1) {
    throw new Error(`${context}.fn must use the local module#export form`);
  }
  const moduleSpecifier = trimmed.slice(0, firstHash);
  const exportName = trimmed.slice(firstHash + 1);
  if (isAbsolute(moduleSpecifier) || (!moduleSpecifier.startsWith("./") && !moduleSpecifier.startsWith("../"))) {
    throw new Error(`${context}.fn must reference a local module relative to the profile file`);
  }
  return { moduleSpecifier, exportName };
}

function profileSourcePath(profile: Pick<NormalizedOntologyProfile, "sourcePath">, context: string): string {
  if (!profile.sourcePath) {
    throw new Error(`${context}.fn requires a profile source path so its local module can be resolved`);
  }
  return resolve(profile.sourcePath);
}

function resolveFn(
  profile: Pick<NormalizedOntologyProfile, "sourcePath">,
  fn: string,
  context: string,
): ResolvedFn {
  const sourcePath = profileSourcePath(profile, context);
  const reference = parseFnReference(fn, context);
  const modulePath = resolve(dirname(sourcePath), reference.moduleSpecifier);
  if (!existsSync(modulePath)) {
    throw new Error(`${context}.fn module does not exist: ${reference.moduleSpecifier}`);
  }
  const moduleBytes = readFileSync(modulePath);
  return { ...reference, modulePath, moduleBytes };
}

function assertStandaloneModule(resolved: ResolvedFn, context: string): void {
  const source = resolved.moduleBytes.toString("utf-8");
  // L3 fingerprints this file only. Reject import/re-export/dynamic-import
  // forms rather than pretending a transitive local dependency is covered.
  if (
    /^\s*import(?:\s|\{|\*|["'])/mu.test(source) ||
    /^\s*export\s+[^\n;]+\s+from\s+["']/mu.test(source) ||
    /\bimport\s*\(/u.test(source)
  ) {
    throw new Error(
      `${context}.fn module must be autonomous in L3 (local imports are not supported because only this file is fingerprinted)`,
    );
  }
}

function descriptorFor(
  normalize: OntologyNodeTypeNormalize | undefined,
  profile: Pick<NormalizedOntologyProfile, "sourcePath">,
  context: string,
): EntityNormalizerDescriptor {
  const builtinNames = normalizeBuiltins(normalize, context);
  const builtins = (builtinNames === undefined
    ? [DEFAULT_NORMALIZER_VERSION]
    : builtinNames.map((builtin) => BUILTIN_VERSIONS[builtin])) as string[];
  const fn = normalize?.fn;
  const resolved = fn === undefined ? undefined : resolveFn(profile, fn, context);
  if (resolved) assertStandaloneModule(resolved, context);
  const fingerprint = {
    contract: ENTITY_NORMALIZER_CONTRACT,
    builtins,
    ...(resolved ? { export: resolved.exportName, module_sha256: sha256(resolved.moduleBytes) } : {}),
  };
  return {
    ...fingerprint,
    normalizer_hash: sha256(JSON.stringify(fingerprint)),
  };
}

/**
 * Normalize the declarative L3 linking block. `preset` is deliberately stored
 * but not executed until L4. The descriptor contains no absolute module path;
 * it is the portable hash input for a configured normalizer.
 */
export function normalizeNodeTypeLinking(
  linking: OntologyNodeTypeLinking,
  profile: Pick<NormalizedOntologyProfile, "sourcePath">,
  context: string,
): NonNullable<NormalizedOntologyNodeType["linking"]> {
  if (!isRecord(linking)) throw new Error(`${context}.linking must be an object`);
  if (linking.preset !== undefined && (typeof linking.preset !== "string" || !linking.preset.trim())) {
    throw new Error(`${context}.linking.preset must be a non-empty string`);
  }
  if (linking.normalize !== undefined && !isRecord(linking.normalize)) {
    throw new Error(`${context}.linking.normalize must be an object`);
  }
  if (linking.normalize?.fn !== undefined &&
    (typeof linking.normalize.fn !== "string" || !linking.normalize.fn.trim())) {
    throw new Error(`${context}.linking.normalize.fn must be a non-empty module#export string`);
  }

  const normalize = linking.normalize === undefined
    ? undefined
    : {
      ...(linking.normalize.builtin === undefined ? {} : { builtin: normalizeBuiltins(linking.normalize, context) }),
      ...(linking.normalize.fn === undefined ? {} : { fn: linking.normalize.fn.trim() }),
    };
  return {
    ...(linking.preset === undefined ? {} : { preset: linking.preset.trim() }),
    ...(normalize === undefined ? {} : { normalize }),
    normalizer: descriptorFor(normalize, profile, context),
  };
}

function loadFn(resolved: ResolvedFn, context: string): EntityNormalizer {
  assertStandaloneModule(resolved, context);
  const requireFromProfile = createRequire(resolved.modulePath);
  let module: Record<string, unknown>;
  try {
    module = requireFromProfile(resolved.modulePath) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${context}.fn could not load ${resolved.moduleSpecifier}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const exported = module[resolved.exportName];
  if (typeof exported !== "function") {
    throw new Error(`${context}.fn export ${resolved.exportName} is not a function`);
  }
  if (exported.constructor?.name === "AsyncFunction") {
    throw new Error(`${context}.fn export ${resolved.exportName} must be synchronous`);
  }
  return exported as EntityNormalizer;
}

function compileOne(
  profile: Pick<NormalizedOntologyProfile, "sourcePath">,
  nodeType: NormalizedOntologyNodeType,
  context: string,
): EntityNormalizer {
  const normalize = nodeType.linking?.normalize;
  const storedDescriptor = nodeType.linking?.normalizer;
  if (storedDescriptor) {
    const currentDescriptor = descriptorFor(normalize, profile, context);
    if (currentDescriptor.normalizer_hash !== storedDescriptor.normalizer_hash) {
      throw new Error(
        `${context}.fn module bytes changed since this profile was loaded; reload the profile to refresh profile_hash`,
      );
    }
  }
  const builtinNames = normalizeBuiltins(normalize, context);
  const builtin = builtinNames === undefined
    ? normalizeForMatch
    : (value: string) => builtinNames.reduce((current, name) => BUILTINS[name](current), value);
  if (!normalize?.fn) return builtin;
  const resolved = resolveFn(profile, normalize.fn, context);
  const fn = loadFn(resolved, context);
  return (value: string) => fn(builtin(value));
}

/**
 * Compile every opted-in node type once for a consumer pass. L4's linking
 * producer should call this same entrypoint rather than reinterpreting profile
 * fields itself.
 */
export function compileNormalizerByNodeType(profile: NormalizedOntologyProfile): NormalizerByNodeType {
  const normalizers: NormalizerByNodeType = {};
  for (const [nodeTypeId, nodeType] of Object.entries(profile.node_types ?? {})) {
    if (!nodeType.linking) continue;
    normalizers[nodeTypeId] = compileOne(profile, nodeType, `node_types.${nodeTypeId}.linking`);
  }
  return normalizers;
}

function applyChecked(
  normalizer: EntityNormalizer,
  value: string,
  context: string,
): string {
  let result: unknown;
  try {
    result = normalizer(value);
  } catch (error) {
    throw new Error(`${context} threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (hasThen(result)) throw new Error(`${context} returned a Promise; normalizers must be synchronous`);
  if (typeof result !== "string") throw new Error(`${context} returned a non-string value`);
  if (value.length > 0 && result.length === 0) {
    throw new Error(`${context} returned an empty string for a non-empty registry key`);
  }
  return result;
}

interface CollisionBucket {
  ids: Set<string>;
  keys: Set<string>;
  partition: string;
  normalized: string;
}

/**
 * Exhaustively enforce the normalizer contract against loaded registry keys.
 * This is intentionally invoked from registry loading, before any corpus scan.
 */
export function auditNormalizerContracts(
  profile: NormalizedOntologyProfile,
  registries: Record<string, RegistryRecord[]>,
  normalizers = compileNormalizerByNodeType(profile),
): void {
  for (const [nodeTypeId, nodeType] of Object.entries(profile.node_types)) {
    if (!nodeType.linking || !nodeType.registry) continue;
    const records = registries[nodeType.registry] ?? [];
    const normalizer = normalizers[nodeTypeId];
    if (!normalizer) continue;
    const collisions = new Map<string, CollisionBucket>();

    for (const record of records) {
      for (const key of [record.label, ...record.aliases]) {
        const context = `node_types.${nodeTypeId}.linking.normalize for ${nodeType.registry} record ${record.id} key ${JSON.stringify(key)}`;
        const first = applyChecked(normalizer, key, context);
        const repeat = applyChecked(normalizer, key, context);
        if (repeat !== first) {
          throw new Error(`${context} is non-deterministic (${JSON.stringify(first)} then ${JSON.stringify(repeat)})`);
        }
        const second = applyChecked(normalizer, first, context);
        if (second !== first) {
          throw new Error(`${context} is not idempotent (${JSON.stringify(first)} -> ${JSON.stringify(second)})`);
        }

        const partition = record.partition ?? "";
        const collisionKey = `${partition}\0${first}`;
        let bucket = collisions.get(collisionKey);
        if (!bucket) {
          bucket = { ids: new Set(), keys: new Set(), partition, normalized: first };
          collisions.set(collisionKey, bucket);
        }
        bucket.ids.add(record.id);
        bucket.keys.add(key);
      }
    }

    for (const bucket of collisions.values()) {
      if (bucket.ids.size <= 1) continue;
      const ids = Array.from(bucket.ids).sort();
      const keys = Array.from(bucket.keys).sort();
      throw new Error(
        `normalizer_collision: node_type=${nodeTypeId} registry=${nodeType.registry} ` +
        `partition=${JSON.stringify(bucket.partition)} normalized=${JSON.stringify(bucket.normalized)} ` +
        `ids=${JSON.stringify(ids)} keys=${JSON.stringify(keys)}`,
      );
    }
  }
}
