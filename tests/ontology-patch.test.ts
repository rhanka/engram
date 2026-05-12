import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  ONTOLOGY_PATCH_SCHEMA,
  ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA,
  applyOntologyPatch,
  loadOntologyReconciliationDecisionLog,
  validateOntologyPatch,
  type OntologyPatch,
  type OntologyPatchContext,
} from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-patch-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

const profile: NormalizedOntologyProfile = {
  id: "synthetic",
  version: "1",
  default_language: "en",
  profile_hash: "profile-hash",
  node_types: {
    Component: {},
    Tool: {},
  },
  relation_types: {
    requires_tool: {
      source_types: ["Component"],
      target_types: ["Tool"],
      requires_evidence: true,
      assertion_basis: [],
      derivation_methods: [],
    },
  },
  registries: {},
  citation_policy: {
    minimum_granularity: "page",
    require_source_file: true,
    allow_bbox: "when_available",
  },
  hardening: {
    statuses: ["candidate", "attached", "needs_review", "validated", "rejected", "superseded"],
    default_status: "candidate",
    promotion_requires: [],
    status_transitions: [
      { from_statuses: ["candidate"], to_statuses: ["validated"], requires: ["source_citation"] },
    ],
  },
  inference_policy: {
    allow_inferred_relations: true,
    allowed_relation_types: [],
    require_evidence_refs: false,
  },
  evidence_policy: {
    require_evidence_refs: false,
    min_refs: 0,
    node_types: [],
    relation_types: [],
  },
  hierarchies: {},
  outputs: {
    ontology: {
      enabled: true,
      artifact_schema: "graphify_ontology_outputs_v1",
      canonical_node_types: ["Component", "Tool"],
      source_node_types: [],
      occurrence_node_types: [],
      alias_fields: [],
      relation_exports: ["requires_tool"],
      wiki: {
        enabled: false,
        page_node_types: [],
        include_backlinks: false,
        include_source_snippets: false,
      },
    },
  },
};

function makePatch(overrides: Partial<OntologyPatch> = {}): OntologyPatch {
  return {
    schema: ONTOLOGY_PATCH_SCHEMA,
    id: "patch-synthetic-001",
    operation: "accept_match",
    status: "proposed",
    profile_hash: "profile-hash",
    graph_hash: "graph-hash",
    target: {
      candidate_id: "candidate-component",
      canonical_id: "component-a",
    },
    evidence_refs: ["manual.md#p1"],
    reason: "Synthetic evidence confirms the match.",
    author: "tester",
    created_at: "2026-05-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeContext(root: string, overrides: Partial<OntologyPatchContext> = {}): OntologyPatchContext {
  return {
    rootDir: root,
    stateDir: join(root, ".graphify"),
    graphHash: "graph-hash",
    profile,
    profileState: {
      profile_id: profile.id,
      profile_version: profile.version,
      profile_hash: profile.profile_hash,
      project_config_path: join(root, "graphify.yaml"),
      ontology_profile_path: join(root, "graphify", "ontology-profile.yaml"),
      state_dir: join(root, ".graphify"),
      detect_roots: [join(root, "docs")],
      exclude_roots: [],
      registry_counts: {},
      registry_node_count: 0,
      semantic_file_count: 1,
      transcript_count: 0,
      pdf_artifact_count: 0,
    },
    nodes: [
      { id: "candidate-component", type: "Component", status: "candidate", source_refs: ["manual.md#p1"] },
      { id: "component-a", type: "Component", status: "validated", source_refs: ["manual.md#p1"] },
      { id: "tool-a", type: "Tool", status: "validated", source_refs: ["manual.md#p1"] },
    ],
    relations: [],
    evidenceRefs: new Set(["manual.md#p1"]),
    now: () => "2026-05-05T00:00:00.000Z",
    author: "tester",
    ...overrides,
  };
}

describe("ontology patch core", () => {
  it("validates schema, profile hash, graph hash, target nodes and evidence", () => {
    const root = makeTempDir();

    const valid = validateOntologyPatch(makePatch(), makeContext(root));
    const invalid = validateOntologyPatch(
      makePatch({
        profile_hash: "other-profile",
        graph_hash: "other-graph",
        target: { candidate_id: "missing", canonical_id: "component-a" },
        evidence_refs: ["missing-evidence"],
      }),
      makeContext(root),
    );

    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "profile_hash does not match active profile",
      "graph_hash does not match active graph",
      "target.candidate_id does not exist in ontology nodes",
      "Unknown evidence_ref missing-evidence",
    ]));
  });

  it("enforces profile status transitions and relation endpoint constraints", () => {
    const root = makeTempDir();
    const context = makeContext(root);

    const badStatus = validateOntologyPatch(
      makePatch({
        operation: "set_status",
        target: { node_id: "component-a", from_status: "validated", to_status: "candidate" },
      }),
      context,
    );
    const badRelation = validateOntologyPatch(
      makePatch({
        operation: "add_relation",
        target: {
          source_id: "tool-a",
          target_id: "component-a",
          relation_type: "requires_tool",
        },
      }),
      context,
    );

    expect(badStatus.valid).toBe(false);
    expect(badStatus.issues.map((issue) => issue.message)).toContain(
      "status transition validated -> candidate is not allowed by profile policy",
    );
    expect(badRelation.valid).toBe(false);
    expect(badRelation.issues.map((issue) => issue.message)).toContain(
      "relation endpoint types Tool -> Component are not allowed for requires_tool",
    );
  });

  it("dry-runs apply without mutating files and reports changed-file preview", () => {
    const root = makeTempDir();
    const decisionsPath = join(root, "graphify", "reconciliation", "decisions.jsonl");
    const result = applyOntologyPatch(makePatch(), makeContext(root, { decisionsPath }), { dryRun: true });

    expect(result.valid).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.changed_files.map((file) => file.kind)).toEqual([
      "authoritative_decision_log",
      "audit_log",
      "stale_marker",
    ]);
    expect(existsSync(decisionsPath)).toBe(false);
    expect(existsSync(join(root, ".graphify", "needs_update"))).toBe(false);
  });

  it("writes only configured in-repository paths and appends applied audit logs", () => {
    const root = makeTempDir();
    const decisionsPath = join(root, "graphify", "reconciliation", "decisions.jsonl");
    mkdirSync(root, { recursive: true });

    const result = applyOntologyPatch(makePatch(), makeContext(root, { decisionsPath }), { write: true });

    expect(result.valid).toBe(true);
    expect(readFileSync(decisionsPath, "utf-8")).toContain("patch-synthetic-001");
    expect(readFileSync(join(root, ".graphify", "ontology", "reconciliation", "applied-patches.jsonl"), "utf-8"))
      .toContain("patch-synthetic-001");
    expect(readFileSync(join(root, ".graphify", "needs_update"), "utf-8")).toContain("ontology patch applied");
  });

  it("rejects writes without configured authoritative path or outside the repository jail", () => {
    const root = makeTempDir();

    const missing = applyOntologyPatch(makePatch(), makeContext(root), { write: true });
    const escaped = applyOntologyPatch(
      makePatch(),
      makeContext(root, { decisionsPath: join(root, "..", "escape.jsonl") }),
      { write: true },
    );

    expect(missing.valid).toBe(false);
    expect(missing.issues.map((issue) => issue.message)).toContain(
      "write apply requires a configured authoritative decisionsPath",
    );
    expect(escaped.valid).toBe(false);
    expect(escaped.issues.map((issue) => issue.message)).toContain(
      "configured decisionsPath escapes the repository path jail",
    );
  });

  it("reads authoritative and audit decision logs as a bounded read-only preview", () => {
    const root = makeTempDir();
    const authoritativePath = join(root, "graphify", "reconciliation", "decisions.jsonl");
    const auditPath = join(root, ".graphify", "ontology", "reconciliation", "applied-patches.jsonl");
    mkdirSync(dirname(authoritativePath), { recursive: true });
    mkdirSync(dirname(auditPath), { recursive: true });
    writeFileSync(authoritativePath, [
      JSON.stringify(makePatch({ id: "decision-auth-1", created_at: "2026-05-01T10:00:00.000Z" })),
      "",
      "malformed line",
    ].join("\n"), "utf-8");
    writeFileSync(auditPath, [
      JSON.stringify(makePatch({ id: "decision-audit-1", created_at: "2026-05-02T10:00:00.000Z" })),
      JSON.stringify(makePatch({ id: "decision-audit-2", created_at: "2026-05-03T10:00:00.000Z" })),
    ].join("\n"), "utf-8");

    const result = loadOntologyReconciliationDecisionLog({
      authoritativePath,
      auditPath,
      rootDir: root,
      limit: 2,
      offset: 0,
    });

    expect(result.schema).toBe(ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA);
    expect(result.total).toBe(3);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
    expect(result.items.map((item) => item.source)).toEqual([
      "authoritative",
      "audit",
    ]);
    expect(result.items[0].path).toBe("graphify/reconciliation/decisions.jsonl");
    expect(result.items[0].recorded_at).toBe("2026-05-01T10:00:00.000Z");
    expect(result.items[1].path).toBe(".graphify/ontology/reconciliation/applied-patches.jsonl");
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "authoritative has malformed JSON at line 3: graphify/reconciliation/decisions.jsonl",
      ]),
    );
    expect(result.issues.map((issue) => issue.message).join("\n")).not.toContain("blank line");

    const paged = loadOntologyReconciliationDecisionLog({
      authoritativePath,
      auditPath,
      rootDir: root,
      offset: 1,
    });
    expect(paged.items.map((item) => item.patch.id)).toEqual([
      "decision-audit-1",
      "decision-audit-2",
    ]);

    const outsideRoot = makeTempDir();
    const outsidePath = join(outsideRoot, "outside-decisions.jsonl");
    writeFileSync(outsidePath, JSON.stringify(makePatch({ id: "outside-decision" })), "utf-8");
    const escaped = loadOntologyReconciliationDecisionLog({
      authoritativePath: outsidePath,
      rootDir: root,
    });
    expect(escaped.total).toBe(0);
    expect(escaped.items).toEqual([]);
    expect(escaped.issues.map((issue) => issue.message)).toContain("authoritative path escapes rootDir");
    expect(JSON.stringify(escaped)).not.toContain("outside-decision");
  });
});
