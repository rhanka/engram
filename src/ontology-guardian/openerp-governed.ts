// OpenERP tier-G governed metadata (§§2.1–2.8, §2.9.3). Pure views over a parsed
// [ONT] value — no file reads here; tests load the byte-pinned fixture.
// Tier G never enters any §1.6 digest preimage; it is pinned by the [ONT]
// sha256 and covered at admission by catalog provenance/coverage (§1.5).
// Digests below are canonical-bytes SHA-256 snapshots (regression pins),
// computed through src/ontology-guardian (never re-implemented).
import { canonicalBytes, sha256Hex } from "./canonical.js";
import type { Digest } from "./types.js";

export interface OpenerpReference {
  readonly entity: string;
  readonly field: string;
}

export interface OpenerpColumnRow {
  readonly entity: string;
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly references?: OpenerpReference;
  readonly onDelete?: string;
  readonly enum?: readonly string[];
  readonly check?: string;
  readonly addedBy?: string;
}

export interface OpenerpEntityIndexRow {
  readonly entity: string;
  readonly module: string;
  readonly sourceMigration: string;
  readonly cols: number;
  readonly invariants: number;
  readonly tenant: boolean;
  readonly forcedRls: boolean;
}

export interface OpenerpRelationRow {
  readonly from: string;
  readonly field: string;
  readonly to: string;
  readonly required: boolean;
  readonly onDelete: string;
}

export interface OpenerpInvariantRow {
  readonly entity: string;
  readonly kind: string;
  readonly clause: string;
  readonly addedBy?: string;
}

export interface OpenerpOnt {
  readonly counts: {
    readonly migrations: number;
    readonly entities: number;
    readonly tenantScopedEntities: number;
    readonly forcedRlsEntities: number;
    readonly relations: number;
    readonly enumeratedFields: number;
    readonly tableInvariants: number;
    readonly parserGaps: number;
  };
  readonly entities: readonly {
    readonly entity: string;
    readonly module: string;
    readonly sourceMigration: string;
    readonly columns: readonly {
      readonly name: string;
      readonly type: string;
      readonly notNull: boolean;
      readonly references?: { readonly entity: string; readonly field: string };
      readonly onDelete?: string;
      readonly enum?: readonly string[];
      readonly check?: string;
      readonly addedBy?: string;
    }[];
    readonly tableInvariants: readonly {
      readonly kind: string;
      readonly clause: string;
      readonly addedBy?: string;
    }[];
    readonly tenantScoped: boolean;
    readonly forcedRls: boolean;
  }[];
  readonly relations: readonly {
    readonly from: string;
    readonly field: string;
    readonly to: string;
    readonly required: boolean;
    readonly onDelete: string;
  }[];
  readonly parserGaps: readonly unknown[];
}

/** §2.1 header counts, verbatim from [ONT] counts. */
export function headerCounts(ont: OpenerpOnt): {
  readonly migrations: number;
  readonly entities: number;
  readonly tenantScoped: number;
  readonly forcedRls: number;
  readonly relations: number;
  readonly enumeratedFields: number;
  readonly tableInvariants: number;
  readonly parserGaps: number;
} {
  return {
    migrations: ont.counts.migrations,
    entities: ont.counts.entities,
    tenantScoped: ont.counts.tenantScopedEntities,
    forcedRls: ont.counts.forcedRlsEntities,
    relations: ont.counts.relations,
    enumeratedFields: ont.counts.enumeratedFields,
    tableInvariants: ont.counts.tableInvariants,
    parserGaps: ont.parserGaps.length,
  };
}

/** §2.2 entity index (67 rows, [ONT] order). */
export function entityIndex(ont: OpenerpOnt): OpenerpEntityIndexRow[] {
  return ont.entities.map((e) => ({
    entity: e.entity,
    module: e.module,
    sourceMigration: e.sourceMigration,
    cols: e.columns.length,
    invariants: e.tableInvariants.length,
    tenant: e.tenantScoped,
    forcedRls: e.forcedRls,
  }));
}

/** §2.3 column rows (776: 773 real + 3 as-extracted pseudo-columns, [ONT] order). */
export function columnRows(ont: OpenerpOnt): OpenerpColumnRow[] {
  const out: OpenerpColumnRow[] = [];
  for (const e of ont.entities) {
    for (const c of e.columns) {
      out.push({
        entity: e.entity,
        name: c.name,
        type: c.type,
        notNull: c.notNull,
        ...(c.references === undefined ? {} : { references: { entity: c.references.entity, field: c.references.field } }),
        ...(c.onDelete === undefined ? {} : { onDelete: c.onDelete }),
        ...(c.enum === undefined ? {} : { enum: [...c.enum] }),
        ...(c.check === undefined ? {} : { check: c.check }),
        ...(c.addedBy === undefined ? {} : { addedBy: c.addedBy }),
      });
    }
  }
  return out;
}

/** §2.4 typed relations (146 rows, [ONT] relations order). */
export function relationRows(ont: OpenerpOnt): OpenerpRelationRow[] {
  return ont.relations.map((r) => ({
    from: r.from,
    field: r.field,
    to: r.to,
    required: r.required,
    onDelete: r.onDelete,
  }));
}

/** §2.5 enumerated fields (57 columns carrying enum, [ONT] order). */
export function enumColumns(ont: OpenerpOnt): { readonly entity: string; readonly field: string; readonly values: readonly string[] }[] {
  const out: { entity: string; field: string; values: string[] }[] = [];
  for (const e of ont.entities) {
    for (const c of e.columns) {
      if (c.enum !== undefined) out.push({ entity: e.entity, field: c.name, values: [...c.enum] });
    }
  }
  return out;
}

/** §2.6 column CHECK constraints other than enumerations (11, [ONT] order). */
export function columnChecks(ont: OpenerpOnt): { readonly entity: string; readonly field: string; readonly check: string; readonly notNull: boolean }[] {
  const out: { entity: string; field: string; check: string; notNull: boolean }[] = [];
  for (const e of ont.entities) {
    for (const c of e.columns) {
      if (c.check !== undefined) out.push({ entity: e.entity, field: c.name, check: c.check, notNull: c.notNull });
    }
  }
  return out;
}

/** §2.7 table-level invariants (27, [ONT] order). */
export function tableInvariants(ont: OpenerpOnt): OpenerpInvariantRow[] {
  const out: OpenerpInvariantRow[] = [];
  for (const e of ont.entities) {
    for (const t of e.tableInvariants) {
      out.push({
        entity: e.entity,
        kind: t.kind,
        clause: t.clause,
        ...(t.addedBy === undefined ? {} : { addedBy: t.addedBy }),
      });
    }
  }
  return out;
}

/** Pseudo-columns (§2.3 as-extracted, tier G as extracted): 3 rows named constraint. */
export function pseudoColumns(ont: OpenerpOnt): OpenerpColumnRow[] {
  return columnRows(ont).filter((c) => c.name === "constraint");
}

/** Canonical-bytes SHA-256 snapshot of any governed view (regression pin, not a spec vector). */
export function governedDigest(view: unknown): Digest {
  return sha256Hex(canonicalBytes(view));
}

export const EXPECTED_COLUMN_ROWS = 776 as const;
export const EXPECTED_REAL_COLUMNS = 773 as const;
export const EXPECTED_PSEUDO_COLUMNS = 3 as const;
export const EXPECTED_ENUM_COLUMNS = 57 as const;
export const EXPECTED_CHECK_MEMBERSHIPS = 4 as const;
export const EXPECTED_ENUMERATED_COLUMNS_TOTAL = 61 as const;
export const EXPECTED_COLUMN_CHECKS = 11 as const;
export const EXPECTED_TABLE_INVARIANTS = 27 as const;
