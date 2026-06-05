/**
 * Resource caps for parsing untrusted office/PDF files (Track F-0831-P1, F2).
 *
 * A corpus is attacker-controllable (graphify runs on cloned/shared folders),
 * and .docx/.xlsx are zip+XML containers: a few-KB zip-bomb can decompress to
 * gigabytes and OOM-kill the process at parse time. We screen every office/PDF
 * file before officeparser / unpdf touch it.
 *
 * Two layers for zip-based office files, because the zip central-directory
 * sizes are attacker-controlled:
 *   1. A cheap pre-filter on the declared sizes (on-disk cap, summed-uncompressed
 *      cap, compression ratio) that rejects an honest bomb without decompressing.
 *   2. An authoritative pass that inflates every member with a hard byte ceiling
 *      (`zlib.inflateRawSync({ maxOutputLength })`), so a member that
 *      under-declares its size in the central directory cannot expand past the
 *      cap undetected.
 *
 * Port of upstream safishamsi/graphify commits c50ffc2 + 763b673 (Python
 * `_file_within_size_cap` / `_zip_within_caps` in graphify/detect.py). The
 * Python uses zipfile's chunked streaming read; Node's zlib gives the same
 * hard ceiling via `maxOutputLength`.
 */
import { statSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export const OFFICE_MAX_RAW_BYTES = 50 * 1024 * 1024; // 50 MiB on-disk
export const OFFICE_MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024; // 512 MiB total uncompressed
export const OFFICE_MAX_COMPRESSION_RATIO = 200; // uncompressed : compressed

/** True if `path` exists and its on-disk size is within `cap`. */
export function fileWithinSizeCap(path: string, cap: number = OFFICE_MAX_RAW_BYTES): boolean {
  try {
    return statSync(path).size <= cap;
  } catch {
    return false;
  }
}

// --- Minimal ZIP central-directory parser (PKZIP APPNOTE) -------------------
// We only read the central directory, never trusting the local file headers.
// Each central-directory entry record starts with the signature 0x02014b50 and
// stores the compression method, compressed size, uncompressed size and the
// local-header offset we need to locate the deflate stream.

const EOCD_SIGNATURE = 0x06054b50;
const CDH_SIGNATURE = 0x02014b50;
const LFH_SIGNATURE = 0x04034b50;
const MAX_EOCD_COMMENT = 0xffff;

interface CentralEntry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEocdOffset(buf: Buffer): number {
  // The End Of Central Directory record lives at the tail, possibly followed by
  // a comment of up to 0xffff bytes. Scan backwards for its signature.
  const minOffset = Math.max(0, buf.length - (MAX_EOCD_COMMENT + 22));
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function parseCentralDirectory(buf: Buffer): CentralEntry[] | null {
  const eocd = findEocdOffset(buf);
  if (eocd < 0) return null;
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: CentralEntry[] = [];
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CDH_SIGNATURE) return null;
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    entries.push({ method, compressedSize, uncompressedSize, localHeaderOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Locate the start of a member's compressed data from its local file header. */
function memberDataRange(buf: Buffer, entry: CentralEntry): { start: number; end: number } | null {
  const lfh = entry.localHeaderOffset;
  if (lfh + 30 > buf.length || buf.readUInt32LE(lfh) !== LFH_SIGNATURE) return null;
  const nameLen = buf.readUInt16LE(lfh + 26);
  const extraLen = buf.readUInt16LE(lfh + 28);
  const start = lfh + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > buf.length) return null;
  return { start, end };
}

/**
 * Reject a zip-based office file that is a likely zip/XML bomb.
 *
 * Returns true only when the file is safe to hand to a parser. On any parse
 * error, oversize, or ratio breach it returns false so the caller treats the
 * file as empty rather than decompressing it.
 */
export function zipWithinCaps(path: string): boolean {
  if (!fileWithinSizeCap(path)) return false;
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return false;
  }
  const entries = parseCentralDirectory(buf);
  if (entries === null) return false;

  // Layer 1: cheap pre-filter on declared sizes (fast reject for honest bombs).
  let compressed = 0;
  let declared = 0;
  for (const e of entries) {
    compressed += e.compressedSize;
    declared += e.uncompressedSize;
  }
  compressed = compressed || 1;
  if (declared > OFFICE_MAX_DECOMPRESSED_BYTES) return false;
  if (declared / compressed > OFFICE_MAX_COMPRESSION_RATIO) return false;

  // Layer 2: authoritative bounded decompression. The declared sizes above are
  // attacker-controlled, so actually inflate every deflated member with a hard
  // ceiling; a member that under-declares its size cannot expand past the cap.
  let total = 0;
  for (const e of entries) {
    const range = memberDataRange(buf, e);
    if (range === null) return false;
    if (e.method === 0) {
      // Stored (uncompressed): the on-disk bytes are the output bytes.
      total += range.end - range.start;
    } else if (e.method === 8) {
      // Deflate: inflate with a ceiling so a runaway member throws instead of
      // materializing gigabytes.
      const remaining = OFFICE_MAX_DECOMPRESSED_BYTES - total;
      if (remaining <= 0) return false;
      try {
        const out = inflateRawSync(buf.subarray(range.start, range.end), {
          maxOutputLength: remaining + 1,
        });
        total += out.length;
      } catch {
        // ERR_BUFFER_TOO_LARGE (cap breach) or corrupt stream: refuse.
        return false;
      }
    } else {
      // Unknown compression method: refuse rather than guess.
      return false;
    }
    if (total > OFFICE_MAX_DECOMPRESSED_BYTES) return false;
  }
  return true;
}
