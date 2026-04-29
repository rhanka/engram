import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/transcribe.js", () => ({
  downloadAudio: vi.fn(),
}));

import { ingest } from "../src/ingest.js";
import { downloadAudio } from "../src/transcribe.js";

const cleanupDirs: string[] = [];
const downloadAudioMock = vi.mocked(downloadAudio);

describe("ingest", () => {
  afterEach(() => {
    downloadAudioMock.mockReset();
    while (cleanupDirs.length > 0) {
      rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("downloads youtube URLs as audio files instead of saving markdown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-ingest-"));
    cleanupDirs.push(dir);
    const expected = join(dir, "yt_audio.m4a");

    downloadAudioMock.mockImplementation(async (url, outputDir) => {
      expect(url).toBe("https://www.youtube.com/watch?v=abc");
      expect(outputDir).toBe(dir);
      writeFileSync(expected, "audio");
      return expected;
    });

    const out = await ingest("https://www.youtube.com/watch?v=abc", dir);

    expect(out).toBe(expected);
    expect(downloadAudioMock).toHaveBeenCalledOnce();
  });
});
