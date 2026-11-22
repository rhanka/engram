// @sentropic/engram-live/reused-extraction — packaged reused extraction
// (plan/09 L5-P2b).
//
// Delivers the closed core of the reused deterministic extraction in the
// neutral package with the repository TypeScript compiler alone: no bundler
// and no new build dependency. The entry lazily loads ./reused/extract-core.js
// inside its async entry points (typed at compile time by the committed
// declaration engram-live/reused/extract-core.d.ts) so source-tree imports of
// engram-live/index.ts do not require a generated core file at module load and
// emitted dist/reused-extraction.d.ts stays completely self-contained. It binds
// the host parser runtime through GrammarRuntimePort (as extended by L5-P1) as
// its only host capability, and always runs the core in live mode.

import { basename, extname } from "node:path";
import type { GrammarRuntimePort } from "./integration.js";

export interface LiveScopeDto {
  readonly tenant: string;
  readonly clone: string;
}

export interface LiveCacheStorePort {
  load(key: string): string | null;
  store(key: string, value: string): void;
  authorize(scope: LiveScopeDto): void;
}

export interface LiveGrammarWasmPort {
  bytesFor(language: string): Uint8Array | null;
}

export interface LiveReadPort {
  readonly context:
    | { readonly kind: "tree"; readonly treeOid: string }
    | {
        readonly kind: "snapshot";
        readonly worktreeId: string;
        readonly snapshotKind: string;
        readonly snapshotId: string;
        readonly sourceVectorDigest: string;
      };
  readonly readFileSync: (path: string, options?: unknown) => unknown;
  readonly existsSync: (path: string) => boolean;
  readonly lstatSync: (path: string, options?: unknown) => unknown;
  readonly realpathSync: (path: string, options?: unknown) => unknown;
  readonly readdirSync: (path: string, options?: unknown) => unknown;
}

export interface LiveExtractionPorts {
  readonly cacheStore?: LiveCacheStorePort | null;
  readonly grammarWasm?: LiveGrammarWasmPort | null;
  readonly scope?: LiveScopeDto | null;
  readonly dependencyDigest?: string | null;
  readonly contentPolicyVersion?: string | null;
  readonly privacyBoundary?: string | null;
  readonly read?: LiveReadPort | null;
}

export interface ExtractionNode {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface ExtractionEdge {
  readonly source: string;
  readonly target: string;
  readonly [key: string]: unknown;
}

export interface ExtractionResult {
  readonly nodes: readonly ExtractionNode[];
  readonly edges: readonly ExtractionEdge[];
  readonly input_tokens: number;
  readonly output_tokens: number;
}

export interface ExtractionDiagnostic {
  readonly filePath: string;
  readonly error: string;
}

export interface ExtractWithDiagnosticsResult {
  readonly extraction: {
    readonly nodes: readonly ExtractionNode[];
    readonly edges: readonly ExtractionEdge[];
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
  readonly diagnostics: readonly ExtractionDiagnostic[];
  readonly cacheMode: string;
  readonly cacheReason: string;
}

export const REUSED_EXTRACTION_VERSION = "live-reused-extraction/1";
export const LIVE_DIALECT_VERSION = "live-dialect/1";
export const LIVE_GRAMMAR_ABI = "web-tree-sitter-abi/1";

type ReusedCoreModule = typeof import("./reused/extract-core.js");

let corePromise: Promise<ReusedCoreModule> | null = null;
let loadedCore: ReusedCoreModule | null = null;
let pendingRuntime: GrammarRuntimePort | null = null;
let appliedRuntime: GrammarRuntimePort | null = null;

function applyRuntimeToCore(core: ReusedCoreModule, runtime: GrammarRuntimePort): void {
  core.bindExtractCoreHost({
    parserRuntime: {
      init: async (): Promise<void> => {
        await runtime.init?.();
      },
      loadLanguage: (bytes: Uint8Array): Promise<object> => runtime.loadLanguage(bytes),
      createParser: (language: unknown): { parse(source: string): unknown; setLanguage(language: unknown): void } => {
        const parser = runtime.createParser(language as object);
        return {
          parse: (source: string): unknown => parser.parse(source) as unknown,
          setLanguage: (): void => {},
        };
      },
    },
  });
  appliedRuntime = runtime;
}

async function loadCore(): Promise<ReusedCoreModule> {
  if (loadedCore === null) {
    if (corePromise === null) {
      corePromise = import("./reused/extract-core.js").then(
        (mod) => {
          if (mod.LIVE_DIALECT_VERSION !== LIVE_DIALECT_VERSION) {
            throw new Error(
              `reused extraction core dialect version mismatch: expected ${LIVE_DIALECT_VERSION}, got ${mod.LIVE_DIALECT_VERSION}`,
            );
          }
          if (mod.LIVE_GRAMMAR_ABI !== LIVE_GRAMMAR_ABI) {
            throw new Error(
              `reused extraction core grammar ABI mismatch: expected ${LIVE_GRAMMAR_ABI}, got ${mod.LIVE_GRAMMAR_ABI}`,
            );
          }
          loadedCore = mod;
          return mod;
        },
        (error) => {
          corePromise = null;
          throw error;
        },
      );
    }
    await corePromise;
  }
  const core = loadedCore!;
  if (pendingRuntime !== null && appliedRuntime !== pendingRuntime) {
    applyRuntimeToCore(core, pendingRuntime);
  }
  return core;
}

/** Resolve the deterministic live language/dialect for a path without host I/O. */
export function resolveReusedLiveLanguage(filePath: string): {
  readonly language: string;
  readonly dialect: string;
} | null {
  if (loadedCore !== null) {
    return loadedCore.resolveLiveLanguage(filePath);
  }
  const base = basename(filePath).toLowerCase();
  if (base.endsWith(".blade.php")) return null;
  const ext = extname(filePath).toLowerCase();
  if (!ext) return null;
  switch (ext) {
    case ".ts": return { language: "typescript", dialect: "typescript:ts" };
    case ".mts": return { language: "typescript", dialect: "typescript:mts-module" };
    case ".cts": return { language: "typescript", dialect: "typescript:cts-commonjs" };
    case ".tsx": return { language: "tsx", dialect: "tsx:tsx" };
    case ".js": case ".jsx": case ".mjs": return { language: "javascript", dialect: `javascript:${ext.slice(1)}` };
    case ".py": return { language: "python", dialect: "python:py" };
    case ".go": return { language: "go", dialect: "go:go" };
    case ".rs": return { language: "rust", dialect: "rust:rs" };
    case ".java": return { language: "java", dialect: "java:java" };
    case ".c": case ".h": return { language: "c", dialect: `c:${ext.slice(1)}` };
    case ".cpp": case ".cc": case ".cxx": case ".hpp": return { language: "cpp", dialect: `cpp:${ext.slice(1)}` };
    case ".rb": return { language: "ruby", dialect: "ruby:rb" };
    case ".php": return { language: "php", dialect: "php:php" };
    case ".swift": return { language: "swift", dialect: "swift:swift" };
    case ".lua": case ".luau": case ".toc": return { language: "lua", dialect: `lua:${ext.slice(1)}` };
    default: return null;
  }
}

/** Bind the host parser runtime as the only host capability of the closed core. */
export function bindReusedExtractionRuntime(runtime: GrammarRuntimePort): void {
  if (
    runtime === null
    || typeof runtime !== "object"
    || typeof runtime.loadLanguage !== "function"
    || typeof runtime.createParser !== "function"
    || (runtime.init !== undefined && typeof runtime.init !== "function")
  ) {
    throw new TypeError(
      "bindReusedExtractionRuntime requires a GrammarRuntimePort with loadLanguage and createParser functions",
    );
  }
  pendingRuntime = runtime;
  if (loadedCore !== null && appliedRuntime !== runtime) {
    applyRuntimeToCore(loadedCore, runtime);
  }
}

function requireLivePorts(live: LiveExtractionPorts | undefined): LiveExtractionPorts {
  if (live === undefined || live === null) {
    throw new Error(
      "reused extraction requires an explicit live operation: pass cacheStore, grammarWasm, scope and read through the injected ports (no host default, no legacy cache)",
    );
  }
  return live;
}

/** Run the packaged closed core with diagnostics, always in live mode. */
export async function extractReusedWithDiagnostics(
  paths: string[],
  live: LiveExtractionPorts,
): Promise<ExtractWithDiagnosticsResult> {
  const ports = requireLivePorts(live);
  const core = await loadCore();
  return core.extractWithDiagnostics(paths, ports);
}

/** Run the packaged closed core, always in live mode. */
export async function extractReused(
  paths: string[],
  live: LiveExtractionPorts,
): Promise<ExtractionResult> {
  const ports = requireLivePorts(live);
  const core = await loadCore();
  return core.extract(paths, ports);
}
