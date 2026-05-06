import { readFileSync, unlinkSync } from "node:fs";
import { relative, sep, join } from "node:path";
import { tmpdir } from "node:os";

import type { Extraction } from "./types.js";
import {
  createDirectTextJsonClient,
  defaultDirectLlmModel,
  type DirectLlmProvider,
} from "./llm-execution.js";
import { validateExtraction } from "./validate.js";

const CHARS_PER_TOKEN = 4;
const MAX_FILE_CHARS = 20_000;
const PER_FILE_OVERHEAD_TOKENS = 80;

export interface DirectSemanticFile {
  path: string;
  relativePath: string;
  text: string;
}

export interface DirectSemanticChunk {
  index: number;
  files: string[];
  estimatedTokens: number;
}

export interface DirectSemanticExtractionClient {
  provider: string;
  model?: string;
  extractChunk(input: {
    chunkIndex: number;
    chunkCount: number;
    files: DirectSemanticFile[];
  }): Promise<Partial<Extraction>>;
}

export interface DirectSemanticExtractionOptions {
  root: string;
  client: DirectSemanticExtractionClient;
  tokenBudget?: number;
  maxConcurrency?: number;
}

export interface PackSemanticFilesOptions {
  tokenBudget?: number;
}

export interface DirectSemanticClientOptions {
  provider: DirectLlmProvider;
  model?: string;
}

function toPortableRelative(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join("/");
}

function estimateFileTokens(filePath: string): number {
  const text = readFileSync(filePath, "utf-8");
  const capped = Math.min(text.length, MAX_FILE_CHARS);
  return Math.ceil(capped / CHARS_PER_TOKEN) + PER_FILE_OVERHEAD_TOKENS;
}

function readSemanticFile(root: string, filePath: string): DirectSemanticFile {
  return {
    path: filePath,
    relativePath: toPortableRelative(root, filePath),
    text: readFileSync(filePath, "utf-8").slice(0, MAX_FILE_CHARS),
  };
}

function extractionShape(value: Partial<Extraction> | null | undefined): Extraction {
  return {
    nodes: value?.nodes ?? [],
    edges: value?.edges ?? [],
    hyperedges: value?.hyperedges ?? [],
    canonical_entities: value?.canonical_entities,
    mentions: value?.mentions,
    occurrences: value?.occurrences,
    evidence: value?.evidence,
    mappings: value?.mappings,
    input_tokens: value?.input_tokens ?? 0,
    output_tokens: value?.output_tokens ?? 0,
  };
}

function mergeExtractions(fragments: Partial<Extraction>[]): Extraction {
  const merged: Extraction = {
    nodes: [],
    edges: [],
    hyperedges: [],
    canonical_entities: [],
    mentions: [],
    occurrences: [],
    evidence: [],
    mappings: [],
    input_tokens: 0,
    output_tokens: 0,
  };
  const seenNodes = new Set<string>();
  for (const fragmentInput of fragments) {
    const fragment = extractionShape(fragmentInput);
    for (const node of fragment.nodes) {
      if (seenNodes.has(node.id)) continue;
      seenNodes.add(node.id);
      merged.nodes.push(node);
    }
    merged.edges.push(...fragment.edges);
    merged.hyperedges!.push(...(fragment.hyperedges ?? []));
    merged.canonical_entities!.push(...(fragment.canonical_entities ?? []));
    merged.mentions!.push(...(fragment.mentions ?? []));
    merged.occurrences!.push(...(fragment.occurrences ?? []));
    merged.evidence!.push(...(fragment.evidence ?? []));
    merged.mappings!.push(...(fragment.mappings ?? []));
    merged.input_tokens += fragment.input_tokens ?? 0;
    merged.output_tokens += fragment.output_tokens ?? 0;
  }
  return merged;
}

function buildExtractionPrompt(input: {
  chunkIndex: number;
  chunkCount: number;
  files: DirectSemanticFile[];
}): string {
  const files = input.files.map((file) => [
    `## File: ${file.relativePath}`,
    "",
    "```text",
    file.text,
    "```",
  ].join("\n"));
  return [
    `Extract Graphify semantic graph fragment ${input.chunkIndex + 1}/${input.chunkCount}.`,
    "",
    "Return this exact JSON shape:",
    '{"nodes":[],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0}',
    "",
    "Node requirements:",
    "- id, label, file_type, source_file are required.",
    "- file_type must be one of code, document, paper, image, concept, rationale.",
    "- source_file must be the relative path shown in the file header.",
    "",
    "Edge requirements:",
    "- source, target, relation, confidence, source_file are required.",
    "- confidence must be EXTRACTED, INFERRED, or AMBIGUOUS.",
    "",
    "Do not duplicate AST-level imports/calls for code files. Prefer named concepts, citations, rationale and cross-document relationships.",
    "",
    ...files,
  ].join("\n");
}

export function packSemanticFilesByTokenBudget(
  files: string[],
  options: PackSemanticFilesOptions = {},
): DirectSemanticChunk[] {
  const tokenBudget = Math.max(1, options.tokenBudget ?? 60_000);
  const chunks: DirectSemanticChunk[] = [];
  let current: DirectSemanticChunk = { index: 0, files: [], estimatedTokens: 0 };
  for (const file of files) {
    const estimate = estimateFileTokens(file);
    if (current.files.length > 0 && current.estimatedTokens + estimate > tokenBudget) {
      chunks.push(current);
      current = { index: chunks.length, files: [], estimatedTokens: 0 };
    }
    current.files.push(file);
    current.estimatedTokens += estimate;
  }
  if (current.files.length > 0) chunks.push(current);
  return chunks;
}

export function createDirectSemanticExtractionClient(
  options: DirectSemanticClientOptions,
): DirectSemanticExtractionClient {
  const provider = options.provider;
  const model = options.model?.trim() || defaultDirectLlmModel(provider);
  const textClient = createDirectTextJsonClient({ provider, model });
  return {
    provider,
    model,
    async extractChunk(input): Promise<Partial<Extraction>> {
      const outputPath = join(
        tmpdir(),
        `graphify-direct-semantic-${process.pid}-${Date.now()}-${input.chunkIndex}.json`,
      );
      try {
        await textClient.generateJson({
          schema: "graphify_extraction_v1",
          prompt: buildExtractionPrompt(input),
          outputPath,
        });
        const parsed = JSON.parse(readFileSync(outputPath, "utf-8")) as Partial<Extraction>;
        const errors = validateExtraction(parsed);
        if (errors.length > 0) {
          throw new Error(`Direct semantic extraction returned invalid Graphify JSON:\n${errors.join("\n")}`);
        }
        return parsed;
      } finally {
        try {
          unlinkSync(outputPath);
        } catch {
          // Best-effort cleanup only.
        }
      }
    },
  };
}

export async function extractSemanticFilesDirectParallel(
  files: string[],
  options: DirectSemanticExtractionOptions,
): Promise<Extraction> {
  const chunks = packSemanticFilesByTokenBudget(files, { tokenBudget: options.tokenBudget });
  const maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? 4));
  const results: Partial<Extraction>[] = new Array(chunks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < chunks.length) {
      const index = nextIndex++;
      const chunk = chunks[index]!;
      const semanticFiles = chunk.files.map((file) => readSemanticFile(options.root, file));
      results[index] = await options.client.extractChunk({
        chunkIndex: index,
        chunkCount: chunks.length,
        files: semanticFiles,
      });
    }
  }

  const workerCount = Math.min(maxConcurrency, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return mergeExtractions(results);
}
