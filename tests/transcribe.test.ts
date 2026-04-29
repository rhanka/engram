import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { WhisperModelMock, freeMock, transcribeMock } = vi.hoisted(() => ({
  WhisperModelMock: vi.fn(),
  freeMock: vi.fn(),
  transcribeMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("faster-whisper-ts", () => ({
  WhisperModel: WhisperModelMock,
}));

import { spawnSync } from "node:child_process";
import {
  augmentDetectionWithTranscripts,
  buildWhisperPrompt,
  downloadAudio,
  isUrl,
  transcribe,
  transcribeAll,
} from "../src/transcribe.js";

const tempDirs: string[] = [];
const spawnSyncMock = vi.mocked(spawnSync);

describe("transcribe helpers", () => {
  let tmpDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-transcribe-"));
    tempDirs.push(tmpDir);
    process.env.GRAPHIFY_WHISPER_CACHE_DIR = join(tmpDir, "model-cache");
    fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    transcribeMock.mockResolvedValue([
      [{ text: "decoded speech" }],
      { language: "en", language_probability: 1, duration: 1, duration_after_vad: 1 },
    ]);
    WhisperModelMock.mockImplementation(() => ({
      transcribe: transcribeMock,
      free: freeMock,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    spawnSyncMock.mockReset();
    WhisperModelMock.mockReset();
    transcribeMock.mockReset();
    freeMock.mockReset();
    vi.unstubAllGlobals();
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
    delete process.env.FASTER_WHISPER_FFMPEG_PATH;
    delete process.env.GRAPHIFY_FFMPEG_BIN;
    delete process.env.GRAPHIFY_WHISPER_PROMPT;
    delete process.env.GRAPHIFY_WHISPER_MODEL;
    delete process.env.GRAPHIFY_WHISPER_MODEL_DIR;
    delete process.env.GRAPHIFY_WHISPER_MODEL_ID;
    delete process.env.GRAPHIFY_WHISPER_MODEL_REVISION;
    delete process.env.GRAPHIFY_WHISPER_CACHE_DIR;
  });

  function mockYtDlpDownload(): void {
    spawnSyncMock.mockImplementation((cmd, args) => {
      const argv = (args ?? []).map(String);
      if (cmd === "yt-dlp") {
        const outIndex = argv.indexOf("-o") + 1;
        const template = argv[outIndex] ?? join(tmpDir, "yt_missing.%(ext)s");
        writeFileSync(template.replace("%(ext)s", "m4a"), "audio");
      }
      return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });
  }

  it("detects URL-looking inputs", () => {
    expect(isUrl("https://example.com/video")).toBe(true);
    expect(isUrl("www.example.com/video")).toBe(true);
    expect(isUrl("/tmp/lecture.mp4")).toBe(false);
  });

  it("uses the fallback prompt when no god nodes are available", () => {
    expect(buildWhisperPrompt([])).toContain("punctuation");
  });

  it("honors GRAPHIFY_WHISPER_PROMPT when set", () => {
    process.env.GRAPHIFY_WHISPER_PROMPT = "Custom domain hint.";
    expect(buildWhisperPrompt([{ label: "Transformers" }])).toBe("Custom domain hint.");
  });

  it("builds a domain prompt from god node labels", () => {
    expect(buildWhisperPrompt([
      { label: "neural networks" },
      { label: "transformers" },
      { label: "attention" },
    ])).toContain("neural networks");
  });

  it("returns a cached downloaded audio file without calling yt-dlp", async () => {
    const url = "https://www.youtube.com/watch?v=abc";
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
    const cached = join(tmpDir, "yt_" + hash + ".m4a");
    writeFileSync(cached, "cached");

    const result = await downloadAudio(url, tmpDir);

    expect(result).toBe(cached);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("downloads audio with yt-dlp and returns the downloaded path", async () => {
    const url = "https://www.youtube.com/watch?v=abc";
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
    mockYtDlpDownload();

    const result = await downloadAudio(url, tmpDir);

    expect(result).toBe(join(tmpDir, "yt_" + hash + ".m4a"));
  });

  it("validates URL targets before invoking yt-dlp", async () => {
    await expect(downloadAudio("http://127.0.0.1/private", tmpDir)).rejects.toThrow(
      "Blocked private/internal IP",
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("returns a cached transcript without rerunning local transcription", async () => {
    const video = join(tmpDir, "lecture.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "lecture.txt"), "cached transcript");

    const result = await transcribe(video, outDir);

    expect(result).toBe(join(outDir, "lecture.txt"));
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(WhisperModelMock).not.toHaveBeenCalled();
  });

  it("force reruns transcription through faster-whisper-ts and writes the transcript output", async () => {
    const video = join(tmpDir, "talk.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "talk.txt"), "old transcript");

    const result = await transcribe(video, outDir, "Custom prompt", true);

    expect(result).toBe(join(outDir, "talk.txt"));
    expect(readFileSync(result, "utf-8")).toBe("decoded speech");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://huggingface.co/Systran/faster-whisper-base/resolve/main/config.json",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://huggingface.co/Systran/faster-whisper-base/resolve/main/model.bin",
    );
    expect(WhisperModelMock).toHaveBeenCalledTimes(1);
    expect(transcribeMock).toHaveBeenCalledWith(
      video,
      expect.objectContaining({
        beamSize: 5,
        initialPrompt: "Custom prompt",
        vadFilter: true,
      }),
      undefined,
      "transcribe",
    );
  });

  it("strips an echoed initial prompt from faster-whisper output", async () => {
    const video = join(tmpDir, "prompt-echo.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    transcribeMock.mockResolvedValueOnce([
      [{ text: "Custom prompt. decoded speech" }],
      { language: "en" },
    ]);

    const result = await transcribe(video, outDir, "Custom prompt.", true);

    expect(readFileSync(result, "utf-8")).toBe("decoded speech");
  });

  it("maps the large alias to the upstream-compatible large-v3 faster-whisper model", async () => {
    const video = join(tmpDir, "townhall.mp4");
    writeFileSync(video, "audio");
    process.env.GRAPHIFY_WHISPER_MODEL = "large";

    await transcribe(video, join(tmpDir, "out"), undefined, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main/config.json",
    );
  });

  it("can use an explicit local faster-whisper model directory", async () => {
    const video = join(tmpDir, "local-model.mp4");
    const modelDir = join(tmpDir, "faster-whisper-base");
    writeFileSync(video, "audio");
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, "config.json"), "{}");
    writeFileSync(join(modelDir, "model.bin"), "model");
    writeFileSync(join(modelDir, "tokenizer.json"), "{}");
    writeFileSync(join(modelDir, "vocabulary.txt"), "tokens");
    process.env.GRAPHIFY_WHISPER_MODEL_DIR = modelDir;

    await transcribe(video, join(tmpDir, "out"), undefined, true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(WhisperModelMock).toHaveBeenCalledWith(modelDir, "cpu", 0, "int8");
  });

  it("propagates a clear error when ffmpeg is unavailable in faster-whisper-ts", async () => {
    const video = join(tmpDir, "clip.mp4");
    writeFileSync(video, "audio");
    transcribeMock.mockRejectedValueOnce(new Error("ffmpeg: command not found"));

    await expect(transcribe(video, join(tmpDir, "out"), undefined, true)).rejects.toThrow(/ffmpeg/i);
  });

  it("transcribeAll returns an empty list for empty input", async () => {
    await expect(transcribeAll([])).resolves.toEqual([]);
  });

  it("transcribeAll skips failed files and keeps successful ones", async () => {
    const videoA = join(tmpDir, "a.mp4");
    const videoB = join(tmpDir, "b.mp4");
    writeFileSync(videoA, "a");
    writeFileSync(videoB, "b");
    transcribeMock
      .mockResolvedValueOnce([[{ text: "decoded speech" }], { language: "en" }])
      .mockRejectedValueOnce(new Error("boom"));

    const results = await transcribeAll([videoA, videoB], join(tmpDir, "out"), "Prompt");

    expect(results).toEqual([join(tmpDir, "out", "a.txt")]);
    expect(existsSync(join(tmpDir, "out", "a.txt"))).toBe(true);
    expect(existsSync(join(tmpDir, "out", "b.txt"))).toBe(false);
  });

  it("adds generated transcripts to detected documents", async () => {
    const video = join(tmpDir, "clip.mp4");
    writeFileSync(video, "audio");

    const result = await augmentDetectionWithTranscripts({
      files: { code: [], document: [], image: [], video: [video] },
      skipped: [],
      root: tmpDir,
    }, {
      outputDir: join(tmpDir, "out"),
      godNodes: [{ label: "Graphify" }],
    });

    expect(result.transcriptPaths).toEqual([join(tmpDir, "out", "clip.txt")]);
    expect(result.detection.files.document).toEqual([join(tmpDir, "out", "clip.txt")]);
    expect(result.prompt).toContain("Graphify");
  });
});
