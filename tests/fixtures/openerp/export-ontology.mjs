// OpenERP ontology export for the Sentropic DD3 standard-set co-design.
// Deterministic extraction from the migration SQL: entities, columns, typed
// references, enumerations, TABLE-LEVEL invariants (composite keys, named
// uniques, cross-column and shape CHECKs) and forced-RLS status.
// Unmatched input is reported in `parserGaps`, never silently dropped.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/api/src/db/migrations';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const entities = new Map();
const parserGaps = [];
const rlsForced = new Set();

const moduleOf = (file) => {
  const stem = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
  const head = stem.split('_')[0];
  const known = ['foundation', 'canon', 'crm', 'project', 'billing', 'reporting',
    'workflow', 'webhook', 'banking', 'auth', 'agentic', 'audit', 'jobs',
    'passkey', 'oidc', 'openerp', 'translation', 'rls'];
  return known.includes(head) ? head : stem;
};

/** Split a table body on top-level commas only, so multi-line CHECKs survive. */
const splitClauses = (rawBody) => {
  const body = rawBody.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const out = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += char;
  }
  out.push(current);
  return out
    .map((clause) => clause.split('\n').map((l) => l.replace(/--.*$/, '').trim()).filter(Boolean).join(' '))
    .filter(Boolean);
};

// Pass 1: forced RLS, both the single-table and the array-loop forms.
for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  if (!/force row level security/.test(sql)) continue;
  for (const m of sql.matchAll(/protected_table text := '(\w+)'/g)) rlsForced.add(m[1]);
  for (const m of sql.matchAll(/array\[([^\]]*)\]/g)) {
    for (const t of m[1].matchAll(/'(\w+)'/g)) rlsForced.add(t[1]);
  }
}

// Pass 2: entities.
for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');

  for (const match of sql.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g)) {
    const [, name, body] = match;
    const entity = {
      entity: name,
      module: moduleOf(file),
      sourceMigration: file,
      columns: [],
      tableInvariants: [],
      tenantScoped: false,
    };

    for (const clause of splitClauses(body)) {
      if (/^primary key \(/i.test(clause)) {
        entity.tableInvariants.push({ kind: 'compositePrimaryKey', clause });
        continue;
      }
      if (/^(constraint \w+ )?unique \(/i.test(clause)) {
        entity.tableInvariants.push({ kind: 'unique', clause });
        continue;
      }
      if (/^(constraint \w+ )?check \(/i.test(clause)) {
        const shape = /jsonb_typeof/.test(clause) ? 'jsonbShape' : 'crossColumn';
        entity.tableInvariants.push({ kind: `check:${shape}`, clause });
        continue;
      }
      if (/^foreign key \(/i.test(clause)) {
        entity.tableInvariants.push({ kind: 'tableForeignKey', clause });
        continue;
      }

      const col = /^(\w+)\s+([a-z0-9_]+(?:\[\])?(?:\([^)]*\))?)/i.exec(clause);
      if (!col) { parserGaps.push({ file, entity: name, clause }); continue; }

      const column = { name: col[1], type: col[2], notNull: /\bnot null\b/.test(clause) };
      const ref = /references (\w+)\s*\((\w+)\)/.exec(clause);
      if (ref) {
        column.references = { entity: ref[1], field: ref[2] };
        const onDelete = /on delete (\w+( \w+)?)/.exec(clause);
        column.onDelete = onDelete ? onDelete[1] : 'no action (default)';
      }
      const enumMatch = new RegExp(`check \\(\\s*${column.name} in \\(([^)]*)\\)`).exec(clause);
      if (enumMatch) column.enum = enumMatch[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
      const guard = /check \(([^)]*)\)/.exec(clause);
      if (!enumMatch && guard) column.check = guard[1].trim();
      if (column.name === 'organization_id') entity.tenantScoped = true;
      entity.columns.push(column);
    }
    entities.set(name, entity);
  }

  for (const match of sql.matchAll(/alter table (\w+)([\s\S]*?);/g)) {
    const [, name, body] = match;
    const entity = entities.get(name);
    if (!entity) continue;
    for (const add of body.matchAll(/add column (?:if not exists )?(\w+)\s+([a-z0-9_]+(?:\([^)]*\))?)([^,;]*)/gi)) {
      const [, colName, type, tail] = add;
      if (entity.columns.some((c) => c.name === colName)) continue;
      const column = { name: colName, type, notNull: /\bnot null\b/.test(tail), addedBy: file };
      const ref = /references (\w+)\s*\((\w+)\)/.exec(tail);
      if (ref) column.references = { entity: ref[1], field: ref[2] };
      entity.columns.push(column);
    }
    for (const add of body.matchAll(/add constraint (\w+) ([\s\S]*)/gi)) {
      entity.tableInvariants.push({ kind: 'addedConstraint', clause: `${add[1]} ${add[2].trim()}`, addedBy: file });
    }
  }
}

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  for (const m of sql.matchAll(/create trigger (\w+)\s+((?:before|after|instead of)[\s\S]*?)\s+on (\w+)([\s\S]*?);/gi)) {
    const entity = entities.get(m[3]);
    if (!entity) continue;
    entity.tableInvariants.push({
      kind: 'trigger', clause: `${m[1]} ${m[2].replace(/\s+/g, ' ')}${m[4].replace(/\s+/g, ' ')}`, addedBy: file,
    });
  }
}

for (const entity of entities.values()) entity.forcedRls = rlsForced.has(entity.entity);

const list = [...entities.values()];
const relations = list.flatMap((e) =>
  e.columns.filter((c) => c.references).map((c) => ({
    from: e.entity, field: c.name, to: c.references.entity,
    required: c.notNull === true, onDelete: c.onDelete ?? 'n-a',
  })));

const ontology = {
  producer: 'openerp',
  producedAt: new Date().toISOString().slice(0, 10),
  method: 'deterministic parse of apps/api/src/db/migrations/*.sql',
  scopeUnit: 'organization_id',
  tenancyLevels: 1,
  rlsMechanism: 'session setting app.current_organization_id, forced row level security',
  counts: {
    migrations: files.length,
    entities: list.length,
    tenantScopedEntities: list.filter((e) => e.tenantScoped).length,
    forcedRlsEntities: list.filter((e) => e.forcedRls).length,
    relations: relations.length,
    enumeratedFields: list.flatMap((e) => e.columns.filter((c) => c.enum)).length,
    tableInvariants: list.flatMap((e) => e.tableInvariants).length,
    parserGaps: parserGaps.length,
  },
  entities: list,
  relations,
  parserGaps,
};

writeFileSync('tmp/ontology/openerp-ontology.json', JSON.stringify(ontology, null, 2));
console.log(JSON.stringify(ontology.counts, null, 2));
console.log('tenant-scoped sans RLS forcée:',
  list.filter((e) => e.tenantScoped && !e.forcedRls).map((e) => e.entity).join(', ') || 'aucune');
