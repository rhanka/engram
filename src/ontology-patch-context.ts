import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ProfileState } from "./configured-dataprep.js";
import { safeExecGit } from "./git.js";
import type { OntologyPatchContext } from "./ontology-patch.js";
import type {
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
  RegistryRecord,
} from "./types.js";

interface ProfilePatchRuntimeContext {
  profileState: ProfileState;
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
  registries?: Record<string, RegistryRecord[]>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as T;
}

function optionalJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceRefsFromSources(value: unknown): Set<string> {
  const refs = new Set<string>();
  if (!Array.isArray(value)) return refs;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = stringValue(record.id);
    const sourceFile = stringValue(record.source_file);
    if (id) refs.add(id);
    if (sourceFile) refs.add(sourceFile);
  }
  return refs;
}

function loadProfilePatchRuntimeContext(profileStatePath: string): ProfilePatchRuntimeContext {
  const resolvedStatePath = resolve(profileStatePath);
  const profileDir = dirname(resolvedStatePath);
  const projectConfigPath = join(profileDir, "project-config.normalized.json");
  const registriesDir = join(profileDir, "registries");
  const registries: Record<string, RegistryRecord[]> = {};
  if (existsSync(registriesDir)) {
    for (const file of readdirSync(registriesDir)) {
      if (!file.endsWith(".json")) continue;
      registries[file.slice(0, -".json".length)] = readJson<RegistryRecord[]>(join(registriesDir, file));
    }
  }
  return {
    profileState: readJson<ProfileState>(resolvedStatePath),
    profile: readJson<NormalizedOntologyProfile>(join(profileDir, "ontology-profile.normalized.json")),
    ...(existsSync(projectConfigPath) ? { projectConfig: readJson<NormalizedProjectConfig>(projectConfigPath) } : {}),
    registries,
  };
}

export function loadOntologyPatchContext(profileStatePath: string): OntologyPatchContext {
  const context = loadProfilePatchRuntimeContext(profileStatePath);
  const stateDir = resolve(context.profileState.state_dir);
  const ontologyDir = join(stateDir, "ontology");
  const manifest = optionalJson<Record<string, unknown>>(join(ontologyDir, "manifest.json"), {});
  const rootDir = context.projectConfig?.configDir ?? dirname(resolve(context.profileState.project_config_path));
  return {
    rootDir,
    stateDir,
    graphHash: stringValue(manifest.graph_hash) ?? "",
    profile: context.profile,
    profileState: context.profileState,
    nodes: optionalJson<Array<Record<string, unknown>>>(join(ontologyDir, "nodes.json"), [])
      .map((node) => ({
        id: stringValue(node.id) ?? "",
        label: stringValue(node.label) ?? undefined,
        type: stringValue(node.type) ?? undefined,
        status: stringValue(node.status) ?? undefined,
        aliases: stringArray(node.aliases),
        normalized_terms: stringArray(node.normalized_terms),
        source_refs: stringArray(node.source_refs),
        registry_refs: stringArray(node.registry_refs),
      }))
      .filter((node) => node.id.length > 0),
    relations: optionalJson<Array<Record<string, unknown>>>(join(ontologyDir, "relations.json"), [])
      .map((relation) => ({
        id: stringValue(relation.id) ?? undefined,
        type: stringValue(relation.type) ?? undefined,
        source_id: stringValue(relation.source_id) ?? undefined,
        target_id: stringValue(relation.target_id) ?? undefined,
        evidence_refs: stringArray(relation.evidence_refs),
      })),
    evidenceRefs: evidenceRefsFromSources(optionalJson(join(ontologyDir, "sources.json"), [])),
    decisionsPath: context.projectConfig?.outputs.ontology.reconciliation.decisions_path ?? undefined,
    dirtyWorktree: safeExecGit(rootDir, ["status", "--porcelain"]) !== null,
  };
}
