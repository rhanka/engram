import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GOOGLE_WORKSPACE_EXTENSIONS,
  createDefaultGoogleWorkspaceFetcher,
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
  const googleEnvKeys = [
    "GRAPHIFY_GOOGLE_WORKSPACE",
    "GOOGLE_OAUTH_ACCESS_TOKEN",
    "GOOGLE_OAUTH_REFRESH_TOKEN",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
  ] as const;
  let previousEnv: Partial<Record<(typeof googleEnvKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    previousEnv = Object.fromEntries(googleEnvKeys.map((key) => [key, process.env[key]]));
    for (const key of googleEnvKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of googleEnvKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

  it("scrubs control characters from frontmatter scalars to prevent YAML injection", async () => {
    const dir = tempDir();
    const stub = makeStub(dir, "weird.gdoc", {
      doc_id: "doc-cr",
      url: "https://docs.google.com/document/d/doc-cr/edit\r\ngoogle_file_id: \"forged\"\u2028tail",
      email: "weird@example.com",
    });
    const fetcher: GoogleWorkspaceFetcher = {
      fetchExport: async () => "body",
    };
    const sidecar = await convertGoogleWorkspaceFile(stub, join(dir, "converted"), { fetcher });
    const rendered = readFileSync(sidecar!, "utf-8");
    // The original control chars must be replaced by spaces; nothing should
    // start a new YAML key by accident.
    expect(rendered.includes("\r")).toBe(false);
    expect(rendered.includes("\u2028")).toBe(false);
    const frontmatter = rendered.split("---\n")[1] ?? "";
    expect(frontmatter.match(/^google_file_id:/gmu)?.length ?? 0).toBe(1);
  });

  it("throws before fetching when no Google OAuth credentials are configured", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response("unexpected fetch");
    };
    const fetcher = createDefaultGoogleWorkspaceFetcher(fetchImpl);

    await expect(fetcher.fetchExport({ fileId: "doc-no-creds", mimeType: "text/markdown" })).rejects.toThrow(
      /Google Workspace export requires a Drive OAuth credential/u,
    );
    expect(calls).toEqual([]);
  });

  it("exchanges refresh credentials and uses the returned bearer token for Drive export", async () => {
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") {
        const body = init?.body as URLSearchParams;
        expect(init?.method).toBe("POST");
        expect(body.get("grant_type")).toBe("refresh_token");
        expect(body.get("refresh_token")).toBe("refresh-token");
        expect(body.get("client_id")).toBe("client-id");
        expect(body.get("client_secret")).toBe("client-secret");
        return new Response(JSON.stringify({ access_token: "fake" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.startsWith("https://www.googleapis.com/drive/v3/files/doc-refresh/export")) {
        expect(init?.method).toBe("GET");
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fake");
        return new Response("exported body", { status: 200 });
      }
      return new Response(`unexpected fetch: ${url}`, { status: 500 });
    };
    const fetcher = createDefaultGoogleWorkspaceFetcher(fetchImpl);

    await expect(fetcher.fetchExport({ fileId: "doc-refresh", mimeType: "text/markdown" })).resolves.toBe(
      "exported body",
    );
    expect(calls.map((call) => call.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://www.googleapis.com/drive/v3/files/doc-refresh/export?mimeType=text%2Fmarkdown",
    ]);
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
