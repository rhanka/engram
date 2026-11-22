#!/usr/bin/env node
// Checkpoint release dist-tag resolver (plan/10 Row 7 · E-REL-J, PD-11, PD-16).
// Reads package.json, refuses non-plain X.Y.Z versions (including prereleases),
// and prints publishConfig.tag or "latest" when publishConfig.tag is absent.
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DIST_TAG = "latest";
const PLAIN_SEMVER_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const DIST_TAG_RE = /^[a-z][a-z0-9._-]*$/;
const VERSION_LOOKALIKE_TAG_RE = /^v?\d+(?:\.\d+)*(?:-.+)?$/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveReleaseDistTag(manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error("package.json must contain a JSON object.");
  }
  const version = Object.hasOwn(manifest, "version") ? manifest.version : undefined;
  if (typeof version !== "string" || !PLAIN_SEMVER_RE.test(version)) {
    throw new Error(
      `Refusing non-plain release version ${JSON.stringify(version)}: expected plain X.Y.Z with no prerelease identifier or build metadata.`,
    );
  }
  if (!Object.hasOwn(manifest, "publishConfig") || manifest.publishConfig === undefined) {
    return DEFAULT_DIST_TAG;
  }
  const { publishConfig } = manifest;
  if (!isPlainObject(publishConfig)) {
    throw new Error("publishConfig must be a JSON object when present.");
  }
  if (!Object.hasOwn(publishConfig, "tag") || publishConfig.tag === undefined) {
    return DEFAULT_DIST_TAG;
  }
  const { tag } = publishConfig;
  if (typeof tag !== "string" || !DIST_TAG_RE.test(tag) || VERSION_LOOKALIKE_TAG_RE.test(tag)) {
    throw new Error(`Refusing invalid publishConfig.tag ${JSON.stringify(tag)}.`);
  }
  return tag;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length > 1) {
    throw new Error(`Expected at most one manifest path argument, received ${argv.length}.`);
  }
  if (argv.length === 1 && argv[0].length === 0) {
    throw new Error("Manifest path argument must not be empty.");
  }
  const manifestPath = argv.length === 1 ? resolve(argv[0]) : resolve(process.cwd(), "package.json");
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read package manifest at ${manifestPath}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in package manifest at ${manifestPath}: ${error.message}`);
  }
  process.stdout.write(`${resolveReleaseDistTag(parsed)}\n`);
}

function isMainModule() {
  if (process.argv[1] == null) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    console.error(`release-dist-tag: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
