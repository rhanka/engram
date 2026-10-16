/** Every EVOL interface member name and optional flag is locked. The backup
 * restore signature also binds the nested target/result for durable restore. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createLogicalMemoryBackupV1 } from "../engram-memory/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = readFileSync(join(ROOT, "spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md"), "utf8");
const CODE = ["contracts/index.ts", "logical-backup.ts"]
  .map((path) => readFileSync(join(ROOT, "engram-memory", path), "utf8")).join("\n");
const SPEC_CODE = [...SPEC.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]).join("\n");

function interfaces(source: string): Map<string, ts.InterfaceDeclaration> {
  const parsed = ts.createSourceFile("declarations.ts", source, ts.ScriptTarget.Latest, true);
  return new Map(parsed.statements.filter(ts.isInterfaceDeclaration).map((node) => [node.name.text, node]));
}
const specInterfaces = interfaces(SPEC_CODE);
const codeInterfaces = interfaces(CODE);
// These are prose ("interface graphify", "interface so"), never declarations.
const PROSE_FALSE_POSITIVES = new Set(["graphify", "so"]);
const mentionedNames = [...SPEC.matchAll(/\binterface\s+(\w+)/g)].map((match) => match[1]!);

function memberFlags(node: ts.InterfaceDeclaration): Array<[string, boolean]> {
  return node.members.map((member): [string, boolean] => {
    if (!member.name) throw new Error(`unnamed member in ${node.name.text}`);
    return [member.name.getText(), !!member.questionToken];
  }).sort(([a], [b]) => a.localeCompare(b));
}

describe("EVOL declarations match the implemented contracts", () => {
  it("covers every declared interface, excluding exactly the two prose false positives", () => {
    expect(new Set(mentionedNames.filter((name) => PROSE_FALSE_POSITIVES.has(name))))
      .toEqual(PROSE_FALSE_POSITIVES);
    expect(new Set(mentionedNames.filter((name) => !PROSE_FALSE_POSITIVES.has(name))))
      .toEqual(new Set(specInterfaces.keys()));
    expect(specInterfaces.size).toBeGreaterThanOrEqual(101);
  });

  it.each([...specInterfaces.keys()])("%s declares exactly the implemented members and optionality", (name) => {
    const code = codeInterfaces.get(name);
    expect(code, `${name}: implementation must exist`).toBeDefined();
    expect(memberFlags(specInterfaces.get(name)!)).toEqual(memberFlags(code!));
  });

  it("MemoryBackupPort.restoreLogical binds the durable target and complete restore result", () => {
    const signature = (node: ts.InterfaceDeclaration): string => {
      const member = node.members.find((member) => member.name?.getText() === "restoreLogical");
      if (!member) throw new Error("restoreLogical missing");
      return ts.createPrinter({ removeComments: true })
        .printNode(ts.EmitHint.Unspecified, member, node.getSourceFile()).replace(/\s/g, "");
    };
    expect(signature(specInterfaces.get("MemoryBackupPort")!))
      .toBe(signature(codeInterfaces.get("MemoryBackupPort")!));
  });

  it("the backup factory is the implemented store-scoped constructor", () => {
    expect(SPEC.includes("createLogicalMemoryBackupV1(dependencies: LogicalMemoryBackupDependenciesV1)")).toBe(true);
    expect(SPEC.includes("createMemoryBackupPort("), "stale engine-scoped factory name must be gone").toBe(false);
    expect(typeof createLogicalMemoryBackupV1).toBe("function");
  });
});
