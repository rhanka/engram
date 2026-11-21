import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourcePath = new URL("../src/metamodel-contracts.ts", import.meta.url);
const printer = ts.createPrinter({ removeComments: true });

function readContracts() {
  const source = readFileSync(sourcePath, "utf8");
  return ts.createSourceFile("metamodel-contracts.ts", source, ts.ScriptTarget.Latest);
}

function printSyntax(node: ts.Node, source: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, source).replace(/\s+/g, " ").trim();
}

describe("metamodel contracts", () => {
  it("the module exports exactly the six shared declarations of S0, under their names", () => {
    const source = readContracts();
    const declarations = source.statements.filter((statement) => !ts.isImportDeclaration(statement));
    const shapes = declarations.map((statement) => {
      if (!ts.isTypeAliasDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) {
        throw new Error(`Expected a type declaration, got ${statement.getText(source)}`);
      }
      const name = statement.name.text;
      expect(statement.modifiers?.map((modifier) => modifier.kind), name).toEqual([
        ts.SyntaxKind.ExportKeyword,
      ]);
      expect(statement.typeParameters, name).toBeUndefined();

      if (ts.isTypeAliasDeclaration(statement)) {
        return [name, printSyntax(statement.type, source)] as const;
      }
      return [name, {
        heritage: statement.heritageClauses?.map((clause) => printSyntax(clause, source)) ?? [],
        members: statement.members.map((member) => printSyntax(member, source)),
      }] as const;
    });

    expect(shapes).toHaveLength(6);
    expect(Object.fromEntries(shapes)).toEqual({
      Sha256Digest: "`sha256:${string}`",
      MetamodelVersion: '"engram.metamodel/legacy-v0" | "engram.metamodel/v1"',
      LineageId: '"archi" | "h2a" | "track" | "engram"',
      OntologyTemplateEnvelopeRef: {
        heritage: [],
        members: [
          "readonly lineage: LineageId;",
          "readonly templateId: string;",
          "readonly templateVersion: string;",
          "readonly templateDigestSha256: Sha256Digest;",
        ],
      },
      CrossLineageCompositionPin: {
        heritage: ["extends OntologyTemplateEnvelopeRef"],
        members: ["readonly importAlias: string;"],
      },
      H2AMandateEnvelope: {
        heritage: [],
        members: [
          "readonly mandateId: string;",
          "readonly instance: string;",
          'readonly role: "PRINCIPAL" | "EXECUTIF" | "CONDUCTOR" | "AGENTS" | "CONTROL" | "MANDATAIRE" | null;',
          "readonly scope: string;",
          "readonly rights: readonly string[];",
          "readonly expiresAt?: string;",
          "readonly envelopeDigest: Sha256Digest;",
          "readonly signatures: ReadonlyArray<{ readonly by: string; readonly alg: string; readonly value: string; }>;",
        ],
      },
    });
  });

  it("src/metamodel-contracts.ts takes type-only imports and no import of a runtime module", () => {
    const source = readContracts();
    const imports: string[] = [];
    function collectImports(node: ts.Node): void {
      if (
        ts.isImportDeclaration(node) || ts.isImportTypeNode(node) || ts.isImportEqualsDeclaration(node) ||
        (ts.isExportDeclaration(node) && node.moduleSpecifier) ||
        (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      ) {
        imports.push(node.getText(source));
      }
      ts.forEachChild(node, collectImports);
    }
    collectImports(source);
    expect(imports).toEqual([]);
  });
});
