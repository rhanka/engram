import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("escapes URL ingest frontmatter scalars against YAML injection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-ingest-frontmatter-"));
    cleanupDirs.push(dir);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        "<html><head><title>Injected\r\nspoof_key: yes</title></head><body>Hello</body></html>",
        { status: 200 },
      )
    ));

    const out = await ingest("https://example.test/page", dir, {
      contributor: "Eve\u2028google_file_id: injected",
    });
    const rendered = readFileSync(out, "utf-8");
    const frontmatter = rendered.split("---\n")[1] ?? "";

    expect(rendered.includes("\r")).toBe(false);
    expect(rendered.includes("\u2028")).toBe(false);
    expect(frontmatter.match(/^source_url:/gmu)?.length ?? 0).toBe(1);
    expect(frontmatter.match(/^contributor:/gmu)?.length ?? 0).toBe(1);
    expect(frontmatter.match(/^spoof_key:/gmu)?.length ?? 0).toBe(0);
    expect(frontmatter.match(/^google_file_id:/gmu)?.length ?? 0).toBe(0);
  });
});
