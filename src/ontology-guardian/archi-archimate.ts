// Proposed ArchiMate 3.x mapping tables, identifier bijections, and property codec (P-6, Lot 7)
// (spec/SPEC_EVOL_ARCHI_CARDS.md « P-6 — the ArchiMate mapping (engram-owned) », §2.8, §5.5).
import type { EngramDiagnostic } from "./diagnostics.js";
import { ARCHI1_TUPLES } from "./archi-profile.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

const esc = (segment: string): string => segment.replace(/~/g, "~0").replace(/\//g, "~1");

// Module-private regexes and EID helpers (§3, SPEC:838-845, N7).
const ARCHI_REF_RE = /^(document|entity|relation):[a-z][a-z0-9-]{0,39}$/;
const ARCHIMATE_ID_RE = /^(document|entity|relation)_[a-z][a-z0-9-]{0,39}$/;
const VIEW_REF_RE = /^view:[a-z][a-z0-9-]{0,39}$/;
const ENTITY_REF_RE = /^entity:[a-z][a-z0-9-]{0,39}$/;
const ANY_ARCHI_REF_RE = /^(document|entity|relation|view):[a-z][a-z0-9-]{0,39}$/;
const ARCHIMATE_VIEW_ID_RE =
  /^view_[a-z][a-z0-9-]{0,39}\.(-|e_[a-z][a-z0-9_]{0,39}(\.e_[a-z][a-z0-9_]{0,39})*)$/;
const KEY_RE = /^[a-z][a-z0-9-]*$/;

function toEid(entityRef: string): string {
  return `e_${entityRef.slice("entity:".length).replace(/-/g, "_")}`;
}

function fromEid(eid: string): string {
  return `entity:${eid.slice(2).replace(/_/g, "-")}`;
}

function cmpAsciiBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isWellFormedSingleLineNfc(
  value: unknown,
  minLen: number,
  maxLen: number,
): value is string {
  if (typeof value !== "string") return false;
  if (value.length < minLen || value.length > maxLen) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return value === value.normalize("NFC");
}

function resolveSubjectRef(options: unknown): string {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return "archimate";
  }
  try {
    const raw = (options as { readonly subjectRef?: unknown }).subjectRef;
    return typeof raw === "string" && raw.length > 0 ? raw : "archimate";
  } catch {
    return "archimate";
  }
}

/** proposed: closed ArchiMate mapping diagnostic code inventory (P-6 §5, §5.5). */
export const ARCHI_ARCHIMATE_DIAGNOSTIC_CODES = Object.freeze(["archimate-kind-missing"] as const);

/** proposed: ArchiMate mapping diagnostic code union (P-6 §5). */
export type ArchiArchimateDiagnosticCode = (typeof ARCHI_ARCHIMATE_DIAGNOSTIC_CODES)[number];

/** proposed: ArchiMate mapping failure code union (P-6 §5). */
export type ArchiArchimateFailureCode = ArchiArchimateDiagnosticCode | "archi-input-invalid";

/** proposed: ArchiMate mapping diagnostic envelope (P-6 §5, §5.5). */
export interface ArchiArchimateDiagnostic extends EngramDiagnostic {
  readonly origin: "engram";
  readonly severity: "error";
  readonly path: string;
  readonly subjectRef: string;
  readonly code: ArchiArchimateFailureCode;
  readonly nativeCode: ArchiArchimateFailureCode;
}

/** proposed: closed result union for P-6 functions (P-6 §5). */
export type ArchiArchimateResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly diagnostics: readonly [ArchiArchimateDiagnostic, ...ArchiArchimateDiagnostic[]];
    };

/** proposed: row of ARCHI_ARCHIMATE_ELEMENT_TABLE (32 rows, P-6 §1, §5). */
export interface ArchiArchimateElementRow {
  readonly kind: string;
  readonly form?: string;
  readonly archimateElement: string;
  readonly archimateTypeId: string;
  readonly layer: string;
  readonly aspect: string;
  readonly manyToOne: boolean;
}

/** proposed: forward ArchiMate element mapping output (P-6 §5). */
export interface ArchiArchimateElementMapping extends ArchiArchimateElementRow {
  readonly properties: { readonly "archi-kind": string; readonly "archi-form"?: string };
}

/** proposed: row of ARCHI_ARCHIMATE_RELATIONSHIP_TABLE (15 rows, P-6 §2, §5). */
export interface ArchiArchimateRelationshipRow {
  readonly relationType: string;
  readonly nominalRelationship: string;
  readonly nominalTypeId: string;
  readonly direction: "forward" | "swapped";
  readonly associationFallback: readonly {
    readonly sourceKind: string;
    readonly targetKind: string;
  }[];
}

/** proposed: forward ArchiMate relationship mapping output (P-6 §5). */
export interface ArchiArchimateRelationshipMapping {
  readonly archimateRelationship: string;
  readonly archimateTypeId: string;
  readonly nominalRelationship: string;
  readonly nominalTypeId: string;
  readonly direction: "forward" | "swapped";
  readonly usedAssociationFallback: boolean;
  readonly archimateSource: ArchiArchimateElementMapping;
  readonly archimateTarget: ArchiArchimateElementMapping;
  readonly directed?: true;
  readonly accessMode?: "read" | "write";
  readonly properties: Readonly<Record<string, string>>;
}

/** proposed: reverse ArchiMate relationship mapping output (P-6 §5). */
export interface ArchiArchimateRelationReversed {
  readonly relationType: string;
  readonly mode?: string;
  readonly trigger?: string;
  readonly event?: string;
  readonly source: { readonly kind: string; readonly form?: string };
  readonly target: { readonly kind: string; readonly form?: string };
}

/** proposed: row of ARCHI_ARCHIMATE_PROPERTIES (23 rows in emission order, P-6 §4, §5). */
export interface ArchiArchimatePropertyDef {
  readonly name: string;
  readonly identifier: string;
  readonly scope: readonly ("model" | "element" | "relationship" | "view")[];
  readonly appliesTo?: readonly string[];
  readonly attribute?: string;
  readonly presence: "required" | "if-present" | "per-pair";
}

/** proposed: decoded (viewRef, collapsed) pair from an ArchiMate view identifier (P-6 §3, §5). */
export interface ArchiArchimateViewState {
  readonly viewRef: string;
  readonly collapsed: readonly string[];
}

/** proposed: decoded archi record from ArchiMate properties (P-6 §4, §5). */
export interface ArchiArchimateDecodedRecord {
  readonly ref: string;
  readonly kind?: string;
  readonly relationType?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

function fail<T>(
  code: ArchiArchimateFailureCode,
  path: string,
  subjectRef: string,
  message: string,
): ArchiArchimateResult<T> {
  const normalizedPath = path === "" || path.startsWith("/") ? path : `/${path}`;
  return {
    ok: false,
    diagnostics: [
      {
        origin: "engram",
        severity: "error",
        code,
        nativeCode: code,
        path: normalizedPath,
        subjectRef,
        message,
      },
    ],
  };
}

/** proposed: 32-row archi@1 (kind, form) -> ArchiMate 3.x element table (P-6 §1). */
export const ARCHI_ARCHIMATE_ELEMENT_TABLE: readonly ArchiArchimateElementRow[] = deepFreeze([
  { kind: "actor", archimateElement: "BusinessActor", archimateTypeId: "business-actor", layer: "business", aspect: "active", manyToOne: true },
  { kind: "actor", form: "human", archimateElement: "BusinessActor", archimateTypeId: "business-actor", layer: "business", aspect: "active", manyToOne: true },
  { kind: "actor", form: "agent", archimateElement: "BusinessActor", archimateTypeId: "business-actor", layer: "business", aspect: "active", manyToOne: true },
  { kind: "actor", form: "team", archimateElement: "BusinessActor", archimateTypeId: "business-actor", layer: "business", aspect: "active", manyToOne: true },
  { kind: "actor", form: "org", archimateElement: "BusinessActor", archimateTypeId: "business-actor", layer: "business", aspect: "active", manyToOne: true },
  { kind: "system", archimateElement: "Grouping", archimateTypeId: "grouping", layer: "none", aspect: "composite", manyToOne: true },
  { kind: "repo", archimateElement: "Grouping", archimateTypeId: "grouping", layer: "none", aspect: "composite", manyToOne: true },
  { kind: "package", form: "library", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "package", form: "plugin", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "package", form: "app", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "component", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "runtime", form: "cli", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "runtime", form: "mcp-server", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "runtime", form: "daemon", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "runtime", form: "job", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "runtime", form: "hook", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "service", archimateElement: "ApplicationComponent", archimateTypeId: "application-component", layer: "application", aspect: "active", manyToOne: true },
  { kind: "api", form: "mcp", archimateElement: "ApplicationInterface", archimateTypeId: "application-interface", layer: "application", aspect: "active", manyToOne: true },
  { kind: "api", form: "http", archimateElement: "ApplicationInterface", archimateTypeId: "application-interface", layer: "application", aspect: "active", manyToOne: true },
  { kind: "api", form: "cli", archimateElement: "ApplicationInterface", archimateTypeId: "application-interface", layer: "application", aspect: "active", manyToOne: true },
  { kind: "store", form: "jsonl", archimateElement: "DataObject", archimateTypeId: "data-object", layer: "application", aspect: "passive", manyToOne: true },
  { kind: "store", form: "file", archimateElement: "DataObject", archimateTypeId: "data-object", layer: "application", aspect: "passive", manyToOne: true },
  { kind: "store", form: "database", archimateElement: "DataObject", archimateTypeId: "data-object", layer: "application", aspect: "passive", manyToOne: true },
  { kind: "store", form: "object-store", archimateElement: "DataObject", archimateTypeId: "data-object", layer: "application", aspect: "passive", manyToOne: true },
  { kind: "store", form: "graph", archimateElement: "DataObject", archimateTypeId: "data-object", layer: "application", aspect: "passive", manyToOne: true },
  { kind: "artifact", form: "skill", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "artifact", form: "manifest", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "artifact", form: "schema", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "artifact", form: "doc", archimateElement: "Artifact", archimateTypeId: "artifact", layer: "technology", aspect: "passive", manyToOne: true },
  { kind: "host", form: "workstation", archimateElement: "Device", archimateTypeId: "device", layer: "technology", aspect: "active", manyToOne: false },
  { kind: "host", form: "cluster", archimateElement: "Node", archimateTypeId: "node", layer: "technology", aspect: "active", manyToOne: true },
  { kind: "host", form: "cloud-project", archimateElement: "Node", archimateTypeId: "node", layer: "technology", aspect: "active", manyToOne: true },
]);

/** proposed: 15-row archi@1 relation -> ArchiMate 3.x relationship table (P-6 §2). */
export const ARCHI_ARCHIMATE_RELATIONSHIP_TABLE: readonly ArchiArchimateRelationshipRow[] = deepFreeze([
  {
    relationType: "partOf",
    nominalRelationship: "Composition",
    nominalTypeId: "composition",
    direction: "swapped",
    associationFallback: [{ sourceKind: "component", targetKind: "package" }],
  },
  {
    relationType: "managedIn",
    nominalRelationship: "Association",
    nominalTypeId: "association",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "runsOn",
    nominalRelationship: "Assignment",
    nominalTypeId: "assignment",
    direction: "swapped",
    associationFallback: [
      { sourceKind: "runtime", targetKind: "host" },
      { sourceKind: "service", targetKind: "host" },
    ],
  },
  {
    relationType: "ownedBy",
    nominalRelationship: "Association",
    nominalTypeId: "association",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "operatedBy",
    nominalRelationship: "Association",
    nominalTypeId: "association",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "deployedAs",
    nominalRelationship: "Realization",
    nominalTypeId: "realization",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "dependsOn",
    nominalRelationship: "Association",
    nominalTypeId: "association",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "executedBy",
    nominalRelationship: "Realization",
    nominalTypeId: "realization",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "loadedBy",
    nominalRelationship: "Realization",
    nominalTypeId: "realization",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "invokes",
    nominalRelationship: "Triggering",
    nominalTypeId: "triggering",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "providesApi",
    nominalRelationship: "Realization",
    nominalTypeId: "realization",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "consumesApi",
    nominalRelationship: "Serving",
    nominalTypeId: "serving",
    direction: "swapped",
    associationFallback: [],
  },
  {
    relationType: "uses",
    nominalRelationship: "Serving",
    nominalTypeId: "serving",
    direction: "swapped",
    associationFallback: [],
  },
  {
    relationType: "accesses",
    nominalRelationship: "Access",
    nominalTypeId: "access",
    direction: "forward",
    associationFallback: [],
  },
  {
    relationType: "documents",
    nominalRelationship: "Association",
    nominalTypeId: "association",
    direction: "forward",
    associationFallback: [],
  },
]);

const FORM_KINDS = [
  "actor",
  "package",
  "runtime",
  "api",
  "store",
  "artifact",
  "host",
] as const;

/** proposed: 23-row archi-* property vocabulary in canonical emission order (P-6 §4). */
export const ARCHI_ARCHIMATE_PROPERTIES: readonly ArchiArchimatePropertyDef[] = deepFreeze([
  { name: "archi-carrier", identifier: "propdef-archi-carrier", scope: ["model"], presence: "per-pair" },
  { name: "archi-ref", identifier: "propdef-archi-ref", scope: ["model", "element", "relationship", "view"], presence: "required" },
  { name: "archi-kind", identifier: "propdef-archi-kind", scope: ["element"], presence: "required" },
  { name: "archi-form", identifier: "propdef-archi-form", scope: ["element"], appliesTo: FORM_KINDS, attribute: "form", presence: "if-present" },
  { name: "archi-relation-type", identifier: "propdef-archi-relation-type", scope: ["relationship"], presence: "required" },
  { name: "archi-lifecycle", identifier: "propdef-archi-lifecycle", scope: ["element", "relationship"], attribute: "lifecycle", presence: "required" },
  { name: "archi-evidence-1", identifier: "propdef-archi-evidence-1", scope: ["element", "relationship"], attribute: "evidence", presence: "required" },
  { name: "archi-evidence-2", identifier: "propdef-archi-evidence-2", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-evidence-3", identifier: "propdef-archi-evidence-3", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-evidence-4", identifier: "propdef-archi-evidence-4", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-evidence-5", identifier: "propdef-archi-evidence-5", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-evidence-6", identifier: "propdef-archi-evidence-6", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-evidence-7", identifier: "propdef-archi-evidence-7", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-evidence-8", identifier: "propdef-archi-evidence-8", scope: ["element", "relationship"], attribute: "evidence", presence: "if-present" },
  { name: "archi-short-name", identifier: "propdef-archi-short-name", scope: ["element"], attribute: "shortName", presence: "if-present" },
  { name: "archi-category", identifier: "propdef-archi-category", scope: ["element"], attribute: "category", presence: "if-present" },
  { name: "archi-url", identifier: "propdef-archi-url", scope: ["element"], appliesTo: ["repo"], attribute: "url", presence: "if-present" },
  { name: "archi-version", identifier: "propdef-archi-version", scope: ["element"], appliesTo: ["package"], attribute: "version", presence: "if-present" },
  { name: "archi-access", identifier: "propdef-archi-access", scope: ["element"], appliesTo: ["api"], attribute: "access", presence: "required" },
  { name: "archi-writer-policy", identifier: "propdef-archi-writer-policy", scope: ["element"], appliesTo: ["store"], attribute: "writerPolicy", presence: "required" },
  { name: "archi-trigger", identifier: "propdef-archi-trigger", scope: ["relationship"], appliesTo: ["invokes"], attribute: "trigger", presence: "required" },
  { name: "archi-event", identifier: "propdef-archi-event", scope: ["relationship"], appliesTo: ["invokes"], attribute: "event", presence: "if-present" },
  { name: "archi-mode", identifier: "propdef-archi-mode", scope: ["relationship"], appliesTo: ["accesses"], attribute: "mode", presence: "required" },
]);

// Precomputed lookup indices from the frozen tables
const KIND_FORMS: ReadonlyMap<
  string,
  { readonly required: boolean; readonly values: ReadonlySet<string> | null }
> = (() => {
  const byKind = new Map<string, { hasFormless: boolean; forms: Set<string> }>();
  for (const row of ARCHI_ARCHIMATE_ELEMENT_TABLE) {
    let entry = byKind.get(row.kind);
    if (!entry) {
      entry = { hasFormless: false, forms: new Set<string>() };
      byKind.set(row.kind, entry);
    }
    if (row.form === undefined) {
      entry.hasFormless = true;
    } else {
      entry.forms.add(row.form);
    }
  }
  const out = new Map<
    string,
    { readonly required: boolean; readonly values: ReadonlySet<string> | null }
  >();
  for (const [kind, entry] of byKind.entries()) {
    out.set(kind, {
      required: !entry.hasFormless,
      values: entry.forms.size > 0 ? entry.forms : null,
    });
  }
  return out;
})();

const ELEMENT_MAPPING_BY_KEY = new Map<string, ArchiArchimateElementMapping>(
  ARCHI_ARCHIMATE_ELEMENT_TABLE.map((row) => {
    const key = `${row.kind}::${row.form ?? ""}`;
    const mapping: ArchiArchimateElementMapping = deepFreeze({
      ...row,
      properties:
        row.form !== undefined
          ? { "archi-kind": row.kind, "archi-form": row.form }
          : { "archi-kind": row.kind },
    });
    return [key, mapping];
  }),
);

const MAPPED_ARCHIMATE_TYPE_IDS: ReadonlySet<string> = new Set(
  ARCHI_ARCHIMATE_ELEMENT_TABLE.map((r) => r.archimateTypeId),
);

const RELATION_ROW_BY_TYPE = new Map<string, ArchiArchimateRelationshipRow>(
  ARCHI_ARCHIMATE_RELATIONSHIP_TABLE.map((r) => [r.relationType, r]),
);

const ARCHI1_TUPLE_SET: ReadonlySet<string> = new Set(
  ARCHI1_TUPLES.map((t) => `${t.relationType}::${t.sourceType}::${t.targetType}`),
);

const PROP_DEF_BY_NAME = new Map<string, ArchiArchimatePropertyDef>(
  ARCHI_ARCHIMATE_PROPERTIES.map((p) => [p.name, p]),
);

const LIFECYCLE_VALUES: ReadonlySet<string> = new Set(["current", "proposed", "retired"]);
const ACCESS_VALUES: ReadonlySet<string> = new Set(["read-only", "read-write"]);
const WRITER_POLICY_VALUES: ReadonlySet<string> = new Set(["single-writer", "multi-writer"]);
const TRIGGER_VALUES: ReadonlySet<string> = new Set([
  "hook",
  "poll",
  "mcp-stdio",
  "command",
  "schedule",
]);
const MODE_VALUES: ReadonlySet<string> = new Set(["read", "append", "write"]);

/** proposed: forward concept/model ref -> ArchiMate NCName identifier bijection (P-6 §3, §5). */
export function archimateIdOf(
  ref: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<string> {
  const subjectRef = resolveSubjectRef(options);
  if (typeof ref !== "string" || !ARCHI_REF_RE.test(ref)) {
    return fail(
      "archi-input-invalid",
      "",
      subjectRef,
      "Expected a document:, entity:, or relation: reference matching ARCHI_REF_RE.",
    );
  }
  return { ok: true, value: ref.replace(":", "_") };
}

/** proposed: reverse ArchiMate NCName identifier -> concept/model ref bijection (P-6 §3, §5). */
export function archiRefOfArchimateId(
  id: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<string> {
  const subjectRef = resolveSubjectRef(options);
  if (typeof id !== "string" || !ARCHIMATE_ID_RE.test(id)) {
    return fail(
      "archi-input-invalid",
      "",
      subjectRef,
      "Expected an ArchiMate identifier matching ARCHIMATE_ID_RE.",
    );
  }
  return { ok: true, value: id.replace("_", ":") };
}

/** proposed: forward (viewRef, collapsed) -> ArchiMate view NCName identifier bijection (P-6 §3, §5). */
export function archimateViewIdOf(
  viewRef: unknown,
  collapsed: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<string> {
  const subjectRef = resolveSubjectRef(options);
  try {
    if (typeof viewRef !== "string" || !VIEW_REF_RE.test(viewRef)) {
      return fail(
        "archi-input-invalid",
        "/viewRef",
        subjectRef,
        "viewRef must match ^view:[a-z][a-z0-9-]{0,39}$.",
      );
    }
    if (!Array.isArray(collapsed)) {
      return fail(
        "archi-input-invalid",
        "/collapsed",
        subjectRef,
        "collapsed must be an array of strictly ascending entity:<local> refs.",
      );
    }
    const seen = new Set<string>();
    const eids: string[] = [];
    for (let i = 0; i < collapsed.length; i++) {
      const item = collapsed[i];
      if (typeof item !== "string" || !ENTITY_REF_RE.test(item)) {
        return fail(
          "archi-input-invalid",
          `/collapsed/${i}`,
          subjectRef,
          "collapsed entry must match ^entity:[a-z][a-z0-9-]{0,39}$.",
        );
      }
      if (seen.has(item)) {
        return fail(
          "archi-input-invalid",
          `/collapsed/${i}`,
          subjectRef,
          `Duplicate entity ref "${item}" in collapsed.`,
        );
      }
      if (i > 0 && (collapsed[i - 1] as string) > item) {
        return fail(
          "archi-input-invalid",
          `/collapsed/${i}`,
          subjectRef,
          "collapsed must be strictly ascending in UTF-16 code unit order.",
        );
      }
      seen.add(item);
      eids.push(toEid(item));
    }
    eids.sort(cmpAsciiBytes);
    const local = viewRef.slice("view:".length);
    const cToken = eids.length === 0 ? "-" : eids.join(".");
    return { ok: true, value: `view_${local}.${cToken}` };
  } catch {
    return fail("archi-input-invalid", "", subjectRef, "Unreadable view identifier input.");
  }
}

/** proposed: reverse ArchiMate view identifier -> (viewRef, collapsed) bijection (P-6 §3, §5). */
export function archiViewOfArchimateId(
  id: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<ArchiArchimateViewState> {
  const subjectRef = resolveSubjectRef(options);
  if (typeof id !== "string" || !ARCHIMATE_VIEW_ID_RE.test(id)) {
    return fail(
      "archi-input-invalid",
      "",
      subjectRef,
      "Expected an ArchiMate view identifier matching ARCHIMATE_VIEW_ID_RE.",
    );
  }
  const dotIdx = id.indexOf(".");
  const local = id.slice("view_".length, dotIdx);
  const cToken = id.slice(dotIdx + 1);
  if (cToken === "-") {
    return {
      ok: true,
      value: deepFreeze({ viewRef: `view:${local}`, collapsed: [] }),
    };
  }
  const eids = cToken.split(".");
  for (let i = 1; i < eids.length; i++) {
    if (eids[i - 1]! >= eids[i]!) {
      return fail(
        "archi-input-invalid",
        "",
        subjectRef,
        "View identifier EIDs must be strictly ascending in EID byte order without duplicates.",
      );
    }
  }
  const collapsed = eids.map(fromEid).sort(cmpAsciiBytes);
  return {
    ok: true,
    value: deepFreeze({ viewRef: `view:${local}`, collapsed }),
  };
}

const ELEMENT_INPUT_KEYS: ReadonlySet<string> = new Set(["kind", "form"]);

/** proposed: forward archi@1 (kind, form?) -> ArchiMate 3.x element mapping (P-6 §1, §5). */
export function archimateElementOf(
  input: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<ArchiArchimateElementMapping> {
  const subjectRef = resolveSubjectRef(options);
  try {
    if (!isPlainRecord(input)) {
      return fail("archi-input-invalid", "", subjectRef, "Expected a plain object { kind, form? }.");
    }
    for (const k of Object.keys(input)) {
      if (!ELEMENT_INPUT_KEYS.has(k)) {
        return fail(
          "archi-input-invalid",
          `/${esc(k)}`,
          subjectRef,
          `Unknown field "${k}" in archimateElementOf input.`,
        );
      }
    }
    const kind = Object.hasOwn(input, "kind") ? input["kind"] : undefined;
    const formSpec = typeof kind === "string" ? KIND_FORMS.get(kind) : undefined;
    if (typeof kind !== "string" || formSpec === undefined) {
      return fail(
        "archi-input-invalid",
        "/kind",
        subjectRef,
        `Unknown archi@1 entity kind "${String(kind)}".`,
      );
    }
    const form = Object.hasOwn(input, "form") ? input["form"] : undefined;
    if (form !== undefined) {
      if (typeof form !== "string" || formSpec.values === null || !formSpec.values.has(form)) {
        return fail(
          "archi-input-invalid",
          "/form",
          subjectRef,
          `Invalid or forbidden form "${String(form)}" for kind "${kind}".`,
        );
      }
    } else if (formSpec.required) {
      return fail(
        "archi-input-invalid",
        "/form",
        subjectRef,
        `Kind "${kind}" requires a closed form value.`,
      );
    }
    const mapping = ELEMENT_MAPPING_BY_KEY.get(`${kind}::${form ?? ""}`);
    if (!mapping) {
      return fail(
        "archi-input-invalid",
        "/form",
        subjectRef,
        `Invalid or missing form for kind "${kind}".`,
      );
    }
    return { ok: true, value: mapping };
  } catch {
    return fail("archi-input-invalid", "", subjectRef, "Unreadable element mapping input.");
  }
}

const REVERSE_ELEMENT_KEYS: ReadonlySet<string> = new Set([
  "archimateTypeId",
  "properties",
  "archimateElement",
  "layer",
  "aspect",
  "manyToOne",
  "kind",
  "form",
]);

/** proposed: reverse ArchiMate element -> archi@1 { kind, form? } mapping (P-6 §1, §5). */
export function archiEntityTypeOfArchimate(
  input: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<{ readonly kind: string; readonly form?: string }> {
  const subjectRef = resolveSubjectRef(options);
  try {
    // 1. Shape, unknown keys, and required archimateTypeId
    if (!isPlainRecord(input)) {
      return fail("archi-input-invalid", "", subjectRef, "Expected a plain object for ArchiMate element.");
    }
    for (const k of Object.keys(input)) {
      if (!REVERSE_ELEMENT_KEYS.has(k)) {
        return fail(
          "archi-input-invalid",
          `/${esc(k)}`,
          subjectRef,
          `Unknown field "${k}" in archiEntityTypeOfArchimate input.`,
        );
      }
    }
    const archimateTypeId = input["archimateTypeId"];
    if (typeof archimateTypeId !== "string" || archimateTypeId.length === 0) {
      return fail(
        "archi-input-invalid",
        "/archimateTypeId",
        subjectRef,
        `Missing or invalid required archimateTypeId "${String(archimateTypeId)}".`,
      );
    }

    // 2. properties object
    const props = input["properties"];
    if (!isPlainRecord(props)) {
      return fail(
        "archi-input-invalid",
        "/properties",
        subjectRef,
        "properties must be a plain object.",
      );
    }

    // 3. Mapped ArchiMate type check, then properties["archi-kind"] and properties["archi-form"]
    if (!MAPPED_ARCHIMATE_TYPE_IDS.has(archimateTypeId)) {
      return fail(
        "archi-input-invalid",
        "/archimateTypeId",
        subjectRef,
        `Unmapped archimateTypeId "${archimateTypeId}".`,
      );
    }
    const rawKind = Object.hasOwn(props, "archi-kind") ? props["archi-kind"] : undefined;
    if (rawKind === undefined || rawKind === "") {
      return fail(
        "archimate-kind-missing",
        "/properties/archi-kind",
        subjectRef,
        'Missing required property "archi-kind" on mapped ArchiMate element.',
      );
    }
    const formSpec = typeof rawKind === "string" ? KIND_FORMS.get(rawKind) : undefined;
    if (typeof rawKind !== "string" || formSpec === undefined) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-kind",
        subjectRef,
        `Invalid archi-kind "${String(rawKind)}".`,
      );
    }
    let recoveredForm: string | undefined;
    if (Object.hasOwn(props, "archi-form") && props["archi-form"] !== undefined) {
      const rawForm = props["archi-form"];
      if (typeof rawForm !== "string" || formSpec.values === null || !formSpec.values.has(rawForm)) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-form",
          subjectRef,
          `Invalid archi-form "${String(rawForm)}" for kind "${rawKind}".`,
        );
      }
      recoveredForm = rawForm;
    } else if (Object.hasOwn(props, "archi-form") || formSpec.required) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-form",
        subjectRef,
        `Missing required archi-form for kind "${rawKind}".`,
      );
    }

    for (const pk of Object.keys(props)) {
      if (pk !== "archi-kind" && pk !== "archi-form") {
        return fail(
          "archi-input-invalid",
          `/properties/${esc(pk)}`,
          subjectRef,
          `Unknown element mapping property "${pk}".`,
        );
      }
    }

    // 4. Equality against recovered forward output
    const expected = ELEMENT_MAPPING_BY_KEY.get(`${rawKind}::${recoveredForm ?? ""}`);
    if (!expected) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-form",
        subjectRef,
        `Invalid or missing archi-form for kind "${rawKind}".`,
      );
    }
    if (archimateTypeId !== expected.archimateTypeId) {
      return fail(
        "archi-input-invalid",
        "/archimateTypeId",
        subjectRef,
        `archimateTypeId "${archimateTypeId}" disagrees with kind "${rawKind}" (expected "${expected.archimateTypeId}").`,
      );
    }
    for (const optKey of ["archimateElement", "layer", "aspect", "manyToOne", "kind", "form"] as const) {
      if (Object.hasOwn(input, optKey) && input[optKey] !== expected[optKey]) {
        return fail(
          "archi-input-invalid",
          `/${optKey}`,
          subjectRef,
          `Field "${optKey}" disagrees with recovered element mapping.`,
        );
      }
    }

    const recovered: { readonly kind: string; readonly form?: string } = deepFreeze(
      recoveredForm !== undefined ? { kind: rawKind, form: recoveredForm } : { kind: rawKind },
    );
    return { ok: true, value: recovered };
  } catch {
    return fail("archi-input-invalid", "", subjectRef, "Unreadable reverse element mapping input.");
  }
}

const RELATIONSHIP_INPUT_KEYS: ReadonlySet<string> = new Set([
  "relationType",
  "source",
  "target",
  "mode",
  "trigger",
  "event",
]);

function prefixDiagPath(
  diag: ArchiArchimateDiagnostic,
  prefix: string,
): ArchiArchimateDiagnostic {
  const path = diag.path === "" ? prefix : `${prefix}${diag.path}`;
  return { ...diag, path };
}

/** proposed: forward archi@1 relation -> ArchiMate 3.x relationship mapping (P-6 §2, §5). */
export function archimateRelationshipOf(
  input: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<ArchiArchimateRelationshipMapping> {
  const subjectRef = resolveSubjectRef(options);
  try {
    if (!isPlainRecord(input)) {
      return fail("archi-input-invalid", "", subjectRef, "Expected a plain object for relationship input.");
    }
    for (const k of Object.keys(input)) {
      if (!RELATIONSHIP_INPUT_KEYS.has(k)) {
        return fail(
          "archi-input-invalid",
          `/${esc(k)}`,
          subjectRef,
          `Unknown field "${k}" in archimateRelationshipOf input.`,
        );
      }
    }
    const relationType = input["relationType"];
    if (typeof relationType !== "string" || !RELATION_ROW_BY_TYPE.has(relationType)) {
      return fail(
        "archi-input-invalid",
        "/relationType",
        subjectRef,
        `Unknown archi@1 relationType "${String(relationType)}".`,
      );
    }
    const srcRes = archimateElementOf(input["source"], { subjectRef });
    if (!srcRes.ok) {
      return { ok: false, diagnostics: [prefixDiagPath(srcRes.diagnostics[0], "/source")] };
    }
    const tgtRes = archimateElementOf(input["target"], { subjectRef });
    if (!tgtRes.ok) {
      return { ok: false, diagnostics: [prefixDiagPath(tgtRes.diagnostics[0], "/target")] };
    }

    if (!ARCHI1_TUPLE_SET.has(`${relationType}::${srcRes.value.kind}::${tgtRes.value.kind}`)) {
      return fail(
        "archi-input-invalid",
        "/target",
        subjectRef,
        `Tuple (${relationType}, ${srcRes.value.kind}, ${tgtRes.value.kind}) is not in ARCHI1_TUPLES.`,
      );
    }

    const rawMode = input["mode"];
    let mode: "read" | "append" | "write" | undefined;
    if (relationType === "accesses") {
      if (typeof rawMode !== "string" || !MODE_VALUES.has(rawMode)) {
        return fail(
          "archi-input-invalid",
          "/mode",
          subjectRef,
          'Relation "accesses" requires mode in "read" | "append" | "write".',
        );
      }
      mode = rawMode as "read" | "append" | "write";
    } else if (rawMode !== undefined) {
      return fail(
        "archi-input-invalid",
        "/mode",
        subjectRef,
        `Field "mode" is not allowed on relationType "${relationType}".`,
      );
    }

    const rawTrigger = input["trigger"];
    const rawEvent = input["event"];
    let trigger: string | undefined;
    let event: string | undefined;
    if (relationType === "invokes") {
      if (typeof rawTrigger !== "string" || !TRIGGER_VALUES.has(rawTrigger)) {
        return fail(
          "archi-input-invalid",
          "/trigger",
          subjectRef,
          'Relation "invokes" requires trigger in "hook" | "poll" | "mcp-stdio" | "command" | "schedule".',
        );
      }
      trigger = rawTrigger;
      if (rawEvent !== undefined) {
        if (!isWellFormedSingleLineNfc(rawEvent, 0, 80)) {
          return fail(
            "archi-input-invalid",
            "/event",
            subjectRef,
            'Relation "invokes" optional event must be a single-line NFC string of length 0..80.',
          );
        }
        event = rawEvent;
      }
    } else {
      if (rawTrigger !== undefined) {
        return fail(
          "archi-input-invalid",
          "/trigger",
          subjectRef,
          `Field "trigger" is not allowed on relationType "${relationType}".`,
        );
      }
      if (rawEvent !== undefined) {
        return fail(
          "archi-input-invalid",
          "/event",
          subjectRef,
          `Field "event" is not allowed on relationType "${relationType}".`,
        );
      }
    }

    const row = RELATION_ROW_BY_TYPE.get(relationType)!;
    const usedAssociationFallback = row.associationFallback.some(
      (f) => f.sourceKind === srcRes.value.kind && f.targetKind === tgtRes.value.kind,
    );
    const archimateRelationship = usedAssociationFallback ? "Association" : row.nominalRelationship;
    const archimateTypeId = usedAssociationFallback ? "association" : row.nominalTypeId;
    const archimateSource = row.direction === "swapped" ? tgtRes.value : srcRes.value;
    const archimateTarget = row.direction === "swapped" ? srcRes.value : tgtRes.value;

    const properties: Record<string, string> = {
      "archi-relation-type": relationType,
    };
    if (trigger !== undefined) properties["archi-trigger"] = trigger;
    if (event !== undefined) properties["archi-event"] = event;
    if (mode !== undefined) properties["archi-mode"] = mode;

    const mapping: ArchiArchimateRelationshipMapping = deepFreeze({
      archimateRelationship,
      archimateTypeId,
      nominalRelationship: row.nominalRelationship,
      nominalTypeId: row.nominalTypeId,
      direction: row.direction,
      usedAssociationFallback,
      archimateSource,
      archimateTarget,
      ...(archimateTypeId === "association" ? { directed: true as const } : {}),
      ...(archimateTypeId === "access"
        ? { accessMode: (mode === "read" ? "read" : "write") as "read" | "write" }
        : {}),
      properties,
    });
    return { ok: true, value: mapping };
  } catch {
    return fail("archi-input-invalid", "", subjectRef, "Unreadable relationship mapping input.");
  }
}

const REVERSE_RELATIONSHIP_KEYS: ReadonlySet<string> = new Set([
  "archimateTypeId",
  "archimateSource",
  "archimateTarget",
  "properties",
  "directed",
  "accessMode",
  "archimateRelationship",
  "nominalRelationship",
  "nominalTypeId",
  "direction",
  "usedAssociationFallback",
]);

const REVERSE_REL_PROP_KEYS: ReadonlySet<string> = new Set([
  "archi-relation-type",
  "archi-mode",
  "archi-trigger",
  "archi-event",
]);

/** proposed: reverse ArchiMate relationship -> archi@1 relation mapping (P-6 §2, §5). */
export function archiRelationTypeOfArchimate(
  input: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<ArchiArchimateRelationReversed> {
  const subjectRef = resolveSubjectRef(options);
  try {
    // 1. Shape, unknown keys, and required top-level type / modifier fields
    if (!isPlainRecord(input)) {
      return fail(
        "archi-input-invalid",
        "",
        subjectRef,
        "Expected a plain object for ArchiMate relationship.",
      );
    }
    for (const k of Object.keys(input)) {
      if (!REVERSE_RELATIONSHIP_KEYS.has(k)) {
        return fail(
          "archi-input-invalid",
          `/${esc(k)}`,
          subjectRef,
          `Unknown field "${k}" in archiRelationTypeOfArchimate input.`,
        );
      }
    }
    const archimateTypeId = input["archimateTypeId"];
    if (typeof archimateTypeId !== "string" || archimateTypeId.length === 0) {
      return fail(
        "archi-input-invalid",
        "/archimateTypeId",
        subjectRef,
        "Missing or invalid required archimateTypeId.",
      );
    }

    // 2. properties object
    const props = input["properties"];
    if (!isPlainRecord(props)) {
      return fail(
        "archi-input-invalid",
        "/properties",
        subjectRef,
        "properties must be a plain object.",
      );
    }

    // 3. properties["archi-relation-type"] and relation-specific properties
    const relationType = props["archi-relation-type"];
    if (
      typeof relationType !== "string" ||
      relationType.length === 0 ||
      !RELATION_ROW_BY_TYPE.has(relationType)
    ) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-relation-type",
        subjectRef,
        'Missing or unknown required "archi-relation-type" property.',
      );
    }
    for (const pk of Object.keys(props)) {
      if (!REVERSE_REL_PROP_KEYS.has(pk)) {
        return fail(
          "archi-input-invalid",
          `/properties/${esc(pk)}`,
          subjectRef,
          `Unknown relationship mapping property "${pk}".`,
        );
      }
    }

    let mode: string | undefined;
    if (relationType === "accesses") {
      const rawMode = Object.hasOwn(props, "archi-mode") ? props["archi-mode"] : undefined;
      if (typeof rawMode !== "string" || !MODE_VALUES.has(rawMode)) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-mode",
          subjectRef,
          'Relation "accesses" requires "archi-mode" in "read" | "append" | "write".',
        );
      }
      mode = rawMode;
    } else if (Object.hasOwn(props, "archi-mode") && props["archi-mode"] !== undefined) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-mode",
        subjectRef,
        `"archi-mode" is not allowed on relationType "${relationType}".`,
      );
    }

    let trigger: string | undefined;
    let event: string | undefined;
    if (relationType === "invokes") {
      const rawTrigger = Object.hasOwn(props, "archi-trigger") ? props["archi-trigger"] : undefined;
      if (typeof rawTrigger !== "string" || !TRIGGER_VALUES.has(rawTrigger)) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-trigger",
          subjectRef,
          'Relation "invokes" requires a valid "archi-trigger" property.',
        );
      }
      trigger = rawTrigger;
      if (Object.hasOwn(props, "archi-event") && props["archi-event"] !== undefined) {
        const rawEvent = props["archi-event"];
        if (!isWellFormedSingleLineNfc(rawEvent, 0, 80)) {
          return fail(
            "archi-input-invalid",
            "/properties/archi-event",
            subjectRef,
            '"archi-event" must be a single-line NFC string of length 0..80.',
          );
        }
        event = rawEvent;
      } else if (Object.hasOwn(props, "archi-event")) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-event",
          subjectRef,
          '"archi-event" must be a string when present.',
        );
      }
    } else {
      if (Object.hasOwn(props, "archi-trigger")) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-trigger",
          subjectRef,
          `"archi-trigger" is not allowed on relationType "${relationType}".`,
        );
      }
      if (Object.hasOwn(props, "archi-event")) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-event",
          subjectRef,
          `"archi-event" is not allowed on relationType "${relationType}".`,
        );
      }
    }

    // 4. Endpoints (un-swapped via table row direction)
    const aSrcRes = archiEntityTypeOfArchimate(input["archimateSource"], { subjectRef });
    if (!aSrcRes.ok) {
      return {
        ok: false,
        diagnostics: [prefixDiagPath(aSrcRes.diagnostics[0], "/archimateSource")],
      };
    }
    const aTgtRes = archiEntityTypeOfArchimate(input["archimateTarget"], { subjectRef });
    if (!aTgtRes.ok) {
      return {
        ok: false,
        diagnostics: [prefixDiagPath(aTgtRes.diagnostics[0], "/archimateTarget")],
      };
    }

    const row = RELATION_ROW_BY_TYPE.get(relationType)!;
    const source = row.direction === "swapped" ? aTgtRes.value : aSrcRes.value;
    const target = row.direction === "swapped" ? aSrcRes.value : aTgtRes.value;

    // 5. Equality against recovered forward relationship output
    const recovered: ArchiArchimateRelationReversed = deepFreeze({
      relationType,
      ...(mode !== undefined ? { mode } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(event !== undefined ? { event } : {}),
      source,
      target,
    });
    const fwdRes = archimateRelationshipOf(recovered, { subjectRef });
    if (!fwdRes.ok) {
      return fail(
        "archi-input-invalid",
        row.direction === "swapped" ? "/archimateSource" : "/archimateTarget",
        subjectRef,
        fwdRes.diagnostics[0].message,
      );
    }
    const expected = fwdRes.value;

    if (archimateTypeId !== expected.archimateTypeId) {
      return fail(
        "archi-input-invalid",
        "/archimateTypeId",
        subjectRef,
        `archimateTypeId "${archimateTypeId}" disagrees with recovered relationship (expected "${expected.archimateTypeId}").`,
      );
    }
    if (expected.archimateTypeId === "association" && input["directed"] !== true) {
      return fail(
        "archi-input-invalid",
        "/directed",
        subjectRef,
        'Association relationships require "directed: true".',
      );
    }
    if (expected.archimateTypeId === "access" && input["accessMode"] !== expected.accessMode) {
      return fail(
        "archi-input-invalid",
        "/accessMode",
        subjectRef,
        `Access relationship requires accessMode "${String(expected.accessMode)}".`,
      );
    }
    for (const key of [
      "archimateRelationship",
      "nominalRelationship",
      "nominalTypeId",
      "direction",
      "usedAssociationFallback",
      "directed",
      "accessMode",
    ] as const) {
      if (Object.hasOwn(input, key) && input[key] !== expected[key]) {
        return fail(
          "archi-input-invalid",
          `/${key}`,
          subjectRef,
          `Field "${key}" disagrees with recovered relationship mapping.`,
        );
      }
    }

    return { ok: true, value: recovered };
  } catch {
    return fail(
      "archi-input-invalid",
      "",
      subjectRef,
      "Unreadable reverse relationship mapping input.",
    );
  }
}

const RECORD_INPUT_KEYS: ReadonlySet<string> = new Set([
  "ref",
  "kind",
  "relationType",
  "attributes",
]);

const ENTITY_COMMON_ATTRS: ReadonlySet<string> = new Set([
  "name",
  "role",
  "shortName",
  "lifecycle",
  "evidence",
  "category",
]);

function allowedEntityAttrs(kind: string): Set<string> {
  const s = new Set<string>(ENTITY_COMMON_ATTRS);
  const formSpec = KIND_FORMS.get(kind);
  if (formSpec !== undefined && formSpec.values !== null) s.add("form");
  if (kind === "repo") s.add("url");
  if (kind === "package") s.add("version");
  if (kind === "api") s.add("access");
  if (kind === "store") s.add("writerPolicy");
  return s;
}

function allowedRelationAttrs(relationType: string): Set<string> {
  const s = new Set<string>(["label", "lifecycle", "evidence"]);
  if (relationType === "invokes") {
    s.add("trigger");
    s.add("event");
  }
  if (relationType === "accesses") {
    s.add("mode");
  }
  return s;
}

function readTypedScalarAttr(
  attrs: Record<string, unknown>,
  attrName: string,
  expectedKind: "text" | "enum",
): { readonly ok: true; readonly value: string | undefined } | { readonly ok: false; readonly path: string } {
  if (!Object.hasOwn(attrs, attrName) || attrs[attrName] === undefined) {
    return { ok: true, value: undefined };
  }
  const raw = attrs[attrName];
  if (!isPlainRecord(raw)) {
    return { ok: false, path: `/attributes/${attrName}` };
  }
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !keys.includes("kind") || !keys.includes("value")) {
    return { ok: false, path: `/attributes/${attrName}` };
  }
  if (raw["kind"] !== expectedKind || typeof raw["value"] !== "string") {
    return { ok: false, path: `/attributes/${attrName}` };
  }
  return { ok: true, value: raw["value"] };
}

function readEvidenceAttr(
  attrs: Record<string, unknown>,
): { readonly ok: true; readonly items: readonly string[] } | { readonly ok: false; readonly path: string } {
  const raw = Object.hasOwn(attrs, "evidence") ? attrs["evidence"] : undefined;
  if (!isPlainRecord(raw)) {
    return { ok: false, path: "/attributes/evidence" };
  }
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !keys.includes("kind") || !keys.includes("items")) {
    return { ok: false, path: "/attributes/evidence" };
  }
  if (raw["kind"] !== "collection" || !Array.isArray(raw["items"])) {
    return { ok: false, path: "/attributes/evidence" };
  }
  const items = raw["items"];
  if (items.length < 1 || items.length > 8) {
    return { ok: false, path: "/attributes/evidence" };
  }
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isPlainRecord(item)) {
      return { ok: false, path: `/attributes/evidence/items/${i}` };
    }
    const ik = Object.keys(item);
    if (ik.length !== 2 || !ik.includes("kind") || !ik.includes("value") || item["kind"] !== "text") {
      return { ok: false, path: `/attributes/evidence/items/${i}` };
    }
    if (!isWellFormedSingleLineNfc(item["value"], 0, 200)) {
      return { ok: false, path: `/attributes/evidence/items/${i}` };
    }
    out.push(item["value"]);
  }
  return { ok: true, items: out };
}

/** proposed: forward archi record -> canonical 23-vocabulary archi-* properties map (P-6 §4, §5). */
export function archimatePropertiesOf(
  record: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<Readonly<Record<string, string>>> {
  const subjectRef = resolveSubjectRef(options);
  try {
    if (!isPlainRecord(record)) {
      return fail("archi-input-invalid", "", subjectRef, "Expected a plain record object.");
    }
    for (const k of Object.keys(record)) {
      if (!RECORD_INPUT_KEYS.has(k)) {
        return fail(
          "archi-input-invalid",
          `/${esc(k)}`,
          subjectRef,
          `Unknown field "${k}" in archimatePropertiesOf input.`,
        );
      }
    }
    const ref = record["ref"];
    if (typeof ref !== "string" || !ANY_ARCHI_REF_RE.test(ref)) {
      return fail(
        "archi-input-invalid",
        "/ref",
        subjectRef,
        "ref must match ^(document|entity|relation|view):[a-z][a-z0-9-]{0,39}$.",
      );
    }

    const ns = ref.slice(0, ref.indexOf(":"));
    const rawKind = record["kind"];
    const rawRelationType = record["relationType"];
    const rawAttrs = record["attributes"];

    if (ns === "document" || ns === "view") {
      if (rawKind !== undefined) {
        return fail("archi-input-invalid", "/kind", subjectRef, `"kind" is not allowed on a ${ns} record.`);
      }
      if (rawRelationType !== undefined) {
        return fail(
          "archi-input-invalid",
          "/relationType",
          subjectRef,
          `"relationType" is not allowed on a ${ns} record.`,
        );
      }
      if (rawAttrs !== undefined) {
        if (!isPlainRecord(rawAttrs)) {
          return fail("archi-input-invalid", "/attributes", subjectRef, "attributes must be a plain object.");
        }
        const ak = Object.keys(rawAttrs);
        if (ak.length > 0) {
          return fail(
            "archi-input-invalid",
            `/attributes/${esc(ak[0]!)}`,
            subjectRef,
            `Unexpected attribute "${ak[0]!}" on a ${ns} record.`,
          );
        }
      }
      return { ok: true, value: deepFreeze({ "archi-ref": ref }) };
    }

    if (ns === "entity") {
      if (rawRelationType !== undefined) {
        return fail(
          "archi-input-invalid",
          "/relationType",
          subjectRef,
          '"relationType" is not allowed on an entity record.',
        );
      }
      const formSpec = typeof rawKind === "string" ? KIND_FORMS.get(rawKind) : undefined;
      if (typeof rawKind !== "string" || formSpec === undefined) {
        return fail(
          "archi-input-invalid",
          "/kind",
          subjectRef,
          `Missing or unknown entity kind "${String(rawKind)}".`,
        );
      }
      if (!isPlainRecord(rawAttrs)) {
        return fail("archi-input-invalid", "/attributes", subjectRef, "Entity attributes must be a plain object.");
      }
      const allowed = allowedEntityAttrs(rawKind);
      for (const ak of Object.keys(rawAttrs)) {
        if (!allowed.has(ak)) {
          return fail(
            "archi-input-invalid",
            `/attributes/${esc(ak)}`,
            subjectRef,
            `Attribute "${ak}" is not allowed on entity kind "${rawKind}".`,
          );
        }
      }

      const formRes = readTypedScalarAttr(rawAttrs, "form", "enum");
      if (!formRes.ok) return fail("archi-input-invalid", formRes.path, subjectRef, "Invalid form attribute.");
      if (formRes.value !== undefined) {
        if (formSpec.values === null || !formSpec.values.has(formRes.value)) {
          return fail("archi-input-invalid", "/attributes/form", subjectRef, "Invalid form value.");
        }
      } else if (formSpec.required) {
        return fail("archi-input-invalid", "/attributes/form", subjectRef, "Missing required form attribute.");
      }

      const lcRes = readTypedScalarAttr(rawAttrs, "lifecycle", "enum");
      if (!lcRes.ok || lcRes.value === undefined || !LIFECYCLE_VALUES.has(lcRes.value)) {
        return fail(
          "archi-input-invalid",
          "/attributes/lifecycle",
          subjectRef,
          "Missing or invalid required lifecycle attribute.",
        );
      }

      const evRes = readEvidenceAttr(rawAttrs);
      if (!evRes.ok) {
        return fail("archi-input-invalid", evRes.path, subjectRef, "Missing or invalid required evidence attribute.");
      }

      const shortNameRes = readTypedScalarAttr(rawAttrs, "shortName", "text");
      if (
        !shortNameRes.ok ||
        (shortNameRes.value !== undefined && !isWellFormedSingleLineNfc(shortNameRes.value, 0, 40))
      ) {
        return fail("archi-input-invalid", "/attributes/shortName", subjectRef, "Invalid shortName attribute.");
      }

      const categoryRes = readTypedScalarAttr(rawAttrs, "category", "text");
      if (
        !categoryRes.ok ||
        (categoryRes.value !== undefined &&
          (!isWellFormedSingleLineNfc(categoryRes.value, 1, 40) || !KEY_RE.test(categoryRes.value)))
      ) {
        return fail("archi-input-invalid", "/attributes/category", subjectRef, "Invalid category attribute.");
      }

      const urlRes = readTypedScalarAttr(rawAttrs, "url", "text");
      if (!urlRes.ok || (urlRes.value !== undefined && !isWellFormedSingleLineNfc(urlRes.value, 0, 200))) {
        return fail("archi-input-invalid", "/attributes/url", subjectRef, "Invalid url attribute.");
      }

      const versionRes = readTypedScalarAttr(rawAttrs, "version", "text");
      if (
        !versionRes.ok ||
        (versionRes.value !== undefined && !isWellFormedSingleLineNfc(versionRes.value, 0, 40))
      ) {
        return fail("archi-input-invalid", "/attributes/version", subjectRef, "Invalid version attribute.");
      }

      const accessRes = readTypedScalarAttr(rawAttrs, "access", "enum");
      if (
        !accessRes.ok ||
        (rawKind === "api" && (accessRes.value === undefined || !ACCESS_VALUES.has(accessRes.value)))
      ) {
        return fail("archi-input-invalid", "/attributes/access", subjectRef, "Missing or invalid access attribute.");
      }

      const wpRes = readTypedScalarAttr(rawAttrs, "writerPolicy", "enum");
      if (
        !wpRes.ok ||
        (rawKind === "store" && (wpRes.value === undefined || !WRITER_POLICY_VALUES.has(wpRes.value)))
      ) {
        return fail(
          "archi-input-invalid",
          "/attributes/writerPolicy",
          subjectRef,
          "Missing or invalid writerPolicy attribute.",
        );
      }

      // Emit in exact §4 canonical order
      const out: Record<string, string> = {
        "archi-ref": ref,
        "archi-kind": rawKind,
      };
      if (formRes.value !== undefined) out["archi-form"] = formRes.value;
      out["archi-lifecycle"] = lcRes.value;
      for (let i = 0; i < evRes.items.length; i++) {
        out[`archi-evidence-${i + 1}`] = evRes.items[i]!;
      }
      if (shortNameRes.value !== undefined) out["archi-short-name"] = shortNameRes.value;
      if (categoryRes.value !== undefined) out["archi-category"] = categoryRes.value;
      if (urlRes.value !== undefined) out["archi-url"] = urlRes.value;
      if (versionRes.value !== undefined) out["archi-version"] = versionRes.value;
      if (accessRes.value !== undefined) out["archi-access"] = accessRes.value;
      if (wpRes.value !== undefined) out["archi-writer-policy"] = wpRes.value;

      return { ok: true, value: deepFreeze(out) };
    }

    // ns === "relation"
    if (rawKind !== undefined) {
      return fail("archi-input-invalid", "/kind", subjectRef, '"kind" is not allowed on a relation record.');
    }
    if (typeof rawRelationType !== "string" || !RELATION_ROW_BY_TYPE.has(rawRelationType)) {
      return fail(
        "archi-input-invalid",
        "/relationType",
        subjectRef,
        `Missing or unknown relationType "${String(rawRelationType)}".`,
      );
    }
    if (!isPlainRecord(rawAttrs)) {
      return fail("archi-input-invalid", "/attributes", subjectRef, "Relation attributes must be a plain object.");
    }
    const allowed = allowedRelationAttrs(rawRelationType);
    for (const ak of Object.keys(rawAttrs)) {
      if (!allowed.has(ak)) {
        return fail(
          "archi-input-invalid",
          `/attributes/${esc(ak)}`,
          subjectRef,
          `Attribute "${ak}" is not allowed on relationType "${rawRelationType}".`,
        );
      }
    }

    const lcRes = readTypedScalarAttr(rawAttrs, "lifecycle", "enum");
    if (!lcRes.ok || lcRes.value === undefined || !LIFECYCLE_VALUES.has(lcRes.value)) {
      return fail(
        "archi-input-invalid",
        "/attributes/lifecycle",
        subjectRef,
        "Missing or invalid required lifecycle attribute.",
      );
    }

    const evRes = readEvidenceAttr(rawAttrs);
    if (!evRes.ok) {
      return fail("archi-input-invalid", evRes.path, subjectRef, "Missing or invalid required evidence attribute.");
    }

    const triggerRes = readTypedScalarAttr(rawAttrs, "trigger", "enum");
    if (
      !triggerRes.ok ||
      (rawRelationType === "invokes" &&
        (triggerRes.value === undefined || !TRIGGER_VALUES.has(triggerRes.value)))
    ) {
      return fail("archi-input-invalid", "/attributes/trigger", subjectRef, "Missing or invalid trigger attribute.");
    }

    const eventRes = readTypedScalarAttr(rawAttrs, "event", "text");
    if (!eventRes.ok || (eventRes.value !== undefined && !isWellFormedSingleLineNfc(eventRes.value, 0, 80))) {
      return fail("archi-input-invalid", "/attributes/event", subjectRef, "Invalid event attribute.");
    }

    const modeRes = readTypedScalarAttr(rawAttrs, "mode", "enum");
    if (
      !modeRes.ok ||
      (rawRelationType === "accesses" && (modeRes.value === undefined || !MODE_VALUES.has(modeRes.value)))
    ) {
      return fail("archi-input-invalid", "/attributes/mode", subjectRef, "Missing or invalid mode attribute.");
    }

    // Emit in exact §4 canonical order
    const out: Record<string, string> = {
      "archi-ref": ref,
      "archi-relation-type": rawRelationType,
      "archi-lifecycle": lcRes.value,
    };
    for (let i = 0; i < evRes.items.length; i++) {
      out[`archi-evidence-${i + 1}`] = evRes.items[i]!;
    }
    if (triggerRes.value !== undefined) out["archi-trigger"] = triggerRes.value;
    if (eventRes.value !== undefined) out["archi-event"] = eventRes.value;
    if (modeRes.value !== undefined) out["archi-mode"] = modeRes.value;

    return { ok: true, value: deepFreeze(out) };
  } catch {
    return fail("archi-input-invalid", "", subjectRef, "Unreadable record input.");
  }
}

const CONTEXT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "relationType",
  "scope",
  "identifier",
]);

type ArchiConceptScope = "model" | "element" | "relationship" | "view";

function validateEvidenceFromProps(
  props: Record<string, unknown>,
  subjectRef: string,
): ArchiArchimateResult<readonly { readonly kind: "text"; readonly value: string }[]> {
  if (!Object.hasOwn(props, "archi-evidence-1") || props["archi-evidence-1"] === undefined) {
    return fail(
      "archi-input-invalid",
      "/properties/archi-evidence-1",
      subjectRef,
      'Missing required property "archi-evidence-1".',
    );
  }
  const items: { readonly kind: "text"; readonly value: string }[] = [];
  let sawMissing = false;
  for (let i = 1; i <= 8; i++) {
    const key = `archi-evidence-${i}`;
    if (Object.hasOwn(props, key) && props[key] !== undefined) {
      if (sawMissing) {
        return fail(
          "archi-input-invalid",
          `/properties/${key}`,
          subjectRef,
          `Gap before "${key}" in archi-evidence-1..8.`,
        );
      }
      const val = props[key];
      if (!isWellFormedSingleLineNfc(val, 0, 200)) {
        return fail(
          "archi-input-invalid",
          `/properties/${key}`,
          subjectRef,
          `Invalid value for "${key}".`,
        );
      }
      items.push({ kind: "text", value: val });
    } else if (Object.hasOwn(props, key)) {
      return fail(
        "archi-input-invalid",
        `/properties/${key}`,
        subjectRef,
        `Property "${key}" must be a string when present.`,
      );
    } else {
      sawMissing = true;
    }
  }
  return { ok: true, value: items };
}

/** proposed: reverse ArchiMate properties -> decoded archi record with typed attribute wrappers (P-6 §4, §5). */
export function archiAttributesOfArchimate(
  properties: unknown,
  context?: unknown,
  options?: { readonly subjectRef?: string },
): ArchiArchimateResult<ArchiArchimateDecodedRecord> {
  const subjectRef = resolveSubjectRef(options);
  try {
    if (!isPlainRecord(properties)) {
      return fail("archi-input-invalid", "", subjectRef, "Expected a plain properties object.");
    }

    let ctxKind: string | undefined;
    let ctxRelationType: string | undefined;
    let ctxScope: ArchiConceptScope | undefined;
    let ctxIdentifier: string | undefined;

    if (context !== undefined) {
      if (!isPlainRecord(context)) {
        return fail("archi-input-invalid", "/context", subjectRef, "context must be a plain object.");
      }
      for (const ck of Object.keys(context)) {
        if (!CONTEXT_ALLOWED_KEYS.has(ck)) {
          return fail(
            "archi-input-invalid",
            `/context/${esc(ck)}`,
            subjectRef,
            `Unknown field "${ck}" in context.`,
          );
        }
      }
      if (Object.hasOwn(context, "scope") && context["scope"] !== undefined) {
        const s = context["scope"];
        if (s !== "model" && s !== "element" && s !== "relationship" && s !== "view") {
          return fail("archi-input-invalid", "/context/scope", subjectRef, "Invalid context.scope.");
        }
        ctxScope = s;
      }
      if (Object.hasOwn(context, "kind") && context["kind"] !== undefined) {
        const k = context["kind"];
        if (typeof k !== "string" || !KIND_FORMS.has(k)) {
          return fail("archi-input-invalid", "/context/kind", subjectRef, "Invalid context.kind.");
        }
        ctxKind = k;
      }
      if (Object.hasOwn(context, "relationType") && context["relationType"] !== undefined) {
        const rt = context["relationType"];
        if (typeof rt !== "string" || !RELATION_ROW_BY_TYPE.has(rt)) {
          return fail(
            "archi-input-invalid",
            "/context/relationType",
            subjectRef,
            "Invalid context.relationType.",
          );
        }
        ctxRelationType = rt;
      }
      if (Object.hasOwn(context, "identifier") && context["identifier"] !== undefined) {
        const id = context["identifier"];
        if (typeof id !== "string") {
          return fail("archi-input-invalid", "/identifier", subjectRef, "identifier must be a string.");
        }
        ctxIdentifier = id;
      }
    }

    const rawRef = Object.hasOwn(properties, "archi-ref") ? properties["archi-ref"] : undefined;
    const refValid = typeof rawRef === "string" && ANY_ARCHI_REF_RE.test(rawRef);
    const isElement = refValid
      ? rawRef.startsWith("entity:")
      : ctxScope === "element" ||
        ctxKind !== undefined ||
        ctxIdentifier?.startsWith("entity_") === true;
    const rawArchiKind = Object.hasOwn(properties, "archi-kind")
      ? properties["archi-kind"]
      : undefined;

    if (isElement && (rawArchiKind === undefined || rawArchiKind === "")) {
      return fail(
        "archimate-kind-missing",
        "/properties/archi-kind",
        subjectRef,
        'Missing required property "archi-kind" on ArchiMate element.',
      );
    }

    if (!refValid) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-ref",
        subjectRef,
        'Missing or invalid required property "archi-ref".',
      );
    }

    const ns = rawRef.slice(0, rawRef.indexOf(":"));
    const scope: ArchiConceptScope =
      ns === "document"
        ? "model"
        : ns === "entity"
          ? "element"
          : ns === "relation"
            ? "relationship"
            : "view";

    if (ctxScope !== undefined && ctxScope !== scope) {
      return fail(
        "archi-input-invalid",
        "/context/scope",
        subjectRef,
        `context.scope "${ctxScope}" disagrees with archi-ref "${rawRef}".`,
      );
    }

    // Rule (a) of §3: XML identifier matching ARCHIMATE_ID_RE or ARCHIMATE_VIEW_ID_RE must agree with archi-ref
    if (ctxIdentifier !== undefined) {
      if (ARCHIMATE_ID_RE.test(ctxIdentifier)) {
        if (scope === "view") {
          return fail(
            "archi-input-invalid",
            "/identifier",
            subjectRef,
            `Identifier "${ctxIdentifier}" disagrees with view archi-ref "${rawRef}".`,
          );
        }
        const expectedId = archimateIdOf(rawRef, { subjectRef });
        if (!expectedId.ok || ctxIdentifier !== expectedId.value) {
          return fail(
            "archi-input-invalid",
            "/identifier",
            subjectRef,
            `Identifier "${ctxIdentifier}" disagrees with archi-ref "${rawRef}".`,
          );
        }
      } else if (ARCHIMATE_VIEW_ID_RE.test(ctxIdentifier)) {
        if (scope !== "view") {
          return fail(
            "archi-input-invalid",
            "/identifier",
            subjectRef,
            `View identifier "${ctxIdentifier}" disagrees with non-view archi-ref "${rawRef}".`,
          );
        }
        const viewLocal = rawRef.slice("view:".length);
        const parsedView = archiViewOfArchimateId(ctxIdentifier, { subjectRef });
        if (!parsedView.ok || !ctxIdentifier.startsWith(`view_${viewLocal}.`)) {
          return fail(
            "archi-input-invalid",
            "/identifier",
            subjectRef,
            `View identifier "${ctxIdentifier}" disagrees with view archi-ref "${rawRef}".`,
          );
        }
      }
    }

    // Check every supplied property is in the 23-name vocabulary and allowed in this scope
    for (const pk of Object.keys(properties)) {
      const def = PROP_DEF_BY_NAME.get(pk);
      if (!def || typeof properties[pk] !== "string") {
        return fail(
          "archi-input-invalid",
          `/properties/${esc(pk)}`,
          subjectRef,
          `Unknown or non-string property "${pk}".`,
        );
      }
      if (!def.scope.includes(scope)) {
        return fail(
          "archi-input-invalid",
          `/properties/${esc(pk)}`,
          subjectRef,
          `Property "${pk}" is outside scope "${scope}".`,
        );
      }
    }

    if (scope === "model" || scope === "view") {
      if (ctxKind !== undefined) {
        return fail("archi-input-invalid", "/context/kind", subjectRef, `context.kind is not allowed on ${scope}.`);
      }
      if (ctxRelationType !== undefined) {
        return fail(
          "archi-input-invalid",
          "/context/relationType",
          subjectRef,
          `context.relationType is not allowed on ${scope}.`,
        );
      }
      if (
        Object.hasOwn(properties, "archi-carrier") &&
        (typeof properties["archi-carrier"] !== "string" || properties["archi-carrier"].length === 0)
      ) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-carrier",
          subjectRef,
          '"archi-carrier" must be a non-empty string when present.',
        );
      }
      return { ok: true, value: deepFreeze({ ref: rawRef, attributes: {} }) };
    }

    if (scope === "element") {
      if (ctxRelationType !== undefined) {
        return fail(
          "archi-input-invalid",
          "/context/relationType",
          subjectRef,
          "context.relationType is not allowed on an element.",
        );
      }
      const kind = Object.hasOwn(properties, "archi-kind") ? properties["archi-kind"] : undefined;
      const formSpec = typeof kind === "string" ? KIND_FORMS.get(kind) : undefined;
      if (typeof kind !== "string" || formSpec === undefined) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-kind",
          subjectRef,
          `Unknown archi-kind "${String(kind)}".`,
        );
      }
      if (ctxKind !== undefined && ctxKind !== kind) {
        return fail(
          "archi-input-invalid",
          "/context/kind",
          subjectRef,
          `context.kind "${ctxKind}" disagrees with archi-kind "${kind}".`,
        );
      }

      // Check appliesTo for every supplied property
      for (const pk of Object.keys(properties)) {
        const def = PROP_DEF_BY_NAME.get(pk)!;
        if (def.appliesTo !== undefined && !def.appliesTo.includes(kind)) {
          return fail(
            "archi-input-invalid",
            `/properties/${esc(pk)}`,
            subjectRef,
            `Property "${pk}" does not apply to kind "${kind}".`,
          );
        }
      }

      let formVal: string | undefined;
      if (Object.hasOwn(properties, "archi-form")) {
        const rf = properties["archi-form"];
        if (typeof rf !== "string" || formSpec.values === null || !formSpec.values.has(rf)) {
          return fail(
            "archi-input-invalid",
            "/properties/archi-form",
            subjectRef,
            `Invalid archi-form "${String(rf)}" for kind "${kind}".`,
          );
        }
        formVal = rf;
      } else if (formSpec.required) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-form",
          subjectRef,
          `Missing required archi-form for kind "${kind}".`,
        );
      }

      const lifecycleVal = Object.hasOwn(properties, "archi-lifecycle")
        ? properties["archi-lifecycle"]
        : undefined;
      if (typeof lifecycleVal !== "string" || !LIFECYCLE_VALUES.has(lifecycleVal)) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-lifecycle",
          subjectRef,
          'Missing or invalid required "archi-lifecycle".',
        );
      }

      const evRes = validateEvidenceFromProps(properties, subjectRef);
      if (!evRes.ok) return evRes;

      const attrs: Record<string, unknown> = {
        lifecycle: { kind: "enum", value: lifecycleVal },
        evidence: { kind: "collection", items: evRes.value },
      };
      if (formVal !== undefined) {
        attrs["form"] = { kind: "enum", value: formVal };
      }

      if (Object.hasOwn(properties, "archi-short-name")) {
        const sn = properties["archi-short-name"];
        if (!isWellFormedSingleLineNfc(sn, 0, 40)) {
          return fail("archi-input-invalid", "/properties/archi-short-name", subjectRef, "Invalid archi-short-name.");
        }
        attrs["shortName"] = { kind: "text", value: sn };
      }
      if (Object.hasOwn(properties, "archi-category")) {
        const cat = properties["archi-category"];
        if (!isWellFormedSingleLineNfc(cat, 1, 40) || !KEY_RE.test(cat)) {
          return fail("archi-input-invalid", "/properties/archi-category", subjectRef, "Invalid archi-category.");
        }
        attrs["category"] = { kind: "text", value: cat };
      }
      if (Object.hasOwn(properties, "archi-url")) {
        const url = properties["archi-url"];
        if (!isWellFormedSingleLineNfc(url, 0, 200)) {
          return fail("archi-input-invalid", "/properties/archi-url", subjectRef, "Invalid archi-url.");
        }
        attrs["url"] = { kind: "text", value: url };
      }
      if (Object.hasOwn(properties, "archi-version")) {
        const ver = properties["archi-version"];
        if (!isWellFormedSingleLineNfc(ver, 0, 40)) {
          return fail("archi-input-invalid", "/properties/archi-version", subjectRef, "Invalid archi-version.");
        }
        attrs["version"] = { kind: "text", value: ver };
      }
      if (kind === "api") {
        const acc = Object.hasOwn(properties, "archi-access") ? properties["archi-access"] : undefined;
        if (typeof acc !== "string" || !ACCESS_VALUES.has(acc)) {
          return fail(
            "archi-input-invalid",
            "/properties/archi-access",
            subjectRef,
            'Kind "api" requires "archi-access" in "read-only" | "read-write".',
          );
        }
        attrs["access"] = { kind: "enum", value: acc };
      }
      if (kind === "store") {
        const wp = Object.hasOwn(properties, "archi-writer-policy")
          ? properties["archi-writer-policy"]
          : undefined;
        if (typeof wp !== "string" || !WRITER_POLICY_VALUES.has(wp)) {
          return fail(
            "archi-input-invalid",
            "/properties/archi-writer-policy",
            subjectRef,
            'Kind "store" requires "archi-writer-policy" in "single-writer" | "multi-writer".',
          );
        }
        attrs["writerPolicy"] = { kind: "enum", value: wp };
      }

      return { ok: true, value: deepFreeze({ ref: rawRef, kind, attributes: attrs }) };
    }

    // scope === "relationship"
    if (ctxKind !== undefined) {
      return fail(
        "archi-input-invalid",
        "/context/kind",
        subjectRef,
        "context.kind is not allowed on a relationship.",
      );
    }
    const relationType = Object.hasOwn(properties, "archi-relation-type")
      ? properties["archi-relation-type"]
      : undefined;
    if (
      typeof relationType !== "string" ||
      relationType.length === 0 ||
      !RELATION_ROW_BY_TYPE.has(relationType)
    ) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-relation-type",
        subjectRef,
        'Missing or invalid required "archi-relation-type".',
      );
    }
    if (ctxRelationType !== undefined && ctxRelationType !== relationType) {
      return fail(
        "archi-input-invalid",
        "/context/relationType",
        subjectRef,
        `context.relationType "${ctxRelationType}" disagrees with archi-relation-type "${relationType}".`,
      );
    }

    for (const pk of Object.keys(properties)) {
      const def = PROP_DEF_BY_NAME.get(pk)!;
      if (def.appliesTo !== undefined && !def.appliesTo.includes(relationType)) {
        return fail(
          "archi-input-invalid",
          `/properties/${esc(pk)}`,
          subjectRef,
          `Property "${pk}" does not apply to relationType "${relationType}".`,
        );
      }
    }

    const lifecycleVal = Object.hasOwn(properties, "archi-lifecycle")
      ? properties["archi-lifecycle"]
      : undefined;
    if (typeof lifecycleVal !== "string" || !LIFECYCLE_VALUES.has(lifecycleVal)) {
      return fail(
        "archi-input-invalid",
        "/properties/archi-lifecycle",
        subjectRef,
        'Missing or invalid required "archi-lifecycle".',
      );
    }

    const evRes = validateEvidenceFromProps(properties, subjectRef);
    if (!evRes.ok) return evRes;

    const attrs: Record<string, unknown> = {
      lifecycle: { kind: "enum", value: lifecycleVal },
      evidence: { kind: "collection", items: evRes.value },
    };

    if (relationType === "invokes") {
      const trig = Object.hasOwn(properties, "archi-trigger") ? properties["archi-trigger"] : undefined;
      if (typeof trig !== "string" || !TRIGGER_VALUES.has(trig)) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-trigger",
          subjectRef,
          'Relation "invokes" requires a valid "archi-trigger".',
        );
      }
      attrs["trigger"] = { kind: "enum", value: trig };
      if (Object.hasOwn(properties, "archi-event")) {
        const ev = properties["archi-event"];
        if (!isWellFormedSingleLineNfc(ev, 0, 80)) {
          return fail("archi-input-invalid", "/properties/archi-event", subjectRef, "Invalid archi-event.");
        }
        attrs["event"] = { kind: "text", value: ev };
      }
    }
    if (relationType === "accesses") {
      const modeVal = Object.hasOwn(properties, "archi-mode") ? properties["archi-mode"] : undefined;
      if (typeof modeVal !== "string" || !MODE_VALUES.has(modeVal)) {
        return fail(
          "archi-input-invalid",
          "/properties/archi-mode",
          subjectRef,
          'Relation "accesses" requires "archi-mode" in "read" | "append" | "write".',
        );
      }
      attrs["mode"] = { kind: "enum", value: modeVal };
    }

    return { ok: true, value: deepFreeze({ ref: rawRef, relationType, attributes: attrs }) };
  } catch {
    return fail("archi-input-invalid", "", subjectRef, "Unreadable properties input.");
  }
}
