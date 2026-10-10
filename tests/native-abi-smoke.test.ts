import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

// F3 RED baseline: scripts/check-native-abi.mjs does not exist yet, so the
// import below fails and both cases are red.
import { classifyNativeLoadError } from "../scripts/check-native-abi.mjs";

describe("native ABI smoke", () => {
  it("a load error naming another NODE_MODULE_VERSION is classified ABI_MISMATCH and a missing module MODULE_MISSING", () => {
    const abiMismatch = new Error(
      "The module was compiled against a different Node.js version using NODE_MODULE_VERSION 115. " +
        "This version of Node.js requires NODE_MODULE_VERSION 127.",
    );
    expect(classifyNativeLoadError(abiMismatch)).toBe("ABI_MISMATCH");

    const dlopenFailed = Object.assign(new Error("dlopen failed"), { code: "ERR_DLOPEN_FAILED" });
    expect(classifyNativeLoadError(dlopenFailed)).toBe("ABI_MISMATCH");

    const missingRequire = Object.assign(new Error("Cannot find module 'fs-ext'"), {
      code: "MODULE_NOT_FOUND",
    });
    expect(classifyNativeLoadError(missingRequire)).toBe("MODULE_MISSING");

    const missingImport = Object.assign(new Error("Cannot find package 'fs-ext'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    expect(classifyNativeLoadError(missingImport)).toBe("MODULE_MISSING");
  });

  it("the smoke verdict matches the platform: exit 0 with both addons loaded and the flock in fdinfo on Linux, PLATFORM_UNSUPPORTED elsewhere", async () => {
    const result = await new Promise<{ code: number; out: string }>((resolve) => {
      execFile(
        process.execPath,
        ["scripts/check-native-abi.mjs"],
        { timeout: 120000 },
        (error, stdout, stderr) => {
          resolve({
            code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
            out: `${stdout}\n${stderr}`,
          });
        },
      );
    });
    if (process.platform === "linux") {
      expect(result.code).toBe(0);
      expect(result.out).toContain("better-sqlite3=loaded");
      expect(result.out).toContain("fs-ext=loaded");
      expect(result.out).toContain("sqlite_version=");
      expect(result.out).toMatch(/lock:/i);
    } else {
      expect(result.code).not.toBe(0);
      expect(result.out).toContain("PLATFORM_UNSUPPORTED");
    }
  }, 120000);
});
