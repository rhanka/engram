/**
 * EVOL §4–§5 declaration lock (EVOL §10 `contract/schema/neutrality` row:
 * "declarations and schemas exactly match §4–§5").
 *
 * §4 record/validation schemas are locked by `tests/memory-contract-schema.test.ts`
 * (exact shapes, no additional properties) and neutrality by
 * `tests/memory-neutrality.test.ts`; this file locks the §5 declaration
 * blocks: every member (name + required/optional) of the implemented
 * `CanonicalMemoryStorePort`, `LogicalBackupManifestV1`, and the backup
 * factory must appear in EVOL, and every member EVOL declares must exist in
 * the code. Either side drifting — a renamed factory, a dropped manifest
 * field, a new port method — turns this test red.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createLogicalMemoryBackupV1 } from "../engram-memory/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(join(HERE, "..", "spec", "SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md"), "utf8");
const CONTRACTS = readFileSync(join(HERE, "..", "engram-memory", "contracts", "index.ts"), "utf8");

function stripTsComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
}

function interfaceBody(source: string, name: string): string {
  const start = source.indexOf(`interface ${name}`);
  if (start < 0) throw new Error(`interface ${name} not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`interface ${name} unterminated`);
}

/** Member name -> optional flag, for top-level members only (depth 0). */
function memberFlags(body: string): Map<string, boolean> {
  const flags = new Map<string, boolean>();
  let depth = 0;
  for (const line of stripTsComments(body).split("\n")) {
    if (depth === 0) {
      const match = /^\s*(?:readonly\s+)?(\w+)(\?)?\s*[:<(]/.exec(line);
      if (match) flags.set(match[1]!, match[2] === "?");
    }
    for (const ch of line) {
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
  }
  return flags;
}

function expectExactInterface(name: string): void {
  const codeFlags = memberFlags(interfaceBody(CONTRACTS, name));
  const specFlags = memberFlags(interfaceBody(SPEC, name));
  expect([...codeFlags.keys()].sort(), `${name}: every code member must be declared in EVOL`).toEqual(
    [...specFlags.keys()].sort(),
  );
  for (const [member, optional] of codeFlags) {
    expect(specFlags.get(member), `${name}.${member}: optionality must match (code ${optional ? "optional" : "required"})`).toBe(
      optional,
    );
  }
  expect(codeFlags.size, `${name}: declaration must be non-empty on both sides`).toBeGreaterThan(0);
}

describe("EVOL §5 declarations match the implemented contracts", () => {
  it("CanonicalMemoryStorePort declares exactly the implemented members", () => {
    expectExactInterface("CanonicalMemoryStorePort");
    // The D-8 A / D-11 B additions that were missing from the spec blocks.
    for (const member of [
      "readPending",
      "readCaptureIdempotency",
      "readCaptureIdempotencyEntries",
      "recordCaptureIdempotency",
      "revalidateReadOnly",
      "importLogicalBackup",
    ]) {
      expect(memberFlags(interfaceBody(SPEC, "CanonicalMemoryStorePort")).has(member)).toBe(true);
    }
  });

  it("LogicalBackupManifestV1 binds exactly the implemented manifest fields", () => {
    expectExactInterface("LogicalBackupManifestV1");
    for (const field of ["state_digest", "capture_idempotency_digest", "object_ref", "ciphertext_digest"]) {
      expect(memberFlags(interfaceBody(SPEC, "LogicalBackupManifestV1")).has(field)).toBe(true);
    }
    expect(memberFlags(interfaceBody(SPEC, "LogicalBackupManifestV1")).get("capture_idempotency_digest")).toBe(true);
  });

  it("the backup factory is the implemented store-scoped constructor", () => {
    expect(SPEC.includes("createLogicalMemoryBackupV1(dependencies: LogicalMemoryBackupDependenciesV1)")).toBe(true);
    expect(SPEC.includes("createMemoryBackupPort("), "stale engine-scoped factory name must be gone").toBe(false);
    expect(typeof createLogicalMemoryBackupV1).toBe("function");
  });
});
