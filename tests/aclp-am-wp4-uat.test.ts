/**
 * WP4 ACLP-AM representative UAT.
 *
 * This is intentionally a small end-to-end fixture rather than another unit
 * snapshot: it proves the ACLP hierarchy artifacts produced by the ontology
 * pipeline (`hierarchies.json`, `hierarchy-index.json`) are consumable by the
 * studio/export workspace bundle as the standalone `scene-hierarchies.json`
 * sidecar, discoverable via `workspace-manifest.json`, while the same state can
 * render the Workspace / Reconciliation / Evidence studio routes.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildStaticStudio } from "../src/studio-export.js";
import { compileHierarchies, buildHierarchyIndex } from "../src/ontology-hierarchies.js";
import { handleOntologyStudioRequest } from "../src/ontology-studio.js";
import { loadOntologyProfile } from "../src/ontology-profile.js";
import { loadProfileRegistry } from "../src/profile-registry.js";
import type { CitedSourceRef, NormalizedOntologyRegistrySpec, OntologyHierarchyArc, OntologyHierarchyIndex } from "../src/types.js";

import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

const tempDirs: string[] = [];
const fixtureRoot = join(process.cwd(), "tests", "fixtures", "aclp-am");

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-aclp-wp4-uat-"));
  tempDirs.push(dir);
  return dir;
}

function makeSpaDir(): string {
  const spaDir = makeTempDir();
  writeFileSync(
    join(spaDir, "index.html"),
    '<!doctype html><html><body><div id="app"></div><script type="module" src="./assets/index.js"></script></body></html>',
    "utf-8",
  );
  mkdirSync(join(spaDir, "assets"), { recursive: true });
  writeFileSync(join(spaDir, "assets", "index.js"), "/* app */\n", "utf-8");
  writeFileSync(
    join(spaDir, "studio-template.html"),
    '<!doctype html><html><body><div id="app"></div><script type="module">boot()</script></body></html>',
    "utf-8",
  );
  return spaDir;
}

function compileAclpForestFixture(): { arcs: OntologyHierarchyArc[]; index: OntologyHierarchyIndex } {
  const profilePath = join(fixtureRoot, "graphify", "ontology-profile.yaml");
  const profile = loadOntologyProfile(profilePath);
  const spec: NormalizedOntologyRegistrySpec = {
    ...profile.registries.processes,
    bound_source_path: join(fixtureRoot, "references", "forest.csv"),
  };
  const records = loadProfileRegistry("processes", spec);
  const arcs = compileHierarchies({
    hierarchies: profile.hierarchies,
    registries: { processes: records },
  });
  return { arcs, index: buildHierarchyIndex(arcs) };
}

function expectCitedSourceRef(ref: CitedSourceRef, opts: { bboxRequired: boolean }): void {
  expect(ref.rawRef || ref.sourceUrl || ref.docSha).toBeTruthy();
  expect(ref.rawRef).toMatch(/^raw\/proces-verbaux-fixture-ville\/cas\/[0-9a-f]{64}\.pdf$/);
  expect(ref.rawRef).not.toContain("/tmp/");
  expect(ref.sourceUrl).toBe("https://example.invalid/fixture-ville/pv-2026-04-02.pdf");
  expect(ref.docSha).toMatch(/^[0-9a-f]{64}$/);
  expect(ref.page).toEqual(expect.any(Number));
  expect(Number.isInteger(ref.page)).toBe(true);
  expect(ref.page).toBeGreaterThanOrEqual(1);
  expect(ref.excerpt).toEqual(expect.any(String));
  expect(ref.excerpt?.length).toBeGreaterThan(0);
  expect(ref.meetingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(ref.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  if (!opts.bboxRequired) {
    expect(ref).not.toHaveProperty("bbox");
    return;
  }

  expect(ref.bbox).toEqual(expect.arrayContaining([expect.any(Number)]));
  expect(ref.bbox).toHaveLength(4);
  const [x0, y0, x1, y1] = ref.bbox!;
  expect(x0).toBeGreaterThanOrEqual(0);
  expect(y0).toBeGreaterThanOrEqual(0);
  expect(x1).toBeLessThanOrEqual(1);
  expect(y1).toBeLessThanOrEqual(1);
  expect(x0).toBeLessThan(x1);
  expect(y0).toBeLessThan(y1);
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("WP4 ACLP-AM UAT — hierarchy bundle and studio routes", () => {
  it("emits ontology + workspace hierarchy artifacts and renders workspace/reconciliation/evidence routes", () => {
    const root = makeTempDir();
    const fixture = writeOntologyWriteFixture(root);
    const ontologyDir = join(fixture.stateDir, "ontology");
    mkdirSync(ontologyDir, { recursive: true });

    const { arcs, index } = compileAclpForestFixture();
    writeFileSync(join(ontologyDir, "hierarchies.json"), JSON.stringify(arcs, null, 2), "utf-8");
    writeFileSync(join(ontologyDir, "hierarchy-index.json"), JSON.stringify(index, null, 2), "utf-8");

    // Minimal representative ACLP graph: ids are graphify-native, while
    // registry_record_id carries the raw ACLP join key consumed by the hierarchy
    // sidecar. Includes enough nodes for a deep branch and a reconciliation pair.
    writeFileSync(
      join(fixture.stateDir, "graph.json"),
      JSON.stringify({
        nodes: [
          { id: "registry_processes_AM01", label: "Organiser", node_type: "Process", registry_record_id: "AM01", status: "validated" },
          { id: "registry_processes_AM0104", label: "Tracer", node_type: "Process", registry_record_id: "AM0104", status: "validated" },
          { id: "registry_processes_AM0104_01", label: "Qualifier", node_type: "Process", registry_record_id: "AM0104.01", status: "candidate" },
          { id: "registry_processes_AM0104_01_10", label: "Contrôler", node_type: "Process", registry_record_id: "AM0104.01.10", status: "candidate" },
          { id: "registry_processes_AM0104_01_10_02", label: "Valider", node_type: "Process", registry_record_id: "AM0104.01.10.02", status: "candidate" },
        ],
        links: [
          { source: "registry_processes_AM01", target: "registry_processes_AM0104", relation: "parent_process_of" },
          { source: "registry_processes_AM0104", target: "registry_processes_AM0104_01", relation: "parent_process_of" },
        ],
      }),
      "utf-8",
    );

    const reconciliationDir = join(ontologyDir, "reconciliation");
    mkdirSync(reconciliationDir, { recursive: true });
    writeFileSync(
      join(reconciliationDir, "candidates.json"),
      JSON.stringify({
        schema: "graphify_ontology_reconciliation_candidates_v1",
        graph_hash: "uat-graph",
        profile_hash: "uat-profile",
        generated_at: "2026-06-26T00:00:00.000Z",
        candidate_count: 1,
        candidates: [{
          id: "uat-candidate",
          kind: "entity_match",
          status: "candidate",
          score: 0.9,
          candidate_id: "registry_processes_AM0104_01",
          canonical_id: "registry_processes_AM0104",
          shared_terms: ["process"],
          evidence_refs: ["aclp-am/forest.csv#AM0104.01"],
          reasons: ["representative ACLP-AM hierarchy UAT fixture"],
          proposed_patch_operation: "accept_match",
        }],
      }),
      "utf-8",
    );

    expect(existsSync(join(ontologyDir, "hierarchies.json"))).toBe(true);
    expect(existsSync(join(ontologyDir, "hierarchy-index.json"))).toBe(true);

    const outDir = join(root, "studio-export");
    const result = buildStaticStudio({ stateDir: fixture.stateDir, outDir, spaDir: makeSpaDir(), onWarning: () => {} });
    expect(result.sceneHierarchiesPath).toBe(join(outDir, "scene-hierarchies.json"));
    expect(result.reconciliationCount).toBe(1);

    const sceneHierarchies = JSON.parse(readFileSync(join(outDir, "scene-hierarchies.json"), "utf-8"));
    const tree = sceneHierarchies.hierarchies.am_process_tree;
    expect(sceneHierarchies.schema).toBe("engram_scene_hierarchies_v1");
    expect(tree.nodes_by_id["AM0104.01.10.02"]).toMatchObject({
      parent_id: "AM0104.01.10",
      level: 4,
      registry_record_id: "AM0104.01.10.02",
      status: "reference",
    });

    const manifest = JSON.parse(readFileSync(join(outDir, "workspace-manifest.json"), "utf-8"));
    const byName = new Map(manifest.artifacts.map((artifact: { name: string }) => [artifact.name, artifact]));
    expect(byName.get("scene-hierarchies")).toMatchObject({
      path: "scene-hierarchies.json",
      schema: "graphify_scene_hierarchies_v1",
      present: true,
    });
    expect(byName.get("reconciliation-candidates")).toMatchObject({ present: true });
    expect(byName.get("scene")).toMatchObject({ present: true });

    for (const url of ["/", "/?view=reconciliation&candidate=uat-candidate", "/?view=evidence"]) {
      const response = handleOntologyStudioRequest({ profileStatePath: fixture.profileStatePath }, "GET", url);
      expect(response.status, url).toBe(200);
      expect(response.body, url).toContain('data-tab="workspace"');
      expect(response.body, url).toContain('data-tab="reconciliation"');
      expect(response.body, url).toContain('data-tab="evidence"');
    }
  });

  it("keeps Radar-compatible cited-source refs on Signal and DesignationEvent nodes", () => {
    const sha1 = "1111111111111111111111111111111111111111111111111111111111111111";
    const sha2 = "2222222222222222222222222222222222222222222222222222222222222222";
    const sourceUrl = "https://example.invalid/fixture-ville/pv-2026-04-02.pdf";
    const graph = {
      municipality: "fixture-ville",
      generated_at: "2026-06-26T14:00:00Z",
      ontology_version: "2.3",
      pv_count: 1,
      nodes: [
        {
          id: "source-fixture-ville-pv-2026-04-02",
          type: "Source",
          label: "PV Conseil municipal 2026-04-02 — Fixture Ville",
          properties: {
            docSha: sha1,
            date: "2026-04-02",
            municipality: "fixture-ville",
            sourceKind: "proces-verbal",
            format: "pdf",
            sourceUrl,
            rawRef: `raw/proces-verbaux-fixture-ville/cas/${sha1}.pdf`,
            publishedAt: "2026-04-05",
          },
        },
        {
          id: "signal-fixture-ville-rezonage-zone-h-123",
          type: "Signal",
          label: "Signal : rezonage zone H-123 pour densification",
          properties: {
            municipality: "fixture-ville",
            category: "rezonage",
            kind: "densification",
            date: "2026-04-02",
            meetingDate: "2026-04-02",
            publishedAt: "2026-04-05",
            etape: "avis_motion",
            etape_date: "2026-04-02",
            description: "Avis de motion visant une modification au règlement de zonage pour permettre une densification dans la zone H-123.",
            zone_ref: "H-123",
            reglement_number: "2026-045",
            docSha: sha1,
            sourceUrl,
            rawRef: `raw/proces-verbaux-fixture-ville/cas/${sha1}.pdf`,
            refs: [{
              docSha: sha1,
              rawRef: `raw/proces-verbaux-fixture-ville/cas/${sha1}.pdf`,
              sourceUrl,
              page: 7,
              bbox: [0.12, 0.34, 0.88, 0.41] satisfies [number, number, number, number],
              excerpt: "Avis de motion est donné afin de modifier le règlement de zonage pour la zone H-123 afin de permettre une densification résidentielle.",
              citation: "PV du conseil municipal, 2026-04-02, p. 7",
              publishedAt: "2026-04-05",
              meetingDate: "2026-04-02",
            } satisfies CitedSourceRef],
          },
        },
        {
          id: "event-fixture-ville-second-projet-2026-04-02",
          type: "DesignationEvent",
          label: "Second projet de règlement 2026-045 — zone H-123",
          properties: {
            municipality: "fixture-ville",
            kind: "rezonage",
            decision: "adopté",
            date: "2026-04-02",
            meetingDate: "2026-04-02",
            publishedAt: "2026-04-05",
            etape: "second_projet",
            etape_date: "2026-04-02",
            description: "Adoption du second projet de règlement 2026-045 concernant la zone H-123.",
            zone_ref: "H-123",
            reglement_number: "2026-045",
            docSha: sha2,
            sourceUrl,
            rawRef: `raw/proces-verbaux-fixture-ville/cas/${sha2}.pdf`,
            refs: [{
              docSha: sha2,
              rawRef: `raw/proces-verbaux-fixture-ville/cas/${sha2}.pdf`,
              sourceUrl,
              page: 8,
              excerpt: "Le conseil adopte le second projet de règlement numéro 2026-045 modifiant le zonage applicable à la zone H-123.",
              citation: "PV du conseil municipal, 2026-04-02, p. 8",
              publishedAt: "2026-04-05",
              meetingDate: "2026-04-02",
            } satisfies CitedSourceRef],
          },
        },
      ],
      edges: [
        { source: "signal-fixture-ville-rezonage-zone-h-123", target: "source-fixture-ville-pv-2026-04-02", type: "has_source", refs: [{ docSha: sha1, page: 7 }] },
        { source: "event-fixture-ville-second-projet-2026-04-02", target: "source-fixture-ville-pv-2026-04-02", type: "has_source", refs: [{ docSha: sha2, page: 8 }] },
      ],
    };

    const nodesByType = new Map(graph.nodes.map((node) => [node.type, node]));
    const signal = nodesByType.get("Signal")!;
    const event = nodesByType.get("DesignationEvent")!;

    expect(Array.isArray(signal.properties.refs)).toBe(true);
    expect(Array.isArray(event.properties.refs)).toBe(true);
    expect(signal.properties.refs).toHaveLength(1);
    expect(event.properties.refs).toHaveLength(1);
    expectCitedSourceRef(signal.properties.refs[0]!, { bboxRequired: true });
    expectCitedSourceRef(event.properties.refs[0]!, { bboxRequired: false });

    // Radar reads graph_nodes.props directly: refs must live at properties.refs,
    // not under a second nested properties object, and tests must stay offline.
    expect(signal.properties).not.toHaveProperty("properties.refs");
    expect(event.properties).not.toHaveProperty("properties.refs");
    expect(sourceUrl).toMatch(/^https:\/\/example\.invalid\//);
  });
});
