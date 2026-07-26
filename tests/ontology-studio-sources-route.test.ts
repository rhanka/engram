/**
 * WP4 — `GET /studio/sources/…` over the wire.
 *
 * The unit tests in studio-sources.test.ts pin the resolver; this one pins the
 * WIRING, because the bug being fixed was entirely a routing bug: the SPA is
 * mounted at `/studio/`, so its `./sources/x.pdf` fetch arrives as
 * `/studio/sources/x.pdf`, reached `serveStudioAsset`, and could only miss.
 *
 * The two facts worth a real socket: a cited PDF comes back as PDF BYTES (not
 * the SPA shell, not a 404), and the ordering holds — `sources/` is consulted
 * before the SPA asset handler, which is the whole fix.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startOntologyStudioServer } from "../src/ontology-studio.js";
import { __resetLiveProvenanceCache } from "../src/studio-sources.js";
import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";

const tempDirs: string[] = [];
const servers: Array<{ close: () => void }> = [];

const CITED_MD_REL = ".graphify/converted/pdf/report_one_abc123.md";
const PDF_BYTES = "%PDF-1.7\nthe original document\n%%EOF\n";

/** A fixture project whose only citation points at an OCR markdown intermediate. */
function makeServedProject(): { root: string; profileStatePath: string; originalRel: string } {
  const root = mkdtempSync(join(tmpdir(), "graphify-sources-route-"));
  tempDirs.push(root);
  const fixture = writeOntologyWriteFixture(root);

  const convertedDir = join(fixture.stateDir, "converted", "pdf");
  mkdirSync(convertedDir, { recursive: true });
  mkdirSync(join(root, "corpus"), { recursive: true });

  // A space in the filename is the common case in a real corpus, and it is what
  // forces the route to URL-decode: the adapter encodes each path segment.
  const originalRel = "corpus/report one.pdf";
  writeFileSync(join(root, originalRel), PDF_BYTES);
  writeFileSync(
    join(convertedDir, "report_one_abc123.md"),
    `---\ngraphify_source_file: ${JSON.stringify(join(root, originalRel))}\ngraphify_conversion: mistral-ocr\n---\n\ntranscript\n`,
  );
  writeFileSync(
    join(fixture.stateDir, "graph.json"),
    JSON.stringify({
      nodes: [{ id: "work_a", citations: [{ source_file: CITED_MD_REL, page: 3 }] }],
      edges: [],
    }),
  );
  return { root, profileStatePath: fixture.profileStatePath, originalRel };
}

async function startServer(profileStatePath: string): Promise<string> {
  const started = await startOntologyStudioServer({ profileStatePath, host: "127.0.0.1" });
  servers.push({ close: () => started.server.close() });
  return started.url;
}

/** Encode a bundle-relative source path the way the SPA's bundleSourcePath does. */
function encodeSourcePath(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  __resetLiveProvenanceCache();
});

describe("GET /studio/sources/", () => {
  it("serves provenance.json under the SPA mount, with the chain resolved", async () => {
    const { profileStatePath, originalRel } = makeServedProject();
    const url = await startServer(profileStatePath);

    const res = await fetch(`${url}/studio/sources/provenance.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const payload = (await res.json()) as {
      schema: string;
      documents: Record<string, { original: string; bundled: boolean; via: string }>;
    };
    expect(payload.schema).toBe("graphify_cited_source_provenance_v1");
    const entry = payload.documents[CITED_MD_REL];
    expect(entry).toBeDefined();
    expect(entry!.original).toBe(originalRel);
    // Live: the corpus is right there, so the original is servable without a copy.
    expect(entry!.bundled).toBe(true);
  });

  it("serves the ORIGINAL pdf bytes, url-encoded path and all", async () => {
    const { profileStatePath, originalRel } = makeServedProject();
    const url = await startServer(profileStatePath);

    const res = await fetch(`${url}/studio/sources/${encodeSourcePath(originalRel)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const text = await res.text();
    expect(text).toBe(PDF_BYTES);
    // The regression this whole route exists to prevent.
    expect(text).not.toContain("<!doctype html");
  });

  it("serves the converted markdown intermediate too", async () => {
    const { profileStatePath } = makeServedProject();
    const url = await startServer(profileStatePath);

    const res = await fetch(`${url}/studio/sources/${encodeSourcePath(CITED_MD_REL)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toContain("transcript");
  });

  it("404s a missing source instead of answering with the SPA shell", async () => {
    const { profileStatePath } = makeServedProject();
    const url = await startServer(profileStatePath);

    const res = await fetch(`${url}/studio/sources/corpus/nope.pdf`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).not.toContain("<html");
  });

  it("refuses traversal out of the roots", async () => {
    const { profileStatePath } = makeServedProject();
    const url = await startServer(profileStatePath);

    const res = await fetch(`${url}/studio/sources/${encodeURIComponent("../../../etc/passwd")}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("root:");
  });

  it("is also reachable at the bare root mount", async () => {
    const { profileStatePath, originalRel } = makeServedProject();
    const url = await startServer(profileStatePath);

    const res = await fetch(`${url}/sources/${encodeSourcePath(originalRel)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("leaves the other studio routes untouched", async () => {
    const { profileStatePath } = makeServedProject();
    const url = await startServer(profileStatePath);

    const graph = await fetch(`${url}/api/ontology/graph.json`);
    expect(graph.status).toBe(200);
    expect((await graph.json()).nodes).toHaveLength(1);
  });
});
