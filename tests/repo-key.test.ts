import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { repoKey, commitId, branchId, prId, type RepoKeyRunner } from "../src/repo-key.js";
import { mergeGraphsFromFiles } from "../src/merge-graphs.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeRunner(remoteUrl: string | null): RepoKeyRunner {
  return {
    run(_command: string, args: string[], _cwd: string): string {
      if (args[0] === "remote" && args[1] === "get-url") {
        if (remoteUrl === null) throw new Error("no remote configured");
        return remoteUrl;
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    },
  };
}

function remoteRunner(map: Record<string, string | null>): RepoKeyRunner {
  return {
    run(_command: string, args: string[], cwd: string): string {
      if (args[0] === "remote" && args[1] === "get-url") {
        const remote = map[cwd];
        if (remote === undefined) throw new Error(`no entry for cwd: ${cwd}`);
        if (remote === null) throw new Error("no remote configured");
        return remote;
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    },
  };
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-repo-key-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// repoKey() — GitHub remotes
// ---------------------------------------------------------------------------

describe("repoKey — GitHub HTTPS", () => {
  it("returns repo:github.com/owner/name for HTTPS URL", () => {
    const runner = fakeRunner("https://github.com/acme/myrepo.git");
    expect(repoKey("/some/path", runner)).toBe("repo:github.com/acme/myrepo");
  });

  it("returns repo:github.com/owner/name for SSH URL", () => {
    const runner = fakeRunner("git@github.com:acme/myrepo.git");
    expect(repoKey("/some/path", runner)).toBe("repo:github.com/acme/myrepo");
  });

  it("returns repo:github.com/owner/name for ssh:// URL", () => {
    const runner = fakeRunner("ssh://git@github.com/acme/myrepo.git");
    expect(repoKey("/some/path", runner)).toBe("repo:github.com/acme/myrepo");
  });
});

// ---------------------------------------------------------------------------
// repoKey() — Non-GitHub remotes (GitLab / self-hosted)
// ---------------------------------------------------------------------------

describe("repoKey — non-GitHub remote fallback", () => {
  it("GitLab HTTPS → repo:gitlab.com/owner/name", () => {
    const runner = fakeRunner("https://gitlab.com/owner/name.git");
    expect(repoKey("/some/path", runner)).toBe("repo:gitlab.com/owner/name");
  });

  it("GitLab SSH scp-style → repo:gitlab.com/owner/name", () => {
    const runner = fakeRunner("git@gitlab.com:owner/name.git");
    expect(repoKey("/some/path", runner)).toBe("repo:gitlab.com/owner/name");
  });

  it("self-hosted HTTPS → repo:self-hosted.internal/org/project", () => {
    const runner = fakeRunner("https://self-hosted.internal/org/project.git");
    expect(repoKey("/some/path", runner)).toBe("repo:self-hosted.internal/org/project");
  });

  it("self-hosted SSH URL → repo:git.corp.example/group/repo", () => {
    const runner = fakeRunner("ssh://git@git.corp.example/group/repo.git");
    expect(repoKey("/some/path", runner)).toBe("repo:git.corp.example/group/repo");
  });
});

// ---------------------------------------------------------------------------
// repoKey() — No remote (local fallback)
// ---------------------------------------------------------------------------

describe("repoKey — no remote local fallback", () => {
  it("returns repo:local/<basename>@<8-hex> when no remote", () => {
    const runner = fakeRunner(null);
    const absPath = resolve("/tmp/graphify-workspace/myproject");
    const expectedHash = createHash("sha256").update(absPath).digest("hex").slice(0, 8);
    const key = repoKey(absPath, runner);
    expect(key).toBe(`repo:local/myproject@${expectedHash}`);
  });

  it("never returns bare basename without a hash suffix", () => {
    const runner = fakeRunner(null);
    const key = repoKey("/home/user/graphify", runner);
    expect(key).not.toBe("graphify");
    expect(key).not.toBe("repo:local/graphify");
    expect(key).toMatch(/^repo:local\/graphify@[0-9a-f]{8}$/);
  });

  it("two paths with same basename but different paths produce different keys", () => {
    const runner = fakeRunner(null);
    const key1 = repoKey("/a/graphify", runner);
    const key2 = repoKey("/b/graphify", runner);
    expect(key1).not.toBe(key2);
    // Both must include a hash suffix
    expect(key1).toMatch(/^repo:local\/graphify@[0-9a-f]{8}$/);
    expect(key2).toMatch(/^repo:local\/graphify@[0-9a-f]{8}$/);
  });

  it("is deterministic for the same path", () => {
    const runner = fakeRunner(null);
    expect(repoKey("/stable/path/myrepo", runner)).toBe(repoKey("/stable/path/myrepo", runner));
  });
});

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

describe("commitId / branchId / prId", () => {
  const key = "repo:github.com/acme/myrepo";

  it("commitId formats as commit:<repoKey>@<sha>", () => {
    expect(commitId(key, "abc123")).toBe("commit:repo:github.com/acme/myrepo@abc123");
  });

  it("branchId formats as branch:<repoKey>#<name>", () => {
    expect(branchId(key, "main")).toBe("branch:repo:github.com/acme/myrepo#main");
  });

  it("prId formats as pr:<repoKey>#<n>", () => {
    expect(prId(key, 42)).toBe("pr:repo:github.com/acme/myrepo#42");
  });
});

// ---------------------------------------------------------------------------
// Anti-collision: homonym repos (same basename, different remotes/paths)
// ---------------------------------------------------------------------------

describe("merge-graphs — homonym repo collision prevention", () => {
  function makeGraphJson(nodes: Array<{ id: string; label: string }>): string {
    return JSON.stringify({
      directed: false,
      graph: {},
      nodes: nodes.map((n) => ({ ...n, source_file: "src/index.ts", file_type: "code" })),
      links: [],
    }, null, 2);
  }

  it("two repos with same basename but different GitHub remotes get different repo tags", () => {
    const dir = tempDir();

    // Both repos are named "graphify" but belong to different GitHub owners
    const repoA = join(dir, "user-a", "graphify");
    const repoB = join(dir, "user-b", "graphify");
    mkdirSync(join(repoA, ".graphify"), { recursive: true });
    mkdirSync(join(repoB, ".graphify"), { recursive: true });

    const graphA = join(repoA, ".graphify", "graph.json");
    const graphB = join(repoB, ".graphify", "graph.json");
    writeFileSync(graphA, makeGraphJson([{ id: "NodeA", label: "Node A" }]), "utf-8");
    writeFileSync(graphB, makeGraphJson([{ id: "NodeB", label: "Node B" }]), "utf-8");

    const out = join(dir, "merged.json");

    // Build a runner that maps each repo root to its remote
    const runner = remoteRunner({
      [resolve(repoA)]: "https://github.com/user-a/graphify.git",
      [resolve(repoB)]: "https://github.com/user-b/graphify.git",
    });

    mergeGraphsFromFiles({ inputs: [graphA, graphB], out, runner });

    // readFileSync imported at top
    const merged = JSON.parse(readFileSync(out, "utf-8")) as {
      nodes: Array<{ id: string; repo?: string }>;
    };

    const repoTags = merged.nodes.map((n) => n.repo);
    expect(repoTags[0]).toBe("repo:github.com/user-a/graphify");
    expect(repoTags[1]).toBe("repo:github.com/user-b/graphify");
    expect(repoTags[0]).not.toBe(repoTags[1]);
  });

  it("two repos with same basename but no remote get different deterministic local keys", () => {
    const dir = tempDir();

    const repoA = join(dir, "team-x", "graphify");
    const repoB = join(dir, "team-y", "graphify");
    mkdirSync(join(repoA, ".graphify"), { recursive: true });
    mkdirSync(join(repoB, ".graphify"), { recursive: true });

    const graphA = join(repoA, ".graphify", "graph.json");
    const graphB = join(repoB, ".graphify", "graph.json");
    writeFileSync(graphA, makeGraphJson([{ id: "NodeX", label: "Node X" }]), "utf-8");
    writeFileSync(graphB, makeGraphJson([{ id: "NodeY", label: "Node Y" }]), "utf-8");

    const out = join(dir, "merged-local.json");

    // No remotes configured → local fallback
    const runner = remoteRunner({
      [resolve(repoA)]: null,
      [resolve(repoB)]: null,
    });

    mergeGraphsFromFiles({ inputs: [graphA, graphB], out, runner });

    // readFileSync imported at top
    const merged = JSON.parse(readFileSync(out, "utf-8")) as {
      nodes: Array<{ id: string; repo?: string }>;
    };

    const repoTags = merged.nodes.map((n) => n.repo);
    // Both have same basename "graphify" but MUST differ (different absolute paths)
    expect(repoTags[0]).not.toBe(repoTags[1]);
    // Both must follow the local fallback pattern
    expect(repoTags[0]).toMatch(/^repo:local\/graphify@[0-9a-f]{8}$/);
    expect(repoTags[1]).toMatch(/^repo:local\/graphify@[0-9a-f]{8}$/);
  });

  it("existing repo tag on node is preserved (not overwritten by runner)", () => {
    const dir = tempDir();

    const repoA = join(dir, "org", "graphify");
    mkdirSync(join(repoA, ".graphify"), { recursive: true });

    const graphPath = join(repoA, ".graphify", "graph.json");
    // Node already has a repo attribute set
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "PinnedNode", label: "Pinned", source_file: "src/a.ts", file_type: "code", repo: "repo:github.com/legacy/owner" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const otherRepo = join(dir, "other", "repo");
    mkdirSync(join(otherRepo, ".graphify"), { recursive: true });
    const graphB = join(otherRepo, ".graphify", "graph.json");
    writeFileSync(graphB, makeGraphJson([{ id: "FreshNode", label: "Fresh" }]), "utf-8");

    const out = join(dir, "merged-pinned.json");
    const runner = remoteRunner({
      [resolve(repoA)]: "https://github.com/new/owner.git",
      [resolve(otherRepo)]: "https://github.com/other/repo.git",
    });

    mergeGraphsFromFiles({ inputs: [graphPath, graphB], out, runner });

    // readFileSync imported at top
    const merged = JSON.parse(readFileSync(out, "utf-8")) as {
      nodes: Array<{ id: string; repo?: string }>;
    };

    const pinned = merged.nodes.find((n) => n.id === "PinnedNode");
    expect(pinned?.repo).toBe("repo:github.com/legacy/owner");
  });
});
