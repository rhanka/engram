// @sentropic/engram-live/reused/extract-core — committed declaration of the
// generated closed core (plan/09 L5-P2b).
//
// The build compiles the closed set (src/extract-core.ts, src/live-cache-keys.ts,
// src/node-id.ts, src/relation-remap.ts) with the repository TypeScript alone and
// installs the emitted JavaScript under dist/reused/. At compile time the
// in-package entry (engram-live/reused-extraction.ts) imports
// ./reused/extract-core.js through this declaration; the build fails with
// OUTPUT_INVALID when the emitted core does not export every value name this
// declaration declares. Public types live once in ../reused-extraction.ts so
// emitted dist/reused-extraction.d.ts never references this unshipped file.

import type {
  ExtractionResult,
  ExtractWithDiagnosticsResult,
  LiveExtractionPorts,
} from "../reused-extraction.js";

export interface CoreParser {
  parse(source: string): unknown;
  setLanguage(language: unknown): void;
}

export interface CoreParserRuntime {
  init(): Promise<void>;
  loadLanguage(bytes: Uint8Array): Promise<unknown>;
  createParser(language: unknown): CoreParser;
}

export declare function bindExtractCoreHost(host: {
  readonly parserRuntime?: Partial<CoreParserRuntime>;
  readonly [key: string]: unknown;
}): void;

export declare function getExtractCoreHost(): {
  readonly parserRuntime: CoreParserRuntime;
  readonly [key: string]: unknown;
};

export declare function extractWithDiagnostics(
  paths: string[],
  live?: LiveExtractionPorts,
): Promise<ExtractWithDiagnosticsResult>;

export declare function extract(
  paths: string[],
  live?: LiveExtractionPorts,
): Promise<ExtractionResult>;

export declare function resolveLiveLanguage(filePath: string): {
  readonly language: string;
  readonly dialect: string;
} | null;

export declare const LIVE_DIALECT_VERSION: string;
export declare const LIVE_GRAMMAR_ABI: string;
