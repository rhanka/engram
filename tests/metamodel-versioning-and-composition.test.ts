import { describe, expect, it } from "vitest";

describe("metamodel versioning and composition (Lot 0.3)", () => {
  describe("round-3 whole-document diff, data tables, default-breaking, and R2 closures", () => {
    describe("round-5 single entry: each public API projects every document once, type-checks it against the closed schema and hands on a branded document", () => {
      it("makes a raw, a JSON-shaped or a merely projected document a compile error wherever a branded one is required", async () => {
        const ts = (await import("typescript")).default;
        const { fileURLToPath } = await import("node:url");
        const root = fileURLToPath(new URL("..", import.meta.url));
        const proofFile = `${root}tests/__semver_gate_brand_proof__.ts`;
        const proof = [
          'import type { JsonValue } from "../src/json-value.js";',
          'import { checkDocument, classifyProjectedDocuments, ROOT_FIELDS, type Projected, type ProjectedDocument, type RuleContext } from "../src/metamodel/semver-gate.js";',
          'import type { ValidationSink } from "../src/metamodel/validate-common.js";',
          "declare const raw: Record<string, unknown>;",
          "declare const jsonShaped: { readonly [key: string]: JsonValue };",
          "declare const projected: Projected;",
          "declare const admitted: ProjectedDocument;",
          "declare const sink: ValidationSink;",
          'const nodesOnly = checkDocument(projected, sink, ["node_types"])!;',
          'const requiredOnly = checkDocument(projected, sink, ["metamodel_version", "lineage", "id", "version", "node_types"])!;',
          "export const controls = [classifyProjectedDocuments(checkDocument(projected, sink)!, admitted), checkDocument(admitted, sink), checkDocument(nodesOnly, sink)];",
          "// @ts-expect-error a raw parent cannot reach the classifier",
          "classifyProjectedDocuments(raw, admitted);",
          "// @ts-expect-error a raw candidate cannot reach the classifier",
          "classifyProjectedDocuments(admitted, raw);",
          "// @ts-expect-error JSON-shaped data that never crossed the projector is not a projected document",
          "classifyProjectedDocuments(jsonShaped, admitted);",
          "// @ts-expect-error a projected document the closed schema has not checked cannot reach the classifier",
          "classifyProjectedDocuments(projected, admitted);",
          "// @ts-expect-error a document checked on some root fields only is not a fully checked one",
          "classifyProjectedDocuments(nodesOnly, admitted);",
          "// @ts-expect-error not even on every root field the model requires: the optional ones went unchecked",
          "classifyProjectedDocuments(requiredOnly, admitted);",
          "// @ts-expect-error nor is the result of a check over an empty field list",
          "classifyProjectedDocuments(checkDocument(projected, sink, [])!, admitted);",
          "// @ts-expect-error a raw document cannot skip the projector",
          "checkDocument(raw, sink);",
          "// @ts-expect-error nor can JSON-shaped data",
          "checkDocument(jsonShaped, sink);",
          "// @ts-expect-error the brand cannot be forged by a structurally identical value",
          "export const forged: ProjectedDocument = { ...jsonShaped };",
          "// @ts-expect-error an exported rule reads normalised documents only: a raw parent does not fit its context",
          'export const rawParentContext: Pick<RuleContext, "oldDoc"> = { oldDoc: raw };',
          "// @ts-expect-error nor does a raw candidate",
          'export const rawCandidateContext: Pick<RuleContext, "newDoc"> = { newDoc: raw };',
          "// @ts-expect-error a check over a list of fields is never the full check, not even over every root field of the schema",
          "classifyProjectedDocuments(checkDocument(projected, sink, ROOT_FIELDS)!, admitted);",
          "// @ts-expect-error a document checked on one field is not a document checked on two",
          'export const moreFields: Projected<"node_types" | "registries"> = nodesOnly;',
        ];
        const config = ts.parseJsonConfigFileContent(ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile).config, ts.sys, root);
        const options = { ...config.options, noEmit: true, rootDir: root };
        const diagnose = (lines: readonly string[]) => {
          const text = lines.join("\n");
          const host = ts.createCompilerHost(options);
          const readSource = host.getSourceFile.bind(host);
          host.getSourceFile = (name, version, ...rest) => (name === proofFile ? ts.createSourceFile(name, text, version) : readSource(name, version, ...rest));
          host.fileExists = (name) => name === proofFile || ts.sys.fileExists(name);
          host.readFile = (name) => (name === proofFile ? text : ts.sys.readFile(name));
          const program = ts.createProgram({ rootNames: [proofFile], options, host });
          const source = program.getSourceFile(proofFile)!;
          return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
            .map((d) => ({ line: source.getLineAndCharacterOfPosition(d.start ?? 0).line + 1, code: d.code }));
        };
        // With the directives, the proof compiles: each one is consumed by a real error, none is left unused (TS2578).
        expect(diagnose(proof)).toEqual([]);
        // Without them, exactly those fourteen lines fail to compile: an argument no signature takes (TS2345, TS2769
        // on the overloaded check) or an assignment (TS2322 / TS2741).
        const bare = proof.map((line) => (line.startsWith("// @ts-expect-error") ? "" : line));
        const errors = diagnose(bare);
        expect(errors.map((error) => error.line)).toEqual([13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39]);
        expect(errors.every((error) => [2345, 2769, 2322, 2741].includes(error.code))).toBe(true);
      }, 120_000);
    });
  });
});
