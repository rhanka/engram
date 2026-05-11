import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GOOGLE_WORKSPACE_EXTENSIONS,
  convertGoogleWorkspaceFile,
  googleWorkspaceEnabled,
  readGoogleShortcut,
  type GoogleWorkspaceFetcher,
} from "../src/google-workspace.js";

function makeStub(dir: string, name: string, payload: Record<string, unknown>): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(payload), "utf-8");
  return path;
}

describe("google-workspace", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env.GRAPHIFY_GOOGLE_WORKSPACE;
  });

  afterEach(() => {
    delete process.env.GRAPHIFY_GOOGLE_WORKSPACE;
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "graphify-gws-"));
    tempDirs.push(dir);
    return dir;
  }

  it("recognises the supported shortcut extensions", () => {
    expect([...GOOGLE_WORKSPACE_EXTENSIONS].sort()).toEqual([".gdoc", ".gsheet", ".gslides"]);
  });

  it("treats the GRAPHIFY_GOOGLE_WORKSPACE env var as an opt-in toggle", () => {
    expect(googleWorkspaceEnabled("")).toBe(false);
    expect(googleWorkspaceEnabled("0")).toBe(false);
    expect(googleWorkspaceEnabled("no")).toBe(false);
    expect(googleWorkspaceEnabled("1")).toBe(true);
    expect(googleWorkspaceEnabled("true")).toBe(true);
    expect(googleWorkspaceEnabled("yes")).toBe(true);
    expect(googleWorkspaceEnabled("ON")).toBe(true);
  });

  it("reads file id, url, resource key and account from a .gdoc stub", () => {
    const dir = tempDir();
    const stub = makeStub(dir, "notes.gdoc", {
      doc_id: "abc123",
      url: "https://docs.google.com/document/d/abc123/edit?usp=drive_web&resourcekey=rk-9",
      email: "user@example.com",
    });
    const shortcut = readGoogleShortcut(stub);
    expect(shortcut.fileId).toBe("abc123");
    expect(shortcut.url).toContain("/document/d/abc123");
    expect(shortcut.resourceKey).toBe("rk-9");
    expect(shortcut.account).toBe("user@example.com");
  });

  it("extracts the file id from the URL when no explicit id field exists", () => {
    const dir = tempDir();
    const stub = makeStub(dir, "report.gsheet", {
      url: "https://docs.google.com/spreadsheets/d/sheet-xyz/edit",
    });
    expect(readGoogleShortcut(stub).fileId).toBe("sheet-xyz");
  });

  it("falls back to resource_id when no other id field is present", () => {
    const dir = tempDir();
    const stub = makeStub(dir, "deck.gslides", {
      resource_id: "presentation:deck-987",
    });
    expect(readGoogleShortcut(stub).fileId).toBe("deck-987");
  });

  it("throws a clear error when no file id can be derived", () => {
    const dir = tempDir();
    const stub = makeStub(dir, "broken.gdoc", { foo: "bar" });
    expect(() => readGoogleShortcut(stub)).toThrow(/does not include a Drive file ID/u);
  });

  it("writes a sidecar with frontmatter and the exported body", async () => {
    const dir = tempDir();
    const stub = makeStub(dir, "spec.gdoc", {
      doc_id: "doc-1",
      url: "https://docs.google.com/document/d/doc-1/edit",
      email: "owner@example.com",
    });
    const fetcher: GoogleWorkspaceFetcher = {
      fetchExport: async ({ fileId, mimeType }) => {
        expect(fileId).toBe("doc-1");
        expect(mimeType).toBe("text/markdown");
        return "# Hello\n\nSome body text.\n";
      },
    };
    const sidecar = await convertGoogleWorkspaceFile(stub, join(dir, "converted"), { fetcher });
    expect(sidecar).not.toBeNull();
    const rendered = readFileSync(sidecar!, "utf-8");
    expect(rendered).toContain('source_type: "google_workspace"');
    expect(rendered).toContain('google_file_id: "doc-1"');
    expect(rendered).toContain('google_export_mime_type: "text/markdown"');
    expect(rendered).toMatch(/google_account_hash: "[0-9a-f]{12}"/u);
    expect(rendered).not.toContain("owner@example.com");
    expect(rendered).toContain("# Hello");
  });

  it("returns null when the exported body is empty", async () => {
    const dir = tempDir();
    const stub = makeStub(dir, "empty.gdoc", { doc_id: "doc-empty" });
    const fetcher: GoogleWorkspaceFetcher = {
      fetchExport: async () => "   \n",
    };
    const sidecar = await convertGoogleWorkspaceFile(stub, join(dir, "converted"), { fetcher });
    expect(sidecar).toBeNull();
  });

  it("uses CSV mime type for .gsheet stubs", async () => {
    const dir = tempDir();
    const stub = makeStub(dir, "data.gsheet", { doc_id: "sheet-1" });
    let observed = "";
    const fetcher: GoogleWorkspaceFetcher = {
      fetchExport: async ({ mimeType }) => {
        observed = mimeType;
        return "a,b\n1,2\n";
      },
    };
    await convertGoogleWorkspaceFile(stub, join(dir, "converted"), { fetcher });
    expect(observed).toBe("text/csv");
  });

  it("uses plain text mime type for .gslides stubs", async () => {
    const dir = tempDir();
    const stub = makeStub(dir, "deck.gslides", { doc_id: "deck-1" });
    let observed = "";
    const fetcher: GoogleWorkspaceFetcher = {
      fetchExport: async ({ mimeType }) => {
        observed = mimeType;
        return "slide one\nslide two\n";
      },
    };
    await convertGoogleWorkspaceFile(stub, join(dir, "converted"), { fetcher });
    expect(observed).toBe("text/plain");
  });

  it("propagates the resource key into the fetch call when present", async () => {
    const dir = tempDir();
    const stub = makeStub(dir, "linked.gdoc", {
      doc_id: "doc-2",
      resourceKey: "rk-42",
    });
    let observedResourceKey: string | null | undefined = undefined;
    const fetcher: GoogleWorkspaceFetcher = {
      fetchExport: async ({ resourceKey }) => {
        observedResourceKey = resourceKey;
        return "body";
      },
    };
    await convertGoogleWorkspaceFile(stub, join(dir, "converted"), { fetcher });
    expect(observedResourceKey).toBe("rk-42");
  });
});
