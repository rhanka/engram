import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createOntologyStudioRequestHandler,
  generateOntologyStudioToken,
  handleOntologyStudioRequest,
  startOntologyStudioServer,
} from "../src/ontology-studio.js";

import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-studio-write-"));
  tempDirs.push(dir);
  return dir;
}

function postBody(payload: unknown): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
    },
  };
}

function writeCandidateQueue(fixture: ReturnType<typeof writeOntologyWriteFixture>): void {
  const reconciliationDir = join(fixture.stateDir, "ontology", "reconciliation");
  mkdirSync(reconciliationDir, { recursive: true });
  writeFileSync(
    join(reconciliationDir, "candidates.json"),
    JSON.stringify({
      schema: "graphify_ontology_reconciliation_candidates_v1",
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      generated_at: "2026-05-21T00:00:00.000Z",
      candidate_count: 1,
      candidates: [
        {
          id: "candidate-high",
          kind: "entity_match",
          status: "candidate",
          score: 0.91,
          candidate_id: "candidate-component",
          canonical_id: "component-a",
          shared_terms: ["component"],
          evidence_refs: ["manual.md#p1"],
          reasons: ["same node type: Component"],
          proposed_patch_operation: "accept_match",
        },
      ],
    }, null, 2),
    "utf-8",
  );
  writeFileSync(
    fixture.auditPath,
    JSON.stringify({
      patch: { ...fixture.patch, id: "decision-audit", created_at: "2026-05-21T01:00:00.000Z" },
      applied_at: "2026-05-21T02:00:00.000Z",
    }) + "\n",
    "utf-8",
  );
}

function writeGraphPreview(fixture: ReturnType<typeof writeOntologyWriteFixture>): void {
  writeFileSync(
    join(fixture.stateDir, "graph.json"),
    JSON.stringify({
      nodes: [
        {
          id: "candidate-component",
          label: "Candidate component",
          node_type: "Component",
          status: "candidate",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          source_location: "p1",
          community: 1,
        },
        {
          id: "component-a",
          label: "Component A",
          node_type: "Component",
          status: "validated",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          source_location: "p1",
          community: 1,
        },
      ],
      links: [
        { source: "candidate-component", target: "component-a", relation: "candidate_match", confidence: "EXTRACTED" },
      ],
    }, null, 2),
    "utf-8",
  );
  writeFileSync(join(fixture.stateDir, "graph.html"), "<!doctype html><title>graph</title>", "utf-8");
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("graphify ontology studio --write", () => {
  it("generates a hex token of stable length", () => {
    const token = generateOntologyStudioToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(generateOntologyStudioToken()).not.toBe(token);
  });

  it("renders the G5 workspace shell on the studio root route", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    writeCandidateQueue(fixture);
    writeGraphPreview(fixture);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/?candidate=candidate-high",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/html; charset=utf-8");
    expect(result.body).toContain('data-token-source="fallback"');
    expect(result.body).toContain('id="candidate-list"');
    expect(result.body).toContain('data-candidate-id="candidate-high"');
    expect(result.body).toContain("candidate-component");
    expect(result.body).toContain("Candidate component");
    expect(result.body).toContain("component-a");
    expect(result.body).toContain("Component A");
    expect(result.body).toContain("<dt>Type</dt>");
    expect(result.body).toContain("<dd>Component</dd>");
    expect(result.body).toContain("manual.md#p1");
    expect(result.body).toContain("decision-audit");
    expect(result.body).toContain("Decision basis");
    expect(result.body).not.toContain("Patch preview");
    expect(result.body).not.toContain("&quot;operation&quot;");
    expect(result.body).toContain("<b>Mode:</b> Overview");
    expect(result.body).toContain('title="Graphify graph surface"');
    expect(result.body).toContain(encodeURI(`file://${fixture.stateDir}/graph.html`));
    expect(result.body).toContain('data-ws-live-graph-src="/api/ontology/artifacts/graph.html"');
    expect(result.body).not.toContain("Read-only reconciliation APIs are available");

    const graphArtifact = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token: "unused" } },
      "GET",
      "/api/ontology/artifacts/graph.html",
    );
    expect(graphArtifact.status).toBe(200);
    expect(graphArtifact.body).toContain("<title>graph</title>");
  });

  it("refuses --write when host is not loopback", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    await expect(
      startOntologyStudioServer({
        profileStatePath: fixture.profileStatePath,
        host: "0.0.0.0",
        write: true,
      }),
    ).rejects.toThrow(/loopback/);
  });

  it("starts read-only by default and rejects POST mutation routes with 405", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const started = await startOntologyStudioServer({ profileStatePath: fixture.profileStatePath });
    try {
      expect(started.writeEnabled).toBe(false);
      expect(started.token).toBeUndefined();

      const { body, headers } = postBody(fixture.patch);
      const response = await fetch(`${started.url}/api/ontology/patch/apply`, {
        method: "POST",
        headers,
        body,
      });
      expect(response.status).toBe(405);
      const json = (await response.json()) as { error: string };
      expect(json.error).toContain("--write");
    } finally {
      started.server.close();
    }
  });

  it("requires a bearer token for write routes and never mutates without it", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const started = await startOntologyStudioServer({
      profileStatePath: fixture.profileStatePath,
      write: true,
    });
    try {
      expect(started.writeEnabled).toBe(true);
      expect(started.token).toMatch(/^[0-9a-f]{48}$/);

      const { body, headers } = postBody(fixture.patch);
      const noAuth = await fetch(`${started.url}/api/ontology/patch/apply`, {
        method: "POST",
        headers,
        body,
      });
      expect(noAuth.status).toBe(401);

      const wrongAuth = await fetch(`${started.url}/api/ontology/patch/apply`, {
        method: "POST",
        headers: { ...headers, authorization: "Bearer not-the-token" },
        body,
      });
      expect(wrongAuth.status).toBe(401);

      // No mutation should have happened.
      expect(readFileSync(fixture.decisionsPath, "utf-8")).toBe("");
      expect(existsSync(fixture.auditPath)).toBe(false);
    } finally {
      started.server.close();
    }
  });

  it("supports validate, dry-run and apply with a valid bearer token", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const fixedToken = "deadbeef".repeat(6);
    const started = await startOntologyStudioServer({
      profileStatePath: fixture.profileStatePath,
      write: true,
      token: fixedToken,
    });
    try {
      expect(started.token).toBe(fixedToken);
      const auth = `Bearer ${fixedToken}`;

      // validate
      const { body, headers } = postBody(fixture.patch);
      const validateResponse = await fetch(`${started.url}/api/ontology/patch/validate`, {
        method: "POST",
        headers: { ...headers, authorization: auth },
        body,
      });
      expect(validateResponse.status).toBe(200);
      const validation = (await validateResponse.json()) as { valid: boolean; patch_id: string };
      expect(validation.valid).toBe(true);
      expect(validation.patch_id).toBe(fixture.patch.id);

      // dry-run does not write
      const dryRunResponse = await fetch(`${started.url}/api/ontology/patch/dry-run`, {
        method: "POST",
        headers: { ...headers, authorization: auth },
        body,
      });
      expect(dryRunResponse.status).toBe(200);
      const dryRun = (await dryRunResponse.json()) as {
        valid: boolean;
        dry_run: boolean;
        changed_files: Array<{ kind: string; path: string }>;
      };
      expect(dryRun.valid).toBe(true);
      expect(dryRun.dry_run).toBe(true);
      expect(dryRun.changed_files.map((file) => file.kind)).toEqual([
        "authoritative_decision_log",
        "audit_log",
        "stale_marker",
      ]);
      expect(readFileSync(fixture.decisionsPath, "utf-8")).toBe("");
      expect(existsSync(fixture.auditPath)).toBe(false);

      // apply mutates
      const applyResponse = await fetch(`${started.url}/api/ontology/patch/apply`, {
        method: "POST",
        headers: { ...headers, authorization: auth },
        body,
      });
      expect(applyResponse.status).toBe(200);
      const apply = (await applyResponse.json()) as { valid: boolean; dry_run: boolean };
      expect(apply.valid).toBe(true);
      expect(apply.dry_run).toBe(false);

      const decisionLine = readFileSync(fixture.decisionsPath, "utf-8").trim();
      expect(decisionLine).not.toBe("");
      const decision = JSON.parse(decisionLine) as { id: string; status: string; applied_at: string };
      expect(decision.id).toBe(fixture.patch.id);
      expect(decision.status).toBe("applied");
      expect(decision.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const auditLine = readFileSync(fixture.auditPath, "utf-8").trim();
      const audit = JSON.parse(auditLine) as { id: string };
      expect(audit.id).toBe(fixture.patch.id);

      const stalePath = join(fixture.stateDir, "needs_update");
      expect(statSync(stalePath).isFile()).toBe(true);
    } finally {
      started.server.close();
    }
  });

  it("decision-log replay: GET decision-log returns the applied patch", async () => {
    // End-to-end walk equivalent to scripts/preuat-reconciliation.sh in the
    // public mystery pack, but executed in-process so it runs in CI:
    //   1. apply a patch through POST /api/ontology/patch/apply
    //   2. read it back through GET /api/ontology/reconciliation/decision-log
    //   3. assert both the authoritative and audit log records surface
    //      with the right id, status and operation.
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const fixedToken = "feedface".repeat(6);
    const started = await startOntologyStudioServer({
      profileStatePath: fixture.profileStatePath,
      write: true,
      token: fixedToken,
    });
    try {
      const auth = `Bearer ${fixedToken}`;
      const { body, headers } = postBody(fixture.patch);

      const applyResponse = await fetch(`${started.url}/api/ontology/patch/apply`, {
        method: "POST",
        headers: { ...headers, authorization: auth },
        body,
      });
      expect(applyResponse.status).toBe(200);
      expect(((await applyResponse.json()) as { valid: boolean }).valid).toBe(true);

      const replayResponse = await fetch(
        `${started.url}/api/ontology/reconciliation/decision-log?source=both&status=applied`,
      );
      expect(replayResponse.status).toBe(200);
      const replay = (await replayResponse.json()) as {
        schema: string;
        total: number;
        items: Array<{ source: string; patch: { id: string; operation: string; status?: string } }>;
      };
      expect(replay.schema).toBe("graphify_ontology_reconciliation_decision_log_v1");
      expect(replay.total).toBeGreaterThanOrEqual(1);
      const authoritative = replay.items.find((item) => item.source === "authoritative");
      const audit = replay.items.find((item) => item.source === "audit");
      expect(authoritative).toBeDefined();
      expect(audit).toBeDefined();
      expect(authoritative?.patch.id).toBe(fixture.patch.id);
      expect(authoritative?.patch.operation).toBe(fixture.patch.operation);
      expect(audit?.patch.id).toBe(fixture.patch.id);

      // rebuild-status must flip to needs_update=true after the apply.
      const statusResponse = await fetch(`${started.url}/api/ontology/rebuild-status`);
      expect(statusResponse.status).toBe(200);
      const status = (await statusResponse.json()) as {
        needs_update: boolean;
        decision_log_available: boolean;
      };
      expect(status.needs_update).toBe(true);
      expect(status.decision_log_available).toBe(true);
    } finally {
      started.server.close();
    }
  });

  it("returns 400 on invalid JSON and 413 when the body exceeds 256 KB", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const fixedToken = "cafef00d".repeat(6);
    const started = await startOntologyStudioServer({
      profileStatePath: fixture.profileStatePath,
      write: true,
      token: fixedToken,
    });
    try {
      const auth = `Bearer ${fixedToken}`;

      const invalidJson = await fetch(`${started.url}/api/ontology/patch/validate`, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: "not json",
      });
      expect(invalidJson.status).toBe(400);

      const oversize = "x".repeat(300 * 1024);
      const tooBig = await fetch(`${started.url}/api/ontology/patch/apply`, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: oversize,
      });
      expect(tooBig.status).toBe(413);
    } finally {
      started.server.close();
    }
  });

  it("keeps GET routes working alongside write mode", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const handler = createOntologyStudioRequestHandler({
      profileStatePath: fixture.profileStatePath,
      write: { token: "irrelevant-for-get" },
    });

    // Synthetic IncomingMessage / ServerResponse adapters are heavy; instead exercise
    // the underlying GET path through the actual server.
    const started = await startOntologyStudioServer({
      profileStatePath: fixture.profileStatePath,
      write: true,
      token: "abcd".repeat(12),
    });
    try {
      const response = await fetch(`${started.url}/api/ontology/rebuild-status`);
      expect(response.status).toBe(200);
      const status = (await response.json()) as {
        schema: string;
        needs_update: boolean;
        decision_log_available: boolean;
      };
      expect(status.schema).toBe("graphify_ontology_rebuild_status_v1");
    } finally {
      started.server.close();
    }
    // Handler instance still usable (sanity).
    expect(typeof handler).toBe("function");
  });
});
