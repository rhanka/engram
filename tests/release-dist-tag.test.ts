import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "release-dist-tag.mjs");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "typescript-ci.yml");

interface WorkflowStep {
  readonly id?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly run?: string;
}

interface WorkflowJob {
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly env?: Readonly<Record<string, string>>;
  readonly steps?: readonly WorkflowStep[];
}

interface WorkflowDocument {
  readonly on?: {
    readonly push?: {
      readonly tags?: readonly string[];
    };
  };
  readonly jobs?: Readonly<Record<string, WorkflowJob>>;
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runScript(args: readonly string[], cwd: string = REPO_ROOT, scriptFile: string = SCRIPT_PATH) {
  return spawnSync(process.execPath, [scriptFile, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function runWithManifest(manifestContent: string, cwd?: string) {
  return withTempDir("engram-release-dist-tag-", (dir) => {
    const manifestPath = join(dir, "package.json");
    writeFileSync(manifestPath, manifestContent, "utf8");
    return cwd === undefined ? runScript([manifestPath]) : runScript([], dir);
  });
}

async function loadResolver() {
  const mod = (await import(pathToFileURL(SCRIPT_PATH).href)) as {
    resolveReleaseDistTag: (manifest: unknown) => string;
  };
  return mod.resolveReleaseDistTag;
}

function parseGithubOutput(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    const eq = line.indexOf("=");
    if (eq > 0) {
      out[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return out;
}

function writeNpmStub(binDir: string, logPath: string) {
  const recorderPath = join(binDir, "record-npm.mjs");
  writeFileSync(
    recorderPath,
    'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.STUB_NPM_LOG, JSON.stringify(process.argv.slice(2)), "utf8");\n',
    "utf8",
  );
  const npmShimPath = join(binDir, "npm");
  writeFileSync(npmShimPath, '#!/bin/sh\nexec "$STUB_NODE" "$STUB_RECORDER" "$@"\n', "utf8");
  chmodSync(npmShimPath, 0o755);
  return {
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    STUB_NODE: process.execPath,
    STUB_RECORDER: recorderPath,
    STUB_NPM_LOG: logPath,
  };
}

describe("tests/release-dist-tag.test.ts", () => {
  it("a package whose publishConfig.tag is sj maps to the dist-tag sj and never to latest", async () => {
    const sjResult = runWithManifest(
      JSON.stringify({
        name: "@sentropic/engram",
        version: "0.29.0",
        publishConfig: { access: "public", tag: "sj" },
      }),
    );
    // Kills a mutant that exits non-zero on a valid plain version with publishConfig.tag="sj".
    expect(sjResult.status).toBe(0);
    // Kills a mutant that prints "latest", omits the newline, or decorates stdout when publishConfig.tag is "sj".
    expect(sjResult.stdout).toBe("sj\n");
    // Kills a mutant that maps publishConfig.tag="sj" to "latest".
    expect(sjResult.stdout.trim()).not.toBe("latest");
    // Kills a mutant that emits unexpected diagnostics on stderr during a clean resolution.
    expect(sjResult.stderr).toBe("");

    const customTagResult = runWithManifest(
      JSON.stringify({
        name: "@sentropic/engram",
        version: "0.30.0",
        publishConfig: { access: "public", tag: "sj-r2.1_beta" },
      }),
    );
    // Kills a mutant that rejects valid dist-tag characters (digits, dot, hyphen, underscore) after a leading letter.
    expect(customTagResult.status).toBe(0);
    // Kills a mutant that hardcodes "sj" instead of returning the committed publishConfig.tag value.
    expect(customTagResult.stdout).toBe("sj-r2.1_beta\n");

    const invalidTags: readonly unknown[] = [
      "",
      null,
      42,
      true,
      {},
      " sj",
      "sj ",
      "sj\n",
      "sj\nlatest",
      "SJ",
      "-sj",
      "--tag=latest",
      "sj;id",
      "sj/foo",
      "1.0.0",
      "v1",
      "v0.29.0",
      "v1.2.3-rc.1",
    ];
    for (const badTag of invalidTags) {
      const res = runWithManifest(
        JSON.stringify({
          name: "@sentropic/engram",
          version: "0.29.0",
          publishConfig: { access: "public", tag: badTag },
        }),
      );
      // Kills a mutant that accepts or falls back to "latest" for an invalid or version-lookalike publishConfig.tag.
      expect(res.status).toBe(1);
      // Kills a mutant that leaks a fallback tag to stdout when publishConfig.tag is invalid.
      expect(res.stdout).toBe("");
      // Kills a mutant that fails for an unrelated reason instead of refusing publishConfig.tag.
      expect(res.stderr).toContain("release-dist-tag: Refusing invalid publishConfig.tag");
    }

    const badPublishConfigs: readonly unknown[] = [null, [], "sj", 7, false];
    for (const badConfig of badPublishConfigs) {
      const res = runWithManifest(
        JSON.stringify({
          name: "@sentropic/engram",
          version: "0.29.0",
          publishConfig: badConfig,
        }),
      );
      // Kills a mutant that accepts a non-object publishConfig or silently falls back to "latest".
      expect(res.status).toBe(1);
      // Kills a mutant that prints anything to stdout when publishConfig is not a plain object.
      expect(res.stdout).toBe("");
      // Kills a mutant that skips the publishConfig plain-object guard.
      expect(res.stderr).toContain("release-dist-tag: publishConfig must be a JSON object when present.");
    }

    const badManifests: readonly string[] = ["null", "[]", '"0.29.0"', "42"];
    for (const rawManifest of badManifests) {
      const res = runWithManifest(rawManifest);
      // Kills a mutant that accepts a non-object package.json root value.
      expect(res.status).toBe(1);
      // Kills a mutant that writes stdout when the package.json root is not a JSON object.
      expect(res.stdout).toBe("");
      // Kills a mutant that omits the root plain-object validation error.
      expect(res.stderr).toContain("release-dist-tag: package.json must contain a JSON object.");
    }

    const malformedJson = runWithManifest("{not-valid-json");
    // Kills a mutant that fails to exit 1 on malformed package.json JSON.
    expect(malformedJson.status).toBe(1);
    // Kills a mutant that prints a tag when package.json cannot be parsed.
    expect(malformedJson.stdout).toBe("");
    // Kills a mutant that drops the invalid-JSON diagnostic wrapper.
    expect(malformedJson.stderr).toContain("release-dist-tag: Invalid JSON in package manifest");

    const missingFile = withTempDir("engram-missing-pkg-", (dir) => runScript([join(dir, "missing-package.json")]));
    // Kills a mutant that exits 0 when the manifest file does not exist.
    expect(missingFile.status).toBe(1);
    // Kills a mutant that writes stdout when the manifest file is unreadable.
    expect(missingFile.stdout).toBe("");
    // Kills a mutant that drops the unreadable-manifest diagnostic wrapper.
    expect(missingFile.stderr).toContain("release-dist-tag: Unable to read package manifest");

    const extraArgs = runScript(["a.json", "b.json"]);
    // Kills a mutant that silently ignores extra positional CLI arguments.
    expect(extraArgs.status).toBe(1);
    // Kills a mutant that prints a dist-tag when given unexpected extra CLI arguments.
    expect(extraArgs.stdout).toBe("");
    // Kills a mutant that drops the extra-argument validation guard.
    expect(extraArgs.stderr).toContain("release-dist-tag: Expected at most one manifest path argument");

    const emptyArg = runScript([""]);
    // Kills a mutant that accepts an empty manifest path argument and resolves cwd instead.
    expect(emptyArg.status).toBe(1);
    // Kills a mutant that emits stdout when the manifest path argument is empty.
    expect(emptyArg.stdout).toBe("");
    // Kills a mutant that drops the empty-argument validation guard.
    expect(emptyArg.stderr).toContain("release-dist-tag: Manifest path argument must not be empty.");

    const resolveReleaseDistTag = await loadResolver();
    // Kills a mutant in resolveReleaseDistTag that returns the wrong tag when called programmatically with "sj".
    expect(resolveReleaseDistTag({ version: "0.29.0", publishConfig: { access: "public", tag: "sj" } })).toBe("sj");
    // Kills a mutant that reads an inherited prototype version instead of own property "version".
    expect(() => resolveReleaseDistTag(Object.create({ version: "0.29.0" }))).toThrow("Refusing non-plain release version");
  });

  it("a package with no publishConfig.tag maps to latest", async () => {
    const accessOnly = runWithManifest(
      JSON.stringify({
        name: "@sentropic/engram",
        version: "0.28.0",
        publishConfig: { access: "public" },
      }),
    );
    // Kills a mutant that rejects a manifest whose publishConfig has access only and no tag.
    expect(accessOnly.status).toBe(0);
    // Kills a mutant that fails to default to "latest" when publishConfig.tag is absent.
    expect(accessOnly.stdout).toBe("latest\n");
    // Kills a mutant that writes stderr output for a valid manifest without publishConfig.tag.
    expect(accessOnly.stderr).toBe("");

    const noPublishConfig = runWithManifest(
      JSON.stringify({
        name: "@sentropic/engram",
        version: "1.0.0",
      }),
    );
    // Kills a mutant that requires publishConfig to be present on stable releases.
    expect(noPublishConfig.status).toBe(0);
    // Kills a mutant that fails to return "latest" when publishConfig itself is absent.
    expect(noPublishConfig.stdout).toBe("latest\n");

    const explicitLatest = runWithManifest(
      JSON.stringify({
        name: "@sentropic/engram",
        version: "0.28.0",
        publishConfig: { access: "public", tag: "latest" },
      }),
    );
    // Kills a mutant that refuses an explicit publishConfig.tag="latest".
    expect(explicitLatest.status).toBe(0);
    // Kills a mutant that alters an explicit "latest" tag.
    expect(explicitLatest.stdout).toBe("latest\n");

    const cwdDefault = runWithManifest(
      JSON.stringify({
        name: "@sentropic/engram",
        version: "2.3.4",
        publishConfig: { access: "public" },
      }),
      "use-cwd",
    );
    // Kills a mutant that fails to read ./package.json from cwd when no path argument is supplied.
    expect(cwdDefault.status).toBe(0);
    // Kills a mutant that reads the wrong manifest or drops the default "latest" tag when run with no arguments.
    expect(cwdDefault.stdout).toBe("latest\n");

    const repoRootRun = runScript([], REPO_ROOT);
    const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      version: string;
      publishConfig?: { tag?: string };
    };
    const expectedRootTag = rootPkg.publishConfig?.tag ?? "latest";
    // Kills a mutant that fails on the repository's own stable package.json manifest.
    expect(repoRootRun.status).toBe(0);
    // Kills a mutant that changes the dist-tag behavior of the current root package.json.
    expect(repoRootRun.stdout).toBe(`${expectedRootTag}\n`);
    // Kills a mutant if root package.json unexpectedly gained a non-latest tag inside this lot.
    expect(expectedRootTag).toBe("latest");

    const symlinkRun = withTempDir("engram-symlink-dist-tag-", (dir) => {
      const linkPath = join(dir, "release-dist-tag-link.mjs");
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.28.0" }), "utf8");
      symlinkSync(SCRIPT_PATH, linkPath);
      return runScript([], dir, linkPath);
    });
    // Kills a mutant that breaks symlink entrypoint detection in isMainModule (realpathSync).
    expect(symlinkRun.status).toBe(0);
    // Kills a mutant that skips main() when invoked through a symlink.
    expect(symlinkRun.stdout).toBe("latest\n");

    const importOnlyRun = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(SCRIPT_PATH).href)});`],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    // Kills a mutant that drops the isMainModule() guard and executes main() on module import.
    expect(importOnlyRun.status).toBe(0);
    // Kills a mutant that writes a dist-tag to stdout merely from importing release-dist-tag.mjs.
    expect(importOnlyRun.stdout).toBe("");

    const resolveReleaseDistTag = await loadResolver();
    // Kills a mutant that rejects publishConfig: undefined when called programmatically.
    expect(resolveReleaseDistTag({ version: "0.28.0", publishConfig: undefined })).toBe("latest");
    // Kills a mutant that rejects publishConfig.tag: undefined when called programmatically.
    expect(resolveReleaseDistTag({ version: "0.28.0", publishConfig: { access: "public", tag: undefined } })).toBe("latest");
    // Kills a mutant that reads an inherited prototype publishConfig instead of an own property.
    expect(
      resolveReleaseDistTag(Object.assign(Object.create({ publishConfig: { tag: "sj" } }), { version: "0.28.0" })),
    ).toBe("latest");
    // Kills a mutant that reads an inherited prototype publishConfig.tag instead of an own property.
    expect(
      resolveReleaseDistTag({ version: "0.28.0", publishConfig: Object.create({ tag: "sj" }) }),
    ).toBe("latest");
  });

  it("a version that carries a prerelease identifier is refused, whatever its dist-tag", () => {
    const prereleaseCases: readonly { readonly version: string; readonly publishConfig?: Record<string, unknown> }[] = [
      { version: "0.29.0-sj.1", publishConfig: { access: "public", tag: "sj" } },
      { version: "0.29.0-sj.1", publishConfig: { access: "public", tag: "latest" } },
      { version: "0.29.0-alpha.0", publishConfig: { access: "public", tag: "next" } },
      { version: "0.29.0-rc.1", publishConfig: { access: "public" } },
      { version: "0.29.0-0" },
      { version: "1.0.0-beta.1+exp.sha.5114f85", publishConfig: { access: "public", tag: "sj" } },
    ];
    for (const testCase of prereleaseCases) {
      const manifest: Record<string, unknown> = {
        name: "@sentropic/engram",
        version: testCase.version,
      };
      if (testCase.publishConfig !== undefined) {
        manifest.publishConfig = testCase.publishConfig;
      }
      const res = runWithManifest(JSON.stringify(manifest));
      // Kills a mutant that allows any prerelease version regardless of publishConfig.tag.
      expect(res.status).toBe(1);
      // Kills a mutant that prints a dist-tag to stdout before rejecting a prerelease version.
      expect(res.stdout).toBe("");
      // Kills a mutant that exits 1 for an unrelated reason instead of refusing the prerelease version.
      expect(res.stderr).toContain(`release-dist-tag: Refusing non-plain release version ${JSON.stringify(testCase.version)}`);
    }

    const otherNonPlainVersions: readonly unknown[] = [
      "0.29.0+build.1",
      "v0.29.0",
      "01.29.0",
      "0.029.0",
      "0.29.00",
      "0.29",
      "0.29.0.1",
      "0.29.0 ",
      " 0.29.0",
      "0.29.0\n",
      "",
      null,
      29,
    ];
    for (const badVersion of otherNonPlainVersions) {
      const res = runWithManifest(
        JSON.stringify({
          name: "@sentropic/engram",
          version: badVersion,
          publishConfig: { access: "public", tag: "sj" },
        }),
      );
      // Kills a mutant that weakens PLAIN_SEMVER_RE to allow build metadata, leading zeros, v-prefix, whitespace, or non-strings.
      expect(res.status).toBe(1);
      // Kills a mutant that emits stdout for a non-plain version.
      expect(res.stdout).toBe("");
      // Kills a mutant that omits the explicit non-plain version error message.
      expect(res.stderr).toContain("release-dist-tag: Refusing non-plain release version");
    }

    const missingVersion = runWithManifest(
      JSON.stringify({ name: "@sentropic/engram", publishConfig: { access: "public", tag: "sj" } }),
    );
    // Kills a mutant that accepts a manifest with no version field.
    expect(missingVersion.status).toBe(1);
    // Kills a mutant that prints a tag when version is missing.
    expect(missingVersion.stdout).toBe("");
    // Kills a mutant that fails without the non-plain version error when version is omitted.
    expect(missingVersion.stderr).toContain("release-dist-tag: Refusing non-plain release version");
  });

  it("the publish step of the workflow passes the computed dist-tag", () => {
    const workflowText = readFileSync(WORKFLOW_PATH, "utf8");
    const workflow = parseYaml(workflowText) as WorkflowDocument;

    // Kills a mutant that removes the v* tag trigger for root releases.
    expect(workflow.on?.push?.tags).toContain("v*");

    const releaseGuard = workflow.jobs?.["release-guard"];
    // Kills a mutant that removes or weakens the release-guard needs gate.
    expect(releaseGuard?.needs).toEqual(["test", "smoke-test"]);
    // Kills a mutant that removes the v-tag condition on release-guard.
    expect(releaseGuard?.if).toBe("startsWith(github.ref, 'refs/tags/v')");
    const guardRuns = (releaseGuard?.steps ?? []).map((step) => step.run ?? "").join("\n");
    // Kills a mutant that drops the default-branch ancestry check in release-guard.
    expect(guardRuns).toContain('git merge-base --is-ancestor "$GITHUB_SHA" "origin/${RELEASE_BRANCH}"');
    // Kills a mutant that drops the package.json version vs tag equality guard in release-guard.
    expect(guardRuns).toContain('if [ "$PACKAGE_VERSION" != "$TAG_VERSION" ]; then');

    const publishJob = workflow.jobs?.publish;
    // Kills a mutant that disconnects publish from release-guard.
    expect(publishJob?.needs).toBe("release-guard");
    // Kills a mutant that drops the v-tag guard on the publish job.
    expect(publishJob?.if).toBe("startsWith(github.ref, 'refs/tags/v')");
    // Kills a mutant that alters publish job permissions (must remain contents:read and id-token:write only).
    expect(publishJob?.permissions).toEqual({ contents: "read", "id-token": "write" });

    const publishSteps = publishJob?.steps ?? [];
    const publishJobText = JSON.stringify(publishJob);
    // Kills a mutant that introduces a static npm token secret into the Trusted Publishing publish job.
    expect(publishJobText).not.toContain("secrets.");
    // Kills a mutant that introduces NPM_TOKEN or NODE_AUTH_TOKEN into the publish job.
    expect(publishJobText).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);

    const computeIndex = publishSteps.findIndex(
      (step) => typeof step.run === "string" && step.run.includes("scripts/release-dist-tag.mjs"),
    );
    const publishIndex = publishSteps.findIndex((step) => step.name === "Publish to npm");
    // Kills a mutant that omits the dist-tag computation step from the publish job.
    expect(computeIndex).toBeGreaterThanOrEqual(0);
    // Kills a mutant that removes or renames the Publish to npm step.
    expect(publishIndex).toBeGreaterThan(computeIndex);

    const computeStep = publishSteps[computeIndex]!;
    const publishStep = publishSteps[publishIndex]!;
    // Kills a mutant that omits the step id required to wire outputs into Publish to npm env.
    expect(typeof computeStep.id).toBe("string");
    // Kills a mutant that uses an empty step id on the compute step.
    expect((computeStep.id ?? "").length).toBeGreaterThan(0);
    // Kills a mutant that interpolates a GitHub Actions expression into the compute step shell script.
    expect(computeStep.run ?? "").not.toContain("${{");
    // Kills a mutant that omits fail-closed shell flags in the compute step.
    expect(computeStep.run ?? "").toContain("set -euo pipefail");

    const expectedOutputExpr = `\${{ steps.${computeStep.id}.outputs.tag }}`;
    // Kills a mutant that fails to pass the computed dist-tag to Publish to npm through env.
    expect(publishStep.env).toEqual({ RELEASE_DIST_TAG: expectedOutputExpr });
    // Kills a mutant that interpolates ${{ ... }} directly into the Publish to npm shell script.
    expect(publishStep.run ?? "").not.toContain("${{");
    // Kills a mutant that keeps a bare `npm publish` without passing `--tag`.
    expect(publishStep.run ?? "").toContain('--tag="$RELEASE_DIST_TAG"');
    // Kills a mutant that drops fail-closed shell flags on the Publish to npm step.
    expect(publishStep.run ?? "").toContain("set -euo pipefail");

    const runWorkflowPublishFlow = (manifest: Record<string, unknown>) =>
      withTempDir("engram-wf-publish-", (dir) => {
        mkdirSync(join(dir, "scripts"), { recursive: true });
        copyFileSync(SCRIPT_PATH, join(dir, "scripts", "release-dist-tag.mjs"));
        writeFileSync(join(dir, "package.json"), JSON.stringify(manifest), "utf8");
        const githubOutput = join(dir, "github_output");
        writeFileSync(githubOutput, "", "utf8");
        const binDir = join(dir, "bin");
        mkdirSync(binDir, { recursive: true });
        const npmLog = join(dir, "npm-argv.json");
        const stubEnv = writeNpmStub(binDir, npmLog);

        const computeRun = spawnSync("bash", ["-c", computeStep.run ?? ""], {
          cwd: dir,
          encoding: "utf8",
          env: {
            ...process.env,
            ...stubEnv,
            GITHUB_OUTPUT: githubOutput,
          },
        });
        const outputs = parseGithubOutput(readFileSync(githubOutput, "utf8"));
        if (computeRun.status !== 0) {
          return {
            computeStatus: computeRun.status,
            outputs,
            publishStatus: null as number | null,
            npmArgv: existsSync(npmLog) ? (JSON.parse(readFileSync(npmLog, "utf8")) as string[]) : null,
          };
        }

        const publishRun = spawnSync("bash", ["-c", publishStep.run ?? ""], {
          cwd: dir,
          encoding: "utf8",
          env: {
            ...process.env,
            ...stubEnv,
            RELEASE_DIST_TAG: outputs.tag ?? "",
          },
        });
        return {
          computeStatus: computeRun.status,
          outputs,
          publishStatus: publishRun.status,
          npmArgv: existsSync(npmLog) ? (JSON.parse(readFileSync(npmLog, "utf8")) as string[]) : null,
        };
      });

    const sjFlow = runWorkflowPublishFlow({
      name: "@sentropic/engram",
      version: "0.29.0",
      publishConfig: { access: "public", tag: "sj" },
    });
    // Kills a mutant in the compute step script that fails on a valid sj checkpoint manifest.
    expect(sjFlow.computeStatus).toBe(0);
    // Kills a mutant in the compute step script that writes the wrong output key or value to GITHUB_OUTPUT.
    expect(sjFlow.outputs).toEqual({ tag: "sj" });
    // Kills a mutant in the Publish to npm script that fails when RELEASE_DIST_TAG is valid.
    expect(sjFlow.publishStatus).toBe(0);
    // Kills a mutant in Publish to npm that drops --tag or passes latest instead of the computed sj dist-tag.
    expect(sjFlow.npmArgv).toEqual(["publish", "--tag=sj"]);

    const latestFlow = runWorkflowPublishFlow({
      name: "@sentropic/engram",
      version: "0.28.0",
      publishConfig: { access: "public" },
    });
    // Kills a mutant in the compute step script that breaks stable releases without publishConfig.tag.
    expect(latestFlow.computeStatus).toBe(0);
    // Kills a mutant in the compute step script that fails to output tag=latest for stable releases.
    expect(latestFlow.outputs).toEqual({ tag: "latest" });
    // Kills a mutant in Publish to npm that breaks stable releases.
    expect(latestFlow.publishStatus).toBe(0);
    // Kills a mutant in Publish to npm that does not pass --tag=latest for a stable version.
    expect(latestFlow.npmArgv).toEqual(["publish", "--tag=latest"]);

    const prereleaseFlow = runWorkflowPublishFlow({
      name: "@sentropic/engram",
      version: "0.29.0-sj.1",
      publishConfig: { access: "public", tag: "sj" },
    });
    // Kills a mutant in the compute step that ignores release-dist-tag.mjs non-zero exit on a prerelease.
    expect(prereleaseFlow.computeStatus).toBe(1);
    // Kills a mutant in the compute step that still writes tag=... to GITHUB_OUTPUT after refusal.
    expect(prereleaseFlow.outputs).toEqual({});
    // Kills a mutant that invokes npm publish despite a refused prerelease version.
    expect(prereleaseFlow.npmArgv).toBeNull();

    withTempDir("engram-wf-failclosed-", (dir) => {
      mkdirSync(join(dir, "scripts"), { recursive: true });
      const githubOutput = join(dir, "github_output");
      writeFileSync(githubOutput, "", "utf8");
      const binDir = join(dir, "bin");
      mkdirSync(binDir, { recursive: true });
      const npmLog = join(dir, "npm-argv.json");
      const stubEnv = writeNpmStub(binDir, npmLog);

      writeFileSync(join(dir, "scripts", "release-dist-tag.mjs"), 'process.stdout.write("");\n', "utf8");
      const emptyCompute = spawnSync("bash", ["-c", computeStep.run ?? ""], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ...stubEnv, GITHUB_OUTPUT: githubOutput },
      });
      // Kills a mutant that removes `test -n "$tag"` from the compute step when stdout is empty.
      expect(emptyCompute.status).not.toBe(0);
      // Kills a mutant that writes an empty tag= line to GITHUB_OUTPUT when stdout is empty.
      expect(readFileSync(githubOutput, "utf8")).toBe("");

      writeFileSync(join(dir, "scripts", "release-dist-tag.mjs"), 'process.stdout.write("sj\\n"); process.exit(1);\n', "utf8");
      const failingWithOutput = spawnSync("bash", ["-c", computeStep.run ?? ""], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ...stubEnv, GITHUB_OUTPUT: githubOutput },
      });
      // Kills a mutant that drops `set -e` in the compute step when the script prints text and exits non-zero.
      expect(failingWithOutput.status).not.toBe(0);
      // Kills a mutant that still writes GITHUB_OUTPUT when the script exits non-zero after printing.
      expect(readFileSync(githubOutput, "utf8")).toBe("");

      const emptyEnvPublish = spawnSync("bash", ["-c", publishStep.run ?? ""], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, ...stubEnv, RELEASE_DIST_TAG: "" },
      });
      // Kills a mutant that removes `test -n "$RELEASE_DIST_TAG"` from the Publish to npm step.
      expect(emptyEnvPublish.status).not.toBe(0);
      // Kills a mutant that still executes npm publish when RELEASE_DIST_TAG is empty.
      expect(existsSync(npmLog)).toBe(false);

      const envWithoutTag: NodeJS.ProcessEnv = { ...process.env, ...stubEnv };
      delete envWithoutTag.RELEASE_DIST_TAG;
      const unsetEnvPublish = spawnSync("bash", ["-c", publishStep.run ?? ""], {
        cwd: dir,
        encoding: "utf8",
        env: envWithoutTag,
      });
      // Kills a mutant that drops `set -u` / empty-check when RELEASE_DIST_TAG is unset.
      expect(unsetEnvPublish.status).not.toBe(0);
      // Kills a mutant that still executes npm publish when RELEASE_DIST_TAG is unset.
      expect(existsSync(npmLog)).toBe(false);
    });
  });
});
