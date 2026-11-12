import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  hashOntologyProfile,
  normalizeOntologyProfile,
  parseOntologyProfile,
  validateOntologyProfile,
} from "../src/ontology-profile.js";
import { bundleProfile } from "../src/profile-bundle.js";
import { APP_CONTEXT_ID_PREFIX, appContextNodeId } from "../src/app-context/node-id.js";
import type { AppContextNodeType } from "../src/app-context/types.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = join(repoRoot, "profiles", "app-context", "v1", "profile.yaml");

describe("app-context@1 ontology profile (Lot L1, §2.1–§2.3)", () => {
  it("parses profiles/app-context/v1/profile.yaml, passes validateOntologyProfile with 0 errors, and bundles with 0 warnings", () => {
    const raw = readFileSync(profilePath, "utf8");
    const parsed = parseOntologyProfile(raw, profilePath);

    expect(parsed.id).toBe("app-context");
    expect(parsed.version).toBe(1);

    const validationErrors = validateOntologyProfile(parsed);
    expect(validationErrors).toEqual([]);

    const normalized = normalizeOntologyProfile(parsed, profilePath);
    expect(normalized.id).toBe("app-context");
    expect(normalized.version).toBe("1");
    expect(Object.keys(normalized.node_types)).toHaveLength(20);
    expect(Object.keys(normalized.relation_types)).toHaveLength(30);
    expect(normalized.profile_hash).toMatch(/^[0-9a-f]{64}$/);

    const bundled = bundleProfile(raw);
    expect(bundled.ok).toBe(true);
    if (!bundled.ok) throw new Error("bundleProfile failed");
    expect(bundled.warnings).toEqual([]);
    expect(bundled.bundle.extensions).toEqual({});
    expect(bundled.bundle.profileId).toBe("app-context");
    expect(bundled.bundle.profileVersion).toBe("1");
    expect(bundled.bundle.profileHash).toBe(normalized.profile_hash);
  });

  it("is hash-sensitive to mutations on every relation's source_types, target_types, requires_evidence, and derivation_methods", () => {
    const raw = readFileSync(profilePath, "utf8");
    const baseProfile = parseOntologyProfile(raw, profilePath);
    const baseRawHash = hashOntologyProfile(baseProfile);
    const baseNormalizedHash = normalizeOntologyProfile(baseProfile, profilePath).profile_hash;

    const relationNames = Object.keys(baseProfile.relation_types ?? {});
    expect(relationNames).toHaveLength(30);

    for (const relName of relationNames) {
      // 1. Mutate source_types
      const mutSource = structuredClone(baseProfile);
      const relSource = mutSource.relation_types![relName]!;
      relSource.source_types =
        relSource.source_types && relSource.source_types.length > 1
          ? relSource.source_types.slice(0, -1)
          : [...(relSource.source_types ?? []), relSource.source_types?.[0] === "Spec" ? "File" : "Spec"];
      expect(hashOntologyProfile(mutSource), `${relName}.source_types raw hash`).not.toBe(baseRawHash);
      expect(
        normalizeOntologyProfile(mutSource, profilePath).profile_hash,
        `${relName}.source_types normalized hash`,
      ).not.toBe(baseNormalizedHash);

      // 2. Mutate target_types
      const mutTarget = structuredClone(baseProfile);
      const relTarget = mutTarget.relation_types![relName]!;
      relTarget.target_types =
        relTarget.target_types && relTarget.target_types.length > 1
          ? relTarget.target_types.slice(0, -1)
          : [...(relTarget.target_types ?? []), relTarget.target_types?.[0] === "Spec" ? "File" : "Spec"];
      expect(hashOntologyProfile(mutTarget), `${relName}.target_types raw hash`).not.toBe(baseRawHash);
      expect(
        normalizeOntologyProfile(mutTarget, profilePath).profile_hash,
        `${relName}.target_types normalized hash`,
      ).not.toBe(baseNormalizedHash);

      // 3. Mutate requires_evidence
      const mutEvidence = structuredClone(baseProfile);
      const relEvidence = mutEvidence.relation_types![relName]!;
      relEvidence.requires_evidence = !relEvidence.requires_evidence;
      expect(hashOntologyProfile(mutEvidence), `${relName}.requires_evidence raw hash`).not.toBe(baseRawHash);
      expect(
        normalizeOntologyProfile(mutEvidence, profilePath).profile_hash,
        `${relName}.requires_evidence normalized hash`,
      ).not.toBe(baseNormalizedHash);

      // 4. Mutate derivation_methods
      const mutMethods = structuredClone(baseProfile);
      const relMethods = mutMethods.relation_types![relName]!;
      relMethods.derivation_methods = [...(relMethods.derivation_methods ?? []), "synthetic_mutated_method"];
      expect(hashOntologyProfile(mutMethods), `${relName}.derivation_methods raw hash`).not.toBe(baseRawHash);
      expect(
        normalizeOntologyProfile(mutMethods, profilePath).profile_hash,
        `${relName}.derivation_methods normalized hash`,
      ).not.toBe(baseNormalizedHash);
    }
  });

  it("enforces structural tuple injectivity and prefix discipline in appContextNodeId (§2.2)", () => {
    const repo = "radar-immobilier";

    // Delimiter collision resistance: ["postgres","a.b","c"] != ["postgres","a","b.c"]
    const entityAb_c = appContextNodeId(repo, "DataEntity", ["postgres", "a.b", "c"]);
    const entityA_bc = appContextNodeId(repo, "DataEntity", ["postgres", "a", "b.c"]);
    expect(entityAb_c).toMatch(/^entity:[0-9a-f]{32}$/);
    expect(entityA_bc).toMatch(/^entity:[0-9a-f]{32}$/);
    expect(entityAb_c).not.toBe(entityA_bc);

    // Punctuation preservation: "GET /a/:id" != "GET /a/id"
    const epParam = appContextNodeId(repo, "ApiEndpoint", ["GET /a/:id"]);
    const epLiteral = appContextNodeId(repo, "ApiEndpoint", ["GET /a/id"]);
    expect(epParam).toMatch(/^ep:[0-9a-f]{32}$/);
    expect(epLiteral).toMatch(/^ep:[0-9a-f]{32}$/);
    expect(epParam).not.toBe(epLiteral);

    const epTupleParam = appContextNodeId(repo, "ApiEndpoint", ["GET", "/a/:id"]);
    const epTupleLiteral = appContextNodeId(repo, "ApiEndpoint", ["GET", "/a/id"]);
    expect(epTupleParam).not.toBe(epTupleLiteral);
    expect(epTupleParam).not.toBe(epParam);

    // Diagnostic IDs
    const diagAmbiguous = appContextNodeId(repo, "Diagnostic", ["target-ambiguous", "entity:postgres.public.lots"]);
    const diagUnresolved = appContextNodeId(repo, "Diagnostic", ["target-unresolved", "entity:postgres.public.lots"]);
    expect(diagAmbiguous).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(diagUnresolved).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(diagAmbiguous).not.toBe(diagUnresolved);

    // Determinism and repoKey isolation
    expect(appContextNodeId(repo, "DataEntity", ["postgres", "a.b", "c"])).toBe(entityAb_c);
    expect(appContextNodeId("other-repo", "DataEntity", ["postgres", "a.b", "c"])).not.toBe(entityAb_c);

    // Prefix coverage across all app-context node types
    const expectedPrefixes: Record<AppContextNodeType | "Diagnostic", string> = {
      Spec: "spec:",
      SpecSection: "specsec:",
      Requirement: "req:",
      TrackWorkpackage: "twp:",
      TrackItem: "titem:",
      TrackDecision: "tdec:",
      DataEntity: "entity:",
      DataField: "field:",
      Route: "route:",
      Component: "comp:",
      ApiEndpoint: "ep:",
      CodeSymbol: "sym:",
      File: "file:",
      Commit: "commit:",
      Branch: "branch:",
      mcp_config_file: "mcpcfg:",
      mcp_server: "mcpsrv:",
      mcp_command: "mcpcmd:",
      mcp_package: "mcppkg:",
      env_var: "env:",
      Diagnostic: "diag:",
    };
    for (const [nodeType, prefix] of Object.entries(expectedPrefixes) as Array<
      [AppContextNodeType | "Diagnostic", string]
    >) {
      expect(APP_CONTEXT_ID_PREFIX[nodeType]).toBe(prefix);
      const id = appContextNodeId(repo, nodeType, ["seed-1"]);
      expect(id.startsWith(prefix)).toBe(true);
      expect(id.slice(prefix.length)).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
