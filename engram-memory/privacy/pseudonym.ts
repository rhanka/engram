import * as nodeCrypto from "node:crypto";
import { canonicalizeJcs, type CanonicalJsonValue } from "../canonical-json.js";
import type {
  MemoryErrorCode,
  MemoryOperation,
  Result,
} from "../contracts/index.js";
import type { SessionFrontScopeV1 } from "../session-front-engine.js";
import { assertExactKeys, assertOpaque, SchemaFailure } from "../validation.js";

export const ACTOR_PSEUDONYM_DOMAIN = "engram/d33/actor/v1\0";
export const SESSION_PSEUDONYM_DOMAIN = "engram/d33/session/v1\0";
export const PSEUDONYM_KEY_BYTES = 32;

const KEY_SCOPE_FINGERPRINT_DOMAIN = "engram/d33/key-scope-check/v1\0";
const ACTOR_PSEUDONYM_PATTERN = /^actor_pseudo:[0-9a-f]{64}$/;
const SESSION_PSEUDONYM_PATTERN = /^sess_pseudo:[0-9a-f]{64}$/;
const MAX_STRICT_JSON_DEPTH = 64;

interface HmacHandle {
  update(data: string, inputEncoding: "utf8"): HmacHandle;
  digest(encoding: "hex"): string;
}

interface NodeCryptoHmacModule {
  readonly createHmac?: (algorithm: "sha256", key: Uint8Array) => HmacHandle;
}

export interface PseudonymScopeKeyPortV1 {
  readonly getScopeKey: (
    scope: SessionFrontScopeV1,
  ) => Promise<Result<Uint8Array>> | Result<Uint8Array>;
}

export interface ScopedPseudonymizerV1 {
  pseudonymizeActor(input: {
    readonly scope: SessionFrontScopeV1;
    readonly canonicalActorId: string;
  }): Promise<Result<string>>;
  pseudonymizeSession(input: {
    readonly scope: SessionFrontScopeV1;
    readonly sessionId: string;
  }): Promise<Result<string>>;
}

export function privacyRefusal<T>(
  operation: MemoryOperation,
  code: MemoryErrorCode,
  message: string,
  retryable = false,
): Result<T> {
  return {
    ok: false,
    error: { code, operation, message, retryable },
  };
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function decodeStrictJsonValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
  depth = 0,
): CanonicalJsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (hasUnpairedSurrogate(value)) {
      throw new SchemaFailure("string contains an unpaired surrogate");
    }
    return value.normalize("NFC");
  }
  if (typeof value === "number") {
    if (
      !Number.isFinite(value)
      || Object.is(value, -0)
      || (Number.isInteger(value) && !Number.isSafeInteger(value))
    ) {
      throw new SchemaFailure("number is not canonical JSON");
    }
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new SchemaFailure("value is not acyclic JSON");
  }
  if (depth >= MAX_STRICT_JSON_DEPTH) {
    throw new SchemaFailure("JSON nesting depth exceeds bound");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new SchemaFailure("value contains symbol properties");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new SchemaFailure("array prototype is not canonical");
      }
      if (Object.getOwnPropertyNames(value).length !== value.length + 1) {
        throw new SchemaFailure("array must be dense without extra properties");
      }
      const out: CanonicalJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new SchemaFailure("array element must be an own enumerable data property");
        }
        out.push(decodeStrictJsonValue(descriptor.value, seen, depth + 1));
      }
      return out;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new SchemaFailure("value is not a plain object");
    }
    const out: Record<string, CanonicalJsonValue> = {};
    for (const rawKey of Object.getOwnPropertyNames(value)) {
      if (hasUnpairedSurrogate(rawKey)) {
        throw new SchemaFailure("object key contains an unpaired surrogate");
      }
      const key = rawKey.normalize("NFC");
      if (rawKey === "__proto__" || key === "__proto__") {
        throw new SchemaFailure("object key __proto__ is forbidden");
      }
      if (Object.hasOwn(out, key)) {
        throw new SchemaFailure("duplicate object key after NFC normalization");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new SchemaFailure("object property must be an own enumerable data property");
      }
      Object.defineProperty(out, key, {
        value: decodeStrictJsonValue(descriptor.value, seen, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function decodeStrictObject(
  value: unknown,
  name: string,
  allowed: readonly string[],
  required: readonly string[],
): Record<string, CanonicalJsonValue> {
  const decoded = decodeStrictJsonValue(value);
  assertExactKeys(decoded, name, allowed, required);
  return decoded;
}

export function decodeStrictShallowEnvelope(
  value: unknown,
  name: string,
  allowed: readonly string[],
  required: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SchemaFailure(`${name} must be a plain object`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new SchemaFailure(`${name} must be a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new SchemaFailure(`${name} contains symbol properties`);
  }
  const out: Record<string, unknown> = {};
  for (const rawKey of Object.getOwnPropertyNames(value)) {
    if (hasUnpairedSurrogate(rawKey)) {
      throw new SchemaFailure(`${name} key contains an unpaired surrogate`);
    }
    const key = rawKey.normalize("NFC");
    if (rawKey === "__proto__" || key === "__proto__") {
      throw new SchemaFailure(`${name} forbids __proto__`);
    }
    if (Object.hasOwn(out, key)) {
      throw new SchemaFailure(`${name} has a duplicate key`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new SchemaFailure(`${name} requires own enumerable data properties`);
    }
    Object.defineProperty(out, key, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  const keys = Object.keys(out);
  if (
    keys.some((key) => !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(out, key))
  ) {
    throw new SchemaFailure(`${name} has an unexpected or missing property`);
  }
  return out;
}

export function decodeStrictScope(
  value: unknown,
  name = "scope",
): SessionFrontScopeV1 {
  const scope = decodeStrictObject(
    value,
    name,
    ["tenantId", "workspaceId"],
    ["tenantId", "workspaceId"],
  );
  assertOpaque(scope.tenantId, `${name}.tenantId`);
  assertOpaque(scope.workspaceId, `${name}.workspaceId`);
  if (
    scope.tenantId.trim().length === 0
    || scope.workspaceId.trim().length === 0
    || scope.tenantId.includes("\0")
    || scope.workspaceId.includes("\0")
  ) {
    throw new SchemaFailure(`${name} identifiers must be non-blank without NUL bytes`);
  }
  return {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  };
}

export function isActorPseudonymV1(value: unknown): value is string {
  return typeof value === "string" && ACTOR_PSEUDONYM_PATTERN.test(value);
}

export function isSessionPseudonymV1(value: unknown): value is string {
  return typeof value === "string" && SESSION_PSEUDONYM_PATTERN.test(value);
}

function hmacSha256Hex(keyBytes: Uint8Array, message: string): Result<string> {
  const cryptoMod = nodeCrypto as unknown as NodeCryptoHmacModule;
  if (typeof cryptoMod.createHmac !== "function") {
    return privacyRefusal(
      "capture",
      "CAPABILITY_UNAVAILABLE",
      "HMAC-SHA256 capability is unavailable",
    );
  }
  const hex = cryptoMod.createHmac("sha256", keyBytes).update(message, "utf8").digest("hex");
  return { ok: true, value: hex };
}

function copyValidatedScopeKey(rawKey: unknown): Uint8Array | undefined {
  if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== PSEUDONYM_KEY_BYTES) {
    return undefined;
  }
  const copy = new Uint8Array(PSEUDONYM_KEY_BYTES);
  let nonZero = 0;
  for (let index = 0; index < PSEUDONYM_KEY_BYTES; index += 1) {
    const byte = rawKey[index]!;
    copy[index] = byte;
    nonZero |= byte;
  }
  if (nonZero === 0) {
    copy.fill(0);
    return undefined;
  }
  return copy;
}

function validateRawSubjectId(value: unknown, field: string): string {
  assertOpaque(value, field);
  if (value.trim().length === 0 || value.includes("\0")) {
    throw new SchemaFailure(`${field} must be a non-blank string without NUL bytes`);
  }
  return value;
}

export function createScopedPseudonymizerV1(
  keyProvider: PseudonymScopeKeyPortV1,
): ScopedPseudonymizerV1 {
  const scopeByKeyFingerprint = new Map<string, string>();

  async function derive(
    rawInput: unknown,
    idField: "canonicalActorId" | "sessionId",
    prefix: "actor_pseudo:" | "sess_pseudo:",
    domain: string,
  ): Promise<Result<string>> {
    let scope: SessionFrontScopeV1;
    let subjectId: string;
    try {
      const obj = decodeStrictObject(
        rawInput,
        "pseudonymInput",
        ["scope", idField],
        ["scope", idField],
      );
      scope = decodeStrictScope(obj.scope, "scope");
      subjectId = validateRawSubjectId(obj[idField], idField);
    } catch {
      return privacyRefusal("capture", "INVALID_SCHEMA", "pseudonymization input is invalid");
    }

    let keyResult: Result<Uint8Array>;
    try {
      if (
        keyProvider === null
        || keyProvider === undefined
        || typeof keyProvider !== "object"
        || typeof keyProvider.getScopeKey !== "function"
      ) {
        return privacyRefusal(
          "capture",
          "POLICY_UNAVAILABLE",
          "scope pseudonymization key provider is unavailable",
        );
      }
      keyResult = await keyProvider.getScopeKey({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      });
    } catch {
      return privacyRefusal("capture", "POLICY_UNAVAILABLE", "scope pseudonymization key is unavailable");
    }

    let keyCopy: Uint8Array | undefined;
    try {
      if (
        keyResult === null
        || typeof keyResult !== "object"
        || keyResult.ok !== true
      ) {
        return privacyRefusal(
          "capture",
          "POLICY_UNAVAILABLE",
          "scope pseudonymization key is unavailable",
        );
      }
      keyCopy = copyValidatedScopeKey(keyResult.value);
    } catch {
      return privacyRefusal("capture", "POLICY_UNAVAILABLE", "scope pseudonymization key is unavailable");
    }
    if (keyCopy === undefined) {
      return privacyRefusal("capture", "POLICY_UNAVAILABLE", "scope pseudonymization key must be 256-bit non-zero");
    }

    try {
      const fpRes = hmacSha256Hex(keyCopy, KEY_SCOPE_FINGERPRINT_DOMAIN);
      if (!fpRes.ok) {
        return fpRes;
      }
      const scopeTag = canonicalizeJcs(scope);
      const existingScope = scopeByKeyFingerprint.get(fpRes.value);
      if (existingScope !== undefined && existingScope !== scopeTag) {
        return privacyRefusal(
          "capture",
          "POLICY_UNAVAILABLE",
          "scope pseudonymization key must not be shared across scopes",
        );
      }
      scopeByKeyFingerprint.set(fpRes.value, scopeTag);

      const digestRes = hmacSha256Hex(keyCopy, `${domain}${subjectId}`);
      if (!digestRes.ok) {
        return digestRes;
      }
      return { ok: true, value: `${prefix}${digestRes.value}` };
    } finally {
      keyCopy.fill(0);
    }
  }

  return {
    pseudonymizeActor(input) {
      return derive(input, "canonicalActorId", "actor_pseudo:", ACTOR_PSEUDONYM_DOMAIN);
    },
    pseudonymizeSession(input) {
      return derive(input, "sessionId", "sess_pseudo:", SESSION_PSEUDONYM_DOMAIN);
    },
  };
}
