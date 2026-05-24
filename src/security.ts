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

/**
 * Expand an IPv6 string to its canonical 8-group form so prefix checks can
 * inspect the high bits without parsing every shorthand.
 */
function expandIPv6(addr: string): number[] | null {
  if (!net.isIPv6(addr)) return null;

  // Embedded IPv4 dotted form (e.g. `::ffff:1.2.3.4`): translate the dotted
  // tail into two 16-bit groups before expansion.
  let work = addr;
  const lastColon = work.lastIndexOf(":");
  if (lastColon >= 0 && work.slice(lastColon + 1).includes(".")) {
    const tail = work.slice(lastColon + 1);
    if (!net.isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    work = `${work.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, tail] = work.split("::") as [string, string | undefined];
  const headGroups = head ? head.split(":").filter(Boolean) : [];
  const tailGroups = tail !== undefined ? tail.split(":").filter(Boolean) : [];
  if (tail === undefined && headGroups.length !== 8) return null;

  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;
  const groups = [
    ...headGroups,
    ...Array(missing).fill("0"),
    ...tailGroups,
  ].map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  return groups;
}

/**
 * Unwrap an IPv6 that carries an embedded IPv4 in the low 32 bits to its
 * dotted-decimal form. Recognises:
 *   - RFC 4291 IPv4-mapped IPv6 (`::ffff:0:0/96`)
 *   - RFC 6052 NAT64 Well-Known Prefix (`64:ff9b::/96`)
 *
 * Python's `ipaddress.is_reserved` returns True for the NAT64 prefix so the
 * upstream Python guard (`safishamsi/graphify` commit `9e6192a`) had a
 * false-positive on legitimate public IPv4 traffic routed via NAT64. The TS
 * port mirrors that fix by unwrapping the embedded IPv4 first and running
 * the private-IP test against the embedded address instead of the wrapper.
 */
function embeddedIPv4(addr: string): string | null {
  const groups = expandIPv6(addr);
  if (!groups) return null;

  const isIPv4Mapped =
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
    groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff;
  const isNat64WellKnown =
    groups[0] === 0x64 && groups[1] === 0xff9b &&
    groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0;

  if (!isIPv4Mapped && !isNat64WellKnown) return null;

  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
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
    // RFC 4291 / RFC 6052: defer the verdict to the embedded IPv4 when the
    // wrapper is an IPv4-mapped IPv6 or a NAT64 Well-Known Prefix address.
    // Port of upstream safishamsi/graphify commit `9e6192a`.
    const embedded = embeddedIPv4(addr);
    if (embedded !== null) {
      return isPrivateIp(embedded);
    }
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

  // Node's URL parser keeps the `[...]` brackets around IPv6 hostnames; strip
  // them so `net.isIP` and `isPrivateIp` see the literal address (port of
  // upstream NAT64 fix; precondition for the embedded IPv4 unwrap).
  const literal = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  if (net.isIP(literal)) {
    if (isPrivateIp(literal)) {
      throw new Error(`Blocked private/internal IP ${literal} (resolved from '${hostname}'). Got: ${url}`);
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

// ---------------------------------------------------------------------------
// Metadata sanitisation (recursive, bounded, HTML-safe)
// Port of `graphify.security.sanitize_metadata` from upstream
// safishamsi/graphify commit `b6127aa` (PR #956).
// ---------------------------------------------------------------------------

const METADATA_MAX_VALUE_LEN = 512;
const METADATA_MAX_LIST_ITEMS = 50;

function sanitizeMetadataString(value: unknown): string {
  // String coercion first (matches Python `str(value)` for non-string inputs).
  let text = String(value).replace(CONTROL_CHAR_RE, "");
  text = escapeHtml(text);
  if (text.length > METADATA_MAX_VALUE_LEN) {
    text = text.slice(0, METADATA_MAX_VALUE_LEN);
  }
  return text;
}

function sanitizeMetadataValue(value: unknown): unknown {
  // Order matters: bool is a subclass of int in Python; we mirror by
  // testing booleans first, then numbers, then strings, then collections.
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeMetadataString(value);
  if (Array.isArray(value)) {
    return value.slice(0, METADATA_MAX_LIST_ITEMS).map(sanitizeMetadataValue);
  }
  if (typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }
  return sanitizeMetadataString(value);
}

/**
 * Sanitise a metadata object before export.
 *
 * Metadata is less constrained than node labels: it can contain nested
 * dicts, lists, source snippets, external index symbols, and docstring
 * text. This helper keeps the data JSON-compatible, strips control
 * characters, escapes HTML-sensitive characters in strings, caps long
 * strings (512) and lists (50), and drops entries whose key becomes empty
 * after sanitisation.
 *
 * Defence in depth at the JSON / HTML boundary so future extractors or
 * viewers cannot leak control chars or markup from external indexer output.
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (metadata === null || metadata === undefined) return {};
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    const cleanKey = sanitizeMetadataString(rawKey);
    if (!cleanKey) continue;
    result[cleanKey] = sanitizeMetadataValue(rawValue);
  }
  return result;
}
