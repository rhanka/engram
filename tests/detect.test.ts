import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detect, classifyFile, detectIncremental, saveManifest } from "../src/detect.js";
import { inspectInputScope } from "../src/input-scope.js";
import { execGit } from "../src/git.js";
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

  it("classifies .sql as CODE", () => {
    expect(classifyFile("schema.sql")).toBe(FileType.CODE);
  });

  it("classifies .r as CODE", () => {
    expect(classifyFile("analysis.R")).toBe(FileType.CODE);
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
      ".lua", ".zig", ".ps1", ".ex", ".m", ".jl", ".vue", ".svelte", ".dart",
      ".v", ".sv", ".mjs", ".ejs"];
    for (const ext of codeExts) {
      expect(classifyFile(`test${ext}`)).toBe(FileType.CODE);
    }
  });

  it("classifies Blade templates as CODE", () => {
    expect(classifyFile("resources/views/welcome.blade.php")).toBe(FileType.CODE);
  });

  it("classifies MDX and HTML as DOCUMENT", () => {
    expect(classifyFile("docs/page.mdx")).toBe(FileType.DOCUMENT);
    expect(classifyFile("docs/page.html")).toBe(FileType.DOCUMENT);
  });

  it("classifies YAML files as DOCUMENT", () => {
    expect(classifyFile("k8s/deployment.yaml")).toBe(FileType.DOCUMENT);
    expect(classifyFile("k8s/service.yml")).toBe(FileType.DOCUMENT);
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

  it("skips current and legacy graphify state directories", () => {
    mkdirSync(join(tmpDir, ".graphify"), { recursive: true });
    mkdirSync(join(tmpDir, "graphify-out"), { recursive: true });
    writeFileSync(join(tmpDir, ".graphify", "generated.ts"), "export const hidden = true;");
    writeFileSync(join(tmpDir, "graphify-out", "generated.ts"), "export const legacy = true;");
    writeFileSync(join(tmpDir, "main.ts"), "export const kept = true;");

    const result = detect(tmpDir);

    expect(result.files.code).toEqual([join(tmpDir, "main.ts")]);
  });

  it("skips sensitive files", () => {
    writeFileSync(join(tmpDir, ".env"), "SECRET=xxx");
    writeFileSync(join(tmpDir, "credentials.json"), "{}");
    writeFileSync(join(tmpDir, "main.py"), "print('hello')");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(1);
    expect(result.skipped_sensitive.length).toBeGreaterThan(0);
  });

  it("does not flag ordinary files under directories named like secrets", () => {
    mkdirSync(join(tmpDir, "token-service"), { recursive: true });
    writeFileSync(join(tmpDir, "token-service", "README.md"), "# public docs\n");

    const result = detect(tmpDir);

    expect(result.files.document).toContain(join(tmpDir, "token-service", "README.md"));
    expect(result.skipped_sensitive).toEqual([]);
  });

  it("respects .graphifyignore", () => {
    writeFileSync(join(tmpDir, ".graphifyignore"), "ignored.py\n");
    writeFileSync(join(tmpDir, "ignored.py"), "# should be ignored");
    writeFileSync(join(tmpDir, "kept.py"), "# should be kept");
    const result = detect(tmpDir);
    expect(result.files.code).toHaveLength(1);
    expect(result.files.code[0]).toContain("kept.py");
  });

  it("does not treat inline hashes as .graphifyignore comments", () => {
    writeFileSync(join(tmpDir, ".graphifyignore"), "ignored.py # comment\n");
    writeFileSync(join(tmpDir, "ignored.py"), "# should be ignored");
    writeFileSync(join(tmpDir, "kept.py"), "# should be kept");

    const result = detect(tmpDir);

    expect(result.files.code).toEqual(expect.arrayContaining([
      join(tmpDir, "ignored.py"),
      join(tmpDir, "kept.py"),
    ]));
    expect(result.graphifyignore_patterns).toBe(1);
  });

  it("does not inherit parent .graphifyignore rules outside a repo", () => {
    writeFileSync(join(tmpDir, ".graphifyignore"), "vendor/\n");
    const subDir = join(tmpDir, "packages", "mylib");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "main.py"), "x = 1");
    mkdirSync(join(subDir, "vendor"), { recursive: true });
    writeFileSync(join(subDir, "vendor", "dep.py"), "y = 2");
    const previousHome = process.env.HOME;

    try {
      process.env.HOME = tmpDir;
      const result = detect(subDir);

      expect(result.files.code).toHaveLength(2);
      expect(result.files.code).toEqual(expect.arrayContaining([
        join(subDir, "main.py"),
        join(subDir, "vendor", "dep.py"),
      ]));
      expect(result.graphifyignore_patterns).toBe(0);
    } finally {
      process.env.HOME = previousHome;
    }
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

  it("includes .graphifyignore from ancestor directories inside a repo", () => {
    const repoDir = join(tmpDir, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    const packagesDir = join(repoDir, "packages");
    mkdirSync(packagesDir, { recursive: true });
    writeFileSync(join(packagesDir, ".graphifyignore"), "vendor/\n");
    const subDir = join(packagesDir, "mylib");
    mkdirSync(join(subDir, "vendor"), { recursive: true });
    writeFileSync(join(subDir, "main.py"), "x = 1");
    writeFileSync(join(subDir, "vendor", "dep.py"), "y = 2");

    const result = detect(subDir);

    expect(result.files.code).toEqual([join(subDir, "main.py")]);
    expect(result.graphifyignore_patterns).toBe(1);
  });

  it("treats anchored .graphifyignore patterns as relative to the ignore file directory", () => {
    const repoDir = join(tmpDir, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    const subDir = join(repoDir, "app");
    mkdirSync(join(subDir, "nested"), { recursive: true });
    writeFileSync(join(subDir, ".graphifyignore"), "/generated.py\n");
    writeFileSync(join(subDir, "generated.py"), "x = 1");
    writeFileSync(join(subDir, "nested", "generated.py"), "y = 2");

    const result = detect(subDir);

    expect(result.files.code).toEqual([join(subDir, "nested", "generated.py")]);
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

  it("detects extensionless shebang scripts as code", () => {
    writeFileSync(join(tmpDir, "deploy"), "#!/usr/bin/env bash\necho deploy\n", "utf-8");

    const result = detect(tmpDir);

    expect(result.files.code).toEqual([join(tmpDir, "deploy")]);
  });

  it("filters explicit scope inventory through detect and preserves scope diagnostics", () => {
    execGit(tmpDir, ["init", "-q"]);
    execGit(tmpDir, ["config", "user.email", "graphify@example.test"]);
    execGit(tmpDir, ["config", "user.name", "Graphify Test"]);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "main.ts"), "export const main = true;\n");
    writeFileSync(join(tmpDir, "src", "staged.ts"), "export const staged = true;\n");
    writeFileSync(join(tmpDir, "notes.md"), "# untracked\n");
    execGit(tmpDir, ["add", "src/main.ts"]);
    execGit(tmpDir, ["commit", "-q", "-m", "init"]);
    execGit(tmpDir, ["add", "src/staged.ts"]);

    const inventory = inspectInputScope(tmpDir, { mode: "tracked", source: "cli" });
    const result = detect(tmpDir, {
      candidateFiles: inventory.candidateFiles,
      candidateRoot: inventory.scope.git_root ?? tmpDir,
      scope: inventory.scope,
    });

    expect(result.files.code).toEqual([
      join(tmpDir, "src", "main.ts"),
      join(tmpDir, "src", "staged.ts"),
    ]);
    expect(result.files.document).toEqual([]);
    expect(result.scope).toMatchObject({
      requested_mode: "tracked",
      resolved_mode: "tracked",
      included_count: 2,
      excluded_untracked_count: 1,
      excluded_sensitive_count: 0,
    });
  });

  it("treats mtime-only file touches as unchanged during incremental detection", () => {
    const filePath = join(tmpDir, "main.py");
    const manifestPath = join(tmpDir, ".graphify", "manifest.json");
    writeFileSync(filePath, "print('hello')\n");

    const initial = detect(tmpDir);
    saveManifest(initial.files, manifestPath);

    writeFileSync(filePath, "print('hello')\n");
    const bumped = new Date(Date.now() + 5_000);
    utimesSync(filePath, bumped, bumped);

    const result = detectIncremental(tmpDir, manifestPath);

    expect(result.new_total).toBe(0);
    expect(result.new_files?.code).toEqual([]);
    expect(result.unchanged_files?.code).toEqual([filePath]);
  });

  it("writes manifest entries with mtime and content hash", () => {
    const filePath = join(tmpDir, "main.py");
    const manifestPath = join(tmpDir, ".graphify", "manifest.json");
    writeFileSync(filePath, "print('hello')\n");

    const initial = detect(tmpDir);
    saveManifest(initial.files, manifestPath);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, {
      mtime?: number;
      hash?: string;
    }>;

    expect(manifest[filePath]?.mtime).toBeTypeOf("number");
    expect(manifest[filePath]?.hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("keeps legacy numeric manifests compatible during incremental detection", () => {
    const filePath = join(tmpDir, "main.py");
    const manifestPath = join(tmpDir, ".graphify", "manifest.json");
    writeFileSync(filePath, "print('hello')\n");
    const previousMtime = statSync(filePath).mtimeMs;
    mkdirSync(join(tmpDir, ".graphify"), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({ [filePath]: previousMtime }), "utf-8");

    writeFileSync(filePath, "print('updated')\n");
    const bumped = new Date(Date.now() + 5_000);
    utimesSync(filePath, bumped, bumped);

    const result = detectIncremental(tmpDir, manifestPath);

    expect(result.new_total).toBe(1);
    expect(result.new_files?.code).toEqual([filePath]);
  });
});
