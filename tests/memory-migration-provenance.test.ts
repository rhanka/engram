import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INTAKE_PINS, gitBlobSha, readPinnedIntake } from "./fixtures/memory-pinned-intakes.js";

// This optional history audit is separate from the always-on, offline matrix.
// Never let a partial clone fetch missing objects during the availability probe.
const gitOptions = {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
};

describe("pinned-intake source provenance against optional git history", () => {
  it.for(INTAKE_PINS)("pin %s matches every original blob byte for byte and by git blob SHA", (pin, { skip }) => {
    const available = spawnSync("git", ["cat-file", "-e", `${pin}^{commit}`], { ...gitOptions, stdio: "ignore" });
    if (available.error) throw available.error;
    if (available.status !== 0) {
      console.info(`${pin} — non exécuté : historique absent`);
      skip("non exécuté : historique absent");
    }
    const fixture = readPinnedIntake(pin);
    expect(fixture.pin).toBe(pin);
    const files = execFileSync("git", ["ls-tree", "-r", "--name-only", pin], { ...gitOptions, encoding: "utf8" }).trim().split("\n");
    const intakePaths = files.filter((path) => /^tests\/memory-(admission|recall|factory|cli)\.test\.ts$/.test(path)
      || ["tests/storage-postgres-time-window.test.ts", "tests/storage-postgres-readback.test.ts",
        "tests/memory-trusttier-roundtrip.test.ts", "tests/memory-operational-roundtrip.test.ts"].includes(path));
    expect(fixture.sources.filter(({ path }) => path.startsWith("tests/")).map(({ path }) => path)).toEqual(intakePaths);
    if (!files.includes("src/memory-admission.ts")) {
      expect(files.filter((path) => /^src\/memory-/.test(path))).toEqual([]);
    }
    for (const { path, blobSha, content } of fixture.sources) {
      const originalSha = execFileSync("git", ["rev-parse", `${pin}:${path}`], { ...gitOptions, encoding: "utf8" }).trim();
      const original = execFileSync("git", ["show", `${pin}:${path}`], { ...gitOptions, maxBuffer: 8_388_608 });
      expect(blobSha, path).toBe(originalSha);
      expect(gitBlobSha(original), path).toBe(blobSha);
      expect(Buffer.from(content, "utf8").equals(original), path).toBe(true);
    }
  });
});
