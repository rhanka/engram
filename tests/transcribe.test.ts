import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { augmentDetectionWithTranscripts, buildWhisperPrompt, downloadAudio, isUrl, transcribe, transcribeAll } from "../src/transcribe.js";

const tempDirs: string[] = [];
const spawnSyncMock = vi.mocked(spawnSync);

describe("transcribe helpers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-transcribe-"));
    tempDirs.push(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    spawnSyncMock.mockReset();
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
    delete process.env.GRAPHIFY_WHISPER_PROMPT;
    delete process.env.GRAPHIFY_WHISPER_MODEL;
  });

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
    spawnSyncMock.mockImplementation((_cmd, _args, _options) => {
      writeFileSync(join(tmpDir, `yt_${hash}.m4a`), "audio");
      return { status: 0, stdout: "", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

    const result = downloadAudio(url, tmpDir);

    expect(result).toBe(join(tmpDir, `yt_${hash}.m4a`));
  });

  it("returns a cached transcript without rerunning Whisper", () => {
    const video = join(tmpDir, "lecture.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "lecture.txt"), "cached transcript");

    const result = transcribe(video, outDir);

    expect(result).toBe(join(outDir, "lecture.txt"));
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("force reruns Whisper and writes the transcript output", () => {
    const video = join(tmpDir, "talk.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "talk.txt"), "old transcript");

    spawnSyncMock.mockImplementation((_cmd, args, _options) => {
      const transcriptPath = String(args?.[3]);
      writeFileSync(transcriptPath, "new transcript");
      return { status: 0, stdout: "en|1", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

    const result = transcribe(video, outDir, "Custom prompt", true);

    expect(result).toBe(join(outDir, "talk.txt"));
    expect(readFileSync(result, "utf-8")).toBe("new transcript");
  });

  it("propagates a clear error when faster-whisper is unavailable", () => {
    const video = join(tmpDir, "clip.mp4");
    writeFileSync(video, "audio");
    spawnSyncMock.mockImplementation(() => {
      return {
        status: 1,
        stdout: "",
        stderr: "ModuleNotFoundError: No module named 'faster_whisper'",
        output: [],
      } as ReturnType<typeof spawnSync>;
    });

    expect(() => transcribe(video, join(tmpDir, "out"), undefined, true)).toThrow(/faster-whisper/i);
  });

  it("transcribeAll returns an empty list for empty input", () => {
    expect(transcribeAll([])).toEqual([]);
  });

  it("transcribeAll skips failed files and keeps successful ones", () => {
    const videoA = join(tmpDir, "a.mp4");
    const videoB = join(tmpDir, "b.mp4");
    writeFileSync(videoA, "a");
    writeFileSync(videoB, "b");

    spawnSyncMock.mockImplementation((_cmd, args, _options) => {
      const audioPath = String(args?.[2]);
      const transcriptPath = String(args?.[3]);
      if (audioPath.endsWith("b.mp4")) {
        return { status: 1, stdout: "", stderr: "boom", output: [] } as ReturnType<typeof spawnSync>;
      }
      writeFileSync(transcriptPath, "ok");
      return { status: 0, stdout: "en|1", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

    const results = transcribeAll([videoA, videoB], join(tmpDir, "out"), "Prompt");

    expect(results).toEqual([join(tmpDir, "out", "a.txt")]);
    expect(existsSync(join(tmpDir, "out", "a.txt"))).toBe(true);
    expect(existsSync(join(tmpDir, "out", "b.txt"))).toBe(false);
  });

  it("augments detection files with transcript paths for semantic extraction", () => {
    const video = join(tmpDir, "lecture.mp4");
    writeFileSync(video, "audio");
    spawnSyncMock.mockImplementation((_cmd, args, _options) => {
      const transcriptPath = String(args?.[3]);
      writeFileSync(transcriptPath, "lecture transcript");
      return { status: 0, stdout: "en|1", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

    const baseDetection = {
      files: { code: [], document: [], paper: [], image: [], video: [video] },
      total_files: 1,
      total_words: 0,
      needs_graph: true,
      warning: null,
      skipped_sensitive: [],
      graphifyignore_patterns: 0,
    };

    const result = augmentDetectionWithTranscripts(baseDetection, {
      outputDir: join(tmpDir, "transcripts"),
      godNodes: [{ label: "transformers" }],
    });

    expect(result.transcriptPaths).toEqual([join(tmpDir, "transcripts", "lecture.txt")]);
    expect(result.detection.files.document).toEqual([join(tmpDir, "transcripts", "lecture.txt")]);
    expect(result.detection.files.video).toEqual([video]);
    expect(result.prompt).toContain("transformers");
  });

  it("forces retranscription for incremental video changes", () => {
    const video = join(tmpDir, "clip.mp4");
    const outDir = join(tmpDir, "transcripts");
    writeFileSync(video, "audio");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "clip.txt"), "stale transcript");

    spawnSyncMock.mockImplementation((_cmd, args, _options) => {
      const transcriptPath = String(args?.[3]);
      writeFileSync(transcriptPath, "fresh transcript");
      return { status: 0, stdout: "en|1", stderr: "", output: [] } as ReturnType<typeof spawnSync>;
    });

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

    const result = augmentDetectionWithTranscripts(baseDetection, {
      outputDir: outDir,
      incremental: true,
    });

    expect(readFileSync(result.transcriptPaths[0]!, "utf-8")).toBe("fresh transcript");
    expect(result.detection.new_files?.document).toEqual([join(outDir, "clip.txt")]);
  });
});
