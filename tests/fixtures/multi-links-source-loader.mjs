import { readFile } from "node:fs/promises";
import ts from "typescript";

// Workers execute repository sources in memory, without emitted build artifacts.
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (!specifier.endsWith(".js")) throw error;
    return nextResolve(specifier.slice(0, -3) + ".ts", context);
  }
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context);
  const source = await readFile(new URL(url), "utf8");
  return {
    format: "module", shortCircuit: true,
    source: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText,
  };
}
