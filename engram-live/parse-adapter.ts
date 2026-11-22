import { createHash } from "node:crypto";
import { ADVERTISED_LANGUAGES } from "./contracts.js";
import {
  ParseUnavailableError,
  type DeterministicParsePort,
  type LocalCall,
  type LocalInheritance,
  type LocalSymbol,
  type ParsedUnit,
} from "./code-analysis.js";
import type { GrammarRuntimePort, GrammarSyntaxNode } from "./integration.js";

type Language = (typeof ADVERTISED_LANGUAGES)[number];

interface SyntaxRules {
  readonly functions: readonly string[];
  readonly types?: readonly string[];
  readonly calls: readonly string[];
  readonly parents?: readonly string[];
}

const jsFamily: SyntaxRules = {
  functions: ["function_declaration", "generator_function_declaration", "method_definition"],
  types: ["class_declaration", "abstract_class_declaration", "interface_declaration", "enum_declaration", "type_alias_declaration"],
  calls: ["call_expression", "new_expression"],
  parents: ["class_heritage", "extends_type_clause"],
};

const rules: Readonly<Record<Language, SyntaxRules>> = {
  c: {
    functions: ["function_definition"], types: ["struct_specifier", "union_specifier", "enum_specifier"],
    calls: ["call_expression"],
  },
  cpp: {
    functions: ["function_definition"], types: ["class_specifier", "struct_specifier", "union_specifier", "enum_specifier"],
    calls: ["call_expression"], parents: ["base_class_clause"],
  },
  go: {
    functions: ["function_declaration", "method_declaration"], types: ["type_spec", "type_alias"],
    calls: ["call_expression"],
  },
  java: {
    functions: ["method_declaration", "constructor_declaration"],
    types: ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration"],
    calls: ["method_invocation", "object_creation_expression"],
    parents: ["superclass", "super_interfaces", "extends_interfaces"],
  },
  javascript: jsFamily,
  php: {
    functions: ["function_definition", "method_declaration"],
    types: ["class_declaration", "interface_declaration", "trait_declaration", "enum_declaration"],
    calls: ["function_call_expression", "member_call_expression", "scoped_call_expression", "nullsafe_member_call_expression"],
    parents: ["base_clause", "class_interface_clause"],
  },
  python: {
    functions: ["function_definition"], types: ["class_definition"],
    calls: ["call"], parents: ["argument_list"],
  },
  ruby: {
    functions: ["method", "singleton_method"], types: ["class", "module"],
    calls: ["call"], parents: ["superclass"],
  },
  rust: {
    functions: ["function_item", "function_signature_item"],
    types: ["struct_item", "enum_item", "trait_item", "type_item", "union_item"],
    calls: ["call_expression"], parents: ["trait_bounds"],
  },
  typescript: jsFamily,
  tsx: jsFamily,
};

export function supportsProductionParse(language: string): language is Language {
  return Object.hasOwn(rules, language);
}

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

function declarationName(node: GrammarSyntaxNode): GrammarSyntaxNode | null {
  let declarator = node.childForFieldName("declarator");
  while (declarator) {
    const nested = declarator.childForFieldName("declarator");
    if (!nested) return declarator;
    declarator = nested;
  }
  return node.childForFieldName("name");
}

// Emit only identifier-like references from the AST. Expressions such as
// computed callees can contain arbitrary source, so carry a dynamic target.
function reference(node: GrammarSyntaxNode | null): string | null {
  if (!node || node.isMissing) return null;
  const text = node.text.replace(/^\\/u, "");
  if (!/^[\p{ID_Start}_$][\p{ID_Continue}$]*(?:(?:\.|::|->|\\)[\p{ID_Start}_$][\p{ID_Continue}$]*)*$/u.test(text)) {
    return null;
  }
  return text.replaceAll("\\", "::");
}

const parentContainers = new Set(["extends_clause", "implements_clause", "type_list"]);

function parentReference(node: GrammarSyntaxNode | null): string | null {
  if (!node || node.isMissing || node.type === "access_specifier") return null;
  if (node.type === "generic_type" || node.type === "template_type") {
    return parentReference(node.childForFieldName("name") ?? node.childForFieldName("type") ?? node.namedChildren[0] ?? null);
  }
  if (node.type === "qualified_identifier") {
    const scope = node.childForFieldName("scope");
    const name = parentReference(node.childForFieldName("name"));
    if (!scope) return name;
    const qualifier = parentReference(scope);
    return qualifier && name ? `${qualifier}::${name}` : null;
  }
  const inner = node.childForFieldName("value") ?? node.childForFieldName("type");
  return inner ? parentReference(inner) : reference(node);
}

function parentNames(node: GrammarSyntaxNode): string[] {
  if (parentContainers.has(node.type)) return node.namedChildren.flatMap(parentNames);
  const name = parentReference(node);
  return name ? [name] : [];
}

function callName(node: GrammarSyntaxNode): string {
  const target = node.childForFieldName("function") ?? node.childForFieldName("constructor")
    ?? node.childForFieldName("name") ?? node.childForFieldName("method") ?? node.childForFieldName("type");
  const receiver = node.childForFieldName("object") ?? node.childForFieldName("receiver") ?? node.childForFieldName("scope");
  const name = reference(target);
  if (!receiver) return name ?? "<dynamic>";
  const qualifier = reference(receiver);
  return qualifier && name ? qualifier + "." + name : "<dynamic>";
}

function syntaxUnit(root: GrammarSyntaxNode, content: string, syntax: SyntaxRules): ParsedUnit {
  const symbols: LocalSymbol[] = [];
  const calls: LocalCall[] = [];
  const inheritances: LocalInheritance[] = [];
  const occurrences = new Map<string, number>();
  const nextSlot = (key: string): string => {
    const index = occurrences.get(key) ?? 0;
    occurrences.set(key, index + 1);
    return key + ":" + index;
  };
  const pending = [{ node: root, owner: "", symbolOwner: "" }];
  let hasMissing = false;
  let hasModule = false;
  while (pending.length > 0) {
    const { node, owner, symbolOwner } = pending.pop()!;
    hasMissing ||= node.isMissing;
    let nextOwner = owner;
    let nextSymbolOwner = symbolOwner;
    const kind = syntax.functions.includes(node.type) ? "function"
      : syntax.types?.includes(node.type) ? "type"
      : node.type === "variable_declarator" ? "binding" : undefined;
    const name = kind ? reference(declarationName(node)) : null;
    if (kind && name) {
      const body = node.childForFieldName("body");
      const signature = body ? content.slice(node.startIndex, body.startIndex).trimEnd() : node.text;
      const identity = kind === "function" ? name + ":" + hash(signature) : name;
      nextOwner = nextSlot([owner, kind, encodeURIComponent(identity)].filter(Boolean).join(":"));
      nextSymbolOwner = nextOwner;
      symbols.push({ slot: nextOwner, name, kind, bodyHash: hash(body?.text ?? node.text) });
      if (kind === "type") {
        for (const child of node.namedChildren) {
          if (!syntax.parents?.includes(child.type)) continue;
          for (const parent of child.namedChildren.flatMap(parentNames)) {
            inheritances.push({ childSlot: nextOwner, parentSlotOrName: parent, external: true,
              slot: nextSlot(nextOwner + ":inherits:" + encodeURIComponent(parent)) });
          }
        }
      }
    } else if (node.type === "impl_item") {
      const target = node.childForFieldName("type");
      const trait = node.childForFieldName("trait");
      if (target && !target.isMissing) {
        // An impl scopes method slots but has no symbol to own calls itself.
        nextOwner = [owner, "impl", encodeURIComponent(target.text), encodeURIComponent(trait?.text ?? "")]
          .filter(Boolean).join(":");
      }
    }
    if (syntax.calls.includes(node.type)) {
      const target = callName(node);
      if (!symbolOwner && !hasModule) {
        symbols.push({ slot: "module", name: "<module>", kind: "module", bodyHash: hash(content) });
        hasModule = true;
      }
      const fromSlot = symbolOwner || "module";
      // Scope, shadowing and receiver binding require context. Preserve the
      // syntax-local reference for resolution instead of guessing a target.
      calls.push({ fromSlot, targetSlotOrName: target, external: true,
        slot: nextSlot(fromSlot + ":call:" + encodeURIComponent(target)) });
    }
    const children = node.children;
    for (let index = children.length - 1; index >= 0; index--) {
      pending.push({ node: children[index], owner: nextOwner, symbolOwner: nextSymbolOwner });
    }
  }

  // Tree-sitter's string input uses UTF-16 indices. Its root can exclude
  // leading whitespace even when it consumed the entire input.
  const spansInput = root.startIndex >= 0 && root.startIndex <= root.endIndex && root.endIndex === content.length
    && /^\s*$/u.test(content.slice(0, root.startIndex));
  const topologyHash = hash(JSON.stringify([
    symbols.map(({ slot, name, kind }) => ({ slot, name, kind })), calls, inheritances,
  ]));
  return { symbols, calls, inheritances, topologyHash,
    syntax: { rootSpansBytes: spansInput, hasError: root.hasError, hasMissing, walkComplete: true } };
}

export function createProductionParseAdapter(runtime: GrammarRuntimePort): DeterministicParsePort {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  return {
    async parse({ bytes, content, language, grammarHandle }) {
      if (!supportsProductionParse(language)) throw new ParseUnavailableError("no production adapter for " + language);
      let exactContent: string;
      try {
        exactContent = decoder.decode(bytes);
      } catch {
        throw new ParseUnavailableError("content is not valid UTF-8");
      }
      if (exactContent !== content) throw new ParseUnavailableError("content does not match the supplied bytes");
      try {
        const parser = runtime.createParser(grammarHandle);
        try {
          const tree = parser.parse(exactContent);
          if (!tree) throw new ParseUnavailableError("parser returned no syntax tree");
          try {
            return syntaxUnit(tree.rootNode, exactContent, rules[language]);
          } finally {
            tree.delete();
          }
        } finally {
          parser.delete();
        }
      } catch (error) {
        if (error instanceof ParseUnavailableError) throw error;
        throw new ParseUnavailableError("injected runtime could not complete the syntax walk");
      }
    },
  };
}
