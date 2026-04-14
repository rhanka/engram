import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAsyncMock, readWaveMock } = vi.hoisted(() => ({
  createAsyncMock: vi.fn(),
  readWaveMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("sherpa-onnx-node", () => ({
  OfflineRecognizer: {
    createAsync: createAsyncMock,
  },
  readWave: readWaveMock,
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
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    readWaveMock.mockReturnValue({
      samples: new Float32Array([0, 0.2, -0.1]),
      sampleRate: 16000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    spawnSyncMock.mockReset();
    createAsyncMock.mockReset();
    readWaveMock.mockReset();
    vi.unstubAllGlobals();
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
    delete process.env.GRAPHIFY_WHISPER_PROMPT;
    delete process.env.GRAPHIFY_WHISPER_MODEL;
    delete process.env.GRAPHIFY_WHISPER_CACHE_DIR;
  });

  function mockModelDownload(modelName: string = "base"): void {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    createAsyncMock.mockResolvedValue({
      createStream: () => ({
        acceptWaveform: vi.fn(),
        setOption: vi.fn(),
      }),
      decodeAsync: vi.fn().mockResolvedValue({ text: "decoded speech" }),
    });

    spawnSyncMock.mockImplementation((cmd, args) => {
      const argv = (args ?? []).map(String);
      if (cmd === "ffmpeg") {
        writeFileSync(String(argv.at(-1)), "wav");
        return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
      }
      if (cmd === "tar") {
        const extractDir = String(argv[3]);
        const modelDir = join(extractDir, `sherpa-onnx-whisper-${modelName}`);
        mkdirSync(modelDir, { recursive: true });
        writeFileSync(join(modelDir, `${modelName}-encoder.int8.onnx`), "encoder");
        writeFileSync(join(modelDir, `${modelName}-decoder.int8.onnx`), "decoder");
        writeFileSync(join(modelDir, `${modelName}-tokens.txt`), "tokens");
        return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
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

  it("returns a cached downloaded audio file without calling yt-dlp", () => {
    const url = "https://www.youtube.com/watch?v=abc";
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
    const cached = join(tmpDir, `yt_${hash}.m4a`);
    writeFileSync(cached, "cached");

    const result = downloadAudio(url, tmpDir);

    expect(result).toBe(cached);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("downloads audio with yt-dlp and returns the downloaded path", () => {
    const url = "https://www.youtube.com/watch?v=abc";
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
    spawnSyncMock.mockImplementation(() => {
      writeFileSync(join(tmpDir, `yt_${hash}.m4a`), "audio");
      return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

    const result = downloadAudio(url, tmpDir);

    expect(result).toBe(join(tmpDir, `yt_${hash}.m4a`));
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
  });

  it("force reruns transcription through ffmpeg + sherpa and writes the transcript output", async () => {
    const video = join(tmpDir, "talk.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "talk.txt"), "old transcript");
    mockModelDownload();

    const result = await transcribe(video, outDir, "Custom prompt", true);

    expect(result).toBe(join(outDir, "talk.txt"));
    expect(readFileSync(result, "utf-8")).toBe("decoded speech");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2",
    );
    expect(createAsyncMock).toHaveBeenCalledTimes(1);
    expect(createAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfig: expect.objectContaining({
          whisper: expect.objectContaining({
            task: "transcribe",
          }),
        }),
      }),
    );
  });

  it("maps the large alias to the upstream-compatible large-v3 model asset", async () => {
    const video = join(tmpDir, "townhall.mp4");
    writeFileSync(video, "audio");
    process.env.GRAPHIFY_WHISPER_MODEL = "large";
    mockModelDownload("large-v3");

    await transcribe(video, join(tmpDir, "out"), undefined, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-large-v3.tar.bz2",
    );
  });

  it("propagates a clear error when ffmpeg is unavailable", async () => {
    const video = join(tmpDir, "clip.mp4");
    writeFileSync(video, "audio");
    spawnSyncMock.mockImplementation((cmd) => {
      if (cmd === "ffmpeg") {
        return {
          status: 1,
          stdout: "",
          stderr: "ffmpeg: command not found",
          output: [],
        } as ReturnType<typeof spawnSync>;
      }
      return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

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
    mockModelDownload();

    let ffmpegCalls = 0;
    spawnSyncMock.mockImplementation((cmd, args) => {
      const argv = (args ?? []).map(String);
      if (cmd === "tar") {
        const extractDir = String(argv[3]);
        const modelDir = join(extractDir, "sherpa-onnx-whisper-base");
        mkdirSync(modelDir, { recursive: true });
        writeFileSync(join(modelDir, "base-encoder.int8.onnx"), "encoder");
        writeFileSync(join(modelDir, "base-decoder.int8.onnx"), "decoder");
        writeFileSync(join(modelDir, "base-tokens.txt"), "tokens");
        return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
      }
      if (cmd === "ffmpeg") {
        ffmpegCalls += 1;
        if (ffmpegCalls === 2) {
          return { status: 1, stdout: "", stderr: "boom", output: [] } as ReturnType<typeof spawnSync>;
        }
        writeFileSync(String(argv.at(-1)), "wav");
        return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
      }
      return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

    const results = await transcribeAll([videoA, videoB], join(tmpDir, "out"), "Prompt");

    expect(results).toEqual([join(tmpDir, "out", "a.txt")]);
    expect(existsSync(join(tmpDir, "out", "a.txt"))).toBe(true);
    expect(existsSync(join(tmpDir, "out", "b.txt"))).toBe(false);
  });

  it("augments detection files with transcript paths for semantic extraction", async () => {
    const video = join(tmpDir, "lecture.mp4");
    writeFileSync(video, "audio");
    mockModelDownload();

    const baseDetection = {
      files: { code: [], document: [], paper: [], image: [], video: [video] },
      total_files: 1,
      total_words: 0,
      needs_graph: true,
      warning: null,
      skipped_sensitive: [],
      graphifyignore_patterns: 0,
    };

    const result = await augmentDetectionWithTranscripts(baseDetection, {
      outputDir: join(tmpDir, "transcripts"),
      godNodes: [{ label: "transformers" }],
    });

    expect(result.transcriptPaths).toEqual([join(tmpDir, "transcripts", "lecture.txt")]);
    expect(result.detection.files.document).toEqual([join(tmpDir, "transcripts", "lecture.txt")]);
    expect(result.detection.files.video).toEqual([video]);
    expect(result.prompt).toContain("transformers");
  });

  it("forces retranscription for incremental video changes", async () => {
    const video = join(tmpDir, "clip.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "clip.txt"), "stale transcript");
    mockModelDownload();

    const baseDetection = {
      files: { code: [], document: [], paper: [], image: [], video: [video] },
      total_files: 1,
      total_words: 0,
      needs_graph: true,
      warning: null,
      skipped_sensitive: [],
      graphifyignore_patterns: 0,
      incremental: true,
      new_files: { code: [], document: [], paper: [], image: [], video: [video] },
      unchanged_files: { code: [], document: [], paper: [], image: [], video: [] },
      new_total: 1,
      deleted_files: [],
    };

    const result = await augmentDetectionWithTranscripts(baseDetection, {
      outputDir: outDir,
      incremental: true,
    });

    expect(readFileSync(result.transcriptPaths[0]!, "utf-8")).toBe("decoded speech");
    expect(result.detection.new_files?.document).toEqual([join(outDir, "clip.txt")]);
  });
});
