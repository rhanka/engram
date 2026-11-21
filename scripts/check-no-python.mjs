#!/usr/bin/env node
// Zero-Python guard (SJ-0e/SJ-0e-2, spec §10). Checks Python paths in the
// index and among non-ignored untracked files. Checks shebangs, npm scripts,
// workflow run steps and static JS/TS process calls in tracked files.
//
// The 16 exact allowlisted paths are Python-language graph extraction inputs.
// Every other Python path fails, including new files in fixture directories.
//
// Usage: node scripts/check-no-python.mjs
// Exit 0 when clean, 1 on findings or when the Git inventory cannot be read.
import { spawnSync } from "node:child_process";
import { closeSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CST, isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Grandfathered Python-language INPUT DATA (see header). Exact tracked paths.
const ALLOWED = new Set([
  "tests/fixtures/sample.py",
  "tests/fixtures/sample_calls.py",
  "worked/example/raw/api.py",
  "worked/example/raw/parser.py",
  "worked/example/raw/processor.py",
  "worked/example/raw/storage.py",
  "worked/example/raw/validator.py",
  "worked/httpx/raw/auth.py",
  "worked/httpx/raw/client.py",
  "worked/httpx/raw/exceptions.py",
  "worked/httpx/raw/models.py",
  "worked/httpx/raw/transport.py",
  "worked/httpx/raw/utils.py",
  "worked/mixed-corpus/raw/analyze.py",
  "worked/mixed-corpus/raw/build.py",
  "worked/mixed-corpus/raw/cluster.py",
]);

export function isPythonPath(rel) {
  if (/\.(py|pyw|pyi|pyx)$/i.test(rel)) return true;
  const base = basename(rel).toLowerCase();
  if (base === "pyproject.toml") return true;
  // `requirements*.txt`: starts with requirements, ends with .txt.
  if (base.startsWith("requirements") && base.endsWith(".txt")) return true;
  return false;
}

export function findHits(rels) {
  return rels.filter((rel) => rel !== "" && !ALLOWED.has(rel) && isPythonPath(rel));
}

const PYTHON_COMMAND = /^(?:pythonw?|pypy|pip)\d*(?:\.\d+)*(?:\.exe)?$|^(?:pipx|uvx?|poetry|pyw?)(?:\.exe)?$/;
const ASSIGNMENT = /^[a-z_][a-z0-9_]*\+?=/i;
const SHELL = /^(?:ba|da|k|z)?sh$/;
const SHELL_PREFIX = new Set(["if", "then", "elif", "else", "while", "until", "do", "!", "{", "}"]);
const WRAPPERS = new Map([
  ["command", []], ["exec", ["-a"]], ["env", ["-u", "--unset", "-C", "--chdir"]],
  ["nohup", []], ["nice", ["-n", "--adjustment"]], ["time", ["-o", "--output", "-f", "--format"]],
  ["sudo", ["-u", "--user", "-g", "--group"]], ["timeout", ["-s", "--signal", "-k", "--kill-after"]],
  ["xargs", ["-n", "-P", "-I", "-a", "-d", "--max-args", "--max-procs"]],
]);

function commandName(value) {
  return value.split(/[\\/]/).at(-1);
}

function splitEnvWords(text, offset) {
  const words = /(?:'[^']*'|"(?:\\[\s\S]|[^"\\])*"|\\[\s\S]|[^\s'"\\])+/g;
  return Array.from(text.matchAll(words), (word) => ({
    value: word[0].replace(/'([^']*)'|"((?:\\[\s\S]|[^"\\])*)"|\\([\s\S])/g,
      (_, single, double, escaped) => single ?? double?.replace(/\\([\s\S])/g, "$1") ?? escaped),
    offset: offset + word.index,
  }));
}

function commandInvocation(words) {
  let i = 0;
  while (i < words.length) {
    const { value, offset } = words[i++];
    if (ASSIGNMENT.test(value) || SHELL_PREFIX.has(value)) continue;
    const name = commandName(value);
    if (PYTHON_COMMAND.test(name)) return { command: name, offset };
    if (SHELL.test(name)) {
      let commandString = false;
      while (/^[+-]./.test(words[i]?.value ?? "")) {
        const option = words[i++].value;
        if (option === "--") break;
        const flags = /^[+-]([a-zA-Z]+)$/.exec(option)?.[1] ?? "";
        if (option.startsWith("-") && flags.includes("c")) commandString = true;
        if (/[oO]$/.test(flags) || /^(?:--rcfile|--init-file)$/.test(option)) i++;
      }
      if (commandString && words[i]) return shellInvocation(words[i].value, words[i].offset);
      return undefined;
    }
    if (name === "eval") {
      if (words[i]?.value === "--") i++;
      const args = words.slice(i);
      if (args.length) return shellInvocation(args.map((word) => word.value).join(" "), args[0].offset);
    }
    const valueOptions = WRAPPERS.get(name);
    if (!valueOptions) return undefined;
    while (words[i]?.value.startsWith("-")) {
      const option = words[i++].value;
      if (option === "--") break;
      if (name === "command" && /^-[vV]$/.test(option)) return undefined;
      const split = name === "env" && /^(?:-[a-zA-Z]*?S(.*)|--split-string(?:=(.*))?)$/s.exec(option);
      if (split) {
        const inline = split[2] ?? (split[1] || undefined);
        const arg = inline === undefined ? words[i++] : {
          value: inline, offset: words[i - 1].offset + option.length - inline.length,
        };
        if (!arg) return undefined;
        // env inserts the split arguments before the remaining argv.
        words = [...splitEnvWords(arg.value, arg.offset), ...words.slice(i)];
        i = 0;
      }
      if (valueOptions.includes(option)) i++;
    }
    if (name === "timeout") i++; // its duration precedes the command
  }
}

function substitutionAt(text, start, offset) {
  if (text[start] === "`") {
    const endQuote = /\\[\s\S]|`/g;
    endQuote.lastIndex = start + 1;
    for (let part; (part = endQuote.exec(text));) {
      if (part[0] === "`") {
        return { end: part.index + 1, hit: shellInvocation(text.slice(start + 1, part.index), offset + start + 1) };
      }
    }
    return { end: text.length };
  }
  const parts = /\\[\s\S]|'[^']*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`|[()]/g;
  parts.lastIndex = start + 2;
  let depth = 1;
  let firstInnerClose;
  for (let part; (part = parts.exec(text));) {
    if (part[0] === "(") depth++;
    if (part[0] !== ")") continue;
    depth--;
    if (depth === 1) firstInnerClose ??= part.index;
    if (depth === 0) {
      const body = text.slice(start + 2, part.index);
      const bodyOffset = offset + start + 2;
      const arithmetic = body.startsWith("(") && firstInnerClose === part.index - 1;
      const hit = arithmetic ? quotedSubstitution(body, bodyOffset, true) : shellInvocation(body, bodyOffset);
      return { end: part.index + 1, hit };
    }
  }
  return { end: text.length };
}

function quotedSubstitution(text, offset, arithmetic = false) {
  const starts = arithmetic ? /\\[\s\S]|'[^']*'|\$\(|`/g : /\\[\s\S]|\$\(|`/g;
  for (let part; (part = starts.exec(text));) {
    if (part[0] !== "$(" && part[0] !== "`") continue;
    const { end, hit } = substitutionAt(text, part.index, offset);
    if (hit) return hit;
    starts.lastIndex = end;
  }
}

// Tokenize words and command boundaries while preserving offsets and keeping
// quoted prose, comments and redirection targets out of command position.
function shellInvocation(source, offset = 0) {
  const text = source.replace(/\$\{\{[\s\S]*?\}\}/g, (expression) => " ".repeat(expression.length));
  const parts = /[^\S\n]+|#[^\n]*|\n|[;|&()]|\d*(?:<<<|<<-|<<|>>|<>|>&|<&|>|<)|\$\(|`|(?:'[^']*'|"(?:\\[\s\S]|[^"\\])*"|\\[\s\S]|(?!\$\()[^\s;|&()<>'"`\\])+/g;
  let words = [];
  let wordEnd = -1;
  let redirect = "";
  const heredocs = [];
  let hit;
  for (let part; (part = parts.exec(text));) {
    const raw = part[0];
    if (/^[\t \r#]/.test(raw)) continue;
    if (/^[\n;|&()]$/.test(raw)) {
      hit ??= commandInvocation(words);
      words = [];
      wordEnd = -1;
      redirect = "";
      if (raw === "\n") {
        for (const { value, stripTabs } of heredocs.splice(0)) {
          let end = parts.lastIndex;
          while (end < text.length) {
            const next = text.indexOf("\n", end);
            const line = text.slice(end, next === -1 ? undefined : next).replace(/\r$/, "");
            end = next === -1 ? text.length : next + 1;
            if ((stripTabs ? line.replace(/^\t+/, "") : line) === value) break;
          }
          parts.lastIndex = end;
        }
      }
    } else if (/^\d*[<>]/.test(raw)) {
      redirect = raw;
    } else {
      let value;
      if (raw === "$(" || raw === "`") {
        const substitution = substitutionAt(text, part.index, offset);
        hit ??= substitution.hit;
        parts.lastIndex = substitution.end;
        value = "<substitution>";
      } else {
        value = raw.replace(/'([^']*)'|"((?:\\[\s\S]|[^"\\])*)"|\\([\s\S])/g,
          (_, single, double, escaped, index) => {
            if (single !== undefined) return single;
            if (escaped !== undefined) return escaped === "\n" ? "" : escaped;
            if (!/\d*<<-?$/.test(redirect)) hit ??= quotedSubstitution(double, offset + part.index + index + 1);
            return double.replace(/\\([$`"\\\n])/g, (_, char) => char === "\n" ? "" : char);
          });
      }
      if (/\d*<<-?$/.test(redirect)) heredocs.push({ value, stripTabs: redirect.endsWith("-") });
      if (!redirect && (value !== "" || /['"]/.test(raw))) {
        if (part.index === wordEnd) words.at(-1).value += value;
        else words.push({ value, offset: offset + part.index });
        wordEnd = parts.lastIndex;
      }
      redirect = "";
    }
  }
  return hit ?? commandInvocation(words);
}

function scalarLineOffset(node, offset) {
  const token = node.srcToken;
  const lines = token.source.split("\n");
  const block = token.type === "block-scalar";
  // Reuse YAML's folding and escaping rules to map cooked offsets to source lines.
  let marker = "\uE000";
  while (node.value.includes(marker)) marker += "\uE000";
  const markedLines = [];
  const source = lines.map((line, index) => {
    if ((!block && index === 0) || !/\S/.test(line)) return line;
    markedLines.push(index + Number(block));
    return line.replace(/\S/, (char) => marker + char);
  }).join("\n");
  const marked = CST.resolveAsScalar({ ...token, source })?.value.split(marker);
  if (!marked || marked.join("") !== node.value) return Number(block);
  let line = Number(block);
  for (let i = 0; i < markedLines.length; i++) {
    offset -= marked[i].length;
    if (offset < 0) break;
    line = markedLines[i];
  }
  return line;
}

function scanConfiguration(content, isPackage, report) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(content, { lineCounter, keepSourceTokens: true, ...(isPackage ? { schema: "json" } : {}) });
  if (doc.errors.length > 0) {
    report(lineCounter.linePos(doc.errors[0].pos[0]).line, "cannot parse executable configuration");
    return;
  }
  const resolveAlias = (node) => isAlias(node) ? node.resolve(doc) : node;
  const get = (node, ...keys) => keys.reduce((value, key) =>
    isMap(value) ? resolveAlias(value.get(key, true)) : undefined, node);
  const scanScalar = (input) => {
    const node = resolveAlias(input);
    if (!isScalar(node) || typeof node.value !== "string") return;
    const hit = shellInvocation(node.value);
    if (!hit) return;
    const line = lineCounter.linePos(node.range[0]).line;
    report(line + scalarLineOffset(node, hit.offset), `invokes ${hit.command}`);
  };
  if (isPackage) {
    const scripts = get(doc.contents, "scripts");
    if (isMap(scripts)) for (const { value } of scripts.items) scanScalar(value);
    return;
  }
  scanScalar(get(doc.contents, "defaults", "run", "shell"));
  const jobs = get(doc.contents, "jobs");
  if (!isMap(jobs)) return;
  for (const { value } of jobs.items) {
    const job = resolveAlias(value);
    scanScalar(get(job, "defaults", "run", "shell"));
    const steps = get(job, "steps");
    if (!isSeq(steps)) continue;
    for (const item of steps.items) {
      const step = resolveAlias(item);
      scanScalar(get(step, "run"));
      scanScalar(get(step, "shell"));
    }
  }
}

const CHILD_PROCESS = /^(?:node:)?child_process$/;
const PROCESS_METHOD = /^(?:spawn|exec|execFile)(?:Sync)?$|^fork$/;
const EXECA_METHOD = /^(?:execa|execaCommand)(?:Sync)?$|^\$$/;

function unwrap(expr) {
  while (expr && (ts.isOuterExpression(expr) || ts.isAwaitExpression(expr))) expr = expr.expression;
  return expr;
}

function moduleBinding(name) {
  if (CHILD_PROCESS.test(name)) return "child_process";
  if (name === "execa") return "execa-module";
}

function memberBinding(binding, member) {
  if (binding === "child_process" && PROCESS_METHOD.test(member)) return member;
  if (binding === "execa-module" && EXECA_METHOD.test(member)) return member;
}

function processBinding(expr, lookup, seen = new Set()) {
  expr = unwrap(expr);
  if (!expr || seen.has(expr)) return undefined;
  seen.add(expr);
  if (ts.isCallExpression(expr)) {
    const callee = unwrap(expr.expression);
    if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require" && !lookup(callee))) {
      return moduleBinding(staticString(expr.arguments[0], lookup));
    }
    if (expr.arguments.length === 1) {
      const options = staticExpression(expr.arguments[0], lookup);
      if (options && ts.isObjectLiteralExpression(options)) {
        const binding = processBinding(callee, lookup, seen);
        if (binding === "$" || binding === "execa") return "$";
      }
    }
  }
  if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) {
    const member = expr.name?.text ?? staticString(expr.argumentExpression, lookup);
    return memberBinding(processBinding(expr.expression, lookup, seen), member);
  }
  if (!ts.isIdentifier(expr)) return undefined;
  const decl = lookup(expr);
  if (!decl) return undefined;
  if (ts.isImportSpecifier(decl)) {
    return memberBinding(moduleBinding(decl.parent.parent.parent.moduleSpecifier.text), (decl.propertyName ?? decl.name).text);
  }
  if (ts.isNamespaceImport(decl) || ts.isImportClause(decl)) {
    return moduleBinding((ts.isImportClause(decl) ? decl.parent : decl.parent.parent).moduleSpecifier.text);
  }
  if (ts.isVariableDeclaration(decl)) return processBinding(decl.initializer, lookup, seen);
  if (ts.isBindingElement(decl) && ts.isVariableDeclaration(decl.parent.parent)) {
    return memberBinding(processBinding(decl.parent.parent.initializer, lookup, seen), (decl.propertyName ?? decl.name).text);
  }
}

function staticExpression(expr, lookup) {
  const seen = new Set();
  expr = unwrap(expr);
  while (expr && ts.isIdentifier(expr) && !seen.has(expr)) {
    seen.add(expr);
    const decl = lookup(expr);
    if (!decl || !ts.isVariableDeclaration(decl) || !(decl.parent.flags & ts.NodeFlags.Const)) break;
    expr = unwrap(decl.initializer);
  }
  return expr;
}

function staticString(expr, lookup) {
  const activeTemplates = new Set();
  const resolve = (expression) => {
    const value = staticExpression(expression, lookup);
    if (value && ts.isStringLiteralLike(value)) return value.text;
    if (!value || !ts.isTemplateExpression(value) || activeTemplates.has(value)) return undefined;
    activeTemplates.add(value);
    const result = value.head.text + value.templateSpans.map(({ expression, literal }) =>
      (resolve(expression) ?? "__dynamic__") + literal.text).join("");
    activeTemplates.delete(value);
    return result;
  };
  return resolve(expr);
}

function spawnInvocation(method, args, lookup) {
  const argv = staticExpression(args[1], lookup);
  const values = argv && ts.isArrayLiteralExpression(argv) ? argv.elements : [];
  const trailing = staticExpression(args[2], lookup);
  const options = trailing && ts.isObjectLiteralExpression(trailing) ? trailing : argv;
  const property = (name) => {
    if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
    const prop = options.properties.find((prop) =>
      (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && prop.name.text === name);
    return prop && (ts.isShorthandPropertyAssignment(prop) ? prop.name : prop.initializer);
  };
  const command = staticString(method === "fork" ? property("execPath") : args[0], lookup);
  if (!command) return undefined;
  const shell = staticExpression(property("shell"), lookup);
  const shellFlag = shell?.kind === ts.SyntaxKind.TrueKeyword || staticString(shell, lookup);
  const words = [command, ...values.map((arg) => staticString(arg, lookup) ?? "")];
  if (/^(?:exec(?:Sync)?|execaCommand(?:Sync)?|\$)$/.test(method) || shellFlag) return shellInvocation(words.join(" "));
  return commandInvocation(words.map((value) => ({ value, offset: 0 })));
}

function scanJavaScript(rel, content, report) {
  if (!/child_process|execa/.test(content)) return;
  const source = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true);
  const bindings = new Map();
  const calls = [];
  const scopeOf = (node, functionScope = false) => {
    while (node !== source && !ts.isFunctionLike(node)) {
      if (!functionScope && (ts.isBlock(node) || ts.isCaseBlock(node) || ts.isCatchClause(node) || ts.isForStatement(node) ||
          ts.isForOfStatement(node) || ts.isForInStatement(node))) break;
      node = node.parent;
    }
    return node;
  };
  const declare = (name, decl, scope) => {
    if (ts.isIdentifier(name)) {
      if (!bindings.has(scope)) bindings.set(scope, new Map());
      bindings.get(scope).set(name.text, decl);
    } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const item of name.elements) if (ts.isBindingElement(item)) declare(item.name, item, scope);
    }
  };
  const collect = (node) => {
    if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || (ts.isImportClause(node) && node.name)) {
      declare(node.name, node, source);
    } else if (ts.isVariableDeclaration(node) || ts.isParameter(node) ||
        ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name)) {
      const isVar = ts.isVariableDeclarationList(node.parent) && !(node.parent.flags & ts.NodeFlags.BlockScoped);
      declare(node.name, node, scopeOf(node.parent, isVar));
    } else if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, collect);
  };
  const lookup = (id) => {
    for (let node = id.parent; node; node = node.parent) {
      const decl = bindings.get(node)?.get(id.text);
      if (decl) return decl;
    }
  };
  collect(source);
  for (const node of calls) {
    let hit;
    if (ts.isCallExpression(node)) {
      const method = processBinding(node.expression, lookup);
      if (method === "execa-module" || PROCESS_METHOD.test(method) || EXECA_METHOD.test(method)) {
        hit = spawnInvocation(method, node.arguments, lookup);
      }
    } else {
      const method = processBinding(node.tag, lookup);
      if (method === "$" || method === "execa" || method === "execa-module") hit = shellInvocation(staticString(node.template, lookup));
    }
    if (hit) report(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, `invokes ${hit.command}`);
  }
}

function scanTrackedFile(rel, report) {
  const path = join(ROOT, rel);
  const isPackage = basename(rel) === "package.json";
  const isWorkflow = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(rel);
  const isJavaScript = /\.(?:mjs|cjs|js|ts)$/.test(rel) && !/^(?:tests\/fixtures|worked)\//.test(rel);
  // Git symlinks contain a target path, so there is no tracked file content to read.
  if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) return;
  const fd = openSync(path, "r");
  try {
    const prefix = Buffer.alloc(2);
    const hasShebang = readSync(fd, prefix, 0, prefix.length, 0) === 2 && prefix.toString() === "#!";
    if (!hasShebang && !isPackage && !isWorkflow && !isJavaScript) return;
    const content = readFileSync(fd, "utf8");
    if (hasShebang) {
      const hit = shellInvocation(content.split("\n", 1)[0].slice(2));
      if (hit) report(1, `shebang invokes ${hit.command}`);
    }
    if (isPackage || isWorkflow) scanConfiguration(content, isPackage, report);
    if (isJavaScript) scanJavaScript(rel, content, report);
  } finally {
    closeSync(fd);
  }
}

function listFiles(...options) {
  const g = spawnSync("git", ["-C", ROOT, "ls-files", ...options, "-z"], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (g.status !== 0) {
    console.error("check-no-python: `git ls-files` failed -- cannot prove zero-python");
    process.exit(1);
  }
  return [...new Set(g.stdout.toString("utf8").split("\0").filter(Boolean))];
}

function main() {
  const tracked = listFiles("--cached");
  const paths = findHits([...new Set([...tracked, ...listFiles("--others", "--exclude-standard")])]);
  const invocations = [];
  for (const rel of tracked) {
    const report = (line, message) => invocations.push(`${rel}:${line}: ${message}`);
    try {
      scanTrackedFile(rel, report);
    } catch (error) {
      report(1, `cannot scan tracked file (${error.code ?? error.message})`);
    }
  }
  if (paths.length === 0 && invocations.length === 0) {
    console.log(`✓ ZERO PYTHON OK (0 unexcused, ${ALLOWED.size} allowlisted fixture paths)`);
    return;
  }
  if (paths.length > 0) {
    console.error(`check-no-python: unexcused Python paths (${paths.length}):`);
    for (const path of paths) console.error(`  ${path}`);
  }
  if (invocations.length > 0) {
    console.error(`check-no-python: executable context findings (${invocations.length}):`);
    for (const invocation of invocations) console.error(`  ${invocation}`);
  }
  process.exit(1);
}

function isMainModule() {
  if (process.argv[1] == null) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
