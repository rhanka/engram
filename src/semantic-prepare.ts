import type { DetectionResult } from "./types.js";
import { augmentDetectionWithPdfPreflight, type PdfPreparationArtifact } from "./pdf-ocr.js";
import { parsePdfOcrMode, type PdfOcrMode } from "./pdf-preflight.js";
import { augmentDetectionWithTranscripts, buildWhisperPrompt } from "./transcribe.js";

export interface SemanticPreparationOptions {
  transcriptOutputDir?: string;
  pdfOutputDir?: string;
  initialPrompt?: string;
  godNodes?: Array<{ label?: string | null }>;
  incremental?: boolean;
  whisperModel?: string;
  pdfOcrMode?: PdfOcrMode;
  pdfOcrModel?: string;
  mistralApiKey?: string;
}

export interface SemanticPreparationResult {
  detection: DetectionResult;
  transcriptPaths: string[];
  pdfArtifacts: PdfPreparationArtifact[];
  prompt: string;
}

export async function prepareSemanticDetection(
  detection: DetectionResult,
  options: SemanticPreparationOptions = {},
): Promise<SemanticPreparationResult> {
  const prompt = options.initialPrompt ?? buildWhisperPrompt(options.godNodes ?? []);
  const transcriptResult = await augmentDetectionWithTranscripts(detection, {
    outputDir: options.transcriptOutputDir,
    initialPrompt: prompt,
    godNodes: options.godNodes,
    incremental: options.incremental,
    whisperModel: options.whisperModel,
  });

  const pdfResult = await augmentDetectionWithPdfPreflight(transcriptResult.detection, {
    outputDir: options.pdfOutputDir,
    mode: options.pdfOcrMode ?? parsePdfOcrMode(),
    incremental: options.incremental,
    model: options.pdfOcrModel,
    apiKey: options.mistralApiKey,
  });

  return {
    detection: pdfResult.detection,
    transcriptPaths: transcriptResult.transcriptPaths,
    pdfArtifacts: pdfResult.pdfArtifacts,
    prompt,
  };
}
