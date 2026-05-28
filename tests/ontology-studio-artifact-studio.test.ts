/**
 * Track G G-studio-lot2 — studio serves the graph.html artifact in studio
 * mode when asked. The studio CSS (`body.studio-mode ...`) already ships in
 * every export; the server flips the body class to `studio-mode` when the
 * artifact is requested with `?studio=1`, so the embedded canvas claims the
 * full center and shows only the legend.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";

import { handleRequest } from "../src/ontology-studio.js";
import type { OntologyPatchContext } from "../src/ontology-patch.js";

function fakeRes(): { res: ServerResponse; body: () => string; status: () => number } {
  let body = "";
  let status = 0;
  const res = {
    writeHead(code: number) {
      status = code;
      return res;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
    },
  } as unknown as ServerResponse;
  return { res, body: () => body, status: () => status };
}

function makeContext(stateDir: string): OntologyPatchContext {
  return {
    stateDir,
    profile: { id: "test-profile" },
  } as unknown as OntologyPatchContext;
}

const GRAPH_HTML = '<!DOCTYPE html><html><head></head><body>\n<div id="graph"></div>\n</body></html>';

describe("Track G G-studio-lot2 — studio-mode artifact serving", () => {
  it("injects class=\"studio-mode\" on the body when ?studio=1 is requested", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-studio-artifact-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "graph.html"), GRAPH_HTML, "utf-8");
    const { res, body, status } = fakeRes();
    const req = { url: "/api/ontology/artifacts/graph.html?studio=1", method: "GET" } as IncomingMessage;

    await handleRequest(req, res, makeContext(dir), false);

    expect(status()).toBe(200);
    expect(body()).toMatch(/<body[^>]*class="studio-mode"/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves the artifact untouched without ?studio=1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-studio-artifact-plain-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "graph.html"), GRAPH_HTML, "utf-8");
    const { res, body } = fakeRes();
    const req = { url: "/api/ontology/artifacts/graph.html", method: "GET" } as IncomingMessage;

    await handleRequest(req, res, makeContext(dir), false);

    expect(body()).toBe(GRAPH_HTML);
    expect(body()).not.toContain("studio-mode");
    rmSync(dir, { recursive: true, force: true });
  });
});
