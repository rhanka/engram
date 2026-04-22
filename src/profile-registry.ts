import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";

import type {
  Extraction,
  NormalizedOntologyProfile,
  NormalizedOntologyRegistrySpec,
  RegistryRecord,
} from "./types.js";

function readRegistryRows(path: string): Array<Record<string, unknown>> {
  const ext = extname(path).toLowerCase();
  const raw = readFileSync(path, "utf-8");
  if (ext === ".csv") {
    return parseCsv(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, unknown>>;
  }
  if (ext === ".json") {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`registry file must contain an array: ${path}`);
    }
    return parsed.map((item) => item as Record<string, unknown>);
  }
  if (ext === ".yaml" || ext === ".yml") {
    const parsed = parseYaml(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`registry file must contain an array: ${path}`);
    }
    return parsed.map((item) => item as Record<string, unknown>);
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
  return {
    registryId,
    id,
    label,
    aliases: registrySpec.alias_columns
      .map((column) => field(rawRecord, column))
      .filter(Boolean),
    nodeType: registrySpec.node_type,
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
  const records = readRegistryRows(sourceFile).map((rawRecord) =>
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
  return Object.fromEntries(
    Object.entries(profile.registries).map(([registryId, registrySpec]) => [
      registryId,
      loadProfileRegistry(registryId, registrySpec),
    ]),
  );
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
