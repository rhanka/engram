/**
 * Optional Google Workspace shortcut export support.
 *
 * Google Drive for desktop stores native Docs/Sheets/Slides as small JSON
 * shortcut files (.gdoc/.gsheet/.gslides). Those files are pointers, not the
 * document content. When `GRAPHIFY_GOOGLE_WORKSPACE=1` is set this module
 * exports them to Markdown sidecars via the Drive v3 REST API so the rest of
 * the Graphify pipeline can extract their actual contents.
 *
 * Mirrors the user-facing contract of upstream Python Graphify (commit
 * f704972, PR #752: `.gdoc/.gsheet/.gslides` shortcut export). Diverges in
 * implementation: upstream shells out to the Go `gws` CLI; this port uses
 * the Drive REST API directly via `fetch` (inspired by entropiq's
 * `google-drive-client.ts`) so there is no external runtime dependency.
 *
 * Auth: a Google OAuth access token is read from `GOOGLE_OAUTH_ACCESS_TOKEN`.
 * If a long-lived refresh token is configured instead (`GOOGLE_OAUTH_REFRESH_TOKEN`
 * plus `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`) the access
 * token is exchanged on demand. No credentials are persisted in `.graphify/`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, basename, join, resolve } from "node:path";

export const GOOGLE_WORKSPACE_EXTENSIONS = new Set([".gdoc", ".gsheet", ".gslides"]);

const GOOGLE_DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const EXPORT_MIME_TYPE_BY_EXTENSION: Record<string, { mime: string; label: string }> = {
  ".gdoc": { mime: "text/markdown", label: "text/markdown" },
  ".gsheet": { mime: "text/csv", label: "text/csv" },
  ".gslides": { mime: "text/plain", label: "text/plain" },
};

export interface GoogleWorkspaceShortcut {
  fileId: string;
  url: string | null;
  resourceKey: string | null;
  account: string | null;
}

export interface GoogleWorkspaceFetcher {
  fetchExport(input: { fileId: string; mimeType: string; resourceKey?: string | null }): Promise<string>;
}

export interface ConvertGoogleWorkspaceOptions {
  fetcher?: GoogleWorkspaceFetcher;
}

export function googleWorkspaceEnabled(value?: string | null): boolean {
  const raw = value ?? process.env.GRAPHIFY_GOOGLE_WORKSPACE ?? "";
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function extractFileIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const idParam = parsed.searchParams.get("id");
  if (idParam) return idParam;
  const match = parsed.pathname.match(/\/(?:document|spreadsheets|presentation|file)\/d\/([^/]+)/);
  return match ? match[1]! : null;
}

function extractResourceKey(url: string | undefined, data: Record<string, unknown>): string | null {
  for (const key of ["resource_key", "resourceKey"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const candidate = parsed.searchParams.get("resourcekey");
    return candidate ?? null;
  } catch {
    return null;
  }
}

export function readGoogleShortcut(path: string): GoogleWorkspaceShortcut {
  const raw = readFileSync(path, "utf-8");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `could not read Google Workspace shortcut ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Google Workspace shortcut ${path} is not a JSON object`);
  }

  const url = typeof data.url === "string" ? data.url : "";
  let fileId =
    (typeof data.doc_id === "string" && data.doc_id) ||
    (typeof data.file_id === "string" && data.file_id) ||
    (typeof data.fileId === "string" && data.fileId) ||
    (typeof data.id === "string" && data.id) ||
    extractFileIdFromUrl(url) ||
    null;

  if (!fileId) {
    const resourceId = typeof data.resource_id === "string" ? data.resource_id : "";
    if (resourceId.includes(":")) {
      fileId = resourceId.split(":", 2)[1] ?? null;
    }
  }
  if (!fileId) {
    throw new Error(`Google Workspace shortcut ${path} does not include a Drive file ID`);
  }

  return {
    fileId: String(fileId),
    url: url.length > 0 ? url : null,
    resourceKey: extractResourceKey(url, data),
    account: typeof data.email === "string" && data.email.trim().length > 0 ? data.email.trim() : null,
  };
}

async function resolveAccessToken(): Promise<string> {
  const direct = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
  if (direct) return direct;

  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!refresh || !clientId || !clientSecret) {
    throw new Error(
      "Google Workspace export requires a Drive OAuth credential. Set GOOGLE_OAUTH_ACCESS_TOKEN, " +
        "or GOOGLE_OAUTH_REFRESH_TOKEN with GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
    );
  }
  const body = new URLSearchParams({
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => `status ${response.status}`);
    throw new Error(`Google OAuth refresh failed: ${message}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const token = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!token) {
    throw new Error("Google OAuth refresh response did not include an access_token");
  }
  return token;
}

export function createDefaultGoogleWorkspaceFetcher(fetchImpl: typeof fetch = fetch): GoogleWorkspaceFetcher {
  return {
    async fetchExport({ fileId, mimeType, resourceKey }) {
      const accessToken = await resolveAccessToken();
      const url = new URL(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}/export`);
      url.searchParams.set("mimeType", mimeType);
      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
      if (resourceKey && resourceKey.trim().length > 0) {
        headers["X-Goog-Drive-Resource-Keys"] = `${fileId}/${resourceKey.trim()}`;
      }
      const response = await fetchImpl(url.toString(), { method: "GET", headers });
      if (!response.ok) {
        const detail = await response.text().catch(() => `status ${response.status}`);
        throw new Error(`Google Drive export failed for ${fileId}: ${detail}`);
      }
      return await response.text();
    },
  };
}

function safeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function sidecarPath(stubPath: string, outDir: string): string {
  const abs = resolve(stubPath);
  const hash = createHash("sha256").update(abs).digest("hex").slice(0, 8);
  const stem = basename(abs).replace(/\.[^.]+$/u, "");
  return join(outDir, `${stem}_${hash}.md`);
}

function frontmatterWrap(input: {
  stubPath: string;
  shortcut: GoogleWorkspaceShortcut;
  body: string;
  exportMime: string;
}): string {
  const lines = [
    "---",
    `source_file: "${safeYamlString(input.stubPath)}"`,
    'source_type: "google_workspace"',
    `google_file_id: "${safeYamlString(input.shortcut.fileId)}"`,
    `google_export_mime_type: "${safeYamlString(input.exportMime)}"`,
    `source_url: "${safeYamlString(input.shortcut.url ?? "")}"`,
  ];
  if (input.shortcut.account) {
    const accountHash = createHash("sha256").update(input.shortcut.account).digest("hex").slice(0, 12);
    lines.push(`google_account_hash: "${accountHash}"`);
  }
  lines.push("---", "");
  lines.push(`<!-- converted from Google Workspace shortcut: ${basename(input.stubPath)} -->`);
  lines.push("");
  lines.push(input.body.trim());
  lines.push("");
  return lines.join("\n");
}

export async function convertGoogleWorkspaceFile(
  stubPath: string,
  outDir: string,
  options: ConvertGoogleWorkspaceOptions = {},
): Promise<string | null> {
  const ext = extname(stubPath).toLowerCase();
  if (!GOOGLE_WORKSPACE_EXTENSIONS.has(ext)) return null;
  const exportMapping = EXPORT_MIME_TYPE_BY_EXTENSION[ext];
  if (!exportMapping) return null;

  const shortcut = readGoogleShortcut(stubPath);
  const fetcher = options.fetcher ?? createDefaultGoogleWorkspaceFetcher();
  const body = await fetcher.fetchExport({
    fileId: shortcut.fileId,
    mimeType: exportMapping.mime,
    resourceKey: shortcut.resourceKey,
  });
  if (!body.trim()) return null;

  mkdirSync(outDir, { recursive: true });
  const outPath = sidecarPath(stubPath, outDir);
  writeFileSync(
    outPath,
    frontmatterWrap({
      stubPath,
      shortcut,
      body,
      exportMime: exportMapping.label,
    }),
    "utf-8",
  );
  return outPath;
}
