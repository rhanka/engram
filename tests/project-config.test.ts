import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  discoverProjectConfig,
  loadProjectConfig,
  normalizeProjectConfig,
  parseProjectConfig,
  validateProjectConfig,
} from "../src/project-config.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-project-config-"));
  cleanupDirs.push(dir);
  return dir;
}

function write(path: string, content: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("project config loader", () => {
  it("discovers supported config names in documented order", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".graphify"), { recursive: true });
    writeFileSync(join(root, ".graphify", "config.yml"), "version: 1\n", "utf-8");
    writeFileSync(join(root, ".graphify", "config.yaml"), "version: 1\n", "utf-8");
    writeFileSync(join(root, "graphify.yml"), "version: 1\n", "utf-8");
    writeFileSync(join(root, "graphify.yaml"), "version: 1\n", "utf-8");

    const result = discoverProjectConfig(root);

    expect(result.found).toBe(true);
    expect(result.path).toBe(join(root, "graphify.yaml"));
    expect(result.searched).toEqual([
      join(root, "graphify.yaml"),
      join(root, "graphify.yml"),
      join(root, ".graphify", "config.yaml"),
      join(root, ".graphify", "config.yml"),
    ]);
  });

  it("returns a miss with searched paths when no config exists", () => {
    const root = makeTempDir();

    const result = discoverProjectConfig(root);

    expect(result).toMatchObject({ found: false, path: null });
    expect(result.searched.every((item) => item.startsWith(root))).toBe(true);
  });

  it("loads YAML config and resolves paths relative to the config file", () => {
    const root = makeTempDir();
    const configDir = join(root, "settings");
    const configPath = join(configDir, "graphify.yaml");
    write(
      configPath,
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus:",
        "    - ../raw/manuals",
        "  registries:",
        "    - ../references/components.csv",
        "  generated:",
        "    - ../derived/ocr",
        "  exclude:",
        "    - ../tmp",
        "dataprep:",
        "  pdf_ocr: dry-run",
        "  full_page_screenshot_vision: false",
        "outputs:",
        "  state_dir: ../.graphify",
        "  write_wiki: true",
        "",
      ].join("\n"),
    );

    const loaded = loadProjectConfig(configPath);

    expect(loaded.sourcePath).toBe(configPath);
    expect(loaded.configDir).toBe(configDir);
    expect(loaded.profile.resolvedPath).toBe(join(configDir, "graphify", "ontology-profile.yaml"));
    expect(loaded.inputs.corpus).toEqual([join(root, "raw", "manuals")]);
    expect(loaded.inputs.registries).toEqual([join(root, "references", "components.csv")]);
    expect(loaded.inputs.registrySources).toMatchObject({
      components: join(root, "references", "components.csv"),
    });
    expect(loaded.inputs.generated).toEqual([join(root, "derived", "ocr")]);
    expect(loaded.inputs.exclude).toEqual([join(root, "tmp")]);
    expect(loaded.dataprep.pdf_ocr).toBe("dry-run");
    expect(loaded.dataprep.prefer_ocr_markdown).toBe(true);
    expect(loaded.dataprep.use_extracted_pdf_images).toBe(true);
    expect(loaded.dataprep.full_page_screenshot_vision).toBe(false);
    expect(loaded.dataprep.citation_minimum).toBe("page");
    expect(loaded.outputs.state_dir).toBe(join(root, ".graphify"));
    expect(loaded.outputs.write_html).toBe(true);
    expect(loaded.outputs.write_wiki).toBe(true);
    expect(loaded.outputs.write_profile_report).toBe(true);
  });

  it("loads JSON config and applies defaults", () => {
    const root = makeTempDir();
    const configPath = join(root, "graphify.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        profile: { path: "graphify/profile.json" },
        inputs: { corpus: ["raw"], registries: [], generated: [], exclude: [] },
      }),
      "utf-8",
    );

    const loaded = loadProjectConfig(configPath);

    expect(loaded.profile.resolvedPath).toBe(join(root, "graphify", "profile.json"));
    expect(loaded.inputs.corpus).toEqual([join(root, "raw")]);
    expect(loaded.dataprep.pdf_ocr).toBe("auto");
    expect(loaded.outputs.state_dir).toBe(join(root, ".graphify"));
    expect(loaded.outputs.write_html).toBe(true);
    expect(loaded.outputs.write_wiki).toBe(false);
    expect(loaded.outputs.write_profile_report).toBe(true);
  });

  it("validates required config fields", () => {
    const raw = parseProjectConfig("version: 1\ninputs:\n  corpus: []\n", "graphify.yaml");
    const errors = validateProjectConfig(raw);

    expect(errors).toContain("profile.path is required");
    expect(errors).toContain("inputs.corpus must contain at least one path");
  });

  it("normalizes an already parsed object without reading files", () => {
    const root = makeTempDir();
    const configPath = join(root, "graphify.yaml");
    const normalized = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: { corpus: ["raw"], registries: ["references/components.csv"] },
      },
      configPath,
    );

    expect(normalized.profile.resolvedPath).toBe(join(root, "graphify", "ontology-profile.yaml"));
    expect(normalized.inputs.registrySources.components).toBe(join(root, "references", "components.csv"));
    expect(existsSync(normalized.outputs.state_dir)).toBe(false);
  });
});
