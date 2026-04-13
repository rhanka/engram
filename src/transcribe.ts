import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const URL_PREFIXES = ["http://", "https://", "www."];
const CACHED_AUDIO_EXTENSIONS = [".m4a", ".opus", ".mp3", ".ogg", ".wav", ".webm"];
const DEFAULT_MODEL = "base";
const TRANSCRIPTS_DIR = "graphify-out/transcripts";
const FALLBACK_PROMPT = "Use proper punctuation and paragraph breaks.";

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

export function transcribe(
  videoPath: string,
  outputDir: string = TRANSCRIPTS_DIR,
  initialPrompt?: string,
  force: boolean = false,
): string {
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
  const env = {
    ...process.env,
    GRAPHIFY_WHISPER_MODEL: process.env.GRAPHIFY_WHISPER_MODEL ?? DEFAULT_MODEL,
    GRAPHIFY_WHISPER_PROMPT: prompt,
  };
  const whisperScript = [
    "import os, sys",
    "from faster_whisper import WhisperModel",
    "audio_path = sys.argv[1]",
    "transcript_path = sys.argv[2]",
    `fallback_prompt = ${JSON.stringify(FALLBACK_PROMPT)}`,
    "model_name = os.environ.get('GRAPHIFY_WHISPER_MODEL', 'base')",
    "prompt = os.environ.get('GRAPHIFY_WHISPER_PROMPT', fallback_prompt)",
    "model = WhisperModel(model_name, device='cpu', compute_type='int8')",
    "segments, info = model.transcribe(audio_path, beam_size=5, initial_prompt=prompt)",
    "lines = [segment.text.strip() for segment in segments if getattr(segment, 'text', '').strip()]",
    "with open(transcript_path, 'w', encoding='utf-8') as handle:",
    "    handle.write('\\n'.join(lines))",
    "lang = getattr(info, 'language', 'unknown')",
    "print(f'{lang}|{len(lines)}')",
  ].join("\n");

  try {
    console.log(`  transcribing ${basename(audioPath)} (model=${env.GRAPHIFY_WHISPER_MODEL}) ...`);
    runCommand("python3", ["-c", whisperScript, audioPath, transcriptPath], { env });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Video transcription requires faster-whisper in a local Python environment. " +
      `Install it first, then retry. ${detail}`,
    );
  }

  return transcriptPath;
}

export function transcribeAll(
  videoFiles: string[],
  outputDir?: string,
  initialPrompt?: string,
): string[] {
  if (videoFiles.length === 0) {
    return [];
  }

  const transcriptPaths: string[] = [];
  for (const videoFile of videoFiles) {
    try {
      transcriptPaths.push(transcribe(videoFile, outputDir, initialPrompt));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.log(`  warning: could not transcribe ${videoFile}: ${detail}`);
    }
  }
  return transcriptPaths;
}
