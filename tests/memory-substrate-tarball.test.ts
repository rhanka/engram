/**
 * Isolated tarball acceptance for the public memory substrate entry
 * (amendment §5.7, binding §10.3; design note class A, M2/M10).
 *
 * - Executes the committed Node-only runner
 *   (`scripts/substrate-tarball-acceptance.mjs`, wired as
 *   `npm run test:substrate-tarball`) against a packed tarball installed in
 *   an isolated consumer directory. The runner cleans its tarball and
 *   consumer directories itself.
 * - Unit-tests the runner's closure scanner with one discriminating
 *   mutation per family: a direct `pg-native` dependency, a transitively
 *   reachable `.node` addon, an unresolved computed import, and
 *   `binding.gyp`/lifecycle scripts — plus a clean fixture with no
 *   findings.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  fatalFindings,
  scanInstalledClosure,
} from "../scripts/substrate-tarball-acceptance.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runner = join(root, "scripts", "substrate-tarball-acceptance.mjs");

describe("substrate tarball acceptance (installed consumer, M10)", () => {
  it("pins every third-party consumer dependency to the root lockfile version and integrity", () => {
    const consumer = JSON.parse(readFileSync(join(root, "scripts/fixtures/substrate-consumer/package-lock.json"), "utf8"));
    const repository = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    const dependencies = Object.entries(consumer.packages)
      .filter(([path]) => path !== "" && path !== "node_modules/@sentropic/engram");
    expect(dependencies.length).toBeGreaterThan(0);
    for (const [path, entry] of dependencies) {
      const pinned = repository.packages[path];
      expect(pinned, `${path} must exist in the root lockfile`).toBeDefined();
      expect(entry, `${path} must match the root lockfile`).toMatchObject({
        version: pinned.version,
        integrity: pinned.integrity,
      });
    }
  });

  it("packs, installs offline, and accepts the installed entry", { timeout: 240_000 }, () => {
    const output = execFileSync(process.execPath, [runner], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(output).toMatch("tarball-acceptance OK @sentropic/engram@0.21.0");
    expect(output).toMatch("tarball-acceptance closure ./memory-substrate: no fatal findings");
    expect(output).toMatch("installed semantic corpus: passed");
    expect(output).toMatch("installed type inventory: 63 types, 2 values; strict compilation passed");
    expect(output).toMatch("locked consumer: npm ci --offline");
  });
});

describe("installed closure scanner mutations (M2)", () => {
  function fixture(files) {
    const dir = mkdtempSync(join(tmpdir(), "substrate-scanner-fixture-"));
    for (const [relative, content] of Object.entries(files)) {
      const target = join(dir, relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "scanner-fixture", version: "0.0.0" }));
    return dir;
  }

  it("reports a direct pg-native dependency", () => {
    const dir = fixture({ "entry.js": `require("pg-native");\nmodule.exports = 1;\n` });
    try {
      const findings = scanInstalledClosure([join(dir, "entry.js")], dir);
      expect(findings.some((finding) => finding.kind === "forbidden-package" && finding.specifier === "pg-native")).toBe(true);
      expect(fatalFindings(findings).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["import", "require"])("resolves %s conditions and dependencies relative to each importer", (condition) => {
    const dir = fixture({
      "entry.js": condition === "import" ? `import "outer";` : `require("outer");`,
      "node_modules/outer/package.json": JSON.stringify({ name: "outer", exports: { import: "./esm.js", require: "./cjs.cjs" } }),
      "node_modules/outer/esm.js": `import "nested";`,
      "node_modules/outer/cjs.cjs": `require("nested");`,
      "node_modules/nested/package.json": JSON.stringify({ name: "nested", main: "index.js" }),
      "node_modules/nested/index.js": `module.exports = {};`,
      "node_modules/outer/node_modules/nested/package.json": JSON.stringify({ name: "nested", exports: { [condition]: "./index.js" } }),
      "node_modules/outer/node_modules/nested/index.js": `require("./addon.node");`,
      "node_modules/outer/node_modules/nested/addon.node": "",
    });
    try {
      expect(fatalFindings(scanInstalledClosure([join(dir, "entry.js")], dir)).some((finding) => finding.kind === "native-addon")).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("uses the exact ESM relative target even when a suffixed decoy exists", () => {
    const dir = fixture({
      "entry.js": `import "./actual.js";`,
      "actual.js": `import "pg-native";`,
      "actual.js.js": `export const decoy = true;`,
    });
    try { expect(fatalFindings(scanInstalledClosure([join(dir, "entry.js")], dir)).some((finding) => finding.kind === "forbidden-package")).toBe(true); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([`import("pg-" + driver)`, `require("pg-" + driver)`, "import(`pg-${driver}`)"])("rejects expression target %s for every entry", (expression) => {
    const dir = fixture({ "entry.js": `${expression};` });
    try {
      const findings = scanInstalledClosure([join(dir, "entry.js")], dir);
      expect(findings.some((finding) => finding.kind === "computed-target")).toBe(true);
      expect(fatalFindings(findings).length).toBeGreaterThan(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects gypfile:true without a build file or lifecycle script", () => {
    const dir = fixture({
      "entry.js": `require("metadata-native");`,
      "node_modules/metadata-native/package.json": JSON.stringify({ name: "metadata-native", main: "index.js", gypfile: true }),
      "node_modules/metadata-native/index.js": `module.exports = {};`,
    });
    try { expect(fatalFindings(scanInstalledClosure([join(dir, "entry.js")], dir)).length).toBeGreaterThan(0); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects gypfile:true on the published package itself", () => {
    const dir = fixture({
      "node_modules/published/package.json": JSON.stringify({ name: "published", gypfile: true }),
      "node_modules/published/entry.js": `export const value = 1;`,
    });
    try { expect(fatalFindings(scanInstalledClosure([join(dir, "node_modules/published/entry.js")], dir)).length).toBeGreaterThan(0); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("reports a transitively reachable native addon", () => {
    const dir = fixture({
      "entry.js": `require("./mid.js");\nmodule.exports = 1;\n`,
      "mid.js": `require("./native.node");\nmodule.exports = 2;\n`,
      "native.node": "",
    });
    try {
      const findings = scanInstalledClosure([join(dir, "entry.js")], dir);
      expect(findings.some((finding) => finding.kind === "native-addon")).toBe(true);
      expect(fatalFindings(findings).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports an unresolved computed import", () => {
    const dir = fixture({ "entry.js": `const name = process.argv[2];\nrequire(name);\nmodule.exports = 3;\n` });
    try {
      const findings = scanInstalledClosure([join(dir, "entry.js")], dir);
      expect(findings.some((finding) => finding.kind === "computed-target")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports binding.gyp and lifecycle scripts of a reached package", () => {
    const dir = fixture({ "entry.js": `require("fake-native");\nmodule.exports = 4;\n` });
    const packageDir = join(dir, "node_modules", "fake-native");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({
      name: "fake-native",
      version: "1.0.0",
      main: "index.js",
      scripts: { install: "node-gyp rebuild" },
    }));
    writeFileSync(join(packageDir, "binding.gyp"), "{}\n");
    writeFileSync(join(packageDir, "index.js"), "module.exports = {};\n");
    try {
      const findings = scanInstalledClosure([join(dir, "entry.js")], dir);
      expect(findings.filter((finding) => finding.kind === "lifecycle-scripts").length).toBeGreaterThanOrEqual(2);
      expect(fatalFindings(findings).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds nothing in a clean static fixture", () => {
    const dir = fixture({
      "entry.js": `import { value } from "./mid.js";\nexport const entry = value;\n`,
      "mid.js": `export const value = 42;\n`,
    });
    try {
      expect(scanInstalledClosure([join(dir, "entry.js")], dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
