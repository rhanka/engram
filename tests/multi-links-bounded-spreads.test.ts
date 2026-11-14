import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const evidenceFiles = [
  "src/graph.ts", "src/relation-replay.ts", "src/storage/edge-contribution.ts",
  "src/storage/sqlite.ts", "src/storage/postgres.ts", "src/storage/neo4j.ts",
  "src/storage/spanner.ts", "src/extract-git.ts",
];

// Exact line fingerprints, including multiplicity. SQLite binds one fixed-width
// row per call (8 edge columns, 10 node columns), independent of batch size.
const fixedSqlRows = [
  "src/storage/sqlite.ts:db.prepare(EDGE_UPSERT_SQL).run(...edgeValues(slug, identity.source, identity.target, merged));",
  "src/storage/sqlite.ts:for (const row of nodeRows) nodeUpsert.run(...row);",
  "src/storage/sqlite.ts:else for (const row of edgeRows) edgeUpsert.run(...row);",
  "src/storage/sqlite.ts:upsert.run(...row);",
  "src/storage/sqlite.ts:upsert.run(...row);",
];
// A-S1 explicitly leaves this origin/main call outside the evidence workstream.
const outOfScope = [
  "src/extract-git.ts:edges.push(...readModifiesEdges(repo, repo, info.sha, repoKeyStr, options.fileNodeIds));",
];

function spreadCallLines(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines = text.split(/\r?\n/), found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments?.some(ts.isSpreadElement)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
      found.push(file + ":" + lines[line].trim());
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("A-S1 evidence spread grep gate", () => {
  it("has zero input-sized spread calls beyond the exact SQL rows and explicit out-of-scope call", () => {
    // Parse the grep candidates so multiline calls are checked while array and
    // object literals, rest parameters and declarations remain allowed.
    const found = evidenceFiles.flatMap(file => {
      const text = readFileSync(file, "utf8");
      return /\.\.\./.test(text) ? spreadCallLines(file, text) : [];
    });
    expect(found.sort()).toEqual([...fixedSqlRows, ...outOfScope].sort());
  });

  it("detects arbitrary calls, push, extrema and multiline argument spreads without matching literals", () => {
    const text = "f(...xs);\narr.push(...xs);\nMath.max(...xs);\nMath.min(\n...xs\n);\nconst a = [...xs];\nconst b = {...attrs};\nfunction g(...args) {}";
    expect(spreadCallLines("probe.ts", text)).toEqual([
      "probe.ts:f(...xs);", "probe.ts:arr.push(...xs);", "probe.ts:Math.max(...xs);", "probe.ts:Math.min(",
    ]);
  });
});
