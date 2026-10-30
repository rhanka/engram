import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_RELATIVE = "skills/engram-memory/SKILL.md";
const EXPECTED_SHA256 = "dd4f17695844a65ae10fa7c9b023578f0c9f8688b446e5ba790fbb39f3abfbaf";

function frontmatter(text: string): string {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("skill has no frontmatter block");
  return match[1];
}

describe("engram-memory usage skill (packed)", () => {
  it("ships byte-identical with frontmatter name engram-memory", () => {
    const text = readFileSync(join(root, SKILL_RELATIVE), "utf8");
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(EXPECTED_SHA256);
    expect(frontmatter(text)).toMatch(/^name:\s*engram-memory$/m);
  });

  it("is listed in package files", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { files?: string[] };
    expect(manifest.files ?? []).toContain("skills/engram-memory");
  });

  it("is inside the packed tarball with the exact sha256", { timeout: 240_000 }, () => {
    const directory = mkdtempSync(join(tmpdir(), "engram-memory-skill-"));
    try {
      const env = { ...process.env, npm_config_offline: "true", npm_config_ignore_scripts: "true" };
      const packed = JSON.parse(
        execFileSync("npm", ["pack", "--offline", "--ignore-scripts", "--json", "--pack-destination", directory], {
          cwd: root,
          env,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        }),
      ) as { filename: string }[];
      const tarball = join(directory, packed[0].filename);
      const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      expect(listing.split("\n")).toContain(`package/${SKILL_RELATIVE}`);
      const extracted = execFileSync("tar", ["-xzOf", tarball, `package/${SKILL_RELATIVE}`], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      expect(createHash("sha256").update(extracted, "utf8").digest("hex")).toBe(EXPECTED_SHA256);
      expect(frontmatter(extracted)).toMatch(/^name:\s*engram-memory$/m);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
