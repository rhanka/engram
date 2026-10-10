#!/usr/bin/env node
// F3 image-ABI smoke (FIN §3.6, T-abi1). Node only — no Python, no dependency
// beyond the Node builtins. Every runtime image (CI runner or container) that
// executes the fenced SQLite store runs this at image build time so an ABI,
// platform, architecture or libc mismatch surfaces here instead of at the
// first fenced open.
//
// What it proves, in order:
//   1. runtime identity: Node version, Node ABI (process.versions.modules),
//      platform, arch and libc;
//   2. both native addons (better-sqlite3, fs-ext) resolve exactly as the
//      engram-memory package resolves them and load in this image;
//   3. better-sqlite3 opens :memory: and reports its bundled sqlite_version();
//   4. on Linux: a real kernel flock is taken and visible in
//      /proc/self/fdinfo/<fd> (the G2 evidence). Any other platform exits
//      with PLATFORM_UNSUPPORTED before the lock step: the fenced store is
//      Linux-only (EVOL §5.9).
//
// Exit causes: ABI_MISMATCH (a load error naming NODE_MODULE_VERSION or
// carrying ERR_DLOPEN_FAILED), MODULE_MISSING (any other load failure),
// LOCK_UNPROVEN (flock taken but absent from fdinfo), PLATFORM_UNSUPPORTED.

import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function classifyNativeLoadError(error) {
  const code =
    error !== null && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NODE_MODULE_VERSION") || code === "ERR_DLOPEN_FAILED") {
    return "ABI_MISMATCH";
  }
  return "MODULE_MISSING";
}

function libcRuntime() {
  try {
    return process.report.getReport().header.glibcVersionRuntime ?? "non-glibc";
  } catch {
    return "non-glibc";
  }
}

function fail(cause, detail) {
  console.error(`${cause}${detail ? `: ${detail}` : ""}`);
  process.exitCode = cause === "PLATFORM_UNSUPPORTED" ? 3 : 1;
}

export function runSmoke(targetDirArg = process.argv[2]) {
  const engramPackage = new URL("../engram-memory/package.json", import.meta.url);
  const requireFromEngram = createRequire(engramPackage);

  console.log(
    `node=${process.versions.node} modules=${process.versions.modules} ` +
      `platform=${process.platform} arch=${process.arch} libc=${libcRuntime()}`,
  );

  let betterSqlite3Path;
  let fsExtPath;
  try {
    betterSqlite3Path = requireFromEngram.resolve("better-sqlite3");
  } catch (error) {
    fail(classifyNativeLoadError(error), "better-sqlite3 unresolvable from engram-memory");
    return process.exitCode ?? 1;
  }
  try {
    fsExtPath = requireFromEngram.resolve("fs-ext");
  } catch (error) {
    fail(classifyNativeLoadError(error), "fs-ext unresolvable from engram-memory");
    return process.exitCode ?? 1;
  }

  let Database;
  try {
    const loaded = requireFromEngram("better-sqlite3");
    Database = loaded?.default ?? loaded;
    console.log(`better-sqlite3=loaded ${betterSqlite3Path}`);
  } catch (error) {
    fail(classifyNativeLoadError(error), "better-sqlite3 failed to load");
    return process.exitCode ?? 1;
  }

  let flockSync;
  try {
    const loaded = requireFromEngram("fs-ext");
    flockSync = loaded?.flockSync ?? loaded?.default?.flockSync;
    if (typeof flockSync !== "function") throw new Error("fs-ext exports no flockSync");
    console.log(`fs-ext=loaded ${fsExtPath}`);
  } catch (error) {
    fail(classifyNativeLoadError(error), "fs-ext failed to load");
    return process.exitCode ?? 1;
  }

  try {
    const db = new Database(":memory:");
    const row = db.prepare("select sqlite_version() as v").get();
    console.log(`sqlite_version=${row.v}`);
    db.close();
  } catch (error) {
    fail("MODULE_MISSING", `better-sqlite3 :memory: open failed: ${error instanceof Error ? error.message : String(error)}`);
    return process.exitCode ?? 1;
  }

  if (process.platform !== "linux") {
    fail("PLATFORM_UNSUPPORTED", `the fenced SQLite store requires Linux, running on ${process.platform}`);
    return process.exitCode ?? 1;
  }

  const isTempDir = targetDirArg === undefined;
  const targetDir = targetDirArg ?? mkdtempSync(join(tmpdir(), "native-abi-smoke-"));
  const probeFile = join(targetDir, "abi-smoke.lock");
  let fd;
  let exitCode = 0;
  try {
    fd = openSync(probeFile, "w");
    flockSync(fd, "exnb");
    const fdinfo = readFileSync(`/proc/self/fdinfo/${fd}`, "utf8");
    const lockLine = fdinfo
      .split("\n")
      .find((line) => line.startsWith("lock:") && line.trim() !== "lock:");
    if (!lockLine) {
      fail("LOCK_UNPROVEN", "flock taken but no lock record in /proc/self/fdinfo");
      exitCode = process.exitCode ?? 1;
    } else {
      console.log(`flock=held ${lockLine.trim()} (${probeFile})`);
    }
  } catch (error) {
    if (process.exitCode === undefined || process.exitCode === 0) {
      fail("LOCK_UNPROVEN", error instanceof Error ? error.message : String(error));
    }
    exitCode = process.exitCode ?? 1;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // best effort: the fd is closed on process exit regardless
      }
    }
    try {
      rmSync(probeFile, { force: true });
    } catch {
      // best effort: temp dir removal below still applies for mkdtemp dirs
    }
    if (isTempDir) {
      rmSync(targetDir, { recursive: true, force: true });
    }
  }
  return exitCode;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const code = runSmoke();
  if (code !== 0) {
    process.exit(code);
  }
}
