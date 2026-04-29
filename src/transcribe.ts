import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { defaultTranscriptsDir } from "./paths.js";
import { validateUrl } from "./security.js";
import type { DetectionResult } from "./types.js";

const URL_PREFIXES = ["http://", "https://", "www."];
const CACHED_AUDIO_EXTENSIONS = [".m4a", ".opus", ".mp3", ".ogg", ".wav", ".webm"];
const DEFAULT_MODEL = "base";
const FALLBACK_PROMPT = "Use proper punctuation and paragraph breaks.";
const FASTER_WHISPER_PACKAGE: string = "faster-whisper-ts";
const HUGGING_FACE_RESOLVE_BASE = "https://huggingface.co";
const REQUIRED_MODEL_FILES = ["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"] as const;
const SUPPORTED_MODELS = new Set([
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large-v1",
  "large-v2",
  "large-v3",
  "turbo",
  "distil-small.en",
  "distil-medium.en",
  "distil-large-v2",
  "distil-large-v3",
  "distil-large-v3.5",
]);

const MODEL_ALIASES: Record<string, string> = {
  large: "large-v3",
};

interface FasterWhisperSegment {
  text?: string;
}

interface FasterWhisperTranscriptionOptions {
  beamSize?: number;
  vadFilter?: boolean;
  initialPrompt?: string;
}

interface FasterWhisperModel {
  transcribe(
    audioData: string | Buffer | Uint8Array | Float32Array,
    options?: FasterWhisperTranscriptionOptions,
    language?: string,
    task?: string,
  ): Promise<[FasterWhisperSegment[], unknown]>;
  free(): void;
}

interface FasterWhisperModule {
  WhisperModel: new (
    modelPath: string,
    device?: string,
    deviceIndex?: number,
    computeType?: string,
  ) => FasterWhisperModel;
}

interface WhisperArtifacts {
  requestedModel: string;
  resolvedModel: string;
  modelDir: string;
  repoId: string;
  revision: string;
}

const modelCache = new Map<string, Promise<FasterWhisperModel>>();
let fasterWhisperModulePromise: Promise<FasterWhisperModule> | null = null;

function runCommand(
  command: string,
  args: string[],
  options?: Omit<childProcess.SpawnSyncOptionsWithStringEncoding, "encoding">,
): childProcess.SpawnSyncReturns<string> {
  const result = childProcess.spawnSync(command, args, {
    encoding: "utf-8",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || command + " failed");
  }
  return result;
}

function defaultWhisperCacheDir(): string {
  if (process.env.GRAPHIFY_WHISPER_CACHE_DIR) {
    return resolve(process.env.GRAPHIFY_WHISPER_CACHE_DIR);
  }
  if (platform() === "win32") {
    return join(
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
      "graphify",
      "faster-whisper",
    );
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "graphify", "faster-whisper");
}

function resolveRequestedModel(modelName?: string): { requested: string; resolved: string } {
  const requested = modelName ?? process.env.GRAPHIFY_WHISPER_MODEL ?? DEFAULT_MODEL;
  const resolved = MODEL_ALIASES[requested] ?? requested;
  if (!SUPPORTED_MODELS.has(resolved)) {
    throw new Error(
      "Unsupported GRAPHIFY_WHISPER_MODEL \"" + requested + "\". " +
      "Supported local TS faster-whisper models: " + [...SUPPORTED_MODELS].sort().join(", "),
    );
  }
  return { requested, resolved };
}

function sanitizeCacheSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "__").replace(/^_+|_+$/g, "") || "model";
}

function missingModelFiles(modelDir: string): string[] {
  return REQUIRED_MODEL_FILES.filter((fileName) => !existsSync(join(modelDir, fileName)));
}

function validateWhisperModelDir(modelDir: string, resolvedModel: string): void {
  const missing = missingModelFiles(modelDir);
  if (missing.length > 0) {
    throw new Error(
      "CTranslate2 faster-whisper model for " + resolvedModel + " is incomplete at " + modelDir + "; " +
      "missing " + missing.join(", "),
    );
  }
}

function whisperModelRepoId(resolvedModel: string): string {
  return process.env.GRAPHIFY_WHISPER_MODEL_ID ?? "Systran/faster-whisper-" + resolvedModel;
}

function whisperModelRevision(): string {
  return process.env.GRAPHIFY_WHISPER_MODEL_REVISION ?? "main";
}

function modelDownloadUrl(repoId: string, revision: string, fileName: string): string {
  return HUGGING_FACE_RESOLVE_BASE + "/" + repoId + "/resolve/" + revision + "/" + fileName;
}

function normalizeModelError(detail: string): string {
  if (/HTTP 404|not found/i.test(detail)) {
    return detail + ". The CTranslate2 faster-whisper model file was not found. " +
      "Set GRAPHIFY_WHISPER_MODEL_ID or GRAPHIFY_WHISPER_MODEL_DIR for a custom model repository/path.";
  }
  return detail;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error("HTTP " + response.status + " while downloading " + url);
  }
  await pipeline(Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>), createWriteStream(destination));
}

async function ensureWhisperArtifacts(modelName?: string): Promise<WhisperArtifacts> {
  const { requested, resolved } = resolveRequestedModel(modelName);
  const explicitModelDir = process.env.GRAPHIFY_WHISPER_MODEL_DIR;
  if (explicitModelDir) {
    const modelDir = resolve(explicitModelDir);
    validateWhisperModelDir(modelDir, resolved);
    return {
      requestedModel: requested,
      resolvedModel: resolved,
      modelDir,
      repoId: "local",
      revision: "local",
    };
  }

  const cacheRoot = defaultWhisperCacheDir();
  const repoId = whisperModelRepoId(resolved);
  const revision = whisperModelRevision();
  const modelDir = join(cacheRoot, sanitizeCacheSegment(repoId) + "-" + sanitizeCacheSegment(revision));
  mkdirSync(cacheRoot, { recursive: true });

  if (missingModelFiles(modelDir).length === 0) {
    return { requestedModel: requested, resolvedModel: resolved, modelDir, repoId, revision };
  }

  const tempDir = mkdtempSync(join(tmpdir(), "graphify-whisper-model-"));
  try {
    console.log("  downloading faster-whisper model: " + resolved + " (" + repoId + "@" + revision + ")");
    mkdirSync(tempDir, { recursive: true });
    for (const fileName of REQUIRED_MODEL_FILES) {
      await downloadFile(modelDownloadUrl(repoId, revision, fileName), join(tempDir, fileName));
    }

    validateWhisperModelDir(tempDir, resolved);
    rmSync(modelDir, { recursive: true, force: true });
    mkdirSync(modelDir, { recursive: true });
    for (const fileName of REQUIRED_MODEL_FILES) {
      writeFileSync(join(modelDir, fileName), await readFile(join(tempDir, fileName)));
    }

    return { requestedModel: requested, resolvedModel: resolved, modelDir, repoId, revision };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(normalizeModelError(detail));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function loadFasterWhisperModule(): Promise<FasterWhisperModule> {
  if (!fasterWhisperModulePromise) {
    fasterWhisperModulePromise = import(FASTER_WHISPER_PACKAGE)
      .then((imported) => {
        const candidate = Reflect.has(imported, "WhisperModel")
          ? imported
          : Reflect.get(imported, "default");
        const WhisperModel = candidate ? Reflect.get(candidate, "WhisperModel") : undefined;
        if (typeof WhisperModel !== "function") {
          throw new Error("faster-whisper-ts did not expose WhisperModel");
        }
        return candidate as FasterWhisperModule;
      })
      .catch((error) => {
        fasterWhisperModulePromise = null;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          "Video transcription requires the optional dependency faster-whisper-ts. " +
          "Install it locally, then retry. " + detail,
        );
      });
  }
  return fasterWhisperModulePromise;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

async function getWhisperModel(modelName?: string): Promise<{ model: FasterWhisperModel; artifacts: WhisperArtifacts }> {
  const artifacts = await ensureWhisperArtifacts(modelName);
  const device = process.env.GRAPHIFY_WHISPER_DEVICE ?? "cpu";
  const deviceIndex = envNumber("GRAPHIFY_WHISPER_DEVICE_INDEX", 0);
  const computeType = process.env.GRAPHIFY_WHISPER_COMPUTE_TYPE ?? "int8";
  const cacheKey = [artifacts.modelDir, device, String(deviceIndex), computeType].join("|");
  const existing = modelCache.get(cacheKey);
  if (existing) {
    return { model: await existing, artifacts };
  }

  const createModel = (async () => {
    const runtime = await loadFasterWhisperModule();
    return new runtime.WhisperModel(artifacts.modelDir, device, deviceIndex, computeType);
  })();

  modelCache.set(
    cacheKey,
    createModel.catch((error) => {
      modelCache.delete(cacheKey);
      throw error;
    }),
  );

  return { model: await modelCache.get(cacheKey)!, artifacts };
}

function stripPromptEcho(transcript: string, prompt?: string): string {
  const normalizedTranscript = transcript.replace(/\s+/g, " ").trim();
  const normalizedPrompt = String(prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedPrompt) {
    return normalizedTranscript;
  }

  if (normalizedTranscript.toLowerCase().startsWith(normalizedPrompt.toLowerCase())) {
    return normalizedTranscript
      .slice(normalizedPrompt.length)
      .replace(/^[\s.,:;!?-]+/, "")
      .trim();
  }

  return normalizedTranscript;
}

function extractTranscriptText(segments: FasterWhisperSegment[], prompt?: string): string {
  const transcript = segments
    .map((segment) => String(segment.text ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return stripPromptEcho(transcript, prompt);
}

export function isUrl(pathLike: string): boolean {
  return URL_PREFIXES.some((prefix) => pathLike.startsWith(prefix));
}

export async function downloadAudio(url: string, outputDir: string): Promise<string> {
  mkdirSync(outputDir, { recursive: true });

  const urlHash = createHash("sha1").update(url).digest("hex").slice(0, 12);
  for (const ext of CACHED_AUDIO_EXTENSIONS) {
    const candidate = join(outputDir, "yt_" + urlHash + ext);
    if (existsSync(candidate)) {
      console.log("  cached audio: " + basename(candidate));
      return candidate;
    }
  }

  await validateUrl(url);

  const outTemplate = join(outputDir, "yt_" + urlHash + ".%(ext)s");
  try {
    console.log("  downloading audio: " + url.slice(0, 80) + " ...");
    runCommand("yt-dlp", [
      "-f",
      "bestaudio[ext=m4a]/bestaudio/best",
      "-o",
      outTemplate,
      "--quiet",
      "--no-warnings",
      "--no-playlist",
      url,
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "YouTube/URL download requires yt-dlp. Install yt-dlp to enable video ingestion. " + detail,
    );
  }

  for (const entry of readdirSync(outputDir)) {
    if (entry.startsWith("yt_" + urlHash + ".")) {
      return join(outputDir, entry);
    }
  }

  throw new Error("yt-dlp finished without producing an audio file for " + url);
}

export function buildWhisperPrompt(
  godNodes: Array<{ label?: string | null }>,
): string {
  const override = process.env.GRAPHIFY_WHISPER_PROMPT;
  if (override) return override;

  const labels = godNodes
    .map((node) => node.label ?? "")
    .filter((label): label is string => Boolean(label))
    .slice(0, 5);
  if (labels.length === 0) {
    return FALLBACK_PROMPT;
  }
  return "Technical discussion about " + labels.join(", ") + ". " + FALLBACK_PROMPT;
}

export async function transcribe(
  videoPath: string,
  outputDir: string = defaultTranscriptsDir(),
  initialPrompt?: string,
  force: boolean = false,
): Promise<string> {
  const outDir = resolve(outputDir);
  mkdirSync(outDir, { recursive: true });

  const audioPath = isUrl(videoPath)
    ? await downloadAudio(videoPath, join(outDir, "downloads"))
    : resolve(videoPath);
  const transcriptPath = join(outDir, basename(audioPath, extname(audioPath)) + ".txt");

  if (existsSync(transcriptPath) && !force) {
    return transcriptPath;
  }

  const prompt = initialPrompt ?? process.env.GRAPHIFY_WHISPER_PROMPT ?? FALLBACK_PROMPT;
  const requestedModel = process.env.GRAPHIFY_WHISPER_MODEL ?? DEFAULT_MODEL;
  const previousFfmpegPath = process.env.FASTER_WHISPER_FFMPEG_PATH;
  const shouldRestoreFfmpegPath = previousFfmpegPath === undefined && Boolean(process.env.GRAPHIFY_FFMPEG_BIN);
  if (shouldRestoreFfmpegPath) {
    process.env.FASTER_WHISPER_FFMPEG_PATH = process.env.GRAPHIFY_FFMPEG_BIN;
  }

  try {
    console.log("  transcribing " + basename(audioPath) + " (model=" + requestedModel + ") ...");
    const { model, artifacts } = await getWhisperModel(requestedModel);
    const [segments] = await model.transcribe(
      audioPath,
      {
        beamSize: envNumber("GRAPHIFY_WHISPER_BEAM_SIZE", 5),
        vadFilter: envBoolean("GRAPHIFY_WHISPER_VAD_FILTER", true),
        initialPrompt: prompt,
      },
      process.env.GRAPHIFY_WHISPER_LANGUAGE,
      "transcribe",
    );
    const transcript = extractTranscriptText(segments, prompt);
    writeFileSync(transcriptPath, transcript, "utf-8");
    if (artifacts.requestedModel !== artifacts.resolvedModel) {
      console.log("  model alias: " + artifacts.requestedModel + " -> " + artifacts.resolvedModel);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unsupported GRAPHIFY_WHISPER_MODEL")) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Video transcription requires the local TypeScript faster-whisper toolchain: " +
      "faster-whisper-ts + ffmpeg. Retry after installing them. " + detail,
    );
  } finally {
    if (shouldRestoreFfmpegPath) {
      delete process.env.FASTER_WHISPER_FFMPEG_PATH;
    }
  }

  return transcriptPath;
}

export async function transcribeAll(
  videoFiles: string[],
  outputDir?: string,
  initialPrompt?: string,
  force: boolean = false,
): Promise<string[]> {
  if (videoFiles.length === 0) {
    return [];
  }

  const transcriptPaths: string[] = [];
  for (const videoFile of videoFiles) {
    try {
      transcriptPaths.push(await transcribe(videoFile, outputDir, initialPrompt, force));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.log("  warning: could not transcribe " + videoFile + ": " + detail);
    }
  }
  return transcriptPaths;
}

function cloneDetection(detection: DetectionResult): DetectionResult {
  return JSON.parse(JSON.stringify(detection)) as DetectionResult;
}

export async function augmentDetectionWithTranscripts(
  detection: DetectionResult,
  options?: {
    outputDir?: string;
    initialPrompt?: string;
    godNodes?: Array<{ label?: string | null }>;
    incremental?: boolean;
    whisperModel?: string;
  },
): Promise<{ detection: DetectionResult; transcriptPaths: string[]; prompt: string }> {
  const nextDetection = cloneDetection(detection);
  const source = options?.incremental && nextDetection.new_files ? nextDetection.new_files : nextDetection.files;
  const videoFiles = [...(source.video ?? [])];
  const prompt = options?.initialPrompt ?? buildWhisperPrompt(options?.godNodes ?? []);

  if (videoFiles.length === 0) {
    return { detection: nextDetection, transcriptPaths: [], prompt };
  }

  const previousModel = process.env.GRAPHIFY_WHISPER_MODEL;
  if (options?.whisperModel) {
    process.env.GRAPHIFY_WHISPER_MODEL = options.whisperModel;
  }

  try {
    const transcriptPaths = await transcribeAll(
      videoFiles,
      options?.outputDir,
      prompt,
      options?.incremental === true,
    );
    const existingDocuments = source.document ?? [];
    source.document = [...existingDocuments, ...transcriptPaths];
    return { detection: nextDetection, transcriptPaths, prompt };
  } finally {
    if (options?.whisperModel) {
      if (previousModel === undefined) {
        delete process.env.GRAPHIFY_WHISPER_MODEL;
      } else {
        process.env.GRAPHIFY_WHISPER_MODEL = previousModel;
      }
    }
  }
}
