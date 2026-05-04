import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  makeDetectionPortable,
  makeExtractionPortable,
  scanPortableGraphifyArtifacts,
} from "../src/portable-artifacts.js";
import type { DetectionResult, Extraction } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-portable-"));
  tempDirs.push(dir);
  return dir;
}

describe("portable graphify artifacts", () => {
  it("normalizes extraction source files to repo-relative paths", () => {
    const root = tempProject();
    const extraction: Extraction = {
      nodes: [
        { id: "a", label: "A", file_type: "code", source_file: join(root, "src", "a.ts") },
      ],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "uses",
          confidence: "EXTRACTED",
          source_file: join(root, "src", "a.ts"),
        },
      ],
      hyperedges: [
        {
          id: "h",
          label: "H",
          nodes: ["a", "b"],
          relation: "groups",
          confidence: "INFERRED",
          source_file: join(root, "docs", "h.md"),
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };

    const portable = makeExtractionPortable(extraction, root);

    expect(portable.nodes[0]?.source_file).toBe("src/a.ts");
    expect(portable.edges[0]?.source_file).toBe("src/a.ts");
    expect(portable.hyperedges?.[0]?.source_file).toBe("docs/h.md");
    expect(JSON.stringify(portable)).not.toContain(root);
  });

  it("normalizes relative Windows-style source_file separators", () => {
    const root = tempProject();
    const extraction: Extraction = {
      nodes: [
        { id: "a", label: "A", file_type: "code", source_file: "src\\nested\\a.ts" },
      ],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "uses",
          confidence: "EXTRACTED",
          source_file: "src\\nested\\a.ts",
        },
      ],
      hyperedges: [],
      input_tokens: 0,
      output_tokens: 0,
    };

    const portable = makeExtractionPortable(extraction, root);

    expect(portable.nodes[0]?.source_file).toBe("src/nested/a.ts");
    expect(portable.edges[0]?.source_file).toBe("src/nested/a.ts");
  });

  it("normalizes detection file lists to repo-relative paths", () => {
    const root = tempProject();
    const detection: DetectionResult = {
      files: {
        code: [join(root, "src", "a.ts")],
        documents: [join(root, "docs", "readme.md")],
      },
      total_files: 2,
      total_words: 10,
      needs_graph: true,
      warning: null,
      skipped_sensitive: [join(root, ".env")],
      graphifyignore_patterns: 0,
      scope: {
        requested_mode: "auto",
        resolved_mode: "committed",
        source: "cli",
        root,
        git_root: root,
        head: "abc123",
        candidate_count: 2,
        included_count: 2,
        excluded_untracked_count: 0,
        excluded_ignored_count: 0,
        excluded_sensitive_count: 0,
        missing_committed_count: 0,
        warnings: [],
        recommendation: null,
      },
    };

    const portable = makeDetectionPortable(detection, root);

    expect(portable.files.code).toEqual(["src/a.ts"]);
    expect(portable.files.documents).toEqual(["docs/readme.md"]);
    expect(portable.skipped_sensitive).toEqual([".env"]);
    expect(portable.scope?.root).toBe(".");
    expect(portable.scope?.git_root).toBe(".");
    expect(JSON.stringify(portable)).not.toContain(root);
  });

  it("fails when commit-safe artifacts contain absolute paths", () => {
    const root = tempProject();
    const graphifyDir = join(root, ".graphify");
    mkdirSync(graphifyDir, { recursive: true });
    writeFileSync(
      join(graphifyDir, "graph.json"),
      JSON.stringify({
        nodes: [{ id: "a", label: "A", source_file: join(root, "src", "a.ts") }],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const result = scanPortableGraphifyArtifacts(graphifyDir);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "graph.json", kind: "absolute_path" }),
      ]),
    );
  });

  it("ignores local lifecycle metadata with absolute worktree paths", () => {
    const root = tempProject();
    const graphifyDir = join(root, ".graphify");
    mkdirSync(graphifyDir, { recursive: true });
    writeFileSync(join(graphifyDir, "graph.json"), JSON.stringify({ nodes: [], links: [] }), "utf-8");
    writeFileSync(
      join(graphifyDir, "branch.json"),
      JSON.stringify({ branch: "feature", worktreePath: root }, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(graphifyDir, "worktree.json"),
      JSON.stringify({ gitDir: join(root, ".git") }, null, 2),
      "utf-8",
    );

    const result = scanPortableGraphifyArtifacts(graphifyDir);

    expect(result.ok).toBe(true);
    expect(result.ignoredLocalFiles).toEqual(["branch.json", "worktree.json"]);
  });

  it("fails when commit-safe artifacts escape the repository root", () => {
    const root = tempProject();
    const graphifyDir = join(root, ".graphify");
    mkdirSync(graphifyDir, { recursive: true });
    writeFileSync(
      join(graphifyDir, "GRAPH_REPORT.md"),
      "Source file: ../outside/secrets.md\n",
      "utf-8",
    );

    const result = scanPortableGraphifyArtifacts(graphifyDir);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "GRAPH_REPORT.md", kind: "escaped_root_path" }),
      ]),
    );
  });
});
