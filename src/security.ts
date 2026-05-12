/**
 * Security helpers - URL validation, safe fetch, path guards, label sanitization.
 */
import { resolve as pathResolve } from "node:path";
import { existsSync } from "node:fs";
import { URL } from "node:url";
import * as dns from "node:dns/promises";
import * as net from "node:net";
import { DEFAULT_GRAPHIFY_STATE_DIR, resolveGraphifyPaths } from "./paths.js";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const MAX_FETCH_BYTES = 52_428_800; // 50 MB
const MAX_TEXT_BYTES = 10_485_760; // 10 MB
const BLOCKED_HOSTS = new Set(["metadata.google.internal", "metadata.google.com"]);
const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Raise if url is not http/https, or targets a private/internal IP.
 * Blocks file://, ftp://, data:, and any other SSRF-prone scheme.
 */
export async function validateUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(
      `Blocked URL scheme '${parsed.protocol}' - only http and https are allowed. Got: ${url}`,
    );
  }

  const hostname = parsed.hostname;
  if (hostname) {
    await validateHostname(hostname, url);
  }

  return url;
}

/** Synchronous URL validation (scheme + hostname only, no DNS). */
export function validateUrlSync(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(
      `Blocked URL scheme '${parsed.protocol}' - only http and https are allowed. Got: ${url}`,
    );
  }

  if (parsed.hostname && BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Blocked cloud metadata endpoint '${parsed.hostname}'. Got: ${url}`);
  }

  return url;
}

function isPrivateIp(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const parts = addr.split(".").map(Number);
    const [a, b] = parts as [number, number, ...number[]];
    // 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x, 0.x.x.x
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase();
    if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
  }
  return false;
}

async function validateHostname(hostname: string, url: string): Promise<void> {
  const normalized = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(normalized)) {
    throw new Error(`Blocked cloud metadata endpoint '${hostname}'. Got: ${url}`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Blocked private/internal IP ${hostname} (resolved from '${hostname}'). Got: ${url}`);
    }
    return;
  }

  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    for (const result of results) {
      if (isPrivateIp(result.address)) {
        throw new Error(
          `Blocked private/internal IP ${result.address} (resolved from '${hostname}'). Got: ${url}`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Blocked")) {
      throw error;
    }
    // DNS resolution failures surface later during fetch.
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

// ---------------------------------------------------------------------------
// Safe fetch
// ---------------------------------------------------------------------------

/**
 * Fetch url and return raw bytes (Buffer).
 * Validates URL, caps response body, follows redirects with re-validation.
 */
export async function safeFetch(
  url: string,
  maxBytes: number = MAX_FETCH_BYTES,
  timeout: number = 30_000,
): Promise<Buffer> {
  let currentUrl = await validateUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const resp = await fetch(currentUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 graphify/1.0" },
        redirect: "manual",
      });

      if (isRedirectStatus(resp.status)) {
        const location = resp.headers.get("location");
        if (!location) {
          throw new Error(`HTTP ${resp.status} redirect from ${currentUrl} without a Location header`);
        }
        if (redirects === MAX_REDIRECTS) {
          throw new Error(`Too many redirects while fetching ${url}`);
        }
        currentUrl = await validateUrl(new URL(location, currentUrl).toString());
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} fetching ${currentUrl}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const chunks: Uint8Array[] = [];
      let total = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          reader.cancel();
          throw new Error(
            `Response from ${currentUrl} exceeds size limit (${Math.floor(maxBytes / 1_048_576)} MB). Aborting download.`,
          );
        }
        chunks.push(value);
      }

      return Buffer.concat(chunks);
    }
    throw new Error(`Too many redirects while fetching ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch url and return decoded text (UTF-8). */
export async function safeFetchText(
  url: string,
  maxBytes: number = MAX_TEXT_BYTES,
  timeout: number = 15_000,
): Promise<string> {
  const raw = await safeFetch(url, maxBytes, timeout);
  return raw.toString("utf-8");
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/**
 * Resolve path and verify it stays inside base (defaults to graphify state dir).
 * Requires the base directory to exist.
 */
export function validateGraphPath(filePath: string, base?: string): string {
  const resolvedBase = base ? pathResolve(base) : resolveGraphifyPaths().stateDir;

  if (!existsSync(resolvedBase)) {
    throw new Error(
      `Graph base directory does not exist: ${resolvedBase}. Run the graphify skill first to build the graph (for Codex: $graphify .).`,
    );
  }

  const resolved = pathResolve(filePath);

  if (!resolved.startsWith(resolvedBase + "/") && resolved !== resolvedBase) {
    throw new Error(
      `Path '${filePath}' escapes the allowed directory ${resolvedBase}. Only paths inside ${DEFAULT_GRAPHIFY_STATE_DIR}/ are permitted.`,
    );
  }

  if (!existsSync(resolved)) {
    throw new Error(`Graph file not found: ${resolved}`);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Label sanitization
// ---------------------------------------------------------------------------

const CONTROL_CHAR_RE = /[\x00-\x1f\x7f\u2028\u2029]/g;
const MAX_LABEL_LEN = 256;

/** Strip control characters and cap length. Safe for JSON embedding. */
export function sanitizeLabel(text: unknown): string {
  if (text == null) {
    return "";
  }
  let cleaned = String(text).replace(CONTROL_CHAR_RE, "");
  if (cleaned.length > MAX_LABEL_LEN) {
    cleaned = cleaned.slice(0, MAX_LABEL_LEN);
  }
  return cleaned;
}

/** Escape text for safe HTML embedding. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
