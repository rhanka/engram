/** Lock EVOL's declared types, signatures, generics and inheritance to code. */
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

function declarations(source: string) {
  const raw = ts.createSourceFile("declarations.ts", source, ts.ScriptTarget.Latest, true);
  const printed = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(raw);
  const parsed = ts.createSourceFile("declarations.ts", printed, ts.ScriptTarget.Latest, true);
  return {
    interfaces: new Map(parsed.statements.filter(ts.isInterfaceDeclaration).map((node) => [node.name.text, node])),
    aliases: new Map(parsed.statements.filter(ts.isTypeAliasDeclaration).map((node) => [node.name.text, node])),
  };
}
const spec = declarations(SPEC_CODE);
const code = declarations(CODE);
const specInterfaces = spec.interfaces;
const codeInterfaces = code.interfaces;
// These are prose ("interface graphify", "interface so"), never declarations.
const PROSE_FALSE_POSITIVES = new Set(["graphify", "so"]);
const mentionedNames = [...SPEC.matchAll(/\binterface\s+(\w+)/g)].map((match) => match[1]!);

/** AST tokens discard trivia, preserving literal contents and signature order.
 * Only the two known local backup import qualifications equal bare contracts;
 * an unrelated import with the same exported name must still fail comparison. */
function normalized(node: ts.Node): string {
  const tokens: Array<[number, string]> = [];
  const visit = (child: ts.Node): void => {
    if (ts.isImportTypeNode(child) && !child.isTypeOf && !child.typeArguments
      && ts.isLiteralTypeNode(child.argument) && ts.isStringLiteral(child.argument.literal)
      && child.argument.literal.text === "./contracts/index.js"
      && child.qualifier && ts.isIdentifier(child.qualifier)
      && ["BackupKeyPort", "BackupObjectPort"].includes(child.qualifier.text)) {
      visit(child.qualifier);
      return;
    }
    const children = child.getChildren();
    if (children.length > 0) children.forEach(visit);
    else tokens.push([child.kind, ts.isStringLiteralLike(child) ? child.text : child.getText()]);
  };
  visit(node);
  return JSON.stringify(tokens);
}

function interfaceShape(node: ts.InterfaceDeclaration) {
  return {
    typeParameters: node.typeParameters?.map(normalized) ?? [],
    heritage: node.heritageClauses?.map(normalized) ?? [],
    // Sorting complete signatures retains overloads, readonly, optionality,
    // nested properties, parameters, return types, call and index signatures.
    members: node.members.map(normalized).sort(),
  };
}

function aliasShape(node: ts.TypeAliasDeclaration) {
  return { typeParameters: node.typeParameters?.map(normalized) ?? [], type: normalized(node.type) };
}

describe("EVOL declarations match the implemented contracts", () => {
  it("covers every declared interface, excluding exactly the two prose false positives", () => {
    expect(new Set(mentionedNames.filter((name) => PROSE_FALSE_POSITIVES.has(name))))
      .toEqual(PROSE_FALSE_POSITIVES);
    expect(new Set(mentionedNames.filter((name) => !PROSE_FALSE_POSITIVES.has(name))))
      .toEqual(new Set(specInterfaces.keys()));
    expect(specInterfaces.size).toBe(105);
    expect(spec.aliases.size).toBe(18);
  });

  it.each([...specInterfaces.keys()])("%s declares exactly the implemented member types, signatures and inheritance", (name) => {
    const code = codeInterfaces.get(name);
    expect(code, `${name}: implementation must exist`).toBeDefined();
    expect(interfaceShape(specInterfaces.get(name)!)).toEqual(interfaceShape(code!));
  });

  it.each([...spec.aliases.keys()])("%s aliases exactly the implemented type", (name) => {
    const implemented = code.aliases.get(name);
    expect(implemented, `${name}: implementation must exist`).toBeDefined();
    expect(aliasShape(spec.aliases.get(name)!)).toEqual(aliasShape(implemented!));
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
