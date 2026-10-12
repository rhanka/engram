// @sentropic/engram-live/integration — executable neutral factory
// (spec/SPEC_LIVE_GIT_INDEXING.md §2–3, §11; plan/09 L1b).
//
// The factory composes injected capabilities only: Git, filesystem, clock,
// content, fact-sink, cache and grammar ports. It never imports the
// monolithic root CLI, another @sentropic/* consumer package, the h2a host,
// a model module or a storage-driver handle — those stay outside the neutral
// closure by construction and by tests/live-neutrality.test.ts.
//
// L1b supplies the package/factory seams and grammar loading. Every other
// capability is explicitly unavailable until its lot lands; the factory
// never fabricates facts, writes through the fact sink or silently
// degrades an unavailable capability into an empty success.

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVERTISED_LANGUAGES,
  CAPABILITY_IDS,
  CAPABILITY_PLANNED_LOTS,
  GRAMMAR_UNAVAILABLE_REASON,
  NOT_IMPLEMENTED_REASON,
  type CapabilityId,
  type CapabilityStatus,
  type CoverageReport,
  type FactBatchDto,
  type GrammarCoverageDto,
  type LiveScope,
  type ValidationResult,
  type WorkspaceDeclarationDto,
  validateFactBatch,
  validateWorkspaceDeclaration,
} from "./contracts.js";

// — Injected ports. Git, content and cache seams are recorded but unused in
// L1b: their bounded operations are defined by L2a/L2b, L4a/L4b and L5. The
// factory accepts them now so later lots extend the seams without moving
// the composition boundary.

export interface GitPort {
  /** Bounded Git read seam; operations arrive with L2a/L2b. Unused in L1b. */
  readonly liveGitSeam: "host-git";
}

export interface FilesystemPort {
  /** Reads a file's bytes through the injected host filesystem. */
  readFileBytes(path: string): Promise<Uint8Array>;
}

export interface ClockPort {
  /** Milliseconds since the Unix epoch, host-supplied and test-fakeable. */
  now(): number;
}

export interface ContentPort {
  /** Content classification seam; policies arrive with L4b/L5. Unused in L1b. */
  readonly liveContentSeam: "host-content";
}

export interface FactSinkPort {
  /** Durable receipt of a fact batch; separate from publication (spec §3). */
  deliver(batch: FactBatchDto): Promise<{ received: true; batchId: string }>;
}

export interface CachePort {
  /** Bounded, versioned cache seam; wired by L2b/L5. Unused in L1b. */
  readonly liveCacheSeam: "host-cache";
}

export interface GrammarRuntimePort {
  /** Loads a tree-sitter WASM grammar from bytes (e.g. web-tree-sitter). */
  loadLanguage(wasm: Uint8Array): Promise<unknown>;
}

export interface LiveFactoryPorts {
  readonly git: GitPort;
  readonly filesystem: FilesystemPort;
  readonly clock: ClockPort;
  readonly content: ContentPort;
  readonly factSink: FactSinkPort;
  readonly cache: CachePort;
  readonly grammarRuntime: GrammarRuntimePort;
}

export interface CreateLiveFactoryOptions {
  readonly ports: LiveFactoryPorts;
  readonly declaration: WorkspaceDeclarationDto;
}

export interface CapabilityResult {
  readonly capability: CapabilityId;
  readonly state: "unavailable";
  readonly reason: string;
  readonly plannedLot: string;
  readonly delivered: false;
}

export interface GrammarLoadResult {
  readonly language: string;
  readonly state: "available" | "unavailable";
  readonly bytesSha256?: string;
  readonly grammar?: unknown;
  readonly reason?: string;
}

export interface LiveFactory {
  describeCapabilities(): readonly CapabilityStatus[];
  runCapability(capability: CapabilityId): Promise<CapabilityResult>;
  grammarCoverage(language: string): GrammarCoverageDto;
  grammarCoverageReport(language: string): CoverageReport;
  loadGrammar(language: string): Promise<GrammarLoadResult>;
  validateBatch(batch: unknown): ValidationResult;
}

interface GrammarManifestEntry {
  readonly file: string;
  readonly sourcePackage: string;
  readonly sourceVersion: string;
  readonly sourcePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

interface GrammarManifest {
  readonly manifestVersion: number;
  readonly languages: Readonly<Record<string, GrammarManifestEntry>>;
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The pinned manifest is validated before any grammar is trusted: a
// manifestVersion number and a languages record whose entries pin a
// non-empty file and sha256 are required.
function isGrammarManifest(value: unknown): value is GrammarManifest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { manifestVersion?: unknown; languages?: unknown };
  if (typeof candidate.manifestVersion !== "number") return false;
  if (typeof candidate.languages !== "object" || candidate.languages === null || Array.isArray(candidate.languages)) {
    return false;
  }
  return Object.values(candidate.languages).every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const record = entry as { file?: unknown; sha256?: unknown };
    return typeof record.file === "string" && record.file.length > 0
      && typeof record.sha256 === "string" && record.sha256.length > 0;
  });
}

interface ManifestOutcome {
  readonly ok: boolean;
  readonly manifest?: GrammarManifest;
  readonly reason?: string;
}

export function createLiveFactory(options: CreateLiveFactoryOptions): LiveFactory {
  const declarationCheck = validateWorkspaceDeclaration(options.declaration);
  if (!declarationCheck.ok) {
    throw new Error(`invalid live workspace declaration: ${declarationCheck.errors.join("; ")}`);
  }
  const ports = options.ports;
  const distDir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(distDir, "..", "grammar-manifest.json");
  const grammarDir = join(distDir, "grammars");

  let manifestCache: GrammarManifest | undefined;
  const loadManifest = async (): Promise<ManifestOutcome> => {
    if (manifestCache) return { ok: true, manifest: manifestCache };
    let decoded: unknown;
    try {
      decoded = decodeJson(await ports.filesystem.readFileBytes(manifestPath));
    } catch (error) {
      return {
        ok: false,
        reason: `the pinned grammar manifest cannot be read through the filesystem port (${errorMessage(error)})`,
      };
    }
    if (!isGrammarManifest(decoded)) {
      return {
        ok: false,
        reason: "the pinned grammar manifest is invalid: a manifestVersion number and a languages record pinning file/sha256 entries are required",
      };
    }
    manifestCache = decoded;
    return { ok: true, manifest: decoded };
  };

  const grammarLoadCache = new Map<string, GrammarLoadResult>();

  return {
    describeCapabilities(): readonly CapabilityStatus[] {
      return CAPABILITY_IDS.map((capability) => ({
        capability,
        state: "unavailable" as const,
        reason: NOT_IMPLEMENTED_REASON,
        plannedLot: CAPABILITY_PLANNED_LOTS[capability],
      }));
    },

    async runCapability(capability: CapabilityId): Promise<CapabilityResult> {
      if (!CAPABILITY_IDS.includes(capability)) {
        throw new Error(`unknown capability "${String(capability)}"; known capabilities: ${CAPABILITY_IDS.join(", ")}`);
      }
      // Explicit unavailability: no port call, no fabricated facts, no
      // empty-success degradation.
      return {
        capability,
        state: "unavailable",
        reason: NOT_IMPLEMENTED_REASON,
        plannedLot: CAPABILITY_PLANNED_LOTS[capability],
        delivered: false,
      };
    },

    grammarCoverage(language: string): GrammarCoverageDto {
      // Synchronous coverage uses the pinned manifest; loadGrammar caches the
      // executed result per language so coverage reflects verified assets.
      const loaded = grammarLoadCache.get(language);
      if (loaded?.state === "available") {
        return { axis: "ast", language, state: "current", reason: `packaged grammar verified (sha256 ${loaded.bytesSha256})` };
      }
      return {
        axis: "ast",
        language,
        state: "unavailable",
        reason: `${GRAMMAR_UNAVAILABLE_REASON}: "${language}" has no verified packaged grammar in this session`,
      };
    },

    grammarCoverageReport(language: string): CoverageReport {
      const coverage = this.grammarCoverage(language);
      return {
        axis: coverage.axis,
        language,
        state: coverage.state,
        reason: coverage.reason,
        checkedAt: ports.clock.now(),
      };
    },

    async loadGrammar(language: string): Promise<GrammarLoadResult> {
      const cached = grammarLoadCache.get(language);
      if (cached) return cached;
      const unavailable = (reason: string): GrammarLoadResult => {
        const result: GrammarLoadResult = { language, state: "unavailable", reason };
        grammarLoadCache.set(language, result);
        return result;
      };
      // Reading and validating the manifest is part of the load: an absent,
      // unreadable or invalid manifest yields an explicit unavailable result,
      // never a thrown error and never a silent empty success.
      const manifestOutcome = await loadManifest();
      if (!manifestOutcome.ok || manifestOutcome.manifest === undefined) {
        return unavailable(`${GRAMMAR_UNAVAILABLE_REASON}: ${manifestOutcome.reason ?? "the pinned grammar manifest is unavailable"}`);
      }
      // Clean own-property lookup: inherited names such as "constructor" or
      // "toString" never reach a manifest entry.
      if (!Object.hasOwn(manifestOutcome.manifest.languages, language)) {
        return unavailable(`${GRAMMAR_UNAVAILABLE_REASON}: "${language}" is absent from the pinned grammar manifest`);
      }
      const entry = manifestOutcome.manifest.languages[language];
      let bytes: Uint8Array;
      try {
        bytes = await ports.filesystem.readFileBytes(join(grammarDir, entry.file));
      } catch (error) {
        return unavailable(
          `${GRAMMAR_UNAVAILABLE_REASON}: the packaged WASM for "${language}" cannot be read through the filesystem port (${errorMessage(error)})`,
        );
      }
      const digest = sha256(bytes);
      if (digest !== entry.sha256) {
        return unavailable(`packaged grammar digest mismatch for "${language}": pinned ${entry.sha256}, read ${digest}`);
      }
      try {
        const grammar = await ports.grammarRuntime.loadLanguage(bytes);
        const result: GrammarLoadResult = {
          language,
          state: "available",
          bytesSha256: digest,
          grammar,
        };
        grammarLoadCache.set(language, result);
        return result;
      } catch (error) {
        return unavailable(`grammar runtime rejected the packaged WASM for "${language}": ${errorMessage(error)}`);
      }
    },

    validateBatch(batch: unknown): ValidationResult {
      return validateFactBatch(batch);
    },
  };
}

/** The advertised grammar matrix of this build, from the pinned manifest data. */
export const ADVERTISED_GRAMMAR_LANGUAGES: readonly string[] = ADVERTISED_LANGUAGES;

// The canonical identity derivation (L6a, spec §3/§12) is part of the public
// integration surface: h2a and cluster-mesh mint cloneId/worktreeId/
// declarationId through exactly these functions, so every seat derives
// byte-identical opaque ids from identical components. The minting needs
// node:crypto (sha256), which keeps it out of the data-pure /contracts
// entry; the derivation itself stays pure and deterministic over its
// arguments (see ./registration.js).
export {
  deriveCloneIdentity,
  deriveWorktreeIdentity,
  deriveDeclarationIdentity,
  type DeclarationIdentityDto,
  type DeriveCloneIdentityInput,
  type DeriveWorktreeIdentityInput,
  type DeriveDeclarationIdentityInput,
} from "./registration.js";
