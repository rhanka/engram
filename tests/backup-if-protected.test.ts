/**
 * backupIfProtected — upstream 6939494 (#834) port.
 *
 * Snapshot graph artifacts to a dated subfolder before overwrite when the
 * graph cost real LLM tokens or has been human-curated.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backupIfProtected } from "../src/export.js";

describe("backupIfProtected (upstream 6939494 #834)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-backup-"));
    delete process.env.GRAPHIFY_NO_BACKUP;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.GRAPHIFY_NO_BACKUP;
  });

  it("returns null when no graph.json is present", () => {
    expect(backupIfProtected(tmpDir)).toBeNull();
  });

  it("returns null when graph.json exists but no sentinel and no curated labels", () => {
    writeFileSync(join(tmpDir, "graph.json"), '{"nodes":[],"edges":[]}');
    expect(backupIfProtected(tmpDir)).toBeNull();
  });

  it("creates a dated backup folder when .graphify_semantic_marker is present", () => {
    writeFileSync(join(tmpDir, "graph.json"), '{"nodes":[],"edges":[]}');
    writeFileSync(join(tmpDir, "GRAPH_REPORT.md"), "# Report");
    writeFileSync(join(tmpDir, ".graphify_semantic_marker"), '{"output_tokens":1234}');
    const backup = backupIfProtected(tmpDir);
    expect(backup).not.toBeNull();
    expect(existsSync(backup!)).toBe(true);
    expect(existsSync(join(backup!, "graph.json"))).toBe(true);
    expect(existsSync(join(backup!, "GRAPH_REPORT.md"))).toBe(true);
    expect(existsSync(join(backup!, ".graphify_semantic_marker"))).toBe(true);
  });

  it("creates a backup when .graphify_labels.json has at least one non-default label", () => {
    writeFileSync(join(tmpDir, "graph.json"), '{"nodes":[],"edges":[]}');
    writeFileSync(
      join(tmpDir, ".graphify_labels.json"),
      JSON.stringify({ "0": "Auth Pipeline", "1": "Community 1" }),
    );
    const backup = backupIfProtected(tmpDir);
    expect(backup).not.toBeNull();
  });

  it("does not back up when all labels are the default 'Community N'", () => {
    writeFileSync(join(tmpDir, "graph.json"), '{"nodes":[],"edges":[]}');
    writeFileSync(
      join(tmpDir, ".graphify_labels.json"),
      JSON.stringify({ "0": "Community 0", "1": "Community 1" }),
    );
    expect(backupIfProtected(tmpDir)).toBeNull();
  });

  it("uses a _2 suffix on the second backup taken the same day", () => {
    writeFileSync(join(tmpDir, "graph.json"), '{"nodes":[],"edges":[]}');
    writeFileSync(join(tmpDir, ".graphify_semantic_marker"), "{}");
    const b1 = backupIfProtected(tmpDir);
    const b2 = backupIfProtected(tmpDir);
    expect(b1).not.toBeNull();
    expect(b2).not.toBeNull();
    expect(b1).not.toBe(b2);
    expect(b2!.endsWith("_2")).toBe(true);
  });

  it("is disabled by the GRAPHIFY_NO_BACKUP env var", () => {
    process.env.GRAPHIFY_NO_BACKUP = "1";
    writeFileSync(join(tmpDir, "graph.json"), '{"nodes":[],"edges":[]}');
    writeFileSync(join(tmpDir, ".graphify_semantic_marker"), "{}");
    expect(backupIfProtected(tmpDir)).toBeNull();
  });
});
