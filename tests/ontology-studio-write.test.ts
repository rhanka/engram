import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, Script } from "node:vm";

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

class MockNode {
  protected _textContent = "";

  get textContent(): string {
    return this._textContent;
  }

  set textContent(value: string) {
    this._textContent = value;
  }
}

class MockElement extends MockNode {
  id = "";
  className = "";
  type = "";
  value = "";
  children: MockNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(event: { type: string; target: MockElement; currentTarget: MockElement }) => void>>();

  constructor(readonly tagName: string) {
    super();
  }

  override get textContent(): string {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  override set textContent(value: string) {
    this._textContent = value;
    this.children = [];
  }

  appendChild<T extends MockNode>(child: T): T {
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes: MockNode[]): void {
    this._textContent = "";
    this.children = [...nodes];
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") this.id = value;
  }

  addEventListener(
    type: string,
    handler: (event: { type: string; target: MockElement; currentTarget: MockElement }) => void,
  ): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ type, target: this, currentTarget: this });
    }
  }

  click(): void {
    this.dispatch("click");
  }
}

class MockDocument {
  private readonly elements = new Map<string, MockElement>();

  register(id: string, tagName = "div"): MockElement {
    const element = new MockElement(tagName);
    element.id = id;
    this.elements.set(id, element);
    return element;
  }

  getElementById(id: string): MockElement | null {
    return this.elements.get(id) ?? null;
  }

  createElement(tagName: string): MockElement {
    return new MockElement(tagName);
  }
}

function extractInlineScripts(html: string): { bootstrapScript: string; clientScript: string } {
  const scripts = Array.from(html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g), (match) => match[1] ?? "");
  const bootstrapScript = scripts.find((script) => script.includes("window.__ONTOLOGY_STUDIO_BOOTSTRAP__"));
  const clientScript = scripts.find((script) => script.includes("const bootstrap = window.__ONTOLOGY_STUDIO_BOOTSTRAP__"));
  if (!bootstrapScript || !clientScript) {
    throw new Error("expected bootstrap and client inline scripts in ontology studio shell");
  }
  return { bootstrapScript, clientScript };
}

function registerStudioShellDom(document: MockDocument): Record<string, MockElement> {
  return {
    queue: document.register("candidate-queue"),
    queueStatus: document.register("queue-status"),
    queueCount: document.register("queue-count", "span"),
    queueQuery: document.register("queue-query", "input"),
    queueMinScore: document.register("queue-min-score", "select"),
    queueStatusFilter: document.register("queue-status-filter", "select"),
    queueKindFilter: document.register("queue-kind-filter", "select"),
    queueOperationFilter: document.register("queue-operation-filter", "select"),
    queueSort: document.register("queue-sort", "select"),
    queueOrder: document.register("queue-order", "select"),
    refresh: document.register("refresh-button", "button"),
    selectedTitle: document.register("selected-title"),
    selectedMeta: document.register("selected-meta"),
    selectedSummary: document.register("selected-summary"),
    evidenceBody: document.register("evidence-panel-body"),
    canonicalBody: document.register("canonical-panel-body"),
    graphBody: document.register("graph-panel-body"),
    rebuildBody: document.register("rebuild-panel-body"),
    auditBody: document.register("audit-panel-body"),
    patchPreview: document.register("patch-preview", "pre"),
    patchHint: document.register("patch-mode-copy"),
    patchToken: document.register("patch-token", "input"),
    patchOperation: document.register("patch-operation", "select"),
    patchNote: document.register("patch-note", "input"),
    patchValidate: document.register("patch-validate", "button"),
    patchDryRun: document.register("patch-dry-run", "button"),
    patchApply: document.register("patch-apply", "button"),
    patchResult: document.register("patch-result"),
  };
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
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

  it("serves a reconciliation studio shell that bootstraps the existing read-only APIs", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);

    const response = handleOntologyStudioRequest({ profileStatePath: fixture.profileStatePath }, "GET", "/");

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("Graphify Ontology Studio");
    expect(response.body).toContain("Candidate Queue");
    expect(response.body).toContain("Evidence");
    expect(response.body).toContain("Candidate vs Canonical");
    expect(response.body).toContain("Decision Context");
    expect(response.body).toContain("Patch Preview");
    expect(response.body).toContain("Audit Trail");
    expect(response.body).toContain("window.__ONTOLOGY_STUDIO_BOOTSTRAP__");
    expect(response.body).toContain("/api/ontology/reconciliation/candidates");
    expect(response.body).toContain("/api/ontology/reconciliation/decision-log");
    expect(response.body).toContain("/api/ontology/rebuild-status");
    expect(response.body).toContain("queue-status-filter");
    expect(response.body).toContain("queue-kind-filter");
    expect(response.body).toContain("queue-operation-filter");
    expect(response.body).toContain("queue-sort");
    expect(response.body).toContain("queue-order");
    expect(response.body).toContain("Read-only studio");
    expect(response.body).toContain("Inspection-first browser session");
    expect(response.body).toContain("min-width: 0;");
    expect(response.body).toContain("overflow-wrap: anywhere;");
  });

  it("executes the inline bootstrap script with a minimal DOM and renders reconciliation details", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const html = handleOntologyStudioRequest({ profileStatePath: fixture.profileStatePath }, "GET", "/").body;
    const { bootstrapScript, clientScript } = extractInlineScripts(html);
    const document = new MockDocument();
    const elements = registerStudioShellDom(document);
    const timers = new Map<number, () => void>();
    let nextTimerId = 1;
    const fetchCalls: string[] = [];
    const candidateDetails = {
      "candidate-high": {
        id: "candidate-high",
        kind: "entity_match",
        status: "candidate",
        score: 0.97,
        candidate_id: "character_herlock_sholmes",
        canonical_id: "character_sherlock_holmes",
        shared_terms: ["sherlock holmes"],
        evidence_refs: [
          "corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt#Sherlock Holmes Arrives Too Late",
          "corpus/sherlock-holmes/a-study-in-scarlet/text.txt#part 1",
        ],
        reasons: [
          "same node type: Character",
          "shared normalized term(s): sherlock holmes",
        ],
        proposed_patch_operation: "accept_match",
        candidate_node: {
          id: "character_herlock_sholmes",
          label: "Herlock Sholmes",
          type: "Character",
          status: "candidate",
          aliases: ["Sherlock Holmes parody figure"],
          normalized_terms: ["herlock sholmes", "sherlock holmes parody figure"],
          source_refs: [
            "corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt#Sherlock Holmes Arrives Too Late",
          ],
        },
        canonical_node: {
          id: "character_sherlock_holmes",
          label: "Sherlock Holmes",
          type: "Character",
          status: "validated",
          aliases: ["Mr. Holmes"],
          normalized_terms: ["sherlock holmes", "mr. holmes"],
          source_refs: ["corpus/sherlock-holmes/a-study-in-scarlet/text.txt#part 1"],
        },
      },
      "candidate-low": {
        id: "candidate-low",
        kind: "entity_match",
        status: "candidate",
        score: 0.64,
        candidate_id: "story_sherlock_holmes_too_late",
        canonical_id: "story_scandal_bohemia",
        shared_terms: ["story"],
        evidence_refs: ["corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt#story"],
        reasons: ["story-level review sample"],
        proposed_patch_operation: "accept_match",
        candidate_node: {
          id: "story_sherlock_holmes_too_late",
          label: "Sherlock Holmes Arrives Too Late",
          type: "ChapterOrStory",
          status: "candidate",
          aliases: [],
          normalized_terms: ["sherlock holmes arrives too late"],
          source_refs: ["corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt#story"],
        },
        canonical_node: {
          id: "story_scandal_bohemia",
          label: "A Scandal in Bohemia",
          type: "ChapterOrStory",
          status: "validated",
          aliases: [],
          normalized_terms: ["a scandal in bohemia"],
          source_refs: ["corpus/sherlock-holmes/the-adventures-of-sherlock-holmes/text.txt#story"],
        },
      },
    } as const;

    const fetchStub = async (path: string) => {
      fetchCalls.push(path);
      if (path.startsWith("/api/ontology/reconciliation/candidates?")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              schema: "graphify_ontology_reconciliation_candidates_response_v1",
              generated_at: "2026-05-18T13:00:00.000Z",
              graph_hash: "graph-hash",
              profile_hash: "profile-hash",
              stale: false,
              total: 2,
              limit: 50,
              offset: 0,
              items: [
                {
                  id: "candidate-high",
                  kind: "entity_match",
                  status: "candidate",
                  score: 0.97,
                  candidate_id: "character_herlock_sholmes",
                  canonical_id: "character_sherlock_holmes",
                  shared_terms: ["sherlock holmes"],
                  evidence_refs: [
                    "corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt#Sherlock Holmes Arrives Too Late",
                  ],
                  reasons: ["same node type: Character"],
                  proposed_patch_operation: "accept_match",
                },
                {
                  id: "candidate-low",
                  kind: "entity_match",
                  status: "candidate",
                  score: 0.64,
                  candidate_id: "story_sherlock_holmes_too_late",
                  canonical_id: "story_scandal_bohemia",
                  shared_terms: ["story"],
                  evidence_refs: ["corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt#story"],
                  reasons: ["story-level review sample"],
                  proposed_patch_operation: "accept_match",
                },
              ],
            };
          },
        };
      }

      if (path === "/api/ontology/rebuild-status") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              schema: "graphify_ontology_rebuild_status_v1",
              needs_update: true,
              candidates_match: false,
              decision_log_available: true,
              graph_hash: "graph-hash",
              profile_hash: "profile-hash",
              candidates: {
                path: "ontology/reconciliation/candidates.json",
                generated_at: "2026-05-18T13:00:00.000Z",
                issues: ["candidates graph_hash does not match active graph"],
              },
            };
          },
        };
      }

      if (path.startsWith("/api/ontology/reconciliation/decision-log")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              schema: "graphify_ontology_reconciliation_decision_log_v1",
              total: 2,
              limit: 12,
              offset: 0,
              items: [
                {
                  source: "authoritative",
                  path: "graphify/reconciliation/decisions.jsonl",
                  recorded_at: "2026-05-18T13:05:00.000Z",
                  patch: {
                    id: "patch-001",
                    operation: "accept_match",
                    status: "applied",
                    target: {
                      candidate_id: "character_herlock_sholmes",
                      canonical_id: "character_sherlock_holmes",
                    },
                  },
                },
                {
                  source: "audit",
                  path: ".graphify/ontology/reconciliation/applied-patches.jsonl",
                  recorded_at: "2026-05-18T13:06:00.000Z",
                  patch: {
                    id: "patch-001",
                    operation: "accept_match",
                    status: "applied",
                    target: {
                      candidate_id: "character_herlock_sholmes",
                      canonical_id: "character_sherlock_holmes",
                    },
                  },
                },
              ],
              issues: [],
            };
          },
        };
      }

      const detailId = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
      if (path.startsWith("/api/ontology/reconciliation/candidates/") && detailId in candidateDetails) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return candidateDetails[detailId as keyof typeof candidateDetails];
          },
        };
      }

      throw new Error(`unexpected fetch path: ${path}`);
    };

    const context = createContext({
      console,
      Node: MockNode,
      URLSearchParams,
      encodeURIComponent,
      fetch: fetchStub,
      document,
      window: {
        document,
        fetch: fetchStub,
        setTimeout(callback: () => void) {
          const timerId = nextTimerId++;
          timers.set(timerId, callback);
          return timerId;
        },
        clearTimeout(timerId: number) {
          timers.delete(timerId);
        },
      },
    });

    new Script(bootstrapScript).runInContext(context);
    new Script(clientScript).runInContext(context);
    await flushMicrotasks();

    expect(elements.queue.children).toHaveLength(2);
    expect(elements.selectedTitle.textContent).toContain("Herlock Sholmes -> Sherlock Holmes");
    expect(elements.selectedSummary.textContent).toContain("character_herlock_sholmes");
    expect(elements.selectedSummary.textContent).toContain("character_sherlock_holmes");
    expect(elements.canonicalBody.textContent).toContain("Herlock Sholmes");
    expect(elements.canonicalBody.textContent).toContain("Sherlock Holmes");
    expect(elements.canonicalBody.textContent).toContain("validated");
    expect(elements.graphBody.textContent).toContain("Recent related decisions");
    expect(elements.graphBody.textContent).toContain("candidates graph_hash does not match active graph");
    expect(occurrences(elements.auditBody.textContent, "patch-001")).toBe(1);
    expect(elements.auditBody.textContent).toContain("authoritative");
    expect(elements.auditBody.textContent).toContain("audit");

    (elements.queue.children[1] as MockElement).click();
    await flushMicrotasks();
    expect(elements.selectedTitle.textContent).toContain("Sherlock Holmes Arrives Too Late -> A Scandal in Bohemia");
    expect(elements.patchPreview.textContent).toContain("\"candidate_id\": \"story_sherlock_holmes_too_late\"");

    elements.queueQuery.value = "sherlock";
    elements.queueMinScore.value = "0.75";
    elements.queueStatusFilter.value = "candidate";
    elements.queueKindFilter.value = "entity_match";
    elements.queueOperationFilter.value = "accept_match";
    elements.queueSort.value = "id";
    elements.queueOrder.value = "asc";
    elements.queueStatusFilter.dispatch("change");
    elements.queueKindFilter.dispatch("change");
    elements.queueOperationFilter.dispatch("change");
    elements.queueSort.dispatch("change");
    elements.queueOrder.dispatch("change");
    elements.queueQuery.dispatch("input");
    for (const callback of timers.values()) callback();
    timers.clear();
    await flushMicrotasks();

    expect(fetchCalls.some((path) =>
      path.includes("query=sherlock")
      && path.includes("min_score=0.75")
      && path.includes("status=candidate")
      && path.includes("kind=entity_match")
      && path.includes("operation=accept_match")
      && path.includes("sort=id")
      && path.includes("order=asc"),
    )).toBe(true);
  });

  it("supports validate, dry-run, and apply from the write-enabled browser shell with a pasted token", async () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const token = "deadbeef".repeat(6);
    const html = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token } },
      "GET",
      "/",
    ).body;
    const { bootstrapScript, clientScript } = extractInlineScripts(html);
    const document = new MockDocument();
    const elements = registerStudioShellDom(document);
    const postRequests: Array<{ path: string; authorization?: string; body: Record<string, unknown> }> = [];

    const fetchStub = async (path: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      if (!options || !options.method || options.method === "GET") {
        if (path.startsWith("/api/ontology/reconciliation/candidates?")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            async json() {
              return {
                schema: "graphify_ontology_reconciliation_candidates_response_v1",
                generated_at: "2026-05-18T13:00:00.000Z",
                graph_hash: "graph-hash",
                profile_hash: "profile-hash",
                stale: false,
                total: 1,
                limit: 50,
                offset: 0,
                items: [
                  {
                    id: "candidate-high",
                    kind: "entity_match",
                    status: "candidate",
                    score: 0.97,
                    candidate_id: "character_herlock_sholmes",
                    canonical_id: "character_sherlock_holmes",
                    shared_terms: ["sherlock holmes"],
                    evidence_refs: ["corpus/arsene-lupin/story#1"],
                    reasons: ["same normalized term"],
                    proposed_patch_operation: "accept_match",
                  },
                ],
              };
            },
          };
        }
        if (path === "/api/ontology/rebuild-status") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            async json() {
              return {
                schema: "graphify_ontology_rebuild_status_v1",
                needs_update: false,
                candidates_match: true,
                decision_log_available: true,
                candidates: {
                  path: "ontology/reconciliation/candidates.json",
                  generated_at: "2026-05-18T13:00:00.000Z",
                  issues: [],
                },
              };
            },
          };
        }
        if (path.startsWith("/api/ontology/reconciliation/decision-log")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            async json() {
              return {
                schema: "graphify_ontology_reconciliation_decision_log_v1",
                total: 0,
                limit: 24,
                offset: 0,
                items: [],
                issues: [],
              };
            },
          };
        }
        if (path === "/api/ontology/reconciliation/candidates/candidate-high") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            async json() {
              return {
                id: "candidate-high",
                kind: "entity_match",
                status: "candidate",
                score: 0.97,
                candidate_id: "character_herlock_sholmes",
                canonical_id: "character_sherlock_holmes",
                shared_terms: ["sherlock holmes"],
                evidence_refs: ["corpus/arsene-lupin/story#1"],
                reasons: ["same normalized term"],
                proposed_patch_operation: "accept_match",
                candidate_node: {
                  id: "character_herlock_sholmes",
                  label: "Herlock Sholmes",
                  type: "Character",
                  status: "candidate",
                  aliases: [],
                  normalized_terms: ["herlock sholmes", "sherlock holmes"],
                  source_refs: ["corpus/arsene-lupin/story#1"],
                },
                canonical_node: {
                  id: "character_sherlock_holmes",
                  label: "Sherlock Holmes",
                  type: "Character",
                  status: "validated",
                  aliases: [],
                  normalized_terms: ["sherlock holmes"],
                  source_refs: ["corpus/sherlock/story#1"],
                },
              };
            },
          };
        }
        throw new Error(`unexpected GET path: ${path}`);
      }

      const body = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
      postRequests.push({
        path,
        authorization: options.headers?.authorization,
        body,
      });
      if (path === "/api/ontology/patch/validate") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              schema: "graphify_ontology_patch_validation_v1",
              patch_id: String(body.id),
              valid: true,
              issues: [],
            };
          },
        };
      }
      if (path === "/api/ontology/patch/dry-run") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              schema: "graphify_ontology_patch_apply_v1",
              patch_id: String(body.id),
              valid: true,
              dry_run: true,
              issues: [],
              changed_files: [{ path: ".graphify/ontology/reconciliation/applied-patches.jsonl" }],
            };
          },
        };
      }
      if (path === "/api/ontology/patch/apply") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              schema: "graphify_ontology_patch_apply_v1",
              patch_id: String(body.id),
              valid: true,
              dry_run: false,
              issues: [],
              changed_files: [{ path: "graphify/reconciliation/decisions.jsonl" }],
            };
          },
        };
      }
      throw new Error(`unexpected POST path: ${path}`);
    };

    const context = createContext({
      console,
      Node: MockNode,
      URLSearchParams,
      encodeURIComponent,
      fetch: fetchStub,
      document,
      window: {
        document,
        fetch: fetchStub,
        setTimeout(callback: () => void) {
          callback();
          return 1;
        },
        clearTimeout() {},
      },
    });

    new Script(bootstrapScript).runInContext(context);
    new Script(clientScript).runInContext(context);
    await flushMicrotasks();

    elements.patchToken.value = token;
    elements.patchToken.dispatch("input");
    elements.patchOperation.value = "reject_match";
    elements.patchOperation.dispatch("change");
    elements.patchNote.value = "Analyst rejected this merge";
    elements.patchNote.dispatch("input");
    await flushMicrotasks();
    expect(elements.patchPreview.textContent).toContain("\"operation\": \"reject_match\"");

    elements.patchValidate.click();
    await flushMicrotasks();
    elements.patchDryRun.click();
    await flushMicrotasks();
    elements.patchApply.click();
    await flushMicrotasks();

    expect(postRequests.map((request) => request.path)).toEqual([
      "/api/ontology/patch/validate",
      "/api/ontology/patch/dry-run",
      "/api/ontology/patch/apply",
    ]);
    expect(postRequests.every((request) => request.authorization === `Bearer ${token}`)).toBe(true);
    expect(postRequests.every((request) => request.body.operation === "reject_match")).toBe(true);
    expect(postRequests.every((request) => request.body.reason === "Analyst rejected this merge")).toBe(true);
    expect(postRequests[2]?.body.target).toMatchObject({
      candidate_id: "character_herlock_sholmes",
      canonical_id: "character_sherlock_holmes",
    });
    expect(elements.patchResult.textContent).toContain("apply succeeded");
    expect(elements.patchResult.textContent).toContain("graphify/reconciliation/decisions.jsonl");
  });

  it("write-enabled shell advertises protected patch routes without leaking the bearer token", () => {
    const dir = makeTempDir();
    const fixture = writeOntologyWriteFixture(dir);
    const token = "super-secret-token";

    const response = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath, write: { token } },
      "GET",
      "/",
    );

    expect(response.status).toBe(200);
    expect(response.body).toContain("/api/ontology/patch/validate");
    expect(response.body).toContain("/api/ontology/patch/dry-run");
    expect(response.body).toContain("/api/ontology/patch/apply");
    expect(response.body).toContain("Write API available");
    expect(response.body).not.toContain(token);
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
