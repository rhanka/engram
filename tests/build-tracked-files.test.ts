import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Engram Test",
  GIT_AUTHOR_EMAIL: "engram-test@example.invalid",
  GIT_COMMITTER_NAME: "Engram Test",
  GIT_COMMITTER_EMAIL: "engram-test@example.invalid",
};

const TRACKED_GENERATED = [
  "src/workspace/tokens-st-css.generated.ts",
  "registry/entries.v1.json",
  "registry/publisher-assets.v1.json",
] as const;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
  }).trim();
}

function runNode(cwd: string, scriptRel: string, args: string[] = []) {
  return spawnSync(process.execPath, [join(cwd, scriptRel), ...args], {
    cwd,
    encoding: "utf8",
  });
}

function copyFileRel(srcRoot: string, dstRoot: string, rel: string) {
  const dst = join(dstRoot, rel);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(join(srcRoot, rel), dst);
}

function makeTempCopy(options: { includeCandidateManifest?: boolean; includeReceipt?: boolean } = {}) {
  const includeCandidateManifest = options.includeCandidateManifest ?? true;
  const includeReceipt = options.includeReceipt ?? true;
  // Precondition (finding 7a): the fixture replays the built ESM runtime, so
  // it needs a prior `npm run build`. Fail with a pointer instead of ENOENT.
  if (!existsSync(join(ROOT, "dist", "mcp-memory.js"))) {
    throw new Error(
      "build-tracked-files fixture needs built dist (run npm run build first): dist/mcp-memory.js is missing",
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "engram-build-tracked-"));
  tempDirs.push(dir);

  const trackedFiles = [
    "package.json",
    "package-lock.json",
    "scripts/gen-st-tokens.mjs",
    "scripts/gen-mcp-memory-assets.mjs",
    "scripts/refresh-candidate-manifest.mjs",
    "src/workspace/tokens-st-css.generated.ts",
    "registry/entries.v1.json",
    ...(includeCandidateManifest ? ["candidate-manifest.json"] : []),
    ...(includeReceipt ? ["registry/publisher-assets.v1.json"] : []),
  ];

  for (const rel of trackedFiles) {
    copyFileRel(ROOT, dir, rel);
  }

  // Copy only the built ESM runtime files needed by gen-mcp-memory-assets.mjs
  // (keeps the fixture small and isolated from the real worktree dist/).
  const distSrc = join(ROOT, "dist");
  const distDst = join(dir, "dist");
  mkdirSync(join(distDst, "registry"), { recursive: true });
  copyFileRel(ROOT, dir, "dist/mcp-memory.js");
  for (const name of readdirSync(distSrc)) {
    if (name.startsWith("chunk-") && name.endsWith(".js")) {
      copyFileRel(ROOT, dir, `dist/${name}`);
    }
  }
  for (const name of ["manifest.js", "definitions.js", "validator.js"]) {
    copyFileRel(ROOT, dir, `dist/registry/${name}`);
  }

  // Reuse existing node_modules without reinstalling.
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");

  writeFileSync(join(dir, ".gitignore"), "dist/\nnode_modules\nnode_modules/\n*.tgz\n", "utf8");

  git(dir, ["init", "-q"]);
  git(dir, ["add", ".gitignore", ...trackedFiles]);
  git(dir, ["commit", "-q", "-m", "fixture clean checkout"]);
  expect(git(dir, ["status", "--porcelain"])).toBe("");
  const head = git(dir, ["rev-parse", "HEAD"]);
  return { dir, head, trackedFiles };
}

function snapshotTracked(dir: string, files: readonly string[]): Map<string, Buffer> {
  return new Map(files.map((rel) => [rel, readFileSync(join(dir, rel))]));
}

/** Pack the temp checkout's current registry closure the way `npm pack` emits it. */
function stageTarball(dir: string, mutate?: (pkgDir: string) => void): string {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
  const entries = JSON.parse(readFileSync(join(dir, "registry/entries.v1.json"), "utf8")) as {
    entries: [{ assets: { path: string }[] }];
  };
  const stageRoot = mkdtempSync(join(tmpdir(), "engram-tar-stage-"));
  tempDirs.push(stageRoot);
  const pkgDir = join(stageRoot, "package");
  copyFileRel(dir, pkgDir, "package.json");
  copyFileRel(dir, pkgDir, "registry/entries.v1.json");
  for (const asset of entries.entries[0].assets) {
    copyFileRel(dir, pkgDir, asset.path);
  }
  mutate?.(pkgDir);
  const tarballName = `sentropic-engram-${pkg.version}.tgz`;
  execFileSync("tar", ["-czf", join(dir, tarballName), "-C", stageRoot, "package"]);
  return tarballName;
}

function rewindMtimes(dir: string, files: readonly string[], secondsAgo = 10): Map<string, number> {
  const past = new Date(Date.now() - secondsAgo * 1000);
  const mtimes = new Map<string, number>();
  for (const rel of files) {
    const abs = join(dir, rel);
    utimesSync(abs, past, past);
    mtimes.set(rel, statSync(abs).mtimeMs);
  }
  return mtimes;
}

describe("build generators must not modify tracked files or stamp checkout HEAD", () => {
  it("leaves a clean tree byte-identical, never writes HEAD into tracked files, and skips writes on a second run", () => {
    const { dir, head, trackedFiles } = makeTempCopy();
    const before = snapshotTracked(dir, trackedFiles);

    for (const script of ["scripts/gen-st-tokens.mjs", "scripts/gen-mcp-memory-assets.mjs"]) {
      const res = runNode(dir, script);
      expect(res.status, `${script} failed:\n${res.stderr}`).toBe(0);
    }

    // No generator may write the checkout's HEAD or temporary path into any tracked file.
    for (const rel of trackedFiles) {
      const text = readFileSync(join(dir, rel), "utf8");
      expect(text, `${rel} must not contain current git HEAD`).not.toContain(head);
      expect(text, `${rel} must not contain absolute temp checkout path`).not.toContain(dir);
    }
    const receiptAfterRun1 = JSON.parse(readFileSync(join(dir, "registry/publisher-assets.v1.json"), "utf8")) as {
      executableProvenance: { sourceHead: string };
    };
    expect(receiptAfterRun1.executableProvenance.sourceHead).not.toBe(head);

    // First run on a clean checkout must change zero tracked bytes.
    expect(git(dir, ["status", "--porcelain"])).toBe("");
    for (const rel of trackedFiles) {
      expect(readFileSync(join(dir, rel)).equals(before.get(rel)!), `${rel} changed on first run`).toBe(true);
    }

    // Second run on an unchanged tree must change no tracked byte AND must not rewrite unchanged files.
    const mtimesBeforeRun2 = rewindMtimes(dir, TRACKED_GENERATED);
    for (const script of ["scripts/gen-st-tokens.mjs", "scripts/gen-mcp-memory-assets.mjs"]) {
      const res = runNode(dir, script);
      expect(res.status, `${script} second run failed:\n${res.stderr}`).toBe(0);
    }
    expect(git(dir, ["status", "--porcelain"])).toBe("");
    for (const rel of TRACKED_GENERATED) {
      expect(readFileSync(join(dir, rel)).equals(before.get(rel)!), `${rel} changed on second run`).toBe(true);
      expect(statSync(join(dir, rel)).mtimeMs, `${rel} was unnecessarily rewritten on second run`).toBe(
        mtimesBeforeRun2.get(rel),
      );
    }
  });

  it("stays clean and never writes HEAD after advancing git HEAD", () => {
    const { dir, head, trackedFiles } = makeTempCopy();
    git(dir, ["commit", "-q", "--allow-empty", "-m", "advance HEAD"]);
    const nextHead = git(dir, ["rev-parse", "HEAD"]);
    expect(nextHead).not.toBe(head);

    for (const script of ["scripts/gen-st-tokens.mjs", "scripts/gen-mcp-memory-assets.mjs"]) {
      const res = runNode(dir, script);
      expect(res.status, `${script} failed:\n${res.stderr}`).toBe(0);
    }

    expect(git(dir, ["status", "--porcelain"])).toBe("");
    for (const rel of trackedFiles) {
      const text = readFileSync(join(dir, rel), "utf8");
      expect(text, `${rel} must not contain advanced HEAD`).not.toContain(nextHead);
    }
  });

  it("pins the npm wiring: builds regenerate tokens only when missing, only the refresh refreshes the manifest", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const name of ["build", "build:server"] as const) {
      expect(pkg.scripts[name], `${name} must run gen-st-tokens.mjs --if-missing`).toMatch(
        /gen-st-tokens\.mjs --if-missing/,
      );
    }
    expect(
      pkg.scripts["refresh:candidate-manifest"],
      "refresh:candidate-manifest must run refresh-candidate-manifest.mjs",
    ).toMatch(/refresh-candidate-manifest\.mjs/);
    const manifestRunners = Object.entries(pkg.scripts)
      .filter(([, cmd]) => /refresh-candidate-manifest\.mjs/.test(cmd))
      .map(([name]) => name);
    expect(manifestRunners, "only refresh:candidate-manifest may run refresh-candidate-manifest.mjs").toEqual([
      "refresh:candidate-manifest",
    ]);
  });

  it("uses checkout-independent provenance when candidate-manifest.json is absent and is idempotent on second run", () => {
    const { dir, head } = makeTempCopy({ includeCandidateManifest: false, includeReceipt: false });

    const run1 = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(run1.status, run1.stderr).toBe(0);

    const receiptPath = join(dir, "registry/publisher-assets.v1.json");
    expect(existsSync(receiptPath)).toBe(true);
    const receiptText1 = readFileSync(receiptPath, "utf8");
    expect(receiptText1).not.toContain(head);
    expect(receiptText1).not.toContain(dir);
    const receipt = JSON.parse(receiptText1) as {
      tarballIntegrity: string;
      executableProvenance: { sourceHead: string };
    };
    expect(receipt.executableProvenance.sourceHead).toBe("pending-pack-refresh");
    expect(receipt.tarballIntegrity).toBe("pending-pack-refresh");

    const bytesAfterRun1 = readFileSync(receiptPath);
    const mtimesBeforeRun2 = rewindMtimes(dir, ["registry/entries.v1.json", "registry/publisher-assets.v1.json"]);

    const run2 = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(run2.status, run2.stderr).toBe(0);
    expect(readFileSync(receiptPath).equals(bytesAfterRun1)).toBe(true);
    expect(statSync(receiptPath).mtimeMs).toBe(mtimesBeforeRun2.get("registry/publisher-assets.v1.json"));
    expect(statSync(join(dir, "registry/entries.v1.json")).mtimeMs).toBe(
      mtimesBeforeRun2.get("registry/entries.v1.json"),
    );
  });

  it("stamps HEAD only via the dedicated refresh-candidate-manifest command and preserves it across later builds", () => {
    const { dir, head } = makeTempCopy();

    // Generate dist/registry/* assets first.
    const gen1 = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(gen1.status, gen1.stderr).toBe(0);

    // Stage a minimal tarball matching what `npm pack` emits for the registry closure.
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
    const entries = JSON.parse(readFileSync(join(dir, "registry/entries.v1.json"), "utf8")) as {
      entries: [{ assets: { path: string }[] }];
    };
    const stageRoot = mkdtempSync(join(tmpdir(), "engram-tar-stage-"));
    tempDirs.push(stageRoot);
    const pkgDir = join(stageRoot, "package");
    copyFileRel(dir, pkgDir, "package.json");
    copyFileRel(dir, pkgDir, "registry/entries.v1.json");
    for (const asset of entries.entries[0].assets) {
      copyFileRel(dir, pkgDir, asset.path);
    }
    const tarballName = `sentropic-engram-${pkg.version}.tgz`;
    execFileSync("tar", ["-czf", join(dir, tarballName), "-C", stageRoot, "package"]);

    // Dedicated refresh command stamps the current git HEAD.
    const refresh1 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh1.status, refresh1.stderr).toBe(0);

    const refreshedReceipt = JSON.parse(readFileSync(join(dir, "registry/publisher-assets.v1.json"), "utf8")) as {
      executableProvenance: { sourceHead: string };
    };
    const refreshedManifest = JSON.parse(readFileSync(join(dir, "candidate-manifest.json"), "utf8")) as {
      engramSourceCommit: string;
    };
    expect(refreshedReceipt.executableProvenance.sourceHead).toBe(head);
    expect(refreshedManifest.engramSourceCommit).toBe(head);

    // Second refresh run on identical inputs must not rewrite unchanged tracked files.
    const mtimesBeforeRefresh2 = rewindMtimes(dir, ["registry/publisher-assets.v1.json", "candidate-manifest.json"]);
    const refresh2 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh2.status, refresh2.stderr).toBe(0);
    expect(statSync(join(dir, "registry/publisher-assets.v1.json")).mtimeMs).toBe(
      mtimesBeforeRefresh2.get("registry/publisher-assets.v1.json"),
    );
    expect(statSync(join(dir, "candidate-manifest.json")).mtimeMs).toBe(
      mtimesBeforeRefresh2.get("candidate-manifest.json"),
    );

    // Commit refreshed release metadata, advance HEAD, and confirm build generator stays clean.
    git(dir, ["add", "registry/publisher-assets.v1.json", "candidate-manifest.json"]);
    git(dir, ["commit", "-q", "-m", "record refreshed provenance"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "subsequent worktree commit"]);
    const postReleaseHead = git(dir, ["rev-parse", "HEAD"]);
    expect(postReleaseHead).not.toBe(head);

    const genAfter = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(genAfter.status, genAfter.stderr).toBe(0);
    expect(git(dir, ["status", "--porcelain"])).toBe("");
    const receiptAfter = JSON.parse(readFileSync(join(dir, "registry/publisher-assets.v1.json"), "utf8")) as {
      executableProvenance: { sourceHead: string };
    };
    expect(receiptAfter.executableProvenance.sourceHead).toBe(head);
    expect(receiptAfter.executableProvenance.sourceHead).not.toBe(postReleaseHead);
  });

  it("refresh validates before writing: divergent packed assets abort with receipt and manifest untouched", () => {
    const { dir } = makeTempCopy();

    const gen1 = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(gen1.status, gen1.stderr).toBe(0);

    // Baseline: pack the exact worktree bytes and refresh successfully.
    stageTarball(dir);
    const refresh1 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh1.status, refresh1.stderr).toBe(0);
    const receiptPath = join(dir, "registry/publisher-assets.v1.json");
    const manifestPath = join(dir, "candidate-manifest.json");
    const receiptAfterRefresh = readFileSync(receiptPath);
    const manifestAfterRefresh = readFileSync(manifestPath);
    const mtimes = rewindMtimes(dir, ["registry/publisher-assets.v1.json", "candidate-manifest.json"]);

    // Repack with one packed asset byte changed: the worktree still matches
    // the entry digests, but the tarball no longer does.
    const firstAsset = (
      JSON.parse(readFileSync(join(dir, "registry/entries.v1.json"), "utf8")) as {
        entries: [{ assets: { path: string }[] }];
      }
    ).entries[0].assets[0].path;
    stageTarball(dir, (pkgDir) => {
      const p = join(pkgDir, firstAsset);
      writeFileSync(p, Buffer.concat([readFileSync(p), Buffer.from("\n")]));
    });

    const refresh2 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh2.status, `expected a non-zero exit:\n${refresh2.stdout}\n${refresh2.stderr}`).toBe(1);
    expect(
      readFileSync(receiptPath).equals(receiptAfterRefresh),
      "receipt must stay byte-identical on validation failure",
    ).toBe(true);
    expect(
      readFileSync(manifestPath).equals(manifestAfterRefresh),
      "candidate manifest must stay byte-identical on validation failure",
    ).toBe(true);
    expect(statSync(receiptPath).mtimeMs).toBe(mtimes.get("registry/publisher-assets.v1.json"));
    expect(statSync(manifestPath).mtimeMs).toBe(mtimes.get("candidate-manifest.json"));
  });

  it("refresh validates the receipt before writing it: an invalid receipt aborts with tracked files untouched", () => {
    const { dir } = makeTempCopy();

    const gen1 = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(gen1.status, gen1.stderr).toBe(0);

    // Baseline: pack the exact worktree bytes and refresh successfully.
    stageTarball(dir);
    const refresh1 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh1.status, refresh1.stderr).toBe(0);

    // Tamper one receipt asset digest (the packed closure still matches the
    // entry digests, so the closure loop passes and only the receipt
    // validation can fail), then advance HEAD so a premature receipt write
    // would observably change bytes.
    const receiptPath = join(dir, "registry/publisher-assets.v1.json");
    const manifestPath = join(dir, "candidate-manifest.json");
    const tampered = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      assets: [{ sha256: string }];
    };
    const digest = tampered.assets[0].sha256;
    tampered.assets[0].sha256 = `${digest[0] === "0" ? "1" : "0"}${digest.slice(1)}`;
    writeFileSync(receiptPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    git(dir, ["commit", "-q", "--allow-empty", "-m", "advance HEAD"]);
    const receiptAfterTamper = readFileSync(receiptPath);
    const manifestAfterRefresh = readFileSync(manifestPath);
    const mtimes = rewindMtimes(dir, ["registry/publisher-assets.v1.json", "candidate-manifest.json"]);

    const refresh2 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh2.status, `expected a non-zero exit:\n${refresh2.stdout}\n${refresh2.stderr}`).toBe(1);
    expect(
      readFileSync(receiptPath).equals(receiptAfterTamper),
      "receipt must stay byte-identical when its validation fails",
    ).toBe(true);
    expect(
      readFileSync(manifestPath).equals(manifestAfterRefresh),
      "candidate manifest must stay byte-identical when receipt validation fails",
    ).toBe(true);
    expect(statSync(receiptPath).mtimeMs).toBe(mtimes.get("registry/publisher-assets.v1.json"));
    expect(statSync(manifestPath).mtimeMs).toBe(mtimes.get("candidate-manifest.json"));
  });

  it("fails closed on a truncated candidate manifest with receipt and entries untouched", () => {
    const { dir } = makeTempCopy();
    const manifestPath = join(dir, "candidate-manifest.json");
    const receiptPath = join(dir, "registry/publisher-assets.v1.json");
    const entriesPath = join(dir, "registry/entries.v1.json");
    const manifestText = readFileSync(manifestPath, "utf8");
    writeFileSync(manifestPath, manifestText.slice(0, 100), "utf8");
    const receiptBefore = readFileSync(receiptPath);
    const entriesBefore = readFileSync(entriesPath);
    const mtimes = rewindMtimes(dir, ["registry/publisher-assets.v1.json", "registry/entries.v1.json"]);

    const res = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(res.status, `expected a non-zero exit:\n${res.stdout}\n${res.stderr}`).toBe(1);
    expect(
      readFileSync(receiptPath).equals(receiptBefore),
      "receipt must stay byte-identical on an unparseable manifest",
    ).toBe(true);
    expect(
      readFileSync(entriesPath).equals(entriesBefore),
      "entries must stay byte-identical on an unparseable manifest",
    ).toBe(true);
    expect(statSync(receiptPath).mtimeMs).toBe(mtimes.get("registry/publisher-assets.v1.json"));
    expect(statSync(entriesPath).mtimeMs).toBe(mtimes.get("registry/entries.v1.json"));
  });

  it("fails closed on a non-40-hex engramSourceCommit with receipt and entries untouched", () => {
    const { dir } = makeTempCopy();
    const manifestPath = join(dir, "candidate-manifest.json");
    const receiptPath = join(dir, "registry/publisher-assets.v1.json");
    const entriesPath = join(dir, "registry/entries.v1.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { engramSourceCommit: string };
    manifest.engramSourceCommit = "not-a-commit";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const receiptBefore = readFileSync(receiptPath);
    const entriesBefore = readFileSync(entriesPath);
    const mtimes = rewindMtimes(dir, ["registry/publisher-assets.v1.json", "registry/entries.v1.json"]);

    const res = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(res.status, `expected a non-zero exit:\n${res.stdout}\n${res.stderr}`).toBe(1);
    expect(
      readFileSync(receiptPath).equals(receiptBefore),
      "receipt must stay byte-identical on an unusable engramSourceCommit",
    ).toBe(true);
    expect(
      readFileSync(entriesPath).equals(entriesBefore),
      "entries must stay byte-identical on an unusable engramSourceCommit",
    ).toBe(true);
    expect(statSync(receiptPath).mtimeMs).toBe(mtimes.get("registry/publisher-assets.v1.json"));
    expect(statSync(entriesPath).mtimeMs).toBe(mtimes.get("registry/entries.v1.json"));
  });

  it("refresh fails when only entryJcsSha256 drifted with receipt and entries untouched", () => {
    const { dir } = makeTempCopy();

    const gen1 = runNode(dir, "scripts/gen-mcp-memory-assets.mjs");
    expect(gen1.status, gen1.stderr).toBe(0);

    // Baseline: pack the exact worktree bytes and refresh successfully.
    stageTarball(dir);
    const refresh1 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh1.status, refresh1.stderr).toBe(0);

    // Tamper only entryJcsSha256 (still 64-hex, so the receipt validator
    // passes and only the entryJcsSha256 check can fail), then advance HEAD
    // so a premature receipt write would observably change bytes.
    const receiptPath = join(dir, "registry/publisher-assets.v1.json");
    const entriesPath = join(dir, "registry/entries.v1.json");
    const tampered = JSON.parse(readFileSync(receiptPath, "utf8")) as { entryJcsSha256: string };
    const digest = tampered.entryJcsSha256;
    tampered.entryJcsSha256 = `${digest[0] === "0" ? "1" : "0"}${digest.slice(1)}`;
    writeFileSync(receiptPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    git(dir, ["commit", "-q", "--allow-empty", "-m", "advance HEAD"]);
    const receiptAfterTamper = readFileSync(receiptPath);
    const entriesAfter = readFileSync(entriesPath);
    const mtimes = rewindMtimes(dir, ["registry/publisher-assets.v1.json", "registry/entries.v1.json"]);

    const refresh2 = runNode(dir, "scripts/refresh-candidate-manifest.mjs");
    expect(refresh2.status, `expected a non-zero exit:\n${refresh2.stdout}\n${refresh2.stderr}`).toBe(1);
    expect(
      readFileSync(receiptPath).equals(receiptAfterTamper),
      "receipt must stay byte-identical when entryJcsSha256 drifts",
    ).toBe(true);
    expect(
      readFileSync(entriesPath).equals(entriesAfter),
      "entries must stay byte-identical when entryJcsSha256 drifts",
    ).toBe(true);
    expect(statSync(receiptPath).mtimeMs).toBe(mtimes.get("registry/publisher-assets.v1.json"));
    expect(statSync(entriesPath).mtimeMs).toBe(mtimes.get("registry/entries.v1.json"));
  });

  it("flags stale token CSS via --check without writing anything", () => {
    const { dir } = makeTempCopy();
    const tokenRel = "src/workspace/tokens-st-css.generated.ts";
    const tokenPath = join(dir, tokenRel);

    // Fresh tree: --check passes and writes nothing.
    const freshMtimes = rewindMtimes(dir, [tokenRel]);
    const fresh = runNode(dir, "scripts/gen-st-tokens.mjs", ["--check"]);
    expect(fresh.status, fresh.stderr).toBe(0);
    expect(statSync(tokenPath).mtimeMs).toBe(freshMtimes.get(tokenRel));

    // Stale but usable tracked copy (marker present, bytes differ): --check
    // exits 1 naming the refresh, and never writes.
    writeFileSync(tokenPath, "// divergent tracked copy\nexport const ST_TOKENS_CSS = \"stale\";\n", "utf8");
    const staleBytes = readFileSync(tokenPath);
    const staleMtimes = rewindMtimes(dir, [tokenRel]);
    const stale = runNode(dir, "scripts/gen-st-tokens.mjs", ["--check"]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("stale: run npm run refresh:tokens");
    expect(readFileSync(tokenPath).equals(staleBytes)).toBe(true);
    expect(statSync(tokenPath).mtimeMs).toBe(staleMtimes.get(tokenRel));

    // Missing file: --check exits 1 and still creates nothing.
    rmSync(tokenPath);
    const missing = runNode(dir, "scripts/gen-st-tokens.mjs", ["--check"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("stale: run npm run refresh:tokens");
    expect(existsSync(tokenPath)).toBe(false);
  });

  it("gen-st-tokens respects --if-missing and writes only when content changes", () => {
    const { dir } = makeTempCopy();
    const tokenRel = "src/workspace/tokens-st-css.generated.ts";
    const tokenPath = join(dir, tokenRel);
    const canonical = readFileSync(tokenPath);

    // --if-missing must never overwrite an existing usable tracked file (even with divergent bytes).
    writeFileSync(tokenPath, "// divergent tracked copy\nexport const ST_TOKENS_CSS = \"stale\";\n", "utf8");
    const ifMissingExisting = runNode(dir, "scripts/gen-st-tokens.mjs", ["--if-missing"]);
    expect(ifMissingExisting.status, ifMissingExisting.stderr).toBe(0);
    expect(readFileSync(tokenPath, "utf8")).toBe(
      "// divergent tracked copy\nexport const ST_TOKENS_CSS = \"stale\";\n",
    );

    // Direct refresh restores canonical bytes, and a second run does not rewrite them.
    const refresh = runNode(dir, "scripts/gen-st-tokens.mjs");
    expect(refresh.status, refresh.stderr).toBe(0);
    expect(readFileSync(tokenPath).equals(canonical)).toBe(true);

    const mtimes = rewindMtimes(dir, [tokenRel]);
    const refreshAgain = runNode(dir, "scripts/gen-st-tokens.mjs");
    expect(refreshAgain.status, refreshAgain.stderr).toBe(0);
    expect(readFileSync(tokenPath).equals(canonical)).toBe(true);
    expect(statSync(tokenPath).mtimeMs).toBe(mtimes.get(tokenRel));

    // An empty (marker-less) file counts as missing: --if-missing regenerates it (probe S5).
    writeFileSync(tokenPath, "", "utf8");
    const ifMissingEmpty = runNode(dir, "scripts/gen-st-tokens.mjs", ["--if-missing"]);
    expect(ifMissingEmpty.status, ifMissingEmpty.stderr).toBe(0);
    expect(readFileSync(tokenPath).equals(canonical)).toBe(true);

    // --if-missing generates the file if it was absent.
    rmSync(tokenPath);
    const ifMissingAbsent = runNode(dir, "scripts/gen-st-tokens.mjs", ["--if-missing"]);
    expect(ifMissingAbsent.status, ifMissingAbsent.stderr).toBe(0);
    expect(readFileSync(tokenPath).equals(canonical)).toBe(true);
  });
});
