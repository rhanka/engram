import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

export interface Site { file: string; line: number; owner: string; kind: string; text: string; fingerprint: string; reason?: string }
export interface Allowance { file: string; owner: string; kind: string; fingerprint: string; reason: string; count?: number }
const reserved = new Set(["source", "target", "_src", "_tgt", "relation", "source_file", "source_location", "confidence", "confidence_score", "derivation_method", "derivation_methods", "citations", "evidence_refs", "evidence_observations", "t", "t_end"]);
const insertion = /^(?:add|merge|update)(?:Directed|Undirected)?Edge(?:WithKey)?$/;
const setters = /^(?:set|merge|replace|update|remove)(?:Each)?(?:Directed|Undirected)?EdgeAttributes?$/;
const functionName = (n: ts.Node): string | undefined => {
  if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) return n.name?.getText();
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent)) return n.parent.name.getText();
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isPropertyAssignment(n.parent)) return n.parent.name.getText();
};
function ownerOf(n: ts.Node): string {
  for (let p: ts.Node | undefined = n; p; p = p.parent) { const name = functionName(p); if (name) return name; }
  return "<module>";
}
const member = (n: ts.Expression): string | undefined => ts.isPropertyAccessExpression(n) ? n.name.text : ts.isElementAccessExpression(n) && n.argumentExpression && ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : undefined;
const callName = (n: ts.CallExpression) => ts.isIdentifier(n.expression) ? n.expression.text : member(n.expression);
const keysOf = (n: ts.ObjectLiteralExpression): Set<string> => new Set(n.properties.flatMap(p => p.name ? [p.name.getText().replace(/^['"]|['"]$/g, "")] : []));
const fingerprint = (text: string) => createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");

export function inventory(file: string, source: string): Site[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const sites: Site[] = [];
  const coreModule = file === "src/graph.ts";
  const portableModule = /^src\/skills\/skill(?:-claw|-droid|-opencode|-trae|-windows)?\.md#portable\.js$/.test(file);
  const sanctionedImplementation = coreModule || portableModule;
  const importedGuard = ast.statements.some(s => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && /(?:^|\/)graph\.js$/.test(s.moduleSpecifier.text) && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings) && s.importClause.namedBindings.elements.some(e => e.name.text === "assertSupportedGraphFormat" && (e.propertyName?.text ?? e.name.text) === "assertSupportedGraphFormat"));
  const emit = (n: ts.Node, kind: string, reason?: string) => {
    const text = n.getText(ast); sites.push({ file, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, owner: ownerOf(n), kind, text, fingerprint: fingerprint(text), ...(reason ? { reason } : {}) });
  };
  const functions = new Map<string, ts.Node[]>();
  function collect(n: ts.Node) { const name = functionName(n); if (name) functions.set(name, [...(functions.get(name) ?? []), n]); ts.forEachChild(n, collect); }
  collect(ast);
  const callsInside = (n: ts.Node) => {
    const names = new Set<string>();
    const walk = (p: ts.Node) => { if (ts.isCallExpression(p)) { const name = callName(p); if (name) names.add(name); } ts.forEachChild(p, walk); }; walk(n); return names;
  };
  const reaches = (name: string, target: string, visited = new Set<string>()): boolean => {
    if (name === target) return true;
    if (visited.has(name)) return false; visited.add(name);
    return (functions.get(name) ?? []).some(fn => [...callsInside(fn)].some(c => c === target || reaches(c, target, visited)));
  };
  function visit(n: ts.Node) {
    const owner = ownerOf(n);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const field = member(n.left as ts.Expression);
      if (field && reserved.has(field)) {
        const core = sanctionedImplementation && (owner === "upsertRelationEdge" || reaches("mergeEdgeEvidence", owner));
        emit(n, "raw-edge-rewrite", core ? "pure/core attribute derivation before the one writer commits" : undefined);
      }
    }
    if (ts.isDeleteExpression(n)) {
      const field = member(n.expression);
      if (field && reserved.has(field)) emit(n, "raw-edge-rewrite", sanctionedImplementation && (owner === "upsertRelationEdge" || reaches("mergeEdgeEvidence", owner)) ? "pure/core removal of superseded derived fields" : undefined);
    }
    if (ts.isNewExpression(n) && /^(?:Graph|DirectedGraph|UndirectedGraph|MultiGraph|MultiDirectedGraph|MultiUndirectedGraph)$/.test(n.expression.getText())) {
      const explicitMulti = n.expression.getText().startsWith("Multi") || n.arguments?.some(a => ts.isObjectLiteralExpression(a) && a.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText() === "multi" && p.initializer.kind === ts.SyntaxKind.TrueKeyword));
      const simpleException = file === "src/cluster.ts" && owner === "canonicalizeForPartition" || file === "src/storage/memory-projection.ts" && owner === "buildSnapshot";
      emit(n, "graph-constructor", explicitMulti ? "explicit multigraph" : simpleException ? "named simple projection (Louvain or X2b scratch)" : undefined);
    }
    if (ts.isCallExpression(n)) {
      const name = callName(n);
      if (name && insertion.test(name) && !ts.isIdentifier(n.expression)) {
        const helper = sanctionedImplementation && owner === "upsertRelationEdge" && /WithKey$/.test(name);
        const projection = file === "src/cluster.ts" && owner === "canonicalizeForPartition" && name === "mergeEdge" || file === "src/storage/memory-projection.ts" && owner === "buildSnapshot" && name === "addEdge";
        emit(n, "graph-insertion", helper ? "the keyed core writer" : projection ? "one named simple projection insertion" : undefined);
      }
      if (name && setters.test(name)) {
        const key = n.arguments[1];
        const field = key && ts.isStringLiteralLike(key) ? key.text : undefined;
        const core = sanctionedImplementation && owner === "upsertRelationEdge" && name === "replaceEdgeAttributes";
        emit(n, "graph-setter", core ? "the core commits complete merged attributes" : field && !reserved.has(field) ? "non-record display/plumbing field " + field : undefined);
      }
      if (name === "import" && !ts.isIdentifier(n.expression)) emit(n, "graph-import");
      if (name === "from" && ts.isPropertyAccessExpression(n.expression) && /^(?:Graph|DirectedGraph|UndirectedGraph|MultiGraph|MultiDirectedGraph|MultiUndirectedGraph)$/.test(n.expression.expression.getText())) emit(n, "graph-import");
      if (name === "dropEdge") emit(n, "graph-drop", n.arguments.length === 1 ? "key-addressed erasure/plumbing" : undefined);
      if (name === "edge" || name === "getEdgeAttributes" && n.arguments.length > 1) emit(n, "graph-pair-reader");
      if (name === "writeFileSync" || name === "writeFile" || name === "writeGraph") {
        const arg = n.arguments[1];
        const knownRawWriter = file === "src/export.ts" && owner === "toJson" || file === "src/graph-time-slice.ts" && owner === "runGraphTimeSlice" || file === "src/merge-driver.ts" && owner === "mergeGraphJsonFiles";
        // Unknown aliases are candidates too. A new raw/row/snapshot variable
        // must not disappear from the inventory merely because of its name.
        const document = arg && ts.isCallExpression(arg) && callName(arg) === "stringify" ? arg.arguments[0] : arg;
        const isDocument = knownRawWriter || name === "writeGraph" || document && !ts.isStringLiteralLike(document) && !ts.isTemplateExpression(document);
        let guarded = false;
        if ((importedGuard || portableModule) && document) {
          // Only a prior standalone guard of this exact value in this block
          // discharges the write. An unrelated call elsewhere cannot do so.
          const statement = n.parent;
          if (ts.isExpressionStatement(statement) && ts.isBlock(statement.parent)) {
            for (const prior of statement.parent.statements) {
              if (prior === statement) break;
              if (ts.isExpressionStatement(prior) && ts.isCallExpression(prior.expression) && callName(prior.expression) === "assertSupportedGraphFormat" && prior.expression.arguments[0]?.getText(ast) === document.getText(ast)) guarded = true;
              else guarded = false; // conservatively require no intervening mutation
            }
          }
        }
        if (isDocument) emit(n, "raw-graph-writer", guarded ? "this document is checked immediately before this write by the core typed format guard" : undefined);
      }
    }
    if (ts.isObjectLiteralExpression(n)) {
      const keys = keysOf(n);
      if (keys.has("source") && keys.has("target") && (keys.has("relation") || keys.has("confidence") || keys.has("evidence_observations") || n.properties.some(p => ts.isSpreadAssignment(p)))) {
        const boundary = sanctionedImplementation && ["prepareFreshExtraction", "legacyObservationFromRawLink", "mergeEdgeEvidence", "assertionIdentityOf"].includes(owner) || file === "src/storage/types.ts" && owner === "normalizeStoreEdgeIdentity";
        emit(n, "edge-row-constructor", boundary ? "constructor inside the explicitly identified core/portable capture implementation" : undefined);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
  // Raw boundaries are independently inventoried even when they contain no
  // literal Graphology call. A comment or a helper in a neighboring function
  // cannot discharge any of these obligations.
  const required: Array<[string, string, string]> = [
    ["src/build.ts", "readExistingGraphExtraction", "legacyObservationFromRawLink"],
    ["src/portable-artifacts.ts", "makeExtractionPortable", "prepareFreshExtraction"],
    ["src/graph-time-slice.ts", "readGraphDocument", "assertSupportedGraphFormat"],
    ["src/graph-time-slice.ts", "runGraphTimeSlice", "assertSupportedGraphFormat"],
    ["src/merge-driver.ts", "readGraph", "assertSupportedGraphFormat"],
    ["src/build.ts", "deduplicateByLabel", "assertionIdentityOf"],
    ["src/assembly-hygiene.ts", "normalizeSchemaHygiene", "assertionIdentityOf"],
    ["src/extract.ts", "_mergeSwiftExtensions", "assertionIdentityOf"],
    ["src/storage/sqlite.ts", "appendEdge", "mergeEdgeEvidence"],
    ["src/storage/sqlite.ts", "pushGraph", "mergeEdgeEvidence"],
    ["src/storage/postgres.ts", "appendEdge", "mergeEdgeEvidence"],
    ["src/storage/postgres.ts", "pushGraph", "mergeEdgeEvidence"],
  ];
  for (const [path, name, helper] of required) if (file === path) for (const fn of functions.get(name) ?? []) emit(fn, "raw-boundary", reaches(name, helper) ? "boundary reaches " + helper : undefined);
  return sites;
}
export function applyAllowlist(sites: Site[], allowed: Allowance[]): Site[] {
  const usage = new Map<string, number>();
  return sites.map(site => {
    if (site.reason) return site;
    const match = allowed.find(a => a.file === site.file && a.owner === site.owner && a.kind === site.kind && a.fingerprint === site.fingerprint);
    if (!match) return site;
    const key = JSON.stringify(match), used = (usage.get(key) ?? 0) + 1; usage.set(key, used);
    return used <= (match.count ?? 1) ? { ...site, reason: match.reason } : site;
  });
}
export function inventoryTree(root = "."): Site[] {
  const walk = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|js)$/.test(e.name) && !e.name.endsWith(".d.ts") ? [join(dir, e.name)] : []);
  return ["src", "studio/src"].flatMap(walk).flatMap(file => inventory(file, readFileSync(join(root, file), "utf8")));
}
