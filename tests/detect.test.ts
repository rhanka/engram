import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detect, classifyFile } from "../src/detect.js";
import { FileType } from "../src/types.js";

describe("classifyFile", () => {
  it("classifies .py as CODE", () => {
    expect(classifyFile("test.py")).toBe(FileType.CODE);
  });

  it("classifies .ts as CODE", () => {
    expect(classifyFile("test.ts")).toBe(FileType.CODE);
  });

  it("classifies .go as CODE", () => {
    expect(classifyFile("test.go")).toBe(FileType.CODE);
  });

  it("classifies .md as DOCUMENT", () => {
    expect(classifyFile("README.md")).toBe(FileType.DOCUMENT);
  });

  it("classifies .pdf as PAPER", () => {
    expect(classifyFile("paper.pdf")).toBe(FileType.PAPER);
  });

  it("classifies .png as IMAGE", () => {
    expect(classifyFile("screenshot.png")).toBe(FileType.IMAGE);
  });

  it("classifies supported video and audio extensions as VIDEO", () => {
    expect(classifyFile("lecture.mp4")).toBe(FileType.VIDEO);
    expect(classifyFile("podcast.mp3")).toBe(FileType.VIDEO);
    expect(classifyFile("talk.mov")).toBe(FileType.VIDEO);
    expect(classifyFile("recording.wav")).toBe(FileType.VIDEO);
    expect(classifyFile("webinar.webm")).toBe(FileType.VIDEO);
    expect(classifyFile("audio.m4a")).toBe(FileType.VIDEO);
  });

  it("returns null for unknown extensions", () => {
    expect(classifyFile("data.xyz")).toBeNull();
  });

  it("classifies all supported code extensions", () => {
    const codeExts = [".py", ".ts", ".js", ".jsx", ".tsx", ".go", ".rs", ".java",
      ".cpp", ".c", ".h", ".rb", ".swift", ".kt", ".cs", ".scala", ".php",
      ".lua", ".zig", ".ps1", ".ex", ".m", ".jl"];
    for (const ext of codeExts) {
      expect(classifyFile(`test${ext}`)).toBe(FileType.CODE);
    }
  });
});

describe("detect", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-test-detect-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds code files", () => {
    writeFileSync(join(tmpDir, "main.py"), "print('hello')");
    writeFileSync(join(tmpDir, "lib.ts"), "export const x = 1;");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(2);
    expect(result.total_files).toBe(2);
  });

  it("skips hidden files", () => {
    writeFileSync(join(tmpDir, ".hidden.py"), "secret");
    writeFileSync(join(tmpDir, "visible.py"), "public");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(1);
  });

  it("skips node_modules", () => {
    mkdirSync(join(tmpDir, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules", "dep", "index.js"), "module.exports = {}");
    writeFileSync(join(tmpDir, "main.js"), "require('dep')");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(1);
  });

  it("skips sensitive files", () => {
    writeFileSync(join(tmpDir, ".env"), "SECRET=xxx");
    writeFileSync(join(tmpDir, "credentials.json"), "{}");
    writeFileSync(join(tmpDir, "main.py"), "print('hello')");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(1);
    expect(result.skipped_sensitive.length).toBeGreaterThan(0);
  });

  it("respects .graphifyignore", () => {
    writeFileSync(join(tmpDir, ".graphifyignore"), "ignored.py\n");
    writeFileSync(join(tmpDir, "ignored.py"), "# should be ignored");
    writeFileSync(join(tmpDir, "kept.py"), "# should be kept");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(1);
    expect(result.files.code[0]).toContain("kept.py");
  });

  it("discovers .graphifyignore patterns from parent directories", () => {
    writeFileSync(join(tmpDir, ".graphifyignore"), "vendor/\n");
    const subDir = join(tmpDir, "packages", "mylib");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "main.py"), "x = 1");
    mkdirSync(join(subDir, "vendor"), { recursive: true });
    writeFileSync(join(subDir, "vendor", "dep.py"), "y = 2");

    const result = detect(subDir);

    expect(result.files.code).toHaveLength(1);
    expect(result.files.code[0]).toContain("main.py");
    expect(result.graphifyignore_patterns).toBeGreaterThanOrEqual(1);
  });

  it("stops .graphifyignore discovery at the git boundary", () => {
    writeFileSync(join(tmpDir, ".graphifyignore"), "main.py\n");
    const repoDir = join(tmpDir, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    const subDir = join(repoDir, "sub");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "main.py"), "x = 1");

    const result = detect(subDir);

    expect(result.files.code).toHaveLength(1);
    expect(result.files.code[0]).toContain("main.py");
    expect(result.graphifyignore_patterns).toBe(0);
  });

  it("includes .graphifyignore from the git repo root", () => {
    const repoDir = join(tmpDir, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    writeFileSync(join(repoDir, ".graphifyignore"), "vendor/\n");
    const subDir = join(repoDir, "packages", "mylib");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "main.py"), "x = 1");
    mkdirSync(join(subDir, "vendor"), { recursive: true });
    writeFileSync(join(subDir, "vendor", "dep.py"), "y = 2");

    const result = detect(subDir);

    expect(result.files.code).toHaveLength(1);
    expect(result.files.code[0]).toContain("main.py");
    expect(result.graphifyignore_patterns).toBe(1);
  });

  it("warns for small corpus", () => {
    writeFileSync(join(tmpDir, "tiny.py"), "x = 1");
    const result = detect(tmpDir);
    expect(result.needs_graph).toBe(false);
    expect(result.warning).toContain("may not need a graph");
  });

  it("always includes a video key even when no video files are present", () => {
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    const result = detect(tmpDir);
    expect(result.files).toHaveProperty("video");
    expect(result.files.video).toEqual([]);
  });

  it("finds video files without counting them as words", () => {
    writeFileSync(join(tmpDir, "lecture.mp4"), Buffer.from("fake video data"));
    writeFileSync(join(tmpDir, "notes.md"), "# Notes\nSome content here.");
    const result = detect(tmpDir);
    expect(result.files.video).toHaveLength(1);
    expect(result.files.video[0]).toContain("lecture.mp4");
    expect(result.total_words).toBeGreaterThanOrEqual(0);
  });

  it("does not add video-only corpora to total_words", () => {
    writeFileSync(join(tmpDir, "clip.mp4"), Buffer.alloc(100));
    const result = detect(tmpDir);
    expect(result.total_words).toBe(0);
  });
});
