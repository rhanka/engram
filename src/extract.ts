/**
 * Root host module of the deterministic structural extraction (plan/09 L5-P2a).
 *
 * The engine lives in the closed core, `./extract-core.js`: this module keeps
 * its path and every export name by re-exporting the core, and binds the six
 * root-only capabilities into it as host defaults — the tree-sitter runtime
 * (edge 1), the Node module resolver (edge 2), the shebang interpreter
 * (edge 3), the label sanitizer (edge 5) and the file-cache filesystem branch
 * of the root product (edge 6). No importer of this module changes.
 *
 * TypeScript port of graphify/extract.py — uses web-tree-sitter (WASM) instead
 * of Python's native tree-sitter bindings.
 */
import { createRequire } from "node:module";
import * as TreeSitter from "web-tree-sitter";
import { loadCached, saveCached } from "./cache.js";
import { sanitizeLabel } from "./security.js";
import { shebangInterpreter } from "./detect.js";
import { bindExtractCoreHost } from "./extract-core.js";

function getModuleRequire(): NodeJS.Require {
  try {
    return createRequire(import.meta.url);
  } catch {
    return require;
  }
}

const moduleRequire = getModuleRequire();

const Parser = (
  (TreeSitter as unknown as { Parser?: typeof TreeSitter.Parser }).Parser ??
  (TreeSitter as unknown as { default?: typeof TreeSitter.Parser }).default
)!;

bindExtractCoreHost({
  parserRuntime: {
    init: () => Parser.init(),
    loadLanguage: (bytes) => TreeSitter.Language.load(bytes),
    createParser: (language) => {
      const parser = new Parser();
      parser.setLanguage(language as TreeSitter.Language);
      return parser;
    },
  },
  resolveModule: (request, options) => moduleRequire.resolve(request, options),
  shebangInterpreter,
  sanitizeLabel,
  fileCacheLoad: (filePath, root) => loadCached(filePath, root, {}),
  fileCacheSave: (filePath, result, root) => saveCached(filePath, result, root, {}),
});

export * from "./extract-core.js";
