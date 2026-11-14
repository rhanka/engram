import { describe, expect, it } from "vitest";
import { checkFencedBashCommands, fencedShellCommands, readSkill, skillDocuments } from "./helpers/multi-links-skills.js";

describe("actual shipped skill command syntax", () => {
  for (const path of skillDocuments) {
    const skill = readSkill(path);
    if (!path.endsWith("skill-windows.md")) it(path + " passes detection and multi-links commands through Bash and node --check", () => {
      // Scope is the detection boundary and the consumers migrated by Lot A.
      const count = checkFencedBashCommands(skill, command => /\bdetect\(|loadGraphFromData|pushToNeo4j|const question\s*=|const aTerm\s*=|const term\s*=/.test(command));
      expect(count).toBeGreaterThanOrEqual(5);
    });
    if (/skill-(droid|opencode|windows)\.md$/.test(path)) it(path + " keeps detection, prose and semantic preparation in separate Markdown blocks", () => {
      const workflow = skill.text.slice(skill.text.indexOf("### Step 2 - Detect files"), skill.text.indexOf("### Step 3 - Extract entities"));
      const blocks = fencedShellCommands({ text: workflow });
      const detection = blocks.filter(({ command }) => /\bdetect\('INPUT_PATH'\)/.test(command));
      expect(detection).toHaveLength(1);
      expect(detection[0].command.trim().split("\n")).toHaveLength(5);
      expect(detection[0].command).not.toContain("### Step 2.5");
      expect(detection[0].command).toMatch(/^" (?:>|\| Out-File).*\.graphify_detect\.json/m);
      expect(blocks.filter(({ command }) => /const \{ prepareSemanticDetection \}/.test(command))).toHaveLength(1);
      const boundary = skill.text.slice(skill.text.indexOf("console.log(JSON.stringify(result));"), skill.text.indexOf("(async () => {"));
      expect(boundary).not.toContain("\\`");
      expect(boundary).not.toContain('\\"');
    });
  }

  it.each(["> .engram/detect.json", "| cat > .engram/detect.json"])("checks the real -e argument with shell suffix %s", suffix => {
    const command = String.raw`node -e "
const value = \"quoted\";
if (value !== 'quoted') throw new Error('JS must never execute');
" ` + suffix;
    const skill = { path: "shell-regression", text: "```bash\n" + command + "\n```\n" };
    expect(checkFencedBashCommands(skill, () => true)).toBe(1);
    const invalid = { ...skill, text: skill.text.replace("const value =", "const =") };
    expect(() => checkFencedBashCommands(invalid, () => true)).toThrow(/SyntaxError/);
  });
});
