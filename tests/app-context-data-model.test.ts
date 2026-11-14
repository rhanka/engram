import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { extractJs, extractSql } from "../src/extract.js";
import { appContextNodeId } from "../src/app-context/node-id.js";
import { parseOntologyProfile } from "../src/ontology-profile.js";
import {
  ensureDataModelTsReady,
  extractDataModel,
  extractDataModelFromFiles,
  type DataModelEdge,
  type DataModelNode,
  type ExtractDataModelResult,
} from "../src/app-context/extract-data-model.js";

const REPO = "immo-pilot-test";
const COMMIT = "f".repeat(40);

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function edgeKey(edge: DataModelEdge): string {
  return `${edge.source} ${edge.relation} ${edge.target} @${edge.derivation_method}`;
}

function nodesByType(result: ExtractDataModelResult, nodeType: string): DataModelNode[] {
  return result.nodes.filter((node) => node.node_type === nodeType);
}

function entityId(schema: string, name: string, repo = REPO): string {
  return appContextNodeId(repo, "DataEntity", ["postgres", schema, name]);
}

function fieldId(schema: string, entity: string, column: string, repo = REPO): string {
  return appContextNodeId(repo, "DataField", ["postgres", schema, entity, column]);
}

function symbolId(file: string, name: string, repo = REPO): string {
  return appContextNodeId(repo, "CodeSymbol", [file, "function", name]);
}

describe("Lot L4 — Drizzle AST data model (reduced scope)", () => {
  it("R2-N2: SQL-only and Prisma-only calls succeed without TypeScript parser initialization", () => {
    const sqlOnly = extractDataModel(
      [{ path: "migrations/0001_init.sql", language: "sql", content: "CREATE TABLE t (id INT PRIMARY KEY);" }],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(sqlOnly.nodes).toEqual([]);
    expect(sqlOnly.edges).toEqual([]);
    expect(sqlOnly.diagnostics).toEqual([]);

    const prismaOnly = extractDataModel(
      [{ path: "prisma/schema.prisma", language: "prisma", content: "model User {\n  id Int @id\n}\n" }],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(prismaOnly.nodes).toEqual([]);
    expect(prismaOnly.edges).toEqual([]);
    expect(prismaOnly.diagnostics).toHaveLength(1);
    expect(prismaOnly.diagnostics[0]).toMatchObject({
      code: "unsupported-schema-format",
      file: "prisma/schema.prisma",
      line: 1,
      startLine: 1,
      endLine: 1,
    });
  });

  beforeAll(async () => {
    await ensureDataModelTsReady();
  });

  it("extracts the supported-construct table: pgTable, pgSchema.table, column builders, modifiers, inline FKs, and table callback PK/FK/index", () => {
    const schemaTs = [
      'import {',
      '  pgTable,',
      '  pgSchema,',
      '  serial,',
      '  uuid,',
      '  text,',
      '  varchar,',
      '  integer,',
      '  boolean,',
      '  timestamp,',
      '  numeric,',
      '  index,',
      '  uniqueIndex,',
      '  primaryKey,',
      '  foreignKey,',
      '} from "drizzle-orm/pg-core";',
      '',
      "const authSchema = pgSchema('auth');",
      '',
      'export const tenants = authSchema.table("tenants", {',
      '  id: uuid("id").defaultRandom().primaryKey(),',
      '  slug: varchar("slug", { length: 64 }).notNull().unique(),',
      '});',
      '',
      'export const users = pgTable(',
      '  "users",',
      '  {',
      '    id: serial("id").primaryKey(),',
      '    tenantId: uuid("tenant_id")',
      '      .notNull()',
      '      .references(() => tenants.id, { onDelete: "cascade" }),',
      '    email: text("email").notNull(),',
      '    displayName: text(),',
      '    on: boolean("on").default(true).notNull(),',
      '    balance: numeric("balance", { precision: 10, scale: 2 }).default("0.00"),',
      '    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),',
      '  },',
      '  (t) => [',
      '    uniqueIndex("users_email_uq").on(t.email),',
      '    index("users_tenant_idx").on(t.tenantId, t.createdAt),',
      '  ],',
      ');',
      '',
      'export const memberships = pgTable(',
      '  "memberships",',
      '  {',
      '    userId: integer("user_id"),',
      '    tenantId: uuid("tenant_id"),',
      '    role: text("role").default("member").notNull(),',
      '  },',
      '  (t) => ({',
      '    pk: primaryKey({ columns: [t.userId, t.tenantId] }),',
      '    userFk: foreignKey({',
      '      columns: [t.userId],',
      '      foreignColumns: [users.id],',
      '    }),',
      '  }),',
      ');',
    ].join("\n");

    const res = extractDataModel(
      [{ path: "api/db/schema.ts", language: "drizzle", content: schemaTs }],
      { repoKey: REPO, commit: COMMIT },
    );

    expect(res.diagnostics).toEqual([]);

    const tenantsEntityId = entityId("auth", "tenants");
    const usersEntityId = entityId("public", "users");
    const membershipsEntityId = entityId("public", "memberships");

    const entities = nodesByType(res, "DataEntity");
    expect(entities.map((e) => e.id).sort()).toEqual(
      [tenantsEntityId, usersEntityId, membershipsEntityId].sort(),
    );

    const usersEntity = entities.find((e) => e.id === usersEntityId)!;
    expect(usersEntity).toMatchObject({
      node_type: "DataEntity",
      dialect: "postgres",
      schema: "public",
      name: "users",
      entityKind: "table",
      source_file: "api/db/schema.ts",
      line_start: 25,
      line_end: 42,
    });

    const fields = nodesByType(res, "DataField");
    const fieldById = new Map(fields.map((f) => [f.id, f]));

    // Check column types, options, nullability, PK, FK, and exact spans
    expect(fieldById.get(fieldId("auth", "tenants", "slug"))).toMatchObject({
      dbType: "VARCHAR(64)",
      nullable: false,
      isPk: false,
      isFk: false,
    });

    expect(fieldById.get(fieldId("public", "users", "id"))).toMatchObject({
      dbType: "SERIAL",
      nullable: false,
      isPk: true,
      isFk: false,
      line_start: 28,
      line_end: 28,
    });

    expect(fieldById.get(fieldId("public", "users", "tenant_id"))).toMatchObject({
      dbType: "UUID",
      nullable: false,
      isPk: false,
      isFk: true,
      line_start: 29,
      line_end: 31,
    });

    // Omitted column name argument uses logical property name "displayName"
    expect(fieldById.get(fieldId("public", "users", "displayName"))).toMatchObject({
      dbType: "TEXT",
      nullable: true,
      isPk: false,
      isFk: false,
    });

    expect(fieldById.get(fieldId("public", "users", "balance"))).toMatchObject({
      dbType: "NUMERIC(10,2)",
      nullable: true,
    });

    expect(fieldById.get(fieldId("public", "users", "created_at"))).toMatchObject({
      dbType: "TIMESTAMPTZ(3)",
      nullable: false,
    });

    // Composite primaryKey and table-level foreignKey on memberships
    expect(fieldById.get(fieldId("public", "memberships", "user_id"))).toMatchObject({
      dbType: "INTEGER",
      nullable: false,
      isPk: true,
      isFk: true,
    });
    expect(fieldById.get(fieldId("public", "memberships", "tenant_id"))).toMatchObject({
      dbType: "UUID",
      nullable: false,
      isPk: true,
      isFk: false,
    });

    // has_field edges
    const usersHasFields = res.edges.filter(
      (e) => e.relation === "has_field" && e.source === usersEntityId,
    );
    expect(usersHasFields).toHaveLength(7);
    expect(new Set(usersHasFields.map((e) => e.derivation_method))).toEqual(
      new Set(["drizzle_schema_column"]),
    );

    // references edges (inline .references and table-level foreignKey)
    const refEdges = res.edges.filter((e) => e.relation === "references");
    expect(refEdges.map(edgeKey).sort()).toEqual(
      [
        `${fieldId("public", "users", "tenant_id")} references ${fieldId("auth", "tenants", "id")} @drizzle_schema_fk`,
        `${fieldId("public", "memberships", "user_id")} references ${fieldId("public", "users", "id")} @drizzle_schema_fk`,
      ].sort(),
    );
  });

  it("refuses unsupported Drizzle constructs with unsupported-construct diagnostics and zero fabricated facts (R2-M8, R2-N1)", () => {
    const unsupportedCases: Array<{ label: string; code: string; expectedLine: number }> = [
      {
        label: "computed table name",
        code: [
          'import { pgTable, serial } from "drizzle-orm/pg-core";',
          'const dyn = "users";',
          'export const t = pgTable(dyn, { id: serial("id").primaryKey() });',
        ].join("\n"),
        expectedLine: 3,
      },
      {
        label: "template literal table name",
        code: [
          'import { pgTable, serial } from "drizzle-orm/pg-core";',
          'export const t = pgTable(`users`, { id: serial("id").primaryKey() });',
        ].join("\n"),
        expectedLine: 2,
      },
      {
        label: "spread in columns object",
        code: [
          'import { pgTable, text } from "drizzle-orm/pg-core";',
          'const common = { a: text("a") };',
          'export const t = pgTable("t", { ...common });',
        ].join("\n"),
        expectedLine: 3,
      },
      {
        label: "helper column factory",
        code: [
          'import { pgTable, text } from "drizzle-orm/pg-core";',
          'const makeCol = (n: string) => text(n);',
          'export const t = pgTable("t", { c: makeCol("c") });',
        ].join("\n"),
        expectedLine: 3,
      },
      {
        label: "$type<T>() modifier",
        code: [
          'import { pgTable, text } from "drizzle-orm/pg-core";',
          'export const t = pgTable("t", { c: text("c").$type<"a" | "b">() });',
        ].join("\n"),
        expectedLine: 2,
      },
      {
        label: ".array() modifier",
        code: [
          'import { pgTable, text } from "drizzle-orm/pg-core";',
          'export const t = pgTable("t", { tags: text("tags").array() });',
        ].join("\n"),
        expectedLine: 2,
      },
      {
        label: "customType column builder",
        code: [
          'import { pgTable, customType } from "drizzle-orm/pg-core";',
          'const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });',
          'export const t = pgTable("t", { search: tsvector("search") });',
        ].join("\n"),
        expectedLine: 3,
      },
      {
        label: "dynamic varchar options (R2-M8)",
        code: [
          'import { pgTable, varchar } from "drizzle-orm/pg-core";',
          'const opts = { length: 20 };',
          'export const t = pgTable("t", { v: varchar("v", opts) });',
        ].join("\n"),
        expectedLine: 3,
      },
      {
        label: "non-literal .default(...) call",
        code: [
          'import { pgTable, text } from "drizzle-orm/pg-core";',
          'export const t = pgTable("t", { c: text("c").default(computeDefault()) });',
        ].join("\n"),
        expectedLine: 2,
      },
      {
        label: "non-member .references callback",
        code: [
          'import { pgTable, integer } from "drizzle-orm/pg-core";',
          'export const t = pgTable("t", { c: integer("c").references(() => getTarget()) });',
        ].join("\n"),
        expectedLine: 2,
      },
      {
        label: "table callback check(...) constraint",
        code: [
          'import { pgTable, integer, check } from "drizzle-orm/pg-core";',
          'export const t = pgTable("t", { id: integer("id").primaryKey() }, (t) => [check("chk", t.id)]);',
        ].join("\n"),
        expectedLine: 2,
      },
    ];

    for (const tc of unsupportedCases) {
      const res = extractDataModel(
        [{ path: "api/db/unsupported.ts", language: "drizzle", content: tc.code }],
        { repoKey: REPO, commit: COMMIT },
      );
      expect(
        res.diagnostics.some(
          (d) =>
            d.code === "unsupported-construct" &&
            d.file === "api/db/unsupported.ts" &&
            d.startLine === tc.expectedLine,
        ),
        `expected unsupported-construct diagnostic for ${tc.label}`,
      ).toBe(true);

      // None of the column-level unsupported cases may emit a DataField or references edge
      if (tc.label !== "table callback check(...) constraint") {
        expect(nodesByType(res, "DataField"), `no DataField for ${tc.label}`).toEqual([]);
      }
      expect(
        res.edges.filter((e) => e.relation === "references"),
        `no references edge for ${tc.label}`,
      ).toEqual([]);
    }
  });

  it("Prisma is out of scope: emits one unsupported-schema-format diagnostic and ignores comment/string traps (Note 2, R2-B2)", () => {
    const prismaWithTraps = [
      'model T {',
      '  id Int @id',
      '  title String @default("@id") // @id @map("pretend")',
      '  // @@map("phantom")',
      '}',
    ].join("\n");

    const res = extractDataModel(
      [{ path: "api/db/schema.prisma", language: "prisma", content: prismaWithTraps }],
      { repoKey: REPO, commit: COMMIT },
    );

    expect(res.nodes).toEqual([]);
    expect(res.edges).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^diag:[0-9a-f]{32}$/),
        code: "unsupported-schema-format",
        file: "api/db/schema.prisma",
        line: 1,
        startLine: 1,
        endLine: 1,
      }),
    ]);
  });

  it("raw sql`...` templates emit unsupported-construct with zero reads/writes edges (Note 4)", () => {
    const code = [
      'import { pgTable, serial } from "drizzle-orm/pg-core";',
      'import { sql } from "drizzle-orm";',
      '',
      'export const users = pgTable("users", { id: serial("id").primaryKey() });',
      '',
      'export async function runRaw(db: any) {',
      '  return db.execute(',
      '    sql`SELECT * FROM users WHERE id = 1`,',
      '  );',
      '}',
    ].join("\n");

    const res = extractDataModel(
      [{ path: "api/raw.ts", language: "ts", content: code }],
      { repoKey: REPO, commit: COMMIT },
    );

    expect(res.edges.filter((e) => e.relation === "reads" || e.relation === "writes")).toEqual([]);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "api/raw.ts",
        startLine: 8,
        endLine: 8,
      }),
    ]);
  });

  it("R2-B1 & R1-B1: resolves AST bindings lexically across shadowing, separate function scopes, parameter shadowing, and import aliases", () => {
    // 1. String literal trap mentioning pgTable
    const stringTrap = extractDataModel(
      [
        {
          path: "api/trap.ts",
          language: "drizzle",
          content: [
            'import { pgTable, integer } from "drizzle-orm/pg-core";',
            'const example = "pgTable(\'ghost\', { id: integer(\'id\') })";',
          ].join("\n"),
        },
      ],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(nodesByType(stringTrap, "DataEntity")).toEqual([]);

    // 2. Cross-file import binding (a.ts vs z.ts with same variable name `users`)
    const crossFile = extractDataModel(
      [
        {
          path: "a.ts",
          language: "drizzle",
          content: 'import { pgTable, uuid } from "drizzle-orm/pg-core";\nexport const users = pgTable("a_users", { id: uuid("id").primaryKey() });\n',
        },
        {
          path: "z.ts",
          language: "drizzle",
          content: 'import { pgTable, uuid } from "drizzle-orm/pg-core";\nexport const users = pgTable("z_users", { id: uuid("id").primaryKey() });\n',
        },
        {
          path: "handler.ts",
          language: "ts",
          content: 'import { users } from "./a";\nexport async function h(db: any) { return db.select().from(users); }\n',
        },
      ],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(crossFile.edges.filter((e) => e.relation === "reads").map((e) => e.target)).toEqual([
      entityId("public", "a_users"),
    ]);
    expect(crossFile.diagnostics).toEqual([]);

    // 3. R2-B1 counterexample 1: local variable `const t = unrelated` shadows top-level `const t = pgTable("real", ...)`
    const shadowedTable = extractDataModel(
      [
        {
          path: "shadow.ts",
          language: "ts",
          content: [
            'import { pgTable, integer } from "drizzle-orm/pg-core";',
            'const t = pgTable("real", { id: integer("id").primaryKey() });',
            'const unrelated = { notATable: true };',
            'export function h(db: any) {',
            '  const t = unrelated;',
            '  return db.select().from(t);',
            '}',
          ].join("\n"),
        },
      ],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(shadowedTable.edges.filter((e) => e.relation === "reads")).toEqual([]);
    expect(shadowedTable.diagnostics).toEqual([
      expect.objectContaining({
        code: "target-unresolved",
        file: "shadow.ts",
        startLine: 6,
      }),
    ]);

    // 4. R2-B1 counterexample 2: two functions declare their own `const t = pgTable(...)` for `a` and `b`
    const twoFnScopes = extractDataModel(
      [
        {
          path: "two-fns.ts",
          language: "ts",
          content: [
            'import { pgTable, integer } from "drizzle-orm/pg-core";',
            'export function fnA(db: any) {',
            '  const t = pgTable("a", { id: integer("id").primaryKey() });',
            '  return db.select().from(t);',
            '}',
            'export function fnB(db: any) {',
            '  const t = pgTable("b", { id: integer("id").primaryKey() });',
            '  return db.select().from(t);',
            '}',
          ].join("\n"),
        },
      ],
      { repoKey: REPO, commit: COMMIT },
    );
    const fnASym = symbolId("two-fns.ts", "fnA");
    const fnBSym = symbolId("two-fns.ts", "fnB");
    expect(
      twoFnScopes.edges.filter((e) => e.relation === "reads" && e.source === fnASym).map((e) => e.target),
    ).toEqual([entityId("public", "a")]);
    expect(
      twoFnScopes.edges.filter((e) => e.relation === "reads" && e.source === fnBSym).map((e) => e.target),
    ).toEqual([entityId("public", "b")]);

    // 5. R2-B1 counterexample 3: parameter `pgTable` shadows import
    const shadowedConstructor = extractDataModel(
      [
        {
          path: "param-shadow.ts",
          language: "ts",
          content: [
            'import { pgTable, integer } from "drizzle-orm/pg-core";',
            'export function f(pgTable: any) {',
            '  const fake = pgTable("ghost", { id: integer("id") });',
            '  return fake;',
            '}',
          ].join("\n"),
        },
      ],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(nodesByType(shadowedConstructor, "DataEntity")).toEqual([]);
    expect(nodesByType(shadowedConstructor, "DataField")).toEqual([]);

    // 6. R2-B1 counterexample 4: aliased imports `pgTable as make, text as integer`
    const aliasedImports = extractDataModel(
      [
        {
          path: "alias.ts",
          language: "drizzle",
          content: [
            'import { pgTable as make, text as integer } from "drizzle-orm/pg-core";',
            'export const items = make("items", {',
            '  x: integer("x").notNull(),',
            '});',
          ].join("\n"),
        },
      ],
      { repoKey: REPO, commit: COMMIT },
    );
    expect(nodesByType(aliasedImports, "DataEntity").map((e) => e.id)).toEqual([
      entityId("public", "items"),
    ]);
    const xField = nodesByType(aliasedImports, "DataField").find((f) => f.name === "x")!;
    expect(xField.dbType).toBe("TEXT");
  });

  it("R2-M5: resolves .references(() => table.<prop>) strictly by logical property name, never physical column name", () => {
    const code = [
      'import { pgTable, integer } from "drizzle-orm/pg-core";',
      'export const p = pgTable("p", {',
      '  userId: integer("user_id").primaryKey(),',
      '});',
      'export const badChild = pgTable("bad_child", {',
      '  uid: integer("uid").references(() => p.user_id),',
      '});',
      'export const goodChild = pgTable("good_child", {',
      '  uid: integer("uid").references(() => p.userId),',
      '});',
    ].join("\n");

    const res = extractDataModel(
      [{ path: "api/db/fk.ts", language: "drizzle", content: code }],
      { repoKey: REPO, commit: COMMIT },
    );

    const refs = res.edges.filter((e) => e.relation === "references");
    expect(refs.map(edgeKey)).toEqual([
      `${fieldId("public", "good_child", "uid")} references ${fieldId("public", "p", "user_id")} @drizzle_schema_fk`,
    ]);

    const badUidField = nodesByType(res, "DataField").find(
      (f) => f.entityName === "bad_child" && f.name === "uid",
    )!;
    expect(badUidField.isFk).toBe(false);

    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        code: "target-unresolved",
        file: "api/db/fk.ts",
        startLine: 6,
      }),
    ]);
  });

  it("R2-M2: attaches Drizzle reads/writes to enclosing functions and never to query result variables or top-level declarators", () => {
    const schemaTs = [
      'import { pgTable, uuid, text } from "drizzle-orm/pg-core";',
      'export const t = pgTable("t", {',
      '  id: uuid("id").primaryKey(),',
      '  name: text("name").notNull(),',
      '});',
    ].join("\n");

    const handlersTs = [
      'import { t } from "./schema";',
      '',
      'export async function h(db: any) {',
      '  const rows = await db.select().from(t);',
      '  return rows;',
      '}',
      '',
      'export const listArrow = (db: any) => db.select().from(t);',
      '',
      'export async function mutateAll(db: any) {',
      '  const ins = await db.insert(t).values({ name: "a" });',
      '  const upd = await db.update(t).set({ name: "b" });',
      '  const del = await db.delete(t);',
      '  return { ins, upd, del };',
      '}',
      '',
      'export function detachedTrap(db: any, other: any) {',
      '  const pending = db.select();',
      '  return other.from(t);',
      '}',
      '',
      '// Top-level assignment holding a query result: must NOT invent CodeSymbol(function, topRows)',
      'const topRows = db.select().from(t);',
    ].join("\n");

    const res = extractDataModel(
      [
        { path: "api/schema.ts", language: "drizzle", content: schemaTs },
        { path: "api/handlers.ts", language: "ts", content: handlersTs },
      ],
      { repoKey: REPO, commit: COMMIT },
    );

    const symbols = nodesByType(res, "CodeSymbol");
    // No result variable (`rows`, `ins`, `upd`, `del`, `pending`, `topRows`) may become a CodeSymbol
    expect(symbols.map((s) => s.symbolName).sort()).toEqual(["h", "listArrow", "mutateAll"]);

    const tId = entityId("public", "t");
    const hId = symbolId("api/handlers.ts", "h");
    const listArrowId = symbolId("api/handlers.ts", "listArrow");
    const mutateAllId = symbolId("api/handlers.ts", "mutateAll");

    expect(res.edges.filter((e) => e.relation === "reads" || e.relation === "writes").map(edgeKey).sort()).toEqual(
      [
        `${hId} reads ${tId} @drizzle_select_ast`,
        `${listArrowId} reads ${tId} @drizzle_select_ast`,
        `${mutateAllId} writes ${tId} @drizzle_mutation_ast`,
      ].sort(),
    );

    // Top-level query at line 23 is diagnosed as unsupported-construct
    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "api/handlers.ts",
        startLine: 23,
        endLine: 23,
      }),
    ]);
  });

  it("R2-M11: propagates handler calls deterministically across diamond paths and cycles, including handles citations", () => {
    const hFile = [
      'import { pgTable, integer } from "drizzle-orm/pg-core";',
      'export const t = pgTable("t", { id: integer("id").primaryKey() });',
      'export function query(db: any) {',
      '  return db.select().from(t);',
      '}',
    ].join("\n");

    const querySym = symbolId("h.ts", "query", "review");
    const leftSym = symbolId("h.ts", "left", "review");
    const rightSym = symbolId("h.ts", "right", "review");
    const handlerSym = symbolId("h.ts", "handler", "review");
    const epId = appContextNodeId("review", "ApiEndpoint", ["GET", "/items"]);
    const tId = entityId("public", "t", "review");

    const symbols = [
      { id: querySym, file: "h.ts", symbolKind: "function", symbolName: "query", line: 3 },
      { id: leftSym, file: "h.ts", symbolKind: "function", symbolName: "left", line: 10 },
      { id: rightSym, file: "h.ts", symbolKind: "function", symbolName: "right", line: 11 },
      { id: handlerSym, file: "h.ts", symbolKind: "function", symbolName: "handler", line: 12 },
    ];
    const endpoints = [
      { id: epId, method: "GET", pathTemplate: "/items", file: "routes.ts", line: 9 },
    ];
    const handles = [
      { handler: handlerSym, endpoint: epId, file: "routes.ts", line: 9 },
    ];
    const forwardCalls = [
      { caller: leftSym, callee: querySym, file: "h.ts", line: 10 },
      { caller: rightSym, callee: querySym, file: "h.ts", line: 11 },
      { caller: handlerSym, callee: leftSym, file: "h.ts", line: 12 },
      { caller: handlerSym, callee: rightSym, file: "h.ts", line: 13 },
      // Cycle between left and right at bound
      { caller: leftSym, callee: rightSym, file: "h.ts", line: 14 },
      { caller: rightSym, callee: leftSym, file: "h.ts", line: 15 },
    ];
    const reversedCalls = [...forwardCalls].reverse();

    const forwardRes = extractDataModel(
      [{ path: "h.ts", language: "ts", content: hFile }],
      { repoKey: "review", commit: COMMIT, symbols, endpoints, calls: forwardCalls, handles, maxHops: 2 },
    );
    const reversedRes = extractDataModel(
      [{ path: "h.ts", language: "ts", content: hFile }],
      { repoKey: "review", commit: COMMIT, symbols, endpoints, calls: reversedCalls, handles, maxHops: 2 },
    );

    // Order-independent equality
    expect(forwardRes).toEqual(reversedRes);

    const epEdge = forwardRes.edges.find(
      (e) => e.source === epId && e.target === tId && e.relation === "reads",
    )!;
    expect(epEdge).toBeDefined();
    expect(epEdge.derivation_method).toBe("handler_call_propagation");
    // Must include: direct access (h.ts:4), both diamond branches (h.ts:10, 11, 12, 13), and handles registration (routes.ts:9)
    expect(epEdge.evidence_refs).toEqual([
      "h.ts#L4-L4",
      "h.ts#L10-L10",
      "h.ts#L11-L11",
      "h.ts#L12-L12",
      "h.ts#L13-L13",
      "routes.ts#L9-L9",
    ]);
  });

  it("R2-M1 & R2-M10: slices UTF-8 Buffers accurately after multi-byte comments, decodes string escapes, and records exact multiline AST spans", () => {
    const asciiSource = [
      '// a',
      'import { pgTable, integer, text } from "drizzle-orm/pg-core";',
      'export const users = pgTable(',
      '  "users",',
      '  {',
      '    id: integer("id")',
      '      .primaryKey(),',
      '    name: text("name")',
      '      .notNull(),',
      '  },',
      ');',
      'export async function loadUsers(db: any) {',
      '  return db',
      '    .select()',
      '    .from(users);',
      '}',
    ].join("\n");

    const utf8AndEscapedSource = [
      '// é — café 🚀',
      'import { pgTable, integer, text } from "drizzle-orm/pg-core";',
      'export const users = pgTable(',
      '  "u\\u0073ers",',
      '  {',
      '    id: integer("i\\x64")',
      '      .primaryKey(),',
      '    name: text("na\\u{6d}e")',
      '      .notNull(),',
      '  },',
      ');',
      'export async function loadUsers(db: any) {',
      '  return db',
      '    .select()',
      '    .from(users);',
      '}',
    ].join("\n");

    const asciiRes = extractDataModel(
      [{ path: "api/db/u.ts", language: "drizzle", content: asciiSource }],
      { repoKey: REPO, commit: COMMIT },
    );
    const utf8Res = extractDataModel(
      [{ path: "api/db/u.ts", language: "drizzle", content: utf8AndEscapedSource }],
      { repoKey: REPO, commit: COMMIT },
    );

    expect(utf8Res.diagnostics).toEqual([]);
    // Exact parity of nodes, IDs, attributes, and multiline spans between ASCII and UTF-8 + escaped literals
    expect(utf8Res).toEqual(asciiRes);

    const entity = nodesByType(utf8Res, "DataEntity")[0]!;
    expect(entity.name).toBe("users");
    expect(entity.line_start).toBe(3);
    expect(entity.line_end).toBe(11);

    const idField = nodesByType(utf8Res, "DataField").find((f) => f.name === "id")!;
    expect(idField.line_start).toBe(6);
    expect(idField.line_end).toBe(7);

    const readEdge = utf8Res.edges.find((e) => e.relation === "reads")!;
    expect(readEdge.citations[0]).toMatchObject({
      source_file: "api/db/u.ts",
      line_start: 13,
      line_end: 15,
    });
  });

  it("Note 5: keeps composite dotted schema/table names as collision-free structural tuples and validates against profile.yaml", () => {
    const code = [
      'import { pgSchema, uuid } from "drizzle-orm/pg-core";',
      'const ab = pgSchema("a.b");',
      'const a = pgSchema("a");',
      'export const t1 = ab.table("c", { id: uuid("id").primaryKey() });',
      'export const t2 = a.table("b.c", { id: uuid("id").primaryKey() });',
    ].join("\n");

    const res = extractDataModel(
      [{ path: "api/db/dots.ts", language: "drizzle", content: code }],
      { repoKey: REPO, commit: COMMIT },
    );

    const id1 = entityId("a.b", "c");
    const id2 = entityId("a", "b.c");
    expect(id1).not.toBe(id2);
    expect(nodesByType(res, "DataEntity").map((e) => e.id).sort()).toEqual([id1, id2].sort());

    // Validate all emitted relations and derivation methods against profiles/app-context/v1/profile.yaml
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const raw = readFileSync(join(repoRoot, "profiles", "app-context", "v1", "profile.yaml"), "utf8");
    const profile = parseOntologyProfile(raw, "profile.yaml");
    const allowed = new Map<string, Set<string>>();
    for (const [name, rel] of Object.entries(profile.relation_types ?? {})) {
      allowed.set(name, new Set(rel.derivation_methods ?? []));
    }
    for (const edge of res.edges) {
      expect(allowed.has(edge.relation)).toBe(true);
      expect(allowed.get(edge.relation)!.has(edge.derivation_method)).toBe(true);
    }
  });

  it("R2-M12: extractDataModelFromFiles preserves unchanged extractSql and extractJs outputs with shared checkout rootDir", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "graphify-appctx-l4-root-"));
    cleanupDirs.push(rootDir);

    mkdirSync(join(rootDir, "src", "app-context"), { recursive: true });
    mkdirSync(join(rootDir, "migrations"), { recursive: true });

    const ts1Path = join(rootDir, "src", "node-id.ts");
    const ts2Path = join(rootDir, "src", "app-context", "node-id.ts");
    const sqlPath = join(rootDir, "migrations", "0001_init.sql");

    writeFileSync(
      ts1Path,
      [
        'import { pgTable, serial } from "drizzle-orm/pg-core";',
        'export const items = pgTable("items", { id: serial("id").primaryKey() });',
        'export function getItems(db: any) { return db.select().from(items); }',
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      ts2Path,
      [
        'import { items } from "../node-id";',
        'export function createItem(db: any) { return db.insert(items).values({}); }',
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      sqlPath,
      [
        "CREATE TABLE authors (id INT PRIMARY KEY, name TEXT);",
        "CREATE TABLE books (id INT PRIMARY KEY, author_id INT REFERENCES authors(id));",
        "CREATE TRIGGER trg_books AFTER INSERT ON books FOR EACH ROW EXECUTE FUNCTION log_book();",
        "CREATE FUNCTION log_book() RETURNS trigger AS $b$ BEGIN SELECT * FROM books; RETURN NEW; END; $b$ LANGUAGE plpgsql;",
      ].join("\n"),
      "utf-8",
    );

    const files = [
      { absPath: ts1Path, repoRelPath: "src/node-id.ts", language: "drizzle" as const },
      { absPath: ts2Path, repoRelPath: "src/app-context/node-id.ts", language: "ts" as const },
      { absPath: sqlPath, repoRelPath: "migrations/0001_init.sql", language: "sql" as const },
    ];

    const wrapped = await extractDataModelFromFiles(files, { repoKey: REPO, commit: COMMIT });
    const directTs1 = await extractJs(ts1Path, rootDir);
    const directTs2 = await extractJs(ts2Path, rootDir);
    const directSql = await extractSql(sqlPath, rootDir);

    // Base extractor outputs match direct calls with checkout rootDir (no per-file dirname collision)
    expect(wrapped.base[0]).toEqual(directTs1);
    expect(wrapped.base[1]).toEqual(directTs2);
    expect(wrapped.base[2]).toEqual(directSql);
    expect(wrapped.base[0]!.nodes[0]!.id).not.toBe(wrapped.base[1]!.nodes[0]!.id);

    // Legacy SQL relations remain intact in base[2]
    const sqlRelations = new Set(wrapped.base[2]!.edges.map((e) => e.relation));
    expect(sqlRelations.has("reads_from")).toBe(true);
    expect(sqlRelations.has("triggers")).toBe(true);
    expect(sqlRelations.has("references")).toBe(true);
    expect(sqlRelations.has("contains")).toBe(true);
  });

  describe("R3 counter-examples (Astra review r3)", () => {
    const R3_REPO = "review-r3";
    const PG = 'import {pgTable,pgSchema,integer,text,primaryKey,foreignKey} from "drizzle-orm/pg-core";\n';
    const T = 'export const t=pgTable("real",{id:integer("id").primaryKey()});\n';
    const source = (path: string, content: string) => ({ path, language: "ts" as const, content });
    const extract = (sources: Array<{ path: string; language: "ts"; content: string }>) =>
      extractDataModel(sources, { repoKey: R3_REPO, commit: COMMIT });
    const one = (content: string) => extract([source("case.ts", content)]);
    const access = (r: ExtractDataModelResult) =>
      r.edges.filter((e) => e.relation === "reads" || e.relation === "writes");
    const field = (r: ExtractDataModelResult, table: string, name: string) =>
      r.nodes.find((n) => n.node_type === "DataField" && n.entityName === table && n.name === name);
    const symId = (file: string, name: string) =>
      appContextNodeId(R3_REPO, "CodeSymbol", [file, "function", name]);

    it("B1: destructuring a table binding must block outer lookup", () => {
      const r = one(
        PG + T + "export function h(db, x) { const { t } = x; return db.select().from(t); }",
      );
      expect(access(r)).toEqual([]);
    });

    it("B1: destructuring the constructor must not declare ghost", () => {
      const r = one(
        PG +
          'export function h(x) { const { pgTable } = x; return pgTable("ghost", {id:integer("id")}); }',
      );
      expect(r.nodes).toEqual([]);
    });

    it("B1: var is function-scoped even when declared inside a block", () => {
      const r = one(
        PG + T + "export function h(db, x) { if (x) { var t = x; } return db.select().from(t); }",
      );
      expect(access(r)).toEqual([]);
    });

    it("B1: reassignment must not retain the initializer target", () => {
      const r = one(
        PG +
          'let t = pgTable("a", {id:integer("id")});\n' +
          't = pgTable("b", {id:integer("id")});\n' +
          "export function h(db) { return db.select().from(t); }",
      );
      const a = r.nodes.find((n) => n.node_type === "DataEntity" && n.name === "a")!;
      expect(access(r).some((e) => e.target === a.id)).toBe(false);
    });

    it("B1: ambiguous star exports must not pick the first table", () => {
      const r = extract([
        source("a.ts", PG + 'export const t=pgTable("a",{id:integer("id")});'),
        source("b.ts", PG + 'export const t=pgTable("b",{id:integer("id")});'),
        source("barrel.ts", 'export * from "./a"; export * from "./b";'),
        source(
          "case.ts",
          'import {t} from "./barrel"; export function h(db){return db.select().from(t);}',
        ),
      ]);
      expect(access(r)).toEqual([]);
      const d = r.diagnostics.find((diag) => diag.code === "target-ambiguous");
      expect(d).toBeDefined();
      expect(d!.candidates?.map((c) => c.file)).toEqual(["a.ts", "b.ts"]);
    });

    it("B2: Set.delete(table) is not a database mutation", () => {
      const r = one(
        PG + T + "export function h() { const cache = new Set([t]); return cache.delete(t); }",
      );
      expect(access(r)).toEqual([]);
    });

    it("B2: a local select/from object is not a Drizzle reader", () => {
      const r = one(
        PG +
          T +
          "export function h() {" +
          " const view = {select(){return {from(x){return x;}};}};" +
          " return view.select().from(t); }",
      );
      expect(access(r)).toEqual([]);
    });

    it("B3: returning an anonymous reader does not make h read", () => {
      const r = one(PG + T + "export function h(db) { return () => db.select().from(t); }");
      expect(access(r)).toEqual([]);
    });

    it("B3: an object method must not contaminate exported function h", () => {
      const r = one(
        PG +
          'const a=pgTable("a",{id:integer("id")});\n' +
          'const b=pgTable("b",{id:integer("id")});\n' +
          "export const hidden={h(db){return db.select().from(a);}};\n" +
          "export function h(db){return db.select().from(b);}",
      );
      const byId = new Map(r.nodes.map((n) => [n.id, n]));
      const targets = access(r)
        .filter((e) => e.source === symId("case.ts", "h"))
        .map((e) => byId.get(e.target)!.name)
        .sort();
      expect(targets).toEqual(["b"]);
    });

    it("B4: a spread must not preserve overwritten column facts", () => {
      const r = one(
        PG +
          'const common={id:text("id")};\n' +
          'export const t=pgTable("real",{id:integer("id").primaryKey(),...common});',
      );
      expect(r.diagnostics.some((d) => d.code === "unsupported-construct")).toBe(true);
      expect(r.nodes).toEqual([]);
      expect(r.edges).toEqual([]);
    });

    it("B4: a computed member must not preserve overwritten column facts", () => {
      const r = one(
        PG + 'export const t=pgTable("real",{id:integer("id").primaryKey(),["id"]:text("id")});',
      );
      expect(r.diagnostics.some((d) => d.code === "unsupported-construct")).toBe(true);
      expect(r.nodes).toEqual([]);
      expect(r.edges).toEqual([]);
    });

    it("M1: table-level PK evidence belongs on its field", () => {
      const r = one(
        PG +
          'export const t=pgTable("real",{\n' +
          '  id:integer("id"),\n' +
          "},t=>[\n" +
          "  primaryKey({columns:[t.id]})\n" +
          "]);",
      );
      const f = field(r, "real", "id")!;
      expect(f.isPk).toBe(true);
      expect(f.citations.some((c) => c.line_start === 5 && c.line_end === 5)).toBe(true);
      expect(f.evidence_refs).toContain("case.ts#L5-L5");
    });

    it("M1: table-level FK evidence belongs on its field", () => {
      const r = one(
        PG +
          T +
          'export const child=pgTable("child",{\n' +
          '  parent:integer("parent"),\n' +
          "},c=>[\n" +
          "  foreignKey({columns:[c.parent],foreignColumns:[t.id]})\n" +
          "]);",
      );
      const f = field(r, "child", "parent")!;
      expect(f.isFk).toBe(true);
      expect(f.citations.some((c) => c.line_start === 6 && c.line_end === 6)).toBe(true);
      expect(f.evidence_refs).toContain("case.ts#L6-L6");
    });

    it("M2: unbound pgTable must produce the promised refusal", () => {
      const r = one('export const t=pgTable("t",{id:integer("id")});');
      expect(r.nodes).toEqual([]);
      expect(r.diagnostics.some((d) => d.code === "unsupported-construct")).toBe(true);
    });

    it("M2: inline dynamic pgSchema must produce a refusal", () => {
      const r = one(
        PG +
          'const schemaName="app";\n' +
          'export const t=pgSchema(schemaName).table("t",{id:integer("id")});',
      );
      expect(r.nodes).toEqual([]);
      expect(r.diagnostics.some((d) => d.code === "unsupported-construct")).toBe(true);
    });

    it("M3: an argument comment must not remove a supported table", () => {
      const r = one(PG + 'export const t=pgTable(/* table */ "real",{id:integer("id")});');
      expect(field(r, "real", "id")).toBeDefined();
      expect(r.diagnostics).toEqual([]);
    });

    it("M3: a modifier comment must not remove a supported PK field", () => {
      const r = one(
        PG + 'export const t=pgTable("real",{id:integer("id").primaryKey(/* pk */)});',
      );
      expect(field(r, "real", "id")).toBeDefined();
      expect(field(r, "real", "id")!.isPk).toBe(true);
      expect(r.diagnostics).toEqual([]);
    });

    it("M4: distinct dotted selectors need distinct diagnostic IDs", () => {
      const r = one(
        PG +
          'export const a=pgTable("a.b",{c:integer("c").array()}); ' +
          'export const b=pgTable("a",{"b.c":integer("b.c").array()});',
      );
      expect(r.diagnostics).toHaveLength(2);
      expect(new Set(r.diagnostics.map((d) => d.id)).size).toBe(2);
    });

    it("N1: a fresh SQL-only import must not request TypeScript grammar", () => {
      const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
      const program = [
        'import {createServer} from "vite";',
        'import Module from "node:module";',
        'const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true},appType:"custom"});',
        "const original=Module._resolveFilename, requests=[], errors=[];",
        'process.on("unhandledRejection",e=>errors.push(String(e)));',
        "Module._resolveFilename=function(request,...rest){",
        ' if(request.startsWith("tree-sitter-typescript/")){requests.push(request);throw new Error("TS grammar deliberately unavailable");}',
        " return original.call(this,request,...rest);",
        "};",
        "try {",
        ' const m=await server.ssrLoadModule("/src/app-context/extract-data-model.ts");',
        ' const model=m.extractDataModel([{path:"a.sql",language:"sql",content:"CREATE TABLE t(id int);"}],{repoKey:"review-r3",commit:"f".repeat(40)});',
        " await new Promise(resolve=>setTimeout(resolve,10));",
        " console.log(JSON.stringify({model,requests,errors}));",
        "} finally {Module._resolveFilename=original;await server.close();}",
      ].join("\n");
      const observed = JSON.parse(
        execFileSync(process.execPath, ["--input-type=module", "-e", program], {
          encoding: "utf8",
          cwd: repoRoot,
        }),
      );
      expect(observed.model).toEqual({ nodes: [], edges: [], diagnostics: [] });
      expect(observed.requests).toEqual([]);
      expect(observed.errors).toEqual([]);
    });
  });
});
