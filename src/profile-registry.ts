import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";

import { auditNormalizerContracts, compileNormalizerByNodeType } from "./entity-normalizer.js";
import type {
  Extraction,
  NormalizedOntologyProfile,
  NormalizedOntologyRegistrySpec,
  RegistryRecord,
} from "./types.js";

interface RegistryRows {
  rows: Array<Record<string, unknown>>;
  columns: Set<string>;
}

function columnsOf(rows: Array<Record<string, unknown>>): Set<string> {
  return new Set(rows.flatMap((row) => Object.keys(row)));
}

function readRegistryRows(path: string): RegistryRows {
  const ext = extname(path).toLowerCase();
  const raw = readFileSync(path, "utf-8");
  if (ext === ".csv") {
    const rows = parseCsv(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, unknown>>;
    const [header = []] = parseCsv(raw, {
      to_line: 1,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
    return { rows, columns: new Set(header) };
  }
  if (ext === ".json") {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`registry file must contain an array: ${path}`);
    }
    const rows = parsed.map((item) => item as Record<string, unknown>);
    return { rows, columns: columnsOf(rows) };
  }
  if (ext === ".yaml" || ext === ".yml") {
    const parsed = parseYaml(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`registry file must contain an array: ${path}`);
    }
    const rows = parsed.map((item) => item as Record<string, unknown>);
    return { rows, columns: columnsOf(rows) };
  }
  throw new Error(`unsupported registry file extension: ${ext || path}`);
}

function field(record: Record<string, unknown>, column: string): string {
  const value = record[column];
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function normalizeRegistryRecord(
  registryId: string,
  registrySpec: NormalizedOntologyRegistrySpec,
  rawRecord: Record<string, unknown>,
  sourceFile: string,
): RegistryRecord {
  const id = field(rawRecord, registrySpec.id_column);
  if (!id) {
    throw new Error(`${registryId} record is missing id_column ${registrySpec.id_column}`);
  }
  const label = field(rawRecord, registrySpec.label_column);
  if (!label) {
    throw new Error(`${registryId} record ${id} is missing label_column ${registrySpec.label_column}`);
  }
  const partition = registrySpec.partition_column
    ? field(rawRecord, registrySpec.partition_column)
    : undefined;
  if (registrySpec.partition_column && !partition) {
    throw new Error(`${registryId} record ${id} is missing partition_column ${registrySpec.partition_column}`);
  }
  return {
    registryId,
    id,
    label,
    aliases: registrySpec.alias_columns
      .map((column) => field(rawRecord, column))
      .filter(Boolean),
    nodeType: registrySpec.node_type,
    ...(partition ? { partition } : {}),
    sourceFile: resolve(sourceFile),
    raw: { ...rawRecord },
  };
}

export function loadProfileRegistry(
  registryId: string,
  registrySpec: NormalizedOntologyRegistrySpec,
): RegistryRecord[] {
  if (!registrySpec.bound_source_path) {
    throw new Error(`registries.${registryId} is not bound to a source file`);
  }
  const sourceFile = resolve(registrySpec.bound_source_path);
  const { rows, columns } = readRegistryRows(sourceFile);
  if (registrySpec.partition_column && !columns.has(registrySpec.partition_column)) {
    throw new Error(
      `registries.${registryId}.partition_column ${registrySpec.partition_column} does not exist in ${sourceFile}`,
    );
  }
  const records = rows.map((rawRecord) =>
    normalizeRegistryRecord(registryId, registrySpec, rawRecord, sourceFile),
  );
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`duplicate registry record id ${record.id} in ${registryId}`);
    }
    seen.add(record.id);
  }
  return records;
}

export function loadProfileRegistries(
  profile: NormalizedOntologyProfile,
): Record<string, RegistryRecord[]> {
  const registries = Object.fromEntries(
    Object.entries(profile.registries).map(([registryId, registrySpec]) => [
      registryId,
      loadProfileRegistry(registryId, registrySpec),
    ]),
  ) as Record<string, RegistryRecord[]>;
  // The whole registry is now in memory, but no corpus source has been read:
  // this is the L3 $0 boundary for idempotence and partition-scoped anti-merge.
  auditNormalizerContracts(profile, registries, compileNormalizerByNodeType(profile));
  return registries;
}

function safeIdPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function registryRecordsToExtraction(
  registries: Record<string, RegistryRecord[]>,
  profile: NormalizedOntologyProfile,
): Extraction {
  const nodes: Extraction["nodes"] = [];
  const seen = new Set<string>();
  for (const records of Object.values(registries)) {
    for (const record of records) {
      const nodeId = `registry_${safeIdPart(record.registryId)}_${safeIdPart(record.id)}`;
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      nodes.push({
        id: nodeId,
        label: record.label,
        file_type: "document",
        source_file: record.sourceFile,
        node_type: record.nodeType,
        registry_id: record.registryId,
        registry_record_id: record.id,
        ...(record.partition ? { registry_partition: record.partition } : {}),
        aliases: record.aliases,
        status: "validated",
        profile_id: profile.id,
        profile_version: profile.version,
        profile_hash: profile.profile_hash,
        raw: record.raw,
      });
    }
  }
  return {
    nodes,
    edges: [],
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
}
