import ts from "typescript";

// unpdf's PDF.js glyph table is a 4,327-deep comma expression. Keep the
// same numeric dictionary as JSON so published JavaScript has a shallow AST.
export function pdfjsGlyphData(source) {
  const ast = ts.createSourceFile("pdfjs.mjs", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const pending = [ast];
  while (pending.length) {
    const node = pending.pop();
    if (ts.isExpressionStatement(node)) {
      const expressions = [], stack = [node.expression];
      while (stack.length) {
        const expression = stack.pop();
        if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
          stack.push(expression.right, expression.left);
        } else expressions.push(expression);
      }
      if (expressions.length > 4000) {
        const data = Object.create(null);
        let receiver;
        for (const expression of expressions) {
          if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isNumericLiteral(expression.right)) {
            throw new Error("unpdf glyph table: expected only numeric assignments");
          }
          const target = expression.left;
          const key = ts.isPropertyAccessExpression(target) ? target.name.text
            : ts.isElementAccessExpression(target) && ts.isStringLiteral(target.argumentExpression) ? target.argumentExpression.text : undefined;
          if (key === undefined || !ts.isIdentifier(target.expression) || (receiver !== undefined && receiver !== target.expression.text)) {
            throw new Error("unpdf glyph table: expected one dictionary receiver");
          }
          receiver = target.expression.text;
          data[key] = Number(expression.right.text);
        }
        if (data.A !== 65 || data.AE !== 198 || data[".notdef"] !== 0) throw new Error("unpdf glyph table identity changed");
        const replacement = `Object.assign(${receiver}, JSON.parse(${JSON.stringify(JSON.stringify(data))}));`;
        return source.slice(0, node.getStart(ast)) + replacement + source.slice(node.end);
      }
    }
    ts.forEachChild(node, child => { pending.push(child); });
  }
  throw new Error("unpdf glyph table not found; verify the pinned PDF.js data");
}
