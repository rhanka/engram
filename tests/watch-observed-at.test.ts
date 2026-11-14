import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractGit } from "../src/extract-git.js";
import { rebuildCode } from "../src/watch.js";
import { resolveGraphifyPaths } from "../src/paths.js";
import type { ExtractionProvenance } from "../src/types.js";

const roots: string[] = [];
const FIRST = "2026-11-14T12:00:00.000Z";
const SECOND = "2026-11-14T12:01:00.000Z";
const hookOptions = { markDescribePending: true, citationsReproject: true };

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_DATE: FIRST, GIT_COMMITTER_DATE: FIRST },
  }).trim();
}

function repository(prefix = "graphify-observed-at-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Graph Test");
  git(root, "config", "user.email", "graph@example.test");
  writeFileSync(join(root, ".gitignore"), ".engram/\n");
  writeFileSync(join(root, "mod.ts"), "export function alpha() { return 1; }\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "initial input");
  return root;
}

function graphPath(root: string): string {
  return resolveGraphifyPaths({ root }).graph;
}

function provenance(root: string): ExtractionProvenance & { input_digest?: string } {
  return JSON.parse(readFileSync(graphPath(root), "utf8")).graph.provenance;
}

async function rebuild(root: string, options: Parameters<typeof rebuildCode>[2] = hookOptions): Promise<void> {
  expect(await rebuildCode(root, false, options)).toBe(true);
}

beforeEach(() => {
  vi.stubEnv("SOURCE_DATE_EPOCH", undefined);
  vi.stubEnv("ENGRAM_CHANGED", undefined);
  vi.stubEnv("GRAPHIFY_CHANGED", undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIRST);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Git observation provenance on real rebuilds", () => {
  it("should preserve complete graph bytes and provenance when Git inputs are unchanged", async () => {
    const root = repository();
    await rebuild(root);
    const first = readFileSync(graphPath(root));
    const observed = provenance(root);
    expect(observed).toMatchObject({
      source_owner: "git",
      source_hash: git(root, "rev-parse", "HEAD"),
      observed_at: FIRST,
      source_id: expect.any(String),
      adapter_version: "graphify-git/1",
    });
    vi.setSystemTime(SECOND);
    await rebuild(root);
    expect(readFileSync(graphPath(root)).equals(first)).toBe(true);
    expect(provenance(root)).toEqual(observed);
    expect(observed.input_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    console.log("OBSERVED_AT_REBUILD_SHA256", createHash("sha256").update(first).digest("hex"), first.length);
  });

  it("should preserve complete graph bytes through two public hook-rebuild commands", async () => {
    const root = repository();
    const { main } = await import("../src/cli.js");
    const previousArgv = process.argv;
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      process.argv = ["node", "graphify", "hook-rebuild"];
      await main();
      const first = readFileSync(graphPath(root));
      expect(provenance(root).observed_at).toBe(FIRST);
      vi.setSystemTime(SECOND);
      await main();
      const second = readFileSync(graphPath(root));
      expect(second.equals(first)).toBe(true);
      console.log("OBSERVED_AT_HOOK_SHA256", createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"), second.length);
    } finally {
      process.argv = previousArgv;
      process.chdir(previousCwd);
    }
  });

  it("should preserve complete graph bytes and observations through public hooks when the repository basename contains &", async () => {
    const root = repository("graphify-observed-at&-");
    const { main } = await import("../src/cli.js");
    const previousArgv = process.argv;
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      process.argv = ["node", "graphify", "hook-rebuild"];
      await main();
      const first = readFileSync(graphPath(root));
      const observed = provenance(root);
      const rawIdentity = extractGit(root).provenance!.source_id;
      expect(rawIdentity).toContain("graphify-observed-at&-");
      expect(observed.source_id).toBe(rawIdentity.replace(/&/g, "&amp;"));
      expect(observed.observed_at).toBe(FIRST);
      vi.setSystemTime(SECOND);
      expect(Date.now()).toBeGreaterThan(Date.parse(observed.observed_at));
      await main();
      const second = readFileSync(graphPath(root));
      const nextObservation = provenance(root);
      expect(nextObservation.source_hash).toBe(observed.source_hash);
      expect(nextObservation.input_digest).toBe(observed.input_digest);
      expect.soft(second.equals(first)).toBe(true);
      expect.soft(nextObservation.observed_at).toBe(observed.observed_at);
      expect(nextObservation).toEqual(observed);
    } finally {
      process.argv = previousArgv;
      process.chdir(previousCwd);
    }
  });

  it("should advance the observation when a new full source commit is observed", async () => {
    const root = repository();
    await rebuild(root);
    const first = provenance(root);
    git(root, "commit", "--allow-empty", "-qm", "next input");
    vi.setSystemTime(SECOND);
    await rebuild(root);
    const second = provenance(root);
    expect(second.source_hash).toBe(git(root, "rev-parse", "HEAD"));
    expect(second.source_hash).not.toBe(first.source_hash);
    expect(second.observed_at).toBe(SECOND);
    expect(Date.parse(second.observed_at)).toBeGreaterThan(Date.parse(first.observed_at));
    expect(second.input_digest).not.toBe(first.input_digest);
  });

  it("should advance the observation when refs change at the same source commit", async () => {
    const root = repository();
    await rebuild(root);
    const first = provenance(root);
    git(root, "branch", "topic");
    vi.setSystemTime(SECOND);
    await rebuild(root);
    const second = provenance(root);
    expect(second.source_hash).toBe(first.source_hash);
    expect(second.observed_at).toBe(SECOND);
    expect(second.input_digest).not.toBe(first.input_digest);
  });

  it("should advance the observation when the file-node mapping changes at the same commit", async () => {
    const root = repository();
    const options = { ...hookOptions, scope: "all" as const };
    await rebuild(root, options);
    const first = provenance(root);
    rmSync(join(root, "mod.ts"));
    writeFileSync(join(root, "replacement.ts"), "export function replacement() { return 2; }\n");
    git(root, "add", "-A");
    vi.setSystemTime(SECOND);
    await rebuild(root, options);
    const second = provenance(root);
    expect(second.source_hash).toBe(first.source_hash);
    expect(second.observed_at).toBe(SECOND);
    expect(second.input_digest).not.toBe(first.input_digest);
  });

  it.each([
    ["source_owner", "github"],
    ["source_hash", "0".repeat(40)],
    ["source_id", "repo:other"],
    ["input_digest", "sha256:" + "0".repeat(64)],
    ["input_digest", undefined],
    ["observed_at", undefined],
    ["observed_at", "invalid"],
  ])("should observe afresh when prior provenance has %s=%s", async (field, value) => {
    const root = repository();
    await rebuild(root);
    const raw = JSON.parse(readFileSync(graphPath(root), "utf8"));
    raw.graph.provenance[field!] = value;
    writeFileSync(graphPath(root), JSON.stringify(raw));
    vi.setSystemTime(SECOND);
    await rebuild(root);
    expect(provenance(root).observed_at).toBe(SECOND);
  });

  it("should use an explicit observedAt ahead of both prior provenance and SOURCE_DATE_EPOCH", async () => {
    const root = repository();
    await rebuild(root);
    vi.stubEnv("SOURCE_DATE_EPOCH", "0");
    vi.setSystemTime(SECOND);
    const explicit = "2020-01-02T03:04:05.000Z";
    expect(await rebuildCode(root, false, { ...hookOptions, observedAt: explicit })).toBe(true);
    expect(provenance(root).observed_at).toBe(explicit);
    expect(extractGit(root, { observedAt: explicit }).provenance?.observed_at).toBe(explicit);
  });

  it.each(["0", "1794657600"])("should honor SOURCE_DATE_EPOCH=%s ahead of prior provenance", async (epoch) => {
    const root = repository();
    await rebuild(root);
    vi.stubEnv("SOURCE_DATE_EPOCH", epoch);
    vi.setSystemTime(SECOND);
    const expected = new Date(Number(epoch) * 1000).toISOString();
    expect(extractGit(root).provenance?.observed_at).toBe(expected);
    await rebuild(root);
    expect(provenance(root).observed_at).toBe(expected);
    const first = readFileSync(graphPath(root));
    vi.setSystemTime("2026-11-14T12:02:00.000Z");
    await rebuild(root);
    expect(readFileSync(graphPath(root)).equals(first)).toBe(true);
  });

  it.each(["", "invalid", "-1", "1.5", "8640000000001"])("should reject invalid SOURCE_DATE_EPOCH=%s without overriding an explicit observedAt", (epoch) => {
    const root = repository();
    vi.stubEnv("SOURCE_DATE_EPOCH", epoch);
    expect(() => extractGit(root)).toThrow(/SOURCE_DATE_EPOCH/);
    expect(extractGit(root, { observedAt: FIRST }).provenance?.observed_at).toBe(FIRST);
  });
});
