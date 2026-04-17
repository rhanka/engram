import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { defaultTranscriptsDir } from "./paths.js";
import type { DetectionResult } from "./types.js";

const URL_PREFIXES = ["http://", "https://", "www."];
const CACHED_AUDIO_EXTENSIONS = [".m4a", ".opus", ".mp3", ".ogg", ".wav", ".webm"];
const DEFAULT_MODEL = "base";
const FALLBACK_PROMPT = "Use proper punctuation and paragraph breaks.";
const SHERPA_RELEASE_BASE =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models";
const AUDIO_SAMPLE_RATE = 16000;
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

interface SherpaWave {
  samples: Float32Array;
  sampleRate: number;
}

interface SherpaResult {
  text?: string;
}

interface SherpaStream {
  acceptWaveform(input: SherpaWave): void;
  setOption?(key: string, value: string): void;
}

interface SherpaRecognizer {
  createStream(): SherpaStream;
  decodeAsync(stream: SherpaStream): Promise<SherpaResult>;
}

interface SherpaModule {
  OfflineRecognizer: {
    createAsync(config: unknown): Promise<SherpaRecognizer>;
  };
  readWave(path: string): SherpaWave;
}

interface WhisperArtifacts {
  requestedModel: string;
  resolvedModel: string;
  modelDir: string;
  encoderPath: string;
  decoderPath: string;
  tokensPath: string;
}

const recognizerCache = new Map<string, Promise<SherpaRecognizer>>();
let sherpaModulePromise: Promise<SherpaModule> | null = null;

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
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} failed`);
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
      "whisper",
    );
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "graphify", "whisper");
}

function ffmpegBinary(): string {
  return process.env.GRAPHIFY_FFMPEG_BIN ?? "ffmpeg";
}

function tarBinary(): string {
  return process.env.GRAPHIFY_TAR_BIN ?? "tar";
}

function resolveRequestedModel(modelName?: string): { requested: string; resolved: string } {
  const requested = modelName ?? process.env.GRAPHIFY_WHISPER_MODEL ?? DEFAULT_MODEL;
  const resolved = MODEL_ALIASES[requested] ?? requested;
  if (!SUPPORTED_MODELS.has(resolved)) {
    throw new Error(
      `Unsupported GRAPHIFY_WHISPER_MODEL "${requested}". ` +
      `Supported local TS models: ${[...SUPPORTED_MODELS].sort().join(", ")}`,
    );
  }
  return { requested, resolved };
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function findArtifactsIn(dir: string): Omit<WhisperArtifacts, "requestedModel" | "resolvedModel"> | null {
  const files = walkFiles(dir);
  const encoderPath =
    files.find((path) => path.endsWith("-encoder.int8.onnx"))
    ?? files.find((path) => path.endsWith("-encoder.onnx"));
  const decoderPath =
    files.find((path) => path.endsWith("-decoder.int8.onnx"))
    ?? files.find((path) => path.endsWith("-decoder.onnx"));
  const tokensPath = files.find((path) => path.endsWith("-tokens.txt"));
  if (!encoderPath || !decoderPath || !tokensPath) {
    return null;
  }
  return {
    modelDir: dir,
    encoderPath,
    decoderPath,
    tokensPath,
  };
}

function normalizeModelError(detail: string): string {
  if (detail.includes("404")) {
    return `${detail}. The local sherpa-onnx release asset was not found for this Whisper model name.`;
  }
  return detail;
}

async function writeResponseToFile(response: Response, destination: string): Promise<void> {
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} while downloading ${response.url}`);
  }
  await pipeline(Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>), createWriteStream(destination));
}

async function ensureWhisperArtifacts(modelName?: string): Promise<WhisperArtifacts> {
  const { requested, resolved } = resolveRequestedModel(modelName);
  const cacheRoot = defaultWhisperCacheDir();
  mkdirSync(cacheRoot, { recursive: true });

  const modelDir = join(cacheRoot, `sherpa-onnx-whisper-${resolved}`);
  const cached = findArtifactsIn(modelDir);
  if (cached) {
    return { requestedModel: requested, resolvedModel: resolved, ...cached };
  }

  const tempDir = mkdtempSync(join(tmpdir(), "graphify-whisper-model-"));
  const extractDir = join(tempDir, "extract");
  const archiveName = `sherpa-onnx-whisper-${resolved}.tar.bz2`;
  const archivePath = join(tempDir, archiveName);
  mkdirSync(extractDir, { recursive: true });

  try {
    const url = `${SHERPA_RELEASE_BASE}/${archiveName}`;
    console.log(`  downloading whisper model: ${resolved}`);
    const response = await fetch(url);
    await writeResponseToFile(response, archivePath);

    runCommand(tarBinary(), ["-xjf", archivePath, "-C", extractDir]);

    const extractedRoot = walkFiles(extractDir)
      .map((path) => dirname(path))
      .find((path) => findArtifactsIn(path) !== null);
    const sourceDir =
      extractedRoot
      ?? readdirSync(extractDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(extractDir, entry.name))
        .find((path) => findArtifactsIn(path) !== null);

    if (!sourceDir) {
      throw new Error(`Downloaded archive for ${resolved} but could not locate Whisper model files`);
    }

    if (existsSync(modelDir)) {
      rmSync(modelDir, { recursive: true, force: true });
    }
    try {
      renameSync(sourceDir, modelDir);
    } catch {
      cpSync(sourceDir, modelDir, { recursive: true });
    }

    const artifacts = findArtifactsIn(modelDir);
    if (!artifacts) {
      throw new Error(`Model cache for ${resolved} is incomplete after extraction`);
    }

    return { requestedModel: requested, resolvedModel: resolved, ...artifacts };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(normalizeModelError(detail));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function loadSherpaModule(): Promise<SherpaModule> {
  if (!sherpaModulePromise) {
    sherpaModulePromise = import("sherpa-onnx-node")
      .then((imported) => (
        Reflect.has(imported, "default")
          ? Reflect.get(imported, "default")
          : imported
      ) as SherpaModule)
      .catch((error) => {
        sherpaModulePromise = null;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          "Video transcription requires the optional dependency sherpa-onnx-node. " +
          `Install it locally, then retry. ${detail}`,
        );
      });
  }
  return sherpaModulePromise;
}

async function getRecognizer(
  modelName?: string,
  sherpa?: SherpaModule,
): Promise<{ recognizer: SherpaRecognizer; artifacts: WhisperArtifacts }> {
  const artifacts = await ensureWhisperArtifacts(modelName);
  const cacheKey = artifacts.modelDir;
  const existing = recognizerCache.get(cacheKey);
  if (existing) {
    return { recognizer: await existing, artifacts };
  }

  const createRecognizer = (async () => {
    const runtime = sherpa ?? (await loadSherpaModule());
    return runtime.OfflineRecognizer.createAsync({
      featConfig: {
        sampleRate: AUDIO_SAMPLE_RATE,
        featureDim: 80,
      },
      modelConfig: {
        whisper: {
          encoder: artifacts.encoderPath,
          decoder: artifacts.decoderPath,
          task: "transcribe",
        },
        tokens: artifacts.tokensPath,
        numThreads: 1,
        provider: "cpu",
        debug: 0,
      },
    });
  })();

  recognizerCache.set(
    cacheKey,
    createRecognizer.catch((error) => {
      recognizerCache.delete(cacheKey);
      throw error;
    }),
  );

  return { recognizer: await recognizerCache.get(cacheKey)!, artifacts };
}

function normalizeToWave(audioPath: string, workingDir: string): string {
  const wavPath = join(workingDir, `${basename(audioPath, extname(audioPath))}.wav`);
  try {
    runCommand(ffmpegBinary(), [
      "-y",
      "-i",
      audioPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(AUDIO_SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      wavPath,
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Video transcription requires ffmpeg in PATH. " +
      `Install ffmpeg locally, then retry. ${detail}`,
    );
  }
  return wavPath;
}

function extractTranscriptText(result: SherpaResult): string {
  return String(result.text ?? "").trim();
}

export function isUrl(pathLike: string): boolean {
  return URL_PREFIXES.some((prefix) => pathLike.startsWith(prefix));
}

export function downloadAudio(url: string, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });

  const urlHash = createHash("sha1").update(url).digest("hex").slice(0, 12);
  for (const ext of CACHED_AUDIO_EXTENSIONS) {
    const candidate = join(outputDir, `yt_${urlHash}${ext}`);
    if (existsSync(candidate)) {
      console.log(`  cached audio: ${basename(candidate)}`);
      return candidate;
    }
  }

  const outTemplate = join(outputDir, `yt_${urlHash}.%(ext)s`);
  try {
    console.log(`  downloading audio: ${url.slice(0, 80)} ...`);
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
      `YouTube/URL download requires yt-dlp. Install yt-dlp to enable video ingestion. ${detail}`,
    );
  }

  for (const entry of readdirSync(outputDir)) {
    if (entry.startsWith(`yt_${urlHash}.`)) {
      return join(outputDir, entry);
    }
  }

  throw new Error(`yt-dlp finished without producing an audio file for ${url}`);
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
  return `Technical discussion about ${labels.join(", ")}. ${FALLBACK_PROMPT}`;
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
    ? downloadAudio(videoPath, join(outDir, "downloads"))
    : resolve(videoPath);
  const transcriptPath = join(outDir, `${basename(audioPath, extname(audioPath))}.txt`);

  if (existsSync(transcriptPath) && !force) {
    return transcriptPath;
  }

  const prompt = initialPrompt ?? process.env.GRAPHIFY_WHISPER_PROMPT ?? FALLBACK_PROMPT;
  const requestedModel = process.env.GRAPHIFY_WHISPER_MODEL ?? DEFAULT_MODEL;
  const tempDir = mkdtempSync(join(tmpdir(), "graphify-transcribe-"));

  try {
    console.log(`  transcribing ${basename(audioPath)} (model=${requestedModel}) ...`);
    const wavPath = normalizeToWave(audioPath, tempDir);
    const sherpa = await loadSherpaModule();
    const { recognizer, artifacts } = await getRecognizer(requestedModel, sherpa);
    const wave = sherpa.readWave(wavPath);
    const stream = recognizer.createStream();
    if (prompt && typeof stream.setOption === "function") {
      try {
        stream.setOption("prompt", prompt);
      } catch {
        /* ignored: sherpa-onnx does not guarantee prompt support across builds */
      }
    }
    stream.acceptWaveform({ samples: wave.samples, sampleRate: wave.sampleRate });
    const result = await recognizer.decodeAsync(stream);
    const transcript = extractTranscriptText(result);
    writeFileSync(transcriptPath, transcript, "utf-8");
    if (artifacts.requestedModel !== artifacts.resolvedModel) {
      console.log(`  model alias: ${artifacts.requestedModel} -> ${artifacts.resolvedModel}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unsupported GRAPHIFY_WHISPER_MODEL")) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Video transcription requires the local TypeScript toolchain: sherpa-onnx-node + ffmpeg. " +
      `Retry after installing them. ${detail}`,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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
      console.log(`  warning: could not transcribe ${videoFile}: ${detail}`);
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
