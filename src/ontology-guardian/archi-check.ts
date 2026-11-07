// Proposed archi@1 semantic consistency checks (spec/SPEC_EVOL_ARCHI_CARDS.md §2.3–§2.4, §3.4, §3.10, §5.5).
import { sortDiagnostics } from "./diagnostics.js";
import type { EngramDiagnostic } from "./diagnostics.js";
import { checkSemanticShape } from "./diagram-document-shape.js";
import type { NativeSemanticDocument } from "./diagram-native-types.js";

type NativeEntity = NativeSemanticDocument["entities"][string];
type NativeRelation = NativeSemanticDocument["relations"][string];

type ArchiCheckCode =
  | "archi-input-invalid"
  | "archi-source-conflict"
  | "archi-footer-missing"
  | "archi-single-writer"
  | "archi-execution-unbound"
  | "archi-edge-verb";

type ArchiRelationEncoding = "tree" | "owner" | "detail" | "footer" | "arrow";

/** proposed: supported description languages (§3.10, §5.2). */
export type ArchiLanguage = "fr" | "en";

/** proposed: closed 10-key instance verb inventory of archi-cards@1 (§2.3, §3.10). */
export type ArchiVerbKey =
  | "invokes"
  | "invokes.poll"
  | "consumesApi"
  | "deployedAs"
  | "dependsOn"
  | "documents"
  | "executedBy"
  | "loadedBy"
  | "accesses.append"
  | "accesses.write";

/** proposed: closed per-language instance verb table (§2.3, §3.10). */
export type ArchiVerbTable = Readonly<Record<ArchiVerbKey, string>>;

/** proposed: verb-card input contract for checkArchi (§2.4, §3.10). */
export interface ArchiVerbCards {
  readonly labels: Readonly<Record<ArchiLanguage, { readonly verb: ArchiVerbTable }>>;
}

const esc = (t: string): string => t.replace(/~/g, "~0").replace(/\//g, "~1");
const val = (rec: { readonly attributes?: Readonly<Record<string, unknown>> } | undefined, k: string): string | undefined => {
  const a = rec?.attributes?.[k] as { readonly value?: unknown } | undefined;
  return typeof a?.value === "string" ? a.value : undefined;
};
const endOf = (r: NativeRelation, role: string): string | undefined => r.endpoints.find((e) => e.role === role)?.target;

const docSubjectRef = (doc: unknown): string => {
  const id = (doc as { readonly documentId?: unknown } | null | undefined)?.documentId;
  return typeof id === "string" && id.length > 0 ? id : "document";
};

const makeInputDiag = (subjectRef: string, message: string): EngramDiagnostic => ({
  origin: "engram", severity: "error", code: "archi-input-invalid", nativeCode: "archi-input-invalid",
  message, path: "", subjectRef,
});

const makeRecordDiag = (code: ArchiCheckCode, bucket: "entities" | "relations", id: string, message: string): EngramDiagnostic => ({
  origin: "engram", severity: "error", code, nativeCode: code, message, path: `/${bucket}/${esc(id)}`, nodeId: id, subjectRef: id,
});

function archiRelationEncoding(document: NativeSemanticDocument, relation: NativeRelation): ArchiRelationEncoding {
  const t = relation.type;
  if (t === "partOf" || t === "managedIn" || t === "runsOn") return "tree";
  if (t === "ownedBy" || t === "operatedBy") return "owner";
  if (t === "providesApi" || t === "uses") return "detail";
  if (t === "executedBy" || t === "loadedBy") {
    const src = endOf(relation, "source");
    return src && document.entities[src]?.type === "package" ? "arrow" : "detail";
  }
  if (t === "accesses") {
    if (val(relation, "mode") === "read") return "detail";
    const tgt = endOf(relation, "target");
    return val(tgt ? document.entities[tgt] : undefined, "writerPolicy") === "single-writer" ? "footer" : "arrow";
  }
  return "arrow";
}

function archiEdgeVerbKey(relation: NativeRelation): string {
  if (relation.type === "accesses") return `accesses.${val(relation, "mode") ?? ""}`;
  if (relation.type === "invokes" && val(relation, "trigger") === "poll") return "invokes.poll";
  return relation.type;
}

/** proposed: pure semantic check of an archi@1 document (rules A1–A4, A6; §2.4, §5.5). */
export function checkArchi(
  document: NativeSemanticDocument,
  cards: ArchiVerbCards,
  language: ArchiLanguage,
): readonly EngramDiagnostic[] {
  const subjectRef = docSubjectRef(document);
  const shape = checkSemanticShape(document);
  if (shape !== null) {
    return [makeInputDiag(subjectRef, `Invalid semantic document shape at ${shape || "<root>"}.`)];
  }
  if (language !== "fr" && language !== "en") {
    return [makeInputDiag(subjectRef, `Unsupported archi language "${String(language)}".`)];
  }
  const verbTable = (cards as { readonly labels?: Readonly<Record<string, { readonly verb?: unknown }>> } | null | undefined)?.labels?.[language]?.verb;
  if (!verbTable || typeof verbTable !== "object") {
    return [makeInputDiag(subjectRef, `Missing archi verb table for language "${language}".`)];
  }

  const entities = Object.values(document.entities).filter((e): e is NativeEntity => e.profile === "archi@1");
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const relations = Object.values(document.relations).filter((r): r is NativeRelation => r.profile === "archi@1");
  const out = (id: string, type: string): string[] =>
    relations.filter((r) => r.type === type && endOf(r, "source") === id).map((r) => endOf(r, "target")).filter((x): x is string => Boolean(x));
  const parent = (id: string): string | undefined => out(id, "partOf")[0];
  const repo = (id: string, seen = new Set<string>()): string | undefined => {
    if (seen.has(id)) return undefined;
    seen.add(id);
    const direct = out(id, "managedIn")[0];
    if (direct) return direct;
    const p = parent(id);
    return p ? repo(p, seen) : undefined;
  };
  const writers = (storeId: string): string[] => [
    ...new Set(
      relations
        .filter((r) => r.type === "accesses" && endOf(r, "target") === storeId && ["append", "write"].includes(val(r, "mode") ?? ""))
        .map((r) => endOf(r, "source")).filter((x): x is string => Boolean(x)),
    ),
  ];

  const diagnostics: EngramDiagnostic[] = [];
  for (const e of entities) {
    const direct = out(e.id, "managedIn")[0];
    const p = parent(e.id);
    const pRepo = p ? repo(p) : undefined;
    if (direct && pRepo && pRepo !== direct) {
      diagnostics.push(makeRecordDiag("archi-source-conflict", "entities", e.id, `Entity ${e.id} managedIn ${direct} conflicts with partOf ancestor repo ${pRepo}.`));
    }
    if (e.type === "store") {
      const ws = writers(e.id);
      if (ws.length === 0) {
        diagnostics.push(makeRecordDiag("archi-footer-missing", "entities", e.id, `Store ${e.id} has no writer for footer derivation.`));
      } else if (val(e, "writerPolicy") === "single-writer" && ws.length !== 1) {
        diagnostics.push(makeRecordDiag("archi-single-writer", "entities", e.id, `Single-writer store ${e.id} has ${ws.length} writers (expected 1).`));
      }
    } else if (e.type === "service" || e.type === "host") {
      if (out(e.id, "operatedBy").length === 0) diagnostics.push(makeRecordDiag("archi-footer-missing", "entities", e.id, `Entity ${e.id} requires operatedBy for footer derivation.`));
    } else if (e.type === "repo") {
      if (out(e.id, "ownedBy").length === 0) diagnostics.push(makeRecordDiag("archi-footer-missing", "entities", e.id, `Repository ${e.id} requires ownedBy for footer derivation.`));
    } else if (e.type !== "actor" && !repo(e.id) && out(e.id, "ownedBy").length === 0) {
      diagnostics.push(makeRecordDiag("archi-footer-missing", "entities", e.id, `Entity ${e.id} requires an effective repo or ownedBy for footer derivation.`));
    }
  }

  const reaches = (from: string, goal: string, seen = new Set<string>()): boolean =>
    from === goal ? true : seen.has(from) ? false : (seen.add(from), out(from, "dependsOn").some((next) => reaches(next, goal, seen)));

  for (const r of relations) {
    if (r.type === "executedBy") {
      const s = endOf(r, "source"), rt = endOf(r, "target"), sk = s ? entityMap.get(s)?.type : undefined, p = s ? parent(s) : undefined;
      const pkg = sk === "package" ? s : p && entityMap.get(p)?.type === "package" ? p : undefined;
      const ok = Boolean(pkg && rt && relations.some((d) => d.type === "deployedAs" && endOf(d, "target") === rt && Boolean(endOf(d, "source")) && reaches(endOf(d, "source")!, pkg)));
      if (!ok) diagnostics.push(makeRecordDiag("archi-execution-unbound", "relations", r.id, `Relation ${r.id} executedBy is not bound by deployedAs/dependsOn.`));
    }
    if (archiRelationEncoding(document, r) === "arrow") {
      const key = archiEdgeVerbKey(r);
      const rawVerb = (verbTable as Record<string, unknown>)[key];
      const v = typeof rawVerb === "string" && rawVerb.length > 0 ? rawVerb : undefined;
      if (!v) {
        diagnostics.push(makeRecordDiag("archi-input-invalid", "relations", r.id, `Verb table for "${language}" is missing verb "${key}" required by relation ${r.id}.`));
      } else {
        const lbl = val(r, "label");
        if (lbl === undefined || !(lbl === v || lbl.startsWith(`${v} · `))) {
          diagnostics.push(makeRecordDiag("archi-edge-verb", "relations", r.id, `Relation ${r.id} label "${lbl ?? ""}" does not start with verb "${v}".`));
        }
      }
    }
  }
  return sortDiagnostics(diagnostics) as EngramDiagnostic[];
}
