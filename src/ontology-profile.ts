import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import type {
  NormalizedOntologyProfile,
  NormalizedOntologyRegistrySpec,
  NormalizedOntologyRelationType,
  NormalizedProjectConfig,
  OntologyCitationPolicy,
  OntologyHardeningPolicy,
  OntologyNodeType,
  OntologyProfile,
  OntologyRegistrySpec,
  OntologyRelationType,
} from "./types.js";

const DEFAULT_STATUSES = ["candidate", "attached", "needs_review", "validated", "rejected", "superseded"];
const VALID_CITATION_MINIMUMS = new Set(["file", "page", "section", "paragraph"]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim().length > 0 ? [value] : [];
}

function normalizeStringMap<T>(value: unknown): Record<string, T> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(([key, item]) => key.trim().length > 0 && asRecord(item)),
  ) as Record<string, T>;
}

function stableForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === "sourcePath" || key === "profile_hash" || key === "bound_source_path") continue;
      result[key] = stableForHash((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function relationEndpoints(relation: OntologyRelationType, field: "source" | "target"): string[] {
  const normalizedField = field === "source" ? relation.source_types : relation.target_types;
  return normalizedField && normalizedField.length > 0
    ? normalizedField
    : asStringArray(relation[field]);
}

function normalizeRelation(relation: OntologyRelationType): NormalizedOntologyRelationType {
  return {
    source_types: relationEndpoints(relation, "source"),
    target_types: relationEndpoints(relation, "target"),
  };
}

function normalizeRegistry(registry: OntologyRegistrySpec): NormalizedOntologyRegistrySpec {
  return {
    source: String(registry.source ?? ""),
    id_column: String(registry.id_column ?? ""),
    label_column: String(registry.label_column ?? ""),
    alias_columns: asStringArray(registry.alias_columns),
    node_type: String(registry.node_type ?? ""),
    ...(registry.bound_source_path ? { bound_source_path: registry.bound_source_path } : {}),
  };
}

function normalizeCitationPolicy(policy: OntologyCitationPolicy | undefined): Required<OntologyCitationPolicy> {
  const minimum = String(policy?.minimum_granularity ?? "page").toLowerCase();
  return {
    minimum_granularity: VALID_CITATION_MINIMUMS.has(minimum)
      ? minimum as "file" | "page" | "section" | "paragraph"
      : "page",
    require_source_file: policy?.require_source_file ?? true,
    allow_bbox: policy?.allow_bbox ?? "when_available",
  };
}

function normalizeHardeningPolicy(policy: OntologyHardeningPolicy | undefined): Required<OntologyHardeningPolicy> {
  const statuses = asStringArray(policy?.statuses);
  return {
    statuses: statuses.length > 0 ? statuses : DEFAULT_STATUSES,
    default_status: String(policy?.default_status ?? "candidate"),
    promotion_requires: asStringArray(policy?.promotion_requires),
  };
}

export function parseOntologyProfile(raw: string | Record<string, unknown>, sourcePath?: string): OntologyProfile {
  if (typeof raw !== "string") return asRecord(raw) as OntologyProfile;
  const trimmed = raw.trim();
  const parsed = extname(sourcePath ?? "").toLowerCase() === ".json" || trimmed.startsWith("{")
    ? JSON.parse(trimmed || "{}")
    : parseYaml(trimmed || "{}");
  return asRecord(parsed) as OntologyProfile;
}

export function validateOntologyProfile(profile: OntologyProfile): string[] {
  const errors: string[] = [];
  const nodeTypes = normalizeStringMap<OntologyNodeType>(profile.node_types);
  const relationTypes = normalizeStringMap<OntologyRelationType>(profile.relation_types);
  const registries = normalizeStringMap<OntologyRegistrySpec>(profile.registries);
  const knownNodeTypes = new Set(Object.keys(nodeTypes));

  if (typeof profile.id !== "string" || profile.id.trim().length === 0) {
    errors.push("id is required");
  }
  if (profile.version === undefined || String(profile.version).trim().length === 0) {
    errors.push("version is required");
  }
  if (knownNodeTypes.size === 0) {
    errors.push("node_types must contain at least one node type");
  }

  for (const [relationId, relation] of Object.entries(relationTypes)) {
    const sourceTypes = relationEndpoints(relation, "source");
    const targetTypes = relationEndpoints(relation, "target");
    if (sourceTypes.length === 0) {
      errors.push(`relation_types.${relationId}.source is required`);
    }
    if (targetTypes.length === 0) {
      errors.push(`relation_types.${relationId}.target is required`);
    }
    for (const source of sourceTypes) {
      if (!knownNodeTypes.has(source)) {
        errors.push(`relation_types.${relationId}.source references unknown node type ${source}`);
      }
    }
    for (const target of targetTypes) {
      if (!knownNodeTypes.has(target)) {
        errors.push(`relation_types.${relationId}.target references unknown node type ${target}`);
      }
    }
  }

  for (const [registryId, registry] of Object.entries(registries)) {
    if (typeof registry.source !== "string" || registry.source.trim().length === 0) {
      errors.push(`registries.${registryId}.source is required`);
    }
    if (typeof registry.id_column !== "string" || registry.id_column.trim().length === 0) {
      errors.push(`registries.${registryId}.id_column is required`);
    }
    if (typeof registry.label_column !== "string" || registry.label_column.trim().length === 0) {
      errors.push(`registries.${registryId}.label_column is required`);
    }
    if (typeof registry.node_type !== "string" || registry.node_type.trim().length === 0) {
      errors.push(`registries.${registryId}.node_type is required`);
    } else if (!knownNodeTypes.has(registry.node_type)) {
      errors.push(`registries.${registryId}.node_type references unknown node type ${registry.node_type}`);
    }
  }

  return errors;
}

export function hashOntologyProfile(profile: OntologyProfile | NormalizedOntologyProfile): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(stableForHash(profile)));
  return h.digest("hex");
}

export function normalizeOntologyProfile(profile: OntologyProfile, sourcePath?: string): NormalizedOntologyProfile {
  const errors = validateOntologyProfile(profile);
  if (errors.length > 0) {
    throw new Error(`Invalid ontology profile:\n${errors.map((item) => `  - ${item}`).join("\n")}`);
  }

  const nodeTypes = normalizeStringMap<OntologyNodeType>(profile.node_types);
  const relationTypes = normalizeStringMap<OntologyRelationType>(profile.relation_types);
  const registries = normalizeStringMap<OntologyRegistrySpec>(profile.registries);
  const normalized: Omit<NormalizedOntologyProfile, "profile_hash"> = {
    id: profile.id!,
    version: String(profile.version),
    default_language: profile.default_language ?? "en",
    ...(sourcePath ? { sourcePath: resolve(sourcePath) } : profile.sourcePath ? { sourcePath: profile.sourcePath } : {}),
    node_types: nodeTypes,
    relation_types: Object.fromEntries(
      Object.entries(relationTypes).map(([id, relation]) => [id, normalizeRelation(relation)]),
    ),
    registries: Object.fromEntries(
      Object.entries(registries).map(([id, registry]) => [id, normalizeRegistry(registry)]),
    ),
    citation_policy: normalizeCitationPolicy(profile.citation_policy),
    hardening: normalizeHardeningPolicy(profile.hardening),
  };

  return {
    ...normalized,
    profile_hash: hashOntologyProfile(normalized),
  };
}

export function bindOntologyProfile(
  profile: NormalizedOntologyProfile,
  projectConfig: NormalizedProjectConfig,
): NormalizedOntologyProfile {
  const registries: Record<string, NormalizedOntologyRegistrySpec> = {};
  for (const [registryId, registry] of Object.entries(profile.registries)) {
    const bound = projectConfig.inputs.registrySources[registry.source];
    if (!bound) {
      throw new Error(
        `registries.${registryId}.source references unknown project registry source ${registry.source}`,
      );
    }
    registries[registryId] = {
      ...registry,
      bound_source_path: bound,
    };
  }
  const boundProfile = { ...profile, registries };
  return {
    ...boundProfile,
    profile_hash: hashOntologyProfile(boundProfile),
  };
}

export function loadOntologyProfile(
  profilePath: string,
  options: { projectConfig?: NormalizedProjectConfig } = {},
): NormalizedOntologyProfile {
  const resolved = resolve(profilePath);
  const raw = readFileSync(resolved, "utf-8");
  const normalized = normalizeOntologyProfile(parseOntologyProfile(raw, resolved), resolved);
  return options.projectConfig ? bindOntologyProfile(normalized, options.projectConfig) : normalized;
}
