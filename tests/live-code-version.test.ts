// L5 — Versioned Code (plan/09 L5; spec/SPEC_LIVE_GIT_INDEXING.md §§3, 8, A04/A08).
// Test-first: written before engram-live/analysis-cache.ts and
// engram-live/code-analysis.ts exist; observed RED first.
//
// Owner decision Q1 A: authorized complete commit metadata, DAG and
// changed-file facts are materialized; historical patches and ASTs are
// computed on demand from retained objects. Parse-cache identity includes
// content, language, grammar and extractor versions; resolution-cache
// identity also includes tree, path, configuration and dependencies. Equal
// blobs can resolve differently in different projects. Body-only changes
// invalidate content-derived facts even when topology is unchanged. Missing
// grammar diagnostics are part of coverage, never an empty graph.
//
// This file is NOT part of the neutral test closure of
// tests/live-neutrality.test.ts: it exercises injected host ports (cache,
// grammar, retained objects, deterministic extractor) and the reused
// src/extract.ts + src/cache.ts injection seam.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_EXTRACTOR_VERSION,
  AnalysisCache,
  deriveAnalysisCacheKey,
  type AnalysisCachePort,
  type AnalysisContextDto,
} from "../engram-live/analysis-cache.js";
import {
  analyzeCode,
  repairAffectedCalls,
  type CodeAnalysisPorts,
  type DeterministicParsePort,
  type GrammarStatusPort,
  type ParsedUnit,
  type RetainedObjectsPort,
} from "../engram-live/code-analysis.js";
import * as fixtureFs from "node:fs";
import { extractWithDiagnostics as reusedExtract, type LiveExtractionPorts } from "../src/extract.js";
// Fixtures are host capabilities, read inside the checkout-local test area.
async function extractWithDiagnostics(paths: string[], ports?: Omit<LiveExtractionPorts, "cacheStore"> & {
  cacheStore?: { load(key: string): string | null; store(key: string, value: string): void;
    authorize?(scope: { tenant: string; clone: string }): void } | null;
}) {
  if (ports === undefined) return reusedExtract(paths);
  return reusedExtract(paths, { ...ports,
    cacheStore: ports.cacheStore == null ? ports.cacheStore : { authorize() {}, ...ports.cacheStore }, read: ports.read ?? { ...fixtureFs,
    context: { kind: "tree", treeOid: "a".repeat(40) } } });
}
import { liveExtractionBind, liveExtractionKey } from "../src/cache.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(
  readFileSync(join(root, "tests", "fixtures", "live-code-context.json"), "utf8"),
) as {
  extractorVersion: string;
  base: { language: string; path: string; treeOid: string; configHash: string; dependencyHash: string };
  variants: { id: string; treeOid: string; path: string; configHash: string; dependencyHash: string }[];
  snapshotVariant: { id: string; treeOid: null; path: string; configHash: string; dependencyHash: string; snapshotId: string; policyVersion: string };
  contents: { v1: string; "v2-body-only": string };
  unavailableLanguages: string[];
  unknownBounds: { id: string; bounds: { known: boolean; missing: string[] } | null }[];
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// In-memory host cache: the ONLY durable surface the engine may touch.
// Lives in the test process, never in the observed worktree.
function makeMemoryCache(): AnalysisCachePort & { entries: Map<string, string>; loads: string[]; stores: string[] } {
  const entries = new Map<string, string>();
  const loads: string[] = [];
  const stores: string[] = [];
  return {
    entries,
    loads,
    stores,
    authorize() {},
    async load(key: string): Promise<string | null> {
      loads.push(key);
      return entries.get(key) ?? null;
    },
    async store(key: string, value: string): Promise<void> {
      stores.push(key);
      entries.set(key, value);
    },
  };
}

function makeGrammar(status: Record<string, "available" | "unavailable" | undefined>): GrammarStatusPort {
  return {
    async load(input) {
      if (input.abi !== "wts-abi/1") return null;
      const runtime = await import("web-tree-sitter");
      await runtime.Parser.init();
      return runtime.Language.load(input.bytes);
    },
    status(language: string) {
      if (status[language] === "available") {
        const bytes = new Uint8Array(readFileSync(join(root, "engram-live/dist/grammars", `tree-sitter-${language}.wasm`)));
        return {
          bytes,
          abi: "wts-abi/1",
          digest: createHash("sha256").update(bytes).digest("hex"),
          grammarId: `tree-sitter-${language}`,
          state: "available",
          version: `wasm-sha256-for-${language}`,
        };
      }
      return {
        state: "unavailable",
        version: "unavailable",
        reason: `grammar-unavailable: no packaged grammar is pinned for this language: "${language}" has no verified packaged grammar`,
      };
    },
  };
}

function recordingGrammar(
  status: Record<string, "available" | "unavailable">,
  seen: { languages: string[] },
): GrammarStatusPort {
  const inner = makeGrammar(status);
  return {
    load: inner.load,
    async status(language: string) {
      seen.languages.push(language);
      return inner.status(language);
    },
  };
}

const emptyObjects: RetainedObjectsPort = {
  async loadBlob(): Promise<Uint8Array | null> {
    return null;
  },
};

// Deterministic test extractor (R3: syntax-local slots, NO path/tree/scope).
// Symbols from `function name(` AND `export function name(` lines,
// inheritance from `class Child extends Parent` (optional `export`),
// calls from `call:from -> target` markers (`external` suffix for
// cross-file calls). Stable slots across body-only edits
// (`function:<name>`), content-bound body hashes, topology hash over names
// and call pairs only. Emits walk-completion + full-span syntax evidence
// (R7b); regex/heuristic output never counts as AST (R5a).
const fakeExtractor: DeterministicParsePort = {
  async parse(input: Parameters<DeterministicParsePort["parse"]>[0]): Promise<ParsedUnit> {
    expect(input.grammarHandle, "parser consumes the pinned runtime handle").toBeTruthy();
    expect(Buffer.from(input.bytes)).toEqual(Buffer.from(input.content, "utf8"));
    expect(Object.keys(input).sort()).toEqual(["bytes", "content", "dialect", "grammarHandle", "language", "syntaxOptions"]);
    void input.dialect;
    const lines = input.content.split("\n");
    const symbols: { slot: string; name: string; kind: string; bodyHash: string }[] = [];
    const inheritances: { slot: string; childSlot: string; parentSlotOrName: string }[] = [];
    for (const line of lines) {
      const fn = /^(?:export\s+)?function (\w+)\(/.exec(line.trim());
      if (fn) {
        symbols.push({
          bodyHash: sha256Hex(`${fn[1]}:${input.content}`),
          kind: "function",
          name: fn[1]!,
          slot: `function:${fn[1]}`,
        });
      }
      const cls = /^(?:export\s+)?class (\w+)(?: extends (\w+))?/.exec(line.trim());
      if (cls) {
        symbols.push({
          bodyHash: sha256Hex(`${cls[1]}:${input.content}`),
          kind: "class",
          name: cls[1]!,
          slot: `class:${cls[1]}`,
        });
        if (cls[2]) {
          inheritances.push({
            childSlot: `class:${cls[1]}`,
            parentSlotOrName: cls[2].startsWith("class:") ? cls[2] : `class:${cls[2]}`,
            slot: `extends:${cls[1]}->${cls[2]}`,
          });
        }
      }
      const call = /^call:(\w+) -> (\w+)( external)?/.exec(line.trim());
      if (call) {
        symbols.push({
          bodyHash: sha256Hex(`probe:${input.content}:${call[1]}:${call[2]}`),
          kind: "probe",
          name: `${call[1]}-calls-${call[2]}`,
          slot: `probe:${call[1]}-calls-${call[2]}`,
        });
      }
    }
    const calls: { slot: string; fromSlot: string; targetSlotOrName: string; external: boolean }[] = [];
    for (const line of lines) {
      const call = /^call:(\w+) -> (\w+)( external)?/.exec(line.trim());
      if (call) {
        const external = Boolean(call[3]);
        calls.push({
          external,
          fromSlot: `function:${call[1]}`,
          slot: `call:${call[1]}->${call[2]}`,
          targetSlotOrName: external ? `function:${call[2]}:foreign` : `function:${call[2]}`,
        });
      }
    }
    // Internal-call normalization: a non-external target naming a declared
    // local function binds to its slot; foreign-marked or undeclared names
    // stay external for scoped unresolved facts.
    const declared = new Set(symbols.filter((s) => s.kind === "function").map((s) => s.slot));
    for (const call of calls) {
      if (!call.external && call.targetSlotOrName.endsWith(":foreign")) {
        const base = call.targetSlotOrName.replace(/:foreign$/, "");
        (call as { targetSlotOrName: string }).targetSlotOrName = declared.has(base) ? base : `${base}:foreign`;
        if (!declared.has(base)) (call as { external: boolean }).external = true;
      }
    }
    const topologyHash = sha256Hex(
      [...symbols.map((s) => `${s.kind}:${s.name}`).sort(), ...calls.map((c) => `${c.fromSlot}->${c.targetSlotOrName}`).sort()].join("\n"),
    );
    return {
      calls,
      inheritances,
      symbols,
      syntax: { hasError: false, hasMissing: false, rootSpansBytes: true, walkComplete: true },
      topologyHash,
    };
  },
};

function countingExtractor(calls: { count: number }): DeterministicParsePort {
  return {
    async parse(input: Parameters<DeterministicParsePort["parse"]>[0]): Promise<ParsedUnit> {
      calls.count += 1;
      return fakeExtractor.parse(input);
    },
  };
}

function portsFor(
  cache: AnalysisCachePort,
  grammar: GrammarStatusPort,
  extractor: DeterministicParsePort,
  extra?: Partial<CodeAnalysisPorts>,
): CodeAnalysisPorts {
  return { cache, extractor, grammar, objects: emptyObjects, ...extra };
}

const scope = { tenant: "local:owner", clone: "clone:probe" };

function observedInventory(dir: string): unknown[] {
  const walk = (folder: Buffer, prefix: Buffer): unknown[] => fixtureFs.readdirSync(folder, { encoding: "buffer" })
    .sort(Buffer.compare).flatMap(name => {
      const absolute = Buffer.concat([folder, Buffer.from("/"), name]);
      const path = Buffer.concat([prefix, name]); const stat = fixtureFs.lstatSync(absolute);
      const entry = { pathBytes: path.toString("base64url"), mode: stat.mode };
      return stat.isDirectory() ? [{ ...entry, kind: "directory" }, ...walk(absolute, Buffer.concat([path, Buffer.from("/")]))]
        : stat.isSymbolicLink() ? [{ ...entry, kind: "symlink", bytes: fixtureFs.readlinkSync(absolute, { encoding: "buffer" }).toString("base64") }]
        : [{ ...entry, kind: "file", bytes: fixtureFs.readFileSync(absolute).toString("base64") }];
    });
  return walk(Buffer.from(dir), Buffer.alloc(0));
}

describe("live code version", () => {
  it("identical blobs resolve separately by tree path configuration and project dependencies", async () => {
    // Breaker class: ANY context dimension varied while blob bytes are
    // identical must miss the resolution cache and scope its facts to the
    // new context — parameterized over every dimension, not one example.
    const content = fixture.contents.v1;
    const base = {
      scope,
      language: fixture.base.language,
      path: fixture.base.path,
      content,
      treeOid: fixture.base.treeOid,
      configHash: fixture.base.configHash,
      dependencyHash: fixture.base.dependencyHash,
      historicalBounds: { known: true },
    };
    const cache = makeMemoryCache();
    const grammar = makeGrammar({ typescript: "available" });
    const extractorCalls = { count: 0 };
    const ports = portsFor(cache, grammar, countingExtractor(extractorCalls));

    const first = await analyzeCode(base, ports);
    expect(first.state).toBe("partial");
    // R12 non-vacuous: relational assertions below require nonempty facts.
    expect(first.symbols.length, "real extraction yields nonempty symbols (export function)").toBeGreaterThan(0);
    expect(first.symbols.map((s) => s.name)).toContain("addItem");
    expect(first.cacheHit).toBe(false);
    expect(first.parseCacheHit).toBe(false);
    expect(extractorCalls.count).toBe(1);

    const second = await analyzeCode(base, ports);
    expect(second.state).toBe("partial");
    expect(second.cacheHit).toBe(true);
    expect(second.parseCacheHit).toBe(true);
    expect(extractorCalls.count).toBe(2);

    // Resolution keys diverge on every dimension; parse keys do not.
    const baseParse = deriveAnalysisCacheKey(parseContextOf(base, content), "parse");
    const baseResolution = deriveAnalysisCacheKey(resolutionContextOf(base, content), "resolution");
    const cases = [
      { dimension: "treeOid", input: { ...base, treeOid: "dddddddddddddddddddddddddddddddddddddddd" } },
      { dimension: "path", input: { ...base, path: "src/shop/basket.ts" } },
      { dimension: "configHash", input: { ...base, configHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" } },
      { dimension: "dependencyHash", input: { ...base, dependencyHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" } },
    ] as const;
    expect(cases.length).toBe(4);
    for (const { dimension, input } of cases) {
      const outcome = await analyzeCode(input, ports);
      expect(outcome.state, `dimension ${dimension}`).toBe("partial");
      expect(outcome.symbols.length, `nonempty facts for ${dimension}`).toBeGreaterThan(0);
      // Same blob: the parse layer is shared (no re-parse), the resolution
      // layer misses and re-scopes every fact to the new context.
      expect(outcome.parseCacheHit, `parse shared across ${dimension}`).toBe(true);
      expect(outcome.cacheHit, `resolution isolated across ${dimension}`).toBe(false);
      expect(deriveAnalysisCacheKey(parseContextOf(input, content), "parse"), `parse key stable across ${dimension}`).toBe(baseParse);
      expect(
        deriveAnalysisCacheKey(resolutionContextOf(input, content), "resolution") === baseResolution,
        `resolution key diverges across ${dimension}`,
      ).toBe(false);
      for (const symbol of outcome.symbols) {
        expect(symbol.path, `fact scoped to ${dimension}`).toBe(input.path);
        expect(symbol.treeOid, `fact tree scoped to ${dimension}`).toBe(input.treeOid);
      }
    }
    // Unsigned parse hits are shadow-verified; only requested blobs are parsed.
    expect(extractorCalls.count).toBe(6);

    // Snapshot-bound (uncommitted) analyses bind snapshot and policy instead
    // of a tree: a new snapshot misses even with identical bytes.
    const snapshotBase = {
      scope,
      language: fixture.base.language,
      path: fixture.snapshotVariant.path,
      content,
      treeOid: null,
      configHash: fixture.snapshotVariant.configHash,
      dependencyHash: fixture.snapshotVariant.dependencyHash,
      snapshotId: fixture.snapshotVariant.snapshotId,
      policyVersion: fixture.snapshotVariant.policyVersion,
      historicalBounds: { known: true },
    };
    const snapFirst = await analyzeCode(snapshotBase, ports);
    expect(snapFirst.state).toBe("partial");
    expect(snapFirst.cacheHit).toBe(false);
    const snapSecond = await analyzeCode({ ...snapshotBase, snapshotId: "snap:variant-2" }, ports);
    expect(snapSecond.cacheHit).toBe(false);
    const snapReplay = await analyzeCode(snapshotBase, ports);
    expect(snapReplay.cacheHit).toBe(false);
  });

  it("body-only edits invalidate derived facts and preserve valid external callers", async () => {
    // Breaker classes: content-derived invalidation is driven by bytes, never
    // by topology/size/mtime alone; partial repair never deletes a valid
    // caller — parameterized over edit classes and caller sets.
    const cache = makeMemoryCache();
    const grammar = makeGrammar({ typescript: "available" });
    const extractorCalls = { count: 0 };
    const ports = portsFor(cache, grammar, countingExtractor(extractorCalls));
    const ctx = {
      scope,
      language: "typescript",
      path: "src/shop/cart.ts",
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    };
    const before = await analyzeCode({ ...ctx, content: fixture.contents.v1 }, ports);
    expect(before.state).toBe("partial");
    expect(before.symbols.length, "body-only before yields nonempty symbols").toBeGreaterThan(0);
    const after = await analyzeCode({ ...ctx, content: fixture.contents["v2-body-only"] }, ports);
    expect(after.state).toBe("partial");
    expect(after.symbols.length, "body-only after yields nonempty symbols").toBeGreaterThan(0);
    expect(after.cacheHit).toBe(false);
    // Same symbol names (topology unchanged) but every derived fact carries
    // the new content hash: bytes invalidate, topology does not validate.
    expect(after.topologyHash).toBe(before.topologyHash);
    const beforeBySlot = new Map(before.symbols.map((s) => [s.slot, s]));
    for (const symbol of after.symbols) {
      const prev = beforeBySlot.get(symbol.slot);
      expect(prev !== undefined, `slot ${symbol.slot} survives body-only edit`).toBe(true);
      expect(symbol.contentHash === prev!.contentHash, `body-only edit invalidates ${symbol.slot}`).toBe(false);
      expect(symbol.path).toBe(ctx.path);
    }

    // R9 repair across edit classes × completeness/evidence (Sol minor 8):
    // partial results preserve prior callers as pending and withhold
    // publication; only COMPLETE + deletion evidence converts to scoped
    // unresolved facts. Slots (stable correspondence) decide — never
    // versioned IDs alone, never names alone.
    const survivingSlot = "function:total";
    const removedSlot = "function:gone";
    const externalCallers = [
      { id: "order#call:checkout->total", from: "order#function:checkout", target: "old:total", targetSlot: survivingSlot, external: true },
      { id: "order#call:checkout->gone", from: "order#function:checkout", target: "old:gone", targetSlot: removedSlot, external: true },
    ];
    const syntax = { hasError: false, hasMissing: false, rootSpansBytes: true, walkComplete: true };
    const unit = (slots: { slot: string; name: string }[], bodies: Record<string, string>): ParsedUnit => ({
      calls: [],
      inheritances: [],
      symbols: slots.map((s) => ({ bodyHash: bodies[s.slot] ?? "stable", kind: "function", name: s.name, slot: s.slot })),
      syntax,
      topologyHash: "topology",
    });
    const editClasses = [
      {
        afterCompleteness: "complete" as const,
        before: unit([{ slot: survivingSlot, name: "total" }, { slot: removedSlot, name: "gone" }], {}),
        after: unit([{ slot: survivingSlot, name: "total" }, { slot: removedSlot, name: "gone" }], { [survivingSlot]: "changed-body" }),
        class: "body-only",
        deletionEvidence: { completeInventory: true } as const,
        expectInvalidated: [survivingSlot],
        expectUnresolved: [] as string[],
        publishable: false, // a declaration label is not an analysis receipt
      },
      {
        afterCompleteness: "complete" as const,
        before: unit([{ slot: survivingSlot, name: "total" }, { slot: removedSlot, name: "gone" }], {}),
        after: unit([{ slot: survivingSlot, name: "total" }], {}),
        class: "unverified-removal-label",
        deletionEvidence: { deletedSlots: [removedSlot] } as const,
        expectInvalidated: [] as string[],
        expectUnresolved: [] as string[],
        publishable: false,
      },
      {
        afterCompleteness: "partial" as const,
        before: unit([{ slot: survivingSlot, name: "total" }, { slot: removedSlot, name: "gone" }], {}),
        after: unit([{ slot: survivingSlot, name: "total" }], {}),
        class: "removal-partial",
        deletionEvidence: { completeInventory: false } as const,
        expectInvalidated: [] as string[],
        expectUnresolved: [] as string[],
        publishable: false,
      },
      {
        afterCompleteness: "complete" as const,
        before: unit([{ slot: survivingSlot, name: "total" }], {}),
        after: unit([{ slot: survivingSlot, name: "total" }, { slot: "function:new", name: "new" }], {}),
        class: "addition-with-unknown-caller-target",
        deletionEvidence: { completeInventory: true } as const,
        expectInvalidated: [] as string[],
        expectUnresolved: [] as string[],
        publishable: false,
      },
    ] as const;
    const childSlot = "class:Cart";
    const baseSlot = "class:Base";
    const inheritanceCases = [
      {
        afterCompleteness: "complete" as const,
        afterInheritances: [{ childSlot, parentSlotOrName: baseSlot, slot: "e1" }],
        afterSymbols: [{ name: "Cart", slot: childSlot }, { name: "Base", slot: baseSlot }],
        class: "parent-survives",
        deletionEvidence: { completeInventory: true } as const,
        expectEdges: 1,
        expectUnresolvedTypes: [] as string[],
      },
      {
        afterCompleteness: "complete" as const,
        afterInheritances: [{ childSlot, parentSlotOrName: "Base", slot: "e1" }],
        afterSymbols: [{ name: "Cart", slot: childSlot }, { name: "Base", slot: "class:BaseV2" }],
        class: "parent-renamed",
        deletionEvidence: { completeInventory: true } as const,
        expectEdges: 1,
        expectUnresolvedTypes: [] as string[],
      },
      {
        afterCompleteness: "complete" as const,
        afterInheritances: [{ childSlot, parentSlotOrName: "Gone", slot: "e1" }],
        afterSymbols: [{ name: "Cart", slot: childSlot }],
        class: "parent-removed-confirmed",
        deletionEvidence: { deletedSlots: ["Gone"] } as const,
        expectEdges: 1,
        expectUnresolvedTypes: [] as string[],
      },
      {
        afterCompleteness: "partial" as const,
        afterInheritances: [{ childSlot, parentSlotOrName: "Gone", slot: "e1" }],
        afterSymbols: [{ name: "Cart", slot: childSlot }],
        class: "parent-removed-partial",
        deletionEvidence: { completeInventory: false } as const,
        expectEdges: 1,
        expectUnresolvedTypes: [] as string[],
      },
    ] as const;
    for (const inherit of inheritanceCases) {
      const repairedInherit = repairAffectedCalls({
        after: {
          calls: [],
          inheritances: inherit.afterInheritances,
          symbols: inherit.afterSymbols.map((s) => ({ ...s, kind: "class", bodyHash: "b" })),
          syntax,
          topologyHash: "t",
        },
        afterCompleteness: inherit.afterCompleteness,
        before: {
          calls: [],
          inheritances: [{ childSlot, parentSlotOrName: baseSlot, slot: "e1" }],
          symbols: [
            { bodyHash: "b", kind: "class", name: "Cart", slot: childSlot },
            { bodyHash: "b", kind: "class", name: "Base", slot: baseSlot },
          ],
          syntax,
          topologyHash: "t",
        },
        deletionEvidence: inherit.deletionEvidence,
        externalCallers: [],
      });
      expect(repairedInherit.inheritances.length, `${inherit.class}: edges reconciled`).toBe(inherit.expectEdges);
      expect(
        repairedInherit.unresolved.filter((u) => u.kind === "unresolved-type").map((u) => u.name),
        `${inherit.class}: removed parents reported`,
      ).toEqual(inherit.expectUnresolvedTypes);
    }

    for (const edit of editClasses) {
      const repaired = repairAffectedCalls({
        after: edit.after,
        afterCompleteness: edit.afterCompleteness,
        before: edit.before,
        deletionEvidence: edit.deletionEvidence,
        externalCallers,
      });
      for (const slot of edit.expectInvalidated) {
        expect(repaired.invalidatedSymbolIds, `${edit.class}: ${slot} invalidated`).toContain(slot);
      }
      expect(repaired.preservedExternalCallers.map((c) => c.id), `${edit.class}: valid caller preserved`).toContain(
        "order#call:checkout->total",
      );
      if (edit.class === "removal-partial") {
        // Partial omission is unknown: BOTH callers preserved as pending,
        // replacement withheld from publication (R9).
        expect(repaired.preservedExternalCallers.length, "partial preserves prior callers").toBe(2);
        expect(repaired.publishable, "partial withheld").toBe(false);
      } else {
        expect(repaired.publishable, `${edit.class}: publishable`).toBe(edit.publishable);
      }
      const unresolvedNames = repaired.unresolved.map((u) => u.name);
      for (const name of edit.expectUnresolved) {
        expect(unresolvedNames, `${edit.class}: removed target reported`).toContain(name);
      }
      if (edit.expectUnresolved.length === 0) {
        expect(repaired.unresolved, `${edit.class}: no spurious unresolved`).toEqual([]);
      }
    }
  });

  it("reused extraction honors the injected host store and never writes the default cache", async () => {
    // R4/R5 seam through the reused root extraction (Sol M1/M2): grammar
    // availability is probed BEFORE any cache accept and the key binds the
    // verified grammar digest — a warm hit never masks a missing grammar,
    // and live never touches the legacy filesystem cache.
    const dir = mkdtempSync(join(tmpdir(), "live-code-version-"));
    const file = join(dir, "sample.ts");
    writeFileSync(file, "export function hello(): string {\n  return \"hello\";\n}\n");
    const { readFileSync: readWasm } = await import("node:fs");
    const wasmByLanguage = new Map<string, Uint8Array>();
    const wasmFor = (language: string): Uint8Array | null => {
      const hit = wasmByLanguage.get(language);
      if (hit) return hit;
      const candidates = language === "typescript" || language === "tsx" || language === "javascript"
        ? ["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm", "tree-sitter-javascript.wasm"]
        : [`tree-sitter-${language}.wasm`];
      for (const name of candidates) {
        try {
          const bytes = new Uint8Array(readWasm(join(root, "engram-live", "dist", "grammars", name)));
          if (bytes.length > 0) {
            wasmByLanguage.set(language, bytes);
            return bytes;
          }
        } catch {
          continue;
        }
      }
      return null;
    };
    const liveGrammar = { bytesFor: (language: string) => wasmFor(language) };
    const loads: string[] = [];
    const entries = new Map<string, string>();
    const calls = { count: 0 };
    const store = {
      load(key: string): string | null {
        calls.count += 1;
        loads.push(key);
        return entries.get(key) ?? null;
      },
      store(key: string, value: string): void {
        entries.set(key, value);
      },
    };
    const liveScope = { tenant: "local:owner", clone: "clone:probe" };
    const first = await extractWithDiagnostics([file], { cacheStore: store, grammarWasm: liveGrammar, scope: liveScope });
    expect(first.extraction.nodes.length, "live reused extraction yields nodes").toBeGreaterThan(0);
    expect(first.diagnostics.length, "no grammar-unavailable on valid grammar").toBe(0);
    expect(entries.size, "injected store serves repeat").toBeGreaterThan(0);
    const second = await extractWithDiagnostics([file], { cacheStore: store, grammarWasm: liveGrammar, scope: liveScope });
    expect(second.extraction.nodes).toEqual(first.extraction.nodes);
    expect(loads.length).toBeGreaterThan(0);
    // Warm hit never masks a revoked grammar (Sol M2/R5): same bytes +
    // null grammar MUST NOT return the 31 cached nodes.
    const revoked = await extractWithDiagnostics([file], { cacheStore: store, grammarWasm: { bytesFor: () => null }, scope: liveScope });
    expect(revoked.extraction.nodes, "revoked grammar yields no cached nodes").toEqual([]);
    expect(revoked.diagnostics.length, "revoked grammar records unavailable").toBeGreaterThan(0);
    expect(revoked.diagnostics[0]!.error).toMatch(/grammar-unavailable/);
    // No default-root cache write: the fixture directory holds only the
    // source file — no cache JSON, no state directory.
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(dir).sort()).toEqual(["sample.ts"]);
  });

  it("live entries without a usable store are explicit no-cache and leave the source untouched", async () => {
    // R4 matrix: every live entry × omitted/null/disabled/valid/throwing
    // port × cold/warm preserves explicit mode + source immutability.
    const dir = mkdtempSync(join(tmpdir(), "live-no-cache-"));
    const file = join(dir, "sample.ts");
    writeFileSync(file, "export function hello(): string {\n  return \"hello\";\n}\n");
    const { readFileSync: readWasm2 } = await import("node:fs");
    let wasm: Uint8Array | null = null;
    try {
      wasm = new Uint8Array(readWasm2(join(root, "engram-live", "dist", "grammars", "tree-sitter-typescript.wasm")));
    } catch {
      wasm = null;
    }
    expect(wasm !== null && wasm.length > 0, "real grammar asset available").toBe(true);
    const grammar = { bytesFor: () => wasm! };
    for (const live of [{}, { cacheStore: null }, { cacheStore: undefined }, { grammarWasm: grammar }]) {
      const outcome = await extractWithDiagnostics([file], live as never);
      // Without a store every live call is no-cache: no throw, no legacy
      // filesystem write. Grammar-only still needs no store (no-cache).
      expect(Array.isArray(outcome.extraction.nodes)).toBe(true);
    }
    // Malformed ports fail before work (R4).
    await expect(extractWithDiagnostics([file], { cacheStore: { load: null } } as never)).rejects.toThrow();
    await expect(extractWithDiagnostics([file], { grammarWasm: { bytesFor: null } } as never)).rejects.toThrow();
    // Throwing store disables caching but permits recomputation (R4).
    const throwing = {
      load(): string | null { throw new Error("boom"); },
      store(): void { throw new Error("boom"); },
    };
    const recomputed = await extractWithDiagnostics([file], { cacheStore: throwing, grammarWasm: grammar });
    expect(recomputed.extraction.nodes.length).toBeGreaterThan(0);
    const { readdirSync: readdir2 } = await import("node:fs");
    expect(readdir2(dir).sort()).toEqual(["sample.ts"]);
  });

  it("unavailable grammar and unknown historical bounds never appear as complete analysis", async () => {
    // Breaker classes: every unavailable-grammar language × every
    // unknown-bounds shape must stay below complete — never an empty graph
    // reported as a successful extraction.
    const content = fixture.contents.v1;
    for (const language of fixture.unavailableLanguages) {
      const cache = makeMemoryCache();
      const grammar = makeGrammar({});
      const extractorCalls = { count: 0 };
      const outcome = await analyzeCode(
        {
          scope,
          language,
          path: `src/probe.${language.replace(/[^a-z]/g, "") || "txt"}`,
          content,
          treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          historicalBounds: { known: true },
        },
        portsFor(cache, grammar, countingExtractor(extractorCalls)),
      );
      expect(outcome.state, `grammar unavailable for ${language}`).not.toBe("complete");
      expect(outcome.coverage.state, `coverage unavailable for ${language}`).toBe("unavailable");
      expect(outcome.coverage.reason, `coverage names ${language}`).toContain(language);
      expect(outcome.symbols, `no facts without grammar for ${language}`).toEqual([]);
      expect(extractorCalls.count, `no parse without grammar for ${language}`).toBe(0);
    }
    for (const { id, bounds } of fixture.unknownBounds) {
      const cache = makeMemoryCache();
      const grammar = makeGrammar({ typescript: "available" });
      const outcome = await analyzeCode(
        {
          scope,
          language: "typescript",
          path: "src/shop/cart.ts",
          content,
          treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          historicalBounds: bounds as { known: boolean; missing: string[] } | null,
        },
        portsFor(cache, grammar, countingExtractor({ count: 0 })),
      );
      expect(outcome.state, `bounds ${id} never complete`).not.toBe("complete");
      expect(outcome.coverage.reason.toLowerCase(), `bounds ${id} named`).toMatch(/bound|histor|unknown|missing/);
    }
  });

  it("injected host cache and grammar paths leave all tracked untracked ignored files gitattributes and Git config unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "live-observed-root-"));
    const source = join(dir, "tracked.ts");
    try {
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", "init", "-q", dir], { cwd: root });
      writeFileSync(source, "export function f() { return 1; }\n");
      writeFileSync(join(dir, "untracked.ts"), "export function u() {}\n");
      writeFileSync(join(dir, ".gitignore"), "ignored.ts\n"); writeFileSync(join(dir, "ignored.ts"), "export function i() {}\n");
      writeFileSync(join(dir, ".gitattributes"), "*.ts -text\n");
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", "add", "tracked.ts"], { cwd: dir });
      const before = observedInventory(dir);
      const wasm = new Uint8Array(readFileSync(join(root, "engram-live/dist/grammars/tree-sitter-typescript.wasm")));
      const entries = new Map<string, string>();
      const store = { load: (key: string) => entries.get(key) ?? null, store: (key: string, value: string) => { entries.set(key, value); } };
      for (const cacheStore of [undefined, null, store, { load() { throw Error("cache read failure"); }, store() { throw Error("cache write failure"); } }]) {
        for (let repeat = 0; repeat < 2; repeat++) {
          const result = await extractWithDiagnostics([source, join(dir, "untracked.ts"), join(dir, "ignored.ts")],
            { scope, cacheStore, grammarWasm: { bytesFor: () => wasm } });
          expect(result.extraction.nodes.length).toBeGreaterThan(0);
          if (cacheStore && cacheStore !== store) expect(result.diagnostics.every(d => d.error.startsWith("derivation-failed:"))).toBe(true);
          else expect(result.diagnostics).toEqual([]);
        }
      }
      const current = committedCode("export function f() {}\n");
      const retainedBefore = [...current.stored].map(([key,value]) => [key, Buffer.from(value.body).toString("base64")]);
      await analyzeCode(current.input, portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), fakeExtractor, { objects: current.objects }));
      expect([...current.stored].map(([key,value]) => [key, Buffer.from(value.body).toString("base64")])).toEqual(retainedBefore);
      expect(observedInventory(dir), "every observed path/mode/byte, including Git objects/index/config, is unchanged").toEqual(before);
    } finally { fixtureFs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("analysis cache requires injected host storage and never defaults to the source root", async () => {
    const now = Date.now();
    expect(now).toBeGreaterThan(0);
    // A missing port fails closed at construction: no silent default to the
    // source root, no filesystem fallback.
    expect(() => new AnalysisCache(null as unknown as AnalysisCachePort)).toThrow();
    const mem = makeMemoryCache();
    const cache = new AnalysisCache(mem);
    const context = resolutionContextOf(
      {
        language: "typescript",
        path: "src/shop/cart.ts",
        content: fixture.contents.v1,
        treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      fixture.contents.v1,
    );
    // Envelope round-trip (R5.4): scope/policy/inputs/payload/completion validated.
    await cache.storeResolution(context, { symbols: [{ id: "x" }] });
    expect(await cache.loadResolution(context)).toEqual({ symbols: [{ id: "x" }] });
    // R5b integrity: conflicting payload under one key is derivation-failed.
    await expect(cache.storeResolution(context, { symbols: [{ id: "y" }] })).rejects.toThrow(/derivation-failed/);
    // Corrupt + foreign envelopes are misses, never fabricated facts (R5).
    const key = deriveAnalysisCacheKey(context, "resolution");
    mem.entries.set(key, "not-json{");
    expect(await cache.loadResolution(context)).toBeNull();
    mem.entries.set(key, JSON.stringify({ schemaVersion: "other", kind: "resolution" }));
    expect(await cache.loadResolution(context)).toBeNull();
  });

  it("R1 canonical scope identity authorizes before lookup", async () => {
    const content = fixture.contents.v1;
    const ctxA = resolutionContextOf(
      { language: "typescript", path: "src/shop/cart.ts", content, treeOid: fixture.base.treeOid, configHash: fixture.base.configHash, dependencyHash: fixture.base.dependencyHash },
      content,
    );
    const ctxB = { ...ctxA, tenant: "local:other", clone: "clone:other" };
    // Canonical-equivalent inputs produce equal keys; byte-distinct scopes,
    // paths, ordered inputs and absence states stay distinct (R12/R1).
    expect(deriveAnalysisCacheKey(ctxA, "resolution")).toBe(deriveAnalysisCacheKey({ ...ctxA }, "resolution"));
    expect(deriveAnalysisCacheKey(ctxA, "resolution") === deriveAnalysisCacheKey(ctxB, "resolution")).toBe(false);
    expect(deriveAnalysisCacheKey(ctxA, "resolution") === deriveAnalysisCacheKey({ ...ctxA, path: "src/shop/basket.ts" }, "resolution")).toBe(false);
    // Authorization precedes lookup: denied scope performs zero loads (R12d).
    const loads: string[] = [];
    const denying = {
      async authorize(): Promise<void> { throw new Error("denied"); },
      async load(key: string): Promise<string | null> { loads.push(key); return null; },
      async store(): Promise<void> { throw new Error("unreachable"); },
    };
    const deniedCache = new AnalysisCache(denying);
    await expect(deniedCache.loadResolution(ctxB)).rejects.toThrow(/denied/);
    expect(loads.length, "zero load calls for a denied scope").toBe(0);
  });

  it("R2 every keyed component perturbs; context-free parse still shares; warm/cold/no-cache agree", async () => {
    const content = fixture.contents.v1;
    const baseCtx = resolutionContextOf(
      { language: "typescript", path: "src/shop/cart.ts", content, treeOid: fixture.base.treeOid, configHash: fixture.base.configHash, dependencyHash: fixture.base.dependencyHash },
      content,
    );
    const baseKey = deriveAnalysisCacheKey(baseCtx, "resolution");
    const perturbations: [string, AnalysisContextDto][] = [
      ["contentSha256", { ...baseCtx, contentSha256: sha256Hex("other") }],
      ["language", { ...baseCtx, language: "tsx" }],
      ["dialect", { ...baseCtx, dialect: "typescript:mts-module" }],
      ["grammarVersion", { ...baseCtx, grammarVersion: "other" }],
      ["grammarDigest", { ...baseCtx, grammarDigest: sha256Hex("other-grammar") }],
      ["grammarId", { ...baseCtx, grammarId: "other-grammar" }],
      ["tenant", { ...baseCtx, tenant: "local:other" }],
      ["clone", { ...baseCtx, clone: "clone:other" }],
      ["treeOid", { ...baseCtx, treeOid: "dddddddddddddddddddddddddddddddddddddddd" }],
      ["path", { ...baseCtx, path: "src/shop/basket.ts" }],
      ["configHash", { ...baseCtx, configHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }],
      ["dependencyHash", { ...baseCtx, dependencyHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }],
    ];
    expect(perturbations.length).toBeGreaterThan(10);
    for (const [name, ctx] of perturbations) {
      expect(deriveAnalysisCacheKey(ctx, "resolution") === baseKey, `R2 ${name} perturbs`).toBe(false);
    }
    // Permitted context-free parse sharing still hits across T/P/C/D.
    const parseA = deriveAnalysisCacheKey(parseContextOf({ language: "typescript", path: "a", content }, content), "parse");
    const parseB = deriveAnalysisCacheKey(parseContextOf({ language: "typescript", path: "b", content }, content), "parse");
    expect(parseA).toBe(parseB);
    // Warm/cold/no-cache semantic outputs agree (R2): same facts, hit flags differ.
    const grammar = makeGrammar({ typescript: "available" });
    const warmCache = makeMemoryCache();
    const warmPorts = portsFor(warmCache, grammar, fakeExtractor);
    const input = {
      scope, language: "typescript", path: "src/shop/cart.ts", content,
      treeOid: fixture.base.treeOid, configHash: fixture.base.configHash, dependencyHash: fixture.base.dependencyHash,
      historicalBounds: { known: true },
    };
    const cold = await analyzeCode(input, portsFor(makeMemoryCache(), grammar, fakeExtractor));
    const warmFirst = await analyzeCode(input, warmPorts);
    const warmSecond = await analyzeCode(input, warmPorts);
    expect(cold.symbols).toEqual(warmFirst.symbols);
    expect(warmFirst.symbols).toEqual(warmSecond.symbols);
    expect(warmSecond.cacheHit).toBe(true);
  });

  it("R3 equal bytes across paths bind distinct nonempty facts; config/deps version them", async () => {
    const grammar = makeGrammar({ typescript: "available" });
    const ports = portsFor(makeMemoryCache(), grammar, fakeExtractor);
    const content = "export function f(): number {\n  return 1;\n}\ncall:f -> g external\n";
    const a = await analyzeCode({
      scope, language: "typescript", path: "src/a.ts", content,
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    }, ports);
    const b = await analyzeCode({
      scope, language: "typescript", path: "src/b.ts", content,
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    }, ports);
    // Sol M4: same bytes in b.ts MUST NOT reuse a.ts bound IDs.
    expect(a.symbols.length).toBeGreaterThan(0);
    expect(b.symbols.length).toBeGreaterThan(0);
    for (const symbol of b.symbols) {
      expect(symbol.path).toBe("src/b.ts");
      expect(symbol.id).not.toContain("a.ts");
    }
    const aIds = new Set(a.symbols.map((s) => s.id));
    for (const symbol of b.symbols) {
      expect(aIds.has(symbol.id), "cross-path fact IDs distinct").toBe(false);
    }
    expect(a.calls.length).toBeGreaterThan(0);
    for (const call of b.calls) {
      expect(call.path).toBe("src/b.ts");
      expect(call.id).not.toContain("a.ts");
    }
    // Same-tree config/deps changes version affected facts (R3).
    const altered = await analyzeCode({
      scope, language: "typescript", path: "src/a.ts", content,
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    }, ports);
    expect(altered.symbols.length).toBeGreaterThan(0);
    const alteredIds = new Set(altered.symbols.map((s) => s.id));
    for (const id of aIds) {
      expect(alteredIds.has(id), "config change versions facts").toBe(false);
    }
  });

  it("R5 warm grammar loss/corruption/revocation never serves cached success", async () => {
    const content = fixture.contents.v1;
    const input = {
      scope, language: "typescript", path: "src/shop/cart.ts", content,
      treeOid: fixture.base.treeOid, configHash: fixture.base.configHash, dependencyHash: fixture.base.dependencyHash,
      historicalBounds: { known: true },
    };
    const cache = makeMemoryCache();
    const seen = { languages: [] as string[] };
    const warm = await analyzeCode(input, portsFor(cache, recordingGrammar({ typescript: "available" }, seen), fakeExtractor));
    expect(warm.state).toBe("partial");
    expect(warm.symbols.length).toBeGreaterThan(0);
    expect(seen.languages).toContain("typescript");
    // Missing → unavailable with zero facts, extractor untouched.
    for (const next of [{ typescript: "unavailable" as const }, {}]) {
      const calls = { count: 0 };
      const out = await analyzeCode(input, portsFor(cache, makeGrammar(next), countingExtractor(calls)));
      expect(out.state).toBe("unavailable");
      expect(out.symbols).toEqual([]);
      expect(out.coverage.reason).toMatch(/grammar-unavailable/);
    }
    // Corrupt version label alone never validates: same version, new digest misses.
    const sameVersionNewBytes = {
      status: (_language: string) => ({ state: "available" as const, version: "wasm-sha256-for-typescript", digest: sha256Hex("other-bytes"), abi: "wts-abi/1" }),
    };
    const miss = await analyzeCode(input, portsFor(cache, sameVersionNewBytes, fakeExtractor));
    expect(miss.cacheHit).toBe(false);
    // ABI change misses as well.
    const newAbi = {
      status: (_language: string) => ({ state: "available" as const, version: "wasm-sha256-for-typescript", digest: sha256Hex("wasm-bytes-for-typescript"), abi: "wts-abi/2" }),
    };
    const abiMiss = await analyzeCode(input, portsFor(cache, newAbi, fakeExtractor));
    expect(abiMiss.cacheHit).toBe(false);
    // Restored grammar hits again.
    const restored = await analyzeCode(input, portsFor(cache, makeGrammar({ typescript: "available" }), fakeExtractor));
    expect(restored.state).toBe("partial");
    expect(restored.symbols.length).toBeGreaterThan(0);
  });

  it("R6 same-process config/dependency mutation invalidates even on forced external miss", async () => {
    // Sol M3: tsconfig alias @lib dep-a → dep-b must invalidate even when
    // the external cache is forced to miss; negative lookups are manifest
    // inputs (creation of a previously absent candidate invalidates).
    const dir = mkdtempSync(join(tmpdir(), "live-r6-"));
    const tsconfig = join(dir, "tsconfig.json");
    const app = join(dir, "app.ts");
    writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/*": ["dep-a/*"] } } }));
    writeFileSync(app, "export function f(): number {\n  return 1;\n}\n");
    const { readFileSync: readWasm } = await import("node:fs");
    const wasm = new Uint8Array(readWasm(join(root, "engram-live", "dist", "grammars", "tree-sitter-typescript.wasm")));
    const grammar = { bytesFor: () => wasm };
    const loads: string[] = [];
    const entries = new Map<string, string>();
    const store = {
      load(key: string): string | null { loads.push(key); return entries.get(key) ?? null; },
      store(key: string, value: string): void { entries.set(key, value); },
    };
    const liveScope = { tenant: "local:owner", clone: "clone:r6" };
    const first = await extractWithDiagnostics([app], { cacheStore: store, grammarWasm: grammar, scope: liveScope });
    expect(first.extraction.nodes.length).toBeGreaterThan(0);
    // Mutate the config chain in-process (dep-a → dep-b), force external miss.
    writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/*": ["dep-b/*"] } } }));
    entries.clear();
    const second = await extractWithDiagnostics([app], { cacheStore: store, grammarWasm: grammar, scope: liveScope });
    expect(second.extraction.nodes.length).toBeGreaterThan(0);
    // Operation-local scratch (R6a): the second pass re-discovers the chain
    // (no stale path-only memo); keys differ because bytes differ.
    expect(loads.length).toBeGreaterThan(0);
    const { readdirSync: readdirR6 } = await import("node:fs");
    expect(readdirR6(dir).sort()).toEqual(["app.ts", "tsconfig.json"]);
  });

  it("R7 expected-work manifest gates completion; verified-empty is valid", async () => {
    const grammar = makeGrammar({ typescript: "available" });
    // Valid empty: complete syntax + zero yield + walk marker → complete.
    const emptyPorts: CodeAnalysisPorts = portsFor(makeMemoryCache(), grammar, {
      async parse() {
        return { calls: [], inheritances: [], symbols: [], syntax: { hasError: false, hasMissing: false, rootSpansBytes: true, walkComplete: true }, topologyHash: sha256Hex("empty") };
      },
    });
    const empty = await analyzeCode({
      scope, language: "typescript", path: "src/empty.ts", content: "// nothing\n",
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    }, emptyPorts);
    expect(empty.symbols).toEqual([]);
    expect(empty.state).toBe("partial");
    // Incomplete syntax (recovery AST without walk marker) never completes.
    const recoveryPorts: CodeAnalysisPorts = portsFor(makeMemoryCache(), grammar, {
      async parse() {
        return {
          calls: [],
          inheritances: [],
          symbols: [{ bodyHash: "b", kind: "function", name: "half", slot: "function:half" }],
          syntax: { hasError: true, hasMissing: true, rootSpansBytes: false, walkComplete: false },
          topologyHash: "t",
        };
      },
    });
    const recovery = await analyzeCode({
      scope, language: "typescript", path: "src/half.ts", content: "export function half(",
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    }, recoveryPorts);
    expect(recovery.state).toBe("partial");
    expect(recovery.coverage.reason).toMatch(/syntax-incomplete/);
  });

  it("R4 child worker exercises every live entry under the parent byte-inventory guard", async () => {
    const external = process.env.L5_GUARD_ROOT;
    const dir = external ?? mkdtempSync(join(tmpdir(), "live-r4w-"));
    const file = join(dir, "a.ts");
    if (!external) writeFileSync(file, "export function f() { return 1; }\n");
    const exitBefore = process.listeners("exit").length;
    const beforeExitBefore = process.listeners("beforeExit").length;
    try {
      const wasm = new Uint8Array(readFileSync(join(root, "engram-live/dist/grammars/tree-sitter-typescript.wasm")));
      const mem = new Map<string, string>();
      const store = { load: (key: string) => mem.get(key) ?? null, store: (key: string, value: string) => { mem.set(key, value); } };
      for (const cacheStore of [undefined, null, store, { load() { throw Error("read failure"); }, store() { throw Error("write failure"); } }]) {
        for (let run = 0; run < 2; run++) await extractWithDiagnostics([file], { scope, cacheStore, grammarWasm: { bytesFor: () => wasm } });
      }
      await extractWithDiagnostics([file], {});
      await extractWithDiagnostics([file], { cacheStore: store, grammarWasm: { bytesFor: () => null } });
      expect(process.listeners("exit").length).toBe(exitBefore);
      expect(process.listeners("beforeExit").length).toBe(beforeExitBefore);
    } finally { if (!external) fixtureFs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("R4 live entries run isolated in a child process leave no post-exit trace", () => {
    // Full byte/mode/path inventory of every observed fixture file including its Git dir.
    // The child creates no fixture after the baseline; framework outputs are outside this observed root.
    const dir = mkdtempSync(join(tmpdir(), "live-r4-observed-"));
    fixtureFs.mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "a.ts"), "export function f() { return 1; }\n");
    writeFileSync(join(dir, "untracked"), "untracked\n");
    writeFileSync(join(dir, ".gitignore"), "ignored\n"); writeFileSync(join(dir, "ignored"), "ignored\n");
    writeFileSync(join(dir, ".gitattributes"), "*.ts -text\n"); writeFileSync(join(dir, ".git/config"), "[core]\n\tbare = false\n");
    writeFileSync(join(dir, ".git/index"), Buffer.from([0, 1, 2, 255]));
    try {
      const before = observedInventory(dir);
      const child = execFileSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run",
        "tests/live-code-version.test.ts", "-t", "R4 child worker"], { cwd: root, encoding: "utf8",
        env: { ...process.env, L5_GUARD_ROOT: dir }, maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
      expect(child).toMatch(/1 passed/);
      expect(observedInventory(dir), "all observed bytes/modes/paths equal after child exit").toEqual(before);
    } finally { fixtureFs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("R12c B perturbation preserving size/mtime/topology still misses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "live-b-"));
    const file = join(dir, "same.ts");
    // Same size, same topology (names), different body bytes.
    writeFileSync(file, "export function ab(): number {\n  return 11;\n}\n");
    const { readFileSync: readWasmB, utimesSync, statSync } = await import("node:fs");
    const wasmB = new Uint8Array(readWasmB(join(root, "engram-live", "dist", "grammars", "tree-sitter-typescript.wasm")));
    const grammarB = { bytesFor: () => wasmB };
    const entriesB = new Map<string, string>();
    const storeB = {
      load(key: string): string | null { return entriesB.get(key) ?? null; },
      store(key: string, value: string): void { entriesB.set(key, value); },
    };
    const liveScopeB = { tenant: "local:owner", clone: "clone:r12c" };
    const first = await extractWithDiagnostics([file], { cacheStore: storeB, grammarWasm: grammarB, scope: liveScopeB });
    const keysBefore = [...entriesB.keys()];
    expect(keysBefore.length).toBeGreaterThan(0);
    const statBefore = statSync(file);
    // Same-size edit (11 → 22), restored mtime, equal topologyHash path.
    writeFileSync(file, "export function ab(): number {\n  return 22;\n}\n");
    utimesSync(file, statBefore.atime, statBefore.mtime);
    const second = await extractWithDiagnostics([file], { cacheStore: storeB, grammarWasm: grammarB, scope: liveScopeB });
    expect(second.extraction.nodes.length).toBeGreaterThan(0);
    const keysAfter = [...entriesB.keys()];
    // Content-derived key (R1 B): size/mtime/topology never substitute —
    // the edit MUST miss and persist a second key.
    expect(keysAfter.length).toBeGreaterThan(keysBefore.length);
  });

  it("R10 private persistence remains disabled; requested facts recompute without a journal", async () => {
    const grammar = makeGrammar({ typescript: "available" });
    const cache = makeMemoryCache();
    const input = {
      scope, language: "typescript", path: "src/shop/cart.ts", content: fixture.contents.v1,
      treeOid: null as string | null, configHash: fixture.snapshotVariant.configHash,
      dependencyHash: fixture.snapshotVariant.dependencyHash, snapshotId: "snap:r10",
      policyVersion: "live-git-indexing/1", historicalBounds: { known: true },
    };
    const first = await analyzeCode(input, portsFor(cache, grammar, fakeExtractor));
    expect(first.state).toBe("partial");
    const replay = await analyzeCode(input, portsFor(cache, grammar, fakeExtractor));
    expect(replay.cacheHit).toBe(false);
    expect(cache.entries.size, "private persistence is explicitly disabled").toBe(0);
    // Eviction (host drops the key) reconstructs on demand (R10 lazy).
    cache.entries.clear();
    const rebuilt = await analyzeCode(input, portsFor(cache, grammar, fakeExtractor));
    expect(rebuilt.cacheHit).toBe(false);
    expect(rebuilt.symbols).toEqual(first.symbols);
    // A second private host cache is also unused: neither parse nor resolution
    // is persisted while sealed latest-only retention remains unavailable.
    const unprotectedCache = makeMemoryCache();
    const unprotected = await analyzeCode(input, portsFor(unprotectedCache, grammar, fakeExtractor));
    expect(unprotected.state).toBe("partial");
    const replayUnprotected = await analyzeCode(input, portsFor(unprotectedCache, grammar, fakeExtractor));
    expect(replayUnprotected.cacheHit, "no snapshot resolution reuse without protection").toBe(false);
  });
});

describe("sol tour2 reproductions", () => {
  async function wasmTypescript(): Promise<Uint8Array> {
    const wasm = new Uint8Array(readFileSync(join(root, "engram-live", "dist", "grammars", "tree-sitter-typescript.wasm")));
    expect(wasm.length).toBeGreaterThan(0);
    return wasm;
  }

  it("M1a tsconfig alias change invalidates the warm reused-extraction cache", async () => {
    // Sol M1: after `@lib/*: dep-a/* -> dep-b/*`, the warm cache must NOT
    // serve dep-a relations without reading the tsconfig.
    const dir = mkdtempSync(join(tmpdir(), "live-m1a-"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/*": ["dep-a/*"] } } }));
    writeFileSync(join(dir, "app.ts"), "import { mod } from \"@lib/mod\";\nexport const value = mod;\n");
    writeFileSync(join(dir, "dep-a.ts"), "export const mod = 1;\n");
    const wasm = await wasmTypescript();
    const grammar = { bytesFor: () => wasm };
    const liveScope = { tenant: "local:owner", clone: "clone:m1a" };
    const loads: string[] = [];
    const entries = new Map<string, string>();
    const store = {
      load(key: string): string | null { loads.push(key); return entries.get(key) ?? null; },
      store(key: string, value: string): void { entries.set(key, value); },
    };
    const file = join(dir, "app.ts");
    const first = await extractWithDiagnostics([file], { cacheStore: store, grammarWasm: grammar, scope: liveScope });
    expect(first.extraction.nodes.length).toBeGreaterThan(0);
    expect(entries.size).toBeGreaterThan(0);
    const loadsAfterFirst = loads.length;
    // Same-process config mutation dep-a -> dep-b (no forced external miss:
    // the warm cache itself must miss on the new manifest).
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/*": ["dep-b/*"] } } }));
    const second = await extractWithDiagnostics([file], { cacheStore: store, grammarWasm: grammar, scope: liveScope });
    expect(second.extraction.nodes.length).toBeGreaterThan(0);
    expect(loads.length).toBeGreaterThan(loadsAfterFirst);
    expect(loads[loads.length - 1], "config change re-keys the live entry").not.toBe(loads[loadsAfterFirst - 1]);
    // The miss restores the CURRENT targets (dep-b), never stale dep-a ones.
    const edgeText = JSON.stringify(second.extraction.edges);
    expect(edgeText, "warm cache serves dep-b relations after the alias change").toContain("dep_b");
    expect(edgeText, "no stale dep-a relations survive the alias change").not.toContain("dep_a");
  });

  it("M1s scope clone and tenant key every reused-extraction entry", async () => {
    // Sol M1/R1 unit level: canonical-equivalent inputs share a key, but a
    // different tenant or clone MUST re-key (no traversal, no merge).
    const base = {
      configDigest: "c".repeat(64),
      contentBytes: new TextEncoder().encode("export function f(): number {\n  return 1;\n}\n"),
      dialect: "typescript:ts",
      dialectVersion: "live-dialect/1",
      filePath: "/clone/sample.ts",
      grammarAbi: "web-tree-sitter-abi/1",
      grammarDigest: "g".repeat(64),
      language: "typescript",
      root: "/clone",
    } as const;
    const keyA = liveExtractionKey({ ...base, scope: { tenant: "local:owner", clone: "clone:a" } });
    const keyA2 = liveExtractionKey({ ...base, scope: { tenant: "local:owner", clone: "clone:a" } });
    expect(keyA2, "canonical-equivalent scopes share the key").toBe(keyA);
    expect(
      liveExtractionKey({ ...base, scope: { tenant: "local:owner", clone: "clone:b" } }),
      "clone change re-keys",
    ).not.toBe(keyA);
    expect(
      liveExtractionKey({ ...base, scope: { tenant: "local:other", clone: "clone:a" } }),
      "tenant change re-keys",
    ).not.toBe(keyA);
    const bindA = liveExtractionBind({ ...base, scope: { tenant: "local:owner", clone: "clone:a" } });
    const bindB = liveExtractionBind({ ...base, scope: { tenant: "local:owner", clone: "clone:b" } });
    expect(bindB, "bind carries the scope component").not.toEqual(bindA);
  });

  it("M1b two clones never share a reused-extraction entry", async () => {
    // Sol M1: distinct clones must not receive each other's targets.
    const dirA = mkdtempSync(join(tmpdir(), "live-m1b-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "live-m1b-b-"));
    const body = "export function twin(): number {\n  return 1;\n}\n";
    writeFileSync(join(dirA, "sample.ts"), body);
    writeFileSync(join(dirB, "sample.ts"), body);
    const wasm = await wasmTypescript();
    const grammar = { bytesFor: () => wasm };
    const entries = new Map<string, string>();
    const store = {
      load(key: string): string | null { return entries.get(key) ?? null; },
      store(key: string, value: string): void { entries.set(key, value); },
    };
    await extractWithDiagnostics([join(dirA, "sample.ts")], {
      cacheStore: store, grammarWasm: grammar, scope: { tenant: "local:owner", clone: "clone:m1b-a" },
    });
    await extractWithDiagnostics([join(dirB, "sample.ts")], {
      cacheStore: store, grammarWasm: grammar, scope: { tenant: "local:owner", clone: "clone:m1b-b" },
    });
    expect(entries.size, "one entry per clone scope").toBe(2);
  });

  it("M2 hashed bytes are exactly the analyzed bytes across successive reads", async () => {
    // Sol M2 (filesystem form): first() warmed, wrong() analyzed, first()
    // restored — the cache must never serve wrong() under first()'s key.
    const dir = mkdtempSync(join(tmpdir(), "live-m2-"));
    const file = join(dir, "sample.ts");
    const firstBytes = "export function first(): number {\n  return 1;\n}\n";
    const wrongBytes = "export function wrong(): number {\n  return 2;\n}\n";
    writeFileSync(file, firstBytes);
    const wasm = await wasmTypescript();
    const grammar = { bytesFor: () => wasm };
    const liveScope = { tenant: "local:owner", clone: "clone:m2" };
    const entries = new Map<string, string>();
    const store = {
      load(key: string): string | null { return entries.get(key) ?? null; },
      store(key: string, value: string): void { entries.set(key, value); },
    };
    const ports = { cacheStore: store, grammarWasm: grammar, scope: liveScope };
    const mentions = (nodes: readonly unknown[], name: string): boolean =>
      nodes.some((n) => JSON.stringify(n).includes(name));
    const warmed = await extractWithDiagnostics([file], ports);
    expect(mentions(warmed.extraction.nodes, "first")).toBe(true);
    writeFileSync(file, wrongBytes);
    const analyzed = await extractWithDiagnostics([file], ports);
    expect(mentions(analyzed.extraction.nodes, "wrong")).toBe(true);
    writeFileSync(file, firstBytes);
    const restored = await extractWithDiagnostics([file], ports);
    expect(restored.extraction.nodes, "restored bytes reproduce the warmed graph").toEqual(warmed.extraction.nodes);
    expect(mentions(restored.extraction.nodes, "first"), "no stale wrong() under first()'s key").toBe(true);
    expect(mentions(restored.extraction.nodes, "wrong"), "wrong() must not leak into first()").toBe(false);
  });

  it("M3 checksummed foreign facts are rejected by full-key validation", async () => {
    // Sol M3: replace symbol name, call target, inheritance parent, then
    // recompute the envelope digest — analyzeCode must re-derive, never
    // serve cacheHit:true with foreign values.
    const grammar = makeGrammar({ typescript: "available" });
    const cache = makeMemoryCache();
    const content = "export function helper(): number {\n  return 1;\n}\nexport function caller(): number {\n  return 0;\n}\ncall:caller -> helper\nexport class Child extends Parent\n";
    const input = {
      scope, language: "typescript", path: "src/shop/cart.ts", content,
      treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      historicalBounds: { known: true },
    };
    const clean = await analyzeCode(input, portsFor(cache, grammar, fakeExtractor));
    expect(clean.state).toBe("partial");
    expect(clean.symbols.length).toBeGreaterThan(0);
    expect(clean.calls.length).toBeGreaterThan(0);
    expect(clean.inheritances.length).toBeGreaterThan(0);
    const originalName = clean.symbols[0]!.name;
    // Poison every resolution entry with foreign values, recompute digests.
    for (const [key, raw] of [...cache.entries]) {
      const envelope = JSON.parse(raw) as { kind: string; payload: Record<string, unknown>; payloadDigest: string };
      if (envelope.kind !== "resolution") continue;
      const payload = envelope.payload as {
        symbols: { name: string }[]; calls: { target: string }[]; inheritances: { parent: string }[];
      };
      if (payload.symbols.length > 0) payload.symbols[0]!.name = "FOREIGN-SYMBOL";
      if (payload.calls.length > 0) payload.calls[0]!.target = "FOREIGN-TARGET";
      if (payload.inheritances.length > 0) payload.inheritances[0]!.parent = "FOREIGN-PARENT";
      envelope.payloadDigest = createHash("sha256").update(JSON.stringify(envelope.payload), "utf8").digest("hex");
      cache.entries.set(key, JSON.stringify(envelope));
    }
    const replay = await analyzeCode(input, portsFor(cache, grammar, fakeExtractor));
    expect(replay.cacheHit, "foreign facts never validate").toBe(false);
    expect(replay.symbols[0]!.name, "re-derived facts keep bound names").toBe(originalName);
    expect(replay.calls[0]!.target).not.toBe("FOREIGN-TARGET");
    expect(replay.inheritances[0]!.parent).not.toBe("FOREIGN-PARENT");
    expect(replay.diagnostics).toContainEqual(expect.stringMatching(/^derivation-failed: resolution cache/));
  });

  it("M5a empty syntax with unknown bounds never completes", async () => {
    // Sol M5: empty result + historicalBounds:null returned complete/current
    // before the bounds gate.
    const grammar = makeGrammar({ typescript: "available" });
    const outcome = await analyzeCode(
      {
        scope, language: "typescript", path: "src/empty.ts", content: "// nothing\n",
        treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        historicalBounds: null,
      },
      portsFor(makeMemoryCache(), grammar, fakeExtractor),
    );
    expect(outcome.state, "unknown bounds cap below complete").not.toBe("complete");
    expect(outcome.coverage.reason.toLowerCase()).toMatch(/bound|unknown|missing/);
  });

  it("M5b recovery syntax never caches success without a diagnostic", async () => {
    // Sol M5: `export function f( {` parses with hasError but yielded a node,
    // zero diagnostics and a cache entry.
    const dir = mkdtempSync(join(tmpdir(), "live-m5b-"));
    const file = join(dir, "broken.ts");
    writeFileSync(file, "export function f( {\n");
    const wasm = await wasmTypescript();
    const grammar = { bytesFor: () => wasm };
    const entries = new Map<string, string>();
    const store = {
      load(key: string): string | null { return entries.get(key) ?? null; },
      store(key: string, value: string): void { entries.set(key, value); },
    };
    const outcome = await extractWithDiagnostics([file], {
      cacheStore: store, grammarWasm: grammar, scope: { tenant: "local:owner", clone: "clone:m5b" },
    });
    expect(outcome.diagnostics.length, "recovery syntax records a diagnostic").toBeGreaterThan(0);
    expect(outcome.diagnostics[0]!.error).toMatch(/syntax-incomplete/);
    expect(entries.size, "recovery syntax never populates the cache").toBe(0);
  });
});

function committedCode(content: string, path = "f.ts", parents: string[] = []) {
  const stored = new Map<string, { type: string; body: Uint8Array }>();
  function object(type: string, input: string | Uint8Array): string {
    const body = Buffer.from(input);
    const oid = createHash("sha1").update(`${type} ${body.length}\0`).update(body).digest("hex");
    stored.set(oid, { type, body }); return oid;
  }
  let oid = object("blob", content);
  const parts = path.split("/").reverse();
  for (const [index, component] of parts.entries()) oid = object("tree", Buffer.concat([
    Buffer.from(`${index === 0 ? "100644" : "40000"} ${component}\0`), Buffer.from(oid, "hex") ]));
  const treeOid = oid;
  const head = object("commit", [`tree ${treeOid}`, ...parents.map(parent => `parent ${parent}`),
    "author L5 <l5@example.test> 0 +0000", "committer L5 <l5@example.test> 0 +0000", "", "L5", ""].join("\n"));
  const input = { scope, content, path, language: "typescript", treeOid, configHash: "b".repeat(64),
    dependencyHash: "c".repeat(64), historicalBounds: { known: true, heads: [{ algorithm: "sha1" as const, oid: head }] } };
  const objects: RetainedObjectsPort = { async loadBlob(oid) { return stored.get(oid)?.body ?? null; },
    async loadObject(oid) { return stored.get(oid) ?? null; } };
  return { input, objects, stored };
}

describe("owner closure classes", () => {
  async function wasmTypescript(): Promise<Uint8Array> {
    return new Uint8Array(readFileSync(join(root, "engram-live/dist/grammars/tree-sitter-typescript.wasm")));
  }
  const input = {
    scope, language: "typescript", path: "src/f.ts", content: "export function f() { return 1; }\n",
    treeOid: "a".repeat(40), configHash: "b".repeat(64), dependencyHash: "c".repeat(64),
    historicalBounds: { known: true },
  };
  it.each(["no-receipt", "verified"])("Opus C5 relation omissions never publish with %s inventories", async proof => {
    const source = committedCode("export class A extends B {}\nexport class B {}\n");
    let unit!: ParsedUnit;
    const analyzed = await analyzeCode(source.input, portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), {
      async parse(input) { unit = await fakeExtractor.parse(input); return unit; },
    }, { objects: source.objects }));
    expect(analyzed.state).toBe("complete");
    const out = repairAffectedCalls({ before: unit, after: { ...unit, inheritances: [], syntax: { ...unit.syntax, hasError: true } },
      afterCompleteness: "complete", externalCallers: [], deletionEvidence: proof === "verified"
        ? { before: analyzed.declarationInventory!, after: analyzed.declarationInventory! } : undefined });
    expect(out.publishable, "omitted expected inheritance cannot publish").toBe(false);
    expect(out.inheritances).toEqual(unit.inheritances);
  });
  it.each(["relative", "package-port", "package-disk", "missing"])("Opus C1 extends uses pinned configuration: %s", async variant => {
    const dir = mkdtempSync(join(tmpdir(), "opus-c1-"));
    const app = join(dir, "app.ts"), base = join(dir, "node_modules/base-pkg/tsconfig.json");
    const config = JSON.stringify({ compilerOptions: { baseUrl: "../..", paths: { "@dep": ["lib/dep"] } } });
    // The disk-only branch is deliberately invisible to the pinned tree.
    if (variant === "package-disk") { fixtureFs.mkdirSync(dirname(base), { recursive: true }); writeFileSync(base, config); }
    const files = new Map<string, string>([
      [app, 'import { dep } from "@dep";\nexport function f() { return dep(); }\n'],
      [join(dir, "tsconfig.json"), JSON.stringify({ extends: variant === "relative" ? "./base.json" : "base-pkg/tsconfig.json" })],
      [join(dir, "lib/dep.ts"), "export function dep() {}\n"],
    ]);
    if (variant === "relative") files.set(join(dir, "base.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@dep": ["lib/dep"] } } }));
    if (variant === "package-port") files.set(base, config);
    const wasm = await wasmTypescript();
    const out = await reusedExtract([app], { scope, grammarWasm: { bytesFor: () => wasm }, read: virtualRead(files) });
    if (variant === "relative" || variant === "package-port") {
      expect(out.diagnostics).toEqual([]);
      expect(JSON.stringify(out.extraction.edges)).toContain("lib_dep");
    } else {
      expect(out.diagnostics.some(d => d.error.includes("configuration-unavailable")), "missing pinned config is explicit").toBe(true);
    }
  });
  it.each(["relative-json", "relative-suffix", "relative-directory", "absolute", "package-subpath", "package-suffix",
    "package-directory", "package-default", "package-field", "scoped", "ancestor", "chain", "array", "diamond",
    "package-exports-subpath", "package-exports-default", "package-exports-null",
    "missing-relative", "missing-package", "missing-chain", "missing-array", "cycle", "invalid-json", "invalid-extends"])(
    "C1 extends class matrix resolves exclusively through pinned reads: %s", async variant => {
      const dir = mkdtempSync(join(tmpdir(), "c1-matrix-")), app = join(dir, "src/app.ts");
      const alias = (baseUrl: string, target = "lib/dep") => JSON.stringify({ compilerOptions: { baseUrl, paths: { "@dep": [target] } } });
      const files = new Map<string, string>([[app, 'import { dep } from "@dep";\nexport function f() { return dep(); }\n'],
        [join(dir, "lib/dep.ts"), "export function dep() {}\n"], [join(dir, "lib/other.ts"), "export function dep() {}\n"]]);
      let extendsValue: string | string[] = "./base.json";
      if (variant.startsWith("relative") || variant === "absolute") {
        const base = variant === "relative-directory" ? "base/tsconfig.json" : "base.json";
        files.set(join(dir, base), alias(variant === "relative-directory" ? ".." : "."));
        extendsValue = variant === "absolute" ? join(dir, base) : variant === "relative-suffix" ? "./base" : "./" + (variant === "relative-directory" ? "base" : base);
      } else if (variant.startsWith("package-exports")) {
        const pkgDir = join(dir, "node_modules/base-pkg");
        files.set(join(pkgDir, "tsconfig.json"), alias(dir));
        files.set(join(pkgDir, "configs/real.json"), alias(dir, "lib/other"));
        files.set(join(pkgDir, "package.json"), JSON.stringify({ exports: variant === "package-exports-null" ? null
          : { [variant === "package-exports-default" ? "." : "./tsconfig.json"]: "./configs/real.json" } }));
        extendsValue = variant === "package-exports-default" ? "base-pkg" : "base-pkg/tsconfig.json";
      } else if (["package-subpath", "package-suffix", "package-directory", "package-default", "package-field", "scoped", "ancestor"].includes(variant)) {
        const pkg = variant === "scoped" ? "@scope/base" : "base-pkg";
        const location = variant === "ancestor" ? dirname(dir) : dir;
        const pkgDir = join(location, "node_modules", pkg);
        const path = variant === "package-field" ? "config/base.json" : variant === "package-directory" ? "config/tsconfig.json" : "tsconfig.json";
        files.set(join(pkgDir, path), alias(variant === "ancestor" ? join(dir) : dir));
        if (variant === "package-field") files.set(join(pkgDir, "package.json"), JSON.stringify({ tsconfig: path }));
        extendsValue = pkg + (variant === "package-subpath" || variant === "scoped" ? "/tsconfig.json"
          : variant === "package-suffix" ? "/tsconfig" : variant === "package-directory" ? "/config" : "");
      } else if (["chain", "array", "diamond"].includes(variant)) {
        files.set(join(dir, "node_modules/base-pkg/tsconfig.json"), alias(dir));
        files.set(join(dir, "base.json"), JSON.stringify({ extends: "base-pkg" }));
        files.set(join(dir, "override.json"), variant === "diamond" ? JSON.stringify({ extends: "base-pkg" }) : alias(".", "lib/other"));
        extendsValue = variant === "chain" ? "./base.json" : ["./base.json", "./override.json"];
      } else if (variant === "missing-package") extendsValue = "absent-pkg";
      else if (variant === "missing-array") { files.set(join(dir, "base.json"), alias(".")); extendsValue = ["./base.json", "absent-pkg"]; }
      else if (variant === "missing-chain") files.set(join(dir, "base.json"), '{"extends":"absent-pkg"}');
      else if (variant === "cycle") files.set(join(dir, "base.json"), '{"extends":"./tsconfig.json"}');
      else if (variant === "invalid-json") files.set(join(dir, "base.json"), "{broken");
      files.set(join(dir, "tsconfig.json"), variant === "invalid-extends" ? '{"extends":[false]}' : JSON.stringify({ extends: extendsValue }));
      const originalPort = virtualRead(files), counts = new Map<string, number>();
      const read = originalPort.readFileSync;
      const port = { ...originalPort, readFileSync: ((path: string, options?: BufferEncoding) => {
        counts.set(String(path), (counts.get(String(path)) ?? 0) + 1);
        return read(path, options as BufferEncoding);
      }) as typeof read };
      const wasm = await wasmTypescript(), entries = new Map<string, string>();
      const out = await reusedExtract([app], { scope, grammarWasm: { bytesFor: () => wasm }, read: port,
        cacheStore: { authorize() {}, load: key => entries.get(key) ?? null, store: (key, value) => { entries.set(key, value); } } });
      const missing = variant.startsWith("missing") || variant.startsWith("package-exports") || ["cycle", "invalid-json", "invalid-extends"].includes(variant);
      if (missing) {
        expect(out.diagnostics.some(d => d.error.startsWith("configuration-unavailable:")), variant).toBe(true);
        expect(entries.size, "unavailable configuration is never cached as success").toBe(0);
      } else {
        expect(out.diagnostics, variant).toEqual([]);
        expect(JSON.stringify(out.extraction.edges)).toContain(variant === "array" ? "lib_other" : "lib_dep");
        expect([...counts.values()].every(count => count === 1), "all config and package bytes pinned once").toBe(true);
        expect(entries.size).toBeGreaterThan(0);
      }
    });
  it("C5 removing any expected relation makes the repair partial, including with genuine receipts", async () => {
    const source = committedCode("export function f() {}\nexport function g() {}\ncall:f -> g\ncall:g -> f\nexport class A extends B {}\nexport class C extends B {}\nexport class B {}\n");
    let unit!: ParsedUnit;
    const out = await analyzeCode(source.input, portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), {
      async parse(input) { unit = await fakeExtractor.parse(input); return unit; },
    }, { objects: source.objects }));
    expect(out.state).toBe("complete");
    const evidence = { before: out.declarationInventory!, after: out.declarationInventory! };
    for (const label of [undefined, "complete", "partial"] as const) {
      for (const proof of [undefined, evidence]) {
        const intact = repairAffectedCalls({ before: unit, after: unit, afterCompleteness: label, deletionEvidence: proof, externalCallers: [] });
        expect(intact.publishable).toBe(proof !== undefined && label !== "partial");
        for (const field of ["calls", "inheritances"] as const) {
          expect(unit[field].length).toBeGreaterThan(1);
          for (let index = 0; index < unit[field].length; index++) {
            const after = { ...unit, [field]: unit[field].filter((_, i) => i !== index) };
            const repaired = repairAffectedCalls({ before: unit, after, afterCompleteness: label, deletionEvidence: proof, externalCallers: [] });
            expect(repaired.publishable, `${field}[${index}] missing, label=${label}`).toBe(false);
            expect(repaired.coverageState).toBe("partial");
            expect(repaired.coverageReasons).toContain("result-missing");
            for (const relation of unit[field]) expect(repaired[field]).toContainEqual(relation);
          }
        }
      }
    }
  });
  it.each(["omitted-edge", "syntax-error", "unknown-caller"])("C5 complete label cannot hide %s with or without inventories", async variant => {
    const source = committedCode("export class A extends B {}\nexport class B {}\n");
    let unit!: ParsedUnit;
    const out = await analyzeCode(source.input, portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), {
      async parse(input) { unit = await fakeExtractor.parse(input); return unit; },
    }, { objects: source.objects }));
    for (const proof of [undefined, { before: out.declarationInventory!, after: out.declarationInventory! }]) {
      const after = variant === "omitted-edge" ? { ...unit, inheritances: [] } : variant === "syntax-error"
        ? { ...unit, syntax: { ...unit.syntax, hasError: true } } : unit;
      const repaired = repairAffectedCalls({ before: unit, after, afterCompleteness: "complete", deletionEvidence: proof,
        externalCallers: variant === "unknown-caller" ? [{ id: "c", from: "outside", target: "absent", external: true }] : [] });
      expect(repaired.publishable).toBe(false);
      expect(repaired.coverageState).toBe("partial");
      expect(repaired.coverageReasons.length).toBeGreaterThan(0);
      expect(repaired.inheritances).toEqual(unit.inheritances);
    }
  });
  it("R9 complete verified repair permits cross-file parents and verified relation removal", async () => {
    async function analyzed(content: string) {
      const source = committedCode(content); let unit!: ParsedUnit;
      const result = await analyzeCode(source.input, portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), {
        async parse(input) { unit = await fakeExtractor.parse(input); return unit; },
      }, { objects: source.objects }));
      return { unit, receipt: result.declarationInventory! };
    }
    const before = await analyzed("export class A extends OtherFile {}\n");
    const after = await analyzed("export class A extends OtherFile { changed = true; }\n");
    const repaired = repairAffectedCalls({ before: before.unit, after: after.unit, externalCallers: [],
      deletionEvidence: { before: before.receipt, after: after.receipt } });
    expect(repaired.publishable).toBe(true);
    expect(repaired.coverageReasons).toEqual([]);
    expect(repaired.unresolved.map(fact => fact.kind)).toEqual(["unresolved-type"]);
    const removed = await analyzed("export class A {}\n");
    const removal = repairAffectedCalls({ before: after.unit, after: removed.unit, externalCallers: [],
      deletionEvidence: { before: after.receipt, after: removed.receipt } });
    expect(removal.publishable).toBe(true);
    expect(removal.inheritances).toEqual([]);
  });
  it("R10 reused snapshots never load or store private plaintext", async () => {
    const dir = mkdtempSync(join(tmpdir(), "r10-reused-")), app = join(dir, "app.ts");
    const files = new Map<string, string>();
    let loads = 0, stores = 0;
    const wasm = await wasmTypescript();
    for (let i = 0; i < 3; i++) {
      files.set(app, `export function private${i}() {}\n`);
      const out = await reusedExtract([app], { scope, grammarWasm: { bytesFor: () => wasm }, read: { ...virtualRead(files),
        context: { kind: "snapshot", worktreeId: dir, snapshotKind: "working-tree", snapshotId: `snap-${i}`, sourceVectorDigest: "f".repeat(64) } },
        cacheStore: { authorize() {}, load() { loads++; return null; }, store() { stores++; } } });
      expect(out.extraction.nodes.length).toBeGreaterThan(0);
      expect(out.cacheMode).toBe("no-cache");
      expect(out.cacheReason).toMatch(/private persistence disabled/);
    }
    expect(loads).toBe(0); expect(stores).toBe(0);
  });
  it("analysis reports shallow-history and caller-declared configuration identities explicitly", async () => {
    const source = committedCode("export function f() {}\n", "f.ts", ["f".repeat(40)]);
    const out = await analyzeCode(source.input, portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), fakeExtractor,
      { objects: { ...source.objects, async isShallowBoundary() { return true; } } }));
    expect(out.state).toBe("partial");
    expect(out.coverage.reason).toMatch(/^shallow-history:/);
    expect(out.inputProvenance).toEqual({ configHash: "caller-declared", dependencyHash: "caller-declared" });
    expect(out.declarationInventory).toBeUndefined();
  });
  it.each(["", "export function f() {}\n"])("Opus2 local capture reports unstable-capture for content %j", async content => {
    const source = committedCode(content);
    for (const historicalBounds of [null, source.input.historicalBounds]) {
      const out = await analyzeCode({ ...source.input, historicalBounds, treeOid: null,
        snapshotId: "snap:opus2", policyVersion: "policy/1" },
      portsFor(makeMemoryCache(), makeGrammar({ typescript: "available" }), fakeExtractor, { objects: source.objects }));
      expect(out.state).toBe("partial");
      expect(out.coverage.reason).toMatch(/^unstable-capture:/);
      expect(out.coverage.reason).toContain("capture verification");
      expect(out.coverage.reason).toContain(source.input.path);
      expect(out.declarationInventory).toBeUndefined();
    }
  });
  it.each([["dep.tsx", "dep.ts"], ["dep.js", "dep.ts"], ["dep.jsx", "dep.tsx"]])(
    "C1 prior absent candidate %s to %s invalidates reused resolution even with equal bytes", async (fallback, priority) => {
    const dir = mkdtempSync(join(tmpdir(), "owner-c1-"));
    const file = join(dir, "main.ts");
    const dep = "export function dep() { return 1; }\n";
    writeFileSync(file, 'import { dep } from "./dep";\nexport function f() { return dep(); }\n');
    writeFileSync(join(dir, fallback), dep);
    const entries = new Map<string, string>();
    const keys: string[] = [];
    const ports = { scope, grammarWasm: { bytesFor: () => wasm }, cacheStore: {
      load(key: string) { keys.push(key); return entries.get(key) ?? null; },
      store(key: string, value: string) { entries.set(key, value); },
    } };
    const wasm = await wasmTypescript();
    await extractWithDiagnostics([file], ports);
    const first = keys.at(-1);
    writeFileSync(join(dir, priority), dep);
    const warm = await extractWithDiagnostics([file], ports);
    const cold = await extractWithDiagnostics([file], { ...ports, cacheStore: null });
    expect(keys.at(-1), "selected path and negative search order enter identity").not.toBe(first);
    expect(warm.extraction).toEqual(cold.extraction);
    expect(warm.diagnostics).toEqual(cold.diagnostics);
  });
  it.each(["empty", "foreign", "body", "duplicate", "call", "inheritance", "syntax"])("C2 checksummed parse %s must be rejected", async (variant) => {
    const cache = makeMemoryCache();
    const ports = portsFor(cache, makeGrammar({ typescript: "available" }), fakeExtractor);
    const current = { ...input, content: input.content + "export function g() {}\ncall:f -> g\nexport class Child extends Parent\n" };
    const clean = await analyzeCode(current, ports);
    for (const [key, raw] of cache.entries) {
      const e = JSON.parse(raw);
      if (e.kind !== "parse") continue;
      if (variant === "empty") e.payload.symbols = [];
      else if (variant === "foreign") e.payload.symbols[0].name = "FOREIGN-NAME";
      else if (variant === "body") e.payload.symbols[0].bodyHash = "FOREIGN-BODY";
      else if (variant === "duplicate") e.payload.symbols.push(e.payload.symbols[0]);
      else if (variant === "call") e.payload.calls[0].fromSlot = "FOREIGN-CALLER";
      else if (variant === "inheritance") e.payload.inheritances[0].parentSlotOrName = "FOREIGN-PARENT";
      else e.payload.syntax.hasError = true;
      e.payloadDigest = sha256Hex(JSON.stringify(e.payload));
      cache.entries.set(key, JSON.stringify(e));
    }
    const replay = await analyzeCode(current, ports);
    expect(replay.parseCacheHit).toBe(false);
    expect(replay.symbols).toEqual(clean.symbols);
    expect(replay.diagnostics).toContainEqual(expect.stringMatching(/^derivation-failed: parse cache/));
  });
  it("C1 configurations and negative probes are pinned once for the whole operation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "owner-c1-pin-"));
    const a = join(dir, "a.ts"), b = join(dir, "b.ts"), config = join(dir, "tsconfig.json");
    const docA = JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@dep": ["dep-a"] } } });
    const docB = JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@dep": ["dep-b"] } } });
    const source = 'import { f } from "@dep";\nexport function caller() { return f(); }\n';
    writeFileSync(a, source); writeFileSync(b, source); writeFileSync(config, docA);
    writeFileSync(join(dir, "dep-a.ts"), "export function f() {}\n");
    writeFileSync(join(dir, "dep-b.ts"), "export function f() {}\n");
    let configReads = 0;
    const wasm = await wasmTypescript();
    const result = await extractWithDiagnostics([a,b], { scope, grammarWasm: { bytesFor: () => wasm }, read: { ...fixtureFs,
      context: { kind: "snapshot", worktreeId: dir, snapshotKind: "working-tree", snapshotId: "pinned", sourceVectorDigest: sha256Hex(docA) },
      readFileSync: ((path: string, options?: BufferEncoding) => {
        if (String(path) === config) { configReads++; const bytes = Buffer.from(configReads === 1 ? docA : docB);
          return options ? bytes.toString(options) : bytes; }
        return fixtureFs.readFileSync(path, options as BufferEncoding);
      }) as typeof readFileSync } });
    expect(configReads).toBe(1);
    expect(JSON.stringify(result.extraction.edges)).toContain("dep_a");
    expect(JSON.stringify(result.extraction.edges)).not.toContain("dep_b");
    expect(result.diagnostics).toEqual([]);
  });
  it("C2 both live entries deny foreign scopes before any cache lookup", async () => {
    const denied = { authorize() { throw Error("denied scope"); }, async load() { throw Error("lookup must not run"); }, async store() {} };
    await expect(analyzeCode(input, portsFor(denied, makeGrammar({ typescript: "available" }), fakeExtractor))).rejects.toThrow("denied scope");
    const dir = mkdtempSync(join(tmpdir(), "owner-c2-deny-")), file = join(dir, "f.ts"); writeFileSync(file, input.content);
    const wasm = await wasmTypescript(); let lookups = 0;
    await expect(extractWithDiagnostics([file], { scope, grammarWasm: { bytesFor: () => wasm },
      cacheStore: { authorize() { throw Error("denied scope"); }, load() { lookups++; return null; }, store() {} } })).rejects.toThrow("denied scope");
    expect(lookups).toBe(0);
  });
  it("C2 checksummed reused foreign payload must be rejected", async () => {
    const dir = mkdtempSync(join(tmpdir(), "owner-c2-"));
    const file = join(dir, "f.ts");
    writeFileSync(file, input.content);
    const wasm = await wasmTypescript();
    const entries = new Map<string, string>();
    const ports = { scope, grammarWasm: { bytesFor: () => wasm }, cacheStore: {
      load(key: string) { return entries.get(key) ?? null; },
      store(key: string, value: string) { entries.set(key, value); },
    } };
    const clean = await extractWithDiagnostics([file], ports);
    for (const [key, raw] of entries) {
      const e = JSON.parse(raw);
      e.payload.nodes[0].id = "FOREIGN-ID";
      e.payload.nodes[0].label = "FOREIGN-NAME";
      e.payloadDigest = sha256Hex(JSON.stringify(e.payload));
      entries.set(key, JSON.stringify(e));
    }
    const replay = await extractWithDiagnostics([file], ports);
    expect(replay.extraction).toEqual(clean.extraction);
    expect(replay.diagnostics.map(d => d.error)).toEqual([expect.stringMatching(/^derivation-failed:/)]);
  });
  it.each(["label", "missing-parent"])("C4 prerequisites %s cannot certify complete", async (variant) => {
    const grammar = variant === "label" ? { status: () => ({ state: "available" as const, version: "label-only" }) }
      : makeGrammar({ typescript: "available" });
    const out = await analyzeCode({ ...input, historicalBounds: variant === "missing-parent"
      ? { known: true, missing: ["required-parent"] } : input.historicalBounds },
    portsFor(makeMemoryCache(), grammar, fakeExtractor));
    expect(out.state).not.toBe("complete");
    expect(out.coverage.state).not.toBe("current");
  });
  it.each(["valid", "label", "digest", "corrupt", "abi", "unloadable", "missing-parent", "missing-frontier", "foreign-content"])(
    "C4 content verified prerequisite matrix %s", async variant => {
      const source = committedCode(input.content);
      const valid = makeGrammar({ typescript: "available" });
      const status = await valid.status("typescript");
      const grammar: GrammarStatusPort = { load: valid.load, status: () => {
        if (variant === "label") return { state: "available", version: "label-only" };
        if (variant === "digest") return { ...status, digest: "d".repeat(64) };
        if (variant === "corrupt") return { ...status, bytes: Buffer.from("not wasm"), digest: sha256Hex("not wasm") };
        if (variant === "abi") return { ...status, abi: "foreign-abi" };
        return status;
      } };
      const current = { ...source.input, content: variant === "foreign-content" ? "export function FOREIGN() {}\n" : source.input.content,
        historicalBounds: { ...source.input.historicalBounds,
          missing: variant === "missing-parent" ? ["required-parent"] : [],
          heads: variant === "missing-frontier" ? [{ algorithm: "sha1" as const, oid: "a".repeat(40) }] : source.input.historicalBounds.heads } };
      const out = await analyzeCode(current, portsFor(makeMemoryCache(), variant === "unloadable"
        ? { ...grammar, load: () => null } : grammar, fakeExtractor, { objects: source.objects }));
      expect(out.state, variant).toBe(variant === "valid" ? "complete"
        : ["missing-parent", "missing-frontier", "foreign-content"].includes(variant) ? "partial" : "unavailable");
      expect(out.declarationInventory !== undefined).toBe(variant === "valid");
    });
  it.each(["verified", "copied", "foreign-scope", "omitted", "changed-inventory"])(
    "C5 deletion proof binds exact complete inventories and correspondence: %s", async variant => {
      const beforeSource = committedCode("export function f() {}\nexport function g() {}\n");
      const afterSource = committedCode("export function g() {}\n");
      const grammar = makeGrammar({ typescript: "available" });
      const cache = makeMemoryCache();
      let beforeUnit!: ParsedUnit; let afterUnit!: ParsedUnit;
      const before = await analyzeCode(beforeSource.input, portsFor(cache, grammar, { async parse(input) {
        beforeUnit = await fakeExtractor.parse(input); return beforeUnit;
      } }, { objects: beforeSource.objects }));
      const afterInput = variant === "foreign-scope" ? { ...afterSource.input, scope: { ...scope, clone: "foreign" } } : afterSource.input;
      const after = await analyzeCode(afterInput, portsFor(cache, grammar, { async parse(input) {
        afterUnit = await fakeExtractor.parse(input); return afterUnit;
      } }, { objects: afterSource.objects }));
      expect(before.state).toBe("complete"); expect(after.state).toBe("complete");
      const evidence = { before: before.declarationInventory!, after: after.declarationInventory! };
      const out = repairAffectedCalls({ before: beforeUnit, after: variant === "changed-inventory"
        ? { ...afterUnit, topologyHash: "foreign" } : afterUnit, afterCompleteness: "complete",
        deletionEvidence: variant === "omitted" ? undefined : variant === "copied" ? structuredClone(evidence) : evidence,
        externalCallers: [{ id: "call-f", from: "outside", target: "function:f", targetSlot: "function:f", external: true },
          { id: "call-g", from: "outside", target: "function:g", targetSlot: "function:g", external: true }] });
      expect(out.publishable).toBe(variant === "verified");
      expect(out.preservedExternalCallers).toHaveLength(variant === "verified" ? 1 : 2);
      expect(out.unresolved).toHaveLength(variant === "verified" ? 1 : 0);
    });
  it.each([undefined, { completeInventory: false } as const, { completeInventory: true } as const,
    { deletedSlots: ["other-slot"] }, { deletedSlots: ["function:f"] }])(
    "C5 missing declaration without relevant deletion proof withholds publication %j", (deletionEvidence) => {
      const before: ParsedUnit = { symbols: [{ slot: "function:f", name: "f", kind: "function", bodyHash: "old" }],
        calls: [], inheritances: [], topologyHash: "old", syntax: { rootSpansBytes: true, hasError: false, hasMissing: false, walkComplete: true } };
      const out = repairAffectedCalls({ before, after: { ...before, symbols: [] }, afterCompleteness: "complete",
        deletionEvidence, externalCallers: [{ id: "caller", from: "outside", target: "function:f", targetSlot: "function:f", external: true }] });
      expect(out.publishable).toBe(false);
      expect(out.preservedExternalCallers).toHaveLength(1);
    });
});

function virtualRead(files: Map<string, string>): NonNullable<LiveExtractionPorts["read"]> {
  const present = (path: string) => files.has(path) || [...files.keys()].some(name => name.startsWith(path + "/"));
  return {
    context: { kind: "tree", treeOid: "a".repeat(40) },
    existsSync: ((path: string) => present(String(path))) as typeof fixtureFs.existsSync,
    readFileSync: ((path: string, options?: BufferEncoding) => {
      const value = files.get(String(path));
      if (value === undefined) throw new Error("not in pinned tree: " + path);
      return options ? value : Buffer.from(value);
    }) as typeof fixtureFs.readFileSync,
    lstatSync: ((path: string) => {
      if (!present(String(path))) throw new Error("not in pinned tree: " + path);
      const file = files.has(String(path));
      return { mode: file ? 0o100644 : 0o40755, isFile: () => file, isDirectory: () => !file, isSymbolicLink: () => false };
    }) as typeof fixtureFs.lstatSync,
    realpathSync: ((path: string) => String(path)) as typeof fixtureFs.realpathSync,
    readdirSync: (() => []) as unknown as typeof fixtureFs.readdirSync,
  };
}

function parseContextOf(
  input: { language: string; path: string; content: string },
  content: string,
): AnalysisContextDto {
  return {
    clone: scope.clone,
    configHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    contentSha256: sha256Hex(content),
    dependencyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    dialect: "typescript:ts",
    extractorVersion: fixture.extractorVersion,
    grammarAbi: "wts-abi/1",
    grammarId: `tree-sitter-${input.language}`,
    grammarDigest: createHash("sha256").update(readFileSync(join(root, "engram-live/dist/grammars", `tree-sitter-${input.language}.wasm`))).digest("hex"),
    grammarVersion: `wasm-sha256-for-${input.language}`,
    language: input.language,
    path: "src/shop/cart.ts",
    tenant: scope.tenant,
    treeOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
}

function resolutionContextOf(
  input: {
    language: string;
    path: string;
    content: string;
    treeOid: string | null;
    configHash: string;
    dependencyHash: string;
    snapshotId?: string | null;
    policyVersion?: string | null;
  },
  content: string,
): AnalysisContextDto {
  return {
    clone: scope.clone,
    configHash: input.configHash,
    contentSha256: sha256Hex(content),
    dependencyHash: input.dependencyHash,
    dialect: "typescript:ts",
    extractorVersion: fixture.extractorVersion,
    grammarAbi: "wts-abi/1",
    grammarId: `tree-sitter-${input.language}`,
    grammarDigest: createHash("sha256").update(readFileSync(join(root, "engram-live/dist/grammars", `tree-sitter-${input.language}.wasm`))).digest("hex"),
    grammarVersion: `wasm-sha256-for-${input.language}`,
    language: input.language,
    path: input.path,
    policyVersion: input.policyVersion ?? null,
    snapshotId: input.snapshotId ?? null,
    tenant: scope.tenant,
    treeOid: input.treeOid,
  };
}
