import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WORKSPACE_BUNDLE_CONTRACT,
  WORKSPACE_MANIFEST_FILENAME,
  WORKSPACE_MANIFEST_SCHEMA,
  WORKSPACE_MANIFEST_SCHEMA_VERSION,
  buildWorkspaceManifest,
} from "../src/workspace-manifest.js";
import { emitWorkspaceManifest } from "../src/workspace-manifest-emitter.js";
import {
  scanPortableGraphifyArtifacts,
} from "../src/portable-artifacts.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ws-manifest-"));
  tempDirs.push(dir);
  return dir;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildWorkspaceManifest — pure builder (graphify_workspace_manifest_v1)", () => {
  it("stamps the schema id, numeric schema_version, and signed contract", () => {
    const manifest = buildWorkspaceManifest({
      artifacts: [],
      generatedAt: "2026-06-14T00:00:00.000Z",
    });
    expect(manifest.schema).toBe(WORKSPACE_MANIFEST_SCHEMA);
    expect(manifest.schema).toBe("graphify_workspace_manifest_v1");
    expect(manifest.schema_version).toBe(WORKSPACE_MANIFEST_SCHEMA_VERSION);
    expect(manifest.schema_version).toBe(1);
    expect(manifest.contract).toBe(WORKSPACE_BUNDLE_CONTRACT);
    expect(manifest.contract).toBe("workspace-bundle-contract-v1");
    expect(manifest.generated_at).toBe("2026-06-14T00:00:00.000Z");
    expect(manifest.graph_hash).toBeNull();
    expect(manifest.present_count).toBe(0);
    expect(manifest.artifacts).toEqual([]);
  });

  it("records present:true with sha256 + size for supplied bytes", () => {
    const body = '{"x":1}';
    const manifest = buildWorkspaceManifest({
      artifacts: [{ name: "scene", path: "scene.json", schema: null, bytes: body }],
      generatedAt: "t",
    });
    expect(manifest.artifacts).toHaveLength(1);
    const a = manifest.artifacts[0]!;
    expect(a).toMatchObject({
      name: "scene",
      path: "scene.json",
      schema: null,
      present: true,
      sha256: sha256(body),
      size_bytes: Buffer.byteLength(body, "utf-8"),
    });
    expect(manifest.present_count).toBe(1);
  });

  it("records present:false (NOT dropped) for null/undefined bytes", () => {
    const manifest = buildWorkspaceManifest({
      artifacts: [
        { name: "scene", path: "scene.json", schema: null, bytes: null },
        { name: "hierarchies", path: "scene-hierarchies.json", schema: "s" },
      ],
      generatedAt: "t",
    });
    // Both artifacts SURVIVE in the manifest — the consumer must see them.
    expect(manifest.artifacts.map((a) => a.name)).toEqual([
      "hierarchies",
      "scene",
    ]);
    for (const a of manifest.artifacts) {
      expect(a.present).toBe(false);
      expect(a.sha256).toBeNull();
      expect(a.size_bytes).toBeNull();
    }
    expect(manifest.present_count).toBe(0);
  });

  it("sorts artifacts by logical name (stable, deterministic ordering)", () => {
    const manifest = buildWorkspaceManifest({
      artifacts: [
        { name: "scene", path: "scene.json", schema: null, bytes: "a" },
        { name: "graph", path: "graph.json", schema: null, bytes: "b" },
        { name: "entities", path: "entities.json", schema: null, bytes: "c" },
      ],
      generatedAt: "t",
    });
    expect(manifest.artifacts.map((a) => a.name)).toEqual([
      "entities",
      "graph",
      "scene",
    ]);
  });

  it("is byte-identical for identical inputs modulo generated_at", () => {
    const inputs = {
      artifacts: [
        { name: "scene", path: "scene.json", schema: null, bytes: "a" },
        { name: "graph", path: "graph.json", schema: null, bytes: "b" },
      ],
    };
    const a = buildWorkspaceManifest({ ...inputs, generatedAt: "X" });
    const b = buildWorkspaceManifest({ ...inputs, generatedAt: "X" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    // Different inputs order, same set → same serialization (modulo time).
    const c = buildWorkspaceManifest({
      artifacts: [...inputs.artifacts].reverse(),
      generatedAt: "X",
    });
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it("throws on a duplicate logical name (no silent shadowing)", () => {
    expect(() =>
      buildWorkspaceManifest({
        artifacts: [
          { name: "scene", path: "scene.json", schema: null, bytes: "a" },
          { name: "scene", path: "scene2.json", schema: null, bytes: "b" },
        ],
        generatedAt: "t",
      }),
    ).toThrow(/duplicate artifact name "scene"/);
  });

  it("stamps the supplied graph hash", () => {
    const manifest = buildWorkspaceManifest({
      artifacts: [],
      graphHash: "feedface",
      generatedAt: "t",
    });
    expect(manifest.graph_hash).toBe("feedface");
  });
});

describe("emitWorkspaceManifest — owns the I/O, hashes real bytes", () => {
  function writeBundle(dir: string, files: Record<string, string>): void {
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), body, "utf-8");
    }
  }

  it("writes workspace-manifest.json into the bundle dir", () => {
    const dir = makeTempDir();
    writeBundle(dir, {
      "scene.json": '{"nodes":[]}',
      "graph.json": '{"nodes":[],"edges":[]}',
    });
    const result = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "t" });
    expect(result.path).toBe(join(dir, WORKSPACE_MANIFEST_FILENAME));
    expect(existsSync(result.path)).toBe(true);
    const onDisk = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(onDisk).toEqual(result.manifest);
    expect(onDisk.schema).toBe("graphify_workspace_manifest_v1");
    expect(onDisk.schema_version).toBe(1);
  });

  it("hashes the REAL bytes on disk (sha256 + size correctness)", () => {
    const dir = makeTempDir();
    const sceneBody = '{"nodes":[{"id":"a"}]}';
    writeBundle(dir, { "scene.json": sceneBody });
    const { manifest } = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "t" });
    const scene = manifest.artifacts.find((a) => a.name === "scene")!;
    expect(scene.present).toBe(true);
    expect(scene.sha256).toBe(sha256(sceneBody));
    expect(scene.size_bytes).toBe(Buffer.byteLength(sceneBody, "utf-8"));
  });

  it("records present:false for absent artifacts (not silently dropped)", () => {
    const dir = makeTempDir();
    // Only the scene exists; every other bundle artifact is absent.
    writeBundle(dir, { "scene.json": "{}" });
    const { manifest } = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "t" });

    const byName = new Map(manifest.artifacts.map((a) => [a.name, a]));
    expect(byName.get("scene")!.present).toBe(true);
    for (const name of [
      "scene-hierarchies",
      "reconciliation-candidates",
      "graph",
      "entities",
    ]) {
      const entry = byName.get(name);
      expect(entry, `${name} must be reported`).toBeDefined();
      expect(entry!.present).toBe(false);
      expect(entry!.sha256).toBeNull();
      expect(entry!.size_bytes).toBeNull();
    }
  });

  it("carries the contract schema ids for the core sidecars", () => {
    const dir = makeTempDir();
    writeBundle(dir, {
      "scene-hierarchies.json": "{}",
      "reconciliation-candidates.json": "{}",
    });
    const { manifest } = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "t" });
    const byName = new Map(manifest.artifacts.map((a) => [a.name, a]));
    expect(byName.get("scene-hierarchies")!.schema).toBe(
      "graphify_scene_hierarchies_v1",
    );
    expect(byName.get("reconciliation-candidates")!.schema).toBe(
      "graphify_ontology_reconciliation_candidates_v1",
    );
  });

  it("does NOT list the manifest itself", () => {
    const dir = makeTempDir();
    writeBundle(dir, { "scene.json": "{}" });
    const { manifest } = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "t" });
    expect(
      manifest.artifacts.some((a) => a.path === WORKSPACE_MANIFEST_FILENAME),
    ).toBe(false);
  });

  it("is byte-identical across two runs over a byte-identical bundle (modulo generated_at)", () => {
    const dir = makeTempDir();
    writeBundle(dir, {
      "scene.json": '{"nodes":[]}',
      "graph.json": '{"nodes":[]}',
      "entities.json": "{}",
    });
    const first = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "FIXED" });
    const firstBytes = readFileSync(first.path, "utf-8");
    // Second run must reproduce the same file byte-for-byte (the manifest from
    // the first run is now on disk but must not be self-included).
    const second = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "FIXED" });
    const secondBytes = readFileSync(second.path, "utf-8");
    expect(secondBytes).toBe(firstBytes);
  });

  it("ignores a directory shadowing an artifact name (present:false)", () => {
    const dir = makeTempDir();
    writeBundle(dir, { "scene.json": "{}" });
    // graph.json is a directory, not a file → must be present:false, no hash.
    mkdirSync(join(dir, "graph.json"), { recursive: true });
    const { manifest } = emitWorkspaceManifest({ bundleDir: dir, generatedAt: "t" });
    const graph = manifest.artifacts.find((a) => a.name === "graph")!;
    expect(graph.present).toBe(false);
    expect(graph.sha256).toBeNull();
  });

  it("emits a portable manifest (relative paths only — passes portable-check)", () => {
    // Emit into a .graphify-shaped tree and assert the manifest carries no
    // absolute/escaping paths (contract "portable-check").
    const root = makeTempDir();
    const bundleDir = join(root, "studio");
    writeBundle(bundleDir, {
      "scene.json": "{}",
      "scene-hierarchies.json": "{}",
    });
    emitWorkspaceManifest({
      bundleDir,
      graphHash: "abc123",
      generatedAt: "t",
    });
    const scan = scanPortableGraphifyArtifacts(root);
    const manifestIssues = scan.issues.filter((i) =>
      i.path.endsWith(WORKSPACE_MANIFEST_FILENAME),
    );
    expect(manifestIssues).toEqual([]);
  });
});
